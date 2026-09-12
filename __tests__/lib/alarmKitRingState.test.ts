import { NativeModules } from "react-native";

/**
 * Ring-state wrapper tests (lib/alarmKit.ts).
 *
 * Covers the new native surface added for the ring-state fix: durable peek/ack
 * event parsing (new shape + legacy tolerance), the live AlarmManager snapshot,
 * occurrence-scoped stop, the hint subscription, and the safe no-op fallbacks
 * when the native module is absent (Android / iOS < 26 / Jest).
 *
 * The wrapper captures NativeModules.AlarmKitBridge at module load, so each case
 * installs a fake bridge inside an isolated module registry.
 */

type Bridge = {
  peekEvents: jest.Mock;
  ackEvents: jest.Mock;
  getAlarmStates: jest.Mock;
  stopOccurrence: jest.Mock;
};

function makeBridge(overrides: Partial<Bridge> = {}): Bridge {
  return {
    peekEvents: jest.fn(async () => []),
    ackEvents: jest.fn(async () => undefined),
    getAlarmStates: jest.fn(async () => []),
    stopOccurrence: jest.fn(async () => undefined),
    ...overrides,
  } as Bridge;
}

async function withAlarmKit(
  opts: { os?: "ios" | "android"; bridge?: Bridge | null; emitter?: object | null },
  run: (alarmKit: any, bridge: Bridge | null) => Promise<void> | void
): Promise<void> {
  const bridge = opts.bridge === undefined ? makeBridge() : opts.bridge;
  try {
    await jest.isolateModulesAsync(async () => {
      const RN = require("react-native");
      Object.defineProperty(RN.Platform, "OS", {
        value: opts.os ?? "ios",
        configurable: true,
        writable: true,
      });
      if (bridge) RN.NativeModules.AlarmKitBridge = bridge;
      else delete RN.NativeModules.AlarmKitBridge;
      if (opts.emitter) RN.NativeModules.VRAlarmEventEmitter = opts.emitter;
      else delete RN.NativeModules.VRAlarmEventEmitter;

      const alarmKit = require("../../lib/alarmKit");
      await run(alarmKit, bridge);
    });
  } finally {
    delete (NativeModules as any).AlarmKitBridge;
    delete (NativeModules as any).VRAlarmEventEmitter;
  }
}

const T = 1_786_000_000_000;
const MIN = 60_000;
const KEY = "reminder_abc123_1786000000000";

// ─── peekAlarmEvents ────────────────────────────────────────────────────────

