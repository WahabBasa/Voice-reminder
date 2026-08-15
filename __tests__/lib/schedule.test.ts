import {
  getNextOccurrence,
  normalizeSchedule,
  migrateLegacySchedule,
  tryParseScheduleFromText,
  buildGridSchedule,
  gridDayOccurrences,
  gridFromLegacyReminder,
  legacyFieldsFromGrid,
  isIntervalGrid,
  describeGrid,
  normalizeClockTime,
  normalizeClockTimes,
  MIN_INTERVAL_MS,
  MAX_INTERVAL_MS,
  type Schedule,
  type OnceSchedule,
  type IntervalSchedule,
  type RRuleSchedule,
  type GridSchedule,
} from "../../lib/schedule";

function utc(
  year: number,
  month: number,
  day: number,
  hour = 0,
  minute = 0
): number {
  return Date.UTC(year, month - 1, day, hour, minute, 0, 0);
}

// ─── getNextOccurrence ──────────────────────────────────────────────────────

describe("getNextOccurrence", () => {
  describe("once", () => {
    it("returns onceAt when it is in the future", () => {
      const schedule: OnceSchedule = { type: "once", onceAt: 5000 };
      expect(getNextOccurrence(schedule, 3000)).toBe(5000);
    });

    it("returns null when onceAt is in the past", () => {
      const schedule: OnceSchedule = { type: "once", onceAt: 1000 };
      expect(getNextOccurrence(schedule, 3000)).toBeNull();
    });

    it("returns onceAt when exactly equal to referenceTime (not strictly past)", () => {
      // Code uses strict <: 3000 < 3000 is false → returns onceAt
      const schedule: OnceSchedule = { type: "once", onceAt: 3000 };
      expect(getNextOccurrence(schedule, 3000)).toBe(3000);
    });
  });

  describe("interval", () => {
    it("returns next occurrence for valid interval", () => {
      const schedule: IntervalSchedule = {
        type: "interval",
        intervalMs: 600000,
        anchorAt: utc(2026, 4, 6, 14, 0),
      };
      const ref = utc(2026, 4, 6, 14, 7);
      expect(getNextOccurrence(schedule, ref)).toBe(utc(2026, 4, 6, 14, 10));
    });

    it("clamps interval below 5 minutes to 5 minutes", () => {
      const schedule: IntervalSchedule = {
        type: "interval",
        intervalMs: 60000, // 1 minute — below 5 min minimum
        anchorAt: 1000,
      };
      // With 5-min clamp: next after 2000 from anchor 1000 = 1000 + 300000 = 301000
      const result = getNextOccurrence(schedule, 2000);
      expect(result).toBe(1000 + 300000);
    });

    it("clamps interval above 365 days to 365 days", () => {
      const tooLarge = 400 * 24 * 60 * 60 * 1000; // 400 days
      const yearMs = 365 * 24 * 60 * 60 * 1000;
      const schedule: IntervalSchedule = {
        type: "interval",
        intervalMs: tooLarge,
        anchorAt: 1, // must be truthy (0 is falsy → treated as missing)
      };
      expect(getNextOccurrence(schedule, 1000)).toBe(1 + yearMs);
    });

    it("returns null when anchorAt is missing", () => {
      const schedule = {
        type: "interval" as const,
        intervalMs: 600000,
        anchorAt: 0, // falsy
      };
      expect(getNextOccurrence(schedule, 1000)).toBeNull();
    });
  });

  describe("rrule", () => {
    it("returns next daily occurrence", () => {
      // Use dtstart time for occurrence time (simpler than BYHOUR/BYMINUTE)
      const schedule: RRuleSchedule = {
        type: "rrule",
        rrule: "FREQ=DAILY",
        dtstart: utc(2026, 4, 1, 9, 0),
      };
      const ref = utc(2026, 4, 6, 10, 0);
      const result = getNextOccurrence(schedule, ref);
      expect(result).toBe(utc(2026, 4, 7, 9, 0));
    });

    it("returns next matching day for weekly MO,WE,FR", () => {
      const schedule: RRuleSchedule = {
        type: "rrule",
        rrule: "FREQ=WEEKLY;BYDAY=MO,WE,FR",
        dtstart: utc(2026, 4, 1, 10, 30), // Wed Apr 1 at 10:30
      };
      // Tuesday April 7, 2026 at 12:00
      const ref = utc(2026, 4, 7, 12, 0);
      const result = getNextOccurrence(schedule, ref);
      // Next is Wednesday April 8 at 10:30
      expect(result).toBe(utc(2026, 4, 8, 10, 30));
    });

    it("returns null for expired UNTIL", () => {
      const schedule: RRuleSchedule = {
        type: "rrule",
        rrule: "FREQ=DAILY",
        dtstart: utc(2026, 1, 1, 9, 0),
        until: utc(2026, 3, 1, 9, 0), // Expired March 1
      };
      const ref = utc(2026, 4, 6, 10, 0);
      expect(getNextOccurrence(schedule, ref)).toBeNull();
    });

    it("returns null for malformed RRULE string without crashing", () => {
      const schedule: RRuleSchedule = {
        type: "rrule",
        rrule: "THIS_IS_NOT_A_VALID_RRULE",
        dtstart: utc(2026, 4, 1, 9, 0),
      };
      expect(getNextOccurrence(schedule, utc(2026, 4, 6, 10, 0))).toBeNull();
    });

    it("works with RRULE: prefix", () => {
      const schedule: RRuleSchedule = {
        type: "rrule",
        rrule: "RRULE:FREQ=DAILY",
        dtstart: utc(2026, 4, 1, 15, 0),
      };
      const ref = utc(2026, 4, 6, 16, 0);
      expect(getNextOccurrence(schedule, ref)).toBe(utc(2026, 4, 7, 15, 0));
    });

    it("works without RRULE: prefix", () => {
      const schedule: RRuleSchedule = {
        type: "rrule",
        rrule: "FREQ=DAILY",
        dtstart: utc(2026, 4, 1, 15, 0),
      };
      const ref = utc(2026, 4, 6, 16, 0);
      expect(getNextOccurrence(schedule, ref)).toBe(utc(2026, 4, 7, 15, 0));
    });
  });
});

