/**
 * "When should I remind you?" — the server's rules (convex/needsTime.ts).
 *
 * Which plans of a `no_time`/`past_time` take are waiting for a time, what the
 * card is shown of them, and what a picked time turns them into. The mocked
 * backend half (`get`, `resolveWithTime`) lives in
 * __vitest__/convex/creationJobsNeedsTime.test.ts.
 */
import {
  columnsForSchedule,
  isNeedsTimeDetail,
  planNeedsTime,
  resolveHeldPlans,
  toPendingPlan,
  type HeldPlan,
  type PendingPlan,
} from "../../convex/needsTime";
import { PAST_TIME_GRACE_MS } from "../../convex/creationValidate";
import type { GridSchedule } from "../../convex/scheduleShape";

const TZ = "Asia/Dubai"; // UTC+4, no DST
// 2026-10-06 12:00 in Dubai.
const NOW = Date.UTC(2026, 9, 6, 8, 0);

function held(over: Partial<HeldPlan> = {}): HeldPlan {
  return {
    title: "Call the dentist",
    description: "Ring tandläkaren.",
    time: "12:01",
    date: "2026-10-06",
    frequency: "once",
    schedule: {
      type: "grid",
      days: { kind: "date", date: "2026-10-06" },
      times: { kind: "clock", times: ["12:01"] },
      tzid: TZ,
    },
    scheduleType: "once",
    onceAt: NOW + 60_000,
    tzid: TZ,
    emoji: "🦷",
    urgency: "routine",
    ttsText: "Ring tandläkaren.",
    lang: "sv",
    ...over,
  };
}

function sibling(over: Partial<HeldPlan> = {}): HeldPlan {
  return {
    title: "Pills",
    description: "Take your pills.",
    time: "08:00",
    frequency: "daily",
    schedule: {
      type: "grid",
      days: { kind: "everyday" },
      times: { kind: "clock", times: ["08:00"] },
      tzid: TZ,
    },
    scheduleType: "rrule",
    rrule: "FREQ=DAILY;BYHOUR=8;BYMINUTE=0",
    dtstart: NOW - 1000,
    tzid: TZ,
    urgency: "notice",
    ttsText: "Take your pills.",
    lang: "en",
    ...over,
  };
}

const pending = (needsTime: boolean, title = "x"): PendingPlan => ({
  title,
  description: "d",
  frequency: "once",
  needsTime,
});

const onceAt = (date: string, time: string, tzid = TZ): GridSchedule => ({
  type: "grid",
  days: { kind: "date", date },
  times: { kind: "clock", times: [time] },
  tzid,
});

describe("isNeedsTimeDetail", () => {
  it("is exactly no_time and past_time", () => {
    expect(isNeedsTimeDetail("no_time")).toBe(true);
    expect(isNeedsTimeDetail("past_time")).toBe(true);
    for (const other of ["not_understood", "unsupported_language", undefined, 3]) {
      expect(isNeedsTimeDetail(other)).toBe(false);
    }
  });
});

describe("planNeedsTime — the guard's two rules, per plan", () => {
  it("a one-off with no time said", () => {
    expect(planNeedsTime({ frequency: "once", timeSpoken: false }, NOW)).toBe(true);
  });

  it("a one-off more than the grace window in the past", () => {
    expect(
      planNeedsTime({ frequency: "once", onceAt: NOW - PAST_TIME_GRACE_MS - 1 }, NOW)
    ).toBe(true);
    expect(planNeedsTime({ frequency: "once", onceAt: NOW - PAST_TIME_GRACE_MS }, NOW)).toBe(
      false
    );
  });

  it("never a repeating plan, a timed future one-off, or a non-object", () => {
    expect(planNeedsTime({ frequency: "daily", timeSpoken: false }, NOW)).toBe(false);
    expect(planNeedsTime({ frequency: "once", onceAt: NOW + 1 }, NOW)).toBe(false);
    expect(planNeedsTime({ frequency: "once" }, NOW)).toBe(false);
    expect(planNeedsTime(null, NOW)).toBe(false);
    expect(planNeedsTime(["once"], NOW)).toBe(false);
  });
});

