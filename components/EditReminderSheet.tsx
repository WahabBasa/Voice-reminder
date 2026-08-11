import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
    Alert,
    InteractionManager,
    Modal,
    Pressable,
    StyleSheet,
    Switch,
    Text,
    TextInput,
    View,
} from "react-native";
import ActionSheet from "./ActionSheet";
import * as FileSystem from "expo-file-system/legacy";
import { useMutation } from "convex/react";
import { useToast } from "./ToastProvider";
import { LinearGradient } from "expo-linear-gradient";
import { TimerPickerModal } from "react-native-timer-picker";
import { previewAudioService } from "../lib/AudioService";
import BottomSheet, {
    BottomSheetScrollView,
    BottomSheetBackdrop,
    TouchableOpacity,
} from "@gorhom/bottom-sheet";
import { api } from "../convex/_generated/api";
import AppIcon from "./AppIcon";
import DaySelector from "./DaySelector";
import RepeatTaskModal from "./RepeatTaskModal";
import DatePickerModal from "./DatePickerModal";
import { cancelReminder, deleteReminderWithAudio, openAlarmPermissionSettingsSafe, scheduleReminder } from "../lib/notifications";
import { migrateLegacySchedule } from "../lib/schedule";
import { createTraceId, perfLog } from "../lib/perf";
import { DEFAULT_ALARM_SETTINGS } from "../lib/storage";
import { INTERVAL_MAX_MS, INTERVAL_MIN_MS, useReminderStore, Reminder } from "../lib/store";
import { borderRadius, chipColors, colors, scaleFontSize, shadows } from "../lib/theme";
import { FONT_DISPLAY } from "../lib/fonts";
import { formatIntervalDuration } from "../lib/time";

const FREQUENCIES = [
    { value: "once", label: "Once" },
    { value: "hour", label: "Hourly" },
    { value: "daily", label: "Daily" },
    { value: "custom", label: "Weekly" },
    { value: "monthly", label: "Monthly" },
    { value: "yearly", label: "Yearly" },
];

// Tap-to-cycle options
const PRE_REMINDER_VALUES = [0, 5, 10, 15, 30];
const SNOOZE_VALUES = [0, 5, 10, 15, 30]; // 0 = snooze off

const EMOJI_CHOICES = [
    "💊", "🩺", "💉", "🦷", "❤️", "🧠",
    "🏃", "🏋️", "🧘", "🚶", "💧", "🍎",
    "🥗", "🍳", "☕", "🍽️", "😴", "🛏️",
    "🌅", "🌙", "📞", "💬", "📧", "📅",
    "📝", "💼", "💻", "📚", "🎓", "🧾",
    "💰", "🛒", "🎁", "🧺", "🧹", "🚗",
    "⛽", "🐕", "🐈", "🌱", "🎂", "✈️",
    "⏰", "🔔", "🎵", "🎨", "⚽", "🙏",
];

/** Deterministic pastel chip color per reminder id — stable forever. */
function chipColorFor(id: string): string {
    let hash = 0;
    for (let i = 0; i < id.length; i++) {
        hash = (hash * 31 + id.charCodeAt(i)) | 0;
    }
    return chipColors[Math.abs(hash) % chipColors.length];
}

type SheetRowProps = {
    icon: Parameters<typeof AppIcon>[0]["name"];
    label: string;
    value?: string;
    onPress?: () => void;
};

const SheetRow = React.memo(function SheetRow({ icon, label, value, onPress }: SheetRowProps) {
    return (
        <TouchableOpacity
            style={styles.row}
            onPress={onPress}
            disabled={!onPress}
            activeOpacity={0.7}
        >
            <View style={styles.rowLeft}>
                <AppIcon name={icon} size={20} color={colors.textSecondary} />
                <Text style={styles.rowLabel}>{label}</Text>
            </View>
            {value ? (
                <View style={styles.valuePill}>
                    <Text style={styles.valueText}>{value}</Text>
                </View>
            ) : null}
        </TouchableOpacity>
    );
});

function formatTime(date: Date) {
    return date.toLocaleTimeString("default", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: true,
    });
}

