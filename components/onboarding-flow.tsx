import { useState, useEffect } from 'react';
import { StyleSheet, View, Text, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  FadeIn,
} from 'react-native-reanimated';
import Svg, { Circle } from 'react-native-svg';
import * as LocalAuthentication from 'expo-local-authentication';

import { Colors, primaryColor, accentColor } from '@/constants/theme';

type OnboardingStep = 'splash' | 'biometric' | 'generating' | 'complete';

interface OnboardingFlowProps {
  onComplete: () => void;
  registerWithPasskey: (displayName: string) => Promise<boolean>;
  walletAddress?: string;
  error?: string | null;
}

export function OnboardingFlow({
  onComplete,
  registerWithPasskey,
  walletAddress,
  error
}: OnboardingFlowProps) {
  const [step, setStep] = useState<OnboardingStep>('splash');
  const [progress, setProgress] = useState(0);
  const [deviceType, setDeviceType] = useState<'face' | 'fingerprint'>('face');
  const [registrationError, setRegistrationError] = useState<string | null>(null);

  // Detect biometric type on mount
  useEffect(() => {
    const checkBiometricType = async () => {
      try {
        const types = await LocalAuthentication.supportedAuthenticationTypesAsync();
        if (types.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION)) {
          setDeviceType('face');
        } else if (types.includes(LocalAuthentication.AuthenticationType.FINGERPRINT)) {
          setDeviceType('fingerprint');
        }
      } catch {
        // Default to face
      }
    };
    checkBiometricType();
  }, []);

  // Animate progress after successful registration
  useEffect(() => {
    if (step === 'generating') {
      const interval = setInterval(() => {
        setProgress((prev) => {
          if (prev >= 100) {
            clearInterval(interval);
            setTimeout(() => setStep('complete'), 500);
            return 100;
          }
          return prev + 4; // Faster progress since real work is done
        });
      }, 50);
      return () => clearInterval(interval);
    }
  }, [step]);

  const handleBiometricTrigger = async () => {
    setStep('biometric');
    setRegistrationError(null);

    try {
      console.log('[Onboarding] Starting registration...');
      // Call real registration - this handles:
      // 1. Biometric authentication
      // 2. Solana wallet generation
      // 3. Convex user registration
      const success = await registerWithPasskey('DisCard User');
      console.log('[Onboarding] Registration result:', success);

      if (success) {
        setStep('generating');
      } else {
        setRegistrationError('Registration failed. Please try again.');
        setStep('splash');
      }
    } catch (err) {
      console.error('[Onboarding] Registration error:', err);
      setRegistrationError(err instanceof Error ? err.message : 'Registration failed');
      setStep('splash');
    }
  };

  const getStepIndex = (s: OnboardingStep) => {
    return ['splash', 'biometric', 'generating', 'complete'].indexOf(s);
  };

  return (
    <View style={styles.container}>
      {/* Ambient background glow */}
      <View style={styles.ambientGlow} />
      <View style={styles.ambientGlowBottom} />

      {/* Content */}
      <View style={styles.content}>
        {step === 'splash' && (
          <SplashScreen
            onContinue={handleBiometricTrigger}
            deviceType={deviceType}
            error={registrationError || error}
          />
        )}
        {step === 'biometric' && <BiometricScreen deviceType={deviceType} />}
        {step === 'generating' && <GeneratingScreen progress={progress} />}
        {step === 'complete' && (
          <CompleteScreen onContinue={onComplete} walletAddress={walletAddress} />
        )}
      </View>

      {/* Bottom step indicators */}
      <View style={styles.indicators}>
        {['splash', 'biometric', 'generating', 'complete'].map((s, i) => (
          <Animated.View
            key={s}
            style={[
              styles.indicator,
              getStepIndex(step) >= i ? styles.indicatorActive : styles.indicatorInactive,
            ]}
          />
        ))}
      </View>
    </View>
  );
}

