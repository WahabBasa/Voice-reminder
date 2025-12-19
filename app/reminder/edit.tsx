import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  InteractionManager,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useMutation } from "convex/react";
import { LinearGradient } from "expo-linear-gradient";
import { Audio } from "expo-av";
import { TimerPickerModal } from "react-native-timer-picker";
import BottomSheet, { BottomSheetScrollView, BottomSheetBackdrop } from "@gorhom/bottom-sheet";
import { api } from "../../convex/_generated/api";
import AppIcon from "../../components/AppIcon";
import DatePickerModal from "../../components/DatePickerModal";
import DaySelector from "../../components/DaySelector";
import SoundRepeatModal from "../../components/SoundRepeatModal";
import RepeatTaskModal from "../../components/RepeatTaskModal";
import { cancelReminder, scheduleReminder } from "../../lib/notifications";
import {
  deleteReminder as deleteReminderStorage,
  getReminders,
  Reminder,
  updateReminder as updateReminderStorage,
} from "../../lib/storage";
import { colors, scaleFontSize } from "../../lib/theme";

const FREQUENCIES = [
  { value: "once", label: "Once" },
  { value: "hour", label: "Hourly" },
  { value: "daily", label: "Daily" },
  { value: "custom", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
  { value: "yearly", label: "Yearly" },
];

type SettingsRowProps = {
  icon: Parameters<typeof AppIcon>[0]["name"];
  label: string;
  value?: string;
  isAction?: boolean;
  onPress?: () => void;
};

function SettingsRow({ icon, label, value, isAction, onPress }: SettingsRowProps) {
  const isPressable = Boolean(onPress);
  return (
    <TouchableOpacity
      style={styles.row}
      onPress={onPress}
      disabled={!isPressable}
      activeOpacity={0.7}
    >
      <View style={styles.rowLeft}>
        <AppIcon name={icon} size={22} color={stylesVars.iconColor} />
        <Text style={styles.rowLabel}>{label}</Text>
      </View>

      {value ? (
        <View style={styles.valuePill}>
          <Text style={styles.valueText}>{value}</Text>
        </View>
      ) : isAction ? (
        <Text style={styles.actionText}>ADD</Text>
      ) : null}
    </TouchableOpacity>
  );
}

function formatTime(date: Date) {
  return date.toLocaleTimeString("default", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
}

export default function EditReminderScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const updateConvexReminder = useMutation(api.reminders.update);
  const removeConvexReminder = useMutation(api.reminders.remove);

  const bottomSheetRef = useRef<BottomSheet>(null);
  const snapPoints = useMemo(() => ["60%", "95%"], []);

  const [reminder, setReminder] = useState<Reminder | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [time, setTime] = useState(new Date());
  const [frequency, setFrequency] = useState("once");
  const [days, setDays] = useState<string[]>([]);
  const [soundRepeatMode, setSoundRepeatMode] = useState<"count" | "until_stopped">("count");
  const [soundRepeatCount, setSoundRepeatCount] = useState<number>(1);

  const [dueDate, setDueDate] = useState<Date | null>(null);

  const [showTimePicker, setShowTimePicker] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showDaysPicker, setShowDaysPicker] = useState(false);
  const [showSoundRepeatModal, setShowSoundRepeatModal] = useState(false);
  const [showRepeatTaskModal, setShowRepeatTaskModal] = useState(false);

  const [sound, setSound] = useState<Audio.Sound | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);

  const loadReminder = useCallback(async () => {
    if (!id) return;
    const reminders = await getReminders();
    const found = reminders.find((r) => r.id === id);
    if (!found) return;

    setReminder(found);
    setTitle(found.title || "");
    setDescription(found.description || "");
    setFrequency(found.frequency === "weekly" ? "custom" : (found.frequency || "once"));
    setDays(found.days || []);
    setSoundRepeatMode(found.soundRepeatMode || "count");
    setSoundRepeatCount(found.soundRepeatCount ?? 1);

    if (found.time) {
      const [hours, minutes] = found.time.split(":").map(Number);
      const date = new Date();
      date.setHours(hours, minutes, 0, 0);
      setTime(date);
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
    setDays((prev) => (prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]));
  };

  const hasChanges = useCallback(() => {
    if (!reminder) return false;

    const timeStr = `${time.getHours().toString().padStart(2, "0")}:${time
      .getMinutes()
      .toString()
      .padStart(2, "0")}`;
    const currentDays = [...days].sort().join(",");
    const originalDays = [...(reminder.days || [])].sort().join(",");

    return (
      title !== reminder.title ||
      timeStr !== reminder.time ||
      frequency !== reminder.frequency ||
      currentDays !== originalDays ||
      (reminder.soundRepeatMode || "count") !== soundRepeatMode ||
      (reminder.soundRepeatCount ?? 1) !== soundRepeatCount
    );
  }, [days, frequency, reminder, soundRepeatCount, soundRepeatMode, time, title]);

  const frequencyLabel = useMemo(() => {
    return FREQUENCIES.find((f) => f.value === frequency)?.label ?? "Once";
  }, [frequency]);

  const daysLabel = useMemo(() => {
    if (frequency !== "custom") return "";
    if (!days.length) return "Select";
    const ordered = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
    const normalized = days.map((d) => d.toLowerCase());
    const picked = ordered.filter((d) => normalized.includes(d));
    return picked.map((d) => d.charAt(0).toUpperCase() + d.slice(1, 3)).join(", ");
  }, [days, frequency]);

  const soundRepeatLabel = useMemo(() => {
    if (soundRepeatMode === "until_stopped") return "Until stopped";
    return `${soundRepeatCount}x`;
  }, [soundRepeatCount, soundRepeatMode]);

  const dueDateLabel = useMemo(() => {
    if (!dueDate) return undefined;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const dueDateNorm = new Date(dueDate);
    dueDateNorm.setHours(0, 0, 0, 0);

    if (dueDateNorm.getTime() === today.getTime()) return "Today";
    if (dueDateNorm.getTime() === tomorrow.getTime()) return "Tomorrow";
    return dueDate.toLocaleDateString("default", { month: "short", day: "numeric", year: "numeric" });
  }, [dueDate]);

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

      const { sound: nextSound } = await Audio.Sound.createAsync(
        { uri: reminder.audioUrl },
        { volume: 0.9 }
      );
      setSound(nextSound);

      nextSound.setOnPlaybackStatusUpdate((status) => {
        if (status.isLoaded && status.didJustFinish) {
          setIsPlaying(false);
        }
      });

      await nextSound.playAsync();
      setIsPlaying(true);
    } catch (error) {
      console.error("[VR] Error playing audio:", error);
    }
  };

  const openFrequencyPicker = () => {
    setShowRepeatTaskModal(true);
  };

  const openSoundRepeatPicker = () => {
    setShowSoundRepeatModal(true);
  };

  const handleRepeatConfirm = (data: {
    enabled: boolean;
    frequency: any;
    interval: number;
    days?: string[];
    endDate?: string;
  }) => {
    if (!data.enabled) {
      setFrequency("once");
    } else {
      setFrequency(data.frequency === "weekly" ? "custom" : data.frequency);
      if (data.days) setDays(data.days);
    }
    setShowRepeatTaskModal(false);
  };

  const handleSoundRepeatConfirm = (value: string | number) => {
    if (value === "until_stopped") {
      setSoundRepeatMode("until_stopped");
    } else {
      setSoundRepeatMode("count");
      setSoundRepeatCount(value as number);
    }
    setShowSoundRepeatModal(false);
  };

  const handleSave = async () => {
    if (!reminder) return;
    if (!title.trim()) {
      Alert.alert("Error", "Please enter a reminder title");
      return;
    }

    const timeStr = `${time.getHours().toString().padStart(2, "0")}:${time
      .getMinutes()
      .toString()
      .padStart(2, "0")}`;

    const updatedReminder: Reminder = {
      ...reminder,
      title: title.trim(),
      description,
      time: timeStr,
      frequency,
      days: frequency === "custom" ? days : [],
      soundRepeatMode,
      soundRepeatCount,
    };

    try {
      await updateReminderStorage(updatedReminder);
      router.back();

      const reminderId = reminder.id;
      const convexId = reminder.convexId;
      const audioUrl = reminder.audioUrl;
      const scheduleDays = frequency === "custom" ? days : [];

      InteractionManager.runAfterInteractions(() => {
        if (convexId) {
          updateConvexReminder({
            id: convexId as any,
            title: updatedReminder.title,
            description,
            time: timeStr,
            frequency,
            days: frequency === "custom" ? days : undefined,
            soundRepeatMode,
            soundRepeatCount,
          }).catch((e) => {
            console.log("[VR] Failed to update Convex reminder:", e);
          });
        }

        (async () => {
          try {
            await cancelReminder(reminderId);
          } catch (e) {
            console.log("[VR] Failed to cancel notification:", e);
          }

          if (!audioUrl) return;

          try {
            await scheduleReminder({
              id: reminderId,
              title: updatedReminder.title,
              description,
              time: timeStr,
              frequency,
              days: scheduleDays,
              audioUrl,
              soundRepeatMode,
              soundRepeatCount,
            });
          } catch (e) {
            console.log("[VR] Failed to schedule reminder:", e);
          }
        })();
      });
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
          const reminderId = reminder.id;
          const convexId = reminder.convexId;

          try {
            await deleteReminderStorage(reminderId);
          } catch (e) {
            console.log("[VR] Failed to delete reminder:", e);
            Alert.alert("Error", "Failed to delete reminder");
            return;
          }

          router.back();

          InteractionManager.runAfterInteractions(() => {
            cancelReminder(reminderId).catch((e) => {
              console.log("[VR] Failed to cancel notification:", e);
            });

            if (convexId) {
              removeConvexReminder({ id: convexId as any }).catch((e) => {
                console.log("[VR] Failed to delete Convex reminder:", e);
              });
            }
          });
        },
      },
    ]);
  };

  const openOptionsMenu = () => {
    const options: Array<{text: string; style?: "cancel" | "destructive"; onPress?: () => void}> = [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: handleDelete,
      },
    ];
    if (hasChanges()) {
      options.unshift({
        text: "Save",
        onPress: handleSave,
      });
    }
    Alert.alert("Options", undefined, options);
  };

  const renderBackdrop = useCallback(
    (props: any) => (
      <BottomSheetBackdrop {...props} disappearsOnIndex={-1} appearsOnIndex={0} opacity={0.5} />
    ),
    []
  );

  const handleSheetChange = useCallback(
    (index: number) => {
      if (index === -1) {
        router.back();
      }
    },
    [router]
  );

  if (!reminder) {
    return (
      <View style={styles.sheetContainer}>
        <BottomSheet
          ref={bottomSheetRef}
          snapPoints={snapPoints}
          index={0}
          enablePanDownToClose
          backdropComponent={renderBackdrop}
          onChange={handleSheetChange}
          handleIndicatorStyle={styles.handleIndicator}
          backgroundStyle={styles.sheetBackground}
        >
          <View style={styles.loadingBody}>
            <Text style={styles.loadingText}>Loading...</Text>
          </View>
        </BottomSheet>
      </View>
    );
  }

  return (
    <View style={styles.sheetContainer}>
      <BottomSheet
        ref={bottomSheetRef}
        snapPoints={snapPoints}
        index={0}
        enablePanDownToClose
        backdropComponent={renderBackdrop}
        onChange={handleSheetChange}
        handleIndicatorStyle={styles.handleIndicator}
        backgroundStyle={styles.sheetBackground}
      >
        <BottomSheetScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <View style={styles.sheetHeader}>
            <TouchableOpacity style={styles.topChip} onPress={openFrequencyPicker} activeOpacity={0.7}>
              <Text style={styles.topChipText}>{frequencyLabel}</Text>
              <AppIcon name="chevron-down" size={16} color={stylesVars.iconColor} />
            </TouchableOpacity>

            <TouchableOpacity onPress={openOptionsMenu} style={styles.moreButton} activeOpacity={0.7}>
              <AppIcon name="more-vertical" size={24} color={stylesVars.headerText} />
            </TouchableOpacity>
          </View>

          <TextInput
            style={styles.titleInput}
            value={title}
            onChangeText={setTitle}
            placeholder="Reminder"
            placeholderTextColor={stylesVars.mutedText}
          />

          {reminder.audioUrl ? (
            <TouchableOpacity style={styles.playVoice} onPress={handlePlayPreview} activeOpacity={0.7}>
              <AppIcon name={isPlaying ? "square" : "play"} size={20} color={stylesVars.iconColor} />
              <Text style={styles.playVoiceText}>{isPlaying ? "Stop voice" : "Play voice"}</Text>
            </TouchableOpacity>
          ) : null}

          <View style={styles.rowList}>
            <SettingsRow
              icon="clock"
              label="Time"
              value={formatTime(time).toLowerCase()}
              onPress={() => setShowTimePicker(true)}
            />
            <SettingsRow icon="refresh-cw" label="Repeat Task" value={frequencyLabel} onPress={openFrequencyPicker} />

            {frequency === "custom" ? (
              <>
                <SettingsRow icon="calendar" label="Days" value={daysLabel} onPress={() => setShowDaysPicker((v) => !v)} />
                {showDaysPicker ? (
                  <View style={styles.daysPicker}>
                    <DaySelector selectedDays={days} onToggle={handleDayToggle} />
                  </View>
                ) : null}
              </>
            ) : null}

            <SettingsRow
              icon="volume-2"
              label="Sound repeats"
              value={soundRepeatLabel}
              onPress={openSoundRepeatPicker}
            />
            <SettingsRow
              icon="calendar"
              label="Due Date"
              value={dueDateLabel}
              isAction={!dueDateLabel}
              onPress={() => setShowDatePicker(true)}
            />
          </View>

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

          <DatePickerModal
            visible={showDatePicker}
            initialDate={dueDate}
            onCancel={() => setShowDatePicker(false)}
            onConfirm={(data) => {
              setDueDate(data.date);
              setShowDatePicker(false);
            }}
          />

          <SoundRepeatModal
            visible={showSoundRepeatModal}
            initialValue={soundRepeatMode === "until_stopped" ? "until_stopped" : soundRepeatCount}
            onCancel={() => setShowSoundRepeatModal(false)}
            onConfirm={handleSoundRepeatConfirm}
          />

          <RepeatTaskModal
            visible={showRepeatTaskModal}
            initialRepeatEnabled={frequency !== "once"}
            initialFrequency={
              frequency === "custom" ? "weekly" : (frequency === "once" ? "daily" : (frequency as any))
            }
            initialInterval={1}
            initialDays={days}
            onCancel={() => setShowRepeatTaskModal(false)}
            onConfirm={handleRepeatConfirm}
          />

          <View style={{ height: 40 }} />
        </BottomSheetScrollView>
      </BottomSheet>
    </View>
  );
}

