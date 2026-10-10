/**
 * The edit sheet's schedule draft (OLD-99).
 *
 * The sheet edits the days × times grid (convex/scheduleShape.ts), but a form
 * cannot hold a discriminated union: the user flips to "every N days", types a
 * number, flips back to "weekly" and expects the weekdays they had picked to
 * still be there. So the sheet keeps every axis' value at once — that is the
 * draft — and this module is the only place that turns one into a grid and back.
 *
 * Pure on purpose: no React, no react-native, no store. The sheet renders it,
 * __tests__/components/scheduleDraft.test.ts checks it.
 */

import {
  DEFAULT_WINDOW_START,
  DEFAULT_WINDOW_END,
  MAX_INTERVAL_MINUTES,
  MAX_TIMES_PER_DAY,
  MIN_INTERVAL_MINUTES,
  gridFromLegacyReminder,
  legacyFieldsFromGrid,
  migrateLegacySchedule,
  minutesOfDay,
  normalizeClockTime,
  normalizeClockTimes,
  normalizeWeekdays,
  type DaysRule,
  type GridSchedule,
  type TimesRule,
  type Weekday,
} from '../../lib/schedule';
import { formatClockTime, usesHour12Format, type ClockFormatOptions } from '../../lib/time';
import { intlLocale, t } from '../../lib/i18n';
import { weekdayShortLabel } from '../../lib/weekdayLabels';

export type DaysMode = 'everyday' | 'weekdays' | 'everyNDays' | 'date';
export type TimesMode = 'clock' | 'interval';

/** Every axis at once, so switching modes never drops what the other axis held. */
export interface ScheduleDraft {
  daysMode: DaysMode;
  /** Weekly axis. Lowercase "mon".."sun", the keys DaySelector speaks. */
  weekdays: string[];
  /** Every-N-days axis. 1 collapses to "every day". */
  everyNDays: number;
  /** YYYY-MM-DD — the one-off's day, and the every-N-days anchor. */
  date: string | null;
  timesMode: TimesMode;
  /** Clock axis. Always at least one entry once normalized. */
  times: string[];
  /** Interval axis. */
  everyMinutes: number;
  windowStart: string;
  windowEnd: string;
  /** Bounded recurrence from the parse. Carried through, never edited here. */
  until?: number;
}

/** An every-N-days of 1 is just "every day", so the stepper starts at 2. */
export const EVERY_N_DAYS_MIN = 2;
export const EVERY_N_DAYS_MAX = 30;

/** What "+ Add time" is worth before the list hits MAX_TIMES_PER_DAY. */
export const DEFAULT_ADDED_TIME = '12:00';
export const DEFAULT_EVERY_MINUTES = 60;

/** The interval stepper walks this list instead of asking for a number. */
export const INTERVAL_PRESET_MINUTES = [
  5, 10, 15, 20, 30, 45, 60, 90, 120, 180, 240, 360, 480, 720, MAX_INTERVAL_MINUTES,
];

export { MAX_TIMES_PER_DAY };

type ReminderLike = {
  schedule?: GridSchedule;
  frequency?: string;
  time?: string;
  date?: string;
  days?: string[];
  intervalMs?: number;
  intervalDays?: number;
  scheduledFor?: number;
  until?: number;
  tzid?: string;
};

