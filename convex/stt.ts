"use node";

/**
 * Speech-to-text, over OpenRouter's multipart transcription endpoint.
 *
 * One entry point — `transcribeAudio` — shared by the creation-job worker
 * (convex/creationJobActions.ts) and the two legacy voice actions
 * (convex/actions.ts). It replaces the old direct `whisper-1` call on the
 * OpenAI key with `openai/gpt-4o-mini-transcribe` on the OpenRouter key, and
 * on any failure of that primary makes exactly one fallback attempt against
 * `openai/whisper-1` through the same client. One key (`OPENROUTER_API_KEY`)
 * now covers STT and the parse call alike; `OPENAI_API_KEY` is never read here.
 *
 * `"use node"` because the OpenAI SDK's multipart upload wants the Node
 * runtime, exactly like its two callers. The module registers no Convex
 * functions — it is a helper the node actions import — so it stays out of the
 * default runtime's bundle and rides in the node one with them.
 *
 * Network code deliberately lives here rather than in the pure convex/helpers.ts
 * (spec §1): helpers.ts is the 100%-covered, side-effect-free island.
 */

import OpenAI from "openai";

/** OpenRouter slug for the primary model. */
export const DEFAULT_STT_MODEL = "openai/gpt-4o-mini-transcribe";
/** OpenRouter slug for the one-shot fallback. */
export const FALLBACK_STT_MODEL = "openai/whisper-1";

/** OpenRouter's multipart endpoint. Same base URL the parse call uses. */
const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";
/** SDK retries off — the fallback is our retry, and it is a different model. */
const STT_MAX_RETRIES = 0;
/** A take that has not transcribed in fifteen seconds has failed for the user. */
const STT_TIMEOUT_MS = 15_000;

/**
 * Every STT timing and usage number one call produced. The model fields and the
 * three always-known timings are required; usage is provider-reported and
 * absent unless the successful response carried it.
 */
export type SttPerf = {
  /** Resolved primary model (option → env → default). */
  sttRequestedModel: string;
  /** Successful model; the last model attempted on terminal failure. */
  sttModel: string;
  /** First request start through the final outcome, fallback included. */
  sttMs: number;
  /** Primary request through its transcript validation. */
  sttPrimaryMs: number;
  /** Fallback request through its transcript validation, when one ran. */
  sttFallbackMs?: number;
  /** Whether the fallback was attempted. */
  sttFallbackUsed: boolean;
  /** Successful response's `usage.input_tokens`, if reported. */
  sttInputTokens?: number;
  /** Successful response's `usage.output_tokens`, if reported. */
  sttOutputTokens?: number;
  /** Successful response's `usage.seconds`, if reported. */
  sttAudioSeconds?: number;
  /** Successful response's `usage.cost`, if reported. */
  sttCostUsd?: number;
};

/**
 * Terminal transcription failure, carrying whatever `perf` had accumulated by
 * the time both attempts were exhausted. Callers must merge `perf` so a failed
 * take still reports how long its STT cost.
 */
export class SttError extends Error {
  readonly perf: SttPerf;
  constructor(message: string, perf: SttPerf) {
    super(message);
    this.name = "SttError";
    this.perf = perf;
  }
}

/**
 * Model resolution: trimmed option, then trimmed `STT_MODEL`, then the default.
 * Empty or whitespace-only strings fall through rather than becoming the model.
 */
function resolveModel(optionModel?: string): string {
  const fromOption = optionModel?.trim();
  if (fromOption) return fromOption;
  const fromEnv = process.env.STT_MODEL?.trim();
  if (fromEnv) return fromEnv;
  return DEFAULT_STT_MODEL;
}

/** Pass an existing File unchanged; wrap a plain Blob as the recording. */
function asFile(input: Blob | File): File {
  if (input instanceof File) return input;
  return new File([input], "recording.m4a", { type: "audio/mp4" });
}

/** A number only if it is really one and finite; preserves a reported 0. */
function finiteNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

/**
 * OpenRouter reports STT usage in a shape the SDK's OpenAI usage type does not
 * describe, so it is read through this narrow runtime check. Absent values are
 * omitted; a reported zero is kept.
 */
