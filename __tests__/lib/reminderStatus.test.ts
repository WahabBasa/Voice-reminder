// OLD-117 — one status rule. A one-off is owed until it is ticked or deleted;
// ringing out (a `missed` ledger entry) records that it rang unanswered and
// changes nothing. These cover the rule itself and the two seams that count
// with it: the mic-tap gate (lib/usage) and the store gate (addReminder).

// usageGate reaches purchases through a dynamic import(), so the module path is
// what has to be mocked (same shape as usageGate.test.ts).
const mockCheckProStatus = jest.fn<Promise<boolean>, unknown[]>();
const mockGetCachedProStatus = jest.fn<{ isPro: boolean | null; updatedAtMs: number }, unknown[]>();
const mockRefreshProStatus = jest.fn<Promise<boolean>, unknown[]>();

jest.mock("../../lib/purchases", () => ({
  __esModule: true,
  checkProStatus: (...args: unknown[]) => mockCheckProStatus(...args),
  getCachedProStatus: (...args: unknown[]) => mockGetCachedProStatus(...args),
  refreshProStatus: (...args: unknown[]) => mockRefreshProStatus(...args),
}));

// Must import AFTER jest.mock
import {
  statusOf,
  isReminderActive,
  shouldCleanupGhostOnceReminder,
} from "../../lib/reminderActive";
import { useReminderStore, type Reminder, type ReminderHistory } from "../../lib/store";
import { getActiveReminderCount } from "../../lib/usage";
import { getFreeActiveLimit, ReminderLimitExceededError } from "../../lib/usageGate";

const DAY = 86_400_000;
const LIMIT = getFreeActiveLimit();

// jest.config sets TZ=UTC, so local wall-clock construction is UTC here.
function utc(year: number, month: number, day: number, hour = 0, minute = 0): number {
  return Date.UTC(year, month - 1, day, hour, minute, 0, 0);
}

function isoDate(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;
}

function makeReminder(overrides: Partial<Reminder> = {}): Reminder {
  return {
    id: "rem_status",
    title: "Test Reminder",
    description: "",
    time: "09:00",
    frequency: "once",
    days: [],
    createdAt: "2026-04-01T00:00:00.000Z",
    schemaVersion: 5,
    ...overrides,
  };
}

function entry(
  reminderId: string,
  status: "completed" | "missed",
  timestamp: string
): ReminderHistory {
  return {
    id: `h_${reminderId}_${status}_${Math.random().toString(36).slice(2, 7)}`,
    reminderId,
    reminderTitle: "Test Reminder",
    timestamp,
    status,
    action: status === "missed" ? "auto_missed" : "dismissed",
  };
}

beforeEach(() => {
  mockCheckProStatus.mockReset();
  mockCheckProStatus.mockResolvedValue(false);
  mockGetCachedProStatus.mockReset();
  mockGetCachedProStatus.mockReturnValue({ isPro: null, updatedAtMs: 0 });
  mockRefreshProStatus.mockReset();
  mockRefreshProStatus.mockResolvedValue(false);
});

// ─── statusOf ───────────────────────────────────────────────────────────────

