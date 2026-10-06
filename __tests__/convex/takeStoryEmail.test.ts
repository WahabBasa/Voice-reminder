/**
 * The founder's per-take email (convex/takeStoryEmail.ts): one short email
 * per take. Pure, so plain jest.
 *
 * `PRINT_SAMPLES=1` prints the two reference emails (the Swedish take that
 * wasn't understood, and the Arabic one the server retry recovered) so the
 * founder can preview them.
 */

import {
  addTranslations,
  attemptLooksSilent,
  buildTakeStoryEmail,
  buildTakeStorySubject,
  cityFromTimezone,
  classifyStory,
  cleanTranslation,
  describeWhen,
  escapeHtml,
  firstSeenLabel,
  languageFromParseRaw,
  looksInvented,
  needsTranslation,
  voiceRouteLabel,
  type StoryAttempt,
  type TakeStoryInput,
} from "../../convex/takeStoryEmail";
import { TEXT_RULE } from "../../convex/emailHtml";

const DEVICE_ID = "0123456789abcdef0123456789abcdef";
// 2026-10-06 08:26 UTC = 12:26 in Dubai.
const AT = Date.UTC(2026, 9, 6, 8, 26, 0);
const HOUR = 3_600_000;
const DAY = 24 * HOUR;

function deviceAttempt(over: Partial<StoryAttempt> = {}): StoryAttempt {
  return {
    generation: 1,
    source: "device",
    status: "failed",
    transcript: "You're coming for another minute",
    deviceSttLocale: "en-US",
    deviceSttEngine: "transcriber",
    deviceSttMs: 820,
    parseMs: 1143,
    totalMs: 1306,
    failure: {
      errorCode: "unparseable",
      errorDetail: "not_understood",
      parseRaw: '{"understood":false,"language":"en","reminders":[]}',
      failedTakeId: "k57a1failedtake1",
      hasAudio: false,
    },
    ...over,
  };
}

/** The server's run, as the real email had it: no detectedLanguage, the language only in the parse answer. */
function cloudAttempt(over: Partial<StoryAttempt> = {}): StoryAttempt {
  return {
    generation: 2,
    source: "cloud",
    status: "failed",
    transcript: "Jag kommer att påminna dig om att dricka vatten om tio minuter.",
    sttModel: "openai/gpt-4o-mini-transcribe",
    sttFallbackUsed: false,
    audioSeconds: 3.4,
    sttMs: 1450,
    parseMs: 1020,
    totalMs: 2900,
    failure: {
      errorCode: "unparseable",
      errorDetail: "not_understood",
      parseRaw: '{"understood":false,"language":"sv","reminders":[]}',
      failedTakeId: "k57a2failedtake2",
      hasAudio: true,
    },
    ...over,
  };
}

/** Today's real email: the phone misheard Swedish as English, the server got it but the parser said no. */
const SWEDISH_FAILED: TakeStoryInput = {
  creationId: "6f1c2a9e-3b7d-4c11-9e0a-5d2f8b7c4e31",
  deviceTag: "ba7816bf",
  timezone: "Asia/Dubai",
  locale: "en-AE",
  buildNumber: "9",
  updateId: "01a10b10-0000-4000-8000-000000000000",
  iosVersion: "26.0.1",
  recordedAt: AT,
  newDevice: true,
  firstTake: true,
  firstSeenAt: AT - 10 * 60_000,
  attempts: [deviceAttempt(), cloudAttempt()],
  final: "discarded",
  reminders: [],
};

const SWEDISH_TRANSLATED: TakeStoryInput = {
  ...SWEDISH_FAILED,
  attempts: [
    SWEDISH_FAILED.attempts[0],
    { ...SWEDISH_FAILED.attempts[1], translation: "I will remind you to drink water in ten minutes." },
  ],
};

