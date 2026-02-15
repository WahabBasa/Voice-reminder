import { useEffect, useRef, useState } from "react";
import { InteractionManager } from "react-native";
import { Stack, useRouter } from "expo-router";
import { ConvexProvider, useMutation } from "convex/react";
import { StatusBar } from "expo-status-bar";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { PortalProvider } from "@gorhom/portal";
import ToastProvider, { useToast } from "../components/ToastProvider";
import { initializePurchases } from "../lib/purchases";
import { useReminderStore } from "../lib/store";
import { syncRemindersOnStartup, getPendingAlarm, clearPendingAlarm, markPendingAlarmResolved, enforcePendingAlarmTimeout } from "../lib/notifications";
import { api } from "../convex/_generated/api";
import { removeReminderFully } from "../lib/reminderRemoval";
import { shouldCleanupGhostOnceReminder } from "../lib/reminderActive";
import { vrLog, logBuildInfo } from "../lib/vrLog";
import { logAppTaskState, isAlarmActivity, isKeyguardLocked } from "../lib/activityControl";
import { AlarmOverlay, AlarmOverlayProps } from "../components/AlarmOverlay";
import { buildTraceId } from "../lib/vrLog";
import { convex } from "../lib/convexClient";
import { hydrateReminderAudio } from "../lib/audioHydration";

function StartupTasks() {
  const router = useRouter();
  const toast = useToast();
  const hasSyncedRef = useRef(false);
  const hasCleanedRef = useRef(false);
  const removeConvexReminder = useMutation(api.reminders.remove);

  const reminders = useReminderStore((s) => s.reminders);
  const history = useReminderStore((s) => s.history);
  const loadReminders = useReminderStore((s) => s.loadReminders);
  const loadHistory = useReminderStore((s) => s.loadHistory);

  useEffect(() => {
    // Load reminders early to close cold-start gating window.
    void loadReminders();
    let cancelled = false;
    const task = InteractionManager.runAfterInteractions(async () => {
      try {
        await loadHistory();
      } catch {
        // ignore
      }
      if (cancelled || hasCleanedRef.current) return;
      hasCleanedRef.current = true;

      // Cleanup old one-time reminders that are already completed/missed but still present.
      const store = useReminderStore.getState();
      const nowMs = Date.now();
      const toCleanup = store.reminders.filter((r) => shouldCleanupGhostOnceReminder(r, store.history, nowMs));
      if (toCleanup.length > 0) {
        console.log(`[VR] Startup cleanup: removing ${toCleanup.length} ghost once reminders`);
      }
      for (const r of toCleanup) {
        await removeReminderFully(r.id, {
          removeConvexById: async (id) => {
            await removeConvexReminder({ id: id as any });
          },
        });
      }
    });
    return () => {
      cancelled = true;
      task.cancel();
    };
  }, [loadReminders, loadHistory]);

  useEffect(() => {
    // Only run sync once data is loaded and we haven't synced this session
    if (hasSyncedRef.current || reminders.length === 0) return;
    hasSyncedRef.current = true;

    InteractionManager.runAfterInteractions(async () => {
      console.log("[VR] Starting startup sync...");
      const result = await syncRemindersOnStartup(reminders, history);
      if (result.permissionError) {
        toast.show({
          title: "Alarms may not fire",
          message: "Tap to open diagnostics",
          type: "warning",
          onPress: () => router.push("/diagnostics"),
        });
      }
    });
  }, [reminders, history, router, toast]);

  // Hydrate reminders with pending audio (max 2 concurrent)
  useEffect(() => {
    const pendingReminders = reminders.filter(
      (r) => r.convexId && r.audioStatus === "pending" && !r.audioUrl
    );

    if (pendingReminders.length === 0) return;

    console.log(`[VR] Startup: ${pendingReminders.length} reminders need audio hydration`);

    // Cap concurrency at 2
    const toHydrate = pendingReminders.slice(0, 2);

    for (const reminder of toHydrate) {
      if (!reminder.convexId) continue;

      hydrateReminderAudio({
        convexClient: convex,
        convexId: reminder.convexId,
        localReminderId: reminder.id,
        updateLocal: async (patch) => {
          const store = useReminderStore.getState();
          const current = store.getReminderById(reminder.id);
          if (current) {
            await store.updateReminder({ ...current, ...patch });
          }
        },
      }).catch((e) => {
        console.error(`[VR] Startup hydration failed for ${reminder.id}:`, e);
      });
    }
  }, [reminders]);

  return null;
}

/**
 * Fallback alarm overlay for when app is in foreground (MainActivity).
 * Shows AlarmOverlay on top of current screen without navigation.
 * This is the fallback path - primary path is AlarmActivity -> AlarmRoot.
 */
