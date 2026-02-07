/**
 * DisCard 2035 - Connected Wallets Screen
 *
 * Manage all connected wallets including:
 * - Passkey wallet (Turnkey)
 * - Seed Vault (MWA) - Android only
 * - External wallets (WalletConnect)
 */

import { useState, useMemo } from 'react';
import { StyleSheet, View, ScrollView, Alert, Platform } from 'react-native';
import { PressableScale } from 'pressto';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useQuery, useMutation } from 'convex/react';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useThemeColor } from '@/hooks/use-theme-color';
import { api } from '@/convex/_generated/api';
import { useCurrentUserId } from '@/stores/authConvex';
import { useMWA, useSeedVaultAvailability } from '@/providers/MWAProvider';
import { useTurnkey } from '@/hooks/useTurnkey';
import { formatWalletAddress } from '@/lib/mwa/mwa-client';
import SeedVaultConnectionModal from '@/components/wallet/SeedVaultConnectionModal';

// ============================================================================
// Types
// ============================================================================

interface WalletItemProps {
  icon: keyof typeof Ionicons.glyphMap;
  iconColor: string;
  iconBg: string;
  name: string;
  address: string;
  type: string;
  isPreferred?: boolean;
  isConnected: boolean;
  onPress?: () => void;
  onDisconnect?: () => void;
  showPreferredBadge?: boolean;
}

// ============================================================================
// Component
// ============================================================================

