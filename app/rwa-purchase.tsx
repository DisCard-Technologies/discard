/**
 * Private RWA Purchase Screen
 *
 * Buy gift cards, prepaid cards, and vouchers with privacy.
 * - Purchase amounts hidden on-chain
 * - Codes delivered to stealth addresses
 * - No link between identity and purchases
 */

import { useState, useCallback, useMemo, useEffect } from 'react';
import {
  StyleSheet,
  View,
  Pressable,
  TextInput,
  ScrollView,
  ActivityIndicator,
  Alert,
  Image,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useThemeColor } from '@/hooks/use-theme-color';
import { useAuth } from '@/stores/authConvex';
import { usePrivateRwa } from '@/hooks/usePrivateRwa';
import type { RwaProduct } from '@/services/privateRwaClient';

// Brand colors for visual appeal
const BRAND_COLORS: Record<string, string> = {
  Amazon: '#FF9900',
  Visa: '#1A1F71',
  Steam: '#1B2838',
  Uber: '#000000',
};

export default function RwaPurchaseScreen() {
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ productId?: string }>();

  // Theme
  const primaryColor = useThemeColor({}, 'tint');
  const mutedColor = useThemeColor({ light: '#687076', dark: '#9BA1A6' }, 'icon');
  const textColor = useThemeColor({}, 'text');
  const cardBg = useThemeColor({ light: '#f4f4f5', dark: '#1c1c1e' }, 'background');
  const borderColor = useThemeColor(
    { light: 'rgba(0,0,0,0.08)', dark: 'rgba(255,255,255,0.1)' },
    'background'
  );

  // Auth
  const { user } = useAuth();
  const walletAddress = user?.solanaAddress || undefined;

  // Private RWA hook
  const {
    state: rwaState,
    isLoading,
    catalog,
    redemptions,
    activeRedemptionsCount,
    selectProduct,
    getQuote,
    purchase,
    formatAmount,
    isAvailable,
  } = usePrivateRwa(walletAddress);

  // Local state
  const [selectedProduct, setSelectedProduct] = useState<RwaProduct | null>(null);
  const [selectedAmount, setSelectedAmount] = useState<number | null>(null);
  const [customAmount, setCustomAmount] = useState('');
  const [activeCategory, setActiveCategory] = useState<'all' | 'gift_card' | 'prepaid_card' | 'voucher'>('all');

  // Filter catalog
  const filteredCatalog = useMemo(() => {
    if (activeCategory === 'all') return catalog;
    return catalog.filter((p) => p.type === activeCategory);
  }, [catalog, activeCategory]);

  // Select product from params if provided
  useEffect(() => {
    if (params.productId && catalog.length > 0) {
      const product = catalog.find((p) => p.id === params.productId);
      if (product) {
        setSelectedProduct(product);
      }
    }
  }, [params.productId, catalog]);

  // Handle product selection
  const handleSelectProduct = useCallback((product: RwaProduct) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelectedProduct(product);
    setSelectedAmount(null);
    setCustomAmount('');
    selectProduct(product);
  }, [selectProduct]);

  // Handle amount selection
  const handleSelectAmount = useCallback((amount: number) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelectedAmount(amount);
    setCustomAmount('');
  }, []);

  // Handle custom amount
  const handleCustomAmountChange = useCallback((text: string) => {
    setCustomAmount(text);
    const parsed = parseFloat(text) * 100; // Convert to cents
    if (!isNaN(parsed) && parsed > 0) {
      setSelectedAmount(parsed);
    } else {
      setSelectedAmount(null);
    }
  }, []);

  // Calculate final amount with discount
  const finalAmount = useMemo(() => {
    if (!selectedProduct || !selectedAmount) return null;
    const discount = selectedProduct.discountPct
      ? Math.floor((selectedAmount * selectedProduct.discountPct) / 100)
      : 0;
    return selectedAmount - discount;
  }, [selectedProduct, selectedAmount]);

  // Handle purchase
  const handlePurchase = useCallback(async () => {
    if (!selectedProduct || !selectedAmount || !walletAddress) {
      return;
    }

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    try {
      // Get quote first
      const quote = await getQuote(selectedProduct.id, selectedAmount);
      if (!quote) {
        Alert.alert('Error', 'Failed to get quote. Please try again.');
        return;
      }

      // Execute purchase with mock private key (in production, from Turnkey)
      const mockPrivateKey = new Uint8Array(32);
      const result = await purchase(quote, mockPrivateKey);

      if (result?.success) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        Alert.alert(
          'Purchase Complete!',
          `Your ${selectedProduct.brand} ${selectedProduct.type === 'gift_card' ? 'gift card' : 'card'} is ready.\n\nCheck your Redemptions to view the code.`,
          [
            { text: 'View Redemptions', onPress: () => router.push('/redemptions') },
            { text: 'Done', onPress: () => router.back() },
          ]
        );
      } else {
        Alert.alert('Error', result?.error || 'Purchase failed. Please try again.');
      }
    } catch (error) {
      console.error('[RwaPurchase] Error:', error);
      Alert.alert('Error', 'Something went wrong. Please try again.');
    }
  }, [selectedProduct, selectedAmount, walletAddress, getQuote, purchase]);

  // Render category filters
  const renderCategoryFilters = () => (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.categoryFilters}
    >
      {(['all', 'gift_card', 'prepaid_card', 'voucher'] as const).map((cat) => {
        const isActive = activeCategory === cat;
        const labels: Record<string, string> = {
          all: 'All',
          gift_card: 'Gift Cards',
          prepaid_card: 'Prepaid',
          voucher: 'Vouchers',
        };

        return (
          <Pressable
            key={cat}
            onPress={() => setActiveCategory(cat)}
            style={[
              styles.categoryChip,
              {
                backgroundColor: isActive ? primaryColor : cardBg,
                borderColor: isActive ? primaryColor : borderColor,
              },
            ]}
          >
            <ThemedText
              style={[
                styles.categoryChipText,
                { color: isActive ? '#fff' : textColor },
              ]}
            >
              {labels[cat]}
            </ThemedText>
          </Pressable>
        );
      })}
    </ScrollView>
  );

  // Render product card
  const renderProductCard = (product: RwaProduct) => {
    const isSelected = selectedProduct?.id === product.id;
    const brandColor = BRAND_COLORS[product.brand] || primaryColor;

    return (
      <Pressable
        key={product.id}
        onPress={() => handleSelectProduct(product)}
        style={[
          styles.productCard,
          {
            backgroundColor: isSelected ? `${brandColor}15` : cardBg,
            borderColor: isSelected ? brandColor : borderColor,
          },
        ]}
      >
        <View style={[styles.productIcon, { backgroundColor: `${brandColor}20` }]}>
          <ThemedText style={[styles.productIconText, { color: brandColor }]}>
            {product.brand.charAt(0)}
          </ThemedText>
        </View>
        <View style={styles.productInfo}>
          <ThemedText style={styles.productBrand}>{product.brand}</ThemedText>
          <ThemedText style={[styles.productType, { color: mutedColor }]}>
            {product.type === 'gift_card' ? 'Gift Card' : product.type === 'prepaid_card' ? 'Prepaid Card' : 'Voucher'}
          </ThemedText>
        </View>
        {product.discountPct && product.discountPct > 0 && (
          <View style={[styles.discountBadge, { backgroundColor: '#22c55e' }]}>
            <ThemedText style={styles.discountText}>-{product.discountPct}%</ThemedText>
          </View>
        )}
        {isSelected && (
          <Ionicons name="checkmark-circle" size={24} color={brandColor} />
        )}
      </Pressable>
    );
  };

  // Render amount selector
  const renderAmountSelector = () => {
    if (!selectedProduct) return null;

    const brandColor = BRAND_COLORS[selectedProduct.brand] || primaryColor;

    return (
      <View style={styles.amountSection}>
        <ThemedText style={[styles.sectionTitle, { color: mutedColor }]}>
          SELECT AMOUNT
        </ThemedText>

        {/* Fixed denominations */}
        <View style={styles.amountGrid}>
          {selectedProduct.denominations.map((amount) => {
            const isSelected = selectedAmount === amount && customAmount === '';
            return (
              <Pressable
                key={amount}
                onPress={() => handleSelectAmount(amount)}
                style={[
                  styles.amountButton,
                  {
                    backgroundColor: isSelected ? `${brandColor}15` : cardBg,
                    borderColor: isSelected ? brandColor : borderColor,
                  },
                ]}
              >
                <ThemedText
                  style={[
                    styles.amountButtonText,
                    isSelected && { color: brandColor },
                  ]}
                >
                  {formatAmount(amount)}
                </ThemedText>
              </Pressable>
            );
          })}
        </View>

        {/* Custom amount (if variable) */}
        {selectedProduct.isVariable && (
          <View style={styles.customAmountContainer}>
            <ThemedText style={[styles.customAmountLabel, { color: mutedColor }]}>
              Or enter custom amount
            </ThemedText>
            <View style={[styles.customAmountInput, { backgroundColor: cardBg, borderColor }]}>
              <ThemedText style={[styles.currencySymbol, { color: mutedColor }]}>$</ThemedText>
              <TextInput
                style={[styles.customAmountField, { color: textColor }]}
                value={customAmount}
                onChangeText={handleCustomAmountChange}
                placeholder="0.00"
                placeholderTextColor={mutedColor}
                keyboardType="decimal-pad"
              />
            </View>
            {selectedProduct.minAmount && selectedProduct.maxAmount && (
              <ThemedText style={[styles.amountRange, { color: mutedColor }]}>
                Min: {formatAmount(selectedProduct.minAmount)} • Max: {formatAmount(selectedProduct.maxAmount)}
              </ThemedText>
            )}
          </View>
        )}
      </View>
    );
  };

  // Render order summary
  const renderOrderSummary = () => {
    if (!selectedProduct || !selectedAmount) return null;

    const brandColor = BRAND_COLORS[selectedProduct.brand] || primaryColor;
    const discount = selectedProduct.discountPct
      ? Math.floor((selectedAmount * selectedProduct.discountPct) / 100)
      : 0;

    return (
      <View style={[styles.summaryCard, { backgroundColor: cardBg, borderColor }]}>
        <ThemedText style={[styles.summaryTitle, { color: mutedColor }]}>
          ORDER SUMMARY
        </ThemedText>

        <View style={styles.summaryRow}>
          <ThemedText style={styles.summaryLabel}>{selectedProduct.brand} Card</ThemedText>
          <ThemedText style={styles.summaryValue}>{formatAmount(selectedAmount)}</ThemedText>
        </View>

        {discount > 0 && (
          <View style={styles.summaryRow}>
            <ThemedText style={[styles.summaryLabel, { color: '#22c55e' }]}>
              Discount ({selectedProduct.discountPct}%)
            </ThemedText>
            <ThemedText style={[styles.summaryValue, { color: '#22c55e' }]}>
              -{formatAmount(discount)}
            </ThemedText>
          </View>
        )}

        <View style={[styles.summaryDivider, { backgroundColor: borderColor }]} />

        <View style={styles.summaryRow}>
          <ThemedText style={styles.summaryLabelBold}>Total</ThemedText>
          <ThemedText style={[styles.summaryValueBold, { color: brandColor }]}>
            {formatAmount(finalAmount || 0)}
          </ThemedText>
        </View>

        {/* Privacy badge */}
        <View style={[styles.privacyBadge, { backgroundColor: 'rgba(34,197,94,0.1)' }]}>
          <Ionicons name="shield-checkmark" size={16} color="#22c55e" />
          <ThemedText style={[styles.privacyBadgeText, { color: '#22c55e' }]}>
            Private Purchase • Amount Hidden On-Chain
          </ThemedText>
        </View>
      </View>
    );
  };

  return (
    <ThemedView style={styles.container}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <Pressable onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={20} color={textColor} />
        </Pressable>
        <ThemedText style={styles.headerTitle}>Buy Gift Card</ThemedText>
        <Pressable
          onPress={() => router.push('/redemptions')}
          style={styles.redemptionsButton}
        >
          <Ionicons name="gift-outline" size={20} color={textColor} />
          {activeRedemptionsCount > 0 && (
            <View style={[styles.redemptionsBadge, { backgroundColor: primaryColor }]}>
              <ThemedText style={styles.redemptionsBadgeText}>
                {activeRedemptionsCount}
              </ThemedText>
            </View>
          )}
        </Pressable>
      </View>

      <ScrollView
        style={styles.content}
        contentContainerStyle={[styles.contentContainer, { paddingBottom: insets.bottom + 100 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Privacy Info */}
        {isAvailable && (
          <View style={[styles.privacyInfo, { backgroundColor: 'rgba(34,197,94,0.1)', borderColor: 'rgba(34,197,94,0.2)' }]}>
            <Ionicons name="eye-off" size={20} color="#22c55e" />
            <View style={styles.privacyInfoText}>
              <ThemedText style={[styles.privacyInfoTitle, { color: '#22c55e' }]}>
                Private Purchases Enabled
              </ThemedText>
              <ThemedText style={[styles.privacyInfoDesc, { color: mutedColor }]}>
                Your purchase amount and identity remain hidden
              </ThemedText>
            </View>
          </View>
        )}

        {/* Category Filters */}
        {renderCategoryFilters()}

        {/* Product List */}
        <View style={styles.section}>
          <ThemedText style={[styles.sectionTitle, { color: mutedColor }]}>
            AVAILABLE CARDS
          </ThemedText>
          {filteredCatalog.map(renderProductCard)}
        </View>

        {/* Amount Selector */}
        {renderAmountSelector()}

        {/* Order Summary */}
        {renderOrderSummary()}
      </ScrollView>

      {/* Purchase Button */}
      {selectedProduct && selectedAmount && (
        <View style={[styles.footer, { paddingBottom: insets.bottom + 16 }]}>
          <Pressable
            onPress={handlePurchase}
            disabled={isLoading || !finalAmount}
            style={[
              styles.purchaseButton,
              {
                backgroundColor: finalAmount
                  ? BRAND_COLORS[selectedProduct.brand] || primaryColor
                  : `${mutedColor}50`,
              },
            ]}
          >
            {isLoading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <Ionicons name="lock-closed" size={18} color="#fff" />
                <ThemedText style={styles.purchaseButtonText}>
                  Buy Privately • {formatAmount(finalAmount || 0)}
                </ThemedText>
              </>
            )}
          </Pressable>
          <ThemedText style={[styles.footerNote, { color: mutedColor }]}>
            Instant delivery to your encrypted vault
          </ThemedText>
        </View>
      )}
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
    paddingBottom: 12,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '600',
  },
  redemptionsButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  redemptionsBadge: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 16,
    height: 16,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  redemptionsBadgeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '600',
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    paddingHorizontal: 16,
  },
  privacyInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 16,
  },
  privacyInfoText: {
    flex: 1,
  },
  privacyInfoTitle: {
    fontSize: 14,
    fontWeight: '600',
  },
  privacyInfoDesc: {
    fontSize: 12,
    marginTop: 2,
  },
  categoryFilters: {
    gap: 8,
    paddingVertical: 8,
    marginBottom: 8,
  },
  categoryChip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
  },
  categoryChipText: {
    fontSize: 13,
    fontWeight: '500',
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 10,
    fontWeight: '500',
    letterSpacing: 1,
    marginBottom: 12,
  },
  productCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 10,
    gap: 12,
  },
  productIcon: {
    width: 48,
    height: 48,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  productIconText: {
    fontSize: 20,
    fontWeight: '700',
  },
  productInfo: {
    flex: 1,
  },
  productBrand: {
    fontSize: 16,
    fontWeight: '600',
  },
  productType: {
    fontSize: 12,
    marginTop: 2,
  },
  discountBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  discountText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '600',
  },
  amountSection: {
    marginBottom: 24,
  },
  amountGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  amountButton: {
    width: '31%',
    alignItems: 'center',
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1,
  },
  amountButtonText: {
    fontSize: 16,
    fontWeight: '600',
  },
  customAmountContainer: {
    marginTop: 16,
  },
  customAmountLabel: {
    fontSize: 12,
    marginBottom: 8,
  },
  customAmountInput: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 14,
  },
  currencySymbol: {
    fontSize: 20,
    fontWeight: '500',
  },
  customAmountField: {
    flex: 1,
    fontSize: 20,
    fontWeight: '500',
    paddingVertical: 14,
    marginLeft: 4,
  },
  amountRange: {
    fontSize: 11,
    marginTop: 8,
    textAlign: 'center',
  },
  summaryCard: {
    padding: 16,
    borderRadius: 14,
    borderWidth: 1,
  },
  summaryTitle: {
    fontSize: 10,
    fontWeight: '500',
    letterSpacing: 1,
    marginBottom: 12,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  summaryLabel: {
    fontSize: 14,
  },
  summaryValue: {
    fontSize: 14,
  },
  summaryLabelBold: {
    fontSize: 16,
    fontWeight: '600',
  },
  summaryValueBold: {
    fontSize: 18,
    fontWeight: '700',
  },
  summaryDivider: {
    height: 1,
    marginVertical: 12,
  },
  privacyBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 10,
    borderRadius: 8,
    marginTop: 12,
  },
  privacyBadgeText: {
    fontSize: 12,
    fontWeight: '500',
  },
  footer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 16,
    paddingTop: 16,
    backgroundColor: 'transparent',
  },
  purchaseButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 16,
    borderRadius: 14,
  },
  purchaseButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  footerNote: {
    fontSize: 12,
    textAlign: 'center',
    marginTop: 10,
  },
});
