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
  time: string; // "HH:MM"
  date?: string; // "YYYY-MM-DD" for one-time reminders on specific days
  frequency: string; // "once" | "daily" | "weekly" | "custom"
  days?: string[]; // ["mon", "wed", "fri"]
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
  // Defensive check for missing time
  if (!schedule.time) {
    console.warn("[VR] getDueTimestamp called with undefined time, using current time");
    return nowDate.getTime();
  }
  const [hours, minutes] = schedule.time.split(":").map(Number);
  const now = nowDate;

  if (schedule.frequency === "once") {
    return getNextTriggerTime(schedule);
  }

  const todayTarget = new Date(now);
  todayTarget.setHours(hours, minutes, 0, 0);

  if (schedule.frequency === "daily") {
    return todayTarget.getTime();
  }

  if (schedule.frequency === "weekly" || schedule.frequency === "custom") {
    const todayKey = DAY_KEYS[now.getDay()];
    const days = schedule.days?.map((d) => d.toLowerCase()) ?? [];
    if (days.includes(todayKey)) {
      return todayTarget.getTime();
    }
    return getNextTriggerTime(schedule);
  }

  return getNextTriggerTime(schedule);
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

export function getNextTriggerTime(schedule: ReminderSchedule): number {
  // Defensive check for missing time
  if (!schedule.time) {
    console.warn("[VR] getNextTriggerTime called with undefined time, using current time");
    return Date.now();
  }
  const [hours, minutes] = schedule.time.split(":").map(Number);
  const now = new Date();

  // If a specific date is provided (for one-time reminders), use it
  if (schedule.frequency === "once" && schedule.date) {
    const [year, month, day] = schedule.date.split("-").map(Number);
    const target = new Date(year, month - 1, day, hours, minutes, 0, 0);

    // If the date/time has passed, still return it (will show as overdue)
    // But if it's today and time hasn't passed yet, return it
    if (target.getTime() > now.getTime()) {
      return target.getTime();
    }
    // If past, schedule for tomorrow at the same time as fallback
    target.setDate(target.getDate() + 1);
    return target.getTime();
  }

  if (schedule.frequency === "once" || schedule.frequency === "daily") {
    const target = new Date();
    target.setHours(hours, minutes, 0, 0);

    // If time has passed today, schedule for tomorrow (or just today for "once" that's in future)
    if (target.getTime() <= now.getTime()) {
      target.setDate(target.getDate() + 1);
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
        const target = new Date();
        target.setDate(target.getDate() + daysUntil);
        target.setHours(hours, minutes, 0, 0);
        return target.getTime();
      }
    }

    // Wrap to next week's first target day
    const firstDay = targetDays[0];
    const daysUntil = 7 - currentDay + firstDay;
    const target = new Date();
    target.setDate(target.getDate() + daysUntil);
    target.setHours(hours, minutes, 0, 0);
    return target.getTime();
  }

  // Fallback: schedule for tomorrow at specified time
  const fallback = new Date();
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
