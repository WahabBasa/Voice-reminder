import { memo, useEffect, useSyncExternalStore } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { borderRadius, colors, shadows, spacing } from "../lib/theme";
import { FONT_DISPLAY } from "../lib/fonts";
import AppIcon from "./AppIcon";
import {
  getPendingTakesSnapshot,
  subscribePendingTakes,
  type PendingTake,
} from "../lib/pendingTakes";
import { pendingCardContent } from "../lib/pendingCardContent";

/**
 * The take that is still being made (spec §2.3).
 *
 * It sits above the Today list and is deliberately NOT a reminder row: it never
 * enters the store, so it cannot be counted, completed, or scheduled. What it
 * can do is exactly three things — be cancelled while it is working, be
 * retried when it failed, and be swiped away when the user is done with it.
 *
 * Every word on it comes from lib/pendingCardContent, so the copy is pinned by
 * tests rather than by this file.
 */

/** The outbox, as React state. */
export function usePendingTakes(): PendingTake[] {
  return useSyncExternalStore(subscribePendingTakes, getPendingTakesSnapshot, getPendingTakesSnapshot);
}

const DISCARD_THRESHOLD = -80;

export type PendingTakeCardProps = {
  take: PendingTake;
  /** The free active-reminder limit, for the unverified-entitlement copy. */
  limit: number;
  onCancel: (creationId: string) => void;
  onRetry: (creationId: string) => void;
  onDiscard: (creationId: string) => void;
};

function PendingTakeCardView({
  take,
  limit,
  onCancel,
  onRetry,
  onDiscard,
}: PendingTakeCardProps) {
  const content = pendingCardContent(take, limit);
  const translateX = useSharedValue(0);
  const pulse = useSharedValue(1);

  // The shimmer is the whole signal that something is happening — there is no
  // spinner, no percentage, and nothing to tap.
  useEffect(() => {
    if (!content.shimmer) {
      pulse.value = withTiming(1, { duration: 150 });
      return;
    }
    pulse.value = withRepeat(
      withTiming(0.45, { duration: 750, easing: Easing.inOut(Easing.quad) }),
      -1,
      true
    );
  }, [content.shimmer, pulse]);

  const panGesture = Gesture.Pan()
    .enabled(content.swipeToDiscard)
    .activeOffsetX([-10, 10])
    .onUpdate((event) => {
      if (event.translationX < 0) {
        translateX.value = Math.max(event.translationX, -120);
      }
    })
    .onEnd((event) => {
      translateX.value = withSpring(event.translationX < DISCARD_THRESHOLD ? -120 : 0);
    });

  const cardStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));
  const discardStyle = useAnimatedStyle(() => ({
    opacity: Math.min(1, Math.abs(translateX.value) / 80),
  }));
  const textStyle = useAnimatedStyle(() => ({ opacity: pulse.value }));

  const isError = content.tone === "error";

  return (
    <View style={styles.container}>
      {content.swipeToDiscard && (
        <Animated.View style={[styles.discardAction, discardStyle]}>
          <Pressable
            onPress={() => {
              translateX.value = withSpring(0);
              onDiscard(take.creationId);
            }}
            style={styles.discardButton}
            accessibilityRole="button"
            accessibilityLabel="Discard this recording"
          >
            <AppIcon name="trash-2" size={24} color="#fff" />
          </Pressable>
        </Animated.View>
      )}

      <GestureDetector gesture={panGesture}>
        <Animated.View style={[styles.card, cardStyle]}>
          <Pressable
            onPress={content.tappable ? () => onRetry(take.creationId) : undefined}
            disabled={!content.tappable}
            style={({ pressed }) => [
              styles.cardContent,
              pressed && content.tappable && styles.cardPressed,
            ]}
            accessibilityRole={content.tappable ? "button" : undefined}
            accessibilityLabel={content.text}
          >
            <View style={[styles.chip, isError && styles.chipError]}>
              <AppIcon
                name={isError ? "refresh-cw" : "mic"}
                size={20}
                color={isError ? colors.statusOverdue : colors.textSecondary}
              />
            </View>

            <Animated.View style={[styles.textWrap, !isError && textStyle]}>
              <Text
                style={[styles.text, isError && styles.textError]}
                numberOfLines={2}
              >
                {content.text}
              </Text>
            </Animated.View>

            {content.cancellable && (
              <Pressable
                onPress={() => onCancel(take.creationId)}
                hitSlop={12}
                style={styles.cancelTap}
                accessibilityRole="button"
                accessibilityLabel="Cancel this recording"
              >
                <AppIcon name="x" size={18} color={colors.textTertiary} />
              </Pressable>
            )}
          </Pressable>
        </Animated.View>
      </GestureDetector>
    </View>
  );
}

/**
 * Memoized on purpose.
 *
 * The screen re-renders every 30s off its `nowMs` tick, and the card's own
 * animation is a repeating shimmer — re-mounting that work for a clock the card
 * never reads is pure waste. Its props are the take, a number, and three
 * module-level callbacks, so a shallow compare is exactly right.
 */
const PendingTakeCard = memo(PendingTakeCardView);
export default PendingTakeCard;

/** Every pending take, newest last — the same order the outbox holds them in. */
export function PendingTakeList(props: {
  takes: PendingTake[];
  limit: number;
  onCancel: (creationId: string) => void;
  onRetry: (creationId: string) => void;
  onDiscard: (creationId: string) => void;
}) {
  if (props.takes.length === 0) return null;
  return (
    <View>
      {props.takes.map((take) => (
        <PendingTakeCard
          key={take.creationId}
          take={take}
          limit={props.limit}
          onCancel={props.onCancel}
          onRetry={props.onRetry}
          onDiscard={props.onDiscard}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: 12,
  },
  discardAction: {
    position: "absolute",
    right: 0,
    top: 0,
    bottom: 0,
    width: 100,
    backgroundColor: colors.destructive,
    borderRadius: borderRadius.card,
    justifyContent: "center",
    alignItems: "flex-end",
    paddingRight: spacing.lg,
  },
  discardButton: {
    padding: spacing.sm,
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: borderRadius.card,
    ...shadows.card,
  },
  cardContent: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 16,
    paddingHorizontal: spacing.md,
  },
  cardPressed: {
    opacity: 0.95,
  },
  chip: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: colors.surface,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 14,
  },
  chipError: {
    backgroundColor: colors.surface,
  },
  textWrap: {
    flex: 1,
  },
  text: {
    fontFamily: FONT_DISPLAY,
    fontSize: 16,
    color: colors.textHeading,
  },
  textError: {
    fontFamily: undefined,
    fontSize: 14,
    color: colors.statusOverdue,
    fontWeight: "600",
  },
  cancelTap: {
    marginLeft: spacing.sm,
    padding: 4,
  },
});
