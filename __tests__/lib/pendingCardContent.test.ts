/**
 * What the pending card says (spec §2.3).
 *
 * The copy is the contract here, so these read as assertions on sentences. The
 * one that is NOT written out in full is the unverified-entitlement line: it is
 * pinned by usageGate's own tests and shown by two other surfaces, so this
 * suite proves the card DERIVES it rather than restating it (C16).
 */
import {
  pendingCardContent,
  remiHeardLine,
  REMI_HEARD_MAX_CHARS,
} from "../../lib/pendingCardContent";
import { getCapGateBlockContent } from "../../lib/usageGate";

const LIMIT = 5;

describe("a take that is still working", () => {
  it("shimmers 'Setting up…' from stop-tap until the transcript lands", () => {
    for (const phase of ["recording_saved", "uploading", "processing"] as const) {
      expect(pendingCardContent({ phase }, LIMIT)).toEqual({
        text: "Setting up…",
        shimmer: true,
        tappable: false,
        swipeToDiscard: false,
        cancellable: true,
        tone: "working",
      });
    }
  });

  it("shows the user's own words once they arrive, and keeps them through commit", () => {
    expect(
      pendingCardContent({ phase: "transcribed", transcript: "call mom at six" }, LIMIT).text
    ).toBe("call mom at six");
    expect(
      pendingCardContent({ phase: "committing", transcript: "call mom at six" }, LIMIT).text
    ).toBe("call mom at six");
  });

  it("falls back to the shimmer line if a transcribed take somehow has no words", () => {
    expect(pendingCardContent({ phase: "transcribed" }, LIMIT).text).toBe("Setting up…");
    expect(pendingCardContent({ phase: "transcribed", transcript: "" }, LIMIT).text).toBe(
      "Setting up…"
    );
  });

  it("offers the X in every working phase — that is the only way to stop a take", () => {
    for (const phase of ["recording_saved", "uploading", "processing", "committing"] as const) {
      expect(pendingCardContent({ phase }, LIMIT).cancellable).toBe(true);
    }
  });

  it("spends the X once: a cancel already running does not offer another", () => {
    expect(pendingCardContent({ phase: "cancelling" }, LIMIT)).toEqual({
      text: "Cancelling…",
      shimmer: true,
      tappable: false,
      swipeToDiscard: false,
      cancellable: false,
      tone: "working",
    });
  });
});

describe("a take that failed", () => {
  const failed = (errorKind?: any) => pendingCardContent({ phase: "failed", errorKind }, LIMIT);

  it("names the failure the user can do something about", () => {
    expect(failed("network").text).toBe("Couldn't reach the server — tap to retry");
    expect(failed("unparseable").text).toBe(
      "Couldn't turn that into a reminder — tap to try again"
    );
    expect(failed("server").text).toBe("Something went wrong — tap to retry");
  });

  it("falls back to the generic failure when the kind was lost", () => {
    expect(failed(undefined).text).toBe("Something went wrong — tap to retry");
  });

  it("reuses the cap gate's own unverified copy rather than inventing a third", () => {
    const shared = getCapGateBlockContent("blocked_unverified", LIMIT);

    expect(failed("cap_unverified").text).toBe(shared.statusText);
    // Named explicitly so a change to the shared string is a visible decision,
    // and so no provider is ever named in it.
    expect(failed("cap_unverified").text).toBe(
      "Can't verify your subscription. Check your internet connection and try again."
    );
  });

  it("is tappable and swipeable, and no longer cancellable", () => {
    expect(failed("network")).toMatchObject({
      shimmer: false,
      tappable: true,
      swipeToDiscard: true,
      cancellable: false,
      tone: "error",
    });
  });
});

