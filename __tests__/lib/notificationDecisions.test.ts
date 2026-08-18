import {
  isAlarmOccurrenceNotification,
  isTriggerNotification,
  isOneTimeReminder,
  isSnoozeOccurrence,
  parseRepostFlag,
  isRepostNotification,
  shouldHandleAsAlarm,
  isDuplicateDeliveredEvent,
  isDuplicateOccurrence,
  shouldQueueInsteadOfActivate,
  filterDuplicateTriggerIds,
  getAlarmStartTime,
  shouldHandleTimeout,
  hasActivePendingAlarm,
  parseAutoSnoozeCount,
  adjustPastDueTrigger,
  shouldRecordAsMissedInstead,
  isStaleDelivery,
  STALE_DELIVERY_THRESHOLD_MS,
  isKnownAlarmAction,
  isCurrentActiveAlarm,
  isPreAlert,
  parsePreReminderMinutes,
  shouldSchedulePreAlert,
  preAlertTriggerTime,
  filterPreAlertTriggerIds,
  buildPreAlertBody,
  PRE_ALERT_MIN_SLACK_MS,
  normalizeUrgencyTier,
  ringCadenceMode,
  parseNagCount,
  shouldNagAgain,
  planNagChain,
  remainingNagComebacks,
  nagIndexForFireTime,
  NAG_DELAY_MINUTES,
  MAX_NAG_COMEBACKS,
} from "../../lib/notificationDecisions";

// ─── Group 1: Notification classification and repost detection ──────────────

describe("isAlarmOccurrenceNotification", () => {
  it("returns true for reminder_occurrence", () => {
    expect(isAlarmOccurrenceNotification("reminder_occurrence")).toBe(true);
  });

  it("returns true for snooze_occurrence", () => {
    expect(isAlarmOccurrenceNotification("snooze_occurrence")).toBe(true);
  });

  it("returns false for undefined", () => {
    expect(isAlarmOccurrenceNotification(undefined)).toBe(false);
  });

  it("returns false for other string", () => {
    expect(isAlarmOccurrenceNotification("test_notification")).toBe(false);
  });
});

describe("isTriggerNotification", () => {
  it("returns true for reminder_ prefix", () => {
    expect(isTriggerNotification("reminder_abc_123456")).toBe(true);
  });

  it("returns true for snooze_ prefix", () => {
    expect(isTriggerNotification("snooze_abc_789")).toBe(true);
  });

  it("returns false for alarm_display_ prefix", () => {
    expect(isTriggerNotification("alarm_display_abc")).toBe(false);
  });

  it("returns false for random string", () => {
    expect(isTriggerNotification("random_notification")).toBe(false);
  });
});

describe("isOneTimeReminder", () => {
  it("returns true when scheduleType is once", () => {
    expect(isOneTimeReminder("once", "daily")).toBe(true);
  });

  it("returns true when no scheduleType and legacy frequency is once", () => {
    expect(isOneTimeReminder(null, "once")).toBe(true);
  });

  it("returns false when no scheduleType and legacy frequency is daily", () => {
    expect(isOneTimeReminder(null, "daily")).toBe(false);
  });

  it("returns false for interval scheduleType", () => {
    expect(isOneTimeReminder("interval", "once")).toBe(false);
  });

  it("returns false for rrule scheduleType", () => {
    expect(isOneTimeReminder("rrule", "once")).toBe(false);
  });
});

describe("isSnoozeOccurrence", () => {
  it("returns true for snooze_occurrence", () => {
    expect(isSnoozeOccurrence("snooze_occurrence")).toBe(true);
  });

  it("returns false for reminder_occurrence", () => {
    expect(isSnoozeOccurrence("reminder_occurrence")).toBe(false);
  });
});

