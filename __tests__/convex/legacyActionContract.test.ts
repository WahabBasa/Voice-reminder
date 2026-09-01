/**
 * Golden contract for the three legacy creation actions (spec 4, step 0).
 *
 * `processVoiceReminderFast`, `processVoiceReminder` and `processTypedReminder`
 * are what every already-installed build calls. The creation-job pipeline is
 * additive precisely so that they do not have to change, and this suite is the
 * proof: it pins their argument validators byte-for-byte and executes each
 * handler against mocked providers to pin the exact result shape the app reads.
 *
 * If a change to convex/actions.ts breaks anything here, it is a change an
 * old build would feel — which, until those actions are retired in a later
 * wave, means it is a change that must not ship.
 */

const mockTranscriptionCreate = jest.fn();
const mockCompletionsCreate = jest.fn();
const mockOpenAiOptions = jest.fn();

jest.mock("openai", () => ({
  __esModule: true,
  default: class MockOpenAI {
    audio = { transcriptions: { create: (...args: unknown[]) => mockTranscriptionCreate(...args) } };
    chat = { completions: { create: (...args: unknown[]) => mockCompletionsCreate(...args) } };
    constructor(options: unknown) {
      mockOpenAiOptions(options);
    }
  },
}));

import {
  processTypedReminder,
  processVoiceReminder,
  processVoiceReminderFast,
} from "../../convex/actions";

type Handler = (ctx: any, args: any) => Promise<any>;
const handlerOf = (fn: unknown): Handler => (fn as { _handler: Handler })._handler;
const argsOf = (fn: unknown) =>
  JSON.parse((fn as { exportArgs: () => string }).exportArgs());

const TRANSCRIPT = "water at eight and pills monday at nine";

const PARSE_RESPONSE = JSON.stringify({
  reminders: [
    {
      title: "Water",
      description: "Drink your water.",
      time: "20:00",
      frequency: "daily",
      emoji: "💧",
      preReminderMinutes: 10,
      preDescription: "Your water is coming up.",
    },
    { title: "Pills", description: "Take your pills.", time: "21:00", frequency: "custom", days: ["mon"] },
  ],
});

const CLOCK = {
  deviceLocalDate: "2026-09-01",
  deviceLocalTime: "10:00:00",
  deviceTimezone: "Asia/Dubai",
};

/** Every field one created reminder carries back to the app. */
const CREATED_FIELDS = [
  "anchorAt",
  "date",
  "days",
  "description",
  "dtstart",
  "emoji",
  "frequency",
  "id",
  "intervalDays",
  "intervalMs",
  "onceAt",
  "parseWarnings",
  "persistent",
  "preReminderMinutes",
  "rrule",
  "schedule",
  "scheduleType",
  "time",
  "times",
  "title",
  "transcript",
  "until",
  "urgency",
];

/** The deferred-audio paths add the pending audio marker. */
const FAST_ITEM_FIELDS = [...CREATED_FIELDS, "audioStatus"].sort();
/** The slow path has the audio already, so it hands back urls instead. */
const SLOW_ITEM_FIELDS = [...CREATED_FIELDS, "audioUrl", "preAudioUrl"].sort();

const withTakeEnvelope = (itemFields: string[], extra: string[]) =>
  [...itemFields, "reminderCount", "reminders", ...extra].sort();

beforeEach(() => {
  mockOpenAiOptions.mockReset();
  mockTranscriptionCreate.mockReset().mockResolvedValue({ text: TRANSCRIPT });
  mockCompletionsCreate
    .mockReset()
    .mockResolvedValue({ choices: [{ message: { content: PARSE_RESPONSE } }] });

  // Pin the TTS provider so the slow path is deterministic wherever this runs.
  process.env.TTS_PROVIDER = "resemble";
  process.env.RESEMBLE_API_KEY = "test-key";
  process.env.RESEMBLE_PROJECT_UUID = "test-project";
  process.env.RESEMBLE_VOICE_UUID = "test-voice";
  (global as any).fetch = jest.fn(async () => ({
    ok: true,
    json: async () => ({ success: true, audio_content: Buffer.from("mp3").toString("base64") }),
    text: async () => "",
  }));
});

function fastCtx() {
  return {
    storage: { get: jest.fn(async () => new Blob([new Uint8Array([1, 2, 3])])) },
    runMutation: jest.fn(async (..._args: unknown[]) => "reminder_1"),
    scheduler: { runAfter: jest.fn(async (..._args: unknown[]) => undefined) },
  };
}

// ─── Arguments ──────────────────────────────────────────────────────────────

