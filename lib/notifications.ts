import notifee, {
  AndroidImportance,
  AndroidCategory,
  AndroidVisibility,
  TriggerType,
  TimestampTrigger,
  EventType,
  Event,
  AlarmType,
  AndroidAction,
} from "@notifee/react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";
import { alarmAudioService } from "./AudioService";
import {
  documentDirectory,
  downloadAsync,
  deleteAsync,
  getInfoAsync,
} from "expo-file-system/legacy";
import { getNextIntervalOccurrence, getNextTriggerTime, ReminderSchedule } from "./time";
import { Reminder, ReminderHistory, useReminderStore } from "./store";
// Note: Audio playback is handled by alarm screen (app/alarm.tsx)

export class ExactAlarmPermissionError extends Error {
  public readonly notificationSettings: any;

  constructor(message: string, notificationSettings: any) {
    super(message);
    this.name = "ExactAlarmPermissionError";
    this.notificationSettings = notificationSettings;
  }
}

const PENDING_ALARM_KEY = "@pending_alarm";
const ANDROID_ALARM_ACTIVITY = "com.wahabbasa.VoiceReminder.AlarmActivity";
const DISPLAYED_ALARM_KEY = "@displayed_alarm_id";

// Event type name mapping for readable logs
const EVENT_TYPE_NAMES: Record<number, string> = {
  [EventType.UNKNOWN]: "UNKNOWN",
  [EventType.DISMISSED]: "DISMISSED",
  [EventType.PRESS]: "PRESS",
  [EventType.ACTION_PRESS]: "ACTION_PRESS",
  [EventType.DELIVERED]: "DELIVERED",
  [EventType.APP_BLOCKED]: "APP_BLOCKED",
  [EventType.CHANNEL_BLOCKED]: "CHANNEL_BLOCKED",
  [EventType.CHANNEL_GROUP_BLOCKED]: "CHANNEL_GROUP_BLOCKED",
  [EventType.TRIGGER_NOTIFICATION_CREATED]: "TRIGGER_NOTIFICATION_CREATED",
};

export function eventTypeName(type: EventType): string {
  return EVENT_TYPE_NAMES[type] || `UNKNOWN(${type})`;
}

export function buildAlarmTrace(notification?: { id?: string; data?: Record<string, any> } | null): string {
  if (!notification) return "no_notification";
  const data = notification.data || {};
  const id = notification.id || "";
  const reminderId = data.reminderId || "";
  const scheduledFor = data.scheduledFor || "";
  const kind = data.kind || "";
  const reposted = data.__reposted || "0";
  return `${id}|${reminderId}|${scheduledFor}|${kind}|repost=${reposted}`;
}

type PendingAlarmNotification = {
  id?: string;
  title?: string;
  body?: string;
  data?: Record<string, any>;
};

export type PendingAlarm = {
  notification: PendingAlarmNotification;
  storedAt: number;
  handledAt?: number;
};

function toPendingNotification(notification?: PendingAlarmNotification | null): PendingAlarmNotification {
  if (!notification) return {};
  const data =
    notification.data && typeof notification.data === "object" ? notification.data : {};
  return {
    id: notification.id,
    title: notification.title,
    body: notification.body,
    data,
  };
}

export async function setPendingAlarm(
  notification?: PendingAlarmNotification | null
): Promise<void> {
  if (!notification?.id) return;
  const payload: PendingAlarm = {
    notification: toPendingNotification(notification),
    storedAt: Date.now(),
  };
  try {
    await AsyncStorage.setItem(PENDING_ALARM_KEY, JSON.stringify(payload));
    const data = notification.data || {};
    console.log(`[VR] pending_set id=${notification.id} kind=${data.kind || ""} repost=${data.__reposted || "0"}`);
  } catch (e) {
    console.log("[VR] Failed to persist pending alarm:", e);
  }
}

export async function getPendingAlarm(): Promise<PendingAlarm | null> {
  try {
    const raw = await AsyncStorage.getItem(PENDING_ALARM_KEY);
    if (!raw) {
      console.log(`[VR] pending_get id=null`);
      return null;
    }
    const parsed = JSON.parse(raw) as PendingAlarm;
    if (!parsed?.notification?.id) {
      console.log(`[VR] pending_get id=null (invalid)`);
      return null;
    }
    console.log(`[VR] pending_get id=${parsed.notification.id} handledAt=${parsed.handledAt || "none"}`);
    return parsed;
  } catch (e) {
    console.log("[VR] Failed to read pending alarm:", e);
    return null;
  }
}

