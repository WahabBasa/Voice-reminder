import fs from "fs";
import path from "path";
import { NativeModules } from "react-native";

/**
 * AK-5 contract tripwire.
 *
 * Encodes the frozen native contract from docs/alarmkit-port-prd.md so that
 * drift between the parallel AK-1..4 workstreams shows up at merge time as a
 * red test instead of a silent runtime no-op on a phone we cannot cable-debug.
 *
 * While AK-4 is still in flight, lib/alarmKit.ts does not exist: the contract
 * suites skip with a loud warning. They arm themselves the moment the file
 * lands.
 */

// ─── Frozen contract (PRD § "Frozen native contract") ───────────────────────

const BRIDGE_METHODS = [
  "isSupported",
  "requestAuthorization",
  "scheduleAlarm",
  "cancelAlarm",
  "getScheduledAlarms",
  "getAndClearEventLog",
] as const;

const AUTH_STATES = ["authorized", "denied", "notDetermined"];

// PRD app key: `reminder_${reminderId}_${scheduledFor}`
const APP_KEY_PATTERN = /^reminder_[^_]+_\d+$/;

const SAMPLE_SCHEDULE_OPTS = {
  id: "reminder_abc123_1786000000000",
  fireDate: 1786000000000,
  title: "Take your evening meds",
  soundName: "reminder_abc123.wav",
  snoozeMinutes: 5,
  metadata: {
    reminderId: "abc123",
    scheduledFor: "1786000000000",
    tier: "urgent",
    variantIndex: "0",
  },
};

// ─── Tolerant module load ───────────────────────────────────────────────────

const ALARM_KIT_PATH = path.resolve(__dirname, "../../lib/alarmKit.ts");
const alarmKitExists = fs.existsSync(ALARM_KIT_PATH);

let alarmKit: any = null;
let importError: unknown = null;

if (alarmKitExists) {
  try {
    alarmKit = require("../../lib/alarmKit");
  } catch (err) {
    importError = err;
  }
} else {
  // Module-scope warn: jest.setup.ts has not swapped console.warn yet, so this
  // reaches the terminal unfiltered.
  console.warn(
    "\n" +
      "==========================================================================\n" +
      " AK-5 CONTRACT TEST: lib/alarmKit.ts NOT FOUND — contract suites SKIPPED.\n" +
      " AK-4 has not landed. These suites arm themselves automatically once the\n" +
      " file exists and go red if the wrapper diverges from the PRD contract.\n" +
      "==========================================================================\n"
  );
}

const contractLoaded = alarmKitExists && importError === null;
const describeContract = contractLoaded ? describe : describe.skip;

// ─── Group 1: Module loads ──────────────────────────────────────────────────

describe("lib/alarmKit module load", () => {
  (alarmKitExists ? it : it.skip)("imports without throwing", () => {
    expect(importError).toBeNull();
  });

  it("runs against a Jest env with no native AlarmKitBridge", () => {
    // Every fallback assertion below is only meaningful while this holds.
    expect((NativeModules as any).AlarmKitBridge).toBeUndefined();
  });
});

// ─── Group 2: Contract surface ──────────────────────────────────────────────

describeContract("AlarmKitBridge contract surface", () => {
  it.each(BRIDGE_METHODS)("exports %s as a function", (method) => {
    expect(typeof alarmKit[method]).toBe("function");
  });

  it("exports the gate helper useAlarmKit (AK-4 spec)", () => {
    expect(typeof alarmKit.useAlarmKit).toBe("function");
  });

  it("exports no renamed stand-in for a contract method", () => {
    // Catches the common drift: a wrapper that ships `schedule`/`cancel`
    // instead of the frozen names.
    const drifted = ["schedule", "cancel", "scheduleNativeAlarm", "drainEventLog"];
    const found = drifted.filter((name) => typeof alarmKit[name] === "function");
    expect(found).toEqual([]);
  });
});

// ─── Group 3: No-op fallbacks with the bridge absent ────────────────────────

