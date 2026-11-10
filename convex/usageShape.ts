/**
 * Anonymous usage counts (1.0.6): the allow-lists, in one place.
 *
 * Shared by the server (convex/usage.ts builds its validators from the same
 * words, and a test pins the two together) and the client (lib/usageCounts.ts
 * filters every value through these before it is sent). Nothing outside these
 * lists can reach the tables: no ids, no free text, no reminder content.
 *
 * Pure: no Convex imports, so the app can import it without pulling the server.
 */

/** One-time first-run milestones. Each is sent at most once per install. */
export const USAGE_STEPS = [
  "first_open",
  "consent_shown",
  "consent_accepted",
  "consent_declined",
  "mic_allowed",
  "mic_denied",
  "first_record_tap",
  "first_take_ok",
  "first_take_failed",
  "paywall_shown",
] as const;
export type UsageStep = (typeof USAGE_STEPS)[number];

/**
 * What was on screen. Routes (app/), plus the Home pager pages and the
 * surfaces Home opens over itself (recording, typed composer, edit sheet,
 * consent card). `other` stands in for anything unmapped.
 */
export const USAGE_SCREENS = [
  "home",
  "days",
  "settings",
  "diagnostics",
  "new_reminder",
  "paywall",
  "alarm",
  "recording",
  "composer",
  "edit_sheet",
  "consent",
  "other",
] as const;
export type UsageScreen = (typeof USAGE_SCREENS)[number];

/** Named controls. */
export const USAGE_TAPS = [
  "mic",
  "typed_entry",
  "reminder_card",
  "mark_done",
  "upgrade",
  "today_tab",
  "days_tab",
  "settings_tab",
] as const;
export type UsageTap = (typeof USAGE_TAPS)[number];

export const USAGE_VARIANTS = ["development", "production"] as const;
export type UsageVariant = (typeof USAGE_VARIANTS)[number];

/** Caps the server enforces (the client caps first, so these never bite). */
export const MAX_SCREENS = 20;
export const MAX_TAPS = 30;
export const MAX_VISIT_NUMBER = 10;
export const MAX_DURATION_SEC = 3600;

/** "1.0.6": one to four numeric parts, nothing else. */
export const APP_VERSION_PATTERN = /^\d{1,4}(\.\d{1,4}){0,3}$/;
/** "14": the iOS build number, digits only. */
export const BUILD_NUMBER_PATTERN = /^\d{1,6}$/;
/** "en", "ar", "fil": a bare language code, no region, no script. */
export const LANG_PATTERN = /^[a-z]{2,3}$/;

export function isUsageStep(value: unknown): value is UsageStep {
  return typeof value === "string" && (USAGE_STEPS as readonly string[]).includes(value);
}

export function isUsageScreen(value: unknown): value is UsageScreen {
  return typeof value === "string" && (USAGE_SCREENS as readonly string[]).includes(value);
}

export function isUsageTap(value: unknown): value is UsageTap {
  return typeof value === "string" && (USAGE_TAPS as readonly string[]).includes(value);
}

export type UsageMeta = {
  appVersion: string;
  buildNumber: string;
  lang: string;
  variant: UsageVariant;
};

/** The fields every row carries, checked against their patterns. */
export function isValidMeta(meta: UsageMeta): boolean {
  return (
    APP_VERSION_PATTERN.test(meta.appVersion) &&
    BUILD_NUMBER_PATTERN.test(meta.buildNumber) &&
    LANG_PATTERN.test(meta.lang) &&
    (USAGE_VARIANTS as readonly string[]).includes(meta.variant)
  );
}

function isIntIn(value: number, min: number, max: number): boolean {
  return Number.isInteger(value) && value >= min && value <= max;
}

export type VisitShape = {
  visitNumber: number;
  durationSec: number;
  screens: string[];
  taps: string[];
  madeReminder: boolean;
};

/** A visit's own fields, within their caps and lists. */
export function isValidVisit(visit: VisitShape): boolean {
  return (
    isIntIn(visit.visitNumber, 0, MAX_VISIT_NUMBER) &&
    isIntIn(visit.durationSec, 0, MAX_DURATION_SEC) &&
    visit.screens.length <= MAX_SCREENS &&
    visit.taps.length <= MAX_TAPS &&
    visit.screens.every(isUsageScreen) &&
    visit.taps.every(isUsageTap) &&
    typeof visit.madeReminder === "boolean"
  );
}
