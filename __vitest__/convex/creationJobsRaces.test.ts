/**
 * Everything about the creation pipeline that is a race.
 *
 * The pipeline has three writers that can all be in flight at once — the worker
 * action, the user (cancel/retry/discard) and the five-minute sweep — against a
 * row none of them holds a lock on. `generation` is the whole of the answer, so
 * this suite is mostly a demonstration that a loser writes NOTHING rather than
 * writing something harmless-looking.
 */

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api, internal } from "../../convex/_generated/api";
import {
  BLOB_DELETE,
  DAY,
  DEVICE,
  Harness,
  HOUR,
  MINUTE,
  OTHER_DEVICE,
  WORKER,
  allJobs,
  allReminders,
  commitPlan,
  harness,
  insertJob,
  readJob,
  readJobById,
  scheduledNames,
  scheduledOf,
  storeAudio,
} from "./harness";

let t: Harness;

beforeEach(() => {
  t = harness();
});

afterEach(() => {
  vi.useRealTimers();
});

/** Only Date is faked: convex-test drives itself on promises, not timers. */
function freezeClock(at: number) {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(at);
}

// ─── 1.3 casPatch ───────────────────────────────────────────────────────────

describe("casPatch", () => {
  test("applies at the live generation and bumps updatedAt", async () => {
    const { jobId, creationId } = await insertJob(t, { updatedAt: 1000 });

    const result = await t.mutation(internal.creationJobs.casPatch, {
      jobId,
      generation: 1,
      expectStatus: ["pending"],
      patch: { status: "transcribed", transcript: "water at eight" },
    });

    expect(result).toEqual({ result: "applied" });
    const job = await readJob(t, DEVICE, creationId);
    expect(job).toMatchObject({ status: "transcribed", transcript: "water at eight" });
    expect(job!.updatedAt).toBeGreaterThan(1000);
  });

  test("a superseded worker writes nothing", async () => {
    // The user retried while this worker was inside its Whisper call.
    const { jobId, creationId } = await insertJob(t, { generation: 2 });

    const result = await t.mutation(internal.creationJobs.casPatch, {
      jobId,
      generation: 1,
      expectStatus: ["pending"],
      patch: { status: "transcribed", transcript: "the superseded take" },
    });

    expect(result).toEqual({ result: "stale" });
    const job = await readJob(t, DEVICE, creationId);
    expect(job!.status).toBe("pending");
    expect(job!.transcript).toBeUndefined();
  });

  test("a status the caller did not expect is refused", async () => {
    const { jobId, creationId } = await insertJob(t, { status: "transcribed" });

    const result = await t.mutation(internal.creationJobs.casPatch, {
      jobId,
      generation: 1,
      // The milestone write only ever expects `pending`.
      expectStatus: ["pending"],
      patch: { status: "transcribed", transcript: "again" },
    });

    expect(result).toEqual({ result: "stale" });
    expect((await readJob(t, DEVICE, creationId))!.transcript).toBeUndefined();
  });

  test.each(["committed", "failed", "cancelled"] as const)(
    "a %s job never regresses, even when the caller expects that status",
    async (status) => {
      const { jobId, creationId } = await insertJob(t, { status });

      const result = await t.mutation(internal.creationJobs.casPatch, {
        jobId,
        generation: 1,
        expectStatus: [status, "pending", "transcribed"],
        patch: { status: "pending" },
      });

      expect(result).toEqual({ result: "stale" });
      expect((await readJob(t, DEVICE, creationId))!.status).toBe(status);
    }
  );

  test("a job that has been discarded is not an error", async () => {
    const { jobId } = await insertJob(t);
    await t.run(async (ctx) => {
      await ctx.db.delete(jobId);
    });
    expect(
      await t.mutation(internal.creationJobs.casPatch, {
        jobId,
        generation: 1,
        expectStatus: ["pending"],
        patch: { status: "failed", errorCode: "internal" },
      })
    ).toEqual({ result: "stale" });
  });
});

// ─── 1.5 cancel, against a commit, both orders ──────────────────────────────

