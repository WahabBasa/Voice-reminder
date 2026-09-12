/**
 * On-device speech-to-text (iOS 26+ SpeechAnalyzer) — JS contract.
 *
 * The native side is `VRSpeech` (plugins/ios-src/VRSpeech.swift, injected by
 * plugins/withVRSpeech.js, classic RN bridge like AlarmKitBridge). Everything
 * here degrades to "unavailable" when the module is missing (Android, iOS < 26,
 * simulator without assets), so callers branch on `isVRSpeechAvailable()` and
 * fall back to the cloud STT path.
 *
 * Two engines, because Apple ships two on-device models: `dictation` is the
 * system-dictation model (`DictationTranscriber`, what the keyboard uses) and
 * `transcriber` is the general `SpeechTranscriber`. Which one wins is decided
 * on the phone; both must be reachable from JS.
 */
import { NativeModules, Platform } from "react-native";

export type SpeechEngine = "dictation" | "transcriber";

export interface SpeechStatus {
    /** The locale resolved via `supportedLocale(equivalentTo:)`, or null when unsupported. */
    resolvedLocale: string | null;
    /** True when the engine supports the resolved locale on this device. */
    supported: boolean;
    /** True when the locale's assets are installed and the engine can run now. */
    installed: boolean;
    /** Human-readable reason when not usable (unsupported locale, assets missing, OS too old). */
    reason?: string;
}

export interface SpeechPrepareResult {
    resolvedLocale: string | null;
    installed: boolean;
}

export interface SpeechTranscript {
    /** Final transcript, segments concatenated and trimmed. Empty string when nothing was recognized. */
    text: string;
    resolvedLocale: string;
    engine: SpeechEngine;
    /** Wall-clock ms spent inside the native call. */
    ms: number;
}

interface VRSpeechNative {
    status(localeId: string, engine: SpeechEngine): Promise<SpeechStatus>;
    /** Downloads/installs assets when missing and preheats the analyzer. Safe to call repeatedly. */
    prepare(localeId: string, engine: SpeechEngine): Promise<SpeechPrepareResult>;
    /**
     * Transcribes a finished audio file (m4a from expo-av). `requestId` lets the
     * caller cancel; a cancelled request rejects with code "cancelled" and must
     * never resolve late.
     */
    transcribeFile(
        fileUri: string,
        localeId: string,
        engine: SpeechEngine,
        requestId: string
    ): Promise<SpeechTranscript>;
    cancel(requestId: string): Promise<void>;
}

const native: VRSpeechNative | undefined =
    Platform.OS === "ios" ? (NativeModules.VRSpeech as VRSpeechNative | undefined) : undefined;

/** True when the native module is linked (iOS 26+ build with the plugin). Not a readiness check. */
export function isVRSpeechAvailable(): boolean {
    return !!native;
}

export function speechStatus(localeId: string, engine: SpeechEngine): Promise<SpeechStatus> {
    if (!native) {
        return Promise.resolve({
            resolvedLocale: null,
            supported: false,
            installed: false,
            reason: "VRSpeech native module not available",
        });
    }
    return native.status(localeId, engine);
}

export function speechPrepare(localeId: string, engine: SpeechEngine): Promise<SpeechPrepareResult> {
    if (!native) return Promise.resolve({ resolvedLocale: null, installed: false });
    return native.prepare(localeId, engine);
}

export function speechTranscribeFile(
    fileUri: string,
    localeId: string,
    engine: SpeechEngine,
    requestId: string
): Promise<SpeechTranscript> {
    if (!native) return Promise.reject(new Error("VRSpeech native module not available"));
    return native.transcribeFile(fileUri, localeId, engine, requestId);
}

export function speechCancel(requestId: string): Promise<void> {
    if (!native) return Promise.resolve();
    return native.cancel(requestId);
}
