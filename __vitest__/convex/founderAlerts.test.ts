/**
 * Founder alerts (OLD-135) against a real (mocked) Convex: the hello upsert and
 * throttle, the seed, the take-outcome log the creation-job transitions feed,
 * the daily summary and the prune. Emails are only asserted to be SCHEDULED
 * (with their subject/body); the shaping itself is unit-tested in
 * __tests__/convex/founderAlertsEmail.test.ts.
 */

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api, internal } from "../../convex/_generated/api";
import type { Doc } from "../../convex/_generated/dataModel";
import { deviceTagFor } from "../../convex/founderAlertsEmail";
import {
  CLOCK,
  DAY,
  DEVICE,
  HOUR,
  Harness,
  MINUTE,
  commitPlan,
  harness,
  insertJob,
  scheduledOf,
} from "./harness";

const SEND = "founderAlerts:sendEmail";
const RECORD = "founderAlerts:recordOutcome";
const NEW_ID = "0123456789abcdef0123456789abcdef";
const T0 = Date.UTC(2026, 9, 5, 12, 0, 0);

let t: Harness;

beforeEach(() => {
  t = harness();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(T0);
});

afterEach(() => {
  vi.useRealTimers();
});

function at(ms: number) {
  vi.setSystemTime(ms);
}

async function devices(): Promise<Doc<"devices">[]> {
  return await t.run(async (ctx) => await ctx.db.query("devices").collect());
}

async function outcomes(): Promise<Doc<"takeOutcomes">[]> {
  return await t.run(async (ctx) => await ctx.db.query("takeOutcomes").collect());
}

async function emails(): Promise<Array<{ subject: string; body: string }>> {
  return (await scheduledOf(t, SEND)).map((row) => row.args[0] as { subject: string; body: string });
}

const HELLO = {
  deviceId: NEW_ID,
  buildNumber: "8",
  updateId: "upd-1",
  locale: "sv-SE",
  timezone: "Europe/Stockholm",
  iosVersion: "26.0",
};

async function hello(over: Record<string, unknown> = {}) {
  return await t.mutation(api.devices.hello, { ...HELLO, ...over });
}

// ─── hello ───────────────────────────────────────────────────────────────────

describe("devices.hello", () => {
  test("a genuinely new install is inserted and emails the founder once", async () => {
    expect(await hello()).toEqual({ result: "new" });

    const rows = await devices();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      deviceId: NEW_ID,
      deviceTag: await deviceTagFor(NEW_ID),
      firstSeenAt: T0,
      lastSeenAt: T0,
      seeded: false,
      buildNumber: "8",
      locale: "sv-SE",
      timezone: "Europe/Stockholm",
      iosVersion: "26.0",
    });

    const sent = await emails();
    expect(sent).toHaveLength(1);
    expect(sent[0].subject).toBe("Remi: new device (Europe/Stockholm, sv-SE)");
    expect(sent[0].body).not.toContain(NEW_ID);
  });

  test("throttles: a second hello inside the hour writes nothing and emails nothing", async () => {
    await hello();
    at(T0 + 59 * MINUTE);
    expect(await hello({ buildNumber: "9" })).toEqual({ result: "throttled" });

    const [row] = await devices();
    expect(row.lastSeenAt).toBe(T0);
    expect(row.buildNumber).toBe("8");
    expect(await emails()).toHaveLength(1);
  });

  test("after the hour it refreshes lastSeenAt and the runtime fields, without a new email", async () => {
    await hello();
    at(T0 + HOUR);
    expect(await hello({ buildNumber: "9", locale: undefined })).toEqual({ result: "updated" });

    const [row] = await devices();
    expect(row.lastSeenAt).toBe(T0 + HOUR);
    expect(row.firstSeenAt).toBe(T0);
    expect(row.buildNumber).toBe("9");
    // An absent field never erases what was stored.
    expect(row.locale).toBe("sv-SE");
    expect(await emails()).toHaveLength(1);
  });

  test("an install with reminders from before the table existed is known, not new", async () => {
    await t.run(async (ctx) => {
      await ctx.db.insert("reminders", {
        deviceId: NEW_ID,
        title: "Water",
        description: "Drink water",
        time: "20:00",
        frequency: "once",
        createdAt: T0 - 30 * DAY,
      });
    });
    expect(await hello()).toEqual({ result: "known" });
    expect((await devices())[0].seeded).toBe(true);
    expect(await emails()).toHaveLength(0);
  });

  test("cleans and caps client strings", async () => {
    await hello({ locale: "  sv-SE\n", timezone: "x".repeat(500) });
    const [row] = await devices();
    expect(row.locale).toBe("sv-SE");
    expect(row.timezone).toHaveLength(64);
  });

  test("rejects an invalid deviceId", async () => {
    await expect(hello({ deviceId: "" })).rejects.toThrow(/invalid deviceId/);
    await expect(hello({ deviceId: "a".repeat(200) })).rejects.toThrow(/invalid deviceId/);
    expect(await devices()).toHaveLength(0);
  });
});

