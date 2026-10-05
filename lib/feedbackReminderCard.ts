import type { FeedbackContext } from "./feedbackOutbox";
import type { Reminder } from "./store";
import { patternLine } from "./remindersMembership";

/**
 * What the feedback composer's reminder card shows (OLD-134): which reminder
 * is being reported, in the words the user already knows it by.
 *
 * Display-only. The context that goes to the server is untouched; this only
 * reads it. The title and spoken line come from the context first — that is
 * the snapshot being sent — and fall back to the live store row. The emoji and
 * the "when" line need the row, and the "when" line is the same `patternLine`
 * the Today card prints under the title, so the two never disagree.
 */
export type ReminderCardContent = {
  reminderId: string | null;
  title: string;
  emoji?: string;
  /** What Remi says when it rings (the reminder's description). */
  spoken: string;
  /** "Every Mon, Fri · 8:00 am", "Once · Oct 6 · 9:50 am"; "" when unknown. */
  when: string;
};

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function reminderCardContent(
  context: FeedbackContext | null | undefined,
  reminder: Reminder | undefined,
  nowMs: number = Date.now()
): ReminderCardContent | null {
  if (!context || context.kind !== "reminder") return null;

  let when = "";
  if (reminder) {
    try {
      when = patternLine(reminder, {}, nowMs);
    } catch {
      // A malformed schedule leaves the line out rather than breaking the composer.
      when = "";
    }
  }

  return {
    reminderId: text(context.reminderId) || null,
    title: text(context.reminderTitle) || text(reminder?.title) || "Reminder",
    emoji: reminder?.emoji || undefined,
    spoken: text(context.reminderDescription) || text(reminder?.description),
    when,
  };
}
