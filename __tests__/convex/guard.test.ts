/**
 * The parse guard (OLD-130).
 *
 * Three seams, no network: the prompt the guard_v1 take is sent (and that the
 * prompt every other client gets did not move), the planner's reading of the
 * guard's fields (`timeSpoken`, `lang`, the envelope), and the gate that turns
 * a take away as not_understood / no_time / unsupported_language.
 */
import {
  buildReminderPlan,
  buildSystemPrompt,
  planRemindersFromRawParse,
  planTakeFromRawParse,
} from "../../convex/actions";
import {
  GUARD_NO_TIME_INSTRUCTION,
  GUARD_TIME_SPOKEN_FIELD_LINE,
  GUARD_UNDERSTOOD_INSTRUCTION,
  LANG_FIELD_LINE,
  NO_TIME_DEFAULT_INSTRUCTION,
  readParseEnvelope,
} from "../../convex/helpers";
import { guardTake } from "../../convex/creationValidate";

const PROMPT_CONTEXT = {
  currentDate: "2026-08-13",
  currentDayOfWeek: "Thursday",
  currentTime: "14:00",
  timezone: "Asia/Dubai",
};

const PLAN_CONTEXT = {
  transcript: "",
  currentTime: "14:00:00",
  currentDate: "2026-08-13",
  timezone: "Asia/Dubai",
};

const reminder = (over: Record<string, unknown> = {}) => ({
  title: "Call mom",
  description: "Call mom.",
  time: "20:00",
  frequency: "once",
  ...over,
});

// ─── The prompt ─────────────────────────────────────────────────────────────

describe("buildSystemPrompt — guard_v1", () => {
  const legacy = buildSystemPrompt(PROMPT_CONTEXT);
  const guarded = buildSystemPrompt(PROMPT_CONTEXT, { guard: true });

  it("leaves the non-guard prompt free of every guard piece", () => {
    expect(buildSystemPrompt(PROMPT_CONTEXT, {})).toBe(legacy);
    expect(legacy).toContain(NO_TIME_DEFAULT_INSTRUCTION);
    expect(legacy).not.toContain("timeSpoken");
    expect(legacy).not.toContain('"understood"');
    expect(legacy).not.toContain(GUARD_NO_TIME_INSTRUCTION);
  });

  it("asks every client for the per-reminder lang", () => {
    expect(legacy).toContain(LANG_FIELD_LINE);
    expect(guarded).toContain(LANG_FIELD_LINE);
  });

  it("is the shared prompt with exactly the three guard pieces swapped in", () => {
    const rebuilt = legacy
      .replace(
        "SCHEDULE RULES),\n",
        `SCHEDULE RULES),\n  ${GUARD_TIME_SPOKEN_FIELD_LINE}\n`
      )
      .replace(NO_TIME_DEFAULT_INSTRUCTION, GUARD_NO_TIME_INSTRUCTION)
      .replace("\n\nCURRENT CONTEXT:", `${GUARD_UNDERSTOOD_INSTRUCTION}\n\nCURRENT CONTEXT:`);
    expect(guarded).toBe(rebuilt);
  });

  it("drops the blanket default and lets the model refuse", () => {
    expect(guarded).not.toContain(NO_TIME_DEFAULT_INSTRUCTION);
    expect(guarded).toContain('"understood": false');
    expect(guarded).toContain("Never invent a task.");
  });

  it("keeps the guard text in the cacheable prefix", () => {
    const prefix = guarded.slice(0, guarded.indexOf("CURRENT CONTEXT:"));
    expect(prefix).toContain(GUARD_UNDERSTOOD_INSTRUCTION);
    expect(guarded.endsWith(`- User's timezone: ${PROMPT_CONTEXT.timezone}`)).toBe(true);
  });

  it("stays tight: the guard adds well under 1,000 characters", () => {
    expect(guarded.length - legacy.length).toBeLessThan(1000);
  });
});

// ─── The planner ────────────────────────────────────────────────────────────

describe("buildReminderPlan — timeSpoken and explicitTime", () => {
  it("keeps the old rule when timeSpoken is absent", () => {
    const plan = buildReminderPlan(reminder(), PLAN_CONTEXT);
    expect(plan.timeSpoken).toBeUndefined();
    expect(plan.explicitTime).toBe(true);
  });

  it("a time the user said stays explicit", () => {
    const plan = buildReminderPlan(reminder({ timeSpoken: true }), PLAN_CONTEXT);
    expect(plan.timeSpoken).toBe(true);
    expect(plan.explicitTime).toBe(true);
  });

  it("a time the model picked is not explicit, even though it returned one", () => {
    const plan = buildReminderPlan(reminder({ timeSpoken: false }), PLAN_CONTEXT);
    expect(plan.timeSpoken).toBe(false);
    expect(plan.explicitTime).toBe(false);
  });

  it("timeSpoken true with no time from the model is still the planner's fill", () => {
    const plan = buildReminderPlan(reminder({ time: undefined, timeSpoken: true }), PLAN_CONTEXT);
    expect(plan.explicitTime).toBe(false);
  });

  it("ignores a timeSpoken that is not a boolean", () => {
    const plan = buildReminderPlan(reminder({ timeSpoken: "false" }), PLAN_CONTEXT);
    expect(plan.timeSpoken).toBeUndefined();
    expect(plan.explicitTime).toBe(true);
  });
});

