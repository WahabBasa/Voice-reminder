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

import { clamp, normalizeReminderDescription, normalizeDay, getCurrentTimeHM, buildDescriptionInstruction, buildPreReminderInstruction, normalizePreReminder, buildVariantInstruction, normalizeUrgency, normalizePersistent, normalizeEmoji, normalizeVariants, variantCountForTier, buildAlarmWav, alignVariantWavIds, useDenseAlarmWav, parsePcmSampleRate, ALARM_PCM_OUTPUT_FORMAT } from "./helpers";

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

// Shared helper: coerce frequency based on transcript and days
function coerceFrequency(
  frequency: string,
  days: string[] | undefined,
  transcript: string,
  parseWarnings: string[]
): { frequency: string; days: string[] | undefined; warnings: string[] } {
  const warnings = [...parseWarnings];
  let coercedFrequency = frequency;
  let coercedDays = days;
  const transcriptLower = transcript.toLowerCase();

  // Rule: If days are provided, force frequency to "custom"
  if (coercedDays && coercedDays.length > 0 && coercedFrequency !== "custom") {
    warnings.push("Coerced frequency to custom because days were provided.");
    coercedFrequency = "custom";
  }

  // Rule: If transcript implies weekly but model returns daily, coerce
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

  // Rule: "weekdays" implies custom MO-FR.
  if (/\bweekdays?\b/.test(transcriptLower) && coercedFrequency !== "interval") {
    coercedFrequency = "custom";
    coercedDays = ["mon", "tue", "wed", "thu", "fri"];
    warnings.push("Transcript implies weekdays. Coercing to custom MO-FR.");
  }

  return { frequency: coercedFrequency, days: coercedDays, warnings };
}

