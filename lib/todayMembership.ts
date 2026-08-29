/**
 * What the Today page is made of (OLD-118).
 *
 * Today used to be date-pure — a reminder was in it only if it had an
 * occurrence on today's calendar date. That hid the one thing the user most
 * needs to see. A one-off is owed until it is ticked or deleted (decision
 * 2026-08-29); ringing out changes nothing. So a one-off that rang on Tuesday
 * and was never ticked was still alive on Thursday, still counting against the
 * free cap of 5, and yet nowhere on screen — the user met "You've reached 5
 * active reminders" over an apparently empty list.
 *
 * Today is therefore two groups: everything still owed from a ring that has
 * already passed (Overdue), and the day's own schedule (Today). A reminder
 * never appears in both — an overdue one-off dated today belongs to Overdue,
 * because the ring it is waiting on is behind it, not ahead.
 */

import { isCompletedOnDay, occurrencesForDay } from "./dayOccurrences";
import { getReminderNextDueTimestamp, statusOf } from "./reminderActive";
import { type Reminder, type ReminderHistory } from "./store";
import { formatClockAt, type ClockFormatOptions } from "./time";

export interface TodayGroups {
  /** Owed one-offs whose ring time has passed, earliest ring first. */
  overdue: Reminder[];
  /** The day's own list, minus anything already in `overdue`. */
  today: Reminder[];
}

/**
 * The moment an overdue reminder was supposed to ring — its LOCAL date+time,
 * which is what `statusOf` judges it by (`onceAt` is computed server-side in
 * UTC and can disagree).
 */
export function overdueRingTime(
  reminder: Reminder,
  history: ReminderHistory[],
  nowMs: number = Date.now()
): number {
  return getReminderNextDueTimestamp(reminder, history, nowMs);
}

/**
 * "Aug 25 · 3:42 pm" — when it was meant to go off. Overdue rows carry the
 * original date because "3:42 pm" alone reads as today, which is the confusion
 * this group exists to clear up.
 */
export function overdueSubtitle(
  reminder: Reminder,
  history: ReminderHistory[],
  nowMs: number = Date.now(),
  options: ClockFormatOptions = {}
): string {
  const ring = overdueRingTime(reminder, history, nowMs);
  const date = new Date(ring);
  if (Number.isNaN(date.getTime())) return "";
  const day = date.toLocaleDateString([], { month: "short", day: "numeric" });
  return `${day} · ${formatClockAt(date, options)}`;
}

/**
 * Split the reminders Today should show into the Overdue group and the day's
 * own list. Callers pass reminders already filtered by `isReminderActive`, but
 * a ticked one-off is dropped by both branches anyway, so passing everything is
 * safe.
 */
export function groupTodayReminders(
  reminders: Reminder[],
  history: ReminderHistory[],
  todayDateISO: string,
  nowMs: number = Date.now()
): TodayGroups {
  const overdue: Reminder[] = [];
  const overdueIds = new Set<string>();

  for (const reminder of reminders) {
    if (statusOf(reminder, history, nowMs) !== "overdue") continue;
    overdue.push(reminder);
    overdueIds.add(reminder.id);
  }

  overdue.sort(
    (a, b) => overdueRingTime(a, history, nowMs) - overdueRingTime(b, history, nowMs)
  );

  const today = occurrencesForDay(reminders, todayDateISO).filter(
    (reminder) =>
      !overdueIds.has(reminder.id) && !isCompletedOnDay(reminder, history, todayDateISO)
  );

  return { overdue, today };
}
