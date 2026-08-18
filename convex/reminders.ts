import { query, mutation, internalMutation, internalQuery } from "./_generated/server";
import { v } from "convex/values";
import { scheduleFields } from "./schema";

/**
 * Replay variants are gone (OLD-108): the nag repeats the base line, so no
 * query resolves variant storage ids into urls any more and no mutation writes
 * them. Rows created before the strip still carry `variants`,
 * `variantAudioStorageIds` and `variantWavStorageIds` — they ride through the
 * `...reminder` spread below untouched, nothing downstream reads them, and
 * `remove` still deletes their blobs so an old reminder cleans up after itself.
 */

/**
 * Device scoping (OLD-74). There are no accounts, so a reminder belongs to the
 * install that created it, named by the `deviceId` the client generates once and
 * persists (lib/deviceId.ts). Every public entry point takes that id and sees
 * only its own rows.
 *
 * Rows written before scoping existed carry no deviceId. They are never
 * enumerated by `list` — an unowned row belongs to nobody — but a caller that
 * already holds the document id may still read, edit or delete one, so installs
 * that predate this keep working and their stored audio still gets cleaned up.
 * `update` stamps the calling device onto such a row, which retires it from the
 * legacy case for good.
 */
function ownsReminder(
  reminder: { deviceId?: string },
  deviceId: string
): boolean {
  return reminder.deviceId === undefined || reminder.deviceId === deviceId;
}

export const list = query({
  args: { deviceId: v.string() },
  handler: async (ctx, args) => {
    const reminders = await ctx.db
      .query("reminders")
      .withIndex("by_device", (q) => q.eq("deviceId", args.deviceId))
      .order("desc")
      .collect();
    return Promise.all(
      reminders.map(async (reminder) => ({
        ...reminder,
        audioUrl: reminder.audioStorageId ? await ctx.storage.getUrl(reminder.audioStorageId) : "",
        wavUrl: reminder.wavStorageId ? await ctx.storage.getUrl(reminder.wavStorageId) : "",
        preAudioUrl: reminder.preAudioStorageId ? await ctx.storage.getUrl(reminder.preAudioStorageId) : "",
      }))
    );
  },
});

export const get = query({
  args: { id: v.id("reminders"), deviceId: v.string() },
  handler: async (ctx, args) => {
    const reminder = await ctx.db.get(args.id);
    if (!reminder || !ownsReminder(reminder, args.deviceId)) return null;
    return {
      ...reminder,
      audioUrl: reminder.audioStorageId ? await ctx.storage.getUrl(reminder.audioStorageId) : "",
      wavUrl: reminder.wavStorageId ? await ctx.storage.getUrl(reminder.wavStorageId) : "",
      preAudioUrl: reminder.preAudioStorageId ? await ctx.storage.getUrl(reminder.preAudioStorageId) : "",
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
    deviceId: v.string(),
    title: v.string(),
    description: v.string(),
    // Every schedule field, grid included (OLD-97) — one list, shared with the
    // table so a new axis cannot land in storage and be dropped on the way in.
    ...scheduleFields,
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
    audioStatus: v.optional(v.union(v.literal("pending"), v.literal("ready"), v.literal("failed"))),
    // "pending" when this reminder asked for a pre-alert line, which lands in a
    // second patch after the base line (OLD-107).
    audioExtrasStatus: v.optional(
      v.union(v.literal("pending"), v.literal("ready"), v.literal("failed"))
    ),
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
  args: { id: v.id("reminders"), deviceId: v.string() },
  handler: async (ctx, args) => {
    const reminder = await ctx.db.get(args.id);
    if (!reminder || !ownsReminder(reminder, args.deviceId)) return;
    if (reminder.audioStorageId) {
      await ctx.storage.delete(reminder.audioStorageId);
    }
    if (reminder.preAudioStorageId) {
      await ctx.storage.delete(reminder.preAudioStorageId);
    }
    if (reminder.wavStorageId) {
      await ctx.storage.delete(reminder.wavStorageId);
    }
    // Deprecated columns (OLD-108). Nothing writes these any more, but rows
    // created before the strip still own the blobs, and dropping the loops
    // would orphan them in storage forever.
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
    deviceId: v.string(),
    title: v.string(),
    description: v.string(),
    // The edit sheet may rewrite any axis of the grid, so the same field list
    // the table holds goes back out through here — an edit that Convex cannot
    // express is an edit the next device sync silently reverts.
    ...scheduleFields,
    preReminderMinutes: v.optional(v.number()),
    persistent: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const { id, deviceId, ...updates } = args;
    const reminder = await ctx.db.get(id);
    if (!reminder || !ownsReminder(reminder, deviceId)) return;
    // Writing deviceId back claims a legacy row for the editing device.
    await ctx.db.patch(id, { ...updates, deviceId });
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

/**
 * Drop an uploaded recording once the parse no longer needs it (OLD-106).
 *
 * processVoiceReminderFast used to delete the blob in a `finally`, which runs
 * before the action's return value reaches the client — so a storage round trip
 * sat between "the reminder row exists" and "the card appears", for work the
 * user has no stake in. It is scheduled instead now. Deleting a blob that is
 * already gone is not an error worth failing a job over, so this swallows.
 */
export const deleteUploadedAudio = internalMutation({
  args: { storageId: v.id("_storage") },
  handler: async (ctx, args) => {
    try {
      await ctx.storage.delete(args.storageId);
    } catch (e) {
      console.error("[VR] Failed to delete uploaded recording:", e);
    }
  },
});

export const setAudio = internalMutation({
  args: {
    id: v.id("reminders"),
    audioStorageId: v.optional(v.id("_storage")),
    wavStorageId: v.optional(v.id("_storage")),
    preAudioStorageId: v.optional(v.id("_storage")),
    audioStatus: v.optional(v.union(v.literal("pending"), v.literal("ready"), v.literal("failed"))),
    // Settled independently of audioStatus (OLD-107): the base line patch flips
    // audioStatus to "ready" and this to "pending", and the pre-alert patch
    // that follows moves only this one. A failed pre-alert phase never
    // un-readies a reminder whose base line is already stored.
    audioExtrasStatus: v.optional(
      v.union(v.literal("pending"), v.literal("ready"), v.literal("failed"))
    ),
    audioError: v.optional(v.string()),
    audioUpdatedAt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const { id, ...updates } = args;
    await ctx.db.patch(id, updates);
  },
});
