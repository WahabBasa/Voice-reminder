import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  __resetRingLifecycleForTests,
  RING_LIFECYCLE_STORAGE_KEY,
  RESOLVED_RETENTION_MS,
  getRingRecord,
  getRingSnapshot,
  hydrateRingLifecycle,
  markDone,
  markMissed,
  markRinging,
  markSnoozed,
  occurrenceKey,
  pruneRingLifecycle,
  resolveOccurrenceState,
  subscribeRingLifecycle,
  type OccurrenceRef,
} from "../../lib/ringLifecycle";

const ref: OccurrenceRef = { reminderId: "r1", occurrenceAt: 1_000 };
const key = occurrenceKey(ref);

async function stored(): Promise<Record<string, any>> {
  const raw = await AsyncStorage.getItem(RING_LIFECYCLE_STORAGE_KEY);
  return raw ? JSON.parse(raw) : {};
}

beforeEach(async () => {
  __resetRingLifecycleForTests();
  await AsyncStorage.clear();
});

describe("occurrenceKey", () => {
  it("joins reminder id and occurrence", () => {
    expect(occurrenceKey({ reminderId: "abc", occurrenceAt: 42 })).toBe("abc:42");
  });
});

describe("persist before resolve + notify", () => {
  it("has written storage and notified by the time the mark resolves", async () => {
    const seen: string[] = [];
    subscribeRingLifecycle((snap) => seen.push(snap[key]?.state ?? "none"));
    await markRinging(ref, { source: "alarmkit", at: 100, eventId: "e1" });
    expect(getRingRecord(ref)?.state).toBe("ringing");
    expect((await stored())[key].state).toBe("ringing");
    expect(seen).toEqual(["ringing"]);
  });

  it("serializes concurrent marks so the last write wins deterministically", async () => {
    // Fire without awaiting between; the chain must apply them in order.
    const a = markRinging(ref, { source: "alarmkit", at: 100, eventId: "a" });
    const b = markSnoozed(ref, { snoozeUntil: 5_000, chainId: "c2", at: 200, eventId: "b" });
    await Promise.all([a, b]);
    expect(getRingRecord(ref)?.state).toBe("snoozed");
    expect((await stored())[key].state).toBe("snoozed");
  });
});

describe("event de-duplication", () => {
  it("ignores a replayed eventId and does not notify again", async () => {
    const listener = jest.fn();
    subscribeRingLifecycle(listener);
    await markRinging(ref, { source: "alarmkit", at: 100, eventId: "dup" });
    await markRinging(ref, { source: "alarmkit", at: 300, eventId: "dup" });
    expect(listener).toHaveBeenCalledTimes(1);
    expect(getRingRecord(ref)?.lastEventAt).toBe(100);
  });
});

describe("terminal states", () => {
  it("done is not resurrected by a later ringing/snoozed mark", async () => {
    await markDone(ref, { at: 100, eventId: "d" });
    await markRinging(ref, { source: "alarmkit", at: 200, eventId: "r" });
    await markSnoozed(ref, { snoozeUntil: 9_000, chainId: "c9", at: 300, eventId: "s" });
    expect(getRingRecord(ref)?.state).toBe("done");
  });

  it("missed is idempotent but done still wins over it", async () => {
    await markMissed(ref, { at: 100, eventId: "m1" });
    await markMissed(ref, { at: 200, eventId: "m2" });
    expect(getRingRecord(ref)?.state).toBe("missed");
    await markDone(ref, { at: 300, eventId: "d" });
    expect(getRingRecord(ref)?.state).toBe("done");
    expect(getRingRecord(ref)?.resolvedAt).toBe(300);
  });

  it("done is idempotent", async () => {
    const listener = jest.fn();
    await markDone(ref, { at: 100, eventId: "d1" });
    subscribeRingLifecycle(listener);
    await markDone(ref, { at: 200, eventId: "d2" });
    expect(listener).not.toHaveBeenCalled();
  });
});

