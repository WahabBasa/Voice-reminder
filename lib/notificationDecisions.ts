/**
 * Pure decision logic extracted from lib/notifications.ts.
 *
 * This is a mechanical extraction — the logic is copied verbatim from the
 * runtime branches in notifications.ts, then called from there.
 * No redesign of the notification state machine.
 */

// ─── Group 1: Notification classification and repost detection ──────────────

export function isAlarmOccurrenceNotification(kind: string | undefined): boolean {
  return kind === "reminder_occurrence" || kind === "snooze_occurrence";
}

export function isTriggerNotification(notificationId: string): boolean {
  return (
    typeof notificationId === "string" &&
    (notificationId.startsWith("reminder_") || notificationId.startsWith("snooze_"))
  );
}

export function isOneTimeReminder(
  scheduleType: string | null | undefined,
  legacyFrequency: string
): boolean {
  return scheduleType === "once" || (!scheduleType && legacyFrequency === "once");
}

export function isSnoozeOccurrence(kind: string | undefined): boolean {
  return kind === "snooze_occurrence";
}

export function parseRepostFlag(value: unknown): boolean {
  return value === "1" || value === 1 || value === true;
}

export function isRepostNotification(
  notificationId: string,
  repostFlag: unknown
): boolean {
  return notificationId.startsWith("alarm_display_") || parseRepostFlag(repostFlag);
}

export function shouldHandleAsAlarm(
  reminderId: string | undefined,
  kind: string | undefined
): boolean {
  return Boolean(reminderId) && isAlarmOccurrenceNotification(kind);
}

// ─── Group 2: Duplicate detection and queue decisions ───────────────────────

export function isDuplicateDeliveredEvent(
  existingId: string | undefined,
  currentId: string,
  existingResolved: boolean
): boolean {
  const hasActive = Boolean(existingId) && !existingResolved;
  return hasActive && existingId === currentId;
}

export function isDuplicateOccurrence(
  existingReminderId: string | undefined,
  currentReminderId: string | undefined,
  existingScheduledFor: string | undefined,
  currentScheduledFor: string | undefined
): boolean {
  return (
    existingReminderId === currentReminderId &&
    existingScheduledFor === currentScheduledFor
  );
}

export function shouldQueueInsteadOfActivate(
  hasActiveAlarm: boolean,
  isDuplicate: boolean
): boolean {
  return hasActiveAlarm && !isDuplicate;
}

export function filterDuplicateTriggerIds(
  scheduledIds: string[],
  reminderId: string,
  exceptId?: string
): string[] {
  const prefix = `reminder_${reminderId}_`;
  return scheduledIds.filter((id) => id.startsWith(prefix) && id !== exceptId);
}

// ─── Group 3: Timeout and pending-alarm state ───────────────────────────────

export function getAlarmStartTime(
  ringingAt: number | undefined,
  uiShownAt: number | undefined,
  storedAt: number
): number {
  return ringingAt || uiShownAt || storedAt;
}

export function shouldHandleTimeout(
  elapsedMs: number,
  timeoutMs: number
): boolean {
  return elapsedMs >= timeoutMs;
}

export function hasActivePendingAlarm(
  id: string | undefined,
  resolvedAt: number | undefined
): boolean {
  return Boolean(id) && !resolvedAt;
}

export function parseSnoozeEnabled(value: unknown): boolean {
  return String(value ?? "true") !== "false";
}

export function parseAutoSnoozeCount(value: unknown): number {
  return Math.max(0, Number(value ?? "0") || 0);
}

export function canAutoSnooze(
  snoozeEnabled: boolean,
  autoSnoozeCount: number,
  maxCount: number
): boolean {
  return snoozeEnabled && autoSnoozeCount < maxCount;
}

// ─── Group 4: Past-due handling ─────────────────────────────────────────────

export function adjustPastDueTrigger(
  nextTrigger: number,
  now: number,
  minFutureMs: number = 5000
): number {
  if (nextTrigger <= now) {
    return now + minFutureMs;
  }
  return nextTrigger;
}

export function shouldRecordAsMissedInstead(
  dueTime: number,
  now: number,
  isOneTime: boolean
): boolean {
  return dueTime <= now && isOneTime;
}

// Alarms can be delivered long after their scheduled time (device was off,
// app was force-stopped by OEM battery managers, triggers re-registered on
// app open). Ringing them as if current is wrong — past this threshold the
// occurrence is recorded as missed instead.
export const STALE_DELIVERY_THRESHOLD_MS = 30 * 60_000;

export function isStaleDelivery(
  scheduledFor: number,
  now: number,
  thresholdMs: number = STALE_DELIVERY_THRESHOLD_MS
): boolean {
  if (!Number.isFinite(scheduledFor) || scheduledFor <= 0) return false;
  return now - scheduledFor > thresholdMs;
}

// ─── Group 5: Action recognition ────────────────────────────────────────────

