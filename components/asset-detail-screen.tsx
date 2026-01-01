import { useState } from 'react';
import { StyleSheet, View, Pressable, ScrollView, Image } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useThemeColor } from '@/hooks/use-theme-color';

interface AssetDetailProps {
  asset: {
    name: string;
    type: 'nft' | 'rwa' | 'depin';
    image: string;
    value: number;
    change: number;
    // NFT specific
    collection?: string;
    tokenId?: string;
    rarity?: string;
    floorPrice?: number;
    lastSale?: number;
    // RWA specific
    yield?: number;
    minInvest?: string;
    totalValue?: string;
    location?: string;
    // DePIN specific
    earnings?: number;
    uptime?: string;
    network?: string;
  };
  owned?: boolean;
  onBack: () => void;
  onBuy?: () => void;
  onSell?: () => void;
  onSend?: () => void;
  onList?: () => void;
}

export function AssetDetailScreen({
  asset,
  owned = false,
  onBack,
  onBuy,
  onSell,
  onSend,
  onList,
}: AssetDetailProps) {
  const insets = useSafeAreaInsets();
  const [isWatchlisted, setIsWatchlisted] = useState(false);
  const [copied, setCopied] = useState(false);

  const primaryColor = useThemeColor({}, 'tint');
  const mutedColor = useThemeColor({ light: '#687076', dark: '#9BA1A6' }, 'icon');
  const textColor = useThemeColor({}, 'text');
  const cardBg = useThemeColor({ light: '#f4f4f5', dark: '#1c1c1e' }, 'background');
  const borderColor = useThemeColor(
    { light: 'rgba(0,0,0,0.08)', dark: 'rgba(255,255,255,0.1)' },
    'background'
  );

  const handleCopyAddress = async () => {
    await Clipboard.setStringAsync(`0x1a2b3c...${asset.name.slice(0, 4)}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const isPositive = asset.change >= 0;

  const getTypeColor = () => {
    switch (asset.type) {
      case 'nft':
        return '#a855f7'; // purple
      case 'rwa':
        return '#3b82f6'; // blue
      case 'depin':
        return primaryColor;
    }
  };

  const getTypeIcon = (): keyof typeof Ionicons.glyphMap => {
    switch (asset.type) {
      case 'nft':
        return 'diamond';
      case 'rwa':
        return 'business';
      case 'depin':
        return 'hardware-chip';
    }
  };

  const typeColor = getTypeColor();

  return (
    <ThemedView style={styles.container}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <Pressable onPress={onBack} style={styles.backButton}>
          <Ionicons name="arrow-back" size={20} color={textColor} />
        </Pressable>
        <View style={[styles.typeBadge, { backgroundColor: `${typeColor}20`, borderColor: `${typeColor}30` }]}>
          <Ionicons name={getTypeIcon()} size={14} color={typeColor} />
          <ThemedText style={[styles.typeBadgeText, { color: typeColor }]}>
            {asset.type.toUpperCase()}
          </ThemedText>
        </View>
        <Pressable onPress={() => setIsWatchlisted(!isWatchlisted)} style={styles.watchlistButton}>
          <Ionicons
            name={isWatchlisted ? 'star' : 'star-outline'}
            size={20}
            color={isWatchlisted ? '#f59e0b' : mutedColor}
          />
        </Pressable>
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 20 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Asset Image */}
        <View style={styles.imageContainer}>
          <View style={styles.imageWrapper}>
            {asset.image ? (
              <Image source={{ uri: asset.image }} style={styles.assetImage} />
            ) : (
              <View style={[styles.imagePlaceholder, { backgroundColor: typeColor }]}>
                <ThemedText style={styles.imagePlaceholderText}>{asset.name.charAt(0)}</ThemedText>
              </View>
            )}
            {asset.rarity && (
              <View style={[styles.rarityBadge, { backgroundColor: 'rgba(0,0,0,0.7)' }]}>
                <ThemedText style={styles.rarityText}>{asset.rarity}</ThemedText>
              </View>
            )}
          </View>
        </View>

        {/* Asset Name & Value */}
        <View style={styles.nameSection}>
          <ThemedText style={styles.assetName}>{asset.name}</ThemedText>
          {asset.collection && (
            <ThemedText style={[styles.collectionName, { color: mutedColor }]}>
              {asset.collection}
            </ThemedText>
          )}
          <ThemedText style={styles.assetValue}>${asset.value.toLocaleString()}</ThemedText>
          <View style={styles.changeRow}>
            <Ionicons
              name={isPositive ? 'trending-up' : 'trending-down'}
              size={16}
              color={isPositive ? '#22c55e' : '#ef4444'}
            />
            <ThemedText style={[styles.changeText, { color: isPositive ? '#22c55e' : '#ef4444' }]}>
              {isPositive ? '+' : ''}{asset.change.toFixed(1)}%
            </ThemedText>
          </View>
        </View>

        {/* Type-specific Stats */}
        <ThemedView style={styles.statsCard} lightColor="#f4f4f5" darkColor="#1c1c1e">
          {asset.type === 'nft' && (
            <>
              <ThemedText style={[styles.statsTitle, { color: mutedColor }]}>NFT Details</ThemedText>
              <View style={styles.statsGrid}>
                {asset.floorPrice !== undefined && (
                  <View style={styles.statItem}>
                    <ThemedText style={[styles.statLabel, { color: mutedColor }]}>Floor Price</ThemedText>
                    <ThemedText style={styles.statValue}>${asset.floorPrice.toLocaleString()}</ThemedText>
                  </View>
                )}
                {asset.lastSale !== undefined && (
                  <View style={styles.statItem}>
                    <ThemedText style={[styles.statLabel, { color: mutedColor }]}>Last Sale</ThemedText>
                    <ThemedText style={styles.statValue}>${asset.lastSale.toLocaleString()}</ThemedText>
                  </View>
                )}
                {asset.tokenId && (
                  <View style={styles.statItem}>
                    <ThemedText style={[styles.statLabel, { color: mutedColor }]}>Token ID</ThemedText>
                    <ThemedText style={styles.statValue}>#{asset.tokenId}</ThemedText>
                  </View>
                )}
                {asset.rarity && (
                  <View style={styles.statItem}>
                    <ThemedText style={[styles.statLabel, { color: mutedColor }]}>Rarity</ThemedText>
                    <ThemedText style={[styles.statValue, { color: '#f59e0b' }]}>{asset.rarity}</ThemedText>
                  </View>
                )}
              </View>
            </>
          )}

          {asset.type === 'rwa' && (
            <>
              <ThemedText style={[styles.statsTitle, { color: mutedColor }]}>Investment Details</ThemedText>
              <View style={styles.statsGrid}>
                {asset.yield !== undefined && asset.yield > 0 && (
                  <View style={styles.statItem}>
                    <View style={styles.statLabelRow}>
                      <Ionicons name="trending-up" size={12} color="#22c55e" />
                      <ThemedText style={[styles.statLabel, { color: mutedColor }]}>APY</ThemedText>
                    </View>
                    <ThemedText style={[styles.statValue, { color: '#22c55e' }]}>{asset.yield}%</ThemedText>
                  </View>
                )}
                {asset.totalValue && (
                  <View style={styles.statItem}>
                    <View style={styles.statLabelRow}>
                      <Ionicons name="bar-chart" size={12} color={mutedColor} />
                      <ThemedText style={[styles.statLabel, { color: mutedColor }]}>Total Value</ThemedText>
                    </View>
                    <ThemedText style={styles.statValue}>{asset.totalValue}</ThemedText>
                  </View>
                )}
                {asset.minInvest && (
                  <View style={styles.statItem}>
                    <View style={styles.statLabelRow}>
                      <Ionicons name="cash" size={12} color={mutedColor} />
                      <ThemedText style={[styles.statLabel, { color: mutedColor }]}>Min Investment</ThemedText>
                    </View>
                    <ThemedText style={styles.statValue}>{asset.minInvest}</ThemedText>
                  </View>
                )}
                {asset.location && (
                  <View style={styles.statItem}>
                    <View style={styles.statLabelRow}>
                      <Ionicons name="business" size={12} color={mutedColor} />
                      <ThemedText style={[styles.statLabel, { color: mutedColor }]}>Location</ThemedText>
                    </View>
                    <ThemedText style={styles.statValue}>{asset.location}</ThemedText>
                  </View>
                )}
              </View>
            </>
          )}

          {asset.type === 'depin' && (
            <>
              <ThemedText style={[styles.statsTitle, { color: mutedColor }]}>Device Stats</ThemedText>
              <View style={styles.statsGrid}>
                {asset.earnings !== undefined && (
                  <View style={styles.statItem}>
                    <View style={styles.statLabelRow}>
                      <Ionicons name="cash" size={12} color="#22c55e" />
                      <ThemedText style={[styles.statLabel, { color: mutedColor }]}>Monthly Earnings</ThemedText>
                    </View>
                    <ThemedText style={[styles.statValue, { color: '#22c55e' }]}>${asset.earnings}/mo</ThemedText>
                  </View>
                )}
                {asset.uptime && (
                  <View style={styles.statItem}>
                    <View style={styles.statLabelRow}>
                      <Ionicons name="time" size={12} color={mutedColor} />
                      <ThemedText style={[styles.statLabel, { color: mutedColor }]}>Uptime</ThemedText>
                    </View>
                    <ThemedText style={styles.statValue}>{asset.uptime}</ThemedText>
                  </View>
                )}
                {asset.network && (
                  <View style={styles.statItem}>
                    <View style={styles.statLabelRow}>
                      <Ionicons name="hardware-chip" size={12} color={mutedColor} />
                      <ThemedText style={[styles.statLabel, { color: mutedColor }]}>Network</ThemedText>
                    </View>
                    <ThemedText style={styles.statValue}>{asset.network}</ThemedText>
                  </View>
                )}
              </View>
            </>
          )}
        </ThemedView>

        {/* Action Buttons */}
        <View style={styles.actionsSection}>
          {owned ? (
            <>
              <View style={styles.actionGrid}>
                <Pressable onPress={onSend} style={[styles.actionButton, { backgroundColor: cardBg }]}>
                  <Ionicons name="send" size={20} color={textColor} />
                  <ThemedText style={styles.actionButtonText}>Send</ThemedText>
                </Pressable>
                <Pressable
                  onPress={onList}
                  style={[styles.actionButton, { backgroundColor: `${primaryColor}15`, borderColor: `${primaryColor}30`, borderWidth: 1 }]}
                >
                  <Ionicons name="pricetag" size={20} color={primaryColor} />
                  <ThemedText style={[styles.actionButtonText, { color: primaryColor }]}>List</ThemedText>
                </Pressable>
                <Pressable
                  onPress={onSell}
                  style={[styles.actionButton, { backgroundColor: 'rgba(239,68,68,0.15)', borderColor: 'rgba(239,68,68,0.3)', borderWidth: 1 }]}
                >
                  <Ionicons name="cash" size={20} color="#ef4444" />
                  <ThemedText style={[styles.actionButtonText, { color: '#ef4444' }]}>Sell</ThemedText>
                </Pressable>
              </View>
            </>
          ) : (
            <View style={styles.buyRow}>
              <Pressable onPress={onBuy} style={[styles.buyButton, { backgroundColor: primaryColor }]}>
                <Ionicons name="add" size={20} color="#fff" />
                <ThemedText style={styles.buyButtonText}>Buy Now</ThemedText>
              </Pressable>
              <Pressable
                onPress={() => setIsWatchlisted(!isWatchlisted)}
                style={[
                  styles.watchlistActionButton,
                  isWatchlisted
                    ? { backgroundColor: 'rgba(245,158,11,0.2)', borderColor: 'rgba(245,158,11,0.3)' }
                    : { backgroundColor: cardBg },
                ]}
              >
                <Ionicons
                  name={isWatchlisted ? 'star' : 'star-outline'}
                  size={20}
                  color={isWatchlisted ? '#f59e0b' : textColor}
                />
                <ThemedText style={[styles.watchlistActionText, isWatchlisted && { color: '#f59e0b' }]}>
                  {isWatchlisted ? 'Watching' : 'Watchlist'}
                </ThemedText>
              </Pressable>
            </View>
          )}
        </View>

        {/* Contract Info */}
        <ThemedView style={styles.contractCard} lightColor="#f4f4f5" darkColor="#1c1c1e">
          <ThemedText style={[styles.statsTitle, { color: mutedColor }]}>Contract</ThemedText>
          <View style={styles.contractRow}>
            <ThemedText style={[styles.contractAddress, { color: mutedColor }]}>
              0x1a2b...{asset.name.slice(0, 4).toLowerCase()}
            </ThemedText>
            <View style={styles.contractActions}>
              <Pressable onPress={handleCopyAddress} style={styles.contractButton}>
                <Ionicons
                  name={copied ? 'checkmark' : 'copy-outline'}
                  size={16}
                  color={copied ? '#22c55e' : mutedColor}
                />
              </Pressable>
              <Pressable style={styles.contractButton}>
                <Ionicons name="open-outline" size={16} color={mutedColor} />
              </Pressable>
            </View>
          </View>
        </ThemedView>
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
  typeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
  },
  typeBadgeText: {
    fontSize: 10,
    fontWeight: '600',
  },
  watchlistButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
  },
  imageContainer: {
    alignItems: 'center',
    marginBottom: 20,
  },
  imageWrapper: {
    position: 'relative',
    width: 200,
    height: 200,
    borderRadius: 16,
    overflow: 'hidden',
  },
  assetImage: {
    width: '100%',
    height: '100%',
  },
  imagePlaceholder: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  imagePlaceholderText: {
    fontSize: 48,
    fontWeight: '600',
    color: '#fff',
  },
  rarityBadge: {
    position: 'absolute',
    top: 12,
    right: 12,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  rarityText: {
    fontSize: 10,
    fontWeight: '500',
    color: '#f59e0b',
  },
  nameSection: {
    alignItems: 'center',
    marginBottom: 20,
  },
  assetName: {
    fontSize: 20,
    fontWeight: '600',
    marginBottom: 4,
  },
  collectionName: {
    fontSize: 14,
    marginBottom: 12,
  },
  assetValue: {
    fontSize: 32,
    fontWeight: '300',
    marginBottom: 4,
  },
  changeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  changeText: {
    fontSize: 14,
    fontWeight: '500',
  },
  statsCard: {
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
  },
  statsTitle: {
    fontSize: 10,
    fontWeight: '500',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 12,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 16,
  },
  statItem: {
    width: '45%',
  },
  statLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 10,
    textTransform: 'uppercase',
  },
  statValue: {
    fontSize: 14,
    fontWeight: '500',
  },
  actionsSection: {
    marginBottom: 16,
  },
  actionGrid: {
    flexDirection: 'row',
    gap: 8,
  },
  actionButton: {
    flex: 1,
    alignItems: 'center',
    gap: 6,
    paddingVertical: 14,
    borderRadius: 14,
  },
  actionButtonText: {
    fontSize: 10,
    fontWeight: '500',
  },
  buyRow: {
    flexDirection: 'row',
    gap: 12,
  },
  buyButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 14,
  },
  buyButtonText: {
    fontSize: 16,
    fontWeight: '500',
    color: '#fff',
  },
  watchlistActionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  watchlistActionText: {
    fontSize: 14,
    fontWeight: '500',
  },
  contractCard: {
    borderRadius: 16,
    padding: 16,
  },
  contractRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  contractAddress: {
    fontSize: 12,
    fontFamily: 'monospace',
  },
  contractActions: {
    flexDirection: 'row',
    gap: 8,
  },
  contractButton: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

