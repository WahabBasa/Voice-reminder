"use node";

import { action, internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import { Id } from "./_generated/dataModel";
import OpenAI from "openai";

type ResembleSynthesizeResponse = {
  success: boolean;
  audio_content?: string;
  issues?: string[];
  output_format?: string;
  sample_rate?: number;
};

type ResembleProjectsResponse = {
  success: boolean;
  items?: Array<{ uuid: string; name?: string }>;
};

type TtsProvider = "resemble" | "elevenlabs";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

function getTtsProvider(): TtsProvider {
  const configured = process.env.TTS_PROVIDER?.toLowerCase();
  if (configured === "elevenlabs" || configured === "resemble") return configured;
  if (process.env.ELEVENLABS_API_KEY && process.env.ELEVENLABS_VOICE_ID) return "elevenlabs";
  return "resemble";
}

import { clamp, normalizeReminderDescription, guardSpokenLine, normalizeDay, getCurrentTimeHM, buildDescriptionInstruction, buildPreReminderInstruction, normalizePreReminder, buildHeadsUpTtsText, buildVariantInstruction, normalizeUrgency, normalizePersistent, normalizeEmoji, normalizeVariants, normalizeParsedReminders, variantCountForTier, buildAlarmWav, alignVariantWavIds, useDenseAlarmWav, parsePcmSampleRate, ALARM_PCM_OUTPUT_FORMAT, MULTI_REMINDER_INSTRUCTION, type Urgency } from "./helpers";
import { buildGridSchedule, legacyFieldsFromGrid, type GridSchedule } from "./scheduleShape";

function numberEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function booleanEnv(name: string, fallback: boolean): boolean {
  const raw = process.env[name];
  if (raw === undefined) return fallback;
  const normalized = raw.trim().toLowerCase();
  if (normalized === "1" || normalized === "true") return true;
  if (normalized === "0" || normalized === "false") return false;
  return fallback;
}

// normalizeReminderDescription, normalizeDay, getCurrentTimeHM, clamp — imported from ./helpers

/**
 * Coerce ONE reminder's frequency (OLD-97).
 *
 * Two kinds of rule live here and they have different reach. Item rules read
 * only what the model said about this reminder — days present means weekly, full
 * stop. Transcript rules read the raw sentence, which is the whole take: a
 * "weekdays" anywhere in it used to rewrite every reminder the take produced, so
 * "standup on weekdays at 9 and water at 8pm" came back as two weekday
 * reminders. A transcript is only unambiguously about one reminder when the take
 * has exactly one, so that is the only time transcript rules fire; a multi-item
 * take is coerced from each item's own fields.
 */
function coerceFrequency(
  frequency: string,
  days: string[] | undefined,
  transcript: string,
  parseWarnings: string[],
  options: { useTranscriptHints: boolean }
): { frequency: string; days: string[] | undefined; warnings: string[] } {
  const warnings = [...parseWarnings];
  let coercedFrequency = frequency;
  let coercedDays = days;
  const transcriptLower = transcript.toLowerCase();

  // Item rule: If days are provided, force frequency to "custom"
  if (coercedDays && coercedDays.length > 0 && coercedFrequency !== "custom") {
    warnings.push("Coerced frequency to custom because days were provided.");
    coercedFrequency = "custom";
  }

  if (!options.useTranscriptHints) {
    return { frequency: coercedFrequency, days: coercedDays, warnings };
  }

  // Transcript rule: If transcript implies weekly but model returns daily, coerce
  const impliesWeekly = /every\s+(sunday|monday|tuesday|wednesday|thursday|friday|saturday|week|weekly)/.test(transcriptLower);
  if (impliesWeekly && coercedFrequency === "daily") {
    warnings.push("Transcript implies weekly but model returned daily. Coercing to custom weekly.");
    coercedFrequency = "custom";
    if (!coercedDays || coercedDays.length === 0) {
      const match = transcriptLower.match(/\b(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/);
      const inferred = normalizeDay(match?.[1]);
      if (inferred) {
        coercedDays = [inferred];
      }
    }
  }

  // Transcript rule: "weekdays" implies custom MO-FR.
  if (/\bweekdays?\b/.test(transcriptLower) && coercedFrequency !== "interval") {
    coercedFrequency = "custom";
    coercedDays = ["mon", "tue", "wed", "thu", "fri"];
    warnings.push("Transcript implies weekdays. Coercing to custom MO-FR.");
  }

  return { frequency: coercedFrequency, days: coercedDays, warnings };
}

/**
 * Everything one parsed reminder object turns into before any audio exists:
 * guarded spoken line, coerced frequency, interval bounds, schedule/rrule
 * fields, heads-up, replay tier. One take can carry several of these (OLD-93),
 * and both processing paths run the same builder over each item — the slow
 * path then synthesizes and inserts, the fast path inserts and defers the TTS.
 */
type ReminderPlan = {
  title: string;
  description: string;
  /** Authoritative days × times schedule (OLD-97). */
  schedule: GridSchedule;
  /** Every clock time of the day, in order. `time` is its first entry. */
  times: string[];
  time: string;
  date: string | undefined;
  frequency: string;
  days: string[] | undefined;
  emoji: string | undefined;
  intervalDays: number | undefined;
  intervalMs: number | undefined;
  anchorAt: number | undefined;
  scheduleType: "once" | "interval" | "rrule" | undefined;
  onceAt: number | undefined;
  rrule: string | undefined;
  dtstart: number | undefined;
  until: number | undefined;
  preReminderMinutes: number;
  preTtsText: string;
  urgency: Urgency;
  persistent: boolean;
  variants: string[];
  parseWarnings: string[];
};

export function buildReminderPlan(
  parsed: Record<string, unknown>,
  context: { transcript: string; currentTime: string; takeSize?: number }
): ReminderPlan {
  // A leaked banned opener costs the model's phrasing, not the reminder: the
  // title is the stand-in, on the card and aloud. Titles like 'Time to Sleep'
  // are banned too, and then the model's own line stands — the guard never
  // trades a line for nothing (helpers.ts).
  const description = guardSpokenLine(parsed.description, parsed.title);

  const rawFrequency = String(parsed.frequency || "once").toLowerCase();
  let frequency = rawFrequency === "weekly" ? "custom" : rawFrequency;

  let days: string[] | undefined = undefined;
  const modelDaysRaw = Array.isArray(parsed.days) ? (parsed.days as unknown[]) : [];
  const modelDaysNormalized = modelDaysRaw
    .map(normalizeDay)
    .filter((d): d is string => Boolean(d));

  // Initialize days if the model provided them (even if it chose the wrong frequency)
  if (modelDaysNormalized.length > 0) {
    days = modelDaysNormalized;
  }
  // Only use date for one-time reminders
  const date = frequency === "once" && parsed.date ? (parsed.date as string) : undefined;

  // Ensure time is always a valid HH:MM string (Convex schema requires it)
  const time =
    typeof parsed.time === "string" && parsed.time
      ? (parsed.time as string)
      : getCurrentTimeHM(context.currentTime);

  // Parse warnings for normalization issues
  let parseWarnings: string[] = [];

  // Coerce frequency. Transcript-wide hints only apply to a take of one — see
  // coerceFrequency for why a sibling must not be dragged along.
  const coercionResult = coerceFrequency(frequency, days, context.transcript, parseWarnings, {
    useTranscriptHints: (context.takeSize ?? 1) <= 1,
  });
  frequency = coercionResult.frequency;
  days = coercionResult.days;
  parseWarnings = coercionResult.warnings;

  // The days × times grid (OLD-97). Everything above says at most one time a
  // day; this is what lets "Thursday 8 and 9" be one reminder with two rings,
  // and what gives an interval its waking window.
  const schedule = buildGridSchedule(
    {
      frequency,
      time,
      times: parsed.times,
      date,
      days,
      everyNDays: parsed.everyNDays,
      intervalHours: parsed.intervalHours,
      intervalMinutes: parsed.intervalMinutes,
      windowStart: parsed.windowStart,
      windowEnd: parsed.windowEnd,
      until: parsed.until,
    },
    { fallbackTime: time, warnings: parseWarnings }
  );

  // Legacy projection of the grid: the four columns every pre-grid reader still
  // speaks. `time` is the FIRST ring of the day — the rest of a multi-time
  // reminder exists only inside the grid.
  const legacy = legacyFieldsFromGrid(schedule);
  frequency = legacy.frequency;
  days = legacy.days.length > 0 ? legacy.days : undefined;
  const times = schedule.times.kind === "clock" ? schedule.times.times : [legacy.time];
  const primaryTime = legacy.time;
  const scheduleDate = legacy.date;

  // Interval recurrence, still carried flat for the pre-grid scheduler.
  const intervalMs = legacy.intervalMs;
  const anchorAt = intervalMs !== undefined ? Date.now() : undefined;

  // Unified schedule system fields
  let scheduleType: "once" | "interval" | "rrule" | undefined;
  let onceAt: number | undefined;
  let rrule: string | undefined;
  let dtstart: number | undefined;
  let until: number | undefined;

  // Infer scheduleType from parsed data
  if (parsed.scheduleType && ["once", "interval", "rrule"].includes(parsed.scheduleType as string)) {
    scheduleType = parsed.scheduleType as "once" | "interval" | "rrule";
  } else if (frequency === "interval") {
    scheduleType = "interval";
  } else if (parsed.rrule) {
    scheduleType = "rrule";
  } else if (frequency === "once") {
    scheduleType = "once";
    // Calculate onceAt timestamp
    if (scheduleDate) {
      const [year, month, dayNum] = scheduleDate.split("-").map(Number);
      const [hours, minutes] = primaryTime.split(":").map(Number);
      onceAt = new Date(year, month - 1, dayNum, hours, minutes).getTime();
    } else {
      const [hours, minutes] = primaryTime.split(":").map(Number);
      const target = new Date();
      target.setHours(hours, minutes, 0, 0);
      // Interpret "at HH:MM" as the next occurrence (today or tomorrow).
      if (target.getTime() <= Date.now()) {
        target.setDate(target.getDate() + 1);
      }
      onceAt = target.getTime();
    }
  } else {
    // Daily/weekly/custom → can be represented as rrule or legacy
    scheduleType = "rrule";

    // Build RRULE from legacy fields
    const [hours, minutes] = primaryTime.split(":").map(Number);

    if (frequency === "daily") {
      rrule = `FREQ=DAILY;BYHOUR=${hours};BYMINUTE=${minutes}`;
    } else if (frequency === "custom" && days && days.length > 0) {
      const byday = days.map((d: string) => {
        const map: Record<string, string> = {
          sun: "SU", mon: "MO", tue: "TU", wed: "WE",
          thu: "TH", fri: "FR", sat: "SA"
        };
        return map[d.toLowerCase()] || "MO";
      }).join(",");
      rrule = `FREQ=WEEKLY;BYDAY=${byday};BYHOUR=${hours};BYMINUTE=${minutes}`;
    } else {
      // Fallback to daily
      rrule = `FREQ=DAILY;BYHOUR=${hours};BYMINUTE=${minutes}`;
    }

    dtstart = Date.now();
  }

  // Handle explicit RRULE from GPT
  if (parsed.rrule) {
    rrule = parsed.rrule as string;
    scheduleType = "rrule";
    dtstart = Date.now();
  }

  // Bounds: the grid already parsed (and warned about) `until`.
  until = schedule.until;

  // Pre-reminder (heads-up) fields. The '<title> in N minutes' stand-in is
  // only opener-free when the title is, so the chooser knows about both.
  const { preReminderMinutes, preDescription, rawPreDescription } =
    normalizePreReminder(parsed.preReminderMinutes, parsed.preDescription);
  const preTtsText = buildHeadsUpTtsText({
    preReminderMinutes,
    preDescription,
    rawPreDescription,
    title: parsed.title,
  });

  // Assistant replay fields (urgency tier, persistence, escalating variants)
  const urgency = normalizeUrgency(parsed.urgency);
  const persistent = normalizePersistent(parsed.persistent);
  const variants = normalizeVariants(
    parsed.variants,
    variantCountForTier(urgency, persistent),
    description
  );

  return {
    title: parsed.title as string,
    description,
    schedule,
    times,
    time: primaryTime,
    date: scheduleDate,
    frequency,
    days,
    // Card chip emoji (absent when the model returned junk → neutral bell chip)
    emoji: normalizeEmoji(parsed.emoji),
    intervalDays: legacy.intervalDays,
    intervalMs,
    anchorAt,
    scheduleType,
    onceAt,
    rrule,
    dtstart,
    until,
    preReminderMinutes,
    preTtsText,
    urgency,
    persistent,
    variants,
    parseWarnings,
  };
}

/**
 * The reminders one raw parse response asks for, each already turned into a
 * plan. The envelope the model chose is normalized away first (helpers.ts), so
 * a single-reminder take is simply an array of one and behaves exactly as it
 * did before multi-reminder takes existed.
 *
 * Exported for the unit tests: this is the seam between "what the model said"
 * and "what gets created", with no network or Convex context in reach.
 */
export function planRemindersFromRawParse(
  rawGptResponse: string,
  context: { transcript: string; currentTime: string }
): ReminderPlan[] {
  const parsed = JSON.parse(rawGptResponse);
  const items = normalizeParsedReminders(parsed);
  // takeSize is what tells each item whether the transcript is about it alone
  // (coerceFrequency) — a take of two must not share one item's "weekdays".
  return items.map((item) => buildReminderPlan(item, { ...context, takeSize: items.length }));
}

// Shared helper: build system prompt for GPT. Exported for the live-model
// phrasing evals (__evals__/), which must test the exact prompt this ships.
//
// The spoken line addresses nobody by name (OLD-95): there is no address term
// anywhere in this signature, so none can reach the prompt.
export function buildSystemPrompt(context: { currentDate: string; currentDayOfWeek: string; currentTime: string; timezone: string }): string {
  return `Parse the user's reminder request into structured JSON. The input may be in ENGLISH or ARABIC.

Return exactly this format:
{
  "title": "short title (2-4 words; must not begin with 'Reminder', 'It is time', 'Time to', or Arabic 'تذكير' / 'حان وقت' — the title names the thing, it never announces itself)",
  "description": "${buildDescriptionInstruction()}",
  "time": "HH:MM in 24-hour format (the FIRST of \\"times\\")",
  "times": ["HH:MM", ...] (EVERY clock time this one reminder rings at — see SCHEDULE RULES),
  "date": "YYYY-MM-DD format (only for one-time reminders on a specific day)",
  "frequency": "once" | "daily" | "custom" | "everyNDays" | "interval",
  "days": ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] (only if frequency is custom),
  "everyNDays": number (only if frequency is everyNDays, e.g. 3 for "every three days"),
  "intervalHours": number (only if frequency is interval),
  "intervalMinutes": number (only if frequency is interval),
  "windowStart": "HH:MM (only if frequency is interval — earliest it may ring)",
  "windowEnd": "HH:MM (only if frequency is interval — latest it may ring)",
  "until": "ISO date for bounded recurrences",
  "preReminderMinutes": number (heads-up lead time in minutes, see PRE-REMINDER RULES),
  "preDescription": "spoken advance-notice line (only when preReminderMinutes > 0)",
  "urgency": "urgent" | "notice" | "routine" (how hard the reminder has to push, see ASSISTANT REPLAY RULES),
  "persistent": boolean (true only for critical tasks, see ASSISTANT REPLAY RULES),
  "variants": ["escalating alternative spoken lines, see ASSISTANT REPLAY RULES"],
  "emoji": "ONE emoji that best fits the reminder (see EMOJI RULES)"
}

EMOJI RULES:
- Pick exactly ONE emoji that captures the reminder's subject (e.g. 💊 medicine, 🏋️ gym, 📞 call, 💧 drink water, 🍳 cooking)
- Prefer concrete object/activity emojis over abstract ones; use ⏰ only when nothing fits
- The "emoji" value must contain the emoji character only — no words, no punctuation

LANGUAGE RULES:
- If the input is in Arabic, return "title" and "description" in Arabic
- If the input is in English, return "title" and "description" in English
- The JSON field names and "frequency"/"days" values always remain in English
- For Arabic days: الأحد=sun, الاثنين=mon, الثلاثاء=tue, الأربعاء=wed, الخميس=thu, الجمعة=fri, السبت=sat

CURRENT CONTEXT:
- Current date: ${context.currentDate} (${context.currentDayOfWeek})
- Current time: ${context.currentTime}
- User's timezone: ${context.timezone}

DATE PARSING RULES (English & Arabic):
- "Sunday"/"يوم الأحد", "tomorrow"/"غداً", "today"/"اليوم" → calculate actual YYYY-MM-DD
- "next Sunday"/"الأحد القادم" → find the NEXT occurrence
- "in 3 days"/"بعد ثلاثة أيام" → add days to current date
- ONLY include "date" for one-time reminders (frequency: "once")
- Do NOT include "date" for recurring/daily reminders

RELATIVE TIME RULES:
- "in X minutes"/"بعد X دقائق" = add to current time (${context.currentTime}) → frequency="once"
- "in X hours"/"بعد X ساعات" = add hours to current time → frequency="once"
- "every X minutes"/"كل X دقائق" = INTERVAL reminder (frequency="interval")
- "every X hours"/"كل X ساعات" = INTERVAL reminder (frequency="interval")

SCHEDULE RULES — a schedule is TWO independent choices, WHICH DAYS and WHAT TIMES.
Pick one from each; any combination is valid.

WHICH DAYS ("frequency"):
- "every day"/"daily"/"كل يوم" → frequency="daily" (not "custom")
- named weekdays → frequency="custom", days=[...]. "every Sunday" → days=["sun"]; "weekdays" → days=["mon","tue","wed","thu","fri"]; "weekends" → days=["sat","sun"]
- "every N days"/"كل ثلاثة أيام" → frequency="everyNDays", everyNDays=N
- one specific day → frequency="once" with "date"

WHAT TIMES ("times" or the interval fields):
- List EVERY clock time the user named in "times", and repeat the first one in "time".
- SEVERAL TIMES FOR THE SAME TASK ARE ONE REMINDER, NOT SEVERAL. "take my pills at 8 and 9" → ONE reminder with times=["08:00","21:00"]. "water every day at 9am and 5pm" → ONE reminder, times=["09:00","17:00"]. "Thursday at 8 and 9" → ONE reminder, frequency="custom", days=["thu"], times=["08:00","21:00"].
- Only a DIFFERENT task becomes a second reminder (see MULTIPLE REMINDERS below).
- Repeating over and over instead of at named times → frequency="interval" with intervalHours/intervalMinutes.

INTERVAL RULES:
- "every 8 hours"/"كل 8 ساعات" = frequency="interval" and intervalHours=8
- "every 30 minutes"/"كل 30 دقيقة" = frequency="interval" and intervalMinutes=30
- "in 8 hours"/"بعد 8 ساعات" = ONE-TIME reminder (frequency="once")
- An interval reminder rings only inside a window. If the user gave one ("every hour from 9 to 5", "كل ساعة من التاسعة حتى الخامسة") set windowStart/windowEnd; otherwise OMIT both and it defaults to 08:00–22:00. Never schedule an interval through the night.
- For interval reminders: do NOT include a specific date, "times", or "days" unless the user named weekdays.
- Minimum interval: 5 minutes. Maximum interval: 24 hours.

BOUNDED RECURRENCES:
- "every day at 8am for 2 weeks" → frequency="daily", until="2026-02-22"
- "weekdays at 9 until March 1st" → frequency="custom", days=["mon".."fri"], until="2026-03-01"

FREQUENCY RULES (deterministic):
- If days are provided → frequency="custom" (weekly on specific days)
- If no frequency is implied at all → frequency="once"

ARABIC TIME EXPRESSIONS:
- "الساعة ثمانية صباحاً" = 08:00
- "الساعة تسعة مساءً" = 21:00
- "صباحاً" = AM, "مساءً" = PM

INTENT + TONE RULES (the spoken voice — every spoken field obeys these):
- Keep the exact intent (do not add meaning or extra context)
- ONE short sentence, present tense, about the thing itself (aim for 4-9 words)
- Pick the register the content calls for: instruction ("Drink your water right now."), stated fact ("Your son's game is starting this minute."), or polite request ("Please take your pills.")
- Never put anything in front of the substance: no greetings (English: "Hey", "Hi" / Arabic: "مرحبا", "أهلاً", "السلام عليكم"), no clock announcements ("It is time", "It's time", a bare "Time to ...", Arabic "حان وقت"/"حان الوقت"), no reminder labels ("Quick reminder", "Just a reminder", "Heads up", Arabic "تذكير سريع"), no conversational lead-ins ("By the way", "Just so you know", "Remember", "Don't forget", Arabic "على فكرة"/"لا تنسى")
- Never address the user by name or title, and never add wellness, benefit or encouragement commentary — say the thing and stop
- Arabic examples: "اشرب ماءك الآن." / "خذ حبوبك الآن." / "مباراة ابنك تبدأ الآن."

TIME PARSING (Speech-to-text quirks):
- "10 4 p.m." = 22:04, "9 30 a.m." = 09:30
- The first number is hours, the second is minutes

${buildPreReminderInstruction()}

${buildVariantInstruction()}

If no time specified, use a reasonable default.
If no frequency specified, assume "once".${MULTI_REMINDER_INSTRUCTION}`;
}

let cachedResembleProjectUuid: string | null = null;

async function getResembleProjectUuid(apiKey: string): Promise<string> {
  if (process.env.RESEMBLE_PROJECT_UUID) return process.env.RESEMBLE_PROJECT_UUID;
  if (cachedResembleProjectUuid) return cachedResembleProjectUuid;

  const tryFetch = async (authHeader: string) => {
    const response = await fetch(
      "https://app.resemble.ai/api/v2/projects?page=1&page_size=10",
      {
        method: "GET",
        headers: { Authorization: authHeader },
      }
    );
    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(
        `Resemble projects fetch failed (${response.status}): ${body.slice(0, 500)}`
      );
    }
    const json = (await response.json()) as ResembleProjectsResponse;
    const first = json.items?.[0]?.uuid;
    if (!json.success || !first) {
      throw new Error(
        `Resemble projects fetch failed: success=${String(
          json.success
        )} items=${json.items?.length ?? 0}`
      );
    }
    return first;
  };

  try {
    cachedResembleProjectUuid = await tryFetch(`Bearer ${apiKey}`);
    return cachedResembleProjectUuid;
  } catch (_e) {
    cachedResembleProjectUuid = await tryFetch(`Token token=${apiKey}`);
    return cachedResembleProjectUuid;
  }
}

async function synthesizeWithResemble(args: {
  text: string;
  title?: string;
}): Promise<Buffer> {
  const apiKey = requireEnv("RESEMBLE_API_KEY");
  const projectUuid = await getResembleProjectUuid(apiKey);
  const voiceUuid = requireEnv("RESEMBLE_VOICE_UUID");

  const response = await fetch("https://f.cluster.resemble.ai/synthesize", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "Accept-Encoding": "gzip",
    },
    body: JSON.stringify({
      voice_uuid: voiceUuid,
      project_uuid: projectUuid,
      title: args.title,
      data: args.text,
      output_format: "mp3",
      sample_rate: 48000,
    }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(
      `Resemble synth failed (${response.status}): ${body.slice(0, 500)}`
    );
  }

  const json = (await response.json()) as ResembleSynthesizeResponse;
  if (!json.success || !json.audio_content) {
    throw new Error(
      `Resemble synth failed: success=${String(json.success)} issues=${JSON.stringify(
        json.issues || []
      )}`
    );
  }

  return Buffer.from(json.audio_content, "base64");
}

async function synthesizeWithElevenLabs(args: { text: string; outputFormat?: string }): Promise<Buffer> {
  const apiKey = requireEnv("ELEVENLABS_API_KEY");
  const voiceId = requireEnv("ELEVENLABS_VOICE_ID");
  const modelId = process.env.ELEVENLABS_MODEL_ID || "eleven_multilingual_v2";
  const outputFormat = args.outputFormat || process.env.ELEVENLABS_OUTPUT_FORMAT || "mp3_44100_128";

  const url = new URL(
    `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}`
  );
  url.searchParams.set("output_format", outputFormat);

  const response = await fetch(url.toString(), {
    method: "POST",
    headers: {
      "xi-api-key": apiKey,
      "Content-Type": "application/json",
      // PCM responses are audio/pcm; a hard audio/mpeg Accept would refuse them.
      ...(outputFormat.startsWith("pcm_") ? {} : { Accept: "audio/mpeg" }),
    },
    body: JSON.stringify({
      text: args.text,
      model_id: modelId,
      voice_settings: {
        stability: clamp(numberEnv("ELEVENLABS_STABILITY", 0.5), 0, 1),
        similarity_boost: clamp(numberEnv("ELEVENLABS_SIMILARITY_BOOST", 0.75), 0, 1),
        style: clamp(numberEnv("ELEVENLABS_STYLE", 0), 0, 1),
        use_speaker_boost: booleanEnv("ELEVENLABS_USE_SPEAKER_BOOST", true),
      },
    }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`ElevenLabs TTS failed (${response.status}): ${body.slice(0, 500)}`);
  }

  const audio = await response.arrayBuffer();
  return Buffer.from(audio);
}

async function synthesizeReminderTts(args: { text: string; title?: string }): Promise<Buffer> {
  const provider = getTtsProvider();
  if (provider === "elevenlabs") {
    return await synthesizeWithElevenLabs({ text: args.text });
  }
  return await synthesizeWithResemble(args);
}

/**
 * Alarm-ready WAV of one spoken line (iOS AlarmKit custom sound).
 * ElevenLabs only: PCM out, shaped for the tier and wrapped with a 44-byte WAV
 * header in-process. `dense` picks the persistent-tier in-file shape.
 * Failure returns null — the alarm degrades to the system default sound and
 * never blocks reminder creation.
 */
async function synthesizeAlarmWav(text: string, dense: boolean): Promise<Uint8Array | null> {
  if (getTtsProvider() !== "elevenlabs") return null;
  const rate = parsePcmSampleRate(ALARM_PCM_OUTPUT_FORMAT);
  if (rate === null) return null;
  const pcm = await synthesizeWithElevenLabs({ text, outputFormat: ALARM_PCM_OUTPUT_FORMAT });
  return buildAlarmWav(new Uint8Array(pcm), rate, { dense });
}

/**
 * One line's TTS bundle: mp3 (playback, all platforms) + wav (iOS alarm sound).
 * Both say exactly the stored line — nothing is prepended on the way to TTS
 * (OLD-95), so the mp3 and the wav can never drift apart.
 */
async function synthesizeAndStoreLineTts(
  ctx: { storage: { store: (blob: Blob) => Promise<Id<"_storage">> } },
  args: { text: string; title?: string; dense: boolean }
): Promise<{ audioStorageId: Id<"_storage">; wavStorageId?: Id<"_storage"> }> {
  const [ttsBuffer, wavBytes] = await Promise.all([
    synthesizeReminderTts(args),
    synthesizeAlarmWav(args.text, args.dense).catch((e) => {
      console.error("[VR] Alarm WAV synthesis failed (system default alarm sound will be used):", e);
      return null;
    }),
  ]);
  const audioStorageId = await ctx.storage.store(
    new Blob([new Uint8Array(ttsBuffer)], { type: "audio/mpeg" })
  );
  let wavStorageId: Id<"_storage"> | undefined;
  if (wavBytes) {
    wavStorageId = await ctx.storage.store(new Blob([new Uint8Array(wavBytes)], { type: "audio/wav" }));
  }
  return { audioStorageId, wavStorageId };
}

/**
 * TTS each replay variant into its own stored mp3 plus its ladder-rung wav.
 * Lines and audios stay in lockstep: a variant whose synthesis fails is dropped
 * entirely (fewer variants), and failures never propagate — variant audio must
 * never block reminder creation. The wav list is a prefix of the kept variants
 * (see alignVariantWavIds); rungs past it fall back to the base wav.
 */
async function synthesizeVariantTts(
  ctx: { storage: { store: (blob: Blob) => Promise<Id<"_storage">> } },
  title: string,
  variantTexts: string[],
  dense: boolean
): Promise<{
  keptVariants: string[];
  variantAudioStorageIds: Id<"_storage">[];
  variantWavStorageIds: Id<"_storage">[];
}> {
  const keptVariants: string[] = [];
  const variantAudioStorageIds: Id<"_storage">[] = [];
  const wavStorageIds: (Id<"_storage"> | undefined)[] = [];
  for (const line of variantTexts) {
    try {
      const { audioStorageId, wavStorageId } = await synthesizeAndStoreLineTts(ctx, {
        text: line,
        title: `${title} (replay ${keptVariants.length + 1})`,
        dense,
      });
      keptVariants.push(line);
      variantAudioStorageIds.push(audioStorageId);
      wavStorageIds.push(wavStorageId);
    } catch (e) {
      console.error("[VR] Variant TTS generation failed (variant dropped):", e);
    }
  }
  return {
    keptVariants,
    variantAudioStorageIds,
    variantWavStorageIds: alignVariantWavIds(wavStorageIds),
  };
}

/**
 * Every schedule column a planned reminder writes to Convex. Before OLD-97 only
 * the first four crossed the wire and the rest lived in AsyncStorage, so a
 * reminder read back from Convex had lost its schedule.
 */
function scheduleColumnsFor(plan: ReminderPlan) {
  return {
    time: plan.time,
    date: plan.date,
    frequency: plan.frequency,
    days: plan.days,
    schedule: plan.schedule,
    scheduleType: plan.scheduleType,
    onceAt: plan.onceAt,
    rrule: plan.rrule,
    dtstart: plan.dtstart,
    until: plan.until,
    intervalMs: plan.intervalMs,
    anchorAt: plan.anchorAt,
    intervalDays: plan.intervalDays,
    tzid: plan.schedule.tzid,
    parseWarnings: plan.parseWarnings.length > 0 ? plan.parseWarnings : undefined,
  };
}

/** The slice of an action ctx one reminder's creation needs. */
type CreateReminderCtx = {
  storage: {
    store: (blob: Blob) => Promise<Id<"_storage">>;
    getUrl: (storageId: Id<"_storage">) => Promise<string | null>;
  };
  runMutation: (reference: any, args: any) => Promise<any>;
};

/**
 * Synthesize, store and insert ONE planned reminder, and hand back the result
 * shape the app has always received for a created reminder (slow path — audio
 * is ready by the time this returns).
 *
 * Called once per reminder in the take.
 */
async function createReminderWithAudio(
  ctx: CreateReminderCtx,
  args: { deviceId: string; transcript: string },
  plan: ReminderPlan
) {
  // Generate TTS. The guard floors at the model's own line, so this is empty
  // only when the parse returned neither a description nor a title — the guard
  // can trade phrasing away, never the line itself.
  const ttsText = plan.description;
  // Persistent reminders nag inside one ringing alarm; every other tier says
  // its line once and comes back as a later ladder rung.
  const dense = useDenseAlarmWav(plan.persistent);
  // Generate + store TTS (mp3 for playback + alarm-ready wav when available).
  // What was stored is what is spoken — no prefix goes on here (OLD-95).
  const { audioStorageId: storageId, wavStorageId } = await synthesizeAndStoreLineTts(ctx, {
    text: ttsText,
    title: plan.title,
    dense,
  });

  // Second short line for the pre-alert; failure never blocks the reminder.
  let preAudioStorageId: Id<"_storage"> | undefined;
  if (plan.preTtsText) {
    try {
      const preTtsBuffer = await synthesizeReminderTts({
        text: plan.preTtsText,
        title: `${plan.title} (heads-up)`,
      });
      const preBlob = new Blob([new Uint8Array(preTtsBuffer)], { type: "audio/mpeg" });
      preAudioStorageId = await ctx.storage.store(preBlob);
    } catch (e) {
      console.error("[VR] Pre-alert TTS generation failed:", e);
    }
  }

  // Replay variant lines: kept in lockstep with their audios — a failed synth
  // drops that variant (fewer variants, never a blocked creation).
  const { keptVariants, variantAudioStorageIds, variantWavStorageIds } =
    await synthesizeVariantTts(ctx, plan.title, plan.variants, dense);

  const reminderId: Id<"reminders"> = await ctx.runMutation(internal.reminders.create, {
    deviceId: args.deviceId,
    title: plan.title,
    description: plan.description,
    ...scheduleColumnsFor(plan),
    emoji: plan.emoji,
    audioStorageId: storageId,
    wavStorageId,
    preReminderMinutes: plan.preReminderMinutes > 0 ? plan.preReminderMinutes : undefined,
    preAudioStorageId,
    urgency: plan.urgency,
    persistent: plan.persistent || undefined,
    variants: keptVariants.length > 0 ? keptVariants : undefined,
    variantAudioStorageIds:
      variantAudioStorageIds.length > 0 ? variantAudioStorageIds : undefined,
    variantWavStorageIds:
      variantWavStorageIds.length > 0 ? variantWavStorageIds : undefined,
  });

  const audioUrl = await ctx.storage.getUrl(storageId);
  const preAudioUrl = preAudioStorageId ? await ctx.storage.getUrl(preAudioStorageId) : null;
  const variantAudioUrls = (
    await Promise.all(variantAudioStorageIds.map((id) => ctx.storage.getUrl(id)))
  ).filter((url): url is string => Boolean(url));
  // Kept index-aligned with the rungs, so nulls stay in place.
  const variantWavUrls = await Promise.all(
    variantWavStorageIds.map((id) => ctx.storage.getUrl(id))
  );

  return {
    id: reminderId as string,
    title: plan.title,
    description: plan.description,
    schedule: plan.schedule,
    times: plan.times,
    time: plan.time,
    date: plan.date,
    frequency: plan.frequency,
    days: plan.days,
    intervalDays: plan.intervalDays,
    emoji: plan.emoji,
    transcript: args.transcript,
    audioUrl,
    preReminderMinutes: plan.preReminderMinutes,
    preAudioUrl,
    urgency: plan.urgency,
    persistent: plan.persistent,
    variants: keptVariants,
    variantAudioUrls,
    variantWavUrls,

    intervalMs: plan.intervalMs,
    anchorAt: plan.anchorAt,

    // New unified schedule fields
    scheduleType: plan.scheduleType,
    onceAt: plan.onceAt,
    rrule: plan.rrule,
    dtstart: plan.dtstart,
    until: plan.until,
    parseWarnings: plan.parseWarnings.length > 0 ? plan.parseWarnings : undefined,
  };
}

export const processVoiceReminder = action({
  args: {
    // Owning install (OLD-74) — stamped on the reminder so only this device can read it back.
    deviceId: v.string(),
    audioBase64: v.string(),
    traceId: v.optional(v.string()),
    deviceLocalDate: v.optional(v.string()),
    deviceLocalTime: v.optional(v.string()),
    deviceTimezone: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
    const openrouter = new OpenAI({
      apiKey: process.env.OPENROUTER_API_KEY,
      baseURL: "https://openrouter.ai/api/v1",
    });
    // 1. Whisper STT
    const audioBuffer = Buffer.from(args.audioBase64, "base64");
    const audioFile = new File([audioBuffer], "recording.m4a", {
      type: "audio/mp4",
    });

    const transcription = await openai.audio.transcriptions.create({
      file: audioFile,
      model: "whisper-1",
    });

    const transcript = transcription.text;
    console.log("[VR] === STEP 1: STT Transcription ===");
    console.log("[VR] Transcript:", transcript);

    // 2. GPT Parse - use device LOCAL time directly (no timezone conversion)
    const currentDate = args.deviceLocalDate || new Date().toISOString().split('T')[0];
    const currentTime = args.deviceLocalTime || new Date().toLocaleTimeString('en-US', { hour12: false });
    const now = new Date(`${currentDate}T${currentTime}`);
    const currentDayOfWeek = now.toLocaleDateString('en-US', { weekday: 'long' });
    const timezone = args.deviceTimezone || 'UTC';

    console.log("[VR] === STEP 2: Context sent to GPT ===");
    console.log("[VR] Device Local Date:", args.deviceLocalDate);
    console.log("[VR] Device Local Time:", args.deviceLocalTime);
    console.log("[VR] Parsed as:", { currentDate, currentTime, currentDayOfWeek, timezone });

    const completion = await openrouter.chat.completions.create({
      model: "openai/gpt-5.6-luna",
      response_format: { type: "json_object" },
      // Luna is a hybrid reasoner; "none" keeps it in the non-reasoning mode the
      // parse path needs — thinking tokens would add seconds of dead air post-speech.
      reasoning_effort: "none",
      // Without an explicit cap OpenRouter reserves credit for the model's full
      // 65k output allowance and 402s on low balances; the parse JSON is tiny.
      max_tokens: 2000,
      messages: [
        {
          role: "system",
          // Same prompt as the fast path — one prompt, one place, so the parse
          // contract (incl. the multi-reminder envelope) cannot drift between the
          // two paths, and the phrasing evals cover both.
          content: buildSystemPrompt({ currentDate, currentDayOfWeek, currentTime, timezone }),
        },
        {
          role: "user",
          content: transcript,
        },
      ],
    });

    const rawGptResponse = completion.choices[0].message.content || "{}";
    console.log("[VR] === STEP 3: Raw GPT Response ===");
    console.log("[VR] GPT returned:", rawGptResponse);

    // One take can hold several reminders (OLD-93). A single-reminder take is
    // an array of one, so it takes exactly the path it always did.
    const plans = planRemindersFromRawParse(rawGptResponse, { transcript, currentTime });
    console.log("[VR] Reminders in this take:", plans.length);

    const created: Awaited<ReturnType<typeof createReminderWithAudio>>[] = [];
    for (const plan of plans) {
      created.push(
        await createReminderWithAudio(
          ctx,
          { deviceId: args.deviceId, transcript },
          plan
        )
      );
    }

    // Backwards-compatible shape: the first reminder's fields stay top-level,
    // where every existing caller reads them, with the whole take alongside.
    const result = {
      ...created[0],
      reminders: created,
      reminderCount: created.length,
    };

    console.log("[VR] === STEP 4: Final Result to App ===");
    console.log("[VR] Returning:", JSON.stringify(result, null, 2));

    return result;
  },
});

export const processTextReminder = action({
  args: {
    // Owning install (OLD-74) — stamped on the reminder so only this device can read it back.
    deviceId: v.string(),
    title: v.string(),
    description: v.string(),
    time: v.string(),
    frequency: v.string(),
    days: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    const rawFrequency = String(args.frequency || "once").toLowerCase();
    const frequency = rawFrequency === "weekly" ? "custom" : rawFrequency;
    const days = frequency === "custom" ? args.days : undefined;
    // Typed reminders get a grid too, so nothing reaches storage schedule-less.
    const schedule = buildGridSchedule(
      { frequency, time: args.time, days },
      { fallbackTime: args.time }
    );

    const normalizedDescription = normalizeReminderDescription(args.description);
    const ttsText = normalizedDescription || args.description;
    // The line is the user's own wording, so the opener guard (model output
    // only) stays out of it — and it is spoken exactly as typed.
    // Typed reminders carry no tier yet, so they get the plain one-utterance shape.
    const { audioStorageId: storageId, wavStorageId } = await synthesizeAndStoreLineTts(ctx, {
      text: ttsText,
      title: args.title,
      dense: false,
    });

    const reminderId: Id<"reminders"> = await ctx.runMutation(
      internal.reminders.create,
      {
        deviceId: args.deviceId,
        title: args.title,
        description: normalizedDescription || args.description,
        time: args.time,
        frequency,
        days,
        schedule,
        audioStorageId: storageId,
        wavStorageId,
      }
    );

    const audioUrl = await ctx.storage.getUrl(storageId);

    return {
      id: reminderId as string,
      title: args.title,
      description: args.description,
      time: args.time,
      frequency,
      days,
      schedule,
      audioUrl,
    };
  },
});

export const regenerateReminderAudio = action({
  args: {
    reminderId: v.id("reminders"),
    // Owning install (OLD-74) — another device's reminder is not found here.
    deviceId: v.string(),
    soundText: v.string(),
  },
  handler: async (ctx, args) => {
    // 1. Get the existing reminder
    const reminder = await ctx.runQuery(internal.reminders.getInternal, {
      id: args.reminderId,
    });

    // A reminder owned by another device is indistinguishable from a missing
    // one; a legacy row (no deviceId) is still regenerable by whoever holds it.
    if (!reminder || (reminder.deviceId !== undefined && reminder.deviceId !== args.deviceId)) {
      throw new Error("Reminder not found");
    }

    // 2. Generate + store new TTS audio (mp3 + alarm-ready wav when available),
    // reusing the reminder's own tier so the in-file shape does not change.
    const { audioStorageId: newStorageId, wavStorageId: newWavStorageId } =
      await synthesizeAndStoreLineTts(ctx, {
        text: args.soundText,
        title: reminder.title,
        dense: useDenseAlarmWav(normalizePersistent(reminder.persistent)),
      });

    // 4. Delete old audio and update reminder
    if (reminder.audioStorageId) {
      await ctx.runMutation(internal.reminders.updateAudio, {
        id: args.reminderId,
        oldStorageId: reminder.audioStorageId,
        newStorageId,
        oldWavStorageId: reminder.wavStorageId,
        newWavStorageId,
      });
    } else {
      // No existing audio, just update with new storage ID
      await ctx.runMutation(internal.reminders.setAudio, {
        id: args.reminderId,
        audioStorageId: newStorageId,
        wavStorageId: newWavStorageId,
        audioStatus: "ready",
        audioUpdatedAt: Date.now(),
      });
    }

    // 5. Get new audio URL
    const audioUrl = await ctx.storage.getUrl(newStorageId);

    return {
      audioUrl,
      soundText: args.soundText,
    };
  },
});

// =================== FAST VOICE REMINDER (no base64, TTS in background) ===================

/** The slice of an action ctx a deferred-audio take needs. */
type FastTakeCtx = {
  runMutation: (reference: any, args: any) => Promise<any>;
  scheduler: { runAfter: (delayMs: number, reference: any, args: any) => Promise<any> };
};

/**
 * Parse one transcript and insert every reminder it asks for, with the audio
 * deferred to a background TTS job.
 *
 * Both fast paths land here: a voice take arrives after Whisper, the composer's
 * typed sentence arrives with no STT at all (OLD-101). Same prompt, same plans,
 * same TTS jobs — a typed reminder is a spoken one that skipped the microphone.
 * `perf` is the caller's own timings object and is accumulated into.
 */
async function createTakeWithDeferredAudio(
  ctx: FastTakeCtx,
  args: {
    deviceId: string;
    transcript: string;
    currentDate: string;
    currentTime: string;
    currentDayOfWeek: string;
    timezone: string;
  },
  perf: Record<string, number>
) {
  const openrouter = new OpenAI({
    apiKey: process.env.OPENROUTER_API_KEY,
    baseURL: "https://openrouter.ai/api/v1",
  });

  const tGpt = Date.now();
  const completion = await openrouter.chat.completions.create({
    model: "openai/gpt-5.6-luna",
    response_format: { type: "json_object" },
    reasoning_effort: "none",
    max_tokens: 2000,
    messages: [
      {
        role: "system",
        content: buildSystemPrompt({
          currentDate: args.currentDate,
          currentDayOfWeek: args.currentDayOfWeek,
          currentTime: args.currentTime,
          timezone: args.timezone,
        }),
      },
      {
        role: "user",
        content: args.transcript,
      },
    ],
  });
  perf.gptMs = Date.now() - tGpt;

  const rawGptResponse = completion.choices[0].message.content || "{}";
  // One take can hold several reminders (OLD-93). A single-reminder take is
  // an array of one, so it takes exactly the path it always did.
  const plans = planRemindersFromRawParse(rawGptResponse, {
    transcript: args.transcript,
    currentTime: args.currentTime,
  });

  // Create each reminder in DB immediately (audio pending) and enqueue its TTS.
  // The stage timings accumulate over the take, so `perf` still reports the
  // total spent in mutations and in scheduling.
  perf.mutationMs = 0;
  perf.scheduleMs = 0;
  // Untyped so the pushed shape types the array (and the action return).
  const created = [];

  for (const plan of plans) {
    const tMutation = Date.now();
    const reminderId: Id<"reminders"> = await ctx.runMutation(
      internal.reminders.create,
      {
        deviceId: args.deviceId,
        title: plan.title,
        description: plan.description,
        ...scheduleColumnsFor(plan),
        emoji: plan.emoji,
        audioStorageId: undefined,
        preReminderMinutes:
          plan.preReminderMinutes > 0 ? plan.preReminderMinutes : undefined,
        urgency: plan.urgency,
        persistent: plan.persistent || undefined,
        variants: plan.variants.length > 0 ? plan.variants : undefined,
        audioStatus: "pending",
        audioUpdatedAt: Date.now(),
      }
    );
    perf.mutationMs += Date.now() - tMutation;

    // Enqueue background TTS generation (persistent picks the dense wav
    // shape). One job per reminder.
    const tSchedule = Date.now();
    await ctx.scheduler.runAfter(0, internal.actions.generateReminderTtsForReminder, {
      reminderId,
      title: plan.title,
      // The guard floors at the model's own line, so this is empty only when
      // the parse returned neither a description nor a title.
      ttsText: plan.description,
      preTtsText: plan.preTtsText || undefined,
      variantTexts: plan.variants.length > 0 ? plan.variants : undefined,
      persistent: plan.persistent || undefined,
    });
    perf.scheduleMs += Date.now() - tSchedule;

    created.push({
      id: reminderId as string,
      title: plan.title,
      description: plan.description,
      schedule: plan.schedule,
      times: plan.times,
      time: plan.time,
      date: plan.date,
      frequency: plan.frequency,
      days: plan.days,
      intervalDays: plan.intervalDays,
      emoji: plan.emoji,
      transcript: args.transcript,
      audioStatus: "pending",
      preReminderMinutes: plan.preReminderMinutes,
      urgency: plan.urgency,
      persistent: plan.persistent,
      variants: plan.variants,
      intervalMs: plan.intervalMs,
      anchorAt: plan.anchorAt,
      scheduleType: plan.scheduleType,
      onceAt: plan.onceAt,
      rrule: plan.rrule,
      dtstart: plan.dtstart,
      until: plan.until,
      parseWarnings: plan.parseWarnings.length > 0 ? plan.parseWarnings : undefined,
    });
  }

  return created;
}

export const processVoiceReminderFast = action({
  args: {
    // Owning install (OLD-74) — stamped on the reminder so only this device can read it back.
    deviceId: v.string(),
    audioStorageId: v.id("_storage"),
    traceId: v.optional(v.string()),
    deviceLocalDate: v.optional(v.string()),
    deviceLocalTime: v.optional(v.string()),
    deviceTimezone: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });

    // 1. Load audio blob from storage
    const audioBlob = await ctx.storage.get(args.audioStorageId);
    if (!audioBlob) {
      throw new Error("Audio not found in storage");
    }

    // Server-stage timings (OLD-82). Returned as `perf` — app/index.tsx already
    // logs `result.perf` when present, so this fills a branch that was until now
    // always dead and splits the action's wall time into its real components.
    const tActionStart = Date.now();
    const perf: Record<string, number> = {};

    // Wrap STT+GPT processing in try/finally to ensure uploaded recording is deleted
    try {
      // 2. Whisper STT
      const arrayBuffer = await audioBlob.arrayBuffer();
      const audioFile = new File([arrayBuffer], "recording.m4a", {
        type: "audio/mp4",
      });
      perf.blobMs = Date.now() - tActionStart;

      const tWhisper = Date.now();
      const transcription = await openai.audio.transcriptions.create({
        file: audioFile,
        model: "whisper-1",
      });
      perf.whisperMs = Date.now() - tWhisper;

      const transcript = transcription.text;
      console.log("[VR] === STEP 1: STT Transcription ===");
      console.log("[VR] Transcript:", transcript);

      // 3. Parse with Gemini Flash via OpenRouter
      const currentDate = args.deviceLocalDate || new Date().toISOString().split('T')[0];
      const currentTime = args.deviceLocalTime || new Date().toLocaleTimeString('en-US', { hour12: false });
      const now = new Date(`${currentDate}T${currentTime}`);
      const currentDayOfWeek = now.toLocaleDateString('en-US', { weekday: 'long' });
      const timezone = args.deviceTimezone || 'UTC';

      // 4. Parse and create the take (audio deferred). Shared with the typed
      // composer, so both inputs run the identical pipeline (OLD-101).
      const created = await createTakeWithDeferredAudio(
        ctx,
        {
          deviceId: args.deviceId,
          transcript,
          currentDate,
          currentTime,
          currentDayOfWeek,
          timezone,
        },
        perf
      );

      perf.actionMs = Date.now() - tActionStart;

      // 6. Return immediately. Backwards-compatible shape: the first reminder's
      // fields stay top-level, where every existing caller reads them, with the
      // whole take alongside.
      return {
        perf,
        ...created[0],
        reminders: created,
        reminderCount: created.length,
      };
    } finally {
      // 7. Delete uploaded recording audio (always cleanup).
      //
      // NOTE (OLD-82): this `finally` runs BEFORE the client receives the return
      // value, so this round trip sits on the critical path between "reminder
      // row exists" and "card appears". `perf` is the same object the return
      // statement referenced, so the timing below still reaches the client.
      // If storageDeleteMs turns out to be material on device, move this to a
      // scheduled cleanup step instead of deleting inline.
      const tDelete = Date.now();
      try {
        await ctx.storage.delete(args.audioStorageId);
      } catch (e) {
        console.error("[VR] Failed to delete uploaded recording:", e);
      }
      perf.storageDeleteMs = Date.now() - tDelete;
    }
  },
});

