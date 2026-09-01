/**
 * The creation job's strict gate.
 *
 * Two halves, and both matter. The accept/reject table below pins every
 * predicate the gate makes; the "real planner output" block at the end feeds it
 * what convex/actions.ts actually produces, which is the half that proves the
 * gate is not so strict that it rejects working reminders.
 */

import {
  MAX_EVERY_N_DAYS,
  MAX_PLANS_PER_TAKE,
  MAX_TITLE_LENGTH,
  isCalendarDate,
  isClockTime,
  isIanaTimezone,
  validateCreationPlan,
  validateCreationPlans,
} from "../../convex/creationValidate";
import { planRemindersFromRawParse } from "../../convex/actions";
import { capEveryNDays } from "../../convex/creationJobActions";

const TZ = "Asia/Dubai";
const NOW = Date.UTC(2026, 8, 1, 6, 0, 0);
const CONTEXT = { timezone: TZ, now: NOW };

/** A dated one-off, exactly as buildReminderPlan emits one. */
const oncePlan = (over: Record<string, unknown> = {}) => ({
  title: "Water",
  description: "Drink your water.",
  schedule: {
    type: "grid",
    days: { kind: "date", date: "2026-09-02" },
    times: { kind: "clock", times: ["20:00"] },
    tzid: TZ,
  },
  times: ["20:00"],
  time: "20:00",
  date: "2026-09-02",
  frequency: "once",
  days: undefined,
  emoji: "💧",
  intervalDays: undefined,
  intervalMs: undefined,
  anchorAt: undefined,
  scheduleType: "once",
  onceAt: NOW + 60_000,
  rrule: undefined,
  dtstart: undefined,
  until: undefined,
  preReminderMinutes: 0,
  preTtsText: "",
  urgency: "routine",
  persistent: false,
  parseWarnings: [],
  ...over,
});

/** A weekly reminder on named days. */
const weeklyPlan = (over: Record<string, unknown> = {}) => ({
  ...oncePlan(),
  schedule: {
    type: "grid",
    days: { kind: "weekdays", days: ["mon", "thu"] },
    times: { kind: "clock", times: ["08:00", "21:00"] },
    tzid: TZ,
  },
  times: ["08:00", "21:00"],
  time: "08:00",
  date: undefined,
  frequency: "custom",
  days: ["mon", "thu"],
  scheduleType: "rrule",
  onceAt: undefined,
  rrule: "FREQ=WEEKLY;BYDAY=MO,TH;BYHOUR=8;BYMINUTE=0",
  dtstart: NOW,
  ...over,
});

/** Every-N-days, which projects to the legacy "daily" + intervalDays pair. */
const everyNDaysPlan = (over: Record<string, unknown> = {}) => ({
  ...oncePlan(),
  schedule: {
    type: "grid",
    days: { kind: "everyNDays", interval: 3, startDate: "2026-09-01" },
    times: { kind: "clock", times: ["09:00"] },
    tzid: TZ,
  },
  times: ["09:00"],
  time: "09:00",
  date: undefined,
  frequency: "daily",
  intervalDays: 3,
  scheduleType: "rrule",
  onceAt: undefined,
  rrule: "FREQ=DAILY;BYHOUR=9;BYMINUTE=0",
  dtstart: NOW,
  ...over,
});

/** A windowed interval. */
const intervalPlan = (over: Record<string, unknown> = {}) => ({
  ...oncePlan(),
  schedule: {
    type: "grid",
    days: { kind: "everyday" },
    times: { kind: "interval", everyMinutes: 120, windowStart: "08:00", windowEnd: "22:00" },
    tzid: TZ,
  },
  times: ["08:00"],
  time: "08:00",
  date: undefined,
  frequency: "interval",
  intervalMs: 120 * 60_000,
  anchorAt: NOW,
  scheduleType: "interval",
  onceAt: undefined,
  ...over,
});

function reject(plan: unknown, field: string, context = CONTEXT): void {
  const result = validateCreationPlan(plan, context);
  expect(result.ok).toBe(false);
  expect(result.ok === false && result.field).toBe(field);
}

function accept(plan: unknown, context = CONTEXT): void {
  const result = validateCreationPlan(plan, context);
  // Surfaces the reason in the failure message rather than a bare `false`.
  expect(result.ok === true ? "ok" : `${result.field}: ${result.reason}`).toBe("ok");
}

