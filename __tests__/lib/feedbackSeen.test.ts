/**
 * The "your feedback was answered" decision.
 *
 * The founder stamps `respondedAt` when they reply; the local watermark
 * remembers the newest reply the user has already been shown. Unseen means a
 * reply newer than the watermark; the watermark only ever moves forward; and a
 * note that was never answered can never be unseen.
 */
import {
  bannerCopy,
  hasUnseenResponses,
  nextWatermark,
  type RespondedItem,
} from "../../lib/feedbackSeen";

describe("hasUnseenResponses", () => {
  it("is true when a response is newer than the watermark", () => {
    const items: RespondedItem[] = [{ respondedAt: 50 }, { respondedAt: 150 }];
    expect(hasUnseenResponses(items, 100)).toBe(true);
  });

  it("is false when every response is at or below the watermark", () => {
    const items: RespondedItem[] = [{ respondedAt: 100 }, { respondedAt: 30 }];
    expect(hasUnseenResponses(items, 100)).toBe(false);
  });

  it("never counts a note that was never responded to", () => {
    const items: RespondedItem[] = [{}, { respondedAt: null }, { respondedAt: undefined }];
    expect(hasUnseenResponses(items, 0)).toBe(false);
  });

  it("is false for an empty list", () => {
    expect(hasUnseenResponses([], 0)).toBe(false);
  });
});

describe("nextWatermark", () => {
  it("advances to the newest response present", () => {
    const items: RespondedItem[] = [{ respondedAt: 10 }, { respondedAt: 90 }, { respondedAt: 40 }];
    expect(nextWatermark(items)).toBe(90);
  });

  it("never moves backwards below the current watermark", () => {
    const items: RespondedItem[] = [{ respondedAt: 10 }];
    expect(nextWatermark(items, 100)).toBe(100);
  });

  it("holds at the current watermark when nothing is answered", () => {
    const items: RespondedItem[] = [{}, { respondedAt: null }];
    expect(nextWatermark(items, 250)).toBe(250);
    expect(nextWatermark(items)).toBe(0);
  });
});

describe("bannerCopy", () => {
  it("uses the message copy when every unseen response is from the founder", () => {
    const items: RespondedItem[] = [
      { respondedAt: 200, origin: "founder" },
      { respondedAt: 50 }, // a reply already seen does not count
    ];
    expect(bannerCopy(items, 100)).toEqual({
      title: "You have a message from Remi",
      message: "Tap to read",
    });
  });

  it("keeps the reply copy when an unseen reply is mixed in", () => {
    const items: RespondedItem[] = [
      { respondedAt: 200, origin: "founder" },
      { respondedAt: 150 },
    ];
    expect(bannerCopy(items, 100)).toEqual({
      title: "Your feedback was updated",
      message: "Tap to see",
    });
  });

  it("keeps the reply copy for plain replies and when nothing is unseen", () => {
    expect(bannerCopy([{ respondedAt: 150, origin: null }], 100).title).toBe(
      "Your feedback was updated"
    );
    expect(bannerCopy([{ respondedAt: 50, origin: "founder" }], 100).title).toBe(
      "Your feedback was updated"
    );
  });
});