/** An Arabic take: the phone misheard it, the server retry made the reminder. */
const ARABIC_RECOVERED: TakeStoryInput = {
  creationId: "c3e9d0b4-71aa-4f6e-8a52-0b9d6e2f1a77",
  deviceTag: "4e07408c",
  timezone: "Asia/Dubai",
  locale: "ar-AE",
  buildNumber: "9",
  updateId: "01a10b10-0000-4000-8000-000000000000",
  iosVersion: "26.0",
  recordedAt: Date.UTC(2026, 9, 6, 10, 12, 0), // 14:12 in Dubai
  newDevice: false,
  firstTake: false,
  firstSeenAt: Date.UTC(2026, 8, 20, 9, 0, 0),
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
      translation: "Remind me to call my mom at five.",
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

/** One failed server attempt, for the per-outcome cases. */
function failedWith(over: Partial<StoryAttempt>, input: Partial<TakeStoryInput> = {}): TakeStoryInput {
  return {
    ...SWEDISH_FAILED,
    final: "failed",
    attempts: [cloudAttempt({ generation: 1, ...over })],
    ...input,
  };
}

/** The plain-text body above the details rule. */
function mainText(body: string): string {
  return body.split(TEXT_RULE)[0];
}

/** The HTML above the grey details block. */
function mainHtml(html: string): string {
  return html.split("border-top:1px solid")[0];
}

if (process.env.PRINT_SAMPLES) {
  for (const input of [SWEDISH_TRANSLATED, ARABIC_RECOVERED]) {
    const email = buildTakeStoryEmail(input);
    // eslint-disable-next-line no-console
    console.log(`Subject: ${email.subject}\n\n${email.body}\n\n---- html ----\n${email.html}`);
  }
}

// ─── the layout ──────────────────────────────────────────────────────────────

describe("the email reads in five seconds", () => {
  it("renders the Swedish take as designed", () => {
    const { subject, body } = buildTakeStoryEmail(SWEDISH_TRANSLATED);
    expect(subject).toBe("Remi ❌ Not understood · Swedish · Dubai");
    expect(mainText(body)).toBe(
      [
        "❌ Not understood",
        `They saw: "Didn't catch that — tap to record again", then swiped it away`,
        "",
        "Language     Swedish (server) · phone listened in English",
        "When         12:26 Dubai time · first seen today",
        "",
        "PHONE HEARD",
        `"You're coming for another minute"`,
        "",
        "SERVER HEARD",
        `"Jag kommer att påminna dig om att dricka vatten om tio minuter."`,
        `In English: "I will remind you to drink water in ten minutes."`,
        "",
        "WHY",
        "The parser decided this wasn't a reminder.",
        "",
        "",
      ].join("\n")
    );
  });

  it("takes the server's language from the parse answer when detectedLanguage is unset", () => {
    expect(languageFromParseRaw('{"understood":false,"language":"sv","reminders":[]}')).toBe("sv");
    // Cut short at 4 KB: still found.
    expect(languageFromParseRaw('{"understood":true,"language":"ar","reminders":[{"title":"x')).toBe("ar");
    expect(languageFromParseRaw("not json")).toBeUndefined();
    expect(languageFromParseRaw(undefined)).toBeUndefined();
    const { body } = buildTakeStoryEmail(SWEDISH_FAILED);
    expect(body).toContain("Swedish (server)");
    expect(body).not.toContain("unknown");
  });

  it("puts no raw JSON, timings or update ids in the main body", () => {
    for (const input of [SWEDISH_TRANSLATED, ARABIC_RECOVERED]) {
      const { body, html } = buildTakeStoryEmail(input);
      for (const main of [mainText(body), mainHtml(html)]) {
        expect(main).not.toMatch(/\{\s*(&quot;|")/);
        expect(main).not.toMatch(/\d+ ms/);
        expect(main).not.toContain("01a10b10");
        expect(main).not.toContain(input.creationId);
      }
      expect(body).not.toContain("01a10b10");
      expect(body).not.toMatch(/\d+ ms/);
    }
  });

  it("keeps ids, codes, short parse answers and the audio command in the grey details", () => {
    const { body, html } = buildTakeStoryEmail(SWEDISH_FAILED);
    const details = body.split(TEXT_RULE)[1];
    expect(details).toContain(`Take ${SWEDISH_FAILED.creationId} · discarded`);
    expect(details).toContain("Device ba7816bf · build 9 · iOS 26.0.1 · en-AE");
    expect(details).toContain("Codes #1 unparseable/not_understood · #2 unparseable/not_understood");
    expect(details).toContain('#2 parse {"understood":false,"language":"sv","reminders":[]}');
    expect(details).toContain(`#2 audio: npx convex run failedTakes:audioUrl '{"id":"k57a2failedtake2"}'`);
    expect(details).toContain("#1 failedTakes k57a1failedtake1 (no audio: on-device take)");
    expect(html).toContain("<code");
    // A long parse answer stays out.
    const long = failedWith({
      failure: { errorCode: "unparseable", errorDetail: "not_understood", parseRaw: `{"language":"sv","x":"${"y".repeat(200)}"}` },
    });
    expect(buildTakeStoryEmail(long).body).not.toContain("y".repeat(50));
  });

  it("uses real HTML structure: headings, a label/value table, quotes with a left border", () => {
    const { html } = buildTakeStoryEmail(SWEDISH_TRANSLATED);
    expect(html).toContain("<h1");
    expect(html).toMatch(/<h2[^>]*>Server heard<\/h2>/);
    expect(html).toContain("<table");
    expect(html).toContain("<td");
    expect(html).toContain("<blockquote");
    expect(html).toContain("border-left:3px solid");
    expect(html).toContain("font-size:16px");
    expect(html).toContain("margin:24px 0 8px");
  });

  it("a recovered take shows what it created", () => {
    const { subject, body } = buildTakeStoryEmail(ARABIC_RECOVERED);
    expect(subject).toBe("Remi ⚠️ Recovered · Arabic · Dubai");
    const main = mainText(body);
    expect(main).toContain("CREATED\n\"اتصل بأمك\"\ntoday 17:00 · Arabic · Arabic voice");
    expect(main).toContain("Language     Arabic (server) · phone listened in English");
    expect(main).toContain("When         14:12 Dubai time · first seen earlier");
    expect(main).toContain(
      "WHY\nFirst try: the parser decided this wasn't a reminder. The server retry made the reminder."
    );
    expect(main).toContain('In English: "Remind me to call my mom at five."');
  });

  it("says when the user cancelled, or a retry was still running", () => {
    const cancelled = buildTakeStoryEmail({ ...SWEDISH_FAILED, final: "cancelled" });
    expect(cancelled.body).toContain("They saw: nothing, they cancelled the take");
    expect(cancelled.body).toContain("Then they cancelled the take.");
    const running = buildTakeStoryEmail({ ...SWEDISH_FAILED, final: "running" });
    expect(running.body).toContain("A retry was still running when this email went out.");
  });
});

// ─── subjects ────────────────────────────────────────────────────────────────

describe("the subject is outcome · language · city", () => {
  it("covers every outcome", () => {
    const worked: TakeStoryInput = {
      ...ARABIC_RECOVERED,
      attempts: [{ ...ARABIC_RECOVERED.attempts[1], generation: 1 }],
    };
    const cases: Array<[TakeStoryInput, string]> = [
      [worked, "Remi ✅ Created · Arabic · Dubai"],
      [ARABIC_RECOVERED, "Remi ⚠️ Recovered · Arabic · Dubai"],
      [SWEDISH_FAILED, "Remi ❌ Not understood · Swedish · Dubai"],
      [
        failedWith({
          transcript: "Thank you for watching.",
          sttModel: "openai/whisper-1",
          sttFallbackUsed: true,
          failure: { errorCode: "unparseable", errorDetail: "not_understood" },
        }),
        "Remi ❌ Silent · Dubai",
      ],
      [
        failedWith({
          transcript: "Påminn mig om tandläkaren",
          failure: { errorCode: "unparseable", errorDetail: "no_time", parseRaw: '{"language":"sv"}' },
        }),
        "Remi ⏳ Needs a time · Swedish · Dubai",
      ],
      [
        failedWith({
          transcript: "Remind me at nine this morning",
          failure: { errorCode: "unparseable", errorDetail: "past_time", pastTime: "10:00", parseRaw: '{"language":"en"}' },
        }),
        "Remi ⏳ Needs a time · English · Dubai",
      ],
      [
        failedWith(
          {
            transcript: "Nikumbushe kunywa maji",
            failure: { errorCode: "unparseable", errorDetail: "unsupported_language", detectedLanguage: "sw" },
          },
          { timezone: "Africa/Nairobi" }
        ),
        "Remi ❌ Unsupported language · Swahili · Nairobi",
      ],
      [failedWith({ transcript: undefined, failure: { errorCode: "stt_failed" } }), "Remi ❌ Server error · Dubai"],
      [
        failedWith({ failure: { errorCode: "internal", parseRaw: undefined } }, { followUp: true }),
        "Remi ❌ Server error · Dubai (follow-up)",
      ],
    ];
    for (const [input, subject] of cases) expect(buildTakeStorySubject(input)).toBe(subject);
  });
});

// ─── a take that asked for a time ────────────────────────────────────────────

describe("a take that asked 'When should I remind you?'", () => {
  it("is ⏳ Needs a time, never ❌, and says what the card asked", () => {
    const email = buildTakeStoryEmail(
      failedWith(
        {
          transcript: "Påminn mig om tandläkaren",
          failure: { errorCode: "unparseable", errorDetail: "no_time", parseRaw: '{"language":"sv"}' },
        },
        { final: "discarded" }
      )
    );
    expect(email.subject).toBe("Remi ⏳ Needs a time · Swedish · Dubai");
    expect(email.subject).not.toContain("❌");
    const main = mainText(email.body);
    expect(main.split("\n")[0]).toBe("⏳ Needs a time");
    expect(main).toContain(`They saw: "When should I remind you?", then swiped it away`);
  });

  it("past_time keeps the time they said in what they saw", () => {
    const main = mainText(
      buildTakeStoryEmail(
        failedWith(
          { failure: { errorCode: "unparseable", errorDetail: "past_time", pastTime: "10:00" } },
          { final: "discarded" }
        )
      ).body
    );
    expect(main).toContain(
      `They saw: "10:00 has already passed today. When should I remind you?", then swiped it away`
    );
  });
});

// ─── why ─────────────────────────────────────────────────────────────────────

describe("WHY is one plain sentence", () => {
  function why(over: Partial<StoryAttempt>): string {
    const body = mainText(buildTakeStoryEmail(failedWith(over)).body);
    return body.split("WHY\n")[1].trim();
  }

  it("for each errorDetail", () => {
    expect(why({})).toBe("The parser decided this wasn't a reminder.");
    expect(why({ failure: { errorCode: "unparseable", errorDetail: "no_time" } })).toBe(
      "There was no time in it, so Remi asked when."
    );
    expect(why({ failure: { errorCode: "unparseable", errorDetail: "past_time", pastTime: "10:00" } })).toBe(
      "They said 10:00 but it had already passed."
    );
    expect(
      why({ failure: { errorCode: "unparseable", errorDetail: "unsupported_language", detectedLanguage: "sw" } })
    ).toBe("Remi doesn't speak Swahili yet.");
    expect(why({ failure: { errorCode: "silent", errorDetail: "silent" } })).toBe("The recording was silent.");
    expect(why({ failure: { errorCode: "internal" } })).toBe("Server error, or the server timed out.");
  });

  it("says the backup transcriber made it up from silence", () => {
    const silent = cloudAttempt({
      transcript: "Thank you for watching.",
      sttModel: "openai/whisper-1",
      sttFallbackUsed: true,
    });
    expect(attemptLooksSilent(silent)).toBe(true);
    expect(attemptLooksSilent({ ...silent, sttFallbackUsed: false })).toBe(false);
    expect(looksInvented("Subtitles by the Amara.org community")).toBe(true);
    expect(looksInvented("Remind me to call mom")).toBe(false);
    expect(why(silent)).toBe("The recording was silent. The backup transcriber made this up from silence.");
  });
});

// ─── translation ─────────────────────────────────────────────────────────────

describe("the In English line", () => {
  it("is there when a translation was provided, and absent when not", () => {
    expect(buildTakeStoryEmail(SWEDISH_TRANSLATED).body).toContain(
      'In English: "I will remind you to drink water in ten minutes."'
    );
    expect(buildTakeStoryEmail(SWEDISH_TRANSLATED).html).toContain("In English: &quot;I will remind you");
    const plain = buildTakeStoryEmail(SWEDISH_FAILED);
    expect(plain.body).not.toContain("In English");
    expect(plain.html).not.toContain("In English");
  });

  it("is asked for the server's non-English words only, not the English phone text", async () => {
    expect(needsTranslation(SWEDISH_FAILED.attempts[0])).toBe(false);
    expect(needsTranslation(SWEDISH_FAILED.attempts[1])).toBe(true);
    expect(needsTranslation(deviceAttempt({ deviceSttLocale: "ar-AE", transcript: "ذكرني" }))).toBe(true);
    expect(needsTranslation(cloudAttempt({ transcript: "Thank you for watching.", sttFallbackUsed: true }))).toBe(false);
    // Unknown language: only text with non-ASCII letters.
    expect(needsTranslation(cloudAttempt({ failure: {}, transcript: "Call mom… now" }))).toBe(false);
    expect(needsTranslation(cloudAttempt({ failure: {}, transcript: "Ring mamma på fredag" }))).toBe(true);

    const asked: string[] = [];
    const out = await addTranslations(SWEDISH_FAILED, async (text) => {
      asked.push(text);
      return '"I will remind you to drink water in ten minutes."';
    });
    expect(asked).toEqual(["Jag kommer att påminna dig om att dricka vatten om tio minuter."]);
    expect(out.attempts[0].translation).toBeUndefined();
    expect(out.attempts[1].translation).toBe("I will remind you to drink water in ten minutes.");
  });

  it("never blocks the email: a failing translator just drops the line", async () => {
    const out = await addTranslations(SWEDISH_FAILED, async () => {
      throw new Error("timeout");
    });
    expect(out.attempts.every((a) => a.translation === undefined)).toBe(true);
    expect(buildTakeStoryEmail(out).body).not.toContain("In English");
    expect(cleanTranslation("", "x")).toBeUndefined();
    expect(cleanTranslation("Hej", "hej")).toBeUndefined();
    expect(cleanTranslation(undefined, "x")).toBeUndefined();
  });
});

// ─── first seen ──────────────────────────────────────────────────────────────

describe("first seen replaces 'new user'", () => {
  it("says today / this week / earlier in the user's own calendar", () => {
    expect(firstSeenLabel({ ...SWEDISH_FAILED, firstSeenAt: AT - HOUR })).toBe("first seen today");
    expect(firstSeenLabel({ ...SWEDISH_FAILED, firstSeenAt: AT - 3 * DAY })).toBe("first seen this week");
    expect(firstSeenLabel({ ...SWEDISH_FAILED, firstSeenAt: AT - 30 * DAY })).toBe("first seen earlier");
    expect(firstSeenLabel({ ...SWEDISH_FAILED, firstSeenAt: AT - HOUR, deviceSeeded: true })).toBe(
      "first seen earlier"
    );
    expect(firstSeenLabel({ ...SWEDISH_FAILED, firstSeenAt: undefined })).toBeUndefined();
    const { subject, body } = buildTakeStoryEmail(SWEDISH_FAILED);
    expect(`${subject}${body}`).not.toContain("new user");
  });
});

// ─── safety ──────────────────────────────────────────────────────────────────

describe("escaping, truncation and privacy", () => {
  it("HTML-escapes every value", () => {
    expect(escapeHtml(`<a href="x">'&'</a>`)).toBe("&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;");
    const input = failedWith({
      transcript: `<script>alert("x")</script> & <b>bold</b>`,
      translation: "<i>made</i>",
    });
    const { html } = buildTakeStoryEmail({
      ...input,
      creationId: "<img src=x onerror=alert(1)>",
      deviceTag: "<u>tag</u>",
    });
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("<b>bold</b>");
    expect(html).not.toContain("<i>made</i>");
    expect(html).not.toContain("<img src=x");
    expect(html).not.toContain("<u>tag</u>");
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
    for (const email of [
      buildTakeStoryEmail(input),
      buildTakeStoryEmail({ ...ARABIC_RECOVERED, ...smuggled } as TakeStoryInput),
    ]) {
      const all = `${email.subject}\n${email.body}\n${email.html}`;
      expect(all).not.toContain(DEVICE_ID);
    }
  });
});

describe("helpers", () => {
  it("classifies worked / recovered / failed", () => {
    expect(classifyStory(SWEDISH_FAILED)).toEqual({ kind: "failed", reason: "not_understood" });
    expect(classifyStory(ARABIC_RECOVERED)).toEqual({ kind: "recovered", onServer: true });
    expect(classifyStory({ ...ARABIC_RECOVERED, attempts: [ARABIC_RECOVERED.attempts[1]] })).toEqual({
      kind: "worked",
    });
  });

  it("names the city from the time zone", () => {
    expect(cityFromTimezone("Europe/Stockholm")).toBe("Stockholm");
    expect(cityFromTimezone("America/Argentina/Buenos_Aires")).toBe("Buenos Aires");
    expect(cityFromTimezone(undefined)).toBe("an unknown place");
  });

  it("says when a reminder fires, relative to the take", () => {
    const at = Date.UTC(2026, 9, 6, 7, 6, 0);
    const tomorrow = { title: "x", onceAt: Date.UTC(2026, 9, 7, 8, 0, 0), tzid: "Europe/Stockholm" };
    expect(describeWhen(tomorrow, at, "Europe/Stockholm")).toBe("tomorrow 10:00");
    expect(describeWhen({ ...tomorrow, onceAt: Date.UTC(2026, 9, 9, 6, 30, 0) }, at, undefined)).toBe(
      "Fri 9 Oct 08:30"
    );
    expect(describeWhen({ title: "x", frequency: "daily", time: "08:00" }, at, undefined)).toBe(
      "every day at 08:00"
    );
    expect(describeWhen({ title: "x", frequency: "weekly", days: ["Mon", "Thu"], time: "07:15" }, at, undefined)).toBe(
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
