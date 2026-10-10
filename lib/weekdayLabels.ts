/**
 * Weekday labels in the UI language. The reviewed catalogs carry them
 * (`weekday.short.*`, `weekday.narrow.*`), which beats Intl here: Hermes'
 * weekday names vary by iOS version and pt-BR wants "seg." not "seg".
 *
 * Narrow letters are ambiguous in some languages (pt-BR: S T Q Q S S D), so
 * anything that shows a letter should give screen readers `weekdayFullLabel`.
 */
import { getUiLocale, t } from "./i18n";

export type WeekdayCode = "sun" | "mon" | "tue" | "wed" | "thu" | "fri" | "sat";

const SHORT: Record<WeekdayCode, () => string> = {
  sun: () => t("weekday.short.sun"),
  mon: () => t("weekday.short.mon"),
  tue: () => t("weekday.short.tue"),
  wed: () => t("weekday.short.wed"),
  thu: () => t("weekday.short.thu"),
  fri: () => t("weekday.short.fri"),
  sat: () => t("weekday.short.sat"),
};

const NARROW: Record<WeekdayCode, () => string> = {
  sun: () => t("weekday.narrow.sun"),
  mon: () => t("weekday.narrow.mon"),
  tue: () => t("weekday.narrow.tue"),
  wed: () => t("weekday.narrow.wed"),
  thu: () => t("weekday.narrow.thu"),
  fri: () => t("weekday.narrow.fri"),
  sat: () => t("weekday.narrow.sat"),
};

const INDEX: Record<WeekdayCode, number> = { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 };

/** "Mon" / "seg." / "lun". Unknown codes come back as given. */
export function weekdayShortLabel(day: string): string {
  return SHORT[day as WeekdayCode]?.() ?? day;
}

/** "M" / "S" / "L". Unknown codes come back as given. */
export function weekdayNarrowLabel(day: string): string {
  return NARROW[day as WeekdayCode]?.() ?? day;
}

/**
 * The full weekday name for accessibility ("Monday", "segunda-feira"), from
 * Intl in the UI language; the short label when the engine can't.
 */
export function weekdayFullLabel(day: string): string {
  const index = INDEX[day as WeekdayCode];
  if (index === undefined) return day;
  try {
    // 2023-01-01 was a Sunday.
    return new Intl.DateTimeFormat(getUiLocale(), { weekday: "long", timeZone: "UTC" }).format(
      new Date(Date.UTC(2023, 0, 1 + index))
    );
  } catch {
    return weekdayShortLabel(day);
  }
}
