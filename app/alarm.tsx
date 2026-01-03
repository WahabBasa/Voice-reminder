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
import { Audio } from "expo-av";
import notifee from "@notifee/react-native";
import AppIcon from "../components/AppIcon";
import { colors, scaleFontSize } from "../lib/theme";

const { width, height } = Dimensions.get("window");

export default function AlarmScreen() {
    const router = useRouter();
    const params = useLocalSearchParams<{
        notificationId?: string;
        reminderId?: string;
        title?: string;
        description?: string;
    }>();

    const [isPlaying, setIsPlaying] = useState(true);
    const soundRef = useRef<Audio.Sound | null>(null);
    const vibrationIntervalRef = useRef<NodeJS.Timeout | null>(null);

    const title = params.title || "Reminder";
    const description = params.description || "";
    const reminderId = params.reminderId;
    const notificationId = params.notificationId;

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
        try {
            await Audio.setAudioModeAsync({
                allowsRecordingIOS: false,
                playsInSilentModeIOS: true,
                staysActiveInBackground: true,
            });

            // Get audio path from local storage
            const audioPath = `${require("expo-file-system/legacy").documentDirectory}reminder_${reminderId}.mp3`;

            const { sound } = await Audio.Sound.createAsync(
                { uri: audioPath },
                { shouldPlay: true, volume: 1.0, isLooping: true }
            );

            soundRef.current = sound;
            setIsPlaying(true);
        } catch (e) {
            console.log("[VR] AlarmScreen: Failed to play audio:", e);
        }
    };

    const stopAudio = async () => {
        if (soundRef.current) {
            try {
                await soundRef.current.stopAsync();
                await soundRef.current.unloadAsync();
            } catch (e) {
                console.log("[VR] AlarmScreen: Error stopping audio:", e);
            }
            soundRef.current = null;
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

        // TODO: Reschedule for 5 minutes later
        // This would require accessing the full reminder data and rescheduling
        console.log("[VR] AlarmScreen: Snooze pressed - would reschedule for 5 min");

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
                <TouchableOpacity
                    style={styles.snoozeButton}
                    onPress={handleSnooze}
                    activeOpacity={0.8}
                >
                    <AppIcon name="clock" size={24} color="white" />
                    <Text style={styles.snoozeText}>Snooze 5 min</Text>
                </TouchableOpacity>

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
