import fs from "fs";
import path from "path";

import {
  CATCH_NAME_SLOT,
  SPEECH_CATCHES,
  applySpeechCatch,
  catchCandidateOrder,
  catchLanguageFor,
  eligibleCatches,
  renderCatch,
  selectCatchIds,
  weightedCatchOrder,
  withSpeechCatch,
} from "../../convex/speechCatch";
import { BANNED_OPENERS, hasBannedOpener } from "../../convex/helpers";
import { speakFirstFiringLines } from "../../convex/actions";

const ids = (entries: { id: string }[]) => entries.map((entry) => entry.id);
const texts = (language: "en" | "ar", named: boolean) =>
  SPEECH_CATCHES.filter(
    (entry) =>
      entry.language === language &&
      entry.text.includes(CATCH_NAME_SLOT) === named
  ).map((entry) => entry.text);

// A random() that hands back the same draw every time: weightedCatchOrder then
// sorts purely by weight, which is what makes the order assertable.
const flatRandom = () => 0.5;
// Draws in sequence, so a specific permutation can be forced.
const scriptedRandom = (values: number[]) => {
  let index = 0;
  return () => values[index++ % values.length];
};

// ─── the approved pools ─────────────────────────────────────────────────────

describe("SPEECH_CATCHES", () => {
  it("holds exactly the approved English address-free catches", () => {
    expect(texts("en", false)).toEqual([
      "Heads up —",
      "Just a heads up —",
      "By the way,",
      "Just so you know,",
      "Real quick —",
      "Quick thing —",
      "Small thing —",
      "One thing —",
      "Remember,",
      "Don't forget,",
    ]);
  });

  it("holds exactly the approved Arabic address-free catches", () => {
    expect(texts("ar", false)).toEqual([
      "انتبه،",
      "على فكرة،",
      "بالمناسبة،",
      "لحظة،",
      "دقيقة،",
      "تذكر،",
      "لا تنسى،",
    ]);
  });

  // Pinned verbatim like the address-free pools: a name form is what the user
  // actually hears their own name inside, so pool drift has to fail loudly.
  it("holds exactly the approved English name-bearing catches", () => {
    expect(texts("en", true)).toEqual([
      "{name} —",
      "Heads up, {name} —",
      "By the way, {name} —",
      "Quick thing, {name} —",
    ]);
  });

  it("holds exactly the approved Arabic name-bearing catches", () => {
    expect(texts("ar", true)).toEqual([
      "يا {name}،",
      "يا {name}، انتبه،",
      "على فكرة يا {name}،",
      "يا {name}، تذكر،",
    ]);
  });

  it("spans exactly the two supported languages, ids included", () => {
    expect(new Set(SPEECH_CATCHES.map((entry) => entry.language))).toEqual(
      new Set(["en", "ar"])
    );
    expect(new Set(ids(SPEECH_CATCHES).map((id) => id.split(".")[0]))).toEqual(
      new Set(["en", "ar"])
    );
  });

  it("keeps every name form's slot so a name can actually land in it", () => {
    for (const entry of SPEECH_CATCHES.filter((c) => c.text.includes(CATCH_NAME_SLOT))) {
      expect(renderCatch(entry.id, "Wahab")).toContain("Wahab");
      expect(renderCatch(entry.id, "Wahab")).not.toContain(CATCH_NAME_SLOT);
    }
  });

  it("uses stable, unique, language-prefixed ids (they get persisted)", () => {
    const seen = ids(SPEECH_CATCHES);
    expect(new Set(seen).size).toBe(seen.length);
    for (const entry of SPEECH_CATCHES) {
      expect(entry.id.startsWith(`${entry.language}.`)).toBe(true);
    }
  });

  // Persona rule: this assistant never forgets, so no catch may suggest it
  // might have. "Before I forget" was rejected by name.
  it("never implies the assistant's own memory failed", () => {
    for (const entry of SPEECH_CATCHES) {
      expect(entry.text.toLowerCase()).not.toContain("before i forget");
      expect(entry.text.toLowerCase()).not.toContain("i forgot");
      expect(entry.text).not.toContain("نسيت");
    }
  });

  it("weights 'Don't forget' below the ordinary catches", () => {
    const dontForget = SPEECH_CATCHES.find((entry) => entry.id === "en.dont-forget")!;
    const headsUp = SPEECH_CATCHES.find((entry) => entry.id === "en.heads-up")!;
    expect(dontForget.weight).toBeLessThan(headsUp.weight);
    // Arabic counterpart is held to the same lower weight.
    expect(SPEECH_CATCHES.find((entry) => entry.id === "ar.la-tansa")!.weight).toBe(
      dontForget.weight
    );
  });

  it("weights name-bearing catches above address-free ones", () => {
    const named = SPEECH_CATCHES.filter((entry) => entry.text.includes(CATCH_NAME_SLOT));
    const plain = SPEECH_CATCHES.filter((entry) => !entry.text.includes(CATCH_NAME_SLOT));
    const heaviestPlain = Math.max(...plain.map((entry) => entry.weight));
    for (const entry of named) {
      expect(entry.weight).toBeGreaterThan(heaviestPlain);
    }
  });
});

