/**
 * Reconciliation (spec §2.5) and the retry dispatch (§2.6).
 *
 * Two layers, tested separately on purpose. The dispatch table is a pure
 * function of (local phase, server status) and is asserted cell by cell,
 * because that table IS the contract — every stranded-take story in the spec
 * resolves to one of its cells. The executor is then driven through the cells
 * that do something interesting with the device: a crash mid-import, a job
 * garbage-collected out from under a take, a cancel that lost its race, and a
 * recording that is simply no longer on disk.
 */
import {
  __resetReconcile,
  cancelTake,
  configureReconcile,
  decideReconcileAction,
  decideRetryAction,
  discardTake,
  enqueueAllPendingTakes,
  enqueueReconcile,
  abandonOrphanBlob,
  reconcileIdle,
  retryTake,
  startForegroundReconcile,
  type ReconcileDeps,
  type ServerJobStatus,
} from "../../lib/takeReconcile";
import {
  __resetPendingTakes,
  getPendingTake,
  loadPendingTakes,
  putPendingTake,
  type PendingPhase,
  type PendingTake,
} from "../../lib/pendingTakes";
import type { WatchedJob } from "../../lib/creationJobWatch";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { AppState } from "react-native";

const take = (over: Partial<PendingTake> = {}): PendingTake => ({
  creationId: "t1",
  phase: "processing",
  recordingUri: "file:///docs/take_t1.m4a",
  localDate: "2026-09-01",
  localTime: "09:15:00",
  timezone: "Asia/Riyadh",
  createdAt: 1_000,
  attempts: 0,
  ...over,
});

const job = (over: Partial<WatchedJob> = {}): WatchedJob => ({
  status: "pending",
  generation: 1,
  updatedAt: 1,
  ...over,
});

// ─── §2.5, cell by cell ─────────────────────────────────────────────────────

describe("the reconciliation table", () => {
  const rows: Array<[PendingPhase[], Array<[ServerJobStatus | null, string]>]> = [
    [
      ["recording_saved", "uploading"],
      [
        [null, "resume_upload"],
        ["pending", "subscribe"],
        ["transcribed", "subscribe"],
        ["committed", "import"],
        ["failed", "fail_from_server"],
        ["cancelled", "remove_local"],
      ],
    ],
    [
      ["processing", "transcribed"],
      [
        [null, "rebegin"],
        ["pending", "subscribe"],
        ["transcribed", "subscribe"],
        ["committed", "import"],
        ["failed", "fail_from_server"],
        ["cancelled", "remove_local"],
      ],
    ],
    [
      ["committing"],
      [
        [null, "recover_committing"],
        ["pending", "invariant_violation"],
        ["transcribed", "invariant_violation"],
        ["committed", "import"],
        ["failed", "fail_from_server"],
        ["cancelled", "remove_local"],
      ],
    ],
    [
      ["failed"],
      [
        [null, "retry_dispatch"],
        ["pending", "subscribe"],
        ["transcribed", "subscribe"],
        ["committed", "import"],
        ["failed", "fail_from_server"],
        ["cancelled", "remove_local"],
      ],
    ],
    [
      ["cancelling"],
      [
        [null, "cancel_then_remove"],
        ["pending", "cancel_then_remove"],
        ["transcribed", "cancel_then_remove"],
        ["committed", "import"],
        ["failed", "discard_then_remove"],
        ["cancelled", "remove_local"],
      ],
    ],
  ];

  for (const [phases, cells] of rows) {
    for (const phase of phases) {
      for (const [status, expected] of cells) {
        it(`${phase} + ${status ?? "null"} → ${expected}`, () => {
          expect(decideReconcileAction(phase, status)).toBe(expected);
        });
      }
    }
  }
});

// ─── §2.6, the retry dispatch ───────────────────────────────────────────────

