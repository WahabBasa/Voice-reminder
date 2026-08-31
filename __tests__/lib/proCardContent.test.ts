import fs from "fs";
import path from "path";
import { getProCardContent } from "../../lib/proCardContent";

/**
 * The Settings Pro card is the only place the app admits a subscription exists.
 * Two failures matter: a subscriber shown "Upgrade to Pro" (they already paid),
 * and a free user shown a manage-subscription card that leads nowhere. The
 * unknown/null state resolving to the pitch is what keeps the second one out.
 *
 * The wiring assertions read app/settings.tsx the way legalLinks.test does —
 * the screen has no renderer in this suite, so the source is the evidence.
 */

const read = (relative: string) =>
  fs.readFileSync(path.resolve(__dirname, "../..", relative), "utf8");

const settings = read("app/settings.tsx");
const purchases = read("lib/purchases.ts");

describe("getProCardContent", () => {
  it("pitches the upgrade to a free user", () => {
    expect(getProCardContent(false, "Remi Pro")).toEqual({
      title: "Upgrade to Pro",
      subtitle: "Unlimited active reminders",
      action: "upgrade",
    });
  });

  it("shows the subscription as active to a subscriber", () => {
    expect(getProCardContent(true, "Remi Pro")).toEqual({
      title: "Remi Pro",
      subtitle: "Active · Unlimited reminders",
      action: "manage",
    });
  });

  it("falls back to the pitch while the entitlement is unknown", () => {
    // Guessing Pro here would hand a free user a card that opens the store's
    // subscription list with nothing in it.
    expect(getProCardContent(null, "Remi Pro")).toEqual(
      getProCardContent(false, "Remi Pro")
    );
  });

  it("titles the Pro state with the store's product name, not a second copy", () => {
    expect(getProCardContent(true, "Some Other Name").title).toBe("Some Other Name");
    expect(purchases).toContain("PRO_PRODUCT_NAME = 'Remi Pro'");
    expect(settings).toContain("getProCardContent(isPro, PRO_PRODUCT_NAME)");
  });

  it("names no external provider in anything the user reads", () => {
    for (const isPro of [true, false, null]) {
      const { title, subtitle } = getProCardContent(isPro, "Remi Pro");
      expect(`${title} ${subtitle}`).not.toMatch(
        /revenuecat|openai|apple pay|google play/i
      );
    }
  });
});

describe("Settings resolves the subscription without blocking a paint", () => {
  it("seeds state from the entitlement cache so a subscriber sees no flash", () => {
    expect(settings).toContain("useState<boolean | null>(() => getCachedProStatus().isPro)");
  });

  it("re-resolves on focus — the paywall pushes over Settings and comes back", () => {
    expect(settings).toMatch(/useFocusEffect,\s*useRouter\s*\}\s*from "expo-router"/);
    expect(settings).toContain("useFocusEffect(");
  });

  it("asks the cache and the store, so a cross-device purchase still lands", () => {
    expect(settings).toContain("checkProStatus()");
    expect(settings).toContain("refreshProStatus()");
  });

  it("drops a late answer once the effect is torn down", () => {
    expect(settings).toContain("cancelled = true");
  });
});

describe("the Pro card's two destinations", () => {
  it("routes the pitch to the paywall and the status card to the store", () => {
    expect(settings).toContain('router.push("/paywall")');
    expect(settings).toContain('proCard.action === "manage"');
    expect(settings).toContain("handleManageSubscription");
  });

  it("opens the native sheet first and falls back to the account URL", () => {
    expect(purchases).toContain("export async function openManageSubscriptions()");
    expect(purchases).toContain("showManageSubscriptions");
    expect(purchases).toContain("https://apps.apple.com/account/subscriptions");
    // Two independent try/catch blocks: a sheet that refuses to present must
    // still leave the URL fallback reachable, and neither may throw into the
    // screen. Settings itself keeps no store URL (legalLinks.test enforces it).
    expect(purchases.match(/\btry\s*\{/g)?.length ?? 0).toBeGreaterThanOrEqual(2);
    expect(settings).not.toContain("apps.apple.com");
  });
});