// ─── Predicates ─────────────────────────────────────────────────────────────

describe("isClockTime", () => {
  it.each(["00:00", "08:00", "09:05", "23:59"])("accepts %s", (value) => {
    expect(isClockTime(value)).toBe(true);
  });

  // Everything the legacy normalizer would have REPAIRED into a clock time.
  it.each(["8", "8:5", "0800", "24:00", "08:60", "8:00", " 08:00", 800, null, undefined])(
    "rejects %p",
    (value) => {
      expect(isClockTime(value)).toBe(false);
    }
  );
});

describe("isCalendarDate", () => {
  it.each(["2026-09-01", "2024-02-29", "2026-12-31"])("accepts %s", (value) => {
    expect(isCalendarDate(value)).toBe(true);
  });

  it.each([
    "2026-02-30",
    "2026-13-01",
    "2026-00-10",
    "2026-01-32",
    "2026-01-00",
    "2026-9-1",
    "20260901",
    "",
    42,
    null,
  ])("rejects %p", (value) => {
    expect(isCalendarDate(value)).toBe(false);
  });
});

describe("isIanaTimezone", () => {
  it.each(["UTC", "Asia/Dubai", "America/New_York"])("accepts %s", (value) => {
    expect(isIanaTimezone(value)).toBe(true);
  });

  it.each(["Not/AZone", "", "   ", 5, undefined])("rejects %p", (value) => {
    expect(isIanaTimezone(value)).toBe(false);
  });
});

// ─── The take ───────────────────────────────────────────────────────────────

describe("validateCreationPlans — the take", () => {
  it("accepts a take of one", () => {
    expect(validateCreationPlans([oncePlan()], CONTEXT)).toEqual({ ok: true });
  });

  it("accepts a take of several", () => {
    expect(
      validateCreationPlans([oncePlan(), weeklyPlan(), intervalPlan()], CONTEXT)
    ).toEqual({ ok: true });
  });

  it("rejects the whole take when one item is bad, naming which", () => {
    const result = validateCreationPlans([oncePlan(), weeklyPlan({ title: "  " })], CONTEXT);
    expect(result).toEqual({ ok: false, index: 1, field: "title", reason: "missing or blank" });
  });

  it("rejects a zone this runtime cannot resolve before looking at any plan", () => {
    const result = validateCreationPlans([oncePlan()], { timezone: "Not/AZone", now: NOW });
    expect(result).toMatchObject({ ok: false, index: -1, field: "timezone" });
  });

  it.each([
    ["not an array", {} as unknown],
    ["an empty take", []],
    ["more reminders than a take may hold", Array.from({ length: MAX_PLANS_PER_TAKE + 1 }, oncePlan)],
  ])("rejects %s", (_label, plans) => {
    const result = validateCreationPlans(plans, CONTEXT);
    expect(result).toMatchObject({ ok: false, index: -1, field: "plans" });
  });
});

// ─── The spoken half ────────────────────────────────────────────────────────

