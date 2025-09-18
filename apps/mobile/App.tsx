import React, { useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createStackNavigator } from '@react-navigation/stack';
import { View, Text, Platform, TouchableOpacity, Alert } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ConnectionProvider, WalletProvider } from '@solana-mobile/wallet-adapter-mobile';

// Import our screens and providers
import { AuthProvider, useAuth, useAuthOperations } from './src/stores/auth';
import { CardsProvider, useCardsState, useCardOperations } from './src/stores/cards';
import { FundingProvider } from './src/stores/funding';
import LoginScreen from './src/screens/auth/LoginScreen';
import CardDashboardScreen from './src/screens/cards/CardDashboardScreen';
import CardCreationScreen from './src/screens/cards/CardCreationScreen';
import CardDetailsScreen from './src/screens/cards/CardDetailsScreen';
import BulkCardDeletionScreen from './src/screens/cards/BulkCardDeletionScreen';
import { CardWithDetails } from './src/stores/cards';
import ConnectWallet from './src/components/ConnectWallet'; // Import the new component

// Funding screens
import FundingScreen from './src/screens/funding/FundingScreen';
import BalanceManagementScreen from './src/screens/funding/BalanceManagementScreen';
import CardAllocationScreen from './src/screens/funding/CardAllocationScreen';
import WalletManagementScreen from './src/screens/funding/WalletManagementScreen';

// Transaction screens
import TransactionHistoryScreen from './src/screens/transactions/TransactionHistoryScreen';

// Security & Privacy screens
import SecurityDashboard from './src/screens/security/SecurityDashboard';
import TransactionIsolationScreen from './src/screens/privacy/TransactionIsolationScreen';

// Navigation types
export type RootTabParamList = {
  Dashboard: undefined;
  CreateCard: undefined;
  Funding: undefined;
  Settings: undefined;
};

export type CardsStackParamList = {
  CardsDashboard: undefined;
  CardDetails: { card: CardWithDetails };
  CreateCard: undefined;
  TransactionHistory: { cardId: string };
  TransactionIsolation: { cardId: string };
};

export type FundingStackParamList = {
  FundingMain: undefined;
  BalanceManagement: undefined;
  CardAllocation: undefined;
  WalletManagement: undefined;
};

export type SettingsStackParamList = {
  SettingsMain: undefined;
  SecurityDashboard: undefined;
  BulkCardDeletion: undefined;
};

// Create navigators
const Tab = createBottomTabNavigator<RootTabParamList>();
const CardsStack = createStackNavigator<CardsStackParamList>();
const FundingStack = createStackNavigator<FundingStackParamList>();
const SettingsStack = createStackNavigator<SettingsStackParamList>();

// Cards Stack Navigator
function CardsStackNavigator() {
  const [selectedCard, setSelectedCard] = useState<CardWithDetails | null>(null);

  const CardsStackScreen = () => (
    <CardsStack.Navigator 
      initialRouteName="CardsDashboard"
      screenOptions={{ headerShown: false }}
    >
      <CardsStack.Screen 
        name="CardsDashboard" 
        options={{ title: 'My Cards' }}
      >
        {(props) => (
          <CardDashboardScreen
            {...props}
            onCardPress={(card) => {
              setSelectedCard(card);
              props.navigation.navigate('CardDetails', { card });
            }}
            onCreateCard={() => props.navigation.navigate('CreateCard')}
          />
        )}
      </CardsStack.Screen>
      
      <CardsStack.Screen 
        name="CardDetails" 
        options={{ title: 'Card Details' }}
      >
        {(props) => (
          <CardDetailsScreen
            card={props.route.params.card}
            onBack={() => props.navigation.goBack()}
            onCardUpdated={(updatedCard) => {
              setSelectedCard(updatedCard);
            }}
            onCardDeleted={() => props.navigation.navigate('CardsDashboard')}
            navigation={props.navigation}
          />
        )}
      </CardsStack.Screen>
      
      <CardsStack.Screen 
        name="CreateCard" 
        options={{ title: 'Create New Card' }}
      >
        {(props) => (
          <CardCreationScreen
            onCardCreated={(newCard) => {
              props.navigation.navigate('CardsDashboard');
            }}
            onCancel={() => {
              if (props.navigation.canGoBack()) {
                props.navigation.goBack();
              } else {
                props.navigation.navigate('CardsDashboard');
              }
            }}
          />
        )}
      </CardsStack.Screen>
      
      <CardsStack.Screen 
        name="TransactionHistory" 
        options={{ title: 'Transaction History' }}
      >
        {(props) => (
          <TransactionHistoryScreen
            cardId={props.route.params.cardId}
            onBack={() => props.navigation.goBack()}
          />
        )}
      </CardsStack.Screen>
      
      <CardsStack.Screen 
        name="TransactionIsolation" 
        options={{ title: 'Privacy Settings' }}
      >
        {(props) => (
          <TransactionIsolationScreen
            cardId={props.route.params.cardId}
            onBack={() => props.navigation.goBack()}
          />
        )}
      </CardsStack.Screen>
    </CardsStack.Navigator>
  );

  return <CardsStackScreen />;
}

