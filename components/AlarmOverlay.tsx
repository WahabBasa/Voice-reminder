import { useEffect, useMemo, useRef, useState } from "react";
import {
  BackHandler,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  Vibration,
  Dimensions,
  Platform,
  NativeModules,
} from "react-native";
import notifee, {
  AndroidCategory,
  AndroidImportance,
  AndroidLaunchActivityFlag,
  AndroidVisibility,
  AlarmType,
  TriggerType,
  TimestampTrigger,
} from "@notifee/react-native";
import * as FileSystem from "expo-file-system/legacy";
import { useMutation } from "convex/react";
import { api } from "../convex/_generated/api";
import {
  cancelDisplayedAlarmNotifications,
  markPendingAlarmUiShown,
} from "../lib/notifications";
import {
  NAG_DELAY_MINUTES,
  ROUTINE_SECOND_UTTERANCE_GAP_MS,
  parseNagCount,
  ringCadenceMode,
  shouldNagAgain,
} from "../lib/notificationDecisions";
import { buildTraceId } from "../lib/vrLog";
import AppIcon from "../components/AppIcon";
import { colors, scaleFontSize } from "../lib/theme";
import { alarmAudioService } from "../lib/AudioService";
import { getNextIntervalOccurrence } from "../lib/time";
import { useReminderStore } from "../lib/store";
import { removeReminderFully } from "../lib/reminderRemoval";
import { getDeviceId } from "../lib/deviceId";
import { vrLog, logAlarmLifecycle } from "../lib/vrLog";
import { logAppTaskState } from "../lib/activityControl";

const { width, height } = Dimensions.get("window");
const ANDROID_ALARM_ACTIVITY = "com.wahabbasa.VoiceReminder.AlarmActivity";

export interface AlarmOverlayProps {
  notificationId: string;
  reminderId: string;
  title: string;
  description: string;
  audioUrl: string;
  frequency: string;
  days: string;
  time: string;
  intervalDays: string;
  volume: string;
  volumeStyle: string;
  scheduledFor: string;
  intervalMs: string;
  anchorAt: string;
  kind: string;
  autoSnoozeCount: string;
  // Ring tier (OLD-53); optional stringly-typed data fields. The replay-variant
  // fields that used to sit here went with the variants themselves (OLD-108) —
  // an occurrence has one spoken line, so there is nothing to select between.
  urgency?: string;
  persistent?: string;
  /** Comebacks already delivered for this occurrence (OLD-96). */
  nagCount?: string;
  onDismiss: () => Promise<void>;
  onSnooze: () => Promise<void>;
  shouldExitOnResolve?: boolean;
}

