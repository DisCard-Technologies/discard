/**
 * Privacy Settings Screen
 *
 * User-configurable privacy levels with three tiers:
 * - Basic: Standard privacy, fastest UX
 * - Enhanced: Stealth addresses, MPC swaps (recommended)
 * - Maximum: Full ZK proofs, Tor routing, maximum isolation
 */
import { useState, useEffect } from 'react';
import { StyleSheet, View, Pressable, ScrollView, Switch, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { useQuery, useMutation } from 'convex/react';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useThemeColor } from '@/hooks/use-theme-color';
import { api } from '@/convex/_generated/api';

type PrivacyLevel = 'basic' | 'enhanced' | 'maximum';

interface PrivacyTier {
  id: PrivacyLevel;
  name: string;
  tagline: string;
  icon: keyof typeof Ionicons.glyphMap;
  features: string[];
  tradeoffs: string[];
  color: string;
}

const PRIVACY_TIERS: PrivacyTier[] = [
  {
    id: 'basic',
    name: 'Basic',
    tagline: 'Standard privacy with fastest transactions',
    icon: 'shield-outline',
    features: [
      'Standard Jupiter swaps',
      'Direct wallet funding',
      'Full transaction history',
      '1 year data retention',
    ],
    tradeoffs: [
      'On-chain transaction visibility',
      'No stealth addresses',
      'Analytics enabled',
    ],
    color: '#3b82f6', // blue
  },
  {
    id: 'enhanced',
    name: 'Enhanced',
    tagline: 'Stealth addresses & confidential swaps',
    icon: 'shield-checkmark',
    features: [
      'Arcium MPC confidential swaps',
      'Hush stealth address funding',
      'Transaction isolation per card',
      '90 day data retention',
      'Analytics opt-out',
    ],
    tradeoffs: [
      'Slightly longer swap times',
      'Higher gas for stealth txs',
    ],
    color: '#8b5cf6', // purple
  },
  {
    id: 'maximum',
    name: 'Maximum',
    tagline: 'Full ZK privacy with Tor routing',
    icon: 'shield',
    features: [
      'SilentSwap shielded pools',
      'ZK proofs for card funding',
      'Ring signatures for transfers',
      'Server-side Tor routing',
      '30 day data retention',
      'Full analytics opt-out',
    ],
    tradeoffs: [
      'Longer transaction times',
      'Higher fees for ZK proofs',
      'Some features may be slower',
    ],
    color: '#10b981', // emerald
  },
];

