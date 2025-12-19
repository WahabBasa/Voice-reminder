"use node";

import { action } from "./_generated/server";
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

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

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

function normalizeReminderDescription(input: unknown): string {
  const text = String(input ?? "").trim();
  if (!text) return "";

  // Strip common greetings the model/user might include at the start.
  // Examples: "Hey!", "Hey there,", "Hello -", "Hi:"
  const withoutGreeting = text.replace(
    /^(hey|hi|hello)\b(?:\s+(there|friend))?[\s,:\-!]+/i,
    ""
  );

  return withoutGreeting.trim();
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

async function synthesizeWithElevenLabs(args: { text: string }): Promise<Buffer> {
  const apiKey = requireEnv("ELEVENLABS_API_KEY");
  const voiceId = requireEnv("ELEVENLABS_VOICE_ID");
  const modelId = process.env.ELEVENLABS_MODEL_ID || "eleven_multilingual_v2";
  const outputFormat = process.env.ELEVENLABS_OUTPUT_FORMAT || "mp3_44100_128";

  const url = new URL(
    `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}`
  );
  url.searchParams.set("output_format", outputFormat);

  const response = await fetch(url.toString(), {
    method: "POST",
    headers: {
      "xi-api-key": apiKey,
      "Content-Type": "application/json",
      Accept: "audio/mpeg",
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

export const processVoiceReminder = action({
  args: { audioBase64: v.string(), traceId: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
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

    // 2. GPT Parse
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: `Parse the user's reminder request into structured JSON. Return exactly this format:
{
  "title": "short title (2-4 words)",
  "description": "what to say when reminder fires",
  "time": "HH:MM in 24-hour format",
  "frequency": "once" | "daily" | "custom",
  "days": ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] (only if frequency is custom)
}

IMPORTANT - Intent + tone rules:
- Keep the exact intent of the user's request (do not add new meaning, tasks, or extra context).
- Do not add greetings or filler like "Hey", "Hi", "Hello", "Hey there" at the start of the description.
- Keep the description short, direct, and reminder-like.

IMPORTANT - Time parsing rules:
- Speech-to-text often transcribes times with spaces instead of colons
- "10 4 p.m." means 10:04 PM = "22:04"
- "9 30 a.m." means 9:30 AM = "09:30"
- "10 15 p.m." means 10:15 PM = "22:15"
- The first number is hours, the second is minutes
- Current time is approximately ${new Date().toLocaleTimeString()}

If the user doesn't specify a time, use a reasonable default.
If the user doesn't specify frequency, assume "once".
The description should be a friendly reminder message like "Time to take your medicine" or "Don't forget to call mom".`,
        },
        {
          role: "user",
          content: transcript,
        },
      ],
    });

    const parsed = JSON.parse(completion.choices[0].message.content || "{}");
    const description = normalizeReminderDescription(parsed.description);

    const rawFrequency = String(parsed.frequency || "once").toLowerCase();
    const frequency = rawFrequency === "weekly" ? "custom" : rawFrequency;
    const days = frequency === "custom" ? (parsed.days as string[] | undefined) : undefined;

    // 3. Generate TTS
    const ttsText = description || String(parsed.description ?? "");
    const ttsBuffer = await synthesizeReminderTts({
      text: ttsText,
      title: parsed.title as string,
    });

    // 4. Store TTS in Convex
    const blob = new Blob([new Uint8Array(ttsBuffer)], { type: "audio/mpeg" });
    const storageId = await ctx.storage.store(blob);

    // 5. Save to database
    const reminderId: Id<"reminders"> = await ctx.runMutation(
      internal.reminders.create,
      {
        title: parsed.title as string,
        description,
        time: parsed.time as string,
        frequency,
        days,
        audioStorageId: storageId,
        soundRepeatMode: "count",
        soundRepeatCount: 1,
      }
    );

    const audioUrl = await ctx.storage.getUrl(storageId);

    return {
      id: reminderId as string,
      title: parsed.title as string,
      description,
      time: parsed.time as string,
      frequency,
      days,
      transcript,
      audioUrl,
    };
  },
});

export const processTextReminder = action({
  args: {
    title: v.string(),
    description: v.string(),
    time: v.string(),
    frequency: v.string(),
    days: v.optional(v.array(v.string())),
    soundRepeatMode: v.optional(v.string()),
    soundRepeatCount: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const rawFrequency = String(args.frequency || "once").toLowerCase();
    const frequency = rawFrequency === "weekly" ? "custom" : rawFrequency;
    const days = frequency === "custom" ? args.days : undefined;

    const normalizedDescription = normalizeReminderDescription(args.description);
    const ttsText = normalizedDescription || args.description;
    const ttsBuffer = await synthesizeReminderTts({
      text: ttsText,
      title: args.title,
    });
    const blob = new Blob([new Uint8Array(ttsBuffer)], { type: "audio/mpeg" });
    const storageId = await ctx.storage.store(blob);

    const reminderId: Id<"reminders"> = await ctx.runMutation(
      internal.reminders.create,
      {
        title: args.title,
        description: normalizedDescription || args.description,
        time: args.time,
        frequency,
        days,
        audioStorageId: storageId,
        soundRepeatMode: args.soundRepeatMode || "count",
        soundRepeatCount: args.soundRepeatCount ?? 1,
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
      soundRepeatMode: args.soundRepeatMode || "count",
      soundRepeatCount: args.soundRepeatCount ?? 1,
    };
  },
});
