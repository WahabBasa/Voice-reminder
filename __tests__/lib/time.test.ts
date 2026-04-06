import {
  getNextIntervalOccurrence,
  getNextTriggerTime,
  getDueTimestamp,
  isOverdue,
  formatReminderTime,
  formatIntervalDuration,
  type ReminderSchedule,
} from "../../lib/time";

// Helper: create a UTC timestamp for a specific date/time
function utc(
  year: number,
  month: number,
  day: number,
  hour = 0,
  minute = 0
): number {
  return Date.UTC(year, month - 1, day, hour, minute, 0, 0);
}

// ─── getNextIntervalOccurrence ──────────────────────────────────────────────

describe("getNextIntervalOccurrence", () => {
  it("returns next occurrence when anchor is in the past and reference is between occurrences", () => {
    const result = getNextIntervalOccurrence(1000, 500, 1600);
    expect(result.scheduledFor).toBe(2000);
    expect(result.k).toBe(2);
  });

  it("pushes to next interval when reference lands exactly on a boundary", () => {
    const result = getNextIntervalOccurrence(1000, 500, 1500);
    expect(result.scheduledFor).toBe(2000);
    expect(result.k).toBe(2);
  });

  it("pushes to next interval when reference equals anchor", () => {
    const result = getNextIntervalOccurrence(1000, 500, 1000);
    expect(result.scheduledFor).toBe(1500);
    expect(result.k).toBe(1);
  });

  it("returns anchor when reference is before anchor", () => {
    // elapsed = 100 - 5000 = -4900 → k0 = max(0, ceil(-4900/300)) = 0
    // scheduledFor = 5000 + 0 = 5000, which is > 100, so no push needed
    const result = getNextIntervalOccurrence(5000, 300, 100);
    expect(result.scheduledFor).toBe(5000);
    expect(result.k).toBe(0);
  });

  it("handles large gap with anchor far in the past", () => {
    const oneHour = 3600000;
    const result = getNextIntervalOccurrence(0, oneHour, 7200000);
    expect(result.scheduledFor).toBe(10800000);
    expect(result.k).toBe(3);
  });

  it("defaults to 1 hour interval when intervalMs is 0", () => {
    const oneHour = 3600000;
    const result = getNextIntervalOccurrence(1000, 0, 2000);
    expect(result.scheduledFor).toBe(1000 + oneHour);
    expect(result.k).toBe(1);
  });

  it("defaults to 1 hour interval when intervalMs is negative", () => {
    const oneHour = 3600000;
    const result = getNextIntervalOccurrence(1000, -100, 2000);
    expect(result.scheduledFor).toBe(1000 + oneHour);
    expect(result.k).toBe(1);
  });

  it("defaults to 1 hour interval when intervalMs is NaN", () => {
    const oneHour = 3600000;
    const result = getNextIntervalOccurrence(1000, NaN, 2000);
    expect(result.scheduledFor).toBe(1000 + oneHour);
    expect(result.k).toBe(1);
  });

  it("defaults to 1 hour interval when intervalMs is Infinity", () => {
    const oneHour = 3600000;
    const result = getNextIntervalOccurrence(1000, Infinity, 2000);
    expect(result.scheduledFor).toBe(1000 + oneHour);
    expect(result.k).toBe(1);
  });

  it("computes correct next 5-minute occurrence in real-world scenario", () => {
    const anchor = utc(2026, 4, 6, 14, 0); // 14:00 UTC
    const fiveMin = 300000;
    const ref = utc(2026, 4, 6, 14, 12); // 14:12 UTC
    const result = getNextIntervalOccurrence(anchor, fiveMin, ref);
    expect(result.scheduledFor).toBe(utc(2026, 4, 6, 14, 15));
    expect(result.k).toBe(3);
  });
});

// ─── getNextTriggerTime ─────────────────────────────────────────────────────

