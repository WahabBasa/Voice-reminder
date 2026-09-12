/**
 * The serialized ring coordinator (lib/ringReconcile.ts).
 *
 * Native bridge, lifecycle store and occurrence actions are faked. This proves
 * the contract order (peek → apply → ack, ack ONLY after durable apply),
 * coalescing (one in-flight + one queued), that Missed fires only for an
 * unobserved past occurrence with no live alerting alarm, and that a snoozed
 * event records the REAL armed time.
 */
const MOCK_UNKNOWN_GRACE_MS = 16 * 60 * 1000;

const mockHydrate = jest.fn(async (..._a: any[]) => undefined);
const mockMarkRinging = jest.fn(async (..._a: any[]) => undefined);
const mockMarkSnoozed = jest.fn(async (..._a: any[]) => undefined);
const mockMarkMissed = jest.fn(async (..._a: any[]) => undefined);
const mockPrune = jest.fn(async (..._a: any[]) => undefined);
let mockSnapshot: Record<string, any> = {};
const mockGetSnapshot = jest.fn(() => mockSnapshot);

const mockPeek = jest.fn(async (..._a: any[]) => [] as any[]);
const mockAck = jest.fn(async (..._a: any[]) => undefined);
const mockGetStates = jest.fn(async (..._a: any[]) => [] as any[]);
const mockRefreshSnooze = jest.fn(async (..._a: any[]) => undefined);

const mockComplete = jest.fn(async (..._a: any[]) => undefined);
const mockApplyLedger = jest.fn(async (..._a: any[]) => ({}));
const mockGetReminderById = jest.fn(() => ({ id: "r1", title: "Meds", frequency: "daily", scheduleType: "daily" }));

const callLog: string[] = [];

jest.mock("../../lib/ringLifecycle", () => ({
  hydrateRingLifecycle: (...a: unknown[]) => mockHydrate(...a),
  getRingSnapshot: () => mockGetSnapshot(),
  markRinging: (...a: unknown[]) => mockMarkRinging(...a),
  markSnoozed: (...a: unknown[]) => { callLog.push("markSnoozed"); return mockMarkSnoozed(...a); },
  markMissed: (...a: unknown[]) => mockMarkMissed(...a),
  pruneRingLifecycle: (...a: unknown[]) => mockPrune(...a),
  occurrenceKey: (ref: any) => `${ref.reminderId}:${ref.occurrenceAt}`,
  UNKNOWN_GRACE_MS: 16 * 60 * 1000,
}));
jest.mock("../../lib/alarmKit", () => ({
  peekAlarmEvents: (...a: unknown[]) => mockPeek(...a),
  ackAlarmEvents: (...a: unknown[]) => { callLog.push("ack"); return mockAck(...a); },
  getAlarmStates: (...a: unknown[]) => mockGetStates(...a),
  refreshSnoozeWindows: (...a: unknown[]) => mockRefreshSnooze(...a),
  alarmAppKey: (id: string, ts: number) => `reminder_${id}_${ts}`,
}));
jest.mock("../../lib/notifications", () => ({
  applyAlarmKitEvents: (...a: unknown[]) => { callLog.push("ledger"); return mockApplyLedger(...a); },
}));
jest.mock("../../lib/occurrenceActions", () => ({
  completeOccurrence: (...a: unknown[]) => { callLog.push("complete"); return mockComplete(...a); },
}));
jest.mock("../../lib/store", () => ({
  useReminderStore: { getState: () => ({ getReminderById: mockGetReminderById }) },
}));
jest.mock("../../lib/vrLog", () => ({ vrLog: jest.fn() }));

import { reconcileRings, __resetReconcileForTests, COMEBACK_EXHAUSTION_MS } from "../../lib/ringReconcile";

const UNKNOWN_GRACE_MS = MOCK_UNKNOWN_GRACE_MS;

beforeEach(() => {
  jest.clearAllMocks();
  callLog.length = 0;
  mockSnapshot = {};
  mockPeek.mockImplementation(async () => []);
  mockGetStates.mockImplementation(async () => []);
  mockComplete.mockImplementation(async () => undefined);
  mockApplyLedger.mockImplementation(async () => ({}));
  mockGetReminderById.mockReturnValue({ id: "r1", title: "Meds", frequency: "daily", scheduleType: "daily" });
  __resetReconcileForTests();
});

