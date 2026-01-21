import { View, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { BlurView } from 'expo-blur';
import { BottomTabBarProps } from '@react-navigation/bottom-tabs';

import { useColorScheme } from '@/hooks/use-color-scheme';

type IconName = keyof typeof Ionicons.glyphMap;

interface TabConfig {
  icon: IconName;
  iconActive: IconName;
}

// Tab configuration - icons only (no labels in new design)
const navTabConfig: Record<string, TabConfig> = {
  index: { icon: 'home-outline', iconActive: 'home' },
  explore: { icon: 'search-outline', iconActive: 'search' },
  transfer: { icon: 'swap-horizontal-outline', iconActive: 'swap-horizontal' },
  menu: { icon: 'grid-outline', iconActive: 'grid' },
};

// Colors
const ACTIVE_BG = 'rgba(255, 255, 255, 0.12)';
const ACTIVE_COLOR = '#10B981';
const INACTIVE_COLOR_LIGHT = '#6B7280';
const INACTIVE_COLOR_DARK = '#9BA1A6';

export interface FloatingNavBarProps extends BottomTabBarProps {}

export function FloatingNavBar({ state, descriptors, navigation }: FloatingNavBarProps) {
  const insets = useSafeAreaInsets();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const iconColor = isDark ? INACTIVE_COLOR_DARK : INACTIVE_COLOR_LIGHT;

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
        style={({ pressed }) => [
          styles.navItem,
          isFocused && styles.navItemActive,
          pressed && styles.pressed,
        ]}
      >
        <Ionicons
          name={isFocused ? config.iconActive : config.icon}
          size={22}
          color={isFocused ? '#FFFFFF' : iconColor}
        />

        {/* Active indicator dot */}
        {isFocused && <View style={styles.activeIndicator} />}
      </Pressable>
    );
  };

  return (
    <View style={[styles.container, { paddingBottom: Math.max(insets.bottom, 12) }]}>
      <View style={styles.navPill}>
        <BlurView intensity={40} tint="dark" style={styles.blurContainer}>
          <View style={styles.navContent}>
            {navRoutes.map((route) => renderNavItem(route))}
          </View>
        </BlurView>
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
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 8,
    backgroundColor: 'transparent',
    pointerEvents: 'box-none',
  },

  navPill: {
    borderRadius: 32,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },

  blurContainer: {
    overflow: 'hidden',
  },

  navContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: 'rgba(30, 30, 30, 0.8)',
  },

  navItem: {
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
    width: 48,
    height: 40,
    borderRadius: 20,
  },

  navItemActive: {
    backgroundColor: ACTIVE_BG,
  },

  activeIndicator: {
    position: 'absolute',
    bottom: 2,
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: ACTIVE_COLOR,
  },

  pressed: {
    opacity: 0.7,
    transform: [{ scale: 0.95 }],
  },
});
