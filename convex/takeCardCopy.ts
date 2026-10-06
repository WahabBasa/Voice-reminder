/**
 * What a failed take's card says on the user's phone, worked out on the server
 * so the founder's take email can quote it (founder take emails).
 *
 * This is a MIRROR of the client's copy in lib/pendingCardContent.ts
 * (`pendingCardContent` for a failed card, `remiHeardLine`) and of
 * lib/pendingTakes.ts `errorKindForServerCode`. It is restated here rather than
 * imported because lib/pendingCardContent.ts pulls in client-only modules.
 * __tests__/convex/takeCardCopy.test.ts imports both sides and fails when they
 * drift, so a copy change on the phone has to be made here too.
 *
 * Pure: no Convex, no env.
 */

import { languageName } from "../lib/languageNames";

/** The client's failed-card kinds, minus `cap_unverified` (a local-only block). */
export type CardErrorKind = "network" | "unparseable" | "server" | "silent";

/** Mirrors lib/pendingTakes.ts `errorKindForServerCode`. */
export function cardErrorKindForServerCode(code: string | undefined): CardErrorKind {
  if (code === "unparseable" || code === "parse_failed") return "unparseable";
  return "server";
}

/** Mirrors `FAILED_COPY` in lib/pendingCardContent.ts. */
export const FAILED_CARD_COPY: Record<CardErrorKind, string> = {
  network: "Couldn't reach the server — tap to retry",
  unparseable: "Couldn't turn that into a reminder — tap to try again",
  server: "Something went wrong — tap to retry",
  silent: "We couldn't hear you — check your microphone and try again",
};

/**
 * Mirrors `unparseableDetailCopy` in lib/pendingCardContent.ts. `past_time` is
 * the guard's newest reason (the time the user said is already behind them);
 * `pastTime` is the clock time it named, when the server sent one.
 */
function detailCopy(
  detail: string | undefined,
  detectedLanguage: string | undefined,
  pastTime: string | undefined
): string | null {
  switch (detail) {
    case "not_understood":
      return "Didn't catch that — tap to record again";
    case "no_time":
      return "When should I remind you? Tap to record again with a time";
    case "unsupported_language":
      return `Remi doesn't speak ${languageName(detectedLanguage) ?? "this language"} yet`;
    case "past_time":
      return `${pastTime || "That time"} has already passed today. When should I remind you? Tap to record again.`;
    default:
      return null;
  }
}

/**
 * Mirrors `needsTimePrompt` in lib/pendingCardContent.ts: what the card asks
 * over a `no_time`/`past_time` take it kept, in place of a failure line. Null
 * for every other detail.
 */
export function askCardPrompt(
  detail: string | undefined,
  pastTime: string | undefined
): string | null {
  if (detail === "no_time") return "When should I remind you?";
  if (detail === "past_time") {
    return `${pastTime || "That time"} has already passed today. When should I remind you?`;
  }
  return null;
}

/** The failed card's main line for a client error kind and a server detail. */
export function failedCardCopy(input: {
  errorKind: CardErrorKind;
  errorDetail?: string;
  detectedLanguage?: string;
  pastTime?: string;
}): string {
  const fromDetail =
    input.errorKind === "unparseable"
      ? detailCopy(input.errorDetail, input.detectedLanguage, input.pastTime)
      : null;
  return fromDetail ?? FAILED_CARD_COPY[input.errorKind];
}

/** The failed card's main line for a server failure, as the phone derives it. */
export function phoneCopyForServerFailure(input: {
  errorCode?: string;
  errorDetail?: string;
  detectedLanguage?: string;
  pastTime?: string;
}): string {
  return failedCardCopy({ ...input, errorKind: cardErrorKindForServerCode(input.errorCode) });
}

/** Mirrors `REMI_HEARD_MAX_CHARS` in lib/pendingCardContent.ts. */
export const CARD_HEARD_MAX_CHARS = 120;

/** Mirrors `remiHeardLine` in lib/pendingCardContent.ts: the card's quiet second line. */
export function cardHeardLine(transcript: unknown): string | null {
  if (typeof transcript !== "string") return null;
  const words = transcript.trim().replace(/\s+/g, " ");
  if (!words) return null;
  const quoted =
    words.length > CARD_HEARD_MAX_CHARS
      ? `${words.slice(0, CARD_HEARD_MAX_CHARS - 1).trimEnd()}…`
      : words;
  return `Remi heard: "${quoted}"`;
}
