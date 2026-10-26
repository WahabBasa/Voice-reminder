"use node";

/**
 * The creation job's worker (spec 1.3).
 *
 * This is the fast path's mechanics — the same STT call, the same prompt,
 * the same planner — walked through checkpoints instead of run end to end. The
 * difference that matters: `processVoiceReminderFast` owns its take because the
 * client is blocked on its return value, whereas this action owns nothing. The
 * client has already been told the take exists, a retry may have superseded
 * this run mid-transcription, and the user may have cancelled. So every write
 * goes through a compare-and-set on `generation`, and a run that loses one
 * simply stops — no cleanup, no error, no second copy of the take. The winner
 * owns the cleanup (spec 1.3 step 4).
 *
 * `"use node"` because the STT and parse calls need the Node runtime, and a
 * `"use node"` file may hold actions and nothing else — which is why every
 * query and mutation this calls lives in convex/creationJobs.ts.
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
import { buildSystemPrompt, planRemindersFromRawParse, planTakeFromRawParse } from "./actions";
import {
  GUARD_V1,
  MAX_EVERY_N_DAYS,
  guardTake,
  validateCreationPlans,
  type GuardDetail,
  type GuardVerdict,
} from "./creationValidate";
import { isSupportedLineLanguage, normalizeLanguageCode } from "./languages";
import {
  isNeedsTimeDetail,
  planNeedsTime,
  toPendingPlan,
  type HeldPlan,
  type PendingPlan,
} from "./needsTime";
import { transcribeAudio, SttError, type SttPerf } from "./stt";
import { extractParseUsage } from "./parseUsage";
import type { scheduleFields } from "./schema";

/** The stage timings the job row carries. Every field optional — see 1.3. */
type WorkerPerf = {
  storageGetMs?: number;
  blobMs?: number;
  /** Compatibility alias for `sttMs`. */
  whisperMs?: number;
  parseMs?: number;
  commitMs?: number;
  totalMs?: number;

  // Speech-to-text (convex/stt.ts SttPerf), merged in from the helper.
  sttRequestedModel?: string;
  sttModel?: string;
  sttMs?: number;
  sttPrimaryMs?: number;
  sttFallbackMs?: number;
  sttFallbackUsed?: boolean;
  sttInputTokens?: number;
  sttOutputTokens?: number;
  sttAudioSeconds?: number;
  sttCostUsd?: number;

  // Where the transcript came from, and — for a device take — its on-device
  // timing/engine/locale. A device take fills these instead of the cloud STT
  // block above (spec §device transcript).
  sttSource?: "device" | "cloud";
  deviceSttMs?: number;
  deviceSttEngine?: "dictation" | "transcriber";
  deviceSttLocale?: string;

  // The locale retry (see localeRetryLanguage). The STT/parse fields above
  // keep describing the first attempt; these describe the retry.
  sttLocaleRetry?: boolean;
  sttLocaleRetryLang?: string;
  sttLocaleRetryUsed?: boolean;
  sttLocaleRetryMs?: number;

  // Scheduling, query and checkpoint timings (spec §4).
  schedulerDelayMs?: number;
  jobAgeMs?: number;
  getJobMs?: number;
  transcriptionCheckpointMs?: number;

  // Parse-response usage (convex/parseUsage.ts).
  parsePromptTokens?: number;
  parseCompletionTokens?: number;
  parseCachedTokens?: number;
  parseReasoningTokens?: number;
};

/**
 * Content-free backend telemetry lines (spec §4). Never carry audio,
 * transcripts, prompt text or credentials — only ids, model slugs and numbers.
 */
function logSttPerf(traceId: string | null, path: string, sttPerf: SttPerf): void {
  console.log(`[VR] stt_perf ${JSON.stringify({ traceId, path, ...sttPerf })}`);
}

function logParsePerf(
  traceId: string | null,
  path: string,
  parseMs: number,
  usage: ReturnType<typeof extractParseUsage>
): void {
  console.log(`[VR] parse_perf ${JSON.stringify({ traceId, path, parseMs, ...usage })}`);
}

function logCreationJobPerf(
  creationId: string,
  generation: number,
  status: string,
  perf: WorkerPerf
): void {
  console.log(
    `[VR] creation_job_perf ${JSON.stringify({ creationId, generation, status, ...perf })}`
  );
}

/** The closed set the schema's `errorCode` column holds. */
type ErrorCode = "storage_missing" | "stt_failed" | "parse_failed" | "unparseable" | "internal";

