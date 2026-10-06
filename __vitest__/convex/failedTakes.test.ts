/**
 * Failed takes (OLD-136) against a real (mocked) Convex: the row a failure
 * writes, the recording a failure keeps, the 7-day purge, the founder's reads
 * and what the take email quotes from a row. The email shaping itself is
 * unit-tested in __tests__/convex/takeStoryEmail.test.ts.
 */

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api, internal } from "../../convex/_generated/api";
import type { Doc, Id } from "../../convex/_generated/dataModel";
import { deviceTagFor } from "../../convex/founderAlertsEmail";
import {
  BLOB_DELETE,
  DAY,
  DEVICE,
  HOUR,
  Harness,
  commitPlan,
  harness,
  insertJob,
  readJobById,
  scheduledOf,
  storeAudio,
} from "./harness";

const SEND = "founderAlerts:sendEmail";
const T0 = Date.UTC(2026, 9, 6, 8, 0, 0);

let t: Harness;

beforeEach(() => {
  t = harness();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(T0);
});

afterEach(() => {
  vi.useRealTimers();
});

async function rows(): Promise<Doc<"failedTakes">[]> {
  return await t.run(async (ctx) => await ctx.db.query("failedTakes").collect());
}

async function blobExists(id: Id<"_storage">): Promise<boolean> {
  return await t.run(async (ctx) => (await ctx.db.system.get(id)) !== null);
}

async function fail(
  jobId: Id<"creationJobs">,
  generation: number,
  patch: Record<string, unknown>,
  diagnostics?: { parseRaw?: string }
) {
  return await t.mutation(internal.creationJobs.casPatch, {
    jobId,
    generation,
    expectStatus: ["pending", "transcribed"],
    patch: { status: "failed", ...patch } as never,
    ...(diagnostics ? { diagnostics } : {}),
  });
}

const CLOUD_PERF = { sttModel: "whisper-1", sttFallbackUsed: true, sttAudioSeconds: 3.5 };

