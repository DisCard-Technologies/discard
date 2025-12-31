import { StyleSheet, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { OnboardingFlow } from '@/components/onboarding-flow';
import { Colors } from '@/constants/theme';
import { useAuth, useAuthOperations } from '@/stores/authConvex';

export default function OnboardingScreen() {
  const insets = useSafeAreaInsets();
  const { error, user } = useAuth();
  const { registerWithPasskey } = useAuthOperations();

  const handleComplete = () => {
    // Navigate to the main app (tabs)
    // Auth credentials are already stored in SecureStore by registerWithPasskey
    router.replace('/(tabs)');
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <StatusBar style="light" />
      <OnboardingFlow
        onComplete={handleComplete}
        registerWithPasskey={registerWithPasskey}
        walletAddress={user?.solanaAddress}
        error={error}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.dark.background,
  },
});

