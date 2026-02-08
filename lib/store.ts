import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createTraceId, perfLog } from './perf';
import { migrateLegacySchedule } from './schedule';

const REMINDERS_KEY = '@reminders';
const HISTORY_KEY = '@reminder_history';
const MAX_HISTORY_ENTRIES = 1000;

export const INTERVAL_MIN_MS = 5 * 60 * 1000; // 5 minutes (changed from 15)
export const INTERVAL_MAX_MS = 365 * 24 * 60 * 60 * 1000; // 365 days (changed from 7)

export type VolumeStyle = 'standard' | 'progressive';

export const DEFAULT_ALARM_SETTINGS = {
    snoozeEnabled: true,
    snoozeDuration: 5,
    volume: 1,
    volumeStyle: 'standard' as VolumeStyle,
};

// Reminder type
export interface Reminder {
    id: string;
    convexId?: string;
    title: string;
    description: string;
    time: string;
    date?: string; // YYYY-MM-DD for one-time reminders on specific days
    frequency: string;
    days: string[];
    audioUrl?: string;
    audioStatus?: 'pending' | 'ready' | 'failed';
    audioError?: string;
    createdAt: string;
    snoozeEnabled?: boolean;
    snoozeDuration?: number; // minutes
    volume?: number; // 0-1
    volumeStyle?: VolumeStyle;

    // Interval recurrence
    intervalMs?: number;
    anchorAt?: number;
    intervalDays?: number; // Every N days (calendar-based)
    scheduledFor?: number; // Next computed occurrence timestamp (stable cadence)

    // New unified schedule system (Step 1-3)
    scheduleType?: 'once' | 'interval' | 'rrule'; // Canonical schedule type
    onceAt?: number; // Absolute timestamp for one-time reminders
    rrule?: string; // RFC5545 RRULE string for complex recurrences
    dtstart?: number; // Start date for RRULE in ms
    tzid?: string; // Timezone identifier
    until?: number; // End date for bounded recurrences in ms
    parseWarnings?: string[]; // Warnings from parsing/normalization

    // Schema version for migrations
    schemaVersion?: number; // 1 = legacy, 2 = interval support, 3 = custom repetition, 4 = unified schedule
}

// History types
export interface ReminderHistory {
    id: string;
    reminderId: string;
    reminderTitle: string;
    timestamp: string;
    status: 'completed' | 'missed';

    // Occurrence tracking
    scheduledFor?: number;
    action?: 'dismissed' | 'snoozed' | 'fired' | 'auto_completed';
}

// Store state interface
interface ReminderState {
    // Data
    reminders: Reminder[];
    history: ReminderHistory[];
    isLoading: boolean;
    hasLoadedReminders: boolean;

    // Actions - Reminders
    loadReminders: () => Promise<void>;
    addReminder: (reminder: Omit<Reminder, 'id' | 'createdAt'>) => Promise<Reminder>;
    updateReminder: (updatedReminder: Reminder) => Promise<void>;
    deleteReminder: (id: string) => Promise<void>;
    getReminderById: (id: string) => Reminder | undefined;

    // Actions - History
    loadHistory: () => Promise<void>;
    recordCompletion: (
        reminderId: string,
        reminderTitle: string,
        status: 'completed' | 'missed',
        options?: { scheduledFor?: number; action?: ReminderHistory['action'] }
    ) => Promise<void>;
    clearHistory: () => Promise<void>;

    // Combined load
    loadAll: () => Promise<void>;
}

let loadRemindersInFlight: Promise<void> | null = null;

