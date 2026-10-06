/**
 * Failed takes (OLD-136): everything about a take Remi could not turn into a
 * reminder, kept for 7 days so the founder can see what went wrong.
 *
 * Why its own table rather than more columns on `takeOutcomes` (OLD-135):
 * takeOutcomes is deliberately content-free metadata kept 30 days for counts;
 * this one holds user content (transcripts, the parse model's raw answer, the
 * recording) for a much shorter, separately stated window, and its purge has
 * blobs to delete. Mixing the two would put content into a table whose whole
 * promise is that it has none, under a retention the privacy policy does not
 * describe.
 *
 * Audio ownership. A cloud take's recording is referenced by its creation job
 * AND, once an attempt fails, by that attempt's failedTakes row. Whoever lets
 * go last deletes it:
 *   - every job-side cleanup (commit, cancel, retry's blob swap, discard, the
 *     sweep's GC) goes through `releaseJobAudio`, which skips the delete while
 *     any failedTakes row holds the blob;
 *   - `purge` deletes the blob with the last row that holds it, unless the job
 *     still references it, in which case the job's own cleanup will.
 * A successful take that never failed has no row, so its recording is deleted
 * as soon as it commits, exactly as before.
 *
 * Founder retrieval (dashboard or CLI, never public):
 *   npx convex run failedTakes:recent '{"limit": 10}'
 *   npx convex run failedTakes:recent '{"deviceTag": "1a2b3c4d"}'
 *   npx convex run failedTakes:audioUrl '{"id": "<failedTakes _id>"}'
 */

import {
  internalAction,
  internalMutation,
  internalQuery,
  type MutationCtx,
} from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { failedTakeFields } from "./schema";
import {
  DAY_MS,
  PARSE_RAW_MAX,
  TRANSCRIPT_STORE_MAX,
  cleanField,
  clip,
  deviceTagFor,
} from "./founderAlertsEmail";
import { getDevice } from "./devices";

/** Failed takes, their transcripts and their recordings are kept this long. */
export const FAILED_TAKE_RETENTION_MS = 7 * DAY_MS;
export const PURGE_BATCH_SIZE = 200;
const MAX_RECENT = 100;
const MAX_ERROR_DETAIL_LENGTH = 200;

/** What the worker knows about a failure that the job row does not hold. */
export const failureDiagnosticsValidator = v.object({
  parseRaw: v.optional(v.string()),
});
export type FailureDiagnostics = typeof failureDiagnosticsValidator.type;

/** The part of a failing CAS patch a failedTakes row reads. */
type FailurePatch = {
  errorCode?: string;
  errorDetail?: string;
  detectedLanguage?: string;
  perf?: Doc<"creationJobs">["perf"];
};

// ─── record ──────────────────────────────────────────────────────────────────

/**
 * Write the failedTakes row for one failed attempt. Called by
 * convex/creationJobs.ts `applyCas` in the transaction that fails the job, with
 * `job` as it was BEFORE that patch.
 *
 * Which transcript is this attempt's:
 * - a device take's transcript is on the job from `begin`/`retry`;
 * - a cloud take's transcript is on the job only once this generation reached
 *   its `transcribed` milestone. A job still `pending` failed in STT (or was
 *   swept), and whatever `transcript` it holds belongs to an earlier attempt,
 *   so it is not reported as this one's.
 */
export async function recordFailedTake(
  ctx: MutationCtx,
  job: Doc<"creationJobs">,
  patch: FailurePatch,
  diagnostics: FailureDiagnostics | undefined
): Promise<Id<"failedTakes">> {
  const isDevice = job.sttSource === "device";
  const perf = patch.perf;
  const device = await getDevice(ctx, job.deviceId);

  return await ctx.db.insert("failedTakes", {
    jobId: job._id,
    creationId: job.creationId,
    generation: job.generation,
    deviceTag: await deviceTagFor(job.deviceId),
    at: Date.now(),
    errorCode: cleanField(patch.errorCode),
    errorDetail: cleanField(patch.errorDetail, MAX_ERROR_DETAIL_LENGTH),
    detectedLanguage: cleanField(patch.detectedLanguage),
    sttSource: job.sttSource ?? "cloud",
    deviceSttLocale: isDevice ? cleanField(job.deviceSttLocale) : undefined,
    deviceSttEngine: isDevice ? job.deviceSttEngine : undefined,
    deviceTranscript: isDevice ? clip(job.transcript, TRANSCRIPT_STORE_MAX) : undefined,
    cloudTranscript:
      !isDevice && job.status === "transcribed"
        ? clip(job.transcript, TRANSCRIPT_STORE_MAX)
        : undefined,
    cloudSttModel: !isDevice ? cleanField(perf?.sttModel) : undefined,
    cloudSttFallbackUsed: !isDevice ? perf?.sttFallbackUsed : undefined,
    parseRaw: clip(diagnostics?.parseRaw, PARSE_RAW_MAX),
    audioSeconds: perf?.sttAudioSeconds,
    timezone: cleanField(job.timezone),
    buildNumber: device?.buildNumber,
    audioStorageId: job.audioStorageId,
  });
}

