/**
 * What the pending card says (spec §2.3).
 *
 * The copy is the contract here, so these read as assertions on sentences. The
 * one that is NOT written out in full is the unverified-entitlement line: it is
 * pinned by usageGate's own tests and shown by two other surfaces, so this
 * suite proves the card DERIVES it rather than restating it (C16).
 */
import { pendingCardContent } from "../../lib/pendingCardContent";
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
