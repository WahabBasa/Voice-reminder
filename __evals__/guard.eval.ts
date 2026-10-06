/**
 * Live-model guard evals (OLD-130) — NOT part of `npm test`.
 *
 * The jest suites pin the guard's prompt pieces and its gate against canned
 * responses; this file pins what the shipping model actually answers when it
 * is sent the guard_v1 prompt. Each transcript goes through the exact call the
 * creation-job worker makes (buildSystemPrompt with `guard: true`, same model,
 * same parameters), then through the same planner and gate the worker runs
 * (planTakeFromRawParse → guardTake), and the verdict is compared with what the
 * take should get.
 *
 * The battery is the morning that started this: "Kilometer got lead" is what
 * en-US dictation made of Swedish speech, and it became a reminder a minute
 * out. Swedish itself is in eleven_v3's list (convex/languages.ts), so a clear
 * Swedish request must PASS the guard with lang "sv".
 *
 * Run:   npm run eval -- __evals__/guard.eval.ts
 * Needs: OPENROUTER_API_KEY in the environment. Without it the suite skips.
 * Cost:  CASES × SAMPLES_PER_CASE model calls per run.
 */
import OpenAI from "openai";

import { buildSystemPrompt, planTakeFromRawParse } from "../convex/actions";
import { guardTake, type GuardDetail } from "../convex/creationValidate";

const API_KEY = process.env.OPENROUTER_API_KEY;
const describeLive = API_KEY ? describe : describe.skip;

if (!API_KEY) {
  // eslint-disable-next-line no-console
  console.warn("[eval] OPENROUTER_API_KEY not set — skipping live guard evals");
}

// Mirrors the creation-job worker's parse call (convex/creationJobActions.ts).
const MODEL = "openai/gpt-5.6-luna";
const SAMPLES_PER_CASE = 3;

type PromptContext = {
  currentDate: string;
  currentDayOfWeek: string;
  currentTime: string;
  timezone: string;
};

const PROMPT_CONTEXT: PromptContext = {
  currentDate: "2026-08-13",
  currentDayOfWeek: "Thursday",
  currentTime: "14:00",
  timezone: "Asia/Dubai",
};

/**
 * The instant a context's wall clock names, for the guard's past-time check.
 * Every context here is in Asia/Dubai, which is UTC+4 all year round.
 */
function nowFor(context: PromptContext): number {
  const [year, month, day] = context.currentDate.split("-").map(Number);
  const [hours, minutes] = context.currentTime.split(":").map(Number);
  return Date.UTC(year, month - 1, day, hours - 4, minutes);
}

type Expected =
  | { pass: true; lang: string; frequency?: string; time?: string; date?: string }
  | { pass: false; detail: GuardDetail; pastTime?: string };

const CASES: { name: string; text: string; expected: Expected; context?: PromptContext }[] = [
  {
    name: "en-US dictation of Swedish speech",
    text: "Kilometer got lead",
    expected: { pass: false, detail: "not_understood" },
  },
  {
    name: "Swedish, clear request with a time",
    text: "påminn mig klockan tio om tandläkaren",
    expected: { pass: true, lang: "sv", frequency: "once" },
  },
  {
    name: "one-off with no time",
    text: "remind me to call mom",
    expected: { pass: false, detail: "no_time" },
  },
  {
    name: "repeating with no time keeps its default",
    text: "every day drink water",
    expected: { pass: true, lang: "en", frequency: "daily" },
  },
  {
    name: "normal English one-off",
    text: "Remind me to take my medicine tomorrow at 9pm",
    expected: { pass: true, lang: "en", frequency: "once" },
  },
  // The founder's take (2026-10-06): "today at 10", said at 11:41. Ten this
  // morning has gone, so the guard asks rather than guessing 22:00.
  {
    name: "a one-off today at a time that has already passed",
    text: "I'll drink water today at 10",
    context: {
      currentDate: "2026-10-06",
      currentDayOfWeek: "Tuesday",
      currentTime: "11:41",
      timezone: "Asia/Dubai",
    },
    expected: { pass: false, detail: "past_time", pastTime: "10:00" },
  },
  {
    name: "the same take in Arabic",
    text: "هشرب مية النهارده الساعة عشرة",
    context: {
      currentDate: "2026-10-06",
      currentDayOfWeek: "Tuesday",
      currentTime: "11:41",
      timezone: "Asia/Dubai",
    },
    expected: { pass: false, detail: "past_time", pastTime: "10:00" },
  },
  // The live rejection (2026-10-06): a clean Swedish transcript phrased as
  // "I will remind you to…" came back understood=false, twice. Any phrasing
  // that names a task and/or a time is a request; only takes with nothing
  // actionable in them are not understood.
  {
    name: "Swedish, 'I will remind you' phrasing with a relative time",
    text: "Jag kommer att påminna dig om att dricka vatten om tio minuter.",
    expected: { pass: true, lang: "sv", frequency: "once", time: "14:10" },
  },
  {
    name: "Swedish, 'I have to' phrasing",
    text: "Jag måste ringa mamma klockan fem",
    expected: { pass: true, lang: "sv", frequency: "once" },
  },
  {
    name: "Arabic, remind me at ten tonight",
    text: "ذكرني أشرب مية الساعة عشرة بالليل",
    expected: { pass: true, lang: "ar", frequency: "once", time: "22:00" },
  },
  {
    name: "English, 'I'll' phrasing",
    text: "I'll call the dentist tomorrow at 9",
    expected: { pass: true, lang: "en", frequency: "once" },
  },
  {
    name: "English, 'don't let me forget' phrasing",
    text: "don't let me forget the keys in 20 minutes",
    expected: { pass: true, lang: "en", frequency: "once", time: "14:20" },
  },
  // The rule is about meaning, not about any one language: an action and/or a
  // time, in any grammar. These keep the eval from passing on Swedish alone.
  // Clock: Thursday 2026-08-13 14:00 (PROMPT_CONTEXT).
  {
    name: "Swahili, Swahili clock (saa nne asubuhi = 10 AM)",
    text: "Nikumbushe kunywa maji saa nne asubuhi",
    expected: { pass: true, lang: "sw", frequency: "once", time: "10:00" },
  },
  {
    name: "German, 'I have to' with halb drei",
    text: "Ich muss um halb drei den Arzt anrufen",
    expected: { pass: true, lang: "de", frequency: "once", time: "14:30" },
  },
  {
    name: "Japanese, bare statement tomorrow at 3 PM",
    text: "明日の午後3時に薬を飲む",
    expected: { pass: true, lang: "ja", frequency: "once", time: "15:00", date: "2026-08-14" },
  },
  {
    name: "Hinglish, kal shaam 5 baje",
    text: "kal shaam 5 baje mummy ko call karna",
    expected: { pass: true, lang: "hi", frequency: "once", time: "17:00", date: "2026-08-14" },
  },
  {
    name: "Spanish, 'I will remind you' phrasing in an hour",
    text: "Te voy a recordar llamar a Juan en una hora",
    expected: { pass: true, lang: "es", frequency: "once", time: "15:00" },
  },
  {
    name: "French, 'don't forget' in a quarter of an hour",
    text: "N'oublie pas de sortir le linge dans un quart d'heure",
    expected: { pass: true, lang: "fr", frequency: "once", time: "14:15" },
  },
  {
    name: "silence hallucination",
    text: "Thank you for watching.",
    expected: { pass: false, detail: "not_understood" },
  },
  {
    name: "unrelated chatter with no task",
    text: "You're coming up for me not you",
    expected: { pass: false, detail: "not_understood" },
  },
];

