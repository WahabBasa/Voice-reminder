import {
  clamp,
  normalizeDay,
  normalizeReminderDescription,
  BANNED_OPENERS,
  hasBannedOpener,
  guardSpokenLine,
  getCurrentTimeHM,
  buildDescriptionInstruction,
  buildPreReminderInstruction,
  normalizePreReminder,
  buildHeadsUpTtsText,
  MAX_PRE_REMINDER_MINUTES,
  SPOKEN_LINE_RULE,
  SPOKEN_LINE_RULES_HEADING,
  SPOKEN_LINE_RULES_SECTION,
  SPOKEN_LINE_RULE_REFERENCE,
  normalizeUrgency,
  normalizePersistent,
  normalizeEmoji,
  normalizeParsedReminders,
  MAX_REMINDERS_PER_TAKE,
  MULTI_REMINDER_INSTRUCTION,
  buildReplayTierInstruction,
  URGENCY_RULES_HEADING,
  ALARM_PCM_OUTPUT_FORMAT,
  containsArabicScript,
  ALARM_WAV_BITS_PER_SAMPLE,
  ALARM_WAV_CHANNELS,
  ALARM_WAV_GAP_SECONDS,
  ALARM_WAV_MAX_SECONDS,
  ALARM_WAV_TARGET_SECONDS,
  DEFAULT_ALARM_WAV_SAMPLE_RATE,
  MAX_ALARM_SOUND_SECONDS,
  buildAlarmWav,
  buildWavHeader,
  parsePcmSampleRate,
  pcmDurationSeconds,
  pcmToWav,
} from "../../convex/helpers";

// ─── normalizeDay ───────────────────────────────────────────────────────────

describe("normalizeDay", () => {
  it('converts "monday" to "mon"', () => {
    expect(normalizeDay("monday")).toBe("mon");
  });

  it('keeps "tue" as "tue"', () => {
    expect(normalizeDay("tue")).toBe("tue");
  });

  it("handles uppercase input", () => {
    expect(normalizeDay("FRIDAY")).toBe("fri");
  });

  it('converts short code "th" to "thu"', () => {
    expect(normalizeDay("th")).toBe("thu");
  });

  it('converts "weds" to "wed"', () => {
    expect(normalizeDay("weds")).toBe("wed");
  });

  it("returns null for unrecognized day", () => {
    expect(normalizeDay("banana")).toBeNull();
  });

  it("returns null for empty string", () => {
    expect(normalizeDay("")).toBeNull();
  });

  it("returns null for null input", () => {
    expect(normalizeDay(null)).toBeNull();
  });
});

// ─── normalizeReminderDescription ───────────────────────────────────────────

describe("normalizeReminderDescription", () => {
  it('strips "Hey there," greeting', () => {
    expect(normalizeReminderDescription("Hey there, take your medicine")).toBe(
      "take your medicine"
    );
  });

  it('strips "Hello -" greeting', () => {
    expect(normalizeReminderDescription("Hello - call the dentist")).toBe(
      "call the dentist"
    );
  });

  it('strips "Hi:" greeting', () => {
    expect(normalizeReminderDescription("Hi: pick up groceries")).toBe(
      "pick up groceries"
    );
  });

  it("strips Arabic greeting مرحبا", () => {
    expect(normalizeReminderDescription("مرحبا خذ دوائك")).toBe("خذ دوائك");
  });

  it("strips Arabic greeting السلام عليكم", () => {
    expect(normalizeReminderDescription("السلام عليكم، اشتر الحليب")).toBe(
      "اشتر الحليب"
    );
  });

  it("preserves text with no greeting", () => {
    expect(normalizeReminderDescription("Take your medicine")).toBe(
      "Take your medicine"
    );
  });

  it("returns empty string for empty input", () => {
    expect(normalizeReminderDescription("")).toBe("");
  });

  it("returns empty string for null input", () => {
    expect(normalizeReminderDescription(null)).toBe("");
  });
});

// ─── clamp ──────────────────────────────────────────────────────────────────

describe("clamp", () => {
  it("returns value when within range", () => {
    expect(clamp(5, 0, 10)).toBe(5);
  });

  it("clamps to min when below range", () => {
    expect(clamp(-3, 0, 10)).toBe(0);
  });

  it("clamps to max when above range", () => {
    expect(clamp(15, 0, 10)).toBe(10);
  });

  it("returns min for NaN", () => {
    expect(clamp(NaN, 0, 10)).toBe(0);
  });

  it("returns min for Infinity (non-finite → min)", () => {
    // clamp treats non-finite values (NaN, Infinity) as invalid → returns min
    expect(clamp(Infinity, 0, 10)).toBe(0);
  });
});

// ─── getCurrentTimeHM ───────────────────────────────────────────────────────

describe("getCurrentTimeHM", () => {
  it('parses "14:30:00" to "14:30"', () => {
    expect(getCurrentTimeHM("14:30:00")).toBe("14:30");
  });

  it('pads single-digit hour: "9:05" to "09:05"', () => {
    expect(getCurrentTimeHM("9:05")).toBe("09:05");
  });

  it('returns "09:00" for garbage input', () => {
    expect(getCurrentTimeHM("garbage")).toBe("09:00");
  });

  it('returns "09:00" for empty string', () => {
    expect(getCurrentTimeHM("")).toBe("09:00");
  });
});

// ─── buildDescriptionInstruction ────────────────────────────────────────────

