import { getUiLocale, t } from "./i18n";

/**
 * Names for language codes, in the UI language, for the places the app names a
 * language: the recording overlay ("Listening in English"), the
 * unsupported-language card ("Remi doesn't speak Swedish yet", OLD-133), and
 * the language wheel's list of choices.
 *
 * The catalog (`language.name.*`) is the first choice, so names follow the UI
 * language. `Intl.DisplayNames` covers any other code, but Hermes may not ship
 * it. The English table below is the list of languages the app knows (the
 * language wheel offers exactly these). Anything else returns null, and the
 * caller decides what to say instead.
 */

const FALLBACK_NAMES: Record<string, string> = {
  ar: "Arabic",
  bn: "Bangla",
  cs: "Czech",
  da: "Danish",
  de: "German",
  el: "Greek",
  en: "English",
  es: "Spanish",
  fa: "Persian",
  fi: "Finnish",
  fr: "French",
  he: "Hebrew",
  hi: "Hindi",
  hu: "Hungarian",
  id: "Indonesian",
  it: "Italian",
  ja: "Japanese",
  ko: "Korean",
  ms: "Malay",
  nb: "Norwegian Bokmål",
  nl: "Dutch",
  no: "Norwegian",
  pl: "Polish",
  pt: "Portuguese",
  ro: "Romanian",
  ru: "Russian",
  sv: "Swedish",
  sw: "Swahili",
  th: "Thai",
  tl: "Tagalog",
  tr: "Turkish",
  uk: "Ukrainian",
  ur: "Urdu",
  vi: "Vietnamese",
  zh: "Chinese",
};

/** Every language the app knows, as ISO 639-1 codes (the wheel's choices). */
export const KNOWN_LANGUAGE_CODES: readonly string[] = Object.keys(FALLBACK_NAMES);

/** "sv" → "Swedish", "en-US" → "English". Null when the code is empty or unknown. */
export function languageName(code: string | undefined | null): string | null {
  if (typeof code !== "string") return null;
  const lang = code.trim().split(/[-_]/)[0].toLowerCase();
  if (!/^[a-z]{2,3}$/.test(lang)) return null;

  if (FALLBACK_NAMES[lang]) return t(`language.name.${lang}`);

  try {
    const DisplayNames = (Intl as any).DisplayNames;
    if (typeof DisplayNames === "function") {
      const name = new DisplayNames([getUiLocale()], { type: "language" }).of(lang);
      // An unknown code comes back as the code itself, which is not a name.
      if (typeof name === "string" && name && name.toLowerCase() !== lang) return name;
    }
  } catch {
    // An engine that cannot answer falls through to the table.
  }
  return null;
}

/**
 * The overlay's quiet label for the on-device engine's locale, as resolved by
 * `resolveVoiceLocale`: "en-US" → "Listening in English". Null when the locale
 * cannot be named, so the overlay shows nothing rather than a guess.
 */
export function listeningLabel(localeId: string): string | null {
  const name = languageName(localeId);
  return name ? t("recording.listeningIn", { language: name }) : null;
}
