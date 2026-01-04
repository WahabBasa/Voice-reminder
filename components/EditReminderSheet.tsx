import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
    Alert,
    InteractionManager,
    Platform,
    StyleSheet,
    Text,
    TextInput,
    View,
} from "react-native";
import { NativeViewGestureHandler } from "react-native-gesture-handler";
import { useAction, useMutation } from "convex/react";
import { useToast } from "./ToastProvider";
import { LinearGradient } from "expo-linear-gradient";
import { Audio } from "expo-av";
import { TimerPickerModal } from "react-native-timer-picker";
import Slider from "@react-native-community/slider";
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
import {
    DEFAULT_ALARM_SETTINGS,
    deleteReminder as deleteReminderStorage,
    Reminder,
    VolumeStyle,
    updateReminder as updateReminderStorage,
} from "../lib/storage";
import { colors, scaleFontSize } from "../lib/theme";

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

    const [snoozeEnabled, setSnoozeEnabled] = useState(initialReminder.snoozeEnabled ?? DEFAULT_ALARM_SETTINGS.snoozeEnabled);
    const [snoozeDuration, setSnoozeDuration] = useState(initialReminder.snoozeDuration ?? DEFAULT_ALARM_SETTINGS.snoozeDuration);
    const [volume, setVolume] = useState(initialReminder.volume ?? DEFAULT_ALARM_SETTINGS.volume);
    const [sliderVolume, setSliderVolume] = useState(initialReminder.volume ?? DEFAULT_ALARM_SETTINGS.volume); // Local state for smooth dragging
    const [volumeStyle, setVolumeStyle] = useState<VolumeStyle>(initialReminder.volumeStyle ?? DEFAULT_ALARM_SETTINGS.volumeStyle);

    const [showTimePicker, setShowTimePicker] = useState(false);
    const [showDaysPicker, setShowDaysPicker] = useState(false);
    const [showRepeatTaskModal, setShowRepeatTaskModal] = useState(false);
    const [sound, setSound] = useState<Audio.Sound | null>(null);
    const [isPlaying, setIsPlaying] = useState(false);
    const [soundText, setSoundText] = useState(initialReminder.description || "");
    const [isRegenerating, setIsRegenerating] = useState(false);
    const regenerateAudio = useAction(api.actions.regenerateReminderAudio);
    const toast = useToast();

    // Preload audio in background
    useEffect(() => {
        perfLog(traceId, "overlay.edit", "sheet_mount", { t: Date.now(), reminderId: initialReminder.id });

        if (initialReminder.audioUrl) {
            setTimeout(async () => {
                try {
                    perfLog(traceId, "overlay.edit", "audio_preload_start", { t: Date.now() });
                    const { sound: preloadedSound } = await Audio.Sound.createAsync(
                        { uri: initialReminder.audioUrl! },
                        { volume: 0.9, shouldPlay: false }
                    );
                    setSound(preloadedSound);
                    perfLog(traceId, "overlay.edit", "audio_preload_done", { t: Date.now() });
                } catch (e) {
                    console.log("[VR] Failed to preload audio:", e);
                }
            }, 100);
        }

        return () => {
            perfLog(traceId, "overlay.edit", "sheet_unmount", { t: Date.now() });
        };
    }, [initialReminder.audioUrl, initialReminder.id, traceId]);

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
        const timeStr = `${time.getHours().toString().padStart(2, "0")}:${time
            .getMinutes()
            .toString()
            .padStart(2, "0")}`;
        const currentDays = [...days].sort().join(",");
        const originalDays = [...(initialReminder.days || [])].sort().join(",");

        return (
            title !== initialReminder.title ||
            description !== initialReminder.description ||
            timeStr !== initialReminder.time ||
            frequency !== initialReminder.frequency ||
            currentDays !== originalDays ||
            (initialReminder.snoozeEnabled ?? DEFAULT_ALARM_SETTINGS.snoozeEnabled) !== snoozeEnabled ||
            (initialReminder.snoozeDuration ?? DEFAULT_ALARM_SETTINGS.snoozeDuration) !== snoozeDuration ||
            (initialReminder.volume ?? DEFAULT_ALARM_SETTINGS.volume) !== volume ||
            (initialReminder.volumeStyle ?? DEFAULT_ALARM_SETTINGS.volumeStyle) !== volumeStyle
        );
    }, [days, frequency, initialReminder, time, title, description, snoozeEnabled, snoozeDuration, volume, volumeStyle]);

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

    const handlePlayPreview = async () => {
        if (!reminder?.audioUrl) return;

        try {
            if (isPlaying && sound) {
                await sound.stopAsync();
                setIsPlaying(false);
                return;
            }

            if (sound) {
                await sound.setPositionAsync(0);
                sound.setOnPlaybackStatusUpdate((status) => {
                    if (status.isLoaded && status.didJustFinish) {
                        setIsPlaying(false);
                    }
                });
                await sound.playAsync();
                setIsPlaying(true);
                return;
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
                const updatedReminder = { ...reminder, audioUrl: result.audioUrl, description: soundText.trim() };
                setReminder(updatedReminder);
                setDescription(soundText.trim());

                await updateReminderStorage(updatedReminder);

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
        } else {
            setFrequency(data.frequency === "weekly" ? "custom" : data.frequency);
            if (data.days) setDays(data.days);
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

        const updatedReminder: Reminder = {
            ...reminder,
            title: title.trim(),
            description,
            time: timeStr,
            frequency,
            days: frequency === "custom" ? days : [],
            snoozeEnabled,
            snoozeDuration,
            volume,
            volumeStyle,
        };

        try {
            await updateReminderStorage(updatedReminder);
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
                            frequency,
                            days: scheduleDays,
                            audioUrl,
                            snoozeEnabled,
                            snoozeDuration,
                            volume,
                            volumeStyle,
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
    }, [reminder, title, time, description, frequency, days, updateConvexReminder, snoozeEnabled, snoozeDuration, volume, volumeStyle, onSave, onClose]);

    const handleDelete = () => {
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
                },
            },
        ]);
    };

    const openOptionsMenu = () => {
        const options: Array<{ text: string; style?: "cancel" | "destructive"; onPress?: () => void }> = [
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
                // Allow horizontal gestures (slider) to work by requiring more vertical movement
                activeOffsetY={[-10, 10]}
                failOffsetX={[-5, 5]}
            >
                <BottomSheetScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>

                    <TextInput
                        style={styles.titleInput}
                        value={title}
                        onChangeText={setTitle}
                        onFocus={expandSheet}
                        placeholder="Reminder"
                        placeholderTextColor={stylesVars.mutedText}
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
                            <View style={styles.sliderTrackRow}>
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

                        <SettingsRow
                            icon="zap"
                            label="Volume style"
                            value={volumeStyle === "progressive" ? "Progressive" : "Standard"}
                            onPress={() => setVolumeStyle((v) => (v === "progressive" ? "standard" : "progressive"))}
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

                    {showRepeatTaskModal && (
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
                    )}

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
});
