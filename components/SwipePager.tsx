import React, { Children, ReactNode, useCallback, useEffect, useRef, useState } from "react";
import { LayoutChangeEvent, StyleSheet, View, useWindowDimensions } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
    SharedValue,
    runOnJS,
    useAnimatedReaction,
    useAnimatedStyle,
    useSharedValue,
    withSpring,
} from "react-native-reanimated";
import { directionSign } from "../lib/layoutDirection";

interface SwipePagerProps {
    /** Controlled page index. Changing it (e.g. via tab tap) animates the pager. */
    page: number;
    /** Called when a swipe settles on a different page. */
    onPageChange: (page: number) => void;
    swipeEnabled?: boolean;
    /** Driven with the fractional page position (0..pageCount-1), including rubber-band overshoot. */
    progress?: SharedValue<number>;
    children: ReactNode[];
}

const SPRING_CONFIG = { damping: 30, stiffness: 250, mass: 1 };
const FLICK_VELOCITY = 500;
const SNAP_FRACTION = 0.4;
const RUBBER_BAND = 0.3;

/**
 * SwipePager - horizontal finger-tracking pager built on gesture-handler +
 * reanimated (react-native-pager-view is a native module and would break OTA).
 * All pages stay mounted so list scroll positions survive page changes.
 */
export default function SwipePager({
    page,
    onPageChange,
    swipeEnabled = true,
    progress,
    children,
}: SwipePagerProps) {
    const pageCount = Children.count(children);
    const { width: windowWidth } = useWindowDimensions();
    const [width, setWidth] = useState(windowWidth);
    const widthRef = useRef(width);

    const translateX = useSharedValue(-page * width);
    const startX = useSharedValue(0);
    const currentPage = useSharedValue(page);
    // translateX is logical (page p sits at -p × width); RTL lays the track out
    // from the right, so the physical offset and the finger are mirrored.
    const sign = directionSign();

    useEffect(() => {
        const widthChanged = widthRef.current !== width;
        widthRef.current = width;
        if (currentPage.value !== page) {
            // Tab tap (or other external change): animate over.
            currentPage.value = page;
            translateX.value = withSpring(-page * width, SPRING_CONFIG);
        } else if (widthChanged) {
            // Layout/rotation: re-align instantly, never mid-spring (page already matches).
            translateX.value = -page * width;
        }
    }, [page, width, currentPage, translateX]);

    useAnimatedReaction(
        () => (width > 0 ? -translateX.value / width : 0),
        (position) => {
            if (progress) {
                progress.value = position;
            }
        },
        [width, progress]
    );

    const handleLayout = useCallback((event: LayoutChangeEvent) => {
        const next = event.nativeEvent.layout.width;
        if (next > 0) {
            setWidth(next);
        }
    }, []);

    const panGesture = Gesture.Pan()
        .enabled(swipeEnabled)
        // Vertical drags must stay with the lists: only claim clearly horizontal moves.
        .activeOffsetX([-15, 15])
        .failOffsetY([-15, 15])
        .onStart(() => {
            startX.value = translateX.value;
        })
        .onUpdate((event) => {
            const min = -(pageCount - 1) * width;
            const raw = startX.value + sign * event.translationX;
            if (raw > 0) {
                translateX.value = raw * RUBBER_BAND;
            } else if (raw < min) {
                translateX.value = min + (raw - min) * RUBBER_BAND;
            } else {
                translateX.value = raw;
            }
        })
        .onEnd((event) => {
            const current = currentPage.value;
            const delta = (width > 0 ? -translateX.value / width : 0) - current;
            let target = current;
            const velocity = sign * event.velocityX;
            if (velocity <= -FLICK_VELOCITY && delta > 0) {
                target = current + 1;
            } else if (velocity >= FLICK_VELOCITY && delta < 0) {
                target = current - 1;
            } else if (delta >= SNAP_FRACTION) {
                target = current + 1;
            } else if (delta <= -SNAP_FRACTION) {
                target = current - 1;
            }
            target = Math.max(0, Math.min(pageCount - 1, target));
            currentPage.value = target;
            translateX.value = withSpring(-target * width, {
                ...SPRING_CONFIG,
                velocity,
            });
            if (target !== current) {
                runOnJS(onPageChange)(target);
            }
        });

    const trackStyle = useAnimatedStyle(() => ({
        transform: [{ translateX: sign * translateX.value }],
    }));

    return (
        <GestureDetector gesture={panGesture}>
            <View style={styles.viewport} onLayout={handleLayout}>
                <Animated.View style={[styles.track, { width: width * pageCount }, trackStyle]}>
                    {Children.map(children, (child) => (
                        <View style={{ width }}>{child}</View>
                    ))}
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
