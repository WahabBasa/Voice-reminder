/**
 * The rule that learns which language a device speaks in (OLD-140,
 * convex/spokenLang.ts): first value at once, a switch only after two takes in
 * a row, one take counted once.
 */
import {
  SWITCH_AFTER,
  majorityLang,
  nextSpokenLang,
  type SpokenLangState,
} from "../../convex/spokenLang";

const NOW = 1_000;

/** Fold a run of takes through the rule, the way the devices row would. */
function run(takes: (string | undefined)[], start: SpokenLangState = {}): SpokenLangState {
  let state = { ...start };
  takes.forEach((lang, i) => {
    const patch = nextSpokenLang(state, { lang, creationId: `c${i}` }, NOW + i);
    if (patch) state = { ...state, ...patch };
  });
  return state;
}

describe("majorityLang", () => {
  it("takes the most common language", () => {
    expect(majorityLang(["sv", "en", "sv"])).toBe("sv");
  });

  it("breaks a tie by first appearance", () => {
    expect(majorityLang(["he", "en"])).toBe("he");
    expect(majorityLang(["en", "he"])).toBe("en");
  });

  it("normalizes codes and ignores what is not one", () => {
    expect(majorityLang(["SV-se", undefined, 7, "swedish", "sv"])).toBe("sv");
  });

  it("is undefined with nothing to go on", () => {
    expect(majorityLang([])).toBeUndefined();
    expect(majorityLang([undefined, ""])).toBeUndefined();
  });
});

describe("nextSpokenLang", () => {
  it("sets the first language heard immediately", () => {
    expect(nextSpokenLang({}, { lang: "sv", creationId: "a" }, NOW)).toEqual({
      spokenLangLastCreationId: "a",
      spokenLang: "sv",
      spokenLangAt: NOW,
      spokenLangCandidate: undefined,
      spokenLangCandidateCount: undefined,
    });
  });

  it("refreshes the timestamp when the same language comes again", () => {
    const state = run(["sv", "sv"]);
    expect(state.spokenLang).toBe("sv");
    expect(state.spokenLangAt).toBe(NOW + 1);
  });

  it("does not flip on one disagreeing take after a streak", () => {
    const state = run(["sv", "sv", "sv", "en"]);
    expect(state.spokenLang).toBe("sv");
    expect(state.spokenLangCandidate).toBe("en");
    expect(state.spokenLangCandidateCount).toBe(1);
  });

  it(`switches after ${SWITCH_AFTER} takes in a row in the new language`, () => {
    expect(SWITCH_AFTER).toBe(2);
    const state = run(["sv", "en", "en"]);
    expect(state.spokenLang).toBe("en");
    expect(state.spokenLangAt).toBe(NOW + 2);
    expect(state.spokenLangCandidate).toBeUndefined();
    expect(state.spokenLangCandidateCount).toBeUndefined();
  });

  it("needs the two to be consecutive", () => {
    expect(run(["sv", "en", "sv", "en"]).spokenLang).toBe("sv");
    // A different newcomer resets the count.
    expect(run(["sv", "en", "de"]).spokenLang).toBe("sv");
    expect(run(["sv", "en", "de"]).spokenLangCandidate).toBe("de");
  });

  it("treats a candidate with no count as a fresh one", () => {
    const patch = nextSpokenLang(
      { spokenLang: "sv", spokenLangCandidate: "en" },
      { lang: "en", creationId: "x" },
      NOW
    );
    expect(patch?.spokenLangCandidateCount).toBe(1);
  });

  it("counts one take once", () => {
    const state: SpokenLangState = { spokenLang: "sv", spokenLangLastCreationId: "same" };
    expect(nextSpokenLang(state, { lang: "en", creationId: "same" }, NOW)).toBeNull();
  });

  it("changes nothing for a take with no language", () => {
    expect(nextSpokenLang({ spokenLang: "sv" }, { lang: undefined, creationId: "a" }, NOW)).toBeNull();
    expect(nextSpokenLang({}, { lang: "??", creationId: "a" }, NOW)).toBeNull();
  });
});
