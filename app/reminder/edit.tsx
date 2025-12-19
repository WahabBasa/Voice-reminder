import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert,
  InteractionManager,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useMutation } from "convex/react";
import { LinearGradient } from "expo-linear-gradient";
import { Audio } from "expo-av";
import { TimerPickerModal } from "react-native-timer-picker";
import { api } from "../../convex/_generated/api";
import AppIcon from "../../components/AppIcon";
import DatePickerModal from "../../components/DatePickerModal";
import DaySelector from "../../components/DaySelector";
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
  { value: "daily", label: "Daily" },
  { value: "custom", label: "Custom" },
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
    Alert.alert("Repeat", "How often should this reminder run?", [
      {
        text: "Once",
        onPress: () => {
          setFrequency("once");
          setShowDaysPicker(false);
        },
      },
      {
        text: "Daily",
        onPress: () => {
          setFrequency("daily");
          setShowDaysPicker(false);
        },
      },
      {
        text: "Custom days",
        onPress: () => {
          setFrequency("custom");
          setShowDaysPicker(true);
        },
      },
      { text: "Cancel", style: "cancel" },
    ]);
  };

  const openSoundRepeatPicker = () => {
    Alert.alert("Sound repeats", "How many times should the reminder sound play?", [
      {
        text: "1x",
        onPress: () => {
          setSoundRepeatMode("count");
          setSoundRepeatCount(1);
        },
      },
      {
        text: "2x",
        onPress: () => {
          setSoundRepeatMode("count");
          setSoundRepeatCount(2);
        },
      },
      {
        text: "3x",
        onPress: () => {
          setSoundRepeatMode("count");
          setSoundRepeatCount(3);
        },
      },
      {
        text: "Until stopped",
        onPress: () => {
          setSoundRepeatMode("until_stopped");
        },
      },
      { text: "Cancel", style: "cancel" },
    ]);
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

  const handleBack = () => {
    if (!hasChanges()) {
      router.back();
      return;
    }

    Alert.alert("Discard changes?", "You have unsaved edits.", [
      { text: "Keep editing", style: "cancel" },
      { text: "Discard", style: "destructive", onPress: () => router.back() },
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

  if (!reminder) {
    return (
      <SafeAreaView style={styles.container} edges={["top", "bottom"]}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.headerIconButton}>
            <AppIcon name="arrow-left" size={24} color={stylesVars.headerText} />
          </TouchableOpacity>
          <View style={styles.headerIconButton} />
        </View>
        <View style={styles.loadingBody}>
          <Text style={styles.loadingText}>Loading...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={["top", "bottom"]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={handleBack} style={styles.headerIconButton}>
          <AppIcon name="arrow-left" size={24} color={stylesVars.headerText} />
        </TouchableOpacity>
        <TouchableOpacity onPress={openOptionsMenu} style={styles.headerIconButton} activeOpacity={0.7}>
          <AppIcon name="more-vertical" size={24} color={stylesVars.headerText} />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <TouchableOpacity style={styles.topChip} onPress={openFrequencyPicker} activeOpacity={0.7}>
          <Text style={styles.topChipText}>{frequencyLabel}</Text>
          <AppIcon name="chevron-down" size={16} color={stylesVars.iconColor} />
        </TouchableOpacity>

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

        <View style={{ height: 26 }} />
      </ScrollView>
    </SafeAreaView>
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
