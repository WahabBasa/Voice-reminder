/**
 * Tracking pulls joined Arabic-script letters apart, so it is off under the
 * ar/fa/ur catalogs and untouched (null) everywhere else.
 */
import { joinedScriptText } from "../../lib/scriptStyle";
import { __resetUiLocaleForTests, setUiLocale } from "../../lib/i18n";

afterEach(() => __resetUiLocaleForTests());

it("turns tracking off for the joined scripts", () => {
  for (const tag of ["ar", "fa", "ur"]) expect(joinedScriptText(tag)).toEqual({ letterSpacing: 0 });
});

it("leaves every other language, Hebrew included, as styled", () => {
  for (const tag of ["en", "he", "pt-BR", "zh-Hant", "hi"]) expect(joinedScriptText(tag)).toBeNull();
});

it("follows the UI language by default", () => {
  expect(joinedScriptText()).toBeNull();
  setUiLocale("ar");
  expect(joinedScriptText()).toEqual({ letterSpacing: 0 });
});
