import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
    Alert,
    InteractionManager,
    StyleSheet,
    Text,
    TextInput,
    View,
} from "react-native";
import ActionSheet, { ActionSheetAction } from "./ActionSheet";
import * as FileSystem from "expo-file-system/legacy";
import { useAction, useMutation } from "convex/react";
import { useToast } from "./ToastProvider";
import { LinearGradient } from "expo-linear-gradient";
import { TimerPickerModal } from "react-native-timer-picker";
import Slider from "@react-native-community/slider";
import { previewAudioService } from "../lib/AudioService";
import BottomSheet, {
    BottomSheetScrollView,
    BottomSheetBackdrop,
    TouchableOpacity,
    BottomSheetView,
} from "@gorhom/bottom-sheet";
import { api } from "../convex/_generated/api";
import AppIcon from "./AppIcon";
import DaySelector from "./DaySelector";
import RepeatTaskModal from "./RepeatTaskModal";
import { cancelReminder, deleteReminderWithAudio, scheduleReminder } from "../lib/notifications";
import { createTraceId, perfLog } from "../lib/perf";
import { DEFAULT_ALARM_SETTINGS, VolumeStyle } from "../lib/storage";
import { INTERVAL_MAX_MS, INTERVAL_MIN_MS, useReminderStore, Reminder } from "../lib/store";
import { colors, scaleFontSize } from "../lib/theme";
import { formatIntervalDuration } from "../lib/time";

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

