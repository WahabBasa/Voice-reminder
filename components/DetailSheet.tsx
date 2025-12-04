import React, { useCallback, useMemo, forwardRef, useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
} from "react-native";
import { BottomSheetModal, BottomSheetBackdrop, BottomSheetScrollView } from "@gorhom/bottom-sheet";
import { Ionicons } from "@expo/vector-icons";
import Slider from "@react-native-community/slider";
import { Audio } from "expo-av";
import { colors, spacing, typography, borderRadius } from "../lib/theme";
import DaySelector from "./DaySelector";
import TimePicker from "./TimePicker";

export interface ReminderData {
  id: string;
  title: string;
  description: string;
  time: string;
  frequency: string;
  days?: string[];
  audioUrl?: string;
  isNew?: boolean;
}

interface DetailSheetProps {
  reminder: ReminderData | null;
  onClose: () => void;
  onSave?: (data: ReminderData) => void;
}

const FREQUENCIES = [
  { value: "once", label: "Once" },
  { value: "daily", label: "Daily" },
  { value: "weekly", label: "Weekly" },
];

const DetailSheet = forwardRef<BottomSheetModal, DetailSheetProps>(
  ({ reminder, onClose, onSave }, ref) => {
    const snapPoints = useMemo(() => ["90%"], []);

    // Editable state
    const [title, setTitle] = useState("");
    const [description, setDescription] = useState("");
    const [time, setTime] = useState(new Date());
    const [frequency, setFrequency] = useState("once");
    const [days, setDays] = useState<string[]>([]);
    const [volume, setVolume] = useState(0.8);
    const [sound, setSound] = useState<Audio.Sound | null>(null);
    const [isPlaying, setIsPlaying] = useState(false);

    // Update state when reminder changes
    useEffect(() => {
      if (reminder) {
        setTitle(reminder.title || "");
        setDescription(reminder.description || "");
        setFrequency(reminder.frequency || "once");
        setDays(reminder.days || []);
        
        // Parse time string to Date
        if (reminder.time) {
          const [hours, minutes] = reminder.time.split(":").map(Number);
          const date = new Date();
          date.setHours(hours, minutes, 0, 0);
          setTime(date);
        }
      }
    }, [reminder]);

    // Cleanup sound on unmount
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

    const handleSave = () => {
      if (!reminder) return;

      const timeStr = `${time.getHours().toString().padStart(2, "0")}:${time.getMinutes().toString().padStart(2, "0")}`;

      onSave?.({
        ...reminder,
        title,
        description,
        time: timeStr,
        frequency,
        days: frequency === "weekly" ? days : [],
      });

      (ref as any)?.current?.dismiss();
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
        currentDays !== originalDays
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
              {/* Title */}
              <View style={styles.field}>
                <Text style={styles.label}>Title</Text>
                <TextInput
                  style={styles.input}
                  value={title}
                  onChangeText={setTitle}
                  placeholder="Reminder title"
                  placeholderTextColor={colors.textSecondary}
                />
              </View>

              {/* Time - Wheel Picker */}
              <View style={styles.field}>
                <Text style={styles.label}>Time</Text>
                <TimePicker value={time} onChange={setTime} />
              </View>

              {/* Frequency */}
              <View style={styles.field}>
                <Text style={styles.label}>Repeats</Text>
                <View style={styles.frequencyOptions}>
                  {FREQUENCIES.map((f) => (
                    <TouchableOpacity
                      key={f.value}
                      style={[
                        styles.frequencyOption,
                        frequency === f.value && styles.frequencyOptionActive,
                      ]}
                      onPress={() => setFrequency(f.value)}
                    >
                      <Text
                        style={[
                          styles.frequencyText,
                          frequency === f.value && styles.frequencyTextActive,
                        ]}
                      >
                        {f.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              {/* Days (for weekly) */}
              {frequency === "weekly" && (
                <View style={styles.field}>
                  <Text style={styles.label}>Days</Text>
                  <DaySelector
                    selectedDays={days}
                    onToggle={handleDayToggle}
                  />
                </View>
              )}

              {/* Divider */}
              <View style={styles.divider} />

              {/* Voice Preview */}
              {reminder.audioUrl && (
                <View style={styles.field}>
                  <Text style={styles.label}>Voice Preview</Text>
                  <View style={styles.previewContainer}>
                    <Text style={styles.previewText} numberOfLines={2}>
                      "{description || "No description"}"
                    </Text>
                    <TouchableOpacity
                      style={styles.playButton}
                      onPress={handlePlayPreview}
                    >
                      <Ionicons
                        name={isPlaying ? "stop" : "play"}
                        size={24}
                        color="#fff"
                      />
                    </TouchableOpacity>
                  </View>

                  {/* Volume Slider */}
                  <View style={styles.volumeContainer}>
                    <Ionicons name="volume-low" size={18} color={colors.textSecondary} />
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
                      maximumTrackTintColor={colors.muted}
                      thumbTintColor={colors.accent}
                    />
                    <Ionicons name="volume-high" size={18} color={colors.textSecondary} />
                  </View>
                </View>
              )}

              {/* Description (editable) */}
              <View style={styles.field}>
                <Text style={styles.label}>What to say</Text>
                <TextInput
                  style={[styles.input, styles.textArea]}
                  value={description}
                  onChangeText={setDescription}
                  placeholder="What should the reminder say?"
                  placeholderTextColor={colors.textSecondary}
                  multiline
                  numberOfLines={3}
                />
              </View>

              {/* Save Button */}
              {(hasChanges() || reminder.isNew) && (
                <TouchableOpacity
                  style={styles.saveButton}
                  onPress={handleSave}
                  activeOpacity={0.8}
                >
                  <Text style={styles.saveButtonText}>
                    {reminder.isNew ? "Create Reminder" : "Save Changes"}
                  </Text>
                </TouchableOpacity>
              )}

              {/* Extra padding for bottom nav bar */}
              <View style={{ height: 100 }} />
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
    backgroundColor: colors.card,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
  },
  handleIndicator: {
    backgroundColor: colors.muted,
    width: 40,
  },
  content: {
    flex: 1,
    paddingHorizontal: spacing.lg,
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
  field: {
    marginBottom: spacing.lg,
  },
  label: {
    ...typography.caption,
    fontWeight: "600",
    marginBottom: spacing.sm,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  input: {
    backgroundColor: colors.background,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    fontSize: 16,
    color: colors.textPrimary,
  },
  textArea: {
    minHeight: 80,
    textAlignVertical: "top",
  },
  frequencyOptions: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  frequencyOption: {
    flex: 1,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.md,
    backgroundColor: colors.background,
    alignItems: "center",
  },
  frequencyOptionActive: {
    backgroundColor: colors.accent,
  },
  frequencyText: {
    fontSize: 14,
    fontWeight: "500",
    color: colors.textSecondary,
  },
  frequencyTextActive: {
    color: "#fff",
  },
  divider: {
    height: 1,
    backgroundColor: colors.border,
    marginVertical: spacing.md,
  },
  previewContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.accentLight,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    gap: spacing.md,
  },
  previewText: {
    flex: 1,
    fontSize: 14,
    fontStyle: "italic",
    color: colors.textPrimary,
  },
  playButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.accent,
    justifyContent: "center",
    alignItems: "center",
  },
  volumeContainer: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: spacing.sm,
    gap: spacing.sm,
  },
  slider: {
    flex: 1,
    height: 40,
  },
  saveButton: {
    backgroundColor: colors.accent,
    borderRadius: borderRadius.md,
    paddingVertical: spacing.md,
    alignItems: "center",
    marginTop: spacing.md,
  },
  saveButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
});
