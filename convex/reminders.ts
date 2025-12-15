import { query, mutation, internalMutation } from "./_generated/server";
import { v } from "convex/values";

export const list = query({
  args: {},
  handler: async (ctx) => {
    const reminders = await ctx.db.query("reminders").order("desc").collect();
    return Promise.all(
      reminders.map(async (reminder) => ({
        ...reminder,
        audioUrl: await ctx.storage.getUrl(reminder.audioStorageId),
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
      audioUrl: await ctx.storage.getUrl(reminder.audioStorageId),
    };
  },
});

export const create = internalMutation({
  args: {
    title: v.string(),
    description: v.string(),
    time: v.string(),
    frequency: v.string(),
    days: v.optional(v.array(v.string())),
    audioStorageId: v.id("_storage"),
    soundRepeatMode: v.optional(v.string()),
    soundRepeatCount: v.optional(v.number()),
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
    await ctx.storage.delete(reminder.audioStorageId);
    await ctx.db.delete(args.id);
  },
});

export const update = mutation({
  args: {
    id: v.id("reminders"),
    title: v.string(),
    description: v.string(),
    time: v.string(),
    frequency: v.string(),
    days: v.optional(v.array(v.string())),
    soundRepeatMode: v.optional(v.string()),
    soundRepeatCount: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const { id, ...updates } = args;
    await ctx.db.patch(id, updates);
  },
});