describe("the retry dispatch", () => {
  const decide = (over: Parameters<typeof decideRetryAction>[0]) => decideRetryAction(over);

  it("resumes from the upload when nothing ever reached the server", () => {
    expect(
      decide({ errorKind: "network", hasStorageId: false, hasRecording: true, server: null })
    ).toBe("resume_upload");
  });

  it("re-begins when the bytes are already up — begin is idempotent", () => {
    expect(
      decide({ errorKind: "network", hasStorageId: true, hasRecording: false, server: null })
    ).toBe("rebegin");
  });

  it("offers a re-record when there is neither a blob nor a file (D10)", () => {
    expect(
      decide({ errorKind: "network", hasStorageId: false, hasRecording: false, server: null })
    ).toBe("record_again");
  });

  it("re-uploads for a blob the server lost, and gives up if the file went too", () => {
    expect(
      decide({
        errorKind: "server",
        hasStorageId: true,
        hasRecording: true,
        server: "failed",
        serverErrorCode: "storage_missing",
      })
    ).toBe("reupload_then_retry");
    expect(
      decide({
        errorKind: "server",
        hasStorageId: true,
        hasRecording: false,
        server: "failed",
        serverErrorCode: "storage_missing",
      })
    ).toBe("record_again");
  });

  it("reuses the blob for every other server failure", () => {
    expect(
      decide({
        errorKind: "unparseable",
        hasStorageId: true,
        hasRecording: true,
        server: "failed",
        serverErrorCode: "unparseable",
      })
    ).toBe("server_retry");
  });

  it("never spends a server retry on an unresolved entitlement (C13)", () => {
    expect(
      decide({
        errorKind: "cap_unverified",
        hasStorageId: true,
        hasRecording: true,
        server: "committed",
      })
    ).toBe("import");
    expect(
      decide({ errorKind: "cap_unverified", hasStorageId: true, hasRecording: true, server: null })
    ).toBe("import");
    expect(
      decide({
        errorKind: "cap_unverified",
        hasStorageId: true,
        hasRecording: true,
        server: "failed",
        serverErrorCode: "internal",
      })
    ).toBe("import");
    expect(
      decide({
        errorKind: "cap_unverified",
        hasStorageId: true,
        hasRecording: true,
        server: "cancelled",
      })
    ).toBe("remove_local");
  });

  it("follows the server when it has moved on", () => {
    expect(decide({ hasStorageId: true, hasRecording: true, server: "committed" })).toBe("import");
    expect(decide({ hasStorageId: true, hasRecording: true, server: "pending" })).toBe("subscribe");
    expect(decide({ hasStorageId: true, hasRecording: true, server: "transcribed" })).toBe(
      "subscribe"
    );
    expect(decide({ hasStorageId: true, hasRecording: true, server: "cancelled" })).toBe(
      "remove_local"
    );
  });

  it("has nothing to retry for a non-network failure whose job is gone (GC boundary)", () => {
    expect(
      decide({ errorKind: "unparseable", hasStorageId: true, hasRecording: true, server: null })
    ).toBe("record_again");
    expect(
      decide({ errorKind: "server", hasStorageId: true, hasRecording: true, server: null })
    ).toBe("record_again");
    expect(decide({ hasStorageId: false, hasRecording: true, server: null })).toBe("record_again");
  });
});

// ─── the executor ───────────────────────────────────────────────────────────

type Harness = {
  deps: ReconcileDeps;
  jobs: Map<string, WatchedJob | null>;
  storeIds: string[];
  calls: {
    barrier: number;
    begin: any[];
    cancel: any[];
    retry: any[];
    discard: any[];
    uploads: string[];
    imports: string[];
    subscribes: string[];
    recordingsDeleted: string[];
    recordAgain: string[];
    stages: string[];
  };
};

