/**
 * The creation-job worker's new instrumentation (spec §4).
 *
 * The `run` handler is exercised against a fake ctx and mocked providers, with
 * a frozen clock, to pin the scheduling / query / checkpoint timings, the
 * generation-1-vs-retry scheduler-delay rule, that the full perf object reaches
 * `commit`, and that an STT helper failure becomes `stt_failed` without ever
 * reaching the parse.
 *
 * The parse planner and the strict gate are mocked to a single valid plan —
 * they have their own suites — so what is under test here is the worker's
 * control flow and telemetry, not transcription or planning.
 */

const mockTranscriptionCreate = jest.fn();
const mockCompletionsCreate = jest.fn();

jest.mock("openai", () => ({
  __esModule: true,
  default: class MockOpenAI {
    audio = { transcriptions: { create: (...args: unknown[]) => mockTranscriptionCreate(...args) } };
    chat = { completions: { create: (...args: unknown[]) => mockCompletionsCreate(...args) } };
    constructor(_options: unknown) {}
  },
}));

// The guard's planner (OLD-130). Defaults to an understood take of the same one
// plan; the guard tests override it per case.
const mockPlanTake = jest.fn();
const mockBuildSystemPrompt = jest.fn((..._args: unknown[]) => "SYSTEM PROMPT");

// The parse planner and the prompt builder have their own tests; here they are
// stubbed so the worker sees one valid plan without a real model call. The plan
// lives inside the factory because jest.mock is hoisted above the module body.
jest.mock("../../convex/actions", () => ({
  __esModule: true,
  buildSystemPrompt: (...args: unknown[]) => mockBuildSystemPrompt(...args),
  planTakeFromRawParse: (...args: unknown[]) => mockPlanTake(...args),
  planRemindersFromRawParse: () => [
    {
      title: "Water",
      description: "Drink your water.",
      time: "20:00",
      date: undefined,
      frequency: "daily",
      days: undefined,
      schedule: {
        type: "grid" as const,
        days: { kind: "everyday" as const },
        times: { kind: "clock" as const, times: ["20:00"] },
        tzid: "Asia/Dubai",
      },
      scheduleType: "rrule",
      onceAt: undefined,
      rrule: "FREQ=DAILY",
      dtstart: undefined,
      until: undefined,
      intervalMs: undefined,
      anchorAt: undefined,
      intervalDays: undefined,
      parseWarnings: [],
      emoji: "💧",
      preReminderMinutes: 0,
      urgency: "routine",
      persistent: false,
      preTtsText: "",
      lang: "en",
    },
  ],
}));

// The strict gate has its own suite; accept the plan so the worker reaches commit.
jest.mock("../../convex/creationValidate", () => ({
  __esModule: true,
  ...jest.requireActual("../../convex/creationValidate"),
  validateCreationPlans: jest.fn(() => ({ ok: true })),
}));

import { run } from "../../convex/creationJobActions";

type Handler = (ctx: any, args: any) => Promise<any>;
const handlerOf = (fn: unknown): Handler => (fn as { _handler: Handler })._handler;

const NOW = 1_000_000;
const CREATED_AT = 999_000; // → jobAgeMs 1000 under the frozen clock

const PARSE_USAGE = {
  prompt_tokens: 1200,
  completion_tokens: 40,
  prompt_tokens_details: { cached_tokens: 900 },
  completion_tokens_details: { reasoning_tokens: 0 },
};

function makeJob(over: Record<string, unknown> = {}) {
  return {
    deviceId: "device_a",
    creationId: "take_1",
    status: "pending",
    generation: 1,
    attempts: 1,
    audioStorageId: "storage_1",
    localDate: "2026-09-01",
    localTime: "10:00:00",
    timezone: "Asia/Dubai",
    createdAt: CREATED_AT,
    ...over,
  };
}

function makeCtx(job: Record<string, unknown> | null) {
  const runMutation = jest.fn(async (_ref: unknown, args: any) => {
    if (args.patch?.status === "failed") return { result: "applied" };
    if (args.patch?.status === "transcribed") return { result: "applied" };
    if (args.plans) return { result: "applied", reminderIds: ["r1"] };
    if (args.perf) return { result: "applied" };
    return { result: "applied" };
  });
  return {
    runQuery: jest.fn(async () => job),
    runMutation,
    storage: { get: jest.fn(async () => new Blob([new Uint8Array([1, 2, 3])])) },
  };
}

