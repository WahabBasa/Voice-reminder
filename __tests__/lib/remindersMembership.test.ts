import { activeCards, nextDisplayDue, nextLine, patternLine, overdueDays } from "../../lib/remindersMembership";
import { isReminderActive } from "../../lib/reminderActive";
import { occurrenceKey, type RingRecord, type RingSnapshot } from "../../lib/ringLifecycle";
import type { Reminder, ReminderHistory } from "../../lib/store";

const at = (day: number, hour = 0, minute = 0) => new Date(2026, 8, day, hour, minute).getTime();
const now = at(8, 12);
const clock = { hour12: true };
function reminder(overrides: Partial<Reminder> = {}): Reminder {
  return { id: "r", title: "Test", description: "Test", frequency: "daily", time: "09:00",
    days: [], createdAt: new Date(now).toISOString(), schemaVersion: 4,
    schedule: { type: "grid", days: { kind: "everyday" }, times: { kind: "clock", times: ["09:00"] } },
    ...overrides };
}
function once(day = 8, time = "09:00", id = "once"): Reminder {
  const date = `2026-09-${String(day).padStart(2, "0")}`;
  return reminder({ id, frequency: "once", date, time,
    schedule: { type: "grid", days: { kind: "date", date }, times: { kind: "clock", times: [time] } } });
}
const completed = (id: string): ReminderHistory => ({ id: `h-${id}`, reminderId: id,
  reminderTitle: "Test", status: "completed", timestamp: new Date(now).toISOString() });
const completedAt = (id: string, scheduledFor: number): ReminderHistory => ({ id: `h-${id}-${scheduledFor}`,
  reminderId: id, reminderTitle: "Test", status: "completed", timestamp: new Date(now).toISOString(), scheduledFor });
const card = (r: Reminder, time = now) => activeCards([r], [], time, {})[0];

// Build a ring-lifecycle record and a one-entry snapshot for it.
function ringRecord(id: string, occurrenceAt: number, over: Partial<RingRecord> = {}): RingRecord {
  return { reminderId: id, occurrenceAt, key: occurrenceKey({ reminderId: id, occurrenceAt }),
    state: "ringing", source: "alarmkit", chainId: String(occurrenceAt), chainStartedAt: occurrenceAt,
    lastEventAt: occurrenceAt, ...over };
}
function snap(...records: RingRecord[]): RingSnapshot {
  return Object.fromEntries(records.map((r) => [r.key, r]));
}

