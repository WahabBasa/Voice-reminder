import { useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import notifee from "@notifee/react-native";
import { ConvexProvider, ConvexReactClient } from "convex/react";
import { AlarmOverlay, AlarmOverlayProps } from "../components/AlarmOverlay";
import {
  PendingAlarm,
  clearPendingAlarm,
  enforcePendingAlarmTimeout,
  getPendingAlarm,
  markPendingAlarmResolved,
  setPendingAlarm,
  markPendingAlarmLaunchedExternally,
} from "../lib/notifications";
import { finishCurrentTask, finishIfAlarmActivity, logAppTaskState } from "../lib/activityControl";
import { vrLog, logAlarmLifecycle, buildTraceId } from "../lib/vrLog";
import ErrorBoundary from "../components/ErrorBoundary";

const convex = new ConvexReactClient(process.env.EXPO_PUBLIC_CONVEX_URL as string);

function buildOverlayProps(pending: PendingAlarm): AlarmOverlayProps | null {
  const notificationId = pending.notification?.id || "";
  if (!notificationId) return null;

  const data: any = pending.notification?.data || {};
  const traceId = buildTraceId(pending.notification);

  const base: Omit<AlarmOverlayProps, "onDismiss" | "onSnooze"> = {
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
    // Assistant-style replays (OLD-53)
    urgency: String(data?.urgency ?? ""),
    persistent: String(data?.persistent ?? "false"),
    variants: String(data?.variants ?? ""),
    variantAudioUrls: String(data?.variantAudioUrls ?? ""),
    variantCount: String(data?.variantCount ?? "0"),
    followUpCount: String(data?.followUpCount ?? "0"),
    variantIndex: String(data?.variantIndex ?? "-1"),
  };

  return {
    ...base,
    onDismiss: async () => {
      // Primary path resolve behavior (pastebin Step 4.3):
      // - mark pending resolved + clear pending
      // - call finishIfAlarmActivity() (and only fallback to finishCurrentTask() if needed)
      logAlarmLifecycle('resolve_start', { traceId, notificationId, action: 'dismiss', source: 'AlarmRoot' });
      void logAppTaskState(`alarm_resolve_dismiss_before_${notificationId}`);
      await markPendingAlarmResolved(notificationId, "dismiss");
      await clearPendingAlarm();
      const pendingAfter = await getPendingAlarm();
      if (pendingAfter?.notification?.id && !pendingAfter.resolvedAt) {
        logAlarmLifecycle('resolve_keep_activity_for_queued', {
          traceId,
          notificationId: pendingAfter.notification.id,
          action: 'dismiss',
        });
        return;
      }
      const didFinish = await finishIfAlarmActivity();
      logAlarmLifecycle('resolve_finish', { traceId, notificationId, action: 'dismiss', didFinish });
      if (!didFinish) {
        // Fallback only if finishIfAlarmActivity didn't work
        await finishCurrentTask();
      }
      void logAppTaskState(`alarm_resolve_dismiss_after_${notificationId}`);
    },
    onSnooze: async () => {
      logAlarmLifecycle('resolve_start', { traceId, notificationId, action: 'snooze', source: 'AlarmRoot' });
      void logAppTaskState(`alarm_resolve_snooze_before_${notificationId}`);
      await markPendingAlarmResolved(notificationId, "snooze");
      await clearPendingAlarm();
      const pendingAfter = await getPendingAlarm();
      if (pendingAfter?.notification?.id && !pendingAfter.resolvedAt) {
        logAlarmLifecycle('resolve_keep_activity_for_queued', {
          traceId,
          notificationId: pendingAfter.notification.id,
          action: 'snooze',
        });
        return;
      }
      const didFinish = await finishIfAlarmActivity();
      logAlarmLifecycle('resolve_finish', { traceId, notificationId, action: 'snooze', didFinish });
      if (!didFinish) {
        await finishCurrentTask();
      }
      void logAppTaskState(`alarm_resolve_snooze_after_${notificationId}`);
    },
    shouldExitOnResolve: true,
  };
}

export default function AlarmRoot() {
  const [activeAlarm, setActiveAlarm] = useState<AlarmOverlayProps | null>(null);

  useEffect(() => {
    // Enhanced mount logging (pastebin Step 4.4)
    vrLog('alarm_root', 'mount', { rootType: 'AlarmRoot', component: 'alarm' });
    void logAppTaskState('AlarmRoot_mount');
    
    return () => {
      vrLog('alarm_root', 'unmount', { rootType: 'AlarmRoot' });
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    let interval: NodeJS.Timeout | null = null;

    async function seedPendingFromInitialNotification() {
      try {
        const initial = await notifee.getInitialNotification();
        const initialNotification = initial?.notification as any;
        if (initialNotification?.id) {
          const pending = await getPendingAlarm();
          if (!pending || pending.notification?.id !== initialNotification.id) {
            await setPendingAlarm(initialNotification);
          }
          // Mark as externally launched (AlarmActivity launched from full-screen intent/press)
          await markPendingAlarmLaunchedExternally(initialNotification.id, "press");
          vrLog('alarm_root', 'seeded_from_initial', { 
            notificationId: initialNotification.id,
            traceId: buildTraceId(initialNotification),
          });
        }
      } catch {
        // ignore
      }
    }

    async function poll() {
      if (cancelled) return;
      await enforcePendingAlarmTimeout();
      const pending = await getPendingAlarm();
      if (cancelled) return;

      if (!pending || pending.resolvedAt) {
        if (activeAlarm) {
          vrLog('alarm_root', 'alarm_cleared', { 
            notificationId: pending?.notification?.id,
            resolvedAt: pending?.resolvedAt,
          });
        }
        setActiveAlarm(null);
        return;
      }

      const props = buildOverlayProps(pending);
      if (!props) return;

      setActiveAlarm((prev) => {
        if (prev?.notificationId === props.notificationId) return prev;
        // Log when alarm UI is first shown
        vrLog('alarm_root', 'alarm_ui_showing', {
          notificationId: props.notificationId,
          traceId: buildTraceId(pending.notification),
          resolvedAt: pending.resolvedAt,
          uiShownAt: pending.uiShownAt,
        });
        return props;
      });
    }

    void seedPendingFromInitialNotification().then(() => void poll());

    interval = setInterval(() => {
      void poll();
    }, 500);

    return () => {
      cancelled = true;
      if (interval) clearInterval(interval);
    };
  }, []);

  return (
    <ErrorBoundary fallbackTitle="Alarm error">
      <ConvexProvider client={convex}>
        <View style={styles.container}>
          {activeAlarm ? <AlarmOverlay {...activeAlarm} /> : <ActivityIndicator size="large" color="#fff" />}
        </View>
      </ConvexProvider>
    </ErrorBoundary>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#1a1a2e",
  },
});
