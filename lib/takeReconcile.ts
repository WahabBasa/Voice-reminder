import { AppState } from "react-native";
import {
  errorKindForServerCode,
  getPendingTake,
  getPendingTakesSnapshot,
  loadPendingTakes,
  missingRecordingOutcome,
  removePendingTake,
  updatePendingTake,
  type PendingErrorKind,
  type PendingPhase,
  type PendingTake,
} from "./pendingTakes";
import type { WatchedJob } from "./creationJobWatch";
import type { CommitTakeOutcome } from "./takeCommit";

/**
 * Reconciliation (spec §2.5) and the retry dispatch (§2.6).
 *
 * Everything that can strand a take converges here: a kill mid-upload, a
 * foreground after three days offline, a watch that gave up at 90s, a cancel
 * that raced a commit, a user tapping a failed card. The rule is that the
 * device's phase and the server's status are BOTH inputs — neither alone says
 * what to do — and the pair maps to exactly one action.
 *
 * The queue is a draining FIFO with two workers and single-flight per
 * creationId, so two foregrounds in a second cannot import the same take twice,
 * and a take enqueued while its own pass is running is re-run once rather than
 * dropped.
 *
 * The load barrier is not an optimization (C10): dispatching before the outbox,
 * the reminders and the history are on the device would read an empty store and
 * conclude that a perfectly good import never happened.
 */

export type ServerJobStatus = WatchedJob["status"];

export type ReconcileAction =
  | "resume_upload"
  | "rebegin"
  | "subscribe"
  | "import"
  | "fail_from_server"
  | "remove_local"
  | "recover_committing"
  | "invariant_violation"
  | "cancel_then_remove"
  | "discard_then_remove"
  | "retry_dispatch";

/**
 * The §2.5 table, as one function.
 *
 * `null` here always means LOADED-and-missing. A watch's `undefined` never
 * reaches this: it is filtered at the subscription (D-watch), because "not
 * loaded yet" and "no such job" demand opposite actions.
 */
export function decideReconcileAction(
  phase: PendingPhase,
  status: ServerJobStatus | null
): ReconcileAction {
  // Two columns are the same answer whatever the device thinks.
  if (status === "cancelled") return "remove_local";
  if (status === "committed") return "import";

  if (phase === "cancelling") {
    // A cancel over a failed job is a discard — there is nothing to stop.
    return status === "failed" ? "discard_then_remove" : "cancel_then_remove";
  }

  if (status === "failed") return "fail_from_server";

  if (status === null) {
    switch (phase) {
      case "recording_saved":
      case "uploading":
        return "resume_upload";
      case "processing":
      case "transcribed":
        return "rebegin";
      case "committing":
        return "recover_committing";
      default:
        // failed + no job: §2.6 owns this, by errorKind (D4).
        return "retry_dispatch";
    }
  }

  // pending | transcribed
  // A committed take cannot become pending again — the server refuses it. Seeing
  // it means our own phase is wrong, so the card says so rather than importing
  // rows that do not exist.
  return phase === "committing" ? "invariant_violation" : "subscribe";
}

export type RetryAction =
  | "resume_upload"
  | "rebegin"
  | "reupload_then_retry"
  | "server_retry"
  | "import"
  | "subscribe"
  | "remove_local"
  | "record_again";

/**
 * The §2.6 retry dispatch — the single source of truth for "this take failed,
 * what now", used by the failed card's tap AND by reconciliation's `failed +
 * null` cell.
 */
export function decideRetryAction(params: {
  errorKind?: PendingErrorKind;
  hasStorageId: boolean;
  hasRecording: boolean;
  server: ServerJobStatus | null;
  serverErrorCode?: string;
}): RetryAction {
  const { errorKind, hasStorageId, hasRecording, server, serverErrorCode } = params;

  // An unresolved entitlement is a LOCAL block on a job that already committed.
  // It re-enters the import; it must never spend a server retry (C13). A job
  // that is no longer there is no exception: the import is what re-checks the
  // entitlement, and if there is genuinely nothing left to import it says so
  // without the card losing the sentence that explains itself.
  if (errorKind === "cap_unverified") {
    return server === "cancelled" ? "remove_local" : "import";
  }

  if (server === "committed") return "import";
  if (server === "cancelled") return "remove_local";
  if (server === "pending" || server === "transcribed") return "subscribe";

  if (server === "failed") {
    // The one failure a reused blob cannot fix: the blob is what went missing.
    if (serverErrorCode === "storage_missing") {
      return hasRecording ? "reupload_then_retry" : "record_again";
    }
    return "server_retry";
  }

  // server === null
  if (errorKind === "network") {
    if (hasStorageId) return "rebegin";
    return hasRecording ? "resume_upload" : "record_again";
  }
  // A failed job that has been garbage collected, or any non-network failure
  // with nothing left on the server: there is nothing to retry.
  return "record_again";
}

