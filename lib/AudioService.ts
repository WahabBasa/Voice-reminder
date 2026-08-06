/**
 * Unified Audio Service
 *
 * Provides consistent audio playback across the app.
 * Use separate instances for alarm vs preview to avoid lifecycle conflicts.
 */
import { Audio } from "expo-av";
import { Platform, NativeModules } from "react-native";

let VolumeManager: any = null;
let Sound: any = null;

// Native alarm audio module (uses USAGE_ALARM on Android to bypass silent mode)
const AlarmAudioModule = NativeModules.AlarmAudioModule;

try {
    VolumeManager = require("react-native-volume-manager").VolumeManager;
} catch (e) {
    console.log("[AudioService] VolumeManager not available");
}

try {
    Sound = require("react-native-sound").default;
    if (Sound && Platform.OS === "ios" && typeof Sound.setCategory === "function") {
        Sound.setCategory("Playback");
    }
} catch (e) {
    console.log("[AudioService] react-native-sound not available");
}

export type StreamType = "music" | "alarm";

export interface AudioPlaybackOptions {
    volume: number; // 0-1
    streamType?: StreamType; // 'alarm' for alarms (bypasses silent mode), 'music' for previews
    loop?: boolean;
}

export class AudioService {
    private sound: any = null;
    private isPlaying: boolean = false;
    private originalVolume: number | null = null;
    private streamType: StreamType = "music";
    private onPlaybackEnd: (() => void) | null = null;
    private currentUri: string | null = null;
    private nativeEndPoller: ReturnType<typeof setInterval> | null = null;

    /**
     * True when the native alarm module can play a file exactly once
     * (loop:false) — requires the AlarmAudioModule.playWithOptions method added
     * for OLD-53. Older installed binaries only expose the always-looping
     * play(); callers must check this before designing non-looping cadences.
     */
    supportsOneShotAlarmPlayback(): boolean {
        return (
            Platform.OS === "android" &&
            Boolean(AlarmAudioModule) &&
            typeof AlarmAudioModule.playWithOptions === "function"
        );
    }

    private clearNativeEndPoller(): void {
        if (this.nativeEndPoller) {
            clearInterval(this.nativeEndPoller);
            this.nativeEndPoller = null;
        }
    }

    /**
     * The native module has no completion event, so one-shot native playback
     * is finished-detected by polling isPlaying(). Fires onPlaybackEnd once.
     */
    private startNativeEndPoller(): void {
        this.clearNativeEndPoller();
        const marker = this.sound;
        this.nativeEndPoller = setInterval(async () => {
            // A newer play()/stop() replaced this playback — stop polling.
            if (this.sound !== marker) {
                this.clearNativeEndPoller();
                return;
            }
            try {
                const playing = await AlarmAudioModule.isPlaying();
                if (playing) return;
                this.clearNativeEndPoller();
                if (this.sound !== marker) return;
                this.sound = null;
                this.isPlaying = false;
                this.currentUri = null;
                const callback = this.onPlaybackEnd;
                this.onPlaybackEnd = null;
                await this.restoreVolume();
                if (callback) callback();
            } catch {
                // transient bridge error — keep polling
            }
        }, 500);
    }

