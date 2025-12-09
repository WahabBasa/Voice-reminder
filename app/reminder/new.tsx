import { useState } from "react";
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
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { colors } from "../../lib/theme";
import { addReminder } from "../../lib/storage";
import DaySelector from "../../components/DaySelector";
import TimePicker from "../../components/TimePicker";

const FREQUENCIES = [
  { value: "once", label: "Once", icon: "sunny-outline" as const },
  { value: "daily", label: "Daily", icon: "sync-outline" as const },
  { value: "custom", label: "Custom", icon: "calendar-outline" as const },
];

export default function NewReminderScreen() {
  const router = useRouter();

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [time, setTime] = useState(new Date());
  const [frequency, setFrequency] = useState("once");
  const [days, setDays] = useState<string[]>([]);

  const handleDayToggle = (day: string) => {
    setDays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]
    );
  };

  const handleCreate = async () => {
    if (!title.trim()) {
      Alert.alert("Error", "Please enter a reminder title");
      return;
    }

    const timeStr = `${time.getHours().toString().padStart(2, "0")}:${time.getMinutes().toString().padStart(2, "0")}`;

    try {
      await addReminder({
        title: title.trim(),
        description: description.trim(),
        time: timeStr,
        frequency,
        days: frequency === "custom" ? days : [],
        audioUrl: undefined,
      });

      Alert.alert(
        "Created",
        "Reminder created! Note: Voice playback requires using voice input.",
        [{ text: "OK", onPress: () => router.back() }]
      );
    } catch (error) {
      console.error("[VR] Create error:", error);
      Alert.alert("Error", "Failed to create reminder");
    }
  };

  const isValid = title.trim().length > 0;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.closeButton}>
          <Ionicons name="close" size={28} color="#333" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>New Reminder</Text>
        <View style={{ width: 40 }} />
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
              autoFocus
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

        {/* Description */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Notes (optional)</Text>
          <View style={styles.textAreaContainer}>
            <TextInput
              style={styles.textArea}
              value={description}
              onChangeText={setDescription}
              placeholder="Add notes or details..."
              placeholderTextColor="#999"
              multiline
              numberOfLines={3}
              textAlignVertical="top"
            />
          </View>
        </View>

        {/* Info Card */}
        <View style={styles.infoCard}>
          <Ionicons name="information-circle-outline" size={20} color={colors.accent} />
          <Text style={styles.infoText}>
            Manual reminders won't have voice playback. Use voice input for spoken reminders.
          </Text>
        </View>

        {/* Footer Buttons */}
        <View style={styles.footer}>
          <TouchableOpacity
            style={[styles.createButton, !isValid && styles.createButtonDisabled]}
            onPress={handleCreate}
            activeOpacity={0.8}
            disabled={!isValid}
          >
            <LinearGradient
              colors={isValid ? colors.accentGradient : ["#ccc", "#bbb"]}
              style={styles.createButtonGradient}
            >
              <Text style={styles.createButtonText}>Create Reminder</Text>
            </LinearGradient>
          </TouchableOpacity>
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
  infoCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.accentLight,
    borderRadius: 12,
    padding: 15,
    marginBottom: 25,
  },
  infoText: {
    flex: 1,
    marginLeft: 10,
    fontSize: 14,
    color: "#666",
  },
  footer: {
    marginTop: 10,
  },
  createButton: {
    borderRadius: 16,
    overflow: "hidden",
    marginBottom: 12,
  },
  createButtonDisabled: {
    opacity: 0.7,
  },
  createButtonGradient: {
    paddingVertical: 15,
    justifyContent: "center",
    alignItems: "center",
  },
  createButtonText: {
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