// =================== TYPED REMINDER (composer — same parse, no STT) ===================

/**
 * One typed sentence from the composer (OLD-101).
 *
 * Deliberately thin: the sentence is the transcript, so this is the fast voice
 * path with Whisper removed. Same prompt, same plans, same background TTS —
 * a typed reminder speaks like a recorded one — and the result shape is the
 * fast path's, so the app's take loop (lib/voiceTake.ts) cannot tell the two
 * apart.
 */
export const processTypedReminder = action({
  args: {
    // Owning install (OLD-74) — stamped on the reminder so only this device can read it back.
    deviceId: v.string(),
    text: v.string(),
    traceId: v.optional(v.string()),
    deviceLocalDate: v.optional(v.string()),
    deviceLocalTime: v.optional(v.string()),
    deviceTimezone: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const transcript = args.text.trim();
    if (!transcript) {
      throw new Error("Nothing to parse");
    }

    const tActionStart = Date.now();
    const perf: Record<string, number> = {};

    // Device LOCAL time, same as the voice paths — relative phrasing ("in ten
    // minutes", "tomorrow") is only parseable against the user's own clock.
    const currentDate = args.deviceLocalDate || new Date().toISOString().split('T')[0];
    const currentTime = args.deviceLocalTime || new Date().toLocaleTimeString('en-US', { hour12: false });
    const now = new Date(`${currentDate}T${currentTime}`);
    const currentDayOfWeek = now.toLocaleDateString('en-US', { weekday: 'long' });
    const timezone = args.deviceTimezone || 'UTC';

    console.log("[VR] === TYPED INPUT ===");
    console.log("[VR] Text:", transcript);

    const created = await createTakeWithDeferredAudio(
      ctx,
      {
        deviceId: args.deviceId,
        transcript,
        currentDate,
        currentTime,
        currentDayOfWeek,
        timezone,
      },
      perf
    );

    perf.actionMs = Date.now() - tActionStart;

    return {
      perf,
      ...created[0],
      reminders: created,
      reminderCount: created.length,
    };
  },
});