// ─── Wiring ─────────────────────────────────────────────────────────────────

export type ReconcileDeps = {
  getDeviceId: () => Promise<string>;
  fetchJob: (deviceId: string, creationId: string) => Promise<WatchedJob | null>;
  begin: (args: {
    deviceId: string;
    creationId: string;
    audioStorageId: string;
    localDate: string;
    localTime: string;
    timezone: string;
  }) => Promise<{ status: ServerJobStatus }>;
  cancel: (args: {
    deviceId: string;
    creationId: string;
    orphanStorageId?: string;
  }) => Promise<{ status: string }>;
  serverRetry: (args: {
    deviceId: string;
    creationId: string;
    newStorageId?: string;
  }) => Promise<{ status: string; capReached?: boolean }>;
  discard: (args: { deviceId: string; creationId: string }) => Promise<{ status: string }>;
  /** Upload this take's recording. Null when the file is gone (D10). */
  uploadRecording: (take: PendingTake) => Promise<string | null>;
  /** Is the recording still on disk? Only ever false for a `fragileUri` take. */
  recordingExists: (take: PendingTake) => Promise<boolean>;
  importTake: (take: PendingTake) => Promise<CommitTakeOutcome>;
  subscribe: (take: PendingTake) => void;
  deleteRecording: (take: PendingTake) => Promise<void>;
  /** Durable proof that an import landed: a stored row stamped with this take. */
  storeHasCreationId: (creationId: string) => boolean;
  /** Outbox + reminders + history, all on the device (C10). */
  loadBarrier: () => Promise<void>;
  /** The user asked to retry and there is nothing left but a fresh recording. */
  onRecordAgain?: (take: PendingTake) => void;
  onStage?: (creationId: string, stage: string, data?: Record<string, unknown>) => void;
};

const WORKERS = 2;

let deps: ReconcileDeps | null = null;
let queue: string[] = [];
const inFlight = new Set<string>();
const requested = new Set<string>();
let active = 0;
let barrier: Promise<void> | null = null;
let idle: Promise<void> = Promise.resolve();
let resolveIdle: (() => void) | null = null;

export function configureReconcile(next: ReconcileDeps): void {
  deps = next;
  pump();
}

function markBusy(): void {
  if (resolveIdle) return;
  idle = new Promise<void>((resolve) => {
    resolveIdle = resolve;
  });
}

function markIdle(): void {
  const resolve = resolveIdle;
  resolveIdle = null;
  resolve?.();
}

/** Resolves when the queue has drained. The seam every test waits on. */
export function reconcileIdle(): Promise<void> {
  return idle;
}

export function enqueueReconcile(creationId: string): void {
  if (inFlight.has(creationId)) {
    // Its pass is already running and may have read stale state — run it once
    // more when it finishes rather than dropping the request.
    requested.add(creationId);
    return;
  }
  if (queue.includes(creationId)) return;
  queue.push(creationId);
  markBusy();
  pump();
}

/** Startup and every foreground: sweep whatever the outbox is still holding. */
export function enqueueAllPendingTakes(): void {
  markBusy();
  void (async () => {
    try {
      const takes = await loadPendingTakes();
      for (const take of takes) enqueueReconcile(take.creationId);
    } catch (e) {
      console.log("[VR] takeReconcile: outbox load failed:", e);
    } finally {
      if (queue.length === 0 && active === 0) markIdle();
    }
  })();
}

function pump(): void {
  // Nothing is dispatched before the screen has wired its seams; the queue
  // simply holds until it does.
  if (!deps) return;
  while (active < WORKERS && queue.length > 0) {
    const creationId = queue.shift() as string;
    inFlight.add(creationId);
    active += 1;
    void runOne(creationId).finally(() => {
      inFlight.delete(creationId);
      active -= 1;
      if (requested.delete(creationId)) {
        queue.push(creationId);
      }
      if (queue.length > 0) {
        pump();
        return;
      }
      if (active === 0) markIdle();
    });
  }
}

