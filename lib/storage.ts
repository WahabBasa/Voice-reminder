import AsyncStorage from "@react-native-async-storage/async-storage";
import { createTraceId, perfLog } from "./perf";

const REMINDERS_KEY = "@reminders";
const HISTORY_KEY = "@reminder_history";
const MAX_HISTORY_ENTRIES = 1000;

export type VolumeStyle = "standard" | "progressive";

export const DEFAULT_ALARM_SETTINGS = {
  snoozeEnabled: true,
  snoozeDuration: 5,
  volume: 1,
  volumeStyle: "standard" as VolumeStyle,
};

// Reminder type (local storage version)
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
  createdAt: string;
  snoozeEnabled?: boolean;
  snoozeDuration?: number; // minutes
  volume?: number; // 0-1
  volumeStyle?: VolumeStyle;
}

// Reminder CRUD functions
export async function getReminders(): Promise<Reminder[]> {
  try {
    const traceId = createTraceId("storage");
    const t0 = Date.now();
    perfLog(traceId, "device.storage", "getReminders_getItem_start", { t: t0 });
    const data = await AsyncStorage.getItem(REMINDERS_KEY);
    const t1 = Date.now();

    if (!data) {
      perfLog(traceId, "device.storage", "getReminders_getItem_done", {
        t: t1,
        ms: t1 - t0,
        bytes: 0,
        count: 0,
      });
      return [];
    }

    perfLog(traceId, "device.storage", "getReminders_getItem_done", {
      t: t1,
      ms: t1 - t0,
      bytes: data.length,
    });

    const tParse0 = Date.now();
    perfLog(traceId, "device.storage", "getReminders_parse_start", { t: tParse0 });
    const parsed = JSON.parse(data) as Reminder[];
    const t2 = Date.now();
    perfLog(traceId, "device.storage", "getReminders_parse_done", {
      t: t2,
      ms: t2 - tParse0,
      count: parsed.length,
    });
    return parsed;
  } catch (error) {
    console.error("Error getting reminders:", error);
    return [];
  }
}

export async function addReminder(reminder: Omit<Reminder, "id" | "createdAt">): Promise<Reminder> {
  // Check if user can create more reminders (enforces free tier limit)
  const { checkCanCreateReminder, ReminderLimitExceededError } = await import('./usage');
  const { canCreate, currentCount, limit } = await checkCanCreateReminder();

  if (!canCreate) {
    throw new ReminderLimitExceededError(currentCount, limit);
  }

  try {
    const reminders = await getReminders();
    const newReminder: Reminder = {
      ...reminder,
      id: Math.random().toString(36).substr(2, 9),
      createdAt: new Date().toISOString(),
      snoozeEnabled: reminder.snoozeEnabled ?? DEFAULT_ALARM_SETTINGS.snoozeEnabled,
      snoozeDuration: reminder.snoozeDuration ?? DEFAULT_ALARM_SETTINGS.snoozeDuration,
      volume: reminder.volume ?? DEFAULT_ALARM_SETTINGS.volume,
      volumeStyle: reminder.volumeStyle ?? DEFAULT_ALARM_SETTINGS.volumeStyle,
    };
    reminders.push(newReminder);
    await AsyncStorage.setItem(REMINDERS_KEY, JSON.stringify(reminders));
    return newReminder;
  } catch (error) {
    console.error("Error adding reminder:", error);
    throw error;
  }
}

export async function updateReminder(updatedReminder: Reminder): Promise<void> {
  try {
    const reminders = await getReminders();
    const index = reminders.findIndex((r) => r.id === updatedReminder.id);
    if (index !== -1) {
      reminders[index] = {
        ...updatedReminder,
        snoozeEnabled: updatedReminder.snoozeEnabled ?? DEFAULT_ALARM_SETTINGS.snoozeEnabled,
        snoozeDuration: updatedReminder.snoozeDuration ?? DEFAULT_ALARM_SETTINGS.snoozeDuration,
        volume: updatedReminder.volume ?? DEFAULT_ALARM_SETTINGS.volume,
        volumeStyle: updatedReminder.volumeStyle ?? DEFAULT_ALARM_SETTINGS.volumeStyle,
      };
      await AsyncStorage.setItem(REMINDERS_KEY, JSON.stringify(reminders));
    }
  } catch (error) {
    console.error("Error updating reminder:", error);
    throw error;
  }
}

