import { View, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { BottomTabBarProps } from '@react-navigation/bottom-tabs';

import { ThemedText } from '@/components/themed-text';
import { useThemeColor } from '@/hooks/use-theme-color';

type IconName = 'home' | 'layers' | 'swap-horizontal' | 'card';

const tabConfig: Record<string, { icon: IconName; label: string }> = {
  index: { icon: 'home', label: 'Home' },
  holdings: { icon: 'layers', label: 'Holdings' },
  transfer: { icon: 'swap-horizontal', label: 'Transfer' },
  card: { icon: 'card', label: 'Card' },
};

export function PillTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const primaryColor = useThemeColor({}, 'tint');
  const mutedColor = useThemeColor({ light: '#687076', dark: '#9BA1A6' }, 'icon');
  const bgColor = useThemeColor({ light: '#ffffff', dark: '#151718' }, 'background');

  return (
    <View style={[styles.container, { paddingBottom: Math.max(insets.bottom, 12), backgroundColor: bgColor }]}>
      <View style={styles.nav}>
        {state.routes.map((route, index) => {
          const { options } = descriptors[route.key];
          const isFocused = state.index === index;
          const config = tabConfig[route.name] || { icon: 'home', label: route.name };

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
                isFocused && [styles.tabActive, { backgroundColor: `${primaryColor}15` }],
                pressed && styles.tabPressed,
              ]}
            >
              <Ionicons
                name={config.icon}
                size={18}
                color={isFocused ? primaryColor : mutedColor}
              />
              {isFocused && (
                <ThemedText style={[styles.label, { color: primaryColor }]}>
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
  nav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  tab: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 24,
  },
  tabActive: {
    paddingHorizontal: 16,
  },
  tabPressed: {
    opacity: 0.7,
  },
  label: {
    fontSize: 12,
    fontWeight: '500',
  },
});

