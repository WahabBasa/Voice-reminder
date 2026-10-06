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
  // `whisperMs` is a compatibility alias for `sttMs`, kept so the existing
  // device log and every pre-STT-switch job row still read the same field.
  whisperMs: v.optional(v.number()),
  parseMs: v.optional(v.number()),
  commitMs: v.optional(v.number()),
  totalMs: v.optional(v.number()),

  // ── Speech-to-text (convex/stt.ts SttPerf), all optional so a job that
  //    failed before STT, or a row written before the switch, still validates.
  sttRequestedModel: v.optional(v.string()),
  sttModel: v.optional(v.string()),
  sttMs: v.optional(v.number()),
  sttPrimaryMs: v.optional(v.number()),
  sttFallbackMs: v.optional(v.number()),
  sttFallbackUsed: v.optional(v.boolean()),
  sttInputTokens: v.optional(v.number()),
  sttOutputTokens: v.optional(v.number()),
  sttAudioSeconds: v.optional(v.number()),
  sttCostUsd: v.optional(v.number()),

  // ── Device-STT provenance (spec §device transcript). "device" takes skip the
  //    cloud STT block above entirely; these say so and carry the on-device
  //    timing/engine/locale so the perf line reads the same shape either way.
  sttSource: v.optional(v.union(v.literal("device"), v.literal("cloud"))),
  deviceSttMs: v.optional(v.number()),
  deviceSttEngine: v.optional(
    v.union(v.literal("dictation"), v.literal("transcriber"))
  ),
  deviceSttLocale: v.optional(v.string()),

  // ── Scheduling, query and checkpoint timings (spec §4).
  schedulerDelayMs: v.optional(v.number()),
  jobAgeMs: v.optional(v.number()),
  getJobMs: v.optional(v.number()),
  transcriptionCheckpointMs: v.optional(v.number()),

  // ── Parse-response usage (convex/parseUsage.ts).
  parsePromptTokens: v.optional(v.number()),
  parseCompletionTokens: v.optional(v.number()),
  parseCachedTokens: v.optional(v.number()),
  parseReasoningTokens: v.optional(v.number()),
});

/** Why the guard turned a take away (OLD-130; creationValidate.GuardDetail). */
export const creationErrorDetailValidator = v.union(
  v.literal("not_understood"),
  v.literal("no_time"),
  v.literal("unsupported_language"),
  // A one-off whose time had already passed when the take was parsed ("today
  // at 10", said at 11:41). The card asks when instead of guessing.
  v.literal("past_time")
);

/** The five states a creation job can be in. The last three are terminal. */
export const creationStatusValidator = v.union(
  v.literal("pending"),
  v.literal("transcribed"),
  v.literal("committed"),
  v.literal("failed"),
  v.literal("cancelled")
);

/**
 * The columns of a `failedTakes` row (OLD-136), shared with
 * convex/failedTakes.ts so the founder's read can declare its return shape.
 */
