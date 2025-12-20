import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { cn } from '../../lib/utils';

interface ContactAvatarProps {
  initials: string;
  name: string;
  handle: string;
  verified?: boolean;
  size?: 'sm' | 'md' | 'lg';
  onPress?: () => void;
  showName?: boolean;
}

const sizeClasses = {
  sm: { container: 'w-10 h-10', text: 'text-sm', badge: 'w-3.5 h-3.5' },
  md: { container: 'w-12 h-12', text: 'text-base', badge: 'w-4 h-4' },
  lg: { container: 'w-16 h-16', text: 'text-xl', badge: 'w-5 h-5' },
};

export function ContactAvatar({ 
  initials, 
  name, 
  handle, 
  verified = false, 
  size = 'md',
  onPress,
  showName = false
}: ContactAvatarProps) {
  const sizes = sizeClasses[size];

  const content = (
    <View className="items-center">
      <View className="relative">
        {/* Avatar */}
        <View className={cn(
          'rounded-full bg-gradient-to-br from-primary/20 to-accent/20 items-center justify-center',
          sizes.container
        )} style={{ backgroundColor: '#1F2937' }}>
          <Text className={cn('font-medium text-foreground', sizes.text)}>
            {initials}
          </Text>
        </View>

        {/* Verified badge */}
        {verified && (
          <View className={cn(
            'absolute -bottom-0.5 -right-0.5 rounded-full bg-primary items-center justify-center',
            sizes.badge
          )}>
            <Ionicons name="checkmark" size={size === 'lg' ? 14 : 10} color="#FFFFFF" />
          </View>
        )}
      </View>

      {/* Name */}
      {showName && (
        <Text className="text-xs text-muted-foreground mt-2 text-center max-w-[64px]" numberOfLines={1}>
          {name.split(' ')[0]}
        </Text>
      )}
    </View>
  );

  if (onPress) {
    return (
      <TouchableOpacity onPress={onPress} activeOpacity={0.7}>
        {content}
      </TouchableOpacity>
    );
  }

  return content;
}

