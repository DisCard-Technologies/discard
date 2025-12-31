import { useState } from 'react';
import { StyleSheet, View, Pressable, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';

import { ThemedText } from '@/components/themed-text';
import { useThemeColor } from '@/hooks/use-theme-color';

interface TopBarProps {
  walletAddress: string;
  onIdentityTap: () => void;
  onHistoryTap: () => void;
  onSettingsTap: () => void;
}

export function TopBar({ walletAddress, onIdentityTap, onHistoryTap, onSettingsTap }: TopBarProps) {
  const [copied, setCopied] = useState(false);

  const primaryColor = useThemeColor({}, 'tint');
  const mutedColor = useThemeColor({ light: '#687076', dark: '#9BA1A6' }, 'icon');
  const cardBg = useThemeColor({ light: 'rgba(0,0,0,0.05)', dark: 'rgba(255,255,255,0.08)' }, 'background');
  const borderColor = useThemeColor({ light: 'rgba(0,0,0,0.08)', dark: 'rgba(255,255,255,0.1)' }, 'background');

  const truncatedAddress = `${walletAddress.slice(0, 4)}...${walletAddress.slice(-4)}`;

  const handleCopyAddress = async () => {
    await Clipboard.setStringAsync(walletAddress);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <View style={styles.container}>
      {/* Left side: Fingerprint + Wallet Address Pill */}
      <View style={styles.leftGroup}>
        <Pressable
          onPress={onIdentityTap}
          style={({ pressed }) => [
            styles.identityButton,
            { backgroundColor: cardBg, borderColor },
            pressed && styles.pressed,
          ]}
        >
          <Ionicons name="finger-print" size={20} color={primaryColor} />
          <View style={[styles.glowRing, { backgroundColor: `${primaryColor}20` }]} />
        </Pressable>

        <Pressable
          onPress={handleCopyAddress}
          style={({ pressed }) => [
            styles.addressPill,
            { backgroundColor: cardBg, borderColor },
            pressed && styles.pressed,
          ]}
        >
          <ThemedText style={styles.addressText}>{truncatedAddress}</ThemedText>
          <Ionicons
            name={copied ? 'checkmark' : 'copy-outline'}
            size={14}
            color={copied ? primaryColor : mutedColor}
          />
        </Pressable>
      </View>

      {/* Right side: History + Settings */}
      <View style={styles.rightGroup}>
        <Pressable
          onPress={onHistoryTap}
          style={({ pressed }) => [
            styles.iconButton,
            { backgroundColor: cardBg, borderColor },
            pressed && styles.pressed,
          ]}
        >
          <Ionicons name="time-outline" size={20} color={mutedColor} />
        </Pressable>

        <Pressable
          onPress={onSettingsTap}
          style={({ pressed }) => [
            styles.iconButton,
            { backgroundColor: cardBg, borderColor },
            pressed && styles.pressed,
          ]}
        >
          <Ionicons name="settings-outline" size={20} color={mutedColor} />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  leftGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  rightGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  identityButton: {
    position: 'relative',
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  glowRing: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: 22,
  },
  addressPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 22,
    borderWidth: 1,
    minHeight: 44,
  },
  addressText: {
    fontSize: 13,
    fontFamily: 'monospace',
    opacity: 0.7,
  },
  iconButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  pressed: {
    opacity: 0.7,
    transform: [{ scale: 0.96 }],
  },
});