const commitOf = (ctx: any) =>
  ctx.runMutation.mock.calls.find(([, a]: [unknown, any]) => a.plans)?.[1];
const failOf = (ctx: any) =>
  ctx.runMutation.mock.calls.find(([, a]: [unknown, any]) => a.patch?.status === "failed")?.[1];

beforeEach(() => {
  jest.spyOn(Date, "now").mockReturnValue(NOW);
  mockTranscriptionCreate.mockReset().mockResolvedValue({ text: "drink water" });
  mockCompletionsCreate
    .mockReset()
    .mockResolvedValue({ choices: [{ message: { content: "{}" } }], usage: PARSE_USAGE });
  process.env.OPENROUTER_API_KEY = "test-openrouter-key";
  delete process.env.STT_MODEL;
});

afterEach(() => {
  (Date.now as jest.Mock).mockRestore?.();
});

describe("scheduling and stage telemetry", () => {
  it("carries scheduler / query / checkpoint / STT / parse timings all the way to commit", async () => {
    const ctx = makeCtx(makeJob());
    await handlerOf(run)(ctx, { jobId: "job_1", generation: 1, scheduledAt: 999_500 });

    const perf = commitOf(ctx)?.preCommitPerf;
    expect(perf).toBeDefined();
    // scheduledAt was supplied → delay is handler-entry minus it.
    expect(perf.schedulerDelayMs).toBe(500);
    expect(perf.jobAgeMs).toBe(1000);
    // Frozen clock → the query and checkpoint spans are zero but present.
    expect(perf.getJobMs).toBe(0);
    expect(perf.transcriptionCheckpointMs).toBe(0);
    // STT merged, with the compatibility alias.
    expect(perf.sttRequestedModel).toBe("openai/gpt-4o-mini-transcribe");
    expect(perf.sttModel).toBe("openai/gpt-4o-mini-transcribe");
    expect(perf.whisperMs).toBe(perf.sttMs);
    // Parse timing + usage.
    expect(perf.parseMs).toBe(0);
    expect(perf.parsePromptTokens).toBe(1200);
    expect(perf.parseCachedTokens).toBe(900);
    expect(perf.parseReasoningTokens).toBe(0);
  });

  it("uses createdAt as the scheduling instant for an already-queued generation-1 run", async () => {
    const ctx = makeCtx(makeJob());
    await handlerOf(run)(ctx, { jobId: "job_1", generation: 1 }); // no scheduledAt

    const perf = commitOf(ctx)?.preCommitPerf;
    expect(perf.schedulerDelayMs).toBe(1000);
    expect(perf.schedulerDelayMs).toBe(perf.jobAgeMs);
  });

  it("computes the delay from scheduledAt on a retry", async () => {
    const ctx = makeCtx(makeJob({ generation: 2 }));
    await handlerOf(run)(ctx, { jobId: "job_1", generation: 2, scheduledAt: 999_700 });

    expect(commitOf(ctx)?.preCommitPerf.schedulerDelayMs).toBe(300);
  });

  it("omits the scheduler delay for an already-queued retry without a scheduledAt", async () => {
    const ctx = makeCtx(makeJob({ generation: 2 }));
    await handlerOf(run)(ctx, { jobId: "job_1", generation: 2 });

    const perf = commitOf(ctx)?.preCommitPerf;
    expect(perf.schedulerDelayMs).toBeUndefined();
    expect(perf.jobAgeMs).toBe(1000);
  });
});

describe("the cloud path", () => {
  it("stamps sttSource cloud on the perf it carries to commit", async () => {
    const ctx = makeCtx(makeJob());
    await handlerOf(run)(ctx, { jobId: "job_1", generation: 1, scheduledAt: 999_500 });
    expect(commitOf(ctx)?.preCommitPerf.sttSource).toBe("cloud");
  });

  it("hands the job's languageHint to the transcriber's primary model (OLD-140)", async () => {
    const ctx = makeCtx(makeJob({ languageHint: "sv" }));
    await handlerOf(run)(ctx, { jobId: "job_1", generation: 1, scheduledAt: 999_500 });
    expect(mockTranscriptionCreate.mock.calls[0][0].language).toBe("sv");
  });

  it("sends no language for a job without a hint", async () => {
    const ctx = makeCtx(makeJob());
    await handlerOf(run)(ctx, { jobId: "job_1", generation: 1, scheduledAt: 999_500 });
    expect("language" in mockTranscriptionCreate.mock.calls[0][0]).toBe(false);
  });
});

