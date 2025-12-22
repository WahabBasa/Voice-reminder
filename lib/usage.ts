import AsyncStorage from '@react-native-async-storage/async-storage';

const REMINDER_COUNT_KEY = 'reminder_count';
const FREE_LIMIT = 5;

/**
 * Get the current reminder count from local storage.
 */
export async function getReminderCount(): Promise<number> {
    try {
        const count = await AsyncStorage.getItem(REMINDER_COUNT_KEY);
        return count ? parseInt(count, 10) : 0;
    } catch (error) {
        console.error('Error getting reminder count:', error);
        return 0;
    }
}

/**
 * Increment the reminder count when a new reminder is created.
 * Returns the new count.
 */
export async function incrementReminderCount(): Promise<number> {
    const current = await getReminderCount();
    const newCount = current + 1;
    try {
        await AsyncStorage.setItem(REMINDER_COUNT_KEY, newCount.toString());
    } catch (error) {
        console.error('Error saving reminder count:', error);
    }
    return newCount;
}

/**
 * Decrement the reminder count when a reminder is deleted.
 * Returns the new count (minimum 0).
 */
export async function decrementReminderCount(): Promise<number> {
    const current = await getReminderCount();
    const newCount = Math.max(0, current - 1);
    try {
        await AsyncStorage.setItem(REMINDER_COUNT_KEY, newCount.toString());
    } catch (error) {
        console.error('Error saving reminder count:', error);
    }
    return newCount;
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
