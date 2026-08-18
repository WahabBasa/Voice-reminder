/**
 * Parse-prompt assembly (OLD-106).
 *
 * The prompt is ~15k characters and 91-94% of a typed reminder's server time is
 * the one model call that prefills it. Two structural properties keep that call
 * cacheable, and neither is visible from reading any single string:
 *
 *   1. Everything except the trailing CURRENT CONTEXT block is byte-identical
 *      across requests, so the stable prefix can be served from the provider's
 *      cache. A single interpolated clock in the middle of the prompt (which is
 *      how this used to be written) invalidates everything after it.
 *   2. SPOKEN LINE RULES appears exactly once and above every field
 *      instruction that refers to it by name.
 *
 * These are the tests that fail if someone reintroduces the volatile context
 * mid-prompt or re-inlines the rule.
 */
import { buildSystemPrompt } from "../../convex/actions";
import { SPOKEN_LINE_RULE, SPOKEN_LINE_RULES_HEADING } from "../../convex/helpers";

const CONTEXT_A = {
  currentDate: "2026-08-13",
  currentDayOfWeek: "Thursday",
  currentTime: "14:00",
  timezone: "Asia/Dubai",
};

const CONTEXT_B = {
  currentDate: "2027-01-02",
  currentDayOfWeek: "Saturday",
  currentTime: "23:47",
  timezone: "America/New_York",
};

const CONTEXT_MARKER = "CURRENT CONTEXT:";

describe("buildSystemPrompt — cacheable ordering", () => {
  it("puts the volatile context last, with nothing after it", () => {
    const prompt = buildSystemPrompt(CONTEXT_A);
    const marker = prompt.indexOf(CONTEXT_MARKER);

    expect(marker).toBeGreaterThan(-1);
    // The context block names date, day, time and timezone, and then the
    // prompt ends. Anything appended below it would stop being cacheable.
    expect(prompt.slice(marker)).toBe(
      `${CONTEXT_MARKER}
- Current date: ${CONTEXT_A.currentDate} (${CONTEXT_A.currentDayOfWeek})
- Current time: ${CONTEXT_A.currentTime}
- User's timezone: ${CONTEXT_A.timezone}`
    );
  });

  it("is byte-identical up to the context block for two different clocks", () => {
    const a = buildSystemPrompt(CONTEXT_A);
    const b = buildSystemPrompt(CONTEXT_B);

    const prefixA = a.slice(0, a.indexOf(CONTEXT_MARKER));
    const prefixB = b.slice(0, b.indexOf(CONTEXT_MARKER));

    expect(prefixA).toBe(prefixB);
    // The shared prefix has to be worth caching: the whole point is that it is
    // the overwhelming majority of the prompt.
    expect(prefixA.length).toBeGreaterThan(0.9 * a.length);
  });

  it("leaks no part of the context into the cacheable prefix", () => {
    const prompt = buildSystemPrompt(CONTEXT_B);
    const prefix = prompt.slice(0, prompt.indexOf(CONTEXT_MARKER));

    for (const volatileValue of [
      CONTEXT_B.currentDate,
      CONTEXT_B.currentDayOfWeek,
      CONTEXT_B.currentTime,
      CONTEXT_B.timezone,
    ]) {
      expect(prefix).not.toContain(volatileValue);
    }
  });
});

describe("buildSystemPrompt — the spoken-line rule ships once", () => {
  it("carries the rule exactly one time", () => {
    const prompt = buildSystemPrompt(CONTEXT_A);
    expect(prompt.split(SPOKEN_LINE_RULE)).toHaveLength(2);
  });

  it("states the rule above every instruction that refers back to it", () => {
    const prompt = buildSystemPrompt(CONTEXT_A);
    const section = prompt.indexOf(SPOKEN_LINE_RULE);
    const headingAt = prompt.indexOf(SPOKEN_LINE_RULES_HEADING);

    expect(headingAt).toBeGreaterThan(-1);
    expect(headingAt).toBeLessThan(section);

    // Every "Obey the SPOKEN LINE RULES above" points backwards, so the
    // description field (which sits in the JSON template near the top) has to
    // come after the section too.
    let cursor = prompt.indexOf(SPOKEN_LINE_RULES_HEADING, headingAt + 1);
    let references = 0;
    while (cursor !== -1) {
      expect(cursor).toBeGreaterThan(section);
      references += 1;
      cursor = prompt.indexOf(SPOKEN_LINE_RULES_HEADING, cursor + 1);
    }
    // description and preDescription — the two spoken fields left. The third
    // reference was the replay-variant field, gone with the variants (OLD-108).
    expect(references).toBe(2);
  });
});
