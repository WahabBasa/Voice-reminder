import { NativeModules, Platform } from "react-native";
import {
  deleteAsync,
  documentDirectory,
  downloadAsync,
  EncodingType,
  getInfoAsync,
  readAsStringAsync,
  writeAsStringAsync,
} from "expo-file-system/legacy";
import { base64ToBytes, bytesToBase64, shapeSpeakTwiceWav } from "./alarmWavCadence";
/**
 * iOS AlarmKit sound placement (AK-3).
 *
 * AlarmKit resolves an alarm's sound by bare filename inside the app's
 * `Library/Sounds` directory (same rule as UNNotificationSound): wav/aiff/caf,
 * <= 30s. expo-file-system only writes inside its scoped directories (Documents,
 * Caches) — device-verified: makeDirectoryAsync on Library/Sounds is refused.
 * So the wav is staged into Documents and the AlarmKitBridge native method
 * copies it into Library/Sounds via FileManager.
 *
 * There is ONE spoken take per reminder (OLD-108), placed as one of two files
 * picked by its "keeps ringing" switch: the server wav as-is (AlarmKit loops it)
 * or a speak-twice copy (`reminder_<id>_twice.wav`). The cadence ladder
 * used to stage one wav per rung above the base — `reminder_<id>_v<k>.wav`,
 * holding replay variant k-1 — but the nag repeats the base line now, so
 * nothing places those files any longer. `removeAlarmSound` still sweeps them
 * by name, because installs that rang before the strip have them sitting in
 * Library/Sounds and nothing else would ever take them out.
 *
 * Everything here is a no-op off iOS — Android keeps its mp3 + notifee path
 * untouched — and nothing throws: a missing alarm sound must degrade to the
 * system default, never block scheduling.
 */

// Convex/local ids are already filename-safe, but a stray character would
// produce an unreachable path that AlarmKit reports only as silence.
function sanitizeId(reminderId: string): string {
  return String(reminderId).replace(/[^A-Za-z0-9_-]/g, "_");
}

/** Bare filename handed to the native `soundName` contract field. */
export function getAlarmSoundFileName(reminderId: string): string {
  return `reminder_${sanitizeId(reminderId)}.wav`;
}

/**
 * Bare filename of the speak-twice copy a reminder rings with when its "keeps
 * ringing" switch is off (lib/alarmWavCadence.ts). A separate name, so flipping
 * the switch re-schedules onto the other file instead of overwriting a sound a
 * registered alarm still points at.
 */
export function getSpeakTwiceAlarmSoundFileName(reminderId: string): string {
  return `reminder_${sanitizeId(reminderId)}_twice.wav`;
}

/**
 * Rungs the retired cadence ladder could have staged (OLD-108). Only
 * `removeAlarmSound` reads this, to sweep files left behind by an install that
 * rang before the strip.
 */
const LEGACY_LADDER_RUNGS = 3;

/** Bare filename a retired ladder rung was placed under. Cleanup only. */
function legacyVariantAlarmSoundFileName(reminderId: string, rung: number): string {
  return `reminder_${sanitizeId(reminderId)}_v${rung}.wav`;
}

/** Documents-scoped staging path — the only place expo-file-system may write. */
export function getAlarmSoundStagingPath(
  reminderId: string,
  variant: "loop" | "twice" = "loop"
): string | null {
  if (Platform.OS !== "ios") return null;
  if (!documentDirectory) return null;
  const suffix = variant === "twice" ? "_twice" : "";
  return `${documentDirectory}alarm_staging_${sanitizeId(reminderId)}${suffix}.wav`;
}

/**
 * Rewrite a staged server wav in place as its speak-twice copy. A wav that
 * cannot be shaped stays as it is (it loops, the way it always did) — a
 * reminder must never lose its voice over the cadence.
 */
async function reshapeStagedAsSpeakTwice(stagingPath: string, label: string): Promise<void> {
  try {
    const original = base64ToBytes(
      await readAsStringAsync(stagingPath, { encoding: EncodingType.Base64 })
    );
    const shaped = shapeSpeakTwiceWav(original);
    if (!shaped) {
      console.log(`[VR] Speak-twice shaping skipped for ${label}; the looping wav stays`);
      return;
    }
    await writeAsStringAsync(stagingPath, bytesToBase64(shaped), {
      encoding: EncodingType.Base64,
    });
  } catch (e) {
    console.log(`[VR] Speak-twice shaping failed for ${label}; the looping wav stays:`, e);
  }
}

