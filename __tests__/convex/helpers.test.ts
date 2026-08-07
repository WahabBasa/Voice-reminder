import {
  clamp,
  normalizeDay,
  normalizeReminderDescription,
  getCurrentTimeHM,
  buildDescriptionInstruction,
  buildPreReminderInstruction,
  normalizePreReminder,
  MAX_PRE_REMINDER_MINUTES,
  MAX_REPLAY_VARIANTS,
  normalizeUrgency,
  normalizePersistent,
  variantCountForTier,
  normalizeVariants,
  buildVariantInstruction,
  ALARM_PCM_OUTPUT_FORMAT,
  ALARM_WAV_BITS_PER_SAMPLE,
  ALARM_WAV_CHANNELS,
  DEFAULT_ALARM_WAV_SAMPLE_RATE,
  MAX_ALARM_SOUND_SECONDS,
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
  it("uses the address term verbatim in the urgent hook", () => {
    const result = buildDescriptionInstruction("Wahab");
    expect(result).toContain("'Wahab —'");
    expect(result).toContain("'Wahab — you need to get to your meeting.'");
    expect(result).not.toContain("Sir");
  });

  it("passes an Arabic address term through as written", () => {
    const result = buildDescriptionInstruction("وهاب");
    expect(result).toContain("'وهاب —'");
  });

  it("trims whitespace around the address term", () => {
    const result = buildDescriptionInstruction("  Ma'am  ");
    expect(result).toContain("'Ma'am —'");
  });

  it("uses address-free urgency when no term is provided", () => {
    const result = buildDescriptionInstruction(undefined);
    expect(result).toContain("'It's time —'");
    expect(result).toContain("no 'Sir'");
    expect(result).toContain("never address the user");
    expect(result).not.toContain("'Sir —'");
  });

  it("treats an empty or whitespace-only term as unset", () => {
    expect(buildDescriptionInstruction("")).toBe(
      buildDescriptionInstruction(undefined)
    );
    expect(buildDescriptionInstruction("   ")).toBe(
      buildDescriptionInstruction(undefined)
    );
  });

  it("keeps the non-urgent tiers in both variants", () => {
    for (const result of [
      buildDescriptionInstruction("Wahab"),
      buildDescriptionInstruction(undefined),
    ]) {
      expect(result).toContain("'Heads up —'");
      expect(result).toContain("'Quick reminder —'");
    }
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

  it("describes the preDescription heads-up line", () => {
    const result = buildPreReminderInstruction();
    expect(result).toContain("preDescription");
    expect(result).toContain("Heads up — <event> in <N> minutes");
    expect(result).toContain("ONLY when preReminderMinutes > 0");
  });
});

// ─── normalizePreReminder ───────────────────────────────────────────────────

describe("normalizePreReminder", () => {
  it("passes through valid minutes and a heads-up line", () => {
    expect(normalizePreReminder(15, "Heads up — meeting with Ahmed in 15 minutes")).toEqual({
      preReminderMinutes: 15,
      preDescription: "Heads up — meeting with Ahmed in 15 minutes",
    });
  });

  it("parses numeric-string minutes", () => {
    expect(normalizePreReminder("10", "Heads up — flight in 10 minutes").preReminderMinutes).toBe(10);
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
    });
  });

  it("returns zero for negative minutes", () => {
    expect(normalizePreReminder(-5, "line").preReminderMinutes).toBe(0);
  });

  it("returns zero for undefined minutes", () => {
    expect(normalizePreReminder(undefined, undefined)).toEqual({
      preReminderMinutes: 0,
      preDescription: "",
    });
  });

  it("returns zero for non-numeric minutes", () => {
    expect(normalizePreReminder("soon", "line").preReminderMinutes).toBe(0);
  });

  it("returns zero for non-finite minutes", () => {
    expect(normalizePreReminder(Infinity, "line").preReminderMinutes).toBe(0);
  });

  it("normalizes greetings out of the pre description", () => {
    expect(normalizePreReminder(15, "Hey! Heads up — meeting in 15 minutes").preDescription).toBe(
      "Heads up — meeting in 15 minutes"
    );
  });

  it("returns an empty pre description when the model omits it", () => {
    expect(normalizePreReminder(15, undefined).preDescription).toBe("");
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

// ─── variantCountForTier ────────────────────────────────────────────────────

describe("variantCountForTier", () => {
  it("gives urgent the full ladder", () => {
    expect(variantCountForTier("urgent", false)).toBe(MAX_REPLAY_VARIANTS);
  });

  it("gives persistent reminders the full ladder regardless of tier", () => {
    expect(variantCountForTier("routine", true)).toBe(MAX_REPLAY_VARIANTS);
  });

  it("gives notice two variants", () => {
    expect(variantCountForTier("notice", false)).toBe(2);
  });

  it("gives routine a single extra variant", () => {
    expect(variantCountForTier("routine", false)).toBe(1);
  });
});

// ─── normalizeVariants ──────────────────────────────────────────────────────

describe("normalizeVariants", () => {
  it("keeps clean escalating lines", () => {
    expect(
      normalizeVariants(["Please take your medicine", "You must take it now"], 3, "Time for medicine")
    ).toEqual(["Please take your medicine", "You must take it now"]);
  });

  it("caps at maxCount", () => {
    expect(normalizeVariants(["a", "b", "c", "d"], 2, "base")).toEqual(["a", "b"]);
  });

  it("drops verbatim repeats of the base description", () => {
    expect(normalizeVariants(["Take your medicine", "another line"], 3, "Take your medicine")).toEqual([
      "another line",
    ]);
  });

  it("compares to the base case-insensitively", () => {
    expect(normalizeVariants(["TAKE YOUR MEDICINE"], 3, "take your medicine")).toEqual([]);
  });

  it("drops duplicate variants", () => {
    expect(normalizeVariants(["same line", "Same line", "other"], 3, "base")).toEqual([
      "same line",
      "other",
    ]);
  });

  it("drops empty and whitespace entries", () => {
    expect(normalizeVariants(["", "   ", "real line"], 3, "base")).toEqual(["real line"]);
  });

  it("strips greetings from variants", () => {
    expect(normalizeVariants(["Hey! Take your medicine now"], 3, "base")).toEqual([
      "Take your medicine now",
    ]);
  });

  it("returns [] for non-array input", () => {
    expect(normalizeVariants("not an array", 3, "base")).toEqual([]);
    expect(normalizeVariants(undefined, 3, "base")).toEqual([]);
  });

  it("returns [] when maxCount is zero", () => {
    expect(normalizeVariants(["a"], 0, "base")).toEqual([]);
  });
});

// ─── buildVariantInstruction ────────────────────────────────────────────────

describe("buildVariantInstruction", () => {
  it("includes the address term verbatim when set", () => {
    const result = buildVariantInstruction("Wahab");
    expect(result).toContain("'Wahab'");
    expect(result).not.toContain("never address the user");
  });

  it("supports an Arabic address term", () => {
    const result = buildVariantInstruction("وهاب");
    expect(result).toContain("'وهاب'");
  });

  it("trims surrounding whitespace from the term", () => {
    const result = buildVariantInstruction("  Ma'am  ");
    expect(result).toContain("'Ma'am'");
  });

  it("forbids invented names when no term is set", () => {
    const result = buildVariantInstruction(undefined);
    expect(result).toContain("never address the user by any name or title");
    expect(result).toContain("no 'Sir'");
  });

  it("treats empty and whitespace terms as unset", () => {
    expect(buildVariantInstruction("")).toBe(buildVariantInstruction(undefined));
    expect(buildVariantInstruction("   ")).toBe(buildVariantInstruction(undefined));
  });

  it("documents all three replay fields and the economize policy", () => {
    for (const result of [buildVariantInstruction("Wahab"), buildVariantInstruction(undefined)]) {
      expect(result).toContain('"urgency"');
      expect(result).toContain('"persistent"');
      expect(result).toContain('"variants"');
      expect(result).toContain(`${MAX_REPLAY_VARIANTS} variants`);
    }
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
