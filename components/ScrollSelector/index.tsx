import React, { useRef, useState, useEffect, useCallback } from "react";
import {
  View,
  ScrollView,
  Text,
  StyleSheet,
  NativeSyntheticEvent,
  NativeScrollEvent,
  Platform,
  DimensionValue,
} from "react-native";
import HighlightView from "./HighlightView";
import Placeholder from "./Placeholder";
import SelectedItem from "./SelectedItem";
import { colors } from "../../lib/theme";

interface ScrollSelectorProps<T> {
  dataSource: T[];
  selectedIndex?: number;
  onValueChange?: (value: T, index: number) => void;
  itemHeight?: number;
  wrapperHeight?: number;
  wrapperWidth?: DimensionValue;
  highlightColor?: string;
  highlightBorderWidth?: number;
  renderItem?: (item: T, index: number, isSelected: boolean) => React.ReactNode;
}

export default function ScrollSelector<T extends string | number>({
  dataSource,
  selectedIndex = 0,
  onValueChange,
  itemHeight = 50,
  wrapperHeight = 150,
  wrapperWidth = 80,
  highlightColor = "#e0e0e0",
  highlightBorderWidth = 1,
  renderItem,
}: ScrollSelectorProps<T>) {
  const [currentIndex, setCurrentIndex] = useState(selectedIndex);
  const scrollViewRef = useRef<ScrollView>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const dragStartedRef = useRef(false);
  const momentumStartedRef = useRef(false);

  useEffect(() => {
    if (selectedIndex !== undefined && selectedIndex !== currentIndex) {
      setTimeout(() => {
        scrollToIndex(selectedIndex, false);
      }, 10);
    }
  }, [selectedIndex]);

  const scrollToIndex = (index: number, animated = true) => {
    const y = index * itemHeight;
    scrollViewRef.current?.scrollTo({ y, animated });
    setCurrentIndex(index);
  };

  const scrollFix = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent> | NativeScrollEvent) => {
      const offsetY = "nativeEvent" in e ? e.nativeEvent.contentOffset.y : e.contentOffset.y;
      const index = Math.round(offsetY / itemHeight);
      const clampedIndex = Math.max(0, Math.min(index, dataSource.length - 1));
      const targetY = clampedIndex * itemHeight;

      if (Math.abs(offsetY - targetY) > 1) {
        scrollViewRef.current?.scrollTo({ y: targetY, animated: true });
      }

      if (currentIndex !== clampedIndex) {
        setCurrentIndex(clampedIndex);
        onValueChange?.(dataSource[clampedIndex], clampedIndex);
      }
    },
    [currentIndex, dataSource, itemHeight, onValueChange]
  );

  const onScrollBeginDrag = () => {
    dragStartedRef.current = true;
    if (timerRef.current) clearTimeout(timerRef.current);
  };

  const onScrollEndDrag = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    dragStartedRef.current = false;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      if (!momentumStartedRef.current && !dragStartedRef.current) {
        scrollFix(e);
      }
    }, 50);
  };

  const onMomentumScrollBegin = () => {
    momentumStartedRef.current = true;
    if (timerRef.current) clearTimeout(timerRef.current);
  };

  const onMomentumScrollEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    momentumStartedRef.current = false;
    if (!dragStartedRef.current) {
      scrollFix(e);
    }
  };

  const defaultRenderItem = (item: T, index: number, isSelected: boolean) => (
    <Text
      style={[
        styles.itemText,
        isSelected && styles.selectedItemText,
      ]}
    >
      {String(item)}
    </Text>
  );

  return (
    <View style={[styles.container, { height: wrapperHeight, width: wrapperWidth }]}>
      <HighlightView
        wrapperHeight={wrapperHeight}
        itemHeight={itemHeight}
        highlightColor={highlightColor}
        highlightBorderWidth={highlightBorderWidth}
      />
      <ScrollView
        ref={scrollViewRef}
        showsVerticalScrollIndicator={false}
        bounces={false}
        onScrollBeginDrag={onScrollBeginDrag}
        onScrollEndDrag={onScrollEndDrag}
        onMomentumScrollBegin={onMomentumScrollBegin}
        onMomentumScrollEnd={onMomentumScrollEnd}
        scrollEventThrottle={16}
        decelerationRate={Platform.OS === "ios" ? "normal" : 0.98}
        snapToInterval={itemHeight}
        snapToAlignment="center"
      >
        <Placeholder wrapperHeight={wrapperHeight} itemHeight={itemHeight} />
        {dataSource.map((item, index) => (
          <SelectedItem key={index} itemHeight={itemHeight}>
            {renderItem
              ? renderItem(item, index, index === currentIndex)
              : defaultRenderItem(item, index, index === currentIndex)}
          </SelectedItem>
        ))}
        <Placeholder wrapperHeight={wrapperHeight} itemHeight={itemHeight} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    overflow: "hidden",
  },
  itemText: {
    fontSize: 22,
    color: "#999",
  },
  selectedItemText: {
    color: colors.textPrimary,
    fontWeight: "600",
  },
});
