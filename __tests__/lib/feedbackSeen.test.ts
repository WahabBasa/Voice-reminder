/**
 * The "your feedback was answered" decision.
 *
 * The founder stamps `respondedAt` when they reply; the local watermark
 * remembers the newest reply the user has already been shown. Unseen means a
 * reply newer than the watermark; the watermark only ever moves forward; and a
 * note that was never answered can never be unseen.
 */
import { hasUnseenResponses, nextWatermark, type RespondedItem } from "../../lib/feedbackSeen";

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
