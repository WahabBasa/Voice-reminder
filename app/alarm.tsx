import { useEffect, useRef, useState } from "react";
import {
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
    Vibration,
    Dimensions,
    Platform,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import notifee, { AndroidCategory, AndroidImportance, TriggerType, TimestampTrigger } from "@notifee/react-native";
import AppIcon from "../components/AppIcon";
import { colors, scaleFontSize } from "../lib/theme";

// Optional imports - require dev client rebuild
// App will work without them, just won't have per-reminder volume control until rebuilt
let VolumeManager: any = null;
let Sound: any = null;

try {
    VolumeManager = require("react-native-volume-manager").VolumeManager;
    console.log("[VR] ✅ VolumeManager loaded successfully:", !!VolumeManager);
} catch (e) {
    console.log("[VR] ❌ VolumeManager not available (needs dev client rebuild):", e);
}

try {
    Sound = require("react-native-sound").default;
    console.log("[VR] ✅ react-native-sound loaded successfully:", !!Sound);
    // Enable playback in silence mode (iOS only - setCategory doesn't exist on Android)
    if (Sound && Platform.OS === "ios" && typeof Sound.setCategory === "function") {
        Sound.setCategory("Playback");
        console.log("[VR] Set Sound category to Playback (iOS)");
    }
} catch (e) {
    console.log("[VR] ❌ react-native-sound not available (needs dev client rebuild):", e);
}

// Log module status at load time
console.log("[VR] === ALARM MODULE STATUS ===");
console.log("[VR] Platform:", Platform.OS);
console.log("[VR] VolumeManager available:", !!VolumeManager);
console.log("[VR] Sound available:", !!Sound);
console.log("[VR] ==============================");

const { width, height } = Dimensions.get("window");

export default function AlarmScreen() {
    const router = useRouter();
    const params = useLocalSearchParams<{
        notificationId?: string;
        reminderId?: string;
        title?: string;
        description?: string;
        snoozeEnabled?: string;
        snoozeDuration?: string;
        volume?: string;
        volumeStyle?: string;
    }>();

    const [isPlaying, setIsPlaying] = useState(true);
    const soundRef = useRef<any>(null);
    const vibrationIntervalRef = useRef<NodeJS.Timeout | null>(null);
    const volumeRampIntervalRef = useRef<NodeJS.Timeout | null>(null);
    const originalMusicVolumeRef = useRef<number | null>(null);

    const title = params.title || "Reminder";
    const description = params.description || "";
    const reminderId = params.reminderId;
    const notificationId = params.notificationId;

    const snoozeEnabled = params.snoozeEnabled !== "false";
    const snoozeDurationMinutes = Math.max(1, Math.min(60, Number(params.snoozeDuration ?? "5") || 5));
    const targetVolume = Math.max(0, Math.min(1, Number(params.volume ?? "1") || 1));
    const volumeStyle = params.volumeStyle === "progressive" ? "progressive" : "standard";

    useEffect(() => {
        // Start audio playback loop
        startAudioLoop();

        // Start vibration pattern
        startVibration();

        return () => {
            stopAudio();
            stopVibration();
        };
    }, []);

    const startAudioLoop = async () => {
        console.log("[VR] ========== ALARM AUDIO START ==========");
        console.log("[VR] Platform:", Platform.OS);
        console.log("[VR] VolumeManager available:", !!VolumeManager);
        console.log("[VR] Sound (react-native-sound) available:", !!Sound);
        console.log("[VR] Target volume from params:", targetVolume);
        console.log("[VR] Volume style:", volumeStyle);
        console.log("[VR] Reminder ID:", reminderId);

        try {
            // On Android, save the original MUSIC volume and set to our target volume
            // This allows per-reminder volume control and bypasses silent mode
            // We use MUSIC stream because react-native-sound plays on MUSIC stream
            if (Platform.OS === "android" && VolumeManager) {
                console.log("[VR] Attempting to control volume via VolumeManager...");
                try {
                    const volumeResult = await VolumeManager.getVolume();
                    console.log("[VR] VolumeManager.getVolume() result:", JSON.stringify(volumeResult));

                    // Save original music volume (this is what react-native-sound uses)
                    originalMusicVolumeRef.current = volumeResult.volume;
                    console.log(`[VR] Saved original music volume: ${originalMusicVolumeRef.current}`);
                    console.log(`[VR] Setting music volume to: ${targetVolume}`);

                    // Set MUSIC stream volume to reminder's target volume
                    // This makes the alarm play at the set volume regardless of device settings
                    await VolumeManager.setVolume(targetVolume, { type: "music", showUI: false });
                    console.log("[VR] ✅ VolumeManager.setVolume completed");

                    // Verify the volume was set
                    const verifyResult = await VolumeManager.getVolume();
                    console.log("[VR] Volume after setting:", JSON.stringify(verifyResult));
                } catch (volumeError) {
                    console.log("[VR] ❌ VolumeManager error:", volumeError);
                }
            } else {
                console.log("[VR] ⚠️ VolumeManager NOT used - Platform:", Platform.OS, "VolumeManager:", !!VolumeManager);
            }

            // Get audio path from local storage
            const audioPath = `${require("expo-file-system/legacy").documentDirectory}reminder_${reminderId}.mp3`;
            console.log("[VR] Audio path:", audioPath);

            // Use react-native-sound if available (plays on MUSIC stream)
            if (Sound) {
                console.log("[VR] 🔊 Using react-native-sound for playback");
                const initialVolume = volumeStyle === "progressive" ? Math.min(targetVolume, 0.2) : 1;
                console.log("[VR] Initial playback volume:", initialVolume);

                const sound = new Sound(audioPath, "", (error: any) => {
                    if (error) {
                        console.log("[VR] ❌ Failed to load sound:", error);
                        return;
                    }
                    console.log("[VR] ✅ Sound loaded successfully");

                    sound.setVolume(initialVolume);
                    sound.setNumberOfLoops(-1); // Loop indefinitely
                    console.log("[VR] Starting playback...");
                    sound.play((success: boolean) => {
                        if (!success) {
                            console.log("[VR] ❌ Sound playback failed");
                        } else {
                            console.log("[VR] ✅ Sound playing");
                        }
                    });

                    soundRef.current = sound;
                    setIsPlaying(true);

                    // Progressive volume ramp
                    if (volumeStyle === "progressive") {
                        const rampMs = 30_000;
                        const tickMs = 1_000;
                        const steps = Math.max(1, Math.floor(rampMs / tickMs));
                        const start = Math.min(targetVolume, 0.2);
                        let step = 0;

                        if (volumeRampIntervalRef.current) {
                            clearInterval(volumeRampIntervalRef.current);
                        }

                        volumeRampIntervalRef.current = setInterval(() => {
                            step += 1;
                            const nextVolume = start + ((1 - start) * step) / steps;
                            try {
                                sound.setVolume(Math.max(0, Math.min(1, nextVolume)));
                            } catch {
                                // ignore
                            }
                            if (step >= steps) {
                                if (volumeRampIntervalRef.current) {
                                    clearInterval(volumeRampIntervalRef.current);
                                    volumeRampIntervalRef.current = null;
                                }
                            }
                        }, tickMs);
                    }
                });
            } else {
                // Fallback to expo-av if react-native-sound not available
                console.log("[VR] AlarmScreen: Falling back to expo-av");
                const { Audio } = require("expo-av");

                await Audio.setAudioModeAsync({
                    allowsRecordingIOS: false,
                    playsInSilentModeIOS: true,
                    staysActiveInBackground: true,
                });

                const { sound } = await Audio.Sound.createAsync(
                    { uri: audioPath },
                    { shouldPlay: true, volume: volumeStyle === "progressive" ? Math.min(targetVolume, 0.2) : targetVolume, isLooping: true }
                );

                soundRef.current = sound;
                setIsPlaying(true);
            }
        } catch (e) {
            console.log("[VR] AlarmScreen: Failed to play audio:", e);
        }
    };

    const stopAudio = async () => {
        if (soundRef.current) {
            try {
                // Handle both react-native-sound and expo-av cleanup
                if (Sound && typeof soundRef.current.stop === "function") {
                    soundRef.current.stop();
                    soundRef.current.release();
                } else if (typeof soundRef.current.stopAsync === "function") {
                    await soundRef.current.stopAsync();
                    await soundRef.current.unloadAsync();
                }
            } catch (e) {
                console.log("[VR] AlarmScreen: Error stopping audio:", e);
            }
            soundRef.current = null;
        }
        if (volumeRampIntervalRef.current) {
            clearInterval(volumeRampIntervalRef.current);
            volumeRampIntervalRef.current = null;
        }

        // Restore original MUSIC volume on Android
        if (Platform.OS === "android" && VolumeManager && originalMusicVolumeRef.current !== null) {
            try {
                console.log(`[VR] AlarmScreen: Restoring music volume to: ${originalMusicVolumeRef.current}`);
                await VolumeManager.setVolume(originalMusicVolumeRef.current, { type: "music", showUI: false });
                originalMusicVolumeRef.current = null;
            } catch (e) {
                console.log("[VR] AlarmScreen: Error restoring music volume:", e);
            }
        }

        setIsPlaying(false);
    };

    const startVibration = () => {
        // Vibrate every 2 seconds
        vibrationIntervalRef.current = setInterval(() => {
            Vibration.vibrate([0, 500, 200, 500]);
        }, 2000);

        // Initial vibration
        Vibration.vibrate([0, 500, 200, 500]);
    };

    const stopVibration = () => {
        if (vibrationIntervalRef.current) {
            clearInterval(vibrationIntervalRef.current);
            vibrationIntervalRef.current = null;
        }
        Vibration.cancel();
    };

    const handleDismiss = async () => {
        stopAudio();
        stopVibration();

        // Cancel the notification
        if (notificationId) {
            await notifee.cancelNotification(notificationId);
        }

        // Close the alarm screen
        router.back();
    };

    const handleSnooze = async () => {
        stopAudio();
        stopVibration();

        // Cancel current notification
        if (notificationId) {
            await notifee.cancelNotification(notificationId);
        }

        if (!snoozeEnabled || !reminderId) {
            router.back();
            return;
        }

        const channelId = `reminder_${reminderId}`;
        const triggerTimestamp = Date.now() + snoozeDurationMinutes * 60_000;
        const trigger: TimestampTrigger = {
            type: TriggerType.TIMESTAMP,
            timestamp: triggerTimestamp,
            alarmManager: { allowWhileIdle: true },
        };

        await notifee.createTriggerNotification(
            {
                id: `snooze_${reminderId}_${Date.now()}`,
                title,
                body: description,
                android: {
                    channelId,
                    importance: AndroidImportance.HIGH,
                    category: AndroidCategory.ALARM,
                    autoCancel: false,
                    lightUpScreen: true,
                    pressAction: { id: "default" },
                },
                data: {
                    reminderId,
                    title,
                    description,
                    snoozeEnabled: String(snoozeEnabled),
                    snoozeDuration: String(snoozeDurationMinutes),
                    volume: String(targetVolume),
                    volumeStyle,
                },
            },
            trigger
        );

        // Close the alarm screen
        router.back();
    };

    return (
        <View style={styles.container}>
            {/* Animated background gradient effect would go here */}
            <View style={styles.content}>
                {/* Icon */}
                <View style={styles.iconContainer}>
                    <View style={styles.iconCircle}>
                        <AppIcon name="bell" size={48} color="white" />
                    </View>
                </View>

                {/* Time */}
                <Text style={styles.time}>
                    {new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                </Text>

                {/* Reminder info */}
                <Text style={styles.title}>{title}</Text>
                {description ? (
                    <Text style={styles.description}>{description}</Text>
                ) : null}

                {/* Status indicator */}
                {isPlaying && (
                    <View style={styles.playingIndicator}>
                        <AppIcon name="volume-2" size={20} color="rgba(255,255,255,0.7)" />
                        <Text style={styles.playingText}>Playing...</Text>
                    </View>
                )}
            </View>

            {/* Action buttons */}
            <View style={styles.actions}>
                {snoozeEnabled ? (
                    <TouchableOpacity
                        style={styles.snoozeButton}
                        onPress={handleSnooze}
                        activeOpacity={0.8}
                    >
                        <AppIcon name="clock" size={24} color="white" />
                        <Text style={styles.snoozeText}>Snooze {snoozeDurationMinutes} min</Text>
                    </TouchableOpacity>
                ) : null}

                <TouchableOpacity
                    style={styles.dismissButton}
                    onPress={handleDismiss}
                    activeOpacity={0.8}
                >
                    <AppIcon name="x" size={24} color="white" />
                    <Text style={styles.dismissText}>Dismiss</Text>
                </TouchableOpacity>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: "#1a1a2e",
        justifyContent: "space-between",
        alignItems: "center",
        paddingVertical: 60,
    },
    content: {
        flex: 1,
        justifyContent: "center",
        alignItems: "center",
        paddingHorizontal: 32,
    },
    iconContainer: {
        marginBottom: 32,
    },
    iconCircle: {
        width: 100,
        height: 100,
        borderRadius: 50,
        backgroundColor: colors.accent,
        justifyContent: "center",
        alignItems: "center",
        shadowColor: colors.accent,
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.5,
        shadowRadius: 20,
        elevation: 10,
    },
    time: {
        fontSize: scaleFontSize(56),
        fontWeight: "200",
        color: "white",
        marginBottom: 24,
    },
    title: {
        fontSize: scaleFontSize(28),
        fontWeight: "600",
        color: "white",
        textAlign: "center",
        marginBottom: 8,
    },
    description: {
        fontSize: scaleFontSize(16),
        color: "rgba(255,255,255,0.7)",
        textAlign: "center",
        maxWidth: width * 0.8,
    },
    playingIndicator: {
        flexDirection: "row",
        alignItems: "center",
        marginTop: 24,
        gap: 8,
    },
    playingText: {
        fontSize: scaleFontSize(14),
        color: "rgba(255,255,255,0.7)",
    },
    actions: {
        flexDirection: "row",
        gap: 24,
        paddingHorizontal: 32,
    },
    snoozeButton: {
        flex: 1,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "rgba(255,255,255,0.15)",
        borderRadius: 16,
        paddingVertical: 18,
        gap: 10,
    },
    snoozeText: {
        fontSize: scaleFontSize(16),
        fontWeight: "600",
        color: "white",
    },
    dismissButton: {
        flex: 1,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: colors.accent,
        borderRadius: 16,
        paddingVertical: 18,
        gap: 10,
    },
    dismissText: {
        fontSize: scaleFontSize(16),
        fontWeight: "600",
        color: "white",
    },
});
