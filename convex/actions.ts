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

/**
 * Keep-warm no-op (OLD-106).
 *
 * Every action in this file runs in the `"use node"` runtime, which is a
 * separate container from the default Convex runtime and is torn down when it
 * goes idle. A cold container was the leading suspect behind the one 18.4s
 * reminder we caught (wall 18426ms against actionMs 1508ms — 17s that the
 * action itself never saw), so `convex/crons.ts` pokes this entry every 5
 * minutes to keep the container resident.
 *
 * It must stay trivial: no external API calls, no database work, no imports it
 * doesn't already share with the parse path. Merely being invoked in this
 * module is the entire point — the runtime boot and this file's module-level
 * initialization (the OpenAI SDK, the prompt strings) are what we are paying
 * to keep alive.
 */
export const keepWarm = internalAction({
  args: {},
  handler: async () => {
    return { ok: true, at: Date.now() };
  },
});

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

import { clamp, normalizeReminderDescription, guardSpokenLine, normalizeDay, getCurrentTimeHM, buildDescriptionInstruction, buildPreReminderInstruction, normalizePreReminder, buildHeadsUpTtsText, buildReplayTierInstruction, normalizeUrgency, normalizePersistent, normalizeEmoji, normalizeParsedReminders, buildAlarmWav, parsePcmSampleRate, containsArabicScript, ALARM_PCM_OUTPUT_FORMAT, MULTI_REMINDER_INSTRUCTION, SPOKEN_LINE_RULES_SECTION, URGENCY_RULES_HEADING, type Urgency } from "./helpers";
import { buildGridSchedule, legacyFieldsFromGrid, normalizeClockTimes, zonedTimeToUtcMs, type GridSchedule } from "./scheduleShape";

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
  parseWarnings: string[];
  /**
   * Did the parse actually NAME this reminder's day and clock time, or were
   * they filled in from the device's own clock?
   *
   * Nothing on the legacy paths reads these — they are carried for the creation
   * job's strict gate (convex/creationValidate.ts), which cannot tell the two
   * apart by the time it sees the finished plan and needs to: "today at three",
   * said at half past, is a one-off the user asked for and the app has an
   * Overdue group for, while a past instant that fell out of a missing date or
   * a missing time is a parse that went wrong.
   */
  explicitDate: boolean;
  explicitTime: boolean;
};

/**
 * What a plan knows about the user's clock (OLD-120).
 *
 * All three come off the device — `deviceLocalDate` / `deviceLocalTime` /
 * `deviceTimezone` on every parse action. The server's own clock is UTC and
 * says nothing about when the user meant, so anything that turns a wall clock
 * into an instant reads these and never `Date.now()`'s calendar.
 */
export type PlanContext = {
  transcript: string;
  currentTime: string;
  /** Device-local "YYYY-MM-DD". */
  currentDate?: string;
  /** IANA zone the parsed wall-clock times are meant in. */
  timezone?: string;
};

/** Today-or-tomorrow for a bare "HH:MM", decided on the USER's clock. */
function nextLocalDateFor(time: string, context: PlanContext): string {
  const today =
    context.currentDate && /^\d{4}-\d{2}-\d{2}$/.test(context.currentDate)
      ? context.currentDate
      : new Date().toISOString().slice(0, 10);
  // "HH:MM" strings compare in clock order, so no Date is needed to ask
  // whether the ring is still ahead today.
  if (time > getCurrentTimeHM(context.currentTime)) return today;
  const [year, month, day] = today.split("-").map(Number);
  // UTC arithmetic purely as calendar math — no zone is implied by it.
  return new Date(Date.UTC(year, month - 1, day + 1)).toISOString().slice(0, 10);
}

/**
 * The instant a one-off rings (OLD-120).
 *
 * This used to be `new Date(y, m - 1, d, h, min).getTime()`, which reads the
 * HOST's zone — and a Convex action's host zone is UTC. A Dubai user's 15:42
 * was therefore stored as 15:42Z, four hours after the ring, and the app's
 * launch pass trusts `onceAt` for one-offs: missed-marking ran four hours late
 * and a reminder opened inside that window looked still due.
 *
 * The wall clock only means something in the user's zone, so that is where it
 * is resolved. A missing or unknown zone falls back to the old host-local math
 * AND says so in parseWarnings — a silently wrong one-off is the exact failure
 * being replaced here, so it does not get to fail silently again.
 */
