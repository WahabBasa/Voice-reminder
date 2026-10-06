/**
 * The device's spoken language (OLD-140) against a real (mocked) Convex: what
 * recordOutcome learns from each take, what `hello` and `preferences` hand
 * back, and the `languageHint` that `begin` / `retry` keep on the job.
 * The rule itself is unit-tested in __tests__/convex/spokenLang.test.ts.
 */

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api, internal } from "../../convex/_generated/api";
import type { Doc, Id } from "../../convex/_generated/dataModel";
import { CLOCK, Harness, harness, insertJob, readJob, storeAudio } from "./harness";

const DEVICE_ID = "0123456789abcdef0123456789abcdef";
const T0 = Date.UTC(2026, 9, 6, 12, 0, 0);

let t: Harness;

beforeEach(() => {
  t = harness();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(T0);
});

afterEach(() => {
  vi.useRealTimers();
});

async function device(): Promise<Doc<"devices"> | null> {
  return await t.run(async (ctx) => await ctx.db.query("devices").first());
}

async function hello() {
  return await t.mutation(api.devices.hello, { deviceId: DEVICE_ID, buildNumber: "9" });
}

let takeCounter = 0;

/** A committed take with one reminder per entry of `langs`, then its outcome. */
async function committedTake(langs: (string | undefined)[], creationId = `take_${++takeCounter}`) {
  const reminderIds = await t.run(async (ctx) => {
    const ids: Id<"reminders">[] = [];
    for (const lang of langs) {
      ids.push(
        await ctx.db.insert("reminders", {
          deviceId: DEVICE_ID,
          creationId,
          title: "r",
          description: "d",
          time: "20:00",
          frequency: "once",
          createdAt: T0,
          ...(lang ? { lang } : {}),
        })
      );
    }
    return ids;
  });
  const { jobId } = await insertJob(t, {
    status: "committed",
    deviceId: DEVICE_ID,
    creationId,
    reminderIds,
  });
  await t.mutation(internal.founderAlerts.recordOutcome, { jobId, status: "committed" });
  return { jobId, creationId };
}

/** A take that failed, optionally one waiting for a time with plans in `lang`. */
async function failedTake(
  errorDetail: "no_time" | "past_time" | "not_understood" | undefined,
  lang?: string
) {
  const { jobId, creationId } = await insertJob(t, {
    status: "transcribed",
    deviceId: DEVICE_ID,
    transcript: "x",
  });
  const keeps = errorDetail === "no_time" || errorDetail === "past_time";
  await t.mutation(internal.creationJobs.casPatch, {
    jobId,
    generation: 1,
    expectStatus: ["transcribed"],
    patch: {
      status: "failed",
      errorCode: errorDetail ? "unparseable" : "stt_failed",
      ...(errorDetail ? { errorDetail } : {}),
      ...(keeps
        ? {
            pendingPlans: [
              { title: "W", description: "d", frequency: "once", needsTime: true, lang },
            ],
          }
        : {}),
    } as never,
  });
  await t.mutation(internal.founderAlerts.recordOutcome, { jobId, status: "failed" });
  return { jobId, creationId };
}

