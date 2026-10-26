/**
 * App-wide <Text> defaults, read by our patch to react-native's Text.js
 * (patches/react-native+0.81.5.patch) from `global.__VR_TEXT_DEFAULTS`:
 *
 *   - maxFontSizeMultiplier: Remi follows the iPhone's text size (Dynamic
 *     Type) but caps it at TEXT_MAX_FONT_SCALE, so layouts hold at the largest
 *     standard size; Accessibility "Larger Text" sizes beyond the cap stay
 *     capped. Dense controls (pills, chips, tab-like labels) pass the tighter
 *     DENSE_MAX_FONT_SCALE themselves.
 *   - startAlign: under an RTL layout, text without an explicit alignment is
 *     aligned to the start (right). iOS "natural" alignment follows the app's
 *     iOS language, which stays English on an English iPhone even when Remi is
 *     in Arabic.
 *   - lineHeightScale: tall scripts (Urdu Nastaliq above all) clip inside
 *     line heights tuned for Latin; explicit lineHeights are scaled up for
 *     those UI languages only.
 *
 * Neutral for Latin LTR at the default text size: nothing changes there.
 */
import { isLayoutRTL } from "./layoutDirection";
import { getUiLocale, subscribeUiLocale } from "./i18n";
import { lineHeightScaleFor } from "./scriptStyle";

/** Cap on the iPhone text-size multiplier for ordinary text. */
export const TEXT_MAX_FONT_SCALE = 1.4;
/** Tighter cap for dense one-line controls (pills, chips, small buttons). */
export const DENSE_MAX_FONT_SCALE = 1.2;

export type TextDefaults = {
  maxFontSizeMultiplier: number;
  startAlign: boolean;
  lineHeightScale: number;
};

export function textDefaultsFor(locale: string, rtl: boolean): TextDefaults {
  return {
    maxFontSizeMultiplier: TEXT_MAX_FONT_SCALE,
    startAlign: rtl,
    lineHeightScale: lineHeightScaleFor(locale),
  };
}

function apply(): void {
  (globalThis as any).__VR_TEXT_DEFAULTS = textDefaultsFor(getUiLocale(), isLayoutRTL());
}

let installed = false;

/** Install once, at startup; follows UI-language changes after that. */
export function installTextDefaults(): void {
  apply();
  if (installed) return;
  installed = true;
  // A language switch remounts the screens, which re-reads the defaults.
  subscribeUiLocale(apply);
}

export function getTextDefaults(): TextDefaults | undefined {
  return (globalThis as any).__VR_TEXT_DEFAULTS;
}

/**
 * TextInputs aren't covered by the Text patch: under RTL they need the same
 * explicit start alignment. Null otherwise (no change).
 */
export function inputDirectionStyle(): { textAlign: "left" } | null {
  return getTextDefaults()?.startAlign ? { textAlign: "left" } : null;
}
