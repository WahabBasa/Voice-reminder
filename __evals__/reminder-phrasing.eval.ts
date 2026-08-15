/**
 * Live-model phrasing evals — NOT part of `npm test`.
 *
 * The jest suite pins the instructions we send the model; this file pins what
 * the model actually returns. It sends real transcripts through the exact
 * system prompt processVoiceReminderFast ships (buildSystemPrompt) to the same
 * model with the same call parameters, then checks the generated spoken lines
 * against the canon voice (OLD-95): ONE short present-tense sentence about the
 * thing itself — no openers or lead-ins, no greetings, no name, no wellness
 * commentary, no template echoes, inside the word budget, and variants that
 * each open differently.
 *
 * Run:   npm run eval
 * Needs: OPENROUTER_API_KEY in the environment (Convex holds it:
 *        `npx convex env get OPENROUTER_API_KEY`). Without it the suite skips.
 * Cost:  TRANSCRIPTS × SAMPLES_PER_TRANSCRIPT model calls per run.
 */
import OpenAI from "openai";

import { buildSystemPrompt } from "../convex/actions";
import { BANNED_OPENERS } from "../convex/helpers";

const API_KEY = process.env.OPENROUTER_API_KEY;
const describeLive = API_KEY ? describe : describe.skip;

if (!API_KEY) {
  // eslint-disable-next-line no-console
  console.warn("[eval] OPENROUTER_API_KEY not set — skipping live phrasing evals");
}

// Mirrors the processVoiceReminderFast call site (convex/actions.ts).
const MODEL = "google/gemini-3.1-flash-lite-preview";
const SAMPLES_PER_TRANSCRIPT = 3;

// Fixed context so runs are comparable day to day.
const PROMPT_CONTEXT = {
  currentDate: "2026-08-13",
  currentDayOfWeek: "Thursday",
  currentTime: "14:00",
  timezone: "Asia/Dubai",
};

// The battery leans on inputs that historically produced bad lines: "drink
// water" is the transcript that converged on every formula era in stored data.
const TRANSCRIPTS = [
  { name: "drink water (EN)", text: "Remind me to drink water at 8pm" },
  { name: "drink water (AR)", text: "ذكرني أن أشرب الماء الساعة ثمانية مساءً" },
  { name: "daily medicine", text: "Remind me to take my medicine every day at 9am" },
  { name: "meeting (pre-reminder)", text: "Remind me about my meeting with Ahmed tomorrow at 3pm" },
  { name: "mumbled input", text: "uh um the uh water thing you know at like uh" },
];

// Openers the prompt forbids, plus the label and lead-in families: imported
// from convex/helpers so this suite and the storage-time guard (guardSpokenLine)
// reject exactly the same wordings. Checked as prefixes of the normalized line.
//
// Nothing is exempt any more. The app used to prepend its own attention catch
// ("Heads up —") at TTS time, so those wordings had to be tolerated here;
// OLD-95 removed the feature, and what the model writes is what gets spoken.

const GREETINGS = ["hey", "hi ", "hello", "مرحبا", "أهلا", "أهلاً", "السلام"];

// Fragments of the JSON template that must never leak into stored fields (a
// real April 2026 bug: the model echoed the schema and it got voiced).
const TEMPLATE_ECHOES = ["short title", "2-4 words", "HH:MM", "YYYY-MM-DD", "what to say when"];

// Wellness/benefit commentary: the line says the thing and stops. "Drink your
// water right now." passes; "Drink your water to stay hydrated and healthy."
// is the failure mode this catches (the model's favourite way of padding a
// four-word task into a sentence that sounds like an ad).
// Deliberately phrases, not single words: "healthy" alone would fail a
// perfectly good "Cook a healthy dinner" the user asked for.
const WELLNESS_COMMENTARY = [
  "stay hydrated",
  "hydrated",
  "you will feel",
  "you'll feel",
  "feel better",
  "good for you",
  "for your health",
  "keep up the good",
  "well done",
  "take care of yourself",
  "لصحتك",
  "بصحتك",
];

