import { buildReminderDraft, isPremiumTakeItem, planTakeAllowance } from "./voiceTake";
import type { Reminder } from "./store";
import type { PendingTake } from "./pendingTakes";
import type { ProStatus } from "./proCardContent";

/**
 * Importing a committed take (spec §2.4) — the voice-job path only.
 *
 * The typed composer keeps its legacy loop (C8); nothing here is on its path.
 *
 * Four rules shape everything below:
 *
 *  1. The rows are built against the JOB's timezone snapshot, not the device's
 *     clock right now (C14). A take recorded in Riyadh and imported after a
 *     flight must resolve to the times the user actually said.
 *  2. The allowance is tri-state (D6/OLD-127). A confirmed subscriber keeps
 *     everything; a confirmed free plan drops the Pro-only schedules FIRST and
 *     then spends the cap on what is left — exactly the order planTakeAllowance
 *     already applies; an entitlement we could not confirm imports NOTHING,
 *     deletes nothing server-side, and sells nothing. Guessing "free" there
 *     would delete a paying user's reminders.
 *  3. The upsert IS the idempotency mechanism (D2). A row whose `convexId` is
 *     already in the store is updated in place, never appended, so a crash
 *     between the write and the outbox cleanup costs a replay and nothing else.
 *     There is no skip-list to fall out of sync with.
 *  4. The creation lock covers the LOCAL half only. Steps 1 and 2 are a Convex
 *     query and an entitlement round trip with no timeout of its own; holding
 *     the store-level lock across them means one stalled import freezes legacy
 *     `addReminder`, and the typed composer's Save spins until the network
 *     comes back. So the lock is taken after those two answers are in hand —
 *     and the cap math that depends on the STORE is re-read once it is held,
 *     because another writer may have taken the last slot while we waited (C9).
 */

/** One row as `creationJobs.getReminders` projects it. */
export type CommittedRow = Record<string, any> & {
  id: string;
  deleted?: boolean;
  audioStatus?: string;
};

export type TakeImportSummary = {
  created: number;
  dropped: number;
  blockedPremium: number;
  total: number;
  limit: number;
};

export type CommitTakeOutcome =
  | { result: "imported"; rows: Reminder[]; summary: TakeImportSummary }
  /** Entitlement unresolved — the card says so and the take waits (OLD-127). */
  | { result: "cap_unverified" }
  /** The job is not readable (not committed, wrong device, or gone). */
  | { result: "unavailable" }
  /** Committed, but every row had already been deleted. */
  | { result: "empty" }
  /** The batch write failed; memory was rolled back and the phase stays committing. */
  | { result: "persist_failed"; error: unknown };

export type CommitTakeDeps = {
  /**
   * `creationJobs.getReminders` for this take. Null = not importable yet.
   *
   * Called again by the overflow queue as its audio-status refresh — it is the
   * same read, so it is the same seam.
   */
  fetchRows: () => Promise<CommittedRow[] | null>;
  proStatus: () => Promise<ProStatus>;
  /**
   * The store-level creation lock (C9), wrapped around the LOCAL half of the
   * import only — see rule 4. Everything it covers is on-device work, so a
   * network that never answers cannot hold legacy `addReminder` behind it.
   */
  withLock: <T>(run: () => Promise<T>) => Promise<T>;
  activeCount: () => number;
  limit: number;
  storeSnapshot: () => Reminder[];
  applyStore: (rows: Reminder[]) => void;
  persistStore: (rows: Reminder[]) => Promise<void>;
  newLocalId: () => string;
  now: () => number;
  markCommitting: () => Promise<void>;
  markCapUnverified: () => Promise<void>;
  removeTake: () => Promise<void>;
  deleteRecording: () => Promise<void>;
  ack: () => Promise<void>;
  deleteServerRow: (id: string) => Promise<void>;
  wait: (ms: number) => Promise<void>;
  /** Scheduling + hydration. Called after the rows are durably on disk. */
  onImported?: (created: Reminder[], summary: TakeImportSummary) => void;
  onStage?: (stage: string, data?: Record<string, unknown>) => void;
};

export async function commitTake(params: {
  take: PendingTake;
  deps: CommitTakeDeps;
}): Promise<CommitTakeOutcome> {
  const { take, deps } = params;

  // ── 1. The rows the job produced ──────────────────────────────────────────
  // A Convex query, so it runs BEFORE the lock (rule 4).
  const rows = await deps.fetchRows();
  if (rows === null) return { result: "unavailable" };

  // A row the user deleted between commit and import comes back as a
  // placeholder rather than silently missing, so this drop is a decision.
  const live = rows.filter((row) => row.deleted !== true);
  if (live.length === 0) {
    await finishCleanup(deps);
    return { result: "empty" };
  }

  // ── 2. The entitlement, once, for the whole take ──────────────────────────
  // Also before the lock: this may force a store-kit refresh, and that call has
  // no timeout. Nothing local is touched on either side of this answer.
  const status = await deps.proStatus();
  if (status === "unknown") {
    await deps.markCapUnverified();
    deps.onStage?.("cap_unverified");
    return { result: "cap_unverified" };
  }

  // ── 3-5. The local half, serialized against legacy addReminder (C9) ───────
  return await deps.withLock(() => importUnderLock(take, deps, live, status));
}

