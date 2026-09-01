/**
 * Importing a committed take (spec §2.4).
 *
 * Everything the import touches arrives injected — the job read, the
 * entitlement, the store, the disk, the server deletes — so this suite drives
 * the whole of §2.4 without a device or a Convex client in reach.
 *
 * The four things it exists to hold down:
 *   - the upsert IS the idempotency mechanism, so a replay after a crash costs
 *     a second pass and nothing else (D2);
 *   - a failed batch write rolls memory back, because `committing + null`
 *     recovery reads the store as durable proof (C3/N3);
 *   - premium is cut BEFORE the cap is spent, and an unresolved entitlement
 *     imports nothing at all (D6/OLD-127);
 *   - an overflow row is only deleted once its own audio has settled (C6);
 *   - the creation lock covers the LOCAL half only — the job read and the
 *     entitlement check happen outside it, and the cap math is computed against
 *     a store read taken after it is held (C9).
 */
import {
  commitTake,
  drainOverflowDeletion,
  mergeImportedRow,
  upsertByConvexId,
  type CommitTakeDeps,
  type CommittedRow,
  type TakeImportSummary,
} from "../../lib/takeCommit";
import type { Reminder } from "../../lib/store";
import type { PendingTake } from "../../lib/pendingTakes";

const TAKE: PendingTake = {
  creationId: "take-1",
  phase: "transcribed",
  recordingUri: "file:///docs/take_take-1.m4a",
  localDate: "2026-09-01",
  localTime: "09:15:00",
  // The JOB's zone, deliberately not the runner's (jest runs in UTC).
  timezone: "Asia/Riyadh",
  createdAt: 1_000,
  attempts: 0,
};

const row = (over: Partial<CommittedRow> = {}): CommittedRow => ({
  id: "cx1",
  title: "Water",
  description: "Your water glass is still full.",
  time: "20:00",
  frequency: "once",
  days: [],
  audioUrl: null,
  audioStatus: "pending",
  ...over,
});

const intervalRow = (over: Partial<CommittedRow> = {}): CommittedRow =>
  row({
    id: "cxi",
    title: "Pills every 30 min",
    frequency: "interval",
    intervalMs: 30 * 60 * 1000,
    ...over,
  });

const stored = (over: Partial<Reminder> = {}): Reminder => ({
  id: "local1",
  convexId: "cx1",
  title: "Water",
  description: "",
  time: "20:00",
  frequency: "once",
  days: [],
  createdAt: "2026-08-01T00:00:00.000Z",
  ...over,
});

type Harness = {
  deps: CommitTakeDeps;
  store: Reminder[];
  persisted: Reminder[] | null;
  stages: string[];
  imported: Array<{ created: Reminder[]; summary: TakeImportSummary }>;
  serverDeletes: string[];
  acks: number;
  removedTake: number;
  deletedRecording: number;
  phases: string[];
};

function harness(over: Partial<CommitTakeDeps> = {}, rows: CommittedRow[] | null = [row()]): Harness {
  let localIds = 0;
  const h: Partial<Harness> = {
    store: [],
    persisted: null,
    stages: [],
    imported: [],
    serverDeletes: [],
    acks: 0,
    removedTake: 0,
    deletedRecording: 0,
    phases: [],
  };

  const deps: CommitTakeDeps = {
    fetchRows: async () => rows,
    proStatus: async () => "free",
    withLock: (run) => run(),
    activeCount: () => 0,
    limit: 5,
    storeSnapshot: () => h.store as Reminder[],
    applyStore: (next) => {
      h.store = next;
    },
    persistStore: async (next) => {
      h.persisted = next;
    },
    newLocalId: () => `local-${++localIds}`,
    now: () => 1_700_000_000_000,
    markCommitting: async () => {
      (h.phases as string[]).push("committing");
    },
    markCapUnverified: async () => {
      (h.phases as string[]).push("cap_unverified");
    },
    removeTake: async () => {
      h.removedTake = (h.removedTake as number) + 1;
    },
    deleteRecording: async () => {
      h.deletedRecording = (h.deletedRecording as number) + 1;
    },
    ack: async () => {
      h.acks = (h.acks as number) + 1;
    },
    deleteServerRow: async (id) => {
      (h.serverDeletes as string[]).push(id);
    },
    wait: async () => {},
    onImported: (created, summary) => {
      (h.imported as any[]).push({ created, summary });
    },
    onStage: (stage) => {
      (h.stages as string[]).push(stage);
    },
    ...over,
  };

  h.deps = deps;
  return h as Harness;
}

