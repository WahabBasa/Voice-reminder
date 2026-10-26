/**
 * The "update available" prompt's decisions (lib/appUpdatePrompt.ts): the
 * server answer, the 24 h snooze, required hiding "Later", the holds that keep
 * it off alarm / consent / wheel / recording screens, and the language pick.
 */
const mockStore = new Map<string, string>();
jest.mock("@react-native-async-storage/async-storage", () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(async (k: string) => (mockStore.has(k) ? mockStore.get(k)! : null)),
    setItem: jest.fn(async (k: string, v: string) => {
      mockStore.set(k, v);
    }),
  },
}));

import {
  PROMPT_STRINGS,
  SNOOZE_KEY,
  SNOOZE_MS,
  STORE_URL,
  STORE_WEB_URL,
  __resetUpdatePromptHoldsForTests,
  holdUpdatePrompt,
  isPromptVisible,
  isRtlPromptLanguage,
  isSnoozed,
  isUpdatePromptHeld,
  isVersionString,
  loadSnoozedAt,
  pickInstalledVersion,
  pickPromptLanguage,
  promptLanguageFor,
  promptStringsFor,
  readDecision,
  saveSnoozedAt,
  shouldOffer,
  showsLater,
  subscribeUpdatePromptHolds,
  textEdgeStyle,
  updatePromptHoldReasons,
} from "../../lib/appUpdatePrompt";

const NOW = 1_800_000_000_000;
const SHOW = { show: true, required: false };
const REQUIRED = { show: true, required: true };

beforeEach(() => {
  mockStore.clear();
  __resetUpdatePromptHoldsForTests();
});

describe("mockStore page", () => {
  test("opens Remi's App Store page, with a web fallback", () => {
    expect(STORE_URL).toBe("itms-apps://apps.apple.com/app/id6801797784");
    expect(STORE_WEB_URL).toBe("https://apps.apple.com/app/id6801797784");
  });
});

describe("server answer", () => {
  test("readDecision keeps only well-formed answers", () => {
    expect(readDecision({ show: true, required: false, latest: "1.0.3" })).toEqual({
      show: true,
      required: false,
      latest: "1.0.3",
    });
    expect(readDecision({ show: true, required: true })).toEqual(REQUIRED);
    expect(readDecision({ show: "yes" })).toEqual({ show: false, required: false });
    expect(readDecision(null)).toEqual({ show: false, required: false });
    expect(readDecision(undefined)).toEqual({ show: false, required: false });
  });

  test("version strings: same rule as the server", () => {
    expect(isVersionString("1.0.10")).toBe(true);
    expect(isVersionString("1.0.2-beta")).toBe(false);
    expect(isVersionString("")).toBe(false);
    expect(isVersionString(null)).toBe(false);
    expect(pickInstalledVersion(undefined, "1.0.2")).toBe("1.0.2");
    expect(pickInstalledVersion("1.0.1", "1.0.2")).toBe("1.0.1");
    expect(pickInstalledVersion("exposdk:54.0.0", "junk", null)).toBeNull();
  });
});

describe("24 h snooze", () => {
  test("Later silences for 24 h, then the prompt returns", () => {
    expect(isSnoozed(null, NOW)).toBe(false);
    expect(isSnoozed(NOW, NOW)).toBe(true);
    expect(isSnoozed(NOW - SNOOZE_MS + 1, NOW)).toBe(true);
    expect(isSnoozed(NOW - SNOOZE_MS, NOW)).toBe(false);
    expect(shouldOffer(SHOW, NOW - 60_000, NOW)).toBe(false);
    expect(shouldOffer(SHOW, NOW - SNOOZE_MS - 1, NOW)).toBe(true);
    expect(shouldOffer(SHOW, null, NOW)).toBe(true);
  });

  test("a clock moved back past the tap ends the snooze", () => {
    expect(isSnoozed(NOW + 60_000, NOW)).toBe(false);
  });

  test("nothing to offer when the server says no", () => {
    expect(shouldOffer({ show: false, required: false }, null, NOW)).toBe(false);
  });

  test("required ignores the snooze", () => {
    expect(shouldOffer(REQUIRED, NOW - 1000, NOW)).toBe(true);
  });

  test("the snooze persists through AsyncStorage", async () => {
    expect(await loadSnoozedAt()).toBeNull();
    await saveSnoozedAt(NOW);
    expect(mockStore.get(SNOOZE_KEY)).toBe(String(NOW));
    expect(await loadSnoozedAt()).toBe(NOW);
    mockStore.set(SNOOZE_KEY, "garbage");
    expect(await loadSnoozedAt()).toBeNull();
  });
});

describe("required", () => {
  test("required hides Later; skippable shows it", () => {
    expect(showsLater(REQUIRED)).toBe(false);
    expect(showsLater(SHOW)).toBe(true);
  });

  test("a required prompt is never closed by a dismissal (the caller passes dismissed && !required)", () => {
    const base = { offered: true, onHome: true, held: false, appActive: true, settled: true };
    expect(isPromptVisible({ ...base, dismissed: true && !REQUIRED.required })).toBe(true);
    expect(isPromptVisible({ ...base, dismissed: true && !SHOW.required })).toBe(false);
  });
});

