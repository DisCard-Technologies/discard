import React from 'react';
import { StyleSheet, View, ViewStyle } from 'react-native';
import { PressableScale } from 'pressto';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { BottomTabBarProps } from '@react-navigation/bottom-tabs';

import { ThemedText } from '@/components/themed-text';
import { useColorScheme } from '@/hooks/use-color-scheme';

type IconName = 'home' | 'swap-horizontal' | 'search' | 'grid';

interface TabConfig {
  icon: IconName;
  label: string;
}

// Default tab configuration
const DEFAULT_TAB_CONFIG: Record<string, TabConfig> = {
  index: { icon: 'home', label: 'Home' },
  transfer: { icon: 'swap-horizontal', label: 'Transfer' },
  explore: { icon: 'search', label: 'Explore' },
  menu: { icon: 'grid', label: 'Menu' },
};

// Theme colors
const DOCK_BG_LIGHT = 'rgba(0,0,0,0.05)';
const DOCK_BG_DARK = 'rgba(255,255,255,0.08)';
const BORDER_LIGHT = 'rgba(0,0,0,0.08)';
const BORDER_DARK = 'rgba(255,255,255,0.1)';
const ACTIVE_COLOR = '#10B981';
const INACTIVE_ICON_COLOR = '#6B7280';
const INACTIVE_ICON_COLOR_DARK = '#9BA1A6';

export interface PillNavBarProps extends Partial<BottomTabBarProps> {
  tabConfig?: Record<string, TabConfig>;
  style?: ViewStyle;
}

export const PillNavBar = React.memo(function PillNavBar({
  state,
  descriptors,
  navigation,
  tabConfig = DEFAULT_TAB_CONFIG,
  style,
}: PillNavBarProps) {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  const dockBg = isDark ? DOCK_BG_DARK : DOCK_BG_LIGHT;
  const borderColor = isDark ? BORDER_DARK : BORDER_LIGHT;
  const iconColor = isDark ? INACTIVE_ICON_COLOR_DARK : INACTIVE_ICON_COLOR;

  if (!state || !descriptors || !navigation) {
    return null;
  }

  const navRoutes = state.routes.filter((route) => tabConfig[route.name]);

  const renderNavItem = (route: (typeof navRoutes)[0]) => {
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

    return (
      <PressableScale
        key={route.key}
        accessibilityRole="button"
        accessibilityState={isFocused ? { selected: true } : {}}
        accessibilityLabel={options.tabBarAccessibilityLabel}
        onPress={onPress}
        style={[
          styles.navItem,
          isFocused && styles.navItemActive,
        ]}
      >
        <Ionicons
          name={config.icon}
          size={20}
          color={isFocused ? '#FFFFFF' : iconColor}
        />
        <ThemedText
          style={[
            styles.navLabel,
            isFocused && styles.navLabelActive,
            !isFocused && { color: iconColor },
          ]}
        >
          {config.label}
        </ThemedText>
      </PressableScale>
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: dockBg, borderColor }, style]}>
      {navRoutes.map((route) => renderNavItem(route))}
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
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
});
