import notifee, {
  AndroidImportance,
  AndroidCategory,
  TriggerType,
  TimestampTrigger,
  EventType,
  Event,
} from "@notifee/react-native";
import { Platform } from "react-native";
import { alarmAudioService } from "./AudioService";
import {
  documentDirectory,
  downloadAsync,
  deleteAsync,
  getInfoAsync,
} from "expo-file-system/legacy";
import { getNextIntervalOccurrence, getNextTriggerTime, ReminderSchedule } from "./time";
import { Reminder, ReminderHistory } from "./store";
// Note: Audio playback is handled by alarm screen (app/alarm.tsx)

export class ExactAlarmPermissionError extends Error {
  public readonly notificationSettings: any;

  constructor(message: string, notificationSettings: any) {
    super(message);
    this.name = "ExactAlarmPermissionError";
    this.notificationSettings = notificationSettings;
  }
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

  await notifee.createChannel({
    id: channelId,
    name: `Reminder: ${title}`,
    importance: AndroidImportance.HIGH,
    // Audible fallback so users notice delivery even if alarm UI can't open.
    // Note: Android channels are immutable once created; a reinstall (or deleting the channel) may be required to apply changes.
    sound: "default",
  });

  return channelId;
}

export async function scheduleReminder(
  reminder: ReminderNotification,
  _options?: { traceId?: string }
): Promise<void> {
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
      allowWhileIdle: true, // Bypasses Android Doze mode - uses setExactAndAllowWhileIdle()
    },
  };

  const notificationId = `reminder_${reminder.id}_${triggerTimestamp}`;

  await notifee.createTriggerNotification(
    {
      id: notificationId,
      title: reminder.title,
      body: reminder.description,
      android: {
        channelId,
        importance: AndroidImportance.HIGH,
        category: AndroidCategory.ALARM,
        autoCancel: false,
        lightUpScreen: true,
        pressAction: {
          id: "default",
        },
        // Show the alarm UI immediately when the trigger fires (Android).
        // Requires `android.permission.USE_FULL_SCREEN_INTENT` in AndroidManifest.xml.
        fullScreenAction: {
          id: "default",
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
  console.log(`[VR] handleNotificationEvent called, type=${type}`);
  console.log(`[VR] Notification data:`, JSON.stringify(detail.notification?.data));

  const notificationData = detail.notification?.data;
  const kind = typeof notificationData?.kind === "string" ? (notificationData.kind as string) : "";
  const reminderId =
    typeof notificationData?.reminderId === "string" ? (notificationData.reminderId as string) : "";

  const shouldHandleAsAlarm =
    Boolean(reminderId) && (kind === "reminder_occurrence" || kind === "snooze_occurrence");

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
    await stopAlarmAudioIfPlaying();
    return;
  }

  if (type === EventType.DELIVERED) {
    console.log("[VR] DELIVERED event - starting alarm audio");
    const data = notificationData;
    await startAlarmAudioIfPossible();

    // Alarm audio is started here on delivery so it plays without requiring a tap.
    // Alarm screen (app/alarm.tsx) still provides the UI to dismiss/snooze.

    if (data?.reminderId) {
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
          allowWhileIdle: true,
        },
      };

      await notifee.createTriggerNotification(
        {
          ...detail.notification!,
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
        // If scheduledFor exists and is in the past, skip it
        if (reminder.scheduledFor && reminder.scheduledFor < now) {
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

        await scheduleReminder(notificationInput);
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
