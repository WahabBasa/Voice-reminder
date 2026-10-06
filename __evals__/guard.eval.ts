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
  | { pass: true; lang: string; frequency?: string }
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
