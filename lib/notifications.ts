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
import * as Linking from "expo-linking";
import { alarmAudioService } from "./AudioService";
import {
  documentDirectory,
  downloadAsync,
  deleteAsync,
  getInfoAsync,
} from "expo-file-system/legacy";
import {
  getNextIntervalOccurrence,
  getNextTriggerTime,
  planGridOccurrences,
  MAX_PENDING_OCCURRENCES,
  ReminderSchedule,
} from "./time";
import { Reminder, ReminderHistory, useReminderStore } from "./store";
import { vrLog, buildTraceId } from "./vrLog";
import { logAppTaskState } from "./activityControl";
import {
  getNextOccurrence,
  migrateLegacySchedule,
  normalizeSchedule,
  Schedule,
  ScheduleWarning,
  type GridSchedule,
} from "./schedule";
import {
  isAlarmOccurrenceNotification as isAlarmOccurrenceKind,
  isTriggerNotification as isTriggerNotificationId,
  isOneTimeReminder,
  isSnoozeOccurrence,
  parseRepostFlag,
  isRepostNotification as isRepostNotificationCheck,
  shouldHandleAsAlarm as shouldHandleAsAlarmCheck,
  isDuplicateDeliveredEvent,
  isDuplicateOccurrence,
  shouldQueueInsteadOfActivate,
  filterDuplicateTriggerIds,
  getAlarmStartTime,
  shouldHandleTimeout,
  hasActivePendingAlarm,
  adjustPastDueTrigger,
  shouldRecordAsMissedInstead,
  isStaleDelivery,
  isKnownAlarmAction as isKnownAlarmActionCheck,
  isCurrentActiveAlarm,
  isPreAlert,
  parsePreReminderMinutes,
  shouldSchedulePreAlert,
  preAlertTriggerTime,
  filterPreAlertTriggerIds,
  buildPreAlertBody,
  normalizeUrgencyTier,
  parseNagCount,
  shouldNagAgain,
  planNagChain,
  remainingNagComebacks,
  nagIndexForFireTime,
  NAG_DELAY_MINUTES,
  MAX_NAG_COMEBACKS,
} from "./notificationDecisions";
import {
  alarmAppKey,
  nagAppKey,
  isNagAppKey,
  parseAlarmAppKey,
  reconcileAlarmEvents,
  dedupeByAppKey,
  cancelAlarm as cancelNativeAlarm,
  getAndClearEventLog as drainNativeAlarmEvents,
  getScheduledAlarms as getScheduledNativeAlarms,
  requestAuthorization as requestAlarmKitAuthorization,
  scheduleAlarm as scheduleNativeAlarm,
  settleInFlightAppKeys,
  // Aliased on import: the contract name trips react-hooks/rules-of-hooks
  // wherever it is called from a plain async function.
  useAlarmKit as alarmKitEnabled,
} from "./alarmKit";
// Note: Audio playback is handled by alarm screen (app/alarm.tsx)

// AK-3 owns lib/alarmSounds.ts and may land after this file. Guarded exactly
// like AudioService.ts guards react-native-sound: without it, native alarms
// fall back to the system default alarm sound.
let alarmSounds: {
  ensureAlarmSound?: (reminderId: string, wavUrl?: string | null) => Promise<string | null>;
  removeAlarmSound?: (reminderId: string) => Promise<void>;
} | null = null;

try {
  alarmSounds = require("./alarmSounds");
} catch {
  alarmSounds = null;
}

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

// Lockscreen action button titles. Action IDs are stable
// (dismiss_action/snooze_action) — only the display titles changed (OLD-53).
const DONE_ACTION_TITLE = "Done";
const LATER_ACTION_TITLE = "Later";

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

// OLD-98: `exceptId` is a SET of occurrences to keep, not one — a reminder that
// rings at 08:00 and 21:00 holds both triggers at the same time.
async function cancelExistingReminderOccurrenceTriggers(
  reminderId: string,
  exceptId?: string | string[]
): Promise<number> {
  if (!reminderId) return 0;
  try {
    const scheduledIds = await notifee.getTriggerNotificationIds();
    const toCancel = filterDuplicateTriggerIds(scheduledIds, reminderId, exceptId);
    for (const id of toCancel) {
      try {
        await notifee.cancelTriggerNotification(id);
      } catch {
        // ignore
      }
    }
    return toCancel.length;
  } catch {
    return 0;
  }
}