// Funding Stack Navigator
function FundingStackNavigator() {
  const FundingStackScreen = () => (
    <FundingStack.Navigator 
      initialRouteName="FundingMain"
      screenOptions={{ headerShown: false }}
    >
      <FundingStack.Screen 
        name="FundingMain" 
        component={FundingScreen}
        options={{ title: 'Funding' }}
      />
      
      <FundingStack.Screen 
        name="BalanceManagement" 
        component={BalanceManagementScreen}
        options={{ title: 'Balance Management' }}
      />
      
      <FundingStack.Screen 
        name="CardAllocation" 
        component={CardAllocationScreen}
        options={{ title: 'Allocate Funds' }}
      />
      
      <FundingStack.Screen 
        name="WalletManagement" 
        component={WalletManagementScreen}
        options={{ title: 'Wallet Management' }}
      />
    </FundingStack.Navigator>
  );

  return <FundingStackScreen />;
}

// Wrapper component for BulkCardDeletionScreen to provide required props
function BulkCardDeletionWrapper({ navigation }: { navigation: any }) {
  const cardsState = useCardsState();
  const cardOperations = useCardOperations();

  const handleBulkDelete = async (cardIds: string[], confirmationPhrase: string, scheduledDeletion?: Date) => {
    try {
      // For demo purposes, simulate individual deletions
      // In production, this would call a dedicated bulk delete API
      for (const cardId of cardIds) {
        await cardOperations.deleteCard(cardId);
      }
    } catch (error) {
      throw new Error('Bulk deletion failed');
    }
  };

  const handleGoBack = () => {
    navigation.goBack();
  };

  return (
    <BulkCardDeletionScreen
      cards={cardsState.cards || []}
      onBulkDelete={handleBulkDelete}
      onGoBack={handleGoBack}
    />
  );
}

