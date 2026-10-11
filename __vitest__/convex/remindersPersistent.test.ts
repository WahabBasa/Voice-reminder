/**
 * Persistent ("Alarm: keeps ringing until you respond") is ON for every new
 * reminder, and the user's per-reminder "off" survives an edit.
 *
 * The planner's default has its own jest suite (multiReminder.test.ts); this one
 * checks the row: what `create` stores and what `update` writes back.
 */

import { beforeEach, describe, expect, test } from "vitest";
import { api, internal } from "../../convex/_generated/api";
import { CLOCK, DEVICE, Harness, allReminders, harness } from "./harness";

let t: Harness;

beforeEach(() => {
  t = harness();
});

const ROW = {
  deviceId: DEVICE,
  title: "Water",
  description: "Drink your water.",
  time: "20:00",
  date: "2026-09-02",
  frequency: "once",
  scheduleType: "once" as const,
  onceAt: 1_800_000_000_000,
  tzid: CLOCK.timezone,
};

describe("persistent on a reminder row", () => {
  test("a new reminder created persistent stores an explicit true", async () => {
    await t.mutation(internal.reminders.create, { ...ROW, persistent: true });
    const [row] = await allReminders(t);
    expect(row.persistent).toBe(true);
  });

  test("switching it off in the edit sheet stores false, and it stays off", async () => {
    const id = await t.mutation(internal.reminders.create, { ...ROW, persistent: true });

    await t.mutation(api.reminders.update, {
      id,
      deviceId: DEVICE,
      title: ROW.title,
      description: ROW.description,
      time: ROW.time,
      date: ROW.date,
      frequency: ROW.frequency,
      persistent: false,
    });

    const [row] = await allReminders(t);
    expect(row.persistent).toBe(false);
  });
});
