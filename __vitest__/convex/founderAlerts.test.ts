/**
 * Founder alerts (OLD-135) against a real (mocked) Convex: the hello upsert and
 * throttle, the seed, the take-outcome log the creation-job transitions feed,
 * the daily summary and the prune. Emails are only asserted to be SCHEDULED
 * (with their subject/body); the shaping itself is unit-tested in
 * __tests__/convex/founderAlertsEmail.test.ts.
 */

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api, internal } from "../../convex/_generated/api";
import type { Doc, Id } from "../../convex/_generated/dataModel";
import { deviceTagFor } from "../../convex/founderAlertsEmail";
import {
  TAKE_EMAIL_MAX_WAIT_MS,
  TAKE_EMAIL_RECHECK_MS,
  TAKE_EMAIL_SETTLE_MS,
} from "../../convex/founderAlerts";
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

function at(ms: number) {
  vi.setSystemTime(ms);
}

async function devices(): Promise<Doc<"devices">[]> {
  return await t.run(async (ctx) => await ctx.db.query("devices").collect());
}

async function outcomes(): Promise<Doc<"takeOutcomes">[]> {
  return await t.run(async (ctx) => await ctx.db.query("takeOutcomes").collect());
}

type SentEmail = { subject: string; body: string; html?: string };

async function emails(): Promise<SentEmail[]> {
  return (await scheduledOf(t, SEND)).map((row) => row.args[0] as SentEmail);
}

/** Fire the take email for a creationId by hand (it is scheduled ~75 s out). */
async function deliver(creationId: string, deviceId = NEW_ID) {
  await t.mutation(internal.founderAlerts.deliverTakeEmail, {
    creationId,
    deviceTag: await deviceTagFor(deviceId),
  });
}

