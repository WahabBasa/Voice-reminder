import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import type { GridSchedule } from "./scheduleShape";

// Validator half of the days × times grid (OLD-97). The TypeScript half lives in
// ./scheduleShape.ts and is the one definition; `gridScheduleValidator satisfies`
// below is what keeps the two from drifting.
const weekdayValidator = v.union(
  v.literal("sun"), v.literal("mon"), v.literal("tue"), v.literal("wed"),
  v.literal("thu"), v.literal("fri"), v.literal("sat")
);

const daysRuleValidator = v.union(
  v.object({ kind: v.literal("everyday") }),
  v.object({ kind: v.literal("weekdays"), days: v.array(weekdayValidator) }),
  v.object({ kind: v.literal("everyNDays"), interval: v.number(), startDate: v.string() }),
  v.object({ kind: v.literal("date"), date: v.string() })
);

const timesRuleValidator = v.union(
  v.object({ kind: v.literal("clock"), times: v.array(v.string()) }),
  v.object({
    kind: v.literal("interval"),
    everyMinutes: v.number(),
    windowStart: v.string(),
    windowEnd: v.string(),
  })
);

export const gridScheduleValidator = v.object({
  type: v.literal("grid"),
  days: daysRuleValidator,
  times: timesRuleValidator,
  until: v.optional(v.number()),
  tzid: v.optional(v.string()),
});

/**
 * Every schedule field a reminder can carry, shared verbatim by the table and by
 * reminders.create / reminders.update. Before OLD-97 half of these lived only in
 * AsyncStorage, so an edit round-tripped through Convex silently lost them.
 */
export const scheduleFields = {
  time: v.string(),
  date: v.optional(v.string()), // YYYY-MM-DD for one-time reminders on specific days
  frequency: v.string(),
  days: v.optional(v.array(v.string())),
  // The grid itself — authoritative. The four fields above are its legacy
  // projection (see legacyFieldsFromGrid) and are what pre-grid readers use.
  schedule: v.optional(gridScheduleValidator),
  scheduleType: v.optional(
    v.union(v.literal("once"), v.literal("interval"), v.literal("rrule"), v.literal("grid"))
  ),
  onceAt: v.optional(v.number()),
  rrule: v.optional(v.string()),
  dtstart: v.optional(v.number()),
  tzid: v.optional(v.string()),
  until: v.optional(v.number()),
  intervalMs: v.optional(v.number()),
  anchorAt: v.optional(v.number()),
  intervalDays: v.optional(v.number()),
  parseWarnings: v.optional(v.array(v.string())),
};

// Drift guard: the validator and the hand-written type describe the same shape.
export type GridScheduleDoc = typeof gridScheduleValidator.type;
const _gridShapesAgree = (schedule: GridSchedule): GridScheduleDoc => schedule;
void _gridShapesAgree;

/**
 * Every field of the perf summary a creation job accumulates. Optional
 * throughout because a job that failed at step 2 still reports the stages it
 * did reach, and `commitMs`/`totalMs` land in a later best-effort patch.
 */
export const creationPerfValidator = v.object({
  storageGetMs: v.optional(v.number()),
  blobMs: v.optional(v.number()),
  whisperMs: v.optional(v.number()),
  parseMs: v.optional(v.number()),
  commitMs: v.optional(v.number()),
  totalMs: v.optional(v.number()),
});

/** The five states a creation job can be in. The last three are terminal. */
export const creationStatusValidator = v.union(
  v.literal("pending"),
  v.literal("transcribed"),
  v.literal("committed"),
  v.literal("failed"),
  v.literal("cancelled")
);

