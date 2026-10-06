/**
 * The founder's per-take email (convex/takeStoryEmail.ts): one email that
 * tells a take's whole story. Pure, so plain jest.
 *
 * `PRINT_SAMPLES=1` prints the two reference emails (the Swedish failed take
 * and the Arabic recovered one) so the founder can preview them.
 */

import {
  attemptLooksSilent,
  buildTakeStoryEmail,
  buildTakeStorySubject,
  cityFromTimezone,
  classifyStory,
  describeWhen,
  escapeHtml,
  looksInvented,
  voiceRouteLabel,
  type StoryAttempt,
  type TakeStoryInput,
} from "../../convex/takeStoryEmail";

const DEVICE_ID = "0123456789abcdef0123456789abcdef";
// 2026-10-06 07:06 UTC = 09:06 in Stockholm, 11:06 in Dubai.
const AT = Date.UTC(2026, 9, 6, 7, 6, 0);

function deviceAttempt(over: Partial<StoryAttempt> = {}): StoryAttempt {
  return {
    generation: 1,
    source: "device",
    status: "failed",
    transcript: "Kilometer got lead",
    deviceSttLocale: "en-US",
    deviceSttEngine: "transcriber",
    deviceSttMs: 820,
    parseMs: 950,
    totalMs: 1100,
    failure: {
      errorCode: "unparseable",
      errorDetail: "not_understood",
      failedTakeId: "k57a1failedtake1",
      hasAudio: false,
    },
    ...over,
  };
}

function cloudAttempt(over: Partial<StoryAttempt> = {}): StoryAttempt {
  return {
    generation: 2,
    source: "cloud",
    status: "failed",
    transcript: "Kom ihåg att… nej, vänta, jag vet inte",
    sttModel: "openai/gpt-4o-transcribe",
    sttFallbackUsed: false,
    language: "sv",
    audioSeconds: 3.4,
    sttMs: 1450,
    parseMs: 1020,
    totalMs: 2900,
    failure: {
      errorCode: "unparseable",
      errorDetail: "not_understood",
      detectedLanguage: "sv",
      parseRaw: '{"understood":false,"language":"sv","reminders":[]}',
      failedTakeId: "k57a2failedtake2",
      hasAudio: true,
    },
    ...over,
  };
}

/** Today's Swedish take: the phone misheard it, the server retry could not use it. */
const SWEDISH_FAILED: TakeStoryInput = {
  creationId: "6f1c2a9e-3b7d-4c11-9e0a-5d2f8b7c4e31",
  deviceTag: "ba7816bf",
  timezone: "Europe/Stockholm",
  locale: "sv-SE",
  buildNumber: "9",
  updateId: "upd-42",
  iosVersion: "26.0.1",
  recordedAt: AT,
  newDevice: true,
  firstTake: true,
  attempts: [deviceAttempt(), cloudAttempt()],
  final: "failed",
  reminders: [],
};

/** Today's Arabic take: the phone misheard it, the server retry made the reminder. */
const ARABIC_RECOVERED: TakeStoryInput = {
  creationId: "c3e9d0b4-71aa-4f6e-8a52-0b9d6e2f1a77",
  deviceTag: "4e07408c",
  timezone: "Asia/Dubai",
  locale: "ar-AE",
  buildNumber: "9",
  updateId: "upd-42",
  iosVersion: "26.0",
  recordedAt: Date.UTC(2026, 9, 6, 10, 12, 0), // 14:12 in Dubai
  newDevice: false,
  firstTake: false,
  attempts: [
    deviceAttempt({
      transcript: "Then he moved to Dallas",
      failure: { errorCode: "unparseable", errorDetail: "not_understood", failedTakeId: "k57b1failedtake1" },
    }),
    {
      generation: 2,
      source: "cloud",
      status: "committed",
      transcript: "ذكرني أتصل بأمي الساعة خمسة",
      sttModel: "openai/gpt-4o-transcribe",
      sttFallbackUsed: false,
      language: "ar",
      audioSeconds: 2.8,
      sttMs: 1310,
      parseMs: 1180,
      totalMs: 3020,
    },
  ],
  final: "committed",
  reminders: [
    {
      title: "اتصل بأمك",
      spokenLine: "اتصل بأمك.",
      lang: "ar",
      onceAt: Date.UTC(2026, 9, 6, 13, 0, 0), // 17:00 in Dubai
      time: "17:00",
      frequency: "once",
      tzid: "Asia/Dubai",
    },
  ],
};

