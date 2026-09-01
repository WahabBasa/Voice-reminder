import { Audio } from "expo-av";
import * as Sentry from "@sentry/react-native";
import { perfLog } from "./perf";
import { RECORDING_PRESET } from "./recordingPreset";

export type PermissionStatus = "granted" | "denied" | "undetermined";

let recording: Audio.Recording | null = null;
let isRecordingPreparing = false;

// ─── Audio-session restore after recording (OLD-106) ───────────────────────
//
// Recording puts the session in a record category; playback needs it back, and
// `playsInSilentModeIOS: true` in particular — lose it and the whole app's
// alarms play silently against a flipped mute switch. That made the switch look
// un-skippable, so stopRecording awaited it and the voice pipeline paid for it
// before the upload could even start.
//
// It is not skipped here. It is merely taken off the critical path: the switch
// is fired immediately and runs to completion on its own, while the caller gets
// its URI back and starts uploading. Two things make that safe rather than
// hopeful — it retries once on failure, and every playback path awaits
// ensurePlaybackAudioMode() below, so nothing can produce a sound while the
// restore is still in flight.
const PLAYBACK_AUDIO_MODE = {
  allowsRecordingIOS: false,
  playsInSilentModeIOS: true,
};

let pendingAudioModeRestore: Promise<void> | null = null;

function restorePlaybackAudioMode(traceId?: string): Promise<void> {
  const started = Date.now();

  const attempt = (retriesLeft: number): Promise<void> =>
    Audio.setAudioModeAsync(PLAYBACK_AUDIO_MODE).then(
      () => {
        if (traceId) {
          perfLog(traceId, "device.recording", "audioMode_restored", {
            ms: Date.now() - started,
            retried: retriesLeft === 0,
          });
        }
      },
      (e: any) => {
        if (retriesLeft > 0) return attempt(retriesLeft - 1);
        // Terminal: the session may still be in record category, which means
        // silent alarms. Loud enough to find in production — this is the exact
        // failure the old inline await was protecting against.
        console.error("[VR] Failed to restore playback audio mode:", e);
        if (traceId) {
          perfLog(traceId, "device.recording", "audioMode_restore_failed", {
            ms: Date.now() - started,
            reason: e?.message ?? String(e),
          });
        }
        Sentry.captureException(e, {
          tags: {
            vr_event: "audio_mode_restore_failed",
            vr_stage: "stopRecording",
          },
          extra: { traceId, ms: Date.now() - started },
          level: "error",
        });
      }
    );

  const restore = attempt(1).finally(() => {
    // Only clear if a newer restore hasn't already replaced this one.
    if (pendingAudioModeRestore === restore) pendingAudioModeRestore = null;
  });

  pendingAudioModeRestore = restore;
  return restore;
}

/**
 * Resolves once any in-flight post-recording audio-session restore has landed.
 * Playback awaits this so the mute-switch behaviour is settled before a sound
 * starts; it is a no-op (already-resolved) at every other moment.
 */
export function ensurePlaybackAudioMode(): Promise<void> {
  return pendingAudioModeRestore ?? Promise.resolve();
}

type MeteringListener = (db: number) => void;
let meteringListener: MeteringListener | null = null;

/**
 * Subscribe to live mic input levels (dBFS, ~-160..0) while recording.
 * One listener at a time; pass null to unsubscribe. Drives the VoiceMeter UI.
 */
export function setMeteringListener(listener: MeteringListener | null): void {
  meteringListener = listener;
}

export async function requestMicrophonePermission(): Promise<PermissionStatus> {
  const { status } = await Audio.requestPermissionsAsync();
  return status as PermissionStatus;
}

export async function getMicrophonePermission(): Promise<PermissionStatus> {
  const { status } = await Audio.getPermissionsAsync();
  return status as PermissionStatus;
}

