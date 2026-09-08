/**
 * The STT helper (spec §1, §2, §4).
 *
 * Every path is exercised against a mocked OpenAI SDK constructor and
 * transcription method — the same multipart client the real code uses, pointed
 * at OpenRouter — so nothing here touches the network. What is pinned: model
 * resolution, the OpenRouter client configuration, the multipart request shape,
 * the one-shot fallback, and the perf/usage the helper reports.
 */

const mockCreate = jest.fn();
const mockCtor = jest.fn();

jest.mock("openai", () => ({
  __esModule: true,
  default: class MockOpenAI {
    audio = { transcriptions: { create: (...args: unknown[]) => mockCreate(...args) } };
    constructor(options: unknown) {
      mockCtor(options);
    }
  },
}));

import {
  transcribeAudio,
  SttError,
  DEFAULT_STT_MODEL,
  FALLBACK_STT_MODEL,
} from "../../convex/stt";

const file = () => new File([new Uint8Array([1, 2, 3])], "recording.m4a", { type: "audio/mp4" });

beforeEach(() => {
  mockCreate.mockReset();
  mockCtor.mockReset();
  process.env.OPENROUTER_API_KEY = "test-openrouter-key";
  delete process.env.STT_MODEL;
});

afterEach(() => {
  delete process.env.STT_MODEL;
});

// ─── model resolution ───────────────────────────────────────────────────────

describe("model resolution", () => {
  it("defaults to gpt-4o-mini-transcribe with no option and no env", async () => {
    mockCreate.mockResolvedValue({ text: "hello" });
    await transcribeAudio(file());
    expect(mockCreate.mock.calls[0][0].model).toBe(DEFAULT_STT_MODEL);
    expect(DEFAULT_STT_MODEL).toBe("openai/gpt-4o-mini-transcribe");
  });

  it("uses STT_MODEL when set", async () => {
    process.env.STT_MODEL = "openai/some-other-model";
    mockCreate.mockResolvedValue({ text: "hello" });
    const { perf } = await transcribeAudio(file());
    expect(mockCreate.mock.calls[0][0].model).toBe("openai/some-other-model");
    expect(perf.sttRequestedModel).toBe("openai/some-other-model");
  });

  it("lets an explicit option win over the env", async () => {
    process.env.STT_MODEL = "openai/env-model";
    mockCreate.mockResolvedValue({ text: "hello" });
    await transcribeAudio(file(), { model: "openai/option-model" });
    expect(mockCreate.mock.calls[0][0].model).toBe("openai/option-model");
  });

  it("falls through an empty option to the env", async () => {
    process.env.STT_MODEL = "openai/env-model";
    mockCreate.mockResolvedValue({ text: "hello" });
    await transcribeAudio(file(), { model: "   " });
    expect(mockCreate.mock.calls[0][0].model).toBe("openai/env-model");
  });

  it("falls through an empty env to the default", async () => {
    process.env.STT_MODEL = "   ";
    mockCreate.mockResolvedValue({ text: "hello" });
    await transcribeAudio(file());
    expect(mockCreate.mock.calls[0][0].model).toBe(DEFAULT_STT_MODEL);
  });
});

// ─── client + request shape ─────────────────────────────────────────────────

describe("the OpenRouter request", () => {
  it("configures the client for OpenRouter with retries off and a 15s timeout", async () => {
    mockCreate.mockResolvedValue({ text: "hello" });
    await transcribeAudio(file());
    expect(mockCtor).toHaveBeenCalledWith({
      apiKey: "test-openrouter-key",
      baseURL: "https://openrouter.ai/api/v1",
      maxRetries: 0,
      timeout: 15000,
    });
  });

  it("sends a multipart file with response_format json and no language or prompt", async () => {
    mockCreate.mockResolvedValue({ text: "hello" });
    const f = file();
    await transcribeAudio(f);
    const call = mockCreate.mock.calls[0][0];
    expect(call.file).toBe(f);
    expect(call.model).toBe(DEFAULT_STT_MODEL);
    expect(call.response_format).toBe("json");
    expect(call).not.toHaveProperty("language");
    expect(call).not.toHaveProperty("prompt");
    expect(call).not.toHaveProperty("temperature");
  });

  it("passes an existing File unchanged and wraps a plain Blob", async () => {
    mockCreate.mockResolvedValue({ text: "hello" });

    const f = file();
    await transcribeAudio(f);
    expect(mockCreate.mock.calls[0][0].file).toBe(f);

    mockCreate.mockClear();
    const blob = new Blob([new Uint8Array([9, 9, 9])], { type: "audio/mp4" });
    await transcribeAudio(blob);
    const wrapped = mockCreate.mock.calls[0][0].file;
    expect(wrapped).toBeInstanceOf(File);
    expect(wrapped.name).toBe("recording.m4a");
  });
});

