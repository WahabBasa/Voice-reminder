import AsyncStorage from "@react-native-async-storage/async-storage";
import { api } from "../convex/_generated/api";

/**
 * The language this install's user speaks in (OLD-140), as the server learned
 * it from the takes it understood (convex/spokenLang.ts).
 *
 * It arrives two ways: in the launch check-in's answer (`devices.hello`, see
 * ./deviceHello.ts) and from a live watch on `devices.preferences`, so a
 * language learned from this session's first take is already here for the
 * second. It is kept in memory for the synchronous readers (the stop-tap, the
 * overlay label) and in AsyncStorage so the next launch starts with it.
 *
 * What reads it:
 *   - ./deviceStt.ts `resolveVoiceLocale`: the on-device recognizer listens in
 *     it (sv → sv-SE), or the take goes straight to the cloud when the phone
 *     cannot listen in it on-device;
 *   - every `begin` / `retry`: sent as `languageHint` for the cloud transcriber.
 *
 * Nothing here ever throws: a missing value means today's behaviour.
 */

const STORAGE_KEY = "vr.spokenLang";

/**
 * The on-device recognizer locale for a spoken language. Apple installs assets
 * per locale, so each language gets the region its assets most commonly ship
 * for. A language missing here is asked for by its bare code, and the native
 * status check decides whether the phone has it.
 */
export const ON_DEVICE_LOCALES: Readonly<Record<string, string>> = {
  ar: "ar-SA",
  ca: "ca-ES",
  cs: "cs-CZ",
  da: "da-DK",
  de: "de-DE",
  el: "el-GR",
  en: "en-US",
  es: "es-ES",
  fi: "fi-FI",
  fr: "fr-FR",
  he: "he-IL",
  hi: "hi-IN",
  hr: "hr-HR",
  hu: "hu-HU",
  id: "id-ID",
  it: "it-IT",
  ja: "ja-JP",
  ko: "ko-KR",
  ms: "ms-MY",
  nb: "nb-NO",
  nl: "nl-NL",
  no: "nb-NO",
  pl: "pl-PL",
  pt: "pt-BR",
  ro: "ro-RO",
  ru: "ru-RU",
  sk: "sk-SK",
  sv: "sv-SE",
  th: "th-TH",
  tr: "tr-TR",
  uk: "uk-UA",
  vi: "vi-VN",
  zh: "zh-CN",
};

/** An ISO 639-1 code ("sv"), or null for anything else. */
export function normalizeSpokenLang(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const code = value.trim().toLowerCase().split(/[-_]/)[0];
  return /^[a-z]{2}$/.test(code) ? code : null;
}

/** "sv" → "sv-SE"; an unlisted code is asked for as itself. */
export function onDeviceLocaleFor(lang: string): string {
  return ON_DEVICE_LOCALES[lang] ?? lang;
}

let current: string | null = null;
let loading: Promise<string | null> | null = null;

/** The learned language, synchronously. Null until known (or loaded). */
export function getSpokenLanguage(): string | null {
  return current;
}

/** What `begin` / `retry` spread in: the hint when known, nothing otherwise. */
export function languageHintArg(): { languageHint?: string } {
  return current ? { languageHint: current } : {};
}

/**
 * Read the stored language into memory, once. A value that arrived from the
 * server while the read was in flight wins over the stored one.
 */
export function loadSpokenLanguage(): Promise<string | null> {
  if (!loading) {
    loading = (async () => {
      try {
        const stored = normalizeSpokenLang(await AsyncStorage.getItem(STORAGE_KEY));
        if (current === null && stored) current = stored;
      } catch {
        // No storage: the server's answer fills it in later.
      }
      return current;
    })();
  }
  return loading;
}

/**
 * Keep a language the server sent. Anything that is not a language code is
 * ignored, so an absent value never clears a known one.
 */
export async function rememberSpokenLanguage(value: unknown): Promise<void> {
  const lang = normalizeSpokenLang(value);
  if (!lang || lang === current) return;
  current = lang;
  try {
    await AsyncStorage.setItem(STORAGE_KEY, lang);
  } catch {
    // Memory still has it for this launch.
  }
}

/** `spokenLang` off a `hello` / `preferences` answer, if it carries one. */
export function spokenLangFromResponse(response: unknown): string | null {
  if (!response || typeof response !== "object") return null;
  return normalizeSpokenLang((response as { spokenLang?: unknown }).spokenLang);
}

/** The one ConvexReactClient method the live watch needs. */
export type PreferencesWatchClient = {
  watchQuery: (
    ref: typeof api.devices.preferences,
    args: { deviceId: string }
  ) => {
    onUpdate: (callback: () => void) => () => void;
    localQueryResult: () => unknown;
  };
};

/**
 * Load the stored language, then watch `devices.preferences` for the server's
 * and keep whatever it says. Returns the unsubscribe. Never throws.
 */
export function startSpokenLanguageSync(
  client: PreferencesWatchClient,
  getDeviceId: () => Promise<string>
): () => void {
  let stopped = false;
  let unsubscribe: (() => void) | null = null;

  void (async () => {
    await loadSpokenLanguage();
    try {
      const deviceId = await getDeviceId();
      if (stopped) return;
      const watch = client.watchQuery(api.devices.preferences, { deviceId });
      const apply = () => {
        try {
          void rememberSpokenLanguage(spokenLangFromResponse(watch.localQueryResult()));
        } catch {
          // A query error leaves the known language in place.
        }
      };
      unsubscribe = watch.onUpdate(apply);
      apply();
    } catch (e) {
      console.log("[VR] spokenLanguage: watch failed (ignored):", e);
    }
  })();

  return () => {
    stopped = true;
    unsubscribe?.();
  };
}

/** Test seam: forget everything this module holds. */
export function __resetSpokenLanguageForTests(): void {
  current = null;
  loading = null;
}