export async function startRecording(): Promise<void> {
  // Prevent double-tap race condition
  if (isRecordingPreparing) {
    console.log("[VR] Recording already preparing, ignoring duplicate call");
    return;
  }

  // Clean up any existing recording first
  if (recording) {
    console.log("[VR] Cleaning up existing recording before starting new one");
    try {
      await recording.stopAndUnloadAsync();
    } catch (e) {
      console.log("[VR] Error cleaning up previous recording:", e);
    }
    recording = null;
  }

  isRecordingPreparing = true;

  try {
    await Audio.setAudioModeAsync({
      allowsRecordingIOS: true,
      playsInSilentModeIOS: true,
    });

    const { recording: newRecording } = await Audio.Recording.createAsync(
      { ...RECORDING_PRESET, isMeteringEnabled: true },
      (status) => {
        if (status.isRecording && typeof status.metering === "number") {
          meteringListener?.(status.metering);
        }
      },
      80
    );
    recording = newRecording;
  } finally {
    isRecordingPreparing = false;
  }
}

export async function pauseRecording(): Promise<void> {
  if (!recording) return;
  await recording.pauseAsync();
}

export async function resumeRecording(): Promise<void> {
  if (!recording) return;
  await recording.startAsync();
}

export async function stopRecording(traceId?: string): Promise<string | null> {
  if (!recording) return null;

  // Split timing (OLD-82): both halves of this function landed in the same
  // commit as Sentry (28bb2e0), so "the slowdown started with Sentry" could
  // just as easily be the audio-session change below. Measure, don't guess.
  //
  // OLD-106 answered it by removing the second half from the wait entirely.
  // The URI is ready the moment expo-av finishes unloading; the session restore
  // is fired here and completes on its own (see restorePlaybackAudioMode), so
  // the upload no longer queues behind an AVAudioSession category switch.
  const tStart = Date.now();
  await recording.stopAndUnloadAsync();
  const tUnloaded = Date.now();

  // Not awaited — deliberately. Guaranteed to run to completion, retried once
  // on failure, reported to Sentry if it ever gives up, and awaited by every
  // playback path via ensurePlaybackAudioMode().
  void restorePlaybackAudioMode(traceId);

  if (traceId) {
    perfLog(traceId, "device.recording", "stopRecording_split", {
      // expo-av teardown + file finalization — now the whole of the wait.
      unloadMs: tUnloaded - tStart,
      // Kept as a field so the shape of the log is stable across the change:
      // the category switch is off the critical path, so it costs zero here.
      // Its real duration lands separately as audioMode_restored.
      audioModeMs: 0,
      audioModeDeferred: 1,
    });
  }

  const uri = recording.getURI();
  recording = null;
  return uri;
}

export function getRecording(): Audio.Recording | null {
  return recording;
}


// ============================================================
// AudioService - Unified audio playback with resource management
// ============================================================

export interface PlayOptions {
  volume?: number;           // 0-1, controls system volume for playback
  loop?: boolean;            // For alarm continuous playback
  useNativeSound?: boolean;  // Use react-native-sound (bypasses silent mode)
  onFinish?: () => void;     // Called when playback finishes
}

// Optional native modules - require dev client rebuild
let VolumeManager: any = null;
let NativeSound: any = null;

try {
  VolumeManager = require("react-native-volume-manager").VolumeManager;
} catch (e) {
  console.log("[AudioService] VolumeManager not available");
}

try {
  NativeSound = require("react-native-sound").default;
  // iOS only - enable playback in silent mode
  if (NativeSound && Platform.OS === "ios" && typeof NativeSound.setCategory === "function") {
    NativeSound.setCategory("Playback");
  }
} catch (e) {
  console.log("[AudioService] react-native-sound not available");
}

import { Platform } from "react-native";

class AudioServiceClass {
  private currentSound: Audio.Sound | null = null;
  private nativeSound: any = null;
  private isLoading = false;
  private loadAborted = false;
  private originalVolume: number | null = null;
  private preloadDebounceTimer: NodeJS.Timeout | null = null;
  private preloadedUri: string | null = null;

