import { useState, useMemo, useCallback } from 'react';
import {
  StyleSheet,
  View,
  Pressable,
  Alert,
  ActivityIndicator,
  Dimensions,
  FlatList,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSpring,
  interpolate,
  Extrapolation,
  runOnJS,
} from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { useQuery } from 'convex/react';
import { router } from 'expo-router';
import { api } from '@/convex/_generated/api';
import type { Doc } from '@/convex/_generated/dataModel';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { TopBar } from '@/components/top-bar';
import { CreateCardModal } from '@/components/create-card-modal';
import { useThemeColor } from '@/hooks/use-theme-color';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useAuth } from '@/stores/authConvex';
import { useCards, useCardOperations } from '@/stores/cardsConvex';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const CARD_WIDTH = SCREEN_WIDTH - 80;
const CARD_MARGIN = 12;

// Props for the content component when used in pager
export interface CardScreenContentProps {
  onNavigateToPortfolio?: () => void;
  onNavigateToHome?: () => void;
}

// MCC code to category mapping
const MCC_CATEGORIES: Record<string, string> = {
  "5411": "Groceries", "5422": "Groceries", "5441": "Groceries", "5451": "Groceries", "5462": "Groceries",
  "5812": "Restaurants", "5813": "Restaurants", "5814": "Fast Food",
  "5541": "Gas", "5542": "Gas", "7538": "Auto Service", "5571": "Auto",
  "4121": "Transport", "4131": "Transport", "4111": "Transport", "7512": "Car Rental",
  "5311": "Shopping", "5310": "Shopping", "5300": "Shopping", "5399": "Shopping",
  "5651": "Clothing", "5691": "Clothing", "5699": "Clothing",
  "5732": "Electronics", "5734": "Electronics", "4812": "Electronics",
  "7832": "Entertainment", "7922": "Entertainment", "7941": "Entertainment",
  "4511": "Travel", "7011": "Hotels", "3000": "Travel",
  "5912": "Pharmacy", "8011": "Healthcare", "8021": "Healthcare",
  "4900": "Utilities", "4814": "Telecom",
};

function getMccCategory(mcc: string): string {
  return MCC_CATEGORIES[mcc] || "Other";
}

function formatAmount(cents: number): string {
  const dollars = Math.abs(cents) / 100;
  const sign = cents < 0 ? "-" : cents > 0 ? "+" : "";
  return `${sign}$${dollars.toFixed(2)}`;
}

function formatRelativeDate(timestamp: number): string {
  const now = new Date();
  const date = new Date(timestamp);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000);
  const txDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());

  if (txDate.getTime() === today.getTime()) return "Today";
  if (txDate.getTime() === yesterday.getTime()) return "Yesterday";
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

interface DisplayTransaction {
  merchant: string;
  amount: string;
  date: string;
  category: string;
  status: string;
  isAmbient?: boolean;
  fee?: string;
  exactTime?: string;
}

// Bottom drawer constants
const DRAWER_CLOSED_HEIGHT = 220;
const DRAWER_OPEN_HEIGHT = 380;

