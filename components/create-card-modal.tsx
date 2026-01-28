/**
 * Create Card Modal
 *
 * Modal for creating new virtual cards with provider selection:
 * - Marqeta (Standard Card): KYC required, JIT funding, reloadable
 * - Starpay (Instant Card): No KYC, prepaid, requires initial amount
 */
import { useState, useCallback } from 'react';
import {
  StyleSheet,
  View,
  Modal,
  TextInput,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { PressableScale } from 'pressto';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useThemeColor } from '@/hooks/use-theme-color';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useCardOperations, CreateCardRequest } from '@/stores/cardsConvex';

type Provider = 'marqeta' | 'starpay';
type StarpayCardType = 'black' | 'platinum';

interface CreateCardModalProps {
  visible: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

// Provider info for UI display
const PROVIDERS = {
  marqeta: {
    id: 'marqeta' as Provider,
    name: 'Wallet Card',
    description: 'Spend directly from your crypto wallet with real-time funding',
    icon: 'wallet-outline',
    features: [
      'Funds stay in wallet until you spend',
      'Real-time balance updates',
      'Full fraud protection',
      'Reloadable',
    ],
    requiresKyc: true,
    requiresInitialAmount: false,
    gradient: ['#0d9488', '#10b981'],
  },
  starpay: {
    id: 'starpay' as Provider,
    name: 'Prepaid Card',
    description: 'Load funds upfront for instant, private spending',
    icon: 'flash-outline',
    features: [
      'No verification required',
      'Instant activation',
      'Privacy-preserving',
      'Works everywhere',
    ],
    requiresKyc: false,
    requiresInitialAmount: true,
    gradient: ['#6366f1', '#8b5cf6'],
  },
};

// Preset amounts for Starpay cards
const PRESET_AMOUNTS = [
  { label: '$25', value: 2500 },
  { label: '$50', value: 5000 },
  { label: '$100', value: 10000 },
  { label: '$250', value: 25000 },
  { label: '$500', value: 50000 },
];

export function CreateCardModal({ visible, onClose, onSuccess }: CreateCardModalProps) {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  const primaryColor = useThemeColor({}, 'tint');
  const mutedColor = useThemeColor({ light: '#687076', dark: '#9BA1A6' }, 'icon');
  const textColor = useThemeColor({}, 'text');
  const cardBg = useThemeColor({ light: '#ffffff', dark: '#1c1c1e' }, 'background');
  const borderColor = useThemeColor({ light: 'rgba(0,0,0,0.08)', dark: 'rgba(255,255,255,0.1)' }, 'background');
  const inputBg = useThemeColor({ light: '#f4f4f5', dark: '#27272a' }, 'background');

  const { createCard } = useCardOperations();

  // Form state
  const [step, setStep] = useState<'provider' | 'details'>('provider');
  const [selectedProvider, setSelectedProvider] = useState<Provider | null>(null);
  const [nickname, setNickname] = useState('');
  const [initialAmount, setInitialAmount] = useState<number | null>(null);
  const [customAmount, setCustomAmount] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset form
  const resetForm = useCallback(() => {
    setStep('provider');
    setSelectedProvider(null);
    setNickname('');
    setInitialAmount(null);
    setCustomAmount('');
    setError(null);
  }, []);

  // Handle close
  const handleClose = useCallback(() => {
    if (!isCreating) {
      resetForm();
      onClose();
    }
  }, [isCreating, resetForm, onClose]);

  // Select provider
  const handleSelectProvider = useCallback((provider: Provider) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelectedProvider(provider);
    setStep('details');
    setError(null);
  }, []);

