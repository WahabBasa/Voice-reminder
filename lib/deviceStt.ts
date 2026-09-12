/**
 * On-device speech-to-text config + orchestration (spec §1, §3).
 *
 * Pure and dependency-injected so the whole decision — resolve a locale, race
 * the native transcription against a timeout, ignore a late resolve, fall back
 * to the cloud — is unit-testable without the native module or the screen. The
 * native contract itself lives in ./vrSpeech (frozen); everything here calls it
 * through injected deps.
 */
import { NativeModules, Platform } from "react-native";
import {
  speechCancel,
  speechStatus,
  speechTranscribeFile,
  type SpeechEngine,
  type SpeechStatus,
  type SpeechTranscript,
} from "./vrSpeech";

export type VoiceLanguageSetting = "auto" | "en" | "ar";

/** The engine + timeout the env asks for, read once at load like perf.ts's flags. */
const ENV_ENGINE = process.env.EXPO_PUBLIC_VR_STT_ENGINE;
export const DEFAULT_STT_ENGINE: SpeechEngine =
  ENV_ENGINE === "transcriber" ? "transcriber" : "dictation";

const ENV_TIMEOUT = Number(process.env.EXPO_PUBLIC_VR_STT_TIMEOUT_MS);
export const DEFAULT_STT_TIMEOUT_MS =
  Number.isFinite(ENV_TIMEOUT) && ENV_TIMEOUT > 0 ? ENV_TIMEOUT : 4000;

/**
 * The locale the on-device engine should be asked for.
 *
 * `auto` walks the device's ordered preferred languages and takes the first one
 * whose language is English or Arabic, mapping it to the canonical locale the
 * engine installs assets for. Nothing matches (a device set to French, say) →
 * English, because the cloud fallback covers everything else anyway.
 */
export function resolveVoiceLocale(
  setting: VoiceLanguageSetting,
  deviceLocales: readonly string[] | undefined
): string {
  if (setting === "en") return "en-US";
  if (setting === "ar") return "ar-SA";

  for (const raw of deviceLocales ?? []) {
    if (typeof raw !== "string") continue;
    const lang = raw.slice(0, 2).toLowerCase();
    if (lang === "en") return "en-US";
    if (lang === "ar") return "ar-SA";
  }
  return "en-US";
}

/**
 * The device's ordered preferred languages, best-effort. iOS exposes the real
 * ordered list through SettingsManager; the Intl locale is the cross-platform
 * backstop. No expo-localization dependency to pull in for two strings.
 */
export function getDeviceLocales(): string[] {
  const out: string[] = [];
  try {
    if (Platform.OS === "ios") {
      const langs = (NativeModules as any)?.SettingsManager?.settings?.AppleLanguages;
      if (Array.isArray(langs)) {
        for (const l of langs) if (typeof l === "string") out.push(l);
      }
    }
  } catch {
    // A device without the settings module falls through to Intl.
  }
  try {
    const loc = Intl.DateTimeFormat().resolvedOptions().locale;
    if (typeof loc === "string" && loc) out.push(loc);
  } catch {
    // An engine without resolvable options leaves the list as-is.
  }
  return out;
}

/** The native calls runDeviceStt needs, injected so the race is testable. */
export type DeviceSttDeps = {
  speechStatus: (localeId: string, engine: SpeechEngine) => Promise<SpeechStatus>;
  speechTranscribeFile: (
    fileUri: string,
    localeId: string,
    engine: SpeechEngine,
    requestId: string
  ) => Promise<SpeechTranscript>;
  speechCancel: (requestId: string) => Promise<void>;
};

/** The real module, for the wiring in app/index.tsx. */
export const defaultDeviceSttDeps: DeviceSttDeps = {
  speechStatus,
  speechTranscribeFile,
  speechCancel,
};

export type DeviceSttSuccess = {
  ok: true;
  text: string;
  ms: number;
  engine: SpeechEngine;
  locale: string;
};

/**
 * Why a device attempt did not produce a transcript. `not_ready` means the
 * locale's assets are not installed yet (we never block on a download here);
 * `timeout` and `empty` are ours; every other reason is the native reject code
 * verbatim ("cancelled" | "unsupported" | "assets_missing" | "io" |
 * "analysis_failed"), or "error" for a reject without one.
 */
