import { useState, useCallback, useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Dimensions,
  Platform,
  Alert,
  Modal,
} from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useAction, useMutation } from "convex/react";
import { useFocusEffect } from "@react-navigation/native";
import { api } from "../convex/_generated/api";
import { colors } from "../lib/theme";
import {
  getReminders,
  addReminder,
  deleteReminder as deleteReminderStorage,
  getTodaysHistory,
  recordCompletion,
  Reminder,
  ReminderHistory,
} from "../lib/storage";
import { cancelReminder, scheduleReminder } from "../lib/notifications";
import { readFileAsBase64 } from "../lib/convex";
import ReminderCard from "../components/ReminderCard";
import RecordingOverlay from "../components/RecordingOverlay";

const { width } = Dimensions.get("window");

const QUICK_ACTIONS = [
  {
    icon: "mic-outline" as const,
    label: "Add\nReminder",
    id: "add",
    gradient: ["#4A90D9", "#3A7BC8"] as [string, string],
  },
  {
    icon: "calendar-outline" as const,
    label: "Calendar\nView",
    id: "calendar",
    gradient: ["#26A69A", "#00897B"] as [string, string],
  },
  {
    icon: "time-outline" as const,
    label: "History\nLog",
    id: "history",
    gradient: ["#EC407A", "#D81B60"] as [string, string],
  },
  {
    icon: "create-outline" as const,
    label: "Type\nReminder",
    id: "type",
    gradient: ["#FF7043", "#E64A19"] as [string, string],
  },
];

