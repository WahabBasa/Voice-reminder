/**
 * Everything the paywall says, and every derivation it makes from store data,
 * in one RN-free module so it can be unit tested.
 *
 * Two rules run through this file:
 *  - Nothing claims something the build can't back up. Trial length, price and
 *    billing term all come off the RevenueCat product; when the store says there
 *    is no trial, the card says "(No trial)" and the CTA stops promising one.
 *  - No invented proof. The award/review/testimonial slots exist but their
 *    content arrays are empty and their flags are off (see PAYWALL_PROOF_FLAGS).
 */

import type { PurchasesPackage } from "react-native-purchases";
import { getFreeActiveLimit } from "./usageGate";

// ---------------------------------------------------------------------------
// Proof slots — built, dark until real proof exists
// ---------------------------------------------------------------------------

/**
 * Launch ships proof-light: the carousel, testimonial wall and award badges are
 * implemented but hidden. Flip a flag ON only once the matching content array
 * below holds real, attributable material — the components also render nothing
 * when their array is empty, so a flag flipped by accident can't invent proof.
 */
export const PAYWALL_PROOF_FLAGS = {
  proofCarousel: false,
  testimonials: false,
  awardBadges: false,
};

export type ProofCard = { headline: string; body: string; source: string };
export type Testimonial = { quote: string; name: string; stars: number };
export type AwardBadge = { title: string; subtitle: string };

/** Real press/proof cards go here. Empty on purpose. */
export const PROOF_CARDS: ProofCard[] = [];
/** Real user quotes go here, with permission. Empty on purpose. */
export const TESTIMONIALS: Testimonial[] = [];
/** Real store ratings / editorial mentions go here. Empty on purpose. */
export const AWARD_BADGES: AwardBadge[] = [];

// ---------------------------------------------------------------------------
// Copy
// ---------------------------------------------------------------------------

/**
 * Copy targets everyday forgetting — the thing that slipped your mind — and
 * never memory conditions, health outcomes, or how the app is built under the
 * hood (no provider names anywhere in user-facing strings).
 */
export const PAYWALL_COPY = {
  /** Three lines, one per row of the serif display hero. */
  heroLines: ["Never miss", "what actually", "matters."],
  heroSubtitle: "Say it once. It comes back, out loud, at the right moment.",
  affinityLine: "For everyone who has remembered five minutes too late.",
  featureHeading: "What Pro adds",
  closingHeadline: "Let it do the remembering.",
  brandStatement: "Made by one developer who kept forgetting things.",
  restoreLabel: "Restore purchase",
  plansUnavailable: "Plans couldn't load right now.",
  plansUnavailableHint: "Check your connection and reopen this screen.",
};

// ---------------------------------------------------------------------------
// Entry context — what the hero leads with
// ---------------------------------------------------------------------------

/**
 * Why the paywall opened (OLD-100). A user who just asked for "every 20
 * minutes" reads about that; everyone else gets the general pitch. Only the
 * hero changes — the pricing, table and CTA below it are the same screen.
 */
export type PaywallContext = "default" | "interval";

export type HeroCopy = { lines: string[]; subtitle: string };

const HERO_COPY: Record<PaywallContext, HeroCopy> = {
  default: { lines: PAYWALL_COPY.heroLines, subtitle: PAYWALL_COPY.heroSubtitle },
  interval: {
    lines: ["Keep it", "coming back", "until it's done."],
    subtitle: "Pro lets one reminder repeat every few minutes, inside the hours you pick.",
  },
};

/** Route params arrive as strings (or arrays of them), and may be anything. */
export function resolvePaywallContext(value: unknown): PaywallContext {
  const key = Array.isArray(value) ? value[0] : value;
  return key === "interval" ? "interval" : "default";
}

export function getHeroCopy(context: PaywallContext): HeroCopy {
  return HERO_COPY[context];
}

// ---------------------------------------------------------------------------
// Feature table — the REAL tier split
// ---------------------------------------------------------------------------

export type TierCell =
  | { kind: "check" }
  | { kind: "text"; label: string }
  | { kind: "none" };

export type FeatureRow = { feature: string; pro: TierCell; free: TierCell };

const CHECK: TierCell = { kind: "check" };
const NONE: TierCell = { kind: "none" };
const text = (label: string): TierCell => ({ kind: "text", label });

/**
 * Rows must match what the shipping build actually gates (App Review 3.1.1/3.1.2).
 * Today that is exactly two things:
 *  - the active-reminder cap in `lib/usageGate.ts`
 *  - interval schedules ("repeats every few minutes"), premium per the schedule rework
 * Everything else is free on both tiers and is listed as such — a free column that
 * reads as crippled would be a lie about this build.
 */