export type DeviceSttFailure = { ok: false; reason: string };

export type DeviceSttResult = DeviceSttSuccess | DeviceSttFailure;

/**
 * Try to transcribe a finished recording on-device.
 *
 * Never waits on an asset download: an engine that is not `installed` fails
 * fast as `not_ready` so the cloud path takes over immediately. The native
 * call is raced against `timeoutMs`; on timeout the request is cancelled and a
 * transcript that resolves afterwards is dropped on the floor (the `settled`
 * latch), because by then the cloud path already owns the take.
 */
export async function runDeviceStt(
  deps: DeviceSttDeps,
  params: {
    fileUri: string;
    localeId: string;
    engine: SpeechEngine;
    timeoutMs: number;
    requestId: string;
  }
): Promise<DeviceSttResult> {
  const { fileUri, localeId, engine, timeoutMs, requestId } = params;

  let status: SpeechStatus;
  try {
    status = await deps.speechStatus(localeId, engine);
  } catch (e: any) {
    return { ok: false, reason: e?.code ?? "error" };
  }
  if (!status.installed) return { ok: false, reason: "not_ready" };

  return await new Promise<DeviceSttResult>((resolve) => {
    let settled = false;

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      void deps.speechCancel(requestId).catch(() => {});
      resolve({ ok: false, reason: "timeout" });
    }, timeoutMs);

    deps.speechTranscribeFile(fileUri, localeId, engine, requestId).then(
      (transcript) => {
        if (settled) return; // a late resolve after the timeout is ignored
        settled = true;
        clearTimeout(timer);
        const text = (transcript.text ?? "").trim();
        if (!text) {
          resolve({ ok: false, reason: "empty" });
          return;
        }
        resolve({
          ok: true,
          text,
          ms: transcript.ms,
          engine: transcript.engine,
          locale: transcript.resolvedLocale,
        });
      },
      (err: any) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve({ ok: false, reason: err?.code ?? "error" });
      }
    );
  });
}

/**
 * The stop-tap handoff decision (spec §3), pulled out of the screen so it can
 * be tested end to end.
 *
 * Device-first only when the module is present AND the take has not already
 * uploaded (a resumed take can arrive here with a blob). A device success runs
 * `onDevice` (persist transcript + begin, no upload); anything else runs
 * `onCloud` (the existing upload+begin path, same creationId). The `device_stt`
 * / `device_stt_fallback` perf events are emitted through `onPerf`, keyed off
 * the take's traceId by the caller.
 */
export type VoiceHandoffResult =
  | { path: "device"; stt: DeviceSttSuccess }
  | { path: "cloud"; reason?: string };

export async function runVoiceHandoff(params: {
  available: boolean;
  hasAudioStorageId: boolean;
  fileUri: string;
  localeId: string;
  engine: SpeechEngine;
  timeoutMs: number;
  requestId: string;
  stt: DeviceSttDeps;
  onDevice: (stt: DeviceSttSuccess) => Promise<void> | void;
  onCloud: () => Promise<void> | void;
  onPerf?: (
    event: "device_stt" | "device_stt_fallback",
    data: Record<string, unknown>
  ) => void;
}): Promise<VoiceHandoffResult> {
  const {
    available,
    hasAudioStorageId,
    fileUri,
    localeId,
    engine,
    timeoutMs,
    requestId,
    stt,
    onDevice,
    onCloud,
    onPerf,
  } = params;

  // No module, or a take that already has its bytes on the server: the device
  // attempt has nothing to add, so this is just the normal cloud path.
  if (!available || hasAudioStorageId) {
    await onCloud();
    return { path: "cloud" };
  }

  const result = await runDeviceStt(stt, { fileUri, localeId, engine, timeoutMs, requestId });
  if (result.ok) {
    onPerf?.("device_stt", {
      ms: result.ms,
      engine: result.engine,
      locale: result.locale,
      chars: result.text.length,
    });
    await onDevice(result);
    return { path: "device", stt: result };
  }

  onPerf?.("device_stt_fallback", { reason: result.reason });
  await onCloud();
  return { path: "cloud", reason: result.reason };
}
