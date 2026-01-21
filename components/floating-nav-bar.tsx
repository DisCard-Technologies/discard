import { View, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { BottomTabBarProps } from '@react-navigation/bottom-tabs';

import { ThemedText } from '@/components/themed-text';
import { useColorScheme } from '@/hooks/use-color-scheme';

type IconName = 'home' | 'swap-horizontal' | 'search' | 'grid';

interface TabConfig {
  icon: IconName;
  label: string;
}

// Tab configuration for navigation items
const navTabConfig: Record<string, TabConfig> = {
  index: { icon: 'home', label: 'Home' },
  transfer: { icon: 'swap-horizontal', label: 'Transfer' },
  explore: { icon: 'search', label: 'Explore' },
  menu: { icon: 'grid', label: 'Menu' },
};

// Colors matching the design
const DOCK_BG_LIGHT = 'rgba(0,0,0,0.05)';
const DOCK_BG_DARK = 'rgba(255,255,255,0.08)';
const BORDER_LIGHT = 'rgba(0,0,0,0.08)';
const BORDER_DARK = 'rgba(255,255,255,0.1)';
const ACTIVE_COLOR = '#10B981';
const INACTIVE_ICON_COLOR = '#6B7280';
const INACTIVE_ICON_COLOR_DARK = '#9BA1A6';

export interface FloatingNavBarProps extends BottomTabBarProps {}

export function FloatingNavBar({ state, descriptors, navigation }: FloatingNavBarProps) {
  const insets = useSafeAreaInsets();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  // Theme-aware colors
  const dockBg = isDark ? DOCK_BG_DARK : DOCK_BG_LIGHT;
  const borderColor = isDark ? BORDER_DARK : BORDER_LIGHT;
  const iconColor = isDark ? INACTIVE_ICON_COLOR_DARK : INACTIVE_ICON_COLOR;

  // Filter routes for nav items that have config
  const navRoutes = state.routes.filter((route) => navTabConfig[route.name]);

  const renderNavItem = (route: (typeof navRoutes)[0]) => {
    const { options } = descriptors[route.key];
    const routeIndex = state.routes.findIndex((r) => r.key === route.key);
    const isFocused = state.index === routeIndex;
    const config = navTabConfig[route.name];

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

    return (
      <Pressable
        key={route.key}
        accessibilityRole="button"
        accessibilityState={isFocused ? { selected: true } : {}}
        accessibilityLabel={options.tabBarAccessibilityLabel}
        onPress={onPress}
        style={({ pressed }) => [styles.navItem, isFocused && styles.navItemActive, pressed && styles.pressed]}
      >
        <Ionicons name={config.icon} size={20} color={isFocused ? '#FFFFFF' : iconColor} />
        <ThemedText style={[styles.navLabel, isFocused && styles.navLabelActive, !isFocused && { color: iconColor }]}>
          {config.label}
        </ThemedText>
      </Pressable>
    );
  };

  return (
    <View style={[styles.container, { paddingBottom: Math.max(insets.bottom, 8) }]}>
      <View style={[styles.navPill, { backgroundColor: dockBg, borderColor }]}>
        {navRoutes.map((route) => renderNavItem(route))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 16,
    paddingTop: 8,
    backgroundColor: 'transparent',
  },

  // Navigation Pill - static 4-item navbar
  navPill: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    borderRadius: 28,
    borderWidth: 1,
    paddingVertical: 6,
    paddingHorizontal: 8,
  },
  navItem: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 20,
  },
  navItemActive: {
    backgroundColor: ACTIVE_COLOR,
  },
  navLabel: {
    fontSize: 10,
    fontWeight: '600',
  },
  navLabelActive: {
    color: '#FFFFFF',
  },

  pressed: {
    opacity: 0.7,
    transform: [{ scale: 0.96 }],
  },
});