describe("getNextTriggerTime", () => {
  // Once with date — fixed, never rolls forward
  describe("once with date", () => {
    it("returns exact timestamp for future date+time", () => {
      const schedule: ReminderSchedule = {
        frequency: "once",
        date: "2026-07-15",
        time: "09:30",
      };
      const ref = utc(2026, 6, 1, 8, 0);
      expect(getNextTriggerTime(schedule, ref)).toBe(utc(2026, 7, 15, 9, 30));
    });

    it("returns exact timestamp even for past date+time (overdue)", () => {
      const schedule: ReminderSchedule = {
        frequency: "once",
        date: "2026-01-01",
        time: "06:00",
      };
      const ref = utc(2026, 4, 6, 12, 0);
      expect(getNextTriggerTime(schedule, ref)).toBe(utc(2026, 1, 1, 6, 0));
    });
  });

  // Once without date
  describe("once without date", () => {
    it("returns scheduledFor when present", () => {
      const schedule: ReminderSchedule = {
        frequency: "once",
        time: "08:00",
        scheduledFor: 999,
      };
      expect(getNextTriggerTime(schedule, utc(2026, 4, 6, 10, 0))).toBe(999);
    });

    it("returns today at specified time when no scheduledFor", () => {
      const schedule: ReminderSchedule = {
        frequency: "once",
        time: "14:00",
      };
      const ref = utc(2026, 4, 6, 10, 0);
      expect(getNextTriggerTime(schedule, ref)).toBe(utc(2026, 4, 6, 14, 0));
    });
  });

  // Daily
  describe("daily", () => {
    it("returns today when time is still ahead", () => {
      const schedule: ReminderSchedule = {
        frequency: "daily",
        time: "18:00",
      };
      const ref = utc(2026, 4, 6, 10, 0);
      expect(getNextTriggerTime(schedule, ref)).toBe(utc(2026, 4, 6, 18, 0));
    });

    it("returns tomorrow when time already passed", () => {
      const schedule: ReminderSchedule = {
        frequency: "daily",
        time: "07:00",
      };
      const ref = utc(2026, 4, 6, 10, 0);
      expect(getNextTriggerTime(schedule, ref)).toBe(utc(2026, 4, 7, 7, 0));
    });

    it("computes intervalDays=3 cadence from scheduledFor when time not yet passed", () => {
      // The stable cadence (else-if) path only fires when today's time hasn't passed yet.
      // scheduledFor = Apr 3, 09:00. ref = Apr 5, 08:00 (before 09:00).
      // Cadence: Apr 3 → Apr 6 → Apr 9... First > ref is Apr 6.
      const schedule: ReminderSchedule = {
        frequency: "daily",
        time: "09:00",
        intervalDays: 3,
        scheduledFor: utc(2026, 4, 3, 9, 0),
      };
      const ref = utc(2026, 4, 5, 8, 0);
      expect(getNextTriggerTime(schedule, ref)).toBe(utc(2026, 4, 6, 9, 0));
    });
  });

  // Weekly/Custom
  describe("weekly/custom", () => {
    it("returns next valid day this week", () => {
      // April 6, 2026 is a Monday (UTC)
      const schedule: ReminderSchedule = {
        frequency: "custom",
        time: "10:00",
        days: ["wed", "fri"],
      };
      const ref = utc(2026, 4, 6, 8, 0); // Monday 08:00
      expect(getNextTriggerTime(schedule, ref)).toBe(
        utc(2026, 4, 8, 10, 0) // Wednesday
      );
    });

    it("wraps to next week when all days have passed", () => {
      // Monday 10:00 has passed, only target is "mon"
      const schedule: ReminderSchedule = {
        frequency: "weekly",
        time: "08:00",
        days: ["mon"],
      };
      const ref = utc(2026, 4, 6, 10, 0); // Monday 10:00
      expect(getNextTriggerTime(schedule, ref)).toBe(
        utc(2026, 4, 13, 8, 0) // Next Monday
      );
    });

    it("returns same day when time has not yet passed", () => {
      const schedule: ReminderSchedule = {
        frequency: "custom",
        time: "15:00",
        days: ["mon"],
      };
      const ref = utc(2026, 4, 6, 10, 0); // Monday 10:00
      expect(getNextTriggerTime(schedule, ref)).toBe(
        utc(2026, 4, 6, 15, 0) // Monday 15:00
      );
    });

    it("falls back to daily when days array is empty", () => {
      const schedule: ReminderSchedule = {
        frequency: "custom",
        time: "09:00",
        days: [],
      };
      const ref = utc(2026, 4, 6, 10, 0);
      // Time passed today, so daily fallback gives tomorrow
      expect(getNextTriggerTime(schedule, ref)).toBe(utc(2026, 4, 7, 9, 0));
    });
  });

  // Interval
  describe("interval", () => {
    it("delegates to getNextIntervalOccurrence", () => {
      const tenMin = 600000;
      const anchor = utc(2026, 4, 6, 14, 0);
      const schedule: ReminderSchedule = {
        frequency: "interval",
        intervalMs: tenMin,
        anchorAt: anchor,
        time: "14:00",
      };
      const ref = utc(2026, 4, 6, 14, 7); // 14:07
      expect(getNextTriggerTime(schedule, ref)).toBe(
        utc(2026, 4, 6, 14, 10) // 14:10
      );
    });

    it("returns Date.now()+1hr when anchorAt is missing", () => {
      const frozenNow = utc(2026, 4, 6, 14, 0);
      jest.spyOn(Date, "now").mockReturnValue(frozenNow);
      const schedule: ReminderSchedule = {
        frequency: "interval",
        intervalMs: 600000,
        time: "14:00",
      };
      const oneHour = 3600000;
      expect(getNextTriggerTime(schedule, frozenNow)).toBe(frozenNow + oneHour);
    });
  });

  // Missing time
  describe("missing time", () => {
    it("returns referenceTime when time is undefined", () => {
      const schedule: ReminderSchedule = {
        frequency: "daily",
      };
      const ref = 1700000000000;
      expect(getNextTriggerTime(schedule, ref)).toBe(ref);
    });
  });
});

// ─── getDueTimestamp ────────────────────────────────────────────────────────

