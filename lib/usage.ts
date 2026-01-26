import { useReminderStore } from "./store";
import { isReminderActive } from "./reminderActive";

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

export function getActiveReminderCount(): number {
  const { reminders, history } = useReminderStore.getState();
  const nowMs = Date.now();
  let count = 0;
  for (const reminder of reminders) {
    if (isReminderActive(reminder, history, nowMs)) count += 1;
  }
  return count;
}

/**
 * Single gate API for reminder creation.
 * Fast-path: if under limit, don't hit RevenueCat.
 */
export async function checkCanCreateActiveReminder(): Promise<CreateGateResult> {
  const currentCount = getActiveReminderCount();
  return checkCanCreateWithCount(currentCount);
}

/**
 * Gate API when you already have a count.
 * Only hits RevenueCat when count is at/over the free limit.
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

// Backward-compatible exports (keep call sites working)
export async function getReminderCount(): Promise<number> {
  return getActiveReminderCount();
}

export async function canCreateReminder(isPro: boolean): Promise<boolean> {
  if (isPro) return true;
  return getActiveReminderCount() < MAX_FREE_ACTIVE_REMINDERS;
}

export function getFreeLimit(): number {
  return getFreeActiveLimit();
}

export async function checkCanCreateReminder(): Promise<CreateGateResult> {
  return checkCanCreateActiveReminder();
}

export async function checkCanCreateReminderWithCount(currentCount: number): Promise<CreateGateResult> {
  return checkCanCreateWithCount(currentCount);
}

/**
 * Custom error class for limit exceeded
 */
export class ReminderLimitExceededError extends Error {
    constructor(public currentCount: number, public limit: number) {
        super(`Reminder limit exceeded: ${currentCount}/${limit}`);
        this.name = 'ReminderLimitExceededError';
    }
}

