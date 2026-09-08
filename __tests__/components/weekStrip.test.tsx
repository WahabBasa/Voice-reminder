import React from "react";
import { View, StyleSheet } from "react-native";
import WeekStrip from "../../components/days/WeekStrip";
import { colors } from "../../lib/theme";

jest.mock("../../lib/fonts", () => ({ FONT_DISPLAY: "Fraunces" }));

// Match the suite's native-boundary mocks; keep React element creation real.
jest.mock("react-native-reanimated", () => ({
  __esModule: true,
  default: { View: require("react-native").View },
  useSharedValue: (value: number) => ({ value }),
  useAnimatedStyle: (fn: () => unknown) => fn(),
  withSpring: (value: number) => value,
}));
jest.mock("react", () => ({
  ...jest.requireActual("react"),
  useMemo: (fn: () => unknown) => fn(),
  useRef: (value: unknown) => ({ current: value }),
  useEffect: jest.fn(),
}));

type Element = React.ReactElement<{ children?: React.ReactNode; testID?: string; style?: object }>;
function descendants(node: React.ReactNode): Element[] {
  if (!React.isValidElement(node)) return [];
  const element = node as Element;
  return [element, ...React.Children.toArray(element.props.children).flatMap(descendants)];
}
function render(selectedDate: string, overdueDates = new Set<string>()) {
  return descendants(WeekStrip({ selectedDate, todayDate: "2026-09-08", overdueDates, onSelectDate: jest.fn() }));
}
test("today accent mark remains while another date is selected; both marks coexist", () => {
  for (const selected of ["2026-09-09", "2026-09-08"]) {
    const nodes = render(selected);
    const today = nodes.find((node) => node.props.testID === "today-mark:2026-09-08")!;
    const selection = nodes.find((node) => node.props.testID === `selected-mark:${selected}`)!;
    expect(today.type).toBe(View);
    expect(StyleSheet.flatten(today.props.style)).toMatchObject({ backgroundColor: colors.accent });
    expect(StyleSheet.flatten(selection.props.style)).toMatchObject({ backgroundColor: colors.textHeading, height: 4 });
  }
  expect(render("2026-09-15").some((node) => node.props.testID?.startsWith("today-mark:"))).toBe(false);
});
test("exactly one red dot appears only on overdueDates within the displayed week", () => {
  const dots = render("2026-09-09", new Set(["2026-09-07", "2026-09-09", "2026-09-20"]))
    .filter((node) => node.props.testID?.startsWith("overdue-dot:"));
  expect(dots.map((node) => node.props.testID)).toEqual(["overdue-dot:2026-09-07", "overdue-dot:2026-09-09"]);
  for (const dot of dots) expect(StyleSheet.flatten(dot.props.style)).toMatchObject({ backgroundColor: colors.statusOverdue });
  expect(render("2026-09-09").some((node) => node.props.testID?.startsWith("overdue-dot:"))).toBe(false);
});
