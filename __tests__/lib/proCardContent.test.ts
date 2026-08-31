import fs from "fs";
import path from "path";
import {
  getProCardContent,
  getRestoreOutcomeContent,
  type ProStatus,
  type RestoreOutcome,
} from "../../lib/proCardContent";

/**
 * The Settings Pro card is the only place the app admits a subscription exists.
 * Three failures matter: a subscriber shown "Upgrade to Pro" (they already
 * paid), a free user shown a manage-subscription card that leads nowhere, and —
 * the one this file grew for — a failed check rendered as either of those. The
 * card now carries a third state that claims nothing and asks again instead.
 *
 * The wiring assertions read app/settings.tsx the way legalLinks.test does —
 * the screen has no renderer in this suite, so the source is the evidence. The
 * decisions themselves are pure functions and are tested as such.
 */

const read = (relative: string) =>
  fs.readFileSync(path.resolve(__dirname, "../..", relative), "utf8");

const settings = read("app/settings.tsx");
const purchases = read("lib/purchases.ts");
const index = read("app/index.tsx");

const ALL_STATUSES: ProStatus[] = ["pro", "free", "unknown"];
const PROVIDER_NAMES = /revenuecat|openai|elevenlabs|apple pay|google play|app store server/i;

describe("getProCardContent", () => {
  it("pitches the upgrade to a confirmed free user", () => {
    expect(getProCardContent("free", "Remi Pro")).toEqual({
      title: "Upgrade to Pro",
      subtitle: "Unlimited active reminders",
      action: "upgrade",
    });
  });

  it("shows the subscription as active to a subscriber", () => {
    expect(getProCardContent("pro", "Remi Pro")).toEqual({
      title: "Remi Pro",
      subtitle: "Active · Unlimited reminders",
      action: "manage",
    });
  });

  it("titles the Pro state with the store's product name, not a second copy", () => {
    expect(getProCardContent("pro", "Some Other Name").title).toBe("Some Other Name");
    expect(purchases).toContain("PRO_PRODUCT_NAME = 'Remi Pro'");
    expect(settings).toContain("getProCardContent(proStatus, PRO_PRODUCT_NAME)");
  });

  describe("when the entitlement can't be resolved", () => {
    const unknown = getProCardContent("unknown", "Remi Pro");

    it("sells nothing — an unanswered check must not ask a subscriber to buy again", () => {
      expect(unknown.action).not.toBe("upgrade");
      expect(unknown).not.toEqual(getProCardContent("free", "Remi Pro"));
      expect(`${unknown.title} ${unknown.subtitle}`).not.toMatch(/upgrade|unlimited/i);
    });

    it("claims nothing either — a free user gets no card into an empty subscription list", () => {
      expect(unknown.action).not.toBe("manage");
      expect(unknown).not.toEqual(getProCardContent("pro", "Remi Pro"));
      expect(unknown.subtitle).not.toMatch(/active/i);
    });

    it("offers the only honest action: ask again", () => {
      expect(unknown.action).toBe("retry");
      expect(unknown.subtitle).toMatch(/retry/i);
    });
  });

  it("gives every state its own action, so the tap can never be ambiguous", () => {
    const actions = ALL_STATUSES.map((status) => getProCardContent(status, "Remi Pro").action);
    expect(new Set(actions).size).toBe(ALL_STATUSES.length);
  });

  it("names no external provider in anything the user reads", () => {
    for (const status of ALL_STATUSES) {
      const { title, subtitle } = getProCardContent(status, "Remi Pro");
      expect(`${title} ${subtitle}`).not.toMatch(PROVIDER_NAMES);
    }
  });
});

describe("getRestoreOutcomeContent", () => {
  it("turns a successful restore into the active card", () => {
    const outcome = getRestoreOutcomeContent("restored", "Remi Pro");
    expect(outcome.proStatus).toBe("pro");
    expect(outcome.message).toContain("Remi Pro");
  });

  it("reconciles downward: a restore that finds nothing active clears the card", () => {
    // The regression this exists for — restore only ever set Pro to true, so a
    // lapsed subscriber was told their subscription had ended by an alert
    // sitting on top of a card still reading "Active".
    for (const outcome of ["expired", "nothing_to_restore"] as RestoreOutcome[]) {
      expect(getRestoreOutcomeContent(outcome, "Remi Pro").proStatus).toBe("free");
    }
  });

  it("distinguishes a lapsed subscription from one that never existed", () => {
    const expired = getRestoreOutcomeContent("expired", "Remi Pro");
    const never = getRestoreOutcomeContent("nothing_to_restore", "Remi Pro");

    expect(expired.title).not.toBe(never.title);
    expect(expired.message).not.toBe(never.message);
    // "No previous subscription was found" told an expired subscriber their
    // purchase had vanished. Only the never-subscribed case may say that.
    expect(expired.message).not.toMatch(/no previous subscription/i);
    expect(expired.message).toMatch(/ended|expired/i);
    expect(never.message).toMatch(/no previous subscription/i);
  });

  it("names no external provider in anything the user reads", () => {
    for (const outcome of ["restored", "expired", "nothing_to_restore"] as RestoreOutcome[]) {
      const { title, message } = getRestoreOutcomeContent(outcome, "Remi Pro");
      expect(`${title} ${message}`).not.toMatch(PROVIDER_NAMES);
    }
  });
});

