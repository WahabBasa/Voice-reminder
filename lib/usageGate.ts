import { isIntervalGrid, type GridSchedule } from "./schedule";

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