type PlannedReminder = ReturnType<typeof planRemindersFromRawParse>[number];

/** One parse, as the worker carries it to the gates. */
type ParsedTake = {
  plans: PlannedReminder[];
  /** The guard's envelope fields; both undefined on a take without guard_v1. */
  understood: boolean | undefined;
  language: string | undefined;
};

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

    // The spoken language (OLD-130), for every take that reported one.
    lang: plan.lang,
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

/**
 * What a `no_time`/`past_time` take keeps (convex/needsTime.ts): every plan as
 * `commit` would write it, and the card's compact view of each, flagged with
 * whether it is the one waiting for a time. Capped exactly like a committed
 * take, so the plans that are later resolved are the ones the gate would see.
 *
 * Exported for the unit tests.
 */
export function holdPlansForTime(
  plans: PlannedReminder[],
  now: number
): { heldPlans: HeldPlan[]; pendingPlans: PendingPlan[] } {
  const capped = plans.map(capEveryNDays);
  const heldPlans = capped.map(toCommitPlan);
  const pendingPlans = capped.map((plan, i) =>
    toPendingPlan(heldPlans[i], planNeedsTime(plan, now), plan.timeSpoken)
  );
  return { heldPlans, pendingPlans };
}

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
  perf: WorkerPerf,
  // The guard's reason (OLD-130). Only ever passed for a guard_v1 take, so
  // every other failure writes exactly the patch it always has.
  guard?: {
    errorDetail: GuardDetail;
    detectedLanguage?: string;
    pastTime?: string;
    // `no_time`/`past_time` only: the plans the card asks a time for.
    pendingPlans?: PendingPlan[];
    heldPlans?: HeldPlan[];
  },
  // What this run saw that the job row does not hold (OLD-136), kept on the
  // failed take's row for the founder: the parse model's raw answer.
  diag?: ParseDiagnostics
): Promise<void> {
  try {
    await ctx.runMutation(internal.creationJobs.casPatch, {
      jobId: args.jobId,
      generation: args.generation,
      expectStatus: ["pending", "transcribed"],
      patch: { status: "failed", errorCode, perf, ...(guard ?? {}) },
      ...(diag?.parseRaw !== undefined ? { diagnostics: { parseRaw: diag.parseRaw } } : {}),
    });
  } catch (e) {
    console.error("[VR] creation job: could not record failure:", e);
  }
}

/** Filled by `parseTake` as it goes, so a failure still reports what it got. */
type ParseDiagnostics = { parseRaw?: string };

type StageResult<T> = { ok: true; value: T } | { ok: false; code: ErrorCode };

/**
 * Steps 2 and 3: the stored recording, then transcription (convex/stt.ts).
 * `perf` is accumulated into so a failure still reports how far the job got.
 */
async function transcribeRecording(
  ctx: ActionCtx,
  audioStorageId: Id<"_storage"> | undefined,
  perf: WorkerPerf,
  traceId: string,
  // The phone's spoken-language hint (OLD-140); stt.ts gives it to the
  // primary model only.
  languageHint?: string,
  // The perf line's `path`: "job", or "job_locale_retry" for the retry.
  path = "job"
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

  try {
    const { text, perf: sttPerf } = await transcribeAudio(
      audioFile,
      languageHint ? { language: languageHint } : undefined
    );
    Object.assign(perf, sttPerf);
    perf.whisperMs = sttPerf.sttMs;
    logSttPerf(traceId, path, sttPerf);
    return { ok: true, value: text };
  } catch (e) {
    if (e instanceof SttError) {
      Object.assign(perf, e.perf);
      perf.whisperMs = e.perf.sttMs;
      logSttPerf(traceId, path, e.perf);
    }
    console.error("[VR] creation job: transcription failed");
    return { ok: false, code: "stt_failed" };
  }
}

/**
 * Step 5: the same parse call and the same planner the fast path runs
 * (convex/actions.ts createTakeWithDeferredAudio), against the user's own clock
 * snapshot rather than this container's UTC one (OLD-120).
 *
 * A guard_v1 take (OLD-130) gets the guard's prompt and planner instead: the
 * model may answer "not understood" with no reminders, and that comes back as
 * an empty take for the guard to name rather than as `parse_failed`.
 */
