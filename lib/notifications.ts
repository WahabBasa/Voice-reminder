import notifee, {
  AndroidImportance,
  AndroidCategory,
  AndroidVisibility,
  AndroidLaunchActivityFlag,
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
import { vrLog, buildTraceId } from "./vrLog";
import { logAppTaskState } from "./activityControl";
import { 
  getNextOccurrence, 
  migrateLegacySchedule, 
  normalizeSchedule,
  Schedule,
  ScheduleWarning,
} from "./schedule";
// Note: Audio playback is handled by alarm screen (app/alarm.tsx)

export class ExactAlarmPermissionError extends Error {
  public readonly notificationSettings: any;

  constructor(message: string, notificationSettings: any) {
    super(message);
    this.name = "ExactAlarmPermissionError";
    this.notificationSettings = notificationSettings;
  }
}

export class NoFutureOccurrenceError extends Error {
  public readonly scheduleType?: string;

  constructor(message: string, scheduleType?: string) {
    super(message);
    this.name = "NoFutureOccurrenceError";
    this.scheduleType = scheduleType;
  }
}

const PENDING_ALARM_KEY = "@pending_alarm";
const PENDING_ALARM_QUEUE_KEY = "@pending_alarm_queue";
const ANDROID_ALARM_ACTIVITY = "com.wahabbasa.VoiceReminder.AlarmActivity";
const DISPLAYED_ALARM_KEY = "@displayed_alarm_id";
const ALARM_RING_TIMEOUT_MS = 3 * 60_000;
const AUTO_SNOOZE_DELAY_MINUTES = 5;
const MAX_AUTO_SNOOZE_COUNT = 1;

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

// When we intentionally cancel a displayed notification (e.g. trigger -> repost),
// Android can emit a DISMISSED event. Track those IDs briefly so we don't treat
// them as user dismissals and clear active alarm state.
const INTERNAL_DISMISS_IGNORE_WINDOW_MS = 60_000;
const internalDismissIgnore = new Map<string, number>();

function markInternalDismissIgnore(notificationId?: string): void {
  if (!notificationId) return;
  const now = Date.now();
  internalDismissIgnore.set(notificationId, now + INTERNAL_DISMISS_IGNORE_WINDOW_MS);
}

function shouldIgnoreInternalDismiss(notificationId?: string): boolean {
  if (!notificationId) return false;
  const now = Date.now();
  for (const [id, expiresAt] of internalDismissIgnore) {
    if (expiresAt <= now) {
      internalDismissIgnore.delete(id);
    }
  }
  const expiresAt = internalDismissIgnore.get(notificationId);
  if (!expiresAt || expiresAt <= now) return false;
  internalDismissIgnore.delete(notificationId);
  return true;
}

// Note: buildTraceId() has been moved to vrLog.ts - use that instead
// Keeping re-export for backwards compatibility during transition
type PendingAlarmNotification = {
  id?: string;
  title?: string;
  body?: string;
  data?: Record<string, any>;
};

export type PendingAlarm = {
  notification: PendingAlarmNotification;
  storedAt: number;
  ringingAt?: number;
  uiShownAt?: number;
  resolvedAt?: number;
  resolvedAction?: "dismiss" | "snooze";
  launchOrigin?: "fullScreen" | "press" | "unknown";
  launchedExternallyAt?: number;
};

type QueuedAlarm = {
  notification: PendingAlarmNotification;
  enqueuedAt: number;
};

let activeAlarmTimeoutHandle: ReturnType<typeof setTimeout> | null = null;
let activeAlarmTimeoutNotificationId: string | null = null;
let queuePromotionInFlight = false;
const timeoutHandlingInFlight = new Set<string>();

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

function getNotificationKind(notification?: PendingAlarmNotification | null): string {
  const kind = notification?.data?.kind;
  return typeof kind === "string" ? kind : "";
}

function isAlarmOccurrenceNotification(notification?: PendingAlarmNotification | null): boolean {
  const kind = getNotificationKind(notification);
  return kind === "reminder_occurrence" || kind === "snooze_occurrence";
}

function clearActiveAlarmTimeout(notificationId?: string): void {
  if (!activeAlarmTimeoutHandle) return;
  if (notificationId && activeAlarmTimeoutNotificationId !== notificationId) return;
  clearTimeout(activeAlarmTimeoutHandle);
  activeAlarmTimeoutHandle = null;
  activeAlarmTimeoutNotificationId = null;
}

async function getAlarmQueue(): Promise<QueuedAlarm[]> {
  try {
    const raw = await AsyncStorage.getItem(PENDING_ALARM_QUEUE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as QueuedAlarm[];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item) => Boolean(item?.notification?.id));
  } catch (e) {
    console.log("[VR] Failed to read alarm queue:", e);
    return [];
  }
}

async function setAlarmQueue(queue: QueuedAlarm[]): Promise<void> {
  try {
    if (!queue.length) {
      await AsyncStorage.removeItem(PENDING_ALARM_QUEUE_KEY);
      return;
    }
    await AsyncStorage.setItem(PENDING_ALARM_QUEUE_KEY, JSON.stringify(queue));
  } catch (e) {
    console.log("[VR] Failed to persist alarm queue:", e);
  }
}

