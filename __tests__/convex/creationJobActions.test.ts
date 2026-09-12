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

// The parse planner and the prompt builder have their own tests; here they are
// stubbed so the worker sees one valid plan without a real model call. The plan
// lives inside the factory because jest.mock is hoisted above the module body.
jest.mock("../../convex/actions", () => ({
  __esModule: true,
  buildSystemPrompt: () => "SYSTEM PROMPT",
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