function failedWith(over: Partial<StoryAttempt>, input: Partial<TakeStoryInput> = {}): TakeStoryInput {
  return {
    ...SWEDISH_FAILED,
    newDevice: false,
    firstTake: false,
    attempts: [cloudAttempt({ generation: 1, ...over })],
    ...input,
  };
}

if (process.env.PRINT_SAMPLES) {
  for (const input of [SWEDISH_FAILED, ARABIC_RECOVERED]) {
    const email = buildTakeStoryEmail(input);
    // eslint-disable-next-line no-console
    console.log(`Subject: ${email.subject}\n\n${email.body}\n\n---- html ----\n${email.html}`);
  }
}

// ─── subjects ────────────────────────────────────────────────────────────────

describe("the subject says the outcome in plain words", () => {
  it("failed: a new user's first try that could not be understood", () => {
    expect(buildTakeStorySubject(SWEDISH_FAILED)).toBe(
      "Remi ❌ Couldn't understand — Stockholm (Swedish), new user's first try"
    );
  });

  it("recovered on the server retry", () => {
    expect(buildTakeStorySubject(ARABIC_RECOVERED)).toBe(
      "Remi ⚠️ Recovered on server retry — Dubai (Arabic)"
    );
  });

  it("silent: the backup transcriber invented text for silence", () => {
    const input = failedWith({
      transcript: "Thank you for watching.",
      sttModel: "openai/whisper-1",
      sttFallbackUsed: true,
      language: undefined,
      failure: { errorCode: "unparseable", errorDetail: "not_understood" },
    });
    expect(buildTakeStorySubject(input)).toBe("Remi ❌ Silent recording — Stockholm");
  });

  it("past_time", () => {
    const input = failedWith(
      {
        transcript: "Remind me at nine this morning",
        language: undefined,
        failure: { errorCode: "unparseable", errorDetail: "past_time", pastTime: "09:00" },
      },
      { timezone: "Asia/Dubai" }
    );
    expect(buildTakeStorySubject(input)).toBe("Remi ❌ Time already passed — Dubai");
    const { body } = buildTakeStoryEmail(input);
    expect(body).toContain("→ Rejected: the time had already passed (09:00)");
    expect(body).toContain("09:00 has already passed today. When should I remind you? Tap to record again.");
  });

  it("unsupported_language names the language once", () => {
    const input = failedWith(
      {
        transcript: "Nikumbushe kunywa maji",
        language: "sw",
        failure: { errorCode: "unparseable", errorDetail: "unsupported_language", detectedLanguage: "sw" },
      },
      { timezone: "Africa/Nairobi" }
    );
    expect(buildTakeStorySubject(input)).toBe("Remi ❌ Doesn't speak Swahili yet — Nairobi");
    expect(buildTakeStoryEmail(input).body).toContain("Remi doesn't speak Swahili yet");
  });

  it("no_time", () => {
    const input = failedWith({
      transcript: "Påminn mig om tandläkaren",
      failure: { errorCode: "unparseable", errorDetail: "no_time", detectedLanguage: "sv" },
    });
    expect(buildTakeStorySubject(input)).toBe("Remi ❌ No time in it — Stockholm (Swedish)");
    expect(buildTakeStoryEmail(input).body).toContain(
      "When should I remind you? Tap to record again with a time"
    );
  });

  it("a new device's first take that worked", () => {
    const input: TakeStoryInput = {
      ...ARABIC_RECOVERED,
      timezone: "Europe/Stockholm",
      newDevice: true,
      firstTake: true,
      attempts: [{ ...ARABIC_RECOVERED.attempts[1], generation: 1, language: "sv" }],
      reminders: [{ ...ARABIC_RECOVERED.reminders[0], title: "Tandläkaren", lang: "sv", tzid: "Europe/Stockholm" }],
    };
    expect(buildTakeStorySubject(input)).toBe("Remi ✅ First take worked — Stockholm (Swedish), new user");
  });

  it("server-side failures read plainly, and a follow-up says so", () => {
    expect(
      buildTakeStorySubject(failedWith({ transcript: undefined, failure: { errorCode: "stt_failed" } }))
    ).toBe("Remi ❌ Transcription failed — Stockholm (Swedish)");
    expect(
      buildTakeStorySubject(
        failedWith({ language: undefined, failure: { errorCode: "internal" } }, { followUp: true })
      )
    ).toBe("Remi ❌ Server error — Stockholm (follow-up)");
  });
});

