/**
 * DisCard 2035 - SourceTokenSelector Component
 *
 * Dropdown selector for choosing which token to pay with.
 * Shows user's stablecoin holdings and allows selection.
 */

import { useState, useCallback } from "react";
import {
  StyleSheet,
  View,
  Pressable,
  Modal,
  FlatList,
  Image,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Animated, { FadeIn, FadeOut, SlideInDown } from "react-native-reanimated";
import * as Haptics from "expo-haptics";

import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { useThemeColor } from "@/hooks/use-theme-color";

// ============================================================================
// Types
// ============================================================================

export interface TokenHolding {
  /** Token mint address */
  mint: string;
  /** Token symbol */
  symbol: string;
  /** Token name */
  name: string;
  /** Token decimals */
  decimals: number;
  /** User's balance (formatted) */
  balance: number;
  /** Balance in USD */
  balanceUsd: number;
  /** Token logo URI */
  logoUri?: string;
  /** Whether this matches settlement token (no swap needed) */
  isSettlementToken?: boolean;
}

export interface SourceTokenSelectorProps {
  /** Available tokens user can pay with */
  tokens: TokenHolding[];
  /** Currently selected token */
  selectedToken: TokenHolding | null;
  /** Callback when token is selected */
  onSelect: (token: TokenHolding) => void;
  /** Settlement token symbol (to highlight matching option) */
  settlementSymbol?: string;
  /** Whether selector is disabled */
  disabled?: boolean;
  /** Loading state */
  loading?: boolean;
}

// ============================================================================
// Main Component
// ============================================================================

export function SourceTokenSelector({
  tokens,
  selectedToken,
  onSelect,
  settlementSymbol,
  disabled = false,
  loading = false,
}: SourceTokenSelectorProps) {
  const [modalVisible, setModalVisible] = useState(false);

  const primaryColor = useThemeColor({}, "tint");
  const mutedColor = useThemeColor({ light: "#687076", dark: "#9BA1A6" }, "icon");
  const bgColor = useThemeColor({ light: "#fff", dark: "#000" }, "background");
  const cardBg = useThemeColor({ light: "#f8f9fa", dark: "#1c1c1e" }, "background");
  const borderColor = useThemeColor(
    { light: "rgba(0,0,0,0.1)", dark: "rgba(255,255,255,0.1)" },
    "background"
  );
  const successColor = useThemeColor({ light: "#4CAF50", dark: "#66BB6A" }, "text");

  const handleOpen = useCallback(() => {
    if (disabled || loading) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setModalVisible(true);
  }, [disabled, loading]);

  const handleSelect = useCallback(
    (token: TokenHolding) => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      onSelect(token);
      setModalVisible(false);
    },
    [onSelect]
  );

  const handleClose = useCallback(() => {
    setModalVisible(false);
  }, []);

  // Sort tokens: settlement token first, then by balance
  const sortedTokens = [...tokens].sort((a, b) => {
    if (a.symbol === settlementSymbol) return -1;
    if (b.symbol === settlementSymbol) return 1;
    return b.balanceUsd - a.balanceUsd;
  });

  return (
    <>
      {/* Selector Button */}
      <Pressable
        onPress={handleOpen}
        disabled={disabled || loading}
        style={({ pressed }) => [
          styles.selectorButton,
          { backgroundColor: cardBg, borderColor },
          pressed && styles.pressed,
          disabled && styles.disabled,
        ]}
      >
        {loading ? (
          <View style={styles.loadingContainer}>
            <ThemedText style={[styles.loadingText, { color: mutedColor }]}>
              Loading...
            </ThemedText>
          </View>
        ) : selectedToken ? (
          <>
            <View style={styles.tokenInfo}>
              {selectedToken.logoUri ? (
                <Image
                  source={{ uri: selectedToken.logoUri }}
                  style={styles.tokenLogo}
                />
              ) : (
                <View style={[styles.tokenLogoPlaceholder, { backgroundColor: primaryColor }]}>
                  <ThemedText style={styles.tokenLogoText}>
                    {selectedToken.symbol.charAt(0)}
                  </ThemedText>
                </View>
              )}
              <View style={styles.tokenDetails}>
                <ThemedText style={styles.tokenSymbol}>
                  {selectedToken.symbol}
                </ThemedText>
                <ThemedText style={[styles.tokenBalance, { color: mutedColor }]}>
                  Balance: {selectedToken.balance.toLocaleString(undefined, {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}
                </ThemedText>
              </View>
            </View>
            <Ionicons name="chevron-down" size={20} color={mutedColor} />
          </>
        ) : (
          <>
            <ThemedText style={[styles.placeholderText, { color: mutedColor }]}>
              Select token
            </ThemedText>
            <Ionicons name="chevron-down" size={20} color={mutedColor} />
          </>
        )}
      </Pressable>

      {/* Token Selection Modal */}
      <Modal
        visible={modalVisible}
        transparent
        animationType="fade"
        onRequestClose={handleClose}
      >
        <Pressable style={styles.modalOverlay} onPress={handleClose}>
          <Animated.View
            entering={SlideInDown.springify().damping(20)}
            style={[styles.modalContent, { backgroundColor: bgColor }]}
          >
            {/* Header */}
            <View style={styles.modalHeader}>
              <ThemedText style={styles.modalTitle}>Pay with</ThemedText>
              <Pressable
                onPress={handleClose}
                style={({ pressed }) => [styles.closeButton, pressed && styles.pressed]}
              >
                <Ionicons name="close" size={24} color={mutedColor} />
              </Pressable>
            </View>

            {/* Token List */}
            <FlatList
              data={sortedTokens}
              keyExtractor={(item) => item.mint}
              style={styles.tokenList}
              contentContainerStyle={styles.tokenListContent}
              showsVerticalScrollIndicator={false}
              renderItem={({ item }) => {
                const isSelected = selectedToken?.mint === item.mint;
                const isSettlement = item.symbol === settlementSymbol;

                return (
                  <Pressable
                    onPress={() => handleSelect(item)}
                    style={({ pressed }) => [
                      styles.tokenItem,
                      { borderColor },
                      isSelected && { borderColor: primaryColor, backgroundColor: `${primaryColor}10` },
                      pressed && styles.pressed,
                    ]}
                  >
                    <View style={styles.tokenItemLeft}>
                      {item.logoUri ? (
                        <Image
                          source={{ uri: item.logoUri }}
                          style={styles.tokenItemLogo}
                        />
                      ) : (
                        <View style={[styles.tokenLogoPlaceholder, { backgroundColor: primaryColor }]}>
                          <ThemedText style={styles.tokenLogoText}>
                            {item.symbol.charAt(0)}
                          </ThemedText>
                        </View>
                      )}
                      <View style={styles.tokenItemInfo}>
                        <View style={styles.tokenItemHeader}>
                          <ThemedText style={styles.tokenItemSymbol}>
                            {item.symbol}
                          </ThemedText>
                          {isSettlement && (
                            <View style={[styles.noSwapBadge, { backgroundColor: `${successColor}20` }]}>
                              <Ionicons name="checkmark" size={12} color={successColor} />
                              <ThemedText style={[styles.noSwapText, { color: successColor }]}>
                                No swap
                              </ThemedText>
                            </View>
                          )}
                        </View>
                        <ThemedText style={[styles.tokenItemName, { color: mutedColor }]}>
                          {item.name}
                        </ThemedText>
                      </View>
                    </View>

                    <View style={styles.tokenItemRight}>
                      <ThemedText style={styles.tokenItemBalance}>
                        {item.balance.toLocaleString(undefined, {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}
                      </ThemedText>
                      <ThemedText style={[styles.tokenItemUsd, { color: mutedColor }]}>
                        ${item.balanceUsd.toLocaleString(undefined, {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}
                      </ThemedText>
                    </View>

                    {isSelected && (
                      <Ionicons
                        name="checkmark-circle"
                        size={22}
                        color={primaryColor}
                        style={styles.checkIcon}
                      />
                    )}
                  </Pressable>
                );
              }}
              ListEmptyComponent={
                <View style={styles.emptyContainer}>
                  <Ionicons name="wallet-outline" size={48} color={mutedColor} />
                  <ThemedText style={[styles.emptyText, { color: mutedColor }]}>
                    No tokens available
                  </ThemedText>
                </View>
              }
            />
          </Animated.View>
        </Pressable>
      </Modal>
    </>
  );
}

// ============================================================================
// Styles
// ============================================================================

const styles = StyleSheet.create({
  selectorButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
  },
  pressed: {
    opacity: 0.7,
    transform: [{ scale: 0.98 }],
  },
  disabled: {
    opacity: 0.5,
  },
  loadingContainer: {
    flex: 1,
    alignItems: "center",
  },
  loadingText: {
    fontSize: 14,
  },
  tokenInfo: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },
  tokenLogo: {
    width: 36,
    height: 36,
    borderRadius: 18,
  },
  tokenLogoPlaceholder: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  tokenLogoText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "700",
  },
  tokenDetails: {
    marginLeft: 12,
  },
  tokenSymbol: {
    fontSize: 17,
    fontWeight: "600",
  },
  tokenBalance: {
    fontSize: 13,
    marginTop: 2,
  },
  placeholderText: {
    fontSize: 15,
  },
  // Modal styles
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "flex-end",
  },
  modalContent: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: "70%",
    paddingBottom: 34,
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(0,0,0,0.05)",
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "600",
  },
  closeButton: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 18,
  },
  tokenList: {
    flex: 1,
  },
  tokenListContent: {
    padding: 16,
    gap: 10,
  },
  tokenItem: {
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
    borderRadius: 14,
    borderWidth: 1.5,
  },
  tokenItemLeft: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },
  tokenItemLogo: {
    width: 40,
    height: 40,
    borderRadius: 20,
  },
  tokenItemInfo: {
    marginLeft: 12,
    flex: 1,
  },
  tokenItemHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  tokenItemSymbol: {
    fontSize: 16,
    fontWeight: "600",
  },
  tokenItemName: {
    fontSize: 13,
    marginTop: 2,
  },
  tokenItemRight: {
    alignItems: "flex-end",
    marginRight: 8,
  },
  tokenItemBalance: {
    fontSize: 15,
    fontWeight: "500",
  },
  tokenItemUsd: {
    fontSize: 12,
    marginTop: 2,
  },
  checkIcon: {
    marginLeft: 4,
  },
  noSwapBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  noSwapText: {
    fontSize: 10,
    fontWeight: "600",
  },
  emptyContainer: {
    alignItems: "center",
    paddingVertical: 40,
  },
  emptyText: {
    fontSize: 14,
    marginTop: 12,
  },
});

export default SourceTokenSelector;