describe("toPendingPlan — the card's view", () => {
  it("no_time: the reminder, flagged, and no time (the model picked it, the user did not)", () => {
    expect(toPendingPlan(held(), true, false)).toEqual({
      title: "Call the dentist",
      description: "Ring tandläkaren.",
      emoji: "🦷",
      lang: "sv",
      frequency: "once",
      needsTime: true,
    });
  });

  it("past_time: carries the time the user said, as context", () => {
    expect(toPendingPlan(held({ time: "10:00" }), true, true)).toMatchObject({
      saidTime: "10:00",
      needsTime: true,
    });
  });

  it("a sibling that has its time: no saidTime, days kept, empty fields left out", () => {
    const view = toPendingPlan(
      sibling({ frequency: "custom", days: ["mon", "wed"], emoji: undefined, lang: undefined }),
      false,
      true
    );
    expect(view).toEqual({
      title: "Pills",
      description: "Take your pills.",
      frequency: "custom",
      days: ["mon", "wed"],
      needsTime: false,
    });
    expect(toPendingPlan(sibling({ days: [] }), false, undefined)).not.toHaveProperty("days");
  });
});

describe("columnsForSchedule — a picked grid as row columns", () => {
  it("a one-off: placed in its own zone, every other execution column cleared", () => {
    const cols = columnsForSchedule(onceAt("2026-10-07", "09:00"), NOW)!;
    expect(cols).toMatchObject({
      time: "09:00",
      date: "2026-10-07",
      frequency: "once",
      scheduleType: "once",
      onceAt: Date.UTC(2026, 9, 7, 5, 0),
      tzid: TZ,
    });
    expect(cols.rrule).toBeUndefined();
    expect(cols.dtstart).toBeUndefined();
    expect(cols.anchorAt).toBeUndefined();
    expect(cols.days).toBeUndefined();
    expect(cols.parseWarnings).toBeUndefined();
    expect("onceAt" in cols && "rrule" in cols && "anchorAt" in cols).toBe(true);
  });

  it("the same wall clock lands on a different instant in another zone", () => {
    const ny = columnsForSchedule(onceAt("2026-10-07", "09:00", "America/New_York"), NOW)!;
    expect(ny.onceAt).toBe(Date.UTC(2026, 9, 7, 13, 0)); // EDT, UTC-4
  });

  it("a one-off that cannot be placed is refused, not guessed", () => {
    expect(columnsForSchedule(onceAt("2026-10-07", "09:00", "Mars/Olympus"), NOW)).toBeNull();
    expect(
      columnsForSchedule({ ...onceAt("2026-10-07", "09:00"), tzid: undefined }, NOW)
    ).toBeNull();
  });

  it("every day, weekly and every-N-days repeat as rrules from now", () => {
    const daily = columnsForSchedule(
      { type: "grid", days: { kind: "everyday" }, times: { kind: "clock", times: ["07:30"] }, tzid: TZ },
      NOW
    )!;
    expect(daily).toMatchObject({
      frequency: "daily",
      scheduleType: "rrule",
      rrule: "FREQ=DAILY;BYHOUR=7;BYMINUTE=30",
      dtstart: NOW,
    });
    expect(daily.onceAt).toBeUndefined();

    const weekly = columnsForSchedule(
      {
        type: "grid",
        days: { kind: "weekdays", days: ["sun", "tue", "thu", "sat"] },
        times: { kind: "clock", times: ["18:00"] },
        tzid: TZ,
      },
      NOW
    )!;
    expect(weekly).toMatchObject({
      frequency: "custom",
      days: ["sun", "tue", "thu", "sat"],
      rrule: "FREQ=WEEKLY;BYDAY=SU,TU,TH,SA;BYHOUR=18;BYMINUTE=0",
    });

    const everyN = columnsForSchedule(
      {
        type: "grid",
        days: { kind: "everyNDays", interval: 3, startDate: "2026-10-06" },
        times: { kind: "clock", times: ["09:00"] },
        tzid: TZ,
      },
      NOW
    )!;
    expect(everyN).toMatchObject({ frequency: "daily", intervalDays: 3, scheduleType: "rrule" });
  });

  it("an interval anchors at now", () => {
    const cols = columnsForSchedule(
      {
        type: "grid",
        days: { kind: "everyday" },
        times: { kind: "interval", everyMinutes: 120, windowStart: "09:00", windowEnd: "17:00" },
        tzid: TZ,
      },
      NOW
    )!;
    expect(cols).toMatchObject({
      frequency: "interval",
      scheduleType: "interval",
      intervalMs: 120 * 60_000,
      anchorAt: NOW,
      time: "09:00",
    });
  });
});

