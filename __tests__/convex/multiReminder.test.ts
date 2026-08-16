/**
 * One take, several reminders (OLD-93).
 *
 * The seam under test is planRemindersFromRawParse: raw model response in, one
 * plan per reminder out, with no network and no Convex context in reach. The
 * "mock model response" is just the JSON string the parse call would have
 * returned — every envelope the live model has actually produced is covered.
 */
import { planRemindersFromRawParse } from "../../convex/actions";
import { MAX_REMINDERS_PER_TAKE } from "../../convex/helpers";

const CONTEXT = { transcript: "", currentTime: "14:00:00" };

const withTranscript = (transcript: string) => ({ ...CONTEXT, transcript });

const reminder = (over: Record<string, unknown> = {}) => ({
  title: "Water",
  description: "Your water glass is still full.",
  time: "20:00",
  frequency: "once",
  ...over,
});

describe("planRemindersFromRawParse — envelopes", () => {
  it("plans one reminder per entry of a {reminders:[...]} response", () => {
    const raw = JSON.stringify({
      reminders: [
        reminder({ title: "Medicine", time: "09:00", frequency: "daily" }),
        reminder({ title: "Call mom", time: "14:00", frequency: "once" }),
      ],
    });

    const plans = planRemindersFromRawParse(raw, withTranscript(
      "Remind me to take my medicine at 9am and to call my mom at 2pm"
    ));

    expect(plans).toHaveLength(2);
    expect(plans.map((p) => p.title)).toEqual(["Medicine", "Call mom"]);
    expect(plans.map((p) => p.time)).toEqual(["09:00", "14:00"]);
    expect(plans[0].scheduleType).toBe("rrule");
    expect(plans[0].rrule).toBe("FREQ=DAILY;BYHOUR=9;BYMINUTE=0");
    expect(plans[1].scheduleType).toBe("once");
    expect(plans[1].onceAt).toBeGreaterThan(0);
  });

  it("plans a bare top-level array — what the model returns unprompted", () => {
    const raw = JSON.stringify([
      reminder({ title: "Water", time: "20:00" }),
      reminder({ title: "Trash", time: "10:00", date: "2026-08-15" }),
    ]);

    const plans = planRemindersFromRawParse(raw, CONTEXT);

    expect(plans.map((p) => p.title)).toEqual(["Water", "Trash"]);
    expect(plans[1].date).toBe("2026-08-15");
  });

  it("plans a bare single object exactly as it did before multi takes", () => {
    const raw = JSON.stringify(
      reminder({
        title: "Water",
        description: "Your water glass is still full.",
        emoji: "💧",
        preReminderMinutes: 10,
        preDescription: "Your water break is coming up in ten minutes.",
        urgency: "notice",
      })
    );

    const plans = planRemindersFromRawParse(raw, CONTEXT);

    expect(plans).toHaveLength(1);
    expect(plans[0]).toMatchObject({
      title: "Water",
      description: "Your water glass is still full.",
      time: "20:00",
      frequency: "once",
      emoji: "💧",
      preReminderMinutes: 10,
      preTtsText: "Your water break is coming up in ten minutes.",
      urgency: "notice",
      persistent: false,
    });
  });

  it("keeps the usable entries when the model mixes junk into the array", () => {
    const raw = JSON.stringify({
      reminders: [
        "Take medicine at 9",
        reminder({ title: "Medicine", time: "09:00" }),
        null,
        7,
        ["Gym", "18:00"],
        reminder({ title: "Gym", time: "18:00" }),
      ],
    });

    const plans = planRemindersFromRawParse(raw, CONTEXT);

    expect(plans.map((p) => p.title)).toEqual(["Medicine", "Gym"]);
  });

  it("throws on an empty take, the same failure an unparseable response gives", () => {
    expect(() => planRemindersFromRawParse(`{"reminders": []}`, CONTEXT)).toThrow(
      /no reminder object/
    );
    expect(() => planRemindersFromRawParse("[]", CONTEXT)).toThrow(/no reminder object/);
    expect(() => planRemindersFromRawParse("null", CONTEXT)).toThrow(/no reminder object/);
    expect(() => planRemindersFromRawParse("not json at all", CONTEXT)).toThrow();
  });

  it("stops at the per-take ceiling", () => {
    const raw = JSON.stringify({
      reminders: Array.from({ length: MAX_REMINDERS_PER_TAKE + 2 }, (_, i) =>
        reminder({ title: `Task ${i}` })
      ),
    });

    expect(planRemindersFromRawParse(raw, CONTEXT)).toHaveLength(MAX_REMINDERS_PER_TAKE);
  });
});

