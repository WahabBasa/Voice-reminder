/**
 * CL-3 ladder wiring inside lib/notifications.ts.
 *
 * lib/notifications.ts is the notifee state machine, so everything it touches
 * that Jest cannot provide is faked here: the notifee native module, the
 * filesystem, the reminder store, and the AlarmKit bridge wrappers. The ladder
 * math itself is NOT faked — `buildAlarmLadder` / `dedupeByAppKey` come from
 * the real lib/alarmKit, so these tests exercise the same expansion the device
 * runs.
 */

// jest.mock factories are hoisted above every declaration in this file, so the
// fakes are built inside the factory and picked up afterwards with
// jest.requireMock — a factory closing over an outer const reads it undefined.

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
    cancelDisplayedNotification: jest.fn(async () => undefined),
    getNotificationSettings: jest.fn(async () => ({ android: { alarm: 1 } })),
    displayNotification: jest.fn(async () => "displayed"),
  },
  AndroidImportance: { HIGH: 4, DEFAULT: 3 },
  AndroidCategory: { ALARM: "alarm" },
  AndroidVisibility: { PUBLIC: 1 },
  AndroidLaunchActivityFlag: { SINGLE_TOP: 0 },
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
  ensureVariantAlarmSound: jest.fn(
    async (reminderId: string, rung: number, wavUrl: string | null) =>
      wavUrl ? `reminder_${reminderId}_v${rung}.wav` : null
  ),
  removeAlarmSound: jest.fn(async () => undefined),
}));

// The AlarmKit bridge wrappers are faked; the ladder math and the de-dup map
// are the real thing, so these tests run the same expansion the device runs.
jest.mock("../../lib/alarmKit", () => ({
  ...jest.requireActual("../../lib/alarmKit"),
  useAlarmKit: jest.fn(async () => true),
  requestAuthorization: jest.fn(async () => "authorized"),
  scheduleAlarm: jest.fn(async () => "UUID"),
  cancelAlarm: jest.fn(async () => undefined),
  getScheduledAlarms: jest.fn(async () => [] as any[]),
  getAndClearEventLog: jest.fn(async () => [] as any[]),
}));

import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";
import { resetAppKeyDedupe, type AlarmKitScheduleOptions } from "../../lib/alarmKit";
import {
  cancelDisplayedAlarmNotifications,
  cancelReminder,
  reconcileAlarmKitEvents,
  scheduleReminder,
  syncRemindersOnStartup,
  type ReminderNotification,
} from "../../lib/notifications";

const mockNotifee = jest.requireMock("@notifee/react-native").default;
const mockAlarmKit = jest.requireMock("../../lib/alarmKit");
const mockStoreState = jest.requireMock("../../lib/store").useReminderStore.getState();

const MIN = 60_000;
const ID = "abc123";

/** Far enough ahead that the whole ladder stays in the future. */
function futureAt(offsetMs = 60 * MIN): number {
  return Date.now() + offsetMs;
}

function reminder(overrides: Partial<ReminderNotification> = {}): ReminderNotification {
  return {
    id: ID,
    title: "Take your evening meds",
    description: "Take your evening meds",
    time: "20:00",
    frequency: "once",
    scheduleType: "once",
    onceAt: futureAt(),
    urgency: "urgent",
    variants: ["v-one", "v-two"],
    variantWavUrls: ["https://cdn/v0.wav", "https://cdn/v1.wav"],
    wavUrl: "https://cdn/base.wav",
    ...overrides,
  };
}

function scheduledCalls(): AlarmKitScheduleOptions[] {
  return mockAlarmKit.scheduleAlarm.mock.calls.map(
    ([opts]: [AlarmKitScheduleOptions]) => opts
  );
}

beforeEach(async () => {
  jest.clearAllMocks();
  resetAppKeyDedupe();
  await (AsyncStorage as any)._reset();
  Object.defineProperty(Platform, "OS", { value: "ios", configurable: true });
  mockAlarmKit.useAlarmKit.mockResolvedValue(true as any);
  mockAlarmKit.getScheduledAlarms.mockResolvedValue([] as any);
  mockAlarmKit.getAndClearEventLog.mockResolvedValue([] as any);
  mockNotifee.getTriggerNotificationIds.mockResolvedValue([]);
  mockStoreState.getReminderById.mockReturnValue(undefined as any);
});

