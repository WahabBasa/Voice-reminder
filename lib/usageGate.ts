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

