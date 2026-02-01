import { useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import notifee from "@notifee/react-native";
import { ConvexProvider, ConvexReactClient } from "convex/react";
import { AlarmOverlay, AlarmOverlayProps } from "../components/AlarmOverlay";
import {
  PendingAlarm,
  clearPendingAlarm,
  getPendingAlarm,
  markPendingAlarmResolved,
  setPendingAlarm,
} from "../lib/notifications";
import { finishCurrentTask, finishIfAlarmActivity } from "../lib/activityControl";

const convex = new ConvexReactClient(process.env.EXPO_PUBLIC_CONVEX_URL as string);

function buildOverlayProps(pending: PendingAlarm): AlarmOverlayProps | null {
  const notificationId = pending.notification?.id || "";
  if (!notificationId) return null;

  const data: any = pending.notification?.data || {};

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
  };

  return {
    ...base,
    onDismiss: async () => {
      await markPendingAlarmResolved(notificationId, "dismiss");
      await clearPendingAlarm();
      const didFinish = await finishIfAlarmActivity();
      if (!didFinish) {
        await finishCurrentTask();
      }
    },
    onSnooze: async () => {
      await markPendingAlarmResolved(notificationId, "snooze");
      await clearPendingAlarm();
      const didFinish = await finishIfAlarmActivity();
      if (!didFinish) {
        await finishCurrentTask();
      }
    },
    shouldExitOnResolve: true,
  };
}

export default function AlarmRoot() {
  const [activeAlarm, setActiveAlarm] = useState<AlarmOverlayProps | null>(null);

  useEffect(() => {
    console.log("[VR] AlarmRoot mount");
    return () => {
      console.log("[VR] AlarmRoot unmount");
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
        }
      } catch {
        // ignore
      }
    }

    async function poll() {
      if (cancelled) return;
      const pending = await getPendingAlarm();
      if (cancelled) return;

      if (!pending || pending.resolvedAt) {
        setActiveAlarm(null);
        return;
      }

      const props = buildOverlayProps(pending);
      if (!props) return;

      setActiveAlarm((prev) => {
        if (prev?.notificationId === props.notificationId) return prev;
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
    <ConvexProvider client={convex}>
      <View style={styles.container}>
        {activeAlarm ? <AlarmOverlay {...activeAlarm} /> : <ActivityIndicator size="large" color="#fff" />}
      </View>
    </ConvexProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#1a1a2e",
  },
});
