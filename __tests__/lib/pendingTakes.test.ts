/**
 * The PendingTake outbox (spec §2.1).
 *
 * Two things are under test and they are deliberately separable: the state
 * machine (which phases may follow which, and what a hop clears) and the
 * persisted list (which must never let memory and disk disagree).
 *
 * The per-hop failure rules live here too, because they are the difference
 * between a take that can be rescued after a crash and one that cannot.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  NON_TERMINAL_PHASES,
  PENDING_TAKES_STORAGE_KEY,
  __resetPendingTakes,
  canTransition,
  errorKindForServerCode,
  getPendingTake,
  getPendingTakesSnapshot,
  hasLoadedPendingTakes,
  isTerminalPhase,
  loadPendingTakes,
  missingRecordingOutcome,
  newPendingTake,
  putPendingTake,
  removePendingTake,
  resolveRecordingLocation,
  subscribePendingTakes,
  transitionTake,
  updatePendingTake,
  type PendingTake,
} from "../../lib/pendingTakes";

const take = (over: Partial<PendingTake> = {}): PendingTake => ({
  creationId: "c1",
  phase: "recording_saved",
  recordingUri: "file:///docs/take_c1.m4a",
  localDate: "2026-09-01",
  localTime: "09:15:00",
  timezone: "Asia/Riyadh",
  createdAt: 1_000,
  attempts: 0,
  ...over,
});

beforeEach(() => {
  (AsyncStorage as any)._reset();
  __resetPendingTakes();
});

// ─── the machine ────────────────────────────────────────────────────────────

describe("newPendingTake", () => {
  it("starts at recording_saved with no attempts spent", () => {
    const created = newPendingTake({
      creationId: "c9",
      recordingUri: "file:///a.m4a",
      localDate: "2026-09-01",
      localTime: "09:15:00",
      timezone: "UTC",
      createdAt: 42,
    });

    expect(created).toEqual({
      creationId: "c9",
      phase: "recording_saved",
      recordingUri: "file:///a.m4a",
      localDate: "2026-09-01",
      localTime: "09:15:00",
      timezone: "UTC",
      createdAt: 42,
      attempts: 0,
    });
    // Absent, not false: a solid URI carries no flag at all.
    expect(created).not.toHaveProperty("fragileUri");
  });

  it("carries the fragile flag when the copy failed", () => {
    const created = newPendingTake({
      creationId: "c9",
      recordingUri: "file:///cache/a.m4a",
      fragileUri: true,
      localDate: "2026-09-01",
      localTime: "09:15:00",
      timezone: "UTC",
      createdAt: 42,
    });

    expect(created.fragileUri).toBe(true);
  });
});

describe("canTransition", () => {
  it("always allows a re-entrant hop", () => {
    expect(canTransition("uploading", "uploading")).toBe(true);
    expect(canTransition("failed", "failed")).toBe(true);
  });

  it("follows the pipeline forwards", () => {
    expect(canTransition("recording_saved", "uploading")).toBe(true);
    expect(canTransition("uploading", "processing")).toBe(true);
    expect(canTransition("processing", "transcribed")).toBe(true);
    expect(canTransition("transcribed", "committing")).toBe(true);
  });

  it("lets a failed take re-enter, and a lost cancel import", () => {
    expect(canTransition("failed", "uploading")).toBe(true);
    expect(canTransition("failed", "committing")).toBe(true);
    expect(canTransition("cancelling", "committing")).toBe(true);
  });

  it("refuses the moves that would rewrite history", () => {
    // A committing take cannot go back to being transcribed.
    expect(canTransition("committing", "transcribed")).toBe(false);
    // A cancel is not undone by pretending the upload is still running.
    expect(canTransition("cancelling", "uploading")).toBe(false);
    expect(canTransition("recording_saved", "transcribed")).toBe(false);
  });
});

describe("isTerminalPhase", () => {
  it("is failed, and only failed — everything else is still working", () => {
    expect(isTerminalPhase("failed")).toBe(true);
    for (const phase of NON_TERMINAL_PHASES) {
      expect(isTerminalPhase(phase)).toBe(false);
    }
  });
});

describe("transitionTake", () => {
  it("returns null rather than forcing an illegal move", () => {
    expect(transitionTake(take({ phase: "committing" }), "transcribed")).toBeNull();
  });

  it("applies the patch along with the phase", () => {
    const next = transitionTake(take({ phase: "processing" }), "transcribed", {
      transcript: "call mom at six",
    });

    expect(next).toMatchObject({ phase: "transcribed", transcript: "call mom at six" });
  });

  it("keeps the failure on a failed hop", () => {
    const next = transitionTake(take(), "failed", {
      errorKind: "unparseable",
      serverErrorCode: "parse_failed",
    });

    expect(next).toMatchObject({
      phase: "failed",
      errorKind: "unparseable",
      serverErrorCode: "parse_failed",
    });
  });

  it("clears the failure on the way out of it — a retry shows no stale error", () => {
    const failed = take({
      phase: "failed",
      errorKind: "network",
      serverErrorCode: "internal",
    });

    const next = transitionTake(failed, "uploading");

    expect(next).not.toHaveProperty("errorKind");
    expect(next).not.toHaveProperty("serverErrorCode");
    expect(next?.phase).toBe("uploading");
  });

  it("defaults its patch, so a bare phase move is legal", () => {
    expect(transitionTake(take(), "cancelling")?.phase).toBe("cancelling");
  });
});

// ─── the per-hop failure rules ──────────────────────────────────────────────

describe("resolveRecordingLocation", () => {
  it("prefers the documents copy", () => {
    expect(
      resolveRecordingLocation({ cacheUri: "file:///cache/a.m4a", copiedUri: "file:///docs/a.m4a" })
    ).toEqual({ recordingUri: "file:///docs/a.m4a", fragileUri: false });
  });

  it("keeps the cache uri when the copy failed, and says it is fragile", () => {
    expect(
      resolveRecordingLocation({ cacheUri: "file:///cache/a.m4a", copiedUri: null })
    ).toEqual({ recordingUri: "file:///cache/a.m4a", fragileUri: true });
  });
});

describe("missingRecordingOutcome", () => {
  it("carries on from the server blob once the bytes are up", () => {
    expect(missingRecordingOutcome({ audioStorageId: "st1" })).toBe("use_server_blob");
  });

  it("has nothing left to offer but a re-record", () => {
    expect(missingRecordingOutcome({})).toBe("record_again");
  });
});

describe("errorKindForServerCode", () => {
  it("calls only the parse failures the user's sentence", () => {
    expect(errorKindForServerCode("unparseable")).toBe("unparseable");
    expect(errorKindForServerCode("parse_failed")).toBe("unparseable");
  });

  it("treats everything else as the app breaking", () => {
    expect(errorKindForServerCode("storage_missing")).toBe("server");
    expect(errorKindForServerCode("stt_failed")).toBe("server");
    expect(errorKindForServerCode("internal")).toBe("server");
    expect(errorKindForServerCode(undefined)).toBe("server");
  });
});

// ─── persistence ────────────────────────────────────────────────────────────

describe("loadPendingTakes", () => {
  it("is empty before anything has been written", async () => {
    expect(hasLoadedPendingTakes()).toBe(false);
    await expect(loadPendingTakes()).resolves.toEqual([]);
    expect(hasLoadedPendingTakes()).toBe(true);
  });

  it("reads the outbox back", async () => {
    await AsyncStorage.setItem(PENDING_TAKES_STORAGE_KEY, JSON.stringify([take()]));

    await expect(loadPendingTakes()).resolves.toEqual([take()]);
  });

  it("is read once, however many callers ask at the same time", async () => {
    await AsyncStorage.setItem(PENDING_TAKES_STORAGE_KEY, JSON.stringify([take()]));

    const [a, b] = await Promise.all([loadPendingTakes(), loadPendingTakes()]);

    expect(a).toEqual(b);
    expect(AsyncStorage.getItem).toHaveBeenCalledTimes(1);
    // Already loaded: no second read.
    await loadPendingTakes();
    expect(AsyncStorage.getItem).toHaveBeenCalledTimes(1);
  });

  it("drops entries it cannot act on rather than the whole outbox", async () => {
    await AsyncStorage.setItem(
      PENDING_TAKES_STORAGE_KEY,
      JSON.stringify([
        take({ creationId: "good" }),
        null,
        "nope",
        { creationId: "no-uri", phase: "uploading" },
        { recordingUri: "file:///x", phase: "uploading" },
        { creationId: "bad-phase", recordingUri: "file:///x", phase: "teleporting" },
      ])
    );

    const loaded = await loadPendingTakes();

    expect(loaded.map((t) => t.creationId)).toEqual(["good"]);
  });

  it("starts empty on junk, and on a storage that will not read", async () => {
    await AsyncStorage.setItem(PENDING_TAKES_STORAGE_KEY, "{ not json");
    await expect(loadPendingTakes()).resolves.toEqual([]);

    __resetPendingTakes();
    await AsyncStorage.setItem(PENDING_TAKES_STORAGE_KEY, JSON.stringify({ nope: true }));
    await expect(loadPendingTakes()).resolves.toEqual([]);

    __resetPendingTakes();
    (AsyncStorage.getItem as jest.Mock).mockRejectedValueOnce(new Error("disk gone"));
    await expect(loadPendingTakes()).resolves.toEqual([]);
  });
});

describe("the snapshot", () => {
  it("notifies subscribers on every mutation, and stops once unsubscribed", async () => {
    const seen: number[] = [];
    const stop = subscribePendingTakes(() => seen.push(getPendingTakesSnapshot().length));

    await loadPendingTakes();
    await putPendingTake(take());
    expect(seen).toEqual([0, 1]);

    stop();
    await putPendingTake(take({ creationId: "c2" }));
    expect(seen).toEqual([0, 1]);
    expect(getPendingTakesSnapshot()).toHaveLength(2);
  });
});

describe("putPendingTake", () => {
  it("appends a new take and replaces an existing one in place", async () => {
    await putPendingTake(take({ creationId: "a" }));
    await putPendingTake(take({ creationId: "b" }));
    await putPendingTake(take({ creationId: "a", phase: "uploading" }));

    const snapshot = getPendingTakesSnapshot();
    expect(snapshot.map((t) => t.creationId)).toEqual(["a", "b"]);
    expect(snapshot[0].phase).toBe("uploading");

    const onDisk = JSON.parse((await AsyncStorage.getItem(PENDING_TAKES_STORAGE_KEY)) as string);
    expect(onDisk).toHaveLength(2);
  });

  it("rolls memory back when the write fails, and says so", async () => {
    await putPendingTake(take({ creationId: "a" }));
    (AsyncStorage.setItem as jest.Mock).mockRejectedValueOnce(new Error("disk full"));

    await expect(putPendingTake(take({ creationId: "b" }))).rejects.toThrow("disk full");

    expect(getPendingTakesSnapshot().map((t) => t.creationId)).toEqual(["a"]);
  });
});

describe("removePendingTake", () => {
  it("drops the take and rewrites the outbox", async () => {
    await putPendingTake(take({ creationId: "a" }));
    await putPendingTake(take({ creationId: "b" }));

    await removePendingTake("a");

    expect(getPendingTakesSnapshot().map((t) => t.creationId)).toEqual(["b"]);
  });

  it("does not write at all for a take that is already gone", async () => {
    await putPendingTake(take({ creationId: "a" }));
    (AsyncStorage.setItem as jest.Mock).mockClear();

    await removePendingTake("missing");

    expect(AsyncStorage.setItem).not.toHaveBeenCalled();
  });
});

describe("updatePendingTake", () => {
  it("moves the take along and persists it", async () => {
    await putPendingTake(take({ creationId: "a" }));

    const next = await updatePendingTake("a", "uploading", { audioStorageId: "st1" });

    expect(next).toMatchObject({ phase: "uploading", audioStorageId: "st1" });
    expect(getPendingTake("a")).toMatchObject({ phase: "uploading" });
  });

  it("is null for a take that is not there", async () => {
    await expect(updatePendingTake("ghost", "uploading")).resolves.toBeNull();
  });

  it("is null for a move the machine refuses, and changes nothing", async () => {
    await putPendingTake(take({ creationId: "a", phase: "committing" }));

    await expect(updatePendingTake("a", "transcribed")).resolves.toBeNull();
    expect(getPendingTake("a")?.phase).toBe("committing");
  });
});
