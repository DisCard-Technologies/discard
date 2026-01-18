import { StyleSheet, View, Pressable, ScrollView, Alert, Linking, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import Constants from 'expo-constants';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useThemeColor } from '@/hooks/use-theme-color';
import { useColorScheme } from '@/hooks/use-color-scheme';

// Version info from app.json/expo config
const APP_VERSION = Constants.expoConfig?.version || '1.0.0';
const BUILD_NUMBER = (Constants.expoConfig?.ios?.buildNumber || Constants.expoConfig?.android?.versionCode || '1').toString();

type IoniconsName = React.ComponentProps<typeof Ionicons>['name'];

interface MenuItem {
  id: string;
  icon: IoniconsName;
  label: string;
  description?: string;
  route?: string;
  onPress?: () => void;
  disabled?: boolean;
}

// Menu item handlers
const openDeviceSecuritySettings = () => {
  if (Platform.OS === 'ios') {
    Linking.openURL('App-Prefs:');
  } else {
    Linking.openSettings();
  }
};

const showSupportOptions = () => {
  Alert.alert(
    'Contact Support',
    'How would you like to get help?',
    [
      {
        text: 'Email Support',
        onPress: () => Linking.openURL('mailto:support@discard.tech?subject=DisCard%20Support%20Request'),
      },
      {
        text: 'Visit FAQ',
        onPress: () => Linking.openURL('https://discard.tech/faq'),
      },
      { text: 'Cancel', style: 'cancel' },
    ]
  );
};

const showAboutInfo = () => {
  Alert.alert(
    'About DisCard',
    `Version ${APP_VERSION} (${BUILD_NUMBER})\n\nPrivacy-first payments for the Solana ecosystem.\n\n© 2025 DisCard Technologies`,
    [
      {
        text: 'Terms of Service',
        onPress: () => Linking.openURL('https://discard.tech/terms'),
      },
      {
        text: 'Privacy Policy',
        onPress: () => Linking.openURL('https://discard.tech/privacy'),
      },
      { text: 'OK', style: 'cancel' },
    ]
  );
};

const showNotificationSettings = () => {
  Alert.alert(
    'Notifications',
    'Manage your notification preferences',
    [
      {
        text: 'Open Device Settings',
        onPress: () => {
          if (Platform.OS === 'ios') {
            Linking.openURL('app-settings:');
          } else {
            Linking.openSettings();
          }
        },
      },
      { text: 'Cancel', style: 'cancel' },
    ]
  );
};

const menuItems: MenuItem[] = [
  { id: 'settings', icon: 'settings-outline', label: 'Settings', description: 'App preferences', route: '/settings' },
  { id: 'history', icon: 'time-outline', label: 'History', description: 'Transaction history', route: '/history' },
  { id: 'identity', icon: 'person-outline', label: 'Identity', description: 'KYC & verification', route: '/identity' },
  { id: 'cards', icon: 'card-outline', label: 'Cards', description: 'Manage cards', route: '/card' },
  { id: 'security', icon: 'shield-outline', label: 'Security', description: 'Device security', onPress: openDeviceSecuritySettings },
  { id: 'notifications', icon: 'notifications-outline', label: 'Notifications', description: 'Alert preferences', onPress: showNotificationSettings },
  { id: 'support', icon: 'help-circle-outline', label: 'Support', description: 'Get help', onPress: showSupportOptions },
  { id: 'about', icon: 'information-circle-outline', label: 'About', description: `v${APP_VERSION}`, onPress: showAboutInfo },
];

export default function MenuScreen() {
  const insets = useSafeAreaInsets();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  const primaryColor = useThemeColor({}, 'tint');
  const mutedColor = useThemeColor({ light: '#687076', dark: '#9BA1A6' }, 'icon');
  const cardBg = useThemeColor({ light: '#f4f4f5', dark: '#1c1c1e' }, 'background');
  const borderColor = useThemeColor({ light: 'rgba(0,0,0,0.08)', dark: 'rgba(255,255,255,0.1)' }, 'background');

  const handleMenuItemPress = (item: MenuItem) => {
    if (item.disabled) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      console.log('[Menu] Coming soon:', item.label);
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (item.onPress) {
      item.onPress();
    } else if (item.route) {
      router.push(item.route as any);
    }
  };

  return (
    <ThemedView style={styles.container}>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <View style={{ height: insets.top }} />

      {/* Header */}
      <View style={styles.header}>
        <ThemedText style={styles.headerTitle}>Menu</ThemedText>
      </View>

      {/* Menu Grid */}
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 100 }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.grid}>
          {menuItems.map((item) => (
            <Pressable
              key={item.id}
              onPress={() => handleMenuItemPress(item)}
              style={({ pressed }) => [
                styles.menuItem,
                { backgroundColor: cardBg, borderColor },
                pressed && !item.disabled && styles.menuItemPressed,
                item.disabled && styles.menuItemDisabled,
              ]}
            >
              <View style={[
                styles.iconContainer,
                { backgroundColor: `${primaryColor}15` },
                item.disabled && { opacity: 0.5 }
              ]}>
                <Ionicons name={item.icon} size={24} color={item.disabled ? mutedColor : primaryColor} />
              </View>
              <ThemedText style={[styles.menuLabel, item.disabled && { opacity: 0.5 }]}>
                {item.label}
              </ThemedText>
              {item.description && (
                <ThemedText style={[styles.menuDescription, { color: mutedColor }]}>
                  {item.description}
                </ThemedText>
              )}
            </Pressable>
          ))}
        </View>

        {/* App Version */}
        <View style={styles.versionContainer}>
          <ThemedText style={[styles.versionText, { color: mutedColor }]}>
            DisCard v{APP_VERSION} ({BUILD_NUMBER})
          </ThemedText>
        </View>
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    paddingHorizontal: 16,
    paddingVertical: 16,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: '700',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  menuItem: {
    width: '47%',
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: 'center',
    gap: 8,
  },
  menuItemPressed: {
    opacity: 0.7,
    transform: [{ scale: 0.98 }],
  },
  menuItemDisabled: {
    opacity: 0.6,
  },
  iconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  menuLabel: {
    fontSize: 15,
    fontWeight: '600',
    textAlign: 'center',
  },
  menuDescription: {
    fontSize: 12,
    textAlign: 'center',
  },
  versionContainer: {
    alignItems: 'center',
    marginTop: 32,
  },
  versionText: {
    fontSize: 12,
  },
});
