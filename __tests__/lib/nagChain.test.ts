/**
 * OLD-96: the fixed snooze-nag inside lib/notifications.ts.
 *
 * A ring that is dismissed — swiped away, answered with "Later", or left
 * unattended until it times out — comes back with the IDENTICAL audio five
 * minutes later, at most three times, and then goes quiet. "Done" ends the
 * chain. The comeback lives under the `snooze_<id>_` key family so it coexists
 * with the reminder's next scheduled ring.
 *
 * Everything Jest cannot provide is faked (notifee, filesystem, store, AlarmKit
 * bridge); the nag policy itself comes from the real lib/notificationDecisions.
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
    ensurePlaying: jest.fn(async () => true),
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

jest.mock("../../lib/reminderRemoval", () => ({
  removeReminderFully: jest.fn(async () => undefined),
}));

jest.mock("../../lib/alarmSounds", () => ({
  ensureAlarmSound: jest.fn(async (reminderId: string, wavUrl?: string | null) =>
    wavUrl ? `reminder_${reminderId}.wav` : null
  ),
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
import { EventType } from "@notifee/react-native";
import { Platform } from "react-native";
import { resetAppKeyDedupe, type AlarmKitScheduleOptions } from "../../lib/alarmKit";
import { MAX_NAG_COMEBACKS, NAG_DELAY_MINUTES } from "../../lib/notificationDecisions";
import {
  handleNotificationEvent,
  handlePendingAlarmTimeout,
  reconcileAlarmKitEvents,
  refreshNotificationWithAudio,
  resetAlarmKitLaunchRefresh,
  scheduleReminder,
  setPendingAlarm,
  syncRemindersOnStartup,
  type ReminderNotification,
} from "../../lib/notifications";

const mockNotifee = jest.requireMock("@notifee/react-native").default;
const mockAlarmKit = jest.requireMock("../../lib/alarmKit");
const mockStoreState = jest.requireMock("../../lib/store").useReminderStore.getState();

const ID = "nag1";
const MIN = 60_000;
const NAG_MS = NAG_DELAY_MINUTES * MIN;
const RING_TIMEOUT_MS = 3 * MIN;
// Tests run with TZ=UTC (jest.config.js), so local midnight is UTC midnight.
const NOW = Date.UTC(2026, 7, 17, 8, 0, 0, 0);

let clock = NOW;
// lib/notifications.ts remembers the ids of notifications it cancelled itself
// (so its own cancels are not read as user dismissals) in module state that
// outlives a test, so every test rings a distinct occurrence.
let sequence = 0;
let ringAt = NOW - MIN;

/** The occurrence notification that is currently ringing. */
function ring(dataOverrides: Record<string, string> = {}) {
  return {
    id: `reminder_${ID}_${ringAt}`,
    title: "Take your pills",
    body: "Take your pills right now.",
    data: {
      reminderId: ID,
      kind: "reminder_occurrence",
      title: "Take your pills",
      description: "Take your pills right now.",
      audioUrl: "https://cdn/take.mp3",
      scheduledFor: String(ringAt),
      frequency: "daily",
      // The user's old per-reminder snooze duration: the nag ignores it.
      snoozeDuration: "20",
      nagCount: "0",
      ...dataOverrides,
    },
  };
}

function storedReminder(overrides: Record<string, unknown> = {}) {
  return {
    id: ID,
    title: "Take your pills",
    description: "Take your pills right now.",
    time: "08:00",
    frequency: "daily",
    days: [],
    createdAt: "2026-08-10T00:00:00.000Z",
    wavUrl: "https://cdn/take.wav",
    ...overrides,
  } as any;
}

/** Every notifee trigger created under the nag's key family. */
function nagTriggers(): { id: string; data: any; timestamp: number }[] {
  return mockNotifee.createTriggerNotification.mock.calls
    .filter(([notification]: [any]) => notification.id.startsWith(`snooze_${ID}_`))
    .map(([notification, trigger]: [any, any]) => ({
      id: notification.id,
      data: notification.data,
      timestamp: trigger.timestamp,
    }));
}

function scheduledAlarms(): AlarmKitScheduleOptions[] {
  return mockAlarmKit.scheduleAlarm.mock.calls.map(
    ([opts]: [AlarmKitScheduleOptions]) => opts
  );
}

