/**
 * Unified Scheduling Engine
 *
 * Supports four canonical schedule types:
 * - grid: the days × times model everything new is written in (OLD-97)
 * - once: one absolute timestamp
 * - interval: intervalMs + anchorAt (existing)
 * - rrule: RFC5545 RRULE string (covers weekly, monthly, yearly, etc.)
 *
 * `grid` is the one users actually steer (decision 4): days (every day |
 * weekdays | every N days | one date) crossed with times (1..N clock times |
 * an interval inside a window). The other three stay because reminders created
 * before it exist and still have to ring — nothing new produces them.
 *
 * Product Constraints (Step 0):
 * - Minimum interval: 5 minutes (option B for battery sanity)
 * - Maximum interval: 365 days
 * - RRULE handles: weekly patterns, monthly, yearly, nth weekday, bounds
 */

import { RRule, RRuleSet, rrulestr, Options as RRuleOptions } from 'rrule';
import { getNextIntervalOccurrence } from './time';
import {
  buildGridSchedule,
  gridFromLegacyReminder,
  nextGridOccurrence,
  describeGrid,
  type GridSchedule,
} from '../convex/scheduleShape';

// The grid lives in convex/scheduleShape.ts so the parse and the client engine
// share one definition; that module is import-pure, so nothing Convex-shaped
// rides along into the app bundle. Re-exported here because lib/schedule is
// where the rest of the app already looks for scheduling.
export {
  buildGridSchedule,
  gridFromLegacyReminder,
  gridDayOccurrences,
  nextGridOccurrence,
  matchesGridDay,
  isIntervalGrid,
  describeGrid,
  legacyFieldsFromGrid,
  normalizeClockTime,
  normalizeClockTimes,
  normalizeWeekdays,
  minutesOfDay,
  DEFAULT_WINDOW_START,
  DEFAULT_WINDOW_END,
  MIN_INTERVAL_MINUTES,
  MAX_INTERVAL_MINUTES,
  MAX_TIMES_PER_DAY,
} from '../convex/scheduleShape';
export type { GridSchedule, DaysRule, TimesRule, Weekday } from '../convex/scheduleShape';

// Product constraint constants
export const MIN_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
export const MAX_INTERVAL_MS = 365 * 24 * 60 * 60 * 1000; // 365 days
export const DEFAULT_INTERVAL_MS = 15 * 60 * 1000; // 15 minutes fallback

export type ScheduleType = 'once' | 'interval' | 'rrule' | 'grid';

export interface OnceSchedule {
  type: 'once';
  onceAt: number; // absolute timestamp in ms
}

export interface IntervalSchedule {
  type: 'interval';
  intervalMs: number;
  anchorAt: number;
}

export interface RRuleSchedule {
  type: 'rrule';
  rrule: string; // RFC5545 RRULE string
  dtstart?: number; // start date in ms (defaults to now)
  tzid?: string; // timezone identifier
  until?: number; // end date in ms (optional)
}

export type Schedule = OnceSchedule | IntervalSchedule | RRuleSchedule | GridSchedule;

export interface ScheduleWarning {
  code: string;
  message: string;
}

export interface NormalizedSchedule {
  schedule: Schedule;
  warnings: ScheduleWarning[];
  displayText: string; // Human-readable description
}

/**
 * Get the next occurrence timestamp for any schedule type.
 * Returns null if no more occurrences (expired UNTIL/COUNT).
 */
export function getNextOccurrence(
  schedule: Schedule,
  referenceTime: number = Date.now()
): number | null {
  switch (schedule.type) {
    case 'grid':
      return nextGridOccurrence(schedule, referenceTime);

    case 'once':
      return getNextOnceOccurrence(schedule, referenceTime);

    case 'interval':
      return getNextIntervalOccurrenceSafe(schedule, referenceTime);

    case 'rrule':
      return getNextRRuleOccurrence(schedule, referenceTime);

    default:
      console.warn('[Schedule] Unknown schedule type:', (schedule as any).type);
      return null;
  }
}

function getNextOnceOccurrence(schedule: OnceSchedule, referenceTime: number): number | null {
  // Once schedules fire at their scheduled time, or return null if already passed
  // (depending on your "overdue" policy - here we return the time even if past)
  if (schedule.onceAt < referenceTime) {
    // Already passed - return null to indicate no future occurrence
    return null;
  }
  return schedule.onceAt;
}

