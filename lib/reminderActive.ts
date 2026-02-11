import { type Reminder, type ReminderHistory } from "./store";
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

export function isReminderActive(
  reminder: Reminder,
  history: ReminderHistory[],
  nowMs: number = Date.now()
): boolean {
  // Interval reminders always recur.
  if (reminder.frequency === "interval") return true;

  // One-time reminders stay visible (including overdue/missed) until explicitly completed.
  if (reminder.frequency === "once") {
    return !hasCompletedEntry(history, reminder.id);
  }

  // Recurring reminders remain active.
  return true;
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

export function shouldCleanupGhostOnceReminder(
  reminder: Reminder,
  history: ReminderHistory[],
  nowMs: number = Date.now()
): boolean {
  if (reminder.frequency !== "once") return false;
  // Only cleanup if the reminder was explicitly completed.
  if (!hasCompletedEntry(history, reminder.id)) return false;
  // Past-due guard for dated one-time reminders.
  if (reminder.date) {
    return getOnceTargetTimestamp(reminder, nowMs) <= nowMs;
  }
  return true;
}