/** Let the detached ack / overflow drain run. */
const flush = async (ticks = 12): Promise<void> => {
  for (let i = 0; i < ticks; i++) await Promise.resolve();
};

// ─── the read ───────────────────────────────────────────────────────────────

describe("a job whose rows will not read", () => {
  it("is `unavailable` — the caller decides whether that is a race or a loss", async () => {
    const h = harness({}, null);

    await expect(commitTake({ take: TAKE, deps: h.deps })).resolves.toEqual({
      result: "unavailable",
    });
    expect(h.phases).toEqual([]);
    expect(h.removedTake).toBe(0);
  });
});

describe("a committed take whose rows were all deleted", () => {
  it("cleans up and reports empty rather than importing placeholders", async () => {
    const h = harness({}, [
      { id: "cx1", deleted: true },
      { id: "cx2", deleted: true },
    ]);

    await expect(commitTake({ take: TAKE, deps: h.deps })).resolves.toEqual({ result: "empty" });
    await flush();

    expect(h.store).toEqual([]);
    expect(h.removedTake).toBe(1);
    expect(h.deletedRecording).toBe(1);
    expect(h.acks).toBe(1);
  });

  it("keeps the rows that are still there and drops only the placeholders", async () => {
    const h = harness({}, [row({ id: "cx1" }), { id: "cx2", deleted: true }]);

    const outcome = await commitTake({ take: TAKE, deps: h.deps });

    expect(outcome).toMatchObject({ result: "imported" });
    expect(h.store.map((r) => r.convexId)).toEqual(["cx1"]);
  });
});

// ─── the allowance ──────────────────────────────────────────────────────────

describe("an entitlement we could not confirm", () => {
  it("imports nothing, deletes nothing, and sells nothing (OLD-127)", async () => {
    const h = harness({ proStatus: async () => "unknown" }, [row(), row({ id: "cx2" })]);

    await expect(commitTake({ take: TAKE, deps: h.deps })).resolves.toEqual({
      result: "cap_unverified",
    });

    expect(h.phases).toEqual(["cap_unverified"]);
    expect(h.store).toEqual([]);
    expect(h.persisted).toBeNull();
    expect(h.serverDeletes).toEqual([]);
    expect(h.removedTake).toBe(0);
    expect(h.stages).toContain("cap_unverified");
  });

  it("says so even with no stage reporter wired up", async () => {
    const h = harness({ proStatus: async () => "unknown", onStage: undefined });

    await expect(commitTake({ take: TAKE, deps: h.deps })).resolves.toEqual({
      result: "cap_unverified",
    });
  });
});

describe("a confirmed subscriber", () => {
  it("keeps the whole take, interval schedules included", async () => {
    const h = harness({ proStatus: async () => "pro", activeCount: () => 20 }, [
      row({ id: "cx1" }),
      intervalRow(),
      row({ id: "cx3" }),
    ]);

    const outcome = await commitTake({ take: TAKE, deps: h.deps });

    expect(outcome).toMatchObject({
      result: "imported",
      summary: { created: 3, dropped: 0, blockedPremium: 0, total: 3, limit: 5 },
    });
    expect(h.serverDeletes).toEqual([]);
  });
});

describe("a confirmed free plan", () => {
  it("cuts the Pro-only schedule FIRST, then spends the cap on what is left", async () => {
    // One slot left. The interval row never gets one; the first clock-time
    // sibling takes it; the second falls off the cap.
    const h = harness({ activeCount: () => 4 }, [
      intervalRow({ audioStatus: "ready" }),
      row({ id: "cx2", audioStatus: "ready" }),
      row({ id: "cx3", audioStatus: "ready" }),
    ]);

    const outcome = await commitTake({ take: TAKE, deps: h.deps });
    await flush();

    expect(outcome).toMatchObject({
      result: "imported",
      summary: { created: 1, dropped: 1, blockedPremium: 1, total: 3 },
    });
    expect(h.store.map((r) => r.convexId)).toEqual(["cx2"]);
    // Both cut rows leave through the server, in take order.
    expect(h.serverDeletes).toEqual(["cxi", "cx3"]);
  });

  it("keeps a take that fits without asking anything of the server", async () => {
    const h = harness({}, [row({ id: "cx1" }), row({ id: "cx2" })]);

    await commitTake({ take: TAKE, deps: h.deps });
    await flush();

    expect(h.store).toHaveLength(2);
    expect(h.serverDeletes).toEqual([]);
  });
});

