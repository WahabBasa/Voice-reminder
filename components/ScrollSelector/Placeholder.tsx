import React from "react";
import { View } from "react-native";

interface PlaceholderProps {
  wrapperHeight: number;
  itemHeight: number;
}

export default function Placeholder({ wrapperHeight, itemHeight }: PlaceholderProps) {
  const height = (wrapperHeight - itemHeight) / 2;
  return <View style={{ height }} />;
}