function getNextIntervalOccurrenceSafe(
  schedule: IntervalSchedule,
  referenceTime: number
): number | null {
  if (!schedule.anchorAt || !schedule.intervalMs) {
    console.warn('[Schedule] Invalid interval schedule');
    return null;
  }

  // Clamp interval to valid range
  const clampedIntervalMs = Math.max(
    MIN_INTERVAL_MS,
    Math.min(MAX_INTERVAL_MS, schedule.intervalMs)
  );

  const { scheduledFor } = getNextIntervalOccurrence(
    schedule.anchorAt,
    clampedIntervalMs,
    referenceTime
  );

  return scheduledFor;
}

function getNextRRuleOccurrence(schedule: RRuleSchedule, referenceTime: number): number | null {
  try {
    const dtstart = schedule.dtstart ? new Date(schedule.dtstart) : new Date();
    const until = schedule.until ? new Date(schedule.until) : undefined;
    
    // Build RRule options — only include defined values (rrulestr chokes on undefined)
    const options: Partial<RRuleOptions> = { dtstart };
    if (until) options.until = until;

    // Parse the RRULE string
    // rrulestr expects a full RRULE line, but we might just have the rule part
    const ruleStr = schedule.rrule.startsWith('RRULE:') 
      ? schedule.rrule 
      : `RRULE:${schedule.rrule}`;
    
    const rule = rrulestr(ruleStr, {
      ...options,
      forceset: false,
    });

    // Get next occurrence after reference time
    const nextDate = rule.after(new Date(referenceTime), false);
    
    if (!nextDate) {
      return null; // No more occurrences
    }

    return nextDate.getTime();
  } catch (e) {
    console.error('[Schedule] RRULE parsing error:', e);
    return null;
  }
}

/**
 * Normalize and validate a schedule, applying constraints and generating warnings.
 */
export function normalizeSchedule(
  raw: Partial<Schedule> & { type: ScheduleType },
  context?: { referenceTime?: number; tzid?: string }
): NormalizedSchedule {
  const warnings: ScheduleWarning[] = [];
  const refTime = context?.referenceTime ?? Date.now();
  const tzid = context?.tzid ?? Intl.DateTimeFormat().resolvedOptions().timeZone;

  switch (raw.type) {
    case 'grid': {
      // The grid arrives already normalized (buildGridSchedule is the only way
      // to make one), so this is a pass-through that fills in the timezone.
      const partial = raw as Partial<GridSchedule>;
      const schedule: GridSchedule = {
        type: 'grid',
        days: partial.days ?? { kind: 'everyday' },
        times: partial.times ?? { kind: 'clock', times: ['09:00'] },
        until: partial.until,
        tzid: partial.tzid ?? tzid,
      };
      return { schedule, warnings, displayText: describeGrid(schedule) };
    }

    case 'once': {
      const onceAt = raw.onceAt ?? refTime + 60 * 60 * 1000; // Default: 1 hour from now
      return {
        schedule: { type: 'once', onceAt },
        warnings,
        displayText: formatOnceDisplay(onceAt),
      };
    }

    case 'interval': {
      let intervalMs = raw.intervalMs ?? DEFAULT_INTERVAL_MS;
      
      // Apply constraints
      if (intervalMs < MIN_INTERVAL_MS) {
        warnings.push({
          code: 'interval_too_small',
          message: `Minimum interval is ${MIN_INTERVAL_MS / 60000} minutes. Adjusted from ${Math.round(intervalMs / 60000)} minutes.`,
        });
        intervalMs = MIN_INTERVAL_MS;
      }
      
      if (intervalMs > MAX_INTERVAL_MS) {
        warnings.push({
          code: 'interval_too_large',
          message: `Maximum interval is ${Math.round(MAX_INTERVAL_MS / 86400000)} days. Adjusted.`,
        });
        intervalMs = MAX_INTERVAL_MS;
      }

      const anchorAt = raw.anchorAt ?? refTime;

      return {
        schedule: { type: 'interval', intervalMs, anchorAt },
        warnings,
        displayText: formatIntervalDisplay(intervalMs),
      };
    }

    case 'rrule': {
      const rrule = raw.rrule ?? 'FREQ=DAILY';
      const dtstart = raw.dtstart ?? refTime;
      
      return {
        schedule: { type: 'rrule', rrule, dtstart, tzid, until: raw.until },
        warnings,
        displayText: formatRRuleDisplay(rrule, dtstart),
      };
    }

    default:
      // Fallback to once
      warnings.push({
        code: 'unknown_type',
        message: `Unknown schedule type "${(raw as any).type}", defaulting to once.`,
      });
      return {
        schedule: { type: 'once', onceAt: refTime + 60 * 60 * 1000 },
        warnings,
        displayText: 'Once (fallback)',
      };
  }
}