// ─── success + usage ────────────────────────────────────────────────────────

describe("a successful primary transcription", () => {
  it("returns the trimmed text and a fallback-free perf", async () => {
    mockCreate.mockResolvedValue({ text: "  drink water  " });
    const { text, perf } = await transcribeAudio(file());

    expect(text).toBe("drink water");
    expect(mockCreate).toHaveBeenCalledTimes(1);
    expect(perf.sttRequestedModel).toBe(DEFAULT_STT_MODEL);
    expect(perf.sttModel).toBe(DEFAULT_STT_MODEL);
    expect(perf.sttFallbackUsed).toBe(false);
    expect(perf.sttFallbackMs).toBeUndefined();
    expect(typeof perf.sttMs).toBe("number");
    expect(typeof perf.sttPrimaryMs).toBe("number");
  });

  it("omits usage fields when none are reported", async () => {
    mockCreate.mockResolvedValue({ text: "hello" });
    const { perf } = await transcribeAudio(file());
    expect(perf.sttInputTokens).toBeUndefined();
    expect(perf.sttOutputTokens).toBeUndefined();
    expect(perf.sttAudioSeconds).toBeUndefined();
    expect(perf.sttCostUsd).toBeUndefined();
  });

  it("preserves reported zero usage values", async () => {
    mockCreate.mockResolvedValue({
      text: "hello",
      usage: { input_tokens: 0, output_tokens: 0, seconds: 0, cost: 0 },
    });
    const { perf } = await transcribeAudio(file());
    expect(perf.sttInputTokens).toBe(0);
    expect(perf.sttOutputTokens).toBe(0);
    expect(perf.sttAudioSeconds).toBe(0);
    expect(perf.sttCostUsd).toBe(0);
  });

  it("keeps present usage numbers and drops absent, non-numeric or non-finite ones", async () => {
    mockCreate.mockResolvedValue({
      text: "hello",
      usage: { input_tokens: 320, output_tokens: "x", seconds: NaN },
    });
    const { perf } = await transcribeAudio(file());
    expect(perf.sttInputTokens).toBe(320);
    expect(perf.sttOutputTokens).toBeUndefined();
    expect(perf.sttAudioSeconds).toBeUndefined();
    expect(perf.sttCostUsd).toBeUndefined();
  });

  it("records a usage object that omits input tokens", async () => {
    mockCreate.mockResolvedValue({ text: "hello", usage: { output_tokens: 7 } });
    const { perf } = await transcribeAudio(file());
    expect(perf.sttInputTokens).toBeUndefined();
    expect(perf.sttOutputTokens).toBe(7);
  });

  it("keeps real usage numbers and ignores a non-object usage", async () => {
    mockCreate.mockResolvedValueOnce({
      text: "hello",
      usage: { input_tokens: 320, output_tokens: 12, seconds: 4.2, cost: 0.0007 },
    });
    const first = await transcribeAudio(file());
    expect(first.perf.sttInputTokens).toBe(320);
    expect(first.perf.sttAudioSeconds).toBe(4.2);
    expect(first.perf.sttCostUsd).toBeCloseTo(0.0007);

    mockCreate.mockResolvedValueOnce({ text: "hello", usage: 5 });
    const second = await transcribeAudio(file());
    expect(second.perf.sttInputTokens).toBeUndefined();
  });
});

// ─── fallback ───────────────────────────────────────────────────────────────