async function enqueueAlarmNotification(notification?: PendingAlarmNotification | null): Promise<boolean> {
  const normalized = toPendingNotification(notification);
  const id = normalized.id;
  if (!id) return false;

  try {
    const queue = await getAlarmQueue();
    const exists = queue.some((item) => item.notification.id === id);
    if (exists) return false;
    queue.push({
      notification: normalized,
      enqueuedAt: Date.now(),
    });
    await setAlarmQueue(queue);
    const trace = buildTraceId(normalized);
    vrLog("pending_alarm", "queued", {
      traceId: trace,
      notificationId: id,
      queueLength: queue.length,
    });
    return true;
  } catch (e) {
    console.log("[VR] Failed to enqueue alarm notification:", e);
    return false;
  }
}

async function dequeueAlarmNotification(): Promise<QueuedAlarm | null> {
  const queue = await getAlarmQueue();
  if (!queue.length) return null;
  const [head, ...rest] = queue;
  await setAlarmQueue(rest);
  return head;
}

async function startAlarmAudioFromNotification(notification?: PendingAlarmNotification | null): Promise<void> {
  if (!notification?.id) return;
  const data = notification.data || {};
  const reminderId = typeof data.reminderId === "string" ? data.reminderId : "";
  if (!reminderId) return;
  const localAudioPath = getLocalAudioPath(reminderId);
  try {
    const fileInfo = await getInfoAsync(localAudioPath);
    if (!fileInfo.exists || !fileInfo.size) {
      return;
    }
  } catch {
    return;
  }

  const rawVolume = Number(data.volume ?? "1");
  const targetVolume = Math.max(0, Math.min(1, Number.isFinite(rawVolume) ? rawVolume : 1));
  const ok = await alarmAudioService.ensurePlaying(localAudioPath, {
    volume: targetVolume,
    streamType: "alarm",
    loop: true,
  });
  if (ok) {
    await markPendingAlarmRinging(notification.id);
  }
}

async function scheduleSnoozeOccurrenceFromNotification(
  notification: PendingAlarmNotification,
  snoozeMinutes: number,
  extraData?: Record<string, string>
): Promise<void> {
  const data = notification.data || {};
  const reminderId = typeof data.reminderId === "string" ? data.reminderId : "";
  if (!reminderId) return;

  const triggerTimestamp = Date.now() + snoozeMinutes * 60_000;
  const trigger: TimestampTrigger = {
    type: TriggerType.TIMESTAMP,
    timestamp: triggerTimestamp,
    alarmManager: { type: AlarmType.SET_ALARM_CLOCK },
  };
  const channelId = `reminder_${reminderId}`;
  const title = (data.title as string) || notification.title || "Reminder";
  const body = (data.description as string) || notification.body || "";

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
        ...data,
        ...(extraData || {}),
        kind: "snooze_occurrence",
        originalScheduledFor: data.scheduledFor || "",
        scheduledFor: String(triggerTimestamp),
      },
    },
    trigger
  );
}

async function promoteNextQueuedAlarm(reason: string): Promise<boolean> {
  if (queuePromotionInFlight) return false;
  queuePromotionInFlight = true;
  try {
    const existing = await getPendingAlarm();
    if (existing?.notification?.id && !existing.resolvedAt) return false;

    while (true) {
      const next = await dequeueAlarmNotification();
      if (!next?.notification?.id) return false;

      const data = next.notification.data || {};
      const reminderId = typeof data.reminderId === "string" ? data.reminderId : "";
      const reminderExists = reminderId
        ? Boolean(useReminderStore.getState().getReminderById(reminderId))
        : true;
      if (!reminderExists) {
        vrLog("pending_alarm", "queue_drop_missing_reminder", {
          notificationId: next.notification.id,
          reminderId,
          reason,
        });
        continue;
      }

      await setPendingAlarm(next.notification);

      const scheduledForKey =
        typeof data.scheduledFor === "string" && data.scheduledFor
          ? data.scheduledFor
          : String(Date.now());
      const repostId = `alarm_display_${reminderId || "na"}_${scheduledForKey}_${Date.now()}`;
      try {
        await notifee.displayNotification({
          id: repostId,
          title: next.notification.title || "Reminder",
          body: next.notification.body || "",
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
              launchActivityFlags: [AndroidLaunchActivityFlag.NEW_TASK],
            },
            fullScreenAction: {
              id: "default",
              launchActivity: ANDROID_ALARM_ACTIVITY,
              launchActivityFlags: [AndroidLaunchActivityFlag.NEW_TASK],
            },
          },
          data: {
            ...data,
            __reposted: "1",
            __fromQueue: "1",
          },
        });
        await setDisplayedAlarm(repostId);
      } catch (e) {
        console.log("[VR] Failed to display promoted queued alarm:", e);
      }

      await startAlarmAudioFromNotification(next.notification);
      vrLog("pending_alarm", "queue_promoted", {
        notificationId: next.notification.id,
        reminderId,
        reason,
      });
      return true;
    }
  } finally {
    queuePromotionInFlight = false;
  }
}

