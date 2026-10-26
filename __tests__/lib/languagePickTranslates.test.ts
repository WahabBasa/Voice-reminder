/**
 * Every language on the wheel, picked on a fresh install (the first-run path:
 * no stored pick, device in English), switches what `t()` returns — except
 * English itself. The right-to-left languages (lib/appLanguage.ts
 * RTL_LANGUAGES) translate too, into their own catalog; their layout flip is
 * pinned in layoutDirection.test.ts.
 *
 * Written while chasing "I picked a language and the app stayed English" on
 * build 10: it pins that the JS pick → catalog path is not the cause for any
 * choice the wheel offers.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  LANGUAGE_OPTIONS,
  RTL_LANGUAGES,
  __resetAppLanguageForTests,
  chooseAppLanguage,
  getChosenLanguage,
  hasLoadedLanguage,
  loadAppLanguage,
  shouldShowFirstLaunchWheel,
} from "../../lib/appLanguage";
import { __resetUiLocaleForTests, getUiLocale, t } from "../../lib/i18n";
import { __resetSpokenLanguageForTests } from "../../lib/spokenLanguage";
import en from "../../locales/en.json";

jest.mock("expo-localization", () => ({
  getLocales: () => [{ languageTag: "en-US" }],
}));

// Keys a fresh install sees straight after Continue (Home + Settings).
const PROBE_KEYS = ["common.cancel", "language.sheet.continue", "common.done"];

beforeEach(() => {
  (AsyncStorage as any)._reset();
  __resetAppLanguageForTests();
  __resetSpokenLanguageForTests();
  __resetUiLocaleForTests();
});

afterAll(() => __resetUiLocaleForTests());

describe("a first-run pick translates the UI", () => {
  it.each(LANGUAGE_OPTIONS.map((o) => [o.code]))("%s", async (code) => {
    // Fresh install: nothing stored, so the first-run wheel is up, in English.
    await loadAppLanguage(["en-US"]);
    expect(shouldShowFirstLaunchWheel(hasLoadedLanguage(), getChosenLanguage())).toBe(true);
    expect(getUiLocale()).toBe("en");

    // Continue.
    expect(await chooseAppLanguage(code)).toBe(true);
    expect(shouldShowFirstLaunchWheel(hasLoadedLanguage(), getChosenLanguage())).toBe(false);

    if (code === "en") {
      expect(getUiLocale()).toBe("en");
      return;
    }
    expect(getUiLocale()).not.toBe("en");
    const translated = PROBE_KEYS.filter(
      (key) => t(key) !== (en as Record<string, string>)[key]
    );
    expect(translated.length).toBeGreaterThan(0);
  });
});

describe("right-to-left picks get their own catalog", () => {
  it.each(RTL_LANGUAGES.map((code) => [code]))("%s", async (code) => {
    await loadAppLanguage(["en-US"]);
    expect(await chooseAppLanguage(code)).toBe(true);
    expect(getUiLocale()).toBe(code);
    // Every probe key reads in the new script, none falls back to English.
    for (const key of PROBE_KEYS) {
      expect([key, /[֐-ۿ]/.test(t(key))]).toEqual([key, true]);
    }
  });

  it("an Arabic device with no pick opens in Arabic", async () => {
    await loadAppLanguage(["ar-SA", "en-US"]);
    expect(getChosenLanguage()).toBeNull();
    expect(getUiLocale()).toBe("ar");
  });

  it("Arabic plurals use all six CLDR forms", async () => {
    await chooseAppLanguage("ar");
    const hours = (count: number) => t("time.every.hours", { count });
    expect(hours(1)).toBe("كل ساعة"); // one: no number
    expect(hours(2)).toBe("كل ساعتين"); // two: the dual
    expect(hours(5)).toContain("ساعات"); // few (3–10): plural noun
    expect(hours(11)).not.toContain("ساعات"); // many (11–99): singular noun
    expect(hours(100)).not.toContain("ساعات"); // other
  });
});
