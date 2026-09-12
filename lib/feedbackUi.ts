import { create } from "zustand";
import type { FeedbackContext } from "./feedbackOutbox";

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

/** Imperative openers, for call sites that aren't React components. */
export const feedbackUi = {
  openComposer: (context: FeedbackContext, notice?: string) =>
    useFeedbackUi.getState().openComposer(context, notice),
  openList: () => useFeedbackUi.getState().openList(),
};
