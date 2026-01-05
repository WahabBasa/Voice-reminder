import { useEffect, useRef, useState } from "react";
import {
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
    Vibration,
    Dimensions,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import notifee, { AndroidCategory, AndroidImportance, TriggerType, TimestampTrigger } from "@notifee/react-native";
import * as FileSystem from "expo-file-system/legacy";
import AppIcon from "../components/AppIcon";
import { colors, scaleFontSize } from "../lib/theme";
import { alarmAudioService } from "../lib/AudioService";

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
    const vibrationIntervalRef = useRef<NodeJS.Timeout | null>(null);
    const isMountedRef = useRef(true);
    const isExplicitDismissRef = useRef(false);

    const title = params.title || "Reminder";
    const description = params.description || "";
    const reminderId = params.reminderId;
    const notificationId = params.notificationId;

    const snoozeEnabled = params.snoozeEnabled !== "false";
    const snoozeDurationMinutes = Math.max(1, Math.min(60, Number(params.snoozeDuration ?? "5") || 5));
    const targetVolume = Math.max(0, Math.min(1, Number(params.volume ?? "1") || 1));

    useEffect(() => {
        console.log("[VR] AlarmScreen: useEffect mount, starting audio...");
        isMountedRef.current = true;
        isExplicitDismissRef.current = false;

        // Start audio playback loop
        startAudioLoop();

        // Start vibration pattern
        startVibration();

        return () => {
            console.log("[VR] AlarmScreen: useEffect cleanup, isExplicitDismiss:", isExplicitDismissRef.current);
            isMountedRef.current = false;

            // Only stop audio if this is an explicit user action (dismiss/snooze)
            // This prevents audio stopping on navigation churn / React strict mode remounts
            if (isExplicitDismissRef.current) {
                stopAudio();
            } else {
                console.log("[VR] AlarmScreen: Skipping audio stop - not an explicit dismiss");
            }
            stopVibration();
        };
    }, []);

    const startAudioLoop = async () => {
        console.log("[VR] ========== ALARM AUDIO START ==========");
        console.log("[VR] Target volume:", targetVolume);
        console.log("[VR] Reminder ID:", reminderId);

        // Get audio path from local storage
        const audioPath = `${FileSystem.documentDirectory}reminder_${reminderId}.mp3`;
        console.log("[VR] Audio path:", audioPath);

        // Use native AlarmAudioModule with USAGE_ALARM to bypass silent mode
        const success = await alarmAudioService.play(audioPath, {
            volume: targetVolume,
            streamType: "alarm", // Uses native AlarmAudioModule with USAGE_ALARM
            loop: true,
        });

        if (isMountedRef.current) {
            setIsPlaying(success);
        }
        if (success) {
            console.log("[VR] ✅ Alarm audio playing via AudioService");
        } else {
            console.log("[VR] ❌ Failed to start alarm audio");
        }
    };

    const stopAudio = async () => {
        console.log("[VR] Stopping alarm audio...");
        await alarmAudioService.stop();
        setIsPlaying(false);
        console.log("[VR] Alarm audio stopped");
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
        isExplicitDismissRef.current = true;
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
        isExplicitDismissRef.current = true;
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