export async function markPendingAlarmHandled(notificationId?: string): Promise<void> {
  if (!notificationId) return;
  try {
    const raw = await AsyncStorage.getItem(PENDING_ALARM_KEY);
    if (!raw) return;
    const pending = JSON.parse(raw) as PendingAlarm;
    if (pending?.notification?.id !== notificationId) return;
    if (pending.handledAt) return;
    pending.handledAt = Date.now();
    await AsyncStorage.setItem(PENDING_ALARM_KEY, JSON.stringify(pending));
    console.log(`[VR] pending_handled id=${notificationId}`);
  } catch (e) {
    console.log("[VR] Failed to mark pending alarm handled:", e);
  }
}

export async function clearPendingAlarm(): Promise<void> {
  try {
    await AsyncStorage.removeItem(PENDING_ALARM_KEY);
    console.log(`[VR] pending_clear`);
  } catch (e) {
    console.log("[VR] Failed to clear pending alarm:", e);
  }
}

// Track displayed alarm notifications for cancel+repost lifecycle
export async function setDisplayedAlarm(notificationId: string): Promise<void> {
  try {
    await AsyncStorage.setItem(DISPLAYED_ALARM_KEY, notificationId);
  } catch (e) {
    console.log("[VR] Failed to set displayed alarm:", e);
  }
}

export async function getDisplayedAlarm(): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(DISPLAYED_ALARM_KEY);
  } catch (e) {
    console.log("[VR] Failed to get displayed alarm:", e);
    return null;
  }
}

export async function clearDisplayedAlarm(): Promise<void> {
  try {
    await AsyncStorage.removeItem(DISPLAYED_ALARM_KEY);
  } catch (e) {
    console.log("[VR] Failed to clear displayed alarm:", e);
  }
}

export async function cancelDisplayedAlarmNotifications(
  currentNotificationId?: string
): Promise<void> {
  const ids = new Set<string>();
  if (currentNotificationId) ids.add(currentNotificationId);

  const stored = await getDisplayedAlarm();
  if (stored) ids.add(stored);

  for (const id of ids) {
    try {
      await notifee.cancelDisplayedNotification(id);
    } catch {
      // ignore
    }
  }

  await clearDisplayedAlarm();
}

function isAndroidAlarmEnabled(value: any): boolean {
  // notifee returns a platform-specific value; treat common "enabled" representations as truthy.
  if (value === true) return true;
  if (value === 1) return true;
  if (value === "1") return true;
  if (value === "enabled") return true;
  if (value === "ENABLED") return true;
  if (value === "allowed") return true;
  if (value === "ALLOWED") return true;
  return false;
}

export async function getNotificationSettingsSafe(): Promise<any> {
  try {
    return await notifee.getNotificationSettings();
  } catch (e) {
    console.log("[VR] getNotificationSettings failed:", e);
    return null;
  }
}

export async function openAlarmPermissionSettingsSafe(): Promise<void> {
  try {
    const fn = (notifee as any).openAlarmPermissionSettings;
    if (typeof fn === "function") {
      await fn();
      return;
    }
    console.log("[VR] notifee.openAlarmPermissionSettings is not available");
  } catch (e) {
    console.log("[VR] Failed to open alarm permission settings:", e);
  }
}

export async function openNotificationSettingsSafe(): Promise<void> {
  try {
    const fn = (notifee as any).openNotificationSettings;
    if (typeof fn === "function") {
      await fn();
      return;
    }
    console.log("[VR] notifee.openNotificationSettings is not available");
  } catch (e) {
    console.log("[VR] Failed to open notification settings:", e);
  }
}

async function assertAndroidExactAlarmAccess(): Promise<void> {
  if (Platform.OS !== "android") return;
  // Android 12+ (API 31+) requires "Alarms & reminders" special access for exact alarms.
  const apiLevel = typeof Platform.Version === "number" ? Platform.Version : Number(Platform.Version);
  if (!Number.isFinite(apiLevel) || apiLevel < 31) return;

  const settings = await getNotificationSettingsSafe();
  const alarmValue = settings?.android?.alarm;
  if (!isAndroidAlarmEnabled(alarmValue)) {
    throw new ExactAlarmPermissionError(
      "Alarms & reminders permission is required on Android 12+.",
      settings
    );
  }
}

