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
  frequency: string; // "once" | "daily" | "weekly"
  days?: string[]; // ["mon", "wed", "fri"]
}

export function getNextTriggerTime(schedule: ReminderSchedule): number {
  const [hours, minutes] = schedule.time.split(":").map(Number);
  const now = new Date();

  if (schedule.frequency === "once" || schedule.frequency === "daily") {
    const target = new Date();
    target.setHours(hours, minutes, 0, 0);

    // If time has passed today, schedule for tomorrow (or just today for "once" that's in future)
    if (target.getTime() <= now.getTime()) {
      target.setDate(target.getDate() + 1);
    }

    return target.getTime();
  }

  if (schedule.frequency === "weekly" && schedule.days?.length) {
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
