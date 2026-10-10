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

import { splitTag, t } from "./i18n";
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
 * The pitch is the person, not the feature list: you forget things, and this
 * makes them happen anyway. The mechanism only shows up as the reason to
 * believe it — an alarm that says the reminder out loud, so you know what it is
 * the second it rings.
 *
 * Copy targets everyday forgetting — the thing that slipped your mind — and
 * never memory conditions, health outcomes, or how the app is built under the
 * hood (no provider names anywhere in user-facing strings).
 */
export const PAYWALL_COPY = {
  /** Three lines, one per row of the serif display hero. */
  get heroLines(): string[] {
    return [t("paywall.hero.default.line1"), t("paywall.hero.default.line2"), t("paywall.hero.default.line3")];
  },
  get heroSubtitle() {
    return t("paywall.hero.default.subtitle");
  },
  get affinityLine() {
    return t("paywall.affinity");
  },
  get featureHeading() {
    return t("paywall.table.heading");
  },
  get closingHeadline() {
    return t("paywall.closing.headline");
  },
  get brandStatement() {
    return t("paywall.closing.brand");
  },
  get restoreLabel() {
    return t("paywall.restore");
  },
  /** Annual card pill. A value claim we can stand behind — not a popularity one. */
  get annualBadge() {
    return t("paywall.card.badge");
  },
  get plansUnavailable() {
    return t("paywall.plansUnavailable");
  },
  get plansUnavailableHint() {
    return t("paywall.plansUnavailable.hint");
  },
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

const HERO_COPY: Record<PaywallContext, () => HeroCopy> = {
  default: () => ({ lines: PAYWALL_COPY.heroLines, subtitle: PAYWALL_COPY.heroSubtitle }),
  interval: () => ({
    lines: [t("paywall.hero.interval.line1"), t("paywall.hero.interval.line2"), t("paywall.hero.interval.line3")],
    subtitle: t("paywall.hero.interval.subtitle"),
  }),
};

/** Route params arrive as strings (or arrays of them), and may be anything. */
export function resolvePaywallContext(value: unknown): PaywallContext {
  const key = Array.isArray(value) ? value[0] : value;
  return key === "interval" ? "interval" : "default";
}

export function getHeroCopy(context: PaywallContext): HeroCopy {
  return HERO_COPY[context]();
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
    { feature: t("paywall.table.row.voice"), pro: CHECK, free: CHECK },
    { feature: t("paywall.table.row.spokenAlarms"), pro: CHECK, free: CHECK },
    { feature: t("paywall.table.row.severalTimes"), pro: CHECK, free: CHECK },
    { feature: t("paywall.table.row.schedules"), pro: CHECK, free: CHECK },
    {
      feature: t("paywall.table.row.activeCount"),
      pro: text(t("paywall.table.cell.unlimited")),
      free: text(String(freeLimit)),
    },
    { feature: t("paywall.table.row.interval"), pro: CHECK, free: NONE },
  ];
}

// ---------------------------------------------------------------------------
// Store data → card copy
// ---------------------------------------------------------------------------

type TermUnit = "day" | "week" | "month" | "year";
type Term = { count: number; unit: TermUnit };

const PERIOD_UNITS: Record<string, TermUnit> = { D: "day", W: "week", M: "month", Y: "year" };
const PERIOD_UNIT_MONTHS: Record<string, number> = { D: 1 / 30, W: 1 / 4.345, M: 1, Y: 12 };

const PACKAGE_TYPE_TERMS: Record<string, Term> = {
  WEEKLY: { count: 1, unit: "week" },
  MONTHLY: { count: 1, unit: "month" },
  TWO_MONTH: { count: 2, unit: "month" },
  THREE_MONTH: { count: 3, unit: "month" },
  SIX_MONTH: { count: 6, unit: "month" },
  ANNUAL: { count: 1, unit: "year" },
};