describe("argument validators", () => {
  const optionalString = { fieldType: { type: "string" }, optional: true };
  const requiredString = { fieldType: { type: "string" }, optional: false };
  const clockArgs = {
    traceId: optionalString,
    deviceLocalDate: optionalString,
    deviceLocalTime: optionalString,
    deviceTimezone: optionalString,
  };

  it("processVoiceReminderFast takes a storage id", () => {
    expect(argsOf(processVoiceReminderFast)).toEqual({
      type: "object",
      value: {
        deviceId: requiredString,
        audioStorageId: {
          fieldType: { type: "id", tableName: "_storage" },
          optional: false,
        },
        ...clockArgs,
      },
    });
  });

  it("processVoiceReminder takes base64 audio", () => {
    expect(argsOf(processVoiceReminder)).toEqual({
      type: "object",
      value: { deviceId: requiredString, audioBase64: requiredString, ...clockArgs },
    });
  });

  it("processTypedReminder takes the typed sentence", () => {
    expect(argsOf(processTypedReminder)).toEqual({
      type: "object",
      value: { deviceId: requiredString, text: requiredString, ...clockArgs },
    });
  });
});

// ─── processVoiceReminderFast ───────────────────────────────────────────────

describe("processVoiceReminderFast", () => {
  async function run() {
    const ctx = fastCtx();
    const result = await handlerOf(processVoiceReminderFast)(ctx, {
      deviceId: "device_a",
      audioStorageId: "storage_1",
      ...CLOCK,
    });
    return { ctx, result };
  }

  it("returns the whole take with the first reminder's fields at the top level", async () => {
    const { result } = await run();

    expect(Object.keys(result).sort()).toEqual(withTakeEnvelope(FAST_ITEM_FIELDS, ["perf"]));
    expect(result.reminderCount).toBe(2);
    expect(Object.keys(result.reminders[0]).sort()).toEqual(FAST_ITEM_FIELDS);
    expect(result.id).toBe(result.reminders[0].id);
    expect(result.title).toBe("Water");
    expect(result.transcript).toBe(TRANSCRIPT);
    expect(result.audioStatus).toBe("pending");
  });

  it("reports its own stage timings", async () => {
    const { result } = await run();
    expect(Object.keys(result.perf).sort()).toEqual([
      "actionMs",
      "blobMs",
      "gptMs",
      "mutationMs",
      "scheduleMs",
      "storageCleanupScheduleMs",
      "whisperMs",
    ]);
  });

  it("still transcribes with whisper-1 and parses with gpt-5.6-luna", async () => {
    await run();

    expect(mockTranscriptionCreate).toHaveBeenCalledTimes(1);
    expect(mockTranscriptionCreate.mock.calls[0][0]).toMatchObject({ model: "whisper-1" });

    expect(mockCompletionsCreate).toHaveBeenCalledTimes(1);
    const parse = mockCompletionsCreate.mock.calls[0][0];
    expect(parse).toMatchObject({
      model: "openai/gpt-5.6-luna",
      response_format: { type: "json_object" },
      reasoning_effort: "none",
      max_tokens: 2000,
    });
    expect(parse.messages[1]).toEqual({ role: "user", content: TRANSCRIPT });
    // The volatile clock sits at the very end of the prompt, for caching.
    expect(parse.messages[0].content).toContain("Current date: 2026-09-01");
    expect(parse.messages[0].content).toContain("User's timezone: Asia/Dubai");
  });

  it("inserts each row with audio deferred and enqueues its TTS job", async () => {
    const { ctx } = await run();

    expect(ctx.runMutation).toHaveBeenCalledTimes(2);
    const firstRow = ctx.runMutation.mock.calls[0][1] as Record<string, unknown>;
    expect(firstRow).toMatchObject({
      deviceId: "device_a",
      title: "Water",
      description: "Drink your water.",
      audioStorageId: undefined,
      audioStatus: "pending",
      audioExtrasStatus: "pending",
      preReminderMinutes: 10,
    });
    expect(Object.keys(firstRow).sort()).toEqual(
      [
        "anchorAt",
        "audioExtrasStatus",
        "audioStatus",
        "audioStorageId",
        "audioUpdatedAt",
        "date",
        "days",
        "description",
        "deviceId",
        "dtstart",
        "emoji",
        "frequency",
        "intervalDays",
        "intervalMs",
        "onceAt",
        "parseWarnings",
        "persistent",
        "preReminderMinutes",
        "rrule",
        "schedule",
        "scheduleType",
        "time",
        "title",
        "tzid",
        "until",
        "urgency",
      ].sort()
    );

    const scheduled = ctx.scheduler.runAfter.mock.calls;
    // Two TTS jobs, then the recording cleanup.
    expect(scheduled).toHaveLength(3);
    expect(scheduled[0][2]).toMatchObject({
      reminderId: "reminder_1",
      title: "Water",
      ttsText: "Drink your water.",
      preTtsText: "Your water is coming up.",
    });
    expect(scheduled[2][2]).toEqual({ storageId: "storage_1" });
  });

  it("hands the recording to a cleanup job even when the parse throws", async () => {
    mockCompletionsCreate.mockRejectedValueOnce(new Error("parse exploded"));
    const ctx = fastCtx();

    await expect(
      handlerOf(processVoiceReminderFast)(ctx, {
        deviceId: "device_a",
        audioStorageId: "storage_1",
        ...CLOCK,
      })
    ).rejects.toThrow("parse exploded");

    expect(ctx.scheduler.runAfter).toHaveBeenCalledTimes(1);
    expect(ctx.scheduler.runAfter.mock.calls[0][2]).toEqual({ storageId: "storage_1" });
  });

  it("throws when the recording is not in storage", async () => {
    const ctx = fastCtx();
    ctx.storage.get.mockResolvedValueOnce(null as never);

    await expect(
      handlerOf(processVoiceReminderFast)(ctx, {
        deviceId: "device_a",
        audioStorageId: "storage_1",
        ...CLOCK,
      })
    ).rejects.toThrow("Audio not found in storage");
  });
});