// ─── language ───────────────────────────────────────────────────────────────

describe("catchLanguageFor", () => {
  it("reads an Arabic payload as Arabic", () => {
    expect(catchLanguageFor("دواؤك المسائي بانتظارك.")).toBe("ar");
  });

  it("reads an English payload as English", () => {
    expect(catchLanguageFor("Your evening medicine is still sitting there.")).toBe("en");
  });

  // Majority, not "contains any": a loanword left in Latin script does not make
  // an Arabic line English, and one Arabic word does not make an English line
  // Arabic — an Arabic catch glued onto an English line reads as two languages.
  it("goes by the majority script of a mixed payload", () => {
    expect(catchLanguageFor("Zoom اجتماع مع أحمد")).toBe("ar");
    expect(catchLanguageFor("Pick up the دواء from the pharmacy")).toBe("en");
  });

  it("gives a tie to English", () => {
    expect(catchLanguageFor("abcd أحمد")).toBe("en");
  });

  // The address term is the user's own word, woven in verbatim by the model in
  // whatever script they wrote it — never a signal about the line's language.
  it("ignores an Arabic address term inside an English payload", () => {
    expect(
      catchLanguageFor("وهاب, your meeting with Ahmed starts soon", "وهاب")
    ).toBe("en");
  });

  it("ignores every occurrence of the address term, not just the first", () => {
    expect(catchLanguageFor("وهاب, the car is ready, وهاب", "وهاب")).toBe("en");
  });

  it("still reads a genuinely Arabic payload as Arabic when the term is Arabic", () => {
    expect(catchLanguageFor("يا وهاب، دواؤك المسائي بانتظارك.", "وهاب")).toBe("ar");
  });

  it("falls back to English for an empty payload", () => {
    expect(catchLanguageFor("")).toBe("en");
    expect(catchLanguageFor(undefined)).toBe("en");
  });
});

// ─── eligibility ────────────────────────────────────────────────────────────

describe("eligibleCatches", () => {
  it("offers only the payload's language", () => {
    for (const entry of eligibleCatches("ar", "وهاب")) {
      expect(entry.language).toBe("ar");
    }
    for (const entry of eligibleCatches("en", "Wahab")) {
      expect(entry.language).toBe("en");
    }
  });

  it("holds back the name forms when no address term is set", () => {
    for (const entry of eligibleCatches("en")) {
      expect(entry.text).not.toContain(CATCH_NAME_SLOT);
    }
    expect(eligibleCatches("en")).toHaveLength(10);
    expect(eligibleCatches("ar")).toHaveLength(7);
  });

  it("adds the name forms once an address term exists", () => {
    const named = eligibleCatches("en", "Wahab");
    expect(named.length).toBeGreaterThan(eligibleCatches("en").length);
    expect(ids(named)).toContain("en.name");
  });

  it("treats a whitespace-only address term as unset", () => {
    expect(ids(eligibleCatches("ar", "   "))).not.toContain("ar.name");
  });
});

// ─── draw order ─────────────────────────────────────────────────────────────

describe("weightedCatchOrder", () => {
  it("returns every candidate exactly once", () => {
    const order = weightedCatchOrder(eligibleCatches("en", "Wahab"), Math.random);
    expect(order).toHaveLength(14);
    expect(new Set(order).size).toBe(order.length);
  });

  it("puts the heavier catches first when the draw is flat", () => {
    const order = weightedCatchOrder(eligibleCatches("en", "Wahab"), flatRandom);
    expect(order[0].startsWith("en.name")).toBe(true);
    expect(order[order.length - 1]).toBe("en.dont-forget");
  });

  it("moves a catch up when its own draw runs high", () => {
    const plain = eligibleCatches("en");
    // First candidate draws ~1, the rest draw low: it wins regardless of weight.
    const order = weightedCatchOrder(plain, scriptedRandom([0.99, 0.01]));
    expect(order[0]).toBe(plain[0].id);
  });

  it("survives a zero draw without collapsing the order", () => {
    const order = weightedCatchOrder(eligibleCatches("ar"), () => 0);
    expect(new Set(order).size).toBe(order.length);
  });

  it("returns [] for an empty candidate list", () => {
    expect(weightedCatchOrder([], flatRandom)).toEqual([]);
  });
});