describe("buildDescriptionInstruction", () => {
  it("asks for one short spoken sentence in the input's language", () => {
    const result = buildDescriptionInstruction();
    expect(result).toContain("in the input's language");
    // "ONE short sentence, present tense" now lives in the SPOKEN LINE RULES
    // section this points at (OLD-106), not in a third copy of the rule.
    expect(result).toContain(SPOKEN_LINE_RULE_REFERENCE);
    expect(SPOKEN_LINE_RULES_SECTION).toContain("ONE short sentence, present tense");
    expect(result).toContain("Roughly 3-8 words");
    expect(result).toContain("Plain words only");
  });

  it("carries the canon few-shots the voice was defined by (OLD-104)", () => {
    const result = buildDescriptionInstruction();
    for (const example of [
      "'Drink your water.'",
      "'Take your pills.'",
      "'Call your mother.'",
      "'Your son's game is right now.'",
      "'Your meeting with Ahmed is right now.'",
    ]) {
      expect(result).toContain(example);
    }
  });

  // The dead canon: framing on an action ('... right now', 'Please ...') and an
  // event line that narrates the clock instead of saying it is happening.
  it("carries none of the pre-OLD-104 framing examples", () => {
    const result = buildDescriptionInstruction();
    for (const dead of [
      "'Drink your water right now.'",
      "'Take your pills right now.'",
      "'Please take your pills.'",
      "'Your son's game is starting this minute.'",
      "'اشرب ماءك الآن.'",
      "'خذ حبوبك الآن.'",
      "'من فضلك خذ حبوبك.'",
      "'مباراة ابنك تبدأ الآن.'",
    ]) {
      expect(result).not.toContain(dead);
    }
  });

  it("gives the same few-shots in Arabic so Arabic input gets an Arabic line", () => {
    const result = buildDescriptionInstruction();
    for (const example of [
      "'اشرب ماءك.'",
      "'خذ حبوبك.'",
      "'اتصل بأمك.'",
      "'مباراة ابنك الآن.'",
      "'اجتماعك مع أحمد الآن.'",
    ]) {
      expect(result).toContain(example);
    }
  });

  it("forbids any name or title — the line addresses nobody", () => {
    const result = buildDescriptionInstruction();
    // Carried by the section the instruction defers to (OLD-106).
    expect(result).toContain(SPOKEN_LINE_RULE_REFERENCE);
    expect(SPOKEN_LINE_RULES_SECTION).toContain("addressing the user by name or title");
    expect(SPOKEN_LINE_RULES_SECTION).toContain("no 'Sir'");
    expect(result).not.toContain("address term");
  });

  it("keeps the line true when it is heard late", () => {
    expect(buildDescriptionInstruction()).toContain(
      "still be true if it is heard a few minutes late"
    );
  });

  it("never embeds a double quote (it is inlined in a JSON string field)", () => {
    expect(buildDescriptionInstruction()).not.toContain('"');
  });
});

// ─── buildPreReminderInstruction ────────────────────────────────────────────

describe("buildPreReminderInstruction", () => {
  it("covers the hard-start guidance and the routine-task zero", () => {
    const result = buildPreReminderInstruction();
    expect(result).toContain("preReminderMinutes");
    expect(result).toContain("10-15");
    expect(result).toContain("meetings, appointments, flights, games, classes, calls");
    expect(result).toContain("0 for ambient/routine tasks");
  });

  it("describes the preDescription advance-notice line", () => {
    const result = buildPreReminderInstruction();
    expect(result).toContain("preDescription");
    expect(result).toContain("states the event and how far off it is");
    expect(result).toContain("ONLY when preReminderMinutes > 0");
  });

  it("keeps the advance notice factual but opener-free, with an Arabic example", () => {
    const result = buildPreReminderInstruction();
    expect(result).toContain(SPOKEN_LINE_RULE_REFERENCE);
    expect(result).toContain("'Your flight leaves in 40 minutes.'");
    expect(result).toContain("'اجتماعك يبدأ بعد ربع ساعة.'");
  });

  // The one place a time span is allowed: the description bans countdowns
  // because it may be heard late, the heads-up exists to name the lead time.
  it("keeps the lead time in the heads-up line", () => {
    expect(buildPreReminderInstruction()).toContain("the one place a time span belongs");
  });

  // The advance notice is the one line the '[X] is right now' shape does not
  // apply to — it is spoken before the thing, so it names the span instead.
  it("exempts itself from the right-now shape (OLD-104)", () => {
    expect(buildPreReminderInstruction()).toContain(
      "names the lead span in place of saying the thing is right now"
    );
  });
});

// ─── No canned openers anywhere (cadence-ladder PRD product decision) ───────

describe("instruction phrasing", () => {
  // The parse prompt used to hand the model a menu of fixed hooks, so every
  // spoken line came out stamped from the same template. They are gone; this
  // fails the moment one is reintroduced. "it is time" / "time to" joined the
  // list in OLD-61 and the catch wordings ("heads up", "by the way") in OLD-95:
  // the model kept reinventing them on its own, so they are now named as
  // forbidden — which means the ban text itself is the one place they are
  // allowed to appear, and it is stripped before the guard runs.
  const CANNED_OPENERS = [
    "it's time",
    "it is time",
    "time to",
    "heads up",
    "quick reminder",
    "hook",
    "by the way",
    "don't forget",
    "حان وقت",
    "حان الوقت",
    "على فكرة",
  ];

  const withoutLineRule = (instruction: string) =>
    instruction.replace(SPOKEN_LINE_RULE, "");

  const instructions = () =>
    [
      buildDescriptionInstruction(),
      buildPreReminderInstruction(),
      buildReplayTierInstruction(),
    ].map(withoutLineRule);

  for (const opener of CANNED_OPENERS) {
    it(`never offers "${opener}" as an opener`, () => {
      for (const instruction of instructions()) {
        expect(instruction.toLowerCase()).not.toContain(opener);
      }
    });
  }
});

// ─── SPOKEN_LINE_RULE (OLD-95: the one voice rule) ─────────────────────────

