/**
 * Ring lifecycle — the app's own durable record of what happened to each
 * scheduled ring (occurrence) of a reminder. FROZEN CONTRACT: the signatures
 * below are consumed by lib/notifications.ts, app/_layout.tsx, app/index.tsx and
 * the card resolver in lib/remindersMembership.ts. Implement bodies; do not
 * change exported names or shapes without updating every consumer.
 *
 * Why this exists: the card used to derive "Overdue" purely from
 * `now > scheduledTime`, so it went red the instant a ring started, and only
 * learned about Stop/Later on the next foreground. This store is fed by native
 * AlarmKit events (Stop/Later intents, alarm state snapshots) and by the
 * fallback JS alarm path, and the card reads from it first.
 *
 * States, per occurrence (`${reminderId}:${occurrenceAt}`):
 *   ringing → the ring (or one of its comebacks) is alerting or presumed alerting
 *   snoozed → the user tapped Later; `snoozeUntil` is the REAL armed comeback time
 *   done    → Stop / Done for THIS occurrence (terminal; never resurrected)
 *   missed  → the ignored-ring chain was exhausted without an answer (terminal)
 * A Later starts a new chain (`chainId`), so events from a previous chain are
 * stale and ignored. `eventId` de-duplicates replayed native events.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";

export type OccurrenceRef = { reminderId: string; occurrenceAt: number };

export type RingState = "ringing" | "snoozed" | "done" | "missed";

export type RingSource = "alarmkit" | "fallback";

export interface RingRecord extends OccurrenceRef {
    /** `${reminderId}:${occurrenceAt}` */
    key: string;
    state: RingState;
    source: RingSource;
    /** Identity of the current comeback chain. A Later starts a new one. */
    chainId: string;
    /** occurrenceAt for the original chain; the Later tap time for a comeback chain. */
    chainStartedAt: number;
    /** Real armed comeback time while `state === "snoozed"`. */
    snoozeUntil?: number;
    lastFireAt?: number;
    /** Wall-clock of the last event applied; older events for the same chain are ignored. */
    lastEventAt: number;
    lastEventId?: string;
    /** Set when state became done or missed. */
    resolvedAt?: number;
}

export type RingSnapshot = Record<string, RingRecord>;

/** Grace after an occurrence during which an unobserved ring is NOT shown as missed. */
export const UNKNOWN_GRACE_MS = 16 * 60 * 1000;

/** Resolved (done/missed) records older than this are pruned; unresolved ones are kept. */
export const RESOLVED_RETENTION_MS = 2 * 24 * 60 * 60 * 1000;

export const RING_LIFECYCLE_STORAGE_KEY = "@ring_lifecycle_v1";

export function occurrenceKey(ref: OccurrenceRef): string {
    return `${ref.reminderId}:${ref.occurrenceAt}`;
}

interface MarkOpts {
    /** Native/fallback event id for de-duplication. */
    eventId?: string;
    /** Event wall-clock; defaults to Date.now(). */
    at?: number;
}

export interface MarkRingingOpts extends MarkOpts {
    source: RingSource;
    /** Omit to keep the current chain (or start the original chain = occurrenceAt). */
    chainId?: string;
    fireAt?: number;
}

export interface MarkSnoozedOpts extends MarkOpts {
    /** The REAL armed comeback time, never an estimate. */
    snoozeUntil: number;
    /** The new chain started by this Later. */
    chainId: string;
    source?: RingSource;
}

// ─── Module state ────────────────────────────────────────────────────────────
//
// `snapshot` is replaced (never mutated in place) on every change, so React
// consumers see a new reference and re-render. `writeChain` serializes every
// read-modify-write so two concurrent marks can never interleave and clobber
// each other. `appliedEventIds` de-duplicates replayed native events.

let snapshot: RingSnapshot = {};
let hydrated = false;
let hydratePromise: Promise<void> | null = null;
let writeChain: Promise<void> = Promise.resolve();
const listeners = new Set<(snapshot: RingSnapshot) => void>();
const appliedEventIds = new Set<string>();

function notify(): void {
    for (const listener of listeners) listener(snapshot);
}

/**
 * Enqueue a state transition on the serialized write chain. `mutate` runs
 * synchronously against the current snapshot (so it sees every prior queued
 * change) and returns whether it changed anything; only then do we persist and
 * notify. Each mark* resolves AFTER its write lands.
 */
