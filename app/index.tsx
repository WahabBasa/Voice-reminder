import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  ActivityIndicator,
  InteractionManager,
  LayoutAnimation,
  Platform,
  Pressable,
  SectionList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  runOnJS,
  Easing,
  FadeOut,
  SlideOutLeft,
  Layout,
} from "react-native-reanimated";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useFocusEffect } from "@react-navigation/native";
import { useRouter } from "expo-router";
import { useAction } from "convex/react";
import { api } from "../convex/_generated/api";
import { colors, scaleFontSize } from "../lib/theme";
import { formatReminderTime, getDueTimestamp, isOverdue } from "../lib/time";
import { readFileAsBase64 } from "../lib/convex";
import { deleteReminderWithAudio, scheduleReminder } from "../lib/notifications";
import {
  addReminder,
  deleteReminder as deleteReminderStorage,
  getHistory,
  getReminders,
  recordCompletion,
  Reminder,
  ReminderHistory,
} from "../lib/storage";
import RecordingOverlay from "../components/RecordingOverlay";
import SwipeableCard from "../components/SwipeableCard";
import AppIcon from "../components/AppIcon";
import { useToast } from "../components/ToastProvider";
import { perfLog } from "../lib/perf";
import NetInfo from "@react-native-community/netinfo";
import { useMutation } from "convex/react";

type HomeView = "all" | "completed";

function formatCardTimestamp(isoString: string) {
  const date = new Date(isoString);
  const dd = String(date.getDate()).padStart(2, "0");
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const yyyy = String(date.getFullYear());

  const hours24 = date.getHours();
  const minutes = String(date.getMinutes()).padStart(2, "0");
  const ampm = hours24 >= 12 ? "PM" : "AM";
  const hours12 = hours24 % 12 === 0 ? 12 : hours24 % 12;

  return `${dd}/${mm}/${yyyy}, ${hours12}:${minutes}${ampm}`;
}

function getDayBucket(isoString: string): "Today" | "Yesterday" | "Earlier" {
  const date = new Date(isoString);
  const now = new Date();

  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);

  const startOfYesterday = new Date(startOfToday);
  startOfYesterday.setDate(startOfYesterday.getDate() - 1);

  if (date >= startOfToday) return "Today";
  if (date >= startOfYesterday) return "Yesterday";
  return "Earlier";
}

