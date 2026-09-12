/**
 * Per-occurrence Done / Later, unified across every surface.
 *
 * The card, the AlarmOverlay, the /alarm screen and the notifee action handlers
 * used to each complete or snooze a ring their own way — which is why a card
 * Done on a repeater only wrote history (never stopped the ring), and a "Later"
 * tap was throttled by the ignored-ring cap. Both funnel through here now:
 *
 *  - `completeOccurrence` stops the ring, cancels THAT occurrence's chain, marks
 *    the lifecycle done, writes history with `scheduledFor = occurrenceAt`
 *    (idempotently), and removes a one-off / keeps a repeater.
 *  - `laterOccurrence` is the FALLBACK route's Later: cancel the remaining chain,
 *    arm a fresh comeback at tap+5 with +5/+10 nags, mark the lifecycle snoozed
 *    with the REAL armed time — unlimited, because a deliberate Later is not an
 *    ignored ring (see planLaterComeback).
 *
 * The heavy notifee/native side-effects are INJECTED (`cancelFallbackChain`,
 * `scheduleComeback`, `stopNative`, `removeReminder`) so this module never has
 * to import lib/notifications.ts — that keeps it free of a circular import and
 * unit-testable without dragging notifee into the test. Sensible defaults hit
 * the real native stop / removal paths.
 */
import { markDone, markSnoozed, type OccurrenceRef, type RingSource } from "./ringLifecycle";
import { stopOccurrence } from "./alarmKit";
import { planLaterComeback } from "./notificationDecisions";
import { useReminderStore, type ReminderHistory } from "./store";
import { vrLog } from "./vrLog";

export interface CompleteOccurrenceOpts {
  /** Title recorded on the history row. */
  reminderTitle: string;
  /** One-offs are removed after Done; repeaters keep their future occurrences. */
  isOneTime: boolean;
  source?: RingSource;
  /** De-dup id for the lifecycle mark (native/fallback event id). */
  eventId?: string;
  at?: number;
  /** Cancel this occurrence's notifee fallback chain (occurrence + snooze triggers). */
  cancelFallbackChain?: (ref: OccurrenceRef) => Promise<void>;
  /** Stop the native alarm for this occurrence. Defaults to alarmKit.stopOccurrence. */
  stopNative?: (ref: OccurrenceRef) => Promise<void>;
  /** Remove a one-off fully. Defaults to reminderRemoval.removeReminderFully. */
  removeReminder?: (reminderId: string) => Promise<void>;
}

export interface LaterOccurrenceOpts {
  source?: RingSource;
  /** Tap wall-clock; the comeback is armed relative to this. Defaults to Date.now(). */
  at?: number;
  eventId?: string;
  /** Cancel the remaining chain for this occurrence before re-arming. */
  cancelFallbackChain?: (ref: OccurrenceRef) => Promise<void>;
  /** Arm the comeback + nag siblings at the given absolute fire times (fallback route). */
  scheduleComeback: (ref: OccurrenceRef, fireTimes: number[]) => Promise<void>;
}

/** True when history already carries a completion for exactly this occurrence. */
export function hasOccurrenceCompletion(
  history: ReminderHistory[],
  ref: OccurrenceRef
): boolean {
  return history.some(
    (h) =>
      h.reminderId === ref.reminderId &&
      h.status === "completed" &&
      h.scheduledFor === ref.occurrenceAt
  );
}

async function defaultStopNative(ref: OccurrenceRef): Promise<void> {
  // No-op off iOS / pre-AlarmKit by contract.
  await stopOccurrence(ref);
}

async function defaultRemoveReminder(reminderId: string): Promise<void> {
  const { removeReminderFully } = await import("./reminderRemoval");
  await removeReminderFully(reminderId);
}

/**
 * Done for THIS occurrence, from any surface. Idempotent: replaying the same
 * completion (event acked twice, double-tap) writes at most one history row and
 * never resurrects a removed reminder.
 */
export async function completeOccurrence(
  ref: OccurrenceRef,
  opts: CompleteOccurrenceOpts
): Promise<void> {
  // 1. Stop the ring itself (native), then its fallback chain. Both idempotent.
  await (opts.stopNative ?? defaultStopNative)(ref);
  if (opts.cancelFallbackChain) await opts.cancelFallbackChain(ref);

  // 2. Terminal lifecycle state — the card flips to Done within the tick.
  await markDone(ref, { eventId: opts.eventId, at: opts.at });

  // 3. History write keyed to the ORIGINAL occurrence, skipped if already there.
  const store = useReminderStore.getState();
  if (!hasOccurrenceCompletion(store.history, ref)) {
    await store.recordCompletion(ref.reminderId, opts.reminderTitle, "completed", {
      scheduledFor: ref.occurrenceAt,
      action: "dismissed",
    });
  }

  // 4. One-off: gone. Repeater: its future occurrences survive.
  if (opts.isOneTime) await (opts.removeReminder ?? defaultRemoveReminder)(ref.reminderId);

  vrLog("ring", "occurrence_completed", {
    reminderId: ref.reminderId,
    occurrenceAt: ref.occurrenceAt,
    source: opts.source ?? "fallback",
    isOneTime: opts.isOneTime,
  });
}

/**
 * "Later" on the FALLBACK (notifee) route. Native AlarmKit handles its own
 * Later; this mirrors it for the fallback: unlimited, comeback at tap+5, two
 * nags at +5/+10. Every call replaces the chain (a fresh chainId) so the
 * ignored-ring cap never applies.
 *
 * Returns the plan it armed so the caller can log/verify the real comeback time.
 */
export async function laterOccurrence(
  ref: OccurrenceRef,
  opts: LaterOccurrenceOpts
): Promise<{ comebackAt: number; fireTimes: number[] }> {
  const tapAt = opts.at ?? Date.now();
  const plan = planLaterComeback(tapAt);

  // Drop whatever chain was armed, then arm the new one. Order matters: cancel
  // first so a stale comeback cannot outlive the replacement.
  if (opts.cancelFallbackChain) await opts.cancelFallbackChain(ref);
  await opts.scheduleComeback(ref, plan.fireTimes);

  // A Later starts a NEW chain; snoozeUntil is the REAL armed comeback time.
  await markSnoozed(ref, {
    snoozeUntil: plan.comebackAt,
    chainId: `${ref.reminderId}:later:${tapAt}`,
    source: opts.source ?? "fallback",
    eventId: opts.eventId,
    at: tapAt,
  });

  vrLog("ring", "occurrence_later", {
    reminderId: ref.reminderId,
    occurrenceAt: ref.occurrenceAt,
    comebackAt: plan.comebackAt,
    fireTimes: plan.fireTimes.join("|"),
    source: opts.source ?? "fallback",
  });

  return plan;
}
