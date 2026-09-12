/**
 * Per-occurrence Done / Later (lib/occurrenceActions.ts).
 *
 * The lifecycle store and native bridge are faked — this proves the ACTION
 * shape: Done stops the ring, cancels the chain, writes one history row keyed
 * to the original occurrence (idempotently), and removes a one-off but not a
 * repeater; Later arms an uncapped comeback at tap+5 and marks the real time.
 */
import type { OccurrenceRef } from "../../lib/ringLifecycle";

const mockMarkDone = jest.fn(async (..._a: any[]) => undefined);
const mockMarkSnoozed = jest.fn(async (..._a: any[]) => undefined);
const mockStopOccurrence = jest.fn(async (..._a: any[]) => undefined);
const mockRemoveReminderFully = jest.fn(async (..._a: any[]) => undefined);
const mockRecordCompletion = jest.fn(async (..._a: any[]) => undefined);
const mockGetReminderById = jest.fn();

let mockHistory: any[] = [];

jest.mock("../../lib/ringLifecycle", () => ({
  markDone: (...a: unknown[]) => mockMarkDone(...a),
  markSnoozed: (...a: unknown[]) => mockMarkSnoozed(...a),
}));
jest.mock("../../lib/alarmKit", () => ({
  stopOccurrence: (...a: unknown[]) => mockStopOccurrence(...a),
}));
jest.mock("../../lib/reminderRemoval", () => ({
  removeReminderFully: (...a: unknown[]) => mockRemoveReminderFully(...a),
}));
jest.mock("../../lib/store", () => ({
  useReminderStore: {
    getState: () => ({
      history: mockHistory,
      recordCompletion: mockRecordCompletion,
      getReminderById: mockGetReminderById,
    }),
  },
}));
jest.mock("../../lib/vrLog", () => ({ vrLog: jest.fn() }));

import {
  completeOccurrence,
  laterOccurrence,
  hasOccurrenceCompletion,
} from "../../lib/occurrenceActions";
import { NAG_DELAY_MINUTES } from "../../lib/notificationDecisions";

const ref: OccurrenceRef = { reminderId: "r1", occurrenceAt: 1_000_000 };

beforeEach(() => {
  jest.clearAllMocks();
  mockHistory = [];
});

describe("completeOccurrence", () => {
  it("stops the native ring, cancels the fallback chain, marks done, writes history at the occurrenceAt", async () => {
    const cancelFallbackChain = jest.fn(async (..._a: any[]) => undefined);
    await completeOccurrence(ref, {
      reminderTitle: "Meds",
      isOneTime: false,
      source: "alarmkit",
      cancelFallbackChain,
    });

    expect(mockStopOccurrence).toHaveBeenCalledWith(ref);
    expect(cancelFallbackChain).toHaveBeenCalledWith(ref);
    expect(mockMarkDone).toHaveBeenCalledWith(ref, expect.objectContaining({}));
    expect(mockRecordCompletion).toHaveBeenCalledWith("r1", "Meds", "completed", {
      scheduledFor: 1_000_000,
      action: "dismissed",
    });
    // Repeater keeps its future occurrences.
    expect(mockRemoveReminderFully).not.toHaveBeenCalled();
  });

  it("removes a one-off after Done, keeps a repeater", async () => {
    await completeOccurrence(ref, { reminderTitle: "X", isOneTime: true });
    expect(mockRemoveReminderFully).toHaveBeenCalledWith("r1");

    jest.clearAllMocks();
    await completeOccurrence(ref, { reminderTitle: "X", isOneTime: false });
    expect(mockRemoveReminderFully).not.toHaveBeenCalled();
  });

  it("is idempotent — a replayed completion writes no second history row", async () => {
    mockHistory = [{ reminderId: "r1", status: "completed", scheduledFor: 1_000_000 }];
    await completeOccurrence(ref, { reminderTitle: "X", isOneTime: false });
    expect(mockRecordCompletion).not.toHaveBeenCalled();
    // Still stops the ring + marks done (both idempotent).
    expect(mockMarkDone).toHaveBeenCalled();
    expect(mockStopOccurrence).toHaveBeenCalled();
  });

  it("does not treat a different occurrence's completion as a duplicate", async () => {
    mockHistory = [
      { reminderId: "r1", status: "completed", scheduledFor: 999 },
      { reminderId: "r2", status: "completed", scheduledFor: 1_000_000 },
    ];
    await completeOccurrence(ref, { reminderTitle: "X", isOneTime: false });
    expect(mockRecordCompletion).toHaveBeenCalledTimes(1);
  });

  it("uses the injected stopNative/removeReminder over the defaults", async () => {
    const stopNative = jest.fn(async (..._a: any[]) => undefined);
    const removeReminder = jest.fn(async (..._a: any[]) => undefined);
    await completeOccurrence(ref, {
      reminderTitle: "X",
      isOneTime: true,
      stopNative,
      removeReminder,
    });
    expect(stopNative).toHaveBeenCalledWith(ref);
    expect(mockStopOccurrence).not.toHaveBeenCalled();
    expect(removeReminder).toHaveBeenCalledWith("r1");
    expect(mockRemoveReminderFully).not.toHaveBeenCalled();
  });
});

describe("laterOccurrence", () => {
  const step = NAG_DELAY_MINUTES * 60_000;

  it("arms the comeback at tap+5 with +5/+10 nag siblings and marks the real time", async () => {
    const scheduleComeback = jest.fn(async (..._a: any[]) => undefined);
    const cancelFallbackChain = jest.fn(async (..._a: any[]) => undefined);
    const tapAt = 5_000_000;

    const plan = await laterOccurrence(ref, { at: tapAt, scheduleComeback, cancelFallbackChain });

    expect(plan.comebackAt).toBe(tapAt + step);
    expect(plan.fireTimes).toEqual([tapAt + step, tapAt + 2 * step, tapAt + 3 * step]);
    expect(cancelFallbackChain).toHaveBeenCalledWith(ref);
    expect(scheduleComeback).toHaveBeenCalledWith(ref, plan.fireTimes);
    expect(mockMarkSnoozed).toHaveBeenCalledWith(
      ref,
      expect.objectContaining({ snoozeUntil: tapAt + step, source: "fallback" })
    );
  });

  it("is unlimited — every Later replaces the chain with a fresh chainId and never consults the nag cap", async () => {
    const scheduleComeback = jest.fn(async (..._a: any[]) => undefined);
    const chainIds: string[] = [];
    mockMarkSnoozed.mockImplementation(async (_ref: unknown, opts: any) => {
      chainIds.push(opts.chainId);
    });

    for (let i = 1; i <= 5; i++) {
      await laterOccurrence(ref, { at: 1000 + i, scheduleComeback });
    }
    expect(scheduleComeback).toHaveBeenCalledTimes(5);
    expect(new Set(chainIds).size).toBe(5);
  });
});

describe("hasOccurrenceCompletion", () => {
  it("matches only completed rows for the same reminder + occurrenceAt", () => {
    const h = [
      { reminderId: "r1", status: "missed", scheduledFor: 1_000_000 },
      { reminderId: "r1", status: "completed", scheduledFor: 42 },
    ];
    expect(hasOccurrenceCompletion(h as any, ref)).toBe(false);
    expect(
      hasOccurrenceCompletion(
        [...h, { reminderId: "r1", status: "completed", scheduledFor: 1_000_000 }] as any,
        ref
      )
    ).toBe(true);
  });
});