export default function PrivacySettingsScreen() {
  const insets = useSafeAreaInsets();

  // Theme colors
  const primaryColor = useThemeColor({}, 'tint');
  const mutedColor = useThemeColor({ light: '#687076', dark: '#9BA1A6' }, 'icon');
  const cardBg = useThemeColor({ light: 'rgba(0,0,0,0.03)', dark: 'rgba(255,255,255,0.06)' }, 'background');
  const borderColor = useThemeColor({ light: 'rgba(0,0,0,0.06)', dark: 'rgba(255,255,255,0.08)' }, 'background');
  const successColor = '#10b981';
  const warningColor = '#f59e0b';

  // Convex queries and mutations
  const privacyData = useQuery(api.auth.passkeys.getPrivacySettings, {});
  const setPrivacyLevel = useMutation(api.auth.passkeys.setPrivacyLevel);

  // Local state
  const [selectedLevel, setSelectedLevel] = useState<PrivacyLevel>('basic');
  const [isUpdating, setIsUpdating] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Initialize from server data
  useEffect(() => {
    if (privacyData?.privacyLevel) {
      setSelectedLevel(privacyData.privacyLevel);
    }
  }, [privacyData]);

  const handleSelectTier = async (tier: PrivacyLevel) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    // Show confirmation for level changes
    if (tier !== selectedLevel) {
      const tierInfo = PRIVACY_TIERS.find(t => t.id === tier);

      Alert.alert(
        `Switch to ${tierInfo?.name} Privacy?`,
        `This will update your swap provider, funding method, and data retention settings.\n\n${tierInfo?.tradeoffs.join('\n')}`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Confirm',
            onPress: async () => {
              setIsUpdating(true);
              try {
                await setPrivacyLevel({ privacyLevel: tier });
                setSelectedLevel(tier);
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              } catch (error) {
                console.error('[Privacy] Failed to update level:', error);
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
                Alert.alert('Error', 'Failed to update privacy level. Please try again.');
              } finally {
                setIsUpdating(false);
              }
            },
          },
        ]
      );
    }
  };

  const handleBack = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/settings');
    }
  };

  const renderTierCard = (tier: PrivacyTier) => {
    const isSelected = selectedLevel === tier.id;

    return (
      <Pressable
        key={tier.id}
        onPress={() => handleSelectTier(tier.id)}
        disabled={isUpdating}
        style={({ pressed }) => [
          styles.tierCard,
          {
            backgroundColor: cardBg,
            borderColor: isSelected ? tier.color : borderColor,
            borderWidth: isSelected ? 2 : 1,
            opacity: isUpdating ? 0.6 : pressed ? 0.8 : 1,
          },
        ]}
      >
        {/* Header */}
        <View style={styles.tierHeader}>
          <View style={[styles.tierIconContainer, { backgroundColor: `${tier.color}20` }]}>
            <Ionicons name={tier.icon} size={24} color={tier.color} />
          </View>
          <View style={styles.tierTitleContainer}>
            <View style={styles.tierTitleRow}>
              <ThemedText style={styles.tierName}>{tier.name}</ThemedText>
              {tier.id === 'enhanced' && (
                <View style={[styles.recommendedBadge, { backgroundColor: `${primaryColor}20` }]}>
                  <ThemedText style={[styles.recommendedText, { color: primaryColor }]}>
                    Recommended
                  </ThemedText>
                </View>
              )}
            </View>
            <ThemedText style={[styles.tierTagline, { color: mutedColor }]}>
              {tier.tagline}
            </ThemedText>
          </View>
          {isSelected && (
            <View style={[styles.selectedCheck, { backgroundColor: tier.color }]}>
              <Ionicons name="checkmark" size={16} color="#fff" />
            </View>
          )}
        </View>

        {/* Features */}
        <View style={styles.tierFeatures}>
          {tier.features.map((feature, idx) => (
            <View key={idx} style={styles.featureRow}>
              <Ionicons name="checkmark-circle" size={16} color={successColor} />
              <ThemedText style={styles.featureText}>{feature}</ThemedText>
            </View>
          ))}
        </View>

        {/* Tradeoffs */}
        {tier.tradeoffs.length > 0 && (
          <View style={[styles.tradeoffsContainer, { borderTopColor: borderColor }]}>
            <ThemedText style={[styles.tradeoffsLabel, { color: mutedColor }]}>
              Trade-offs:
            </ThemedText>
            {tier.tradeoffs.map((tradeoff, idx) => (
              <View key={idx} style={styles.tradeoffRow}>
                <Ionicons name="alert-circle-outline" size={14} color={warningColor} />
                <ThemedText style={[styles.tradeoffText, { color: mutedColor }]}>
                  {tradeoff}
                </ThemedText>
              </View>
            ))}
          </View>
        )}
      </Pressable>
    );
  };

  return (
    <ThemedView style={styles.container}>
      <View style={{ height: insets.top }} />

      {/* Header */}
      <View style={styles.header}>
        <Pressable
          onPress={handleBack}
          style={({ pressed }) => [styles.backButton, pressed && styles.pressed]}
        >
          <Ionicons name="chevron-back" size={24} color={mutedColor} />
        </Pressable>
        <ThemedText style={styles.headerTitle}>Privacy Level</ThemedText>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Introduction */}
        <View style={styles.introSection}>
          <ThemedText style={[styles.introText, { color: mutedColor }]}>
            Choose your privacy level based on your threat model. Higher privacy
            may result in longer transaction times and higher fees.
          </ThemedText>
        </View>

        {/* Privacy Tiers */}
        <View style={styles.tiersSection}>
          {PRIVACY_TIERS.map(renderTierCard)}
        </View>

        {/* Advanced Settings Toggle */}
        <Pressable
          onPress={() => setShowAdvanced(!showAdvanced)}
          style={[styles.advancedToggle, { borderColor }]}
        >
          <View style={styles.advancedToggleLeft}>
            <Ionicons name="options-outline" size={20} color={mutedColor} />
            <ThemedText style={styles.advancedToggleText}>Advanced Settings</ThemedText>
          </View>
          <Ionicons
            name={showAdvanced ? 'chevron-up' : 'chevron-down'}
            size={20}
            color={mutedColor}
          />
        </Pressable>

        {/* Advanced Settings Panel */}
        {showAdvanced && privacyData && (
          <View style={[styles.advancedPanel, { backgroundColor: cardBg, borderColor }]}>
            <ThemedText style={[styles.advancedNote, { color: mutedColor }]}>
              These settings are automatically configured by your privacy level.
              Manual overrides may affect privacy guarantees.
            </ThemedText>

            <View style={styles.settingRow}>
              <View style={styles.settingInfo}>
                <ThemedText style={styles.settingLabel}>Stealth Addresses</ThemedText>
                <ThemedText style={[styles.settingDescription, { color: mutedColor }]}>
                  Use Hush Protocol for receiving funds
                </ThemedText>
              </View>
              <Switch
                value={privacyData.settings.useStealthAddresses}
                disabled={true}
                trackColor={{ false: '#767577', true: `${primaryColor}50` }}
                thumbColor={privacyData.settings.useStealthAddresses ? primaryColor : '#f4f3f4'}
              />
            </View>

            <View style={styles.settingRow}>
              <View style={styles.settingInfo}>
                <ThemedText style={styles.settingLabel}>MPC Swaps</ThemedText>
                <ThemedText style={[styles.settingDescription, { color: mutedColor }]}>
                  Use Arcium for confidential swaps
                </ThemedText>
              </View>
              <Switch
                value={privacyData.settings.useMpcSwaps}
                disabled={true}
                trackColor={{ false: '#767577', true: `${primaryColor}50` }}
                thumbColor={privacyData.settings.useMpcSwaps ? primaryColor : '#f4f3f4'}
              />
            </View>

            <View style={styles.settingRow}>
              <View style={styles.settingInfo}>
                <ThemedText style={styles.settingLabel}>ZK Proofs</ThemedText>
                <ThemedText style={[styles.settingDescription, { color: mutedColor }]}>
                  Zero-knowledge proofs for card funding
                </ThemedText>
              </View>
              <Switch
                value={privacyData.settings.useZkProofs}
                disabled={true}
                trackColor={{ false: '#767577', true: `${primaryColor}50` }}
                thumbColor={privacyData.settings.useZkProofs ? primaryColor : '#f4f3f4'}
              />
            </View>

            <View style={styles.settingRow}>
              <View style={styles.settingInfo}>
                <ThemedText style={styles.settingLabel}>Ring Signatures</ThemedText>
                <ThemedText style={[styles.settingDescription, { color: mutedColor }]}>
                  Anonymity set for transfers
                </ThemedText>
              </View>
              <Switch
                value={privacyData.settings.useRingSignatures}
                disabled={true}
                trackColor={{ false: '#767577', true: `${primaryColor}50` }}
                thumbColor={privacyData.settings.useRingSignatures ? primaryColor : '#f4f3f4'}
              />
            </View>

            <View style={[styles.settingRow, { borderBottomWidth: 0 }]}>
              <View style={styles.settingInfo}>
                <ThemedText style={styles.settingLabel}>Tor Routing</ThemedText>
                <ThemedText style={[styles.settingDescription, { color: mutedColor }]}>
                  Server-side Tor for RPC calls
                </ThemedText>
              </View>
              <Switch
                value={privacyData.settings.torRoutingEnabled}
                disabled={true}
                trackColor={{ false: '#767577', true: `${primaryColor}50` }}
                thumbColor={privacyData.settings.torRoutingEnabled ? primaryColor : '#f4f3f4'}
              />
            </View>

            <View style={[styles.retentionInfo, { borderTopColor: borderColor }]}>
              <Ionicons name="time-outline" size={16} color={mutedColor} />
              <ThemedText style={[styles.retentionText, { color: mutedColor }]}>
                Data retention: {privacyData.settings.dataRetention} days
              </ThemedText>
            </View>
          </View>
        )}

        {/* Info Card */}
        <View style={[styles.infoCard, { backgroundColor: `${primaryColor}08`, borderColor: `${primaryColor}15` }]}>
          <Ionicons name="information-circle-outline" size={20} color={primaryColor} />
          <ThemedText style={[styles.infoText, { color: mutedColor }]}>
            Privacy settings apply to future transactions. Existing transaction
            history is not affected. Learn more about our{' '}
            <ThemedText style={[styles.infoLink, { color: primaryColor }]}>
              privacy architecture
            </ThemedText>.
          </ThemedText>
        </View>
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
  pressed: {
    opacity: 0.7,
  },
  scrollView: {
    flex: 1,
  },
  content: {
    paddingHorizontal: 16,
    paddingTop: 16,
    gap: 16,
  },
  introSection: {
    marginBottom: 8,
  },
  introText: {
    fontSize: 14,
    lineHeight: 20,
  },
  tiersSection: {
    gap: 12,
  },
  tierCard: {
    borderRadius: 16,
    padding: 16,
    gap: 12,
  },
  tierHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  tierIconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tierTitleContainer: {
    flex: 1,
  },
  tierTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  tierName: {
    fontSize: 18,
    fontWeight: '600',
  },
  recommendedBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  recommendedText: {
    fontSize: 10,
    fontWeight: '600',
  },
  tierTagline: {
    fontSize: 13,
    marginTop: 2,
  },
  selectedCheck: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tierFeatures: {
    gap: 6,
    paddingLeft: 4,
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  featureText: {
    fontSize: 13,
  },
  tradeoffsContainer: {
    borderTopWidth: 1,
    paddingTop: 12,
    marginTop: 4,
    gap: 4,
  },
  tradeoffsLabel: {
    fontSize: 11,
    fontWeight: '600',
    marginBottom: 2,
  },
  tradeoffRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingLeft: 4,
  },
  tradeoffText: {
    fontSize: 12,
  },
  advancedToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: 1,
  },
  advancedToggleLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  advancedToggleText: {
    fontSize: 14,
    fontWeight: '500',
  },
  advancedPanel: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    gap: 8,
  },
  advancedNote: {
    fontSize: 12,
    lineHeight: 16,
    marginBottom: 8,
  },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(128,128,128,0.1)',
  },
  settingInfo: {
    flex: 1,
    marginRight: 12,
  },
  settingLabel: {
    fontSize: 14,
    fontWeight: '500',
  },
  settingDescription: {
    fontSize: 12,
    marginTop: 2,
  },
  retentionInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingTop: 12,
    borderTopWidth: 1,
    marginTop: 4,
  },
  retentionText: {
    fontSize: 13,
  },
  infoCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    marginTop: 8,
  },
  infoText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 18,
  },
  infoLink: {
    fontWeight: '500',
  },
});
