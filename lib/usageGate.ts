import { isIntervalGrid, type GridSchedule } from "./schedule";
// Type only, and deliberately from proCardContent rather than purchases: this
// module must stay importable without the native purchases SDK (it reaches the
// SDK through a dynamic import, below). proCardContent holds the SDK-free copy
// of the union, pinned to lib/purchases' by __tests__/lib/proCardContent.test.
import type { ProStatus } from "./proCardContent";

export const MAX_FREE_ACTIVE_REMINDERS = 5;

export type CreateGateResult = {
  canCreate: boolean;
  isPro: boolean;
  currentCount: number;
  limit: number;
};

export function getFreeActiveLimit(): number {
  return MAX_FREE_ACTIVE_REMINDERS;
}

// ─── The tap-time cap gate ──────────────────────────────────────────────────

/** Blocked and told why — the two ways the cap can bite. */
export type CapGateBlock = "blocked_upgrade" | "blocked_unverified";

export type CapGateOutcome = "allow" | CapGateBlock;

/**
 * What happens when someone reaches for a new reminder, given what we know
 * about their plan.
 *
 * The conservative direction never moves: `unknown` grants nothing, so a
 * capped user with an unresolved entitlement is still blocked. What changes is
 * what they are *told*. Collapsing `unknown` into `free` here would sell an
 * upgrade to a subscriber whose check merely failed — the same mistake the
 * Settings card used to make, one layer down and with a purchase attached.
 */
export function resolveCapGateOutcome(
  status: ProStatus,
  activeCount: number,
  limit: number
): CapGateOutcome {
  // A confirmed subscriber has no cap to hit, whatever the count says.
  if (status === "pro") return "allow";

  const safeCount = Number.isFinite(activeCount) ? Math.max(0, activeCount) : 0;
  // Under the cap the plan is irrelevant — this is why an unresolved
  // entitlement costs nothing to the overwhelming majority of taps.
  if (safeCount < limit) return "allow";

  return status === "unknown" ? "blocked_unverified" : "blocked_upgrade";
}

export type CapGateBlockContent = {
  /** One line, for the recording overlay's locked state. */
  statusText: string;
  /** Title and message, for the composer's toast. */
  toastTitle: string;
  toastMessage: string;
  /**
   * Whether this block may route the tap to the paywall. False for the
   * unverified block: we don't know that this user isn't already paying, and
   * asking them to buy again is the failure being fixed.
   */
  offersUpgrade: boolean;
};

/** What each block says. Both surfaces read their copy from here. */
export function getCapGateBlockContent(
  block: CapGateBlock,
  limit: number
): CapGateBlockContent {
  if (block === "blocked_unverified") {
    return {
      statusText: "Can't verify your subscription. Check your internet connection and try again.",
      toastTitle: "Can't verify your subscription",
      toastMessage: "Check your internet connection and try again.",
      offersUpgrade: false,
    };
  }

  return {
    statusText: `You've reached ${limit} active reminders. Upgrade for unlimited.`,
    toastTitle: `You've reached ${limit} active reminders`,
    toastMessage: "Tap to upgrade for unlimited.",
    offersUpgrade: true,
  };
}

/**
 * Gate API when you already have a count.
 * Only hits RevenueCat when count is at/over the free limit.
 *
 * Note: This module intentionally does not import the store to avoid circular deps.
 */
export async function checkCanCreateWithCount(currentCount: number): Promise<CreateGateResult> {
  const limit = MAX_FREE_ACTIVE_REMINDERS;
  const safeCount = Number.isFinite(currentCount) ? Math.max(0, currentCount) : 0;

  if (safeCount < limit) {
    return {
      canCreate: true,
      isPro: false,
      currentCount: safeCount,
      limit,
    };
  }

  const { checkProStatus } = await import("./purchases");
  const isPro = await checkProStatus();

  return {
    canCreate: isPro,
    isPro,
    currentCount: safeCount,
    limit,
  };
}

// ─── Interval mode is Pro (OLD-100) ─────────────────────────────────────────

/**
 * Whether a schedule is one only a subscriber may have. Today that is exactly
 * interval mode — "every 20 minutes from 9 to 5" — while clock times (including
 * several a day), weekdays, every-N-days and dates stay free on both tiers.
 */
export function isPremiumSchedule(schedule: GridSchedule | undefined | null): boolean {
  return isIntervalGrid(schedule);
}

export type PremiumScheduleGateResult = {
  allowed: boolean;
  isPro: boolean;
};

/**
 * Gate API for a schedule that needs Pro.
 *
 * Unlike the active-reminder cap there is no free allowance to spend first, so
 * the entitlement is always the answer — but a cached `true` gives it without a
 * round trip, and an unreachable check reads as "not subscribed" the way every
 * other gate here does.
 */
export async function checkCanUsePremiumSchedule(): Promise<PremiumScheduleGateResult> {
  const { checkProStatus, getCachedProStatus } = await import("./purchases");

  if (getCachedProStatus().isPro === true) {
    return { allowed: true, isPro: true };
  }

  const isPro = await checkProStatus().catch(() => false);
  return { allowed: isPro, isPro };
}

/**
 * Custom error class for limit exceeded.
 */
export class ReminderLimitExceededError extends Error {
  constructor(
    public currentCount: number,
    public limit: number
  ) {
    super(`Reminder limit exceeded: ${currentCount}/${limit}`);
    this.name = "ReminderLimitExceededError";
  }
}

