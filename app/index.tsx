import { useCallback, useMemo, useState } from "react";
import {
  Alert,
  InteractionManager,
  Platform,
  SectionList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useFocusEffect } from "@react-navigation/native";
import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useAction } from "convex/react";
import { api } from "../convex/_generated/api";
import { colors, scaleFontSize } from "../lib/theme";
import { readFileAsBase64 } from "../lib/convex";
import { scheduleReminder } from "../lib/notifications";
import {
  addReminder,
  getHistory,
  getReminders,
  recordCompletion,
  Reminder,
  ReminderHistory,
} from "../lib/storage";
import RecordingOverlay from "../components/RecordingOverlay";

type HomeView = "all" | "completed";

function formatCardTimestamp(isoString: string) {
  const date = new Date(isoString);
  const dd = String(date.getDate()).padStart(2, "0");
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const yyyy = String(date.getFullYear());

  const hours24 = date.getHours();
  const minutes = String(date.getMinutes()).padStart(2, "0");
  const ampm = hours24 >= 12 ? "PM" : "AM";
  const hours12 = hours24 % 12 === 0 ? 12 : hours24 % 12;

  return `${dd}/${mm}/${yyyy}, ${hours12}:${minutes}${ampm}`;
}

function getDayBucket(isoString: string): "Today" | "Yesterday" | "Earlier" {
  const date = new Date(isoString);
  const now = new Date();

  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);

  const startOfYesterday = new Date(startOfToday);
  startOfYesterday.setDate(startOfYesterday.getDate() - 1);

  if (date >= startOfToday) return "Today";
  if (date >= startOfYesterday) return "Yesterday";
  return "Earlier";
}