/**
 * Steps 3 to 5 — everything that reads or writes the store — with the creation
 * lock held.
 *
 * The allowance is planned HERE rather than being carried in from step 2 on
 * purpose. `status` and `live` are facts about the server and cannot change
 * while we wait for the lock; "how many active reminders does this device
 * already have" is a fact about the STORE, and the typed composer may have
 * spent the last free slot in exactly that window. Reading the count after
 * acquiring is what keeps the cap honest with two writers (C9).
 */
async function importUnderLock(
  take: PendingTake,
  deps: CommitTakeDeps,
  live: CommittedRow[],
  status: Exclude<ProStatus, "unknown">
): Promise<CommitTakeOutcome> {
  const tzid = take.timezone;
  const premium = live.map((row) => isPremiumTakeItem(row, tzid));
  const allowance = await planTakeAllowance({
    takeCount: live.length,
    activeCount: deps.activeCount(),
    limit: deps.limit,
    checkPro: async () => status === "pro",
    premium,
  });

  // ── 3. Durable marker, then ONE set + ONE write ───────────────────────────
  await deps.markCommitting();

  const kept: CommittedRow[] = [];
  const overflow: CommittedRow[] = [];
  live.forEach((row, index) => {
    if (allowance.decisions[index] === "keep") kept.push(row);
    else overflow.push(row);
  });

  const before = deps.storeSnapshot();
  const drafts: ImportDraft[] = kept.map((row) => ({
    convexId: String(row.id),
    draft: {
      ...buildReminderDraft(row, { usedFastPath: true, tzid }),
      // Every imported row carries the take it came from, which is what lets a
      // `committing + null` recovery prove the import already landed (N1/D4).
      creationId: take.creationId,
    },
  }));

  const nowIso = new Date(deps.now()).toISOString();
  const { rows: nextRows, created } = upsertByConvexId(before, drafts, {
    newLocalId: deps.newLocalId,
    createdAt: () => nowIso,
  });

  deps.applyStore(nextRows);
  try {
    await deps.persistStore(nextRows);
  } catch (error) {
    // Memory must never hold a stamped row whose disk write failed — the
    // `committing + null` recovery reads the store as durable proof (N3).
    deps.applyStore(before);
    deps.onStage?.("persist_failed");
    return { result: "persist_failed", error };
  }

  // ── 4. Overflow the free plan won't keep ──────────────────────────────────
  // Detached: each row waits for its own TTS to settle before it can be
  // deleted (C6), and the card must not linger on the screen for it.
  if (overflow.length > 0) {
    void drainOverflowDeletion({ rows: overflow, deps }).catch((e) => {
      deps.onStage?.("overflow_drain_failed", { error: String(e) });
    });
  }

  // ── 5. Cleanup, then hand the rows on ─────────────────────────────────────
  await finishCleanup(deps);

  const summary: TakeImportSummary = {
    created: created.length,
    dropped: allowance.dropped,
    blockedPremium: allowance.blockedPremium,
    total: live.length,
    limit: deps.limit,
  };
  deps.onImported?.(created, summary);
  return { result: "imported", rows: created, summary };
}

/**
 * The take is done with: drop it from the outbox, drop its recording, and tell
 * the server it may collect the job.
 *
 * Nothing here is allowed to throw. A cleanup that fails leaves the take at
 * `committing`, and the next reconciliation replays the idempotent upsert and
 * tries again — which is strictly better than a half-imported take.
 */
async function finishCleanup(deps: CommitTakeDeps): Promise<void> {
  try {
    await deps.removeTake();
  } catch (e) {
    deps.onStage?.("remove_take_failed", { error: String(e) });
    return;
  }
  try {
    await deps.deleteRecording();
  } catch (e) {
    deps.onStage?.("delete_recording_failed", { error: String(e) });
  }
  void ackOnce(deps);
}

/** Fire-and-forget with exactly one retry (D5). An unacked job just waits a week. */
async function ackOnce(deps: CommitTakeDeps): Promise<void> {
  try {
    await deps.ack();
    return;
  } catch {
    // one retry, below
  }
  try {
    await deps.ack();
  } catch (e) {
    deps.onStage?.("ack_failed", { error: String(e) });
  }
}

