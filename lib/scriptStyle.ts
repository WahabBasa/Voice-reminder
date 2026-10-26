/**
 * Text-style fixes for the UI language's script.
 *
 * Arabic, Persian and Urdu letters join; any letterSpacing (tracking) pulls
 * them apart on iOS, so a tracked header would read as loose letters. Spread
 * `joinedScriptText()` after a style with letterSpacing: it turns tracking off
 * under those catalogs and is a no-op (null) for every other language, so
 * their layout is unchanged. Read at render: a language change remounts the
 * screens (app/_layout keys the Stack on the locale).
 */
import { getUiLocale } from "./i18n";

const JOINED_SCRIPT_LOCALES: readonly string[] = ["ar", "fa", "ur"];

const NO_TRACKING = { letterSpacing: 0 } as const;

export function joinedScriptText(locale: string = getUiLocale()): typeof NO_TRACKING | null {
  return JOINED_SCRIPT_LOCALES.includes(locale.split("-")[0]) ? NO_TRACKING : null;
}

/**
 * How much taller a line must be for the UI language's script than the
 * Latin-tuned lineHeights in the styles (applied app-wide by
 * lib/textDefaults.ts). Urdu's Nastaliq is by far the tallest; Arabic,
 * Persian and Thai stack marks above and below; Devanagari and Bengali carry
 * a headline and vowel signs. 1 = unchanged (every other language).
 */
const LINE_HEIGHT_SCALE: Readonly<Record<string, number>> = {
  ur: 1.5,
  ar: 1.15,
  fa: 1.15,
  th: 1.2,
  hi: 1.1,
  bn: 1.1,
};

export function lineHeightScaleFor(locale: string = getUiLocale()): number {
  return LINE_HEIGHT_SCALE[locale.split("-")[0]] ?? 1;
}
