import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  FlatList,
  InteractionManager,
  LayoutAnimation,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useFocusEffect } from "@react-navigation/native";
import { useRouter } from "expo-router";
import { useAction, useMutation } from "convex/react";
import { api } from "../convex/_generated/api";
import { convex } from "../lib/convexClient";
import { colors, scaleFontSize } from "../lib/theme";
import { FONT_DISPLAY } from "../lib/fonts";
import { readFileAsBase64 } from "../lib/convex";
import { uploadRecordingToConvex } from "../lib/convexUpload";
import { scheduleReminder } from "../lib/notifications";
import { hydrateReminderAudio } from "../lib/audioHydration";
import { getDeviceId } from "../lib/deviceId";
import { useReminderStore, Reminder } from "../lib/store";
import { useSettingsStore } from "../lib/settingsStore";
import RecordingOverlay from "../components/RecordingOverlay";
import EditReminderSheet from "../components/EditReminderSheet";
import AiConsentCard from "../components/AiConsentCard";
import { resolveAiConsent, type AiConsentChoice } from "../lib/aiConsent";
import { arePermissionsGranted, showPermissionPrompt } from "../components/PermissionPrompt";
import SwipePager from "../components/SwipePager";
import AppIcon from "../components/AppIcon";
import ReminderListItem, { chipColorForId } from "../components/ReminderListItem";
import CompletedSection from "../components/CompletedSection";
import DaysPage, { subtitleFor } from "../components/days/DaysPage";
import BottomBar, { BottomBarTab } from "../components/BottomBar";
import { SettingsContent } from "./settings";
import { createTraceId, perfLog, recordTap, startStallMonitor } from "../lib/perf";
import { checkCanCreateWithCount, getFreeActiveLimit } from "../lib/usage";
import { isReminderActive } from "../lib/reminderActive";
import { removeReminderFully } from "../lib/reminderRemoval";
import { historyOnDay, isCompletedOnDay, occurrencesForDay, todayISO } from "../lib/dayOccurrences";
import { checkProStatus, getCachedProStatus } from "../lib/purchases";
import NetInfo from "@react-native-community/netinfo";

// Pager pages: 0 = Today, 1 = Days, 2 = Settings (see docs/ui-redesign.md gesture map).
const PAGE_TODAY = 0;
const PAGE_DAYS = 1;
const PAGE_SETTINGS = 2;

