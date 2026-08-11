import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import AppIcon from "../AppIcon";
import CompletedSection from "../CompletedSection";
import ReminderListItem, { chipColorForId } from "../ReminderListItem";
import { borderRadius, colors, scaleFontSize, spacing } from "../../lib/theme";
import { FONT_DISPLAY } from "../../lib/fonts";
import { formatIntervalDuration, getNextIntervalOccurrence } from "../../lib/time";
import { type Reminder, type ReminderHistory } from "../../lib/store";
import {
  activityDotCounts,
  addDaysISO,
  historyOnDay,
  isCompletedOnDay,
  occurrencesForDay,
  parseISODate,
  todayISO,
} from "../../lib/dayOccurrences";
import DayPager from "./DayPager";
import MonthSheet from "./MonthSheet";
import WeekStrip, { weekDatesFor } from "./WeekStrip";

const NOW_TICK_MS = 30_000;

interface DaysPageProps {
  reminders: Reminder[];
  history: ReminderHistory[];
  onOpenReminder: (reminder: Reminder) => void;
  /** Completion-circle tap for the given day (today's occurrence semantics for repeaters). */
  onToggleComplete?: (reminder: Reminder, dateISO: string) => void;
  onDelete?: (reminder: Reminder) => void;
  /** Whether this page is the visible pager page. Leaving resets the view to today. */
  active?: boolean;
}

function capitalizeDay(day: string): string {
  return day.charAt(0).toUpperCase() + day.slice(1, 3).toLowerCase();
}

function formatNextIn(targetMs: number, nowMs: number): string {
  const diffMs = Math.max(0, targetMs - nowMs);
  const minutes = Math.max(1, Math.ceil(diffMs / 60000));
  if (minutes < 60) return `Next in ${minutes} min`;
  const hours = Math.ceil(minutes / 60);
  if (hours < 24) return `Next in ${hours} hour${hours !== 1 ? "s" : ""}`;
  const days = Math.ceil(hours / 24);
  return `Next in ${days} day${days !== 1 ? "s" : ""}`;
}

/** Card subtitle: "09:00 · Daily", "09:00 · Mon, Wed, Fri", "Every 2 hours" (+ next-in when today). */
export function subtitleFor(reminder: Reminder, isToday: boolean, nowMs: number): string {
  if (reminder.frequency === "interval") {
    if (!reminder.intervalMs) return "";
    const every = formatIntervalDuration(reminder.intervalMs);
    if (isToday && reminder.anchorAt) {
      const { scheduledFor } = getNextIntervalOccurrence(
        reminder.anchorAt,
        reminder.intervalMs,
        nowMs
      );
      return `${every} · ${formatNextIn(scheduledFor, nowMs)}`;
    }
    return every;
  }

  const time = reminder.time ?? "";
  if (reminder.frequency === "daily") {
    const n = reminder.intervalDays && reminder.intervalDays > 1 ? reminder.intervalDays : 1;
    return `${time} · ${n === 1 ? "Daily" : `Every ${n} days`}`;
  }
  if (reminder.frequency === "weekly" || reminder.frequency === "custom") {
    const days = (reminder.days ?? []).map(capitalizeDay).join(", ");
    return days ? `${time} · ${days}` : `${time} · Weekly`;
  }
  return time;
}

