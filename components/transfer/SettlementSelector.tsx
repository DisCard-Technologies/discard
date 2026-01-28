/**
 * DisCard 2035 - SettlementSelector Component
 *
 * Dropdown selector for choosing what currency the recipient receives.
 * Shows swap quote and estimated output when different from payment token.
 */

import { useState, useCallback } from "react";
import {
  StyleSheet,
  View,
  Modal,
  FlatList,
  ActivityIndicator,
} from "react-native";
import { PressableScale } from "pressto";
import { Ionicons } from "@expo/vector-icons";
import Animated, { FadeIn, FadeOut, SlideInDown } from "react-native-reanimated";

import { ThemedText } from "@/components/themed-text";
import { useThemeColor } from "@/hooks/use-theme-color";
import { useColorScheme } from "@/hooks/use-color-scheme";
import {
  type SettlementToken,
  formatSettlementAmount,
} from "@/lib/transfer/settlement-tokens";

// ============================================================================
// Types
// ============================================================================

export interface SettlementSelectorProps {
  /** Currently selected settlement token */
  selectedToken: SettlementToken;
  /** Available settlement tokens */
  availableTokens: SettlementToken[];
  /** Payment token mint (to show "same" indicator) */
  paymentMint?: string;
  /** Whether swap quote is loading */
  isLoadingQuote?: boolean;
  /** Estimated output amount (formatted) */
  estimatedOutput?: string;
  /** Quote error message */
  quoteError?: string | null;
  /** Whether a swap is needed */
  needsSwap?: boolean;
  /** Callback when token is selected */
  onSelect: (token: SettlementToken) => void;
  /** Disabled state */
  disabled?: boolean;
}

// ============================================================================
// Token Item Component
// ============================================================================

interface TokenItemProps {
  token: SettlementToken;
  isSelected: boolean;
  isSameAsPayment: boolean;
  onPress: () => void;
}

function TokenItem({ token, isSelected, isSameAsPayment, onPress }: TokenItemProps) {
  const primaryColor = useThemeColor({}, "tint");
  const mutedColor = useThemeColor({ light: "#687076", dark: "#9BA1A6" }, "icon");
  const textColor = useThemeColor({}, "text");
  const successColor = useThemeColor({ light: "#4CAF50", dark: "#66BB6A" }, "text");

  return (
    <PressableScale
      onPress={onPress}
      style={[
        styles.tokenItem,
        isSelected && styles.tokenItemSelected,
      ]}
    >
      <View style={styles.tokenInfo}>
        <View style={styles.tokenHeader}>
          <ThemedText style={styles.tokenSymbol}>{token.symbol}</ThemedText>
          {isSameAsPayment && (
            <View style={[styles.sameBadge, { backgroundColor: `${successColor}20` }]}>
              <ThemedText style={[styles.sameBadgeText, { color: successColor }]}>
                Same
              </ThemedText>
            </View>
          )}
        </View>
        <ThemedText style={[styles.tokenName, { color: mutedColor }]}>
          {token.name}
        </ThemedText>
      </View>
      <View style={styles.tokenRight}>
        {token.currencySymbol && (
          <ThemedText style={[styles.currencySymbol, { color: mutedColor }]}>
            {token.currencySymbol}
          </ThemedText>
        )}
        {isSelected && (
          <Ionicons name="checkmark-circle" size={22} color={primaryColor} />
        )}
      </View>
    </PressableScale>
  );
}

// ============================================================================
// Main Component
// ============================================================================