// ─── processTypedReminder ───────────────────────────────────────────────────

describe("processTypedReminder", () => {
  async function run(text = "water at eight") {
    const ctx = {
      runMutation: jest.fn(async (..._args: unknown[]) => "reminder_1"),
      scheduler: { runAfter: jest.fn(async (..._args: unknown[]) => undefined) },
    };
    const result = await handlerOf(processTypedReminder)(ctx, {
      deviceId: "device_a",
      text,
      ...CLOCK,
    });
    return { ctx, result };
  }

  it("returns the fast path's shape so the app cannot tell them apart", async () => {
    const { result } = await run();

    expect(Object.keys(result).sort()).toEqual(withTakeEnvelope(FAST_ITEM_FIELDS, ["perf"]));
    expect(Object.keys(result.reminders[0]).sort()).toEqual(FAST_ITEM_FIELDS);
    expect(result.reminderCount).toBe(2);
    // The sentence IS the transcript.
    expect(result.transcript).toBe("water at eight");
  });

  it("skips STT entirely and reports only the stages it ran", async () => {
    const { result } = await run();
    expect(mockTranscriptionCreate).not.toHaveBeenCalled();
    expect(Object.keys(result.perf).sort()).toEqual([
      "actionMs",
      "gptMs",
      "mutationMs",
      "scheduleMs",
    ]);
  });

  it("schedules one TTS job per reminder and no recording cleanup", async () => {
    const { ctx } = await run();
    expect(ctx.scheduler.runAfter).toHaveBeenCalledTimes(2);
  });

  it("refuses an empty sentence", async () => {
    await expect(run("   ")).rejects.toThrow("Nothing to parse");
  });
});

// ─── processVoiceReminder (base64, audio synthesized inline) ────────────────

describe("processVoiceReminder", () => {
  async function run() {
    const ctx = {
      storage: {
        store: jest.fn(async (..._args: unknown[]) => "stored_1"),
        getUrl: jest.fn(async (id: string) => `https://cdn.example/${id}`),
      },
      runMutation: jest.fn(async (..._args: unknown[]) => "reminder_1"),
    };
    const result = await handlerOf(processVoiceReminder)(ctx, {
      deviceId: "device_a",
      audioBase64: Buffer.from("audio").toString("base64"),
      ...CLOCK,
    });
    return { ctx, result };
  }

  it("returns the take with resolved audio urls and no perf block", async () => {
    const { result } = await run();

    expect(Object.keys(result).sort()).toEqual(withTakeEnvelope(SLOW_ITEM_FIELDS, []));
    expect(Object.keys(result.reminders[0]).sort()).toEqual(SLOW_ITEM_FIELDS);
    expect(result.reminderCount).toBe(2);
    expect(result.audioUrl).toBe("https://cdn.example/stored_1");
  });

  it("stores the audio before the row exists, so nothing is ever pending", async () => {
    const { ctx } = await run();

    expect(ctx.storage.store).toHaveBeenCalled();
    const firstRow = ctx.runMutation.mock.calls[0][1] as Record<string, unknown>;
    expect(firstRow).toMatchObject({ audioStorageId: "stored_1", deviceId: "device_a" });
    expect(firstRow.audioStatus).toBeUndefined();
  });

  it("uses the same prompt as the fast path", async () => {
    await run();
    expect(mockCompletionsCreate.mock.calls[0][0]).toMatchObject({
      model: "openai/gpt-5.6-luna",
      reasoning_effort: "none",
      max_tokens: 2000,
    });
  });
});