export interface ReminderNotification {
  id: string;
  title: string;
  description: string;
  time: string;
  date?: string; // YYYY-MM-DD for one-time reminders on specific days
  frequency: string;
  days?: string[];
  audioUrl: string;
  snoozeEnabled?: boolean;
  snoozeDuration?: number; // minutes
  volume?: number; // 0-1
  volumeStyle?: "standard" | "progressive";

  // Interval recurrence
  intervalMs?: number;
  anchorAt?: number;
  intervalDays?: number;
  scheduledFor?: number;
}

function getLocalAudioPath(reminderId: string): string {
  return `${documentDirectory}reminder_${reminderId}.mp3`;
}

export async function downloadReminderAudio(
  reminderId: string,
  audioUrl: string
): Promise<string> {
  const localPath = getLocalAudioPath(reminderId);

  // Check if file already exists locally (skip download)
  const existingFile = await getInfoAsync(localPath);
  if (existingFile.exists && existingFile.size > 0) {
    console.log(`[VR] Audio already exists locally: ${localPath} (${existingFile.size} bytes)`);
    return localPath;
  }

  console.log(`[VR] Downloading audio from ${audioUrl}`);
  console.log(`[VR] Saving to: ${localPath}`);
  const result = await downloadAsync(audioUrl, localPath);
  console.log(`[VR] Download complete, status: ${result.status}, size: ${result.headers?.["content-length"] || "unknown"}`);

  // Verify file exists
  const fileInfo = await getInfoAsync(localPath);
  console.log(`[VR] Saved file exists: ${fileInfo.exists}, size: ${fileInfo.exists ? fileInfo.size : "N/A"}`);

  return localPath;
}

export async function deleteLocalAudio(reminderId: string): Promise<void> {
  const localPath = getLocalAudioPath(reminderId);
  try {
    await deleteAsync(localPath, { idempotent: true });
  } catch (e) {
    console.log("[VR] Failed to delete local audio:", e);
  }
}

export async function requestNotificationPermission(): Promise<boolean> {
  const settings = await notifee.requestPermission();
  return settings.authorizationStatus >= 1;
}

export async function createReminderChannel(
  reminderId: string,
  title: string,
  _soundPath: string
): Promise<string> {
  const channelId = `reminder_${reminderId}`;

  // Android channels are immutable; if this channel existed from a previous install/version,
  // its importance/pop-up behavior may prevent full-screen intents. Recreate it to apply
  // our intended alarm settings.
  if (Platform.OS === "android") {
    try {
      await notifee.deleteChannel(channelId);
    } catch {
      // ignore
    }
  }

  await notifee.createChannel({
    id: channelId,
    name: `Reminder: ${title}`,
    importance: AndroidImportance.HIGH,
    // Audible fallback so users notice delivery even if alarm UI can't open.
    // Note: Android channels are immutable once created; a reinstall (or deleting the channel) may be required to apply changes.
    sound: "default",
    bypassDnd: true,
    vibration: true,
  });

  return channelId;
}

