/**
 * Founder alerts (OLD-135): instant emails about new installs and take
 * outcomes, a daily summary, and the take-outcome log behind both.
 *
 * Same delivery as feedback (convex/feedback.ts `notify`): Resend, to
 * FEEDBACK_EMAIL_TO, best-effort, from a scheduled action so nothing on a user's
 * path ever waits on email. Every subject/body is built by pure functions
 * (./founderAlertsEmail.ts, ./takeStoryEmail.ts), which never see a deviceId.
 *
 * `recordOutcome` is scheduled by the creation-job transitions
 * (convex/creationJobs.ts `commit` and `applyCas` → failed). It runs in its own
 * transaction after the transition commits, so it reads the job as it landed.
 *
 * Take emails are one per TAKE, not per attempt: a failure schedules
 * `deliverTakeEmail` ~75 s out (de-duplicated per creationId by the takeEmails
 * row), and when it fires it tells the whole story — every failed attempt, the
 * retry that recovered if one did, and what the user saw. A take that works
 * first time sends nothing, except a new device's first take.
 */

import { internalAction, internalMutation, type MutationCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import {
  DAY_MS,
  HOUR_MS,
  MINUTE_MS,
  buildDailySummaryEmail,
  classifyOutcome,
  cleanField,
  deviceTagFor,
  type DailySummaryInput,
} from "./founderAlertsEmail";
import {
  buildTakeStoryEmail,
  type StoryAttempt,
  type StoryFinal,
  type StoryReminder,
} from "./takeStoryEmail";
import { getDevice, hasPriorFootprint } from "./devices";

/** takeOutcomes rows older than this are deleted by the prune cron. */
export const OUTCOME_RETENTION_MS = 30 * DAY_MS;
export const PRUNE_BATCH_SIZE = 500;
/** Above this many outcome rows in an hour, stop emailing per take. */
export const MAX_OUTCOME_EMAILS_PER_HOUR = 60;
/** Cap on rows a single summary reads per source. */
const SUMMARY_READ_CAP = 5000;
const MAX_ERROR_DETAIL_LENGTH = 200;

/**
 * A failed take's email waits this long before it goes, so the automatic
 * cloud retry (and a quick manual one) can land and the email tells the whole
 * story in one go.
 */
export const TAKE_EMAIL_SETTLE_MS = 75_000;
/** A take still running when its email is due is looked at again this often… */
export const TAKE_EMAIL_RECHECK_MS = 30_000;
/** …for at most this long past the due time; then it goes as "still running". */
export const TAKE_EMAIL_MAX_WAIT_MS = 5 * MINUTE_MS;
/** Reads per take when gathering the story; a take has at most 3 attempts. */
const STORY_READ_CAP = 20;

// ─── sendEmail ───────────────────────────────────────────────────────────────

/**
 * POST one email to Resend (best-effort, no retries). Missing env is a no-op;
 * a non-2xx or network error is logged and dropped.
 */
export const sendEmail = internalAction({
  // `body` is the plain-text part; `html`, when given, is the rich one (Resend
  // sends both, and a mail client picks).
  args: { subject: v.string(), body: v.string(), html: v.optional(v.string()) },
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
          ...(args.html ? { html: args.html } : {}),
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
    // The failed attempt's row (OLD-136). Still passed by creationJobs.applyCas;
    // the take email now reads every row for the take itself.
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

    // ── One email per take, not per attempt.
    const pending = await findTakeEmail(ctx, job.creationId, deviceTag);
    // An email for this take is already on its way; it gathers every attempt,
    // this one included, when it fires.
    if (pending && pending.sentAt === undefined) return null;

    // A failure always gets an email; so does any twist in a take whose email
    // already went out (a later manual retry that recovered or failed again);
    // and a new device's first take that worked.
    const wanted = failed || pending !== null || notify === "first_take_worked";
    if (!wanted) return null;
    if (await outcomeEmailsCapped(ctx, now)) {
      console.warn("[VR] founderAlerts.recordOutcome: outcome email cap reached; skipping email");
      return null;
    }

    const delay = failed ? TAKE_EMAIL_SETTLE_MS : 0;
    if (pending) {
      await ctx.db.patch(pending._id, { dueAt: now + delay, sentAt: undefined });
    } else {
      await ctx.db.insert("takeEmails", {
        creationId: job.creationId,
        deviceTag,
        jobId: job._id,
        scheduledAt: now,
        dueAt: now + delay,
        sentCount: 0,
        newDevice,
        firstTake,
        timezone: cleanField(job.timezone) ?? device?.timezone,
        locale: device?.locale,
        buildNumber: device?.buildNumber,
        updateId: device?.updateId,
        iosVersion: device?.iosVersion,
      });
    }
    await ctx.scheduler.runAfter(delay, internal.founderAlerts.deliverTakeEmail, {
      creationId: job.creationId,
      deviceTag,
    });
    return null;
  },
});

