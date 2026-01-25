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
    audioStorageId: v.id("_storage"),
    createdAt: v.number(),
    // Alarm settings (optional for backward compatibility)
    soundRepeatCount: v.optional(v.number()),
    soundRepeatMode: v.optional(v.string()),
  }),
});
