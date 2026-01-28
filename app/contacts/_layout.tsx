import { Stack } from "expo-router";

export default function ContactsLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="add" />
      <Stack.Screen name="import" />
      <Stack.Screen name="[id]" />
    </Stack>
  );
}
