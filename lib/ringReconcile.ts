/**
 * reconcileRings — the ONE serialized coordinator that turns native AlarmKit
 * evidence (events + live alarm states) and the fallback route into the app's
 * durable ring lifecycle, then lets the card read a single reconciled snapshot.
 *
 * Why serialized: the old world had the 30s tick, foreground and the native
 * drain each read/write storage independently, so the card routinely rendered
 * from a snapshot taken before reconciliation wrote it (Codex ring-state (2),
 * "Later updates late"). Every trigger now funnels through here, and concurrent
 * calls coalesce to one-in-flight + one-queued so a native hint arriving mid-tick
 * cannot interleave two reconciliations.
 *
 * Order, per pass (contract from outputs/codex/2026-09-10-ring-state-impl.md):
 *   hydrate → peekAlarmEvents() → apply each in `at` order → ackAlarmEvents(applied)
 *   → getAlarmStates() → markRinging every alerting occurrence → markMissed the
 *   exhausted-and-unobserved past occurrences → pruneRingLifecycle().
 *
 * Apply-then-ack: an event is acked ONLY after its lifecycle write resolves, so
 * a crash between apply and ack replays the event (idempotent by eventId) rather
 * than losing it. markMissed touches the lifecycle only — the missed-history ROW
 * is still written by the existing ledger in lib/notifications.ts (don't
 * double-write), and we never markMissed an occurrence a live snapshot still
 * reports alerting.
 */
import {
  hydrateRingLifecycle,
  getRingSnapshot,
  markRinging,
  markSnoozed,
  markMissed,
  pruneRingLifecycle,
  occurrenceKey,
  UNKNOWN_GRACE_MS,
  type OccurrenceRef,
  type RingRecord,
} from "./ringLifecycle";
import {
  peekAlarmEvents,
  ackAlarmEvents,
  getAlarmStates,
  refreshSnoozeWindows,
  alarmAppKey,
  type AlarmEvent,
  type AlarmEventType,
  type NativeAlarmEvent,
} from "./alarmKit";
import { completeOccurrence } from "./occurrenceActions";
import { applyAlarmKitEvents } from "./notifications";
import { isOneTimeReminder } from "./notificationDecisions";
import { useReminderStore } from "./store";
import { vrLog } from "./vrLog";

export type ReconcileReason = "tick" | "foreground" | "native" | "launch";

/**
 * A comeback chain is spent 11 min after its armed comeback: the comeback rings
 * at `snoozeUntil`, its two nags at +5/+10, so the last ring is +10 and we allow
 * a ~1 min ring window before calling the whole chain unanswered.
 */
export const COMEBACK_EXHAUSTION_MS = 11 * 60 * 1000;

/**
 * Map a peeked native event to the legacy shape the ledger
 * ({@link applyAlarmKitEvents}) consumes. Mirrors alarmKit's own private
 * `toLegacyAlarmEvent`; kinds with no legacy meaning (scheduled/scheduleFailed/
 * stateChanged) drop out so they never reach the ledger.
 */
function toLegacyEvent(ev: NativeAlarmEvent): AlarmEvent | null {
  let type: AlarmEventType;
  switch (ev.kind) {
    case "stopped": type = "stopped"; break;
    case "snoozed": type = "snoozed"; break;
    case "alerting": type = "fired"; break;
    case "removed": type = "cancelled"; break;
    default: return null;
  }
  return {
    type,
    id: ev.appKey ?? alarmAppKey(ev.reminderId, ev.occurrenceAt),
    at: ev.at,
    ...(typeof ev.snoozeUntil === "number" ? { snoozeUntil: ev.snoozeUntil } : {}),
  };
}

let running: Promise<void> | null = null;
let pending = false;
let latestReason: ReconcileReason = "tick";

/**
 * Coalescing coordinator. While a pass runs, further calls mark one queued pass
 * (any number collapse to a single re-run) and share the in-flight promise.
 */
export function reconcileRings(reason: ReconcileReason): Promise<void> {
  latestReason = reason;
  if (running) {
    pending = true;
    return running;
  }
  running = (async () => {
    try {
      do {
        pending = false;
        const r = latestReason;
        try {
          await runReconcilePass(r);
        } catch (e) {
          vrLog("ring", "reconcile_failed", { reason: r, error: String(e) });
        }
      } while (pending);
    } finally {
      running = null;
    }
  })();
  return running;
}