describe("parseRepostFlag", () => {
  it('returns true for "1"', () => {
    expect(parseRepostFlag("1")).toBe(true);
  });

  it("returns true for 1 (number)", () => {
    expect(parseRepostFlag(1)).toBe(true);
  });

  it("returns true for true (boolean)", () => {
    expect(parseRepostFlag(true)).toBe(true);
  });

  it('returns false for "0"', () => {
    expect(parseRepostFlag("0")).toBe(false);
  });

  it("returns false for undefined", () => {
    expect(parseRepostFlag(undefined)).toBe(false);
  });

  it("returns false for false", () => {
    expect(parseRepostFlag(false)).toBe(false);
  });
});

describe("isRepostNotification", () => {
  it("returns true for alarm_display_ prefix", () => {
    expect(isRepostNotification("alarm_display_abc", undefined)).toBe(true);
  });

  it("returns true when repost flag is truthy", () => {
    expect(isRepostNotification("reminder_abc_123", "1")).toBe(true);
  });

  it("returns false for trigger notification with no repost flag", () => {
    expect(isRepostNotification("reminder_abc_123", undefined)).toBe(false);
  });
});

describe("shouldHandleAsAlarm", () => {
  it("returns true when reminderId exists and kind is alarm occurrence", () => {
    expect(shouldHandleAsAlarm("rem_abc", "reminder_occurrence")).toBe(true);
  });

  it("returns false when reminderId is undefined", () => {
    expect(shouldHandleAsAlarm(undefined, "reminder_occurrence")).toBe(false);
  });

  it("returns false when kind is not alarm occurrence", () => {
    expect(shouldHandleAsAlarm("rem_abc", "test")).toBe(false);
  });
});

// ─── Group 2: Duplicate detection and queue decisions ───────────────────────

describe("isDuplicateDeliveredEvent", () => {
  it("returns true for same ID, not resolved", () => {
    expect(isDuplicateDeliveredEvent("notif_1", "notif_1", false)).toBe(true);
  });

  it("returns false for same ID, already resolved", () => {
    expect(isDuplicateDeliveredEvent("notif_1", "notif_1", true)).toBe(false);
  });

  it("returns false for different IDs", () => {
    expect(isDuplicateDeliveredEvent("notif_1", "notif_2", false)).toBe(false);
  });

  it("returns false when existing ID is undefined", () => {
    expect(isDuplicateDeliveredEvent(undefined, "notif_1", false)).toBe(false);
  });
});

describe("isDuplicateOccurrence", () => {
  it("returns true for same reminder and same scheduledFor", () => {
    expect(isDuplicateOccurrence("rem1", "rem1", "100", "100")).toBe(true);
  });

  it("returns false for same reminder but different scheduledFor", () => {
    expect(isDuplicateOccurrence("rem1", "rem1", "100", "200")).toBe(false);
  });

  it("returns false for different reminders", () => {
    expect(isDuplicateOccurrence("rem1", "rem2", "100", "100")).toBe(false);
  });
});

describe("shouldQueueInsteadOfActivate", () => {
  it("returns true when active alarm exists and not a duplicate", () => {
    expect(shouldQueueInsteadOfActivate(true, false)).toBe(true);
  });

  it("returns false when no active alarm", () => {
    expect(shouldQueueInsteadOfActivate(false, false)).toBe(false);
  });

  it("returns false when it is a duplicate", () => {
    expect(shouldQueueInsteadOfActivate(true, true)).toBe(false);
  });
});

describe("filterDuplicateTriggerIds", () => {
  it("finds matching prefixes", () => {
    const ids = ["reminder_abc_1", "reminder_abc_2", "reminder_xyz_1"];
    expect(filterDuplicateTriggerIds(ids, "abc")).toEqual([
      "reminder_abc_1",
      "reminder_abc_2",
    ]);
  });

  it("excludes exceptId", () => {
    const ids = ["reminder_abc_1", "reminder_abc_2"];
    expect(filterDuplicateTriggerIds(ids, "abc", "reminder_abc_1")).toEqual([
      "reminder_abc_2",
    ]);
  });

  it("keeps every id in an exceptId list (OLD-98 multi-occurrence)", () => {
    const ids = ["reminder_abc_1", "reminder_abc_2", "reminder_abc_3"];
    expect(
      filterDuplicateTriggerIds(ids, "abc", ["reminder_abc_1", "reminder_abc_3"])
    ).toEqual(["reminder_abc_2"]);
  });

  it("drops everything when the exceptId list is empty", () => {
    const ids = ["reminder_abc_1", "reminder_abc_2"];
    expect(filterDuplicateTriggerIds(ids, "abc", [])).toEqual(ids);
  });

  it("returns empty array when no matches", () => {
    expect(filterDuplicateTriggerIds(["reminder_xyz_1"], "abc")).toEqual([]);
  });

  it("handles empty input array", () => {
    expect(filterDuplicateTriggerIds([], "abc")).toEqual([]);
  });
});