// Shared helper: build system prompt for GPT
function buildSystemPrompt(context: { currentDate: string; currentDayOfWeek: string; currentTime: string; timezone: string; addressTerm?: string }): string {
  return `Parse the user's reminder request into structured JSON. The input may be in ENGLISH or ARABIC.

Return exactly this format:
{
  "title": "short title (2-4 words)",
  "description": "${buildDescriptionInstruction(context.addressTerm)}",
  "time": "HH:MM in 24-hour format",
  "date": "YYYY-MM-DD format (only for one-time reminders on a specific day)",
  "frequency": "once" | "daily" | "custom" | "interval",
  "days": ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] (only if frequency is custom),
  "intervalHours": number (only if frequency is interval),
  "intervalMinutes": number (only if frequency is interval),
  "scheduleType": "once" | "interval" | "rrule",
  "rrule": "RFC5545 RRULE string (for complex patterns)",
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

RRULE PATTERNS (for scheduleType="rrule"):
- "every Sunday at 8am" → FREQ=WEEKLY;BYDAY=SU;BYHOUR=8;BYMINUTE=0
- "weekdays at 9am" → FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR;BYHOUR=9;BYMINUTE=0
- "1st of every month at 8am" → FREQ=MONTHLY;BYMONTHDAY=1;BYHOUR=8;BYMINUTE=0
- "first Monday monthly at 9am" → FREQ=MONTHLY;BYDAY=MO;BYSETPOS=1;BYHOUR=9;BYMINUTE=0
- "every day at 9am and 5pm" → create TWO separate reminders (simple approach)

BOUNDED RECURRENCES:
- "every day at 8am for 2 weeks" → frequency="daily", until="2026-02-22"
- "weekdays at 9 until March 1st" → rrule with UNTIL

INTERVAL RULES:
- "every 8 hours"/"كل 8 ساعات" = frequency="interval" and intervalHours=8
- "every 30 minutes"/"كل 30 دقيقة" = frequency="interval" and intervalMinutes=30
- "in 8 hours"/"بعد 8 ساعات" = ONE-TIME reminder (frequency="once")
- For interval reminders: do NOT include a specific date. time can be omitted.
- Minimum interval: 5 minutes. Maximum interval: 365 days.
- If user asks for less than 5 minutes, set to 5 minutes with a note.

FREQUENCY RULES (deterministic):
- If days are provided → frequency="custom" (weekly on specific days)
- "every day"/"daily" → frequency="daily" (not "custom")
- "every Sunday" → rrule pattern (FREQ=WEEKLY;BYDAY=SU) OR frequency="custom", days=["sun"]
- "weekdays" → frequency="custom", days=["mon","tue","wed","thu","fri"] OR rrule

ARABIC TIME EXPRESSIONS:
- "الساعة ثمانية صباحاً" = 08:00
- "الساعة تسعة مساءً" = 21:00
- "صباحاً" = AM, "مساءً" = PM

INTENT + TONE RULES:
- Keep the exact intent (do not add meaning or extra context)
- Do not add greetings (English: "Hey", "Hi" / Arabic: "مرحبا", "أهلاً", "السلام عليكم")
- Keep the description short, direct, and reminder-like
- Arabic example: "حان وقت تناول الدواء" (Time to take your medicine)

TIME PARSING (Speech-to-text quirks):
- "10 4 p.m." = 22:04, "9 30 a.m." = 09:30
- The first number is hours, the second is minutes

${buildPreReminderInstruction()}

${buildVariantInstruction(context.addressTerm)}

If no time specified, use a reasonable default.
If no frequency specified, assume "once".`;
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

/** One line's TTS bundle: mp3 (playback, all platforms) + wav (iOS alarm sound). */
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

export const processVoiceReminder = action({
  args: {
    audioBase64: v.string(),
    traceId: v.optional(v.string()),
    deviceLocalDate: v.optional(v.string()),
    deviceLocalTime: v.optional(v.string()),
    deviceTimezone: v.optional(v.string()),
    addressTerm: v.optional(v.string()),
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
      model: "google/gemini-3.1-flash-lite-preview",
      response_format: { type: "json_object" },
      // Without an explicit cap OpenRouter reserves credit for the model's full
      // 65k output allowance and 402s on low balances; the parse JSON is tiny.
      max_tokens: 2000,
      messages: [
        {
          role: "system",
          content: `Parse the user's reminder request into structured JSON. The input may be in ENGLISH or ARABIC.

Return exactly this format:
{
  "title": "short title (2-4 words)",
  "description": "${buildDescriptionInstruction(args.addressTerm)}",
  "time": "HH:MM in 24-hour format",
  "date": "YYYY-MM-DD format (only for one-time reminders on a specific day)",
  "frequency": "once" | "daily" | "custom" | "interval",
  "days": ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] (only if frequency is custom),
  "intervalHours": number (only if frequency is interval),
  "intervalMinutes": number (only if frequency is interval),
  
  // NEW: Unified schedule system (optional, for complex patterns)
  "scheduleType": "once" | "interval" | "rrule" (infer from other fields if not provided),
  "rrule": "RFC5545 RRULE string (for complex weekly/monthly/yearly patterns)",
  "until": "ISO date for bounded recurrences (e.g., 'for 2 weeks')",
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
- Current date: ${currentDate} (${currentDayOfWeek})
- Current time: ${currentTime}
- User's timezone: ${timezone}

DATE PARSING RULES (English & Arabic):
- "Sunday"/"يوم الأحد", "tomorrow"/"غداً", "today"/"اليوم" → calculate actual YYYY-MM-DD
- "next Sunday"/"الأحد القادم" → find the NEXT occurrence
- "in 3 days"/"بعد ثلاثة أيام" → add days to current date
- ONLY include "date" for one-time reminders (frequency: "once")
- Do NOT include "date" for recurring/daily reminders

RELATIVE TIME RULES:
- "in X minutes"/"بعد X دقائق" = add to current time (${currentTime}) → frequency="once"
- "in X hours"/"بعد X ساعات" = add hours to current time → frequency="once"
- "every X minutes"/"كل X دقائق" = INTERVAL reminder (frequency="interval")
- "every X hours"/"كل X ساعات" = INTERVAL reminder (frequency="interval")

RRULE PATTERNS (for scheduleType="rrule"):
- "every Sunday at 8am" → FREQ=WEEKLY;BYDAY=SU;BYHOUR=8;BYMINUTE=0
- "weekdays at 9am" → FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR;BYHOUR=9;BYMINUTE=0
- "1st of every month at 8am" → FREQ=MONTHLY;BYMONTHDAY=1;BYHOUR=8;BYMINUTE=0
- "first Monday monthly at 9am" → FREQ=MONTHLY;BYDAY=MO;BYSETPOS=1;BYHOUR=9;BYMINUTE=0
- "every day at 9am and 5pm" → create TWO separate reminders (simple approach)

BOUNDED RECURRENCES:
- "every day at 8am for 2 weeks" → frequency="daily", until="2026-02-22"
- "weekdays at 9 until March 1st" → rrule with UNTIL

INTERVAL RULES:
- "every 8 hours"/"كل 8 ساعات" = frequency="interval" and intervalHours=8
- "every 30 minutes"/"كل 30 دقيقة" = frequency="interval" and intervalMinutes=30
- "in 8 hours"/"بعد 8 ساعات" = ONE-TIME reminder (frequency="once")
- For interval reminders: do NOT include a specific date. time can be omitted.
- Minimum interval: 5 minutes. Maximum interval: 365 days.
- If user asks for less than 5 minutes, set to 5 minutes with a note.

FREQUENCY RULES (deterministic):
- If days are provided → frequency="custom" (weekly on specific days)
- "every day"/"daily" → frequency="daily" (not "custom")
- "every Sunday" → rrule pattern (FREQ=WEEKLY;BYDAY=SU) OR frequency="custom", days=["sun"]
- "weekdays" → frequency="custom", days=["mon","tue","wed","thu","fri"] OR rrule

ARABIC TIME EXPRESSIONS:
- "الساعة ثمانية صباحاً" = 08:00
- "الساعة تسعة مساءً" = 21:00
- "صباحاً" = AM, "مساءً" = PM

INTENT + TONE RULES:
- Keep the exact intent (do not add meaning or extra context)
- Do not add greetings (English: "Hey", "Hi" / Arabic: "مرحبا", "أهلاً", "السلام عليكم")
- Keep the description short, direct, and reminder-like
- Arabic example: "حان وقت تناول الدواء" (Time to take your medicine)

TIME PARSING (Speech-to-text quirks):
- "10 4 p.m." = 22:04, "9 30 a.m." = 09:30
- The first number is hours, the second is minutes

${buildPreReminderInstruction()}

${buildVariantInstruction(args.addressTerm)}

If no time specified, use a reasonable default.
If no frequency specified, assume "once".`,
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

    const parsed = JSON.parse(rawGptResponse);
    const description = normalizeReminderDescription(parsed.description);

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
    const currentTimeHm = getCurrentTimeHM(currentTime);
    const time = typeof parsed.time === "string" && parsed.time ? (parsed.time as string) : currentTimeHm;

    // Parse warnings for normalization issues
    let parseWarnings: string[] = [];

    // Coerce frequency based on transcript and days
    const coercionResult = coerceFrequency(frequency, days, transcript, parseWarnings);
    frequency = coercionResult.frequency;
    days = coercionResult.days;
    parseWarnings = coercionResult.warnings;

    // Interval normalization
    let intervalMs: number | undefined;
    let anchorAt: number | undefined;
    if (frequency === "interval") {
      const hours = Number(parsed.intervalHours ?? 0);
      const minutes = Number(parsed.intervalMinutes ?? 0);
      const totalMinutes = hours * 60 + minutes;

      intervalMs = totalMinutes * 60 * 1000;
      // Updated constraints: 5 min minimum, 365 days maximum
      const MIN_MS = 5 * 60 * 1000;
      const MAX_MS = 365 * 24 * 60 * 60 * 1000;
      
      if (intervalMs < MIN_MS) {
        parseWarnings.push(`Minimum interval is 5 minutes. Adjusted from ${Math.round(intervalMs / 60000)} minutes.`);
        intervalMs = MIN_MS;
      } else if (intervalMs > MAX_MS) {
        parseWarnings.push(`Maximum interval is 365 days. Adjusted.`);
        intervalMs = MAX_MS;
      }

      anchorAt = Date.now();
    }

    // NEW: Unified schedule system fields
    let scheduleType: "once" | "interval" | "rrule" | undefined;
    let onceAt: number | undefined;
    let rrule: string | undefined;
    let dtstart: number | undefined;
    let until: number | undefined;

    // Infer scheduleType from parsed data
    if (parsed.scheduleType && ["once", "interval", "rrule"].includes(parsed.scheduleType)) {
      scheduleType = parsed.scheduleType;
    } else if (frequency === "interval") {
      scheduleType = "interval";
    } else if (parsed.rrule) {
      scheduleType = "rrule";
    } else if (frequency === "once") {
      scheduleType = "once";
      // Calculate onceAt timestamp
      if (date) {
        const [year, month, dayNum] = date.split("-").map(Number);
        const [hours, minutes] = time.split(":").map(Number);
        onceAt = new Date(year, month - 1, dayNum, hours, minutes).getTime();
      } else {
        const [hours, minutes] = time.split(":").map(Number);
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
      const [hours, minutes] = time.split(":").map(Number);
      
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
      rrule = parsed.rrule;
      scheduleType = "rrule";
      dtstart = Date.now();
    }

    // Handle until/bounds
    if (parsed.until) {
      const ms = new Date(parsed.until).getTime();
      if (Number.isFinite(ms)) {
        until = ms;
      } else {
        parseWarnings.push(`Invalid until date "${String(parsed.until)}" ignored.`);
      }
    }

    // Pre-reminder (heads-up) fields
    const { preReminderMinutes, preDescription } = normalizePreReminder(
      parsed.preReminderMinutes,
      parsed.preDescription
    );
    const preTtsText =
      preReminderMinutes > 0
        // Fallback stays factual and opener-free, like the model's own line.
        ? preDescription || `${parsed.title} in ${preReminderMinutes} minutes`
        : "";

    // Assistant replay fields (urgency tier, persistence, escalating variants)
    const urgency = normalizeUrgency(parsed.urgency);
    const persistent = normalizePersistent(parsed.persistent);
    const variants = normalizeVariants(
      parsed.variants,
      variantCountForTier(urgency, persistent),
      description
    );

    // Card chip emoji (absent when the model returned junk → neutral bell chip)
    const emoji = normalizeEmoji(parsed.emoji);

    // 3. Generate TTS
    const ttsText = description || String(parsed.description ?? "");
    // Persistent reminders nag inside one ringing alarm; every other tier says
    // its line once and comes back as a later ladder rung.
    const dense = useDenseAlarmWav(persistent);
    // 4. Generate + store TTS (mp3 for playback + alarm-ready wav when available)
    const { audioStorageId: storageId, wavStorageId } = await synthesizeAndStoreLineTts(ctx, {
      text: ttsText,
      title: parsed.title as string,
      dense,
    });

    // Second short line for the pre-alert; failure never blocks the reminder.
    let preAudioStorageId: Id<"_storage"> | undefined;
    if (preTtsText) {
      try {
        const preTtsBuffer = await synthesizeReminderTts({
          text: preTtsText,
          title: `${parsed.title} (heads-up)`,
        });
        const preBlob = new Blob([new Uint8Array(preTtsBuffer)], { type: "audio/mpeg" });
        preAudioStorageId = await ctx.storage.store(preBlob);
      } catch (e) {
        console.error("[VR] Pre-alert TTS generation failed:", e);
      }
    }

    // Replay variant lines: kept in lockstep with their audios — a failed
    // synth drops that variant (fewer variants, never a blocked creation).
    const { keptVariants, variantAudioStorageIds, variantWavStorageIds } =
      await synthesizeVariantTts(ctx, parsed.title as string, variants, dense);

    // 5. Save to database
    const reminderId: Id<"reminders"> = await ctx.runMutation(
      internal.reminders.create,
      {
        title: parsed.title as string,
        description,
        time,
        date,
        frequency,
        days,
        emoji,
        audioStorageId: storageId,
        wavStorageId,
        preReminderMinutes: preReminderMinutes > 0 ? preReminderMinutes : undefined,
        preAudioStorageId,
        urgency,
        persistent: persistent || undefined,
        variants: keptVariants.length > 0 ? keptVariants : undefined,
        variantAudioStorageIds:
          variantAudioStorageIds.length > 0 ? variantAudioStorageIds : undefined,
        variantWavStorageIds:
          variantWavStorageIds.length > 0 ? variantWavStorageIds : undefined,
      }
    );

    const audioUrl = await ctx.storage.getUrl(storageId);
    const preAudioUrl = preAudioStorageId ? await ctx.storage.getUrl(preAudioStorageId) : null;
    const variantAudioUrls = (
      await Promise.all(variantAudioStorageIds.map((id) => ctx.storage.getUrl(id)))
    ).filter((url): url is string => Boolean(url));
    // Kept index-aligned with the rungs, so nulls stay in place.
    const variantWavUrls = await Promise.all(
      variantWavStorageIds.map((id) => ctx.storage.getUrl(id))
    );

    const result = {
      id: reminderId as string,
      title: parsed.title as string,
      description,
      time,
      date,
      frequency,
      days,
      emoji,
      transcript,
      audioUrl,
      preReminderMinutes,
      preAudioUrl,
      urgency,
      persistent,
      variants: keptVariants,
      variantAudioUrls,
      variantWavUrls,

      intervalMs,
      anchorAt,

      // New unified schedule fields
      scheduleType,
      onceAt,
      rrule,
      dtstart,
      until,
      parseWarnings: parseWarnings.length > 0 ? parseWarnings : undefined,
    };

    console.log("[VR] === STEP 4: Final Result to App ===");
    console.log("[VR] Returning:", JSON.stringify(result, null, 2));

    return result;
  },
});

export const processTextReminder = action({
  args: {
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

    const normalizedDescription = normalizeReminderDescription(args.description);
    const ttsText = normalizedDescription || args.description;
    // Typed reminders carry no tier yet, so they get the plain one-utterance shape.
    const { audioStorageId: storageId, wavStorageId } = await synthesizeAndStoreLineTts(ctx, {
      text: ttsText,
      title: args.title,
      dense: false,
    });

    const reminderId: Id<"reminders"> = await ctx.runMutation(
      internal.reminders.create,
      {
        title: args.title,
        description: normalizedDescription || args.description,
        time: args.time,
        frequency,
        days,
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
      audioUrl,
    };
  },
});

export const regenerateReminderAudio = action({
  args: {
    reminderId: v.id("reminders"),
    soundText: v.string(),
  },
  handler: async (ctx, args) => {
    // 1. Get the existing reminder
    const reminder = await ctx.runQuery(internal.reminders.getInternal, {
      id: args.reminderId,
    });

    if (!reminder) {
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

export const processVoiceReminderFast = action({
  args: {
    audioStorageId: v.id("_storage"),
    traceId: v.optional(v.string()),
    deviceLocalDate: v.optional(v.string()),
    deviceLocalTime: v.optional(v.string()),
    deviceTimezone: v.optional(v.string()),
    addressTerm: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });

    const openrouter = new OpenAI({
      apiKey: process.env.OPENROUTER_API_KEY,
      baseURL: "https://openrouter.ai/api/v1",
    });

    // 1. Load audio blob from storage
    const audioBlob = await ctx.storage.get(args.audioStorageId);
    if (!audioBlob) {
      throw new Error("Audio not found in storage");
    }

    // Wrap STT+GPT processing in try/finally to ensure uploaded recording is deleted
    try {
      // 2. Whisper STT
      const arrayBuffer = await audioBlob.arrayBuffer();
      const audioFile = new File([arrayBuffer], "recording.m4a", {
        type: "audio/mp4",
      });

      const transcription = await openai.audio.transcriptions.create({
        file: audioFile,
        model: "whisper-1",
      });

      const transcript = transcription.text;
      console.log("[VR] === STEP 1: STT Transcription ===");
      console.log("[VR] Transcript:", transcript);

      // 3. Parse with Gemini Flash via OpenRouter
      const currentDate = args.deviceLocalDate || new Date().toISOString().split('T')[0];
      const currentTime = args.deviceLocalTime || new Date().toLocaleTimeString('en-US', { hour12: false });
      const now = new Date(`${currentDate}T${currentTime}`);
      const currentDayOfWeek = now.toLocaleDateString('en-US', { weekday: 'long' });
      const timezone = args.deviceTimezone || 'UTC';

      const completion = await openrouter.chat.completions.create({
        model: "google/gemini-3.1-flash-lite-preview",
        response_format: { type: "json_object" },
        max_tokens: 2000,
        messages: [
          {
            role: "system",
            content: buildSystemPrompt({ currentDate, currentDayOfWeek, currentTime, timezone, addressTerm: args.addressTerm }),
          },
          {
            role: "user",
            content: transcript,
          },
        ],
      });

      const rawGptResponse = completion.choices[0].message.content || "{}";
      const parsed = JSON.parse(rawGptResponse);
      const description = normalizeReminderDescription(parsed.description);

      let frequency = String(parsed.frequency || "once").toLowerCase();
      if (frequency === "weekly") frequency = "custom";

      // Normalize days from model output
      let days: string[] | undefined = undefined;
      const modelDaysRaw = Array.isArray(parsed.days) ? (parsed.days as unknown[]) : [];
      const modelDaysNormalized = modelDaysRaw
        .map(normalizeDay)
        .filter((d): d is string => Boolean(d));
      if (modelDaysNormalized.length > 0) {
        days = modelDaysNormalized;
      }

      const date = frequency === "once" && parsed.date ? (parsed.date as string) : undefined;
      const time = typeof parsed.time === "string" && parsed.time 
        ? (parsed.time as string) 
        : getCurrentTimeHM(currentTime);

      // Parse warnings and coerce frequency
      let parseWarnings: string[] = [];
      const coercionResult = coerceFrequency(frequency, days, transcript, parseWarnings);
      frequency = coercionResult.frequency;
      days = coercionResult.days;
      parseWarnings = coercionResult.warnings;

      // Interval normalization
      let intervalMs: number | undefined;
      let anchorAt: number | undefined;
      if (frequency === "interval") {
        const hours = Number(parsed.intervalHours ?? 0);
        const minutes = Number(parsed.intervalMinutes ?? 0);
        const totalMinutes = hours * 60 + minutes;
        intervalMs = totalMinutes * 60 * 1000;
        const MIN_MS = 5 * 60 * 1000;
        const MAX_MS = 365 * 24 * 60 * 60 * 1000;
        if (intervalMs < MIN_MS) {
          parseWarnings.push(`Minimum interval is 5 minutes. Adjusted from ${Math.round(intervalMs / 60000)} minutes.`);
          intervalMs = MIN_MS;
        } else if (intervalMs > MAX_MS) {
          parseWarnings.push(`Maximum interval is 365 days. Adjusted.`);
          intervalMs = MAX_MS;
        }
        anchorAt = Date.now();
      }

      // Unified schedule fields
      let scheduleType: "once" | "interval" | "rrule" | undefined;
      let onceAt: number | undefined;
      let rrule: string | undefined;
      let dtstart: number | undefined;
      let until: number | undefined;

      if (parsed.scheduleType && ["once", "interval", "rrule"].includes(parsed.scheduleType)) {
        scheduleType = parsed.scheduleType;
      } else if (frequency === "interval") {
        scheduleType = "interval";
      } else if (parsed.rrule) {
        scheduleType = "rrule";
      } else if (frequency === "once") {
        scheduleType = "once";
        if (date) {
          const [year, month, dayNum] = date.split("-").map(Number);
          const [hours, minutes] = time.split(":").map(Number);
          onceAt = new Date(year, month - 1, dayNum, hours, minutes).getTime();
        } else {
          const [hours, minutes] = time.split(":").map(Number);
          const target = new Date();
          target.setHours(hours, minutes, 0, 0);
          // Interpret "at HH:MM" as the next occurrence (today or tomorrow)
          if (target.getTime() <= Date.now()) {
            target.setDate(target.getDate() + 1);
          }
          onceAt = target.getTime();
        }
      } else {
        scheduleType = "rrule";
        const [hours, minutes] = time.split(":").map(Number);
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
          rrule = `FREQ=DAILY;BYHOUR=${hours};BYMINUTE=${minutes}`;
        }
        dtstart = Date.now();
      }

      if (parsed.rrule) {
        rrule = parsed.rrule;
        scheduleType = "rrule";
        dtstart = Date.now();
      }

      if (parsed.until) {
        const ms = new Date(parsed.until).getTime();
        if (Number.isFinite(ms)) {
          until = ms;
        } else {
          parseWarnings.push(`Invalid until date "${String(parsed.until)}" ignored.`);
        }
      }

      // Pre-reminder (heads-up) fields
      const { preReminderMinutes, preDescription } = normalizePreReminder(
        parsed.preReminderMinutes,
        parsed.preDescription
      );
      const preTtsText =
        preReminderMinutes > 0
          // Fallback stays factual and opener-free, like the model's own line.
          ? preDescription || `${parsed.title} in ${preReminderMinutes} minutes`
          : "";

      // Assistant replay fields (urgency tier, persistence, escalating variants)
      const urgency = normalizeUrgency(parsed.urgency);
      const persistent = normalizePersistent(parsed.persistent);
      const variants = normalizeVariants(
        parsed.variants,
        variantCountForTier(urgency, persistent),
        description
      );

      // Card chip emoji (absent when the model returned junk → neutral bell chip)
      const emoji = normalizeEmoji(parsed.emoji);

      // 4. Create reminder in DB immediately (audio pending)
      const ttsText = description || String(parsed.description ?? "");
      const reminderId: Id<"reminders"> = await ctx.runMutation(
        internal.reminders.create,
        {
          title: parsed.title as string,
          description,
          time,
          date,
          frequency,
          days,
          emoji,
          audioStorageId: undefined,
          preReminderMinutes: preReminderMinutes > 0 ? preReminderMinutes : undefined,
          urgency,
          persistent: persistent || undefined,
          variants: variants.length > 0 ? variants : undefined,
          audioStatus: "pending",
          audioUpdatedAt: Date.now(),
        }
      );

      // 5. Enqueue background TTS generation (persistent picks the dense wav shape)
      await ctx.scheduler.runAfter(0, internal.actions.generateReminderTtsForReminder, {
        reminderId,
        title: parsed.title as string,
        ttsText,
        preTtsText: preTtsText || undefined,
        variantTexts: variants.length > 0 ? variants : undefined,
        persistent: persistent || undefined,
      });

      // 6. Return immediately
      return {
        id: reminderId as string,
        title: parsed.title as string,
        description,
        time,
        date,
        frequency,
        days,
        emoji,
        transcript,
        audioStatus: "pending",
        preReminderMinutes,
        urgency,
        persistent,
        variants,
        intervalMs,
        anchorAt,
        scheduleType,
        onceAt,
        rrule,
        dtstart,
        until,
        parseWarnings: parseWarnings.length > 0 ? parseWarnings : undefined,
      };
    } finally {
      // 7. Delete uploaded recording audio (always cleanup)
      try {
        await ctx.storage.delete(args.audioStorageId);
      } catch (e) {
        console.error("[VR] Failed to delete uploaded recording:", e);
      }
    }
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

      // 1. Generate + store TTS (mp3 + alarm-ready wav when available)
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