// ─── Ladder expansion at schedule time ──────────────────────────────────────

describe("scheduleReminder — ladder expansion", () => {
  it("registers three staggered alarms for an urgent reminder", async () => {
    const onceAt = futureAt();

    const { triggerTimestamp } = await scheduleReminder(reminder({ onceAt }));

    expect(triggerTimestamp).toBe(onceAt);
    expect(scheduledCalls().map((o) => o.id)).toEqual([
      `reminder_${ID}_${onceAt}`,
      `reminder_${ID}_${onceAt + 3 * MIN}`,
      `reminder_${ID}_${onceAt + 7 * MIN}`,
    ]);
    expect(scheduledCalls().map((o) => o.fireDate)).toEqual([
      onceAt,
      onceAt + 3 * MIN,
      onceAt + 7 * MIN,
    ]);
  });

  it("gives rung 0 the base wav and each later rung its own variant wav", async () => {
    await scheduleReminder(reminder());

    expect(scheduledCalls().map((o) => o.soundName)).toEqual([
      `reminder_${ID}.wav`,
      `reminder_${ID}_v1.wav`,
      `reminder_${ID}_v2.wav`,
    ]);
  });

  it("falls back to the base wav when a rung's variant wav is missing", async () => {
    await scheduleReminder(reminder({ variantWavUrls: ["https://cdn/v0.wav", null] }));

    expect(scheduledCalls().map((o) => o.soundName)).toEqual([
      `reminder_${ID}.wav`,
      `reminder_${ID}_v1.wav`,
      `reminder_${ID}.wav`,
    ]);
  });

  it("carries rung, rungCount and the other rungs' appKeys as metadata", async () => {
    const onceAt = futureAt();

    await scheduleReminder(reminder({ onceAt }));

    const keys = [
      `reminder_${ID}_${onceAt}`,
      `reminder_${ID}_${onceAt + 3 * MIN}`,
      `reminder_${ID}_${onceAt + 7 * MIN}`,
    ];
    const metadata = scheduledCalls().map((o) => o.metadata);
    expect(metadata.map((m) => [m.rung, m.rungCount])).toEqual([
      ["0", "3"],
      ["1", "3"],
      ["2", "3"],
    ]);
    expect(metadata.map((m) => m.siblings)).toEqual([
      `${keys[1]},${keys[2]}`,
      `${keys[0]},${keys[2]}`,
      `${keys[0]},${keys[1]}`,
    ]);
    expect(metadata.map((m) => m.variantIndex)).toEqual(["-1", "0", "1"]);
  });

  it("schedules one alarm and no siblings for a routine reminder", async () => {
    const onceAt = futureAt();

    await scheduleReminder(reminder({ onceAt, urgency: "routine" }));

    expect(scheduledCalls()).toHaveLength(1);
    expect(scheduledCalls()[0].id).toBe(`reminder_${ID}_${onceAt}`);
    expect(scheduledCalls()[0].metadata.siblings).toBe("");
    expect(scheduledCalls()[0].metadata.rungCount).toBe("1");
  });

  it("schedules two alarms for a notice reminder", async () => {
    const onceAt = futureAt();

    await scheduleReminder(reminder({ onceAt, urgency: "notice" }));

    expect(scheduledCalls().map((o) => o.fireDate)).toEqual([onceAt, onceAt + 3 * MIN]);
  });

  it("uses the tighter persistent offsets", async () => {
    const onceAt = futureAt();

    await scheduleReminder(reminder({ onceAt, urgency: "routine", persistent: true }));

    expect(scheduledCalls().map((o) => o.fireDate)).toEqual([
      onceAt,
      onceAt + 2 * MIN,
      onceAt + 5 * MIN,
    ]);
  });

  it("cancels alarms left over from a previous occurrence", async () => {
    const onceAt = futureAt();
    mockAlarmKit.getScheduledAlarms.mockResolvedValue([
      { id: `reminder_${ID}_1700000000000`, uuid: "OLD", fireDate: 1_700_000_000_000 },
      { id: `reminder_${ID}_${onceAt}`, uuid: "KEEP", fireDate: onceAt },
      { id: "reminder_other_1700000000000", uuid: "FOREIGN", fireDate: 1_700_000_000_000 },
    ] as any);

    await scheduleReminder(reminder({ onceAt }));

    expect(mockAlarmKit.cancelAlarm).toHaveBeenCalledWith(`reminder_${ID}_1700000000000`);
    expect(mockAlarmKit.cancelAlarm).not.toHaveBeenCalledWith(`reminder_${ID}_${onceAt}`);
    expect(mockAlarmKit.cancelAlarm).not.toHaveBeenCalledWith(
      "reminder_other_1700000000000"
    );
  });
});