// ─── Group 3: Timeout and pending-alarm state ───────────────────────────────

describe("getAlarmStartTime", () => {
  it("returns ringingAt when all timestamps present", () => {
    expect(getAlarmStartTime(100, 200, 300)).toBe(100);
  });

  it("returns uiShownAt when ringingAt is undefined", () => {
    expect(getAlarmStartTime(undefined, 200, 300)).toBe(200);
  });

  it("returns storedAt when only it is defined", () => {
    expect(getAlarmStartTime(undefined, undefined, 300)).toBe(300);
  });
});

describe("shouldHandleTimeout", () => {
  it("returns false when under timeout", () => {
    expect(shouldHandleTimeout(170000, 180000)).toBe(false);
  });

  it("returns true when at timeout", () => {
    expect(shouldHandleTimeout(180000, 180000)).toBe(true);
  });

  it("returns true when over timeout", () => {
    expect(shouldHandleTimeout(200000, 180000)).toBe(true);
  });
});

describe("hasActivePendingAlarm", () => {
  it("returns true when id exists and not resolved", () => {
    expect(hasActivePendingAlarm("abc", undefined)).toBe(true);
  });

  it("returns false when id exists but resolved", () => {
    expect(hasActivePendingAlarm("abc", 12345)).toBe(false);
  });

  it("returns false when id is undefined", () => {
    expect(hasActivePendingAlarm(undefined, undefined)).toBe(false);
  });
});

describe("parseAutoSnoozeCount", () => {
  it("parses valid number", () => {
    expect(parseAutoSnoozeCount("2")).toBe(2);
  });

  it("returns 0 for undefined", () => {
    expect(parseAutoSnoozeCount(undefined)).toBe(0);
  });

  it("clamps negative to 0", () => {
    expect(parseAutoSnoozeCount("-5")).toBe(0);
  });

  it("returns 0 for NaN string", () => {
    expect(parseAutoSnoozeCount("abc")).toBe(0);
  });
});

// ─── Group 4: Past-due handling ─────────────────────────────────────────────

describe("adjustPastDueTrigger", () => {
  it("returns trigger unchanged when in the future", () => {
    expect(adjustPastDueTrigger(2000, 1000)).toBe(2000);
  });

  it("shifts past trigger to now + 5s", () => {
    expect(adjustPastDueTrigger(500, 1000)).toBe(6000);
  });

  it("shifts trigger that equals now to now + 5s", () => {
    expect(adjustPastDueTrigger(1000, 1000)).toBe(6000);
  });

  it("respects custom minFutureMs", () => {
    expect(adjustPastDueTrigger(500, 1000, 10000)).toBe(11000);
  });
});

describe("shouldRecordAsMissedInstead", () => {
  it("returns true for past one-time reminder", () => {
    expect(shouldRecordAsMissedInstead(500, 1000, true)).toBe(true);
  });

  it("returns false for past recurring reminder", () => {
    expect(shouldRecordAsMissedInstead(500, 1000, false)).toBe(false);
  });

  it("returns false for future one-time reminder", () => {
    expect(shouldRecordAsMissedInstead(2000, 1000, true)).toBe(false);
  });

  it("returns true when due exactly equals now (one-time)", () => {
    expect(shouldRecordAsMissedInstead(1000, 1000, true)).toBe(true);
  });
});