describe("catchCandidateOrder", () => {
  it("draws Arabic catches for an Arabic payload", () => {
    for (const id of catchCandidateOrder({ payload: "دواؤك بانتظارك.", random: flatRandom })) {
      expect(id.startsWith("ar.")).toBe(true);
    }
  });

  it("draws English catches for an English payload", () => {
    for (const id of catchCandidateOrder({ payload: "Your medicine is waiting.", random: flatRandom })) {
      expect(id.startsWith("en.")).toBe(true);
    }
  });

  // The bilingual user: Arabic name, English reminder. The name goes in, the
  // catch around it stays English.
  it("keeps an English payload on the English pool despite an Arabic name", () => {
    const order = catchCandidateOrder({
      payload: "Your meeting with Ahmed is starting.",
      addressTerm: "وهاب",
      random: flatRandom,
    });
    for (const id of order) {
      expect(id.startsWith("en.")).toBe(true);
    }
    expect(order[0].startsWith("en.name")).toBe(true);
  });

  it("prefers a name-bearing catch when an address term is set", () => {
    const order = catchCandidateOrder({
      payload: "دواؤك بانتظارك.",
      addressTerm: "وهاب",
      random: flatRandom,
    });
    expect(order[0].startsWith("ar.name")).toBe(true);
  });

  it("defaults to the real random when none is injected", () => {
    expect(catchCandidateOrder({ payload: "Your medicine is waiting." })).toHaveLength(10);
  });
});

// ─── rotation ───────────────────────────────────────────────────────────────

describe("selectCatchIds", () => {
  it("never hands back the catch the device heard last", () => {
    expect(selectCatchIds(["a", "b", "c"], "a", 1)).toEqual(["b"]);
  });

  it("keeps the preference order when the last catch is not in front", () => {
    expect(selectCatchIds(["a", "b", "c"], "c", 2)).toEqual(["a", "b"]);
  });

  it("gives the heads-up and the main line different catches", () => {
    const [pre, main] = selectCatchIds(["a", "b", "c"], "a", 2);
    expect(pre).toBe("b");
    expect(main).toBe("c");
    expect(pre).not.toBe(main);
  });

  it("draws freely when the device has no rotation state yet", () => {
    expect(selectCatchIds(["a", "b"], null, 1)).toEqual(["a"]);
    expect(selectCatchIds(["a", "b"], undefined, 1)).toEqual(["a"]);
  });

  it("repeats rather than going silent when nothing else is available", () => {
    expect(selectCatchIds(["a"], "a", 1)).toEqual(["a"]);
  });

  it("returns [] for a zero count", () => {
    expect(selectCatchIds(["a", "b"], null, 0)).toEqual([]);
  });

  it("returns what it has when the pool is shorter than the count", () => {
    expect(selectCatchIds(["a", "b"], "a", 2)).toEqual(["b"]);
  });

  it("returns [] for an empty candidate order", () => {
    expect(selectCatchIds([], "a", 2)).toEqual([]);
  });
});

// ─── assembly ───────────────────────────────────────────────────────────────

describe("renderCatch", () => {
  it("renders an address-free catch verbatim", () => {
    expect(renderCatch("en.heads-up")).toBe("Heads up —");
  });

  it("substitutes the address term into a name form", () => {
    expect(renderCatch("ar.name-intabih", "وهاب")).toBe("يا وهاب، انتبه،");
    expect(renderCatch("en.name-heads-up", "Wahab")).toBe("Heads up, Wahab —");
  });

  it("takes the address term verbatim, Arabic term or not", () => {
    expect(renderCatch("en.name", "أبو أحمد")).toBe("أبو أحمد —");
  });

  it("returns nothing for a name form with no name to put in it", () => {
    expect(renderCatch("en.name")).toBe("");
    expect(renderCatch("en.name", "  ")).toBe("");
  });

  it("returns nothing for an unknown or missing id", () => {
    expect(renderCatch("en.nope")).toBe("");
    expect(renderCatch(undefined)).toBe("");
  });
});

