import type { PurchasesPackage } from "react-native-purchases";
import {
  AWARD_BADGES,
  PAYWALL_PROOF_FLAGS,
  PROOF_CARDS,
  TESTIMONIALS,
  buildCtaLabel,
  buildDisclosure,
  buildHonestyCaption,
  captionLineToString,
  describePlan,
  getFeatureRows,
  getHeroCopy,
  getTermLabel,
  resolvePaywallContext,
  selectPlanPair,
  PAYWALL_COPY,
} from "../../lib/paywallContent";
import { getFreeActiveLimit } from "../../lib/usageGate";

type FakePackageOptions = {
  identifier?: string;
  packageType?: string;
  subscriptionPeriod?: string | null;
  priceString?: string;
  /** Apple-style free trial. */
  introPriceDays?: number;
  /** Google-style free trial via the default subscription option. */
  freePhase?: { unit: string; value: number };
};

/** Minimal stand-in for a RevenueCat package — only the fields this module reads. */
function makePackage({
  identifier = "pkg",
  packageType = "MONTHLY",
  subscriptionPeriod = "P1M",
  priceString = "$4.99",
  introPriceDays,
  freePhase,
}: FakePackageOptions = {}): PurchasesPackage {
  return {
    identifier,
    packageType,
    product: {
      identifier: `${identifier}_product`,
      priceString,
      price: 4.99,
      subscriptionPeriod,
      introPrice:
        introPriceDays !== undefined
          ? {
              price: 0,
              priceString: "$0.00",
              cycles: 1,
              period: `P${introPriceDays}D`,
              periodUnit: "DAY",
              periodNumberOfUnits: introPriceDays,
            }
          : null,
      defaultOption: freePhase
        ? { freePhase: { billingPeriod: { unit: freePhase.unit, value: freePhase.value } } }
        : null,
    },
  } as unknown as PurchasesPackage;
}

describe("proof slots", () => {
  it("ship flagged off with no content behind them", () => {
    expect(PAYWALL_PROOF_FLAGS.proofCarousel).toBe(false);
    expect(PAYWALL_PROOF_FLAGS.testimonials).toBe(false);
    expect(PAYWALL_PROOF_FLAGS.awardBadges).toBe(false);
    expect(PROOF_CARDS).toHaveLength(0);
    expect(TESTIMONIALS).toHaveLength(0);
    expect(AWARD_BADGES).toHaveLength(0);
  });
});

describe("getFeatureRows", () => {
  it("quotes the free cap from the gate, not a hardcoded number", () => {
    const capRow = getFeatureRows().find((row) => row.feature === "Active reminders at once");
    expect(capRow?.free).toEqual({ kind: "text", label: String(getFreeActiveLimit()) });
    expect(capRow?.pro).toEqual({ kind: "text", label: "Unlimited" });
  });

  it("marks interval repeats as the pro-only row", () => {
    const intervalRow = getFeatureRows().find((row) => row.feature.includes("every few minutes"));
    expect(intervalRow?.pro).toEqual({ kind: "check" });
    expect(intervalRow?.free).toEqual({ kind: "none" });
  });

  it("keeps multi-time schedules free — they are not part of the split", () => {
    const multiTime = getFeatureRows().find((row) => row.feature.includes("Several times a day"));
    expect(multiTime?.free).toEqual({ kind: "check" });
  });
});

describe("getTermLabel", () => {
  it("reads the ISO period off the product", () => {
    expect(getTermLabel(makePackage({ subscriptionPeriod: "P1M" }))).toBe("month");
    expect(getTermLabel(makePackage({ subscriptionPeriod: "P1Y" }))).toBe("year");
    expect(getTermLabel(makePackage({ subscriptionPeriod: "P6M" }))).toBe("6 months");
  });

  it("falls back to the package type when the period is missing", () => {
    expect(getTermLabel(makePackage({ subscriptionPeriod: null, packageType: "ANNUAL" }))).toBe("year");
    expect(getTermLabel(makePackage({ subscriptionPeriod: null, packageType: "CUSTOM" }))).toBe(
      "billing period"
    );
  });
});

describe("describePlan", () => {
  it("says '(No trial)' when the store grants none", () => {
    const plan = describePlan(makePackage({ priceString: "$4.99" }));
    expect(plan.trialLength).toBeNull();
    expect(plan.trialLabel).toBe("(No trial)");
    expect(plan.billedLabel).toBe("Billed monthly");
    expect(plan.termShortLabel).toBe("mo");
  });

  it("reads an Apple intro price as the trial length", () => {
    const plan = describePlan(
      makePackage({ packageType: "ANNUAL", subscriptionPeriod: "P1Y", introPriceDays: 7 })
    );
    expect(plan.trialLength).toBe("7 days");
    expect(plan.trialLabel).toBe("(7 days trial)");
    expect(plan.billedLabel).toBe("Billed yearly");
    expect(plan.termShortLabel).toBe("yr");
  });

  it("keeps the long term when there is no natural abbreviation", () => {
    expect(describePlan(makePackage({ subscriptionPeriod: "P6M" })).termShortLabel).toBe("6 months");
  });

  it("reads a Google free phase, spelling weeks as days", () => {
    const plan = describePlan(
      makePackage({ subscriptionPeriod: "P1Y", freePhase: { unit: "WEEK", value: 1 } })
    );
    expect(plan.trialLength).toBe("7 days");
  });
});