describeContract("safe no-op fallbacks when the native bridge is undefined", () => {
  it("isSupported resolves false", async () => {
    await expect(alarmKit.isSupported()).resolves.toBe(false);
  });

  it("useAlarmKit resolves false", async () => {
    await expect(alarmKit.useAlarmKit()).resolves.toBe(false);
  });

  it("requestAuthorization resolves a contract auth state", async () => {
    const state = await alarmKit.requestAuthorization();
    expect(AUTH_STATES).toContain(state);
  });

  it("requestAuthorization does not report authorized without a bridge", async () => {
    await expect(alarmKit.requestAuthorization()).resolves.not.toBe("authorized");
  });

  it("scheduleAlarm resolves instead of throwing", async () => {
    const uuid = await alarmKit.scheduleAlarm(SAMPLE_SCHEDULE_OPTS);
    expect(uuid === null || typeof uuid === "string").toBe(true);
  });

  it("cancelAlarm resolves silently for an unknown key", async () => {
    await expect(alarmKit.cancelAlarm("reminder_nope_1")).resolves.toBeUndefined();
  });

  it("getScheduledAlarms resolves an empty list", async () => {
    await expect(alarmKit.getScheduledAlarms()).resolves.toEqual([]);
  });

  it("getAndClearEventLog resolves an empty list", async () => {
    await expect(alarmKit.getAndClearEventLog()).resolves.toEqual([]);
  });
});

// ─── Group 4: App key format ────────────────────────────────────────────────

describeContract("app key format", () => {
  it("the PRD sample key matches the documented shape", () => {
    expect(SAMPLE_SCHEDULE_OPTS.id).toMatch(APP_KEY_PATTERN);
  });

  it("an exported key builder produces reminder_{id}_{scheduledFor}", () => {
    const build = alarmKit.alarmAppKey ?? alarmKit.buildAlarmAppKey;
    if (typeof build !== "function") {
      // Not named in the PRD — AK-4 may inline it. Nothing to check.
      return;
    }
    expect(build("abc123", 1786000000000)).toBe("reminder_abc123_1786000000000");
    expect(build("abc123", 1786000000000)).toMatch(APP_KEY_PATTERN);
  });
});

// ─── Group 5: Event-log reconciliation semantics ────────────────────────────

type AlarmEventType = "stopped" | "snoozed" | "fired";

interface NativeAlarmEvent {
  type: AlarmEventType;
  id: string;
  at: number;
  snoozeUntil?: number;
}

type OutcomeKind = "completed" | "snoozed" | "missed" | "pending";

interface ReconcileOutcome {
  id: string;
  outcome: OutcomeKind;
  snoozeUntil?: number;
  allowReschedule: boolean;
}

/** Ring window before an unanswered alarm counts as missed. */
const RING_TIMEOUT_MS = 180_000;

/**
 * iOS can append the spurious StopIntent either side of the Snooze append, so
 * the JS mirror of PRD guard 2 tolerates a stop landing slightly before the
 * snooze it belongs to.
 */
const SPURIOUS_STOP_TOLERANCE_MS = 2000;

/**
 * Executable spec for JS-side reconciliation of a drained native event log.
 * AK-4 should export `reconcileAlarmEvents` with this behavior; until it does,
 * the table below runs against this reference so the semantics are pinned.
 */
