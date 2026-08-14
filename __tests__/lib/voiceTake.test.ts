/**
 * One take, several reminders on the client (OLD-93).
 *
 * The seam under test is lib/voiceTake: an action result goes in, and what the
 * screen must do with it comes out — how many reminders the free plan lets the
 * take keep, which rows get stored, which get deleted server-side, and what the
 * user is told. Store, Notifee, hydration and Convex all arrive as deps, so no
 * device modules are in reach here.
 */
import {
  buildReminderDraft,
  describeTakeOutcome,
  extractTakeItems,
  intakeTakeReminders,
  planTakeAllowance,
  scheduleTakeReminders,
  type TakeItem,
} from "../../lib/voiceTake";
import type { Reminder } from "../../lib/store";

const FAST = { usedFastPath: true, tzid: "UTC" };
const SLOW = { usedFastPath: false, tzid: "UTC" };

const item = (over: Record<string, unknown> = {}): TakeItem => ({
  id: "convex1",
  title: "Water",
  description: "Your water glass is still full.",
  time: "20:00",
  frequency: "once",
  ...over,
});

/** A stored reminder, as the store hands it back. */
const stored = (draft: Omit<Reminder, "id" | "createdAt">, id: string): Reminder => ({
  ...draft,
  id,
  createdAt: "2026-08-14T00:00:00.000Z",
});

/** addReminder that succeeds, handing back sequential local ids. */
function fakeStore() {
  const saved: Reminder[] = [];
  const addReminder = jest.fn(async (draft: Omit<Reminder, "id" | "createdAt">) => {
    const reminder = stored(draft, `local${saved.length + 1}`);
    saved.push(reminder);
    return reminder;
  });
  return { saved, addReminder };
}

// ─── extractTakeItems ───────────────────────────────────────────────────────

describe("extractTakeItems", () => {
  it("returns every reminder of a multi-reminder take", () => {
    const result = {
      ...item({ id: "a", title: "Medicine" }),
      reminders: [item({ id: "a", title: "Medicine" }), item({ id: "b", title: "Call mom" })],
      reminderCount: 2,
    };

    expect(extractTakeItems(result).map((r) => r.title)).toEqual(["Medicine", "Call mom"]);
  });

  it("treats a result with no array as a take of one (legacy shape)", () => {
    const result = item({ id: "solo", title: "Trash" });

    const items = extractTakeItems(result);

    expect(items).toHaveLength(1);
    expect(items[0].title).toBe("Trash");
  });

  it("falls back to the top-level fields when the array is empty or junk", () => {
    expect(extractTakeItems({ ...item(), reminders: [] })).toHaveLength(1);
    expect(extractTakeItems({ ...item(), reminders: [null, "nope"] })).toHaveLength(1);
  });

  it("drops junk entries but keeps the usable ones", () => {
    const result = { ...item(), reminders: [item({ title: "Keep" }), null, 7] };

    const items = extractTakeItems(result);

    expect(items).toHaveLength(1);
    expect(items[0].title).toBe("Keep");
  });

  it("returns nothing for a missing result", () => {
    expect(extractTakeItems(null)).toEqual([]);
    expect(extractTakeItems(undefined)).toEqual([]);
  });
});

// ─── buildReminderDraft ─────────────────────────────────────────────────────

