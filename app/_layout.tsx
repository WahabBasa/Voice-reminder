import { Stack } from "expo-router";
import { ConvexProvider, ConvexReactClient } from "convex/react";
import { StatusBar } from "expo-status-bar";
import { GestureHandlerRootView } from "react-native-gesture-handler";

const convex = new ConvexReactClient(process.env.EXPO_PUBLIC_CONVEX_URL as string);

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ConvexProvider client={convex}>
        <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: "white" },
          animation: "slide_from_right",
          animationDuration: 200,
        }}
      >
        <Stack.Screen name="index" />
        <Stack.Screen name="calendar" />
        <Stack.Screen name="history" />
        <Stack.Screen
          name="reminder/edit"
          options={{
            animation: "slide_from_bottom",
            presentation: "modal",
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
      </ConvexProvider>
    </GestureHandlerRootView>
  );
}
