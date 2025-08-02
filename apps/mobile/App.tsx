import React, { useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createStackNavigator } from '@react-navigation/stack';
import { View, Text, Platform } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

// Import our screens and providers
import { CardsProvider } from './src/stores/cards';
import CardDashboardScreen from './src/screens/cards/CardDashboardScreen';
import CardCreationScreen from './src/screens/cards/CardCreationScreen';
import CardDetailsScreen from './src/screens/cards/CardDetailsScreen';
import { CardWithDetails } from './src/stores/cards';

// Navigation types
export type RootTabParamList = {
  Dashboard: undefined;
  CreateCard: undefined;
  Settings: undefined;
};

export type CardsStackParamList = {
  CardsDashboard: undefined;
  CardDetails: { card: CardWithDetails };
  CreateCard: undefined;
};

// Create navigators
const Tab = createBottomTabNavigator<RootTabParamList>();
const CardsStack = createStackNavigator<CardsStackParamList>();

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
              props.navigation.navigate('CardDetails', { card: newCard });
            }}
            onCancel={() => props.navigation.goBack()}
          />
        )}
      </CardsStack.Screen>
    </CardsStack.Navigator>
  );

  return <CardsStackScreen />;
}

// Settings placeholder screen
function SettingsScreen() {
  return (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 }}>
      <Text style={{ fontSize: 24, fontWeight: 'bold', marginBottom: 10 }}>Settings</Text>
      <Text style={{ fontSize: 16, textAlign: 'center', color: '#666', lineHeight: 24 }}>
        App settings and preferences will be available here
      </Text>
    </View>
  );
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
            });
          },
        })}
      />
      
      <Tab.Screen
        name="Settings"
        component={SettingsScreen}
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

// Main App component
export default function App() {
  return (
    <SafeAreaProvider>
      <CardsProvider>
        <NavigationContainer>
          <MainTabs />
          <StatusBar style="auto" />
        </NavigationContainer>
      </CardsProvider>
    </SafeAreaProvider>
  );
} 