// ─── normalizeSchedule ──────────────────────────────────────────────────────

describe("normalizeSchedule", () => {
  const refTime = utc(2026, 4, 6, 12, 0);

  describe("once", () => {
    it("preserves provided onceAt with no warnings", () => {
      const result = normalizeSchedule(
        { type: "once", onceAt: 9999 },
        { referenceTime: refTime }
      );
      expect((result.schedule as OnceSchedule).onceAt).toBe(9999);
      expect(result.warnings).toHaveLength(0);
    });

    it("defaults onceAt to refTime + 1 hour when missing", () => {
      const result = normalizeSchedule(
        { type: "once" },
        { referenceTime: refTime }
      );
      expect((result.schedule as OnceSchedule).onceAt).toBe(
        refTime + 3600000
      );
    });
  });

  describe("interval", () => {
    it("preserves normal interval with no warnings", () => {
      const result = normalizeSchedule(
        { type: "interval", intervalMs: 1800000, anchorAt: refTime },
        { referenceTime: refTime }
      );
      expect((result.schedule as IntervalSchedule).intervalMs).toBe(1800000);
      expect(result.warnings).toHaveLength(0);
    });

    it("clamps too-small interval and warns", () => {
      const result = normalizeSchedule(
        { type: "interval", intervalMs: 60000 },
        { referenceTime: refTime }
      );
      expect((result.schedule as IntervalSchedule).intervalMs).toBe(300000);
      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0].code).toBe("interval_too_small");
    });

    it("clamps too-large interval and warns", () => {
      const fourHundredDaysMs = 400 * 24 * 60 * 60 * 1000;
      const result = normalizeSchedule(
        { type: "interval", intervalMs: fourHundredDaysMs },
        { referenceTime: refTime }
      );
      const yearMs = 365 * 24 * 60 * 60 * 1000;
      expect((result.schedule as IntervalSchedule).intervalMs).toBe(yearMs);
      expect(result.warnings[0].code).toBe("interval_too_large");
    });

    it("defaults to 15 minutes when intervalMs is missing", () => {
      const result = normalizeSchedule(
        { type: "interval" },
        { referenceTime: refTime }
      );
      expect((result.schedule as IntervalSchedule).intervalMs).toBe(900000);
    });
  });

  describe("rrule", () => {
    it("preserves provided rrule and sets tzid from context", () => {
      const result = normalizeSchedule(
        { type: "rrule", rrule: "FREQ=WEEKLY;BYDAY=MO" },
        { referenceTime: refTime, tzid: "America/New_York" }
      );
      const sched = result.schedule as RRuleSchedule;
      expect(sched.rrule).toBe("FREQ=WEEKLY;BYDAY=MO");
      expect(sched.tzid).toBe("America/New_York");
    });

    it("defaults rrule to FREQ=DAILY when missing", () => {
      const result = normalizeSchedule(
        { type: "rrule" },
        { referenceTime: refTime }
      );
      expect((result.schedule as RRuleSchedule).rrule).toBe("FREQ=DAILY");
    });
  });

  describe("unknown type", () => {
    it("falls back to once with warning", () => {
      const result = normalizeSchedule(
        { type: "banana" as any },
        { referenceTime: refTime }
      );
      expect(result.schedule.type).toBe("once");
      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0].code).toBe("unknown_type");
    });
  });
});

