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

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
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

export const processVoiceReminder = action({
  args: { audioBase64: v.string() },
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

    const rawFrequency = String(parsed.frequency || "once").toLowerCase();
    const frequency = rawFrequency === "weekly" ? "custom" : rawFrequency;
    const days = frequency === "custom" ? (parsed.days as string[] | undefined) : undefined;

    // 3. Generate TTS
    const ttsText = `Hey! ${parsed.description}`;
    const ttsBuffer = await synthesizeWithResemble({
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
        description: parsed.description as string,
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
      description: parsed.description as string,
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

    const ttsText = `Hey! ${args.description}`;
    const ttsBuffer = await synthesizeWithResemble({
      text: ttsText,
      title: args.title,
    });
    const blob = new Blob([new Uint8Array(ttsBuffer)], { type: "audio/mpeg" });
    const storageId = await ctx.storage.store(blob);

    const reminderId: Id<"reminders"> = await ctx.runMutation(
      internal.reminders.create,
      {
        title: args.title,
        description: args.description,
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
