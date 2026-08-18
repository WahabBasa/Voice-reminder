/**
 * OLD-98: executing the days × times grid inside lib/notifications.ts.
 *
 * One reminder now holds a SET of pending triggers — "Thursday 8 and 9" is one
 * reminder with two rings — so the tests here are about the set staying intact:
 * every planned ring gets a trigger, strays are dropped, and answering one ring
 * never silences the others.
 *
 * The mocks mirror __tests__/lib/alarmKitLadder.test.ts (notifee, filesystem,
 * store, AlarmKit bridge are faked; the grid math and the ladder expansion are
 * the real modules).
 */

jest.mock("@notifee/react-native", () => ({
  __esModule: true,
  default: {
    requestPermission: jest.fn(async () => ({ authorizationStatus: 1 })),
    createChannel: jest.fn(async () => "channel"),
    deleteChannel: jest.fn(async () => undefined),
    createTriggerNotification: jest.fn(async () => "notif"),
    getTriggerNotificationIds: jest.fn(async () => [] as string[]),
    getTriggerNotifications: jest.fn(async () => [] as any[]),
    getDisplayedNotifications: jest.fn(async () => [] as any[]),
    cancelNotification: jest.fn(async () => undefined),
    cancelTriggerNotification: jest.fn(async () => undefined),
    cancelDisplayedNotification: jest.fn(async () => undefined),
    getNotificationSettings: jest.fn(async () => ({ android: { alarm: 1 } })),
    displayNotification: jest.fn(async () => "displayed"),
  },
  AndroidImportance: { HIGH: 4, DEFAULT: 3 },
  AndroidCategory: { ALARM: "alarm", REMINDER: "reminder" },
  AndroidVisibility: { PUBLIC: 1 },
  AndroidLaunchActivityFlag: { SINGLE_TOP: 0, NEW_TASK: 1 },
  TriggerType: { TIMESTAMP: 0 },
  AlarmType: { SET_ALARM_CLOCK: 4 },
  EventType: {
    UNKNOWN: -1,
    DISMISSED: 0,
    PRESS: 1,
    ACTION_PRESS: 2,
    DELIVERED: 3,
    APP_BLOCKED: 4,
    CHANNEL_BLOCKED: 5,
    CHANNEL_GROUP_BLOCKED: 6,
    TRIGGER_NOTIFICATION_CREATED: 7,
  },
}));

jest.mock("expo-file-system/legacy", () => ({
  documentDirectory: "file:///docs/",
  getInfoAsync: jest.fn(async () => ({ exists: false, size: 0 })),
  downloadAsync: jest.fn(async () => ({ status: 200 })),
  deleteAsync: jest.fn(async () => undefined),
}));

jest.mock("../../lib/AudioService", () => ({
  alarmAudioService: {
    play: jest.fn(async () => undefined),
    stop: jest.fn(async () => undefined),
    setVolume: jest.fn(async () => undefined),
  },
}));

jest.mock("../../lib/activityControl", () => ({
  logAppTaskState: jest.fn(async () => undefined),
}));

jest.mock("../../lib/store", () => {
  const state = {
    getReminderById: jest.fn((_id: string) => undefined as any),
    recordCompletion: jest.fn(async () => undefined),
    updateReminder: jest.fn(async () => undefined),
  };
  return { useReminderStore: { getState: () => state } };
});

jest.mock("../../lib/alarmSounds", () => ({
  ensureAlarmSound: jest.fn(async (reminderId: string) => `reminder_${reminderId}.wav`),
  removeAlarmSound: jest.fn(async () => undefined),
}));

jest.mock("../../lib/alarmKit", () => ({
  ...jest.requireActual("../../lib/alarmKit"),
  useAlarmKit: jest.fn(async () => false),
  requestAuthorization: jest.fn(async () => "authorized"),
  scheduleAlarm: jest.fn(async () => "UUID"),
  cancelAlarm: jest.fn(async () => undefined),
  getScheduledAlarms: jest.fn(async () => [] as any[]),
  getAndClearEventLog: jest.fn(async () => [] as any[]),
}));

