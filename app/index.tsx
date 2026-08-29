import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  FlatList,
  InteractionManager,
  Keyboard,
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
import { colors, scaleFontSize, shadows } from "../lib/theme";
import { Plus } from "lucide-react-native";
import { FONT_DISPLAY } from "../lib/fonts";
import { readFileAsBase64 } from "../lib/convex";
import { uploadRecordingToConvex } from "../lib/convexUpload";
import { scheduleReminder } from "../lib/notifications";
import { hydrateReminderAudio } from "../lib/audioHydration";
import { getDeviceId } from "../lib/deviceId";
import { useReminderStore, Reminder } from "../lib/store";
import { useSettingsStore } from "../lib/settingsStore";
import RecordingOverlay from "../components/RecordingOverlay";
import ComposerSheet from "../components/ComposerSheet";
import EditReminderSheet from "../components/EditReminderSheet";
import { useToast } from "../components/ToastProvider";
import AiConsentCard from "../components/AiConsentCard";
import { resolveAiConsent, type AiConsentChoice } from "../lib/aiConsent";
import { arePermissionsGranted, showPermissionPrompt } from "../components/PermissionPrompt";
import SwipePager from "../components/SwipePager";
import AppIcon from "../components/AppIcon";
import ReminderListItem, { chipColorForId } from "../components/ReminderListItem";
import CompletedSection from "../components/CompletedSection";
import OverdueSection from "../components/OverdueSection";
import DaysPage, { subtitleFor } from "../components/days/DaysPage";
import BottomBar, { BottomBarTab } from "../components/BottomBar";
import { SettingsContent } from "./settings";
import { createTraceId, perfLog, recordTap, startStallMonitor } from "../lib/perf";
import { getActiveReminderCount, getFreeActiveLimit } from "../lib/usage";
import {
  describeTakeOutcome,
  extractTakeItems,
  intakeTakeReminders,
  isPremiumTakeItem,
  planTakeAllowance,
  scheduleTakeReminders,
} from "../lib/voiceTake";
import { submitTypedTake } from "../lib/typedTake";
import { isReminderActive } from "../lib/reminderActive";
import { removeReminderFully } from "../lib/reminderRemoval";
import { historyOnDay, todayISO } from "../lib/dayOccurrences";
import { groupTodayReminders, overdueSubtitle } from "../lib/todayMembership";
import { formatClockAt } from "../lib/time";
import { checkProStatus, getCachedProStatus, refreshProStatus } from "../lib/purchases";
import NetInfo from "@react-native-community/netinfo";
import * as Sentry from "@sentry/react-native";

// Pager pages: 0 = Today, 1 = Days, 2 = Settings (see docs/ui-redesign.md gesture map).
const PAGE_TODAY = 0;
const PAGE_DAYS = 1;
const PAGE_SETTINGS = 2;