/**
 * Convert legacy reminder format to new Schedule format.
 */
export function migrateLegacySchedule(reminder: {
  frequency: string;
  time: string;
  date?: string;
  days?: string[];
  intervalMs?: number;
  anchorAt?: number;
  scheduledFor?: number;
}): Schedule {
  const { frequency, time, date, days, intervalMs, anchorAt, scheduledFor } = reminder;

  // Interval reminders
  if (frequency === 'interval' && intervalMs && anchorAt) {
    return { type: 'interval', intervalMs, anchorAt };
  }

  // One-time with specific date
  if (frequency === 'once' && date && time) {
    const [year, month, day] = date.split('-').map(Number);
    const [hours, minutes] = time.split(':').map(Number);
    const onceAt = new Date(year, month - 1, day, hours, minutes).getTime();
    return { type: 'once', onceAt };
  }

  // One-time without date (or with scheduledFor)
  if (frequency === 'once') {
    if (scheduledFor) {
      return { type: 'once', onceAt: scheduledFor };
    }
    // Default to today at specified time
    const [hours, minutes] = time.split(':').map(Number);
    const today = new Date();
    today.setHours(hours, minutes, 0, 0);
    return { type: 'once', onceAt: today.getTime() };
  }

  // Weekly patterns -> RRULE
  if ((frequency === 'custom' || frequency === 'weekly') && days?.length) {
    const byday = days.map(d => dayToRRule(d)).join(',');
    const [hours, minutes] = time.split(':').map(Number);
    
    // Create dtstart with the correct time
    const dtstart = new Date();
    dtstart.setHours(hours, minutes, 0, 0);
    
    return {
      type: 'rrule',
      rrule: `FREQ=WEEKLY;BYDAY=${byday};BYHOUR=${hours};BYMINUTE=${minutes}`,
      dtstart: dtstart.getTime(),
    };
  }

  // Daily -> RRULE
  if (frequency === 'daily') {
    const [hours, minutes] = time.split(':').map(Number);
    const dtstart = new Date();
    dtstart.setHours(hours, minutes, 0, 0);
    
    return {
      type: 'rrule',
      rrule: `FREQ=DAILY;BYHOUR=${hours};BYMINUTE=${minutes}`,
      dtstart: dtstart.getTime(),
    };
  }

  // Default fallback
  return { type: 'once', onceAt: scheduledFor ?? Date.now() };
}

// Helper: Convert day abbreviation to RRULE day code
function dayToRRule(day: string): string {
  const map: Record<string, string> = {
    'sun': 'SU', 'mon': 'MO', 'tue': 'TU', 'wed': 'WE',
    'thu': 'TH', 'fri': 'FR', 'sat': 'SA',
    'sunday': 'SU', 'monday': 'MO', 'tuesday': 'TU', 'wednesday': 'WE',
    'thursday': 'TH', 'friday': 'FR', 'saturday': 'SA',
  };
  return map[day.toLowerCase()] ?? 'MO';
}

// Helper: Format display text
function formatOnceDisplay(onceAt: number): string {
  const date = new Date(onceAt);
  return date.toLocaleString([], { 
    weekday: 'short', 
    month: 'short', 
    day: 'numeric', 
    hour: '2-digit', 
    minute: '2-digit' 
  });
}

