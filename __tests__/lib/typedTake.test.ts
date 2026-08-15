/**
 * The typed composer's path (OLD-101).
 *
 * A typed sentence is a voice take without the microphone, so the only thing
 * that is genuinely new is what happens between the keyboard and the action:
 * the text is cleaned, the device's own clock is attached, and the result is
 * unpacked into the take items the shared loop (lib/voiceTake) already knows.
 * The action itself arrives injected, so nothing here touches Convex.
 */
import {
  MAX_COMPOSER_CHARS,
  buildTypedTakeArgs,
  canSubmitComposerText,
  deviceClock,
  normalizeComposerText,
  submitTypedTake,
  type TypedTakeArgs,
} from "../../lib/typedTake";

const BASE = {
  deviceId: "device1",
  now: new Date(2026, 7, 15, 9, 5, 3), // local, not UTC — that is the point
  timezone: "Asia/Riyadh",
};

/** An action that records what it was called with and returns a take of one. */
function fakeAction(result: any = { id: "convex1", title: "Water", time: "20:00" }) {
  const calls: TypedTakeArgs[] = [];
  const runAction = jest.fn(async (args: TypedTakeArgs) => {
    calls.push(args);
    return result;
  });
  return { calls, runAction };
}

// ─── text cleaning ──────────────────────────────────────────────────────────

describe("normalizeComposerText", () => {
  it("trims and collapses the whitespace typing leaves behind", () => {
    expect(normalizeComposerText("  take   my\n pills  at 8 ")).toBe("take my pills at 8");
  });

  it("caps the sentence — a reminder is not an essay", () => {
    const long = "a".repeat(MAX_COMPOSER_CHARS + 50);
    expect(normalizeComposerText(long)).toHaveLength(MAX_COMPOSER_CHARS);
  });
});

describe("canSubmitComposerText", () => {
  it("is false for nothing and for whitespace", () => {
    expect(canSubmitComposerText("")).toBe(false);
    expect(canSubmitComposerText("   \n  ")).toBe(false);
  });

  it("is false for a single stray character", () => {
    expect(canSubmitComposerText(" a ")).toBe(false);
  });

  it("is true once there is a sentence to parse", () => {
    expect(canSubmitComposerText("gym at 6")).toBe(true);
  });
});

// ─── device clock ───────────────────────────────────────────────────────────

describe("deviceClock", () => {
  it("sends the LOCAL calendar day and wall clock, zero-padded", () => {
    expect(deviceClock(new Date(2026, 0, 9, 7, 4, 5), "Europe/Berlin")).toEqual({
      deviceLocalDate: "2026-01-09",
      deviceLocalTime: "07:04:05",
      deviceTimezone: "Europe/Berlin",
    });
  });
});

// ─── action args ────────────────────────────────────────────────────────────

describe("buildTypedTakeArgs", () => {
  it("sends the cleaned text with the device's own clock", () => {
    const args = buildTypedTakeArgs({
      ...BASE,
      text: "  drink water   every  hour ",
      traceId: "cmp_1",
    });

    expect(args).toEqual({
      deviceId: "device1",
      text: "drink water every hour",
      traceId: "cmp_1",
      deviceLocalDate: "2026-08-15",
      deviceLocalTime: "09:05:03",
      deviceTimezone: "Asia/Riyadh",
    });
  });

  it("sends nothing that could name or address the user", () => {
    const args = buildTypedTakeArgs({ ...BASE, text: "gym at 6" });
    expect(Object.keys(args).sort()).toEqual([
      "deviceId",
      "deviceLocalDate",
      "deviceLocalTime",
      "deviceTimezone",
      "text",
      "traceId",
    ]);
  });
});

// ─── submit ─────────────────────────────────────────────────────────────────

describe("submitTypedTake", () => {
  it("calls the action once with the built args", async () => {
    const { calls, runAction } = fakeAction();

    await submitTypedTake({ ...BASE, text: "take my pills at 8 and 9", runAction });

    expect(runAction).toHaveBeenCalledTimes(1);
    expect(calls[0].text).toBe("take my pills at 8 and 9");
    expect(calls[0].deviceId).toBe("device1");
    expect(calls[0].deviceLocalDate).toBe("2026-08-15");
  });

  it("unpacks a multi-reminder take the way the voice loop does", async () => {
    const { runAction } = fakeAction({
      id: "a",
      title: "Medicine",
      reminders: [
        { id: "a", title: "Medicine" },
        { id: "b", title: "Call mom" },
      ],
      reminderCount: 2,
    });

    const { items, result } = await submitTypedTake({ ...BASE, text: "pills at 8, call mom at 6", runAction });

    expect(items.map((r) => r.title)).toEqual(["Medicine", "Call mom"]);
    expect(result.reminderCount).toBe(2);
  });

  it("treats a legacy single-reminder result as a take of one", async () => {
    const { runAction } = fakeAction({ id: "solo", title: "Trash" });

    const { items } = await submitTypedTake({ ...BASE, text: "take the trash out at 7", runAction });

    expect(items).toHaveLength(1);
    expect(items[0].title).toBe("Trash");
  });

  it("refuses to spend a round trip on an empty field", async () => {
    const { runAction } = fakeAction();

    await expect(submitTypedTake({ ...BASE, text: "   ", runAction })).rejects.toThrow(
      "Composer text is empty"
    );
    expect(runAction).not.toHaveBeenCalled();
  });

  it("lets an action failure through — the composer keeps the text on screen", async () => {
    const runAction = jest.fn(async () => {
      throw new Error("network down");
    });

    await expect(
      submitTypedTake({ ...BASE, text: "gym at 6", runAction })
    ).rejects.toThrow("network down");
  });
});
