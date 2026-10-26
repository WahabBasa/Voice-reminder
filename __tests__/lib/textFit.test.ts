/**
 * Items that keep text readable in every language: pseudo-localization (dev),
 * text defaults (Dynamic Type cap, RTL start alignment, tall-script line
 * heights), and the side-by-side button stacking check.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  __resetUiLocaleForTests,
  isPseudoLocalization,
  pseudoLocalize,
  setPseudoLocalization,
  setUiLocale,
  t,
} from "../../lib/i18n";
import {
  loadPseudoLocalization,
  pseudoLocalizationAvailable,
  togglePseudoLocalization,
} from "../../lib/pseudoLocale";
import {
  DENSE_MAX_FONT_SCALE,
  TEXT_MAX_FONT_SCALE,
  getTextDefaults,
  inputDirectionStyle,
  installTextDefaults,
  textDefaultsFor,
} from "../../lib/textDefaults";
import { lineHeightScaleFor } from "../../lib/scriptStyle";
import { labelWrapped } from "../../lib/useStackWhenWrapped";

beforeEach(() => {
  (AsyncStorage as any)._reset();
  __resetUiLocaleForTests();
});
afterAll(() => __resetUiLocaleForTests());

describe("pseudo-localization", () => {
  it("accents, expands ~40% and brackets", () => {
    const out = pseudoLocalize("Remind me");
    expect(out.startsWith("[Ŕéḿíńď ḿé ")).toBe(true);
    expect(out.endsWith("]")).toBe(true);
    expect(out.length).toBeGreaterThanOrEqual(Math.ceil("Remind me".length * 1.4));
  });

  it("keeps rich-text tags and leaves digits and empty strings alone", () => {
    expect(pseudoLocalize("Read our <link>Privacy</link>")).toContain("<link>Ƥŕíṽáçý</link>");
    expect(pseudoLocalize("10:30")).toContain("10:30");
    expect(pseudoLocalize("")).toBe("");
  });

  it("t() follows the switch", () => {
    expect(t("common.cancel")).toBe("Cancel");
    setPseudoLocalization(true);
    expect(isPseudoLocalization()).toBe(true);
    expect(t("common.cancel")).toMatch(/^\[Çáńçéĺ ~+\]$/);
    setPseudoLocalization(false);
    expect(t("common.cancel")).toBe("Cancel");
  });

  it("is offered in development and on the development channel only", () => {
    expect(pseudoLocalizationAvailable(true, null)).toBe(true);
    expect(pseudoLocalizationAvailable(false, "development")).toBe(true);
    expect(pseudoLocalizationAvailable(false, "production")).toBe(false);
    expect(pseudoLocalizationAvailable(false, null)).toBe(false);
  });

  it("toggles and persists where offered; inert in production", async () => {
    await expect(togglePseudoLocalization(false)).resolves.toBe(false);
    expect(isPseudoLocalization()).toBe(false);

    await expect(togglePseudoLocalization(true)).resolves.toBe(true);
    __resetUiLocaleForTests();
    await loadPseudoLocalization(false); // production ignores the stored value
    expect(isPseudoLocalization()).toBe(false);
    await loadPseudoLocalization(true);
    expect(isPseudoLocalization()).toBe(true);
  });
});

describe("text defaults", () => {
  it("cap the iPhone text size; dense controls cap tighter", () => {
    expect(TEXT_MAX_FONT_SCALE).toBeGreaterThanOrEqual(1.3);
    expect(TEXT_MAX_FONT_SCALE).toBeLessThanOrEqual(1.5);
    expect(DENSE_MAX_FONT_SCALE).toBeLessThan(TEXT_MAX_FONT_SCALE);
  });

  it("are neutral for Latin LTR apart from the cap", () => {
    expect(textDefaultsFor("en", false)).toEqual({
      maxFontSizeMultiplier: TEXT_MAX_FONT_SCALE,
      startAlign: false,
      lineHeightScale: 1,
    });
  });

  it("follow the UI language once installed", () => {
    installTextDefaults();
    expect(getTextDefaults()?.lineHeightScale).toBe(1);
    setUiLocale("ur");
    expect(getTextDefaults()?.lineHeightScale).toBe(1.5);
    setUiLocale("en");
    expect(getTextDefaults()?.lineHeightScale).toBe(1);
  });

  it("text inputs get start alignment only under RTL", () => {
    (globalThis as any).__VR_TEXT_DEFAULTS = textDefaultsFor("he", true);
    expect(inputDirectionStyle()).toEqual({ textAlign: "left" });
    (globalThis as any).__VR_TEXT_DEFAULTS = textDefaultsFor("en", false);
    expect(inputDirectionStyle()).toBeNull();
  });

  it("tall scripts get taller lines: Urdu most", () => {
    expect(lineHeightScaleFor("ur")).toBeGreaterThan(lineHeightScaleFor("ar"));
    for (const tag of ["ar", "fa", "th", "hi", "bn"]) expect(lineHeightScaleFor(tag)).toBeGreaterThan(1);
    for (const tag of ["en", "de", "he", "zh-Hans", "ru"]) expect(lineHeightScaleFor(tag)).toBe(1);
  });
});

describe("side-by-side buttons", () => {
  const layout = (lines: number) => ({ nativeEvent: { lines: new Array(lines).fill({}) } }) as any;

  it("stack once a label needs a second line", () => {
    expect(labelWrapped(layout(1))).toBe(false);
    expect(labelWrapped(layout(2))).toBe(true);
    expect(labelWrapped({} as any)).toBe(false);
  });
});
