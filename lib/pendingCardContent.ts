import { getCapGateBlockContent } from "./usageGate";
import type { PendingErrorKind, PendingPhase } from "./pendingTakes";

/**
 * What the pending card says and what it lets you do (spec §2.3).
 *
 * Pure on purpose: the card component renders this and nothing else, so the
 * copy and the affordances are pinned by tests rather than by reading JSX.
 *
 * The one piece of copy that is NOT written here is the unverified-entitlement
 * block. That wording is already pinned by usageGate's own tests and shown by
 * two other surfaces (the recording overlay's lock, the composer's toast), so
 * this derives it from `getCapGateBlockContent("blocked_unverified", limit)`
 * instead of restating it — a third copy of the same sentence is a third thing
 * to keep in sync (C16).
 */

export type PendingCardContent = {
  /** The line the card shows. */
  text: string;
  /** A working phase: shimmer the text rather than presenting it as final. */
  shimmer: boolean;
  /** Tap = retry dispatch (§2.6). Only ever true on a failed card. */
  tappable: boolean;
  /** Swipe = discard. Only ever true on a failed card. */
  swipeToDiscard: boolean;
  /** The X. Present in every non-terminal phase except the cancel already running (C4). */
  cancellable: boolean;
  tone: "working" | "error";
};

const SETTING_UP = "Setting up…";

const FAILED_COPY: Record<Exclude<PendingErrorKind, "cap_unverified">, string> = {
  network: "Couldn't reach the server — tap to retry",
  unparseable: "Couldn't turn that into a reminder — tap to try again",
  server: "Something went wrong — tap to retry",
};

const working = (text: string, cancellable = true): PendingCardContent => ({
  text,
  shimmer: true,
  tappable: false,
  swipeToDiscard: false,
  cancellable,
  tone: "working",
});

export function pendingCardContent(
  take: { phase: PendingPhase; transcript?: string; errorKind?: PendingErrorKind },
  limit: number
): PendingCardContent {
  if (take.phase === "failed") {
    // An unresolved entitlement is a failed take like any other — it just gets
    // the sentence the rest of the app already uses for it.
    const text =
      take.errorKind === "cap_unverified"
        ? getCapGateBlockContent("blocked_unverified", limit).statusText
        : FAILED_COPY[take.errorKind ?? "server"];

    return {
      text,
      shimmer: false,
      tappable: true,
      swipeToDiscard: true,
      cancellable: false,
      tone: "error",
    };
  }

  // Already cancelling: the X is spent, and offering it again would only invite
  // a second no-op tap.
  if (take.phase === "cancelling") return working("Cancelling…", false);

  // The words are the progress. Nothing to show until the transcript lands, and
  // a transcribed take that somehow has none falls back to the shimmer line.
  if (take.phase === "transcribed" || take.phase === "committing") {
    return working(take.transcript || SETTING_UP);
  }

  return working(SETTING_UP);
}
