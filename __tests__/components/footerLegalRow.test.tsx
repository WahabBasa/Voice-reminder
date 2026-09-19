import React from "react";
import { StyleSheet } from "react-native";
import FooterLegalRow from "../../components/paywall/FooterLegalRow";
import { PRIVACY_POLICY_URL, TERMS_OF_USE_URL } from "../../lib/legalLinks";

/**
 * The sticky-footer legal row is what App Review 3.1.2(c) sees without
 * scrolling: working Terms of Use (EULA) and Privacy Policy links, plus Restore.
 * These tests pin that all three items render, tap through to the right URLs /
 * handler, and that Restore is disabled (and dimmed) while a purchase or restore
 * is in flight.
 */

type Element = React.ReactElement<{
  children?: React.ReactNode;
  testID?: string;
  onPress?: () => void;
  disabled?: boolean;
  accessibilityRole?: string;
  style?: object;
}>;

function descendants(node: React.ReactNode): Element[] {
  if (!React.isValidElement(node)) return [];
  const element = node as Element;
  return [element, ...React.Children.toArray(element.props.children).flatMap(descendants)];
}

function render(props: Partial<React.ComponentProps<typeof FooterLegalRow>> = {}) {
  const onOpenLink = jest.fn();
  const onRestore = jest.fn();
  const tree = FooterLegalRow({ onOpenLink, onRestore, busy: false, ...props });
  const nodes = descendants(tree);
  const byTestId = (id: string) => nodes.find((node) => node.props.testID === id)!;
  return { onOpenLink, onRestore, nodes, byTestId };
}

test("renders all three items: Terms, Privacy, Restore", () => {
  const { byTestId } = render();
  expect(byTestId("footer-legal-terms").props.accessibilityRole).toBe("link");
  expect(byTestId("footer-legal-privacy").props.accessibilityRole).toBe("link");
  expect(byTestId("footer-legal-restore").props.accessibilityRole).toBe("button");
});

test("Terms tap opens the Terms of Use URL", () => {
  const { onOpenLink, byTestId } = render();
  byTestId("footer-legal-terms").props.onPress!();
  expect(onOpenLink).toHaveBeenCalledWith(TERMS_OF_USE_URL);
});

test("Privacy tap opens the Privacy Policy URL", () => {
  const { onOpenLink, byTestId } = render();
  byTestId("footer-legal-privacy").props.onPress!();
  expect(onOpenLink).toHaveBeenCalledWith(PRIVACY_POLICY_URL);
});

test("Restore tap calls onRestore", () => {
  const { onRestore, byTestId } = render();
  byTestId("footer-legal-restore").props.onPress!();
  expect(onRestore).toHaveBeenCalledTimes(1);
});

test("Restore is not disabled when idle", () => {
  const { byTestId } = render({ busy: false });
  expect(byTestId("footer-legal-restore").props.disabled).toBe(false);
});

test("Restore is disabled and dimmed when busy", () => {
  const { byTestId } = render({ busy: true });
  const restore = byTestId("footer-legal-restore");
  expect(restore.props.disabled).toBe(true);
  // The dimmed label sits inside the touchable.
  const restoreLabel = descendants(restore).find(
    (node) =>
      (StyleSheet.flatten(node.props.style) as { opacity?: number } | undefined)?.opacity === 0.4
  );
  expect(restoreLabel).toBeTruthy();
});
