import { useState } from 'react';
import { StyleSheet, View, Pressable, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useThemeColor } from '@/hooks/use-theme-color';

interface PaymentMethod {
  id: string;
  type: 'card' | 'bank' | 'apple';
  label: string;
  detail: string;
  icon: keyof typeof Ionicons.glyphMap;
  isDefault?: boolean;
}

const initialPaymentMethods: PaymentMethod[] = [
  { id: '1', type: 'card', label: 'Visa •••• 4829', detail: 'Expires 08/27', icon: 'card', isDefault: true },
  { id: '2', type: 'bank', label: 'Chase Checking', detail: '•••• 7291', icon: 'business' },
  { id: '3', type: 'apple', label: 'Apple Pay', detail: 'Connected', icon: 'logo-apple' },
];

const settingsSections = [
  {
    title: 'Account',
    items: [
      { icon: 'wallet' as const, label: 'Connected Wallets', value: '3 wallets' },
      { icon: 'card' as const, label: 'Visa Card Settings', value: '' },
      { icon: 'phone-portrait' as const, label: 'Linked Devices', value: '2 devices' },
    ],
  },
  {
    title: 'Preferences',
    items: [
      { icon: 'notifications' as const, label: 'Notifications', value: 'On' },
      { icon: 'globe' as const, label: 'Currency', value: 'USD' },
      { icon: 'moon' as const, label: 'Appearance', value: 'Dark' },
      { icon: 'flash' as const, label: 'Ambient Finance', value: 'Enabled' },
    ],
  },
  {
    title: 'Security',
    items: [{ icon: 'shield-checkmark' as const, label: 'Security Settings', value: '' }],
  },
  {
    title: 'Support',
    items: [
      { icon: 'help-circle' as const, label: 'Help Center', value: '' },
      { icon: 'document-text' as const, label: 'Terms & Privacy', value: '' },
    ],
  },
];

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const [showPaymentMethods, setShowPaymentMethods] = useState(false);
  const [paymentMethods, setPaymentMethods] = useState(initialPaymentMethods);

  const primaryColor = useThemeColor({}, 'tint');
  const mutedColor = useThemeColor({ light: '#687076', dark: '#9BA1A6' }, 'icon');
  const cardBg = useThemeColor({ light: 'rgba(0,0,0,0.03)', dark: 'rgba(255,255,255,0.06)' }, 'background');
  const borderColor = useThemeColor({ light: 'rgba(0,0,0,0.06)', dark: 'rgba(255,255,255,0.08)' }, 'background');
  const dangerColor = '#ef4444';

  const setDefaultMethod = (id: string) => {
    setPaymentMethods((methods) => methods.map((m) => ({ ...m, isDefault: m.id === id })));
  };

  const removeMethod = (id: string) => {
    setPaymentMethods((methods) => methods.filter((m) => m.id !== id));
  };

  const handleBack = () => {
    if (showPaymentMethods) {
      setShowPaymentMethods(false);
    } else if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/');
    }
  };

  // Payment Methods Sub-screen
  if (showPaymentMethods) {
    return (
      <ThemedView style={styles.container}>
        <View style={{ height: insets.top }} />

        {/* Header */}
        <View style={styles.header}>
          <Pressable
            onPress={handleBack}
            style={({ pressed }) => [styles.backButton, pressed && styles.pressed]}
          >
            <Ionicons name="chevron-back" size={24} color={mutedColor} />
          </Pressable>
          <ThemedText style={styles.headerTitle}>Payment Methods</ThemedText>
          <View style={styles.headerSpacer} />
        </View>

        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}
          showsVerticalScrollIndicator={false}
        >
          <ThemedText style={[styles.description, { color: mutedColor }]}>
            Manage your cards and bank accounts for buying and selling crypto.
          </ThemedText>

          {/* Payment Methods List */}
          <View style={styles.methodsList}>
            {paymentMethods.map((method) => (
              <ThemedView
                key={method.id}
                style={[styles.methodItem, { backgroundColor: cardBg, borderColor }]}
                lightColor="rgba(0,0,0,0.03)"
                darkColor="rgba(255,255,255,0.06)"
              >
                <View style={[styles.methodIcon, { backgroundColor: `${primaryColor}10` }]}>
                  <Ionicons name={method.icon} size={20} color={primaryColor} />
                </View>
                <View style={styles.methodInfo}>
                  <View style={styles.methodLabelRow}>
                    <ThemedText style={styles.methodLabel}>{method.label}</ThemedText>
                    {method.isDefault && (
                      <View style={[styles.defaultBadge, { backgroundColor: `${primaryColor}20` }]}>
                        <ThemedText style={[styles.defaultBadgeText, { color: primaryColor }]}>
                          Default
                        </ThemedText>
                      </View>
                    )}
                  </View>
                  <ThemedText style={[styles.methodDetail, { color: mutedColor }]}>
                    {method.detail}
                  </ThemedText>
                </View>
                <View style={styles.methodActions}>
                  {!method.isDefault && (
                    <Pressable
                      onPress={() => setDefaultMethod(method.id)}
                      style={({ pressed }) => [
                        styles.actionButton,
                        { backgroundColor: cardBg },
                        pressed && styles.pressed,
                      ]}
                    >
                      <Ionicons name="checkmark" size={16} color={mutedColor} />
                    </Pressable>
                  )}
                  <Pressable
                    onPress={() => removeMethod(method.id)}
                    style={({ pressed }) => [
                      styles.actionButton,
                      { backgroundColor: `${dangerColor}15` },
                      pressed && styles.pressed,
                    ]}
                  >
                    <Ionicons name="trash-outline" size={16} color={dangerColor} />
                  </Pressable>
                </View>
              </ThemedView>
            ))}
          </View>

          {/* Add New Method */}
          <Pressable
            style={({ pressed }) => [
              styles.addMethodButton,
              { borderColor: borderColor },
              pressed && styles.pressed,
            ]}
          >
            <View style={[styles.methodIcon, { backgroundColor: `${primaryColor}10` }]}>
              <Ionicons name="add" size={20} color={primaryColor} />
            </View>
            <View style={styles.addMethodText}>
              <ThemedText style={styles.addMethodLabel}>Add Payment Method</ThemedText>
              <ThemedText style={[styles.addMethodHint, { color: mutedColor }]}>
                Card, bank account, or Apple Pay
              </ThemedText>
            </View>
          </Pressable>

          {/* Info Card */}
          <ThemedView
            style={[styles.infoCard, { backgroundColor: `${primaryColor}08`, borderColor: `${primaryColor}15` }]}
            lightColor={`${primaryColor}08`}
            darkColor={`${primaryColor}08`}
          >
            <ThemedText style={[styles.infoText, { color: mutedColor }]}>
              <ThemedText style={[styles.infoHighlight, { color: primaryColor }]}>Secure & Private: </ThemedText>
              Your payment details are encrypted and processed by our partners Moonpay and Stripe. We never store your full card numbers.
            </ThemedText>
          </ThemedView>
        </ScrollView>
      </ThemedView>
    );
  }

  // Main Settings Screen
  return (
    <ThemedView style={styles.container}>
      <View style={{ height: insets.top }} />

      {/* Header */}
      <View style={styles.header}>
        <Pressable
          onPress={handleBack}
          style={({ pressed }) => [styles.backButton, pressed && styles.pressed]}
        >
          <Ionicons name="chevron-back" size={24} color={mutedColor} />
        </Pressable>
        <ThemedText style={styles.headerTitle}>Settings</ThemedText>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[styles.settingsContent, { paddingBottom: insets.bottom + 24 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Payment Methods Section */}
        <View style={styles.section}>
          <ThemedText style={[styles.sectionTitle, { color: mutedColor }]}>
            PAYMENT METHODS
          </ThemedText>
          <ThemedView
            style={[styles.settingsCard, { backgroundColor: cardBg, borderColor }]}
            lightColor="rgba(0,0,0,0.03)"
            darkColor="rgba(255,255,255,0.06)"
          >
            <Pressable
              onPress={() => setShowPaymentMethods(true)}
              style={({ pressed }) => [styles.settingsItem, pressed && styles.itemPressed]}
            >
              <View style={[styles.itemIcon, { backgroundColor: `${primaryColor}10` }]}>
                <Ionicons name="card" size={16} color={primaryColor} />
              </View>
              <ThemedText style={styles.itemLabel}>Cards & Bank Accounts</ThemedText>
              <ThemedText style={[styles.itemValue, { color: mutedColor }]}>
                {paymentMethods.length} saved
              </ThemedText>
              <Ionicons name="chevron-forward" size={16} color={mutedColor} />
            </Pressable>
          </ThemedView>
        </View>

        {/* Other Settings Sections */}
        {settingsSections.map((section) => (
          <View key={section.title} style={styles.section}>
            <ThemedText style={[styles.sectionTitle, { color: mutedColor }]}>
              {section.title.toUpperCase()}
            </ThemedText>
            <ThemedView
              style={[styles.settingsCard, { backgroundColor: cardBg, borderColor }]}
              lightColor="rgba(0,0,0,0.03)"
              darkColor="rgba(255,255,255,0.06)"
            >
              {section.items.map((item, idx) => (
                <Pressable
                  key={item.label}
                  style={({ pressed }) => [
                    styles.settingsItem,
                    idx !== section.items.length - 1 && [styles.itemBorder, { borderBottomColor: borderColor }],
                    pressed && styles.itemPressed,
                  ]}
                >
                  <View style={[styles.itemIcon, { backgroundColor: `${primaryColor}10` }]}>
                    <Ionicons name={item.icon} size={16} color={primaryColor} />
                  </View>
                  <ThemedText style={styles.itemLabel}>{item.label}</ThemedText>
                  {item.value ? (
                    <ThemedText style={[styles.itemValue, { color: mutedColor }]}>{item.value}</ThemedText>
                  ) : null}
                  <Ionicons name="chevron-forward" size={16} color={mutedColor} />
                </Pressable>
              ))}
            </ThemedView>
          </View>
        ))}

        {/* Logout Button */}
        <View style={styles.section}>
          <Pressable
            style={({ pressed }) => [
              styles.logoutButton,
              { backgroundColor: `${dangerColor}10`, borderColor: `${dangerColor}20` },
              pressed && styles.pressed,
            ]}
          >
            <Ionicons name="log-out-outline" size={18} color={dangerColor} />
            <ThemedText style={[styles.logoutText, { color: dangerColor }]}>Sign Out</ThemedText>
          </Pressable>
        </View>

        {/* Version */}
        <ThemedText style={[styles.versionText, { color: mutedColor }]}>NEXUS v2035.1.0</ThemedText>
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(128,128,128,0.1)',
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '600',
  },
  headerSpacer: {
    width: 40,
  },
  scrollView: {
    flex: 1,
  },
  content: {
    paddingHorizontal: 16,
    paddingTop: 16,
    gap: 16,
  },
  settingsContent: {
    paddingTop: 8,
  },
  description: {
    fontSize: 14,
    lineHeight: 20,
  },
  methodsList: {
    gap: 12,
  },
  methodItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    gap: 12,
  },
  methodIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  methodInfo: {
    flex: 1,
  },
  methodLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  methodLabel: {
    fontSize: 14,
    fontWeight: '500',
  },
  defaultBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  defaultBadgeText: {
    fontSize: 9,
    fontWeight: '600',
  },
  methodDetail: {
    fontSize: 12,
    marginTop: 2,
  },
  methodActions: {
    flexDirection: 'row',
    gap: 8,
  },
  actionButton: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addMethodButton: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 16,
    borderWidth: 2,
    borderStyle: 'dashed',
    gap: 12,
  },
  addMethodText: {
    flex: 1,
  },
  addMethodLabel: {
    fontSize: 14,
    fontWeight: '500',
  },
  addMethodHint: {
    fontSize: 12,
    marginTop: 2,
  },
  infoCard: {
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
  },
  infoText: {
    fontSize: 12,
    lineHeight: 18,
  },
  infoHighlight: {
    fontWeight: '500',
  },
  section: {
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  sectionTitle: {
    fontSize: 10,
    letterSpacing: 2,
    fontWeight: '600',
    marginBottom: 8,
  },
  settingsCard: {
    borderRadius: 16,
    borderWidth: 1,
    overflow: 'hidden',
  },
  settingsItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 12,
  },
  itemBorder: {
    borderBottomWidth: 1,
  },
  itemPressed: {
    opacity: 0.7,
  },
  itemIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  itemLabel: {
    flex: 1,
    fontSize: 14,
    fontWeight: '500',
  },
  itemValue: {
    fontSize: 14,
  },
  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 16,
    borderWidth: 1,
  },
  logoutText: {
    fontSize: 14,
    fontWeight: '600',
  },
  versionText: {
    textAlign: 'center',
    fontSize: 12,
    paddingVertical: 16,
  },
  pressed: {
    opacity: 0.7,
    transform: [{ scale: 0.98 }],
  },
});