describe("SPOKEN_LINE_RULE", () => {
  it("asks for one short present-tense sentence about the thing", () => {
    expect(SPOKEN_LINE_RULE).toContain("ONE short sentence, present tense");
    expect(SPOKEN_LINE_RULE).toContain("about the thing itself and nothing else");
  });

  it("names the two shapes and nothing beyond them (OLD-104)", () => {
    expect(SPOKEN_LINE_RULE).toContain("exactly TWO shapes");
    expect(SPOKEN_LINE_RULE).toContain(
      "Something the user DOES is a bare imperative and nothing else"
    );
    expect(SPOKEN_LINE_RULE).toContain("'Drink your water.'");
    expect(SPOKEN_LINE_RULE).toContain("'Take your pills.'");
    expect(SPOKEN_LINE_RULE).toContain(
      "Something that HAPPENS on its own is stated as happening now"
    );
    expect(SPOKEN_LINE_RULE).toContain("'Your son's game is right now.'");
  });

  it("mirrors both shapes in Arabic", () => {
    expect(SPOKEN_LINE_RULE).toContain("'اشرب ماءك.'");
    expect(SPOKEN_LINE_RULE).toContain("'خذ حبوبك.'");
    expect(SPOKEN_LINE_RULE).toContain("'مباراة ابنك الآن.'");
    expect(SPOKEN_LINE_RULE).toContain("'رحلتك الآن.'");
  });

  // The framing the shapes replaced: an action padded with 'right now' or a
  // 'please', and an event line that restates the clock it was set for.
  it("kills the framing the old registers allowed", () => {
    expect(SPOKEN_LINE_RULE).toContain("no 'right now' on the end");
    expect(SPOKEN_LINE_RULE).toContain("no 'please'");
    expect(SPOKEN_LINE_RULE).toContain("never restate the clock the reminder was set for");
    expect(SPOKEN_LINE_RULE).not.toContain("a polite request");
    expect(SPOKEN_LINE_RULE).not.toContain("Drink your water right now.");
    expect(SPOKEN_LINE_RULE).not.toContain("is starting this minute");
  });

  it("forbids the clock, label and lead-in openers by name, in both languages", () => {
    for (const banned of [
      "'It is time'",
      "'It's time'",
      "'Time to ...'",
      "'حان وقت'",
      "'حان الوقت'",
      "'Quick reminder'",
      "'Just a reminder'",
      "'Heads up'",
      "'تذكير سريع'",
      "'By the way'",
      "'Just so you know'",
      "'Don't forget'",
      "'على فكرة'",
      "'لا تنسى'",
    ]) {
      expect(SPOKEN_LINE_RULE).toContain(banned);
    }
    expect(SPOKEN_LINE_RULE).toContain("forbidden wordings, not merely discouraged");
  });

  it("bans greetings, names and wellness commentary outright", () => {
    expect(SPOKEN_LINE_RULE).toContain("any greeting");
    expect(SPOKEN_LINE_RULE).toContain("addressing the user by name or title");
    expect(SPOKEN_LINE_RULE).toContain("no 'Sir'");
    expect(SPOKEN_LINE_RULE).toContain("wellness, benefit or encouragement commentary");
  });

  it("gives the model somewhere else to start instead of a replacement formula", () => {
    expect(SPOKEN_LINE_RULE).toContain("Start on the substance");
    expect(SPOKEN_LINE_RULE).toContain("There is no approved replacement opener");
  });

  it("never embeds a double quote (it is inlined in a JSON string field)", () => {
    expect(SPOKEN_LINE_RULE).not.toContain('"');
  });

  // OLD-106: the rule is stated once, as a named section in the prompt, and
  // each spoken-line builder points at it. Inlining it three times put ~3,400
  // duplicated characters into every parse request and cost prefill on each.
  it("is referenced by every builder that describes a spoken line", () => {
    for (const instruction of [
      buildDescriptionInstruction(),
      buildPreReminderInstruction(),
    ]) {
      expect(instruction).toContain(SPOKEN_LINE_RULE_REFERENCE);
      // The reference replaces the copy — it does not sit next to one.
      expect(instruction).not.toContain(SPOKEN_LINE_RULE);
    }
  });

  // Two builders describe a spoken line, and only those two (OLD-108). The
  // urgency block classifies the ring, so pointing it at the voice canon would
  // be noise in a prompt whose whole shape is about not shipping noise.
  it("is not referenced by the block that describes no line at all", () => {
    expect(buildReplayTierInstruction()).not.toContain(SPOKEN_LINE_RULE_REFERENCE);
    expect(buildReplayTierInstruction()).not.toContain(SPOKEN_LINE_RULES_HEADING);
  });

  it("names the section the builders point at, and carries the rule verbatim", () => {
    expect(SPOKEN_LINE_RULES_SECTION).toContain(SPOKEN_LINE_RULES_HEADING);
    // The canon itself is untouched by the dedupe — same bytes, one copy.
    expect(SPOKEN_LINE_RULES_SECTION).toContain(SPOKEN_LINE_RULE);
    expect(SPOKEN_LINE_RULE_REFERENCE).toContain(SPOKEN_LINE_RULES_HEADING);
    // Embedded inside a double-quoted JSON field, like the rule it stands in for.
    expect(SPOKEN_LINE_RULE_REFERENCE).not.toContain('"');
  });

});

// ─── BANNED_OPENERS / hasBannedOpener / guardSpokenLine ─────────────────────

describe("BANNED_OPENERS", () => {
  it("names the clock and label openers in both languages", () => {
    for (const opener of [
      "it is time",
      "it's time",
      "time to",
      "quick reminder",
      "just a reminder",
      "heads up",
      "حان وقت",
      "حان الوقت",
      "تذكير سريع",
    ]) {
      expect(BANNED_OPENERS).toContain(opener);
    }
  });

  // These were the app's own catch wordings until OLD-95 removed the feature.
  // Nothing prepends them any more, so the model may not write them either.
  it("names the conversational lead-ins the catches used to supply", () => {
    for (const opener of [
      "by the way",
      "just so you know",
      "don't forget",
      "remember",
      "على فكرة",
      "لا تنسى",
      "انتبه",
    ]) {
      expect(BANNED_OPENERS).toContain(opener);
    }
  });

  it("is lowercase throughout (the match form is lowercased)", () => {
    for (const opener of BANNED_OPENERS) {
      expect(opener).toBe(opener.toLowerCase());
    }
  });
});

