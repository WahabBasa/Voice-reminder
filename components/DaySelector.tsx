import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { colors, spacing, borderRadius } from "../lib/theme";

const DAYS = [
  { key: "mon", label: "M" },
  { key: "tue", label: "T" },
  { key: "wed", label: "W" },
  { key: "thu", label: "T" },
  { key: "fri", label: "F" },
  { key: "sat", label: "S" },
  { key: "sun", label: "S" },
];

interface DaySelectorProps {
  selectedDays: string[];
  onToggle?: (day: string) => void;
  readonly?: boolean;
  size?: "small" | "normal";
}

export default function DaySelector({
  selectedDays,
  onToggle,
  readonly = false,
  size = "normal",
}: DaySelectorProps) {
  const isSmall = size === "small";
  const circleSize = isSmall ? 24 : 32;

  return (
    <View style={styles.container}>
      {DAYS.map((day) => {
        const isActive = selectedDays.includes(day.key);
        return (
          <TouchableOpacity
            key={day.key}
            style={[
              styles.dayCircle,
              { width: circleSize, height: circleSize },
              isActive && styles.dayCircleActive,
            ]}
            onPress={() => !readonly && onToggle?.(day.key)}
            disabled={readonly}
            activeOpacity={readonly ? 1 : 0.7}
          >
            <Text
              style={[
                styles.dayText,
                isSmall && styles.dayTextSmall,
                isActive && styles.dayTextActive,
              ]}
            >
              {day.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    gap: spacing.xs,
  },
  dayCircle: {
    borderRadius: borderRadius.full,
    borderWidth: 1.5,
    borderColor: colors.muted,
    justifyContent: "center",
    alignItems: "center",
  },
  dayCircleActive: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  dayText: {
    fontSize: 12,
    fontWeight: "600",
    color: colors.textSecondary,
  },
  dayTextSmall: {
    fontSize: 10,
  },
  dayTextActive: {
    color: "#fff",
  },
});
