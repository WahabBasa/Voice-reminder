import "react-native-gesture-handler";
import { AppRegistry } from "react-native";
import notifee, { EventType } from "@notifee/react-native";
import { handleNotificationEvent, eventTypeName } from "./lib/notifications";
import { buildTraceId } from "./lib/vrLog";
import AlarmRoot from "./alarm/AlarmRoot";

// Separate root for AlarmActivity (lockscreen UI) to avoid mounting expo-router in the alarm task.
AppRegistry.registerComponent("alarm", () => AlarmRoot);

// Register background handler before app loads
notifee.onBackgroundEvent(async (event) => {
  const trace = buildTraceId(event.detail.notification as any);
  console.log(`[VR] BG_EVENT type=${eventTypeName(event.type)} trace=${trace}`);

  // Background-to-activity launches are heavily restricted on Android.
  // We rely on full-screen notifications + AlarmActivity instead of trying to
  // navigate via Linking from background (which many devices block).
  // The pending alarm is recorded here and the UI will open when app becomes active.
  if (event.type === EventType.DELIVERED) {
    const data = event.detail.notification?.data as any;
    const kind = typeof data?.kind === "string" ? (data.kind as string) : "";
    if (kind === "reminder_occurrence" || kind === "snooze_occurrence") {
      console.log(`[VR] BG_DELIVERED alarm_will_open_on_active trace=${trace}`);
    }
  }

  await handleNotificationEvent(event);
});

// Register foreground handler
notifee.onForegroundEvent(async (event) => {
  const trace = buildTraceId(event.detail.notification as any);
  console.log(`[VR] FG_EVENT type=${eventTypeName(event.type)} trace=${trace}`);
  await handleNotificationEvent(event);
});

import "expo-router/entry";
