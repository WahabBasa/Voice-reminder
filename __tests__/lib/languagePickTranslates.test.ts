/**
 * Every language on the wheel, picked on a fresh install (the first-run path:
 * no stored pick, device in English), switches what `t()` returns — except
 * English itself and the right-to-left languages, which keep the English UI on
 * purpose (lib/appLanguage.ts RTL_LANGUAGES) while still setting the voice.
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

    const english = code === "en" || RTL_LANGUAGES.includes(code);
    if (english) {
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
