/**
 * The "your feedback was answered" decision, kept pure so the banner has
 * nothing to reason about.
 *
 * The founder sets `respondedAt` on a note the moment they change its status or
 * add a note — that timestamp IS the "attended to" signal. A local watermark
 * (`feedbackSeenRespondedAt` in AsyncStorage) remembers the newest response the
 * user has already been shown. A note whose `respondedAt` is past that watermark
 * is one they have not seen answered yet.
 *
 * A note that was never responded to has no `respondedAt`, so it can never be
 * "unseen" — the banner is about replies, not about the note the user wrote.
 */

export type RespondedItem = {
  respondedAt?: number | null;
  /** "founder" on a message the founder sent unprompted (not a reply). */
  origin?: "founder" | null;
};

/** True when some note has been answered more recently than the watermark. */
export function hasUnseenResponses(items: readonly RespondedItem[], watermark: number): boolean {
  return items.some(
    (item) => typeof item.respondedAt === "number" && item.respondedAt > watermark
  );
}

/**
 * The watermark to store once these notes have been shown: the newest
 * `respondedAt` among them, but never below where the watermark already sits, so
 * a list that happens to contain no responses can never move it backwards.
 */
export function nextWatermark(items: readonly RespondedItem[], current = 0): number {
  let max = current;
  for (const item of items) {
    if (typeof item.respondedAt === "number" && item.respondedAt > max) {
      max = item.respondedAt;
    }
  }
  return max;
}

/**
 * The banner copy for the unseen responses. When every unseen one is a message
 * the founder sent unprompted, the user never wrote in, so the banner must not
 * talk about "your feedback"; any mix with a real reply keeps the reply copy.
 */
export function bannerCopy(
  items: readonly RespondedItem[],
  watermark: number
): { title: string; message: string } {
  const unseen = items.filter(
    (item) => typeof item.respondedAt === "number" && item.respondedAt > watermark
  );
  if (unseen.length > 0 && unseen.every((item) => item.origin === "founder")) {
    return { title: "You have a message from Remi", message: "Tap to read" };
  }
  return { title: "Your feedback was updated", message: "Tap to see" };
}