describe("hasBannedOpener", () => {
  // The live-model leak this guard exists for (__evals__/reminder-phrasing).
  it("catches the Arabic clock opener the model keeps leaking", () => {
    expect(hasBannedOpener("حان وقت شرب كوب من الماء.")).toBe(true);
  });

  it("catches an English clock opener", () => {
    expect(hasBannedOpener("It's time to drink some water")).toBe(true);
  });

  it("catches a reminder label opener", () => {
    expect(hasBannedOpener("Quick reminder — your medicine is waiting")).toBe(true);
  });

  it("ignores case", () => {
    expect(hasBannedOpener("HEADS UP — the meeting starts")).toBe(true);
  });

  it("looks past leading quotes and dashes", () => {
    expect(hasBannedOpener('"حان وقت الدواء."')).toBe(true);
    expect(hasBannedOpener("— It is time to leave")).toBe(true);
  });

  it("passes a clean line", () => {
    expect(hasBannedOpener("Your evening medicine is still sitting there.")).toBe(false);
    expect(hasBannedOpener("دواؤك المسائي بانتظارك.")).toBe(false);
  });

  it("only matches at the opening, not mid-line", () => {
    expect(hasBannedOpener("Your medicine is time-sensitive")).toBe(false);
  });

  it("treats a missing line as clean", () => {
    expect(hasBannedOpener(undefined)).toBe(false);
    expect(hasBannedOpener(null)).toBe(false);
  });
});

describe("guardSpokenLine", () => {
  it("passes a clean line through, greetings stripped", () => {
    expect(guardSpokenLine("Hey! Your medicine is waiting")).toBe("Your medicine is waiting");
  });

  it("never lets the Arabic clock leak reach storage", () => {
    expect(guardSpokenLine("حان وقت شرب كوب من الماء.", "شرب الماء")).toBe("شرب الماء");
  });

  it("replaces a leaked line whole rather than trimming the opener off", () => {
    const guarded = guardSpokenLine("It is time to take your medicine", "Evening medicine");
    expect(guarded).toBe("Evening medicine");
    expect(guarded).not.toContain("take your medicine");
  });

  it("uses the fallback when the line is missing entirely", () => {
    expect(guardSpokenLine(undefined, "Evening medicine")).toBe("Evening medicine");
    expect(guardSpokenLine("   ", "Evening medicine")).toBe("Evening medicine");
  });

  // The floor. Emitting "" here would hand TTS an empty string: the provider
  // rejects it, which costs the reminder its audio on the fast path and the
  // reminder itself on the slow one. A formulaic line is the status quo.
  it("keeps the original line when the fallback is banned too", () => {
    expect(guardSpokenLine("حان وقت الدواء", "تذكير سريع")).toBe("حان وقت الدواء");
  });

  it("keeps the original line when no fallback is offered", () => {
    expect(guardSpokenLine("Time to drink water")).toBe("Time to drink water");
  });

  it("keeps the original line when the fallback is empty", () => {
    expect(guardSpokenLine("Time to drink water", "")).toBe("Time to drink water");
    expect(guardSpokenLine("Time to drink water", "   ")).toBe("Time to drink water");
    expect(guardSpokenLine("Time to drink water", undefined)).toBe("Time to drink water");
  });

  it("never empties a non-empty line, whatever the fallback is", () => {
    for (const fallback of [undefined, "", "  ", "Reminder: Water", "تذكير"]) {
      expect(guardSpokenLine("Heads up — drink water", fallback)).not.toBe("");
    }
  });

  // Why the floor has to exist: the fallback is the title, and ordinary titles
  // trip the ban. Without it, these three reminders would go out silent.
  it("still speaks a line when an ordinary title is what trips the ban", () => {
    for (const title of ["Reminder: Water", "Time to Sleep", "تذكير بالدواء"]) {
      expect(hasBannedOpener(title)).toBe(true);
      expect(guardSpokenLine("Time to drink water", title)).toBe("Time to drink water");
    }
  });

  it("returns empty only when neither side has any text", () => {
    expect(guardSpokenLine("", "")).toBe("");
    expect(guardSpokenLine(undefined, undefined)).toBe("");
    expect(guardSpokenLine("   ", "  ")).toBe("");
  });

  // A missing line with a banned title still beats silence: the banned title is
  // the only text there is.
  it("falls back to a banned stand-in when the line itself is missing", () => {
    expect(guardSpokenLine("", "Time to Sleep")).toBe("Time to Sleep");
  });

  it("normalizes the fallback like any other spoken line", () => {
    expect(guardSpokenLine("Heads up — drink water", "Hey! Water break")).toBe("Water break");
  });
});

// ─── normalizePreReminder ───────────────────────────────────────────────────