describe("isStaleDelivery", () => {
  const now = 1_700_000_000_000;

  it("returns false for on-time delivery", () => {
    expect(isStaleDelivery(now, now)).toBe(false);
  });

  it("returns false for delivery within the threshold", () => {
    expect(isStaleDelivery(now - STALE_DELIVERY_THRESHOLD_MS, now)).toBe(false);
  });

  it("returns true just past the threshold", () => {
    expect(isStaleDelivery(now - STALE_DELIVERY_THRESHOLD_MS - 1, now)).toBe(true);
  });

  it("returns true for months-late delivery", () => {
    const ninetyNineDays = 99 * 24 * 60 * 60_000;
    expect(isStaleDelivery(now - ninetyNineDays, now)).toBe(true);
  });

  it("returns false for NaN scheduledFor", () => {
    expect(isStaleDelivery(NaN, now)).toBe(false);
  });

  it("returns false for zero/missing scheduledFor", () => {
    expect(isStaleDelivery(0, now)).toBe(false);
  });

  it("respects a custom threshold", () => {
    expect(isStaleDelivery(now - 5000, now, 1000)).toBe(true);
    expect(isStaleDelivery(now - 500, now, 1000)).toBe(false);
  });
});

// ─── Group 5: Action recognition ────────────────────────────────────────────

describe("isKnownAlarmAction", () => {
  it("recognizes dismiss_action", () => {
    expect(isKnownAlarmAction("dismiss_action")).toBe(true);
  });

  it("recognizes snooze_action", () => {
    expect(isKnownAlarmAction("snooze_action")).toBe(true);
  });

  it("rejects unknown action", () => {
    expect(isKnownAlarmAction("random_action")).toBe(false);
  });

  it("rejects undefined", () => {
    expect(isKnownAlarmAction(undefined)).toBe(false);
  });
});

describe("isCurrentActiveAlarm", () => {
  it("returns true when matches pendingId", () => {
    expect(isCurrentActiveAlarm("abc", "xyz", "abc")).toBe(true);
  });

  it("returns true when matches displayedId", () => {
    expect(isCurrentActiveAlarm("xyz", "abc", "abc")).toBe(true);
  });

  it("returns false when matches neither", () => {
    expect(isCurrentActiveAlarm("xyz", "def", "abc")).toBe(false);
  });

  it("handles undefined pendingId", () => {
    expect(isCurrentActiveAlarm(undefined, "abc", "abc")).toBe(true);
  });

  it("handles both undefined", () => {
    expect(isCurrentActiveAlarm(undefined, undefined, "abc")).toBe(false);
  });
});

// ─── Group 6: Pre-alerts ────────────────────────────────────────────────────

describe("isPreAlert", () => {
  it("returns true for pre_alert", () => {
    expect(isPreAlert("pre_alert")).toBe(true);
  });

  it("returns false for reminder_occurrence", () => {
    expect(isPreAlert("reminder_occurrence")).toBe(false);
  });

  it("returns false for snooze_occurrence", () => {
    expect(isPreAlert("snooze_occurrence")).toBe(false);
  });

  it("returns false for undefined", () => {
    expect(isPreAlert(undefined)).toBe(false);
  });
});

describe("pre_alert is never an alarm occurrence", () => {
  it("isAlarmOccurrenceNotification rejects pre_alert", () => {
    expect(isAlarmOccurrenceNotification("pre_alert")).toBe(false);
  });

  it("shouldHandleAsAlarm rejects pre_alert even with a reminderId", () => {
    expect(shouldHandleAsAlarm("rem_abc", "pre_alert")).toBe(false);
  });
});

