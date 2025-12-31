import React from 'react';
import { StatusBar } from 'expo-status-bar';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { View, Text } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ConvexProvider, ConvexReactClient } from 'convex/react';
// Import NativeWind CSS
import './global.css';
import { NavBar } from './src/components/navigation/NavBar';

// Convex client configuration
const convexUrl = process.env.EXPO_PUBLIC_CONVEX_URL || 'https://your-deployment.convex.cloud';
const convex = new ConvexReactClient(convexUrl);

// Providers
import { AuthProvider, useAuth } from './src/stores/authConvex';
import { CardsProvider } from './src/stores/cardsConvex';
import { FundingProvider } from './src/stores/fundingConvex';
import { WalletsProvider } from './src/stores/walletsConvex';
import { CryptoProvider } from './src/stores/cryptoConvex';

// Screens
import OnboardingFlowScreen from './src/screens/auth/OnboardingFlowScreen';
import AmbientHomeScreen from './src/screens/home/AmbientHomeScreen';
import HoldingsScreen from './src/screens/portfolio/HoldingsScreen';
import ExploreScreen from './src/screens/explore/ExploreScreen';
import TransferScreen from './src/screens/transfer/TransferScreen';
import VisaCardScreen from './src/screens/cards/VisaCardScreen';
import IdentityPanelScreen from './src/screens/identity/IdentityPanelScreen';

// Navigation types
export type RootTabParamList = {
  Home: undefined;
  Holdings: undefined;
  Explore: undefined;
  Transfer: undefined;
  Card: undefined;
  Identity: undefined;
};

// Create navigator
const Tab = createBottomTabNavigator<RootTabParamList>();

// Main tab navigator with 5 tabs
function MainTabs() {
  return (
    <Tab.Navigator
      tabBar={(props) => <NavBar {...props} />}
      screenOptions={{
        headerShown: false,
      }}
    >
      <Tab.Screen name="Home" component={AmbientHomeScreen} />
      <Tab.Screen name="Holdings" component={HoldingsScreen} />
      <Tab.Screen name="Explore" component={ExploreScreen} />
      <Tab.Screen name="Transfer" component={TransferScreen} />
      <Tab.Screen name="Card" component={VisaCardScreen} />
      <Tab.Screen name="Identity" component={IdentityPanelScreen} />
    </Tab.Navigator>
  );
}

// Auth Guard component
function AuthGuard() {
  const auth = useAuth();

  // Loading state
  if (auth.isLoading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#0A0A0A' }}>
        <Text style={{ fontSize: 64, marginBottom: 16 }}>💳</Text>
        <Text style={{ fontSize: 18, fontWeight: '600', color: '#FFFFFF' }}>Loading...</Text>
      </View>
    );
  }

  // Not authenticated - show onboarding
  if (!auth.isAuthenticated) {
    return <OnboardingFlowScreen />;
  }

  // Authenticated - show main app
  return (
    <CardsProvider>
      <FundingProvider>
        <WalletsProvider>
          <CryptoProvider>
            <NavigationContainer>
              <MainTabs />
            </NavigationContainer>
          </CryptoProvider>
        </WalletsProvider>
      </FundingProvider>
    </CardsProvider>
  );
}

// Main App component
export default function App() {
  return (
    <ConvexProvider client={convex}>
      <SafeAreaProvider>
        <AuthProvider>
          <AuthGuard />
          <StatusBar style="light" />
        </AuthProvider>
      </SafeAreaProvider>
    </ConvexProvider>
  );
}