export default function ConnectedWalletsScreen() {
  const insets = useSafeAreaInsets();
  const userId = useCurrentUserId();

  // Modal state
  const [showSeedVaultModal, setShowSeedVaultModal] = useState(false);

  // Theme colors
  const primaryColor = useThemeColor({}, 'tint');
  const mutedColor = useThemeColor({ light: '#687076', dark: '#9BA1A6' }, 'icon');
  const cardBg = useThemeColor({ light: 'rgba(0,0,0,0.03)', dark: 'rgba(255,255,255,0.06)' }, 'background');
  const borderColor = useThemeColor({ light: 'rgba(0,0,0,0.06)', dark: 'rgba(255,255,255,0.08)' }, 'background');
  const dangerColor = '#ef4444';
  const successColor = '#10b981';

  // Hooks
  const turnkey = useTurnkey(userId, {
    organizationId: process.env.EXPO_PUBLIC_TURNKEY_ORG_ID ?? '',
    rpId: process.env.EXPO_PUBLIC_TURNKEY_RP_ID ?? 'discard.app',
  });

  const mwa = useMWA();
  const seedVaultAvailability = useSeedVaultAvailability();

  // Convex queries and mutations
  const wallets = useQuery(
    api.wallets.wallets.list,
    userId ? { userId } : "skip"
  );

  const preferredWallet = useQuery(
    api.wallets.wallets.getPreferredSigningWallet,
    userId ? { userId } : "skip"
  );

  const disconnectWallet = useMutation(api.wallets.wallets.disconnect);
  const setPreferredSigningWallet = useMutation(api.wallets.wallets.setPreferredSigningWallet);

  // Filter wallets by type
  const seedVaultWallet = useMemo(() => {
    return wallets?.find((w: any) => w.walletType === 'seed_vault' && w.connectionStatus === 'connected');
  }, [wallets]);

  const externalWallets = useMemo(() => {
    return wallets?.filter((w: any) =>
      w.walletType !== 'seed_vault' &&
      w.walletType !== 'passkey' &&
      w.connectionStatus === 'connected'
    ) ?? [];
  }, [wallets]);

  // Handlers
  const handleBack = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/settings');
    }
  };

  const handleDisconnectWallet = (walletId: string, walletName: string) => {
    Alert.alert(
      'Disconnect Wallet',
      `Are you sure you want to disconnect ${walletName}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Disconnect',
          style: 'destructive',
          onPress: async () => {
            try {
              await disconnectWallet({ walletId: walletId as any });
              if (walletId === seedVaultWallet?._id) {
                await mwa.disconnect();
              }
            } catch (error) {
              console.error('Failed to disconnect wallet:', error);
            }
          },
        },
      ]
    );
  };

  const handleSetPreferred = async (walletId: string | null) => {
    if (!userId) return;

    try {
      await setPreferredSigningWallet({
        userId,
        walletId: walletId as any,
      });
    } catch (error) {
      console.error('Failed to set preferred signer:', error);
      Alert.alert('Error', 'Failed to set preferred signer');
    }
  };

  const handleConnectSeedVault = () => {
    setShowSeedVaultModal(true);
  };

  const handleSeedVaultConnected = () => {
    setShowSeedVaultModal(false);
  };

  // Wallet item component
  const WalletItem = ({
    icon,
    iconColor,
    iconBg,
    name,
    address,
    type,
    isPreferred,
    isConnected,
    onPress,
    onDisconnect,
    showPreferredBadge = false,
  }: WalletItemProps) => (
    <ThemedView
      style={[styles.walletItem, { backgroundColor: cardBg, borderColor }]}
    >
      <PressableScale
        onPress={onPress ?? undefined}
        style={[styles.walletItemContent, !onPress && { opacity: 1 }]}
      >
        <View style={[styles.walletIcon, { backgroundColor: iconBg }]}>
          <Ionicons name={icon} size={20} color={iconColor} />
        </View>
        <View style={styles.walletInfo}>
          <View style={styles.walletNameRow}>
            <ThemedText style={styles.walletName}>{name}</ThemedText>
            {showPreferredBadge && isPreferred && (
              <View style={[styles.preferredBadge, { backgroundColor: `${primaryColor}20` }]}>
                <ThemedText style={[styles.preferredBadgeText, { color: primaryColor }]}>
                  DEFAULT
                </ThemedText>
              </View>
            )}
          </View>
          <ThemedText style={[styles.walletAddress, { color: mutedColor }]}>
            {address}
          </ThemedText>
          <ThemedText style={[styles.walletType, { color: mutedColor }]}>
            {type}
          </ThemedText>
        </View>
        <View style={styles.walletActions}>
          {isConnected ? (
            <View style={[styles.statusDot, { backgroundColor: successColor }]} />
          ) : (
            <View style={[styles.statusDot, { backgroundColor: mutedColor }]} />
          )}
        </View>
      </PressableScale>
      {onDisconnect && isConnected && (
        <PressableScale
          onPress={onDisconnect}
          style={[styles.disconnectButton, { backgroundColor: `${dangerColor}10` }]}
        >
          <Ionicons name="close" size={16} color={dangerColor} />
        </PressableScale>
      )}
    </ThemedView>
  );

  return (
    <ThemedView style={styles.container}>
      <View style={{ height: insets.top }} />

      {/* Header */}
      <View style={styles.header}>
        <PressableScale onPress={handleBack} style={styles.backButton}>
          <Ionicons name="chevron-back" size={24} color={mutedColor} />
        </PressableScale>
        <ThemedText style={styles.headerTitle}>Connected Wallets</ThemedText>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Primary Wallet Section */}
        <View style={styles.section}>
          <ThemedText style={[styles.sectionTitle, { color: mutedColor }]}>
            PRIMARY WALLET
          </ThemedText>
          <ThemedText style={[styles.sectionDescription, { color: mutedColor }]}>
            Your passkey-protected wallet for everyday transactions.
          </ThemedText>

          <WalletItem
            icon="finger-print"
            iconColor={primaryColor}
            iconBg={`${primaryColor}20`}
            name="Passkey Wallet"
            address={turnkey.walletAddress ? formatWalletAddress(turnkey.walletAddress) : 'Not initialized'}
            type="Turnkey TEE"
            isPreferred={!preferredWallet}
            isConnected={!!turnkey.walletAddress}
            showPreferredBadge={true}
            onPress={() => {
              if (preferredWallet) {
                handleSetPreferred(null);
              }
            }}
          />
        </View>

        {/* Seed Vault Section - Android Only */}
        {seedVaultAvailability.isSupported && (
          <View style={styles.section}>
            <ThemedText style={[styles.sectionTitle, { color: mutedColor }]}>
              HARDWARE WALLET
            </ThemedText>
            <ThemedText style={[styles.sectionDescription, { color: mutedColor }]}>
              {seedVaultAvailability.isSeekerDevice
                ? 'Your Seeker device supports Seed Vault for maximum security.'
                : 'Connect Seed Vault for hardware-level transaction signing.'}
            </ThemedText>

            {seedVaultWallet ? (
              <WalletItem
                icon="hardware-chip"
                iconColor="#f59e0b"
                iconBg="rgba(245, 158, 11, 0.2)"
                name={seedVaultWallet.mwaWalletName ?? 'Seed Vault'}
                address={formatWalletAddress(seedVaultWallet.address)}
                type="Mobile Wallet Adapter"
                isPreferred={preferredWallet?._id === seedVaultWallet._id}
                isConnected={true}
                showPreferredBadge={true}
                onPress={() => handleSetPreferred(seedVaultWallet._id)}
                onDisconnect={() => handleDisconnectWallet(seedVaultWallet._id, 'Seed Vault')}
              />
            ) : (
              <PressableScale
                onPress={handleConnectSeedVault}
                style={[styles.connectButton, { borderColor: `${primaryColor}40` }]}
              >
                <View style={[styles.connectIcon, { backgroundColor: `${primaryColor}15` }]}>
                  <Ionicons name="hardware-chip" size={20} color={primaryColor} />
                </View>
                <View style={styles.connectInfo}>
                  <ThemedText style={styles.connectLabel}>Connect Seed Vault</ThemedText>
                  <ThemedText style={[styles.connectHint, { color: mutedColor }]}>
                    Hardware wallet security for power users
                  </ThemedText>
                </View>
                <Ionicons name="add-circle" size={24} color={primaryColor} />
              </PressableScale>
            )}
          </View>
        )}

        {/* External Wallets Section */}
        <View style={styles.section}>
          <ThemedText style={[styles.sectionTitle, { color: mutedColor }]}>
            EXTERNAL WALLETS
          </ThemedText>
          <ThemedText style={[styles.sectionDescription, { color: mutedColor }]}>
            View-only wallets for portfolio tracking.
          </ThemedText>

          {externalWallets.length > 0 ? (
            externalWallets.map((wallet: any) => (
              <WalletItem
                key={wallet._id}
                icon="wallet"
                iconColor="#3b82f6"
                iconBg="rgba(59, 130, 246, 0.2)"
                name={wallet.nickname ?? formatWalletAddress(wallet.address)}
                address={formatWalletAddress(wallet.address)}
                type={wallet.networkType.charAt(0).toUpperCase() + wallet.networkType.slice(1)}
                isPreferred={false}
                isConnected={wallet.connectionStatus === 'connected'}
                onDisconnect={() => handleDisconnectWallet(wallet._id, wallet.nickname ?? 'Wallet')}
              />
            ))
          ) : (
            <View style={[styles.emptyState, { backgroundColor: cardBg, borderColor }]}>
              <Ionicons name="wallet-outline" size={24} color={mutedColor} />
              <ThemedText style={[styles.emptyText, { color: mutedColor }]}>
                No external wallets connected
              </ThemedText>
            </View>
          )}
        </View>

        {/* Info Card */}
        <View style={[styles.infoCard, { backgroundColor: `${primaryColor}08`, borderColor: `${primaryColor}15` }]}>
          <Ionicons name="information-circle" size={20} color={primaryColor} style={{ marginTop: 2 }} />
          <View style={styles.infoContent}>
            <ThemedText style={[styles.infoTitle, { color: primaryColor }]}>
              Default Signer
            </ThemedText>
            <ThemedText style={[styles.infoText, { color: mutedColor }]}>
              {preferredWallet
                ? 'Seed Vault will be used for transaction signing. Tap on Passkey Wallet to switch back.'
                : 'Your Passkey Wallet is used for transaction signing by default.'}
            </ThemedText>
          </View>
        </View>
      </ScrollView>

      {/* Seed Vault Connection Modal */}
      <SeedVaultConnectionModal
        visible={showSeedVaultModal}
        onClose={() => setShowSeedVaultModal(false)}
        onConnected={handleSeedVaultConnected}
      />
    </ThemedView>
  );
}

// ============================================================================
// Styles
// ============================================================================

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(128,128,128,0.1)',
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '600',
  },
  headerSpacer: {
    width: 40,
  },
  scrollView: {
    flex: 1,
  },
  content: {
    paddingTop: 8,
  },
  section: {
    paddingHorizontal: 16,
    paddingVertical: 16,
    gap: 12,
  },
  sectionTitle: {
    fontSize: 10,
    letterSpacing: 2,
    fontWeight: '600',
  },
  sectionDescription: {
    fontSize: 12,
    lineHeight: 18,
    marginBottom: 4,
  },
  walletItem: {
    borderRadius: 16,
    borderWidth: 1,
    overflow: 'hidden',
  },
  walletItemContent: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    gap: 12,
  },
  walletIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  walletInfo: {
    flex: 1,
  },
  walletNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  walletName: {
    fontSize: 15,
    fontWeight: '600',
  },
  preferredBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  preferredBadgeText: {
    fontSize: 9,
    fontWeight: '600',
  },
  walletAddress: {
    fontSize: 13,
    marginTop: 2,
    fontFamily: 'JetBrainsMono-Regular',
  },
  walletType: {
    fontSize: 11,
    marginTop: 2,
  },
  walletActions: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  disconnectButton: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  connectButton: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 16,
    borderWidth: 2,
    borderStyle: 'dashed',
    gap: 12,
  },
  connectIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  connectInfo: {
    flex: 1,
  },
  connectLabel: {
    fontSize: 15,
    fontWeight: '600',
  },
  connectHint: {
    fontSize: 12,
    marginTop: 2,
  },
  emptyState: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    borderRadius: 16,
    borderWidth: 1,
    gap: 12,
  },
  emptyText: {
    fontSize: 13,
  },
  infoCard: {
    flexDirection: 'row',
    marginHorizontal: 16,
    marginTop: 8,
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    gap: 12,
  },
  infoContent: {
    flex: 1,
  },
  infoTitle: {
    fontSize: 13,
    fontWeight: '600',
  },
  infoText: {
    fontSize: 12,
    lineHeight: 18,
    marginTop: 4,
  },
});
