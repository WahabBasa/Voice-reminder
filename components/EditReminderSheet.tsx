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
import { useRouter } from "expo-router";
import { useMutation } from "convex/react";
import { useToast } from "./ToastProvider";
import { previewAudioService } from "../lib/AudioService";
import BottomSheet, {
    BottomSheetScrollView,
    BottomSheetBackdrop,
    TouchableOpacity,
} from "@gorhom/bottom-sheet";
import { api } from "../convex/_generated/api";
import AppIcon from "./AppIcon";
import RepeatTaskModal from "./RepeatTaskModal";
import DatePickerModal from "./DatePickerModal";
import TimesEditor from "./TimesEditor";
import {
    describeDraftDays,
    describeDraftTimes,
    draftFromReminder,
    fromDateString,
    saveShapeFromDraft,
    toDateString,
    type ScheduleDraft,
} from "./schedule/scheduleDraft";
import { cancelReminder, deleteReminderWithAudio, openAlarmPermissionSettingsSafe, scheduleReminder } from "../lib/notifications";
import { getDeviceId } from "../lib/deviceId";
import { createTraceId, perfLog } from "../lib/perf";
import { DEFAULT_ALARM_SETTINGS } from "../lib/storage";
import { CURRENT_SCHEMA_VERSION, useReminderStore, Reminder } from "../lib/store";
import { checkCanUsePremiumSchedule, isPremiumSchedule } from "../lib/usageGate";
import { borderRadius, chipColors, colors, scaleFontSize, shadows } from "../lib/theme";
import { FONT_DISPLAY } from "../lib/fonts";

// Tap-to-cycle options
const PRE_REMINDER_VALUES = [0, 5, 10, 15, 30];

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