describe("a device-transcribed take", () => {
  function deviceJob(over: Record<string, unknown> = {}) {
    return makeJob({
      audioStorageId: undefined,
      sttSource: "device",
      transcript: "drink water at eight",
      deviceSttMs: 120,
      deviceSttEngine: "dictation",
      deviceSttLocale: "en-US",
      ...over,
    });
  }

  it("skips storage and STT, parses the stored transcript and commits", async () => {
    const ctx = makeCtx(deviceJob());
    await handlerOf(run)(ctx, { jobId: "job_1", generation: 1, scheduledAt: 999_500 });

    // Neither the recording nor the cloud transcriber was ever touched.
    expect(ctx.storage.get).not.toHaveBeenCalled();
    expect(mockTranscriptionCreate).not.toHaveBeenCalled();
    // The parse ran on the device transcript, as the user message.
    expect(mockCompletionsCreate).toHaveBeenCalledTimes(1);
    const messages = (mockCompletionsCreate.mock.calls[0][0] as any).messages;
    expect(messages[messages.length - 1]).toEqual({
      role: "user",
      content: "drink water at eight",
    });
    // The milestone CAS still wrote the transcript.
    const milestone = ctx.runMutation.mock.calls.find(
      ([, a]: [unknown, any]) => a.patch?.status === "transcribed"
    )?.[1];
    expect(milestone.patch.transcript).toBe("drink water at eight");
    // And it reached commit.
    expect(commitOf(ctx)).toBeDefined();
  });

  it("carries device provenance and zeroed STT timings in the perf", async () => {
    const ctx = makeCtx(deviceJob());
    await handlerOf(run)(ctx, { jobId: "job_1", generation: 1, scheduledAt: 999_500 });

    const perf = commitOf(ctx)?.preCommitPerf;
    expect(perf.sttSource).toBe("device");
    expect(perf.sttModel).toBe("device");
    expect(perf.storageGetMs).toBe(0);
    expect(perf.blobMs).toBe(0);
    expect(perf.sttMs).toBe(0);
    expect(perf.whisperMs).toBe(0);
    expect(perf.sttFallbackUsed).toBe(false);
    expect(perf.deviceSttMs).toBe(120);
    expect(perf.deviceSttEngine).toBe("dictation");
    expect(perf.deviceSttLocale).toBe("en-US");
    // The parse timings are still present — only STT was skipped.
    expect(perf.parsePromptTokens).toBe(1200);
    // Cloud-only STT fields never appear.
    expect(perf.sttRequestedModel).toBeUndefined();
  });

  it("fails as internal if a device take somehow reaches the worker with no transcript", async () => {
    const ctx = makeCtx(deviceJob({ transcript: "   " }));
    await handlerOf(run)(ctx, { jobId: "job_1", generation: 1 });

    const fail = failOf(ctx);
    expect(fail).toBeDefined();
    expect(fail.patch.errorCode).toBe("internal");
    expect(mockCompletionsCreate).not.toHaveBeenCalled();
    expect(commitOf(ctx)).toBeUndefined();
  });
});

describe("an STT helper failure", () => {
  it("fails the job as stt_failed and never invokes the parse", async () => {
    // Both the primary and the fallback reject → SttError → stt_failed.
    mockTranscriptionCreate.mockReset().mockRejectedValue(new Error("stt down"));
    const ctx = makeCtx(makeJob());

    await handlerOf(run)(ctx, { jobId: "job_1", generation: 1, scheduledAt: 999_500 });

    const fail = failOf(ctx);
    expect(fail).toBeDefined();
    expect(fail.patch.errorCode).toBe("stt_failed");
    // The STT timings still reached the failure write.
    expect(fail.patch.perf.sttFallbackUsed).toBe(true);
    // Parse never ran, and nothing was committed.
    expect(mockCompletionsCreate).not.toHaveBeenCalled();
    expect(commitOf(ctx)).toBeUndefined();
  });
});