import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";
import { type GridSchedule } from "../../convex/scheduleShape";
import { resetAppKeyDedupe } from "../../lib/alarmKit";
import {
  cancelDisplayedAlarmNotifications,
  clearPendingAlarm,
  handleNotificationEvent,
  scheduleReminder,
  syncRemindersOnStartup,
  type ReminderNotification,
} from "../../lib/notifications";

const mockNotifee = jest.requireMock("@notifee/react-native").default;
const mockAlarmKit = jest.requireMock("../../lib/alarmKit");
const mockStoreState = jest.requireMock("../../lib/store").useReminderStore.getState();

const ID = "grid1";
const MIN = 60_000;
// Tests run with TZ=UTC (jest.config.js), so local midnight is UTC midnight.
const NOW = Date.UTC(2026, 7, 17, 6, 0, 0, 0); // Monday 06:00
const day = (offset: number, hour: number, minute = 0) =>
  Date.UTC(2026, 7, 17 + offset, hour, minute, 0, 0);

const twoTimesADay: GridSchedule = {
  type: "grid",
  days: { kind: "everyday" },
  times: { kind: "clock", times: ["08:00", "21:00"] },
};

const everyTwoHoursInWindow: GridSchedule = {
  type: "grid",
  days: { kind: "everyday" },
  times: { kind: "interval", everyMinutes: 120, windowStart: "08:00", windowEnd: "22:00" },
};

const everyThirdDay: GridSchedule = {
  type: "grid",
  days: { kind: "everyNDays", interval: 3, startDate: "2026-08-17" },
  times: { kind: "clock", times: ["09:00"] },
};

function reminder(schedule: GridSchedule, overrides: Partial<ReminderNotification> = {}) {
  return {
    id: ID,
    title: "Take your pills",
    description: "Take your pills.",
    time: "08:00",
    frequency: "daily",
    urgency: "routine",
    ...overrides,
    schedule,
  } as ReminderNotification;
}

/** The stored shape syncRemindersOnStartup reads. */
function stored(schedule: GridSchedule, overrides: Record<string, unknown> = {}) {
  return {
    ...reminder(schedule),
    days: [],
    createdAt: "2026-08-10T00:00:00.000Z",
    ...overrides,
  } as any;
}

function triggerIds(): string[] {
  return mockNotifee.createTriggerNotification.mock.calls
    .map(([notification]: [any]) => notification.id)
    .filter((id: string) => id.startsWith("reminder_"));
}

function triggerTimestamps(): number[] {
  return mockNotifee.createTriggerNotification.mock.calls
    .filter(([notification]: [any]) => notification.id.startsWith("reminder_"))
    .map(([, trigger]: [any, any]) => trigger.timestamp);
}

beforeEach(async () => {
  jest.clearAllMocks();
  resetAppKeyDedupe();
  await (AsyncStorage as any)._reset();
  Object.defineProperty(Platform, "OS", { value: "android", configurable: true });
  jest.spyOn(Date, "now").mockReturnValue(NOW);
  mockAlarmKit.useAlarmKit.mockResolvedValue(false as any);
  mockAlarmKit.getScheduledAlarms.mockResolvedValue([] as any);
  mockNotifee.getTriggerNotificationIds.mockResolvedValue([]);
  mockStoreState.getReminderById.mockReturnValue(undefined as any);
});

afterEach(() => {
  jest.restoreAllMocks();
});

// ─── Multi-time days ────────────────────────────────────────────────────────