/** A dated one-off whose day has passed can never ring, so it resets to today. */
function isPastDate(date: string): boolean {
    const parsed = fromDateString(date);
    if (!parsed) return true;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return parsed.getTime() < today.getTime();
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

type EditReminderSheetProps = {
    reminder: Reminder;
    onClose: () => void;
    onSave: (updated: Reminder) => void;
    onDelete: (reminder: Reminder) => void;
};

export default function EditReminderSheet({ reminder: initialReminder, onClose, onSave, onDelete }: EditReminderSheetProps) {
    const traceId = useMemo(() => createTraceId("edit_sheet"), []);
    const router = useRouter();
    const updateConvexReminder = useMutation(api.reminders.update);
    const removeConvexReminder = useMutation(api.reminders.remove);

    // Zustand store actions
    const storeUpdateReminder = useReminderStore((state) => state.updateReminder);
    const storeDeleteReminder = useReminderStore((state) => state.deleteReminder);

    const bottomSheetRef = useRef<BottomSheet>(null);
    const snapPoints = useMemo(() => ["60%", "95%"], []);

    // Live store row, not a mount-time snapshot: audio hydration lands seconds
    // after creation, and a frozen copy would hide the voice note, wipe the
    // audio fields on save, and skip the reschedule (audioUrl reads as "").
    const reminder =
        useReminderStore((state) => state.reminders.find((r) => r.id === initialReminder.id)) ??
        initialReminder;
    const [title, setTitle] = useState(initialReminder.title || "");
    const [emoji, setEmoji] = useState<string | undefined>(initialReminder.emoji);
    const description = initialReminder.description || "";

    // The whole schedule is one draft (components/schedule/scheduleDraft.ts):
    // both axes are always populated, so flipping between "weekly" and "every N
    // days" — or between set times and an interval — never loses the other side.
    const [draft, setDraft] = useState<ScheduleDraft>(() => draftFromReminder(initialReminder));
    const patchDraft = useCallback(
        (patch: Partial<ScheduleDraft>) => setDraft((prev) => ({ ...prev, ...patch })),
        []
    );

    // Interval mode is Pro (OLD-100). Only a switch INTO it is gated: a reminder
    // that already runs on an interval keeps saving whatever the plan says.
    const [startedOnInterval] = useState(() => draft.timesMode === "interval");

    const [showDatePicker, setShowDatePicker] = useState(false);

    const [preReminderMinutes, setPreReminderMinutes] = useState<number>(initialReminder.preReminderMinutes ?? 0);
    const [persistent, setPersistent] = useState<boolean>(initialReminder.persistent ?? false);

    // Volume control was cut from the sheet — values pass through unchanged.
    const volume = initialReminder.volume ?? DEFAULT_ALARM_SETTINGS.volume;
    const volumeStyle = initialReminder.volumeStyle ?? DEFAULT_ALARM_SETTINGS.volumeStyle;

    const [showTimesEditor, setShowTimesEditor] = useState(false);
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

    const selectedDate = useMemo(() => fromDateString(draft.date), [draft.date]);
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

    const repeatLabel = useMemo(() => describeDraftDays(draft), [draft]);
    const timesLabel = useMemo(() => describeDraftTimes(draft), [draft]);

    // Every-N-days counts from an anchor, so its start date is as editable as a
    // one-off's date — same row, different word.
    const showDateRow = draft.daysMode === "date" || draft.daysMode === "everyNDays";

    const preReminderLabel = useMemo(
        () => (preReminderMinutes > 0 ? `${preReminderMinutes} min before` : "None"),
        [preReminderMinutes]
    );

    const cyclePreReminder = useCallback(() => {
        setPreReminderMinutes((current) => {
            const idx = PRE_REMINDER_VALUES.indexOf(current);
            return PRE_REMINDER_VALUES[(idx + 1) % PRE_REMINDER_VALUES.length] ?? 0;
        });
    }, []);

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

    const handleRepeatConfirm = useCallback(
        (value: { mode: ScheduleDraft["daysMode"]; weekdays: string[]; everyNDays: number }) => {
            patchDraft({
                daysMode: value.mode,
                weekdays: value.weekdays,
                everyNDays: value.everyNDays,
                // Switching to a dated one-off with a date already in the past
                // would save a reminder that can never ring.
                date:
                    value.mode === "date" && (!draft.date || isPastDate(draft.date))
                        ? toDateString(new Date())
                        : draft.date,
            });
            setShowRepeatTaskModal(false);
        },
        [draft.date, patchDraft]
    );

    const handleSave = useCallback(async () => {
        if (!title.trim()) {
            Alert.alert("Error", "Please enter a reminder title");
            return;
        }

        // One place turns the draft into a schedule: the grid plus the legacy
        // columns that project out of it (never one without the other).
        const save = saveShapeFromDraft(draft);

        // Turning a reminder into an interval one is a purchase, not an edit.
        // The sheet stays open behind the paywall so the draft survives the trip.
        if (!startedOnInterval && isPremiumSchedule(save.schedule)) {
            const { allowed } = await checkCanUsePremiumSchedule();
            if (!allowed) {
                perfLog(traceId, "overlay.edit", "save_blocked_premium_schedule");
                router.push({ pathname: "/paywall", params: { context: "interval" } });
                return;
            }
        }

        const updatedReminder: Reminder = {
            ...reminder,
            title: title.trim(),
            emoji,
            description,
            time: save.time,
            date: save.date,
            frequency: save.frequency,
            days: save.days,
            schedule: save.schedule,
            preReminderMinutes: preReminderMinutes > 0 ? preReminderMinutes : undefined,
            persistent: persistent || undefined,
            volume,
            volumeStyle,

            intervalMs: save.intervalMs,
            anchorAt: save.anchorAt,
            intervalDays: save.intervalDays,
            schemaVersion: CURRENT_SCHEMA_VERSION,

            // Canonical schedule fields
            scheduleType: save.scheduleType,
            onceAt: save.onceAt,
            rrule: save.rrule,
            dtstart: save.dtstart,
            tzid: save.tzid,
            until: save.until,
        };

        try {
            // Update via Zustand store (handles state + persistence)
            await storeUpdateReminder(updatedReminder);

            const reminderId = reminder.id;
            const convexId = reminder.convexId;
            const audioUrl = reminder.audioUrl;

            // Cancel + reschedule BEFORE closing (onClose unmounts the component)
            if (audioUrl) {
                try {
                    await cancelReminder(reminderId);
                    const { triggerTimestamp } = await scheduleReminder({
                        id: reminderId,
                        title: updatedReminder.title,
                        description,
                        time: save.time,
                        date: save.date,
                        frequency: save.frequency,
                        days: save.days,
                        // Authoritative: the execution layer plans every ring of
                        // the day off this, not off `time` (OLD-98).
                        schedule: save.schedule,
                        audioUrl,
                        preReminderMinutes,
                        preAudioUrl: reminder.preAudioUrl,
                        urgency: reminder.urgency,
                        persistent,
                        volume,
                        volumeStyle,

                        intervalMs: save.intervalMs,
                        anchorAt: save.anchorAt,
                        intervalDays: save.intervalDays,
                        scheduleType: save.scheduleType,
                        onceAt: save.onceAt,
                        rrule: save.rrule,
                        dtstart: save.dtstart,
                        tzid: save.tzid,
                        until: save.until,
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

            // Convex sync can be deferred — it doesn't affect local scheduling.
            // Every schedule field goes back up (OLD-97 widened the mutation):
            // an edit Convex cannot express is one the next sync silently reverts.
            if (convexId) {
                updateConvexReminder({
                    id: convexId as any,
                    deviceId: await getDeviceId(),
                    title: updatedReminder.title,
                    description,
                    time: save.time,
                    date: save.date,
                    frequency: save.frequency,
                    days: save.days,
                    schedule: save.schedule,
                    scheduleType: save.scheduleType,
                    onceAt: save.onceAt,
                    rrule: save.rrule,
                    dtstart: save.dtstart,
                    tzid: save.tzid,
                    until: save.until,
                    intervalMs: save.intervalMs,
                    anchorAt: save.anchorAt,
                    intervalDays: save.intervalDays,
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
    }, [reminder, title, emoji, description, draft, startedOnInterval, router, traceId, storeUpdateReminder, updateConvexReminder, preReminderMinutes, persistent, volume, volumeStyle, onSave, onClose]);

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
                void getDeviceId()
                    .then((deviceId) => removeConvexReminder({ id: convexId as any, deviceId }))
                    .catch((e) => {
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

                    {/* Schedule grid: days axis (Repeat, + Date when it needs one)
                        crossed with times axis (Times, expanding inline). */}
                    <View style={styles.rowCard}>
                        <SheetRow
                            icon="refresh-cw"
                            label="Repeat"
                            value={repeatLabel}
                            onPress={() => setShowRepeatTaskModal(true)}
                        />

                        {showDateRow ? (
                            <>
                                <View style={styles.separator} />
                                <SheetRow
                                    icon="calendar"
                                    label={draft.daysMode === "date" ? "Date" : "Starts"}
                                    value={dateLabel}
                                    onPress={() => setShowDatePicker(true)}
                                />
                            </>
                        ) : null}

                        <View style={styles.separator} />
                        <SheetRow
                            icon="clock"
                            label={draft.timesMode === "clock" && draft.times.length > 1 ? "Times" : "Time"}
                            value={timesLabel}
                            onPress={() => setShowTimesEditor((v) => !v)}
                        />
                        {showTimesEditor ? (
                            <TimesEditor
                                mode={draft.timesMode}
                                times={draft.times}
                                everyMinutes={draft.everyMinutes}
                                windowStart={draft.windowStart}
                                windowEnd={draft.windowEnd}
                                onChange={patchDraft}
                            />
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
                    </View>

                    {/* Voice note card. While TTS is still generating the row stays
                        visible but disabled, so it never just vanishes for the
                        seconds between creation and hydration. */}
                    {reminder.audioUrl || reminder.audioStatus === "pending" ? (
                        <View style={styles.rowCard}>
                            <TouchableOpacity
                                style={styles.row}
                                onPress={handlePlayPreview}
                                activeOpacity={0.7}
                                disabled={!reminder.audioUrl}
                            >
                                <View style={styles.rowLeft}>
                                    <View style={styles.playCircle}>
                                        <AppIcon name={isPlaying ? "square" : "play"} size={16} color="#ffffff" />
                                    </View>
                                    <Text style={styles.rowLabel}>Voice note</Text>
                                </View>
                                <View style={styles.valuePill}>
                                    <Text style={styles.valueText}>
                                        {!reminder.audioUrl ? "Generating…" : isPlaying ? "Playing…" : "Play"}
                                    </Text>
                                </View>
                            </TouchableOpacity>
                        </View>
                    ) : null}

                    {showDatePicker ? (
                        <DatePickerModal
                            visible={showDatePicker}
                            initialDate={selectedDate}
                            dateOnly
                            onCancel={() => setShowDatePicker(false)}
                            onConfirm={({ date }) => {
                                patchDraft({ date: date ? toDateString(date) : null });
                                setShowDatePicker(false);
                            }}
                        />
                    ) : null}

                    {showRepeatTaskModal && (
                        <RepeatTaskModal
                            visible={showRepeatTaskModal}
                            mode={draft.daysMode}
                            weekdays={draft.weekdays}
                            everyNDays={draft.everyNDays}
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