describe("the guard (OLD-130)", () => {
  const waterPlan = () =>
    (jest.requireMock("../../convex/actions") as any).planRemindersFromRawParse()[0];

  beforeEach(() => {
    mockPlanTake.mockReset();
    mockBuildSystemPrompt.mockClear();
  });

  it("without guard_v1: legacy prompt and planner, and a failure carries no detail", async () => {
    // The strict gate turns the take away, which a guard job would have named.
    const { validateCreationPlans } = jest.requireMock("../../convex/creationValidate");
    (validateCreationPlans as jest.Mock).mockReturnValueOnce({
      ok: false,
      index: 0,
      field: "onceAt",
      reason: "past",
    });
    const ctx = makeCtx(makeJob());
    await handlerOf(run)(ctx, { jobId: "job_1", generation: 1 });

    expect(mockBuildSystemPrompt.mock.calls[0][1]).toEqual({ guard: false });
    expect(mockPlanTake).not.toHaveBeenCalled();
    const fail = failOf(ctx);
    expect(Object.keys(fail.patch).sort()).toEqual(["errorCode", "perf", "status"]);
    expect(fail.patch.errorCode).toBe("unparseable");
  });

  it("without guard_v1: lang still reaches the commit", async () => {
    const ctx = makeCtx(makeJob());
    await handlerOf(run)(ctx, { jobId: "job_1", generation: 1 });
    expect(commitOf(ctx).plans[0].lang).toBe("en");
  });

  it("with guard_v1: the guard prompt, and an understood take commits", async () => {
    mockPlanTake.mockReturnValue({
      understood: true,
      language: "sv",
      plans: [{ ...waterPlan(), lang: "sv" }],
    });
    const ctx = makeCtx(makeJob({ clientFeatures: ["guard_v1"] }));
    await handlerOf(run)(ctx, { jobId: "job_1", generation: 1 });

    expect(mockBuildSystemPrompt.mock.calls[0][1]).toEqual({ guard: true });
    expect(failOf(ctx)).toBeUndefined();
    expect(commitOf(ctx).plans[0].lang).toBe("sv");
  });

  it("not_understood fails as unparseable with the detail and commits nothing", async () => {
    mockPlanTake.mockReturnValue({ understood: false, language: "en", plans: [] });
    const ctx = makeCtx(makeJob({ clientFeatures: ["guard_v1"] }));
    await handlerOf(run)(ctx, { jobId: "job_1", generation: 1 });

    const fail = failOf(ctx);
    expect(fail.patch).toMatchObject({
      status: "failed",
      errorCode: "unparseable",
      errorDetail: "not_understood",
    });
    expect(fail.patch).not.toHaveProperty("detectedLanguage");
    expect(commitOf(ctx)).toBeUndefined();
  });

  it("no_time for a one-off with no spoken time", async () => {
    mockPlanTake.mockReturnValue({
      understood: true,
      language: "en",
      plans: [{ ...waterPlan(), frequency: "once", timeSpoken: false }],
    });
    const ctx = makeCtx(makeJob({ clientFeatures: ["guard_v1"] }));
    await handlerOf(run)(ctx, { jobId: "job_1", generation: 1 });

    expect(failOf(ctx).patch).toMatchObject({ errorCode: "unparseable", errorDetail: "no_time" });
    expect(commitOf(ctx)).toBeUndefined();
  });

  it("no_time keeps what it heard: every plan held, the card's view of each", async () => {
    // "Call the dentist (no time), and take my pills every day at 8".
    mockPlanTake.mockReturnValue({
      understood: true,
      language: "sv",
      plans: [
        { ...waterPlan(), title: "Pills", lang: "en" },
        {
          ...waterPlan(),
          title: "Ring tandläkaren",
          description: "Dags att ringa tandläkaren.",
          emoji: "🦷",
          frequency: "once",
          timeSpoken: false,
          lang: "sv",
        },
      ],
    });
    const ctx = makeCtx(makeJob({ clientFeatures: ["guard_v1"] }));
    await handlerOf(run)(ctx, { jobId: "job_1", generation: 1 });

    const patch = failOf(ctx).patch;
    expect(patch.errorDetail).toBe("no_time");
    expect(patch.pendingPlans).toEqual([
      {
        title: "Pills",
        description: "Drink your water.",
        emoji: "💧",
        lang: "en",
        frequency: "daily",
        needsTime: false,
      },
      {
        title: "Ring tandläkaren",
        description: "Dags att ringa tandläkaren.",
        emoji: "🦷",
        lang: "sv",
        frequency: "once",
        needsTime: true,
      },
    ]);
    // The full plans, as commit would write them — the spoken line and its
    // language included, so the reminder made later speaks in Swedish.
    expect(patch.heldPlans).toHaveLength(2);
    expect(patch.heldPlans[1]).toMatchObject({
      title: "Ring tandläkaren",
      description: "Dags att ringa tandläkaren.",
      ttsText: "Dags att ringa tandläkaren.",
      lang: "sv",
    });
  });

  it("past_time keeps the plans too, with the time the user said", async () => {
    mockPlanTake.mockReturnValue({
      understood: true,
      language: "en",
      plans: [
        { ...waterPlan(), frequency: "once", time: "10:00", onceAt: NOW - 101 * 60_000, timeSpoken: true },
      ],
    });
    const ctx = makeCtx(makeJob({ clientFeatures: ["guard_v1"] }));
    await handlerOf(run)(ctx, { jobId: "job_1", generation: 1 });

    expect(failOf(ctx).patch.pendingPlans).toEqual([
      expect.objectContaining({ saidTime: "10:00", needsTime: true }),
    ]);
  });

  it("any other guard detail keeps nothing", async () => {
    mockPlanTake.mockReturnValue({ understood: false, language: "en", plans: [] });
    const ctx = makeCtx(makeJob({ clientFeatures: ["guard_v1"] }));
    await handlerOf(run)(ctx, { jobId: "job_1", generation: 1 });

    expect(failOf(ctx).patch).not.toHaveProperty("pendingPlans");
    expect(failOf(ctx).patch).not.toHaveProperty("heldPlans");
  });

  it("past_time for a one-off already behind the clock, with the spoken time", async () => {
    // "Today at 10", said at 11:41: a dated, timed one-off 101 minutes ago.
    mockPlanTake.mockReturnValue({
      understood: true,
      language: "ar",
      plans: [
        {
          ...waterPlan(),
          frequency: "once",
          time: "10:00",
          onceAt: NOW - 101 * 60_000,
          timeSpoken: true,
          lang: "ar",
        },
      ],
    });
    const ctx = makeCtx(makeJob({ clientFeatures: ["guard_v1"] }));
    await handlerOf(run)(ctx, { jobId: "job_1", generation: 1 });

    expect(failOf(ctx).patch).toMatchObject({
      status: "failed",
      errorCode: "unparseable",
      errorDetail: "past_time",
      pastTime: "10:00",
    });
    expect(commitOf(ctx)).toBeUndefined();
  });

  it("a one-off inside the grace window still commits", async () => {
    mockPlanTake.mockReturnValue({
      understood: true,
      language: "en",
      plans: [{ ...waterPlan(), frequency: "once", time: "10:00", onceAt: NOW - 60_000 }],
    });
    const ctx = makeCtx(makeJob({ clientFeatures: ["guard_v1"] }));
    await handlerOf(run)(ctx, { jobId: "job_1", generation: 1 });

    expect(failOf(ctx)).toBeUndefined();
    expect(commitOf(ctx)).toBeDefined();
  });

  it("without guard_v1 a past one-off is not asked about", async () => {
    // A 1.0 client's take never reaches the guard, so the strict gate alone
    // decides — exactly as before past_time existed.
    const actions = jest.requireMock("../../convex/actions") as any;
    const legacy = jest
      .spyOn(actions, "planRemindersFromRawParse")
      .mockReturnValueOnce([
        { ...waterPlan(), frequency: "once", time: "10:00", onceAt: NOW - 101 * 60_000 },
      ]);
    try {
      const ctx = makeCtx(makeJob());
      await handlerOf(run)(ctx, { jobId: "job_1", generation: 1 });

      expect(legacy).toHaveBeenCalled();
      expect(failOf(ctx)).toBeUndefined();
      expect(commitOf(ctx).plans[0].onceAt).toBe(NOW - 101 * 60_000);
    } finally {
      legacy.mockRestore();
    }
  });

  it("unsupported_language carries the detected language", async () => {
    mockPlanTake.mockReturnValue({
      understood: true,
      language: "xh",
      plans: [{ ...waterPlan(), lang: "xh" }],
    });
    const ctx = makeCtx(makeJob({ clientFeatures: ["guard_v1"] }));
    await handlerOf(run)(ctx, { jobId: "job_1", generation: 1 });

    expect(failOf(ctx).patch).toMatchObject({
      errorCode: "unparseable",
      errorDetail: "unsupported_language",
      detectedLanguage: "xh",
    });
  });

  it("a parse the guard planner cannot read is still parse_failed, with no detail", async () => {
    mockPlanTake.mockImplementation(() => {
      throw new Error("Parse response contained no reminder object");
    });
    const ctx = makeCtx(makeJob({ clientFeatures: ["guard_v1"] }));
    await handlerOf(run)(ctx, { jobId: "job_1", generation: 1 });

    const fail = failOf(ctx);
    expect(fail.patch.errorCode).toBe("parse_failed");
    expect(fail.patch).not.toHaveProperty("errorDetail");
  });
});

