const DAY_MAP: Record<string, number> = {
  sun: 0,
  mon: 1,
  tue: 2,
  wed: 3,
  thu: 4,
  fri: 5,
  sat: 6,
};

export interface ReminderSchedule {
  time?: string; // "HH:MM" (optional for interval)
  date?: string; // "YYYY-MM-DD" for one-time reminders on specific days
  frequency: string; // "once" | "daily" | "weekly" | "custom" | "interval"
  days?: string[]; // ["mon", "wed", "fri"]

  // Interval recurrence
  intervalMs?: number;
  anchorAt?: number;
  intervalDays?: number;
  scheduledFor?: number;
}

const DAY_KEYS: Array<keyof typeof DAY_MAP> = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

// Simple LRU cache for formatted time/date strings (avoid expensive toLocale* calls)
const FORMAT_CACHE_TIME = new Map<number, string>();
const FORMAT_CACHE_DATE_WEEKDAY = new Map<number, string>();
const FORMAT_CACHE_DATE_SHORT = new Map<number, string>();
const MAX_CACHE_SIZE = 100;

function evictOldest(cache: Map<number, string>): void {
  if (cache.size >= MAX_CACHE_SIZE) {
    const firstKey = cache.keys().next().value;
    if (firstKey !== undefined) {
      cache.delete(firstKey);
    }
  }
}

// Cached locale time formatting (2-digit hour:minute)
function cachedTimeString(date: Date): string {
  // Round to minute boundary for cache key
  const key = Math.floor(date.getTime() / 60000);
  if (FORMAT_CACHE_TIME.has(key)) return FORMAT_CACHE_TIME.get(key)!;

  const result = date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  evictOldest(FORMAT_CACHE_TIME);
  FORMAT_CACHE_TIME.set(key, result);
  return result;
}

// Cached weekday formatting
function cachedWeekdayString(date: Date): string {
  // Round to day boundary for cache key
  const key = Math.floor(date.getTime() / (24 * 60 * 60 * 1000));
  if (FORMAT_CACHE_DATE_WEEKDAY.has(key)) return FORMAT_CACHE_DATE_WEEKDAY.get(key)!;

  const result = date.toLocaleDateString([], { weekday: "long" });
  evictOldest(FORMAT_CACHE_DATE_WEEKDAY);
  FORMAT_CACHE_DATE_WEEKDAY.set(key, result);
  return result;
}

// Cached short date formatting (month + day)
function cachedShortDateString(date: Date): string {
  const key = Math.floor(date.getTime() / (24 * 60 * 60 * 1000));
  if (FORMAT_CACHE_DATE_SHORT.has(key)) return FORMAT_CACHE_DATE_SHORT.get(key)!;

  const result = date.toLocaleDateString([], { month: "short", day: "numeric" });
  evictOldest(FORMAT_CACHE_DATE_SHORT);
  FORMAT_CACHE_DATE_SHORT.set(key, result);
  return result;
}

function isSameDay(a: Date, b: Date): boolean {
  return a.toDateString() === b.toDateString();
}

export function isOverdue(timestamp: number, now = Date.now()): boolean {
  return timestamp < now;
}

export function getDueTimestamp(schedule: ReminderSchedule, nowDate = new Date()): number {
  // Interval reminders: compute next occurrence from cadence
  if (schedule.frequency === "interval") {
    if (!schedule.anchorAt || !schedule.intervalMs) {
      return nowDate.getTime();
    }
    const { scheduledFor } = getNextIntervalOccurrence(
      schedule.anchorAt,
      schedule.intervalMs,
      nowDate.getTime()
    );
    return scheduledFor;
  }

  // Defensive check for missing time
  if (!schedule.time) {
    console.warn("[VR] getDueTimestamp called with undefined time, using current time");
    return nowDate.getTime();
  }
  const [hours, minutes] = schedule.time.split(":").map(Number);
  const now = nowDate;

  if (schedule.frequency === "once") {
    return getNextTriggerTime(schedule, nowDate.getTime());
  }

  const todayTarget = new Date(now);
  todayTarget.setHours(hours, minutes, 0, 0);

  if (schedule.frequency === "daily") {
    if (schedule.intervalDays && schedule.intervalDays > 1) {
      return getNextTriggerTime(schedule, nowDate.getTime());
    }
    return todayTarget.getTime();
  }

  if (schedule.frequency === "weekly" || schedule.frequency === "custom") {
    const todayKey = DAY_KEYS[now.getDay()];
    const days = schedule.days?.map((d) => d.toLowerCase()) ?? [];
    if (days.includes(todayKey)) {
      return todayTarget.getTime();
    }
    return getNextTriggerTime(schedule, nowDate.getTime());
  }

  return getNextTriggerTime(schedule, nowDate.getTime());
}

