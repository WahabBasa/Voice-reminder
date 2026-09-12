import type { Reminder, ReminderHistory } from "./store";
import {
  dayBoundsMs,
  isCompletedOnDay,
  isOccurrenceCompleted,
  todayISO,
  toISODate,
  addDaysISO,
} from "./dayOccurrences";
import { getReminderNextDueTimestamp, isReminderActive, statusOf } from "./reminderActive";
import { nextGridOccurrence } from "./schedule";
import { overdueRingTime, overdueSubtitle } from "./todayMembership";
import {
  formatClockAt,
  formatClockTime,
  formatDueNow,
  formatMissedAt,
  formatNextIn,
  formatRingingNow,
  formatRingsAgain,
  type ClockFormatOptions,
} from "./time";
import {
  occurrenceKey,
  UNKNOWN_GRACE_MS,
  type RingRecord,
  type RingSnapshot,
} from "./ringLifecycle";
import { describeGridSubtitle, formatEveryMinutes } from "../components/schedule/scheduleDraft";

export type SnoozeSnapshot = Readonly<Record<string, number>>;
export type DisplayDue = { at: number | null; source: "snooze" | "grid" | "legacy" | "unknown" | "ring" };
/** How the ring state colours the card. `null` = plain scheduled/overdue card. */
export type RingDisplayState = "ringing" | "snoozed" | "missed" | "due-now" | null;
export type ActiveCard = {
  reminder: Reminder;
  due: DisplayDue;
  overdue: boolean;
  dueToday: boolean;
  showCompletion: boolean;
  /** Red one-off "Missed · <time>" state. */
  missed: boolean;
  /** Live ring — subtle accent, sorts to the very top, never red. */
  ringing: boolean;
  /** Which ring-state label/treatment the row should use. */
  ringState: RingDisplayState;
  /** The occurrence the card is displaying, so Done can target it. */
  occurrenceAt: number | null;
};

function sameDay(a: number, nowMs: number): boolean {
  return todayISO(a) === todayISO(nowMs);
}

/**
 * The occurrence the card would show from the schedule alone (no ring state):
 * a live snooze mirror, else the next grid ring that is not already completed
 * per-occurrence, else the legacy computed due. A passed one-off falls through
 * to its own fixed ring time so the card can render it as overdue.
 */
export function nextDisplayDue(
  reminder: Reminder, history: ReminderHistory[], nowMs: number, snoozes: SnoozeSnapshot
): DisplayDue {
  if (snoozes[reminder.id] > nowMs) return { at: snoozes[reminder.id], source: "snooze" };
  if (reminder.schedule) {
    // Walk forward from now, skipping occurrences already completed this run.
    // Per-occurrence: completing 09:00 leaves today's 21:00 still owed.
    let reference = nowMs;
    for (let guard = 0; guard < 16; guard++) {
      const next = nextGridOccurrence(reminder.schedule, reference);
      if (next === null) break;
      if (!isOccurrenceCompleted(reminder, history, next)) return { at: next, source: "grid" };
      reference = next;
    }
    if (reminder.frequency !== "once") return { at: null, source: "unknown" };
    const original = overdueRingTime(reminder, history, nowMs);
    return { at: Number.isFinite(original) ? original : null, source: "grid" };
  }
  const today = todayISO(nowMs);
  const reference = isCompletedOnDay(reminder, history, today)
    ? dayBoundsMs(addDaysISO(today, 1)).start - 1
    : nowMs;
  const next = getReminderNextDueTimestamp(reminder, history, reference);
  return { at: Number.isFinite(next) ? next : null, source: "legacy" };
}

/**
 * The unresolved ring (ringing/snoozed) that should freeze this card. A live
 * "ringing" always wins over a "snoozed" comeback; among equals the latest
 * occurrence wins. (Keys are unique per occurrence, so two records never share
 * an occurrenceAt.)
 */
function governingRing(reminderId: string, ringSnapshot: RingSnapshot): RingRecord | undefined {
  let ringing: RingRecord | undefined;
  let snoozed: RingRecord | undefined;
  for (const record of Object.values(ringSnapshot)) {
    if (record.reminderId !== reminderId) continue;
    if (record.state === "ringing") {
      if (!ringing || record.occurrenceAt > ringing.occurrenceAt) ringing = record;
    } else if (record.state === "snoozed") {
      if (!snoozed || record.occurrenceAt > snoozed.occurrenceAt) snoozed = record;
    }
  }
  return ringing ?? snoozed;
}