describe("buildReminderDraft", () => {
  it("maps a fast-path item with audio still pending", () => {
    const draft = buildReminderDraft(
      item({
        id: "convex9",
        emoji: "💧",
        urgency: "notice",
        persistent: true,
        variants: ["Still full."],
        preReminderMinutes: 10,
        scheduleType: "once",
        onceAt: 1234,
      }),
      FAST
    );

    expect(draft.convexId).toBe("convex9");
    expect(draft.audioStatus).toBe("pending");
    expect(draft.audioUrl).toBe("");
    expect(draft.emoji).toBe("💧");
    expect(draft.urgency).toBe("notice");
    expect(draft.persistent).toBe(true);
    expect(draft.variants).toEqual(["Still full."]);
    expect(draft.preReminderMinutes).toBe(10);
    expect(draft.scheduleType).toBe("once");
    expect(draft.onceAt).toBe(1234);
    expect(draft.tzid).toBe("UTC");
    expect(draft.schemaVersion).toBe(4);
  });

  it("marks slow-path audio ready when the item came back with a url", () => {
    expect(buildReminderDraft(item({ audioUrl: "https://a/b.mp3" }), SLOW).audioStatus).toBe("ready");
    expect(buildReminderDraft(item(), SLOW).audioStatus).toBeUndefined();
  });

  it("folds weekly into custom and keeps days only for custom", () => {
    const weekly = buildReminderDraft(item({ frequency: "weekly", days: ["mon"] }), FAST);
    expect(weekly.frequency).toBe("custom");
    expect(weekly.days).toEqual(["mon"]);

    const daily = buildReminderDraft(item({ frequency: "daily", days: ["mon"] }), FAST);
    expect(daily.days).toEqual([]);
  });

  it("drops absent numeric and empty list fields rather than storing junk", () => {
    const draft = buildReminderDraft(item({ variants: [], preReminderMinutes: 0 }), FAST);

    expect(draft.intervalMs).toBeUndefined();
    expect(draft.anchorAt).toBeUndefined();
    expect(draft.preReminderMinutes).toBeUndefined();
    expect(draft.variants).toBeUndefined();
    expect(draft.persistent).toBeUndefined();
    expect(draft.emoji).toBeUndefined();
  });

  it("defaults a missing time so the card is still schedulable", () => {
    expect(buildReminderDraft(item({ time: undefined }), FAST).time).toBe("00:00");
  });
});

// ─── planTakeAllowance ──────────────────────────────────────────────────────

describe("planTakeAllowance", () => {
  it("keeps the whole take without asking about the plan when it fits", async () => {
    const checkPro = jest.fn(async () => false);

    const allowance = await planTakeAllowance({ takeCount: 3, activeCount: 2, limit: 5, checkPro });

    expect(allowance.allowed).toBe(3);
    expect(allowance.dropped).toBe(0);
    expect(checkPro).not.toHaveBeenCalled();
  });

  it("cuts a free take down to the remaining allowance", async () => {
    const checkPro = jest.fn(async () => false);

    const allowance = await planTakeAllowance({ takeCount: 3, activeCount: 3, limit: 5, checkPro });

    expect(allowance.allowed).toBe(2);
    expect(allowance.dropped).toBe(1);
    expect(allowance.isPro).toBe(false);
    expect(checkPro).toHaveBeenCalledTimes(1);
  });

  it("keeps the whole take for a subscriber", async () => {
    const checkPro = jest.fn(async () => true);

    const allowance = await planTakeAllowance({ takeCount: 4, activeCount: 9, limit: 5, checkPro });

    expect(allowance.allowed).toBe(4);
    expect(allowance.dropped).toBe(0);
    expect(allowance.isPro).toBe(true);
  });

  it("allows nothing when the user is already at the cap", async () => {
    const allowance = await planTakeAllowance({
      takeCount: 2,
      activeCount: 5,
      limit: 5,
      checkPro: async () => false,
    });

    expect(allowance.allowed).toBe(0);
    expect(allowance.dropped).toBe(2);
  });

  it("treats an unreachable entitlement check as not subscribed", async () => {
    const allowance = await planTakeAllowance({
      takeCount: 2,
      activeCount: 4,
      limit: 5,
      checkPro: async () => {
        throw new Error("offline");
      },
    });

    expect(allowance.allowed).toBe(1);
    expect(allowance.dropped).toBe(1);
  });
});

// ─── intakeTakeReminders ────────────────────────────────────────────────────

