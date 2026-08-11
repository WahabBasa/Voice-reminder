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
  FadeIn,
  FadeOut,
  SlideOutLeft,
  Layout,
  interpolateColor,
} from "react-native-reanimated";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useFocusEffect } from "@react-navigation/native";
import { useRouter } from "expo-router";
import { useAction, useMutation } from "convex/react";
import { api } from "../convex/_generated/api";
import { convex } from "../lib/convexClient";
import { colors, scaleFontSize } from "../lib/theme";
import { formatReminderTime, isOverdue } from "../lib/time";
import { readFileAsBase64 } from "../lib/convex";
import { uploadRecordingToConvex } from "../lib/convexUpload";
import { scheduleReminder } from "../lib/notifications";
import { hydrateReminderAudio } from "../lib/audioHydration";
import { useReminderStore, Reminder, ReminderHistory } from "../lib/store";
import { useSettingsStore } from "../lib/settingsStore";
import RecordingOverlay from "../components/RecordingOverlay";
import EditReminderSheet from "../components/EditReminderSheet";
import { arePermissionsGranted, showPermissionPrompt } from "../components/PermissionPrompt";
import SwipeableCard from "../components/SwipeableCard";
import SwipePager from "../components/SwipePager";
import AppIcon from "../components/AppIcon";
import { useToast } from "../components/ToastProvider";
import { createTraceId, perfLog, recordTap, startStallMonitor } from "../lib/perf";
import { checkCanCreateWithCount, getFreeActiveLimit } from "../lib/usage";
import { getReminderNextDueTimestamp, isReminderActive } from "../lib/reminderActive";
import { removeReminderFully } from "../lib/reminderRemoval";
import NetInfo from "@react-native-community/netinfo";

type HomeView = "all" | "completed";

const HOME_VIEW_PAGES: HomeView[] = ["all", "completed"];

const AnimatedTouchable = Animated.createAnimatedComponent(TouchableOpacity);

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

function formatIntervalNextIn(targetMs: number, nowMs: number = Date.now()): string {
  const diffMs = Math.max(0, targetMs - nowMs);
  const minutes = Math.max(1, Math.ceil(diffMs / 60000));
  if (minutes < 60) return `Next in ${minutes} minute${minutes !== 1 ? "s" : ""}`;

  const hours = Math.ceil(minutes / 60);
  if (hours < 24) return `Next in ${hours} hour${hours !== 1 ? "s" : ""}`;

  const days = Math.ceil(hours / 24);
  return `Next in ${days} day${days !== 1 ? "s" : ""}`;
}

