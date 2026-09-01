import { api } from "../convex/_generated/api";

/**
 * The pending card's subscription (spec §2.7).
 *
 * One `watchQuery` on `creationJobs.get`, the same mechanics reactive audio
 * hydration uses, with the same sharp edge at the centre of it:
 * `localQueryResult()` answers three ways, not two.
 *
 *   - `undefined` — NOT LOADED YET. Take no action. A job that does not exist
 *     and a job whose first server response has not arrived look identical
 *     here, and dispatching the "missing" branch on the second one would tear
 *     down a take that is merely young (D-watch).
 *   - `null`     — loaded, and the server says there is no such job. Dispatch.
 *   - a document — dispatch.
 *
 * Disposal is the other half of the contract:
 *   - `failed`/`cancelled` — dispose immediately, the job is over.
 *   - `null` — dispatch once and dispose; the reconciler owns what happens next
 *     and there is no document left to watch.
 *   - `committed` — dispatch the import IMMEDIATELY, but keep the subscription
 *     open until `perf.commitMs`/`totalMs` arrive in the worker's later
 *     best-effort `perfPatch`, or a 10s telemetry timeout expires. Server
 *     timings are read off this document (D7); dropping the watch the instant
 *     the status flips would lose every one of them (C5/C18/N2).
 *
 * A 90s watchdog covers the case where nothing ever arrives: the take is failed
 * locally as `network` and left for reconciliation, which is the only actor
 * that can tell a dead job from a slow one.
 */

/** Exactly the document `creationJobs.get` returns. */
export type WatchedJob = {
  status: "pending" | "transcribed" | "committed" | "failed" | "cancelled";
  generation: number;
  transcript?: string;
  errorCode?: string;
  reminderIds?: string[];
  perf?: CreationServerPerf;
  updatedAt: number;
};

export type CreationServerPerf = {
  storageGetMs?: number;
  blobMs?: number;
  whisperMs?: number;
  parseMs?: number;
  commitMs?: number;
  totalMs?: number;
};

/** The subset of ConvexReactClient this module needs — and all a test needs to fake. */
export type WatchClient = {
  watchQuery: (
    query: any,
    ...argsAndOptions: any[]
  ) => { onUpdate(callback: () => void): () => void; localQueryResult(): any };
};

export type CreationJobWatchHandle = {
  /** Drop the subscription and every timer. Idempotent. */
  dispose: () => void;
  /** Resolves once the watch has disposed, however it got there. */
  done: Promise<void>;
};

/** Longest a take may go without any terminal news before we call it network-dead. */
export const WATCHDOG_MS = 90_000;
/** How long a committed watch is retained purely to collect server timings. */
export const TELEMETRY_TIMEOUT_MS = 10_000;

