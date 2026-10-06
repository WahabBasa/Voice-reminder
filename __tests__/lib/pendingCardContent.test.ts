/**
 * What the pending card says (spec §2.3).
 *
 * The copy is the contract here, so these read as assertions on sentences. The
 * one that is NOT written out in full is the unverified-entitlement line: it is
 * pinned by usageGate's own tests and shown by two other surfaces, so this
 * suite proves the card DERIVES it rather than restating it (C16).
 */
import {
  moreRemindersLine,
  needsTimePrompt,
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

  describe("a one-off whose time had already passed (past_time)", () => {
    const past = (pastTime: string | undefined, hour12: boolean) =>
      pendingCardContent(
        { phase: "failed", errorKind: "unparseable", serverErrorDetail: "past_time", pastTime },
        LIMIT,
        { hour12 }
      );

    it("names the time on a 24-hour dial and asks when", () => {
      expect(past("10:00", false).text).toBe(
        "10:00 has already passed today. When should I remind you? Tap to record again."
      );
    });

    it("names the time on a 12-hour dial with its meridiem", () => {
      expect(past("10:00", true).text).toBe(
        "10:00 am has already passed today. When should I remind you? Tap to record again."
      );
    });

    it("still asks when the server sent no time", () => {
      expect(past(undefined, false).text).toBe(
        "That time has already passed today. When should I remind you? Tap to record again."
      );
    });

    it("is a failed card the user taps to record again", () => {
      expect(past("10:00", false)).toMatchObject({
        shimmer: false,
        tappable: true,
        swipeToDiscard: true,
        tone: "error",
      });
    });
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

// ─── "When should I remind you?" (founder decision, 2026-10-06) ─────────────

describe("a take the server kept for want of a time", () => {
  const dentist = {
    title: "Call the dentist",
    description: "Ring tandläkaren.",
    emoji: "🦷",
    lang: "sv",
    frequency: "once",
    needsTime: true,
  };
  const pills = {
    title: "Pills",
    description: "Take your pills.",
    frequency: "daily",
    needsTime: false,
  };
  const asking = (
    serverErrorDetail: string,
    over: Record<string, unknown> = {},
    clock: { hour12?: boolean } = { hour12: false }
  ) =>
    pendingCardContent(
      {
        phase: "failed",
        errorKind: "unparseable",
        serverErrorDetail,
        transcript: "ring tandläkaren",
        pendingPlans: [dentist],
        ...over,
      } as Parameters<typeof pendingCardContent>[0],
      LIMIT,
      clock
    );

  it("no_time: the reminder filled in, and the question — not a failure", () => {
    expect(asking("no_time")).toEqual({
      text: "When should I remind you?",
      shimmer: false,
      tappable: false,
      swipeToDiscard: true,
      cancellable: false,
      tone: "ask",
      ask: { title: "Call the dentist", spokenLine: "Ring tandläkaren.", emoji: "🦷" },
    });
  });

  it("never wears the failure styling or the failure's Remi-heard line", () => {
    for (const detail of ["no_time", "past_time"]) {
      const content = asking(detail);
      expect(content.tone).toBe("ask");
      expect(content).not.toHaveProperty("heard");
      expect(content.tappable).toBe(false);
    }
  });

  it("past_time: keeps the time they said visible as context", () => {
    expect(asking("past_time", { pastTime: "10:00" }).text).toBe(
      "10:00 has already passed today. When should I remind you?"
    );
    expect(asking("past_time", { pastTime: "10:00" }, { hour12: true }).text).toBe(
      "10:00 am has already passed today. When should I remind you?"
    );
  });

  it("past_time: falls back to the plan's said time, then to 'That time'", () => {
    expect(
      asking("past_time", { pendingPlans: [{ ...dentist, saidTime: "09:30" }] }).text
    ).toBe("09:30 has already passed today. When should I remind you?");
    expect(asking("past_time").text).toBe(
      "That time has already passed today. When should I remind you?"
    );
  });

  it("a take of several shows the one waiting for a time and lists the rest", () => {
    const content = asking("no_time", { pendingPlans: [pills, dentist] });
    expect(content.ask).toEqual({
      title: "Call the dentist",
      spokenLine: "Ring tandläkaren.",
      emoji: "🦷",
      more: "+1 more: Pills",
    });
    expect(
      asking("no_time", {
        pendingPlans: [pills, dentist, { ...pills, title: "Milk" }],
      }).ask?.more
    ).toBe("+2 more: Pills, Milk");
  });

  it("a reminder with no emoji has no emoji key", () => {
    const { emoji: _emoji, ...plain } = dentist;
    expect(asking("no_time", { pendingPlans: [plain] }).ask).toEqual({
      title: "Call the dentist",
      spokenLine: "Ring tandläkaren.",
    });
  });

  it("without kept plans (an older server) it is the record-again card it always was", () => {
    expect(asking("no_time", { pendingPlans: undefined })).toMatchObject({
      tone: "error",
      tappable: true,
      text: "When should I remind you? Tap to record again with a time",
    });
    expect(asking("no_time", { pendingPlans: [] }).tone).toBe("error");
  });

  it("only these two details ask; any other keeps its own failure", () => {
    expect(asking("not_understood").tone).toBe("error");
    expect(asking("no_time", { errorKind: "server" }).tone).toBe("error");
  });
});

describe("needsTimePrompt and moreRemindersLine", () => {
  it("the prompt defaults to the device's dial", () => {
    expect(needsTimePrompt("no_time", undefined)).toBe("When should I remind you?");
    expect(needsTimePrompt("past_time", undefined)).toBe(
      "That time has already passed today. When should I remind you?"
    );
  });

  it("no line when the take holds only the one reminder", () => {
    expect(moreRemindersLine([])).toBeUndefined();
  });
});