// ─── migrateLegacySchedule ──────────────────────────────────────────────────

describe("migrateLegacySchedule", () => {
  it("converts interval reminder", () => {
    const result = migrateLegacySchedule({
      frequency: "interval",
      time: "14:00",
      intervalMs: 600000,
      anchorAt: 1000,
    });
    expect(result.type).toBe("interval");
    expect((result as IntervalSchedule).intervalMs).toBe(600000);
    expect((result as IntervalSchedule).anchorAt).toBe(1000);
  });

  it("converts once with date+time", () => {
    const result = migrateLegacySchedule({
      frequency: "once",
      time: "14:30",
      date: "2026-08-20",
    });
    expect(result.type).toBe("once");
    expect((result as OnceSchedule).onceAt).toBe(utc(2026, 8, 20, 14, 30));
  });

  it("converts once with scheduledFor", () => {
    const result = migrateLegacySchedule({
      frequency: "once",
      time: "09:00",
      scheduledFor: 999,
    });
    expect(result.type).toBe("once");
    expect((result as OnceSchedule).onceAt).toBe(999);
  });

  it("converts bare once to today at time", () => {
    // Fake timers (not a Date.now spy) so `new Date()` inside the migration is frozen too
    jest.useFakeTimers({ now: utc(2026, 4, 6, 12, 0) });
    try {
      const result = migrateLegacySchedule({
        frequency: "once",
        time: "11:00",
      });
      expect(result.type).toBe("once");
      // today at 11:00 UTC
      expect((result as OnceSchedule).onceAt).toBe(utc(2026, 4, 6, 11, 0));
    } finally {
      jest.useRealTimers();
    }
  });

  it("converts daily to rrule", () => {
    const result = migrateLegacySchedule({
      frequency: "daily",
      time: "08:30",
    });
    expect(result.type).toBe("rrule");
    expect((result as RRuleSchedule).rrule).toContain("FREQ=DAILY");
    expect((result as RRuleSchedule).rrule).toContain("BYHOUR=8");
    expect((result as RRuleSchedule).rrule).toContain("BYMINUTE=30");
  });

  it("converts weekly with days to rrule", () => {
    const result = migrateLegacySchedule({
      frequency: "weekly",
      time: "10:00",
      days: ["mon", "fri"],
    });
    expect(result.type).toBe("rrule");
    const rrule = (result as RRuleSchedule).rrule;
    expect(rrule).toContain("BYDAY=MO,FR");
    expect(rrule).toContain("FREQ=WEEKLY");
  });

  it("converts custom with days to rrule", () => {
    const result = migrateLegacySchedule({
      frequency: "custom",
      time: "16:45",
      days: ["tue", "thu", "sat"],
    });
    expect(result.type).toBe("rrule");
    const rrule = (result as RRuleSchedule).rrule;
    expect(rrule).toContain("BYDAY=TU,TH,SA");
  });

  it("falls back to once for unknown frequency", () => {
    const frozenNow = utc(2026, 4, 6, 12, 0);
    jest.spyOn(Date, "now").mockReturnValue(frozenNow);

    const result = migrateLegacySchedule({
      frequency: "biweekly",
      time: "09:00",
    });
    expect(result.type).toBe("once");
    expect((result as OnceSchedule).onceAt).toBe(frozenNow);
  });
});

// ─── tryParseScheduleFromText ───────────────────────────────────────────────