// ─── seed ────────────────────────────────────────────────────────────────────

describe("devices.seedFromReminders", () => {
  test("marks every pre-existing install seeded, chaining through all three tables", async () => {
    await t.run(async (ctx) => {
      await ctx.db.insert("reminders", {
        deviceId: "dev_r",
        title: "a",
        description: "a",
        time: "08:00",
        frequency: "daily",
        createdAt: 1000,
      });
      await ctx.db.insert("feedback", {
        clientId: "fb",
        deviceId: "dev_f",
        text: "hi",
        createdAt: 2000,
        receivedAt: 2000,
        status: "received",
        updatedAt: 2000,
      });
    });
    await insertJob(t, { deviceId: "dev_j", createdAt: 3000, updatedAt: 3000 });

    const first = await t.mutation(internal.devices.seedFromReminders, {});
    expect(first).toMatchObject({ phase: "reminders", inserted: 1, done: false });

    // Drive the self-scheduled chain to the end.
    await t.finishAllScheduledFunctions(vi.runAllTimers);

    const rows = await devices();
    expect(rows.map((d) => d.deviceId).sort()).toEqual(["dev_f", "dev_j", "dev_r"]);
    expect(rows.every((d) => d.seeded)).toBe(true);
    expect(rows.find((d) => d.deviceId === "dev_r")!.firstSeenAt).toBe(1000);
    expect(await emails()).toHaveLength(0);
  });

  test("is idempotent: a second run inserts nothing", async () => {
    await t.run(async (ctx) => {
      await ctx.db.insert("reminders", {
        deviceId: "dev_r",
        title: "a",
        description: "a",
        time: "08:00",
        frequency: "daily",
        createdAt: 1000,
      });
    });
    await t.mutation(internal.devices.seedFromReminders, { phase: "reminders" });
    const again = await t.mutation(internal.devices.seedFromReminders, { phase: "reminders" });
    expect(again.inserted).toBe(0);
    expect(await devices()).toHaveLength(1);
  });
});

// ─── outcomes via the creation-job transitions ───────────────────────────────

