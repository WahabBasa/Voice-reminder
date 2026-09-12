import AsyncStorage from "@react-native-async-storage/async-storage";

/**
 * The in-app feedback outbox.
 *
 * A note the user writes lives here first and only then travels. It is the same
 * shape as `lib/pendingTakes.ts`: a tiny persisted list on its own AsyncStorage
 * key with a snapshot subscription, plus a pure send loop that takes its network
 * call as an injected function so the tests can drive it without Convex.
 *
 * The single promise the app cares about is `enqueue`: it writes to disk and
 * only then resolves, so a note the user was told is "saved on this phone" is a
 * note that survives the app being killed the next instant. `flush` drains what
 * is queued, oldest first, and stops on the first network failure — a note that
 * could not be sent stays queued for the next trigger rather than being lost.
 *
 * Sent notes are kept for 30 days so the "Your feedback" list can still show
 * them (and the founder's reply), then pruned.
 */

const FEEDBACK_OUTBOX_KEY = "@feedback_outbox";

/** Sent notes linger this long for the status list, then are pruned on load. */
export const SENT_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

export type FeedbackOutboxState = "queued" | "sent";

export type FeedbackContext = Record<string, unknown>;

export type FeedbackOutboxItem = {
  /** Idempotency key — reused as the server's dedupe key on submit. */
  clientId: string;
  text: string;
  createdAt: number;
  context?: FeedbackContext;
  state: FeedbackOutboxState;
  /** When the server accepted it (ms epoch). Only present once `state === "sent"`. */
  sentAt?: number;
};

/** What `flush`'s injected sender is handed — everything the mutation needs bar the device id. */
export type FeedbackSubmitInput = {
  clientId: string;
  text: string;
  createdAt: number;
  context?: FeedbackContext;
};

export type FeedbackSubmitResult = { id: string; duplicate: boolean };

/** The network call, injected so tests (and the component's deviceId binding) own it. */
export type FeedbackSubmit = (input: FeedbackSubmitInput) => Promise<FeedbackSubmitResult>;

/**
 * A short uuid-ish key, minted the same way the take pipeline mints its
 * `creationId` (app/index.tsx `createCreationId`): a base-36 timestamp with two
 * random suffixes. Unique enough for an idempotency key, no native crypto.
 */
export function newFeedbackClientId(): string {
  const rand = () => Math.random().toString(36).slice(2, 10);
  return `${Date.now().toString(36)}${rand()}${rand()}`;
}

// ─── Persistence + snapshot store ───────────────────────────────────────────

let cache: FeedbackOutboxItem[] = [];
let hasLoaded = false;
let loadInFlight: Promise<FeedbackOutboxItem[]> | null = null;
let flushInFlight: Promise<void> | null = null;
const listeners = new Set<() => void>();

/** Stable identity between mutations, so `useSyncExternalStore` can rely on it. */
export function getFeedbackOutboxSnapshot(): FeedbackOutboxItem[] {
  return cache;
}

export function subscribeFeedbackOutbox(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function publish(next: FeedbackOutboxItem[]): void {
  cache = next;
  for (const listener of [...listeners]) listener();
}

function isFeedbackItem(value: unknown): value is FeedbackOutboxItem {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<FeedbackOutboxItem>;
  return (
    typeof item.clientId === "string" &&
    typeof item.text === "string" &&
    typeof item.createdAt === "number" &&
    (item.state === "queued" || item.state === "sent")
  );
}

/** Drop sent notes older than the retention window; queued notes are never pruned. */
function pruneList(list: FeedbackOutboxItem[], now: number): FeedbackOutboxItem[] {
  const cutoff = now - SENT_RETENTION_MS;
  return list.filter(
    (item) => item.state === "queued" || (item.sentAt ?? item.createdAt) >= cutoff
  );
}

async function persist(next: FeedbackOutboxItem[], before: FeedbackOutboxItem[]): Promise<void> {
  publish(next);
  try {
    await AsyncStorage.setItem(FEEDBACK_OUTBOX_KEY, JSON.stringify(next));
  } catch (error) {
    publish(before);
    throw error;
  }
}

/**
 * Read the outbox off disk (once; concurrent callers share the read), pruning
 * expired sent notes as it lands. A corrupt key yields an empty outbox rather
 * than throwing.
 */
export async function loadFeedbackOutbox(
  now: () => number = Date.now
): Promise<FeedbackOutboxItem[]> {
  if (hasLoaded) return cache;
  if (loadInFlight) return loadInFlight;

  loadInFlight = (async () => {
    let loaded: FeedbackOutboxItem[] = [];
    try {
      const raw = await AsyncStorage.getItem(FEEDBACK_OUTBOX_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) loaded = parsed.filter(isFeedbackItem);
      }
    } catch (error) {
      console.log("[VR] feedbackOutbox: load failed, starting empty:", error);
    }
    const pruned = pruneList(loaded, now());
    hasLoaded = true;
    // Only touch disk if pruning actually removed something.
    if (pruned.length !== loaded.length) {
      try {
        await AsyncStorage.setItem(FEEDBACK_OUTBOX_KEY, JSON.stringify(pruned));
      } catch {
        // A failed prune-write is harmless — the note reads fine next time.
      }
    }
    publish(pruned);
    return pruned;
  })();

  try {
    return await loadInFlight;
  } finally {
    loadInFlight = null;
  }
}

