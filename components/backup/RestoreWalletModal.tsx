/**
 * RestoreWalletModal - Restore Wallet from Backup or Manual Entry
 *
 * Restore options:
 * 1. From cloud backup (auto-detect platform)
 * 2. From file upload
 * 3. Manual 12-word entry (with autocomplete)
 */

import { useState, useEffect, useRef } from 'react';
import {
  StyleSheet,
  View,
  Modal,
  Pressable,
  TextInput,
  ActivityIndicator,
  ScrollView,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeIn, FadeInUp, SlideInRight } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';

import { ThemedText } from '@/components/themed-text';
import { useThemeColor } from '@/hooks/use-theme-color';
import { useColorScheme } from '@/hooks/use-color-scheme';
import {
  restoreFromBackup,
  restoreFromMnemonic,
  CloudProvider,
  getProviderOptions,
} from '@/lib/backup';
import { suggestWords, validateMnemonic, type MnemonicWallet } from '@/lib/mnemonic';
import { BackupPasswordModal } from './BackupPasswordModal';

// ============================================================================
// Types
// ============================================================================

type Step = 'options' | 'cloud' | 'file' | 'manual' | 'password' | 'restoring' | 'success' | 'error';

export interface RestoreWalletModalProps {
  visible: boolean;
  onClose: () => void;
  onSuccess?: (wallet: MnemonicWallet) => void;
}

// ============================================================================
// Main Component
// ============================================================================