const SettingsRow = React.memo(function SettingsRow({ icon, label, value, isAction, onPress }: SettingsRowProps) {
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
    const [reminder, setReminder] = useState<Reminder>(initialReminder);
    const [title, setTitle] = useState(initialReminder.title || "");
    const [description, setDescription] = useState(initialReminder.description || "");

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
    const [selectedDate, setSelectedDate] = useState<Date | null>(() => {
        if (initialReminder.date) {
            const [year, month, day] = initialReminder.date.split("-").map(Number);
            return new Date(year, month - 1, day);
        }
        return null;
    });
    const [showDatePicker, setShowDatePicker] = useState(false);

    const [snoozeEnabled, setSnoozeEnabled] = useState(initialReminder.snoozeEnabled ?? DEFAULT_ALARM_SETTINGS.snoozeEnabled);
    const [snoozeDuration, setSnoozeDuration] = useState(initialReminder.snoozeDuration ?? DEFAULT_ALARM_SETTINGS.snoozeDuration);
    const [volume, setVolume] = useState(initialReminder.volume ?? DEFAULT_ALARM_SETTINGS.volume);
    const [sliderVolume, setSliderVolume] = useState(initialReminder.volume ?? DEFAULT_ALARM_SETTINGS.volume); // Local state for smooth dragging
    const [volumeStyle, setVolumeStyle] = useState<VolumeStyle>(initialReminder.volumeStyle ?? DEFAULT_ALARM_SETTINGS.volumeStyle);

    const [showTimePicker, setShowTimePicker] = useState(false);
    const [showDaysPicker, setShowDaysPicker] = useState(false);
    const [showRepeatTaskModal, setShowRepeatTaskModal] = useState(false);
    const [showOptionsSheet, setShowOptionsSheet] = useState(false);
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);


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
    const [soundText, setSoundText] = useState(initialReminder.description || "");
    const [isRegenerating, setIsRegenerating] = useState(false);
    const regenerateAudio = useAction(api.actions.regenerateReminderAudio);
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

    const hasChanges = useCallback(() => {
        const timeStr = `${time.getHours().toString().padStart(2, "0")}:${time
            .getMinutes()
            .toString()
            .padStart(2, "0")}`;
        const currentDays = [...days].sort().join(",");
        const originalDays = [...(initialReminder.days || [])].sort().join(",");

        // Format current date to compare with original
        const currentDateStr = selectedDate
            ? `${selectedDate.getFullYear()}-${String(selectedDate.getMonth() + 1).padStart(2, "0")}-${String(selectedDate.getDate()).padStart(2, "0")}`
            : undefined;

        return (
            title !== initialReminder.title ||
            description !== initialReminder.description ||
            timeStr !== initialReminder.time ||
            frequency !== initialReminder.frequency ||
            currentDays !== originalDays ||
            currentDateStr !== initialReminder.date ||
            (initialReminder.snoozeEnabled ?? DEFAULT_ALARM_SETTINGS.snoozeEnabled) !== snoozeEnabled ||
            (initialReminder.snoozeDuration ?? DEFAULT_ALARM_SETTINGS.snoozeDuration) !== snoozeDuration ||
            (initialReminder.volume ?? DEFAULT_ALARM_SETTINGS.volume) !== volume ||
            (initialReminder.volumeStyle ?? DEFAULT_ALARM_SETTINGS.volumeStyle) !== volumeStyle ||
            (initialReminder.intervalMs ?? undefined) !== (intervalMs ?? undefined) ||
            (initialReminder.anchorAt ?? undefined) !== (anchorAt ?? undefined)
        );
    }, [days, frequency, initialReminder, time, title, description, selectedDate, snoozeEnabled, snoozeDuration, volume, volumeStyle, intervalMs, anchorAt]);

    const frequencyLabel = useMemo(() => {
        if (frequency === "interval" && intervalMs) {
            return formatIntervalDuration(intervalMs);
        }
        return FREQUENCIES.find((f) => f.value === frequency)?.label ?? "Once";
    }, [frequency, intervalMs]);

    const daysLabel = useMemo(() => {
        if (frequency !== "custom") return "";
        if (!days.length) return "Select";
        const ordered = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
        const normalized = days.map((d) => d.toLowerCase());
        const picked = ordered.filter((d) => normalized.includes(d));
        return picked.map((d) => d.charAt(0).toUpperCase() + d.slice(1, 3)).join(", ");
    }, [days, frequency]);

    const handlePlayPreview = async () => {
        console.log("[VR] ========== PREVIEW PLAYBACK ==========");
        console.log("[VR] audioUrl:", reminder?.audioUrl);
        console.log("[VR] sliderVolume (target):", sliderVolume);
        console.log("[VR] isPlaying:", isPlaying);

        if (!reminder?.audioUrl) {
            console.log("[VR] No audio URL, returning");
            return;
        }

        // If currently playing, stop
        if (isPlaying) {
            console.log("[VR] Stopping playback");
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
                console.log("[VR] Using local file for preview:", localPath);
            }
        } catch (e) {
            console.log("[VR] Could not check local file, using remote URL");
        }

        // Play using AudioService with MUSIC stream for preview
        const success = await previewAudioService.play(
            audioPath,
            {
                volume: sliderVolume,
                streamType: "music", // Preview uses MUSIC stream
                loop: false,
            },
            () => {
                // Called when playback ends
                setIsPlaying(false);
            }
        );

        setIsPlaying(success);
        if (success) {
            console.log("[VR] ✅ Preview playback started via AudioService");
        } else {
            console.log("[VR] ❌ Failed to start preview");
        }
    };

    const handleRegenerate = async () => {
        if (!reminder?.convexId || !soundText.trim()) {
            Alert.alert("Error", "Please enter text for the voice reminder");
            return;
        }

        setIsRegenerating(true);
        try {
            const result = await regenerateAudio({
                reminderId: reminder.convexId as any,
                soundText: soundText.trim(),
            });

            if (result.audioUrl) {
                // Stop any playing audio and clear stale state
                await previewAudioService.stop();
                setIsPlaying(false);

                const updatedReminder = { ...reminder, audioUrl: result.audioUrl, description: soundText.trim() };
                setReminder(updatedReminder);
                setDescription(soundText.trim());

                await storeUpdateReminder(updatedReminder);

                const timeStr = `${time.getHours().toString().padStart(2, "0")}:${time
                    .getMinutes()
                    .toString()
                    .padStart(2, "0")}`;

                await cancelReminder(reminder.id);
                await scheduleReminder({
                    id: reminder.id,
                    title: reminder.title,
                    description: soundText.trim(),
                    time: timeStr,
                    frequency,
                    days: frequency === "custom" ? days : [],
                    audioUrl: result.audioUrl,
                    snoozeEnabled,
                    snoozeDuration,
                    volume,
                    volumeStyle,

                    intervalMs: frequency === "interval" ? intervalMs : undefined,
                    anchorAt: frequency === "interval" ? anchorAt : undefined,
                });

                toast.show({ title: "Sound regenerated", message: "New voice reminder ready", type: "success" });
            }
        } catch (error) {
            console.error("[VR] Regeneration error:", error);
            Alert.alert("Error", "Failed to regenerate voice. Please try again.");
        } finally {
            setIsRegenerating(false);
        }
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
            } else {
                setFrequency(data.frequency === "weekly" ? "custom" : data.frequency);
                if (data.days) setDays(data.days);
                setIntervalMs(undefined);
                setAnchorAt(undefined);
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

        const updatedReminder: Reminder = {
            ...reminder,
            title: title.trim(),
            description,
            time: timeStr,
            date: frequency === "once" ? dateStr : undefined,
            frequency,
            days: frequency === "custom" ? days : [],
            snoozeEnabled,
            snoozeDuration,
            volume,
            volumeStyle,

            intervalMs: frequency === "interval" ? intervalMs : undefined,
            anchorAt: frequency === "interval" ? anchorAt : undefined,
            schemaVersion: 2,
        };

        try {
            // Update via Zustand store (handles state + persistence)
            await storeUpdateReminder(updatedReminder);
            onSave(updatedReminder);
            onClose();

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
                            date: dateStr,
                            frequency,
                            days: scheduleDays,
                            audioUrl,
                            snoozeEnabled,
                            snoozeDuration,
                            volume,
                            volumeStyle,

                            intervalMs: frequency === "interval" ? intervalMs : undefined,
                            anchorAt: frequency === "interval" ? anchorAt : undefined,
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
    }, [reminder, title, time, description, frequency, days, selectedDate, storeUpdateReminder, updateConvexReminder, snoozeEnabled, snoozeDuration, volume, volumeStyle, intervalMs, anchorAt, onSave, onClose]);

    const handleDelete = () => {
        setShowDeleteConfirm(true);
    };

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

    const openOptionsMenu = () => {
        setShowOptionsSheet(true);
    };

    const optionsActions = useMemo((): ActionSheetAction[] => {
        const actions: ActionSheetAction[] = [];

        if (hasChanges()) {
            actions.push({
                key: "save",
                label: "Save Changes",
                icon: "check",
                onPress: () => {
                    setShowOptionsSheet(false);
                    handleSave();
                },
            });
        }

        actions.push({
            key: "delete",
            label: "Delete Reminder",
            icon: "trash-2",
            variant: "destructive",
            onPress: () => {
                setShowOptionsSheet(false);
                setShowDeleteConfirm(true);
            },
        });

        actions.push({
            key: "cancel",
            label: "Cancel",
            variant: "cancel",
            onPress: () => setShowOptionsSheet(false),
        });

        return actions;
    }, [hasChanges, handleSave]);


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
                        if (hasChanges()) {
                            handleSave();
                        } else {
                            onClose();
                        }
                    }
                }}
                handleIndicatorStyle={styles.handleIndicator}
                backgroundStyle={styles.sheetBackground}
                // Less restrictive offset to allow slider while still enabling scroll
                activeOffsetY={[-15, 15]}
            >
                <BottomSheetScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>

                    <TextInput
                        style={styles.titleInput}
                        value={title}
                        onChangeText={setTitle}
                        onFocus={expandSheet}
                        placeholder="Reminder"
                        placeholderTextColor={stylesVars.mutedText}
                        maxLength={100}
                    />



                    <View style={styles.soundSection}>
                        <TouchableOpacity
                            style={styles.soundSectionHeader}
                            onPress={reminder.audioUrl ? handlePlayPreview : undefined}
                            activeOpacity={reminder.audioUrl ? 0.7 : 1}
                            disabled={!reminder.audioUrl}
                        >
                            <AppIcon name={isPlaying ? "square" : "play"} size={20} color={reminder.audioUrl ? colors.accent : stylesVars.iconColor} />
                            <Text style={[styles.soundSectionTitle, reminder.audioUrl && { color: colors.accent }]}>
                                {isPlaying ? "Stop reminder" : "Play reminder"}
                            </Text>
                        </TouchableOpacity>
                        <TextInput
                            style={styles.soundTextInput}
                            value={soundText}
                            onChangeText={setSoundText}
                            onFocus={expandSheet}
                            placeholder="What the reminder will say..."
                            placeholderTextColor={stylesVars.mutedText}
                            multiline
                            numberOfLines={2}
                            textAlignVertical="top"
                            maxLength={250}
                        />
                        <TouchableOpacity
                            style={[styles.regenerateButton, isRegenerating && styles.regenerateButtonDisabled]}
                            onPress={handleRegenerate}
                            disabled={isRegenerating}
                            activeOpacity={0.8}
                        >
                            <AppIcon name="refresh-cw" size={18} color="white" />
                            <Text style={styles.regenerateButtonText}>
                                {isRegenerating ? "Regenerating..." : "Regenerate Reminder"}
                            </Text>
                        </TouchableOpacity>
                    </View>

                    <View style={styles.rowList}>
                        <SettingsRow
                            icon="clock"
                            label="Time"
                            value={formatTime(time).toLowerCase()}
                            onPress={() => setShowTimePicker(true)}
                        />

                        {/* Date picker for "once" frequency */}
                        {frequency === "once" && (
                            <>
                                <SettingsRow
                                    icon="calendar"
                                    label="Date"
                                    value={dateLabel}
                                    onPress={() => setShowDatePicker((v) => !v)}
                                />
                                {showDatePicker && (
                                    <View style={styles.datePickerInline}>
                                        <View style={styles.dateChipsRow}>
                                            <TouchableOpacity
                                                style={[
                                                    styles.dateChip,
                                                    dateLabel === "Today" && styles.dateChipSelected,
                                                ]}
                                                onPress={() => {
                                                    const today = new Date();
                                                    today.setHours(0, 0, 0, 0);
                                                    setSelectedDate(today);
                                                }}
                                            >
                                                <Text style={[
                                                    styles.dateChipText,
                                                    dateLabel === "Today" && styles.dateChipTextSelected,
                                                ]}>Today</Text>
                                            </TouchableOpacity>
                                            <TouchableOpacity
                                                style={[
                                                    styles.dateChip,
                                                    dateLabel === "Tomorrow" && styles.dateChipSelected,
                                                ]}
                                                onPress={() => {
                                                    const tomorrow = new Date();
                                                    tomorrow.setDate(tomorrow.getDate() + 1);
                                                    tomorrow.setHours(0, 0, 0, 0);
                                                    setSelectedDate(tomorrow);
                                                }}
                                            >
                                                <Text style={[
                                                    styles.dateChipText,
                                                    dateLabel === "Tomorrow" && styles.dateChipTextSelected,
                                                ]}>Tomorrow</Text>
                                            </TouchableOpacity>
                                            <TouchableOpacity
                                                style={styles.dateChip}
                                                onPress={() => {
                                                    const nextWeek = new Date();
                                                    nextWeek.setDate(nextWeek.getDate() + 7);
                                                    nextWeek.setHours(0, 0, 0, 0);
                                                    setSelectedDate(nextWeek);
                                                }}
                                            >
                                                <Text style={styles.dateChipText}>Next Week</Text>
                                            </TouchableOpacity>
                                        </View>
                                        {/* Simple calendar grid - current month */}
                                        <View style={styles.miniCalendar}>
                                            <View style={styles.miniCalendarHeader}>
                                                <TouchableOpacity
                                                    onPress={() => {
                                                        const prev = selectedDate ? new Date(selectedDate) : new Date();
                                                        prev.setMonth(prev.getMonth() - 1);
                                                        setSelectedDate(prev);
                                                    }}
                                                    style={styles.miniCalendarNav}
                                                >
                                                    <AppIcon name="chevron-left" size={18} color={stylesVars.iconColor} />
                                                </TouchableOpacity>
                                                <Text style={styles.miniCalendarTitle}>
                                                    {(selectedDate || new Date()).toLocaleDateString("default", { month: "long", year: "numeric" })}
                                                </Text>
                                                <TouchableOpacity
                                                    onPress={() => {
                                                        const next = selectedDate ? new Date(selectedDate) : new Date();
                                                        next.setMonth(next.getMonth() + 1);
                                                        setSelectedDate(next);
                                                    }}
                                                    style={styles.miniCalendarNav}
                                                >
                                                    <AppIcon name="chevron-right" size={18} color={stylesVars.iconColor} />
                                                </TouchableOpacity>
                                            </View>
                                            <View style={styles.miniCalendarDays}>
                                                {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => (
                                                    <Text key={i} style={styles.miniCalendarDayHeader}>{d}</Text>
                                                ))}
                                            </View>
                                            <View style={styles.miniCalendarGrid}>
                                                {(() => {
                                                    const viewDate = selectedDate || new Date();
                                                    const year = viewDate.getFullYear();
                                                    const month = viewDate.getMonth();
                                                    const firstDay = new Date(year, month, 1);
                                                    const lastDay = new Date(year, month + 1, 0);
                                                    const startDayOfWeek = firstDay.getDay();
                                                    const daysInMonth = lastDay.getDate();

                                                    const cells = [];
                                                    // Empty cells before first day
                                                    for (let i = 0; i < startDayOfWeek; i++) {
                                                        cells.push(<View key={`empty-${i}`} style={styles.miniCalendarCell} />);
                                                    }
                                                    // Day cells
                                                    for (let day = 1; day <= daysInMonth; day++) {
                                                        const cellDate = new Date(year, month, day);
                                                        const isSelected = selectedDate &&
                                                            cellDate.getDate() === selectedDate.getDate() &&
                                                            cellDate.getMonth() === selectedDate.getMonth() &&
                                                            cellDate.getFullYear() === selectedDate.getFullYear();
                                                        const isToday = new Date().toDateString() === cellDate.toDateString();

                                                        cells.push(
                                                            <TouchableOpacity
                                                                key={day}
                                                                style={[
                                                                    styles.miniCalendarCell,
                                                                    isSelected && styles.miniCalendarCellSelected,
                                                                ]}
                                                                onPress={() => {
                                                                    setSelectedDate(new Date(year, month, day));
                                                                }}
                                                            >
                                                                <Text style={[
                                                                    styles.miniCalendarCellText,
                                                                    isToday && !isSelected && styles.miniCalendarCellToday,
                                                                    isSelected && styles.miniCalendarCellTextSelected,
                                                                ]}>
                                                                    {day}
                                                                </Text>
                                                            </TouchableOpacity>
                                                        );
                                                    }
                                                    return cells;
                                                })()}
                                            </View>
                                        </View>
                                    </View>
                                )}
                            </>
                        )}

                        <SettingsRow icon="refresh-cw" label="Repeat" value={frequencyLabel} onPress={openFrequencyPicker} />

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
                            icon="clock"
                            label="Snooze"
                            value={snoozeEnabled ? "On" : "Off"}
                            onPress={() => setSnoozeEnabled((v) => !v)}
                        />

                        <View style={styles.stepperRow}>
                            <View style={styles.rowLeft}>
                                <AppIcon name="clock" size={22} color={stylesVars.iconColor} />
                                <Text style={styles.rowLabel}>Snooze minutes</Text>
                            </View>
                            <View style={styles.stepperRight}>
                                <TouchableOpacity
                                    style={styles.stepperButton}
                                    onPress={() => setSnoozeDuration((v) => Math.max(1, v - 1))}
                                    disabled={!snoozeEnabled}
                                    activeOpacity={0.7}
                                >
                                    <Text style={[styles.stepperButtonText, !snoozeEnabled && styles.stepperDisabled]}>-</Text>
                                </TouchableOpacity>
                                <View style={[styles.valuePill, !snoozeEnabled && styles.stepperPillDisabled]}>
                                    <Text style={styles.valueText}>{snoozeDuration} min</Text>
                                </View>
                                <TouchableOpacity
                                    style={styles.stepperButton}
                                    onPress={() => setSnoozeDuration((v) => Math.min(60, v + 1))}
                                    disabled={!snoozeEnabled}
                                    activeOpacity={0.7}
                                >
                                    <Text style={[styles.stepperButtonText, !snoozeEnabled && styles.stepperDisabled]}>+</Text>
                                </TouchableOpacity>
                            </View>
                        </View>

                        <View style={styles.sliderSection}>
                            <View style={styles.sliderLabelRow}>
                                <AppIcon name="volume-1" size={22} color={stylesVars.iconColor} />
                                <Text style={styles.rowLabel}>Volume</Text>
                            </View>
                            <View style={styles.sliderTrackRow} pointerEvents="box-none">
                                <Slider
                                    style={styles.slider}
                                    value={sliderVolume}
                                    minimumValue={0}
                                    maximumValue={1}
                                    step={0.05}
                                    onValueChange={setSliderVolume}
                                    onSlidingComplete={(val) => {
                                        setSliderVolume(val);
                                        setVolume(val);
                                    }}
                                    minimumTrackTintColor={colors.accent}
                                    maximumTrackTintColor={stylesVars.chipBg}
                                    thumbTintColor={colors.accent}
                                />
                            </View>
                        </View>
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

                    {showRepeatTaskModal && (
                        <RepeatTaskModal
                            visible={showRepeatTaskModal}
                            initialRepeatEnabled={frequency !== "once"}
                            initialFrequency={
                                frequency === "interval"
                                    ? ((intervalMs && intervalMs % (60 * 60 * 1000) !== 0) ? "minute" : "hour")
                                    : (frequency === "custom"
                                        ? "weekly"
                                        : (frequency === "once" || frequency === "daily" ? "daily" : "daily"))
                            }
                            initialInterval={
                                frequency === "interval" && intervalMs
                                    ? (
                                        intervalMs % (60 * 60 * 1000) !== 0
                                            ? Math.max(15, Math.round(intervalMs / (60 * 1000)))
                                            : Math.max(1, Math.round(intervalMs / (60 * 60 * 1000)))
                                    )
                                    : 1
                            }
                            initialDays={days}
                            onCancel={() => setShowRepeatTaskModal(false)}
                            onConfirm={handleRepeatConfirm}
                        />
                    )}

                    <View style={{ height: 40 }} />
                </BottomSheetScrollView>
            </BottomSheet>

            {/* Options Menu ActionSheet */}
            <ActionSheet
                visible={showOptionsSheet}
                title="Options"
                actions={optionsActions}
                onDismiss={() => setShowOptionsSheet(false)}
            />

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
        ...StyleSheet.absoluteFillObject,
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
    content: {
        paddingHorizontal: 20,
        paddingBottom: 22,
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
    playButton: {
        flexDirection: "row",
        alignItems: "center",
        gap: 4,
        marginLeft: "auto",
        paddingHorizontal: 12,
        paddingVertical: 6,
        backgroundColor: colors.accent + "15",
        borderRadius: 16,
    },
    playButtonText: {
        fontSize: scaleFontSize(13),
        fontWeight: "600",
        color: colors.accent,
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
    stepperRow: {
        paddingVertical: 14,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
    },
    stepperRight: {
        flexDirection: "row",
        alignItems: "center",
        gap: 10,
    },
    stepperButton: {
        width: 34,
        height: 34,
        borderRadius: 12,
        backgroundColor: stylesVars.chipBg,
        alignItems: "center",
        justifyContent: "center",
    },
    stepperButtonText: {
        fontSize: scaleFontSize(18),
        fontWeight: "700",
        color: stylesVars.headerText,
    },
    stepperDisabled: {
        color: stylesVars.mutedText,
    },
    stepperPillDisabled: {
        opacity: 0.6,
    },
    sliderSection: {
        paddingVertical: 14,
    },
    sliderLabelRow: {
        flexDirection: "row",
        alignItems: "center",
        gap: 16,
    },
    sliderTrackRow: {
        marginTop: 10,
        flexDirection: "row",
        alignItems: "center",
    },
    volumeValue: {
        marginLeft: "auto",
        fontSize: scaleFontSize(14),
        fontWeight: "500",
        color: stylesVars.chipText,
    },
    slider: {
        flex: 1,
        height: 40,
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
    soundSection: {
        marginTop: 24,
        paddingTop: 20,
        borderTopWidth: 1,
        borderTopColor: stylesVars.chipBg,
    },
    soundSectionHeader: {
        flexDirection: "row",
        alignItems: "center",
        gap: 10,
        marginBottom: 12,
    },
    soundSectionTitle: {
        fontSize: scaleFontSize(15),
        fontWeight: "600",
        color: stylesVars.labelText,
    },
    soundTextInput: {
        backgroundColor: stylesVars.chipBg,
        borderRadius: 12,
        padding: 14,
        fontSize: scaleFontSize(14),
        color: stylesVars.headerText,
        minHeight: 80,
    },
    regenerateButton: {
        marginTop: 14,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
        backgroundColor: colors.accent,
        borderRadius: 12,
        paddingVertical: 14,
    },
    regenerateButtonDisabled: {
        opacity: 0.6,
    },
    regenerateButtonText: {
        fontSize: scaleFontSize(15),
        fontWeight: "600",
        color: "white",
    },
    // Date picker styles
    datePickerInline: {
        paddingLeft: 38,
        paddingBottom: 12,
        paddingTop: 4,
    },
    dateChipsRow: {
        flexDirection: "row",
        flexWrap: "wrap",
        gap: 8,
        marginBottom: 16,
    },
    dateChip: {
        backgroundColor: stylesVars.chipBg,
        borderRadius: 16,
        paddingHorizontal: 14,
        paddingVertical: 8,
        borderWidth: 1,
        borderColor: "transparent",
    },
    dateChipSelected: {
        backgroundColor: colors.accent + "20",
        borderColor: colors.accent,
    },
    dateChipText: {
        fontSize: scaleFontSize(13),
        fontWeight: "500",
        color: stylesVars.chipText,
    },
    dateChipTextSelected: {
        color: colors.accent,
    },
    miniCalendar: {
        backgroundColor: stylesVars.chipBg,
        borderRadius: 12,
        padding: 12,
    },
    miniCalendarHeader: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        marginBottom: 12,
    },
    miniCalendarNav: {
        padding: 6,
    },
    miniCalendarTitle: {
        fontSize: scaleFontSize(14),
        fontWeight: "600",
        color: stylesVars.headerText,
    },
    miniCalendarDays: {
        flexDirection: "row",
        justifyContent: "space-around",
        marginBottom: 8,
    },
    miniCalendarDayHeader: {
        width: "14.28%",
        textAlign: "center",
        fontSize: scaleFontSize(11),
        fontWeight: "500",
        color: stylesVars.mutedText,
    },
    miniCalendarGrid: {
        flexDirection: "row",
        flexWrap: "wrap",
    },
    miniCalendarCell: {
        width: "14.28%",
        aspectRatio: 1,
        justifyContent: "center",
        alignItems: "center",
    },
    miniCalendarCellSelected: {
        backgroundColor: colors.accent,
        borderRadius: 100,
    },
    miniCalendarCellText: {
        fontSize: scaleFontSize(13),
        color: stylesVars.labelText,
    },
    miniCalendarCellToday: {
        color: colors.accent,
        fontWeight: "600",
    },
    miniCalendarCellTextSelected: {
        color: "white",
        fontWeight: "600",
    },
});