describe("parsePreReminderMinutes", () => {
  it("parses a numeric string", () => {
    expect(parsePreReminderMinutes("15")).toBe(15);
  });

  it("parses a number", () => {
    expect(parsePreReminderMinutes(10)).toBe(10);
  });

  it("rounds fractional minutes", () => {
    expect(parsePreReminderMinutes(12.6)).toBe(13);
  });

  it("returns 0 for undefined", () => {
    expect(parsePreReminderMinutes(undefined)).toBe(0);
  });

  it("returns 0 for empty string", () => {
    expect(parsePreReminderMinutes("")).toBe(0);
  });

  it("returns 0 for a negative value", () => {
    expect(parsePreReminderMinutes(-5)).toBe(0);
  });

  it("returns 0 for zero", () => {
    expect(parsePreReminderMinutes(0)).toBe(0);
  });

  it("returns 0 for NaN string", () => {
    expect(parsePreReminderMinutes("abc")).toBe(0);
  });

  it("returns 0 for Infinity", () => {
    expect(parsePreReminderMinutes(Infinity)).toBe(0);
  });
});

describe("shouldSchedulePreAlert", () => {
  const min = 60_000;

  it("returns false when minutes is 0", () => {
    expect(shouldSchedulePreAlert(60 * min, 0)).toBe(false);
  });

  it("returns false when minutes is negative", () => {
    expect(shouldSchedulePreAlert(60 * min, -5)).toBe(false);
  });

  it("returns true when lead comfortably exceeds minutes + slack", () => {
    expect(shouldSchedulePreAlert(60 * min, 15)).toBe(true);
  });

  it("returns false when lead equals minutes + slack exactly", () => {
    expect(shouldSchedulePreAlert(15 * min + PRE_ALERT_MIN_SLACK_MS, 15)).toBe(false);
  });

  it("returns true just past minutes + slack", () => {
    expect(shouldSchedulePreAlert(15 * min + PRE_ALERT_MIN_SLACK_MS + 1, 15)).toBe(true);
  });

  it("returns false when the event is closer than the lead time", () => {
    expect(shouldSchedulePreAlert(10 * min, 15)).toBe(false);
  });

  it("respects a custom slack", () => {
    expect(shouldSchedulePreAlert(15 * min + 5000, 15, 1000)).toBe(true);
    expect(shouldSchedulePreAlert(15 * min + 500, 15, 1000)).toBe(false);
  });
});

describe("preAlertTriggerTime", () => {
  it("subtracts the lead time from the main trigger", () => {
    const mainTs = 1_700_000_000_000;
    expect(preAlertTriggerTime(mainTs, 15)).toBe(mainTs - 15 * 60_000);
  });

  it("handles 5 minutes", () => {
    expect(preAlertTriggerTime(600_000, 5)).toBe(300_000);
  });
});

describe("filterPreAlertTriggerIds", () => {
  it("finds matching prealert prefixes", () => {
    const ids = ["prealert_abc_1", "prealert_abc_2", "prealert_xyz_1", "reminder_abc_1"];
    expect(filterPreAlertTriggerIds(ids, "abc")).toEqual([
      "prealert_abc_1",
      "prealert_abc_2",
    ]);
  });

  it("excludes exceptId", () => {
    const ids = ["prealert_abc_1", "prealert_abc_2"];
    expect(filterPreAlertTriggerIds(ids, "abc", "prealert_abc_1")).toEqual([
      "prealert_abc_2",
    ]);
  });

  it("returns empty array when no matches", () => {
    expect(filterPreAlertTriggerIds(["reminder_abc_1"], "abc")).toEqual([]);
  });

  it("handles empty input array", () => {
    expect(filterPreAlertTriggerIds([], "abc")).toEqual([]);
  });
});

describe("buildPreAlertBody", () => {
  it("states the subject and the lead time, with no opener", () => {
    expect(buildPreAlertBody("Meeting with Ahmed", 15)).toBe(
      "Meeting with Ahmed in 15 minutes"
    );
  });

  it("uses singular unit for one minute", () => {
    expect(buildPreAlertBody("Standup", 1)).toBe("Standup in 1 minute");
  });

  it("falls back for an empty title", () => {
    expect(buildPreAlertBody("", 10)).toBe("your reminder in 10 minutes");
  });

  it("falls back for a whitespace title", () => {
    expect(buildPreAlertBody("   ", 5)).toBe("your reminder in 5 minutes");
  });

  it("falls back for an undefined title", () => {
    expect(buildPreAlertBody(undefined, 30)).toBe("your reminder in 30 minutes");
  });

  // The voice rewrite (OLD-95) banned conversational lead-ins from spoken lines;
  // the visible pre-alert body is the same voice on a different surface, and it
  // matches convex/helpers.ts's deterministic "<title> in N minutes" fallback.
  it("carries no banned lead-in", () => {
    for (const title of ["Meeting with Ahmed", "", undefined]) {
      expect(buildPreAlertBody(title, 15)).not.toMatch(
        /heads up|don't forget|just so you know|by the way/i
      );
    }
  });
});