function computeOnceAt(
  args: { date: string | undefined; time: string; warnings: string[] },
  context: PlanContext
): number {
  // A parsed one-off always carries a date (the grid dates it); the
  // fall-through is defensive, and decides today-or-tomorrow on the user's own
  // clock rather than the server's.
  const date = args.date ?? nextLocalDateFor(args.time, context);

  const zoned = zonedTimeToUtcMs(date, args.time, context.timezone);
  if (zoned !== null) return zoned;

  args.warnings.push(
    `Could not place ${date} ${args.time} in timezone "${context.timezone ?? "unknown"}". Used the server clock, so this one-off may be off by the zone's offset.`
  );
  const [year, month, dayNum] = date.split("-").map(Number);
  const [hours, minutes] = args.time.split(":").map(Number);
  return new Date(year, month - 1, dayNum, hours, minutes).getTime();
}

export function buildReminderPlan(
  parsed: Record<string, unknown>,
  context: PlanContext & { takeSize?: number }
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

  // Provenance of the wall clock, for the creation job's gate (see ReminderPlan).
  // A day survives here only when the model named one; a time counts as named
  // whether it arrived as `time` or inside the `times` list, because the grid's
  // first ring can come from either.
  const explicitDate = date !== undefined;
  const explicitTime =
    (typeof parsed.time === "string" && parsed.time !== "") ||
    (Array.isArray(parsed.times) &&
      parsed.times.some((entry) => typeof entry === "string" && entry !== ""));

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

  // A one-off the model did not date. Left to itself the grid dates it from
  // the SERVER's calendar day (scheduleShape.firstDateFor reads the host
  // clock, which is UTC inside an action), so it lands a day out for anyone
  // whose local date has already turned over. Decided on the user's clock
  // instead (OLD-120); the earliest ring is what "today or tomorrow" is about,
  // matching what firstDateFor would have asked.
  const undatedOnceDate =
    !date && frequency === "once"
      ? nextLocalDateFor(normalizeClockTimes(parsed.times, time)[0] ?? time, context)
      : undefined;

  // The days × times grid (OLD-97). Everything above says at most one time a
  // day; this is what lets "Thursday 8 and 9" be one reminder with two rings,
  // and what gives an interval its waking window.
  const schedule = buildGridSchedule(
    {
      frequency,
      time,
      times: parsed.times,
      date: date ?? undatedOnceDate,
      days,
      everyNDays: parsed.everyNDays,
      intervalHours: parsed.intervalHours,
      intervalMinutes: parsed.intervalMinutes,
      windowStart: parsed.windowStart,
      windowEnd: parsed.windowEnd,
      until: parsed.until,
    },
    // The zone is stamped on the grid so a stored schedule records which clock
    // its times were meant on — the same zone `onceAt` is resolved in below.
    { fallbackTime: time, tzid: context.timezone, warnings: parseWarnings }
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
    // The wall clock the user said, resolved in the zone they said it in.
    onceAt = computeOnceAt(
      { date: scheduleDate, time: primaryTime, warnings: parseWarnings },
      context
    );
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

  // Ring tier. Only the tier survives (OLD-108) — the escalating variant lines
  // that used to be parsed alongside it are gone, and `parsed.variants` is
  // ignored outright if an older prompt's response still carries it.
  const urgency = normalizeUrgency(parsed.urgency);
  const persistent = normalizePersistent(parsed.persistent);

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
    parseWarnings,
    explicitDate,
    explicitTime,
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
  context: PlanContext
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
/**
 * The parse prompt, shared by every path that turns a sentence into a reminder.
 *
 * Ordered for prompt caching (OLD-106). Everything from here down to
 * CURRENT CONTEXT is byte-identical on every request, so the provider can serve
 * the ~3.6k-token instruction block from cache instead of prefilling it each
 * time; the volatile date/time/timezone sits alone at the very END, where it
 * invalidates nothing behind it. This block used to open with the context,
 * which meant ~70% of the prompt sat behind a string that changed every second
 * and could never be cached.
 *
 * Two consequences worth keeping in mind when editing:
 *   1. Nothing above the CURRENT CONTEXT block may interpolate anything that
 *      varies per request. The RELATIVE TIME RULES point at the block by name
 *      rather than inlining the clock for exactly this reason.
 *   2. SPOKEN LINE RULES is stated once, near the top, and the spoken field
 *      instructions refer to it by name — so it must stay above them. There are
 *      two of those left since OLD-108 (description, preDescription); the
 *      replay-variant field that was the third is gone.
 */
export function buildSystemPrompt(context: { currentDate: string; currentDayOfWeek: string; currentTime: string; timezone: string }): string {
  return `Parse the user's reminder request into structured JSON. The input may be in ENGLISH or ARABIC.

${SPOKEN_LINE_RULES_SECTION}

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
  "urgency": "urgent" | "notice" | "routine" (how hard the reminder has to push, see ${URGENCY_RULES_HEADING}),
  "persistent": boolean (true only for critical tasks, see ${URGENCY_RULES_HEADING}),
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

DATE PARSING RULES (English & Arabic):
- "Sunday"/"يوم الأحد", "tomorrow"/"غداً", "today"/"اليوم" → calculate actual YYYY-MM-DD
- "next Sunday"/"الأحد القادم" → find the NEXT occurrence
- "in 3 days"/"بعد ثلاثة أيام" → add days to current date
- ONLY include "date" for one-time reminders (frequency: "once")
- Do NOT include "date" for recurring/daily reminders

RELATIVE TIME RULES:
- "in X minutes"/"بعد X دقائق" = add to current time (the Current time in CURRENT CONTEXT at the end of this prompt) → frequency="once"
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
- ONE short sentence, present tense, about the thing itself (aim for 3-8 words)
- The line takes ONE of exactly TWO shapes, picked by the content
- Something the user DOES → a bare imperative and nothing else ("Drink your water.", "Take your pills.") — no "right now" on the end, no "please", no framing around the verb
- Something that HAPPENS on its own → stated as happening now ("Your son's game is right now.", "Your flight is right now.") — never restate the clock time the reminder was set for
- Never put anything in front of the substance: no greetings (English: "Hey", "Hi" / Arabic: "مرحبا", "أهلاً", "السلام عليكم"), no clock announcements ("It is time", "It's time", a bare "Time to ...", Arabic "حان وقت"/"حان الوقت"), no reminder labels ("Quick reminder", "Just a reminder", "Heads up", Arabic "تذكير سريع"), no conversational lead-ins ("By the way", "Just so you know", "Remember", "Don't forget", Arabic "على فكرة"/"لا تنسى")
- Never address the user by name or title, and never add wellness, benefit or encouragement commentary — say the thing and stop
- Arabic examples: "اشرب ماءك." / "خذ حبوبك." / "مباراة ابنك الآن." / "اجتماعك مع أحمد الآن."

TIME PARSING (Speech-to-text quirks):
- "10 4 p.m." = 22:04, "9 30 a.m." = 09:30
- The first number is hours, the second is minutes

${buildPreReminderInstruction()}

${buildReplayTierInstruction()}

If no time specified, use a reasonable default.
If no frequency specified, assume "once".${MULTI_REMINDER_INSTRUCTION}

CURRENT CONTEXT:
- Current date: ${context.currentDate} (${context.currentDayOfWeek})
- Current time: ${context.currentTime}
- User's timezone: ${context.timezone}`;
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

const ELEVENLABS_DEFAULT_MODEL_ID = "eleven_multilingual_v2";

/**
 * Retries on a 429, so a rate-limited line comes back instead of vanishing.
 *
 * This is not hypothetical: the account's ceiling is TWO concurrent requests
 * (measured — `concurrent_limit_exceeded` names the number), and one line is
 * already two calls. A multi-reminder take runs one TTS job per reminder, so
 * any take of two or more reminders is over the cap by construction and was
 * quietly losing variants to it before OLD-107.
 */
const TTS_MAX_ATTEMPTS = 3;
const TTS_RETRY_MIN_MS = 400;
const TTS_RETRY_MAX_MS = 3000;

function elevenLabsModelId(): string {
  return process.env.ELEVENLABS_MODEL_ID || ELEVENLABS_DEFAULT_MODEL_ID;
}

/**
 * Speechify carries all narration (OLD-62/OLD-66): the same Beatrice voice on
 * simba-3.2 for English and simba-multilingual for Arabic-script lines —
 * simba-3.2 does not reject Arabic, it silently mangles it, so the model is
 * picked from the text (containsArabicScript), never from a response. No key
 * in the env means the whole pipeline falls back to ElevenLabs — that is the
 * rollback switch.
 */
const SPEECHIFY_DEFAULT_MODEL = "simba-3.2";
const SPEECHIFY_DEFAULT_MULTILINGUAL_MODEL = "simba-multilingual";
const SPEECHIFY_DEFAULT_VOICE_ID = "beatrice_32";

function speechifyModelFor(text: string): string {
  if (containsArabicScript(text)) {
    return process.env.SPEECHIFY_MULTILINGUAL_MODEL || SPEECHIFY_DEFAULT_MULTILINGUAL_MODEL;
  }
  return process.env.SPEECHIFY_MODEL || SPEECHIFY_DEFAULT_MODEL;
}

function speechifyVoiceId(): string {
  return process.env.SPEECHIFY_VOICE_ID || SPEECHIFY_DEFAULT_VOICE_ID;
}

function routesToSpeechify(_text: string): boolean {
  return Boolean(process.env.SPEECHIFY_API_KEY);
}

/**
 * What every synthesis timing log is labeled with (OLD-107).
 *
 * `ELEVENLABS_MODEL_ID` is an env override — the dev deployment runs
 * `eleven_v3`, the slowest tier, and nothing in the logs said so. Per-line
 * numbers captured under one model were therefore not comparable with numbers
 * captured under another, which is exactly the comparison OLD-62/OLD-67 need.
 */
function ttsModelLabel(text?: string): string {
  if (getTtsProvider() !== "elevenlabs") return "resemble";
  if (text !== undefined && routesToSpeechify(text)) {
    return `speechify/${speechifyModelFor(text)}`;
  }
  return `elevenlabs/${elevenLabsModelId()}`;
}

/** `Retry-After` in ms, clamped — a provider asking us to wait a minute is not a reason to. */
function retryAfterMs(header: string | null): number {
  const seconds = Number(header);
  if (!Number.isFinite(seconds) || seconds <= 0) return TTS_RETRY_MIN_MS;
  return Math.min(Math.max(seconds * 1000, TTS_RETRY_MIN_MS), TTS_RETRY_MAX_MS);
}

async function synthesizeWithElevenLabs(args: { text: string; outputFormat?: string }): Promise<Buffer> {
  const apiKey = requireEnv("ELEVENLABS_API_KEY");
  const voiceId = requireEnv("ELEVENLABS_VOICE_ID");
  const modelId = elevenLabsModelId();
  const outputFormat = args.outputFormat || process.env.ELEVENLABS_OUTPUT_FORMAT || "mp3_44100_128";

  const url = new URL(
    `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}`
  );
  url.searchParams.set("output_format", outputFormat);

  for (let attempt = 1; ; attempt++) {
    const started = Date.now();
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

    // Concurrency went up in OLD-107, so the one failure that increase can
    // cause gets handled rather than dropped: a rate-limited variant used to
    // just vanish from the ladder.
    if (response.status === 429 && attempt < TTS_MAX_ATTEMPTS) {
      // Backs off further each time: a concurrency 429 clears when whatever
      // else is in flight finishes, and retrying into the same wall is free
      // only in the sense that it fails just as fast.
      const waitMs = retryAfterMs(response.headers.get("retry-after")) * attempt;
      console.warn(
        `[VR][tts] 429 model=${modelId} format=${outputFormat} attempt=${attempt} retryInMs=${waitMs}`
      );
      await new Promise((resolve) => setTimeout(resolve, waitMs));
      continue;
    }

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(`ElevenLabs TTS failed (${response.status}): ${body.slice(0, 500)}`);
    }

    const audio = await response.arrayBuffer();
    console.log(
      `[VR][tts] call model=elevenlabs/${modelId} format=${outputFormat} chars=${args.text.length} attempt=${attempt} ms=${Date.now() - started}`
    );
    return Buffer.from(audio);
  }
}

/**
 * One JSON POST, audio comes back base64 in the body (both mp3 and raw PCM ride
 * the same envelope). Same 429 retry contract as ElevenLabs — Speechify's
 * concurrency ceiling is unpublished, so the survivability is kept, not tuned.
 * `text_normalization` defaults to true server-side, which is what makes
 * "7:30" read as "seven thirty" — do not turn it off.
 */
async function synthesizeWithSpeechify(args: { text: string; outputFormat?: string }): Promise<Buffer> {
  const apiKey = requireEnv("SPEECHIFY_API_KEY");
  const model = speechifyModelFor(args.text);
  const formatLabel = args.outputFormat || "mp3";
  const body: Record<string, unknown> = {
    input: args.text,
    voice_id: speechifyVoiceId(),
    model,
    ...(args.outputFormat ? { output_format: args.outputFormat } : { audio_format: "mp3" }),
  };

  for (let attempt = 1; ; attempt++) {
    const started = Date.now();
    const response = await fetch("https://api.speechify.ai/v1/audio/speech", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (response.status === 429 && attempt < TTS_MAX_ATTEMPTS) {
      const waitMs = retryAfterMs(response.headers.get("retry-after")) * attempt;
      console.warn(
        `[VR][tts] 429 model=speechify/${model} format=${formatLabel} attempt=${attempt} retryInMs=${waitMs}`
      );
      await new Promise((resolve) => setTimeout(resolve, waitMs));
      continue;
    }

    if (!response.ok) {
      const errBody = await response.text().catch(() => "");
      throw new Error(`Speechify TTS failed (${response.status}): ${errBody.slice(0, 500)}`);
    }

    const json = (await response.json()) as { audio_data?: string };
    if (!json.audio_data) {
      throw new Error("Speechify TTS returned no audio_data");
    }
    console.log(
      `[VR][tts] call model=speechify/${model} format=${formatLabel} chars=${args.text.length} attempt=${attempt} ms=${Date.now() - started}`
    );
    return Buffer.from(json.audio_data, "base64");
  }
}

async function synthesizeReminderTts(args: { text: string; title?: string }): Promise<Buffer> {
  const provider = getTtsProvider();
  if (provider === "elevenlabs") {
    if (routesToSpeechify(args.text)) {
      return await synthesizeWithSpeechify({ text: args.text });
    }
    return await synthesizeWithElevenLabs({ text: args.text });
  }
  return await synthesizeWithResemble(args);
}

/**
 * Alarm-ready WAV of one spoken line (iOS AlarmKit custom sound).
 * PCM out (Speechify — simba-3.2 or simba-multilingual per the line's script;
 * ElevenLabs only as keyless fallback — same pcm_22050 byte layout from all),
 * shaped into repeated utterances and wrapped with a 44-byte WAV header
 * in-process.
 * Failure returns null — the alarm degrades to the system default sound and
 * never blocks reminder creation.
 */
async function synthesizeAlarmWav(text: string): Promise<Uint8Array | null> {
  if (getTtsProvider() !== "elevenlabs") return null;
  const rate = parsePcmSampleRate(ALARM_PCM_OUTPUT_FORMAT);
  if (rate === null) return null;
  const pcm = routesToSpeechify(text)
    ? await synthesizeWithSpeechify({ text, outputFormat: ALARM_PCM_OUTPUT_FORMAT })
    : await synthesizeWithElevenLabs({ text, outputFormat: ALARM_PCM_OUTPUT_FORMAT });
  return buildAlarmWav(new Uint8Array(pcm), rate);
}

/**
 * One line's TTS bundle: mp3 (playback, all platforms) + wav (iOS alarm sound).
 * Both say exactly the stored line — nothing is prepended on the way to TTS
 * (OLD-95), so the mp3 and the wav can never drift apart.
 */
async function synthesizeAndStoreLineTts(
  ctx: { storage: { store: (blob: Blob) => Promise<Id<"_storage">> } },
  args: { text: string; title?: string }
): Promise<{ audioStorageId: Id<"_storage">; wavStorageId?: Id<"_storage"> }> {
  const started = Date.now();
  const [ttsBuffer, wavBytes] = await Promise.all([
    synthesizeReminderTts(args),
    synthesizeAlarmWav(args.text).catch((e) => {
      console.error("[VR] Alarm WAV synthesis failed (system default alarm sound will be used):", e);
      return null;
    }),
  ]);
  const synthMs = Date.now() - started;

  // Both blobs at once (OLD-107). The two synths were already parallel, then
  // their stores queued one behind the other for no reason — they share
  // nothing, and neither result is read here.
  const tStore = Date.now();
  const [audioStorageId, wavStorageId] = await Promise.all([
    ctx.storage.store(new Blob([new Uint8Array(ttsBuffer)], { type: "audio/mpeg" })),
    wavBytes
      ? ctx.storage.store(new Blob([new Uint8Array(wavBytes)], { type: "audio/wav" }))
      : Promise.resolve(undefined),
  ]);

  console.log(
    `[VR][tts] line model=${ttsModelLabel(args.text)} chars=${args.text.length} wav=${wavBytes ? 1 : 0} synthMs=${synthMs} storeMs=${Date.now() - tStore} totalMs=${Date.now() - started}`
  );
  return { audioStorageId, wavStorageId };
}

/**
 * The one line a reminder speaks besides the line it rings: the pre-alert
 * heads-up, minutes before the event.
 *
 * This was a bounded-concurrency pool over the pre-alert plus one to three
 * replay variants (OLD-107). OLD-108 deleted the variants, which leaves exactly
 * one optional job — so the pool, its index-alignment bookkeeping and its
 * `TTS_LINE_CONCURRENCY` dial are gone with it. The reliability half of that
 * work stays where it belongs: the 429 retry lives inside
 * synthesizeWithElevenLabs, so this call is still rate-limit-survivable.
 *
 * Returns undefined rather than throwing when synthesis fails. A missing
 * pre-alert audio is a heads-up that arrives as a silent notification, which is
 * the pre-feature behavior; nothing about the ring itself depends on it.
 *
 * No alarm wav is synthesized here: the pre-alert arrives as a notification,
 * never as a ring, so only the mp3 is ever played.
 */
async function synthesizeAndStorePreAlertTts(
  ctx: { storage: { store: (blob: Blob) => Promise<Id<"_storage">> } },
  args: { title: string; preTtsText: string }
): Promise<Id<"_storage"> | undefined> {
  const started = Date.now();
  try {
    const buffer = await synthesizeReminderTts({
      text: args.preTtsText,
      title: `${args.title} (heads-up)`,
    });
    const preAudioStorageId = await ctx.storage.store(
      new Blob([new Uint8Array(buffer)], { type: "audio/mpeg" })
    );
    console.log(
      `[VR][tts] pre-alert model=${ttsModelLabel(args.preTtsText)} chars=${args.preTtsText.length} ms=${
        Date.now() - started
      }`
    );
    return preAudioStorageId;
  } catch (e) {
    console.error("[VR] pre-alert TTS generation failed (dropped):", e);
    return undefined;
  }
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
  // Generate + store TTS (mp3 for playback + alarm-ready wav when available).
  // What was stored is what is spoken — no prefix goes on here (OLD-95).
  const { audioStorageId: storageId, wavStorageId } = await synthesizeAndStoreLineTts(ctx, {
    text: ttsText,
    title: plan.title,
  });

  // The pre-alert line, when this reminder has a lead time. This path returns
  // only when everything is stored (it is the fallback the client takes when
  // the fast path fails), and a failed heads-up never blocks the creation.
  const preAudioStorageId = plan.preTtsText
    ? await synthesizeAndStorePreAlertTts(ctx, {
        title: plan.title,
        preTtsText: plan.preTtsText,
      })
    : undefined;

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
  });

  const audioUrl = await ctx.storage.getUrl(storageId);
  const preAudioUrl = preAudioStorageId ? await ctx.storage.getUrl(preAudioStorageId) : null;

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
    // currentDate/timezone are what make a one-off's `onceAt` land on the
    // user's clock instead of the server's UTC one (OLD-120).
    const plans = planRemindersFromRawParse(rawGptResponse, {
      transcript,
      currentTime,
      currentDate,
      timezone,
    });
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
    const { audioStorageId: storageId, wavStorageId } = await synthesizeAndStoreLineTts(ctx, {
      text: ttsText,
      title: args.title,
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

    // 2. Generate + store new TTS audio (mp3 + alarm-ready wav when available).
    const { audioStorageId: newStorageId, wavStorageId: newWavStorageId } =
      await synthesizeAndStoreLineTts(ctx, {
        text: args.soundText,
        title: reminder.title,
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
    // The user's own calendar day and zone — a one-off's `onceAt` is resolved
    // against these, never the action container's UTC clock (OLD-120).
    currentDate: args.currentDate,
    timezone: args.timezone,
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
        audioStatus: "pending",
        // Set here rather than only in the TTS job, so there is no window where
        // a row that will grow a pre-alert reads as one that never asked for one.
        audioExtrasStatus: plan.preTtsText ? "pending" : undefined,
        audioUpdatedAt: Date.now(),
      }
    );
    perf.mutationMs += Date.now() - tMutation;

    // Enqueue background TTS generation. One job per reminder.
    const tSchedule = Date.now();
    await ctx.scheduler.runAfter(0, internal.actions.generateReminderTtsForReminder, {
      reminderId,
      title: plan.title,
      // The guard floors at the model's own line, so this is empty only when
      // the parse returned neither a description nor a title.
      ttsText: plan.description,
      preTtsText: plan.preTtsText || undefined,
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
      // 7. Hand the uploaded recording to a cleanup job (always cleanup).
      //
      // This is what OLD-82's note asked for: the `finally` runs BEFORE the
      // client receives the return value, so deleting inline put a storage
      // round trip between "reminder row exists" and "card appears" — latency
      // spent on housekeeping the user has no stake in. Enqueueing is a local
      // DB write instead, and it still runs on the throwing path, so a failed
      // parse does not leak the blob. `perf` is the same object the return
      // statement referenced, so the timing below still reaches the client.
      const tDelete = Date.now();
      try {
        await ctx.scheduler.runAfter(0, internal.reminders.deleteUploadedAudio, {
          storageId: args.audioStorageId,
        });
      } catch (e) {
        console.error("[VR] Failed to enqueue recording cleanup:", e);
      }
      perf.storageCleanupScheduleMs = Date.now() - tDelete;
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
    // Neither is read any more. `persistent` stopped mattering when the wav
    // shape became the same for every tier; `variantTexts` stopped existing
    // when the nag went back to repeating the base line (OLD-108). Both are
    // still accepted so a job enqueued by an older deploy passes validation
    // instead of dying in the scheduler.
    variantTexts: v.optional(v.array(v.string())),
    persistent: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const hasPreAlert = Boolean(args.preTtsText);

    // ── Phase 1: the base line, alone ─────────────────────────────────────
    //
    // This is the whole of what `audioStatus: "ready"` promises — a stored,
    // playable line for this reminder to ring — so it is the whole of what the
    // user waits on. Until OLD-107 the pre-alert was inside this wait too,
    // which put a reminder with a heads-up at seconds of "pending" for audio
    // that nothing plays until minutes later.
    //
    // It runs by itself rather than sharing the phase below, so the one line
    // anyone is waiting for gets the provider's full attention.
    let base: { audioStorageId: Id<"_storage">; wavStorageId?: Id<"_storage"> };
    try {
      // Says the stored line verbatim — nothing is prepended (OLD-95).
      base = await synthesizeAndStoreLineTts(ctx, {
        text: args.ttsText,
        title: args.title,
      });
    } catch (e) {
      console.error("[VR] TTS generation failed:", e);
      await ctx.runMutation(internal.reminders.setAudio, {
        id: args.reminderId,
        audioStatus: "failed",
        audioError: String(e).slice(0, 500),
        audioUpdatedAt: Date.now(),
      });
      return;
    }

    await ctx.runMutation(internal.reminders.setAudio, {
      id: args.reminderId,
      audioStorageId: base.audioStorageId,
      wavStorageId: base.wavStorageId,
      audioStatus: "ready",
      // Tells the device whether a second patch is coming (lib/audioHydration.ts
      // keeps polling on "pending"). Without it the client would stop at the
      // base line and the pre-alert would sit in Convex unclaimed.
      audioExtrasStatus: hasPreAlert ? "pending" : "ready",
      audioUpdatedAt: Date.now(),
    });

    if (!args.preTtsText) return;

    // ── Phase 2: the pre-alert line ───────────────────────────────────────
    //
    // Nothing here can touch `audioStatus`. The base line is already stored,
    // and a reminder that rings its base line is a working reminder — a
    // heads-up with no audio still arrives as a notification, so a failed
    // second phase is a quieter reminder, not a broken one.
    const preAudioStorageId = await synthesizeAndStorePreAlertTts(ctx, {
      title: args.title,
      preTtsText: args.preTtsText,
    });

    // Only fields this phase actually produced go into the patch: a Convex
    // patch treats an explicit `undefined` as "delete this field", and the
    // base line's ids are already on the row.
    await ctx.runMutation(internal.reminders.setAudio, {
      id: args.reminderId,
      ...(preAudioStorageId ? { preAudioStorageId } : {}),
      audioExtrasStatus: preAudioStorageId ? "ready" : "failed",
      audioUpdatedAt: Date.now(),
    });
  },
});