async function ensureBarrier(current: ReconcileDeps): Promise<void> {
  if (!barrier) barrier = current.loadBarrier();
  await barrier;
}

async function runOne(creationId: string): Promise<void> {
  const current = deps;
  if (!current) return;
  try {
    await ensureBarrier(current);
    const take = getPendingTake(creationId);
    if (!take) return;
    await dispatchTake(take, current);
  } catch (e) {
    current.onStage?.(creationId, "reconcile_error", { error: String(e) });
  }
}

async function dispatchTake(take: PendingTake, current: ReconcileDeps): Promise<void> {
  const deviceId = await current.getDeviceId();
  const job = await current.fetchJob(deviceId, take.creationId);
  const status = job?.status ?? null;
  const action = decideReconcileAction(take.phase, status);
  current.onStage?.(take.creationId, `reconcile_${action}`);

  switch (action) {
    case "remove_local":
      await forget(take, current);
      return;
    case "import":
      await runImport(take, current, status);
      return;
    case "fail_from_server":
      await failFromServer(take, job as WatchedJob);
      return;
    case "subscribe":
      current.subscribe(take);
      return;
    case "resume_upload":
      await resumeUpload(take, current, deviceId);
      return;
    case "rebegin":
      await beginAndSubscribe(take, current, deviceId);
      return;
    case "recover_committing":
      await recoverCommitting(take, current);
      return;
    case "invariant_violation":
      await failLocally(take, "server");
      return;
    case "cancel_then_remove":
      await cancelThenRemove(take, current, deviceId);
      return;
    case "discard_then_remove":
      await discardThenRemove(take, current, deviceId);
      return;
    default:
      await runRetry(take, current, deviceId, job, "reconcile");
      return;
  }
}

// ─── The individual moves ───────────────────────────────────────────────────

async function forget(take: PendingTake, current: ReconcileDeps): Promise<void> {
  await removePendingTake(take.creationId);
  await current.deleteRecording(take).catch(() => {});
}

async function failLocally(take: PendingTake, errorKind: PendingErrorKind): Promise<void> {
  await updatePendingTake(take.creationId, "failed", { errorKind });
}

async function failFromServer(take: PendingTake, job: WatchedJob): Promise<void> {
  await updatePendingTake(take.creationId, "failed", {
    errorKind: errorKindForServerCode(job.errorCode),
    serverErrorCode: job.errorCode,
  });
}

async function runImport(
  take: PendingTake,
  current: ReconcileDeps,
  status: ServerJobStatus | null
): Promise<void> {
  const outcome = await current.importTake(take);
  if (outcome.result !== "unavailable") return;

  // The job said committed but its rows would not read: a race worth another
  // push. With no job at all there is nothing to wait for.
  if (status === "committed") {
    current.subscribe(take);
    return;
  }
  // An unresolved entitlement is a LOCAL block over a job that already
  // committed, and a job that has since been collected does not turn it into a
  // generic fault. Keeping the entitlement copy keeps the card honest — "can't
  // verify your subscription" is still exactly what happened — and keeps the
  // retry pointed at the local re-check rather than at a server that has
  // nothing left to offer.
  await failLocally(take, take.errorKind === "cap_unverified" ? "cap_unverified" : "server");
}

/**
 * Resume from wherever the upload got to. The phase is re-read immediately
 * before `begin` because a cancel may have landed while the bytes were in
 * flight — in which case the blob is an orphan and is handed straight to the
 * server for deletion (C4).
 */
async function resumeUpload(
  take: PendingTake,
  current: ReconcileDeps,
  deviceId: string
): Promise<void> {
  if (missingRecordingOutcome(take) === "use_server_blob") {
    // The bytes already reached Convex, so whether the local file survived is
    // beside the point — the server blob is the source (D10).
    await beginAndSubscribe(take, current, deviceId);
    return;
  }

  const uploading = await updatePendingTake(take.creationId, "uploading");
  if (!uploading) return;

  const storageId = await current.uploadRecording(uploading);
  if (!storageId) {
    // Nothing uploaded and nothing on disk: the only honest offer is a
    // re-record, which is what the failed("server") card carries (D10).
    await failLocally(uploading, "server");
    return;
  }

  const live = getPendingTake(take.creationId);
  if (!live || live.phase === "cancelling") {
    await handOrphanBlob(current, deviceId, take.creationId, storageId);
    return;
  }

  const stamped = await updatePendingTake(take.creationId, "uploading", {
    audioStorageId: storageId,
  });
  await beginAndSubscribe(stamped ?? { ...uploading, audioStorageId: storageId }, current, deviceId);
}

