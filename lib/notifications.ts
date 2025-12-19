import notifee, {
  AndroidImportance,
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
import { playAudio } from "./audio";

export interface ReminderNotification {
  id: string;
  title: string;
  description: string;
  time: string;
  frequency: string;
  days?: string[];
  audioUrl: string;
  soundRepeatMode?: "count" | "until_stopped";
  soundRepeatCount?: number;
}

function getLocalAudioPath(reminderId: string): string {
  return `${documentDirectory}reminder_${reminderId}.mp3`;
}

export async function downloadReminderAudio(
  reminderId: string,
  audioUrl: string
): Promise<string> {
  const localPath = getLocalAudioPath(reminderId);
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
    sound: soundPath,
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
    frequency: reminder.frequency,
    days: reminder.days,
  };
  const triggerTimestamp = getNextTriggerTime(schedule);

  const trigger: TimestampTrigger = {
    type: TriggerType.TIMESTAMP,
    timestamp: triggerTimestamp,
  };

  await notifee.createTriggerNotification(
    {
      id: `reminder_${reminder.id}`,
      title: reminder.title,
      body: reminder.description,
      android: {
        channelId,
        importance: AndroidImportance.HIGH,
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
        soundRepeatMode: reminder.soundRepeatMode || "count",
        soundRepeatCount: reminder.soundRepeatCount ?? 1,
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

  // Delete local audio file
  await deleteLocalAudio(reminderId);

  console.log(`[VR] Cancelled reminder ${reminderId}`);
}

export async function handleNotificationEvent(event: Event): Promise<void> {
  const { type, detail } = event;
  console.log(`[VR] handleNotificationEvent called, type=${type}`);
  console.log(`[VR] Notification data:`, JSON.stringify(detail.notification?.data));

  if (type === EventType.DELIVERED) {
    console.log("[VR] DELIVERED event - attempting to play TTS");
    const data = detail.notification?.data;
    
    if (data?.reminderId) {
      const localAudioPath = getLocalAudioPath(data.reminderId as string);
      console.log(`[VR] Audio path: ${localAudioPath}`);
      
      // Check if file exists
      try {
        const fileInfo = await getInfoAsync(localAudioPath);
        console.log(`[VR] File exists: ${fileInfo.exists}, size: ${fileInfo.exists ? fileInfo.size : 'N/A'}`);
        
        if (fileInfo.exists) {
          console.log("[VR] Starting audio playback...");

          const repeatMode = (data.soundRepeatMode as string) || "count";
          const repeatCountRaw = Number(data.soundRepeatCount ?? 1);
          const repeatCount =
            repeatMode === "count"
              ? Math.max(1, repeatCountRaw || 1)
              : 6; // safety cap for "until stopped"

          for (let i = 0; i < repeatCount; i++) {
            await playAudio(localAudioPath, true);
            // short gap between repeats except last
            if (i < repeatCount - 1) {
              await new Promise((resolve) => setTimeout(resolve, 300));
            }
          }

          console.log("[VR] Audio playback completed repeats");
        } else {
          console.log("[VR] ERROR: Audio file does not exist!");
        }
      } catch (e) {
        console.log("[VR] Failed to play TTS audio:", e);
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