export function CardScreenContent({ onNavigateToPortfolio, onNavigateToHome }: CardScreenContentProps) {
  const insets = useSafeAreaInsets();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  const primaryColor = useThemeColor({}, 'tint');
  const mutedColor = useThemeColor({ light: '#687076', dark: '#9BA1A6' }, 'icon');
  const textColor = useThemeColor({}, 'text');
  const cardBg = useThemeColor({ light: '#f4f4f5', dark: '#1c1c1e' }, 'background');
  const borderColor = useThemeColor({ light: 'rgba(0,0,0,0.08)', dark: 'rgba(255,255,255,0.1)' }, 'background');

  // Real data from stores
  const { user } = useAuth();
  const { state: cardsState } = useCards();
  const { freezeCard, unfreezeCard, createCard, getCardSecrets } = useCardOperations();

  // Count of user's cards
  const cardCount = cardsState?.cards?.length || 0;

  // Card carousel state
  const [activeCardIndex, setActiveCardIndex] = useState(0);
  
  // Get all cards for carousel
  const allCards = useMemo(() => {
    const cards = cardsState?.cards || [];
    // Add a placeholder for "add card" if we have cards
    return cards;
  }, [cardsState?.cards]);

  const activeCard = allCards[activeCardIndex] || null;

  // Query real transactions for the active card
  const rawTransactions = useQuery(
    api.cards.cards.getTransactions,
    activeCard?._id ? { cardId: activeCard._id, limit: 20 } : "skip"
  );

  const transactions: DisplayTransaction[] = useMemo(() => {
    if (!rawTransactions) return [];
    return rawTransactions.map((auth: Doc<"authorizations">) => ({
      merchant: auth.merchantName || "Unknown Merchant",
      amount: formatAmount(-auth.amount),
      date: formatRelativeDate(auth.processedAt),
      category: getMccCategory(auth.merchantMcc),
      status: auth.status,
      isAmbient: false,
      fee: "$0.45",
      exactTime: new Date(auth.processedAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }),
    }));
  }, [rawTransactions]);

  const isLoadingTransactions = activeCard?._id && rawTransactions === undefined;

  const [showDetails, setShowDetails] = useState(false);
  const [copied, setCopied] = useState(false);
  const [loadingSecrets, setLoadingSecrets] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [cardSecrets, setCardSecrets] = useState<{
    pan: string;
    cvv: string;
    expirationMonth: number;
    expirationYear: number;
  } | null>(null);

  // Transaction stack state
  const [currentTxIndex, setCurrentTxIndex] = useState(0);
  const [isExpanded, setIsExpanded] = useState(false);

  // Bottom drawer state
  const drawerY = useSharedValue(0);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const cardFrozen = activeCard?.status === 'frozen';

  const formatCardNumber = (pan: string) => {
    return pan.replace(/(.{4})/g, '$1 ').trim();
  };

  const displayCardNumber = useMemo(() => {
    if (!showDetails) return "•••• •••• •••• ••••";
    if (cardSecrets?.pan) return formatCardNumber(cardSecrets.pan);
    if (activeCard?.last4 && activeCard.last4 !== "0000") {
      return `•••• •••• •••• ${activeCard.last4}`;
    }
    return "•••• •••• •••• ••••";
  }, [showDetails, cardSecrets, activeCard]);

  const toggleDetails = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (!showDetails && activeCard && !cardSecrets) {
      setLoadingSecrets(true);
      try {
        const secrets = await getCardSecrets(activeCard._id);
        if (secrets) setCardSecrets(secrets);
      } catch (error) {
        console.error('Failed to get card secrets:', error);
        Alert.alert('Error', 'Failed to load card details');
      } finally {
        setLoadingSecrets(false);
      }
    }
    setShowDetails(!showDetails);
  };


  const copyCardNumber = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (cardSecrets?.pan) {
      await Clipboard.setStringAsync(cardSecrets.pan);
    } else if (activeCard?.last4) {
      await Clipboard.setStringAsync(`**** **** **** ${activeCard.last4}`);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleOpenCreateModal = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setShowCreateModal(true);
  };

  const handleToggleFreeze = async () => {
    if (!activeCard) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      if (cardFrozen) {
        await unfreezeCard(activeCard._id);
      } else {
        await freezeCard(activeCard._id, "User requested freeze");
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to update card status');
    }
  };

  const hasCards = cardsState?.cards && cardsState.cards.length > 0;
  // Only show loading if cardsState exists and isLoading is explicitly true
  const isLoadingCards = cardsState?.isLoading === true;

  // Navigation handlers for top bar - use callbacks if provided, otherwise use router
  const handlePortfolioTap = onNavigateToPortfolio || (() => router.push('/portfolio'));
  const handleCardTap = onNavigateToHome || (() => {});

  const walletAddress = user?.solanaAddress || '';

  // Stacked transactions helpers
  const getStackedTransactions = useCallback(() => {
    const result = [];
    for (let i = 0; i < Math.min(3, transactions.length); i++) {
      const index = (currentTxIndex + i) % transactions.length;
      result.push({ ...transactions[index], stackIndex: i });
    }
    return result;
  }, [transactions, currentTxIndex]);

  const nextTransaction = () => {
    if (!isExpanded && transactions.length > 1) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      setCurrentTxIndex((prev) => (prev + 1) % transactions.length);
    }
  };

  const toggleExpand = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setIsExpanded(!isExpanded);
  };

  // Bottom drawer gesture
  const setDrawerOpenJS = (open: boolean) => {
    setDrawerOpen(open);
  };

  const drawerGesture = Gesture.Pan()
    .onUpdate((event) => {
      const newY = Math.max(
        -(DRAWER_OPEN_HEIGHT - DRAWER_CLOSED_HEIGHT),
        Math.min(0, drawerY.value + event.translationY * 0.5)
      );
      drawerY.value = newY;
    })
    .onEnd((event) => {
      const shouldOpen = event.velocityY < -500 || (drawerY.value < -50 && event.velocityY < 200);
      if (shouldOpen) {
        drawerY.value = withSpring(-(DRAWER_OPEN_HEIGHT - DRAWER_CLOSED_HEIGHT), {
          damping: 20,
          stiffness: 300,
        });
        runOnJS(setDrawerOpenJS)(true);
      } else {
        drawerY.value = withSpring(0, { damping: 20, stiffness: 300 });
        runOnJS(setDrawerOpenJS)(false);
      }
    });

  const toggleDrawer = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (drawerOpen) {
      drawerY.value = withSpring(0, { damping: 20, stiffness: 300 });
      setDrawerOpen(false);
    } else {
      drawerY.value = withSpring(-(DRAWER_OPEN_HEIGHT - DRAWER_CLOSED_HEIGHT), {
        damping: 20,
        stiffness: 300,
      });
      setDrawerOpen(true);
    }
  };

  const drawerAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: drawerY.value }],
  }));

  // Card carousel scroll handler
  const handleCardScroll = (event: any) => {
    const offsetX = event.nativeEvent.contentOffset.x;
    const newIndex = Math.round(offsetX / (CARD_WIDTH + CARD_MARGIN * 2));
    if (newIndex !== activeCardIndex && newIndex >= 0 && newIndex < allCards.length) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      setActiveCardIndex(newIndex);
      // Reset card secrets when switching cards
      setCardSecrets(null);
      setShowDetails(false);
    }
  };

  // Render a single card in carousel
  const renderCard = ({ item, index }: { item: any; index: number }) => {
    const isActive = index === activeCardIndex;
    const isFrozen = item.status === 'frozen';
    const isStarpay = item.provider === 'starpay';
    const isPrepaid = isStarpay && item.starpayCardType === 'black';

    // Different gradient for Starpay cards
    const cardGradient = isStarpay
      ? ['#6366f1', '#8b5cf6', '#a78bfa'] as [string, string, string]
      : ['#0d9488', '#10b981', '#14b8a6'] as [string, string, string];

    return (
      <View style={[styles.cardWrapper, { marginHorizontal: CARD_MARGIN }]}>
        <View style={[styles.cardContainer, isFrozen && styles.cardFrozen]}>
          <LinearGradient
            colors={cardGradient}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.cardGradient}
          >
            {/* Glow effect */}
            <View style={styles.cardGlow} />

            {/* Watermark pattern */}
            <View style={styles.watermarkContainer}>
              <ThemedText style={styles.watermarkText}>$</ThemedText>
            </View>

            {/* Card Header */}
            <View style={styles.cardHeader}>
              <View style={styles.cardBrand}>
                <View style={styles.brandCircle}>
                  <ThemedText style={styles.brandSymbol}>{isStarpay ? '★' : '≡'}</ThemedText>
                </View>
                {isPrepaid ? (
                  <ThemedText style={styles.cardAddressText}>
                    Prepaid • ${((item.prepaidBalance || 0) / 100).toFixed(2)}
                  </ThemedText>
                ) : (
                  <ThemedText style={styles.cardAddressText}>
                    Wallet Connected
                  </ThemedText>
                )}
              </View>
              <View style={styles.cardHeaderRight}>
                {isPrepaid && (
                  <View style={styles.prepaidBadge}>
                    <Ionicons name="flash" size={12} color="#fbbf24" />
                    <ThemedText style={styles.prepaidText}>Instant</ThemedText>
                  </View>
                )}
                {isFrozen && (
                  <View style={styles.frozenBadge}>
                    <Ionicons name="snow" size={14} color="#a855f7" />
                    <ThemedText style={styles.frozenText}>Frozen</ThemedText>
                  </View>
                )}
                <View style={styles.contactlessIcon}>
                  <Ionicons name="wifi" size={18} color="rgba(255,255,255,0.8)" style={{ transform: [{ rotate: '90deg' }] }} />
                </View>
              </View>
            </View>

            {/* Card Body */}
            <View style={styles.cardBody}>
              <ThemedText style={styles.cardNumber}>
                {isActive && loadingSecrets ? "Loading..." : (isActive ? displayCardNumber : `•••• •••• •••• ${item.last4 || '••••'}`)}
              </ThemedText>
              <ThemedText style={styles.cardExpiry}>
                {isActive && cardSecrets
                  ? `${String(cardSecrets.expirationMonth).padStart(2, '0')}/${String(cardSecrets.expirationYear).slice(-2)}`
                  : '••/••'}
              </ThemedText>
            </View>

            {/* Card Footer */}
            <View style={styles.cardFooter}>
              {item.nickname && (
                <ThemedText style={styles.cardNickname}>{item.nickname}</ThemedText>
              )}
              {!item.nickname && <View />}
              <ThemedText style={styles.visaLogo}>VISA</ThemedText>
            </View>
          </LinearGradient>
        </View>
      </View>
    );
  };

  return (
    <ThemedView style={styles.container}>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <View style={{ height: insets.top }} />

      {/* Ambient gradient background */}
      <View style={styles.ambientGradient}>
        <LinearGradient
          colors={isDark 
            ? ['rgba(16, 185, 129, 0.08)', 'transparent'] 
            : ['rgba(16, 185, 129, 0.05)', 'transparent']}
          style={StyleSheet.absoluteFill}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 0.6 }}
        />
      </View>

      <TopBar
        walletAddress={walletAddress}
        onPortfolioTap={handlePortfolioTap}
        onCardTap={handleCardTap}
        cardCount={cardCount}
      />

      {/* Loading State */}
      {isLoadingCards && (
        <View style={styles.emptyStateOverlay}>
          <ActivityIndicator size="large" color={primaryColor} />
          <ThemedText style={[styles.loadingCardsText, { color: mutedColor }]}>
            Loading cards...
          </ThemedText>
        </View>
      )}

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
              onPress={handleOpenCreateModal}
              style={({ pressed }) => [
                styles.createCardButton,
                { backgroundColor: primaryColor },
                pressed && { opacity: 0.8 },
              ]}
            >
              <Ionicons name="add" size={20} color="#fff" />
              <ThemedText style={styles.createCardButtonText}>Create Card</ThemedText>
            </Pressable>
          </View>
        </View>
      ) : !isLoadingCards && (
        <View style={styles.mainContent}>
          {/* Card Carousel */}
          <View style={styles.carouselContainer}>
            {/* Side peek indicators */}
            <View style={[styles.sidePeek, styles.sidePeekLeft, { backgroundColor: cardBg, borderColor }]} />
            <View style={[styles.sidePeek, styles.sidePeekRight, { backgroundColor: cardBg, borderColor }]} />
            
            <FlatList
              data={allCards}
              renderItem={renderCard}
              keyExtractor={(item) => item._id}
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              onMomentumScrollEnd={handleCardScroll}
              contentContainerStyle={styles.carouselContent}
              snapToInterval={CARD_WIDTH + CARD_MARGIN * 2}
              decelerationRate="fast"
              snapToAlignment="center"
            />
          </View>

          {/* Pagination dots */}
          <View style={styles.paginationDots}>
            {allCards.map((_, index) => (
              <View
                key={index}
                style={[
                  styles.paginationDot,
                  index === activeCardIndex && styles.paginationDotActive,
                  { backgroundColor: index === activeCardIndex ? textColor : mutedColor }
                ]}
              />
            ))}
          </View>

          {/* Transaction Stack */}
          {transactions.length > 0 && (
            <View style={styles.transactionStackContainer}>
              {getStackedTransactions().map((tx, index) => {
                const stackIndex = tx.stackIndex;
                const isTop = stackIndex === 0;
                
                return (
                  <Pressable
                    key={`${tx.merchant}-${index}`}
                    onPress={isTop ? toggleExpand : nextTransaction}
                    style={[
                      styles.stackedTransaction,
                      {
                        backgroundColor: cardBg,
                        borderColor,
                        transform: [
                          { translateY: -stackIndex * 6 },
                          { scale: 1 - stackIndex * 0.03 },
                        ],
                        opacity: 1 - stackIndex * 0.15,
                        zIndex: 10 - stackIndex,
                      },
                    ]}
                  >
                    <View style={styles.transactionRow}>
                      <View style={[styles.transactionIconCircle, { backgroundColor: `${mutedColor}20` }]}>
                        <Ionicons name="arrow-up" size={18} color={mutedColor} />
                      </View>
                      <View style={styles.transactionInfo}>
                        <ThemedText style={styles.transactionMerchant} numberOfLines={1}>{tx.merchant}</ThemedText>
                        <ThemedText style={[styles.transactionTime, { color: mutedColor }]}>
                          {tx.date}
                        </ThemedText>
                      </View>
                      <View style={styles.transactionAmounts}>
                        <ThemedText style={styles.transactionAmount}>{tx.amount}</ThemedText>
                        <ThemedText style={[styles.transactionFiat, { color: mutedColor }]}>
                          {tx.amount.replace('-', '$').replace('+', '$')}
                        </ThemedText>
                      </View>
                    </View>
                    
                    {/* Expanded details */}
                    {isTop && isExpanded && (
                      <View style={[styles.expandedDetails, { borderTopColor: borderColor }]}>
                        <View style={styles.detailRow}>
                          <Ionicons name="time-outline" size={14} color={mutedColor} />
                          <ThemedText style={[styles.detailText, { color: mutedColor }]}>
                            Fee: {tx.fee}
                          </ThemedText>
                        </View>
                        <ThemedText style={[styles.detailText, { color: mutedColor }]}>
                          {tx.exactTime}
                        </ThemedText>
                      </View>
                    )}
                  </Pressable>
                );
              })}
            </View>
          )}

          {/* Empty transactions state */}
          {!isLoadingTransactions && transactions.length === 0 && (
            <View style={[styles.emptyTransactions, { backgroundColor: cardBg }]}>
              <Ionicons name="receipt-outline" size={24} color={mutedColor} />
              <ThemedText style={[styles.emptyTransactionsText, { color: mutedColor }]}>
                No transactions yet
              </ThemedText>
            </View>
          )}

          {/* Loading transactions */}
          {isLoadingTransactions && (
            <View style={[styles.loadingTransactions, { backgroundColor: cardBg }]}>
              <ActivityIndicator size="small" color={primaryColor} />
              <ThemedText style={[styles.loadingText, { color: mutedColor }]}>
                Loading transactions...
              </ThemedText>
            </View>
          )}

          {/* Circular Action Buttons */}
          <View style={[styles.actionButtonsRow, isExpanded && { marginTop: 48 }]}>
            <Pressable onPress={toggleDetails} disabled={loadingSecrets} style={styles.actionButton}>
              <View style={[styles.actionButtonCircle, { backgroundColor: cardBg, borderColor }]}>
                <Ionicons name={showDetails ? "eye-outline" : "eye-off-outline"} size={22} color={textColor} />
              </View>
              <ThemedText style={[styles.actionButtonLabel, { color: mutedColor }]}>
                {showDetails ? 'Show data' : 'Hide data'}
              </ThemedText>
            </Pressable>

            <Pressable onPress={handleToggleFreeze} style={styles.actionButton}>
              <View style={[
                styles.actionButtonCircle,
                { backgroundColor: cardFrozen ? `${primaryColor}20` : cardBg, borderColor: cardFrozen ? primaryColor : borderColor }
              ]}>
                <Ionicons name="snow-outline" size={22} color={cardFrozen ? primaryColor : textColor} />
              </View>
              <ThemedText style={[styles.actionButtonLabel, { color: mutedColor }]}>
                {cardFrozen ? 'Unfreeze' : 'Freeze'}
              </ThemedText>
            </Pressable>

            <Pressable onPress={() => console.log('[Card] Edit card settings')} style={styles.actionButton}>
              <View style={[styles.actionButtonCircle, { backgroundColor: cardBg, borderColor }]}>
                <Ionicons name="settings-outline" size={22} color={textColor} />
              </View>
              <ThemedText style={[styles.actionButtonLabel, { color: mutedColor }]}>Edit card</ThemedText>
            </Pressable>
          </View>
        </View>
      )}

      {/* Gradient overlay before drawer */}
      {hasCards && (
        <LinearGradient
          colors={isDark ? ['transparent', '#0f1419'] : ['transparent', '#ffffff']}
          style={[styles.drawerGradient, { bottom: DRAWER_CLOSED_HEIGHT - 40 }]}
          pointerEvents="none"
        />
      )}

      {/* Bottom Drawer - Manage Card */}
      {hasCards && (
        <GestureDetector gesture={drawerGesture}>
          <Animated.View
            style={[
              styles.drawer,
              {
                backgroundColor: isDark ? '#1a1f25' : '#ffffff',
                borderTopColor: borderColor,
                height: DRAWER_OPEN_HEIGHT,
                top: SCREEN_HEIGHT - DRAWER_CLOSED_HEIGHT - insets.bottom,
              },
              drawerAnimatedStyle,
            ]}
          >
            {/* Drawer Handle */}
            <Pressable onPress={toggleDrawer} style={styles.drawerHandle}>
              <View style={[styles.drawerHandleBar, { backgroundColor: mutedColor }]} />
            </Pressable>

            {/* Drawer Content */}
            <View style={styles.drawerContent}>
              <ThemedText style={styles.drawerTitle}>Manage Card</ThemedText>

              {/* Apple Pay */}
              <Pressable
                style={({ pressed }) => [styles.drawerItem, styles.drawerItemDisabled, pressed && styles.drawerItemPressed]}
                onPress={() => console.log('[Card] Apple Pay - coming soon')}
              >
                <View style={[styles.drawerItemIcon, { backgroundColor: '#000', opacity: 0.5 }]}>
                  <ThemedText style={styles.applePayText}>Pay</ThemedText>
                </View>
                <View style={styles.drawerItemContent}>
                  <ThemedText style={[styles.drawerItemTitle, { opacity: 0.5 }]}>Apple Pay</ThemedText>
                  <ThemedText style={[styles.drawerItemSubtitle, { color: mutedColor }]}>
                    Coming soon
                  </ThemedText>
                </View>
                <Ionicons name="chevron-forward" size={20} color={mutedColor} style={{ opacity: 0.5 }} />
              </Pressable>

              {/* Payment Method */}
              <Pressable
                style={({ pressed }) => [styles.drawerItem, pressed && styles.drawerItemPressed]}
                onPress={() => console.log('[Card] Payment method settings')}
              >
                <View style={[styles.drawerItemIcon, { backgroundColor: `${primaryColor}20` }]}>
                  <ThemedText style={[styles.solanaSymbol, { color: primaryColor }]}>◎</ThemedText>
                </View>
                <View style={styles.drawerItemContent}>
                  <ThemedText style={styles.drawerItemTitle}>Payment Method</ThemedText>
                  <View style={styles.paymentMethodRow}>
                    <View style={[styles.tokenBadge, { backgroundColor: `${primaryColor}20` }]}>
                      <ThemedText style={[styles.tokenBadgeText, { color: primaryColor }]}>◎</ThemedText>
                    </View>
                    <ThemedText style={[styles.drawerItemSubtitle, { color: mutedColor }]}>
                      {walletAddress ? 'Solana Wallet' : 'Not set'}
                    </ThemedText>
                  </View>
                </View>
                <Ionicons name="chevron-forward" size={20} color={mutedColor} />
              </Pressable>

              {/* Card Design */}
              <Pressable
                style={({ pressed }) => [styles.drawerItem, styles.drawerItemDisabled, pressed && styles.drawerItemPressed]}
                onPress={() => console.log('[Card] Card design - coming soon')}
              >
                <View style={[styles.drawerItemIcon, { backgroundColor: 'rgba(168, 85, 247, 0.2)', opacity: 0.5 }]}>
                  <Ionicons name="color-palette" size={18} color="#a855f7" />
                </View>
                <View style={styles.drawerItemContent}>
                  <ThemedText style={[styles.drawerItemTitle, { opacity: 0.5 }]}>Card Design</ThemedText>
                  <ThemedText style={[styles.drawerItemSubtitle, { color: mutedColor }]}>
                    Coming soon
                  </ThemedText>
                </View>
                <Ionicons name="chevron-forward" size={20} color={mutedColor} style={{ opacity: 0.5 }} />
              </Pressable>
            </View>
          </Animated.View>
        </GestureDetector>
      )}

      {/* Create Card Modal */}
      <CreateCardModal
        visible={showCreateModal}
        onClose={() => setShowCreateModal(false)}
      />

    </ThemedView>
  );
}