describe("applySpeechCatch", () => {
  it("puts the catch in front of the payload, payload untouched", () => {
    expect(applySpeechCatch("Your medicine is waiting.", "Heads up —")).toBe(
      "Heads up — Your medicine is waiting."
    );
  });

  it("joins Arabic the same way", () => {
    expect(applySpeechCatch("دواؤك بانتظارك.", "يا وهاب، انتبه،")).toBe(
      "يا وهاب، انتبه، دواؤك بانتظارك."
    );
  });

  it("leaves the payload bare when there is no catch", () => {
    expect(applySpeechCatch("Your medicine is waiting.", "")).toBe(
      "Your medicine is waiting."
    );
  });

  it("returns nothing for an empty payload", () => {
    expect(applySpeechCatch("", "Heads up —")).toBe("");
    expect(applySpeechCatch(undefined, "Heads up —")).toBe("");
  });
});

describe("withSpeechCatch", () => {
  it("speaks the first-firing line with its catch", () => {
    expect(withSpeechCatch("Your medicine is waiting.", "en.remember")).toBe(
      "Remember, Your medicine is waiting."
    );
  });

  it("speaks the payload bare when the ladder passes no catch", () => {
    expect(withSpeechCatch("Your medicine is waiting.", undefined)).toBe(
      "Your medicine is waiting."
    );
  });

  it("speaks the payload bare when a name form has no name", () => {
    expect(withSpeechCatch("Your medicine is waiting.", "en.name")).toBe(
      "Your medicine is waiting."
    );
  });
});

// ─── the injection seam (convex/actions.ts) ─────────────────────────────────

describe("speakFirstFiringLines", () => {
  const PAYLOAD = "Your evening medicine is still sitting there.";
  const PRE = "Your meeting with Ahmed starts in 15 minutes.";

  /**
   * Stands in for internal.reminders.claimSpeechCatches: a device with no
   * rotation row, which hands back the head of the caller's preference order.
   */
  const fakeCtx = () => {
    const claims: any[] = [];
    return {
      claims,
      ctx: {
        runMutation: async (_reference: any, args: any) => {
          claims.push(args);
          return args.candidateIds.slice(0, args.count);
        },
      },
    };
  };

  it("puts a catch in front of the main line, payload verbatim behind it", async () => {
    const { ctx } = fakeCtx();
    const spoken = await speakFirstFiringLines(ctx, { text: PAYLOAD, deviceId: "device_a" });

    expect(spoken.text).not.toBe(PAYLOAD);
    expect(spoken.text.endsWith(PAYLOAD)).toBe(true);
    expect(spoken.preText).toBeUndefined();
  });

  it("gives the heads-up its own catch, never the main line's", async () => {
    const { ctx } = fakeCtx();
    const spoken = await speakFirstFiringLines(ctx, {
      text: PAYLOAD,
      preText: PRE,
      deviceId: "device_a",
    });

    const mainCatch = spoken.text.slice(0, spoken.text.length - PAYLOAD.length);
    const preCatch = spoken.preText!.slice(0, spoken.preText!.length - PRE.length);
    expect(mainCatch).not.toBe("");
    expect(preCatch).not.toBe("");
    expect(mainCatch).not.toBe(preCatch);
  });

  it("claims one catch for a bare reminder and two when a heads-up speaks first", async () => {
    const { ctx, claims } = fakeCtx();
    await speakFirstFiringLines(ctx, { text: PAYLOAD, deviceId: "device_a" });
    await speakFirstFiringLines(ctx, { text: PAYLOAD, preText: PRE, deviceId: "device_a" });

    expect(claims[0]).toMatchObject({ deviceId: "device_a", count: 1 });
    expect(claims[1]).toMatchObject({ deviceId: "device_a", count: 2 });
  });

  it("follows the payload into Arabic", async () => {
    const { ctx } = fakeCtx();
    const spoken = await speakFirstFiringLines(ctx, {
      text: "دواؤك المسائي بانتظارك.",
      deviceId: "device_a",
    });

    expect(catchLanguageFor(spoken.text)).toBe("ar");
    expect(spoken.text).toMatch(/^(انتبه|على فكرة|بالمناسبة|لحظة|دقيقة|تذكر|لا تنسى)،/);
  });

  // Name forms outweigh the rest, so 25 draws missing every one of them is a
  // ~1e-8 event; a run that never speaks the name means they are unreachable.
  it("reaches a name-bearing catch once an address term is set", async () => {
    const { ctx } = fakeCtx();
    const spokenLines = await Promise.all(
      Array.from({ length: 25 }, () =>
        speakFirstFiringLines(ctx, {
          text: PAYLOAD,
          deviceId: "device_a",
          addressTerm: "Wahab",
        })
      )
    );

    expect(spokenLines.some((spoken) => spoken.text.includes("Wahab"))).toBe(true);
  });

  it("stays on the address-free pool when no address term is set", async () => {
    const { ctx } = fakeCtx();
    const addressFree = texts("en", false);
    const spokenLines = await Promise.all(
      Array.from({ length: 25 }, () =>
        speakFirstFiringLines(ctx, { text: PAYLOAD, deviceId: "device_a" })
      )
    );

    for (const spoken of spokenLines) {
      const prefix = spoken.text.slice(0, spoken.text.length - PAYLOAD.length).trim();
      expect(addressFree).toContain(prefix);
    }
  });

  it("still speaks a catch when rotation state cannot be reached", async () => {
    const ctx = {
      runMutation: async () => {
        throw new Error("rotation row unavailable");
      },
    };
    const spoken = await speakFirstFiringLines(ctx, { text: PAYLOAD, deviceId: "device_a" });

    expect(spoken.text.endsWith(PAYLOAD)).toBe(true);
    expect(spoken.text).not.toBe(PAYLOAD);
  });

  it("draws without rotation state when there is no device id", async () => {
    const { ctx, claims } = fakeCtx();
    const spoken = await speakFirstFiringLines(ctx, { text: PAYLOAD });

    expect(claims).toEqual([]);
    expect(spoken.text.endsWith(PAYLOAD)).toBe(true);
  });
});

