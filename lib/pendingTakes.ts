import AsyncStorage from "@react-native-async-storage/async-storage";

/**
 * The PendingTake outbox (spec §2.1).
 *
 * A take that has been recorded but not yet imported lives here, and only here.
 * It is deliberately NOT a `Reminder`: it never reaches the reminders store, so
 * it cannot be counted by the free cap, cannot join Today, cannot be swiped or
 * ticked, and is invisible to the startup alarm sync. The pending card reads
 * this list; everything else in the app reads the reminders store, exactly as
 * it did before.
 *
 * Two halves, kept apart on purpose:
 *   - a pure state machine (phases, legal transitions, the per-hop failure
 *     rules), which is what the tests pin; and
 *   - a tiny persisted list on its own AsyncStorage key with a snapshot
 *     subscription for the card.
 *
 * There is no `cap_unverified` phase. That state is `phase:"failed"` with
 * `errorKind:"cap_unverified"` (D3) — it is a failed take whose failure happens
 * to be an entitlement we could not confirm, and every failed-card affordance
 * (tap to retry, swipe to discard) applies to it unchanged.
 */

const PENDING_TAKES_KEY = "@pending_takes";

export type PendingPhase =
  | "recording_saved"
  | "uploading"
  | "processing"
  | "transcribed"
  | "committing"
  | "failed"
  | "cancelling";

export type PendingErrorKind = "network" | "unparseable" | "server" | "cap_unverified";

export type PendingTake = {
  creationId: string;
  phase: PendingPhase;
  transcript?: string;
  errorKind?: PendingErrorKind;
  /** Documents-dir copy of the recording — or the cache URI, if the copy failed. */
  recordingUri: string;
  /** True when the copy failed and we kept the cache URI, which may vanish (D10). */
  fragileUri?: boolean;
  audioStorageId?: string;
  serverErrorCode?: string;
  /** The device clock AT STOP-TAP. The import builds rows against this, not "now" (C14). */
  localDate: string;
  localTime: string;
  timezone: string;
  createdAt: number;
  attempts: number;
};

/**
 * Which phases may follow which. A take only ever moves along one of these
 * edges, which is what makes a replay after a crash safe to reason about: the
 * reconciler can ask "what is legal from here" instead of trusting a phase it
 * read off disk.
 */
const NEXT_PHASES: Record<PendingPhase, readonly PendingPhase[]> = {
  recording_saved: ["uploading", "processing", "failed", "cancelling"],
  // A resumed upload can find the job already past `pending`, so it is allowed
  // to land anywhere the worker has already reached.
  uploading: ["processing", "transcribed", "committing", "failed", "cancelling"],
  processing: ["transcribed", "committing", "failed", "cancelling"],
  transcribed: ["committing", "failed", "cancelling"],
  committing: ["failed", "cancelling"],
  // `failed` is retryable-terminal, exactly like the server's own: every retry
  // dispatch in §2.6 re-enters the pipeline from here.
  failed: ["uploading", "processing", "transcribed", "committing", "cancelling"],
  // A cancel that lost the race still has to import what the server committed.
  cancelling: ["committing", "failed"],
};

/** Phases that are still working, and therefore still cancellable (C4). */
export const NON_TERMINAL_PHASES: readonly PendingPhase[] = [
  "recording_saved",
  "uploading",
  "processing",
  "transcribed",
  "committing",
  "cancelling",
];

export function isTerminalPhase(phase: PendingPhase): boolean {
  return phase === "failed";
}

/** Same phase is always legal — a re-entrant hop is a no-op, not a violation. */
export function canTransition(from: PendingPhase, to: PendingPhase): boolean {
  if (from === to) return true;
  return NEXT_PHASES[from].includes(to);
}

export type PendingPatch = {
  transcript?: string;
  errorKind?: PendingErrorKind;
  serverErrorCode?: string;
  audioStorageId?: string;
  recordingUri?: string;
  fragileUri?: boolean;
  attempts?: number;
};

/**
 * The state machine itself: one take in, the take it becomes out, or `null`
 * when the move is not one this machine allows.
 *
 * Leaving `failed` clears the failure, so a card that retries and comes back
 * cannot show yesterday's error under today's shimmer.
 */
export function transitionTake(
  take: PendingTake,
  phase: PendingPhase,
  patch: PendingPatch = {}
): PendingTake | null {
  if (!canTransition(take.phase, phase)) return null;

  const next: PendingTake = { ...take, ...patch, phase };
  if (phase !== "failed") {
    delete next.errorKind;
    delete next.serverErrorCode;
  }
  return next;
}

export function newPendingTake(params: {
  creationId: string;
  recordingUri: string;
  fragileUri?: boolean;
  localDate: string;
  localTime: string;
  timezone: string;
  createdAt: number;
}): PendingTake {
  return {
    creationId: params.creationId,
    phase: "recording_saved",
    recordingUri: params.recordingUri,
    ...(params.fragileUri ? { fragileUri: true } : {}),
    localDate: params.localDate,
    localTime: params.localTime,
    timezone: params.timezone,
    createdAt: params.createdAt,
    attempts: 0,
  };
}

// ─── Per-hop failure rules (§2.1) ───────────────────────────────────────────