export default function HomeScreen() {
  const router = useRouter();
  const processVoiceReminder = useAction(api.actions.processVoiceReminder);
  const insets = useSafeAreaInsets();

  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [history, setHistory] = useState<ReminderHistory[]>([]);
  const [showRecording, setShowRecording] = useState(false);
  const [selectedView, setSelectedView] = useState<HomeView>("all");

  const loadData = useCallback(async () => {
    const [loadedReminders, loadedHistory] = await Promise.all([
      getReminders(),
      getHistory(),
    ]);
    setReminders(loadedReminders);
    setHistory(loadedHistory);
  }, []);

  useFocusEffect(
    useCallback(() => {
      const task = InteractionManager.runAfterInteractions(() => {
        loadData();
      });
      return () => task.cancel();
    }, [loadData])
  );

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

      setShowRecording(false);
      setReminders((prev) => [newReminder, ...prev]);

      router.push(`/reminder/edit?id=${newReminder.id}`);

      InteractionManager.runAfterInteractions(() => {
        if (!newReminder.audioUrl) return;
        scheduleReminder({
          id: newReminder.id,
          title: newReminder.title,
          description: newReminder.description,
          time: newReminder.time,
          frequency: newReminder.frequency,
          days: newReminder.days,
          audioUrl: newReminder.audioUrl,
          soundRepeatMode: newReminder.soundRepeatMode,
          soundRepeatCount: newReminder.soundRepeatCount,
        }).catch((e) => {
          console.log("[VR] Failed to schedule reminder:", e);
        });
      });
    } catch (error) {
      console.error("[VR] Processing error:", error);
      setShowRecording(false);
      Alert.alert(
        "Error",
        "Failed to process your reminder. Check your internet connection and try again."
      );
    }
  };

  const handleReminderPress = useCallback(
    (reminder: Reminder) => {
      router.push(`/reminder/edit?id=${reminder.id}`);
    },
    [router]
  );

  const handleMarkDone = useCallback(
    (reminderId: string, reminderTitle: string) => {
      const optimisticEntry: ReminderHistory = {
        id: Math.random().toString(36).slice(2, 11),
        reminderId,
        reminderTitle,
        timestamp: new Date().toISOString(),
        status: "completed",
      };

      setHistory((prev) => [...prev, optimisticEntry]);

      recordCompletion(reminderId, reminderTitle, "completed").catch((e) => {
        console.log("[VR] Failed to record completion:", e);
      });
    },
    []
  );

  const completedTodayReminderIds = useMemo(() => {
    const today = new Date().toDateString();
    return new Set(
      history
        .filter(
          (entry) =>
            entry.status === "completed" &&
            new Date(entry.timestamp).toDateString() === today
        )
        .map((entry) => entry.reminderId)
    );
  }, [history]);

  const filteredReminders = useMemo(() => {
    const incompleteReminders = reminders.filter(
      (reminder) => !completedTodayReminderIds.has(reminder.id)
    );
    return incompleteReminders;
  }, [completedTodayReminderIds, reminders]);

  const remindersById = useMemo(() => {
    return new Map(reminders.map((reminder) => [reminder.id, reminder]));
  }, [reminders]);

  const filteredCompletedHistory = useMemo(() => {
    return history.filter((entry) => entry.status === "completed");
  }, [history]);

  const remindersBySection = useMemo(() => {
    const sections: Record<"Today" | "Yesterday" | "Earlier", Reminder[]> = {
      Today: [],
      Yesterday: [],
      Earlier: [],
    };

    const sorted = [...filteredReminders].sort((a, b) => {
      const aTime = new Date(a.createdAt).getTime();
      const bTime = new Date(b.createdAt).getTime();
      return bTime - aTime;
    });

    for (const reminder of sorted) {
      sections[getDayBucket(reminder.createdAt)].push(reminder);
    }

    return sections;
  }, [filteredReminders]);

  const completedBySection = useMemo(() => {
    const sections: Record<"Today" | "Yesterday" | "Earlier", ReminderHistory[]> =
      {
        Today: [],
        Yesterday: [],
        Earlier: [],
      };

    const sorted = [...filteredCompletedHistory].sort((a, b) => {
      const aTime = new Date(a.timestamp).getTime();
      const bTime = new Date(b.timestamp).getTime();
      return bTime - aTime;
    });

    for (const entry of sorted) {
      sections[getDayBucket(entry.timestamp)].push(entry);
    }

    return sections;
  }, [filteredCompletedHistory]);

  const handleCompletedPress = useCallback(
    (entry: ReminderHistory) => {
      const reminder = remindersById.get(entry.reminderId);
      if (!reminder) return;
      router.push(`/reminder/edit?id=${reminder.id}`);
    },
    [remindersById, router]
  );

  const reminderSections = useMemo(() => {
    return (["Today", "Yesterday", "Earlier"] as const)
      .map((title) => ({ title, data: remindersBySection[title] }))
      .filter((section) => section.data.length > 0);
  }, [remindersBySection]);

  const completedSections = useMemo(() => {
    return (["Today", "Yesterday", "Earlier"] as const)
      .map((title) => ({ title, data: completedBySection[title] }))
      .filter((section) => section.data.length > 0);
  }, [completedBySection]);

  const renderSectionHeader = useCallback(
    ({ section }: { section: { title: string } }) => {
      return (
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>{section.title}</Text>
        </View>
      );
    },
    []
  );

  const renderReminderItem = useCallback(
    ({ item }: { item: Reminder }) => {
      return (
        <View style={styles.card}>
          <TouchableOpacity
            style={styles.cardMain}
            onPress={() => handleReminderPress(item)}
            activeOpacity={0.8}
          >
            <View style={styles.cardIcon}>
              <Feather name="mic" size={18} color={colors.accent} />
            </View>
            <View style={styles.cardText}>
              <Text style={styles.cardTitle} numberOfLines={1}>
                {item.title}
              </Text>
              <Text style={styles.cardSubtitle} numberOfLines={1}>
                {item.description || "No description"}
              </Text>
              <Text style={styles.cardMeta} numberOfLines={1}>
                {formatCardTimestamp(item.createdAt)}
              </Text>
            </View>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.checkButton}
            onPress={() => handleMarkDone(item.id, item.title)}
            hitSlop={{ top: 8, left: 8, right: 8, bottom: 8 }}
            accessibilityRole="button"
            accessibilityLabel={`Mark "${item.title}" as completed`}
          >
            <View style={styles.checkCircle} />
          </TouchableOpacity>
        </View>
      );
    },
    [handleMarkDone, handleReminderPress]
  );

  const renderCompletedItem = useCallback(
    ({ item }: { item: ReminderHistory }) => {
      const reminder = remindersById.get(item.reminderId);
      const description = reminder?.description || "Completed reminder";
      return (
        <View style={styles.card}>
          <TouchableOpacity
            style={styles.cardMain}
            onPress={() => handleCompletedPress(item)}
            activeOpacity={reminder ? 0.8 : 1}
          >
            <View style={styles.cardIcon}>
              <Feather name="check" size={18} color={colors.accent} />
            </View>
            <View style={styles.cardText}>
              <Text style={styles.cardTitle} numberOfLines={1}>
                {item.reminderTitle}
              </Text>
              <Text style={styles.cardSubtitle} numberOfLines={1}>
                {description}
              </Text>
              <Text style={styles.cardMeta} numberOfLines={1}>
                {formatCardTimestamp(item.timestamp)}
              </Text>
            </View>
          </TouchableOpacity>
        </View>
      );
    },
    [handleCompletedPress, remindersById]
  );

  return (
    <SafeAreaView style={styles.container} edges={["bottom"]}>
      <View style={styles.header}>
        <View style={styles.headerTop}>
            <Text style={styles.headerTitle}>Voice Reminder</Text>
            <View style={styles.headerActions}>
              <TouchableOpacity style={styles.proPill} activeOpacity={0.85}>
                <Feather
                  name="zap"
                  size={14}
                  color="white"
                  style={styles.proIcon}
                />
                <Text style={styles.proPillText}>PRO Version</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.settingsButton}
                onPress={() => router.push("/settings")}
                activeOpacity={0.8}
              >
                <Feather name="settings" size={22} color={colors.textPrimary} />
              </TouchableOpacity>
            </View>
          </View>

          <View style={styles.filtersRow}>
            <TouchableOpacity
              style={[
                styles.filterPill,
              selectedView === "all" && styles.filterPillActive,
            ]}
            onPress={() => setSelectedView("all")}
            activeOpacity={0.85}
          >
            <Text
              style={[
                styles.filterPillText,
                selectedView === "all" && styles.filterPillTextActive,
              ]}
            >
              All
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.filterPill,
              selectedView === "completed" && styles.filterPillActive,
            ]}
            onPress={() => setSelectedView("completed")}
            activeOpacity={0.85}
          >
            <Text
              style={[
                styles.filterPillText,
                selectedView === "completed" && styles.filterPillTextActive,
              ]}
            >
              Completed
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {selectedView === "all" ? (
        <SectionList
          style={styles.content}
          contentContainerStyle={[
            styles.contentContainer,
            { paddingBottom: 120 + insets.bottom },
          ]}
          sections={reminderSections}
          keyExtractor={(item) => item.id}
          renderSectionHeader={renderSectionHeader}
          renderItem={renderReminderItem}
          stickySectionHeadersEnabled={false}
          showsVerticalScrollIndicator={false}
          removeClippedSubviews={Platform.OS === "android"}
          initialNumToRender={12}
          maxToRenderPerBatch={12}
          windowSize={7}
          updateCellsBatchingPeriod={16}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Text style={styles.emptyTitle}>
                {reminders.length === 0 ? "No reminders yet" : "All done for today!"}
              </Text>
              <Text style={styles.emptySubtitle}>
                {reminders.length === 0
                  ? "Tap the mic to create your first reminder."
                  : "Check the Completed tab to review what you finished."}
              </Text>
            </View>
          }
        />
      ) : (
        <SectionList
          style={styles.content}
          contentContainerStyle={[
            styles.contentContainer,
            { paddingBottom: 120 + insets.bottom },
          ]}
          sections={completedSections}
          keyExtractor={(item) => item.id}
          renderSectionHeader={renderSectionHeader}
          renderItem={renderCompletedItem}
          stickySectionHeadersEnabled={false}
          showsVerticalScrollIndicator={false}
          removeClippedSubviews={Platform.OS === "android"}
          initialNumToRender={12}
          maxToRenderPerBatch={12}
          windowSize={7}
          updateCellsBatchingPeriod={16}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Text style={styles.emptyTitle}>
                {history.length === 0 ? "No history yet" : "No completed reminders"}
              </Text>
              <Text style={styles.emptySubtitle}>
                {history.length === 0
                  ? "Mark reminders done to see them here."
                  : "No completed reminders found."}
              </Text>
            </View>
          }
        />
      )}

      <TouchableOpacity
        style={[
          styles.fab,
          { bottom: (Platform.OS === "ios" ? 28 : 18) + insets.bottom },
        ]}
        onPress={() => setShowRecording(true)}
        activeOpacity={0.9}
      >
        <Feather name="mic" size={26} color="white" />
      </TouchableOpacity>

      <RecordingOverlay
        visible={showRecording}
        onClose={handleCloseRecording}
        onRecordingComplete={handleRecordingComplete}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    paddingTop: Platform.OS === "ios" ? 60 : 26,
    paddingHorizontal: 20,
    paddingBottom: 14,
  },
  headerTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10,
  },
  headerTitle: {
    fontSize: scaleFontSize(24),
    fontWeight: "700",
    color: colors.textPrimary,
  },
  headerActions: {
    flexDirection: "row",
    alignItems: "center",
  },
  proPill: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.accent,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    marginRight: 10,
  },
  proPillText: {
    color: "white",
    fontWeight: "700",
    fontSize: scaleFontSize(14),
  },
  proIcon: {
    marginRight: 6,
  },
  settingsButton: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#f1f3f4",
  },
  filtersRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 10,
  },
  filterPill: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: "#f1f3f4",
    marginRight: 10,
  },
  filterPillActive: {
    backgroundColor: colors.accent,
  },
  filterPillText: {
    fontWeight: "700",
    fontSize: scaleFontSize(14),
    color: colors.textPrimary,
  },
  filterPillTextActive: {
    color: "white",
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 120,
  },
  section: {
    marginTop: 14,
  },
  sectionHeader: {
    marginTop: 14,
  },
  sectionTitle: {
    fontSize: scaleFontSize(20),
    fontWeight: "700",
    color: colors.textPrimary,
    marginBottom: 10,
  },
  card: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#f1f3f4",
    borderRadius: 18,
    paddingVertical: 12,
    paddingHorizontal: 12,
    marginBottom: 10,
  },
  cardMain: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
  },
  cardIcon: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: colors.accentLight,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 10,
  },
  cardText: {
    flex: 1,
  },
  cardTitle: {
    fontSize: scaleFontSize(16),
    fontWeight: "800",
    color: colors.textPrimary,
  },
  cardSubtitle: {
    marginTop: 2,
    fontSize: scaleFontSize(14),
    color: "#596069",
  },
  cardMeta: {
    marginTop: 4,
    fontSize: scaleFontSize(13),
    color: "#9aa0a6",
  },
  checkButton: {
    paddingLeft: 10,
    paddingVertical: 4,
    justifyContent: "center",
    alignItems: "center",
  },
  checkCircle: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: "#c7cdd3",
    backgroundColor: "transparent",
  },
  fab: {
    position: "absolute",
    alignSelf: "center",
    bottom: Platform.OS === "ios" ? 28 : 18,
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.accent,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOpacity: 0.14,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
  emptyState: {
    marginTop: 26,
    paddingVertical: 18,
    alignItems: "center",
  },
  emptyTitle: {
    fontSize: scaleFontSize(17),
    fontWeight: "800",
    color: colors.textPrimary,
  },
  emptySubtitle: {
    marginTop: 6,
    fontSize: scaleFontSize(14),
    color: colors.textSecondary,
  },
});