describe("statusOf", () => {
  const now = utc(2026, 4, 6, 12, 0);
  const past = { date: "2026-01-15", time: "09:00" };
  const future = { date: "2026-12-25", time: "09:00" };

  describe("dated one-off × ledger", () => {
    it("past date, no ledger entry → overdue", () => {
      expect(statusOf(makeReminder(past), [], now)).toBe("overdue");
    });

    it("past date, rang out (missed) → still overdue, not done", () => {
      const h = [entry("rem_status", "missed", "2026-01-15T09:05:00.000Z")];
      expect(statusOf(makeReminder(past), h, now)).toBe("overdue");
    });

    it("past date, ticked (completed) → done", () => {
      const h = [entry("rem_status", "completed", "2026-01-15T09:05:00.000Z")];
      expect(statusOf(makeReminder(past), h, now)).toBe("done");
    });

    it("future date, no ledger entry → scheduled", () => {
      expect(statusOf(makeReminder(future), [], now)).toBe("scheduled");
    });

    it("future date, missed entry from an earlier ring → scheduled", () => {
      const h = [entry("rem_status", "missed", "2026-04-05T09:05:00.000Z")];
      expect(statusOf(makeReminder(future), h, now)).toBe("scheduled");
    });

    it("future date, ticked early → done", () => {
      const h = [entry("rem_status", "completed", "2026-04-06T10:00:00.000Z")];
      expect(statusOf(makeReminder(future), h, now)).toBe("done");
    });
  });

  it("exactly at the ring minute counts as overdue", () => {
    const r = makeReminder({ date: "2026-04-06", time: "12:00" });
    expect(statusOf(r, [], now)).toBe("overdue");
  });

  it("another reminder's completion does not finish this one", () => {
    const h = [entry("rem_other", "completed", "2026-04-06T10:00:00.000Z")];
    expect(statusOf(makeReminder(past), h, now)).toBe("overdue");
  });

  it("undated one-off rolls forward to its next clock time → scheduled", () => {
    const r = makeReminder({ date: undefined, time: "23:00" });
    expect(statusOf(r, [], now)).toBe("scheduled");
  });

  it("undated one-off that was ticked → done", () => {
    const r = makeReminder({ date: undefined, time: "23:00" });
    const h = [entry("rem_status", "completed", "2026-04-06T10:00:00.000Z")];
    expect(statusOf(r, h, now)).toBe("done");
  });

  it("one-off with no time at all reads as overdue", () => {
    const r = makeReminder({ date: undefined, time: "" });
    expect(statusOf(r, [], now)).toBe("overdue");
  });

  it("daily ticked today is scheduled, not done — repeaters never end", () => {
    const r = makeReminder({ frequency: "daily", time: "15:00" });
    const h = [entry("rem_status", "completed", "2026-04-06T15:05:00.000Z")];
    expect(statusOf(r, h, now)).toBe("scheduled");
  });

  it("weekly with a completion is scheduled", () => {
    const r = makeReminder({ frequency: "weekly", days: ["mon"] });
    const h = [entry("rem_status", "completed", "2026-04-06T10:00:00.000Z")];
    expect(statusOf(r, h, now)).toBe("scheduled");
  });

  it("interval is scheduled even with a completion", () => {
    const r = makeReminder({
      frequency: "interval",
      intervalMs: 600_000,
      anchorAt: utc(2026, 4, 6, 8, 0),
    });
    const h = [entry("rem_status", "completed", "2026-04-06T10:00:00.000Z")];
    expect(statusOf(r, h, now)).toBe("scheduled");
  });

  it("defaults nowMs to the current clock", () => {
    const r = makeReminder({ date: isoDate(Date.now() - DAY), time: "09:00" });
    expect(statusOf(r, [])).toBe("overdue");
  });
});

// ─── isReminderActive ───────────────────────────────────────────────────────

describe("isReminderActive", () => {
  const now = utc(2026, 4, 6, 12, 0);

  it("is exactly 'not done'", () => {
    const overdue = makeReminder({ date: "2026-01-15", time: "09:00" });
    const scheduled = makeReminder({ date: "2026-12-25", time: "09:00" });
    const doneH = [entry("rem_status", "completed", "2026-01-15T09:05:00.000Z")];
    const missedH = [entry("rem_status", "missed", "2026-01-15T09:05:00.000Z")];

    expect(isReminderActive(overdue, [], now)).toBe(true);
    expect(isReminderActive(overdue, missedH, now)).toBe(true);
    expect(isReminderActive(overdue, doneH, now)).toBe(false);
    expect(isReminderActive(scheduled, [], now)).toBe(true);
    expect(isReminderActive(scheduled, doneH, now)).toBe(false);
  });

  it("defaults nowMs to the current clock", () => {
    const r = makeReminder({ date: isoDate(Date.now() - DAY), time: "09:00" });
    expect(isReminderActive(r, [])).toBe(true);
  });
});

// ─── shouldCleanupGhostOnceReminder ─────────────────────────────────────────

