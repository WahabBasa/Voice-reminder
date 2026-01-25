import { useCallback, useMemo, useState } from "react";
import {
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { PortalHost } from "@gorhom/portal";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { TimerPickerModal } from "react-native-timer-picker";
import { LinearGradient } from "expo-linear-gradient";
import AppIcon, { AppIconName } from "./AppIcon";
import PickerSheet from "./PickerSheet";
import { scaleFontSize } from "../lib/theme";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = [
  "JANUARY", "FEBRUARY", "MARCH", "APRIL", "MAY", "JUNE",
  "JULY", "AUGUST", "SEPTEMBER", "OCTOBER", "NOVEMBER", "DECEMBER"
];

const REMINDER_OPTIONS = [
  { value: "none", label: "None" },
  { value: "5min", label: "5 minutes before" },
  { value: "15min", label: "15 minutes before" },
  { value: "30min", label: "30 minutes before" },
  { value: "1hour", label: "1 hour before" },
  { value: "1day", label: "1 day before" },
];

const REPEAT_OPTIONS = [
  { value: "none", label: "No Repeat" },
  { value: "daily", label: "Daily" },
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly Repeat" },
  { value: "yearly", label: "Yearly" },
];

type SettingsRowProps = {
  icon: AppIconName;
  label: string;
  value?: string;
  onPress?: () => void;
};

function SettingsRow({ icon, label, value, onPress }: SettingsRowProps) {
  return (
    <TouchableOpacity style={styles.settingsRow} onPress={onPress} activeOpacity={0.7}>
      <View style={styles.settingsRowLeft}>
        <AppIcon name={icon} size={20} color="#757575" />
        <Text style={styles.settingsRowLabel}>{label}</Text>
      </View>
      {value ? <Text style={styles.settingsRowValue}>{value}</Text> : null}
    </TouchableOpacity>
  );
}

type DatePickerModalProps = {
  visible: boolean;
  initialDate?: Date | null;
  initialTime?: { hours: number; minutes: number } | null;
  initialReminder?: string;
  initialRepeat?: string;
  onConfirm: (data: {
    date: Date | null;
    time: { hours: number; minutes: number };
    reminder: string;
    repeat: string;
  }) => void;
  onCancel: () => void;
};

export default function DatePickerModal({
  visible,
  initialDate,
  initialTime,
  initialReminder = "none",
  initialRepeat = "none",
  onConfirm,
  onCancel,
}: DatePickerModalProps) {
  const portalHostName = "datePickerModal";

  const today = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);

  const [viewDate, setViewDate] = useState(() => initialDate || new Date());
  const [selectedDate, setSelectedDate] = useState<Date | null>(initialDate || null);
  const [selectedTime, setSelectedTime] = useState(() => initialTime || { hours: 10, minutes: 0 });
  const [selectedReminder, setSelectedReminder] = useState(initialReminder);
  const [selectedRepeat, setSelectedRepeat] = useState(initialRepeat);

  const [showTimePicker, setShowTimePicker] = useState(false);
  const [showReminderPicker, setShowReminderPicker] = useState(false);
  const [showRepeatPicker, setShowRepeatPicker] = useState(false);

  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();

  const calendarDays = useMemo(() => {
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const startDayOfWeek = firstDay.getDay();
    const daysInMonth = lastDay.getDate();

    const days: Array<{ date: Date; isCurrentMonth: boolean }> = [];

    // Previous month days
    const prevMonthLastDay = new Date(year, month, 0).getDate();
    for (let i = startDayOfWeek - 1; i >= 0; i--) {
      days.push({
        date: new Date(year, month - 1, prevMonthLastDay - i),
        isCurrentMonth: false,
      });
    }

    // Current month days
    for (let i = 1; i <= daysInMonth; i++) {
      days.push({
        date: new Date(year, month, i),
        isCurrentMonth: true,
      });
    }

    // Next month days to fill grid (6 rows)
    const remaining = 42 - days.length;
    for (let i = 1; i <= remaining; i++) {
      days.push({
        date: new Date(year, month + 1, i),
        isCurrentMonth: false,
      });
    }

    return days;
  }, [year, month]);

  const goToPrevMonth = () => {
    setViewDate(new Date(year, month - 1, 1));
  };

  const goToNextMonth = () => {
    setViewDate(new Date(year, month + 1, 1));
  };

  const isSameDay = (d1: Date, d2: Date) => {
    return d1.getFullYear() === d2.getFullYear() &&
      d1.getMonth() === d2.getMonth() &&
      d1.getDate() === d2.getDate();
  };

  const selectQuickDate = useCallback((offset: number | "sunday" | null) => {
    if (offset === null) {
      setSelectedDate(null);
      return;
    }
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    if (offset === "sunday") {
      const dayOfWeek = d.getDay();
      const daysUntilSunday = dayOfWeek === 0 ? 7 : 7 - dayOfWeek;
      d.setDate(d.getDate() + daysUntilSunday);
    } else {
      d.setDate(d.getDate() + offset);
    }
    setSelectedDate(d);
    setViewDate(d);
  }, []);

  const formatTime = (t: { hours: number; minutes: number }) => {
    const h = t.hours % 12 || 12;
    const m = t.minutes.toString().padStart(2, "0");
    const ampm = t.hours >= 12 ? "pm" : "am";
    return `${h}:${m} ${ampm}`;
  };

  const reminderLabel = useMemo(() => {
    return REMINDER_OPTIONS.find((o) => o.value === selectedReminder)?.label || "None";
  }, [selectedReminder]);

  const repeatLabel = useMemo(() => {
    return REPEAT_OPTIONS.find((o) => o.value === selectedRepeat)?.label || "No Repeat";
  }, [selectedRepeat]);

  const openTimePicker = () => setShowTimePicker(true);
  const openReminderPicker = () => setShowReminderPicker(true);
  const openRepeatPicker = () => setShowRepeatPicker(true);

  const handleDone = () => {
    onConfirm({
      date: selectedDate,
      time: selectedTime,
      reminder: selectedReminder,
      repeat: selectedRepeat,
    });
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onCancel}
    >
      <GestureHandlerRootView style={{ flex: 1 }}>
        <View style={styles.overlay}>
          <View style={styles.modal}>
          {/* Month Navigation */}
          <View style={styles.monthNav}>
            <TouchableOpacity onPress={goToPrevMonth} style={styles.navButton}>
              <AppIcon name="chevron-left" size={20} color="#757575" />
            </TouchableOpacity>
            <Text style={styles.monthTitle}>
              {MONTHS[month]}  {year}
            </Text>
            <TouchableOpacity onPress={goToNextMonth} style={styles.navButton}>
              <AppIcon name="chevron-right" size={20} color="#757575" />
            </TouchableOpacity>
          </View>

          {/* Day Headers */}
          <View style={styles.dayHeaders}>
            {DAYS.map((day) => (
              <Text key={day} style={styles.dayHeader}>{day}</Text>
            ))}
          </View>

          {/* Calendar Grid */}
          <View style={styles.calendarGrid}>
            {calendarDays.map((item, index) => {
              const isToday = isSameDay(item.date, today);
              const isSelected = selectedDate && isSameDay(item.date, selectedDate);
              return (
                <TouchableOpacity
                  key={index}
                  style={[
                    styles.dayCell,
                    isSelected && styles.dayCellSelected,
                  ]}
                  onPress={() => {
                    setSelectedDate(item.date);
                  }}
                >
                  <Text
                    style={[
                      styles.dayText,
                      !item.isCurrentMonth && styles.dayTextMuted,
                      isToday && !isSelected && styles.dayTextToday,
                      isSelected && styles.dayTextSelected,
                    ]}
                  >
                    {item.date.getDate()}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Quick Select Chips */}
          <View style={styles.quickSelect}>
            <TouchableOpacity style={styles.chip} onPress={() => selectQuickDate(null)}>
              <Text style={styles.chipText}>No Date</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.chip} onPress={() => selectQuickDate(0)}>
              <Text style={styles.chipText}>Today</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.chip} onPress={() => selectQuickDate(1)}>
              <Text style={styles.chipText}>Tomorrow</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.quickSelect}>
            <TouchableOpacity style={styles.chip} onPress={() => selectQuickDate(3)}>
              <Text style={styles.chipText}>3 Days Later</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.chip} onPress={() => selectQuickDate("sunday")}>
              <Text style={styles.chipText}>This Sunday</Text>
            </TouchableOpacity>
          </View>

          {/* Settings Rows */}
          <View style={styles.settingsSection}>
            <View style={styles.separator} />
            <SettingsRow
              icon="clock"
              label="Time"
              value={formatTime(selectedTime)}
              onPress={openTimePicker}
            />
            <View style={styles.separator} />
            <SettingsRow
              icon="bell"
              label="Reminder"
              value={reminderLabel}
              onPress={openReminderPicker}
            />
            <View style={styles.separator} />
            <SettingsRow
              icon="refresh-cw"
              label="Repeat"
              value={repeatLabel}
              onPress={openRepeatPicker}
            />
          </View>

          {/* Action Buttons */}
          <View style={styles.actions}>
            <TouchableOpacity onPress={onCancel} style={styles.actionButton}>
              <Text style={styles.cancelText}>CANCEL</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={handleDone} style={styles.actionButton}>
              <Text style={styles.doneText}>DONE</Text>
            </TouchableOpacity>
          </View>
        </View>

          <PortalHost name={portalHostName} />
        </View>
      </GestureHandlerRootView>

      {showTimePicker ? (
        <TimerPickerModal
          closeOnOverlayPress
          LinearGradient={LinearGradient}
          hideDays
          visible={showTimePicker}
          setIsVisible={setShowTimePicker}
          modalTitle="Select time"
          onCancel={() => setShowTimePicker(false)}
          amLabel="AM"
          pmLabel="PM"
          initialValue={{
            hours: selectedTime.hours,
            minutes: selectedTime.minutes,
          }}
          onConfirm={({ hours, minutes, seconds }) => {
            const isPm = (seconds ?? 0) >= 12;
            const hour24 = (hours % 12) + (isPm ? 12 : 0);
            setSelectedTime({ hours: hour24, minutes });
            setShowTimePicker(false);
          }}
          styles={{ theme: "light" }}
          useAmPmWheel
          use12HourPicker
        />
      ) : null}

      <PickerSheet
        visible={showReminderPicker}
        title="Reminder"
        mode="list"
        options={REMINDER_OPTIONS}
        selected={selectedReminder}
        onSelect={(value) => {
          setSelectedReminder(String(value));
          setShowReminderPicker(false);
        }}
        onDismiss={() => setShowReminderPicker(false)}
        hostName={portalHostName}
      />

      <PickerSheet
        visible={showRepeatPicker}
        title="Repeat"
        mode="list"
        options={REPEAT_OPTIONS}
        selected={selectedRepeat}
        onSelect={(value) => {
          setSelectedRepeat(String(value));
          setShowRepeatPicker(false);
        }}
        onDismiss={() => setShowRepeatPicker(false)}
        hostName={portalHostName}
      />
    </Modal>
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
    borderRadius: 12,
    paddingVertical: 16,
    paddingHorizontal: 12,
    width: "100%",
    maxWidth: 340,
  },
  monthNav: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },
  navButton: {
    padding: 8,
  },
  monthTitle: {
    fontSize: scaleFontSize(14),
    fontWeight: "500",
    color: "#212121",
    marginHorizontal: 16,
  },
  dayHeaders: {
    flexDirection: "row",
    marginBottom: 8,
  },
  dayHeader: {
    flex: 1,
    textAlign: "center",
    fontSize: scaleFontSize(12),
    fontWeight: "500",
    color: "#757575",
  },
  calendarGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
  },
  dayCell: {
    width: "14.28%",
    aspectRatio: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  dayCellSelected: {
    backgroundColor: "#4285f4",
    borderRadius: 50,
  },
  dayText: {
    fontSize: scaleFontSize(14),
    color: "#212121",
  },
  dayTextMuted: {
    color: "#bdbdbd",
  },
  dayTextToday: {
    color: "#4285f4",
    fontWeight: "600",
  },
  dayTextSelected: {
    color: "#ffffff",
    fontWeight: "600",
  },
  quickSelect: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 12,
    paddingHorizontal: 4,
  },
  chip: {
    backgroundColor: "#f5f5f5",
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: "#e0e0e0",
  },
  chipText: {
    fontSize: scaleFontSize(12),
    color: "#616161",
  },
  settingsSection: {
    marginTop: 16,
  },
  separator: {
    height: 1,
    backgroundColor: "#e0e0e0",
  },
  settingsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 14,
    paddingHorizontal: 4,
  },
  settingsRowLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  settingsRowLabel: {
    fontSize: scaleFontSize(14),
    color: "#424242",
  },
  settingsRowValue: {
    fontSize: scaleFontSize(14),
    color: "#757575",
  },
  actions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    marginTop: 20,
    gap: 24,
  },
  actionButton: {
    paddingVertical: 8,
    paddingHorizontal: 8,
  },
  cancelText: {
    fontSize: scaleFontSize(14),
    fontWeight: "600",
    color: "#757575",
  },
  doneText: {
    fontSize: scaleFontSize(14),
    fontWeight: "600",
    color: "#4285f4",
  },
});
