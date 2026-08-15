/**
 * The days × times schedule grid (OLD-97).
 *
 * A schedule is two orthogonal axes and nothing else:
 *
 *   days:  every day | specific weekdays | every N days | one specific date
 *   times: one or more clock times | an interval inside a start–end window
 *
 * Any combination is valid, which is what makes "Thursday 8 and 9" ONE reminder
 * with two rings instead of two reminders — the thing the old single `time`
 * string could not say.
 *
 * Both sides read this module: the Convex parse (convex/actions.ts) builds a
 * grid out of the model's answer, and the client engine (lib/schedule.ts) walks
 * it for the next ring. So it stays pure — the only import is convex/helpers.ts,
 * which is itself import-free — and it must never reach for convex/values,
 * React Native, or a clock it was not handed.
 */

import { normalizeDay } from "./helpers";

export type Weekday = "sun" | "mon" | "tue" | "wed" | "thu" | "fri" | "sat";

/** Index-aligned with Date#getDay(). */
export const WEEKDAY_ORDER: Weekday[] = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

/** Which days the reminder lands on — the grid's first axis. */
export type DaysRule =
  | { kind: "everyday" }
  | { kind: "weekdays"; days: Weekday[] }
  | { kind: "everyNDays"; interval: number; startDate: string } // startDate: YYYY-MM-DD anchor
  | { kind: "date"; date: string }; // YYYY-MM-DD, one specific day

/** What time of those days it rings — the grid's second axis. */
export type TimesRule =
  | { kind: "clock"; times: string[] } // ["08:00", "21:00"] — sorted, deduped, at least one
  | { kind: "interval"; everyMinutes: number; windowStart: string; windowEnd: string };

export interface GridSchedule {
  type: "grid";
  days: DaysRule;
  times: TimesRule;
  /** End of a bounded recurrence, ms. Occurrences past it do not exist. */
  until?: number;
  tzid?: string;
}

// Interval reminders used to ring around the clock — "every 2 hours" woke people
// at 3am. An interval now lives inside a waking window, and an unspoken window
// is this one (decision 5).
export const DEFAULT_WINDOW_START = "08:00";
export const DEFAULT_WINDOW_END = "22:00";

/** Same floor the old interval schedule had, expressed in minutes. */
export const MIN_INTERVAL_MINUTES = 5;
/** A windowed interval fires inside one day, so a day is its ceiling. */
export const MAX_INTERVAL_MINUTES = 24 * 60;

/** A mis-parse, not a user: nobody asks for thirteen clock times. */
export const MAX_TIMES_PER_DAY = 12;

/** Fallback when neither the parse nor the caller had any time at all. */
export const DEFAULT_CLOCK_TIME = "09:00";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

// ─── Small pure formatters/parsers ──────────────────────────────────────────

/** "8" / "8:5" / "0800" / "08:00" → "08:00". Null when it is not a clock time. */
export function normalizeClockTime(value: unknown): string | null {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  const match = raw.match(/^(\d{1,2})[:.]?(\d{2})?$/);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = match[2] === undefined ? 0 : Number(match[2]);
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

/** Minutes past local midnight for an "HH:MM" string. */
export function minutesOfDay(time: string): number {
  const normalized = normalizeClockTime(time);
  if (!normalized) return 0;
  const [hours, minutes] = normalized.split(":").map(Number);
  return hours * 60 + minutes;
}

/**
 * The clock times of a schedule: normalized, deduped, chronological, capped.
 * `fallback` is consulted only when the list yielded nothing — the old single
 * `time` field is what callers pass there.
 */
export function normalizeClockTimes(value: unknown, fallback?: unknown): string[] {
  const raw = Array.isArray(value) ? value : value === undefined || value === null ? [] : [value];
  const seen = new Set<string>();
  for (const entry of raw) {
    const time = normalizeClockTime(entry);
    if (time) seen.add(time);
  }
  if (seen.size === 0) {
    const only = normalizeClockTime(fallback);
    if (only) seen.add(only);
  }
  // "HH:MM" sorts lexicographically in clock order.
  return [...seen].sort().slice(0, MAX_TIMES_PER_DAY);
}

export function normalizeWeekdays(value: unknown): Weekday[] {
  const raw = Array.isArray(value) ? value : [];
  const seen = new Set<Weekday>();
  for (const entry of raw) {
    const day = normalizeDay(entry);
    if (day) seen.add(day as Weekday);
  }
  // Calendar order, not the order the model happened to list them in.
  return WEEKDAY_ORDER.filter((day) => seen.has(day));
}

/** "YYYY-MM-DD" or null. Real calendar days only — "2026-02-31" is rejected. */
export function normalizeDateString(value: unknown): string | null {
  const raw = String(value ?? "").trim();
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
    return null;
  }
  return `${match[1]}-${match[2]}-${match[3]}`;
}