describe("shouldCleanupGhostOnceReminder", () => {
  const now = utc(2026, 4, 6, 12, 0);

  it("removes a ticked one-off whatever its date said", () => {
    const doneH = [entry("rem_status", "completed", "2026-04-06T10:00:00.000Z")];
    expect(
      shouldCleanupGhostOnceReminder(makeReminder({ date: "2026-01-15" }), doneH, now)
    ).toBe(true);
    expect(
      shouldCleanupGhostOnceReminder(makeReminder({ date: "2026-12-25" }), doneH, now)
    ).toBe(true);
  });

  it("keeps a one-off that only rang out", () => {
    const missedH = [entry("rem_status", "missed", "2026-01-15T09:05:00.000Z")];
    const r = makeReminder({ date: "2026-01-15", time: "09:00" });
    expect(shouldCleanupGhostOnceReminder(r, missedH, now)).toBe(false);
  });

  it("never removes a repeater", () => {
    const r = makeReminder({ frequency: "daily" });
    const h = [entry("rem_status", "completed", "2026-04-06T10:00:00.000Z")];
    expect(shouldCleanupGhostOnceReminder(r, h, now)).toBe(false);
  });

  it("defaults nowMs to the current clock", () => {
    const r = makeReminder({ date: isoDate(Date.now() - DAY), time: "09:00" });
    expect(shouldCleanupGhostOnceReminder(r, [])).toBe(false);
  });
});

// ─── The count, through the real seams ──────────────────────────────────────

/** LIMIT one-offs whose ring time has passed, exactly as a voice take stores them. */
function seedOverdueOneOffs(status: "completed" | "missed" | "none") {
  const now = Date.now();
  const reminders: Reminder[] = Array.from({ length: LIMIT }, (_, i) => {
    const date = isoDate(now - (i + 1) * DAY);
    return {
      id: `rem_seed_${i + 1}`,
      title: `Alarm ${i + 1}`,
      description: "",
      time: "09:00",
      date,
      frequency: "once",
      days: [],
      createdAt: new Date(now - (i + 1) * DAY - 3_600_000).toISOString(),
      schemaVersion: 5,
      schedule: {
        type: "grid",
        days: { kind: "date", date },
        times: { kind: "clock", times: ["09:00"] },
      },
    };
  });
  const history =
    status === "none" ? [] : reminders.map((r) => entry(r.id, status, new Date(now - DAY).toISOString()));

  useReminderStore.setState({ reminders, history, hasLoadedReminders: true });
  return { reminders, history };
}

describe("getActiveReminderCount (the mic-tap gate's seam)", () => {
  it("counts overdue one-offs that were never answered", () => {
    seedOverdueOneOffs("none");
    expect(getActiveReminderCount()).toBe(LIMIT);
  });

  it("counts overdue one-offs that rang out", () => {
    seedOverdueOneOffs("missed");
    expect(getActiveReminderCount()).toBe(LIMIT);
  });

  it("stops counting them once they are ticked", () => {
    seedOverdueOneOffs("completed");
    expect(getActiveReminderCount()).toBe(0);
  });
});

describe("addReminder gate (the store's seam)", () => {
  const sixth = {
    title: "Sixth",
    description: "",
    time: "18:00",
    date: isoDate(Date.now() + DAY),
    frequency: "once",
    days: [] as string[],
  };

  it("agrees with getActiveReminderCount and blocks the 6th when five are still owed", async () => {
    seedOverdueOneOffs("missed");
    expect(getActiveReminderCount()).toBe(LIMIT);

    await expect(useReminderStore.getState().addReminder(sixth)).rejects.toBeInstanceOf(
      ReminderLimitExceededError
    );
    expect(useReminderStore.getState().reminders).toHaveLength(LIMIT);
  });

  it("blocks the 6th when the five simply never rang", async () => {
    seedOverdueOneOffs("none");
    await expect(useReminderStore.getState().addReminder(sixth)).rejects.toThrow(
      /Reminder limit exceeded: 5\/5/
    );
  });

  it("lets the 6th through once the five are ticked", async () => {
    seedOverdueOneOffs("completed");
    expect(getActiveReminderCount()).toBe(0);

    await useReminderStore.getState().addReminder(sixth);
    expect(useReminderStore.getState().reminders).toHaveLength(LIMIT + 1);
  });

  it("lets a subscriber past the cap", async () => {
    mockCheckProStatus.mockResolvedValue(true);
    seedOverdueOneOffs("missed");

    await useReminderStore.getState().addReminder(sixth);
    expect(useReminderStore.getState().reminders).toHaveLength(LIMIT + 1);
  });
});