// ─── Group 7: Ring cadence ──────────────────────────────────────────────────

describe("normalizeUrgencyTier", () => {
  it("passes urgent through", () => {
    expect(normalizeUrgencyTier("urgent")).toBe("urgent");
  });

  it("passes routine through", () => {
    expect(normalizeUrgencyTier("routine")).toBe("routine");
  });

  it("passes notice through", () => {
    expect(normalizeUrgencyTier("notice")).toBe("notice");
  });

  it("normalizes case and whitespace", () => {
    expect(normalizeUrgencyTier("  URGENT ")).toBe("urgent");
  });

  it("defaults unknown values to notice (legacy behavior)", () => {
    expect(normalizeUrgencyTier("critical")).toBe("notice");
  });

  it("defaults undefined to notice", () => {
    expect(normalizeUrgencyTier(undefined)).toBe("notice");
  });
});

describe("ringCadenceMode", () => {
  // OLD-108: there is one spoken line per reminder, so urgent has nothing to
  // alternate between and rings the same continuous loop it fell back to
  // whenever a variant was missing. The "alternate" mode is gone entirely.
  it("urgent loops however many files and whatever playback support it has", () => {
    expect(ringCadenceMode("urgent", 2, true)).toBe("loop");
    expect(ringCadenceMode("urgent", 4, true)).toBe("loop");
    expect(ringCadenceMode("urgent", 4, false)).toBe("loop");
    expect(ringCadenceMode("urgent", 1, true)).toBe("loop");
  });

  it("routine with one-shot support speaks twice", () => {
    expect(ringCadenceMode("routine", 1, true)).toBe("speak_twice");
  });

  it("routine without one-shot support loops", () => {
    expect(ringCadenceMode("routine", 1, false)).toBe("loop");
  });

  it("routine with no playable files loops", () => {
    expect(ringCadenceMode("routine", 0, true)).toBe("loop");
  });

  it("notice always loops", () => {
    expect(ringCadenceMode("notice", 4, true)).toBe("loop");
  });

  it("legacy/unknown urgency loops", () => {
    expect(ringCadenceMode(undefined, 4, true)).toBe("loop");
  });
});

// ─── Group 8: The snooze-nag (OLD-96) ───────────────────────────────────────

describe("nag policy constants", () => {
  it("pins the comeback interval at five minutes", () => {
    expect(NAG_DELAY_MINUTES).toBe(5);
  });

  it("pins the chain at three comebacks", () => {
    expect(MAX_NAG_COMEBACKS).toBe(3);
  });
});

describe("parseNagCount", () => {
  it("parses the counter notification data carries as a string", () => {
    expect(parseNagCount("2")).toBe(2);
  });

  it("treats an absent counter as a fresh ring", () => {
    expect(parseNagCount(undefined)).toBe(0);
  });

  it("clamps a negative counter to 0", () => {
    expect(parseNagCount("-3")).toBe(0);
  });

  it("treats garbage as a fresh ring", () => {
    expect(parseNagCount("abc")).toBe(0);
  });

  it("accepts a plain number (the AlarmKit state shape)", () => {
    expect(parseNagCount(1)).toBe(1);
  });
});

