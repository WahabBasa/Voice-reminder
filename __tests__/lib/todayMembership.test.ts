/**
 * Today's Overdue group (OLD-118).
 *
 * A one-off is owed until it is ticked or deleted, so one that rang on an
 * earlier day has to keep showing up somewhere — it still eats a slot against
 * the free cap. These lock the split: Overdue takes every passed-ring one-off,
 * Today keeps the day's own schedule, and nothing lands in both.
 */

import { type GridSchedule } from "../../convex/scheduleShape";
import { todayISO } from "../../lib/dayOccurrences";
import { type Reminder, type ReminderHistory } from "../../lib/store";
import {
  groupTodayReminders,
  overdueRingTime,
  overdueSubtitle,
} from "../../lib/todayMembership";

// TZ is UTC in jest.config.js, so local midnight is UTC midnight.
const TODAY = "2026-08-29";
const EARLIER = "2026-08-25";
const LATER = "2026-08-31";

const at = (dateISO: string, hour: number, minute = 0) => {
  const [year, month, day] = dateISO.split("-").map(Number);
  return Date.UTC(year, month - 1, day, hour, minute, 0, 0);
};

const NOW = at(TODAY, 12, 0);

function base(overrides: Partial<Reminder> = {}): Reminder {
  return {
    id: "r1",
    title: "Call the dentist",
    description: "Call the dentist.",
    time: "09:00",
    frequency: "once",
    days: [],
    createdAt: "2026-08-01T00:00:00.000Z",
    ...overrides,
  } as Reminder;
}

/** A dated one-off the way the store holds one: legacy fields plus the grid. */
function onceOn(dateISO: string, time: string, overrides: Partial<Reminder> = {}): Reminder {
  const schedule: GridSchedule = {
    type: "grid",
    days: { kind: "date", date: dateISO },
    times: { kind: "clock", times: [time] },
  };
  return base({ frequency: "once", date: dateISO, time, schedule, ...overrides });
}

function daily(time: string, overrides: Partial<Reminder> = {}): Reminder {
  const schedule: GridSchedule = {
    type: "grid",
    days: { kind: "everyday" },
    times: { kind: "clock", times: [time] },
  };
  return base({ frequency: "daily", time, schedule, ...overrides });
}

function completedEntry(reminderId: string, whenMs: number): ReminderHistory {
  return {
    id: `h-${reminderId}`,
    reminderId,
    reminderTitle: "Call the dentist",
    timestamp: new Date(whenMs).toISOString(),
    status: "completed",
  };
}

const ids = (reminders: Reminder[]) => reminders.map((r) => r.id);

describe("groupTodayReminders", () => {
  it("surfaces a one-off that rang on an earlier day, and keeps it out of Today", () => {
    const stale = onceOn(EARLIER, "15:42");

    const { overdue, today } = groupTodayReminders([stale], [], TODAY, NOW);

    expect(ids(overdue)).toEqual(["r1"]);
    expect(today).toEqual([]);
  });

  it("drops a ticked one-off from both groups", () => {
    const ticked = onceOn(EARLIER, "15:42");
    const history = [completedEntry("r1", at(EARLIER, 16))];

    const { overdue, today } = groupTodayReminders([ticked], history, TODAY, NOW);

    expect(overdue).toEqual([]);
    expect(today).toEqual([]);
  });

  it("leaves a one-off dated today but still ahead of now in Today only", () => {
    const upcoming = onceOn(TODAY, "18:00");

    const { overdue, today } = groupTodayReminders([upcoming], [], TODAY, NOW);

    expect(overdue).toEqual([]);
    expect(ids(today)).toEqual(["r1"]);
  });

  it("keeps a daily in Today only, even once its time has passed", () => {
    const morning = daily("08:00");

    const { overdue, today } = groupTodayReminders([morning], [], TODAY, NOW);

    expect(overdue).toEqual([]);
    expect(ids(today)).toEqual(["r1"]);
  });

  it("moves today's own one-off to Overdue once its time has passed", () => {
    const passed = onceOn(TODAY, "09:00");

    const { overdue, today } = groupTodayReminders([passed], [], TODAY, NOW);

    expect(ids(overdue)).toEqual(["r1"]);
    expect(today).toEqual([]);
  });

  it("orders Overdue by ring time, earliest first", () => {
    const items = [
      onceOn(TODAY, "09:00", { id: "today-9am" }),
      onceOn(EARLIER, "15:42", { id: "earlier" }),
      onceOn(TODAY, "11:30", { id: "today-1130" }),
    ];

    const { overdue } = groupTodayReminders(items, [], TODAY, NOW);

    expect(ids(overdue)).toEqual(["earlier", "today-9am", "today-1130"]);
  });

  it("does not hide a one-off dated a later day", () => {
    const future = onceOn(LATER, "09:00");

    const { overdue, today } = groupTodayReminders([future], [], TODAY, NOW);

    expect(overdue).toEqual([]);
    expect(today).toEqual([]);
  });

  it("hides a repeater already ticked for today", () => {
    const morning = daily("08:00");
    const history = [completedEntry("r1", at(TODAY, 8, 5))];

    const { overdue, today } = groupTodayReminders([morning], history, TODAY, NOW);

    expect(overdue).toEqual([]);
    expect(today).toEqual([]);
  });
});

describe("overdueRingTime", () => {
  it("is the local date+time the one-off was meant to ring", () => {
    expect(overdueRingTime(onceOn(EARLIER, "15:42"), [], NOW)).toBe(at(EARLIER, 15, 42));
  });
});

describe("overdueSubtitle", () => {
  it("shows the original date next to the clock time", () => {
    const subtitle = overdueSubtitle(onceOn(EARLIER, "15:42"), [], NOW, { hour12: true });

    // Day/month order follows the device locale; the composition is what matters.
    expect(subtitle).toMatch(/^(Aug 25|25 Aug) · 3:42 pm$/);
  });

  it("respects a 24-hour dial", () => {
    const subtitle = overdueSubtitle(onceOn(EARLIER, "15:42"), [], NOW, { hour12: false });

    expect(subtitle).toMatch(/^(Aug 25|25 Aug) · 15:42$/);
  });

  it("says nothing rather than a wrong date when the ring time is unreadable", () => {
    expect(overdueSubtitle(onceOn(EARLIER, "half past"), [], NOW)).toBe("");
  });
});

describe("defaults", () => {
  it("falls back to the wall clock when no nowMs is passed", () => {
    const longPast = onceOn("2020-01-02", "08:00");

    const { overdue, today } = groupTodayReminders([longPast], [], todayISO());

    expect(ids(overdue)).toEqual(["r1"]);
    expect(today).toEqual([]);
    expect(overdueRingTime(longPast, [])).toBe(at("2020-01-02", 8));
    expect(overdueSubtitle(longPast, [])).toContain(" · ");
  });
});