describe("learning from takes", () => {
  test("the first understood take sets the language immediately", async () => {
    await hello();
    await committedTake(["sv"]);
    expect(await device()).toMatchObject({ spokenLang: "sv", spokenLangAt: T0 });
  });

  test("a take with several reminders counts by majority", async () => {
    await committedTake(["en", "he", "he"]);
    expect((await device())?.spokenLang).toBe("he");
  });

  test("one disagreeing take does not flip it; two in a row do", async () => {
    await committedTake(["sv"]);
    await committedTake(["sv"]);
    await committedTake(["en"]);
    expect((await device())?.spokenLang).toBe("sv");
    await committedTake(["en"]);
    expect((await device())?.spokenLang).toBe("en");
  });

  test("a take waiting for a time counts: it was understood", async () => {
    await failedTake("no_time", "sv");
    expect((await device())?.spokenLang).toBe("sv");
    await failedTake("past_time", "de");
    await failedTake("past_time", "de");
    expect((await device())?.spokenLang).toBe("de");
  });

  test("real failures do not count", async () => {
    await committedTake(["sv"]);
    await failedTake("not_understood");
    await failedTake(undefined);
    const row = await device();
    expect(row?.spokenLang).toBe("sv");
    expect(row?.spokenLangCandidate).toBeUndefined();
  });

  test("a take with no language on its reminders changes nothing", async () => {
    await committedTake([undefined]);
    expect((await device())?.spokenLang).toBeUndefined();
  });

  test("a no_time take answered later counts once, not twice", async () => {
    await committedTake(["sv"]);
    const { jobId, creationId } = await failedTake("no_time", "en");
    // The user picks a time: the same take now commits, and its outcome is seen again.
    await t.run(async (ctx) => {
      const reminderId = await ctx.db.insert("reminders", {
        deviceId: DEVICE_ID,
        creationId,
        title: "W",
        description: "d",
        time: "09:00",
        frequency: "once",
        createdAt: T0,
        lang: "en",
      });
      await ctx.db.patch(jobId, { status: "committed", reminderIds: [reminderId] });
    });
    await t.mutation(internal.founderAlerts.recordOutcome, { jobId, status: "committed" });
    const row = await device();
    expect(row?.spokenLang).toBe("sv");
    expect(row?.spokenLangCandidateCount).toBe(1);
  });
});

describe("handing it back", () => {
  test("hello returns the learned language once there is one", async () => {
    expect(await hello()).toEqual({ result: "new" });
    await committedTake(["sv"]);
    // Inside the hour: throttled, but still answers with the language.
    expect(await hello()).toEqual({ result: "throttled", spokenLang: "sv" });
    vi.setSystemTime(T0 + 2 * 60 * 60_000);
    expect(await hello()).toEqual({ result: "updated", spokenLang: "sv" });
  });

  test("preferences answers for this device only", async () => {
    expect(await t.query(api.devices.preferences, { deviceId: DEVICE_ID })).toEqual({});
    await committedTake(["he"]);
    expect(await t.query(api.devices.preferences, { deviceId: DEVICE_ID })).toEqual({
      spokenLang: "he",
    });
    expect(await t.query(api.devices.preferences, { deviceId: "someone_else" })).toEqual({});
    expect(await t.query(api.devices.preferences, { deviceId: "" })).toEqual({});
  });
});

describe("languageHint on the job", () => {
  test("begin keeps a valid hint, normalized, and drops anything else", async () => {
    const audio = await storeAudio(t);
    await t.mutation(api.creationJobs.begin, {
      deviceId: DEVICE_ID,
      creationId: "c1",
      audioStorageId: audio,
      ...CLOCK,
      languageHint: " SV ",
    });
    expect((await readJob(t, DEVICE_ID, "c1"))?.languageHint).toBe("sv");

    await t.mutation(api.creationJobs.begin, {
      deviceId: DEVICE_ID,
      creationId: "c2",
      audioStorageId: await storeAudio(t),
      ...CLOCK,
      languageHint: "swedish",
    });
    expect((await readJob(t, DEVICE_ID, "c2"))?.languageHint).toBeUndefined();
  });

  test("the worker reads the hint off the job", async () => {
    const { jobId } = await insertJob(t, { deviceId: DEVICE_ID, languageHint: "he" });
    const job = await t.query(internal.creationJobs.getJob, { jobId });
    expect(job?.languageHint).toBe("he");
  });

  test("retry replaces the hint when given and keeps it when not", async () => {
    const { creationId } = await insertJob(t, {
      deviceId: DEVICE_ID,
      status: "failed",
      languageHint: "en",
      audioStorageId: await storeAudio(t),
      sttSource: "cloud",
    });
    await t.mutation(api.creationJobs.retry, {
      deviceId: DEVICE_ID,
      creationId,
      languageHint: "sv",
    });
    expect((await readJob(t, DEVICE_ID, creationId))?.languageHint).toBe("sv");

    const { creationId: second } = await insertJob(t, {
      deviceId: DEVICE_ID,
      status: "failed",
      languageHint: "he",
      audioStorageId: await storeAudio(t),
      sttSource: "cloud",
    });
    await t.mutation(api.creationJobs.retry, { deviceId: DEVICE_ID, creationId: second });
    expect((await readJob(t, DEVICE_ID, second))?.languageHint).toBe("he");
  });
});