describe("validateCreationPlan — title, line and tier", () => {
  it("rejects anything that is not an object", () => {
    reject(null, "plan");
    reject("Water", "plan");
    reject([oncePlan()], "plan");
  });

  it("requires a title with something in it", () => {
    reject(oncePlan({ title: undefined }), "title");
    reject(oncePlan({ title: "" }), "title");
    reject(oncePlan({ title: "   " }), "title");
    reject(oncePlan({ title: 7 }), "title");
  });

  it("caps the title, measured trimmed", () => {
    accept(oncePlan({ title: `  ${"x".repeat(MAX_TITLE_LENGTH)}  ` }));
    reject(oncePlan({ title: "x".repeat(MAX_TITLE_LENGTH + 1) }), "title");
  });

  it("requires a spoken line", () => {
    reject(oncePlan({ description: "" }), "description");
    reject(oncePlan({ description: undefined }), "description");
  });

  it("takes an absent emoji but not a blank one", () => {
    accept(oncePlan({ emoji: undefined }));
    reject(oncePlan({ emoji: "" }), "emoji");
    reject(oncePlan({ emoji: 3 }), "emoji");
  });

  it("pins the ring tier to the three the schema holds", () => {
    accept(oncePlan({ urgency: "urgent" }));
    accept(oncePlan({ urgency: "notice" }));
    reject(oncePlan({ urgency: "critical" }), "urgency");
    reject(oncePlan({ urgency: undefined }), "urgency");
    reject(oncePlan({ persistent: "true" }), "persistent");
  });

  it("takes a whole number of pre-reminder minutes, in range", () => {
    accept(oncePlan({ preReminderMinutes: 10, preTtsText: "Water in 10 minutes" }));
    accept(oncePlan({ preReminderMinutes: 120, preTtsText: "Water in 120 minutes" }));
    reject(oncePlan({ preReminderMinutes: -1 }), "preReminderMinutes");
    reject(oncePlan({ preReminderMinutes: 10.5 }), "preReminderMinutes");
    reject(oncePlan({ preReminderMinutes: 121 }), "preReminderMinutes");
    reject(oncePlan({ preReminderMinutes: "10" }), "preReminderMinutes");
  });

  it("will not ship a heads-up with nothing to say", () => {
    reject(oncePlan({ preTtsText: 0 }), "preTtsText");
    reject(oncePlan({ preReminderMinutes: 10, preTtsText: "  " }), "preTtsText");
  });

  it("requires parseWarnings to be a list of strings", () => {
    reject(oncePlan({ parseWarnings: undefined }), "parseWarnings");
    reject(oncePlan({ parseWarnings: [1] }), "parseWarnings");
  });
});

// ─── The grid ───────────────────────────────────────────────────────────────

describe("validateCreationPlan — the grid envelope", () => {
  it("requires a grid", () => {
    reject(oncePlan({ schedule: undefined }), "schedule");
    reject(oncePlan({ schedule: { ...oncePlan().schedule, type: "rrule" } }), "schedule.type");
  });

  it("refuses a grid carrying a field it does not know", () => {
    reject(oncePlan({ schedule: { ...oncePlan().schedule, extra: 1 } }), "schedule");
  });

  it("refuses a grid missing one", () => {
    const { times: _times, ...rest } = oncePlan().schedule as Record<string, unknown>;
    reject(oncePlan({ schedule: rest }), "schedule");
  });

  it("pins the grid's zone to the job's own", () => {
    reject(oncePlan({ schedule: { ...oncePlan().schedule, tzid: "UTC" } }), "schedule.tzid");
    const { tzid: _tzid, ...noZone } = oncePlan().schedule as Record<string, unknown>;
    reject(oncePlan({ schedule: noZone }), "schedule");
  });

  it("takes a bound, but only a real one, and only when the plan agrees", () => {
    accept(
      weeklyPlan({
        schedule: { ...weeklyPlan().schedule, until: NOW + 86_400_000 },
        until: NOW + 86_400_000,
      })
    );
    reject(
      oncePlan({ schedule: { ...oncePlan().schedule, until: "soon" } }),
      "schedule.until"
    );
    reject(oncePlan({ schedule: { ...oncePlan().schedule, until: NOW } }), "until");
  });

  it("refuses an interval that rings on exactly one dated day", () => {
    reject(
      oncePlan({
        schedule: {
          type: "grid",
          days: { kind: "date", date: "2026-09-02" },
          times: { kind: "interval", everyMinutes: 60, windowStart: "08:00", windowEnd: "22:00" },
          tzid: TZ,
        },
      }),
      "schedule"
    );
  });
});