export async function setPendingAlarm(
  notification?: PendingAlarmNotification | null
): Promise<void> {
  if (!notification?.id) return;
  clearActiveAlarmTimeout();
  const payload: PendingAlarm = {
    notification: toPendingNotification(notification),
    storedAt: Date.now(),
  };
  try {
    await AsyncStorage.setItem(PENDING_ALARM_KEY, JSON.stringify(payload));
    const data = notification.data || {};
    const trace = buildTraceId(notification);
    vrLog('pending_alarm', 'state_transition', {
      state: 'pending_set',
      traceId: trace,
      notificationId: notification.id,
      incomingId: notification.id,
      kind: data.kind || "",
      repost: data.__reposted || "0",
    });
  } catch (e) {
    console.log("[VR] Failed to persist pending alarm:", e);
  }

  if (isAlarmOccurrenceNotification(notification)) {
    activeAlarmTimeoutNotificationId = notification.id;
    activeAlarmTimeoutHandle = setTimeout(() => {
      void handlePendingAlarmTimeout(notification.id!, "timer");
    }, ALARM_RING_TIMEOUT_MS);
  }
}

export async function getPendingAlarm(): Promise<PendingAlarm | null> {
  try {
    const raw = await AsyncStorage.getItem(PENDING_ALARM_KEY);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw) as PendingAlarm;
    if (!parsed?.notification?.id) {
      return null;
    }

    let needsResave = false;
    if ((parsed as any).handledAt && !parsed.resolvedAt) {
      delete (parsed as any).handledAt;
      needsResave = true;
    }

    if (needsResave) {
      try {
        await AsyncStorage.setItem(PENDING_ALARM_KEY, JSON.stringify(parsed));
      } catch {
        // ignore resave errors
      }
    }

    return parsed;
  } catch (e) {
    console.log("[VR] Failed to read pending alarm:", e);
    return null;
  }
}

async function patchPendingAlarm(notificationId: string, updates: Partial<PendingAlarm>): Promise<void> {
  if (!notificationId) return;
  try {
    const raw = await AsyncStorage.getItem(PENDING_ALARM_KEY);
    if (!raw) return;
    const pending = JSON.parse(raw) as PendingAlarm;
    if (pending?.notification?.id !== notificationId) return;
    Object.assign(pending, updates);
    await AsyncStorage.setItem(PENDING_ALARM_KEY, JSON.stringify(pending));
  } catch (e) {
    console.log("[VR] Failed to patch pending alarm:", e);
  }
}

export async function markPendingAlarmRinging(notificationId: string): Promise<void> {
  if (!notificationId) return;
  try {
    const raw = await AsyncStorage.getItem(PENDING_ALARM_KEY);
    if (!raw) return;
    const pending = JSON.parse(raw) as PendingAlarm;
    if (pending?.notification?.id !== notificationId) return;
    if (pending.ringingAt) return;
    pending.ringingAt = Date.now();
    await AsyncStorage.setItem(PENDING_ALARM_KEY, JSON.stringify(pending));
    const trace = buildTraceId(pending.notification);
    vrLog('pending_alarm', 'state_transition', {
      state: 'ringing_set',
      traceId: trace,
      notificationId,
    });
  } catch (e) {
    console.log("[VR] Failed to mark alarm ringing:", e);
  }
}

export async function markPendingAlarmUiShown(notificationId: string): Promise<void> {
  if (!notificationId) return;
  try {
    const raw = await AsyncStorage.getItem(PENDING_ALARM_KEY);
    if (!raw) return;
    const pending = JSON.parse(raw) as PendingAlarm;
    if (pending?.notification?.id !== notificationId) return;
    if (pending.uiShownAt) return;
    pending.uiShownAt = Date.now();
    await AsyncStorage.setItem(PENDING_ALARM_KEY, JSON.stringify(pending));
    const trace = buildTraceId(pending.notification);
    vrLog('pending_alarm', 'state_transition', {
      state: 'ui_shown_set',
      traceId: trace,
      notificationId,
    });
  } catch (e) {
    console.log("[VR] Failed to mark alarm UI shown:", e);
  }
}

export async function markPendingAlarmResolved(notificationId: string, action: "dismiss" | "snooze"): Promise<void> {
  if (!notificationId) return;
  clearActiveAlarmTimeout(notificationId);
  try {
    const raw = await AsyncStorage.getItem(PENDING_ALARM_KEY);
    if (!raw) return;
    const pending = JSON.parse(raw) as PendingAlarm;
    if (pending?.notification?.id !== notificationId) return;
    if (pending.resolvedAt) return;
    pending.resolvedAt = Date.now();
    pending.resolvedAction = action;
    await AsyncStorage.setItem(PENDING_ALARM_KEY, JSON.stringify(pending));
    const trace = buildTraceId(pending.notification);
    vrLog('pending_alarm', 'state_transition', {
      state: 'resolved_set',
      traceId: trace,
      notificationId,
      action,
    });
  } catch (e) {
    console.log("[VR] Failed to mark alarm resolved:", e);
  }
}

export async function markPendingAlarmLaunchedExternally(
  notificationId: string,
  origin: "fullScreen" | "press" | "unknown"
): Promise<void> {
  if (!notificationId) return;
  try {
    const raw = await AsyncStorage.getItem(PENDING_ALARM_KEY);
    if (!raw) return;
    const pending = JSON.parse(raw) as PendingAlarm;
    if (pending?.notification?.id !== notificationId) return;
    // Only set if not already set (latched)
    if (pending.launchedExternallyAt) return;
    pending.launchOrigin = origin;
    pending.launchedExternallyAt = Date.now();
    await AsyncStorage.setItem(PENDING_ALARM_KEY, JSON.stringify(pending));
    console.log(`[VR] alarm_origin_set id=${notificationId} origin=${origin}`);
  } catch (e) {
    console.log("[VR] Failed to mark alarm launched externally:", e);
  }
}

