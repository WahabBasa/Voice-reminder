/**
 * The store-level creation lock (spec §2.4, C9).
 *
 * Two writers can now reach for the free cap at once: a voice take finishing
 * its import, and the typed composer's `addReminder`. Both count the active
 * reminders, both decide there is room, both write — and a free plan ends up
 * with six. The lock serializes the whole check-and-write, and legacy
 * `addReminder` runs inside it too, which is what makes the guarantee real
 * rather than half of one.
 *
 * These tests drive both writers for real: the actual store action on one side,
 * the actual `commitTake` on the other.
 *
 * What the lock does NOT cover is just as load-bearing: `commitTake` takes it
 * only once the job read and the entitlement check are done, so a network that
 * never answers cannot leave the typed composer's Save spinning behind it.
 */
jest.mock("../../lib/purchases", () => ({
  __esModule: true,
  checkProStatus: jest.fn(async () => false),
  getCachedProStatus: jest.fn(() => ({ isPro: false, updatedAtMs: 0 })),
}));

import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  persistReminders,
  useReminderStore,
  withCreationLock,
  type Reminder,
} from "../../lib/store";
import { getActiveReminderCount } from "../../lib/usage";
import { ReminderLimitExceededError, getFreeActiveLimit } from "../../lib/usageGate";
import { commitTake, type CommitTakeDeps, type CommittedRow } from "../../lib/takeCommit";
import type { PendingTake } from "../../lib/pendingTakes";

const LIMIT = getFreeActiveLimit();
const DAY = 86_400_000;

const TAKE: PendingTake = {
  creationId: "take-1",
  phase: "transcribed",
  recordingUri: "file:///docs/take.m4a",
  localDate: "2026-09-01",
  localTime: "09:15:00",
  timezone: "UTC",
  createdAt: 1_000,
  attempts: 0,
};

function isoDate(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;
}

/** Four one-offs still owed, exactly as a voice take stores them. */
function seedFourActive(): void {
  const now = Date.now();
  const reminders: Reminder[] = Array.from({ length: LIMIT - 1 }, (_, i) => ({
    id: `seed_${i + 1}`,
    title: `Alarm ${i + 1}`,
    description: "",
    time: "09:00",
    date: isoDate(now - (i + 1) * DAY),
    frequency: "once",
    days: [],
    createdAt: new Date(now - (i + 1) * DAY - 3_600_000).toISOString(),
    schemaVersion: 5,
    schedule: {
      type: "grid",
      days: { kind: "date", date: isoDate(now - (i + 1) * DAY) },
      times: { kind: "clock", times: ["09:00"] },
    },
  }));
  useReminderStore.setState({ reminders, history: [], hasLoadedReminders: true });
}

const typedDraft = {
  title: "Typed sixth",
  description: "",
  time: "18:00",
  date: isoDate(Date.now() + DAY),
  frequency: "once",
  days: [] as string[],
};

const jobRow: CommittedRow = {
  id: "cx1",
  title: "Voice sixth",
  description: "",
  time: "20:00",
  frequency: "once",
  days: [],
  audioUrl: null,
  audioStatus: "ready",
};

function importDeps(over: Partial<CommitTakeDeps> = {}): {
  deps: CommitTakeDeps;
  serverDeletes: string[];
} {
  const serverDeletes: string[] = [];
  const deps: CommitTakeDeps = {
    fetchRows: async () => [jobRow],
    proStatus: async () => "free",
    withLock: withCreationLock,
    activeCount: getActiveReminderCount,
    limit: LIMIT,
    storeSnapshot: () => useReminderStore.getState().reminders,
    applyStore: (rows) => useReminderStore.setState({ reminders: rows }),
    persistStore: persistReminders,
    newLocalId: () => "voice-local",
    now: () => Date.now(),
    markCommitting: async () => {},
    markCapUnverified: async () => {},
    removeTake: async () => {},
    deleteRecording: async () => {},
    ack: async () => {},
    deleteServerRow: async (id) => {
      serverDeletes.push(id);
    },
    wait: async () => {},
    ...over,
  };
  return { deps, serverDeletes };
}

const flush = async (ticks = 12): Promise<void> => {
  for (let i = 0; i < ticks; i++) await Promise.resolve();
};

beforeEach(() => {
  (AsyncStorage as any)._reset();
  useReminderStore.setState({
    reminders: [],
    history: [],
    isLoading: false,
    hasLoadedReminders: true,
  });
});

/**
 * Hold the import inside the lock, at a point of the test's choosing.
 *
 * `commitTake` reaches the lock only after two awaits (the job read and the
 * entitlement), so "call the import first" no longer means "gets the lock
 * first". Gating `markCommitting` — the first thing that runs under the lock —
 * puts the import demonstrably inside it while the other writer arrives.
 */