// Settings Stack Navigator
function SettingsStackNavigator() {
  const SettingsMainScreen = ({ navigation }: any) => {
    const { logout } = useAuthOperations();
    
    const handleLogout = () => {
      Alert.alert(
        'Logout',
        'Are you sure you want to logout?',
        [
          {
            text: 'Cancel',
            style: 'cancel',
          },
          {
            text: 'Logout',
            onPress: async () => {
              await logout();
            },
            style: 'destructive',
          },
        ],
      );
    };

    return (
      <View style={{ flex: 1, backgroundColor: '#F9FAFB' }}>
        <View style={{ padding: 16 }}>
          <Text style={{ fontSize: 28, fontWeight: '700', color: '#1F2937', marginBottom: 24 }}>Settings</Text>
          
          <ConnectWallet />

          <TouchableOpacity
            style={{
              backgroundColor: 'white',
              padding: 16,
              borderRadius: 12,
              marginBottom: 12,
              flexDirection: 'row',
              justifyContent: 'space-between',
              alignItems: 'center',
              shadowColor: '#000',
              shadowOffset: { width: 0, height: 1 },
              shadowOpacity: 0.05,
              shadowRadius: 4,
              elevation: 2,
              marginTop: 20,
            }}
            onPress={() => navigation.navigate('SecurityDashboard')}
          >
            <View>
              <Text style={{ fontSize: 18, fontWeight: '600', color: '#1F2937' }}>Security Dashboard</Text>
              <Text style={{ fontSize: 14, color: '#6B7280', marginTop: 4 }}>Monitor security alerts and incidents</Text>
            </View>
            <Text style={{ fontSize: 20, color: '#6B7280' }}>→</Text>
          </TouchableOpacity>
          
          <TouchableOpacity
            style={{
              backgroundColor: 'white',
              padding: 16,
              borderRadius: 12,
              marginBottom: 12,
              flexDirection: 'row',
              justifyContent: 'space-between',
              alignItems: 'center',
              shadowColor: '#000',
              shadowOffset: { width: 0, height: 1 },
              shadowOpacity: 0.05,
              shadowRadius: 4,
              elevation: 2,
            }}
            onPress={() => navigation.navigate('BulkCardDeletion')}
          >
            <View>
              <Text style={{ fontSize: 18, fontWeight: '600', color: '#1F2937' }}>Bulk Card Deletion</Text>
              <Text style={{ fontSize: 14, color: '#6B7280', marginTop: 4 }}>Delete multiple cards at once</Text>
            </View>
            <Text style={{ fontSize: 20, color: '#6B7280' }}>→</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={{
              backgroundColor: '#FEE2E2',
              padding: 16,
              borderRadius: 12,
              marginTop: 24,
              flexDirection: 'row',
              justifyContent: 'space-between',
              alignItems: 'center',
              shadowColor: '#000',
              shadowOffset: { width: 0, height: 1 },
              shadowOpacity: 0.05,
              shadowRadius: 4,
              elevation: 2,
            }}
            onPress={handleLogout}
          >
            <View>
              <Text style={{ fontSize: 18, fontWeight: '600', color: '#DC2626' }}>Logout</Text>
              <Text style={{ fontSize: 14, color: '#EF4444', marginTop: 4 }}>Sign out of your account</Text>
            </View>
            <Text style={{ fontSize: 20, color: '#DC2626' }}>→</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  const SettingsStackScreen = () => (
    <SettingsStack.Navigator 
      initialRouteName="SettingsMain"
      screenOptions={{ headerShown: false }}
    >
      <SettingsStack.Screen 
        name="SettingsMain" 
        component={SettingsMainScreen}
        options={{ title: 'Settings' }}
      />
      
      <SettingsStack.Screen 
        name="SecurityDashboard" 
        options={{ title: 'Security Dashboard' }}
      >
        {(props) => (
          <SecurityDashboard cardId="general" />
        )}
      </SettingsStack.Screen>
      
      <SettingsStack.Screen 
        name="BulkCardDeletion" 
        options={{ title: 'Bulk Card Deletion' }}
      >
        {(props) => (
          <BulkCardDeletionWrapper navigation={props.navigation} />
        )}
      </SettingsStack.Screen>
    </SettingsStack.Navigator>
  );

  return <SettingsStackScreen />;
}

// Main tab navigator
function MainTabs() {
  return (
    <Tab.Navigator
      screenOptions={{
        tabBarActiveTintColor: '#3B82F6',
        tabBarInactiveTintColor: '#6B7280',
        tabBarStyle: {
          backgroundColor: 'white',
          borderTopWidth: 1,
          borderTopColor: '#E5E7EB',
          paddingTop: Platform.OS === 'ios' ? 0 : 5,
          paddingBottom: Platform.OS === 'ios' ? 20 : 5,
        },
        headerShown: false,
      }}
    >
      <Tab.Screen
        name="Dashboard"
        component={CardsStackNavigator}
        options={{
          title: 'Cards',
          tabBarIcon: ({ color, size }) => (
            <Text style={{ fontSize: size * 0.8, color }}>💳</Text>
          ),
        }}
      />
      
      <Tab.Screen
        name="CreateCard"
        component={CardCreationScreen}
        options={{
          title: 'Create',
          tabBarIcon: ({ color, size }) => (
            <Text style={{ fontSize: size * 0.8, color }}>➕</Text>
          ),
        }}
        listeners={({ navigation }) => ({
          tabPress: (e) => {
            // Prevent default action
            e.preventDefault();
            // Navigate to create card in the Cards stack
            navigation.navigate('Dashboard', {
              screen: 'CreateCard',
            } as any);
          },
        })}
      />
      
      <Tab.Screen
        name="Funding"
        component={FundingStackNavigator}
        options={{
          title: 'Funding',
          tabBarIcon: ({ color, size }) => (
            <Text style={{ fontSize: size * 0.8, color }}>💰</Text>
          ),
        }}
      />
      
      <Tab.Screen
        name="Settings"
        component={SettingsStackNavigator}
        options={{
          title: 'Settings',
          tabBarIcon: ({ color, size }) => (
            <Text style={{ fontSize: size * 0.8, color }}>⚙️</Text>
          ),
        }}
      />
    </Tab.Navigator>
  );
}

// Auth Guard component
function AuthGuard() {
  const auth = useAuth();

  if (auth.isLoading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#F9FAFB' }}>
        <Text style={{ fontSize: 64, marginBottom: 16 }}>💳</Text>
        <Text style={{ fontSize: 18, fontWeight: '600', color: '#1F2937' }}>Loading...</Text>
      </View>
    );
  }

  if (!auth.isAuthenticated) {
    return <LoginScreen />;
  }

  return (
    <CardsProvider>
      <FundingProvider>
        <NavigationContainer>
          <MainTabs />
        </NavigationContainer>
      </FundingProvider>
    </CardsProvider>
  );
}

// Main App component
export default function App() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <ConnectionProvider endpoint="https://api.mainnet-beta.solana.com">
          <WalletProvider>
            <AuthGuard />
          </WalletProvider>
        </ConnectionProvider>
        <StatusBar style="auto" />
      </AuthProvider>
    </SafeAreaProvider>
  );
} 