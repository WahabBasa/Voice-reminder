/**
 * Which language Remi is in (lib/appLanguage.ts): the UI catalog and the voice
 * hint. Resolution order, fallback, RTL, the wheel's list, and the pick's
 * wiring into the spoken-language hint.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  ENDONYMS,
  LANGUAGE_OPTIONS,
  RTL_LANGUAGES,
  __resetAppLanguageForTests,
  applyDeviceLanguage,
  chooseAppLanguage,
  consumeReturnToSettings,
  defaultLanguageChoice,
  endonymFor,
  getChosenLanguage,
  getDeviceLanguageTags,
  hasLoadedLanguage,
  indexOfLanguage,
  loadAppLanguage,
  markReturnToSettings,
  resolveUiLocale,
  shouldShowFirstLaunchWheel,
  subscribeChosenLanguage,
  uiLocaleFor,
} from "../../lib/appLanguage";
import { __resetUiLocaleForTests, getUiLocale, t } from "../../lib/i18n";
import { KNOWN_LANGUAGE_CODES } from "../../lib/languageNames";
import {
  __resetSpokenLanguageForTests,
  getSpokenLanguage,
  languageHintArg,
  rememberSpokenLanguage,
} from "../../lib/spokenLanguage";

const mockGetLocales = jest.fn();
jest.mock("expo-localization", () => ({ getLocales: () => mockGetLocales() }));

beforeEach(() => {
  (AsyncStorage as any)._reset();
  __resetAppLanguageForTests();
  __resetSpokenLanguageForTests();
  __resetUiLocaleForTests();
  mockGetLocales.mockReset();
  mockGetLocales.mockReturnValue([]);
});

afterAll(() => __resetUiLocaleForTests());

describe("UI catalog for a language", () => {
  it("maps pt-* to pt-BR and es-* to es-MX", () => {
    expect(uiLocaleFor("pt-BR")).toBe("pt-BR");
    expect(uiLocaleFor("pt-PT")).toBe("pt-BR");
    expect(uiLocaleFor("pt")).toBe("pt-BR");
    expect(uiLocaleFor("es-ES")).toBe("es-MX");
    expect(uiLocaleFor("es_MX")).toBe("es-MX");
    expect(uiLocaleFor("en-GB")).toBe("en");
  });

  it("gives RTL languages the English UI", () => {
    for (const lang of RTL_LANGUAGES) expect(uiLocaleFor(lang)).toBe("en");
    expect(uiLocaleFor("ar-SA")).toBe("en");
  });

  it("maps Chinese by script, no to nb, fil to tl, others by language", () => {
    expect(uiLocaleFor("zh-Hans-CN")).toBe("zh-Hans");
    expect(uiLocaleFor("zh-CN")).toBe("zh-Hans");
    expect(uiLocaleFor("zh-SG")).toBe("zh-Hans");
    expect(uiLocaleFor("zh")).toBe("zh-Hans");
    expect(uiLocaleFor("zh-Hant")).toBe("zh-Hant");
    expect(uiLocaleFor("zh-TW")).toBe("zh-Hant");
    expect(uiLocaleFor("zh-HK")).toBe("zh-Hant");
    expect(uiLocaleFor("zh-Hant-MO")).toBe("zh-Hant");
    expect(uiLocaleFor("no-NO")).toBe("nb");
    expect(uiLocaleFor("nb-NO")).toBe("nb");
    expect(uiLocaleFor("fil-PH")).toBe("tl");
    expect(uiLocaleFor("de-AT")).toBe("de");
    expect(uiLocaleFor("ja-JP")).toBe("ja");
  });

  it("has no catalog for languages without one, or for junk", () => {
    expect(uiLocaleFor("is-IS")).toBeNull();
    expect(uiLocaleFor("")).toBeNull();
    expect(uiLocaleFor(null)).toBeNull();
  });
});

describe("resolution order: pick, then device, then English", () => {
  it("the pick wins over the device", () => {
    expect(resolveUiLocale("es", ["pt-BR"])).toBe("es-MX");
  });

  it("an RTL pick shows English, not the device language", () => {
    expect(resolveUiLocale("he", ["pt-BR"])).toBe("en");
    expect(resolveUiLocale("ur", ["de-DE"])).toBe("en");
  });

  it("without a pick, the first device language that has a catalog", () => {
    expect(resolveUiLocale(null, ["pt-BR", "en-US"])).toBe("pt-BR");
    expect(resolveUiLocale(null, ["is-IS", "es-US"])).toBe("es-MX");
    expect(resolveUiLocale(null, ["zh-Hant-TW"])).toBe("zh-Hant");
    expect(resolveUiLocale(undefined, ["ar-EG", "pt-BR"])).toBe("en");
  });

  it("falls back to English", () => {
    expect(resolveUiLocale(null, [])).toBe("en");
    expect(resolveUiLocale(null, ["is-IS", "ga-IE"])).toBe("en");
  });
});

describe("the wheel", () => {
  it("lists every voice language once, Chinese per script: 36 choices, each in its own name", () => {
    const expected = KNOWN_LANGUAGE_CODES.flatMap((c) => (c === "zh" ? ["zh-Hans", "zh-Hant"] : [c]));
    expect(LANGUAGE_OPTIONS.map((o) => o.code).sort()).toEqual(expected.sort());
    expect(LANGUAGE_OPTIONS).toHaveLength(36);
    expect(new Set(LANGUAGE_OPTIONS.map((o) => o.endonym)).size).toBe(36);
    for (const option of LANGUAGE_OPTIONS) expect(ENDONYMS[option.code]).toBe(option.endonym);
    expect(endonymFor("zh-TW")).toBe("繁體中文");
    expect(endonymFor("zh-CN")).toBe("简体中文");
    expect(endonymFor("pt")).toBe("Português (Brasil)");
    expect(endonymFor("es-MX")).toBe("Español (México)");
    expect(endonymFor("ja")).toBe("日本語");
    expect(endonymFor("de")).toBe("Deutsch");
    expect(endonymFor("xx")).toBe("xx");
    expect(endonymFor(undefined)).toBe("");
  });

  it("puts Latin-script names first, A to Z", () => {
    const names = LANGUAGE_OPTIONS.map((o) => o.endonym);
    const firstNonLatin = names.findIndex((n) => !/^[A-Za-zÀ-ɏ]/.test(n));
    expect(names.slice(firstNonLatin).every((n) => !/^[A-Za-zÀ-ɏ]/.test(n))).toBe(true);
    const latin = names.slice(0, firstNonLatin);
    expect(latin).toEqual([...latin].sort((a, b) => (a < b ? -1 : 1)));
  });

  it("preselects the pick, else the first known device language, else English", () => {
    expect(defaultLanguageChoice("ja", ["pt-BR"])).toBe("ja");
    expect(defaultLanguageChoice(null, ["xx-YY", "sv-SE"])).toBe("sv");
    expect(defaultLanguageChoice(null, ["zh-Hant-HK"])).toBe("zh-Hant");
    expect(defaultLanguageChoice(null, ["fil-PH"])).toBe("tl");
    expect(defaultLanguageChoice("zz", ["xx"])).toBe("en");
    expect(defaultLanguageChoice(null, [])).toBe("en");
  });

  it("finds a language's row, English's for anything unknown", () => {
    expect(LANGUAGE_OPTIONS[indexOfLanguage("pt-BR")].code).toBe("pt");
    expect(LANGUAGE_OPTIONS[indexOfLanguage("klingon")].code).toBe("en");
    expect(LANGUAGE_OPTIONS[indexOfLanguage(null)].code).toBe("en");
  });
});

describe("device languages", () => {
  it("reads the ordered tags from expo-localization", () => {
    mockGetLocales.mockReturnValue([{ languageTag: "pt-BR" }, { languageTag: "" }, { languageTag: "en-US" }]);
    expect(getDeviceLanguageTags()).toEqual(["pt-BR", "en-US"]);
  });

  it("answers nothing when the native module throws", () => {
    mockGetLocales.mockImplementation(() => {
      throw new Error("no native module");
    });
    expect(getDeviceLanguageTags()).toEqual([]);
  });

  it("applies the device language at launch", () => {
    mockGetLocales.mockReturnValue([{ languageTag: "es-MX" }]);
    applyDeviceLanguage();
    expect(getUiLocale()).toBe("es-MX");
    expect(t("tabs.settings")).toBe("Configuración");
  });
});

describe("picking a language", () => {
  it("switches the UI, sets the voice hint, persists, and tells the server", async () => {
    await rememberSpokenLanguage("en"); // learned earlier
    const push = jest.fn(async () => true);
    const heard = jest.fn();
    subscribeChosenLanguage(heard);

    await expect(chooseAppLanguage("pt", push)).resolves.toBe(true);

    expect(getUiLocale()).toBe("pt-BR");
    expect(t("tabs.settings")).not.toBe("Settings");
    expect(getChosenLanguage()).toBe("pt");
    expect(getSpokenLanguage()).toBe("pt");
    expect(languageHintArg()).toEqual({ languageHint: "pt" });
    expect(await AsyncStorage.getItem("vr.appLanguage")).toBe("pt");
    expect(push).toHaveBeenCalledWith("pt");
    expect(heard).toHaveBeenCalled();
  });

  it("an RTL pick keeps the English UI but still sets the voice", async () => {
    await chooseAppLanguage("ar");
    expect(getUiLocale()).toBe("en");
    expect(getSpokenLanguage()).toBe("ar");
  });

  it("Traditional Chinese: zh-Hant UI, voice zh, the pick stored by script", async () => {
    const push = jest.fn(async () => true);
    await chooseAppLanguage("zh-Hant", push);
    expect(getUiLocale()).toBe("zh-Hant");
    expect(getSpokenLanguage()).toBe("zh");
    expect(push).toHaveBeenCalledWith("zh");
    expect(await AsyncStorage.getItem("vr.appLanguage")).toBe("zh-Hant");
    expect(getChosenLanguage()).toBe("zh-Hant");
  });

  it("Norwegian (no) gets the nb UI and keeps its own voice code", async () => {
    await chooseAppLanguage("no");
    expect(getUiLocale()).toBe("nb");
    expect(getSpokenLanguage()).toBe("no");
  });

  it("refuses codes the wheel doesn't offer", async () => {
    await expect(chooseAppLanguage("xx")).resolves.toBe(false);
    expect(getChosenLanguage()).toBeNull();
  });

  it("survives a failing server push and failing storage", async () => {
    // Once per write that is attempted (the spoken hint, then the pick); the
    // storage mock is shared across tests, so no persistent rejection.
    jest
      .spyOn(AsyncStorage, "setItem")
      .mockRejectedValueOnce(new Error("disk"))
      .mockRejectedValueOnce(new Error("disk"));
    await expect(chooseAppLanguage("es", async () => Promise.reject(new Error("offline")))).resolves.toBe(true);
    expect(getUiLocale()).toBe("es-MX");
  });
});

describe("loading the stored pick", () => {
  it("applies it over the device language, once", async () => {
    await AsyncStorage.setItem("vr.appLanguage", "es");
    mockGetLocales.mockReturnValue([{ languageTag: "pt-BR" }]);
    expect(hasLoadedLanguage()).toBe(false);
    await expect(loadAppLanguage()).resolves.toBe("es");
    expect(hasLoadedLanguage()).toBe(true);
    expect(getUiLocale()).toBe("es-MX");
    await loadAppLanguage();
    expect(getChosenLanguage()).toBe("es");
  });

  it("uses the device language when nothing was picked, or the stored value is junk", async () => {
    await AsyncStorage.setItem("vr.appLanguage", "klingon");
    await expect(loadAppLanguage(["pt-BR"])).resolves.toBeNull();
    expect(getUiLocale()).toBe("pt-BR");
  });

  it("never throws when storage does", async () => {
    jest.spyOn(AsyncStorage, "getItem").mockRejectedValueOnce(new Error("disk"));
    await expect(loadAppLanguage([])).resolves.toBeNull();
    expect(getUiLocale()).toBe("en");
  });
});

describe("first-launch wheel", () => {
  it("never shows before the stored pick has been read (no flash)", () => {
    expect(shouldShowFirstLaunchWheel(false, null)).toBe(false);
  });

  it("shows on a fresh install's first launch", async () => {
    await loadAppLanguage(["pt-BR"]);
    expect(shouldShowFirstLaunchWheel(hasLoadedLanguage(), getChosenLanguage())).toBe(true);
  });

  it("shows once for an existing user updating without a saved choice, then never again", async () => {
    // An install from before the wheel: other state on disk, no language pick.
    await AsyncStorage.setItem("vr.spokenLang", "en");
    await AsyncStorage.setItem("@app_settings", JSON.stringify({ aiConsentAcceptedAt: 1 }));
    await loadAppLanguage(["en-US"]);
    expect(shouldShowFirstLaunchWheel(hasLoadedLanguage(), getChosenLanguage())).toBe(true);

    await chooseAppLanguage("en");
    expect(shouldShowFirstLaunchWheel(hasLoadedLanguage(), getChosenLanguage())).toBe(false);

    // Next launch: the saved choice suppresses it.
    __resetAppLanguageForTests();
    await loadAppLanguage(["en-US"]);
    expect(getChosenLanguage()).toBe("en");
    expect(shouldShowFirstLaunchWheel(hasLoadedLanguage(), getChosenLanguage())).toBe(false);
  });

  it("is suppressed by a saved choice", async () => {
    await AsyncStorage.setItem("vr.appLanguage", "pt");
    await loadAppLanguage([]);
    expect(shouldShowFirstLaunchWheel(hasLoadedLanguage(), getChosenLanguage())).toBe(false);
  });
});

describe("returning to Settings after a language change", () => {
  it("is a one-shot flag", () => {
    expect(consumeReturnToSettings()).toBe(false);
    markReturnToSettings();
    expect(consumeReturnToSettings()).toBe(true);
    expect(consumeReturnToSettings()).toBe(false);
  });
});