export async function deleteReminder(id: string): Promise<void> {
  try {
    const reminders = await getReminders();
    const filtered = reminders.filter((r) => r.id !== id);
    await AsyncStorage.setItem(REMINDERS_KEY, JSON.stringify(filtered));
  } catch (error) {
    console.error("Error deleting reminder:", error);
    throw error;
  }
}

export async function getReminderById(id: string): Promise<Reminder | null> {
  try {
    const reminders = await getReminders();
    return reminders.find((r) => r.id === id) || null;
  } catch (error) {
    console.error("Error getting reminder:", error);
    return null;
  }
}

// History types and functions
export interface ReminderHistory {
  id: string;
  reminderId: string;
  reminderTitle: string;
  timestamp: string;
  status: "completed" | "missed";
}

export async function getHistory(): Promise<ReminderHistory[]> {
  try {
    const traceId = createTraceId("storage");
    const t0 = Date.now();
    perfLog(traceId, "device.storage", "getHistory_getItem_start", { t: t0 });
    const data = await AsyncStorage.getItem(HISTORY_KEY);
    const t1 = Date.now();

    if (!data) {
      perfLog(traceId, "device.storage", "getHistory_getItem_done", {
        t: t1,
        ms: t1 - t0,
        bytes: 0,
        count: 0,
      });
      return [];
    }

    perfLog(traceId, "device.storage", "getHistory_getItem_done", {
      t: t1,
      ms: t1 - t0,
      bytes: data.length,
    });

    const tParse0 = Date.now();
    perfLog(traceId, "device.storage", "getHistory_parse_start", { t: tParse0 });
    const parsed = JSON.parse(data) as ReminderHistory[];
    const t2 = Date.now();
    perfLog(traceId, "device.storage", "getHistory_parse_done", {
      t: t2,
      ms: t2 - tParse0,
      count: parsed.length,
    });
    return parsed;
  } catch (error) {
    console.error("Error getting history:", error);
    return [];
  }
}

export async function getTodaysHistory(): Promise<ReminderHistory[]> {
  try {
    const history = await getHistory();
    const today = new Date().toDateString();
    return history.filter(
      (entry) => new Date(entry.timestamp).toDateString() === today
    );
  } catch (error) {
    console.error("Error getting today's history:", error);
    return [];
  }
}

export async function getHistoryForDate(date: Date): Promise<ReminderHistory[]> {
  try {
    const history = await getHistory();
    const dateStr = date.toDateString();
    return history.filter(
      (entry) => new Date(entry.timestamp).toDateString() === dateStr
    );
  } catch (error) {
    console.error("Error getting history for date:", error);
    return [];
  }
}

export async function recordCompletion(
  reminderId: string,
  reminderTitle: string,
  status: "completed" | "missed"
): Promise<void> {
  try {
    const history = await getHistory();
    const newEntry: ReminderHistory = {
      id: Math.random().toString(36).substr(2, 9),
      reminderId,
      reminderTitle,
      timestamp: new Date().toISOString(),
      status,
    };
    history.push(newEntry);
    if (history.length > MAX_HISTORY_ENTRIES) {
      history.splice(0, history.length - MAX_HISTORY_ENTRIES);
    }
    await AsyncStorage.setItem(HISTORY_KEY, JSON.stringify(history));
  } catch (error) {
    console.error("Error recording completion:", error);
    throw error;
  }
}

export async function isCompletedToday(reminderId: string): Promise<boolean> {
  try {
    const todaysHistory = await getTodaysHistory();
    return todaysHistory.some(
      (entry) => entry.reminderId === reminderId && entry.status === "completed"
    );
  } catch (error) {
    console.error("Error checking completion:", error);
    return false;
  }
}

export async function clearHistory(): Promise<void> {
  try {
    await AsyncStorage.removeItem(HISTORY_KEY);
  } catch (error) {
    console.error("Error clearing history:", error);
    throw error;
  }
}