describe("a failure keeps the attempt", () => {
  test("a cloud failure writes a row with the transcript, model, raw answer and audio", async () => {
    await t.run(async (ctx) => {
      await ctx.db.insert("devices", {
        deviceId: DEVICE,
        deviceTag: await deviceTagFor(DEVICE),
        firstSeenAt: T0 - DAY,
        lastSeenAt: T0,
        seeded: false,
        buildNumber: "9",
      });
    });
    const audioStorageId = await storeAudio(t);
    const { jobId, creationId } = await insertJob(t, {
      status: "transcribed",
      sttSource: "cloud",
      audioStorageId,
      transcript: "Thank you for watching.",
      timezone: "Europe/Stockholm",
    });

    await fail(
      jobId,
      1,
      { errorCode: "unparseable", errorDetail: "not_understood", perf: CLOUD_PERF },
      { parseRaw: "x".repeat(5000) }
    );

    const [row] = await rows();
    expect(row).toMatchObject({
      jobId,
      creationId,
      generation: 1,
      deviceTag: await deviceTagFor(DEVICE),
      at: T0,
      errorCode: "unparseable",
      errorDetail: "not_understood",
      sttSource: "cloud",
      cloudTranscript: "Thank you for watching.",
      cloudSttModel: "whisper-1",
      cloudSttFallbackUsed: true,
      audioSeconds: 3.5,
      timezone: "Europe/Stockholm",
      buildNumber: "9",
      audioStorageId,
    });
    expect(row.deviceTranscript).toBeUndefined();
    expect(row.parseRaw).toHaveLength(4096);
    expect(row).not.toHaveProperty("deviceId");
  });

  test("an STT failure does not report an earlier attempt's transcript as this one's", async () => {
    const audioStorageId = await storeAudio(t);
    const { jobId } = await insertJob(t, {
      status: "pending",
      generation: 2,
      sttSource: "cloud",
      audioStorageId,
      transcript: "from attempt one",
    });
    await fail(jobId, 2, { errorCode: "stt_failed" });
    const [row] = await rows();
    expect(row.cloudTranscript).toBeUndefined();
    expect(row.audioStorageId).toBe(audioStorageId);
  });

  test("the stale sweep's failure is kept too", async () => {
    const { jobId } = await insertJob(t, { updatedAt: T0 - HOUR });
    await t.mutation(internal.creationJobs.sweepStale, {});
    expect((await rows()).map((r) => [r.jobId, r.errorCode])).toEqual([[jobId, "internal"]]);
  });

  test("a stale write records nothing", async () => {
    const { jobId } = await insertJob(t, { generation: 2 });
    expect(await fail(jobId, 1, { errorCode: "internal" })).toEqual({ result: "stale" });
    expect(await rows()).toHaveLength(0);
  });

  test("device failure, then a cloud retry that fails too, leaves two rows", async () => {
    const { jobId, creationId } = await insertJob(t, {
      status: "transcribed",
      sttSource: "device",
      transcript: "Påminn mig att ringa mamma",
      deviceSttLocale: "en-US",
      deviceSttEngine: "transcriber",
    });
    await fail(jobId, 1, {
      errorCode: "unparseable",
      errorDetail: "not_understood",
      detectedLanguage: "sv",
    });

    const newStorageId = await storeAudio(t, "re-upload");
    expect(
      await t.mutation(api.creationJobs.retry, { deviceId: DEVICE, creationId, newStorageId })
    ).toEqual({ status: "pending", generation: 2 });
    await t.mutation(internal.creationJobs.casPatch, {
      jobId,
      generation: 2,
      expectStatus: ["pending"],
      patch: { status: "transcribed", transcript: "Påminn mig att ringa mamma klockan fem" },
    });
    await fail(jobId, 2, { errorCode: "unparseable", detectedLanguage: "sv", perf: CLOUD_PERF });

    const [first, second] = (await rows()).sort((a, b) => a.generation - b.generation);
    expect(first).toMatchObject({
      generation: 1,
      sttSource: "device",
      deviceSttLocale: "en-US",
      deviceSttEngine: "transcriber",
      deviceTranscript: "Påminn mig att ringa mamma",
      detectedLanguage: "sv",
    });
    expect(first.cloudTranscript).toBeUndefined();
    expect(first.audioStorageId).toBeUndefined();
    expect(second).toMatchObject({
      generation: 2,
      sttSource: "cloud",
      cloudTranscript: "Påminn mig att ringa mamma klockan fem",
      cloudSttModel: "whisper-1",
      audioStorageId: newStorageId,
    });
    expect(second.deviceTranscript).toBeUndefined();
  });
});

describe("audio retention", () => {
  async function failedCloudTake() {
    const audioStorageId = await storeAudio(t);
    const { jobId, creationId } = await insertJob(t, {
      status: "transcribed",
      sttSource: "cloud",
      audioStorageId,
      transcript: "hmm",
    });
    await fail(jobId, 1, { errorCode: "unparseable" });
    return { jobId, creationId, audioStorageId };
  }

  test("a success that never failed still deletes its recording", async () => {
    const audioStorageId = await storeAudio(t);
    const { jobId } = await insertJob(t, { status: "transcribed", audioStorageId });
    await t.mutation(internal.creationJobs.commit, { jobId, generation: 1, plans: [commitPlan()] });
    const deletes = await scheduledOf(t, BLOB_DELETE);
    expect(deletes.map((d) => d.args[0])).toEqual([{ storageId: audioStorageId }]);
  });

  test("discarding a failed take keeps the recording on the failed row", async () => {
    const { creationId, audioStorageId } = await failedCloudTake();
    expect(await t.mutation(api.creationJobs.discard, { deviceId: DEVICE, creationId })).toEqual({
      status: "discarded",
    });
    expect(await scheduledOf(t, BLOB_DELETE)).toHaveLength(0);
    expect(await blobExists(audioStorageId)).toBe(true);
  });

  test("a retry with a new upload does not orphan the old blob: the failed row owns it", async () => {
    const { creationId, audioStorageId } = await failedCloudTake();
    const newStorageId = await storeAudio(t, "re-upload");
    await t.mutation(api.creationJobs.retry, { deviceId: DEVICE, creationId, newStorageId });
    expect(await scheduledOf(t, BLOB_DELETE)).toHaveLength(0);
    expect((await rows())[0].audioStorageId).toBe(audioStorageId);
  });

  test("a retry on the same blob that then succeeds does not delete the failed attempt's audio", async () => {
    const { jobId, creationId, audioStorageId } = await failedCloudTake();
    await t.mutation(api.creationJobs.retry, { deviceId: DEVICE, creationId });
    await t.mutation(internal.creationJobs.casPatch, {
      jobId,
      generation: 2,
      expectStatus: ["pending"],
      patch: { status: "transcribed", transcript: "water at eight" },
    });
    await t.mutation(internal.creationJobs.commit, { jobId, generation: 2, plans: [commitPlan()] });
    expect((await readJobById(t, jobId))!.status).toBe("committed");
    expect(await scheduledOf(t, BLOB_DELETE)).toHaveLength(0);
  });

  test("the sweep's GC of an expired failed job leaves a held recording alone", async () => {
    const { jobId } = await failedCloudTake();
    vi.setSystemTime(T0 + 8 * DAY);
    await t.mutation(internal.creationJobs.sweepStale, {});
    expect(await readJobById(t, jobId)).toBeNull();
    expect(await scheduledOf(t, BLOB_DELETE)).toHaveLength(0);
  });
});

