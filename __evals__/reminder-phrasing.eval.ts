/**
 * Live-model phrasing evals — NOT part of `npm test`.
 *
 * The jest suite pins the instructions we send the model; this file pins what
 * the model actually returns. It sends real transcripts through the exact
 * system prompt processVoiceReminderFast ships (buildSystemPrompt) to the same
 * model with the same call parameters, then checks the generated spoken lines
 * against the canon voice (OLD-95, re-cut in OLD-104): ONE short present-tense
 * sentence in one of two shapes — a bare imperative for something the user does
 * ("Drink your water."), "[the thing] is right now" for something that happens
 * ("Your son's game is right now.") — with no openers or lead-ins, no greetings,
 * no name, no politeness, no wellness commentary, no template echoes, and
 * inside the word budget.
 *
 * There used to be one more check here: the replay variants had to each open on
 * a different word, so the ladder read as a fresh attempt rather than the same
 * sentence again. OLD-108 retired the ladder — the nag repeats the base line —
 * so the check went with the behavior it policed.
 *
 * Run:   npm run eval
 * Needs: OPENROUTER_API_KEY in the environment (Convex holds it:
 *        `npx convex env get OPENROUTER_API_KEY`). Without it the suite skips.
 * Cost:  TRANSCRIPTS × SAMPLES_PER_TRANSCRIPT model calls per run.
 */
import OpenAI from "openai";

import { buildSystemPrompt } from "../convex/actions";
import { BANNED_OPENERS, normalizeParsedReminders } from "../convex/helpers";

const API_KEY = process.env.OPENROUTER_API_KEY;
const describeLive = API_KEY ? describe : describe.skip;

if (!API_KEY) {
  // eslint-disable-next-line no-console
  console.warn("[eval] OPENROUTER_API_KEY not set — skipping live phrasing evals");
}

// Mirrors the processVoiceReminderFast call site (convex/actions.ts).
const MODEL = "openai/gpt-5.6-luna";
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
// water." passes; "Drink your water to stay hydrated and healthy." is the
// failure mode this catches (the model's favourite way of padding a
// three-word task into a sentence that sounds like an ad).
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

// Politeness (OLD-104): an action line is a bare imperative, so a request
// wrapper anywhere in it is a violation — "Please take your pills." was canon
// until the two shapes replaced the three registers.
const POLITENESS = [/\bplease\b/i, /\bcould you\b/i, /\bwould you\b/i, /من فضلك/u, /لو سمحت/u, /رجاء/u];

// Framing on an action line (OLD-104): "Take your pills right now." pads a bare
// imperative with the tail that only the event shape is allowed to carry, which
// is why the exemption is the literal "is right now".
// English only — telling an Arabic imperative from an Arabic nominal sentence
// needs a parse, so a padded "اشرب ماءك الآن." is caught by review, not here.
const isPaddedAction = (line: string) =>
  /\bright now\b/i.test(line) && !/\bis right now\b/i.test(line);

const wordCount = (line: string) => line.trim().split(/\s+/).filter(Boolean).length;

// One sentence means one terminator, and it is allowed to be missing.
const sentenceCount = (line: string) =>
  (line.trim().match(/[.!?؟۔]+(?=\s|$)/gu) ?? []).length;

const normalize = (line: string) =>
  line
    .trim()
    .replace(/^["'“”‘’—–\-\s]+/u, "")
    .toLowerCase();

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
  for (const form of POLITENESS) {
    if (form.test(text)) {
      problems.push(`${field} asks politely instead of instructing: "${text}"`);
    }
  }
  if (isPaddedAction(text)) {
    problems.push(`${field} pads an action with right-now framing: "${text}"`);
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
          // Luna is a hybrid reasoner; "none" matches the shipping parse call.
          reasoning_effort: "none",
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

        // Unwrap the take the same way the server does (OLD-93). The model is
        // free to answer with a bare reminder object or with {reminders:[...]},
        // and it uses both for the same single-reminder input; production runs
        // everything through normalizeParsedReminders, so an eval that read
        // only the flat shape was scoring the envelope, not the phrasing. It
        // reported "empty description" on perfectly good lines — on the old
        // prompt as well as the new one (OLD-106).
        const entries = normalizeParsedReminders(parsed);

        if (entries.length === 0) {
          violations.push(`${label} no reminder in response: ${raw.slice(0, 200)}`);
          continue;
        }

        entries.forEach((entry, entryIndex) => {
          // A take of one keeps the old label; only multi-reminder takes get an
          // index, so the common case reads exactly as it always did.
          const slot = entries.length > 1 ? `${label}[${entryIndex}]` : label;

          const description = typeof entry.description === "string" ? entry.description : "";
          const preDescription =
            typeof entry.preDescription === "string" ? entry.preDescription : "";

          generated.push(`${slot} description: "${description}"`);
          if (preDescription) generated.push(`${slot} pre:         "${preDescription}"`);

          if (!description.trim()) {
            violations.push(`${slot} empty description`);
            return;
          }

          // Budgets follow the prompt: 3-8 words for the line itself, under 12
          // for the heads-up (it has a time span to fit).
          violations.push(...lintLine({ field: `${slot} description`, text: description }, 8));
          if (preDescription) {
            violations.push(
              ...lintLine({ field: `${slot} preDescription`, text: preDescription }, 12)
            );
          }

          // Countdowns go stale the moment a line is heard late (pre-reminder
          // lines are exempt — theirs are required to name the lead time).
          if (
            /\bin \d+ (minutes?|mins?)\b/i.test(description) ||
            /بعد \d+ دقيقة/u.test(description)
          ) {
            violations.push(`${slot} countdown in description: "${description}"`);
          }
        });
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
