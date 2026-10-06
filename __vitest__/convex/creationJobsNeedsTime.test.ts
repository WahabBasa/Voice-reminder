/**
 * "When should I remind you?" against the mocked backend (founder decision,
 * 2026-10-06).
 *
 * A `no_time`/`past_time` failure keeps its plans on the row: the compact view
 * reaches the document the client watches, the full plans never do, and
 * `resolveWithTime` commits them with the time the user picked — through the
 * same insert as a take's own commit, so the spoken line is voiced by the usual
 * TTS job in the voice its language picks. The worker's half (what it stores)
 * has its own jest suite; here the failure is written the way it writes it.
 */

import { beforeEach, describe, expect, test } from "vitest";
import { api, internal } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import {
  CLOCK,
  DEVICE,
  OTHER_DEVICE,
  TTS,
  Harness,
  allReminders,
  commitPlan,
  harness,
  insertJob,
  readJob,
  scheduledOf,
} from "./harness";

let t: Harness;

beforeEach(() => {
  t = harness();
});

const DENTIST = {
  title: "Ring tandläkaren",
  description: "Dags att ringa tandläkaren.",
  emoji: "🦷",
  lang: "sv",
  frequency: "once",
  needsTime: true,
};
const PILLS = { title: "Pills", description: "Take your pills.", frequency: "daily", needsTime: false };

const dentistHeld = () =>
  commitPlan({
    title: DENTIST.title,
    description: DENTIST.description,
    ttsText: DENTIST.description,
    emoji: DENTIST.emoji,
    lang: "sv",
  });
const pillsHeld = () =>
  commitPlan({
    title: "Pills",
    description: "Take your pills.",
    ttsText: "Take your pills.",
    emoji: undefined,
    time: "08:00",
    date: undefined,
    frequency: "daily",
    schedule: {
      type: "grid" as const,
      days: { kind: "everyday" as const },
      times: { kind: "clock" as const, times: ["08:00"] },
      tzid: CLOCK.timezone,
    },
    scheduleType: "rrule" as const,
    onceAt: undefined,
    rrule: "FREQ=DAILY;BYHOUR=8;BYMINUTE=0",
    dtstart: Date.now(),
    lang: "en",
  });

/** A day after "now", whatever the clock reads: a picked time that is ahead. */
function tomorrowAt(time: string) {
  const date = new Date(Date.now() + 2 * 86_400_000).toISOString().slice(0, 10);
  return {
    type: "grid" as const,
    days: { kind: "date" as const, date },
    times: { kind: "clock" as const, times: [time] },
    tzid: CLOCK.timezone,
  };
}

async function failAsking(
  over: { errorDetail?: "no_time" | "past_time"; plans?: "one" | "two" } = {}
): Promise<{ jobId: Id<"creationJobs">; creationId: string }> {
  const { jobId, creationId } = await insertJob(t, {
    clientFeatures: ["guard_v1"],
    status: "transcribed",
    transcript: "påminn mig att ringa tandläkaren",
  });
  const two = over.plans === "two";
  await t.mutation(internal.creationJobs.casPatch, {
    jobId,
    generation: 1,
    expectStatus: ["pending", "transcribed"],
    patch: {
      status: "failed",
      errorCode: "unparseable",
      errorDetail: over.errorDetail ?? "no_time",
      ...(over.errorDetail === "past_time" ? { pastTime: "10:00" } : {}),
      pendingPlans: two ? [PILLS, DENTIST] : [DENTIST],
      heldPlans: two ? [pillsHeld(), dentistHeld()] : [dentistHeld()],
    },
  });
  return { jobId, creationId };
}

