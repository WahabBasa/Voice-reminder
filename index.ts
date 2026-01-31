import "react-native-gesture-handler";
import { AppState } from "react-native";
import notifee, { EventType } from "@notifee/react-native";
import {
  handleNotificationEvent,
  getPendingAlarm,
  markPendingAlarmHandled,
} from "./lib/notifications";
import * as Linking from "expo-linking";

// Deduplication guard to prevent rapid navigation
let lastNavigatedNotificationId: string | null = null;
let lastNavigationTime = 0;
const NAVIGATION_DEBOUNCE_MS = 2000;
let pendingAlarmCheckInFlight = false;

// Navigate to alarm screen with notification data
async function navigateToAlarmScreen(notification: any): Promise<void> {
  const notificationId = notification?.id;
  const now = Date.now();

  // Skip if same notification within debounce window
  if (
    notificationId &&
    notificationId === lastNavigatedNotificationId &&
    now - lastNavigationTime < NAVIGATION_DEBOUNCE_MS
  ) {
    console.log("[VR] Skipping duplicate navigation for:", notificationId);
    return;
  }

  lastNavigatedNotificationId = notificationId || null;
  lastNavigationTime = now;

  const data = notification?.data;
  const params = new URLSearchParams({
    notificationId: notification?.id || "",
    reminderId: (data?.reminderId as string) || "",
    title: (data?.title as string) || notification?.title || "",
    description: (data?.description as string) || notification?.body || "",
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
  });

  const url = Linking.createURL(`/alarm?${params.toString()}`);
  console.log("[VR] Navigating to alarm screen:", url);
  if (notificationId) {
    await markPendingAlarmHandled(notificationId);
  }
  await Linking.openURL(url);
}

async function maybeNavigateToPendingAlarm(reason: string) {
  if (pendingAlarmCheckInFlight) return;
  pendingAlarmCheckInFlight = true;
  try {
    const pending = await getPendingAlarm();
    if (!pending || pending.handledAt) return;
    const notification = pending.notification;
    if (!notification?.id) return;
    console.log("[VR] Pending alarm detected:", reason, notification.id);
    await navigateToAlarmScreen(notification);
  } catch (e) {
    console.log("[VR] Failed to handle pending alarm:", e);
  } finally {
    pendingAlarmCheckInFlight = false;
  }
}

// Register background handler before app loads
notifee.onBackgroundEvent(async (event) => {
  console.log("[VR] Background event:", event.type);

  // Background-to-activity launches are heavily restricted on Android.
  // We rely on full-screen notifications + AlarmActivity instead of trying to
  // navigate via Linking from background (which many devices block).
  // The pending alarm is recorded here and the UI will open when app becomes active.
  if (event.type === EventType.DELIVERED) {
    const data = event.detail.notification?.data as any;
    const kind = typeof data?.kind === "string" ? (data.kind as string) : "";
    if (kind === "reminder_occurrence" || kind === "snooze_occurrence") {
      console.log("[VR] Alarm delivered in background, will open when app becomes active:", event.detail.notification?.id);
    }
  }

  await handleNotificationEvent(event);
});

// Register foreground handler
notifee.onForegroundEvent(async (event) => {
  console.log("[VR] Foreground event:", event.type);

  if (event.type === EventType.DELIVERED) {
    const data = event.detail.notification?.data as any;
    const kind = typeof data?.kind === "string" ? (data.kind as string) : "";
    const id = event.detail.notification?.id || "";
    if (kind === "reminder_occurrence" || kind === "snooze_occurrence") {
      if (typeof id === "string" && id.startsWith("alarm_display_")) {
        // The reposted notification exists only to deliver full-screen reliably;
        // avoid duplicate navigation loops.
        return;
      }
      console.log("[VR] Alarm delivered, opening alarm screen:", event.detail.notification?.id);
      void navigateToAlarmScreen(event.detail.notification);
    }
  }

  if (event.type === EventType.PRESS) {
    console.log("[VR] Notification pressed:", event.detail.notification?.id);
    // Also navigate to alarm on press (in case they dismissed the screen)
    void navigateToAlarmScreen(event.detail.notification);
  }

  await handleNotificationEvent(event);
});

// If an alarm delivered while we were backgrounded/locked, open the alarm UI
// when the app becomes active again.
AppState.addEventListener("change", (state) => {
  if (state === "active") {
    void maybeNavigateToPendingAlarm("app_active");
  }
});

// Startup check in case the initial notification path was missed.
setTimeout(() => {
  void maybeNavigateToPendingAlarm("startup");
}, 0);

import "expo-router/entry";
