/**
 * The in-app feedback outbox.
 *
 * Two promises carry the whole contract: `enqueue` must reach disk before it
 * resolves (that is what makes "saved on this phone" true across a kill), and
 * `flush` must drain oldest-first, stop dead on the first network failure, treat
 * a server duplicate as a success, and never double-send when two triggers race.
 * Sent notes age out after 30 days; queued notes never do.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  FEEDBACK_OUTBOX_STORAGE_KEY,
  SENT_RETENTION_MS,
  __resetFeedbackOutbox,
  enqueue,
  flush,
  getFeedbackOutboxSnapshot,
  isQueued,
  loadFeedbackOutbox,
  newFeedbackClientId,
  type FeedbackOutboxItem,
  type FeedbackSubmitInput,
} from "../../lib/feedbackOutbox";

beforeEach(() => {
  (AsyncStorage as any)._reset();
  __resetFeedbackOutbox();
});

afterEach(() => {
  // Never let a gated/spied AsyncStorage from one test bleed into the next.
  jest.restoreAllMocks();
});

async function readDisk(): Promise<FeedbackOutboxItem[]> {
  const raw = await AsyncStorage.getItem(FEEDBACK_OUTBOX_STORAGE_KEY);
  return raw ? JSON.parse(raw) : [];
}

const input = (over: Partial<FeedbackSubmitInput> = {}): FeedbackSubmitInput => ({
  clientId: "f1",
  text: "something broke",
  createdAt: 1_000,
  ...over,
});

const okSubmit = () => Promise.resolve({ id: "srv1", duplicate: false });

// ─── enqueue ────────────────────────────────────────────────────────────────

describe("enqueue", () => {
  it("has written the note to disk before it resolves", async () => {
    // A call-through spy: enqueue awaits the real write, so by the time enqueue
    // resolves the note is already on disk. If enqueue resolved first, the disk
    // read below would come back empty.
    const spy = jest.spyOn(AsyncStorage, "setItem");

    await enqueue(input());

    expect(spy).toHaveBeenCalledTimes(1);
    expect(await readDisk()).toHaveLength(1);
  });

  it("stores the note as queued and exposes it on the snapshot", async () => {
    await enqueue(input({ clientId: "abc", text: "hi", createdAt: 42 }));
    const snap = getFeedbackOutboxSnapshot();
    expect(snap).toEqual([
      { clientId: "abc", text: "hi", createdAt: 42, state: "queued" },
    ]);
    expect(isQueued("abc")).toBe(true);
    expect(await readDisk()).toEqual(snap);
  });

  it("keeps context when given and is idempotent on clientId", async () => {
    await enqueue(input({ clientId: "dup", context: { kind: "settings" } }));
    await enqueue(input({ clientId: "dup", text: "changed", context: { kind: "reminder" } }));
    const snap = getFeedbackOutboxSnapshot();
    expect(snap).toHaveLength(1);
    expect(snap[0].text).toBe("something broke");
    expect(snap[0].context).toEqual({ kind: "settings" });
  });
});

// ─── flush ──────────────────────────────────────────────────────────────────

describe("flush", () => {
  it("sends queued notes oldest first and marks each sent", async () => {
    await enqueue(input({ clientId: "b", createdAt: 200 }));
    await enqueue(input({ clientId: "a", createdAt: 100 }));
    await enqueue(input({ clientId: "c", createdAt: 300 }));

    const seen: string[] = [];
    const submit = async (i: FeedbackSubmitInput) => {
      seen.push(i.clientId);
      return { id: `srv-${i.clientId}`, duplicate: false };
    };

    await flush(submit, () => 5_000);

    expect(seen).toEqual(["a", "b", "c"]);
    const snap = getFeedbackOutboxSnapshot();
    expect(snap.every((item) => item.state === "sent")).toBe(true);
    expect(snap.every((item) => item.sentAt === 5_000)).toBe(true);
    expect((await readDisk()).every((item) => item.state === "sent")).toBe(true);
  });

  it("counts a server duplicate as a successful send", async () => {
    await enqueue(input({ clientId: "d1" }));
    await flush(async () => ({ id: "srv", duplicate: true }));
    expect(isQueued("d1")).toBe(false);
    expect(getFeedbackOutboxSnapshot()[0].state).toBe("sent");
  });

  it("stops on the first failure and leaves that note and the rest queued", async () => {
    await enqueue(input({ clientId: "a", createdAt: 100 }));
    await enqueue(input({ clientId: "b", createdAt: 200 }));
    await enqueue(input({ clientId: "c", createdAt: 300 }));

    const seen: string[] = [];
    const submit = async (i: FeedbackSubmitInput) => {
      seen.push(i.clientId);
      if (i.clientId === "b") throw new Error("network");
      return { id: "srv", duplicate: false };
    };

    await flush(submit);

    // 'a' went, 'b' threw and stopped the drain, 'c' was never attempted.
    expect(seen).toEqual(["a", "b"]);
    const byId = Object.fromEntries(
      getFeedbackOutboxSnapshot().map((item) => [item.clientId, item.state])
    );
    expect(byId).toEqual({ a: "sent", b: "queued", c: "queued" });
  });

  it("is serialized: two concurrent flushes never send a note twice", async () => {
    await enqueue(input({ clientId: "a", createdAt: 100 }));
    await enqueue(input({ clientId: "b", createdAt: 200 }));

    let calls = 0;
    const submit = async () => {
      calls += 1;
      await new Promise((r) => setTimeout(r, 5));
      return { id: "srv", duplicate: false };
    };

    // Kick two drains off in the same tick — the second must join the first.
    await Promise.all([flush(submit), flush(submit)]);

    expect(calls).toBe(2);
    expect(getFeedbackOutboxSnapshot().every((item) => item.state === "sent")).toBe(true);
  });

  it("does nothing when there is nothing queued", async () => {
    const submit = jest.fn(okSubmit);
    await flush(submit);
    expect(submit).not.toHaveBeenCalled();
  });
});

// ─── prune ──────────────────────────────────────────────────────────────────

describe("prune on load", () => {
  it("drops sent notes past the retention window but keeps queued ones", async () => {
    const now = 1_000_000_000_000;
    const old: FeedbackOutboxItem = {
      clientId: "old",
      text: "stale",
      createdAt: now - SENT_RETENTION_MS - 10_000,
      state: "sent",
      sentAt: now - SENT_RETENTION_MS - 5_000,
    };
    const fresh: FeedbackOutboxItem = {
      clientId: "fresh",
      text: "recent",
      createdAt: now - 1_000,
      state: "sent",
      sentAt: now - 1_000,
    };
    const stillQueued: FeedbackOutboxItem = {
      clientId: "q",
      text: "waiting",
      createdAt: now - SENT_RETENTION_MS - 999_999, // ancient, but never sent
      state: "queued",
    };
    await AsyncStorage.setItem(
      FEEDBACK_OUTBOX_STORAGE_KEY,
      JSON.stringify([old, fresh, stillQueued])
    );

    const loaded = await loadFeedbackOutbox(() => now);
    const ids = loaded.map((item) => item.clientId).sort();
    expect(ids).toEqual(["fresh", "q"]);
    // The prune was written back to disk.
    expect((await readDisk()).map((i) => i.clientId).sort()).toEqual(["fresh", "q"]);
  });

  it("recovers from a corrupt key as an empty outbox", async () => {
    await AsyncStorage.setItem(FEEDBACK_OUTBOX_STORAGE_KEY, "not json{");
    expect(await loadFeedbackOutbox()).toEqual([]);
  });
});

describe("newFeedbackClientId", () => {
  it("mints distinct non-empty ids", () => {
    const a = newFeedbackClientId();
    const b = newFeedbackClientId();
    expect(a).toBeTruthy();
    expect(a).not.toBe(b);
  });
});
