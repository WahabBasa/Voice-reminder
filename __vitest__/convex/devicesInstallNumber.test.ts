/**
 * Reinstalls and test phones (1.0.6): `hello` stores the app's Keychain
 * install counter (`installNumber`), only undefined or 1 is a genuinely new
 * install, 2+ gets a "Reinstall #N" email instead; `devices.markTest` silences
 * every founder email for one device while its takes are still logged. Older
 * builds send no installNumber and behave exactly as before.
 */

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api, internal } from "../../convex/_generated/api";
import type { Doc } from "../../convex/_generated/dataModel";
import { deviceTagFor } from "../../convex/founderAlertsEmail";
import { buildTakeStoryEmail } from "../../convex/takeStoryEmail";
import { HOUR, Harness, harness, insertJob, scheduledJobs, scheduledOf } from "./harness";

const SEND = "founderAlerts:sendEmail";
const SEND_TAKE = "takeEmailActions:sendTakeEmail";
const DELIVER = "founderAlerts:deliverTakeEmail";
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

type SentEmail = { subject: string; body: string };

async function emails(): Promise<SentEmail[]> {
  const out: SentEmail[] = [];
  for (const row of await scheduledJobs(t)) {
    if (row.name === SEND_TAKE) {
      out.push(buildTakeStoryEmail(JSON.parse((row.args[0] as { story: string }).story)));
    } else if (row.name === SEND) {
      const email = row.args[0] as SentEmail;
      if (!/^Remi [✅⚠❌⏳]/u.test(email.subject)) out.push(email);
    }
  }
  return out;
}

async function devices(): Promise<Doc<"devices">[]> {
  return await t.run(async (ctx) => await ctx.db.query("devices").collect());
}

async function outcomes(): Promise<Doc<"takeOutcomes">[]> {
  return await t.run(async (ctx) => await ctx.db.query("takeOutcomes").collect());
}

const HELLO = {
  deviceId: NEW_ID,
  buildNumber: "8",
  locale: "sv-SE",
  timezone: "Europe/Stockholm",
  iosVersion: "26.0",
};

async function hello(over: Record<string, unknown> = {}) {
  return await t.mutation(api.devices.hello, { ...HELLO, ...over });
}

/** A committed take with one real reminder, written straight in. */
async function committed(creationId: string) {
  const reminderId = await t.run(async (ctx) =>
    ctx.db.insert("reminders", {
      deviceId: NEW_ID,
      creationId,
      title: "r",
      description: "d",
      time: "20:00",
      frequency: "once",
      createdAt: T0,
    })
  );
  return await insertJob(t, {
    status: "committed",
    deviceId: NEW_ID,
    creationId,
    reminderIds: [reminderId],
  });
}

async function markTest(isTest = true) {
  return await t.mutation(internal.devices.markTest, {
    deviceTag: await deviceTagFor(NEW_ID),
    isTest,
  });
}

// ─── hello ───────────────────────────────────────────────────────────────────

describe("hello with installNumber", () => {
  test("an older build (no installNumber) is a new device, exactly as before", async () => {
    expect(await hello()).toEqual({ result: "new" });
    const [row] = await devices();
    expect(row).not.toHaveProperty("installNumber");
    expect((await emails()).map((e) => e.subject)).toEqual(["Remi: new device (Europe/Stockholm, sv-SE)"]);
  });

  test("install 1 is a new device and is stored", async () => {
    expect(await hello({ installNumber: 1 })).toEqual({ result: "new" });
    expect((await devices())[0].installNumber).toBe(1);
    expect((await emails()).map((e) => e.subject)).toEqual(["Remi: new device (Europe/Stockholm, sv-SE)"]);
  });

  test("install 2+ is a reinstall: no new-device email, a Reinstall #N one instead", async () => {
    expect(await hello({ installNumber: 3 })).toEqual({ result: "reinstall" });
    const [row] = await devices();
    expect(row).toMatchObject({ installNumber: 3, seeded: false });
    const sent = await emails();
    expect(sent.map((e) => e.subject)).toEqual(["Remi: reinstall #3 (Europe/Stockholm, sv-SE)"]);
    expect(sent[0].body).not.toContain(NEW_ID);
  });

  test("an out-of-range installNumber is ignored, so it reads as an older build", async () => {
    expect(await hello({ installNumber: 1000 })).toEqual({ result: "new" });
    expect(await devices()).toEqual([expect.not.objectContaining({ installNumber: expect.anything() })]);
  });

  test("a reinstall shares the hourly email cap with new devices", async () => {
    for (let i = 0; i < 20; i++) {
      await hello({ deviceId: `dev_${i}` });
    }
    expect(await hello({ installNumber: 2 })).toEqual({ result: "reinstall" });
    expect(await emails()).toHaveLength(20);
  });

  test("a later hello fills installNumber in on an existing row, without an email", async () => {
    // A take from the install registered it before its hello landed.
    await t.run(async (ctx) => {
      await ctx.db.insert("devices", {
        deviceId: NEW_ID,
        deviceTag: await deviceTagFor(NEW_ID),
        firstSeenAt: T0,
        lastSeenAt: 0,
        seeded: false,
      });
    });
    expect(await hello({ installNumber: 2 })).toEqual({ result: "updated" });
    expect((await devices())[0].installNumber).toBe(2);
    expect(await emails()).toHaveLength(0);
  });

  test("a hello without installNumber never erases a stored one", async () => {
    await hello({ installNumber: 2 });
    vi.setSystemTime(T0 + HOUR);
    await hello();
    expect((await devices())[0].installNumber).toBe(2);
  });
});