describe("never shown over other moments", () => {
  const base = {
    offered: true,
    dismissed: false,
    onHome: true,
    held: false,
    appActive: true,
    settled: true,
  };

  test("shown on Home once settled", () => {
    expect(isPromptVisible(base)).toBe(true);
    expect(isPromptVisible({ ...base, settled: false })).toBe(false);
    expect(isPromptVisible({ ...base, onHome: false })).toBe(false);
    expect(isPromptVisible({ ...base, appActive: false })).toBe(false);
    expect(isPromptVisible({ ...base, offered: false })).toBe(false);
  });

  test.each(["alarm", "consent", "wheel", "recording", "permission", "splash"])(
    "a %s hold suppresses it until released",
    (reason) => {
      const seen: boolean[] = [];
      const unsubscribe = subscribeUpdatePromptHolds(() => seen.push(isUpdatePromptHeld()));
      const release = holdUpdatePrompt(reason);
      expect(isUpdatePromptHeld()).toBe(true);
      expect(updatePromptHoldReasons()).toEqual([reason]);
      expect(isPromptVisible({ ...base, held: isUpdatePromptHeld() })).toBe(false);
      release();
      expect(isUpdatePromptHeld()).toBe(false);
      expect(isPromptVisible({ ...base, held: isUpdatePromptHeld() })).toBe(true);
      expect(seen).toEqual([true, false]);
      unsubscribe();
    }
  );

  test("holds count: two alarms, one released, still held; release is idempotent", () => {
    const a = holdUpdatePrompt("alarm");
    const b = holdUpdatePrompt("alarm");
    a();
    a();
    expect(isUpdatePromptHeld()).toBe(true);
    b();
    expect(isUpdatePromptHeld()).toBe(false);
  });
});

describe("language", () => {
  test("tags map onto the prompt's languages", () => {
    expect(promptLanguageFor("pt-BR")).toBe("pt");
    expect(promptLanguageFor("es_MX")).toBe("es");
    expect(promptLanguageFor("zh-Hant-TW")).toBe("zh-Hant");
    expect(promptLanguageFor("zh-TW")).toBe("zh-Hant");
    expect(promptLanguageFor("zh-HK")).toBe("zh-Hant");
    expect(promptLanguageFor("zh-Hans-CN")).toBe("zh-Hans");
    expect(promptLanguageFor("zh")).toBe("zh-Hans");
    expect(promptLanguageFor("fil-PH")).toBe("tl");
    expect(promptLanguageFor("iw")).toBe("he");
    expect(promptLanguageFor("no")).toBe("nb");
    expect(promptLanguageFor("ar-SA")).toBe("ar");
    expect(promptLanguageFor("xx")).toBeNull();
    expect(promptLanguageFor("")).toBeNull();
    expect(promptLanguageFor(null)).toBeNull();
  });

  test("first known candidate wins, in order; English last", () => {
    // UI language first, even if the iPhone prefers another.
    expect(pickPromptLanguage(["de", "fr-FR"])).toBe("de");
    // Unknown UI language falls through to the iPhone's list.
    expect(pickPromptLanguage([null, "xx-YY", "ja-JP"])).toBe("ja");
    expect(pickPromptLanguage([])).toBe("en");
    expect(pickPromptLanguage(["xx", undefined])).toBe("en");
  });

  test("all 35 UI languages have short, complete copy", () => {
    const langs = Object.keys(PROMPT_STRINGS);
    expect(langs).toHaveLength(35);
    for (const lang of langs) {
      const s = promptStringsFor(lang);
      for (const key of ["title", "body", "required", "update", "later"] as const) {
        expect(s[key].trim().length).toBeGreaterThan(0);
      }
      expect(s.title.length).toBeLessThanOrEqual(24);
      expect(s.update.length).toBeLessThanOrEqual(13);
      expect(s.later.length).toBeLessThanOrEqual(10);
      // Never name a provider.
      expect(JSON.stringify(s)).not.toMatch(/openai|google|elevenlabs|speechify|convex|whisper|gpt/i);
    }
    expect(promptStringsFor("nope")).toBe(PROMPT_STRINGS.en);
  });

  test("RTL languages align to the right edge in either layout", () => {
    expect(["ar", "he", "fa", "ur"].every(isRtlPromptLanguage)).toBe(true);
    expect(isRtlPromptLanguage("en")).toBe(false);
    // LTR layout (older versions): physical right is 'right'.
    expect(textEdgeStyle(true, false)).toEqual({ textAlign: "right", writingDirection: "rtl" });
    // RTL layout: Fabric swaps 'left' to the right edge.
    expect(textEdgeStyle(true, true)).toEqual({ textAlign: "left", writingDirection: "rtl" });
    expect(textEdgeStyle(false, false)).toEqual({ textAlign: "left", writingDirection: "ltr" });
    expect(textEdgeStyle(false, true)).toEqual({ textAlign: "right", writingDirection: "ltr" });
  });
});