function setup(over: Partial<ReconcileDeps> = {}): Harness {
  const jobs = new Map<string, WatchedJob | null>();
  const storeIds: string[] = [];
  const calls: Harness["calls"] = {
    barrier: 0,
    begin: [],
    cancel: [],
    retry: [],
    discard: [],
    uploads: [],
    imports: [],
    subscribes: [],
    recordingsDeleted: [],
    recordAgain: [],
    stages: [],
  };

  const deps: ReconcileDeps = {
    getDeviceId: async () => "device-1",
    fetchJob: async (_deviceId, creationId) => jobs.get(creationId) ?? null,
    begin: async (args) => {
      calls.begin.push(args);
      return { status: "pending" as const };
    },
    cancel: async (args) => {
      calls.cancel.push(args);
      return { status: "cancelled" };
    },
    serverRetry: async (args) => {
      calls.retry.push(args);
      return { status: "pending" };
    },
    discard: async (args) => {
      calls.discard.push(args);
      return { status: "discarded" };
    },
    uploadRecording: async (t) => {
      calls.uploads.push(t.creationId);
      return "st-new";
    },
    recordingExists: async () => true,
    importTake: async (t) => {
      calls.imports.push(t.creationId);
      return {
        result: "imported" as const,
        rows: [],
        summary: { created: 0, dropped: 0, blockedPremium: 0, total: 0, limit: 5 },
      };
    },
    subscribe: (t) => {
      calls.subscribes.push(t.creationId);
    },
    deleteRecording: async (t) => {
      calls.recordingsDeleted.push(t.creationId);
    },
    storeHasCreationId: (creationId) => storeIds.includes(creationId),
    loadBarrier: async () => {
      calls.barrier += 1;
    },
    onRecordAgain: (t) => {
      calls.recordAgain.push(t.creationId);
    },
    onStage: (_creationId, stage) => {
      calls.stages.push(stage);
    },
    ...over,
  };

  configureReconcile(deps);
  return { deps, jobs, storeIds, calls };
}

async function seed(t: PendingTake): Promise<void> {
  await loadPendingTakes();
  await putPendingTake(t);
}

beforeEach(() => {
  (AsyncStorage as any)._reset();
  __resetPendingTakes();
  __resetReconcile();
});

describe("the queue", () => {
  it("waits for the outbox, the reminders and the history before dispatching (C10)", async () => {
    const order: string[] = [];
    const h = setup({
      loadBarrier: async () => {
        order.push("barrier");
      },
      fetchJob: async () => {
        order.push("fetch");
        return null;
      },
    });
    await seed(take({ phase: "processing" }));

    enqueueReconcile("t1");
    await reconcileIdle();

    expect(order[0]).toBe("barrier");
    expect(h.calls.begin).toHaveLength(0); // no storage id — see below
  });

  it("loads the barrier once across many passes", async () => {
    const h = setup();
    await seed(take({ creationId: "a", phase: "cancelling" }));
    await seed(take({ creationId: "b", phase: "cancelling" }));

    enqueueReconcile("a");
    enqueueReconcile("b");
    await reconcileIdle();

    expect(h.calls.barrier).toBe(1);
  });

  it("is single-flight per take: a second request runs after the first, not beside it", async () => {
    let active = 0;
    let maxActive = 0;
    const h = setup({
      fetchJob: async () => {
        active += 1;
        maxActive = Math.max(maxActive, active);
        await new Promise<void>((resolve) => setTimeout(resolve, 0));
        active -= 1;
        return null;
      },
    });
    await seed(take({ creationId: "t1", phase: "cancelling" }));

    enqueueReconcile("t1");
    enqueueReconcile("t1");
    enqueueReconcile("t1");
    await reconcileIdle();

    expect(maxActive).toBe(1);
    // The duplicate requests collapse into exactly one re-run.
    expect(h.calls.cancel.length).toBeGreaterThanOrEqual(1);
  });

  it("sweeps everything the outbox is holding", async () => {
    const h = setup();
    await seed(take({ creationId: "a", phase: "cancelling" }));
    await seed(take({ creationId: "b", phase: "cancelling" }));

    enqueueAllPendingTakes();
    await reconcileIdle();

    expect(h.calls.cancel.map((c) => c.creationId).sort()).toEqual(["a", "b"]);
  });

  it("ignores a take that is no longer in the outbox", async () => {
    const h = setup();
    await loadPendingTakes();

    enqueueReconcile("ghost");
    await reconcileIdle();

    expect(h.calls.barrier).toBe(1);
    expect(h.calls.cancel).toHaveLength(0);
  });

  it("reports a pass that blew up instead of losing the queue", async () => {
    const h = setup({
      fetchJob: async () => {
        throw new Error("offline");
      },
    });
    await seed(take());

    enqueueReconcile("t1");
    await reconcileIdle();

    expect(h.calls.stages).toContain("reconcile_error");
  });
});

