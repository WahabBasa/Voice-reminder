/**
 * The pending card's subscription (spec §2.7).
 *
 * A fake Convex client goes in, and what the take does with it comes out: when
 * the reconciler is dispatched, when the subscription is dropped, and — the one
 * genuinely counter-intuitive rule — when NOTHING is done at all.
 *
 * `localQueryResult()` answers three ways. `undefined` is "not loaded yet" and
 * is indistinguishable from a missing job, so acting on it would tear down a
 * take that is merely young (D-watch). Only a loaded `null` is missing.
 *
 * The other rule this pins is the committed retention window: the import is
 * dispatched immediately, but the watch is HELD until the worker's later perf
 * patch lands (or a 10s timeout), because that patch is the only place the
 * server's own timings ever appear (C5/N2).
 */
import {
  TELEMETRY_TIMEOUT_MS,
  WATCHDOG_MS,
  watchCreationJob,
  type WatchedJob,
} from "../../lib/creationJobWatch";

type Result = WatchedJob | null | undefined;

class FakeWatch {
  listeners = new Set<() => void>();
  disposed = false;

  constructor(private convex: FakeConvex) {}

  localQueryResult(): Result {
    if (this.convex.throwsLeft > 0) {
      this.convex.throwsLeft -= 1;
      throw new Error("query exploded");
    }
    return this.convex.value;
  }

  onUpdate = (cb: () => void): (() => void) => {
    this.listeners.add(cb);
    return () => {
      this.disposed = true;
      if (this.convex.unsubscribeThrows) throw new Error("unsubscribe exploded");
      this.listeners.delete(cb);
    };
  };
}

class FakeConvex {
  value: Result = undefined;
  throwsLeft = 0;
  unsubscribeThrows = false;
  watches: FakeWatch[] = [];

  watchQuery = jest.fn((_query: unknown, _args: unknown) => {
    const watch = new FakeWatch(this);
    this.watches.push(watch);
    return watch;
  });

  get live(): FakeWatch[] {
    return this.watches.filter((w) => !w.disposed);
  }

  push(value: Result): void {
    this.value = value;
    for (const watch of this.live) {
      for (const cb of [...watch.listeners]) cb();
    }
  }
}

const flush = async (ticks = 20): Promise<void> => {
  for (let i = 0; i < ticks; i++) await Promise.resolve();
};

const job = (over: Partial<WatchedJob> = {}): WatchedJob => ({
  status: "pending",
  generation: 1,
  updatedAt: 1,
  ...over,
});

function start(convex: FakeConvex) {
  const updates: Array<WatchedJob | null> = [];
  const failures: string[] = [];
  const perfs: any[] = [];
  const handle = watchCreationJob({
    convexClient: convex as any,
    deviceId: "device-1",
    creationId: "take-1",
    onUpdate: async (next) => {
      updates.push(next);
    },
    onLocalFailure: async (kind) => {
      failures.push(kind);
    },
    onServerPerf: (perf) => perfs.push(perf),
  });
  return { handle, updates, failures, perfs };
}

beforeEach(() => {
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
});

// ─── undefined vs null ──────────────────────────────────────────────────────

describe("an unloaded query", () => {
  it("is not treated as a missing job: it waits and dispatches nothing", async () => {
    const convex = new FakeConvex();
    const { updates, failures } = start(convex);
    await flush();

    expect(convex.watchQuery).toHaveBeenCalledWith(expect.anything(), {
      deviceId: "device-1",
      creationId: "take-1",
    });
    expect(updates).toEqual([]);
    expect(convex.live).toHaveLength(1);

    convex.push(undefined);
    await flush();
    expect(updates).toEqual([]);
    expect(failures).toEqual([]);
    expect(convex.live).toHaveLength(1);
  });
});

describe("a loaded null", () => {
  it("dispatches the missing branch exactly once, then lets go", async () => {
    const convex = new FakeConvex();
    const { handle, updates } = start(convex);
    await flush();

    convex.push(null);
    await handle.done;

    expect(updates).toEqual([null]);
    expect(convex.live).toHaveLength(0);
  });
});

// ─── the working statuses ───────────────────────────────────────────────────

describe("a job still working", () => {
  it("reports each update and keeps watching", async () => {
    const convex = new FakeConvex();
    const { updates } = start(convex);
    await flush();

    convex.push(job({ status: "pending" }));
    await flush();
    convex.push(job({ status: "transcribed", transcript: "call mom at six" }));
    await flush();

    expect(updates.map((u) => u?.status)).toEqual(["pending", "transcribed"]);
    expect(convex.live).toHaveLength(1);
  });
});

// ─── terminals ──────────────────────────────────────────────────────────────

describe("a failed or cancelled job", () => {
  it("is dispatched and disposed immediately", async () => {
    for (const status of ["failed", "cancelled"] as const) {
      const convex = new FakeConvex();
      const { handle, updates } = start(convex);
      await flush();

      convex.push(job({ status, errorCode: "internal" }));
      await handle.done;

      expect(updates.map((u) => u?.status)).toEqual([status]);
      expect(convex.live).toHaveLength(0);
    }
  });
});