describe("peekAlarmEvents", () => {
  it("parses the new native event shape", async () => {
    const bridge = makeBridge({
      peekEvents: jest.fn(async () => [
        {
          eventId: "e1",
          kind: "snoozed",
          alarmId: "UUID-1",
          appKey: KEY,
          reminderId: "abc123",
          occurrenceAt: T,
          chainId: "later:reminder_abc123_1786000000000:123",
          chainStep: 0,
          snoozeUntil: T + 5 * MIN,
          at: T + 10,
        },
      ]),
    });
    await withAlarmKit({ bridge }, async (alarmKit) => {
      const [ev] = await alarmKit.peekAlarmEvents();
      expect(ev).toEqual({
        eventId: "e1",
        kind: "snoozed",
        alarmId: "UUID-1",
        appKey: KEY,
        reminderId: "abc123",
        occurrenceAt: T,
        chainId: "later:reminder_abc123_1786000000000:123",
        chainStep: 0,
        snoozeUntil: T + 5 * MIN,
        at: T + 10,
      });
    });
  });

  it("tolerates a legacy { type, id, at } row, deriving identity from the app key", async () => {
    const bridge = makeBridge({
      peekEvents: jest.fn(async () => [{ type: "stopped", id: KEY, at: T }]),
    });
    await withAlarmKit({ bridge }, async (alarmKit) => {
      const [ev] = await alarmKit.peekAlarmEvents();
      expect(ev.kind).toBe("stopped");
      expect(ev.appKey).toBe(KEY);
      expect(ev.reminderId).toBe("abc123");
      expect(ev.occurrenceAt).toBe(T);
      expect(typeof ev.eventId).toBe("string");
      expect(ev.eventId.length).toBeGreaterThan(0);
    });
  });

  it("maps every legacy type onto a native kind", async () => {
    const bridge = makeBridge({
      peekEvents: jest.fn(async () => [
        { eventId: "a", type: "fired", id: KEY, at: T },
        { eventId: "b", type: "cancelled", id: KEY, at: T },
        { eventId: "c", type: "sibling_cancelled", id: KEY, at: T },
        { eventId: "d", type: "schedule_failed", id: KEY, at: T },
      ]),
    });
    await withAlarmKit({ bridge }, async (alarmKit) => {
      const kinds = (await alarmKit.peekAlarmEvents()).map((e: any) => e.kind);
      expect(kinds).toEqual(["alerting", "removed", "removed", "scheduleFailed"]);
    });
  });

  it("drops malformed rows without throwing", async () => {
    const bridge = makeBridge({
      peekEvents: jest.fn(async () => [
        null,
        { kind: "nope", appKey: KEY, at: T },
        { kind: "stopped", appKey: KEY, reminderId: "abc123", occurrenceAt: T }, // no at
        { eventId: "ok", kind: "stopped", appKey: KEY, reminderId: "abc123", occurrenceAt: T, at: T },
      ]),
    });
    await withAlarmKit({ bridge }, async (alarmKit) => {
      const events = await alarmKit.peekAlarmEvents();
      expect(events.map((e: any) => e.eventId)).toEqual(["ok"]);
    });
  });

  it("is empty and never calls native when the bridge is absent", async () => {
    await withAlarmKit({ bridge: null }, async (alarmKit) => {
      await expect(alarmKit.peekAlarmEvents()).resolves.toEqual([]);
    });
  });

  it("is empty on Android", async () => {
    await withAlarmKit({ os: "android" }, async (alarmKit, bridge) => {
      await expect(alarmKit.peekAlarmEvents()).resolves.toEqual([]);
      expect(bridge!.peekEvents).not.toHaveBeenCalled();
    });
  });
});

// ─── ackAlarmEvents ─────────────────────────────────────────────────────────

describe("ackAlarmEvents", () => {
  it("forwards the ids to native", async () => {
    await withAlarmKit({}, async (alarmKit, bridge) => {
      await alarmKit.ackAlarmEvents(["e1", "e2"]);
      expect(bridge!.ackEvents).toHaveBeenCalledWith(["e1", "e2"]);
    });
  });

  it("skips the native hop for an empty list", async () => {
    await withAlarmKit({}, async (alarmKit, bridge) => {
      await alarmKit.ackAlarmEvents([]);
      expect(bridge!.ackEvents).not.toHaveBeenCalled();
    });
  });

  it("filters non-string ids", async () => {
    await withAlarmKit({}, async (alarmKit, bridge) => {
      await alarmKit.ackAlarmEvents(["e1", undefined, 3, "e2"] as any);
      expect(bridge!.ackEvents).toHaveBeenCalledWith(["e1", "e2"]);
    });
  });

  it("swallows a native rejection", async () => {
    const bridge = makeBridge({
      ackEvents: jest.fn(async () => {
        throw new Error("boom");
      }),
    });
    await withAlarmKit({ bridge }, async (alarmKit) => {
      await expect(alarmKit.ackAlarmEvents(["e1"])).resolves.toBeUndefined();
    });
  });

  it("is a no-op with no bridge", async () => {
    await withAlarmKit({ bridge: null }, async (alarmKit) => {
      await expect(alarmKit.ackAlarmEvents(["e1"])).resolves.toBeUndefined();
    });
  });
});

// ─── getAlarmStates ─────────────────────────────────────────────────────────