describe("a take whose job committed", () => {
  it("is imported", async () => {
    const h = setup();
    h.jobs.set("t1", job({ status: "committed" }));
    await seed(take({ phase: "processing" }));

    enqueueReconcile("t1");
    await reconcileIdle();

    expect(h.calls.imports).toEqual(["t1"]);
  });

  it("re-subscribes rather than failing when the rows are not readable yet", async () => {
    const h = setup({
      importTake: async () => ({ result: "unavailable" as const }),
    });
    h.jobs.set("t1", job({ status: "committed" }));
    await seed(take({ phase: "processing" }));

    enqueueReconcile("t1");
    await reconcileIdle();

    expect(h.calls.subscribes).toEqual(["t1"]);
    expect(getPendingTake("t1")?.phase).toBe("processing");
  });
});

describe("a take stuck at `committing` whose job has vanished (D4)", () => {
  it("finishes the cleanup when the store proves the import landed", async () => {
    const h = setup();
    h.storeIds.push("t1");
    await seed(take({ phase: "committing" }));

    enqueueReconcile("t1");
    await reconcileIdle();

    expect(getPendingTake("t1")).toBeUndefined();
    expect(h.calls.recordingsDeleted).toEqual(["t1"]);
    expect(h.calls.stages).toContain("committing_recovered");
  });

  it("fails the card when no stamped row is there — the import never persisted", async () => {
    setup();
    await seed(take({ phase: "committing" }));

    enqueueReconcile("t1");
    await reconcileIdle();

    expect(getPendingTake("t1")).toMatchObject({ phase: "failed", errorKind: "server" });
  });

  it("refuses to believe a status that went backwards", async () => {
    const h = setup();
    h.jobs.set("t1", job({ status: "pending" }));
    await seed(take({ phase: "committing" }));

    enqueueReconcile("t1");
    await reconcileIdle();

    expect(getPendingTake("t1")).toMatchObject({ phase: "failed", errorKind: "server" });
    expect(h.calls.imports).toEqual([]);
  });
});

describe("a take whose job failed", () => {
  it("takes the server's reason and shows it on the card", async () => {
    const h = setup();
    h.jobs.set("t1", job({ status: "failed", errorCode: "unparseable" }));
    await seed(take({ phase: "processing" }));

    enqueueReconcile("t1");
    await reconcileIdle();

    expect(getPendingTake("t1")).toMatchObject({
      phase: "failed",
      errorKind: "unparseable",
      serverErrorCode: "unparseable",
    });
  });
});

describe("a take whose job was cancelled", () => {
  it("is forgotten, recording and all", async () => {
    const h = setup();
    h.jobs.set("t1", job({ status: "cancelled" }));
    await seed(take({ phase: "processing" }));

    enqueueReconcile("t1");
    await reconcileIdle();

    expect(getPendingTake("t1")).toBeUndefined();
    expect(h.calls.recordingsDeleted).toEqual(["t1"]);
  });
});

