// Type-only: store.ts imports `isReminderActive` from here at runtime, so this
// side must never pull store in as a value.
import type { Reminder, ReminderHistory } from "./store";
import {
  getDueTimestamp,
  getNextIntervalOccurrence,
  getNextTriggerTime,
  type ReminderSchedule,
} from "./time";

function getDayBoundsMs(nowMs: number): { start: number; end: number } {
  const d = new Date(nowMs);
  const start = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  return { start, end: start + 24 * 60 * 60 * 1000 };
}

function hasCompletedEntry(history: ReminderHistory[], reminderId: string): boolean {
  for (const entry of history) {
    if (entry.reminderId !== reminderId) continue;
    if (entry.status === "completed") return true;
  }
  return false;
}

function hasCompletedToday(history: ReminderHistory[], reminderId: string, nowMs: number): boolean {
  const { start, end } = getDayBoundsMs(nowMs);
  for (const entry of history) {
    if (entry.reminderId !== reminderId) continue;
    if (entry.status !== "completed") continue;
    const ts = new Date(entry.timestamp).getTime();
    if (ts >= start && ts < end) return true;
  }
  return false;
}

function getOnceTargetTimestamp(reminder: Reminder, nowMs: number): number {
  if (!reminder.time) return nowMs;
  const [hours, minutes] = reminder.time.split(":").map(Number);

  // Strict one-time: if a date is present, do NOT roll forward.
  if (reminder.date) {
    const [year, month, day] = reminder.date.split("-").map(Number);
    return new Date(year, month - 1, day, hours, minutes, 0, 0).getTime();
  }

  // Fallback: next occurrence relative to now.
  const schedule: ReminderSchedule = {
    time: reminder.time,
    frequency: "once",
    intervalDays: reminder.intervalDays,
    scheduledFor: reminder.scheduledFor,
  };
  return getNextTriggerTime(schedule, nowMs);
}

/**
 * Where a reminder is in its life — computed every time it is asked, never
 * stored (decision 2026-08-29).
 *
 * - "done":      a one-off the user ticked — any `completed` ledger entry.
 *                Repeaters and intervals are never done as a whole; "done for
 *                today" is `isCompletedOnDay` in dayOccurrences.
 * - "overdue":   a one-off that is not done and whose ring time has passed.
 *                Ringing out ends nothing: a `missed` ledger entry records that
 *                it rang unanswered, and the reminder stays owed until it is
 *                ticked or deleted.
 * - "scheduled": everything else.
 *
 * The ring time is recomputed from `date` + `time` on the device rather than
 * read from `onceAt`: rows stored before OLD-120 carry a UTC-skewed `onceAt`,
 * and the wall-clock pair is right on every row.
 */
export type ReminderStatus = "done" | "overdue" | "scheduled";

export function statusOf(
  reminder: Reminder,
  history: ReminderHistory[],
  nowMs: number = Date.now()
): ReminderStatus {
  if (reminder.frequency !== "once") return "scheduled";
  if (hasCompletedEntry(history, reminder.id)) return "done";
  return getOnceTargetTimestamp(reminder, nowMs) <= nowMs ? "overdue" : "scheduled";
}

/** Owed to the user — anything not done. This is what the free cap counts. */
export function isReminderActive(
  reminder: Reminder,
  history: ReminderHistory[],
  nowMs: number = Date.now()
): boolean {
  return statusOf(reminder, history, nowMs) !== "done";
}

export function getReminderNextDueTimestamp(
  reminder: Reminder,
  history: ReminderHistory[],
  nowMs: number = Date.now()
): number {
  if (reminder.frequency === "interval" && reminder.intervalMs && reminder.anchorAt) {
    return getNextIntervalOccurrence(reminder.anchorAt, reminder.intervalMs, nowMs).scheduledFor;
  }

  if (reminder.frequency === "once") {
    return getOnceTargetTimestamp(reminder, nowMs);
  }

  const schedule: ReminderSchedule = {
    time: reminder.time,
    date: reminder.date,
    frequency: reminder.frequency,
    days: reminder.days,
    intervalDays: reminder.intervalDays,
    scheduledFor: reminder.scheduledFor,
    intervalMs: reminder.intervalMs,
    anchorAt: reminder.anchorAt,
  };

  // If user marked today's occurrence as done, show the next occurrence.
  if (hasCompletedToday(history, reminder.id, nowMs)) {
    return getNextTriggerTime(schedule, nowMs + 60_000);
  }

  return getDueTimestamp(schedule, new Date(nowMs));
}

/**
 * Whether the launch sweep should drop this one-off from the list. Same rule as
 * the cap: a ticked one-off is finished and has no reason to stay, whatever its
 * date said. Anything still owed — including one that rang out — is kept.
 */
export function shouldCleanupGhostOnceReminder(
  reminder: Reminder,
  history: ReminderHistory[],
  nowMs: number = Date.now()
): boolean {
  return statusOf(reminder, history, nowMs) === "done";
}
