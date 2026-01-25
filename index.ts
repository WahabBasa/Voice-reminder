import "react-native-gesture-handler";
import notifee, { EventType } from "@notifee/react-native";
import { handleNotificationEvent } from "./lib/notifications";
import * as Linking from "expo-linking";

// Deduplication guard to prevent rapid navigation
let lastNavigatedNotificationId: string | null = null;
let lastNavigationTime = 0;
const NAVIGATION_DEBOUNCE_MS = 2000;

// Navigate to alarm screen with notification data
function navigateToAlarmScreen(notification: any) {
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

    // Occurrence + interval metadata
    scheduledFor: String(data?.scheduledFor ?? ""),
    intervalMs: String(data?.intervalMs ?? ""),
    anchorAt: String(data?.anchorAt ?? ""),
    kind: String(data?.kind ?? ""),
  });

  const url = Linking.createURL(`/alarm?${params.toString()}`);
  console.log("[VR] Navigating to alarm screen:", url);
  Linking.openURL(url);
}

// Register background handler before app loads
notifee.onBackgroundEvent(async (event) => {
  console.log("[VR] Background event:", event.type);

  // Navigate to alarm screen when notification is delivered
  if (event.type === EventType.DELIVERED) {
    navigateToAlarmScreen(event.detail.notification);
  }

  await handleNotificationEvent(event);
});

// Register foreground handler
notifee.onForegroundEvent(async (event) => {
  console.log("[VR] Foreground event:", event.type);

  // Navigate to alarm screen when notification is delivered
  if (event.type === EventType.DELIVERED) {
    navigateToAlarmScreen(event.detail.notification);
  }

  if (event.type === EventType.PRESS) {
    console.log("[VR] Notification pressed:", event.detail.notification?.id);
    // Also navigate to alarm on press (in case they dismissed the screen)
    navigateToAlarmScreen(event.detail.notification);
  }

  await handleNotificationEvent(event);
});

import "expo-router/entry";
