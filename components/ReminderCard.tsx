import { View, Text, StyleSheet, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { colors, spacing, typography, shadows, borderRadius } from "../lib/theme";
import { formatNextTrigger, getNextTriggerTime } from "../lib/time";

interface ReminderCardProps {
  id: string;
  title: string;
  time: string;
  frequency: string;
  days?: string[];
  onPress: () => void;
  onDelete: () => void;
}

const DELETE_THRESHOLD = -80;

export default function ReminderCard({
  title,
  time,
  frequency,
  days = [],
  onPress,
  onDelete,
}: ReminderCardProps) {
  const translateX = useSharedValue(0);
  const nextTrigger = getNextTriggerTime({ time, frequency, days });
  const nextTriggerStr = formatNextTrigger(nextTrigger);

  const panGesture = Gesture.Pan()
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
    onDelete();
  };

  const getFrequencyLabel = () => {
    if (frequency === "once") return "Once";
    if (frequency === "daily") return "Daily";
    if (frequency === "weekly") return "Weekly";
    return frequency;
  };

  return (
    <View style={styles.container}>
      <Animated.View style={[styles.deleteAction, deleteStyle]}>
        <Pressable onPress={handleDelete} style={styles.deleteButton}>
          <Ionicons name="trash" size={24} color="#fff" />
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
            <Text style={styles.title} numberOfLines={1}>
              {title}
            </Text>

            <View style={styles.footer}>
              <Text style={styles.nextText}>{nextTriggerStr}</Text>
              <View style={styles.frequencyBadge}>
                <Text style={styles.frequencyText}>{getFrequencyLabel()}</Text>
              </View>
            </View>
          </Pressable>
        </Animated.View>
      </GestureDetector>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: spacing.sm,
  },
  deleteAction: {
    position: "absolute",
    right: 0,
    top: 0,
    bottom: spacing.sm,
    width: 100,
    backgroundColor: colors.destructive,
    borderRadius: borderRadius.md,
    justifyContent: "center",
    alignItems: "flex-end",
    paddingRight: spacing.lg,
  },
  deleteButton: {
    padding: spacing.sm,
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: borderRadius.md,
    ...shadows.card,
  },
  cardContent: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  cardPressed: {
    opacity: 0.95,
  },
  title: {
    ...typography.bodyBold,
    marginBottom: spacing.xs,
  },
  footer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  nextText: {
    fontSize: 14,
    color: colors.textSecondary,
  },
  frequencyBadge: {
    backgroundColor: colors.accentLight,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.sm,
  },
  frequencyText: {
    fontSize: 12,
    fontWeight: "500",
    color: colors.accent,
  },
});