describe("cancel vs commit", () => {
  test("cancel first: the commit that follows writes nothing", async () => {
    const audioStorageId = await storeAudio(t);
    const { jobId, creationId } = await insertJob(t, {
      status: "transcribed",
      audioStorageId,
    });

    const cancelled = await t.mutation(api.creationJobs.cancel, {
      deviceId: DEVICE,
      creationId,
    });
    expect(cancelled).toEqual({ status: "cancelled" });
    expect(await scheduledOf(t, BLOB_DELETE)).toHaveLength(1);

    const committed = await t.mutation(internal.creationJobs.commit, {
      jobId,
      generation: 1,
      plans: [commitPlan()],
    });

    expect(committed.result).toBe("stale");
    expect(await allReminders(t)).toHaveLength(0);
    expect((await readJob(t, DEVICE, creationId))!.status).toBe("cancelled");
  });

  test("commit first: the cancel that follows hands the take back to the client", async () => {
    const audioStorageId = await storeAudio(t);
    const { jobId, creationId } = await insertJob(t, {
      status: "transcribed",
      audioStorageId,
    });

    const committed = await t.mutation(internal.creationJobs.commit, {
      jobId,
      generation: 1,
      plans: [commitPlan(), commitPlan({ title: "Pills", ttsText: "Take your pills." })],
    });

    const cancelled = await t.mutation(api.creationJobs.cancel, {
      deviceId: DEVICE,
      creationId,
    });

    expect(cancelled).toEqual({
      status: "committed",
      reminderIds: committed.reminderIds,
    });
    // The rows stay: deleting them is the existing removal flow's job, and it
    // has to wait for each row's audio to settle (C6).
    expect(await allReminders(t)).toHaveLength(2);
  });
});

describe("cancel", () => {
  test.each(["pending", "transcribed"] as const)(
    "a %s job is cancelled and its recording is scheduled for deletion",
    async (status) => {
      const audioStorageId = await storeAudio(t);
      const { creationId } = await insertJob(t, { status, audioStorageId });

      expect(await t.mutation(api.creationJobs.cancel, { deviceId: DEVICE, creationId })).toEqual({
        status: "cancelled",
      });
      expect(await scheduledOf(t, BLOB_DELETE)).toHaveLength(1);
    }
  );

  test("a second cancel is idempotent, and so is cancelling a failed job", async () => {
    const { creationId } = await insertJob(t, { status: "cancelled" });
    expect(await t.mutation(api.creationJobs.cancel, { deviceId: DEVICE, creationId })).toEqual({
      status: "cancelled",
    });

    const { creationId: failed } = await insertJob(t, { status: "failed" });
    expect(
      await t.mutation(api.creationJobs.cancel, { deviceId: DEVICE, creationId: failed })
    ).toEqual({ status: "failed" });
    expect(await scheduledNames(t)).toEqual([]);
  });

  test("an upload that finished after the job was gone hands over its orphan blob", async () => {
    const orphanStorageId = await storeAudio(t, "orphan");

    expect(
      await t.mutation(api.creationJobs.cancel, {
        deviceId: DEVICE,
        creationId: "never_begun",
        orphanStorageId,
      })
    ).toEqual({ status: "not_found" });

    const deletes = await scheduledOf(t, BLOB_DELETE);
    expect(deletes).toHaveLength(1);
    expect(deletes[0].args[0]).toEqual({ storageId: orphanStorageId });
  });

  test("a re-upload's orphan is deleted alongside the job's own recording", async () => {
    const audioStorageId = await storeAudio(t, "first");
    const orphanStorageId = await storeAudio(t, "second");
    const { creationId } = await insertJob(t, { audioStorageId });

    await t.mutation(api.creationJobs.cancel, { deviceId: DEVICE, creationId, orphanStorageId });

    const deleted = (await scheduledOf(t, BLOB_DELETE)).map(
      (row) => (row.args[0] as { storageId: string }).storageId
    );
    expect(new Set(deleted)).toEqual(new Set([audioStorageId, orphanStorageId]));
  });

  test("another device cannot cancel a job it did not begin", async () => {
    const { creationId } = await insertJob(t);
    expect(
      await t.mutation(api.creationJobs.cancel, { deviceId: OTHER_DEVICE, creationId })
    ).toEqual({ status: "not_found" });
    expect((await readJob(t, DEVICE, creationId))!.status).toBe("pending");
  });
});

// ─── 1.5 retry ──────────────────────────────────────────────────────────────

