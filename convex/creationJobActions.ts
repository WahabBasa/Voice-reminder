"use node";

/**
 * The creation job's worker (spec 1.3).
 *
 * This is the fast path's mechanics — the same Whisper call, the same prompt,
 * the same planner — walked through checkpoints instead of run end to end. The
 * difference that matters: `processVoiceReminderFast` owns its take because the
 * client is blocked on its return value, whereas this action owns nothing. The
 * client has already been told the take exists, a retry may have superseded
 * this run mid-Whisper, and the user may have cancelled. So every write goes
 * through a compare-and-set on `generation`, and a run that loses one simply
 * stops — no cleanup, no error, no second copy of the take. The winner owns the
 * cleanup (spec 1.3 step 4).
 *
 * `"use node"` because Whisper needs the Node runtime, and a `"use node"` file
 * may hold actions and nothing else — which is why every query and mutation
 * this calls lives in convex/creationJobs.ts.
 *
 * The legacy actions in convex/actions.ts are untouched by all of this. They
 * are still the live path for typed reminders and for every build that predates
 * this pipeline, so this module IMPORTS from them (one prompt, one planner)
 * rather than forking them.
 */

import { internalAction, type ActionCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import OpenAI from "openai";
import { buildSystemPrompt, planRemindersFromRawParse } from "./actions";
import { MAX_EVERY_N_DAYS, validateCreationPlans } from "./creationValidate";
import type { scheduleFields } from "./schema";

/** The stage timings the job row carries. Every field optional — see 1.3. */
type WorkerPerf = {
  storageGetMs?: number;
  blobMs?: number;
  whisperMs?: number;
  parseMs?: number;
  commitMs?: number;
  totalMs?: number;
};

/** The closed set the schema's `errorCode` column holds. */
type ErrorCode = "storage_missing" | "stt_failed" | "parse_failed" | "unparseable" | "internal";

type PlannedReminder = ReturnType<typeof planRemindersFromRawParse>[number];

// ─── plan → row ─────────────────────────────────────────────────────────────

/**
 * One planned reminder as `commit` wants it: every column
 * `reminders.create` would have written, plus the lines its TTS job speaks.
 *
 * Mirrors `scheduleColumnsFor` in convex/actions.ts. Deliberately a second copy
 * rather than an export borrowed from there — this wave's rule is that the
 * legacy file stays byte-identical — with the drift guard below standing in for
 * the shared definition.
 */
function toCommitPlan(plan: PlannedReminder) {
  return {
    title: plan.title,
    description: plan.description,

    // Schedule columns (OLD-97).
    time: plan.time,
    date: plan.date,
    frequency: plan.frequency,
    days: plan.days,
    schedule: plan.schedule,
    scheduleType: plan.scheduleType,
    onceAt: plan.onceAt,
    rrule: plan.rrule,
    dtstart: plan.dtstart,
    tzid: plan.schedule.tzid,
    until: plan.until,
    intervalMs: plan.intervalMs,
    anchorAt: plan.anchorAt,
    intervalDays: plan.intervalDays,
    parseWarnings: plan.parseWarnings.length > 0 ? plan.parseWarnings : undefined,

    // The rest of the row.
    emoji: plan.emoji,
    preReminderMinutes:
      plan.preReminderMinutes > 0 ? plan.preReminderMinutes : undefined,
    urgency: plan.urgency,
    persistent: plan.persistent || undefined,

    // Scheduling inputs, not columns: `commit` strips these off before insert.
    ttsText: plan.description,
    preTtsText: plan.preTtsText || undefined,
  };
}

/**
 * "Every two years", as a schedule this pipeline can actually hold.
 *
 * buildGridSchedule rounds an every-N-days count and floors it at 2 but puts no
 * ceiling on it, while the gate refuses anything past 366 — beyond that the
 * client's own occurrence scan (400-day horizon) can no longer find the next
 * ring, so the reminder would never fire. Between the two, "every two years"
 * is a take that fails as `unparseable` and that no retry can turn into
 * anything better, which costs the user the reminder entirely.
 *
 * Capping it is the same repair the legacy builders already make for every
 * other out-of-range number (a 3-minute interval becomes 5, an upside-down
 * window becomes 08:00–22:00): the user gets the reminder they asked for, on
 * the longest cycle the app can really run. It happens BEFORE validation, so
 * the gate sees — and `commit` writes — the capped schedule, never the raw one.
 *
 * Exported for the unit tests: this is the seam between "what the planner
 * built" and "what the gate is asked to accept", with no network in reach.
 */
export function capEveryNDays(plan: PlannedReminder): PlannedReminder {
  const days = plan.schedule.days;
  if (days.kind !== "everyNDays" || days.interval <= MAX_EVERY_N_DAYS) return plan;
  return {
    ...plan,
    schedule: {
      ...plan.schedule,
      days: { ...days, interval: MAX_EVERY_N_DAYS },
    },
    // The flat projection has to keep agreeing with the grid, or the gate's
    // column check would reject the plan this just repaired.
    intervalDays: MAX_EVERY_N_DAYS,
  };
}

/**
 * Drift guard, and the reason duplicating the mapping above is safe.
 *
 * convex/schema.ts holds the ONE list of schedule columns, shared by the table,
 * by `reminders.create`/`update` and by `commit`'s plan validator. If a new axis
 * lands there and this mapping does not carry it, `MissingScheduleColumns`
 * stops being `never` and this line stops compiling — which is the failure
 * OLD-97 was about (a schedule field that reaches storage and is dropped on the
 * way in), caught at build time instead of in a user's reminder.
 */
type MissingScheduleColumns = Exclude<
  keyof typeof scheduleFields,
  keyof ReturnType<typeof toCommitPlan>
>;
const _scheduleColumnsAreComplete = (missing: MissingScheduleColumns): never => missing;
void _scheduleColumnsAreComplete;

// ─── Stages ─────────────────────────────────────────────────────────────────

/**
 * Record a terminal failure. Guarded like every other write: a run that has
 * been superseded does not get to fail a job somebody else is working on.
 * Swallows its own errors — there is nothing useful left to do with them.
 */
async function failJob(
  ctx: ActionCtx,
  args: { jobId: Id<"creationJobs">; generation: number },
  errorCode: ErrorCode,
  perf: WorkerPerf
): Promise<void> {
  try {
    await ctx.runMutation(internal.creationJobs.casPatch, {
      jobId: args.jobId,
      generation: args.generation,
      expectStatus: ["pending", "transcribed"],
      patch: { status: "failed", errorCode, perf },
    });
  } catch (e) {
    console.error("[VR] creation job: could not record failure:", e);
  }
}

type StageResult<T> = { ok: true; value: T } | { ok: false; code: ErrorCode };

/**
 * Steps 2 and 3: the stored recording, then Whisper. `perf` is accumulated into
 * so a failure still reports how far the job got.
 */
async function transcribeRecording(
  ctx: ActionCtx,
  audioStorageId: Id<"_storage"> | undefined,
  perf: WorkerPerf
): Promise<StageResult<string>> {
  if (!audioStorageId) return { ok: false, code: "storage_missing" };

  let audioBlob: Blob | null;
  try {
    // First time this hop has been measured — the fast path's `blobMs` started
    // its clock after the storage read had already happened.
    const tStorage = Date.now();
    audioBlob = await ctx.storage.get(audioStorageId);
    perf.storageGetMs = Date.now() - tStorage;
  } catch (e) {
    console.error("[VR] creation job: storage read failed:", e);
    return { ok: false, code: "storage_missing" };
  }
  if (!audioBlob) return { ok: false, code: "storage_missing" };

  const tBlob = Date.now();
  let audioFile: File;
  try {
    const arrayBuffer = await audioBlob.arrayBuffer();
    audioFile = new File([arrayBuffer], "recording.m4a", { type: "audio/mp4" });
  } catch (e) {
    console.error("[VR] creation job: could not read the recording:", e);
    return { ok: false, code: "internal" };
  }
  perf.blobMs = Date.now() - tBlob;

  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const tWhisper = Date.now();
  try {
    const transcription = await openai.audio.transcriptions.create({
      file: audioFile,
      model: "whisper-1",
    });
    perf.whisperMs = Date.now() - tWhisper;
    return { ok: true, value: transcription.text };
  } catch (e) {
    perf.whisperMs = Date.now() - tWhisper;
    console.error("[VR] creation job: transcription failed:", e);
    return { ok: false, code: "stt_failed" };
  }
}

/**
 * Step 5: the same parse call and the same planner the fast path runs
 * (convex/actions.ts createTakeWithDeferredAudio), against the user's own clock
 * snapshot rather than this container's UTC one (OLD-120).
 */
async function parseTake(
  job: { localDate: string; localTime: string; timezone: string },
  transcript: string,
  perf: WorkerPerf
): Promise<StageResult<PlannedReminder[]>> {
  const tParse = Date.now();
  try {
    const openrouter = new OpenAI({
      apiKey: process.env.OPENROUTER_API_KEY,
      baseURL: "https://openrouter.ai/api/v1",
    });

    const now = new Date(`${job.localDate}T${job.localTime}`);
    const currentDayOfWeek = now.toLocaleDateString("en-US", { weekday: "long" });

    const completion = await openrouter.chat.completions.create({
      model: "openai/gpt-5.6-luna",
      response_format: { type: "json_object" },
      reasoning_effort: "none",
      max_tokens: 2000,
      messages: [
        {
          role: "system",
          content: buildSystemPrompt({
            currentDate: job.localDate,
            currentDayOfWeek,
            currentTime: job.localTime,
            timezone: job.timezone,
          }),
        },
        { role: "user", content: transcript },
      ],
    });

    const rawGptResponse = completion.choices[0].message.content || "{}";
    // One take can hold several reminders (OLD-93); a single-reminder take is
    // an array of one.
    const plans = planRemindersFromRawParse(rawGptResponse, {
      transcript,
      currentTime: job.localTime,
      currentDate: job.localDate,
      timezone: job.timezone,
    });
    perf.parseMs = Date.now() - tParse;
    return { ok: true, value: plans };
  } catch (e) {
    perf.parseMs = Date.now() - tParse;
    console.error("[VR] creation job: parse failed:", e);
    return { ok: false, code: "parse_failed" };
  }
}

// ─── The worker ─────────────────────────────────────────────────────────────

export const run = internalAction({
  args: { jobId: v.id("creationJobs"), generation: v.number() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const tStart = Date.now();
    const perf: WorkerPerf = {};

    // 1. Still the live run?
    const job = await ctx.runQuery(internal.creationJobs.getJob, { jobId: args.jobId });
    if (!job) return null;
    if (job.generation !== args.generation || job.status !== "pending") return null;

    // 2-3. Recording → transcript.
    const stt = await transcribeRecording(ctx, job.audioStorageId, perf);
    if (!stt.ok) {
      await failJob(ctx, args, stt.code, perf);
      return null;
    }

    // 4. Milestone. Losing it means a retry or a cancel got here first, and the
    //    winner owns everything from here — including the recording.
    const milestone = await ctx.runMutation(internal.creationJobs.casPatch, {
      jobId: args.jobId,
      generation: args.generation,
      expectStatus: ["pending"],
      patch: { status: "transcribed", transcript: stt.value },
    });
    if (milestone.result !== "applied") return null;

    // 5. Transcript → plans.
    const parsed = await parseTake(job, stt.value, perf);
    if (!parsed.ok) {
      await failJob(ctx, args, parsed.code, perf);
      return null;
    }

    // 6. The strict gate. All N are checked before anything is written, and one
    //    bad item fails the whole take rather than importing half of it. The
    //    one repair made on the way in is the every-N-days cap — see
    //    capEveryNDays; the capped plans are what is validated AND committed.
    const plans = parsed.value.map(capEveryNDays);
    const verdict = validateCreationPlans(plans, {
      timezone: job.timezone,
      now: Date.now(),
    });
    if (!verdict.ok) {
      console.error(
        `[VR] creation job: plan ${verdict.index} rejected — ${verdict.field}: ${verdict.reason}`
      );
      await failJob(ctx, args, "unparseable", perf);
      return null;
    }

    // 7. All of it, or none of it.
    const tCommit = Date.now();
    let committed: { result: "applied" | "stale" };
    try {
      committed = await ctx.runMutation(internal.creationJobs.commit, {
        jobId: args.jobId,
        generation: args.generation,
        plans: plans.map(toCommitPlan),
        preCommitPerf: perf,
      });
    } catch (e) {
      console.error("[VR] creation job: commit failed:", e);
      await failJob(ctx, args, "internal", perf);
      return null;
    }
    if (committed.result !== "applied") return null;

    // The last two timings can only be known after the commit that carried the
    // rest of `perf`, so they arrive in a separate patch that touches nothing
    // else. A failure here costs a log line and nothing more (C5).
    perf.commitMs = Date.now() - tCommit;
    perf.totalMs = Date.now() - tStart;
    try {
      await ctx.runMutation(internal.creationJobs.perfPatch, {
        jobId: args.jobId,
        perf: { commitMs: perf.commitMs, totalMs: perf.totalMs },
      });
    } catch (e) {
      console.error("[VR] creation job: could not record timings:", e);
    }

    return null;
  },
});