describe("a committed job", () => {
  it("dispatches the import at once but HOLDS the watch for the timings", async () => {
    const convex = new FakeConvex();
    const { handle, updates, perfs } = start(convex);
    await flush();

    convex.push(job({ status: "committed", reminderIds: ["r1"] }));
    await flush();

    // Import dispatched, subscription retained.
    expect(updates.map((u) => u?.status)).toEqual(["committed"]);
    expect(perfs).toEqual([]);
    expect(convex.live).toHaveLength(1);

    // The worker's later perfPatch lands.
    convex.push(
      job({
        status: "committed",
        perf: { whisperMs: 900, commitMs: 40, totalMs: 2400 },
      })
    );
    await handle.done;

    expect(perfs).toEqual([{ whisperMs: 900, commitMs: 40, totalMs: 2400 }]);
    // The import is not dispatched a second time by the telemetry push.
    expect(updates).toHaveLength(1);
    expect(convex.live).toHaveLength(0);
  });

  it("gives up on the timings after 10s and logs whatever it has", async () => {
    const convex = new FakeConvex();
    const { handle, perfs } = start(convex);
    await flush();

    convex.push(job({ status: "committed", perf: { whisperMs: 900 } }));
    await flush();
    expect(convex.live).toHaveLength(1);

    await jest.advanceTimersByTimeAsync(TELEMETRY_TIMEOUT_MS + 10);
    await handle.done;

    expect(perfs).toEqual([{ whisperMs: 900 }]);
    expect(convex.live).toHaveLength(0);
  });

  it("lets go straight away when the timings are already complete", async () => {
    const convex = new FakeConvex();
    const { handle, updates, perfs } = start(convex);
    await flush();

    convex.push(job({ status: "committed", perf: { commitMs: 40, totalMs: 2400 } }));
    await handle.done;

    expect(updates).toHaveLength(1);
    expect(perfs).toEqual([{ commitMs: 40, totalMs: 2400 }]);
  });

  it("reports empty timings when the document cannot be re-read at the timeout", async () => {
    const convex = new FakeConvex();
    const { handle, perfs } = start(convex);
    await flush();

    convex.push(job({ status: "committed" }));
    await flush();

    // The query starts throwing after the commit was already observed.
    convex.throwsLeft = 99;
    await jest.advanceTimersByTimeAsync(TELEMETRY_TIMEOUT_MS + 10);
    await handle.done;

    expect(perfs).toEqual([{}]);
  });
});

// ─── serialization ──────────────────────────────────────────────────────────

describe("two updates arriving on top of each other", () => {
  it("runs the handlers one at a time, in order", async () => {
    const convex = new FakeConvex();
    const order: string[] = [];
    let release: () => void = () => {};

    const handle = watchCreationJob({
      convexClient: convex as any,
      deviceId: "device-1",
      creationId: "take-1",
      onUpdate: async (next) => {
        order.push(`start:${next?.status}`);
        if (next?.status === "transcribed") {
          await new Promise<void>((resolve) => {
            release = resolve;
          });
        }
        order.push(`end:${next?.status}`);
      },
      onLocalFailure: () => {},
    });
    await flush();

    convex.push(job({ status: "transcribed" }));
    await flush();
    expect(order).toEqual(["start:transcribed"]);

    // The commit lands while the transcript handler is still running.
    convex.push(job({ status: "committed", perf: { commitMs: 1, totalMs: 2 } }));
    await flush();
    expect(order).toEqual(["start:transcribed"]);

    release();
    await handle.done;

    expect(order).toEqual([
      "start:transcribed",
      "end:transcribed",
      "start:committed",
      "end:committed",
    ]);
  });
});

// ─── failures ───────────────────────────────────────────────────────────────

describe("a query that throws", () => {
  it("fails the take locally as a server problem and disposes", async () => {
    const convex = new FakeConvex();
    convex.throwsLeft = 99;

    const { handle, updates, failures } = start(convex);
    await handle.done;

    expect(failures).toEqual(["server"]);
    expect(updates).toEqual([]);
    expect(convex.live).toHaveLength(0);
  });
});

describe("the 90s watchdog", () => {
  it("fails the take as a network problem and leaves the job to reconciliation", async () => {
    const convex = new FakeConvex();
    const { handle, failures, updates } = start(convex);
    await flush();

    await jest.advanceTimersByTimeAsync(WATCHDOG_MS - 1_000);
    expect(failures).toEqual([]);
    expect(convex.live).toHaveLength(1);

    await jest.advanceTimersByTimeAsync(2_000);
    await handle.done;

    expect(failures).toEqual(["network"]);
    expect(updates).toEqual([]);
    expect(convex.live).toHaveLength(0);
  });

  it("stops once a commit has been observed — a retained watch is not a stuck one", async () => {
    const convex = new FakeConvex();
    const { failures } = start(convex);
    await flush();

    convex.push(job({ status: "committed" }));
    await flush();

    await jest.advanceTimersByTimeAsync(WATCHDOG_MS + 1_000);
    expect(failures).toEqual([]);
  });
});

// ─── disposal ───────────────────────────────────────────────────────────────

describe("dispose", () => {
  it("drops the subscription and is safe to call twice", async () => {
    const convex = new FakeConvex();
    const { handle, updates } = start(convex);
    await flush();

    handle.dispose();
    handle.dispose();
    await handle.done;

    expect(convex.live).toHaveLength(0);

    // Nothing that arrives afterwards is acted on.
    convex.push(job({ status: "committed" }));
    await flush();
    expect(updates).toEqual([]);
  });

  it("survives an unsubscribe that throws", async () => {
    const convex = new FakeConvex();
    convex.unsubscribeThrows = true;
    const { handle } = start(convex);
    await flush();

    handle.dispose();
    await expect(handle.done).resolves.toBeUndefined();
  });
});