test("tomorrow-first repeater created midday stays visible without completion", () => {
  expect(card(reminder())).toMatchObject({ due: { at: at(9, 9), source: "grid" }, dueToday: false, showCompletion: false });
});
test("passed one-off sorts first, remains tickable and supplies the overdue dot flag", () => {
  const cards = activeCards([reminder(), once()], [], now, {});
  expect(cards[0]).toMatchObject({ overdue: true, dueToday: false, showCompletion: true });
  expect(nextLine(cards[0], now, clock)).toMatch(/^Overdue \u00b7 (Sep 8|8 Sept?) \u00b7 9:00 am$/);
});
test("live snooze wins; expired snooze does not", () => {
  const r = once();
  const snoozed = activeCards([r], [], now, { once: at(8, 15, 52) })[0];
  expect(snoozed).toMatchObject({ overdue: false, dueToday: true, showCompletion: true, due: { source: "snooze" } });
  expect(nextLine(snoozed, now, clock)).toBe("Rings again 3:52 pm");
  expect(activeCards([r], [], now, { once: now })[0].overdue).toBe(true);
});
test("completed-today repeater advances, including a midnight ring; one-off leaves", () => {
  const r = reminder({ schedule: { type: "grid", days: { kind: "everyday" }, times: { kind: "clock", times: ["00:00", "21:00"] } } });
  const cards = activeCards([r, once()], [completed("r"), completed("once")], now, {});
  expect(cards).toHaveLength(1);
  expect(cards[0]).toMatchObject({ due: { at: at(9) }, showCompletion: false });
});
test("two-time grid resolves its later ring today", () => {
  const r = reminder({ schedule: { type: "grid", days: { kind: "everyday" }, times: { kind: "clock", times: ["09:00", "16:00"] } } });
  expect(card(r)).toMatchObject({ dueToday: true, due: { at: at(8, 16) } });
  expect(nextLine(card(r), now)).toBe("Next in 4 hours");
});
test("interval outside window resolves next window date", () => {
  const r = reminder({ frequency: "interval", schedule: { type: "grid", days: { kind: "everyday" },
    times: { kind: "interval", everyMinutes: 120, windowStart: "08:00", windowEnd: "22:00" } } });
  expect(card(r, at(8, 23)).due.at).toBe(at(9, 8));
  expect(patternLine(r, clock)).toBe("Every 2 hr \u00b7 8:00 am\u201310:00 pm");
});
test("midnight refresh flips tomorrow to dueToday", () => {
  expect(card(once(9), at(8, 23, 59)).dueToday).toBe(false);
  expect(card(once(9), at(9)).dueToday).toBe(true);
});
test("expired grid repeater stays with unknown due", () => {
  const r = reminder();
  r.schedule = { ...r.schedule!, until: at(7) };
  expect(card(r)).toMatchObject({ due: { at: null, source: "unknown" }, showCompletion: false });
  expect(nextLine(card(r), now)).toBe("No next ring scheduled");
});
test("overdueDays uses local original ring date, excluding completed and repeating reminders", () => {
  expect(overdueDays([once(7), once(8, "09:00", "done"), reminder()], [completed("done")], now)).toEqual(new Set(["2026-09-07"]));
});
test("generated partition has all and only active ids once, sorted with nulls and ties", () => {
  for (let seed = 0; seed < 12; seed++) {
    const reminders = Array.from({ length: 60 }, (_, i) => {
      const r = i % 3 ? once(1 + (i + seed) % 28, "09:00", `r-${i}`) : reminder({ id: `r-${i}` });
      if (i % 7 === 0) r.schedule = { ...r.schedule!, until: at(1) };
      return r;
    }).reverse();
    const history = reminders.filter((_, i) => i % 5 === 0).map((r) => completed(r.id));
    const cards = activeCards(reminders, history, now, { "r-1": at(9) });
    const ids = cards.map((c) => c.reminder.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect([...ids].sort()).toEqual(reminders.filter((r) => isReminderActive(r, history, now)).map((r) => r.id).sort());
    for (let i = 1; i < cards.length; i++) {
      const a = cards[i - 1], b = cards[i];
      if (a.overdue !== b.overdue) expect(a.overdue).toBe(true);
      else if (a.due.at !== b.due.at) expect(a.due.at ?? Infinity).toBeLessThanOrEqual(b.due.at ?? Infinity);
      else expect(a.reminder.id.localeCompare(b.reminder.id)).toBeLessThanOrEqual(0);
    }
  }
});
test("relative horizons consistently use minutes, hours, tomorrow, calendar days, then date", () => {
  for (const [due, expected] of [[at(8, 12, 1), "Next in 1 min"], [at(8, 13), "Next in 1 hour"],
    [at(9, 11, 59), "Next in 24 hours"], [at(9, 12), "Tomorrow \u00b7 12:00 pm"],
    [at(10, 9), "Next in 2 days"], [at(14, 9), "Next in 6 days"], [at(21, 9), "Sep 21 \u00b7 9:00 am"]] as const) {
    expect(nextLine({ ...card(reminder()), due: { at: due, source: "grid" } }, now, clock)).toBe(expected);
  }
});
test("legacy fallback resolves finite and invalid timestamps and completed repeaters", () => {
  expect(nextDisplayDue({ ...once(), schedule: undefined }, [], now, {})).toEqual({ at: at(8, 9), source: "legacy" });
  const invalid = { ...once(), date: "invalid", schedule: undefined };
  expect(nextDisplayDue(invalid, [], now, {}).at).toBeNull();
  expect(nextDisplayDue({ ...invalid, schedule: once().schedule }, [], now, {}).at).toBeNull();
  expect(nextDisplayDue(reminder({ schedule: undefined }), [completed("r")], now, {}).at).toBe(at(9, 9));
});
test("patterns reuse clock/grid formatting with pattern first and one-off date", () => {
  expect(patternLine(once(21), clock)).toMatch(/^Once · (Sep 21|21 Sept?) · 9:00 am$/);
  expect(patternLine(reminder(), clock)).toBe("Daily \u00b7 9:00 am");
  const weekly = reminder({ schedule: { type: "grid", days: { kind: "weekdays", days: ["mon", "wed", "fri"] }, times: { kind: "clock", times: ["09:00"] } } });
  expect(patternLine(weekly, clock)).toBe("Every Mon, Wed, Fri \u00b7 9:00 am");
  expect(patternLine(reminder({ schedule: { ...weekly.schedule!, days: { kind: "weekdays", days: [] } } }), clock)).toBe("Daily \u00b7 9:00 am");
  expect(patternLine(reminder({ schedule: once().schedule }), clock)).toBe("9:00 am");
  expect(patternLine(reminder({ schedule: undefined }), clock)).toBe("Daily \u00b7 9:00 am");
  expect(patternLine(reminder({ schedule: undefined, intervalDays: 3 }), clock)).toBe("Every 3 days \u00b7 9:00 am");
  expect(patternLine(reminder({ schedule: undefined, frequency: "weekly", days: ["mon"] }), clock)).toBe("Every Mon \u00b7 9:00 am");
  expect(patternLine(reminder({ schedule: undefined, frequency: "weekly", days: undefined, time: undefined }), clock)).toBe("Weekly \u00b7 ");
  expect(patternLine(reminder({ schedule: undefined, frequency: "interval", intervalMs: 120 * 60000 }))).toBe("Every 2 hr");
  expect(patternLine(reminder({ schedule: undefined, frequency: "interval" }))).toBe("");
});

// ─── Ring-state resolution (ring-state fix) ─────────────────────────────────

test("a ringing occurrence freezes a repeater on that ring, never red, sorted first", () => {
  const r = reminder(); // daily 09:00; without a ring it would jump to tomorrow
  const s = snap(ringRecord("r", at(8, 9)));
  const [c] = activeCards([r], [], now, {}, s);
  expect(c).toMatchObject({ ringing: true, overdue: false, missed: false, ringState: "ringing",
    occurrenceAt: at(8, 9), due: { at: at(8, 9) }, dueToday: true, showCompletion: true });
  expect(nextLine(c, now, clock)).toBe("Ringing now");
});

test("ringing sorts above overdue and normal cards", () => {
  const ring = reminder({ id: "ring" });
  const s = snap(ringRecord("ring", at(8, 9)));
  const ids = activeCards([reminder({ id: "plain" }), once(8, "09:00", "over"), ring], [], now, {}, s)
    .map((c) => c.reminder.id);
  expect(ids[0]).toBe("ring");
});

test("a snoozed lifecycle record shows the real comeback time, not red", () => {
  const r = once(8, "09:00", "s1");
  const s = snap(ringRecord("s1", at(8, 9), { state: "snoozed", snoozeUntil: at(8, 15, 57), chainId: "c2" }));
  const [c] = activeCards([r], [], now, {}, s);
  expect(c).toMatchObject({ ringState: "snoozed", overdue: false, missed: false,
    occurrenceAt: at(8, 9), due: { at: at(8, 15, 57), source: "snooze" }, showCompletion: true });
  expect(nextLine(c, now, clock)).toBe("Rings again 3:57 pm");
});

test("ringing wins over a snoozed record for the same reminder", () => {
  const r = reminder({ id: "m" });
  const s = snap(
    ringRecord("m", at(8, 9), { state: "snoozed", snoozeUntil: at(8, 20), chainId: "c2" }),
    ringRecord("m", at(8, 16)),
  );
  expect(activeCards([r], [], now, {}, s)[0].ringState).toBe("ringing");
});

test("done drops a one-off and advances a repeater past that occurrence", () => {
  const off = once(8, "09:00", "off");
  expect(activeCards([off], [], now, {}, snap(ringRecord("off", at(8, 9), { state: "done" })))).toHaveLength(0);

  const rep = reminder({ id: "rep" }); // daily 09:00
  const before = at(8, 8); // before today's 09:00 ring
  const done = snap(ringRecord("rep", at(8, 9), { state: "done" }));
  const [c] = activeCards([rep], [], before, {}, done);
  expect(c.due.at).toBe(at(9, 9)); // advanced to tomorrow's 09:00
  expect(c.ringState).toBeNull();
});

test("missed reddens a passed one-off with its ring time", () => {
  const r = once(8, "09:00", "miss");
  const s = snap(ringRecord("miss", at(8, 9), { state: "missed" }));
  const [c] = activeCards([r], [], now, {}, s);
  expect(c).toMatchObject({ missed: true, ringState: "missed", overdue: false,
    occurrenceAt: at(8, 9), showCompletion: true });
  expect(nextLine(c, now, clock)).toBe("Missed · 9:00 am");
});

test("a just-passed one-off reads neutral 'Due now' through the grace window, then overdue", () => {
  const soon = card(once(8, "11:50", "soon")); // 10 min before now, no ring record
  expect(soon).toMatchObject({ ringState: "due-now", overdue: false, missed: false, showCompletion: true });
  expect(nextLine(soon, now, clock)).toBe("Due now");

  const late = card(once(8, "11:40", "late")); // 20 min before now → past the 16-min grace
  expect(late).toMatchObject({ ringState: null, overdue: true });
  expect(nextLine(late, now, clock)).toMatch(/^Overdue · /);
});

test("default (empty) snapshot reproduces the old behavior and carries occurrenceAt", () => {
  // A ring for a DIFFERENT reminder must not leak into this one.
  const other = snap(ringRecord("elsewhere", at(8, 9)));
  const [c] = activeCards([reminder()], [], now, {}, other);
  expect(c).toMatchObject({ ringing: false, ringState: null, occurrenceAt: at(9, 9), due: { at: at(9, 9) } });
  // 4-arg call (no snapshot) still works.
  expect(activeCards([once()], [], now, {})[0]).toMatchObject({ overdue: true, occurrenceAt: at(8, 9) });
});

test("nextDisplayDue skips a per-occurrence completion but keeps the day's other ring owed", () => {
  const twice = reminder({ schedule: { type: "grid", days: { kind: "everyday" }, times: { kind: "clock", times: ["09:00", "21:00"] } } });
  const early = at(8, 8);
  // 09:00 completed by scheduledFor: 21:00 is still owed today.
  expect(nextDisplayDue(twice, [completedAt("r", at(8, 9))], early, {})).toEqual({ at: at(8, 21), source: "grid" });
  // Legacy completion (no scheduledFor) keeps the whole-day meaning → advances to tomorrow.
  expect(nextDisplayDue(twice, [completed("r")], early, {})).toEqual({ at: at(9, 9), source: "grid" });
});
