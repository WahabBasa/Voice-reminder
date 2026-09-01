/**
 * The creation job's happy path, end to end, against a real (mocked) backend:
 * `begin` → `commit` → `getReminders` → `ack`.
 *
 * The worker action itself is never run here — it would need Whisper and the
 * parse model — so `commit` is called directly with the plans a worker would
 * have handed it. What is under test is the server contract the client watches,
 * not the transcription.
 */

import { beforeEach, describe, expect, test } from "vitest";
import { api, internal } from "../../convex/_generated/api";
import {
  BLOB_DELETE,
  CLOCK,
  DEVICE,
  Harness,
  OTHER_DEVICE,
  TTS,
  WORKER,
  allReminders,
  commitPlan,
  harness,
  insertJob,
  patchJob,
  readJob,
  scheduledNames,
  scheduledOf,
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

// ─── 1.2 begin ──────────────────────────────────────────────────────────────

describe("begin", () => {
  test("inserts a pending job at generation 1 and schedules exactly one worker", async () => {
    const begun = await begin();

    expect(begun).toMatchObject({ status: "pending", generation: 1 });
    const job = await readJob(t, DEVICE, "take_1");
    expect(job).toMatchObject({
      status: "pending",
      generation: 1,
      attempts: 1,
      deviceId: DEVICE,
      creationId: "take_1",
      ...CLOCK,
    });
    expect(job!.createdAt).toBe(job!.updatedAt);

    const workers = await scheduledOf(t, WORKER);
    expect(workers).toHaveLength(1);
    expect(workers[0].args[0]).toMatchObject({ jobId: begun.jobId, generation: 1 });
  });

  test("is idempotent: a second begin returns the same job and schedules nothing", async () => {
    const first = await begin();
    const second = await begin();

    expect(second.jobId).toBe(first.jobId);
    expect(second).toMatchObject({ status: "pending", generation: 1 });
    expect(await scheduledOf(t, WORKER)).toHaveLength(1);
  });

  test("re-begin after the worker moved the job reports the live status, not pending", async () => {
    const begun = await begin();
    await patchJob(t, begun.jobId, { status: "transcribed", transcript: "water at eight" });

    const again = await begin();
    expect(again).toMatchObject({ jobId: begun.jobId, status: "transcribed", generation: 1 });
    expect(await scheduledOf(t, WORKER)).toHaveLength(1);
  });

  test("the same creationId on another device is a different job", async () => {
    const mine = await begin();
    const theirs = await begin({ deviceId: OTHER_DEVICE });

    expect(theirs.jobId).not.toBe(mine.jobId);
    expect(await scheduledOf(t, WORKER)).toHaveLength(2);
  });
});

// ─── 1.4 get ────────────────────────────────────────────────────────────────

describe("get", () => {
  test("returns the watched projection, perf included", async () => {
    const { creationId } = await insertJob(t, {
      status: "transcribed",
      transcript: "water at eight",
      perf: { whisperMs: 900, parseMs: 400 },
    });

    const watched = await t.query(api.creationJobs.get, { deviceId: DEVICE, creationId });
    expect(watched).toEqual({
      status: "transcribed",
      generation: 1,
      transcript: "water at eight",
      errorCode: undefined,
      reminderIds: undefined,
      perf: { whisperMs: 900, parseMs: 400 },
      updatedAt: expect.any(Number),
    });
  });

  test("is null for an unknown creationId and for another device's job", async () => {
    const { creationId } = await insertJob(t);

    expect(await t.query(api.creationJobs.get, { deviceId: DEVICE, creationId: "nope" })).toBeNull();
    expect(
      await t.query(api.creationJobs.get, { deviceId: OTHER_DEVICE, creationId })
    ).toBeNull();
  });
});

// ─── 1.4 commit ─────────────────────────────────────────────────────────────

describe("commit", () => {
  async function transcribedJob(over: Record<string, unknown> = {}) {
    const audioStorageId = await storeAudio(t);
    return await insertJob(t, {
      status: "transcribed",
      transcript: "water at eight",
      audioStorageId,
      ...over,
    });
  }

  test("rows, creationId stamps, TTS schedules and status all land together", async () => {
    const { jobId, creationId } = await transcribedJob();

    const result = await t.mutation(internal.creationJobs.commit, {
      jobId,
      generation: 1,
      plans: [
        commitPlan({ title: "Water", ttsText: "Drink your water." }),
        commitPlan({
          title: "Pills",
          description: "Take your pills.",
          ttsText: "Take your pills.",
          preTtsText: "Pills in 10 minutes",
          preReminderMinutes: 10,
        }),
      ],
      preCommitPerf: { whisperMs: 900, parseMs: 400 },
    });

    expect(result.result).toBe("applied");
    expect(result.reminderIds).toHaveLength(2);

    const job = await readJob(t, DEVICE, creationId);
    expect(job).toMatchObject({
      status: "committed",
      reminderIds: result.reminderIds,
      perf: { whisperMs: 900, parseMs: 400 },
    });

    const rows = await allReminders(t);
    expect(rows).toHaveLength(2);
    // Insertion order is the order `reminderIds` records.
    expect(result.reminderIds!.map((id) => id as string)).toEqual(
      rows
        .slice()
        .sort((a, b) => a._creationTime - b._creationTime)
        .map((row) => row._id as string)
    );
    for (const row of rows) {
      expect(row.deviceId).toBe(DEVICE);
      expect(row.creationId).toBe(creationId);
      expect(row.audioStatus).toBe("pending");
      expect(row.audioStorageId).toBeUndefined();
    }
    // audioExtrasStatus is set only for the row that asked for a pre-alert.
    const byTitle = Object.fromEntries(rows.map((row) => [row.title, row]));
    expect(byTitle.Water.audioExtrasStatus).toBeUndefined();
    expect(byTitle.Pills.audioExtrasStatus).toBe("pending");
    expect(byTitle.Pills.preReminderMinutes).toBe(10);

    // One TTS job per row, plus the recording's cleanup.
    const tts = await scheduledOf(t, TTS);
    expect(tts).toHaveLength(2);
    expect(tts.map((row) => (row.args[0] as { title: string }).title)).toEqual(["Water", "Pills"]);
    expect((tts[1].args[0] as { preTtsText?: string }).preTtsText).toBe("Pills in 10 minutes");
    expect(await scheduledOf(t, BLOB_DELETE)).toHaveLength(1);
  });

  test("the schedule columns survive the trip through the plan validator", async () => {
    const { jobId } = await transcribedJob();
    const grid = {
      type: "grid" as const,
      days: { kind: "weekdays" as const, days: ["mon", "thu"] },
      times: { kind: "clock" as const, times: ["08:00", "21:00"] },
      tzid: CLOCK.timezone,
    };

    await t.mutation(internal.creationJobs.commit, {
      jobId,
      generation: 1,
      plans: [
        commitPlan({
          time: "08:00",
          date: undefined,
          frequency: "custom",
          days: ["mon", "thu"],
          schedule: grid,
          scheduleType: "rrule",
          onceAt: undefined,
          rrule: "FREQ=WEEKLY;BYDAY=MO,TH;BYHOUR=8;BYMINUTE=0",
          dtstart: 1_700_000_000_000,
          until: 1_800_000_000_000,
          parseWarnings: ["Transcript implies weekdays."],
        }),
      ],
    });

    const [row] = await allReminders(t);
    expect(row).toMatchObject({
      time: "08:00",
      frequency: "custom",
      days: ["mon", "thu"],
      schedule: grid,
      scheduleType: "rrule",
      rrule: "FREQ=WEEKLY;BYDAY=MO,TH;BYHOUR=8;BYMINUTE=0",
      dtstart: 1_700_000_000_000,
      until: 1_800_000_000_000,
      tzid: CLOCK.timezone,
      parseWarnings: ["Transcript implies weekdays."],
    });
    expect(row.date).toBeUndefined();
    expect(row.onceAt).toBeUndefined();
  });

  test("a stale generation writes nothing at all", async () => {
    const { jobId, creationId } = await transcribedJob({ generation: 4 });

    const result = await t.mutation(internal.creationJobs.commit, {
      jobId,
      generation: 3,
      plans: [commitPlan()],
    });

    expect(result.result).toBe("stale");
    expect(await allReminders(t)).toHaveLength(0);
    expect(await scheduledNames(t)).toEqual([]);
    expect((await readJob(t, DEVICE, creationId))!.status).toBe("transcribed");
  });

  test("a job that is not transcribed is not committable", async () => {
    const { jobId } = await insertJob(t, { status: "pending" });
    const result = await t.mutation(internal.creationJobs.commit, {
      jobId,
      generation: 1,
      plans: [commitPlan()],
    });
    expect(result.result).toBe("stale");
    expect(await allReminders(t)).toHaveLength(0);
  });
});

// ─── 1.4 getReminders ───────────────────────────────────────────────────────

describe("getReminders", () => {
  async function committedTake(planCount = 3) {
    const audioStorageId = await storeAudio(t);
    const { jobId, creationId } = await insertJob(t, {
      status: "transcribed",
      audioStorageId,
    });
    const result = await t.mutation(internal.creationJobs.commit, {
      jobId,
      generation: 1,
      plans: Array.from({ length: planCount }, (_, i) =>
        commitPlan({ title: `Row ${i}`, description: `Line ${i}.`, ttsText: `Line ${i}.` })
      ),
    });
    return { jobId, creationId, reminderIds: result.reminderIds! };
  }

  test("returns the rows in reminderIds order, projected for the client", async () => {
    const { creationId, reminderIds } = await committedTake();

    const rows = await t.query(api.creationJobs.getReminders, { deviceId: DEVICE, creationId });
    expect(rows).not.toBeNull();
    expect(rows!.map((row) => row.id)).toEqual(reminderIds.map((id) => id as string));
    expect(rows!.map((row) => (row as { title: string }).title)).toEqual([
      "Row 0",
      "Row 1",
      "Row 2",
    ]);

    // `_id` arrives as `id`, `creationId` rides on every row, the internal
    // columns do not cross the wire.
    const first = rows![0] as Record<string, unknown>;
    expect(first.creationId).toBe(creationId);
    expect(first._id).toBeUndefined();
    expect(first._creationTime).toBeUndefined();
    expect(first.deviceId).toBeUndefined();
    expect(first).toMatchObject({
      audioStatus: "pending",
      audioUrl: "",
      wavUrl: "",
      preAudioUrl: "",
      schedule: expect.any(Object),
      scheduleType: "once",
    });
    expect(first.createdAt).toEqual(expect.any(Number));
  });

  test("a row the user already deleted comes back as a placeholder in its slot", async () => {
    const { creationId, reminderIds } = await committedTake();
    await t.run(async (ctx) => {
      await ctx.db.delete(reminderIds[1]);
    });

    const rows = await t.query(api.creationJobs.getReminders, { deviceId: DEVICE, creationId });
    expect(rows).toHaveLength(3);
    expect(rows![1]).toEqual({ id: reminderIds[1] as string, deleted: true });
    expect((rows![0] as { title: string }).title).toBe("Row 0");
    expect((rows![2] as { title: string }).title).toBe("Row 2");
  });

  test("a row claimed by another device is a placeholder, not a leak", async () => {
    const { creationId, reminderIds } = await committedTake(1);
    await t.run(async (ctx) => {
      await ctx.db.patch(reminderIds[0], { deviceId: OTHER_DEVICE });
    });

    const rows = await t.query(api.creationJobs.getReminders, { deviceId: DEVICE, creationId });
    expect(rows).toEqual([{ id: reminderIds[0] as string, deleted: true }]);
  });

  test("resolves stored audio urls the same way the public reminder reads do", async () => {
    const { creationId, reminderIds } = await committedTake(1);
    const audioStorageId = await storeAudio(t, "mp3");
    await t.run(async (ctx) => {
      await ctx.db.patch(reminderIds[0], { audioStorageId, audioStatus: "ready" });
    });

    const rows = await t.query(api.creationJobs.getReminders, { deviceId: DEVICE, creationId });
    const row = rows![0] as { audioUrl: string; wavUrl: string };
    expect(row.audioUrl).toEqual(expect.any(String));
    expect(row.audioUrl.length).toBeGreaterThan(0);
    expect(row.wavUrl).toBe("");
  });

  test("is null unless the job is committed and the caller owns it", async () => {
    const { creationId } = await committedTake(1);
    expect(
      await t.query(api.creationJobs.getReminders, { deviceId: OTHER_DEVICE, creationId })
    ).toBeNull();
    expect(
      await t.query(api.creationJobs.getReminders, { deviceId: DEVICE, creationId: "nope" })
    ).toBeNull();

    const { creationId: pending } = await insertJob(t, { status: "pending" });
    expect(
      await t.query(api.creationJobs.getReminders, { deviceId: DEVICE, creationId: pending })
    ).toBeNull();
  });
});

// ─── 1.4 ack ────────────────────────────────────────────────────────────────

describe("ack", () => {
  test("stamps ackedAt once and is a no-op afterwards", async () => {
    const { jobId, creationId } = await insertJob(t, { status: "committed" });

    const first = await t.mutation(api.creationJobs.ack, { deviceId: DEVICE, creationId });
    expect(first).toEqual({ status: "committed" });
    const acked = (await readJob(t, DEVICE, creationId))!.ackedAt;
    expect(acked).toEqual(expect.any(Number));

    // A sentinel proves the second ack does not re-stamp.
    await patchJob(t, jobId, { ackedAt: 12345 });
    await t.mutation(api.creationJobs.ack, { deviceId: DEVICE, creationId });
    expect((await readJob(t, DEVICE, creationId))!.ackedAt).toBe(12345);
  });

  test("does not touch updatedAt, so the GC still sees the job as old", async () => {
    const { jobId, creationId } = await insertJob(t, { status: "committed" });
    await patchJob(t, jobId, { updatedAt: 1000 });

    await t.mutation(api.creationJobs.ack, { deviceId: DEVICE, creationId });
    expect((await readJob(t, DEVICE, creationId))!.updatedAt).toBe(1000);
  });

  test("is a no-op on a job that is not committed, and on another device's job", async () => {
    const { creationId } = await insertJob(t, { status: "pending" });
    expect(await t.mutation(api.creationJobs.ack, { deviceId: DEVICE, creationId })).toEqual({
      status: "pending",
    });
    expect((await readJob(t, DEVICE, creationId))!.ackedAt).toBeUndefined();

    expect(
      await t.mutation(api.creationJobs.ack, { deviceId: OTHER_DEVICE, creationId })
    ).toEqual({ status: "not_found" });
    expect(
      await t.mutation(api.creationJobs.ack, { deviceId: DEVICE, creationId: "nope" })
    ).toEqual({ status: "not_found" });
  });
});

// ─── 1.3 perfPatch ──────────────────────────────────────────────────────────

describe("perfPatch", () => {
  test("merges timings without touching status or updatedAt", async () => {
    const { jobId, creationId } = await insertJob(t, {
      status: "committed",
      perf: { whisperMs: 900, parseMs: 400 },
      updatedAt: 1000,
    });

    const result = await t.mutation(internal.creationJobs.perfPatch, {
      jobId,
      perf: { commitMs: 30, totalMs: 4200 },
    });

    expect(result).toEqual({ result: "applied" });
    const job = await readJob(t, DEVICE, creationId);
    expect(job!.perf).toEqual({ whisperMs: 900, parseMs: 400, commitMs: 30, totalMs: 4200 });
    expect(job!.status).toBe("committed");
    expect(job!.updatedAt).toBe(1000);
  });

  test("a job that has been collected is not an error", async () => {
    const { jobId } = await insertJob(t);
    await t.run(async (ctx) => {
      await ctx.db.delete(jobId);
    });
    expect(
      await t.mutation(internal.creationJobs.perfPatch, { jobId, perf: { totalMs: 1 } })
    ).toEqual({ result: "missing" });
  });
});
