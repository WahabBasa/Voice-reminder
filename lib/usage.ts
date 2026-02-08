import { useReminderStore } from "./store";
import { isReminderActive } from "./reminderActive";
import {
  MAX_FREE_ACTIVE_REMINDERS,
  type CreateGateResult,
  getFreeActiveLimit,
  checkCanCreateWithCount as checkCanCreateWithCountGate,
  ReminderLimitExceededError,
} from "./usageGate";

export {
  MAX_FREE_ACTIVE_REMINDERS,
  type CreateGateResult,
  getFreeActiveLimit,
  checkCanCreateWithCountGate as checkCanCreateWithCount,
  ReminderLimitExceededError,
};

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
  return checkCanCreateWithCountGate(currentCount);
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
  return checkCanCreateWithCountGate(currentCount);
}

/**
 * Custom error class for limit exceeded
 */
// ReminderLimitExceededError is re-exported from usageGate

