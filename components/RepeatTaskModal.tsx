import React, { useState } from "react";
import {
  Alert,
  Modal,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import AppIcon from "./AppIcon";
import { scaleFontSize } from "../lib/theme";

type Frequency = "hour" | "daily" | "weekly" | "monthly" | "yearly";

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
  { label: "Hour", value: "hour" },
  { label: "Daily", value: "daily" },
  { label: "Weekly", value: "weekly" },
  { label: "Monthly", value: "monthly" },
  { label: "Yearly", value: "yearly" },
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
  const [enabled, setEnabled] = useState(initialRepeatEnabled);
  const [frequency, setFrequency] = useState<Frequency>(initialFrequency);
  const [interval, setInterval] = useState(initialInterval);
  const [days, setDays] = useState<string[]>(initialDays);
  const [endDate, setEndDate] = useState(initialEndDate);

  const handleConfirm = () => {
    onConfirm({
      enabled,
      frequency,
      interval,
      days: frequency === "weekly" ? days : undefined,
      endDate,
    });
  };

  const openIntervalPicker = () => {
    const options = [1, 2, 3, 4, 5, 6, 10, 12, 24].map((num) => ({
      text: `${num} ${frequency.charAt(0).toUpperCase() + frequency.slice(1)}${num > 1 ? "s" : ""}`,
      onPress: () => setInterval(num),
    }));
    Alert.alert("Repeat every", undefined, [...options, { text: "Cancel", style: "cancel" }]);
  };

  const toggleDay = (day: string) => {
    setDays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]
    );
  };

  const openDaysPicker = () => {
    // In a real app, this might be another modal, but for now we'll just show a selection
    // Or we could implement it inline. Let's try to keep it simple with Alert for now
    // but weekly days usually need multi-select.
  };

  const openEndDatePicker = () => {
    Alert.alert("Repeat ends at", undefined, [
      { text: "Endlessly", onPress: () => setEndDate("Endlessly") },
      { text: "Select Date", onPress: () => {} }, // Placeholder
      { text: "Cancel", style: "cancel" },
    ]);
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onCancel}
    >
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
                onPress={() => setFrequency(freq.value)}
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
              style={styles.settingsRow}
              activeOpacity={0.7}
              onPress={openIntervalPicker}
            >
              <Text style={styles.settingsLabel}>Repeat every</Text>
              <View style={styles.settingsValueContainer}>
                <Text style={styles.settingsValue}>
                  {interval} {frequency.charAt(0).toUpperCase() + frequency.slice(1)}
                  {interval > 1 ? "s" : ""}
                </Text>
                <AppIcon name="chevron-down" size={16} color="#9e9e9e" />
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

            <TouchableOpacity
              style={styles.settingsRow}
              activeOpacity={0.7}
              onPress={openEndDatePicker}
            >
              <Text style={styles.settingsLabel}>Repeat ends at</Text>
              <View style={styles.settingsValueContainer}>
                <Text style={styles.settingsValue}>{endDate}</Text>
                <AppIcon name="chevron-down" size={16} color="#9e9e9e" />
              </View>
            </TouchableOpacity>
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
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
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