describe("tryParseScheduleFromText", () => {
  const frozenNow = utc(2026, 4, 6, 12, 0);

  beforeEach(() => {
    jest.spyOn(Date, "now").mockReturnValue(frozenNow);
  });

  it('parses "every 30 minutes" as interval', () => {
    const result = tryParseScheduleFromText("every 30 minutes");
    expect(result).not.toBeNull();
    expect(result!.type).toBe("interval");
    expect((result as IntervalSchedule).intervalMs).toBe(1800000);
  });

  it('parses "every 2 min" and clamps to 5 min minimum', () => {
    const result = tryParseScheduleFromText("every 2 min");
    expect(result).not.toBeNull();
    expect(result!.type).toBe("interval");
    expect((result as IntervalSchedule).intervalMs).toBe(300000);
  });

  it('parses "every 4 hours" as interval', () => {
    const result = tryParseScheduleFromText("every 4 hours");
    expect(result).not.toBeNull();
    expect(result!.type).toBe("interval");
    expect((result as IntervalSchedule).intervalMs).toBe(14400000);
  });

  it('parses "every day at 9:00" as daily rrule', () => {
    const result = tryParseScheduleFromText("every day at 9:00");
    expect(result).not.toBeNull();
    expect(result!.type).toBe("rrule");
    expect((result as RRuleSchedule).rrule).toContain("FREQ=DAILY");
    expect((result as RRuleSchedule).rrule).toContain("BYHOUR=9");
    expect((result as RRuleSchedule).rrule).toContain("BYMINUTE=0");
  });

  it('parses "every day at 3:00 pm" with PM conversion', () => {
    const result = tryParseScheduleFromText("every day at 3:00 pm");
    expect(result).not.toBeNull();
    expect((result as RRuleSchedule).rrule).toContain("BYHOUR=15");
  });

  it('parses "every monday at 10:00" as weekly rrule', () => {
    const result = tryParseScheduleFromText("every monday at 10:00");
    expect(result).not.toBeNull();
    expect(result!.type).toBe("rrule");
    expect((result as RRuleSchedule).rrule).toContain("BYDAY=MO");
    expect((result as RRuleSchedule).rrule).toContain("BYHOUR=10");
  });

  it('parses "every fri at 5:00 pm" as weekly rrule', () => {
    const result = tryParseScheduleFromText("every fri at 5:00 pm");
    expect(result).not.toBeNull();
    expect((result as RRuleSchedule).rrule).toContain("BYDAY=FR");
    expect((result as RRuleSchedule).rrule).toContain("BYHOUR=17");
  });

  it('parses "weekdays at 8:30" as weekly MO-FR rrule', () => {
    const result = tryParseScheduleFromText("weekdays at 8:30");
    expect(result).not.toBeNull();
    expect(result!.type).toBe("rrule");
    const rrule = (result as RRuleSchedule).rrule;
    expect(rrule).toContain("BYDAY=MO,TU,WE,TH,FR");
    expect(rrule).toContain("BYHOUR=8");
    expect(rrule).toContain("BYMINUTE=30");
  });

  it('parses "in 15 minutes" as once', () => {
    const result = tryParseScheduleFromText("in 15 minutes");
    expect(result).not.toBeNull();
    expect(result!.type).toBe("once");
    expect((result as OnceSchedule).onceAt).toBe(frozenNow + 900000);
  });

  it("returns null for unrecognized text", () => {
    expect(tryParseScheduleFromText("remind me about laundry")).toBeNull();
  });

  it("handles uppercase text", () => {
    const result = tryParseScheduleFromText("EVERY 10 MINUTES");
    expect(result).not.toBeNull();
    expect(result!.type).toBe("interval");
    expect((result as IntervalSchedule).intervalMs).toBe(600000);
  });
});

// ─── The days × times grid (OLD-97) ─────────────────────────────────────────
//
// Jest pins TZ=UTC, so the local midnights the grid walks are the utc() helper's.

const grid = (over: Partial<GridSchedule> = {}): GridSchedule => ({
  type: "grid",
  days: { kind: "everyday" },
  times: { kind: "clock", times: ["09:00"] },
  ...over,
});