function AlarmOverlayFallback() {
  const [activeAlarm, setActiveAlarm] = useState<AlarmOverlayProps | null>(null);
  const [isInAlarmActivity, setIsInAlarmActivity] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let interval: NodeJS.Timeout | null = null;

    async function poll() {
      if (cancelled) return;
      await enforcePendingAlarmTimeout();

      // If the device is locked, never show the MainActivity fallback overlay.
      // The primary path is Notifee full-screen intent -> AlarmActivity over the lockscreen.
      const locked = await isKeyguardLocked();
      if (locked) {
        setIsInAlarmActivity(false);
        setActiveAlarm((prev) => (prev ? null : prev));
        return;
      }
       
      // Check if we're in AlarmActivity (if so, don't show fallback)
      const inAlarmActivity = await isAlarmActivity();
      setIsInAlarmActivity(inAlarmActivity);
       
      if (inAlarmActivity) {
        // Primary path is handling this, hide fallback
        setActiveAlarm((prev) => (prev ? null : prev));
        return;
      }

      const pending = await getPendingAlarm();
      if (cancelled) return;

      if (!pending || pending.resolvedAt) {
        setActiveAlarm((prev) => {
          if (!prev) return prev;
          vrLog('alarm_overlay_fallback', 'alarm_cleared', { 
            notificationId: pending?.notification?.id,
            resolvedAt: pending?.resolvedAt,
          });
          return null;
        });
        return;
      }

      // Build overlay props
      const notificationId = pending.notification?.id || "";
      if (!notificationId) return;

      const data: any = pending.notification?.data || {};
      const traceId = buildTraceId(pending.notification);

      const overlayProps: AlarmOverlayProps = {
        notificationId,
        reminderId: String(data?.reminderId ?? ""),
        title: String(data?.title ?? pending.notification?.title ?? ""),
        description: String(data?.description ?? pending.notification?.body ?? ""),
        audioUrl: String(data?.audioUrl ?? ""),
        frequency: String(data?.frequency ?? ""),
        days: String(data?.days ?? ""),
        time: String(data?.time ?? ""),
        intervalDays: String(data?.intervalDays ?? ""),
        snoozeEnabled: String(data?.snoozeEnabled ?? "true"),
        snoozeDuration: String(data?.snoozeDuration ?? "5"),
        volume: String(data?.volume ?? "1"),
        volumeStyle: String(data?.volumeStyle ?? "standard"),
        scheduledFor: String(data?.scheduledFor ?? ""),
        intervalMs: String(data?.intervalMs ?? ""),
        anchorAt: String(data?.anchorAt ?? ""),
        kind: String(data?.kind ?? ""),
        autoSnoozeCount: String(data?.autoSnoozeCount ?? "0"),
        // Fallback resolve behavior (pastebin Step 4.2):
        // - mark pending resolved + clear pending
        // - stop audio
        // - cancel displayed alarm notifications
        // - hide overlay (set state null)
        // - do NOT call finishCurrentTask() / exitApp()
        onDismiss: async () => {
          vrLog('alarm_overlay_fallback', 'resolve_start', { traceId, notificationId, action: 'dismiss' });
          await markPendingAlarmResolved(notificationId, "dismiss");
          await clearPendingAlarm();
          setActiveAlarm(null);
          vrLog('alarm_overlay_fallback', 'resolve_complete', { traceId, notificationId, action: 'dismiss' });
        },
        onSnooze: async () => {
          vrLog('alarm_overlay_fallback', 'resolve_start', { traceId, notificationId, action: 'snooze' });
          await markPendingAlarmResolved(notificationId, "snooze");
          await clearPendingAlarm();
          setActiveAlarm(null);
          vrLog('alarm_overlay_fallback', 'resolve_complete', { traceId, notificationId, action: 'snooze' });
        },
        shouldExitOnResolve: false, // Don't exit app in fallback mode
      };

      setActiveAlarm((prev) => {
        if (prev?.notificationId === overlayProps.notificationId) return prev;
        vrLog('alarm_overlay_fallback', 'alarm_ui_showing', {
          notificationId: overlayProps.notificationId,
          traceId,
        });
        return overlayProps;
      });
    }

    // Poll immediately and then every 500ms
    void poll();
    interval = setInterval(() => {
      void poll();
    }, 500);

    return () => {
      cancelled = true;
      if (interval) clearInterval(interval);
    };
  }, []);

  // Only render if we have an active alarm and we're NOT in AlarmActivity
  if (!activeAlarm || isInAlarmActivity) return null;

  return <AlarmOverlay {...activeAlarm} />;
}

export default function RootLayout() {
  useEffect(() => {
    // Log build info first to detect stale bundles
    logBuildInfo();
    
    // Log router root mount (pastebin Step 4.4)
    vrLog('router', 'root_mounted', { rootType: 'expo-router', component: 'main' });
    void logAppTaskState('router_root_mounted');
    
    // Defer RevenueCat initialization to not block app startup
    const task = InteractionManager.runAfterInteractions(() => {
      void initializePurchases();
    });
    return () => task.cancel();
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <PortalProvider>
        <SafeAreaProvider>
          <ConvexProvider client={convex}>
            <ToastProvider>
              <StartupTasks />
              <StatusBar style="light" />
              <Stack
                screenOptions={{
                  headerShown: false,
                  animation: "fade",
                  animationDuration: 100,
                  freezeOnBlur: true,
                }}
              >
                <Stack.Screen name="index" options={{ contentStyle: { backgroundColor: "white" } }} />
                <Stack.Screen name="history" options={{ contentStyle: { backgroundColor: "white" } }} />
                <Stack.Screen
                  name="settings"
                  options={{
                    contentStyle: { backgroundColor: "white" },
                    animation: "slide_from_right",
                    animationDuration: 180,
                  }}
                />
                <Stack.Screen
                  name="diagnostics"
                  options={{
                    contentStyle: { backgroundColor: "white" },
                    animation: "slide_from_right",
                    animationDuration: 180,
                  }}
                />
                <Stack.Screen
                  name="reminder/new"
                  options={{
                    animation: "fade",
                    animationDuration: 100,
                    presentation: "modal",
                  }}
                />
                <Stack.Screen
                  name="paywall"
                  options={{
                    animation: "fade",
                    animationDuration: 100,
                    presentation: "modal",
                    contentStyle: { backgroundColor: "white" },
                  }}
                />
              </Stack>
              {/* Fallback alarm overlay for foreground app (pastebin Step 4.1) */}
              <AlarmOverlayFallback />
            </ToastProvider>
          </ConvexProvider>
        </SafeAreaProvider>
      </PortalProvider>
    </GestureHandlerRootView>
  );
}
