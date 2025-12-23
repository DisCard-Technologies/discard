import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { 
  useSharedValue, 
  useAnimatedStyle, 
  withTiming, 
  withRepeat,
  Easing 
} from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Circle } from 'react-native-svg';
import { useAuthOperations, useAuth } from '../../stores/authConvex';
import { isPasskeySupported, formatBiometricType } from '../../lib/passkeys';
import { AmbientBackground, GlassCard, StatusDot } from '../../components/ui';
import { colors } from '../../lib/utils';
import * as LocalAuthentication from 'expo-local-authentication';

type OnboardingStep = 'splash' | 'biometric' | 'generating' | 'complete';

export default function OnboardingFlowScreen() {
  const [step, setStep] = useState<OnboardingStep>('splash');
  const [progress, setProgress] = useState(0);
  const [deviceType, setDeviceType] = useState<'face' | 'fingerprint'>('face');
  const [displayName, setDisplayName] = useState('');

  const authState = useAuth();
  const { registerWithPasskey, loginWithPasskey } = useAuthOperations();

  // Check device support on mount
  useEffect(() => {
    checkDeviceType();
  }, []);

  async function checkDeviceType() {
    try {
      const support = await isPasskeySupported();
      if (support.biometricTypes.length > 0) {
        const type = support.biometricTypes[0];
        setDeviceType(
          type === LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION ? 'face' : 'fingerprint'
        );
      }
    } catch (err) {
      console.error('Failed to check device type:', err);
    }
  }

  // Simulate key generation progress
  useEffect(() => {
    if (step === 'generating') {
      const interval = setInterval(() => {
        setProgress((prev) => {
          if (prev >= 100) {
            clearInterval(interval);
            setTimeout(() => setStep('complete'), 500);
            return 100;
          }
          return prev + 2;
        });
      }, 50);
      return () => clearInterval(interval);
    }
  }, [step]);

  const handleBiometricTrigger = async () => {
    setStep('biometric');
    
    // Actually perform passkey registration
    try {
      const success = await registerWithPasskey(displayName || 'DisCard User');
      
      if (success) {
        setStep('generating');
        // After generating completes, auth state will be updated
        // and AuthGuard will automatically show MainTabs
      } else {
        // Registration failed, go back to splash
        console.error('Registration failed:', authState.error);
        setStep('splash');
      }
    } catch (err) {
      console.error('Registration error:', err);
      setStep('splash');
    }
  };

  return (
    <AmbientBackground>
      <SafeAreaView style={{ flex: 1 }}>
        <View className="flex-1 px-6">
          {/* Content */}
          <View className="flex-1 justify-center">
            {step === 'splash' && (
              <SplashScreen 
                onContinue={handleBiometricTrigger} 
                deviceType={deviceType} 
              />
            )}
            {step === 'biometric' && (
              <BiometricScreen deviceType={deviceType} />
            )}
            {step === 'generating' && (
              <GeneratingScreen progress={progress} />
            )}
            {step === 'complete' && (
              <CompleteScreen onComplete={() => {
                // Auth state is already updated from register()
                // AuthGuard will automatically show MainTabs
              }} />
            )}
          </View>

          {/* Step indicators - hidden on splash screen */}
          {step !== 'splash' && (
            <View className="pb-12 flex-row justify-center gap-2">
              {['splash', 'biometric', 'generating', 'complete'].map((s, i) => {
                const isActive = ['splash', 'biometric', 'generating', 'complete'].indexOf(step) >= i;
                return (
                  <View
                    key={s}
                    className={`h-1 rounded-full transition-all ${
                      isActive ? 'w-8 bg-primary' : 'w-2 bg-muted'
                    }`}
                  />
                );
              })}
            </View>
          )}
        </View>
      </SafeAreaView>
    </AmbientBackground>
  );
}