async function parseTake(
  job: { localDate: string; localTime: string; timezone: string },
  transcript: string,
  perf: WorkerPerf,
  traceId: string,
  guard: boolean,
  diag: ParseDiagnostics,
  path = "job"
): Promise<StageResult<ParsedTake>> {
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
          }, { guard }),
        },
        { role: "user", content: transcript },
      ],
    });

    const rawGptResponse = completion.choices[0].message.content || "{}";
    diag.parseRaw = rawGptResponse;
    // One take can hold several reminders (OLD-93); a single-reminder take is
    // an array of one.
    const planContext = {
      transcript,
      currentTime: job.localTime,
      currentDate: job.localDate,
      timezone: job.timezone,
    };
    const take: ParsedTake = guard
      ? planTakeFromRawParse(rawGptResponse, planContext)
      : {
          plans: planRemindersFromRawParse(rawGptResponse, planContext),
          understood: undefined,
          language: undefined,
        };
    perf.parseMs = Date.now() - tParse;
    const usage = extractParseUsage((completion as { usage?: unknown }).usage);
    Object.assign(perf, usage);
    logParsePerf(traceId, path, perf.parseMs, usage);
    return { ok: true, value: take };
  } catch (e) {
    perf.parseMs = Date.now() - tParse;
    console.error("[VR] creation job: parse failed:", e);
    return { ok: false, code: "parse_failed" };
  }
}

// ─── Judging a take ─────────────────────────────────────────────────────────

type GuardRejection = Extract<GuardVerdict, { ok: false }>;

/** Where one parsed take is headed, decided before anything is written. */
export type TakeOutcome =
  | { kind: "commit"; plans: PlannedReminder[] }
  // A guard rejection; `no_time`/`past_time` among them are held, not failed.
  | { kind: "guard"; verdict: GuardRejection }
  // The strict gate turned a plan away.
  | { kind: "gate"; index: number; field: string; reason: string };

/**
 * Steps 5b and 6 as one decision: the guard (for a guard_v1 take), then the
 * strict gate over the capped plans. Exported for the unit tests.
 */
export function judgeTake(
  take: ParsedTake,
  guard: boolean,
  timezone: string,
  now: number
): TakeOutcome {
  if (guard) {
    const verdict = guardTake({ ...take, now });
    if (!verdict.ok) return { kind: "guard", verdict };
  }
  const plans = take.plans.map(capEveryNDays);
  const verdict = validateCreationPlans(plans, { timezone, now });
  if (!verdict.ok) {
    return { kind: "gate", index: verdict.index, field: verdict.field, reason: verdict.reason };
  }
  return { kind: "commit", plans };
}

/** An outcome the user gets something from: a reminder, or the "when?" card. */
function isUsable(outcome: TakeOutcome): boolean {
  return (
    outcome.kind === "commit" ||
    (outcome.kind === "guard" && isNeedsTimeDetail(outcome.verdict.detail))
  );
}

/**
 * The language to re-transcribe a cloud take in, or undefined for no retry.
 *
 * The case this exists for: a brand-new install has no learned spoken language
 * yet, so its take goes to the transcriber with no hint, the transcriber
 * guesses wrong ("Dulce, de tomar tu pastilla" heard as Italian), and the
 * parse cannot make a reminder of the result. When that happens, and the
 * language the parse says it heard is not the phone's locale language, one
 * more transcription with the locale language as the hint is worth its few
 * seconds.
 *
 * Never the first attempt's hint — plenty of es-US phones belong to English
 * speakers. A retry only when:
 *   - the job had no languageHint (a learned language is better evidence),
 *   - the first take is unusable: not understood, an unvoiceable language, or
 *     turned away by the strict gate (never `no_time`/`past_time`, which the
 *     card handles),
 *   - the parse named a language, and it differs from the locale's,
 *   - and the locale's language is one Remi can speak a line in.
 *
 * Exported for the unit tests.
 */
export function localeRetryLanguage(
  take: ParsedTake,
  outcome: TakeOutcome,
  job: { languageHint?: string; deviceLocale?: string }
): string | undefined {
  if (job.languageHint) return undefined;
  if (isUsable(outcome)) return undefined;
  const locale = normalizeLanguageCode(job.deviceLocale);
  if (locale === undefined || !isSupportedLineLanguage(locale)) return undefined;
  const planLang = take.plans
    .map((plan) => normalizeLanguageCode((plan as { lang?: unknown }).lang))
    .find((code) => code !== undefined);
  const detected = normalizeLanguageCode(take.language) ?? planLang;
  if (detected === undefined || detected === locale) return undefined;
  return locale;
}

