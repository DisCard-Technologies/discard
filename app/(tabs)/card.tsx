import { useState, useMemo } from 'react';
import { StyleSheet, View, Pressable, ScrollView, Keyboard, Alert } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Clipboard from 'expo-clipboard';
import { KeyboardStickyView } from 'react-native-keyboard-controller';
import Animated, { useSharedValue, useAnimatedStyle, withTiming } from 'react-native-reanimated';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { CommandBar } from '@/components/command-bar';
import { useThemeColor } from '@/hooks/use-theme-color';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useAuth } from '@/stores/authConvex';
import { useCards, useCardOperations } from '@/stores/cardsConvex';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

const transactions = [
  { merchant: "Apple Store", amount: "-$1,299.00", date: "Today", category: "Shopping" },
  { merchant: "Auto-Rebalance", amount: "+$200.00", date: "Today", category: "AI", isAmbient: true },
  { merchant: "Whole Foods", amount: "-$127.84", date: "Today", category: "Groceries" },
  { merchant: "Uber", amount: "-$24.50", date: "Yesterday", category: "Transport" },
];

export default function CardScreen() {
  const insets = useSafeAreaInsets();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  const primaryColor = useThemeColor({}, 'tint');
  const mutedColor = useThemeColor({ light: '#687076', dark: '#9BA1A6' }, 'icon');
  const textColor = useThemeColor({}, 'text');

  // Real data from stores
  const { user } = useAuth();
  const { state: cardsState } = useCards();
  const { freezeCard, unfreezeCard } = useCardOperations();

  const activeCard = useMemo(() => {
    return cardsState?.selectedCard || cardsState?.cards?.[0] || null;
  }, [cardsState]);

  const [showDetails, setShowDetails] = useState(false);
  const [copied, setCopied] = useState(false);
  const [loadingSecrets, setLoadingSecrets] = useState(false);
  const [cardSecrets, setCardSecrets] = useState<{
    pan: string;
    cvv: string;
    expirationMonth: number;
    expirationYear: number;
  } | null>(null);

  // Get card operations including getCardSecrets
  const { getCardSecrets } = useCardOperations();

  // Use real frozen state from card
  const cardFrozen = activeCard?.status === 'frozen';

  // Format card number with spaces
  const formatCardNumber = (pan: string) => {
    return pan.replace(/(.{4})/g, '$1 ').trim();
  };

  // Display card number based on showDetails state and available data
  const displayCardNumber = useMemo(() => {
    if (!showDetails) {
      return "•••• •••• •••• ••••";
    }
    if (cardSecrets?.pan) {
      return formatCardNumber(cardSecrets.pan);
    }
    if (activeCard?.last4 && activeCard.last4 !== "0000") {
      return `•••• •••• •••• ${activeCard.last4}`;
    }
    return "•••• •••• •••• ••••";
  }, [showDetails, cardSecrets, activeCard]);

  const cardBalance = activeCard?.currentBalance ? (activeCard.currentBalance / 100) : 0;

  // Handle showing/hiding card details
  const toggleDetails = async () => {
    if (!showDetails && activeCard && !cardSecrets) {
      // Fetch secrets when showing details
      setLoadingSecrets(true);
      try {
        const secrets = await getCardSecrets(activeCard._id);
        if (secrets) {
          setCardSecrets(secrets);
        }
      } catch (error) {
        console.error('Failed to get card secrets:', error);
        Alert.alert('Error', 'Failed to load card details');
      } finally {
        setLoadingSecrets(false);
      }
    }
    setShowDetails(!showDetails);
  };

  // Command bar state
  const backdropOpacity = useSharedValue(0);

  const handleCommandBarFocusChange = (focused: boolean) => {
    backdropOpacity.value = withTiming(focused ? 1 : 0, { duration: 200 });
  };

  const handleBackdropPress = () => {
    Keyboard.dismiss();
    backdropOpacity.value = withTiming(0, { duration: 200 });
  };

  const backdropAnimatedStyle = useAnimatedStyle(() => ({
    opacity: backdropOpacity.value,
    pointerEvents: backdropOpacity.value > 0 ? 'auto' : 'none',
  }));

  const handleSendMessage = (message: string) => {
    Alert.alert('Command', `You said: "${message}"`);
  };

  const handleCamera = () => {
    Alert.alert('Camera', 'Camera/scan coming soon');
  };

  const handleMic = () => {
    // Voice input feedback handled by CommandBar
  };

  const copyCardNumber = async () => {
    if (cardSecrets?.pan) {
      await Clipboard.setStringAsync(cardSecrets.pan);
    } else if (activeCard?.last4) {
      await Clipboard.setStringAsync(`**** **** **** ${activeCard.last4}`);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <ThemedView style={styles.container}>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <View style={{ height: insets.top }} />
      
      <ScrollView 
        style={styles.scrollView} 
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Visa Card */}
        <View style={[styles.cardContainer, cardFrozen && styles.cardFrozen]}>
          <LinearGradient
            colors={isDark 
              ? ['#27272a', '#1c1c1e', '#18181b'] 
              : ['#e4e4e7', '#d4d4d8', '#a1a1aa']
            }
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.cardGradient}
          >
            {/* Glow effect */}
            <View style={[styles.cardGlow, { backgroundColor: `${primaryColor}20` }]} />
            
            {/* Card Header */}
            <View style={styles.cardHeader}>
              <View style={styles.cardBrand}>
                <View style={[styles.brandCircle, { backgroundColor: `${primaryColor}30` }]}>
                  <ThemedText style={[styles.brandLetter, { color: primaryColor }]}>N</ThemedText>
                </View>
                <ThemedText style={styles.brandName}>NEXUS</ThemedText>
              </View>
              {cardFrozen && (
                <View style={styles.frozenBadge}>
                  <Ionicons name="snow" size={14} color="#a855f7" />
                  <ThemedText style={styles.frozenText}>Frozen</ThemedText>
                </View>
              )}
            </View>

            {/* Card Number */}
            <View style={styles.cardBody}>
              <View style={styles.cardNumberRow}>
                <ThemedText style={styles.cardNumber}>
                  {loadingSecrets ? "Loading..." : displayCardNumber}
                </ThemedText>
                <Pressable
                  onPress={toggleDetails}
                  style={styles.eyeButton}
                  disabled={loadingSecrets}
                >
                  <Ionicons
                    name={loadingSecrets ? "hourglass-outline" : (showDetails ? "eye-off" : "eye")}
                    size={18}
                    color={mutedColor}
                  />
                </Pressable>
              </View>
              {showDetails && cardSecrets && (
                <View style={styles.cardDetailsRow}>
                  <View>
                    <ThemedText style={[styles.cardLabel, { color: mutedColor }]}>CVV</ThemedText>
                    <ThemedText style={styles.cardDetailValue}>{cardSecrets.cvv}</ThemedText>
                  </View>
                  <View>
                    <ThemedText style={[styles.cardLabel, { color: mutedColor }]}>EXPIRES</ThemedText>
                    <ThemedText style={styles.cardDetailValue}>
                      {String(cardSecrets.expirationMonth).padStart(2, '0')}/{String(cardSecrets.expirationYear).slice(-2)}
                    </ThemedText>
                  </View>
                </View>
              )}
            </View>

            {/* Card Footer */}
            <View style={styles.cardFooter}>
              <View>
                <ThemedText style={[styles.cardLabel, { color: mutedColor }]}>Cardholder</ThemedText>
                <ThemedText style={styles.cardHolder}>{(user?.displayName || 'CARDHOLDER').toUpperCase()}</ThemedText>
              </View>
              <ThemedText style={[styles.visaLogo, { color: isDark ? 'rgba(255,255,255,0.8)' : 'rgba(0,0,0,0.6)' }]}>VISA</ThemedText>
            </View>
          </LinearGradient>
        </View>

        {/* Auto-Rebalance Panel */}
        <ThemedView 
          style={[styles.rebalanceCard, { borderColor: `${primaryColor}30` }]} 
          lightColor="#f4f4f5" 
          darkColor="#1c1c1e"
        >
          <View style={styles.rebalanceHeader}>
            <Ionicons name="flash" size={14} color={primaryColor} />
            <ThemedText style={[styles.rebalanceLabel, { color: primaryColor }]}>
              Auto-Rebalance Active
            </ThemedText>
          </View>
          <View style={styles.rebalanceContent}>
            <View>
              <ThemedText style={[styles.balanceLabel, { color: mutedColor }]}>Target Balance</ThemedText>
              <ThemedText style={styles.balanceValue}>$200.00</ThemedText>
            </View>
            <View style={styles.balanceRight}>
              <ThemedText style={[styles.balanceLabel, { color: mutedColor }]}>Current</ThemedText>
              <ThemedText style={[styles.balanceValue, { color: primaryColor }]}>${cardBalance.toFixed(2)}</ThemedText>
            </View>
          </View>
          <ThemedText style={[styles.rebalanceHint, { color: mutedColor }]}>
            {'"Keep my card balance at $200" — AI auto-rebalances from your portfolio'}
          </ThemedText>
        </ThemedView>

        {/* Card Controls */}
        <View style={styles.controlsRow}>
          <Pressable 
            onPress={copyCardNumber}
            style={({ pressed }) => [
              styles.controlButton,
              { backgroundColor: isDark ? '#27272a' : '#f4f4f5' },
              pressed && styles.controlButtonPressed
            ]}
          >
            <Ionicons 
              name={copied ? "checkmark" : "copy-outline"} 
              size={18} 
              color={copied ? primaryColor : textColor} 
            />
            <ThemedText style={styles.controlText}>
              {copied ? "Copied" : "Copy"}
            </ThemedText>
          </Pressable>

          <Pressable
            onPress={async () => {
              if (activeCard) {
                try {
                  if (cardFrozen) {
                    await unfreezeCard(activeCard._id);
                  } else {
                    await freezeCard(activeCard._id);
                  }
                } catch (error) {
                  Alert.alert('Error', 'Failed to update card status');
                }
              }
            }}
            style={({ pressed }) => [
              styles.controlButton,
              cardFrozen
                ? { backgroundColor: 'rgba(168, 85, 247, 0.2)', borderWidth: 1, borderColor: '#a855f7' }
                : { backgroundColor: isDark ? '#27272a' : '#f4f4f5' },
              pressed && styles.controlButtonPressed
            ]}
          >
            <Ionicons name="snow" size={18} color={cardFrozen ? '#a855f7' : textColor} />
            <ThemedText style={styles.controlText}>
              {cardFrozen ? "Unfreeze" : "Freeze"}
            </ThemedText>
          </Pressable>

          <Pressable 
            style={({ pressed }) => [
              styles.controlButton,
              { backgroundColor: isDark ? '#27272a' : '#f4f4f5' },
              pressed && styles.controlButtonPressed
            ]}
          >
            <Ionicons name="settings-outline" size={18} color={textColor} />
            <ThemedText style={styles.controlText}>Limits</ThemedText>
          </Pressable>
        </View>

        {/* Transactions */}
        <View style={styles.transactionsSection}>
          <ThemedText style={[styles.sectionTitle, { color: mutedColor }]}>RECENT</ThemedText>
          <View style={styles.transactionsList}>
            {transactions.map((tx, i) => (
              <ThemedView
                key={i}
                style={[
                  styles.transactionCard,
                  tx.isAmbient && { borderColor: `${primaryColor}30`, borderWidth: 1 }
                ]}
                lightColor="#f4f4f5"
                darkColor="#1c1c1e"
              >
                <View style={styles.transactionLeft}>
                  {tx.isAmbient && (
                    <Ionicons name="flash" size={16} color={primaryColor} />
                  )}
                  <View>
                    <ThemedText style={styles.merchantName}>{tx.merchant}</ThemedText>
                    <ThemedText style={[styles.transactionDate, { color: mutedColor }]}>{tx.date}</ThemedText>
                  </View>
                </View>
                <ThemedText 
                  style={[
                    styles.transactionAmount,
                    tx.amount.startsWith("+") && { color: primaryColor }
                  ]}
                >
                  {tx.amount}
                </ThemedText>
              </ThemedView>
            ))}
          </View>
        </View>
      </ScrollView>

      {/* Backdrop Overlay */}
      <AnimatedPressable
        style={[styles.backdrop, backdropAnimatedStyle]}
        onPress={handleBackdropPress}
      />

      {/* Command Bar - Sticky above keyboard */}
      <KeyboardStickyView offset={{ closed: 0, opened: insets.bottom }} style={styles.stickyCommandBar}>
        <CommandBar
          onSend={handleSendMessage}
          onCamera={handleCamera}
          onMic={handleMic}
          onFocusChange={handleCommandBarFocusChange}
        />
        {/* Safe area for bottom (home indicator) */}
        <View style={{ height: insets.bottom }} />
      </KeyboardStickyView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 24,
    paddingBottom: 100,
    gap: 24,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    zIndex: 10,
  },
  stickyCommandBar: {
    zIndex: 20,
  },
  // Card styles
  cardContainer: {
    height: 208,
    borderRadius: 24,
    overflow: 'hidden',
  },
  cardFrozen: {
    opacity: 0.6,
  },
  cardGradient: {
    flex: 1,
    padding: 24,
    justifyContent: 'space-between',
  },
  cardGlow: {
    position: 'absolute',
    top: -100,
    right: -50,
    width: 256,
    height: 256,
    borderRadius: 128,
    opacity: 0.3,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  cardBrand: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  brandCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  brandLetter: {
    fontSize: 14,
    fontWeight: '700',
  },
  brandName: {
    fontSize: 14,
    fontWeight: '600',
    letterSpacing: 2,
  },
  frozenBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  frozenText: {
    fontSize: 12,
    color: '#a855f7',
  },
  cardBody: {
    marginTop: 8,
  },
  cardNumberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  cardNumber: {
    fontSize: 20,
    letterSpacing: 4,
    fontFamily: 'monospace',
  },
  eyeButton: {
    padding: 4,
  },
  cardDetailsRow: {
    flexDirection: 'row',
    gap: 24,
    marginTop: 12,
  },
  cardDetailValue: {
    fontSize: 14,
    fontWeight: '500',
    letterSpacing: 1,
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
  },
  cardLabel: {
    fontSize: 9,
    letterSpacing: 2,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  cardHolder: {
    fontSize: 13,
    fontWeight: '500',
  },
  visaLogo: {
    fontSize: 24,
    fontWeight: '700',
    fontStyle: 'italic',
    letterSpacing: -1,
  },
  // Rebalance card styles
  rebalanceCard: {
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
  },
  rebalanceHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  rebalanceLabel: {
    fontSize: 12,
    fontWeight: '500',
  },
  rebalanceContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  balanceLabel: {
    fontSize: 13,
  },
  balanceValue: {
    fontSize: 24,
    fontWeight: '300',
  },
  balanceRight: {
    alignItems: 'flex-end',
  },
  rebalanceHint: {
    fontSize: 12,
    marginTop: 12,
    lineHeight: 18,
  },
  // Control buttons
  controlsRow: {
    flexDirection: 'row',
    gap: 12,
  },
  controlButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 44,
    borderRadius: 12,
  },
  controlButtonPressed: {
    opacity: 0.7,
  },
  controlText: {
    fontSize: 13,
    fontWeight: '500',
  },
  // Transactions
  transactionsSection: {
    gap: 12,
  },
  sectionTitle: {
    fontSize: 10,
    letterSpacing: 2,
  },
  transactionsList: {
    gap: 8,
  },
  transactionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderRadius: 12,
  },
  transactionLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  merchantName: {
    fontSize: 14,
    fontWeight: '500',
  },
  transactionDate: {
    fontSize: 12,
    marginTop: 2,
  },
  transactionAmount: {
    fontSize: 14,
    fontWeight: '500',
  },
});