// ─── The gap_resync vs create race ──────────────────────────────────────────

describe("scheduleReminder — in-flight de-dup", () => {
  it("registers one ladder when two callers race on the same occurrence", async () => {
    const onceAt = futureAt();
    const input = reminder({ onceAt });

    await Promise.all([scheduleReminder(input), scheduleReminder({ ...input })]);

    expect(scheduledCalls().map((o) => o.id)).toEqual([
      `reminder_${ID}_${onceAt}`,
      `reminder_${ID}_${onceAt + 3 * MIN}`,
      `reminder_${ID}_${onceAt + 7 * MIN}`,
    ]);
  });

  it("still schedules a second, different occurrence", async () => {
    const first = futureAt();
    const second = futureAt(120 * MIN);

    await Promise.all([
      scheduleReminder(reminder({ onceAt: first, urgency: "routine" })),
      scheduleReminder(reminder({ onceAt: second, urgency: "routine" })),
    ]);

    expect(scheduledCalls().map((o) => o.fireDate).sort()).toEqual([first, second].sort());
  });
});

// ─── Cancel fan-out ─────────────────────────────────────────────────────────

describe("cancelReminder — fan-out over every rung", () => {
  it("cancels all three rungs of the occurrence", async () => {
    const onceAt = futureAt();
    mockAlarmKit.getScheduledAlarms.mockResolvedValue([
      { id: `reminder_${ID}_${onceAt}`, uuid: "A", fireDate: onceAt },
      { id: `reminder_${ID}_${onceAt + 3 * MIN}`, uuid: "B", fireDate: onceAt + 3 * MIN },
      { id: `reminder_${ID}_${onceAt + 7 * MIN}`, uuid: "C", fireDate: onceAt + 7 * MIN },
    ] as any);

    await cancelReminder(ID);

    expect(mockAlarmKit.cancelAlarm.mock.calls.map(([id]: any[]) => id)).toEqual([
      `reminder_${ID}_${onceAt}`,
      `reminder_${ID}_${onceAt + 3 * MIN}`,
      `reminder_${ID}_${onceAt + 7 * MIN}`,
    ]);
  });

  it("silences the remaining rungs when one is acknowledged in-app", async () => {
    const onceAt = futureAt();
    mockAlarmKit.getScheduledAlarms.mockResolvedValue([
      { id: `reminder_${ID}_${onceAt + 3 * MIN}`, uuid: "B", fireDate: onceAt + 3 * MIN },
      { id: `reminder_${ID}_${onceAt + 7 * MIN}`, uuid: "C", fireDate: onceAt + 7 * MIN },
    ] as any);

    await cancelDisplayedAlarmNotifications(`reminder_${ID}_${onceAt}`);

    expect(mockAlarmKit.cancelAlarm.mock.calls.map(([id]: [string]) => id)).toEqual([
      `reminder_${ID}_${onceAt + 3 * MIN}`,
      `reminder_${ID}_${onceAt + 7 * MIN}`,
    ]);
  });

  it("does not reach the alarm registry for a pre-alert notification", async () => {
    await cancelDisplayedAlarmNotifications(`prealert_${ID}_${futureAt()}`);

    expect(mockAlarmKit.getScheduledAlarms).not.toHaveBeenCalled();
  });

  it("leaves another reminder's rungs alone", async () => {
    mockAlarmKit.getScheduledAlarms.mockResolvedValue([
      { id: "reminder_other_1700000000000", uuid: "X", fireDate: 1_700_000_000_000 },
    ] as any);

    await cancelReminder(ID);

    expect(mockAlarmKit.cancelAlarm).not.toHaveBeenCalled();
  });
});