export function isKnownAlarmAction(actionId: string | undefined): boolean {
  return actionId === "dismiss_action" || actionId === "snooze_action";
}

export function isCurrentActiveAlarm(
  pendingId: string | undefined,
  displayedId: string | undefined,
  currentId: string
): boolean {
  return pendingId === currentId || displayedId === currentId;
}

// ─── Group 6: Pre-alerts (soft heads-up before the main occurrence) ─────────
//
// Pre-alerts are deliberately NOT alarm occurrences: they must never enter the
// pending-alarm/repost/timeout lifecycle. isAlarmOccurrenceNotification stays
// false for them; this group only classifies and schedules the heads-up.

export function isPreAlert(kind: string | undefined): boolean {
  return kind === "pre_alert";
}

export function parsePreReminderMinutes(value: unknown): number {
  const minutes = Number(value ?? "0");
  if (!Number.isFinite(minutes) || minutes <= 0) return 0;
  return Math.round(minutes);
}

// A pre-alert landing within this slack of the main alarm is noise, not a
// heads-up — skip scheduling it entirely.
export const PRE_ALERT_MIN_SLACK_MS = 60_000;

export function shouldSchedulePreAlert(
  leadMs: number,
  preReminderMinutes: number,
  slackMs: number = PRE_ALERT_MIN_SLACK_MS
): boolean {
  if (preReminderMinutes <= 0) return false;
  return leadMs > preReminderMinutes * 60_000 + slackMs;
}

export function preAlertTriggerTime(
  mainTriggerTimestamp: number,
  preReminderMinutes: number
): number {
  return mainTriggerTimestamp - preReminderMinutes * 60_000;
}

export function filterPreAlertTriggerIds(
  scheduledIds: string[],
  reminderId: string,
  exceptId?: string
): string[] {
  const prefix = `prealert_${reminderId}_`;
  return scheduledIds.filter((id) => id.startsWith(prefix) && id !== exceptId);
}

export function buildPreAlertBody(
  title: string | undefined,
  preReminderMinutes: number
): string {
  const subject = (title ?? "").trim() || "your reminder";
  const unit = preReminderMinutes === 1 ? "minute" : "minutes";
  return `Heads up — ${subject} in ${preReminderMinutes} ${unit}`;
}

// ─── Group 7: Assistant-style replays (escalation ladder + ring cadence) ────
//
// An ignored occurrence comes back as a follow-up occurrence (kind
// "snooze_occurrence" with a followUpCount) carrying the NEXT variant line.
// Non-persistent reminders stop after MAX_FOLLOW_UPS follow-ups and are
// recorded missed; persistent reminders keep going until "Done".

export type UrgencyTier = "urgent" | "notice" | "routine";

export type RingCadenceMode = "alternate" | "speak_twice" | "loop";

// Mirrors MAX_REPLAY_VARIANTS in convex/helpers.ts (client copy — lib code
// must not import convex modules).
export const MAX_REPLAY_VARIANTS = 3;

// Non-persistent reminders get exactly this many follow-ups, then missed.
export const MAX_FOLLOW_UPS = 2;

export const FOLLOW_UP_DELAY_MINUTES = 5;

// Persistent politeness: after this many follow-ups the interval grows...
export const FOLLOW_UP_POLITE_AFTER = 3;
// ...to this cap (and stays there).
export const FOLLOW_UP_POLITE_DELAY_MINUTES = 10;

// Gap between the two routine-tier utterances (speak twice, then go silent).
export const ROUTINE_SECOND_UTTERANCE_GAP_MS = 20_000;

// Gap between alternated lines while an urgent-tier alarm rings continuously.
export const ALTERNATE_LINE_GAP_MS = 1_500;

export function parsePersistentFlag(value: unknown): boolean {
  if (value === true) return true;
  const token = String(value ?? "").toLowerCase().trim();
  return token === "true" || token === "1";
}

export function parseFollowUpCount(value: unknown): number {
  return Math.max(0, Number(value ?? "0") || 0);
}

export function parseVariantCount(value: unknown): number {
  const count = Number(value ?? "0");
  if (!Number.isFinite(count) || count <= 0) return 0;
  return Math.min(MAX_REPLAY_VARIANTS, Math.floor(count));
}

export function normalizeUrgencyTier(value: unknown): UrgencyTier {
  const token = String(value ?? "").toLowerCase().trim();
  if (token === "urgent" || token === "routine") return token;
  // Unknown/absent (incl. legacy reminders) behaves like today: continuous ring.
  return "notice";
}

export function shouldContinueFollowUps(
  persistent: boolean,
  followUpCount: number,
  maxFollowUps: number = MAX_FOLLOW_UPS
): boolean {
  if (persistent) return true;
  return followUpCount < maxFollowUps;
}

export function followUpDelayMinutes(followUpNumber: number): number {
  return followUpNumber > FOLLOW_UP_POLITE_AFTER
    ? FOLLOW_UP_POLITE_DELAY_MINUTES
    : FOLLOW_UP_DELAY_MINUTES;
}

