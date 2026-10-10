import { t } from "./i18n";
import { getCapGateBlockContent } from "./usageGate";
import { languageName } from "./languageNames";
import { formatClockTime, type ClockFormatOptions } from "./time";
import {
  isNeedsTimeTake,
  type PendingErrorKind,
  type PendingPhase,
  type PendingPlan,
} from "./pendingTakes";
import { needsTimeFocus } from "./needsTime";

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
  /**
   * `ask` is a take that is NOT a failure: the server heard a reminder with no
   * usable time and kept it, and the card asks when (founder decision,
   * 2026-10-06). Neutral styling, never the error red.
   */
  tone: "working" | "error" | "ask";
  /**
   * A failed take's quiet second line: `Remi heard: "…"` (OLD-137). Present
   * only on a failed card whose take has a transcript.
   */
  heard?: string;
  /** The reminder an `ask` card is filled in with. Present only on `ask`. */
  ask?: {
    title: string;
    /** The line Remi will say, in the user's language. */
    spokenLine: string;
    emoji?: string;
    /** The take's other reminders, created with the same answer. */
    more?: string;
  };
};

/**
 * What the card asks over a kept reminder. `past_time` names the time the user
 * said, as context, on the dial the rest of the app uses.
 */
export function needsTimePrompt(
  detail: string | undefined,
  pastTime: string | undefined,
  clock: ClockFormatOptions = {}
): string {
  if (detail !== "past_time") return t("pending.ask");
  const named = pastTime ? formatClockTime(pastTime, clock) : "";
  return t("pending.askPastTime", { time: named || t("pending.thatTime") });
}

/** "+1 more: Call mum" / "+2 more: Call mum, Buy milk". */
export function moreRemindersLine(others: readonly PendingPlan[]): string | undefined {
  if (others.length === 0) return undefined;
  return t("pending.moreReminders", {
    count: others.length,
    titles: others.map((plan) => plan.title).join(", "),
  });
}


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
  return t("pending.heard", { quote: quoted });
}

const FAILED_COPY: Record<Exclude<PendingErrorKind, "cap_unverified">, () => string> = {
  network: () => t("pending.failed.network"),
  unparseable: () => t("pending.failed.unparseable"),
  server: () => t("pending.failed.server"),
  // OLD-137: the meter never rose above silence, so nothing was sent. The tap
  // opens a new recording.
  silent: () => t("pending.failed.silent"),
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
      return t("pending.detail.notUnderstood");
    case "no_time":
      return t("pending.detail.noTime");
    case "unsupported_language":
      return t("pending.detail.unsupportedLanguage", {
        language: languageName(take.detectedLanguage) ?? t("pending.thisLanguage"),
      });
    case "past_time": {
      // A one-off whose time had already gone by today ("today at 10", said at
      // 11:41). Named in the dial the rest of the app uses, then the question.
      const named = take.pastTime ? formatClockTime(take.pastTime, clock) : "";
      return t("pending.detail.pastTime", { time: named || t("pending.thatTime") });
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
    pendingPlans?: PendingPlan[];
  },
  limit: number,
  /** The clock dial for a named time. Defaults to the device's; tests pin it. */
  clock: ClockFormatOptions = {}
): PendingCardContent {
  // Not a failure: the reminder is filled in, and the card asks for a time.
  // Swipe still discards it; there is no tap-to-retry and no X.
  const focus = isNeedsTimeTake(take) ? needsTimeFocus(take.pendingPlans) : null;
  if (focus) {
    const more = moreRemindersLine(focus.others);
    return {
      text: needsTimePrompt(take.serverErrorDetail, take.pastTime ?? focus.plan.saidTime, clock),
      shimmer: false,
      tappable: false,
      swipeToDiscard: true,
      cancellable: false,
      tone: "ask",
      ask: {
        title: focus.plan.title,
        spokenLine: focus.plan.description,
        ...(focus.plan.emoji ? { emoji: focus.plan.emoji } : {}),
        ...(more ? { more } : {}),
      },
    };
  }

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
        : detailCopy ?? FAILED_COPY[take.errorKind ?? "server"]();
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
  if (take.phase === "cancelling") return working(t("pending.cancelling"), false);

  // The words are the progress. Nothing to show until the transcript lands, and
  // a transcribed take that somehow has none falls back to the shimmer line.
  if (take.phase === "transcribed" || take.phase === "committing") {
    return working(take.transcript || t("pending.settingUp"));
  }

  return working(t("pending.settingUp"));
}
