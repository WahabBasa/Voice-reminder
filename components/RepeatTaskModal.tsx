import React, { useEffect, useState } from "react";
import {
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import DaySelector from "./DaySelector";
import {
  EVERY_N_DAYS_MAX,
  EVERY_N_DAYS_MIN,
  type DaysMode,
} from "./schedule/scheduleDraft";
import { borderRadius, colors, scaleFontSize } from "../lib/theme";

/**
 * The days axis of the schedule grid (OLD-99): every day | specific weekdays |
 * every N days | one date.
 *
 * It used to be a frequency list that mixed both axes together — "Minute",
 * "Hour", "Days", "Weekly" — so an hourly reminder could not also be a Thursday
 * reminder. The times axis now lives in TimesEditor and this picker only answers
 * "which days". Picking "On a date" just selects the mode; the sheet's own Date
 * row is where the calendar opens.
 */

type DaysValue = {
  mode: DaysMode;
  weekdays: string[];
  everyNDays: number;
};

type RepeatTaskModalProps = {
  visible: boolean;
  mode: DaysMode;
  weekdays: string[];
  everyNDays: number;
  onConfirm: (value: DaysValue) => void;
  onCancel: () => void;
};

const MODES: { label: string; value: DaysMode }[] = [
  { label: "Every day", value: "everyday" },
  { label: "Weekly", value: "weekdays" },
  { label: "Every N days", value: "everyNDays" },
  { label: "On a date", value: "date" },
];

export default function RepeatTaskModal({
  visible,
  mode: initialMode,
  weekdays: initialWeekdays,
  everyNDays: initialEveryNDays,
  onConfirm,
  onCancel,
}: RepeatTaskModalProps) {
  const [mode, setMode] = useState<DaysMode>(initialMode);
  const [weekdays, setWeekdays] = useState<string[]>(initialWeekdays);
  const [everyNDays, setEveryNDays] = useState(initialEveryNDays);

  // The sheet keeps this mounted only while open, but re-syncing on open keeps a
  // cancelled edit from leaking into the next one.
  useEffect(() => {
    if (!visible) return;
    setMode(initialMode);
    setWeekdays(initialWeekdays);
    setEveryNDays(initialEveryNDays);
  }, [visible, initialMode, initialWeekdays, initialEveryNDays]);

  const toggleDay = (day: string) => {
    setWeekdays((prev) => (prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]));
  };

  const stepEveryNDays = (delta: number) => {
    setEveryNDays((prev) =>
      Math.max(EVERY_N_DAYS_MIN, Math.min(EVERY_N_DAYS_MAX, (prev || EVERY_N_DAYS_MIN) + delta))
    );
  };

  const isValid = mode !== "weekdays" || weekdays.length > 0;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <View style={styles.overlay}>
          <View style={styles.modal}>
            <Text style={styles.title}>Repeat</Text>

            <View style={styles.modeGrid}>
              {MODES.map((option) => {
                const selected = mode === option.value;
                return (
                  <TouchableOpacity
                    key={option.value}
                    style={[styles.modeChip, selected && styles.modeChipSelected]}
                    onPress={() => setMode(option.value)}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.modeChipText, selected && styles.modeChipTextSelected]}>
                      {option.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {mode === "everyday" ? (
              <Text style={styles.hint}>Rings every day at the times you set.</Text>
            ) : null}

            {mode === "weekdays" ? (
              <View style={styles.section}>
                <Text style={styles.sectionLabel}>Repeat on</Text>
                <DaySelector selectedDays={weekdays} onToggle={toggleDay} />
                {weekdays.length === 0 ? (
                  <Text style={styles.hint}>Pick at least one day.</Text>
                ) : null}
              </View>
            ) : null}

            {mode === "everyNDays" ? (
              <View style={styles.section}>
                <Text style={styles.sectionLabel}>Repeat every</Text>
                <View style={styles.stepper}>
                  <TouchableOpacity
                    style={styles.stepperButton}
                    onPress={() => stepEveryNDays(-1)}
                    disabled={everyNDays <= EVERY_N_DAYS_MIN}
                    activeOpacity={0.7}
                  >
                    <Text
                      style={[
                        styles.stepperGlyph,
                        everyNDays <= EVERY_N_DAYS_MIN && styles.stepperGlyphDisabled,
                      ]}
                    >
                      −
                    </Text>
                  </TouchableOpacity>
                  <Text style={styles.stepperValue}>{everyNDays} days</Text>
                  <TouchableOpacity
                    style={styles.stepperButton}
                    onPress={() => stepEveryNDays(1)}
                    disabled={everyNDays >= EVERY_N_DAYS_MAX}
                    activeOpacity={0.7}
                  >
                    <Text
                      style={[
                        styles.stepperGlyph,
                        everyNDays >= EVERY_N_DAYS_MAX && styles.stepperGlyphDisabled,
                      ]}
                    >
                      +
                    </Text>
                  </TouchableOpacity>
                </View>
                <Text style={styles.hint}>Counts from the start date, same times each turn.</Text>
              </View>
            ) : null}

            {mode === "date" ? (
              <Text style={styles.hint}>Rings once, on the date you pick below.</Text>
            ) : null}

            <View style={styles.actions}>
              <TouchableOpacity onPress={onCancel} style={styles.actionButton} activeOpacity={0.7}>
                <Text style={styles.cancelText}>CANCEL</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => isValid && onConfirm({ mode, weekdays, everyNDays })}
                style={[styles.actionButton, !isValid && styles.actionButtonDisabled]}
                disabled={!isValid}
                activeOpacity={0.7}
              >
                <Text style={styles.doneText}>DONE</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </GestureHandlerRootView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: colors.overlay,
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  modal: {
    backgroundColor: colors.card,
    borderRadius: borderRadius.card,
    paddingVertical: 22,
    paddingHorizontal: 20,
    width: "100%",
    maxWidth: 360,
  },
  title: {
    fontSize: scaleFontSize(17),
    fontWeight: "700",
    color: colors.textHeading,
    marginBottom: 18,
  },
  modeGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  modeChip: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: borderRadius.full,
    paddingVertical: 9,
    paddingHorizontal: 14,
  },
  modeChipSelected: {
    backgroundColor: colors.accent,
  },
  modeChipText: {
    fontSize: scaleFontSize(13),
    fontWeight: "500",
    color: colors.textSecondary,
  },
  modeChipTextSelected: {
    color: "#ffffff",
  },
  section: {
    marginTop: 20,
    gap: 12,
  },
  sectionLabel: {
    fontSize: scaleFontSize(13),
    fontWeight: "600",
    color: colors.textLabel,
  },
  stepper: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
  },
  stepperButton: {
    width: 36,
    height: 36,
    borderRadius: borderRadius.full,
    backgroundColor: colors.surfaceAlt,
    alignItems: "center",
    justifyContent: "center",
  },
  stepperGlyph: {
    fontSize: scaleFontSize(20),
    fontWeight: "600",
    color: colors.textPrimary,
    lineHeight: scaleFontSize(22),
  },
  stepperGlyphDisabled: {
    color: colors.textTertiary,
  },
  stepperValue: {
    fontSize: scaleFontSize(15),
    fontWeight: "600",
    color: colors.textPrimary,
    minWidth: 78,
    textAlign: "center",
  },
  hint: {
    marginTop: 14,
    fontSize: scaleFontSize(12),
    color: colors.textSecondary,
  },
  actions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    marginTop: 22,
    gap: 24,
  },
  actionButton: {
    paddingVertical: 8,
    paddingHorizontal: 4,
  },
  actionButtonDisabled: {
    opacity: 0.4,
  },
  cancelText: {
    fontSize: scaleFontSize(14),
    fontWeight: "600",
    color: colors.textSecondary,
  },
  doneText: {
    fontSize: scaleFontSize(14),
    fontWeight: "600",
    color: colors.accent,
  },
});