// Files already copied into Library/Sounds this session — skips repeat
// download+copy work when hydration and scheduling both ask for the sound.
const placedThisSession = new Set<string>();

function alarmKitBridge(): { placeAlarmSound?: Function; removeAlarmSound?: Function } | null {
  const bridge = NativeModules.AlarmKitBridge;
  return bridge || null;
}

/**
 * Download `wavUrl` and hand it to the native bridge under `fileName`.
 * Returns the bare filename, or null when anything at all went wrong.
 */
async function placeAlarmSoundFile(
  fileName: string,
  stagingPath: string | null,
  wavUrl: string | null | undefined,
  label: string,
  speakTwice = false
): Promise<string | null> {
  if (Platform.OS !== "ios") return null;
  if (!wavUrl) return null;
  if (placedThisSession.has(fileName)) return fileName;

  const bridge = alarmKitBridge();
  if (!bridge || typeof bridge.placeAlarmSound !== "function") return null;
  if (!stagingPath) return null;

  try {
    await downloadAsync(wavUrl, stagingPath);
    const staged = await getInfoAsync(stagingPath);
    if (!staged.exists || !staged.size) {
      console.log(`[VR] Alarm sound download produced no file for ${label}`);
      return null;
    }

    if (speakTwice) await reshapeStagedAsSpeakTwice(stagingPath, label);
    await bridge.placeAlarmSound(stagingPath, fileName);
    placedThisSession.add(fileName);
    console.log(`[VR] Alarm sound placed: ${fileName} (${staged.size} bytes)`);
    return fileName;
  } catch (e) {
    console.log(`[VR] Failed to place alarm sound for ${label}:`, e);
    return null;
  } finally {
    try {
      await deleteAsync(stagingPath, { idempotent: true });
    } catch {
      // best-effort staging cleanup
    }
  }
}

/**
 * Place the reminder's spoken line in Library/Sounds as an alarm-ready wav and
 * return the bare filename for `AlarmKitBridge.scheduleAlarm({ soundName })`.
 * Returns null on Android, without a wav url, without the native bridge, or on
 * any failure — the caller then schedules with the system default alarm sound.
 *
 * `persistent` is the reminder's "keeps ringing" switch. On (and when the
 * caller does not say) the server wav goes in as it is: AlarmKit loops it, so
 * the line keeps coming until the user answers. Off places the speak-twice copy
 * under its own name instead.
 */
export async function ensureAlarmSound(
  reminderId: string,
  wavUrl: string | null | undefined,
  options?: { persistent?: boolean }
): Promise<string | null> {
  if (options?.persistent === false) {
    return placeAlarmSoundFile(
      getSpeakTwiceAlarmSoundFileName(reminderId),
      getAlarmSoundStagingPath(reminderId, "twice"),
      wavUrl,
      reminderId,
      true
    );
  }
  return placeAlarmSoundFile(
    getAlarmSoundFileName(reminderId),
    getAlarmSoundStagingPath(reminderId),
    wavUrl,
    reminderId
  );
}

/**
 * Drop a reminder's alarm sounds — its wav and its speak-twice copy, plus any retired ladder rung
 * wav an older build left in Library/Sounds (deletion / re-record flows).
 * No-op off iOS.
 */
export async function removeAlarmSound(reminderId: string): Promise<void> {
  if (Platform.OS !== "ios") return;

  const fileNames = [
    getAlarmSoundFileName(reminderId),
    getSpeakTwiceAlarmSoundFileName(reminderId),
  ];
  for (let rung = 1; rung <= LEGACY_LADDER_RUNGS; rung++) {
    fileNames.push(legacyVariantAlarmSoundFileName(reminderId, rung));
  }
  for (const fileName of fileNames) {
    placedThisSession.delete(fileName);
  }

  const bridge = alarmKitBridge();
  if (!bridge || typeof bridge.removeAlarmSound !== "function") return;
  for (const fileName of fileNames) {
    try {
      await bridge.removeAlarmSound(fileName);
    } catch (e) {
      console.log(`[VR] Failed to delete alarm sound ${fileName}:`, e);
    }
  }
}