describe("scheduleReminder — one reminder, several rings a day", () => {
  it("registers a trigger per planned ring", async () => {
    const { triggerTimestamp, notificationId } = await scheduleReminder(
      reminder(twoTimesADay)
    );

    // 08:00 and 21:00 today, plus tomorrow's 08:00 inside the 26h horizon.
    expect(triggerTimestamps()).toEqual([day(0, 8), day(0, 21), day(1, 8)]);
    expect(triggerIds()).toEqual([
      `reminder_${ID}_${day(0, 8)}`,
      `reminder_${ID}_${day(0, 21)}`,
      `reminder_${ID}_${day(1, 8)}`,
    ]);
    // The earliest ring is still what the caller gets back.
    expect(triggerTimestamp).toBe(day(0, 8));
    expect(notificationId).toBe(`reminder_${ID}_${day(0, 8)}`);
  });

  it("carries the grid in the payload so a delivery can plan the next rings", async () => {
    await scheduleReminder(reminder(twoTimesADay));

    const [notification] = mockNotifee.createTriggerNotification.mock.calls[0];
    expect(JSON.parse(notification.data.schedule)).toEqual(twoTimesADay);
    expect(notification.data.scheduledFor).toBe(String(day(0, 8)));
  });

  it("cancels strays but keeps the rings it is about to re-register", async () => {
    mockNotifee.getTriggerNotificationIds.mockResolvedValue([
      `reminder_${ID}_${day(0, 8)}`, // planned — must survive
      `reminder_${ID}_1700000000000`, // an occurrence that no longer exists
      "reminder_other_1700000000000", // another reminder entirely
    ]);

    await scheduleReminder(reminder(twoTimesADay));

    const cancelled = mockNotifee.cancelTriggerNotification.mock.calls
      .map(([id]: [string]) => id)
      .filter((id: string) => id.startsWith("reminder_"));
    expect(cancelled).toEqual([`reminder_${ID}_1700000000000`]);
  });

  it("keeps a legacy reminder on exactly one trigger", async () => {
    await scheduleReminder({
      id: ID,
      title: "Take your pills",
      description: "d",
      time: "18:00",
      frequency: "daily",
    });

    expect(triggerIds()).toHaveLength(1);
  });
});

// ─── Windowed intervals ─────────────────────────────────────────────────────

describe("scheduleReminder — windowed intervals", () => {
  it("only plans rings inside the window", async () => {
    await scheduleReminder(reminder(everyTwoHoursInWindow));

    expect(triggerTimestamps()).toEqual([
      day(0, 8),
      day(0, 10),
      day(0, 12),
      day(0, 14),
    ]);
  });

  it("jumps the overnight gap instead of ringing at 03:00", async () => {
    jest.spyOn(Date, "now").mockReturnValue(day(0, 23));

    await scheduleReminder(reminder(everyTwoHoursInWindow));

    expect(triggerTimestamps()[0]).toBe(day(1, 8));
  });
});

// ─── Every N days ───────────────────────────────────────────────────────────

describe("scheduleReminder — every N days", () => {
  it("rings on the anchor day and then every third day", async () => {
    await scheduleReminder(reminder(everyThirdDay));

    expect(triggerTimestamps()).toEqual([day(0, 9)]);
  });

  it("skips the two days in between", async () => {
    jest.spyOn(Date, "now").mockReturnValue(day(0, 10));

    await scheduleReminder(reminder(everyThirdDay));

    expect(triggerTimestamps()).toEqual([day(3, 9)]);
  });

  it("stops entirely once a bounded recurrence has run out", async () => {
    const bounded: GridSchedule = { ...everyThirdDay, until: day(0, 8) };

    await expect(scheduleReminder(reminder(bounded))).rejects.toThrow(
      /No future occurrence/
    );
  });
});

// ─── Startup reconcile ──────────────────────────────────────────────────────