export async function scheduleReminder(
  reminder: ReminderNotification,
  _options?: { traceId?: string }
): Promise<{ triggerTimestamp: number; notificationId: string }> {
  const hasPermission = await requestNotificationPermission();
  if (!hasPermission) {
    throw new Error("Notification permission not granted");
  }

  await assertAndroidExactAlarmAccess();

  // Download audio to device
  const localAudioPath = await downloadReminderAudio(reminder.id, reminder.audioUrl);

  // Create channel with custom sound
  const channelId = await createReminderChannel(
    reminder.id,
    reminder.title,
    localAudioPath
  );

  // Calculate next trigger time
  let triggerTimestamp: number;

  if (reminder.frequency === "interval" && reminder.anchorAt && reminder.intervalMs) {
    if (reminder.scheduledFor && reminder.scheduledFor > Date.now()) {
      triggerTimestamp = reminder.scheduledFor;
    } else {
      const { scheduledFor } = getNextIntervalOccurrence(
        reminder.anchorAt,
        reminder.intervalMs,
        Date.now()
      );
      triggerTimestamp = scheduledFor;
    }
  } else {
    const schedule: ReminderSchedule = {
      time: reminder.time,
      date: reminder.date,
      frequency: reminder.frequency,
      days: reminder.days,
      intervalDays: reminder.intervalDays,
      scheduledFor: reminder.scheduledFor,
    };
    triggerTimestamp = getNextTriggerTime(schedule);
  }

  // Safety check: Notifee requires timestamp to be in the future
  // If calculated time is in the past, schedule for 5 seconds from now
  const now = Date.now();
  if (triggerTimestamp <= now) {
    console.warn(`[VR] Trigger time ${new Date(triggerTimestamp).toLocaleString()} is in the past, adjusting to now + 5s`);
    triggerTimestamp = now + 5000;
  }

  const trigger: TimestampTrigger = {
    type: TriggerType.TIMESTAMP,
    timestamp: triggerTimestamp,
    alarmManager: {
      type: AlarmType.SET_ALARM_CLOCK, // Use AlarmClock for lockscreen reliability
    },
  };

  const notificationId = `reminder_${reminder.id}_${triggerTimestamp}`;

  // Define notification action buttons for lockscreen use
  const actions: AndroidAction[] = [
    {
      title: 'Dismiss',
      pressAction: {
        id: 'dismiss_action',
      },
    },
    {
      title: 'Snooze 5m',
      pressAction: {
        id: 'snooze_action',
      },
    },
  ];

  await notifee.createTriggerNotification(
    {
      id: notificationId,
      title: reminder.title,
      body: reminder.description,
      android: {
        channelId,
        importance: AndroidImportance.HIGH,
        category: AndroidCategory.ALARM,
        visibility: AndroidVisibility.PUBLIC,
        autoCancel: false,
        lightUpScreen: true,
        actions,
        pressAction: {
          id: "default",
          launchActivity: ANDROID_ALARM_ACTIVITY,
        },
        // Show the alarm UI immediately when the trigger fires (Android).
        // Requires `android.permission.USE_FULL_SCREEN_INTENT` in AndroidManifest.xml.
        fullScreenAction: {
          id: "default",
          launchActivity: ANDROID_ALARM_ACTIVITY,
        },
      },
      data: {
        reminderId: reminder.id,
        frequency: reminder.frequency,
        time: reminder.time,
        days: reminder.days?.join(",") || "",
        title: reminder.title,
        description: reminder.description,
        audioUrl: reminder.audioUrl,
        snoozeEnabled: String(reminder.snoozeEnabled ?? true),
        snoozeDuration: String(reminder.snoozeDuration ?? 5),
        volume: String(reminder.volume ?? 1),
        volumeStyle: reminder.volumeStyle ?? "standard",

        intervalMs: String(reminder.intervalMs ?? ""),
        anchorAt: String(reminder.anchorAt ?? ""),
        intervalDays: String(reminder.intervalDays ?? ""),
        scheduledFor: String(triggerTimestamp),
        kind: "reminder_occurrence",
      },
    },
    trigger
  );

  console.log(
    `[VR] Scheduled notification for ${new Date(triggerTimestamp).toLocaleString()}`
  );

  return { triggerTimestamp, notificationId };
}

export async function cancelReminder(reminderId: string): Promise<void> {
  const channelId = `reminder_${reminderId}`;

  // Cancel all scheduled notifications for this reminder (occurrence + snooze)
  const scheduledIds = await notifee.getTriggerNotificationIds();
  const toCancel = scheduledIds.filter(
    (id) => id.startsWith(`reminder_${reminderId}_`) || id.startsWith(`snooze_${reminderId}_`)
  );

  for (const id of toCancel) {
    await notifee.cancelNotification(id);
  }

  // Delete the channel
  await notifee.deleteChannel(channelId);

  // Note: NOT deleting local audio file here - it's needed for rescheduling
  // Audio is only deleted when reminder is fully deleted via deleteReminderWithAudio()

  console.log(`[VR] Cancelled ${toCancel.length} notifications for reminder ${reminderId}`);
}

// Use this when fully deleting a reminder (not just rescheduling)
export async function deleteReminderWithAudio(reminderId: string): Promise<void> {
  await cancelReminder(reminderId);
  await deleteLocalAudio(reminderId);
  console.log(`[VR] Deleted reminder ${reminderId} with audio`);
}

