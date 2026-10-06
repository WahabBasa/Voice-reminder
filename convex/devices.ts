/**
 * Installs that have opened the app (OLD-135, founder alerts).
 *
 * `hello` is the app's once-per-launch check-in: it upserts the install's row
 * and, the first time a genuinely new install appears, schedules a founder
 * email. It is a public mutation keyed on the same bearer deviceId every other
 * entry point uses, so it is defensive by construction: strings are cleaned and
 * capped, a device seen under an hour ago writes nothing, and new-device emails
 * are capped per hour.
 *
 * "Genuinely new" means no row here AND no footprint anywhere else — no
 * reminders, no feedback, no creation jobs under that deviceId. The footprint
 * check is what keeps every pre-launch install quiet even before
 * `seedFromReminders` has run; the seed makes it explicit (`seeded: true`).
 */

import {
  mutation,
  query,
  internalMutation,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import {
  HOUR_MS,
  buildNewDeviceEmail,
  cleanField,
  deviceTagFor,
  helloShouldWrite,
  validDeviceId,
} from "./founderAlertsEmail";
import { isNeedsTimeDetail } from "./needsTime";
import { majorityLang, nextSpokenLang } from "./spokenLang";

/** Above this many brand-new installs in an hour, stop emailing (summary still counts them). */
export const MAX_NEW_DEVICE_EMAILS_PER_HOUR = 20;

/** Rows per page of the seed. */
export const SEED_PAGE_SIZE = 200;

export async function getDevice(
  ctx: QueryCtx | MutationCtx,
  deviceId: string
): Promise<Doc<"devices"> | null> {
  return await ctx.db
    .query("devices")
    .withIndex("by_deviceId", (q) => q.eq("deviceId", deviceId))
    // `first`, not `unique`: a duplicate would be a bug, not a reason to throw.
    .first();
}

/**
 * Whether this deviceId already left data behind before it had a devices row —
 * i.e. it is an install from before this table existed. `excludeCreationId`
 * ignores the take currently being recorded, so a brand-new install's own first
 * take does not count as history.
 */
export async function hasPriorFootprint(
  ctx: QueryCtx | MutationCtx,
  deviceId: string,
  excludeCreationId?: string
): Promise<boolean> {
  const reminders = await ctx.db
    .query("reminders")
    .withIndex("by_device", (q) => q.eq("deviceId", deviceId))
    .take(10);
  if (reminders.some((r) => r.creationId === undefined || r.creationId !== excludeCreationId)) {
    return true;
  }

  const feedback = await ctx.db
    .query("feedback")
    .withIndex("by_device", (q) => q.eq("deviceId", deviceId))
    .first();
  if (feedback) return true;

  const jobs = await ctx.db
    .query("creationJobs")
    .withIndex("by_device_creation", (q) => q.eq("deviceId", deviceId))
    .take(2);
  return jobs.some((j) => j.creationId !== excludeCreationId);
}

// ─── hello ───────────────────────────────────────────────────────────────────

const helloResult = v.union(
  v.literal("new"), // first sighting of a genuinely new install — founder emailed
  v.literal("known"), // first sighting of a pre-existing install — no email
  v.literal("updated"), // existing row refreshed
  v.literal("throttled") // seen under an hour ago — nothing written
);

export const hello = mutation({
  args: {
    deviceId: v.string(),
    buildNumber: v.optional(v.string()),
    updateId: v.optional(v.string()),
    locale: v.optional(v.string()),
    timezone: v.optional(v.string()),
    iosVersion: v.optional(v.string()),
  },
  // `spokenLang` (OLD-140): the language this install speaks in, once the
  // server has learned it. Older builds ignore it.
  returns: v.object({ result: helloResult, spokenLang: v.optional(v.string()) }),
  handler: async (ctx, args) => {
    const deviceId = validDeviceId(args.deviceId);
    if (!deviceId) throw new Error("devices.hello: invalid deviceId");

    const now = Date.now();
    const existing = await getDevice(ctx, deviceId);
    if (existing && !helloShouldWrite(existing.lastSeenAt, now)) {
      return { result: "throttled" as const, ...spokenLangOf(existing) };
    }

    const fields = {
      buildNumber: cleanField(args.buildNumber),
      updateId: cleanField(args.updateId),
      locale: cleanField(args.locale),
      timezone: cleanField(args.timezone),
      iosVersion: cleanField(args.iosVersion),
    };

    if (existing) {
      const patch: Partial<Doc<"devices">> = { lastSeenAt: now };
      for (const [key, value] of Object.entries(fields)) {
        if (value !== undefined) (patch as Record<string, unknown>)[key] = value;
      }
      await ctx.db.patch(existing._id, patch);
      return { result: "updated" as const, ...spokenLangOf(existing) };
    }

    const seeded = await hasPriorFootprint(ctx, deviceId);
    const deviceTag = await deviceTagFor(deviceId);
    await ctx.db.insert("devices", {
      deviceId,
      deviceTag,
      firstSeenAt: now,
      lastSeenAt: now,
      seeded,
      ...fields,
    });
    if (seeded) return { result: "known" as const };

    const recent = await ctx.db
      .query("devices")
      .withIndex("by_firstSeen", (q) => q.gte("firstSeenAt", now - HOUR_MS))
      .take(MAX_NEW_DEVICE_EMAILS_PER_HOUR + 1);
    if (recent.filter((d) => !d.seeded).length > MAX_NEW_DEVICE_EMAILS_PER_HOUR) {
      console.warn("[VR] devices.hello: new-device email cap reached; skipping email");
    } else {
      const email = buildNewDeviceEmail({ deviceTag, ...fields, at: now });
      await ctx.scheduler.runAfter(0, internal.founderAlerts.sendEmail, email);
    }
    return { result: "new" as const };
  },
});

function spokenLangOf(device: Doc<"devices">): { spokenLang?: string } {
  return device.spokenLang ? { spokenLang: device.spokenLang } : {};
}

// ─── spoken language (OLD-140) ───────────────────────────────────────────────

/**
 * The install's preferences the phone reads back: today only the language it
 * speaks in. Watched by the app (lib/spokenLanguage.ts), so a language learned
 * mid-session reaches the next take without waiting for the next launch.
 */
export const preferences = query({
  args: { deviceId: v.string() },
  returns: v.object({ spokenLang: v.optional(v.string()) }),
  handler: async (ctx, args) => {
    const deviceId = validDeviceId(args.deviceId);
    if (!deviceId) return {};
    const device = await getDevice(ctx, deviceId);
    return device ? spokenLangOf(device) : {};
  },
});

/**
 * The language a take was understood in, or undefined when it says nothing
 * about the speaker: a committed take's reminders, by majority; a take waiting
 * for a time (`no_time` / `past_time`), from the plans it kept. Any other
 * failure was not understood, so it does not count.
 */
export async function understoodTakeLang(
  ctx: QueryCtx | MutationCtx,
  job: Doc<"creationJobs">,
  status: "committed" | "failed"
): Promise<string | undefined> {
  if (status === "committed") {
    const langs: (string | undefined)[] = [];
    for (const id of job.reminderIds ?? []) {
      langs.push((await ctx.db.get(id))?.lang);
    }
    return majorityLang(langs);
  }
  if (isNeedsTimeDetail(job.errorDetail)) {
    return majorityLang((job.pendingPlans ?? []).map((p) => p.lang));
  }
  return undefined;
}

/**
 * Teach a device the language of one take (convex/spokenLang.ts has the rule).
 * Called by founderAlerts.recordOutcome for every terminal take.
 */
export async function learnSpokenLanguage(
  ctx: MutationCtx,
  device: Doc<"devices">,
  job: Doc<"creationJobs">,
  status: "committed" | "failed"
): Promise<void> {
  const lang = await understoodTakeLang(ctx, job, status);
  const patch = nextSpokenLang(device, { lang, creationId: job.creationId }, Date.now());
  if (patch) await ctx.db.patch(device._id, patch);
}

// ─── seedFromReminders ───────────────────────────────────────────────────────

const seedPhase = v.union(v.literal("reminders"), v.literal("feedback"), v.literal("creationJobs"));
type SeedPhase = typeof seedPhase.type;
const NEXT_PHASE: Record<SeedPhase, SeedPhase | null> = {
  reminders: "feedback",
  feedback: "creationJobs",
  creationJobs: null,
};

/**
 * Mark every install that existed before this table as `seeded`, so none of
 * them ever reads as a new device. Run ONCE at deploy, with no arguments:
 *
 *   npx convex run devices:seedFromReminders
 *
 * It walks `reminders`, then `feedback`, then `creationJobs`, one page per
 * transaction, and schedules itself for the next page until all three are done.
 * Idempotent: an existing row is never duplicated. An existing non-seeded row is
 * flipped to seeded only when the old data predates its first sighting by more
 * than an hour (a row that hello inserted before the seed ran).
 */
export const seedFromReminders = internalMutation({
  args: {
    phase: v.optional(seedPhase),
    cursor: v.optional(v.union(v.string(), v.null())),
  },
  returns: v.object({
    phase: seedPhase,
    scanned: v.number(),
    inserted: v.number(),
    done: v.boolean(),
  }),
  handler: async (ctx, args) => {
    const phase: SeedPhase = args.phase ?? "reminders";
    const paginationOpts = { cursor: args.cursor ?? null, numItems: SEED_PAGE_SIZE };

    // deviceId → earliest timestamp seen on this page.
    const seen = new Map<string, number>();
    const note = (deviceId: string | undefined, at: number) => {
      if (!deviceId) return;
      const prev = seen.get(deviceId);
      if (prev === undefined || at < prev) seen.set(deviceId, at);
    };

    let page: { isDone: boolean; continueCursor: string; scanned: number };
    if (phase === "reminders") {
      const res = await ctx.db.query("reminders").paginate(paginationOpts);
      for (const r of res.page) note(r.deviceId, r.createdAt);
      page = { isDone: res.isDone, continueCursor: res.continueCursor, scanned: res.page.length };
    } else if (phase === "feedback") {
      const res = await ctx.db.query("feedback").paginate(paginationOpts);
      for (const f of res.page) note(f.deviceId, f.receivedAt);
      page = { isDone: res.isDone, continueCursor: res.continueCursor, scanned: res.page.length };
    } else {
      const res = await ctx.db.query("creationJobs").paginate(paginationOpts);
      for (const j of res.page) note(j.deviceId, j.createdAt);
      page = { isDone: res.isDone, continueCursor: res.continueCursor, scanned: res.page.length };
    }

    let inserted = 0;
    for (const [deviceId, at] of seen) {
      const existing = await getDevice(ctx, deviceId);
      if (!existing) {
        await ctx.db.insert("devices", {
          deviceId,
          deviceTag: await deviceTagFor(deviceId),
          firstSeenAt: at,
          lastSeenAt: 0,
          seeded: true,
        });
        inserted++;
      } else if (at < existing.firstSeenAt - HOUR_MS) {
        await ctx.db.patch(existing._id, { firstSeenAt: at, seeded: true });
      }
    }

    const next: { phase: SeedPhase; cursor: string | null } | null = !page.isDone
      ? { phase, cursor: page.continueCursor }
      : NEXT_PHASE[phase]
        ? { phase: NEXT_PHASE[phase]!, cursor: null }
        : null;
    if (next) {
      await ctx.scheduler.runAfter(0, internal.devices.seedFromReminders, next);
    } else {
      console.log("[VR] devices.seedFromReminders: done");
    }

    return { phase, scanned: page.scanned, inserted, done: next === null };
  },
});
