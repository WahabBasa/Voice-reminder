import React from "react";
import FeedbackList, { mergeFeedback, type ServerFeedback } from "../../components/FeedbackList";

/**
 * A message the founder sent unprompted (`origin: "founder"`) reads as a message
 * from Remi: no status chip implying the user reported something, the message
 * itself as the body. The user's own reports keep the status chip.
 */

jest.mock("react", () => ({
  ...jest.requireActual("react"),
  useCallback: (fn: unknown) => fn,
  useMemo: (fn: () => unknown) => fn(),
  useSyncExternalStore: (_sub: unknown, get: () => unknown) => get(),
}));
jest.mock("@gorhom/bottom-sheet", () => ({
  __esModule: true,
  default: "BottomSheet",
  BottomSheetBackdrop: "BottomSheetBackdrop",
  BottomSheetScrollView: "BottomSheetScrollView",
}));
jest.mock("../../lib/feedbackOutbox", () => ({
  getFeedbackOutboxSnapshot: () => [],
  subscribeFeedbackOutbox: () => () => {},
}));

type Element = React.ReactElement<{ children?: React.ReactNode }>;

function descendants(node: React.ReactNode): Element[] {
  if (Array.isArray(node)) return node.flatMap(descendants);
  if (!React.isValidElement(node)) return [];
  const element = node as Element;
  return [element, ...React.Children.toArray(element.props.children).flatMap(descendants)];
}

function strings(items: ServerFeedback[]): string[] {
  const nodes = descendants(FeedbackList({ visible: true, items, onClose: () => {} }));
  return nodes
    .map((node) => node.props.children)
    .filter((child): child is string => typeof child === "string");
}

const founderRow: ServerFeedback = {
  id: "f1",
  clientId: "founder-1",
  text: "Your recording didn't go through",
  createdAt: 2000,
  status: "fixed",
  note: "We fixed it, please try again",
  respondedAt: 2000,
  updatedAt: 2000,
  origin: "founder",
};

const ownRow: ServerFeedback = {
  id: "r1",
  clientId: "mine",
  text: "the app crashed",
  createdAt: 1000,
  status: "fixed",
  note: "Fixed in the next update",
  respondedAt: 1500,
  updatedAt: 1500,
};

test("mergeFeedback flags founder rows and leaves the device's own reports alone", () => {
  const rows = mergeFeedback(
    [{ clientId: "queued", text: "pending note", createdAt: 3000, state: "queued" }],
    [founderRow, ownRow]
  );
  expect(rows.map((r) => [r.key, !!r.fromRemi])).toEqual([
    ["queued", false],
    ["founder-1", true],
    ["mine", false],
  ]);
});

test("a founder message renders as a message from Remi, without a status chip", () => {
  const shown = strings([founderRow]);
  expect(shown).toContain("Message from Remi");
  expect(shown).toContain("Your recording didn't go through");
  expect(shown).toContain("We fixed it, please try again");
  expect(shown).not.toContain("Fixed");
});

test("the device's own report keeps its status chip", () => {
  const shown = strings([ownRow]);
  expect(shown).toContain("Fixed");
  expect(shown).toContain("the app crashed");
  expect(shown).not.toContain("Message from Remi");
});
