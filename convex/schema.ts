import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  reminders: defineTable({
    title: v.string(),
    description: v.string(),
    time: v.string(),
    date: v.optional(v.string()), // YYYY-MM-DD for one-time reminders on specific days
    frequency: v.string(),
    days: v.optional(v.array(v.string())),
    audioStorageId: v.optional(v.id("_storage")),
    // Alarm-ready WAV of the base spoken line (iOS AlarmKit custom sound)
    wavStorageId: v.optional(v.id("_storage")),
    // Smart pre-reminder (heads-up before the event); 0/absent = none
    preReminderMinutes: v.optional(v.number()),
    preAudioStorageId: v.optional(v.id("_storage")),
    // Assistant-style replays (OLD-53): hook tier of the description,
    // "keep reminding until Done" flag, and escalating alternative spoken
    // lines with their TTS audios (parallel arrays).
    urgency: v.optional(
      v.union(v.literal("urgent"), v.literal("notice"), v.literal("routine"))
    ),
    persistent: v.optional(v.boolean()),
    variants: v.optional(v.array(v.string())),
    variantAudioStorageIds: v.optional(v.array(v.id("_storage"))),
    createdAt: v.number(),
    // Audio status for background TTS generation
    audioStatus: v.optional(v.union(v.literal("pending"), v.literal("ready"), v.literal("failed"))),
    audioError: v.optional(v.string()),
    audioUpdatedAt: v.optional(v.number()),
    // Alarm settings (optional for backward compatibility)
    soundRepeatCount: v.optional(v.number()),
    soundRepeatMode: v.optional(v.string()),
  }),
});
