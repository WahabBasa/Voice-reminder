import React, { useState, useMemo } from "react";
import {
  Modal,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { PortalHost } from "@gorhom/portal";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import AppIcon from "./AppIcon";
import PickerSheet from "./PickerSheet";
import { scaleFontSize } from "../lib/theme";

type Frequency = "minute" | "hour" | "daily" | "weekly";

type RepeatTaskModalProps = {
  visible: boolean;
  initialRepeatEnabled: boolean;
  initialFrequency: Frequency;
  initialInterval: number;
  initialDays?: string[];
  initialEndDate?: string;
  onConfirm: (data: {
    enabled: boolean;
    frequency: Frequency;
    interval: number;
    days?: string[];
    endDate?: string;
  }) => void;
  onCancel: () => void;
};

const FREQUENCIES: { label: string; value: Frequency }[] = [
  { label: "Minute", value: "minute" },
  { label: "Hour", value: "hour" },
  { label: "Daily", value: "daily" },
  { label: "Weekly", value: "weekly" },
];

const WEEKDAYS = [
  { label: "Sun", value: "sun" },
  { label: "Mon", value: "mon" },
  { label: "Tue", value: "tue" },
  { label: "Wed", value: "wed" },
  { label: "Thu", value: "thu" },
  { label: "Fri", value: "fri" },
  { label: "Sat", value: "sat" },
];

// Interval options by frequency
const INTERVAL_OPTIONS: Record<"minute" | "hour", number[]> = {
  minute: [15, 30, 45, 60, 90, 120, 180, 240, 360],
  hour: [1, 2, 3, 4, 6, 8, 12, 24],
};

export default function RepeatTaskModal({
  visible,
  initialRepeatEnabled,
  initialFrequency,
  initialInterval,
  initialDays = [],
  initialEndDate = "Endlessly",
  onConfirm,
  onCancel,
}: RepeatTaskModalProps) {
  const portalHostName = "repeatTaskModal";

  const [enabled, setEnabled] = useState(initialRepeatEnabled);
  const [frequency, setFrequency] = useState<Frequency>(initialFrequency);
  const [interval, setInterval] = useState(initialInterval);
  const [days, setDays] = useState<string[]>(initialDays);
  const [endDate, setEndDate] = useState(initialEndDate);

  // Picker sheet state
  const [showIntervalPicker, setShowIntervalPicker] = useState(false);

  const handleConfirm = () => {
    onConfirm({
      enabled,
      frequency,
      interval,
      days: frequency === "weekly" ? days : undefined,
      endDate,
    });
  };

  // Build interval picker options
  const intervalOptions = useMemo(() => {
    if (frequency === "daily" || frequency === "weekly") {
      return [{ value: 1, label: `1 ${frequency === "daily" ? "Day" : "Week"}` }];
    }

    const baseValues = INTERVAL_OPTIONS[frequency] || [1];
    // Include current interval if not in base values
    const values = Array.from(new Set([...baseValues, interval])).sort((a, b) => a - b);

    const unit = frequency === "minute" ? "Minute" : "Hour";
    return values.map((num) => ({
      value: num,
      label: `${num} ${unit}${num !== 1 ? "s" : ""}`,
    }));
  }, [frequency, interval]);

  const toggleDay = (day: string) => {
    setDays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]
    );
  };

  // Format current interval for display
  const intervalLabel = useMemo(() => {
    if (frequency === "daily") return "1 Day";
    if (frequency === "weekly") return "1 Week";
    const unit = frequency === "minute" ? "Minute" : "Hour";
    return `${interval} ${unit}${interval > 1 ? "s" : ""}`;
  }, [frequency, interval]);

  // Whether interval picker should be enabled
  const intervalPickerEnabled = frequency === "minute" || frequency === "hour";

  return (
    <>
      <Modal
        visible={visible}
        transparent
        animationType="fade"
        onRequestClose={onCancel}
      >
        <GestureHandlerRootView style={{ flex: 1 }}>
          <View style={styles.overlay}>
            <View style={styles.modal}>
            <View style={styles.header}>
              <Text style={styles.title}>Set as Repeat Task</Text>
              <Switch
                value={enabled}
                onValueChange={setEnabled}
                trackColor={{ false: "#e0e0e0", true: "#4285f4" }}
                thumbColor={enabled ? "#ffffff" : "#f5f5f5"}
              />
            </View>

            <View style={styles.frequencyContainer}>
              {FREQUENCIES.map((freq) => (
                <TouchableOpacity
                  key={freq.value}
                  style={[
                    styles.freqChip,
                    frequency === freq.value && styles.freqChipSelected,
                  ]}
                  onPress={() => {
                    setFrequency(freq.value);
                    if (freq.value === "daily" || freq.value === "weekly") {
                      setInterval(1);
                    }
                  }}
                  activeOpacity={0.7}
                >
                  <Text
                    style={[
                      styles.freqChipText,
                      frequency === freq.value && styles.freqChipTextSelected,
                    ]}
                  >
                    {freq.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <View style={styles.settingsSection}>
              <TouchableOpacity
                style={[
                  styles.settingsRow,
                  !intervalPickerEnabled && styles.settingsRowDisabled,
                ]}
                activeOpacity={intervalPickerEnabled ? 0.7 : 1}
                onPress={() => {
                  if (intervalPickerEnabled) {
                    setShowIntervalPicker(true);
                  }
                }}
              >
                <Text style={styles.settingsLabel}>Repeat every</Text>
                <View style={styles.settingsValueContainer}>
                  <Text style={styles.settingsValue}>{intervalLabel}</Text>
                  {intervalPickerEnabled && (
                    <AppIcon name="chevron-down" size={16} color="#9e9e9e" />
                  )}
                </View>
              </TouchableOpacity>

              {frequency === "weekly" && (
                <View style={styles.daysContainer}>
                  <Text style={[styles.settingsLabel, { marginBottom: 12 }]}>Repeat on</Text>
                  <View style={styles.weekdaysRow}>
                    {WEEKDAYS.map((day) => {
                      const isSelected = days.includes(day.value);
                      return (
                        <TouchableOpacity
                          key={day.value}
                          style={[
                            styles.dayCircle,
                            isSelected && styles.dayCircleSelected,
                          ]}
                          onPress={() => toggleDay(day.value)}
                        >
                          <Text
                            style={[
                              styles.dayCircleText,
                              isSelected && styles.dayCircleTextSelected,
                            ]}
                          >
                            {day.label[0]}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>
              )}

              {/* Repeat ends at - disabled for v1 */}
              <View style={[styles.settingsRow, styles.settingsRowDisabled]}>
                <Text style={styles.settingsLabel}>Repeat ends at</Text>
                <View style={styles.settingsValueContainer}>
                  <Text style={styles.settingsValueDisabled}>{endDate}</Text>
                </View>
              </View>
            </View>

            <View style={styles.actions}>
              <TouchableOpacity onPress={onCancel} style={styles.actionButton}>
                <Text style={styles.cancelText}>CANCEL</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={handleConfirm} style={styles.actionButton}>
                <Text style={styles.doneText}>DONE</Text>
              </TouchableOpacity>
            </View>
          </View>

            <PortalHost name={portalHostName} />
          </View>
        </GestureHandlerRootView>
      </Modal>

      {/* Interval Picker Sheet */}
      <PickerSheet
        visible={showIntervalPicker}
        title="Repeat every"
        mode="list"
        options={intervalOptions}
        selected={interval}
        onSelect={(value) => {
          setInterval(value as number);
          setShowIntervalPicker(false);
        }}
        onDismiss={() => setShowIntervalPicker(false)}
        hostName={portalHostName}
      />
    </>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.25)",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  modal: {
    backgroundColor: "#ffffff",
    borderRadius: 16,
    paddingVertical: 24,
    paddingHorizontal: 20,
    width: "100%",
    maxWidth: 360,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 24,
  },
  title: {
    fontSize: scaleFontSize(17),
    fontWeight: "700",
    color: "#212121",
  },
  frequencyContainer: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 24,
    gap: 4,
  },
  freqChip: {
    flex: 1,
    backgroundColor: "#f5f5f5",
    borderRadius: 6,
    paddingVertical: 10,
    alignItems: "center",
  },
  freqChipSelected: {
    backgroundColor: "#4285f4",
  },
  freqChipText: {
    fontSize: scaleFontSize(13),
    color: "#616161",
    fontWeight: "500",
  },
  freqChipTextSelected: {
    color: "#ffffff",
  },
  settingsSection: {
    marginBottom: 16,
  },
  settingsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 16,
    borderTopWidth: 1,
    borderTopColor: "#f0f0f0",
  },
  settingsRowDisabled: {
    opacity: 0.5,
  },
  settingsLabel: {
    fontSize: scaleFontSize(15),
    color: "#9e9e9e",
    fontWeight: "500",
  },
  settingsValueContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  settingsValue: {
    fontSize: scaleFontSize(14),
    color: "#424242",
  },
  settingsValueDisabled: {
    fontSize: scaleFontSize(14),
    color: "#bdbdbd",
  },
  daysContainer: {
    paddingVertical: 16,
    borderTopWidth: 1,
    borderTopColor: "#f0f0f0",
  },
  weekdaysRow: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  dayCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#f5f5f5",
    justifyContent: "center",
    alignItems: "center",
  },
  dayCircleSelected: {
    backgroundColor: "#4285f4",
  },
  dayCircleText: {
    fontSize: scaleFontSize(12),
    color: "#616161",
    fontWeight: "600",
  },
  dayCircleTextSelected: {
    color: "#ffffff",
  },
  actions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    marginTop: 8,
    gap: 24,
  },
  actionButton: {
    paddingVertical: 8,
    paddingHorizontal: 4,
  },
  cancelText: {
    fontSize: scaleFontSize(14),
    fontWeight: "600",
    color: "#4285f4",
  },
  doneText: {
    fontSize: scaleFontSize(14),
    fontWeight: "600",
    color: "#4285f4",
  },
});
