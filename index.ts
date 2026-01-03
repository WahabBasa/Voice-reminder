import "react-native-gesture-handler";
import notifee, { EventType } from "@notifee/react-native";
import { handleNotificationEvent } from "./lib/notifications";
import * as Linking from "expo-linking";

// Navigate to alarm screen with notification data
function navigateToAlarmScreen(notification: any) {
  const data = notification?.data;
  const params = new URLSearchParams({
    notificationId: notification?.id || "",
    reminderId: (data?.reminderId as string) || "",
    title: (data?.title as string) || notification?.title || "",
    description: (data?.description as string) || notification?.body || "",
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