// ─── audio ownership ─────────────────────────────────────────────────────────

/** Whether any failedTakes row still holds this recording. */
async function isRetained(ctx: MutationCtx, storageId: Id<"_storage">): Promise<boolean> {
  const holder = await ctx.db
    .query("failedTakes")
    .withIndex("by_audio", (q) => q.eq("audioStorageId", storageId))
    .first();
  return holder !== null;
}

/**
 * A creation job lets go of a recording. Scheduled for deletion exactly as
 * before (reminders.deleteUploadedAudio) unless a failed attempt kept it, in
 * which case `purge` deletes it when that attempt expires.
 */
export async function releaseJobAudio(
  ctx: MutationCtx,
  storageId: Id<"_storage">
): Promise<void> {
  if (await isRetained(ctx, storageId)) return;
  await ctx.scheduler.runAfter(0, internal.reminders.deleteUploadedAudio, { storageId });
}

/**
 * The row is gone; delete its recording if nothing else holds it. Returns
 * whether a blob was deleted. Idempotent: a blob that is already gone is a
 * no-op, not an error.
 */
async function releaseRowAudio(
  ctx: MutationCtx,
  row: Doc<"failedTakes">
): Promise<boolean> {
  const storageId = row.audioStorageId;
  if (!storageId) return false;
  if (await isRetained(ctx, storageId)) return false;
  const job = await ctx.db.get(row.jobId);
  // The job still reads it (e.g. a failed take the user may yet retry): the
  // job's own cleanup deletes it, through releaseJobAudio, when it lets go.
  if (job && job.audioStorageId === storageId) return false;
  const meta = await ctx.db.system.get(storageId);
  if (!meta) return false;
  await ctx.storage.delete(storageId);
  return true;
}

// ─── purge ───────────────────────────────────────────────────────────────────

/**
 * Delete failedTakes rows older than 7 days, and the recordings only they
 * held. Daily cron; a backlog larger than one batch reschedules itself.
 * Safe to run any number of times.
 */
export const purge = internalMutation({
  args: {},
  returns: v.object({ deleted: v.number(), blobsDeleted: v.number() }),
  handler: async (ctx) => {
    const cutoff = Date.now() - FAILED_TAKE_RETENTION_MS;
    const old = await ctx.db
      .query("failedTakes")
      .withIndex("by_at", (q) => q.lt("at", cutoff))
      .take(PURGE_BATCH_SIZE);
    let blobsDeleted = 0;
    for (const row of old) {
      await ctx.db.delete(row._id);
      if (await releaseRowAudio(ctx, row)) blobsDeleted++;
    }
    if (old.length === PURGE_BATCH_SIZE) {
      await ctx.scheduler.runAfter(0, internal.failedTakes.purge, {});
    }
    return { deleted: old.length, blobsDeleted };
  },
});

// ─── founder retrieval ───────────────────────────────────────────────────────

const failedTakeRowValidator = v.object({
  _id: v.id("failedTakes"),
  _creationTime: v.number(),
  ...failedTakeFields,
});

/** The newest failed takes, optionally for one device tag. */
export const recent = internalQuery({
  args: { limit: v.optional(v.number()), deviceTag: v.optional(v.string()) },
  returns: v.array(failedTakeRowValidator),
  handler: async (ctx, args) => {
    const limit = Math.max(1, Math.min(Math.floor(args.limit ?? 20), MAX_RECENT));
    const deviceTag = args.deviceTag;
    const query =
      deviceTag !== undefined
        ? ctx.db
            .query("failedTakes")
            .withIndex("by_device_tag", (q) => q.eq("deviceTag", deviceTag))
        : ctx.db.query("failedTakes").withIndex("by_at");
    return await query.order("desc").take(limit);
  },
});

/** One row, for `audioUrl`. */
export const getRow = internalQuery({
  args: { id: v.id("failedTakes") },
  returns: v.union(v.null(), failedTakeRowValidator),
  handler: async (ctx, args) => await ctx.db.get(args.id),
});

/**
 * A download URL for a failed take's recording, or null when it has none (a
 * device take, or one already purged). Convex storage URLs carry no expiry of
 * their own; this one stops working when `purge` deletes the blob, at the
 * latest a day after `purgeAfter`.
 */
export const audioUrl = internalAction({
  args: { id: v.id("failedTakes") },
  returns: v.union(v.null(), v.object({ url: v.string(), purgeAfter: v.number() })),
  handler: async (ctx, args): Promise<{ url: string; purgeAfter: number } | null> => {
    // Annotated: an action reading a query of its own module is otherwise a
    // circular inference through `internal`.
    const row: Doc<"failedTakes"> | null = await ctx.runQuery(internal.failedTakes.getRow, {
      id: args.id,
    });
    if (!row || !row.audioStorageId) return null;
    const url: string | null = await ctx.storage.getUrl(row.audioStorageId);
    if (!url) return null;
    return { url, purgeAfter: row.at + FAILED_TAKE_RETENTION_MS };
  },
});
