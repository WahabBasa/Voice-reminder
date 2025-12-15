import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  reminders: defineTable({
    title: v.string(),
    description: v.string(),
    time: v.string(),
    frequency: v.string(),
    days: v.optional(v.array(v.string())),
    audioStorageId: v.id("_storage"),
    createdAt: v.number(),
    soundRepeatMode: v.optional(v.string()),
    soundRepeatCount: v.optional(v.number()),
  }),
});