describe("resolveHeldPlans — the take a picked time commits", () => {
  const tomorrow9 = onceAt("2026-10-07", "09:00");

  it("puts the time on the waiting plan, keeps its words, emoji and language", () => {
    const result = resolveHeldPlans({
      held: [held()],
      pending: [pending(true)],
      schedule: tomorrow9,
      timezone: TZ,
      now: NOW,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.plans).toHaveLength(1);
    expect(result.plans[0]).toMatchObject({
      title: "Call the dentist",
      description: "Ring tandläkaren.",
      ttsText: "Ring tandläkaren.",
      emoji: "🦷",
      lang: "sv",
      time: "09:00",
      date: "2026-10-07",
      onceAt: Date.UTC(2026, 9, 7, 5, 0),
    });
  });

  it("a multi-reminder take: siblings keep the time they were said with", () => {
    const result = resolveHeldPlans({
      held: [sibling(), held()],
      pending: [pending(false, "Pills"), pending(true)],
      schedule: tomorrow9,
      timezone: TZ,
      now: NOW,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.plans[0]).toEqual(sibling());
    expect(result.plans[1]).toMatchObject({ time: "09:00", date: "2026-10-07" });
  });

  it("every waiting plan gets the one answer", () => {
    const result = resolveHeldPlans({
      held: [held(), held({ title: "Buy milk" })],
      pending: [pending(true), pending(true)],
      schedule: tomorrow9,
      timezone: TZ,
      now: NOW,
    });
    expect(result.ok && result.plans.map((p) => p.date)).toEqual(["2026-10-07", "2026-10-07"]);
  });

  it("with nothing flagged, the first plan is the one the card asked about", () => {
    const result = resolveHeldPlans({
      held: [held(), sibling()],
      pending: [],
      schedule: tomorrow9,
      timezone: TZ,
      now: NOW,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.plans[0].date).toBe("2026-10-07");
    expect(result.plans[1]).toEqual(sibling());
  });

  it("the sheet's edits land on the shown plan, trimmed; an emoji left out is removed", () => {
    const result = resolveHeldPlans({
      held: [sibling(), held()],
      pending: [pending(false), pending(true)],
      schedule: tomorrow9,
      edits: { title: "  Dentist ", description: " Ring tandläkaren nu. " },
      timezone: TZ,
      now: NOW,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.plans[1]).toMatchObject({
      title: "Dentist",
      description: "Ring tandläkaren nu.",
      ttsText: "Ring tandläkaren nu.",
      lang: "sv",
    });
    expect(result.plans[1].emoji).toBeUndefined();
    expect(result.plans[0].title).toBe("Pills");

    const withEmoji = resolveHeldPlans({
      held: [held()],
      pending: [pending(true)],
      schedule: tomorrow9,
      edits: { title: "Dentist", description: "Ring.", emoji: "📞" },
      timezone: TZ,
      now: NOW,
    });
    expect(withEmoji.ok && withEmoji.plans[0].emoji).toBe("📞");
  });

  it("the sheet can make it repeat; the one-off's columns do not survive", () => {
    const result = resolveHeldPlans({
      held: [held({ parseWarnings: ["old warning"] })],
      pending: [pending(true)],
      schedule: {
        type: "grid",
        days: { kind: "weekdays", days: ["mon", "fri"] },
        times: { kind: "clock", times: ["08:00", "20:00"] },
        tzid: TZ,
      },
      timezone: TZ,
      now: NOW,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.plans[0].onceAt).toBeUndefined();
    expect(result.plans[0].date).toBeUndefined();
    expect(result.plans[0].parseWarnings).toBeUndefined();
    expect(result.plans[0]).toMatchObject({ scheduleType: "rrule", frequency: "custom" });
  });

  it("refuses a picked time that has already passed", () => {
    const result = resolveHeldPlans({
      held: [held()],
      pending: [pending(true)],
      schedule: onceAt("2026-10-06", "09:00"),
      timezone: TZ,
      now: NOW,
    });
    expect(result).toMatchObject({ ok: false });
    expect(!result.ok && result.reason).toMatch(/onceAt/);
  });

  it("refuses a blank title from the sheet", () => {
    const result = resolveHeldPlans({
      held: [held()],
      pending: [pending(true)],
      schedule: onceAt("2026-10-07", "09:00"),
      edits: { title: "   ", description: "x" },
      timezone: TZ,
      now: NOW,
    });
    expect(!result.ok && result.reason).toMatch(/title/);
  });

  it("refuses a zone it cannot place, and a take with nothing held", () => {
    expect(
      resolveHeldPlans({
        held: [held()],
        pending: [pending(true)],
        schedule: onceAt("2026-10-07", "09:00", "Mars/Olympus"),
        timezone: TZ,
        now: NOW,
      })
    ).toMatchObject({ ok: false });
    expect(
      resolveHeldPlans({ held: [], pending: [], schedule: onceAt("2026-10-07", "09:00"), timezone: TZ, now: NOW })
    ).toEqual({ ok: false, reason: "no held plans" });
  });

  it("checks each plan in its own zone, falling back to the job's", () => {
    // A sibling stored without a grid zone is checked against the job's zone;
    // its grid has no tzid key, so the strict gate refuses its shape.
    const bare = sibling();
    delete (bare.schedule as { tzid?: string }).tzid;
    const result = resolveHeldPlans({
      held: [bare, held()],
      pending: [pending(false), pending(true)],
      schedule: onceAt("2026-10-07", "09:00"),
      timezone: TZ,
      now: NOW,
    });
    expect(!result.ok && result.reason).toMatch(/^plan 0: schedule/);

    // A sibling with no grid at all never reaches a commit either.
    const gridless = resolveHeldPlans({
      held: [sibling({ schedule: undefined }), held()],
      pending: [pending(false), pending(true)],
      schedule: onceAt("2026-10-07", "09:00"),
      timezone: TZ,
      now: NOW,
    });
    expect(!gridless.ok && gridless.reason).toMatch(/^plan 0: schedule: not an object/);
  });

  it("fills the columns commit leaves out before gating (heads-up, interval anchor)", () => {
    const result = resolveHeldPlans({
      held: [
        held({ preReminderMinutes: 10, preTtsText: "Dentist in ten.", persistent: true, urgency: undefined }),
      ],
      pending: [pending(true)],
      schedule: {
        type: "grid",
        days: { kind: "everyday" },
        times: { kind: "interval", everyMinutes: 60, windowStart: "09:00", windowEnd: "17:00" },
        tzid: TZ,
      },
      timezone: TZ,
      now: NOW,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.plans[0]).toMatchObject({
      preReminderMinutes: 10,
      persistent: true,
      anchorAt: NOW,
      scheduleType: "interval",
    });
  });
});
