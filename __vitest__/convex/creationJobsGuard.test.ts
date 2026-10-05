/**
 * The guard's server contract (OLD-130), against the mocked backend.
 *
 * `begin`/`retry` carry the client's feature list onto the row, a guard
 * failure's reason reaches the document the client watches (`get`), and the
 * spoken language reaches the reminder row. The worker is not run — its guard
 * branch has its own jest suite — so the failure is written the way it writes
 * it, through `casPatch`.
 */

import { beforeEach, describe, expect, test } from "vitest";
import { api, internal } from "../../convex/_generated/api";
import {
  CLOCK,
  DEVICE,
  Harness,
  allReminders,
  commitPlan,
  harness,
  insertJob,
  readJob,
  storeAudio,
} from "./harness";

let t: Harness;

beforeEach(() => {
  t = harness();
});

async function begin(over: Record<string, unknown> = {}) {
  const audioStorageId = await storeAudio(t);
  return await t.mutation(api.creationJobs.begin, {
    deviceId: DEVICE,
    creationId: "take_1",
    audioStorageId,
    ...CLOCK,
    ...over,
  });
}

describe("clientFeatures", () => {
  test("begin stores the list it was given", async () => {
    await begin({ clientFeatures: ["guard_v1"] });
    expect((await readJob(t, DEVICE, "take_1"))!.clientFeatures).toEqual(["guard_v1"]);
  });

  test("begin without it writes a row with no list — today's row", async () => {
    await begin();
    const job = await readJob(t, DEVICE, "take_1");
    expect(job).not.toHaveProperty("clientFeatures");
  });

  test("begin dedupes and drops empty entries", async () => {
    await begin({ clientFeatures: ["guard_v1", "", "guard_v1"] });
    expect((await readJob(t, DEVICE, "take_1"))!.clientFeatures).toEqual(["guard_v1"]);
  });

  test("an idempotent re-begin does not rewrite the list", async () => {
    await begin();
    await begin({ clientFeatures: ["guard_v1"] });
    expect(await readJob(t, DEVICE, "take_1")).not.toHaveProperty("clientFeatures");
  });

  test("retry replaces the list when given one and keeps it otherwise", async () => {
    const { creationId } = await insertJob(t, {
      status: "failed",
      errorCode: "unparseable",
      clientFeatures: ["guard_v1"],
    });
    await t.mutation(api.creationJobs.retry, { deviceId: DEVICE, creationId });
    expect((await readJob(t, DEVICE, creationId))!.clientFeatures).toEqual(["guard_v1"]);
  });
});

describe("errorDetail on the watched document", () => {
  test("a guard failure exposes errorDetail and detectedLanguage through get", async () => {
    const { jobId, creationId } = await insertJob(t, { clientFeatures: ["guard_v1"] });
    await t.mutation(internal.creationJobs.casPatch, {
      jobId,
      generation: 1,
      expectStatus: ["pending", "transcribed"],
      patch: {
        status: "failed",
        errorCode: "unparseable",
        errorDetail: "unsupported_language",
        detectedLanguage: "xh",
      },
    });

    const watched = await t.query(api.creationJobs.get, { deviceId: DEVICE, creationId });
    expect(watched).toMatchObject({
      status: "failed",
      errorCode: "unparseable",
      errorDetail: "unsupported_language",
      detectedLanguage: "xh",
    });
  });

  test("a failure without a detail returns exactly the old keys", async () => {
    const { jobId, creationId } = await insertJob(t);
    await t.mutation(internal.creationJobs.casPatch, {
      jobId,
      generation: 1,
      expectStatus: ["pending"],
      patch: { status: "failed", errorCode: "unparseable" },
    });

    const watched = await t.query(api.creationJobs.get, { deviceId: DEVICE, creationId });
    expect(watched).not.toHaveProperty("errorDetail");
    expect(watched).not.toHaveProperty("detectedLanguage");
    expect(watched!.errorCode).toBe("unparseable");
  });

  test("retry clears the previous attempt's detail", async () => {
    const { creationId } = await insertJob(t, {
      status: "failed",
      errorCode: "unparseable",
      errorDetail: "unsupported_language",
      detectedLanguage: "xh",
    });
    await t.mutation(api.creationJobs.retry, { deviceId: DEVICE, creationId });

    const job = await readJob(t, DEVICE, creationId);
    expect(job!.status).toBe("pending");
    expect(job).not.toHaveProperty("errorDetail");
    expect(job).not.toHaveProperty("detectedLanguage");
  });
});

describe("lang on the reminder row", () => {
  test("commit stores each plan's lang", async () => {
    const { jobId } = await insertJob(t, { status: "transcribed" });
    await t.mutation(internal.creationJobs.commit, {
      jobId,
      generation: 1,
      plans: [commitPlan({ lang: "sv" }), commitPlan({ title: "Other" })],
    });

    const rows = await allReminders(t);
    expect(rows.find((row) => row.title === "Water")!.lang).toBe("sv");
    expect(rows.find((row) => row.title === "Other")).not.toHaveProperty("lang");
  });
});
