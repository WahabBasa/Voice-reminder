/**
 * The languages Remi can speak a reminder's line in (OLD-130).
 *
 * The parse returns the ISO 639-1 code of what the user spoke (`lang` per
 * reminder, `language` for the take). The creation job's guard asks this
 * module whether that language can be voiced at all; a take in one that cannot
 * fails as `unsupported_language` instead of becoming a reminder whose line
 * would be read out by a voice that does not speak it.
 *
 * Pure: no Convex, no network. Safe to import from either runtime.
 */

/**
 * ISO 639-1 codes of the languages ElevenLabs' `eleven_v3` model supports.
 *
 * Source: ElevenLabs model overview, "Eleven v3 → Supported languages"
 * https://elevenlabs.io/docs/overview/models (read 2026-10-05). The page lists
 * 74 languages by ISO 639-3 code; each is mapped to its 639-1 code here.
 * Notes on the mapping:
 *   - Cebuano (ceb) has no 639-1 code, so it cannot appear in a parse and is
 *     left out.
 *   - Filipino (fil) has no 639-1 code of its own; "tl" (Tagalog, the language
 *     Filipino is standardized from) is what a model returns for it.
 *   - Norwegian (nor) is "no"; the two written standards "nb" / "nn" are
 *     listed too, since a model may answer with either.
 *   - Mandarin Chinese (cmn) is "zh".
 */
export const ELEVENLABS_V3_LANGS: readonly string[] = [
  "af", // Afrikaans
  "ar", // Arabic
  "hy", // Armenian
  "as", // Assamese
  "az", // Azerbaijani
  "be", // Belarusian
  "bn", // Bengali
  "bs", // Bosnian
  "bg", // Bulgarian
  "ca", // Catalan
  "ny", // Chichewa
  "hr", // Croatian
  "cs", // Czech
  "da", // Danish
  "nl", // Dutch
  "en", // English
  "et", // Estonian
  "tl", // Filipino
  "fi", // Finnish
  "fr", // French
  "gl", // Galician
  "ka", // Georgian
  "de", // German
  "el", // Greek
  "gu", // Gujarati
  "ha", // Hausa
  "he", // Hebrew
  "hi", // Hindi
  "hu", // Hungarian
  "is", // Icelandic
  "id", // Indonesian
  "ga", // Irish
  "it", // Italian
  "ja", // Japanese
  "jv", // Javanese
  "kn", // Kannada
  "kk", // Kazakh
  "ky", // Kirghiz
  "ko", // Korean
  "lv", // Latvian
  "ln", // Lingala
  "lt", // Lithuanian
  "lb", // Luxembourgish
  "mk", // Macedonian
  "ms", // Malay
  "ml", // Malayalam
  "zh", // Mandarin Chinese
  "mr", // Marathi
  "ne", // Nepali
  "no", // Norwegian
  "nb", // Norwegian Bokmål
  "nn", // Norwegian Nynorsk
  "ps", // Pashto
  "fa", // Persian
  "pl", // Polish
  "pt", // Portuguese
  "pa", // Punjabi
  "ro", // Romanian
  "ru", // Russian
  "sr", // Serbian
  "sd", // Sindhi
  "sk", // Slovak
  "sl", // Slovenian
  "so", // Somali
  "es", // Spanish
  "sw", // Swahili
  "sv", // Swedish
  "ta", // Tamil
  "te", // Telugu
  "th", // Thai
  "tr", // Turkish
  "uk", // Ukrainian
  "ur", // Urdu
  "vi", // Vietnamese
  "cy", // Welsh
];

const V3_SET = new Set(ELEVENLABS_V3_LANGS);

/**
 * A language code as the parse may hand it over ("EN", "en-US", "sv_SE"),
 * reduced to a lowercase ISO 639-1 code — or undefined when it is not one.
 */
export function normalizeLanguageCode(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const primary = value.trim().toLowerCase().split(/[-_]/)[0];
  return /^[a-z]{2}$/.test(primary) ? primary : undefined;
}

/**
 * Can a reminder line in `lang` be voiced? English and Arabic have their own
 * live routes; everything else needs `eleven_v3`. Anything that is not an
 * ISO 639-1 code is not a language this can vouch for.
 */
export function isSupportedLineLanguage(lang: unknown): boolean {
  const code = normalizeLanguageCode(lang);
  if (code === undefined) return false;
  return code === "en" || code === "ar" || V3_SET.has(code);
}