describe("retry", () => {
  test("bumps generation and attempts, re-arms the job and schedules the new worker", async () => {
    const audioStorageId = await storeAudio(t);
    const { jobId, creationId } = await insertJob(t, {
      status: "failed",
      errorCode: "stt_failed",
      audioStorageId,
      attempts: 1,
    });

    const result = await t.mutation(api.creationJobs.retry, { deviceId: DEVICE, creationId });

    expect(result).toEqual({ status: "pending", generation: 2 });
    const job = await readJob(t, DEVICE, creationId);
    expect(job).toMatchObject({ status: "pending", generation: 2, attempts: 2, audioStorageId });
    expect(job!.errorCode).toBeUndefined();

    const workers = await scheduledOf(t, WORKER);
    expect(workers).toHaveLength(1);
    expect(workers[0].args[0]).toEqual({ jobId, generation: 2 });
    // The blob is reused, so nothing is deleted.
    expect(await scheduledOf(t, BLOB_DELETE)).toHaveLength(0);
  });

  test("an identical newStorageId is not a swap and does not delete the blob", async () => {
    const audioStorageId = await storeAudio(t);
    const { creationId } = await insertJob(t, {
      status: "failed",
      errorCode: "stt_failed",
      audioStorageId,
    });

    await t.mutation(api.creationJobs.retry, {
      deviceId: DEVICE,
      creationId,
      newStorageId: audioStorageId,
    });

    expect((await readJob(t, DEVICE, creationId))!.audioStorageId).toBe(audioStorageId);
    expect(await scheduledOf(t, BLOB_DELETE)).toHaveLength(0);
  });

  test("a different newStorageId swaps the recording and drops the old one", async () => {
    const audioStorageId = await storeAudio(t, "first");
    const newStorageId = await storeAudio(t, "re-upload");
    const { creationId } = await insertJob(t, {
      status: "failed",
      errorCode: "storage_missing",
      audioStorageId,
    });

    await t.mutation(api.creationJobs.retry, { deviceId: DEVICE, creationId, newStorageId });

    expect((await readJob(t, DEVICE, creationId))!.audioStorageId).toBe(newStorageId);
    const deletes = await scheduledOf(t, BLOB_DELETE);
    expect(deletes).toHaveLength(1);
    expect(deletes[0].args[0]).toEqual({ storageId: audioStorageId });
  });

  test("the third failure is the last: retry reports the cap and changes nothing", async () => {
    const { creationId } = await insertJob(t, { status: "failed", attempts: 3, generation: 3 });

    expect(await t.mutation(api.creationJobs.retry, { deviceId: DEVICE, creationId })).toEqual({
      status: "failed",
      generation: 3,
      capReached: true,
    });
    expect((await readJob(t, DEVICE, creationId))!.attempts).toBe(3);
    expect(await scheduledNames(t)).toEqual([]);
  });

  test.each(["pending", "transcribed", "committed", "cancelled"] as const)(
    "a %s job is not retryable",
    async (status) => {
      const { creationId } = await insertJob(t, { status });

      expect(await t.mutation(api.creationJobs.retry, { deviceId: DEVICE, creationId })).toEqual({
        status,
        generation: 1,
      });
      expect((await readJob(t, DEVICE, creationId))!.generation).toBe(1);
      expect(await scheduledNames(t)).toEqual([]);
    }
  );

  test("a missing job, or another device's, is not_found", async () => {
    const { creationId } = await insertJob(t, { status: "failed" });
    expect(
      await t.mutation(api.creationJobs.retry, { deviceId: OTHER_DEVICE, creationId })
    ).toEqual({ status: "not_found" });
    expect(
      await t.mutation(api.creationJobs.retry, { deviceId: DEVICE, creationId: "nope" })
    ).toEqual({ status: "not_found" });
  });

  test("the superseded worker's next write is refused after the bump", async () => {
    const { jobId, creationId } = await insertJob(t, { status: "failed", errorCode: "stt_failed" });
    await t.mutation(api.creationJobs.retry, { deviceId: DEVICE, creationId });

    const late = await t.mutation(internal.creationJobs.casPatch, {
      jobId,
      generation: 1,
      expectStatus: ["pending"],
      patch: { status: "transcribed", transcript: "from the old run" },
    });

    expect(late).toEqual({ result: "stale" });
    expect((await readJob(t, DEVICE, creationId))!.status).toBe("pending");
  });
});

// ─── 1.5 discard ────────────────────────────────────────────────────────────

describe("discard", () => {
  test.each(["failed", "cancelled"] as const)(
    "a %s job's row and recording both go",
    async (status) => {
      const audioStorageId = await storeAudio(t);
      const { creationId } = await insertJob(t, { status, audioStorageId });

      expect(await t.mutation(api.creationJobs.discard, { deviceId: DEVICE, creationId })).toEqual({
        status: "discarded",
      });
      expect(await readJob(t, DEVICE, creationId)).toBeNull();
      expect(await scheduledOf(t, BLOB_DELETE)).toHaveLength(1);
    }
  );

  test.each(["pending", "transcribed", "committed"] as const)(
    "a %s job is left alone",
    async (status) => {
      const { creationId } = await insertJob(t, { status });

      expect(await t.mutation(api.creationJobs.discard, { deviceId: DEVICE, creationId })).toEqual({
        status,
      });
      expect(await readJob(t, DEVICE, creationId)).not.toBeNull();
    }
  );

  test("a missing job, or another device's, is not_found", async () => {
    const { creationId } = await insertJob(t, { status: "failed" });
    expect(
      await t.mutation(api.creationJobs.discard, { deviceId: OTHER_DEVICE, creationId })
    ).toEqual({ status: "not_found" });
    expect(await readJob(t, DEVICE, creationId)).not.toBeNull();
  });
});

