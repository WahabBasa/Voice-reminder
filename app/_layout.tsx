import { useEffect, useRef, useState } from "react";
import { AppState, InteractionManager, Platform } from "react-native";
import { Stack, useRouter } from "expo-router";
import { ConvexProvider, ConvexReactClient, useMutation } from "convex/react";
import { StatusBar } from "expo-status-bar";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { PortalProvider } from "@gorhom/portal";
import ToastProvider, { useToast } from "../components/ToastProvider";
import { initializePurchases } from "../lib/purchases";
import notifee, { EventType } from "@notifee/react-native";
import { useReminderStore } from "../lib/store";
import {
  getPendingAlarm,
  setPendingAlarm,
  syncRemindersOnStartup,
  buildAlarmTrace,
  eventTypeName,
  markPendingAlarmResolved,
  clearPendingAlarm,
} from "../lib/notifications";
import { api } from "../convex/_generated/api";
import { removeReminderFully } from "../lib/reminderRemoval";
import { shouldCleanupGhostOnceReminder } from "../lib/reminderActive";
import { AlarmOverlay, AlarmOverlayProps } from "../components/AlarmOverlay";

const convex = new ConvexReactClient(process.env.EXPO_PUBLIC_CONVEX_URL as string);

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

  return null;
}

export default function RootLayout() {
  const router = useRouter();
  const initialNotificationHandledRef = useRef<string | null>(null);
  const lastAlarmRoutedIdRef = useRef<string | null>(null);
  const pendingRouteInFlightRef = useRef(false);
  const [activeAlarm, setActiveAlarm] = useState<AlarmOverlayProps | null>(null);
  const lastBecameActiveRef = useRef<{ at: number; from: string }>({
    at: 0,
    from: AppState.currentState,
  });

  useEffect(() => {
    let prev = AppState.currentState;
    const sub = AppState.addEventListener("change", (next) => {
      if (next === "active") {
        lastBecameActiveRef.current = { at: Date.now(), from: prev };
      }
      prev = next;
    });
    return () => sub.remove();
  }, []);

  useEffect(() => {
    // Defer RevenueCat initialization to not block app startup
    const task = InteractionManager.runAfterInteractions(() => {
      void initializePurchases();
    });
    return () => task.cancel();
  }, []);

  useEffect(() => {
    // If the app was cold-started from a notification press/full-screen intent, route to the alarm screen.
    let cancelled = false;

    async function routeToAlarmFromNotification(notification: any, reason: string, allowReposted = false): Promise<void> {
      const notificationId = notification?.id || "";
      const trace = buildAlarmTrace(notification);
      console.log(`[VR] route_check reason=${reason} allowReposted=${allowReposted} trace=${trace}`);
      if (!notificationId) {
        console.log(`[VR] skip_route reason=no_id trace=${trace}`);
        return;
      }

      // Ignore reposted/display-only alarm notifications to avoid loops (unless explicitly allowed for PRESS events).
      const data: any = notification?.data || {};
      const repostFlag = data?.__reposted;
      const isReposted = repostFlag === "1" || repostFlag === 1 || repostFlag === true;
      const isAlarmDisplay = typeof notificationId === "string" && notificationId.startsWith("alarm_display_");
      if ((isReposted || isAlarmDisplay) && !allowReposted) {
        console.log(`[VR] skip_route reason=${isReposted ? "reposted" : "alarm_display_id"} id=${notificationId} repost=${repostFlag} kind=${data?.kind}`);
        return;
      }

      // Debounce duplicates across startup/foreground/app-active paths.
      if (lastAlarmRoutedIdRef.current === notificationId) {
        console.log(`[VR] skip_route reason=dedupe lastId=${lastAlarmRoutedIdRef.current} currentId=${notificationId}`);
        return;
      }
      lastAlarmRoutedIdRef.current = notificationId;

      console.log(`[VR] route_execute reason=${reason} id=${notificationId}`);

      router.push({
        pathname: "/alarm",
        params: {
          notificationId,
          reminderId: String(data?.reminderId ?? ""),
          title: String(data?.title ?? notification?.title ?? ""),
          description: String(data?.description ?? notification?.body ?? ""),
          snoozeEnabled: String(data?.snoozeEnabled ?? "true"),
          snoozeDuration: String(data?.snoozeDuration ?? "5"),
          volume: String(data?.volume ?? "1"),
          volumeStyle: String(data?.volumeStyle ?? "standard"),

          // Preserve data needed for snooze + reschedule without relying on store hydration.
          audioUrl: String(data?.audioUrl ?? ""),
          frequency: String(data?.frequency ?? ""),
          time: String(data?.time ?? ""),
          days: String(data?.days ?? ""),
          intervalDays: String(data?.intervalDays ?? ""),

          // Occurrence + interval metadata
          scheduledFor: String(data?.scheduledFor ?? ""),
          intervalMs: String(data?.intervalMs ?? ""),
          anchorAt: String(data?.anchorAt ?? ""),
          kind: String(data?.kind ?? ""),
        },
      });
    }

    async function maybeRouteToPendingAlarm(reason: string): Promise<void> {
      console.log(`[VR] maybeRoute reason=${reason} inFlight=${pendingRouteInFlightRef.current}`);
      if (pendingRouteInFlightRef.current) {
        console.log(`[VR] maybeRoute_skip reason=inFlight`);
        return;
      }
      pendingRouteInFlightRef.current = true;
      try {
        const pending = await getPendingAlarm();
        console.log(`[VR] maybeRoute_pending exists=${!!pending} resolvedAt=${pending?.resolvedAt || "none"} id=${pending?.notification?.id || "none"}`);
        if (!pending || pending.resolvedAt) {
          console.log(`[VR] maybeRoute_skip reason=${!pending ? "no_pending" : "already_resolved"}`);
          return;
        }
        if (!pending.notification?.id) {
          console.log(`[VR] maybeRoute_skip reason=no_notification_id`);
          return;
        }
        await routeToAlarmFromNotification(pending.notification, reason);
      } catch (e) {
        console.log("[VR] Failed to route pending alarm:", e);
      } finally {
        pendingRouteInFlightRef.current = false;
      }
    }

    const task = InteractionManager.runAfterInteractions(async () => {
      try {
        const initial = await notifee.getInitialNotification();
        const notification = initial?.notification;
        if (cancelled || !notification) return;

        const notificationId = notification.id || "";
        if (notificationId && initialNotificationHandledRef.current === notificationId) return;
        initialNotificationHandledRef.current = notificationId || "__handled__";

        // Ensure pending alarm exists so we can mark it handled consistently.
        await setPendingAlarm(notification as any);
        // Allow reposted notifications for initial_notification since user explicitly tapped
        await routeToAlarmFromNotification(notification, "initial_notification", true);
      } catch (e) {
        console.log("[VR] Failed to read initial notification:", e);
      }
    });

    return () => {
      cancelled = true;
      task.cancel();
    };
  }, [router]);

  useEffect(() => {
    let cancelled = false;

    async function maybeRouteToPendingAlarm(reason: string): Promise<void> {
      console.log(`[VR] maybeRoute2 reason=${reason} inFlight=${pendingRouteInFlightRef.current}`);
      if (pendingRouteInFlightRef.current) {
        console.log(`[VR] maybeRoute2_skip reason=inFlight`);
        return;
      }
      pendingRouteInFlightRef.current = true;
      try {
        const pending = await getPendingAlarm();
        console.log(`[VR] maybeRoute2_pending exists=${!!pending} resolvedAt=${pending?.resolvedAt || "none"} id=${pending?.notification?.id || "none"}`);
        if (!pending || pending.resolvedAt) {
          console.log(`[VR] maybeRoute2_skip reason=${!pending ? "no_pending" : "already_resolved"}`);
          return;
        }
        if (!pending.notification?.id) {
          console.log(`[VR] maybeRoute2_skip reason=no_notification_id`);
          return;
        }

        const notificationId = pending.notification.id || "";
        if (!notificationId) {
          console.log(`[VR] maybeRoute2_skip reason=empty_id`);
          return;
        }
        if (lastAlarmRoutedIdRef.current === notificationId) {
          console.log(`[VR] maybeRoute2_skip reason=dedupe lastId=${lastAlarmRoutedIdRef.current}`);
          return;
        }

        // Mirror the same routing params as the initial-notification path.
        const notification: any = pending.notification;
        const data: any = notification?.data || {};
        const repostFlag = data?.__reposted;
        const isReposted = repostFlag === "1" || repostFlag === 1 || repostFlag === true;
        const isAlarmDisplay = typeof notificationId === "string" && notificationId.startsWith("alarm_display_");
        if (isReposted || isAlarmDisplay) {
          console.log(`[VR] maybeRoute2_skip reason=${isReposted ? "reposted" : "alarm_display_id"} id=${notificationId}`);
          return;
        }

        lastAlarmRoutedIdRef.current = notificationId;
        console.log(`[VR] route2_execute reason=${reason} id=${notificationId}`);

        router.push({
          pathname: "/alarm",
          params: {
            notificationId,
            reminderId: String(data?.reminderId ?? ""),
            title: String(data?.title ?? notification?.title ?? ""),
            description: String(data?.description ?? notification?.body ?? ""),
            snoozeEnabled: String(data?.snoozeEnabled ?? "true"),
            snoozeDuration: String(data?.snoozeDuration ?? "5"),
            volume: String(data?.volume ?? "1"),
            volumeStyle: String(data?.volumeStyle ?? "standard"),

            audioUrl: String(data?.audioUrl ?? ""),
            frequency: String(data?.frequency ?? ""),
            time: String(data?.time ?? ""),
            days: String(data?.days ?? ""),
            intervalDays: String(data?.intervalDays ?? ""),

            scheduledFor: String(data?.scheduledFor ?? ""),
            intervalMs: String(data?.intervalMs ?? ""),
            anchorAt: String(data?.anchorAt ?? ""),
            kind: String(data?.kind ?? ""),
          },
        });
      } catch (e) {
        console.log("[VR] Failed to route pending alarm:", e);
      } finally {
        pendingRouteInFlightRef.current = false;
      }
    }

    const unsubAppState = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        void maybeRouteToPendingAlarm("app_active");
      }
    });

    const unsubNotifee = notifee.onForegroundEvent(async (event) => {
      if (cancelled) return;
      const trace = buildAlarmTrace(event.detail.notification);
      console.log(`[VR] layout_fg_event type=${eventTypeName(event.type)} trace=${trace}`);

      if (event.type !== EventType.DELIVERED && event.type !== EventType.PRESS) {
        console.log(`[VR] layout_fg_skip reason=wrong_type type=${eventTypeName(event.type)}`);
        return;
      }
      const notification: any = event.detail.notification;
      const data: any = notification?.data || {};
      const kind = typeof data?.kind === "string" ? (data.kind as string) : "";
      if (kind !== "reminder_occurrence" && kind !== "snooze_occurrence") {
        console.log(`[VR] layout_fg_skip reason=wrong_kind kind=${kind}`);
        return;
      }

      const id = notification?.id || "";
      const repostFlag = data?.__reposted;
      const isReposted = repostFlag === "1" || repostFlag === 1 || repostFlag === true;
      const isAlarmDisplay = typeof id === "string" && id.startsWith("alarm_display_");

      // For DELIVERED events, skip reposted notifications to prevent loops
      // For PRESS events, allow them through since user explicitly tapped
      if (event.type === EventType.DELIVERED && (isAlarmDisplay || isReposted)) {
        console.log(`[VR] layout_fg_skip reason=${isAlarmDisplay ? "alarm_display_id" : "reposted"} id=${id} eventType=DELIVERED`);
        return;
      }

      console.log(`[VR] layout_fg_qualifies id=${id} kind=${kind} eventType=${eventTypeName(event.type)} isReposted=${isReposted}`);

      // Persist pending alarm here too (best-effort) so routing can work even
      // if handler ordering differs.
      if (event.type === EventType.DELIVERED) {
        await setPendingAlarm(notification as any);
      }

      // For PRESS events on reposted notifications, route directly to alarm
      if (event.type === EventType.PRESS && (isAlarmDisplay || isReposted)) {
        // Route directly with allowReposted=true
        const notificationId = notification?.id || "";
        if (!notificationId) return;
        if (lastAlarmRoutedIdRef.current === notificationId) {
          console.log(`[VR] layout_fg_skip reason=dedupe id=${notificationId}`);
          return;
        }
        lastAlarmRoutedIdRef.current = notificationId;
        console.log(`[VR] layout_fg_route_direct id=${notificationId} isReposted=${isReposted}`);

        router.push({
          pathname: "/alarm",
          params: {
            notificationId,
            reminderId: String(data?.reminderId ?? ""),
            title: String(data?.title ?? notification?.title ?? ""),
            description: String(data?.description ?? notification?.body ?? ""),
            snoozeEnabled: String(data?.snoozeEnabled ?? "true"),
            snoozeDuration: String(data?.snoozeDuration ?? "5"),
            volume: String(data?.volume ?? "1"),
            volumeStyle: String(data?.volumeStyle ?? "standard"),
            audioUrl: String(data?.audioUrl ?? ""),
            frequency: String(data?.frequency ?? ""),
            time: String(data?.time ?? ""),
            days: String(data?.days ?? ""),
            intervalDays: String(data?.intervalDays ?? ""),
            scheduledFor: String(data?.scheduledFor ?? ""),
            intervalMs: String(data?.intervalMs ?? ""),
            anchorAt: String(data?.anchorAt ?? ""),
            kind: String(data?.kind ?? ""),
          },
        });
        return;
      }

      // Route immediately while app is already in foreground.
      await maybeRouteToPendingAlarm("foreground_event");
    });

    const task = InteractionManager.runAfterInteractions(() => {
      void maybeRouteToPendingAlarm("startup");
    });

    return () => {
      cancelled = true;
      unsubAppState.remove();
      unsubNotifee();
      task.cancel();
    };
  }, [router]);

  useEffect(() => {
    let cancelled = false;
    let checkInterval: NodeJS.Timeout | null = null;

    async function checkAndShowAlarm() {
      if (cancelled) return;
      const pending = await getPendingAlarm();
      if (cancelled) return;

      if (!pending || pending.resolvedAt) {
        if (activeAlarm && !activeAlarm.shouldExitOnResolve) {
          console.log(`[VR] overlay_hide reason=${!pending ? "cleared" : "resolved"}`);
          setActiveAlarm(null);
        }
        return;
      }

      const notificationId = pending.notification?.id;
      if (!notificationId) return;

      if (activeAlarm?.notificationId === notificationId) {
        return;
      }

      const data: any = pending.notification?.data || {};
      console.log(`[VR] overlay_show id=${notificationId}`);

      // Heuristic: if the app just transitioned into the foreground from a non-active state
      // while an alarm is ringing, treat this as a lockscreen/background alarm UI and exit
      // the activity on resolve (so the main app UI doesn't show).
      const lastActive = lastBecameActiveRef.current;
      const justBecameActive = Date.now() - lastActive.at < 8000;
      const cameFromBackground = lastActive.from !== "active";
      const isRinging = typeof pending.ringingAt === "number" && Date.now() - pending.ringingAt < 60_000;
      const shouldExitOnResolve =
        Platform.OS === "android" && Boolean(justBecameActive && cameFromBackground && isRinging);

      const alarmProps: AlarmOverlayProps = {
        notificationId,
        reminderId: String(data?.reminderId ?? ""),
        title: String(data?.title ?? pending.notification?.title ?? ""),
        description: String(data?.description ?? pending.notification?.body ?? ""),
        audioUrl: String(data?.audioUrl ?? ""),
        frequency: String(data?.frequency ?? ""),
        time: String(data?.time ?? ""),
        days: String(data?.days ?? ""),
        intervalDays: String(data?.intervalDays ?? ""),
        snoozeEnabled: String(data?.snoozeEnabled ?? "true"),
        snoozeDuration: String(data?.snoozeDuration ?? "5"),
        volume: String(data?.volume ?? "1"),
        volumeStyle: String(data?.volumeStyle ?? "standard"),
        scheduledFor: String(data?.scheduledFor ?? ""),
        intervalMs: String(data?.intervalMs ?? ""),
        anchorAt: String(data?.anchorAt ?? ""),
        kind: String(data?.kind ?? ""),
        onDismiss: async () => {
          await markPendingAlarmResolved(notificationId, "dismiss");
          await clearPendingAlarm();
        },
        onSnooze: async () => {
          await markPendingAlarmResolved(notificationId, "snooze");
          await clearPendingAlarm();
        },
        shouldExitOnResolve,
      };

      setActiveAlarm(alarmProps);
    }

    // Run immediately for cold start / lockscreen responsiveness
    checkAndShowAlarm();

    checkInterval = setInterval(() => {
      if (!cancelled) {
        checkAndShowAlarm();
      }
    }, 1000);

    return () => {
      cancelled = true;
      if (checkInterval) clearInterval(checkInterval);
    };
  }, [activeAlarm]);

  const handleOverlayDismiss = async () => {
    if (!activeAlarm) return;
    await markPendingAlarmResolved(activeAlarm.notificationId, "dismiss");
    await clearPendingAlarm();
    if (!activeAlarm.shouldExitOnResolve) {
      setActiveAlarm(null);
    }
  };

  const handleOverlaySnooze = async () => {
    if (!activeAlarm) return;
    await markPendingAlarmResolved(activeAlarm.notificationId, "snooze");
    await clearPendingAlarm();
    if (!activeAlarm.shouldExitOnResolve) {
      setActiveAlarm(null);
    }
  };

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <PortalProvider>
        <SafeAreaProvider>
          <ConvexProvider client={convex}>
            <ToastProvider>
              <StartupTasks />
              {activeAlarm && (
                <AlarmOverlay
                  {...activeAlarm}
                  onDismiss={handleOverlayDismiss}
                  onSnooze={handleOverlaySnooze}
                />
              )}
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
                <Stack.Screen
                  name="alarm"
                  options={{
                    animation: "fade",
                    animationDuration: 150,
                    presentation: "fullScreenModal",
                    headerShown: false,
                    gestureEnabled: false,
                  }}
                />
              </Stack>
            </ToastProvider>
          </ConvexProvider>
        </SafeAreaProvider>
      </PortalProvider>
    </GestureHandlerRootView>
  );
}