export async function handleNotificationEvent(event: Event): Promise<void> {
  const { type, detail } = event;
  const trace = buildAlarmTrace(detail.notification);
  console.log(`[VR] handleEvent type=${eventTypeName(type)} trace=${trace}`);

  const notificationData = detail.notification?.data;
  const kind = typeof notificationData?.kind === "string" ? (notificationData.kind as string) : "";
  const reminderId =
    typeof notificationData?.reminderId === "string" ? (notificationData.reminderId as string) : "";
  const notificationId = detail.notification?.id || "";

  const shouldHandleAsAlarm =
    Boolean(reminderId) && (kind === "reminder_occurrence" || kind === "snooze_occurrence");

  const repostFlag = (notificationData as any)?.__reposted;
  const isRepostedFlag = repostFlag === "1" || repostFlag === 1 || repostFlag === true;
  const isAlarmDisplayNotification =
    typeof notificationId === "string" && notificationId.startsWith("alarm_display_");
  const isRepostNotification = isAlarmDisplayNotification || isRepostedFlag;

  console.log(`[VR] handleEvent_flags alarm=${shouldHandleAsAlarm} repostFlag=${isRepostedFlag} alarmDisplayId=${isAlarmDisplayNotification} isRepost=${isRepostNotification}`);

  if (type === EventType.DELIVERED && shouldHandleAsAlarm && !isRepostNotification) {
    await setPendingAlarm(detail.notification as PendingAlarmNotification);
  }

  async function startAlarmAudioIfPossible(): Promise<void> {
    if (!shouldHandleAsAlarm) return;
    if (Platform.OS !== "android") return;

    const localAudioPath = getLocalAudioPath(reminderId);
    try {
      const fileInfo = await getInfoAsync(localAudioPath);
      if (!fileInfo.exists || !fileInfo.size) {
        console.log("[VR] Alarm audio file missing, skipping playback:", localAudioPath);
        return;
      }
    } catch (e) {
      console.log("[VR] Failed to stat alarm audio file:", e);
      return;
    }

    const rawVolume = Number(notificationData?.volume ?? "1");
    const targetVolume = Math.max(0, Math.min(1, Number.isFinite(rawVolume) ? rawVolume : 1));

    const ok = await alarmAudioService.play(localAudioPath, {
      volume: targetVolume,
      streamType: "alarm",
      loop: true,
    });
    if (!ok) {
      console.log("[VR] Alarm audio playback failed to start");
    }
  }

  async function stopAlarmAudioIfPlaying(): Promise<void> {
    if (!shouldHandleAsAlarm) return;
    try {
      await alarmAudioService.stop();
    } catch (e) {
      console.log("[VR] Failed to stop alarm audio:", e);
    }
  }

  if (type === EventType.DISMISSED) {
    if (shouldHandleAsAlarm) {
      await clearPendingAlarm();
      await cancelDisplayedAlarmNotifications(notificationId);
    }
    await stopAlarmAudioIfPlaying();
    return;
  }

  // Handle notification action buttons (Dismiss/Snooze from lockscreen)
  if (type === EventType.ACTION_PRESS) {
    const actionId = detail.pressAction?.id;
    console.log(`[VR] Action pressed: ${actionId}`);

    if (shouldHandleAsAlarm) {
      await clearPendingAlarm();
    }
    await stopAlarmAudioIfPlaying();

    await cancelDisplayedAlarmNotifications(notificationId);

    // Handle dismiss action
    if (actionId === "dismiss_action" && reminderId) {
      console.log("[VR] Dismiss action from notification");
      // Record completion and handle one-time reminders
      const { useReminderStore } = await import("./store");
      const store = useReminderStore.getState();
      const reminder = store.getReminderById(reminderId);
      if (reminder) {
        await store.recordCompletion(reminderId, reminder.title, "completed", {
          action: "dismissed",
        });
        // Remove one-time reminders fully
        if (reminder.frequency === "once") {
          const { removeReminderFully } = await import("./reminderRemoval");
          await removeReminderFully(reminderId);
        }
      }
      return;
    }

    // Handle snooze action
    if (actionId === "snooze_action" && reminderId) {
      console.log("[VR] Snooze action from notification");
      const snoozeDuration = Number(notificationData?.snoozeDuration ?? "5") || 5;
      const triggerTimestamp = Date.now() + snoozeDuration * 60_000;
      const channelId = `reminder_${reminderId}`;
      const title = (notificationData?.title as string) || "Reminder";
      const body = (notificationData?.description as string) || "";

      const trigger: TimestampTrigger = {
        type: TriggerType.TIMESTAMP,
        timestamp: triggerTimestamp,
        alarmManager: { type: AlarmType.SET_ALARM_CLOCK },
      };

      await notifee.createTriggerNotification(
        {
          id: `snooze_${reminderId}_${Date.now()}`,
          title,
          body,
          android: {
            channelId,
            importance: AndroidImportance.HIGH,
            category: AndroidCategory.ALARM,
            visibility: AndroidVisibility.PUBLIC,
            autoCancel: false,
            lightUpScreen: true,
            actions: [
              { title: "Dismiss", pressAction: { id: "dismiss_action" } },
              { title: "Snooze 5m", pressAction: { id: "snooze_action" } },
            ],
            fullScreenAction: { id: "default", launchActivity: ANDROID_ALARM_ACTIVITY },
            pressAction: { id: "default", launchActivity: ANDROID_ALARM_ACTIVITY },
          },
          data: {
            ...notificationData,
            kind: "snooze_occurrence",
            scheduledFor: String(triggerTimestamp),
            // Preserve essential fields for snooze to work properly
            audioUrl: notificationData?.audioUrl || "",
            frequency: notificationData?.frequency || "once",
            originalScheduledFor: notificationData?.scheduledFor || "",
          },
        },
        trigger
      );
      console.log(`[VR] Snoozed for ${snoozeDuration} minutes`);
      return;
    }

    return;
  }

  if (type === EventType.DELIVERED) {
    console.log(`[VR] DELIVERED processing trace=${trace}`);
    const data = notificationData;

    const isTriggerNotification =
      typeof notificationId === "string" &&
      (notificationId.startsWith("reminder_") || notificationId.startsWith("snooze_"));

    // Ignore reposted "alarm_display_*" notifications for alarm lifecycle processing.
    // They exist only to deliver full-screen UI reliably and can otherwise cause loops/duplicate reschedules.
    if (shouldHandleAsAlarm && isRepostNotification) {
      console.log(`[VR] delivered_ignore reason=reposted id=${notificationId} repostFlag=${isRepostedFlag} alarmDisplayId=${isAlarmDisplayNotification}`);
      return;
    }

    // Cancel+repost lifecycle: cancel any previously displayed alarm to ensure
    // full-screen intent can trigger (many devices block full-screen if channel has uncleared notifications)
    if (shouldHandleAsAlarm && isTriggerNotification && !isRepostNotification) {
      const previouslyDisplayed = await getDisplayedAlarm();
      if (previouslyDisplayed && previouslyDisplayed !== notificationId) {
        console.log("[VR] Cancelling previous displayed alarm:", previouslyDisplayed);
        try {
          await notifee.cancelDisplayedNotification(previouslyDisplayed);
        } catch {
          // ignore
        }
      }

      // Repost as a fresh displayed notification with full-screen action
      // This ensures the alarm UI can show over lockscreen
      try {
        // Cancel the delivered trigger notification first
        if (notificationId) {
          try {
            await notifee.cancelDisplayedNotification(notificationId);
          } catch {
            // ignore
          }
        }

        // Use a different ID for the reposted notification to avoid confusion.
        // Make it unique per occurrence so Android treats it as a fresh notification.
        const scheduledForKey =
          typeof (data as any)?.scheduledFor === "string" && (data as any).scheduledFor
            ? String((data as any).scheduledFor)
            : String(Date.now());
        const repostId = `alarm_display_${reminderId}_${scheduledForKey}`;
        console.log(`[VR] repost_create from=${notificationId} to=${repostId} scheduledFor=${scheduledForKey}`);

        await notifee.displayNotification({
          id: repostId,
          title: detail.notification?.title || "Reminder",
          body: detail.notification?.body || "",
          android: {
            channelId: `reminder_${reminderId}`,
            importance: AndroidImportance.HIGH,
            category: AndroidCategory.ALARM,
            visibility: AndroidVisibility.PUBLIC,
            autoCancel: false,
            lightUpScreen: true,
            actions: [
              { title: "Dismiss", pressAction: { id: "dismiss_action" } },
              { title: "Snooze 5m", pressAction: { id: "snooze_action" } },
            ],
            pressAction: {
              id: "default",
              launchActivity: ANDROID_ALARM_ACTIVITY,
            },
            fullScreenAction: {
              id: "default",
              launchActivity: ANDROID_ALARM_ACTIVITY,
            },
          },
          data: {
            ...notificationData,
            __reposted: "1", // Flag to prevent infinite loop
          },
        });
        await setDisplayedAlarm(repostId);
        console.log(`[VR] repost_done from=${notificationId} to=${repostId}`);
      } catch (e) {
        console.log("[VR] Failed to repost alarm notification:", e);
      }
    }

    // Try to download audio if missing
    if (shouldHandleAsAlarm && !isRepostNotification && data?.reminderId) {
      const localAudioPath = getLocalAudioPath(data.reminderId as string);
      try {
        const fileInfo = await getInfoAsync(localAudioPath);
        if (!fileInfo.exists || !fileInfo.size) {
          // Audio missing - try to download if we have the URL
          const audioUrl = data.audioUrl as string;
          if (audioUrl) {
            console.log("[VR] Audio missing, attempting download:", audioUrl);
            try {
              await downloadReminderAudio(data.reminderId as string, audioUrl);
            } catch (downloadErr) {
              console.log("[VR] Failed to download missing audio:", downloadErr);
            }
          }
        }
      } catch {
        // ignore stat errors
      }
    }

    if (!isRepostNotification) {
      await startAlarmAudioIfPossible();
    }

    // Alarm audio is started here on delivery so it plays without requiring a tap.
    // Alarm screen (app/alarm.tsx) still provides the UI to dismiss/snooze.

    if (!isRepostNotification && data?.reminderId) {
      const localAudioPath = getLocalAudioPath(data.reminderId as string);

      // Log file status for debugging
      try {
        const fileInfo = await getInfoAsync(localAudioPath);
        console.log(`[VR] Audio file ready: ${fileInfo.exists}, size: ${fileInfo.exists ? fileInfo.size : 'N/A'}`);
      } catch (e) {
        console.log("[VR] Failed to check audio file:", e);
      }
    } else {
      console.log("[VR] No reminderId in notification data");
    }

    // Check if we need to reschedule recurring reminders
    const frequency = typeof data?.frequency === "string" ? (data.frequency as string) : "";
    if (!frequency) {
      console.log("[VR] Notification missing frequency, skipping reschedule");
      return;
    }
    if (!["once", "daily", "weekly", "custom", "interval"].includes(frequency)) {
      console.log(`[VR] Unknown frequency "${frequency}", skipping reschedule`);
      return;
    }
    if (!data?.reminderId) {
      console.log("[VR] Notification missing reminderId, skipping reschedule");
      return;
    }

    if (frequency !== "once") {
      const kind = (data.kind as string) || "reminder_occurrence";
      if (kind === "snooze_occurrence") {
        console.log("[VR] Snooze notification delivered, not rescheduling");
        return;
      }

      let nextTrigger: number;
      if (frequency === "interval") {
        const intervalMs = Number(data.intervalMs);
        const anchorAt = Number(data.anchorAt);
        const scheduledFor = Number(data.scheduledFor);

        if (!intervalMs || !anchorAt) {
          console.warn("[VR] Interval reminder missing data, skipping reschedule");
          return;
        }

        // Stable cadence + skip missed: compute from the later of (scheduledFor, now)
        const ref = Math.max(scheduledFor || Date.now(), Date.now());
        const { scheduledFor: next } = getNextIntervalOccurrence(anchorAt, intervalMs, ref);
        nextTrigger = next;
      } else {
        const schedule: ReminderSchedule = {
          time: data.time as string,
          frequency,
          days: data.days ? (data.days as string).split(",") : undefined,
          intervalDays: data.intervalDays ? Number(data.intervalDays) : undefined,
          scheduledFor: Number(data.scheduledFor),
        };
        nextTrigger = getNextTriggerTime(schedule);
      }

      const now = Date.now();
      if (nextTrigger <= now) {
        console.warn("[VR] Next trigger in past, adjusting to now + 5s");
        nextTrigger = now + 5000;
      }

      const newNotificationId = `reminder_${data.reminderId}_${nextTrigger}`;

      const trigger: TimestampTrigger = {
        type: TriggerType.TIMESTAMP,
        timestamp: nextTrigger,
        alarmManager: {
          type: AlarmType.SET_ALARM_CLOCK,
        },
      };

      await notifee.createTriggerNotification(
        {
          ...detail.notification!,
          android: {
            ...(detail.notification?.android ?? {}),
            visibility: AndroidVisibility.PUBLIC,
            fullScreenAction: { id: "default", launchActivity: ANDROID_ALARM_ACTIVITY },
            pressAction: { id: "default", launchActivity: ANDROID_ALARM_ACTIVITY },
          },
          id: newNotificationId,
          data: {
            ...detail.notification!.data,
            scheduledFor: String(nextTrigger),
            kind: "reminder_occurrence",
          },
        },
        trigger
      );

      console.log(`[VR] Rescheduled for ${new Date(nextTrigger).toLocaleString()}`);
    }
  }
}