function enqueue(mutate: () => boolean): Promise<void> {
    const run = writeChain.then(async () => {
        const changed = mutate();
        if (!changed) return;
        try {
            await AsyncStorage.setItem(RING_LIFECYCLE_STORAGE_KEY, JSON.stringify(snapshot));
        } catch {
            // A failed persist must not wedge the chain; the in-memory snapshot
            // is still authoritative for this session.
        }
        notify();
    });
    // Keep the chain alive even if a mutate throws, so later marks still run.
    writeChain = run.catch(() => {});
    return run;
}

/** Whether this event was already applied (replay de-dup). */
function isDuplicate(eventId?: string): boolean {
    return eventId !== undefined && appliedEventIds.has(eventId);
}

function remember(eventId?: string): void {
    if (eventId !== undefined) appliedEventIds.add(eventId);
}

function baseRecord(ref: OccurrenceRef, source: RingSource): RingRecord {
    return {
        ...ref,
        key: occurrenceKey(ref),
        state: "ringing",
        source,
        chainId: String(ref.occurrenceAt),
        chainStartedAt: ref.occurrenceAt,
        lastEventAt: 0,
    };
}

function put(record: RingRecord): void {
    snapshot = { ...snapshot, [record.key]: record };
}

// ─── Public API ───────────────────────────────────────────────────────────────

/** Load from AsyncStorage. Idempotent; safe to call repeatedly. */
export async function hydrateRingLifecycle(): Promise<void> {
    if (hydrated) return;
    if (!hydratePromise) {
        hydratePromise = (async () => {
            let loaded: RingSnapshot = {};
            try {
                const raw = await AsyncStorage.getItem(RING_LIFECYCLE_STORAGE_KEY);
                if (raw) {
                    const parsed = JSON.parse(raw) as RingSnapshot;
                    if (parsed && typeof parsed === "object") loaded = parsed;
                }
            } catch {
                loaded = {};
            }
            snapshot = loaded;
            for (const record of Object.values(loaded)) {
                if (record?.lastEventId) appliedEventIds.add(record.lastEventId);
            }
            hydrated = true;
            notify();
        })();
    }
    return hydratePromise;
}

/** Current in-memory snapshot (empty until hydrated). Never mutate the result. */
export function getRingSnapshot(): RingSnapshot {
    return snapshot;
}

/** Subscribe to snapshot changes. Returns an unsubscribe. */
export function subscribeRingLifecycle(listener: (snapshot: RingSnapshot) => void): () => void {
    listeners.add(listener);
    return () => {
        listeners.delete(listener);
    };
}

export function getRingRecord(ref: OccurrenceRef, snapshot: RingSnapshot = getRingSnapshot()): RingRecord | undefined {
    return snapshot[occurrenceKey(ref)];
}

/**
 * Each mark* persists before resolving and notifies subscribers. Ordering rules:
 *  - an event whose `eventId` was already applied is a no-op;
 *  - `done` and `missed` are terminal for the occurrence — later ringing/snoozed
 *    marks for it are ignored (elapsed-time inference must never resurrect Done);
 *  - a mark carrying a chainId different from the record's current chainId
 *    replaces the chain only for `markSnoozed` (a Later) or `markRinging` with an
 *    explicit chainId; events for an older chain are ignored;
 *  - within a chain, an event with `at` older than `lastEventAt` is ignored.
 */
export async function markRinging(ref: OccurrenceRef, opts: MarkRingingOpts): Promise<void> {
    const key = occurrenceKey(ref);
    const at = opts.at ?? Date.now();
    return enqueue(() => {
        if (isDuplicate(opts.eventId)) return false;
        remember(opts.eventId);
        const existing = snapshot[key];
        if (existing && (existing.state === "done" || existing.state === "missed")) {
            // Terminal — a late ring event can never reopen it.
            return false;
        }
        if (existing) {
            const replacingChain = opts.chainId !== undefined && opts.chainId !== existing.chainId;
            if (!replacingChain && at < existing.lastEventAt) {
                // Stale event within the same chain.
                return false;
            }
            put({
                ...existing,
                state: "ringing",
                source: opts.source,
                chainId: replacingChain ? opts.chainId! : existing.chainId,
                chainStartedAt: replacingChain ? at : existing.chainStartedAt,
                snoozeUntil: undefined,
                lastFireAt: opts.fireAt ?? at,
                lastEventAt: at,
                lastEventId: opts.eventId,
                resolvedAt: undefined,
            });
            return true;
        }
        const chainId = opts.chainId ?? String(ref.occurrenceAt);
        put({
            ...baseRecord(ref, opts.source),
            state: "ringing",
            chainId,
            chainStartedAt: opts.chainId !== undefined ? at : ref.occurrenceAt,
            lastFireAt: opts.fireAt ?? at,
            lastEventAt: at,
            lastEventId: opts.eventId,
        });
        return true;
    });
}