describe("event application order", () => {
  it("peeks, applies each event, then acks only the applied ids in that order", async () => {
    const now = Date.now();
    mockPeek.mockResolvedValueOnce([
      { eventId: "e1", kind: "stopped", reminderId: "r1", occurrenceAt: 100, at: now },
    ]);
    await reconcileRings("native");

    expect(mockComplete).toHaveBeenCalledTimes(1);
    expect(mockAck).toHaveBeenCalledWith(["e1"]);
    expect(callLog.indexOf("complete")).toBeLessThan(callLog.indexOf("ack"));
  });

  it("applies events in ascending `at` order, not arrival order", async () => {
    const applied: number[] = [];
    mockComplete.mockImplementation(async (ref: any) => { applied.push(ref.occurrenceAt); });
    mockPeek.mockResolvedValueOnce([
      { eventId: "late", kind: "stopped", reminderId: "r1", occurrenceAt: 200, at: 2000 },
      { eventId: "early", kind: "stopped", reminderId: "r1", occurrenceAt: 100, at: 1000 },
    ]);
    await reconcileRings("native");
    expect(applied).toEqual([100, 200]);
    expect(mockAck).toHaveBeenCalledWith(["early", "late"]);
  });

  it("does NOT ack an event whose apply threw, but acks the ones that succeeded", async () => {
    mockComplete
      .mockImplementationOnce(async () => { throw new Error("write failed"); })
      .mockImplementationOnce(async () => undefined);
    mockPeek.mockResolvedValueOnce([
      { eventId: "bad", kind: "stopped", reminderId: "r1", occurrenceAt: 100, at: 1 },
      { eventId: "good", kind: "stopped", reminderId: "r1", occurrenceAt: 200, at: 2 },
    ]);
    await reconcileRings("native");
    expect(mockAck).toHaveBeenCalledWith(["good"]);
  });

  it("does not ack at all when there were no events", async () => {
    await reconcileRings("tick");
    expect(mockAck).not.toHaveBeenCalled();
    expect(mockPrune).toHaveBeenCalled();
  });

  it("records a snoozed event with the REAL armed time, never an estimate", async () => {
    const realArmed = Date.now() + 5 * 60_000;
    mockPeek.mockResolvedValueOnce([
      { eventId: "s1", kind: "snoozed", reminderId: "r1", occurrenceAt: 100, at: Date.now(), snoozeUntil: realArmed, chainId: "c9" },
    ]);
    await reconcileRings("native");
    expect(mockMarkSnoozed).toHaveBeenCalledWith(
      { reminderId: "r1", occurrenceAt: 100 },
      expect.objectContaining({ snoozeUntil: realArmed, chainId: "c9" })
    );
    expect(mockAck).toHaveBeenCalledWith(["s1"]);
  });

  it("never claims a snooze for a scheduleFailed event", async () => {
    mockPeek.mockResolvedValueOnce([
      { eventId: "f1", kind: "scheduleFailed", reminderId: "r1", occurrenceAt: 100, at: Date.now(), error: "maximumLimitReached" },
    ]);
    await reconcileRings("native");
    expect(mockMarkSnoozed).not.toHaveBeenCalled();
    expect(mockAck).toHaveBeenCalledWith(["f1"]);
  });
});