function formatHistoryTime(timestamp: string): string {
  const date = new Date(timestamp);
  const hh = String(date.getHours()).padStart(2, "0");
  const mm = String(date.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

export default function DaysPage({
  reminders,
  history,
  onOpenReminder,
  onToggleComplete,
  onDelete,
  active,
}: DaysPageProps) {
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [selectedDate, setSelectedDate] = useState(() => todayISO());
  const [monthSheetVisible, setMonthSheetVisible] = useState(false);

  const today = todayISO(nowMs);

  // Keep the interval "Next in X" subtitle fresh while today is on screen.
  useEffect(() => {
    const timer = setInterval(() => setNowMs(Date.now()), NOW_TICK_MS);
    return () => clearInterval(timer);
  }, []);

  // Coming back to this page always lands on today. Reset happens on LEAVE,
  // delayed past the pager's slide-out so the visible page never snaps.
  const wasActiveRef = useRef(active);
  useEffect(() => {
    const wasActive = wasActiveRef.current;
    wasActiveRef.current = active;
    if (wasActive === true && active === false) {
      const timer = setTimeout(() => {
        setSelectedDate(todayISO());
        setMonthSheetVisible(false);
      }, 400);
      return () => clearTimeout(timer);
    }
  }, [active]);

  const remindersById = useMemo(() => {
    const map = new Map<string, Reminder>();
    for (const reminder of reminders) map.set(reminder.id, reminder);
    return map;
  }, [reminders]);

  const weekDotCounts = useMemo(
    () => activityDotCounts(reminders, weekDatesFor(selectedDate)),
    [reminders, selectedDate]
  );

  const handleFlip = useCallback((delta: 1 | -1) => {
    setSelectedDate((prev) => addDaysISO(prev, delta));
  }, []);

  const handleMonthSelect = useCallback((dateISO: string) => {
    setSelectedDate(dateISO);
    setMonthSheetVisible(false);
  }, []);

  const renderDay = useCallback(
    (dateISO: string) => {
      const isToday = dateISO === today;
      const active = occurrencesForDay(reminders, dateISO).filter(
        (reminder) => !isCompletedOnDay(reminder, history, dateISO)
      );
      const dayHistory = historyOnDay(history, dateISO);

      const completedItems = dayHistory.map((entry) => ({
        id: entry.id,
        title: entry.reminderTitle,
        emoji: remindersById.get(entry.reminderId)?.emoji,
        chipColor: chipColorForId(entry.reminderId),
        subtitle: formatHistoryTime(entry.timestamp),
        missed: entry.status === "missed",
      }));

      if (active.length === 0 && completedItems.length === 0) {
        return (
          <View style={styles.emptyDay}>
            <Text style={styles.emptyDayText}>Nothing on this day</Text>
          </View>
        );
      }

      return (
        <ScrollView
          style={styles.dayScroll}
          contentContainerStyle={styles.dayContent}
          showsVerticalScrollIndicator={false}
        >
          {active.map((reminder) => (
            <ReminderListItem
              key={reminder.id}
              id={reminder.id}
              title={reminder.title}
              emoji={reminder.emoji}
              chipColor={chipColorForId(reminder.id)}
              subtitle={subtitleFor(reminder, isToday, nowMs)}
              onPress={() => onOpenReminder(reminder)}
              onToggleComplete={() => onToggleComplete?.(reminder, dateISO)}
              onDelete={() => onDelete?.(reminder)}
            />
          ))}
          {completedItems.length > 0 && (
            <CompletedSection items={completedItems} initiallyCollapsed />
          )}
        </ScrollView>
      );
    },
    [
      reminders,
      history,
      remindersById,
      today,
      nowMs,
      onOpenReminder,
      onToggleComplete,
      onDelete,
    ]
  );

  const selected = parseISODate(selectedDate);
  const weekdayName = selected.toLocaleDateString([], { weekday: "long" });
  const monthLabel = `${selected
    .toLocaleDateString([], { month: "short" })
    .toUpperCase()} ${selected.getFullYear()}`;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.weekdayTitle}>{weekdayName}</Text>
        <Pressable
          style={styles.monthButton}
          onPress={() => setMonthSheetVisible(true)}
          accessibilityRole="button"
          accessibilityLabel="Open month picker"
        >
          <Text style={styles.monthButtonText}>{monthLabel}</Text>
          <AppIcon name="chevron-right" size={16} color={colors.textSecondary} />
        </Pressable>
      </View>

      <WeekStrip
        selectedDate={selectedDate}
        todayDate={today}
        dotCounts={weekDotCounts}
        onSelectDate={setSelectedDate}
      />

      <DayPager dateISO={selectedDate} onFlip={handleFlip} renderDay={renderDay} />

      <MonthSheet
        visible={monthSheetVisible}
        selectedDate={selectedDate}
        todayDate={today}
        onSelect={handleMonthSelect}
        onClose={() => setMonthSheetVisible(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    paddingBottom: spacing.sm,
  },
  weekdayTitle: {
    fontFamily: FONT_DISPLAY,
    fontSize: scaleFontSize(32),
    color: colors.textHeading,
  },
  monthButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    borderRadius: borderRadius.full,
  },
  monthButtonText: {
    fontSize: scaleFontSize(13),
    fontWeight: "600",
    letterSpacing: 0.5,
    color: colors.textSecondary,
  },
  dayScroll: {
    flex: 1,
  },
  dayContent: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    // Clears the floating bottom bar.
    paddingBottom: 140,
  },
  emptyDay: {
    flex: 1,
    alignItems: "center",
    paddingTop: spacing.xl * 2,
  },
  emptyDayText: {
    fontSize: scaleFontSize(15),
    color: colors.textTertiary,
  },
});
