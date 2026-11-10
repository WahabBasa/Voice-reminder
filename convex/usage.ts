/**
 * Anonymous usage counts (1.0.6).
 *
 * Why most new installs never make a first reminder, answered without anything
 * that looks like tracking. Two tables, written by two public mutations:
 *
 *   - usageSteps: one row per first-run milestone (first open, consent shown /
 *     answered, mic answered, first record tap, first take ok / failed, paywall
 *     shown). The app sends each at most once per install.
 *   - usageVisits: one row per foreground session: which visit it was (1..10,
 *     0 for an install that predates 1.0.6), how long, which screens, which
 *     named controls, whether a reminder was made.
 *
 * No row carries an install or device id, a session id, a timezone, a region,
 * free text or reminder content, and the mutations take no such argument —
 * rows cannot be joined to each other or to anything else. Every field is a
 * literal from convex/usageShape.ts, a capped integer, a boolean, or a short
 * pattern-checked version/build/language code. `at` is the server's clock.
 *
 * Unauthenticated by necessity (there are no accounts), so the shape is the
 * guard: a payload outside it is dropped without a write.
 *
 * Kept 365 days; `prune` (daily cron) deletes older rows in batches.
 */

import { internalMutation, mutation } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import { isValidMeta, isValidVisit } from "./usageShape";
import { screenValidator, stepValidator, tapValidator, variantValidator } from "./usageValidators";

const DAY_MS = 24 * 60 * 60 * 1000;
export const USAGE_RETENTION_MS = 365 * DAY_MS;
export const USAGE_PRUNE_BATCH_SIZE = 500;

const metaArgs = {
  appVersion: v.string(),
  buildNumber: v.string(),
  lang: v.string(),
  variant: variantValidator,
};

/** One first-run milestone. Returns whether it was stored. */
export const recordStep = mutation({
  args: { step: stepValidator, ...metaArgs },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    if (!isValidMeta(args)) return false;
    await ctx.db.insert("usageSteps", {
      step: args.step,
      appVersion: args.appVersion,
      buildNumber: args.buildNumber,
      lang: args.lang,
      variant: args.variant,
      at: Date.now(),
    });
    return true;
  },
});

/** One foreground session's summary. Returns whether it was stored. */
export const recordVisit = mutation({
  args: {
    visitNumber: v.number(),
    durationSec: v.number(),
    screens: v.array(screenValidator),
    taps: v.array(tapValidator),
    madeReminder: v.boolean(),
    ...metaArgs,
  },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    if (!isValidMeta(args) || !isValidVisit(args)) return false;
    await ctx.db.insert("usageVisits", {
      visitNumber: args.visitNumber,
      durationSec: args.durationSec,
      screens: args.screens,
      taps: args.taps,
      madeReminder: args.madeReminder,
      appVersion: args.appVersion,
      buildNumber: args.buildNumber,
      lang: args.lang,
      variant: args.variant,
      at: Date.now(),
    });
    return true;
  },
});

/** Delete rows older than 365 days, a batch at a time. */
export const prune = internalMutation({
  args: {},
  returns: v.object({ deleted: v.number() }),
  handler: async (ctx) => {
    const cutoff = Date.now() - USAGE_RETENTION_MS;
    const oldSteps = await ctx.db
      .query("usageSteps")
      .withIndex("by_at", (q) => q.lt("at", cutoff))
      .take(USAGE_PRUNE_BATCH_SIZE);
    for (const row of oldSteps) await ctx.db.delete(row._id);
    const oldVisits = await ctx.db
      .query("usageVisits")
      .withIndex("by_at", (q) => q.lt("at", cutoff))
      .take(USAGE_PRUNE_BATCH_SIZE);
    for (const row of oldVisits) await ctx.db.delete(row._id);
    if (
      oldSteps.length === USAGE_PRUNE_BATCH_SIZE ||
      oldVisits.length === USAGE_PRUNE_BATCH_SIZE
    ) {
      await ctx.scheduler.runAfter(0, internal.usage.prune, {});
    }
    return { deleted: oldSteps.length + oldVisits.length };
  },
});