describe("live states and Missed", () => {
  it("marks ringing for every alerting alarm's occurrence", async () => {
    mockGetStates.mockResolvedValueOnce([
      { alarmId: "a", state: "alerting", reminderId: "r1", occurrenceAt: 100 },
      { alarmId: "b", state: "scheduled", reminderId: "r2", occurrenceAt: 200 },
    ]);
    await reconcileRings("foreground");
    expect(mockMarkRinging).toHaveBeenCalledWith(
      { reminderId: "r1", occurrenceAt: 100 },
      expect.objectContaining({ source: "alarmkit" })
    );
    expect(mockMarkRinging).not.toHaveBeenCalledWith(
      { reminderId: "r2", occurrenceAt: 200 },
      expect.anything()
    );
  });

  it("marks a past unresolved occurrence missed once past the unknown grace", async () => {
    const now = Date.now();
    mockSnapshot = {
      "r1:100": { key: "r1:100", reminderId: "r1", occurrenceAt: now - (UNKNOWN_GRACE_MS + 60_000), state: "ringing" },
    };
    await reconcileRings("tick");
    expect(mockMarkMissed).toHaveBeenCalledWith({ reminderId: "r1", occurrenceAt: expect.any(Number) }, expect.anything());
  });

  it("NEVER marks missed while a live alarm still reports alerting", async () => {
    const now = Date.now();
    const occurrenceAt = now - (UNKNOWN_GRACE_MS + 60_000);
    mockSnapshot = { ["r1:" + occurrenceAt]: { key: "r1:" + occurrenceAt, reminderId: "r1", occurrenceAt, state: "ringing" } };
    mockGetStates.mockResolvedValueOnce([
      { alarmId: "a", state: "alerting", reminderId: "r1", occurrenceAt },
    ]);
    await reconcileRings("tick");
    expect(mockMarkMissed).not.toHaveBeenCalled();
  });

  it("does not miss within the grace window, nor a resolved record", async () => {
    const now = Date.now();
    mockSnapshot = {
      "r1:100": { key: "r1:100", reminderId: "r1", occurrenceAt: now - 60_000, state: "ringing" },
      "r2:200": { key: "r2:200", reminderId: "r2", occurrenceAt: now - 10 * UNKNOWN_GRACE_MS, state: "done" },
    };
    await reconcileRings("tick");
    expect(mockMarkMissed).not.toHaveBeenCalled();
  });

  it("uses the comeback exhaustion deadline for a snoozed record", async () => {
    const now = Date.now();
    mockSnapshot = {
      "r1:100": {
        key: "r1:100", reminderId: "r1", occurrenceAt: 100, state: "snoozed",
        snoozeUntil: now - (COMEBACK_EXHAUSTION_MS + 60_000),
      },
    };
    await reconcileRings("tick");
    expect(mockMarkMissed).toHaveBeenCalledWith({ reminderId: "r1", occurrenceAt: 100 }, expect.anything());

    jest.clearAllMocks();
    mockSnapshot = {
      "r1:100": { key: "r1:100", reminderId: "r1", occurrenceAt: 100, state: "snoozed", snoozeUntil: now + 60_000 },
    };
    await reconcileRings("tick");
    expect(mockMarkMissed).not.toHaveBeenCalled();
  });
});

describe("coalescing", () => {
  it("collapses concurrent calls to one in-flight + one queued pass", async () => {
    let releasePeek!: () => void;
    const gate = new Promise<void>((r) => { releasePeek = r; });
    mockPeek.mockImplementation(async () => { await gate; return []; });

    const p1 = reconcileRings("tick");   // starts pass 1, parks at peek
    const p2 = reconcileRings("native"); // queued
    const p3 = reconcileRings("native"); // still just one queued
    expect(p1).toBe(p2);
    expect(p1).toBe(p3);

    releasePeek();
    await p1;

    // Exactly two passes ran: the initial one and a single coalesced re-run.
    expect(mockPeek).toHaveBeenCalledTimes(2);
  });
});

describe("sole-drainer ledger wiring", () => {
  it("feeds the legacy ledger the SAME peeked events (converted), and acks only after both apply", async () => {
    mockPeek.mockResolvedValueOnce([
      { eventId: "e1", kind: "stopped", reminderId: "r1", occurrenceAt: 100, at: 10 },
      { eventId: "e2", kind: "snoozed", reminderId: "r1", occurrenceAt: 200, at: 20, snoozeUntil: 999 },
      { eventId: "e3", kind: "alerting", reminderId: "r2", occurrenceAt: 300, at: 30 },
      { eventId: "e4", kind: "scheduled", reminderId: "r2", occurrenceAt: 400, at: 40 },
    ]);
    await reconcileRings("native");

    expect(mockApplyLedger).toHaveBeenCalledTimes(1);
    const legacy = mockApplyLedger.mock.calls[0][0] as any[];
    // scheduled has no legacy meaning and is dropped; the rest map by kind.
    expect(legacy.map((e) => `${e.type}:${e.id}`)).toEqual([
      "stopped:reminder_r1_100",
      "snoozed:reminder_r1_200",
      "fired:reminder_r2_300",
    ]);
    // ack runs after the ledger.
    expect(callLog.indexOf("ledger")).toBeLessThan(callLog.indexOf("ack"));
    expect(mockAck).toHaveBeenCalledWith(["e1", "e2", "e3", "e4"]);
  });

  it("does NOT ack when the ledger throws — events replay next pass", async () => {
    mockApplyLedger.mockImplementationOnce(async () => { throw new Error("ledger down"); });
    mockPeek.mockResolvedValueOnce([
      { eventId: "e1", kind: "stopped", reminderId: "r1", occurrenceAt: 100, at: 10 },
    ]);
    await reconcileRings("native");
    expect(mockAck).not.toHaveBeenCalled();
  });
});
