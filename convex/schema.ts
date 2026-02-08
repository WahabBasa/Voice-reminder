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
