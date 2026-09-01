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
import {
  copyAsync,
  deleteAsync,
  documentDirectory,
  getInfoAsync,
} from "expo-file-system/legacy";
import { uploadRecordingToConvex } from "../lib/convexUpload";
import { scheduleReminder } from "../lib/notifications";
import { hydrateReminderAudio } from "../lib/audioHydration";
import { getDeviceId } from "../lib/deviceId";
import {
  persistReminders,
  useReminderStore,
  withCreationLock,
  Reminder,
} from "../lib/store";
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
import {
  createTraceId,
  dropCreationRun,
  logCreationServerPerf,
  markCreation,
  perfLog,
  recordTap,
  startStallMonitor,
} from "../lib/perf";
import { creationBreadcrumb } from "../lib/sentry";
import { getActiveReminderCount, getFreeActiveLimit } from "../lib/usage";
import {
  describeTakeOutcome,
  extractTakeItems,
  intakeTakeReminders,
  isPremiumTakeItem,
  planTakeAllowance,
  scheduleTakeReminders,
} from "../lib/voiceTake";
import { deviceClock, submitTypedTake } from "../lib/typedTake";
import {
  errorKindForServerCode,
  getPendingTake,
  loadPendingTakes,
  newPendingTake,
  putPendingTake,
  removePendingTake,
  resolveRecordingLocation,
  updatePendingTake,
  type PendingTake,
} from "../lib/pendingTakes";
import { commitTake, type CommitTakeOutcome, type TakeImportSummary } from "../lib/takeCommit";
import {
  abandonOrphanBlob,
  cancelTake,
  configureReconcile,
  discardTake,
  enqueueAllPendingTakes,
  enqueueReconcile,
  retryTake,
} from "../lib/takeReconcile";
import { watchCreationJob, type CreationJobWatchHandle } from "../lib/creationJobWatch";
import PendingTakeCard, { usePendingTakes } from "../components/PendingTakeCard";
import { isReminderActive } from "../lib/reminderActive";
import { removeReminderFully } from "../lib/reminderRemoval";
import { historyOnDay, todayISO } from "../lib/dayOccurrences";
import { groupTodayReminders, overdueSubtitle } from "../lib/todayMembership";
import { formatClockAt } from "../lib/time";
import { checkProStatus, forceRefreshProStatus, getProStatusSnapshot } from "../lib/purchases";
import { resolveImportProStatus } from "../lib/proStatusResolve";
import {
  getCapGateBlockContent,
  resolveCapGateOutcome,
  type CapGateBlock,
} from "../lib/usageGate";
import NetInfo from "@react-native-community/netinfo";

// Pager pages: 0 = Today, 1 = Days, 2 = Settings (see docs/ui-redesign.md gesture map).
const PAGE_TODAY = 0;
const PAGE_DAYS = 1;
const PAGE_SETTINGS = 2;

// ─── The take's recording on disk (spec §2.1) ───────────────────────────────
// expo-av writes into the cache directory, which the OS may reclaim whenever it
// likes. A take can outlive several app launches, so its recording is copied
// somewhere durable at stop-tap; a copy that fails is survivable (the cache
// file is still there right now) and marks the take `fragileUri` (D10).

function recordingPathFor(creationId: string): string | null {
  if (!documentDirectory) return null;
  return `${documentDirectory}take_${creationId}.m4a`;
}

async function copyRecordingToDocuments(
  creationId: string,
  cacheUri: string
): Promise<string | null> {
  const to = recordingPathFor(creationId);
  if (!to) return null;
  try {
    await copyAsync({ from: cacheUri, to });
    return to;
  } catch (e) {
    console.log("[VR] take: recording copy failed, keeping the cache uri:", e);
    return null;
  }
}

async function recordingFileExists(uri: string): Promise<boolean> {
  try {
    return (await getInfoAsync(uri)).exists;
  } catch {
    return false;
  }
}

