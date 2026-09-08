import { useEffect, useMemo, useRef } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";
import { colors, scaleFontSize, spacing } from "../../lib/theme";
import { FONT_DISPLAY } from "../../lib/fonts";
import { addDaysISO, parseISODate } from "../../lib/dayOccurrences";

const DAY_LETTERS = ["M", "T", "W", "T", "F", "S", "S"];
const SLIDE_DISTANCE = 48;
const SPRING_CONFIG = { damping: 26, stiffness: 260, mass: 1 };

/** Monday-start ISO date of the week containing dateISO. */
export function weekStartISO(dateISO: string): string {
  const offset = (parseISODate(dateISO).getDay() + 6) % 7;
  return addDaysISO(dateISO, -offset);
}

/** The 7 ISO dates of the Monday-start week containing dateISO. */
export function weekDatesFor(dateISO: string): string[] {
  const start = weekStartISO(dateISO);
  return DAY_LETTERS.map((_, i) => addDaysISO(start, i));
}

interface WeekStripProps {
  selectedDate: string;
  todayDate: string;
  overdueDates: ReadonlySet<string>;
  onSelectDate: (dateISO: string) => void;
}

export default function WeekStrip({
  selectedDate,
  todayDate,
  overdueDates,
  onSelectDate,
}: WeekStripProps) {
  const weekDates = useMemo(() => weekDatesFor(selectedDate), [selectedDate]);
  const weekKey = weekDates[0];

  // Slide the strip in from the flip direction when the week changes.
  const slideX = useSharedValue(0);
  const prevWeekRef = useRef(weekKey);
  useEffect(() => {
    const prev = prevWeekRef.current;
    if (prev !== weekKey) {
      prevWeekRef.current = weekKey;
      slideX.value = weekKey > prev ? SLIDE_DISTANCE : -SLIDE_DISTANCE;
      slideX.value = withSpring(0, SPRING_CONFIG);
    }
  }, [weekKey, slideX]);

  const slideStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: slideX.value }],
  }));

  return (
    <Animated.View style={[styles.row, slideStyle]}>
      {weekDates.map((dateISO, index) => {
        const isSelected = dateISO === selectedDate;
        const isToday = dateISO === todayDate;
        const dayNumber = parseISODate(dateISO).getDate();

        return (
          <Pressable
            key={dateISO}
            style={[styles.dayColumn, isSelected && styles.dayColumnSelected]}
            onPress={() => onSelectDate(dateISO)}
            accessibilityRole="button"
            accessibilityState={{ selected: isSelected }}
            accessibilityLabel={dateISO}
          >
            <Text style={styles.dayLetter}>{DAY_LETTERS[index]}</Text>
            <Text
              style={[
                styles.dateText,
                isSelected && styles.selectedText,
                isToday && !isSelected && styles.todayText,
              ]}
            >
              {dayNumber}
            </Text>
            <View testID={isToday ? `today-mark:${dateISO}` : undefined}
              style={[styles.todayMark, !isToday && styles.underlineHidden]} />
            <View testID={isSelected ? `selected-mark:${dateISO}` : undefined}
              style={[styles.underline, !isSelected && styles.underlineHidden]} />
            <View style={styles.dotRow}>
              {overdueDates.has(dateISO) && <View testID={`overdue-dot:${dateISO}`} style={styles.dot} />}
            </View>
          </Pressable>
        );
      })}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    paddingHorizontal: spacing.sm,
  },
  dayColumn: {
    flex: 1,
    alignItems: "center",
    paddingVertical: spacing.sm,
    marginHorizontal: 3,
    borderRadius: 14,
  },
  // Tiimo-style selection: the whole letter+number column sits in a soft rect.
  dayColumnSelected: {
    backgroundColor: colors.surface,
  },
  dayLetter: {
    fontSize: scaleFontSize(12),
    fontWeight: "500",
    lineHeight: scaleFontSize(16),
    letterSpacing: 0.3,
    color: colors.textTertiary,
    marginBottom: spacing.xs,
  },
  // Serif numerals, per the Tiimo reference.
  dateText: {
    fontFamily: FONT_DISPLAY,
    fontSize: scaleFontSize(18),
    lineHeight: scaleFontSize(24),
    color: colors.textSecondary,
  },
  todayText: {
    color: colors.accent,
  },
  selectedText: {
    color: colors.textHeading,
  },
  todayMark: { width: 14, height: 2, borderRadius: 1, marginTop: 3, backgroundColor: colors.accent },
  underline: {
    width: 14,
    height: 4,
    borderRadius: 2,
    marginTop: 3,
    backgroundColor: colors.textHeading,
  },
  underlineHidden: {
    opacity: 0,
  },
  dotRow: {
    flexDirection: "row",
    gap: 3,
    height: 6,
    marginTop: spacing.xs,
    alignItems: "center",
  },
  dot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.statusOverdue,
  },
});