beforeEach(async () => {
  jest.clearAllMocks();
  resetAppKeyDedupe();
  await (AsyncStorage as any)._reset();
  Object.defineProperty(Platform, "OS", { value: "android", configurable: true });
  clock = NOW;
  ringAt = NOW - MIN - sequence++ * 10 * MIN;
  jest.spyOn(Date, "now").mockImplementation(() => clock);
  mockAlarmKit.useAlarmKit.mockResolvedValue(false as any);
  mockAlarmKit.getScheduledAlarms.mockResolvedValue([] as any);
  mockAlarmKit.getAndClearEventLog.mockResolvedValue([] as any);
  mockNotifee.getTriggerNotificationIds.mockResolvedValue([]);
  mockStoreState.getReminderById.mockReturnValue(undefined as any);
});

afterEach(() => {
  jest.restoreAllMocks();
});

// ─── The comeback itself ────────────────────────────────────────────────────

describe("a dismissed ring comes back", () => {
  it("re-schedules the identical take five minutes out when the ring is swiped away", async () => {
    const notification = ring();
    await setPendingAlarm(notification);

    await handleNotificationEvent({
      type: EventType.DISMISSED,
      detail: { notification },
    } as any);

    const [nag] = nagTriggers();
    expect(nag).toBeDefined();
    expect(nag.timestamp).toBe(NOW + NAG_MS);
    expect(nag.data.audioUrl).toBe("https://cdn/take.mp3");
    expect(nag.data.description).toBe("Take your pills right now.");
    expect(nag.data.kind).toBe("snooze_occurrence");
    expect(nag.data.nagCount).toBe("1");
    expect(nag.data.nagReason).toBe("dismissed");
  });

  it("uses the fixed interval, not the reminder's old snooze duration", async () => {
    const notification = ring({ snoozeDuration: "20" });
    await setPendingAlarm(notification);

    await handleNotificationEvent({
      type: EventType.ACTION_PRESS,
      detail: { notification, pressAction: { id: "snooze_action" } },
    } as any);

    expect(nagTriggers()[0].timestamp).toBe(NOW + NAG_MS);
  });

  it("counts an unattended ring as a dismissal", async () => {
    const notification = ring();
    await setPendingAlarm(notification);
    clock = NOW + RING_TIMEOUT_MS;

    const handled = await handlePendingAlarmTimeout(notification.id, "poll");

    expect(handled).toBe(true);
    expect(nagTriggers()[0].data.nagReason).toBe("ring_timeout");
    expect(nagTriggers()[0].timestamp).toBe(clock + NAG_MS);
    expect(mockStoreState.recordCompletion).not.toHaveBeenCalled();
  });

  it("keeps the original occurrence time on the comeback for history", async () => {
    const notification = ring();
    await setPendingAlarm(notification);

    await handleNotificationEvent({
      type: EventType.DISMISSED,
      detail: { notification },
    } as any);

    expect(nagTriggers()[0].data.originalScheduledFor).toBe(String(ringAt));
  });

  it("walks the counter up one comeback at a time", async () => {
    for (const already of ["0", "1", "2"]) {
      jest.clearAllMocks();
      ringAt -= 1000;
      const notification = ring({ nagCount: already });
      await setPendingAlarm(notification);

      await handleNotificationEvent({
        type: EventType.DISMISSED,
        detail: { notification },
      } as any);

      expect(nagTriggers()[0].data.nagCount).toBe(String(Number(already) + 1));
    }
  });

  it("reads a pre-OLD-96 payload's ladder counter so an in-flight ring stays capped", async () => {
    const notification = ring({ nagCount: "", followUpCount: "2" });
    delete (notification.data as any).nagCount;
    await setPendingAlarm(notification);

    await handleNotificationEvent({
      type: EventType.DISMISSED,
      detail: { notification },
    } as any);

    expect(nagTriggers()[0].data.nagCount).toBe("3");
  });
});

// ─── ...three times, then quiet ─────────────────────────────────────────────