type EditReminderSheetProps = {
    reminder: Reminder;
    onClose: () => void;
    onSave: (updated: Reminder) => void;
    onDelete: (reminder: Reminder) => void;
};

export default function EditReminderSheet({ reminder: initialReminder, onClose, onSave, onDelete }: EditReminderSheetProps) {
    const traceId = useMemo(() => createTraceId("edit_sheet"), []);
    const updateConvexReminder = useMutation(api.reminders.update);
    const removeConvexReminder = useMutation(api.reminders.remove);

    // Zustand store actions
    const storeUpdateReminder = useReminderStore((state) => state.updateReminder);
    const storeDeleteReminder = useReminderStore((state) => state.deleteReminder);

    const bottomSheetRef = useRef<BottomSheet>(null);
    const snapPoints = useMemo(() => ["60%", "95%"], []);

    // Initialize state directly from prop - no async loading needed!
    const [reminder] = useState<Reminder>(initialReminder);
    const [title, setTitle] = useState(initialReminder.title || "");
    const [emoji, setEmoji] = useState<string | undefined>(initialReminder.emoji);
    const description = initialReminder.description || "";

    const [time, setTime] = useState(() => {
        if (initialReminder.time) {
            const [hours, minutes] = initialReminder.time.split(":").map(Number);
            const date = new Date();
            date.setHours(hours, minutes, 0, 0);
            return date;
        }
        return new Date();
    });

    const [frequency, setFrequency] = useState(
        initialReminder.frequency === "weekly" ? "custom" : (initialReminder.frequency || "once")
    );
    const [days, setDays] = useState<string[]>(initialReminder.days || []);

    const [intervalMs, setIntervalMs] = useState<number | undefined>(initialReminder.intervalMs);
    const [anchorAt, setAnchorAt] = useState<number | undefined>(initialReminder.anchorAt);
    const [intervalDays, setIntervalDays] = useState<number | undefined>(initialReminder.intervalDays);
    const [selectedDate, setSelectedDate] = useState<Date | null>(() => {
        if (initialReminder.date) {
            const [year, month, day] = initialReminder.date.split("-").map(Number);
            return new Date(year, month - 1, day);
        }
        return null;
    });
    const [showDatePicker, setShowDatePicker] = useState(false);

    const [preReminderMinutes, setPreReminderMinutes] = useState<number>(initialReminder.preReminderMinutes ?? 0);
    const [persistent, setPersistent] = useState<boolean>(initialReminder.persistent ?? false);
    const [snoozeEnabled, setSnoozeEnabled] = useState(initialReminder.snoozeEnabled ?? DEFAULT_ALARM_SETTINGS.snoozeEnabled);
    const [snoozeDuration, setSnoozeDuration] = useState(initialReminder.snoozeDuration ?? DEFAULT_ALARM_SETTINGS.snoozeDuration);

    // Volume control was cut from the sheet — values pass through unchanged.
    const volume = initialReminder.volume ?? DEFAULT_ALARM_SETTINGS.volume;
    const volumeStyle = initialReminder.volumeStyle ?? DEFAULT_ALARM_SETTINGS.volumeStyle;

    const [showTimePicker, setShowTimePicker] = useState(false);
    const [showDaysPicker, setShowDaysPicker] = useState(false);
    const [showRepeatTaskModal, setShowRepeatTaskModal] = useState(false);
    const [showEmojiPicker, setShowEmojiPicker] = useState(false);
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

    const chipColor = useMemo(() => chipColorFor(initialReminder.id), [initialReminder.id]);

    // Date formatting helpers
    const formatDateLabel = useCallback((date: Date | null) => {
        if (!date) return "Select Date";
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);
        const dateOnly = new Date(date);
        dateOnly.setHours(0, 0, 0, 0);

        if (dateOnly.getTime() === today.getTime()) return "Today";
        if (dateOnly.getTime() === tomorrow.getTime()) return "Tomorrow";
        return date.toLocaleDateString("default", { month: "short", day: "numeric", year: "numeric" });
    }, []);

    const dateLabel = useMemo(() => formatDateLabel(selectedDate), [formatDateLabel, selectedDate]);
    const [isPlaying, setIsPlaying] = useState(false);
    const toast = useToast();

    // Log mount/unmount and cleanup audio on unmount
    useEffect(() => {
        perfLog(traceId, "overlay.edit", "sheet_mount", { t: Date.now(), reminderId: initialReminder.id });

        return () => {
            perfLog(traceId, "overlay.edit", "sheet_unmount", { t: Date.now() });
            // Stop any preview audio when sheet closes
            previewAudioService.stop();
        };
    }, [initialReminder.id, traceId]);

    const handleDayToggle = (day: string) => {
        setDays((prev) => (prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]));
    };

    const frequencyLabel = useMemo(() => {
        if (frequency === "interval" && intervalMs) {
            return formatIntervalDuration(intervalMs);
        }
        if (frequency === "daily" && intervalDays && intervalDays > 1) {
            return `Every ${intervalDays} Days`;
        }
        return FREQUENCIES.find((f) => f.value === frequency)?.label ?? "Once";
    }, [frequency, intervalMs, intervalDays]);

    const daysLabel = useMemo(() => {
        if (frequency !== "custom") return "";
        if (!days.length) return "Select";
        const ordered = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
        const normalized = days.map((d) => d.toLowerCase());
        const picked = ordered.filter((d) => normalized.includes(d));
        return picked.map((d) => d.charAt(0).toUpperCase() + d.slice(1, 3)).join(", ");
    }, [days, frequency]);

    const preReminderLabel = useMemo(
        () => (preReminderMinutes > 0 ? `${preReminderMinutes} min before` : "None"),
        [preReminderMinutes]
    );

    const snoozeLabel = useMemo(
        () => (snoozeEnabled ? `${snoozeDuration} min` : "Off"),
        [snoozeEnabled, snoozeDuration]
    );

    const cyclePreReminder = useCallback(() => {
        setPreReminderMinutes((current) => {
            const idx = PRE_REMINDER_VALUES.indexOf(current);
            return PRE_REMINDER_VALUES[(idx + 1) % PRE_REMINDER_VALUES.length] ?? 0;
        });
    }, []);

    const cycleSnooze = useCallback(() => {
        const current = snoozeEnabled ? snoozeDuration : 0;
        const idx = SNOOZE_VALUES.indexOf(current);
        const next = SNOOZE_VALUES[(idx + 1) % SNOOZE_VALUES.length] ?? 0;
        if (next === 0) {
            setSnoozeEnabled(false);
        } else {
            setSnoozeEnabled(true);
            setSnoozeDuration(next);
        }
    }, [snoozeEnabled, snoozeDuration]);

    const handlePlayPreview = async () => {
        if (!reminder?.audioUrl) return;

        // If currently playing, stop
        if (isPlaying) {
            await previewAudioService.stop();
            setIsPlaying(false);
            return;
        }

        // Try to use local file if available
        let audioPath = reminder.audioUrl;
        try {
            const localPath = `${FileSystem.documentDirectory}reminder_${reminder.id}.mp3`;
            const localInfo = await FileSystem.getInfoAsync(localPath);
            if (localInfo.exists) {
                audioPath = localPath;
            }
        } catch (e) {
            console.log("[VR] Could not check local file, using remote URL");
        }

        // Play using AudioService with MUSIC stream for preview
        const success = await previewAudioService.play(
            audioPath,
            {
                volume,
                streamType: "music", // Preview uses MUSIC stream
                loop: false,
            },
            () => {
                // Called when playback ends
                setIsPlaying(false);
            }
        );

        setIsPlaying(success);
    };

    const openFrequencyPicker = () => {
        setShowRepeatTaskModal(true);
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
            setIntervalMs(undefined);
            setAnchorAt(undefined);
        } else {
            if (data.frequency === "hour" || data.frequency === "minute") {
                setFrequency("interval");
                const raw =
                    data.frequency === "minute"
                        ? data.interval * 60 * 1000
                        : data.interval * 60 * 60 * 1000;
                const clamped = Math.max(INTERVAL_MIN_MS, Math.min(INTERVAL_MAX_MS, raw));
                setIntervalMs(clamped);
                setAnchorAt(Date.now());
                setDays([]);
            } else if (data.frequency === "days") {
                setFrequency("daily");
                setIntervalDays(data.interval);
                setIntervalMs(undefined);
                setAnchorAt(undefined);
                setDays([]);
            } else {
                setFrequency(data.frequency === "weekly" ? "custom" : data.frequency);
                if (data.days) setDays(data.days);
                setIntervalMs(undefined);
                setAnchorAt(undefined);
                setIntervalDays(undefined);
            }
        }
        setShowRepeatTaskModal(false);
    };

    const handleSave = useCallback(async () => {
        if (!title.trim()) {
            Alert.alert("Error", "Please enter a reminder title");
            return;
        }

        const timeStr = `${time.getHours().toString().padStart(2, "0")}:${time
            .getMinutes()
            .toString()
            .padStart(2, "0")}`;

        // Format date as YYYY-MM-DD for storage
        const dateStr = selectedDate
            ? `${selectedDate.getFullYear()}-${String(selectedDate.getMonth() + 1).padStart(2, "0")}-${String(selectedDate.getDate()).padStart(2, "0")}`
            : undefined;

        // Derive canonical schedule fields from the edited legacy fields so
        // startup sync (which trusts canonical fields) stays consistent.
        const canonicalSchedule = migrateLegacySchedule({
            frequency,
            time: timeStr,
            date: dateStr,
            days: frequency === "custom" ? days : [],
            intervalMs: frequency === "interval" ? intervalMs : undefined,
            anchorAt: frequency === "interval" ? anchorAt : undefined,
        });

        const updatedReminder: Reminder = {
            ...reminder,
            title: title.trim(),
            emoji,
            description,
            time: timeStr,
            date: dateStr,
            frequency,
            days: frequency === "custom" ? days : [],
            preReminderMinutes: preReminderMinutes > 0 ? preReminderMinutes : undefined,
            persistent: persistent || undefined,
            snoozeEnabled,
            snoozeDuration,
            volume,
            volumeStyle,

            intervalMs: frequency === "interval" ? intervalMs : undefined,
            anchorAt: frequency === "interval" ? anchorAt : undefined,
            intervalDays: frequency === "daily" ? intervalDays : undefined,
            schemaVersion: 4,

            // Canonical schedule fields
            scheduleType: canonicalSchedule.type,
            onceAt: canonicalSchedule.type === 'once' ? canonicalSchedule.onceAt : undefined,
            rrule: canonicalSchedule.type === 'rrule' ? canonicalSchedule.rrule : undefined,
            dtstart: canonicalSchedule.type === 'rrule' ? canonicalSchedule.dtstart : undefined,
            tzid: Intl.DateTimeFormat().resolvedOptions().timeZone,
        };

        try {
            // Update via Zustand store (handles state + persistence)
            await storeUpdateReminder(updatedReminder);

            const reminderId = reminder.id;
            const convexId = reminder.convexId;
            const audioUrl = reminder.audioUrl;
            const scheduleDays = frequency === "custom" ? days : [];

            // Cancel + reschedule BEFORE closing (onClose unmounts the component)
            if (audioUrl) {
                try {
                    await cancelReminder(reminderId);
                    const { triggerTimestamp } = await scheduleReminder({
                        id: reminderId,
                        title: updatedReminder.title,
                        description,
                        time: timeStr,
                        date: dateStr,
                        frequency,
                        days: scheduleDays,
                        audioUrl,
                        preReminderMinutes,
                        preAudioUrl: reminder.preAudioUrl,
                        urgency: reminder.urgency,
                        persistent,
                        variants: reminder.variants,
                        variantAudioUrls: reminder.variantAudioUrls,
                        snoozeEnabled,
                        snoozeDuration,
                        volume,
                        volumeStyle,

                        intervalMs: frequency === "interval" ? intervalMs : undefined,
                        anchorAt: frequency === "interval" ? anchorAt : undefined,
                        intervalDays: frequency === "daily" ? intervalDays : undefined,
                    });

                    const current = useReminderStore.getState().getReminderById(reminderId);
                    if (current) {
                        await storeUpdateReminder({ ...current, scheduledFor: triggerTimestamp });
                    }
                } catch (e) {
                    console.log("[VR] Failed to reschedule reminder:", e);
                    if ((e as any)?.name === "ExactAlarmPermissionError") {
                        Alert.alert(
                            "Enable Alarms & reminders",
                            "On Android 12+, the app needs the system 'Alarms & reminders' permission to schedule exact alarms.",
                            [
                                { text: "Open permission", onPress: () => openAlarmPermissionSettingsSafe() },
                                { text: "OK" },
                            ]
                        );
                    }
                }
            }

            // Now safe to close
            onSave(updatedReminder);
            onClose();

            // Convex sync can be deferred — it doesn't affect local scheduling
            if (convexId) {
                updateConvexReminder({
                    id: convexId as any,
                    title: updatedReminder.title,
                    description,
                    time: timeStr,
                    frequency,
                    days: frequency === "custom" ? days : undefined,
                    preReminderMinutes,
                    persistent,
                }).catch((e) => {
                    console.log("[VR] Failed to update Convex reminder:", e);
                });
            }
        } catch (error) {
            console.error("[VR] Save error:", error);
            Alert.alert("Error", "Failed to save reminder");
        }
    }, [reminder, title, emoji, time, description, frequency, days, selectedDate, storeUpdateReminder, updateConvexReminder, preReminderMinutes, persistent, snoozeEnabled, snoozeDuration, volume, volumeStyle, intervalMs, anchorAt, intervalDays, onSave, onClose]);

    const executeDelete = async () => {
        const reminderId = reminder.id;
        const convexId = reminder.convexId;

        try {
            // Delete via Zustand store (handles state + persistence)
            await storeDeleteReminder(reminderId);
        } catch (e) {
            console.log("[VR] Failed to delete reminder:", e);
            toast.show({ title: "Error", message: "Failed to delete reminder", type: "error" });
            return;
        }

        onDelete(reminder);
        onClose();

        InteractionManager.runAfterInteractions(() => {
            deleteReminderWithAudio(reminderId).catch((e) => {
                console.log("[VR] Failed to cancel notification:", e);
            });

            if (convexId) {
                removeConvexReminder({ id: convexId as any }).catch((e) => {
                    console.log("[VR] Failed to delete Convex reminder:", e);
                });
            }
        });
    };

    const renderBackdrop = useCallback(
        (props: any) => (
            <BottomSheetBackdrop
                {...props}
                disappearsOnIndex={-1}
                appearsOnIndex={0}
                opacity={0.25}
                pressBehavior="close"
            />
        ),
        []
    );

    const handleSheetChange = useCallback(
        (index: number) => {
            perfLog(traceId, "overlay.edit", "bottomSheet_onChange", { t: Date.now(), index });
            // Note: onClose is now called in onAnimate for faster FAB reappearance
        },
        [traceId]
    );

    const expandSheet = useCallback(() => {
        bottomSheetRef.current?.snapToIndex(1);
    }, []);

    return (
        <View style={styles.sheetContainer}>
            <BottomSheet
                ref={bottomSheetRef}
                snapPoints={snapPoints}
                index={0}
                enablePanDownToClose
                animateOnMount
                enableDynamicSizing={false}
                backdropComponent={renderBackdrop}
                onChange={handleSheetChange}
                onAnimate={(fromIndex, toIndex) => {
                    perfLog(traceId, "overlay.edit", "bottomSheet_onAnimate", {
                        t: Date.now(),
                        fromIndex,
                        toIndex,
                    });
                    // Close immediately when animation starts so FAB reappears instantly
                    if (toIndex === -1) {
                        onClose();
                    }
                }}
                handleIndicatorStyle={styles.handleIndicator}
                backgroundStyle={styles.sheetBackground}
                activeOffsetY={[-15, 15]}
            >
                <BottomSheetScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>

                    {/* Title card: input + emoji chip */}
                    <View style={styles.titleCard}>
                        <TextInput
                            style={styles.titleInput}
                            value={title}
                            onChangeText={setTitle}
                            onFocus={expandSheet}
                            placeholder="Reminder"
                            placeholderTextColor={colors.textTertiary}
                            maxLength={100}
                        />
                        <TouchableOpacity
                            style={[styles.emojiChip, { backgroundColor: chipColor }]}
                            onPress={() => setShowEmojiPicker(true)}
                            activeOpacity={0.7}
                        >
                            {emoji ? (
                                <Text style={styles.emojiChipText}>{emoji}</Text>
                            ) : (
                                <AppIcon name="bell" size={20} color={colors.textSecondary} />
                            )}
                        </TouchableOpacity>
                    </View>

                    {/* Grouped rows card */}
                    <View style={styles.rowCard}>
                        <SheetRow
                            icon="clock"
                            label="Time"
                            value={formatTime(time).toLowerCase()}
                            onPress={() => setShowTimePicker(true)}
                        />

                        {frequency === "once" ? (
                            <>
                                <View style={styles.separator} />
                                <SheetRow
                                    icon="calendar"
                                    label="Date"
                                    value={dateLabel}
                                    onPress={() => setShowDatePicker(true)}
                                />
                            </>
                        ) : null}

                        <View style={styles.separator} />
                        <SheetRow icon="refresh-cw" label="Repeat" value={frequencyLabel} onPress={openFrequencyPicker} />

                        {frequency === "custom" ? (
                            <>
                                <View style={styles.separator} />
                                <SheetRow icon="calendar" label="Days" value={daysLabel} onPress={() => setShowDaysPicker((v) => !v)} />
                                {showDaysPicker ? (
                                    <View style={styles.daysPicker}>
                                        <DaySelector selectedDays={days} onToggle={handleDayToggle} />
                                    </View>
                                ) : null}
                            </>
                        ) : null}

                        <View style={styles.separator} />
                        <View style={styles.row}>
                            <View style={styles.rowLeftText}>
                                <View style={styles.rowLeft}>
                                    <AppIcon name="zap" size={20} color={colors.textSecondary} />
                                    <Text style={styles.rowLabel}>Alarm</Text>
                                </View>
                                <Text style={styles.rowSubLabel}>Keeps ringing until you respond</Text>
                            </View>
                            <Switch
                                value={persistent}
                                onValueChange={setPersistent}
                                trackColor={{ false: colors.muted, true: colors.accent }}
                                thumbColor="#ffffff"
                            />
                        </View>

                        <View style={styles.separator} />
                        <SheetRow icon="bell" label="Heads-up" value={preReminderLabel} onPress={cyclePreReminder} />

                        <View style={styles.separator} />
                        <SheetRow icon="clock" label="Snooze" value={snoozeLabel} onPress={cycleSnooze} />
                    </View>

                    {/* Voice note card */}
                    {reminder.audioUrl ? (
                        <View style={styles.rowCard}>
                            <TouchableOpacity
                                style={styles.row}
                                onPress={handlePlayPreview}
                                activeOpacity={0.7}
                            >
                                <View style={styles.rowLeft}>
                                    <View style={styles.playCircle}>
                                        <AppIcon name={isPlaying ? "square" : "play"} size={16} color="#ffffff" />
                                    </View>
                                    <Text style={styles.rowLabel}>Voice note</Text>
                                </View>
                                <View style={styles.valuePill}>
                                    <Text style={styles.valueText}>{isPlaying ? "Playing…" : "Play"}</Text>
                                </View>
                            </TouchableOpacity>
                        </View>
                    ) : null}

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

                    {showDatePicker ? (
                        <DatePickerModal
                            visible={showDatePicker}
                            initialDate={selectedDate}
                            initialTime={{ hours: time.getHours(), minutes: time.getMinutes() }}
                            dateOnly
                            onCancel={() => setShowDatePicker(false)}
                            onConfirm={({ date }) => {
                                setSelectedDate(date);
                                setShowDatePicker(false);
                            }}
                        />
                    ) : null}

                    {showRepeatTaskModal && (
                        <RepeatTaskModal
                            visible={showRepeatTaskModal}
                            initialRepeatEnabled={frequency !== "once"}
                            initialFrequency={
                                frequency === "interval"
                                    ? ((intervalMs && intervalMs % (60 * 60 * 1000) !== 0) ? "minute" : "hour")
                                    : (frequency === "custom"
                                        ? "weekly"
                                        : "days")
                            }
                            initialInterval={
                                frequency === "interval" && intervalMs
                                    ? (
                                        intervalMs % (60 * 60 * 1000) !== 0
                                            ? Math.max(Math.round(INTERVAL_MIN_MS / (60 * 1000)), Math.round(intervalMs / (60 * 1000)))
                                            : Math.max(1, Math.round(intervalMs / (60 * 60 * 1000)))
                                    )
                                    : (frequency === "daily" ? (intervalDays || 1) : 1)
                            }
                            initialDays={days}
                            onCancel={() => setShowRepeatTaskModal(false)}
                            onConfirm={handleRepeatConfirm}
                        />
                    )}

                    {/* Trash / Done */}
                    <View style={styles.bottomActions}>
                        <TouchableOpacity
                            style={styles.deleteCircle}
                            onPress={() => setShowDeleteConfirm(true)}
                            activeOpacity={0.7}
                        >
                            <AppIcon name="trash-2" size={20} color={colors.destructive} />
                        </TouchableOpacity>

                        <TouchableOpacity
                            style={styles.doneButton}
                            onPress={handleSave}
                            activeOpacity={0.7}
                        >
                            <Text style={styles.doneButtonText}>Done</Text>
                            <AppIcon name="check" size={18} color="white" />
                        </TouchableOpacity>
                    </View>

                    <View style={{ height: 40 }} />
                </BottomSheetScrollView>
            </BottomSheet>

            {/* Emoji picker */}
            <Modal
                visible={showEmojiPicker}
                transparent
                animationType="fade"
                onRequestClose={() => setShowEmojiPicker(false)}
            >
                <Pressable style={styles.emojiOverlay} onPress={() => setShowEmojiPicker(false)}>
                    <Pressable style={styles.emojiSheet} onPress={() => {}}>
                        <Text style={styles.emojiSheetTitle}>Pick an emoji</Text>
                        <View style={styles.emojiGrid}>
                            {EMOJI_CHOICES.map((choice) => {
                                const selected = choice === emoji;
                                return (
                                    <TouchableOpacity
                                        key={choice}
                                        style={[styles.emojiCell, selected && { backgroundColor: chipColor }]}
                                        onPress={() => {
                                            setEmoji(choice);
                                            setShowEmojiPicker(false);
                                        }}
                                        activeOpacity={0.7}
                                    >
                                        <Text style={styles.emojiCellText}>{choice}</Text>
                                    </TouchableOpacity>
                                );
                            })}
                        </View>
                        {emoji ? (
                            <TouchableOpacity
                                style={styles.emojiRemoveButton}
                                onPress={() => {
                                    setEmoji(undefined);
                                    setShowEmojiPicker(false);
                                }}
                                activeOpacity={0.7}
                            >
                                <Text style={styles.emojiRemoveText}>Remove emoji</Text>
                            </TouchableOpacity>
                        ) : null}
                    </Pressable>
                </Pressable>
            </Modal>

            {/* Delete Confirmation ActionSheet */}
            <ActionSheet
                visible={showDeleteConfirm}
                title="Delete Reminder"
                message={`Are you sure you want to delete "${title}"?`}
                actions={[
                    {
                        key: "delete",
                        label: "Delete",
                        icon: "trash-2",
                        variant: "destructive",
                        onPress: () => {
                            setShowDeleteConfirm(false);
                            executeDelete();
                        },
                    },
                    {
                        key: "cancel",
                        label: "Cancel",
                        variant: "cancel",
                        onPress: () => setShowDeleteConfirm(false),
                    },
                ]}
                onDismiss={() => setShowDeleteConfirm(false)}
            />
        </View>
    );
}

