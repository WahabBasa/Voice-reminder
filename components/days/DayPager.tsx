import { ReactNode, useCallback, useLayoutEffect, useRef, useState } from "react";
import { LayoutChangeEvent, StyleSheet, View, useWindowDimensions } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";
import { addDaysISO } from "../../lib/dayOccurrences";

const SPRING_CONFIG = { damping: 30, stiffness: 250, mass: 1 };
const FLICK_VELOCITY = 500;
const SNAP_FRACTION = 0.4;

interface DayPagerProps {
  /** The centered day. Parent owns it; flips arrive via onFlip. */
  dateISO: string;
  onFlip: (delta: 1 | -1) => void;
  renderDay: (dateISO: string) => ReactNode;
}

/**
 * DayPager - infinite horizontal day flipper. Renders a 3-panel window
 * [prev, current, next] and recenters after each flip: the flip is reported
 * at gesture end, the parent swaps the date, and the compensating offset is
 * applied in the same commit so the settle spring lands on the new center.
 * Built on gesture-handler + reanimated (pager-view is native, breaks OTA).
 */
export default function DayPager({ dateISO, onFlip, renderDay }: DayPagerProps) {
  const { width: windowWidth } = useWindowDimensions();
  const [width, setWidth] = useState(windowWidth);

  const translateX = useSharedValue(0);
  const startX = useSharedValue(0);

  // Set when a flip was reported and the compensating shift is still pending.
  const pendingFlipRef = useRef<1 | -1 | null>(null);
  const prevDateRef = useRef(dateISO);

  const requestFlip = useCallback(
    (delta: 1 | -1) => {
      pendingFlipRef.current = delta;
      onFlip(delta);
    },
    [onFlip]
  );

  useLayoutEffect(() => {
    if (prevDateRef.current === dateISO) return;
    prevDateRef.current = dateISO;
    const pending = pendingFlipRef.current;
    pendingFlipRef.current = null;
    if (pending !== null) {
      // Content shifted one panel; compensate so the visual position holds,
      // then settle onto the new center.
      translateX.value = translateX.value + pending * width;
      translateX.value = withSpring(0, SPRING_CONFIG);
    } else {
      // External jump (week strip tap, month sheet): snap to center.
      translateX.value = 0;
    }
  }, [dateISO, width, translateX]);

  const handleLayout = useCallback((event: LayoutChangeEvent) => {
    const next = event.nativeEvent.layout.width;
    if (next > 0) {
      setWidth(next);
    }
  }, []);

  const panGesture = Gesture.Pan()
    // Vertical drags must stay with the lists: only claim clearly horizontal moves.
    .activeOffsetX([-15, 15])
    .failOffsetY([-15, 15])
    .onStart(() => {
      startX.value = translateX.value;
    })
    .onUpdate((event) => {
      translateX.value = startX.value + event.translationX;
    })
    .onEnd((event) => {
      const fraction = width > 0 ? -translateX.value / width : 0;
      let target = 0;
      if (event.velocityX <= -FLICK_VELOCITY && fraction > 0) {
        target = 1;
      } else if (event.velocityX >= FLICK_VELOCITY && fraction < 0) {
        target = -1;
      } else if (fraction >= SNAP_FRACTION) {
        target = 1;
      } else if (fraction <= -SNAP_FRACTION) {
        target = -1;
      }

      if (target === 0) {
        translateX.value = withSpring(0, { ...SPRING_CONFIG, velocity: event.velocityX });
      } else {
        // Report immediately; the settle spring runs after the recenter shift.
        runOnJS(requestFlip)(target as 1 | -1);
      }
    });

  const trackStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  const prevDate = addDaysISO(dateISO, -1);
  const nextDate = addDaysISO(dateISO, 1);

  return (
    <GestureDetector gesture={panGesture}>
      <View style={styles.viewport} onLayout={handleLayout}>
        <Animated.View
          style={[styles.track, { width: width * 3, marginLeft: -width }, trackStyle]}
        >
          <View style={{ width }}>{renderDay(prevDate)}</View>
          <View style={{ width }}>{renderDay(dateISO)}</View>
          <View style={{ width }}>{renderDay(nextDate)}</View>
        </Animated.View>
      </View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  viewport: {
    flex: 1,
    overflow: "hidden",
  },
  track: {
    flex: 1,
    flexDirection: "row",
  },
});
