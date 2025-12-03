"use node";

import { action } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import { Id } from "./_generated/dataModel";
import OpenAI from "openai";

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
  "frequency": "once" | "daily" | "weekly",
  "days": ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] (only if frequency is weekly)
}

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

    // 3. Generate TTS
    const ttsResponse = await openai.audio.speech.create({
      model: "tts-1",
      voice: "nova",
      input: parsed.description,
      response_format: "mp3",
    });

    const ttsBuffer = Buffer.from(await ttsResponse.arrayBuffer());

    // 4. Store TTS in Convex
    const blob = new Blob([ttsBuffer], { type: "audio/mpeg" });
    const storageId = await ctx.storage.store(blob);

    // 5. Save to database
    const reminderId: Id<"reminders"> = await ctx.runMutation(
      internal.reminders.create,
      {
        title: parsed.title as string,
        description: parsed.description as string,
        time: parsed.time as string,
        frequency: parsed.frequency as string,
        days: parsed.days as string[] | undefined,
        audioStorageId: storageId,
      }
    );

    const audioUrl = await ctx.storage.getUrl(storageId);

    return {
      id: reminderId as string,
      title: parsed.title as string,
      description: parsed.description as string,
      time: parsed.time as string,
      frequency: parsed.frequency as string,
      days: parsed.days as string[] | undefined,
      transcript,
      audioUrl,
    };
  },
});
