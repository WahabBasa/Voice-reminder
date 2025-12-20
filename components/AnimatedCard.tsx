import React, { useCallback, useImperativeHandle, forwardRef } from "react";
import { ViewStyle } from "react-native";
import Animated, {
    useSharedValue,
    useAnimatedStyle,
    withTiming,
    runOnJS,
    Easing,
} from "react-native-reanimated";

interface AnimatedCardProps {
    children: React.ReactNode;
    style?: ViewStyle;
}

export interface AnimatedCardRef {
    animateOut: (callback: () => void) => void;
}

const ANIMATION_DURATION = 250;

/**
 * A wrapper that provides fade+slide exit animations for list items.
 * Call `animateOut(callback)` to animate the card out before removing from state.
 */
const AnimatedCard = forwardRef<AnimatedCardRef, AnimatedCardProps>(
    ({ children, style }, ref) => {
        const opacity = useSharedValue(1);
        const translateX = useSharedValue(0);
        const height = useSharedValue<number | undefined>(undefined);

        const animateOut = useCallback((callback: () => void) => {
            "worklet";
            opacity.value = withTiming(0, {
                duration: ANIMATION_DURATION,
                easing: Easing.out(Easing.ease),
            });
            translateX.value = withTiming(
                -80,
                {
                    duration: ANIMATION_DURATION,
                    easing: Easing.out(Easing.ease),
                },
                (finished) => {
                    if (finished) {
                        runOnJS(callback)();
                    }
                }
            );
        }, [opacity, translateX]);

        useImperativeHandle(ref, () => ({
            animateOut: (callback: () => void) => {
                animateOut(callback);
            },
        }), [animateOut]);

        const animatedStyle = useAnimatedStyle(() => ({
            opacity: opacity.value,
            transform: [{ translateX: translateX.value }],
        }));

        return (
            <Animated.View style={[style, animatedStyle]}>
                {children}
            </Animated.View>
        );
    }
);

AnimatedCard.displayName = "AnimatedCard";

export default AnimatedCard;