  // Go back to provider selection
  const handleBack = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setStep('provider');
    setError(null);
  }, []);

  // Select preset amount
  const handleSelectAmount = useCallback((amount: number) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setInitialAmount(amount);
    setCustomAmount('');
    setError(null);
  }, []);

  // Handle custom amount input
  const handleCustomAmountChange = useCallback((text: string) => {
    // Allow only numbers and decimal point
    const cleaned = text.replace(/[^0-9.]/g, '');
    setCustomAmount(cleaned);

    const parsed = parseFloat(cleaned);
    if (!isNaN(parsed) && parsed > 0) {
      setInitialAmount(Math.round(parsed * 100)); // Convert to cents
    } else {
      setInitialAmount(null);
    }
  }, []);

  // Calculate fee for Starpay Black card
  const calculateFee = useCallback((amountCents: number): number => {
    const feePercent = amountCents * 0.002; // 0.2%
    return Math.max(500, Math.min(50000, Math.round(feePercent))); // Min $5, Max $500
  }, []);

  // Create card
  const handleCreateCard = useCallback(async () => {
    if (!selectedProvider) return;

    // Validate Starpay requirements
    if (selectedProvider === 'starpay' && !initialAmount) {
      setError('Please select an amount to load onto the card');
      return;
    }

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setIsCreating(true);
    setError(null);

    try {
      const cardData: CreateCardRequest = {
        provider: selectedProvider,
        nickname: nickname.trim() || undefined,
      };

      // Add Starpay-specific options
      if (selectedProvider === 'starpay') {
        cardData.starpayCardType = 'black'; // Default to Black for now
        cardData.initialAmount = initialAmount!;
      }

      const result = await createCard(cardData);

      if (result) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        resetForm();
        onSuccess?.();
        onClose();
      } else {
        setError('Failed to create card. Please try again.');
      }
    } catch (err) {
      console.error('Failed to create card:', err);
      setError(err instanceof Error ? err.message : 'Failed to create card');
    } finally {
      setIsCreating(false);
    }
  }, [selectedProvider, initialAmount, nickname, createCard, resetForm, onSuccess, onClose]);

  // Render provider selection step
  const renderProviderSelection = () => (
    <View style={styles.content}>
      <ThemedText style={styles.title}>Choose Card Type</ThemedText>
      <ThemedText style={[styles.subtitle, { color: mutedColor }]}>
        Select the type of card that fits your needs
      </ThemedText>

      <View style={styles.providersContainer}>
        {Object.values(PROVIDERS).map((provider) => (
          <PressableScale
            key={provider.id}
            onPress={() => handleSelectProvider(provider.id)}
            testID={`provider-${provider.id}`}
            style={[
              styles.providerCard,
              { backgroundColor: cardBg, borderColor },
            ]}
          >
            <LinearGradient
              colors={provider.gradient as [string, string]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.providerIconContainer}
            >
              <Ionicons name={provider.icon as any} size={24} color="#fff" />
            </LinearGradient>

            <View style={styles.providerInfo}>
              <View style={styles.providerHeader}>
                <ThemedText style={styles.providerName}>{provider.name}</ThemedText>
                {provider.requiresKyc && (
                  <View style={[styles.badge, { backgroundColor: `${primaryColor}20` }]}>
                    <ThemedText style={[styles.badgeText, { color: primaryColor }]}>ID Required</ThemedText>
                  </View>
                )}
                {!provider.requiresKyc && (
                  <View style={[styles.badge, { backgroundColor: 'rgba(34, 197, 94, 0.2)' }]}>
                    <ThemedText style={[styles.badgeText, { color: '#22c55e' }]}>No ID Needed</ThemedText>
                  </View>
                )}
              </View>
              <ThemedText style={[styles.providerDescription, { color: mutedColor }]}>
                {provider.description}
              </ThemedText>

              <View style={styles.featuresList}>
                {provider.features.slice(0, 2).map((feature, index) => (
                  <View key={index} style={styles.featureItem}>
                    <Ionicons name="checkmark-circle" size={14} color={primaryColor} />
                    <ThemedText style={[styles.featureText, { color: mutedColor }]}>
                      {feature}
                    </ThemedText>
                  </View>
                ))}
              </View>
            </View>

            <Ionicons name="chevron-forward" size={20} color={mutedColor} />
          </PressableScale>
        ))}
      </View>
    </View>
  );

  // Render card details step
  const renderDetailsStep = () => {
    const provider = selectedProvider ? PROVIDERS[selectedProvider] : null;
    if (!provider) return null;

    const fee = selectedProvider === 'starpay' && initialAmount ? calculateFee(initialAmount) : 0;
    const netAmount = initialAmount ? initialAmount - fee : 0;

    return (
      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* Header */}
        <PressableScale onPress={handleBack} style={styles.backButton}>
          <Ionicons name="arrow-back" size={20} color={textColor} />
          <ThemedText style={styles.backText}>Back</ThemedText>
        </PressableScale>

        <View style={styles.selectedProviderHeader}>
          <LinearGradient
            colors={provider.gradient as [string, string]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.selectedProviderIcon}
          >
            <Ionicons name={provider.icon as any} size={20} color="#fff" />
          </LinearGradient>
          <ThemedText style={styles.selectedProviderName}>{provider.name}</ThemedText>
        </View>

        {/* Card Nickname */}
        <View style={styles.inputGroup}>
          <ThemedText style={styles.inputLabel}>Card Nickname (Optional)</ThemedText>
          <TextInput
            style={[styles.input, { backgroundColor: inputBg, color: textColor, borderColor }]}
            placeholder="e.g., Travel Card, Shopping"
            placeholderTextColor={mutedColor}
            value={nickname}
            onChangeText={setNickname}
            maxLength={30}
            testID="card-nickname-input"
          />
        </View>

        {/* Amount Selection (Starpay only) */}
        {selectedProvider === 'starpay' && (
          <>
            <View style={styles.inputGroup}>
              <ThemedText style={styles.inputLabel}>Load Amount</ThemedText>
              <ThemedText style={[styles.inputHint, { color: mutedColor }]}>
                Choose how much to load onto your prepaid card
              </ThemedText>

              <View style={styles.presetAmountsGrid}>
                {PRESET_AMOUNTS.map((preset) => (
                  <PressableScale
                    key={preset.value}
                    onPress={() => handleSelectAmount(preset.value)}
                    testID={`amount-${preset.value}`}
                    style={[
                      styles.presetButton,
                      { backgroundColor: inputBg, borderColor },
                      initialAmount === preset.value && {
                        borderColor: primaryColor,
                        backgroundColor: `${primaryColor}10`,
                      },
                    ]}
                  >
                    <ThemedText
                      style={[
                        styles.presetButtonText,
                        initialAmount === preset.value && { color: primaryColor },
                      ]}
                    >
                      {preset.label}
                    </ThemedText>
                  </PressableScale>
                ))}
              </View>

              <View style={styles.customAmountContainer}>
                <ThemedText style={[styles.customAmountLabel, { color: mutedColor }]}>
                  Or enter custom amount:
                </ThemedText>
                <View style={[styles.customAmountInput, { backgroundColor: inputBg, borderColor }]}>
                  <ThemedText style={[styles.currencySymbol, { color: mutedColor }]}>$</ThemedText>
                  <TextInput
                    style={[styles.customAmountField, { color: textColor }]}
                    placeholder="0.00"
                    placeholderTextColor={mutedColor}
                    value={customAmount}
                    onChangeText={handleCustomAmountChange}
                    keyboardType="decimal-pad"
                    maxLength={10}
                  />
                </View>
              </View>
            </View>

            {/* Fee Summary */}
            {initialAmount && initialAmount > 0 && (
              <View style={[styles.feeSummary, { backgroundColor: inputBg, borderColor }]}>
                <View style={styles.feeRow}>
                  <ThemedText style={[styles.feeLabel, { color: mutedColor }]}>Load Amount</ThemedText>
                  <ThemedText style={styles.feeValue}>${(initialAmount / 100).toFixed(2)}</ThemedText>
                </View>
                <View style={styles.feeRow}>
                  <ThemedText style={[styles.feeLabel, { color: mutedColor }]}>
                    Issuance Fee (0.2%)
                  </ThemedText>
                  <ThemedText style={[styles.feeValue, { color: mutedColor }]}>
                    -${(fee / 100).toFixed(2)}
                  </ThemedText>
                </View>
                <View style={[styles.feeRow, styles.feeRowTotal]}>
                  <ThemedText style={styles.feeTotalLabel}>Card Balance</ThemedText>
                  <ThemedText style={[styles.feeTotalValue, { color: primaryColor }]}>
                    ${(netAmount / 100).toFixed(2)}
                  </ThemedText>
                </View>
              </View>
            )}
          </>
        )}

        {/* Marqeta info */}
        {selectedProvider === 'marqeta' && (
          <View style={[styles.infoBox, { backgroundColor: inputBg, borderColor }]}>
            <Ionicons name="information-circle-outline" size={20} color={primaryColor} />
            <ThemedText style={[styles.infoText, { color: mutedColor }]}>
              This card uses Just-In-Time funding. Funds stay in your wallet until you make a purchase.
            </ThemedText>
          </View>
        )}

        {/* Error */}
        {error && (
          <View style={[styles.errorBox, { backgroundColor: 'rgba(239, 68, 68, 0.1)' }]}>
            <Ionicons name="alert-circle" size={16} color="#ef4444" />
            <ThemedText style={styles.errorText}>{error}</ThemedText>
          </View>
        )}

        {/* Create Button */}
        <PressableScale
          onPress={handleCreateCard}
          enabled={!isCreating && !(selectedProvider === 'starpay' && !initialAmount)}
          testID="create-card-confirm"
          style={[
            styles.createButton,
            { backgroundColor: primaryColor },
            (isCreating || (selectedProvider === 'starpay' && !initialAmount)) && styles.createButtonDisabled,
          ]}
        >
          {isCreating ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <>
              <Ionicons name="add-circle" size={20} color="#fff" />
              <ThemedText style={styles.createButtonText}>Create Card</ThemedText>
            </>
          )}
        </PressableScale>

        <View style={{ height: 40 }} />
      </ScrollView>
    );
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={handleClose}
    >
      <ThemedView style={styles.container}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.keyboardView}
        >
          {/* Header */}
          <View style={[styles.header, { borderBottomColor: borderColor }]}>
            <View style={styles.headerHandle} />
            <PressableScale onPress={handleClose} style={styles.closeButton} enabled={!isCreating}>
              <Ionicons name="close" size={24} color={textColor} />
            </PressableScale>
          </View>

          {step === 'provider' ? renderProviderSelection() : renderDetailsStep()}
        </KeyboardAvoidingView>
      </ThemedView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  keyboardView: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    position: 'relative',
  },
  headerHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(128, 128, 128, 0.3)',
  },
  closeButton: {
    position: 'absolute',
    right: 16,
    padding: 8,
  },
  content: {
    flex: 1,
    padding: 24,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 15,
    marginBottom: 24,
  },
  providersContainer: {
    gap: 16,
  },
  providerCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    gap: 16,
  },
  providerIconContainer: {
    width: 48,
    height: 48,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  providerInfo: {
    flex: 1,
  },
  providerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  providerName: {
    fontSize: 17,
    fontWeight: '600',
  },
  badge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '600',
  },
  providerDescription: {
    fontSize: 13,
    marginBottom: 8,
  },
  featuresList: {
    gap: 4,
  },
  featureItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  featureText: {
    fontSize: 12,
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 16,
  },
  backText: {
    fontSize: 15,
  },
  selectedProviderHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 24,
  },
  selectedProviderIcon: {
    width: 40,
    height: 40,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  selectedProviderName: {
    fontSize: 20,
    fontWeight: '600',
  },
  inputGroup: {
    marginBottom: 24,
  },
  inputLabel: {
    fontSize: 15,
    fontWeight: '600',
    marginBottom: 8,
  },
  inputHint: {
    fontSize: 13,
    marginBottom: 12,
  },
  input: {
    height: 48,
    borderRadius: 12,
    paddingHorizontal: 16,
    fontSize: 16,
    borderWidth: 1,
  },
  presetAmountsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 16,
  },
  presetButton: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
  },
  presetButtonText: {
    fontSize: 15,
    fontWeight: '600',
  },
  customAmountContainer: {
    gap: 8,
  },
  customAmountLabel: {
    fontSize: 13,
  },
  customAmountInput: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 48,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 16,
  },
  currencySymbol: {
    fontSize: 18,
    fontWeight: '500',
    marginRight: 4,
  },
  customAmountField: {
    flex: 1,
    fontSize: 18,
    fontWeight: '500',
  },
  feeSummary: {
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 24,
  },
  feeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 4,
  },
  feeRowTotal: {
    borderTopWidth: 1,
    borderTopColor: 'rgba(128, 128, 128, 0.2)',
    marginTop: 8,
    paddingTop: 12,
  },
  feeLabel: {
    fontSize: 14,
  },
  feeValue: {
    fontSize: 14,
    fontWeight: '500',
  },
  feeTotalLabel: {
    fontSize: 15,
    fontWeight: '600',
  },
  feeTotalValue: {
    fontSize: 17,
    fontWeight: '700',
  },
  infoBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    gap: 12,
    marginBottom: 24,
  },
  infoText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 18,
  },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 8,
    gap: 8,
    marginBottom: 16,
  },
  errorText: {
    flex: 1,
    fontSize: 13,
    color: '#ef4444',
  },
  createButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 52,
    borderRadius: 14,
    gap: 8,
  },
  createButtonDisabled: {
    opacity: 0.5,
  },
  createButtonText: {
    fontSize: 17,
    fontWeight: '600',
    color: '#fff',
  },
});