describe("validateCreationPlan — the days axis", () => {
  const withDays = (days: unknown) =>
    weeklyPlan({ schedule: { ...weeklyPlan().schedule, days } });

  it("accepts all four supported shapes", () => {
    accept(oncePlan());
    accept(weeklyPlan());
    accept(everyNDaysPlan());
    accept(intervalPlan());
  });

  it("rejects a days rule that is not an object or names an unknown kind", () => {
    reject(withDays("everyday"), "schedule.days");
    reject(withDays({ kind: "everyOtherTuesday" }), "schedule.days");
  });

  it("rejects everyday carrying anything else", () => {
    reject(
      intervalPlan({
        schedule: { ...intervalPlan().schedule, days: { kind: "everyday", days: [] } },
      }),
      "schedule.days"
    );
  });

  it("rejects a weekday list that is empty, unknown, repeated or out of calendar order", () => {
    reject(withDays({ kind: "weekdays" }), "schedule.days");
    reject(withDays({ kind: "weekdays", days: [] }), "schedule.days");
    reject(withDays({ kind: "weekdays", days: "mon" }), "schedule.days");
    reject(withDays({ kind: "weekdays", days: ["monday"] }), "schedule.days");
    reject(withDays({ kind: "weekdays", days: ["mon", "mon"] }), "schedule.days");
    reject(withDays({ kind: "weekdays", days: ["thu", "mon"] }), "schedule.days");
    reject(
      withDays({ kind: "weekdays", days: ["sun", "mon", "tue", "wed", "thu", "fri", "sat", "sun"] }),
      "schedule.days"
    );
  });

  it("rejects an every-N-days axis outside what the client's scan can reach", () => {
    const withInterval = (interval: unknown, startDate: unknown = "2026-09-01") =>
      everyNDaysPlan({
        schedule: {
          ...everyNDaysPlan().schedule,
          days: { kind: "everyNDays", interval, startDate },
        },
        intervalDays: interval,
      });

    accept(withInterval(2));
    accept(withInterval(MAX_EVERY_N_DAYS));
    reject(withInterval(1), "schedule.days");
    reject(withInterval(3.5), "schedule.days");
    reject(withInterval("3"), "schedule.days");
    reject(withInterval(MAX_EVERY_N_DAYS + 1), "schedule.days");
    reject(withInterval(3, "2026-02-30"), "schedule.days");
    reject(
      everyNDaysPlan({
        schedule: {
          ...everyNDaysPlan().schedule,
          days: { kind: "everyNDays", interval: 3 },
        },
      }),
      "schedule.days"
    );
  });

  it("rejects a dated day that is not a day", () => {
    reject(
      oncePlan({
        schedule: { ...oncePlan().schedule, days: { kind: "date", date: "2026-02-30" } },
      }),
      "schedule.days"
    );
    reject(
      oncePlan({ schedule: { ...oncePlan().schedule, days: { kind: "date" } } }),
      "schedule.days"
    );
  });
});

describe("validateCreationPlan — the times axis", () => {
  const withTimes = (times: unknown) =>
    weeklyPlan({ schedule: { ...weeklyPlan().schedule, times } });

  it("rejects a times rule that is not an object or names an unknown kind", () => {
    reject(withTimes(["08:00"]), "schedule.times");
    reject(withTimes({ kind: "cron", expression: "* * * * *" }), "schedule.times");
  });

  it("rejects a clock list that is empty, malformed, repeated, unsorted or oversized", () => {
    reject(withTimes({ kind: "clock" }), "schedule.times");
    reject(withTimes({ kind: "clock", times: [] }), "schedule.times");
    reject(withTimes({ kind: "clock", times: "08:00" }), "schedule.times");
    reject(withTimes({ kind: "clock", times: ["8:00"] }), "schedule.times");
    reject(withTimes({ kind: "clock", times: ["08:00", "08:00"] }), "schedule.times");
    reject(withTimes({ kind: "clock", times: ["21:00", "08:00"] }), "schedule.times");
    reject(
      withTimes({
        kind: "clock",
        times: Array.from({ length: 13 }, (_, i) => `${String(i + 6).padStart(2, "0")}:00`),
      }),
      "schedule.times"
    );
  });

  it("rejects an interval axis outside its bounds or with a window that does not span", () => {
    const withInterval = (over: Record<string, unknown>) =>
      intervalPlan({
        schedule: {
          ...intervalPlan().schedule,
          times: {
            kind: "interval",
            everyMinutes: 120,
            windowStart: "08:00",
            windowEnd: "22:00",
            ...over,
          },
        },
      });

    accept(
      intervalPlan({
        schedule: {
          ...intervalPlan().schedule,
          times: { kind: "interval", everyMinutes: 5, windowStart: "08:00", windowEnd: "22:00" },
        },
        intervalMs: 5 * 60_000,
      })
    );
    reject(withInterval({ everyMinutes: 4 }), "schedule.times");
    reject(withInterval({ everyMinutes: 1441 }), "schedule.times");
    reject(withInterval({ everyMinutes: 90.5 }), "schedule.times");
    reject(withInterval({ windowStart: "8:00" }), "schedule.times");
    reject(withInterval({ windowEnd: "25:00" }), "schedule.times");
    reject(withInterval({ windowStart: "22:00", windowEnd: "08:00" }), "schedule.times");
    reject(withInterval({ windowStart: "08:00", windowEnd: "08:00" }), "schedule.times");
    reject(
      intervalPlan({
        schedule: {
          ...intervalPlan().schedule,
          times: { kind: "interval", everyMinutes: 120, windowStart: "08:00" },
        },
      }),
      "schedule.times"
    );
  });
});

