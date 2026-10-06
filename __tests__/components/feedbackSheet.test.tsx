import React from "react";
import FeedbackSheet from "../../components/FeedbackSheet";
import ReminderContextCard from "../../components/ReminderContextCard";

/**
 * OLD-134: the composer shows which reminder is being reported — a card above
 * the box for `kind: "reminder"` — and nothing extra for any other entrance.
 * The card is display-only, so it is stubbed here; what matters is when it
 * renders and which context it is handed.
 */

// Render the composer as a plain function call, like the other component
// tests: hooks reduced to their initial values, native sheets to passthroughs.
jest.mock("react", () => ({
  ...jest.requireActual("react"),
  useState: (value: unknown) => [value, jest.fn()],
  useCallback: (fn: unknown) => fn,
  useMemo: (fn: () => unknown) => fn(),
  useRef: (value: unknown) => ({ current: value }),
}));
jest.mock("@gorhom/bottom-sheet", () => ({
  __esModule: true,
  default: "BottomSheet",
  BottomSheetBackdrop: "BottomSheetBackdrop",
  BottomSheetView: "BottomSheetView",
  BottomSheetScrollView: "BottomSheetScrollView",
  BottomSheetTextInput: "BottomSheetTextInput",
  TouchableOpacity: "TouchableOpacity",
}));
jest.mock("convex/react", () => ({ useMutation: () => jest.fn() }));
jest.mock("../../components/ToastProvider", () => ({ useToast: () => ({ show: jest.fn() }) }));
jest.mock("../../lib/feedbackContext", () => ({ buildFeedbackContext: (base: object) => base }));
jest.mock("../../lib/deviceId", () => ({ getDeviceId: async () => "device-1" }));
jest.mock("../../components/ReminderContextCard", () => ({
  __esModule: true,
  default: function ReminderContextCard() {
    return null;
  },
}));

type Element = React.ReactElement<{ children?: React.ReactNode; context?: unknown }>;

function descendants(node: React.ReactNode): Element[] {
  if (Array.isArray(node)) return node.flatMap(descendants);
  if (!React.isValidElement(node)) return [];
  const element = node as Element;
  return [element, ...React.Children.toArray(element.props.children).flatMap(descendants)];
}

function render(context: Record<string, unknown> | null) {
  const nodes = descendants(FeedbackSheet({ visible: true, context, notice: "", onClose: () => {} }));
  const cards = nodes.filter((node) => node.type === ReminderContextCard);
  const strings = nodes
    .map((node) => node.props.children)
    .filter((child): child is string => typeof child === "string");
  return { cards, strings };
}

test("a reminder report shows the reminder card, handed the exact context", () => {
  const context = { kind: "reminder", reminderId: "r-1", reminderTitle: "Take vitamins" };
  const { cards, strings } = render(context);
  expect(cards).toHaveLength(1);
  expect(cards[0].props.context).toBe(context);
  // Still one step: the box and Send are right there.
  expect(strings).toEqual(expect.arrayContaining(["Send feedback", "Send"]));
});

test.each([
  [{ kind: "settings" }],
  [{ kind: "failed_take", creationId: "c-1" }],
  [{ kind: "reminder_occurrence", reminderId: "r-1" }],
  [null],
])("no card for %j", (context) => {
  expect(render(context).cards).toHaveLength(0);
});

test("a failed take gets the small 'Failed recording' header, others don't", () => {
  expect(render({ kind: "failed_take", creationId: "c-1" }).strings).toContain("Failed recording");
  expect(render({ kind: "settings" }).strings).not.toContain("Failed recording");
  expect(render({ kind: "reminder", reminderId: "r-1" }).strings).not.toContain("Failed recording");
});

test("a failed take shows what Remi heard under its header (OLD-137)", () => {
  const strings = render({
    kind: "failed_take",
    creationId: "c-1",
    transcript: "Thank you for watching.",
  }).strings;
  expect(strings).toContain("Failed recording");
  expect(strings).toContain('Remi heard: "Thank you for watching."');
});

test("no heard line without a transcript, or outside a failed take", () => {
  const heard = (s: string) => s.startsWith("Remi heard");
  expect(render({ kind: "failed_take", creationId: "c-1" }).strings.some(heard)).toBe(false);
  expect(render({ kind: "failed_take", transcript: "   " }).strings.some(heard)).toBe(false);
  expect(render({ kind: "settings", transcript: "call mom" }).strings.some(heard)).toBe(false);
});