describe("getDueTimestamp", () => {
  it("delegates interval to getNextIntervalOccurrence", () => {
    const fiveMin = 300000;
    const anchor = utc(2026, 4, 6, 14, 0);
    const schedule: ReminderSchedule = {
      frequency: "interval",
      intervalMs: fiveMin,
      anchorAt: anchor,
    };
    const now = new Date(utc(2026, 4, 6, 14, 7));
    expect(getDueTimestamp(schedule, now)).toBe(utc(2026, 4, 6, 14, 10));
  });

  it("returns current time when interval fields are missing", () => {
    const schedule: ReminderSchedule = {
      frequency: "interval",
    };
    const now = new Date(utc(2026, 4, 6, 14, 0));
    expect(getDueTimestamp(schedule, now)).toBe(now.getTime());
  });

  it("delegates daily to getNextTriggerTime", () => {
    const schedule: ReminderSchedule = {
      frequency: "daily",
      time: "18:00",
    };
    const now = new Date(utc(2026, 4, 6, 10, 0));
    expect(getDueTimestamp(schedule, now)).toBe(utc(2026, 4, 6, 18, 0));
  });
});

// ─── isOverdue ──────────────────────────────────────────────────────────────

describe("isOverdue", () => {
  it("returns true when timestamp is in the past", () => {
    expect(isOverdue(1000, 2000)).toBe(true);
  });

  it("returns false when timestamp is in the future", () => {
    expect(isOverdue(3000, 2000)).toBe(false);
  });

  it("returns false when timestamp equals now", () => {
    expect(isOverdue(2000, 2000)).toBe(false);
  });
});

// ─── formatReminderTime ─────────────────────────────────────────────────────

describe("formatReminderTime", () => {
  it("formats 30 minutes ago", () => {
    const now = new Date(utc(2026, 4, 6, 12, 0));
    const ts = utc(2026, 4, 6, 11, 30);
    expect(formatReminderTime(ts, now)).toBe("30 minutes ago");
  });

  it("formats 3 hours ago", () => {
    const now = new Date(utc(2026, 4, 6, 15, 0));
    const ts = utc(2026, 4, 6, 12, 0);
    expect(formatReminderTime(ts, now)).toBe("3 hours ago");
  });

  it("formats 2 days ago", () => {
    const now = new Date(utc(2026, 4, 6, 12, 0));
    const ts = utc(2026, 4, 4, 12, 0);
    expect(formatReminderTime(ts, now)).toBe("2 days ago");
  });

  it("formats 30 minutes from now", () => {
    const now = new Date(utc(2026, 4, 6, 12, 0));
    const ts = utc(2026, 4, 6, 12, 30);
    expect(formatReminderTime(ts, now)).toBe("in 30 minutes");
  });

  it("formats same day future as Today at HH:MM", () => {
    const now = new Date(utc(2026, 4, 6, 10, 0));
    const ts = utc(2026, 4, 6, 14, 30);
    const result = formatReminderTime(ts, now);
    expect(result).toMatch(/^Today at .+/);
  });

  it("formats next day as Tomorrow at HH:MM", () => {
    const now = new Date(utc(2026, 4, 6, 10, 0));
    // 2 hours ahead = "Today", so use ~11 hours ahead to cross midnight
    const ts = utc(2026, 4, 7, 9, 0);
    const result = formatReminderTime(ts, now);
    expect(result).toMatch(/^Tomorrow at .+/);
  });

  it("formats 4 days ahead as weekday name", () => {
    const now = new Date(utc(2026, 4, 6, 10, 0)); // Monday
    const ts = utc(2026, 4, 10, 14, 0); // Friday
    const result = formatReminderTime(ts, now);
    expect(result).toMatch(/Friday at .+/);
  });

  it("formats 10 days ahead as short date", () => {
    const now = new Date(utc(2026, 4, 6, 10, 0));
    const ts = utc(2026, 4, 16, 9, 0);
    const result = formatReminderTime(ts, now);
    // Locale-dependent: "Apr 16" or "16 Apr"
    expect(result).toMatch(/Apr.*16|16.*Apr/);
    expect(result).toMatch(/at .+/);
  });
});

// ─── formatIntervalDuration ─────────────────────────────────────────────────

describe("formatIntervalDuration", () => {
  it("formats 5 minutes", () => {
    expect(formatIntervalDuration(300000)).toBe("Every 5 minutes");
  });

  it("formats 1 minute (singular)", () => {
    expect(formatIntervalDuration(60000)).toBe("Every 1 minute");
  });

  it("formats 1 hour (singular)", () => {
    expect(formatIntervalDuration(3600000)).toBe("Every 1 hour");
  });

  it("formats 2 hours", () => {
    expect(formatIntervalDuration(7200000)).toBe("Every 2 hours");
  });

  it("formats 1 day (singular)", () => {
    expect(formatIntervalDuration(86400000)).toBe("Every 1 day");
  });

  it("formats 2 days", () => {
    expect(formatIntervalDuration(172800000)).toBe("Every 2 days");
  });
});