// ─── The flat projection ────────────────────────────────────────────────────

describe("validateCreationPlan — the columns must agree with the grid", () => {
  it("catches a first ring that is not the grid's", () => {
    reject(weeklyPlan({ time: "21:00" }), "time");
    reject(intervalPlan({ time: "09:00" }), "time");
  });

  it("catches a times list that is not the grid's", () => {
    reject(weeklyPlan({ times: ["08:00"] }), "times");
    reject(weeklyPlan({ times: undefined }), "times");
    reject(intervalPlan({ times: ["08:00", "10:00"] }), "times");
  });

  it("catches a frequency the grid does not imply", () => {
    reject(weeklyPlan({ frequency: "daily" }), "frequency");
    reject(everyNDaysPlan({ frequency: "custom" }), "frequency");
    reject(oncePlan({ frequency: "once " }), "frequency");
  });

  it("catches a days list, date, interval or intervalDays the grid does not imply", () => {
    reject(weeklyPlan({ days: ["mon"] }), "days");
    reject(oncePlan({ days: ["mon"] }), "days");
    reject(oncePlan({ date: "2026-09-03" }), "date");
    reject(weeklyPlan({ date: "2026-09-03" }), "date");
    reject(intervalPlan({ intervalMs: 60_000 }), "intervalMs");
    reject(weeklyPlan({ intervalMs: 60_000 }), "intervalMs");
    reject(everyNDaysPlan({ intervalDays: 4 }), "intervalDays");
    reject(weeklyPlan({ intervalDays: 3 }), "intervalDays");
    // An interval axis never projects a days list or an every-N-days count.
    reject(
      intervalPlan({
        schedule: {
          ...intervalPlan().schedule,
          days: { kind: "weekdays", days: ["mon"] },
        },
        days: ["mon"],
      }),
      "days"
    );
  });
});

describe("validateCreationPlan — the execution columns", () => {
  it("pins scheduleType to the grid", () => {
    reject(oncePlan({ scheduleType: "grid" }), "scheduleType");
    reject(oncePlan({ scheduleType: undefined }), "scheduleType");
    reject(oncePlan({ scheduleType: "rrule", rrule: "FREQ=DAILY", dtstart: NOW }), "scheduleType");
    reject(weeklyPlan({ scheduleType: "once" }), "scheduleType");
    reject(intervalPlan({ scheduleType: "rrule" }), "scheduleType");
  });

  it("requires a one-off whose clock we filled in to resolve ahead of now", () => {
    accept(oncePlan({ onceAt: NOW + 1 }));
    reject(oncePlan({ onceAt: NOW }), "onceAt");
    reject(oncePlan({ onceAt: NOW - 1 }), "onceAt");
    reject(oncePlan({ onceAt: undefined }), "onceAt");
    reject(oncePlan({ onceAt: Number.NaN }), "onceAt");
  });

  it("lets a one-off the user actually dated AND timed land in the past", () => {
    // "Today at three", said at half past. The app has an Overdue group built
    // for exactly this; failing the take would lose the reminder, and every
    // retry would resolve to the same instant and spend the attempt cap.
    accept(oncePlan({ onceAt: NOW - 1, explicitDate: true, explicitTime: true }));
    accept(oncePlan({ onceAt: NOW, explicitDate: true, explicitTime: true }));
    // Still a valid future one-off with the flags set, obviously.
    accept(oncePlan({ onceAt: NOW + 1, explicitDate: true, explicitTime: true }));
  });

  it("still refuses a past one-off with either half of its clock filled in", () => {
    reject(oncePlan({ onceAt: NOW - 1, explicitDate: true }), "onceAt");
    reject(oncePlan({ onceAt: NOW - 1, explicitTime: true }), "onceAt");
    reject(
      oncePlan({ onceAt: NOW - 1, explicitDate: true, explicitTime: false }),
      "onceAt"
    );
    reject(
      oncePlan({ onceAt: NOW - 1, explicitDate: false, explicitTime: true }),
      "onceAt"
    );
  });

  it("refuses recurrence columns on a one-off", () => {
    reject(oncePlan({ rrule: "FREQ=DAILY" }), "rrule");
    reject(oncePlan({ dtstart: NOW }), "dtstart");
    reject(oncePlan({ anchorAt: NOW }), "anchorAt");
  });

  it("requires an interval to be anchored, and nothing else", () => {
    reject(intervalPlan({ anchorAt: undefined }), "anchorAt");
    reject(intervalPlan({ onceAt: NOW + 1000 }), "onceAt");
    reject(intervalPlan({ rrule: "FREQ=DAILY" }), "rrule");
    reject(intervalPlan({ dtstart: NOW }), "dtstart");
  });

  it("requires a recurring schedule to carry a rule and a start", () => {
    reject(weeklyPlan({ rrule: undefined }), "rrule");
    reject(weeklyPlan({ rrule: "  " }), "rrule");
    reject(weeklyPlan({ dtstart: undefined }), "dtstart");
    reject(weeklyPlan({ onceAt: NOW + 1000 }), "onceAt");
    reject(weeklyPlan({ anchorAt: NOW }), "anchorAt");
  });
});

