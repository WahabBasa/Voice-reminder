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
  parseSnoozeEnabled,
  parseAutoSnoozeCount,
  canAutoSnooze,
  adjustPastDueTrigger,
  shouldRecordAsMissedInstead,
  isKnownAlarmAction,
  isCurrentActiveAlarm,
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

describe("parseSnoozeEnabled", () => {
  it("returns true for undefined (default)", () => {
    expect(parseSnoozeEnabled(undefined)).toBe(true);
  });

  it("returns true for 'true'", () => {
    expect(parseSnoozeEnabled("true")).toBe(true);
  });

  it("returns false for 'false'", () => {
    expect(parseSnoozeEnabled("false")).toBe(false);
  });

  it("returns true for non-false string", () => {
    expect(parseSnoozeEnabled("yes")).toBe(true);
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

describe("canAutoSnooze", () => {
  it("returns true when enabled and under max", () => {
    expect(canAutoSnooze(true, 0, 1)).toBe(true);
  });

  it("returns false when count equals max", () => {
    expect(canAutoSnooze(true, 1, 1)).toBe(false);
  });

  it("returns false when disabled", () => {
    expect(canAutoSnooze(false, 0, 1)).toBe(false);
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
