import AsyncStorage from "@react-native-async-storage/async-storage";

/**
 * The App Store rating prompt (1.0.6).
 *
 * The system prompt only (expo-store-review's requestReview): no pre-prompt,
 * no copy of our own. Asked:
 *
 *   - right after the user marks a reminder that has RUNG as Done (its
 *     occurrence time has passed), from the 2nd time that happens on this
 *     install, counting across launches;
 *   - at most once per app version (the version is written before asking, so a
 *     crash can never make it ask twice);
 *   - only at a calm moment on Home: app active, nothing on screen that the
 *     caller names as a blocker, no alarm still sounding;
 *   - only if the store says it can (`isAvailableAsync`).
 *
 * The Done itself (lib/occurrenceActions.ts completeOccurrence, every route:
 * card, alarm screen, overlay, AlarmKit drain) calls `noteRungDone`; Home
 * listens through `subscribeReviewCheck` and runs `maybeAskForReview` with the
 * real store calls. The "due" flag lives in memory: a Done that cannot be
 * answered in this process (app backgrounded, alarm sounding) waits for the
 * next Home check, not for a later launch.
 *
 * Never throws.
 */

export const RATING_STATE_KEY = "vr.rating.v1";
/** Rung reminders marked Done before the prompt may be asked. */
export const DONES_BEFORE_ASK = 2;

type RatingState = { rungDone: number; askedVersion: string | null };

export type ReviewDecision =
  | "asked"
  | "not_due"
  | "asked_this_version"
  | "no_version"
  | "inactive"
  | "blocked"
  | "sounding"
  | "unavailable"
  | "storage_failed"
  | "busy";

export type ReviewDeps = {
  appVersion: string | null;
  /** AppState is "active". */
  isAppActive: () => boolean;
  /** A non-null string names what is on screen and blocks the ask. */
  blocker: () => string | null;
  /** An alarm is still ringing (pending fallback alarm, or AlarmKit alerting). */
  isAlarmSounding: () => Promise<boolean>;
  isAvailable: () => Promise<boolean>;
  requestReview: () => Promise<void>;
};

let cache: RatingState | null = null;
let due = false;
let inFlight = false;
const listeners = new Set<() => void>();

async function readState(): Promise<RatingState> {
  if (cache) return cache;
  const raw = await AsyncStorage.getItem(RATING_STATE_KEY);
  let parsed: RatingState = { rungDone: 0, askedVersion: null };
  if (raw) {
    try {
      const value = JSON.parse(raw);
      parsed = {
        rungDone: Number.isInteger(value?.rungDone) && value.rungDone > 0 ? value.rungDone : 0,
        askedVersion: typeof value?.askedVersion === "string" ? value.askedVersion : null,
      };
    } catch {
      // Unreadable: start over.
    }
  }
  cache = parsed;
  return parsed;
}

async function writeState(next: RatingState): Promise<void> {
  await AsyncStorage.setItem(RATING_STATE_KEY, JSON.stringify(next));
  cache = next;
}

/** Whether a Done at `now` on an occurrence due at `occurrenceAt` is a rung one. */
export function isRungDone(occurrenceAt: number, now: number): boolean {
  return Number.isFinite(occurrenceAt) && Number.isFinite(now) && occurrenceAt <= now;
}

/** Home listens here; a rung Done asks for a check. */
export function subscribeReviewCheck(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Count a Done. Only a rung reminder counts; from the 2nd one, a check is due. */
export function noteRungDone(occurrenceAt: number, now: number = Date.now()): Promise<void> {
  // One at a time, so two Dones in the same tick both count.
  noteChain = noteChain.then(() => countRungDone(occurrenceAt, now)).catch(() => {});
  return noteChain;
}

let noteChain: Promise<void> = Promise.resolve();

async function countRungDone(occurrenceAt: number, now: number): Promise<void> {
  try {
    if (!isRungDone(occurrenceAt, now)) return;
    const current = await readState();
    const next = { ...current, rungDone: current.rungDone + 1 };
    await writeState(next);
    if (next.rungDone < DONES_BEFORE_ASK) return;
    due = true;
    for (const listener of [...listeners]) {
      try {
        listener();
      } catch {
        // One listener's failure must not stop the others.
      }
    }
  } catch {
    // A missed count is harmless.
  }
}

/** Ask for a rating if a rung Done made it due and everything is calm. */
export async function maybeAskForReview(deps: ReviewDeps): Promise<ReviewDecision> {
  if (!due) return "not_due";
  if (inFlight) return "busy";
  inFlight = true;
  try {
    const version = deps.appVersion?.trim();
    if (!version) {
      due = false;
      return "no_version";
    }
    let current: RatingState;
    try {
      current = await readState();
    } catch {
      return "storage_failed";
    }
    if (current.askedVersion === version) {
      due = false;
      return "asked_this_version";
    }
    if (!deps.isAppActive()) return "inactive";
    if (deps.blocker()) return "blocked";
    try {
      if (await deps.isAlarmSounding()) return "sounding";
    } catch {
      return "sounding"; // Can't tell: treat as sounding and try again later.
    }
    try {
      if (!(await deps.isAvailable())) {
        due = false;
        return "unavailable";
      }
    } catch {
      due = false;
      return "unavailable";
    }
    // The awaits above give the user time to open something; look again.
    if (!deps.isAppActive()) return "inactive";
    if (deps.blocker()) return "blocked";

    try {
      await writeState({ ...current, askedVersion: version });
    } catch {
      return "storage_failed";
    }
    due = false;
    try {
      await deps.requestReview();
    } catch {
      // The system decides whether it shows; nothing to do either way.
    }
    return "asked";
  } finally {
    inFlight = false;
  }
}

/** Test seam: a fresh launch (storage stays). */
export function __resetRatingPromptForTests(): void {
  cache = null;
  due = false;
  inFlight = false;
  noteChain = Promise.resolve();
  listeners.clear();
}
