import React, { useState, useMemo } from "react";
import {
  Modal,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { PortalHost } from "@gorhom/portal";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import AppIcon from "./AppIcon";
import { scaleFontSize } from "../lib/theme";

type Frequency = "minute" | "hour" | "days" | "weekly";

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
  { label: "Days", value: "days" },
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

// No longer using INTERVAL_OPTIONS listed here

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
  const [frequency, setFrequency] = useState<Frequency>(
    initialFrequency === ("daily" as any) ? "days" : initialFrequency
  );
  const [interval, setIntervalValue] = useState(String(initialInterval));
  const [days, setDays] = useState<string[]>(initialDays);
  const [endDate, setEndDate] = useState(initialEndDate);

  const parsedInterval = parseInt(interval, 10) || 0;

  const isValid = useMemo(() => {
    if (!enabled) return true;
    if (frequency === "minute") return parsedInterval >= 15 && parsedInterval <= 360;
    if (frequency === "hour") return parsedInterval >= 1 && parsedInterval <= 168;
    if (frequency === "days") return parsedInterval >= 1 && parsedInterval <= 30;
    if (frequency === "weekly") return days.length > 0;
    return true;
  }, [enabled, frequency, parsedInterval, days]);

  const handleConfirm = () => {
    if (!isValid) return;
    onConfirm({
      enabled,
      frequency,
      interval: parsedInterval,
      days: frequency === "weekly" ? days : undefined,
      endDate,
    });
  };

  const toggleDay = (day: string) => {
    setDays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]
    );
  };

  // Format unit label
  const unitLabel = useMemo(() => {
    if (frequency === "days") return parsedInterval === 1 ? "Day" : "Days";
    if (frequency === "weekly") return "";
    const unit = frequency === "minute" ? "Minute" : "Hour";
    return `${unit}${parsedInterval !== 1 ? "s" : ""}`;
  }, [frequency, parsedInterval]);

  // Whether interval input should be shown
  const showIntervalInput = frequency !== "weekly";

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
                      if (freq.value === "days" || freq.value === "weekly") {
                        setIntervalValue("1");
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
                {showIntervalInput && (
                  <View style={styles.settingsRow}>
                    <Text style={styles.settingsLabel}>Repeat every</Text>
                    <View style={styles.settingsValueContainer}>
                      <TextInput
                        style={styles.intervalInput}
                        value={interval}
                        onChangeText={setIntervalValue}
                        keyboardType="number-pad"
                        placeholder="1"
                        placeholderTextColor="#bdbdbd"
                      />
                      <Text style={styles.unitText}>{unitLabel}</Text>
                    </View>
                  </View>
                )}

                {frequency === "minute" && (
                  <Text style={styles.hintText}>
                    {parsedInterval < 15 ? "Minimum 15 minutes" : parsedInterval > 360 ? "Maximum 360 minutes (6 hours)" : "15-360 minutes"}
                  </Text>
                )}

                {frequency === "hour" && (
                  <Text style={styles.hintText}>
                    {parsedInterval < 1 ? "Minimum 1 hour" : parsedInterval > 168 ? "Maximum 168 hours (7 days)" : "1-168 hours"}
                  </Text>
                )}

                {frequency === "days" && (
                  <Text style={styles.hintText}>
                    {parsedInterval < 1 || parsedInterval > 30 ? "Enter 1-30 days" : "Calendar-based, same time each occurrence"}
                  </Text>
                )}

                {(frequency === "minute" || frequency === "hour") && (
                  <Text style={styles.infoNote}>Note: Time setting is ignored for interval reminders</Text>
                )}

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
                <TouchableOpacity onPress={handleConfirm} style={[styles.actionButton, !isValid && { opacity: 0.5 }]} disabled={!isValid}>
                  <Text style={styles.doneText}>DONE</Text>
                </TouchableOpacity>
              </View>
            </View>

            <PortalHost name={portalHostName} />
          </View>
        </GestureHandlerRootView>
      </Modal>
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
    fontWeight: "500",
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
  intervalInput: {
    fontSize: scaleFontSize(16),
    color: "#424242",
    fontWeight: "600",
    borderBottomWidth: 1,
    borderBottomColor: "#4285f4",
    paddingHorizontal: 4,
    minWidth: 40,
    textAlign: "center",
  },
  unitText: {
    fontSize: scaleFontSize(15),
    color: "#424242",
  },
  hintText: {
    fontSize: scaleFontSize(12),
    color: "#9e9e9e",
    marginTop: -8,
    marginBottom: 16,
    marginLeft: 4,
  },
  infoNote: {
    fontSize: scaleFontSize(11),
    color: "#f44336",
    fontStyle: "italic",
    marginTop: 8,
  },
});
