/**
 * "When should I remind you?" — the quick choices' time math (lib/needsTime.ts).
 *
 * jest runs in UTC (jest.config.js), so every case names its zone: the answer
 * must be the user's wall clock, not the runtime's.
 */
import {
  EVENING_TIME,
  MORNING_TIME,
  pickATimeLabel,
  QUICK_CHOICES,
  draftReminderFor,
  needsTimeFocus,
  nextCalendarDay,
  onceGrid,
  quickChoiceTime,
  wallClockIn,
} from "../../lib/needsTime";
import type { PendingPlan } from "../../lib/pendingTakes";

const DUBAI = "Asia/Dubai"; // UTC+4, no DST
const NEW_YORK = "America/New_York";

/** The instant a Dubai wall clock reads `hh:mm` on 2026-10-06. */
const dubai = (hh: number, mm = 0) => Date.UTC(2026, 9, 6, hh - 4, mm);

describe("the choices the card offers", () => {
  it("three quick answers, then Pick a time…", () => {
    expect(QUICK_CHOICES.map((c) => c.label)).toEqual([
      "In 1 hour",
      "This evening",
      "Tomorrow morning",
    ]);
    expect(pickATimeLabel()).toBe("Pick a time…");
    expect([EVENING_TIME, MORNING_TIME]).toEqual(["18:00", "09:00"]);
  });
});

describe("wallClockIn", () => {
  it("reads the instant on the named zone's clock, not the runtime's", () => {
    expect(wallClockIn(dubai(14, 5), DUBAI)).toEqual({ date: "2026-10-06", time: "14:05" });
    expect(wallClockIn(dubai(14, 5), NEW_YORK)).toEqual({ date: "2026-10-06", time: "06:05" });
  });

  it("reads midnight as 00, never 24", () => {
    expect(wallClockIn(Date.UTC(2026, 9, 6, 20, 0), DUBAI)).toEqual({
      date: "2026-10-07",
      time: "00:00",
    });
  });

  it("falls back to the runtime's own clock for a zone Intl does not know", () => {
    // The runtime here is UTC.
    expect(wallClockIn(Date.UTC(2026, 9, 6, 3, 7), "Mars/Olympus")).toEqual({
      date: "2026-10-06",
      time: "03:07",
    });
  });
});

describe("nextCalendarDay", () => {
  it("rolls months and years", () => {
    expect(nextCalendarDay("2026-10-06")).toBe("2026-10-07");
    expect(nextCalendarDay("2026-10-31")).toBe("2026-11-01");
    expect(nextCalendarDay("2026-12-31")).toBe("2027-01-01");
    expect(nextCalendarDay("2028-02-28")).toBe("2028-02-29");
  });
});