/** YYYY-MM-DD of a local date — the grid's date format. */
export function toDateString(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
    date.getDate()
  ).padStart(2, '0')}`;
}

/** Local midnight of a YYYY-MM-DD string, or null when it is not one. */
export function fromDateString(value: string | null | undefined): Date | null {
  const match = String(value ?? '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const date = new Date(year, month - 1, day, 0, 0, 0, 0);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
    return null;
  }
  return date;
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, Math.round(value)));
}

// ─── Grid → draft ───────────────────────────────────────────────────────────

/**
 * The draft a grid describes. The axes it does not use keep sensible defaults
 * so every mode chip is immediately usable after one tap.
 */
export function draftFromGrid(schedule: GridSchedule, now: number = Date.now()): ScheduleDraft {
  const today = toDateString(new Date(now));

  const draft: ScheduleDraft = {
    daysMode: 'everyday',
    weekdays: [],
    everyNDays: EVERY_N_DAYS_MIN,
    date: null,
    timesMode: 'clock',
    times: ['09:00'],
    everyMinutes: DEFAULT_EVERY_MINUTES,
    windowStart: DEFAULT_WINDOW_START,
    windowEnd: DEFAULT_WINDOW_END,
    until: schedule.until,
  };

  switch (schedule.days.kind) {
    case 'weekdays':
      draft.daysMode = 'weekdays';
      draft.weekdays = [...schedule.days.days];
      break;
    case 'everyNDays':
      draft.daysMode = 'everyNDays';
      draft.everyNDays = clamp(schedule.days.interval, EVERY_N_DAYS_MIN, EVERY_N_DAYS_MAX);
      draft.date = schedule.days.startDate;
      break;
    case 'date':
      draft.daysMode = 'date';
      draft.date = schedule.days.date;
      break;
    case 'everyday':
      break;
  }
  if (!draft.date) draft.date = today;

  if (schedule.times.kind === 'interval') {
    draft.timesMode = 'interval';
    draft.everyMinutes = clamp(schedule.times.everyMinutes, MIN_INTERVAL_MINUTES, MAX_INTERVAL_MINUTES);
    draft.windowStart = normalizeClockTime(schedule.times.windowStart) ?? DEFAULT_WINDOW_START;
    draft.windowEnd = normalizeClockTime(schedule.times.windowEnd) ?? DEFAULT_WINDOW_END;
  } else if (schedule.times.times.length > 0) {
    draft.times = [...schedule.times.times];
  }

  return draft;
}

/** The draft for a stored reminder — its grid, or the one its legacy fields imply. */
export function draftFromReminder(reminder: ReminderLike, now: number = Date.now()): ScheduleDraft {
  return draftFromGrid(reminder.schedule ?? gridFromLegacyReminder(reminder), now);
}

// ─── Draft → grid ───────────────────────────────────────────────────────────

/** Today when the earliest ring is still ahead, tomorrow when it is not. */
function firstDateFor(times: string[], now: number): string {
  const day = new Date(now);
  day.setHours(0, 0, 0, 0);
  const earliest = Math.min(
    ...times.map((time) => {
      const stamp = new Date(day);
      stamp.setHours(0, minutesOfDay(time), 0, 0);
      return stamp.getTime();
    })
  );
  if (earliest > now) return toDateString(day);
  day.setDate(day.getDate() + 1);
  return toDateString(day);
}

/**
 * The grid a draft means. Built axis by axis rather than through
 * buildGridSchedule's field guesser: the sheet already knows which mode it is
 * in, so nothing here has to be inferred — and a dated interval ("that Friday,
 * every two hours") survives, which the guesser's once-implies-clock branch
 * cannot express.
 */
export function gridFromDraft(
  draft: ScheduleDraft,
  context: { now?: number; tzid?: string } = {}
): GridSchedule {
  const now = context.now ?? Date.now();

  const clockTimes = normalizeClockTimes(draft.times);
  const times = clockTimes.length > 0 ? clockTimes : ['09:00'];

  let timesRule: TimesRule;
  if (draft.timesMode === 'interval') {
    const everyMinutes = clamp(draft.everyMinutes, MIN_INTERVAL_MINUTES, MAX_INTERVAL_MINUTES);
    const windowStart = normalizeClockTime(draft.windowStart) ?? DEFAULT_WINDOW_START;
    const windowEnd = normalizeClockTime(draft.windowEnd) ?? DEFAULT_WINDOW_END;
    // A window that does not span forward would ring once or never; the default
    // waking window is the only safe reading of it.
    timesRule =
      minutesOfDay(windowEnd) > minutesOfDay(windowStart)
        ? { kind: 'interval', everyMinutes, windowStart, windowEnd }
        : {
            kind: 'interval',
            everyMinutes,
            windowStart: DEFAULT_WINDOW_START,
            windowEnd: DEFAULT_WINDOW_END,
          };
  } else {
    timesRule = { kind: 'clock', times };
  }

  let daysRule: DaysRule;
  switch (draft.daysMode) {
    case 'weekdays': {
      const weekdays = normalizeWeekdays(draft.weekdays) as Weekday[];
      // No day picked is not "never" — it is the same thing as every day.
      daysRule = weekdays.length > 0 ? { kind: 'weekdays', days: weekdays } : { kind: 'everyday' };
      break;
    }
    case 'everyNDays': {
      const interval = clamp(draft.everyNDays, 1, EVERY_N_DAYS_MAX);
      daysRule =
        interval > 1
          ? {
              kind: 'everyNDays',
              interval,
              startDate: draft.date ?? toDateString(new Date(now)),
            }
          : { kind: 'everyday' };
      break;
    }
    case 'date':
      daysRule = { kind: 'date', date: draft.date ?? firstDateFor(times, now) };
      break;
    default:
      daysRule = { kind: 'everyday' };
  }

  const schedule: GridSchedule = { type: 'grid', days: daysRule, times: timesRule };
  if (draft.until !== undefined) schedule.until = draft.until;
  if (context.tzid) schedule.tzid = context.tzid;
  return schedule;
}

/**
 * Everything a save has to write: the grid plus the legacy columns that are its
 * projection. Kept together in one place so `time`/`frequency`/`days` can never
 * be written without the grid they came from (OLD-97 invariant 1).
 *
 * `scheduleType` stays on the pre-grid vocabulary (once|interval|rrule) — the
 * execution layer still reads it, and it flips to "grid" when OLD-98 lands.
 */
export interface ScheduleSaveShape {
  schedule: GridSchedule;
  time: string;
  date?: string;
  frequency: string;
  days: string[];
  intervalMs?: number;
  anchorAt?: number;
  intervalDays?: number;
  scheduleType: 'once' | 'interval' | 'rrule';
  onceAt?: number;
  rrule?: string;
  dtstart?: number;
  tzid: string;
  until?: number;
}

export function saveShapeFromDraft(
  draft: ScheduleDraft,
  context: { now?: number; tzid?: string } = {}
): ScheduleSaveShape {
  const now = context.now ?? Date.now();
  const tzid = context.tzid ?? Intl.DateTimeFormat().resolvedOptions().timeZone;

  const schedule = gridFromDraft(draft, { now, tzid });
  const legacy = legacyFieldsFromGrid(schedule);

  // The legacy interval path walks forward from an anchor, so anchor it to the
  // window's opening — otherwise "every 2 hours, 9 to 5" drifts off its window
  // the moment it is saved at 09:37.
  const anchorAt =
    schedule.times.kind === 'interval'
      ? (() => {
          const day = new Date(now);
          day.setHours(0, minutesOfDay(schedule.times.windowStart), 0, 0);
          return day.getTime();
        })()
      : undefined;

  const canonical = migrateLegacySchedule({
    frequency: legacy.frequency,
    time: legacy.time,
    date: legacy.date,
    days: legacy.days,
    intervalMs: legacy.intervalMs,
    anchorAt,
  });

  return {
    schedule,
    time: legacy.time,
    date: legacy.date,
    frequency: legacy.frequency,
    days: legacy.days,
    intervalMs: legacy.intervalMs,
    anchorAt,
    intervalDays: legacy.intervalDays,
    scheduleType: canonical.type as 'once' | 'interval' | 'rrule',
    onceAt: canonical.type === 'once' ? canonical.onceAt : undefined,
    rrule: canonical.type === 'rrule' ? canonical.rrule : undefined,
    dtstart: canonical.type === 'rrule' ? canonical.dtstart : undefined,
    tzid,
    until: schedule.until,
  };
}

// ─── Labels ─────────────────────────────────────────────────────────────────

const dayList = (days: string[]) => days.map(weekdayShortLabel).join(', ');

// Clock times are printed by lib/time's formatClockTime — one formatter for
// every surface, so the card, the row and the picker never disagree about
// whether a time needs an am/pm (OLD-105).

/** "45 min", "2 hr", "1 hr 30 min". */
export function formatEveryMinutes(everyMinutes: number): string {
  const total = clamp(everyMinutes, MIN_INTERVAL_MINUTES, MAX_INTERVAL_MINUTES);
  const hours = Math.floor(total / 60);
  const minutes = total % 60;
  if (hours === 0) return t('duration.minutes', { count: minutes });
  if (minutes === 0) return t('duration.hours', { count: hours });
  return t('duration.hoursMinutes', { hours, minutes });
}

/** Days-axis row value: "Every day", "Mon, Wed, Fri", "Every 3 days", "Aug 20". */
export function describeDraftDays(draft: ScheduleDraft): string {
  switch (draft.daysMode) {
    case 'weekdays': {
      const picked = normalizeWeekdays(draft.weekdays);
      return picked.length > 0 ? dayList(picked) : t('schedule.pickDays');
    }
    case 'everyNDays':
      return t('schedule.everyNDays', { count: clamp(draft.everyNDays, 1, EVERY_N_DAYS_MAX) });
    case 'date': {
      const date = fromDateString(draft.date);
      return date
        ? date.toLocaleDateString(intlLocale(), { month: 'short', day: 'numeric' })
        : t('schedule.pickDate');
    }
    default:
      return t('schedule.everyDay');
  }
}

/** Times-axis row value: "8:00 am, 9:00 pm", "8:00 am +2", "Every 2 hr". */
export function describeDraftTimes(draft: ScheduleDraft, options: ClockFormatOptions = {}): string {
  if (draft.timesMode === 'interval') {
    return t('schedule.everyDuration', { duration: formatEveryMinutes(draft.everyMinutes) });
  }
  const times = normalizeClockTimes(draft.times);
  if (times.length === 0) return t('schedule.pickTime');
  if (times.length <= 2) return times.map((time) => formatClockTime(time, options)).join(', ');
  return t('schedule.moreTimes', { first: formatClockTime(times[0], options), count: times.length - 1 });
}

/** Interval window row value: "8:00 am – 10:00 pm". */
export function describeDraftWindow(draft: ScheduleDraft, options: ClockFormatOptions = {}): string {
  return t('schedule.window', {
    start: formatClockTime(draft.windowStart, options),
    end: formatClockTime(draft.windowEnd, options),
  });
}

/**
 * Card subtitle for a grid: "8:00 am, 9:00 pm · Mon, Thu",
 * "Every 2 hr · 8:00 am–10:00 pm" — 24-hour where the device is.
 */
export function describeGridSubtitle(
  schedule: GridSchedule,
  options: ClockFormatOptions = {}
): string {
  const parts = describeGridParts(schedule, options);
  if (parts.interval) return parts.interval;
  return parts.days ? t('schedule.timesAndDays', { times: parts.times, days: parts.days }) : parts.times;
}

/**
 * The pieces of a grid's subtitle, unjoined, for callers that lay them out
 * their own way (lib/remindersMembership's pattern line). `interval` is set,
 * whole, for an interval grid; otherwise `times` plus `days` (null for a date,
 * which has no days part). `weekdays` is true when `days` is a list of days.
 */
export function describeGridParts(
  schedule: GridSchedule,
  options: ClockFormatOptions = {}
): { interval: string | null; times: string; days: string | null; weekdays: boolean } {
  const times = schedule.times;
  const clock = (time: string) => formatClockTime(time, options);
  if (times.kind === 'interval') {
    return {
      interval: t('schedule.intervalSubtitle', {
        duration: formatEveryMinutes(times.everyMinutes),
        start: clock(times.windowStart),
        end: clock(times.windowEnd),
      }),
      times: '',
      days: null,
      weekdays: false,
    };
  }

  // "8:00 am" is four characters wider than "08:00", so the 12-hour card lists
  // one fewer time before collapsing to "+N" — the subtitle is a single line.
  const inline = usesHour12Format(options) ? 2 : 3;
  const shown =
    times.times.length <= inline
      ? times.times.map(clock).join(', ')
      : t('schedule.moreTimes', {
          first: times.times.slice(0, inline - 1).map(clock).join(', '),
          count: times.times.length - inline + 1,
        });
  const result = (days: string | null, weekdays = false) => ({
    interval: null,
    times: shown,
    days,
    weekdays,
  });

  switch (schedule.days.kind) {
    case 'weekdays':
      return schedule.days.days.length > 0
        ? result(dayList(schedule.days.days), true)
        : result(t('schedule.daily'));
    case 'everyNDays': {
      const interval = Math.max(1, Math.round(schedule.days.interval));
      return result(interval === 1 ? t('schedule.daily') : t('schedule.everyNDays', { count: interval }));
    }
    case 'date':
      return result(null);
    default:
      return result(t('schedule.daily'));
  }
}