function SplashScreen({
  onContinue,
  deviceType,
  error,
}: {
  onContinue: () => void;
  deviceType: 'face' | 'fingerprint';
  error?: string | null;
}) {
  return (
    <Animated.View
      entering={FadeIn.duration(700).springify()}
      style={styles.screenContainer}
    >
      {/* Logo */}
      <View style={styles.logoContainer}>
        <View style={styles.logoBox}>
          <Ionicons name="shield" size={40} color={primaryColor} />
        </View>
        <View style={styles.sparkle}>
          <Ionicons name="sparkles" size={12} color="#fff" />
        </View>
      </View>

      {/* Title */}
      <Text style={styles.title}>Welcome to DisCard</Text>

      {/* Subtitle */}
      <Text style={styles.subtitle}>
        Secure your DisCard with your{' '}
        <Text style={styles.highlight}>device identity</Text>.
      </Text>

      {/* Info cards */}
      <View style={styles.infoCards}>
        <View style={styles.infoCard}>
          <View style={[styles.infoIconBox, { backgroundColor: `${primaryColor}20` }]}>
            <Ionicons
              name={deviceType === 'face' ? 'scan' : 'finger-print'}
              size={20}
              color={primaryColor}
            />
          </View>
          <View style={styles.infoTextContainer}>
            <Text style={styles.infoTitle}>Hardware-Bound Security</Text>
            <Text style={styles.infoDescription}>
              Your private key is generated inside the Secure Enclave and never leaves your
              device.
            </Text>
          </View>
        </View>

        <View style={styles.infoCard}>
          <View style={[styles.infoIconBox, { backgroundColor: `${accentColor}20` }]}>
            <Ionicons name="shield-outline" size={20} color={accentColor} />
          </View>
          <View style={styles.infoTextContainer}>
            <Text style={styles.infoTitle}>No Seed Phrases</Text>
            <Text style={styles.infoDescription}>
              Passkey technology eliminates the need to write down or store recovery words.
            </Text>
          </View>
        </View>
      </View>

      {/* CTA Button */}
      <Pressable style={styles.ctaButton} onPress={onContinue}>
        <Text style={styles.ctaText}>
          Continue with {deviceType === 'face' ? 'Face ID' : 'Fingerprint'}
        </Text>
        <Ionicons name="chevron-forward" size={20} color="#fff" />
      </Pressable>

      {error && (
        <View style={styles.errorContainer}>
          <Ionicons name="alert-circle" size={16} color="#ef4444" />
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      <Text style={styles.standardNote}>Uses WebAuthn / Passkey standard</Text>
    </Animated.View>
  );
}

function BiometricScreen({ deviceType }: { deviceType: 'face' | 'fingerprint' }) {
  const pulseScale = useSharedValue(1);
  const [scanning, setScanning] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setScanning(true), 300);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (scanning) {
      pulseScale.value = withSpring(1.1, { damping: 2, stiffness: 80 });
    }
  }, [scanning, pulseScale]);

  const pulseStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pulseScale.value }],
  }));

  return (
    <Animated.View entering={FadeIn.duration(500)} style={styles.biometricContainer}>
      {/* Biometric visual */}
      <View style={styles.biometricCircleOuter}>
        <Animated.View style={[styles.biometricCircleInner, pulseStyle]}>
          <Ionicons
            name={deviceType === 'face' ? 'scan' : 'finger-print'}
            size={64}
            color={scanning ? primaryColor : '#666'}
          />
        </Animated.View>
        {scanning && (
          <View style={styles.verifyingBadge}>
            <Text style={styles.verifyingText}>Verifying...</Text>
          </View>
        )}
      </View>

      <Text style={styles.biometricTitle}>
        {deviceType === 'face' ? 'Look at your device' : 'Touch the sensor'}
      </Text>
      <Text style={styles.biometricSubtitle}>
        Authenticate to generate your secure wallet
      </Text>
    </Animated.View>
  );
}

