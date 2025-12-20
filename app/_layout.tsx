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
                animation: "slide_from_right",
                animationDuration: 200,
              }}
            >
              <Stack.Screen name="index" options={{ contentStyle: { backgroundColor: "white" } }} />
              <Stack.Screen name="history" options={{ contentStyle: { backgroundColor: "white" } }} />
              <Stack.Screen name="settings" options={{ contentStyle: { backgroundColor: "white" } }} />
              <Stack.Screen
                name="reminder/edit"
                options={{
                  animation: "fade",
                  presentation: "transparentModal",
                  contentStyle: { backgroundColor: "transparent" },
                }}
              />
              <Stack.Screen
                name="reminder/new"
                options={{
                  animation: "slide_from_bottom",
                  presentation: "modal",
                }}
              />
            </Stack>
          </ToastProvider>
        </ConvexProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
