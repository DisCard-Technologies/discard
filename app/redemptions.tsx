/**
 * Redemptions Screen
 *
 * View and manage purchased gift cards, prepaid cards, and vouchers.
 * Codes are encrypted and only visible when revealed.
 */

import { useState, useCallback, useMemo } from 'react';
import {
  StyleSheet,
  View,
  Pressable,
  ScrollView,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useThemeColor } from '@/hooks/use-theme-color';
import { useAuth } from '@/stores/authConvex';
import { usePrivateRwa } from '@/hooks/usePrivateRwa';
import type { RwaRedemption } from '@/services/privateRwaClient';

// Brand colors
const BRAND_COLORS: Record<string, string> = {
  Amazon: '#FF9900',
  Visa: '#1A1F71',
  Steam: '#1B2838',
  Uber: '#000000',
};

export default function RedemptionsScreen() {
  const insets = useSafeAreaInsets();

  // Theme
  const primaryColor = useThemeColor({}, 'tint');
  const mutedColor = useThemeColor({ light: '#687076', dark: '#9BA1A6' }, 'icon');
  const textColor = useThemeColor({}, 'text');
  const cardBg = useThemeColor({ light: '#f4f4f5', dark: '#1c1c1e' }, 'background');
  const borderColor = useThemeColor(
    { light: 'rgba(0,0,0,0.08)', dark: 'rgba(255,255,255,0.1)' },
    'background'
  );

  // Auth
  const { user } = useAuth();
  const walletAddress = user?.solanaAddress || undefined;

  // Private RWA hook
  const {
    redemptions,
    activeRedemptionsCount,
    markRedeemed,
    revealCode,
    isLoading,
  } = usePrivateRwa(walletAddress);

  // Local state for revealed codes
  const [revealedCodes, setRevealedCodes] = useState<Record<string, string>>({});
  const [revealingId, setRevealingId] = useState<string | null>(null);

  // Filter state
  const [activeFilter, setActiveFilter] = useState<'all' | 'active' | 'redeemed'>('all');

  // Filtered redemptions
  const filteredRedemptions = useMemo(() => {
    if (activeFilter === 'all') return redemptions;
    return redemptions.filter((r) => r.status === activeFilter);
  }, [redemptions, activeFilter]);

  // Handle reveal code
  const handleRevealCode = useCallback(async (redemption: RwaRedemption) => {
    if (revealedCodes[redemption.id]) {
      // Already revealed, just copy
      await Clipboard.setStringAsync(revealedCodes[redemption.id]);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert('Copied!', 'Code copied to clipboard');
      return;
    }

    setRevealingId(redemption.id);

    try {
      // Mock private key for demo
      const mockPrivateKey = new Uint8Array(32);

      // In production, this would decrypt the code
      // For demo, we use the code directly from the redemption
      const code = redemption.code || await revealCode(redemption.id, mockPrivateKey);

      if (code) {
        setRevealedCodes((prev) => ({ ...prev, [redemption.id]: code }));
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      } else {
        Alert.alert('Error', 'Failed to reveal code');
      }
    } catch (error) {
      console.error('[Redemptions] Reveal failed:', error);
      Alert.alert('Error', 'Failed to reveal code');
    }

    setRevealingId(null);
  }, [revealedCodes, revealCode]);

  // Handle copy code
  const handleCopyCode = useCallback(async (code: string) => {
    await Clipboard.setStringAsync(code);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    Alert.alert('Copied!', 'Code copied to clipboard');
  }, []);

  // Handle mark as redeemed
  const handleMarkRedeemed = useCallback(async (redemptionId: string) => {
    Alert.alert(
      'Mark as Redeemed?',
      'This will mark the code as used. You can still view it later.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Mark Redeemed',
          onPress: async () => {
            const success = await markRedeemed(redemptionId);
            if (success) {
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            }
          },
        },
      ]
    );
  }, [markRedeemed]);

  // Format expiry
  const formatExpiry = (timestamp?: number): string => {
    if (!timestamp) return 'No expiry';
    const date = new Date(timestamp);
    const now = new Date();
    const diffDays = Math.ceil((date.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

    if (diffDays < 0) return 'Expired';
    if (diffDays === 0) return 'Expires today';
    if (diffDays === 1) return 'Expires tomorrow';
    if (diffDays <= 7) return `Expires in ${diffDays} days`;
    return `Expires ${date.toLocaleDateString()}`;
  };

  // Render redemption card
  const renderRedemptionCard = (redemption: RwaRedemption) => {
    const brandColor = BRAND_COLORS[redemption.brand] || primaryColor;
    const isRevealed = !!revealedCodes[redemption.id];
    const isRevealing = revealingId === redemption.id;
    const isActive = redemption.status === 'active';
    const isExpired = redemption.expiresAt && Date.now() > redemption.expiresAt;

    return (
      <View
        key={redemption.id}
        style={[
          styles.redemptionCard,
          {
            backgroundColor: cardBg,
            borderColor: isActive ? `${brandColor}40` : borderColor,
            opacity: redemption.status === 'redeemed' ? 0.6 : 1,
          },
        ]}
      >
        {/* Header */}
        <View style={styles.cardHeader}>
          <View style={[styles.brandIcon, { backgroundColor: `${brandColor}20` }]}>
            <ThemedText style={[styles.brandIconText, { color: brandColor }]}>
              {redemption.brand.charAt(0)}
            </ThemedText>
          </View>
          <View style={styles.cardHeaderText}>
            <ThemedText style={styles.brandName}>{redemption.brand}</ThemedText>
            <ThemedText style={[styles.productType, { color: mutedColor }]}>
              {redemption.productType === 'gift_card' ? 'Gift Card' : 'Prepaid Card'}
            </ThemedText>
          </View>
          <View
            style={[
              styles.statusBadge,
              {
                backgroundColor:
                  isExpired
                    ? 'rgba(239,68,68,0.1)'
                    : isActive
                    ? 'rgba(34,197,94,0.1)'
                    : 'rgba(107,114,128,0.1)',
              },
            ]}
          >
            <ThemedText
              style={[
                styles.statusText,
                {
                  color: isExpired ? '#ef4444' : isActive ? '#22c55e' : mutedColor,
                },
              ]}
            >
              {isExpired ? 'Expired' : isActive ? 'Active' : 'Redeemed'}
            </ThemedText>
          </View>
        </View>

        {/* Code Section */}
        <View style={styles.codeSection}>
          {isRevealing ? (
            <ActivityIndicator color={brandColor} />
          ) : isRevealed ? (
            <Pressable
              onPress={() => handleCopyCode(revealedCodes[redemption.id])}
              style={[styles.codeContainer, { backgroundColor: `${brandColor}10` }]}
            >
              <ThemedText style={[styles.codeText, { color: brandColor }]}>
                {revealedCodes[redemption.id]}
              </ThemedText>
              <Ionicons name="copy-outline" size={18} color={brandColor} />
            </Pressable>
          ) : (
            <Pressable
              onPress={() => handleRevealCode(redemption)}
              style={[styles.revealButton, { backgroundColor: `${brandColor}15`, borderColor: `${brandColor}30` }]}
            >
              <Ionicons name="eye-outline" size={18} color={brandColor} />
              <ThemedText style={[styles.revealButtonText, { color: brandColor }]}>
                Tap to Reveal Code
              </ThemedText>
            </Pressable>
          )}
        </View>

        {/* Footer */}
        <View style={styles.cardFooter}>
          <ThemedText style={[styles.expiryText, { color: mutedColor }]}>
            {formatExpiry(redemption.expiresAt)}
          </ThemedText>
          <View style={styles.cardActions}>
            {redemption.redemptionUrl && (
              <Pressable
                onPress={() => Alert.alert('Redeem', `Open ${redemption.redemptionUrl}`)}
                style={styles.actionButton}
              >
                <Ionicons name="open-outline" size={16} color={mutedColor} />
              </Pressable>
            )}
            {isActive && (
              <Pressable
                onPress={() => handleMarkRedeemed(redemption.id)}
                style={styles.actionButton}
              >
                <Ionicons name="checkmark-circle-outline" size={16} color={mutedColor} />
              </Pressable>
            )}
          </View>
        </View>
      </View>
    );
  };

  return (
    <ThemedView style={styles.container}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <Pressable onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={20} color={textColor} />
        </Pressable>
        <ThemedText style={styles.headerTitle}>My Redemptions</ThemedText>
        <Pressable
          onPress={() => router.push('/rwa-purchase')}
          style={styles.addButton}
        >
          <Ionicons name="add" size={24} color={textColor} />
        </Pressable>
      </View>

      {/* Filter Tabs */}
      <View style={styles.filterTabs}>
        {(['all', 'active', 'redeemed'] as const).map((filter) => {
          const isActive = activeFilter === filter;
          const count = filter === 'all'
            ? redemptions.length
            : redemptions.filter((r) => r.status === filter).length;

          return (
            <Pressable
              key={filter}
              onPress={() => setActiveFilter(filter)}
              style={[
                styles.filterTab,
                isActive && { backgroundColor: `${primaryColor}15`, borderColor: primaryColor },
              ]}
            >
              <ThemedText
                style={[
                  styles.filterTabText,
                  isActive && { color: primaryColor },
                ]}
              >
                {filter.charAt(0).toUpperCase() + filter.slice(1)}
              </ThemedText>
              <View
                style={[
                  styles.filterCount,
                  { backgroundColor: isActive ? primaryColor : `${mutedColor}30` },
                ]}
              >
                <ThemedText
                  style={[
                    styles.filterCountText,
                    { color: isActive ? '#fff' : mutedColor },
                  ]}
                >
                  {count}
                </ThemedText>
              </View>
            </Pressable>
          );
        })}
      </View>

      <ScrollView
        style={styles.content}
        contentContainerStyle={[styles.contentContainer, { paddingBottom: insets.bottom + 24 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Empty State */}
        {filteredRedemptions.length === 0 && (
          <View style={styles.emptyState}>
            <View style={[styles.emptyStateIcon, { backgroundColor: cardBg }]}>
              <Ionicons name="gift-outline" size={48} color={mutedColor} />
            </View>
            <ThemedText style={styles.emptyStateTitle}>No Redemptions Yet</ThemedText>
            <ThemedText style={[styles.emptyStateText, { color: mutedColor }]}>
              Purchase gift cards privately to see them here
            </ThemedText>
            <Pressable
              onPress={() => router.push('/rwa-purchase')}
              style={[styles.emptyStateButton, { backgroundColor: primaryColor }]}
            >
              <Ionicons name="cart-outline" size={18} color="#fff" />
              <ThemedText style={styles.emptyStateButtonText}>Buy Gift Card</ThemedText>
            </Pressable>
          </View>
        )}

        {/* Redemption Cards */}
        {filteredRedemptions.map(renderRedemptionCard)}
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '600',
  },
  addButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterTabs: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    gap: 8,
    marginBottom: 16,
  },
  filterTab: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  filterTabText: {
    fontSize: 13,
    fontWeight: '500',
  },
  filterCount: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 10,
    minWidth: 20,
    alignItems: 'center',
  },
  filterCountText: {
    fontSize: 11,
    fontWeight: '600',
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    paddingHorizontal: 16,
  },
  emptyState: {
    alignItems: 'center',
    paddingTop: 60,
    paddingHorizontal: 32,
  },
  emptyStateIcon: {
    width: 96,
    height: 96,
    borderRadius: 48,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  emptyStateTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 8,
  },
  emptyStateText: {
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 24,
  },
  emptyStateButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 12,
  },
  emptyStateButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  redemptionCard: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    marginBottom: 12,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 16,
  },
  brandIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  brandIconText: {
    fontSize: 18,
    fontWeight: '700',
  },
  cardHeaderText: {
    flex: 1,
  },
  brandName: {
    fontSize: 16,
    fontWeight: '600',
  },
  productType: {
    fontSize: 12,
    marginTop: 2,
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  statusText: {
    fontSize: 11,
    fontWeight: '600',
  },
  codeSection: {
    marginBottom: 12,
  },
  codeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 14,
    borderRadius: 12,
  },
  codeText: {
    fontSize: 16,
    fontWeight: '600',
    fontFamily: 'monospace',
    letterSpacing: 1,
  },
  revealButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
  },
  revealButtonText: {
    fontSize: 14,
    fontWeight: '500',
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  expiryText: {
    fontSize: 12,
  },
  cardActions: {
    flexDirection: 'row',
    gap: 8,
  },
  actionButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
