import {
  getNextOccurrence,
  normalizeSchedule,
  migrateLegacySchedule,
  tryParseScheduleFromText,
  MIN_INTERVAL_MS,
  MAX_INTERVAL_MS,
  type Schedule,
  type OnceSchedule,
  type IntervalSchedule,
  type RRuleSchedule,
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
    const frozenNow = utc(2026, 4, 6, 12, 0);
    jest.spyOn(Date, "now").mockReturnValue(frozenNow);

    const result = migrateLegacySchedule({
      frequency: "once",
      time: "11:00",
    });
    expect(result.type).toBe("once");
    // today at 11:00 UTC
    expect((result as OnceSchedule).onceAt).toBe(utc(2026, 4, 6, 11, 0));
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
