function utc(
  year: number,
  month: number,
  day: number,
  hour = 0,
  minute = 0
): number {
  return Date.UTC(year, month - 1, day, hour, minute, 0, 0);
}

// Mock purchases to prevent RevenueCat calls in addReminder gate
jest.mock("../../lib/purchases", () => ({
  __esModule: true,
  checkProStatus: jest.fn(async () => false),
}));

// Helper: run a migration test in an isolated module scope so the
// Zustand singleton and loadRemindersInFlight latch are fresh, AND
// the test and store share the same AsyncStorage mock instance.
async function runMigrationTest(
  seedData: unknown[],
  assertions: (reminders: any[]) => void
) {
  await jest.isolateModulesAsync(async () => {
    const AsyncStorage =
      require("@react-native-async-storage/async-storage").default;
    AsyncStorage._reset();

    if (seedData.length > 0) {
      await AsyncStorage.setItem("@reminders", JSON.stringify(seedData));
    }

    const { useReminderStore } = require("../../lib/store");
    await useReminderStore.getState().loadReminders();
    assertions(useReminderStore.getState().reminders);
  });
}

// ─── Schema Migration ───────────────────────────────────────────────────────

describe("loadReminders - schema migration", () => {
  it("leaves v4 reminder unchanged", async () => {
    await runMigrationTest(
      [
        {
          id: "r1",
          title: "V4",
          description: "",
          time: "09:00",
          frequency: "once",
          days: [],
          createdAt: "2026-04-01T00:00:00.000Z",
          schemaVersion: 4,
          scheduleType: "once",
          onceAt: 1000,
          tzid: "UTC",
        },
      ],
      (reminders) => {
        expect(reminders).toHaveLength(1);
        expect(reminders[0].schemaVersion).toBe(4);
        expect(reminders[0].scheduleType).toBe("once");
        expect(reminders[0].tzid).toBe("UTC");
      }
    );
  });

  it("backfills tzid on v4 reminder missing it", async () => {
    await runMigrationTest(
      [
        {
          id: "r2",
          title: "No Tzid",
          description: "",
          time: "10:00",
          frequency: "once",
          days: [],
          createdAt: "2026-04-01T00:00:00.000Z",
          schemaVersion: 4,
          scheduleType: "once",
        },
      ],
      (reminders) => {
        expect(reminders[0].tzid).toBeTruthy();
        expect(reminders[0].schemaVersion).toBe(4);
      }
    );
  });

  it("migrates legacy interval to v4", async () => {
    await runMigrationTest(
      [
        {
          id: "r3",
          title: "Interval",
          description: "",
          time: "14:00",
          frequency: "interval",
          days: [],
          createdAt: "2026-04-01T00:00:00.000Z",
          intervalMs: 600000,
          anchorAt: 1000,
        },
      ],
      (reminders) => {
        expect(reminders[0].schemaVersion).toBe(4);
        expect(reminders[0].scheduleType).toBe("interval");
        expect(reminders[0].tzid).toBeTruthy();
      }
    );
  });

  it("migrates legacy once+date to v4", async () => {
    await runMigrationTest(
      [
        {
          id: "r4",
          title: "Once Date",
          description: "",
          time: "09:00",
          date: "2026-06-15",
          frequency: "once",
          days: [],
          createdAt: "2026-04-01T00:00:00.000Z",
        },
      ],
      (reminders) => {
        expect(reminders[0].schemaVersion).toBe(4);
        expect(reminders[0].scheduleType).toBe("once");
        expect(reminders[0].onceAt).toBe(utc(2026, 6, 15, 9, 0));
      }
    );
  });

  it("migrates legacy once+scheduledFor to v4", async () => {
    await runMigrationTest(
      [
        {
          id: "r5",
          title: "Once SF",
          description: "",
          time: "09:00",
          frequency: "once",
          days: [],
          createdAt: "2026-04-01T00:00:00.000Z",
          scheduledFor: 5000,
        },
      ],
      (reminders) => {
        expect(reminders[0].schemaVersion).toBe(4);
        expect(reminders[0].scheduleType).toBe("once");
        expect(reminders[0].onceAt).toBe(5000);
      }
    );
  });

  it("migrates legacy daily to v4 rrule", async () => {
    await runMigrationTest(
      [
        {
          id: "r6",
          title: "Daily",
          description: "",
          time: "08:00",
          frequency: "daily",
          days: [],
          createdAt: "2026-04-01T00:00:00.000Z",
        },
      ],
      (reminders) => {
        expect(reminders[0].schemaVersion).toBe(4);
        expect(reminders[0].scheduleType).toBe("rrule");
        expect(reminders[0].rrule).toContain("FREQ=DAILY");
      }
    );
  });

  it("migrates legacy weekly+days to v4 rrule", async () => {
    await runMigrationTest(
      [
        {
          id: "r7",
          title: "Weekly",
          description: "",
          time: "10:00",
          frequency: "weekly",
          days: ["mon", "fri"],
          createdAt: "2026-04-01T00:00:00.000Z",
        },
      ],
      (reminders) => {
        expect(reminders[0].schemaVersion).toBe(4);
        expect(reminders[0].scheduleType).toBe("rrule");
        expect(reminders[0].rrule).toContain("BYDAY=MO,FR");
      }
    );
  });

  it("returns empty array for null storage", async () => {
    await runMigrationTest([], (reminders) => {
      expect(reminders).toEqual([]);
    });
  });
});