describe("buildGridSchedule", () => {
  const now = utc(2026, 8, 15, 12, 0); // Saturday

  it("crosses named weekdays with several clock times", () => {
    const schedule = buildGridSchedule(
      { frequency: "custom", days: ["Thursday"], time: "08:00", times: ["21:00", "08:00"] },
      { now }
    );

    expect(schedule).toEqual({
      type: "grid",
      days: { kind: "weekdays", days: ["thu"] },
      times: { kind: "clock", times: ["08:00", "21:00"] },
    });
  });

  it("orders weekdays by the calendar, not by how the model listed them", () => {
    const schedule = buildGridSchedule({ frequency: "custom", days: ["fri", "mon", "fri"] }, { now });
    expect(schedule.days).toEqual({ kind: "weekdays", days: ["mon", "fri"] });
  });

  it("falls back to a usable time when nothing was given", () => {
    expect(buildGridSchedule({ frequency: "daily" }, { now }).times).toEqual({
      kind: "clock",
      times: ["09:00"],
    });
    expect(buildGridSchedule({ frequency: "daily" }, { now, fallbackTime: "17:45" }).times).toEqual({
      kind: "clock",
      times: ["17:45"],
    });
  });

  it("clamps an interval and warns", () => {
    const warnings: string[] = [];
    const tooSmall = buildGridSchedule(
      { frequency: "interval", intervalMinutes: 2 },
      { now, warnings }
    );
    expect(tooSmall.times).toMatchObject({ kind: "interval", everyMinutes: 5 });
    expect(warnings[0]).toContain("Minimum interval is 5 minutes");

    const tooBig = buildGridSchedule({ frequency: "interval", intervalHours: 48 }, { now, warnings });
    expect(tooBig.times).toMatchObject({ everyMinutes: 24 * 60 });
  });

  it("rejects a window that does not span a day and says so", () => {
    const warnings: string[] = [];
    const schedule = buildGridSchedule(
      { frequency: "interval", intervalHours: 1, windowStart: "22:00", windowEnd: "06:00" },
      { now, warnings }
    );

    expect(schedule.times).toMatchObject({ windowStart: "08:00", windowEnd: "22:00" });
    expect(warnings[0]).toContain("does not span a day");
  });

  it("anchors every-N-days on the day it was made", () => {
    const schedule = buildGridSchedule({ frequency: "everyNDays", everyNDays: 3 }, { now });
    expect(schedule.days).toEqual({
      kind: "everyNDays",
      interval: 3,
      startDate: "2026-08-15",
    });
  });

  it("treats everyNDays=1 as plain every day", () => {
    expect(buildGridSchedule({ frequency: "everyNDays", everyNDays: 1 }, { now }).days).toEqual({
      kind: "everyday",
    });
  });

  it("dates an undated one-off today when the time is still ahead, tomorrow when not", () => {
    expect(buildGridSchedule({ frequency: "once", time: "18:00" }, { now }).days).toEqual({
      kind: "date",
      date: "2026-08-15",
    });
    expect(buildGridSchedule({ frequency: "once", time: "06:00" }, { now }).days).toEqual({
      kind: "date",
      date: "2026-08-16",
    });
  });

  it("drops a date the calendar does not have", () => {
    const schedule = buildGridSchedule({ frequency: "once", time: "09:00", date: "2026-02-31" }, { now });
    expect(schedule.days).toEqual({ kind: "date", date: "2026-08-16" });
  });

  it("bounds a recurrence at the end of the until day", () => {
    const schedule = buildGridSchedule({ frequency: "daily", until: "2026-09-01" }, { now });
    expect(schedule.until).toBe(utc(2026, 9, 1, 23, 59) + 59999);
  });
});

describe("normalizeClockTime / normalizeClockTimes", () => {
  it("accepts the shapes speech-to-text actually produces", () => {
    expect(normalizeClockTime("8")).toBe("08:00");
    expect(normalizeClockTime("8:05")).toBe("08:05");
    expect(normalizeClockTime("0800")).toBe("08:00");
    expect(normalizeClockTime("8.30")).toBe("08:30");
    expect(normalizeClockTime("24:00")).toBeNull();
    expect(normalizeClockTime("8:99")).toBeNull();
    expect(normalizeClockTime("quarter past")).toBeNull();
    expect(normalizeClockTime(undefined)).toBeNull();
  });

  it("dedupes, sorts and falls back to the single time", () => {
    expect(normalizeClockTimes(["21:00", "8:00", "08:00"])).toEqual(["08:00", "21:00"]);
    expect(normalizeClockTimes([], "07:15")).toEqual(["07:15"]);
    expect(normalizeClockTimes(undefined, undefined)).toEqual([]);
  });

  it("caps a runaway list", () => {
    const many = Array.from({ length: 24 }, (_, i) => `${String(i).padStart(2, "0")}:00`);
    expect(normalizeClockTimes(many)).toHaveLength(12);
  });
});