export function watchCreationJob(params: {
  convexClient: WatchClient;
  deviceId: string;
  creationId: string;
  /**
   * A loaded result. `null` means the server has no such job. Serialized: the
   * next update waits for this one's promise, so two pushes can never
   * interleave two imports.
   */
  onUpdate: (job: WatchedJob | null) => void | Promise<void>;
  /** The watch itself gave up: a thrown query, or the watchdog expiring. */
  onLocalFailure: (errorKind: "network" | "server") => void | Promise<void>;
  /** Server timings, once they are as complete as they are going to get. */
  onServerPerf?: (perf: CreationServerPerf) => void;
}): CreationJobWatchHandle {
  const { convexClient, deviceId, creationId, onUpdate, onLocalFailure, onServerPerf } = params;

  let unsubscribe: (() => void) | null = null;
  let watch: ReturnType<WatchClient["watchQuery"]> | null = null;
  let settled = false;
  /** Set once the committed import has been dispatched — it happens once. */
  let committedDispatched = false;
  /** Set once a loaded `null` has been dispatched — likewise. */
  let missingDispatched = false;
  let watchdog: ReturnType<typeof setTimeout> | null = null;
  let telemetryTimer: ReturnType<typeof setTimeout> | null = null;
  let chain: Promise<void> = Promise.resolve();
  let resolveDone: () => void = () => {};
  const done = new Promise<void>((resolve) => {
    resolveDone = resolve;
  });

  const clearTimers = (): void => {
    if (watchdog) {
      clearTimeout(watchdog);
      watchdog = null;
    }
    if (telemetryTimer) {
      clearTimeout(telemetryTimer);
      telemetryTimer = null;
    }
  };

  const dispose = (): void => {
    if (settled) return;
    settled = true;
    clearTimers();
    const off = unsubscribe;
    unsubscribe = null;
    watch = null;
    if (off) {
      try {
        off();
      } catch (e) {
        console.log(`[VR] creationJobWatch: unsubscribe failed for ${creationId}:`, e);
      }
    }
    resolveDone();
  };

  /** Hand over whatever timings the document ended up with, then let go. */
  const finishTelemetry = (perf: CreationServerPerf | undefined): void => {
    if (settled) return;
    onServerPerf?.(perf ?? {});
    dispose();
  };

  const read = async (): Promise<void> => {
    if (settled) return;
    const current = watch;
    if (!current) return;

    let result: unknown;
    try {
      result = current.localQueryResult();
    } catch (e) {
      console.log(`[VR] creationJobWatch: query failed for ${creationId}:`, e);
      const notify = onLocalFailure("server");
      dispose();
      await notify;
      return;
    }

    // Not loaded yet — indistinguishable from a missing job, so waiting is the
    // only safe move.
    if (result === undefined) return;

    if (result === null) {
      if (missingDispatched) return;
      missingDispatched = true;
      const notify = onUpdate(null);
      dispose();
      await notify;
      return;
    }

    const job = result as WatchedJob;

    if (job.status === "committed") {
      if (!committedDispatched) {
        committedDispatched = true;
        // The import is dispatched now; the subscription lives on only to
        // collect the timings the worker patches in a moment later.
        clearTimers();
        telemetryTimer = setTimeout(() => {
          telemetryTimer = null;
          finishTelemetry(readPerf());
        }, TELEMETRY_TIMEOUT_MS);
        await onUpdate(job);
      }
      if (job.perf?.commitMs !== undefined && job.perf?.totalMs !== undefined) {
        finishTelemetry(job.perf);
      }
      return;
    }

    if (job.status === "failed" || job.status === "cancelled") {
      const notify = onUpdate(job);
      dispose();
      await notify;
      return;
    }

    await onUpdate(job);
  };

  /**
   * The document as the subscription currently holds it, for the telemetry
   * timeout — which fires outside a read and must never throw.
   */
  const readPerf = (): CreationServerPerf | undefined => {
    try {
      const result = watch?.localQueryResult();
      if (result && typeof result === "object") return (result as WatchedJob).perf;
    } catch (e) {
      console.log(`[VR] creationJobWatch: perf read failed for ${creationId}:`, e);
    }
    return undefined;
  };

  /** Queue one read behind whatever is already running (serialized handlers). */
  const scheduleRead = (): void => {
    chain = chain.then(read).catch((e) => {
      console.log(`[VR] creationJobWatch: update handler failed for ${creationId}:`, e);
    });
  };

  watchdog = setTimeout(() => {
    watchdog = null;
    console.log(`[VR] creationJobWatch: watchdog expired for ${creationId}`);
    const notify = onLocalFailure("network");
    dispose();
    void Promise.resolve(notify).catch(() => {});
  }, WATCHDOG_MS);

  const next = convexClient.watchQuery(api.creationJobs.get, { deviceId, creationId });
  watch = next;
  unsubscribe = next.onUpdate(() => {
    scheduleRead();
  });
  // The subscription may already hold a result (another watcher on the same
  // query), and onUpdate would not fire for it.
  scheduleRead();

  return { dispose, done };
}
