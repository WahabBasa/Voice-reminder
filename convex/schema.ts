import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import type { GridSchedule } from "./scheduleShape";

// Validator half of the days × times grid (OLD-97). The TypeScript half lives in
// ./scheduleShape.ts and is the one definition; `gridScheduleValidator satisfies`
// below is what keeps the two from drifting.
const weekdayValidator = v.union(
  v.literal("sun"), v.literal("mon"), v.literal("tue"), v.literal("wed"),
  v.literal("thu"), v.literal("fri"), v.literal("sat")
);

const daysRuleValidator = v.union(
  v.object({ kind: v.literal("everyday") }),
  v.object({ kind: v.literal("weekdays"), days: v.array(weekdayValidator) }),
  v.object({ kind: v.literal("everyNDays"), interval: v.number(), startDate: v.string() }),
  v.object({ kind: v.literal("date"), date: v.string() })
);

const timesRuleValidator = v.union(
  v.object({ kind: v.literal("clock"), times: v.array(v.string()) }),
  v.object({
    kind: v.literal("interval"),
    everyMinutes: v.number(),
    windowStart: v.string(),
    windowEnd: v.string(),
  })
);

export const gridScheduleValidator = v.object({
  type: v.literal("grid"),
  days: daysRuleValidator,
  times: timesRuleValidator,
  until: v.optional(v.number()),
  tzid: v.optional(v.string()),
});

/**
 * Every schedule field a reminder can carry, shared verbatim by the table and by
 * reminders.create / reminders.update. Before OLD-97 half of these lived only in
 * AsyncStorage, so an edit round-tripped through Convex silently lost them.
 */
export const scheduleFields = {
  time: v.string(),
  date: v.optional(v.string()), // YYYY-MM-DD for one-time reminders on specific days
  frequency: v.string(),
  days: v.optional(v.array(v.string())),
  // The grid itself — authoritative. The four fields above are its legacy
  // projection (see legacyFieldsFromGrid) and are what pre-grid readers use.
  schedule: v.optional(gridScheduleValidator),
  scheduleType: v.optional(
    v.union(v.literal("once"), v.literal("interval"), v.literal("rrule"), v.literal("grid"))
  ),
  onceAt: v.optional(v.number()),
  rrule: v.optional(v.string()),
  dtstart: v.optional(v.number()),
  tzid: v.optional(v.string()),
  until: v.optional(v.number()),
  intervalMs: v.optional(v.number()),
  anchorAt: v.optional(v.number()),
  intervalDays: v.optional(v.number()),
  parseWarnings: v.optional(v.array(v.string())),
};

// Drift guard: the validator and the hand-written type describe the same shape.
export type GridScheduleDoc = typeof gridScheduleValidator.type;
const _gridShapesAgree = (schedule: GridSchedule): GridScheduleDoc => schedule;
void _gridShapesAgree;

export default defineSchema({
  reminders: defineTable({
    // Owning install (OLD-74). There are no accounts, so a reminder belongs to
    // the device that created it. Optional because rows written before scoping
    // existed have none — see convex/reminders.ts for how those are treated.
    deviceId: v.optional(v.string()),
    title: v.string(),
    description: v.string(),
    ...scheduleFields,
    // Card chip emoji picked by the parse (absent → neutral bell chip)
    emoji: v.optional(v.string()),
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
    // Alarm-ready WAVs of the variant lines, index-aligned with `variants`
    // (ladder rung k>=1 rings variant k-1; a missing entry falls back to
    // wavStorageId). Optional and possibly shorter than `variants`.
    variantWavStorageIds: v.optional(v.array(v.id("_storage"))),
    createdAt: v.number(),
    // Audio status for background TTS generation
    audioStatus: v.optional(v.union(v.literal("pending"), v.literal("ready"), v.literal("failed"))),
    audioError: v.optional(v.string()),
    audioUpdatedAt: v.optional(v.number()),
    // Alarm settings (optional for backward compatibility)
    soundRepeatCount: v.optional(v.number()),
    soundRepeatMode: v.optional(v.string()),
  }).index("by_device", ["deviceId"]),
});