    /**
     * Play audio from a file path or URL
     */
    async play(
        uri: string,
        options: AudioPlaybackOptions,
        onEnd?: () => void
    ): Promise<boolean> {
        const { volume, streamType = "music", loop = false } = options;
        this.streamType = streamType;

        try {
            // Stop any existing playback first
            await this.stop();

            // Set callback AFTER stop() so it doesn't get cleared
            this.onPlaybackEnd = onEnd || null;

            // For alarm stream on Android, use native AlarmAudioModule with USAGE_ALARM
            // This bypasses silent mode and plays through the alarm volume stream
            if (Platform.OS === "android" && streamType === "alarm" && AlarmAudioModule) {
                console.log("[AudioService] Using native AlarmAudioModule for alarm stream");
                console.log(`[AudioService] File: ${uri}, Volume: ${volume}, Loop: ${loop}`);

                try {
                    // Set alarm volume via VolumeManager
                    if (VolumeManager) {
                        const volumeResult = await VolumeManager.getVolume();
                        this.originalVolume = volumeResult.alarm ?? volumeResult.volume;
                        await VolumeManager.setVolume(volume, { type: "alarm", showUI: false });
                        console.log(`[AudioService] Set ALARM volume to ${volume}`);
                    }

                    // One-shot (loop:false) needs the newer playWithOptions; the
                    // legacy play() always loops. When one-shot is unavailable we
                    // degrade to looping — callers gate cadence design on
                    // supportsOneShotAlarmPlayback().
                    const useOneShot = !loop && this.supportsOneShotAlarmPlayback();
                    const success = useOneShot
                        ? await AlarmAudioModule.playWithOptions(uri, volume, false)
                        : await AlarmAudioModule.play(uri, volume);
                    if (success) {
                        this.isPlaying = true;
                        this.currentUri = uri;
                        this.sound = { isNative: true }; // marker for native playback
                        if (useOneShot) {
                            this.startNativeEndPoller();
                        }
                        console.log("[AudioService] ✅ Playing via native AlarmAudioModule (USAGE_ALARM)");
                        return true;
                    }
                } catch (nativeError) {
                    console.log("[AudioService] Native module error, falling back:", nativeError);
                }
            }

            // Set system volume if VolumeManager available (for music stream or fallback)
            if (Platform.OS === "android" && VolumeManager) {
                try {
                    const volumeResult = await VolumeManager.getVolume();
                    // Save original volume for this stream type
                    this.originalVolume =
                        streamType === "alarm"
                            ? volumeResult.alarm ?? volumeResult.volume
                            : volumeResult.volume;

                    await VolumeManager.setVolume(volume, {
                        type: streamType,
                        showUI: false,
                    });
                    console.log(`[AudioService] Set ${streamType} volume to ${volume}`);
                } catch (volumeError) {
                    console.log("[AudioService] VolumeManager error:", volumeError);
                }
            }

            // Use react-native-sound if available (better for alarms)
            if (Sound) {
                console.log(`[AudioService] Loading sound from: ${uri}`);
                return new Promise((resolve) => {
                    const sound = new Sound(uri, "", (error: any) => {
                        if (error) {
                            console.log("[AudioService] Failed to load:", error);
                            this.isPlaying = false;
                            resolve(false);
                            return;
                        }

                        console.log("[AudioService] Sound loaded successfully");
                        console.log("[AudioService] Sound duration:", sound.getDuration(), "seconds");

                        // Set playback volume to full (system volume controls actual loudness)
                        sound.setVolume(1);
                        console.log("[AudioService] Set playback volume to 1.0");

                        if (loop) {
                            sound.setNumberOfLoops(-1);
                            console.log("[AudioService] Set to loop indefinitely");
                        }

                        console.log("[AudioService] Calling sound.play()...");
                        sound.play((success: boolean) => {
                            console.log("[AudioService] Play callback - success:", success);
                            if (!success) {
                                console.log("[AudioService] ❌ Playback failed in callback");
                            }
                            if (!loop) {
                                this.isPlaying = false;
                                this.restoreVolume();
                                if (this.onPlaybackEnd) {
                                    this.onPlaybackEnd();
                                }
                            }
                        });

                        this.sound = sound;
                        this.isPlaying = true;
                        this.currentUri = uri;
                        console.log("[AudioService] ✅ Playing via react-native-sound");
                        console.log("[AudioService] isPlaying set to true");
                        resolve(true);
                    });
                });
            }

            // Fallback to expo-av
            console.log("[AudioService] Using expo-av fallback");
            await Audio.setAudioModeAsync({
                allowsRecordingIOS: false,
                playsInSilentModeIOS: true,
                staysActiveInBackground: true,
            });

            const { sound } = await Audio.Sound.createAsync(
                { uri },
                {
                    shouldPlay: true,
                    volume: 1, // Full playback volume, system volume controls loudness
                    isLooping: loop,
                }
            );

            this.sound = sound;
            this.isPlaying = true;

            // Handle playback completion for non-looping
            if (!loop) {
                sound.setOnPlaybackStatusUpdate((status) => {
                    if (status.isLoaded && status.didJustFinish) {
                        this.isPlaying = false;
                        this.restoreVolume();
                        if (this.onPlaybackEnd) {
                            this.onPlaybackEnd();
                        }
                    }
                });
            }

            console.log("[AudioService] ✅ Playing via expo-av");
            this.currentUri = uri;
            return true;
        } catch (error) {
            console.error("[AudioService] Play error:", error);
            this.isPlaying = false;
            return false;
        }
    }