describe("take outcomes", () => {
  async function transcribed(over: Partial<Doc<"creationJobs">> = {}) {
    return await insertJob(t, { status: "transcribed", deviceId: NEW_ID, ...over });
  }

  /**
   * A committed job written straight in, with `n` real reminder rows. Going
   * through `commit` would also queue its own recordOutcome (and TTS), which
   * convex-test may run in the background while the test calls it by hand.
   */
  async function committed(creationId: string, n: number) {
    const reminderIds = await t.run(async (ctx) => {
      const ids = [];
      for (let i = 0; i < n; i++) {
        ids.push(
          await ctx.db.insert("reminders", {
            deviceId: NEW_ID,
            creationId,
            title: `r${i}`,
            description: "d",
            time: "20:00",
            frequency: "once",
            createdAt: T0,
          })
        );
      }
      return ids;
    });
    return await insertJob(t, { status: "committed", deviceId: NEW_ID, creationId, reminderIds });
  }

  test("commit schedules exactly one recordOutcome", async () => {
    const { jobId } = await transcribed();
    await t.mutation(internal.creationJobs.commit, { jobId, generation: 1, plans: [commitPlan()] });
    const records = await scheduledOf(t, RECORD);
    expect(records).toHaveLength(1);
    expect(records[0].args[0]).toEqual({ jobId, status: "committed" });
  });

  test("a worker failure and a stale-sweep failure each schedule one recordOutcome", async () => {
    const { jobId } = await transcribed();
    await t.mutation(internal.creationJobs.casPatch, {
      jobId,
      generation: 1,
      expectStatus: ["transcribed"],
      patch: { status: "failed", errorCode: "unparseable" },
    });

    const { jobId: stuck } = await insertJob(t, { deviceId: NEW_ID, updatedAt: T0 - 10 * MINUTE });
    await t.mutation(internal.creationJobs.sweepStale, {});

    const records = (await scheduledOf(t, RECORD)).map((r) => r.args[0]);
    expect(records).toEqual([
      { jobId, status: "failed", errorCode: "unparseable" },
      { jobId: stuck, status: "failed", errorCode: "internal" },
    ]);
  });

  test("a non-terminal casPatch schedules nothing", async () => {
    const { jobId } = await insertJob(t, { deviceId: NEW_ID });
    await t.mutation(internal.creationJobs.casPatch, {
      jobId,
      generation: 1,
      expectStatus: ["pending"],
      patch: { status: "transcribed", transcript: "x" },
    });
    expect(await scheduledOf(t, RECORD)).toHaveLength(0);
  });

  test("a new device's first committed take is logged and announced as worked", async () => {
    await hello();
    const { jobId } = await committed("take_1", 2);
    await t.mutation(internal.founderAlerts.recordOutcome, { jobId, status: "committed" });

    const [row] = await outcomes();
    expect(row).toMatchObject({
      creationId: "take_1",
      deviceTag: await deviceTagFor(NEW_ID),
      status: "committed",
      reminderCount: 2,
      newDevice: true,
      firstTake: true,
      buildNumber: "8",
      timezone: CLOCK.timezone,
      at: T0,
    });
    expect(row).not.toHaveProperty("deviceId");

    const sent = await emails();
    expect(sent.map((e) => e.subject)).toEqual([
      "Remi: new device (Europe/Stockholm, sv-SE)",
      "Remi: first take worked — 2 reminders (new user)",
    ]);
  });

  test("a second committed take is logged but silent", async () => {
    await hello();
    for (const creationId of ["take_1", "take_2"]) {
      const { jobId } = await transcribed({ creationId });
      await t.mutation(internal.founderAlerts.recordOutcome, { jobId, status: "committed" });
    }
    const rows = await outcomes();
    expect(rows.map((r) => r.firstTake)).toEqual([true, false]);
    // new-device + first-take-worked only.
    expect(await emails()).toHaveLength(2);
  });

  test("a failure always emails, with errorDetail read defensively off the job", async () => {
    await hello();
    const { jobId } = await transcribed({ status: "failed", errorCode: "unparseable" });
    // OLD-130's field, written straight in — this table version may not declare it.
    await t.run(async (ctx) => {
      await (ctx.db as any).patch(jobId, { errorDetail: "not_understood" }).catch(() => {});
    });
    await t.mutation(internal.founderAlerts.recordOutcome, {
      jobId,
      status: "failed",
      errorCode: "unparseable",
    });

    const [row] = await outcomes();
    expect(row).toMatchObject({ status: "failed", errorCode: "unparseable", newDevice: true, firstTake: true });
    const subject = (await emails()).at(-1)!.subject;
    expect(subject).toMatch(/^Remi: take failed — unparseable(\/not_understood)? \(new user, first take\)$/);
  });

  test("a seeded install's failure emails without the new-user flag", async () => {
    await t.run(async (ctx) => {
      await ctx.db.insert("devices", {
        deviceId: NEW_ID,
        deviceTag: await deviceTagFor(NEW_ID),
        firstSeenAt: 0,
        lastSeenAt: 0,
        seeded: true,
      });
    });
    const { jobId } = await transcribed({ status: "failed", errorCode: "stt_failed" });
    await t.mutation(internal.founderAlerts.recordOutcome, { jobId, status: "failed", errorCode: "stt_failed" });
    expect((await emails()).map((e) => e.subject)).toEqual(["Remi: take failed — stt_failed"]);
  });

  test("a take from an install that never said hello registers it as new", async () => {
    const { jobId } = await committed("take_1", 1);
    await t.mutation(internal.founderAlerts.recordOutcome, { jobId, status: "committed" });

    const [device] = await devices();
    expect(device).toMatchObject({ deviceId: NEW_ID, seeded: false, lastSeenAt: 0, firstSeenAt: T0 });
    expect((await emails()).map((e) => e.subject)).toEqual([
      "Remi: first take worked — 1 reminder (new user)",
    ]);
    // Its next hello is not throttled and is not a second "new device".
    expect(await hello()).toEqual({ result: "updated" });
    expect(await emails()).toHaveLength(1);
  });

  test("a missing job records nothing", async () => {
    const { jobId } = await transcribed();
    await t.run(async (ctx) => await ctx.db.delete(jobId));
    await t.mutation(internal.founderAlerts.recordOutcome, { jobId, status: "committed" });
    expect(await outcomes()).toHaveLength(0);
  });
});