export async function clearPendingAlarm(options?: { promoteNext?: boolean }): Promise<void> {
  const promoteNext = options?.promoteNext ?? true;
  clearActiveAlarmTimeout();
  try {
    // Get trace info before clearing
    const pending = await getPendingAlarm();
    const trace = pending ? buildTraceId(pending.notification) : "no_pending";
    
    await AsyncStorage.removeItem(PENDING_ALARM_KEY);
    vrLog('pending_alarm', 'state_transition', {
      state: 'pending_clear',
      traceId: trace,
    });
  } catch (e) {
    console.log("[VR] Failed to clear pending alarm:", e);
  }
  if (promoteNext) {
    await promoteNextQueuedAlarm("pending_cleared");
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

export async function handlePendingAlarmTimeout(
  notificationId: string,
  source: "timer" | "poll"
): Promise<boolean> {
  if (!notificationId) return false;
  if (timeoutHandlingInFlight.has(notificationId)) return false;
  timeoutHandlingInFlight.add(notificationId);
  try {
    const pending = await getPendingAlarm();
    if (!pending?.notification?.id || pending.notification.id !== notificationId) return false;
    if (pending.resolvedAt) return false;
    if (!isAlarmOccurrenceNotification(pending.notification)) return false;

    const now = Date.now();
    const startedAt = pending.ringingAt || pending.uiShownAt || pending.storedAt || now;
    if (now - startedAt < ALARM_RING_TIMEOUT_MS) return false;

    const data = pending.notification.data || {};
    const reminderId = typeof data.reminderId === "string" ? data.reminderId : "";
    const snoozeEnabled = String(data.snoozeEnabled ?? "true") !== "false";
    const autoSnoozeCount = Math.max(0, Number(data.autoSnoozeCount ?? "0") || 0);
    const canAutoSnooze = snoozeEnabled && autoSnoozeCount < MAX_AUTO_SNOOZE_COUNT;

    vrLog("pending_alarm", "timeout_fired", {
      notificationId,
      reminderId,
      source,
      autoSnoozeCount,
      canAutoSnooze,
    });

    await alarmAudioService.stop().catch(() => {});
    try {
      await notifee.cancelNotification(notificationId);
    } catch {
      // ignore
    }
    await cancelDisplayedAlarmNotifications(notificationId);

    if (canAutoSnooze) {
      await scheduleSnoozeOccurrenceFromNotification(pending.notification, AUTO_SNOOZE_DELAY_MINUTES, {
        autoSnoozeCount: String(autoSnoozeCount + 1),
        autoSnoozeReason: "ring_timeout",
      });
      await markPendingAlarmResolved(notificationId, "snooze");
      await clearPendingAlarm({ promoteNext: true });
      return true;
    }

    if (reminderId) {
      try {
        const store = useReminderStore.getState();
        const reminder = store.getReminderById(reminderId);
        if (reminder) {
          const scheduledForRaw = Number(data.scheduledFor);
          const scheduledFor = Number.isFinite(scheduledForRaw) ? scheduledForRaw : undefined;
          await store.recordCompletion(reminderId, reminder.title, "missed", {
            scheduledFor,
            action: "auto_missed",
          });
        }
      } catch (e) {
        console.log("[VR] Failed to record auto-missed reminder:", e);
      }
    }

    await markPendingAlarmResolved(notificationId, "dismiss");
    await clearPendingAlarm({ promoteNext: true });
    return true;
  } finally {
    timeoutHandlingInFlight.delete(notificationId);
  }
}

export async function enforcePendingAlarmTimeout(): Promise<void> {
  const pending = await getPendingAlarm();
  const id = pending?.notification?.id || "";
  if (!id) {
    clearActiveAlarmTimeout();
    await promoteNextQueuedAlarm("no_active_pending");
    return;
  }
  if (pending?.resolvedAt || !isAlarmOccurrenceNotification(pending?.notification)) {
    clearActiveAlarmTimeout();
    return;
  }
  if (!pending) {
    clearActiveAlarmTimeout();
    return;
  }
  const activePending = pending;
  const now = Date.now();
  const startedAt =
    activePending.ringingAt || activePending.uiShownAt || activePending.storedAt || now;
  const elapsed = now - startedAt;
  if (elapsed >= ALARM_RING_TIMEOUT_MS) {
    await handlePendingAlarmTimeout(id, "poll");
    return;
  }
  if (activeAlarmTimeoutNotificationId === id && activeAlarmTimeoutHandle) {
    return;
  }
  clearActiveAlarmTimeout();
  activeAlarmTimeoutNotificationId = id;
  activeAlarmTimeoutHandle = setTimeout(() => {
    void handlePendingAlarmTimeout(id, "timer");
  }, Math.max(500, ALARM_RING_TIMEOUT_MS - elapsed));
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
  audioUrl?: string;
  snoozeEnabled?: boolean;
  snoozeDuration?: number; // minutes
  volume?: number; // 0-1
  volumeStyle?: "standard" | "progressive";

  // Interval recurrence
  intervalMs?: number;
  anchorAt?: number;
  intervalDays?: number;
  scheduledFor?: number;

  // New unified schedule system
  scheduleType?: 'once' | 'interval' | 'rrule';
  onceAt?: number;
  rrule?: string;
  dtstart?: number;
  tzid?: string;
  until?: number;
  parseWarnings?: string[];
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

  // Download audio to device (skip if no audioUrl - will use default sound)
  let localAudioPath: string | null = null;
  if (reminder.audioUrl) {
    localAudioPath = await downloadReminderAudio(reminder.id, reminder.audioUrl);
  }

  // Create channel (uses default sound if no custom audio)
  const channelId = await createReminderChannel(
    reminder.id,
    reminder.title,
    localAudioPath || ""
  );

  // Calculate next trigger time using unified scheduling engine
  let triggerTimestamp: number;

  // Try new unified schedule system first
  if (reminder.scheduleType) {
    // Backward/fast-path safety: if we have a one-time scheduleType but no onceAt,
    // derive it from `date` + `time` on-device (local timezone).
    let onceAt = reminder.onceAt;
    if (reminder.scheduleType === "once" && !onceAt && reminder.time) {
      const [hours, minutes] = reminder.time.split(":").map(Number);
      if (reminder.date) {
        const [year, month, day] = reminder.date.split("-").map(Number);
        const derived = new Date(year, month - 1, day, hours, minutes, 0, 0).getTime();
        if (Number.isFinite(derived)) onceAt = derived;
      } else if (Number.isFinite(hours) && Number.isFinite(minutes)) {
        const target = new Date();
        target.setHours(hours, minutes, 0, 0);
        if (target.getTime() <= Date.now()) {
          target.setDate(target.getDate() + 1);
        }
        const derived = target.getTime();
        if (Number.isFinite(derived)) onceAt = derived;
      }
    }

    const schedule: Schedule = {
      type: reminder.scheduleType,
      onceAt,
      intervalMs: reminder.intervalMs,
      anchorAt: reminder.anchorAt,
      rrule: reminder.rrule,
      dtstart: reminder.dtstart,
      tzid: reminder.tzid,
      until: reminder.until,
    } as Schedule;

    const nextOccurrence = getNextOccurrence(schedule, Date.now());
    if (nextOccurrence) {
      triggerTimestamp = nextOccurrence;
    } else {
      // No future occurrence (e.g., expired once reminder or bounded RRULE finished)
      throw new NoFutureOccurrenceError(
        `No future occurrence for schedule type ${reminder.scheduleType}`,
        reminder.scheduleType
      );
    }
  } else if (reminder.frequency === "interval" && reminder.anchorAt && reminder.intervalMs) {
    // Legacy interval support
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
    // Legacy schedule support
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
      // For one-time reminders that are in the past, don't schedule them as "now + 5s"
      // This prevents expired reminders from firing immediately
      const scheduleType = reminder.scheduleType;
      const isOnceReminder = scheduleType === 'once' || (!scheduleType && reminder.frequency === 'once');
      
      if (isOnceReminder) {
        console.warn(`[VR] One-time reminder ${new Date(triggerTimestamp).toLocaleString()} is in the past, not scheduling (expired)`);
        throw new Error("Reminder time is in the past. Please choose a future time.");
      }
      
      // For recurring reminders, this shouldn't happen with proper getNextOccurrence logic
      // but as a safety net, schedule slightly in the future
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
          launchActivityFlags: [AndroidLaunchActivityFlag.NEW_TASK],
        },
        // Show the alarm UI immediately when the trigger fires (Android).
        // Requires `android.permission.USE_FULL_SCREEN_INTENT` in AndroidManifest.xml.
        fullScreenAction: {
          id: "default",
          launchActivity: ANDROID_ALARM_ACTIVITY,
          launchActivityFlags: [AndroidLaunchActivityFlag.NEW_TASK],
        },
      },
      data: {
        reminderId: reminder.id,
        frequency: reminder.frequency,
        time: reminder.time,
        days: reminder.days?.join(",") || "",
        title: reminder.title,
        description: reminder.description,
        audioUrl: reminder.audioUrl ?? "",
        snoozeEnabled: String(reminder.snoozeEnabled ?? true),
        snoozeDuration: String(reminder.snoozeDuration ?? 5),
        volume: String(reminder.volume ?? 1),
        volumeStyle: reminder.volumeStyle ?? "standard",

        intervalMs: String(reminder.intervalMs ?? ""),
        anchorAt: String(reminder.anchorAt ?? ""),
        intervalDays: String(reminder.intervalDays ?? ""),
        scheduledFor: String(triggerTimestamp),
        kind: "reminder_occurrence",
        autoSnoozeCount: "0",

        // New unified schedule fields
        scheduleType: reminder.scheduleType ?? "",
        onceAt: String(reminder.onceAt ?? ""),
        rrule: reminder.rrule ?? "",
        dtstart: String(reminder.dtstart ?? ""),
        tzid: reminder.tzid ?? "",
        until: String(reminder.until ?? ""),
      },
    },
    trigger
  );

  const logNow = Date.now();
  const deltaMs = triggerTimestamp - logNow;
  const scheduleSource = _options?.traceId ? "create_flow" : "sync_or_internal";
  console.log(
    `[VR] schedule_debug source=${scheduleSource} id=${reminder.id} freq=${reminder.frequency} scheduleType=${reminder.scheduleType ?? "legacy"} now=${new Date(logNow).toISOString()} trigger=${new Date(triggerTimestamp).toISOString()} deltaMs=${deltaMs} deltaMin=${Math.round(deltaMs / 60000)}`
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

  console.log(`[VR] Cancelled ${toCancel.length} trigger notifications for reminder ${reminderId}`);
}

