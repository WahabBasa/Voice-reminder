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

  it("applies transcript-wide coercion to every item (the transcript is one take)", () => {
    // Known imprecision: coerceFrequency reads the whole transcript, so a
    // 'weekdays' anywhere in the take pulls every item to custom MO-FR.
    const raw = JSON.stringify({
      reminders: [
        reminder({ title: "Standup", frequency: "daily", time: "09:00" }),
        reminder({ title: "Water", frequency: "daily", time: "20:00" }),
      ],
    });

    const plans = planRemindersFromRawParse(
      raw,
      withTranscript("Remind me about standup on weekdays at 9 and to drink water at 8pm")
    );

    expect(plans.map((p) => p.frequency)).toEqual(["custom", "custom"]);
    expect(plans[0].days).toEqual(["mon", "tue", "wed", "thu", "fri"]);
  });
});
