/**
 * Parse-usage extraction (spec §4). Pure function, so these are plain
 * input/output assertions: exact field mapping, absent fields omitted, and the
 * one rule that matters for reading the logs — a reported 0 is kept, not
 * confused with "we don't know".
 */

import { extractParseUsage } from "../../convex/parseUsage";

describe("extractParseUsage", () => {
  it("maps all four fields from a full usage object", () => {
    expect(
      extractParseUsage({
        prompt_tokens: 1200,
        completion_tokens: 40,
        prompt_tokens_details: { cached_tokens: 900 },
        completion_tokens_details: { reasoning_tokens: 16 },
      })
    ).toEqual({
      parsePromptTokens: 1200,
      parseCompletionTokens: 40,
      parseCachedTokens: 900,
      parseReasoningTokens: 16,
    });
  });

  it("omits fields that are absent rather than inventing zeroes", () => {
    expect(extractParseUsage({ prompt_tokens: 1200 })).toEqual({
      parsePromptTokens: 1200,
    });
  });

  it("preserves reported zero cached and reasoning values", () => {
    expect(
      extractParseUsage({
        prompt_tokens: 1200,
        completion_tokens: 40,
        prompt_tokens_details: { cached_tokens: 0 },
        completion_tokens_details: { reasoning_tokens: 0 },
      })
    ).toEqual({
      parsePromptTokens: 1200,
      parseCompletionTokens: 40,
      parseCachedTokens: 0,
      parseReasoningTokens: 0,
    });
  });

  it("returns an empty object for a missing or non-object usage", () => {
    expect(extractParseUsage(undefined)).toEqual({});
    expect(extractParseUsage(null)).toEqual({});
    expect(extractParseUsage("nope")).toEqual({});
    expect(extractParseUsage(42)).toEqual({});
  });

  it("ignores non-numeric, non-finite and negative values", () => {
    expect(
      extractParseUsage({
        prompt_tokens: "1200",
        completion_tokens: NaN,
        prompt_tokens_details: { cached_tokens: Infinity },
        completion_tokens_details: { reasoning_tokens: -5 },
      })
    ).toEqual({});
  });

  it("tolerates missing or non-object detail sub-objects", () => {
    expect(
      extractParseUsage({
        prompt_tokens: 10,
        prompt_tokens_details: null,
        completion_tokens_details: "nope",
      })
    ).toEqual({ parsePromptTokens: 10 });
  });
});
