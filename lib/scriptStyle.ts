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
