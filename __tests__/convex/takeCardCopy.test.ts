/**
 * Drift guard: the founder's take email quotes what the failed card said on the
 * phone, from a server-side mirror (convex/takeCardCopy.ts) of the client's
 * copy (lib/pendingCardContent.ts, lib/pendingTakes.ts). This imports both and
 * fails the moment they disagree, so a copy change on one side has to be made
 * on the other.
 */

import {
  askCardPrompt,
  FAILED_CARD_COPY,
  CARD_HEARD_MAX_CHARS,
  cardErrorKindForServerCode,
  cardHeardLine,
  failedCardCopy,
  phoneCopyForServerFailure,
  type CardErrorKind,
} from "../../convex/takeCardCopy";
import {
  REMI_HEARD_MAX_CHARS,
  needsTimePrompt,
  pendingCardContent,
  remiHeardLine,
} from "../../lib/pendingCardContent";
import { errorKindForServerCode } from "../../lib/pendingTakes";

const KINDS: CardErrorKind[] = ["network", "unparseable", "server", "silent"];
const DETAILS = [undefined, "not_understood", "no_time", "unsupported_language", "past_time", "made_up"];
const LANGUAGES = [undefined, "sv", "ar", "en-US", "xx"];
const PAST_TIMES = [undefined, "09:00"];

function clientCopy(
  errorKind: CardErrorKind,
  detail: string | undefined,
  detectedLanguage: string | undefined,
  pastTime: string | undefined
): string {
  return pendingCardContent(
    {
      phase: "failed",
      errorKind,
      serverErrorDetail: detail,
      detectedLanguage,
      // The past_time copy's field (being added on the client); extra on older shapes.
      ...({ pastTime } as object),
    } as Parameters<typeof pendingCardContent>[0],
    3,
    // The email names the time on the 24-hour dial; pin the card to the same
    // dial so the comparison doesn't follow the CI machine's locale.
    { hour12: false }
  ).text;
}

describe("the server's card copy mirrors the client's", () => {
  it("maps every server error code to the same card kind", () => {
    for (const code of [
      undefined,
      "unparseable",
      "parse_failed",
      "stt_failed",
      "storage_missing",
      "internal",
      "anything",
    ]) {
      expect(cardErrorKindForServerCode(code)).toBe(errorKindForServerCode(code));
    }
  });

  it("says the same line for every kind × detail × language", () => {
    for (const kind of KINDS) {
      for (const detail of DETAILS) {
        if (detail === "past_time") continue; // its own test below
        for (const lang of LANGUAGES) {
          expect(failedCardCopy({ errorKind: kind, errorDetail: detail, detectedLanguage: lang })).toBe(
            clientCopy(kind, detail, lang, undefined)
          );
        }
      }
    }
  });

  it("says the same past_time line, once the client has one", () => {
    const generic = FAILED_CARD_COPY.unparseable;
    for (const pastTime of PAST_TIMES) {
      const client = clientCopy("unparseable", "past_time", undefined, pastTime);
      if (client === generic) {
        // The client build in this tree predates `past_time`; nothing to compare yet.
        continue;
      }
      expect(failedCardCopy({ errorKind: "unparseable", errorDetail: "past_time", pastTime })).toBe(client);
    }
    // Non-unparseable kinds never use a detail, past_time included.
    expect(failedCardCopy({ errorKind: "server", errorDetail: "past_time" })).toBe(
      clientCopy("server", "past_time", undefined, undefined)
    );
  });

  it("covers silent and the plain kinds with the client's exact words", () => {
    for (const kind of KINDS) {
      expect(FAILED_CARD_COPY[kind]).toBe(clientCopy(kind, undefined, undefined, undefined));
    }
  });

  it("derives the phone copy for a server failure the way the phone does", () => {
    expect(phoneCopyForServerFailure({ errorCode: "unparseable", errorDetail: "not_understood" })).toBe(
      "Didn't catch that — tap to record again"
    );
    expect(
      phoneCopyForServerFailure({
        errorCode: "unparseable",
        errorDetail: "unsupported_language",
        detectedLanguage: "sv",
      })
    ).toBe("Remi doesn't speak Swedish yet");
    expect(phoneCopyForServerFailure({ errorCode: "stt_failed" })).toBe(
      "Something went wrong — tap to retry"
    );
    expect(phoneCopyForServerFailure({ errorCode: "unparseable", errorDetail: "past_time" })).toBe(
      "That time has already passed today. When should I remind you? Tap to record again."
    );
  });

  it("quotes the transcript in the same 'Remi heard' line", () => {
    expect(CARD_HEARD_MAX_CHARS).toBe(REMI_HEARD_MAX_CHARS);
    for (const transcript of [
      undefined,
      "",
      "   ",
      "Remind me to call mom",
      "  spaced\n\nout   words ",
      "x".repeat(300),
      42,
    ]) {
      expect(cardHeardLine(transcript)).toBe(remiHeardLine(transcript));
    }
  });

  it("asks the same 'When should I remind you?' over a kept take", () => {
    for (const detail of ["no_time", "past_time"]) {
      for (const pastTime of PAST_TIMES) {
        expect(askCardPrompt(detail, pastTime)).toBe(
          needsTimePrompt(detail, pastTime, { hour12: false })
        );
      }
    }
    for (const detail of [undefined, "not_understood", "unsupported_language"]) {
      expect(askCardPrompt(detail, undefined)).toBeNull();
    }
  });
});