async function ensureLoaded(now: () => number): Promise<void> {
  if (!hasLoaded) await loadFeedbackOutbox(now);
}

/**
 * Add a note to the outbox as `queued`, writing to disk BEFORE resolving.
 *
 * This is the whole durability promise: once this resolves, the note is on the
 * phone and will send on the next flush trigger even across a kill. A clientId
 * already present is left untouched (idempotent re-enqueue is a no-op).
 */
export async function enqueue(
  input: FeedbackSubmitInput,
  now: () => number = Date.now
): Promise<FeedbackOutboxItem> {
  await ensureLoaded(now);
  const existing = cache.find((item) => item.clientId === input.clientId);
  if (existing) return existing;

  const item: FeedbackOutboxItem = {
    clientId: input.clientId,
    text: input.text,
    createdAt: input.createdAt,
    ...(input.context ? { context: input.context } : {}),
    state: "queued",
  };
  const before = cache;
  await persist([...before, item], before);
  return item;
}

function markSentInList(
  list: FeedbackOutboxItem[],
  clientId: string,
  sentAt: number
): FeedbackOutboxItem[] {
  return list.map((item) =>
    item.clientId === clientId ? { ...item, state: "sent" as const, sentAt } : item
  );
}

/**
 * Send every queued note, oldest first, through the injected `submit`.
 *
 * A note that submits — including a `duplicate: true`, which means the server
 * already has it — is marked `sent`. The first thrown error (a network drop)
 * stops the drain and leaves that note and everything after it queued, so order
 * is preserved and nothing is dropped. Concurrent callers share one drain, which
 * is what stops a post-enqueue flush and an AppState flush from double-sending.
 */
export async function flush(
  submit: FeedbackSubmit,
  now: () => number = Date.now
): Promise<void> {
  if (flushInFlight) return flushInFlight;

  flushInFlight = (async () => {
    await ensureLoaded(now);
    const queued = cache
      .filter((item) => item.state === "queued")
      .sort((a, b) => a.createdAt - b.createdAt);

    for (const item of queued) {
      try {
        await submit({
          clientId: item.clientId,
          text: item.text,
          createdAt: item.createdAt,
          ...(item.context ? { context: item.context } : {}),
        });
      } catch (error) {
        // Network failure: stop here, keep this and the rest queued.
        break;
      }
      const before = cache;
      await persist(markSentInList(before, item.clientId, now()), before);
    }
  })();

  try {
    await flushInFlight;
  } finally {
    flushInFlight = null;
  }
}

/** True while a note with this clientId is still waiting to send. */
export function isQueued(clientId: string): boolean {
  const item = cache.find((candidate) => candidate.clientId === clientId);
  return item?.state === "queued";
}

/** Drop sent notes past the retention window now, rather than waiting for a reload. */
export async function pruneFeedbackOutbox(now: () => number = Date.now): Promise<void> {
  await ensureLoaded(now);
  const before = cache;
  const next = pruneList(before, now());
  if (next.length === before.length) return;
  await persist(next, before);
}

/** Test seam: forget everything this module is holding. */
export function __resetFeedbackOutbox(): void {
  cache = [];
  hasLoaded = false;
  loadInFlight = null;
  flushInFlight = null;
  listeners.clear();
}

export const FEEDBACK_OUTBOX_STORAGE_KEY = FEEDBACK_OUTBOX_KEY;