function GeneratingScreen({ progress }: { progress: number }) {
  const circumference = 2 * Math.PI * 88;
  const strokeDashoffset = circumference - (circumference * progress) / 100;

  return (
    <Animated.View entering={FadeIn.duration(500)} style={styles.generatingContainer}>
      {/* Progress ring */}
      <View style={styles.progressRingContainer}>
        <Svg width={192} height={192} style={styles.progressSvg}>
          {/* Background circle */}
          <Circle
            cx={96}
            cy={96}
            r={88}
            fill="none"
            stroke="#333"
            strokeWidth={2}
          />
          {/* Progress circle */}
          <Circle
            cx={96}
            cy={96}
            r={88}
            fill="none"
            stroke={primaryColor}
            strokeWidth={3}
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            strokeLinecap="round"
            rotation={-90}
            origin="96, 96"
          />
        </Svg>
        {/* Center content */}
        <View style={styles.progressCenter}>
          <Ionicons name="shield" size={48} color={primaryColor} />
          <Text style={styles.progressPercent}>{progress}%</Text>
        </View>
      </View>

      <Text style={styles.generatingTitle}>Generating Secure Keys</Text>

      {/* Status updates */}
      <View style={styles.statusList}>
        <Text style={[styles.statusItem, progress >= 20 && styles.statusItemComplete]}>
          {progress >= 20 ? '✓' : '○'} Initializing Secure Enclave
        </Text>
        <Text style={[styles.statusItem, progress >= 50 && styles.statusItemComplete]}>
          {progress >= 50 ? '✓' : '○'} Generating key pair
        </Text>
        <Text style={[styles.statusItem, progress >= 80 && styles.statusItemComplete]}>
          {progress >= 80 ? '✓' : '○'} Registering with network
        </Text>
        <Text style={[styles.statusItem, progress >= 100 && styles.statusItemComplete]}>
          {progress >= 100 ? '✓' : '○'} Finalizing wallet
        </Text>
      </View>

      <Text style={styles.generatingNote}>
        Your private key is being created inside your device&apos;s hardware security module. It
        will never leave this device.
      </Text>
    </Animated.View>
  );
}

