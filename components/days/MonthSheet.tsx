import { useEffect, useMemo, useState } from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import AppIcon from "../AppIcon";
import { borderRadius, colors, scaleFontSize, shadows, spacing } from "../../lib/theme";
import { parseISODate, toISODate } from "../../lib/dayOccurrences";

const DAY_LETTERS = ["M", "T", "W", "T", "F", "S", "S"];

interface MonthSheetProps {
  visible: boolean;
  selectedDate: string;
  todayDate: string;
  onSelect: (dateISO: string) => void;
  onClose: () => void;
}

/** Compact month-grid bottom sheet for long jumps between days. */
export default function MonthSheet({
  visible,
  selectedDate,
  todayDate,
  onSelect,
  onClose,
}: MonthSheetProps) {
  const insets = useSafeAreaInsets();
  // Month being browsed, as a local first-of-month Date.
  const [monthDate, setMonthDate] = useState(() => {
    const d = parseISODate(selectedDate);
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });

  // Re-center on the selected date every time the sheet opens.
  useEffect(() => {
    if (visible) {
      const d = parseISODate(selectedDate);
      setMonthDate(new Date(d.getFullYear(), d.getMonth(), 1));
    }
  }, [visible, selectedDate]);

  const monthLabel = monthDate.toLocaleDateString([], { month: "long", year: "numeric" });

  // 7-wide rows; leading/trailing blanks are null.
  const weeks = useMemo(() => {
    const year = monthDate.getFullYear();
    const month = monthDate.getMonth();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const leadingBlanks = (new Date(year, month, 1).getDay() + 6) % 7; // Monday-start

    const cells: Array<string | null> = Array.from({ length: leadingBlanks }, () => null);
    for (let day = 1; day <= daysInMonth; day++) {
      cells.push(toISODate(new Date(year, month, day)));
    }
    while (cells.length % 7 !== 0) cells.push(null);

    const rows: Array<Array<string | null>> = [];
    for (let i = 0; i < cells.length; i += 7) {
      rows.push(cells.slice(i, i + 7));
    }
    return rows;
  }, [monthDate]);

  const shiftMonth = (delta: number) => {
    setMonthDate((prev) => new Date(prev.getFullYear(), prev.getMonth() + delta, 1));
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <View style={[styles.sheet, { paddingBottom: insets.bottom + spacing.md }]}>
        <View style={styles.handle} />

        <View style={styles.header}>
          <Pressable
            style={styles.navButton}
            onPress={() => shiftMonth(-1)}
            accessibilityRole="button"
            accessibilityLabel="Previous month"
          >
            <AppIcon name="chevron-left" size={20} color={colors.textPrimary} />
          </Pressable>
          <Text style={styles.monthLabel}>{monthLabel}</Text>
          <Pressable
            style={styles.navButton}
            onPress={() => shiftMonth(1)}
            accessibilityRole="button"
            accessibilityLabel="Next month"
          >
            <AppIcon name="chevron-right" size={20} color={colors.textPrimary} />
          </Pressable>
        </View>

        <View style={styles.letterRow}>
          {DAY_LETTERS.map((letter, index) => (
            <Text key={index} style={styles.letter}>
              {letter}
            </Text>
          ))}
        </View>

        {weeks.map((week, weekIndex) => (
          <View key={weekIndex} style={styles.weekRow}>
            {week.map((dateISO, cellIndex) => {
              if (!dateISO) {
                return <View key={cellIndex} style={styles.dayCell} />;
              }
              const isSelected = dateISO === selectedDate;
              const isToday = dateISO === todayDate;
              return (
                <Pressable
                  key={cellIndex}
                  style={styles.dayCell}
                  onPress={() => onSelect(dateISO)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: isSelected }}
                  accessibilityLabel={dateISO}
                >
                  <View
                    style={[
                      styles.dayCircle,
                      isToday && !isSelected && styles.todayRing,
                      isSelected && styles.selectedCircle,
                    ]}
                  >
                    <Text
                      style={[
                        styles.dayText,
                        isToday && !isSelected && styles.todayText,
                        isSelected && styles.selectedText,
                      ]}
                    >
                      {parseISODate(dateISO).getDate()}
                    </Text>
                  </View>
                </Pressable>
              );
            })}
          </View>
        ))}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: colors.overlay,
  },
  sheet: {
    backgroundColor: colors.card,
    borderTopLeftRadius: borderRadius.sheet,
    borderTopRightRadius: borderRadius.sheet,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    ...shadows.card,
  },
  handle: {
    alignSelf: "center",
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.muted,
    marginBottom: spacing.sm,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: spacing.sm,
  },
  navButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surface,
  },
  monthLabel: {
    fontSize: scaleFontSize(17),
    fontWeight: "600",
    color: colors.textPrimary,
  },
  letterRow: {
    flexDirection: "row",
    marginTop: spacing.xs,
    marginBottom: spacing.xs,
  },
  letter: {
    flex: 1,
    textAlign: "center",
    fontSize: scaleFontSize(12),
    fontWeight: "600",
    color: colors.textTertiary,
  },
  weekRow: {
    flexDirection: "row",
  },
  dayCell: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 3,
  },
  dayCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  selectedCircle: {
    backgroundColor: colors.textHeading,
  },
  todayRing: {
    borderWidth: 1.5,
    borderColor: colors.accent,
  },
  dayText: {
    fontSize: scaleFontSize(15),
    fontWeight: "500",
    color: colors.textPrimary,
  },
  todayText: {
    color: colors.accent,
  },
  selectedText: {
    color: colors.card,
  },
});