function SplashScreen({ onContinue, deviceType }: { 
  onContinue: () => void; 
  deviceType: 'face' | 'fingerprint' 
}) {
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 }}>
      {/* Logo */}
      <View style={{ marginBottom: 32 }}>
        <View style={{ position: 'relative' }}>
          {/* Glass card with shield */}
          <View style={{
            width: 80,
            height: 80,
            borderRadius: 16,
            backgroundColor: 'rgba(16, 185, 129, 0.1)',
            borderWidth: 1,
            borderColor: 'rgba(16, 185, 129, 0.3)',
            alignItems: 'center',
            justifyContent: 'center',
          }}>
            <Ionicons name="shield-checkmark" size={40} color="#10B981" />
          </View>
          {/* Sparkle badge */}
          <View style={{
            position: 'absolute',
            bottom: -4,
            right: -4,
            width: 24,
            height: 24,
            borderRadius: 12,
            backgroundColor: '#10B981',
            alignItems: 'center',
            justifyContent: 'center',
          }}>
            <Ionicons name="sparkles" size={12} color="#FFFFFF" />
          </View>
        </View>
      </View>

      {/* Title */}
      <Text style={{
        fontSize: 28,
        fontWeight: '600',
        color: '#FFFFFF',
        marginBottom: 12,
        textAlign: 'center',
      }}>
        Welcome to DisCard
      </Text>

      {/* Subtitle */}
      <Text style={{
        fontSize: 16,
        color: '#9CA3AF',
        marginBottom: 32,
        textAlign: 'center',
        lineHeight: 24,
      }}>
        Secure your DisCard with your{' '}
        <Text style={{ color: '#10B981', fontWeight: '500' }}>device identity</Text>.
      </Text>

      {/* Feature Cards */}
      <View style={{ width: '100%', maxWidth: 360, marginBottom: 40 }}>
        {/* Hardware-Bound Security Card */}
        <View style={{
          backgroundColor: 'rgba(31, 41, 55, 0.6)',
          borderRadius: 16,
          borderWidth: 1,
          borderColor: 'rgba(55, 65, 81, 0.5)',
          padding: 16,
          flexDirection: 'row',
          alignItems: 'flex-start',
          marginBottom: 12,
        }}>
          <View style={{
            width: 40,
            height: 40,
            borderRadius: 10,
            backgroundColor: 'rgba(16, 185, 129, 0.15)',
            alignItems: 'center',
            justifyContent: 'center',
            marginRight: 16,
          }}>
            <Ionicons 
              name={deviceType === 'face' ? 'scan' : 'finger-print'} 
              size={20} 
              color="#10B981" 
            />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 14, fontWeight: '600', color: '#FFFFFF', marginBottom: 4 }}>
              Hardware-Bound Security
            </Text>
            <Text style={{ fontSize: 13, color: '#9CA3AF', lineHeight: 18 }}>
              Your private key is generated inside the Secure Enclave and never leaves your device.
            </Text>
          </View>
        </View>

        {/* No Seed Phrases Card */}
        <View style={{
          backgroundColor: 'rgba(31, 41, 55, 0.6)',
          borderRadius: 16,
          borderWidth: 1,
          borderColor: 'rgba(55, 65, 81, 0.5)',
          padding: 16,
          flexDirection: 'row',
          alignItems: 'flex-start',
        }}>
          <View style={{
            width: 40,
            height: 40,
            borderRadius: 10,
            backgroundColor: 'rgba(139, 92, 246, 0.15)',
            alignItems: 'center',
            justifyContent: 'center',
            marginRight: 16,
          }}>
            <Ionicons name="shield-checkmark" size={20} color="#8B5CF6" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 14, fontWeight: '600', color: '#FFFFFF', marginBottom: 4 }}>
              No Seed Phrases
            </Text>
            <Text style={{ fontSize: 13, color: '#9CA3AF', lineHeight: 18 }}>
              Passkey technology eliminates the need to write down or store recovery words.
            </Text>
          </View>
        </View>
      </View>

      {/* CTA Button */}
      <TouchableOpacity
        onPress={onContinue}
        activeOpacity={0.8}
        style={{
          width: '100%',
          maxWidth: 360,
          height: 56,
          borderRadius: 16,
          backgroundColor: '#10B981',
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Text style={{ fontSize: 16, fontWeight: '600', color: '#000000', marginRight: 8 }}>
          Continue with {deviceType === 'face' ? 'Face ID' : 'Fingerprint'}
        </Text>
        <Ionicons name="chevron-forward" size={20} color="#000000" />
      </TouchableOpacity>

      {/* Footer text */}
      <Text style={{ fontSize: 12, color: '#6B7280', marginTop: 16, textAlign: 'center' }}>
        Uses WebAuthn / Passkey standard
      </Text>
    </View>
  );
}

function BiometricScreen({ deviceType }: { deviceType: 'face' | 'fingerprint' }) {
  const scale = useSharedValue(1);
  const opacity = useSharedValue(1);

  useEffect(() => {
    scale.value = withRepeat(
      withTiming(1.2, { duration: 1500, easing: Easing.inOut(Easing.ease) }),
      -1,
      true
    );
    opacity.value = withRepeat(
      withTiming(0.3, { duration: 1500, easing: Easing.inOut(Easing.ease) }),
      -1,
      true
    );
  }, []);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: opacity.value,
  }));

  return (
    <View className="items-center">
      {/* Biometric visual */}
      <View className="mb-10 relative">
        {/* Outer rings */}
        <Animated.View 
          style={[
            {
              position: 'absolute',
              top: 0,
              left: 0,
              width: 192,
              height: 192,
              borderRadius: 96,
              borderWidth: 1,
              borderColor: 'rgba(16, 185, 129, 0.2)',
            },
            animatedStyle
          ]} 
        />

        {/* Main icon container */}
        <GlassCard className="w-48 h-48 rounded-full items-center justify-center">
          <Ionicons 
            name={deviceType === 'face' ? 'scan' : 'finger-print'} 
            size={80} 
            color={colors.primary} 
          />
        </GlassCard>

        {/* Scanning indicator */}
        <View className="absolute -bottom-2 left-1/2 -ml-12 px-3 py-1 rounded-full bg-primary/20 border border-primary/30">
          <Text className="text-xs text-primary font-medium">Verifying...</Text>
        </View>
      </View>

      <Text className="text-xl font-medium text-foreground mb-2">
        {deviceType === 'face' ? 'Look at your device' : 'Touch the sensor'}
      </Text>
      <Text className="text-sm text-muted-foreground">
        Authenticate to generate your secure wallet
      </Text>
    </View>
  );
}

