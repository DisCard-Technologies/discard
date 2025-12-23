import React from 'react';
import { View, TouchableOpacity, Text } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Home, Layers, ArrowLeftRight, CreditCard, Fingerprint } from 'lucide-react-native';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';

const navItems = [
  { name: 'Home', icon: Home, label: 'Home' },
  { name: 'Holdings', icon: Layers, label: 'Holdings' },
  { name: 'Transfer', icon: ArrowLeftRight, label: 'Transfer' },
  { name: 'Card', icon: CreditCard, label: 'Card' },
  { name: 'Identity', icon: Fingerprint, label: 'Identity' },
] as const;

export function NavBar({ state, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();

  return (
    <View 
      className="absolute bottom-0 left-0 right-0 px-4"
      style={{ paddingBottom: Math.max(insets.bottom, 16) }}
    >
      <View className="flex-row items-center justify-center gap-2">
        {navItems.map((item, index) => {
          const isActive = state.index === index;
          const Icon = item.icon;

          return (
            <TouchableOpacity
              key={item.name}
              onPress={() => navigation.navigate(item.name)}
              activeOpacity={0.7}
              className={`flex-row items-center gap-2 py-2.5 px-4 rounded-full ${
                isActive
                  ? 'bg-primary/15'
                  : ''
              }`}
              style={isActive ? { backgroundColor: 'rgba(16, 185, 129, 0.15)' } : undefined}
            >
              <Icon
                size={18}
                color={isActive ? '#10B981' : '#6B7280'}
                strokeWidth={2}
              />
              {isActive && (
                <Text className="text-xs font-medium text-primary">
                  {item.label}
                </Text>
              )}
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

export default NavBar;