// ─── the lock boundary ──────────────────────────────────────────────────────

describe("the creation lock", () => {
  it("is taken only AFTER the job read and the entitlement check", async () => {
    const order: string[] = [];
    const h = harness({
      fetchRows: async () => {
        order.push("fetchRows");
        return [row()];
      },
      proStatus: async () => {
        order.push("proStatus");
        return "free";
      },
      withLock: async (run) => {
        order.push("lock");
        const result = await run();
        order.push("unlock");
        return result;
      },
      persistStore: async () => {
        order.push("persist");
      },
    });

    await commitTake({ take: TAKE, deps: h.deps });

    expect(order).toEqual(["fetchRows", "proStatus", "lock", "persist", "unlock"]);
  });

  it("never reaches the lock when the rows will not read", async () => {
    const withLock = jest.fn(async (run: () => Promise<unknown>) => run());
    const h = harness({ withLock: withLock as any }, null);

    await commitTake({ take: TAKE, deps: h.deps });

    expect(withLock).not.toHaveBeenCalled();
  });

  it("never reaches the lock when the entitlement will not resolve", async () => {
    const withLock = jest.fn(async (run: () => Promise<unknown>) => run());
    const h = harness({ proStatus: async () => "unknown", withLock: withLock as any });

    await commitTake({ take: TAKE, deps: h.deps });

    expect(withLock).not.toHaveBeenCalled();
  });

  it("counts the active reminders INSIDE the lock, not before it", async () => {
    // Another writer takes the last free slot while this import waits for the
    // lock. Reading the count before acquiring would let the take keep a row
    // the cap no longer has room for.
    let active = 3;
    const h = harness(
      {
        activeCount: () => active,
        withLock: async (run) => {
          active = 5;
          return await run();
        },
      },
      [row({ id: "cx1", audioStatus: "ready" }), row({ id: "cx2", audioStatus: "ready" })]
    );

    const outcome = await commitTake({ take: TAKE, deps: h.deps });
    await flush();

    expect(outcome).toMatchObject({ summary: { created: 0, dropped: 2 } });
    expect(h.serverDeletes).toEqual(["cx1", "cx2"]);
  });
});

// ─── the write ──────────────────────────────────────────────────────────────

describe("the batch write", () => {
  it("is ONE store set and ONE disk write for the whole take", async () => {
    const applyStore = jest.fn();
    const persistStore = jest.fn(async () => {});
    const h = harness({ applyStore, persistStore }, [
      row({ id: "cx1" }),
      row({ id: "cx2" }),
      row({ id: "cx3" }),
    ]);

    await commitTake({ take: TAKE, deps: h.deps });

    expect(applyStore).toHaveBeenCalledTimes(1);
    expect(persistStore).toHaveBeenCalledTimes(1);
    expect(applyStore.mock.calls[0][0]).toHaveLength(3);
  });

  it("stamps every imported row with the take it came from (N1)", async () => {
    const h = harness({}, [row({ id: "cx1" }), row({ id: "cx2" })]);

    await commitTake({ take: TAKE, deps: h.deps });

    expect(h.store.map((r) => r.creationId)).toEqual(["take-1", "take-1"]);
  });

  it("builds the rows against the JOB's timezone, not the device's clock (C14)", async () => {
    const h = harness();

    await commitTake({ take: TAKE, deps: h.deps });

    expect(h.store[0].tzid).toBe("Asia/Riyadh");
  });

  it("marks `committing` BEFORE the write, so a crash mid-write is recoverable", async () => {
    const order: string[] = [];
    const h = harness({
      markCommitting: async () => {
        order.push("committing");
      },
      persistStore: async () => {
        order.push("persist");
      },
    });

    await commitTake({ take: TAKE, deps: h.deps });

    expect(order).toEqual(["committing", "persist"]);
  });

  it("rolls the store back when the disk write fails, and leaves the take committing", async () => {
    const h = harness({
      persistStore: async () => {
        throw new Error("disk full");
      },
    });
    h.store = [stored({ id: "existing", convexId: "other" })];

    const outcome = await commitTake({ take: TAKE, deps: h.deps });

    expect(outcome).toMatchObject({ result: "persist_failed" });
    // Memory never holds a stamped row whose write failed (N3).
    expect(h.store.map((r) => r.id)).toEqual(["existing"]);
    expect(h.removedTake).toBe(0);
    expect(h.stages).toContain("persist_failed");
  });

  it("reports a failed write even with no stage reporter", async () => {
    const h = harness({
      onStage: undefined,
      persistStore: async () => {
        throw new Error("disk full");
      },
    });

    await expect(commitTake({ take: TAKE, deps: h.deps })).resolves.toMatchObject({
      result: "persist_failed",
    });
  });
});

