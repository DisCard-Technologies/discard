import { View, StyleSheet } from 'react-native';
import { Tabs, usePathname } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { FloatingNavBar } from '@/components/floating-nav-bar';
import { FloatingCommandBar } from '@/components/floating-command-bar';
import { ErrorBoundary } from '@/components/ui/error-boundary';

export default function TabLayout() {
  const insets = useSafeAreaInsets();
  const pathname = usePathname();

  // Hide command bar on transfer screen
  const hideCommandBar = pathname === '/transfer';

  // Calculate bottom offset for command bar:
  // New compact navbar: content (56) + paddingTop (8) + paddingBottom + gap
  const navbarHeight = 56 + 8 + Math.max(insets.bottom, 12);
  const commandBarBottomOffset = navbarHeight + 8;

  return (
    <View style={styles.container}>
      <ErrorBoundary>
        <Tabs
          tabBar={(props) => <FloatingNavBar {...props} />}
          screenOptions={{
            headerShown: false,
          }}
        >
          <Tabs.Screen name="index" />
          <Tabs.Screen name="explore" />
          <Tabs.Screen name="transfer" />
          <Tabs.Screen name="menu" />
          {/* Hidden screens - embedded in SwipeableMainView pager, accessible via swipe gestures */}
          <Tabs.Screen name="portfolio" options={{ href: null }} />
          <Tabs.Screen name="card" options={{ href: null }} />
        </Tabs>
      </ErrorBoundary>

      {!hideCommandBar && <FloatingCommandBar bottomOffset={commandBarBottomOffset} />}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});