// ─── 1.6 sweep ──────────────────────────────────────────────────────────────

const NOW = 1_800_000_000_000;
const STALE_WINDOW = 5 * MINUTE;

describe("sweepStale — stale in-flight jobs", () => {
  test("the boundary is strict: exactly five minutes old survives, a millisecond older does not", async () => {
    freezeClock(NOW);
    const onTheLine = await insertJob(t, {
      status: "pending",
      updatedAt: NOW - STALE_WINDOW,
    });
    const justPast = await insertJob(t, {
      status: "pending",
      updatedAt: NOW - STALE_WINDOW - 1,
    });

    const result = await t.mutation(internal.creationJobs.sweepStale, {});

    expect(result).toEqual({ failed: 1, collected: 0 });
    expect((await readJobById(t, onTheLine.jobId))!.status).toBe("pending");
    const swept = await readJobById(t, justPast.jobId);
    expect(swept).toMatchObject({ status: "failed", errorCode: "internal" });
  });

  test("a transcribed job that lost its worker is swept too", async () => {
    freezeClock(NOW);
    const { jobId } = await insertJob(t, {
      status: "transcribed",
      transcript: "water at eight",
      updatedAt: NOW - 10 * MINUTE,
    });

    await t.mutation(internal.creationJobs.sweepStale, {});

    expect(await readJobById(t, jobId)).toMatchObject({
      status: "failed",
      errorCode: "internal",
      transcript: "water at eight",
    });
  });

  test("a retry that beat the sweep here keeps the job alive", async () => {
    freezeClock(NOW);
    // Old enough to sweep, but the retry has already re-armed it.
    const { jobId, creationId } = await insertJob(t, {
      status: "failed",
      errorCode: "stt_failed",
      updatedAt: NOW - 10 * MINUTE,
    });
    await t.mutation(api.creationJobs.retry, { deviceId: DEVICE, creationId });

    await t.mutation(internal.creationJobs.sweepStale, {});

    // The retry set updatedAt to now, so the job is no longer in the window.
    expect(await readJobById(t, jobId)).toMatchObject({ status: "pending", generation: 2 });
  });

  test("one sweep touches at most 25 documents", async () => {
    freezeClock(NOW);
    for (let i = 0; i < 30; i++) {
      await insertJob(t, { status: "pending", updatedAt: NOW - 10 * MINUTE });
    }

    const first = await t.mutation(internal.creationJobs.sweepStale, {});
    expect(first).toEqual({ failed: 25, collected: 0 });
    const stillPending = (await allJobs(t)).filter((job) => job.status === "pending");
    expect(stillPending).toHaveLength(5);

    // The next pass gets the rest — and now has budget left for the GC half,
    // which collects nothing because everything it just failed is fresh.
    const second = await t.mutation(internal.creationJobs.sweepStale, {});
    expect(second).toEqual({ failed: 5, collected: 0 });
  });
});

