/**
 * The i18n runtime (lib/i18n.ts) and the locale-aware formatting on top of it:
 * English by default and as the fallback, ICU plurals, rich-text tags, clock
 * times and weekday labels in the UI language, 12/24-hour from the device.
 */
import {
  __resetUiLocaleForTests,
  fallbackFormat,
  getUiLocale,
  intlLocale,
  intlLocales,
  setUiLocale,
  splitTag,
  subscribeUiLocale,
  t,
} from "../../lib/i18n";
import { formatClockTime } from "../../lib/time";
import { weekdayFullLabel, weekdayNarrowLabel, weekdayShortLabel } from "../../lib/weekdayLabels";
import { languageName, listeningLabel } from "../../lib/languageNames";

afterEach(() => __resetUiLocaleForTests());

describe("t", () => {
  it("is English by default, with ICU plurals and placeholders", () => {
    expect(getUiLocale()).toBe("en");
    expect(t("tabs.settings")).toBe("Settings");
    expect(t("gate.limit.toastTitle", { limit: 1 })).toBe("You've reached 1 active reminder");
    expect(t("gate.limit.toastTitle", { limit: 5 })).toBe("You've reached 5 active reminders");
    expect(t("pending.heard", { quote: "call mum" })).toBe('Remi heard: "call mum"');
  });

  it("switches catalogs and falls back to English for an unknown tag", () => {
    setUiLocale("pt-BR");
    expect(getUiLocale()).toBe("pt-BR");
    expect(t("tabs.settings")).not.toBe("Settings");
    setUiLocale("fr-FR");
    expect(getUiLocale()).toBe("en");
    expect(t("tabs.settings")).toBe("Settings");
  });

  it("returns the key itself for a key no catalog has", () => {
    expect(t("no.such.key")).toBe("no.such.key");
  });

  it("tells subscribers about a change, and only a change", () => {
    const listener = jest.fn();
    const stop = subscribeUiLocale(listener);
    setUiLocale("en");
    expect(listener).not.toHaveBeenCalled();
    setUiLocale("es-MX");
    expect(listener).toHaveBeenCalledTimes(1);
    stop();
    setUiLocale("en");
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("names the locale for toLocale* calls: the device's under English", () => {
    expect(intlLocale()).toBe("default");
    expect(intlLocales()).toEqual([]);
    setUiLocale("es-MX");
    expect(intlLocale()).toBe("es-MX");
    expect(intlLocales()).toEqual(["es-MX"]);
  });
});

describe("fallbackFormat (when ICU can't run)", () => {
  it("fills placeholders and picks plural branches by hand", () => {
    expect(fallbackFormat("Hi {name}", { name: "Ana" })).toBe("Hi Ana");
    expect(fallbackFormat("{count, plural, one {# day} other {# days}}", { count: 1 })).toBe("1 day");
    expect(fallbackFormat("{count, plural, one {# day} other {# days}}", { count: 3 })).toBe("3 days");
    expect(fallbackFormat("{n, plural, =0 {none} other {#}}", { n: 0 })).toBe("none");
    expect(
      fallbackFormat("{created} of {total, plural, one {# made} other {# made}}", { created: 1, total: 2 })
    ).toBe("1 of 2 made");
  });

  it("leaves an unknown placeholder visible and copes with no params", () => {
    expect(fallbackFormat("Hi {name}")).toBe("Hi {name}");
    expect(fallbackFormat("plain")).toBe("plain");
  });
});

describe("splitTag", () => {
  it("splits around a rich-text tag", () => {
    expect(splitTag("Learn more in our <link>Privacy Policy</link>.", "link")).toEqual({
      before: "Learn more in our ",
      inner: "Privacy Policy",
      after: ".",
    });
  });

  it("returns the text whole without the tag", () => {
    expect(splitTag("No tag here", "b")).toEqual({ before: "No tag here", inner: "", after: "" });
  });
});

describe("clock times in the UI language", () => {
  it("English keeps the house style", () => {
    expect(formatClockTime("19:15", { hour12: true })).toBe("7:15 pm");
    expect(formatClockTime("07:05", { hour12: true })).toBe("7:05 am");
    expect(formatClockTime("19:15", { hour12: false })).toBe("19:15");
  });

  it("other languages follow Intl, and the device's 12/24-hour setting", () => {
    setUiLocale("pt-BR");
    expect(formatClockTime("19:15", { hour12: false })).toBe("19:15");
    setUiLocale("es-MX");
    const twelve = formatClockTime("19:15", { hour12: true });
    expect(twelve).toMatch(/^7:15\s?p\.?\s?m\.?$/i);
    expect(formatClockTime("19:15", { hour12: false })).toBe("19:15");
  });
});

describe("weekday labels", () => {
  it("come from the catalog", () => {
    expect(weekdayShortLabel("mon")).toBe("Mon");
    expect(weekdayNarrowLabel("thu")).toBe("T");
    setUiLocale("es-MX");
    expect(weekdayShortLabel("mon")).toBe("lun");
    expect(weekdayNarrowLabel("thu")).toBe("J");
  });

  it("give screen readers the full name", () => {
    expect(weekdayFullLabel("mon")).toBe("Monday");
    setUiLocale("pt-BR");
    expect(weekdayFullLabel("tue").toLowerCase()).toContain("terça");
  });

  it("pass unknown codes through", () => {
    expect(weekdayShortLabel("xyz")).toBe("xyz");
    expect(weekdayNarrowLabel("xyz")).toBe("xyz");
    expect(weekdayFullLabel("xyz")).toBe("xyz");
  });

  it("fall back to the short label when Intl can't name a weekday", () => {
    const spy = jest.spyOn(Intl, "DateTimeFormat").mockImplementation(() => {
      throw new Error("no Intl");
    });
    try {
      expect(weekdayFullLabel("fri")).toBe("Fri");
    } finally {
      spy.mockRestore();
    }
  });
});

describe("language names follow the UI language", () => {
  it("names languages in Spanish under the es-MX UI", () => {
    setUiLocale("es-MX");
    expect(languageName("sv")).not.toBe("Swedish");
    expect(listeningLabel("sv-SE")).toContain(languageName("sv") as string);
  });
});

describe("every registered catalog", () => {
  const { UI_CATALOGS } = require("../../locales");
  it.each(Object.keys(UI_CATALOGS))("%s switches in and formats ICU", (tag: string) => {
    setUiLocale(tag);
    expect(getUiLocale()).toBe(tag);
    expect(t("tabs.settings")).toBe(UI_CATALOGS[tag]["tabs.settings"]);
    // "#" renders in the locale's digits (bn: ৩), so check it was filled, not which digit.
    expect(t("gate.limit.toastTitle", { limit: 3 })).not.toMatch(/[{}#]/);
    expect(t("take.partial.title", { created: 1, total: 2 })).not.toContain("{");
  });
});