// ─── CRUD Operations ────────────────────────────────────────────────────────
// These use a shared module, resetting state between tests.

import { useReminderStore } from "../../lib/store";
import AsyncStorage from "@react-native-async-storage/async-storage";

beforeEach(() => {
  (AsyncStorage as any)._reset();
  useReminderStore.setState({
    reminders: [],
    history: [],
    isLoading: false,
    hasLoadedReminders: true,
  });
});

describe("CRUD operations", () => {
  it("addReminder generates id, createdAt, and applies defaults", async () => {
    const result = await useReminderStore.getState().addReminder({
      title: "Test",
      description: "Desc",
      time: "14:00",
      frequency: "once",
      days: [],
    });

    expect(result.id).toBeTruthy();
    expect(result.createdAt).toBeTruthy();
    expect(result.snoozeEnabled).toBe(true);
    expect(result.snoozeDuration).toBe(5);
    expect(result.volume).toBe(1);
    expect(result.volumeStyle).toBe("standard");
    expect(result.schemaVersion).toBe(4);
    expect(useReminderStore.getState().reminders).toHaveLength(1);
  });

  it("addReminder persists to AsyncStorage", async () => {
    await useReminderStore.getState().addReminder({
      title: "Persist",
      description: "",
      time: "09:00",
      frequency: "daily",
      days: [],
    });

    const stored = JSON.parse(
      (await AsyncStorage.getItem("@reminders")) || "[]"
    );
    expect(stored).toHaveLength(1);
    expect(stored[0].title).toBe("Persist");
  });

  it("addReminder rolls back on AsyncStorage failure and rethrows", async () => {
    (AsyncStorage.setItem as jest.Mock).mockRejectedValueOnce(
      new Error("disk full")
    );

    await expect(
      useReminderStore.getState().addReminder({
        title: "Fail",
        description: "",
        time: "09:00",
        frequency: "once",
        days: [],
      })
    ).rejects.toThrow("disk full");

    expect(useReminderStore.getState().reminders).toHaveLength(0);
  });

  it("updateReminder replaces matching reminder and persists", async () => {
    const existing = {
      id: "upd1",
      title: "Original",
      description: "",
      time: "09:00",
      frequency: "once" as const,
      days: [] as string[],
      createdAt: "2026-04-01T00:00:00.000Z",
      schemaVersion: 4,
    };
    useReminderStore.setState({ reminders: [existing] });

    await useReminderStore
      .getState()
      .updateReminder({ ...existing, title: "Updated" });

    expect(useReminderStore.getState().reminders[0].title).toBe("Updated");
  });

  it("updateReminder is a no-op for unknown id", async () => {
    await useReminderStore.getState().updateReminder({
      id: "nonexistent",
      title: "Ghost",
      description: "",
      time: "09:00",
      frequency: "once",
      days: [],
      createdAt: "2026-04-01T00:00:00.000Z",
    });

    expect(useReminderStore.getState().reminders).toHaveLength(0);
  });

  it("updateReminder rolls back on AsyncStorage failure and rethrows", async () => {
    const existing = {
      id: "upd2",
      title: "Original",
      description: "",
      time: "09:00",
      frequency: "once" as const,
      days: [] as string[],
      createdAt: "2026-04-01T00:00:00.000Z",
      schemaVersion: 4,
    };
    useReminderStore.setState({ reminders: [existing] });

    (AsyncStorage.setItem as jest.Mock).mockRejectedValueOnce(
      new Error("write error")
    );

    await expect(
      useReminderStore
        .getState()
        .updateReminder({ ...existing, title: "Should Rollback" })
    ).rejects.toThrow("write error");

    expect(useReminderStore.getState().reminders[0].title).toBe("Original");
  });

  it("deleteReminder removes by id and persists", async () => {
    useReminderStore.setState({
      reminders: [
        {
          id: "del1",
          title: "Delete Me",
          description: "",
          time: "09:00",
          frequency: "once",
          days: [],
          createdAt: "2026-04-01T00:00:00.000Z",
        },
      ],
    });

    await useReminderStore.getState().deleteReminder("del1");
    expect(useReminderStore.getState().reminders).toHaveLength(0);
  });

  it("deleteReminder is a no-op for unknown id", async () => {
    await useReminderStore.getState().deleteReminder("nonexistent");
    expect(useReminderStore.getState().reminders).toHaveLength(0);
  });

  it("getReminderById returns match or undefined", () => {
    useReminderStore.setState({
      reminders: [
        {
          id: "find1",
          title: "Find Me",
          description: "",
          time: "09:00",
          frequency: "once",
          days: [],
          createdAt: "2026-04-01T00:00:00.000Z",
        },
      ],
    });

    expect(useReminderStore.getState().getReminderById("find1")).toBeDefined();
    expect(useReminderStore.getState().getReminderById("find1")!.title).toBe(
      "Find Me"
    );
    expect(
      useReminderStore.getState().getReminderById("missing")
    ).toBeUndefined();
  });
});

