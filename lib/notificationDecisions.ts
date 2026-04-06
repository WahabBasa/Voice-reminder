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