// Addressing the user at all is out (no address term reaches the prompt any
// more), so an Arabic vocative or an English honorific is a violation.
const ADDRESS_FORMS = [/\bsir\b/i, /\bma'?am\b/i, /\bmy friend\b/i, /(^|\s)يا\s/u];

const wordCount = (line: string) => line.trim().split(/\s+/).filter(Boolean).length;

// One sentence means one terminator, and it is allowed to be missing.
const sentenceCount = (line: string) =>
  (line.trim().match(/[.!?؟۔]+(?=\s|$)/gu) ?? []).length;

const normalize = (line: string) =>
  line
    .trim()
    .replace(/^["'“”‘’—–\-\s]+/u, "")
    .toLowerCase();

const firstWord = (line: string) => normalize(line).split(/\s+/)[0] ?? "";

type SpokenLine = { field: string; text: string };

// Every phrasing rule for one spoken line. Returns human-readable violations.
function lintLine({ field, text }: SpokenLine, maxWords: number): string[] {
  const problems: string[] = [];
  const norm = normalize(text);
  for (const opener of BANNED_OPENERS) {
    if (norm.startsWith(opener)) {
      problems.push(`${field} opens with banned "${opener}": "${text}"`);
      break;
    }
  }
  for (const greeting of GREETINGS) {
    if (norm.startsWith(greeting)) {
      problems.push(`${field} opens with greeting: "${text}"`);
      break;
    }
  }
  if (wordCount(text) > maxWords) {
    problems.push(`${field} too long (${wordCount(text)} words, max ${maxWords}): "${text}"`);
  }
  for (const echo of TEMPLATE_ECHOES) {
    if (text.toLowerCase().includes(echo.toLowerCase())) {
      problems.push(`${field} echoes the JSON template ("${echo}"): "${text}"`);
    }
  }
  for (const phrase of WELLNESS_COMMENTARY) {
    if (text.toLowerCase().includes(phrase)) {
      problems.push(`${field} adds wellness commentary ("${phrase}"): "${text}"`);
    }
  }
  for (const form of ADDRESS_FORMS) {
    if (form.test(text)) {
      problems.push(`${field} addresses the user: "${text}"`);
    }
  }
  if (sentenceCount(text) > 1) {
    problems.push(`${field} is more than one sentence: "${text}"`);
  }
  return problems;
}

describeLive("reminder phrasing (live model)", () => {
  jest.setTimeout(180_000);

  // Jest still runs a `describe.skip` body to collect the names of the tests it
  // is skipping, so the client cannot be built here: with no key the OpenAI
  // constructor throws and a key-less `npm run eval` dies at collection instead
  // of reporting skips. Built on first use, which only the live tests reach.
  let client: OpenAI | undefined;
  const openrouter = () =>
    (client ??= new OpenAI({
      apiKey: API_KEY,
      baseURL: "https://openrouter.ai/api/v1",
    }));

  for (const transcript of TRANSCRIPTS) {
    it(`"${transcript.name}" produces clean spoken lines across ${SAMPLES_PER_TRANSCRIPT} samples`, async () => {
      const violations: string[] = [];
      const generated: string[] = [];

      for (let sample = 0; sample < SAMPLES_PER_TRANSCRIPT; sample++) {
        const label = `[${transcript.name} #${sample + 1}]`;
        const completion = await openrouter().chat.completions.create({
          model: MODEL,
          response_format: { type: "json_object" },
          max_tokens: 2000,
          messages: [
            { role: "system", content: buildSystemPrompt(PROMPT_CONTEXT) },
            { role: "user", content: transcript.text },
          ],
        });

        const raw = completion.choices[0]?.message?.content ?? "";
        let parsed: Record<string, unknown>;
        try {
          parsed = JSON.parse(raw);
        } catch {
          violations.push(`${label} returned invalid JSON: ${raw.slice(0, 200)}`);
          continue;
        }

        const description = typeof parsed.description === "string" ? parsed.description : "";
        const preDescription = typeof parsed.preDescription === "string" ? parsed.preDescription : "";
        const variants = Array.isArray(parsed.variants)
          ? (parsed.variants as unknown[]).filter((v): v is string => typeof v === "string")
          : [];

        generated.push(`${label} description: "${description}"`);
        for (const v of variants) generated.push(`${label} variant:     "${v}"`);
        if (preDescription) generated.push(`${label} pre:         "${preDescription}"`);

        if (!description.trim()) {
          violations.push(`${label} empty description`);
          continue;
        }

        // Budgets follow the prompt: 4-9 words for the line itself, under 12
        // for the heads-up (it has a time span to fit), 10 for a variant.
        violations.push(...lintLine({ field: `${label} description`, text: description }, 9));
        if (preDescription) {
          violations.push(...lintLine({ field: `${label} preDescription`, text: preDescription }, 12));
        }
        variants.forEach((variant, i) => {
          violations.push(...lintLine({ field: `${label} variants[${i}]`, text: variant }, 10));
        });

        // The ladder only reads as a new attempt when each rung opens fresh.
        const openers = [description, ...variants].map(firstWord);
        if (new Set(openers).size !== openers.length) {
          violations.push(`${label} repeated opening word across ladder: ${openers.join(", ")}`);
        }

        // Countdowns go stale the moment a line is heard late (pre-reminder
        // lines are exempt — theirs are required to name the lead time).
        for (const [i, line] of [description, ...variants].entries()) {
          if (/\bin \d+ (minutes?|mins?)\b/i.test(line) || /بعد \d+ دقيقة/u.test(line)) {
            violations.push(`${label} countdown in ${i === 0 ? "description" : `variants[${i - 1}]`}: "${line}"`);
          }
        }
      }

      // Print everything the model said so a pass is reviewable, not just green.
      // eslint-disable-next-line no-console
      console.log(`\n${generated.join("\n")}`);

      if (violations.length > 0) {
        throw new Error(`${violations.length} phrasing violation(s):\n${violations.join("\n")}`);
      }
    });
  }
});