export const useReminderStore = create<ReminderState>((set, get) => ({
    // Initial state
    reminders: [],
    history: [],
    isLoading: false,
    hasLoadedReminders: false,

    // Load reminders from AsyncStorage
    loadReminders: async () => {
        if (loadRemindersInFlight) {
            return loadRemindersInFlight;
        }

        loadRemindersInFlight = (async () => {
            const traceId = createTraceId('storage');
            try {
                const t0 = Date.now();
                perfLog(traceId, 'device.storage', 'getReminders_getItem_start', { t: t0 });

                const data = await AsyncStorage.getItem(REMINDERS_KEY);
                const t1 = Date.now();

                if (!data) {
                    perfLog(traceId, 'device.storage', 'getReminders_getItem_done', {
                        t: t1, ms: t1 - t0, bytes: 0, count: 0,
                    });
                    set({ reminders: [], hasLoadedReminders: true });
                    perfLog(traceId, 'store', 'loadReminders_done', { count: 0 });
                    return;
                }

                perfLog(traceId, 'device.storage', 'getReminders_getItem_done', {
                    t: t1, ms: t1 - t0, bytes: data.length,
                });

                const tParse0 = Date.now();
                perfLog(traceId, 'device.storage', 'getReminders_parse_start', { t: tParse0 });
                let parsed = JSON.parse(data) as Reminder[];

                // Migrate legacy reminders to schemaVersion 4 (unified schedule system)
                let didMigrateAny = false;
                parsed = parsed.map((r) => {
                    // v4+ reminders: ensure tzid exists, otherwise leave unchanged.
                    if (r.schemaVersion && r.schemaVersion >= 4) {
                        if (!r.tzid) {
                            didMigrateAny = true;
                            return {
                                ...r,
                                tzid: Intl.DateTimeFormat().resolvedOptions().timeZone,
                            };
                        }
                        return r;
                    }

                    didMigrateAny = true;

                    // Migrate to v4: unified schedule system
                    const migrated = { ...r };

                    // If already has scheduleType, just bump version
                    if (migrated.scheduleType) {
                        migrated.schemaVersion = 4;
                    } else if (migrated.frequency === 'interval' && migrated.intervalMs && migrated.anchorAt) {
                        // Derive schedule fields from legacy format
                        migrated.scheduleType = 'interval';
                        migrated.schemaVersion = 4;
                    } else if (migrated.frequency === 'once') {
                        migrated.scheduleType = 'once';
                        if (migrated.scheduledFor) {
                            migrated.onceAt = migrated.scheduledFor;
                        } else if (migrated.date && migrated.time) {
                            const [year, month, day] = migrated.date.split('-').map(Number);
                            const [hours, minutes] = migrated.time.split(':').map(Number);
                            migrated.onceAt = new Date(year, month - 1, day, hours, minutes).getTime();
                        }
                        migrated.schemaVersion = 4;
                    } else if (migrated.frequency === 'daily' || migrated.frequency === 'custom' || migrated.frequency === 'weekly') {
                        // Convert to RRULE
                        const schedule = migrateLegacySchedule(migrated);
                        if (schedule.type === 'rrule') {
                            migrated.scheduleType = 'rrule';
                            migrated.rrule = schedule.rrule;
                            migrated.dtstart = schedule.dtstart;
                            migrated.tzid = schedule.tzid;
                        }
                        migrated.schemaVersion = 4;
                    } else {
                        // Unknown legacy frequency - still bump schema version for consistency
                        migrated.schemaVersion = 4;
                    }

                    // Default tzid if not set
                    if (!migrated.tzid) {
                        migrated.tzid = Intl.DateTimeFormat().resolvedOptions().timeZone;
                    }

                    return migrated;
                });

                // Persist migrated reminders back to storage only if any changes were applied
                if (didMigrateAny) {
                    try {
                        await AsyncStorage.setItem(REMINDERS_KEY, JSON.stringify(parsed));
                    } catch {
                        // ignore save errors during migration
                    }
                }
                const t2 = Date.now();
                perfLog(traceId, 'device.storage', 'getReminders_parse_done', {
                    t: t2, ms: t2 - tParse0, count: parsed.length,
                });

                set({ reminders: parsed, hasLoadedReminders: true });
                perfLog(traceId, 'store', 'loadReminders_done', { count: parsed.length });
            } catch (error) {
                console.error('[VR Store] Error loading reminders:', error);
                set({ reminders: [], hasLoadedReminders: true });
                perfLog(traceId, 'store', 'loadReminders_done', { count: 0, error: String(error) });
            }
        })();

        try {
            await loadRemindersInFlight;
        } finally {
            loadRemindersInFlight = null;
        }
    },

    // Add a new reminder
    addReminder: async (reminder) => {
        // Check if user can create more reminders (enforces free tier limit)
        const { checkCanCreateWithCount, getActiveReminderCount, ReminderLimitExceededError } = await import('./usage');
        const gateTraceId = createTraceId('gate');

        // Close cold-start race: ensure reminders are loaded before counting.
        if (!get().hasLoadedReminders) {
            perfLog(gateTraceId, 'store.gate', 'gate_requested_while_not_loaded', {
                currentCount: get().reminders.length,
            });
            await get().loadReminders();
        }

        const currentCount = getActiveReminderCount();
        const { canCreate, limit } = await checkCanCreateWithCount(currentCount);

        if (!canCreate) {
            throw new ReminderLimitExceededError(currentCount, limit);
        }

        const newReminder: Reminder = {
            ...reminder,
            id: Math.random().toString(36).substr(2, 9),
            createdAt: new Date().toISOString(),
            snoozeEnabled: reminder.snoozeEnabled ?? DEFAULT_ALARM_SETTINGS.snoozeEnabled,
            snoozeDuration: reminder.snoozeDuration ?? DEFAULT_ALARM_SETTINGS.snoozeDuration,
            volume: reminder.volume ?? DEFAULT_ALARM_SETTINGS.volume,
            volumeStyle: reminder.volumeStyle ?? DEFAULT_ALARM_SETTINGS.volumeStyle,
            schemaVersion: reminder.schemaVersion ?? 4,
        };

        const currentReminders = get().reminders;
        const updatedReminders = [...currentReminders, newReminder];

        // Update state immediately (optimistic)
        set({ reminders: updatedReminders });

        // Persist to storage
        try {
            await AsyncStorage.setItem(REMINDERS_KEY, JSON.stringify(updatedReminders));
        } catch (error) {
            // Rollback on error
            set({ reminders: currentReminders });
            console.error('[VR Store] Error adding reminder:', error);
            throw error;
        }

        return newReminder;
    },

    // Update an existing reminder
    updateReminder: async (updatedReminder) => {
        const currentReminders = get().reminders;
        const index = currentReminders.findIndex((r) => r.id === updatedReminder.id);

        if (index === -1) {
            console.warn('[VR Store] Reminder not found for update:', updatedReminder.id);
            return;
        }

        const reminderWithDefaults: Reminder = {
            ...updatedReminder,
            snoozeEnabled: updatedReminder.snoozeEnabled ?? DEFAULT_ALARM_SETTINGS.snoozeEnabled,
            snoozeDuration: updatedReminder.snoozeDuration ?? DEFAULT_ALARM_SETTINGS.snoozeDuration,
            volume: updatedReminder.volume ?? DEFAULT_ALARM_SETTINGS.volume,
            volumeStyle: updatedReminder.volumeStyle ?? DEFAULT_ALARM_SETTINGS.volumeStyle,
            schemaVersion: updatedReminder.schemaVersion ?? 4,
        };

        const newReminders = [...currentReminders];
        newReminders[index] = reminderWithDefaults;

        // Update state immediately (optimistic)
        set({ reminders: newReminders });

        // Persist to storage
        try {
            await AsyncStorage.setItem(REMINDERS_KEY, JSON.stringify(newReminders));
        } catch (error) {
            // Rollback on error
            set({ reminders: currentReminders });
            console.error('[VR Store] Error updating reminder:', error);
            throw error;
        }
    },

    // Delete a reminder
    deleteReminder: async (id) => {
        const currentReminders = get().reminders;
        const newReminders = currentReminders.filter((r) => r.id !== id);

        // Update state immediately (optimistic)
        set({ reminders: newReminders });

        // Persist to storage
        try {
            await AsyncStorage.setItem(REMINDERS_KEY, JSON.stringify(newReminders));
        } catch (error) {
            // Rollback on error
            set({ reminders: currentReminders });
            console.error('[VR Store] Error deleting reminder:', error);
            throw error;
        }
    },

    // Get a reminder by ID (synchronous, from current state)
    getReminderById: (id) => {
        return get().reminders.find((r) => r.id === id);
    },

    // Load history from AsyncStorage
    loadHistory: async () => {
        try {
            const traceId = createTraceId('storage');
            const t0 = Date.now();
            perfLog(traceId, 'device.storage', 'getHistory_getItem_start', { t: t0 });

            const data = await AsyncStorage.getItem(HISTORY_KEY);
            const t1 = Date.now();

            if (!data) {
                perfLog(traceId, 'device.storage', 'getHistory_getItem_done', {
                    t: t1, ms: t1 - t0, bytes: 0, count: 0,
                });
                set({ history: [] });
                return;
            }

            perfLog(traceId, 'device.storage', 'getHistory_getItem_done', {
                t: t1, ms: t1 - t0, bytes: data.length,
            });

            const tParse0 = Date.now();
            perfLog(traceId, 'device.storage', 'getHistory_parse_start', { t: tParse0 });
            const parsed = JSON.parse(data) as ReminderHistory[];
            const t2 = Date.now();
            perfLog(traceId, 'device.storage', 'getHistory_parse_done', {
                t: t2, ms: t2 - tParse0, count: parsed.length,
            });

            set({ history: parsed });
        } catch (error) {
            console.error('[VR Store] Error loading history:', error);
            set({ history: [] });
        }
    },

    // Record a completion in history
    recordCompletion: async (reminderId, reminderTitle, status, options) => {
        const currentHistory = get().history;

        const newEntry: ReminderHistory = {
            id: Math.random().toString(36).substr(2, 9),
            reminderId,
            reminderTitle,
            timestamp: new Date().toISOString(),
            status,
            scheduledFor: options?.scheduledFor,
            action: options?.action,
        };

        let updatedHistory = [...currentHistory, newEntry];

        // Trim to max entries
        if (updatedHistory.length > MAX_HISTORY_ENTRIES) {
            updatedHistory = updatedHistory.slice(-MAX_HISTORY_ENTRIES);
        }

        // Update state immediately (optimistic)
        set({ history: updatedHistory });

        // Persist to storage
        try {
            await AsyncStorage.setItem(HISTORY_KEY, JSON.stringify(updatedHistory));
        } catch (error) {
            // Rollback on error
            set({ history: currentHistory });
            console.error('[VR Store] Error recording completion:', error);
            throw error;
        }
    },

    // Clear all history
    clearHistory: async () => {
        const currentHistory = get().history;

        set({ history: [] });

        try {
            await AsyncStorage.removeItem(HISTORY_KEY);
        } catch (error) {
            set({ history: currentHistory });
            console.error('[VR Store] Error clearing history:', error);
            throw error;
        }
    },

    // Load both reminders and history
    loadAll: async () => {
        set({ isLoading: true });
        try {
            await Promise.all([
                get().loadReminders(),
                get().loadHistory(),
            ]);
        } finally {
            set({ isLoading: false });
        }
    },
}));

// Selector hooks for common use cases
export const useReminders = () => useReminderStore((state) => state.reminders);
export const useHistory = () => useReminderStore((state) => state.history);
export const useIsLoading = () => useReminderStore((state) => state.isLoading);
export const useHasLoadedReminders = () => useReminderStore((state) => state.hasLoadedReminders);