describe("syncRemindersOnStartup — the whole planned set has to be live", () => {
  it("leaves a reminder alone when every planned ring has a trigger", async () => {
    mockNotifee.getTriggerNotificationIds.mockResolvedValue([
      `reminder_${ID}_${day(0, 8)}`,
      `reminder_${ID}_${day(0, 21)}`,
      `reminder_${ID}_${day(1, 8)}`,
    ]);

    const result = await syncRemindersOnStartup([stored(twoTimesADay)], []);

    expect(result).toMatchObject({ synced: 0, skipped: 1 });
    expect(triggerIds()).toEqual([]);
  });

  it("re-registers the set when only the first ring survived", async () => {
    mockNotifee.getTriggerNotificationIds.mockResolvedValue([
      `reminder_${ID}_${day(0, 8)}`,
    ]);

    const result = await syncRemindersOnStartup([stored(twoTimesADay)], []);

    expect(result).toMatchObject({ synced: 1 });
    expect(triggerIds()).toEqual([
      `reminder_${ID}_${day(0, 8)}`,
      `reminder_${ID}_${day(0, 21)}`,
      `reminder_${ID}_${day(1, 8)}`,
    ]);
  });

  it("skips a grid whose recurrence has ended", async () => {
    const ended: GridSchedule = { ...twoTimesADay, until: day(0, 5) };

    const result = await syncRemindersOnStartup([stored(ended)], []);

    expect(result).toMatchObject({ synced: 0, skipped: 1, failed: 0 });
    expect(triggerIds()).toEqual([]);
  });
});

// ─── AlarmKit: one alarm per occurrence ─────────────────────────────────────

describe("AlarmKit — occurrences must not cancel each other", () => {
  beforeEach(() => {
    Object.defineProperty(Platform, "OS", { value: "ios", configurable: true });
    mockAlarmKit.useAlarmKit.mockResolvedValue(true as any);
  });

  it("registers one alarm per planned occurrence, each with its nag chain", async () => {
    await scheduleReminder(reminder(twoTimesADay));

    // OLD-96: one occurrence is one alarm PLUS the comebacks it may owe, armed
    // up front because nothing of ours runs when a ring times out unattended.
    // Only the nearest rings get a chain (NAG_CHAIN_HORIZON) — the alarm cap is
    // undocumented and a four-deep set × 3 comebacks each would court it.
    const nag = (base: number, minutes: number) => `snooze_${ID}_${base + minutes * 60_000}`;
    expect(mockAlarmKit.scheduleAlarm.mock.calls.map(([o]: [any]) => o.id)).toEqual([
      `reminder_${ID}_${day(0, 8)}`,
      nag(day(0, 8), 5),
      nag(day(0, 8), 10),
      nag(day(0, 8), 15),
      `reminder_${ID}_${day(0, 21)}`,
      nag(day(0, 21), 5),
      nag(day(0, 21), 10),
      nag(day(0, 21), 15),
      `reminder_${ID}_${day(1, 8)}`,
    ]);
    expect(mockAlarmKit.cancelAlarm).not.toHaveBeenCalled();
  });

  it("gives every ring of a chain the sibling list its native intents cancel by", async () => {
    await scheduleReminder(reminder(twoTimesADay));

    const morning = day(0, 8);
    const chain = [
      `reminder_${ID}_${morning}`,
      `snooze_${ID}_${morning + 5 * 60_000}`,
      `snooze_${ID}_${morning + 10 * 60_000}`,
      `snooze_${ID}_${morning + 15 * 60_000}`,
    ];
    const byId = new Map<string, any>(
      mockAlarmKit.scheduleAlarm.mock.calls.map(([o]: [any]) => [o.id, o])
    );

    for (const [index, key] of chain.entries()) {
      expect(byId.get(key).metadata.siblings.split(",")).toEqual(
        chain.filter((other) => other !== key)
      );
      expect(byId.get(key).metadata.nagIndex).toBe(String(index));
      expect(byId.get(key).metadata.nagFor).toBe(String(morning));
    }
    // The evening ring's chain is a different set — answering one must never
    // disarm the other.
    expect(byId.get(`reminder_${ID}_${day(0, 21)}`).metadata.siblings).not.toContain(
      String(morning)
    );
  });

  it("does not cancel the morning alarm while registering the evening one", async () => {
    mockAlarmKit.getScheduledAlarms.mockResolvedValue([
      { id: `reminder_${ID}_${day(0, 8)}`, uuid: "A", fireDate: day(0, 8) },
      { id: `reminder_${ID}_1700000000000`, uuid: "OLD", fireDate: 1_700_000_000_000 },
    ] as any);

    await scheduleReminder(reminder(twoTimesADay));

    expect(
      new Set(mockAlarmKit.cancelAlarm.mock.calls.map(([id]: [string]) => id))
    ).toEqual(new Set([`reminder_${ID}_1700000000000`]));
  });

  it("silences the answered ring and leaves the evening ring registered", async () => {
    mockStoreState.getReminderById.mockReturnValue(stored(twoTimesADay));
    const rang = day(0, 8);
    mockAlarmKit.getScheduledAlarms.mockResolvedValue([
      { id: `reminder_${ID}_${rang}`, uuid: "A", fireDate: rang },
      { id: `reminder_${ID}_${day(0, 21)}`, uuid: "E", fireDate: day(0, 21) },
    ] as any);

    await cancelDisplayedAlarmNotifications(`reminder_${ID}_${rang}`);

    expect(mockAlarmKit.cancelAlarm.mock.calls.map(([id]: [string]) => id)).toEqual([
      `reminder_${ID}_${rang}`,
    ]);
  });

  it("leaves an owed nag alone when a ring is acknowledged", async () => {
    mockStoreState.getReminderById.mockReturnValue(stored(twoTimesADay));
    const rang = day(0, 8);
    mockAlarmKit.getScheduledAlarms.mockResolvedValue([
      { id: `snooze_${ID}_${rang + 5 * MIN}`, uuid: "G", fireDate: rang + 5 * MIN },
    ] as any);

    await cancelDisplayedAlarmNotifications(`reminder_${ID}_${rang}`);

    expect(mockAlarmKit.cancelAlarm).not.toHaveBeenCalledWith(
      `snooze_${ID}_${rang + 5 * MIN}`
    );
  });
});

