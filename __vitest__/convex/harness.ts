/**
 * Shared rigging for the convex-test suites.
 *
 * convex-test runs the real query/mutation bodies against an in-process mock of
 * the backend, which is the only way to test the things this pipeline is made
 * of — compare-and-set races, scheduled jobs, transaction atomicity. The plain
 * `_handler`-with-a-fake-ctx trick the older convex suites use cannot see any of
 * that.
 *
 * Not a `.test.ts` file, so neither runner collects it.
 */

import { convexTest } from "convex-test";
import schema from "../../convex/schema";
import type { Doc, Id } from "../../convex/_generated/dataModel";

/**
 * Every module convex-test may need to resolve a function reference in.
 *
 * Written out rather than globbed: `import.meta.glob` needs Vite's ambient types
 * to typecheck under the repo's `tsc --noEmit`, and an explicit map also says
 * plainly which modules the mock backend knows about. A new file under convex/
 * that holds registered functions has to be added here — convex-test throws a
 * "Could not find function" naming the missing module, so the failure is loud.
 *
 * The `_generated` entry is required: convex-test locates the functions root by
 * finding it in these keys.
 */
const modules: Record<string, () => Promise<unknown>> = {
  "../../convex/_generated/api.js": () => import("../../convex/_generated/api"),
  "../../convex/_generated/server.js": () => import("../../convex/_generated/server"),
  "../../convex/actions.ts": () => import("../../convex/actions"),
  "../../convex/creationJobActions.ts": () => import("../../convex/creationJobActions"),
  "../../convex/creationJobs.ts": () => import("../../convex/creationJobs"),
  "../../convex/creationValidate.ts": () => import("../../convex/creationValidate"),
  "../../convex/crons.ts": () => import("../../convex/crons"),
  "../../convex/helpers.ts": () => import("../../convex/helpers"),
  "../../convex/reminders.ts": () => import("../../convex/reminders"),
  "../../convex/scheduleShape.ts": () => import("../../convex/scheduleShape"),
  "../../convex/schema.ts": () => import("../../convex/schema"),
};

export function harness() {
  return convexTest(schema, modules);
}

export type Harness = ReturnType<typeof harness>;

export const DEVICE = "device_a";
export const OTHER_DEVICE = "device_b";

/** A job's clock snapshot. The tests never run the planner, so any zone does. */
export const CLOCK = {
  localDate: "2026-09-01",
  localTime: "10:00:00",
  timezone: "Asia/Dubai",
};

export const MINUTE = 60_000;
export const HOUR = 60 * MINUTE;
export const DAY = 24 * HOUR;

export async function storeAudio(t: Harness, body = "recording"): Promise<Id<"_storage">> {
  return await t.run(async (ctx) => await ctx.storage.store(new Blob([body])));
}

export async function readJob(
  t: Harness,
  deviceId: string,
  creationId: string
): Promise<Doc<"creationJobs"> | null> {
  return await t.run(
    async (ctx) =>
      await ctx.db
        .query("creationJobs")
        .withIndex("by_device_creation", (q) =>
          q.eq("deviceId", deviceId).eq("creationId", creationId)
        )
        .first()
  );
}

export async function readJobById(
  t: Harness,
  jobId: Id<"creationJobs">
): Promise<Doc<"creationJobs"> | null> {
  return await t.run(async (ctx) => await ctx.db.get(jobId));
}

export async function allJobs(t: Harness): Promise<Doc<"creationJobs">[]> {
  return await t.run(async (ctx) => await ctx.db.query("creationJobs").collect());
}

export async function allReminders(t: Harness): Promise<Doc<"reminders">[]> {
  return await t.run(async (ctx) => await ctx.db.query("reminders").collect());
}

type ScheduledRow = { name: string; args: unknown[]; state: { kind: string } };

/** Everything `ctx.scheduler.runAfter` has queued, in insertion order. */
export async function scheduledJobs(t: Harness): Promise<ScheduledRow[]> {
  const rows = await t.run(
    async (ctx) => await ctx.db.system.query("_scheduled_functions").collect()
  );
  return rows as unknown as ScheduledRow[];
}

export async function scheduledNames(t: Harness): Promise<string[]> {
  return (await scheduledJobs(t)).map((row) => row.name);
}

export async function scheduledOf(t: Harness, name: string): Promise<ScheduledRow[]> {
  return (await scheduledJobs(t)).filter((row) => row.name === name);
}

export const WORKER = "creationJobActions:run";
export const TTS = "actions:generateReminderTtsForReminder";
export const BLOB_DELETE = "reminders:deleteUploadedAudio";

let jobCounter = 0;

/**
 * A job row written straight into the table. `begin` is exercised on its own;
 * everything else needs a job in a specific status/generation/age, and going
 * through the pipeline to get there would test the setup instead of the case.
 */
export async function insertJob(
  t: Harness,
  over: Partial<Doc<"creationJobs">> = {}
): Promise<{ jobId: Id<"creationJobs">; creationId: string }> {
  const now = Date.now();
  const creationId = over.creationId ?? `creation_${++jobCounter}`;
  const jobId = await t.run(
    async (ctx) =>
      await ctx.db.insert("creationJobs", {
        deviceId: DEVICE,
        status: "pending" as const,
        generation: 1,
        attempts: 1,
        ...CLOCK,
        createdAt: now,
        updatedAt: now,
        ...over,
        creationId,
      })
  );
  return { jobId, creationId };
}

export async function patchJob(
  t: Harness,
  jobId: Id<"creationJobs">,
  patch: Partial<Doc<"creationJobs">>
): Promise<void> {
  await t.run(async (ctx) => {
    await ctx.db.patch(jobId, patch);
  });
}

/**
 * One entry of `commit`'s `plans` argument: a fully built reminder row plus the
 * lines its TTS job speaks. Shaped like what `toCommitPlan` in
 * convex/creationJobActions.ts produces.
 */
export function commitPlan(over: Record<string, unknown> = {}) {
  return {
    title: "Water",
    description: "Drink your water.",
    time: "20:00",
    date: "2026-09-02",
    frequency: "once",
    schedule: {
      type: "grid" as const,
      days: { kind: "date" as const, date: "2026-09-02" },
      times: { kind: "clock" as const, times: ["20:00"] },
      tzid: CLOCK.timezone,
    },
    scheduleType: "once" as const,
    onceAt: 1_800_000_000_000,
    tzid: CLOCK.timezone,
    emoji: "💧",
    urgency: "routine" as const,
    ttsText: "Drink your water.",
    ...over,
  };
}
