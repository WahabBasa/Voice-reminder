/**
 * Typed JS wrapper over the native AlarmKit bridge (iOS 26+).
 *
 * Mirrors the frozen contract in docs/alarmkit-port-prd.md one-to-one. The
 * native module (AK-1) only exists on iOS 26 device builds, so every method
 * degrades to a safe no-op when `NativeModules.AlarmKitBridge` is undefined —
 * that covers Android, iOS < 26, Expo Go, and Jest.
 *
 * Nothing here touches notifee or app state: lib/notifications.ts owns the
 * scheduling branch and the reconciliation bookkeeping.
 */
import { NativeModules, Platform } from "react-native";
import { vrLog } from "./vrLog";

export type AlarmAuthorizationStatus = "authorized" | "denied" | "notDetermined";

export interface AlarmKitScheduleOptions {
  /** App key: `reminder_${reminderId}_${scheduledFor}`. */
  id: string;
  fireDate: number;
  title: string;
  /** Bare filename in Library/Sounds (e.g. "reminder_abc.wav"); null = system default. */
  soundName: string | null;
  snoozeMinutes: number;
  metadata: { [k: string]: string };
}

export interface ScheduledAlarm {
  id: string;
  uuid: string;
  fireDate: number;
}

export type AlarmEventType = "stopped" | "snoozed" | "fired";

export interface AlarmEvent {
  type: AlarmEventType;
  /** App key. */
  id: string;
  at: number;
  /** Present on "snoozed". */
  snoozeUntil?: number;
}

interface AlarmKitBridgeModule {
  isSupported(): Promise<boolean>;
  requestAuthorization(): Promise<string>;
  scheduleAlarm(opts: AlarmKitScheduleOptions): Promise<string>;
  cancelAlarm(id: string): Promise<void>;
  getScheduledAlarms(): Promise<ScheduledAlarm[]>;
  getAndClearEventLog(): Promise<AlarmEvent[]>;
}

const bridge: AlarmKitBridgeModule | undefined = (
  NativeModules as { AlarmKitBridge?: AlarmKitBridgeModule }
).AlarmKitBridge;

/** Ring window before an unanswered alarm counts as missed (matches notifications.ts). */
export const ALARM_RING_TIMEOUT_MS = 180_000;

/**
 * iOS can append the spurious StopIntent either side of the Snooze append, so
 * the JS mirror of PRD guard 2 tolerates a stop landing slightly before the
 * snooze it belongs to.
 */
const SPURIOUS_STOP_TOLERANCE_MS = 2000;

const APP_KEY_PATTERN = /^reminder_(.+)_(\d+)$/;

/** The native module is only linked on iOS builds carrying AK-1's plugin. */
export function isAlarmKitLinked(): boolean {
  return Platform.OS === "ios" && Boolean(bridge);
}

export function alarmAppKey(reminderId: string, scheduledFor: number): string {
  return `reminder_${reminderId}_${scheduledFor}`;
}

export function parseAlarmAppKey(
  appKey: string
): { reminderId: string; scheduledFor: number } | null {
  if (typeof appKey !== "string") return null;
  const match = APP_KEY_PATTERN.exec(appKey);
  if (!match) return null;
  const scheduledFor = Number(match[2]);
  if (!Number.isFinite(scheduledFor)) return null;
  return { reminderId: match[1], scheduledFor };
}

// ─── Contract methods ───────────────────────────────────────────────────────

export async function isSupported(): Promise<boolean> {
  if (!isAlarmKitLinked()) return false;
  try {
    return Boolean(await bridge!.isSupported());
  } catch (e) {
    vrLog("alarmkit", "is_supported_failed", { error: String(e) });
    return false;
  }
}

export async function requestAuthorization(): Promise<AlarmAuthorizationStatus> {
  if (!isAlarmKitLinked()) return "notDetermined";
  try {
    const status = await bridge!.requestAuthorization();
    return status === "authorized" || status === "denied" ? status : "notDetermined";
  } catch (e) {
    vrLog("alarmkit", "authorization_failed", { error: String(e) });
    return "notDetermined";
  }
}

/** Resolves the native alarm UUID, or null when the alarm could not be registered. */
export async function scheduleAlarm(
  opts: AlarmKitScheduleOptions
): Promise<string | null> {
  if (!isAlarmKitLinked()) return null;
  try {
    return (await bridge!.scheduleAlarm(opts)) ?? null;
  } catch (e) {
    vrLog("alarmkit", "schedule_failed", { appKey: opts.id, error: String(e) });
    return null;
  }
}

export async function cancelAlarm(id: string): Promise<void> {
  if (!isAlarmKitLinked()) return;
  try {
    await bridge!.cancelAlarm(id);
  } catch (e) {
    vrLog("alarmkit", "cancel_failed", { appKey: id, error: String(e) });
  }
}