describe("shouldNagAgain", () => {
  it("owes a comeback to a ring that was never nagged", () => {
    expect(shouldNagAgain(0)).toBe(true);
  });

  it("keeps going through the whole chain", () => {
    expect(shouldNagAgain(1)).toBe(true);
    expect(shouldNagAgain(MAX_NAG_COMEBACKS - 1)).toBe(true);
  });

  it("goes quiet after the last comeback", () => {
    expect(shouldNagAgain(MAX_NAG_COMEBACKS)).toBe(false);
    expect(shouldNagAgain(MAX_NAG_COMEBACKS + 5)).toBe(false);
  });

  it("respects a custom cap", () => {
    expect(shouldNagAgain(0, 1)).toBe(true);
    expect(shouldNagAgain(1, 1)).toBe(false);
  });
});

// ─── Group 8b: the chain as a schedule ──────────────────────────────────────
//
// On iOS the comebacks have to exist before the ring goes unanswered — no app
// code runs at that moment. These three functions are what makes that possible:
// the whole chain is a pure function of the occurrence time, so it can be armed
// up front, re-derived after an OS upgrade dropped it, and recognised on the way
// back in without a stored counter.

const MIN = 60_000;
const T = Date.UTC(2026, 7, 17, 8, 0, 0, 0);

describe("planNagChain", () => {
  it("puts the three comebacks five minutes apart after the ring", () => {
    expect(planNagChain(T)).toEqual([T + 5 * MIN, T + 10 * MIN, T + 15 * MIN]);
  });

  it("leaves the occurrence itself out of the chain", () => {
    expect(planNagChain(T)).not.toContain(T);
  });

  it("is anchored to the ring, not to the moment it is asked", () => {
    expect(planNagChain(T)).toEqual(planNagChain(T));
    expect(planNagChain(T + MIN)[0]).toBe(T + 6 * MIN);
  });

  it("honours a custom cap and interval", () => {
    expect(planNagChain(T, 1)).toEqual([T + 5 * MIN]);
    expect(planNagChain(T, 2, 20)).toEqual([T + 20 * MIN, T + 40 * MIN]);
    expect(planNagChain(T, 0)).toEqual([]);
  });

  it("returns nothing for a nonsense occurrence time", () => {
    expect(planNagChain(Number.NaN)).toEqual([]);
  });
});

describe("remainingNagComebacks", () => {
  it("owes the whole chain the moment the ring fires", () => {
    expect(remainingNagComebacks(T, T)).toHaveLength(MAX_NAG_COMEBACKS);
  });

  it("drops the links that have already rung", () => {
    expect(remainingNagComebacks(T, T + 7 * MIN)).toEqual([T + 10 * MIN, T + 15 * MIN]);
  });

  it("owes nothing once the chain is spent", () => {
    expect(remainingNagComebacks(T, T + 16 * MIN)).toEqual([]);
  });

  it("owes nothing for a ring the app only noticed hours later", () => {
    // The chain belongs to the ring, not to when reconciliation ran: nagging at
    // 11:00 about an 08:00 dose is worse than recording the miss.
    expect(remainingNagComebacks(T, T + 180 * MIN)).toEqual([]);
  });
});

describe("nagIndexForFireTime", () => {
  it("calls the occurrence link zero", () => {
    expect(nagIndexForFireTime(T, T)).toBe(0);
  });

  it("numbers the comebacks in order", () => {
    expect(nagIndexForFireTime(T, T + 5 * MIN)).toBe(1);
    expect(nagIndexForFireTime(T, T + 10 * MIN)).toBe(2);
    expect(nagIndexForFireTime(T, T + 15 * MIN)).toBe(3);
  });

  it("tolerates a few seconds of drift on either side", () => {
    expect(nagIndexForFireTime(T, T + 5 * MIN + 4000)).toBe(1);
    expect(nagIndexForFireTime(T, T + 5 * MIN - 4000)).toBe(1);
  });

  it("clamps instead of running off the end of the chain", () => {
    expect(nagIndexForFireTime(T, T + 90 * MIN)).toBe(MAX_NAG_COMEBACKS);
    expect(nagIndexForFireTime(T, T - 10 * MIN)).toBe(0);
    expect(nagIndexForFireTime(Number.NaN, T)).toBe(0);
  });
});
