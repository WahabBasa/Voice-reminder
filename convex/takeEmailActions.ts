"use node";

/**
 * Sends the founder's take email (scheduled by convex/founderAlerts.ts
 * `deliverTakeEmail`), after one best-effort pass that adds an "In English:"
 * line under words that weren't English.
 *
 * The translation is one small OpenRouter call per distinct text, the same
 * client as convex/creationJobActions.ts parseTake: a cheap model, no
 * reasoning, 200 tokens, a 5 s timeout, no retries. Any failure (no key, a
 * timeout, a bad answer) just drops that line; the email always goes.
 *
 * `"use node"` for the OpenAI SDK, like every other file that uses it.
 */

import OpenAI from "openai";
import { v } from "convex/values";
import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { addTranslations, buildTakeStoryEmail, type TakeStoryInput } from "./takeStoryEmail";

export const TRANSLATE_MODEL = "openai/gpt-5.6-luna";
export const TRANSLATE_TIMEOUT_MS = 5_000;
const TRANSLATE_MAX_TOKENS = 200;

async function translateToEnglish(text: string): Promise<string | undefined> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) return undefined;
  try {
    const openrouter = new OpenAI({
      apiKey,
      baseURL: "https://openrouter.ai/api/v1",
      timeout: TRANSLATE_TIMEOUT_MS,
      maxRetries: 0,
    });
    const completion = await openrouter.chat.completions.create({
      model: TRANSLATE_MODEL,
      reasoning_effort: "none",
      max_tokens: TRANSLATE_MAX_TOKENS,
      messages: [
        {
          role: "system",
          content:
            "Translate the user's message into natural English. Reply with the translation only: " +
            "no quotes, no notes, no explanations.",
        },
        { role: "user", content: text },
      ],
    });
    return completion.choices[0]?.message?.content ?? undefined;
  } catch (e) {
    console.warn("[VR] takeEmailActions.translateToEnglish: translation skipped:", e);
    return undefined;
  }
}

/** Translate (best-effort), build, and hand the email to founderAlerts.sendEmail. */
export const sendTakeEmail = internalAction({
  // The TakeStoryInput as JSON: its optional fields stay optional, and the
  // shape is owned by ./takeStoryEmail.ts rather than duplicated as a validator.
  args: { story: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    let input: TakeStoryInput;
    try {
      input = JSON.parse(args.story) as TakeStoryInput;
    } catch (e) {
      console.error("[VR] takeEmailActions.sendTakeEmail: unreadable story; no email:", e);
      return null;
    }
    let story = input;
    try {
      story = await addTranslations(input, translateToEnglish);
    } catch (e) {
      console.warn("[VR] takeEmailActions.sendTakeEmail: translations skipped:", e);
    }
    const email = buildTakeStoryEmail(story);
    await ctx.scheduler.runAfter(0, internal.founderAlerts.sendEmail, email);
    return null;
  },
});