// ─── Reconcile: partial ladders and sibling cancels ─────────────────────────

describe("syncRemindersOnStartup — ladder repair", () => {
  const storedReminder = (onceAt: number) => ({
    id: ID,
    title: "Take your evening meds",
    description: "Take your evening meds",
    time: "20:00",
    frequency: "recurring",
    days: [],
    createdAt: "2026-08-08T00:00:00.000Z",
    scheduleType: "once" as const,
    onceAt,
    urgency: "urgent" as const,
    wavUrl: "https://cdn/base.wav",
  });

  it("schedules the rungs a complete-looking occurrence is missing", async () => {
    const onceAt = futureAt();
    mockAlarmKit.getScheduledAlarms.mockResolvedValue([
      { id: `reminder_${ID}_${onceAt}`, uuid: "A", fireDate: onceAt },
    ] as any);

    await syncRemindersOnStartup([storedReminder(onceAt) as any], []);

    expect(scheduledCalls().map((o) => o.id)).toEqual([
      `reminder_${ID}_${onceAt}`,
      `reminder_${ID}_${onceAt + 3 * MIN}`,
      `reminder_${ID}_${onceAt + 7 * MIN}`,
    ]);
  });

  it("leaves an intact ladder alone", async () => {
    const onceAt = futureAt();
    mockAlarmKit.getScheduledAlarms.mockResolvedValue([
      { id: `reminder_${ID}_${onceAt}`, uuid: "A", fireDate: onceAt },
      { id: `reminder_${ID}_${onceAt + 3 * MIN}`, uuid: "B", fireDate: onceAt + 3 * MIN },
      { id: `reminder_${ID}_${onceAt + 7 * MIN}`, uuid: "C", fireDate: onceAt + 7 * MIN },
    ] as any);

    await syncRemindersOnStartup([storedReminder(onceAt) as any], []);

    expect(mockAlarmKit.scheduleAlarm).not.toHaveBeenCalled();
  });

  it("rebuilds from T, not from the earliest survivor, when rung 0 was evicted", async () => {
    // Rung 0 is gone but T is still in the future: the survivors are a suffix
    // of the ladder, so the repair must restore rung 0 at T and leave rungs 1
    // and 2 where they are — never shift the cadence to T+3/T+6/T+10.
    const onceAt = futureAt();
    mockAlarmKit.getScheduledAlarms.mockResolvedValue([
      { id: `reminder_${ID}_${onceAt + 3 * MIN}`, uuid: "B", fireDate: onceAt + 3 * MIN },
      { id: `reminder_${ID}_${onceAt + 7 * MIN}`, uuid: "C", fireDate: onceAt + 7 * MIN },
    ] as any);

    await syncRemindersOnStartup([storedReminder(onceAt) as any], []);

    expect(scheduledCalls().map((o) => o.fireDate)).toEqual([
      onceAt,
      onceAt + 3 * MIN,
      onceAt + 7 * MIN,
    ]);
  });

  it("does not rebase a mid-flight ladder whose rung 0 already passed", async () => {
    // T is in the past (rung 0 rang, or was evicted after firing) — rebasing on
    // the earliest survivor would cancel the still-live T+7 rung as a stray.
    const onceAt = Date.now() - 1 * MIN;
    mockAlarmKit.getScheduledAlarms.mockResolvedValue([
      { id: `reminder_${ID}_${onceAt + 3 * MIN}`, uuid: "B", fireDate: onceAt + 3 * MIN },
      { id: `reminder_${ID}_${onceAt + 7 * MIN}`, uuid: "C", fireDate: onceAt + 7 * MIN },
    ] as any);

    await syncRemindersOnStartup([storedReminder(onceAt) as any], []);

    expect(mockAlarmKit.scheduleAlarm).not.toHaveBeenCalled();
  });

  it("does not grow a live snooze follow-up into a ladder", async () => {
    const followUpAt = futureAt();
    await AsyncStorage.setItem(
      "@alarmkit_state",
      JSON.stringify({ [ID]: { followUpCount: 1 } })
    );
    mockAlarmKit.getScheduledAlarms.mockResolvedValue([
      { id: `reminder_${ID}_${followUpAt}`, uuid: "F", fireDate: followUpAt },
    ] as any);

    await syncRemindersOnStartup([storedReminder(followUpAt) as any], []);

    expect(mockAlarmKit.scheduleAlarm).not.toHaveBeenCalled();
  });

  it("respects the snooze guard before looking at rungs at all", async () => {
    await AsyncStorage.setItem(
      "@alarmkit_state",
      JSON.stringify({ [ID]: { snoozeUntil: Date.now() + 10 * MIN } })
    );

    await syncRemindersOnStartup([storedReminder(futureAt()) as any], []);

    expect(mockAlarmKit.scheduleAlarm).not.toHaveBeenCalled();
    expect(mockAlarmKit.getScheduledAlarms).toHaveBeenCalled();
  });
});