describe("failedTakes.purge", () => {
  test("deletes rows and recordings older than 7 days, keeps newer ones, and is idempotent", async () => {
    // Old: its job is gone (discarded), so the purge owns the recording.
    const oldAudio = await storeAudio(t, "old");
    const { jobId: oldJob, creationId: oldTake } = await insertJob(t, {
      status: "transcribed",
      audioStorageId: oldAudio,
      transcript: "old",
    });
    await fail(oldJob, 1, { errorCode: "unparseable" });
    await t.mutation(api.creationJobs.discard, { deviceId: DEVICE, creationId: oldTake });

    // Young: failed six days later.
    vi.setSystemTime(T0 + 6 * DAY);
    const youngAudio = await storeAudio(t, "young");
    const { jobId: youngJob, creationId: youngTake } = await insertJob(t, {
      status: "transcribed",
      audioStorageId: youngAudio,
      transcript: "young",
    });
    await fail(youngJob, 1, { errorCode: "unparseable" });
    await t.mutation(api.creationJobs.discard, { deviceId: DEVICE, creationId: youngTake });

    vi.setSystemTime(T0 + 7 * DAY + HOUR);
    expect(await t.mutation(internal.failedTakes.purge, {})).toEqual({
      deleted: 1,
      blobsDeleted: 1,
    });
    expect((await rows()).map((r) => r.creationId)).toEqual([youngTake]);
    expect(await blobExists(oldAudio)).toBe(false);
    expect(await blobExists(youngAudio)).toBe(true);

    expect(await t.mutation(internal.failedTakes.purge, {})).toEqual({
      deleted: 0,
      blobsDeleted: 0,
    });
  });

  test("a recording shared by two attempts goes with the last of them", async () => {
    const audioStorageId = await storeAudio(t);
    const { jobId, creationId } = await insertJob(t, {
      status: "transcribed",
      audioStorageId,
      transcript: "one",
    });
    await fail(jobId, 1, { errorCode: "unparseable" });
    vi.setSystemTime(T0 + 2 * DAY);
    await t.mutation(api.creationJobs.retry, { deviceId: DEVICE, creationId });
    await fail(jobId, 2, { errorCode: "stt_failed" });
    await t.mutation(api.creationJobs.discard, { deviceId: DEVICE, creationId });

    vi.setSystemTime(T0 + 8 * DAY);
    expect(await t.mutation(internal.failedTakes.purge, {})).toEqual({ deleted: 1, blobsDeleted: 0 });
    expect(await blobExists(audioStorageId)).toBe(true);

    vi.setSystemTime(T0 + 10 * DAY);
    expect(await t.mutation(internal.failedTakes.purge, {})).toEqual({ deleted: 1, blobsDeleted: 1 });
    expect(await blobExists(audioStorageId)).toBe(false);
  });

  test("a recording the job still reads is left for the job's own cleanup", async () => {
    const audioStorageId = await storeAudio(t);
    const { jobId } = await insertJob(t, { status: "transcribed", audioStorageId, transcript: "x" });
    await fail(jobId, 1, { errorCode: "unparseable" });
    // The job is still there (its GC clock was reset), still pointing at the blob.
    vi.setSystemTime(T0 + 8 * DAY);
    expect(await t.mutation(internal.failedTakes.purge, {})).toEqual({ deleted: 1, blobsDeleted: 0 });
    expect(await blobExists(audioStorageId)).toBe(true);
  });
});

