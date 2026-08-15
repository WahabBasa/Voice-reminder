import { NativeModules, Platform } from "react-native";

/**
 * AK-4 wrapper tests.
 *
 * The native module does not exist in Jest, so every suite either runs against
 * the absent bridge (the Android / iOS < 26 regression case) or installs a
 * fake AlarmKitBridge on NativeModules and re-imports lib/alarmKit inside an
 * isolated module registry — the wrapper captures the bridge at module load.
 */

type Bridge = {
  isSupported: jest.Mock;
  requestAuthorization: jest.Mock;
  scheduleAlarm: jest.Mock;
  cancelAlarm: jest.Mock;
  getScheduledAlarms: jest.Mock;
  getAndClearEventLog: jest.Mock;
};

function makeBridge(overrides: Partial<Bridge> = {}): Bridge {
  return {
    isSupported: jest.fn(async () => true),
    requestAuthorization: jest.fn(async () => "authorized"),
    scheduleAlarm: jest.fn(async () => "UUID-1"),
    cancelAlarm: jest.fn(async () => undefined),
    getScheduledAlarms: jest.fn(async () => []),
    getAndClearEventLog: jest.fn(async () => []),
    ...overrides,
  } as Bridge;
}

/**
 * Load lib/alarmKit with a given platform + bridge in place. Both are restored
 * afterwards so the "no bridge" suites keep seeing the real Jest environment.
 */
async function withAlarmKit(
  opts: { os?: "ios" | "android"; bridge?: Bridge | null },
  run: (alarmKit: any, bridge: Bridge | null) => Promise<void> | void
): Promise<void> {
  const bridge = opts.bridge === undefined ? makeBridge() : opts.bridge;

  try {
    await jest.isolateModulesAsync(async () => {
      // The isolated registry hands out its own react-native instance, so the
      // platform/bridge have to be patched on that copy, not the outer one.
      const RN = require("react-native");
      Object.defineProperty(RN.Platform, "OS", {
        value: opts.os ?? "ios",
        configurable: true,
        writable: true,
      });
      if (bridge) {
        RN.NativeModules.AlarmKitBridge = bridge;
      } else {
        delete RN.NativeModules.AlarmKitBridge;
      }

      const alarmKit = require("../../lib/alarmKit");
      await run(alarmKit, bridge);
    });
  } finally {
    delete (NativeModules as any).AlarmKitBridge;
  }
}

const T = 1_786_000_000_000;
const MIN = 60_000;
const KEY = "reminder_abc123_1786000000000";

// ─── Group 1: gate decision ─────────────────────────────────────────────────

describe("useAlarmKit gate decision", () => {
  it("is false when the native bridge is absent (Jest / iOS < 26)", async () => {
    await withAlarmKit({ os: "ios", bridge: null }, async (alarmKit) => {
      await expect(alarmKit.useAlarmKit()).resolves.toBe(false);
      expect(alarmKit.isAlarmKitLinked()).toBe(false);
    });
  });

  it("is false on Android even if a bridge object is somehow present", async () => {
    await withAlarmKit({ os: "android" }, async (alarmKit, bridge) => {
      await expect(alarmKit.useAlarmKit()).resolves.toBe(false);
      expect(bridge!.isSupported).not.toHaveBeenCalled();
      expect(bridge!.requestAuthorization).not.toHaveBeenCalled();
    });
  });

  it("is false when the OS reports the framework unsupported", async () => {
    const bridge = makeBridge({ isSupported: jest.fn(async () => false) });
    await withAlarmKit({ bridge }, async (alarmKit) => {
      await expect(alarmKit.useAlarmKit()).resolves.toBe(false);
      expect(bridge.requestAuthorization).not.toHaveBeenCalled();
    });
  });

  it("is false when authorization is denied", async () => {
    const bridge = makeBridge({ requestAuthorization: jest.fn(async () => "denied") });
    await withAlarmKit({ bridge }, async (alarmKit) => {
      await expect(alarmKit.useAlarmKit()).resolves.toBe(false);
    });
  });

  it("is false while authorization is still notDetermined", async () => {
    const bridge = makeBridge({
      requestAuthorization: jest.fn(async () => "notDetermined"),
    });
    await withAlarmKit({ bridge }, async (alarmKit) => {
      await expect(alarmKit.useAlarmKit()).resolves.toBe(false);
    });
  });

  it("is true on iOS 26 with the framework supported and authorized", async () => {
    await withAlarmKit({}, async (alarmKit) => {
      await expect(alarmKit.useAlarmKit()).resolves.toBe(true);
    });
  });

  it("caches the decision for the session", async () => {
    await withAlarmKit({}, async (alarmKit, bridge) => {
      await alarmKit.useAlarmKit();
      await alarmKit.useAlarmKit();
      await alarmKit.useAlarmKit();
      expect(bridge!.isSupported).toHaveBeenCalledTimes(1);
      expect(bridge!.requestAuthorization).toHaveBeenCalledTimes(1);
    });
  });

  it("re-evaluates after resetAlarmKitDecision", async () => {
    await withAlarmKit({}, async (alarmKit, bridge) => {
      await alarmKit.useAlarmKit();
      alarmKit.resetAlarmKitDecision();
      await alarmKit.useAlarmKit();
      expect(bridge!.isSupported).toHaveBeenCalledTimes(2);
    });
  });

  it("stays false when the bridge throws instead of answering", async () => {
    const bridge = makeBridge({
      isSupported: jest.fn(async () => {
        throw new Error("bridge exploded");
      }),
    });
    await withAlarmKit({ bridge }, async (alarmKit) => {
      await expect(alarmKit.useAlarmKit()).resolves.toBe(false);
    });
  });

  it("normalizes an unknown authorization string to notDetermined", async () => {
    const bridge = makeBridge({ requestAuthorization: jest.fn(async () => "weird") });
    await withAlarmKit({ bridge }, async (alarmKit) => {
      await expect(alarmKit.requestAuthorization()).resolves.toBe("notDetermined");
    });
  });
});