export default function HomeScreen() {
  const router = useRouter();
  const processVoiceReminder = useAction(api.actions.processVoiceReminder);
  const removeConvexReminder = useMutation(api.reminders.remove);

  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [showRecording, setShowRecording] = useState(false);
  const [todaysHistory, setTodaysHistory] = useState<ReminderHistory[]>([]);
  const [showNotifications, setShowNotifications] = useState(false);

  const loadData = useCallback(async () => {
    const [loadedReminders, history] = await Promise.all([
      getReminders(),
      getTodaysHistory(),
    ]);
    setReminders(loadedReminders);
    setTodaysHistory(history);
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData])
  );

  const completedTodaySet = useMemo(() => {
    const set = new Set<string>();
    for (const entry of todaysHistory) {
      if (entry.status === "completed") set.add(entry.reminderId);
    }
    return set;
  }, [todaysHistory]);

  const pendingReminders = useMemo(() => {
    if (completedTodaySet.size === 0) return reminders;
    return reminders.filter((reminder) => !completedTodaySet.has(reminder.id));
  }, [reminders, completedTodaySet]);

  const handleMarkDone = async (reminderId: string, reminderTitle: string) => {
    await recordCompletion(reminderId, reminderTitle, "completed");
    loadData();
  };

  const handleQuickAction = (id: string) => {
    if (id === "add") {
      setShowRecording(true);
    } else if (id === "type") {
      router.push("/reminder/new");
    } else if (id === "calendar") {
      router.push("/calendar");
    } else if (id === "history") {
      router.push("/history");
    }
  };

  const handleCloseRecording = () => {
    setShowRecording(false);
  };

  const handleRecordingComplete = async (audioUri: string) => {
    try {
      const base64 = await readFileAsBase64(audioUri);
      const result = await processVoiceReminder({ audioBase64: base64 });

      if (!result.audioUrl) {
        throw new Error("Failed to get audio URL");
      }

      const frequency = result.frequency === "weekly" ? "custom" : result.frequency;
      const days = frequency === "custom" ? (result.days || []) : [];

      // Save to local storage
      const newReminder = await addReminder({
        convexId: result.id,
        title: result.title,
        description: result.description,
        time: result.time,
        frequency,
        days,
        audioUrl: result.audioUrl,
        soundRepeatMode: "count",
        soundRepeatCount: 1,
      });

      // Schedule notification
      if (newReminder.audioUrl) {
        await scheduleReminder({
          id: newReminder.id,
          title: newReminder.title,
          description: newReminder.description,
          time: newReminder.time,
          frequency: newReminder.frequency,
          days: newReminder.days,
          audioUrl: newReminder.audioUrl,
          soundRepeatMode: newReminder.soundRepeatMode,
          soundRepeatCount: newReminder.soundRepeatCount,
        });
      }

      setShowRecording(false);
      loadData();

      // Navigate to edit screen to review/modify
      router.push(`/reminder/edit?id=${newReminder.id}`);
    } catch (error) {
      console.error("[VR] Processing error:", error);
      setShowRecording(false);
      Alert.alert("Error", "Failed to process your reminder. Check your internet connection and try again.");
    }
  };

  const handleReminderPress = (reminder: Reminder) => {
    router.push(`/reminder/edit?id=${reminder.id}`);
  };

  const handleDeleteReminder = async (reminder: Reminder) => {
    try {
      await cancelReminder(reminder.id);
    } catch (e) {
      console.log("[VR] Failed to cancel notification:", e);
    }

    if (reminder.convexId) {
      try {
        await removeConvexReminder({ id: reminder.convexId as any });
      } catch (e) {
        console.log("[VR] Failed to delete Convex reminder:", e);
      }
    }

    await deleteReminderStorage(reminder.id);
    loadData();
  };

  const handleDelete = (reminder: Reminder) => {
    Alert.alert("Delete Reminder", `Delete "${reminder.title}"?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: () => handleDeleteReminder(reminder),
      },
    ]);
  };

  return (
    <View style={styles.container}>
      <LinearGradient colors={colors.accentGradient} style={styles.header}>
        <View style={styles.headerContent}>
          <View style={styles.headerTop}>
            <Text style={styles.headerTitle}>My Reminders</Text>
            <TouchableOpacity
              style={styles.notificationButton}
              onPress={() => setShowNotifications(true)}
              activeOpacity={0.8}
            >
              <Ionicons name="notifications-outline" size={24} color="white" />
              {reminders.length > 0 && (
                <View style={styles.notificationBadge}>
                  <Text style={styles.notificationCount}>{reminders.length}</Text>
                </View>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </LinearGradient>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.quickActionsContainer}>
          <Text style={styles.sectionTitle}>Quick Actions</Text>
          <View style={styles.quickActionsGrid}>
            {QUICK_ACTIONS.map((action) => (
              <TouchableOpacity
                key={action.id}
                style={styles.actionButton}
                onPress={() => handleQuickAction(action.id)}
                activeOpacity={0.8}
              >
                <LinearGradient colors={action.gradient} style={styles.actionGradient}>
                  <View style={styles.actionContent}>
                    <View style={styles.actionIcon}>
                      <Ionicons name={action.icon} size={28} color="white" />
                    </View>
                    <Text style={styles.actionLabel}>{action.label}</Text>
                  </View>
                </LinearGradient>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Today's Schedule</Text>
            <TouchableOpacity onPress={() => router.push("/calendar")}>
              <Text style={styles.seeAllButton}>See All</Text>
            </TouchableOpacity>
          </View>

          {(() => {
            if (pendingReminders.length === 0) {
              return (
                <View style={styles.emptyState}>
                  <Ionicons name="notifications-outline" size={48} color="#ccc" />
                  <Text style={styles.emptyStateText}>
                    {reminders.length > 0 ? "All done for today!" : "No reminders scheduled"}
                  </Text>
                  <TouchableOpacity
                    style={styles.addReminderButton}
                    onPress={() => setShowRecording(true)}
                  >
                    <Text style={styles.addReminderButtonText}>Add Reminder</Text>
                  </TouchableOpacity>
                </View>
              );
            }
            return pendingReminders.map((reminder) => (
              <ReminderCard
                key={reminder.id}
                id={reminder.id}
                title={reminder.title}
                time={reminder.time}
                frequency={reminder.frequency}
                days={reminder.days}
                isCompleted={false}
                onPress={() => handleReminderPress(reminder)}
                onDelete={() => handleDelete(reminder)}
                onMarkDone={() => handleMarkDone(reminder.id, reminder.title)}
              />
            ));
          })()}
        </View>
      </ScrollView>

      <RecordingOverlay
        visible={showRecording}
        onClose={handleCloseRecording}
        onRecordingComplete={handleRecordingComplete}
      />

      <Modal
        visible={showNotifications}
        animationType="fade"
        transparent
        onRequestClose={() => setShowNotifications(false)}
      >
        <View style={styles.modalOverlay}>
          <TouchableOpacity
            style={styles.backdrop}
            activeOpacity={1}
            onPress={() => setShowNotifications(false)}
          />
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Notifications</Text>
              <TouchableOpacity
                onPress={() => setShowNotifications(false)}
                style={styles.modalClose}
              >
                <Ionicons name="close" size={24} color="#333" />
              </TouchableOpacity>
            </View>

            {reminders.length === 0 ? (
              <View style={styles.modalEmpty}>
                <Ionicons name="notifications-off-outline" size={48} color="#ccc" />
                <Text style={styles.modalEmptyText}>No reminders scheduled</Text>
              </View>
            ) : (
              <ScrollView showsVerticalScrollIndicator={false}>
                {reminders.map((reminder) => (
                  <View key={reminder.id} style={styles.notificationItem}>
                    <View style={styles.notificationIcon}>
                      <Ionicons name="notifications" size={22} color={colors.accent} />
                    </View>
                    <View style={styles.notificationContent}>
                      <Text style={styles.notificationTitle} numberOfLines={1}>
                        {reminder.title}
                      </Text>
                      <Text style={styles.notificationSubtitle} numberOfLines={2}>
                        {reminder.description || "No description"}
                      </Text>
                      <Text style={styles.notificationTime}>
                        {reminder.time} · {reminder.frequency === "custom" && reminder.days?.length
                          ? reminder.days.join(", ")
                          : reminder.frequency === "daily"
                            ? "Daily"
                            : "Once"}
                      </Text>
                    </View>
                  </View>
                ))}
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    paddingTop: Platform.OS === "ios" ? 60 : 45,
    paddingBottom: 25,
    borderBottomLeftRadius: 30,
    borderBottomRightRadius: 30,
  },
  headerContent: {
    paddingHorizontal: 20,
  },
  headerTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: "700",
    color: "white",
  },
  notificationButton: {
    position: "relative",
    padding: 8,
    backgroundColor: "rgba(255, 255, 255, 0.15)",
    borderRadius: 12,
  },
  notificationBadge: {
    position: "absolute",
    top: -4,
    right: -4,
    backgroundColor: "#FF5252",
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 2,
    borderColor: colors.accent,
    paddingHorizontal: 4,
  },
  notificationCount: {
    color: "white",
    fontSize: 11,
    fontWeight: "700",
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.35)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  modalCard: {
    width: "100%",
    backgroundColor: "white",
    borderRadius: 18,
    padding: 18,
    maxHeight: "70%",
    elevation: 6,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: "#333",
  },
  modalClose: {
    padding: 6,
  },
  modalEmpty: {
    alignItems: "center",
    paddingVertical: 30,
  },
  modalEmptyText: {
    color: "#666",
    marginTop: 10,
    fontSize: 16,
  },
  notificationItem: {
    flexDirection: "row",
    padding: 14,
    borderRadius: 14,
    backgroundColor: "#f7f7f7",
    marginBottom: 10,
  },
  notificationIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: colors.accentLight,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },
  notificationContent: {
    flex: 1,
  },
  notificationTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#1a1a1a",
  },
  notificationSubtitle: {
    fontSize: 14,
    color: "#555",
    marginTop: 4,
  },
  notificationTime: {
    fontSize: 12,
    color: "#888",
    marginTop: 6,
  },
  content: {
    flex: 1,
    paddingTop: 20,
  },
  quickActionsContainer: {
    paddingHorizontal: 20,
    marginBottom: 25,
  },
  quickActionsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
    marginTop: 15,
  },
  actionButton: {
    width: (width - 52) / 2,
    height: 110,
    borderRadius: 16,
    overflow: "hidden",
  },
  actionGradient: {
    flex: 1,
    padding: 15,
  },
  actionContent: {
    flex: 1,
    justifyContent: "space-between",
  },
  actionIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: "rgba(255, 255, 255, 0.2)",
    justifyContent: "center",
    alignItems: "center",
  },
  actionLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: "white",
    marginTop: 8,
  },
  section: {
    paddingHorizontal: 20,
    paddingBottom: 40,
  },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 15,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: colors.textPrimary,
    marginBottom: 5,
  },
  seeAllButton: {
    color: colors.accent,
    fontWeight: "600",
  },
  emptyState: {
    alignItems: "center",
    padding: 30,
    backgroundColor: "white",
    borderRadius: 16,
    marginTop: 10,
  },
  emptyStateText: {
    fontSize: 16,
    color: "#666",
    marginTop: 10,
    marginBottom: 20,
  },
  addReminderButton: {
    backgroundColor: colors.accent,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 20,
  },
  addReminderButtonText: {
    color: "white",
    fontWeight: "600",
  },
});
