/**
 * The languages Remi can speak a reminder's line in (OLD-130).
 *
 * The parse returns the ISO 639-1 code of what the user spoke (`lang` per
 * reminder, `language` for the take). The creation job's guard asks this
 * module whether that language can be voiced at all; a take in one that cannot
 * fails as `unsupported_language` instead of becoming a reminder whose line
 * would be read out by a voice that does not speak it.
 *
 * Every line is voiced by Speechify (2026-10-06: ElevenLabs is no longer
 * used, see convex/actions.ts pickVoiceRoute). This table is therefore
 * Speechify's own language list, not a wish list.
 *
 * Pure: no Convex, no network. Safe to import from either runtime.
 */

/** Which Speechify model a non-English, non-Arabic line goes to. */
export type SpeechifyLineTier = "simba-3.0" | "multilingual";

/** The locale sent as Speechify's `language` param, and the model tier. */
export type SpeechifyLineLanguage = { locale: string; tier: SpeechifyLineTier };

/**
 * Every language other than English and Arabic that Speechify voices, keyed by
 * ISO 639-1 code.
 *
 * Source: Speechify "Language Support" https://docs.speechify.ai/docs/language-support
 * and the workspace's own `GET /v1/audio/models` (both read 2026-10-06):
 *   - `simba-3.0` officially supports en, de-DE, es-ES / es-MX, fr-FR, it-IT,
 *     pt-BR. It is the API default and is not retiring, so those five
 *     languages go to it.
 *   - `simba-multilingual` covers the "fully supported" and "beta" locales
 *     below. It is retired for new workspaces (400 model_retired from API
 *     version 2026-09-21); ours is pinned below that version, and from
 *     2026-11-21 the id keeps answering, served by Speechify's current
 *     multilingual model "in every language you send it today"
 *     (https://docs.speechify.ai/build/changelog/2026/9/21).
 *
 * Left out on purpose:
 *   - Speechify's "coming soon" locales (bg, ca, cs, fa, hr, hu, id, ms, ro,
 *     sk, sr, th, zh-CN Mandarin and others): not voiceable yet.
 *   - Cantonese (yue-CN): it has no ISO 639-1 code of its own, and "zh" would
 *     also claim Mandarin, which is only "coming soon".
 *   - Norwegian Nynorsk ("nn"): Speechify ships Bokmål (nb-NO) only.
 *   - Swahili ("sw"): a live call with `language: sw-KE` returned 200 on
 *     2026-10-06, but Speechify lists no Swahili locale, so nothing vouches
 *     for what came back.
 * Verified live on 2026-10-06 (all 200, pcm_22050, Beatrice): sv-SE, he-IL,
 * ja-JP, hi-IN and de-DE on simba-multilingual, de-DE on simba-3.0
 * (outputs/speechify-check/).
 */
export const SPEECHIFY_LINE_LANGUAGES: Readonly<Record<string, SpeechifyLineLanguage>> = {
  // simba-3.0's official locales.
  de: { locale: "de-DE", tier: "simba-3.0" }, // German
  es: { locale: "es-MX", tier: "simba-3.0" }, // Spanish (es-ES / es-MX voices are interchangeable)
  fr: { locale: "fr-FR", tier: "simba-3.0" }, // French
  it: { locale: "it-IT", tier: "simba-3.0" }, // Italian
  pt: { locale: "pt-BR", tier: "simba-3.0" }, // Portuguese
  // simba-multilingual: its fully supported and beta locales.
  bn: { locale: "bn-IN", tier: "multilingual" }, // Bengali
  da: { locale: "da-DK", tier: "multilingual" }, // Danish
  nl: { locale: "nl-NL", tier: "multilingual" }, // Dutch
  et: { locale: "et-EE", tier: "multilingual" }, // Estonian
  fi: { locale: "fi-FI", tier: "multilingual" }, // Finnish
  el: { locale: "el-GR", tier: "multilingual" }, // Greek
  gu: { locale: "gu-IN", tier: "multilingual" }, // Gujarati
  he: { locale: "he-IL", tier: "multilingual" }, // Hebrew
  hi: { locale: "hi-IN", tier: "multilingual" }, // Hindi
  ja: { locale: "ja-JP", tier: "multilingual" }, // Japanese
  ko: { locale: "ko-KR", tier: "multilingual" }, // Korean
  mr: { locale: "mr-IN", tier: "multilingual" }, // Marathi
  no: { locale: "nb-NO", tier: "multilingual" }, // Norwegian
  nb: { locale: "nb-NO", tier: "multilingual" }, // Norwegian Bokmål
  pl: { locale: "pl-PL", tier: "multilingual" }, // Polish
  ru: { locale: "ru-RU", tier: "multilingual" }, // Russian
  sv: { locale: "sv-SE", tier: "multilingual" }, // Swedish
  ta: { locale: "ta-IN", tier: "multilingual" }, // Tamil
  te: { locale: "te-IN", tier: "multilingual" }, // Telugu
  tr: { locale: "tr-TR", tier: "multilingual" }, // Turkish
  uk: { locale: "uk-UA", tier: "multilingual" }, // Ukrainian
  ur: { locale: "ur-IN", tier: "multilingual" }, // Urdu
  vi: { locale: "vi-VN", tier: "multilingual" }, // Vietnamese
};

/** Every ISO 639-1 code a line can be voiced in: English, Arabic and the table above. */
export const SUPPORTED_LINE_LANGS: readonly string[] = [
  "en",
  "ar",
  ...Object.keys(SPEECHIFY_LINE_LANGUAGES),
];

const SUPPORTED_SET = new Set(SUPPORTED_LINE_LANGS);

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
 * live routes; everything else needs an entry in SPEECHIFY_LINE_LANGUAGES.
 * Anything that is not an ISO 639-1 code is not a language this can vouch for.
 */
export function isSupportedLineLanguage(lang: unknown): boolean {
  const code = normalizeLanguageCode(lang);
  if (code === undefined) return false;
  return SUPPORTED_SET.has(code);
}

/**
 * The Speechify locale and model tier for a line in `lang`, or undefined when
 * the line keeps the English / Arabic route: English, Arabic, a missing code,
 * or a code Speechify does not voice.
 */
export function speechifyLineLanguage(lang: unknown): SpeechifyLineLanguage | undefined {
  const code = normalizeLanguageCode(lang);
  if (code === undefined) return undefined;
  return Object.prototype.hasOwnProperty.call(SPEECHIFY_LINE_LANGUAGES, code)
    ? SPEECHIFY_LINE_LANGUAGES[code]
    : undefined;
}

/**
 * Does a line in `lang` need a non-English voice route (OLD-131)?
 *
 * True only for a code in SPEECHIFY_LINE_LANGUAGES. English, and a missing
 * code (every row written before OLD-130, and any parse that left it out),
 * stay on the English voice. Arabic keeps its own route, picked from the
 * line's script. Anything else is not a language Speechify voices: it cannot
 * reach a reminder past the guard, and if it ever did it falls back to the
 * English route rather than to a voice never vetted for it.
 */
export function needsMultilingualVoice(lang: unknown): boolean {
  return speechifyLineLanguage(lang) !== undefined;
}