/**
 * Stop-tap hop one: the recording is copied out of the cache directory, which
 * the OS may reclaim at any time. A copy that failed is not fatal — the cache
 * URI still works right now — but the take is marked `fragileUri` so every
 * later reader knows the file might be gone (D10).
 */
export function resolveRecordingLocation(params: {
  cacheUri: string;
  copiedUri: string | null;
}): { recordingUri: string; fragileUri: boolean } {
  if (params.copiedUri) return { recordingUri: params.copiedUri, fragileUri: false };
  return { recordingUri: params.cacheUri, fragileUri: true };
}

export type MissingRecordingOutcome = "use_server_blob" | "record_again";

/**
 * A recording we need is not on disk. If the bytes already reached Convex the
 * server blob is the source of truth and the pipeline carries on; otherwise
 * there is nothing left to transcribe and the only honest offer is a re-record
 * (D10).
 */
export function missingRecordingOutcome(
  take: Pick<PendingTake, "audioStorageId">
): MissingRecordingOutcome {
  return take.audioStorageId ? "use_server_blob" : "record_again";
}

/**
 * The card's error kind for a server `errorCode`.
 *
 * Only the two parse failures are the user's sentence being unusable; a missing
 * blob, a transcription transport error and an internal fault are all "the app
 * broke", which is what the generic server copy says.
 */
export function errorKindForServerCode(code: string | undefined): PendingErrorKind {
  if (code === "unparseable" || code === "parse_failed") return "unparseable";
  return "server";
}

// ─── Persistence + snapshot store ───────────────────────────────────────────

let cache: PendingTake[] = [];
let hasLoaded = false;
let loadInFlight: Promise<PendingTake[]> | null = null;
const listeners = new Set<() => void>();

/** Stable identity between mutations, so `useSyncExternalStore` can rely on it. */
export function getPendingTakesSnapshot(): PendingTake[] {
  return cache;
}

export function subscribePendingTakes(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function publish(next: PendingTake[]): void {
  cache = next;
  for (const listener of [...listeners]) listener();
}

function isPendingTake(value: unknown): value is PendingTake {
  if (!value || typeof value !== "object") return false;
  const take = value as Partial<PendingTake>;
  return (
    typeof take.creationId === "string" &&
    typeof take.recordingUri === "string" &&
    typeof take.phase === "string" &&
    Object.prototype.hasOwnProperty.call(NEXT_PHASES, take.phase)
  );
}

/**
 * Read the outbox off disk. Concurrent callers share one read, and a corrupt
 * or unreadable key yields an empty outbox rather than throwing — a take we
 * cannot parse is a take we can no longer act on either way.
 */
export async function loadPendingTakes(): Promise<PendingTake[]> {
  if (hasLoaded) return cache;
  if (loadInFlight) return loadInFlight;

  loadInFlight = (async () => {
    let loaded: PendingTake[] = [];
    try {
      const raw = await AsyncStorage.getItem(PENDING_TAKES_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) loaded = parsed.filter(isPendingTake);
      }
    } catch (error) {
      console.log("[VR] pendingTakes: load failed, starting empty:", error);
    }
    hasLoaded = true;
    publish(loaded);
    return loaded;
  })();

  try {
    return await loadInFlight;
  } finally {
    loadInFlight = null;
  }
}

export function hasLoadedPendingTakes(): boolean {
  return hasLoaded;
}

export function getPendingTake(creationId: string): PendingTake | undefined {
  return cache.find((take) => take.creationId === creationId);
}

/**
 * Write one take into the outbox, in place if it is already there.
 *
 * The in-memory snapshot moves first so the card is instant, and is rolled back
 * if the disk write fails — the same rule the reminders store follows, for the
 * same reason: memory that disagrees with disk is how a replay loses a take.
 */
export async function putPendingTake(take: PendingTake): Promise<void> {
  const before = cache;
  const index = before.findIndex((candidate) => candidate.creationId === take.creationId);
  const next = index === -1 ? [...before, take] : before.map((c, i) => (i === index ? take : c));
  await commit(next, before);
}

export async function removePendingTake(creationId: string): Promise<void> {
  const before = cache;
  const next = before.filter((take) => take.creationId !== creationId);
  if (next.length === before.length) return;
  await commit(next, before);
}

/**
 * Move one take along the machine and persist the result. Returns the take it
 * became, or null when there is no such take or the move was illegal.
 */
export async function updatePendingTake(
  creationId: string,
  phase: PendingPhase,
  patch: PendingPatch = {}
): Promise<PendingTake | null> {
  const current = getPendingTake(creationId);
  if (!current) return null;
  const next = transitionTake(current, phase, patch);
  if (!next) return null;
  await putPendingTake(next);
  return next;
}

async function commit(next: PendingTake[], before: PendingTake[]): Promise<void> {
  publish(next);
  try {
    await AsyncStorage.setItem(PENDING_TAKES_KEY, JSON.stringify(next));
  } catch (error) {
    publish(before);
    throw error;
  }
}

/** Test seam: forget everything this module is holding. */
export function __resetPendingTakes(): void {
  cache = [];
  hasLoaded = false;
  loadInFlight = null;
  listeners.clear();
}

export const PENDING_TAKES_STORAGE_KEY = PENDING_TAKES_KEY;