  /**
   * Play audio from URI with options
   */
  async play(uri: string, options: PlayOptions = {}): Promise<void> {
    const { volume = 1, loop = false, useNativeSound = false, onFinish } = options;
    console.log("[AudioService] play()", { uri: uri.slice(0, 50), volume, loop, useNativeSound });

    // The one place the deferred audio-session restore is collected (OLD-106).
    // stopRecording no longer waits for the category switch back to
    // playback-in-silent-mode, so playback does — otherwise a sound started in
    // the seconds after a recording could inherit the record session and go out
    // silent. Already resolved except in exactly that window, and the native
    // sound path especially needs it: it sets no audio mode of its own.
    await ensurePlaybackAudioMode();

    // Stop any current playback first
    await this.stop();

    // Set system volume if VolumeManager available
    if (VolumeManager && Platform.OS === "android") {
      try {
        const volumeResult = await VolumeManager.getVolume();
        this.originalVolume = volumeResult.volume;
        await VolumeManager.setVolume(volume, { type: "music", showUI: false });
        console.log("[AudioService] System volume set to:", volume);
      } catch (e) {
        console.log("[AudioService] VolumeManager error:", e);
      }
    }

    // Use react-native-sound for alarm (bypasses silent mode)
    if (useNativeSound && NativeSound) {
      return this.playWithNativeSound(uri, { loop, onFinish });
    }

    // Use expo-av for preview
    return this.playWithExpoAv(uri, { volume, loop, onFinish });
  }

  /**
   * Play using react-native-sound (for alarms - bypasses silent mode)
   */
  private async playWithNativeSound(uri: string, options: { loop: boolean; onFinish?: () => void }): Promise<void> {
    const { loop, onFinish } = options;
    console.log("[AudioService] Using react-native-sound");

    return new Promise((resolve, reject) => {
      const sound = new NativeSound(uri, "", (error: any) => {
        if (error) {
          console.log("[AudioService] Failed to load native sound:", error);
          this.restoreSystemVolume();
          reject(error);
          return;
        }

        console.log("[AudioService] Native sound loaded");
        sound.setVolume(1); // Full volume since system volume is already set
        sound.setNumberOfLoops(loop ? -1 : 0);

        sound.play((success: boolean) => {
          if (!loop) {
            this.restoreSystemVolume();
            onFinish?.();
          }
          resolve();
        });

        this.nativeSound = sound;
      });
    });
  }

  /**
   * Play using expo-av (for previews)
   */
  private async playWithExpoAv(uri: string, options: { volume: number; loop: boolean; onFinish?: () => void }): Promise<void> {
    const { volume, loop, onFinish } = options;
    console.log("[AudioService] Using expo-av");

    this.isLoading = true;
    this.loadAborted = false;

    try {
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
        playsInSilentModeIOS: true,
        staysActiveInBackground: true,
      });

      // Check if already preloaded
      if (this.currentSound && this.preloadedUri === uri) {
        console.log("[AudioService] Using preloaded sound");
        await this.currentSound.setPositionAsync(0);
        await this.currentSound.setVolumeAsync(1); // System volume handles actual level
      } else {
        // Load new sound
        if (this.loadAborted) return;

        const { sound } = await Audio.Sound.createAsync(
          { uri },
          { volume: 1, shouldPlay: false, isLooping: loop }
        );

        if (this.loadAborted) {
          await sound.unloadAsync();
          return;
        }

        this.currentSound = sound;
        this.preloadedUri = uri;
      }

      // Set up finish handler
      this.currentSound.setOnPlaybackStatusUpdate((status) => {
        if (status.isLoaded && status.didJustFinish && !loop) {
          this.restoreSystemVolume();
          onFinish?.();
        }
      });