describe("normalizePreReminder", () => {
  it("passes through valid minutes and a heads-up line", () => {
    expect(normalizePreReminder(15, "Your meeting with Ahmed starts in 15 minutes")).toEqual({
      preReminderMinutes: 15,
      preDescription: "Your meeting with Ahmed starts in 15 minutes",
      rawPreDescription: "Your meeting with Ahmed starts in 15 minutes",
    });
  });

  it("parses numeric-string minutes", () => {
    expect(normalizePreReminder("10", "Your flight leaves in 10 minutes").preReminderMinutes).toBe(10);
  });

  it("rounds fractional minutes", () => {
    expect(normalizePreReminder(12.4, "line").preReminderMinutes).toBe(12);
  });

  it("clamps oversized minutes to the maximum", () => {
    expect(normalizePreReminder(999, "line").preReminderMinutes).toBe(MAX_PRE_REMINDER_MINUTES);
  });

  it("returns zero and drops the line for zero minutes", () => {
    expect(normalizePreReminder(0, "should be ignored")).toEqual({
      preReminderMinutes: 0,
      preDescription: "",
      rawPreDescription: "",
    });
  });

  it("returns zero for negative minutes", () => {
    expect(normalizePreReminder(-5, "line").preReminderMinutes).toBe(0);
  });

  it("returns zero for undefined minutes", () => {
    expect(normalizePreReminder(undefined, undefined)).toEqual({
      preReminderMinutes: 0,
      preDescription: "",
      rawPreDescription: "",
    });
  });

  it("returns zero for non-numeric minutes", () => {
    expect(normalizePreReminder("soon", "line").preReminderMinutes).toBe(0);
  });

  it("returns zero for non-finite minutes", () => {
    expect(normalizePreReminder(Infinity, "line").preReminderMinutes).toBe(0);
  });

  it("normalizes greetings out of the pre description", () => {
    expect(normalizePreReminder(15, "Hey! Your meeting starts in 15 minutes").preDescription).toBe(
      "Your meeting starts in 15 minutes"
    );
  });

  it("returns an empty pre description when the model omits it", () => {
    expect(normalizePreReminder(15, undefined).preDescription).toBe("");
  });

  // Empty is what hands the line to the caller's '<title> in N minutes'
  // fallback, which is deterministic and opener-free by construction.
  it("empties a heads-up that opens with a banned label", () => {
    expect(normalizePreReminder(15, "Heads up — meeting with Ahmed").preDescription).toBe("");
  });

  it("empties an Arabic heads-up that opens with the clock", () => {
    expect(normalizePreReminder(15, "حان وقت اجتماعك مع أحمد.").preDescription).toBe("");
  });

  // The banned line is still kept: the caller needs it when the title it would
  // otherwise fall back to is banned as well (buildHeadsUpTtsText).
  it("keeps the model's banned line alongside the emptied one", () => {
    const pre = normalizePreReminder(15, "Heads up — meeting with Ahmed");
    expect(pre.preDescription).toBe("");
    expect(pre.rawPreDescription).toBe("Heads up — meeting with Ahmed");
  });

  it("strips greetings out of the kept raw line too", () => {
    expect(normalizePreReminder(15, "Hey! Heads up — meeting").rawPreDescription).toBe(
      "Heads up — meeting"
    );
  });

  it("drops the raw line as well when there is no lead time", () => {
    expect(normalizePreReminder(0, "Heads up — meeting").rawPreDescription).toBe("");
  });
});

// ─── buildHeadsUpTtsText ────────────────────────────────────────────────────

describe("buildHeadsUpTtsText", () => {
  const build = (over: Partial<Parameters<typeof buildHeadsUpTtsText>[0]>) =>
    buildHeadsUpTtsText({
      preReminderMinutes: 15,
      preDescription: "",
      rawPreDescription: "",
      title: "Meeting with Ahmed",
      ...over,
    });

  it("speaks the model's line when it came back clean", () => {
    expect(
      build({
        preDescription: "Your meeting with Ahmed starts in 15 minutes",
        rawPreDescription: "Your meeting with Ahmed starts in 15 minutes",
      })
    ).toBe("Your meeting with Ahmed starts in 15 minutes");
  });

  it("falls back to the deterministic title line when the model gave nothing", () => {
    expect(build({})).toBe("Meeting with Ahmed in 15 minutes");
  });

  it("keeps preferring the clean title line over a banned model line", () => {
    expect(build({ rawPreDescription: "Heads up — meeting soon" })).toBe(
      "Meeting with Ahmed in 15 minutes"
    );
  });

  // The bug this exists for: '<title> in N minutes' interpolates the title raw,
  // so a banned title laundered a banned opener in through the safety path.
  it("prefers the model's own line, banned or not, over a banned title", () => {
    expect(
      build({
        title: "Time to Sleep",
        rawPreDescription: "Heads up — you are going to bed in 15 minutes",
      })
    ).toBe("Heads up — you are going to bed in 15 minutes");
  });

  it("speaks the banned title line as a last resort rather than nothing", () => {
    expect(build({ title: "Reminder: Water" })).toBe("Reminder: Water in 15 minutes");
    expect(build({ title: "تذكير بالدواء" })).toBe("تذكير بالدواء in 15 minutes");
  });

  it("never returns empty while there is a lead time and any text at all", () => {
    for (const title of ["Meeting", "Time to Sleep", "تذكير بالدواء", ""]) {
      for (const raw of ["", "Heads up — soon"]) {
        if (!title && !raw) continue;
        expect(build({ title, rawPreDescription: raw })).not.toBe("");
      }
    }
  });

  it("says nothing when there is no lead time", () => {
    expect(
      build({ preReminderMinutes: 0, preDescription: "ignored", rawPreDescription: "ignored" })
    ).toBe("");
  });

  it("says nothing when the parse produced neither a line nor a title", () => {
    expect(build({ title: "", rawPreDescription: "" })).toBe("");
    expect(build({ title: undefined, rawPreDescription: "" })).toBe("");
  });
});

// ─── normalizeUrgency ───────────────────────────────────────────────────────

describe("normalizeUrgency", () => {
  it("passes urgent through", () => {
    expect(normalizeUrgency("urgent")).toBe("urgent");
  });

  it("passes notice through", () => {
    expect(normalizeUrgency("notice")).toBe("notice");
  });

  it("passes routine through", () => {
    expect(normalizeUrgency("routine")).toBe("routine");
  });

  it("normalizes case and whitespace", () => {
    expect(normalizeUrgency("  Urgent ")).toBe("urgent");
  });

  it("defaults unknown values to routine", () => {
    expect(normalizeUrgency("panic")).toBe("routine");
  });

  it("defaults undefined to routine", () => {
    expect(normalizeUrgency(undefined)).toBe("routine");
  });
});

// ─── normalizePersistent ────────────────────────────────────────────────────

