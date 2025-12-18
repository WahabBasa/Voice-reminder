import { View, Text, StyleSheet, Pressable, TouchableOpacity } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { colors, spacing } from "../lib/theme";
import { formatNextTrigger, getNextTriggerTime } from "../lib/time";
import AppIcon from "./AppIcon";

interface ReminderCardProps {
  id: string;
  title: string;
  time: string;
  frequency: string;
  days?: string[];
  isCompleted?: boolean;
  onPress: () => void;
  onDelete: () => void;
  onMarkDone?: () => void;
}

const DELETE_THRESHOLD = -80;

export default function ReminderCard({
  title,
  time,
  frequency,
  days = [],
  isCompleted = false,
  onPress,
  onDelete,
  onMarkDone,
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

  const DAY_ABBREV: Record<string, string> = {
    mon: "Mon",
    tue: "Tue",
    wed: "Wed",
    thu: "Thu",
    fri: "Fri",
    sat: "Sat",
    sun: "Sun",
  };

  const getFrequencyLabel = () => {
    if (frequency === "once") return "Once";
    if (frequency === "daily") return "Daily";
    if (frequency === "custom" && days.length > 0) {
      const dayOrder = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
      const sortedDays = [...days].sort((a, b) => dayOrder.indexOf(a) - dayOrder.indexOf(b));
      return sortedDays.map(d => DAY_ABBREV[d] || d).join(", ");
    }
    if (frequency === "weekly") return "Weekly";
    return frequency;
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
            <View style={styles.iconBadge}>
              <AppIcon name="bell" size={24} color={colors.textSecondary} />
            </View>

            <View style={styles.infoContainer}>
              <Text style={styles.title} numberOfLines={1}>
                {title}
              </Text>
              <Text style={styles.frequencyText}>{getFrequencyLabel()} at {time}</Text>
              <View style={styles.timeRow}>
                <AppIcon name="clock" size={16} color={colors.textSecondary} />
                <Text style={styles.nextText}>{nextTriggerStr}</Text>
              </View>
            </View>

            {isCompleted ? (
              <View style={styles.doneBadge}>
                <AppIcon name="check-circle" size={20} color="#4CAF50" />
                <Text style={styles.doneText}>Done</Text>
              </View>
            ) : (
              onMarkDone && (
                <TouchableOpacity
                  style={styles.doneButton}
                  onPress={(e) => {
                    e.stopPropagation();
                    onMarkDone();
                  }}
                  activeOpacity={0.85}
                >
                  <Text style={styles.doneButtonText}>Done</Text>
                </TouchableOpacity>
              )
            )}
          </Pressable>
        </Animated.View>
      </GestureDetector>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: 12,
  },
  deleteAction: {
    position: "absolute",
    right: 0,
    top: 0,
    bottom: 12,
    width: 100,
    backgroundColor: colors.destructive,
    borderRadius: 16,
    justifyContent: "center",
    alignItems: "flex-end",
    paddingRight: spacing.lg,
  },
  deleteButton: {
    padding: spacing.sm,
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#e0e0e0",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 3,
  },
  cardContent: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
  },
  cardPressed: {
    opacity: 0.95,
  },
  iconBadge: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: colors.muted,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 15,
  },
  infoContainer: {
    flex: 1,
  },
  title: {
    fontSize: 16,
    fontWeight: "600",
    color: "#333",
    marginBottom: 4,
  },
  frequencyText: {
    fontSize: 14,
    color: "#666",
    marginBottom: 4,
  },
  timeRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  nextText: {
    marginLeft: 5,
    fontSize: 14,
    color: "#666",
  },
  doneButton: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: colors.accent,
    justifyContent: "center",
    alignItems: "center",
    marginLeft: 10,
  },
  doneButtonText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 14,
  },
  doneBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#E8F5E9",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    marginLeft: 10,
  },
  doneText: {
    color: "#4CAF50",
    fontWeight: "600",
    fontSize: 14,
    marginLeft: 4,
  },
});