describe("gridDayOccurrences", () => {
  it("expands every clock time of a matching day", () => {
    const schedule = grid({
      days: { kind: "weekdays", days: ["thu"] },
      times: { kind: "clock", times: ["08:00", "21:00"] },
    });

    expect(gridDayOccurrences(schedule, utc(2026, 8, 13, 15, 0))).toEqual([
      utc(2026, 8, 13, 8, 0),
      utc(2026, 8, 13, 21, 0),
    ]);
    // Friday is not on the days axis.
    expect(gridDayOccurrences(schedule, utc(2026, 8, 14, 15, 0))).toEqual([]);
  });

  it("walks an interval across its window and stops at the end", () => {
    const schedule = grid({
      times: { kind: "interval", everyMinutes: 120, windowStart: "08:00", windowEnd: "13:00" },
    });

    expect(gridDayOccurrences(schedule, utc(2026, 8, 15, 3, 0))).toEqual([
      utc(2026, 8, 15, 8, 0),
      utc(2026, 8, 15, 10, 0),
      utc(2026, 8, 15, 12, 0),
    ]);
  });

  it("produces nothing past until", () => {
    const schedule = grid({
      times: { kind: "clock", times: ["08:00", "21:00"] },
      until: utc(2026, 8, 15, 12, 0),
    });

    expect(gridDayOccurrences(schedule, utc(2026, 8, 15, 0, 0))).toEqual([utc(2026, 8, 15, 8, 0)]);
  });

  it("counts every-N-days from its anchor", () => {
    const schedule = grid({
      days: { kind: "everyNDays", interval: 3, startDate: "2026-08-15" },
    });

    expect(gridDayOccurrences(schedule, utc(2026, 8, 15, 0, 0))).toHaveLength(1);
    expect(gridDayOccurrences(schedule, utc(2026, 8, 16, 0, 0))).toEqual([]);
    expect(gridDayOccurrences(schedule, utc(2026, 8, 18, 0, 0))).toHaveLength(1);
    // Before the anchor the schedule has not started.
    expect(gridDayOccurrences(schedule, utc(2026, 8, 12, 0, 0))).toEqual([]);
  });

  it("fires a dated schedule on that day only", () => {
    const schedule = grid({ days: { kind: "date", date: "2026-08-20" } });

    expect(gridDayOccurrences(schedule, utc(2026, 8, 20, 0, 0))).toHaveLength(1);
    expect(gridDayOccurrences(schedule, utc(2026, 8, 21, 0, 0))).toEqual([]);
  });
});

describe("getNextOccurrence — grid", () => {
  it("returns the same day's later ring before rolling over", () => {
    const schedule = grid({
      days: { kind: "weekdays", days: ["thu"] },
      times: { kind: "clock", times: ["08:00", "21:00"] },
    });

    expect(getNextOccurrence(schedule, utc(2026, 8, 13, 9, 0))).toBe(utc(2026, 8, 13, 21, 0));
    // After the last ring of the day, the next Thursday.
    expect(getNextOccurrence(schedule, utc(2026, 8, 13, 22, 0))).toBe(utc(2026, 8, 20, 8, 0));
  });

  it("keeps an interval inside its window instead of ringing at 3am", () => {
    const schedule = grid({
      times: { kind: "interval", everyMinutes: 120, windowStart: "08:00", windowEnd: "22:00" },
    });

    expect(getNextOccurrence(schedule, utc(2026, 8, 15, 3, 0))).toBe(utc(2026, 8, 15, 8, 0));
    expect(getNextOccurrence(schedule, utc(2026, 8, 15, 23, 0))).toBe(utc(2026, 8, 16, 8, 0));
  });

  it("jumps ahead to a far-off dated one-off, and gives up once it passes", () => {
    const schedule = grid({
      days: { kind: "date", date: "2026-12-24" },
      times: { kind: "clock", times: ["18:00"] },
    });

    expect(getNextOccurrence(schedule, utc(2026, 8, 15, 12, 0))).toBe(utc(2026, 12, 24, 18, 0));
    expect(getNextOccurrence(schedule, utc(2026, 12, 25, 12, 0))).toBeNull();
  });

  it("skips forward to a future every-N-days anchor", () => {
    const schedule = grid({
      days: { kind: "everyNDays", interval: 10, startDate: "2026-09-01" },
    });

    expect(getNextOccurrence(schedule, utc(2026, 8, 15, 12, 0))).toBe(utc(2026, 9, 1, 9, 0));
  });

  it("returns null once until has passed", () => {
    const schedule = grid({ until: utc(2026, 8, 15, 12, 0) });
    expect(getNextOccurrence(schedule, utc(2026, 8, 16, 0, 0))).toBeNull();
  });

  it("normalizes a grid through normalizeSchedule with a display line", () => {
    const result = normalizeSchedule(
      grid({
        days: { kind: "weekdays", days: ["mon", "thu"] },
        times: { kind: "clock", times: ["08:00", "21:00"] },
      }),
      { tzid: "Asia/Riyadh" }
    );

    expect(result.schedule.type).toBe("grid");
    expect((result.schedule as GridSchedule).tzid).toBe("Asia/Riyadh");
    expect(result.displayText).toBe("Mon, Thu · 08:00, 21:00");
  });
});

