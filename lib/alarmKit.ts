/**
 * Typed JS wrapper over the native AlarmKit bridge (iOS 26+).
 *
 * Mirrors the frozen contract in docs/alarmkit-port-prd.md one-to-one. The
 * native module (AK-1) only exists on iOS 26 device builds, so every method
 * degrades to a safe no-op when `NativeModules.AlarmKitBridge` is undefined —
 * that covers Android, iOS < 26, Expo Go, and Jest.
 *
 * Nothing here touches notifee, and the persisted guard state is read-only from
 * this side: lib/notifications.ts owns the scheduling branch, the
 * reconciliation bookkeeping and every write.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import { NativeEventEmitter, NativeModules, Platform } from "react-native";
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
  // ── Occurrence identity (ring-state fix) ──────────────────────────────────
  // Folded into `metadata` before the native call so every scheduled alarm
  // carries the identity the intents and the state snapshot read back. All
  // optional so existing callers keep compiling; agent R passes occurrenceAt
  // and chainId when it wires the ring lifecycle.
  /** ms epoch of the ORIGINAL occurrence (constant across a comeback chain). Defaults to `fireDate`. */
  occurrenceAt?: number;
  /** Comeback-chain identity. Defaults to `orig:${occurrenceAt}`. */
  chainId?: string;
  /** 0 = the ring, 1..n = comeback siblings. Defaults to 0. */
  chainStep?: number;
  /** "original" (schedule grid) or "later" (a Later-armed comeback). Defaults to "original". */
  kind?: "original" | "later";
}

/**
 * Metadata keys carried in the AlarmKit `metadata` dict. Mirrored verbatim in
 * plugins/ios-src/VRAlarmIntents.swift (VRAlarmMetaKeys) and the generated Swift
 * in plugins/withAlarmKit.js — a rename here has to be made in all three.
 */
export const ALARM_META_KEYS = {
  reminderId: "reminderId",
  occurrenceAt: "occurrenceAt",
  chainId: "chainId",
  chainStep: "chainStep",
  kind: "kind",
} as const;

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
  // Durable event log (ring-state fix): peek returns all unacked events; ack
  // removes only the ones JS has applied. Replaces the old delete-first drain.
  peekEvents(): Promise<unknown[]>;
  ackEvents(eventIds: string[]): Promise<void>;
  // Live AlarmManager snapshot + occurrence-scoped stop.
  getAlarmStates(): Promise<unknown[]>;
  stopOccurrence(reminderId: string, occurrenceAt: number): Promise<void>;
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

/**
 * Fold the occurrence-identity fields into the metadata dict the native side
 * persists per app key. Defaults keep legacy callers (who pass none) working:
 * a plain occurrence is `chainStep 0`, `kind "original"`, occurrenceAt = its own
 * fire time, chainId = `orig:${occurrenceAt}`.
 */
function withOccurrenceMetadata(opts: AlarmKitScheduleOptions): AlarmKitScheduleOptions {
  const occurrenceAt = Number.isFinite(opts.occurrenceAt as number)
    ? (opts.occurrenceAt as number)
    : opts.fireDate;
  const chainId = opts.chainId ?? `orig:${occurrenceAt}`;
  const chainStep = Number.isFinite(opts.chainStep as number) ? (opts.chainStep as number) : 0;
  const kind = opts.kind ?? "original";
  return {
    ...opts,
    metadata: {
      ...opts.metadata,
      [ALARM_META_KEYS.occurrenceAt]: String(occurrenceAt),
      [ALARM_META_KEYS.chainId]: chainId,
      [ALARM_META_KEYS.chainStep]: String(chainStep),
      [ALARM_META_KEYS.kind]: kind,
    },
  };
}

