import { query, mutation, internalMutation, internalQuery } from "./_generated/server";
import { v } from "convex/values";

async function resolveVariantAudioUrls(
  ctx: { storage: { getUrl: (id: any) => Promise<string | null> } },
  variantAudioStorageIds: any[] | undefined
): Promise<string[]> {
  if (!variantAudioStorageIds?.length) return [];
  const urls = await Promise.all(
    variantAudioStorageIds.map((id) => ctx.storage.getUrl(id))
  );
  return urls.filter((url): url is string => Boolean(url));
}

// Ladder rungs address variant wavs by index, so this list keeps its holes:
// a null means "no wav for that variant" and the rung falls back to wavUrl.
async function resolveVariantWavUrls(
  ctx: { storage: { getUrl: (id: any) => Promise<string | null> } },
  variantWavStorageIds: any[] | undefined
): Promise<(string | null)[]> {
  if (!variantWavStorageIds?.length) return [];
  return await Promise.all(
    variantWavStorageIds.map((id) => ctx.storage.getUrl(id))
  );
}

export const list = query({
  args: {},
  handler: async (ctx) => {
    const reminders = await ctx.db.query("reminders").order("desc").collect();
    return Promise.all(
      reminders.map(async (reminder) => ({
        ...reminder,
        audioUrl: reminder.audioStorageId ? await ctx.storage.getUrl(reminder.audioStorageId) : "",
        wavUrl: reminder.wavStorageId ? await ctx.storage.getUrl(reminder.wavStorageId) : "",
        preAudioUrl: reminder.preAudioStorageId ? await ctx.storage.getUrl(reminder.preAudioStorageId) : "",
        variantAudioUrls: await resolveVariantAudioUrls(ctx, reminder.variantAudioStorageIds),
        variantWavUrls: await resolveVariantWavUrls(ctx, reminder.variantWavStorageIds),
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
      wavUrl: reminder.wavStorageId ? await ctx.storage.getUrl(reminder.wavStorageId) : "",
      preAudioUrl: reminder.preAudioStorageId ? await ctx.storage.getUrl(reminder.preAudioStorageId) : "",
      variantAudioUrls: await resolveVariantAudioUrls(ctx, reminder.variantAudioStorageIds),
      variantWavUrls: await resolveVariantWavUrls(ctx, reminder.variantWavStorageIds),
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
    // Card chip emoji picked by the parse (absent → neutral bell chip)
    emoji: v.optional(v.string()),
    audioStorageId: v.optional(v.id("_storage")),
    wavStorageId: v.optional(v.id("_storage")),
    preReminderMinutes: v.optional(v.number()),
    preAudioStorageId: v.optional(v.id("_storage")),
    urgency: v.optional(
      v.union(v.literal("urgent"), v.literal("notice"), v.literal("routine"))
    ),
    persistent: v.optional(v.boolean()),
    variants: v.optional(v.array(v.string())),
    variantAudioStorageIds: v.optional(v.array(v.id("_storage"))),
    variantWavStorageIds: v.optional(v.array(v.id("_storage"))),
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
    if (reminder.preAudioStorageId) {
      await ctx.storage.delete(reminder.preAudioStorageId);
    }
    if (reminder.wavStorageId) {
      await ctx.storage.delete(reminder.wavStorageId);
    }
    for (const variantId of reminder.variantAudioStorageIds ?? []) {
      await ctx.storage.delete(variantId);
    }
    for (const variantWavId of reminder.variantWavStorageIds ?? []) {
      await ctx.storage.delete(variantWavId);
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
    preReminderMinutes: v.optional(v.number()),
    persistent: v.optional(v.boolean()),
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
    oldWavStorageId: v.optional(v.id("_storage")),
    newWavStorageId: v.optional(v.id("_storage")),
  },
  handler: async (ctx, args) => {
    // Delete old audio files
    await ctx.storage.delete(args.oldStorageId);
    if (args.oldWavStorageId) {
      await ctx.storage.delete(args.oldWavStorageId);
    }
    // An absent new wav clears the field so a stale alarm sound is never referenced.
    await ctx.db.patch(args.id, {
      audioStorageId: args.newStorageId,
      wavStorageId: args.newWavStorageId,
    });
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
    wavStorageId: v.optional(v.id("_storage")),
    preAudioStorageId: v.optional(v.id("_storage")),
    // Replay variants kept in lockstep: only lines whose TTS succeeded are
    // stored, so variants[i] always pairs with variantAudioStorageIds[i].
    variants: v.optional(v.array(v.string())),
    variantAudioStorageIds: v.optional(v.array(v.id("_storage"))),
    // Prefix of variantAudioStorageIds whose alarm wav also synthesized.
    variantWavStorageIds: v.optional(v.array(v.id("_storage"))),
    audioStatus: v.optional(v.union(v.literal("pending"), v.literal("ready"), v.literal("failed"))),
    audioError: v.optional(v.string()),
    audioUpdatedAt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const { id, ...updates } = args;
    await ctx.db.patch(id, updates);
  },
});
