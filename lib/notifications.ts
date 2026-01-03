import notifee, {
  AndroidImportance,
  AndroidCategory,
  TriggerType,
  TimestampTrigger,
  EventType,
  Event,
} from "@notifee/react-native";
import {
  documentDirectory,
  downloadAsync,
  deleteAsync,
  getInfoAsync,
} from "expo-file-system/legacy";
import { getNextTriggerTime, ReminderSchedule } from "./time";
// Note: Audio playback is handled by alarm screen (app/alarm.tsx)

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
  soundPath: string
): Promise<string> {
  const channelId = `reminder_${reminderId}`;

  await notifee.createChannel({
    id: channelId,
    name: `Reminder: ${title}`,
    importance: AndroidImportance.HIGH,
    // Note: No sound here - alarm screen (app/alarm.tsx) handles audio playback
    sound: "",
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

  // Download audio to device
  const localAudioPath = await downloadReminderAudio(reminder.id, reminder.audioUrl);

  // Create channel with custom sound
  const channelId = await createReminderChannel(
    reminder.id,
    reminder.title,
    localAudioPath
  );

  // Calculate next trigger time
  const schedule: ReminderSchedule = {
    time: reminder.time,
    date: reminder.date,
    frequency: reminder.frequency,
    days: reminder.days,
  };
  const triggerTimestamp = getNextTriggerTime(schedule);

  const trigger: TimestampTrigger = {
    type: TriggerType.TIMESTAMP,
    timestamp: triggerTimestamp,
    alarmManager: {
      allowWhileIdle: true, // Bypasses Android Doze mode - uses setExactAndAllowWhileIdle()
    },
  };

  await notifee.createTriggerNotification(
    {
      id: `reminder_${reminder.id}`,
      title: reminder.title,
      body: reminder.description,
      android: {
        channelId,
        importance: AndroidImportance.HIGH,
        category: AndroidCategory.ALARM,
        autoCancel: false,
        lightUpScreen: true,
        // Note: fullScreenAction removed - requires additional native setup
        // that was causing issues. Will implement properly in future update.
        pressAction: {
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
      },
    },
    trigger
  );

  console.log(
    `[VR] Scheduled notification for ${new Date(triggerTimestamp).toLocaleString()}`
  );
}

export async function cancelReminder(reminderId: string): Promise<void> {
  const notificationId = `reminder_${reminderId}`;
  const channelId = `reminder_${reminderId}`;

  // Cancel scheduled notification
  await notifee.cancelNotification(notificationId);

  // Delete the channel
  await notifee.deleteChannel(channelId);

  // Note: NOT deleting local audio file here - it's needed for rescheduling
  // Audio is only deleted when reminder is fully deleted via deleteReminderWithAudio()

  console.log(`[VR] Cancelled reminder ${reminderId}`);
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

  if (type === EventType.DELIVERED) {
    console.log("[VR] DELIVERED event - alarm screen will handle audio");
    const data = detail.notification?.data;

    // Note: Audio playback is now handled by the alarm screen (app/alarm.tsx)
    // This handler only logs file info and handles recurring reschedule

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
    if (data && data.frequency !== "once") {
      const schedule: ReminderSchedule = {
        time: data.time as string,
        frequency: data.frequency as string,
        days: data.days ? (data.days as string).split(",") : undefined,
      };

      const nextTrigger = getNextTriggerTime(schedule);
      const trigger: TimestampTrigger = {
        type: TriggerType.TIMESTAMP,
        timestamp: nextTrigger,
        alarmManager: {
          allowWhileIdle: true, // Bypasses Android Doze mode
        },
      };

      await notifee.createTriggerNotification(
        {
          ...detail.notification!,
        },
        trigger
      );

      console.log(
        `[VR] Rescheduled recurring reminder for ${new Date(nextTrigger).toLocaleString()}`
      );
    }
  }
}

export async function getScheduledNotifications(): Promise<string[]> {
  const ids = await notifee.getTriggerNotificationIds();
  return ids;
}
