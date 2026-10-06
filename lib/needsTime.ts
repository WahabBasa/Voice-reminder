import type { GridSchedule } from "../convex/scheduleShape";
import type { PendingPlan } from "./pendingTakes";

/**
 * "When should I remind you?" — the client's arithmetic (founder decision,
 * 2026-10-06).
 *
 * A take the server heard but could not place in time (`no_time`, or a
 * `past_time` one-off) keeps its reminder, and the card offers three quick
 * answers plus "Pick a time…". This module is what those answers mean: which
 * plan the card is about, and the wall-clock date and time each quick choice
 * lands on, in the user's own zone.
 *
 * Pure on purpose (no React, no store, no clock of its own), so the time math
 * is pinned by tests in every zone and across DST, not by a device.
 */

export type QuickChoiceId = "in_1_hour" | "this_evening" | "tomorrow_morning";

export type QuickChoice = {
  id: QuickChoiceId;
  label: string;
  /** "YYYY-MM-DD" on the user's calendar. */
  date: string;
  /** "HH:MM", 24-hour, on the user's clock. */
  time: string;
};

const LABELS: Record<QuickChoiceId, string> = {
  in_1_hour: "In 1 hour",
  this_evening: "This evening",
  tomorrow_morning: "Tomorrow morning",
};

/** The labels, in the order the card shows them. "Pick a time…" follows. */
export const QUICK_CHOICES: ReadonlyArray<{ id: QuickChoiceId; label: string }> = (
  ["in_1_hour", "this_evening", "tomorrow_morning"] as const
).map((id) => ({ id, label: LABELS[id] }));

export const PICK_A_TIME_LABEL = "Pick a time…";
export const EVENING_TIME = "18:00";
export const MORNING_TIME = "09:00";
const HOUR_MS = 60 * 60_000;

type WallClock = { date: string; time: string };

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/**
 * The wall clock `ms` reads in `tzid`. Falls back to the runtime's own zone
 * when `tzid` is one Intl does not know — on the phone that IS the user's zone,
 * which is where `tzid` came from in the first place.
 */
export function wallClockIn(ms: number, tzid: string): WallClock {
  try {
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: tzid,
      hour12: false,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
    const fields: Record<string, number> = {};
    for (const part of formatter.formatToParts(new Date(ms))) {
      fields[part.type] = Number(part.value);
    }
    // Some ICU builds report midnight as hour 24 under hour12:false.
    return {
      date: `${fields.year}-${pad(fields.month)}-${pad(fields.day)}`,
      time: `${pad(fields.hour % 24)}:${pad(fields.minute)}`,
    };
  } catch {
    const local = new Date(ms);
    return {
      date: `${local.getFullYear()}-${pad(local.getMonth() + 1)}-${pad(local.getDate())}`,
      time: `${pad(local.getHours())}:${pad(local.getMinutes())}`,
    };
  }
}

/** The calendar day after `date` — pure calendar math, no zone implied. */
export function nextCalendarDay(date: string): string {
  const [year, month, day] = date.split("-").map(Number);
  const next = new Date(Date.UTC(year, month - 1, day + 1));
  return `${next.getUTCFullYear()}-${pad(next.getUTCMonth() + 1)}-${pad(next.getUTCDate())}`;
}

/**
 * Where a quick choice lands, decided at the moment it is tapped:
 *   - "In 1 hour": the wall clock an hour from now (DST-safe: an hour of real
 *     time, then read off the clock).
 *   - "This evening": 18:00 today, or an hour from now once 18:00 has gone.
 *   - "Tomorrow morning": 09:00 on tomorrow's date.
 */
export function quickChoiceTime(id: QuickChoiceId, nowMs: number, tzid: string): QuickChoice {
  const label = LABELS[id];
  const now = wallClockIn(nowMs, tzid);
  const inAnHour = wallClockIn(nowMs + HOUR_MS, tzid);
  switch (id) {
    case "this_evening":
      return now.time < EVENING_TIME
        ? { id, label, date: now.date, time: EVENING_TIME }
        : { id, label, ...inAnHour };
    case "tomorrow_morning":
      return { id, label, date: nextCalendarDay(now.date), time: MORNING_TIME };
    default:
      return { id, label, ...inAnHour };
  }
}

/** A one-off grid: one date, one clock time, the zone it was picked in. */
export function onceGrid(date: string, time: string, tzid: string): GridSchedule {
  return {
    type: "grid",
    days: { kind: "date", date },
    times: { kind: "clock", times: [time] },
    tzid,
  };
}

/**
 * What "Pick a time…" opens the edit sheet with: the kept reminder, filled in
 * (title, spoken line, emoji), as a one-off an hour from now — a starting point
 * the time controls move from, never something saved as it stands. The id can
 * collide with no stored reminder.
 */
export function draftReminderFor(
  creationId: string,
  plan: PendingPlan,
  nowMs: number,
  tzid: string
): {
  id: string;
  title: string;
  description: string;
  emoji?: string;
  time: string;
  date: string;
  frequency: string;
  days: string[];
  schedule: GridSchedule;
  tzid: string;
  createdAt: string;
} {
  const start = quickChoiceTime("in_1_hour", nowMs, tzid);
  return {
    id: `needs-time:${creationId}`,
    title: plan.title,
    description: plan.description,
    ...(plan.emoji ? { emoji: plan.emoji } : {}),
    time: start.time,
    date: start.date,
    frequency: "once",
    days: [],
    schedule: onceGrid(start.date, start.time, tzid),
    tzid,
    createdAt: new Date(nowMs).toISOString(),
  };
}

/**
 * Which kept reminder the card is about, and what else the take holds.
 *
 * The card shows the first plan waiting for a time (or the first plan, if the
 * server flagged none). The rest ride along as a quiet "+N more" line: the
 * picked time goes on every plan that was waiting for one, and the others keep
 * the time they were said with — one answer, the whole take created.
 */
export function needsTimeFocus(
  plans: readonly PendingPlan[] | undefined
): { plan: PendingPlan; others: PendingPlan[] } | null {
  if (!plans || plans.length === 0) return null;
  const index = Math.max(
    0,
    plans.findIndex((plan) => plan.needsTime)
  );
  return { plan: plans[index], others: plans.filter((_, i) => i !== index) };
}