describe("the card's status type stays pinned to the store module's", () => {
  it("lib/purchases declares the same three states", () => {
    // proCardContent deliberately declares its own copy so it never drags the
    // native SDK into a test process; this is the seam that keeps them equal.
    expect(purchases).toContain(
      "export type ProStatus = 'pro' | 'free' | 'unknown';"
    );
  });
});

describe("Settings tracks the subscription instead of sampling it", () => {
  it("seeds state from the entitlement cache so a subscriber sees no flash", () => {
    expect(settings).toContain("useState<ProStatus>(() => getProStatusSnapshot())");
  });

  it("subscribes to entitlement changes — the cold-start fix", () => {
    // SettingsContent mounts inside the home pager at cold start, before
    // RevenueCat has configured. Without this the first (unknown) answer would
    // stand until a full route blur/return.
    expect(settings).toContain("subscribeToProStatus(setProStatus)");
    expect(purchases).toContain("export function subscribeToProStatus(");
    // The SDK's own listener is what feeds that subscription.
    expect(purchases).toContain("Purchases.addCustomerInfoUpdateListener");
    expect(purchases).toMatch(/function updateCache[\s\S]*?notifyProStatus\(\)/);
    // Configure completing is itself a change worth broadcasting, even when the
    // priming fetch failed.
    expect(purchases).toMatch(/configured = true[\s\S]*?notifyProStatus\(\)/);
  });

  it("re-resolves on focus — the paywall pushes over Settings and comes back", () => {
    expect(settings).toMatch(/useFocusEffect,\s*useRouter\s*\}\s*from "expo-router"/);
    expect(settings).toContain("useFocusEffect(resolveProStatus)");
  });

  it("re-resolves when the pager page becomes visible, which is not a refocus", () => {
    // SwipePager keeps every page mounted, so a tab tap only moves a transform.
    expect(read("components/SwipePager.tsx")).toContain("All pages stay mounted");
    expect(index).toContain("<SettingsContent embedded visible={page === PAGE_SETTINGS} />");
    expect(settings).toContain("visible = true");
    // Only the false → true edge, or it would re-fire on every render.
    expect(settings).toContain("const becameVisible = visible && !wasVisible.current");
  });

  it("asks the cache and forces the store, so a cross-device purchase still lands", () => {
    expect(settings).toContain("readProStatus()");
    expect(settings).toContain("forceRefreshProStatus()");
  });

  it("drops a late answer once the effect is torn down", () => {
    expect(settings).toContain("cancelled = true");
  });
});

describe("the forced refresh actually bypasses the cache", () => {
  it("invalidates RevenueCat's customer info cache before fetching", () => {
    // getCustomerInfo alone is cache-aware: without this a refund or a
    // cross-device purchase can sit unnoticed for the SDK's cache lifetime.
    expect(purchases).toMatch(
      /invalidateCustomerInfoCache\(\)[\s\S]*?Purchases\.getCustomerInfo\(\)/
    );
  });

  it("leaves the cheap cached path alone for passive reads", () => {
    expect(purchases).toMatch(
      /export async function readProStatus[\s\S]*?if \(cachedIsPro !== null\)/
    );
  });

  it("never invents 'free' out of a failure", () => {
    // Both resolvers fall back to the snapshot (unknown, unless a real answer
    // already stands) rather than to a hardcoded false.
    expect(purchases).not.toMatch(/readProStatus failed[\s\S]{0,80}return false/);
    expect(purchases).not.toMatch(/forceRefreshProStatus failed[\s\S]{0,80}return false/);
  });
});

describe("the Pro card's three destinations", () => {
  it("routes the pitch to the paywall, the status card to the store, and retry to a re-check", () => {
    expect(settings).toContain('router.push("/paywall")');
    expect(settings).toContain('proCard.action === "manage"');
    expect(settings).toContain("handleManageSubscription");
    expect(settings).toContain('proCard.action === "retry"');
    expect(settings).toContain("handleRetryProStatus");
    // The retry must not be a disguised paywall route — that is the whole point
    // of not guessing.
    expect(settings).toMatch(
      /handleRetryProStatus = async \(\) => \{[\s\S]*?forceRefreshProStatus\(\)/
    );
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