async function findTakeEmail(
  ctx: MutationCtx,
  creationId: string,
  deviceTag: string
): Promise<Doc<"takeEmails"> | null> {
  const rows = await ctx.db
    .query("takeEmails")
    .withIndex("by_creation", (q) => q.eq("creationId", creationId))
    .take(STORY_READ_CAP);
  return rows.find((r) => r.deviceTag === deviceTag) ?? null;
}

// ─── deliverTakeEmail ────────────────────────────────────────────────────────

function attemptFromFailedTake(row: Doc<"failedTakes">): StoryAttempt {
  const isDevice = row.sttSource === "device";
  return {
    generation: row.generation,
    source: isDevice ? "device" : "cloud",
    status: "failed",
    transcript: isDevice ? row.deviceTranscript : row.cloudTranscript,
    deviceSttLocale: row.deviceSttLocale,
    deviceSttEngine: row.deviceSttEngine,
    deviceSttMs: row.deviceSttMs,
    sttModel: row.cloudSttModel,
    sttFallbackUsed: row.cloudSttFallbackUsed,
    language: row.detectedLanguage,
    audioSeconds: row.audioSeconds,
    sttMs: row.sttMs,
    parseMs: row.parseMs,
    totalMs: row.totalMs,
    failure: {
      errorCode: row.errorCode,
      errorDetail: row.errorDetail,
      detectedLanguage: row.detectedLanguage,
      pastTime: row.pastTime,
      parseRaw: row.parseRaw,
      failedTakeId: row._id,
      hasAudio: row.audioStorageId !== undefined,
    },
  };
}

/** The job's current attempt, when it is not one of the failed ones. */
function attemptFromJob(
  job: Doc<"creationJobs">,
  status: "committed" | "running",
  language: string | undefined
): StoryAttempt {
  const isDevice = job.sttSource === "device";
  const perf = job.perf;
  return {
    generation: job.generation,
    source: isDevice ? "device" : "cloud",
    status,
    // A cloud take's transcript belongs to this attempt only once it has been
    // transcribed (see failedTakes.recordFailedTake).
    transcript: isDevice || job.status !== "pending" ? job.transcript : undefined,
    deviceSttLocale: isDevice ? job.deviceSttLocale : undefined,
    deviceSttEngine: isDevice ? job.deviceSttEngine : undefined,
    deviceSttMs: isDevice ? job.deviceSttMs : undefined,
    sttModel: isDevice ? undefined : perf?.sttModel,
    sttFallbackUsed: isDevice ? undefined : perf?.sttFallbackUsed,
    language,
    audioSeconds: perf?.sttAudioSeconds,
    sttMs: isDevice ? undefined : perf?.sttMs,
    parseMs: perf?.parseMs,
    totalMs: perf?.totalMs,
  };
}

function storyReminder(r: Doc<"reminders">): StoryReminder {
  return {
    title: r.title,
    spokenLine: r.description,
    lang: r.lang,
    onceAt: r.onceAt,
    time: r.time,
    date: r.date,
    frequency: r.frequency,
    days: r.days,
    tzid: r.tzid,
  };
}

