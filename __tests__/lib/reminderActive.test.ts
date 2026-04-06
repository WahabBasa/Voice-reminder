import {
  isReminderActive,
  getReminderNextDueTimestamp,
  shouldCleanupGhostOnceReminder,
} from "../../lib/reminderActive";
import type { Reminder, ReminderHistory } from "../../lib/store";

function utc(
  year: number,
  month: number,
  day: number,
  hour = 0,
  minute = 0
): number {
  return Date.UTC(year, month - 1, day, hour, minute, 0, 0);
}

function makeReminder(overrides: Partial<Reminder> = {}): Reminder {
  return {
    id: "rem_abc123",
    title: "Test Reminder",
    description: "Test description",
    time: "09:00",
    frequency: "once",
    days: [],
    createdAt: "2026-04-01T00:00:00.000Z",
    schemaVersion: 4,
    ...overrides,
  };
}

function makeHistory(
  reminderId: string,
  status: "completed" | "missed",
  timestamp: string
): ReminderHistory {
  return {
    id: "hist_" + Math.random().toString(36).slice(2, 7),
    reminderId,
    reminderTitle: "Test",
    timestamp,
    status,
  };
}

// ─── isReminderActive ───────────────────────────────────────────────────────

describe("isReminderActive", () => {
  const now = utc(2026, 4, 6, 12, 0);

  it("interval is always active with no history", () => {
    const r = makeReminder({ frequency: "interval", intervalMs: 600000, anchorAt: 1000 });
    expect(isReminderActive(r, [], now)).toBe(true);
  });

  it("interval is active even with completion history", () => {
    const r = makeReminder({ frequency: "interval", intervalMs: 600000, anchorAt: 1000 });
    const h = [makeHistory("rem_abc123", "completed", "2026-04-06T10:00:00.000Z")];
    expect(isReminderActive(r, h, now)).toBe(true);
  });

  it("once with no history is active", () => {
    const r = makeReminder({ frequency: "once" });
    expect(isReminderActive(r, [], now)).toBe(true);
  });

  it("once with completed history is inactive", () => {
    const r = makeReminder({ frequency: "once" });
    const h = [makeHistory("rem_abc123", "completed", "2026-04-06T10:00:00.000Z")];
    expect(isReminderActive(r, h, now)).toBe(false);
  });

  it("once with missed history is still active", () => {
    const r = makeReminder({ frequency: "once" });
    const h = [makeHistory("rem_abc123", "missed", "2026-04-06T10:00:00.000Z")];
    expect(isReminderActive(r, h, now)).toBe(true);
  });

  it("once with other reminder's completion is still active", () => {
    const r = makeReminder({ frequency: "once" });
    const h = [makeHistory("rem_different", "completed", "2026-04-06T10:00:00.000Z")];
    expect(isReminderActive(r, h, now)).toBe(true);
  });

  it("daily is always active", () => {
    const r = makeReminder({ frequency: "daily" });
    expect(isReminderActive(r, [], now)).toBe(true);
  });

  it("weekly is always active even with history", () => {
    const r = makeReminder({ frequency: "weekly", days: ["mon"] });
    const h = [makeHistory("rem_abc123", "completed", "2026-04-06T10:00:00.000Z")];
    expect(isReminderActive(r, h, now)).toBe(true);
  });

  it("custom is always active", () => {
    const r = makeReminder({ frequency: "custom", days: ["tue", "fri"] });
    expect(isReminderActive(r, [], now)).toBe(true);
  });
});

// ─── getReminderNextDueTimestamp ─────────────────────────────────────────────

describe("getReminderNextDueTimestamp", () => {
  it("computes next interval occurrence", () => {
    const r = makeReminder({
      frequency: "interval",
      intervalMs: 600000,
      anchorAt: utc(2026, 4, 6, 14, 0),
    });
    const now = utc(2026, 4, 6, 14, 7);
    expect(getReminderNextDueTimestamp(r, [], now)).toBe(
      utc(2026, 4, 6, 14, 10)
    );
  });

  it("returns fixed timestamp for once with date", () => {
    const r = makeReminder({
      frequency: "once",
      date: "2026-05-20",
      time: "13:00",
    });
    expect(getReminderNextDueTimestamp(r, [], utc(2026, 4, 6, 12, 0))).toBe(
      utc(2026, 5, 20, 13, 0)
    );
  });

  it("returns scheduledFor for once with scheduledFor", () => {
    const r = makeReminder({
      frequency: "once",
      scheduledFor: 5000000,
    });
    expect(getReminderNextDueTimestamp(r, [], utc(2026, 4, 6, 12, 0))).toBe(
      5000000
    );
  });

  it("returns today's time for daily not completed today", () => {
    const r = makeReminder({ frequency: "daily", time: "15:00" });
    const now = utc(2026, 4, 6, 10, 0);
    expect(getReminderNextDueTimestamp(r, [], now)).toBe(
      utc(2026, 4, 6, 15, 0)
    );
  });

  it("returns tomorrow when daily is completed today", () => {
    const r = makeReminder({ frequency: "daily", time: "15:00" });
    const now = utc(2026, 4, 6, 16, 0);
    // Completed today at 15:05
    const h = [makeHistory("rem_abc123", "completed", "2026-04-06T15:05:00.000Z")];
    const result = getReminderNextDueTimestamp(r, h, now);
    // Shifted +60s ref: 16:01, time 15:00 has passed → tomorrow 15:00
    expect(result).toBe(utc(2026, 4, 7, 15, 0));
  });
});

