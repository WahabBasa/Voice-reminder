import React from "react";

/**
 * The language wheel is the native iOS picker (@react-native-picker/picker).
 * It must open ON the preselected language — the device's on first launch
 * (English when the app doesn't offer it), the saved pick in Settings — with
 * that value in the very first render, so the wheel never jumps from row 0.
 */

// Render as plain function calls: hooks reduced to their initial values
// (lazy initializers run, like React's first render), native views to tags.
jest.mock("react", () => ({
  ...jest.requireActual("react"),
  useState: (value: unknown) => [typeof value === "function" ? (value as () => unknown)() : value, jest.fn()],
  useCallback: (fn: unknown) => fn,
  useMemo: (fn: () => unknown) => fn(),
  useRef: (value: unknown) => ({ current: value }),
  useEffect: () => {},
}));
jest.mock("@gorhom/bottom-sheet", () => ({
  __esModule: true,
  default: "BottomSheet",
  BottomSheetBackdrop: "BottomSheetBackdrop",
  BottomSheetView: "BottomSheetView",
}));
jest.mock("../../lib/fonts", () => ({ FONT_DISPLAY: "Newsreader_500Medium" }));
jest.mock("@gorhom/portal", () => ({ Portal: "Portal" }));
jest.mock("react-native-safe-area-context", () => ({ SafeAreaView: "SafeAreaView" }));
jest.mock("@react-native-picker/picker", () => {
  const Picker = Object.assign(() => null, { Item: () => null });
  return { Picker };
});

const mockLocales = { tags: ["es-MX"] };
jest.mock("expo-localization", () => ({
  getLocales: () => mockLocales.tags.map((languageTag) => ({ languageTag })),
}));
const mockPickLanguage = jest.fn(async (..._args: unknown[]) => true);
jest.mock("../../lib/pickLanguage", () => ({
  ...jest.requireActual("../../lib/pickLanguage"),
  pickLanguage: (...args: unknown[]) => mockPickLanguage(...args),
}));
jest.mock("../../lib/convexClient", () => ({ convex: { mutation: jest.fn() } }));
jest.mock("../../lib/deviceId", () => ({ getDeviceId: async () => "dev_1" }));

import { Picker } from "@react-native-picker/picker";
import FirstLaunchLanguage from "../../components/FirstLaunchLanguage";
import LanguageSheet, { LanguageWheel, wheelValueFor } from "../../components/LanguageSheet";
import { LANGUAGE_OPTIONS, __resetAppLanguageForTests } from "../../lib/appLanguage";

type Element = React.ReactElement<Record<string, any>>;

function descendants(node: React.ReactNode): Element[] {
  if (Array.isArray(node)) return node.flatMap(descendants);
  if (!React.isValidElement(node)) return [];
  const element = node as Element;
  return [element, ...React.Children.toArray(element.props.children).flatMap(descendants)];
}

/** Expand our own function components (LanguageWheel) so the Picker is reachable. */
function expand(node: React.ReactNode): Element[] {
  return descendants(node).flatMap((element) =>
    element.type === LanguageWheel ? [element, ...expand(LanguageWheel(element.props as any))] : [element]
  );
}

function wheelOf(node: React.ReactNode) {
  const nodes = expand(node);
  const picker = nodes.find((n) => n.type === Picker);
  if (!picker) throw new Error("no Picker rendered");
  const confirm = nodes.find((n) => n.props.testID === "language-confirm");
  return { picker, items: nodes.filter((n) => n.type === Picker.Item), confirm };
}

beforeEach(() => {
  __resetAppLanguageForTests();
  mockPickLanguage.mockClear();
  mockLocales.tags = ["es-MX"];
});

test("first launch opens on the device language", () => {
  const { picker } = wheelOf(FirstLaunchLanguage());
  expect(picker.props.selectedValue).toBe("es");
});

test("device language variants map to the listed entry", () => {
  for (const [tag, code] of [
    ["pt-PT", "pt"],
    ["zh-Hant-TW", "zh-Hant"],
    ["zh-Hans-CN", "zh-Hans"],
    ["fil-PH", "tl"],
  ] as const) {
    mockLocales.tags = [tag];
    expect(wheelOf(FirstLaunchLanguage()).picker.props.selectedValue).toBe(code);
  }
});

test("first launch falls back to English when the device language isn't listed", () => {
  mockLocales.tags = ["xx-YY"];
  expect(wheelOf(FirstLaunchLanguage()).picker.props.selectedValue).toBe("en");
  mockLocales.tags = [];
  expect(wheelOf(FirstLaunchLanguage()).picker.props.selectedValue).toBe("en");
});

test("Settings opens on the saved choice, not the device language", () => {
  const sheet = LanguageSheet({
    visible: true,
    initialCode: "de",
    confirmLabel: "Done",
    onConfirm: () => {},
    onDismiss: () => {},
  });
  expect(wheelOf(sheet).picker.props.selectedValue).toBe("de");
});

test("every language is a native picker item labelled by its endonym", () => {
  const { items } = wheelOf(LanguageWheel({ initialCode: "en", confirmLabel: "Continue", onConfirm: () => {} }));
  expect(items.map((item) => item.props.value)).toEqual(LANGUAGE_OPTIONS.map((o) => o.code));
  expect(items.map((item) => item.props.label)).toEqual(LANGUAGE_OPTIONS.map((o) => o.endonym));
});

test("Continue on first launch applies the shown language", () => {
  wheelOf(FirstLaunchLanguage()).confirm!.props.onPress();
  expect(mockPickLanguage).toHaveBeenCalledWith("es");
});

test("confirm hands back the preselected code", () => {
  const onConfirm = jest.fn();
  wheelOf(LanguageWheel({ initialCode: "pt-BR", confirmLabel: "Done", onConfirm })).confirm!.props.onPress();
  expect(onConfirm).toHaveBeenCalledWith("pt");
});

test("wheelValueFor normalises codes and falls back to English", () => {
  expect(wheelValueFor("pt-BR")).toBe("pt");
  expect(wheelValueFor("klingon")).toBe("en");
  expect(wheelValueFor(null)).toBe("en");
});
