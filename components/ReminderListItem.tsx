import { View, Text, StyleSheet, Pressable } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { colors, spacing, borderRadius, shadows, chipColors } from "../lib/theme";
import { FONT_DISPLAY } from "../lib/fonts";
import AppIcon from "./AppIcon";

export interface ReminderListItemProps {
  id: string;
  title: string;
  emoji?: string;
  chipColor: string;
  subtitle: string;
  completed?: boolean;
  missed?: boolean;
  onPress?: () => void;
  onToggleComplete?: () => void;
  onDelete?: () => void;
}

const DELETE_THRESHOLD = -80;

/**
 * Deterministic pastel chip color for a reminder id — stable forever.
 * `chipColors[hash(id) % chipColors.length]` per the design contract.
 */
export function chipColorForId(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  }
  return chipColors[hash % chipColors.length];
}

export default function ReminderListItem({
  title,
  emoji,
  chipColor,
  subtitle,
  completed = false,
  missed = false,
  onPress,
  onToggleComplete,
  onDelete,
}: ReminderListItemProps) {
  const translateX = useSharedValue(0);

  const panGesture = Gesture.Pan()
    .enabled(!!onDelete)
    .activeOffsetX([-10, 10])
    .onUpdate((event) => {
      if (event.translationX < 0) {
        translateX.value = Math.max(event.translationX, -120);
      }
    })
    .onEnd((event) => {
      if (event.translationX < DELETE_THRESHOLD) {
        translateX.value = withSpring(-120);
      } else {
        translateX.value = withSpring(0);
      }
    });

  const cardStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  const deleteStyle = useAnimatedStyle(() => ({
    opacity: Math.min(1, Math.abs(translateX.value) / 80),
  }));

  const handleDelete = () => {
    translateX.value = withSpring(0);
    onDelete?.();
  };

  return (
    <View style={styles.container}>
      <Animated.View style={[styles.deleteAction, deleteStyle]}>
        <Pressable onPress={handleDelete} style={styles.deleteButton}>
          <AppIcon name="trash-2" size={24} color="#fff" />
        </Pressable>
      </Animated.View>

      <GestureDetector gesture={panGesture}>
        <Animated.View style={[styles.card, cardStyle]}>
          <Pressable
            onPress={onPress}
            style={({ pressed }) => [
              styles.cardContent,
              pressed && styles.cardPressed,
            ]}
          >
            <View style={[styles.chip, { backgroundColor: chipColor }]}>
              {emoji ? (
                <Text style={styles.chipEmoji}>{emoji}</Text>
              ) : (
                <AppIcon name="bell" size={22} color={colors.textSecondary} />
              )}
            </View>

            <View style={styles.infoContainer}>
              <Text
                style={[
                  styles.title,
                  completed && styles.titleCompleted,
                  missed && styles.titleMissed,
                ]}
                numberOfLines={1}
              >
                {title}
              </Text>
              <Text
                style={[styles.subtitle, missed && styles.subtitleMissed]}
                numberOfLines={1}
              >
                {subtitle}
              </Text>
            </View>

            <Pressable
              onPress={(e) => {
                e.stopPropagation();
                onToggleComplete?.();
              }}
              hitSlop={12}
              style={styles.completeTap}
            >
              {completed ? (
                <View style={styles.circleDone}>
                  <AppIcon name="check" size={16} color="#fff" strokeWidth={3} />
                </View>
              ) : missed ? (
                <View style={styles.circleMissed}>
                  <AppIcon name="x" size={14} color={colors.statusOverdue} strokeWidth={3} />
                </View>
              ) : (
                <View style={styles.circle} />
              )}
            </Pressable>
          </Pressable>
        </Animated.View>
      </GestureDetector>
    </View>
  );
}

const CIRCLE_SIZE = 28;

const styles = StyleSheet.create({
  container: {
    marginBottom: 12,
  },
  deleteAction: {
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
  deleteButton: {
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
  // Tiimo-style rounded-square chip (not a circle).
  chip: {
    width: 44,
    height: 44,
    borderRadius: 14,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 14,
  },
  chipEmoji: {
    fontSize: 22,
  },
  infoContainer: {
    flex: 1,
  },
  // Serif card title, per the Tiimo reference (weight baked into the face).
  title: {
    fontFamily: FONT_DISPLAY,
    fontSize: 17,
    color: colors.textHeading,
    marginBottom: 2,
  },
  titleCompleted: {
    textDecorationLine: "line-through",
    color: colors.textSecondary,
  },
  titleMissed: {
    color: colors.textSecondary,
  },
  subtitle: {
    fontSize: 14,
    color: colors.textSecondary,
  },
  subtitleMissed: {
    color: colors.statusOverdue,
  },
  completeTap: {
    marginLeft: spacing.sm,
  },
  circle: {
    width: CIRCLE_SIZE,
    height: CIRCLE_SIZE,
    borderRadius: CIRCLE_SIZE / 2,
    borderWidth: 1.5,
    borderColor: colors.borderSubtle,
  },
  circleDone: {
    width: CIRCLE_SIZE,
    height: CIRCLE_SIZE,
    borderRadius: CIRCLE_SIZE / 2,
    backgroundColor: colors.success,
    justifyContent: "center",
    alignItems: "center",
  },
  circleMissed: {
    width: CIRCLE_SIZE,
    height: CIRCLE_SIZE,
    borderRadius: CIRCLE_SIZE / 2,
    borderWidth: 2,
    borderColor: colors.statusOverdue,
    justifyContent: "center",
    alignItems: "center",
  },
});
