/**
 * The device's learned spoken language on the phone (OLD-140,
 * lib/spokenLanguage.ts): kept in memory and on disk, never cleared by an
 * absent value, spread into begin/retry as `languageHint`, and watched live.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import { api } from "../../convex/_generated/api";
import {
  ON_DEVICE_LOCALES,
  __resetSpokenLanguageForTests,
  getSpokenLanguage,
  languageHintArg,
  loadSpokenLanguage,
  normalizeSpokenLang,
  onDeviceLocaleFor,
  rememberSpokenLanguage,
  spokenLangFromResponse,
  startSpokenLanguageSync,
  type PreferencesWatchClient,
} from "../../lib/spokenLanguage";

const KEY = "vr.spokenLang";

beforeEach(() => {
  (AsyncStorage as any)._reset();
  __resetSpokenLanguageForTests();
});

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("codes and locales", () => {
  it("normalizes to a two-letter code or null", () => {
    expect(normalizeSpokenLang("sv")).toBe("sv");
    expect(normalizeSpokenLang(" SV-se ")).toBe("sv");
    expect(normalizeSpokenLang("he_IL")).toBe("he");
    expect(normalizeSpokenLang("swedish")).toBeNull();
    expect(normalizeSpokenLang("")).toBeNull();
    expect(normalizeSpokenLang(undefined)).toBeNull();
    expect(normalizeSpokenLang(42)).toBeNull();
  });

  it("maps a language to its on-device recognizer locale", () => {
    expect(onDeviceLocaleFor("sv")).toBe("sv-SE");
    expect(onDeviceLocaleFor("he")).toBe("he-IL");
    expect(onDeviceLocaleFor("de")).toBe("de-DE");
    expect(onDeviceLocaleFor("ar")).toBe("ar-SA");
    expect(onDeviceLocaleFor("en")).toBe("en-US");
    // Unlisted: asked for by its bare code, the status check decides.
    expect(onDeviceLocaleFor("sw")).toBe("sw");
    for (const [lang, locale] of Object.entries(ON_DEVICE_LOCALES)) {
      expect(locale).toMatch(/^[a-z]{2}-[A-Z]{2}$/);
      expect(lang).toMatch(/^[a-z]{2}$/);
    }
  });

  it("reads spokenLang off a server answer", () => {
    expect(spokenLangFromResponse({ result: "updated", spokenLang: "sv" })).toBe("sv");
    expect(spokenLangFromResponse({ result: "new" })).toBeNull();
    expect(spokenLangFromResponse(null)).toBeNull();
    expect(spokenLangFromResponse("sv")).toBeNull();
  });
});

describe("memory and disk", () => {
  it("starts unknown, with no hint", () => {
    expect(getSpokenLanguage()).toBeNull();
    expect(languageHintArg()).toEqual({});
  });

  it("remembers a language in memory and on disk, and hints it", async () => {
    await rememberSpokenLanguage("sv");
    expect(getSpokenLanguage()).toBe("sv");
    expect(languageHintArg()).toEqual({ languageHint: "sv" });
    expect(await AsyncStorage.getItem(KEY)).toBe("sv");
  });

  it("never clears a known language on an absent or bogus value", async () => {
    await rememberSpokenLanguage("he");
    await rememberSpokenLanguage(undefined);
    await rememberSpokenLanguage("nonsense");
    expect(getSpokenLanguage()).toBe("he");
  });

  it("does not rewrite the same language", async () => {
    await rememberSpokenLanguage("sv");
    const set = jest.spyOn(AsyncStorage, "setItem");
    set.mockClear();
    await rememberSpokenLanguage("sv");
    expect(set).not.toHaveBeenCalled();
  });

  it("keeps the language in memory when the disk write fails", async () => {
    jest.spyOn(AsyncStorage, "setItem").mockRejectedValueOnce(new Error("disk full"));
    await rememberSpokenLanguage("de");
    expect(getSpokenLanguage()).toBe("de");
  });

  it("loads the stored language once", async () => {
    await AsyncStorage.setItem(KEY, "he");
    const get = jest.spyOn(AsyncStorage, "getItem");
    get.mockClear();
    expect(await loadSpokenLanguage()).toBe("he");
    expect(await loadSpokenLanguage()).toBe("he");
    expect(get).toHaveBeenCalledTimes(1);
    expect(getSpokenLanguage()).toBe("he");
  });

  it("lets a server value that arrived first win over the stored one", async () => {
    await AsyncStorage.setItem(KEY, "he");
    await rememberSpokenLanguage("sv");
    expect(await loadSpokenLanguage()).toBe("sv");
  });

  it("ignores a stored value that is not a code, and a failed read", async () => {
    await AsyncStorage.setItem(KEY, "garbage!");
    expect(await loadSpokenLanguage()).toBeNull();

    __resetSpokenLanguageForTests();
    jest.spyOn(AsyncStorage, "getItem").mockRejectedValueOnce(new Error("no storage"));
    expect(await loadSpokenLanguage()).toBeNull();
  });
});

describe("startSpokenLanguageSync", () => {
  function fakeClient(initial: unknown) {
    let result: unknown = initial;
    let listener: (() => void) | null = null;
    const unsubscribe = jest.fn();
    const watchQuery = jest.fn(() => ({
      onUpdate: (cb: () => void) => {
        listener = cb;
        return unsubscribe;
      },
      localQueryResult: () => {
        if (result instanceof Error) throw result;
        return result;
      },
    }));
    return {
      client: { watchQuery } as unknown as PreferencesWatchClient,
      watchQuery,
      unsubscribe,
      push(next: unknown) {
        result = next;
        listener?.();
      },
    };
  }

  it("loads from disk, then keeps what the server says, live", async () => {
    await AsyncStorage.setItem(KEY, "en");
    const fake = fakeClient(undefined); // not loaded yet
    const stop = startSpokenLanguageSync(fake.client, async () => "dev_1");
    await flush();
    expect(fake.watchQuery).toHaveBeenCalledWith(api.devices.preferences, { deviceId: "dev_1" });
    expect(getSpokenLanguage()).toBe("en");

    fake.push({ spokenLang: "sv" });
    await flush();
    expect(getSpokenLanguage()).toBe("sv");
    expect(await AsyncStorage.getItem(KEY)).toBe("sv");

    // A query error leaves it alone.
    fake.push(new Error("offline"));
    await flush();
    expect(getSpokenLanguage()).toBe("sv");

    stop();
    expect(fake.unsubscribe).toHaveBeenCalled();
  });

  it("applies a result that is already there when the watch starts", async () => {
    const fake = fakeClient({ spokenLang: "he" });
    startSpokenLanguageSync(fake.client, async () => "dev_1");
    await flush();
    await flush();
    expect(getSpokenLanguage()).toBe("he");
  });

  it("never subscribes when stopped before the deviceId arrives", async () => {
    const fake = fakeClient({ spokenLang: "he" });
    const stop = startSpokenLanguageSync(fake.client, async () => "dev_1");
    stop();
    await flush();
    expect(fake.watchQuery).not.toHaveBeenCalled();
  });

  it("swallows a failure to start the watch", async () => {
    const fake = fakeClient(undefined);
    const stop = startSpokenLanguageSync(fake.client, async () => {
      throw new Error("no keychain");
    });
    await flush();
    expect(fake.watchQuery).not.toHaveBeenCalled();
    expect(() => stop()).not.toThrow();
  });
});