/**
 * Variant index (into the variants array) spoken by follow-up number
 * `followUpNumber` (1-based). -1 means "use the base description".
 *
 * Ladder: walk the variants in order (they escalate in firmness), then cycle
 * the firmest two so no line ever repeats back-to-back verbatim. With a single
 * variant, alternate it with the base line for the same reason.
 */
export function followUpVariantIndex(
  followUpNumber: number,
  variantCount: number
): number {
  if (variantCount <= 0) return -1;
  if (followUpNumber <= variantCount) return followUpNumber - 1;
  if (variantCount === 1) {
    return followUpNumber % 2 === 1 ? 0 : -1;
  }
  return (followUpNumber - variantCount) % 2 === 1
    ? variantCount - 2
    : variantCount - 1;
}

/** Parse the JSON-encoded variants array carried in notification data. */
export function parseVariantList(value: unknown): string[] {
  if (typeof value !== "string" || !value) return [];
  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((item) => String(item ?? "").trim())
      .filter((item) => item.length > 0);
  } catch {
    return [];
  }
}

export function variantLineForIndex(
  variants: string[],
  index: number,
  baseDescription: string
): string {
  if (Number.isFinite(index) && index >= 0 && index < variants.length && variants[index]) {
    return variants[index];
  }
  return baseDescription;
}

/**
 * Ring cadence while the alarm UI is alive.
 * - urgent: alternate the available spoken lines continuously (needs one-shot
 *   native playback and at least two local files, else loop one file).
 * - routine: speak twice (~20s gap) then go silent (needs one-shot playback,
 *   else loop as today).
 * - notice/legacy: continuous loop, exactly today's behavior.
 */
export function ringCadenceMode(
  urgency: unknown,
  playableFileCount: number,
  supportsOneShotPlayback: boolean
): RingCadenceMode {
  const tier = normalizeUrgencyTier(urgency);
  if (tier === "urgent") {
    return supportsOneShotPlayback && playableFileCount >= 2 ? "alternate" : "loop";
  }
  if (tier === "routine") {
    return supportsOneShotPlayback && playableFileCount >= 1 ? "speak_twice" : "loop";
  }
  return "loop";
}

export function nextAlternateIndex(currentIndex: number, playlistLength: number): number {
  if (playlistLength <= 0) return 0;
  return (currentIndex + 1) % playlistLength;
}

// ─── Group 8: Cadence ladder (iOS AlarmKit sibling alarms) ──────────────────
//
// AlarmKit cannot ring once, and cannot pause between rings inside a single
// alarm. So one occurrence becomes 1–3 real alarms staggered minutes apart,
// each speaking a differently-worded line — perceived as one assistant coming
// back rather than one alarm looping forever.
//
// Rung count mirrors `variantCountForTier` in convex/helpers.ts (client copy —
// lib code must not import convex modules). The offsets below are the single
// source of truth for rung timing; they get re-tuned after the device test
// that measures how long iOS rings an unattended alarm. No magic numbers
// anywhere else.

export const MAX_LADDER_RUNGS = MAX_REPLAY_VARIANTS;

/** Rung offsets from the occurrence's fire time T — routine/notice/urgent. */
export const LADDER_OFFSETS_MS = [0, 3 * 60_000, 7 * 60_000];

/** Persistent reminders come back sooner and keep the same rung count. */
export const LADDER_OFFSETS_PERSISTENT_MS = [0, 2 * 60_000, 5 * 60_000];

/** Alarms per occurrence for this tier (mirrors variantCountForTier exactly). */
export function ladderRungCount(urgency: unknown, persistent: unknown): number {
  if (parsePersistentFlag(persistent)) return MAX_LADDER_RUNGS;
  const tier = normalizeUrgencyTier(urgency);
  if (tier === "urgent") return MAX_LADDER_RUNGS;
  if (tier === "routine") return 1;
  return 2;
}

/** Offsets from T for this tier's rungs, in rung order. */
export function ladderOffsetsMs(urgency: unknown, persistent: unknown): number[] {
  const table = parsePersistentFlag(persistent)
    ? LADDER_OFFSETS_PERSISTENT_MS
    : LADDER_OFFSETS_MS;
  return table.slice(0, ladderRungCount(urgency, persistent));
}

/** Absolute fire times of every rung of the occurrence firing at `baseTimestamp`. */
export function ladderRungTimes(
  baseTimestamp: number,
  urgency: unknown,
  persistent: unknown
): number[] {
  return ladderOffsetsMs(urgency, persistent).map((offset) => baseTimestamp + offset);
}

/**
 * Variant index (into `variants`) spoken by rung k. -1 means the base line.
 * PRD: rung 0 speaks the base description, rung k >= 1 speaks variant k-1.
 */
export function ladderVariantIndex(rung: number): number {
  return rung <= 0 ? -1 : rung - 1;
}
