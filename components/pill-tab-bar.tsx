import { View, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { BottomTabBarProps } from '@react-navigation/bottom-tabs';

import { ThemedText } from '@/components/themed-text';
import { useThemeColor } from '@/hooks/use-theme-color';

type IconName = 'home' | 'search' | 'swap-horizontal' | 'grid';

interface TabConfig {
  icon: IconName;
  label: string;
}

const tabConfig: Record<string, TabConfig> = {
  index: { icon: 'home', label: 'Home' },
  explore: { icon: 'search', label: 'Search' },
  transfer: { icon: 'swap-horizontal', label: 'Transfer' },
  menu: { icon: 'grid', label: 'Menu' },
};

// Tab bar colors
const TAB_BUTTON_BG = '#2a2a2e';
const ACTIVE_COLOR = '#10B981';
const INACTIVE_ICON_COLOR = '#9BA1A6';

export function PillTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const cardColor = useThemeColor({}, 'card');

  // Filter routes to only include those with tab config (excludes hidden screens)
  const visibleRoutes = state.routes.filter((route) => tabConfig[route.name]);

  return (
    <View style={[styles.container, { paddingBottom: Math.max(insets.bottom, 12), backgroundColor: cardColor }]}>
      <View style={styles.navContainer}>
        {visibleRoutes.map((route) => {
          const { options } = descriptors[route.key];
          const routeIndex = state.routes.findIndex((r) => r.key === route.key);
          const isFocused = state.index === routeIndex;
          const config = tabConfig[route.name];

          const onPress = () => {
            const event = navigation.emit({
              type: 'tabPress',
              target: route.key,
              canPreventDefault: true,
            });

            if (!isFocused && !event.defaultPrevented) {
              if (process.env.EXPO_OS === 'ios') {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              }
              navigation.navigate(route.name);
            }
          };

          const onLongPress = () => {
            navigation.emit({
              type: 'tabLongPress',
              target: route.key,
            });
          };

          return (
            <Pressable
              key={route.key}
              accessibilityRole="button"
              accessibilityState={isFocused ? { selected: true } : {}}
              accessibilityLabel={options.tabBarAccessibilityLabel}
              onPress={onPress}
              onLongPress={onLongPress}
              style={({ pressed }) => [
                styles.tab,
                isFocused ? styles.tabActive : styles.tabInactive,
                pressed && styles.tabPressed,
              ]}
            >
              <View style={[
                styles.iconContainer,
                isFocused && styles.iconContainerActive,
              ]}>
                <Ionicons
                  name={config.icon}
                  size={20}
                  color={isFocused ? '#FFFFFF' : INACTIVE_ICON_COLOR}
                />
              </View>
              {isFocused && (
                <ThemedText style={styles.label}>
                  {config.label}
                </ThemedText>
              )}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
  },
  navContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  tab: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  tabInactive: {
    // Inactive tabs are just the circular icon button
  },
  tabActive: {
    backgroundColor: TAB_BUTTON_BG,
    borderRadius: 26,
    paddingRight: 16,
    paddingLeft: 4,
    paddingVertical: 4,
    gap: 8,
  },
  tabPressed: {
    opacity: 0.7,
    transform: [{ scale: 0.96 }],
  },
  iconContainer: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: TAB_BUTTON_BG,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconContainerActive: {
    backgroundColor: ACTIVE_COLOR,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: INACTIVE_ICON_COLOR,
  },
});