function formatHistoryTime(timestamp: string): string {
  const date = new Date(timestamp);
  const hh = String(date.getHours()).padStart(2, "0");
  const mm = String(date.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

export default function HomeScreen() {
  const router = useRouter();
  const processVoiceReminder = useAction(api.actions.processVoiceReminder);
  const processVoiceReminderFast = useAction(api.actions.processVoiceReminderFast);
  const generateAudioUploadUrl = useMutation(api.reminders.generateAudioUploadUrl);
  const removeConvexReminder = useMutation(api.reminders.remove);
  const insets = useSafeAreaInsets();
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

  const [showRecording, setShowRecording] = useState(false);
  const [recordingTraceId, setRecordingTraceId] = useState<string | null>(null);
  const [canStartRecording, setCanStartRecording] = useState(false);
  const [gateStatusText, setGateStatusText] = useState<string | undefined>(undefined);
  const [showUpgradeCta, setShowUpgradeCta] = useState(false);
  const [showConsentCard, setShowConsentCard] = useState(false);
  const [page, setPage] = useState(PAGE_TODAY);
  const cancelledRef = useRef(false);
  const [isConnected, setIsConnected] = useState(true);
  const [showOfflineMessage, setShowOfflineMessage] = useState(false);

  // Upgrade CTA: hidden for subscribers.
  const [isPro, setIsPro] = useState(() => getCachedProStatus().isPro === true);

  // --- Tap-to-navigation tracing (debug/perf) ---
  const tapDebugSnapshotRef = useRef({
    remindersCount: 0,
    historyCount: 0,
    isLoading: false,
    showOfflineMessage: false,
  });
  const tapTraceByReminderIdRef = useRef(new Map<string, { traceId: string; pressInAt: number }>()); // id -> trace

  useEffect(() => {
    tapDebugSnapshotRef.current = {
      remindersCount: reminders.length,
      historyCount: history.length,
      isLoading,
      showOfflineMessage,
    };
  }, [reminders.length, history.length, isLoading, showOfflineMessage]);

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

  // Refresh pro status on focus so the Get Pro pill hides for subscribers.
  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      void checkProStatus().then((pro) => {
        if (!cancelled) setIsPro(pro);
      });
      return () => {
        cancelled = true;
      };
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

    // Nothing is recorded until the user has agreed to their voice being
    // processed off-device by the named AI providers (App Review 5.1.2(i)).
    const settingsState = useSettingsStore.getState();
    if (!settingsState.hasLoadedSettings) {
      await settingsState.loadSettings();
    }
    if (useSettingsStore.getState().settings.aiConsentAcceptedAt === null) {
      perfLog(traceId, "ui.recording", "open_blocked_consent");
      setShowConsentCard(true);
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

  // Both card buttons land here. "Allow" persists consent, chains straight into
  // the system mic prompt and then continues into the recording the user
  // originally tapped for; "Not now" (also backdrop tap, swipe-down and Android
  // back) saves nothing and starts nothing — the card returns on the next tap.
  const handleConsentChoice = useCallback(
    async (choice: AiConsentChoice) => {
      setShowConsentCard(false);
      const outcome = await resolveAiConsent(choice);
      if (outcome.error === "persist_failed") {
        Alert.alert("Couldn't save your choice", "Please try again.");
        return;
      }
      if (outcome.proceedToRecording) {
        void handleOpenRecording();
      }
    },
    [handleOpenRecording]
  );

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

      // Owning install for the reminder the backend is about to create (OLD-74).
      const deviceId = await getDeviceId();

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
          deviceId,
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
          deviceId,
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

      // Card-chip emoji from the parse (absent = neutral bell chip)
      const resultEmoji = typeof (result as any).emoji === "string" && (result as any).emoji
        ? ((result as any).emoji as string)
        : undefined;

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
        emoji: resultEmoji,
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
                await removeConvexReminder({ id: id as any, deviceId: await getDeviceId() });
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
          await removeConvexReminder({ id: id as any, deviceId: await getDeviceId() });
        },
      });

      // No toast for individual delete (too noisy)
    },
    [removeConvexReminder]
  );

  // ---- Today page membership (date-pure, see docs/ui-redesign.md) ----
  const todayDate = todayISO(nowMs);

  const todayReminders = useMemo(() => {
    return occurrencesForDay(activeReminders, todayDate).filter(
      (r) => !isCompletedOnDay(r, history, todayDate)
    );
  }, [activeReminders, history, todayDate]);

  const remindersById = useMemo(() => {
    return new Map(reminders.map((reminder) => [reminder.id, reminder]));
  }, [reminders]);

  const todayCompletedItems = useMemo(() => {
    return historyOnDay(history, todayDate).map((entry) => {
      const reminder = remindersById.get(entry.reminderId);
      return {
        id: entry.id,
        title: entry.reminderTitle,
        emoji: reminder?.emoji,
        chipColor: chipColorForId(entry.reminderId),
        subtitle: formatHistoryTime(entry.timestamp),
        missed: entry.status === "missed",
        onPress: reminder ? () => handleReminderPress(reminder) : undefined,
      };
    });
  }, [history, todayDate, remindersById, handleReminderPress]);

  // Days-page completion circle: today's occurrence for repeaters, whole reminder for one-offs.
  const handleDayToggleComplete = useCallback(
    (reminder: Reminder, _dateISO: string) => {
      handleMarkDone(reminder.id, reminder.title);
    },
    [handleMarkDone]
  );

  const handleTab = useCallback((tab: BottomBarTab) => {
    setPage(tab === "today" ? PAGE_TODAY : tab === "days" ? PAGE_DAYS : PAGE_SETTINGS);
  }, []);

  const dateLabel = useMemo(() => {
    return new Date(nowMs).toLocaleDateString([], {
      weekday: "long",
      month: "short",
      day: "numeric",
    });
  }, [nowMs]);

  const renderTodayItem = useCallback(
    ({ item }: { item: Reminder }) => {
      const isExiting = exitingIds.has(item.id);

      return (
        <ReminderListItem
          id={item.id}
          title={item.title}
          emoji={item.emoji}
          chipColor={chipColorForId(item.id)}
          subtitle={subtitleFor(item, true, nowMs)}
          completed={isExiting}
          onPress={() => {
            recordReminderPressIn(item.id);
            handleReminderPress(item);
          }}
          onToggleComplete={() => {
            if (!isExiting) {
              handleMarkDone(item.id, item.title);
            }
          }}
          onDelete={() => handleDelete(item)}
        />
      );
    },
    [
      exitingIds,
      nowMs,
      recordReminderPressIn,
      handleReminderPress,
      handleMarkDone,
      handleDelete,
    ]
  );

  const activeTab: BottomBarTab =
    page === PAGE_TODAY ? "today" : page === PAGE_DAYS ? "days" : "settings";

  return (
    // Full-bleed to the screen's bottom edge: the lists pad their own content
    // past the home indicator, so a bottom safe-area edge would just cut a
    // dead strip under the pager.
    <SafeAreaView style={styles.container} edges={[]}>
      <SwipePager
        page={page}
        onPageChange={setPage}
        // Navigation is dock-only: horizontal swipe belongs to the Days page's
        // own day-flipper (gesture map in docs/ui-redesign.md).
        swipeEnabled={false}
      >
        {/* ---- Page 0: Today ---- */}
        <View style={styles.page}>
          <View style={styles.header}>
            <View style={styles.headerTop}>
              <View style={styles.headerTitleWrap}>
                <Text style={styles.headerTitle}>Today</Text>
                <Text style={styles.headerDate}>{dateLabel}</Text>
              </View>
              <View style={styles.headerActions}>
                {!isPro && (
                  <TouchableOpacity
                    style={styles.proPill}
                    activeOpacity={0.85}
                    onPress={openPaywall}
                  >
                    <AppIcon name="crown" size={14} color="white" style={styles.proIcon} />
                    <Text style={styles.proPillText}>Get Pro</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>
          </View>

          <FlatList
            style={styles.content}
            contentContainerStyle={[
              styles.contentContainer,
              { paddingBottom: 120 + insets.bottom },
            ]}
            data={todayReminders}
            keyExtractor={(item) => item.id}
            renderItem={renderTodayItem}
            showsVerticalScrollIndicator={false}
            removeClippedSubviews={Platform.OS === "android"}
            initialNumToRender={12}
            maxToRenderPerBatch={12}
            windowSize={7}
            updateCellsBatchingPeriod={16}
            ListFooterComponent={
              <CompletedSection items={todayCompletedItems} initiallyCollapsed />
            }
            // Deliberately no ListEmptyComponent: an empty Today stays silent,
            // including while the store loads.
          />
        </View>

        {/* ---- Page 1: Days ---- */}
        <View style={[styles.page, { paddingTop: insets.top + 8 }]}>
          <DaysPage
            reminders={reminders}
            history={history}
            onOpenReminder={handleReminderPress}
            onToggleComplete={handleDayToggleComplete}
            onDelete={handleDelete}
            active={page === PAGE_DAYS}
          />
        </View>

        {/* ---- Page 2: Settings ---- */}
        <View style={[styles.page, { paddingTop: insets.top + 8 }]}>
          <SettingsContent embedded />
        </View>
      </SwipePager>

      {/* Tiimo-style dock on every page, mic anchored bottom-right.
          Both yield the bottom edge while recording or editing. */}
      {!showRecording && !editingReminder && (
        <>
          {showOfflineMessage && (
            <View style={[styles.offlineMessage, { bottom: (Platform.OS === "ios" ? 110 : 100) + insets.bottom }]}>
              <AppIcon name="wifi-off" size={18} color={colors.textSecondary} />
              <Text style={styles.offlineText}>No internet connection</Text>
              <TouchableOpacity onPress={() => setShowOfflineMessage(false)} hitSlop={{ top: 10, right: 10, bottom: 10, left: 10 }}>
                <AppIcon name="x" size={16} color={colors.textTertiary} />
              </TouchableOpacity>
            </View>
          )}

          <BottomBar activeTab={activeTab} onTab={handleTab} onRecord={handleOpenRecording} />
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

      {/* First-run AI disclosure — gates the very first recording */}
      <AiConsentCard
        visible={showConsentCard}
        onAllow={() => void handleConsentChoice("allow")}
        onDecline={() => void handleConsentChoice("not_now")}
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
  page: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    paddingTop: Platform.OS === "ios" ? 60 : 26,
    paddingHorizontal: 20,
    paddingBottom: 8,
  },
  headerTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  headerTitleWrap: {
    flex: 1,
  },
  headerTitle: {
    fontFamily: FONT_DISPLAY,
    fontSize: scaleFontSize(32),
    color: colors.textHeading,
  },
  headerDate: {
    marginTop: 2,
    fontSize: scaleFontSize(14),
    color: colors.textSecondary,
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
  content: {
    flex: 1,
  },
  contentContainer: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 120,
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
});