async function beginAndSubscribe(
  take: PendingTake,
  current: ReconcileDeps,
  deviceId: string
): Promise<void> {
  const audioStorageId = take.audioStorageId;
  if (!audioStorageId) {
    await failLocally(take, "server");
    return;
  }

  const live = getPendingTake(take.creationId);
  if (!live || live.phase === "cancelling") {
    await handOrphanBlob(current, deviceId, take.creationId, audioStorageId);
    return;
  }

  await current.begin({
    deviceId,
    creationId: take.creationId,
    audioStorageId,
    localDate: take.localDate,
    localTime: take.localTime,
    timezone: take.timezone,
  });
  const processing = await updatePendingTake(take.creationId, "processing", {
    audioStorageId,
  });
  current.subscribe(processing ?? take);
}

/** Three tries, then the blob is left to the sweep — bounded and harmless. */
async function handOrphanBlob(
  current: ReconcileDeps,
  deviceId: string,
  creationId: string,
  storageId: string
): Promise<void> {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      await current.cancel({ deviceId, creationId, orphanStorageId: storageId });
      return;
    } catch (e) {
      current.onStage?.(creationId, "orphan_cancel_failed", { attempt, error: String(e) });
    }
  }
}

/**
 * `committing + null` (D4): the job vanished mid-import.
 *
 * `getReminders` is unavailable, so the only evidence left is the store itself.
 * A row stamped with this creationId proves the import persisted — the §2.4
 * rollback rule guarantees memory never holds a stamped row whose disk write
 * failed, so the in-memory check is durable by construction (N3).
 */
async function recoverCommitting(take: PendingTake, current: ReconcileDeps): Promise<void> {
  if (current.storeHasCreationId(take.creationId)) {
    current.onStage?.(take.creationId, "committing_recovered");
    await forget(take, current);
    return;
  }
  await failLocally(take, "server");
}

async function cancelThenRemove(
  take: PendingTake,
  current: ReconcileDeps,
  deviceId: string
): Promise<void> {
  const result = await current.cancel({
    deviceId,
    creationId: take.creationId,
    ...(take.audioStorageId ? { orphanStorageId: take.audioStorageId } : {}),
  });
  // The cancel lost: the take committed anyway, so it gets imported rather than
  // thrown away (C4).
  if (result.status === "committed") {
    await runImport(take, current, "committed");
    return;
  }
  await forget(take, current);
}

async function discardThenRemove(
  take: PendingTake,
  current: ReconcileDeps,
  deviceId: string
): Promise<void> {
  await current.discard({ deviceId, creationId: take.creationId }).catch(() => ({ status: "error" }));
  await forget(take, current);
}

// ─── §2.6, callable directly from the card ──────────────────────────────────

async function runRetry(
  take: PendingTake,
  current: ReconcileDeps,
  deviceId: string,
  job: WatchedJob | null,
  trigger: "user" | "reconcile"
): Promise<void> {
  const status = job?.status ?? null;
  const action = decideRetryAction({
    errorKind: take.errorKind,
    hasStorageId: !!take.audioStorageId,
    hasRecording: await current.recordingExists(take),
    server: status,
    serverErrorCode: job?.errorCode,
  });
  current.onStage?.(take.creationId, `retry_${action}`, { trigger });

  switch (action) {
    case "import":
      await runImport(take, current, status);
      return;
    case "subscribe":
      current.subscribe(take);
      return;
    case "remove_local":
      await forget(take, current);
      return;
    case "rebegin":
      await beginAndSubscribe(take, current, deviceId);
      return;
    case "resume_upload": {
      const cleared = await updatePendingTake(take.creationId, "uploading");
      await resumeUpload(cleared ?? take, current, deviceId);
      return;
    }
    case "reupload_then_retry": {
      const storageId = await current.uploadRecording(take);
      if (!storageId) {
        await recordAgain(take, current, deviceId, trigger);
        return;
      }
      await updatePendingTake(take.creationId, "processing", { audioStorageId: storageId });
      const result = await current.serverRetry({
        deviceId,
        creationId: take.creationId,
        newStorageId: storageId,
      });
      await afterServerRetry(take, current, deviceId, result, trigger);
      return;
    }
    case "server_retry": {
      const result = await current.serverRetry({ deviceId, creationId: take.creationId });
      await afterServerRetry(take, current, deviceId, result, trigger);
      return;
    }
    default:
      await recordAgain(take, current, deviceId, trigger);
      return;
  }
}

