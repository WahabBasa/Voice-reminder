/**
 * Parse-response usage extraction (spec §4, "Parse usage").
 *
 * OpenRouter returns token accounting on non-streaming chat completions without
 * any extra request parameter. The four numbers below are pulled out of it the
 * same way at all three parse call sites (the worker's `parseTake`, and the two
 * legacy actions' parse paths) so the device log's cached-token split means the
 * same thing everywhere.
 *
 * Pure and side-effect-free — no network, no Node globals — so it lives outside
 * the "use node" files and is unit-testable on its own.
 *
 * Only finite, nonnegative numbers are kept. A reported 0 is a real value (a
 * cache miss, no reasoning tokens) and is preserved; an absent field is omitted
 * rather than invented as 0, so "we don't know" stays distinct from "it was 0".
 */

export type ParseUsage = {
  /** `usage.prompt_tokens`. */
  parsePromptTokens?: number;
  /** `usage.completion_tokens`. */
  parseCompletionTokens?: number;
  /** `usage.prompt_tokens_details.cached_tokens` — cache reads. */
  parseCachedTokens?: number;
  /** `usage.completion_tokens_details.reasoning_tokens`. */
  parseReasoningTokens?: number;
};

/** A number only if it is finite and nonnegative; a reported 0 qualifies. */
function finiteNonNegative(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : undefined;
}

/**
 * Read the four parse-usage fields out of a chat-completion's `usage`, through a
 * narrow runtime check because the provider shape is wider than the SDK type.
 */
export function extractParseUsage(usage: unknown): ParseUsage {
  const result: ParseUsage = {};
  if (!usage || typeof usage !== "object") return result;

  const u = usage as {
    prompt_tokens?: unknown;
    completion_tokens?: unknown;
    prompt_tokens_details?: unknown;
    completion_tokens_details?: unknown;
  };

  const prompt = finiteNonNegative(u.prompt_tokens);
  if (prompt !== undefined) result.parsePromptTokens = prompt;

  const completion = finiteNonNegative(u.completion_tokens);
  if (completion !== undefined) result.parseCompletionTokens = completion;

  const promptDetails = u.prompt_tokens_details;
  if (promptDetails && typeof promptDetails === "object") {
    const cached = finiteNonNegative((promptDetails as { cached_tokens?: unknown }).cached_tokens);
    if (cached !== undefined) result.parseCachedTokens = cached;
  }

  const completionDetails = u.completion_tokens_details;
  if (completionDetails && typeof completionDetails === "object") {
    const reasoning = finiteNonNegative(
      (completionDetails as { reasoning_tokens?: unknown }).reasoning_tokens
    );
    if (reasoning !== undefined) result.parseReasoningTokens = reasoning;
  }

  return result;
}