describe("quickChoiceTime", () => {
  it("In 1 hour: an hour on the user's clock", () => {
    expect(quickChoiceTime("in_1_hour", dubai(14, 20), DUBAI)).toEqual({
      id: "in_1_hour",
      label: "In 1 hour",
      date: "2026-10-06",
      time: "15:20",
    });
  });

  it("In 1 hour crosses midnight onto tomorrow's date", () => {
    expect(quickChoiceTime("in_1_hour", dubai(23, 30), DUBAI)).toMatchObject({
      date: "2026-10-07",
      time: "00:30",
    });
  });

  it("This evening: 18:00 today while 18:00 is still ahead", () => {
    expect(quickChoiceTime("this_evening", dubai(9), DUBAI)).toMatchObject({
      date: "2026-10-06",
      time: "18:00",
    });
    expect(quickChoiceTime("this_evening", dubai(17, 59), DUBAI)).toMatchObject({
      time: "18:00",
    });
  });

  it("This evening after 18:00: an hour from now instead", () => {
    expect(quickChoiceTime("this_evening", dubai(18, 0), DUBAI)).toMatchObject({
      label: "This evening",
      date: "2026-10-06",
      time: "19:00",
    });
    expect(quickChoiceTime("this_evening", dubai(21, 45), DUBAI)).toMatchObject({
      time: "22:45",
    });
  });

  it("Tomorrow morning: 09:00 on the user's tomorrow, whatever UTC thinks", () => {
    // 01:30 in Dubai on the 7th is still the 6th in UTC.
    const lateNight = Date.UTC(2026, 9, 6, 21, 30);
    expect(quickChoiceTime("tomorrow_morning", lateNight, DUBAI)).toEqual({
      id: "tomorrow_morning",
      label: "Tomorrow morning",
      date: "2026-10-08",
      time: "09:00",
    });
    // The same instant is the evening of the 6th in New York.
    expect(quickChoiceTime("tomorrow_morning", lateNight, NEW_YORK)).toMatchObject({
      date: "2026-10-07",
      time: "09:00",
    });
  });

  it("In 1 hour is real time across a DST change", () => {
    // New York falls back at 02:00 EDT on 2026-11-01: 01:30 EDT + 1h = 01:30 EST.
    const beforeFallBack = Date.UTC(2026, 10, 1, 5, 30); // 01:30 EDT
    expect(quickChoiceTime("in_1_hour", beforeFallBack, NEW_YORK)).toMatchObject({
      date: "2026-11-01",
      time: "01:30",
    });
    // Springs forward at 02:00 EST on 2026-03-08: 01:30 EST + 1h = 03:30 EDT.
    const beforeSpring = Date.UTC(2026, 2, 8, 6, 30); // 01:30 EST
    expect(quickChoiceTime("in_1_hour", beforeSpring, NEW_YORK)).toMatchObject({
      date: "2026-03-08",
      time: "03:30",
    });
  });
});

describe("onceGrid", () => {
  it("is the exact grid the server's strict gate accepts for a one-off", () => {
    expect(onceGrid("2026-10-07", "09:00", DUBAI)).toEqual({
      type: "grid",
      days: { kind: "date", date: "2026-10-07" },
      times: { kind: "clock", times: ["09:00"] },
      tzid: DUBAI,
    });
  });
});

const plan = (over: Partial<PendingPlan> = {}): PendingPlan => ({
  title: "Call the dentist",
  description: "Ring tandläkaren.",
  frequency: "once",
  needsTime: true,
  ...over,
});

describe("needsTimeFocus", () => {
  it("is the plan waiting for a time, with the rest of the take beside it", () => {
    const pills = plan({ title: "Pills", needsTime: false, frequency: "daily" });
    const dentist = plan();
    expect(needsTimeFocus([pills, dentist])).toEqual({ plan: dentist, others: [pills] });
  });

  it("falls back to the first plan when none is flagged", () => {
    const a = plan({ needsTime: false, title: "A" });
    const b = plan({ needsTime: false, title: "B" });
    expect(needsTimeFocus([a, b])).toEqual({ plan: a, others: [b] });
  });

  it("is null with nothing to show", () => {
    expect(needsTimeFocus(undefined)).toBeNull();
    expect(needsTimeFocus([])).toBeNull();
  });
});

describe("draftReminderFor — what Pick a time… opens", () => {
  it("the kept reminder, filled in, as a one-off an hour from now", () => {
    const draft = draftReminderFor("take_1", plan({ emoji: "🦷" }), dubai(14, 20), DUBAI);
    expect(draft).toEqual({
      id: "needs-time:take_1",
      title: "Call the dentist",
      description: "Ring tandläkaren.",
      emoji: "🦷",
      time: "15:20",
      date: "2026-10-06",
      frequency: "once",
      days: [],
      schedule: onceGrid("2026-10-06", "15:20", DUBAI),
      tzid: DUBAI,
      createdAt: new Date(dubai(14, 20)).toISOString(),
    });
  });

  it("leaves the emoji out when the take had none", () => {
    expect(draftReminderFor("t", plan(), dubai(9), DUBAI)).not.toHaveProperty("emoji");
  });
});
