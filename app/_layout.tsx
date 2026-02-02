import { useEffect, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { router, Stack, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useFonts } from 'expo-font';
import * as SplashScreen from 'expo-splash-screen';
import 'react-native-reanimated';
import { PressablesConfig } from 'pressto';

import { ConvexProvider, ConvexReactClient } from 'convex/react';
import { AuthProvider, useAuth } from '@/stores/authConvex';
import { CardsProvider } from '@/stores/cardsConvex';
import { FundingProvider } from '@/stores/fundingConvex';
import { WalletsProvider } from '@/stores/walletsConvex';
import { CryptoProvider } from '@/stores/cryptoConvex';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { ErrorBoundary } from '@/components/ui/error-boundary';
import { usePushNotifications, isPushNotificationSupported, getLastNotificationResponse } from '@/hooks/usePushNotifications';

// Prevent splash screen from auto-hiding
SplashScreen.preventAutoHideAsync();

// Initialize Convex client
const convexUrl = process.env.EXPO_PUBLIC_CONVEX_URL;
const convex = convexUrl ? new ConvexReactClient(convexUrl) : null;

// Note: Previous migration cleanup removed - Convex IDs can start with any letter
// The 'k' prefix check was incorrectly clearing valid user IDs

export const unstable_settings = {
  anchor: '(tabs)',
};

// Push notification initializer - registers token when user is authenticated
function PushNotificationInitializer() {
  const auth = useAuth();
  const {
    isRegistered,
    permissionStatus,
    registerToken,
    error,
  } = usePushNotifications(auth.userId);

  useEffect(() => {
    // Only attempt registration if:
    // 1. User is authenticated
    // 2. Device supports push notifications
    // 3. Not already registered
    // 4. Permission is granted or undetermined
    if (
      auth.isAuthenticated &&
      auth.userId &&
      isPushNotificationSupported() &&
      !isRegistered &&
      permissionStatus !== 'denied'
    ) {
      // Auto-register if permission already granted, otherwise wait for user action
      if (permissionStatus === 'granted') {
        registerToken().catch((err) => {
          console.warn('[PushNotifications] Auto-registration failed:', err);
        });
      }
    }
  }, [auth.isAuthenticated, auth.userId, isRegistered, permissionStatus, registerToken]);

  // Handle cold start notification (app was opened by tapping notification)
  useEffect(() => {
    async function handleColdStartNotification() {
      const response = await getLastNotificationResponse();
      if (response) {
        console.log('[PushNotifications] Cold start notification:', response);
        // The notification tap handler in usePushNotifications will handle routing
      }
    }

    if (auth.isAuthenticated) {
      handleColdStartNotification();
    }
  }, [auth.isAuthenticated]);

  // Log any errors for debugging
  useEffect(() => {
    if (error) {
      console.warn('[PushNotifications] Error:', error);
    }
  }, [error]);

  return null; // This component doesn't render anything
}

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

  // Always render children - show loading overlay if auth is loading
  // This prevents unmounting/remounting the navigation tree
  return (
    <>
      {children}
      {auth.isLoading && (
        <View style={styles.loadingOverlay}>
          <Text style={styles.loadingEmoji}>💳</Text>
          <Text style={styles.loadingText}>Loading...</Text>
        </View>
      )}
    </>
  );
}

function RootLayoutNav() {
  const colorScheme = useColorScheme();

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <KeyboardProvider>
          <PressablesConfig
            animationType="spring"
            animationConfig={{ damping: 15, stiffness: 400 }}
            config={{ minScale: 0.96, activeOpacity: 0.7 }}
          >
          <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
            <AuthProvider>
              <CardsProvider>
                <FundingProvider>
                  <WalletsProvider>
                    <CryptoProvider>
                      <PushNotificationInitializer />
                      <AuthGuard>
                        <ErrorBoundary>
                          <Stack>
                            <Stack.Screen name="onboarding" options={{ headerShown: false, animation: 'fade' }} />
                            <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
                            <Stack.Screen name="auth" options={{ headerShown: false }} />
                            <Stack.Screen name="identity" options={{ presentation: 'modal', headerShown: false }} />
                            <Stack.Screen name="settings" options={{ presentation: 'modal', headerShown: false }} />
                            <Stack.Screen name="privacy-settings" options={{ presentation: 'modal', headerShown: false }} />
                            <Stack.Screen name="history" options={{ presentation: 'modal', headerShown: false }} />
                            <Stack.Screen name="buy-crypto" options={{ headerShown: false }} />
                            <Stack.Screen name="sell-crypto" options={{ headerShown: false }} />
                            <Stack.Screen name="token-detail" options={{ headerShown: false }} />
                            <Stack.Screen name="asset-detail" options={{ headerShown: false }} />
                            <Stack.Screen name="market-detail" options={{ headerShown: false }} />
                            <Stack.Screen name="modal" options={{ presentation: 'modal', title: 'Modal' }} />
                            <Stack.Screen name="transfer" options={{ headerShown: false, presentation: 'modal' }} />
                            <Stack.Screen name="receive" options={{ headerShown: false, presentation: 'modal' }} />
                            <Stack.Screen name="swap" options={{ headerShown: false, presentation: 'modal' }} />
                            <Stack.Screen name="claim/[code]" options={{ headerShown: false }} />
                            <Stack.Screen name="pay/[requestId]" options={{ headerShown: false }} />
                            <Stack.Screen name="contacts" options={{ headerShown: false }} />
                          </Stack>
                        </ErrorBoundary>
                      </AuthGuard>
                      <StatusBar style="auto" />
                    </CryptoProvider>
                  </WalletsProvider>
                </FundingProvider>
              </CardsProvider>
            </AuthProvider>
          </ThemeProvider>
          </PressablesConfig>
        </KeyboardProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

export default function RootLayout() {
  const [isReady, setIsReady] = useState(false);

  // Load custom fonts
  const [fontsLoaded, fontError] = useFonts({
    'InstrumentSans-ExtraLight': require('../assets/fonts/InstrumentSans-ExtraLight.ttf'),
    'InstrumentSans-Regular': require('../assets/fonts/InstrumentSans-Regular.ttf'),
    'InstrumentSans-Medium': require('../assets/fonts/InstrumentSans-Medium.ttf'),
    'JetBrainsMono-Regular': require('../assets/fonts/JetBrainsMono-Regular.ttf'),
  });

  // Log font loading issues
  useEffect(() => {
    if (fontError) {
      console.warn('[Layout] Font loading error:', fontError);
    }
    if (fontsLoaded) {
      console.log('[Layout] Fonts loaded successfully');
    }
  }, [fontsLoaded, fontError]);

  // Mark app ready once fonts are loaded, errored, or after timeout
  useEffect(() => {
    if (fontsLoaded || fontError) {
      setIsReady(true);
      SplashScreen.hideAsync();
      return;
    }
    // Timeout fallback - proceed after 3 seconds even if fonts haven't loaded
    const timeout = setTimeout(() => {
      console.warn('[Layout] Font loading timeout - proceeding without custom fonts');
      setIsReady(true);
      SplashScreen.hideAsync();
    }, 3000);
    return () => clearTimeout(timeout);
  }, [fontsLoaded, fontError]);

  // Always render the navigation tree - splash screen handles the loading state
  // This prevents the "linking configured in multiple places" error
  const content = <RootLayoutNav />;

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

const styles = StyleSheet.create({
  loadingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#0A0A0A',
  },
  loadingEmoji: {
    fontSize: 64,
    marginBottom: 16,
  },
  loadingText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#FFFFFF',
  },
});