export async function markSnoozed(ref: OccurrenceRef, opts: MarkSnoozedOpts): Promise<void> {
    const key = occurrenceKey(ref);
    const at = opts.at ?? Date.now();
    return enqueue(() => {
        if (isDuplicate(opts.eventId)) return false;
        remember(opts.eventId);
        const existing = snapshot[key];
        if (existing && (existing.state === "done" || existing.state === "missed")) {
            // Terminal — never resurrected by a Later.
            return false;
        }
        // A Later always starts a fresh chain and replaces whatever was there.
        put({
            ...(existing ?? baseRecord(ref, opts.source ?? "alarmkit")),
            ...ref,
            key,
            state: "snoozed",
            source: opts.source ?? existing?.source ?? "alarmkit",
            chainId: opts.chainId,
            chainStartedAt: at,
            snoozeUntil: opts.snoozeUntil,
            lastEventAt: at,
            lastEventId: opts.eventId,
            resolvedAt: undefined,
        });
        return true;
    });
}

export async function markDone(ref: OccurrenceRef, opts: MarkOpts = {}): Promise<void> {
    const key = occurrenceKey(ref);
    const at = opts.at ?? Date.now();
    return enqueue(() => {
        if (isDuplicate(opts.eventId)) return false;
        remember(opts.eventId);
        const existing = snapshot[key];
        if (existing?.state === "done") return false; // idempotent
        // Done wins over a prior `missed`: a Stop on a lingering alarm completes it.
        put({
            ...(existing ?? baseRecord(ref, "alarmkit")),
            ...ref,
            key,
            state: "done",
            snoozeUntil: undefined,
            lastEventAt: at,
            lastEventId: opts.eventId,
            resolvedAt: at,
        });
        return true;
    });
}

export async function markMissed(ref: OccurrenceRef, opts: MarkOpts = {}): Promise<void> {
    const key = occurrenceKey(ref);
    const at = opts.at ?? Date.now();
    return enqueue(() => {
        if (isDuplicate(opts.eventId)) return false;
        remember(opts.eventId);
        const existing = snapshot[key];
        if (existing && (existing.state === "done" || existing.state === "missed")) {
            // Done wins; missed is idempotent.
            return false;
        }
        put({
            ...(existing ?? baseRecord(ref, "alarmkit")),
            ...ref,
            key,
            state: "missed",
            snoozeUntil: undefined,
            lastEventAt: at,
            lastEventId: opts.eventId,
            resolvedAt: at,
        });
        return true;
    });
}

export interface OccurrenceState {
    state: RingState | "unknown";
    snoozeUntil?: number;
    chainId?: string;
}

/**
 * Pure. What the card should believe about this occurrence at `now`:
 *  - a record exists → its state (+ snoozeUntil when snoozed);
 *  - no record and `now < occurrenceAt` → "unknown" (not yet due);
 *  - no record and `now >= occurrenceAt` → "unknown" — the caller treats it as
 *    the old overdue rule only after `occurrenceAt + UNKNOWN_GRACE_MS`.
 */
export function resolveOccurrenceState(ref: OccurrenceRef, now: number, snapshot: RingSnapshot): OccurrenceState {
    void now;
    const record = snapshot[occurrenceKey(ref)];
    if (record) {
        return { state: record.state, snoozeUntil: record.snoozeUntil, chainId: record.chainId };
    }
    return { state: "unknown" };
}

/** Drop resolved records older than RESOLVED_RETENTION_MS. Persists. */
export async function pruneRingLifecycle(now: number = Date.now()): Promise<void> {
    return enqueue(() => {
        let changed = false;
        const next: RingSnapshot = {};
        for (const [key, record] of Object.entries(snapshot)) {
            const resolved = record.state === "done" || record.state === "missed";
            if (resolved && record.resolvedAt !== undefined && now - record.resolvedAt > RESOLVED_RETENTION_MS) {
                changed = true;
                continue; // drop it
            }
            next[key] = record;
        }
        if (changed) snapshot = next;
        return changed;
    });
}

/** Test-only: reset memory (does not touch storage). */
export function __resetRingLifecycleForTests(): void {
    snapshot = {};
    hydrated = false;
    hydratePromise = null;
    writeChain = Promise.resolve();
    listeners.clear();
    appliedEventIds.clear();
}