export default function HomeScreen() {
  const router = useRouter();
  const processVoiceReminder = useAction(api.actions.processVoiceReminder);
  const removeConvexReminder = useMutation(api.reminders.remove);
  const insets = useSafeAreaInsets();
  const toast = useToast();

  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [history, setHistory] = useState<ReminderHistory[]>([]);
  const [showRecording, setShowRecording] = useState(false);
  const [selectedView, setSelectedView] = useState<HomeView>("all");
  const [isLoading, setIsLoading] = useState(true);
  const cancelledRef = useRef(false);
  const [isConnected, setIsConnected] = useState(true);
  const [showOfflineMessage, setShowOfflineMessage] = useState(false);

  // Multi-select state
  const [isSelectMode, setIsSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showSelectMenu, setShowSelectMenu] = useState(false);

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((state) => {
      setIsConnected(state.isConnected ?? true);
      if (state.isConnected) {
        setShowOfflineMessage(false);
      }
    });
    return () => unsubscribe();
  }, []);

  const loadData = useCallback(async () => {
    try {
      setIsLoading(true);
      const [loadedReminders, loadedHistory] = await Promise.all([
        getReminders(),
        getHistory(),
      ]);
      setReminders(loadedReminders);
      setHistory(loadedHistory);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      const task = InteractionManager.runAfterInteractions(() => {
        loadData();
      });
      return () => task.cancel();
    }, [loadData])
  );

  const handleCloseRecording = () => {
    setShowRecording(false);
  };

  const handleCancelProcessing = useCallback(() => {
    cancelledRef.current = true;
    toast.show({ title: "Cancelled", message: "Reminder creation cancelled", type: "info" });
  }, [toast]);

  const handleRecordingComplete = async (audioUri: string, traceId: string) => {
    cancelledRef.current = false;
    try {
      perfLog(traceId, "device.processing", "handleRecordingComplete_start", { audioUri });

      const tBase64 = Date.now();
      const base64 = await readFileAsBase64(audioUri);
      perfLog(traceId, "device.processing", "audio_base64_done", {
        ms: Date.now() - tBase64,
        base64Chars: base64.length,
      });

      const tAction = Date.now();
      // Send device's LOCAL time (not UTC) so GPT can parse relative times correctly
      const now = new Date();
      // Format as local YYYY-MM-DD HH:MM:SS to avoid UTC conversion issues
      const pad = (n: number) => n.toString().padStart(2, '0');
      const deviceLocalDate = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
      const deviceLocalTime = `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
      const deviceTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      const result = await processVoiceReminder({
        audioBase64: base64,
        traceId,
        deviceLocalDate,
        deviceLocalTime,
        deviceTimezone,
      });
      perfLog(traceId, "device.processing", "processVoiceReminder_done", {
        ms: Date.now() - tAction,
      });

      // Check if cancelled while processing
      if (cancelledRef.current) {
        console.log("[VR] Processing cancelled by user");
        return;
      }

      if ((result as any)?.perf) {
        perfLog(traceId, "device.processing", "convex_perf", (result as any).perf);
      }

      if (!result.audioUrl) {
        throw new Error("Failed to get audio URL");
      }

      const frequency = result.frequency === "weekly" ? "custom" : result.frequency;
      const days = frequency === "custom" ? (result.days || []) : [];

      const tLocal = Date.now();
      const newReminder = await addReminder({
        convexId: result.id,
        title: result.title,
        description: result.description,
        time: result.time,
        date: result.date,
        frequency,
        days,
        audioUrl: result.audioUrl,
      });
      perfLog(traceId, "device.processing", "local_addReminder_done", {
        ms: Date.now() - tLocal,
        reminderId: newReminder.id,
      });

      setShowRecording(false);
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      setReminders((prev) => [newReminder, ...prev]);

      toast.show({ title: "Reminder created", message: newReminder.title, type: "success" });
      router.push(`/reminder/edit?id=${newReminder.id}`);

      InteractionManager.runAfterInteractions(() => {
        if (!newReminder.audioUrl) return;
        perfLog(traceId, "device.notifications", "scheduleReminder_start");
        scheduleReminder({
          id: newReminder.id,
          title: newReminder.title,
          description: newReminder.description,
          time: newReminder.time,
          date: newReminder.date,
          frequency: newReminder.frequency,
          days: newReminder.days,
          audioUrl: newReminder.audioUrl,
          snoozeEnabled: newReminder.snoozeEnabled,
          snoozeDuration: newReminder.snoozeDuration,
          volume: newReminder.volume,
          volumeStyle: newReminder.volumeStyle,
        }, { traceId }).catch((e) => {
          console.log("[VR] Failed to schedule reminder:", e);
          perfLog(traceId, "device.notifications", "scheduleReminder_error", {
            error: String(e),
          });
        });
      });
    } catch (error) {
      console.error("[VR] Processing error:", error);
      setShowRecording(false);
      Alert.alert(
        "Error",
        "Failed to process your reminder. Check your internet connection and try again."
      );
    }
  };

  const handleReminderPress = useCallback(
    (reminder: Reminder) => {
      router.push(`/reminder/edit?id=${reminder.id}`);
    },
    [router]
  );

  // Track items currently exiting (being marked done)
  const [exitingIds, setExitingIds] = useState<Set<string>>(new Set());

  const handleMarkDone = useCallback(
    (reminderId: string, reminderTitle: string) => {
      // Mark as exiting to trigger animation
      setExitingIds((prev) => new Set(prev).add(reminderId));

      // Delay actual state update to let animation play
      setTimeout(() => {
        const optimisticEntry: ReminderHistory = {
          id: Math.random().toString(36).slice(2, 11),
          reminderId,
          reminderTitle,
          timestamp: new Date().toISOString(),
          status: "completed",
        };

        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
        setHistory((prev) => [...prev, optimisticEntry]);
        setExitingIds((prev) => {
          const next = new Set(prev);
          next.delete(reminderId);
          return next;
        });

        recordCompletion(reminderId, reminderTitle, "completed").catch((e) => {
          console.log("[VR] Failed to record completion:", e);
        });

        // No toast for individual mark-done (too noisy)
      }, 250); // Match animation duration
    },
    [toast]
  );

  const handleDelete = useCallback(
    async (reminder: Reminder) => {
      const reminderId = reminder.id;
      const convexId = reminder.convexId;

      // Optimistically remove from UI
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      setReminders((prev) => prev.filter((r) => r.id !== reminderId));

      // Delete from local storage
      try {
        await deleteReminderStorage(reminderId);
      } catch (e) {
        console.log("[VR] Failed to delete reminder from storage:", e);
      }

      // Cancel notification and delete audio
      deleteReminderWithAudio(reminderId).catch((e) => {
        console.log("[VR] Failed to cancel notification:", e);
      });

      // Delete from Convex
      if (convexId) {
        removeConvexReminder({ id: convexId as any }).catch((e) => {
          console.log("[VR] Failed to delete Convex reminder:", e);
        });
      }

      // No toast for individual delete (too noisy)
    },
    [removeConvexReminder, toast]
  );

  // Multi-select handlers
  const toggleSelection = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const selectAll = useCallback(() => {
    // Get incomplete reminder IDs (same logic as filteredReminders)
    const today = new Date().toDateString();
    const completedToday = new Set(
      history
        .filter((e) => e.status === "completed" && new Date(e.timestamp).toDateString() === today)
        .map((e) => e.reminderId)
    );
    const allIds = reminders.filter((r) => !completedToday.has(r.id)).map((r) => r.id);
    setSelectedIds(new Set(allIds));
    setIsSelectMode(true);
    setShowSelectMenu(false);
  }, [reminders, history]);

  const enterSelectMode = useCallback(() => {
    setIsSelectMode(true);
    setShowSelectMenu(false);
  }, []);

  const exitSelectMode = useCallback(() => {
    setIsSelectMode(false);
    setSelectedIds(new Set());
  }, []);

  const handleBulkDelete = useCallback(async () => {
    if (selectedIds.size === 0) return;

    const toDelete = reminders.filter((r) => selectedIds.has(r.id));

    // Optimistically remove from UI
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setReminders((prev) => prev.filter((r) => !selectedIds.has(r.id)));
    exitSelectMode();

    // Delete each reminder
    for (const reminder of toDelete) {
      try {
        await deleteReminderStorage(reminder.id);
      } catch (e) {
        console.log("[VR] Failed to delete reminder:", e);
      }
      deleteReminderWithAudio(reminder.id).catch(() => { });
      if (reminder.convexId) {
        removeConvexReminder({ id: reminder.convexId as any }).catch(() => { });
      }
    }

    toast.show({
      title: "Deleted",
      message: `${toDelete.length} reminder${toDelete.length > 1 ? "s" : ""} deleted`,
      type: "info",
    });
  }, [selectedIds, reminders, removeConvexReminder, toast, exitSelectMode]);

  const handleBulkDone = useCallback(() => {
    if (selectedIds.size === 0) return;

    const toMark = reminders.filter((r) => selectedIds.has(r.id));

    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);

    const newEntries: ReminderHistory[] = toMark.map((r) => ({
      id: Math.random().toString(36).slice(2, 11),
      reminderId: r.id,
      reminderTitle: r.title,
      timestamp: new Date().toISOString(),
      status: "completed" as const,
    }));

    setHistory((prev) => [...prev, ...newEntries]);
    exitSelectMode();

    // Record completions
    for (const reminder of toMark) {
      recordCompletion(reminder.id, reminder.title, "completed").catch(() => { });
    }

    toast.show({
      title: "Marked as done",
      message: `${toMark.length} reminder${toMark.length > 1 ? "s" : ""} completed`,
      type: "success",
    });
  }, [selectedIds, reminders, toast, exitSelectMode]);

  const completedTodayReminderIds = useMemo(() => {
    const today = new Date().toDateString();
    return new Set(
      history
        .filter(
          (entry) =>
            entry.status === "completed" &&
            new Date(entry.timestamp).toDateString() === today
        )
        .map((entry) => entry.reminderId)
    );
  }, [history]);

  const filteredReminders = useMemo(() => {
    const incompleteReminders = reminders.filter(
      (reminder) => !completedTodayReminderIds.has(reminder.id)
    );
    return incompleteReminders;
  }, [completedTodayReminderIds, reminders]);

  const remindersById = useMemo(() => {
    return new Map(reminders.map((reminder) => [reminder.id, reminder]));
  }, [reminders]);

  const filteredCompletedHistory = useMemo(() => {
    return history.filter((entry) => entry.status === "completed");
  }, [history]);

  const remindersBySection = useMemo(() => {
    const sections: Record<"Today" | "Yesterday" | "Earlier", Reminder[]> = {
      Today: [],
      Yesterday: [],
      Earlier: [],
    };

    const sorted = [...filteredReminders].sort((a, b) => {
      const aTime = new Date(a.createdAt).getTime();
      const bTime = new Date(b.createdAt).getTime();
      return bTime - aTime;
    });

    for (const reminder of sorted) {
      sections[getDayBucket(reminder.createdAt)].push(reminder);
    }

    return sections;
  }, [filteredReminders]);

  const completedBySection = useMemo(() => {
    const sections: Record<"Today" | "Yesterday" | "Earlier", ReminderHistory[]> =
    {
      Today: [],
      Yesterday: [],
      Earlier: [],
    };

    const sorted = [...filteredCompletedHistory].sort((a, b) => {
      const aTime = new Date(a.timestamp).getTime();
      const bTime = new Date(b.timestamp).getTime();
      return bTime - aTime;
    });

    for (const entry of sorted) {
      sections[getDayBucket(entry.timestamp)].push(entry);
    }

    return sections;
  }, [filteredCompletedHistory]);

  const handleCompletedPress = useCallback(
    (entry: ReminderHistory) => {
      const reminder = remindersById.get(entry.reminderId);
      if (!reminder) return;
      router.push(`/reminder/edit?id=${reminder.id}`);
    },
    [remindersById, router]
  );

  const reminderSections = useMemo(() => {
    return (["Today", "Yesterday", "Earlier"] as const)
      .map((title) => ({ title, data: remindersBySection[title] }))
      .filter((section) => section.data.length > 0);
  }, [remindersBySection]);

  const completedSections = useMemo(() => {
    return (["Today", "Yesterday", "Earlier"] as const)
      .map((title) => ({ title, data: completedBySection[title] }))
      .filter((section) => section.data.length > 0);
  }, [completedBySection]);

  const renderSectionHeader = useCallback(
    ({ section }: { section: { title: string } }) => {
      return (
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>{section.title}</Text>
        </View>
      );
    },
    []
  );

  const renderReminderItem = useCallback(
    ({ item }: { item: Reminder }) => {
      const dueTimestamp = getDueTimestamp(
        { time: item.time, date: item.date, frequency: item.frequency, days: item.days },
        new Date()
      );
      const overdue = isOverdue(dueTimestamp);
      const dueColor = overdue ? colors.statusOverdue : colors.statusUpcoming;
      const isRepeating = item.frequency !== "once";

      const isExiting = exitingIds.has(item.id);

      return (
        <SwipeableCard
          id={item.id}
          isExiting={isExiting}
          onDelete={() => handleDelete(item)}
        >
          <View style={[
            styles.cardInner,
            isSelectMode && selectedIds.has(item.id) && styles.cardSelected,
          ]}>
            <TouchableOpacity
              style={[styles.cardMain, isExiting && { opacity: 0.5 }]}
              onPress={() => {
                if (isSelectMode) {
                  toggleSelection(item.id);
                } else {
                  handleReminderPress(item);
                }
              }}
              activeOpacity={0.8}
              disabled={isExiting}
            >
              <View style={styles.cardText}>
                <Text style={styles.cardTitle} numberOfLines={1}>
                  {item.title}
                </Text>
                <Text style={styles.cardSubtitle} numberOfLines={1}>
                  {item.description || "No description"}
                </Text>
                <View style={styles.dueRow}>
                  <View style={[styles.dueDot, { backgroundColor: dueColor }]} />
                  <Text style={[styles.cardMeta, styles.dueText, { color: dueColor }]} numberOfLines={1}>
                    {formatReminderTime(dueTimestamp)}
                  </Text>
                  {isRepeating && (
                    <AppIcon
                      name="refresh-cw"
                      size={14}
                      color={dueColor}
                      style={styles.repeatIcon}
                    />
                  )}
                </View>
              </View>
            </TouchableOpacity>
            {/* Hide checkmark button in select mode */}
            {!isSelectMode && (
              <TouchableOpacity
                style={styles.checkButton}
                onPress={() => handleMarkDone(item.id, item.title)}
                hitSlop={{ top: 8, left: 8, right: 8, bottom: 8 }}
                accessibilityRole="button"
                accessibilityLabel={`Mark "${item.title}" as completed`}
                disabled={isExiting}
              >
                <Animated.View
                  style={[
                    styles.checkCircle,
                    isExiting && { backgroundColor: colors.success, borderColor: colors.success },
                  ]}
                >
                  {isExiting && <AppIcon name="check" size={14} color="white" />}
                </Animated.View>
              </TouchableOpacity>
            )}
          </View>
        </SwipeableCard>
      );
    },
    [exitingIds, handleDelete, handleMarkDone, handleReminderPress, isSelectMode, selectedIds, toggleSelection]
  );

  const renderCompletedItem = useCallback(
    ({ item }: { item: ReminderHistory }) => {
      const reminder = remindersById.get(item.reminderId);
      const isMissed = item.status === "missed";
      const description = reminder?.description || (isMissed ? "Missed reminder" : "Completed reminder");
      const iconName = isMissed ? "clock" : "check";
      const iconColor = isMissed ? colors.statusOverdue : colors.success;

      return (
        <View style={styles.card}>
          <TouchableOpacity
            style={styles.cardMain}
            onPress={() => handleCompletedPress(item)}
            activeOpacity={reminder ? 0.8 : 1}
          >
            <View style={styles.cardIcon}>
              <AppIcon name={iconName} size={18} color={iconColor} />
            </View>
            <View style={styles.cardText}>
              <Text style={styles.cardTitle} numberOfLines={1}>
                {item.reminderTitle}
              </Text>
              <Text style={styles.cardSubtitle} numberOfLines={1}>
                {description}
              </Text>
              <Text style={[styles.cardMeta, isMissed && { color: colors.statusOverdue }]} numberOfLines={1}>
                {isMissed ? "Missed • " : ""}{formatCardTimestamp(item.timestamp)}
              </Text>
            </View>
          </TouchableOpacity>
        </View>
      );
    },
    [handleCompletedPress, remindersById]
  );

  return (
    <SafeAreaView style={styles.container} edges={["bottom"]}>
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <Text style={styles.headerTitle}>Voice Reminder</Text>
          <View style={styles.headerActions}>
            <TouchableOpacity
              style={styles.proPill}
              activeOpacity={0.85}
              onPress={() => router.push("/paywall")}
            >
              <AppIcon name="crown" size={14} color="white" style={styles.proIcon} />
              <Text style={styles.proPillText}>Go to Pro</Text>
            </TouchableOpacity>
            <View>
              <TouchableOpacity
                style={styles.headerMenuButton}
                onPress={() => setShowSelectMenu(!showSelectMenu)}
                activeOpacity={0.8}
              >
                <AppIcon name="more-vertical" size={22} color={colors.textPrimary} />
              </TouchableOpacity>

              {/* Dropdown menu with backdrop */}
              {showSelectMenu && (
                <>
                  <Pressable
                    style={styles.menuBackdrop}
                    onPress={() => setShowSelectMenu(false)}
                  />
                  <View style={styles.headerSelectMenu}>
                    <TouchableOpacity
                      style={styles.selectMenuItem}
                      onPress={enterSelectMode}
                      activeOpacity={0.8}
                    >
                      <AppIcon name="square" size={18} color={colors.textPrimary} />
                      <Text style={styles.selectMenuText}>Select</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.selectMenuItem}
                      onPress={selectAll}
                      activeOpacity={0.8}
                    >
                      <AppIcon name="check-circle" size={18} color={colors.textPrimary} />
                      <Text style={styles.selectMenuText}>Select All</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.selectMenuItem}
                      onPress={() => {
                        setShowSelectMenu(false);
                        router.push("/settings");
                      }}
                      activeOpacity={0.8}
                    >
                      <AppIcon name="settings" size={18} color={colors.textPrimary} />
                      <Text style={styles.selectMenuText}>Settings</Text>
                    </TouchableOpacity>
                  </View>
                </>
              )}
            </View>
          </View>
        </View>

        <View style={styles.filtersRow}>
          <View style={styles.filtersLeft}>
            <TouchableOpacity
              style={[
                styles.filterPill,
                selectedView === "all" && styles.filterPillActive,
              ]}
              onPress={() => setSelectedView("all")}
              activeOpacity={0.85}
            >
              <Text
                style={[
                  styles.filterPillText,
                  selectedView === "all" && styles.filterPillTextActive,
                ]}
              >
                All
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.filterPill,
                selectedView === "completed" && styles.filterPillActive,
              ]}
              onPress={() => setSelectedView("completed")}
              activeOpacity={0.85}
            >
              <Text
                style={[
                  styles.filterPillText,
                  selectedView === "completed" && styles.filterPillTextActive,
                ]}
              >
                Completed
              </Text>
            </TouchableOpacity>
          </View>

          {/* Cancel button when in select mode */}
          {selectedView === "all" && isSelectMode && (
            <TouchableOpacity
              style={styles.cancelSelectButton}
              onPress={exitSelectMode}
              activeOpacity={0.8}
            >
              <Text style={styles.cancelSelectText}>Cancel</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Selection mode indicator bar */}
        {isSelectMode && (
          <View style={styles.selectionBar}>
            <Text style={styles.selectionCount}>
              {selectedIds.size} selected
            </Text>
          </View>
        )}
      </View>

      {selectedView === "all" ? (
        <SectionList
          style={styles.content}
          contentContainerStyle={[
            styles.contentContainer,
            { paddingBottom: 120 + insets.bottom },
          ]}
          sections={reminderSections}
          keyExtractor={(item) => item.id}
          renderSectionHeader={renderSectionHeader}
          renderItem={renderReminderItem}
          stickySectionHeadersEnabled={false}
          showsVerticalScrollIndicator={false}
          removeClippedSubviews={Platform.OS === "android"}
          initialNumToRender={12}
          maxToRenderPerBatch={12}
          windowSize={7}
          updateCellsBatchingPeriod={16}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              {isLoading ? (
                <>
                  <ActivityIndicator size="small" color={colors.textSecondary} />
                  <Text style={[styles.emptySubtitle, { marginTop: 10 }]}>
                    Loading reminders...
                  </Text>
                </>
              ) : (
                <>
                  <View style={styles.emptyIcon}>
                    <AppIcon name="mic" size={22} color={colors.textSecondary} />
                  </View>
                  <Text style={styles.emptyTitle}>
                    {reminders.length === 0 ? "No reminders yet" : "All done for today!"}
                  </Text>
                  <Text style={styles.emptySubtitle}>
                    {reminders.length === 0
                      ? "Tap below to create your first reminder."
                      : "Check the Completed tab to review what you finished."}
                  </Text>
                  {reminders.length === 0 && (
                    <TouchableOpacity
                      style={styles.emptyCta}
                      onPress={() => setShowRecording(true)}
                      activeOpacity={0.85}
                    >
                      <Text style={styles.emptyCtaText}>Create a reminder</Text>
                    </TouchableOpacity>
                  )}
                </>
              )}
            </View>
          }
        />
      ) : (
        <SectionList
          style={styles.content}
          contentContainerStyle={[
            styles.contentContainer,
            { paddingBottom: 120 + insets.bottom },
          ]}
          sections={completedSections}
          keyExtractor={(item) => item.id}
          renderSectionHeader={renderSectionHeader}
          renderItem={renderCompletedItem}
          stickySectionHeadersEnabled={false}
          showsVerticalScrollIndicator={false}
          removeClippedSubviews={Platform.OS === "android"}
          initialNumToRender={12}
          maxToRenderPerBatch={12}
          windowSize={7}
          updateCellsBatchingPeriod={16}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              {isLoading ? (
                <>
                  <ActivityIndicator size="small" color={colors.textSecondary} />
                  <Text style={[styles.emptySubtitle, { marginTop: 10 }]}>
                    Loading history...
                  </Text>
                </>
              ) : (
                <>
                  <View style={styles.emptyIcon}>
                    <AppIcon name="check-circle" size={22} color={colors.textSecondary} />
                  </View>
                  <Text style={styles.emptyTitle}>
                    {history.length === 0 ? "No history yet" : "No completed reminders"}
                  </Text>
                  <Text style={styles.emptySubtitle}>
                    {history.length === 0
                      ? "Mark reminders done to see them here."
                      : "No completed reminders found."}
                  </Text>
                  <TouchableOpacity
                    style={[styles.emptyCta, styles.emptyCtaGhost]}
                    onPress={() => setSelectedView("all")}
                    activeOpacity={0.85}
                  >
                    <Text style={[styles.emptyCtaText, styles.emptyCtaGhostText]}>
                      Back to reminders
                    </Text>
                  </TouchableOpacity>
                </>
              )}
            </View>
          }
        />
      )}

      {selectedView === "all" && !showRecording && (
        <>
          {showOfflineMessage && (
            <View style={[styles.offlineMessage, { bottom: (Platform.OS === "ios" ? 100 : 90) + insets.bottom }]}>
              <AppIcon name="wifi-off" size={18} color={colors.textSecondary} />
              <Text style={styles.offlineText}>No internet connection</Text>
              <TouchableOpacity onPress={() => setShowOfflineMessage(false)} hitSlop={{ top: 10, right: 10, bottom: 10, left: 10 }}>
                <AppIcon name="x" size={16} color={colors.textTertiary} />
              </TouchableOpacity>
            </View>
          )}

          {/* Bulk Action Bar in Selection Mode */}
          {isSelectMode && selectedIds.size > 0 ? (
            <View style={[styles.bulkActionBar, { paddingBottom: insets.bottom + 16 }]}>
              <TouchableOpacity
                style={styles.bulkActionButton}
                onPress={handleBulkDelete}
                activeOpacity={0.8}
              >
                <AppIcon name="trash-2" size={20} color={colors.destructive} />
                <Text style={[styles.bulkActionText, { color: colors.destructive }]}>Delete</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.bulkActionButton, styles.bulkActionPrimary]}
                onPress={handleBulkDone}
                activeOpacity={0.8}
              >
                <AppIcon name="check" size={20} color="white" />
                <Text style={[styles.bulkActionText, { color: "white" }]}>Done</Text>
              </TouchableOpacity>
            </View>
          ) : !isSelectMode && (
            <TouchableOpacity
              style={[
                styles.fab,
                { bottom: (Platform.OS === "ios" ? 28 : 18) + insets.bottom },
              ]}
              onPress={() => {
                if (!isConnected) {
                  setShowOfflineMessage(true);
                  return;
                }
                setShowRecording(true);
              }}
              activeOpacity={0.9}
            >
              <AppIcon name="mic" size={26} color="white" />
            </TouchableOpacity>
          )}
        </>
      )}

      <RecordingOverlay
        visible={showRecording}
        autoStart={true}
        onClose={handleCloseRecording}
        onRecordingComplete={handleRecordingComplete}
        onCancelProcessing={handleCancelProcessing}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    paddingTop: Platform.OS === "ios" ? 60 : 26,
    paddingHorizontal: 20,
    paddingBottom: 14,
  },
  headerTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10,
  },
  headerTitle: {
    fontSize: scaleFontSize(24),
    fontWeight: "700",
    color: colors.textPrimary,
  },
  headerActions: {
    flexDirection: "row",
    alignItems: "center",
  },
  proPill: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.accent,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    marginRight: 10,
  },
  proPillText: {
    color: "white",
    fontWeight: "700",
    fontSize: scaleFontSize(14),
  },
  proIcon: {
    marginRight: 6,
  },
  settingsButton: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surface,
  },
  filtersRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 10,
  },
  filterPill: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: colors.surface,
    marginRight: 10,
  },
  filterPillActive: {
    backgroundColor: colors.accent,
  },
  filterPillText: {
    fontWeight: "700",
    fontSize: scaleFontSize(14),
    color: colors.textPrimary,
  },
  filterPillTextActive: {
    color: "white",
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 120,
  },
  section: {
    marginTop: 14,
  },
  sectionHeader: {
    marginTop: 14,
  },
  sectionTitle: {
    fontSize: scaleFontSize(20),
    fontWeight: "700",
    color: colors.textPrimary,
    marginBottom: 10,
  },
  card: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surface,
    borderRadius: 18,
    paddingVertical: 12,
    paddingHorizontal: 12,
    marginBottom: 10,
  },
  cardInner: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 12,
  },
  cardSelected: {
    backgroundColor: colors.accent + "20",
    borderRadius: 12,
  },
  cardMain: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
  },
  cardIcon: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: colors.muted,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 10,
  },
  cardText: {
    flex: 1,
  },
  cardTitle: {
    fontSize: scaleFontSize(16),
    fontWeight: "700",
    color: colors.textHeading,
  },
  cardSubtitle: {
    marginTop: 2,
    fontSize: scaleFontSize(14),
    color: colors.textSecondary,
  },
  cardMeta: {
    marginTop: 4,
    fontSize: scaleFontSize(13),
    color: colors.textTertiary,
  },
  dueRow: {
    marginTop: 4,
    flexDirection: "row",
    alignItems: "center",
  },
  dueDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 8,
  },
  dueText: {
    flexShrink: 1,
  },
  repeatIcon: {
    marginLeft: 8,
  },
  checkButton: {
    paddingLeft: 10,
    paddingVertical: 4,
    justifyContent: "center",
    alignItems: "center",
  },
  checkCircle: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: colors.outline,
    backgroundColor: "transparent",
    justifyContent: "center",
    alignItems: "center",
  },
  fab: {
    position: "absolute",
    alignSelf: "center",
    bottom: Platform.OS === "ios" ? 28 : 18,
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.accent,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOpacity: 0.14,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
  emptyState: {
    marginTop: 26,
    paddingVertical: 18,
    alignItems: "center",
  },
  emptyIcon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },
  emptyTitle: {
    fontSize: scaleFontSize(17),
    fontWeight: "700",
    color: colors.textPrimary,
  },
  emptySubtitle: {
    marginTop: 6,
    fontSize: scaleFontSize(14),
    color: colors.textSecondary,
    textAlign: "center",
  },
  emptyCta: {
    marginTop: 14,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: colors.accent,
  },
  emptyCtaText: {
    color: "white",
    fontWeight: "700",
    fontSize: scaleFontSize(14),
  },
  emptyCtaGhost: {
    backgroundColor: colors.surface,
  },
  emptyCtaGhostText: {
    color: colors.textPrimary,
  },
  offlineMessage: {
    position: "absolute",
    alignSelf: "center",
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: colors.surface,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 16,
    shadowColor: "#000",
    shadowOpacity: 0.08,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  offlineText: {
    fontSize: scaleFontSize(14),
    fontWeight: "500",
    color: colors.textSecondary,
  },
  // Multi-select mode styles
  filtersLeft: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },
  moreButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  headerMenuButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  headerSelectMenu: {
    position: "absolute",
    top: 44,
    right: 0,
    backgroundColor: colors.surface,
    borderRadius: 12,
    paddingVertical: 8,
    minWidth: 150,
    shadowColor: "#000",
    shadowOpacity: 0.15,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
    zIndex: 100,
  },
  menuBackdrop: {
    position: "absolute",
    top: -100,
    left: -500,
    right: -500,
    bottom: -1000,
    zIndex: 99,
  },
  cancelSelectButton: {
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  cancelSelectText: {
    fontWeight: "600",
    fontSize: scaleFontSize(14),
    color: colors.accent,
  },
  selectMenu: {
    position: "absolute",
    top: 40,
    right: 0,
    backgroundColor: colors.surface,
    borderRadius: 12,
    paddingVertical: 8,
    minWidth: 140,
    shadowColor: "#000",
    shadowOpacity: 0.15,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
    zIndex: 100,
  },
  selectMenuItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 10,
  },
  selectMenuText: {
    fontSize: scaleFontSize(14),
    fontWeight: "500",
    color: colors.textPrimary,
  },
  selectionBar: {
    paddingHorizontal: 20,
    paddingVertical: 8,
    backgroundColor: colors.accent + "15",
  },
  selectionCount: {
    fontSize: scaleFontSize(14),
    fontWeight: "600",
    color: colors.accent,
  },
  // Bulk action bar styles
  bulkActionBar: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: "row",
    justifyContent: "space-around",
    alignItems: "center",
    backgroundColor: colors.surface,
    paddingTop: 16,
    paddingHorizontal: 20,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    shadowColor: "#000",
    shadowOpacity: 0.1,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: -2 },
    elevation: 8,
  },
  bulkActionButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 14,
    borderRadius: 12,
    marginHorizontal: 6,
    backgroundColor: colors.muted,
  },
  bulkActionPrimary: {
    backgroundColor: colors.accent,
  },
  bulkActionText: {
    fontSize: scaleFontSize(15),
    fontWeight: "700",
  },
});
