import { useCallback, useMemo, useState } from "react";
import {
  Alert,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useAction, useMutation } from "convex/react";
import { api } from "../convex/_generated/api";
import { colors } from "../lib/theme";
import { readFileAsBase64 } from "../lib/convex";
import { cancelReminder, scheduleReminder } from "../lib/notifications";
import { addReminder, deleteReminder as deleteReminderStorage, getReminders, recordCompletion, Reminder } from "../lib/storage";
import RecordingOverlay from "../components/RecordingOverlay";

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
  const removeConvexReminder = useMutation(api.reminders.remove);

  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [showRecording, setShowRecording] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  const loadData = useCallback(async () => {
    const loadedReminders = await getReminders();
    setReminders(loadedReminders);
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadData();
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
      await loadData();

      router.push(`/reminder/edit?id=${newReminder.id}`);
    } catch (error) {
      console.error("[VR] Processing error:", error);
      setShowRecording(false);
      Alert.alert(
        "Error",
        "Failed to process your reminder. Check your internet connection and try again."
      );
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
      { text: "Delete", style: "destructive", onPress: () => handleDeleteReminder(reminder) },
    ]);
  };

  const handleMarkDone = async (reminderId: string, reminderTitle: string) => {
    await recordCompletion(reminderId, reminderTitle, "completed");
    loadData();
  };

  const handleReminderMenu = (reminder: Reminder) => {
    Alert.alert(reminder.title, undefined, [
      { text: "Edit", onPress: () => handleReminderPress(reminder) },
      { text: "Mark done", onPress: () => handleMarkDone(reminder.id, reminder.title) },
      { text: "Delete", style: "destructive", onPress: () => handleDelete(reminder) },
      { text: "Cancel", style: "cancel" },
    ]);
  };

  const filteredReminders = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return reminders;
    return reminders.filter((reminder) => {
      const title = reminder.title.toLowerCase();
      const description = (reminder.description || "").toLowerCase();
      return title.includes(query) || description.includes(query);
    });
  }, [reminders, searchQuery]);

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

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <Text style={styles.headerTitle}>Voice Reminder</Text>
          <View style={styles.headerActions}>
            <TouchableOpacity style={styles.proPill} activeOpacity={0.85}>
              <Ionicons name="sparkles" size={14} color="white" style={styles.proIcon} />
              <Text style={styles.proPillText}>PRO Version</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.settingsButton}
              onPress={() => router.push("/history")}
              activeOpacity={0.8}
            >
              <Ionicons name="settings-outline" size={22} color={colors.textPrimary} />
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.searchRow}>
          <Ionicons
            name="search"
            size={16}
            color={colors.textSecondary}
            style={styles.searchIcon}
          />
          <TextInput
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder="Search"
            placeholderTextColor={colors.textSecondary}
            style={styles.searchInput}
            autoCapitalize="none"
            autoCorrect={false}
            clearButtonMode="while-editing"
          />
        </View>

        <View style={styles.filtersRow}>
          <View style={styles.filterPill}>
            <Text style={styles.filterPillText}>All</Text>
          </View>
        </View>
      </View>

      <ScrollView
        style={styles.content}
        contentContainerStyle={styles.contentContainer}
        showsVerticalScrollIndicator={false}
      >
        {(["Today", "Yesterday", "Earlier"] as const).map((label) => {
          const items = remindersBySection[label];
          if (items.length === 0) return null;
          return (
            <View key={label} style={styles.section}>
              <Text style={styles.sectionTitle}>{label}</Text>
              {items.map((reminder) => (
                <View key={reminder.id} style={styles.card}>
                  <TouchableOpacity
                    style={styles.cardMain}
                    onPress={() => handleReminderPress(reminder)}
                    activeOpacity={0.8}
                  >
                    <View style={styles.cardIcon}>
                      <Ionicons name="mic-outline" size={18} color={colors.accent} />
                    </View>
                    <View style={styles.cardText}>
                      <Text style={styles.cardTitle} numberOfLines={1}>
                        {reminder.title}
                      </Text>
                      <Text style={styles.cardSubtitle} numberOfLines={1}>
                        {reminder.description || "No description"}
                      </Text>
                      <Text style={styles.cardMeta} numberOfLines={1}>
                        {formatCardTimestamp(reminder.createdAt)}
                      </Text>
                    </View>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.cardMenu}
                    onPress={() => handleReminderMenu(reminder)}
                    hitSlop={{ top: 8, left: 8, right: 8, bottom: 8 }}
                  >
                    <Ionicons name="ellipsis-horizontal" size={18} color="#9aa0a6" />
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          );
        })}

        {filteredReminders.length === 0 && (
          <View style={styles.emptyState}>
            <Text style={styles.emptyTitle}>
              {reminders.length === 0 ? "No reminders yet" : "No results"}
            </Text>
            <Text style={styles.emptySubtitle}>
              {reminders.length === 0
                ? "Tap the mic to create your first reminder."
                : "Try a different search."}
            </Text>
          </View>
        )}
      </ScrollView>

      <TouchableOpacity
        style={styles.fab}
        onPress={() => setShowRecording(true)}
        activeOpacity={0.9}
      >
        <Ionicons name="mic" size={26} color="white" />
      </TouchableOpacity>

      <RecordingOverlay
        visible={showRecording}
        onClose={handleCloseRecording}
        onRecordingComplete={handleRecordingComplete}
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
    fontSize: 22,
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
    fontSize: 13,
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
  searchRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    height: 40,
    borderRadius: 12,
    backgroundColor: "#f1f3f4",
    marginTop: 6,
  },
  searchInput: {
    flex: 1,
    color: colors.textPrimary,
    fontSize: 15,
    paddingVertical: 0,
  },
  searchIcon: {
    marginRight: 8,
  },
  filtersRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 10,
  },
  filterPill: {
    backgroundColor: colors.accent,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
  },
  filterPillText: {
    color: "white",
    fontWeight: "700",
    fontSize: 13,
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
  sectionTitle: {
    fontSize: 18,
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
    fontSize: 15,
    fontWeight: "800",
    color: colors.textPrimary,
  },
  cardSubtitle: {
    marginTop: 2,
    fontSize: 13,
    color: "#596069",
  },
  cardMeta: {
    marginTop: 4,
    fontSize: 12,
    color: "#9aa0a6",
  },
  cardMenu: {
    paddingLeft: 10,
    paddingVertical: 4,
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
    fontSize: 16,
    fontWeight: "800",
    color: colors.textPrimary,
  },
  emptySubtitle: {
    marginTop: 6,
    fontSize: 13,
    color: colors.textSecondary,
  },
});
