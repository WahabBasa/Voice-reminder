import {
  alarmAppKey,
  dedupeByAppKey,
  isNagAppKey,
  nagAppKey,
  parseAlarmAppKey,
  reconcileAlarmEvents,
  resetAppKeyDedupe,
} from "../../lib/alarmKit";

/**
 * OLD-96 key families and event inertness.
 *
 * A reminder now owns two kinds of native alarm: `reminder_<id>_<ts>` for a
 * scheduled occurrence and `snooze_<id>_<ts>` for a nag comeback. Keeping them
 * apart is what lets a nag coexist with the reminder's next ring, so the split
 * is pinned here.
 */

const T = 1_786_000_000_000;
const MIN = 60_000;
const ID = "abc123";

// ─── App key families ───────────────────────────────────────────────────────

describe("app keys", () => {
  it("keeps the occurrence key scheme", () => {
    expect(alarmAppKey(ID, T)).toBe(`reminder_${ID}_${T}`);
  });

  it("gives a nag comeback its own prefix", () => {
    expect(nagAppKey(ID, T)).toBe(`snooze_${ID}_${T}`);
    expect(isNagAppKey(nagAppKey(ID, T))).toBe(true);
    expect(isNagAppKey(alarmAppKey(ID, T))).toBe(false);
  });

  it("parses both families back to the same reminder", () => {
    expect(parseAlarmAppKey(alarmAppKey(ID, T))).toEqual({
      reminderId: ID,
      scheduledFor: T,
    });
    expect(parseAlarmAppKey(nagAppKey(ID, T))).toEqual({
      reminderId: ID,
      scheduledFor: T,
    });
  });

  it("still rejects keys that are not alarms", () => {
    expect(parseAlarmAppKey(`prealert_${ID}_${T}`)).toBeNull();
    expect(parseAlarmAppKey("nonsense")).toBeNull();
    expect(parseAlarmAppKey(undefined as unknown as string)).toBeNull();
  });

  it("never lets a nag key collide with an occurrence key", () => {
    expect(nagAppKey(ID, T)).not.toBe(alarmAppKey(ID, T));
    expect(nagAppKey(ID, T).startsWith(`reminder_${ID}_`)).toBe(false);
  });
});

// ─── In-flight de-dup (the gap_resync vs create race) ───────────────────────

describe("dedupeByAppKey", () => {
  beforeEach(() => resetAppKeyDedupe());

  it("runs the work once when two callers race on the same appKey", async () => {
    const work = jest.fn(
      () => new Promise<string>((resolve) => setTimeout(() => resolve("done"), 5))
    );
    const key = alarmAppKey(ID, T);

    const [a, b] = await Promise.all([
      dedupeByAppKey(key, work),
      dedupeByAppKey(key, work),
    ]);

    expect(work).toHaveBeenCalledTimes(1);
    expect(a).toBe("done");
    expect(b).toBe("done");
  });

  it("does not collapse different appKeys", async () => {
    const work = jest.fn(async () => "done");

    await Promise.all([
      dedupeByAppKey(alarmAppKey(ID, T), work),
      dedupeByAppKey(alarmAppKey(ID, T + 5 * MIN), work),
    ]);

    expect(work).toHaveBeenCalledTimes(2);
  });

  it("does not collapse an occurrence with a nag at the same instant", async () => {
    const work = jest.fn(async () => "done");

    await Promise.all([
      dedupeByAppKey(alarmAppKey(ID, T), work),
      dedupeByAppKey(nagAppKey(ID, T), work),
    ]);

    expect(work).toHaveBeenCalledTimes(2);
  });

  it("releases the key once the work settles", async () => {
    const work = jest.fn(async () => "done");
    const key = alarmAppKey(ID, T);

    await dedupeByAppKey(key, work);
    await dedupeByAppKey(key, work);

    expect(work).toHaveBeenCalledTimes(2);
  });

  it("releases the key after a failure so the next attempt retries", async () => {
    const key = alarmAppKey(ID, T);
    const failing = jest.fn(async () => {
      throw new Error("AlarmKit refused");
    });

    await expect(dedupeByAppKey(key, failing)).rejects.toThrow("AlarmKit refused");
    await expect(dedupeByAppKey(key, async () => "ok")).resolves.toBe("ok");
  });

  it("propagates a failure to the caller that joined the in-flight run", async () => {
    const key = alarmAppKey(ID, T);
    const failing = () =>
      new Promise<string>((_, reject) => setTimeout(() => reject(new Error("boom")), 5));

    const first = dedupeByAppKey(key, failing);
    const joined = dedupeByAppKey(key, failing);

    await expect(first).rejects.toThrow("boom");
    await expect(joined).rejects.toThrow("boom");
  });

  it("turns a synchronous throw into a rejection instead of escaping", async () => {
    const key = alarmAppKey(ID, T);

    await expect(
      dedupeByAppKey(key, (() => {
        throw new Error("sync boom");
      }) as () => Promise<void>)
    ).rejects.toThrow("sync boom");
  });
});

// ─── Natively cancelled alarms stay inert ───────────────────────────────────
//
// The native intents can still append a cancel entry (they cancel alarms they
// consider superseded). Such a key produced no user outcome, so it must add no
// history and resurrect nothing — including no nag comeback.

describe("reconcileAlarmEvents — cancelled alarms", () => {
  const KEY = alarmAppKey(ID, T);

  it("collapses a cancelled alarm to an inert outcome", () => {
    expect(reconcileAlarmEvents([{ type: "cancelled", id: KEY, at: T }], T + MIN)).toEqual([
      { id: KEY, outcome: "cancelled", allowReschedule: false },
    ]);
  });

  it("accepts the alternative spellings the native log may use", () => {
    for (const type of ["canceled", "sibling_cancelled", "sibling_canceled", "CANCELLED"]) {
      const [result] = reconcileAlarmEvents([{ type, id: KEY, at: T }], T + MIN);
      expect(result.outcome).toBe("cancelled");
    }
  });

  it("does not call an alarm missed when it was cancelled after ringing", () => {
    const [result] = reconcileAlarmEvents(
      [
        { type: "fired", id: KEY, at: T },
        { type: "cancelled", id: KEY, at: T + 1000 },
      ],
      T + 30 * MIN
    );

    expect(result.outcome).toBe("cancelled");
    expect(result.allowReschedule).toBe(false);
  });

  it("still completes the alarm the user actually answered", () => {
    const [result] = reconcileAlarmEvents(
      [
        { type: "fired", id: KEY, at: T },
        { type: "stopped", id: KEY, at: T + 500 },
        { type: "cancelled", id: KEY, at: T + 600 },
      ],
      T + MIN
    );

    expect(result.outcome).toBe("completed");
  });

  it("keeps a cancel from suppressing another key's outcome", () => {
    const nag = nagAppKey(ID, T + 5 * MIN);
    const results = reconcileAlarmEvents(
      [
        { type: "stopped", id: KEY, at: T + 500 },
        { type: "cancelled", id: nag, at: T + 510 },
      ],
      T + MIN
    );

    expect(results.map((r) => r.outcome)).toEqual(["completed", "cancelled"]);
  });

  it("leaves a ring that resumed after a cancel on the normal path", () => {
    const [result] = reconcileAlarmEvents(
      [
        { type: "cancelled", id: KEY, at: T },
        { type: "fired", id: KEY, at: T + 1000 },
      ],
      T + 1000
    );

    expect(result.outcome).toBe("pending");
  });

  it("still drops genuinely unknown event types", () => {
    expect(reconcileAlarmEvents([{ type: "exploded", id: KEY, at: T }], T)).toEqual([]);
  });
});