describeLive("parse guard (live model)", () => {
  jest.setTimeout(180_000);

  // Built on first use — see reminder-phrasing.eval.ts for why not at collection.
  let client: OpenAI | undefined;
  const openrouter = () =>
    (client ??= new OpenAI({
      apiKey: API_KEY,
      baseURL: "https://openrouter.ai/api/v1",
    }));

  for (const testCase of CASES) {
    it(`"${testCase.name}" gets the expected verdict across ${SAMPLES_PER_CASE} samples`, async () => {
      const misses: string[] = [];
      const context = testCase.context ?? PROMPT_CONTEXT;

      for (let sample = 0; sample < SAMPLES_PER_CASE; sample++) {
        const label = `[${testCase.name} #${sample + 1}]`;
        const completion = await openrouter().chat.completions.create({
          model: MODEL,
          response_format: { type: "json_object" },
          reasoning_effort: "none",
          max_tokens: 2000,
          messages: [
            { role: "system", content: buildSystemPrompt(context, { guard: true }) },
            { role: "user", content: testCase.text },
          ],
        });
        const raw = completion.choices[0]?.message?.content ?? "";

        let take;
        try {
          take = planTakeFromRawParse(raw, {
            transcript: testCase.text,
            currentTime: context.currentTime,
            currentDate: context.currentDate,
            timezone: context.timezone,
          });
        } catch {
          misses.push(`${label} unplannable response: ${raw.slice(0, 200)}`);
          continue;
        }
        // `now` as the worker passes it, so the past-time check runs too.
        const verdict = guardTake({ ...take, now: nowFor(context) });
        const expected = testCase.expected;

        if (expected.pass) {
          if (!verdict.ok) {
            misses.push(`${label} rejected as ${verdict.detail}: ${raw.slice(0, 300)}`);
            continue;
          }
          const langs = take.plans.map((plan) => plan.lang);
          if (langs.some((lang) => lang !== expected.lang)) {
            misses.push(`${label} lang ${JSON.stringify(langs)}, wanted "${expected.lang}"`);
          }
          if (
            expected.frequency !== undefined &&
            take.plans.some((plan) => plan.frequency !== expected.frequency)
          ) {
            misses.push(`${label} frequency ${take.plans.map((p) => p.frequency).join(",")}`);
          }
          if (expected.time !== undefined && take.plans.some((plan) => plan.time !== expected.time)) {
            misses.push(`${label} time ${take.plans.map((p) => p.time).join(",")}, wanted ${expected.time}`);
          }
          if (expected.date !== undefined && take.plans.some((plan) => plan.date !== expected.date)) {
            misses.push(`${label} date ${take.plans.map((p) => p.date).join(",")}, wanted ${expected.date}`);
          }
        } else if (verdict.ok || verdict.detail !== expected.detail) {
          misses.push(
            `${label} verdict ${verdict.ok ? "ok" : verdict.detail}, wanted ${expected.detail}: ${raw.slice(0, 300)}`
          );
        } else if (expected.pastTime !== undefined && verdict.pastTime !== expected.pastTime) {
          misses.push(`${label} pastTime ${verdict.pastTime}, wanted ${expected.pastTime}`);
        }
      }

      expect(misses).toEqual([]);
    });
  }
});