// ─── History ────────────────────────────────────────────────────────────────

describe("History", () => {
  it("recordCompletion adds entry with correct fields", async () => {
    await useReminderStore
      .getState()
      .recordCompletion("rem1", "My Reminder", "completed", {
        scheduledFor: 12345,
        action: "dismissed",
      });

    const history = useReminderStore.getState().history;
    expect(history).toHaveLength(1);
    expect(history[0].reminderId).toBe("rem1");
    expect(history[0].reminderTitle).toBe("My Reminder");
    expect(history[0].status).toBe("completed");
    expect(history[0].scheduledFor).toBe(12345);
    expect(history[0].action).toBe("dismissed");
    expect(history[0].id).toBeTruthy();
    expect(history[0].timestamp).toBeTruthy();
  });

  it("recordCompletion trims at 1000 entries keeping newest", async () => {
    const seed = Array.from({ length: 999 }, (_, i) => ({
      id: `h${i}`,
      reminderId: "rem1",
      reminderTitle: "Old",
      timestamp: `2026-01-01T00:${String(Math.floor(i / 60) % 60).padStart(2, "0")}:${String(i % 60).padStart(2, "0")}.000Z`,
      status: "completed" as const,
    }));
    useReminderStore.setState({ history: seed });

    await useReminderStore
      .getState()
      .recordCompletion("rem2", "New 1", "completed");
    await useReminderStore
      .getState()
      .recordCompletion("rem3", "New 2", "missed");

    const history = useReminderStore.getState().history;
    expect(history.length).toBe(1000);
    expect(history[history.length - 1].reminderTitle).toBe("New 2");
    expect(history[history.length - 2].reminderTitle).toBe("New 1");
  });

  it("clearHistory empties history and removes from AsyncStorage", async () => {
    useReminderStore.setState({
      history: [
        {
          id: "h1",
          reminderId: "rem1",
          reminderTitle: "Clear Me",
          timestamp: "2026-04-06T10:00:00.000Z",
          status: "completed" as const,
        },
      ],
    });

    await useReminderStore.getState().clearHistory();

    expect(useReminderStore.getState().history).toEqual([]);
    expect(AsyncStorage.removeItem).toHaveBeenCalledWith("@reminder_history");
  });
});