export default function HomeScreen() {
  const router = useRouter();
  const processVoiceReminder = useAction(api.actions.processVoiceReminder);
  const processVoiceReminderFast = useAction(api.actions.processVoiceReminderFast);
  const generateAudioUploadUrl = useMutation(api.reminders.generateAudioUploadUrl);
  const removeConvexReminder = useMutation(api.reminders.remove);
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const [nowMs, setNowMs] = useState(() => Date.now());

  // Zustand store for centralized state
  const reminders = useReminderStore((state) => state.reminders);
  const history = useReminderStore((state) => state.history);
  const isLoading = useReminderStore((state) => state.isLoading);
  const storeAddReminder = useReminderStore((state) => state.addReminder);
  const storeUpdateReminder = useReminderStore((state) => state.updateReminder);
  const storeRecordCompletion = useReminderStore((state) => state.recordCompletion);
  const loadAllData = useReminderStore((state) => state.loadAll);
  const loadReminders = useReminderStore((state) => state.loadReminders);
  const hasLoadedReminders = useReminderStore((state) => state.hasLoadedReminders);

  const activeReminders = useMemo(() => {
    return reminders.filter((r) => isReminderActive(r, history, nowMs));
  }, [reminders, history, nowMs]);

  const dueTsById = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of activeReminders) {
      map.set(r.id, getReminderNextDueTimestamp(r, history, nowMs));
    }
    return map;
  }, [activeReminders, history, nowMs]);

  const [showRecording, setShowRecording] = useState(false);
  const [recordingTraceId, setRecordingTraceId] = useState<string | null>(null);
  const [canStartRecording, setCanStartRecording] = useState(false);
  const [gateStatusText, setGateStatusText] = useState<string | undefined>(undefined);
  const [showUpgradeCta, setShowUpgradeCta] = useState(false);
  const [selectedView, setSelectedView] = useState<HomeView>("all");
  const cancelledRef = useRef(false);
  const [isConnected, setIsConnected] = useState(true);
  const [showOfflineMessage, setShowOfflineMessage] = useState(false);

  // Multi-select state
  const [isSelectMode, setIsSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showSelectMenu, setShowSelectMenu] = useState(false);

  // --- Tap-to-navigation tracing (debug/perf) ---
  const tapDebugSnapshotRef = useRef({
    remindersCount: 0,
    historyCount: 0,
    isLoading: false,
    isSelectMode: false,
    showSelectMenu: false,
    showOfflineMessage: false,
  });
  const tapTraceByReminderIdRef = useRef(new Map<string, { traceId: string; pressInAt: number }>()); // id -> trace

  useEffect(() => {
    tapDebugSnapshotRef.current = {
      remindersCount: reminders.length,
      historyCount: history.length,
      isLoading,
      isSelectMode,
      showSelectMenu,
      showOfflineMessage,
    };
  }, [reminders.length, history.length, isLoading, isSelectMode, showSelectMenu, showOfflineMessage]);

  const recordReminderPressIn = useCallback((reminderId: string) => {
    const traceId = createTraceId("tap");
    const now = Date.now();
    tapTraceByReminderIdRef.current.set(reminderId, { traceId, pressInAt: now });
    recordTap(traceId);
    perfLog(traceId, "ui.tap", "reminder_press_in", {
      reminderId,
      t: now,
      ...tapDebugSnapshotRef.current,
    });
  }, []);

  useEffect(() => {
    if (process.env.EXPO_PUBLIC_VR_STALL_MONITOR === "1") {
      startStallMonitor();
    }
  }, []);

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((state) => {
      setIsConnected(state.isConnected ?? true);
      if (state.isConnected) {
        setShowOfflineMessage(false);
      }
    });
    return () => unsubscribe();
  }, []);

  // Load data on screen focus using Zustand store
  useFocusEffect(
    useCallback(() => {
      const task = InteractionManager.runAfterInteractions(() => {
        loadAllData();
      });
      return () => task.cancel();
    }, [loadAllData])
  );

  // Keep "due in X minutes" labels fresh without requiring user interaction.
  useFocusEffect(
    useCallback(() => {
      setNowMs(Date.now());
      const interval = setInterval(() => setNowMs(Date.now()), 30_000);
      return () => clearInterval(interval);
    }, [])
  );

  const handleCloseRecording = () => {
    setShowRecording(false);
    setRecordingTraceId(null);
    setCanStartRecording(false);
    setGateStatusText(undefined);
    setShowUpgradeCta(false);
  };

  const openPaywall = useCallback(() => {
    router.push("/paywall");
  }, [router]);

  const lockRecordingForLimit = useCallback(
    (traceId: string, currentCount: number, limit: number) => {
      setCanStartRecording(false);
      setGateStatusText(`You've reached ${limit} active reminders. Upgrade for unlimited.`);
      setShowUpgradeCta(true);
      perfLog(traceId, "ui.recording", "gate_blocked_limit", { currentCount, limit });
    },
    []
  );

  const handleOpenRecording = useCallback(async () => {
    if (showRecording) return;
    const traceId = createTraceId("vr");
    setRecordingTraceId(traceId);
    recordTap(traceId);
    perfLog(traceId, "ui.recording", "open_tap");

    if (!isConnected) {
      perfLog(traceId, "ui.recording", "open_blocked_offline");
      setShowOfflineMessage(true);
      return;
    }

    // Check permissions before letting user create a reminder
    const permsOk = await arePermissionsGranted();
    if (!permsOk) {
      perfLog(traceId, "ui.recording", "open_blocked_permissions");
      showPermissionPrompt();
      return;
    }

    perfLog(traceId, "ui.recording", "show_overlay");
    setShowRecording(true);

    // Gate recording start without blocking the overlay from rendering.
    setCanStartRecording(false);
    setGateStatusText("Checking your plan...");
    setShowUpgradeCta(false);

    const limit = getFreeActiveLimit();
    const currentCount = activeReminders.length;
    perfLog(traceId, "ui.recording", "gate_snapshot", { currentCount, limit, hasLoadedReminders });

    if (!hasLoadedReminders) {
      perfLog(traceId, "ui.recording", "gate_requested_while_not_loaded");
      setGateStatusText("Loading reminders...");
      setShowUpgradeCta(false);
      setCanStartRecording(false);

      await loadReminders().catch(() => {});
      const state = useReminderStore.getState();
      const afterLoadCount = state.reminders.filter((r) => isReminderActive(r, state.history, Date.now())).length;
      perfLog(traceId, "ui.recording", "gate_after_load", { currentCount: afterLoadCount, limit });

      if (afterLoadCount < limit) {
        setCanStartRecording(true);
        setGateStatusText(undefined);
        setShowUpgradeCta(false);
        perfLog(traceId, "ui.recording", "gate_allowed_fast");
        return;
      }

      const tCheck = Date.now();
      perfLog(traceId, "ui.recording", "checkCanCreate_start", { currentCount: afterLoadCount, limit });
      const { canCreate, isPro } = await checkCanCreateWithCount(afterLoadCount);
      perfLog(traceId, "ui.recording", "checkCanCreate_done", {
        ms: Date.now() - tCheck,
        canCreate,
        isPro,
        currentCount: afterLoadCount,
        limit,
      });

      if (!canCreate) {
        lockRecordingForLimit(traceId, afterLoadCount, limit);
        return;
      }

      setCanStartRecording(true);
      setGateStatusText(undefined);
      setShowUpgradeCta(false);
      perfLog(traceId, "ui.recording", "gate_allowed");
      return;
    }

    // Fast path: under the free limit, allow immediately.
    if (currentCount < limit) {
      setCanStartRecording(true);
      setGateStatusText(undefined);
      setShowUpgradeCta(false);
      perfLog(traceId, "ui.recording", "gate_allowed_fast");
      return;
    }

    // Slow path: only now do we consult RevenueCat.
    const tCheck = Date.now();
    perfLog(traceId, "ui.recording", "checkCanCreate_start", { currentCount, limit });
    const { canCreate, isPro } = await checkCanCreateWithCount(currentCount);
    perfLog(traceId, "ui.recording", "checkCanCreate_done", {
      ms: Date.now() - tCheck,
      canCreate,
      isPro,
      currentCount,
      limit,
    });

    if (!canCreate) {
      lockRecordingForLimit(traceId, currentCount, limit);
      return;
    }

    setCanStartRecording(true);
    setGateStatusText(undefined);
    setShowUpgradeCta(false);
    perfLog(traceId, "ui.recording", "gate_allowed");
  }, [showRecording, isConnected, activeReminders.length, hasLoadedReminders, loadReminders, lockRecordingForLimit]);

  const handleCancelProcessing = useCallback(() => {
    cancelledRef.current = true;
  }, []);

  const handleRecordingComplete = async (audioUri: string, traceId: string) => {
    cancelledRef.current = false;
    try {
      perfLog(traceId, "device.processing", "handleRecordingComplete_start", { audioUri });

      // Send device's LOCAL time (not UTC) so GPT can parse relative times correctly
      const now = new Date();
      const pad = (n: number) => n.toString().padStart(2, '0');
      const deviceLocalDate = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
      const deviceLocalTime = `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
      const deviceTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

      // Address term for the spoken description (empty = address-free urgency)
      const settingsState = useSettingsStore.getState();
      if (!settingsState.hasLoadedSettings) {
        await settingsState.loadSettings();
      }
      const addressTerm = useSettingsStore.getState().settings.addressTerm || undefined;

      let result: any;
      let usedFastPath = false;

      // Try FAST PATH: binary upload + async TTS
      try {
        perfLog(traceId, "device.processing", "upload_start");
        const { uploadUrl } = await generateAudioUploadUrl();
        const { storageId } = await uploadRecordingToConvex(uploadUrl, audioUri);
        perfLog(traceId, "device.processing", "upload_done", { storageId });

        const tAction = Date.now();
        result = await processVoiceReminderFast({
          audioStorageId: storageId as any,
          traceId,
          deviceLocalDate,
          deviceLocalTime,
          deviceTimezone,
          addressTerm,
        });
        perfLog(traceId, "device.processing", "processVoiceReminderFast_done", {
          ms: Date.now() - tAction,
        });
        usedFastPath = true;
      } catch (fastPathError) {
        // FALLBACK: use base64 path
        console.log("[VR] Fast path failed, falling back to base64:", fastPathError);
        perfLog(traceId, "device.processing", "fallback_to_base64");

        const tBase64 = Date.now();
        const base64 = await readFileAsBase64(audioUri);
        perfLog(traceId, "device.processing", "audio_base64_done", {
          ms: Date.now() - tBase64,
          base64Chars: base64.length,
        });

        const tAction = Date.now();
        result = await processVoiceReminder({
          audioBase64: base64,
          traceId,
          deviceLocalDate,
          deviceLocalTime,
          deviceTimezone,
          addressTerm,
        });
        perfLog(traceId, "device.processing", "processVoiceReminder_done", {
          ms: Date.now() - tAction,
        });
      }

      // Check if cancelled while processing
      if (cancelledRef.current) {
        console.log("[VR] Processing cancelled by user");
        return;
      }

      if ((result as any)?.perf) {
        perfLog(traceId, "device.processing", "convex_perf", (result as any).perf);
      }

      const frequency = result.frequency === "weekly" ? "custom" : result.frequency;
      const days = frequency === "custom" ? (result.days || []) : [];

      const intervalMs = Number((result as any).intervalMs);
      const anchorAt = Number((result as any).anchorAt);

      const tLocal = Date.now();

      // Extract unified schedule fields from Convex result
      const resultScheduleType = (result as any).scheduleType as 'once' | 'interval' | 'rrule' | undefined;
      const resultOnceAt = (result as any).onceAt as number | undefined;
      const resultRrule = (result as any).rrule as string | undefined;
      const resultDtstart = (result as any).dtstart as number | undefined;
      const resultUntil = (result as any).until as number | undefined;
      const resultParseWarnings = (result as any).parseWarnings as string[] | undefined;

      // Determine timezone
      const deviceTzid = Intl.DateTimeFormat().resolvedOptions().timeZone;

      // If using fast path, audio is pending
      const audioStatus = usedFastPath ? "pending" : (result.audioUrl ? "ready" : undefined);

      const resultPreReminderMinutes = Number((result as any).preReminderMinutes);
      const resultPreAudioUrl = (result as any).preAudioUrl as string | undefined;

      // Assistant replay fields (OLD-53). Fast path returns urgency/persistent/
      // variants at parse time; variantAudioUrls arrive via hydration.
      const resultUrgency = (result as any).urgency as 'urgent' | 'notice' | 'routine' | undefined;
      const resultPersistent = (result as any).persistent === true;
      const resultVariants = Array.isArray((result as any).variants)
        ? ((result as any).variants as string[])
        : undefined;
      const resultVariantAudioUrls = Array.isArray((result as any).variantAudioUrls)
        ? ((result as any).variantAudioUrls as string[])
        : undefined;

      const newReminder = await storeAddReminder({
        convexId: result.id,
        title: result.title,
        description: result.description,
        time: (result as any).time ?? "00:00",
        date: (result as any).date,
        frequency,
        days,
        audioUrl: result.audioUrl || "",
        audioStatus,
        preReminderMinutes:
          Number.isFinite(resultPreReminderMinutes) && resultPreReminderMinutes > 0
            ? resultPreReminderMinutes
            : undefined,
        preAudioUrl: resultPreAudioUrl || undefined,
        urgency: resultUrgency,
        persistent: resultPersistent || undefined,
        variants: resultVariants?.length ? resultVariants : undefined,
        variantAudioUrls: resultVariantAudioUrls?.length ? resultVariantAudioUrls : undefined,

        intervalMs: Number.isFinite(intervalMs) ? intervalMs : undefined,
        anchorAt: Number.isFinite(anchorAt) ? anchorAt : undefined,

        // New unified schedule fields
        scheduleType: resultScheduleType,
        onceAt: resultOnceAt,
        rrule: resultRrule,
        dtstart: resultDtstart,
        tzid: deviceTzid,
        until: resultUntil,
        parseWarnings: resultParseWarnings,

        schemaVersion: 4,
      });
      perfLog(traceId, "device.processing", "local_addReminder_done", {
        ms: Date.now() - tLocal,
        reminderId: newReminder.id,
      });

      // If using fast path, start hydration
      if (usedFastPath && result.id) {
        console.log("[VR] Starting audio hydration for", result.id);
        // Fire-and-forget hydration
        hydrateReminderAudio({
          convexClient: convex,
          convexId: result.id,
          localReminderId: newReminder.id,
          updateLocal: async (patch) => {
            const current = useReminderStore.getState().getReminderById(newReminder.id);
            if (current) {
              await storeUpdateReminder({ ...current, ...patch });
            }
          },
        }).catch((e) => {
          console.error("[VR] Hydration failed:", e);
        });
      }

      setShowRecording(false);
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      // Store already updated - no need for setReminders

      setEditingReminder(newReminder);

      InteractionManager.runAfterInteractions(() => {
        perfLog(traceId, "device.notifications", "scheduleReminder_start");
        (async () => {
          try {
            const { triggerTimestamp } = await scheduleReminder(
              {
                id: newReminder.id,
                title: newReminder.title,
                description: newReminder.description,
                time: newReminder.time,
                date: newReminder.date,
                frequency: newReminder.frequency,
                days: newReminder.days,
                audioUrl: newReminder.audioUrl,
                preReminderMinutes: newReminder.preReminderMinutes,
                preAudioUrl: newReminder.preAudioUrl,
                urgency: newReminder.urgency,
                persistent: newReminder.persistent,
                variants: newReminder.variants,
                variantAudioUrls: newReminder.variantAudioUrls,
                snoozeEnabled: newReminder.snoozeEnabled,
                snoozeDuration: newReminder.snoozeDuration,
                volume: newReminder.volume,
                volumeStyle: newReminder.volumeStyle,

                intervalMs: newReminder.intervalMs,
                anchorAt: newReminder.anchorAt,
                intervalDays: newReminder.intervalDays,

                // New unified schedule fields
                scheduleType: newReminder.scheduleType,
                onceAt: newReminder.onceAt,
                rrule: newReminder.rrule,
                dtstart: newReminder.dtstart,
                tzid: newReminder.tzid,
                until: newReminder.until,
                parseWarnings: newReminder.parseWarnings,
              },
              { traceId }
            );

            const current = useReminderStore.getState().getReminderById(newReminder.id);
            if (current) {
              await storeUpdateReminder({ ...current, scheduledFor: triggerTimestamp });
            }
          } catch (e: any) {
            console.log("[VR] Failed to schedule reminder:", e);
            if (e?.name === "ExactAlarmPermissionError") {
              showPermissionPrompt();
            }
            perfLog(traceId, "device.notifications", "scheduleReminder_error", {
              error: String(e),
            });
          }
        })();
      });
    } catch (error: any) {
      console.error("[VR] Processing error:", error);

      // If we somehow got gated at the store level (race, legacy path), reset overlay to locked state.
      if (error?.name === "ReminderLimitExceededError") {
        const currentCount = Number.isFinite(error?.currentCount) ? error.currentCount : reminders.length;
        const limit = Number.isFinite(error?.limit) ? error.limit : getFreeActiveLimit();
        setShowRecording(false);
        setTimeout(() => {
          setRecordingTraceId(traceId);
          setShowRecording(true);
          lockRecordingForLimit(traceId, currentCount, limit);
        }, 0);
        return;
      }

      setShowRecording(false);

      Alert.alert(
        "Error",
        "Failed to process your reminder. Check your internet connection and try again."
      );
    }
  };

  // State for edit overlay - renders instantly without navigation
  const [editingReminder, setEditingReminder] = useState<Reminder | null>(null);

  const handleReminderPress = useCallback(
    (reminder: Reminder) => {
      const reminderId = reminder.id;
      const existing = tapTraceByReminderIdRef.current.get(reminderId);
      const traceId = existing?.traceId ?? createTraceId("tap");
      const now = Date.now();
      perfLog(traceId, "ui.tap", "reminder_press", {
        reminderId,
        t: now,
        pressInMs: existing ? now - existing.pressInAt : undefined,
        ...tapDebugSnapshotRef.current,
      });

      // Open overlay immediately - no navigation delay!
      perfLog(traceId, "ui.tap", "set_editing_reminder", { t: Date.now(), reminderId });
      setEditingReminder(reminder);
    },
    []
  );

  const handleEditSheetClose = useCallback(() => {
    setEditingReminder(null);
  }, []);

  // Store handles updates automatically - these callbacks just close the sheet
  const handleEditSheetSave = useCallback((_updated: Reminder) => {
    // Store already updated by EditReminderSheet
  }, []);

  const handleEditSheetDelete = useCallback((_deleted: Reminder) => {
    // Store already updated by EditReminderSheet
  }, []);

  // Track items currently exiting (being marked done)
  const [exitingIds, setExitingIds] = useState<Set<string>>(new Set());

  const handleMarkDone = useCallback(
    (reminderId: string, reminderTitle: string) => {
      // Mark as exiting to trigger animation
      setExitingIds((prev) => new Set(prev).add(reminderId));

      // Delay actual state update to let animation play
      setTimeout(() => {
        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
        setExitingIds((prev) => {
          const next = new Set(prev);
          next.delete(reminderId);
          return next;
        });

        void (async () => {
          const reminder = useReminderStore.getState().getReminderById(reminderId);

          // Record completion (always)
          await storeRecordCompletion(reminderId, reminderTitle, "completed").catch((e) => {
            console.log("[VR] Failed to record completion:", e);
          });

          // One-time reminders become inactive after completion.
          if (reminder?.frequency === "once") {
            await removeReminderFully(reminderId, {
              removeConvexById: async (id) => {
                await removeConvexReminder({ id: id as any });
              },
            });
          }
        })();

        // No toast for individual mark-done (too noisy)
      }, 250); // Match animation duration
    },
    [storeRecordCompletion]
  );

  const handleDelete = useCallback(
    async (reminder: Reminder) => {
      const reminderId = reminder.id;

      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      await removeReminderFully(reminderId, {
        removeConvexById: async (id) => {
          await removeConvexReminder({ id: id as any });
        },
      });

      // No toast for individual delete (too noisy)
    },
    [removeConvexReminder]
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
    const allIds = activeReminders.map((r) => r.id);
    setSelectedIds(new Set(allIds));
    setIsSelectMode(true);
    setShowSelectMenu(false);
  }, [activeReminders]);

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
    exitSelectMode();

    // Delete each reminder fully
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    for (const reminder of toDelete) {
      await removeReminderFully(reminder.id, {
        removeConvexById: async (id) => {
          await removeConvexReminder({ id: id as any });
        },
      });
    }

    toast.show({
      title: "Deleted",
      message: `${toDelete.length} reminder${toDelete.length > 1 ? "s" : ""} deleted`,
      type: "info",
    });
  }, [selectedIds, reminders, removeConvexReminder, toast, exitSelectMode]);

  const handleBulkDone = useCallback(async () => {
    if (selectedIds.size === 0) return;

    const toMark = reminders.filter((r) => selectedIds.has(r.id));
    exitSelectMode();

    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);

    // Record completions; one-time reminders are removed fully
    for (const reminder of toMark) {
      await storeRecordCompletion(reminder.id, reminder.title, "completed").catch(() => { });
      if (reminder.frequency === "once") {
        await removeReminderFully(reminder.id, {
          removeConvexById: async (id) => {
            await removeConvexReminder({ id: id as any });
          },
        });
      }
    }

    toast.show({
      title: "Marked as done",
      message: `${toMark.length} reminder${toMark.length > 1 ? "s" : ""} completed`,
      type: "success",
    });
  }, [selectedIds, reminders, storeRecordCompletion, removeConvexReminder, toast, exitSelectMode]);

  const remindersById = useMemo(() => {
    return new Map(reminders.map((reminder) => [reminder.id, reminder]));
  }, [reminders]);

  const filteredCompletedHistory = useMemo(() => {
    return history.filter(
      (entry) => entry.status === "completed" || entry.status === "missed"
    );
  }, [history]);

  const reminderSections = useMemo(() => {
    const startOfToday = new Date(nowMs);
    startOfToday.setHours(0, 0, 0, 0);
    const endOfToday = startOfToday.getTime() + 86_400_000;

    const today: Reminder[] = [];
    const upcoming: Reminder[] = [];

    for (const r of activeReminders) {
      const dueTs = dueTsById.get(r.id) ?? nowMs;
      if (dueTs < endOfToday) {
        today.push(r);
      } else {
        upcoming.push(r);
      }
    }

    const byDue = (a: Reminder, b: Reminder) =>
      (dueTsById.get(a.id) ?? 0) - (dueTsById.get(b.id) ?? 0);
    today.sort(byDue);
    upcoming.sort(byDue);

    const sections: Array<{ title: "Today" | "Upcoming"; data: Reminder[] }> = [];
    if (today.length > 0) sections.push({ title: "Today", data: today });
    if (upcoming.length > 0) sections.push({ title: "Upcoming", data: upcoming });
    return sections;
  }, [activeReminders, dueTsById, nowMs]);

  const completedBySection = useMemo(() => {
    const sections: Record<"Today" | "Yesterday" | "Earlier", ReminderHistory[]> = {
      Today: [],
      Yesterday: [],
      Earlier: [],
    };

    // Pre-compute timestamps once to avoid O(n log n) Date constructions in comparator
    const withTs = filteredCompletedHistory.map((e) => ({
      entry: e,
      ts: new Date(e.timestamp).getTime(),
    }));
    withTs.sort((a, b) => b.ts - a.ts);

    for (const { entry } of withTs) {
      sections[getDayBucket(entry.timestamp)].push(entry);
    }

    return sections;
  }, [filteredCompletedHistory]);

  const handleCompletedPress = useCallback(
    (entry: ReminderHistory) => {
      const reminder = remindersById.get(entry.reminderId);
      if (!reminder) {
        toast.show({
          title: "Completed",
          message: "This one-time reminder was completed and removed.",
          type: "info",
        });
        return;
      }
      setEditingReminder(reminder);
    },
    [remindersById, toast]
  );

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
      const dueTimestamp = dueTsById.get(item.id) ?? getReminderNextDueTimestamp(item, history, nowMs);
      const dueLabel = item.frequency === "interval"
        ? formatIntervalNextIn(dueTimestamp, nowMs)
        : formatReminderTime(dueTimestamp);
      const overdue = isOverdue(dueTimestamp, nowMs);
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
                    {dueLabel}
                  </Text>
                  {isRepeating && (
                    <AppIcon
                      name="refresh-cw"
                      size={14}
                      color={dueColor}
                      style={styles.repeatIcon}
                    />
                  )}
                  {(item.preReminderMinutes ?? 0) > 0 && (
                    <View style={styles.preAlertTag}>
                      <Text style={styles.preAlertTagText}>
                        {item.preReminderMinutes} min early
                      </Text>
                    </View>
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
    [dueTsById, exitingIds, handleDelete, handleMarkDone, handleReminderPress, isSelectMode, nowMs, selectedIds, toggleSelection]
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

  // pagerProgress mirrors the fractional page position (0=all, 1=completed) so
  // the filter pills tint continuously while the finger drags the pager.
  const pagerProgress = useSharedValue(0);

  const handlePageChange = useCallback((index: number) => {
    setSelectedView(HOME_VIEW_PAGES[index] ?? "all");
  }, []);

  const allPillStyle = useAnimatedStyle(() => {
    const p = Math.min(1, Math.max(0, pagerProgress.value));
    return {
      backgroundColor: interpolateColor(p, [0, 1], [colors.accent, colors.surface]),
    };
  });
  const allPillTextStyle = useAnimatedStyle(() => {
    const p = Math.min(1, Math.max(0, pagerProgress.value));
    return {
      color: interpolateColor(p, [0, 1], ["#FFFFFF", colors.textPrimary]),
    };
  });
  const completedPillStyle = useAnimatedStyle(() => {
    const p = Math.min(1, Math.max(0, pagerProgress.value));
    return {
      backgroundColor: interpolateColor(p, [0, 1], [colors.surface, colors.accent]),
    };
  });
  const completedPillTextStyle = useAnimatedStyle(() => {
    const p = Math.min(1, Math.max(0, pagerProgress.value));
    return {
      color: interpolateColor(p, [0, 1], [colors.textPrimary, "#FFFFFF"]),
    };
  });

  return (
    // Full-bleed to the screen's bottom edge: the lists pad their own content
    // past the home indicator, so a bottom safe-area edge would just cut a
    // dead strip under the pager.
    <SafeAreaView style={styles.container} edges={[]}>
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
            <AnimatedTouchable
              style={[styles.filterPill, allPillStyle]}
              onPress={() => setSelectedView("all")}
              activeOpacity={0.85}
            >
              <Animated.Text style={[styles.filterPillText, allPillTextStyle]}>
                All
              </Animated.Text>
            </AnimatedTouchable>

            <AnimatedTouchable
              style={[styles.filterPill, completedPillStyle]}
              onPress={() => setSelectedView("completed")}
              activeOpacity={0.85}
            >
              <Animated.Text style={[styles.filterPillText, completedPillTextStyle]}>
                Completed
              </Animated.Text>
            </AnimatedTouchable>
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

      <SwipePager
        page={selectedView === "all" ? 0 : 1}
        onPageChange={handlePageChange}
        swipeEnabled={!isSelectMode}
        progress={pagerProgress}
      >
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
                    {reminders.length === 0 && history.length === 0
                      ? "No reminders yet"
                      : "All caught up!"}
                  </Text>
                  <Text style={styles.emptySubtitle}>
                    {reminders.length === 0 && history.length === 0
                      ? "Tap below to create your first reminder."
                      : "You have no active reminders right now."}
                  </Text>
                  {activeReminders.length === 0 && (
                    <TouchableOpacity style={styles.emptyCta} onPress={handleOpenRecording} activeOpacity={0.85}>
                      <Text style={styles.emptyCtaText}>Create a reminder</Text>
                    </TouchableOpacity>
                  )}
                </>
              )}
            </View>
          }
        />

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
      </SwipePager>

      {selectedView === "all" && !showRecording && !editingReminder && (
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
            <Animated.View
              entering={FadeIn.duration(150)}
              exiting={FadeOut.duration(100)}
              style={[
                styles.fab,
                { bottom: (Platform.OS === "ios" ? 28 : 18) + insets.bottom },
              ]}
            >
              <TouchableOpacity
                style={styles.fabTouchable}
                onPress={handleOpenRecording}
                activeOpacity={0.9}
              >
                <AppIcon name="mic" size={26} color="white" />
              </TouchableOpacity>
            </Animated.View>
          )}
        </>
      )}

      <RecordingOverlay
        visible={showRecording}
        autoStart={true}
        initialTraceId={recordingTraceId ?? undefined}
        canStartRecording={canStartRecording}
        gateStatusText={gateStatusText}
        showUpgradeCta={showUpgradeCta}
        onUpgradePress={openPaywall}
        onClose={handleCloseRecording}
        onRecordingComplete={handleRecordingComplete}
        onCancelProcessing={handleCancelProcessing}
      />

      {/* Edit overlay - renders on top without navigation */}
      {editingReminder && (
        <EditReminderSheet
          reminder={editingReminder}
          onClose={handleEditSheetClose}
          onSave={handleEditSheetSave}
          onDelete={handleEditSheetDelete}
        />
      )}
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
  filterPillText: {
    fontWeight: "700",
    fontSize: scaleFontSize(14),
    color: colors.textPrimary,
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
  preAlertTag: {
    marginLeft: 8,
    backgroundColor: colors.muted,
    borderRadius: 8,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  preAlertTagText: {
    fontSize: 11,
    fontWeight: "600",
    color: colors.textSecondary,
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
  fabTouchable: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.accent,
    alignItems: "center",
    justifyContent: "center",
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