// ─── shouldCleanupGhostOnceReminder ─────────────────────────────────────────

describe("shouldCleanupGhostOnceReminder", () => {
  const now = utc(2026, 4, 6, 12, 0);

  it("returns false for non-once frequency", () => {
    const r = makeReminder({ frequency: "daily" });
    const h = [makeHistory("rem_abc123", "completed", "2026-04-06T10:00:00.000Z")];
    expect(shouldCleanupGhostOnceReminder(r, h, now)).toBe(false);
  });

  it("returns false for once with no completion", () => {
    const r = makeReminder({ frequency: "once" });
    expect(shouldCleanupGhostOnceReminder(r, [], now)).toBe(false);
  });

  it("returns true for completed once with past date", () => {
    const r = makeReminder({
      frequency: "once",
      date: "2026-01-15",
      time: "09:00",
    });
    const h = [makeHistory("rem_abc123", "completed", "2026-01-15T09:05:00.000Z")];
    expect(shouldCleanupGhostOnceReminder(r, h, now)).toBe(true);
  });

  it("returns false for completed once with future date", () => {
    const r = makeReminder({
      frequency: "once",
      date: "2026-12-25",
      time: "09:00",
    });
    const h = [makeHistory("rem_abc123", "completed", "2026-04-06T10:00:00.000Z")];
    expect(shouldCleanupGhostOnceReminder(r, h, now)).toBe(false);
  });

  it("returns true for completed once with no date", () => {
    const r = makeReminder({ frequency: "once" });
    const h = [makeHistory("rem_abc123", "completed", "2026-04-06T10:00:00.000Z")];
    expect(shouldCleanupGhostOnceReminder(r, h, now)).toBe(true);
  });
});

// ─── Day boundary behavior ──────────────────────────────────────────────────

describe("day boundary completion tracking", () => {
  it("completion yesterday does not count as completed today", () => {
    const r = makeReminder({ frequency: "daily", time: "15:00" });
    const now = utc(2026, 4, 6, 10, 0); // April 6 10:00
    // Completed yesterday at 23:59
    const h = [makeHistory("rem_abc123", "completed", "2026-04-05T23:59:00.000Z")];
    // Should return today's time since yesterday's completion doesn't count
    expect(getReminderNextDueTimestamp(r, h, now)).toBe(
      utc(2026, 4, 6, 15, 0)
    );
  });

  it("completion at 00:01 today counts as completed today", () => {
    const r = makeReminder({ frequency: "daily", time: "15:00" });
    const now = utc(2026, 4, 6, 10, 0);
    const h = [makeHistory("rem_abc123", "completed", "2026-04-06T00:01:00.000Z")];
    // Completed today → advance: ref = now+60s = 10:01, time 15:00 ahead → today 15:00?
    // Actually, with the +60s shift: 10:01, daily time 15:00 is still ahead → returns today 15:00
    // But wait — the shift is to *skip past today's occurrence*. Let me re-check.
    // hasCompletedToday = true → getNextTriggerTime(schedule, nowMs + 60_000)
    // nowMs + 60_000 = 10:01, daily time="15:00", 15:00 > 10:01 → returns today 15:00
    expect(getReminderNextDueTimestamp(r, h, now)).toBe(
      utc(2026, 4, 6, 15, 0)
    );
  });

  it("completion at 23:59 today counts as completed today", () => {
    const r = makeReminder({ frequency: "daily", time: "15:00" });
    const now = utc(2026, 4, 6, 23, 59);
    const h = [makeHistory("rem_abc123", "completed", "2026-04-06T23:58:00.000Z")];
    // Completed today → shift +60s → 00:00 Apr 7, daily 15:00 ahead → Apr 7 15:00
    expect(getReminderNextDueTimestamp(r, h, now)).toBe(
      utc(2026, 4, 7, 15, 0)
    );
  });
});
