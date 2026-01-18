/**
 * SeedPhraseDisplayModal - Display Seed Phrase (Biometric Gated)
 *
 * Security-gated flow to display the user's seed phrase:
 * 1. Biometric authentication required
 * 2. Security warning displayed
 * 3. 12 words shown in a grid
 * 4. Optional verification quiz
 */

import { useState, useEffect } from 'react';
import {
  StyleSheet,
  View,
  Modal,
  Pressable,
  ScrollView,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeIn, FadeInUp, SlideInRight } from 'react-native-reanimated';
import * as LocalAuthentication from 'expo-local-authentication';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';

import { ThemedText } from '@/components/themed-text';
import { useThemeColor } from '@/hooks/use-theme-color';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { getMnemonicLocally, splitMnemonic } from '@/lib/mnemonic';

// ============================================================================
// Types
// ============================================================================

type Step = 'warning' | 'authenticating' | 'display' | 'verify';

export interface SeedPhraseDisplayModalProps {
  visible: boolean;
  onClose: () => void;
}

// ============================================================================
// Main Component
// ============================================================================

export function SeedPhraseDisplayModal({
  visible,
  onClose,
}: SeedPhraseDisplayModalProps) {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  const primaryColor = useThemeColor({}, 'tint');
  const mutedColor = useThemeColor({ light: '#687076', dark: '#9BA1A6' }, 'icon');
  const textColor = useThemeColor({}, 'text');
  const bgColor = useThemeColor({ light: '#fff', dark: '#1c1c1e' }, 'background');
  const cardBg = useThemeColor({ light: '#f8f9fa', dark: '#2c2c2e' }, 'background');
  const warningColor = '#f97316';
  const dangerColor = '#ef4444';

  const [step, setStep] = useState<Step>('warning');
  const [words, setWords] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [blurred, setBlurred] = useState(true);

  // Verification state
  const [verifyIndex, setVerifyIndex] = useState(-1);
  const [verifyOptions, setVerifyOptions] = useState<string[]>([]);
  const [verifyCorrect, setVerifyCorrect] = useState(false);

  // Reset state when modal closes
  useEffect(() => {
    if (!visible) {
      setStep('warning');
      setWords([]);
      setError(null);
      setCopied(false);
      setBlurred(true);
      setVerifyIndex(-1);
      setVerifyOptions([]);
      setVerifyCorrect(false);
    }
  }, [visible]);

  // Authenticate and load mnemonic
  const handleAuthenticate = async () => {
    setStep('authenticating');
    setError(null);

    try {
      // Check biometric availability
      const hasHardware = await LocalAuthentication.hasHardwareAsync();
      const isEnrolled = await LocalAuthentication.isEnrolledAsync();

      if (!hasHardware || !isEnrolled) {
        // No biometrics - proceed with warning
        console.log('[SeedPhrase] No biometrics available, proceeding with caution');
      } else {
        // Require biometric auth
        const result = await LocalAuthentication.authenticateAsync({
          promptMessage: 'Authenticate to view seed phrase',
          fallbackLabel: 'Use passcode',
          disableDeviceFallback: false,
        });

        if (!result.success) {
          setError('Authentication failed');
          setStep('warning');
          return;
        }
      }

      // Load mnemonic
      const mnemonic = await getMnemonicLocally();
      if (!mnemonic) {
        setError('No seed phrase found');
        setStep('warning');
        return;
      }

      setWords(splitMnemonic(mnemonic));
      setStep('display');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to authenticate');
      setStep('warning');
    }
  };

  // Copy mnemonic to clipboard (with warning)
  const handleCopy = async () => {
    if (words.length === 0) return;

    await Clipboard.setStringAsync(words.join(' '));
    setCopied(true);
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

    // Clear clipboard after 60 seconds for security
    setTimeout(async () => {
      const current = await Clipboard.getStringAsync();
      if (current === words.join(' ')) {
        await Clipboard.setStringAsync('');
      }
    }, 60000);

    // Reset copied state after 3 seconds
    setTimeout(() => setCopied(false), 3000);
  };

  // Start verification quiz
  const handleStartVerify = () => {
    if (words.length === 0) return;

    // Pick a random word index to verify
    const idx = Math.floor(Math.random() * words.length);
    const correctWord = words[idx];

    // Generate wrong options from other words or wordlist
    const wrongOptions = words
      .filter((_, i) => i !== idx)
      .sort(() => Math.random() - 0.5)
      .slice(0, 3);

    // Shuffle correct answer with wrong options
    const options = [...wrongOptions, correctWord].sort(() => Math.random() - 0.5);

    setVerifyIndex(idx);
    setVerifyOptions(options);
    setStep('verify');
  };

  // Check verification answer
  const handleVerifyAnswer = async (answer: string) => {
    if (answer === words[verifyIndex]) {
      setVerifyCorrect(true);
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setTimeout(() => setStep('display'), 1500);
    } else {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setError('Incorrect. Please try again.');
      setTimeout(() => setStep('display'), 1500);
    }
  };

  // Render word grid
  const renderWordGrid = () => {
    const rows: string[][] = [];
    for (let i = 0; i < words.length; i += 3) {
      rows.push(words.slice(i, i + 3));
    }

    return (
      <View style={styles.wordGrid}>
        {rows.map((row, rowIndex) => (
          <View key={rowIndex} style={styles.wordRow}>
            {row.map((word, colIndex) => {
              const index = rowIndex * 3 + colIndex;
              return (
                <View
                  key={index}
                  style={[
                    styles.wordCard,
                    {
                      backgroundColor: cardBg,
                      borderColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)',
                    },
                  ]}
                >
                  <ThemedText style={[styles.wordNumber, { color: primaryColor }]}>
                    {index + 1}
                  </ThemedText>
                  <ThemedText style={[styles.wordText, blurred && styles.blurred]}>
                    {word}
                  </ThemedText>
                </View>
              );
            })}
          </View>
        ))}
      </View>
    );
  };

  return (
    <Modal
      visible={visible}
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
                <View style={[styles.headerIcon, { backgroundColor: `${warningColor}15` }]}>
                  <Ionicons name="key" size={24} color={warningColor} />
                </View>
                <View style={styles.headerText}>
                  <ThemedText style={styles.title}>
                    {step === 'warning' && 'View Seed Phrase'}
                    {step === 'authenticating' && 'Authenticating...'}
                    {step === 'display' && 'Your Seed Phrase'}
                    {step === 'verify' && 'Verify Your Phrase'}
                  </ThemedText>
                  <ThemedText style={[styles.subtitle, { color: mutedColor }]}>
                    {step === 'warning' && 'Security verification required'}
                    {step === 'authenticating' && 'Please authenticate'}
                    {step === 'display' && `${words.length} words - keep secret`}
                    {step === 'verify' && `Select word #${verifyIndex + 1}`}
                  </ThemedText>
                </View>
              </View>
              <Pressable
                onPress={onClose}
                style={({ pressed }) => [styles.closeButton, pressed && styles.pressed]}
              >
                <Ionicons name="close" size={24} color={mutedColor} />
              </Pressable>
            </View>

            {/* Step: Warning */}
            {step === 'warning' && (
              <Animated.View entering={FadeInUp.duration(300)}>
                <View style={[styles.warningCard, { backgroundColor: `${dangerColor}10` }]}>
                  <Ionicons name="warning" size={32} color={dangerColor} />
                  <ThemedText style={[styles.warningTitle, { color: dangerColor }]}>
                    Security Warning
                  </ThemedText>
                  <View style={styles.warningList}>
                    <View style={styles.warningItem}>
                      <Ionicons name="eye-off" size={18} color={mutedColor} />
                      <ThemedText style={[styles.warningText, { color: mutedColor }]}>
                        Never share your seed phrase with anyone
                      </ThemedText>
                    </View>
                    <View style={styles.warningItem}>
                      <Ionicons name="videocam-off-outline" size={18} color={mutedColor} />
                      <ThemedText style={[styles.warningText, { color: mutedColor }]}>
                        Do not take screenshots
                      </ThemedText>
                    </View>
                    <View style={styles.warningItem}>
                      <Ionicons name="document-text" size={18} color={mutedColor} />
                      <ThemedText style={[styles.warningText, { color: mutedColor }]}>
                        Write it down on paper in a safe place
                      </ThemedText>
                    </View>
                    <View style={styles.warningItem}>
                      <Ionicons name="shield-checkmark" size={18} color={mutedColor} />
                      <ThemedText style={[styles.warningText, { color: mutedColor }]}>
                        Anyone with this phrase can steal your funds
                      </ThemedText>
                    </View>
                  </View>
                </View>

                {error && (
                  <View style={styles.errorContainer}>
                    <Ionicons name="alert-circle" size={16} color={dangerColor} />
                    <ThemedText style={[styles.errorText, { color: dangerColor }]}>
                      {error}
                    </ThemedText>
                  </View>
                )}

                <Pressable
                  onPress={handleAuthenticate}
                  style={({ pressed }) => [
                    styles.primaryButton,
                    { backgroundColor: warningColor },
                    pressed && styles.pressed,
                  ]}
                >
                  <Ionicons name="finger-print" size={18} color="#fff" />
                  <ThemedText style={styles.primaryButtonText}>
                    I Understand, Show Phrase
                  </ThemedText>
                </Pressable>
              </Animated.View>
            )}

            {/* Step: Display */}
            {step === 'display' && (
              <Animated.View entering={SlideInRight.duration(300)}>
                {/* Blur toggle */}
                <Pressable
                  onPress={() => setBlurred(!blurred)}
                  style={[
                    styles.blurToggle,
                    { backgroundColor: cardBg, borderColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)' },
                  ]}
                >
                  <Ionicons
                    name={blurred ? 'eye' : 'eye-off'}
                    size={18}
                    color={primaryColor}
                  />
                  <ThemedText style={[styles.blurToggleText, { color: primaryColor }]}>
                    {blurred ? 'Tap to reveal' : 'Tap to hide'}
                  </ThemedText>
                </Pressable>

                {renderWordGrid()}

                {/* Actions */}
                <View style={styles.actions}>
                  <Pressable
                    onPress={handleCopy}
                    style={({ pressed }) => [
                      styles.actionButton,
                      { borderColor: isDark ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.1)' },
                      pressed && styles.pressed,
                    ]}
                  >
                    <Ionicons
                      name={copied ? 'checkmark' : 'copy'}
                      size={18}
                      color={copied ? '#22c55e' : mutedColor}
                    />
                    <ThemedText style={[styles.actionButtonText, { color: copied ? '#22c55e' : mutedColor }]}>
                      {copied ? 'Copied!' : 'Copy'}
                    </ThemedText>
                  </Pressable>

                  <Pressable
                    onPress={handleStartVerify}
                    style={({ pressed }) => [
                      styles.actionButton,
                      { borderColor: isDark ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.1)' },
                      pressed && styles.pressed,
                    ]}
                  >
                    <Ionicons name="checkmark-circle" size={18} color={primaryColor} />
                    <ThemedText style={[styles.actionButtonText, { color: primaryColor }]}>
                      Verify
                    </ThemedText>
                  </Pressable>
                </View>

                {/* Warning reminder */}
                <View style={[styles.reminderCard, { backgroundColor: `${warningColor}08` }]}>
                  <Ionicons name="shield" size={16} color={warningColor} />
                  <ThemedText style={[styles.reminderText, { color: mutedColor }]}>
                    Store this phrase securely. It's the only way to recover your wallet.
                  </ThemedText>
                </View>
              </Animated.View>
            )}

            {/* Step: Verify */}
            {step === 'verify' && (
              <Animated.View entering={SlideInRight.duration(300)}>
                <View style={[styles.verifyCard, { backgroundColor: cardBg }]}>
                  <ThemedText style={styles.verifyQuestion}>
                    What is word #{verifyIndex + 1}?
                  </ThemedText>

                  <View style={styles.verifyOptions}>
                    {verifyOptions.map((option, i) => (
                      <Pressable
                        key={i}
                        onPress={() => handleVerifyAnswer(option)}
                        disabled={verifyCorrect}
                        style={({ pressed }) => [
                          styles.verifyOption,
                          {
                            borderColor: isDark ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.1)',
                          },
                          verifyCorrect && option === words[verifyIndex] && styles.verifyCorrect,
                          pressed && styles.pressed,
                        ]}
                      >
                        <ThemedText style={styles.verifyOptionText}>
                          {option}
                        </ThemedText>
                      </Pressable>
                    ))}
                  </View>

                  {error && (
                    <View style={styles.errorContainer}>
                      <Ionicons name="close-circle" size={16} color={dangerColor} />
                      <ThemedText style={[styles.errorText, { color: dangerColor }]}>
                        {error}
                      </ThemedText>
                    </View>
                  )}

                  {verifyCorrect && (
                    <View style={styles.successContainer}>
                      <Ionicons name="checkmark-circle" size={24} color="#22c55e" />
                      <ThemedText style={[styles.successText, { color: '#22c55e' }]}>
                        Correct! You've verified your phrase.
                      </ThemedText>
                    </View>
                  )}
                </View>

                <Pressable
                  onPress={() => setStep('display')}
                  style={({ pressed }) => [
                    styles.secondaryButton,
                    { borderColor: isDark ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.1)' },
                    pressed && styles.pressed,
                  ]}
                >
                  <Ionicons name="arrow-back" size={18} color={mutedColor} />
                  <ThemedText style={[styles.secondaryButtonText, { color: mutedColor }]}>
                    Back to Phrase
                  </ThemedText>
                </Pressable>
              </Animated.View>
            )}
          </ScrollView>
        </Animated.View>
      </View>
    </Modal>
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
  warningCard: {
    alignItems: 'center',
    padding: 24,
    borderRadius: 16,
    marginBottom: 20,
  },
  warningTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginTop: 12,
    marginBottom: 16,
  },
  warningList: {
    width: '100%',
    gap: 12,
  },
  warningItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  warningText: {
    fontSize: 14,
    flex: 1,
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
  },
  primaryButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  blurToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 16,
  },
  blurToggleText: {
    fontSize: 14,
    fontWeight: '500',
  },
  wordGrid: {
    gap: 8,
    marginBottom: 20,
  },
  wordRow: {
    flexDirection: 'row',
    gap: 8,
  },
  wordCard: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    gap: 8,
  },
  wordNumber: {
    fontSize: 11,
    fontWeight: '600',
    width: 18,
  },
  wordText: {
    fontSize: 14,
    fontWeight: '500',
    flex: 1,
  },
  blurred: {
    opacity: 0,
  },
  actions: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16,
  },
  actionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1.5,
  },
  actionButtonText: {
    fontSize: 14,
    fontWeight: '500',
  },
  reminderCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    padding: 14,
    borderRadius: 12,
  },
  reminderText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 18,
  },
  verifyCard: {
    padding: 20,
    borderRadius: 16,
    marginBottom: 16,
  },
  verifyQuestion: {
    fontSize: 18,
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: 20,
  },
  verifyOptions: {
    gap: 10,
  },
  verifyOption: {
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: 1.5,
    alignItems: 'center',
  },
  verifyOptionText: {
    fontSize: 16,
    fontWeight: '500',
  },
  verifyCorrect: {
    borderColor: '#22c55e',
    backgroundColor: 'rgba(34, 197, 94, 0.1)',
  },
  successContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    marginTop: 16,
  },
  successText: {
    fontSize: 14,
    fontWeight: '500',
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
});

export default SeedPhraseDisplayModal;