async function cancelExistingPreAlertTriggers(reminderId: string, exceptId?: string): Promise<number> {
  if (!reminderId) return 0;
  try {
    const scheduledIds = await notifee.getTriggerNotificationIds();
    const toCancel = filterPreAlertTriggerIds(scheduledIds, reminderId, exceptId);
    for (const id of toCancel) {
      try {
        await notifee.cancelTriggerNotification(id);
      } catch {
        // ignore
      }
    }
    return toCancel.length;
  } catch {
    return 0;
  }
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
  return isAlarmOccurrenceKind(getNotificationKind(notification));
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

  // Every ring of a reminder — the occurrence and every nag comeback — speaks
  // the same recorded take (OLD-96). No per-ring line selection.
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
  // Headless-safe cadence only (this path can run with a limited JS lifetime):
  // routine tier speaks the line once and goes quiet, everything else loops
  // continuously as before. The richer cadence (speak-twice-with-gap) is
  // orchestrated from the alarm UI surfaces, which stay alive while ringing.
  const tier = normalizeUrgencyTier(data.urgency);
  const ok = await alarmAudioService.ensurePlaying(localAudioPath, {
    volume: targetVolume,
    streamType: "alarm",
    loop: tier !== "routine",
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
  // Identical text, identical audio — a comeback is the same ring again.
  const body = (data.description as string) || notification.body || "";

  await notifee.createTriggerNotification(
    {
      id: `snooze_${reminderId}_${Date.now()}`,
      title,
      body,
      ios: {
        sound: "default",
        foregroundPresentationOptions: {
          banner: true,
          list: true,
          badge: true,
          sound: true,
        },
      },
      android: {
        channelId,
        importance: AndroidImportance.HIGH,
        category: AndroidCategory.ALARM,
        visibility: AndroidVisibility.PUBLIC,
        autoCancel: false,
        lightUpScreen: true,
        actions: [
          { title: DONE_ACTION_TITLE, pressAction: { id: "dismiss_action" } },
          { title: LATER_ACTION_TITLE, pressAction: { id: "snooze_action" } },
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

/**
 * The nag: bring this ring back in NAG_DELAY_MINUTES with the identical audio.
 *
 * Returns false when the chain is over (MAX_NAG_COMEBACKS already delivered),
 * which is the caller's signal to record the occurrence as missed instead.
 * The comeback lives under the `snooze_<id>_` prefix, so it never collides with
 * — and is never cancelled alongside — the reminder's next scheduled ring.
 */
async function scheduleNagComeback(
  notification: PendingAlarmNotification,
  reason: "dismissed" | "ring_timeout" | "later_action"
): Promise<boolean> {
  const data = notification.data || {};
  const reminderId = typeof data.reminderId === "string" ? data.reminderId : "";
  if (!reminderId) return false;

  // Pre-OLD-96 payloads carry the ladder's counter under the old name; reading
  // it keeps a ring that was already in flight during the update capped.
  const nagCount = parseNagCount(data.nagCount ?? data.followUpCount);
  if (!shouldNagAgain(nagCount)) return false;

  const nextCount = nagCount + 1;
  await scheduleSnoozeOccurrenceFromNotification(notification, NAG_DELAY_MINUTES, {
    nagCount: String(nextCount),
    nagReason: reason,
  });
  vrLog("pending_alarm", "nag_scheduled", {
    notificationId: notification.id || "",
    reminderId,
    nagCount: nextCount,
    delayMinutes: NAG_DELAY_MINUTES,
    reason,
  });
  return true;
}

/**
 * "Done" ends the chain: drop a comeback that is already registered and reset
 * the counter. Only `snooze_<id>_` keys die — the reminder's own upcoming
 * occurrences stay armed.
 */
async function cancelPendingNags(reminderId: string): Promise<void> {
  if (!reminderId) return;
  const prefix = `snooze_${reminderId}_`;
  try {
    const scheduledIds = await notifee.getTriggerNotificationIds();
    for (const id of scheduledIds) {
      if (!id.startsWith(prefix)) continue;
      try {
        await notifee.cancelTriggerNotification(id);
      } catch {
        // ignore
      }
    }
  } catch {
    // ignore
  }
  if (await alarmKitEnabled()) {
    await cancelAlarmKitNags(reminderId);
    await patchAlarmKitState(reminderId, { nagCount: 0 });
  }
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
              { title: DONE_ACTION_TITLE, pressAction: { id: "dismiss_action" } },
              { title: LATER_ACTION_TITLE, pressAction: { id: "snooze_action" } },
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
    markInternalDismissIgnore(id);
    try {
      await notifee.cancelDisplayedNotification(id);
    } catch {
      // ignore
    }
  }

  // AlarmKit mirror: the acknowledged ring's own native alarm goes with it —
  // and nothing else. One occurrence is one alarm now (OLD-96), so there are no
  // siblings to chase, and the reminder's other pending rings (08:00 answered,
  // 21:00 still armed) must survive. Pre-alert ids do not parse as alarm app
  // keys, so they never reach the registry.
  if (await alarmKitEnabled()) {
    for (const id of ids) {
      if (!parseAlarmAppKey(id)) continue;
      await cancelNativeAlarm(id);
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
    const startedAt = getAlarmStartTime(pending.ringingAt, pending.uiShownAt, pending.storedAt || now);
    if (!shouldHandleTimeout(now - startedAt, ALARM_RING_TIMEOUT_MS)) return false;

    const data = pending.notification.data || {};
    const reminderId = typeof data.reminderId === "string" ? data.reminderId : "";
    const nagCount = parseNagCount(data.nagCount ?? data.followUpCount);

    vrLog("pending_alarm", "timeout_fired", {
      notificationId,
      reminderId,
      source,
      nagCount,
    });

    await alarmAudioService.stop().catch(() => {});
    try {
      await notifee.cancelNotification(notificationId);
    } catch {
      // ignore
    }
    await cancelDisplayedAlarmNotifications(notificationId);

    // An unattended ring counts as a dismissal (OLD-96): the same take comes
    // back in five minutes until the comebacks run out.
    if (await scheduleNagComeback(pending.notification, "ring_timeout")) {
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
  const startedAt = getAlarmStartTime(activePending.ringingAt, activePending.uiShownAt, activePending.storedAt || now);
  const elapsed = now - startedAt;
  if (shouldHandleTimeout(elapsed, ALARM_RING_TIMEOUT_MS)) {
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

// Returns false when the system settings could not be opened, so the caller can
// tell the user instead of the tap doing nothing.
export async function openNotificationSettingsSafe(): Promise<boolean> {
  // notifee.openNotificationSettings is Android-only. On iOS (and if notifee
  // ever fails on Android) fall back to the app's own page in Settings, which
  // has Notifications one tap away.
  if (Platform.OS === "android") {
    try {
      const fn = (notifee as any).openNotificationSettings;
      if (typeof fn === "function") {
        await fn();
        return true;
      }
      console.log("[VR] notifee.openNotificationSettings is not available");
    } catch (e) {
      console.log("[VR] Failed to open notification settings:", e);
    }
  }
  try {
    await Linking.openSettings();
    return true;
  } catch (e) {
    console.log("[VR] Failed to open system settings:", e);
    return false;
  }
}

// Battery optimization lets the OS (especially Samsung/OEM "app sleep") force-stop
// the app, which silently cancels every scheduled alarm and blocks the boot
// receiver that would restore them. Exemption is required for reliable delivery.
export async function isBatteryOptimizationEnabledSafe(): Promise<boolean> {
  if (Platform.OS !== "android") return false;
  try {
    return await notifee.isBatteryOptimizationEnabled();
  } catch (e) {
    console.log("[VR] isBatteryOptimizationEnabled failed:", e);
    return false;
  }
}

export async function openBatteryOptimizationSettingsSafe(): Promise<void> {
  // Direct one-tap "Allow app to run in background?" system dialog
  // (requires REQUEST_IGNORE_BATTERY_OPTIMIZATIONS in the manifest).
  try {
    const IntentLauncher = await import("expo-intent-launcher");
    await IntentLauncher.startActivityAsync(
      "android.settings.REQUEST_IGNORE_BATTERY_OPTIMIZATIONS",
      { data: "package:com.wahabbasa.VoiceReminder" }
    );
    return;
  } catch (e) {
    console.log("[VR] Direct battery exemption dialog failed, falling back:", e);
  }
  // Fallback: the global battery optimization settings list
  try {
    await notifee.openBatteryOptimizationSettings();
  } catch (e) {
    console.log("[VR] Failed to open battery optimization settings:", e);
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
  // Alarm-compatible copy of the spoken line (AK-3). Only iOS AlarmKit reads
  // it; absent means the native alarm rings with the system default sound.
  wavUrl?: string;
  preReminderMinutes?: number; // heads-up lead time in minutes (0/absent = none)
  preAudioUrl?: string;
  // Ring cadence (how the one spoken line plays while an alarm is ringing).
  urgency?: string; // "urgent" | "notice" | "routine"
  persistent?: boolean;
  volume?: number; // 0-1
  volumeStyle?: "standard" | "progressive";

  // Interval recurrence
  intervalMs?: number;
  anchorAt?: number;
  intervalDays?: number;
  scheduledFor?: number;

  /**
   * The days × times grid (OLD-97). Authoritative for WHEN this rings whenever
   * it is present: the execution layer plans off the grid and only falls back
   * to `scheduleType`/`frequency` for reminders created before it existed.
   */
  schedule?: GridSchedule;

  // New unified schedule system ('grid' is OLD-97's days × times model)
  scheduleType?: 'once' | 'interval' | 'rrule' | 'grid';
  onceAt?: number;
  rrule?: string;
  dtstart?: number;
  tzid?: string;
  until?: number;
  parseWarnings?: string[];
}

// ─── Occurrence set (OLD-98) ────────────────────────────────────────────────
//
// A grid reminder rings N times a day, so it owns N pending triggers rather
// than one. The id scheme already separates them — `reminder_<id>_<ts>` is
// unique per ring — so the work is keeping the SET intact wherever the old code
// assumed a single trigger it could freely cancel.

function occurrenceGrid(reminder: ReminderNotification): GridSchedule | null {
  return reminder.schedule?.type === "grid" ? reminder.schedule : null;
}

/**
 * Read the grid back off the store when the caller's object predates it.
 *
 * Same read-through as `withStoredWavUrls`, same reason: some create flows
 * still hand-build a ReminderNotification out of legacy fields only, while the
 * store always has a grid (it backfills one on every write). A caller that DOES
 * supply a grid always wins, so a freshly edited schedule is never overwritten
 * by the stored one.
 */
function withStoredSchedule(reminder: ReminderNotification): ReminderNotification {
  if (occurrenceGrid(reminder)) return reminder;
  try {
    const stored = useReminderStore.getState().getReminderById(reminder.id);
    if (stored?.schedule?.type === "grid") {
      return { ...reminder, schedule: stored.schedule };
    }
  } catch {
    // Store unavailable (headless task) — the legacy path below still works.
  }
  return reminder;
}

/** The grid a notification payload carries, or null on a pre-grid payload. */
function parseOccurrenceGrid(value: unknown): GridSchedule | null {
  if (typeof value !== "string" || !value) return null;
  try {
    const parsed = JSON.parse(value);
    return parsed && parsed.type === "grid" ? (parsed as GridSchedule) : null;
  } catch {
    return null;
  }
}

function getLocalAudioPath(reminderId: string): string {
  return `${documentDirectory}reminder_${reminderId}.mp3`;
}

function getLocalPreAudioPath(reminderId: string): string {
  return `${documentDirectory}reminder_${reminderId}_pre.mp3`;
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

export async function downloadPreReminderAudio(
  reminderId: string,
  preAudioUrl: string
): Promise<string> {
  const localPath = getLocalPreAudioPath(reminderId);

  const existingFile = await getInfoAsync(localPath);
  if (existingFile.exists && existingFile.size > 0) {
    return localPath;
  }

  console.log(`[VR] Downloading pre-alert audio from ${preAudioUrl}`);
  await downloadAsync(preAudioUrl, localPath);
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

export async function deleteLocalPreAudio(reminderId: string): Promise<void> {
  const localPath = getLocalPreAudioPath(reminderId);
  try {
    await deleteAsync(localPath, { idempotent: true });
  } catch (e) {
    console.log("[VR] Failed to delete local pre-alert audio:", e);
  }
}

/**
 * Sweep the replay variant mp3s a pre-OLD-108 build downloaded.
 *
 * Nothing writes these files any more — the nag repeats the base line, so there
 * are no variant audios to fetch — but an install that hydrated before the
 * strip has up to three of them per reminder sitting in Documents, and deleting
 * the reminder is the only moment anything would ever go looking. Best-effort,
 * like every other local cleanup here.
 */
const LEGACY_VARIANT_SLOTS = 3;

export async function deleteLocalVariantAudios(reminderId: string): Promise<void> {
  for (let i = 0; i < LEGACY_VARIANT_SLOTS; i++) {
    try {
      await deleteAsync(`${documentDirectory}reminder_${reminderId}_v${i}.mp3`, {
        idempotent: true,
      });
    } catch (e) {
      console.log("[VR] Failed to delete local variant audio:", e);
    }
  }
}

export async function requestNotificationPermission(): Promise<boolean> {
  const settings = await notifee.requestPermission();
  const granted = settings.authorizationStatus >= 1;

  // iOS 26 AlarmKit rides the notification step — this function is what
  // PermissionPrompt's "Notifications" row calls, and it is the only prompt
  // surface we have. No-op on Android and on iOS without the native bridge.
  if (granted && Platform.OS === "ios") {
    const status = await requestAlarmKitAuthorization();
    vrLog("alarmkit", "authorization", { status });
  }

  return granted;
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

type PreAlertOccurrenceInput = {
  reminderId: string;
  title: string;
  mainTriggerTimestamp: number;
  preReminderMinutes: number;
  preAudioUrl?: string;
  volume?: number;
  frequency?: string;
  scheduleType?: string;
};

/**
 * Schedule (or clear) the soft heads-up trigger paired with a main occurrence.
 * Always call it when the main trigger changes: it removes stale pre-alerts for
 * the reminder even when no new one is scheduled.
 *
 * Pre-alerts are NOT alarms: no fullScreenAction, no pending-alarm state, no
 * repost, no ring timeout — handleNotificationEvent routes kind "pre_alert"
 * through its own lightweight branch.
 */
async function schedulePreAlertForOccurrence(
  input: PreAlertOccurrenceInput
): Promise<string | null> {
  const { reminderId, mainTriggerTimestamp, preReminderMinutes } = input;
  if (!reminderId) return null;
  const preId = `prealert_${reminderId}_${mainTriggerTimestamp}`;

  // One pre-alert per reminder: clear any pre-alert for other occurrences.
  await cancelExistingPreAlertTriggers(reminderId, preId);

  if (!shouldSchedulePreAlert(mainTriggerTimestamp - Date.now(), preReminderMinutes)) {
    // Disabled or too little lead — make sure this occurrence's pre-alert is gone too.
    try {
      await notifee.cancelTriggerNotification(preId);
    } catch {
      // ignore
    }
    return null;
  }

  // Hydrate the spoken heads-up line if we have a URL; the notification alone
  // is acceptable when audio is unavailable.
  if (input.preAudioUrl) {
    try {
      await downloadPreReminderAudio(reminderId, input.preAudioUrl);
    } catch (e) {
      console.log("[VR] Failed to download pre-alert audio (will retry on delivery):", e);
    }
  }

  const preTimestamp = preAlertTriggerTime(mainTriggerTimestamp, preReminderMinutes);
  const trigger: TimestampTrigger = {
    type: TriggerType.TIMESTAMP,
    timestamp: preTimestamp,
    alarmManager: { type: AlarmType.SET_ALARM_CLOCK },
  };

  await notifee.createTriggerNotification(
    {
      id: preId,
      title: input.title,
      body: buildPreAlertBody(input.title, preReminderMinutes),
      ios: {
        sound: "default",
        foregroundPresentationOptions: {
          banner: true,
          list: true,
          badge: true,
          sound: true,
        },
      },
      android: {
        channelId: `reminder_${reminderId}`,
        importance: AndroidImportance.HIGH,
        category: AndroidCategory.REMINDER,
        visibility: AndroidVisibility.PUBLIC,
        autoCancel: true,
        actions: [{ title: "Done", pressAction: { id: "prealert_done_action" } }],
        pressAction: { id: "default" },
      },
      data: {
        reminderId,
        kind: "pre_alert",
        title: input.title,
        preReminderMinutes: String(preReminderMinutes),
        preAudioUrl: input.preAudioUrl ?? "",
        volume: String(input.volume ?? 1),
        frequency: input.frequency ?? "",
        scheduleType: input.scheduleType ?? "",
        mainScheduledFor: String(mainTriggerTimestamp),
        scheduledFor: String(preTimestamp),
      },
    },
    trigger
  );

  console.log(
    `[VR] Scheduled pre-alert ${preId} for ${new Date(preTimestamp).toLocaleString()} (${preReminderMinutes}m before main)`
  );
  return preId;
}

// ─── AlarmKit (iOS 26+) ─────────────────────────────────────────────────────
//
// On iOS 26 with authorization granted, a reminder occurrence is registered
// with the system alarm framework instead of notifee, so it rings through the
// mute switch, Focus and the lockscreen. Every branch below is behind
// alarmKitEnabled(), which is false on Android, on iOS < 26, and in Jest.

// Per-reminder guard state the native side cannot hold for us: the snooze
// window (PRD guard 3) and the nag counter, which travels in notification data
// on the notifee path and has nowhere to live here.
const ALARMKIT_STATE_KEY = "@alarmkit_state";

/**
 * FB21273655 (developer.apple.com/forums/thread/809398): alarms scheduled before
 * an OS point-upgrade silently stopped firing. `getScheduledAlarms()` reads OUR
 * UserDefaults registry, not the daemon, so it keeps listing alarms the system
 * has already dropped — "the key is there" is not evidence the alarm is armed.
 *
 * The first startup sync of a process therefore re-registers every live alarm
 * instead of trusting the registry. Cold start only: reconciliation, not this,
 * runs on each foreground.
 */
let alarmKitRelaunchRefreshPending = true;

/** Test seam — makes the next startup sync behave like a fresh launch again. */
export function resetAlarmKitLaunchRefresh(): void {
  alarmKitRelaunchRefreshPending = true;
}

type AlarmKitReminderState = {
  snoozeUntil?: number;
  /** Comebacks already delivered for the current ring (OLD-96). */
  nagCount?: number;
  /** Fire time of the occurrence the running nag chain belongs to. */
  nagFor?: number;
  /**
   * Nag app key -> the occurrence it belongs to. A reminder can hold several
   * pre-scheduled chains at once (08:00 and 21:00 of the same day), so a single
   * `nagFor` cannot say which ring a comeback is repeating.
   */
  nagOrigins?: Record<string, number>;
};

async function getAlarmKitState(): Promise<Record<string, AlarmKitReminderState>> {
  try {
    const raw = await AsyncStorage.getItem(ALARMKIT_STATE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

async function patchAlarmKitState(
  reminderId: string,
  patch: AlarmKitReminderState
): Promise<void> {
  try {
    const state = await getAlarmKitState();
    state[reminderId] = { ...(state[reminderId] || {}), ...patch };
    await AsyncStorage.setItem(ALARMKIT_STATE_KEY, JSON.stringify(state));
  } catch (e) {
    vrLog("alarmkit", "state_write_failed", { reminderId, error: String(e) });
  }
}

async function clearAlarmKitState(reminderId: string): Promise<void> {
  try {
    const state = await getAlarmKitState();
    if (!(reminderId in state)) return;
    delete state[reminderId];
    await AsyncStorage.setItem(ALARMKIT_STATE_KEY, JSON.stringify(state));
  } catch (e) {
    vrLog("alarmkit", "state_clear_failed", { reminderId, error: String(e) });
  }
}

/** AK-3's hydration, absent-safe. Returns the bare Library/Sounds filename. */
async function ensureAlarmSoundSafe(
  reminderId: string,
  wavUrl?: string | null
): Promise<string | null> {
  if (!alarmSounds?.ensureAlarmSound) return null;
  try {
    return (await alarmSounds.ensureAlarmSound(reminderId, wavUrl ?? null)) ?? null;
  } catch (e) {
    vrLog("alarmkit", "sound_hydration_failed", { reminderId, error: String(e) });
    return null;
  }
}

async function removeAlarmSoundSafe(reminderId: string): Promise<void> {
  if (!alarmSounds?.removeAlarmSound) return;
  try {
    await alarmSounds.removeAlarmSound(reminderId);
  } catch (e) {
    vrLog("alarmkit", "sound_removal_failed", { reminderId, error: String(e) });
  }
}

/**
 * PRD guard 5: there is no cancelAll() — every occurrence alarm of this
 * reminder that is not part of the set we are about to register is cancelled
 * first, because a changed occurrence time changes the app key and the native
 * UUID registry would otherwise keep the stale alarm ringing.
 *
 * A dropped occurrence takes its pre-scheduled comebacks with it, but only when
 * it has not rung yet: a ring in the future is being replaced and owes nothing,
 * while a ring already in the past may be mid-chain and must keep its comebacks
 * (re-planning tomorrow's occurrences must never silence a nag owed right now).
 * Expired comebacks are swept at the same time — the native registry keeps an
 * entry per fired alarm, and those entries count against the alarm budget.
 */
async function cancelStaleAlarmKitAlarms(
  reminderId: string,
  keep: Set<string>
): Promise<void> {
  const occurrencePrefix = `reminder_${reminderId}_`;
  const nagPrefix = `snooze_${reminderId}_`;
  const now = Date.now();

  for (const alarm of await getScheduledNativeAlarms()) {
    if (keep.has(alarm.id)) continue;

    if (alarm.id.startsWith(occurrencePrefix)) {
      await cancelNativeAlarm(alarm.id);
      vrLog("alarmkit", "cancelled_stale", { appKey: alarm.id, reminderId });
      if (alarm.fireDate > now) {
        await cancelAlarmKitNagChain(reminderId, alarm.fireDate, keep);
      }
      continue;
    }

    if (alarm.id.startsWith(nagPrefix) && alarm.fireDate <= now) {
      await cancelNativeAlarm(alarm.id);
      vrLog("alarmkit", "cancelled_spent_nag", { appKey: alarm.id, reminderId });
    }
  }
}

/**
 * Drop the comebacks belonging to ONE ring. Chain-scoped on purpose: a reminder
 * that rings at 08:00 and 21:00 holds two pre-scheduled chains, and answering
 * the morning ring must not disarm the evening one.
 */
async function cancelAlarmKitNagChain(
  reminderId: string,
  originAt: number,
  keep?: Set<string>
): Promise<void> {
  const keys = planNagChain(originAt).map((ts) => nagAppKey(reminderId, ts));
  for (const appKey of keys) {
    if (keep?.has(appKey)) continue;
    await cancelNativeAlarm(appKey);
    vrLog("alarmkit", "cancelled_nag", { appKey, reminderId, originAt });
  }
  await forgetNagOrigins(reminderId, keys);
}

/** Drop every nag comeback registered for this reminder, whatever ring it owes. */
async function cancelAlarmKitNags(reminderId: string): Promise<void> {
  const prefix = `snooze_${reminderId}_`;
  const cancelled: string[] = [];
  for (const alarm of await getScheduledNativeAlarms()) {
    if (!alarm.id.startsWith(prefix)) continue;
    await cancelNativeAlarm(alarm.id);
    cancelled.push(alarm.id);
    vrLog("alarmkit", "cancelled_nag", { appKey: alarm.id, reminderId });
  }
  await forgetNagOrigins(reminderId, cancelled);
}

/** Record which ring each pre-scheduled comeback repeats. */
async function rememberNagOrigins(
  reminderId: string,
  origins: Record<string, number>
): Promise<void> {
  if (Object.keys(origins).length === 0) return;
  const state = await getAlarmKitState();
  await patchAlarmKitState(reminderId, {
    nagOrigins: { ...(state[reminderId]?.nagOrigins || {}), ...origins },
  });
}

async function forgetNagOrigins(reminderId: string, appKeys: string[]): Promise<void> {
  if (appKeys.length === 0) return;
  const state = await getAlarmKitState();
  const existing = state[reminderId]?.nagOrigins;
  if (!existing) return;
  const next = { ...existing };
  let changed = false;
  for (const appKey of appKeys) {
    if (appKey in next) {
      delete next[appKey];
      changed = true;
    }
  }
  if (changed) await patchAlarmKitState(reminderId, { nagOrigins: next });
}

/**
 * Fill the wav field the caller's reminder object is missing from the store copy.
 *
 * The creation flow (app/index.tsx) and the edit sheet both schedule with
 * objects built before audio hydration landed, so `wavUrl` only exists on the
 * store reminder by then. Without this read-through those callers bake the
 * fallback sound (the system default) into the alarm, and AlarmKit sounds
 * cannot be patched after registration. A wav the caller does provide always
 * wins, so schedule-time wavs behave exactly as before.
 */
function withStoredWavUrls(reminder: ReminderNotification): ReminderNotification {
  if (reminder.wavUrl) return reminder;
  const stored = useReminderStore.getState().getReminderById(reminder.id);
  if (!stored) return reminder;
  return { ...reminder, wavUrl: toReminderNotification(stored).wavUrl };
}

/**
 * How many of a reminder's pending occurrences get their comebacks armed up
 * front — the registration budget knob.
 *
 * The arithmetic, because AlarmKit's cap (`AlarmError.maximumLimitReached`) is
 * real and Apple publishes no number: a reminder plans up to
 * MAX_PENDING_OCCURRENCES (4) rings, each chain costs 3 more registrations, and
 * the free tier allows 5 active reminders. Arming every chain would be
 * 5 × (4 + 4×3) = 80 concurrent alarms. At horizon 2 it is 5 × (4 + 2×3) = 50.
 *
 * Horizon 2 covers the rings the app genuinely cannot react to (the next hour of
 * an interval reminder, tonight and tomorrow morning of a clock one). Anything
 * further out is re-armed by the next foreground reconcile or the next launch
 * pass, both of which run long before it fires.
 *
 * Known and accepted: registrations are issued reminder-by-reminder, so under a
 * cap the comebacks of an early reminder can starve the OCCURRENCE of a late
 * one. Handling it properly means a global two-pass scheduler (all occurrences
 * first, then chains); today the mitigation is this horizon plus
 * scheduleAlarmKitNagChain bailing out of a chain on the first refusal.
 */
const NAG_CHAIN_HORIZON = 2;

/** Every app key of one ring's chain: the occurrence first, then its comebacks. */
function nagChainKeys(reminderId: string, originAt: number, comebacks: number[]): string[] {
  return [
    alarmAppKey(reminderId, originAt),
    ...comebacks.map((fireDate) => nagAppKey(reminderId, fireDate)),
  ];
}

/**
 * The metadata every ring of a chain carries.
 *
 * `siblings` is what lets the native intents disarm the rest of the chain the
 * moment the user answers, without the app ever running: VRAlarmIntents.swift
 * reads it back out of the alarm's stored record and cancels those keys.
 */
function nagChainMetadata(
  reminder: ReminderNotification,
  originAt: number,
  fireDate: number,
  nagIndex: number,
  chainKeys: string[],
  selfKey: string
): Record<string, string> {
  return {
    reminderId: reminder.id,
    scheduledFor: String(fireDate),
    tier: normalizeUrgencyTier(reminder.urgency),
    nagFor: String(originAt),
    nagIndex: String(nagIndex),
    nagMax: String(MAX_NAG_COMEBACKS),
    siblings: chainKeys.filter((key) => key !== selfKey).join(","),
  };
}

/**
 * Register one occurrence AND the comebacks it may end up owing (OLD-96).
 *
 * The comebacks are pre-scheduled because they have to be: no code of ours runs
 * when an AlarmKit ring times out unattended, so a comeback that is not already
 * on the daemon's books never happens on a locked phone
 * (docs/alarmkit-focus-breakthrough.md §7). They are cancelled the instant the
 * user answers — natively through the `siblings` metadata, and again from
 * reconciliation as a backstop for the after-first-unlock intent gap.
 *
 * De-duped on the occurrence's appKey: startup gap_resync and a fresh create
 * race on the same occurrence and would otherwise register it twice
 * (2026-08-07 devlog).
 *
 * `keepAppKeys` is the whole reminder's expected set when several occurrences
 * are registered together (OLD-98) — without it, registering the 21:00 ring
 * would cancel the 08:00 one as stale.
 */
async function scheduleAlarmKitOccurrence(
  reminder: ReminderNotification,
  triggerTimestamp: number,
  keepAppKeys?: Set<string>,
  options?: { withNagChain?: boolean }
): Promise<void> {
  const appKey = alarmAppKey(reminder.id, triggerTimestamp);

  return dedupeByAppKey(appKey, async () => {
    // Read the store at execution time: hydration may have landed the wav
    // between the caller building its reminder object and this work running.
    const hydrated = withStoredWavUrls(reminder);
    const withChain = options?.withNagChain !== false;
    const comebacks = withChain
      ? remainingNagComebacks(triggerTimestamp, Date.now())
      : [];
    const chainKeys = nagChainKeys(reminder.id, triggerTimestamp, comebacks);

    const keep = new Set(keepAppKeys ?? [appKey]);
    for (const key of chainKeys) keep.add(key);
    await cancelStaleAlarmKitAlarms(reminder.id, keep);

    const soundName = await ensureAlarmSoundSafe(reminder.id, hydrated.wavUrl);
    const uuid = await scheduleNativeAlarm({
      id: appKey,
      fireDate: triggerTimestamp,
      title: reminder.title,
      soundName,
      // The native Snooze button is the nag by another name — same interval.
      snoozeMinutes: NAG_DELAY_MINUTES,
      metadata: nagChainMetadata(
        hydrated,
        triggerTimestamp,
        triggerTimestamp,
        0,
        chainKeys,
        appKey
      ),
    });

    vrLog("alarmkit", "scheduled", {
      appKey,
      reminderId: reminder.id,
      fireDate: triggerTimestamp,
      soundName: soundName ?? "system_default",
      uuid: uuid ?? "none",
      comebacks: comebacks.length,
    });

    await scheduleAlarmKitNagChain(hydrated, triggerTimestamp, comebacks, {
      chainKeys,
      soundName,
    });
  });
}

/** The appKey of every occurrence in a planned set. */
function occurrenceAppKeys(reminderId: string, occurrences: number[]): Set<string> {
  return new Set(occurrences.map((timestamp) => alarmAppKey(reminderId, timestamp)));
}

/**
 * Arm the comebacks of one ring: the same title, the same sound, the same
 * spoken take, five minutes apart, under the `snooze_<id>_` key family so they
 * coexist with the reminder's other scheduled rings.
 *
 * A registration that fails takes the rest of the chain with it — past
 * AlarmKit's undocumented cap every further call fails too, and comebacks are
 * the tier we are willing to lose (the occurrence itself is already registered).
 */
async function scheduleAlarmKitNagChain(
  reminder: ReminderNotification,
  originAt: number,
  comebacks: number[],
  precomputed?: { chainKeys?: string[]; soundName?: string | null }
): Promise<void> {
  if (comebacks.length === 0) return;

  const chainKeys =
    precomputed?.chainKeys ?? nagChainKeys(reminder.id, originAt, comebacks);
  const soundName =
    precomputed?.soundName !== undefined
      ? precomputed.soundName
      : await ensureAlarmSoundSafe(reminder.id, withStoredWavUrls(reminder).wavUrl);

  const origins: Record<string, number> = {};
  for (const [index, fireDate] of comebacks.entries()) {
    const appKey = nagAppKey(reminder.id, fireDate);
    const uuid = await scheduleNativeAlarm({
      id: appKey,
      fireDate,
      title: reminder.title,
      soundName,
      snoozeMinutes: NAG_DELAY_MINUTES,
      metadata: nagChainMetadata(
        reminder,
        originAt,
        fireDate,
        index + 1,
        chainKeys,
        appKey
      ),
    });

    if (!uuid) {
      vrLog("alarmkit", "nag_chain_truncated", {
        reminderId: reminder.id,
        appKey,
        armed: index,
        wanted: comebacks.length,
      });
      break;
    }

    origins[appKey] = originAt;
    vrLog("alarmkit", "scheduled_nag", {
      appKey,
      reminderId: reminder.id,
      fireDate,
      nagIndex: index + 1,
      soundName: soundName ?? "system_default",
      uuid,
    });
  }

  await rememberNagOrigins(reminder.id, origins);
}

/**
 * Re-register the reminder's live alarms once its wav exists. The sound is
 * baked into the alarm at schedule time (a filename, not notification data),
 * so hydration has to rewrite the alarm rather than patch a payload. Every
 * ring of the reminder — occurrences and the owed nag alike — speaks the same
 * take, so there is nothing to match up beyond "is it still in the future".
 */
async function refreshAlarmKitSound(reminderId: string): Promise<void> {
  const stored = useReminderStore.getState().getReminderById(reminderId);
  if (!stored) return;
  const reminder = toReminderNotification(stored);
  if (!reminder.wavUrl) return;

  // An occurrence set still registering (startup sync racing hydration) must
  // land before the registry is read, or this refresh would rewrite the alarms
  // that already exist while the rest register with stale sounds.
  await settleInFlightAppKeys(`reminder_${reminderId}_`);

  const scheduled = (await getScheduledNativeAlarms()).filter(
    (alarm) => parseAlarmAppKey(alarm.id)?.reminderId === reminderId
  );
  if (scheduled.length === 0) return;

  const soundName = await ensureAlarmSoundSafe(reminderId, reminder.wavUrl);
  if (!soundName) return;

  const state = await getAlarmKitState();
  const origins = state[reminderId]?.nagOrigins || {};
  const now = Date.now();
  for (const alarm of scheduled) {
    // Never touch an alarm at or past its fire time: a native re-register is
    // cancel-then-schedule, which would silence an alarm ringing right now.
    if (alarm.fireDate <= now) continue;
    // Re-registering is a full replace, so the chain metadata has to be rebuilt
    // with it — dropping `siblings` here would leave the native intents unable
    // to disarm the comebacks when the user answers.
    const originAt = isNagAppKey(alarm.id)
      ? origins[alarm.id] ?? alarm.fireDate
      : alarm.fireDate;
    const chainKeys = nagChainKeys(reminderId, originAt, planNagChain(originAt));
    await scheduleNativeAlarm({
      id: alarm.id,
      fireDate: alarm.fireDate,
      title: reminder.title,
      soundName,
      snoozeMinutes: NAG_DELAY_MINUTES,
      metadata: nagChainMetadata(
        reminder,
        originAt,
        alarm.fireDate,
        nagIndexForFireTime(originAt, alarm.fireDate),
        chainKeys,
        alarm.id
      ),
    });
    vrLog("alarmkit", "sound_refreshed", {
      appKey: alarm.id,
      reminderId,
      nag: isNagAppKey(alarm.id),
      soundName,
    });
  }
}

/**
 * Cancel every native alarm belonging to a reminder — every pending occurrence
 * plus any owed nag. This is the fan-out behind reminder deletion and
 * rescheduling, so both key families (`reminder_<id>_`, `snooze_<id>_`) go.
 */
async function cancelAlarmKitForReminder(reminderId: string): Promise<number> {
  const scheduled = await getScheduledNativeAlarms();
  let cancelled = 0;
  for (const alarm of scheduled) {
    if (
      !alarm.id.startsWith(`reminder_${reminderId}_`) &&
      !alarm.id.startsWith(`snooze_${reminderId}_`)
    ) {
      continue;
    }
    await cancelNativeAlarm(alarm.id);
    cancelled++;
    vrLog("alarmkit", "cancelled", { appKey: alarm.id, reminderId });
  }
  return cancelled;
}

/** Roll a recurring reminder forward after its occurrence resolved natively. */
async function rescheduleAlarmKitNextOccurrence(
  reminder: Reminder,
  afterScheduledFor: number
): Promise<void> {
  try {
    await scheduleReminder(toReminderNotification(reminder), {
      occurrenceAfter: afterScheduledFor,
    });
  } catch (e: any) {
    if (e?.name === "NoFutureOccurrenceError") return;
    vrLog("alarmkit", "reschedule_failed", {
      reminderId: reminder.id,
      error: String(e?.message || e),
    });
  }
}

/**
 * Drain the native event log and fold it into app state.
 *
 * Called on cold start and on every foreground: Done/Later run in App Intents
 * outside our JS runtime, so this is the only place their effects land in the
 * store. Safe to call anywhere — it exits immediately unless the gate is on.
 */
export async function reconcileAlarmKitEvents(): Promise<{
  stopped: number;
  snoozed: number;
  missed: number;
  pending: number;
  cancelled: number;
  /** Rings that went unanswered but still owe a comeback. */
  nagged: number;
}> {
  const summary = { stopped: 0, snoozed: 0, missed: 0, pending: 0, cancelled: 0, nagged: 0 };
  if (!(await alarmKitEnabled())) return summary;

  const events = await drainNativeAlarmEvents();
  // Always log the drain result, zero included: an empty drain after a lock-screen
  // answer is indistinguishable from "reconciliation never ran" without this line.
  vrLog("alarmkit", "drained_events", {
    count: events.length,
    ids: events.map((e) => `${e.type}:${e.id}`).slice(0, 8).join("|"),
  });
  if (events.length === 0) return summary;

  const now = Date.now();
  const outcomes = reconcileAlarmEvents(events, now, ALARM_RING_TIMEOUT_MS);

  // One ring is up to four alarms since OLD-96 (the occurrence plus the
  // comebacks pre-scheduled with it), so a single drain routinely carries
  // several outcomes for the SAME ring — a phone left alone for twenty minutes
  // hands back four "it fired and nobody answered". They collapse to one
  // outcome per ring here, or the user gets four missed entries for one dose.
  const alarmKitState = await getAlarmKitState();
  const chainOriginOf = (appKey: string, reminderId: string, scheduledFor: number) =>
    isNagAppKey(appKey)
      ? alarmKitState[reminderId]?.nagOrigins?.[appKey] ??
        alarmKitState[reminderId]?.nagFor ??
        scheduledFor
      : scheduledFor;

  // An answer anywhere in a chain wins over the rings ignored before it: Done on
  // the third comeback means the reminder was done, not missed three times.
  const answered = new Set<string>();
  for (const outcome of outcomes) {
    if (outcome.outcome !== "completed") continue;
    const parsed = parseAlarmAppKey(outcome.id);
    if (!parsed) continue;
    answered.add(
      `${parsed.reminderId}:${chainOriginOf(outcome.id, parsed.reminderId, parsed.scheduledFor)}`
    );
  }
  const handledChains = new Set<string>();

  for (const outcome of outcomes) {
    const parsed = parseAlarmAppKey(outcome.id);
    if (!parsed) continue;
    const { reminderId, scheduledFor } = parsed;

    if (outcome.outcome === "snoozed") {
      // The native SnoozeIntent already registered the follow-up alarm — this
      // side records the guard only and never recalculates (PRD guard 3).
      summary.snoozed++;
      await patchAlarmKitState(reminderId, { snoozeUntil: outcome.snoozeUntil ?? 0 });
      vrLog("alarmkit", "reconciled_snoozed", {
        appKey: outcome.id,
        reminderId,
        snoozeUntil: outcome.snoozeUntil ?? 0,
      });
      continue;
    }

    if (outcome.outcome === "pending") {
      // Still inside the ring window — leave it for the next foreground.
      summary.pending++;
      continue;
    }

    if (outcome.outcome === "cancelled") {
      // An alarm the native side killed rather than the user answering it.
      // Whatever cancelled it recorded the outcome and drove the reschedule;
      // this key must add no history and resurrect nothing.
      summary.cancelled++;
      vrLog("alarmkit", "reconciled_cancelled", {
        appKey: outcome.id,
        reminderId,
        scheduledFor,
      });
      continue;
    }

    const store = useReminderStore.getState();
    const reminder = store.getReminderById(reminderId);
    if (!reminder) {
      vrLog("alarmkit", "reconcile_orphan", { appKey: outcome.id, reminderId });
      continue;
    }
    const isOneTime = isOneTimeReminder(reminder.scheduleType || null, reminder.frequency);

    // History and rescheduling belong to the OCCURRENCE, not to whichever
    // comeback rang last, so every branch below works off the chain's origin.
    const originAt = chainOriginOf(outcome.id, reminderId, scheduledFor);
    const chainId = `${reminderId}:${originAt}`;

    // A ring the user answered later in the chain is not a miss, and a ring
    // already resolved by an earlier outcome in this drain is not a second one.
    if (outcome.outcome === "missed" && answered.has(chainId)) continue;
    if (handledChains.has(chainId)) continue;

    if (outcome.outcome === "completed") {
      handledChains.add(chainId);
      summary.stopped++;
      await store.recordCompletion(reminderId, reminder.title, "completed", {
        scheduledFor: originAt,
        action: "dismissed",
      });
      // "Done" ends the chain wherever it was answered — the ring itself or one
      // of its comebacks. The native stop intent already cancelled the siblings;
      // this is the backstop for the case where it could not run (intents are
      // only available after first unlock).
      await cancelAlarmKitNagChain(reminderId, originAt);
      await patchAlarmKitState(reminderId, { snoozeUntil: 0, nagCount: 0 });
      vrLog("alarmkit", "reconciled_stopped", {
        appKey: outcome.id,
        reminderId,
        scheduledFor: originAt,
      });

      if (isOneTime) {
        const { removeReminderFully } = await import("./reminderRemoval");
        await removeReminderFully(reminderId);
      } else if (outcome.allowReschedule) {
        await rescheduleAlarmKitNextOccurrence(reminder, originAt);
      }
      continue;
    }

    // "missed": the ring went unanswered, which counts as a dismissal (OLD-96).
    // The comebacks were armed when the occurrence was registered — nothing of
    // ours runs at ring-timeout — so the job here is to notice whether the chain
    // still has one owed, NOT to create one.
    const armed = (await getScheduledNativeAlarms()).filter(
      (alarm) =>
        isNagAppKey(alarm.id) &&
        alarm.id.startsWith(`snooze_${reminderId}_`) &&
        alarm.fireDate > now &&
        (alarmKitState[reminderId]?.nagOrigins?.[alarm.id] ?? originAt) === originAt
    );

    if (armed.length > 0) {
      handledChains.add(chainId);
      summary.nagged++;
      await patchAlarmKitState(reminderId, {
        nagFor: originAt,
        nagCount: nagIndexForFireTime(originAt, scheduledFor),
      });
      vrLog("alarmkit", "nag_already_armed", {
        appKey: outcome.id,
        reminderId,
        originAt,
        owed: armed.length,
      });
      continue;
    }

    // Nothing armed. Either the pre-scheduling failed (AlarmKit's registration
    // cap, an OS upgrade that dropped the alarms) or the chain is simply spent.
    // Re-deriving it from the origin answers both: the comebacks are a pure
    // function of the occurrence time.
    const owed = remainingNagComebacks(originAt, now);
    if (owed.length > 0) {
      handledChains.add(chainId);
      summary.nagged++;
      await scheduleAlarmKitNagChain(toReminderNotification(reminder), originAt, owed);
      await patchAlarmKitState(reminderId, {
        nagFor: originAt,
        nagCount: nagIndexForFireTime(originAt, scheduledFor),
      });
      vrLog("alarmkit", "nag_chain_repaired", {
        appKey: outcome.id,
        reminderId,
        originAt,
        armed: owed.length,
      });
      continue;
    }

    handledChains.add(chainId);
    summary.missed++;
    await store.recordCompletion(reminderId, reminder.title, "missed", {
      scheduledFor: originAt,
      action: "auto_missed",
    });
    await cancelAlarmKitNagChain(reminderId, originAt);
    await patchAlarmKitState(reminderId, { nagCount: 0 });
    vrLog("alarmkit", "reconciled_missed", {
      appKey: outcome.id,
      reminderId,
      scheduledFor: originAt,
    });

    if (!isOneTime && outcome.allowReschedule) {
      await rescheduleAlarmKitNextOccurrence(reminder, originAt);
    }
  }

  return summary;
}

export async function scheduleReminder(
  input: ReminderNotification,
  _options?: { traceId?: string; occurrenceAfter?: number }
): Promise<{ triggerTimestamp: number; notificationId: string }> {
  const reminder = withStoredSchedule(input);
  const hasPermission = await requestNotificationPermission();
  if (!hasPermission) {
    throw new Error("Notification permission not granted");
  }

  await assertAndroidExactAlarmAccess();

  // iOS 26 only: this occurrence becomes a system alarm instead of a notifee
  // trigger further down. False everywhere else, so the path below is untouched.
  const alarmKitActive = await alarmKitEnabled();

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

  // Calculate next trigger time using unified scheduling engine.
  // occurrenceAfter lets callers skip a still-future occurrence that was
  // handled early (pre-alert "Done") and land on the one after it.
  const occurrenceRef = Math.max(Date.now(), _options?.occurrenceAfter ?? 0);
  let triggerTimestamp: number;

  // OLD-98: a grid reminder rings N times a day, so it plans a SET of pending
  // occurrences. One occurrence is one registration on both platforms now
  // (OLD-96), so both budgets are the same.
  const grid = occurrenceGrid(reminder);
  let plannedOccurrences: number[] = [];

  if (grid) {
    plannedOccurrences = planGridOccurrences(grid, occurrenceRef, {
      max: MAX_PENDING_OCCURRENCES,
    });
    if (plannedOccurrences.length === 0) {
      // A dated one-off whose day passed keeps the old user-facing wording;
      // anything else is a recurrence that simply ran out (an `until` bound).
      if (grid.days.kind === "date") {
        throw new Error("Reminder time is in the past. Please choose a future time.");
      }
      throw new NoFutureOccurrenceError("No future occurrence for schedule grid", "grid");
    }
    triggerTimestamp = plannedOccurrences[0];
  } else if (reminder.scheduleType) {
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

    const nextOccurrence = getNextOccurrence(schedule, occurrenceRef);
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
    if (reminder.scheduledFor && reminder.scheduledFor > occurrenceRef) {
      triggerTimestamp = reminder.scheduledFor;
    } else {
      const { scheduledFor } = getNextIntervalOccurrence(
        reminder.anchorAt,
        reminder.intervalMs,
        occurrenceRef
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
    triggerTimestamp = getNextTriggerTime(schedule, occurrenceRef);
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

  // A legacy reminder still has exactly one occurrence — the set is just a
  // single element, so everything below runs one lap and behaves as before.
  if (plannedOccurrences.length === 0) plannedOccurrences = [triggerTimestamp];
  const notificationIds = plannedOccurrences.map((ts) => `reminder_${reminder.id}_${ts}`);
  const notificationId = notificationIds[0];

  // Defensive: only the occurrences we just planned may hold a "reminder_*"
  // trigger. Some Android/Notifee edge cases leave stale triggers around, which
  // then fire duplicates. Snoozes use the "snooze_*" prefix and are not touched.
  await cancelExistingReminderOccurrenceTriggers(reminder.id, notificationIds);

  // AlarmKit owns these occurrences: register one native alarm per planned ring
  // and skip the notifee trigger entirely. The pre-alert heads-up stays a plain
  // notification (it is not an alarm surface) so it keeps today's shape.
  if (alarmKitActive) {
    const keepAppKeys = occurrenceAppKeys(reminder.id, plannedOccurrences);
    for (const [index, occurrence] of plannedOccurrences.entries()) {
      await scheduleAlarmKitOccurrence(reminder, occurrence, keepAppKeys, {
        withNagChain: index < NAG_CHAIN_HORIZON,
      });
    }
    await patchAlarmKitState(reminder.id, { snoozeUntil: 0, nagCount: 0 });
    await schedulePreAlertForOccurrence({
      reminderId: reminder.id,
      title: reminder.title,
      mainTriggerTimestamp: triggerTimestamp,
      preReminderMinutes: parsePreReminderMinutes(reminder.preReminderMinutes),
      preAudioUrl: reminder.preAudioUrl,
      volume: reminder.volume,
      frequency: reminder.frequency,
      scheduleType: reminder.scheduleType,
    });
    return { triggerTimestamp, notificationId };
  }

  // Define notification action buttons for lockscreen use
  const actions: AndroidAction[] = [
    {
      title: DONE_ACTION_TITLE,
      pressAction: {
        id: 'dismiss_action',
      },
    },
    {
      title: LATER_ACTION_TITLE,
      pressAction: {
        id: 'snooze_action',
      },
    },
  ];

  // One trigger per planned ring. Each carries the same payload apart from its
  // own `scheduledFor`, so whichever one fires can plan the set again from the
  // grid it is carrying.
  for (const occurrence of plannedOccurrences) {
    const trigger: TimestampTrigger = {
      type: TriggerType.TIMESTAMP,
      timestamp: occurrence,
      alarmManager: {
        type: AlarmType.SET_ALARM_CLOCK, // AlarmClock for lockscreen reliability
      },
    };
    await notifee.createTriggerNotification(
      {
        id: `reminder_${reminder.id}_${occurrence}`,
        title: reminder.title,
        body: reminder.description,
        ios: {
          sound: "default",
          foregroundPresentationOptions: {
            banner: true,
            list: true,
            badge: true,
            sound: true,
          },
        },
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
          preReminderMinutes: String(parsePreReminderMinutes(reminder.preReminderMinutes)),
          preAudioUrl: reminder.preAudioUrl ?? "",
          volume: String(reminder.volume ?? 1),
          volumeStyle: reminder.volumeStyle ?? "standard",

          intervalMs: String(reminder.intervalMs ?? ""),
          anchorAt: String(reminder.anchorAt ?? ""),
          intervalDays: String(reminder.intervalDays ?? ""),
          scheduledFor: String(occurrence),
          kind: "reminder_occurrence",
          autoSnoozeCount: "0",

          // Ring cadence data (how the one spoken line plays while ringing).
          // There is nothing to select between: this ring and every nag comeback
          // speak the reminder's base line (OLD-96, variants stripped OLD-108).
          urgency: reminder.urgency ?? "",
          persistent: String(reminder.persistent ?? false),
          // Comebacks delivered so far for this ring (OLD-96).
          nagCount: "0",

          // The days × times grid (OLD-98) — what the delivery handler plans the
          // next rings from. `scheduleType` stays the legacy token so the
          // one-off checks that read it keep working.
          schedule: grid ? JSON.stringify(grid) : "",

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
  }

  // Soft heads-up before the main alarm (also clears stale pre-alerts when off).
  await schedulePreAlertForOccurrence({
    reminderId: reminder.id,
    title: reminder.title,
    mainTriggerTimestamp: triggerTimestamp,
    preReminderMinutes: parsePreReminderMinutes(reminder.preReminderMinutes),
    preAudioUrl: reminder.preAudioUrl,
    volume: reminder.volume,
    frequency: reminder.frequency,
    scheduleType: reminder.scheduleType,
  });

  const logNow = Date.now();
  const deltaMs = triggerTimestamp - logNow;
  const scheduleSource = _options?.traceId ? "create_flow" : "sync_or_internal";
  console.log(
    `[VR] schedule_debug source=${scheduleSource} id=${reminder.id} freq=${reminder.frequency} scheduleType=${reminder.scheduleType ?? "legacy"} occurrences=${plannedOccurrences.length} now=${new Date(logNow).toISOString()} trigger=${new Date(triggerTimestamp).toISOString()} deltaMs=${deltaMs} deltaMin=${Math.round(deltaMs / 60000)}`
  );

  console.log(
    `[VR] Scheduled notification for ${new Date(triggerTimestamp).toLocaleString()}`
  );

  return { triggerTimestamp, notificationId };
}

export async function cancelReminder(reminderId: string): Promise<void> {
  const channelId = `reminder_${reminderId}`;

  // Cancel all scheduled notifications for this reminder (occurrence + snooze + pre-alert)
  const scheduledIds = await notifee.getTriggerNotificationIds();
  const toCancel = scheduledIds.filter(
    (id) =>
      id.startsWith(`reminder_${reminderId}_`) ||
      id.startsWith(`snooze_${reminderId}_`) ||
      id.startsWith(`prealert_${reminderId}_`)
  );

  for (const id of toCancel) {
    await notifee.cancelNotification(id);
  }

  // A pre-alert that already fired is displayed, not scheduled — clear it too.
  try {
    const displayed = await notifee.getDisplayedNotifications();
    for (const d of displayed) {
      const id = d.notification?.id || d.id;
      if (id && id.startsWith(`prealert_${reminderId}_`)) {
        await notifee.cancelDisplayedNotification(id);
      }
    }
  } catch {
    // ignore
  }

  // AlarmKit mirror: those occurrences have no notifee trigger to cancel.
  if (await alarmKitEnabled()) {
    await cancelAlarmKitForReminder(reminderId);
    await clearAlarmKitState(reminderId);
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
  await deleteLocalPreAudio(reminderId);
  await deleteLocalVariantAudios(reminderId);
  if (Platform.OS === "ios") {
    await removeAlarmSoundSafe(reminderId);
  }
  console.log(`[VR] Deleted reminder ${reminderId} with audio`);
}

/**
 * Refresh scheduled notification data after audio becomes available.
 * Updates the notification data to include the audioUrl (and, when provided,
 * the pre-alert's preAudioUrl) without changing the trigger times.
 */
export async function refreshNotificationWithAudio(
  reminderId: string,
  audioUrl: string,
  preAudioUrl?: string
): Promise<void> {
  try {
    // AlarmKit occurrences carry their sound as a Library/Sounds filename, not
    // as notification data, so hydration has to re-register them instead.
    if (await alarmKitEnabled()) {
      await refreshAlarmKitSound(reminderId);
    }

    // Get all trigger notifications
    const allNotifications = await notifee.getTriggerNotifications();

    for (const notification of allNotifications) {
      const id = notification.notification.id;
      if (!id) continue;

      const isMainTrigger = id.startsWith(`reminder_${reminderId}_`);
      const isPreAlertTrigger = id.startsWith(`prealert_${reminderId}_`);
      if (!isMainTrigger && !isPreAlertTrigger) continue;

      const data = notification.notification.data || {};
      let updatedData: Record<string, any> | null = null;

      if (isMainTrigger) {
        // Already carries this audio — nothing to do. Keeps repeat hydration a no-op.
        const mainCurrent = data.audioUrl === audioUrl;
        const preCurrent = preAudioUrl === undefined || data.preAudioUrl === preAudioUrl;
        if (!mainCurrent || !preCurrent) {
          updatedData = {
            ...data,
            audioUrl,
            ...(preAudioUrl !== undefined ? { preAudioUrl } : {}),
          };
        }
      } else if (preAudioUrl !== undefined && data.preAudioUrl !== preAudioUrl) {
        updatedData = { ...data, preAudioUrl };
      }

      if (!updatedData) continue;

      try {
        // Recreate with the SAME id: notifee replaces the trigger atomically.
        // Never cancel first — if the process dies between cancel and create,
        // the AlarmManager alarm fires with no notification data and the
        // reminder is silently lost (observed on-device 2026-08-06 14:59).
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

// Map a store Reminder to the scheduling input (shared by startup sync and
// the pre-alert "Done" reschedule path).
function toReminderNotification(reminder: Reminder): ReminderNotification {
  return {
    id: reminder.id,
    title: reminder.title,
    description: reminder.description,
    time: reminder.time,
    date: reminder.date,
    frequency: reminder.frequency,
    days: reminder.days,
    audioUrl: reminder.audioUrl ?? "",
    wavUrl: (reminder as Reminder & { wavUrl?: string }).wavUrl,
    preReminderMinutes: reminder.preReminderMinutes,
    preAudioUrl: reminder.preAudioUrl,
    urgency: reminder.urgency,
    persistent: reminder.persistent,
    volume: reminder.volume,
    volumeStyle: reminder.volumeStyle,
    intervalMs: reminder.intervalMs,
    anchorAt: reminder.anchorAt,
    intervalDays: reminder.intervalDays,
    scheduledFor: reminder.scheduledFor,
    // The grid is authoritative for when this rings (OLD-98); the legacy fields
    // above are only its first-ring projection.
    schedule: reminder.schedule,
    // New unified schedule fields
    scheduleType: reminder.scheduleType,
    onceAt: reminder.onceAt,
    rrule: reminder.rrule,
    dtstart: reminder.dtstart,
    tzid: reminder.tzid,
    until: reminder.until,
    parseWarnings: reminder.parseWarnings,
  };
}

/**
 * DELIVERED handling for kind "pre_alert": play the spoken heads-up once.
 * Deliberately none of the alarm lifecycle — no pending-alarm state, no
 * cancel+repost, no ring timeout, no loop, no reschedule of the main trigger.
 */
async function handlePreAlertDelivered(notification: PendingAlarmNotification): Promise<void> {
  const data = notification.data || {};
  const reminderId = typeof data.reminderId === "string" ? data.reminderId : "";
  const notificationId = notification.id || "";
  if (!reminderId) return;

  const mainScheduledFor = Number(data.mainScheduledFor);

  // Delivered at/after the main alarm time (device off, OEM freeze): a
  // heads-up is meaningless now — drop it silently.
  if (Number.isFinite(mainScheduledFor) && mainScheduledFor > 0 && Date.now() >= mainScheduledFor) {
    vrLog("pre_alert", "delivered_stale_dropped", { notificationId, reminderId });
    try {
      markInternalDismissIgnore(notificationId);
      await notifee.cancelDisplayedNotification(notificationId);
    } catch {
      // ignore
    }
    return;
  }

  vrLog("pre_alert", "delivered", { notificationId, reminderId });

  if (Platform.OS !== "android") return;

  // Never steal the audio channel from an actively ringing alarm.
  const pending = await getPendingAlarm();
  if (pending?.notification?.id && !pending.resolvedAt) {
    vrLog("pre_alert", "audio_skipped_active_alarm", { notificationId, reminderId });
    return;
  }

  const localPath = getLocalPreAudioPath(reminderId);
  let hasAudio = false;
  try {
    const info = await getInfoAsync(localPath);
    hasAudio = Boolean(info.exists && info.size);
  } catch {
    // ignore stat errors
  }
  if (!hasAudio) {
    const preAudioUrl = typeof data.preAudioUrl === "string" ? data.preAudioUrl : "";
    if (preAudioUrl) {
      try {
        await downloadPreReminderAudio(reminderId, preAudioUrl);
        hasAudio = true;
      } catch (e) {
        console.log("[VR] Pre-alert audio download failed:", e);
      }
    }
  }
  if (!hasAudio) {
    // Notification alone is acceptable for a heads-up.
    return;
  }

  const rawVolume = Number(data.volume ?? "1");
  const volume = Math.max(0, Math.min(1, Number.isFinite(rawVolume) ? rawVolume : 1));
  await alarmAudioService.ensurePlaying(localPath, {
    volume,
    streamType: "alarm",
    loop: false,
  });
}

/**
 * "Done" pressed on a pre-alert: the user handled the event early. Record the
 * completion, cancel the paired main occurrence, and for recurring reminders
 * schedule the following occurrence (the cancelled one can no longer
 * reschedule itself on delivery).
 */
async function handlePreAlertDonePress(notification: PendingAlarmNotification): Promise<void> {
  const data = notification.data || {};
  const reminderId = typeof data.reminderId === "string" ? data.reminderId : "";
  const notificationId = notification.id || "";
  const mainScheduledFor = Number(data.mainScheduledFor);

  vrLog("pre_alert", "done_pressed", { notificationId, reminderId });

  // Clear the displayed pre-alert itself.
  if (notificationId) {
    try {
      markInternalDismissIgnore(notificationId);
      await notifee.cancelNotification(notificationId);
    } catch {
      // ignore
    }
  }

  // Stop the one-shot heads-up audio if still speaking. Guarded so a ringing
  // real alarm (which shares alarmAudioService) is never silenced from here.
  const pending = await getPendingAlarm();
  if (!pending?.notification?.id || pending.resolvedAt) {
    await alarmAudioService.stop().catch(() => {});
  }

  if (!reminderId) return;

  // Cancel the main trigger for this occurrence — and, on the AlarmKit path,
  // the comebacks registered alongside it. Answering early is still answering:
  // leaving the chain armed would nag about a reminder already marked done.
  if (Number.isFinite(mainScheduledFor) && mainScheduledFor > 0) {
    try {
      await notifee.cancelNotification(`reminder_${reminderId}_${mainScheduledFor}`);
    } catch {
      // ignore
    }
    if (await alarmKitEnabled()) {
      await cancelNativeAlarm(alarmAppKey(reminderId, mainScheduledFor));
      await cancelAlarmKitNagChain(reminderId, mainScheduledFor);
    }
  }

  const store = useReminderStore.getState();
  const reminder = store.getReminderById(reminderId);
  if (!reminder) return;

  try {
    await store.recordCompletion(reminderId, reminder.title, "completed", {
      scheduledFor: Number.isFinite(mainScheduledFor) && mainScheduledFor > 0 ? mainScheduledFor : undefined,
      action: "pre_alert_done",
    });
  } catch (e) {
    console.log("[VR] Failed to record pre-alert completion:", e);
  }

  // One-time reminders: same full-removal flow as dismiss_action.
  if (reminder.frequency === "once") {
    const { removeReminderFully } = await import("./reminderRemoval");
    await removeReminderFully(reminderId);
    return;
  }

  // Recurring: schedule the occurrence after the one just completed
  // (scheduleReminder also schedules its pre-alert).
  try {
    const { triggerTimestamp } = await scheduleReminder(toReminderNotification(reminder), {
      occurrenceAfter:
        Number.isFinite(mainScheduledFor) && mainScheduledFor > 0 ? mainScheduledFor : Date.now(),
    });
    const current = store.getReminderById(reminderId);
    if (current && current.scheduledFor !== triggerTimestamp) {
      await store.updateReminder({ ...current, scheduledFor: triggerTimestamp });
    }
  } catch (e) {
    console.log("[VR] Failed to schedule next occurrence after pre-alert done:", e);
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
  const isRepostedFlag = parseRepostFlag(repostFlag);
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

  const shouldHandleAsAlarm = shouldHandleAsAlarmCheck(reminderId, kind);

  const isRepostNotification = isRepostNotificationCheck(notificationId, repostFlag);

  // Delivered way past its scheduled time (device off / OEM force-stop wiped the
  // alarm and it only re-registered on app open): record as missed, don't ring.
  const staleDelivery =
    type === EventType.DELIVERED &&
    shouldHandleAsAlarm &&
    !isRepostNotification &&
    isStaleDelivery(Number(scheduledFor), Date.now());

  vrLog('notifee', 'handleEvent_flags', {
    traceId: trace,
    shouldHandleAsAlarm,
    repostFlag: isRepostedFlag,
    alarmDisplayId: isAlarmDisplayNotification,
    isRepost: isRepostNotification,
  });

  await enforcePendingAlarmTimeout();

  let queuedThisDelivery = false;
  if (type === EventType.DELIVERED && shouldHandleAsAlarm && !isRepostNotification && !staleDelivery) {
    const existing = await getPendingAlarm();
    const existingId = existing?.notification?.id || "";
    const hasActive = Boolean(existingId) && !existing?.resolvedAt;
    if (hasActive && existingId === notificationId) {
      // Some devices/libraries can emit duplicate DELIVERED events for the same notification.
      // Treat it as idempotent: if it's already active, don't re-run lifecycle (repost/audio/reschedule).
      vrLog("pending_alarm", "delivered_duplicate_id_ignored", {
        traceId: trace,
        notificationId,
      });
      return;
    }
    if (hasActive && existingId !== notificationId) {
      const existingData: any = existing?.notification?.data || {};
      const existingReminderId =
        typeof existingData?.reminderId === "string" ? (existingData.reminderId as string) : "";
      const existingScheduledFor =
        typeof existingData?.scheduledFor === "string" ? (existingData.scheduledFor as string) : String(existingData?.scheduledFor ?? "");

      // If two notifications represent the same reminder occurrence, ignore the duplicate entirely.
      // This can happen if multiple triggers exist for the same reminder/timestamp.
      if (existingReminderId && existingReminderId === reminderId && existingScheduledFor && existingScheduledFor === scheduledFor) {
        vrLog("pending_alarm", "delivered_duplicate_occurrence_ignored", {
          traceId: trace,
          notificationId,
          activeNotificationId: existingId,
          reminderId,
          scheduledFor,
        });
        try {
          markInternalDismissIgnore(notificationId);
          await notifee.cancelDisplayedNotification(notificationId);
        } catch {
          // ignore
        }
        return;
      }

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
    // iOS reaches here only while JS is alive (app foregrounded); playback goes
    // through the AVAudioSession Playback category, which bypasses the mute switch.
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
      // Swiping a ring away is a dismissal, not a completion: the same take
      // comes back in five minutes (OLD-96). "Done" is the only thing that
      // ends the chain.
      const nagged = await scheduleNagComeback(
        detail.notification as PendingAlarmNotification,
        "dismissed"
      );
      const resolveId = isCurrentPending ? notificationId : pendingId;
      if (resolveId) {
        await markPendingAlarmResolved(resolveId, nagged ? "snooze" : "dismiss");
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

    // Pre-alert "Done": handled entirely outside the alarm lifecycle.
    if (actionId === "prealert_done_action") {
      await handlePreAlertDonePress(detail.notification as PendingAlarmNotification);
      return;
    }

    const isKnownAlarmAction = isKnownAlarmActionCheck(actionId);

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
        // "Later" is a dismissal like any other: it feeds the same fixed nag
        // chain instead of a per-reminder snooze duration (OLD-96).
        console.log("[VR] Later action from notification");
        await scheduleNagComeback(
          detail.notification as PendingAlarmNotification,
          "later_action"
        );
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
      console.log("[VR] Done action from notification");
      // Done ends the nag chain — drop the comeback this ring already earned.
      await cancelPendingNags(reminderId);
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

    // Pre-alert heads-up: play its audio once and stop. Never falls through to
    // the repost/reschedule logic below (that would reschedule the main
    // occurrence off a pre-alert delivery).
    if (isPreAlert(kind)) {
      await handlePreAlertDelivered(detail.notification as PendingAlarmNotification);
      return;
    }

    const data = notificationData;

    const isTriggerNotification = isTriggerNotificationId(notificationId);

    // Ignore reposted "alarm_display_*" notifications for alarm lifecycle processing.
    // They exist only to deliver full-screen UI reliably and can otherwise cause loops/duplicate reschedules.
    if (shouldHandleAsAlarm && isRepostNotification) {
      console.log(`[VR] delivered_ignore reason=reposted id=${notificationId} repostFlag=${isRepostedFlag} alarmDisplayId=${isAlarmDisplayNotification}`);
      return;
    }

    if (staleDelivery) {
      vrLog("pending_alarm", "stale_delivery_missed", {
        traceId: trace,
        notificationId,
        reminderId,
        scheduledFor,
        lateMs: Date.now() - Number(scheduledFor),
      });
      try {
        markInternalDismissIgnore(notificationId);
        await notifee.cancelDisplayedNotification(notificationId);
      } catch {
        // ignore
      }
      if (reminderId) {
        try {
          const store = useReminderStore.getState();
          const reminder = store.getReminderById(reminderId);
          if (reminder) {
            const scheduledForNum = Number(scheduledFor);
            await store.recordCompletion(reminderId, reminder.title, "missed", {
              scheduledFor: Number.isFinite(scheduledForNum) ? scheduledForNum : undefined,
              action: "auto_missed",
            });
          }
        } catch (e) {
          console.log("[VR] Failed to record stale-delivery miss:", e);
        }
      }
      // Fall through: recurring reminders below still reschedule their next occurrence.
    }

    // The main alarm supersedes its heads-up: clear a still-displayed pre-alert
    // for this occurrence so the tray doesn't show both.
    if (shouldHandleAsAlarm && !isRepostNotification && reminderId && scheduledFor) {
      try {
        await notifee.cancelDisplayedNotification(`prealert_${reminderId}_${scheduledFor}`);
      } catch {
        // ignore
      }
    }

    // Cancel+repost lifecycle: cancel any previously displayed alarm to ensure
    // full-screen intent can trigger (many devices block full-screen if channel has uncleared notifications)
    if (shouldHandleAsAlarm && isTriggerNotification && !isRepostNotification && !queuedThisDelivery && !staleDelivery) {
      const previouslyDisplayed = await getDisplayedAlarm();
      if (previouslyDisplayed && previouslyDisplayed !== notificationId) {
        console.log("[VR] Cancelling previous displayed alarm:", previouslyDisplayed);
        try {
          await notifee.cancelDisplayedNotification(previouslyDisplayed);
        } catch {
          // ignore
        }
      }

      if (Platform.OS === "android") {
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
                { title: DONE_ACTION_TITLE, pressAction: { id: "dismiss_action" } },
                { title: LATER_ACTION_TITLE, pressAction: { id: "snooze_action" } },
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
      } else {
        // iOS: no full-screen intent lifecycle. Cancelling+reposting here just
        // eats the banner, so keep the delivered notification as the displayed
        // alarm; the in-app overlay + spoken audio cover the foreground case.
        await setDisplayedAlarm(notificationId);
      }
    }

    // Try to download audio if missing
    if (shouldHandleAsAlarm && !isRepostNotification && !staleDelivery && data?.reminderId) {
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

    if (!isRepostNotification && !queuedThisDelivery && !staleDelivery) {
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
    const isOneTime = isOneTimeReminder(scheduleType || null, frequency);

    if (!isOneTime) {
      const kind = (data.kind as string) || "reminder_occurrence";
      if (isSnoozeOccurrence(kind)) {
        console.log("[VR] Snooze notification delivered, not rescheduling");
        return;
      }

      let nextTrigger: number | null = null;

      // OLD-98: the grid the trigger carries is the authority. It plans the
      // whole pending set, so a reminder that rings twice a day tops itself
      // back up on every delivery instead of walking one ring at a time.
      const deliveredGrid = parseOccurrenceGrid(data.schedule);
      let plannedNext: number[] = [];
      if (deliveredGrid) {
        plannedNext = planGridOccurrences(deliveredGrid, Date.now(), {
          max: MAX_PENDING_OCCURRENCES,
        });
        nextTrigger = plannedNext[0] ?? null;
      }

      // Try unified schedule system first (only when there is no grid — a grid
      // that ran out has genuinely ended and must not be revived from here).
      if (!deliveredGrid && scheduleType) {
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
      if (!deliveredGrid && nextTrigger === null && frequency) {
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
      const adjustedTrigger = adjustPastDueTrigger(nextTrigger, now);
      if (adjustedTrigger !== nextTrigger) {
        console.warn("[VR] Next trigger in past, adjusted to now + 5s");
      }
      nextTrigger = adjustedTrigger;
      // A legacy reminder still tops up exactly one occurrence.
      if (plannedNext.length === 0) plannedNext = [nextTrigger];

      const reminderId = data.reminderId as string;
      const wantedIds = plannedNext.map((ts) => `reminder_${reminderId}_${ts}`);

      // Keep the occurrences we still want and drop everything else, instead of
      // cancelling the lot: the other rings of a multi-time day are already
      // registered and re-creating them would lose their pending state.
      await cancelExistingReminderOccurrenceTriggers(reminderId, wantedIds);
      const liveIds = new Set(await notifee.getTriggerNotificationIds());

      for (const [index, occurrence] of plannedNext.entries()) {
        const occurrenceId = wantedIds[index];
        // The delivered trigger is gone from the registry, so it is recreated
        // here only if the grid still wants it; the rest are left alone.
        if (liveIds.has(occurrenceId)) continue;

        const trigger: TimestampTrigger = {
          type: TriggerType.TIMESTAMP,
          timestamp: occurrence,
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
            id: occurrenceId,
            data: {
              ...detail.notification!.data,
              scheduledFor: String(occurrence),
              kind: "reminder_occurrence",
              // Each fresh occurrence starts its nag chain from scratch.
              nagCount: "0",
            },
          },
          trigger
        );
      }

      // Move the pre-alert along with the main trigger (clears stale ones when off).
      await schedulePreAlertForOccurrence({
        reminderId: data.reminderId as string,
        title: (data.title as string) || detail.notification?.title || "Reminder",
        mainTriggerTimestamp: nextTrigger,
        preReminderMinutes: parsePreReminderMinutes(data.preReminderMinutes),
        preAudioUrl: typeof data.preAudioUrl === "string" && data.preAudioUrl ? (data.preAudioUrl as string) : undefined,
        volume: Number(data.volume ?? "1"),
        frequency: frequency || undefined,
        scheduleType: scheduleType || undefined,
      });

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

    // On the AlarmKit path the gap check reads the native alarm registry
    // instead of notifee's trigger IDs — no notifee trigger exists to find.
    const alarmKitActive = await alarmKitEnabled();
    const alarmKitIds = alarmKitActive
      ? (await getScheduledNativeAlarms()).map((a) => a.id)
      : [];
    const alarmKitState = alarmKitActive ? await getAlarmKitState() : {};
    // FB21273655 guard: this is the launch pass, so every live alarm is
    // re-registered rather than trusted (see the flag's comment).
    const relaunchRefresh = alarmKitActive && alarmKitRelaunchRefreshPending;
    if (alarmKitActive) alarmKitRelaunchRefreshPending = false;

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
      const isOneTime = isOneTimeReminder(reminder.scheduleType || null, reminder.frequency);
      
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
              schedule: reminder.schedule,
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
      const mainPrefix = `reminder_${reminder.id}_`;

      // PRD guard 3: a live native snooze owns this reminder's next ring.
      if (alarmKitActive && Number(alarmKitState[reminder.id]?.snoozeUntil ?? 0) > now) {
        vrLog("alarmkit", "sync_snooze_guard", {
          reminderId: reminder.id,
          snoozeUntil: Number(alarmKitState[reminder.id]?.snoozeUntil ?? 0),
        });
        skipped++;
        continue;
      }

      // What the grid says this reminder should be holding right now (OLD-98).
      // Null for a pre-grid reminder, which still owns exactly one occurrence.
      const grid = reminder.schedule?.type === "grid" ? reminder.schedule : null;
      const planned = grid
        ? planGridOccurrences(grid, now, { max: MAX_PENDING_OCCURRENCES })
        : null;
      if (planned && planned.length === 0) {
        // The recurrence ran out (an `until` bound, a passed one-off).
        skipped++;
        continue;
      }

      // The AlarmKit path expects the whole planned SET to be live, not just
      // one alarm: a set that lost occurrences (OS eviction, a half-finished
      // schedule) is repaired in place before the reminder counts as intact.
      // Nag comebacks are a different key family and never enter this check —
      // an owed nag must not make the next occurrence look already scheduled.
      let scheduledMainId: string | undefined;
      if (alarmKitActive) {
        const mine = alarmKitIds.filter((id) => id.startsWith(mainPrefix));
        const fireTimes = mine
          .map((id) => Number(id.slice(mainPrefix.length)))
          .filter((ts) => Number.isFinite(ts) && ts > 0);

        if (fireTimes.length > 0) {
          // An alarm that is mid-flight (at or before now) is left alone: it is
          // ringing or has just rung, and re-registering it would silence it.
          const midFlight = fireTimes.some((ts) => ts <= now);
          // Pre-grid reminder: one occurrence, one alarm — the earliest live
          // alarm IS the occurrence, nothing to reconstruct.
          const targets = planned ?? [Math.min(...fireTimes)];
          const expected = occurrenceAppKeys(reminder.id, targets);
          const present = new Set(mine);
          const missing = [...expected].filter((id) => !present.has(id));
          // Only a grid knows which of the reminder's alarms are surplus; a
          // pre-grid reminder's extra keys are left where they are.
          const stray = planned ? mine.filter((id) => !expected.has(id)) : [];

          if (!midFlight && (relaunchRefresh || missing.length || stray.length)) {
            vrLog("alarmkit", "occurrence_set_repair", {
              reminderId: reminder.id,
              occurrences: targets.length,
              missing: missing.length,
              stray: stray.length,
              reason: relaunchRefresh ? "launch_reregister" : "gap",
            });
            for (const [index, occurrence] of targets.entries()) {
              try {
                await scheduleAlarmKitOccurrence(
                  toReminderNotification(reminder),
                  occurrence,
                  planned ? expected : present,
                  { withNagChain: index < NAG_CHAIN_HORIZON }
                );
              } catch (repairErr) {
                console.log(`[VR] Occurrence repair failed for ${reminder.id}:`, repairErr);
              }
            }
          }
          scheduledMainId = `${mainPrefix}${targets[0]}`;
        }
      } else if (planned) {
        // The whole planned set has to be live, not just one of it: a reminder
        // that rings at 08:00 and 21:00 is only intact when both triggers exist.
        const present = new Set(scheduledIds.filter((id) => id.startsWith(mainPrefix)));
        const intact = planned.every((ts) => present.has(`${mainPrefix}${ts}`));
        scheduledMainId = intact ? `${mainPrefix}${planned[0]}` : undefined;
      } else {
        scheduledMainId = scheduledIds.find((id) => id.startsWith(mainPrefix));
      }
      if (scheduledMainId) {
        // Main trigger intact — make sure its pre-alert matches the current setting.
        try {
          const mainTs = Number(scheduledMainId.slice(mainPrefix.length));
          const preMinutes = parsePreReminderMinutes(reminder.preReminderMinutes);
          if (Number.isFinite(mainTs) && mainTs > 0 && preMinutes > 0) {
            const preId = `prealert_${reminder.id}_${mainTs}`;
            if (scheduledIds.includes(preId)) {
              // Keep the paired pre-alert; drop strays from older occurrences.
              await cancelExistingPreAlertTriggers(reminder.id, preId);
            } else {
              await schedulePreAlertForOccurrence({
                reminderId: reminder.id,
                title: reminder.title,
                mainTriggerTimestamp: mainTs,
                preReminderMinutes: preMinutes,
                preAudioUrl: reminder.preAudioUrl,
                volume: reminder.volume,
                frequency: reminder.frequency,
                scheduleType: reminder.scheduleType,
              });
            }
          } else {
            await cancelExistingPreAlertTriggers(reminder.id);
          }
        } catch (preErr) {
          console.log(`[VR] Pre-alert sync failed for ${reminder.id}:`, preErr);
        }
        skipped++;
        continue;
      }

      if (alarmKitActive) {
        vrLog("alarmkit", "gap_resync", { reminderId: reminder.id });
      }

      try {
        const { triggerTimestamp } = await scheduleReminder(toReminderNotification(reminder));
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
