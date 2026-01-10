import { useState, useMemo } from 'react';
import { StyleSheet, View, Pressable, ScrollView, Keyboard, Alert, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Clipboard from 'expo-clipboard';
import { KeyboardStickyView } from 'react-native-keyboard-controller';
import Animated, { useSharedValue, useAnimatedStyle, withTiming } from 'react-native-reanimated';
import { useQuery } from 'convex/react';
import { router } from 'expo-router';
import { api } from '@/convex/_generated/api';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { TopBar } from '@/components/top-bar';
import { CommandBar } from '@/components/command-bar';
import { useThemeColor } from '@/hooks/use-theme-color';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useAuth } from '@/stores/authConvex';
import { useCards, useCardOperations } from '@/stores/cardsConvex';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

// MCC code to category mapping
const MCC_CATEGORIES: Record<string, string> = {
  // Groceries
  "5411": "Groceries", "5422": "Groceries", "5441": "Groceries", "5451": "Groceries", "5462": "Groceries",
  // Restaurants & Food
  "5812": "Restaurants", "5813": "Restaurants", "5814": "Fast Food",
  // Gas & Auto
  "5541": "Gas", "5542": "Gas", "7538": "Auto Service", "5571": "Auto",
  // Transport
  "4121": "Transport", "4131": "Transport", "4111": "Transport", "7512": "Car Rental",
  // Shopping
  "5311": "Shopping", "5310": "Shopping", "5300": "Shopping", "5399": "Shopping",
  "5651": "Clothing", "5691": "Clothing", "5699": "Clothing",
  // Electronics
  "5732": "Electronics", "5734": "Electronics", "4812": "Electronics",
  // Entertainment
  "7832": "Entertainment", "7922": "Entertainment", "7941": "Entertainment",
  // Travel
  "4511": "Travel", "7011": "Hotels", "3000": "Travel",
  // Healthcare
  "5912": "Pharmacy", "8011": "Healthcare", "8021": "Healthcare",
  // Utilities
  "4900": "Utilities", "4814": "Telecom",
};

// Get category from MCC code
function getMccCategory(mcc: string): string {
  return MCC_CATEGORIES[mcc] || "Other";
}

// Format amount from cents to display string
function formatAmount(cents: number): string {
  const dollars = Math.abs(cents) / 100;
  const sign = cents < 0 ? "-" : cents > 0 ? "+" : "";
  return `${sign}$${dollars.toFixed(2)}`;
}

// Format timestamp to relative date
function formatRelativeDate(timestamp: number): string {
  const now = new Date();
  const date = new Date(timestamp);

  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000);
  const txDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());

  if (txDate.getTime() === today.getTime()) {
    return "Today";
  } else if (txDate.getTime() === yesterday.getTime()) {
    return "Yesterday";
  } else {
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }
}