// ─── take outcomes ───────────────────────────────────────────────────────────

describe("take outcomes by installNumber", () => {
  for (const installNumber of [undefined, 1]) {
    test(`install ${installNumber ?? "(old build)"}: the first worked take is a new device's`, async () => {
      await hello(installNumber === undefined ? {} : { installNumber });
      const { jobId } = await committed("take_1");
      await t.mutation(internal.founderAlerts.recordOutcome, { jobId, status: "committed" });
      expect((await outcomes())[0]).toMatchObject({ newDevice: true, firstTake: true });
      expect(await scheduledOf(t, DELIVER)).toHaveLength(1);
    });
  }

  test("a reinstall's first worked take is not a new device's, and sends nothing", async () => {
    await hello({ installNumber: 2 });
    const { jobId } = await committed("take_1");
    await t.mutation(internal.founderAlerts.recordOutcome, { jobId, status: "committed" });
    expect((await outcomes())[0]).toMatchObject({ newDevice: false, firstTake: true });
    expect(await scheduledOf(t, DELIVER)).toHaveLength(0);
  });

  test("the daily summary does not count a reinstall as new", async () => {
    await hello({ installNumber: 2 });
    await hello({ deviceId: "fedcba9876543210fedcba9876543210", installNumber: 1 });
    await hello({ deviceId: "00000000000000000000000000000000" });
    const res = await t.mutation(internal.founderAlerts.dailySummary, { now: T0 + HOUR });
    expect(res.subject).toMatch(/: 2 new, 3 active/);
  });
});

// ─── markTest ────────────────────────────────────────────────────────────────

describe("devices.markTest", () => {
  test("marks and unmarks by tag", async () => {
    await hello();
    const tag = await deviceTagFor(NEW_ID);
    expect(await markTest()).toEqual({ deviceTag: tag, isTest: true });
    expect((await devices())[0].isTest).toBe(true);
    expect(await markTest(false)).toEqual({ deviceTag: tag, isTest: false });
    expect((await devices())[0]).not.toHaveProperty("isTest");
  });

  test("accepts an upper-case tag with spaces", async () => {
    await hello();
    const tag = await deviceTagFor(NEW_ID);
    await t.mutation(internal.devices.markTest, { deviceTag: ` ${tag.toUpperCase()} `, isTest: true });
    expect((await devices())[0].isTest).toBe(true);
  });

  test("an unknown tag throws", async () => {
    await expect(
      t.mutation(internal.devices.markTest, { deviceTag: "ffffffff", isTest: true })
    ).rejects.toThrow(/no device/);
  });

  test("an ambiguous tag throws", async () => {
    await t.run(async (ctx) => {
      for (const deviceId of ["a1", "a2"]) {
        await ctx.db.insert("devices", {
          deviceId,
          deviceTag: "abcdabcd",
          firstSeenAt: T0,
          lastSeenAt: 0,
          seeded: false,
        });
      }
    });
    await expect(
      t.mutation(internal.devices.markTest, { deviceTag: "abcdabcd", isTest: true })
    ).rejects.toThrow(/more than one/);
  });

  test("a test phone's takes are logged but never emailed, failures included", async () => {
    await hello();
    await markTest();
    const before = (await emails()).length; // the new-device email from before it was marked

    const { jobId } = await committed("take_1");
    await t.mutation(internal.founderAlerts.recordOutcome, { jobId, status: "committed" });

    const { jobId: failedJob } = await insertJob(t, {
      status: "failed",
      deviceId: NEW_ID,
      creationId: "take_2",
      errorCode: "unparseable",
    });
    await t.mutation(internal.founderAlerts.recordOutcome, {
      jobId: failedJob,
      status: "failed",
      errorCode: "unparseable",
    });

    expect((await outcomes()).map((o) => o.creationId).sort()).toEqual(["take_1", "take_2"]);
    expect(await scheduledOf(t, DELIVER)).toHaveLength(0);
    expect(await emails()).toHaveLength(before);
  });

  test("a take email already queued is dropped when the phone is marked before it fires", async () => {
    await hello();
    // A failure's email waits ~75 s for a retry, so it is still queued here.
    // Failed through the real CAS, so the take has a failedTakes row to tell.
    const { jobId } = await insertJob(t, { status: "transcribed", deviceId: NEW_ID, creationId: "take_1" });
    await t.mutation(internal.creationJobs.casPatch, {
      jobId,
      generation: 1,
      expectStatus: ["transcribed"],
      patch: { status: "failed", errorCode: "unparseable" },
    });
    await t.mutation(internal.founderAlerts.recordOutcome, {
      jobId,
      status: "failed",
      errorCode: "unparseable",
    });
    // casPatch queued its own recordOutcome too; only the deliveries matter.
    expect((await scheduledOf(t, DELIVER)).length).toBeGreaterThan(0);

    await markTest();
    await t.mutation(internal.founderAlerts.deliverTakeEmail, {
      creationId: "take_1",
      deviceTag: await deviceTagFor(NEW_ID),
    });
    expect(await scheduledOf(t, SEND_TAKE)).toHaveLength(0);
  });

  test("an unmarked device still emails as before", async () => {
    await hello();
    await markTest();
    await markTest(false);
    const { jobId } = await committed("take_1");
    await t.mutation(internal.founderAlerts.recordOutcome, { jobId, status: "committed" });
    expect(await scheduledOf(t, DELIVER)).toHaveLength(1);
  });
});