// ─── the guard applies to model output, not to code-assembled catches ───────

describe("catch and opener guard", () => {
  // Several catches are word-for-word what the model is banned from writing —
  // the ban is on the model inventing an opener, not on the app speaking one.
  it("uses wordings the model itself may not open with", () => {
    const catchTexts = SPEECH_CATCHES.map((entry) => entry.text.toLowerCase());
    expect(catchTexts.some((text) => BANNED_OPENERS.some((o) => text.startsWith(o)))).toBe(true);
  });

  it("leaves the stored payload clean even when the spoken line opens banned", () => {
    const payload = "Your medicine is waiting.";
    const spoken = withSpeechCatch(payload, "en.heads-up");
    expect(hasBannedOpener(spoken)).toBe(true);
    expect(hasBannedOpener(payload)).toBe(false);
    expect(spoken.endsWith(payload)).toBe(true);
  });
});

// ─── ladder rungs stay bare ─────────────────────────────────────────────────

/**
 * Tripwire. Whether a replay rung gets a catch is decided by which synthesis
 * call the catch is threaded into, and those calls take a Convex ctx with live
 * TTS behind it — no unit test reaches them. So this reads the source and pins
 * the two places the decision lives: the variant path speaks the rung's own
 * line, and the dense alarm wav (which repeats its utterance every couple of
 * seconds inside one ring) speaks the catch-free payload.
 */
describe("ladder replays never get a catch", () => {
  const source = fs.readFileSync(
    path.resolve(__dirname, "../../convex/actions.ts"),
    "utf8"
  );

  const slice = (start: string, end: string) => {
    const from = source.indexOf(start);
    expect(from).toBeGreaterThanOrEqual(0);
    const to = source.indexOf(end, from + start.length);
    expect(to).toBeGreaterThan(from);
    return source.slice(from, to);
  };

  it("synthesizes each variant from the rung's own line", () => {
    // To the first closing brace in column 1 — the end of that function.
    const variantTts = slice("async function synthesizeVariantTts", "\n}\n");
    expect(variantTts).toContain("text: line,");
    expect(variantTts).not.toContain("SpeechCatch");
    expect(variantTts).not.toContain("speakFirstFiringLines");
  });

  it("hands the background job's variant texts through unchanged", () => {
    const ttsJob = slice("export const generateReminderTtsForReminder", "// 3. Update reminder");
    expect(ttsJob).toContain("synthesizeVariantTts(ctx, args.title, args.variantTexts, dense)");
    // Only the first-firing pair is rerouted through the catch.
    expect(ttsJob).toContain("text: spoken.text,");
    expect(ttsJob).toContain("text: spoken.preText,");
  });

  it("keeps the repeated utterance inside a dense alarm wav catch-free", () => {
    for (const call of [
      slice("const { audioStorageId: storageId, wavStorageId } = await synthesizeAndStoreLineTts(ctx, {", "});"),
      slice("const { audioStorageId: newAudioStorageId, wavStorageId: newWavStorageId } =", "});"),
    ]) {
      expect(call).toContain("wavText: dense ?");
    }
  });
});
