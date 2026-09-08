import type { Reminder, ReminderHistory } from "./store";
import { dayBoundsMs, isCompletedOnDay, todayISO, toISODate, addDaysISO } from "./dayOccurrences";
import { getReminderNextDueTimestamp, isReminderActive, statusOf } from "./reminderActive";
import { nextGridOccurrence } from "./schedule";
import { overdueRingTime, overdueSubtitle } from "./todayMembership";
import { formatClockAt, formatClockTime, formatNextIn, type ClockFormatOptions } from "./time";
import { describeGridSubtitle, formatEveryMinutes } from "../components/schedule/scheduleDraft";

export type SnoozeSnapshot = Readonly<Record<string, number>>;
export type DisplayDue = { at: number | null; source: "snooze" | "grid" | "legacy" | "unknown" };
export type ActiveCard = {
  reminder: Reminder;
  due: DisplayDue;
  overdue: boolean;
  dueToday: boolean;
  showCompletion: boolean;
};

export function nextDisplayDue(
  reminder: Reminder, history: ReminderHistory[], nowMs: number, snoozes: SnoozeSnapshot
): DisplayDue {
  if (snoozes[reminder.id] > nowMs) return { at: snoozes[reminder.id], source: "snooze" };
  const today = todayISO(nowMs);
  const reference = isCompletedOnDay(reminder, history, today)
    ? dayBoundsMs(addDaysISO(today, 1)).start - 1
    : nowMs;
  if (reminder.schedule) {
    const next = nextGridOccurrence(reminder.schedule, reference);
    if (next !== null) return { at: next, source: "grid" };
    if (reminder.frequency !== "once") return { at: null, source: "unknown" };
    const original = overdueRingTime(reminder, history, nowMs);
    return { at: Number.isFinite(original) ? original : null, source: "grid" };
  }
  const next = getReminderNextDueTimestamp(reminder, history, reference);
  return { at: Number.isFinite(next) ? next : null, source: "legacy" };
}

export function activeCards(
  reminders: Reminder[], history: ReminderHistory[], nowMs: number, snoozes: SnoozeSnapshot
): ActiveCard[] {
  return reminders.filter((r) => isReminderActive(r, history, nowMs)).map((reminder) => {
    const due = nextDisplayDue(reminder, history, nowMs, snoozes);
    const overdue = reminder.frequency === "once" && due.source !== "snooze" && due.at !== null && due.at <= nowMs;
    const dueToday = !overdue && due.at !== null && todayISO(due.at) === todayISO(nowMs);
    return { reminder, due, overdue, dueToday, showCompletion: overdue || dueToday };
  }).sort((a, b) => Number(b.overdue) - Number(a.overdue)
    || (a.due.at ?? Infinity) - (b.due.at ?? Infinity)
    || a.reminder.id.localeCompare(b.reminder.id));
}

export function nextLine(card: ActiveCard, nowMs: number, options: ClockFormatOptions = {}): string {
  const at = card.due.at;
  if (at === null) return "No next ring scheduled";
  if (card.due.source === "snooze") return `Rings again ${formatClockAt(at, options)}`;
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
