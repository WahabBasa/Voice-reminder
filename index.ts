import "react-native-gesture-handler";
import notifee, { EventType } from "@notifee/react-native";
import { handleNotificationEvent } from "./lib/notifications";

// Register background handler before app loads
notifee.onBackgroundEvent(async (event) => {
  console.log("[VR] Background event:", event.type);
  await handleNotificationEvent(event);
});

// Register foreground handler
notifee.onForegroundEvent(async (event) => {
  console.log("[VR] Foreground event:", event.type);
  if (event.type === EventType.PRESS) {
    console.log("[VR] Notification pressed:", event.detail.notification?.id);
  }
  await handleNotificationEvent(event);
});

import "expo-router/entry";