// ─── daily summary + prune ───────────────────────────────────────────────────

async function insertOutcome(over: Partial<Doc<"takeOutcomes">>) {
  await t.run(async (ctx) => {
    await ctx.db.insert("takeOutcomes", {
      creationId: "c",
      deviceTag: "aaaaaaaa",
      status: "committed",
      newDevice: false,
      firstTake: false,
      at: T0,
      ...over,
    });
  });
}

describe("founderAlerts.dailySummary", () => {
  test("a quiet day still sends a one-line email", async () => {
    const res = await t.mutation(internal.founderAlerts.dailySummary, { now: T0 });
    expect(res.subject).toMatch(/quiet day$/);
    expect(await emails()).toHaveLength(1);
  });

  test("counts new and active devices and takes by error code over the trailing 24h", async () => {
    await hello(); // new, active
    await t.run(async (ctx) => {
      await ctx.db.insert("devices", {
        deviceId: "old",
        deviceTag: "bbbbbbbb",
        firstSeenAt: T0 - 2 * HOUR,
        lastSeenAt: 0,
        seeded: true,
      });
    });
    await insertOutcome({ deviceTag: "cccccccc", status: "committed" });
    await insertOutcome({ deviceTag: "cccccccc", status: "failed", errorCode: "stt_failed" });
    await insertOutcome({
      deviceTag: await deviceTagFor(NEW_ID),
      status: "failed",
      errorCode: "unparseable",
      newDevice: true,
    });
    // Outside the window.
    await insertOutcome({ status: "failed", errorCode: "internal", at: T0 - 2 * DAY });

    const res = await t.mutation(internal.founderAlerts.dailySummary, { now: T0 + HOUR });
    expect(res.subject).toBe("Remi daily 2026-10-04: 1 new, 2 active, 3 takes (2 failed)");
    const body = (await emails()).at(-1)!.body;
    expect(body).toContain("stt_failed: 1");
    expect(body).toContain("unparseable: 1");
    expect(body).not.toContain("internal");
    expect(body).toContain("Failed takes from new devices: 1");
    expect(body).not.toContain(NEW_ID);
  });
});

describe("founderAlerts.pruneOutcomes", () => {
  test("deletes rows older than 30 days and keeps the rest", async () => {
    await insertOutcome({ creationId: "old", at: T0 - 31 * DAY });
    await insertOutcome({ creationId: "young", at: T0 - 29 * DAY });
    expect(await t.mutation(internal.founderAlerts.pruneOutcomes, {})).toEqual({ deleted: 1 });
    expect((await outcomes()).map((r) => r.creationId)).toEqual(["young"]);
  });
});