/**
 * Send the ONE email for a take, once it has settled (scheduled by
 * `recordOutcome`). Gathers every failed attempt (failedTakes), the job as it
 * stands and the reminders a later attempt made, and tells the story.
 *
 * De-duplicated on the takeEmails row: a call for a take whose email already
 * went out is a no-op. A take still running (a retry in flight) is looked at
 * again every 30 s, for up to 5 minutes past the due time.
 */
export const deliverTakeEmail = internalMutation({
  args: { creationId: v.string(), deviceTag: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const row = await findTakeEmail(ctx, args.creationId, args.deviceTag);
    if (!row || row.sentAt !== undefined) return null;

    const now = Date.now();
    const job = await ctx.db.get(row.jobId);
    const running = job !== null && (job.status === "pending" || job.status === "transcribed");
    if (running && now - row.dueAt < TAKE_EMAIL_MAX_WAIT_MS) {
      await ctx.scheduler.runAfter(TAKE_EMAIL_RECHECK_MS, internal.founderAlerts.deliverTakeEmail, args);
      return null;
    }

    const failedRows = (
      await ctx.db
        .query("failedTakes")
        .withIndex("by_creation", (q) => q.eq("creationId", args.creationId))
        .take(STORY_READ_CAP)
    ).filter((r) => r.deviceTag === args.deviceTag);
    const attempts = failedRows.map(attemptFromFailedTake);

    const reminders: StoryReminder[] = [];
    if (job?.status === "committed") {
      for (const id of (job.reminderIds ?? []).slice(0, STORY_READ_CAP)) {
        const reminder = await ctx.db.get(id);
        if (reminder) reminders.push(storyReminder(reminder));
      }
    }

    let final: StoryFinal;
    if (!job) final = "discarded";
    else if (job.status === "committed") final = "committed";
    else if (job.status === "cancelled") final = "cancelled";
    else if (job.status === "failed") final = "failed";
    else final = "running";

    const seenGeneration = job !== null && failedRows.some((r) => r.generation === job.generation);
    if (job && !seenGeneration && (final === "committed" || final === "running")) {
      const status = final === "committed" ? "committed" : "running";
      attempts.push(attemptFromJob(job, status, reminders.find((r) => r.lang)?.lang));
    }
    attempts.sort((a, b) => a.generation - b.generation);

    await ctx.db.patch(row._id, { sentAt: now, sentCount: row.sentCount + 1 });
    if (attempts.length === 0) {
      console.warn("[VR] founderAlerts.deliverTakeEmail: nothing to tell about this take; skipping email");
      return null;
    }

    const email = buildTakeStoryEmail({
      creationId: row.creationId,
      deviceTag: row.deviceTag,
      timezone: row.timezone ?? job?.timezone ?? failedRows[0]?.timezone,
      locale: row.locale,
      buildNumber: row.buildNumber ?? failedRows[0]?.buildNumber,
      updateId: row.updateId,
      iosVersion: row.iosVersion,
      recordedAt: job?.createdAt ?? failedRows[0]?.at ?? row.scheduledAt,
      newDevice: row.newDevice,
      firstTake: row.firstTake,
      attempts,
      final,
      reminders,
      followUp: row.sentCount > 0,
    });
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
    // The take-email de-dup rows go with them.
    const oldEmails = await ctx.db
      .query("takeEmails")
      .withIndex("by_scheduled", (q) => q.lt("scheduledAt", cutoff))
      .take(PRUNE_BATCH_SIZE);
    for (const row of oldEmails) await ctx.db.delete(row._id);
    if (old.length === PRUNE_BATCH_SIZE || oldEmails.length === PRUNE_BATCH_SIZE) {
      await ctx.scheduler.runAfter(0, internal.founderAlerts.pruneOutcomes, {});
    }
    return { deleted: old.length };
  },
});
