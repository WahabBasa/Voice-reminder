import { NativeModules, Platform } from "react-native";
import {
  deleteAsync,
  documentDirectory,
  downloadAsync,
  getInfoAsync,
} from "expo-file-system/legacy";

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

/** Documents-scoped staging path — the only place expo-file-system may write. */
export function getAlarmSoundStagingPath(reminderId: string): string | null {
  if (Platform.OS !== "ios") return null;
  if (!documentDirectory) return null;
  return `${documentDirectory}alarm_staging_${sanitizeId(reminderId)}.wav`;
}

// Files already copied into Library/Sounds this session — skips repeat
// download+copy work when hydration and scheduling both ask for the sound.
const placedThisSession = new Set<string>();

function alarmKitBridge(): { placeAlarmSound?: Function; removeAlarmSound?: Function } | null {
  const bridge = NativeModules.AlarmKitBridge;
  return bridge || null;
}

/**
 * Place the reminder's spoken line in Library/Sounds as an alarm-ready wav and
 * return the bare filename for `AlarmKitBridge.scheduleAlarm({ soundName })`.
 * Returns null on Android, without a wav url, without the native bridge, or on
 * any failure — the caller then schedules with the system default alarm sound.
 */
export async function ensureAlarmSound(
  reminderId: string,
  wavUrl: string | null | undefined
): Promise<string | null> {
  if (Platform.OS !== "ios") return null;
  if (!wavUrl) return null;

  const fileName = getAlarmSoundFileName(reminderId);
  if (placedThisSession.has(fileName)) return fileName;

  const bridge = alarmKitBridge();
  if (!bridge || typeof bridge.placeAlarmSound !== "function") return null;

  const stagingPath = getAlarmSoundStagingPath(reminderId);
  if (!stagingPath) return null;

  try {
    await downloadAsync(wavUrl, stagingPath);
    const staged = await getInfoAsync(stagingPath);
    if (!staged.exists || !staged.size) {
      console.log(`[VR] Alarm sound download produced no file for ${reminderId}`);
      return null;
    }

    await bridge.placeAlarmSound(stagingPath, fileName);
    placedThisSession.add(fileName);
    console.log(`[VR] Alarm sound placed: ${fileName} (${staged.size} bytes)`);
    return fileName;
  } catch (e) {
    console.log(`[VR] Failed to place alarm sound for ${reminderId}:`, e);
    return null;
  } finally {
    try {
      await deleteAsync(stagingPath, { idempotent: true });
    } catch {
      // best-effort staging cleanup
    }
  }
}

/** Drop a reminder's alarm sound (deletion / re-record flows). No-op off iOS. */
export async function removeAlarmSound(reminderId: string): Promise<void> {
  if (Platform.OS !== "ios") return;

  const fileName = getAlarmSoundFileName(reminderId);
  placedThisSession.delete(fileName);

  const bridge = alarmKitBridge();
  if (!bridge || typeof bridge.removeAlarmSound !== "function") return;
  try {
    await bridge.removeAlarmSound(fileName);
  } catch (e) {
    console.log(`[VR] Failed to delete alarm sound for ${reminderId}:`, e);
  }
}