describe("selectPlanPair", () => {
  it("sorts by package type first", () => {
    const monthly = makePackage({ identifier: "m", packageType: "MONTHLY" });
    const annual = makePackage({ identifier: "a", packageType: "ANNUAL", subscriptionPeriod: "P1Y" });
    const pair = selectPlanPair([annual, monthly]);
    expect(pair.monthly?.identifier).toBe("m");
    expect(pair.annual?.identifier).toBe("a");
  });

  it("falls back to term length for custom identifiers", () => {
    const short = makePackage({ identifier: "s", packageType: "CUSTOM", subscriptionPeriod: "P1M" });
    const long = makePackage({ identifier: "l", packageType: "CUSTOM", subscriptionPeriod: "P1Y" });
    const pair = selectPlanPair([short, long]);
    expect(pair.monthly?.identifier).toBe("s");
    expect(pair.annual?.identifier).toBe("l");
  });

  it("never dresses a lone monthly plan as the annual card", () => {
    const only = makePackage({ identifier: "m", packageType: "MONTHLY" });
    const pair = selectPlanPair([only]);
    expect(pair.monthly?.identifier).toBe("m");
    expect(pair.annual).toBeNull();
  });

  it("returns empty slots for an empty offering", () => {
    expect(selectPlanPair([])).toEqual({ monthly: null, annual: null });
  });
});

describe("buildCtaLabel", () => {
  it("only promises a trial the store actually grants", () => {
    const withTrial = describePlan(
      makePackage({ packageType: "ANNUAL", subscriptionPeriod: "P1Y", introPriceDays: 7, priceString: "$39.99" })
    );
    expect(buildCtaLabel(withTrial)).toBe("Start 7 days free trial");

    const noTrial = describePlan(makePackage({ priceString: "$4.99" }));
    expect(buildCtaLabel(noTrial)).toBe("Subscribe for $4.99 / month");

    expect(buildCtaLabel(null)).toBe("Plans unavailable");
  });
});

describe("buildHonestyCaption", () => {
  it("states the trial length, the price after it, and the way out", () => {
    const plan = describePlan(
      makePackage({ packageType: "ANNUAL", subscriptionPeriod: "P1Y", introPriceDays: 7, priceString: "$39.99" })
    );
    const lines = buildHonestyCaption(plan);
    expect(lines).toHaveLength(2);
    expect(captionLineToString(lines[0])).toBe("7 days free trial, $39.99/yr.");
    expect(captionLineToString(lines[1])).toBe("No commitment. Cancel anytime.");
  });

  it("marks the price run bold and nothing else — one ink, weight for emphasis", () => {
    const plan = describePlan(
      makePackage({ packageType: "ANNUAL", subscriptionPeriod: "P1Y", introPriceDays: 7, priceString: "$39.99" })
    );
    const [first, second] = buildHonestyCaption(plan);
    expect(first.filter((segment) => segment.bold).map((segment) => segment.text)).toEqual([
      "$39.99/yr",
    ]);
    expect(second.some((segment) => segment.bold)).toBe(false);
  });

  it("says there is no trial when there is none", () => {
    const lines = buildHonestyCaption(describePlan(makePackage({ priceString: "$4.99" })));
    expect(captionLineToString(lines[0])).toBe("No free trial, $4.99/mo.");
    expect(captionLineToString(lines[1])).toBe("No commitment. Cancel anytime.");
  });

  it("falls back to the plans-unavailable copy with no plan", () => {
    const lines = buildHonestyCaption(null);
    expect(captionLineToString(lines[0])).toBe(PAYWALL_COPY.plansUnavailable);
    expect(captionLineToString(lines[1])).toBe(PAYWALL_COPY.plansUnavailableHint);
  });
});

describe("buildDisclosure", () => {
  it("names the product, price, term and how to cancel", () => {
    const text = buildDisclosure(
      makePackage({ subscriptionPeriod: "P1Y", priceString: "$39.99" }),
      "Voice Reminder Pro"
    );
    expect(text).toContain("Voice Reminder Pro is $39.99 every year");
    expect(text).toContain("renews automatically");
    expect(text).toContain("Subscriptions");
  });

  it("still discloses auto-renewal with no package selected", () => {
    expect(buildDisclosure(null, "Voice Reminder Pro")).toContain("auto-renewing subscription");
  });
});

// ─── entry context (OLD-100) ─────────────────────────────────────────────────

describe("resolvePaywallContext", () => {
  it("recognises the interval gate's own entry", () => {
    expect(resolvePaywallContext("interval")).toBe("interval");
  });

  it("takes the first value when the router hands over an array", () => {
    expect(resolvePaywallContext(["interval", "junk"])).toBe("interval");
  });

  it("falls back to the general pitch for anything else", () => {
    expect(resolvePaywallContext(undefined)).toBe("default");
    expect(resolvePaywallContext("")).toBe("default");
    expect(resolvePaywallContext("nonsense")).toBe("default");
    expect(resolvePaywallContext(7)).toBe("default");
    expect(resolvePaywallContext([])).toBe("default");
  });
});

describe("getHeroCopy", () => {
  it("keeps the general hero for a plain open", () => {
    expect(getHeroCopy("default")).toEqual({
      lines: PAYWALL_COPY.heroLines,
      subtitle: PAYWALL_COPY.heroSubtitle,
    });
  });

  it("headlines the repeat behaviour when that is what was blocked", () => {
    const hero = getHeroCopy("interval");
    expect(hero.lines).toHaveLength(3);
    expect(hero.subtitle).toContain("every few minutes");
    // Everyday-forgetting language only: no memory or health claims.
    expect(hero.subtitle.toLowerCase()).not.toMatch(/memory|dementia|health|medical/);
  });
});