export function AlarmOverlay({
  notificationId,
  reminderId,
  title,
  description,
  audioUrl,
  frequency,
  days,
  time,
  intervalDays,
  volume: volumeStr,
  volumeStyle: volumeStyleStr,
  scheduledFor,
  intervalMs,
  anchorAt,
  kind,
  autoSnoozeCount,
  urgency = "",
  persistent = "false",
  nagCount: nagCountStr = "0",
  onDismiss,
  onSnooze,
  shouldExitOnResolve = false,
}: AlarmOverlayProps) {
  const removeConvexReminder = useMutation(api.reminders.remove);

  const [isPlaying, setIsPlaying] = useState(true);
  const [isHandlingAction, setIsHandlingAction] = useState(false);
  const vibrationIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const cadenceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const cadenceStoppedRef = useRef(false);
  const isMountedRef = useRef(true);
  const isExplicitDismissRef = useRef(false);

  const targetVolume = Math.max(0, Math.min(1, Number(volumeStr) || 1));

  // The spoken line for this occurrence. Every ring of a reminder — the
  // occurrence and every nag comeback — says the same thing (OLD-96/OLD-108),
  // so this is just the description.
  const displayLine = description;

  useEffect(() => {
    // Enhanced mount logging (pastebin Step 4.4)
    const traceId = buildTraceId({ id: notificationId, data: { reminderId, kind, scheduledFor } as any });
    vrLog('alarm_overlay', 'mount', { 
      traceId,
      notificationId, 
      reminderId,
      rootType: 'AlarmOverlay_component',
      source: kind?.includes('snooze') ? 'snooze' : 'reminder',
    });
    logAlarmLifecycle('overlay_mount', { traceId, notificationId, reminderId, source: 'AlarmOverlay' });
    void logAppTaskState('alarm_overlay_mount');
    
    isMountedRef.current = true;
    isExplicitDismissRef.current = false;

    // Mark UI as shown immediately after mount
    markPendingAlarmUiShown(notificationId).catch(() => {
      // ignore errors
    });

    startAudioLoop();
    startVibration();

    return () => {
      vrLog('alarm_overlay', 'unmount', {
        traceId,
        notificationId,
        reminderId,
        isExplicitDismiss: isExplicitDismissRef.current
      });
      isMountedRef.current = false;

      // This instance's cadence must never fire after unmount; a remount
      // starts its own cadence with fresh refs.
      cadenceStoppedRef.current = true;
      clearCadenceTimer();

      if (isExplicitDismissRef.current) {
        stopAudio();
      } else {
        vrLog('alarm_overlay', 'cleanup_skip_audio_stop', {
          traceId,
          notificationId,
          reason: 'not_explicit_dismiss'
        });
      }
      stopVibration();
    };
  }, [notificationId]);

  const startAudioLoop = async () => {
    console.log("[VR] ========== ALARM OVERLAY AUDIO START ==========");
    console.log("[VR] Target volume:", targetVolume);
    console.log("[VR] Reminder ID:", reminderId);

    const audioPath = `${FileSystem.documentDirectory}reminder_${reminderId}.mp3`;
    console.log("[VR] Audio path:", audioPath);

    // Check if file exists before playing
    let fileInfo = await FileSystem.getInfoAsync(audioPath);
    console.log(`[VR] Audio file check: exists=${fileInfo.exists}, size=${fileInfo.exists ? (fileInfo as any).size : 'N/A'}`);

    // If file is missing or empty, try to download it
    if (!fileInfo.exists || !(fileInfo as any).size) {
      console.log("[VR] Audio file missing or empty, attempting download...");
      if (audioUrl) {
        try {
          console.log(`[VR] Downloading audio from: ${audioUrl}`);
          const downloadResult = await FileSystem.downloadAsync(audioUrl, audioPath);
          console.log(`[VR] Download complete: status=${downloadResult.status}`);

          // Re-check file after download
          fileInfo = await FileSystem.getInfoAsync(audioPath);
          console.log(`[VR] Post-download check: exists=${fileInfo.exists}, size=${fileInfo.exists ? (fileInfo as any).size : 'N/A'}`);
        } catch (downloadErr) {
          console.log("[VR] ❌ Failed to download audio:", downloadErr);
        }
      } else {
        console.log("[VR] No audioUrl provided, cannot download missing audio");
      }
    }

    // One reminder, one spoken line (OLD-108). The occurrence and every nag
    // comeback ring this same file — there is no per-rung playlist any more.
    const playableFileCount = fileInfo.exists && (fileInfo as any).size ? 1 : 0;

    // Cadence by tier — orchestrated here because this UI stays alive while
    // the alarm rings (headless JS does not; it only gets the degraded loop).
    const supportsOneShot =
      typeof alarmAudioService.supportsOneShotAlarmPlayback === "function" &&
      alarmAudioService.supportsOneShotAlarmPlayback();
    const mode = ringCadenceMode(urgency, playableFileCount, supportsOneShot);
    console.log(
      `[VR] Alarm cadence mode=${mode} files=${playableFileCount} urgency=${urgency || "(none)"} oneShot=${supportsOneShot}`
    );

    cadenceStoppedRef.current = false;
    const success =
      mode === "speak_twice"
        ? await playSpeakTwice(audioPath, 1)
        : await playContinuousLoop(audioPath);

    if (isMountedRef.current) {
      setIsPlaying(success);
    }
    if (success) {
      console.log("[VR] ✅ Alarm overlay audio playing");
    } else {
      console.log(`[VR] ❌ Failed to start alarm overlay audio. File exists=${fileInfo.exists}, size=${fileInfo.exists ? (fileInfo as any).size : 'N/A'}, audioUrl=${audioUrl ? 'present' : 'missing'}`);
    }
  };

  const clearCadenceTimer = () => {
    if (cadenceTimerRef.current) {
      clearTimeout(cadenceTimerRef.current);
      cadenceTimerRef.current = null;
    }
  };

  // Today's behavior: one file, native loop, rings until resolved/timeout.
  const playContinuousLoop = async (file: string): Promise<boolean> => {
    if (typeof alarmAudioService.ensurePlaying === "function") {
      return alarmAudioService.ensurePlaying(file, {
        volume: targetVolume,
        streamType: "alarm",
        loop: true,
      });
    }
    // Defensive fallback for stale singletons (Step 6B)
    console.log("[VR] ensurePlaying not available, using play() fallback");
    return alarmAudioService.play(file, {
      volume: targetVolume,
      streamType: "alarm",
      loop: true,
    });
  };

  // Routine tier: speak twice (~20s apart), then go silent. The notification
  // and this UI stay; the ring timeout still drives the follow-up ladder.
  const playSpeakTwice = async (file: string, utterance: number): Promise<boolean> => {
    if (cadenceStoppedRef.current || !isMountedRef.current) return false;
    const ok = await alarmAudioService.play(
      file,
      { volume: targetVolume, streamType: "alarm", loop: false },
      () => {
        if (cadenceStoppedRef.current || !isMountedRef.current) return;
        if (utterance >= 2) {
          if (isMountedRef.current) {
            setIsPlaying(false);
          }
          stopVibration();
          return;
        }
        clearCadenceTimer();
        cadenceTimerRef.current = setTimeout(() => {
          void playSpeakTwice(file, utterance + 1);
        }, ROUTINE_SECOND_UTTERANCE_GAP_MS);
      }
    );
    if (!ok) {
      return playContinuousLoop(file);
    }
    return true;
  };

  const stopAudio = async () => {
    console.log("[VR] Stopping alarm overlay audio...");
    cadenceStoppedRef.current = true;
    clearCadenceTimer();
    await alarmAudioService.stop();
    if (isMountedRef.current) {
      setIsPlaying(false);
    }
    console.log("[VR] Alarm overlay audio stopped");
  };

  const maybeExitApp = () => {
    // Exit logic is now handled by RootLayout via finishIfAlarmActivity()
    // This component only calls its callbacks - the parent decides whether to exit
    console.log(`[VR] close_alarm_overlay callback_invoked`);
  };

  const startVibration = () => {
    vibrationIntervalRef.current = setInterval(() => {
      Vibration.vibrate([0, 500, 200, 500]);
    }, 2000);
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

      if (notificationId) {
        await notifee.cancelNotification(notificationId);
      }
      await cancelDisplayedAlarmNotifications(notificationId);

      if (reminderId) {
        try {
          const store = useReminderStore.getState();
          const reminder = store.getReminderById(reminderId);
          if (reminder) {
            const scheduledForRaw = scheduledFor ? Number(scheduledFor) : undefined;
            const scheduledForNum = Number.isFinite(scheduledForRaw as number)
              ? (scheduledForRaw as number)
              : undefined;
            await store.recordCompletion(reminderId, reminder.title, "completed", {
              scheduledFor: scheduledForNum,
              action: "dismissed",
            });

            if (reminder.frequency === "once") {
              await removeReminderFully(reminderId, {
                removeConvexById: async (id) => {
                  await removeConvexReminder({ id: id as any, deviceId: await getDeviceId() });
                },
              });
            }
          }
        } catch (e) {
          console.log("[VR] Failed to record completion:", e);
        }
      }

      await onDismiss();
      maybeExitApp();
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

      if (notificationId) {
        await notifee.cancelNotification(notificationId);
      }
      await cancelDisplayedAlarmNotifications(notificationId);

      // "Later" in the overlay is the same gesture as swiping the ring away, so
      // it feeds the same nag chain (OLD-96): fixed NAG_DELAY_MINUTES, capped at
      // MAX_NAG_COMEBACKS, with nothing per-reminder to turn it off. Once the
      // chain is spent the alarm just goes quiet.
      const nagCount = parseNagCount(nagCountStr);
      if (!reminderId || !shouldNagAgain(nagCount)) {
        await onSnooze();
        maybeExitApp();
        return;
      }

      const store = useReminderStore.getState();
      const reminder = store.getReminderById(reminderId);
      const remAudioUrl = audioUrl || reminder?.audioUrl || "";
      const remFrequency = frequency || reminder?.frequency || "once";
      const remTime = time || reminder?.time || "";
      const remDays = days || reminder?.days?.join(",") || "";
      const remIntervalDays =
        (intervalDays ? Number(intervalDays) : undefined) ?? reminder?.intervalDays;

      const channelId = `reminder_${reminderId}`;
      const triggerTimestamp = Date.now() + NAG_DELAY_MINUTES * 60_000;
      const trigger: TimestampTrigger = {
        type: TriggerType.TIMESTAMP,
        timestamp: triggerTimestamp,
        alarmManager: { type: AlarmType.SET_ALARM_CLOCK },
      };

      await notifee.createTriggerNotification(
        {
          id: `snooze_${reminderId}_${Date.now()}`,
          title,
          body: displayLine,
          android: {
            channelId,
            importance: AndroidImportance.HIGH,
            category: AndroidCategory.ALARM,
            visibility: AndroidVisibility.PUBLIC,
            autoCancel: false,
            lightUpScreen: true,
            fullScreenAction: {
              id: "default",
              launchActivity: ANDROID_ALARM_ACTIVITY,
              launchActivityFlags: [AndroidLaunchActivityFlag.NEW_TASK],
            },
            pressAction: {
              id: "default",
              launchActivity: ANDROID_ALARM_ACTIVITY,
              launchActivityFlags: [AndroidLaunchActivityFlag.NEW_TASK],
            },
          },
          data: {
            reminderId,
            frequency: remFrequency,
            time: remTime,
            days: remDays,
            intervalDays: String(remIntervalDays ?? ""),
            title,
            description,
            audioUrl: remAudioUrl,
            volume: String(targetVolume),
            volumeStyle: String(volumeStyleStr ?? "standard"),
            kind: "snooze_occurrence",
            originalScheduledFor: scheduledFor ?? "",
            intervalMs: intervalMs ?? "",
            anchorAt: anchorAt ?? "",
            scheduledFor: String(triggerTimestamp),
            autoSnoozeCount: String(autoSnoozeCount ?? "0"),
            // The comeback speaks the identical take — same audio, same line —
            // and carries the incremented counter so the chain stays capped.
            urgency: urgency ?? "",
            persistent: persistent ?? "false",
            nagCount: String(nagCount + 1),
            nagReason: "later_action",
          },
        },
        trigger
      );

      const remIntervalMs = intervalMs ? Number(intervalMs) : undefined;
      const remAnchorAt = anchorAt ? Number(anchorAt) : undefined;
      if (remIntervalMs && remAnchorAt) {
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
            remAnchorAt,
            remIntervalMs,
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
                fullScreenAction: {
                  id: "default",
                  launchActivity: ANDROID_ALARM_ACTIVITY,
                  launchActivityFlags: [AndroidLaunchActivityFlag.NEW_TASK],
                },
                pressAction: {
                  id: "default",
                  launchActivity: ANDROID_ALARM_ACTIVITY,
                  launchActivityFlags: [AndroidLaunchActivityFlag.NEW_TASK],
                },
              },
              data: {
                reminderId,
                frequency: "interval",
                title,
                description,
                audioUrl: remAudioUrl,
                volume: String(targetVolume),
                volumeStyle: String(volumeStyleStr ?? "standard"),
                intervalMs: String(remIntervalMs),
                anchorAt: String(remAnchorAt),
                scheduledFor: String(nextTriggerSafe),
                kind: "reminder_occurrence",
                // Fresh occurrence: the nag chain starts over from zero.
                urgency: urgency ?? "",
                persistent: persistent ?? "false",
                nagCount: "0",
              },
            },
            nextTriggerObj
          );
        } catch (e) {
          console.log("[VR] Failed interval snooze collision suppression:", e);
        }
      }

      await onSnooze();
      maybeExitApp();
    } finally {
      if (isMountedRef.current) {
        setIsHandlingAction(false);
      }
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.content}>
        <View style={styles.iconContainer}>
          <View style={styles.iconCircle}>
            <AppIcon name="bell" size={48} color="white" />
          </View>
        </View>

        <Text style={styles.time}>
          {new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
        </Text>

        <Text style={styles.title}>{title}</Text>
        {displayLine ? <Text style={styles.description}>{displayLine}</Text> : null}

        {isPlaying && (
          <View style={styles.playingIndicator}>
            <AppIcon name="volume-2" size={20} color="rgba(255,255,255,0.7)" />
            <Text style={styles.playingText}>Playing...</Text>
          </View>
        )}
      </View>

      <View style={styles.actions}>
        <TouchableOpacity style={styles.snoozeButton} onPress={handleSnooze} activeOpacity={0.8}>
          <AppIcon name="clock" size={24} color="white" />
          <Text style={styles.snoozeText}>Later</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.dismissButton} onPress={handleDismiss} activeOpacity={0.8}>
          <AppIcon name="check" size={24} color="white" />
          <Text style={styles.dismissText}>Done</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "#1a1a2e",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 60,
    zIndex: 99999,
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
