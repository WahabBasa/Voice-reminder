/**
 * The creation job's default-runtime half (spec 1.2, 1.4, 1.5, 1.6).
 *
 * Everything here is a query or a mutation, so it runs in Convex's own runtime
 * rather than the Node container `convex/actions.ts` lives in — the client
 * watches `get` on every frame of a pending card, and a watched query has no
 * business waiting on a Node cold start. The one piece that genuinely needs
 * Node (Whisper, the parse call) is the worker action in
 * convex/creationJobActions.ts.
 *
 * The concurrency rule, once, since every function below assumes it: a job's
 * `generation` is the only thing that says which worker is the live one. A
 * retry bumps it; every write past `begin` compares against it and no-ops on a
 * mismatch. That is why nothing here tries to cancel a running action — an
 * action cannot be cancelled, so instead it is allowed to finish and then
 * silently fail to write anything (spec 1.3, C1).
 *
 * Ownership follows the OLD-74 rule convex/reminders.ts states: there are no
 * accounts, so every public entry point takes the caller's `deviceId` and can
 * only ever reach rows begun by that device. Unlike `reminders`, there are no
 * pre-scoping rows here — the table is new — so `deviceId` is required and the
 * legacy "unowned row" allowance does not apply.
 */

import {
  query,
  mutation,
  internalQuery,
  internalMutation,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { creationPerfValidator, creationStatusValidator, scheduleFields } from "./schema";

type JobDoc = Doc<"creationJobs">;
type CreationStatus = JobDoc["status"];

/** Once a job reaches one of these it never moves again under a CAS. */
const TERMINAL_STATUSES: readonly CreationStatus[] = ["committed", "failed", "cancelled"];

/** How long an in-flight job may go without a write before the sweep fails it. */
export const STALE_AFTER_MS = 5 * 60_000;

/** Retention windows the sweep's GC enforces (spec 1.1). */
export const CANCELLED_RETENTION_MS = 24 * 60 * 60 * 1000;
export const TERMINAL_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;

/** One sweep touches at most this many documents, across both of its halves. */
export const SWEEP_BATCH_SIZE = 25;

/** Worker attempts a single job is allowed, `begin`'s first run included. */
export const MAX_ATTEMPTS = 3;

const urgencyValidator = v.union(
  v.literal("urgent"),
  v.literal("notice"),
  v.literal("routine")
);

const audioStatusValidator = v.union(
  v.literal("pending"),
  v.literal("ready"),
  v.literal("failed")
);

/**
 * One reminder the worker wants committed: every column `reminders.create`
 * would have written, plus the two lines its TTS job needs. `ttsText` and
 * `preTtsText` are scheduling inputs, not columns — they are destructured off
 * before the row is inserted.
 */
const commitPlanValidator = v.object({
  title: v.string(),
  description: v.string(),
  // The one shared list (OLD-97), so a new schedule axis cannot land in the
  // table and be dropped on the way in through here.
  ...scheduleFields,
  emoji: v.optional(v.string()),
  preReminderMinutes: v.optional(v.number()),
  urgency: v.optional(urgencyValidator),
  persistent: v.optional(v.boolean()),
  ttsText: v.string(),
  preTtsText: v.optional(v.string()),
});

/** Fields a CAS write is allowed to move. Never `generation`, never `attempts`. */
const casPatchValidator = v.object({
  status: v.optional(creationStatusValidator),
  transcript: v.optional(v.string()),
  errorCode: v.optional(v.string()),
  perf: v.optional(creationPerfValidator),
});

/** What the worker needs off the job row. Deliberately narrower than the doc. */
const workerJobValidator = v.object({
  deviceId: v.string(),
  creationId: v.string(),
  status: creationStatusValidator,
  generation: v.number(),
  attempts: v.number(),
  audioStorageId: v.optional(v.id("_storage")),
  localDate: v.string(),
  localTime: v.string(),
  timezone: v.string(),
});

/** The watched document (spec 1.4). `perf` rides along so the client can log it. */
const watchedJobValidator = v.object({
  status: creationStatusValidator,
  generation: v.number(),
  transcript: v.optional(v.string()),
  errorCode: v.optional(v.string()),
  reminderIds: v.optional(v.array(v.id("reminders"))),
  perf: v.optional(creationPerfValidator),
  updatedAt: v.number(),
});

/**
 * One imported row, projected exactly like the existing public reads
 * (convex/reminders.ts `list`/`get`): every schedule field, both audio statuses,
 * resolved urls. `_id` arrives as `id` and `creationId` rides on every row so a
 * client that lost its outbox can still recognise its own import (N1).
 */
const committedReminderValidator = v.object({
  id: v.string(),
  creationId: v.optional(v.string()),
  title: v.string(),
  description: v.string(),
  ...scheduleFields,
  emoji: v.optional(v.string()),
  audioStorageId: v.optional(v.id("_storage")),
  wavStorageId: v.optional(v.id("_storage")),
  preReminderMinutes: v.optional(v.number()),
  preAudioStorageId: v.optional(v.id("_storage")),
  urgency: v.optional(urgencyValidator),
  persistent: v.optional(v.boolean()),
  createdAt: v.number(),
  audioStatus: v.optional(audioStatusValidator),
  audioExtrasStatus: v.optional(audioStatusValidator),
  audioError: v.optional(v.string()),
  audioUpdatedAt: v.optional(v.number()),
  audioUrl: v.union(v.string(), v.null()),
  wavUrl: v.union(v.string(), v.null()),
  preAudioUrl: v.union(v.string(), v.null()),
});

/** A row the user already deleted between commit and import (spec 1.4). */
const deletedReminderValidator = v.object({
  id: v.string(),
  deleted: v.literal(true),
});

const casResultValidator = v.object({
  result: v.union(v.literal("applied"), v.literal("stale")),
});

/** `not_found` is a status the table cannot hold, so it never collides. */
const statusOrMissingValidator = v.union(creationStatusValidator, v.literal("not_found"));

// ─── Lookup + CAS, shared by everything below ───────────────────────────────

async function findJob(
  ctx: QueryCtx | MutationCtx,
  deviceId: string,
  creationId: string
): Promise<JobDoc | null> {
  return await ctx.db
    .query("creationJobs")
    .withIndex("by_device_creation", (q) =>
      q.eq("deviceId", deviceId).eq("creationId", creationId)
    )
    // `first`, not `unique`: a duplicate could only exist through a bug, and a
    // throwing read would strand the client's card forever.
    .first();
}

type CasPatch = {
  status?: CreationStatus;
  transcript?: string;
  errorCode?: string;
  perf?: JobDoc["perf"];
};

/**
 * The one write primitive (spec 1.3). Applies `patch` only if the caller is
 * still the live generation AND the job is in a status the caller expected;
 * bumps `updatedAt`, which is what the stale sweep and the GC read.
 *
 * Terminal statuses are refused outright, independently of `expectStatus`, so
 * no caller can talk a committed job back into `pending`.
 */
async function applyCas(
  ctx: MutationCtx,
  job: JobDoc | null,
  generation: number,
  expectStatus: readonly CreationStatus[],
  patch: CasPatch
): Promise<"applied" | "stale"> {
  if (!job) return "stale";
  if (job.generation !== generation) return "stale";
  if (TERMINAL_STATUSES.includes(job.status)) return "stale";
  if (!expectStatus.includes(job.status)) return "stale";
  await ctx.db.patch(job._id, { ...patch, updatedAt: Date.now() });
  return "applied";
}

// ─── 1.2 begin ──────────────────────────────────────────────────────────────

/**
 * Claim a take and start its worker.
 *
 * Idempotent on (deviceId, creationId), which is the whole point: the client
 * calls this the moment the upload lands and again from every reconciliation
 * pass, and a lost response must not cost a second transcription. Only the
 * insert path schedules a worker, and it does so inside the same transaction —
 * so a job row that exists always has (or has had) exactly one worker for
 * generation 1 (D1).
 */
export const begin = mutation({
  args: {
    deviceId: v.string(),
    creationId: v.string(),
    audioStorageId: v.id("_storage"),
    localDate: v.string(),
    localTime: v.string(),
    timezone: v.string(),
  },
  returns: v.object({
    jobId: v.id("creationJobs"),
    status: creationStatusValidator,
    generation: v.number(),
  }),
  handler: async (ctx, args) => {
    const existing = await findJob(ctx, args.deviceId, args.creationId);
    if (existing) {
      return {
        jobId: existing._id,
        status: existing.status,
        generation: existing.generation,
      };
    }

    const now = Date.now();
    const jobId = await ctx.db.insert("creationJobs", {
      deviceId: args.deviceId,
      creationId: args.creationId,
      status: "pending" as const,
      generation: 1,
      attempts: 1,
      audioStorageId: args.audioStorageId,
      localDate: args.localDate,
      localTime: args.localTime,
      timezone: args.timezone,
      createdAt: now,
      updatedAt: now,
    });

    await ctx.scheduler.runAfter(0, internal.creationJobActions.run, {
      jobId,
      generation: 1,
    });

    return { jobId, status: "pending" as const, generation: 1 };
  },
});

// ─── 1.4 reads, commit, ack ─────────────────────────────────────────────────

/**
 * The document the client watches. Null until `begin` lands, and null forever
 * for another device's creationId — a job is not a shared object.
 */
export const get = query({
  args: { deviceId: v.string(), creationId: v.string() },
  returns: v.union(v.null(), watchedJobValidator),
  handler: async (ctx, args) => {
    const job = await findJob(ctx, args.deviceId, args.creationId);
    if (!job) return null;
    return {
      status: job.status,
      generation: job.generation,
      transcript: job.transcript,
      errorCode: job.errorCode,
      reminderIds: job.reminderIds,
      perf: job.perf,
      updatedAt: job.updatedAt,
    };
  },
});

/**
 * The rows a committed take produced, in the order they were inserted (C14).
 *
 * Only ever answers for a committed job the calling device owns; anything else
 * is null, which the client reads as "not importable yet". A row the user has
 * already deleted comes back as a placeholder rather than being skipped, so the
 * client can tell "deleted" apart from "the read lost a row".
 */
export const getReminders = query({
  args: { deviceId: v.string(), creationId: v.string() },
  returns: v.union(
    v.null(),
    v.array(v.union(committedReminderValidator, deletedReminderValidator))
  ),
  handler: async (ctx, args) => {
    const job = await findJob(ctx, args.deviceId, args.creationId);
    if (!job || job.status !== "committed") return null;

    const rows = [];
    for (const reminderId of job.reminderIds ?? []) {
      const reminder = await ctx.db.get(reminderId);
      // Same ownership rule the public reminder reads use, applied to a row we
      // reached through the job rather than through the by_device index.
      const owned =
        reminder !== null &&
        (reminder.deviceId === undefined || reminder.deviceId === args.deviceId);
      if (!owned) {
        rows.push({ id: reminderId as string, deleted: true as const });
        continue;
      }
      rows.push({
        id: reminder._id as string,
        creationId: reminder.creationId,
        title: reminder.title,
        description: reminder.description,
        time: reminder.time,
        date: reminder.date,
        frequency: reminder.frequency,
        days: reminder.days,
        schedule: reminder.schedule,
        scheduleType: reminder.scheduleType,
        onceAt: reminder.onceAt,
        rrule: reminder.rrule,
        dtstart: reminder.dtstart,
        tzid: reminder.tzid,
        until: reminder.until,
        intervalMs: reminder.intervalMs,
        anchorAt: reminder.anchorAt,
        intervalDays: reminder.intervalDays,
        parseWarnings: reminder.parseWarnings,
        emoji: reminder.emoji,
        audioStorageId: reminder.audioStorageId,
        wavStorageId: reminder.wavStorageId,
        preReminderMinutes: reminder.preReminderMinutes,
        preAudioStorageId: reminder.preAudioStorageId,
        urgency: reminder.urgency,
        persistent: reminder.persistent,
        createdAt: reminder.createdAt,
        audioStatus: reminder.audioStatus,
        audioExtrasStatus: reminder.audioExtrasStatus,
        audioError: reminder.audioError,
        audioUpdatedAt: reminder.audioUpdatedAt,
        // Resolved exactly like convex/reminders.ts list/get do.
        audioUrl: reminder.audioStorageId
          ? await ctx.storage.getUrl(reminder.audioStorageId)
          : "",
        wavUrl: reminder.wavStorageId ? await ctx.storage.getUrl(reminder.wavStorageId) : "",
        preAudioUrl: reminder.preAudioStorageId
          ? await ctx.storage.getUrl(reminder.preAudioStorageId)
          : "",
      });
    }
    return rows;
  },
});

/**
 * The client has durably persisted this take (spec 2.4 step 5).
 *
 * Releases the job for garbage collection, which is the only reason a committed
 * job is kept at all — without an ack it lingers a week so an offline or
 * force-quit client can still find its reminders (D5). Deliberately does NOT
 * bump `updatedAt`: the GC scans committed jobs oldest-first, and pushing an
 * acked job to the young end of that index is how it would starve.
 */
export const ack = mutation({
  args: { deviceId: v.string(), creationId: v.string() },
  returns: v.object({ status: statusOrMissingValidator }),
  handler: async (ctx, args) => {
    const job = await findJob(ctx, args.deviceId, args.creationId);
    if (!job) return { status: "not_found" as const };
    if (job.status !== "committed") return { status: job.status };
    if (job.ackedAt === undefined) {
      await ctx.db.patch(job._id, { ackedAt: Date.now() });
    }
    return { status: job.status };
  },
});

/**
 * The worker's read of its own job (spec 1.3 step 1). Internal: an action has
 * no database of its own, so this is how it learns whether it is still the live
 * generation before spending a Whisper call.
 */
export const getJob = internalQuery({
  args: { jobId: v.id("creationJobs") },
  returns: v.union(v.null(), workerJobValidator),
  handler: async (ctx, args) => {
    const job = await ctx.db.get(args.jobId);
    if (!job) return null;
    return {
      deviceId: job.deviceId,
      creationId: job.creationId,
      status: job.status,
      generation: job.generation,
      attempts: job.attempts,
      audioStorageId: job.audioStorageId,
      localDate: job.localDate,
      localTime: job.localTime,
      timezone: job.timezone,
    };
  },
});

/** The worker's guarded write. See applyCas for what "guarded" means. */
export const casPatch = internalMutation({
  args: {
    jobId: v.id("creationJobs"),
    generation: v.number(),
    expectStatus: v.array(creationStatusValidator),
    patch: casPatchValidator,
  },
  returns: casResultValidator,
  handler: async (ctx, args) => {
    const job = await ctx.db.get(args.jobId);
    const result = await applyCas(ctx, job, args.generation, args.expectStatus, args.patch);
    return { result };
  },
});

/**
 * The whole take lands here, or none of it (spec 1.4).
 *
 * One transaction inserts every row, stamps each with the take's `creationId`,
 * schedules every TTS job and the recording's deletion, and flips the job to
 * `committed` with the ids in insertion order. There is no window in which some
 * rows exist and the job still says `transcribed`, which is what lets the
 * client treat "committed" as "the reminders are there".
 *
 * A stale generation writes nothing at all — a superseded worker that finished
 * its parse anyway must not create a second copy of the take.
 */
export const commit = internalMutation({
  args: {
    jobId: v.id("creationJobs"),
    generation: v.number(),
    plans: v.array(commitPlanValidator),
    preCommitPerf: v.optional(creationPerfValidator),
  },
  returns: v.object({
    result: v.union(v.literal("applied"), v.literal("stale")),
    reminderIds: v.optional(v.array(v.id("reminders"))),
  }),
  handler: async (ctx, args) => {
    const job = await ctx.db.get(args.jobId);
    if (!job) return { result: "stale" as const };
    if (job.generation !== args.generation) return { result: "stale" as const };
    if (job.status !== "transcribed") return { result: "stale" as const };

    const now = Date.now();
    const reminderIds: Id<"reminders">[] = [];

    for (const plan of args.plans) {
      const { ttsText, preTtsText, ...row } = plan;
      const reminderId = await ctx.db.insert("reminders", {
        ...row,
        deviceId: job.deviceId,
        creationId: job.creationId,
        // Audio is deferred exactly as the fast path defers it: the row exists
        // and is schedulable now, the spoken line lands in a later patch.
        audioStatus: "pending" as const,
        // Set here rather than only in the TTS job, so there is no window where
        // a row that will grow a pre-alert reads as one that never asked for one.
        audioExtrasStatus: preTtsText ? ("pending" as const) : undefined,
        audioUpdatedAt: now,
        createdAt: now,
      });
      reminderIds.push(reminderId);

      await ctx.scheduler.runAfter(0, internal.actions.generateReminderTtsForReminder, {
        reminderId,
        title: plan.title,
        ttsText,
        preTtsText,
      });
    }

    // The recording has done its job. Scheduled rather than awaited inline for
    // the same reason OLD-106 moved it out of the fast path (C6).
    if (job.audioStorageId) {
      await ctx.scheduler.runAfter(0, internal.reminders.deleteUploadedAudio, {
        storageId: job.audioStorageId,
      });
    }

    await ctx.db.patch(args.jobId, {
      status: "committed" as const,
      reminderIds,
      perf: args.preCommitPerf,
      // A commit after a retry clears the previous attempt's error.
      errorCode: undefined,
      updatedAt: now,
    });

    return { result: "applied" as const, reminderIds };
  },
});

/**
 * Best-effort telemetry merge (C5). Touches `perf` and nothing else — not the
 * status, not `updatedAt`, so a late timing patch can neither resurrect a
 * swept job nor reset the GC clock on a committed one.
 */
export const perfPatch = internalMutation({
  args: { jobId: v.id("creationJobs"), perf: creationPerfValidator },
  returns: v.object({ result: v.union(v.literal("applied"), v.literal("missing")) }),
  handler: async (ctx, args) => {
    const job = await ctx.db.get(args.jobId);
    if (!job) return { result: "missing" as const };
    await ctx.db.patch(args.jobId, { perf: { ...(job.perf ?? {}), ...args.perf } });
    return { result: "applied" as const };
  },
});

// ─── 1.5 cancel / retry / discard ───────────────────────────────────────────

/**
 * The X on the pending card (C4).
 *
 * Racing a commit is expected and is not an error: whoever gets there first
 * wins, and a cancel that lost is told so, with the reminder ids, so the client
 * imports the take it just tried to abandon. Deleting those rows is the
 * existing removal flow's job, not this one's — and it has to wait until each
 * row's audio has settled (C6).
 *
 * `orphanStorageId` covers the other race: an upload that finished after the
 * job was already gone has a blob nobody will ever reference.
 */
export const cancel = mutation({
  args: {
    deviceId: v.string(),
    creationId: v.string(),
    orphanStorageId: v.optional(v.id("_storage")),
  },
  returns: v.object({
    status: statusOrMissingValidator,
    reminderIds: v.optional(v.array(v.id("reminders"))),
  }),
  handler: async (ctx, args) => {
    const job = await findJob(ctx, args.deviceId, args.creationId);

    if (!job) {
      if (args.orphanStorageId) {
        await ctx.scheduler.runAfter(0, internal.reminders.deleteUploadedAudio, {
          storageId: args.orphanStorageId,
        });
      }
      return { status: "not_found" as const };
    }

    if (job.status === "committed") {
      return { status: job.status, reminderIds: job.reminderIds };
    }
    if (job.status === "failed" || job.status === "cancelled") {
      return { status: job.status };
    }

    // The status was read and narrowed to pending|transcribed inside this same
    // transaction, so the CAS applyCas would perform has already been decided:
    // patch directly rather than branch on a result that cannot come back stale.
    await ctx.db.patch(job._id, { status: "cancelled" as const, updatedAt: Date.now() });

    const orphans = new Set<Id<"_storage">>();
    if (job.audioStorageId) orphans.add(job.audioStorageId);
    if (args.orphanStorageId) orphans.add(args.orphanStorageId);
    for (const storageId of orphans) {
      await ctx.scheduler.runAfter(0, internal.reminders.deleteUploadedAudio, { storageId });
    }

    return { status: "cancelled" as const };
  },
});

/**
 * Another run at a failed take (C13).
 *
 * Bumping `generation` is what makes this safe: the previous worker may still
 * be inside a Whisper call, and when it comes back every write it attempts is
 * refused. `newStorageId` covers the one failure a reused blob cannot fix —
 * `storage_missing`, where the recording has to be uploaded again. An identical
 * id is not a swap and must not delete the blob the new run is about to read.
 */
export const retry = mutation({
  args: {
    deviceId: v.string(),
    creationId: v.string(),
    newStorageId: v.optional(v.id("_storage")),
  },
  returns: v.object({
    status: statusOrMissingValidator,
    generation: v.optional(v.number()),
    capReached: v.optional(v.boolean()),
  }),
  handler: async (ctx, args) => {
    const job = await findJob(ctx, args.deviceId, args.creationId);
    if (!job) return { status: "not_found" as const };
    if (job.status !== "failed") return { status: job.status, generation: job.generation };
    if (job.attempts >= MAX_ATTEMPTS) {
      return { status: job.status, generation: job.generation, capReached: true };
    }

    const generation = job.generation + 1;
    const now = Date.now();
    const swapping =
      args.newStorageId !== undefined && args.newStorageId !== job.audioStorageId;

    await ctx.db.patch(job._id, {
      status: "pending" as const,
      generation,
      attempts: job.attempts + 1,
      errorCode: undefined,
      ...(swapping ? { audioStorageId: args.newStorageId } : {}),
      updatedAt: now,
    });

    if (swapping && job.audioStorageId) {
      await ctx.scheduler.runAfter(0, internal.reminders.deleteUploadedAudio, {
        storageId: job.audioStorageId,
      });
    }

    await ctx.scheduler.runAfter(0, internal.creationJobActions.run, {
      jobId: job._id,
      generation,
    });

    return { status: "pending" as const, generation };
  },
});

/** Swipe on a failed card: drop the recording and the job with it. */
export const discard = mutation({
  args: { deviceId: v.string(), creationId: v.string() },
  returns: v.object({
    status: v.union(statusOrMissingValidator, v.literal("discarded")),
  }),
  handler: async (ctx, args) => {
    const job = await findJob(ctx, args.deviceId, args.creationId);
    if (!job) return { status: "not_found" as const };
    if (job.status !== "failed" && job.status !== "cancelled") {
      return { status: job.status };
    }
    if (job.audioStorageId) {
      await ctx.scheduler.runAfter(0, internal.reminders.deleteUploadedAudio, {
        storageId: job.audioStorageId,
      });
    }
    await ctx.db.delete(job._id);
    return { status: "discarded" as const };
  },
});

// ─── 1.6 sweep ──────────────────────────────────────────────────────────────

/**
 * The pipeline's only self-healing (spec 1.6, C20).
 *
 * Two halves, one budget. First: a job that has been `pending` or `transcribed`
 * for five minutes has lost its worker — a Node container died, a deploy landed
 * mid-run — and is failed as `internal` so the client's card offers a retry
 * instead of shimmering forever (D9). Second: garbage collection, on the
 * retention rules in the schema comment. Committed jobs are collected as soon
 * as the client acks, which is what `ack` is for; unacked ones wait a week.
 *
 * Deliberately bounded rather than exhaustive. A sweep that tried to catch up
 * in one transaction would be the thing that takes the deployment down; this
 * one runs every five minutes and is allowed to be behind.
 *
 * Runs on its own cron so that `keepWarm` — a Node no-op whose entire job is to
 * be invoked — stays exactly what it is.
 */
export const sweepStale = internalMutation({
  args: {},
  returns: v.object({
    failed: v.number(),
    collected: v.number(),
  }),
  handler: async (ctx) => {
    const now = Date.now();
    let budget = SWEEP_BATCH_SIZE;
    let failed = 0;
    let collected = 0;

    // ── Half one: in-flight jobs whose worker never came back ──────────────
    const staleBefore = now - STALE_AFTER_MS;
    for (const status of ["pending", "transcribed"] as const) {
      if (budget <= 0) break;
      const stalled = await ctx.db
        .query("creationJobs")
        .withIndex("by_status_updated", (q) =>
          q.eq("status", status).lt("updatedAt", staleBefore)
        )
        .take(budget);
      for (const job of stalled) {
        // At the job's CURRENT generation: the sweep is not a retry, it is the
        // live worker's obituary, and it must lose to a retry that beat it here.
        const result = await applyCas(ctx, job, job.generation, ["pending", "transcribed"], {
          status: "failed",
          errorCode: "internal",
        });
        budget--;
        if (result === "applied") failed++;
      }
    }

    // ── Half two: retention ────────────────────────────────────────────────
    // Ranged, not filtered-after-the-fact. Taking the oldest N of a status and
    // then deciding whether each one is old enough spends the budget on rows it
    // KEEPS: a deployment holding thirty young cancelled takes would burn the
    // whole sweep on them and never reach the week-old failed job behind them,
    // every five minutes, forever. Ranging on `updatedAt` means only collectable
    // rows are ever read, and the budget is decremented per DELETE.
    const expiring: Array<{ status: CreationStatus; cutoff: number }> = [
      // A cancelled take is worth a day, purely so a client that cancelled
      // offline can still see why its card vanished.
      { status: "cancelled", cutoff: now - CANCELLED_RETENTION_MS },
      // A failed take stays retryable for a week.
      { status: "failed", cutoff: now - TERMINAL_RETENTION_MS },
      // An unacked committed take waits the same week, so an offline or
      // force-quit client can still find its reminders (D5).
      { status: "committed", cutoff: now - TERMINAL_RETENTION_MS },
    ];

    for (const { status, cutoff } of expiring) {
      if (budget <= 0) break;
      const expired = await ctx.db
        .query("creationJobs")
        .withIndex("by_status_updated", (q) =>
          q.eq("status", status).lt("updatedAt", cutoff)
        )
        .take(budget);
      for (const job of expired) {
        await collectJob(ctx, job);
        budget--;
        collected++;
      }
    }

    // A committed take the client has ACKED is collectable at whatever age
    // (D5) — the one retention rule that is not an expiry, so it gets its own
    // pass over the half of the index the loop above deliberately never reads.
    // The filter is cheap in practice: a client acks within seconds of the
    // import, so almost every young committed job carries `ackedAt` and the
    // scan finds its budget's worth immediately.
    if (budget > 0) {
      const acked = await ctx.db
        .query("creationJobs")
        .withIndex("by_status_updated", (q) =>
          q.eq("status", "committed").gte("updatedAt", now - TERMINAL_RETENTION_MS)
        )
        .filter((q) => q.neq(q.field("ackedAt"), undefined))
        .take(budget);
      for (const job of acked) {
        await collectJob(ctx, job);
        budget--;
        collected++;
      }
    }

    return { failed, collected };
  },
});

/** Drop one job row, and schedule its recording's deletion if it still has one. */
async function collectJob(ctx: MutationCtx, job: JobDoc): Promise<void> {
  if (job.audioStorageId) {
    await ctx.scheduler.runAfter(0, internal.reminders.deleteUploadedAudio, {
      storageId: job.audioStorageId,
    });
  }
  await ctx.db.delete(job._id);
}