export default function CardScreen() {
  return <CardScreenContent />;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  ambientGradient: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: SCREEN_HEIGHT * 0.5,
    pointerEvents: 'none',
  },
  mainContent: {
    flex: 1,
    paddingBottom: DRAWER_CLOSED_HEIGHT + 40,
  },
  
  // Card Carousel
  carouselContainer: {
    paddingVertical: 16,
    position: 'relative',
  },
  carouselContent: {
    paddingHorizontal: (SCREEN_WIDTH - CARD_WIDTH) / 2 - CARD_MARGIN,
  },
  sidePeek: {
    position: 'absolute',
    top: '50%',
    width: 4,
    height: 80,
    borderRadius: 2,
    borderWidth: 1,
    transform: [{ translateY: -40 }],
    zIndex: 1,
  },
  sidePeekLeft: {
    left: 8,
  },
  sidePeekRight: {
    right: 8,
  },
  cardWrapper: {
    width: CARD_WIDTH,
  },
  cardContainer: {
    borderRadius: 20,
    overflow: 'hidden',
    aspectRatio: 1.6,
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
    backgroundColor: 'rgba(255,255,255,0.15)',
    opacity: 0.3,
  },
  watermarkContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    opacity: 0.05,
  },
  watermarkText: {
    fontSize: 200,
    fontWeight: 'bold',
    color: '#000',
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
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  brandSymbol: {
    fontSize: 12,
    fontWeight: '700',
    color: '#fff',
  },
  cardAddressText: {
    fontSize: 12,
    fontFamily: 'monospace',
    color: 'rgba(255,255,255,0.9)',
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
  prepaidBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(251, 191, 36, 0.2)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  prepaidText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#fbbf24',
  },
  contactlessIcon: {
    padding: 4,
  },
  cardBody: {
    flex: 1,
    justifyContent: 'center',
  },
  cardNumber: {
    fontSize: 18,
    letterSpacing: 3,
    fontFamily: 'monospace',
    color: '#fff',
  },
  cardExpiry: {
    fontSize: 14,
    marginTop: 4,
    color: 'rgba(255,255,255,0.8)',
    fontFamily: 'monospace',
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
  },
  visaLogo: {
    fontSize: 28,
    fontWeight: '700',
    fontStyle: 'italic',
    letterSpacing: -1,
    color: 'rgba(255,255,255,0.9)',
  },
  cardNickname: {
    fontSize: 12,
    fontWeight: '500',
    color: 'rgba(255,255,255,0.7)',
  },

  // Pagination
  paginationDots: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    marginTop: 8,
    marginBottom: 16,
  },
  paginationDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  paginationDotActive: {
    width: 16,
    borderRadius: 4,
  },

  // Transaction Stack
  transactionStackContainer: {
    paddingHorizontal: 24,
    height: 120,
    position: 'relative',
  },
  stackedTransaction: {
    position: 'absolute',
    left: 24,
    right: 24,
    borderRadius: 16,
    borderWidth: 1,
    overflow: 'hidden',
  },
  transactionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    gap: 12,
  },
  transactionIconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  transactionInfo: {
    flex: 1,
  },
  transactionMerchant: {
    fontSize: 15,
    fontWeight: '600',
  },
  transactionTime: {
    fontSize: 13,
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
    fontSize: 13,
    marginTop: 2,
  },
  expandedDetails: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: 1,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  detailText: {
    fontSize: 13,
  },
  emptyTransactions: {
    marginHorizontal: 24,
    padding: 24,
    borderRadius: 16,
    alignItems: 'center',
    gap: 8,
  },
  emptyTransactionsText: {
    fontSize: 14,
  },
  loadingTransactions: {
    marginHorizontal: 24,
    padding: 24,
    borderRadius: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  loadingText: {
    fontSize: 14,
  },

  // Action Buttons
  actionButtonsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 32,
    paddingVertical: 16,
    marginTop: 8,
  },
  actionButton: {
    alignItems: 'center',
    gap: 8,
  },
  actionButtonCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  actionButtonLabel: {
    fontSize: 12,
    fontWeight: '500',
  },

  // Drawer
  drawerGradient: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 80,
    pointerEvents: 'none',
    zIndex: 5,
  },
  drawer: {
    position: 'absolute',
    left: 0,
    right: 0,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderTopWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 10,
    zIndex: 15,
  },
  drawerHandle: {
    alignItems: 'center',
    paddingVertical: 12,
  },
  drawerHandleBar: {
    width: 40,
    height: 4,
    borderRadius: 2,
    opacity: 0.3,
  },
  drawerContent: {
    paddingHorizontal: 20,
  },
  drawerTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 16,
  },
  drawerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    gap: 12,
  },
  drawerItemPressed: {
    opacity: 0.7,
  },
  drawerItemDisabled: {
    opacity: 0.6,
  },
  drawerItemIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  applePayText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#fff',
  },
  solanaSymbol: {
    fontSize: 18,
  },
  drawerItemContent: {
    flex: 1,
  },
  drawerItemTitle: {
    fontSize: 15,
    fontWeight: '500',
  },
  drawerItemSubtitle: {
    fontSize: 12,
    marginTop: 2,
  },
  paymentMethodRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 2,
  },
  tokenBadge: {
    width: 16,
    height: 16,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tokenBadgeText: {
    fontSize: 8,
    fontWeight: '700',
  },

  // Empty State
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
  loadingCardsText: {
    fontSize: 15,
    marginTop: 16,
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