export function SettlementSelector({
  selectedToken,
  availableTokens,
  paymentMint,
  isLoadingQuote = false,
  estimatedOutput,
  quoteError,
  needsSwap = false,
  onSelect,
  disabled = false,
}: SettlementSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);

  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";

  const primaryColor = useThemeColor({}, "tint");
  const mutedColor = useThemeColor({ light: "#687076", dark: "#9BA1A6" }, "icon");
  const bgColor = useThemeColor({ light: "#fff", dark: "#1c1c1e" }, "background");
  const cardBg = useThemeColor({ light: "#f8f9fa", dark: "#2c2c2e" }, "background");
  const borderColor = useThemeColor(
    { light: "rgba(0,0,0,0.1)", dark: "rgba(255,255,255,0.15)" },
    "background"
  );
  const errorColor = useThemeColor({ light: "#F44336", dark: "#EF5350" }, "text");

  // Handle token selection
  const handleSelect = useCallback(
    (token: SettlementToken) => {
      onSelect(token);
      setIsOpen(false);
    },
    [onSelect]
  );

  // Check if token is same as payment
  const isSameAsPayment = (token: SettlementToken) => {
    return paymentMint === token.mint;
  };

  return (
    <View style={styles.container}>
      {/* Section Label */}
      <ThemedText style={[styles.label, { color: mutedColor }]}>
        RECIPIENT RECEIVES
      </ThemedText>

      {/* Selector Button */}
      <PressableScale
        onPress={() => !disabled && setIsOpen(true)}
        enabled={!disabled}
        style={[
          styles.selector,
          { backgroundColor: cardBg, borderColor },
          disabled && styles.disabled,
        ]}
      >
        <View style={styles.selectorContent}>
          <View style={styles.tokenPreview}>
            <ThemedText style={styles.selectedSymbol}>
              {selectedToken.symbol}
            </ThemedText>
            {!needsSwap && (
              <View style={[styles.sameBadgeSmall, { backgroundColor: `${primaryColor}15` }]}>
                <ThemedText style={[styles.sameBadgeTextSmall, { color: primaryColor }]}>
                  No swap
                </ThemedText>
              </View>
            )}
          </View>

          {/* Quote Info */}
          {needsSwap && (
            <View style={styles.quoteInfo}>
              {isLoadingQuote ? (
                <ActivityIndicator size="small" color={primaryColor} />
              ) : quoteError ? (
                <ThemedText style={[styles.quoteError, { color: errorColor }]}>
                  {quoteError}
                </ThemedText>
              ) : estimatedOutput ? (
                <ThemedText style={[styles.estimatedAmount, { color: primaryColor }]}>
                  ≈ {selectedToken.currencySymbol}{estimatedOutput}
                </ThemedText>
              ) : null}
            </View>
          )}
        </View>

        <Ionicons name="chevron-down" size={20} color={mutedColor} />
      </PressableScale>

      {/* Token Selection Modal */}
      <Modal
        visible={isOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setIsOpen(false)}
      >
        <PressableScale
          style={styles.overlay}
          onPress={() => setIsOpen(false)}
        >
          <Animated.View
              entering={SlideInDown.duration(300)}
              style={[styles.modal, { backgroundColor: bgColor }]}
            >
              {/* Header */}
              <View style={styles.modalHeader}>
                <ThemedText style={styles.modalTitle}>
                  Select Settlement Currency
                </ThemedText>
                <PressableScale
                  onPress={() => setIsOpen(false)}
                  style={styles.closeButton}
                >
                  <Ionicons name="close" size={24} color={mutedColor} />
                </PressableScale>
              </View>

              {/* Token List */}
              <FlatList
                data={availableTokens}
                keyExtractor={(item) => item.symbol}
                renderItem={({ item }) => (
                  <TokenItem
                    token={item}
                    isSelected={item.symbol === selectedToken.symbol}
                    isSameAsPayment={isSameAsPayment(item)}
                    onPress={() => handleSelect(item)}
                  />
                )}
                contentContainerStyle={styles.tokenList}
                showsVerticalScrollIndicator={false}
              />

              {/* Info Footer */}
              <View style={[styles.infoFooter, { borderTopColor: borderColor }]}>
                <Ionicons name="information-circle-outline" size={16} color={mutedColor} />
                <ThemedText style={[styles.infoText, { color: mutedColor }]}>
                  Swaps are powered by Jupiter. Rates may vary.
                </ThemedText>
              </View>
            </Animated.View>
        </PressableScale>
      </Modal>
    </View>
  );
}

// ============================================================================
// Styles
// ============================================================================

const styles = StyleSheet.create({
  container: {
    marginTop: 16,
  },
  label: {
    fontSize: 10,
    letterSpacing: 1.5,
    fontWeight: "600",
    marginBottom: 8,
  },
  selector: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
  },
  selectorContent: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginRight: 8,
  },
  tokenPreview: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  selectedSymbol: {
    fontSize: 16,
    fontWeight: "600",
  },
  sameBadgeSmall: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  sameBadgeTextSmall: {
    fontSize: 11,
    fontWeight: "500",
  },
  quoteInfo: {
    flexDirection: "row",
    alignItems: "center",
  },
  estimatedAmount: {
    fontSize: 15,
    fontWeight: "600",
  },
  quoteError: {
    fontSize: 12,
  },
  disabled: {
    opacity: 0.5,
  },
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "flex-end",
  },
  modal: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 20,
    paddingBottom: 40,
    maxHeight: "70%",
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "600",
  },
  closeButton: {
    padding: 4,
  },
  tokenList: {
    paddingHorizontal: 16,
  },
  tokenItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 14,
    borderRadius: 12,
    marginBottom: 8,
  },
  tokenItemSelected: {
    backgroundColor: "rgba(0,0,0,0.05)",
  },
  tokenInfo: {
    flex: 1,
  },
  tokenHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  tokenSymbol: {
    fontSize: 16,
    fontWeight: "600",
  },
  sameBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  sameBadgeText: {
    fontSize: 10,
    fontWeight: "600",
  },
  tokenName: {
    fontSize: 13,
    marginTop: 2,
  },
  tokenRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  currencySymbol: {
    fontSize: 14,
    fontWeight: "500",
  },
  infoFooter: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 20,
    paddingTop: 16,
    borderTopWidth: 1,
    marginTop: 8,
  },
  infoText: {
    fontSize: 12,
    flex: 1,
  },
});

export default SettlementSelector;
