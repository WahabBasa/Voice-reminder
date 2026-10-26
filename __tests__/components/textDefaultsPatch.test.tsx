/**
 * Our patch to react-native's Text.js (patches/react-native+0.81.5.patch)
 * reads global.__VR_TEXT_DEFAULTS (lib/textDefaults.ts): a Dynamic Type cap,
 * start alignment under RTL, and a tall-script line-height scale. Without the
 * global, or with Latin LTR defaults, Text renders exactly as before.
 */
import React from "react";
// No @types for react-test-renderer in this repo: typed loosely on purpose.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const TestRenderer: any = require("react-test-renderer");
const { act } = TestRenderer;
import { StyleSheet } from "react-native";
import { textDefaultsFor } from "../../lib/textDefaults";

const RealText = jest.requireActual("react-native/Libraries/Text/Text").default;

function hostProps(element: React.ReactElement) {
  let root: any;
  act(() => {
    root = TestRenderer.create(element);
  });
  const host = root.root.findAll((node: any) => typeof node.type === "string")[0];
  return { ...host.props, style: StyleSheet.flatten(host.props.style) ?? {} };
}

afterEach(() => {
  delete (globalThis as any).__VR_TEXT_DEFAULTS;
});

it("is applied in this checkout (postinstall ran patch-package)", () => {
  const source = require("fs").readFileSync(require.resolve("react-native/Libraries/Text/Text.js"), "utf8");
  expect(source).toContain("__VR_TEXT_DEFAULTS");
});

it("no defaults installed: unchanged", () => {
  const props = hostProps(<RealText style={{ fontSize: 15, lineHeight: 20 }}>Hi</RealText>);
  expect(props.maxFontSizeMultiplier).toBeUndefined();
  expect(props.style.textAlign).toBeUndefined();
  expect(props.style.lineHeight).toBe(20);
});

it("English LTR: only the text-size cap, alignment and line height untouched", () => {
  (globalThis as any).__VR_TEXT_DEFAULTS = textDefaultsFor("en", false);
  const props = hostProps(<RealText style={{ fontSize: 15, lineHeight: 20 }}>Hi</RealText>);
  expect(props.maxFontSizeMultiplier).toBe(1.4);
  expect(props.style.textAlign).toBeUndefined();
  expect(props.style.lineHeight).toBe(20);
});

it("a per-Text cap wins over the default", () => {
  (globalThis as any).__VR_TEXT_DEFAULTS = textDefaultsFor("en", false);
  expect(hostProps(<RealText maxFontSizeMultiplier={1.2}>Hi</RealText>).maxFontSizeMultiplier).toBe(1.2);
});

it("Arabic RTL: start alignment where none is set, explicit alignment kept", () => {
  (globalThis as any).__VR_TEXT_DEFAULTS = textDefaultsFor("ar", true);
  expect(hostProps(<RealText>مرحبا</RealText>).style.textAlign).toBe("left");
  expect(hostProps(<RealText style={{ textAlign: "auto" }}>مرحبا</RealText>).style.textAlign).toBe("left");
  expect(hostProps(<RealText style={{ textAlign: "center" }}>مرحبا</RealText>).style.textAlign).toBe("center");
});

it("Urdu: explicit line heights grow for Nastaliq", () => {
  (globalThis as any).__VR_TEXT_DEFAULTS = textDefaultsFor("ur", true);
  expect(hostProps(<RealText style={{ fontSize: 15, lineHeight: 20 }}>سلام</RealText>).style.lineHeight).toBe(30);
});
