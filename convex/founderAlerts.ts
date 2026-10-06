/**
 * Founder alerts (OLD-135): instant emails about new installs and take
 * outcomes, a daily summary, and the take-outcome log behind both.
 *
 * Same delivery as feedback (convex/feedback.ts `notify`): Resend, to
 * FEEDBACK_EMAIL_TO, best-effort, from a scheduled action so nothing on a user's
 * path ever waits on email. Every subject/body is built by the pure functions in
 * ./founderAlertsEmail.ts, which never see a deviceId or any user content.
 *
 * `recordOutcome` is scheduled by the creation-job transitions
 * (convex/creationJobs.ts `commit` and `applyCas` → failed). It runs in its own
 * transaction after the transition commits, so it reads the job as it landed.
 */

import { internalAction, internalMutation, type MutationCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import {
  DAY_MS,
  HOUR_MS,
  buildDailySummaryEmail,
  buildOutcomeEmail,
  classifyOutcome,
  cleanField,
  deviceTagFor,
  type DailySummaryInput,
} from "./founderAlertsEmail";
import { getDevice, hasPriorFootprint } from "./devices";

/** takeOutcomes rows older than this are deleted by the prune cron. */
export const OUTCOME_RETENTION_MS = 30 * DAY_MS;
export const PRUNE_BATCH_SIZE = 500;
/** Above this many outcome rows in an hour, stop emailing per take. */
export const MAX_OUTCOME_EMAILS_PER_HOUR = 60;
/** Cap on rows a single summary reads per source. */
const SUMMARY_READ_CAP = 5000;
const MAX_ERROR_DETAIL_LENGTH = 200;

// ─── sendEmail ───────────────────────────────────────────────────────────────

/**
 * POST one email to Resend (best-effort, no retries). Missing env is a no-op;
 * a non-2xx or network error is logged and dropped.
 */
export const sendEmail = internalAction({
  args: { subject: v.string(), body: v.string() },
  returns: v.null(),
  handler: async (_ctx, args) => {
    const apiKey = process.env.RESEND_API_KEY;
    const to = process.env.FEEDBACK_EMAIL_TO;
    if (!apiKey || !to) {
      console.warn("[VR] founderAlerts.sendEmail: RESEND_API_KEY / FEEDBACK_EMAIL_TO not set; skipping email");
      return null;
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10_000);
    try {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: "Remi Alerts <onboarding@resend.dev>",
          to: [to],
          subject: args.subject,
          text: args.body,
        }),
        signal: controller.signal,
      });
      if (!res.ok) {
        console.error(`[VR] founderAlerts.sendEmail: Resend responded ${res.status}`);
      }
    } catch (e) {
      console.error("[VR] founderAlerts.sendEmail: email send failed:", e);
    } finally {
      clearTimeout(timer);
    }
    return null;
  },
});

// ─── recordOutcome ───────────────────────────────────────────────────────────

async function outcomeEmailsCapped(ctx: MutationCtx, now: number): Promise<boolean> {
  const recent = await ctx.db
    .query("takeOutcomes")
    .withIndex("by_at", (q) => q.gte("at", now - HOUR_MS))
    .take(MAX_OUTCOME_EMAILS_PER_HOUR + 1);
  return recent.length > MAX_OUTCOME_EMAILS_PER_HOUR;
}

/**
 * Log one terminal take transition and, when it matters, email the founder.
 *
 * A take from an install with no devices row (a build that predates `hello`,
 * or a hello that never landed) registers the install here, so a brand-new
 * user on an old build still reads as new.
 */