export function RestoreWalletModal({
  visible,
  onClose,
  onSuccess,
}: RestoreWalletModalProps) {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  const primaryColor = useThemeColor({}, 'tint');
  const mutedColor = useThemeColor({ light: '#687076', dark: '#9BA1A6' }, 'icon');
  const textColor = useThemeColor({}, 'text');
  const bgColor = useThemeColor({ light: '#fff', dark: '#1c1c1e' }, 'background');
  const cardBg = useThemeColor({ light: '#f8f9fa', dark: '#2c2c2e' }, 'background');
  const successColor = '#22c55e';
  const errorColor = '#ef4444';

  const [step, setStep] = useState<Step>('options');
  const [selectedProvider, setSelectedProvider] = useState<CloudProvider | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [restoredWallet, setRestoredWallet] = useState<MnemonicWallet | null>(null);
  const [showPasswordModal, setShowPasswordModal] = useState(false);

  // Manual entry state
  const [words, setWords] = useState<string[]>(Array(12).fill(''));
  const [activeWordIndex, setActiveWordIndex] = useState(0);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const wordInputRefs = useRef<(TextInput | null)[]>([]);

  const providers = getProviderOptions();

  // Reset state when modal closes
  useEffect(() => {
    if (!visible) {
      setStep('options');
      setSelectedProvider(null);
      setIsLoading(false);
      setError(null);
      setRestoredWallet(null);
      setShowPasswordModal(false);
      setWords(Array(12).fill(''));
      setActiveWordIndex(0);
      setSuggestions([]);
    }
  }, [visible]);

  // Update suggestions when active word changes
  useEffect(() => {
    const currentWord = words[activeWordIndex] || '';
    if (currentWord.length >= 2) {
      setSuggestions(suggestWords(currentWord, 4));
    } else {
      setSuggestions([]);
    }
  }, [words, activeWordIndex]);

  // Handle cloud restore option selection
  const handleCloudRestore = (provider: CloudProvider) => {
    setSelectedProvider(provider);
    setShowPasswordModal(true);
  };

  // Handle password submission for cloud restore
  const handlePasswordSubmit = async (password: string) => {
    setShowPasswordModal(false);
    setStep('restoring');
    setIsLoading(true);
    setError(null);

    try {
      const result = await restoreFromBackup(password, selectedProvider!);

      if (result.success && result.wallet) {
        setRestoredWallet(result.wallet);
        setStep('success');
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } else {
        setError(result.error || 'Restore failed');
        setStep('error');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Restore failed');
      setStep('error');
    } finally {
      setIsLoading(false);
    }
  };

  // Handle word input change
  const handleWordChange = (index: number, value: string) => {
    const sanitized = value.toLowerCase().replace(/[^a-z]/g, '');
    const newWords = [...words];
    newWords[index] = sanitized;
    setWords(newWords);
    setActiveWordIndex(index);
  };

  // Handle suggestion selection
  const handleSuggestionSelect = (word: string) => {
    const newWords = [...words];
    newWords[activeWordIndex] = word;
    setWords(newWords);
    setSuggestions([]);

    // Move to next input
    if (activeWordIndex < 11) {
      const nextIndex = activeWordIndex + 1;
      setActiveWordIndex(nextIndex);
      wordInputRefs.current[nextIndex]?.focus();
    }
  };

  // Handle manual restore submission
  const handleManualRestore = async () => {
    const mnemonic = words.join(' ').trim();

    // Validate
    const validation = validateMnemonic(mnemonic);
    if (!validation.isValid) {
      if (validation.invalidWords.length > 0) {
        setError(`Invalid words: ${validation.invalidWords.slice(0, 3).join(', ')}`);
      } else {
        setError('Invalid seed phrase. Please check and try again.');
      }
      return;
    }

    setStep('restoring');
    setIsLoading(true);
    setError(null);

    try {
      const result = await restoreFromMnemonic(mnemonic);

      if (result.success && result.wallet) {
        setRestoredWallet(result.wallet);
        setStep('success');
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } else {
        setError(result.error || 'Restore failed');
        setStep('error');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Restore failed');
      setStep('error');
    } finally {
      setIsLoading(false);
    }
  };

  // Handle success completion
  const handleDone = () => {
    if (restoredWallet) {
      onSuccess?.(restoredWallet);
    }
    onClose();
  };

  const getProviderIcon = (provider: CloudProvider): string => {
    switch (provider) {
      case 'icloud':
        return 'cloud';
      case 'google_drive':
        return 'logo-google';
      case 'local_file':
        return 'folder-open';
      default:
        return 'cloud-offline';
    }
  };

  const filledWordCount = words.filter(w => w.length > 0).length;
  const isManualComplete = filledWordCount === 12;

  return (
    <>
      <Modal
        visible={visible && !showPasswordModal}
        transparent
        animationType="fade"
        onRequestClose={onClose}
      >
        <View style={styles.overlay}>
          <Pressable style={styles.backdrop} onPress={onClose} />

          <Animated.View
            entering={FadeIn.duration(200)}
            style={[styles.modal, { backgroundColor: bgColor }]}
          >
            <ScrollView
              showsVerticalScrollIndicator={false}
              bounces={false}
              keyboardShouldPersistTaps="handled"
            >
              {/* Header */}
              <View style={styles.header}>
                <View style={styles.headerContent}>
                  <View style={[styles.headerIcon, { backgroundColor: `${primaryColor}15` }]}>
                    <Ionicons
                      name={step === 'success' ? 'checkmark-circle' : 'refresh'}
                      size={24}
                      color={step === 'success' ? successColor : primaryColor}
                    />
                  </View>
                  <View style={styles.headerText}>
                    <ThemedText style={styles.title}>
                      {step === 'options' && 'Restore Wallet'}
                      {step === 'manual' && 'Enter Seed Phrase'}
                      {step === 'restoring' && 'Restoring...'}
                      {step === 'success' && 'Wallet Restored!'}
                      {step === 'error' && 'Restore Failed'}
                    </ThemedText>
                    <ThemedText style={[styles.subtitle, { color: mutedColor }]}>
                      {step === 'options' && 'Choose your restore method'}
                      {step === 'manual' && `${filledWordCount}/12 words entered`}
                      {step === 'restoring' && 'Please wait...'}
                      {step === 'success' && 'Your wallet is ready'}
                      {step === 'error' && 'Please try again'}
                    </ThemedText>
                  </View>
                </View>
                {step !== 'restoring' && (
                  <Pressable
                    onPress={onClose}
                    style={({ pressed }) => [styles.closeButton, pressed && styles.pressed]}
                  >
                    <Ionicons name="close" size={24} color={mutedColor} />
                  </Pressable>
                )}
              </View>

              {/* Step: Options */}
              {step === 'options' && (
                <Animated.View entering={FadeInUp.duration(300)}>
                  <ThemedText style={[styles.sectionLabel, { color: mutedColor }]}>
                    FROM BACKUP
                  </ThemedText>
                  <View style={styles.optionsList}>
                    {providers.filter(p => p.isAvailable || p.provider === 'local_file').map((p) => (
                      <Pressable
                        key={p.provider}
                        onPress={() => handleCloudRestore(p.provider)}
                        disabled={!p.isAvailable}
                        style={({ pressed }) => [
                          styles.optionCard,
                          {
                            backgroundColor: cardBg,
                            borderColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)',
                            opacity: p.isAvailable ? 1 : 0.5,
                          },
                          pressed && styles.pressed,
                        ]}
                      >
                        <View style={[styles.optionIcon, { backgroundColor: `${primaryColor}15` }]}>
                          <Ionicons
                            name={getProviderIcon(p.provider) as any}
                            size={22}
                            color={primaryColor}
                          />
                        </View>
                        <View style={styles.optionText}>
                          <ThemedText style={styles.optionTitle}>
                            {p.displayName}
                          </ThemedText>
                          <ThemedText style={[styles.optionDesc, { color: mutedColor }]}>
                            {p.provider === 'icloud' && 'Restore from iCloud backup'}
                            {p.provider === 'google_drive' && 'Restore from Google Drive'}
                            {p.provider === 'local_file' && 'Import from backup file'}
                          </ThemedText>
                        </View>
                        <Ionicons name="chevron-forward" size={20} color={mutedColor} />
                      </Pressable>
                    ))}
                  </View>

                  <ThemedText style={[styles.sectionLabel, { color: mutedColor, marginTop: 20 }]}>
                    MANUAL ENTRY
                  </ThemedText>
                  <Pressable
                    onPress={() => setStep('manual')}
                    style={({ pressed }) => [
                      styles.optionCard,
                      {
                        backgroundColor: cardBg,
                        borderColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)',
                      },
                      pressed && styles.pressed,
                    ]}
                  >
                    <View style={[styles.optionIcon, { backgroundColor: `${primaryColor}15` }]}>
                      <Ionicons name="keypad" size={22} color={primaryColor} />
                    </View>
                    <View style={styles.optionText}>
                      <ThemedText style={styles.optionTitle}>
                        Enter 12 Words
                      </ThemedText>
                      <ThemedText style={[styles.optionDesc, { color: mutedColor }]}>
                        Type your seed phrase manually
                      </ThemedText>
                    </View>
                    <Ionicons name="chevron-forward" size={20} color={mutedColor} />
                  </Pressable>
                </Animated.View>
              )}

              {/* Step: Manual Entry */}
              {step === 'manual' && (
                <Animated.View entering={SlideInRight.duration(300)}>
                  {/* Word Grid */}
                  <View style={styles.wordGrid}>
                    {words.map((word, index) => (
                      <View key={index} style={styles.wordInputWrapper}>
                        <View
                          style={[
                            styles.wordInputContainer,
                            {
                              backgroundColor: cardBg,
                              borderColor: activeWordIndex === index
                                ? primaryColor
                                : word.length > 0
                                  ? successColor
                                  : isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)',
                            },
                          ]}
                        >
                          <ThemedText style={[styles.wordNumber, { color: primaryColor }]}>
                            {index + 1}
                          </ThemedText>
                          <TextInput
                            ref={(ref) => { wordInputRefs.current[index] = ref; }}
                            value={word}
                            onChangeText={(text) => handleWordChange(index, text)}
                            onFocus={() => setActiveWordIndex(index)}
                            placeholder="word"
                            placeholderTextColor={mutedColor}
                            autoCapitalize="none"
                            autoCorrect={false}
                            style={[styles.wordInput, { color: textColor }]}
                          />
                        </View>
                      </View>
                    ))}
                  </View>

                  {/* Suggestions */}
                  {suggestions.length > 0 && (
                    <View style={styles.suggestionsContainer}>
                      {suggestions.map((suggestion, i) => (
                        <Pressable
                          key={i}
                          onPress={() => handleSuggestionSelect(suggestion)}
                          style={({ pressed }) => [
                            styles.suggestionChip,
                            { backgroundColor: `${primaryColor}15` },
                            pressed && styles.pressed,
                          ]}
                        >
                          <ThemedText style={[styles.suggestionText, { color: primaryColor }]}>
                            {suggestion}
                          </ThemedText>
                        </Pressable>
                      ))}
                    </View>
                  )}

                  {/* Error */}
                  {error && (
                    <View style={styles.errorContainer}>
                      <Ionicons name="alert-circle" size={16} color={errorColor} />
                      <ThemedText style={[styles.errorText, { color: errorColor }]}>
                        {error}
                      </ThemedText>
                    </View>
                  )}

                  {/* Actions */}
                  <Pressable
                    onPress={handleManualRestore}
                    disabled={!isManualComplete}
                    style={({ pressed }) => [
                      styles.primaryButton,
                      { backgroundColor: primaryColor },
                      pressed && styles.pressed,
                      !isManualComplete && styles.buttonDisabled,
                    ]}
                  >
                    <Ionicons name="checkmark-circle" size={18} color="#fff" />
                    <ThemedText style={styles.primaryButtonText}>
                      Restore Wallet
                    </ThemedText>
                  </Pressable>

                  <Pressable
                    onPress={() => setStep('options')}
                    style={({ pressed }) => [
                      styles.secondaryButton,
                      { borderColor: isDark ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.1)' },
                      pressed && styles.pressed,
                    ]}
                  >
                    <Ionicons name="arrow-back" size={18} color={mutedColor} />
                    <ThemedText style={[styles.secondaryButtonText, { color: mutedColor }]}>
                      Back
                    </ThemedText>
                  </Pressable>
                </Animated.View>
              )}

              {/* Step: Restoring */}
              {step === 'restoring' && (
                <View style={styles.loadingContainer}>
                  <ActivityIndicator size="large" color={primaryColor} />
                  <ThemedText style={[styles.loadingText, { color: mutedColor }]}>
                    Restoring your wallet...
                  </ThemedText>
                </View>
              )}

              {/* Step: Success */}
              {step === 'success' && restoredWallet && (
                <Animated.View entering={FadeIn.duration(300)}>
                  <View style={[styles.successContainer, { backgroundColor: `${successColor}10` }]}>
                    <View style={[styles.successIcon, { backgroundColor: successColor }]}>
                      <Ionicons name="checkmark" size={40} color="#fff" />
                    </View>
                    <ThemedText style={[styles.successTitle, { color: successColor }]}>
                      Wallet Restored!
                    </ThemedText>
                    <View style={[styles.addressCard, { backgroundColor: cardBg }]}>
                      <ThemedText style={[styles.addressLabel, { color: mutedColor }]}>
                        Wallet Address
                      </ThemedText>
                      <ThemedText style={styles.addressText} numberOfLines={1}>
                        {restoredWallet.publicKey.slice(0, 8)}...{restoredWallet.publicKey.slice(-8)}
                      </ThemedText>
                    </View>
                  </View>

                  <Pressable
                    onPress={handleDone}
                    style={({ pressed }) => [
                      styles.primaryButton,
                      { backgroundColor: successColor },
                      pressed && styles.pressed,
                    ]}
                  >
                    <Ionicons name="checkmark-circle" size={18} color="#fff" />
                    <ThemedText style={styles.primaryButtonText}>
                      Done
                    </ThemedText>
                  </Pressable>
                </Animated.View>
              )}

              {/* Step: Error */}
              {step === 'error' && (
                <Animated.View entering={FadeIn.duration(300)}>
                  <View style={[styles.errorCard, { backgroundColor: `${errorColor}10` }]}>
                    <Ionicons name="alert-circle" size={48} color={errorColor} />
                    <ThemedText style={[styles.errorTitle, { color: errorColor }]}>
                      Restore Failed
                    </ThemedText>
                    <ThemedText style={[styles.errorDesc, { color: mutedColor }]}>
                      {error || 'An unexpected error occurred'}
                    </ThemedText>
                  </View>

                  <Pressable
                    onPress={() => setStep('options')}
                    style={({ pressed }) => [
                      styles.primaryButton,
                      { backgroundColor: primaryColor },
                      pressed && styles.pressed,
                    ]}
                  >
                    <Ionicons name="refresh" size={18} color="#fff" />
                    <ThemedText style={styles.primaryButtonText}>
                      Try Again
                    </ThemedText>
                  </Pressable>

                  <Pressable
                    onPress={onClose}
                    style={({ pressed }) => [
                      styles.secondaryButton,
                      { borderColor: isDark ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.1)' },
                      pressed && styles.pressed,
                    ]}
                  >
                    <ThemedText style={[styles.secondaryButtonText, { color: mutedColor }]}>
                      Cancel
                    </ThemedText>
                  </Pressable>
                </Animated.View>
              )}
            </ScrollView>
          </Animated.View>
        </View>
      </Modal>

      {/* Password Modal */}
      <BackupPasswordModal
        visible={showPasswordModal}
        onClose={() => setShowPasswordModal(false)}
        onSubmit={handlePasswordSubmit}
        mode="unlock"
        title="Enter Backup Password"
        subtitle="The password used when creating the backup"
      />
    </>
  );
}