function applyUsage(perf: SttPerf, usage: unknown): void {
  if (!usage || typeof usage !== "object") return;
  const u = usage as {
    input_tokens?: unknown;
    output_tokens?: unknown;
    seconds?: unknown;
    cost?: unknown;
  };
  const input = finiteNumber(u.input_tokens);
  if (input !== undefined) perf.sttInputTokens = input;
  const output = finiteNumber(u.output_tokens);
  if (output !== undefined) perf.sttOutputTokens = output;
  const seconds = finiteNumber(u.seconds);
  if (seconds !== undefined) perf.sttAudioSeconds = seconds;
  const cost = finiteNumber(u.cost);
  if (cost !== undefined) perf.sttCostUsd = cost;
}

/** A trimmed nonempty string `text`, or null for a malformed/empty transcript. */
function validTranscript(response: unknown): string | null {
  if (response && typeof response === "object") {
    const text = (response as { text?: unknown }).text;
    if (typeof text === "string") {
      const trimmed = text.trim();
      if (trimmed.length > 0) return trimmed;
    }
  }
  return null;
}

/**
 * Transcribe one recording. Returns the trimmed transcript and the timings; on
 * terminal failure throws {@link SttError} with the accumulated perf.
 *
 * The model is resolved once (option → `STT_MODEL` → default). The SDK client
 * is built inside the call, after the key check, so a missing key fails without
 * a request. A failure of the primary — rejection, timeout, malformed body or
 * empty transcript — triggers one fallback to `openai/whisper-1`, unless the
 * primary already was whisper-1, in which case there is no second attempt.
 */
export async function transcribeAudio(
  input: Blob | File,
  options?: { model?: string }
): Promise<{ text: string; perf: SttPerf }> {
  const requestedModel = resolveModel(options?.model);
  const perf: SttPerf = {
    sttRequestedModel: requestedModel,
    sttModel: requestedModel,
    sttMs: 0,
    sttPrimaryMs: 0,
    sttFallbackUsed: false,
  };

  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new SttError("OPENROUTER_API_KEY is not set", perf);
  }

  const file = asFile(input);
  const client = new OpenAI({
    apiKey,
    baseURL: OPENROUTER_BASE_URL,
    maxRetries: STT_MAX_RETRIES,
    timeout: STT_TIMEOUT_MS,
  });

  const tStart = Date.now();

  // ── Primary attempt ─────────────────────────────────────────────────────
  const tPrimary = Date.now();
  try {
    const response = await client.audio.transcriptions.create({
      file,
      model: requestedModel,
      response_format: "json",
    });
    const text = validTranscript(response);
    perf.sttPrimaryMs = Date.now() - tPrimary;
    if (text !== null) {
      perf.sttModel = requestedModel;
      perf.sttMs = Date.now() - tStart;
      applyUsage(perf, (response as { usage?: unknown }).usage);
      return { text, perf };
    }
    console.error("[VR] stt: primary transcript was empty or malformed");
  } catch (e) {
    perf.sttPrimaryMs = Date.now() - tPrimary;
    console.error("[VR] stt: primary attempt failed:", e instanceof Error ? e.message : e);
  }

  // No second attempt when the primary already was the fallback model.
  if (requestedModel === FALLBACK_STT_MODEL) {
    perf.sttModel = FALLBACK_STT_MODEL;
    perf.sttMs = Date.now() - tStart;
    throw new SttError("transcription failed", perf);
  }

  // ── One fallback attempt, same client ────────────────────────────────────
  perf.sttFallbackUsed = true;
  perf.sttModel = FALLBACK_STT_MODEL;
  const tFallback = Date.now();
  try {
    const response = await client.audio.transcriptions.create({
      file,
      model: FALLBACK_STT_MODEL,
      response_format: "json",
    });
    const text = validTranscript(response);
    perf.sttFallbackMs = Date.now() - tFallback;
    if (text !== null) {
      perf.sttMs = Date.now() - tStart;
      applyUsage(perf, (response as { usage?: unknown }).usage);
      return { text, perf };
    }
    console.error("[VR] stt: fallback transcript was empty or malformed");
  } catch (e) {
    perf.sttFallbackMs = Date.now() - tFallback;
    console.error("[VR] stt: fallback attempt failed:", e instanceof Error ? e.message : e);
  }

  perf.sttMs = Date.now() - tStart;
  throw new SttError("transcription failed", perf);
}
