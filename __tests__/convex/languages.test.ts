/**
 * The voiceable-language table (OLD-130). The guard's unsupported_language
 * verdict and voice routing both read it. Since 2026-10-06 it is Speechify's
 * own language list: ElevenLabs is no longer used.
 */
import {
  SPEECHIFY_LINE_LANGUAGES,
  SUPPORTED_LINE_LANGS,
  isSupportedLineLanguage,
  needsMultilingualVoice,
  normalizeLanguageCode,
  speechifyLineLanguage,
} from "../../convex/languages";

describe("needsMultilingualVoice (OLD-131)", () => {
  it("is false for English, Arabic and a missing code", () => {
    for (const lang of ["en", "EN-us", "ar", undefined, null, ""]) {
      expect(needsMultilingualVoice(lang)).toBe(false);
    }
  });

  it("is true for every other Speechify language", () => {
    for (const code of SUPPORTED_LINE_LANGS) {
      expect(needsMultilingualVoice(code)).toBe(code !== "en" && code !== "ar");
    }
    expect(needsMultilingualVoice("sv-SE")).toBe(true);
  });

  it("is false for a code Speechify does not voice, or junk", () => {
    expect(needsMultilingualVoice("xh")).toBe(false);
    expect(needsMultilingualVoice("sw")).toBe(false);
    expect(needsMultilingualVoice("swedish")).toBe(false);
    // Inherited object keys are not languages.
    expect(needsMultilingualVoice("constructor")).toBe(false);
  });
});

describe("speechifyLineLanguage", () => {
  it.each([
    ["sv", "sv-SE", "multilingual"],
    ["sv_SE", "sv-SE", "multilingual"],
    ["he", "he-IL", "multilingual"],
    ["ja", "ja-JP", "multilingual"],
    ["hi", "hi-IN", "multilingual"],
    ["no", "nb-NO", "multilingual"],
    ["nb", "nb-NO", "multilingual"],
    ["de", "de-DE", "simba-3.0"],
    ["es", "es-MX", "simba-3.0"],
    ["fr", "fr-FR", "simba-3.0"],
    ["it", "it-IT", "simba-3.0"],
    ["pt", "pt-BR", "simba-3.0"],
  ])("%s → %s on %s", (lang, locale, tier) => {
    expect(speechifyLineLanguage(lang)).toEqual({ locale, tier });
  });

  it("is undefined for English, Arabic, unsupported codes and junk", () => {
    for (const lang of ["en", "ar", "sw", "fa", "zh", "nn", "xx", "english", "", undefined, null, 7]) {
      expect(speechifyLineLanguage(lang)).toBeUndefined();
    }
  });
});

describe("SPEECHIFY_LINE_LANGUAGES / SUPPORTED_LINE_LANGS", () => {
  it("is all lowercase two-letter codes, with no repeats", () => {
    for (const code of SUPPORTED_LINE_LANGS) expect(code).toMatch(/^[a-z]{2}$/);
    expect(new Set(SUPPORTED_LINE_LANGS).size).toBe(SUPPORTED_LINE_LANGS.length);
  });

  it("is English, Arabic and the Speechify table, and nothing else", () => {
    expect([...SUPPORTED_LINE_LANGS].sort()).toEqual(
      ["en", "ar", ...Object.keys(SPEECHIFY_LINE_LANGUAGES)].sort()
    );
    expect(SUPPORTED_LINE_LANGS).toHaveLength(30);
  });

  it("every locale is a BCP-47 tag of its own language (Norwegian rides nb-NO)", () => {
    for (const [code, { locale }] of Object.entries(SPEECHIFY_LINE_LANGUAGES)) {
      expect(locale).toMatch(/^[a-z]{2}-[A-Z]{2}$/);
      expect(code === "no" ? "nb" : code).toBe(locale.slice(0, 2));
    }
  });

  it("puts exactly simba-3.0's official languages on simba-3.0", () => {
    const simba30 = Object.entries(SPEECHIFY_LINE_LANGUAGES)
      .filter(([, l]) => l.tier === "simba-3.0")
      .map(([code]) => code)
      .sort();
    expect(simba30).toEqual(["de", "es", "fr", "it", "pt"]);
  });

  it("covers the launch set and the language that started this", () => {
    for (const code of ["en", "ar", "de", "fr", "es", "it", "pt", "sv"]) {
      expect(SUPPORTED_LINE_LANGS).toContain(code);
    }
  });

  it("leaves out what Speechify does not voice", () => {
    // sw: accepted live but unlisted; fa/zh/th: "coming soon"; nn: no Nynorsk voice.
    for (const code of ["sw", "fa", "zh", "th", "nn", "af", "cy"]) {
      expect(SUPPORTED_LINE_LANGS).not.toContain(code);
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

  it("is true for every Speechify language", () => {
    for (const code of SUPPORTED_LINE_LANGS) expect(isSupportedLineLanguage(code)).toBe(true);
  });

  it("accepts region-tagged and upper-case forms", () => {
    expect(isSupportedLineLanguage("SV-se")).toBe(true);
  });

  it("is false for a language Speechify does not voice", () => {
    expect(isSupportedLineLanguage("xh")).toBe(false); // Xhosa
    expect(isSupportedLineLanguage("yo")).toBe(false); // Yoruba
    expect(isSupportedLineLanguage("sw")).toBe(false); // Swahili
    expect(isSupportedLineLanguage("fa")).toBe(false); // Persian, "coming soon"
  });

  it("is false for anything that is not a code", () => {
    expect(isSupportedLineLanguage("english")).toBe(false);
    expect(isSupportedLineLanguage(undefined)).toBe(false);
    expect(isSupportedLineLanguage("")).toBe(false);
  });
});