describe("resuming an upload", () => {
  it("uploads, begins and subscribes", async () => {
    const h = setup();
    await seed(take({ phase: "recording_saved" }));

    enqueueReconcile("t1");
    await reconcileIdle();

    expect(h.calls.uploads).toEqual(["t1"]);
    expect(h.calls.begin[0]).toMatchObject({
      creationId: "t1",
      audioStorageId: "st-new",
      localDate: "2026-09-01",
      timezone: "Asia/Riyadh",
    });
    expect(h.calls.subscribes).toEqual(["t1"]);
    expect(getPendingTake("t1")).toMatchObject({ phase: "processing", audioStorageId: "st-new" });
  });

  it("skips the upload entirely once the bytes are already on the server (D10)", async () => {
    const h = setup();
    await seed(take({ phase: "uploading", audioStorageId: "st-old", fragileUri: true }));

    enqueueReconcile("t1");
    await reconcileIdle();

    expect(h.calls.uploads).toEqual([]);
    expect(h.calls.begin[0]).toMatchObject({ audioStorageId: "st-old" });
  });

  it("offers a re-record when the recording is simply gone", async () => {
    const h = setup({ uploadRecording: async () => null });
    await seed(take({ phase: "recording_saved", fragileUri: true }));

    enqueueReconcile("t1");
    await reconcileIdle();

    expect(getPendingTake("t1")).toMatchObject({ phase: "failed", errorKind: "server" });
    expect(h.calls.begin).toEqual([]);
  });

  it("hands the blob over as an orphan when the take was cancelled mid-upload (C4)", async () => {
    const h = setup({
      uploadRecording: async (t) => {
        // The user hits the X while the bytes are in flight.
        await cancelTake(t.creationId);
        return "st-orphan";
      },
    });
    await seed(take({ phase: "recording_saved" }));

    enqueueReconcile("t1");
    await reconcileIdle();

    expect(h.calls.begin).toEqual([]);
    expect(h.calls.cancel.some((c) => c.orphanStorageId === "st-orphan")).toBe(true);
  });
});

describe("a cancel", () => {
  it("stops the job and forgets the take", async () => {
    const h = setup();
    h.jobs.set("t1", job({ status: "pending" }));
    await seed(take({ phase: "processing", audioStorageId: "st1" }));

    await cancelTake("t1");
    await reconcileIdle();

    expect(h.calls.cancel[0]).toMatchObject({ creationId: "t1", orphanStorageId: "st1" });
    expect(getPendingTake("t1")).toBeUndefined();
    expect(h.calls.recordingsDeleted).toEqual(["t1"]);
  });

  it("that lost the race imports the take it tried to abandon", async () => {
    const h = setup({ cancel: async () => ({ status: "committed" }) });
    h.jobs.set("t1", job({ status: "pending" }));
    await seed(take({ phase: "processing" }));

    await cancelTake("t1");
    await reconcileIdle();

    expect(h.calls.imports).toEqual(["t1"]);
  });

  it("over a failed job is a discard", async () => {
    const h = setup();
    h.jobs.set("t1", job({ status: "failed", errorCode: "internal" }));
    await seed(take({ phase: "failed", errorKind: "server" }));

    await cancelTake("t1");
    await reconcileIdle();

    expect(h.calls.discard).toHaveLength(1);
    expect(getPendingTake("t1")).toBeUndefined();
  });

  it("does nothing for a take that is already gone", async () => {
    const h = setup();
    await loadPendingTakes();

    await cancelTake("ghost");

    expect(h.calls.cancel).toEqual([]);
  });
});

describe("a discard", () => {
  it("tells the server, then drops the take and its recording", async () => {
    const h = setup();
    await seed(take({ phase: "failed", errorKind: "unparseable" }));

    await discardTake("t1");

    expect(h.calls.discard[0]).toMatchObject({ creationId: "t1" });
    expect(getPendingTake("t1")).toBeUndefined();
    expect(h.calls.recordingsDeleted).toEqual(["t1"]);
  });

  it("drops the take locally even when the server refuses", async () => {
    const h = setup({
      discard: async () => {
        throw new Error("offline");
      },
    });
    await seed(take({ phase: "failed", errorKind: "server" }));

    await discardTake("t1");

    expect(getPendingTake("t1")).toBeUndefined();
    expect(h.calls.recordingsDeleted).toEqual(["t1"]);
  });

  it("does nothing for a take that is already gone", async () => {
    const h = setup();
    await loadPendingTakes();
    await discardTake("ghost");
    expect(h.calls.discard).toEqual([]);
  });
});