// ─── Against the real planner ───────────────────────────────────────────────

/**
 * The other direction: what convex/actions.ts actually builds must pass. The
 * gate would be worthless if it were strict enough to reject a working take, so
 * every schedule shape the prompt can produce is run through the real planner
 * and handed straight to the validator.
 */
describe("accepts what the legacy planner produces", () => {
  const plansFor = (reminder: Record<string, unknown>, transcript = "") =>
    planRemindersFromRawParse(JSON.stringify({ reminders: [reminder] }), {
      transcript,
      currentTime: "10:00:00",
      currentDate: "2026-09-01",
      timezone: TZ,
    });

  const base = {
    title: "Water",
    description: "Drink your water.",
    emoji: "💧",
  };

  const cases: Array<[string, Record<string, unknown>]> = [
    ["a dated one-off", { ...base, time: "20:00", frequency: "once", date: "2099-09-02" }],
    ["a daily reminder", { ...base, time: "09:00", frequency: "daily" }],
    ["named weekdays", { ...base, time: "08:00", frequency: "custom", days: ["thu", "mon"] }],
    [
      "one reminder ringing twice a day",
      { ...base, time: "08:00", times: ["08:00", "21:00"], frequency: "custom", days: ["thu"] },
    ],
    ["every N days", { ...base, time: "09:00", frequency: "everyNDays", everyNDays: 3 }],
    ["an interval with a default window", { ...base, time: "09:00", frequency: "interval", intervalHours: 2 }],
    [
      "an interval with a named window",
      {
        ...base,
        time: "09:00",
        frequency: "interval",
        intervalMinutes: 30,
        windowStart: "09:00",
        windowEnd: "17:00",
      },
    ],
    [
      "a bounded recurrence",
      { ...base, time: "08:00", frequency: "daily", until: "2099-03-01" },
    ],
    [
      "a reminder with a heads-up",
      {
        ...base,
        time: "18:00",
        frequency: "daily",
        preReminderMinutes: 15,
        preDescription: "Your water is coming up.",
        urgency: "notice",
        persistent: true,
      },
    ],
  ];

  it.each(cases)("accepts %s", (_label, reminder) => {
    const plans = plansFor(reminder);
    const result = validateCreationPlans(plans, { timezone: TZ, now: Date.now() });
    expect(result.ok === true ? "ok" : JSON.stringify(result)).toBe("ok");
  });

  it("accepts a multi-reminder take whole", () => {
    const plans = planRemindersFromRawParse(
      JSON.stringify({
        reminders: [
          { ...base, time: "08:00", frequency: "daily" },
          { title: "Pills", description: "Take your pills.", time: "21:00", frequency: "custom", days: ["mon"] },
        ],
      }),
      { transcript: "", currentTime: "10:00:00", currentDate: "2026-09-01", timezone: TZ }
    );
    expect(validateCreationPlans(plans, { timezone: TZ, now: Date.now() })).toEqual({ ok: true });
  });

  it("rejects a take the planner could only build by inventing a title", () => {
    const plans = plansFor({ description: "Drink your water.", time: "20:00", frequency: "daily" });
    expect(validateCreationPlans(plans, { timezone: TZ, now: Date.now() })).toMatchObject({
      ok: false,
      field: "title",
    });
  });

  it("accepts a one-off the model dated in the past — it lands in Overdue", () => {
    const plans = plansFor({ ...base, time: "08:00", frequency: "once", date: "2020-01-01" });
    expect(plans[0]).toMatchObject({ explicitDate: true, explicitTime: true });
    expect(validateCreationPlans(plans, { timezone: TZ, now: Date.now() })).toEqual({ ok: true });
  });

  it("marks a one-off whose day and time it had to invent", () => {
    // No date and no time: the planner reaches for the device's calendar and
    // clock, and the gate is told so — a past instant built out of those is a
    // parse that went wrong, not a reminder anybody asked for.
    const plans = plansFor({ ...base, frequency: "once" });
    expect(plans[0]).toMatchObject({ explicitDate: false, explicitTime: false });
  });

  it("counts a time named only in the `times` list as one the user gave", () => {
    const plans = plansFor({ ...base, times: ["15:00"], frequency: "once", date: "2020-01-01" });
    expect(plans[0]).toMatchObject({ explicitDate: true, explicitTime: true });
    expect(validateCreationPlans(plans, { timezone: TZ, now: Date.now() })).toEqual({ ok: true });
  });

  it("rejects a take whose zone the runtime does not know", () => {
    const plans = planRemindersFromRawParse(JSON.stringify({ reminders: [{ ...base, time: "20:00", frequency: "daily" }] }), {
      transcript: "",
      currentTime: "10:00:00",
      currentDate: "2026-09-01",
      timezone: "Middle/Earth",
    });
    expect(validateCreationPlans(plans, { timezone: "Middle/Earth", now: Date.now() })).toMatchObject({
      ok: false,
      field: "timezone",
    });
  });
});

