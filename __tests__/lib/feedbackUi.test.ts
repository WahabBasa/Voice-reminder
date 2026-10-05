import {
  buildReminderFeedbackContext,
  feedbackUi,
  reminderCreatedToast,
  useFeedbackUi,
} from "../../lib/feedbackUi";
import { reminderCardContent } from "../../lib/feedbackReminderCard";
import type { Reminder } from "../../lib/store";

/**
 * OLD-134: the reminder report context is built in one place and shared by the
 * edit sheet's "Report a problem" row and the new "Not right?" toast action.
 * The server contract must not move: same keys, same values as before.
 */

const grid = {
  days: { kind: "weekdays", days: ["mon", "fri"] },
  times: { kind: "clock", times: ["08:00"] },
} as unknown as Reminder["schedule"];

function makeReminder(overrides: Partial<Reminder> = {}): Reminder {
  return {
    id: "r-1",
    convexId: "cx-1",
    title: "Take vitamins",
    description: "Time to take your vitamins.",
    time: "08:00",
    frequency: "weekly",
    days: ["mon", "fri"],
    schedule: grid,
    emoji: "💊",
    createdAt: "2026-10-05T08:00:00.000Z",
    scheduleType: "grid",
    tzid: "Europe/London",
    ...overrides,
  } as Reminder;
}

afterEach(() => {
  useFeedbackUi.setState({ composer: null, listVisible: false });
});

describe("buildReminderFeedbackContext", () => {
  test("sends exactly the keys the edit sheet always sent", () => {
    const context = buildReminderFeedbackContext(makeReminder({ sttSource: "device" } as any));
    expect(Object.keys(context).sort()).toEqual(
      [
        "convexId",
        "kind",
        "reminderDescription",
        "reminderId",
        "reminderTitle",
        "schedule",
        "sttSource",
      ].sort()
    );
    expect(context).toMatchObject({
      kind: "reminder",
      reminderId: "r-1",
      convexId: "cx-1",
      reminderTitle: "Take vitamins",
      reminderDescription: "Time to take your vitamins.",
      sttSource: "device",
    });
  });

  test("schedule is the same stringified snapshot, grid included", () => {
    const reminder = makeReminder({ onceAt: 123, date: "2026-10-06" });
    const schedule = JSON.parse(buildReminderFeedbackContext(reminder).schedule as string);
    expect(Object.keys(schedule).sort()).toEqual(
      [
        "date",
        "days",
        "frequency",
        "grid",
        "onceAt",
        "scheduleType",
        "time",
        "tzid",
      ].sort() // undefined fields (rrule, dtstart, until) drop out of JSON, as before
    );
    expect(schedule.grid).toEqual(grid);
    expect(schedule.onceAt).toBe(123);
  });
});

describe("reminderCreatedToast (the \"Not right?\" action)", () => {
  test("names the reminder and labels the action", () => {
    const toast = reminderCreatedToast(makeReminder(), () => undefined);
    expect(toast).toMatchObject({
      title: "Reminder created",
      message: "💊 Take vitamins",
      type: "success",
      actionLabel: "Not right?",
    });
    expect(reminderCreatedToast(makeReminder({ emoji: undefined }), () => undefined).message).toBe(
      "Take vitamins"
    );
  });

  test("tapping it opens the composer with the new reminder's context", () => {
    const created = makeReminder();
    const live = makeReminder({ audioUrl: "https://example.test/a.mp3", title: "Take vitamins D" });
    const resolve = jest.fn((id: string) => (id === "r-1" ? live : undefined));

    reminderCreatedToast(created, resolve).onPress();

    expect(resolve).toHaveBeenCalledWith("r-1");
    const composer = useFeedbackUi.getState().composer;
    expect(composer?.context).toEqual(buildReminderFeedbackContext(live));
    expect(composer?.notice).toBe("Includes this reminder's details.");
  });

  test("falls back to the created row when the live one is gone", () => {
    const created = makeReminder();
    reminderCreatedToast(created, () => undefined).onPress();
    expect(useFeedbackUi.getState().composer?.context).toEqual(buildReminderFeedbackContext(created));
  });

  test("openReminderComposer is the same context the edit sheet opens with", () => {
    const reminder = makeReminder();
    feedbackUi.openReminderComposer(reminder, "note");
    expect(useFeedbackUi.getState().composer).toEqual({
      context: buildReminderFeedbackContext(reminder),
      notice: "note",
    });
  });
});

describe("reminderCardContent (composer card, display-only)", () => {
  test("only a reminder report gets a card", () => {
    expect(reminderCardContent(null, undefined)).toBeNull();
    expect(reminderCardContent({ kind: "settings" }, undefined)).toBeNull();
    expect(reminderCardContent({ kind: "failed_take", creationId: "c" }, undefined)).toBeNull();
  });

  test("title, emoji, spoken line and the Today card's pattern line", () => {
    const reminder = makeReminder();
    const content = reminderCardContent(buildReminderFeedbackContext(reminder), reminder);
    expect(content).toEqual({
      reminderId: "r-1",
      title: "Take vitamins",
      emoji: "💊",
      spoken: "Time to take your vitamins.",
      when: expect.stringContaining("Every Mon, Fri"),
    });
    expect(content?.when).toMatch(/8:00/);
  });

  test("a reminder no longer in the store still shows what was sent", () => {
    const context = buildReminderFeedbackContext(makeReminder());
    expect(reminderCardContent(context, undefined)).toEqual({
      reminderId: "r-1",
      title: "Take vitamins",
      emoji: undefined,
      spoken: "Time to take your vitamins.",
      when: "",
    });
  });
});