describe("guard log level", () => {
  const waterPlan = () =>
    (jest.requireMock("../../convex/actions") as any).planRemindersFromRawParse()[0];
  let errorSpy: jest.SpyInstance;
  let logSpy: jest.SpyInstance;

  beforeEach(() => {
    mockPlanTake.mockReset();
    errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
    logSpy = jest.spyOn(console, "log").mockImplementation(() => {});
    // An earlier suite may already have spied these; start from no calls.
    errorSpy.mockClear();
    logSpy.mockClear();
  });
  afterEach(() => {
    errorSpy.mockRestore();
    logSpy.mockRestore();
  });

  const guardLines = (spy: jest.SpyInstance) =>
    spy.mock.calls.map((c) => String(c[0])).filter((l) => l.includes("guard rejected"));

  it("a no_time take is held, so it logs at console.log, not console.error", async () => {
    mockPlanTake.mockReturnValue({
      understood: true,
      language: "en",
      plans: [{ ...waterPlan(), frequency: "once", timeSpoken: false }],
    });
    const ctx = makeCtx(makeJob({ clientFeatures: ["guard_v1"] }));
    await handlerOf(run)(ctx, { jobId: "job_1", generation: 1 });

    expect(guardLines(errorSpy)).toEqual([]);
    expect(guardLines(logSpy)).toEqual([expect.stringContaining("no_time")]);
  });

  it("a past_time take logs at console.log too", async () => {
    mockPlanTake.mockReturnValue({
      understood: true,
      language: "en",
      plans: [
        { ...waterPlan(), frequency: "once", time: "10:00", onceAt: NOW - 101 * 60_000, timeSpoken: true },
      ],
    });
    const ctx = makeCtx(makeJob({ clientFeatures: ["guard_v1"] }));
    await handlerOf(run)(ctx, { jobId: "job_1", generation: 1 });

    expect(guardLines(errorSpy)).toEqual([]);
    expect(guardLines(logSpy)).toEqual([expect.stringContaining("past_time")]);
  });

  it("a real rejection (not_understood) stays at console.error", async () => {
    mockPlanTake.mockReturnValue({ understood: false, language: "en", plans: [] });
    const ctx = makeCtx(makeJob({ clientFeatures: ["guard_v1"] }));
    await handlerOf(run)(ctx, { jobId: "job_1", generation: 1 });

    expect(guardLines(errorSpy)).toEqual([expect.stringContaining("not_understood")]);
    expect(guardLines(logSpy)).toEqual([]);
  });
});

