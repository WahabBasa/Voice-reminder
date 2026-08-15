import fs from "fs";
import path from "path";
import { PRIVACY_POLICY_URL, TERMS_OF_USE_URL } from "../../lib/legalLinks";

/**
 * The legal links App Review actually taps: the paywall footer (Schedule 2
 * §3.8(b)), the Settings About rows (5.1.1(i)) and "Learn more" on the consent
 * card (5.1.2(i)). One dead or drifted URL is a rejection, so these tests pin
 * both the values and the single-source-of-truth rule — a URL pasted straight
 * into a screen shows up as a red test.
 */

const read = (relative: string) =>
  fs.readFileSync(path.resolve(__dirname, "../..", relative), "utf8");

const paywall = read("app/paywall.tsx");
// The purchase screen is two files since the paywall rebuild: the route owns the
// browser hand-off, the closing block owns the two links App Review taps.
const closingBlock = read("components/paywall/ClosingBlock.tsx");
const settings = read("app/settings.tsx");
const consentCard = read("components/AiConsentCard.tsx");
const consentModule = read("lib/aiConsent.ts");
const purchases = read("lib/purchases.ts");

describe("legal link constants", () => {
  it("are absolute https URLs", () => {
    expect(PRIVACY_POLICY_URL).toMatch(/^https:\/\//);
    expect(TERMS_OF_USE_URL).toMatch(/^https:\/\//);
  });

  it("point at the hosted privacy policy and terms pages", () => {
    expect(PRIVACY_POLICY_URL).toBe(
      "https://wahabbasa.github.io/voicereminder-legal/privacy.html"
    );
    expect(TERMS_OF_USE_URL).toBe(
      "https://wahabbasa.github.io/voicereminder-legal/terms.html"
    );
  });

  it("live on the same host, so a custom domain is one edit per constant", () => {
    expect(new URL(PRIVACY_POLICY_URL).origin).toBe(new URL(TERMS_OF_USE_URL).origin);
  });
});

describe("every legal link comes from lib/legalLinks", () => {
  it("the paywall's closing block imports both constants", () => {
    expect(closingBlock).toMatch(/from "\.\.\/\.\.\/lib\/legalLinks"/);
    expect(closingBlock).toContain("PRIVACY_POLICY_URL");
    expect(closingBlock).toContain("TERMS_OF_USE_URL");
  });

  it("Settings imports both constants", () => {
    expect(settings).toMatch(/from "\.\.\/lib\/legalLinks"/);
    expect(settings).toContain("PRIVACY_POLICY_URL");
    expect(settings).toContain("TERMS_OF_USE_URL");
  });

  it("the consent card links through lib/aiConsent, which reads the constant", () => {
    expect(consentCard).toContain("AI_CONSENT_LEARN_MORE_URL");
    expect(consentModule).toMatch(/from '\.\/legalLinks'/);
  });

  it("no screen hardcodes a URL", () => {
    for (const source of [paywall, closingBlock, settings, consentCard]) {
      expect(source).not.toMatch(/["'`]https?:\/\//);
    }
  });

  it("lib/purchases no longer keeps its own copies", () => {
    expect(purchases).not.toMatch(/(PRIVACY_POLICY_URL|TERMS_OF_USE_URL)\s*=/);
  });
});

describe("legal pages open in an in-app browser", () => {
  it("every screen goes through openInAppBrowser — no direct WebBrowser use or Safari hand-off", () => {
    // ClosingBlock raises its taps through an `onOpenLink` prop rather than
    // calling the helper itself, so it is checked separately below.
    for (const source of [paywall, settings, consentCard]) {
      expect(source).toContain("openInAppBrowser");
      // A top-level expo-web-browser import crashes any build that predates the
      // native module (requireNativeModule throws at load, the route dies with
      // SceneView's "Cannot read property 'ErrorBoundary' of undefined") — the
      // 2026-08-14 OTA red screen. Only lib/legalLinks may touch it, lazily.
      expect(source).not.toMatch(/from ["']expo-web-browser["']/);
      expect(source).not.toContain("Linking.openURL");
    }
    expect(closingBlock).toContain("onOpenLink");
    expect(closingBlock).not.toMatch(/from ["']expo-web-browser["']/);
    expect(closingBlock).not.toContain("Linking.openURL");
  });

  it("openInAppBrowser requires expo-web-browser lazily, with a system-browser fallback", () => {
    const legalLinks = read("lib/legalLinks.ts");
    expect(legalLinks).not.toMatch(/^import .*expo-web-browser/m);
    expect(legalLinks).toContain("require('expo-web-browser')");
    expect(legalLinks).toContain("openBrowserAsync");
    expect(legalLinks).toContain("Linking.openURL");
  });
});