describe("normalizePersistent", () => {
  it("returns true for boolean true", () => {
    expect(normalizePersistent(true)).toBe(true);
  });

  it('returns true for "true"', () => {
    expect(normalizePersistent("true")).toBe(true);
  });

  it('returns true for "1"', () => {
    expect(normalizePersistent("1")).toBe(true);
  });

  it("returns false for boolean false", () => {
    expect(normalizePersistent(false)).toBe(false);
  });

  it("returns false for undefined", () => {
    expect(normalizePersistent(undefined)).toBe(false);
  });

  it("returns false for random string", () => {
    expect(normalizePersistent("critical")).toBe(false);
  });
});

// ─── buildReplayTierInstruction (OLD-108) ───────────────────────────────────

describe("buildReplayTierInstruction", () => {
  it("documents the two tier fields and nothing else", () => {
    const result = buildReplayTierInstruction();
    expect(result).toContain(URGENCY_RULES_HEADING);
    expect(result).toContain('"urgency"');
    expect(result).toContain('"persistent"');
  });

  it("describes urgency by how hard the reminder pushes, not by opener", () => {
    const result = buildReplayTierInstruction();
    expect(result).toContain("how hard the reminder has to push");
    expect(result).toContain('"urgent" when the user must act right now');
  });

  // The whole point of OLD-108: the parse no longer produces alternative
  // wordings, and the block says so rather than leaving it implied. A prompt
  // that still asked for a "variants" array would get one back, and it would
  // be synthesized, stored and never played.
  it("asks for no replay lines at all", () => {
    const result = buildReplayTierInstruction();
    expect(result).not.toContain('"variants"');
    expect(result).not.toContain("escalate");
    expect(result).toContain("it always speaks the SAME line");
  });
});

// ─── Alarm WAV pipeline ─────────────────────────────────────────────────────

const ascii = (bytes: Uint8Array, offset: number, length: number) =>
  String.fromCharCode(...bytes.slice(offset, offset + length));

const u16 = (bytes: Uint8Array, offset: number) =>
  new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint16(offset, true);

const u32 = (bytes: Uint8Array, offset: number) =>
  new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(offset, true);

describe("parsePcmSampleRate", () => {
  it("reads the rate out of the default alarm output format", () => {
    expect(parsePcmSampleRate(ALARM_PCM_OUTPUT_FORMAT)).toBe(
      DEFAULT_ALARM_WAV_SAMPLE_RATE
    );
  });

  it("supports the other PCM rates ElevenLabs offers", () => {
    expect(parsePcmSampleRate("pcm_16000")).toBe(16000);
    expect(parsePcmSampleRate("pcm_24000")).toBe(24000);
    expect(parsePcmSampleRate("PCM_44100")).toBe(44100);
    expect(parsePcmSampleRate("  pcm_8000  ")).toBe(8000);
  });

  it("returns null for non-PCM formats", () => {
    expect(parsePcmSampleRate("mp3_44100_128")).toBeNull();
    expect(parsePcmSampleRate("opus_48000_64")).toBeNull();
    expect(parsePcmSampleRate("ulaw_8000")).toBeNull();
  });

  it("returns null for junk input", () => {
    expect(parsePcmSampleRate("")).toBeNull();
    expect(parsePcmSampleRate(undefined)).toBeNull();
    expect(parsePcmSampleRate(null)).toBeNull();
    expect(parsePcmSampleRate("pcm_")).toBeNull();
    expect(parsePcmSampleRate("pcm_0")).toBeNull();
  });
});

describe("containsArabicScript", () => {
  it("routes plain English to false", () => {
    expect(containsArabicScript("Drink your water.")).toBe(false);
    expect(containsArabicScript("Your meeting is at 7:30.")).toBe(false);
  });

  it("detects a fully Arabic line", () => {
    expect(containsArabicScript("خذ حبوبك.")).toBe(true);
  });

  it("detects an Arabic address term inside an English line", () => {
    expect(containsArabicScript("Call ماما now.")).toBe(true);
  });

  it("detects Arabic presentation forms", () => {
    // U+FEFB (LAM-ALEF ligature) sits in the FE70-FEFF block, not the base block.
    expect(containsArabicScript("ﻻ")).toBe(true);
  });

  it("stays false for empty and non-string input", () => {
    expect(containsArabicScript("")).toBe(false);
    expect(containsArabicScript(undefined)).toBe(false);
    expect(containsArabicScript(null)).toBe(false);
  });

  it("stays false for other non-Latin scripts", () => {
    expect(containsArabicScript("水を飲む")).toBe(false);
  });
});

describe("pcmDurationSeconds", () => {
  it("computes one second of 22.05kHz mono 16-bit audio", () => {
    expect(pcmDurationSeconds(22050 * 2)).toBe(1);
  });

  it("honours an explicit sample rate", () => {
    expect(pcmDurationSeconds(24000 * 2 * 3, 24000)).toBe(3);
  });

  it("returns 0 for an empty buffer or a nonsense rate", () => {
    expect(pcmDurationSeconds(0)).toBe(0);
    expect(pcmDurationSeconds(1000, 0)).toBe(0);
  });
});

describe("buildWavHeader", () => {
  it("writes the canonical 44-byte RIFF/WAVE header", () => {
    const header = buildWavHeader(1000);
    expect(header.length).toBe(44);
    expect(ascii(header, 0, 4)).toBe("RIFF");
    expect(ascii(header, 8, 4)).toBe("WAVE");
    expect(ascii(header, 12, 4)).toBe("fmt ");
    expect(ascii(header, 36, 4)).toBe("data");
  });

  it("sizes the RIFF and data chunks from the payload length", () => {
    const header = buildWavHeader(1000);
    expect(u32(header, 4)).toBe(1036); // 36 + dataLength
    expect(u32(header, 40)).toBe(1000);
  });

  it("declares uncompressed mono 16-bit PCM at the default rate", () => {
    const header = buildWavHeader(1000);
    expect(u32(header, 16)).toBe(16); // fmt chunk length
    expect(u16(header, 20)).toBe(1); // audioFormat: PCM
    expect(u16(header, 22)).toBe(ALARM_WAV_CHANNELS);
    expect(u32(header, 24)).toBe(DEFAULT_ALARM_WAV_SAMPLE_RATE);
    expect(u32(header, 28)).toBe(DEFAULT_ALARM_WAV_SAMPLE_RATE * 2); // byte rate
    expect(u16(header, 32)).toBe(2); // block align
    expect(u16(header, 34)).toBe(ALARM_WAV_BITS_PER_SAMPLE);
  });

  it("carries a non-default sample rate into rate and byte rate", () => {
    const header = buildWavHeader(8, 24000);
    expect(u32(header, 24)).toBe(24000);
    expect(u32(header, 28)).toBe(48000);
  });
});

