const FREE_LIMIT = 5;

/**
 * Get the current reminder count by counting actual reminders in storage.
 * This is more reliable than a separate counter that can get out of sync.
 */
export async function getReminderCount(): Promise<number> {
    // Dynamically import to avoid circular dependencies
    const { getReminders } = await import('./storage');
    const reminders = await getReminders();
    return reminders.length;
}

/**
 * Check if the user can create a new reminder.
 * Pro users have unlimited reminders, free users are limited to FREE_LIMIT.
 */
export async function canCreateReminder(isPro: boolean): Promise<boolean> {
    if (isPro) return true;
    const count = await getReminderCount();
    return count < FREE_LIMIT;
}

/**
 * Get the free tier limit.
 */
export function getFreeLimit(): number {
    return FREE_LIMIT;
}

/**
 * Check if user can create a reminder by checking RevenueCat entitlements.
 * Returns { canCreate: boolean, isPro: boolean, currentCount: number, limit: number }
 */
export async function checkCanCreateReminder(): Promise<{
    canCreate: boolean;
    isPro: boolean;
    currentCount: number;
    limit: number;
}> {
    // Dynamically import to avoid circular dependencies
    const { checkProStatus } = await import('./purchases');

    const isPro = await checkProStatus();
    const currentCount = await getReminderCount();
    const limit = FREE_LIMIT;

    return {
        canCreate: isPro || currentCount < limit,
        isPro,
        currentCount,
        limit,
    };
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

