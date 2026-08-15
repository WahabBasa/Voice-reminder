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

/**
 * The reminder's trigger ids that are NOT wanted any more.
 *
 * `exceptId` takes a list since OLD-98: a reminder can hold several pending
 * occurrences at once (08:00 and 21:00 of the same day), so "keep this one,
 * drop the rest" became "keep this SET, drop the rest".
 */
export function filterDuplicateTriggerIds(
  scheduledIds: string[],
  reminderId: string,
  exceptId?: string | string[]
): string[] {
  const prefix = `reminder_${reminderId}_`;
  const keep = new Set(
    exceptId === undefined ? [] : Array.isArray(exceptId) ? exceptId : [exceptId]
  );
  return scheduledIds.filter((id) => id.startsWith(prefix) && !keep.has(id));
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

export function parseAutoSnoozeCount(value: unknown): number {
  return Math.max(0, Number(value ?? "0") || 0);
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
  // No lead-in. The voice rewrite (OLD-95) banned "Heads up" from spoken lines;
  // visible notification copy follows the same rule — say the thing, nothing else.
  return `${subject} in ${preReminderMinutes} ${unit}`;
}

// ─── Group 7: Ring cadence (how the spoken lines play while ringing) ───────
//
// This is what an alarm does WHILE it rings — one utterance, two, or a loop.
// What happens after it is answered or ignored is the nag in group 8.

export type UrgencyTier = "urgent" | "notice" | "routine";

export type RingCadenceMode = "alternate" | "speak_twice" | "loop";

// Mirrors MAX_REPLAY_VARIANTS in convex/helpers.ts (client copy — lib code
// must not import convex modules).
export const MAX_REPLAY_VARIANTS = 3;

// Gap between the two routine-tier utterances (speak twice, then go silent).
export const ROUTINE_SECOND_UTTERANCE_GAP_MS = 20_000;

// Gap between alternated lines while an urgent-tier alarm rings continuously.
export const ALTERNATE_LINE_GAP_MS = 1_500;

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

// ─── Group 8: The snooze-nag (OLD-96) ───────────────────────────────────────
//
// One ring per occurrence, then a fixed nag. A ring the user dismisses — or
// never answers — comes back with the SAME audio NAG_DELAY_MINUTES later, at
// most MAX_NAG_COMEBACKS times, then goes quiet. "Done" ends the chain and
// resets the counter.
//
// Deliberately fixed: no per-reminder tuning, no settings screen, no escalating
// re-worded lines. This is the whole escalation policy — it replaces the
// tier-dependent sibling ladder and the persistent-follow-up counters, which
// were the wrong voice for the product.

/** Minutes between a ring going unanswered and its comeback. */
export const NAG_DELAY_MINUTES = 5;

/** Comebacks a single ring gets before the chain goes quiet. */
export const MAX_NAG_COMEBACKS = 3;

/** Comebacks already delivered for this ring (notification data / alarm state). */
export function parseNagCount(value: unknown): number {
  return Math.max(0, Number(value ?? "0") || 0);
}

/** Whether comeback number `nagCount + 1` is still owed. */
export function shouldNagAgain(
  nagCount: number,
  maxComebacks: number = MAX_NAG_COMEBACKS
): boolean {
  return nagCount < maxComebacks;
}

// ─── Group 8b: the chain as a schedule, not a reaction ──────────────────────
//
// On iOS the comebacks CANNOT be scheduled when a ring goes unanswered: no app
// code runs at that moment (docs/alarmkit-focus-breakthrough.md §7 — "unattended
// timeout → comeback: must be pre-scheduled, not reactive"). A nag that is only
// armed from the next foreground silently does nothing on a locked phone.
//
// So the whole chain is derived from the occurrence time up front and registered
// as sibling alarms, then cancelled when the user finally answers. That only
// works because the chain is deterministic: origin + 5/10/15 minutes, always,
// recomputable from the occurrence timestamp alone with no stored counter.

/**
 * Absolute fire times of the comebacks a ring at `occurrenceAt` is owed.
 * `[T+5m, T+10m, T+15m]` — the occurrence itself is not in the list.
 */
export function planNagChain(
  occurrenceAt: number,
  maxComebacks: number = MAX_NAG_COMEBACKS,
  delayMinutes: number = NAG_DELAY_MINUTES
): number[] {
  if (!Number.isFinite(occurrenceAt)) return [];
  const step = Math.max(1, Math.round(delayMinutes)) * 60_000;
  const count = Math.max(0, Math.floor(maxComebacks));
  return Array.from({ length: count }, (_, index) => occurrenceAt + (index + 1) * step);
}

/**
 * The links of that chain that have not happened yet.
 *
 * This is the one question both the scheduler and the reconciler ask: at
 * registration time it says what to arm, and after a ring went unanswered it
 * says whether anything is still owed (something armed → leave it alone;
 * nothing owed → the chain is spent, record the miss).
 */
export function remainingNagComebacks(
  occurrenceAt: number,
  now: number,
  maxComebacks: number = MAX_NAG_COMEBACKS,
  delayMinutes: number = NAG_DELAY_MINUTES
): number[] {
  return planNagChain(occurrenceAt, maxComebacks, delayMinutes).filter((ts) => ts > now);
}

/**
 * Which link of the chain a ring at `fireAt` is: 0 = the occurrence itself,
 * 1..maxComebacks = comebacks. Clamped at both ends so a few seconds of clock
 * drift cannot push a ring off its own chain.
 */
export function nagIndexForFireTime(
  originAt: number,
  fireAt: number,
  maxComebacks: number = MAX_NAG_COMEBACKS,
  delayMinutes: number = NAG_DELAY_MINUTES
): number {
  if (!Number.isFinite(originAt) || !Number.isFinite(fireAt)) return 0;
  const step = Math.max(1, Math.round(delayMinutes)) * 60_000;
  const index = Math.round((fireAt - originAt) / step);
  if (!Number.isFinite(index) || index <= 0) return 0;
  return Math.min(index, Math.max(0, Math.floor(maxComebacks)));
}