describe("pcmToWav", () => {
  it("prefixes the PCM payload with the 44-byte header, unmodified", () => {
    const pcm = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);
    const wav = pcmToWav(pcm);
    expect(wav.length).toBe(44 + pcm.length);
    expect(ascii(wav, 0, 4)).toBe("RIFF");
    expect(u32(wav, 40)).toBe(pcm.length);
    expect(Array.from(wav.slice(44))).toEqual(Array.from(pcm));
  });

  it("accepts a full-length line right at the 30s limit", () => {
    const pcm = new Uint8Array(DEFAULT_ALARM_WAV_SAMPLE_RATE * 2 * MAX_ALARM_SOUND_SECONDS);
    expect(() => pcmToWav(pcm)).not.toThrow();
  });

  it("rejects a line longer than the alarm sound limit", () => {
    const pcm = new Uint8Array(
      DEFAULT_ALARM_WAV_SAMPLE_RATE * 2 * (MAX_ALARM_SOUND_SECONDS + 1)
    );
    expect(() => pcmToWav(pcm)).toThrow(/over the 30s limit/);
  });

  it("rejects an empty PCM body", () => {
    expect(() => pcmToWav(new Uint8Array(0))).toThrow(/empty PCM buffer/);
  });

  it("rejects an unusable sample rate", () => {
    const pcm = new Uint8Array([1, 2]);
    expect(() => pcmToWav(pcm, 0)).toThrow(/Invalid PCM sample rate/);
    expect(() => pcmToWav(pcm, Number.NaN)).toThrow(/Invalid PCM sample rate/);
  });
});

describe("buildAlarmWav", () => {
  const RATE = DEFAULT_ALARM_WAV_SAMPLE_RATE;
  const BYTES_PER_SECOND = RATE * 2; // mono, 16-bit

  /** A recognisable "spoken line": every byte non-zero, so silence is visible. */
  const line = (seconds: number) =>
    new Uint8Array(seconds * BYTES_PER_SECOND).fill(7);

  const body = (wav: Uint8Array) => wav.slice(44);
  const seconds = (wav: Uint8Array) => pcmDurationSeconds(wav.length - 44, RATE);
  const isSilent = (bytes: Uint8Array) => bytes.every((byte) => byte === 0);
  // Byte-scan rather than toEqual: these buffers run to hundreds of thousands
  // of samples and jest's deep equality on them is glacial.
  const matches = (actual: Uint8Array, expected: Uint8Array) =>
    actual.length === expected.length && actual.every((byte, i) => byte === expected[i]);

  it("repeats the line with a 2s gap between passes", () => {
    const pcm = line(4);
    const passBytes = pcm.length + ALARM_WAV_GAP_SECONDS * BYTES_PER_SECOND;
    const wav = buildAlarmWav(pcm, RATE);

    // 4s line + 2s gap = 6s per pass; four whole passes fit inside 28s.
    const passes = 4;
    expect(seconds(wav)).toBe(passes * (4 + ALARM_WAV_GAP_SECONDS));
    for (let pass = 0; pass < passes; pass++) {
      const offset = pass * passBytes;
      expect(matches(body(wav).slice(offset, offset + pcm.length), pcm)).toBe(true);
      expect(isSilent(body(wav).slice(offset + pcm.length, offset + passBytes))).toBe(
        true
      );
    }
  });

  it("never goes quiet for longer than one gap", () => {
    // The bug this replaced: one utterance, then ~24s of dead air per loop.
    const wav = buildAlarmWav(line(4), RATE);
    let run = 0;
    let longestSilence = 0;
    for (const byte of body(wav)) {
      run = byte === 0 ? run + 1 : 0;
      if (run > longestSilence) longestSilence = run;
    }
    expect(longestSilence).toBe(ALARM_WAV_GAP_SECONDS * BYTES_PER_SECOND);
  });

  it("keeps the wav playable: header sizes match the shaped body", () => {
    const wav = buildAlarmWav(line(4), RATE);
    expect(ascii(wav, 0, 4)).toBe("RIFF");
    expect(u32(wav, 40)).toBe(wav.length - 44);
    expect(u32(wav, 24)).toBe(RATE);
  });

  it("honours a non-default sample rate", () => {
    // Same 4s line + 2s gap arithmetic, measured against 24kHz bytes.
    const wav = buildAlarmWav(new Uint8Array(24000 * 2 * 4).fill(7), 24000);
    expect(pcmDurationSeconds(wav.length - 44, 24000)).toBe(24);
    expect(u32(wav, 24)).toBe(24000);
  });

  it("stops before the pass that would overrun the target", () => {
    // 10s line + 2s gap = 12s per pass: two fit, a third would be 36s.
    const wav = buildAlarmWav(line(10), RATE);
    expect(seconds(wav)).toBe(24);
  });

  it("ships a line that already fills the budget unpadded", () => {
    const pcm = new Uint8Array(BYTES_PER_SECOND * 28.5).fill(7);
    const wav = buildAlarmWav(pcm, RATE);
    expect(wav.length).toBe(44 + pcm.length);
    expect(seconds(wav)).toBeCloseTo(28.5, 5);
  });

  it("drops the gap rather than exceed the target with one pass", () => {
    // 27s line + 2s gap = 29s, so not even one whole pass fits: line only.
    const pcm = line(27);
    const wav = buildAlarmWav(pcm, RATE);
    expect(wav.length).toBe(44 + pcm.length);
  });

  it("stays inside the target, and never reaches the 29s ceiling", () => {
    for (const lineSeconds of [1, 3, 4.5, 9, 13, 27]) {
      const pcm = new Uint8Array(Math.round(lineSeconds * BYTES_PER_SECOND)).fill(7);
      const wav = buildAlarmWav(pcm, RATE);
      // Whole passes only, so a shaped file never runs past the target.
      expect(seconds(wav)).toBeLessThanOrEqual(ALARM_WAV_TARGET_SECONDS);
      expect(seconds(wav)).toBeLessThanOrEqual(ALARM_WAV_MAX_SECONDS);
      expect(ALARM_WAV_MAX_SECONDS).toBeLessThan(MAX_ALARM_SOUND_SECONDS);
    }
  });

  it("still rejects an utterance longer than iOS allows", () => {
    const pcm = new Uint8Array(BYTES_PER_SECOND * (MAX_ALARM_SOUND_SECONDS + 1));
    expect(() => buildAlarmWav(pcm, RATE)).toThrow(/over the 30s limit/);
  });

  it("rejects an empty body and an unusable rate the same way pcmToWav does", () => {
    expect(() => buildAlarmWav(new Uint8Array(0), RATE)).toThrow(/empty PCM buffer/);
    expect(() => buildAlarmWav(line(1), 0)).toThrow(/Invalid PCM sample rate/);
    expect(() => buildAlarmWav(line(1), Number.NaN)).toThrow(/Invalid PCM sample rate/);
  });
});