export const generateReminderTtsForReminder = internalAction({
  args: {
    reminderId: v.id("reminders"),
    title: v.string(),
    ttsText: v.string(),
    preTtsText: v.optional(v.string()),
    variantTexts: v.optional(v.array(v.string())),
    // Optional so jobs enqueued by an older deploy still run (they get the
    // plain one-utterance shape).
    persistent: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    try {
      const dense = useDenseAlarmWav(normalizePersistent(args.persistent));

      // 1. Generate + store TTS (mp3 + alarm-ready wav when available). Both
      // say the stored line verbatim — nothing is prepended (OLD-95).
      const { audioStorageId: newAudioStorageId, wavStorageId: newWavStorageId } =
        await synthesizeAndStoreLineTts(ctx, {
          text: args.ttsText,
          title: args.title,
          dense,
        });

      // 2b. Pre-alert line (optional); failure never blocks the main audio.
      let preAudioStorageId: Id<"_storage"> | undefined;
      if (args.preTtsText) {
        try {
          const preTtsBuffer = await synthesizeReminderTts({
            text: args.preTtsText,
            title: `${args.title} (heads-up)`,
          });
          const preBlob = new Blob([new Uint8Array(preTtsBuffer)], { type: "audio/mpeg" });
          preAudioStorageId = await ctx.storage.store(preBlob);
        } catch (e) {
          console.error("[VR] Pre-alert TTS generation failed:", e);
        }
      }

      // 2c. Replay variants (optional); each failure just drops that variant.
      // The setAudio patch re-stores the kept lines so texts and audios stay
      // in lockstep even when some synths fail.
      let keptVariants: string[] | undefined;
      let variantAudioStorageIds: Id<"_storage">[] | undefined;
      let variantWavStorageIds: Id<"_storage">[] | undefined;
      if (args.variantTexts?.length) {
        const result = await synthesizeVariantTts(ctx, args.title, args.variantTexts, dense);
        keptVariants = result.keptVariants;
        variantAudioStorageIds = result.variantAudioStorageIds;
        variantWavStorageIds = result.variantWavStorageIds;
      }

      // 3. Update reminder with new audio
      await ctx.runMutation(internal.reminders.setAudio, {
        id: args.reminderId,
        audioStorageId: newAudioStorageId,
        wavStorageId: newWavStorageId,
        preAudioStorageId,
        variants: keptVariants,
        variantAudioStorageIds,
        variantWavStorageIds,
        audioStatus: "ready",
        audioUpdatedAt: Date.now(),
      });
    } catch (e) {
      // 4. On failure, mark as failed
      console.error("[VR] TTS generation failed:", e);
      await ctx.runMutation(internal.reminders.setAudio, {
        id: args.reminderId,
        audioStatus: "failed",
        audioError: String(e).slice(0, 500),
        audioUpdatedAt: Date.now(),
      });
    }
  },
});
