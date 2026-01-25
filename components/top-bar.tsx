import { useState } from 'react';
import { StyleSheet, View, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';

import { ThemedText } from '@/components/themed-text';
import { useThemeColor } from '@/hooks/use-theme-color';
import { Fonts } from '@/constants/theme';

export type ActivePage = 'portfolio' | 'home' | 'card';

interface TopBarProps {
  walletAddress: string;
  onPortfolioTap?: () => void;
  onCardTap?: () => void;
  cardCount?: number;
  activePage?: ActivePage;
}

export function TopBar({ walletAddress, onPortfolioTap, onCardTap, cardCount = 0, activePage = 'home' }: TopBarProps) {
  const [copied, setCopied] = useState(false);

  const primaryColor = useThemeColor({}, 'tint');
  const mutedColor = useThemeColor({ light: '#687076', dark: '#9BA1A6' }, 'icon');
  const cardBg = useThemeColor({ light: 'rgba(0,0,0,0.05)', dark: 'rgba(255,255,255,0.08)' }, 'background');
  const borderColor = useThemeColor({ light: 'rgba(0,0,0,0.08)', dark: 'rgba(255,255,255,0.1)' }, 'background');

  // Active states for icons
  const isPortfolioActive = activePage === 'portfolio';
  const isCardActive = activePage === 'card';

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
    <View style={styles.container} testID="top-bar">
      {/* Left: Portfolio Icon */}
      <Pressable
        onPress={handlePortfolioTap}
        testID="topbar-portfolio"
        style={({ pressed }) => [
          styles.iconButton,
          {
            backgroundColor: isPortfolioActive ? `${primaryColor}15` : cardBg,
            borderColor: isPortfolioActive ? primaryColor : borderColor,
          },
          pressed && styles.pressed,
        ]}
      >
        <Ionicons
          name={isPortfolioActive ? "layers" : "layers-outline"}
          size={20}
          color={isPortfolioActive ? primaryColor : mutedColor}
        />
      </Pressable>

      {/* Center: Wallet Address Pill */}
      <Pressable
        onPress={handleCopyAddress}
        testID="topbar-wallet-address"
        style={({ pressed }) => [
          styles.addressPill,
          { backgroundColor: cardBg, borderColor },
          pressed && styles.pressed,
        ]}
      >
        <LinearGradient
          colors={['#10b981', '#34d399']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.connectionIcon}
        >
          <Ionicons name="finger-print" size={16} color="#fff" />
        </LinearGradient>
        <ThemedText style={styles.addressText}>{truncatedAddress}</ThemedText>
        <Ionicons
          name={copied ? 'checkmark' : 'copy-outline'}
          size={14}
          color={copied ? primaryColor : mutedColor}
          style={styles.copyIcon}
        />
      </Pressable>

      {/* Right: Card Icon with Badge */}
      <Pressable
        onPress={handleCardTap}
        testID="topbar-cards"
        style={({ pressed }) => [
          styles.iconButton,
          {
            backgroundColor: isCardActive ? `${primaryColor}15` : cardBg,
            borderColor: isCardActive ? primaryColor : borderColor,
          },
          pressed && styles.pressed,
        ]}
      >
        <Ionicons
          name={isCardActive ? "card" : "card-outline"}
          size={20}
          color={isCardActive ? primaryColor : mutedColor}
        />
        {cardCount > 0 && !isCardActive && (
          <View style={styles.cardBadge}>
            <ThemedText style={styles.cardBadgeText}>{cardCount > 9 ? '9+' : cardCount}</ThemedText>
          </View>
        )}
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
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  addressPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 6,
    paddingVertical: 6,
    borderRadius: 24,
    borderWidth: 1,
  },
  connectionIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addressText: {
    fontSize: 14,
    fontFamily: Fonts.mono,
  },
  copyIcon: {
    marginRight: 4,
  },
  pressed: {
    opacity: 0.7,
    transform: [{ scale: 0.95 }],
  },
  cardBadge: {
    position: 'absolute',
    top: -4,
    right: -4,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#10b981',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  cardBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#fff',
  },
});
