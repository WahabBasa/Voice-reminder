import React from "react";
import { View, StyleSheet } from "react-native";

interface SelectedItemProps {
  itemHeight: number;
  children: React.ReactNode;
}

export default function SelectedItem({ itemHeight, children }: SelectedItemProps) {
  return <View style={[styles.item, { height: itemHeight }]}>{children}</View>;
}

const styles = StyleSheet.create({
  item: {
    justifyContent: "center",
    alignItems: "center",
  },
});
