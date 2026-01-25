import { useEffect, useRef } from "react";
import { InteractionManager } from "react-native";
import { Stack, useRouter } from "expo-router";
import { ConvexProvider, ConvexReactClient } from "convex/react";
import { StatusBar } from "expo-status-bar";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { PortalProvider } from "@gorhom/portal";
import ToastProvider from "../components/ToastProvider";
import { initializePurchases } from "../lib/purchases";
import notifee from "@notifee/react-native";

const convex = new ConvexReactClient(process.env.EXPO_PUBLIC_CONVEX_URL as string);

export default function RootLayout() {
  const router = useRouter();
  const initialNotificationHandledRef = useRef<string | null>(null);

  useEffect(() => {
    // Defer RevenueCat initialization to not block app startup
    const task = InteractionManager.runAfterInteractions(() => {
      initializePurchases();
    });
    return () => task.cancel();
  }, []);

  useEffect(() => {
    // If the app was cold-started from a notification press, route to the alarm screen.
    let cancelled = false;
    const task = InteractionManager.runAfterInteractions(async () => {
      try {
        const initial = await notifee.getInitialNotification();
        const notification = initial?.notification;
        if (cancelled || !notification) return;

        const notificationId = notification.id || "";
        if (notificationId && initialNotificationHandledRef.current === notificationId) return;
        initialNotificationHandledRef.current = notificationId || "__handled__";

        const data: any = notification.data || {};
        router.push({
          pathname: "/alarm",
          params: {
            notificationId: notification.id || "",
            reminderId: (data.reminderId as string) || "",
            title: (data.title as string) || notification.title || "",
            description: (data.description as string) || (notification.body as string) || "",
            snoozeEnabled: String(data.snoozeEnabled ?? "true"),
            snoozeDuration: String(data.snoozeDuration ?? "5"),
            volume: String(data.volume ?? "1"),
            volumeStyle: String(data.volumeStyle ?? "standard"),
            scheduledFor: String(data.scheduledFor ?? ""),
            intervalMs: String(data.intervalMs ?? ""),
            anchorAt: String(data.anchorAt ?? ""),
            kind: String(data.kind ?? ""),
          },
        });
      } catch (e) {
        console.log("[VR] Failed to read initial notification:", e);
      }
    });

    return () => {
      cancelled = true;
      task.cancel();
    };
  }, [router]);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <PortalProvider>
        <SafeAreaProvider>
          <ConvexProvider client={convex}>
            <ToastProvider>
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