describe("the kept plans on the watched document", () => {
  test("no_time: get returns the compact plans, never the held ones", async () => {
    const { creationId } = await failAsking();
    const watched = await t.query(api.creationJobs.get, { deviceId: DEVICE, creationId });
    expect(watched).toMatchObject({
      status: "failed",
      errorCode: "unparseable",
      errorDetail: "no_time",
      pendingPlans: [DENTIST],
    });
    expect(watched).not.toHaveProperty("heldPlans");
    expect((await readJob(t, DEVICE, creationId))!.heldPlans).toHaveLength(1);
  });

  test("past_time: the plans and the time that had passed", async () => {
    const { creationId } = await failAsking({ errorDetail: "past_time" });
    expect(await t.query(api.creationJobs.get, { deviceId: DEVICE, creationId })).toMatchObject({
      errorDetail: "past_time",
      pastTime: "10:00",
      pendingPlans: [DENTIST],
    });
  });

  test("any other failure exposes exactly the old keys", async () => {
    const { jobId, creationId } = await insertJob(t);
    await t.mutation(internal.creationJobs.casPatch, {
      jobId,
      generation: 1,
      expectStatus: ["pending"],
      patch: { status: "failed", errorCode: "internal" },
    });
    const watched = await t.query(api.creationJobs.get, { deviceId: DEVICE, creationId });
    expect(watched).not.toHaveProperty("pendingPlans");
    expect(watched).not.toHaveProperty("heldPlans");
  });

  test("a retry clears them with the rest of the failure", async () => {
    const { creationId } = await failAsking();
    await t.mutation(api.creationJobs.retry, { deviceId: DEVICE, creationId });
    const job = await readJob(t, DEVICE, creationId);
    expect(job!.status).toBe("pending");
    expect(job).not.toHaveProperty("pendingPlans");
    expect(job).not.toHaveProperty("heldPlans");
  });
});

