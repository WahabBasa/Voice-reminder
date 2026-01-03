import React, { useCallback, useMemo, forwardRef, useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Dimensions,
} from "react-native";
import { BottomSheetModal, BottomSheetBackdrop, BottomSheetScrollView } from "@gorhom/bottom-sheet";
import { LinearGradient } from "expo-linear-gradient";
import Slider from "@react-native-community/slider";
import { Audio } from "expo-av";
import { TimerPickerModal } from "react-native-timer-picker";
import { colors, spacing } from "../lib/theme";
import DaySelector from "./DaySelector";
import AppIcon from "./AppIcon";

const REPEAT_OPTIONS: { label: string; mode: "count" | "until_stopped"; count?: number }[] = [
  { label: "1x", mode: "count", count: 1 },
  { label: "2x", mode: "count", count: 2 },
  { label: "3x", mode: "count", count: 3 },
  { label: "Until stopped", mode: "until_stopped" },
];

const { width } = Dimensions.get("window");

export interface ReminderData {
  id: string;
  title: string;
  description: string;
  time: string;
  frequency: string;
  days?: string[];
  audioUrl?: string;
  isNew?: boolean;
  soundRepeatMode?: "count" | "until_stopped";
  soundRepeatCount?: number;
}

interface DetailSheetProps {
  reminder: ReminderData | null;
  onClose: () => void;
  onSave?: (data: ReminderData) => void;
  onDelete?: (id: string) => void;
}

const FREQUENCIES = [
  { value: "once", label: "Once", icon: "sun" as const },
  { value: "daily", label: "Daily", icon: "refresh-cw" as const },
  { value: "custom", label: "Custom", icon: "calendar" as const },
];