export async function getScheduledNotifications(): Promise<string[]> {
  const ids = await notifee.getTriggerNotificationIds();
  return ids;
}

/**
 * Reconciles local reminders with scheduled triggers on startup.
 * Ensures at least one trigger exists per active reminder.
 */
export async function syncRemindersOnStartup(
  reminders: Reminder[],
  history: ReminderHistory[]
): Promise<{ synced: number; skipped: number; failed: number; permissionError: boolean }> {
  try {
    const scheduledIds = await notifee.getTriggerNotificationIds();
    const now = Date.now();

    const pending = await getPendingAlarm();
    const pendingReminderId =
      typeof pending?.notification?.data?.reminderId === "string"
        ? (pending!.notification!.data!.reminderId as string)
        : "";
    const pendingScheduledFor = Number(pending?.notification?.data?.scheduledFor);

    // Get today's completions for "once" reminder skip logic
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const completedTodayIds = new Set(
      history
        .filter((h) => h.status === "completed" && new Date(h.timestamp) >= todayStart)
        .map((h) => h.reminderId)
    );

    let synced = 0,
      skipped = 0,
      failed = 0;
    let permissionError = false;

    for (const reminder of reminders) {
      if (!reminder.audioUrl) {
        skipped++;
        continue;
      }

      // Skip "once" reminders that are completed today or in the past
      if (reminder.frequency === "once") {
        if (completedTodayIds.has(reminder.id)) {
          skipped++;
          continue;
        }

        // If there's a pending alarm for this reminder, don't create a duplicate trigger.
        if (pendingReminderId && pendingReminderId === reminder.id && pending && !pending.handledAt) {
          if (!Number.isFinite(pendingScheduledFor) || pendingScheduledFor <= now) {
            skipped++;
            continue;
          }
        }

        // If this one-time reminder is already past due, don't resurrect it as "now + 5s".
        // It can be shown as overdue in UI, but it should not keep scheduling.
        const due = getNextTriggerTime(
          {
            time: reminder.time,
            date: reminder.date,
            frequency: reminder.frequency,
            days: reminder.days,
            intervalDays: reminder.intervalDays,
            scheduledFor: reminder.scheduledFor,
          },
          now
        );
        if (due <= now) {
          skipped++;
          continue;
        }
      }

      // Check if any notification exists for this reminder ID prefix
      // Use prefix match: reminder_{id}_
      const hasScheduled = scheduledIds.some((id) => id.startsWith(`reminder_${reminder.id}_`));
      if (hasScheduled) {
        skipped++;
        continue;
      }

      try {
        // Map store Reminder to ReminderNotification interface
        const notificationInput: ReminderNotification = {
          id: reminder.id,
          title: reminder.title,
          description: reminder.description,
          time: reminder.time,
          date: reminder.date,
          frequency: reminder.frequency,
          days: reminder.days,
          audioUrl: reminder.audioUrl,
          snoozeEnabled: reminder.snoozeEnabled,
          snoozeDuration: reminder.snoozeDuration,
          volume: reminder.volume,
          volumeStyle: reminder.volumeStyle,
          intervalMs: reminder.intervalMs,
          anchorAt: reminder.anchorAt,
          intervalDays: reminder.intervalDays,
          scheduledFor: reminder.scheduledFor,
        };

        const { triggerTimestamp } = await scheduleReminder(notificationInput);
        // Persist the scheduled occurrence timestamp so one-time reminders can't loop on restart.
        try {
          const store = useReminderStore.getState();
          const current = store.getReminderById(reminder.id);
          if (current && current.scheduledFor !== triggerTimestamp) {
            await store.updateReminder({ ...current, scheduledFor: triggerTimestamp });
          }
        } catch {
          // ignore
        }
        synced++;
      } catch (e: any) {
        if (e?.name === "ExactAlarmPermissionError") {
          permissionError = true;
        }
        console.log(`[VR] Sync failed for ${reminder.id}:`, e?.message || e);
        failed++;
      }
    }

    console.log(
      `[VR] Startup sync: ${synced} scheduled, ${skipped} skipped, ${failed} failed`
    );
    return { synced, skipped, failed, permissionError };
  } catch (e) {
    console.error("[VR] syncRemindersOnStartup critical failure:", e);
    return { synced: 0, skipped: 0, failed: 0, permissionError: false };
  }
}
