/**
 * Who sees the first-run language wheel, and which language a launch without
 * a pick shows.
 *   - A genuinely fresh install: the wheel, preselected on the phone language.
 *   - An install that was in use before the wheel existed (device id, local
 *     reminders or settings in storage) and never picked: no wheel; the UI
 *     follows the iPhone's language.
 *   - Any install with a saved pick: that pick.
 * And the phone language is the iPhone's ordered preferred-language list
 * (expo-localization getLocales() = Locale.preferredLanguages): the first entry
 * wins; later entries only count when Remi has no catalog for an earlier one.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  __resetAppLanguageForTests,
  defaultLanguageChoice,
  getChosenLanguage,
  getDeviceLanguageTags,
  hasLoadedLanguage,
  isExistingInstall,
  loadAppLanguage,
  resolveUiLocale,
  shouldShowFirstLaunchWheel,
} from "../../lib/appLanguage";
import { __resetUiLocaleForTests, getUiLocale } from "../../lib/i18n";
import { __resetSpokenLanguageForTests } from "../../lib/spokenLanguage";

// The iPhone's Language & Region list, primary first: Icelandic (no catalog),
// then German, then English.
jest.mock("expo-localization", () => ({
  getLocales: () => [{ languageTag: "is-IS" }, { languageTag: "de-DE" }, { languageTag: "en-US" }],
}));

beforeEach(() => {
  (AsyncStorage as any)._reset();
  __resetAppLanguageForTests();
  __resetSpokenLanguageForTests();
  __resetUiLocaleForTests();
});

afterAll(() => __resetUiLocaleForTests());

const wheelShows = () => shouldShowFirstLaunchWheel(hasLoadedLanguage(), getChosenLanguage());

describe("the first-run wheel", () => {
  it("fresh install: the wheel, preselected on the phone language", async () => {
    await loadAppLanguage(["fr-FR", "en-US"]);
    expect(isExistingInstall()).toBe(false);
    expect(wheelShows()).toBe(true);
    expect(defaultLanguageChoice(getChosenLanguage(), ["fr-FR", "en-US"])).toBe("fr");
  });

  it.each(["@device_id", "@reminders", "@app_settings"])(
    "existing install (%s) with no saved pick: no wheel, the phone's language",
    async (key) => {
      await AsyncStorage.setItem(key, "x");
      await loadAppLanguage(["fr-FR", "en-US"]);
      expect(isExistingInstall()).toBe(true);
      expect(wheelShows()).toBe(false);
      expect(getChosenLanguage()).toBeNull();
      expect(getUiLocale()).toBe("fr");
    }
  );

  it("existing install with a saved pick: the pick, not the phone", async () => {
    await AsyncStorage.setItem("@device_id", "abc");
    await AsyncStorage.setItem("vr.appLanguage", "ja");
    await loadAppLanguage(["fr-FR"]);
    expect(wheelShows()).toBe(false);
    expect(getChosenLanguage()).toBe("ja");
    expect(getUiLocale()).toBe("ja");
  });

  it("fresh install with a saved pick (picked on the wheel last launch): the pick", async () => {
    await AsyncStorage.setItem("vr.appLanguage", "de");
    await loadAppLanguage(["fr-FR"]);
    expect(wheelShows()).toBe(false);
    expect(getUiLocale()).toBe("de");
  });

  it("never before the stored state is read", () => {
    expect(wheelShows()).toBe(false);
  });

  it("the explicit argument still decides (callers and tests)", () => {
    expect(shouldShowFirstLaunchWheel(true, null, false)).toBe(true);
    expect(shouldShowFirstLaunchWheel(true, null, true)).toBe(false);
    expect(shouldShowFirstLaunchWheel(true, "en", false)).toBe(false);
    expect(shouldShowFirstLaunchWheel(false, null, false)).toBe(false);
  });
});

describe("the phone language: the preferred list in order", () => {
  it("reads the iPhone's preferred-language list as given, primary first", () => {
    expect(getDeviceLanguageTags()).toEqual(["is-IS", "de-DE", "en-US"]);
  });

  it("the primary language wins when Remi has its catalog, even if a later one does too", () => {
    expect(resolveUiLocale(null, ["fr-FR", "de-DE", "en-US"])).toBe("fr");
    expect(defaultLanguageChoice(null, ["fr-FR", "de-DE"])).toBe("fr");
  });

  it("falls down the list only past languages Remi has no catalog for", () => {
    expect(resolveUiLocale(null, getDeviceLanguageTags())).toBe("de");
  });

  it("an existing install follows that same order", async () => {
    await AsyncStorage.setItem("@device_id", "abc");
    await loadAppLanguage(); // the real device list
    expect(getUiLocale()).toBe("de");
  });
});