    /**
     * Ensure audio is playing without restarting if already playing the same URI.
     * This prevents the "play → stop → play" double-start issue when UI mounts.
     */
    async ensurePlaying(
        uri: string,
        options: AudioPlaybackOptions,
        onEnd?: () => void
    ): Promise<boolean> {
        const targetStreamType = options.streamType ?? "music";
        
        // If already playing the same URI with the same stream type, just update volume
        if (this.isPlaying && this.currentUri === uri && this.streamType === targetStreamType) {
            await this.setVolume(options.volume);
            return true;
        }
        
        // Otherwise, start playback normally
        return this.play(uri, options, onEnd);
    }

    /**
     * Stop current playback and restore volume
     */
    async stop(): Promise<void> {
        this.clearNativeEndPoller();
        if (this.sound) {
            try {
                // Check if this is native AlarmAudioModule playback
                if (this.sound.isNative && AlarmAudioModule) {
                    await AlarmAudioModule.stop();
                    console.log("[AudioService] Stopped native AlarmAudioModule");
                } else if (Sound && typeof this.sound.stop === "function") {
                    this.sound.stop();
                    this.sound.release();
                } else if (typeof this.sound.stopAsync === "function") {
                    await this.sound.stopAsync();
                    await this.sound.unloadAsync();
                }
            } catch (e) {
                console.log("[AudioService] Stop error:", e);
            }
            this.sound = null;
        }

        this.isPlaying = false;
        this.currentUri = null;
        this.onPlaybackEnd = null;
        await this.restoreVolume();
    }

    /**
     * Get current playing state
     */
    getIsPlaying(): boolean {
        return this.isPlaying;
    }

    /**
     * Set volume during playback (for live adjustments)
     */
    async setVolume(volume: number): Promise<void> {
        if (!this.isPlaying) return;

        try {
            // Update system volume
            if (Platform.OS === "android" && VolumeManager) {
                await VolumeManager.setVolume(volume, {
                    type: this.streamType,
                    showUI: false,
                });
                console.log(`[AudioService] Set ${this.streamType} volume to ${volume}`);
            }

            // Update native module playback volume
            if (this.sound?.isNative && AlarmAudioModule) {
                await AlarmAudioModule.setVolume(volume);
                console.log(`[AudioService] Set native playback volume to ${volume}`);
            }
            // Update react-native-sound volume
            else if (Sound && typeof this.sound?.setVolume === "function") {
                this.sound.setVolume(volume);
                console.log(`[AudioService] Set react-native-sound volume to ${volume}`);
            }
            // Update expo-av volume
            else if (typeof this.sound?.setVolumeAsync === "function") {
                await this.sound.setVolumeAsync(volume);
                console.log(`[AudioService] Set expo-av volume to ${volume}`);
            }
        } catch (e) {
            console.log("[AudioService] setVolume error:", e);
        }
    }

    private async restoreVolume(): Promise<void> {
        if (
            Platform.OS === "android" &&
            VolumeManager &&
            this.originalVolume !== null
        ) {
            try {
                await VolumeManager.setVolume(this.originalVolume, {
                    type: this.streamType,
                    showUI: false,
                });
                console.log(
                    `[AudioService] Restored ${this.streamType} volume to ${this.originalVolume}`
                );
            } catch (e) {
                console.log("[AudioService] Restore volume error:", e);
            }
            this.originalVolume = null;
        }
    }
}

// Singleton instances for different use cases
// IMPORTANT: Alarm and preview use SEPARATE instances to avoid lifecycle conflicts
export const alarmAudioService = new AudioService();
export const previewAudioService = new AudioService();