// ─── The one repair made on the way in ──────────────────────────────────────

/**
 * `capEveryNDays` (convex/creationJobActions.ts) is the single exception to the
 * gate's "reject, never repair" rule, and it lives on the worker's side of the
 * seam precisely so this module keeps that rule. It belongs in this suite
 * because what it exists for is the disagreement between what buildGridSchedule
 * will emit and what the gate will accept.
 */
describe("capEveryNDays", () => {
  const plansFor = (reminder: Record<string, unknown>) =>
    planRemindersFromRawParse(JSON.stringify({ reminders: [reminder] }), {
      transcript: "",
      currentTime: "10:00:00",
      currentDate: "2026-09-01",
      timezone: TZ,
    });

  const everyNDaysReminder = (everyNDays: number) => ({
    title: "Water",
    description: "Drink your water.",
    time: "09:00",
    frequency: "everyNDays",
    everyNDays,
  });

  it("turns a schedule the gate would refuse into the longest one it can run", () => {
    const raw = plansFor(everyNDaysReminder(730))[0];
    // The planner itself puts no ceiling on it, so the gate would fail the take.
    expect(validateCreationPlans([raw], { timezone: TZ, now: Date.now() })).toMatchObject({
      ok: false,
      field: "schedule.days",
    });

    const capped = capEveryNDays(raw);
    expect(capped.schedule.days).toEqual({
      kind: "everyNDays",
      interval: MAX_EVERY_N_DAYS,
      startDate: expect.any(String),
    });
    // The flat projection has to keep agreeing with the grid.
    expect(capped.intervalDays).toBe(MAX_EVERY_N_DAYS);
    expect(validateCreationPlans([capped], { timezone: TZ, now: Date.now() })).toEqual({
      ok: true,
    });
  });

  it("leaves a schedule already inside the ceiling exactly as it was", () => {
    const raw = plansFor(everyNDaysReminder(MAX_EVERY_N_DAYS))[0];
    expect(capEveryNDays(raw)).toBe(raw);
    expect(capEveryNDays(plansFor(everyNDaysReminder(3))[0]).intervalDays).toBe(3);
  });

  it("has nothing to say about the other three days axes", () => {
    for (const plan of [oncePlan(), weeklyPlan(), intervalPlan()] as any[]) {
      expect(capEveryNDays(plan)).toBe(plan);
    }
  });
});