function referenceReconcile(
  events: unknown[],
  now: number,
  ringTimeoutMs: number = RING_TIMEOUT_MS
): ReconcileOutcome[] {
  const order: string[] = [];
  const byId = new Map<string, NativeAlarmEvent[]>();

  for (const raw of events) {
    const e = raw as NativeAlarmEvent | null;
    if (!e || typeof e.id !== "string" || typeof e.at !== "number") continue;
    if (e.type !== "stopped" && e.type !== "snoozed" && e.type !== "fired") continue;
    if (!byId.has(e.id)) {
      byId.set(e.id, []);
      order.push(e.id);
    }
    byId.get(e.id)!.push(e);
  }

  return order.map((id) => {
    const list = byId.get(id)!.slice().sort((a, b) => a.at - b.at);
    const snooze = [...list].reverse().find((e) => e.type === "snoozed");
    const snoozeUntil = snooze?.snoozeUntil;
    const snoozeActive = snoozeUntil !== undefined && now < snoozeUntil;

    // Guard 2 mirror: drop any stop that lands inside the snooze window.
    const realStop = list.find((e) => {
      if (e.type !== "stopped") return false;
      if (!snooze) return true;
      const from = snooze.at - SPURIOUS_STOP_TOLERANCE_MS;
      const to = snoozeUntil ?? snooze.at + SPURIOUS_STOP_TOLERANCE_MS;
      return !(e.at >= from && e.at < to);
    });

    const lastFired = [...list].reverse().find((e) => e.type === "fired");
    const firedAfterSnooze = lastFired && (!snooze || lastFired.at >= snooze.at);

    let outcome: OutcomeKind;
    if (realStop) {
      outcome = "completed";
    } else if (firedAfterSnooze) {
      outcome = now - lastFired!.at >= ringTimeoutMs ? "missed" : "pending";
    } else {
      outcome = "snoozed";
    }

    return {
      id,
      outcome,
      // Guard 3: never recalculate a schedule while the snooze guard is live.
      allowReschedule: outcome === "pending" ? false : !snoozeActive,
      ...(snoozeUntil !== undefined ? { snoozeUntil } : {}),
    };
  });
}

const reconcile: typeof referenceReconcile =
  contractLoaded && typeof alarmKit.reconcileAlarmEvents === "function"
    ? alarmKit.reconcileAlarmEvents
    : referenceReconcile;

const T = 1_786_000_000_000;
const MIN = 60_000;
const KEY = "reminder_abc123_1786000000000";