describe("the locale retry", () => {
  const waterPlan = () =>
    (jest.requireMock("../../convex/actions") as any).planRemindersFromRawParse()[0];
  const ITALIAN_MISS = { understood: false, language: "it", plans: [] };
  const SPANISH_HIT = () => ({
    understood: true,
    language: "es",
    plans: [{ ...waterPlan(), title: "Pastilla", lang: "es" }],
  });
  const newSpanishPhone = (over: Record<string, unknown> = {}) =>
    makeJob({ clientFeatures: ["guard_v1"], deviceLocale: "es-US", ...over });
  const isSwap = (a: any) =>
    a.patch !== undefined && a.patch.transcript !== undefined && a.patch.status === undefined;
  const transcriptPatchOf = (ctx: any) =>
    ctx.runMutation.mock.calls.find(([, a]: [unknown, any]) => isSwap(a))?.[1];
  const sttLanguages = () => mockTranscriptionCreate.mock.calls.map(([req]) => req.language);

  beforeEach(() => {
    mockPlanTake.mockReset();
    mockTranscriptionCreate
      .mockReset()
      .mockResolvedValueOnce({ text: "Dolce de tomatopasilla." })
      .mockResolvedValueOnce({ text: "Dulce, de tomar tu pastilla" });
  });

  it("re-transcribes once in the locale language and commits the retry's take", async () => {
    mockPlanTake.mockReturnValueOnce(ITALIAN_MISS).mockReturnValueOnce(SPANISH_HIT());
    const ctx = makeCtx(newSpanishPhone());
    await handlerOf(run)(ctx, { jobId: "job_1", generation: 1 });

    // First attempt hintless, the retry hinted with the locale's language.
    expect(sttLanguages()).toEqual([undefined, "es"]);
    // The swap is CAS'd on "transcribed" at the same generation.
    expect(transcriptPatchOf(ctx)).toMatchObject({
      generation: 1,
      expectStatus: ["transcribed"],
      patch: { transcript: "Dulce, de tomar tu pastilla" },
    });
    expect(failOf(ctx)).toBeUndefined();
    const commit = commitOf(ctx);
    expect(commit.plans[0]).toMatchObject({ title: "Pastilla", lang: "es" });
    expect(commit.preCommitPerf).toMatchObject({
      sttLocaleRetry: true,
      sttLocaleRetryLang: "es",
      sttLocaleRetryUsed: true,
      sttLocaleRetryMs: 0,
      sttSource: "cloud",
    });
  });

  it("keeps the first failure when the retry does not help either", async () => {
    mockPlanTake
      .mockReturnValueOnce(ITALIAN_MISS)
      .mockReturnValueOnce({ understood: false, language: "es", plans: [] });
    mockCompletionsCreate
      .mockReset()
      .mockResolvedValueOnce({ choices: [{ message: { content: "FIRST" } }], usage: PARSE_USAGE })
      .mockResolvedValueOnce({ choices: [{ message: { content: "RETRY" } }], usage: PARSE_USAGE });
    const ctx = makeCtx(newSpanishPhone());
    await handlerOf(run)(ctx, { jobId: "job_1", generation: 1 });

    expect(mockTranscriptionCreate).toHaveBeenCalledTimes(2);
    expect(transcriptPatchOf(ctx)).toBeUndefined();
    expect(commitOf(ctx)).toBeUndefined();
    const fail = failOf(ctx);
    expect(fail.patch).toMatchObject({ errorCode: "unparseable", errorDetail: "not_understood" });
    expect(fail.patch.perf).toMatchObject({
      sttLocaleRetry: true,
      sttLocaleRetryLang: "es",
      sttLocaleRetryUsed: false,
    });
    // The failed-take record describes the first attempt.
    expect(fail.diagnostics).toEqual({ parseRaw: "FIRST" });
  });

  it("keeps the first failure when the retry's transcription fails", async () => {
    mockPlanTake.mockReturnValueOnce(ITALIAN_MISS);
    mockTranscriptionCreate
      .mockReset()
      .mockResolvedValueOnce({ text: "Dolce de tomatopasilla." })
      .mockRejectedValue(new Error("boom"));
    const ctx = makeCtx(newSpanishPhone());
    await handlerOf(run)(ctx, { jobId: "job_1", generation: 1 });

    expect(mockPlanTake).toHaveBeenCalledTimes(1);
    expect(failOf(ctx).patch).toMatchObject({
      errorCode: "unparseable",
      errorDetail: "not_understood",
    });
    expect(failOf(ctx).patch.perf.sttLocaleRetryUsed).toBe(false);
  });

  it("stops without committing when a retry or cancel wins the transcript swap", async () => {
    mockPlanTake.mockReturnValueOnce(ITALIAN_MISS).mockReturnValueOnce(SPANISH_HIT());
    const ctx = makeCtx(newSpanishPhone());
    const base = ctx.runMutation.getMockImplementation()!;
    ctx.runMutation.mockImplementation(async (ref: unknown, a: any) =>
      isSwap(a) ? { result: "stale" } : base(ref, a)
    );
    await handlerOf(run)(ctx, { jobId: "job_1", generation: 1 });

    expect(transcriptPatchOf(ctx)).toBeDefined();
    expect(commitOf(ctx)).toBeUndefined();
    expect(failOf(ctx)).toBeUndefined();
  });

  it("a retry that only lacks a time is used: the card asks when", async () => {
    mockPlanTake.mockReturnValueOnce(ITALIAN_MISS).mockReturnValueOnce({
      understood: true,
      language: "es",
      plans: [{ ...waterPlan(), lang: "es", frequency: "once", timeSpoken: false }],
    });
    const ctx = makeCtx(newSpanishPhone());
    await handlerOf(run)(ctx, { jobId: "job_1", generation: 1 });

    expect(transcriptPatchOf(ctx)).toBeDefined();
    expect(failOf(ctx).patch).toMatchObject({ errorDetail: "no_time" });
    expect(failOf(ctx).patch.pendingPlans).toHaveLength(1);
    expect(failOf(ctx).patch.perf.sttLocaleRetryUsed).toBe(true);
  });

  it("an unvoiceable detected language also earns the retry", async () => {
    mockPlanTake
      .mockReturnValueOnce({ understood: true, language: "ca", plans: [{ ...waterPlan(), lang: "ca" }] })
      .mockReturnValueOnce(SPANISH_HIT());
    const ctx = makeCtx(newSpanishPhone());
    await handlerOf(run)(ctx, { jobId: "job_1", generation: 1 });

    expect(sttLanguages()).toEqual([undefined, "es"]);
    expect(commitOf(ctx)).toBeDefined();
  });

  it.each([
    ["the job had a learned languageHint", { languageHint: "en" }],
    ["the device has no locale", { deviceLocale: undefined }],
    ["the locale's language is the one detected", { deviceLocale: "it-IT" }],
    ["the locale's language cannot be voiced", { deviceLocale: "zh-CN" }],
  ])("no retry when %s", async (_label, over) => {
    mockPlanTake.mockReturnValue(ITALIAN_MISS);
    const ctx = makeCtx(newSpanishPhone(over));
    await handlerOf(run)(ctx, { jobId: "job_1", generation: 1 });

    expect(mockTranscriptionCreate).toHaveBeenCalledTimes(1);
    expect(mockPlanTake).toHaveBeenCalledTimes(1);
    expect(failOf(ctx).patch.errorDetail).toBe("not_understood");
    expect(failOf(ctx).patch.perf).not.toHaveProperty("sttLocaleRetry");
  });

  it("no retry when the parse named no language", async () => {
    mockPlanTake.mockReturnValue({ understood: false, language: undefined, plans: [] });
    const ctx = makeCtx(newSpanishPhone());
    await handlerOf(run)(ctx, { jobId: "job_1", generation: 1 });
    expect(mockTranscriptionCreate).toHaveBeenCalledTimes(1);
  });

  it("no retry for a take held for a time", async () => {
    mockPlanTake.mockReturnValue({
      understood: true,
      language: "en",
      plans: [{ ...waterPlan(), frequency: "once", timeSpoken: false }],
    });
    const ctx = makeCtx(newSpanishPhone());
    await handlerOf(run)(ctx, { jobId: "job_1", generation: 1 });
    expect(mockTranscriptionCreate).toHaveBeenCalledTimes(1);
    expect(failOf(ctx).patch.errorDetail).toBe("no_time");
  });

  it("no retry for a device take (there is no recording)", async () => {
    mockPlanTake.mockReturnValue(ITALIAN_MISS);
    const ctx = makeCtx(
      newSpanishPhone({ sttSource: "device", audioStorageId: undefined, transcript: "dolce" })
    );
    await handlerOf(run)(ctx, { jobId: "job_1", generation: 1 });
    expect(mockTranscriptionCreate).not.toHaveBeenCalled();
    expect(mockPlanTake).toHaveBeenCalledTimes(1);
  });

  it("without guard_v1, a gate rejection with a foreign plan language retries too", async () => {
    const { validateCreationPlans } = jest.requireMock("../../convex/creationValidate");
    (validateCreationPlans as jest.Mock).mockReturnValueOnce({
      ok: false,
      index: 0,
      field: "time",
      reason: "bad",
    });
    const actions = jest.requireMock("../../convex/actions") as any;
    const legacy = jest
      .spyOn(actions, "planRemindersFromRawParse")
      .mockReturnValueOnce([{ ...waterPlan(), lang: "it" }]);
    try {
      const ctx = makeCtx(makeJob({ deviceLocale: "es-US" }));
      await handlerOf(run)(ctx, { jobId: "job_1", generation: 1 });
      expect(sttLanguages()).toEqual([undefined, "es"]);
      expect(commitOf(ctx)).toBeDefined();
      expect(commitOf(ctx).preCommitPerf.sttLocaleRetryUsed).toBe(true);
    } finally {
      legacy.mockRestore();
    }
  });
});
