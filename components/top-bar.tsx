import { useState } from 'react';
import { StyleSheet, View, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';

import { ThemedText } from '@/components/themed-text';
import { useThemeColor } from '@/hooks/use-theme-color';

interface TopBarProps {
  walletAddress: string;
  onPortfolioTap?: () => void;
  onCardTap?: () => void;
}

export function TopBar({ walletAddress, onPortfolioTap, onCardTap }: TopBarProps) {
  const [copied, setCopied] = useState(false);

  const primaryColor = useThemeColor({}, 'tint');
  const mutedColor = useThemeColor({ light: '#687076', dark: '#9BA1A6' }, 'icon');
  const cardBg = useThemeColor({ light: 'rgba(0,0,0,0.05)', dark: 'rgba(255,255,255,0.08)' }, 'background');
  const borderColor = useThemeColor({ light: 'rgba(0,0,0,0.08)', dark: 'rgba(255,255,255,0.1)' }, 'background');

  const truncatedAddress = walletAddress
    ? `${walletAddress.slice(0, 4)}...${walletAddress.slice(-4)}`
    : 'No wallet';

  const handleCopyAddress = async () => {
    if (!walletAddress) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await Clipboard.setStringAsync(walletAddress);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handlePortfolioTap = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onPortfolioTap?.();
  };

  const handleCardTap = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onCardTap?.();
  };

  return (
    <View style={styles.container}>
      {/* Left: Portfolio Icon */}
      <Pressable
        onPress={handlePortfolioTap}
        style={({ pressed }) => [
          styles.iconButton,
          { backgroundColor: cardBg, borderColor },
          pressed && styles.pressed,
        ]}
      >
        <Ionicons name="layers-outline" size={20} color={mutedColor} />
      </Pressable>

      {/* Center: Wallet Address Pill */}
      <Pressable
        onPress={handleCopyAddress}
        style={({ pressed }) => [
          styles.addressPill,
          { backgroundColor: cardBg, borderColor },
          pressed && styles.pressed,
        ]}
      >
        <View style={[styles.connectionIcon, { backgroundColor: `${primaryColor}30` }]}>
          <Ionicons name="wifi" size={12} color={primaryColor} />
        </View>
        <ThemedText style={styles.addressText}>{truncatedAddress}</ThemedText>
        <Ionicons
          name={copied ? 'checkmark' : 'copy-outline'}
          size={14}
          color={copied ? primaryColor : mutedColor}
        />
      </Pressable>

      {/* Right: Card Icon */}
      <Pressable
        onPress={handleCardTap}
        style={({ pressed }) => [
          styles.iconButton,
          { backgroundColor: cardBg, borderColor },
          pressed && styles.pressed,
        ]}
      >
        <Ionicons name="card-outline" size={20} color={mutedColor} />
      </Pressable>
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
  iconButton: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  addressPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 22,
    borderWidth: 1,
    minHeight: 44,
  },
  connectionIcon: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addressText: {
    fontSize: 13,
    fontFamily: 'monospace',
    opacity: 0.9,
  },
  pressed: {
    opacity: 0.7,
    transform: [{ scale: 0.96 }],
  },
});