export function getFeatureRows(): FeatureRow[] {
  const freeLimit = getFreeActiveLimit();
  return [
    { feature: "Set a reminder by speaking it", pro: CHECK, free: CHECK },
    { feature: "Alarms that say the reminder out loud", pro: CHECK, free: CHECK },
    { feature: "Several times a day on one reminder", pro: CHECK, free: CHECK },
    { feature: "Weekdays, dates and every-few-days repeats", pro: CHECK, free: CHECK },
    { feature: "Active reminders at once", pro: text("Unlimited"), free: text(String(freeLimit)) },
    { feature: "Reminders that repeat every few minutes", pro: CHECK, free: NONE },
  ];
}

// ---------------------------------------------------------------------------
// Store data → card copy
// ---------------------------------------------------------------------------

const PERIOD_UNIT_LABELS: Record<string, string> = { D: "day", W: "week", M: "month", Y: "year" };
const PERIOD_UNIT_MONTHS: Record<string, number> = { D: 1 / 30, W: 1 / 4.345, M: 1, Y: 12 };

const PACKAGE_TYPE_TERMS: Record<string, string> = {
  WEEKLY: "week",
  MONTHLY: "month",
  TWO_MONTH: "2 months",
  THREE_MONTH: "3 months",
  SIX_MONTH: "6 months",
  ANNUAL: "year",
};

const PACKAGE_TYPE_MONTHS: Record<string, number> = {
  WEEKLY: 1 / 4.345,
  MONTHLY: 1,
  TWO_MONTH: 2,
  THREE_MONTH: 3,
  SIX_MONTH: 6,
  ANNUAL: 12,
};

/** Parses an ISO 8601 billing period ("P1M", "P6M") off the store product. */
function parsePeriod(pkg: PurchasesPackage): { count: number; unit: string } | null {
  const match = /^P(\d+)([DWMY])$/.exec(pkg.product.subscriptionPeriod ?? "");
  if (!match) return null;
  return { count: Number(match[1]), unit: match[2] };
}

/** Billing term as words: "month", "year", "6 months". Store data first, package type as fallback. */
export function getTermLabel(pkg: PurchasesPackage): string {
  const parsed = parsePeriod(pkg);
  const unit = parsed ? PERIOD_UNIT_LABELS[parsed.unit] : undefined;
  if (parsed && unit) {
    return parsed.count === 1 ? unit : `${parsed.count} ${unit}s`;
  }
  return PACKAGE_TYPE_TERMS[pkg.packageType] ?? "billing period";
}

/** Term length in months, used only to sort plans into the monthly/annual slots. */
function getTermMonths(pkg: PurchasesPackage): number {
  const parsed = parsePeriod(pkg);
  if (parsed) {
    const months = parsed.count * (PERIOD_UNIT_MONTHS[parsed.unit] ?? 0);
    if (months > 0) return months;
  }
  return PACKAGE_TYPE_MONTHS[pkg.packageType] ?? 0;
}

/** "Billed monthly" / "Billed yearly" — the reference card's second line. */
function getBilledLabel(pkg: PurchasesPackage): string {
  const term = getTermLabel(pkg);
  if (term === "month") return "Billed monthly";
  if (term === "year") return "Billed yearly";
  if (term === "week") return "Billed weekly";
  return `Billed every ${term}`;
}

/**
 * The free trial the store actually grants, or null. Apple reports it as a zero
 * priced `introPrice`; Google reports it as the default option's `freePhase`.
 */
function resolveFreeTrial(pkg: PurchasesPackage): { count: number; unit: string } | null {
  const intro = pkg.product.introPrice;
  if (intro && intro.price === 0 && intro.periodNumberOfUnits > 0) {
    return { count: intro.periodNumberOfUnits, unit: String(intro.periodUnit).toUpperCase() };
  }

  const freePeriod = pkg.product.defaultOption?.freePhase?.billingPeriod;
  if (freePeriod && freePeriod.value > 0) {
    return { count: freePeriod.value, unit: String(freePeriod.unit).toUpperCase() };
  }

  return null;
}

const TRIAL_UNIT_LABELS: Record<string, string> = {
  DAY: "day",
  WEEK: "week",
  MONTH: "month",
  YEAR: "year",
};