function formatRelativeMinutes(minutes: number): string {
  if (minutes === 1) return "1 minute";
  return `${minutes} minutes`;
}

function formatRelativeHours(hours: number): string {
  if (hours === 1) return "1 hour";
  return `${hours} hours`;
}

function formatRelativeDays(days: number): string {
  if (days === 1) return "1 day";
  return `${days} days`;
}

export function formatReminderTime(timestamp: number, nowDate = new Date()): string {
  const date = new Date(timestamp);
  const now = nowDate;

  const diffMs = date.getTime() - now.getTime();
  const diffMinutes = Math.round(Math.abs(diffMs) / (60 * 1000));

  if (diffMs < 0) {
    if (diffMinutes < 60) {
      return `${formatRelativeMinutes(Math.max(1, diffMinutes))} ago`;
    }
    const diffHours = Math.round(diffMinutes / 60);
    if (diffHours < 24) {
      return `${formatRelativeHours(Math.max(1, diffHours))} ago`;
    }
    const diffDays = Math.round(diffHours / 24);
    return `${formatRelativeDays(Math.max(1, diffDays))} ago`;
  }

  if (diffMinutes < 60) {
    return `in ${formatRelativeMinutes(Math.max(1, diffMinutes))}`;
  }

  // Use cached locale formatting to avoid expensive toLocale* calls
  const timeStr = cachedTimeString(date);
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);

  if (isSameDay(date, now)) {
    return `Today at ${timeStr}`;
  }
  if (isSameDay(date, tomorrow)) {
    return `Tomorrow at ${timeStr}`;
  }

  const daysAhead = Math.floor((date.getTime() - now.getTime()) / (24 * 60 * 60 * 1000));
  if (daysAhead >= 0 && daysAhead < 7) {
    const dayName = cachedWeekdayString(date);
    return `${dayName} at ${timeStr}`;
  }

  const dateStr = cachedShortDateString(date);
  return `${dateStr} at ${timeStr}`;
}

/**
 * Format interval duration for display.
 * E.g., 28800000 -> "Every 8 hours"
 */
export function formatIntervalDuration(intervalMs: number): string {
  const minutes = Math.round(intervalMs / (60 * 1000));

  if (minutes < 60) {
    return `Every ${minutes} minute${minutes !== 1 ? "s" : ""}`;
  }

  const hours = Math.round(minutes / 60);
  if (hours < 24) {
    return `Every ${hours} hour${hours !== 1 ? "s" : ""}`;
  }

  const days = Math.round(hours / 24);
  return `Every ${days} day${days !== 1 ? "s" : ""}`;
}

/**
 * Compute the next interval occurrence.
 * Algorithm: Find smallest t = anchorAt + k*intervalMs where t > referenceTime.
 */
export function getNextIntervalOccurrence(
  anchorAt: number,
  intervalMs: number,
  referenceTime: number = Date.now()
): { scheduledFor: number; k: number } {
  let safeInterval = intervalMs;
  if (!Number.isFinite(safeInterval) || safeInterval <= 0) {
    console.warn("[VR] Invalid intervalMs, defaulting to 1 hour");
    safeInterval = 60 * 60 * 1000;
  }

  const elapsed = referenceTime - anchorAt;
  const k0 = Math.max(0, Math.ceil(elapsed / safeInterval));
  let scheduledFor = anchorAt + k0 * safeInterval;

  // If exactly on boundary (or in the past), push to the next interval.
  if (scheduledFor <= referenceTime) {
    scheduledFor += safeInterval;
  }

  const k = Math.max(0, Math.round((scheduledFor - anchorAt) / safeInterval));
  return { scheduledFor, k };
}

