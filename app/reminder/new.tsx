import { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ScrollView,
  InteractionManager,
  Platform,
  Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useAction } from "convex/react";
import { api } from "../../convex/_generated/api";
import { LinearGradient } from "expo-linear-gradient";
import { TimerPickerModal } from "react-native-timer-picker";
import { colors, scaleFontSize } from "../../lib/theme";
import { useReminderStore } from "../../lib/store";
import { scheduleReminder } from "../../lib/notifications";
import DaySelector from "../../components/DaySelector";
import AppIcon from "../../components/AppIcon";
import { useToast } from "../../components/ToastProvider";

const FREQUENCIES = [
  { value: "once", label: "Once", icon: "sun" as const },
  { value: "daily", label: "Daily", icon: "refresh-cw" as const },
  { value: "custom", label: "Custom", icon: "calendar" as const },
];

export default function NewReminderScreen() {
  const router = useRouter();
  const processTextReminder = useAction(api.actions.processTextReminder);
  const toast = useToast();
  const storeAddReminder = useReminderStore((state) => state.addReminder);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [time, setTime] = useState(new Date());
  const [frequency, setFrequency] = useState("once");
  const [days, setDays] = useState<string[]>([]);
  const [showTimePicker, setShowTimePicker] = useState(false);

  const handleDayToggle = (day: string) => {
    setDays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]
    );
  };

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString("default", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    });
  };

  const handleCreate = async () => {
    if (!title.trim()) {
      Alert.alert("Error", "Please enter a reminder title");
      return;
    }

    // Check limit BEFORE calling API to avoid burning credits
    const { checkCanCreateReminder } = await import('../../lib/usage');
    const { canCreate } = await checkCanCreateReminder();
    if (!canCreate) {
      router.push('/paywall');
      return;
    }

    const timeStr = `${time.getHours().toString().padStart(2, "0")}:${time.getMinutes().toString().padStart(2, "0")}`;
    const desc = description.trim() || title.trim();

    try {
      const result = await processTextReminder({
        title: title.trim(),
        description: desc,
        time: timeStr,
        frequency,
        days: frequency === "custom" ? days : [],
      });

      if (!result.audioUrl) {
        throw new Error("Failed to get audio URL");
      }

      const newReminder = await storeAddReminder({
        convexId: result.id,
        title: result.title,
        description: result.description,
        time: result.time,
        frequency: result.frequency,
        days: result.days || [],
        audioUrl: result.audioUrl,
      });

      toast.show({ title: "Reminder created", message: newReminder.title, type: "success" });
      router.back();

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
          snoozeEnabled: newReminder.snoozeEnabled,
          snoozeDuration: newReminder.snoozeDuration,
          volume: newReminder.volume,
          volumeStyle: newReminder.volumeStyle,
        }).catch((e) => {
          console.log("[VR] Failed to schedule reminder:", e);
          if (e?.name === "ExactAlarmPermissionError") {
            Alert.alert(
              "Enable Alarms & reminders",
              "On Android 12+, the app needs the system 'Alarms & reminders' permission to schedule exact alarms.",
              [
                { text: "Open diagnostics", onPress: () => router.push("/diagnostics") },
                { text: "OK" },
              ]
            );
          }
        });
      });
    } catch (error: any) {
      console.error("[VR] Create error:", error);

      // Check if this is a limit exceeded error
      if (error?.name === 'ReminderLimitExceededError') {
        router.push('/paywall');
        return;
      }

      Alert.alert("Error", "Failed to create reminder");
    }
  };

  const isValid = title.trim().length > 0;

  return (
    <SafeAreaView style={styles.container} edges={["bottom"]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.closeButton}>
          <AppIcon name="x" size={28} color={colors.textPrimary} />
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
              placeholderTextColor={colors.textTertiary}
              autoFocus
              maxLength={100}
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
                  <AppIcon
                    name={f.icon}
                    size={24}
                    color={frequency === f.value ? "white" : colors.textSecondary}
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
          <TouchableOpacity
            style={styles.timeButton}
            onPress={() => setShowTimePicker(true)}
          >
            <View style={styles.timeIconContainer}>
              <AppIcon name="clock" size={20} color={colors.textSecondary} />
            </View>
            <Text style={styles.timeButtonText}>{formatTime(time)}</Text>
            <AppIcon name="chevron-right" size={20} color={colors.textSecondary} />
          </TouchableOpacity>

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
              initialValue={{
                hours: time.getHours(),
                minutes: time.getMinutes(),
              }}
              onConfirm={({ hours, minutes, seconds }) => {
                const isPm = (seconds ?? 0) >= 12;
                const hour24 = (hours % 12) + (isPm ? 12 : 0);
                const next = new Date(time);
                next.setHours(hour24, minutes, 0, 0);
                setTime(next);
                setShowTimePicker(false);
              }}
              pmLabel="PM"
              styles={{ theme: "light" }}
              useAmPmWheel
              use12HourPicker
            />
          ) : null}
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
              placeholderTextColor={colors.textTertiary}
              multiline
              numberOfLines={3}
              textAlignVertical="top"
              maxLength={250}
            />
          </View>
        </View>

        {/* Info Card */}
        <View style={styles.infoCard}>
          <AppIcon name="info" size={20} color={colors.textSecondary} />
          <Text style={styles.infoText}>
            This will generate a spoken reminder and schedule it as a notification.
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
    </SafeAreaView>
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
    paddingHorizontal: 15,
    paddingTop: Platform.OS === "ios" ? 50 : 15,
    paddingBottom: 10,
    backgroundColor: colors.background,
  },
  closeButton: {
    width: 40,
    height: 40,
    justifyContent: "center",
    alignItems: "center",
  },
  headerTitle: {
    fontSize: scaleFontSize(18),
    fontWeight: "700",
    color: colors.textPrimary,
  },
  handleBar: {
    width: 40,
    height: 4,
    backgroundColor: colors.borderSubtle,
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
    fontSize: scaleFontSize(18),
    fontWeight: "700",
    color: colors.textPrimary,
    marginBottom: 15,
  },
  inputContainer: {
    backgroundColor: colors.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  mainInput: {
    fontSize: scaleFontSize(18),
    color: colors.textPrimary,
    padding: 15,
  },
  optionsGrid: {
    flexDirection: "row",
    gap: 10,
  },
  optionCard: {
    flex: 1,
    backgroundColor: colors.card,
    borderRadius: 16,
    padding: 15,
    alignItems: "center",
    borderWidth: 1,
    borderColor: colors.border,
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
    backgroundColor: colors.surfaceAlt,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 10,
  },
  selectedOptionIcon: {
    backgroundColor: "rgba(255, 255, 255, 0.2)",
  },
  optionLabel: {
    fontSize: scaleFontSize(14),
    fontWeight: "600",
    color: colors.textPrimary,
  },
  selectedOptionLabel: {
    color: "white",
  },
  timePickerWrapper: {
    backgroundColor: colors.card,
    borderRadius: 16,
    padding: 15,
    borderWidth: 1,
    borderColor: colors.border,
  },
  timeButton: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.card,
    borderRadius: 16,
    padding: 15,
    borderWidth: 1,
    borderColor: colors.border,
  },
  timeIconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.accentLight,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 10,
  },
  timeButtonText: {
    flex: 1,
    fontSize: scaleFontSize(16),
    color: colors.textPrimary,
  },
  textAreaContainer: {
    backgroundColor: colors.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  textArea: {
    minHeight: 100,
    padding: 15,
    fontSize: scaleFontSize(16),
    color: colors.textPrimary,
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
    fontSize: scaleFontSize(14),
    color: colors.textSecondary,
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
    fontSize: scaleFontSize(16),
    fontWeight: "700",
  },
  cancelButton: {
    paddingVertical: 15,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: colors.card,
  },
  cancelButtonText: {
    color: colors.textSecondary,
    fontSize: scaleFontSize(16),
    fontWeight: "600",
  },
});