// Use this when fully deleting a reminder (not just rescheduling)
export async function deleteReminderWithAudio(reminderId: string): Promise<void> {
  await cancelReminder(reminderId);
  await deleteLocalAudio(reminderId);
  console.log(`[VR] Deleted reminder ${reminderId} with audio`);
}

/**
 * Refresh scheduled notification data after audio becomes available.
 * Updates the notification data to include the audioUrl without changing the trigger time.
 */
export async function refreshNotificationWithAudio(
  reminderId: string,
  audioUrl: string
): Promise<void> {
  try {
    // Get all trigger notifications
    const allNotifications = await notifee.getTriggerNotifications();
    
    for (const notification of allNotifications) {
      const id = notification.notification.id;
      if (!id || !id.startsWith(`reminder_${reminderId}_`)) continue;

      try {
        // Update data with audioUrl
        const updatedData = {
          ...notification.notification.data,
          audioUrl,
        };

        // Cancel and recreate with updated data but same trigger
        await notifee.cancelTriggerNotification(id);
        await notifee.createTriggerNotification(
          {
            ...notification.notification,
            data: updatedData,
          },
          notification.trigger as TimestampTrigger
        );

        console.log(`[VR] Refreshed notification ${id} with audioUrl`);
      } catch (e) {
        console.error(`[VR] Failed to refresh notification ${id}:`, e);
      }
    }
  } catch (e) {
    console.error(`[VR] Failed to refresh notifications for ${reminderId}:`, e);
  }
}