/** Resolves the native alarm UUID, or null when the alarm could not be registered. */
export async function scheduleAlarm(
  opts: AlarmKitScheduleOptions
): Promise<string | null> {
  if (!isAlarmKitLinked()) return null;
  try {
    return (await bridge!.scheduleAlarm(withOccurrenceMetadata(opts))) ?? null;
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

// ─── Durable event log: peek / ack (ring-state fix) ─────────────────────────

/** AlarmKit's own `Alarm.State`, as surfaced by {@link getAlarmStates}. */
export type NativeAlarmState = "scheduled" | "countdown" | "paused" | "alerting";

/** One live alarm from `AlarmManager.shared.alarms`, joined to our metadata. */
export interface NativeAlarmInfo {
  /** AlarmKit UUID. */
  alarmId: string;
  appKey?: string;
  reminderId?: string;
  /** ms epoch of the ORIGINAL occurrence. */
  occurrenceAt?: number;
  chainId?: string;
  chainStep?: number;
  state: NativeAlarmState;
  /** ms epoch the alarm is/was scheduled to fire. */
  fireAt?: number;
}

/**
 * A durable native event. `eventId` is a UUID minted when the event is written,
 * so a replayed peek never re-applies one JS already acked. `kind` mirrors the
 * native tokens; `reminderId`/`occurrenceAt` identify the occurrence the event
 * belongs to (the ORIGINAL occurrence, stable across a comeback chain).
 */
export type NativeAlarmEventKind =
  | "stopped"
  | "snoozed"
  | "alerting"
  | "scheduled"
  | "scheduleFailed"
  | "removed"
  | "stateChanged";

export interface NativeAlarmEvent {
  eventId: string;
  kind: NativeAlarmEventKind;
  /** AlarmKit UUID, when the event knew it. */
  alarmId?: string;
  appKey?: string;
  reminderId: string;
  occurrenceAt: number;
  chainId?: string;
  chainStep?: number;
  /** Present on "snoozed": the REAL armed comeback fire time. */
  snoozeUntil?: number;
  at: number;
  /** Present on "scheduleFailed". */
  error?: string;
}

const NATIVE_EVENT_KINDS = new Set<NativeAlarmEventKind>([
  "stopped",
  "snoozed",
  "alerting",
  "scheduled",
  "scheduleFailed",
  "removed",
  "stateChanged",
]);

const NATIVE_ALARM_STATES = new Set<NativeAlarmState>([
  "scheduled",
  "countdown",
  "paused",
  "alerting",
]);

// Legacy native builds wrote `{ type, id, at }`. New native migrates those to
// carry an eventId before returning, but JS stays tolerant in case a raw legacy
// row ever reaches here.
function legacyKindToNative(type: unknown): NativeAlarmEventKind | null {
  const token = String(type ?? "").toLowerCase().trim();
  if (token === "stopped" || token === "snoozed") return token;
  if (token === "fired") return "alerting";
  if (token === "cancelled" || token === "canceled") return "removed";
  if (token === "sibling_cancelled" || token === "sibling_canceled") return "removed";
  if (token === "snooze_failed" || token === "schedule_failed") return "scheduleFailed";
  return null;
}

function optionalNumber(value: unknown): number | undefined {
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

/** Normalize one raw native peek row into a {@link NativeAlarmEvent}, or null. */
function toNativeAlarmEvent(value: unknown): NativeAlarmEvent | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  const kind =
    typeof raw.kind === "string" && NATIVE_EVENT_KINDS.has(raw.kind as NativeAlarmEventKind)
      ? (raw.kind as NativeAlarmEventKind)
      : legacyKindToNative(raw.type);
  if (!kind) return null;
  const at = Number(raw.at);
  if (!Number.isFinite(at)) return null;

  const appKey =
    typeof raw.appKey === "string" ? raw.appKey : typeof raw.id === "string" ? raw.id : undefined;
  const parsed = appKey ? parseAlarmAppKey(appKey) : null;
  const reminderId =
    typeof raw.reminderId === "string" && raw.reminderId ? raw.reminderId : parsed?.reminderId ?? "";
  const occurrenceAt = optionalNumber(raw.occurrenceAt) ?? parsed?.scheduledFor ?? 0;
  const eventId =
    typeof raw.eventId === "string" && raw.eventId
      ? raw.eventId
      : `legacy:${kind}:${appKey ?? "?"}:${Math.round(at)}`;

  return {
    eventId,
    kind,
    reminderId,
    occurrenceAt,
    at,
    ...(typeof raw.alarmId === "string" ? { alarmId: raw.alarmId } : {}),
    ...(appKey !== undefined ? { appKey } : {}),
    ...(typeof raw.chainId === "string" ? { chainId: raw.chainId } : {}),
    ...(optionalNumber(raw.chainStep) !== undefined ? { chainStep: optionalNumber(raw.chainStep) } : {}),
    ...(optionalNumber(raw.snoozeUntil) !== undefined ? { snoozeUntil: optionalNumber(raw.snoozeUntil) } : {}),
    ...(typeof raw.error === "string" ? { error: raw.error } : {}),
  };
}

/** Normalize one raw `getAlarmStates` row, or null. */
function toNativeAlarmInfo(value: unknown): NativeAlarmInfo | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  if (typeof raw.alarmId !== "string" || !raw.alarmId) return null;
  if (typeof raw.state !== "string" || !NATIVE_ALARM_STATES.has(raw.state as NativeAlarmState)) {
    return null;
  }
  return {
    alarmId: raw.alarmId,
    state: raw.state as NativeAlarmState,
    ...(typeof raw.appKey === "string" ? { appKey: raw.appKey } : {}),
    ...(typeof raw.reminderId === "string" ? { reminderId: raw.reminderId } : {}),
    ...(optionalNumber(raw.occurrenceAt) !== undefined ? { occurrenceAt: optionalNumber(raw.occurrenceAt) } : {}),
    ...(typeof raw.chainId === "string" ? { chainId: raw.chainId } : {}),
    ...(optionalNumber(raw.chainStep) !== undefined ? { chainStep: optionalNumber(raw.chainStep) } : {}),
    ...(optionalNumber(raw.fireAt) !== undefined ? { fireAt: optionalNumber(raw.fireAt) } : {}),
  };
}

/** All native events not yet acked, oldest first. Empty off-iOS or with no bridge. */
export async function peekAlarmEvents(): Promise<NativeAlarmEvent[]> {
  if (!isAlarmKitLinked() || !bridge!.peekEvents) return [];
  try {
    const raw = await bridge!.peekEvents();
    if (!Array.isArray(raw)) return [];
    return raw.map(toNativeAlarmEvent).filter((e): e is NativeAlarmEvent => e !== null);
  } catch (e) {
    vrLog("alarmkit", "peek_events_failed", { error: String(e) });
    return [];
  }
}

/** Remove exactly the events whose eventIds are given. No-op off-iOS / empty list. */
export async function ackAlarmEvents(eventIds: string[]): Promise<void> {
  if (!isAlarmKitLinked() || !bridge!.ackEvents) return;
  const ids = Array.isArray(eventIds) ? eventIds.filter((id) => typeof id === "string" && id) : [];
  if (ids.length === 0) return;
  try {
    await bridge!.ackEvents(ids);
  } catch (e) {
    vrLog("alarmkit", "ack_events_failed", { error: String(e) });
  }
}

/** Live AlarmManager snapshot (state per alarm, joined to our metadata). */
export async function getAlarmStates(): Promise<NativeAlarmInfo[]> {
  if (!isAlarmKitLinked() || !bridge!.getAlarmStates) return [];
  try {
    const rows = await bridge!.getAlarmStates();
    if (!Array.isArray(rows)) return [];
    return rows.map(toNativeAlarmInfo).filter((r): r is NativeAlarmInfo => r !== null);
  } catch (e) {
    vrLog("alarmkit", "get_alarm_states_failed", { error: String(e) });
    return [];
  }
}

/**
 * Stop any alerting alarm for this occurrence and cancel every alarm whose
 * metadata matches it (all chains). The card's "Done" for an occurrence.
 */
export async function stopOccurrence(ref: {
  reminderId: string;
  occurrenceAt: number;
}): Promise<void> {
  if (!isAlarmKitLinked() || !bridge!.stopOccurrence) return;
  try {
    await bridge!.stopOccurrence(ref.reminderId, ref.occurrenceAt);
  } catch (e) {
    vrLog("alarmkit", "stop_occurrence_failed", { error: String(e) });
  }
}

/**
 * Subscribe to the native "something changed, please peek" hint. The hint
 * carries only a `reason`; the payload lives in the durable event log, which the
 * callback should peek. Returns an unsubscribe; a no-op off-iOS or when the
 * emitter module is missing.
 */
export function subscribeAlarmEvents(cb: (hint: { reason: string }) => void): () => void {
  if (Platform.OS !== "ios") return () => {};
  const emitterModule = (NativeModules as { VRAlarmEventEmitter?: object }).VRAlarmEventEmitter;
  if (!emitterModule) return () => {};
  try {
    const emitter = new NativeEventEmitter(emitterModule as never);
    const sub = emitter.addListener("VRAlarmEvent", (payload: { reason?: unknown } | undefined) => {
      const reason = typeof payload?.reason === "string" ? payload.reason : "intent";
      cb({ reason });
    });
    return () => sub.remove();
  } catch (e) {
    vrLog("alarmkit", "subscribe_failed", { error: String(e) });
    return () => {};
  }
}

// ─── Deprecated drain shim ──────────────────────────────────────────────────

/** Map a new-shape event to the legacy {@link AlarmEvent}, or null when it has no legacy equivalent. */
function toLegacyAlarmEvent(ev: NativeAlarmEvent): AlarmEvent | null {
  let type: AlarmEventType;
  switch (ev.kind) {
    case "stopped":
      type = "stopped";
      break;
    case "snoozed":
      type = "snoozed";
      break;
    case "alerting":
      type = "fired";
      break;
    case "removed":
      type = "cancelled";
      break;
    default:
      // scheduled / scheduleFailed / stateChanged have no legacy meaning.
      return null;
  }
  const id = ev.appKey ?? alarmAppKey(ev.reminderId, ev.occurrenceAt);
  return {
    type,
    id,
    at: ev.at,
    ...(ev.snoozeUntil !== undefined ? { snoozeUntil: ev.snoozeUntil } : {}),
  };
}

/**
 * @deprecated Kept working for one release as peek + ack so the pre-ring-state
 * reconciliation in lib/notifications.ts keeps compiling. New code should call
 * {@link peekAlarmEvents} + {@link ackAlarmEvents} and feed lib/ringLifecycle.
 *
 * Peeks every unacked event, acks them all, and returns those with a legacy
 * equivalent in the old `{ type, id, at, snoozeUntil }` shape.
 */
export async function getAndClearEventLog(): Promise<AlarmEvent[]> {
  if (!isAlarmKitLinked()) return [];
  const events = await peekAlarmEvents();
  if (events.length === 0) return [];
  await ackAlarmEvents(events.map((e) => e.eventId));
  return events
    .map(toLegacyAlarmEvent)
    .filter((e): e is AlarmEvent => e !== null);
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

// ─── Snooze windows (OLD-119) ───────────────────────────────────────────────

/**
 * Per-reminder AlarmKit guard state, written by lib/notifications.ts when a
 * ring is answered with "Later" and cleared when the reminder completes or is
 * rescheduled. The key literal is repeated here instead of imported so a card
 * can read the snooze window without dragging the notification layer (and
 * notifee with it) into a render path. This module only ever reads it.
 */
const ALARMKIT_STATE_KEY = "@alarmkit_state";

/** reminderId -> snoozeUntil (epoch ms). In-memory mirror of the stored state. */
let snoozeWindows = new Map<string, number>();
let snoozeRefresh: Promise<void> | null = null;

function parseSnoozeWindows(raw: string | null): Map<string, number> {
  const windows = new Map<string, number>();
  if (!raw) return windows;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return windows;
  }
  if (!parsed || typeof parsed !== "object") return windows;
  for (const [reminderId, state] of Object.entries(parsed as Record<string, unknown>)) {
    const until = Number((state as { snoozeUntil?: unknown } | null)?.snoozeUntil ?? 0);
    // 0 is how a cleared window is stored — the reminder is back on schedule.
    if (Number.isFinite(until) && until > 0) windows.set(reminderId, until);
  }
  return windows;
}

/**
 * Reload the mirror from storage so {@link getSnoozeUntil} can answer
 * synchronously. Callers await this before a re-render; the mirror is replaced
 * wholesale, so a window that was cleared disappears with the same read.
 *
 * Concurrent calls share one read, and a failed read keeps the previous mirror
 * rather than blanking every card.
 */
export function refreshSnoozeWindows(): Promise<void> {
  if (snoozeRefresh) return snoozeRefresh;
  const task = (async () => {
    // Only the AlarmKit path ever writes this state; elsewhere the read is
    // guaranteed empty, so skip the storage hop entirely.
    if (!isAlarmKitLinked()) {
      snoozeWindows = new Map();
      return;
    }
    try {
      snoozeWindows = parseSnoozeWindows(await AsyncStorage.getItem(ALARMKIT_STATE_KEY));
    } catch (e) {
      vrLog("alarmkit", "snooze_read_failed", { error: String(e) });
    }
  })().finally(() => {
    if (snoozeRefresh === task) snoozeRefresh = null;
  });
  snoozeRefresh = task;
  return task;
}

/**
 * When a snooze comeback — not the schedule — owns this reminder's next ring.
 *
 * Synchronous because it is read while a card renders. Undefined when the
 * reminder is not snoozed, or when the comeback is already in the past: it has
 * rung, and the schedule owns the reminder again.
 */
export function getSnoozeUntil(reminderId: string, nowMs: number): number | undefined {
  const until = snoozeWindows.get(reminderId);
  return until !== undefined && until > nowMs ? until : undefined;
}

/** Test seam — empties the mirror and drops any in-flight reload. */
export function resetSnoozeWindows(): void {
  snoozeWindows = new Map();
  snoozeRefresh = null;
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