const styles = StyleSheet.create({
    sheetContainer: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: "transparent",
    },
    sheetBackground: {
        backgroundColor: colors.background,
        borderTopLeftRadius: borderRadius.sheet,
        borderTopRightRadius: borderRadius.sheet,
    },
    handleIndicator: {
        backgroundColor: "#e0e0e0",
        width: 36,
    },
    content: {
        paddingHorizontal: 20,
        paddingBottom: 22,
    },

    // Title card
    titleCard: {
        flexDirection: "row",
        alignItems: "center",
        backgroundColor: colors.card,
        borderRadius: borderRadius.lg,
        paddingHorizontal: 16,
        paddingVertical: 6,
        marginTop: 14,
        gap: 12,
        ...shadows.card,
    },
    titleInput: {
        flex: 1,
        fontFamily: FONT_DISPLAY,
        fontSize: scaleFontSize(20),
        color: colors.textHeading,
        paddingVertical: 12,
    },
    emojiChip: {
        width: 44,
        height: 44,
        borderRadius: borderRadius.full,
        alignItems: "center",
        justifyContent: "center",
    },
    emojiChipText: {
        fontSize: scaleFontSize(22),
    },

    // Grouped rows card
    rowCard: {
        backgroundColor: colors.card,
        borderRadius: borderRadius.lg,
        marginTop: 16,
        paddingHorizontal: 16,
        ...shadows.card,
    },
    separator: {
        height: StyleSheet.hairlineWidth,
        backgroundColor: colors.border,
        marginLeft: 36,
    },
    row: {
        paddingVertical: 16,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
    },
    rowLeft: {
        flexDirection: "row",
        alignItems: "center",
        gap: 16,
    },
    rowLeftText: {
        flex: 1,
        gap: 2,
    },
    rowLabel: {
        fontSize: scaleFontSize(15),
        fontWeight: "500",
        color: colors.textPrimary,
    },
    rowSubLabel: {
        fontSize: scaleFontSize(12),
        color: colors.textSecondary,
        marginLeft: 36,
    },
    valuePill: {
        backgroundColor: colors.surfaceAlt,
        borderRadius: borderRadius.full,
        paddingHorizontal: 12,
        paddingVertical: 6,
    },
    valueText: {
        fontSize: scaleFontSize(13),
        fontWeight: "500",
        color: colors.textSecondary,
    },
    daysPicker: {
        paddingLeft: 36,
        paddingBottom: 12,
        paddingTop: 4,
    },

    // Voice note
    playCircle: {
        width: 32,
        height: 32,
        borderRadius: borderRadius.full,
        backgroundColor: colors.accent,
        alignItems: "center",
        justifyContent: "center",
    },

    // Bottom actions
    bottomActions: {
        marginTop: 28,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
    },
    deleteCircle: {
        width: 52,
        height: 52,
        borderRadius: borderRadius.full,
        backgroundColor: colors.card,
        alignItems: "center",
        justifyContent: "center",
        ...shadows.card,
    },
    doneButton: {
        flex: 1,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
        backgroundColor: colors.accent,
        borderRadius: borderRadius.full,
        paddingVertical: 15,
    },
    doneButtonText: {
        fontSize: scaleFontSize(16),
        fontWeight: "700",
        color: "white",
    },

    // Emoji picker
    emojiOverlay: {
        flex: 1,
        backgroundColor: colors.overlay,
        justifyContent: "center",
        paddingHorizontal: 24,
    },
    emojiSheet: {
        backgroundColor: colors.card,
        borderRadius: borderRadius.card,
        padding: 20,
    },
    emojiSheetTitle: {
        fontSize: scaleFontSize(16),
        fontWeight: "700",
        color: colors.textPrimary,
        marginBottom: 14,
    },
    emojiGrid: {
        flexDirection: "row",
        flexWrap: "wrap",
        gap: 6,
        justifyContent: "center",
    },
    emojiCell: {
        width: 44,
        height: 44,
        borderRadius: borderRadius.md,
        alignItems: "center",
        justifyContent: "center",
    },
    emojiCellText: {
        fontSize: scaleFontSize(22),
    },
    emojiRemoveButton: {
        marginTop: 14,
        alignSelf: "center",
        paddingVertical: 8,
        paddingHorizontal: 16,
    },
    emojiRemoveText: {
        fontSize: scaleFontSize(14),
        fontWeight: "600",
        color: colors.destructive,
    },
});