describe("lang on the plan", () => {
  it("normalizes the reminder's own lang", () => {
    const [plan] = planRemindersFromRawParse(
      JSON.stringify({ reminders: [reminder({ lang: "SV-se" })] }),
      PLAN_CONTEXT
    );
    expect(plan.lang).toBe("sv");
  });

  it("falls back to the take's language", () => {
    const [plan] = planRemindersFromRawParse(
      JSON.stringify({ language: "de", reminders: [reminder()] }),
      PLAN_CONTEXT
    );
    expect(plan.lang).toBe("de");
  });

  it("is undefined when nothing names a real code", () => {
    const [plan] = planRemindersFromRawParse(
      JSON.stringify(reminder({ lang: "english" })),
      PLAN_CONTEXT
    );
    expect(plan.lang).toBeUndefined();
  });
});

describe("readParseEnvelope / planTakeFromRawParse", () => {
  it("reads the envelope fields and leaves the old shapes alone", () => {
    expect(readParseEnvelope({ understood: false, language: "en", reminders: [] })).toEqual({
      understood: false,
      language: "en",
      empty: true,
    });
    expect(readParseEnvelope(reminder())).toEqual({
      understood: undefined,
      language: undefined,
      empty: false,
    });
    expect(readParseEnvelope([]).empty).toBe(true);
  });

  it("an understood:false answer is a take with no plans, not a throw", () => {
    const take = planTakeFromRawParse(
      JSON.stringify({ understood: false, language: "en", reminders: [] }),
      PLAN_CONTEXT
    );
    expect(take).toEqual({ understood: false, language: "en", plans: [] });
  });

  it("understood:false wins even if the model also returned a reminder", () => {
    const take = planTakeFromRawParse(
      JSON.stringify({ understood: false, reminders: [reminder({ title: "Kilometer got lead" })] }),
      PLAN_CONTEXT
    );
    expect(take.plans).toEqual([]);
  });

  it("the legacy planner still throws on that same empty answer", () => {
    expect(() =>
      planRemindersFromRawParse(
        JSON.stringify({ understood: false, reminders: [] }),
        PLAN_CONTEXT
      )
    ).toThrow("Parse response contained no reminder object");
  });

  it("plans an understood take exactly as the legacy planner does", () => {
    const raw = JSON.stringify({
      understood: true,
      language: "en",
      reminders: [reminder({ timeSpoken: true, lang: "en" })],
    });
    const take = planTakeFromRawParse(raw, PLAN_CONTEXT);
    expect(take.understood).toBe(true);
    expect(take.language).toBe("en");
    const legacy = planRemindersFromRawParse(raw, PLAN_CONTEXT);
    expect(take.plans.map(({ title, time, frequency }) => ({ title, time, frequency }))).toEqual(
      legacy.map(({ title, time, frequency }) => ({ title, time, frequency }))
    );
  });
});

// ─── The gate ───────────────────────────────────────────────────────────────

describe("guardTake", () => {
  const once = (over: Record<string, unknown> = {}) => ({
    frequency: "once",
    timeSpoken: true,
    lang: "en",
    ...over,
  });

  it("passes a clear one-off with a spoken time", () => {
    expect(guardTake({ understood: true, language: "en", plans: [once()] })).toEqual({ ok: true });
  });

  it("not_understood when the model says so", () => {
    const verdict = guardTake({ understood: false, language: "en", plans: [] });
    expect(verdict).toMatchObject({ ok: false, detail: "not_understood" });
    expect(verdict).not.toHaveProperty("detectedLanguage");
  });

  it("not_understood when the take has no reminders", () => {
    expect(guardTake({ understood: true, language: "en", plans: [] })).toMatchObject({
      ok: false,
      detail: "not_understood",
    });
  });

  it("no_time for a one-off whose time the user never said", () => {
    expect(
      guardTake({ understood: true, language: "en", plans: [once({ timeSpoken: false })] })
    ).toMatchObject({ ok: false, detail: "no_time" });
  });

  it("no_time when any one-off in a multi take lacks a time", () => {
    expect(
      guardTake({
        understood: true,
        language: "en",
        plans: [once(), once({ timeSpoken: false })],
      })
    ).toMatchObject({ ok: false, detail: "no_time" });
  });

  it("a repeating reminder without a spoken time is still fine", () => {
    for (const frequency of ["daily", "custom", "interval"]) {
      expect(
        guardTake({
          understood: true,
          language: "en",
          plans: [once({ frequency, timeSpoken: false })],
        })
      ).toEqual({ ok: true });
    }
  });

  it("unsupported_language for the take's language, with the code", () => {
    expect(guardTake({ understood: true, language: "xh", plans: [once({ lang: undefined })] })).toEqual({
      ok: false,
      detail: "unsupported_language",
      detectedLanguage: "xh",
      reason: expect.any(String),
    });
  });

  it("unsupported_language for a reminder's own lang", () => {
    expect(
      guardTake({ understood: true, language: undefined, plans: [once({ lang: "yo" })] })
    ).toMatchObject({ ok: false, detail: "unsupported_language", detectedLanguage: "yo" });
  });

  it("Swedish is voiceable, so a clear Swedish take passes", () => {
    expect(guardTake({ understood: true, language: "sv", plans: [once({ lang: "sv" })] })).toEqual({
      ok: true,
    });
  });

  it("not_understood outranks the language", () => {
    expect(guardTake({ understood: false, language: "xh", plans: [] })).toMatchObject({
      detail: "not_understood",
    });
  });

  it("absent or unreadable fields never reject", () => {
    expect(
      guardTake({
        understood: undefined,
        language: "english",
        plans: [{ frequency: "once" }],
      })
    ).toEqual({ ok: true });
  });
});