async function afterServerRetry(
  take: PendingTake,
  current: ReconcileDeps,
  deviceId: string,
  result: { status: string; capReached?: boolean },
  trigger: "user" | "reconcile"
): Promise<void> {
  if (result.capReached) {
    // Three attempts is the server's limit; another one would only fail again.
    await recordAgain(take, current, deviceId, trigger);
    return;
  }
  const processing = await updatePendingTake(take.creationId, "processing", {
    attempts: take.attempts + 1,
  });
  current.subscribe(processing ?? take);
}

/**
 * Nothing left to retry with.
 *
 * A reconciliation pass only marks the card; popping the recorder because the
 * app came back to the foreground would be an ambush. A deliberate tap gets the
 * offer — and with it, the old take goes: a re-record is a NEW creationId
 * (§2.6), so leaving the dead card on screen beside the recorder would show two
 * takes for one reminder. Discard first (a failed or cancelled job and its blob
 * leave the server; anything else is a no-op there), then the local row and its
 * recording.
 */
async function recordAgain(
  take: PendingTake,
  current: ReconcileDeps,
  deviceId: string,
  trigger: "user" | "reconcile"
): Promise<void> {
  if (trigger !== "user") {
    await failLocally(take, "server");
    return;
  }
  await current
    .discard({ deviceId, creationId: take.creationId })
    .catch(() => ({ status: "error" }));
  await forget(take, current);
  current.onRecordAgain?.(take);
}

// ─── Public entry points for the card and the uploader ──────────────────────

/**
 * An upload that finished after its take was cancelled or removed.
 *
 * The blob is referenced by nothing, so it is handed to `cancel` — which knows
 * to schedule its deletion even for a job that no longer exists (C4).
 */
export async function abandonOrphanBlob(creationId: string, storageId: string): Promise<void> {
  const current = deps;
  if (!current) return;
  const deviceId = await current.getDeviceId();
  await handOrphanBlob(current, deviceId, creationId, storageId);
}

export async function retryTake(creationId: string): Promise<void> {
  const current = deps;
  const take = getPendingTake(creationId);
  if (!current || !take) return;
  try {
    const deviceId = await current.getDeviceId();
    const job = await current.fetchJob(deviceId, creationId);
    await runRetry(take, current, deviceId, job, "user");
  } catch (e) {
    current.onStage?.(creationId, "retry_error", { error: String(e) });
  }
}

export async function cancelTake(creationId: string): Promise<void> {
  const take = getPendingTake(creationId);
  if (!take) return;
  await updatePendingTake(creationId, "cancelling");
  enqueueReconcile(creationId);
}

export async function discardTake(creationId: string): Promise<void> {
  const current = deps;
  const take = getPendingTake(creationId);
  if (!current || !take) return;
  try {
    const deviceId = await current.getDeviceId();
    await current.discard({ deviceId, creationId }).catch(() => ({ status: "error" }));
  } catch (e) {
    current.onStage?.(creationId, "discard_error", { error: String(e) });
  }
  await forget(take, current);
}

/** Cross-platform: every return to the foreground drains the outbox. */
export function startForegroundReconcile(): () => void {
  const subscription = AppState.addEventListener("change", (state) => {
    if (state === "active") enqueueAllPendingTakes();
  });
  return () => subscription.remove();
}

/** How many takes the card layer would draw right now. */
export function pendingTakeCount(): number {
  return getPendingTakesSnapshot().length;
}

/** Test seam. */
export function __resetReconcile(): void {
  deps = null;
  queue = [];
  inFlight.clear();
  requested.clear();
  active = 0;
  barrier = null;
  idle = Promise.resolve();
  resolveIdle = null;
}