/** Advance a repeater past occurrences a lifecycle record already resolved (done/missed). */
function advanceOverResolved(reminder: Reminder, due: DisplayDue, ringSnapshot: RingSnapshot): DisplayDue {
  if (!reminder.schedule) return due;
  let current = due;
  for (let guard = 0; guard < 16 && current.at !== null; guard++) {
    const record = ringSnapshot[occurrenceKey({ reminderId: reminder.id, occurrenceAt: current.at })];
    if (!record || (record.state !== "done" && record.state !== "missed")) return current;
    const next = nextGridOccurrence(reminder.schedule, current.at);
    current = next !== null ? { at: next, source: "grid" } : { at: null, source: "unknown" };
  }
  return current;
}

type CardOverrides = Partial<Pick<ActiveCard, "overdue" | "missed" | "ringing" | "ringState" | "dueToday" | "showCompletion" | "occurrenceAt">>;

function makeCard(reminder: Reminder, nowMs: number, due: DisplayDue, over: CardOverrides): ActiveCard {
  const at = due.at;
  const overdue = over.overdue ?? false;
  const missed = over.missed ?? false;
  const ringing = over.ringing ?? false;
  const ringState = over.ringState ?? null;
  const dueToday = over.dueToday ?? (!overdue && at !== null && sameDay(at, nowMs));
  const showCompletion = over.showCompletion ?? (overdue || dueToday);
  const occurrenceAt = over.occurrenceAt !== undefined ? over.occurrenceAt : at;
  return { reminder, due, overdue, dueToday, showCompletion, missed, ringing, ringState, occurrenceAt };
}

/**
 * One active reminder → its card, ring-state aware. Precedence: a live ring
 * (ringing/snoozed) freezes the card and never turns it red; then the snooze
 * mirror; then the displayed occurrence's own record (done drops a one-off /
 * advances a repeater, missed reddens a one-off); then the unknown/passed rule
 * (neutral "Due now" through the grace window, only then the old overdue red).
 * `null` means the card should be dropped from the active list.
 */
function resolveCard(
  reminder: Reminder,
  history: ReminderHistory[],
  nowMs: number,
  snoozes: SnoozeSnapshot,
  ringSnapshot: RingSnapshot
): ActiveCard | null {
  const isOnce = reminder.frequency === "once";

  const gov = governingRing(reminder.id, ringSnapshot);
  if (gov?.state === "ringing") {
    return makeCard(reminder, nowMs, { at: gov.occurrenceAt, source: "ring" }, {
      ringState: "ringing", ringing: true, occurrenceAt: gov.occurrenceAt, dueToday: true, showCompletion: true,
    });
  }
  if (gov?.state === "snoozed") {
    const at = gov.snoozeUntil ?? gov.occurrenceAt;
    return makeCard(reminder, nowMs, { at, source: "snooze" }, {
      ringState: "snoozed", occurrenceAt: gov.occurrenceAt, dueToday: sameDay(at, nowMs), showCompletion: true,
    });
  }

  let due = nextDisplayDue(reminder, history, nowMs, snoozes);

  // Snooze mirror (lib/alarmKit) is the fallback ring source with no lifecycle record.
  if (due.source === "snooze") {
    return makeCard(reminder, nowMs, due, {
      ringState: "snoozed",
      occurrenceAt: due.at,
      dueToday: due.at !== null && sameDay(due.at, nowMs),
      showCompletion: true,
    });
  }

  if (isOnce) {
    const record = due.at !== null
      ? ringSnapshot[occurrenceKey({ reminderId: reminder.id, occurrenceAt: due.at })]
      : undefined;
    if (record?.state === "done") return null; // completed occurrence → leaves the list
    if (record?.state === "missed") {
      return makeCard(reminder, nowMs, due, { ringState: "missed", missed: true, occurrenceAt: due.at, showCompletion: true });
    }
    if (due.at !== null && nowMs >= due.at) {
      if (nowMs < due.at + UNKNOWN_GRACE_MS) {
        // Ring presumed live but unobserved — neutral, never red, through the grace window.
        return makeCard(reminder, nowMs, due, { ringState: "due-now", occurrenceAt: due.at, dueToday: true, showCompletion: true });
      }
      return makeCard(reminder, nowMs, due, { overdue: true, occurrenceAt: due.at });
    }
    return makeCard(reminder, nowMs, due, {});
  }

  // Repeater / interval: skip occurrences a record already resolved, then show the next.
  due = advanceOverResolved(reminder, due, ringSnapshot);
  return makeCard(reminder, nowMs, due, {});
}

