import React from "react";
import { View, Text, StyleSheet, TouchableOpacity, Pressable } from "react-native";
import Animated, {
    useAnimatedStyle,
    useSharedValue,
    withSpring,
    withTiming,
    runOnJS,
    FadeOut,
    Layout,
} from "react-native-reanimated";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { colors, scaleFontSize } from "../lib/theme";
import AppIcon from "./AppIcon";

interface SwipeableCardProps {
    id: string;
    children: React.ReactNode;
    isExiting?: boolean;
    onDelete: () => void;
}

const DELETE_THRESHOLD = -80;
const DELETE_ACTION_WIDTH = 80;

/**
 * SwipeableCard - swipe left to reveal delete action
 * Used on home screen for reminder cards
 * Memoized to prevent re-renders when props haven't changed
 */
const SwipeableCard = React.memo(function SwipeableCard({
    id,
    children,
    isExiting = false,
    onDelete,
}: SwipeableCardProps) {
    const translateX = useSharedValue(0);

    const panGesture = Gesture.Pan()
        .activeOffsetX([-10, 10])
        .onUpdate((event) => {
            // Only allow swiping left
            if (event.translationX < 0) {
                translateX.value = Math.max(event.translationX, -DELETE_ACTION_WIDTH - 20);
            } else {
                translateX.value = Math.min(event.translationX * 0.5, 20);
            }
        })
        .onEnd((event) => {
            if (event.translationX < DELETE_THRESHOLD) {
                // Snap to reveal delete button
                translateX.value = withSpring(-DELETE_ACTION_WIDTH);
            } else {
                // Snap back
                translateX.value = withSpring(0);
            }
        });

    const cardStyle = useAnimatedStyle(() => ({
        transform: [{ translateX: translateX.value }],
    }));

    const deleteActionStyle = useAnimatedStyle(() => ({
        opacity: Math.min(1, Math.abs(translateX.value) / 60),
    }));

    const handleDeletePress = () => {
        // Animate card out to the left then call delete
        translateX.value = withTiming(-400, { duration: 200 }, (finished) => {
            if (finished) {
                runOnJS(onDelete)();
            }
        });
    };

    return (
        <View style={styles.container}>
            {/* Delete action behind the card */}
            <Animated.View style={[styles.deleteAction, deleteActionStyle]}>
                <Pressable onPress={handleDeletePress} style={styles.deleteButton}>
                    <AppIcon name="trash-2" size={22} color="#fff" />
                    <Text style={styles.deleteText}>Delete</Text>
                </Pressable>
            </Animated.View>

            {/* Swipeable card */}
            <GestureDetector gesture={panGesture}>
                <Animated.View
                    style={[styles.cardWrapper, cardStyle]}
                    layout={Layout.duration(200)}
                    exiting={isExiting ? FadeOut.duration(200) : undefined}
                >
                    {children}
                </Animated.View>
            </GestureDetector>
        </View>
    );
});

export default SwipeableCard;

const styles = StyleSheet.create({
    container: {
        marginBottom: 10,
    },
    deleteAction: {
        position: "absolute",
        right: 0,
        top: 0,
        bottom: 10,
        width: DELETE_ACTION_WIDTH,
        backgroundColor: colors.destructive,
        borderRadius: 18,
        justifyContent: "center",
        alignItems: "center",
    },
    deleteButton: {
        alignItems: "center",
        justifyContent: "center",
        paddingVertical: 8,
    },
    deleteText: {
        color: "#fff",
        fontSize: scaleFontSize(12),
        fontWeight: "600",
        marginTop: 4,
    },
    cardWrapper: {
        backgroundColor: colors.surface,
        borderRadius: 18,
        overflow: "hidden",
    },
});