describe("a replay after a crash", () => {
  it("updates the rows in place instead of appending a second copy (D2)", async () => {
    const h = harness({}, [row({ id: "cx1" }), row({ id: "cx2" })]);

    await commitTake({ take: TAKE, deps: h.deps });
    const first = h.store.map((r) => r.id);

    // The outbox cleanup never happened; the next reconcile runs the whole
    // step again.
    await commitTake({ take: TAKE, deps: h.deps });

    expect(h.store).toHaveLength(2);
    expect(h.store.map((r) => r.id)).toEqual(first);
  });

  it("does not walk an already-hydrated row back to pending", async () => {
    const h = harness();
    h.store = [
      stored({
        convexId: "cx1",
        audioUrl: "file:///reminder_local1.mp3",
        audioStatus: "ready",
        audioExtrasStatus: "ready",
        scheduledFor: 123,
      }),
    ];

    await commitTake({ take: TAKE, deps: h.deps });

    expect(h.store[0]).toMatchObject({
      id: "local1",
      audioStatus: "ready",
      audioUrl: "file:///reminder_local1.mp3",
      scheduledFor: 123,
      // The replay still stamps what was missing.
      creationId: "take-1",
    });
  });
});

// ─── cleanup ────────────────────────────────────────────────────────────────

describe("cleanup", () => {
  it("removes the take, deletes the recording, then acks", async () => {
    const order: string[] = [];
    const h = harness({
      removeTake: async () => {
        order.push("remove");
      },
      deleteRecording: async () => {
        order.push("recording");
      },
      ack: async () => {
        order.push("ack");
      },
    });

    await commitTake({ take: TAKE, deps: h.deps });
    await flush();

    expect(order).toEqual(["remove", "recording", "ack"]);
  });

  it("stops at a failed outbox removal — the next reconcile replays it", async () => {
    const h = harness({
      removeTake: async () => {
        throw new Error("disk gone");
      },
    });

    await commitTake({ take: TAKE, deps: h.deps });
    await flush();

    expect(h.deletedRecording).toBe(0);
    expect(h.acks).toBe(0);
    expect(h.stages).toContain("remove_take_failed");
  });

  it("shrugs off a recording it cannot delete and still acks", async () => {
    const h = harness({
      deleteRecording: async () => {
        throw new Error("no such file");
      },
    });

    await commitTake({ take: TAKE, deps: h.deps });
    await flush();

    expect(h.stages).toContain("delete_recording_failed");
    expect(h.acks).toBe(1);
  });

  it("retries the ack exactly once, then lets the job age out on its own", async () => {
    let calls = 0;
    const h = harness({
      ack: async () => {
        calls += 1;
        throw new Error("offline");
      },
    });

    await commitTake({ take: TAKE, deps: h.deps });
    await flush();

    expect(calls).toBe(2);
    expect(h.stages).toContain("ack_failed");
  });

  it("stops retrying the moment the ack lands", async () => {
    let calls = 0;
    const h = harness({
      ack: async () => {
        calls += 1;
        if (calls === 1) throw new Error("offline");
      },
    });

    await commitTake({ take: TAKE, deps: h.deps });
    await flush();

    expect(calls).toBe(2);
    expect(h.stages).not.toContain("ack_failed");
  });
});

describe("the imported callback", () => {
  it("hands over the rows and the summary", async () => {
    const h = harness({}, [row({ id: "cx1" }), row({ id: "cx2" })]);

    await commitTake({ take: TAKE, deps: h.deps });

    expect(h.imported).toHaveLength(1);
    expect(h.imported[0].created).toHaveLength(2);
    expect(h.imported[0].summary).toEqual({
      created: 2,
      dropped: 0,
      blockedPremium: 0,
      total: 2,
      limit: 5,
    });
  });

  it("is optional", async () => {
    const h = harness({ onImported: undefined });

    await expect(commitTake({ take: TAKE, deps: h.deps })).resolves.toMatchObject({
      result: "imported",
    });
  });
});