// ─── grouping ────────────────────────────────────────────────────────────────

describe("one email tells every attempt", () => {
  it("numbers each attempt and says what happened between them", () => {
    const { body, html } = buildTakeStoryEmail(SWEDISH_FAILED);
    expect(body).toContain('1. 📱 Phone heard (on-device, English): "Kilometer got lead"');
    expect(body).toContain("→ Rejected: not a reminder → retried on the server.");
    expect(body).toContain(
      '2. ☁️ Server heard (language: Swedish, model: openai/gpt-4o-transcribe): "Kom ihåg att… nej, vänta, jag vet inte"'
    );
    expect(body.indexOf("1. 📱")).toBeLessThan(body.indexOf("2. ☁️"));
    expect(html).toContain("1. 📱 Phone heard");
    expect(html).toContain("2. ☁️ Server heard");
  });

  it("opens with a one-line summary that quotes the phone", () => {
    const { body } = buildTakeStoryEmail(SWEDISH_FAILED);
    expect(body.split("\n")[0]).toBe(
      "A new user in Stockholm (Swedish) recorded at 09:06 their time, their first take. " +
        "After 2 attempts, Remi couldn't understand it, and they saw: \"Didn't catch that — tap to record again\"."
    );
  });

  it("shows what they saw, the card's second line included", () => {
    const { body } = buildTakeStoryEmail(SWEDISH_FAILED);
    expect(body).toContain(
      "WHAT THEY SAW ON THE PHONE\nDidn't catch that — tap to record again\nRemi heard: \"Kom ihåg att… nej, vänta, jag vet inte\""
    );
  });

  it("a recovered take shows the reminder it made", () => {
    const { body } = buildTakeStoryEmail(ARABIC_RECOVERED);
    expect(body).toContain("→ Created \"اتصل بأمك\" for today 17:00");
    expect(body).toContain("REMINDER CREATED\nTitle: اتصل بأمك\nSpoken line: \"اتصل بأمك.\"\nFires: today 17:00");
    expect(body).toContain("Language: Arabic · voice: Arabic voice");
    expect(body).toContain("The first try failed (Remi couldn't understand it), Remi retried on the server");
  });

  it("puts the codes, ids and the audio command in the details", () => {
    const { body } = buildTakeStoryEmail(SWEDISH_FAILED);
    expect(body).toContain("Codes: #1 unparseable/not_understood · #2 unparseable/not_understood");
    expect(body).toContain(`Take: ${SWEDISH_FAILED.creationId} (final: failed)`);
    expect(body).toContain("Device: ba7816bf · build 9 · update upd-42 · iOS 26.0.1 · locale sv-SE · tz Europe/Stockholm");
    expect(body).toContain(`#2 audio: npx convex run failedTakes:audioUrl '{"id":"k57a2failedtake2"}'`);
    expect(body).toContain("#1 failedTakes id k57a1failedtake1 (no audio kept: on-device take)");
    expect(body).toContain("#2 (gen 2): stt openai/gpt-4o-transcribe, audio 3.4 s, stt 1450 ms, parse 1020 ms, total 2900 ms");
  });

  it("flags text the backup transcriber invented", () => {
    const silent = cloudAttempt({
      transcript: "Thank you for watching.",
      sttModel: "openai/whisper-1",
      sttFallbackUsed: true,
    });
    expect(attemptLooksSilent(silent)).toBe(true);
    expect(attemptLooksSilent({ ...silent, sttFallbackUsed: false })).toBe(false);
    expect(looksInvented("Subtitles by the Amara.org community")).toBe(true);
    expect(looksInvented("Remind me to call mom")).toBe(false);
    const { body } = buildTakeStoryEmail(failedWith(silent));
    expect(body).toContain("Server got silence; the backup invented this text.");
  });

  it("classifies worked / recovered / failed", () => {
    expect(classifyStory(SWEDISH_FAILED)).toEqual({ kind: "failed", reason: "not_understood" });
    expect(classifyStory(ARABIC_RECOVERED)).toEqual({ kind: "recovered", onServer: true });
    expect(
      classifyStory({ ...ARABIC_RECOVERED, attempts: [ARABIC_RECOVERED.attempts[1]] })
    ).toEqual({ kind: "worked" });
  });

  it("says when the user swiped the failed card away or cancelled", () => {
    expect(buildTakeStoryEmail({ ...SWEDISH_FAILED, final: "discarded" }).body).toContain(
      "Then they swiped the card away."
    );
    const cancelled = buildTakeStoryEmail({ ...SWEDISH_FAILED, final: "cancelled" });
    expect(cancelled.subject).toContain("Cancelled after a failure");
    expect(cancelled.body).toContain("Nothing: they cancelled the take.");
  });
});