/** Fail a job through the real CAS, which writes its failedTakes row. */
async function failJob(
  jobId: Id<"creationJobs">,
  generation: number,
  patch: Record<string, unknown>
) {
  await t.mutation(internal.creationJobs.casPatch, {
    jobId,
    generation,
    expectStatus: ["pending", "transcribed"],
    patch: { status: "failed", ...patch } as never,
  });
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
      { jobId, status: "failed", errorCode: "unparseable", failedTakeId: expect.any(String) },
      { jobId: stuck, status: "failed", errorCode: "internal", failedTakeId: expect.any(String) },
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

    // The worked first take goes out at once, as a take email.
    const queued = await scheduledOf(t, DELIVER);
    expect(queued.map((r) => r.args[0])).toEqual([
      { creationId: "take_1", deviceTag: await deviceTagFor(NEW_ID) },
    ]);
    await deliver("take_1");
    const sent = await emails();
    expect(sent.map((e) => e.subject)).toEqual([
      "Remi: new device (Europe/Stockholm, sv-SE)",
      "Remi ✅ First take worked — Dubai, new user",
    ]);
    expect(sent[1].body).toContain("they got 2 reminders");
    expect(sent[1].html).toContain("Reminders created");
  });

  test("a second committed take is logged but silent", async () => {
    await hello();
    for (const creationId of ["take_1", "take_2"]) {
      const { jobId } = await transcribed({ creationId });
      await t.mutation(internal.founderAlerts.recordOutcome, { jobId, status: "committed" });
    }
    const rows = await outcomes();
    expect(rows.map((r) => r.firstTake)).toEqual([true, false]);
    // Only the first take's email is queued.
    expect((await scheduledOf(t, DELIVER)).map((r) => (r.args[0] as any).creationId)).toEqual(["take_1"]);
  });

  test("a failure emails once it settles, in plain words", async () => {
    await hello();
    const { jobId, creationId } = await transcribed({ transcript: "Kilometer got lead" });
    await failJob(jobId, 1, { errorCode: "unparseable", errorDetail: "not_understood" });
    await t.mutation(internal.founderAlerts.recordOutcome, {
      jobId,
      status: "failed",
      errorCode: "unparseable",
    });

    const [row] = await outcomes();
    expect(row).toMatchObject({ status: "failed", errorCode: "unparseable", newDevice: true, firstTake: true });
    // Not straight away: ~75 s later, so a retry can land first.
    const [queued] = await scheduledOf(t, DELIVER);
    expect((queued as any).scheduledTime).toBe(T0 + TAKE_EMAIL_SETTLE_MS);
    expect(await emails()).toHaveLength(1); // the new-device email only

    await deliver(creationId);
    const email = (await emails()).at(-1)!;
    expect(email.subject).toBe("Remi ❌ Couldn't understand — Dubai, new user's first try");
    expect(email.body).toContain("Didn't catch that — tap to record again");
    expect(`${email.subject}${email.body}${email.html}`).not.toContain(NEW_ID);
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
    const { jobId, creationId } = await insertJob(t, { deviceId: NEW_ID });
    await failJob(jobId, 1, { errorCode: "stt_failed" });
    await t.mutation(internal.founderAlerts.recordOutcome, { jobId, status: "failed", errorCode: "stt_failed" });
    await deliver(creationId);
    expect((await emails()).map((e) => e.subject)).toEqual(["Remi ❌ Transcription failed — Dubai"]);
  });

  test("a take from an install that never said hello registers it as new", async () => {
    const { jobId } = await committed("take_1", 1);
    await t.mutation(internal.founderAlerts.recordOutcome, { jobId, status: "committed" });
    await deliver("take_1");

    const [device] = await devices();
    expect(device).toMatchObject({ deviceId: NEW_ID, seeded: false, lastSeenAt: 0, firstSeenAt: T0 });
    expect((await emails()).map((e) => e.subject)).toEqual([
      "Remi ✅ First take worked — Dubai, new user",
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

// ─── one email per take ──────────────────────────────────────────────────────

describe("one email per take", () => {
  /** A device take that failed on the phone's words, as the pipeline leaves it. */
  async function deviceTakeFails() {
    const { jobId, creationId } = await insertJob(t, {
      status: "transcribed",
      deviceId: NEW_ID,
      sttSource: "device",
      deviceSttLocale: "en-US",
      transcript: "Kilometer got lead",
    });
    await failJob(jobId, 1, { errorCode: "unparseable", errorDetail: "not_understood" });
    await t.mutation(internal.founderAlerts.recordOutcome, { jobId, status: "failed", errorCode: "unparseable" });
    return { jobId, creationId };
  }

  /** The automatic cloud retry: generation 2, transcribed by the server. */
  async function cloudRetryTranscribed(jobId: Id<"creationJobs">, transcript: string) {
    await t.run(async (ctx) => {
      await ctx.db.patch(jobId, {
        status: "transcribed",
        generation: 2,
        attempts: 2,
        sttSource: "cloud",
        deviceSttLocale: undefined,
        transcript,
        perf: { sttModel: "openai/gpt-4o-transcribe", sttFallbackUsed: false, sttAudioSeconds: 3.4 },
      });
    });
  }

  test("several failed attempts schedule ONE email that tells them all", async () => {
    const { jobId, creationId } = await deviceTakeFails();
    await cloudRetryTranscribed(jobId, "Kom ihåg att… nej, vänta");
    await failJob(jobId, 2, {
      errorCode: "unparseable",
      errorDetail: "not_understood",
      detectedLanguage: "sv",
      // The worker's failure patch carries this run's perf.
      perf: { sttModel: "openai/gpt-4o-transcribe", sttFallbackUsed: false, sttAudioSeconds: 3.4 },
    });
    await t.mutation(internal.founderAlerts.recordOutcome, { jobId, status: "failed", errorCode: "unparseable" });

    // De-duplicated per creationId: the second failure queues nothing new.
    // (convex-test also runs the CAS's own queued recordOutcome calls, so this
    // has raced several of them; still one.)
    expect(await scheduledOf(t, DELIVER)).toHaveLength(1);

    at(T0 + TAKE_EMAIL_SETTLE_MS);
    await deliver(creationId);
    // A second firing (or a duplicate) is a no-op.
    await deliver(creationId);

    const sent = await emails();
    expect(sent).toHaveLength(1);
    expect(sent[0].subject).toBe("Remi ❌ Couldn't understand — Dubai (Swedish), new user's first try");
    expect(sent[0].body).toContain('1. 📱 Phone heard (on-device, English): "Kilometer got lead"');
    expect(sent[0].body).toContain("→ Rejected: not a reminder → retried on the server.");
    expect(sent[0].body).toContain('2. ☁️ Server heard (language: Swedish, model: openai/gpt-4o-transcribe): "Kom ihåg att… nej, vänta"');
    expect(sent[0].body).toContain("Codes: #1 unparseable/not_understood · #2 unparseable/not_understood");
    expect(sent[0].body).toMatch(/#1 failedTakes id \S+ \(no audio kept: on-device take\)/);
    expect(sent[0].html).toContain("2. ☁️ Server heard");
    expect(`${sent[0].body}${sent[0].html}`).not.toContain(NEW_ID);
  });

  test("a take that failed and then recovered gets one 'recovered' email", async () => {
    const { jobId, creationId } = await deviceTakeFails();
    await cloudRetryTranscribed(jobId, "Remind me to drink water at eight");
    await t.mutation(internal.creationJobs.commit, {
      jobId,
      generation: 2,
      plans: [commitPlan({ lang: "en" })],
    });
    await t.mutation(internal.founderAlerts.recordOutcome, { jobId, status: "committed" });
    expect(await scheduledOf(t, DELIVER)).toHaveLength(1);

    at(T0 + TAKE_EMAIL_SETTLE_MS);
    await deliver(creationId);
    const sent = await emails();
    expect(sent.map((e) => e.subject)).toEqual([
      "Remi ⚠️ Recovered on server retry — Dubai (English), new user's first try",
    ]);
    expect(sent[0].body).toContain('→ Created "Water" for');
    expect(sent[0].body).toContain("Spoken line: \"Drink your water.\"");
    expect(sent[0].body).toContain("Language: English · voice: English voice");
  });

  test("a retry still running when the email is due is looked at again, then sent anyway", async () => {
    const { jobId, creationId } = await deviceTakeFails();
    await t.run(async (ctx) => {
      await ctx.db.patch(jobId, { status: "pending", generation: 2, attempts: 2, sttSource: "cloud" });
    });

    at(T0 + TAKE_EMAIL_SETTLE_MS);
    await deliver(creationId);
    expect(await emails()).toHaveLength(0);
    const queued = await scheduledOf(t, DELIVER);
    expect(queued).toHaveLength(2);
    expect((queued[1] as any).scheduledTime).toBe(T0 + TAKE_EMAIL_SETTLE_MS + TAKE_EMAIL_RECHECK_MS);

    at(T0 + TAKE_EMAIL_SETTLE_MS + TAKE_EMAIL_MAX_WAIT_MS);
    await deliver(creationId);
    const sent = await emails();
    expect(sent).toHaveLength(1);
    expect(sent[0].body).toContain("was still retrying when this email went out");
  });

  test("a later twist after the email went out sends a follow-up", async () => {
    const { jobId, creationId } = await deviceTakeFails();
    await deliver(creationId);
    expect(await emails()).toHaveLength(1);

    // Minutes later the user taps retry and it works.
    at(T0 + 10 * MINUTE);
    await cloudRetryTranscribed(jobId, "Remind me to drink water at eight");
    await t.mutation(internal.creationJobs.commit, { jobId, generation: 2, plans: [commitPlan()] });
    await t.mutation(internal.founderAlerts.recordOutcome, { jobId, status: "committed" });
    await deliver(creationId);

    const subjects = (await emails()).map((e) => e.subject);
    expect(subjects).toEqual([
      "Remi ❌ Couldn't understand — Dubai, new user's first try",
      "Remi ⚠️ Recovered on server retry — Dubai, new user's first try (follow-up)",
    ]);
  });

  test("a take that works first time on a known device sends nothing", async () => {
    await t.run(async (ctx) => {
      await ctx.db.insert("devices", {
        deviceId: NEW_ID,
        deviceTag: await deviceTagFor(NEW_ID),
        firstSeenAt: 0,
        lastSeenAt: 0,
        seeded: true,
      });
    });
    const { jobId } = await insertJob(t, { status: "transcribed", deviceId: NEW_ID });
    await t.mutation(internal.creationJobs.commit, { jobId, generation: 1, plans: [commitPlan()] });
    await t.mutation(internal.founderAlerts.recordOutcome, { jobId, status: "committed" });
    expect(await scheduledOf(t, DELIVER)).toHaveLength(0);
    expect(await emails()).toHaveLength(0);
  });

  test("a discarded failed take still gets its email", async () => {
    const { jobId, creationId } = await deviceTakeFails();
    await t.run(async (ctx) => await ctx.db.delete(jobId));
    await deliver(creationId);
    const [email] = await emails();
    expect(email.subject).toBe("Remi ❌ Couldn't understand — Dubai, new user's first try");
    expect(email.body).toContain("Then they swiped the card away.");
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

  test("prunes old take-email rows too", async () => {
    const { jobId } = await insertJob(t);
    const row = (creationId: string, scheduledAt: number) => ({
      creationId,
      deviceTag: "aaaaaaaa",
      jobId,
      scheduledAt,
      dueAt: scheduledAt,
      sentCount: 1,
      newDevice: false,
      firstTake: false,
    });
    await t.run(async (ctx) => {
      await ctx.db.insert("takeEmails", row("old", T0 - 31 * DAY));
      await ctx.db.insert("takeEmails", row("young", T0 - 29 * DAY));
    });
    await t.mutation(internal.founderAlerts.pruneOutcomes, {});
    const left = await t.run(async (ctx) => await ctx.db.query("takeEmails").collect());
    expect(left.map((r) => r.creationId)).toEqual(["young"]);
  });
});