function GeneratingScreen({ progress }: { progress: number }) {
  const circumference = 2 * Math.PI * 88;
  const strokeDashoffset = circumference - (circumference * progress) / 100;

  return (
    <View className="items-center">
      {/* Progress ring */}
      <View className="mb-10 relative">
        <Svg width={192} height={192} viewBox="0 0 192 192">
          {/* Background circle */}
          <Circle
            cx="96"
            cy="96"
            r="88"
            stroke="#374151"
            strokeWidth="2"
            fill="none"
          />
          {/* Progress circle */}
          <Circle
            cx="96"
            cy="96"
            r="88"
            stroke={colors.primary}
            strokeWidth="3"
            fill="none"
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            strokeLinecap="round"
            rotation="-90"
            origin="96, 96"
          />
        </Svg>

        {/* Center content */}
        <View className="absolute inset-0 items-center justify-center">
          <Ionicons name="shield-checkmark" size={48} color={colors.primary} />
          <Text className="text-2xl font-semibold text-foreground mt-2 font-mono">
            {progress}%
          </Text>
        </View>
      </View>

      <Text className="text-xl font-medium text-foreground mb-6">
        Generating Secure Keys
      </Text>

      {/* Status updates */}
      <View className="gap-2">
        <StatusItem completed={progress >= 20} label="Initializing Secure Enclave" />
        <StatusItem completed={progress >= 50} label="Generating key pair" />
        <StatusItem completed={progress >= 80} label="Registering with network" />
        <StatusItem completed={progress >= 100} label="Finalizing wallet" />
      </View>

      <Text className="text-xs text-muted-foreground mt-6 text-center max-w-xs">
        Your private key is being created inside your device's hardware security module. 
        It will never leave this device.
      </Text>
    </View>
  );
}

function StatusItem({ completed, label }: { completed: boolean; label: string }) {
  return (
    <Text className={`text-sm ${completed ? 'text-foreground' : 'text-muted-foreground'}`}>
      {completed ? '✓' : '○'} {label}
    </Text>
  );
}

function CompleteScreen({ onComplete }: { onComplete: () => void }) {
  return (
    <View className="items-center max-w-sm mx-auto">
      {/* Success visual */}
      <View className="mb-8 relative">
        <View className="w-24 h-24 rounded-full bg-primary/20 items-center justify-center">
          <View className="w-16 h-16 rounded-full bg-primary items-center justify-center">
            <Ionicons name="checkmark" size={32} color="#FFFFFF" strokeWidth={3} />
          </View>
        </View>
      </View>

      <Text className="text-2xl font-semibold text-foreground mb-3">
        You're All Set
      </Text>

      <Text className="text-muted-foreground mb-8 text-center">
        Your sovereign identity is now secured by your device's hardware. No seed phrases, 
        no cloud backups—just you and your device.
      </Text>

      {/* Wallet preview card */}
      <GlassCard className="w-full mb-8">
        <View className="flex-row items-center justify-between mb-4">
          <Text className="text-xs text-muted-foreground uppercase tracking-wider">
            Your Wallet
          </Text>
          <View className="flex-row items-center">
            <StatusDot size="sm" />
            <Text className="text-xs text-primary ml-1.5">Secured</Text>
          </View>
        </View>
        <View className="flex-row items-center">
          <LinearGradient
            colors={[colors.primary, colors.accent]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            className="w-10 h-10 rounded-xl items-center justify-center mr-3"
          >
            <Ionicons name="shield-checkmark" size={20} color="#FFFFFF" />
          </LinearGradient>
          <View className="flex-1">
            <Text className="text-sm font-medium text-foreground font-mono">
              0x7f3a...8c2d
            </Text>
            <Text className="text-xs text-muted-foreground">Passkey Protected</Text>
          </View>
        </View>
      </GlassCard>

      <TouchableOpacity
        onPress={onComplete}
        className="w-full h-14 rounded-2xl bg-primary items-center justify-center"
        activeOpacity={0.8}
      >
        <Text className="text-base font-medium text-white">
          Enter DisCard
        </Text>
      </TouchableOpacity>
    </View>
  );
}