function formatIntervalDisplay(intervalMs: number): string {
  const minutes = Math.round(intervalMs / 60000);
  if (minutes < 60) return `Every ${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `Every ${hours} hr`;
  const days = Math.round(hours / 24);
  return `Every ${days} day${days !== 1 ? 's' : ''}`;
}

function formatRRuleDisplay(rrule: string, dtstart: number): string {
  try {
    const ruleStr = rrule.startsWith('RRULE:') ? rrule : `RRULE:${rrule}`;
    const rule = rrulestr(ruleStr);
    const freq = rule.options.freq;
    const byday = rule.options.byweekday;
    
    // Weekly with specific days
    if (freq === RRule.WEEKLY && byday && byday.length > 0) {
      const days = byday.map(d => ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'][d] || '??').join(', ');
      return `Weekly on ${days}`;
    }
    
    // Daily
    if (freq === RRule.DAILY) {
      return 'Daily';
    }
    
    // Monthly
    if (freq === RRule.MONTHLY) {
      return 'Monthly';
    }
    
    return 'Recurring';
  } catch {
    return 'Recurring';
  }
}

/**
 * Rule-based fallback parser for common patterns when GPT fails.
 */
export function tryParseScheduleFromText(transcript: string): Schedule | null {
  const lower = transcript.toLowerCase().trim();
  const now = Date.now();
  
  // Pattern: "every N minutes"
  const minutesMatch = lower.match(/every\s+(\d+)\s+(?:minute|minutes|min|mins)/);
  if (minutesMatch) {
    const minutes = parseInt(minutesMatch[1], 10);
    return {
      type: 'interval',
      intervalMs: Math.max(MIN_INTERVAL_MS, minutes * 60 * 1000),
      anchorAt: now,
    };
  }
  
  // Pattern: "every N hours"
  const hoursMatch = lower.match(/every\s+(\d+)\s+(?:hour|hours|hr|hrs)/);
  if (hoursMatch) {
    const hours = parseInt(hoursMatch[1], 10);
    return {
      type: 'interval',
      intervalMs: hours * 60 * 60 * 1000,
      anchorAt: now,
    };
  }
  
  // Pattern: "every (day) at HH:MM"
  const dailyAtMatch = lower.match(/every\s+(?:day|daily)\s+at\s+(\d{1,2}):?(\d{2})?\s*(am|pm)?/);
  if (dailyAtMatch) {
    let hours = parseInt(dailyAtMatch[1], 10);
    const minutes = parseInt(dailyAtMatch[2] || '0', 10);
    const ampm = dailyAtMatch[3];
    if (ampm === 'pm' && hours < 12) hours += 12;
    if (ampm === 'am' && hours === 12) hours = 0;
    
    const dtstart = new Date();
    dtstart.setHours(hours, minutes, 0, 0);
    
    return {
      type: 'rrule',
      rrule: `FREQ=DAILY;BYHOUR=${hours};BYMINUTE=${minutes}`,
      dtstart: dtstart.getTime(),
    };
  }
  
  // Pattern: "every (monday|tuesday|...) at HH:MM"
  const dayAtMatch = lower.match(/every\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday|mon|tue|tues|wed|thu|thur|fri|sat|sun)\s+at\s+(\d{1,2}):?(\d{2})?\s*(am|pm)?/);
  if (dayAtMatch) {
    const dayMap: Record<string, string> = {
      'monday': 'MO', 'mon': 'MO',
      'tuesday': 'TU', 'tue': 'TU', 'tues': 'TU',
      'wednesday': 'WE', 'wed': 'WE',
      'thursday': 'TH', 'thu': 'TH', 'thur': 'TH',
      'friday': 'FR', 'fri': 'FR',
      'saturday': 'SA', 'sat': 'SA',
      'sunday': 'SU', 'sun': 'SU',
    };
    const byday = dayMap[dayAtMatch[1]] || 'MO';
    let hours = parseInt(dayAtMatch[2], 10);
    const minutes = parseInt(dayAtMatch[3] || '0', 10);
    const ampm = dayAtMatch[4];
    if (ampm === 'pm' && hours < 12) hours += 12;
    if (ampm === 'am' && hours === 12) hours = 0;
    
    const dtstart = new Date();
    dtstart.setHours(hours, minutes, 0, 0);
    
    return {
      type: 'rrule',
      rrule: `FREQ=WEEKLY;BYDAY=${byday};BYHOUR=${hours};BYMINUTE=${minutes}`,
      dtstart: dtstart.getTime(),
    };
  }
  
  // Pattern: "weekdays at HH:MM"
  const weekdaysMatch = lower.match(/(?:every\s+)?weekdays?\s+at\s+(\d{1,2}):?(\d{2})?\s*(am|pm)?/);
  if (weekdaysMatch) {
    let hours = parseInt(weekdaysMatch[1], 10);
    const minutes = parseInt(weekdaysMatch[2] || '0', 10);
    const ampm = weekdaysMatch[3];
    if (ampm === 'pm' && hours < 12) hours += 12;
    if (ampm === 'am' && hours === 12) hours = 0;
    
    const dtstart = new Date();
    dtstart.setHours(hours, minutes, 0, 0);
    
    return {
      type: 'rrule',
      rrule: `FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR;BYHOUR=${hours};BYMINUTE=${minutes}`,
      dtstart: dtstart.getTime(),
    };
  }
  
  // Pattern: "in N minutes"
  const inMinutesMatch = lower.match(/in\s+(\d+)\s+(?:minute|minutes|min|mins)/);
  if (inMinutesMatch) {
    const minutes = parseInt(inMinutesMatch[1], 10);
    return {
      type: 'once',
      onceAt: now + minutes * 60 * 1000,
    };
  }
  
  return null;
}