describe("sweepStale — retention", () => {
  test("a cancelled job is collected after a day, with its recording", async () => {
    freezeClock(NOW);
    const audioStorageId = await storeAudio(t);
    const young = await insertJob(t, { status: "cancelled", updatedAt: NOW - 23 * HOUR });
    const old = await insertJob(t, {
      status: "cancelled",
      updatedAt: NOW - 25 * HOUR,
      audioStorageId,
    });

    const result = await t.mutation(internal.creationJobs.sweepStale, {});

    expect(result).toEqual({ failed: 0, collected: 1 });
    expect(await readJobById(t, young.jobId)).not.toBeNull();
    expect(await readJobById(t, old.jobId)).toBeNull();
    const deletes = await scheduledOf(t, BLOB_DELETE);
    expect(deletes).toHaveLength(1);
    expect(deletes[0].args[0]).toEqual({ storageId: audioStorageId });
  });

  test("a failed job stays retryable for a week", async () => {
    freezeClock(NOW);
    const young = await insertJob(t, { status: "failed", updatedAt: NOW - 6 * DAY });
    const old = await insertJob(t, { status: "failed", updatedAt: NOW - 8 * DAY });

    expect(await t.mutation(internal.creationJobs.sweepStale, {})).toEqual({
      failed: 0,
      collected: 1,
    });
    expect(await readJobById(t, young.jobId)).not.toBeNull();
    expect(await readJobById(t, old.jobId)).toBeNull();
  });

  test("a committed job goes as soon as it is acked, and otherwise waits a week", async () => {
    freezeClock(NOW);
    const acked = await insertJob(t, {
      status: "committed",
      updatedAt: NOW - MINUTE,
      ackedAt: NOW - 30_000,
    });
    const unackedFresh = await insertJob(t, { status: "committed", updatedAt: NOW - MINUTE });
    const unackedOld = await insertJob(t, { status: "committed", updatedAt: NOW - 8 * DAY });

    expect(await t.mutation(internal.creationJobs.sweepStale, {})).toEqual({
      failed: 0,
      collected: 2,
    });
    expect(await readJobById(t, acked.jobId)).toBeNull();
    expect(await readJobById(t, unackedOld.jobId)).toBeNull();
    expect(await readJobById(t, unackedFresh.jobId)).not.toBeNull();
  });

  test("an acked take is only collectable through the public ack, not by age", async () => {
    freezeClock(NOW);
    const { jobId, creationId } = await insertJob(t, {
      status: "committed",
      updatedAt: NOW - MINUTE,
    });

    expect(await t.mutation(internal.creationJobs.sweepStale, {})).toEqual({
      failed: 0,
      collected: 0,
    });

    await t.mutation(api.creationJobs.ack, { deviceId: DEVICE, creationId });
    expect(await t.mutation(internal.creationJobs.sweepStale, {})).toEqual({
      failed: 0,
      collected: 1,
    });
    expect(await readJobById(t, jobId)).toBeNull();
  });

  test("spends its budget on rows it deletes, never on rows it keeps", async () => {
    freezeClock(NOW);
    // Thirty young cancelled takes sit at the head of the status index. Taking
    // the oldest N of a status and only THEN asking whether each is old enough
    // burns the whole sweep on rows it keeps — every five minutes, forever —
    // and the week-old failed job behind them is never reached.
    for (let i = 0; i < 30; i++) {
      await insertJob(t, { status: "cancelled", updatedAt: NOW - HOUR });
    }
    const collectable = await insertJob(t, { status: "failed", updatedAt: NOW - 8 * DAY });

    expect(await t.mutation(internal.creationJobs.sweepStale, {})).toEqual({
      failed: 0,
      collected: 1,
    });
    expect(await readJobById(t, collectable.jobId)).toBeNull();
    expect((await allJobs(t)).filter((job) => job.status === "cancelled")).toHaveLength(30);
  });

  test("an acked take is collected even behind a crowd of unacked young ones", async () => {
    freezeClock(NOW);
    for (let i = 0; i < 30; i++) {
      await insertJob(t, { status: "committed", updatedAt: NOW - HOUR });
    }
    const acked = await insertJob(t, {
      status: "committed",
      updatedAt: NOW - MINUTE,
      ackedAt: NOW - 30_000,
    });

    expect(await t.mutation(internal.creationJobs.sweepStale, {})).toEqual({
      failed: 0,
      collected: 1,
    });
    expect(await readJobById(t, acked.jobId)).toBeNull();
  });

  test("collects at most a batch of expired rows in one pass", async () => {
    freezeClock(NOW);
    for (let i = 0; i < 30; i++) {
      await insertJob(t, { status: "cancelled", updatedAt: NOW - 2 * DAY });
    }

    expect(await t.mutation(internal.creationJobs.sweepStale, {})).toEqual({
      failed: 0,
      collected: 25,
    });
    expect(await allJobs(t)).toHaveLength(5);

    expect(await t.mutation(internal.creationJobs.sweepStale, {})).toEqual({
      failed: 0,
      collected: 5,
    });
  });

  test("the stale half spends the budget first, so a full sweep collects nothing", async () => {
    freezeClock(NOW);
    for (let i = 0; i < 25; i++) {
      await insertJob(t, { status: "pending", updatedAt: NOW - 10 * MINUTE });
    }
    const collectable = await insertJob(t, { status: "cancelled", updatedAt: NOW - 2 * DAY });

    expect(await t.mutation(internal.creationJobs.sweepStale, {})).toEqual({
      failed: 25,
      collected: 0,
    });
    expect(await readJobById(t, collectable.jobId)).not.toBeNull();
  });
});