describe("a sentence the server could not use (OLD-133)", () => {
  const unparseable = (serverErrorDetail?: string, detectedLanguage?: string) =>
    pendingCardContent(
      { phase: "failed", errorKind: "unparseable", serverErrorDetail, detectedLanguage },
      LIMIT
    );

  it("says it did not catch the sentence", () => {
    expect(unparseable("not_understood").text).toBe("Didn't catch that — tap to record again");
  });

  it("asks for the time that was missing", () => {
    expect(unparseable("no_time").text).toBe(
      "When should I remind you? Tap to record again with a time"
    );
  });

  it("names the language Remi does not speak", () => {
    expect(unparseable("unsupported_language", "sv").text).toBe("Remi doesn't speak Swedish yet");
  });

  it("falls back to 'this language' when the language cannot be named", () => {
    expect(unparseable("unsupported_language").text).toBe("Remi doesn't speak this language yet");
    expect(unparseable("unsupported_language", "zz").text).toBe(
      "Remi doesn't speak this language yet"
    );
  });

  it("keeps today's copy for an older server that sends no detail, or a detail this build does not know", () => {
    const today = "Couldn't turn that into a reminder — tap to try again";
    expect(unparseable(undefined).text).toBe(today);
    expect(unparseable("something_new").text).toBe(today);
  });

  it("reads the detail only on an unparseable failure", () => {
    expect(
      pendingCardContent(
        { phase: "failed", errorKind: "server", serverErrorDetail: "not_understood" },
        LIMIT
      ).text
    ).toBe("Something went wrong — tap to retry");
  });

  it("stays a failed card: tappable, swipeable, error tone", () => {
    expect(unparseable("no_time")).toMatchObject({
      shimmer: false,
      tappable: true,
      swipeToDiscard: true,
      cancellable: false,
      tone: "error",
    });
  });
});

describe("a recording the phone heard nothing in (OLD-137)", () => {
  it("points at the microphone, and stays a failed card", () => {
    expect(pendingCardContent({ phase: "failed", errorKind: "silent" }, LIMIT)).toEqual({
      text: "We couldn't hear you — check your microphone and try again",
      shimmer: false,
      tappable: true,
      swipeToDiscard: true,
      cancellable: false,
      tone: "error",
    });
  });
});

describe("what Remi heard, on a failed card (OLD-137)", () => {
  it("quotes the transcript as a quiet second line", () => {
    const content = pendingCardContent(
      { phase: "failed", errorKind: "unparseable", transcript: "Thank you for watching." },
      LIMIT
    );
    expect(content.text).toBe("Couldn't turn that into a reminder — tap to try again");
    expect(content.heard).toBe('Remi heard: "Thank you for watching."');
  });

  it("has no line when there are no words", () => {
    expect(pendingCardContent({ phase: "failed", errorKind: "server" }, LIMIT)).not.toHaveProperty(
      "heard"
    );
    expect(
      pendingCardContent({ phase: "failed", errorKind: "server", transcript: "  \n " }, LIMIT)
    ).not.toHaveProperty("heard");
  });

  it("is only ever on a failed card — a working card shows the words as its text", () => {
    expect(
      pendingCardContent({ phase: "transcribed", transcript: "call mom" }, LIMIT)
    ).not.toHaveProperty("heard");
  });
});

describe("remiHeardLine", () => {
  it("quotes a short transcript whole, with its whitespace tidied", () => {
    expect(remiHeardLine("  call   mom\nat six ")).toBe('Remi heard: "call mom at six"');
  });

  it("keeps exactly the cap without cutting", () => {
    const words = "a".repeat(REMI_HEARD_MAX_CHARS);
    expect(remiHeardLine(words)).toBe(`Remi heard: "${words}"`);
  });

  it("truncates past about 120 characters, ending in an ellipsis", () => {
    expect(REMI_HEARD_MAX_CHARS).toBe(120);
    const long = "remind me to ".repeat(20);
    const line = remiHeardLine(long) as string;
    const quoted = line.slice('Remi heard: "'.length, -1);
    expect(quoted.endsWith("…")).toBe(true);
    expect(quoted.length).toBeLessThanOrEqual(REMI_HEARD_MAX_CHARS);
    expect(long.startsWith(quoted.slice(0, -1))).toBe(true);
  });

  it("is null for anything that is not words", () => {
    expect(remiHeardLine(undefined)).toBeNull();
    expect(remiHeardLine(null)).toBeNull();
    expect(remiHeardLine(42)).toBeNull();
    expect(remiHeardLine("   ")).toBeNull();
  });
});