describe("event-log reconciliation semantics (FamWake race guards)", () => {
  it("returns nothing for an empty log", () => {
    expect(reconcile([], T)).toEqual([]);
  });

  it("guard 2 — a spurious stop inside the snooze window does not complete", () => {
    const events: NativeAlarmEvent[] = [
      { type: "snoozed", id: KEY, at: T, snoozeUntil: T + 5 * MIN },
      { type: "stopped", id: KEY, at: T + 50 },
    ];
    expect(reconcile(events, T + MIN)).toEqual([
      { id: KEY, outcome: "snoozed", snoozeUntil: T + 5 * MIN, allowReschedule: false },
    ]);
  });

  it("guard 2 — tolerates the spurious stop appended before the snooze", () => {
    const events: NativeAlarmEvent[] = [
      { type: "stopped", id: KEY, at: T - 200 },
      { type: "snoozed", id: KEY, at: T, snoozeUntil: T + 5 * MIN },
    ];
    expect(reconcile(events, T + MIN)[0].outcome).toBe("snoozed");
  });

  it("guard 3 — no reschedule while the snooze window is still open", () => {
    const events: NativeAlarmEvent[] = [
      { type: "snoozed", id: KEY, at: T, snoozeUntil: T + 5 * MIN },
    ];
    expect(reconcile(events, T + MIN)[0].allowReschedule).toBe(false);
  });

  it("guard 3 — reschedule is allowed once the snooze window has passed", () => {
    const events: NativeAlarmEvent[] = [
      { type: "snoozed", id: KEY, at: T, snoozeUntil: T + 5 * MIN },
    ];
    const [result] = reconcile(events, T + 10 * MIN);
    expect(result.outcome).toBe("snoozed");
    expect(result.allowReschedule).toBe(true);
  });

  it("a genuine stop with no snooze completes and unlocks rescheduling", () => {
    const events: NativeAlarmEvent[] = [{ type: "stopped", id: KEY, at: T }];
    expect(reconcile(events, T + 1000)).toEqual([
      { id: KEY, outcome: "completed", allowReschedule: true },
    ]);
  });

  it("fired then stopped completes", () => {
    const events: NativeAlarmEvent[] = [
      { type: "fired", id: KEY, at: T },
      { type: "stopped", id: KEY, at: T + 20_000 },
    ];
    expect(reconcile(events, T + 30_000)[0].outcome).toBe("completed");
  });

  it("fired with nothing after it is still pending inside the ring window", () => {
    const events: NativeAlarmEvent[] = [{ type: "fired", id: KEY, at: T }];
    const [result] = reconcile(events, T + RING_TIMEOUT_MS - 1);
    expect(result.outcome).toBe("pending");
    expect(result.allowReschedule).toBe(false);
  });

  it("fired with nothing after it is missed past the ring window", () => {
    const events: NativeAlarmEvent[] = [{ type: "fired", id: KEY, at: T }];
    const [result] = reconcile(events, T + RING_TIMEOUT_MS);
    expect(result.outcome).toBe("missed");
    expect(result.allowReschedule).toBe(true);
  });

  it("respects a custom ring timeout", () => {
    const events: NativeAlarmEvent[] = [{ type: "fired", id: KEY, at: T }];
    expect(reconcile(events, T + 5000, 1000)[0].outcome).toBe("missed");
    expect(reconcile(events, T + 500, 1000)[0].outcome).toBe("pending");
  });

  it("a comeback that fired after the snooze escapes the snooze verdict", () => {
    const events: NativeAlarmEvent[] = [
      { type: "snoozed", id: KEY, at: T, snoozeUntil: T + 5 * MIN },
      { type: "fired", id: KEY, at: T + 5 * MIN },
    ];
    const [result] = reconcile(events, T + 9 * MIN);
    expect(result.outcome).toBe("missed");
    expect(result.allowReschedule).toBe(true);
  });

  it("Later then Done on the comeback ends the chain (guards 2 + 4)", () => {
    const events: NativeAlarmEvent[] = [
      { type: "snoozed", id: KEY, at: T, snoozeUntil: T + 5 * MIN },
      { type: "stopped", id: KEY, at: T + 50 },
      { type: "fired", id: KEY, at: T + 5 * MIN },
      { type: "stopped", id: KEY, at: T + 5 * MIN + 20_000 },
    ];
    const [result] = reconcile(events, T + 6 * MIN);
    expect(result.outcome).toBe("completed");
    expect(result.allowReschedule).toBe(true);
  });

  it("keeps reminders independent within one drained batch", () => {
    const other = "reminder_xyz789_1786000600000";
    const events: NativeAlarmEvent[] = [
      { type: "snoozed", id: KEY, at: T, snoozeUntil: T + 5 * MIN },
      { type: "stopped", id: other, at: T + 10 },
    ];
    const results = reconcile(events, T + MIN);
    expect(results.map((r) => r.id)).toEqual([KEY, other]);
    expect(results.map((r) => r.outcome)).toEqual(["snoozed", "completed"]);
  });

  it("a snooze for one reminder never suppresses another reminder's stop", () => {
    const other = "reminder_xyz789_1786000600000";
    const events: NativeAlarmEvent[] = [
      { type: "snoozed", id: KEY, at: T, snoozeUntil: T + 5 * MIN },
      { type: "stopped", id: other, at: T + 10 },
    ];
    expect(reconcile(events, T + MIN)[1].allowReschedule).toBe(true);
  });

  it("reads events in timestamp order regardless of append order", () => {
    const events: NativeAlarmEvent[] = [
      { type: "stopped", id: KEY, at: T + 5 * MIN + 20_000 },
      { type: "snoozed", id: KEY, at: T, snoozeUntil: T + 5 * MIN },
    ];
    expect(reconcile(events, T + 6 * MIN)[0].outcome).toBe("completed");
  });

  it("ignores malformed entries without throwing", () => {
    const events = [
      null,
      { type: "bogus", id: KEY, at: T },
      { type: "stopped", at: T },
      { type: "stopped", id: KEY },
    ];
    expect(reconcile(events, T)).toEqual([]);
  });

  it("survives a batch mixing malformed and valid entries", () => {
    const events = [null, { type: "stopped", id: KEY, at: T }];
    expect(reconcile(events, T + 1000)).toEqual([
      { id: KEY, outcome: "completed", allowReschedule: true },
    ]);
  });

  it("a snooze event with no snoozeUntil still records a snooze", () => {
    const events: NativeAlarmEvent[] = [{ type: "snoozed", id: KEY, at: T }];
    const [result] = reconcile(events, T + MIN);
    expect(result.outcome).toBe("snoozed");
    expect(result.allowReschedule).toBe(true);
  });
});