function CompleteScreen({
  onContinue,
  walletAddress,
}: {
  onContinue: () => void;
  walletAddress?: string;
}) {
  // Format wallet address for display
  const displayAddress = walletAddress
    ? `${walletAddress.slice(0, 4)}...${walletAddress.slice(-4)}`
    : 'Generating...';
  return (
    <Animated.View
      entering={FadeIn.duration(500).springify()}
      style={styles.completeContainer}
    >
      {/* Success visual */}
      <View style={styles.successCircleOuter}>
        <View style={styles.successCircleInner}>
          <Ionicons name="checkmark" size={32} color="#fff" strokeWidth={3} />
        </View>
      </View>

      <Text style={styles.completeTitle}>You&apos;re All Set</Text>

      <Text style={styles.completeSubtitle}>
        Your sovereign identity is now secured by your device&apos;s hardware. No seed phrases,
        no cloud backups—just you and your device.
      </Text>

      {/* Wallet preview card */}
      <View style={styles.walletCard}>
        <View style={styles.walletCardHeader}>
          <Text style={styles.walletLabel}>YOUR WALLET</Text>
          <View style={styles.securedBadge}>
            <View style={styles.securedDot} />
            <Text style={styles.securedText}>Secured</Text>
          </View>
        </View>
        <View style={styles.walletInfo}>
          <View style={styles.walletIcon}>
            <Ionicons name="shield" size={20} color="#fff" />
          </View>
          <View>
            <Text style={styles.walletAddress}>{displayAddress}</Text>
            <Text style={styles.walletProtection}>Passkey Protected</Text>
          </View>
        </View>
      </View>

      <Pressable style={styles.ctaButton} onPress={onContinue}>
        <Text style={styles.ctaText}>Enter DisCard</Text>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.dark.background,
  },
  ambientGlow: {
    position: 'absolute',
    top: '15%',
    left: '50%',
    marginLeft: -200,
    width: 400,
    height: 400,
    borderRadius: 200,
    backgroundColor: `${primaryColor}15`,
  },
  ambientGlowBottom: {
    position: 'absolute',
    bottom: '20%',
    left: '50%',
    marginLeft: -150,
    width: 300,
    height: 300,
    borderRadius: 150,
    backgroundColor: `${accentColor}10`,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  indicators: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
    paddingBottom: 48,
  },
  indicator: {
    height: 4,
    borderRadius: 2,
  },
  indicatorActive: {
    width: 32,
    backgroundColor: primaryColor,
  },
  indicatorInactive: {
    width: 8,
    backgroundColor: '#444',
  },

  // Splash Screen
  screenContainer: {
    alignItems: 'center',
    width: '100%',
  },
  logoContainer: {
    marginBottom: 32,
    position: 'relative',
  },
  logoBox: {
    width: 80,
    height: 80,
    borderRadius: 16,
    backgroundColor: `${primaryColor}20`,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: `${primaryColor}30`,
  },
  sparkle: {
    position: 'absolute',
    bottom: -4,
    right: -4,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: primaryColor,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 28,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 12,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 16,
    color: '#999',
    textAlign: 'center',
    marginBottom: 32,
    lineHeight: 24,
  },
  highlight: {
    color: primaryColor,
    fontWeight: '500',
  },
  infoCards: {
    width: '100%',
    gap: 12,
    marginBottom: 40,
  },
  infoCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 16,
    padding: 16,
    borderRadius: 16,
    backgroundColor: Colors.dark.background,
    borderWidth: 1,
    borderColor: Colors.dark.background,
  },  
  infoIconBox: {
    width: 40,
    height: 40,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  infoTextContainer: {
    flex: 1,
  },
  infoTitle: {
    fontSize: 14,
    fontWeight: '500',
    color: '#fff',
    marginBottom: 4,
  },
  infoDescription: {
    fontSize: 12,
    color: '#888',
    lineHeight: 18,
  },
  ctaButton: {
    width: '100%',
    height: 56,
    borderRadius: 16,
    backgroundColor: primaryColor,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    shadowColor: primaryColor,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 8,
  },
  ctaText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  standardNote: {
    fontSize: 12,
    color: '#666',
    marginTop: 16,
  },
  errorContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 12,
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    borderRadius: 8,
  },
  errorText: {
    color: '#ef4444',
    fontSize: 14,
    flex: 1,
  },

  // Biometric Screen
  biometricContainer: {
    alignItems: 'center',
  },
  biometricCircleOuter: {
    width: 192,
    height: 192,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 40,
  },
  biometricCircleInner: {
    width: 192,
    height: 192,
    borderRadius: 96,
    backgroundColor: Colors.dark.background,
    borderWidth: 1,
    borderColor: Colors.dark.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  verifyingBadge: {
    position: 'absolute',
    bottom: -8,
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
    backgroundColor: `${primaryColor}30`,
    borderWidth: 1,
    borderColor: `${primaryColor}50`,
  },
  verifyingText: {
    fontSize: 12,
    fontWeight: '500',
    color: primaryColor,
  },
  biometricTitle: {
    fontSize: 20,
    fontWeight: '500',
    color: '#fff',
    marginBottom: 8,
  },
  biometricSubtitle: {
    fontSize: 14,
    color: '#888',
  },

  // Generating Screen
  generatingContainer: {
    alignItems: 'center',
  },
  progressRingContainer: {
    width: 192,
    height: 192,
    marginBottom: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  progressSvg: {
    position: 'absolute',
  },
  progressCenter: {
    alignItems: 'center',
  },
  progressPercent: {
    fontSize: 24,
    fontWeight: '600',
    color: '#fff',
    fontVariant: ['tabular-nums'],
    marginTop: 8,
  },
  generatingTitle: {
    fontSize: 20,
    fontWeight: '500',
    color: '#fff',
    marginBottom: 16,
  },
  statusList: {
    gap: 8,
    marginBottom: 24,
  },
  statusItem: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
  },
  statusItemComplete: {
    color: '#fff',
  },
  generatingNote: {
    fontSize: 12,
    color: '#666',
    textAlign: 'center',
    lineHeight: 18,
    paddingHorizontal: 16,
  },

  // Complete Screen
  completeContainer: {
    alignItems: 'center',
    width: '100%',
  },
  successCircleOuter: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: `${primaryColor}30`,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 32,
    shadowColor: primaryColor,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.4,
    shadowRadius: 24,
  },
  successCircleInner: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: primaryColor,
    alignItems: 'center',
    justifyContent: 'center',
  },
  completeTitle: {
    fontSize: 24,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 12,
  },
  completeSubtitle: {
    fontSize: 14,
    color: '#888',
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 32,
  },
  walletCard: {
    width: '100%',
    padding: 20,
    borderRadius: 20,
    backgroundColor: Colors.dark.background,
    borderWidth: 1,
    borderColor: Colors.dark.background,
    marginBottom: 32,
  },
  walletCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  walletLabel: {
    fontSize: 10,
    letterSpacing: 2,
    color: '#666',
  },
  securedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  securedDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#22c55e',
  },
  securedText: {
    fontSize: 12,
    color: '#22c55e',
  },
  walletInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  walletIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: primaryColor,
    alignItems: 'center',
    justifyContent: 'center',
  },
  walletAddress: {
    fontSize: 14,
    fontWeight: '500',
    color: '#fff',
    fontVariant: ['tabular-nums'],
  },
  walletProtection: {
    fontSize: 12,
    color: '#666',
    marginTop: 2,
  },
});