export async function handleNotificationEvent(event: Event): Promise<void> {
  const { type, detail } = event;
  const trace = buildTraceId(detail.notification);
  
  // Strengthened logging (pastebin Step 4.2)
  const notificationData = detail.notification?.data;
  const notificationId = detail.notification?.id || "";
  const kind = typeof notificationData?.kind === "string" ? notificationData.kind : "";
  const reminderId = typeof notificationData?.reminderId === "string" ? notificationData.reminderId : "";
  const scheduledFor = String(notificationData?.scheduledFor || "");
  const repostFlag = (notificationData as any)?.__reposted;
  const isRepostedFlag = repostFlag === "1" || repostFlag === 1 || repostFlag === true;
  const isAlarmDisplayNotification = notificationId.startsWith("alarm_display_");
  const pressActionId = detail.pressAction?.id || "";
  
  vrLog('notifee', 'handleEvent_start', {
    traceId: trace,
    type: eventTypeName(type),
    id: notificationId,
    pressActionId,
    kind,
    reminderId,
    scheduledFor,
    repost: isRepostedFlag,
    alarmDisplay: isAlarmDisplayNotification,
  });
  
  // Call native state dump at key events (pastebin Step 4.5) - non-blocking
  void logAppTaskState(`notifee_${eventTypeName(type)}_${notificationId}`);

  const shouldHandleAsAlarm =
    Boolean(reminderId) && (kind === "reminder_occurrence" || kind === "snooze_occurrence");

  const isRepostNotification = isAlarmDisplayNotification || isRepostedFlag;

  vrLog('notifee', 'handleEvent_flags', {
    traceId: trace,
    shouldHandleAsAlarm,
    repostFlag: isRepostedFlag,
    alarmDisplayId: isAlarmDisplayNotification,
    isRepost: isRepostNotification,
  });

  await enforcePendingAlarmTimeout();

  let queuedThisDelivery = false;
  if (type === EventType.DELIVERED && shouldHandleAsAlarm && !isRepostNotification) {
    const existing = await getPendingAlarm();
    const existingId = existing?.notification?.id || "";
    const hasActive = Boolean(existingId) && !existing?.resolvedAt;
    if (hasActive && existingId !== notificationId) {
      queuedThisDelivery = await enqueueAlarmNotification(detail.notification as PendingAlarmNotification);
      if (queuedThisDelivery) {
        vrLog("pending_alarm", "delivered_queued_instead_of_activate", {
          traceId: trace,
          notificationId,
          activeNotificationId: existingId,
        });
        try {
          markInternalDismissIgnore(notificationId);
          await notifee.cancelDisplayedNotification(notificationId);
        } catch {
          // ignore
        }
      }
    } else {
      await setPendingAlarm(detail.notification as PendingAlarmNotification);
    }
  }

  // Handle PRESS events - mark as externally launched for alarm notifications
  if (type === EventType.PRESS && shouldHandleAsAlarm) {
    // Skip alarm_display_* notifications - their IDs don't match the real pending alarm
    if (!isAlarmDisplayNotification) {
      // Don't override an active alarm; queue this press-notification instead.
      const existing = await getPendingAlarm();
      const existingId = existing?.notification?.id || "";
      const hasActive = Boolean(existingId) && !existing?.resolvedAt;
      if (hasActive && existingId !== notificationId) {
        await enqueueAlarmNotification(detail.notification as PendingAlarmNotification);
        return;
      }
      // Ensure pending exists before marking origin
      await setPendingAlarm(detail.notification as PendingAlarmNotification);
      // Mark as externally launched (user tapped notification)
      await markPendingAlarmLaunchedExternally(notificationId, "press");
    }
  }

  async function startAlarmAudioIfPossible(): Promise<void> {
    if (!shouldHandleAsAlarm) return;
    if (Platform.OS !== "android") return;
    await startAlarmAudioFromNotification(detail.notification as PendingAlarmNotification);
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
      if (shouldIgnoreInternalDismiss(notificationId)) {
        vrLog('notifee', 'dismiss_ignored_internal', {
          traceId: trace,
          id: notificationId,
          reason: 'internal_cancel_or_repost',
        });
        return;
      }

      // Ignore stale dismiss events from old alarms so they don't clear
      // currently active pending/displayed alarms.
      const pending = await getPendingAlarm();
      const displayed = await getDisplayedAlarm();
      const pendingId = pending?.notification?.id || "";
      const displayedId = displayed || "";
      const isCurrentPending = pendingId === notificationId;
      const isCurrentDisplayed = displayedId === notificationId;

      if (!isCurrentPending && !isCurrentDisplayed) {
        vrLog('notifee', 'dismiss_ignored_stale', {
          traceId: trace,
          id: notificationId,
          pendingId,
          displayedId,
        });
        return;
      }

      await stopAlarmAudioIfPlaying();
      await cancelDisplayedAlarmNotifications(notificationId);
      const resolveId = isCurrentPending ? notificationId : pendingId;
      if (resolveId) {
        await markPendingAlarmResolved(resolveId, "dismiss");
      }
      await clearPendingAlarm({ promoteNext: true });
      return;
    }
    await stopAlarmAudioIfPlaying();
    return;
  }

  // Handle notification action buttons (Dismiss/Snooze from lockscreen)
  if (type === EventType.ACTION_PRESS) {
    const actionId = detail.pressAction?.id;
    console.log(`[VR] Action pressed: ${actionId}`);
    const isKnownAlarmAction = actionId === "dismiss_action" || actionId === "snooze_action";

    // Ignore non-action presses here (e.g. "default" routed via ACTION_PRESS on some devices).
    if (shouldHandleAsAlarm && !isKnownAlarmAction) {
      vrLog('notifee', 'action_press_ignored', {
        traceId: trace,
        id: notificationId,
        actionId,
      });
      return;
    }

    if (shouldHandleAsAlarm) {
      const pending = await getPendingAlarm();
      const displayed = await getDisplayedAlarm();
      const pendingId = pending?.notification?.id || "";
      const displayedId = displayed || "";
      const isCurrentPending = pendingId === notificationId;
      const isCurrentDisplayed = displayedId === notificationId;
      if (!isCurrentPending && !isCurrentDisplayed) {
        vrLog("notifee", "action_press_ignored_stale", {
          traceId: trace,
          id: notificationId,
          actionId,
          pendingId,
          displayedId,
        });
        return;
      }

      await stopAlarmAudioIfPlaying();
      await cancelDisplayedAlarmNotifications(notificationId);
      const resolveId = isCurrentPending ? notificationId : pendingId;

      if (actionId === "snooze_action" && reminderId) {
        console.log("[VR] Snooze action from notification");
        const snoozeDuration = Number(notificationData?.snoozeDuration ?? "5") || 5;
        const autoSnoozeCount = Math.max(0, Number(notificationData?.autoSnoozeCount ?? "0") || 0);
        await scheduleSnoozeOccurrenceFromNotification(
          detail.notification as PendingAlarmNotification,
          snoozeDuration,
          {
            autoSnoozeCount: String(autoSnoozeCount),
            autoSnoozeReason: "manual_action",
          }
        );
        console.log(`[VR] Snoozed for ${snoozeDuration} minutes`);
      }

      if (actionId === "dismiss_action") {
        if (resolveId) {
          await markPendingAlarmResolved(resolveId, "dismiss");
        }
      } else if (actionId === "snooze_action") {
        if (resolveId) {
          await markPendingAlarmResolved(resolveId, "snooze");
        }
      }
      await clearPendingAlarm({ promoteNext: true });
    } else {
      await stopAlarmAudioIfPlaying();
    }

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

    if (actionId === "snooze_action") return;

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
    if (shouldHandleAsAlarm && isTriggerNotification && !isRepostNotification && !queuedThisDelivery) {
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
            markInternalDismissIgnore(notificationId);
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
              launchActivityFlags: [AndroidLaunchActivityFlag.NEW_TASK],
            },
            fullScreenAction: {
              id: "default",
              launchActivity: ANDROID_ALARM_ACTIVITY,
              launchActivityFlags: [AndroidLaunchActivityFlag.NEW_TASK],
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

    if (!isRepostNotification && !queuedThisDelivery) {
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
    // Try new unified schedule system first, fall back to legacy
    const scheduleType = typeof data?.scheduleType === "string" && data.scheduleType 
      ? (data.scheduleType as 'once' | 'interval' | 'rrule') 
      : null;
    const frequency = typeof data?.frequency === "string" ? (data.frequency as string) : "";
    
    if (!scheduleType && !frequency) {
      console.log("[VR] Notification missing schedule type and frequency, skipping reschedule");
      return;
    }
    if (!data?.reminderId) {
      console.log("[VR] Notification missing reminderId, skipping reschedule");
      return;
    }

    // Determine if this is a one-time reminder
    const isOneTime = scheduleType === 'once' || (!scheduleType && frequency === 'once');
    
    if (!isOneTime) {
      const kind = (data.kind as string) || "reminder_occurrence";
      if (kind === "snooze_occurrence") {
        console.log("[VR] Snooze notification delivered, not rescheduling");
        return;
      }

      let nextTrigger: number | null = null;
      
      // Try unified schedule system first
      if (scheduleType) {
        const schedule: Schedule = {
          type: scheduleType,
          onceAt: data.onceAt ? Number(data.onceAt) : undefined,
          intervalMs: data.intervalMs ? Number(data.intervalMs) : undefined,
          anchorAt: data.anchorAt ? Number(data.anchorAt) : undefined,
          rrule: data.rrule as string | undefined,
          dtstart: data.dtstart ? Number(data.dtstart) : undefined,
          tzid: data.tzid as string | undefined,
          until: data.until ? Number(data.until) : undefined,
        } as Schedule;
        
        nextTrigger = getNextOccurrence(schedule, Date.now());
      }
      
      // Fall back to legacy scheduling
      if (nextTrigger === null && frequency) {
        if (frequency === "interval") {
          const intervalMs = Number(data.intervalMs);
          const anchorAt = Number(data.anchorAt);
          const scheduledFor = Number(data.scheduledFor);

          if (intervalMs && anchorAt) {
            // Stable cadence + skip missed: compute from the later of (scheduledFor, now)
            const ref = Math.max(scheduledFor || Date.now(), Date.now());
            const { scheduledFor: next } = getNextIntervalOccurrence(anchorAt, intervalMs, ref);
            nextTrigger = next;
          }
        } else if (["daily", "weekly", "custom"].includes(frequency)) {
          const schedule: ReminderSchedule = {
            time: data.time as string,
            frequency,
            days: data.days ? (data.days as string).split(",") : undefined,
            intervalDays: data.intervalDays ? Number(data.intervalDays) : undefined,
            scheduledFor: Number(data.scheduledFor),
          };
          nextTrigger = getNextTriggerTime(schedule);
        }
      }
      
      if (nextTrigger === null) {
        // Check if this is due to until boundary
        const until = data.until ? Number(data.until) : undefined;
        if (until && Date.now() >= until) {
          console.log(`[VR] Recurrence stopped: until boundary reached (${new Date(until).toLocaleString()})`);
        } else {
          console.warn("[VR] Could not compute next occurrence, skipping reschedule");
        }
        return;
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

    // One-time reminders with any terminal history should never be rescheduled.
    const terminalHistoryIds = new Set(
      history
        .filter((h) => h.status === "completed" || h.status === "missed")
        .map((h) => h.reminderId)
    );

    let synced = 0,
      skipped = 0,
      failed = 0;
    let permissionError = false;

    for (const reminder of reminders) {
      // One-time reminders: skip if already completed/missed.
      const isOneTime = reminder.scheduleType === 'once' || 
                        (!reminder.scheduleType && reminder.frequency === 'once');
      
      if (isOneTime) {
        if (terminalHistoryIds.has(reminder.id)) {
          skipped++;
          continue;
        }

        // If there's a pending alarm for this reminder, don't create a duplicate trigger.
        if (pendingReminderId && pendingReminderId === reminder.id && pending && !pending.resolvedAt) {
          if (!Number.isFinite(pendingScheduledFor) || pendingScheduledFor <= now) {
            skipped++;
            continue;
          }
        }

        // If this one-time reminder is already past due, don't resurrect it as "now + 5s".
        // It can be shown as overdue in UI, but it should not keep scheduling.
        let due: number;
        if (reminder.scheduleType === 'once' && reminder.onceAt) {
          due = reminder.onceAt;
        } else {
          due = getNextTriggerTime(
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
        }
        if (due <= now) {
          // Record a missed occurrence so overdue one-time reminders are visible in history.
          // Keep the reminder itself; UI can still show it as overdue in "All".
          try {
            const store = useReminderStore.getState();
            await store.recordCompletion(reminder.id, reminder.title, "missed", {
              scheduledFor: Number.isFinite(due) ? due : undefined,
              action: "auto_missed",
            });
            terminalHistoryIds.add(reminder.id);
            console.log(`[VR] Auto-recorded missed one-time reminder ${reminder.id}`);
          } catch (missErr) {
            console.log(`[VR] Failed to auto-record missed reminder ${reminder.id}:`, missErr);
          }
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
          audioUrl: reminder.audioUrl ?? "",
          snoozeEnabled: reminder.snoozeEnabled,
          snoozeDuration: reminder.snoozeDuration,
          volume: reminder.volume,
          volumeStyle: reminder.volumeStyle,
          intervalMs: reminder.intervalMs,
          anchorAt: reminder.anchorAt,
          intervalDays: reminder.intervalDays,
          scheduledFor: reminder.scheduledFor,
          // New unified schedule fields
          scheduleType: reminder.scheduleType,
          onceAt: reminder.onceAt,
          rrule: reminder.rrule,
          dtstart: reminder.dtstart,
          tzid: reminder.tzid,
          until: reminder.until,
          parseWarnings: reminder.parseWarnings,
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
        if (e?.name === "NoFutureOccurrenceError") {
          skipped++;
          continue;
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
