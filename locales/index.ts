/**
 * The UI catalog registry. Each entry is one language the app's UI can be shown
 * in, keyed by its BCP 47 tag. `en` is the source catalog and the fallback for
 * any key or language that is missing.
 *
 * Adding a language (ships OTA, no native build):
 *   1. Drop the reviewed catalog in this folder, e.g. `locales/fr.json`. It must
 *      have exactly the keys of `en.json`, with the same {placeholders}
 *      (__tests__/lib/i18nCatalogs.test.ts checks this).
 *   2. Add one line below: `fr: require("./fr.json"),`
 * That's it: `lib/appLanguage.ts` maps any device or chosen language whose base
 * code matches (fr-CA, fr-FR → fr) onto it. A regional tag ("pt-BR") also
 * catches its bare language ("pt-PT" users get pt-BR until a pt-PT file lands).
 * Chinese goes by script (zh-Hans / zh-Hant), Norwegian "no" uses nb, and
 * Filipino "fil" uses tl.
 *
 * The permission prompts (Info.plist) are native and need a build: add
 * locales/ios/<tag>.json (from the catalog's infoPlist.* keys) and list it under
 * expo.locales and ios.infoPlist.CFBundleLocalizations in app.json.
 */

export type Catalog = Readonly<Record<string, string>>;

/* eslint-disable @typescript-eslint/no-var-requires */
export const UI_CATALOGS: Readonly<Record<string, Catalog>> = {
  en: require("./en.json"),
  "pt-BR": require("./pt-BR.json"),
  "es-MX": require("./es-MX.json"),
  fr: require("./fr.json"),
  de: require("./de.json"),
  it: require("./it.json"),
  nl: require("./nl.json"),
  sv: require("./sv.json"),
  da: require("./da.json"),
  nb: require("./nb.json"),
  fi: require("./fi.json"),
  pl: require("./pl.json"),
  cs: require("./cs.json"),
  ru: require("./ru.json"),
  uk: require("./uk.json"),
  ro: require("./ro.json"),
  hu: require("./hu.json"),
  el: require("./el.json"),
  tr: require("./tr.json"),
  hi: require("./hi.json"),
  bn: require("./bn.json"),
  sw: require("./sw.json"),
  tl: require("./tl.json"),
  ja: require("./ja.json"),
  ko: require("./ko.json"),
  "zh-Hans": require("./zh-Hans.json"),
  "zh-Hant": require("./zh-Hant.json"),
  vi: require("./vi.json"),
  th: require("./th.json"),
  id: require("./id.json"),
  ms: require("./ms.json"),
};
/* eslint-enable @typescript-eslint/no-var-requires */

/** The source catalog: its keys are the full key set. */
export const SOURCE_LOCALE = "en";