async function runReconcilePass(reason: ReconcileReason): Promise<void> {
  const now = Date.now();
  await hydrateRingLifecycle();

  // ── Native events: peek → apply in order → ack only what durably applied ──
  const events = await peekAlarmEvents();
  const sorted = [...events].sort((a, b) => a.at - b.at);
  const appliedIds: string[] = [];

  for (const ev of sorted) {
    const ref: OccurrenceRef = { reminderId: ev.reminderId, occurrenceAt: ev.occurrenceAt };
    try {
      switch (ev.kind) {
        case "stopped": {
          const reminder = useReminderStore.getState().getReminderById(ev.reminderId);
          const isOneTime = reminder
            ? isOneTimeReminder(reminder.scheduleType || null, reminder.frequency)
            : false;
          await completeOccurrence(ref, {
            reminderTitle: reminder?.title ?? "",
            isOneTime,
            source: "alarmkit",
            eventId: ev.eventId,
            at: ev.at,
          });
          break;
        }
        case "snoozed": {
          // Real armed comeback time — never a "tap + 5 min" estimate.
          if (typeof ev.snoozeUntil !== "number") {
            vrLog("ring", "snoozed_without_time", { eventId: ev.eventId, reminderId: ev.reminderId });
            break;
          }
          await markSnoozed(ref, {
            snoozeUntil: ev.snoozeUntil,
            chainId: ev.chainId ?? `${ev.reminderId}:snooze:${ev.snoozeUntil}`,
            source: "alarmkit",
            eventId: ev.eventId,
            at: ev.at,
          });
          break;
        }
        case "alerting": {
          await markRinging(ref, {
            source: "alarmkit",
            eventId: ev.eventId,
            chainId: ev.chainId,
            fireAt: ev.at,
          });
          break;
        }
        case "scheduleFailed": {
          // Log only — a failed registration must NOT be recorded as a snooze.
          vrLog("ring", "schedule_failed", {
            eventId: ev.eventId,
            reminderId: ev.reminderId,
            error: ev.error ?? "",
          });
          break;
        }
        case "scheduled":
        case "removed":
        case "stateChanged": {
          // No durable lifecycle write here — the getAlarmStates() pass below
          // re-evaluates current state. Acking clears the native queue entry.
          break;
        }
      }
      appliedIds.push(ev.eventId);
    } catch (e) {
      // Leave this event unacked so the next pass replays it (idempotent).
      vrLog("ring", "apply_event_failed", { eventId: ev.eventId, kind: ev.kind, error: String(e) });
    }
  }

  // Legacy ledger, fed the SAME peeked events (no second native read): it owns
  // the missed/completed HISTORY rows, sibling cancels, one-off removal and
  // repeater reschedules. Idempotent, so a completion reconcileRings already
  // wrote via completeOccurrence is not doubled. reconcileRings is now the sole
  // drainer — this used to run from its own getAndClearEventLog drain, which
  // double-acked the peek/ack queue against reconcileRings.
  let ledgerOk = true;
  const legacyEvents = sorted
    .map(toLegacyEvent)
    .filter((e): e is AlarmEvent => e !== null);
  if (legacyEvents.length > 0) {
    try {
      await applyAlarmKitEvents(legacyEvents, now);
    } catch (e) {
      ledgerOk = false;
      vrLog("ring", "ledger_failed", { error: String(e) });
    }
  }

  // Ack only after BOTH the lifecycle marks and the ledger applied — a failed
  // ledger leaves every event for the next pass (idempotent on replay).
  if (ledgerOk && appliedIds.length > 0) await ackAlarmEvents(appliedIds);

  // ── Live states: anything alerting right now is ringing ──
  const states = await getAlarmStates();
  const alertingKeys = new Set<string>();
  for (const st of states) {
    if (st.state !== "alerting") continue;
    if (typeof st.reminderId !== "string" || typeof st.occurrenceAt !== "number") continue;
    const ref: OccurrenceRef = { reminderId: st.reminderId, occurrenceAt: st.occurrenceAt };
    alertingKeys.add(occurrenceKey(ref));
    try {
      await markRinging(ref, { source: "alarmkit", chainId: st.chainId, fireAt: st.fireAt });
    } catch (e) {
      vrLog("ring", "mark_ringing_failed", { reminderId: st.reminderId, error: String(e) });
    }
  }

  // ── Missed: unresolved past occurrence, no live alerting alarm, past the
  // exhaustion deadline. Lifecycle only — the history row is the ledger's job.
  const snapshot = getRingSnapshot();
  for (const rec of Object.values(snapshot) as RingRecord[]) {
    if (rec.state === "done" || rec.state === "missed") continue;
    if (alertingKeys.has(rec.key)) continue; // still ringing — never miss it

    const deadline =
      rec.state === "snoozed" && typeof rec.snoozeUntil === "number"
        ? rec.snoozeUntil + COMEBACK_EXHAUSTION_MS
        : rec.occurrenceAt + UNKNOWN_GRACE_MS;

    if (now > deadline) {
      try {
        await markMissed({ reminderId: rec.reminderId, occurrenceAt: rec.occurrenceAt }, { at: now });
      } catch (e) {
        vrLog("ring", "mark_missed_failed", { reminderId: rec.reminderId, error: String(e) });
      }
    }
  }

  await pruneRingLifecycle(now);

  // Keep the legacy AlarmKit snooze mirror consistent for any card still reading
  // it; the lifecycle record's snoozeUntil is authoritative from here.
  await refreshSnoozeWindows();

  vrLog("ring", "reconciled", {
    reason,
    events: sorted.length,
    applied: appliedIds.length,
    alerting: alertingKeys.size,
  });
}

/** Test seam — clears the coalescing state between tests. */
export function __resetReconcileForTests(): void {
  running = null;
  pending = false;
  latestReason = "tick";
}