describe("reconcileAlarmKitEvents — sibling cancels", () => {
  it("records nothing for a rung the native intents cancelled", async () => {
    const onceAt = Date.now() - 5 * MIN;
    mockAlarmKit.getAndClearEventLog.mockResolvedValue([
      { type: "cancelled", id: `reminder_${ID}_${onceAt}`, at: onceAt },
    ] as any);

    const summary = await reconcileAlarmKitEvents();

    expect(summary.cancelled).toBe(1);
    expect(summary.missed).toBe(0);
    expect(mockStoreState.recordCompletion).not.toHaveBeenCalled();
    expect(mockAlarmKit.scheduleAlarm).not.toHaveBeenCalled();
  });

  it("does not resurrect a cancelled rung as a follow-up", async () => {
    const rangAt = Date.now() - 30 * MIN;
    mockStoreState.getReminderById.mockReturnValue({
      id: ID,
      title: "Take your evening meds",
      frequency: "recurring",
      urgency: "urgent",
      variants: ["v-one", "v-two"],
    } as any);
    mockAlarmKit.getAndClearEventLog.mockResolvedValue([
      { type: "fired", id: `reminder_${ID}_${rangAt}`, at: rangAt },
      { type: "cancelled", id: `reminder_${ID}_${rangAt}`, at: rangAt + 1000 },
    ] as any);

    const summary = await reconcileAlarmKitEvents();

    expect(summary).toMatchObject({ cancelled: 1, missed: 0, stopped: 0 });
    expect(mockAlarmKit.scheduleAlarm).not.toHaveBeenCalled();
  });
});

// ─── Android stays on the notifee path ──────────────────────────────────────

describe("Android is untouched by the ladder", () => {
  beforeEach(() => {
    Object.defineProperty(Platform, "OS", { value: "android", configurable: true });
    mockAlarmKit.useAlarmKit.mockResolvedValue(false as any);
  });

  it("schedules exactly one notifee trigger and no native alarm", async () => {
    const onceAt = futureAt();

    const { notificationId } = await scheduleReminder(reminder({ onceAt }));

    expect(notificationId).toBe(`reminder_${ID}_${onceAt}`);
    expect(mockAlarmKit.scheduleAlarm).not.toHaveBeenCalled();
    expect(mockAlarmKit.getScheduledAlarms).not.toHaveBeenCalled();
    expect(mockNotifee.createTriggerNotification).toHaveBeenCalledTimes(1);
  });

  it("never reaches the native registry when cancelling", async () => {
    await cancelReminder(ID);

    expect(mockAlarmKit.getScheduledAlarms).not.toHaveBeenCalled();
    expect(mockAlarmKit.cancelAlarm).not.toHaveBeenCalled();
  });

  it("keeps startup sync on notifee trigger ids", async () => {
    mockNotifee.getTriggerNotificationIds.mockResolvedValue([
      `reminder_${ID}_${futureAt()}`,
    ]);

    await syncRemindersOnStartup(
      [
        {
          id: ID,
          title: "Take your evening meds",
          description: "d",
          time: "20:00",
          frequency: "recurring",
          days: [],
          createdAt: "2026-08-08T00:00:00.000Z",
        } as any,
      ],
      []
    );

    expect(mockAlarmKit.getScheduledAlarms).not.toHaveBeenCalled();
    expect(mockAlarmKit.scheduleAlarm).not.toHaveBeenCalled();
  });
});