function cardRank(card: ActiveCard): number {
  if (card.ringing) return 2;
  if (card.overdue || card.missed) return 1;
  return 0;
}

export function activeCards(
  reminders: Reminder[], history: ReminderHistory[], nowMs: number,
  snoozes: SnoozeSnapshot, ringSnapshot: RingSnapshot = {}
): ActiveCard[] {
  const cards: ActiveCard[] = [];
  for (const reminder of reminders) {
    if (!isReminderActive(reminder, history, nowMs)) continue;
    const card = resolveCard(reminder, history, nowMs, snoozes, ringSnapshot);
    if (card) cards.push(card);
  }
  return cards.sort((a, b) => cardRank(b) - cardRank(a)
    || (a.due.at ?? Infinity) - (b.due.at ?? Infinity)
    || a.reminder.id.localeCompare(b.reminder.id));
}

export function nextLine(card: ActiveCard, nowMs: number, options: ClockFormatOptions = {}): string {
  if (card.ringState === "ringing") return formatRingingNow();
  if (card.ringState === "due-now") return formatDueNow();
  if (card.ringState === "missed") return formatMissedAt(card.occurrenceAt ?? card.due.at ?? nowMs, options);
  const at = card.due.at;
  if (at === null) return "No next ring scheduled";
  if (card.due.source === "snooze") return formatRingsAgain(at, options);
  if (card.overdue) return `Overdue · ${overdueSubtitle(card.reminder, [], nowMs, options)}`;
  if (at - nowMs < 86_400_000) return formatNextIn(at, nowMs);
  const today = todayISO(nowMs);
  const date = todayISO(at);
  if (date === addDaysISO(today, 1)) return `Tomorrow · ${formatClockAt(at, options)}`;
  for (let days = 2; days <= 6; days++) {
    if (date === addDaysISO(today, days)) return `Next in ${days} days`;
  }
  return `${new Date(at).toLocaleDateString("en", { month: "short", day: "numeric" })} · ${formatClockAt(at, options)}`;
}

export function patternLine(
  reminder: Reminder, options: ClockFormatOptions = {}, nowMs: number = Date.now()
): string {
  // A one-off's "pattern" is its date. Real `nowMs` matters for date-less one-offs, whose
  // target rolls forward from now; 0 would print a 1970 date.
  if (reminder.frequency === "once") return `Once · ${overdueSubtitle(reminder, [], nowMs, options)}`;
  if (reminder.schedule) {
    const description = describeGridSubtitle(reminder.schedule, options);
    if (reminder.schedule.times.kind === "interval") return description;
    const [times, days] = description.split(" · ");
    const pattern = reminder.schedule.days.kind === "weekdays" && reminder.schedule.days.days.length
      ? `Every ${days}` : days;
    return pattern ? `${pattern} · ${times}` : times;
  }
  if (reminder.frequency === "interval") {
    return reminder.intervalMs ? `Every ${formatEveryMinutes(reminder.intervalMs / 60_000)}` : "";
  }
  const time = formatClockTime(reminder.time ?? "", options);
  if (reminder.frequency === "daily") {
    const n = reminder.intervalDays ?? 1;
    return `${n > 1 ? `Every ${n} days` : "Daily"} · ${time}`;
  }
  const days = (reminder.days ?? []).map((day) => day[0].toUpperCase() + day.slice(1, 3).toLowerCase()).join(", ");
  return `${days ? `Every ${days}` : "Weekly"} · ${time}`;
}

export function overdueDays(reminders: Reminder[], history: ReminderHistory[], nowMs: number): Set<string> {
  return new Set(reminders.filter((r) => statusOf(r, history, nowMs) === "overdue")
    .map((r) => toISODate(new Date(overdueRingTime(r, history, nowMs)))));
}