/** "7 days", "1 month". Weeks are spelled in days — that's how a trial gets read. */
function formatTrialLength(trial: { count: number; unit: string } | null): string | null {
  if (!trial) return null;
  if (trial.unit === "WEEK") {
    const days = trial.count * 7;
    return `${days} days`;
  }
  const label = TRIAL_UNIT_LABELS[trial.unit];
  if (!label) return null;
  return trial.count === 1 ? `1 ${label}` : `${trial.count} ${label}s`;
}

export type PlanCopy = {
  pkg: PurchasesPackage;
  /** Store-formatted price with its currency sign. */
  priceString: string;
  /** "month" | "year" | "6 months" … */
  termLabel: string;
  /** "Billed monthly" / "Billed yearly". */
  billedLabel: string;
  /** "7 days" when the store grants a free trial, otherwise null. */
  trialLength: string | null;
  /** Bold line under the billing label: "(7 days trial)" / "(No trial)". */
  trialLabel: string;
};

export function describePlan(pkg: PurchasesPackage): PlanCopy {
  const trialLength = formatTrialLength(resolveFreeTrial(pkg));
  return {
    pkg,
    priceString: pkg.product.priceString,
    termLabel: getTermLabel(pkg),
    billedLabel: getBilledLabel(pkg),
    trialLength,
    trialLabel: trialLength ? `(${trialLength} trial)` : "(No trial)",
  };
}

/**
 * Sorts the offering into the two cards the layout has room for: a short-term
 * anchor on the left and the long-term plan on the right. Package type first,
 * term length as the fallback so a custom-identifier offering still lands
 * somewhere sensible. Either slot can come back null.
 */
export function selectPlanPair(packages: PurchasesPackage[]): {
  monthly: PurchasesPackage | null;
  annual: PurchasesPackage | null;
} {
  let monthly = packages.find((p) => p.packageType === "MONTHLY") ?? null;
  let annual = packages.find((p) => p.packageType === "ANNUAL") ?? null;

  const rest = packages.filter((p) => p !== monthly && p !== annual);

  if (!annual) {
    // Longest remaining term becomes the annual slot, as long as it's the
    // longer of the two — a lone monthly plan should not be dressed as annual.
    const longest = rest.reduce<PurchasesPackage | null>(
      (best, p) => (best === null || getTermMonths(p) > getTermMonths(best) ? p : best),
      null
    );
    if (longest && (!monthly || getTermMonths(longest) > getTermMonths(monthly))) {
      annual = longest;
    }
  }

  if (!monthly) {
    const shortest = rest
      .filter((p) => p !== annual)
      .reduce<PurchasesPackage | null>(
        (best, p) => (best === null || getTermMonths(p) < getTermMonths(best) ? p : best),
        null
      );
    monthly = shortest;
  }

  return { monthly, annual };
}

/** Sticky CTA label. Only promises a trial when the store grants one. */
export function buildCtaLabel(plan: PlanCopy | null): string {
  if (!plan) return "Plans unavailable";
  if (plan.trialLength) return `Start ${plan.trialLength} free trial`;
  return `Subscribe for ${plan.priceString} / ${plan.termLabel}`;
}

/**
 * Two-line honesty caption under the CTA: what the trial costs, what happens
 * after it, and that cancelling is on the table.
 */
export function buildHonestyCaption(plan: PlanCopy | null): string[] {
  if (!plan) {
    return [PAYWALL_COPY.plansUnavailable, PAYWALL_COPY.plansUnavailableHint];
  }
  if (plan.trialLength) {
    return [
      `${plan.trialLength} free, then ${plan.priceString} per ${plan.termLabel}.`,
      "Cancel any time before it ends and you pay nothing.",
    ];
  }
  return [
    `${plan.priceString} per ${plan.termLabel}, no free trial.`,
    "Renews until you cancel — cancel any time.",
  ];
}

/**
 * Auto-renewal disclosure required by Apple's Schedule 2 §3.8(b): product name,
 * price, term, when the account is charged, and how to cancel.
 */
export function buildDisclosure(pkg: PurchasesPackage | null, productName: string): string {
  if (!pkg) {
    return `${productName} is an auto-renewing subscription. Payment is charged to your Apple Account at confirmation of purchase and renews automatically until canceled. Manage or cancel anytime in Settings > Apple Account > Subscriptions.`;
  }

  const term = getTermLabel(pkg);
  const price = pkg.product.priceString;
  return `${productName} is ${price} every ${term}. Payment is charged to your Apple Account at confirmation of purchase. It renews automatically for ${price} every ${term}, and your account is charged within 24 hours before each renewal, unless auto-renew is turned off at least 24 hours before the current period ends. Manage or cancel anytime in Settings > Apple Account > Subscriptions.`;
}
