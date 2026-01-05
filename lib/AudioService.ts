/**
 * Unified Audio Service
 *
 * Provides consistent audio playback across the app.
 * Use separate instances for alarm vs preview to avoid lifecycle conflicts.
 */
import { Audio } from "expo-av";
import { Platform } from "react-native";

let VolumeManager: any = null;
let Sound: any = null;

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
        this.onPlaybackEnd = onEnd || null;

        try {
            // Stop any existing playback first
            await this.stop();

            // Set system volume if VolumeManager available
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
            return true;
        } catch (error) {
            console.error("[AudioService] Play error:", error);
            this.isPlaying = false;
            return false;
        }
    }

    /**
     * Stop current playback and restore volume
     */
    async stop(): Promise<void> {
        if (this.sound) {
            try {
                if (Sound && typeof this.sound.stop === "function") {
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
        this.onPlaybackEnd = null;
        await this.restoreVolume();
    }

    /**
     * Get current playing state
     */
    getIsPlaying(): boolean {
        return this.isPlaying;
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