describe("an overflow drain that blows up", () => {
  it("is reported and does not take the import down with it", async () => {
    const h = harness(
      {
        activeCount: () => 5,
        wait: async () => {
          throw new Error("timer gone");
        },
      },
      [row({ id: "cx1" })]
    );

    const outcome = await commitTake({ take: TAKE, deps: h.deps });
    await flush();

    expect(outcome).toMatchObject({ result: "imported", summary: { created: 0, dropped: 1 } });
    expect(h.stages).toContain("overflow_drain_failed");
  });
});

// ─── the upsert, on its own ─────────────────────────────────────────────────

describe("upsertByConvexId", () => {
  const draft = (title: string) =>
    ({ title, description: "", time: "09:00", frequency: "once", days: [] }) as any;

  it("appends what is new and updates what is already here", () => {
    const existing = [stored({ id: "l1", convexId: "cx1" }), stored({ id: "l2", convexId: "" })];
    let n = 0;

    const { rows, created } = upsertByConvexId(
      existing,
      [
        { convexId: "cx1", draft: draft("Renamed") },
        { convexId: "cx9", draft: draft("Brand new") },
      ],
      { newLocalId: () => `new-${++n}`, createdAt: () => "2026-09-01T00:00:00.000Z" }
    );

    expect(rows).toHaveLength(3);
    expect(rows[0]).toMatchObject({ id: "l1", title: "Renamed" });
    expect(rows[2]).toMatchObject({ id: "new-1", title: "Brand new", convexId: "cx9" });
    // Replayed rows come back too — scheduling and hydration are idempotent.
    expect(created.map((r) => r.title)).toEqual(["Renamed", "Brand new"]);
  });

  it("does not append the same take twice within one call", () => {
    let n = 0;
    const { rows } = upsertByConvexId(
      [],
      [
        { convexId: "cx1", draft: draft("First") },
        { convexId: "cx1", draft: draft("Second") },
      ],
      { newLocalId: () => `new-${++n}`, createdAt: () => "2026-09-01T00:00:00.000Z" }
    );

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ id: "new-1", title: "Second" });
  });
});

describe("mergeImportedRow", () => {
  const draft = {
    title: "Water",
    description: "",
    time: "20:00",
    frequency: "once",
    days: [],
    audioUrl: "https://fresh.m4a",
    audioStatus: "pending",
    wavUrl: "https://fresh.wav",
    preAudioUrl: "https://fresh-pre.m4a",
    audioExtrasStatus: "pending",
    scheduledFor: 999,
  } as any;

  it("keeps the local identity and everything hydration already won", () => {
    const merged = mergeImportedRow(
      stored({
        id: "l1",
        createdAt: "2026-01-01T00:00:00.000Z",
        audioUrl: "file:///local.mp3",
        audioStatus: "ready",
        wavUrl: "file:///local.wav",
        preAudioUrl: "file:///local_pre.mp3",
        audioExtrasStatus: "ready",
        scheduledFor: 111,
      }),
      draft,
      "cx1"
    );

    expect(merged).toMatchObject({
      id: "l1",
      createdAt: "2026-01-01T00:00:00.000Z",
      convexId: "cx1",
      title: "Water",
      audioUrl: "file:///local.mp3",
      audioStatus: "ready",
      wavUrl: "file:///local.wav",
      preAudioUrl: "file:///local_pre.mp3",
      audioExtrasStatus: "ready",
      scheduledFor: 111,
    });
  });

  it("takes the draft's audio when the local row has none yet", () => {
    const merged = mergeImportedRow(stored({ id: "l1", audioUrl: "" }), draft, "cx1");

    expect(merged).toMatchObject({
      audioUrl: "https://fresh.m4a",
      audioStatus: "pending",
      wavUrl: "https://fresh.wav",
      preAudioUrl: "https://fresh-pre.m4a",
      audioExtrasStatus: "pending",
      scheduledFor: 999,
    });
  });
});

// ─── the overflow queue ─────────────────────────────────────────────────────