describe("planRemindersFromRawParse — per-item post-processing", () => {
  it("guards each spoken line on its own, falling back to that item's title", () => {
    const raw = JSON.stringify({
      reminders: [
        reminder({ title: "Medicine", description: "It is time to take your medicine." }),
        reminder({ title: "Call mom", description: "Your mother is waiting for a call." }),
      ],
    });

    const plans = planRemindersFromRawParse(raw, CONTEXT);

    // Banned opener → this item's own title stands in; the other line is untouched.
    expect(plans[0].description).toBe("Medicine");
    expect(plans[1].description).toBe("Your mother is waiting for a call.");
  });

  // The catch feature used to prepend these at TTS time, so the model was free
  // to write them too. Nothing prepends anything now (OLD-95) and a lead-in is
  // as dead as a clock announcement — a stored line that opens with one loses
  // its phrasing to the title, exactly like 'It is time' does above.
  it("drops a conversational lead-in the same way it drops a clock opener", () => {
    const raw = JSON.stringify({
      reminders: [
        reminder({ title: "Pills", description: "Heads up — your pills are waiting." }),
        reminder({ title: "Water", description: "By the way, your glass is still full." }),
        reminder({ title: "Game", description: "Your son's game is right now." }),
      ],
    });

    const plans = planRemindersFromRawParse(raw, CONTEXT);

    expect(plans[0].description).toBe("Pills");
    expect(plans[1].description).toBe("Water");
    // A canon line survives untouched.
    expect(plans[2].description).toBe("Your son's game is right now.");
  });

  it("coerces frequency and days per item", () => {
    const raw = JSON.stringify({
      reminders: [
        reminder({ title: "Water", frequency: "daily", time: "20:00" }),
        reminder({ title: "Gym", frequency: "weekly", days: ["Monday"], time: "18:00" }),
      ],
    });

    const plans = planRemindersFromRawParse(raw, CONTEXT);

    expect(plans[0].frequency).toBe("daily");
    expect(plans[0].days).toBeUndefined();
    expect(plans[1].frequency).toBe("custom");
    expect(plans[1].days).toEqual(["mon"]);
    expect(plans[1].rrule).toBe("FREQ=WEEKLY;BYDAY=MO;BYHOUR=18;BYMINUTE=0");
  });

  it("normalizes each interval separately and keeps warnings on their own item", () => {
    const raw = JSON.stringify({
      reminders: [
        reminder({ title: "Stretch", frequency: "interval", intervalMinutes: 2 }),
        reminder({ title: "Pills", frequency: "interval", intervalHours: 8 }),
      ],
    });

    const plans = planRemindersFromRawParse(raw, CONTEXT);

    expect(plans[0].intervalMs).toBe(5 * 60 * 1000);
    expect(plans[0].parseWarnings).toEqual([
      expect.stringContaining("Minimum interval is 5 minutes"),
    ]);
    expect(plans[1].intervalMs).toBe(8 * 60 * 60 * 1000);
    // The clamp warning belongs to the item that was clamped, not to the take.
    expect(plans[1].parseWarnings).toEqual([]);
    expect(plans[0].scheduleType).toBe("interval");
    expect(plans[1].anchorAt).toBeGreaterThan(0);
  });

  it("gives each item its own replay tier and variants", () => {
    const raw = JSON.stringify({
      reminders: [
        reminder({
          title: "Pills",
          description: "Your evening pills are still on the counter.",
          urgency: "urgent",
          persistent: true,
          variants: ["The pills are still waiting.", "You have not taken the pills yet."],
        }),
        reminder({ title: "Water", variants: ["Your glass is still full."] }),
      ],
    });

    const plans = planRemindersFromRawParse(raw, CONTEXT);

    expect(plans[0].urgency).toBe("urgent");
    expect(plans[0].persistent).toBe(true);
    expect(plans[0].variants).toHaveLength(2);
    expect(plans[1].urgency).toBe("routine");
    expect(plans[1].persistent).toBe(false);
    expect(plans[1].variants).toEqual(["Your glass is still full."]);
  });

  it("falls back to the current time per item when one has no time", () => {
    const raw = JSON.stringify({
      reminders: [reminder({ title: "Water", time: undefined }), reminder({ title: "Gym" })],
    });

    const plans = planRemindersFromRawParse(raw, CONTEXT);

    expect(plans[0].time).toBe("14:00");
    expect(plans[1].time).toBe("20:00");
  });

  it("does not let one item's 'weekdays' drag its siblings (OLD-97)", () => {
    // The transcript is the whole take, so transcript-wide rules used to rewrite
    // every reminder in it: 'weekdays' anywhere pulled all of them to custom
    // MO-FR. Each item is now coerced from its OWN fields.
    const raw = JSON.stringify({
      reminders: [
        reminder({
          title: "Standup",
          frequency: "custom",
          days: ["mon", "tue", "wed", "thu", "fri"],
          time: "09:00",
        }),
        reminder({ title: "Water", frequency: "daily", time: "20:00" }),
      ],
    });

    const plans = planRemindersFromRawParse(
      raw,
      withTranscript("Remind me about standup on weekdays at 9 and to drink water at 8pm")
    );

    expect(plans.map((p) => p.frequency)).toEqual(["custom", "daily"]);
    expect(plans[0].days).toEqual(["mon", "tue", "wed", "thu", "fri"]);
    // The sibling keeps the every-day schedule the model gave it.
    expect(plans[1].days).toBeUndefined();
    expect(plans[1].schedule.days).toEqual({ kind: "everyday" });
  });

  it("still reads the transcript when the take is one reminder", () => {
    // A take of one is the case where the transcript is unambiguously about
    // that reminder, so the hint rules stay on there.
    const raw = JSON.stringify(reminder({ title: "Standup", frequency: "daily", time: "09:00" }));

    const plans = planRemindersFromRawParse(
      raw,
      withTranscript("Remind me about standup on weekdays at 9")
    );

    expect(plans[0].frequency).toBe("custom");
    expect(plans[0].days).toEqual(["mon", "tue", "wed", "thu", "fri"]);
  });
});

