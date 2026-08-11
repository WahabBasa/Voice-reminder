import { type Reminder, type ReminderHistory } from "./store";
import { getNextIntervalOccurrence, getNextTriggerTime, type ReminderSchedule } from "./time";

const DAY_MS = 24 * 60 * 60 * 1000;

const DAY_MAP: Record<string, number> = {
  sun: 0,
  mon: 1,
  tue: 2,
  wed: 3,
  thu: 4,
  fri: 5,
  sat: 6,
};

// ---------- ISO date helpers (local-time "YYYY-MM-DD") ----------

export function toISODate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Parses "YYYY-MM-DD" to a Date at local midnight. */
export function parseISODate(dateISO: string): Date {
  const [y, m, d] = dateISO.split("-").map(Number);
  return new Date(y, m - 1, d, 0, 0, 0, 0);
}

export function addDaysISO(dateISO: string, delta: number): string {
  const d = parseISODate(dateISO);
  d.setDate(d.getDate() + delta);
  return toISODate(d);
}

export function todayISO(nowMs: number = Date.now()): string {
  return toISODate(new Date(nowMs));
}

/** Local-midnight bounds [start, end) for a calendar day. */
export function dayBoundsMs(dateISO: string): { start: number; end: number } {
  const start = parseISODate(dateISO).getTime();
  return { start, end: start + DAY_MS };
}

function startOfLocalDayMs(ms: number): number {
  const d = new Date(ms);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

// ---------- Occurrence logic ----------

function createdDayStartMs(reminder: Reminder): number {
  const created = new Date(reminder.createdAt).getTime();
  return Number.isFinite(created) ? startOfLocalDayMs(created) : 0;
}

/**
 * Does this reminder have an occurrence on the given calendar day?
 * Same membership rules as the day list: one-offs on their date, repeats on
 * matching days (bounded by creation day), intervals on days a tick lands in.
 */
export function occursOnDay(reminder: Reminder, dateISO: string): boolean {
  const { start, end } = dayBoundsMs(dateISO);

  // Bounded recurrences stop after `until`.
  if (reminder.until && start > reminder.until) return false;

  if (reminder.frequency === "once") {
    if (reminder.date) return reminder.date === dateISO;
    const ts = reminder.scheduledFor ?? reminder.onceAt;
    if (ts) return ts >= start && ts < end;
    // Undated one-off: fall back to the schedule's computed target.
    const schedule: ReminderSchedule = {
      time: reminder.time,
      frequency: "once",
      intervalDays: reminder.intervalDays,
      scheduledFor: reminder.scheduledFor,
    };
    const target = getNextTriggerTime(schedule);
    return target >= start && target < end;
  }

  if (reminder.frequency === "interval") {
    if (!reminder.anchorAt || !reminder.intervalMs) return false;
    if (end <= reminder.anchorAt - reminder.intervalMs) return false;
    // First tick at or after day start; occurs if it lands inside the day.
    const first = firstIntervalTickInDay(reminder.anchorAt, reminder.intervalMs, start);
    return first !== null && first < end;
  }

  // Repeats never occur before the day they were created.
  if (end <= createdDayStartMs(reminder)) return false;

  if (reminder.frequency === "daily") {
    const n = reminder.intervalDays && reminder.intervalDays > 1 ? reminder.intervalDays : 1;
    if (n === 1) return true;
    // Cadence anchored on the next computed occurrence (or creation day).
    const anchor = startOfLocalDayMs(reminder.scheduledFor ?? createdDayStartMs(reminder));
    const diffDays = Math.round((start - anchor) / DAY_MS);
    return ((diffDays % n) + n) % n === 0;
  }

  if (reminder.frequency === "weekly" || reminder.frequency === "custom") {
    const days = (reminder.days ?? [])
      .map((d) => DAY_MAP[d.toLowerCase()])
      .filter((d) => d !== undefined);
    if (days.length === 0) return true; // matches getNextTriggerTime's daily fallback
    return days.includes(parseISODate(dateISO).getDay());
  }

  return false;
}

/** Smallest tick anchorAt + k*intervalMs (k >= 0) at or after dayStart, or null. */
function firstIntervalTickInDay(
  anchorAt: number,
  intervalMs: number,
  dayStart: number
): number | null {
  if (!Number.isFinite(intervalMs) || intervalMs <= 0) return null;
  if (anchorAt >= dayStart) return anchorAt;
  const { scheduledFor } = getNextIntervalOccurrence(anchorAt, intervalMs, dayStart - 1);
  return scheduledFor;
}

/** Sort key: when within the day this reminder first fires (ms timestamp). */
export function occurrenceSortKey(reminder: Reminder, dateISO: string): number {
  const { start, end } = dayBoundsMs(dateISO);

  if (reminder.frequency === "interval" && reminder.anchorAt && reminder.intervalMs) {
    const first = firstIntervalTickInDay(reminder.anchorAt, reminder.intervalMs, start);
    return first !== null && first < end ? first : end;
  }

  if (reminder.time) {
    const [hours, minutes] = reminder.time.split(":").map(Number);
    return start + (hours * 60 + minutes) * 60 * 1000;
  }

  if (reminder.frequency === "once") {
    const ts = reminder.scheduledFor ?? reminder.onceAt;
    if (ts && ts >= start && ts < end) return ts;
  }

  return end;
}

/** Active reminders occurring on the day, sorted by first fire time. */
export function occurrencesForDay(reminders: Reminder[], dateISO: string): Reminder[] {
  return reminders
    .filter((r) => occursOnDay(r, dateISO))
    .sort((a, b) => occurrenceSortKey(a, dateISO) - occurrenceSortKey(b, dateISO));
}

// ---------- History ----------

/** History entries whose timestamp falls on the given day, oldest first. */
export function historyOnDay(history: ReminderHistory[], dateISO: string): ReminderHistory[] {
  const { start, end } = dayBoundsMs(dateISO);
  return history
    .filter((entry) => {
      const ts = new Date(entry.timestamp).getTime();
      return ts >= start && ts < end;
    })
    .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
}

/** True if the reminder was completed on the given day (any completion for one-offs). */
export function isCompletedOnDay(
  reminder: Reminder,
  history: ReminderHistory[],
  dateISO: string
): boolean {
  const { start, end } = dayBoundsMs(dateISO);
  for (const entry of history) {
    if (entry.reminderId !== reminder.id) continue;
    if (entry.status !== "completed") continue;
    if (reminder.frequency === "once") return true;
    const ts = new Date(entry.timestamp).getTime();
    if (ts >= start && ts < end) return true;
  }
  return false;
}

// ---------- Activity dots ----------

export const MAX_ACTIVITY_DOTS = 3;

/** Number of activity dots for a day (capped at MAX_ACTIVITY_DOTS). */
export function activityDotCount(reminders: Reminder[], dateISO: string): number {
  let count = 0;
  for (const reminder of reminders) {
    if (occursOnDay(reminder, dateISO)) {
      count++;
      if (count >= MAX_ACTIVITY_DOTS) return MAX_ACTIVITY_DOTS;
    }
  }
  return count;
}

/** Dot counts for a batch of days, keyed by ISO date. */
export function activityDotCounts(
  reminders: Reminder[],
  dateISOs: string[]
): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const dateISO of dateISOs) {
    counts[dateISO] = activityDotCount(reminders, dateISO);
  }
  return counts;
}