// ─── The upsert (pure) ──────────────────────────────────────────────────────

export type ImportDraft = {
  convexId: string;
  draft: Omit<Reminder, "id" | "createdAt">;
};

/**
 * Fold the take's rows into the store by `convexId`.
 *
 * `created` holds every row the take is responsible for, replayed ones
 * included: scheduling and hydration are both idempotent, so re-running them
 * after a crash is the cheap half of the trade that removes the skip-list.
 */
export function upsertByConvexId(
  existing: Reminder[],
  drafts: ImportDraft[],
  opts: { newLocalId: () => string; createdAt: () => string }
): { rows: Reminder[]; created: Reminder[] } {
  const rows = [...existing];
  const indexByConvexId = new Map<string, number>();
  rows.forEach((row, index) => {
    if (row.convexId) indexByConvexId.set(String(row.convexId), index);
  });

  const created: Reminder[] = [];
  for (const { convexId, draft } of drafts) {
    const index = indexByConvexId.get(convexId);
    if (index === undefined) {
      const row: Reminder = {
        ...draft,
        convexId,
        id: opts.newLocalId(),
        createdAt: opts.createdAt(),
      };
      indexByConvexId.set(convexId, rows.length);
      rows.push(row);
      created.push(row);
      continue;
    }
    const merged = mergeImportedRow(rows[index], draft, convexId);
    rows[index] = merged;
    created.push(merged);
  }

  return { rows, created };
}

/**
 * A row that is already here, brought up to date.
 *
 * The local identity survives (the notification triggers and the audio files on
 * disk are keyed by it), and so does anything hydration has already won — a
 * replay must not walk a playable reminder back to `pending`.
 */
export function mergeImportedRow(
  existing: Reminder,
  draft: Omit<Reminder, "id" | "createdAt">,
  convexId: string
): Reminder {
  return {
    ...existing,
    ...draft,
    convexId,
    id: existing.id,
    createdAt: existing.createdAt,
    audioUrl: existing.audioUrl || draft.audioUrl,
    audioStatus: existing.audioStatus ?? draft.audioStatus,
    wavUrl: existing.wavUrl ?? draft.wavUrl,
    preAudioUrl: existing.preAudioUrl ?? draft.preAudioUrl,
    audioExtrasStatus: existing.audioExtrasStatus ?? draft.audioExtrasStatus,
    scheduledFor: existing.scheduledFor ?? draft.scheduledFor,
  };
}

// ─── The overflow deletion queue (C6) ───────────────────────────────────────

/** Backoff between passes. Five waits, ~31s, then the row is left to the server. */
export const OVERFLOW_BACKOFF_MS: readonly number[] = [1000, 2000, 4000, 8000, 16000];

/**
 * Delete the rows the free plan won't let this device keep — but only once each
 * row's audio has settled.
 *
 * Deleting a reminder whose TTS job is mid-write is the race C6 exists for, so
 * a row is only removed when its `audioStatus` is `ready` or `failed`. Rows
 * still pending are re-read on a backoff; a row that never settles is
 * abandoned, which costs a server row nobody can see and no correctness.
 */
export async function drainOverflowDeletion(params: {
  rows: CommittedRow[];
  deps: Pick<CommitTakeDeps, "fetchRows" | "deleteServerRow" | "wait" | "onStage">;
}): Promise<{ deleted: string[]; abandoned: string[] }> {
  const { rows, deps } = params;
  const deleted: string[] = [];
  let pending = rows.map((row) => ({ id: String(row.id), audioStatus: row.audioStatus }));

  for (let attempt = 0; ; attempt++) {
    const waiting: typeof pending = [];
    for (const row of pending) {
      if (row.audioStatus !== "ready" && row.audioStatus !== "failed") {
        waiting.push(row);
        continue;
      }
      try {
        await deps.deleteServerRow(row.id);
        deleted.push(row.id);
      } catch (e) {
        deps.onStage?.("overflow_delete_failed", { error: String(e) });
        waiting.push(row);
      }
    }
    pending = waiting;

    if (pending.length === 0) break;
    if (attempt >= OVERFLOW_BACKOFF_MS.length) break;

    await deps.wait(OVERFLOW_BACKOFF_MS[attempt]);
    const fresh = await deps.fetchRows().catch(() => null);
    if (!fresh) continue;

    const byId = new Map(fresh.map((row) => [String(row.id), row]));
    pending = pending.flatMap((row) => {
      const latest = byId.get(row.id);
      if (!latest) return [row];
      // Already gone — a previous pass, or the user, got there first.
      if (latest.deleted === true) {
        deleted.push(row.id);
        return [];
      }
      return [{ id: row.id, audioStatus: latest.audioStatus }];
    });
  }

  return { deleted, abandoned: pending.map((row) => row.id) };
}
