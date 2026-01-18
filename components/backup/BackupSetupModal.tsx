/**
 * BackupSetupModal - Initial Backup Setup Flow
 *
 * Multi-step flow for setting up cloud backup:
 * 1. Introduction - explain backup importance
 * 2. Create strong password (with strength meter)
 * 3. Confirm password
 * 4. Select backup location (iCloud/Google Drive/Local)
 * 5. Backup in progress
 * 6. Success confirmation
 */

import { useState, useEffect } from 'react';
import {
  StyleSheet,
  View,
  Modal,
  Pressable,
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
  createBackup,
  getProviderOptions,
  CloudProvider,
} from '@/lib/backup';
import { BackupPasswordModal } from './BackupPasswordModal';

// ============================================================================
// Types
// ============================================================================

type Step = 'intro' | 'password' | 'provider' | 'progress' | 'success' | 'error';

export interface BackupSetupModalProps {
  visible: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

// ============================================================================
// Main Component
// ============================================================================

export function BackupSetupModal({
  visible,
  onClose,
  onSuccess,
}: BackupSetupModalProps) {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  const primaryColor = useThemeColor({}, 'tint');
  const mutedColor = useThemeColor({ light: '#687076', dark: '#9BA1A6' }, 'icon');
  const bgColor = useThemeColor({ light: '#fff', dark: '#1c1c1e' }, 'background');
  const cardBg = useThemeColor({ light: '#f8f9fa', dark: '#2c2c2e' }, 'background');
  const successColor = '#22c55e';
  const errorColor = '#ef4444';

  const [step, setStep] = useState<Step>('intro');
  const [password, setPassword] = useState('');
  const [selectedProvider, setSelectedProvider] = useState<CloudProvider | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPasswordModal, setShowPasswordModal] = useState(false);

  const providers = getProviderOptions();

  // Reset state when modal closes
  useEffect(() => {
    if (!visible) {
      setStep('intro');
      setPassword('');
      setSelectedProvider(null);
      setIsLoading(false);
      setError(null);
      setShowPasswordModal(false);
    }
  }, [visible]);

