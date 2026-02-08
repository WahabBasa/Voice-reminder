import { query, mutation, internalMutation, internalQuery } from "./_generated/server";
import { v } from "convex/values";

export const list = query({
  args: {},
  handler: async (ctx) => {
    const reminders = await ctx.db.query("reminders").order("desc").collect();
    return Promise.all(
      reminders.map(async (reminder) => ({
        ...reminder,
        audioUrl: reminder.audioStorageId ? await ctx.storage.getUrl(reminder.audioStorageId) : "",
      }))
    );
  },
});

export const get = query({
  args: { id: v.id("reminders") },
  handler: async (ctx, args) => {
    const reminder = await ctx.db.get(args.id);
    if (!reminder) return null;
    return {
      ...reminder,
      audioUrl: reminder.audioStorageId ? await ctx.storage.getUrl(reminder.audioStorageId) : "",
    };
  },
});

export const getInternal = internalQuery({
  args: { id: v.id("reminders") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id);
  },
});

export const create = internalMutation({
  args: {
    title: v.string(),
    description: v.string(),
    time: v.string(),
    date: v.optional(v.string()),
    frequency: v.string(),
    days: v.optional(v.array(v.string())),
    audioStorageId: v.optional(v.id("_storage")),
    audioStatus: v.optional(v.union(v.literal("pending"), v.literal("ready"), v.literal("failed"))),
    audioUpdatedAt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("reminders", {
      ...args,
      createdAt: Date.now(),
    });
  },
});

export const remove = mutation({
  args: { id: v.id("reminders") },
  handler: async (ctx, args) => {
    const reminder = await ctx.db.get(args.id);
    if (!reminder) return;
    if (reminder.audioStorageId) {
      await ctx.storage.delete(reminder.audioStorageId);
    }
    await ctx.db.delete(args.id);
  },
});

export const update = mutation({
  args: {
    id: v.id("reminders"),
    title: v.string(),
    description: v.string(),
    time: v.string(),
    date: v.optional(v.string()),
    frequency: v.string(),
    days: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    const { id, ...updates } = args;
    await ctx.db.patch(id, updates);
  },
});

export const updateAudio = internalMutation({
  args: {
    id: v.id("reminders"),
    oldStorageId: v.id("_storage"),
    newStorageId: v.id("_storage"),
  },
  handler: async (ctx, args) => {
    // Delete old audio file
    await ctx.storage.delete(args.oldStorageId);
    // Update reminder with new audio storage ID
    await ctx.db.patch(args.id, { audioStorageId: args.newStorageId });
  },
});

export const generateAudioUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    const uploadUrl = await ctx.storage.generateUploadUrl();
    return { uploadUrl };
  },
});

export const setAudio = internalMutation({
  args: {
    id: v.id("reminders"),
    audioStorageId: v.optional(v.id("_storage")),
    audioStatus: v.optional(v.union(v.literal("pending"), v.literal("ready"), v.literal("failed"))),
    audioError: v.optional(v.string()),
    audioUpdatedAt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const { id, ...updates } = args;
    await ctx.db.patch(id, updates);
  },
});