describe("chains and stale ordering", () => {
  it("a new record without chainId anchors on the occurrence", async () => {
    await markRinging(ref, { source: "alarmkit", at: 100, eventId: "e" });
    const rec = getRingRecord(ref)!;
    expect(rec.chainId).toBe(String(ref.occurrenceAt));
    expect(rec.chainStartedAt).toBe(ref.occurrenceAt);
  });

  it("markSnoozed starts a new chain; its comeback ring keeps that chain", async () => {
    await markRinging(ref, { source: "alarmkit", chainId: "c1", at: 100, eventId: "e1" });
    await markSnoozed(ref, { snoozeUntil: 5_000, chainId: "c2", at: 200, eventId: "e2" });
    expect(getRingRecord(ref)).toMatchObject({ state: "snoozed", chainId: "c2", snoozeUntil: 5_000 });
    // Comeback fires on the same chain: snooze cleared, back to ringing.
    await markRinging(ref, { source: "alarmkit", chainId: "c2", at: 300, eventId: "e3" });
    expect(getRingRecord(ref)).toMatchObject({ state: "ringing", chainId: "c2" });
    expect(getRingRecord(ref)?.snoozeUntil).toBeUndefined();
  });

  it("ignores a stale event from an older chain and stale `at` within a chain", async () => {
    await markSnoozed(ref, { snoozeUntil: 5_000, chainId: "c2", at: 200, eventId: "e1" });
    // Stale ring event (no chainId → current chain) with older `at`: ignored.
    await markRinging(ref, { source: "alarmkit", at: 150, eventId: "e2" });
    expect(getRingRecord(ref)).toMatchObject({ state: "snoozed", chainId: "c2" });
  });

  it("markRinging with an explicit different chainId replaces the chain", async () => {
    await markSnoozed(ref, { snoozeUntil: 5_000, chainId: "c2", at: 200, eventId: "e1" });
    await markRinging(ref, { source: "alarmkit", chainId: "c3", at: 50, eventId: "e2" });
    expect(getRingRecord(ref)).toMatchObject({ state: "ringing", chainId: "c3", chainStartedAt: 50 });
  });
});

describe("resolveOccurrenceState", () => {
  it("reports a record's state, and unknown with no record regardless of now", async () => {
    await markSnoozed(ref, { snoozeUntil: 7_777, chainId: "c2", at: 200, eventId: "e1" });
    const snap = getRingSnapshot();
    expect(resolveOccurrenceState(ref, 0, snap)).toMatchObject({ state: "snoozed", snoozeUntil: 7_777, chainId: "c2" });
    const other = { reminderId: "r2", occurrenceAt: 1_000 };
    // Before it is due and long after it is due: still unknown — grace is the caller's job.
    expect(resolveOccurrenceState(other, 0, snap)).toEqual({ state: "unknown" });
    expect(resolveOccurrenceState(other, 10 ** 12, snap)).toEqual({ state: "unknown" });
  });
});

describe("pruneRingLifecycle", () => {
  it("drops resolved records past retention and keeps unresolved ones", async () => {
    const now = 10 * RESOLVED_RETENTION_MS;
    const oldDone: OccurrenceRef = { reminderId: "r", occurrenceAt: 1 };
    const recentMissed: OccurrenceRef = { reminderId: "r", occurrenceAt: 2 };
    const liveRing: OccurrenceRef = { reminderId: "r", occurrenceAt: 3 };
    await markDone(oldDone, { at: now - RESOLVED_RETENTION_MS - 1, eventId: "d" });
    await markMissed(recentMissed, { at: now - 1000, eventId: "m" });
    await markRinging(liveRing, { source: "alarmkit", at: now - RESOLVED_RETENTION_MS - 1, eventId: "r" });
    await pruneRingLifecycle(now);
    const snap = getRingSnapshot();
    expect(getRingRecord(oldDone, snap)).toBeUndefined();
    expect(getRingRecord(recentMissed, snap)?.state).toBe("missed");
    expect(getRingRecord(liveRing, snap)?.state).toBe("ringing");
    expect((await stored())[occurrenceKey(oldDone)]).toBeUndefined();
  });

  it("is a no-op when nothing is stale", async () => {
    await markRinging(ref, { source: "alarmkit", at: 100, eventId: "e" });
    const listener = jest.fn();
    subscribeRingLifecycle(listener);
    await pruneRingLifecycle(200);
    expect(listener).not.toHaveBeenCalled();
  });
});

describe("hydrate", () => {
  it("loads persisted records, seeds de-dup, and is idempotent", async () => {
    await markRinging(ref, { source: "alarmkit", at: 100, eventId: "persisted" });
    // Fresh module memory, storage intact.
    __resetRingLifecycleForTests();
    expect(getRingSnapshot()).toEqual({});
    await hydrateRingLifecycle();
    await hydrateRingLifecycle(); // idempotent
    expect(getRingRecord(ref)?.state).toBe("ringing");
    // A replay of the persisted event is still de-duplicated after hydrate.
    await markRinging(ref, { source: "alarmkit", at: 500, eventId: "persisted" });
    expect(getRingRecord(ref)?.lastEventAt).toBe(100);
  });

  it("survives corrupt storage by starting empty", async () => {
    await AsyncStorage.setItem(RING_LIFECYCLE_STORAGE_KEY, "{not json");
    await hydrateRingLifecycle();
    expect(getRingSnapshot()).toEqual({});
  });
});

describe("subscribe / unsubscribe", () => {
  it("stops notifying after unsubscribe", async () => {
    const listener = jest.fn();
    const off = subscribeRingLifecycle(listener);
    await markRinging(ref, { source: "alarmkit", at: 100, eventId: "e1" });
    off();
    await markDone(ref, { at: 200, eventId: "e2" });
    expect(listener).toHaveBeenCalledTimes(1);
  });
});
