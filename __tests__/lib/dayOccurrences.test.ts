/**
 * Day-list membership for grid reminders (OLD-98).
 *
 * The legacy branches only ever knew one ring at one time, so a reminder that
 * rings twice a day, inside a window, or every third day needs the grid to
 * decide which days it lands on.
 */

import { type GridSchedule } from "../../convex/scheduleShape";
import {
  dayOccurrenceTimes,
  isDayFullyCompleted,
  isOccurrenceCompleted,
  occurrenceSortKey,
  occursOnDay,
} from "../../lib/dayOccurrences";
import { type Reminder, type ReminderHistory } from "../../lib/store";

// TZ is UTC in jest.config.js, so local midnight is UTC midnight.
const MONDAY = "2026-08-17";
const TUESDAY = "2026-08-18";
const THURSDAY = "2026-08-20";
const at = (dateISO: string, hour: number, minute = 0) => {
  const [year, month, day] = dateISO.split("-").map(Number);
  return Date.UTC(year, month - 1, day, hour, minute, 0, 0);
};

function reminder(schedule: GridSchedule, overrides: Partial<Reminder> = {}): Reminder {
  return {
    id: "r1",
    title: "Take your pills",
    description: "Take your pills.",
    time: "08:00",
    frequency: "daily",
    days: [],
    createdAt: "2026-08-10T00:00:00.000Z",
    schedule,
    ...overrides,
  } as Reminder;
}

describe("dayOccurrenceTimes", () => {
  it("returns every ring of a multi-time day", () => {
    const twice = reminder({
      type: "grid",
      days: { kind: "everyday" },
      times: { kind: "clock", times: ["08:00", "21:00"] },
    });

    expect(dayOccurrenceTimes(twice, MONDAY)).toEqual([at(MONDAY, 8), at(MONDAY, 21)]);
  });

  it("clamps an interval to its window", () => {
    const windowed = reminder({
      type: "grid",
      days: { kind: "everyday" },
      times: {
        kind: "interval",
        everyMinutes: 240,
        windowStart: "08:00",
        windowEnd: "22:00",
      },
    });

    expect(dayOccurrenceTimes(windowed, MONDAY)).toEqual([
      at(MONDAY, 8),
      at(MONDAY, 12),
      at(MONDAY, 16),
      at(MONDAY, 20),
    ]);
  });

  it("is empty on a day the grid does not land on", () => {
    const everyThird = reminder({
      type: "grid",
      days: { kind: "everyNDays", interval: 3, startDate: MONDAY },
      times: { kind: "clock", times: ["09:00"] },
    });

    expect(dayOccurrenceTimes(everyThird, MONDAY)).toEqual([at(MONDAY, 9)]);
    expect(dayOccurrenceTimes(everyThird, TUESDAY)).toEqual([]);
    expect(dayOccurrenceTimes(everyThird, THURSDAY)).toEqual([at(THURSDAY, 9)]);
  });

  it("never reaches back before the day the reminder was created", () => {
    const daily = reminder(
      {
        type: "grid",
        days: { kind: "everyday" },
        times: { kind: "clock", times: ["08:00"] },
      },
      { createdAt: "2026-08-18T09:00:00.000Z" }
    );

    expect(dayOccurrenceTimes(daily, MONDAY)).toEqual([]);
    expect(dayOccurrenceTimes(daily, TUESDAY)).toEqual([at(TUESDAY, 8)]);
  });

  it("is empty for a pre-grid reminder", () => {
    const legacy = { ...reminder({} as GridSchedule), schedule: undefined } as Reminder;

    expect(dayOccurrenceTimes(legacy, MONDAY)).toEqual([]);
  });
});