export default defineSchema({
  reminders: defineTable({
    // Owning install (OLD-74). There are no accounts, so a reminder belongs to
    // the device that created it. Optional because rows written before scoping
    // existed have none — see convex/reminders.ts for how those are treated.
    deviceId: v.optional(v.string()),
    // The take that produced this row, stamped at commit by
    // convex/creationJobs.ts. Optional because every row written before the
    // creation-job pipeline existed — and every row the legacy actions still
    // write — has none. It is what lets a client that lost its outbox prove an
    // import already persisted (spec 2.5, "committing + null").
    creationId: v.optional(v.string()),
    title: v.string(),
    description: v.string(),
    ...scheduleFields,
    // Card chip emoji picked by the parse (absent → neutral bell chip)
    emoji: v.optional(v.string()),
    audioStorageId: v.optional(v.id("_storage")),
    // Alarm-ready WAV of the base spoken line (iOS AlarmKit custom sound)
    wavStorageId: v.optional(v.id("_storage")),
    // Smart pre-reminder (heads-up before the event); 0/absent = none
    preReminderMinutes: v.optional(v.number()),
    preAudioStorageId: v.optional(v.id("_storage")),
    // Ring tier (OLD-53): how hard the alarm pushes while it rings, plus the
    // "keep reminding until Done" flag. Both still written and read.
    urgency: v.optional(
      v.union(v.literal("urgent"), v.literal("notice"), v.literal("routine"))
    ),
    persistent: v.optional(v.boolean()),
    // DEPRECATED (OLD-108) — never written on new rows, never read anywhere.
    //
    // These held the escalating replay lines and their audios: the parse
    // produced one to three rewordings per urgent/persistent reminder, and the
    // nag chain spoke a different one each time it came back. The product
    // decision is that the nag repeats the SAME line, so the whole pipeline
    // (prompt field, synthesis, download, playback) is gone.
    //
    // The columns stay because the rows do: reminders created before the strip
    // still carry these values and their stored blobs, and a Convex schema that
    // stopped declaring them would reject every one of those documents on the
    // next write. `reminders.remove` is the only code left that touches them —
    // it deletes the blobs so an old reminder still cleans up after itself.
    // Safe to drop for good once no row carries them.
    variants: v.optional(v.array(v.string())),
    variantAudioStorageIds: v.optional(v.array(v.id("_storage"))),
    variantWavStorageIds: v.optional(v.array(v.id("_storage"))),
    createdAt: v.number(),
    // Audio status for background TTS generation. Covers the BASE spoken line
    // only — "ready" means the line this reminder rings is stored and playable.
    audioStatus: v.optional(v.union(v.literal("pending"), v.literal("ready"), v.literal("failed"))),
    // The other line: the pre-alert heads-up (OLD-107, narrowed in OLD-108).
    //
    // Split out of audioStatus because it is not needed to ring — the pre-alert
    // fires minutes BEFORE the event — and holding "pending" until it landed
    // cost the reminder seconds of waiting for audio nothing was about to play.
    // It covered the replay variant lines too until OLD-108 removed them; the
    // field is KEPT rather than folded into the base patch, because folding it
    // would put the pre-alert synth back inside the wait OLD-107 took it out
    // of. Absent means "this reminder has no pre-alert", which is the legacy
    // row and the no-lead-time reminder alike.
    audioExtrasStatus: v.optional(
      v.union(v.literal("pending"), v.literal("ready"), v.literal("failed"))
    ),
    audioError: v.optional(v.string()),
    audioUpdatedAt: v.optional(v.number()),
    // Alarm settings (optional for backward compatibility)
    soundRepeatCount: v.optional(v.number()),
    soundRepeatMode: v.optional(v.string()),
  }).index("by_device", ["deviceId"]),

  /**
   * One voice take, from stop-tap to armed reminders.
   *
   * The row IS the pipeline's state: the client creates it (`begin`), a Node
   * worker walks it through STT → parse → commit, and the client watches it to
   * fill the pending card. Every write past `begin` is a compare-and-set on
   * `generation`, so a worker that was superseded by a retry — or by the stale
   * sweep — writes nothing (spec 1.3). `committed`, `failed` and `cancelled`
   * are terminal and never regress; `failed` is the retryable one.
   *
   * Rows outlive the take deliberately: a committed job survives until the
   * client acks the import or seven days pass, whichever comes first, so an
   * offline or force-quit client can still find its reminders (spec 1.1).
   */
  creationJobs: defineTable({
    // Owning install (OLD-74). Required here — every job has a creator.
    deviceId: v.string(),
    // Client-generated UUID. The idempotency key: a re-`begin` after a lost
    // response finds this row instead of starting a second take.
    creationId: v.string(),
    status: creationStatusValidator,
    // Bumped by `retry`. Every write CAS's on it, which is how a superseded
    // worker is silenced without having to be cancellable.
    generation: v.number(),
    // Worker runs so far, capped at 3 by `retry`.
    attempts: v.number(),
    transcript: v.optional(v.string()),
    // The uploaded recording. Retained while the job can still be retried and
    // deleted at commit, cancel, discard or GC.
    audioStorageId: v.optional(v.id("_storage")),
    // Insertion order, written by `commit` — the order `getReminders` replays.
    reminderIds: v.optional(v.array(v.id("reminders"))),
    // storage_missing | stt_failed | parse_failed | unparseable | internal
    errorCode: v.optional(v.string()),
    // Set by `ack` once the client has durably imported the take (spec 1.4).
    ackedAt: v.optional(v.number()),
    // The user's own clock at stop-tap. A one-off's instant is resolved against
    // these and never the worker container's UTC clock (OLD-120).
    localDate: v.string(),
    localTime: v.string(),
    timezone: v.string(),
    perf: v.optional(creationPerfValidator),
    createdAt: v.number(),
    // Bumped by every CAS write. The stale sweep's clock and the GC's age.
    updatedAt: v.number(),
  })
    .index("by_device_creation", ["deviceId", "creationId"])
    .index("by_status_updated", ["status", "updatedAt"]),
});