// Transform authorization to display format
interface DisplayTransaction {
  merchant: string;
  amount: string;
  date: string;
  category: string;
  status: string;
  isAmbient?: boolean;
}

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
  const { freezeCard, unfreezeCard, createCard } = useCardOperations();

  const activeCard = useMemo(() => {
    // Use selected card if set
    if (cardsState?.selectedCard) {
      return cardsState.selectedCard;
    }

    // Find the most recent active/provisioned card (has real last4, not "0000")
    const cards = cardsState?.cards || [];

    // Prefer active cards with real card numbers first
    const activeProvisioned = cards.find(
      (c) => c.status === 'active' && c.last4 && c.last4 !== '0000'
    );
    if (activeProvisioned) return activeProvisioned;

    // Fall back to any active card
    const anyActive = cards.find((c) => c.status === 'active');
    if (anyActive) return anyActive;

    // Fall back to first card (could be pending)
    return cards[0] || null;
  }, [cardsState]);

  // Query real transactions for the active card
  const rawTransactions = useQuery(
    api.cards.cards.getTransactions,
    activeCard?._id ? { cardId: activeCard._id, limit: 20 } : "skip"
  );

  // Transform raw authorizations to display format
  const transactions: DisplayTransaction[] = useMemo(() => {
    if (!rawTransactions) return [];
    return rawTransactions.map((auth) => ({
      merchant: auth.merchantName || "Unknown Merchant",
      amount: formatAmount(-auth.amount), // Negative for purchases
      date: formatRelativeDate(auth.processedAt),
      category: getMccCategory(auth.merchantMcc),
      status: auth.status,
      isAmbient: false,
    }));
  }, [rawTransactions]);

  const isLoadingTransactions = activeCard?._id && rawTransactions === undefined;

  const [showDetails, setShowDetails] = useState(false);
  const [copied, setCopied] = useState(false);
  const [loadingSecrets, setLoadingSecrets] = useState(false);
  const [creatingCard, setCreatingCard] = useState(false);
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
        console.log('[Card] getCardSecrets result:', {
          hasPan: !!secrets?.pan,
          hasCvv: !!secrets?.cvv,
          cvvValue: secrets?.cvv,
          expMonth: secrets?.expirationMonth,
          expYear: secrets?.expirationYear,
        });
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

  const handleCreateCard = async () => {
    console.log('[Card] handleCreateCard called');
    setCreatingCard(true);
    try {
      const result = await createCard({
        nickname: 'New Card',
        // Default limits from cards.ts: $1000 per tx, $5000 daily, $20000 monthly
      });
      console.log('[Card] createCard result:', result);
      if (!result) {
        // createCard returned null - check cardsState.error for details
        Alert.alert('Error', cardsState?.error || 'Failed to create card. Please try again.');
      }
    } catch (error) {
      console.error('[Card] createCard error:', error);
      Alert.alert('Error', error instanceof Error ? error.message : 'Failed to create card');
    } finally {
      setCreatingCard(false);
    }
  };

  // Check if user has any cards
  const hasCards = cardsState?.cards && cardsState.cards.length > 0;
  const isLoadingCards = cardsState?.isLoading;

  // Navigation handlers for top bar
  const handlePortfolioTap = () => router.push('/strategy');
  const handleCardTap = () => {
    // Already on card screen
  };

  // Real wallet address from auth
  const walletAddress = user?.solanaAddress || '';

  // Debug logging
  console.log('[Card] Screen state:', {
    hasCards,
    isLoadingCards,
    cardsCount: cardsState?.cards?.length,
    activeCardId: activeCard?._id,
    activeCardStatus: activeCard?.status,
    activeCardLast4: activeCard?.last4,
    allCardStatuses: cardsState?.cards?.map(c => ({ id: c._id.slice(-8), status: c.status, last4: c.last4 })),
  });

  return (
    <ThemedView style={styles.container}>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <View style={{ height: insets.top }} />

      {/* Top Bar */}
      <TopBar
        walletAddress={walletAddress}
        onPortfolioTap={handlePortfolioTap}
        onCardTap={handleCardTap}
      />

      {/* Empty State - No Cards */}
      {!hasCards && !isLoadingCards ? (
        <View style={styles.emptyStateOverlay}>
          <View style={styles.emptyStateContent}>
            <View style={[styles.emptyStateIconContainer, { backgroundColor: `${primaryColor}20` }]}>
              <Ionicons name="card-outline" size={48} color={primaryColor} />
            </View>
            <ThemedText style={styles.emptyStateTitle}>No Cards Yet</ThemedText>
            <ThemedText style={[styles.emptyStateDescription, { color: mutedColor }]}>
              Create your first virtual card to start spending securely with disposable card numbers.
            </ThemedText>
            <Pressable
              onPress={handleCreateCard}
              disabled={creatingCard}
              style={({ pressed }) => [
                styles.createCardButton,
                { backgroundColor: primaryColor },
                pressed && { opacity: 0.8 },
                creatingCard && { opacity: 0.6 }
              ]}
            >
              {creatingCard ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Ionicons name="add" size={20} color="#fff" />
              )}
              <ThemedText style={styles.createCardButtonText}>
                {creatingCard ? "Creating Card..." : "Create Card"}
              </ThemedText>
            </Pressable>
          </View>
        </View>
      ) : (
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Visa Card */}
        <View style={[styles.cardContainer, cardFrozen && styles.cardFrozen]}>
          <LinearGradient
            colors={['#0d9488', '#10b981', '#14b8a6']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.cardGradient}
          >
            {/* Glow effect */}
            <View style={[styles.cardGlow, { backgroundColor: 'rgba(255,255,255,0.15)' }]} />

            {/* Card Header */}
            <View style={styles.cardHeader}>
              <View style={styles.cardBrand}>
                <View style={[styles.brandCircle, { backgroundColor: 'rgba(255,255,255,0.2)' }]}>
                  <Ionicons name="wallet" size={14} color="#fff" />
                </View>
                <ThemedText style={[styles.cardAddressText, { color: 'rgba(255,255,255,0.9)' }]}>
                  {walletAddress ? `${walletAddress.slice(0, 6)}...${walletAddress.slice(-4)}` : 'No wallet'}
                </ThemedText>
              </View>
              <View style={styles.cardHeaderRight}>
                {cardFrozen && (
                  <View style={styles.frozenBadge}>
                    <Ionicons name="snow" size={14} color="#a855f7" />
                    <ThemedText style={styles.frozenText}>Frozen</ThemedText>
                  </View>
                )}
                <View style={styles.contactlessIcon}>
                  <Ionicons name="wifi" size={18} color="rgba(255,255,255,0.8)" />
                </View>
              </View>
            </View>

            {/* Card Number & Expiry */}
            <View style={styles.cardBody}>
              <ThemedText style={[styles.cardNumber, { color: '#fff' }]}>
                {loadingSecrets ? "Loading..." : displayCardNumber}
              </ThemedText>
              <ThemedText style={[styles.cardExpiry, { color: 'rgba(255,255,255,0.8)' }]}>
                {cardSecrets ? `${String(cardSecrets.expirationMonth).padStart(2, '0')}/${String(cardSecrets.expirationYear).slice(-2)}` : '••/••'}
              </ThemedText>
            </View>

            {/* Card Footer */}
            <View style={styles.cardFooter}>
              <View />
              <ThemedText style={[styles.visaLogo, { color: primaryColor }]}>VISA</ThemedText>
            </View>
          </LinearGradient>
        </View>

        {/* Pagination Dots */}
        <View style={styles.paginationDots}>
          <View style={[styles.paginationDot, styles.paginationDotActive]} />
          <View style={styles.paginationDot} />
        </View>

        {/* Recent Transaction */}
        {transactions.length > 0 && (
          <ThemedView
            style={styles.recentTransaction}
            lightColor="#f4f4f5"
            darkColor="#1c1c1e"
          >
            <View style={styles.transactionIcon}>
              <Ionicons name="arrow-up" size={16} color={mutedColor} />
            </View>
            <View style={styles.transactionInfo}>
              <ThemedText style={styles.transactionMerchant}>{transactions[0].merchant}</ThemedText>
              <ThemedText style={[styles.transactionTime, { color: mutedColor }]}>
                {transactions[0].date}
              </ThemedText>
            </View>
            <View style={styles.transactionAmounts}>
              <ThemedText style={styles.transactionAmount}>{transactions[0].amount}</ThemedText>
              <ThemedText style={[styles.transactionFiat, { color: mutedColor }]}>
                {transactions[0].amount.replace('-', '$').replace('+', '$')}
              </ThemedText>
            </View>
          </ThemedView>
        )}

        {/* Card Controls */}
        <View style={styles.controlsRow}>
          <Pressable 
            onPress={toggleDetails}
            disabled={loadingSecrets}
            style={({ pressed }) => [
              styles.controlButton,
              { backgroundColor: isDark ? '#27272a' : '#f4f4f5' },
              pressed && styles.controlButtonPressed
            ]}
          >
            <Ionicons 
              name={showDetails ? "eye-off-outline" : "eye-off-outline"} 
              size={22} 
              color={mutedColor} 
            />
            <ThemedText style={[styles.controlText, { color: mutedColor }]}>
              Hide data
            </ThemedText>
          </Pressable>

          <Pressable
            onPress={async () => {
              if (activeCard) {
                try {
                  let result;
                  if (cardFrozen) {
                    result = await unfreezeCard(activeCard._id);
                  } else {
                    result = await freezeCard(activeCard._id, "User requested freeze");
                  }
                  if (!result.success) {
                    Alert.alert('Error', 'Failed to update card status');
                  }
                } catch (error) {
                  Alert.alert('Error', 'Failed to update card status');
                }
              }
            }}
            style={({ pressed }) => [
              styles.controlButton,
              { backgroundColor: isDark ? '#27272a' : '#f4f4f5' },
              pressed && styles.controlButtonPressed
            ]}
          >
            <Ionicons name="snow-outline" size={22} color={cardFrozen ? '#a855f7' : mutedColor} />
            <ThemedText style={[styles.controlText, { color: mutedColor }]}>
              Freeze
            </ThemedText>
          </Pressable>

          <Pressable
            onPress={() => {
              Alert.alert('Edit Card', 'Card settings coming soon');
            }}
            style={({ pressed }) => [
              styles.controlButton,
              { backgroundColor: isDark ? '#27272a' : '#f4f4f5' },
              pressed && styles.controlButtonPressed
            ]}
          >
            <Ionicons name="settings-outline" size={22} color={mutedColor} />
            <ThemedText style={[styles.controlText, { color: mutedColor }]}>Edit card</ThemedText>
          </Pressable>
        </View>

        {/* Manage Card Section */}
        <View style={styles.manageCardSection}>
          <ThemedText style={styles.manageCardTitle}>Manage Card</ThemedText>
          
          <Pressable
            style={({ pressed }) => [
              styles.manageCardItem,
              { backgroundColor: isDark ? '#1c1c1e' : '#f4f4f5' },
              pressed && styles.manageCardItemPressed
            ]}
            onPress={() => Alert.alert('Apple Pay', 'Add to Apple Pay')}
          >
            <View style={styles.manageCardItemLeft}>
              <View style={[styles.manageCardItemIcon, { backgroundColor: '#000' }]}>
                <ThemedText style={styles.applePayText}>Pay</ThemedText>
              </View>
              <View>
                <ThemedText style={styles.manageCardItemTitle}>Apple Pay</ThemedText>
                <ThemedText style={[styles.manageCardItemSubtitle, { color: mutedColor }]}>
                  Card has been added
                </ThemedText>
              </View>
            </View>
            <Ionicons name="chevron-forward" size={20} color={mutedColor} />
          </Pressable>

          <Pressable
            style={({ pressed }) => [
              styles.manageCardItem,
              { backgroundColor: isDark ? '#1c1c1e' : '#f4f4f5' },
              pressed && styles.manageCardItemPressed
            ]}
            onPress={() => Alert.alert('Payment Method', 'Change payment method')}
          >
            <View style={styles.manageCardItemLeft}>
              <View style={[styles.manageCardItemIcon, { backgroundColor: `${primaryColor}20` }]}>
                <Ionicons name="card" size={16} color={primaryColor} />
              </View>
              <View>
                <ThemedText style={styles.manageCardItemTitle}>Payment Method</ThemedText>
                <ThemedText style={[styles.manageCardItemSubtitle, { color: mutedColor }]}>
                  {walletAddress ? `${walletAddress.slice(0, 6)}...${walletAddress.slice(-4)}` : 'Not set'}
                </ThemedText>
              </View>
            </View>
            <Ionicons name="chevron-forward" size={20} color={mutedColor} />
          </Pressable>

          <Pressable
            style={({ pressed }) => [
              styles.manageCardItem,
              { backgroundColor: isDark ? '#1c1c1e' : '#f4f4f5' },
              pressed && styles.manageCardItemPressed
            ]}
            onPress={() => Alert.alert('Card Design', 'Customize card design')}
          >
            <View style={styles.manageCardItemLeft}>
              <View style={[styles.manageCardItemIcon, { backgroundColor: 'rgba(168, 85, 247, 0.2)' }]}>
                <Ionicons name="color-palette" size={16} color="#a855f7" />
              </View>
              <View>
                <ThemedText style={styles.manageCardItemTitle}>Card Design</ThemedText>
              </View>
            </View>
            <Ionicons name="chevron-forward" size={20} color={mutedColor} />
          </Pressable>
        </View>

        {/* Transactions */}
        <View style={styles.transactionsSection}>
          <ThemedText style={[styles.sectionTitle, { color: mutedColor }]}>RECENT</ThemedText>
          <View style={styles.transactionsList}>
            {isLoadingTransactions ? (
              <View style={styles.loadingContainer}>
                <ActivityIndicator size="small" color={primaryColor} />
                <ThemedText style={[styles.loadingText, { color: mutedColor }]}>
                  Loading transactions...
                </ThemedText>
              </View>
            ) : transactions.length === 0 ? (
              <ThemedView
                style={styles.emptyContainer}
                lightColor="#f4f4f5"
                darkColor="#1c1c1e"
              >
                <Ionicons name="receipt-outline" size={32} color={mutedColor} />
                <ThemedText style={[styles.emptyText, { color: mutedColor }]}>
                  No transactions yet
                </ThemedText>
                <ThemedText style={[styles.emptySubtext, { color: mutedColor }]}>
                  Use your card to see transactions here
                </ThemedText>
              </ThemedView>
            ) : (
              transactions.map((tx, i) => (
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
                      <ThemedText style={[styles.transactionDate, { color: mutedColor }]}>
                        {tx.date} • {tx.category}
                      </ThemedText>
                    </View>
                  </View>
                  <View style={styles.transactionRight}>
                    <ThemedText
                      style={[
                        styles.transactionAmount,
                        tx.amount.startsWith("+") && { color: primaryColor }
                      ]}
                    >
                      {tx.amount}
                    </ThemedText>
                    {tx.status !== "settled" && tx.status !== "approved" && (
                      <ThemedText style={[styles.transactionStatus, { color: mutedColor }]}>
                        {tx.status}
                      </ThemedText>
                    )}
                  </View>
                </ThemedView>
              ))
            )}
          </View>
        </View>
      </ScrollView>
      )}

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
    minHeight: 200,
    borderRadius: 24,
    overflow: 'hidden',
    // Standard card aspect ratio is approximately 1.586:1
    aspectRatio: 1.586,
  },
  cardFrozen: {
    opacity: 0.6,
  },
  cardGradient: {
    flex: 1,
    padding: 20,
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
  cardHeaderRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
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
    flex: 1,
    justifyContent: 'center',
  },
  cardNumber: {
    fontSize: 18,
    letterSpacing: 3,
    fontFamily: 'monospace',
  },
  eyeButton: {
    padding: 8,
  },
  cardDetailsRow: {
    flexDirection: 'row',
    gap: 32,
    marginTop: 12,
  },
  cardDetailValue: {
    fontSize: 14,
    fontWeight: '600',
    letterSpacing: 1,
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
  },
  cardLabel: {
    fontSize: 9,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    marginBottom: 2,
  },
  cardHolder: {
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 1,
  },
  visaLogo: {
    fontSize: 28,
    fontWeight: '700',
    fontStyle: 'italic',
    letterSpacing: -1,
  },
  cardAddressText: {
    fontSize: 13,
    fontFamily: 'monospace',
  },
  contactlessIcon: {
    padding: 4,
  },
  cardExpiry: {
    fontSize: 14,
    marginTop: 4,
  },
  // Pagination dots
  paginationDots: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    marginTop: 12,
    marginBottom: 16,
  },
  paginationDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: 'rgba(255,255,255,0.3)',
  },
  paginationDotActive: {
    backgroundColor: '#fff',
  },
  // Recent transaction
  recentTransaction: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 16,
    marginBottom: 16,
  },
  transactionIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  transactionInfo: {
    flex: 1,
  },
  transactionMerchant: {
    fontSize: 15,
    fontWeight: '600',
  },
  transactionTime: {
    fontSize: 12,
    marginTop: 2,
  },
  transactionAmounts: {
    alignItems: 'flex-end',
  },
  transactionAmount: {
    fontSize: 15,
    fontWeight: '600',
  },
  transactionFiat: {
    fontSize: 12,
    marginTop: 2,
  },
  // Manage Card Section
  manageCardSection: {
    marginTop: 24,
    gap: 12,
  },
  manageCardTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  manageCardItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderRadius: 14,
  },
  manageCardItemPressed: {
    opacity: 0.7,
  },
  manageCardItemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  manageCardItemIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  applePayText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#fff',
  },
  manageCardItemTitle: {
    fontSize: 15,
    fontWeight: '500',
  },
  manageCardItemSubtitle: {
    fontSize: 12,
    marginTop: 2,
  },
  // Control buttons
  controlsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 32,
    marginBottom: 8,
  },
  controlButton: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  controlButtonPressed: {
    opacity: 0.7,
  },
  controlText: {
    fontSize: 12,
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
  transactionRight: {
    alignItems: 'flex-end',
  },
  transactionStatus: {
    fontSize: 10,
    textTransform: 'uppercase',
    marginTop: 2,
  },
  loadingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    padding: 24,
  },
  loadingText: {
    fontSize: 14,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
    borderRadius: 12,
    gap: 8,
  },
  emptyText: {
    fontSize: 16,
    fontWeight: '500',
    marginTop: 8,
  },
  emptySubtext: {
    fontSize: 13,
    textAlign: 'center',
  },
  // Empty state overlay styles
  emptyStateOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  emptyStateContent: {
    alignItems: 'center',
    maxWidth: 320,
  },
  emptyStateIconContainer: {
    width: 96,
    height: 96,
    borderRadius: 48,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
  },
  emptyStateTitle: {
    fontSize: 24,
    fontWeight: '600',
    marginBottom: 12,
    textAlign: 'center',
  },
  emptyStateDescription: {
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
    marginBottom: 32,
  },
  createCardButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 16,
    paddingHorizontal: 32,
    borderRadius: 16,
  },
  createCardButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
});
