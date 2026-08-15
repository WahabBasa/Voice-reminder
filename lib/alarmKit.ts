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

/**
 * "cancelled" is an alarm the native side dropped on its own (the intents in
 * plugins/ios-src cancel alarms they consider superseded). It is not an outcome
 * the user produced on that key, so reconciliation must record nothing for it
 * and must not resurrect it.
 */
export type AlarmEventType = "stopped" | "snoozed" | "fired" | "cancelled";

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

// Two key families share the scheme: `reminder_<id>_<ts>` is a scheduled
// occurrence, `snooze_<id>_<ts>` is a nag comeback (OLD-96). They are kept
// apart on purpose — cancelling a reminder's stale occurrences must never take
// the live nag with it, and vice versa.
const APP_KEY_PATTERN = /^(?:reminder|snooze)_(.+)_(\d+)$/;
const NAG_KEY_PREFIX = "snooze_";

/** The native module is only linked on iOS builds carrying AK-1's plugin. */
export function isAlarmKitLinked(): boolean {
  return Platform.OS === "ios" && Boolean(bridge);
}

export function alarmAppKey(reminderId: string, scheduledFor: number): string {
  return `reminder_${reminderId}_${scheduledFor}`;
}

/** App key of a nag comeback firing at `fireDate`. */
export function nagAppKey(reminderId: string, fireDate: number): string {
  return `${NAG_KEY_PREFIX}${reminderId}_${fireDate}`;
}

export function isNagAppKey(appKey: string): boolean {
  return typeof appKey === "string" && appKey.startsWith(NAG_KEY_PREFIX);
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

// ─── In-flight de-dup ───────────────────────────────────────────────────────

// The 2026-08-07 devlog race: startup gap_resync and a fresh create land on the
// same occurrence ~20ms apart and both register it.
const inFlightByAppKey = new Map<string, Promise<unknown>>();

/**
 * Run `work` at most once per appKey while it is in flight — a concurrent call
 * for the same key joins the running one instead of registering a second alarm.
 * Callers must not nest this on the same key (the inner call would await itself).
 */
export function dedupeByAppKey<T>(appKey: string, work: () => Promise<T>): Promise<T> {
  const existing = inFlightByAppKey.get(appKey);
  if (existing) {
    vrLog("alarmkit", "schedule_deduped", { appKey });
    return existing as Promise<T>;
  }
  const task = (async () => work())().finally(() => {
    if (inFlightByAppKey.get(appKey) === task) {
      inFlightByAppKey.delete(appKey);
    }
  });
  inFlightByAppKey.set(appKey, task);
  return task;
}

/**
 * Resolve once every in-flight registration whose appKey starts with `prefix`
 * has settled. Hydration's sound refresh (lib/notifications.ts) serializes
 * behind an occurrence set that is still registering instead of reading the
 * native registry mid-flight and rewriting only the alarms that already landed.
 */
export async function settleInFlightAppKeys(prefix: string): Promise<void> {
  const pending = [...inFlightByAppKey.entries()]
    .filter(([appKey]) => appKey.startsWith(prefix))
    .map(([, task]) => task.then(() => undefined, () => undefined));
  if (pending.length > 0) await Promise.all(pending);
}

/** Test seam — drops any in-flight registrations. */
export function resetAppKeyDedupe(): void {
  inFlightByAppKey.clear();
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

/**
 * AlarmKit refuses further registrations past an undocumented cap
 * (`AlarmError.maximumLimitReached` — Apple publishes no number). We cannot
 * budget against a limit we cannot read, so the handling is: recognise the
 * throw, log it distinctly, and let the caller shed the droppable tier. Nag
 * comebacks are droppable; the occurrence itself is not.
 */
export function isAlarmLimitError(error: unknown): boolean {
  return /maximumlimitreached|maximum limit/i.test(String(error ?? ""));
}

/** Resolves the native alarm UUID, or null when the alarm could not be registered. */
export async function scheduleAlarm(
  opts: AlarmKitScheduleOptions
): Promise<string | null> {
  if (!isAlarmKitLinked()) return null;
  try {
    return (await bridge!.scheduleAlarm(opts)) ?? null;
  } catch (e) {
    vrLog("alarmkit", isAlarmLimitError(e) ? "schedule_limit_reached" : "schedule_failed", {
      appKey: opts.id,
      error: String(e),
    });
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
    if (!Array.isArray(events)) return [];
    return events
      .map(toAlarmEvent)
      .filter((event): event is AlarmEvent => event !== null);
  } catch (e) {
    vrLog("alarmkit", "event_log_failed", { error: String(e) });
    return [];
  }
}

// The cancel entries the native intents append ride the same event channel
// with a different type token. Spelling is normalized here so an unexpected
// variant lands as a known, inert event instead of being dropped as garbage.
const CANCELLED_EVENT_TYPES = new Set([
  "cancelled",
  "canceled",
  "sibling_cancelled",
  "sibling_canceled",
]);

function normalizeAlarmEventType(value: unknown): AlarmEventType | null {
  const token = String(value ?? "").toLowerCase().trim();
  if (token === "stopped" || token === "snoozed" || token === "fired") return token;
  if (CANCELLED_EVENT_TYPES.has(token)) return "cancelled";
  return null;
}

/** Normalize one raw native log entry, or null when it is not an alarm event. */
function toAlarmEvent(value: unknown): AlarmEvent | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as { type?: unknown; id?: unknown; at?: unknown; snoozeUntil?: unknown };
  const type = normalizeAlarmEventType(raw.type);
  if (!type) return null;
  if (typeof raw.id !== "string" || typeof raw.at !== "number") return null;
  return {
    type,
    id: raw.id,
    at: raw.at,
    ...(typeof raw.snoozeUntil === "number" ? { snoozeUntil: raw.snoozeUntil } : {}),
  };
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

export type AlarmOutcomeKind =
  | "completed"
  | "snoozed"
  | "missed"
  | "pending"
  /** An alarm the native intents killed instead of the user answering it. */
  | "cancelled";

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
 *
 * A natively cancelled alarm collapses to "cancelled": whatever cancelled it
 * already recorded the outcome and drove the reschedule, so this key must
 * produce neither a history entry nor a new occurrence.
 */
export function reconcileAlarmEvents(
  events: unknown[],
  now: number,
  ringTimeoutMs: number = ALARM_RING_TIMEOUT_MS
): AlarmReconcileOutcome[] {
  const order: string[] = [];
  const byId = new Map<string, AlarmEvent[]>();

  for (const value of events) {
    const raw = toAlarmEvent(value);
    if (!raw) continue;
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

    // A cancel that landed after the last ring wins over "it rang unanswered":
    // the alarm was killed on purpose, not ignored.
    const lastCancelled = [...list].reverse().find((e) => e.type === "cancelled");
    const cancelledLast = lastCancelled && (!lastFired || lastCancelled.at >= lastFired.at);

    let outcome: AlarmOutcomeKind;
    if (realStop) {
      outcome = "completed";
    } else if (cancelledLast) {
      outcome = "cancelled";
    } else if (firedAfterSnooze) {
      outcome = now - lastFired!.at >= ringTimeoutMs ? "missed" : "pending";
    } else {
      outcome = "snoozed";
    }

    const inert = outcome === "pending" || outcome === "cancelled";
    return {
      id,
      outcome,
      allowReschedule: inert ? false : !snoozeActive,
      ...(snoozeUntil !== undefined ? { snoozeUntil } : {}),
    };
  });
}
