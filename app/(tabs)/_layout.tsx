import { Tabs } from 'expo-router';

import { PillTabBar } from '@/components/pill-tab-bar';

export default function TabLayout() {
  return (
    <Tabs
      tabBar={(props) => <PillTabBar {...props} />}
      screenOptions={{
        headerShown: false,
      }}
    >
      <Tabs.Screen name="index" />
      <Tabs.Screen name="holdings" />
      <Tabs.Screen name="transfer" />
      <Tabs.Screen name="card" />
    </Tabs>
  );
}
