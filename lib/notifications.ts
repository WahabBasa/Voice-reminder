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
  parseAutoSnoozeCount,
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
  parsePersistentFlag,
  parseFollowUpCount,
  parseVariantCount,
  normalizeUrgencyTier,
  shouldContinueFollowUps,
  followUpDelayMinutes,
  followUpVariantIndex,
  parseVariantList,
  variantLineForIndex,
  MAX_REPLAY_VARIANTS,
  ladderOffsetsMs,
  ladderRungTimes,
} from "./notificationDecisions";
import {
  alarmAppKey,
  parseAlarmAppKey,
  reconcileAlarmEvents,
  buildAlarmLadder,
  ladderMetadata,
  dedupeByAppKey,
  cancelAlarm as cancelNativeAlarm,
  getAndClearEventLog as drainNativeAlarmEvents,
  getScheduledAlarms as getScheduledNativeAlarms,
  requestAuthorization as requestAlarmKitAuthorization,
  scheduleAlarm as scheduleNativeAlarm,
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
  ensureVariantAlarmSound?: (
    reminderId: string,
    rung: number,
    wavUrl?: string | null
  ) => Promise<string | null>;
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

async function cancelExistingReminderOccurrenceTriggers(reminderId: string, exceptId?: string): Promise<number> {
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

  // Follow-up occurrences carry the variant index of their spoken line; play
  // that file when it exists locally, else fall back to the base line.
  let localAudioPath = getLocalAudioPath(reminderId);
  const variantIndexRaw = Number(data.variantIndex ?? "-1");
  if (Number.isFinite(variantIndexRaw) && variantIndexRaw >= 0) {
    const variantPath = getLocalVariantAudioPath(reminderId, variantIndexRaw);
    try {
      const variantInfo = await getInfoAsync(variantPath);
      if (variantInfo.exists && variantInfo.size) {
        localAudioPath = variantPath;
      }
    } catch {
      // fall back to base
    }
  }

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
  // continuously as before. The richer cadences (alternating variants,
  // speak-twice-with-gap) are orchestrated from the alarm UI surfaces, which
  // stay alive while ringing.
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
  extraData?: Record<string, string>,
  bodyOverride?: string
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
  const body = bodyOverride || (data.description as string) || notification.body || "";

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
    try {
      await notifee.cancelDisplayedNotification(id);
    } catch {
      // ignore
    }
  }

  // AlarmKit mirror: acknowledging one rung in-app has to silence the rest of
  // the occurrence's ladder, exactly as the native Done intent does. Pre-alert
  // ids do not parse as alarm app keys, so they never reach the registry.
  const parsed = [...ids].map(parseAlarmAppKey).find((p) => p !== null);
  if (parsed && (await alarmKitEnabled())) {
    await cancelStaleAlarmKitAlarms(parsed.reminderId, new Set());
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
    const persistent = parsePersistentFlag(data.persistent);
    const followUpCount = parseFollowUpCount(data.followUpCount);
    const continueLadder = shouldContinueFollowUps(persistent, followUpCount);

    vrLog("pending_alarm", "timeout_fired", {
      notificationId,
      reminderId,
      source,
      followUpCount,
      persistent,
      continueLadder,
    });

    await alarmAudioService.stop().catch(() => {});
    try {
      await notifee.cancelNotification(notificationId);
    } catch {
      // ignore
    }
    await cancelDisplayedAlarmNotifications(notificationId);

    if (continueLadder) {
      // Assistant-style replay: come back with the NEXT variant line, firmer
      // each time. Persistent reminders keep going (interval capped at 10 min
      // after the 3rd follow-up); default reminders stop after 2 follow-ups.
      const nextFollowUp = followUpCount + 1;
      const delayMinutes = followUpDelayMinutes(nextFollowUp);
      const variantCount = parseVariantCount(data.variantCount);
      const variantIndex = followUpVariantIndex(nextFollowUp, variantCount);
      const variants = parseVariantList(data.variants);
      const baseLine =
        (typeof data.description === "string" && data.description) ||
        pending.notification.body ||
        "";
      const followUpLine = variantLineForIndex(variants, variantIndex, baseLine);

      vrLog("pending_alarm", "follow_up_scheduled", {
        notificationId,
        reminderId,
        followUpCount: nextFollowUp,
        delayMinutes,
        variantIndex,
        persistent,
      });

      await scheduleSnoozeOccurrenceFromNotification(
        pending.notification,
        delayMinutes,
        {
          followUpCount: String(nextFollowUp),
          variantIndex: String(variantIndex),
          followUpReason: "ring_timeout",
        },
        followUpLine
      );
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
  // Assistant-style replays (OLD-53)
  urgency?: string; // "urgent" | "notice" | "routine"
  persistent?: boolean;
  variants?: string[];
  variantAudioUrls?: string[];
  // Alarm-ready wavs for the ladder rungs, index-aligned with `variants`.
  // iOS AlarmKit only; a null/absent entry falls back to the base wav.
  variantWavUrls?: (string | null)[];
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

function getLocalPreAudioPath(reminderId: string): string {
  return `${documentDirectory}reminder_${reminderId}_pre.mp3`;
}

export function getLocalVariantAudioPath(reminderId: string, variantIndex: number): string {
  return `${documentDirectory}reminder_${reminderId}_v${variantIndex}.mp3`;
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
 * Best-effort download of the replay variant audios to their local slots.
 * A missing/failed variant download never throws — ringing falls back to the
 * base line when a variant file is absent.
 */
export async function downloadVariantAudios(
  reminderId: string,
  variantAudioUrls: string[]
): Promise<void> {
  const urls = variantAudioUrls.slice(0, MAX_REPLAY_VARIANTS);
  for (let i = 0; i < urls.length; i++) {
    const url = urls[i];
    if (!url) continue;
    const localPath = getLocalVariantAudioPath(reminderId, i);
    try {
      const existing = await getInfoAsync(localPath);
      if (existing.exists && existing.size > 0) continue;
      await downloadAsync(url, localPath);
    } catch (e) {
      console.log(`[VR] Failed to download variant audio ${i} for ${reminderId}:`, e);
    }
  }
}

export async function deleteLocalVariantAudios(reminderId: string): Promise<void> {
  for (let i = 0; i < MAX_REPLAY_VARIANTS; i++) {
    try {
      await deleteAsync(getLocalVariantAudioPath(reminderId, i), { idempotent: true });
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
// window (PRD guard 3) and the escalation-ladder counter, which travels in
// notification data on the notifee path and has nowhere to live here.
const ALARMKIT_STATE_KEY = "@alarmkit_state";

type AlarmKitReminderState = {
  snoozeUntil?: number;
  followUpCount?: number;
  // Ladder rung wavs arrive with hydration but the reminder store has no field
  // for them, so the urls live here — a rung re-staged in a later session
  // re-downloads its own wav instead of silently dropping to the base line.
  variantWavUrls?: (string | null)[];
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

/** AK-3's variant hydration for ladder rung `rung` (>= 1), absent-safe. */
async function ensureVariantAlarmSoundSafe(
  reminderId: string,
  rung: number,
  wavUrl?: string | null
): Promise<string | null> {
  if (!alarmSounds?.ensureVariantAlarmSound) return null;
  try {
    return (
      (await alarmSounds.ensureVariantAlarmSound(reminderId, rung, wavUrl ?? null)) ?? null
    );
  } catch (e) {
    vrLog("alarmkit", "variant_sound_hydration_failed", { reminderId, rung, error: String(e) });
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
 * The ladder's variant wav urls, remembered across sessions.
 *
 * They arrive with hydration and the reminder store has no column for them, so
 * a fresh set is written through to the AlarmKit state and a later session
 * (startup resync, reschedule) reads them back from there.
 */
async function resolveVariantWavUrls(
  reminder: ReminderNotification
): Promise<(string | null)[]> {
  const fresh = reminder.variantWavUrls;
  if (fresh?.length) {
    await patchAlarmKitState(reminder.id, { variantWavUrls: fresh });
    return fresh;
  }
  const state = await getAlarmKitState();
  return state[reminder.id]?.variantWavUrls ?? [];
}

/**
 * PRD guard 5: there is no cancelAll() — every alarm of this reminder that is
 * not part of the set we are about to register is cancelled first, because a
 * changed occurrence time changes the app key and the native UUID registry
 * would otherwise keep the stale alarm ringing.
 */
async function cancelStaleAlarmKitAlarms(
  reminderId: string,
  keep: Set<string>
): Promise<void> {
  const scheduled = await getScheduledNativeAlarms();
  for (const alarm of scheduled) {
    if (!alarm.id.startsWith(`reminder_${reminderId}_`)) continue;
    if (keep.has(alarm.id)) continue;
    await cancelNativeAlarm(alarm.id);
    vrLog("alarmkit", "cancelled_stale", { appKey: alarm.id, reminderId });
  }
}

/** The Library/Sounds filename rung `rung` should ring, base wav as fallback. */
async function rungSoundName(
  reminderId: string,
  rung: number,
  variantIndex: number,
  variantWavUrls: (string | null)[],
  baseSound: string | null
): Promise<string | null> {
  if (rung <= 0) return baseSound;
  const variantSound = await ensureVariantAlarmSoundSafe(
    reminderId,
    rung,
    variantWavUrls[variantIndex]
  );
  // A missing variant wav falls back to the base wav, never to the system
  // default — the assistant repeating itself beats it going silent.
  return variantSound ?? baseSound;
}

/**
 * Register one occurrence as its full ladder of sibling alarms.
 *
 * De-duped on the occurrence's appKey: startup gap_resync and a fresh create
 * race on the same occurrence, and with up to three alarms per occurrence a
 * double registration triples (2026-08-07 devlog).
 */
async function scheduleAlarmKitOccurrence(
  reminder: ReminderNotification,
  triggerTimestamp: number
): Promise<void> {
  const rungs = buildAlarmLadder(
    reminder.id,
    triggerTimestamp,
    reminder.urgency,
    reminder.persistent
  );

  return dedupeByAppKey(rungs[0].appKey, async () => {
    await cancelStaleAlarmKitAlarms(reminder.id, new Set(rungs.map((r) => r.appKey)));

    const baseSound = await ensureAlarmSoundSafe(reminder.id, reminder.wavUrl);
    const variantWavUrls = await resolveVariantWavUrls(reminder);

    for (const rung of rungs) {
      const soundName = await rungSoundName(
        reminder.id,
        rung.rung,
        rung.variantIndex,
        variantWavUrls,
        baseSound
      );
      const uuid = await scheduleNativeAlarm({
        id: rung.appKey,
        fireDate: rung.fireDate,
        title: reminder.title,
        soundName,
        snoozeMinutes: reminder.snoozeDuration ?? 5,
        metadata: {
          reminderId: reminder.id,
          scheduledFor: String(rung.fireDate),
          tier: normalizeUrgencyTier(reminder.urgency),
          variantIndex: String(rung.variantIndex),
          ...ladderMetadata(rung),
        },
      });

      vrLog("alarmkit", "scheduled", {
        appKey: rung.appKey,
        reminderId: reminder.id,
        fireDate: rung.fireDate,
        rung: rung.rung,
        rungCount: rung.rungCount,
        soundName: soundName ?? "system_default",
        uuid: uuid ?? "none",
      });
    }
  });
}

/**
 * Register a single alarm outside the ladder — the ignored-occurrence follow-up.
 * PRD: follow-ups stay one alarm, so it carries rung 0 of 1 and no siblings.
 */
async function scheduleAlarmKitFollowUp(
  reminder: ReminderNotification,
  fireDate: number,
  appKey: string,
  variantIndex: number
): Promise<void> {
  return dedupeByAppKey(appKey, async () => {
    await cancelStaleAlarmKitAlarms(reminder.id, new Set([appKey]));

    const baseSound = await ensureAlarmSoundSafe(reminder.id, reminder.wavUrl);
    const uuid = await scheduleNativeAlarm({
      id: appKey,
      fireDate,
      title: reminder.title,
      soundName: baseSound,
      snoozeMinutes: reminder.snoozeDuration ?? 5,
      metadata: {
        reminderId: reminder.id,
        scheduledFor: String(fireDate),
        tier: normalizeUrgencyTier(reminder.urgency),
        variantIndex: String(variantIndex),
        rung: "0",
        rungCount: "1",
        siblings: "",
      },
    });

    vrLog("alarmkit", "scheduled_follow_up", {
      appKey,
      reminderId: reminder.id,
      fireDate,
      soundName: baseSound ?? "system_default",
      uuid: uuid ?? "none",
    });
  });
}

/**
 * Re-register the reminder's live alarms once its wavs exist. The sound is
 * baked into the alarm at schedule time (a filename, not notification data),
 * so hydration has to rewrite the alarm rather than patch a payload.
 *
 * Rung identity is recovered by matching each live alarm against the ladder
 * that starts at the reminder's earliest pending alarm — the native registry
 * only reports id/uuid/fireDate. Anything outside that ladder (a follow-up)
 * keeps today's shape: base wav, rung 0 of 1, no siblings.
 */
async function refreshAlarmKitSound(reminderId: string): Promise<void> {
  const stored = useReminderStore.getState().getReminderById(reminderId);
  if (!stored) return;
  const reminder = toReminderNotification(stored);
  if (!reminder.wavUrl) return;

  const scheduled = (await getScheduledNativeAlarms()).filter((alarm) =>
    alarm.id.startsWith(`reminder_${reminderId}_`)
  );
  if (scheduled.length === 0) return;

  const baseSound = await ensureAlarmSoundSafe(reminderId, reminder.wavUrl);
  if (!baseSound) return;
  const variantWavUrls = await resolveVariantWavUrls(reminder);

  const occurrenceStart = Math.min(...scheduled.map((alarm) => alarm.fireDate));
  const ladder = buildAlarmLadder(
    reminderId,
    occurrenceStart,
    reminder.urgency,
    reminder.persistent
  );
  const byAppKey = new Map(ladder.map((rung) => [rung.appKey, rung]));

  for (const alarm of scheduled) {
    const rung = byAppKey.get(alarm.id);
    const variantIndex = rung?.variantIndex ?? -1;
    const soundName = await rungSoundName(
      reminderId,
      rung?.rung ?? 0,
      variantIndex,
      variantWavUrls,
      baseSound
    );
    await scheduleNativeAlarm({
      id: alarm.id,
      fireDate: alarm.fireDate,
      title: reminder.title,
      soundName,
      snoozeMinutes: reminder.snoozeDuration ?? 5,
      metadata: {
        reminderId,
        scheduledFor: String(alarm.fireDate),
        tier: normalizeUrgencyTier(reminder.urgency),
        variantIndex: String(variantIndex),
        rung: String(rung?.rung ?? 0),
        rungCount: String(rung?.rungCount ?? 1),
        siblings: rung ? rung.siblings.join(",") : "",
      },
    });
    vrLog("alarmkit", "sound_refreshed", {
      appKey: alarm.id,
      reminderId,
      rung: rung?.rung ?? 0,
      soundName: soundName ?? "system_default",
    });
  }
}

/**
 * Cancel every native alarm belonging to a reminder — every ladder rung of
 * every occurrence, plus follow-ups. This is the fan-out behind in-app Done,
 * reminder deletion and rescheduling: all rungs share the `reminder_<id>_`
 * prefix, so acknowledging one occurrence never leaves a sibling to ring.
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
}> {
  const summary = { stopped: 0, snoozed: 0, missed: 0, pending: 0, cancelled: 0 };
  if (!(await alarmKitEnabled())) return summary;

  const events = await drainNativeAlarmEvents();
  if (events.length === 0) return summary;

  const now = Date.now();
  const outcomes = reconcileAlarmEvents(events, now, ALARM_RING_TIMEOUT_MS);

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
      // A ladder rung CL-2's intents killed because a sibling was answered.
      // The answered sibling records the completion and drives the reschedule;
      // this key must add no history and resurrect nothing.
      summary.cancelled++;
      vrLog("alarmkit", "reconciled_sibling_cancelled", {
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

    if (outcome.outcome === "completed") {
      summary.stopped++;
      await store.recordCompletion(reminderId, reminder.title, "completed", {
        scheduledFor,
        action: "dismissed",
      });
      await patchAlarmKitState(reminderId, { snoozeUntil: 0, followUpCount: 0 });
      vrLog("alarmkit", "reconciled_stopped", { appKey: outcome.id, reminderId, scheduledFor });

      if (isOneTime) {
        const { removeReminderFully } = await import("./reminderRemoval");
        await removeReminderFully(reminderId);
      } else if (outcome.allowReschedule) {
        await rescheduleAlarmKitNextOccurrence(reminder, scheduledFor);
      }
      continue;
    }

    // "missed": the alarm rang out unanswered. Same escalation ladder the
    // notifee path runs from handlePendingAlarmTimeout, driven by the shared
    // decision helpers — v1 replays the occurrence line, not the variant
    // cadence (PRD non-goal).
    const state = await getAlarmKitState();
    const followUpCount = parseFollowUpCount(state[reminderId]?.followUpCount);
    const persistent = parsePersistentFlag(reminder.persistent);

    if (shouldContinueFollowUps(persistent, followUpCount)) {
      const nextFollowUp = followUpCount + 1;
      const fireDate = now + followUpDelayMinutes(nextFollowUp) * 60_000;
      const variantIndex = followUpVariantIndex(
        nextFollowUp,
        parseVariantCount(reminder.variants?.length ?? 0)
      );
      await scheduleAlarmKitFollowUp(
        toReminderNotification(reminder),
        fireDate,
        alarmAppKey(reminderId, fireDate),
        variantIndex
      );
      await patchAlarmKitState(reminderId, { followUpCount: nextFollowUp });
      vrLog("alarmkit", "reconciled_follow_up", {
        appKey: outcome.id,
        reminderId,
        followUpCount: nextFollowUp,
        variantIndex,
        persistent,
      });
      continue;
    }

    summary.missed++;
    await store.recordCompletion(reminderId, reminder.title, "missed", {
      scheduledFor,
      action: "auto_missed",
    });
    await patchAlarmKitState(reminderId, { followUpCount: 0 });
    vrLog("alarmkit", "reconciled_missed", { appKey: outcome.id, reminderId, scheduledFor });

    if (!isOneTime && outcome.allowReschedule) {
      await rescheduleAlarmKitNextOccurrence(reminder, scheduledFor);
    }
  }

  return summary;
}

export async function scheduleReminder(
  reminder: ReminderNotification,
  _options?: { traceId?: string; occurrenceAfter?: number }
): Promise<{ triggerTimestamp: number; notificationId: string }> {
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

  // Replay variant audios (best-effort; ringing falls back to the base line).
  if (reminder.variantAudioUrls?.length) {
    await downloadVariantAudios(reminder.id, reminder.variantAudioUrls);
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

  const trigger: TimestampTrigger = {
    type: TriggerType.TIMESTAMP,
    timestamp: triggerTimestamp,
    alarmManager: {
      type: AlarmType.SET_ALARM_CLOCK, // Use AlarmClock for lockscreen reliability
    },
  };

  const notificationId = `reminder_${reminder.id}_${triggerTimestamp}`;

  // Defensive: ensure we only ever have a single upcoming "reminder_*" trigger per reminder.
  // Some Android/Notifee edge cases can leave multiple triggers around, which then fire duplicates.
  // Snoozes use the "snooze_*" prefix and are intentionally not canceled here.
  await cancelExistingReminderOccurrenceTriggers(reminder.id, notificationId);

  // AlarmKit owns this occurrence: register its ladder of sibling alarms and
  // skip the notifee trigger entirely. The pre-alert heads-up stays a plain
  // notification (it is not an alarm surface) so it keeps today's behavior.
  if (alarmKitActive) {
    await scheduleAlarmKitOccurrence(reminder, triggerTimestamp);
    await patchAlarmKitState(reminder.id, { snoozeUntil: 0, followUpCount: 0 });
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

  await notifee.createTriggerNotification(
    {
      id: notificationId,
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

        // Assistant-style replays (OLD-53): escalation ladder state travels in
        // the notification data. variantIndex -1 = base spoken line.
        urgency: reminder.urgency ?? "",
        persistent: String(reminder.persistent ?? false),
        variants: JSON.stringify((reminder.variants ?? []).slice(0, MAX_REPLAY_VARIANTS)),
        variantAudioUrls: JSON.stringify(
          (reminder.variantAudioUrls ?? []).slice(0, MAX_REPLAY_VARIANTS)
        ),
        variantCount: String(
          Math.min(reminder.variants?.length ?? 0, MAX_REPLAY_VARIANTS)
        ),
        followUpCount: "0",
        variantIndex: "-1",

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
    `[VR] schedule_debug source=${scheduleSource} id=${reminder.id} freq=${reminder.frequency} scheduleType=${reminder.scheduleType ?? "legacy"} now=${new Date(logNow).toISOString()} trigger=${new Date(triggerTimestamp).toISOString()} deltaMs=${deltaMs} deltaMin=${Math.round(deltaMs / 60000)}`
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
  preAudioUrl?: string,
  replay?: {
    variants?: string[];
    variantAudioUrls?: string[];
    // iOS-only ladder rung wavs; they never enter the notifee payload.
    variantWavUrls?: (string | null)[];
  }
): Promise<void> {
  try {
    // AlarmKit occurrences carry their sound as a Library/Sounds filename, not
    // as notification data, so hydration has to re-register them instead. The
    // rung wavs are remembered first: refreshAlarmKitSound reads them back
    // through the AlarmKit state, which the store has no field for.
    if (await alarmKitEnabled()) {
      if (replay?.variantWavUrls?.length) {
        await patchAlarmKitState(reminderId, { variantWavUrls: replay.variantWavUrls });
      }
      await refreshAlarmKitSound(reminderId);
    }

    // Get all trigger notifications
    const allNotifications = await notifee.getTriggerNotifications();

    // Replay variant payload (texts + audio urls arrive together post-TTS).
    const variantsJson =
      replay?.variants !== undefined
        ? JSON.stringify(replay.variants.slice(0, MAX_REPLAY_VARIANTS))
        : undefined;
    const variantAudioUrlsJson =
      replay?.variantAudioUrls !== undefined
        ? JSON.stringify(replay.variantAudioUrls.slice(0, MAX_REPLAY_VARIANTS))
        : undefined;
    const variantCountStr =
      replay?.variants !== undefined
        ? String(Math.min(replay.variants.length, MAX_REPLAY_VARIANTS))
        : undefined;

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
        const variantsCurrent =
          (variantsJson === undefined || data.variants === variantsJson) &&
          (variantAudioUrlsJson === undefined || data.variantAudioUrls === variantAudioUrlsJson);
        if (!mainCurrent || !preCurrent || !variantsCurrent) {
          updatedData = {
            ...data,
            audioUrl,
            ...(preAudioUrl !== undefined ? { preAudioUrl } : {}),
            ...(variantsJson !== undefined ? { variants: variantsJson } : {}),
            ...(variantAudioUrlsJson !== undefined
              ? { variantAudioUrls: variantAudioUrlsJson }
              : {}),
            ...(variantCountStr !== undefined ? { variantCount: variantCountStr } : {}),
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
    variants: reminder.variants,
    variantAudioUrls: reminder.variantAudioUrls,
    variantWavUrls: (reminder as Reminder & { variantWavUrls?: (string | null)[] })
      .variantWavUrls,
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

  // Cancel the main trigger for this occurrence.
  if (Number.isFinite(mainScheduledFor) && mainScheduledFor > 0) {
    try {
      await notifee.cancelNotification(`reminder_${reminderId}_${mainScheduledFor}`);
    } catch {
      // ignore
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
        console.log("[VR] Snooze action from notification");
        const snoozeDuration = Number(notificationData?.snoozeDuration ?? "5") || 5;
        const autoSnoozeCount = parseAutoSnoozeCount(notificationData?.autoSnoozeCount);
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
      const adjustedTrigger = adjustPastDueTrigger(nextTrigger, now);
      if (adjustedTrigger !== nextTrigger) {
        console.warn("[VR] Next trigger in past, adjusted to now + 5s");
      }
      nextTrigger = adjustedTrigger;

      const newNotificationId = `reminder_${data.reminderId}_${nextTrigger}`;

      // Defensive: cancel any existing reminder triggers before scheduling the next one.
      // Prevents accumulating duplicates if older versions/edge cases created more than one.
      await cancelExistingReminderOccurrenceTriggers(data.reminderId as string);

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
            // Each fresh occurrence starts its escalation ladder from scratch.
            followUpCount: "0",
            variantIndex: "-1",
          },
        },
        trigger
      );

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

      // The AlarmKit path expects the whole expected-set of rungs, not just
      // one alarm: a ladder that lost rungs (OS eviction, a half-finished
      // schedule) is repaired in place before the reminder counts as intact.
      let scheduledMainId: string | undefined;
      if (alarmKitActive) {
        const mine = alarmKitIds.filter((id) => id.startsWith(mainPrefix));
        const fireTimes = mine
          .map((id) => Number(id.slice(mainPrefix.length)))
          .filter((ts) => Number.isFinite(ts) && ts > 0);

        if (fireTimes.length > 0) {
          // The occurrence starts at T, which is NOT always the earliest
          // surviving rung: if rung 0 was evicted, the survivors are a suffix
          // of the ladder. Rebasing on the earliest survivor would shift the
          // whole cadence forward and cancel the real later rungs as strays,
          // so recover T by testing each rung offset as the survivor's index.
          // Offset 0 is tried first, so an intact or prefix-complete ladder
          // resolves to the earliest rung exactly as before.
          const earliest = Math.min(...fireTimes);
          const occurrenceStart =
            ladderOffsetsMs(reminder.urgency, reminder.persistent)
              .map((offset) => earliest - offset)
              .find((candidate) => {
                const ladder = new Set(
                  ladderRungTimes(candidate, reminder.urgency, reminder.persistent).map(
                    (ts) => `${mainPrefix}${ts}`
                  )
                );
                return mine.every((id) => ladder.has(id));
              }) ?? earliest;
          scheduledMainId = `${mainPrefix}${occurrenceStart}`;

          // A live follow-up is deliberately a single alarm (PRD) — never
          // grow it into a ladder.
          const followUpLive =
            parseFollowUpCount(alarmKitState[reminder.id]?.followUpCount) > 0;
          const expected = ladderRungTimes(
            occurrenceStart,
            reminder.urgency,
            reminder.persistent
          ).map((ts) => `${mainPrefix}${ts}`);
          const present = new Set(mine);
          const missing = expected.filter((id) => !present.has(id));
          const stray = mine.filter((id) => !expected.includes(id));

          if (!followUpLive && occurrenceStart > now && (missing.length || stray.length)) {
            vrLog("alarmkit", "ladder_repair", {
              reminderId: reminder.id,
              occurrenceStart,
              missing: missing.length,
              stray: stray.length,
            });
            try {
              await scheduleAlarmKitOccurrence(
                toReminderNotification(reminder),
                occurrenceStart
              );
            } catch (repairErr) {
              console.log(`[VR] Ladder repair failed for ${reminder.id}:`, repairErr);
            }
          }
        }
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