describe("the one-shot fallback", () => {
  it("falls back to whisper-1 once when the primary rejects", async () => {
    mockCreate
      .mockRejectedValueOnce(new Error("primary down"))
      .mockResolvedValueOnce({ text: "recovered" });

    const { text, perf } = await transcribeAudio(file());

    expect(text).toBe("recovered");
    expect(mockCreate).toHaveBeenCalledTimes(2);
    expect(mockCreate.mock.calls[1][0].model).toBe(FALLBACK_STT_MODEL);
    expect(perf.sttFallbackUsed).toBe(true);
    expect(perf.sttModel).toBe(FALLBACK_STT_MODEL);
    expect(perf.sttRequestedModel).toBe(DEFAULT_STT_MODEL);
    expect(typeof perf.sttFallbackMs).toBe("number");
  });

  it("rejects a non-object response and falls back", async () => {
    mockCreate.mockResolvedValueOnce(null).mockResolvedValueOnce({ text: "ok" });
    const { text } = await transcribeAudio(file());
    expect(text).toBe("ok");
    expect(mockCreate).toHaveBeenCalledTimes(2);
  });

  it("rejects a response whose text is not a string and falls back", async () => {
    mockCreate.mockResolvedValueOnce({ text: 123 }).mockResolvedValueOnce({ text: "ok2" });
    const { text } = await transcribeAudio(file());
    expect(text).toBe("ok2");
  });

  it("treats an empty primary transcript as a failure and falls back", async () => {
    mockCreate
      .mockResolvedValueOnce({ text: "   " })
      .mockResolvedValueOnce({ text: "real" });

    const { text, perf } = await transcribeAudio(file());
    expect(text).toBe("real");
    expect(perf.sttFallbackUsed).toBe(true);
  });

  it("tolerates a thrown non-Error on the primary", async () => {
    mockCreate.mockRejectedValueOnce("string failure").mockResolvedValueOnce({ text: "ok" });
    const { text } = await transcribeAudio(file());
    expect(text).toBe("ok");
  });

  it("does not repeat the request when the primary already is whisper-1", async () => {
    mockCreate.mockRejectedValue(new Error("down"));
    await expect(transcribeAudio(file(), { model: FALLBACK_STT_MODEL })).rejects.toBeInstanceOf(
      SttError
    );
    expect(mockCreate).toHaveBeenCalledTimes(1);
  });

  it("carries perf on the SttError when both attempts fail", async () => {
    mockCreate.mockRejectedValue(new Error("all down"));
    let thrown: unknown;
    try {
      await transcribeAudio(file());
    } catch (e) {
      thrown = e;
    }
    expect(thrown).toBeInstanceOf(SttError);
    const perf = (thrown as SttError).perf;
    expect(perf.sttFallbackUsed).toBe(true);
    expect(perf.sttModel).toBe(FALLBACK_STT_MODEL);
    expect(typeof perf.sttMs).toBe("number");
  });

  it("tolerates a thrown non-Error on the fallback too", async () => {
    mockCreate
      .mockRejectedValueOnce(new Error("primary down"))
      .mockRejectedValueOnce("string failure on fallback");
    await expect(transcribeAudio(file())).rejects.toBeInstanceOf(SttError);
    expect(mockCreate).toHaveBeenCalledTimes(2);
  });

  it("treats an empty fallback transcript as terminal failure", async () => {
    mockCreate.mockResolvedValueOnce({ text: "" }).mockResolvedValueOnce({ text: "  " });
    await expect(transcribeAudio(file())).rejects.toBeInstanceOf(SttError);
    expect(mockCreate).toHaveBeenCalledTimes(2);
  });
});

// ─── missing key ────────────────────────────────────────────────────────────

describe("a missing OpenRouter key", () => {
  it("fails immediately without building a client or making a request", async () => {
    delete process.env.OPENROUTER_API_KEY;
    let thrown: unknown;
    try {
      await transcribeAudio(file());
    } catch (e) {
      thrown = e;
    }
    expect(thrown).toBeInstanceOf(SttError);
    expect(mockCtor).not.toHaveBeenCalled();
    expect(mockCreate).not.toHaveBeenCalled();
  });
});
