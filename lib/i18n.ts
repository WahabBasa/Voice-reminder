/**
 * The app's UI translation runtime: i18next + ICU message syntax, catalogs from
 * locales/ (bundled JS, so every string ships OTA).
 *
 * `t(key, params)` is a plain module-level function, usable from lib/ pure
 * functions and components alike. English is the default and the fallback for
 * any missing key or language, so a test that asserts English output keeps
 * passing without setup.
 *
 * Which language is shown is decided in ./appLanguage.ts; this module only
 * holds the current one and tells subscribers when it changes
 * (`useUiLocale`), which the root layout uses to re-render the tree.
 */
import "./intlPolyfills";
import { useSyncExternalStore } from "react";
import i18next from "i18next";
import ICU from "i18next-icu";
import { SOURCE_LOCALE, UI_CATALOGS } from "../locales";

export type TParams = Record<string, string | number>;

/**
 * Last-resort formatter for when ICU parsing/formatting throws on an engine
 * that lacks some Intl piece: fills `{name}` and picks the `one`/`other`
 * branch of a plural by hand, so the user sees a sentence and never raw ICU.
 */
export function fallbackFormat(message: string, params: TParams = {}): string {
  let out = "";
  let i = 0;
  while (i < message.length) {
    const open = message.indexOf("{", i);
    if (open < 0) {
      out += message.slice(i);
      break;
    }
    out += message.slice(i, open);
    // Find the matching close brace.
    let depth = 0;
    let close = open;
    for (; close < message.length; close++) {
      if (message[close] === "{") depth++;
      else if (message[close] === "}" && --depth === 0) break;
    }
    const body = message.slice(open + 1, close);
    const comma = body.indexOf(",");
    if (comma < 0) {
      const name = body.trim();
      out += name in params ? String(params[name]) : `{${name}}`;
    } else {
      const name = body.slice(0, comma).trim();
      const value = Number(params[name]);
      const rest = body.slice(body.indexOf(",", comma + 1) + 1);
      const branches: Record<string, string> = {};
      const re = /\s*(=?\w+)\s*\{/g;
      let m: RegExpExecArray | null;
      while ((m = re.exec(rest))) {
        let d = 1;
        let j = re.lastIndex;
        for (; j < rest.length && d > 0; j++) {
          if (rest[j] === "{") d++;
          else if (rest[j] === "}") d--;
        }
        branches[m[1]] = rest.slice(re.lastIndex, j - 1);
        re.lastIndex = j;
      }
      const pick =
        branches[`=${value}`] ?? (value === 1 ? branches.one : undefined) ?? branches.other ?? "";
      out += fallbackFormat(pick.replace(/#/g, String(params[name] ?? "")), params);
    }
    i = close + 1;
  }
  return out;
}

const resources = Object.fromEntries(
  Object.entries(UI_CATALOGS).map(([tag, catalog]) => [tag, { translation: catalog }])
);

const instance = i18next.createInstance();
void instance.use(ICU).init({
  lng: SOURCE_LOCALE,
  fallbackLng: SOURCE_LOCALE,
  supportedLngs: Object.keys(UI_CATALOGS),
  // "pt-BR" must stay "pt-BR", not be cut down to "pt".
  load: "currentOnly",
  resources,
  initAsync: false,
  keySeparator: false,
  nsSeparator: false,
  returnNull: false,
  interpolation: { escapeValue: false },
  i18nFormat: {
    parseErrorHandler: (_err: unknown, _key: string, res: string, options: TParams) =>
      fallbackFormat(res, options),
  },
});

/** The translated string for `key`, English when the current catalog lacks it. */
export function t(key: string, params?: TParams): string {
  return instance.t(key, params as any) as unknown as string;
}

let uiLocale: string = SOURCE_LOCALE;
const listeners = new Set<() => void>();

/** The UI catalog in use ("en", "pt-BR", …). Also the locale for Intl formatting. */
export function getUiLocale(): string {
  return uiLocale;
}

/**
 * The locale for `toLocale*String` calls: the device's own ("default") under
 * the English UI, as before; the UI language's otherwise, so a pt-BR UI
 * never shows an English month.
 */
export function intlLocale(): string {
  return uiLocale === SOURCE_LOCALE ? "default" : uiLocale;
}

/** The same, as a locales list for `toLocale*String([], …)` calls. */
export function intlLocales(): string[] {
  return uiLocale === SOURCE_LOCALE ? [] : [uiLocale];
}

/** Switch the UI catalog. An unregistered tag falls back to English. */
export function setUiLocale(tag: string): void {
  const next = UI_CATALOGS[tag] ? tag : SOURCE_LOCALE;
  if (next === uiLocale) return;
  uiLocale = next;
  void instance.changeLanguage(next);
  for (const listener of [...listeners]) listener();
}

export function subscribeUiLocale(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Re-renders the caller when the UI language changes; returns the current tag. */
export function useUiLocale(): string {
  return useSyncExternalStore(subscribeUiLocale, getUiLocale, getUiLocale);
}

/**
 * Splits a translated string around one rich-text tag:
 * "Learn more in our <link>Privacy Policy</link>." →
 * { before: "Learn more in our ", inner: "Privacy Policy", after: "." }.
 * A string without the tag comes back whole in `before`.
 */
export function splitTag(
  text: string,
  tag: string
): { before: string; inner: string; after: string } {
  const open = `<${tag}>`;
  const close = `</${tag}>`;
  const start = text.indexOf(open);
  const end = text.indexOf(close, start + open.length);
  if (start < 0 || end < 0) return { before: text, inner: "", after: "" };
  return {
    before: text.slice(0, start),
    inner: text.slice(start + open.length, end),
    after: text.slice(end + close.length),
  };
}

/** Test seam: back to English. */
export function __resetUiLocaleForTests(): void {
  setUiLocale(SOURCE_LOCALE);
}