describe("occursOnDay / occurrenceSortKey with a grid", () => {
  const weekly = reminder({
    type: "grid",
    days: { kind: "weekdays", days: ["thu"] },
    times: { kind: "clock", times: ["08:00", "21:00"] },
  });

  it("only occurs on its weekday", () => {
    expect(occursOnDay(weekly, MONDAY)).toBe(false);
    expect(occursOnDay(weekly, THURSDAY)).toBe(true);
  });

  it("sorts on the first ring of the day, not on the legacy time field", () => {
    expect(occurrenceSortKey(weekly, THURSDAY)).toBe(at(THURSDAY, 8));
  });

  it("stops after the until boundary", () => {
    const bounded = reminder({
      type: "grid",
      days: { kind: "everyday" },
      times: { kind: "clock", times: ["08:00"] },
      until: at(MONDAY, 12),
    });

    expect(occursOnDay(bounded, MONDAY)).toBe(true);
    expect(occursOnDay(bounded, TUESDAY)).toBe(false);
  });
});

// ─── Per-occurrence completion (ring-state fix) ─────────────────────────────

describe("isOccurrenceCompleted", () => {
  const twice = reminder({
    type: "grid",
    days: { kind: "everyday" },
    times: { kind: "clock", times: ["08:00", "21:00"] },
  });
  const hist = (over: Partial<ReminderHistory>): ReminderHistory => ({
    id: "h", reminderId: "r1", reminderTitle: "T", status: "completed",
    timestamp: new Date(at(MONDAY, 10)).toISOString(), ...over,
  });

  it("matches only the occurrence a precise (scheduledFor) row names", () => {
    const h = [hist({ scheduledFor: at(MONDAY, 8) })];
    expect(isOccurrenceCompleted(twice, h, at(MONDAY, 8))).toBe(true);
    expect(isOccurrenceCompleted(twice, h, at(MONDAY, 21))).toBe(false);
  });

  it("treats a legacy row (no scheduledFor) as whole-day for repeaters", () => {
    const h = [hist({})];
    expect(isOccurrenceCompleted(twice, h, at(MONDAY, 8))).toBe(true);
    expect(isOccurrenceCompleted(twice, h, at(MONDAY, 21))).toBe(true);
    expect(isOccurrenceCompleted(twice, h, at(TUESDAY, 8))).toBe(false);
  });

  it("a legacy row completes a one-off outright, and ignores other statuses/ids", () => {
    const off = { ...twice, frequency: "once" } as Reminder;
    expect(isOccurrenceCompleted(off, [hist({})], at(TUESDAY, 8))).toBe(true);
    expect(isOccurrenceCompleted(twice, [hist({ status: "missed" })], at(MONDAY, 8))).toBe(false);
    expect(isOccurrenceCompleted(twice, [hist({ reminderId: "other" })], at(MONDAY, 8))).toBe(false);
  });
});

describe("isDayFullyCompleted", () => {
  const twice = reminder({
    type: "grid",
    days: { kind: "everyday" },
    times: { kind: "clock", times: ["08:00", "21:00"] },
  });
  const hist = (over: Partial<ReminderHistory>): ReminderHistory => ({
    id: "h", reminderId: "r1", reminderTitle: "T", status: "completed",
    timestamp: new Date(at(MONDAY, 10)).toISOString(), ...over,
  });

  it("stays incomplete until every occurrence of the day is completed", () => {
    expect(isDayFullyCompleted(twice, [hist({ scheduledFor: at(MONDAY, 8) })], MONDAY)).toBe(false);
    const both = [hist({ id: "a", scheduledFor: at(MONDAY, 8) }), hist({ id: "b", scheduledFor: at(MONDAY, 21) })];
    expect(isDayFullyCompleted(twice, both, MONDAY)).toBe(true);
  });

  it("a legacy whole-day completion still finishes the day", () => {
    expect(isDayFullyCompleted(twice, [hist({})], MONDAY)).toBe(true);
  });

  it("falls back to the day-level rule for a pre-grid reminder", () => {
    const legacy = { ...reminder({} as GridSchedule), schedule: undefined, frequency: "daily" } as Reminder;
    expect(isDayFullyCompleted(legacy, [hist({})], MONDAY)).toBe(true);
    expect(isDayFullyCompleted(legacy, [], MONDAY)).toBe(false);
  });
});