// ─── safety ──────────────────────────────────────────────────────────────────

describe("escaping, truncation and privacy", () => {
  it("HTML-escapes every value", () => {
    expect(escapeHtml(`<a href="x">'&'</a>`)).toBe("&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;");
    const input = failedWith({ transcript: `<script>alert("x")</script> & <b>bold</b>` });
    const { html } = buildTakeStoryEmail({
      ...input,
      creationId: "<img src=x onerror=alert(1)>",
    });
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("<b>bold</b>");
    expect(html).not.toContain("<img src=x");
    expect(html).toContain("&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp; &lt;b&gt;bold&lt;/b&gt;");
  });

  it("cuts each transcript to 300 characters", () => {
    const { body, html } = buildTakeStoryEmail(failedWith({ transcript: "å".repeat(500) }));
    expect(body).toContain(`"${"å".repeat(299)}…"`);
    expect(body).not.toContain("å".repeat(300));
    expect(html).not.toContain("å".repeat(300));
  });

  it("never carries the deviceId, even smuggled in", () => {
    const smuggled = { deviceId: DEVICE_ID };
    const input = {
      ...SWEDISH_FAILED,
      ...smuggled,
      attempts: SWEDISH_FAILED.attempts.map((a) => ({ ...a, ...smuggled })),
    } as TakeStoryInput;
    for (const email of [buildTakeStoryEmail(input), buildTakeStoryEmail({ ...ARABIC_RECOVERED, ...smuggled } as TakeStoryInput)]) {
      const all = `${email.subject}\n${email.body}\n${email.html}`;
      expect(all).not.toContain(DEVICE_ID);
    }
  });
});

describe("helpers", () => {
  it("names the city from the time zone", () => {
    expect(cityFromTimezone("Europe/Stockholm")).toBe("Stockholm");
    expect(cityFromTimezone("America/Argentina/Buenos_Aires")).toBe("Buenos Aires");
    expect(cityFromTimezone(undefined)).toBe("an unknown place");
  });

  it("says when a reminder fires, relative to the take", () => {
    const tomorrow = { title: "x", onceAt: Date.UTC(2026, 9, 7, 8, 0, 0), tzid: "Europe/Stockholm" };
    expect(describeWhen(tomorrow, AT, "Europe/Stockholm")).toBe("tomorrow 10:00");
    expect(describeWhen({ ...tomorrow, onceAt: Date.UTC(2026, 9, 9, 6, 30, 0) }, AT, undefined)).toBe(
      "Fri 9 Oct 08:30"
    );
    expect(describeWhen({ title: "x", frequency: "daily", time: "08:00" }, AT, undefined)).toBe(
      "every day at 08:00"
    );
    expect(describeWhen({ title: "x", frequency: "weekly", days: ["Mon", "Thu"], time: "07:15" }, AT, undefined)).toBe(
      "every Mon, Thu at 07:15"
    );
  });

  it("names the voice route the way pickVoiceRoute does", () => {
    expect(voiceRouteLabel("en")).toBe("English voice");
    expect(voiceRouteLabel(undefined)).toBe("English voice");
    expect(voiceRouteLabel("ar")).toBe("Arabic voice");
    expect(voiceRouteLabel("sv")).toBe("multilingual voice");
  });
});