      await this.currentSound.playAsync();
      console.log("[AudioService] Playback started");
    } catch (e) {
      console.log("[AudioService] expo-av playback error:", e);
      this.restoreSystemVolume();
      throw e;
    } finally {
      this.isLoading = false;
    }
  }

  /**
   * Stop current playback and cleanup resources
   */
  async stop(): Promise<void> {
    console.log("[AudioService] stop()");

    // Abort any in-progress loading
    this.loadAborted = true;

    // Stop native sound
    if (this.nativeSound) {
      try {
        this.nativeSound.stop();
        this.nativeSound.release();
      } catch (e) {
        console.log("[AudioService] Error stopping native sound:", e);
      }
      this.nativeSound = null;
    }

    // Stop expo-av sound
    if (this.currentSound) {
      try {
        await this.currentSound.stopAsync();
        await this.currentSound.unloadAsync();
      } catch (e) {
        console.log("[AudioService] Error stopping expo-av sound:", e);
      }
      this.currentSound = null;
      this.preloadedUri = null;
    }

    // Restore system volume
    await this.restoreSystemVolume();
  }

  /**
   * Preload audio (debounced to prevent rapid attempts)
   */
  async preload(uri: string): Promise<void> {
    // Cancel any pending preload
    if (this.preloadDebounceTimer) {
      clearTimeout(this.preloadDebounceTimer);
    }

    // Skip if already preloaded
    if (this.preloadedUri === uri && this.currentSound) {
      console.log("[AudioService] Already preloaded:", uri.slice(0, 50));
      return;
    }

    // Debounce preload attempts
    return new Promise((resolve) => {
      this.preloadDebounceTimer = setTimeout(async () => {
        try {
          console.log("[AudioService] Preloading:", uri.slice(0, 50));

          // Cleanup existing
          if (this.currentSound) {
            await this.currentSound.unloadAsync().catch(() => { });
            this.currentSound = null;
          }

          await Audio.setAudioModeAsync({
            allowsRecordingIOS: false,
            playsInSilentModeIOS: true,
          });

          const { sound } = await Audio.Sound.createAsync(
            { uri },
            { volume: 1, shouldPlay: false }
          );

          this.currentSound = sound;
          this.preloadedUri = uri;
          console.log("[AudioService] Preload complete");
        } catch (e) {
          console.log("[AudioService] Preload failed:", e);
        }
        resolve();
      }, 200); // 200ms debounce
    });
  }

  /**
   * Restore system volume to original level
   */
  private async restoreSystemVolume(): Promise<void> {
    if (this.originalVolume !== null && VolumeManager && Platform.OS === "android") {
      try {
        await VolumeManager.setVolume(this.originalVolume, { type: "music", showUI: false });
        console.log("[AudioService] Restored system volume to:", this.originalVolume);
      } catch (e) {
        console.log("[AudioService] Error restoring volume:", e);
      }
      this.originalVolume = null;
    }
  }

  /**
   * Check if currently playing
   */
  get isPlaying(): boolean {
    return this.currentSound !== null || this.nativeSound !== null;
  }
}

// Export singleton instance
export const audioService = new AudioServiceClass();

// Legacy exports for backward compatibility (deprecated)
let currentSound: Audio.Sound | null = null;

/** @deprecated Use audioService.play() instead */
export async function playAudio(uri: string, waitForFinish = false): Promise<void> {
  console.log("[VR] playAudio (deprecated) - use audioService.play()");
  await audioService.play(uri, {});
}

/** @deprecated Use audioService.play() with loop option instead */
export async function playAudioRepeated(uri: string, repeatCount: number): Promise<void> {
  console.log("[VR] playAudioRepeated (deprecated) - use audioService.play()");
  for (let i = 0; i < repeatCount; i++) {
    await audioService.play(uri, {});
    if (i < repeatCount - 1) {
      await new Promise(resolve => setTimeout(resolve, 50));
    }
  }
}