// ─── Group 2: app key format ────────────────────────────────────────────────

describe("app key format", () => {
  const alarmKit = require("../../lib/alarmKit");

  it("builds reminder_{reminderId}_{scheduledFor}", () => {
    expect(alarmKit.alarmAppKey("abc123", T)).toBe("reminder_abc123_1786000000000");
  });

  it("round-trips through parseAlarmAppKey", () => {
    expect(alarmKit.parseAlarmAppKey(alarmKit.alarmAppKey("abc123", T))).toEqual({
      reminderId: "abc123",
      scheduledFor: T,
    });
  });

  it("also parses a nag comeback key back to its reminder (OLD-96)", () => {
    expect(alarmKit.parseAlarmAppKey(alarmKit.nagAppKey("abc123", T))).toEqual({
      reminderId: "abc123",
      scheduledFor: T,
    });
  });

  it("rejects a key from another family", () => {
    expect(alarmKit.parseAlarmAppKey("prealert_abc123_1786000000000")).toBeNull();
  });

  it("rejects a key with no timestamp", () => {
    expect(alarmKit.parseAlarmAppKey("reminder_abc123")).toBeNull();
  });

  it("rejects a non-numeric timestamp", () => {
    expect(alarmKit.parseAlarmAppKey("reminder_abc123_later")).toBeNull();
  });
});

// ─── Group 3: bridge passthrough ────────────────────────────────────────────

describe("bridge passthrough", () => {
  const opts = {
    id: KEY,
    fireDate: T,
    title: "Take your evening meds",
    soundName: "reminder_abc123.wav",
    snoozeMinutes: 5,
    metadata: { reminderId: "abc123", scheduledFor: String(T), tier: "urgent", variantIndex: "-1" },
  };

  it("forwards scheduleAlarm and returns the native UUID", async () => {
    await withAlarmKit({}, async (alarmKit, bridge) => {
      await expect(alarmKit.scheduleAlarm(opts)).resolves.toBe("UUID-1");
      expect(bridge!.scheduleAlarm).toHaveBeenCalledWith(opts);
    });
  });

  it("returns null instead of throwing when scheduling rejects", async () => {
    const bridge = makeBridge({
      scheduleAlarm: jest.fn(async () => {
        throw new Error("AlarmKit refused");
      }),
    });
    await withAlarmKit({ bridge }, async (alarmKit) => {
      await expect(alarmKit.scheduleAlarm(opts)).resolves.toBeNull();
    });
  });

  it("forwards cancelAlarm by app key", async () => {
    await withAlarmKit({}, async (alarmKit, bridge) => {
      await alarmKit.cancelAlarm(KEY);
      expect(bridge!.cancelAlarm).toHaveBeenCalledWith(KEY);
    });
  });

  it("swallows a cancel rejection (contract: resolves silently)", async () => {
    const bridge = makeBridge({
      cancelAlarm: jest.fn(async () => {
        throw new Error("unknown key");
      }),
    });
    await withAlarmKit({ bridge }, async (alarmKit) => {
      await expect(alarmKit.cancelAlarm(KEY)).resolves.toBeUndefined();
    });
  });

  it("drops malformed rows from getScheduledAlarms", async () => {
    const bridge = makeBridge({
      getScheduledAlarms: jest.fn(async () => [
        { id: KEY, uuid: "UUID-1", fireDate: T },
        { uuid: "UUID-2", fireDate: T },
        null,
      ]),
    });
    await withAlarmKit({ bridge }, async (alarmKit) => {
      await expect(alarmKit.getScheduledAlarms()).resolves.toEqual([
        { id: KEY, uuid: "UUID-1", fireDate: T },
      ]);
    });
  });

  it("drops malformed rows from getAndClearEventLog", async () => {
    const bridge = makeBridge({
      getAndClearEventLog: jest.fn(async () => [
        { type: "stopped", id: KEY, at: T },
        { type: "bogus", id: KEY, at: T },
        { type: "fired", id: KEY },
      ]),
    });
    await withAlarmKit({ bridge }, async (alarmKit) => {
      await expect(alarmKit.getAndClearEventLog()).resolves.toEqual([
        { type: "stopped", id: KEY, at: T },
      ]);
    });
  });
});