describe("resolveWithTime", () => {
  test("commits the reminder at the picked time, in its own language and voice", async () => {
    const { jobId, creationId } = await failAsking();
    const result = await t.mutation(api.creationJobs.resolveWithTime, {
      deviceId: DEVICE,
      creationId,
      schedule: tomorrowAt("09:00"),
    });

    expect(result.status).toBe("committed");
    expect(result.reminderIds).toHaveLength(1);

    const [row] = await allReminders(t);
    expect(row).toMatchObject({
      title: DENTIST.title,
      description: DENTIST.description,
      emoji: "🦷",
      lang: "sv",
      time: "09:00",
      frequency: "once",
      scheduleType: "once",
      deviceId: DEVICE,
      creationId,
      audioStatus: "pending",
    });

    // The spoken line goes to the usual TTS job, with its language (OLD-131).
    const [tts] = await scheduledOf(t, TTS);
    expect(tts.args[0]).toMatchObject({
      reminderId: row._id,
      ttsText: DENTIST.description,
      lang: "sv",
    });

    // The job reads as any committed take: the client imports its rows.
    const job = await readJob(t, DEVICE, creationId);
    expect(job).toMatchObject({ status: "committed", reminderIds: [row._id] });
    for (const key of ["errorCode", "errorDetail", "pendingPlans", "heldPlans"]) {
      expect(job).not.toHaveProperty(key);
    }
    const imported = await t.query(api.creationJobs.getReminders, { deviceId: DEVICE, creationId });
    expect(imported).toHaveLength(1);
    expect((await scheduledOf(t, "founderAlerts:recordOutcome")).map((r) => r.args[0])).toContainEqual({
      jobId,
      status: "committed",
    });
  });

  test("a take of several: the waiting one gets the time, its sibling keeps its own", async () => {
    const { creationId } = await failAsking({ plans: "two" });
    await t.mutation(api.creationJobs.resolveWithTime, {
      deviceId: DEVICE,
      creationId,
      schedule: tomorrowAt("09:00"),
    });
    const rows = await allReminders(t);
    expect(rows.map((r) => [r.title, r.time, r.frequency])).toEqual([
      ["Pills", "08:00", "daily"],
      [DENTIST.title, "09:00", "once"],
    ]);
  });

  test("the sheet's edits are what is saved and spoken", async () => {
    const { creationId } = await failAsking();
    await t.mutation(api.creationJobs.resolveWithTime, {
      deviceId: DEVICE,
      creationId,
      schedule: tomorrowAt("18:30"),
      edits: { title: "Tandläkaren", description: "Ring tandläkaren nu.", emoji: "📞" },
    });
    const [row] = await allReminders(t);
    expect(row).toMatchObject({
      title: "Tandläkaren",
      description: "Ring tandläkaren nu.",
      emoji: "📞",
      time: "18:30",
      lang: "sv",
    });
    const [tts] = await scheduledOf(t, TTS);
    expect(tts.args[0]).toMatchObject({ ttsText: "Ring tandläkaren nu.", lang: "sv" });
  });

  test("a second tap returns the same rows and creates nothing new", async () => {
    const { creationId } = await failAsking();
    const first = await t.mutation(api.creationJobs.resolveWithTime, {
      deviceId: DEVICE,
      creationId,
      schedule: tomorrowAt("09:00"),
    });
    const second = await t.mutation(api.creationJobs.resolveWithTime, {
      deviceId: DEVICE,
      creationId,
      schedule: tomorrowAt("10:00"),
    });
    expect(second).toEqual(first);
    expect(await allReminders(t)).toHaveLength(1);
  });

  test("a time that has already gone is refused, and the take keeps waiting", async () => {
    const { creationId } = await failAsking();
    const result = await t.mutation(api.creationJobs.resolveWithTime, {
      deviceId: DEVICE,
      creationId,
      schedule: { ...tomorrowAt("09:00"), days: { kind: "date", date: "2020-01-01" } },
    });
    expect(result).toEqual({ status: "invalid" });
    expect(await allReminders(t)).toHaveLength(0);
    expect((await readJob(t, DEVICE, creationId))!.status).toBe("failed");
  });

  test("only a take waiting for a time can be answered", async () => {
    // Another device's take is invisible.
    const { creationId } = await failAsking();
    expect(
      await t.mutation(api.creationJobs.resolveWithTime, {
        deviceId: OTHER_DEVICE,
        creationId,
        schedule: tomorrowAt("09:00"),
      })
    ).toEqual({ status: "not_found" });

    // A take still working.
    const working = await insertJob(t, { status: "pending" });
    expect(
      await t.mutation(api.creationJobs.resolveWithTime, {
        deviceId: DEVICE,
        creationId: working.creationId,
        schedule: tomorrowAt("09:00"),
      })
    ).toEqual({ status: "pending" });

    // A failure that is not about time, even with plans somehow on it.
    const other = await insertJob(t, {
      status: "failed",
      errorCode: "unparseable",
      errorDetail: "not_understood",
      heldPlans: [dentistHeld()],
    });
    expect(
      await t.mutation(api.creationJobs.resolveWithTime, {
        deviceId: DEVICE,
        creationId: other.creationId,
        schedule: tomorrowAt("09:00"),
      })
    ).toEqual({ status: "failed" });

    // A no_time failure from before plans were kept.
    const bare = await insertJob(t, {
      status: "failed",
      errorCode: "unparseable",
      errorDetail: "no_time",
    });
    expect(
      await t.mutation(api.creationJobs.resolveWithTime, {
        deviceId: DEVICE,
        creationId: bare.creationId,
        schedule: tomorrowAt("09:00"),
      })
    ).toEqual({ status: "failed" });
    expect(await allReminders(t)).toHaveLength(0);
  });

  test("a worker commit clears kept plans too", async () => {
    const { jobId } = await insertJob(t, {
      status: "transcribed",
      pendingPlans: [DENTIST],
      heldPlans: [dentistHeld()],
    });
    await t.mutation(internal.creationJobs.commit, { jobId, generation: 1, plans: [commitPlan()] });
    const job = await t.run(async (ctx) => await ctx.db.get(jobId));
    expect(job).not.toHaveProperty("pendingPlans");
    expect(job).not.toHaveProperty("heldPlans");
  });
});