describe("intakeTakeReminders", () => {
  it("stores every reminder of the take and hydrates each one", async () => {
    const { saved, addReminder } = fakeStore();
    const startHydration = jest.fn();
    const discardOverflow = jest.fn(async () => {});

    const outcome = await intakeTakeReminders({
      items: [
        item({ id: "a", title: "Medicine" }),
        item({ id: "b", title: "Call mom" }),
        item({ id: "c", title: "Trash" }),
      ],
      allowed: 3,
      context: FAST,
      deps: { addReminder, startHydration, discardOverflow },
    });

    expect(outcome.created).toHaveLength(3);
    expect(outcome.total).toBe(3);
    expect(outcome.dropped).toBe(0);
    expect(outcome.failed).toBe(0);
    expect(saved.map((r) => r.title)).toEqual(["Medicine", "Call mom", "Trash"]);
    expect(startHydration).toHaveBeenCalledTimes(3);
    expect(startHydration.mock.calls.map((c) => c[1])).toEqual(["a", "b", "c"]);
    expect(discardOverflow).not.toHaveBeenCalled();
  });

  it("stores the one reminder of a legacy result", async () => {
    const { addReminder } = fakeStore();

    const items = extractTakeItems(item({ id: "solo", title: "Trash" }));
    const outcome = await intakeTakeReminders({
      items,
      allowed: items.length,
      context: FAST,
      deps: { addReminder, discardOverflow: jest.fn(async () => {}) },
    });

    expect(outcome.created).toHaveLength(1);
    expect(outcome.created[0].title).toBe("Trash");
    expect(outcome.total).toBe(1);
  });

  it("does not hydrate on the slow path — that audio arrived with the result", async () => {
    const { addReminder } = fakeStore();
    const startHydration = jest.fn();

    await intakeTakeReminders({
      items: [item({ audioUrl: "https://a/b.mp3" })],
      allowed: 1,
      context: SLOW,
      deps: { addReminder, startHydration, discardOverflow: jest.fn(async () => {}) },
    });

    expect(startHydration).not.toHaveBeenCalled();
  });

  it("keeps what the cap allows and deletes the overflow rows server-side", async () => {
    const { saved, addReminder } = fakeStore();
    const discardOverflow = jest.fn(async (_overflow: unknown) => {});
    const startHydration = jest.fn();

    const outcome = await intakeTakeReminders({
      items: [
        item({ id: "a", title: "Medicine" }),
        item({ id: "b", title: "Call mom" }),
        item({ id: "c", title: "Trash" }),
      ],
      allowed: 2,
      context: FAST,
      deps: { addReminder, startHydration, discardOverflow },
    });

    expect(outcome.created).toHaveLength(2);
    expect(outcome.dropped).toBe(1);
    expect(saved.map((r) => r.title)).toEqual(["Medicine", "Call mom"]);
    expect(discardOverflow).toHaveBeenCalledTimes(1);
    expect(discardOverflow.mock.calls[0][0]).toMatchObject({ id: "c" });
    // The cut reminder never reaches the device: no store row, no hydration.
    expect(startHydration).toHaveBeenCalledTimes(2);
  });

  it("reports the overflow even when the delete itself fails", async () => {
    const { addReminder } = fakeStore();
    const onError = jest.fn();

    const outcome = await intakeTakeReminders({
      items: [item({ id: "a" }), item({ id: "b" })],
      allowed: 1,
      context: FAST,
      deps: {
        addReminder,
        discardOverflow: async () => {
          throw new Error("network");
        },
        onError,
      },
    });

    expect(outcome.created).toHaveLength(1);
    expect(outcome.dropped).toBe(1);
    expect(onError).toHaveBeenCalledWith("discard", expect.any(Error), 1);
  });

  it("isolates a failed item — its siblings still land", async () => {
    const onError = jest.fn();
    const addReminder = jest.fn(async (draft: Omit<Reminder, "id" | "createdAt">) => {
      if (draft.title === "Call mom") throw new Error("storage full");
      return stored(draft, `local-${draft.title}`);
    });

    const outcome = await intakeTakeReminders({
      items: [
        item({ id: "a", title: "Medicine" }),
        item({ id: "b", title: "Call mom" }),
        item({ id: "c", title: "Trash" }),
      ],
      allowed: 3,
      context: FAST,
      deps: { addReminder, discardOverflow: jest.fn(async () => {}), onError },
    });

    expect(outcome.created.map((r) => r.title)).toEqual(["Medicine", "Trash"]);
    expect(outcome.failed).toBe(1);
    expect(outcome.total).toBe(3);
    expect(onError).toHaveBeenCalledWith("add", expect.any(Error), 1);
  });

  it("rethrows when nothing at all landed, the way a single take always failed", async () => {
    const limitError = Object.assign(new Error("Reminder limit exceeded: 5/5"), {
      name: "ReminderLimitExceededError",
    });

    await expect(
      intakeTakeReminders({
        items: [item({ id: "a" })],
        allowed: 1,
        context: FAST,
        deps: {
          addReminder: async () => {
            throw limitError;
          },
          discardOverflow: jest.fn(async () => {}),
        },
      })
    ).rejects.toBe(limitError);
  });
});

