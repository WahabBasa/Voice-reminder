import { Stack } from "expo-router";
import { ConvexProvider, ConvexReactClient } from "convex/react";
import { StatusBar } from "expo-status-bar";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import ToastProvider from "../components/ToastProvider";

const convex = new ConvexReactClient(process.env.EXPO_PUBLIC_CONVEX_URL as string);

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
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
                name="reminder/edit"
                options={{
                  animation: "fade",
                  animationDuration: 80,
                  presentation: "transparentModal",
                  contentStyle: { backgroundColor: "transparent" },
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
          </ToastProvider>
        </ConvexProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
