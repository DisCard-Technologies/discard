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
      <Tabs.Screen name="explore" />
      <Tabs.Screen name="transfer" />
      <Tabs.Screen name="menu" />
      {/* Hidden screens - embedded in SwipeableMainView pager, accessible via swipe gestures */}
      <Tabs.Screen name="strategy" options={{ href: null }} />
      <Tabs.Screen name="card" options={{ href: null }} />
    </Tabs>
  );
}
