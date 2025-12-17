import React, { useState, useCallback, useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useFocusEffect } from "@react-navigation/native";
import { colors, scaleFontSize } from "../lib/theme";
import {
  getReminders,
  getHistory,
  recordCompletion,
  Reminder,
  ReminderHistory,
} from "../lib/storage";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export default function CalendarScreen() {
  const router = useRouter();
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [history, setHistory] = useState<ReminderHistory[]>([]);

  const loadData = useCallback(async () => {
    try {
      const [loadedReminders, allHistory] = await Promise.all([
        getReminders(),
        getHistory(),
      ]);
      setReminders(loadedReminders);
      setHistory(allHistory);
    } catch (error) {
      console.error("Error loading calendar data:", error);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData])
  );

  const getDaysInMonth = (date: Date) => {
    const year = date.getFullYear();
    const month = date.getMonth();
    const days = new Date(year, month + 1, 0).getDate();
    const firstDay = new Date(year, month, 1).getDay();
    return { days, firstDay };
  };

  const { days, firstDay } = getDaysInMonth(selectedDate);

  const historyIndex = useMemo(() => {
    const activityDates = new Set<string>();
    const completedByDateAndReminder = new Set<string>();

    for (const entry of history) {
      const dateStr = new Date(entry.timestamp).toDateString();
      activityDates.add(dateStr);
      if (entry.status === "completed") {
        completedByDateAndReminder.add(`${dateStr}|${entry.reminderId}`);
      }
    }

    return { activityDates, completedByDateAndReminder };
  }, [history]);

  const hasActivityOnDate = useCallback(
    (date: Date) => historyIndex.activityDates.has(date.toDateString()),
    [historyIndex]
  );

  const isCompletedOnDate = useCallback(
    (reminderId: string, date: Date) =>
      historyIndex.completedByDateAndReminder.has(
        `${date.toDateString()}|${reminderId}`
      ),
    [historyIndex]
  );

  const handleMarkDone = async (reminderId: string, reminderTitle: string) => {
    await recordCompletion(reminderId, reminderTitle, "completed");
    loadData();
  };

  const getRemindersForDate = (date: Date) => {
    const dayKeys = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
    const dayKey = dayKeys[date.getDay()];

    return reminders.filter((reminder) => {
      if (reminder.frequency === "daily") {
        return true; // Show every day
      }
      if (reminder.frequency === "custom" || reminder.frequency === "weekly") {
        return reminder.days.includes(dayKey); // Show on selected days
      }
      // "once" - show if created on this date
      return new Date(reminder.createdAt).toDateString() === date.toDateString();
    });
  };

  const renderCalendar = () => {
    const calendar: React.ReactNode[] = [];
    let week: React.ReactNode[] = [];

    for (let i = 0; i < firstDay; i++) {
      week.push(<View key={`empty-${i}`} style={styles.calendarDay} />);
    }

    for (let day = 1; day <= days; day++) {
      const date = new Date(
        selectedDate.getFullYear(),
        selectedDate.getMonth(),
        day
      );
      const isToday = new Date().toDateString() === date.toDateString();
      const isSelected = selectedDate.getDate() === day &&
        selectedDate.getMonth() === date.getMonth();
      const hasActivity = hasActivityOnDate(date);

      week.push(
        <TouchableOpacity
          key={day}
          style={[
            styles.calendarDay,
            isToday && styles.today,
            isSelected && styles.selectedDay,
          ]}
          onPress={() => setSelectedDate(date)}
        >
          <Text
            style={[
              styles.dayText,
              isToday && styles.todayText,
              isSelected && styles.selectedDayText,
            ]}
          >
            {day}
          </Text>
          {hasActivity && <View style={styles.eventDot} />}
        </TouchableOpacity>
      );

      if ((firstDay + day) % 7 === 0 || day === days) {
        calendar.push(
          <View key={`week-${day}`} style={styles.calendarWeek}>
            {week}
          </View>
        );
        week = [];
      }
    }

    return calendar;
  };

  const renderRemindersForDate = () => {
    const filteredReminders = getRemindersForDate(selectedDate);

    if (filteredReminders.length === 0) {
      return (
        <View style={styles.emptyState}>
          <Ionicons name="calendar-outline" size={48} color="#ccc" />
          <Text style={styles.emptyText}>No reminders for this day</Text>
        </View>
      );
    }

    // Filter out completed reminders
    const pendingReminders = filteredReminders.filter(
      (reminder) => !isCompletedOnDate(reminder.id, selectedDate)
    );

    if (pendingReminders.length === 0) {
      return (
        <View style={styles.emptyState}>
          <Ionicons name="checkmark-circle" size={48} color="#4CAF50" />
          <Text style={styles.emptyText}>
            {filteredReminders.length > 0 ? "All done!" : "No reminders for this day"}
          </Text>
        </View>
      );
    }

    return pendingReminders.map((reminder) => (
      <View key={reminder.id} style={styles.reminderCard}>
        <View style={styles.reminderColor} />
        <View style={styles.reminderInfo}>
          <Text style={styles.reminderName}>{reminder.title}</Text>
          <Text style={styles.reminderTime}>{reminder.time}</Text>
        </View>
        <TouchableOpacity
          style={styles.markDoneButton}
          onPress={() => handleMarkDone(reminder.id, reminder.title)}
        >
          <Text style={styles.markDoneText}>Done</Text>
        </TouchableOpacity>
      </View>
    ));
  };

  return (
    <SafeAreaView style={styles.container} edges={["bottom"]}>
      <LinearGradient
        colors={colors.accentGradient}
        style={styles.headerGradient}
      />

      <View style={styles.content}>
        <View style={styles.header}>
          <TouchableOpacity
            onPress={() => router.back()}
            style={styles.backButton}
          >
            <Ionicons name="chevron-back" size={28} color={colors.accent} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Calendar</Text>
        </View>

        <View style={styles.calendarContainer}>
          <View style={styles.monthHeader}>
            <TouchableOpacity
              onPress={() =>
                setSelectedDate(
                  new Date(
                    selectedDate.getFullYear(),
                    selectedDate.getMonth() - 1,
                    1
                  )
                )
              }
            >
              <Ionicons name="chevron-back" size={24} color="#333" />
            </TouchableOpacity>
            <Text style={styles.monthText}>
              {selectedDate.toLocaleString("default", {
                month: "long",
                year: "numeric",
              })}
            </Text>
            <TouchableOpacity
              onPress={() =>
                setSelectedDate(
                  new Date(
                    selectedDate.getFullYear(),
                    selectedDate.getMonth() + 1,
                    1
                  )
                )
              }
            >
              <Ionicons name="chevron-forward" size={24} color="#333" />
            </TouchableOpacity>
          </View>

          <View style={styles.weekdayHeader}>
            {WEEKDAYS.map((day) => (
              <Text key={day} style={styles.weekdayText}>
                {day}
              </Text>
            ))}
          </View>

          {renderCalendar()}
        </View>

        <View style={styles.scheduleContainer}>
          <Text style={styles.scheduleTitle}>
            {selectedDate.toLocaleDateString("default", {
              weekday: "long",
              month: "long",
              day: "numeric",
            })}
          </Text>
          <ScrollView showsVerticalScrollIndicator={false}>
            {renderRemindersForDate()}
          </ScrollView>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f8f9fa",
  },
  headerGradient: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: Platform.OS === "ios" ? 140 : 120,
  },
  content: {
    flex: 1,
    paddingTop: Platform.OS === "ios" ? 50 : 30,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingBottom: 20,
    zIndex: 1,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "white",
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  headerTitle: {
    fontSize: scaleFontSize(28),
    fontWeight: "700",
    color: "white",
    marginLeft: 15,
  },
  calendarContainer: {
    backgroundColor: "white",
    borderRadius: 16,
    margin: 20,
    padding: 15,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  monthHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 15,
  },
  monthText: {
    fontSize: scaleFontSize(18),
    fontWeight: "600",
    color: "#333",
  },
  weekdayHeader: {
    flexDirection: "row",
    marginBottom: 10,
  },
  weekdayText: {
    flex: 1,
    textAlign: "center",
    color: "#666",
    fontWeight: "500",
    fontSize: scaleFontSize(13),
  },
  calendarWeek: {
    flexDirection: "row",
    marginBottom: 5,
  },
  calendarDay: {
    flex: 1,
    aspectRatio: 1,
    justifyContent: "center",
    alignItems: "center",
    borderRadius: 8,
  },
  dayText: {
    fontSize: scaleFontSize(16),
    color: "#333",
  },
  today: {
    backgroundColor: colors.accentLight,
  },
  todayText: {
    color: colors.accent,
    fontWeight: "600",
  },
  selectedDay: {
    backgroundColor: colors.accent,
  },
  selectedDayText: {
    color: "white",
    fontWeight: "600",
  },
  eventDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.accent,
    position: "absolute",
    bottom: "15%",
  },
  scheduleContainer: {
    flex: 1,
    backgroundColor: "white",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  scheduleTitle: {
    fontSize: scaleFontSize(20),
    fontWeight: "700",
    color: "#333",
    marginBottom: 15,
  },
  reminderCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "white",
    borderRadius: 16,
    padding: 15,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#e0e0e0",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  reminderColor: {
    width: 12,
    height: 40,
    borderRadius: 6,
    backgroundColor: colors.accent,
    marginRight: 15,
  },
  reminderInfo: {
    flex: 1,
  },
  reminderName: {
    fontSize: scaleFontSize(16),
    fontWeight: "600",
    color: "#333",
    marginBottom: 4,
  },
  reminderTime: {
    fontSize: scaleFontSize(14),
    color: "#666",
  },
  markDoneButton: {
    paddingVertical: 8,
    paddingHorizontal: 15,
    borderRadius: 12,
    backgroundColor: colors.accent,
  },
  markDoneText: {
    color: "white",
    fontWeight: "600",
    fontSize: scaleFontSize(14),
  },
  emptyState: {
    alignItems: "center",
    padding: 40,
  },
  emptyText: {
    fontSize: scaleFontSize(16),
    color: "#666",
    marginTop: 10,
  },
});