export default function HomeScreen() {
  const router = useRouter();
  const processVoiceReminder = useAction(api.actions.processVoiceReminder);
  const processVoiceReminderFast = useAction(api.actions.processVoiceReminderFast);
  const processTypedReminder = useAction(api.actions.processTypedReminder);
  const generateAudioUploadUrl = useMutation(api.reminders.generateAudioUploadUrl);
  const removeConvexReminder = useMutation(api.reminders.remove);
  const toast = useToast();
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
  // Convex upload URL, fetched when recording STARTS rather than when it stops
  // (OLD-106). Holds the in-flight promise, not the URL, so the stop path can
  // await whatever progress the fetch made while the user was talking. A URL
  // from generateUploadUrl is single-use, so a run that consumes it clears the
  // ref; a run that never happens (user cancels) just lets it expire.
  const uploadUrlRef = useRef<Promise<string | null> | null>(null);
  // Edit overlay - renders instantly without navigation
  const [editingReminder, setEditingReminder] = useState<Reminder | null>(null);
  const [recordingTraceId, setRecordingTraceId] = useState<string | null>(null);
  const [canStartRecording, setCanStartRecording] = useState(false);
  const [gateStatusText, setGateStatusText] = useState<string | undefined>(undefined);
  const [showUpgradeCta, setShowUpgradeCta] = useState(false);
  const [showConsentCard, setShowConsentCard] = useState(false);
  // Typed composer (OLD-101) — opened from the header's + button (Tiimo pattern).
  const [showComposer, setShowComposer] = useState(false);
  const [composerTraceId, setComposerTraceId] = useState<string | null>(null);
  const [isComposerSubmitting, setIsComposerSubmitting] = useState(false);
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

  // The gate decision currently on screen. A background entitlement refresh
  // resolves after the fact, so it checks this before touching the overlay —
  // the one it was fired for may already be closed or replaced.
  const gateTraceRef = useRef<string | null>(null);

  const handleCloseRecording = () => {
    gateTraceRef.current = null;
    setShowRecording(false);
    setRecordingTraceId(null);
    setCanStartRecording(false);
    setGateStatusText(undefined);
    setShowUpgradeCta(false);
  };

  const openPaywall = useCallback(() => {
    router.push("/paywall");
  }, [router]);

  // Interval mode is Pro (OLD-100). Everyone sent here by that gate gets the
  // paywall's interval headline instead of the general pitch.
  const openIntervalPaywall = useCallback(() => {
    router.push({ pathname: "/paywall", params: { context: "interval" } });
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
    gateTraceRef.current = traceId;
    setShowRecording(true);
    setShowUpgradeCta(false);

    // The plan is known before the tap: RevenueCat's entitlement is primed at
    // launch and its update listener keeps it current, so the gate is a
    // synchronous cache read and the mic opens in the same render as the
    // overlay. An unresolved cache counts as free — that only ever costs a
    // capped user the lock below, which the refresh behind it corrects.
    const limit = getFreeActiveLimit();
    const cachedPro = getCachedProStatus().isPro === true;
    let currentCount = getActiveReminderCount();

    // Reminders load at startup, so an unloaded store here is the rare
    // cold-tap. Pro skips the wait outright — there is no cap to count against.
    if (!hasLoadedReminders && !cachedPro) {
      perfLog(traceId, "ui.recording", "gate_requested_while_not_loaded");
      setCanStartRecording(false);
      setGateStatusText("Loading reminders...");

      await loadReminders().catch(() => {});
      if (gateTraceRef.current !== traceId) return;
      currentCount = getActiveReminderCount();
      perfLog(traceId, "ui.recording", "gate_after_load", { currentCount, limit });
    }

    perfLog(traceId, "ui.recording", "gate_snapshot", {
      currentCount,
      limit,
      cachedPro,
      hasLoadedReminders,
    });

    if (cachedPro || currentCount < limit) {
      setCanStartRecording(true);
      setGateStatusText(undefined);
      perfLog(traceId, "ui.recording", "gate_allowed_cached", { cachedPro });
      return;
    }

    // At the cap on a free plan. The only way the cache is wrong here is a
    // subscription bought on another device, so the store gets asked behind
    // the lock rather than in front of it.
    lockRecordingForLimit(traceId, currentCount, limit);

    const tRefresh = Date.now();
    void refreshProStatus().then((isProNow) => {
      perfLog(traceId, "ui.recording", "gate_refresh_done", {
        ms: Date.now() - tRefresh,
        isPro: isProNow,
      });
      if (!isProNow || gateTraceRef.current !== traceId) return;
      setIsPro(true);
      setCanStartRecording(true);
      setGateStatusText(undefined);
      setShowUpgradeCta(false);
      perfLog(traceId, "ui.recording", "gate_unlocked_after_refresh", { currentCount, limit });
    });
  }, [showRecording, isConnected, hasLoadedReminders, loadReminders, lockRecordingForLimit]);

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

  // Reopen the overlay in its locked state after the fact: the pre-recording
  // gate can go stale while a take is in flight.
  const showLimitLockedOverlay = useCallback(
    (traceId: string, currentCount: number, limit: number) => {
      setShowRecording(false);
      setTimeout(() => {
        gateTraceRef.current = traceId;
        setRecordingTraceId(traceId);
        setShowRecording(true);
        lockRecordingForLimit(traceId, currentCount, limit);
      }, 0);
    },
    [lockRecordingForLimit]
  );

  const handleCancelProcessing = useCallback(() => {
    cancelledRef.current = true;
  }, []);

  /**
   * What a parsed take becomes: re-gated against the free cap, stored, hydrated,
   * scheduled, and then either opened in the edit sheet or summed up in a toast.
   *
   * Voice and the typed composer share every line of it — the only difference
   * between them is which action produced `result` (OLD-101). Returns false when
   * the free cap ate the whole take; a take that produced nothing for any other
   * reason throws, and the caller owns the error surface.
   */
  const applyTakeResult = useCallback(
    async (
      result: any,
      opts: {
        traceId: string;
        usedFastPath: boolean;
        /** Nothing survived the free cap — the caller says so its own way. */
        onCapBlocked: (activeCount: number, limit: number) => void;
        /** Nothing survived the interval gate — the caller closes and upsells. */
        onPremiumBlocked: () => void;
        /** The take landed: close whatever surface the user came from. */
        onCreated?: () => void;
      }
    ): Promise<boolean> => {
      const { traceId, usedFastPath } = opts;

      // One take can hold several reminders (OLD-93). A result without the
      // array is the legacy single-reminder shape — a take of exactly one.
      const takeItems = extractTakeItems(result);
      const draftContext = {
        usedFastPath,
        tzid: Intl.DateTimeFormat().resolvedOptions().timeZone,
      };

      // The gate before recording only knew about one reminder, so the take is
      // re-gated here, where its size — and its schedules — are known. Interval
      // mode needs Pro whatever the count says (OLD-100).
      const limit = getFreeActiveLimit();
      const premium = takeItems.map((item) => isPremiumTakeItem(item, draftContext.tzid));
      const allowance = await planTakeAllowance({
        takeCount: takeItems.length,
        activeCount: getActiveReminderCount(),
        limit,
        checkPro: checkProStatus,
        premium,
      });
      perfLog(traceId, "device.processing", "take_gate", {
        takeCount: takeItems.length,
        allowed: allowance.allowed,
        dropped: allowance.dropped,
        blockedPremium: allowance.blockedPremium,
        isPro: allowance.isPro,
        activeCount: allowance.activeCount,
        limit,
      });

      const tLocal = Date.now();
      const outcome = await intakeTakeReminders({
        items: takeItems,
        allowed: allowance.allowed,
        decisions: allowance.decisions,
        context: draftContext,
        deps: {
          addReminder: storeAddReminder,
          startHydration: (reminder, convexId) => {
            console.log("[VR] Starting audio hydration for", convexId);
            // Fire-and-forget hydration
            hydrateReminderAudio({
              convexClient: convex,
              convexId,
              localReminderId: reminder.id,
              updateLocal: async (patch) => {
                const current = useReminderStore.getState().getReminderById(reminder.id);
                if (current) {
                  await storeUpdateReminder({ ...current, ...patch });
                }
              },
            }).catch((e) => {
              console.error("[VR] Hydration failed:", e);
            });
          },
          discardOverflow: async (item) => {
            const convexId = typeof item?.id === "string" ? item.id : undefined;
            if (!convexId) return;
            await removeConvexReminder({ id: convexId as any, deviceId: await getDeviceId() });
          },
          onError: (stage, e, index) => {
            console.log(`[VR] Take item ${index} failed to ${stage}:`, e);
            perfLog(traceId, "device.processing", "take_item_error", {
              index,
              stage,
              error: String(e),
            });
          },
        },
      });
      perfLog(traceId, "device.processing", "local_addReminder_done", {
        ms: Date.now() - tLocal,
        reminderId: outcome.created[0]?.id,
        created: outcome.created.length,
        failed: outcome.failed,
        dropped: outcome.dropped,
        blockedPremium: outcome.blockedPremium,
      });

      if (outcome.created.length === 0) {
        // Nothing survived a gate: land on the surface that explains why, not
        // on nothing. The interval gate speaks first — it is the more specific
        // "no" of the two.
        if (outcome.blockedPremium > 0) {
          opts.onPremiumBlocked();
          return false;
        }
        if (outcome.dropped > 0) {
          opts.onCapBlocked(allowance.activeCount, limit);
          return false;
        }
        throw new Error("Take produced no reminders");
      }

      opts.onCreated?.();
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      // Store already updated - no need for setReminders

      const feedback = describeTakeOutcome({
        created: outcome.created.length,
        dropped: outcome.dropped,
        blockedPremium: outcome.blockedPremium,
        failed: outcome.failed,
        total: outcome.total,
        limit,
      });
      if (feedback) {
        // A take of several stays on the list — opening one card would hide the
        // rest — and says what it made (and what it couldn't) in a toast.
        toast.show({
          title: feedback.title,
          message: feedback.message,
          type: feedback.type,
          durationMs: feedback.upgrade ? 4000 : undefined,
          onPress: !feedback.upgrade
            ? undefined
            : feedback.upgradeContext === "interval"
              ? openIntervalPaywall
              : openPaywall,
        });
      } else {
        setEditingReminder(outcome.created[0]);
      }

      InteractionManager.runAfterInteractions(() => {
        perfLog(traceId, "device.notifications", "scheduleReminder_start", {
          count: outcome.created.length,
        });
        // One reminder that won't schedule must not cost its siblings their
        // alarms, so each is scheduled on its own.
        let promptedForExactAlarm = false;
        void scheduleTakeReminders(
          outcome.created,
          async (newReminder) => {
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
                volume: newReminder.volume,
                volumeStyle: newReminder.volumeStyle,

                intervalMs: newReminder.intervalMs,
                anchorAt: newReminder.anchorAt,
                intervalDays: newReminder.intervalDays,

                // New unified schedule fields
                schedule: newReminder.schedule,
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
          },
          (e: any) => {
            console.log("[VR] Failed to schedule reminder:", e);
            if (e?.name === "ExactAlarmPermissionError" && !promptedForExactAlarm) {
              promptedForExactAlarm = true;
              showPermissionPrompt();
            }
            perfLog(traceId, "device.notifications", "scheduleReminder_error", {
              error: String(e),
            });
          }
        );
      });

      return true;
    },
    [
      storeAddReminder,
      storeUpdateReminder,
      removeConvexReminder,
      toast,
      openPaywall,
      openIntervalPaywall,
    ]
  );

  /**
   * Open the typed composer (OLD-101).
   *
   * The same gates the mic runs, minus the ones that are about a microphone:
   * notification/alarm permission still applies (a typed reminder has to ring),
   * the AI consent card does not — it is written about a recording and chains
   * straight into the system mic prompt.
   */
  const handleOpenComposer = useCallback(async () => {
    if (showComposer || showRecording) return;
    const traceId = createTraceId("cmp");
    recordTap(traceId);
    perfLog(traceId, "ui.composer", "open_tap");

    if (!isConnected) {
      perfLog(traceId, "ui.composer", "open_blocked_offline");
      setShowOfflineMessage(true);
      return;
    }

    const permsOk = await arePermissionsGranted();
    if (!permsOk) {
      perfLog(traceId, "ui.composer", "open_blocked_permissions");
      showPermissionPrompt();
      return;
    }

    // Free cap, counted exactly the way the mic counts it — and read the same
    // synchronous way, off the entitlement cache instead of a round trip.
    const limit = getFreeActiveLimit();
    const cachedPro = getCachedProStatus().isPro === true;
    if (!hasLoadedReminders && !cachedPro) {
      await loadReminders().catch(() => {});
    }
    const currentCount = getActiveReminderCount();

    if (!cachedPro && currentCount >= limit) {
      // The composer has no locked state of its own, so a blocked user gets the
      // upgrade toast rather than an empty field they can't send. That also
      // means there is no open surface for a late refresh to unlock the way the
      // mic's overlay gets unlocked — and the toast it would have to talk over
      // routes to the paywall, which is the wrong place to send a subscriber.
      // So the refresh here only heals the cache: a stale-free subscriber (one
      // who bought on another device) gets through on their next tap.
      perfLog(traceId, "ui.composer", "gate_blocked_limit", { currentCount, limit });
      toast.show({
        title: `You've reached ${limit} active reminders`,
        message: "Tap to upgrade for unlimited.",
        type: "warning",
        durationMs: 4000,
        onPress: openPaywall,
      });

      const tRefresh = Date.now();
      void refreshProStatus().then((isProNow) => {
        perfLog(traceId, "ui.composer", "gate_refresh_done", {
          ms: Date.now() - tRefresh,
          isPro: isProNow,
        });
        if (isProNow) setIsPro(true);
      });
      return;
    }

    perfLog(traceId, "ui.composer", "gate_allowed_cached", { currentCount, limit, cachedPro });
    setComposerTraceId(traceId);
    setShowComposer(true);
  }, [
    showComposer,
    showRecording,
    isConnected,
    hasLoadedReminders,
    loadReminders,
    toast,
    openPaywall,
  ]);

  const handleComposerDismiss = useCallback(() => {
    setShowComposer(false);
    setComposerTraceId(null);
  }, []);

  // Handoff: the typed sentence is dropped and the recorder takes over, running
  // its own gates from scratch (consent included).
  const handleComposerSpeak = useCallback(() => {
    setShowComposer(false);
    setComposerTraceId(null);
    void handleOpenRecording();
  }, [handleOpenRecording]);

  /**
   * One typed sentence through the same pipeline a recording takes: parse on
   * the server, then the shared take loop — so the sheet opens pre-filled and
   * the saved reminder speaks, exactly like a voice take.
   */
  const handleComposerSubmit = useCallback(
    async (text: string) => {
      const traceId = composerTraceId ?? createTraceId("cmp");
      setIsComposerSubmitting(true);
      // Typing is over: the keyboard would otherwise still be up when the edit
      // sheet takes the screen.
      Keyboard.dismiss();
      try {
        const tAction = Date.now();
        perfLog(traceId, "device.processing", "typed_action_start", { chars: text.length });
        const { result } = await submitTypedTake({
          text,
          deviceId: await getDeviceId(),
          now: new Date(),
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          traceId,
          runAction: (actionArgs) => processTypedReminder(actionArgs),
        });
        perfLog(traceId, "device.processing", "typed_action_done", { ms: Date.now() - tAction });

        if ((result as any)?.perf) {
          perfLog(traceId, "device.processing", "convex_perf", (result as any).perf);
        }

        // Typed takes always come back with audio pending (the parse returns
        // before TTS), so hydration runs for them just like the fast voice path.
        await applyTakeResult(result, {
          traceId,
          usedFastPath: true,
          onCapBlocked: (_activeCount, limit) => {
            setShowComposer(false);
            toast.show({
              title: `You've reached ${limit} active reminders`,
              message: "Tap to upgrade for unlimited.",
              type: "warning",
              durationMs: 4000,
              onPress: openPaywall,
            });
          },
          onPremiumBlocked: () => {
            setShowComposer(false);
            openIntervalPaywall();
          },
          onCreated: () => setShowComposer(false),
        });
      } catch (error: any) {
        // The sheet stays open with the sentence still in it — retrying should
        // not mean retyping.
        console.log("[VR] Typed reminder failed:", error);
        perfLog(traceId, "device.processing", "typed_action_error", { error: String(error) });
        Alert.alert(
          "Error",
          "Failed to create your reminder. Check your internet connection and try again."
        );
      } finally {
        setIsComposerSubmitting(false);
      }
    },
    [
      composerTraceId,
      processTypedReminder,
      applyTakeResult,
      toast,
      openPaywall,
      openIntervalPaywall,
    ]
  );

  // Kicked off by RecordingOverlay the moment the mic is cleared to start, so
  // the upload-URL round trip overlaps the user talking (OLD-106). Deliberately
  // swallows its own failure: this is an optimization, and the stop path can
  // always fetch a URL itself.
  const handleRecordingStart = useCallback(
    (traceId: string) => {
      const tPrefetch = Date.now();
      uploadUrlRef.current = generateAudioUploadUrl()
        .then(({ uploadUrl }) => {
          perfLog(traceId, "device.recording", "upload_url_prefetch_done", {
            ms: Date.now() - tPrefetch,
          });
          return uploadUrl;
        })
        .catch((e: any) => {
          perfLog(traceId, "device.recording", "upload_url_prefetch_failed", {
            ms: Date.now() - tPrefetch,
            reason: e?.message ?? String(e),
          });
          return null;
        });
    },
    [generateAudioUploadUrl]
  );

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

      // Owning install for the reminder the backend is about to create (OLD-74).
      const deviceId = await getDeviceId();

      let result: any;
      let usedFastPath = false;

      // Try FAST PATH: binary upload + async TTS
      try {
        perfLog(traceId, "device.processing", "upload_start");
        // Claim the URL prefetched at record time (OLD-106). Single-use, so the
        // ref is cleared whether or not the fetch succeeded; a null result (the
        // prefetch failed, or recording started before this screen wired it up)
        // falls back to fetching one here, exactly as it used to.
        const prefetchedUploadUrl = uploadUrlRef.current;
        uploadUrlRef.current = null;
        let uploadUrl = prefetchedUploadUrl ? await prefetchedUploadUrl : null;
        if (uploadUrl) {
          perfLog(traceId, "device.processing", "upload_url_prefetch_hit");
        } else {
          perfLog(traceId, "device.processing", "upload_url_prefetch_miss");
          uploadUrl = (await generateAudioUploadUrl()).uploadUrl;
        }
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
        });
        perfLog(traceId, "device.processing", "processVoiceReminderFast_done", {
          ms: Date.now() - tAction,
        });
        usedFastPath = true;
      } catch (fastPathError) {
        // FALLBACK: use base64 path.
        //
        // This is the most expensive branch in the app and until OLD-106 it was
        // completely silent. processVoiceReminder blocks the reminder row on the
        // full sequential TTS ladder (+4-10s) where the fast path defers it, so
        // a user who lands here waits several times as long — and the only
        // evidence was a console.log, which release builds do not ship (OLD-77
        // turned off console streaming outside dev, and perfLog is __DEV__-gated
        // too). Sentry is the one channel that survives to production, so the
        // fallback reports itself as a real event.
        //
        // No transcript, no reminder text, no audio: the tags below are the
        // shape of the failure, not its content (sendDefaultPii is off and this
        // path must not become the exception).
        console.log("[VR] Fast path failed, falling back to base64:", fastPathError);
        perfLog(traceId, "device.processing", "fallback_to_base64", {
          reason: (fastPathError as any)?.message ?? String(fastPathError),
        });
        Sentry.captureException(fastPathError, {
          tags: {
            vr_event: "voice_fallback_base64",
            vr_stage: "processVoiceReminderFast",
          },
          extra: { traceId },
          level: "warning",
        });

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

      await applyTakeResult(result, {
        traceId,
        usedFastPath,
        onCapBlocked: (activeCount, limit) => showLimitLockedOverlay(traceId, activeCount, limit),
        onPremiumBlocked: () => {
          setShowRecording(false);
          openIntervalPaywall();
        },
        onCreated: () => setShowRecording(false),
      });
    } catch (error: any) {
      console.error("[VR] Processing error:", error);

      // If we somehow got gated at the store level (race, legacy path), reset overlay to locked state.
      if (error?.name === "ReminderLimitExceededError") {
        const currentCount = Number.isFinite(error?.currentCount) ? error.currentCount : reminders.length;
        const limit = Number.isFinite(error?.limit) ? error.limit : getFreeActiveLimit();
        showLimitLockedOverlay(traceId, currentCount, limit);
        return;
      }

      setShowRecording(false);

      Alert.alert(
        "Error",
        "Failed to process your reminder. Check your internet connection and try again."
      );
    }
  };

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

  // ---- Today page membership (see docs/ui-redesign.md) ----
  // Today's own date, plus everything still owed from a ring that already
  // passed — a one-off stays owed until it is ticked (OLD-118).
  const todayDate = todayISO(nowMs);

  const { overdue: overdueReminders, today: todayReminders } = useMemo(() => {
    return groupTodayReminders(activeReminders, history, todayDate, nowMs);
  }, [activeReminders, history, todayDate, nowMs]);

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
        subtitle: formatClockAt(entry.timestamp),
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

  // Overdue rows carry the date they were meant to ring, not "9:00 am" — the
  // whole point of the group is that the ring is behind the user, not ahead.
  const overdueItems = useMemo(() => {
    return overdueReminders.map((item) => ({
      id: item.id,
      title: item.title,
      emoji: item.emoji,
      chipColor: chipColorForId(item.id),
      subtitle: overdueSubtitle(item, history, nowMs),
      completed: exitingIds.has(item.id),
      onPress: () => {
        recordReminderPressIn(item.id);
        handleReminderPress(item);
      },
      onToggleComplete: () => {
        if (!exitingIds.has(item.id)) {
          handleMarkDone(item.id, item.title);
        }
      },
      onDelete: () => handleDelete(item),
    }));
  }, [
    overdueReminders,
    history,
    nowMs,
    exitingIds,
    recordReminderPressIn,
    handleReminderPress,
    handleMarkDone,
    handleDelete,
  ]);

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
                <TouchableOpacity
                  style={styles.addButton}
                  activeOpacity={0.85}
                  onPress={() => void handleOpenComposer()}
                  accessibilityRole="button"
                  accessibilityLabel="Add a reminder by typing"
                >
                  <Plus size={20} color={colors.textHeading} strokeWidth={2} />
                </TouchableOpacity>
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
            ListHeaderComponent={<OverdueSection items={overdueItems} />}
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
      {!showRecording && !showComposer && !editingReminder && (
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

          <BottomBar
            activeTab={activeTab}
            onTab={handleTab}
            onRecord={handleOpenRecording}
          />
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
        onRecordingStart={handleRecordingStart}
        onRecordingComplete={handleRecordingComplete}
        onCancelProcessing={handleCancelProcessing}
      />

      {/* Typed composer — same parse, same sheet, no microphone (OLD-101) */}
      <ComposerSheet
        visible={showComposer}
        submitting={isComposerSubmitting}
        onSubmit={(text) => void handleComposerSubmit(text)}
        onSpeak={handleComposerSpeak}
        onDismiss={handleComposerDismiss}
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
  // Tiimo-style header +: quiet white circle, top-right. The composer's only door.
  addButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.card,
    alignItems: "center",
    justifyContent: "center",
    ...shadows.card,
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
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