describe("the chain ends", () => {
  it("goes quiet and records a miss after the last comeback", async () => {
    mockStoreState.getReminderById.mockReturnValue(storedReminder());
    const notification = ring({ nagCount: String(MAX_NAG_COMEBACKS) });
    await setPendingAlarm(notification);
    clock = NOW + RING_TIMEOUT_MS;

    await handlePendingAlarmTimeout(notification.id, "poll");

    expect(nagTriggers()).toEqual([]);
    expect(mockStoreState.recordCompletion).toHaveBeenCalledWith(
      ID,
      "Take your pills",
      "missed",
      expect.objectContaining({ action: "auto_missed" })
    );
  });

  it("does not come back when the user swipes the last comeback away", async () => {
    const notification = ring({ nagCount: String(MAX_NAG_COMEBACKS) });
    await setPendingAlarm(notification);

    await handleNotificationEvent({
      type: EventType.DISMISSED,
      detail: { notification },
    } as any);

    expect(nagTriggers()).toEqual([]);
  });

  it("stops on Done: no comeback, and the one already owed is cancelled", async () => {
    mockStoreState.getReminderById.mockReturnValue(storedReminder());
    const owed = `snooze_${ID}_${NOW + NAG_MS}`;
    mockNotifee.getTriggerNotificationIds.mockResolvedValue([
      owed,
      `reminder_${ID}_${NOW + 60 * MIN}`,
      `snooze_other_${NOW}`,
    ]);
    const notification = ring();
    await setPendingAlarm(notification);

    await handleNotificationEvent({
      type: EventType.ACTION_PRESS,
      detail: { notification, pressAction: { id: "dismiss_action" } },
    } as any);

    expect(nagTriggers()).toEqual([]);
    expect(mockNotifee.cancelTriggerNotification).toHaveBeenCalledWith(owed);
    expect(mockNotifee.cancelTriggerNotification).not.toHaveBeenCalledWith(
      `snooze_other_${NOW}`
    );
    expect(mockStoreState.recordCompletion).toHaveBeenCalledWith(
      ID,
      "Take your pills",
      "completed",
      expect.objectContaining({ action: "dismissed" })
    );
  });

  it("leaves the reminder's next occurrence armed when Done ends the chain", async () => {
    mockStoreState.getReminderById.mockReturnValue(storedReminder());
    const nextRing = `reminder_${ID}_${NOW + 60 * MIN}`;
    mockNotifee.getTriggerNotificationIds.mockResolvedValue([nextRing]);
    const notification = ring();
    await setPendingAlarm(notification);

    await handleNotificationEvent({
      type: EventType.ACTION_PRESS,
      detail: { notification, pressAction: { id: "dismiss_action" } },
    } as any);

    expect(mockNotifee.cancelTriggerNotification).not.toHaveBeenCalledWith(nextRing);
  });
});

// ─── Coexistence with the reminder's own schedule ───────────────────────────

describe("a nag never fights the schedule", () => {
  it("survives a reschedule of the reminder's occurrences", async () => {
    const owed = `snooze_${ID}_${NOW + NAG_MS}`;
    mockNotifee.getTriggerNotificationIds.mockResolvedValue([
      owed,
      `reminder_${ID}_${NOW - 10 * MIN}`,
    ]);

    await scheduleReminder({
      id: ID,
      title: "Take your pills",
      description: "Take your pills right now.",
      time: "08:00",
      frequency: "daily",
      scheduleType: "once",
      onceAt: NOW + 60 * MIN,
    } as ReminderNotification);

    expect(mockNotifee.cancelTriggerNotification).toHaveBeenCalledWith(
      `reminder_${ID}_${NOW - 10 * MIN}`
    );
    expect(mockNotifee.cancelTriggerNotification).not.toHaveBeenCalledWith(owed);
  });
});

// ─── iOS: one alarm per ring, the nag on its own key ────────────────────────