/** Local midnight of the day a timestamp falls in. */
export function startOfLocalDay(ms: number): Date {
  const date = new Date(ms);
  date.setHours(0, 0, 0, 0);
  return date;
}

/** "YYYY-MM-DD" of a local date. */
export function toDateString(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
    date.getDate()
  ).padStart(2, "0")}`;
}

/** Local midnight of a "YYYY-MM-DD" string, or null. */
export function fromDateString(value: unknown): Date | null {
  const normalized = normalizeDateString(value);
  if (!normalized) return null;
  const [year, month, day] = normalized.split("-").map(Number);
  return new Date(year, month - 1, day, 0, 0, 0, 0);
}

function addLocalDays(day: Date, count: number): Date {
  const next = new Date(day);
  next.setDate(next.getDate() + count);
  next.setHours(0, 0, 0, 0);
  return next;
}

/** Whole days between two local midnights (rounded, so DST shifts don't drift). */
function daysBetween(a: Date, b: Date): number {
  return Math.round((a.getTime() - b.getTime()) / MS_PER_DAY);
}

/** `minutes` past the local midnight of `day`, DST included. */
function atLocalMinutes(day: Date, minutes: number): number {
  const stamp = new Date(day);
  stamp.setHours(0, minutes, 0, 0);
  return stamp.getTime();
}

// ─── Walking the grid ───────────────────────────────────────────────────────

/** Does this local day fall on the days axis? */
export function matchesGridDay(days: DaysRule, day: Date): boolean {
  const local = startOfLocalDay(day.getTime());
  switch (days.kind) {
    case "everyday":
      return true;
    case "weekdays":
      return days.days.includes(WEEKDAY_ORDER[local.getDay()]);
    case "everyNDays": {
      const start = fromDateString(days.startDate);
      if (!start) return true; // anchor lost → behave as every day rather than never
      const elapsed = daysBetween(local, start);
      return elapsed >= 0 && elapsed % Math.max(1, Math.round(days.interval)) === 0;
    }
    case "date": {
      const target = fromDateString(days.date);
      return target !== null && daysBetween(local, target) === 0;
    }
  }
}

/**
 * Every ring the grid produces on the local day containing `dayMs`, in order.
 * Empty when the day is not on the days axis or is past `until`.
 *
 * This is the expansion the execution layer needs: one reminder, N triggers per
 * day (OLD-98).
 */
export function gridDayOccurrences(schedule: GridSchedule, dayMs: number): number[] {
  const day = startOfLocalDay(dayMs);
  if (!matchesGridDay(schedule.days, day)) return [];

  const stamps: number[] = [];
  if (schedule.times.kind === "clock") {
    for (const time of schedule.times.times) {
      stamps.push(atLocalMinutes(day, minutesOfDay(time)));
    }
  } else {
    const { everyMinutes, windowStart, windowEnd } = schedule.times;
    const step = Math.max(MIN_INTERVAL_MINUTES, Math.round(everyMinutes));
    const endMinute = minutesOfDay(windowEnd);
    for (let minute = minutesOfDay(windowStart); minute <= endMinute; minute += step) {
      stamps.push(atLocalMinutes(day, minute));
    }
  }

  stamps.sort((a, b) => a - b);
  return schedule.until === undefined
    ? stamps
    : stamps.filter((stamp) => stamp <= schedule.until!);
}

/** How far ahead the day scan has to look before it can give up. */
function horizonDays(days: DaysRule): number {
  switch (days.kind) {
    case "everyday":
      return 2;
    case "weekdays":
      return 8;
    case "everyNDays":
      return Math.min(400, Math.max(1, Math.round(days.interval)) + 1);
    case "date":
      return 1;
  }
}

/**
 * The next ring strictly after `referenceTime`, or null when the schedule has
 * none left (a passed one-off, an expired `until`).
 */
export function nextGridOccurrence(
  schedule: GridSchedule,
  referenceTime: number = Date.now()
): number | null {
  // A dated one-off can sit months out, so it is jumped to rather than scanned to.
  let day = startOfLocalDay(referenceTime);
  if (schedule.days.kind === "date") {
    const target = fromDateString(schedule.days.date);
    if (!target) return null;
    if (target.getTime() > day.getTime()) day = target;
  } else if (schedule.days.kind === "everyNDays") {
    const start = fromDateString(schedule.days.startDate);
    if (start && start.getTime() > day.getTime()) day = start;
  }

  const horizon = horizonDays(schedule.days);
  for (let offset = 0; offset <= horizon; offset++) {
    for (const stamp of gridDayOccurrences(schedule, day.getTime())) {
      if (stamp > referenceTime) return stamp;
    }
    day = addLocalDays(day, 1);
  }
  return null;
}

/** Interval mode is the premium half of the times axis (decision 6). */
export function isIntervalGrid(schedule: GridSchedule | undefined | null): boolean {
  return schedule?.times.kind === "interval";
}

/** Human-readable "Mon, Thu · 08:00, 21:00" for cards and the edit sheet. */
export function describeGrid(schedule: GridSchedule): string {
  const days = schedule.days;
  let daysText: string;
  if (days.kind === "everyday") {
    daysText = "Every day";
  } else if (days.kind === "weekdays") {
    const labels: Record<Weekday, string> = {
      sun: "Sun", mon: "Mon", tue: "Tue", wed: "Wed", thu: "Thu", fri: "Fri", sat: "Sat",
    };
    daysText = days.days.length > 0 ? days.days.map((d) => labels[d]).join(", ") : "Every day";
  } else if (days.kind === "everyNDays") {
    const n = Math.max(1, Math.round(days.interval));
    daysText = n === 1 ? "Every day" : `Every ${n} days`;
  } else {
    daysText = days.date;
  }

  const times = schedule.times;
  const timesText =
    times.kind === "clock"
      ? times.times.join(", ")
      : `Every ${formatMinutes(times.everyMinutes)}, ${times.windowStart}–${times.windowEnd}`;

  return `${daysText} · ${timesText}`;
}

function formatMinutes(everyMinutes: number): string {
  const minutes = Math.max(1, Math.round(everyMinutes));
  if (minutes % 60 === 0) {
    const hours = minutes / 60;
    return `${hours} hr`;
  }
  return `${minutes} min`;
}

// ─── Building a grid ────────────────────────────────────────────────────────

/**
 * The loose, field-per-field shape both producers hand in: the parse model's
 * JSON (convex/actions.ts) and a legacy stored reminder (lib/store.ts). Every
 * field is `unknown` because neither producer is trusted.
 */
export type GridInput = {
  frequency?: unknown;
  time?: unknown;
  times?: unknown;
  date?: unknown;
  days?: unknown;
  everyNDays?: unknown;
  intervalHours?: unknown;
  intervalMinutes?: unknown;
  intervalMs?: unknown;
  windowStart?: unknown;
  windowEnd?: unknown;
  until?: unknown;
};

export type GridContext = {
  /** Time to use when the input carried none. */
  fallbackTime?: string;
  /** "Now" for deriving a one-off's date and an every-N-days anchor. */
  now?: number;
  tzid?: string;
  /** Appended to, so the caller keeps its own parseWarnings list. */
  warnings?: string[];
};

function normalizeFrequency(value: unknown): string {
  const token = String(value ?? "").toLowerCase().trim();
  if (token === "weekly") return "custom";
  if (token === "everyndays" || token === "every_n_days") return "everyNDays";
  return token;
}

function normalizeEveryNDays(value: unknown): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.round(n));
}

/** Minutes for an interval, from whichever of the three fields the caller has. */
function resolveIntervalMinutes(input: GridInput, warnings: string[]): number {
  const fromMs = Number(input.intervalMs);
  const hours = Number(input.intervalHours ?? 0);
  const minutes = Number(input.intervalMinutes ?? 0);
  const raw = Number.isFinite(fromMs) && fromMs > 0
    ? fromMs / 60000
    : (Number.isFinite(hours) ? hours : 0) * 60 + (Number.isFinite(minutes) ? minutes : 0);

  const rounded = Math.round(raw);
  if (rounded < MIN_INTERVAL_MINUTES) {
    warnings.push(`Minimum interval is ${MIN_INTERVAL_MINUTES} minutes. Adjusted from ${rounded} minutes.`);
    return MIN_INTERVAL_MINUTES;
  }
  if (rounded > MAX_INTERVAL_MINUTES) {
    warnings.push(`An interval reminder rings inside one day. Adjusted to ${MAX_INTERVAL_MINUTES} minutes.`);
    return MAX_INTERVAL_MINUTES;
  }
  return rounded;
}

function resolveWindow(input: GridInput, warnings: string[]): { windowStart: string; windowEnd: string } {
  const start = normalizeClockTime(input.windowStart) ?? DEFAULT_WINDOW_START;
  const end = normalizeClockTime(input.windowEnd) ?? DEFAULT_WINDOW_END;
  if (minutesOfDay(end) <= minutesOfDay(start)) {
    warnings.push(
      `Interval window ${start}–${end} does not span a day. Using ${DEFAULT_WINDOW_START}–${DEFAULT_WINDOW_END}.`
    );
    return { windowStart: DEFAULT_WINDOW_START, windowEnd: DEFAULT_WINDOW_END };
  }
  return { windowStart: start, windowEnd: end };
}

/** ms of an ISO date / "YYYY-MM-DD" / already-a-number `until`, or undefined. */
function resolveUntil(value: unknown, warnings: string[]): number | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value === "number") return Number.isFinite(value) ? value : undefined;
  const dateOnly = fromDateString(value);
  if (dateOnly) {
    // A bare date bounds the whole of that day, not its midnight.
    dateOnly.setHours(23, 59, 59, 999);
    return dateOnly.getTime();
  }
  const ms = new Date(String(value)).getTime();
  if (Number.isFinite(ms)) return ms;
  warnings.push(`Invalid until date "${String(value)}" ignored.`);
  return undefined;
}

/**
 * A grid out of whatever the producer had. Never throws and never returns an
 * empty times axis — a schedule that cannot say when it rings is not a schedule.
 */
export function buildGridSchedule(input: GridInput, context: GridContext = {}): GridSchedule {
  const warnings = context.warnings ?? [];
  const now = context.now ?? Date.now();
  const frequency = normalizeFrequency(input.frequency);
  const weekdays = normalizeWeekdays(input.days);
  const everyN = normalizeEveryNDays(input.everyNDays);

  const times = normalizeClockTimes(input.times, input.time);
  const clockTimes = times.length > 0
    ? times
    : [normalizeClockTime(context.fallbackTime) ?? DEFAULT_CLOCK_TIME];

  // Times axis first: interval mode ignores the clock list entirely.
  const timesRule: TimesRule =
    frequency === "interval"
      ? { kind: "interval", everyMinutes: resolveIntervalMinutes(input, warnings), ...resolveWindow(input, warnings) }
      : { kind: "clock", times: clockTimes };

  // Days axis. A one-off wins outright; otherwise named weekdays beat an
  // every-N-days count, and a schedule that says neither is every day.
  let daysRule: DaysRule;
  if (frequency === "once" && timesRule.kind === "clock") {
    daysRule = { kind: "date", date: normalizeDateString(input.date) ?? firstDateFor(clockTimes, now) };
  } else if (weekdays.length > 0) {
    daysRule = { kind: "weekdays", days: weekdays };
  } else if (everyN > 1) {
    daysRule = {
      kind: "everyNDays",
      interval: everyN,
      startDate: normalizeDateString(input.date) ?? toDateString(startOfLocalDay(now)),
    };
  } else {
    daysRule = { kind: "everyday" };
  }

  const until = resolveUntil(input.until, warnings);

  const schedule: GridSchedule = { type: "grid", days: daysRule, times: timesRule };
  if (until !== undefined) schedule.until = until;
  if (context.tzid) schedule.tzid = context.tzid;
  return schedule;
}

/** Today when the earliest time is still ahead, tomorrow when it is not. */
function firstDateFor(clockTimes: string[], now: number): string {
  const day = startOfLocalDay(now);
  const earliest = Math.min(...clockTimes.map((time) => atLocalMinutes(day, minutesOfDay(time))));
  return toDateString(earliest > now ? day : addLocalDays(day, 1));
}

/**
 * The grid a pre-OLD-97 reminder describes. Everything stored before the grid
 * existed said its schedule through `frequency` + a single `time` (+ `days`,
 * `intervalMs`, `intervalDays`), so this is what the store migration and any
 * un-migrated row run through.
 */
export function gridFromLegacyReminder(reminder: {
  frequency?: unknown;
  time?: unknown;
  date?: unknown;
  days?: unknown;
  intervalMs?: unknown;
  intervalDays?: unknown;
  scheduledFor?: unknown;
  until?: unknown;
  tzid?: unknown;
}): GridSchedule {
  const scheduledFor = Number(reminder.scheduledFor);
  const hasScheduledFor = Number.isFinite(scheduledFor) && scheduledFor > 0;
  return buildGridSchedule(
    {
      frequency: reminder.frequency,
      time: reminder.time,
      // A stored one-off already knows its day, through `date` or `scheduledFor`.
      date:
        normalizeDateString(reminder.date) ??
        (hasScheduledFor ? toDateString(startOfLocalDay(scheduledFor)) : undefined),
      days: reminder.days,
      everyNDays: reminder.intervalDays,
      intervalMs: reminder.intervalMs,
      until: reminder.until,
    },
    {
      fallbackTime: typeof reminder.time === "string" ? reminder.time : undefined,
      tzid: typeof reminder.tzid === "string" ? reminder.tzid : undefined,
    }
  );
}

/**
 * The legacy fields a grid implies, so the pre-grid readers (cards, the old
 * notification path, Convex's `time`/`frequency`/`days` columns) keep working
 * while the execution layer moves over. `time` is the FIRST ring of the day —
 * a multi-time reminder's later rings exist only inside the grid.
 */
export function legacyFieldsFromGrid(schedule: GridSchedule): {
  time: string;
  date?: string;
  frequency: string;
  days: string[];
  intervalMs?: number;
  intervalDays?: number;
} {
  const time =
    schedule.times.kind === "clock"
      ? schedule.times.times[0] ?? DEFAULT_CLOCK_TIME
      : schedule.times.windowStart;

  const intervalMs =
    schedule.times.kind === "interval" ? schedule.times.everyMinutes * 60000 : undefined;

  if (schedule.times.kind === "interval") {
    return { time, frequency: "interval", days: [], intervalMs };
  }
  switch (schedule.days.kind) {
    case "date":
      return { time, date: schedule.days.date, frequency: "once", days: [] };
    case "weekdays":
      return { time, frequency: "custom", days: [...schedule.days.days] };
    case "everyNDays":
      return { time, frequency: "daily", days: [], intervalDays: Math.max(1, Math.round(schedule.days.interval)) };
    case "everyday":
      return { time, frequency: "daily", days: [] };
  }
}