/** Each unit's catalog key, spelled out so the key checker can see them. */
const TERM_LABEL: Record<TermUnit, (count: number) => string> = {
  day: (count) => t("paywall.term.day", { count }),
  week: (count) => t("paywall.term.week", { count }),
  month: (count) => t("paywall.term.month", { count }),
  year: (count) => t("paywall.term.year", { count }),
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

/** The billing term: store data first, package type as fallback. Null when neither says. */
function getTerm(pkg: PurchasesPackage): Term | null {
  const parsed = parsePeriod(pkg);
  const unit = parsed ? PERIOD_UNITS[parsed.unit] : undefined;
  if (parsed && unit) return { count: parsed.count, unit };
  return PACKAGE_TYPE_TERMS[pkg.packageType] ?? null;
}

/** Billing term as words: "month", "year", "6 months". */
export function getTermLabel(pkg: PurchasesPackage): string {
  const term = getTerm(pkg);
  return term ? TERM_LABEL[term.unit](term.count) : t("paywall.term.fallback");
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
  const term = getTerm(pkg);
  if (term?.count === 1 && term.unit === "month") return t("paywall.billed.monthly");
  if (term?.count === 1 && term.unit === "year") return t("paywall.billed.yearly");
  if (term?.count === 1 && term.unit === "week") return t("paywall.billed.weekly");
  return t("paywall.billed.every", { term: getTermLabel(pkg) });
}

const TERM_SHORT_LABELS: Record<TermUnit, () => string> = {
  month: () => t("paywall.termShort.month"),
  year: () => t("paywall.termShort.year"),
  week: () => t("paywall.termShort.week"),
  day: () => t("paywall.termShort.day"),
};

/**
 * "mo" / "yr" — the price-tag suffix in the footer caption ("$39.99/yr").
 * Anything without a natural abbreviation keeps its long form.
 */
export function getShortTermLabel(pkg: PurchasesPackage): string {
  const term = getTerm(pkg);
  return term?.count === 1 ? TERM_SHORT_LABELS[term.unit]() : getTermLabel(pkg);
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

const TRIAL_LENGTH: Record<string, (count: number) => string> = {
  DAY: (count) => t("paywall.trial.days", { count }),
  MONTH: (count) => t("paywall.trial.months", { count }),
  YEAR: (count) => t("paywall.trial.years", { count }),
};

/** "7 days", "1 month". Weeks are spelled in days — that's how a trial gets read. */
function formatTrialLength(trial: { count: number; unit: string } | null): string | null {
  if (!trial) return null;
  if (trial.unit === "WEEK") return TRIAL_LENGTH.DAY(trial.count * 7);
  const length = TRIAL_LENGTH[trial.unit];
  return length ? length(trial.count) : null;
}

export type PlanCopy = {
  pkg: PurchasesPackage;
  /** Store-formatted price with its currency sign. */
  priceString: string;
  /** "month" | "year" | "6 months" … */
  termLabel: string;
  /** "mo" | "yr" | "wk" — price-tag suffix for the footer caption. */
  termShortLabel: string;
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
    termShortLabel: getShortTermLabel(pkg),
    billedLabel: getBilledLabel(pkg),
    trialLength,
    trialLabel: trialLength ? t("paywall.trialLabel", { length: trialLength }) : t("paywall.noTrial"),
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
  if (!plan) return t("paywall.cta.unavailable");
  if (plan.trialLength) return t("paywall.cta.trial", { length: plan.trialLength });
  return t("paywall.cta.subscribe", { price: plan.priceString, term: plan.termLabel });
}

/**
 * A run of caption text. `bold` is the only variation the footer draws — the
 * whole caption is one ink, so emphasis has to come from weight.
 */
export type CaptionSegment = { text: string; bold?: boolean };
/** One rendered line: the footer joins these into a single <Text>. */
export type CaptionLine = CaptionSegment[];

/** "No commitment. Cancel anytime." — true on both plans, so it never varies. */
const commitmentLine = () => t("paywall.caption.commitment");

/** A caption sentence with its `<b>` run marked bold, empty runs dropped. */
function boldRun(message: string): CaptionLine {
  const { before, inner, after } = splitTag(message, "b");
  const line: CaptionLine = [];
  if (before) line.push({ text: before });
  if (inner) line.push({ text: inner, bold: true });
  if (after) line.push({ text: after });
  return line;
}

/** Flattens a caption line back to plain text (labels, tests, logs). */
export function captionLineToString(line: CaptionLine): string {
  return line.map((segment) => segment.text).join("");
}

/**
 * Two-line honesty caption under the CTA: what the trial costs, what it turns
 * into, and that cancelling is on the table. The price run comes back marked
 * bold so the footer can weight it without knowing how the sentence is built.
 */
export function buildHonestyCaption(plan: PlanCopy | null): CaptionLine[] {
  if (!plan) {
    return [[{ text: PAYWALL_COPY.plansUnavailable }], [{ text: PAYWALL_COPY.plansUnavailableHint }]];
  }

  const price = { price: plan.priceString, termShort: plan.termShortLabel };

  if (plan.trialLength) {
    return [
      boldRun(t("paywall.caption.trial", { length: plan.trialLength, ...price })),
      [{ text: commitmentLine() }],
    ];
  }

  return [boldRun(t("paywall.caption.noTrial", price)), [{ text: commitmentLine() }]];
}

/**
 * Auto-renewal disclosure required by Apple's Schedule 2 §3.8(b): product name,
 * price, term, when the account is charged, and how to cancel.
 */
export function buildDisclosure(pkg: PurchasesPackage | null, productName: string): string {
  if (!pkg) {
    return t("paywall.legal.disclosure.generic", { product: productName });
  }

  const term = getTermLabel(pkg);
  const price = pkg.product.priceString;
  return t("paywall.legal.disclosure.priced", { product: productName, price, term });
}