describe("tapping a failed card", () => {
  it("re-begins a network failure whose bytes already landed", async () => {
    const h = setup();
    await seed(take({ phase: "failed", errorKind: "network", audioStorageId: "st1" }));

    await retryTake("t1");

    expect(h.calls.begin[0]).toMatchObject({ audioStorageId: "st1" });
    expect(h.calls.subscribes).toEqual(["t1"]);
  });

  it("resumes the upload for a network failure that never got that far", async () => {
    const h = setup();
    await seed(take({ phase: "failed", errorKind: "network" }));

    await retryTake("t1");

    expect(h.calls.uploads).toEqual(["t1"]);
    expect(h.calls.begin).toHaveLength(1);
  });

  it("re-uploads and swaps the blob when the server lost it", async () => {
    const h = setup();
    h.jobs.set("t1", job({ status: "failed", errorCode: "storage_missing" }));
    await seed(take({ phase: "failed", errorKind: "server", audioStorageId: "st-old" }));

    await retryTake("t1");

    expect(h.calls.uploads).toEqual(["t1"]);
    expect(h.calls.retry[0]).toMatchObject({ creationId: "t1", newStorageId: "st-new" });
    expect(getPendingTake("t1")?.phase).toBe("processing");
  });

  it("offers a re-record when the storage_missing retry has no file to send", async () => {
    const h = setup({ recordingExists: async () => false, uploadRecording: async () => null });
    h.jobs.set("t1", job({ status: "failed", errorCode: "storage_missing" }));
    await seed(take({ phase: "failed", errorKind: "server", fragileUri: true }));

    await retryTake("t1");

    expect(h.calls.retry).toEqual([]);
    expect(h.calls.recordAgain).toEqual(["t1"]);
    // The re-record is a fresh creationId, so the dead take goes with the
    // offer rather than sitting on the list beside the new one (§2.6).
    expect(getPendingTake("t1")).toBeUndefined();
    expect(h.calls.discard[0]).toMatchObject({ creationId: "t1" });
    expect(h.calls.recordingsDeleted).toEqual(["t1"]);
  });

  it("reuses the blob for a parse failure and counts the attempt", async () => {
    const h = setup();
    h.jobs.set("t1", job({ status: "failed", errorCode: "unparseable" }));
    await seed(take({ phase: "failed", errorKind: "unparseable", audioStorageId: "st1", attempts: 1 }));

    await retryTake("t1");

    expect(h.calls.retry[0]).toEqual({ deviceId: "device-1", creationId: "t1" });
    expect(getPendingTake("t1")).toMatchObject({ phase: "processing", attempts: 2 });
    expect(h.calls.subscribes).toEqual(["t1"]);
  });

  it("offers a re-record once the server's attempt cap is reached", async () => {
    const h = setup({
      serverRetry: async () => ({ status: "failed", capReached: true }),
    });
    h.jobs.set("t1", job({ status: "failed", errorCode: "internal" }));
    await seed(take({ phase: "failed", errorKind: "server", audioStorageId: "st1" }));

    await retryTake("t1");

    expect(h.calls.recordAgain).toEqual(["t1"]);
    expect(getPendingTake("t1")).toBeUndefined();
    expect(h.calls.discard[0]).toMatchObject({ creationId: "t1" });
  });

  it("still opens the recorder when the discard of the dead take fails", async () => {
    const h = setup({
      discard: async () => {
        throw new Error("offline");
      },
    });
    await seed(take({ phase: "failed", errorKind: "unparseable" }));

    await retryTake("t1");

    expect(h.calls.recordAgain).toEqual(["t1"]);
    expect(getPendingTake("t1")).toBeUndefined();
  });

  it("re-enters the import for an unresolved entitlement, never a server retry", async () => {
    const h = setup();
    h.jobs.set("t1", job({ status: "committed" }));
    await seed(take({ phase: "failed", errorKind: "cap_unverified", audioStorageId: "st1" }));

    await retryTake("t1");

    expect(h.calls.imports).toEqual(["t1"]);
    expect(h.calls.retry).toEqual([]);
  });

  it("gives up honestly when the job was collected and the failure was not a network one", async () => {
    const h = setup();
    await seed(take({ phase: "failed", errorKind: "unparseable" }));

    await retryTake("t1");

    expect(h.calls.recordAgain).toEqual(["t1"]);
    expect(getPendingTake("t1")).toBeUndefined();
  });

  it("keeps the entitlement copy when the committed job it was blocked on is gone", async () => {
    // The job was GC'd, so `getReminders` has nothing to answer with. That is
    // not a generic fault: the card still says "can't verify your
    // subscription", which is still exactly what happened, and the next tap
    // still re-checks the entitlement rather than a server retry.
    const h = setup({
      importTake: async (t) => {
        h.calls.imports.push(t.creationId);
        return { result: "unavailable" as const };
      },
    });
    await seed(take({ phase: "failed", errorKind: "cap_unverified", audioStorageId: "st1" }));

    await retryTake("t1");

    expect(h.calls.imports).toEqual(["t1"]);
    expect(h.calls.retry).toEqual([]);
    expect(getPendingTake("t1")).toMatchObject({
      phase: "failed",
      errorKind: "cap_unverified",
    });
  });

  it("does not ambush the user with the recorder during a background pass", async () => {
    const h = setup();
    await seed(take({ phase: "failed", errorKind: "unparseable" }));

    enqueueReconcile("t1");
    await reconcileIdle();

    expect(h.calls.recordAgain).toEqual([]);
    expect(getPendingTake("t1")).toMatchObject({ phase: "failed", errorKind: "server" });
  });

  it("reports a retry that blew up rather than throwing at the card", async () => {
    const h = setup({
      fetchJob: async () => {
        throw new Error("offline");
      },
    });
    await seed(take({ phase: "failed", errorKind: "network" }));

    await retryTake("t1");

    expect(h.calls.stages).toContain("retry_error");
  });

  it("does nothing for a take that is already gone", async () => {
    const h = setup();
    await loadPendingTakes();
    await retryTake("ghost");
    expect(h.calls.begin).toEqual([]);
  });
});