describe("drainOverflowDeletion", () => {
  function queueDeps(over: Partial<CommitTakeDeps> = {}) {
    const deleted: string[] = [];
    const waits: number[] = [];
    const stages: string[] = [];
    const deps = {
      fetchRows: async () => null,
      deleteServerRow: async (id: string) => {
        deleted.push(id);
      },
      wait: async (ms: number) => {
        waits.push(ms);
      },
      onStage: (stage: string) => {
        stages.push(stage);
      },
      ...over,
    } as Pick<CommitTakeDeps, "fetchRows" | "deleteServerRow" | "wait" | "onStage">;
    return { deps, deleted, waits, stages };
  }

  it("deletes a row whose audio has already settled, immediately", async () => {
    const q = queueDeps();

    const result = await drainOverflowDeletion({
      rows: [row({ id: "a", audioStatus: "ready" }), row({ id: "b", audioStatus: "failed" })],
      deps: q.deps,
    });

    expect(result).toEqual({ deleted: ["a", "b"], abandoned: [] });
    expect(q.waits).toEqual([]);
  });

  it("waits for a row whose TTS is still running, then deletes it (C6)", async () => {
    let settled = false;
    const q = queueDeps({
      fetchRows: async () => {
        settled = true;
        return [row({ id: "a", audioStatus: settled ? "ready" : "pending" })];
      },
    });

    const result = await drainOverflowDeletion({
      rows: [row({ id: "a", audioStatus: "pending" })],
      deps: q.deps,
    });

    expect(result.deleted).toEqual(["a"]);
    expect(q.waits).toEqual([1000]);
  });

  it("backs off and eventually abandons a row that never settles", async () => {
    const q = queueDeps({ fetchRows: async () => [row({ id: "a", audioStatus: "pending" })] });

    const result = await drainOverflowDeletion({
      rows: [row({ id: "a", audioStatus: "pending" })],
      deps: q.deps,
    });

    expect(result).toEqual({ deleted: [], abandoned: ["a"] });
    expect(q.waits).toEqual([1000, 2000, 4000, 8000, 16000]);
  });

  it("counts a row that vanished as done", async () => {
    const q = queueDeps({ fetchRows: async () => [{ id: "a", deleted: true }] });

    const result = await drainOverflowDeletion({
      rows: [row({ id: "a", audioStatus: "pending" })],
      deps: q.deps,
    });

    expect(result).toEqual({ deleted: ["a"], abandoned: [] });
  });

  it("keeps waiting when the refresh answers with nothing about the row", async () => {
    const q = queueDeps({ fetchRows: async () => [row({ id: "someone-else" })] });

    const result = await drainOverflowDeletion({
      rows: [row({ id: "a", audioStatus: "pending" })],
      deps: q.deps,
    });

    expect(result.abandoned).toEqual(["a"]);
  });

  it("treats an unreadable refresh as no news and tries again", async () => {
    let calls = 0;
    const q = queueDeps({
      fetchRows: async () => {
        calls += 1;
        if (calls === 1) throw new Error("offline");
        return [row({ id: "a", audioStatus: "ready" })];
      },
    });

    const result = await drainOverflowDeletion({
      rows: [row({ id: "a", audioStatus: "pending" })],
      deps: q.deps,
    });

    expect(result.deleted).toEqual(["a"]);
    expect(q.waits).toEqual([1000, 2000]);
  });

  it("retries a delete that failed, and reports it", async () => {
    let attempts = 0;
    const q = queueDeps({
      fetchRows: async () => [row({ id: "a", audioStatus: "ready" })],
      deleteServerRow: async () => {
        attempts += 1;
        if (attempts === 1) throw new Error("network");
      },
    });

    const result = await drainOverflowDeletion({
      rows: [row({ id: "a", audioStatus: "ready" })],
      deps: q.deps,
    });

    expect(result.deleted).toEqual(["a"]);
    expect(attempts).toBe(2);
    expect(q.stages).toEqual(["overflow_delete_failed"]);
  });

  it("survives a failed delete with no stage reporter wired up", async () => {
    const q = queueDeps({
      onStage: undefined,
      fetchRows: async () => null,
      deleteServerRow: async () => {
        throw new Error("network");
      },
    });

    const result = await drainOverflowDeletion({
      rows: [row({ id: "a", audioStatus: "ready" })],
      deps: q.deps,
    });

    expect(result.abandoned).toEqual(["a"]);
  });
});