// ─── normalizeParsedReminders (OLD-93) ──────────────────────────────────────

describe("normalizeParsedReminders", () => {
  it("unwraps the {reminders:[...]} envelope the prompt asks for", () => {
    const items = normalizeParsedReminders({
      reminders: [{ title: "Medicine" }, { title: "Call mom" }],
    });
    expect(items).toEqual([{ title: "Medicine" }, { title: "Call mom" }]);
  });

  it("accepts a bare top-level array (what the model did unprompted)", () => {
    const items = normalizeParsedReminders([{ title: "Water" }, { title: "Gym" }]);
    expect(items.map((item) => item.title)).toEqual(["Water", "Gym"]);
  });

  it("wraps a bare single object — the pre-OLD-93 shape still comes back", () => {
    expect(normalizeParsedReminders({ title: "Water", time: "20:00" })).toEqual([
      { title: "Water", time: "20:00" },
    ]);
  });

  it("keeps an empty object, so a contentless parse fails where it always did", () => {
    expect(normalizeParsedReminders({})).toEqual([{}]);
  });

  it("drops non-object entries instead of trusting them", () => {
    const items = normalizeParsedReminders({
      reminders: [{ title: "Water" }, "Gym at 6", null, 42, ["nested"], { title: "Gym" }],
    });
    expect(items).toEqual([{ title: "Water" }, { title: "Gym" }]);
  });

  it("treats a non-array reminders field as an ordinary single object", () => {
    expect(normalizeParsedReminders({ reminders: "two things" })).toEqual([
      { reminders: "two things" },
    ]);
  });

  it("throws on an envelope with nothing usable in it", () => {
    expect(() => normalizeParsedReminders({ reminders: [] })).toThrow(
      /no reminder object/
    );
    expect(() => normalizeParsedReminders([])).toThrow(/no reminder object/);
    expect(() => normalizeParsedReminders([null, "x", 7])).toThrow(
      /no reminder object/
    );
    expect(() => normalizeParsedReminders(null)).toThrow(/no reminder object/);
    expect(() => normalizeParsedReminders("not json-ish")).toThrow(
      /no reminder object/
    );
  });

  it("caps a runaway parse at MAX_REMINDERS_PER_TAKE", () => {
    const many = Array.from({ length: MAX_REMINDERS_PER_TAKE + 3 }, (_, i) => ({
      title: `Task ${i}`,
    }));
    const items = normalizeParsedReminders({ reminders: many });
    expect(items).toHaveLength(MAX_REMINDERS_PER_TAKE);
    expect(items[0].title).toBe("Task 0");
  });
});

describe("MULTI_REMINDER_INSTRUCTION", () => {
  it("names the exact envelope the normalizer prefers", () => {
    expect(MULTI_REMINDER_INSTRUCTION).toContain(`{"reminders": [`);
  });

  it("asks for a one-element array even for a single reminder", () => {
    expect(MULTI_REMINDER_INSTRUCTION).toMatch(/one-element array/);
  });
});

// ─── normalizeEmoji ─────────────────────────────────────────────────────────

describe("normalizeEmoji", () => {
  it("keeps a single emoji", () => {
    expect(normalizeEmoji("💊")).toBe("💊");
    expect(normalizeEmoji("  🏋️  ")).toBe("🏋️");
  });

  it("keeps only the first cluster when the model sends several", () => {
    expect(normalizeEmoji("💧💧")).toBe("💧");
  });

  it("keeps a ZWJ sequence and a skin tone intact", () => {
    expect(normalizeEmoji("👨‍👩‍👧")).toBe("👨‍👩‍👧");
    expect(normalizeEmoji("👍🏽")).toBe("👍🏽");
  });

  it("rejects anything with words or punctuation in it (chips hold pictographs)", () => {
    expect(normalizeEmoji("💊 medicine")).toBeUndefined();
    expect(normalizeEmoji("pills")).toBeUndefined();
    expect(normalizeEmoji(":)")).toBeUndefined();
  });

  it("rejects non-ASCII text that is not an emoji", () => {
    expect(normalizeEmoji("دواء")).toBeUndefined();
  });

  it("rejects empty and non-string input", () => {
    expect(normalizeEmoji("")).toBeUndefined();
    expect(normalizeEmoji("   ")).toBeUndefined();
    expect(normalizeEmoji(undefined)).toBeUndefined();
    expect(normalizeEmoji(null)).toBeUndefined();
    expect(normalizeEmoji(42)).toBeUndefined();
  });
});