// ─── The worker ─────────────────────────────────────────────────────────────

export const run = internalAction({
  args: {
    jobId: v.id("creationJobs"),
    generation: v.number(),
    // The moment `begin`/`retry` scheduled this run, passed so the worker can
    // measure how long it waited in the scheduler queue. Optional so a run
    // queued by a build that predates this field still validates.
    scheduledAt: v.optional(v.number()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const handlerEnteredAt = Date.now();
    const tStart = handlerEnteredAt;
    const perf: WorkerPerf = {};

    // 1. Still the live run?
    const tGetJob = Date.now();
    let job;
    try {
      job = await ctx.runQuery(internal.creationJobs.getJob, { jobId: args.jobId });
    } finally {
      // In a `finally` so a rejected query still records the elapsed time.
      perf.getJobMs = Date.now() - tGetJob;
    }
    if (!job) return null;
    if (job.generation !== args.generation || job.status !== "pending") return null;

    // Scheduling telemetry. `jobAgeMs` is always createdAt → handler entry;
    // `schedulerDelayMs` is scheduledAt → handler entry when the timestamp was
    // supplied. For an already-queued generation-1 run without one, createdAt
    // IS the scheduling instant (begin schedules inside the insert), so it
    // stands in; a retry queued without one omits the delay rather than
    // pretending the createdAt gap is scheduler latency.
    perf.jobAgeMs = handlerEnteredAt - job.createdAt;
    if (args.scheduledAt !== undefined) {
      perf.schedulerDelayMs = handlerEnteredAt - args.scheduledAt;
    } else if (args.generation === 1) {
      perf.schedulerDelayMs = handlerEnteredAt - job.createdAt;
    }

    // 2-3. Transcript. A device take already carries it — the phone transcribed
    //    on-device and `begin` stored the text — so storage and cloud STT are
    //    skipped entirely, the STT timings read as zero, and the on-device
    //    provenance rides into the perf line. A cloud take transcribes its
    //    recording here as before.
    let transcript: string;
    if (job.sttSource === "device") {
      perf.sttSource = "device";
      perf.sttModel = "device";
      perf.storageGetMs = 0;
      perf.blobMs = 0;
      perf.sttMs = 0;
      perf.whisperMs = 0;
      perf.sttFallbackUsed = false;
      perf.deviceSttMs = job.deviceSttMs;
      perf.deviceSttEngine = job.deviceSttEngine;
      perf.deviceSttLocale = job.deviceSttLocale;
      const deviceTranscript = job.transcript?.trim() ?? "";
      if (deviceTranscript.length === 0) {
        // begin guarantees a device take has a non-empty transcript; a row that
        // reaches here without one is corrupt, not retryable-into-anything.
        await failJob(ctx, args, "internal", perf);
        logCreationJobPerf(job.creationId, args.generation, "failed", perf);
        return null;
      }
      transcript = deviceTranscript;
    } else {
      perf.sttSource = "cloud";
      const stt = await transcribeRecording(
        ctx,
        job.audioStorageId,
        perf,
        job.creationId,
        job.languageHint
      );
      if (!stt.ok) {
        await failJob(ctx, args, stt.code, perf);
        logCreationJobPerf(job.creationId, args.generation, "failed", perf);
        return null;
      }
      transcript = stt.value;
    }

    // 4. Milestone. Losing it means a retry or a cancel got here first, and the
    //    winner owns everything from here — including the recording. Kept for a
    //    device take too, so its race and cancel semantics are identical.
    let milestone;
    const tCheckpoint = Date.now();
    try {
      milestone = await ctx.runMutation(internal.creationJobs.casPatch, {
        jobId: args.jobId,
        generation: args.generation,
        expectStatus: ["pending"],
        patch: { status: "transcribed", transcript },
      });
    } finally {
      perf.transcriptionCheckpointMs = Date.now() - tCheckpoint;
    }
    if (milestone.result !== "applied") return null;

    // 5. Transcript → plans.
    const guard = job.clientFeatures?.includes(GUARD_V1) === true;
    let diag: ParseDiagnostics = {};
    const parsed = await parseTake(job, transcript, perf, job.creationId, guard, diag);
    if (!parsed.ok) {
      await failJob(ctx, args, parsed.code, perf, undefined, diag);
      logCreationJobPerf(job.creationId, args.generation, "failed", perf);
      return null;
    }

    // 5b-6. The guard (OLD-130), for a client that opted in, then the strict
    //    gate. All N are checked before anything is written, and one bad item
    //    fails the whole take rather than importing half of it. The one repair
    //    made on the way in is the every-N-days cap — see capEveryNDays; the
    //    capped plans are what is validated AND committed.
    let take = parsed.value;
    let outcome = judgeTake(take, guard, job.timezone, Date.now());

    // 5c. The locale retry: one re-transcription with the phone's locale
    //     language as the hint, for a hintless cloud take whose language was
    //     misheard (see localeRetryLanguage). Its take is used only if the
    //     user gets something from it; otherwise the first one stands, so the
    //     failure, its row and the founder's email all describe the first
    //     attempt exactly as before.
    const retryLang =
      job.sttSource !== "device" ? localeRetryLanguage(take, outcome, job) : undefined;
    if (retryLang !== undefined) {
      const tRetry = Date.now();
      perf.sttLocaleRetry = true;
      perf.sttLocaleRetryLang = retryLang;
      perf.sttLocaleRetryUsed = false;
      // Its own perf object: the first attempt's timings stay as they were.
      const retryPerf: WorkerPerf = {};
      const retryStt = await transcribeRecording(
        ctx,
        job.audioStorageId,
        retryPerf,
        job.creationId,
        retryLang,
        "job_locale_retry"
      );
      if (retryStt.ok) {
        const retryDiag: ParseDiagnostics = {};
        const retryParsed = await parseTake(
          job,
          retryStt.value,
          retryPerf,
          job.creationId,
          guard,
          retryDiag,
          "job_locale_retry"
        );
        if (retryParsed.ok) {
          const retryOutcome = judgeTake(retryParsed.value, guard, job.timezone, Date.now());
          if (isUsable(retryOutcome)) {
            perf.sttLocaleRetryUsed = true;
            perf.sttLocaleRetryMs = Date.now() - tRetry;
            // The row's transcript becomes the one the reminder is made from.
            // Same CAS as every other write: a retry or cancel that landed
            // while this was transcribing wins, and this run stops here.
            const swapped = await ctx.runMutation(internal.creationJobs.casPatch, {
              jobId: args.jobId,
              generation: args.generation,
              expectStatus: ["transcribed"],
              patch: { transcript: retryStt.value },
            });
            if (swapped.result !== "applied") return null;
            take = retryParsed.value;
            outcome = retryOutcome;
            diag = retryDiag;
          }
        }
      }
      perf.sttLocaleRetryMs = Date.now() - tRetry;
    }

    // Each rejection fails as the `unparseable` every client already handles,
    // plus (for a guard take) the reason a new client can show. Content-free
    // logs: no transcript.
    if (outcome.kind === "guard") {
      const verdict = outcome.verdict;
      // A take that only lacks a usable time keeps what it heard, so the
      // card can ask "When should I remind you?" instead of failing it. That
      // is not a failure, so it is not logged as one.
      const needsTime = isNeedsTimeDetail(verdict.detail);
      const line = `[VR] creation job: guard rejected — ${verdict.detail}: ${verdict.reason}`;
      if (needsTime) console.log(line);
      else console.error(line);
      const held = needsTime ? holdPlansForTime(take.plans, Date.now()) : undefined;
      await failJob(ctx, args, "unparseable", perf, {
        errorDetail: verdict.detail,
        ...(verdict.detectedLanguage !== undefined
          ? { detectedLanguage: verdict.detectedLanguage }
          : {}),
        ...(verdict.pastTime !== undefined ? { pastTime: verdict.pastTime } : {}),
        ...(held ?? {}),
      }, diag);
      logCreationJobPerf(job.creationId, args.generation, "failed", perf);
      return null;
    }
    if (outcome.kind === "gate") {
      console.error(
        `[VR] creation job: plan ${outcome.index} rejected — ${outcome.field}: ${outcome.reason}`
      );
      await failJob(ctx, args, "unparseable", perf, undefined, diag);
      logCreationJobPerf(job.creationId, args.generation, "failed", perf);
      return null;
    }
    const plans = outcome.plans;

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
      await failJob(ctx, args, "internal", perf, undefined, diag);
      logCreationJobPerf(job.creationId, args.generation, "failed", perf);
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

    logCreationJobPerf(job.creationId, args.generation, "committed", perf);
    return null;
  },
});
