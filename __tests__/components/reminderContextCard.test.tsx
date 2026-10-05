import React from "react";

jest.mock("@gorhom/bottom-sheet", () => ({
  TouchableOpacity: require("react-native").TouchableOpacity,
}));
jest.mock("../../components/ReminderListItem", () => ({ chipColorForId: () => "#eee" }));
jest.mock("../../lib/AudioService", () => ({ previewAudioService: { play: jest.fn(), stop: jest.fn() } }));
jest.mock("../../lib/store", () => ({ useReminderStore: jest.fn() }));

import { ReminderContextCardView } from "../../components/ReminderContextCard";

/** OLD-134: the composer's reminder card — what is shown, and when ▶ appears. */

type Element = React.ReactElement<{ children?: React.ReactNode; testID?: string; onPress?: () => void }>;

function descendants(node: React.ReactNode): Element[] {
  if (!React.isValidElement(node)) return [];
  const element = node as Element;
  return [element, ...React.Children.toArray(element.props.children).flatMap(descendants)];
}

function render(props: Partial<React.ComponentProps<typeof ReminderContextCardView>> = {}) {
  const onTogglePlay = jest.fn();
  const nodes = descendants(
    ReminderContextCardView({
      title: "Take vitamins",
      emoji: "💊",
      chipColor: "#eee",
      spoken: "Time to take your vitamins.",
      when: "Every Mon, Fri · 8:00 am",
      canPlay: true,
      playing: false,
      onTogglePlay,
      ...props,
    })
  );
  const byId = (id: string) => nodes.filter((node) => node.props.testID === id);
  const strings = nodes
    .map((node) => node.props.children)
    .filter((child): child is string => typeof child === "string");
  return { byId, strings, onTogglePlay };
}

test("shows the title, emoji, when line and spoken line", () => {
  const { strings, byId } = render();
  expect(strings).toEqual(
    expect.arrayContaining(["💊", "Take vitamins", "Every Mon, Fri · 8:00 am", "Time to take your vitamins."])
  );
  expect(byId("reminder-context-play")).toHaveLength(1);
});

test("▶ plays; hidden when the audio isn't on the phone", () => {
  const { byId, onTogglePlay } = render();
  byId("reminder-context-play")[0].props.onPress!();
  expect(onTogglePlay).toHaveBeenCalledTimes(1);
  expect(render({ canPlay: false }).byId("reminder-context-play")).toHaveLength(0);
});

test("no when line or spoken row when there's nothing to show", () => {
  const { byId } = render({ when: "", spoken: "" });
  expect(byId("reminder-context-when")).toHaveLength(0);
  expect(byId("reminder-context-spoken")).toHaveLength(0);
  expect(byId("reminder-context-play")).toHaveLength(0);
});