export const recordOutcome = internalMutation({
  args: {
    jobId: v.id("creationJobs"),
    status: v.union(v.literal("committed"), v.literal("failed")),
    errorCode: v.optional(v.string()),
    // The failed attempt's row (OLD-136), for the email's "Remi heard" section.
    failedTakeId: v.optional(v.id("failedTakes")),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const job = await ctx.db.get(args.jobId);
    if (!job) {
      console.warn("[VR] founderAlerts.recordOutcome: job is gone; nothing recorded");
      return null;
    }

    const now = Date.now();
    const deviceTag = await deviceTagFor(job.deviceId);

    let device = await getDevice(ctx, job.deviceId);
    if (!device) {
      const seeded = await hasPriorFootprint(ctx, job.deviceId, job.creationId);
      const id = await ctx.db.insert("devices", {
        deviceId: job.deviceId,
        deviceTag,
        firstSeenAt: now,
        // 0 so the install's next hello is not throttled and fills in the rest.
        lastSeenAt: 0,
        seeded,
        timezone: cleanField(job.timezone),
      });
      device = await ctx.db.get(id);
    }

    const prior = await ctx.db
      .query("takeOutcomes")
      .withIndex("by_device_tag", (q) => q.eq("deviceTag", deviceTag))
      .first();

    const { newDevice, firstTake, notify } = classifyOutcome({
      status: args.status,
      device: device ? { seeded: device.seeded, firstSeenAt: device.firstSeenAt } : null,
      hasPriorOutcome: prior !== null,
      now,
    });

    const failed = args.status === "failed";
    // OLD-130 adds `errorDetail` to the job; read it without depending on that.
    const errorDetail = failed
      ? cleanField((job as any).errorDetail, MAX_ERROR_DETAIL_LENGTH)
      : undefined;
    const errorCode = failed ? cleanField(args.errorCode ?? job.errorCode) : undefined;

    const row = {
      creationId: job.creationId,
      deviceTag,
      status: args.status,
      errorCode,
      errorDetail,
      sttSource: job.sttSource,
      deviceSttLocale: cleanField(job.deviceSttLocale),
      timezone: cleanField(job.timezone),
      buildNumber: device?.buildNumber,
      reminderCount: failed ? undefined : (job.reminderIds?.length ?? 0),
      newDevice,
      firstTake,
      at: now,
    };
    await ctx.db.insert("takeOutcomes", row);

    if (notify === null) return null;
    if (await outcomeEmailsCapped(ctx, now)) {
      console.warn("[VR] founderAlerts.recordOutcome: outcome email cap reached; skipping email");
      return null;
    }
    const failedTake = args.failedTakeId ? await ctx.db.get(args.failedTakeId) : null;
    const heard = failedTake
      ? {
          deviceTranscript: failedTake.deviceTranscript,
          cloudTranscript: failedTake.cloudTranscript,
          cloudSttModel: failedTake.cloudSttModel,
          cloudSttFallbackUsed: failedTake.cloudSttFallbackUsed,
          detectedLanguage: failedTake.detectedLanguage,
        }
      : undefined;
    const email = buildOutcomeEmail({ notify, ...row, heard });
    await ctx.scheduler.runAfter(0, internal.founderAlerts.sendEmail, email);
    return null;
  },
});

// ─── daily summary ───────────────────────────────────────────────────────────

/**
 * The trailing 24 hours up to `now` (the cron fires at 05:00 UTC = 09:00 UAE,
 * so this is "since yesterday morning"). Always sends — a quiet day sends a
 * one-line email, so silence never means "the cron died".
 */
export const dailySummary = internalMutation({
  args: { now: v.optional(v.number()) },
  returns: v.object({ subject: v.string() }),
  handler: async (ctx, args) => {
    const until = args.now ?? Date.now();
    const since = until - DAY_MS;

    const firstSeen = await ctx.db
      .query("devices")
      .withIndex("by_firstSeen", (q) => q.gte("firstSeenAt", since).lt("firstSeenAt", until))
      .take(SUMMARY_READ_CAP);
    const newDevices = firstSeen
      .filter((d) => !d.seeded)
      .map((d) => ({
        deviceTag: d.deviceTag,
        timezone: d.timezone,
        locale: d.locale,
        buildNumber: d.buildNumber,
      }));

    const activeTags = new Set<string>();
    const seen = await ctx.db
      .query("devices")
      .withIndex("by_lastSeen", (q) => q.gte("lastSeenAt", since).lt("lastSeenAt", until))
      .take(SUMMARY_READ_CAP);
    for (const d of seen) activeTags.add(d.deviceTag);

    const outcomes = await ctx.db
      .query("takeOutcomes")
      .withIndex("by_at", (q) => q.gte("at", since).lt("at", until))
      .take(SUMMARY_READ_CAP);

    let committed = 0;
    let failed = 0;
    const failedByCode: Record<string, number> = {};
    const newDeviceFailures: DailySummaryInput["newDeviceFailures"] = [];
    for (const o of outcomes) {
      activeTags.add(o.deviceTag);
      if (o.status === "committed") {
        committed++;
        continue;
      }
      failed++;
      const code = o.errorCode ?? "unknown";
      failedByCode[code] = (failedByCode[code] ?? 0) + 1;
      if (o.newDevice) {
        newDeviceFailures.push({
          deviceTag: o.deviceTag,
          errorCode: o.errorCode,
          errorDetail: o.errorDetail,
          timezone: o.timezone,
        });
      }
    }

    const email = buildDailySummaryEmail({
      since,
      until,
      newDevices,
      activeDevices: activeTags.size,
      committed,
      failed,
      failedByCode,
      newDeviceFailures,
    });
    await ctx.scheduler.runAfter(0, internal.founderAlerts.sendEmail, email);
    return { subject: email.subject };
  },
});

// ─── prune ───────────────────────────────────────────────────────────────────

/** Delete takeOutcomes rows older than 30 days, a batch at a time. */
export const pruneOutcomes = internalMutation({
  args: {},
  returns: v.object({ deleted: v.number() }),
  handler: async (ctx) => {
    const cutoff = Date.now() - OUTCOME_RETENTION_MS;
    const old = await ctx.db
      .query("takeOutcomes")
      .withIndex("by_at", (q) => q.lt("at", cutoff))
      .take(PRUNE_BATCH_SIZE);
    for (const row of old) await ctx.db.delete(row._id);
    if (old.length === PRUNE_BATCH_SIZE) {
      await ctx.scheduler.runAfter(0, internal.founderAlerts.pruneOutcomes, {});
    }
    return { deleted: old.length };
  },
});
