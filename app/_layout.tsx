import { useEffect } from 'react';
import { View, Text } from 'react-native';
import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { router, Stack, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import 'react-native-reanimated';

import { ConvexProvider, ConvexReactClient } from 'convex/react';
import { AuthProvider, useAuth } from '@/stores/authConvex';
import { CardsProvider } from '@/stores/cardsConvex';
import { FundingProvider } from '@/stores/fundingConvex';
import { WalletsProvider } from '@/stores/walletsConvex';
import { CryptoProvider } from '@/stores/cryptoConvex';
import { useColorScheme } from '@/hooks/use-color-scheme';

// Initialize Convex client
const convexUrl = process.env.EXPO_PUBLIC_CONVEX_URL;
const convex = convexUrl ? new ConvexReactClient(convexUrl) : null;

export const unstable_settings = {
  anchor: '(tabs)',
};

// Auth guard that handles navigation based on auth state
// This runs INSIDE AuthProvider so it can use useAuth()
function AuthGuard({ children }: { children: React.ReactNode }) {
  const auth = useAuth();
  const segments = useSegments();

  useEffect(() => {
    const inOnboarding = segments[0] === 'onboarding';

    console.log('[AuthGuard] State:', {
      isLoading: auth.isLoading,
      isAuthenticated: auth.isAuthenticated,
      inOnboarding,
      segments,
    });

    if (auth.isLoading) {
      // Still loading - don't navigate yet
      return;
    }

    if (!auth.isAuthenticated && !inOnboarding) {
      // Not authenticated and not on onboarding - redirect to onboarding
      console.log('[AuthGuard] Redirecting to onboarding...');
      router.replace('/onboarding');
    } else if (auth.isAuthenticated && inOnboarding) {
      // Authenticated but on onboarding - redirect to main app
      console.log('[AuthGuard] Authenticated, redirecting to main app...');
      router.replace('/(tabs)');
    }
  }, [auth.isLoading, auth.isAuthenticated, segments]);

  // Show loading screen while auth is loading
  if (auth.isLoading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#0A0A0A' }}>
        <Text style={{ fontSize: 64, marginBottom: 16 }}>💳</Text>
        <Text style={{ fontSize: 18, fontWeight: '600', color: '#FFFFFF' }}>Loading...</Text>
      </View>
    );
  }

  return <>{children}</>;
}

export default function RootLayout() {
  const colorScheme = useColorScheme();

  // Wrap with Convex provider if available
  const content = (
    <KeyboardProvider>
      <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
        <AuthProvider>
          <CardsProvider>
            <FundingProvider>
              <WalletsProvider>
                <CryptoProvider>
                  <AuthGuard>
                    <Stack>
                      <Stack.Screen name="onboarding" options={{ headerShown: false, animation: 'fade' }} />
                      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
                      <Stack.Screen name="auth" options={{ headerShown: false }} />
                      <Stack.Screen name="identity" options={{ presentation: 'modal', headerShown: false }} />
                      <Stack.Screen name="settings" options={{ presentation: 'modal', headerShown: false }} />
                      <Stack.Screen name="history" options={{ presentation: 'modal', headerShown: false }} />
                      <Stack.Screen name="modal" options={{ presentation: 'modal', title: 'Modal' }} />
                    </Stack>
                  </AuthGuard>
                  <StatusBar style="auto" />
                </CryptoProvider>
              </WalletsProvider>
            </FundingProvider>
          </CardsProvider>
        </AuthProvider>
      </ThemeProvider>
    </KeyboardProvider>
  );

  // Only wrap with ConvexProvider if URL is configured
  if (convex) {
    return (
      <ConvexProvider client={convex}>
        {content}
      </ConvexProvider>
    );
  }

  return content;
}