// ============================================================================
// Styles
// ============================================================================

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'center',
    padding: 20,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  modal: {
    borderRadius: 24,
    padding: 24,
    paddingBottom: 28,
    maxHeight: '90%',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 24,
  },
  headerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    flex: 1,
  },
  headerIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerText: {
    flex: 1,
  },
  title: {
    fontSize: 20,
    fontWeight: '600',
  },
  subtitle: {
    fontSize: 13,
    marginTop: 2,
  },
  closeButton: {
    padding: 4,
  },
  pressed: {
    opacity: 0.6,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 1,
    marginBottom: 12,
    marginLeft: 4,
  },
  optionsList: {
    gap: 10,
  },
  optionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 14,
    borderWidth: 1,
    gap: 14,
  },
  optionIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  optionText: {
    flex: 1,
  },
  optionTitle: {
    fontSize: 16,
    fontWeight: '600',
  },
  optionDesc: {
    fontSize: 13,
    marginTop: 2,
  },
  wordGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 16,
  },
  wordInputWrapper: {
    width: '31%',
  },
  wordInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 10,
    borderWidth: 1.5,
    paddingHorizontal: 8,
    gap: 4,
  },
  wordNumber: {
    fontSize: 10,
    fontWeight: '600',
    width: 16,
  },
  wordInput: {
    flex: 1,
    fontSize: 14,
    fontWeight: '500',
    paddingVertical: 10,
  },
  suggestionsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 16,
  },
  suggestionChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
  },
  suggestionText: {
    fontSize: 14,
    fontWeight: '500',
  },
  errorContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 16,
  },
  errorText: {
    fontSize: 13,
    flex: 1,
  },
  primaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 16,
    borderRadius: 12,
    marginBottom: 12,
  },
  primaryButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  secondaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1.5,
  },
  secondaryButtonText: {
    fontSize: 15,
    fontWeight: '500',
  },
  loadingContainer: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  loadingText: {
    fontSize: 16,
    marginTop: 16,
  },
  successContainer: {
    alignItems: 'center',
    padding: 28,
    borderRadius: 20,
    marginBottom: 20,
  },
  successIcon: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  successTitle: {
    fontSize: 22,
    fontWeight: '600',
    marginBottom: 16,
  },
  addressCard: {
    width: '100%',
    padding: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  addressLabel: {
    fontSize: 12,
    marginBottom: 4,
  },
  addressText: {
    fontSize: 14,
    fontWeight: '600',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  errorCard: {
    alignItems: 'center',
    padding: 32,
    borderRadius: 20,
    marginBottom: 20,
  },
  errorTitle: {
    fontSize: 20,
    fontWeight: '600',
    marginTop: 16,
    marginBottom: 8,
  },
  errorDesc: {
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  },
});

export default RestoreWalletModal;