describe("an orphaned blob", () => {
  it("is offered to the server three times before it is left to the sweep", async () => {
    let attempts = 0;
    const h = setup({
      cancel: async () => {
        attempts += 1;
        throw new Error("offline");
      },
    });

    await abandonOrphanBlob("t1", "st-orphan");

    expect(attempts).toBe(3);
    expect(h.calls.stages.filter((s) => s === "orphan_cancel_failed")).toHaveLength(3);
  });

  it("stops at the first success", async () => {
    const h = setup();

    await abandonOrphanBlob("t1", "st-orphan");

    expect(h.calls.cancel).toHaveLength(1);
    expect(h.calls.cancel[0]).toMatchObject({ orphanStorageId: "st-orphan" });
  });

  it("is a no-op before the screen has wired the pipeline up", async () => {
    __resetReconcile();
    await expect(abandonOrphanBlob("t1", "st-orphan")).resolves.toBeUndefined();
  });
});

describe("the foreground listener", () => {
  it("drains the outbox on every return to the app, on both platforms", async () => {
    const listeners: Array<(state: string) => void> = [];
    const remove = jest.fn();
    const spy = jest
      .spyOn(AppState, "addEventListener")
      .mockImplementation((_event: any, handler: any) => {
        listeners.push(handler);
        return { remove } as any;
      });

    const h = setup();
    await seed(take({ creationId: "a", phase: "cancelling" }));

    const stop = startForegroundReconcile();
    listeners[0]("background");
    listeners[0]("active");
    await reconcileIdle();

    expect(h.calls.cancel.map((c) => c.creationId)).toEqual(["a"]);

    stop();
    expect(remove).toHaveBeenCalled();
    spy.mockRestore();
  });
});