// ─── scheduleTakeReminders ──────────────────────────────────────────────────

describe("scheduleTakeReminders", () => {
  const created = [
    stored(buildReminderDraft(item({ title: "Medicine" }), FAST), "l1"),
    stored(buildReminderDraft(item({ title: "Call mom" }), FAST), "l2"),
    stored(buildReminderDraft(item({ title: "Trash" }), FAST), "l3"),
  ];

  it("schedules every created reminder", async () => {
    const scheduleOne = jest.fn(async () => {});

    await scheduleTakeReminders(created, scheduleOne);

    expect(scheduleOne).toHaveBeenCalledTimes(3);
  });

  it("keeps scheduling the siblings after one fails", async () => {
    const onError = jest.fn();
    const scheduleOne = jest.fn(async (reminder: Reminder) => {
      if (reminder.id === "l2") throw new Error("no exact alarm permission");
    });

    await scheduleTakeReminders(created, scheduleOne, onError);

    expect(scheduleOne).toHaveBeenCalledTimes(3);
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError.mock.calls[0][1].id).toBe("l2");
  });
});

// ─── describeTakeOutcome ────────────────────────────────────────────────────

describe("describeTakeOutcome", () => {
  it("says nothing for a plain single reminder — the edit sheet is the feedback", () => {
    expect(describeTakeOutcome({ created: 1, dropped: 0, failed: 0, total: 1, limit: 5 })).toBeNull();
  });

  it("counts a multi-reminder take", () => {
    const feedback = describeTakeOutcome({ created: 3, dropped: 0, failed: 0, total: 3, limit: 5 });

    expect(feedback).toMatchObject({ title: "3 reminders created", type: "success", upgrade: false });
  });

  it("names what the free cap cut and points at the upgrade", () => {
    const feedback = describeTakeOutcome({ created: 2, dropped: 1, failed: 0, total: 3, limit: 5 });

    expect(feedback?.title).toBe("2 of 3 reminders created");
    expect(feedback?.message).toContain("5");
    expect(feedback?.upgrade).toBe(true);
    expect(feedback?.type).toBe("warning");
  });

  it("owns up to reminders that failed to save", () => {
    const feedback = describeTakeOutcome({ created: 2, dropped: 0, failed: 1, total: 3, limit: 5 });

    expect(feedback?.title).toBe("2 of 3 reminders created");
    expect(feedback?.upgrade).toBe(false);
  });

  it("says nothing when nothing was created — that path shows the locked overlay", () => {
    expect(describeTakeOutcome({ created: 0, dropped: 2, failed: 0, total: 2, limit: 5 })).toBeNull();
  });
});
