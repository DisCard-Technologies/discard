/**
 * DisCard 2035 - Transfer Stack Layout
 *
 * Navigation layout for transfer-related screens.
 */

import { Stack } from "expo-router";
import { useThemeColor } from "@/hooks/use-theme-color";

export default function TransferLayout() {
  const bgColor = useThemeColor({ light: "#fff", dark: "#000" }, "background");

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: bgColor },
        animation: "slide_from_right",
      }}
    >
      <Stack.Screen
        name="confirmation"
        options={{
          presentation: "modal",
          animation: "slide_from_bottom",
        }}
      />
      <Stack.Screen
        name="success"
        options={{
          presentation: "modal",
          animation: "fade",
          gestureEnabled: false, // Prevent swipe to dismiss on success
        }}
      />
      <Stack.Screen
        name="scan"
        options={{
          presentation: "fullScreenModal",
          animation: "slide_from_bottom",
        }}
      />
      <Stack.Screen
        name="request-link"
        options={{
          presentation: "modal",
          animation: "slide_from_bottom",
        }}
      />
    </Stack>
  );
}
