import { useEffect, useRef, useState } from "react";
import {
    BackHandler,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
    Vibration,
    Dimensions,
    Platform,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import notifee, {
    AndroidCategory,
    AndroidImportance,
    AndroidVisibility,
    AlarmType,
    TriggerType,
    TimestampTrigger,
} from "@notifee/react-native";
import * as FileSystem from "expo-file-system/legacy";
import { useMutation } from "convex/react";
import { api } from "../convex/_generated/api";
import { cancelDisplayedAlarmNotifications, clearPendingAlarm } from "../lib/notifications";
import { buildTraceId } from "../lib/vrLog";
import AppIcon from "../components/AppIcon";
import { colors, scaleFontSize } from "../lib/theme";
import { alarmAudioService } from "../lib/AudioService";
import { getNextIntervalOccurrence } from "../lib/time";
import { useReminderStore } from "../lib/store";
import { removeReminderFully } from "../lib/reminderRemoval";
import { vrLog, logAlarmLifecycle } from "../lib/vrLog";
import { logAppTaskState } from "../lib/activityControl";

const { width, height } = Dimensions.get("window");
const ANDROID_ALARM_ACTIVITY = "com.wahabbasa.VoiceReminder.AlarmActivity";

export default function AlarmScreen() {
    const router = useRouter();
    const removeConvexReminder = useMutation(api.reminders.remove);
    const params = useLocalSearchParams<{
        notificationId?: string;
        reminderId?: string;
        title?: string;
        description?: string;
        audioUrl?: string;
        frequency?: string;
        days?: string;
        time?: string;
        intervalDays?: string;
        snoozeEnabled?: string;
        snoozeDuration?: string;
        volume?: string;
        volumeStyle?: string;
        scheduledFor?: string;
        intervalMs?: string;
        anchorAt?: string;
        kind?: string;
        autoSnoozeCount?: string;
    }>();

    const [isPlaying, setIsPlaying] = useState(true);
    const [isHandlingAction, setIsHandlingAction] = useState(false);
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
        // Enhanced mount logging (pastebin Step 4.4)
        // NOTE: This /alarm route is DEBUG-ONLY. Production alarms use AlarmActivity -> AlarmRoot path.
        const scheduledFor = params.scheduledFor;
        const traceId = buildTraceId({ id: notificationId, data: { reminderId, kind: 'reminder_occurrence', scheduledFor } as any });
        vrLog('alarm_screen', 'mount', { 
            traceId,
            notificationId, 
            reminderId,
            canGoBack: router.canGoBack(),
            rootType: 'debug_route',
            component: '/alarm',
            note: 'DEBUG_ONLY_DO_NOT_USE_IN_PRODUCTION',
        });
        logAlarmLifecycle('screen_mount', { traceId, notificationId, reminderId, source: 'alarm.tsx' });
        void logAppTaskState('alarm_screen_mount');
        
        isMountedRef.current = true;
        isExplicitDismissRef.current = false;

        // Start audio playback loop
        startAudioLoop();

        // Start vibration pattern
        startVibration();

        return () => {
            vrLog('alarm_screen', 'unmount', { traceId, notificationId, reminderId, isExplicitDismiss: isExplicitDismissRef.current });
            isMountedRef.current = false;

            // Only stop audio if this is an explicit user action (dismiss/snooze)
            // This prevents audio stopping on navigation churn / React strict mode remounts
            if (isExplicitDismissRef.current) {
                stopAudio();
            } else {
                vrLog('alarm_screen', 'cleanup_skip_audio_stop', { traceId, notificationId, reason: 'not_explicit_dismiss' });
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
        const success = await alarmAudioService.ensurePlaying(audioPath, {
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
        if (isMountedRef.current) {
            setIsPlaying(false);
        }
        console.log("[VR] Alarm audio stopped");
    };

    const closeAlarmScreen = () => {
        const canGoBack = router.canGoBack();
        console.log(`[VR] close_alarm canGoBack=${canGoBack} platform=${Platform.OS}`);
        if (canGoBack) {
            console.log(`[VR] close_alarm action=router.back`);
            router.back();
        } else {
            // If this alarm was launched into a dedicated AlarmActivity, don't
            // navigate to the normal app UI inside that activity.
            if (Platform.OS === "android") {
                console.log(`[VR] close_alarm action=exitApp`);
                BackHandler.exitApp();
                return;
            }
            console.log(`[VR] close_alarm action=replace_home`);
            router.replace("/");
        }
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
        if (isHandlingAction) return;
        setIsHandlingAction(true);
        try {
            isExplicitDismissRef.current = true;
            await stopAudio();
            stopVibration();

            // Cancel the notification
            if (notificationId) {
                await notifee.cancelNotification(notificationId);
            }
            await cancelDisplayedAlarmNotifications(notificationId);
            await clearPendingAlarm();

            // Record completion in history (per occurrence if available)
            if (reminderId) {
                try {
                    const store = useReminderStore.getState();
                    const reminder = store.getReminderById(reminderId);
                    if (reminder) {
                        const scheduledForRaw = params.scheduledFor ? Number(params.scheduledFor) : undefined;
                        const scheduledFor = Number.isFinite(scheduledForRaw as number)
                            ? (scheduledForRaw as number)
                            : undefined;
                        await store.recordCompletion(reminderId, reminder.title, "completed", {
                            scheduledFor,
                            action: "dismissed",
                        });

                        // One-time reminders become inactive after dismiss.
                        if (reminder.frequency === "once") {
                            await removeReminderFully(reminderId, {
                                removeConvexById: async (id) => {
                                    await removeConvexReminder({ id: id as any });
                                },
                            });
                        }
                    }
                } catch (e) {
                    console.log("[VR] Failed to record completion:", e);
                }
            }

            // Close the alarm screen
            closeAlarmScreen();
        } finally {
            if (isMountedRef.current) {
                setIsHandlingAction(false);
            }
        }
    };

    const handleSnooze = async () => {
        if (isHandlingAction) return;
        setIsHandlingAction(true);
        try {
            isExplicitDismissRef.current = true;
            await stopAudio();
            stopVibration();

            // Cancel current notification
            if (notificationId) {
                await notifee.cancelNotification(notificationId);
            }
            await cancelDisplayedAlarmNotifications(notificationId);
            await clearPendingAlarm();

            if (!snoozeEnabled || !reminderId) {
                closeAlarmScreen();
                return;
            }

            const store = useReminderStore.getState();
            const reminder = store.getReminderById(reminderId);
            const audioUrl = params.audioUrl || reminder?.audioUrl || "";
            const frequency = params.frequency || reminder?.frequency || "once";
            const time = params.time || reminder?.time || "";
            const days = params.days || reminder?.days?.join(",") || "";
            const intervalDays =
                (params.intervalDays ? Number(params.intervalDays) : undefined) ?? reminder?.intervalDays;

            const channelId = `reminder_${reminderId}`;
            const triggerTimestamp = Date.now() + snoozeDurationMinutes * 60_000;
            const trigger: TimestampTrigger = {
                type: TriggerType.TIMESTAMP,
                timestamp: triggerTimestamp,
                alarmManager: { type: AlarmType.SET_ALARM_CLOCK },
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
                        visibility: AndroidVisibility.PUBLIC,
                        autoCancel: false,
                        lightUpScreen: true,
                        fullScreenAction: { id: "default", launchActivity: ANDROID_ALARM_ACTIVITY },
                        pressAction: { id: "default", launchActivity: ANDROID_ALARM_ACTIVITY },
                    },
                    data: {
                        reminderId,
                        frequency,
                        time,
                        days,
                        intervalDays: String(intervalDays ?? ""),
                        title,
                        description,
                        audioUrl,
                        snoozeEnabled: String(snoozeEnabled),
                        snoozeDuration: String(snoozeDurationMinutes),
                        volume: String(targetVolume),
                        volumeStyle: String(params.volumeStyle ?? "standard"),
                        kind: "snooze_occurrence",
                        originalScheduledFor: params.scheduledFor ?? "",

                        // Preserve interval metadata so repeated snoozes can still do collision suppression
                        intervalMs: String(params.intervalMs ?? ""),
                        anchorAt: String(params.anchorAt ?? ""),
                        scheduledFor: String(triggerTimestamp),
                        autoSnoozeCount: String(params.autoSnoozeCount ?? "0"),
                    },
                },
                trigger
            );

            // Snooze collision suppression for interval reminders:
            // if the cadence would fire during snooze, cancel those and schedule the next cadence after snooze.
            const intervalMs = params.intervalMs ? Number(params.intervalMs) : undefined;
            const anchorAt = params.anchorAt ? Number(params.anchorAt) : undefined;
            const volumeStyle = params.volumeStyle ?? "standard";
            if (intervalMs && anchorAt) {
                try {
                    const scheduledIds = await notifee.getTriggerNotificationIds();
                    const reminderPrefix = `reminder_${reminderId}_`;
                    const toCancel = scheduledIds.filter((id) => id.startsWith(reminderPrefix));

                    for (const id of toCancel) {
                        const parts = id.split("_");
                        const maybeTs = parts[parts.length - 1];
                        const ts = Number(maybeTs);
                        if (Number.isFinite(ts) && ts <= triggerTimestamp) {
                            await notifee.cancelNotification(id);
                        }
                    }

                    const { scheduledFor: nextTrigger } = getNextIntervalOccurrence(
                        anchorAt,
                        intervalMs,
                        triggerTimestamp
                    );

                    const nextTriggerSafe = nextTrigger <= Date.now() ? Date.now() + 5000 : nextTrigger;
                    const nextId = `reminder_${reminderId}_${nextTriggerSafe}`;
                    const nextTriggerObj: TimestampTrigger = {
                        type: TriggerType.TIMESTAMP,
                        timestamp: nextTriggerSafe,
                        alarmManager: { type: AlarmType.SET_ALARM_CLOCK },
                    };

                    await notifee.createTriggerNotification(
                        {
                            id: nextId,
                            title,
                            body: description,
                            android: {
                                channelId,
                                importance: AndroidImportance.HIGH,
                                category: AndroidCategory.ALARM,
                                visibility: AndroidVisibility.PUBLIC,
                                autoCancel: false,
                                lightUpScreen: true,
                                fullScreenAction: { id: "default", launchActivity: ANDROID_ALARM_ACTIVITY },
                                pressAction: { id: "default", launchActivity: ANDROID_ALARM_ACTIVITY },
                            },
                            data: {
                                reminderId,
                                frequency: "interval",
                                title,
                                description,
                                audioUrl,
                                snoozeEnabled: String(snoozeEnabled),
                                snoozeDuration: String(snoozeDurationMinutes),
                                volume: String(targetVolume),
                                volumeStyle: String(volumeStyle),
                                intervalMs: String(intervalMs),
                                anchorAt: String(anchorAt),
                                scheduledFor: String(nextTriggerSafe),
                                kind: "reminder_occurrence",
                            },
                        },
                        nextTriggerObj
                    );
                } catch (e) {
                    console.log("[VR] Failed interval snooze collision suppression:", e);
                }
            }

            // Close the alarm screen
            closeAlarmScreen();
        } finally {
            if (isMountedRef.current) {
                setIsHandlingAction(false);
            }
        }
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
