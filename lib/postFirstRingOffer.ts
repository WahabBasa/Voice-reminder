import AsyncStorage from "@react-native-async-storage/async-storage";
import { readProStatus } from "./purchases";
import { getPendingAlarm } from "./notifications";
import { getAlarmStates } from "./alarmKit";
import { vrLog } from "./vrLog";

/**
 * The one-time trial offer after a user's first reminder rings.
 *
 * Almost nobody reaches the free cap, so almost nobody ever saw the paywall.
 * The moment right after the first spoken alarm is where it belongs: the user
 * just heard what Remi does. Shown once per install, only to a confirmed free
 * user, and only at a calm moment on Home — never over a ringing alarm, the
 * recorder, the consent card or the first-launch language wheel (Home isn't
 * mounted while the wheel is up).
 *
 * Two flags on disk:
 *   - "rang": some alarm occurrence has rung on this install. Set by the
 *     overlay path (AlarmOverlayFallback shows) and the AlarmKit path
 *     (reconcileRings sees an alerting/stopped/snoozed event or a live
 *     alerting alarm). Rings before this shipped aren't counted, so existing
 *     users get the offer once, after their next ring.
 *   - "shown": the offer has been opened. Written before the paywall opens, so
 *     a crash can never make it show twice.
 */

const RANG_KEY = "@post_first_ring_offer_rang";
const SHOWN_KEY = "@post_first_ring_offer_shown";

/** `source` param the paywall receives, and the value its log line carries. */
export const POST_FIRST_RING_SOURCE = "post_first_ring";

export type RingSource = "overlay" | "alarmkit";

export type OfferDecision =
  | "shown"
  | "already_shown"
  | "no_ring"
  | "blocked"
  | "ringing"
  | "pro"
  | "status_unknown"
  | "busy"
  | "storage_failed";

// In-memory mirrors so the 30 s tick costs nothing once the offer is settled.
let rangCache: boolean | null = null;
let shownCache: boolean | null = null;
let inFlight = false;

async function readFlag(key: string): Promise<boolean> {
  const raw = await AsyncStorage.getItem(key);
  return raw !== null;
}

async function hasRung(): Promise<boolean> {
  if (rangCache === true) return true;
  rangCache = await readFlag(RANG_KEY);
  return rangCache;
}

async function wasShown(): Promise<boolean> {
  if (shownCache === true) return true;
  shownCache = await readFlag(SHOWN_KEY);
  return shownCache;
}

/** Record that an alarm occurrence rang. Idempotent and never throws. */
export async function noteRing(source: RingSource): Promise<void> {
  try {
    if (await hasRung()) return;
    await AsyncStorage.setItem(RANG_KEY, String(Date.now()));
    rangCache = true;
    vrLog("offer", "first_ring_noted", { source });
  } catch (e) {
    vrLog("offer", "note_ring_failed", { source, error: String(e) });
  }
}

type CheckListener = (reason: string) => void;
const listeners = new Set<CheckListener>();

/** Home listens here; the overlay asks for a check once it has closed. */
export function subscribeOfferCheck(listener: CheckListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function requestOfferCheck(reason: string): void {
  for (const listener of [...listeners]) {
    try {
      listener(reason);
    } catch {
      // A listener's failure must not stop the others.
    }
  }
}

async function isAlarmRinging(): Promise<boolean> {
  try {
    const pending = await getPendingAlarm();
    if (pending && !pending.resolvedAt) return true;
  } catch {
    return true; // Can't tell: treat as ringing and try again later.
  }
  try {
    const states = await getAlarmStates();
    return states.some((s) => s.state === "alerting");
  } catch {
    return true;
  }
}

export interface OfferCheckOptions {
  reason: string;
  /** A non-null string names what is on screen and blocks the offer. */
  blocker: () => string | null;
  /** Opens the paywall with `source=post_first_ring`. */
  open: () => void;
}

/**
 * Show the offer if everything lines up; otherwise skip silently so a later
 * check (next focus, foreground, tick, overlay close) can try again.
 */
export async function maybeShowPostFirstRingOffer(opts: OfferCheckOptions): Promise<OfferDecision> {
  if (inFlight) return "busy";
  inFlight = true;
  try {
    try {
      if (await wasShown()) return "already_shown";
      if (!(await hasRung())) return "no_ring";
    } catch {
      return "storage_failed";
    }

    const blockedBy = opts.blocker();
    if (blockedBy) {
      vrLog("offer", "skipped", { reason: opts.reason, why: "blocked", blocker: blockedBy });
      return "blocked";
    }
    if (await isAlarmRinging()) {
      vrLog("offer", "skipped", { reason: opts.reason, why: "ringing" });
      return "ringing";
    }

    const status = await readProStatus();
    if (status === "pro") return "pro";
    if (status !== "free") {
      vrLog("offer", "skipped", { reason: opts.reason, why: "status_unknown" });
      return "status_unknown";
    }

    // The awaits above give the user time to open something; look again.
    const lateBlocker = opts.blocker();
    if (lateBlocker) {
      vrLog("offer", "skipped", { reason: opts.reason, why: "blocked", blocker: lateBlocker });
      return "blocked";
    }

    try {
      await AsyncStorage.setItem(SHOWN_KEY, String(Date.now()));
      shownCache = true;
    } catch (e) {
      vrLog("offer", "skipped", { reason: opts.reason, why: "storage_failed", error: String(e) });
      return "storage_failed";
    }

    vrLog("offer", "shown", { reason: opts.reason, source: POST_FIRST_RING_SOURCE });
    opts.open();
    return "shown";
  } finally {
    inFlight = false;
  }
}

/** Test seam. */
export function __resetPostFirstRingOfferForTests(): void {
  rangCache = null;
  shownCache = null;
  inFlight = false;
  listeners.clear();
}