async function deleteTakeRecording(take: PendingTake): Promise<void> {
  await deleteAsync(take.recordingUri, { idempotent: true }).catch(() => {});
}

/** The take's idempotency key, and the key its whole perf summary hangs off. */
function createCreationId(): string {
  const rand = () => Math.random().toString(36).slice(2, 10);
  return `${Date.now().toString(36)}${rand()}${rand()}`;
}

// The pending card's three affordances. They capture nothing from the screen —
// every one of them is a module function in lib/takeReconcile — so they live
// out here with a stable identity, which is what lets the memoized card sit
// still through the 30s `nowMs` tick.
const onPendingTakeCancel = (creationId: string) => void cancelTake(creationId);
const onPendingTakeRetry = (creationId: string) => void retryTake(creationId);
const onPendingTakeDiscard = (creationId: string) => void discardTake(creationId);

export default function HomeScreen() {
  const router = useRouter();
  const processTypedReminder = useAction(api.actions.processTypedReminder);
  const generateAudioUploadUrl = useMutation(api.reminders.generateAudioUploadUrl);
  const removeConvexReminder = useMutation(api.reminders.remove);
  // The creation job pipeline (spec §1). The legacy voice actions are gone from
  // this screen — a recording now becomes a job, not a blocking round trip.
  const beginCreationJob = useMutation(api.creationJobs.begin);
  const cancelCreationJob = useMutation(api.creationJobs.cancel);
  const retryCreationJob = useMutation(api.creationJobs.retry);
  const discardCreationJob = useMutation(api.creationJobs.discard);
  const ackCreationJob = useMutation(api.creationJobs.ack);
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
  const loadHistory = useReminderStore((state) => state.loadHistory);
  const hasLoadedReminders = useReminderStore((state) => state.hasLoadedReminders);

  const activeReminders = useMemo(() => {
    return reminders.filter((r) => isReminderActive(r, history, nowMs));
  }, [reminders, history, nowMs]);

  // The pending card's unverified-entitlement copy is the cap gate's own, and
  // that sentence names the limit.
  const freeLimit = getFreeActiveLimit();

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
  // Takes still on their way to becoming reminders (spec §2.3). Never in the
  // reminders store, so never counted, scheduled, or swiped as one.
  const pendingTakes = usePendingTakes();
  // One entry per creationId we have taken responsibility for. `null` is a
  // reservation held across the async setup below — it is what makes the guard
  // in subscribeToJob a single check rather than a race (see there).
  const watchesRef = useRef(new Map<string, CreationJobWatchHandle | null>());
  const [isConnected, setIsConnected] = useState(true);
  const [showOfflineMessage, setShowOfflineMessage] = useState(false);

  // Upgrade CTA: hidden for subscribers. Anything short of a confirmed "pro"
  // leaves the pill up, which keeps the paywall reachable even while the gate
  // below is refusing to guess.
  const [isPro, setIsPro] = useState(() => getProStatusSnapshot() === "pro");

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
    (traceId: string, block: CapGateBlock, currentCount: number, limit: number) => {
      // Two locks share this overlay state. The upgrade lock offers the CTA;
      // the unverified lock deliberately doesn't — we can't tell whether this
      // user already pays, so the only honest ask is for a connection.
      const content = getCapGateBlockContent(block, limit);
      setCanStartRecording(false);
      setGateStatusText(content.statusText);
      setShowUpgradeCta(content.offersUpgrade);
      // gate_blocked_limit keeps its name — the existing traces are read by it.
      perfLog(
        traceId,
        "ui.recording",
        block === "blocked_unverified" ? "gate_blocked_unverified" : "gate_blocked_limit",
        { currentCount, limit }
      );
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
    // overlay. An unresolved entitlement still grants nothing — it just gets
    // its own lock (and its own copy) instead of an upgrade pitch, and the
    // refresh behind it settles which lock the user ends up looking at.
    const limit = getFreeActiveLimit();
    const proStatus = getProStatusSnapshot();
    const cachedPro = proStatus === "pro";
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
      proStatus,
      hasLoadedReminders,
    });

    const gate = resolveCapGateOutcome(proStatus, currentCount, limit);
    if (gate === "allow") {
      setCanStartRecording(true);
      setGateStatusText(undefined);
      perfLog(traceId, "ui.recording", "gate_allowed_cached", { cachedPro });
      return;
    }

    // At the cap without a confirmed subscription. The only way the cache is
    // wrong here is a subscription bought on another device, or a check that
    // never landed, so the store gets asked behind the lock rather than in
    // front of it — the overlay is already up and resolves in place.
    lockRecordingForLimit(traceId, gate, currentCount, limit);

    const tRefresh = Date.now();
    void forceRefreshProStatus().then((settledStatus) => {
      perfLog(traceId, "ui.recording", "gate_refresh_done", {
        ms: Date.now() - tRefresh,
        isPro: settledStatus === "pro",
        proStatus: settledStatus,
      });
      if (gateTraceRef.current !== traceId) return;

      const settled = resolveCapGateOutcome(settledStatus, currentCount, limit);
      if (settled === "allow") {
        setIsPro(true);
        setCanStartRecording(true);
        setGateStatusText(undefined);
        setShowUpgradeCta(false);
        perfLog(traceId, "ui.recording", "gate_unlocked_after_refresh", { currentCount, limit });
        return;
      }
      // Still blocked, but possibly for a different reason than a moment ago:
      // a check that has now come back "free" turns the "can't verify" lock
      // into the real upgrade pitch. A still-unresolved one changes nothing.
      if (settled !== gate) {
        lockRecordingForLimit(traceId, settled, currentCount, limit);
      }
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

  /**
   * Schedule every reminder a take produced.
   *
   * One reminder that won't schedule must not cost its siblings their alarms,
   * so each is scheduled on its own. `onSettled` fires once every attempt has
   * finished, success or logged failure — which is what `armedAt` means (C18).
   */
  const scheduleCreatedReminders = useCallback(
    (created: Reminder[], traceId: string, onSettled?: () => void) => {
      InteractionManager.runAfterInteractions(() => {
        perfLog(traceId, "device.notifications", "scheduleReminder_start", {
          count: created.length,
        });
        let promptedForExactAlarm = false;
        void scheduleTakeReminders(
          created,
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
        ).finally(() => onSettled?.());
      });
    },
    [storeUpdateReminder]
  );

  /** Fire-and-forget audio hydration for one imported row. */
  const startHydration = useCallback(
    (reminder: Reminder, convexId: string) => {
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
    [storeUpdateReminder]
  );

  /**
   * What a parsed take becomes: re-gated against the free cap, stored, hydrated,
   * scheduled, and then either opened in the edit sheet or summed up in a toast.
   *
   * THE TYPED COMPOSER'S PATH, and now only that (C8). Voice moved to the job
   * pipeline below, which imports rows the server already created and never
   * auto-opens the edit sheet; this loop keeps the legacy action, the legacy
   * intake and the auto-open exactly as they were, because the composer's
   * behavior is not what this wave is changing.
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
            startHydration(reminder, convexId);
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

      scheduleCreatedReminders(outcome.created, traceId);

      return true;
    },
    [
      storeAddReminder,
      startHydration,
      scheduleCreatedReminders,
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
    const proStatus = getProStatusSnapshot();
    const cachedPro = proStatus === "pro";
    if (!hasLoadedReminders && !cachedPro) {
      await loadReminders().catch(() => {});
    }
    const currentCount = getActiveReminderCount();

    const gate = resolveCapGateOutcome(proStatus, currentCount, limit);
    if (gate !== "allow") {
      // The composer has no locked state of its own, so a blocked user gets a
      // toast rather than an empty field they can't send. That also means
      // there is no open surface for a late refresh to unlock the way the
      // mic's overlay gets unlocked — so the refresh here only heals the
      // cache: whichever way it settles, the next tap gets the right answer.
      const content = getCapGateBlockContent(gate, limit);
      perfLog(
        traceId,
        "ui.composer",
        gate === "blocked_unverified" ? "gate_blocked_unverified" : "gate_blocked_limit",
        { currentCount, limit }
      );
      toast.show({
        title: content.toastTitle,
        message: content.toastMessage,
        type: "warning",
        durationMs: 4000,
        // No paywall route on the unverified block — that is the wrong place
        // to send someone who may already be a subscriber.
        onPress: content.offersUpgrade ? openPaywall : undefined,
      });

      const tRefresh = Date.now();
      void forceRefreshProStatus().then((settledStatus) => {
        perfLog(traceId, "ui.composer", "gate_refresh_done", {
          ms: Date.now() - tRefresh,
          isPro: settledStatus === "pro",
          proStatus: settledStatus,
        });
        if (settledStatus === "pro") setIsPro(true);
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

  // ─── Voice takes: the creation-job pipeline (spec §2.2) ───────────────────

  /**
   * Watch one job (spec §2.7). One subscription per creationId, ever.
   *
   * The handlers here only move the CARD. Every decision that touches reminders
   * is handed to reconciliation, which is the single place that knows how to
   * combine a local phase with a server status.
   */
  const subscribeToJob = useCallback(async (take: PendingTake) => {
    const creationId = take.creationId;
    // Reserved SYNCHRONOUSLY, before the first await. The stop-tap path and a
    // reconciliation pass can both reach this line in the same tick; a `has`
    // check re-run on the far side of `getDeviceId()` lets both through, and
    // the second watch is then unreachable — nothing holds its handle, so
    // nothing can ever dispose it. The null placeholder makes the one check
    // above the only guard this needs.
    if (watchesRef.current.has(creationId)) return;
    watchesRef.current.set(creationId, null);

    let deviceId: string;
    try {
      deviceId = await getDeviceId();
    } catch (error) {
      // The reservation must not outlive the failure, or the take can never be
      // watched again this launch.
      watchesRef.current.delete(creationId);
      console.log("[VR] take: could not subscribe to the job:", error);
      return;
    }

    const handle = watchCreationJob({
      convexClient: convex,
      deviceId,
      creationId,
      onUpdate: async (job) => {
        if (job === null) {
          enqueueReconcile(creationId);
          return;
        }
        if (job.status === "transcribed") {
          markCreation(creationId, "transcriptAt");
          // The job document is pushed again for every field the worker
          // touches — perf patches, updatedAt — while the status sits at
          // `transcribed`. Rewriting the whole outbox to the bytes it already
          // holds is an AsyncStorage write and a card re-render for nothing.
          const current = getPendingTake(creationId);
          const settled =
            current?.phase === "transcribed" &&
            (job.transcript === undefined || current.transcript === job.transcript);
          if (settled) return;

          creationBreadcrumb("transcribed");
          await updatePendingTake(creationId, "transcribed", {
            ...(job.transcript ? { transcript: job.transcript } : {}),
          });
          return;
        }
        if (job.status === "committed") {
          markCreation(creationId, "committedAt");
          creationBreadcrumb("committed");
          enqueueReconcile(creationId);
          return;
        }
        if (job.status === "failed") {
          const errorKind = errorKindForServerCode(job.errorCode);
          creationBreadcrumb("job_failed", errorKind);
          dropCreationRun(creationId);
          await updatePendingTake(creationId, "failed", {
            errorKind,
            ...(job.errorCode ? { serverErrorCode: job.errorCode } : {}),
          });
          return;
        }
        if (job.status === "cancelled") {
          creationBreadcrumb("job_cancelled");
          dropCreationRun(creationId);
          await removePendingTake(creationId);
          await deleteTakeRecording(take);
        }
      },
      onLocalFailure: async (errorKind) => {
        creationBreadcrumb("watch_gave_up", errorKind);
        await updatePendingTake(creationId, "failed", { errorKind }).catch(() => {});
        // The watchdog gave up at 90s; the job may still commit at 95. Hand the
        // take to reconciliation now rather than leaving it for the next
        // foreground — the dispatch table already turns failed + committed into
        // an import, so the card heals itself instead of waiting for a tap.
        if (errorKind === "network") enqueueReconcile(creationId);
      },
      onServerPerf: (perf) => logCreationServerPerf(creationId, perf),
    });

    watchesRef.current.set(creationId, handle);
    void handle.done.finally(() => {
      watchesRef.current.delete(creationId);
    });
  }, []);

  /**
   * The detached half of stop-tap: bytes up, job begun, subscription open.
   *
   * The phase is re-read immediately before `begin` because the user can cancel
   * from the card while the upload is still in flight — in which case the blob
   * belongs to nobody and is handed straight to the server for deletion (C4).
   */
  const uploadAndBegin = useCallback(
    async (take: PendingTake, claimedUploadUrl: Promise<string | null> | null) => {
      const creationId = take.creationId;
      try {
        await updatePendingTake(creationId, "uploading");
        markCreation(creationId, "uploadStart");
        creationBreadcrumb("upload_start");

        let uploadUrl = claimedUploadUrl ? await claimedUploadUrl : null;
        if (!uploadUrl) {
          uploadUrl = (await generateAudioUploadUrl()).uploadUrl;
        }
        const { storageId } = await uploadRecordingToConvex(uploadUrl, take.recordingUri);
        markCreation(creationId, "uploadDone");
        creationBreadcrumb("upload_done");

        const deviceId = await getDeviceId();
        const live = getPendingTake(creationId);
        if (!live || live.phase === "cancelling") {
          creationBreadcrumb("orphan_blob");
          void abandonOrphanBlob(creationId, storageId);
          return;
        }

        const stamped = await updatePendingTake(creationId, "uploading", {
          audioStorageId: storageId,
        });
        markCreation(creationId, "beginCalled");
        await beginCreationJob({
          deviceId,
          creationId,
          audioStorageId: storageId as any,
          localDate: take.localDate,
          localTime: take.localTime,
          timezone: take.timezone,
        });
        creationBreadcrumb("job_begun");

        const processing = await updatePendingTake(creationId, "processing", {
          audioStorageId: storageId,
        });
        void subscribeToJob(processing ?? stamped ?? take);
      } catch (error) {
        // A `fragileUri` recording that is simply gone is not a network problem,
        // and retrying the upload will never fix it (D10).
        const gone =
          take.fragileUri === true && !(await recordingFileExists(take.recordingUri));
        const errorKind = gone ? ("server" as const) : ("network" as const);
        console.log("[VR] take: upload/begin failed:", error);
        creationBreadcrumb("upload_failed", errorKind);
        await updatePendingTake(creationId, "failed", { errorKind }).catch(() => {});
      }
    },
    [generateAudioUploadUrl, beginCreationJob, subscribeToJob]
  );

  /**
   * Stop-tap.
   *
   * Everything up to "close the overlay" is ONE AsyncStorage write, because the
   * whole point of the wave is that the card is on screen before anything slow
   * is consulted. The documents-dir copy is slow — it is a file copy of up to
   * two minutes of audio — so it does not run here: the take is persisted
   * against the cache URI as `fragileUri` (which §2.1 already knows how to
   * survive), and the copy upgrades it in place afterwards. The upload, the job
   * and the subscription all happen afterwards too, detached, and the take
   * outlives the screen — a kill here costs a reconciliation pass, not a
   * reminder.
   */
  const handleRecordingComplete = useCallback(
    async (audioUri: string, traceId: string, stopTapAt?: number) => {
      const creationId = createCreationId();
      const startedAt = stopTapAt ?? Date.now();
      markCreation(creationId, "stopTap", startedAt);
      markCreation(creationId, "stopRecordingDone");
      creationBreadcrumb("stop_tap");
      perfLog(traceId, "device.processing", "take_stop_tap", { creationId });

      // Claim-and-clear the prefetched upload URL INTO THIS TAKE (C11). A URL
      // from generateUploadUrl is single-use, and leaving it on the ref would
      // hand a spent one to whatever the user records next.
      const claimedUploadUrl = uploadUrlRef.current;
      uploadUrlRef.current = null;

      const clock = deviceClock(
        new Date(startedAt),
        Intl.DateTimeFormat().resolvedOptions().timeZone
      );

      // The cache file is there RIGHT NOW; what it is not is durable. The take
      // starts out pointing at it, marked fragile, and the copy below promotes
      // it to the documents dir off the hot path.
      const take = newPendingTake({
        creationId,
        recordingUri: audioUri,
        fragileUri: true,
        localDate: clock.deviceLocalDate,
        localTime: clock.deviceLocalTime,
        timezone: clock.deviceTimezone,
        createdAt: startedAt,
      });

      // One retry, then the legacy blocking error path: nothing optimistic is
      // on screen yet, so there is no card to fail into.
      let persisted = true;
      try {
        await putPendingTake(take);
      } catch {
        try {
          await putPendingTake(take);
        } catch (error) {
          persisted = false;
          console.log("[VR] take: could not persist the outbox entry:", error);
        }
      }
      if (!persisted) {
        dropCreationRun(creationId);
        setShowRecording(false);
        Alert.alert(
          "Error",
          "Couldn't save your recording. Check your device storage and try again."
        );
        return;
      }

      setShowRecording(false);
      markCreation(creationId, "cardVisible");
      creationBreadcrumb("card_visible");

      // Detached, in order: make the recording durable, then send it. A copy
      // that fails leaves the take exactly as it was persisted — cache URI,
      // still fragile — which is the state §2.1's rules are written for.
      void (async () => {
        const copiedUri = await copyRecordingToDocuments(creationId, audioUri);
        const { recordingUri, fragileUri } = resolveRecordingLocation({
          cacheUri: audioUri,
          copiedUri,
        });

        // The card has been on screen for the whole of that copy, so plenty can
        // have happened to the take: the user can have cancelled it, and a
        // reconciliation pass (a foreground, say) can have picked it up and
        // resumed the upload itself. Only a take still sitting at
        // `recording_saved` belongs to this block; anything else already has an
        // owner, and uploading it again would be a second copy of the same
        // take. The documents file this block just made is swept up on the way
        // out either way — nothing else knows it exists.
        const current = getPendingTake(creationId);
        if (current?.phase !== "recording_saved") {
          if (!fragileUri) await deleteAsync(recordingUri, { idempotent: true }).catch(() => {});
          return;
        }

        let live = current;
        if (!fragileUri) {
          const upgraded = await updatePendingTake(creationId, "recording_saved", {
            recordingUri,
            fragileUri: false,
          }).catch(() => null);
          // The take could not be pointed at the durable copy (it moved on
          // between the read above and this write, or the write itself failed),
          // so the copy is an orphan and the take keeps its cache URI for
          // whoever does own it.
          if (!upgraded) {
            await deleteAsync(recordingUri, { idempotent: true }).catch(() => {});
            return;
          }
          live = upgraded;
        }

        await uploadAndBegin(live, claimedUploadUrl);
      })();
    },
    [uploadAndBegin]
  );

  /** What a landed import does to the screen: animate, toast, schedule, hydrate. */
  const onTakeImported = useCallback(
    (take: PendingTake, created: Reminder[], summary: TakeImportSummary) => {
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);

      // Nothing survived a gate. The pending card has already gone, so this is
      // the ONLY surface left that can say why — without it a free user at the
      // cap, or one who asked for an interval reminder, watches the card
      // vanish and gets nothing. Same two landings the legacy and typed paths
      // use, in the same order: the interval "no" is the more specific of the
      // two, and the cap is a number they can also read off the list.
      if (summary.created === 0) {
        markCreation(take.creationId, "armedAt");
        if (summary.blockedPremium > 0) {
          creationBreadcrumb("import_blocked_premium");
          openIntervalPaywall();
          return;
        }
        if (summary.dropped > 0) {
          creationBreadcrumb("import_blocked_cap");
          // The pinned cap copy, shared with the composer toast and the
          // recording overlay's lock (C16) — not a fourth wording of it.
          const content = getCapGateBlockContent("blocked_upgrade", summary.limit);
          toast.show({
            title: content.toastTitle,
            message: content.toastMessage,
            type: "warning",
            durationMs: 4000,
            onPress: openPaywall,
          });
          return;
        }
        // Defensive: with neither gate biting there is nothing to keep and no
        // reason for it, so the legacy path's own error sentence stands in
        // rather than a new one being invented for it.
        creationBreadcrumb("import_produced_nothing");
        toast.show({
          title: "Error",
          message: "Failed to process your reminder. Check your internet connection and try again.",
          type: "error",
          durationMs: 4000,
        });
        return;
      }

      const feedback = describeTakeOutcome({
        created: summary.created,
        dropped: summary.dropped,
        blockedPremium: summary.blockedPremium,
        failed: 0,
        total: summary.total,
        limit: summary.limit,
      });
      if (feedback) {
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
      }
      // No edit sheet on this path: the rows simply appear (spec §2.4).

      scheduleCreatedReminders(created, take.creationId, () => {
        markCreation(take.creationId, "armedAt");
        creationBreadcrumb("armed");
      });

      for (const reminder of created) {
        if (reminder.convexId) startHydration(reminder, reminder.convexId);
      }
    },
    [toast, openPaywall, openIntervalPaywall, scheduleCreatedReminders, startHydration]
  );

  /**
   * Import one committed take.
   *
   * The store-level creation lock (C9) is handed to `commitTake` as a seam
   * rather than wrapped around this whole call: the job read and the
   * entitlement check are network work with no timeout, and holding the lock
   * across them would stall legacy `addReminder` — the typed composer's Save
   * button spinning until the network came back. `commitTake` takes the lock
   * for the local validate/upsert/persist/cleanup half only, and re-reads the
   * active count once it holds it.
   */
  const importCommittedTake = useCallback(
    async (take: PendingTake): Promise<CommitTakeOutcome> => {
      const deviceId = await getDeviceId();
      const readRows = () =>
        convex.query(api.creationJobs.getReminders, {
          deviceId,
          creationId: take.creationId,
        }) as Promise<any>;

      markCreation(take.creationId, "importStart");
      const outcome = await commitTake({
        take,
        deps: {
          fetchRows: readRows,
          proStatus: resolveImportProStatus,
          withLock: withCreationLock,
          activeCount: getActiveReminderCount,
          limit: getFreeActiveLimit(),
          storeSnapshot: () => useReminderStore.getState().reminders,
          applyStore: (rows) => useReminderStore.setState({ reminders: rows }),
          persistStore: persistReminders,
          newLocalId: () => Math.random().toString(36).substr(2, 9),
          now: Date.now,
          markCommitting: async () => {
            await updatePendingTake(take.creationId, "committing");
          },
          markCapUnverified: async () => {
            dropCreationRun(take.creationId);
            await updatePendingTake(take.creationId, "failed", {
              errorKind: "cap_unverified",
            });
          },
          removeTake: () => removePendingTake(take.creationId),
          deleteRecording: () => deleteTakeRecording(take),
          ack: async () => {
            await ackCreationJob({ deviceId, creationId: take.creationId });
          },
          deleteServerRow: async (id) => {
            await removeConvexReminder({ id: id as any, deviceId });
          },
          wait: (ms) => new Promise<void>((resolve) => setTimeout(resolve, ms)),
          onImported: (created, summary) => onTakeImported(take, created, summary),
          onStage: (stage, data) =>
            creationBreadcrumb(stage, data?.errorKind as string | undefined),
        },
      });
      markCreation(take.creationId, "importDone");
      return outcome;
    },
    [ackCreationJob, removeConvexReminder, onTakeImported]
  );

  // Reconciliation needs every one of the seams above, so it is handed them
  // here and re-handed them whenever one changes identity. Wiring only — the
  // sweep is its own effect below, so a gate-state change cannot start one.
  useEffect(() => {
    configureReconcile({
      getDeviceId,
      fetchJob: (deviceId, creationId) =>
        convex.query(api.creationJobs.get, { deviceId, creationId }) as Promise<any>,
      begin: (args) => beginCreationJob(args as any) as Promise<any>,
      cancel: (args) => cancelCreationJob(args as any) as Promise<any>,
      serverRetry: (args) => retryCreationJob(args as any) as Promise<any>,
      discard: (args) => discardCreationJob(args) as Promise<any>,
      uploadRecording: async (take) => {
        // A recording that is not there cannot be uploaded, and saying so is
        // what routes the take to "Record again" instead of a doomed retry.
        if (!(await recordingFileExists(take.recordingUri))) return null;
        const { uploadUrl } = await generateAudioUploadUrl();
        const { storageId } = await uploadRecordingToConvex(uploadUrl, take.recordingUri);
        return storageId;
      },
      recordingExists: (take) => recordingFileExists(take.recordingUri),
      importTake: importCommittedTake,
      subscribe: (take) => {
        void subscribeToJob(take);
      },
      deleteRecording: deleteTakeRecording,
      storeHasCreationId: (creationId) =>
        useReminderStore.getState().reminders.some((r) => r.creationId === creationId),
      // Three independent reads off three AsyncStorage keys. Nothing here
      // depends on anything else here, so they go together — the barrier is
      // "all three have landed", not "one after another".
      loadBarrier: async () => {
        await Promise.all([
          loadPendingTakes(),
          loadReminders().catch(() => {}),
          loadHistory().catch(() => {}),
        ]);
      },
      onRecordAgain: () => {
        void handleOpenRecording();
      },
      onStage: (_creationId, stage, data) =>
        creationBreadcrumb(stage, data?.errorKind as string | undefined),
    });
  }, [
    beginCreationJob,
    cancelCreationJob,
    retryCreationJob,
    discardCreationJob,
    generateAudioUploadUrl,
    importCommittedTake,
    subscribeToJob,
    loadReminders,
    loadHistory,
    handleOpenRecording,
  ]);

  // Once per launch: a take that outlived the last one finds its way home
  // (spec §2.5). The queue holds until the wiring above lands, so the order of
  // these two effects is not load-bearing — but it is the honest one.
  useEffect(() => {
    enqueueAllPendingTakes();
  }, []);

  // Every open subscription is dropped with the screen.
  useEffect(() => {
    const watches = watchesRef.current;
    return () => {
      for (const handle of watches.values()) handle?.dispose();
      watches.clear();
    };
  }, []);

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
            ListHeaderComponent={
              <>
                {/* Takes still being made sit above everything, in the order
                    they were recorded (spec §2.3). */}
                {pendingTakes.map((take) => (
                  <PendingTakeCard
                    key={take.creationId}
                    take={take}
                    limit={freeLimit}
                    onCancel={onPendingTakeCancel}
                    onRetry={onPendingTakeRetry}
                    onDiscard={onPendingTakeDiscard}
                  />
                ))}
                <OverdueSection items={overdueItems} />
              </>
            }
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
          {/* Mounted from cold start like every pager page, so it needs to be
              told when it is the one on screen — that is its cue to re-check
              the subscription (same pattern as DaysPage's `active`). */}
          <SettingsContent embedded visible={page === PAGE_SETTINGS} />
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