describe("getAlarmStates", () => {
  it("parses valid rows and keeps only the four known states", async () => {
    const bridge = makeBridge({
      getAlarmStates: jest.fn(async () => [
        {
          alarmId: "UUID-1",
          appKey: KEY,
          reminderId: "abc123",
          occurrenceAt: T,
          chainId: "orig:1786000000000",
          chainStep: 0,
          state: "alerting",
          fireAt: T,
        },
        { alarmId: "UUID-2", state: "scheduled" },
        { alarmId: "UUID-3", state: "not-a-state" }, // dropped
        { state: "alerting" }, // no alarmId → dropped
        null,
      ]),
    });
    await withAlarmKit({ bridge }, async (alarmKit) => {
      const rows = await alarmKit.getAlarmStates();
      expect(rows).toEqual([
        {
          alarmId: "UUID-1",
          appKey: KEY,
          reminderId: "abc123",
          occurrenceAt: T,
          chainId: "orig:1786000000000",
          chainStep: 0,
          state: "alerting",
          fireAt: T,
        },
        { alarmId: "UUID-2", state: "scheduled" },
      ]);
    });
  });

  it("is empty with no bridge", async () => {
    await withAlarmKit({ bridge: null }, async (alarmKit) => {
      await expect(alarmKit.getAlarmStates()).resolves.toEqual([]);
    });
  });
});

// ─── stopOccurrence ─────────────────────────────────────────────────────────

describe("stopOccurrence", () => {
  it("forwards reminderId and occurrenceAt", async () => {
    await withAlarmKit({}, async (alarmKit, bridge) => {
      await alarmKit.stopOccurrence({ reminderId: "abc123", occurrenceAt: T });
      expect(bridge!.stopOccurrence).toHaveBeenCalledWith("abc123", T);
    });
  });

  it("swallows a native rejection", async () => {
    const bridge = makeBridge({
      stopOccurrence: jest.fn(async () => {
        throw new Error("boom");
      }),
    });
    await withAlarmKit({ bridge }, async (alarmKit) => {
      await expect(
        alarmKit.stopOccurrence({ reminderId: "abc123", occurrenceAt: T })
      ).resolves.toBeUndefined();
    });
  });

  it("is a no-op with no bridge", async () => {
    await withAlarmKit({ bridge: null }, async (alarmKit) => {
      await expect(
        alarmKit.stopOccurrence({ reminderId: "abc123", occurrenceAt: T })
      ).resolves.toBeUndefined();
    });
  });
});

// ─── subscribeAlarmEvents ───────────────────────────────────────────────────

describe("subscribeAlarmEvents", () => {
  it("returns a no-op unsubscribe on Android", async () => {
    await withAlarmKit({ os: "android" }, async (alarmKit) => {
      const off = alarmKit.subscribeAlarmEvents(() => {});
      expect(typeof off).toBe("function");
      expect(() => off()).not.toThrow();
    });
  });

  it("returns a no-op unsubscribe when the emitter module is missing", async () => {
    await withAlarmKit({ os: "ios", emitter: null }, async (alarmKit) => {
      const cb = jest.fn();
      const off = alarmKit.subscribeAlarmEvents(cb);
      expect(typeof off).toBe("function");
      expect(() => off()).not.toThrow();
      expect(cb).not.toHaveBeenCalled();
    });
  });

  it("wires a NativeEventEmitter listener when the emitter module is present", async () => {
    const emitter = {
      addListener: jest.fn(),
      removeListeners: jest.fn(),
    };
    await withAlarmKit({ os: "ios", emitter }, async (alarmKit) => {
      const cb = jest.fn();
      const off = alarmKit.subscribeAlarmEvents(cb);
      expect(typeof off).toBe("function");
      // NativeEventEmitter registers against the module's addListener.
      expect(emitter.addListener).toHaveBeenCalled();
      expect(() => off()).not.toThrow();
    });
  });
});