describe("AlarmKit — the comebacks are pre-scheduled, not reacted to", () => {
  beforeEach(() => {
    Object.defineProperty(Platform, "OS", { value: "ios", configurable: true });
    mockAlarmKit.useAlarmKit.mockResolvedValue(true as any);
    resetAlarmKitLaunchRefresh();
  });

  /** The nag keys of the chain anchored at `origin`. */
  function chainOf(origin: number) {
    return [1, 2, 3].map((step) => `snooze_${ID}_${origin + step * NAG_MS}`);
  }

  it("arms the occurrence and its three comebacks in one go", async () => {
    const onceAt = NOW + 60 * MIN;

    await scheduleReminder({
      id: ID,
      title: "Take your pills",
      description: "Take your pills right now.",
      time: "08:00",
      frequency: "once",
      scheduleType: "once",
      onceAt,
      urgency: "urgent",
      wavUrl: "https://cdn/take.wav",
    } as ReminderNotification);

    // Nothing of ours runs when an AlarmKit ring times out unattended, so a
    // comeback that is not already registered never happens on a locked phone.
    expect(scheduledAlarms().map((o) => o.id)).toEqual([
      `reminder_${ID}_${onceAt}`,
      ...chainOf(onceAt),
    ]);
    expect(scheduledAlarms().every((o) => o.snoozeMinutes === NAG_DELAY_MINUTES)).toBe(true);
    expect(scheduledAlarms()[0].metadata).toEqual({
      reminderId: ID,
      scheduledFor: String(onceAt),
      tier: "urgent",
      nagFor: String(onceAt),
      nagIndex: "0",
      nagMax: String(MAX_NAG_COMEBACKS),
      siblings: chainOf(onceAt).join(","),
    });
  });

  it("gives every comeback the identical audio and title", async () => {
    const onceAt = NOW + 60 * MIN;

    await scheduleReminder({
      id: ID,
      title: "Take your pills",
      description: "Take your pills right now.",
      time: "08:00",
      frequency: "once",
      scheduleType: "once",
      onceAt,
      wavUrl: "https://cdn/take.wav",
    } as ReminderNotification);

    expect(scheduledAlarms().every((o) => o.soundName === `reminder_${ID}.wav`)).toBe(true);
    expect(scheduledAlarms().every((o) => o.title === "Take your pills")).toBe(true);
  });

  it("numbers the chain so the native snooze button can stop at the cap", async () => {
    const onceAt = NOW + 60 * MIN;

    await scheduleReminder({
      id: ID,
      title: "Take your pills",
      time: "08:00",
      frequency: "once",
      scheduleType: "once",
      onceAt,
      wavUrl: "https://cdn/take.wav",
    } as ReminderNotification);

    expect(scheduledAlarms().map((o) => o.metadata.nagIndex)).toEqual(["0", "1", "2", "3"]);
    expect(scheduledAlarms().every((o) => o.metadata.nagFor === String(onceAt))).toBe(true);
    // Each ring lists the OTHERS, so answering any of them kills the rest.
    for (const alarm of scheduledAlarms()) {
      expect(alarm.metadata.siblings.split(",")).not.toContain(alarm.id);
      expect(alarm.metadata.siblings.split(",")).toHaveLength(MAX_NAG_COMEBACKS);
    }
  });

  it("leaves an already-armed chain alone when a ring is found unanswered", async () => {
    const rang = NOW - RING_TIMEOUT_MS;
    mockStoreState.getReminderById.mockReturnValue(storedReminder());
    const nextRing = { id: `reminder_${ID}_${NOW + 60 * MIN}`, uuid: "N", fireDate: NOW + 60 * MIN };
    mockAlarmKit.getScheduledAlarms.mockResolvedValue([
      nextRing,
      { id: `snooze_${ID}_${rang + NAG_MS}`, uuid: "G1", fireDate: rang + NAG_MS },
      { id: `snooze_${ID}_${rang + 2 * NAG_MS}`, uuid: "G2", fireDate: rang + 2 * NAG_MS },
    ] as any);
    mockAlarmKit.getAndClearEventLog.mockResolvedValue([
      { type: "fired", id: `reminder_${ID}_${rang}`, at: rang },
    ] as any);

    const summary = await reconcileAlarmKitEvents();

    // The comeback is already on the daemon's books — reconciliation must not
    // register a second one, and must not call it a miss yet.
    expect(summary.nagged).toBe(1);
    expect(summary.missed).toBe(0);
    expect(scheduledAlarms()).toEqual([]);
    expect(mockAlarmKit.cancelAlarm).not.toHaveBeenCalledWith(nextRing.id);
    expect(mockStoreState.recordCompletion).not.toHaveBeenCalled();
  });

  it("re-arms the chain when the pre-scheduled comebacks went missing", async () => {
    const rang = NOW - RING_TIMEOUT_MS;
    mockStoreState.getReminderById.mockReturnValue(storedReminder());
    mockAlarmKit.getScheduledAlarms.mockResolvedValue([] as any);
    mockAlarmKit.getAndClearEventLog.mockResolvedValue([
      { type: "fired", id: `reminder_${ID}_${rang}`, at: rang },
    ] as any);

    const summary = await reconcileAlarmKitEvents();

    // Rebuilt from the ring time, not from "now": the chain belongs to the ring.
    expect(summary.nagged).toBe(1);
    expect(scheduledAlarms().map((o) => o.id)).toEqual(chainOf(rang));
    expect(scheduledAlarms().every((o) => o.soundName === `reminder_${ID}.wav`)).toBe(true);
    expect(mockStoreState.recordCompletion).not.toHaveBeenCalled();
  });

  it("records one miss — not four — once the whole chain has rung out", async () => {
    const rang = NOW - 30 * MIN;
    mockStoreState.getReminderById.mockReturnValue(storedReminder());
    await AsyncStorage.setItem(
      "@alarmkit_state",
      JSON.stringify({
        [ID]: {
          nagOrigins: Object.fromEntries(chainOf(rang).map((key) => [key, rang])),
        },
      })
    );
    mockAlarmKit.getAndClearEventLog.mockResolvedValue([
      { type: "fired", id: `reminder_${ID}_${rang}`, at: rang },
      ...chainOf(rang).map((key, index) => ({
        type: "fired",
        id: key,
        at: rang + (index + 1) * NAG_MS,
      })),
    ] as any);

    const summary = await reconcileAlarmKitEvents();

    expect(summary.missed).toBe(1);
    // The spent chain is not revived — the reminder simply rolls to its next
    // occurrence (which arms a fresh chain of its own).
    const armed = scheduledAlarms().map((o) => o.id);
    for (const key of chainOf(rang)) expect(armed).not.toContain(key);
    expect(mockStoreState.recordCompletion).toHaveBeenCalledTimes(1);
    // The miss belongs to the occurrence, not to the comeback that rang last.
    expect(mockStoreState.recordCompletion).toHaveBeenCalledWith(
      ID,
      "Take your pills",
      "missed",
      expect.objectContaining({ scheduledFor: rang, action: "auto_missed" })
    );
  });

  it("counts Done on the last comeback as done, not as three misses", async () => {
    const rang = NOW - 20 * MIN;
    mockStoreState.getReminderById.mockReturnValue(storedReminder());
    const chain = chainOf(rang);
    await AsyncStorage.setItem(
      "@alarmkit_state",
      JSON.stringify({ [ID]: { nagOrigins: Object.fromEntries(chain.map((k) => [k, rang])) } })
    );
    mockAlarmKit.getAndClearEventLog.mockResolvedValue([
      { type: "fired", id: `reminder_${ID}_${rang}`, at: rang },
      { type: "fired", id: chain[0], at: rang + NAG_MS },
      { type: "fired", id: chain[1], at: rang + 2 * NAG_MS },
      { type: "stopped", id: chain[1], at: rang + 2 * NAG_MS + 1000 },
    ] as any);

    const summary = await reconcileAlarmKitEvents();

    expect(summary.stopped).toBe(1);
    expect(summary.missed).toBe(0);
    expect(mockStoreState.recordCompletion).toHaveBeenCalledTimes(1);
    expect(mockStoreState.recordCompletion).toHaveBeenCalledWith(
      ID,
      "Take your pills",
      "completed",
      expect.objectContaining({ scheduledFor: rang, action: "dismissed" })
    );
  });

  it("disarms only the answered ring's chain when the user stops the alarm", async () => {
    mockStoreState.getReminderById.mockReturnValue(storedReminder({ frequency: "once" }));
    const rang = NOW - MIN;
    const evening = NOW + 8 * 60 * MIN;
    await AsyncStorage.setItem(
      "@alarmkit_state",
      JSON.stringify({
        [ID]: {
          nagOrigins: {
            ...Object.fromEntries(chainOf(rang).map((k) => [k, rang])),
            ...Object.fromEntries(chainOf(evening).map((k) => [k, evening])),
          },
        },
      })
    );
    mockAlarmKit.getScheduledAlarms.mockResolvedValue(
      [...chainOf(rang), ...chainOf(evening)].map((id) => ({ id, uuid: "G", fireDate: NOW })) as any
    );
    mockAlarmKit.getAndClearEventLog.mockResolvedValue([
      { type: "stopped", id: `reminder_${ID}_${rang}`, at: NOW },
    ] as any);

    const summary = await reconcileAlarmKitEvents();

    expect(summary.stopped).toBe(1);
    const cancelled = mockAlarmKit.cancelAlarm.mock.calls.map(([id]: [string]) => id);
    expect(cancelled).toEqual(expect.arrayContaining(chainOf(rang)));
    // The evening ring still owes its own comebacks.
    for (const key of chainOf(evening)) expect(cancelled).not.toContain(key);
  });

  it("repairs the occurrence set on startup without counting the owed nag", async () => {
    const nextRing = NOW + 60 * MIN;
    mockStoreState.getReminderById.mockReturnValue(storedReminder());
    mockAlarmKit.getScheduledAlarms.mockResolvedValue([
      { id: `snooze_${ID}_${NOW + NAG_MS}`, uuid: "G", fireDate: NOW + NAG_MS },
    ] as any);

    await syncRemindersOnStartup(
      [storedReminder({ scheduleType: "once", onceAt: nextRing })],
      []
    );

    // Only the nag was live, so the occurrence was genuinely missing — and it
    // comes back with its own chain.
    expect(scheduledAlarms().map((o) => o.id)).toEqual([
      `reminder_${ID}_${nextRing}`,
      ...chainOf(nextRing),
    ]);
  });

  it("re-registers live alarms on launch instead of trusting the registry (FB21273655)", async () => {
    const nextRing = NOW + 60 * MIN;
    mockStoreState.getReminderById.mockReturnValue(storedReminder());
    mockAlarmKit.getScheduledAlarms.mockResolvedValue([
      { id: `reminder_${ID}_${nextRing}`, uuid: "N", fireDate: nextRing },
    ] as any);
    const reminders = [storedReminder({ scheduleType: "once", onceAt: nextRing })];

    // The alarm looks intact, so pre-FB21273655 this was a no-op.
    await syncRemindersOnStartup(reminders, []);
    expect(scheduledAlarms().map((o) => o.id)).toEqual([
      `reminder_${ID}_${nextRing}`,
      ...chainOf(nextRing),
    ]);

    // ...but only once per launch: a second sync in the same process is quiet.
    jest.clearAllMocks();
    mockAlarmKit.getScheduledAlarms.mockResolvedValue([
      { id: `reminder_${ID}_${nextRing}`, uuid: "N", fireDate: nextRing },
    ] as any);
    await syncRemindersOnStartup(reminders, []);
    expect(scheduledAlarms()).toEqual([]);
  });

  it("leaves a ringing alarm alone during the launch re-registration", async () => {
    mockStoreState.getReminderById.mockReturnValue(storedReminder());
    mockAlarmKit.getScheduledAlarms.mockResolvedValue([
      { id: `reminder_${ID}_${ringAt}`, uuid: "R", fireDate: ringAt },
    ] as any);

    await syncRemindersOnStartup(
      [storedReminder({ scheduleType: "once", onceAt: ringAt })],
      []
    );

    // Re-registering is cancel-then-schedule; doing that to an alarm that is
    // ringing right now would silence it.
    expect(scheduledAlarms()).toEqual([]);
  });

  it("re-registers the owed nag with the wav once hydration lands", async () => {
    const owed = `snooze_${ID}_${NOW + NAG_MS}`;
    mockStoreState.getReminderById.mockReturnValue(storedReminder());
    mockAlarmKit.getScheduledAlarms.mockResolvedValue([
      { id: owed, uuid: "G", fireDate: NOW + NAG_MS },
      { id: `reminder_${ID}_${NOW + 60 * MIN}`, uuid: "N", fireDate: NOW + 60 * MIN },
      // Already ringing: re-registering would silence it.
      { id: `reminder_${ID}_${ringAt}`, uuid: "R", fireDate: ringAt },
    ] as any);

    await refreshNotificationWithAudio(ID, "https://cdn/take.mp3");

    expect(scheduledAlarms().map((o) => o.id)).toEqual([
      owed,
      `reminder_${ID}_${NOW + 60 * MIN}`,
    ]);
    expect(scheduledAlarms().every((o) => o.soundName === `reminder_${ID}.wav`)).toBe(true);
    // A sound refresh is a full re-register: losing `siblings` here would leave
    // the native intents unable to disarm the chain.
    expect(scheduledAlarms().every((o) => Boolean(o.metadata.siblings))).toBe(true);
  });
});
