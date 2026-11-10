/**
 * The usage-count allow-lists and caps (convex/usageShape.ts), the pure half
 * the server's mutations and the client both lean on. The mutations themselves
 * are exercised against a mocked backend in __vitest__/convex/usage.test.ts.
 */
import {
  MAX_SCREENS,
  MAX_TAPS,
  isUsageScreen,
  isUsageStep,
  isUsageTap,
  isValidMeta,
  isValidVisit,
} from "../../convex/usageShape";

const META = { appVersion: "1.0.6", buildNumber: "14", lang: "en", variant: "production" as const };
const VISIT = {
  visitNumber: 1,
  durationSec: 10,
  screens: ["home"],
  taps: ["mic"],
  madeReminder: false,
};

test("membership checks accept only listed words", () => {
  expect(isUsageStep("first_open")).toBe(true);
  expect(isUsageStep("first_opened")).toBe(false);
  expect(isUsageStep(1)).toBe(false);
  expect(isUsageScreen("paywall")).toBe(true);
  expect(isUsageScreen("Paywall")).toBe(false);
  expect(isUsageTap("mic")).toBe(true);
  expect(isUsageTap("")).toBe(false);
});

test("isValidMeta", () => {
  expect(isValidMeta(META)).toBe(true);
  expect(isValidMeta({ ...META, appVersion: "1.0.6-beta" })).toBe(false);
  expect(isValidMeta({ ...META, buildNumber: "1234567" })).toBe(false);
  expect(isValidMeta({ ...META, lang: "en-US" })).toBe(false);
  expect(isValidMeta({ ...META, variant: "preview" as any })).toBe(false);
});

test("isValidVisit", () => {
  expect(isValidVisit(VISIT)).toBe(true);
  expect(isValidVisit({ ...VISIT, visitNumber: 0 })).toBe(true);
  expect(isValidVisit({ ...VISIT, visitNumber: 11 })).toBe(false);
  expect(isValidVisit({ ...VISIT, visitNumber: 2.5 })).toBe(false);
  expect(isValidVisit({ ...VISIT, durationSec: 3601 })).toBe(false);
  expect(isValidVisit({ ...VISIT, durationSec: -1 })).toBe(false);
  expect(isValidVisit({ ...VISIT, screens: Array(MAX_SCREENS + 1).fill("home") })).toBe(false);
  expect(isValidVisit({ ...VISIT, taps: Array(MAX_TAPS + 1).fill("mic") })).toBe(false);
  expect(isValidVisit({ ...VISIT, screens: ["nowhere"] })).toBe(false);
  expect(isValidVisit({ ...VISIT, taps: ["anything"] })).toBe(false);
  expect(isValidVisit({ ...VISIT, madeReminder: "yes" as any })).toBe(false);
});
