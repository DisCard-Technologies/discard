import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface ContactAvatarProps {
  initials: string;
  name: string;
  handle: string;
  verified?: boolean;
  size?: 'sm' | 'md' | 'lg';
  onPress?: () => void;
  showName?: boolean;
}

const sizeStyles = {
  sm: { container: 40, text: 14, badge: 14, badgeIcon: 8 },
  md: { container: 48, text: 16, badge: 16, badgeIcon: 10 },
  lg: { container: 64, text: 20, badge: 20, badgeIcon: 14 },
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
  const sizes = sizeStyles[size];

  const content = (
    <View style={styles.wrapper}>
      <View style={styles.avatarContainer}>
        {/* Avatar with gradient-like background */}
        <View style={[
          styles.avatar,
          {
            width: sizes.container,
            height: sizes.container,
            borderRadius: sizes.container / 2,
          }
        ]}>
          <Text style={[styles.initials, { fontSize: sizes.text }]}>
            {initials}
          </Text>
        </View>

        {/* Verified badge */}
        {verified && (
          <View style={[
            styles.badge,
            {
              width: sizes.badge,
              height: sizes.badge,
              borderRadius: sizes.badge / 2,
            }
          ]}>
            <Ionicons name="checkmark" size={sizes.badgeIcon} color="#FFFFFF" />
          </View>
        )}
      </View>

      {/* Name */}
      {showName && (
        <Text style={styles.name} numberOfLines={1}>
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

const styles = StyleSheet.create({
  wrapper: {
    alignItems: 'center',
  },
  avatarContainer: {
    position: 'relative',
  },
  avatar: {
    // Gradient-like background matching Next.js version
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  initials: {
    fontWeight: '500',
    color: '#FFFFFF',
  },
  badge: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    backgroundColor: '#10B981',
    alignItems: 'center',
    justifyContent: 'center',
  },
  name: {
    fontSize: 12,
    color: '#9CA3AF',
    marginTop: 8,
    textAlign: 'center',
    maxWidth: 64,
  },
});

