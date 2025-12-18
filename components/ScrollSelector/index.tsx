import React, { useRef, useState, useEffect, useCallback, useMemo } from "react";
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
  loop?: boolean;
  loopMultiplier?: number;
}

export default function ScrollSelector<T extends string | number>({
  dataSource,
  selectedIndex = 0,
  onValueChange,
  itemHeight = 50,
  wrapperHeight = 150,
  wrapperWidth = 80,
  highlightColor = colors.border,
  highlightBorderWidth = 1,
  renderItem,
  loop = false,
  loopMultiplier = 50,
}: ScrollSelectorProps<T>) {
  const canLoop = loop && dataSource.length > 0;
  const baseLength = dataSource.length;
  const safeLoopMultiplier = Math.max(3, Math.floor(loopMultiplier));
  const loopedLength = canLoop ? baseLength * safeLoopMultiplier : baseLength;
  const middleLoopStart = canLoop ? Math.floor(safeLoopMultiplier / 2) * baseLength : 0;

  const loopedDataSource = useMemo(() => {
    if (!canLoop) return dataSource;
    const repeated: T[] = [];
    for (let i = 0; i < safeLoopMultiplier; i++) repeated.push(...dataSource);
    return repeated;
  }, [canLoop, dataSource, safeLoopMultiplier]);

  const getEffectiveIndex = useCallback(
    (index: number) => {
      if (!canLoop) return Math.max(0, Math.min(index, baseLength - 1));
      const normalized = ((index % baseLength) + baseLength) % baseLength;
      return middleLoopStart + normalized;
    },
    [baseLength, canLoop, middleLoopStart]
  );

  const [currentIndex, setCurrentIndex] = useState(() =>
    getEffectiveIndex(selectedIndex)
  );
  const scrollViewRef = useRef<ScrollView>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastOffsetYRef = useRef(0);
  const dragStartedRef = useRef(false);
  const momentumStartedRef = useRef(false);
  const recenteringRef = useRef(false);

  useEffect(() => {
    const targetIndex = getEffectiveIndex(selectedIndex);
    if (selectedIndex !== undefined && targetIndex !== currentIndex) {
      requestAnimationFrame(() => scrollToIndex(targetIndex, false));
    }
  }, [selectedIndex, currentIndex, getEffectiveIndex]);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const scrollToIndex = (index: number, animated = true) => {
    const y = index * itemHeight;
    scrollViewRef.current?.scrollTo({ y, animated });
    setCurrentIndex(index);
  };

  const scrollFix = useCallback(
    (offsetY: number) => {
      const index = Math.round(offsetY / itemHeight);
      const clampedIndex = Math.max(0, Math.min(index, loopedLength - 1));
      const targetY = clampedIndex * itemHeight;

      if (Math.abs(offsetY - targetY) > 1) {
        scrollViewRef.current?.scrollTo({ y: targetY, animated: true });
      }

      if (currentIndex !== clampedIndex) {
        setCurrentIndex(clampedIndex);

        if (baseLength > 0) {
          const normalizedIndex = canLoop ? clampedIndex % baseLength : clampedIndex;
          onValueChange?.(dataSource[normalizedIndex], normalizedIndex);

          if (canLoop) {
            const shouldRecenter =
              clampedIndex < baseLength || clampedIndex >= loopedLength - baseLength;
            if (shouldRecenter) {
              const recenterIndex = middleLoopStart + normalizedIndex;
              recenteringRef.current = true;
              scrollViewRef.current?.scrollTo({
                y: recenterIndex * itemHeight,
                animated: false,
              });
              setCurrentIndex(recenterIndex);
              requestAnimationFrame(() => {
                recenteringRef.current = false;
              });
            }
          }
        }
      }
    },
    [
      baseLength,
      canLoop,
      currentIndex,
      dataSource,
      itemHeight,
      loopedLength,
      middleLoopStart,
      onValueChange,
    ]
  );

  const scheduleSnap = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      if (
        momentumStartedRef.current ||
        dragStartedRef.current ||
        recenteringRef.current
      ) {
        return;
      }
      scrollFix(lastOffsetYRef.current);
    }, 80);
  }, [scrollFix]);

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    lastOffsetYRef.current = e.nativeEvent.contentOffset.y;
  };

  const onScrollBeginDrag = () => {
    if (recenteringRef.current) return;
    dragStartedRef.current = true;
    if (timerRef.current) clearTimeout(timerRef.current);
  };

  const onScrollEndDrag = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (recenteringRef.current) return;
    dragStartedRef.current = false;
    lastOffsetYRef.current = e.nativeEvent.contentOffset.y;
    scheduleSnap();
  };

  const onMomentumScrollBegin = () => {
    if (recenteringRef.current) return;
    momentumStartedRef.current = true;
    if (timerRef.current) clearTimeout(timerRef.current);
  };

  const onMomentumScrollEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (recenteringRef.current) return;
    momentumStartedRef.current = false;
    if (!dragStartedRef.current) {
      scrollFix(e.nativeEvent.contentOffset.y);
    }
    scheduleSnap();
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

  const paddingVertical = (wrapperHeight - itemHeight) / 2;

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
        nestedScrollEnabled
        keyboardShouldPersistTaps="handled"
        disableIntervalMomentum
        contentContainerStyle={{ paddingVertical }}
        onScroll={onScroll}
        onScrollBeginDrag={onScrollBeginDrag}
        onScrollEndDrag={onScrollEndDrag}
        onMomentumScrollBegin={onMomentumScrollBegin}
        onMomentumScrollEnd={onMomentumScrollEnd}
        scrollEventThrottle={16}
        decelerationRate={Platform.OS === "ios" ? "normal" : 0.98}
        snapToInterval={itemHeight}
        snapToAlignment="center"
      >
        {loopedDataSource.map((item, index) => (
          <SelectedItem key={index} itemHeight={itemHeight}>
            {renderItem
              ? renderItem(item, index, index === currentIndex)
              : defaultRenderItem(item, index, index === currentIndex)}
          </SelectedItem>
        ))}
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
    color: colors.textTertiary,
  },
  selectedItemText: {
    color: colors.textPrimary,
    fontWeight: "600",
  },
});