const DetailSheet = forwardRef<BottomSheetModal, DetailSheetProps>(
  ({ reminder, onClose, onSave, onDelete }, ref) => {
    const snapPoints = useMemo(() => ["90%"], []);

    const [title, setTitle] = useState("");
    const [description, setDescription] = useState("");
    const [time, setTime] = useState(new Date());
    const [frequency, setFrequency] = useState("once");
    const [days, setDays] = useState<string[]>([]);
    const [volume, setVolume] = useState(0.8);
    const [sound, setSound] = useState<Audio.Sound | null>(null);
    const [isPlaying, setIsPlaying] = useState(false);
    const [showTimePicker, setShowTimePicker] = useState(false);
    const [soundRepeatMode, setSoundRepeatMode] = useState<"count" | "until_stopped">("until_stopped");
    const [soundRepeatCount, setSoundRepeatCount] = useState<number>(30);

    useEffect(() => {
      if (reminder) {
        setTitle(reminder.title || "");
        setDescription(reminder.description || "");
        setFrequency(reminder.frequency || "once");
        setDays(reminder.days || []);
        setSoundRepeatMode(reminder.soundRepeatMode || "until_stopped");
        setSoundRepeatCount(reminder.soundRepeatCount ?? 30);

        if (reminder.time) {
          const [hours, minutes] = reminder.time.split(":").map(Number);
          const date = new Date();
          date.setHours(hours, minutes, 0, 0);
          setTime(date);
        }
      }
    }, [reminder]);

    useEffect(() => {
      return () => {
        if (sound) {
          sound.unloadAsync();
        }
      };
    }, [sound]);

    const renderBackdrop = useCallback(
      (props: any) => (
        <BottomSheetBackdrop
          {...props}
          disappearsOnIndex={-1}
          appearsOnIndex={0}
          opacity={0.5}
          pressBehavior="close"
        />
      ),
      []
    );

    const handleSheetChanges = useCallback((index: number) => {
      if (index === -1) {
        onClose();
      }
    }, [onClose]);

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

      try {
        await onSave?.({
          ...reminder,
          title,
          description,
          time: timeStr,
          frequency,
          days: frequency === "custom" ? days : [],
          soundRepeatMode,
          soundRepeatCount,
        });
      } finally {
        // Always close the sheet after attempting save
        (ref as any)?.current?.dismiss();
      }
    };

    const handleCancel = () => {
      (ref as any)?.current?.dismiss();
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
      if (reminder.isNew) return true;

      const timeStr = `${time.getHours().toString().padStart(2, "0")}:${time.getMinutes().toString().padStart(2, "0")}`;
      const currentDays = [...days].sort().join(",");
      const originalDays = [...(reminder.days || [])].sort().join(",");

      return (
        title !== reminder.title ||
        description !== reminder.description ||
        timeStr !== reminder.time ||
        frequency !== reminder.frequency ||
        currentDays !== originalDays ||
        (reminder.soundRepeatMode || "until_stopped") !== soundRepeatMode ||
        (reminder.soundRepeatCount ?? 30) !== soundRepeatCount
      );
    };

    return (
      <BottomSheetModal
        ref={ref}
        snapPoints={snapPoints}
        enablePanDownToClose
        onChange={handleSheetChanges}
        backdropComponent={renderBackdrop}
        handleIndicatorStyle={styles.handleIndicator}
        backgroundStyle={styles.background}
        android_keyboardInputMode="adjustResize"
      >
        <BottomSheetScrollView style={styles.content} showsVerticalScrollIndicator={false}>
          {reminder ? (
            <>
              {/* Title Input */}
              <View style={styles.section}>
                <View style={styles.inputContainer}>
                  <TextInput
                    style={styles.mainInput}
                    value={title}
                    onChangeText={setTitle}
                    placeholder="Reminder Title"
                    placeholderTextColor={colors.textTertiary}
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
                  <DaySelector
                    selectedDays={days}
                    onToggle={handleDayToggle}
                  />
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
                    initialValue={{
                      hours: time.getHours(),
                      minutes: time.getMinutes(),
                    }}
                    modalTitle="Select time"
                    onCancel={() => setShowTimePicker(false)}
                    onConfirm={({ hours, minutes, seconds }) => {
                      const isPm = (seconds ?? 0) >= 12;
                      const hour24 = (hours % 12) + (isPm ? 12 : 0);
                      const next = new Date(time);
                      next.setHours(hour24, minutes, 0, 0);
                      setTime(next);
                      setShowTimePicker(false);
                    }}
                    setIsVisible={setShowTimePicker}
                    styles={{ theme: "light" }}
                    useAmPmWheel
                    use12HourPicker
                    visible={showTimePicker}
                    amLabel="AM"
                    pmLabel="PM"
                  />
                ) : null}
              </View>

              {/* Sound repeats */}
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Sound repeats</Text>
                <View style={styles.repeatRow}>
                  {REPEAT_OPTIONS.map((opt) => {
                    const active =
                      opt.mode === soundRepeatMode &&
                      (opt.mode !== "count" || opt.count === soundRepeatCount);
                    return (
                      <TouchableOpacity
                        key={opt.label}
                        style={[
                          styles.repeatChip,
                          active && styles.repeatChipActive,
                        ]}
                        onPress={() => {
                          setSoundRepeatMode(opt.mode);
                          if (opt.count) setSoundRepeatCount(opt.count);
                        }}
                      >
                        <Text
                          style={[
                            styles.repeatChipText,
                            active && styles.repeatChipTextActive,
                          ]}
                        >
                          {opt.label}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
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
                      <TouchableOpacity
                        style={styles.playButton}
                        onPress={handlePlayPreview}
                      >
                        <AppIcon name={isPlaying ? "square" : "play"} size={24} color="#fff" />
                      </TouchableOpacity>
                    </View>

                    <View style={styles.volumeContainer}>
                      <AppIcon name="volume-1" size={18} color={colors.textSecondary} />
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
                        maximumTrackTintColor={colors.borderSubtle}
                        thumbTintColor={colors.accent}
                      />
                      <AppIcon name="volume-2" size={18} color={colors.textSecondary} />
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
                    placeholderTextColor={colors.textTertiary}
                    multiline
                    numberOfLines={3}
                    textAlignVertical="top"
                  />
                </View>
              </View>

              {/* Footer Buttons */}
              <View style={styles.footer}>
                {(hasChanges() || reminder.isNew) && (
                  <TouchableOpacity
                    style={styles.saveButton}
                    onPress={handleSave}
                    activeOpacity={0.8}
                  >
                    <LinearGradient
                      colors={colors.accentGradient}
                      style={styles.saveButtonGradient}
                    >
                      <Text style={styles.saveButtonText}>
                        {reminder.isNew ? "Create Reminder" : "Save Changes"}
                      </Text>
                    </LinearGradient>
                  </TouchableOpacity>
                )}
                <TouchableOpacity
                  style={styles.cancelButton}
                  onPress={handleCancel}
                >
                  <Text style={styles.cancelButtonText}>Cancel</Text>
                </TouchableOpacity>
                {!reminder.isNew && onDelete && (
                  <TouchableOpacity
                    style={styles.deleteButton}
                    onPress={() => onDelete(reminder.id)}
                  >
                    <AppIcon name="trash-2" size={20} color="#FF5252" />
                    <Text style={styles.deleteButtonText}>Delete Reminder</Text>
                  </TouchableOpacity>
                )}
              </View>

              <View style={{ height: 50 }} />
            </>
          ) : (
            <View style={styles.emptyContent}>
              <Text style={styles.emptyText}>No reminder selected</Text>
            </View>
          )}
        </BottomSheetScrollView>
      </BottomSheetModal>
    );
  }
);

DetailSheet.displayName = "DetailSheet";

export default DetailSheet;

const styles = StyleSheet.create({
  background: {
    backgroundColor: colors.background,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
  },
  handleIndicator: {
    backgroundColor: colors.borderSubtle,
    width: 40,
  },
  content: {
    flex: 1,
    paddingHorizontal: 20,
  },
  emptyContent: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingVertical: spacing.xl,
  },
  emptyText: {
    color: colors.textSecondary,
  },
  section: {
    marginBottom: 25,
  },
  sectionTitle: {
    fontSize: 18,
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
    fontSize: 18,
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
    fontSize: 14,
    fontWeight: "600",
    color: colors.textPrimary,
  },
  selectedOptionLabel: {
    color: "white",
  },
  timeButton: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.card,
    borderRadius: 16,
    padding: 15,
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
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
    fontSize: 16,
    color: colors.textPrimary,
  },
  timePickerWrapper: {
    backgroundColor: colors.card,
    borderRadius: 16,
    padding: 15,
    borderWidth: 1,
    borderColor: colors.border,
  },
  doneButton: {
    alignSelf: "flex-end",
    paddingHorizontal: 20,
    paddingVertical: 8,
    backgroundColor: colors.accent,
    borderRadius: 8,
    marginTop: 10,
  },
  doneButtonText: {
    color: "white",
    fontWeight: "600",
  },
  repeatRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginTop: 8,
  },
  repeatChip: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  repeatChipActive: {
    backgroundColor: colors.accentLight,
    borderColor: colors.accent,
  },
  repeatChipText: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.textPrimary,
  },
  repeatChipTextActive: {
    color: colors.accent,
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
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
    color: colors.textPrimary,
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
    fontSize: 16,
    color: colors.textPrimary,
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
    borderColor: colors.border,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: colors.card,
  },
  cancelButtonText: {
    color: colors.textSecondary,
    fontSize: 16,
    fontWeight: "600",
  },
  deleteButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 15,
    borderRadius: 16,
    marginTop: 12,
    backgroundColor: "#FFF5F5",
    borderWidth: 1,
    borderColor: "#FFCDD2",
  },
  deleteButtonText: {
    color: "#FF5252",
    fontSize: 16,
    fontWeight: "600",
    marginLeft: 8,
  },
});
