import { useState } from 'react';
import { StyleSheet, View, TextInput, ActivityIndicator, Alert } from 'react-native';
import { PressableScale } from 'pressto';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useThemeColor } from '@/hooks/use-theme-color';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useAuth, useAuthOperations } from '@/stores/authConvex';

export default function AuthScreen() {
  const insets = useSafeAreaInsets();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  const primaryColor = useThemeColor({}, 'tint');
  const mutedColor = useThemeColor({ light: '#687076', dark: '#9BA1A6' }, 'icon');
  const textColor = useThemeColor({}, 'text');
  const inputBg = useThemeColor({ light: '#f4f4f5', dark: '#27272a' }, 'background');

  const { isLoading, error, isAuthenticated } = useAuth();
  const { loginWithPasskey, registerWithPasskey } = useAuthOperations();

  const [isRegistering, setIsRegistering] = useState(false);
  const [displayName, setDisplayName] = useState('');
  const [localLoading, setLocalLoading] = useState(false);

  // Redirect if already authenticated
  if (isAuthenticated) {
    router.replace('/');
    return null;
  }

  const handleLogin = async () => {
    setLocalLoading(true);
    try {
      const success = await loginWithPasskey();
      if (success) {
        router.replace('/');
      }
    } catch (err) {
      Alert.alert('Login Failed', 'Unable to authenticate. Please try again.');
    } finally {
      setLocalLoading(false);
    }
  };

  const handleRegister = async () => {
    if (!displayName.trim()) {
      Alert.alert('Name Required', 'Please enter a display name to continue.');
      return;
    }

    setLocalLoading(true);
    try {
      const success = await registerWithPasskey(displayName.trim());
      if (success) {
        router.replace('/');
      }
    } catch (err) {
      Alert.alert('Registration Failed', 'Unable to create account. Please try again.');
    } finally {
      setLocalLoading(false);
    }
  };

  const isProcessing = isLoading || localLoading;

  return (
    <ThemedView style={styles.container}>
      <View style={{ height: insets.top }} />

      <View style={styles.content}>
        {/* Logo / Brand */}
        <View style={styles.logoSection}>
          <View style={[styles.logoCircle, { backgroundColor: `${primaryColor}20` }]}>
            <View style={[styles.logoInner, { backgroundColor: primaryColor }]}>
              <Ionicons name="wallet" size={32} color="#fff" />
            </View>
          </View>
          <ThemedText style={styles.brandName}>DisCard</ThemedText>
          <ThemedText style={[styles.tagline, { color: mutedColor }]}>
            Intent-Centric Virtual Cards
          </ThemedText>
        </View>

        {/* Auth Form */}
        <View style={styles.formSection}>
          {isRegistering ? (
            <>
              <ThemedText style={styles.formTitle}>Create Account</ThemedText>
              <ThemedText style={[styles.formSubtitle, { color: mutedColor }]}>
                Choose a display name for your account
              </ThemedText>

              <TextInput
                style={[styles.input, { backgroundColor: inputBg, color: textColor }]}
                placeholder="Display Name"
                placeholderTextColor={mutedColor}
                value={displayName}
                onChangeText={setDisplayName}
                autoCapitalize="words"
                autoCorrect={false}
                editable={!isProcessing}
              />

              <PressableScale
                onPress={handleRegister}
                enabled={!isProcessing && displayName.trim().length > 0}
                style={[
                  styles.primaryButton,
                  { backgroundColor: primaryColor },
                  (isProcessing || !displayName.trim()) && styles.buttonDisabled]}
              >
                {isProcessing ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <>
                    <Ionicons name="finger-print" size={20} color="#fff" />
                    <ThemedText style={styles.primaryButtonText}>Create with Passkey</ThemedText>
                  </>
                )}
              </PressableScale>

              <PressableScale
                onPress={() => setIsRegistering(false)}
                style={[styles.secondaryButton]}
              >
                <ThemedText style={[styles.secondaryButtonText, { color: primaryColor }]}>
                  Already have an account? Sign in
                </ThemedText>
              </PressableScale>
            </>
          ) : (
            <>
              <ThemedText style={styles.formTitle}>Welcome Back</ThemedText>
              <ThemedText style={[styles.formSubtitle, { color: mutedColor }]}>
                Sign in with your passkey to continue
              </ThemedText>

              <PressableScale
                onPress={handleLogin}
                enabled={!isProcessing}
                style={[
                  styles.primaryButton,
                  { backgroundColor: primaryColor },
                  isProcessing && styles.buttonDisabled]}
              >
                {isProcessing ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <>
                    <Ionicons name="finger-print" size={20} color="#fff" />
                    <ThemedText style={styles.primaryButtonText}>Sign in with Passkey</ThemedText>
                  </>
                )}
              </PressableScale>

              <PressableScale
                onPress={() => setIsRegistering(true)}
                style={[styles.secondaryButton]}
              >
                <ThemedText style={[styles.secondaryButtonText, { color: primaryColor }]}>
                  New here? Create an account
                </ThemedText>
              </PressableScale>
            </>
          )}

          {error && (
            <View style={styles.errorContainer}>
              <Ionicons name="alert-circle" size={16} color="#ef4444" />
              <ThemedText style={styles.errorText}>{error}</ThemedText>
            </View>
          )}
        </View>

        {/* Footer */}
        <View style={styles.footer}>
          <ThemedText style={[styles.footerText, { color: mutedColor }]}>
            Secured by passkeys and Solana
          </ThemedText>
        </View>
      </View>

      <View style={{ height: insets.bottom }} />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1 },
  content: {
    flex: 1,
    paddingHorizontal: 24,
    justifyContent: 'center' },
  logoSection: {
    alignItems: 'center',
    marginBottom: 48 },
  logoCircle: {
    width: 88,
    height: 88,
    borderRadius: 44,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16 },
  logoInner: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center' },
  brandName: {
    fontSize: 32,
    fontWeight: '600',
    letterSpacing: -1,
    marginBottom: 8 },
  tagline: {
    fontSize: 14 },
  formSection: {
    gap: 16 },
  formTitle: {
    fontSize: 24,
    fontWeight: '600',
    textAlign: 'center' },
  formSubtitle: {
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 8 },
  input: {
    height: 52,
    borderRadius: 12,
    paddingHorizontal: 16,
    fontSize: 16 },
  primaryButton: {
    height: 52,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8 },
  primaryButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600' },
  buttonDisabled: {
    opacity: 0.5 },
  buttonPressed: {
    opacity: 0.8 },
  secondaryButton: {
    height: 44,
    alignItems: 'center',
    justifyContent: 'center' },
  secondaryButtonText: {
    fontSize: 14 },
  errorContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 8 },
  errorText: {
    color: '#ef4444',
    fontSize: 14 },
  footer: {
    position: 'absolute',
    bottom: 32,
    left: 0,
    right: 0,
    alignItems: 'center' },
  footerText: {
    fontSize: 12 } });