describe("grid to legacy fields", () => {
  it("projects each days rule onto the columns pre-grid readers use", () => {
    expect(legacyFieldsFromGrid(grid({ times: { kind: "clock", times: ["08:00", "21:00"] } }))).toEqual({
      time: "08:00",
      frequency: "daily",
      days: [],
    });
    expect(legacyFieldsFromGrid(grid({ days: { kind: "weekdays", days: ["thu"] } }))).toEqual({
      time: "09:00",
      frequency: "custom",
      days: ["thu"],
    });
    expect(
      legacyFieldsFromGrid(grid({ days: { kind: "everyNDays", interval: 3, startDate: "2026-08-15" } }))
    ).toEqual({ time: "09:00", frequency: "daily", days: [], intervalDays: 3 });
    expect(legacyFieldsFromGrid(grid({ days: { kind: "date", date: "2026-08-20" } }))).toEqual({
      time: "09:00",
      date: "2026-08-20",
      frequency: "once",
      days: [],
    });
    expect(
      legacyFieldsFromGrid(
        grid({ times: { kind: "interval", everyMinutes: 30, windowStart: "09:00", windowEnd: "17:00" } })
      )
    ).toEqual({ time: "09:00", frequency: "interval", days: [], intervalMs: 1800000 });
  });

  it("derives a grid from a stored pre-grid reminder", () => {
    expect(
      gridFromLegacyReminder({ frequency: "custom", time: "18:00", days: ["mon", "wed"] })
    ).toEqual({
      type: "grid",
      days: { kind: "weekdays", days: ["mon", "wed"] },
      times: { kind: "clock", times: ["18:00"] },
    });

    // A one-off knows its day through scheduledFor when it has no date.
    expect(
      gridFromLegacyReminder({
        frequency: "once",
        time: "10:00",
        scheduledFor: utc(2026, 8, 20, 10, 0),
      }).days
    ).toEqual({ kind: "date", date: "2026-08-20" });

    expect(
      gridFromLegacyReminder({ frequency: "interval", time: "09:00", intervalMs: 3600000 }).times
    ).toEqual({ kind: "interval", everyMinutes: 60, windowStart: "08:00", windowEnd: "22:00" });
  });
});

describe("grid descriptions", () => {
  it("names the premium half of the times axis", () => {
    expect(isIntervalGrid(grid())).toBe(false);
    expect(
      isIntervalGrid(
        grid({ times: { kind: "interval", everyMinutes: 60, windowStart: "08:00", windowEnd: "22:00" } })
      )
    ).toBe(true);
    expect(isIntervalGrid(undefined)).toBe(false);
  });

  it("reads back as something a card can show", () => {
    expect(describeGrid(grid())).toBe("Every day · 09:00");
    expect(describeGrid(grid({ days: { kind: "everyNDays", interval: 3, startDate: "2026-08-15" } }))).toBe(
      "Every 3 days · 09:00"
    );
    expect(describeGrid(grid({ days: { kind: "date", date: "2026-08-20" } }))).toBe(
      "2026-08-20 · 09:00"
    );
    expect(
      describeGrid(
        grid({ times: { kind: "interval", everyMinutes: 90, windowStart: "08:00", windowEnd: "22:00" } })
      )
    ).toBe("Every day · Every 90 min, 08:00–22:00");
    expect(
      describeGrid(
        grid({ times: { kind: "interval", everyMinutes: 60, windowStart: "09:00", windowEnd: "17:00" } })
      )
    ).toBe("Every day · Every 1 hr, 09:00–17:00");
  });
});
