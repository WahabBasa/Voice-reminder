import { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ScrollView,
  Platform,
  Alert,
} from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import Slider from "@react-native-community/slider";
import { Audio } from "expo-av";
import { colors, spacing } from "../../lib/theme";
import {
  getReminders,
  updateReminder as updateReminderStorage,
  deleteReminder as deleteReminderStorage,
  Reminder,
} from "../../lib/storage";
import { cancelReminder, scheduleReminder } from "../../lib/notifications";
import DaySelector from "../../components/DaySelector";
import TimePicker from "../../components/TimePicker";

const FREQUENCIES = [
  { value: "once", label: "Once", icon: "sunny-outline" as const },
  { value: "daily", label: "Daily", icon: "sync-outline" as const },
  { value: "custom", label: "Custom", icon: "calendar-outline" as const },
];

export default function EditReminderScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();

  const [reminder, setReminder] = useState<Reminder | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [time, setTime] = useState(new Date());
  const [frequency, setFrequency] = useState("once");
  const [days, setDays] = useState<string[]>([]);
  const [volume, setVolume] = useState(0.8);
  const [sound, setSound] = useState<Audio.Sound | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);

  const loadReminder = useCallback(async () => {
    if (!id) return;
    const reminders = await getReminders();
    const found = reminders.find((r) => r.id === id);
    if (found) {
      setReminder(found);
      setTitle(found.title || "");
      setDescription(found.description || "");
      setFrequency(found.frequency || "once");
      setDays(found.days || []);

      if (found.time) {
        const [hours, minutes] = found.time.split(":").map(Number);
        const date = new Date();
        date.setHours(hours, minutes, 0, 0);
        setTime(date);
      }
    }
  }, [id]);

  useEffect(() => {
    loadReminder();
  }, [loadReminder]);

  useEffect(() => {
    return () => {
      if (sound) {
        sound.unloadAsync();
      }
    };
  }, [sound]);

  const handleDayToggle = (day: string) => {
    setDays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]
    );
  };

  const handlePlayPreview = async () => {
    if (!reminder?.audioUrl) return;

    try {
      if (isPlaying && sound) {
        await sound.stopAsync();
        setIsPlaying(false);
        return;
      }

      if (sound) {
        await sound.unloadAsync();
      }

      const { sound: newSound } = await Audio.Sound.createAsync(
        { uri: reminder.audioUrl },
        { volume }
      );
      setSound(newSound);

      newSound.setOnPlaybackStatusUpdate((status) => {
        if (status.isLoaded && status.didJustFinish) {
          setIsPlaying(false);
        }
      });

      await newSound.playAsync();
      setIsPlaying(true);
    } catch (error) {
      console.error("[VR] Error playing audio:", error);
    }
  };

  const handleSave = async () => {
    if (!reminder) return;

    const timeStr = `${time.getHours().toString().padStart(2, "0")}:${time.getMinutes().toString().padStart(2, "0")}`;

    const updatedReminder: Reminder = {
      ...reminder,
      title,
      description,
      time: timeStr,
      frequency,
      days: frequency === "custom" ? days : [],
    };

    try {
      await updateReminderStorage(updatedReminder);

      // Reschedule notification
      await cancelReminder(reminder.id);
      if (reminder.audioUrl) {
        await scheduleReminder({
          id: reminder.id,
          title,
          description,
          time: timeStr,
          frequency,
          days: frequency === "custom" ? days : [],
          audioUrl: reminder.audioUrl,
        });
      }

      router.back();
    } catch (error) {
      console.error("[VR] Save error:", error);
      Alert.alert("Error", "Failed to save reminder");
    }
  };

  const handleDelete = () => {
    if (!reminder) return;

    Alert.alert("Delete Reminder", `Delete "${title}"?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          try {
            await cancelReminder(reminder.id);
          } catch (e) {
            console.log("[VR] Failed to cancel notification:", e);
          }
          await deleteReminderStorage(reminder.id);
          router.back();
        },
      },
    ]);
  };

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString("default", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    });
  };

  const hasChanges = () => {
    if (!reminder) return false;

    const timeStr = `${time.getHours().toString().padStart(2, "0")}:${time.getMinutes().toString().padStart(2, "0")}`;
    const currentDays = [...days].sort().join(",");
    const originalDays = [...(reminder.days || [])].sort().join(",");

    return (
      title !== reminder.title ||
      description !== reminder.description ||
      timeStr !== reminder.time ||
      frequency !== reminder.frequency ||
      currentDays !== originalDays
    );
  };

  if (!reminder) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.closeButton}>
            <Ionicons name="close" size={28} color="#333" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Loading...</Text>
          <View style={{ width: 40 }} />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.closeButton}>
          <Ionicons name="close" size={28} color="#333" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Edit Reminder</Text>
        <TouchableOpacity onPress={handleDelete} style={styles.deleteHeaderButton}>
          <Ionicons name="trash-outline" size={24} color="#FF5252" />
        </TouchableOpacity>
      </View>

      <View style={styles.handleBar} />

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* Title Input */}
        <View style={styles.section}>
          <View style={styles.inputContainer}>
            <TextInput
              style={styles.mainInput}
              value={title}
              onChangeText={setTitle}
              placeholder="Reminder Title"
              placeholderTextColor="#999"
            />
          </View>
        </View>

        {/* How often? */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>How often?</Text>
          <View style={styles.optionsGrid}>
            {FREQUENCIES.map((f) => (
              <TouchableOpacity
                key={f.value}
                style={[
                  styles.optionCard,
                  frequency === f.value && styles.selectedOptionCard,
                ]}
                onPress={() => setFrequency(f.value)}
              >
                <View
                  style={[
                    styles.optionIcon,
                    frequency === f.value && styles.selectedOptionIcon,
                  ]}
                >
                  <Ionicons
                    name={f.icon}
                    size={24}
                    color={frequency === f.value ? "white" : "#666"}
                  />
                </View>
                <Text
                  style={[
                    styles.optionLabel,
                    frequency === f.value && styles.selectedOptionLabel,
                  ]}
                >
                  {f.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Days (for custom) */}
        {frequency === "custom" && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Which days?</Text>
            <DaySelector selectedDays={days} onToggle={handleDayToggle} />
          </View>
        )}

        {/* Time */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>What time?</Text>
          <View style={styles.timePickerWrapper}>
            <TimePicker value={time} onChange={setTime} />
          </View>
        </View>

        {/* Voice Preview */}
        {reminder.audioUrl && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Voice Preview</Text>
            <View style={styles.card}>
              <View style={styles.previewRow}>
                <View style={styles.previewTextContainer}>
                  <Text style={styles.previewText} numberOfLines={2}>
                    "{description || "No description"}"
                  </Text>
                </View>
                <TouchableOpacity style={styles.playButton} onPress={handlePlayPreview}>
                  <Ionicons name={isPlaying ? "stop" : "play"} size={24} color="#fff" />
                </TouchableOpacity>
              </View>

              <View style={styles.volumeContainer}>
                <Ionicons name="volume-low" size={18} color="#666" />
                <Slider
                  style={styles.slider}
                  minimumValue={0}
                  maximumValue={1}
                  value={volume}
                  onSlidingComplete={async (newVolume) => {
                    setVolume(newVolume);
                    if (sound) {
                      await sound.setVolumeAsync(newVolume);
                    }
                  }}
                  minimumTrackTintColor={colors.accent}
                  maximumTrackTintColor="#ddd"
                  thumbTintColor={colors.accent}
                />
                <Ionicons name="volume-high" size={18} color="#666" />
              </View>
            </View>
          </View>
        )}

        {/* Description */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>What to say</Text>
          <View style={styles.textAreaContainer}>
            <TextInput
              style={styles.textArea}
              value={description}
              onChangeText={setDescription}
              placeholder="What should the reminder say?"
              placeholderTextColor="#999"
              multiline
              numberOfLines={3}
              textAlignVertical="top"
            />
          </View>
        </View>

        {/* Footer Buttons */}
        <View style={styles.footer}>
          {hasChanges() && (
            <TouchableOpacity style={styles.saveButton} onPress={handleSave} activeOpacity={0.8}>
              <LinearGradient colors={colors.accentGradient} style={styles.saveButtonGradient}>
                <Text style={styles.saveButtonText}>Save Changes</Text>
              </LinearGradient>
            </TouchableOpacity>
          )}
          <TouchableOpacity style={styles.cancelButton} onPress={() => router.back()}>
            <Text style={styles.cancelButtonText}>Cancel</Text>
          </TouchableOpacity>
        </View>

        <View style={{ height: 50 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f8f9fa",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 15,
    paddingTop: Platform.OS === "ios" ? 50 : 15,
    paddingBottom: 10,
    backgroundColor: "#f8f9fa",
  },
  closeButton: {
    width: 40,
    height: 40,
    justifyContent: "center",
    alignItems: "center",
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#333",
  },
  deleteHeaderButton: {
    width: 40,
    height: 40,
    justifyContent: "center",
    alignItems: "center",
  },
  handleBar: {
    width: 40,
    height: 4,
    backgroundColor: "#ddd",
    borderRadius: 2,
    alignSelf: "center",
    marginBottom: 15,
  },
  content: {
    flex: 1,
    paddingHorizontal: 20,
  },
  section: {
    marginBottom: 25,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#1a1a1a",
    marginBottom: 15,
  },
  inputContainer: {
    backgroundColor: "white",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#e0e0e0",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  mainInput: {
    fontSize: 18,
    color: "#333",
    padding: 15,
  },
  optionsGrid: {
    flexDirection: "row",
    gap: 10,
  },
  optionCard: {
    flex: 1,
    backgroundColor: "white",
    borderRadius: 16,
    padding: 15,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#e0e0e0",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  selectedOptionCard: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  optionIcon: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: "#f5f5f5",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 10,
  },
  selectedOptionIcon: {
    backgroundColor: "rgba(255, 255, 255, 0.2)",
  },
  optionLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: "#333",
  },
  selectedOptionLabel: {
    color: "white",
  },
  timePickerWrapper: {
    backgroundColor: "white",
    borderRadius: 16,
    padding: 15,
    borderWidth: 1,
    borderColor: "#e0e0e0",
  },
  card: {
    backgroundColor: "white",
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: "#e0e0e0",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  previewRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  previewTextContainer: {
    flex: 1,
    backgroundColor: colors.accentLight,
    borderRadius: 12,
    padding: 12,
    marginRight: 12,
  },
  previewText: {
    fontSize: 14,
    fontStyle: "italic",
    color: "#333",
  },
  playButton: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: colors.accent,
    justifyContent: "center",
    alignItems: "center",
  },
  volumeContainer: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 12,
  },
  slider: {
    flex: 1,
    height: 40,
    marginHorizontal: 8,
  },
  textAreaContainer: {
    backgroundColor: "white",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#e0e0e0",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  textArea: {
    minHeight: 100,
    padding: 15,
    fontSize: 16,
    color: "#333",
  },
  footer: {
    marginTop: 10,
  },
  saveButton: {
    borderRadius: 16,
    overflow: "hidden",
    marginBottom: 12,
  },
  saveButtonGradient: {
    paddingVertical: 15,
    justifyContent: "center",
    alignItems: "center",
  },
  saveButtonText: {
    color: "white",
    fontSize: 16,
    fontWeight: "700",
  },
  cancelButton: {
    paddingVertical: 15,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#e0e0e0",
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "white",
  },
  cancelButtonText: {
    color: "#666",
    fontSize: 16,
    fontWeight: "600",
  },
});
