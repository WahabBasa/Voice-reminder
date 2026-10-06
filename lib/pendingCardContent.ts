import { getCapGateBlockContent } from "./usageGate";
import { languageName } from "./languageNames";
import { formatClockTime, type ClockFormatOptions } from "./time";
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
  /**
   * A failed take's quiet second line: `Remi heard: "…"` (OLD-137). Present
   * only on a failed card whose take has a transcript.
   */
  heard?: string;
};

const SETTING_UP = "Setting up…";

/** How much of the transcript the "Remi heard" line quotes before it truncates. */
export const REMI_HEARD_MAX_CHARS = 120;

/**
 * `Remi heard: "…"` for a transcript, quoting at most `REMI_HEARD_MAX_CHARS`
 * characters of it and ending a cut one with an ellipsis. Null when there is
 * nothing to quote. Shared by the failed card and the feedback composer.
 */
export function remiHeardLine(transcript: unknown): string | null {
  if (typeof transcript !== "string") return null;
  const words = transcript.trim().replace(/\s+/g, " ");
  if (!words) return null;
  const quoted =
    words.length > REMI_HEARD_MAX_CHARS
      ? `${words.slice(0, REMI_HEARD_MAX_CHARS - 1).trimEnd()}…`
      : words;
  return `Remi heard: "${quoted}"`;
}

const FAILED_COPY: Record<Exclude<PendingErrorKind, "cap_unverified">, string> = {
  network: "Couldn't reach the server — tap to retry",
  unparseable: "Couldn't turn that into a reminder — tap to try again",
  server: "Something went wrong — tap to retry",
  // OLD-137: the meter never rose above silence, so nothing was sent. The tap
  // opens a new recording.
  silent: "We couldn't hear you — check your microphone and try again",
};

/**
 * The server's reason for a sentence it could not use (OLD-133). Each line
 * points at a new recording, because that is what the card's tap now does for
 * these. A detail this build does not know, or none at all (an older server),
 * keeps the generic `unparseable` line.
 */
function unparseableDetailCopy(
  detail: string | undefined,
  take: { detectedLanguage?: string; pastTime?: string },
  clock: ClockFormatOptions
): string | null {
  switch (detail) {
    case "not_understood":
      return "Didn't catch that — tap to record again";
    case "no_time":
      return "When should I remind you? Tap to record again with a time";
    case "unsupported_language":
      return `Remi doesn't speak ${languageName(take.detectedLanguage) ?? "this language"} yet`;
    case "past_time": {
      // A one-off whose time had already gone by today ("today at 10", said at
      // 11:41). Named in the dial the rest of the app uses, then the question.
      const named = take.pastTime ? formatClockTime(take.pastTime, clock) : "";
      return `${named || "That time"} has already passed today. When should I remind you? Tap to record again.`;
    }
    default:
      return null;
  }
}

const working = (text: string, cancellable = true): PendingCardContent => ({
  text,
  shimmer: true,
  tappable: false,
  swipeToDiscard: false,
  cancellable,
  tone: "working",
});

export function pendingCardContent(
  take: {
    phase: PendingPhase;
    transcript?: string;
    errorKind?: PendingErrorKind;
    serverErrorDetail?: string;
    detectedLanguage?: string;
    pastTime?: string;
  },
  limit: number,
  /** The clock dial for a named time. Defaults to the device's; tests pin it. */
  clock: ClockFormatOptions = {}
): PendingCardContent {
  if (take.phase === "failed") {
    // An unresolved entitlement is a failed take like any other — it just gets
    // the sentence the rest of the app already uses for it.
    const detailCopy =
      take.errorKind === "unparseable"
        ? unparseableDetailCopy(take.serverErrorDetail, take, clock)
        : null;
    const text =
      take.errorKind === "cap_unverified"
        ? getCapGateBlockContent("blocked_unverified", limit).statusText
        : detailCopy ?? FAILED_COPY[take.errorKind ?? "server"];
    const heard = remiHeardLine(take.transcript);

    return {
      text,
      shimmer: false,
      tappable: true,
      swipeToDiscard: true,
      cancellable: false,
      tone: "error",
      ...(heard ? { heard } : {}),
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