export const failedTakeFields = {
  // The job this attempt belonged to; may dangle once the job is collected.
  jobId: v.id("creationJobs"),
  creationId: v.string(),
  generation: v.number(),
  deviceTag: v.string(),
  at: v.number(),
  errorCode: v.optional(v.string()),
  errorDetail: v.optional(v.string()),
  detectedLanguage: v.optional(v.string()),
  sttSource: v.optional(v.string()),
  deviceSttLocale: v.optional(v.string()),
  deviceSttEngine: v.optional(v.string()),
  // The on-device transcript, when the take came from the phone.
  deviceTranscript: v.optional(v.string()),
  // The server STT result for THIS attempt, and the model that produced it
  // (the fallback model when `cloudSttFallbackUsed`).
  cloudTranscript: v.optional(v.string()),
  cloudSttModel: v.optional(v.string()),
  cloudSttFallbackUsed: v.optional(v.boolean()),
  // The parse model's raw JSON answer, truncated to ~4 KB.
  parseRaw: v.optional(v.string()),
  // The clock time a `past_time` take named, when the guard reported one.
  pastTime: v.optional(v.string()),
  audioSeconds: v.optional(v.number()),
  // Timings for the founder's take email (ms).
  deviceSttMs: v.optional(v.number()),
  sttMs: v.optional(v.number()),
  parseMs: v.optional(v.number()),
  totalMs: v.optional(v.number()),
  timezone: v.optional(v.string()),
  buildNumber: v.optional(v.string()),
  // The retained recording. Several rows may share one blob (a cloud take
  // that failed twice on the same upload).
  audioStorageId: v.optional(v.id("_storage")),
};

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
    // ISO 639-1 code of the language the reminder was spoken in, as the parse
    // reported it (OLD-130). What its line is voiced in. Absent on rows written
    // before the parse returned it. OLD-131 picks the line's voice from it, and
    // writes it from the legacy fast/slow actions too.
    lang: v.optional(v.string()),
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
    // deleted at commit, cancel, discard or GC. A device-transcribed take
    // (sttSource "device") never has one — its transcript arrived with `begin`.
    audioStorageId: v.optional(v.id("_storage")),
    // Where the transcript came from. "device" = the phone transcribed on-device
    // and `begin` carried the text, so the worker skips storage + cloud STT;
    // "cloud" = the worker transcribes the recording itself. Absent on rows
    // written before this field existed, which are all cloud.
    sttSource: v.optional(v.union(v.literal("device"), v.literal("cloud"))),
    // Device-STT telemetry, only set on a "device" take. How long the on-device
    // transcription took, which engine produced it, and the recognizer locale.
    deviceSttMs: v.optional(v.number()),
    deviceSttEngine: v.optional(
      v.union(v.literal("dictation"), v.literal("transcriber"))
    ),
    deviceSttLocale: v.optional(v.string()),
    // Insertion order, written by `commit` — the order `getReminders` replays.
    reminderIds: v.optional(v.array(v.id("reminders"))),
    // storage_missing | stt_failed | parse_failed | unparseable | internal
    errorCode: v.optional(v.string()),
    // Why an `unparseable` take was turned away, set only for a job begun with
    // the "guard_v1" client feature (OLD-130). Older clients never see it and
    // keep reading the bare errorCode.
    errorDetail: v.optional(creationErrorDetailValidator),
    // ISO 639-1 code of the language an `unsupported_language` take was in.
    detectedLanguage: v.optional(v.string()),
    // The spoken one-off time ("HH:MM", the user's clock) of a `past_time` take.
    pastTime: v.optional(v.string()),
    // Capabilities the client declared at `begin` (e.g. "guard_v1"). Absent on
    // every job from a build that predates the field.
    clientFeatures: v.optional(v.array(v.string())),
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

  /**
   * In-app user feedback (bug reports, requests) with a founder-set status.
   *
   * There are no accounts, so a report belongs to the device that filed it, and
   * `listForDevice` only ever returns that device's own rows. `clientId` is the
   * client-generated idempotency key: a lost `submit` response must not file a
   * second report or send a second email. `status`/`note`/`respondedAt` are the
   * founder's half — set from the dashboard through `feedback.setStatus`, never
   * on submit.
   */
  feedback: defineTable({
    // Client uuid, the idempotency key on (deviceId, clientId).
    clientId: v.string(),
    // Owning install (bearer id, same trust model as creationJobs).
    deviceId: v.string(),
    // The report itself, trimmed to 1..2000 chars by the mutation.
    text: v.string(),
    // The client's clock at file time; `receivedAt` is the server's.
    createdAt: v.number(),
    receivedAt: v.number(),
    // Client-attached JSON (screen, reminder, error, build). Capped at 8 KB
    // serialized by the mutation. Never crosses back to the client.
    context: v.optional(v.any()),
    status: v.union(v.literal("received"), v.literal("looking"), v.literal("fixed")),
    // The founder's short reply, shown next to the status.
    note: v.optional(v.string()),
    // Server time the founder last set a status; only setStatus writes it.
    respondedAt: v.optional(v.number()),
    updatedAt: v.number(),
  })
    .index("by_device", ["deviceId", "createdAt"])
    .index("by_client", ["deviceId", "clientId"]),

  /**
   * One row per install that has opened the app (OLD-135, founder alerts).
   *
   * Written by `devices.hello` (once per launch, throttled to one write an hour),
   * by `founderAlerts.recordOutcome` when a take arrives from an install that
   * never said hello (an older build), and by `devices.seedFromReminders`.
   * `seeded` marks installs that existed before this table did, so they never
   * read as "new". The runtime fields are optional because seeded rows and
   * take-registered rows start without them; the next hello fills them in.
   */
  devices: defineTable({
    deviceId: v.string(),
    // First 8 hex of SHA-256(deviceId) — the only handle emails carry.
    deviceTag: v.string(),
    firstSeenAt: v.number(),
    // 0 on rows nobody has said hello from yet (seeded / take-registered).
    lastSeenAt: v.number(),
    seeded: v.boolean(),
    buildNumber: v.optional(v.string()),
    updateId: v.optional(v.string()),
    // First preferred locale (lib/deviceStt.ts getDeviceLocales()[0]).
    locale: v.optional(v.string()),
    timezone: v.optional(v.string()),
    iosVersion: v.optional(v.string()),
  })
    .index("by_deviceId", ["deviceId"])
    .index("by_firstSeen", ["firstSeenAt"])
    .index("by_lastSeen", ["lastSeenAt"]),

  /**
   * One row per creation-job terminal transition (committed / failed), for the
   * founder's alerts and daily summary (OLD-135). Carries no deviceId and no
   * user content — `deviceTag` only. Pruned after 30 days by a cron.
   */
  takeOutcomes: defineTable({
    creationId: v.string(),
    deviceTag: v.string(),
    status: v.union(v.literal("committed"), v.literal("failed")),
    errorCode: v.optional(v.string()),
    errorDetail: v.optional(v.string()),
    sttSource: v.optional(v.string()),
    deviceSttLocale: v.optional(v.string()),
    timezone: v.optional(v.string()),
    buildNumber: v.optional(v.string()),
    reminderCount: v.optional(v.number()),
    // Classification at record time (founderAlertsEmail.classifyOutcome).
    newDevice: v.boolean(),
    firstTake: v.boolean(),
    at: v.number(),
  })
    .index("by_at", ["at"])
    .index("by_device_tag", ["deviceTag", "at"]),

  /**
   * One row per FAILED creation-job attempt (OLD-136), kept for 7 days so the
   * founder can see what Remi heard and why it gave up. Unlike `takeOutcomes`
   * (content-free, 30 days) this table holds user content: the transcripts, the
   * parse model's raw answer and, for a cloud take, the recording itself.
   *
   * Written by `failedTakes.recordFailedTake`, inside the same transaction that
   * flips the job to `failed` (convex/creationJobs.ts `applyCas`). Owns its
   * `audioStorageId`: while a row references a blob, no creation-job cleanup
   * deletes it, and `failedTakes.purge` deletes it once the last row lets go.
   * Carries `deviceTag`, never the deviceId.
   */
  failedTakes: defineTable(failedTakeFields)
    .index("by_at", ["at"])
    .index("by_creation", ["creationId", "generation"])
    .index("by_device_tag", ["deviceTag", "at"])
    .index("by_audio", ["audioStorageId"]),

  /**
   * One row per take the founder gets (or will get) an email about: the
   * de-duplication key for convex/founderAlerts.ts `deliverTakeEmail`, which
   * sends ONE email per take once it has settled, however many attempts failed.
   * Carries `deviceTag` and a small device snapshot, never the deviceId.
   * Pruned with takeOutcomes after 30 days.
   */
  takeEmails: defineTable({
    creationId: v.string(),
    deviceTag: v.string(),
    jobId: v.id("creationJobs"),
    // When the first email for this take was scheduled, and when the pending
    // one is due. `sentAt` is set when an email goes out; a later twist in the
    // take (a manual retry that recovers or fails again) clears it and
    // schedules a follow-up.
    scheduledAt: v.number(),
    dueAt: v.number(),
    sentAt: v.optional(v.number()),
    sentCount: v.number(),
    newDevice: v.boolean(),
    firstTake: v.boolean(),
    timezone: v.optional(v.string()),
    locale: v.optional(v.string()),
    buildNumber: v.optional(v.string()),
    updateId: v.optional(v.string()),
    iosVersion: v.optional(v.string()),
  })
    .index("by_creation", ["creationId"])
    .index("by_scheduled", ["scheduledAt"]),
});
