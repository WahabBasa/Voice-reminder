import { t } from "./i18n";
import { create } from "zustand";
import type { FeedbackContext } from "./feedbackOutbox";
import type { Reminder } from "./store";
import type { PendingTake } from "./pendingTakes";

/**
 * The feedback UI, driven from anywhere.
 *
 * The composer and the "Your feedback" list are mounted once, high in the tree
 * (components/FeedbackHost, rendered above every screen and sheet). Every
 * entrance — a Settings row, the failed-take card, the edit sheet's "Report a
 * problem" row, the on-open banner — just calls one of these actions. Because
 * the host sits above the edit sheet, opening the composer from inside an edit
 * leaves that sheet mounted and its unsaved edits exactly as they were.
 */

export type FeedbackComposer = {
  /** The entrance's context, merged with device/build fields at submit time. */
  context: FeedbackContext;
  /** The single grey notice line under the box; empty means no line. */
  notice: string;
};

interface FeedbackUiState {
  composer: FeedbackComposer | null;
  listVisible: boolean;
  openComposer: (context: FeedbackContext, notice?: string) => void;
  closeComposer: () => void;
  openList: () => void;
  closeList: () => void;
}

export const useFeedbackUi = create<FeedbackUiState>((set) => ({
  composer: null,
  listVisible: false,
  openComposer: (context, notice = "") => set({ composer: { context, notice } }),
  closeComposer: () => set({ composer: null }),
  openList: () => set({ listVisible: true }),
  closeList: () => set({ listVisible: false }),
}));

/**
 * The `kind: "reminder"` context for one saved reminder — the exact keys the
 * edit sheet's "Report a problem" row has always sent, now shared with the
 * "Not right?" action on a freshly created reminder. Pass the SAVED store row,
 * never in-progress edits. The composer's reminder card reads `reminderId` to
 * show what is being reported. Every key here goes to the server.
 */
export function buildReminderFeedbackContext(reminder: Reminder): FeedbackContext {
  const schedule = JSON.stringify({
    scheduleType: reminder.scheduleType,
    onceAt: reminder.onceAt,
    rrule: reminder.rrule,
    dtstart: reminder.dtstart,
    tzid: reminder.tzid,
    until: reminder.until,
    time: reminder.time,
    date: reminder.date,
    frequency: reminder.frequency,
    days: reminder.days,
    grid: reminder.schedule,
  });
  return {
    kind: "reminder",
    reminderId: reminder.id,
    convexId: reminder.convexId,
    reminderTitle: reminder.title,
    reminderDescription: reminder.description,
    schedule,
    sttSource: (reminder as any).sttSource,
  };
}

/**
 * The `kind: "failed_take"` context for the failed card's "Report a problem".
 * It carries the take's transcript (OLD-137): the card shows it as
 * "Remi heard", the composer shows it again, and the user chooses to send it.
 * Length is not capped here: lib/feedbackContext truncates every string field
 * at send time to keep the context under the server's 8 KB limit.
 */
export function failedTakeFeedbackContext(take: PendingTake): FeedbackContext {
  const transcript = take.transcript?.trim();
  return {
    kind: "failed_take",
    errorKind: take.errorKind,
    serverErrorCode: take.serverErrorCode,
    creationId: take.creationId,
    sttSource: take.sttSource,
    ...(transcript ? { transcript } : {}),
  };
}

/**
 * The toast for a voice take that made exactly one reminder (OLD-134): it names
 * the reminder and carries a "Not right?" action, so a wrong reminder can be
 * reported right where it appears instead of from the bottom of the edit
 * sheet. The tap reports the LIVE row (`resolveLive`) — hydration may have
 * landed the audio since the toast went up — falling back to the created one.
 */
export function reminderCreatedToast(
  reminder: Reminder,
  resolveLive: (id: string) => Reminder | undefined
) {
  return {
    title: t("take.created.title"),
    message: reminder.emoji ? `${reminder.emoji} ${reminder.title}` : reminder.title,
    type: "success" as const,
    durationMs: 5000,
    actionLabel: t("take.created.action"),
    onPress: () =>
      feedbackUi.openReminderComposer(
        resolveLive(reminder.id) ?? reminder,
        t("feedback.notice.reminder")
      ),
  };
}

/** Imperative openers, for call sites that aren't React components. */
export const feedbackUi = {
  openComposer: (context: FeedbackContext, notice?: string) =>
    useFeedbackUi.getState().openComposer(context, notice),
  /** The composer for one saved reminder, with the edit sheet's exact context. */
  openReminderComposer: (reminder: Reminder, notice?: string) =>
    useFeedbackUi.getState().openComposer(buildReminderFeedbackContext(reminder), notice),
  openList: () => useFeedbackUi.getState().openList(),
};