function gatedImport(over: Partial<CommitTakeDeps> = {}) {
  let open: () => void = () => {};
  const held = new Promise<void>((resolve) => {
    open = resolve;
  });
  let acquired: () => void = () => {};
  const inside = new Promise<void>((resolve) => {
    acquired = resolve;
  });

  const { deps, serverDeletes } = importDeps({
    markCommitting: async () => {
      acquired();
      await held;
    },
    ...over,
  });

  return { deps, serverDeletes, inside, open: () => open() };
}

describe("two writers reaching for the last free slot", () => {
  it("lets the typed composer take it and cuts the voice take against the new count", async () => {
    seedFourActive();
    const { deps, serverDeletes } = importDeps();

    // The composer gets the lock first; the import queues behind it.
    const typed = useReminderStore.getState().addReminder(typedDraft);
    const imported = commitTake({ take: TAKE, deps });

    const [typedResult, importResult] = await Promise.all([typed, imported]);
    await flush();

    expect(typedResult.title).toBe("Typed sixth");
    expect(importResult).toMatchObject({
      result: "imported",
      summary: { created: 0, dropped: 1, total: 1 },
    });
    // Five, not six: the import counted the row the composer had just written.
    expect(getActiveReminderCount()).toBe(LIMIT);
    expect(serverDeletes).toEqual(["cx1"]);
  });

  it("lets the voice take have it and refuses the typed reminder against the new count", async () => {
    seedFourActive();
    const gate = gatedImport();

    const imported = commitTake({ take: TAKE, deps: gate.deps });
    await gate.inside;
    // The composer arrives with the import already holding the lock.
    const typed = useReminderStore.getState().addReminder(typedDraft);
    gate.open();

    const [importResult, typedResult] = await Promise.allSettled([imported, typed]);
    await flush();

    expect(importResult.status).toBe("fulfilled");
    expect((importResult as PromiseFulfilledResult<any>).value).toMatchObject({
      result: "imported",
      summary: { created: 1, dropped: 0 },
    });
    expect(typedResult.status).toBe("rejected");
    expect((typedResult as PromiseRejectedResult).reason).toBeInstanceOf(
      ReminderLimitExceededError
    );
    expect(getActiveReminderCount()).toBe(LIMIT);
  });
});

describe("a read-then-write import racing a store write", () => {
  it("cannot clobber the row the other writer added in between", async () => {
    useReminderStore.setState({ reminders: [], history: [], hasLoadedReminders: true });
    const gate = gatedImport();

    // The import's snapshot and its write are separated by real awaits; without
    // the lock the composer's row would land inside that window and be lost.
    const imported = commitTake({ take: TAKE, deps: gate.deps });
    await gate.inside;
    const typed = useReminderStore.getState().addReminder(typedDraft);
    gate.open();

    await Promise.all([imported, typed]);
    await flush();

    const titles = useReminderStore.getState().reminders.map((r) => r.title).sort();
    expect(titles).toEqual(["Typed sixth", "Voice sixth"]);

    const onDisk = JSON.parse((await AsyncStorage.getItem("@reminders")) as string);
    expect(onDisk).toHaveLength(2);
  });
});

describe("what the lock deliberately does not cover", () => {
  it("lets the typed composer save while an import's job read hangs", async () => {
    useReminderStore.setState({ reminders: [], history: [], hasLoadedReminders: true });
    // A read that never comes back — the stalled import the lock used to hold
    // the whole store hostage for.
    const { deps } = importDeps({ fetchRows: () => new Promise(() => {}) });

    void commitTake({ take: TAKE, deps });
    await flush();

    const typed = await useReminderStore.getState().addReminder(typedDraft);
    expect(typed.title).toBe("Typed sixth");
  });

  it("lets the typed composer save while an import's entitlement check hangs", async () => {
    useReminderStore.setState({ reminders: [], history: [], hasLoadedReminders: true });
    // forceRefreshProStatus has no timeout of its own; this is that call.
    const { deps } = importDeps({ proStatus: () => new Promise(() => {}) });

    void commitTake({ take: TAKE, deps });
    await flush();

    const typed = await useReminderStore.getState().addReminder(typedDraft);
    expect(typed.title).toBe("Typed sixth");
  });
});

describe("withCreationLock", () => {
  it("runs its callers one at a time, in the order they arrived", async () => {
    const order: string[] = [];
    const slow = withCreationLock(async () => {
      order.push("a:start");
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
      order.push("a:end");
    });
    const fast = withCreationLock(async () => {
      order.push("b:start");
      order.push("b:end");
    });

    await Promise.all([slow, fast]);

    expect(order).toEqual(["a:start", "a:end", "b:start", "b:end"]);
  });

  it("does not let a thrown caller strand the queue behind it", async () => {
    const boom = withCreationLock(async () => {
      throw new Error("write failed");
    });
    const after = withCreationLock(async () => "still runs");

    await expect(boom).rejects.toThrow("write failed");
    await expect(after).resolves.toBe("still runs");
  });
});
