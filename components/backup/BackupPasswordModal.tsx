/**
 * BackupPasswordModal - Password Entry for Backup/Restore
 *
 * Reusable password entry component with:
 * - Show/hide toggle
 * - Strength indicator (for new passwords)
 * - Confirm password field (optional)
 */

import { useState, useEffect } from 'react';
import {
  StyleSheet,
  View,
  Modal,
  TextInput,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { PressableScale } from 'pressto';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeIn, FadeInUp } from 'react-native-reanimated';

import { ThemedText } from '@/components/themed-text';
import { useThemeColor } from '@/hooks/use-theme-color';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { checkPasswordStrength, PasswordStrength } from '@/lib/backup';

// ============================================================================
// Types
// ============================================================================

export interface BackupPasswordModalProps {
  visible: boolean;
  onClose: () => void;
  onSubmit: (password: string) => Promise<void>;
  mode: 'create' | 'unlock';
  title?: string;
  subtitle?: string;
  isLoading?: boolean;
  error?: string | null;
}

// ============================================================================
// Main Component
// ============================================================================

export function BackupPasswordModal({
  visible,
  onClose,
  onSubmit,
  mode,
  title,
  subtitle,
  isLoading = false,
  error: externalError = null,
}: BackupPasswordModalProps) {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  const primaryColor = useThemeColor({}, 'tint');
  const mutedColor = useThemeColor({ light: '#687076', dark: '#9BA1A6' }, 'icon');
  const textColor = useThemeColor({}, 'text');
  const bgColor = useThemeColor({ light: '#fff', dark: '#1c1c1e' }, 'background');
  const cardBg = useThemeColor({ light: '#f8f9fa', dark: '#2c2c2e' }, 'background');
  const errorColor = '#ef4444';
  const successColor = '#22c55e';

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [strength, setStrength] = useState<PasswordStrength | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);

  // Reset state when modal opens
  useEffect(() => {
    if (visible) {
      setPassword('');
      setConfirmPassword('');
      setShowPassword(false);
      setShowConfirmPassword(false);
      setStrength(null);
      setLocalError(null);
    }
  }, [visible]);

  // Update password strength for create mode
  useEffect(() => {
    if (mode === 'create' && password.length > 0) {
      setStrength(checkPasswordStrength(password));
    } else {
      setStrength(null);
    }
  }, [password, mode]);

  const displayError = externalError || localError;

  const handleSubmit = async () => {
    setLocalError(null);

    if (mode === 'create') {
      // Validate password strength
      if (!strength || strength.score < 2) {
        setLocalError('Please use a stronger password');
        return;
      }

      // Validate password confirmation
      if (password !== confirmPassword) {
        setLocalError('Passwords do not match');
        return;
      }
    }

    if (!password) {
      setLocalError('Please enter a password');
      return;
    }

    await onSubmit(password);
  };

  const getStrengthColor = (score: number) => {
    switch (score) {
      case 0:
        return errorColor;
      case 1:
        return '#f97316'; // Orange
      case 2:
        return '#eab308'; // Yellow
      case 3:
        return '#84cc16'; // Light green
      case 4:
        return successColor;
      default:
        return mutedColor;
    }
  };

  const canSubmit = mode === 'create'
    ? password.length >= 8 && password === confirmPassword && (strength?.score ?? 0) >= 2
    : password.length > 0;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.overlay}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 10 : 0}
      >
        <PressableScale style={styles.backdrop} onPress={onClose} />

        <Animated.View
          entering={FadeIn.duration(200)}
          style={[styles.modal, { backgroundColor: bgColor }]}
        >
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.headerContent}>
              <View style={[styles.headerIcon, { backgroundColor: `${primaryColor}15` }]}>
                <Ionicons
                  name={mode === 'create' ? 'key' : 'lock-closed'}
                  size={24}
                  color={primaryColor}
                />
              </View>
              <View style={styles.headerText}>
                <ThemedText style={styles.title}>
                  {title || (mode === 'create' ? 'Create Backup Password' : 'Enter Password')}
                </ThemedText>
                <ThemedText style={[styles.subtitle, { color: mutedColor }]}>
                  {subtitle || (mode === 'create'
                    ? 'This password encrypts your backup'
                    : 'Enter your backup password')}
                </ThemedText>
              </View>
            </View>
            <PressableScale
              onPress={onClose}
              style={styles.closeButton}
            >
              <Ionicons name="close" size={24} color={mutedColor} />
            </PressableScale>
          </View>

          {/* Password Input */}
          <Animated.View entering={FadeInUp.duration(200).delay(100)}>
            <View style={styles.inputSection}>
              <ThemedText style={[styles.inputLabel, { color: mutedColor }]}>
                Password
              </ThemedText>
              <View
                style={[
                  styles.inputContainer,
                  {
                    backgroundColor: cardBg,
                    borderColor: displayError
                      ? errorColor
                      : isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)',
                  },
                ]}
              >
                <TextInput
                  value={password}
                  onChangeText={setPassword}
                  placeholder="Enter password"
                  placeholderTextColor={mutedColor}
                  secureTextEntry={!showPassword}
                  style={[styles.input, { color: textColor }]}
                  autoFocus
                  editable={!isLoading}
                />
                <PressableScale
                  onPress={() => setShowPassword(!showPassword)}
                  style={styles.eyeButton}
                >
                  <Ionicons
                    name={showPassword ? 'eye-off' : 'eye'}
                    size={20}
                    color={mutedColor}
                  />
                </PressableScale>
              </View>

              {/* Password Strength (create mode only) */}
              {mode === 'create' && strength && (
                <View style={styles.strengthContainer}>
                  <View style={styles.strengthBars}>
                    {[0, 1, 2, 3, 4].map((i) => (
                      <View
                        key={i}
                        style={[
                          styles.strengthBar,
                          {
                            backgroundColor:
                              i <= strength.score
                                ? getStrengthColor(strength.score)
                                : isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)',
                          },
                        ]}
                      />
                    ))}
                  </View>
                  <ThemedText
                    style={[
                      styles.strengthLabel,
                      { color: getStrengthColor(strength.score) },
                    ]}
                  >
                    {strength.label.replace('_', ' ')}
                  </ThemedText>
                </View>
              )}

              {/* Strength Feedback */}
              {mode === 'create' && strength && strength.feedback.length > 0 && (
                <View style={styles.feedbackContainer}>
                  {strength.feedback.map((tip, i) => (
                    <View key={i} style={styles.feedbackItem}>
                      <Ionicons name="information-circle" size={14} color={mutedColor} />
                      <ThemedText style={[styles.feedbackText, { color: mutedColor }]}>
                        {tip}
                      </ThemedText>
                    </View>
                  ))}
                </View>
              )}
            </View>

            {/* Confirm Password (create mode only) */}
            {mode === 'create' && (
              <View style={styles.inputSection}>
                <ThemedText style={[styles.inputLabel, { color: mutedColor }]}>
                  Confirm Password
                </ThemedText>
                <View
                  style={[
                    styles.inputContainer,
                    {
                      backgroundColor: cardBg,
                      borderColor:
                        confirmPassword && password !== confirmPassword
                          ? errorColor
                          : isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)',
                    },
                  ]}
                >
                  <TextInput
                    value={confirmPassword}
                    onChangeText={setConfirmPassword}
                    placeholder="Confirm password"
                    placeholderTextColor={mutedColor}
                    secureTextEntry={!showConfirmPassword}
                    style={[styles.input, { color: textColor }]}
                    editable={!isLoading}
                  />
                  <PressableScale
                    onPress={() => setShowConfirmPassword(!showConfirmPassword)}
                    style={styles.eyeButton}
                  >
                    <Ionicons
                      name={showConfirmPassword ? 'eye-off' : 'eye'}
                      size={20}
                      color={mutedColor}
                    />
                  </PressableScale>
                </View>
                {confirmPassword && password !== confirmPassword && (
                  <ThemedText style={[styles.errorHint, { color: errorColor }]}>
                    Passwords do not match
                  </ThemedText>
                )}
              </View>
            )}

            {/* Error Message */}
            {displayError && (
              <View style={styles.errorContainer}>
                <Ionicons name="alert-circle" size={16} color={errorColor} />
                <ThemedText style={[styles.errorText, { color: errorColor }]}>
                  {displayError}
                </ThemedText>
              </View>
            )}

            {/* Submit Button */}
            <PressableScale
              onPress={handleSubmit}
              enabled={!isLoading && canSubmit}
              style={[
                styles.submitButton,
                { backgroundColor: primaryColor },
                (isLoading || !canSubmit) && styles.buttonDisabled,
              ]}
            >
              {isLoading ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <>
                  <Ionicons
                    name={mode === 'create' ? 'checkmark-circle' : 'lock-open'}
                    size={18}
                    color="#fff"
                  />
                  <ThemedText style={styles.submitButtonText}>
                    {mode === 'create' ? 'Create Backup' : 'Unlock'}
                  </ThemedText>
                </>
              )}
            </PressableScale>
          </Animated.View>

          {/* Info */}
          {mode === 'create' && (
            <View style={[styles.infoCard, { backgroundColor: `${primaryColor}08` }]}>
              <Ionicons name="shield-checkmark" size={16} color={primaryColor} />
              <ThemedText style={[styles.infoText, { color: mutedColor }]}>
                This password will be required to restore your wallet. Keep it safe!
              </ThemedText>
            </View>
          )}
        </Animated.View>
      </KeyboardAvoidingView>
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
  inputSection: {
    marginBottom: 16,
  },
  inputLabel: {
    fontSize: 13,
    marginBottom: 8,
    fontWeight: '500',
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: 1.5,
    paddingHorizontal: 14,
  },
  input: {
    flex: 1,
    fontSize: 16,
    paddingVertical: 14,
  },
  eyeButton: {
    padding: 8,
    marginRight: -4,
  },
  strengthContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 10,
    gap: 10,
  },
  strengthBars: {
    flex: 1,
    flexDirection: 'row',
    gap: 4,
  },
  strengthBar: {
    flex: 1,
    height: 4,
    borderRadius: 2,
  },
  strengthLabel: {
    fontSize: 12,
    fontWeight: '500',
    textTransform: 'capitalize',
  },
  feedbackContainer: {
    marginTop: 8,
    gap: 4,
  },
  feedbackItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  feedbackText: {
    fontSize: 12,
  },
  errorHint: {
    fontSize: 12,
    marginTop: 6,
  },
  errorContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 16,
    paddingHorizontal: 4,
  },
  errorText: {
    fontSize: 13,
    flex: 1,
  },
  submitButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 16,
    borderRadius: 12,
    marginTop: 8,
  },
  submitButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  infoCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    padding: 14,
    borderRadius: 12,
    marginTop: 16,
  },
  infoText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 18,
  },
});

export default BackupPasswordModal;