export function getNextTriggerTime(schedule: ReminderSchedule, referenceTime?: number): number {
  // Handle interval frequency
  if (schedule.frequency === "interval") {
    if (!schedule.anchorAt || !schedule.intervalMs) {
      console.warn("[VR] Interval reminder missing anchorAt or intervalMs");
      return Date.now() + 60 * 60 * 1000;
    }
    const ref = referenceTime ?? schedule.scheduledFor ?? Date.now();
    const { scheduledFor } = getNextIntervalOccurrence(
      schedule.anchorAt,
      schedule.intervalMs,
      ref
    );
    return scheduledFor;
  }

  // Defensive check for missing time
  if (!schedule.time) {
    console.warn("[VR] getNextTriggerTime called with undefined time, using current time");
    return referenceTime ?? Date.now();
  }

  const [hours, minutes] = schedule.time.split(":").map(Number);
  const now = referenceTime ? new Date(referenceTime) : new Date();

  // If a specific date is provided (for one-time reminders), use it
  if (schedule.frequency === "once" && schedule.date) {
    const [year, month, day] = schedule.date.split("-").map(Number);
    const target = new Date(year, month - 1, day, hours, minutes, 0, 0);

    // One-time reminders with a specific date do NOT roll forward.
    // They stay fixed at their scheduled time and become overdue if passed.
    return target.getTime();
  }

  if (schedule.frequency === "once") {
    // One-time reminders without a specific date: if scheduledFor exists, keep it fixed
    // Don't roll to tomorrow - one-time means one specific occurrence
    if (schedule.scheduledFor) {
      return schedule.scheduledFor;
    }
    
    // Fallback: schedule for today at the specified time
    const target = new Date(now);
    target.setHours(hours, minutes, 0, 0);
    return target.getTime();
  }

  if (schedule.frequency === "daily") {
    const target = new Date(now);
    target.setHours(hours, minutes, 0, 0);

    // If time has passed today, move to tomorrow (standard daily) or +N days (custom interval)
    if (target.getTime() <= now.getTime()) {
      const daysToAdd = schedule.intervalDays && schedule.intervalDays > 1 ? schedule.intervalDays : 1;
      target.setDate(target.getDate() + daysToAdd);
    } else if (schedule.intervalDays && schedule.intervalDays > 1 && schedule.scheduledFor) {
      // If we have a stable cadence, compute exactly N days from the last occurrence
      const prev = new Date(schedule.scheduledFor);
      prev.setHours(hours, minutes, 0, 0);

      // Add N days until we are after now
      while (prev.getTime() <= now.getTime()) {
        prev.setDate(prev.getDate() + schedule.intervalDays);
      }
      return prev.getTime();
    }

    return target.getTime();
  }

  if (
    (schedule.frequency === "weekly" || schedule.frequency === "custom") &&
    schedule.days?.length
  ) {
    const targetDays = schedule.days
      .map((d) => DAY_MAP[d.toLowerCase()])
      .filter((d) => d !== undefined)
      .sort((a, b) => a - b);

    if (targetDays.length === 0) {
      // Fallback to daily if no valid days
      return getNextTriggerTime({ ...schedule, frequency: "daily" });
    }

    const currentDay = now.getDay();
    const currentTime = now.getHours() * 60 + now.getMinutes();
    const targetTime = hours * 60 + minutes;

    // Find next valid day
    for (const day of targetDays) {
      if (day > currentDay || (day === currentDay && targetTime > currentTime)) {
        const daysUntil = day - currentDay;
        const target = new Date(now);
        target.setDate(target.getDate() + daysUntil);
        target.setHours(hours, minutes, 0, 0);
        return target.getTime();
      }
    }

    // Wrap to next week's first target day
    const firstDay = targetDays[0];
    const daysUntil = 7 - currentDay + firstDay;
    const target = new Date(now);
    target.setDate(target.getDate() + daysUntil);
    target.setHours(hours, minutes, 0, 0);
    return target.getTime();
  }

  // Fallback: schedule for tomorrow at specified time
  const fallback = new Date(now);
  fallback.setDate(fallback.getDate() + 1);
  fallback.setHours(hours, minutes, 0, 0);
  return fallback.getTime();
}

export function formatNextTrigger(timestamp: number): string {
  const date = new Date(timestamp);
  const now = new Date();
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const timeStr = date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

  if (date.toDateString() === now.toDateString()) {
    return `Today at ${timeStr}`;
  } else if (date.toDateString() === tomorrow.toDateString()) {
    return `Tomorrow at ${timeStr}`;
  } else {
    const dayName = date.toLocaleDateString([], { weekday: "long" });
    return `${dayName} at ${timeStr}`;
  }
}
