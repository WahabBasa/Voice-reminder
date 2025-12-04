import { useRef, useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  Alert,
  Animated,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useQuery, useMutation, useAction } from "convex/react";
import { BottomSheetModal } from "@gorhom/bottom-sheet";
import { api } from "../../convex/_generated/api";
import { Id } from "../../convex/_generated/dataModel";
import { cancelReminder, scheduleReminder } from "../../lib/notifications";
import { colors, spacing, typography, shadows, borderRadius } from "../../lib/theme";
import ReminderCard from "../../components/ReminderCard";
import RecordingOverlay from "../../components/RecordingOverlay";
import DetailSheet, { ReminderData } from "../../components/DetailSheet";
import { readFileAsBase64 } from "../../lib/convex";

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const reminders = useQuery(api.reminders.list);
  const deleteReminder = useMutation(api.reminders.remove);
  const processVoiceReminder = useAction(api.actions.processVoiceReminder);

  const [showRecording, setShowRecording] = useState(false);
  const [selectedReminder, setSelectedReminder] = useState<ReminderData | null>(null);
  const [fabExpanded, setFabExpanded] = useState(false);
  const bottomSheetRef = useRef<BottomSheetModal>(null);

  const handleToggleFab = () => {
    setFabExpanded(!fabExpanded);
  };

  const handleOpenRecording = () => {
    console.log("[VR] Voice button pressed");
    setFabExpanded(false);
    setShowRecording(true);
  };

  const handleCloseRecording = () => {
    console.log("[VR] Recording overlay closed");
    setShowRecording(false);
  };

  const handleManualEntry = () => {
    console.log("[VR] Type button pressed");
    setFabExpanded(false);
    // Open detail sheet with empty reminder for manual entry
    setSelectedReminder({
      id: "",
      title: "",
      description: "",
      time: "09:00",
      frequency: "once",
      days: [],
      audioUrl: undefined,
      isNew: true,
    });
    setTimeout(() => {
      bottomSheetRef.current?.present();
    }, 100);
  };

  const handleRecordingComplete = async (audioUri: string) => {
    try {
      const base64 = await readFileAsBase64(audioUri);
      console.log("[VR] Processing audio...");
      const result = await processVoiceReminder({ audioBase64: base64 });
      console.log("[VR] Result:", JSON.stringify(result, null, 2));

      if (!result.audioUrl) {
        throw new Error("Failed to get audio URL");
      }

      console.log("[VR] Scheduling notification...");
      await scheduleReminder({
        id: result.id,
        title: result.title,
        description: result.description,
        time: result.time,
        frequency: result.frequency,
        days: result.days,
        audioUrl: result.audioUrl,
      });

      setShowRecording(false);

      setSelectedReminder({
        id: result.id,
        title: result.title,
        description: result.description,
        time: result.time,
        frequency: result.frequency,
        days: result.days,
        audioUrl: result.audioUrl,
      });
      setTimeout(() => {
        bottomSheetRef.current?.present();
      }, 300);
    } catch (error) {
      console.error("[VR] Processing error:", error);
      setShowRecording(false);
      Alert.alert("Error", "Failed to process your reminder. Please try again.");
    }
  };

  const handleReminderPress = useCallback((reminder: any) => {
    console.log("[VR] Reminder pressed:", reminder._id);
    setSelectedReminder({
      id: reminder._id,
      title: reminder.title,
      description: reminder.description,
      time: reminder.time,
      frequency: reminder.frequency,
      days: reminder.days,
      audioUrl: reminder.audioUrl,
    });
    bottomSheetRef.current?.present();
  }, []);

  const handleCloseDetail = useCallback(() => {
    setSelectedReminder(null);
  }, []);

  const updateReminder = useMutation(api.reminders.update);

  const handleSaveReminder = useCallback(async (data: ReminderData) => {
    if (!data.id || data.isNew) {
      Alert.alert("Coming Soon", "Manual text entry requires voice generation. Use Voice input for now.");
      return;
    }

    try {
      await updateReminder({
        id: data.id as Id<"reminders">,
        title: data.title,
        description: data.description,
        time: data.time,
        frequency: data.frequency,
        days: data.days,
      });

      // Reschedule notification with updated data
      await cancelReminder(data.id as Id<"reminders">);
      if (data.audioUrl) {
        await scheduleReminder({
          id: data.id,
          title: data.title,
          description: data.description,
          time: data.time,
          frequency: data.frequency,
          days: data.days,
          audioUrl: data.audioUrl,
        });
      }

      setSelectedReminder(null);
      bottomSheetRef.current?.dismiss();
      Alert.alert("Saved", "Reminder updated successfully");
    } catch (error) {
      console.error("[VR] Save error:", error);
      Alert.alert("Error", "Failed to save reminder");
    }
  }, [updateReminder]);

  const handleDelete = (id: Id<"reminders">, title: string) => {
    Alert.alert("Delete Reminder", `Delete "${title}"?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          try {
            await cancelReminder(id);
          } catch (e) {
            console.log("[VR] Failed to cancel notification:", e);
          }
          await deleteReminder({ id });
        },
      },
    ]);
  };

  if (reminders === undefined) {
    return (
      <SafeAreaView style={styles.container} edges={["top"]}>
        <View style={styles.loadingState}>
          <ActivityIndicator size="large" color={colors.accent} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Reminders</Text>
      </View>

      {reminders.length === 0 ? (
        <View style={styles.emptyState}>
          <View style={styles.emptyIcon}>
            <Ionicons name="notifications-outline" size={64} color={colors.muted} />
          </View>
          <Text style={styles.emptyTitle}>No reminders yet</Text>
          <Text style={styles.emptySubtitle}>
            Tap the + button to create your first reminder
          </Text>
        </View>
      ) : (
        <FlatList
          data={reminders}
          keyExtractor={(item) => item._id}
          renderItem={({ item }) => (
            <ReminderCard
              id={item._id}
              title={item.title}
              time={item.time}
              frequency={item.frequency}
              days={item.days}
              onPress={() => handleReminderPress(item)}
              onDelete={() => handleDelete(item._id, item.title)}
            />
          )}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
        />
      )}

      {/* Expandable FAB */}
      <View style={[styles.fabContainer, { bottom: Math.max(insets.bottom, 20) + 16 }]}>
        {fabExpanded && (
          <View style={styles.fabOptions}>
            <TouchableOpacity
              style={styles.fabOption}
              onPress={handleOpenRecording}
              activeOpacity={0.8}
            >
              <Ionicons name="mic" size={22} color="#fff" />
              <Text style={styles.fabOptionText}>Voice</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.fabOption}
              onPress={handleManualEntry}
              activeOpacity={0.8}
            >
              <Ionicons name="create-outline" size={22} color="#fff" />
              <Text style={styles.fabOptionText}>Type</Text>
            </TouchableOpacity>
          </View>
        )}
        <TouchableOpacity
          style={[styles.fab, fabExpanded && styles.fabActive]}
          onPress={handleToggleFab}
          activeOpacity={0.8}
        >
          <Ionicons
            name={fabExpanded ? "close" : "add"}
            size={28}
            color="#fff"
          />
        </TouchableOpacity>
      </View>

      <RecordingOverlay
        visible={showRecording}
        onClose={handleCloseRecording}
        onRecordingComplete={handleRecordingComplete}
      />

      <DetailSheet
        ref={bottomSheetRef}
        reminder={selectedReminder}
        onClose={handleCloseDetail}
        onSave={handleSaveReminder}
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
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
  },
  headerTitle: {
    ...typography.title,
  },
  loadingState: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  emptyState: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: spacing.xl,
  },
  emptyIcon: {
    marginBottom: spacing.lg,
  },
  emptyTitle: {
    ...typography.heading,
    marginBottom: spacing.sm,
  },
  emptySubtitle: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: "center",
  },
  listContent: {
    paddingHorizontal: spacing.md,
    paddingBottom: 120,
  },
  fabContainer: {
    position: "absolute",
    right: spacing.lg,
    alignItems: "center",
  },
  fabOptions: {
    marginBottom: spacing.md,
    gap: spacing.sm,
  },
  fabOption: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    backgroundColor: colors.accent,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.full,
    ...shadows.fab,
  },
  fabOptionText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "600",
  },
  fab: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.accent,
    justifyContent: "center",
    alignItems: "center",
    ...shadows.fab,
  },
  fabActive: {
    backgroundColor: colors.textSecondary,
  },
});
