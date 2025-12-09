import React from "react";
import { View, StyleSheet } from "react-native";

interface HighlightViewProps {
  wrapperHeight: number;
  itemHeight: number;
  highlightColor: string;
  highlightBorderWidth: number;
}

export default function HighlightView({
  wrapperHeight,
  itemHeight,
  highlightColor,
  highlightBorderWidth,
}: HighlightViewProps) {
  return (
    <View
      style={[
        styles.highlight,
        {
          top: (wrapperHeight - itemHeight) / 2,
          height: itemHeight,
          borderTopColor: highlightColor,
          borderBottomColor: highlightColor,
          borderTopWidth: highlightBorderWidth,
          borderBottomWidth: highlightBorderWidth,
        },
      ]}
    />
  );
}

const styles = StyleSheet.create({
  highlight: {
    position: "absolute",
    left: 0,
    right: 0,
  },
});