// ─── Delivery tops the set back up ──────────────────────────────────────────

describe("DELIVERED — the delivered ring is replaced, its siblings are kept", () => {
  const EventType = jest.requireMock("@notifee/react-native").EventType;

  function delivered(scheduledFor: number) {
    return {
      type: EventType.DELIVERED,
      detail: {
        notification: {
          id: `reminder_${ID}_${scheduledFor}`,
          title: "Take your pills",
          body: "Take your pills.",
          data: {
            reminderId: ID,
            frequency: "daily",
            title: "Take your pills",
            description: "Take your pills.",
            kind: "reminder_occurrence",
            scheduledFor: String(scheduledFor),
            schedule: JSON.stringify(twoTimesADay),
          },
        },
      },
    } as any;
  }

  it("adds only the ring that fell off the end of the plan", async () => {
    Object.defineProperty(Platform, "OS", { value: "ios", configurable: true });
    jest.spyOn(Date, "now").mockReturnValue(day(0, 8));
    mockNotifee.getTriggerNotificationIds.mockResolvedValue([
      `reminder_${ID}_${day(0, 21)}`,
      `reminder_${ID}_${day(1, 8)}`,
    ]);

    await handleNotificationEvent(delivered(day(0, 8)));

    // 21:00 tonight and 08:00 tomorrow already exist and are left untouched.
    expect(
      mockNotifee.cancelTriggerNotification.mock.calls
        .map(([id]: [string]) => id)
        .filter((id: string) => id.startsWith("reminder_"))
    ).toEqual([]);
    expect(triggerIds()).toEqual([`reminder_${ID}_${day(1, 21)}`]);

    // The delivery armed a ring-timeout timer; drop it so Jest can exit.
    await clearPendingAlarm({ promoteNext: false });
  });
});
