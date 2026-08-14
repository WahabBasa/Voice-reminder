/**
 * Multi-reminder probe — exploratory, NOT part of `npm test` or `npm run eval`.
 *
 * Question: when one take contains several reminders, does the array
 * instruction in the shipping prompt get a reliable {"reminders": [...]} back,
 * and what did the model do before it was there?
 *
 * The instruction now ships inside buildSystemPrompt (OLD-93), so phase B is
 * simply the shipping prompt and phase A reconstructs the old one by cutting
 * the instruction back out. Nothing is appended by this file any more.
 *
 * Run:   npx jest --testMatch "<any>/__evals__/<any>/probe files" --runInBand
 *        (glob spelled out: two asterisks slash __evals__ slash two asterisks slash star.probe.ts —
 *        can't write it literally here, it would close this comment)
 * Needs: OPENROUTER_API_KEY in the environment.
 *
 * This probe never fails on model behavior — it prints a report. It only
 * errors on transport problems (no key, network down).
 */
import OpenAI from "openai";

import { buildSystemPrompt } from "../convex/actions";
import { MULTI_REMINDER_INSTRUCTION } from "../convex/helpers";

const API_KEY = process.env.OPENROUTER_API_KEY;
const describeLive = API_KEY ? describe : describe.skip;

if (!API_KEY) {
  // eslint-disable-next-line no-console
  console.warn("[probe] OPENROUTER_API_KEY not set — skipping multi-reminder probe");
}

const MODEL = "google/gemini-3.1-flash-lite-preview";

// Same fixed context as reminder-phrasing.eval.ts so runs are comparable.
// "tomorrow" resolves to 2026-08-14.
const PROMPT_CONTEXT = {
  currentDate: "2026-08-13",
  currentDayOfWeek: "Thursday",
  currentTime: "14:00",
  timezone: "Asia/Dubai",
  addressTerm: undefined as string | undefined,
};

/** The shipping prompt exactly as the actions send it. */
const shippingPrompt = () => buildSystemPrompt(PROMPT_CONTEXT);

/** The prompt as it stood before OLD-93 — the array instruction cut back out. */
const preMultiPrompt = () => {
  const prompt = shippingPrompt();
  if (!prompt.includes(MULTI_REMINDER_INSTRUCTION)) {
    throw new Error("Prompt no longer contains MULTI_REMINDER_INSTRUCTION — phase A is stale");
  }
  return prompt.replace(MULTI_REMINDER_INSTRUCTION, "");
};

const TRANSCRIPTS = [
  {
    name: "EN two tasks",
    text: "Remind me to take my medicine at 9am and to call my mom at 2pm",
    expectCount: 2,
  },
  {
    name: "EN three tasks, mixed frequency",
    text: "Remind me to drink water at 8pm, take out the trash tomorrow at 10am, and go to the gym every Monday at 6pm",
    expectCount: 3,
  },
  {
    name: "AR two tasks",
    text: "ذكرني أن آخذ دوائي الساعة تسعة صباحاً وأن أتصل بأمي الساعة الثانية مساءً",
    expectCount: 2,
  },
  {
    name: "EN single (control)",
    text: "Remind me to drink water at 8pm",
    expectCount: 1,
  },
];

const SAMPLES = 3;

type Row = { label: string; ok: boolean; note: string };

function summarizeItem(item: Record<string, unknown>): string {
  const title = typeof item.title === "string" ? item.title : "<no title>";
  const time = typeof item.time === "string" ? item.time : "-";
  const date = typeof item.date === "string" ? item.date : "";
  const freq = typeof item.frequency === "string" ? item.frequency : "-";
  const days = Array.isArray(item.days) ? ` [${(item.days as string[]).join(",")}]` : "";
  return `"${title}" @ ${time}${date ? ` on ${date}` : ""} (${freq}${days})`;
}

describeLive("multi-reminder probe (live model)", () => {
  jest.setTimeout(300_000);

  let client: OpenAI | undefined;
  const openrouter = () =>
    (client ??= new OpenAI({ apiKey: API_KEY, baseURL: "https://openrouter.ai/api/v1" }));

  async function callModel(systemPrompt: string, userText: string): Promise<string> {
    const completion = await openrouter().chat.completions.create({
      model: MODEL,
      response_format: { type: "json_object" },
      max_tokens: 2000,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userText },
      ],
    });
    return completion.choices[0]?.message?.content ?? "";
  }

  it("phase A: pre-OLD-93 prompt, multi-reminder takes (what used to happen)", async () => {
    const rows: Row[] = [];
    const prompt = preMultiPrompt();

    for (const t of TRANSCRIPTS.filter((t) => t.expectCount > 1)) {
      for (let s = 0; s < 2; s++) {
        const label = `[A ${t.name} #${s + 1}]`;
        const raw = await callModel(prompt, t.text);
        try {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed)) {
            rows.push({ label, ok: false, note: `top-level ARRAY of ${parsed.length} — pre-OLD-93 code read .title off an array` });
          } else if (Array.isArray(parsed.reminders)) {
            rows.push({ label, ok: false, note: `spontaneous {reminders:[${parsed.reminders.length}]} — pre-OLD-93 code read undefined fields` });
          } else {
            rows.push({ label, ok: true, note: `single object: ${summarizeItem(parsed)}` });
          }
        } catch {
          rows.push({ label, ok: false, note: `invalid JSON: ${raw.slice(0, 120)}` });
        }
      }
    }

    // eslint-disable-next-line no-console
    console.log(`\n=== PHASE A: pre-OLD-93 prompt ===\n${rows.map((r) => `${r.label} ${r.note}`).join("\n")}`);
  });

  it("phase B: shipping prompt, all takes (the array format)", async () => {
    const lines: string[] = [];
    const prompt = shippingPrompt();
    let good = 0;
    let total = 0;

    for (const t of TRANSCRIPTS) {
      for (let s = 0; s < SAMPLES; s++) {
        total++;
        const label = `[B ${t.name} #${s + 1}]`;
        const raw = await callModel(prompt, t.text);
        try {
          const parsed = JSON.parse(raw);
          const reminders = Array.isArray(parsed.reminders) ? parsed.reminders : null;
          if (!reminders) {
            lines.push(`${label} ✗ no "reminders" array: ${raw.slice(0, 160)}`);
            continue;
          }
          const countOk = reminders.length === t.expectCount;
          const fieldsOk = reminders.every(
            (r: Record<string, unknown>) =>
              typeof r.title === "string" && r.title.trim() &&
              typeof r.description === "string" && r.description.trim(),
          );
          if (countOk && fieldsOk) good++;
          lines.push(
            `${label} ${countOk && fieldsOk ? "✓" : "✗"} count=${reminders.length}/${t.expectCount}` +
              (fieldsOk ? "" : " MISSING FIELDS") +
              `\n${reminders.map((r: Record<string, unknown>) => `        - ${summarizeItem(r)}`).join("\n")}`,
          );
        } catch {
          lines.push(`${label} ✗ invalid JSON: ${raw.slice(0, 120)}`);
        }
      }
    }

    // eslint-disable-next-line no-console
    console.log(`\n=== PHASE B: + array instruction — ${good}/${total} clean ===\n${lines.join("\n")}`);
  });
});