  // Handle success
  useEffect(() => {
    if (step === 'success') {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
  }, [step]);

  const handleStartBackup = () => {
    setShowPasswordModal(true);
  };

  const handlePasswordSubmit = async (pwd: string) => {
    setPassword(pwd);
    setShowPasswordModal(false);
    setStep('provider');
  };

  const handleProviderSelect = async (provider: CloudProvider) => {
    setSelectedProvider(provider);
    setStep('progress');
    setIsLoading(true);
    setError(null);

    try {
      const result = await createBackup(password, provider);

      if (result.success) {
        setStep('success');
      } else {
        setError(result.error || 'Backup failed');
        setStep('error');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Backup failed');
      setStep('error');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDone = () => {
    onSuccess?.();
    onClose();
  };

  const handleRetry = () => {
    setStep('provider');
    setError(null);
  };

  const getProviderIcon = (provider: CloudProvider): string => {
    switch (provider) {
      case 'icloud':
        return 'cloud';
      case 'google_drive':
        return 'logo-google';
      case 'local_file':
        return 'download';
      default:
        return 'cloud-offline';
    }
  };

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
            >
              {/* Header */}
              <View style={styles.header}>
                <View style={styles.headerContent}>
                  <View style={[styles.headerIcon, { backgroundColor: `${primaryColor}15` }]}>
                    <Ionicons
                      name={step === 'success' ? 'checkmark-circle' : 'cloud-upload'}
                      size={24}
                      color={step === 'success' ? successColor : primaryColor}
                    />
                  </View>
                  <View style={styles.headerText}>
                    <ThemedText style={styles.title}>
                      {step === 'intro' && 'Backup Your Wallet'}
                      {step === 'provider' && 'Choose Backup Location'}
                      {step === 'progress' && 'Creating Backup...'}
                      {step === 'success' && 'Backup Complete!'}
                      {step === 'error' && 'Backup Failed'}
                    </ThemedText>
                    <ThemedText style={[styles.subtitle, { color: mutedColor }]}>
                      {step === 'intro' && 'Secure your seed phrase'}
                      {step === 'provider' && 'Where to store your backup'}
                      {step === 'progress' && 'Please wait...'}
                      {step === 'success' && 'Your wallet is protected'}
                      {step === 'error' && 'Please try again'}
                    </ThemedText>
                  </View>
                </View>
                {step !== 'progress' && (
                  <Pressable
                    onPress={onClose}
                    style={({ pressed }) => [styles.closeButton, pressed && styles.pressed]}
                  >
                    <Ionicons name="close" size={24} color={mutedColor} />
                  </Pressable>
                )}
              </View>

              {/* Step: Introduction */}
              {step === 'intro' && (
                <Animated.View entering={FadeInUp.duration(300)}>
                  <View style={[styles.featureList, { backgroundColor: cardBg }]}>
                    <View style={styles.featureItem}>
                      <View style={[styles.featureIcon, { backgroundColor: `${primaryColor}15` }]}>
                        <Ionicons name="shield-checkmark" size={20} color={primaryColor} />
                      </View>
                      <View style={styles.featureText}>
                        <ThemedText style={styles.featureTitle}>Encrypted Protection</ThemedText>
                        <ThemedText style={[styles.featureDesc, { color: mutedColor }]}>
                          Your seed phrase is encrypted with a password you create
                        </ThemedText>
                      </View>
                    </View>

                    <View style={styles.featureItem}>
                      <View style={[styles.featureIcon, { backgroundColor: `${primaryColor}15` }]}>
                        <Ionicons name="cloud" size={20} color={primaryColor} />
                      </View>
                      <View style={styles.featureText}>
                        <ThemedText style={styles.featureTitle}>Cloud Storage</ThemedText>
                        <ThemedText style={[styles.featureDesc, { color: mutedColor }]}>
                          {Platform.OS === 'ios' ? 'iCloud' : 'Google Drive'} or download a file
                        </ThemedText>
                      </View>
                    </View>

                    <View style={styles.featureItem}>
                      <View style={[styles.featureIcon, { backgroundColor: `${primaryColor}15` }]}>
                        <Ionicons name="sync" size={20} color={primaryColor} />
                      </View>
                      <View style={styles.featureText}>
                        <ThemedText style={styles.featureTitle}>Easy Recovery</ThemedText>
                        <ThemedText style={[styles.featureDesc, { color: mutedColor }]}>
                          Restore your wallet on any device with your password
                        </ThemedText>
                      </View>
                    </View>
                  </View>

                  <Pressable
                    onPress={handleStartBackup}
                    style={({ pressed }) => [
                      styles.primaryButton,
                      { backgroundColor: primaryColor },
                      pressed && styles.pressed,
                    ]}
                  >
                    <Ionicons name="key" size={18} color="#fff" />
                    <ThemedText style={styles.primaryButtonText}>
                      Create Backup Password
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
                      Maybe Later
                    </ThemedText>
                  </Pressable>
                </Animated.View>
              )}

              {/* Step: Provider Selection */}
              {step === 'provider' && (
                <Animated.View entering={SlideInRight.duration(300)}>
                  <View style={styles.providerList}>
                    {providers.map((p) => (
                      <Pressable
                        key={p.provider}
                        onPress={() => handleProviderSelect(p.provider)}
                        disabled={!p.isAvailable}
                        style={({ pressed }) => [
                          styles.providerCard,
                          {
                            backgroundColor: cardBg,
                            borderColor: p.isRecommended
                              ? primaryColor
                              : isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)',
                            opacity: p.isAvailable ? 1 : 0.5,
                          },
                          pressed && styles.pressed,
                        ]}
                      >
                        <View style={[styles.providerIcon, { backgroundColor: `${primaryColor}15` }]}>
                          <Ionicons
                            name={getProviderIcon(p.provider) as any}
                            size={24}
                            color={primaryColor}
                          />
                        </View>
                        <View style={styles.providerText}>
                          <View style={styles.providerNameRow}>
                            <ThemedText style={styles.providerName}>
                              {p.displayName}
                            </ThemedText>
                            {p.isRecommended && (
                              <View style={[styles.recommendedBadge, { backgroundColor: `${primaryColor}20` }]}>
                                <ThemedText style={[styles.recommendedText, { color: primaryColor }]}>
                                  Recommended
                                </ThemedText>
                              </View>
                            )}
                          </View>
                          <ThemedText style={[styles.providerDesc, { color: mutedColor }]}>
                            {p.provider === 'icloud' && 'Syncs across Apple devices'}
                            {p.provider === 'google_drive' && 'Syncs across Android devices'}
                            {p.provider === 'local_file' && 'Download and store yourself'}
                          </ThemedText>
                          {!p.isAvailable && (
                            <ThemedText style={[styles.providerUnavailable, { color: errorColor }]}>
                              Requires development build
                            </ThemedText>
                          )}
                        </View>
                        <Ionicons name="chevron-forward" size={20} color={mutedColor} />
                      </Pressable>
                    ))}
                  </View>

                  <Pressable
                    onPress={() => setStep('intro')}
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

              {/* Step: Progress */}
              {step === 'progress' && (
                <Animated.View entering={FadeIn.duration(200)} style={styles.progressContainer}>
                  <ActivityIndicator size="large" color={primaryColor} />
                  <ThemedText style={[styles.progressText, { color: mutedColor }]}>
                    Encrypting and uploading your backup...
                  </ThemedText>
                  <ThemedText style={[styles.progressHint, { color: mutedColor }]}>
                    This may take a moment
                  </ThemedText>
                </Animated.View>
              )}

              {/* Step: Success */}
              {step === 'success' && (
                <Animated.View entering={FadeIn.duration(300)}>
                  <View style={[styles.successContainer, { backgroundColor: `${successColor}10` }]}>
                    <View style={[styles.successIcon, { backgroundColor: successColor }]}>
                      <Ionicons name="checkmark" size={40} color="#fff" />
                    </View>
                    <ThemedText style={[styles.successTitle, { color: successColor }]}>
                      Backup Successful!
                    </ThemedText>
                    <ThemedText style={[styles.successDesc, { color: mutedColor }]}>
                      Your wallet is now protected. Keep your password safe - you'll need it to restore your wallet.
                    </ThemedText>
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
                      Backup Failed
                    </ThemedText>
                    <ThemedText style={[styles.errorDesc, { color: mutedColor }]}>
                      {error || 'An unexpected error occurred'}
                    </ThemedText>
                  </View>

                  <Pressable
                    onPress={handleRetry}
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
        mode="create"
        title="Create Backup Password"
        subtitle="This password encrypts your seed phrase"
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
  featureList: {
    borderRadius: 16,
    padding: 16,
    gap: 16,
    marginBottom: 20,
  },
  featureItem: {
    flexDirection: 'row',
    gap: 14,
  },
  featureIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  featureText: {
    flex: 1,
  },
  featureTitle: {
    fontSize: 15,
    fontWeight: '600',
    marginBottom: 2,
  },
  featureDesc: {
    fontSize: 13,
    lineHeight: 18,
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
  providerList: {
    gap: 12,
    marginBottom: 20,
  },
  providerCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 16,
    borderWidth: 2,
    gap: 14,
  },
  providerIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  providerText: {
    flex: 1,
  },
  providerNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  providerName: {
    fontSize: 16,
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
  providerDesc: {
    fontSize: 13,
    marginTop: 2,
  },
  providerUnavailable: {
    fontSize: 12,
    marginTop: 4,
  },
  progressContainer: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  progressText: {
    fontSize: 16,
    fontWeight: '500',
    marginTop: 20,
  },
  progressHint: {
    fontSize: 13,
    marginTop: 8,
  },
  successContainer: {
    alignItems: 'center',
    padding: 32,
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
    marginBottom: 12,
  },
  successDesc: {
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
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

export default BackupSetupModal;