const stylesVars = {
  bg: "#ffffff",
  iconColor: "#9e9e9e",
  headerText: "#212121",
  mutedText: "#9e9e9e",
  labelText: "#424242",
  chipBg: "#f5f5f5",
  chipText: "#616161",
  actionText: "#9e9e9e",
};

const styles = StyleSheet.create({
  sheetContainer: {
    flex: 1,
    backgroundColor: "transparent",
  },
  sheetBackground: {
    backgroundColor: stylesVars.bg,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
  },
  handleIndicator: {
    backgroundColor: "#e0e0e0",
    width: 36,
  },
  sheetHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  moreButton: {
    width: 44,
    height: 44,
    justifyContent: "center",
    alignItems: "center",
  },
  container: {
    flex: 1,
    backgroundColor: stylesVars.bg,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    paddingTop: Platform.OS === "ios" ? 12 : 8,
    paddingBottom: 4,
    backgroundColor: stylesVars.bg,
  },
  headerIconButton: {
    width: 44,
    height: 44,
    justifyContent: "center",
    alignItems: "center",
  },
  content: {
    paddingHorizontal: 20,
    paddingBottom: 22,
  },
  loadingBody: {
    flex: 1,
    paddingHorizontal: 22,
    justifyContent: "center",
    alignItems: "center",
  },
  loadingText: {
    fontSize: scaleFontSize(15),
    color: stylesVars.mutedText,
  },
  topChip: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: stylesVars.chipBg,
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 6,
    gap: 4,
    marginTop: 8,
  },
  topChipText: {
    fontSize: scaleFontSize(13),
    fontWeight: "500",
    color: stylesVars.chipText,
  },
  titleInput: {
    fontSize: scaleFontSize(22),
    fontWeight: "700",
    color: stylesVars.headerText,
    marginTop: 14,
    paddingVertical: 4,
  },
  playVoice: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 8,
    paddingVertical: 8,
  },
  playVoiceText: {
    fontSize: scaleFontSize(14),
    fontWeight: "500",
    color: "#1a73e8",
  },
  rowList: {
    marginTop: 20,
  },
  row: {
    paddingVertical: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  rowLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
  },
  rowLabel: {
    fontSize: scaleFontSize(15),
    fontWeight: "400",
    color: stylesVars.labelText,
  },
  valuePill: {
    backgroundColor: stylesVars.chipBg,
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  valueText: {
    fontSize: scaleFontSize(13),
    fontWeight: "400",
    color: stylesVars.chipText,
  },
  actionText: {
    fontSize: scaleFontSize(13),
    fontWeight: "500",
    color: stylesVars.actionText,
  },
  daysPicker: {
    paddingLeft: 38,
    paddingBottom: 12,
    paddingTop: 4,
  },
});