export async function getScheduledAlarms(): Promise<ScheduledAlarm[]> {
  if (!isAlarmKitLinked()) return [];
  try {
    const alarms = await bridge!.getScheduledAlarms();
    if (!Array.isArray(alarms)) return [];
    return alarms.filter(
      (a): a is ScheduledAlarm =>
        Boolean(a) && typeof a.id === "string" && Number.isFinite(Number(a.fireDate))
    );
  } catch (e) {
    vrLog("alarmkit", "get_scheduled_failed", { error: String(e) });
    return [];
  }
}

/** Drains the native event log — the entries are gone from UserDefaults after this. */
export async function getAndClearEventLog(): Promise<AlarmEvent[]> {
  if (!isAlarmKitLinked()) return [];
  try {
    const events = await bridge!.getAndClearEventLog();
    return Array.isArray(events) ? events.filter(isAlarmEvent) : [];
  } catch (e) {
    vrLog("alarmkit", "event_log_failed", { error: String(e) });
    return [];
  }
}

function isAlarmEvent(value: unknown): value is AlarmEvent {
  if (!value || typeof value !== "object") return false;
  const event = value as AlarmEvent;
  if (typeof event.id !== "string" || typeof event.at !== "number") return false;
  return event.type === "stopped" || event.type === "snoozed" || event.type === "fired";
}

// ─── Gate decision ──────────────────────────────────────────────────────────

let gateDecision: Promise<boolean> | null = null;

/**
 * Whether this session schedules reminders as native alarms instead of notifee
 * triggers. Cached per session: the answer cannot change without an app
 * restart (an OS upgrade or a Settings toggle both relaunch us).
 */
export function useAlarmKit(): Promise<boolean> {
  if (!gateDecision) {
    gateDecision = (async () => {
      if (!isAlarmKitLinked()) return false;
      if (!(await isSupported())) return false;
      const status = await requestAuthorization();
      const enabled = status === "authorized";
      vrLog("alarmkit", "gate_decision", { enabled, status });
      return enabled;
    })();
  }
  return gateDecision;
}

/** Test seam — drops the cached session decision. */
export function resetAlarmKitDecision(): void {
  gateDecision = null;
}

// ─── Event-log reconciliation (pure) ────────────────────────────────────────

export type AlarmOutcomeKind = "completed" | "snoozed" | "missed" | "pending";

export interface AlarmReconcileOutcome {
  id: string;
  outcome: AlarmOutcomeKind;
  snoozeUntil?: number;
  /** False while a guard blocks schedule recalculation (PRD guard 3). */
  allowReschedule: boolean;
}

/**
 * Collapse a drained native event log into one outcome per app key.
 *
 * Pure and side-effect free — lib/notifications.ts applies the outcomes. The
 * FamWake race guards live here:
 *  - guard 2: iOS fires StopIntent even when the user tapped Snooze, so any
 *    stop landing inside the snooze window is discarded.
 *  - guard 3: a snooze whose window is still open blocks rescheduling; the
 *    native side already registered the follow-up.
 */
export function reconcileAlarmEvents(
  events: unknown[],
  now: number,
  ringTimeoutMs: number = ALARM_RING_TIMEOUT_MS
): AlarmReconcileOutcome[] {
  const order: string[] = [];
  const byId = new Map<string, AlarmEvent[]>();

  for (const raw of events) {
    if (!isAlarmEvent(raw)) continue;
    if (!byId.has(raw.id)) {
      byId.set(raw.id, []);
      order.push(raw.id);
    }
    byId.get(raw.id)!.push(raw);
  }

  return order.map((id) => {
    const list = byId.get(id)!.slice().sort((a, b) => a.at - b.at);
    const snooze = [...list].reverse().find((e) => e.type === "snoozed");
    const snoozeUntil = snooze?.snoozeUntil;
    const snoozeActive = snoozeUntil !== undefined && now < snoozeUntil;

    const realStop = list.find((e) => {
      if (e.type !== "stopped") return false;
      if (!snooze) return true;
      const from = snooze.at - SPURIOUS_STOP_TOLERANCE_MS;
      const to = snoozeUntil ?? snooze.at + SPURIOUS_STOP_TOLERANCE_MS;
      return !(e.at >= from && e.at < to);
    });

    const lastFired = [...list].reverse().find((e) => e.type === "fired");
    const firedAfterSnooze = lastFired && (!snooze || lastFired.at >= snooze.at);

    let outcome: AlarmOutcomeKind;
    if (realStop) {
      outcome = "completed";
    } else if (firedAfterSnooze) {
      outcome = now - lastFired!.at >= ringTimeoutMs ? "missed" : "pending";
    } else {
      outcome = "snoozed";
    }

    return {
      id,
      outcome,
      allowReschedule: outcome === "pending" ? false : !snoozeActive,
      ...(snoozeUntil !== undefined ? { snoozeUntil } : {}),
    };
  });
}
