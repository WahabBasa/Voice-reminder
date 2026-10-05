/**
 * The voiceable-language table (OLD-130). The guard's unsupported_language
 * verdict and, later, voice routing both read it.
 */
import {
  ELEVENLABS_V3_LANGS,
  isSupportedLineLanguage,
  normalizeLanguageCode,
} from "../../convex/languages";

describe("ELEVENLABS_V3_LANGS", () => {
  it("is all lowercase two-letter codes, with no repeats", () => {
    for (const code of ELEVENLABS_V3_LANGS) expect(code).toMatch(/^[a-z]{2}$/);
    expect(new Set(ELEVENLABS_V3_LANGS).size).toBe(ELEVENLABS_V3_LANGS.length);
  });

  it("covers the launch set and the language that started this", () => {
    for (const code of ["en", "ar", "de", "fr", "es", "it", "pt", "sv"]) {
      expect(ELEVENLABS_V3_LANGS).toContain(code);
    }
  });
});

describe("normalizeLanguageCode", () => {
  it.each([
    ["en", "en"],
    ["EN", "en"],
    [" sv ", "sv"],
    ["en-US", "en"],
    ["sv_SE", "sv"],
  ])("%j → %j", (input, expected) => {
    expect(normalizeLanguageCode(input)).toBe(expected);
  });

  it.each([["english"], [""], ["e"], ["eng"], [undefined], [null], [42]])(
    "%j is not a code",
    (input) => {
      expect(normalizeLanguageCode(input)).toBeUndefined();
    }
  );
});

describe("isSupportedLineLanguage", () => {
  it("is true for English and Arabic", () => {
    expect(isSupportedLineLanguage("en")).toBe(true);
    expect(isSupportedLineLanguage("ar")).toBe(true);
  });

  it("is true for every eleven_v3 language", () => {
    for (const code of ELEVENLABS_V3_LANGS) expect(isSupportedLineLanguage(code)).toBe(true);
  });

  it("accepts region-tagged and upper-case forms", () => {
    expect(isSupportedLineLanguage("SV-se")).toBe(true);
  });

  it("is false for a language eleven_v3 does not list", () => {
    expect(isSupportedLineLanguage("xh")).toBe(false); // Xhosa
    expect(isSupportedLineLanguage("yo")).toBe(false); // Yoruba
  });

  it("is false for anything that is not a code", () => {
    expect(isSupportedLineLanguage("english")).toBe(false);
    expect(isSupportedLineLanguage(undefined)).toBe(false);
    expect(isSupportedLineLanguage("")).toBe(false);
  });
});