// ─── Group 4: reconciliation branching ──────────────────────────────────────

describe("reconcileAlarmEvents branching", () => {
  const { reconcileAlarmEvents, ALARM_RING_TIMEOUT_MS } = require("../../lib/alarmKit");

  it("maps a lone stop to completed and unlocks rescheduling", () => {
    expect(reconcileAlarmEvents([{ type: "stopped", id: KEY, at: T }], T + 1000)).toEqual([
      { id: KEY, outcome: "completed", allowReschedule: true },
    ]);
  });

  it("guard 2 — the spurious stop iOS fires alongside Snooze does not complete", () => {
    const [result] = reconcileAlarmEvents(
      [
        { type: "snoozed", id: KEY, at: T, snoozeUntil: T + 5 * MIN },
        { type: "stopped", id: KEY, at: T + 50 },
      ],
      T + MIN
    );
    expect(result.outcome).toBe("snoozed");
  });

  it("guard 3 — an open snooze window blocks recalculation", () => {
    const [result] = reconcileAlarmEvents(
      [{ type: "snoozed", id: KEY, at: T, snoozeUntil: T + 5 * MIN }],
      T + MIN
    );
    expect(result.allowReschedule).toBe(false);
    expect(result.snoozeUntil).toBe(T + 5 * MIN);
  });

  it("guard 3 — a closed snooze window releases the block", () => {
    const [result] = reconcileAlarmEvents(
      [{ type: "snoozed", id: KEY, at: T, snoozeUntil: T + 5 * MIN }],
      T + 10 * MIN
    );
    expect(result.allowReschedule).toBe(true);
  });

  it("holds an unanswered alarm as pending inside the ring window", () => {
    const [result] = reconcileAlarmEvents(
      [{ type: "fired", id: KEY, at: T }],
      T + ALARM_RING_TIMEOUT_MS - 1
    );
    expect(result.outcome).toBe("pending");
    expect(result.allowReschedule).toBe(false);
  });

  it("calls it missed once the ring window has elapsed", () => {
    const [result] = reconcileAlarmEvents(
      [{ type: "fired", id: KEY, at: T }],
      T + ALARM_RING_TIMEOUT_MS
    );
    expect(result.outcome).toBe("missed");
  });

  it("Later then Done on the comeback completes the chain", () => {
    const [result] = reconcileAlarmEvents(
      [
        { type: "snoozed", id: KEY, at: T, snoozeUntil: T + 5 * MIN },
        { type: "stopped", id: KEY, at: T + 50 },
        { type: "fired", id: KEY, at: T + 5 * MIN },
        { type: "stopped", id: KEY, at: T + 5 * MIN + 20_000 },
      ],
      T + 6 * MIN
    );
    expect(result.outcome).toBe("completed");
    expect(result.allowReschedule).toBe(true);
  });

  it("keeps one reminder's snooze from suppressing another's stop", () => {
    const other = "reminder_xyz789_1786000600000";
    const results = reconcileAlarmEvents(
      [
        { type: "snoozed", id: KEY, at: T, snoozeUntil: T + 5 * MIN },
        { type: "stopped", id: other, at: T + 10 },
      ],
      T + MIN
    );
    expect(results.map((r: any) => r.outcome)).toEqual(["snoozed", "completed"]);
  });

  it("ignores malformed entries without throwing", () => {
    expect(reconcileAlarmEvents([null, { type: "bogus", id: KEY, at: T }], T)).toEqual([]);
  });
});

// ─── Group 5: unsupported mode is inert ─────────────────────────────────────

describe("no-bridge mode never reaches native", () => {
  it("resolves every contract method to its safe default", async () => {
    await withAlarmKit({ os: "android", bridge: null }, async (alarmKit) => {
      await expect(alarmKit.isSupported()).resolves.toBe(false);
      await expect(alarmKit.requestAuthorization()).resolves.toBe("notDetermined");
      await expect(alarmKit.scheduleAlarm({ id: KEY } as any)).resolves.toBeNull();
      await expect(alarmKit.cancelAlarm(KEY)).resolves.toBeUndefined();
      await expect(alarmKit.getScheduledAlarms()).resolves.toEqual([]);
      await expect(alarmKit.getAndClearEventLog()).resolves.toEqual([]);
      await expect(alarmKit.useAlarmKit()).resolves.toBe(false);
    });
  });
});