// ─── The days × times grid (OLD-97) ─────────────────────────────────────────

describe("planRemindersFromRawParse — schedule grid", () => {
  it('makes "Thursday 8 and 9" ONE reminder with two rings', () => {
    const raw = JSON.stringify({
      reminders: [
        reminder({
          title: "Pills",
          frequency: "custom",
          days: ["thu"],
          time: "08:00",
          times: ["08:00", "21:00"],
        }),
      ],
    });

    const plans = planRemindersFromRawParse(
      raw,
      withTranscript("Remind me to take my pills on Thursday at 8 and 9")
    );

    expect(plans).toHaveLength(1);
    expect(plans[0].schedule).toEqual({
      type: "grid",
      days: { kind: "weekdays", days: ["thu"] },
      times: { kind: "clock", times: ["08:00", "21:00"] },
    });
    expect(plans[0].times).toEqual(["08:00", "21:00"]);
    // The legacy projection keeps the FIRST ring, so pre-grid readers still work.
    expect(plans[0].time).toBe("08:00");
    expect(plans[0].frequency).toBe("custom");
  });

  it("sorts and dedupes the times the model listed", () => {
    const raw = JSON.stringify(
      reminder({ frequency: "daily", times: ["21:00", "8:00", "08:00", "nonsense"] })
    );

    const plans = planRemindersFromRawParse(raw, CONTEXT);

    expect(plans[0].schedule.times).toEqual({ kind: "clock", times: ["08:00", "21:00"] });
  });

  it("gives an interval a waking window, defaulting to 08:00–22:00", () => {
    const raw = JSON.stringify({
      reminders: [
        reminder({ title: "Stretch", frequency: "interval", intervalMinutes: 90 }),
        reminder({
          title: "Water",
          frequency: "interval",
          intervalHours: 1,
          windowStart: "9:00",
          windowEnd: "17:00",
        }),
      ],
    });

    const plans = planRemindersFromRawParse(raw, CONTEXT);

    expect(plans[0].schedule.times).toEqual({
      kind: "interval",
      everyMinutes: 90,
      windowStart: "08:00",
      windowEnd: "22:00",
    });
    expect(plans[1].schedule.times).toEqual({
      kind: "interval",
      everyMinutes: 60,
      windowStart: "09:00",
      windowEnd: "17:00",
    });
    // Interval reminders ring every day of the week unless days were named.
    expect(plans[0].schedule.days).toEqual({ kind: "everyday" });
  });

  it("expresses every-N-days on the days axis", () => {
    const raw = JSON.stringify(
      reminder({ title: "Plants", frequency: "everyNDays", everyNDays: 3, time: "07:30" })
    );

    const plans = planRemindersFromRawParse(raw, CONTEXT);

    const days = plans[0].schedule.days;
    expect(days.kind).toBe("everyNDays");
    expect(days).toMatchObject({ interval: 3 });
    // Legacy projection: the pre-grid scheduler only knows daily + intervalDays.
    expect(plans[0].frequency).toBe("daily");
    expect(plans[0].intervalDays).toBe(3);
  });

  it("pins a one-off to a single date", () => {
    const raw = JSON.stringify(
      reminder({ title: "Trash", frequency: "once", date: "2026-08-20", time: "10:00" })
    );

    const plans = planRemindersFromRawParse(raw, CONTEXT);

    expect(plans[0].schedule.days).toEqual({ kind: "date", date: "2026-08-20" });
    expect(plans[0].date).toBe("2026-08-20");
  });

  it("dates a one-off the model left undated", () => {
    const raw = JSON.stringify(reminder({ title: "Trash", frequency: "once", time: "10:00" }));

    const plans = planRemindersFromRawParse(raw, CONTEXT);

    const days = plans[0].schedule.days;
    expect(days.kind).toBe("date");
    expect(plans[0].date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(plans[0].onceAt).toBeGreaterThan(0);
  });

  it("carries an until bound onto the grid", () => {
    const raw = JSON.stringify(
      reminder({ frequency: "daily", time: "08:00", until: "2026-09-01" })
    );

    const plans = planRemindersFromRawParse(raw, CONTEXT);

    expect(plans[0].schedule.until).toBe(new Date(2026, 8, 1, 23, 59, 59, 999).getTime());
    expect(plans[0].until).toBe(plans[0].schedule.until);
  });

  it("keeps an unusable until out of the grid and says so", () => {
    const raw = JSON.stringify(reminder({ frequency: "daily", until: "whenever" }));

    const plans = planRemindersFromRawParse(raw, CONTEXT);

    expect(plans[0].schedule.until).toBeUndefined();
    expect(plans[0].parseWarnings).toEqual([expect.stringContaining("Invalid until date")]);
  });
});
