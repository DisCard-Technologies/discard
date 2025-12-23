import React from 'react';
import { StatusBar } from 'expo-status-bar';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { View, Text } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ConvexProvider, ConvexReactClient } from 'convex/react';
import { Ionicons } from '@expo/vector-icons';
// Import NativeWind CSS
import './global.css';

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
import TransferScreen from './src/screens/transfer/TransferScreen';
import VisaCardScreen from './src/screens/cards/VisaCardScreen';
import IdentityPanelScreen from './src/screens/identity/IdentityPanelScreen';

// Navigation types
export type RootTabParamList = {
  Home: undefined;
  Holdings: undefined;
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
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: '#10B981',
        tabBarInactiveTintColor: '#6B7280',
        tabBarShowLabel: true,
        tabBarLabelStyle: {
          fontSize: 10,
          fontWeight: '500',
          marginTop: 2,
        },
        tabBarStyle: {
          backgroundColor: '#0A0F14',
          borderTopWidth: 1,
          borderTopColor: 'rgba(42, 53, 68, 0.5)',
          paddingTop: 8,
          paddingBottom: 8,
          height: 60,
          elevation: 0,
          shadowOpacity: 0,
        },
      }}
    >
      <Tab.Screen
        name="Home"
        component={AmbientHomeScreen}
        options={{
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? "home" : "home-outline"} size={22} color={color} />
          ),
        }}
      />
      
      <Tab.Screen
        name="Holdings"
        component={HoldingsScreen}
        options={{
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? "layers" : "layers-outline"} size={22} color={color} />
          ),
        }}
      />
      
      <Tab.Screen
        name="Transfer"
        component={TransferScreen}
        options={{
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name="swap-horizontal-outline" size={22} color={color} />
          ),
        }}
      />
      
      <Tab.Screen
        name="Card"
        component={VisaCardScreen}
        options={{
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? "card" : "card-outline"} size={22} color={color} />
          ),
        }}
      />
      
      <Tab.Screen
        name="Identity"
        component={IdentityPanelScreen}
        options={{
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? "finger-print" : "finger-print-outline"} size={22} color={color} />
          ),
        }}
      />
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