describe("founder retrieval", () => {
  test("recent returns the newest rows first, optionally for one device tag", async () => {
    const { jobId: a } = await insertJob(t, { status: "transcribed", transcript: "a" });
    await fail(a, 1, { errorCode: "unparseable" });
    vi.setSystemTime(T0 + HOUR);
    const { jobId: b } = await insertJob(t, {
      status: "transcribed",
      transcript: "b",
      deviceId: "someone_else",
    });
    await fail(b, 1, { errorCode: "stt_failed" });

    const all = await t.query(internal.failedTakes.recent, {});
    expect(all.map((r) => r.jobId)).toEqual([b, a]);
    const mine = await t.query(internal.failedTakes.recent, {
      deviceTag: await deviceTagFor(DEVICE),
    });
    expect(mine.map((r) => r.jobId)).toEqual([a]);
    expect(await t.query(internal.failedTakes.recent, { limit: 1 })).toHaveLength(1);
  });

  test("audioUrl returns a URL for a kept recording and null without one", async () => {
    const audioStorageId = await storeAudio(t);
    const { jobId } = await insertJob(t, { status: "transcribed", audioStorageId, transcript: "x" });
    await fail(jobId, 1, { errorCode: "unparseable" });
    const { jobId: deviceJob } = await insertJob(t, {
      status: "transcribed",
      sttSource: "device",
      transcript: "y",
    });
    await fail(deviceJob, 1, { errorCode: "unparseable" });

    const [withAudio, withoutAudio] = (await rows()).sort((x, y) =>
      x.audioStorageId ? -1 : y.audioStorageId ? 1 : 0
    );
    const res = await t.action(internal.failedTakes.audioUrl, { id: withAudio._id });
    expect(res).toMatchObject({ url: expect.any(String), purgeAfter: T0 + 7 * DAY });
    expect(await t.action(internal.failedTakes.audioUrl, { id: withoutAudio._id })).toBeNull();
  });
});

describe("the failure email", () => {
  test("says what Remi heard, truncated, without the deviceId", async () => {
    const { jobId } = await insertJob(t, {
      status: "transcribed",
      sttSource: "device",
      transcript: "å".repeat(500),
    });
    await fail(jobId, 1, {
      errorCode: "unparseable",
      errorDetail: "unsupported_language",
      detectedLanguage: "sv",
    });
    const [row] = await rows();

    await t.mutation(internal.founderAlerts.recordOutcome, {
      jobId,
      status: "failed",
      errorCode: "unparseable",
      failedTakeId: row._id,
    });
    await t.mutation(internal.founderAlerts.deliverTakeEmail, {
      creationId: row.creationId,
      deviceTag: row.deviceTag,
    });

    const sent = (await scheduledOf(t, SEND)).map(
      (r) => r.args[0] as { subject: string; body: string; html: string }
    );
    const email = sent.at(-1)!;
    expect(email.subject).toBe("Remi ❌ Doesn't speak Swedish yet — Dubai, new user's first try");
    expect(email.body).toContain(`1. 📱 Phone heard (on-device, unknown language): "${"å".repeat(299)}…"`);
    expect(email.body).not.toContain("å".repeat(300));
    expect(email.body).toContain("Remi doesn't speak Swedish yet");
    expect(`${email.body}\n${email.html}`).not.toContain(DEVICE);
  });
});
