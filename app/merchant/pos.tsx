/**
 * DisCard 2035 - Merchant Point of Sale Screen
 *
 * Allows merchants to:
 * - Set settlement currency (USDC, PYUSD, EURC, etc.)
 * - Enter amount to charge
 * - Add optional note/memo
 * - Enable customer tip option
 * - Generate QR code for customer to scan
 */

import { useState, useMemo, useCallback } from "react";
import {
  StyleSheet,
  View,
  Pressable,
  ScrollView,
  TextInput,
  Dimensions,
  Text,
  Share,
  Modal,
  KeyboardAvoidingView,
  Platform,
  Keyboard,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { Ionicons } from "@expo/vector-icons";
import Animated, { FadeIn, FadeInDown } from "react-native-reanimated";
import { LinearGradient } from "expo-linear-gradient";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import QRCode from "react-native-qrcode-svg";

import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { useThemeColor } from "@/hooks/use-theme-color";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { useAuth } from "@/stores/authConvex";
import { generateMerchantPaymentLinks } from "@/lib/transfer/payment-link";

const { width: SCREEN_WIDTH } = Dimensions.get("window");

// ============================================================================
// Types
// ============================================================================

interface SettlementToken {
  symbol: string;
  name: string;
  currencySymbol: string;
  decimals: number;
}

// Settlement tokens merchants can accept
const SETTLEMENT_TOKENS: SettlementToken[] = [
  { symbol: "USDC", name: "USD Coin", currencySymbol: "$", decimals: 6 },
  { symbol: "PYUSD", name: "PayPal USD", currencySymbol: "$", decimals: 6 },
  { symbol: "EURC", name: "Euro Coin", currencySymbol: "€", decimals: 6 },
  { symbol: "BRZ", name: "Brazilian Real", currencySymbol: "R$", decimals: 4 },
  { symbol: "MXNE", name: "Mexican Peso", currencySymbol: "$", decimals: 6 },
  { symbol: "VCHF", name: "Swiss Franc", currencySymbol: "CHF", decimals: 6 },
  { symbol: "VGBP", name: "British Pound", currencySymbol: "£", decimals: 6 },
];

type ScreenMode = "amount" | "qr";

// ============================================================================
// Numpad Component
// ============================================================================

interface NumpadProps {
  onPress: (key: string) => void;
  disabled?: boolean;
}

function Numpad({ onPress, disabled }: NumpadProps) {
  const mutedColor = "rgba(0,229,255,0.6)";
  const textColor = "#fff";

  const keys = [
    ["1", "2", "3"],
    ["4", "5", "6"],
    ["7", "8", "9"],
    [".", "0", "del"],
  ];

  const handlePress = (key: string) => {
    if (disabled) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onPress(key);
  };

  return (
    <View style={styles.numpad}>
      {keys.map((row, rowIndex) => (
        <View key={rowIndex} style={styles.numpadRow}>
          {row.map((key) => (
            <Pressable
              key={key}
              onPress={() => handlePress(key)}
              disabled={disabled}
              style={({ pressed }) => [
                styles.numpadKey,
                pressed && styles.numpadKeyPressed,
                disabled && styles.numpadKeyDisabled,
              ]}
            >
              {key === "del" ? (
                <Ionicons name="backspace-outline" size={28} color={mutedColor} />
              ) : (
                <Text style={[styles.numpadKeyText, { color: textColor }]}>{key}</Text>
              )}
            </Pressable>
          ))}
        </View>
      ))}
    </View>
  );
}

// ============================================================================
// Settlement Token Selector
// ============================================================================

interface TokenSelectorProps {
  selectedToken: SettlementToken;
  onSelect: (token: SettlementToken) => void;
  visible: boolean;
  onClose: () => void;
}

function TokenSelector({ selectedToken, onSelect, visible, onClose }: TokenSelectorProps) {
  const primaryColor = useThemeColor({}, "tint");
  const mutedColor = useThemeColor({ light: "#687076", dark: "#9BA1A6" }, "icon");
  const bgColor = useThemeColor({ light: "#fff", dark: "#000" }, "background");
  const cardBg = useThemeColor({ light: "#f8f9fa", dark: "#1c1c1e" }, "background");

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.modalOverlay} onPress={onClose}>
        <Animated.View
          entering={FadeInDown.springify().damping(20)}
          style={[styles.tokenModal, { backgroundColor: bgColor }]}
        >
          <View style={styles.tokenModalHeader}>
            <ThemedText style={styles.tokenModalTitle}>Settlement Currency</ThemedText>
            <Pressable onPress={onClose} style={styles.tokenModalClose}>
              <Ionicons name="close" size={24} color={mutedColor} />
            </Pressable>
          </View>
          <ThemedText style={[styles.tokenModalSubtitle, { color: mutedColor }]}>
            Currency you'll receive from customers
          </ThemedText>
          <ScrollView style={styles.tokenList} showsVerticalScrollIndicator={false}>
            {SETTLEMENT_TOKENS.map((token) => {
              const isSelected = token.symbol === selectedToken.symbol;
              return (
                <Pressable
                  key={token.symbol}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                    onSelect(token);
                    onClose();
                  }}
                  style={({ pressed }) => [
                    styles.tokenItem,
                    { backgroundColor: isSelected ? `${primaryColor}15` : cardBg },
                    isSelected && { borderColor: primaryColor, borderWidth: 1.5 },
                    pressed && styles.pressed,
                  ]}
                >
                  <View style={styles.tokenItemLeft}>
                    <View style={[styles.tokenIcon, { backgroundColor: `${primaryColor}20` }]}>
                      <ThemedText style={[styles.tokenIconText, { color: primaryColor }]}>
                        {token.currencySymbol}
                      </ThemedText>
                    </View>
                    <View>
                      <ThemedText style={styles.tokenItemSymbol}>{token.symbol}</ThemedText>
                      <ThemedText style={[styles.tokenItemName, { color: mutedColor }]}>
                        {token.name}
                      </ThemedText>
                    </View>
                  </View>
                  {isSelected && (
                    <Ionicons name="checkmark-circle" size={24} color={primaryColor} />
                  )}
                </Pressable>
              );
            })}
          </ScrollView>
        </Animated.View>
      </Pressable>
    </Modal>
  );
}

// ============================================================================
// Main Component
// ============================================================================

export default function MerchantPosScreen() {
  const insets = useSafeAreaInsets();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";

  const primaryColor = useThemeColor({}, "tint");
  const mutedColor = useThemeColor({ light: "#687076", dark: "#9BA1A6" }, "icon");
  const textColor = useThemeColor({}, "text");
  const bgColor = isDark ? "#000" : "#fff";
  const cardBg = useThemeColor({ light: "#f8f9fa", dark: "#1c1c1e" }, "background");

  // Auth
  const { user } = useAuth();
  const walletAddress = user?.solanaAddress || null;
  const merchantName = user?.displayName || "Merchant";

  // State
  const [mode, setMode] = useState<ScreenMode>("amount");
  const [amount, setAmount] = useState("0");
  const [selectedToken, setSelectedToken] = useState<SettlementToken>(SETTLEMENT_TOKENS[0]);
  const [memo, setMemo] = useState("");
  const [tipEnabled, setTipEnabled] = useState(false);
  const [showTokenSelector, setShowTokenSelector] = useState(false);
  const [taxRate, setTaxRate] = useState("0"); // Tax percentage (e.g., "8.25" for 8.25%)
  const [showTaxPicker, setShowTaxPicker] = useState(false);
  const [customTaxInput, setCustomTaxInput] = useState(""); // Separate state for custom input field

  // Common tax rate presets by region
  const TAX_PRESETS = [
    { label: "No Tax", rate: "0" },
    { label: "5%", rate: "5" },
    { label: "6%", rate: "6" },
    { label: "7%", rate: "7" },
    { label: "7.25%", rate: "7.25" },
    { label: "8%", rate: "8" },
    { label: "8.25%", rate: "8.25" },
    { label: "8.875%", rate: "8.875" },
    { label: "9%", rate: "9" },
    { label: "10%", rate: "10" },
    { label: "10.25%", rate: "10.25" },
    { label: "Custom", rate: "custom" },
  ];

  // Calculate tax and total
  const taxCalculations = useMemo(() => {
    const subtotal = parseFloat(amount) || 0;
    const taxPercent = parseFloat(taxRate) || 0;
    const taxAmount = subtotal * (taxPercent / 100);
    const total = subtotal + taxAmount;
    return {
      subtotal,
      taxPercent,
      taxAmount: Math.round(taxAmount * 100) / 100,
      total: Math.round(total * 100) / 100,
    };
  }, [amount, taxRate]);

  // Generate QR data (uses total with tax)
  const qrData = useMemo(() => {
    if (!walletAddress || taxCalculations.total <= 0) return null;

    try {
      const links = generateMerchantPaymentLinks({
        merchantAddress: walletAddress,
        amount: taxCalculations.total,
        settlementToken: selectedToken.symbol,
        merchantName: merchantName,
        memo: memo || undefined,
      });
      return links;
    } catch (err) {
      console.error("Failed to generate QR:", err);
      return null;
    }
  }, [walletAddress, taxCalculations.total, selectedToken, merchantName, memo]);

  // Numpad handler
  const handleNumpadPress = useCallback((key: string) => {
    setAmount((prev) => {
      if (key === "del") {
        if (prev.length <= 1) return "0";
        return prev.slice(0, -1);
      }
      if (key === ".") {
        if (prev.includes(".")) return prev;
        return prev + ".";
      }
      // Limit decimal places
      if (prev.includes(".")) {
        const [, decimal] = prev.split(".");
        if (decimal && decimal.length >= 2) return prev;
      }
      // Remove leading zero
      if (prev === "0" && key !== ".") return key;
      // Limit total length
      if (prev.length >= 10) return prev;
      return prev + key;
    });
  }, []);

  // Generate QR
  const handleGenerateQR = useCallback(() => {
    if (taxCalculations.total <= 0) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      return;
    }
    if (!walletAddress) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setMode("qr");
  }, [taxCalculations.total, walletAddress]);

  // Share QR
  const handleShare = useCallback(async () => {
    if (!qrData) return;
    try {
      const taxInfo = taxCalculations.taxPercent > 0
        ? `\nSubtotal: ${selectedToken.currencySymbol}${taxCalculations.subtotal.toFixed(2)}\nTax (${taxCalculations.taxPercent}%): ${selectedToken.currencySymbol}${taxCalculations.taxAmount.toFixed(2)}\n`
        : "";
      await Share.share({
        message: `Pay ${selectedToken.currencySymbol}${taxCalculations.total.toFixed(2)} ${selectedToken.symbol} to ${merchantName}${taxInfo}\n${qrData.discardMerchantUri}`,
        title: "Payment Request",
      });
    } catch (err) {
      console.error("Share failed:", err);
    }
  }, [qrData, taxCalculations, selectedToken, merchantName]);

  // Reset
  const handleNewPayment = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setAmount("0");
    setMemo("");
    setMode("amount");
  }, []);

  // ============================================================================
  // RENDER: Amount Entry Mode
  // ============================================================================

  const renderAmountMode = () => (
    <LinearGradient
      colors={["#1a1a2e", "#16213e", "#0f3460"]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={styles.mainContainer}
    >
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <Pressable
          onPress={() => router.back()}
          style={({ pressed }) => [styles.backButton, pressed && styles.pressed]}
        >
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </Pressable>
        <ThemedText style={styles.headerTitle}>Point of Sale</ThemedText>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView
        style={styles.scrollContent}
        contentContainerStyle={[styles.scrollContentContainer, { paddingBottom: insets.bottom + 24 }]}
        showsVerticalScrollIndicator={false}
        bounces={true}
      >
        {/* Settlement Currency Selector */}
        <Pressable
          onPress={() => setShowTokenSelector(true)}
          style={({ pressed }) => [styles.currencySelector, pressed && styles.pressed]}
        >
          <View style={styles.currencySelectorLeft}>
            <View style={[styles.currencyIcon, { backgroundColor: "rgba(0,229,255,0.2)" }]}>
              <ThemedText style={styles.currencyIconText}>
                {selectedToken.currencySymbol}
              </ThemedText>
            </View>
            <View>
              <ThemedText style={styles.currencyLabel}>Settlement Currency</ThemedText>
              <ThemedText style={styles.currencyValue}>{selectedToken.symbol}</ThemedText>
            </View>
          </View>
          <Ionicons name="chevron-down" size={20} color="rgba(255,255,255,0.6)" />
        </Pressable>

        {/* Amount Display */}
        <View style={styles.amountContainer}>
          <View style={styles.amountRow}>
            <Text style={styles.amountCurrency}>{selectedToken.currencySymbol}</Text>
            <Text style={styles.amountValue}>{amount}</Text>
          </View>
          <ThemedText style={styles.amountLabel}>{selectedToken.symbol}</ThemedText>
        </View>

        {/* Numpad */}
        <View style={styles.numpadContainer}>
          <Numpad onPress={handleNumpadPress} />
        </View>

        {/* Options */}
        <View style={styles.optionsContainer}>
        {/* Tax Rate Selector */}
        <Pressable
          onPress={() => setShowTaxPicker(true)}
          style={({ pressed }) => [
            styles.taxSelector,
            parseFloat(taxRate) > 0 && { backgroundColor: "rgba(0,229,255,0.1)", borderColor: "rgba(0,229,255,0.3)" },
            pressed && styles.pressed,
          ]}
        >
          <Ionicons
            name="receipt-outline"
            size={20}
            color={parseFloat(taxRate) > 0 ? primaryColor : "rgba(255,255,255,0.5)"}
          />
          <View style={styles.taxSelectorContent}>
            <ThemedText style={[styles.taxLabel, parseFloat(taxRate) > 0 && { color: primaryColor }]}>
              Sales Tax
            </ThemedText>
            {parseFloat(taxRate) > 0 && (
              <ThemedText style={[styles.taxPreview, { color: "rgba(255,255,255,0.5)" }]}>
                +{selectedToken.currencySymbol}{taxCalculations.taxAmount.toFixed(2)}
              </ThemedText>
            )}
          </View>
          <ThemedText style={[styles.taxValue, parseFloat(taxRate) > 0 && { color: primaryColor }]}>
            {parseFloat(taxRate) > 0 ? `${taxRate}%` : "None"}
          </ThemedText>
          <Ionicons name="chevron-forward" size={18} color="rgba(255,255,255,0.4)" />
        </Pressable>

        {/* Note Input */}
        <View style={styles.noteContainer}>
          <Ionicons name="document-text-outline" size={20} color="rgba(255,255,255,0.5)" />
          <TextInput
            style={styles.noteInput}
            placeholder="Add note (optional)"
            placeholderTextColor="rgba(255,255,255,0.4)"
            value={memo}
            onChangeText={setMemo}
            maxLength={100}
          />
        </View>

        {/* Tip Toggle */}
        <Pressable
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            setTipEnabled(!tipEnabled);
          }}
          style={[
            styles.tipToggle,
            tipEnabled && { backgroundColor: "rgba(0,229,255,0.2)", borderColor: primaryColor },
          ]}
        >
          <Ionicons
            name={tipEnabled ? "heart" : "heart-outline"}
            size={20}
            color={tipEnabled ? primaryColor : "rgba(255,255,255,0.5)"}
          />
          <ThemedText style={[styles.tipToggleText, tipEnabled && { color: primaryColor }]}>
            Allow Tips
          </ThemedText>
          <View
            style={[
              styles.tipToggleSwitch,
              { backgroundColor: tipEnabled ? primaryColor : "rgba(255,255,255,0.2)" },
            ]}
          >
            <View
              style={[
                styles.tipToggleKnob,
                tipEnabled && { transform: [{ translateX: 16 }] },
              ]}
            />
          </View>
        </Pressable>

        {/* Total with Tax Preview */}
        {parseFloat(taxRate) > 0 && taxCalculations.subtotal > 0 && (
          <Animated.View entering={FadeIn.duration(200)} style={styles.totalPreview}>
            <View style={styles.totalPreviewRow}>
              <ThemedText style={styles.totalPreviewLabel}>Subtotal</ThemedText>
              <ThemedText style={styles.totalPreviewValue}>
                {selectedToken.currencySymbol}{taxCalculations.subtotal.toFixed(2)}
              </ThemedText>
            </View>
            <View style={styles.totalPreviewRow}>
              <ThemedText style={styles.totalPreviewLabel}>Tax ({taxRate}%)</ThemedText>
              <ThemedText style={styles.totalPreviewValue}>
                {selectedToken.currencySymbol}{taxCalculations.taxAmount.toFixed(2)}
              </ThemedText>
            </View>
            <View style={[styles.totalPreviewRow, styles.totalPreviewTotal]}>
              <ThemedText style={styles.totalPreviewTotalLabel}>Total</ThemedText>
              <ThemedText style={styles.totalPreviewTotalValue}>
                {selectedToken.currencySymbol}{taxCalculations.total.toFixed(2)}
              </ThemedText>
            </View>
          </Animated.View>
        )}
      </View>

        {/* Generate QR Button */}
        <View style={styles.bottomButtons}>
          <Pressable
            onPress={handleGenerateQR}
            disabled={taxCalculations.total <= 0}
            style={({ pressed }) => [
              styles.generateButton,
              pressed && styles.pressed,
              taxCalculations.total <= 0 && styles.buttonDisabled,
            ]}
          >
            <LinearGradient
              colors={["#00E5FF", "#7B61FF"]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.generateButtonGradient}
            >
              <Ionicons name="qr-code" size={22} color="#000" />
              <Text style={styles.generateButtonText}>Generate QR Code</Text>
            </LinearGradient>
          </Pressable>
        </View>
      </ScrollView>

      {/* Token Selector Modal */}
      <TokenSelector
        selectedToken={selectedToken}
        onSelect={setSelectedToken}
        visible={showTokenSelector}
        onClose={() => setShowTokenSelector(false)}
      />

      {/* Tax Rate Picker Modal */}
      <Modal visible={showTaxPicker} transparent animationType="fade" onRequestClose={() => setShowTaxPicker(false)}>
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={styles.modalOverlay}
        >
          <Pressable style={styles.modalOverlayPressable} onPress={() => setShowTaxPicker(false)}>
            <Pressable onPress={(e) => e.stopPropagation()}>
              <Animated.View
                entering={FadeInDown.springify().damping(20)}
                style={[styles.taxModal, { backgroundColor: bgColor }]}
              >
                <View style={styles.taxModalHeader}>
                  <ThemedText style={styles.taxModalTitle}>Sales Tax Rate</ThemedText>
                  <Pressable onPress={() => setShowTaxPicker(false)} style={styles.tokenModalClose}>
                    <Ionicons name="close" size={24} color={mutedColor} />
                  </Pressable>
                </View>

                {/* Custom Tax Input - at top for visibility */}
                <View style={[styles.customTaxContainer, { backgroundColor: cardBg }]}>
                  <ThemedText style={[styles.customTaxLabel, { color: mutedColor }]}>
                    Custom Rate
                  </ThemedText>
                  <View style={styles.customTaxInputRow}>
                    <TextInput
                      style={[styles.customTaxInput, { color: textColor }]}
                      placeholder="0.00"
                      placeholderTextColor={mutedColor}
                      keyboardType="decimal-pad"
                      value={customTaxInput}
                      onChangeText={(text) => {
                        // Only allow valid decimal numbers
                        const cleaned = text.replace(/[^0-9.]/g, "");
                        const parts = cleaned.split(".");
                        if (parts.length > 2) return;
                        if (parts[1]?.length > 3) return;
                        if (parseFloat(cleaned) > 30) return; // Max 30% tax
                        setCustomTaxInput(cleaned);
                        setTaxRate(cleaned || "0");
                      }}
                      maxLength={6}
                      returnKeyType="done"
                      onSubmitEditing={() => {
                        Keyboard.dismiss();
                        setShowTaxPicker(false);
                      }}
                    />
                    <ThemedText style={[styles.customTaxPercent, { color: mutedColor }]}>%</ThemedText>
                    <Pressable
                      onPress={() => {
                        Keyboard.dismiss();
                        setShowTaxPicker(false);
                      }}
                      style={[styles.customTaxDoneButton, { backgroundColor: primaryColor }]}
                    >
                      <ThemedText style={styles.customTaxDoneText}>Done</ThemedText>
                    </Pressable>
                  </View>
                </View>

                <ThemedText style={[styles.taxModalSubtitle, { color: mutedColor }]}>
                  Or select a preset rate
                </ThemedText>

                {/* Preset Tax Rates */}
                <View style={styles.taxPresetsGrid}>
                  {TAX_PRESETS.filter(p => p.rate !== "custom").map((preset) => {
                    const isSelected = taxRate === preset.rate && customTaxInput === "";
                    return (
                      <Pressable
                        key={preset.rate}
                        onPress={() => {
                          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                          setTaxRate(preset.rate);
                          setCustomTaxInput(""); // Clear custom input when preset selected
                          setShowTaxPicker(false);
                        }}
                        style={[
                          styles.taxPresetButton,
                          { backgroundColor: isSelected ? `${primaryColor}20` : cardBg },
                          isSelected && { borderColor: primaryColor, borderWidth: 1.5 },
                        ]}
                      >
                        <ThemedText style={[styles.taxPresetText, isSelected && { color: primaryColor }]}>
                          {preset.label}
                        </ThemedText>
                      </Pressable>
                    );
                  })}
                </View>
              </Animated.View>
            </Pressable>
          </Pressable>
        </KeyboardAvoidingView>
      </Modal>
    </LinearGradient>
  );

  // ============================================================================
  // RENDER: QR Code Mode
  // ============================================================================

  const renderQRMode = () => (
    <View style={[styles.qrContainer, { backgroundColor: bgColor }]}>
      {/* Header */}
      <View style={[styles.qrHeader, { paddingTop: insets.top + 8 }]}>
        <Pressable
          onPress={handleNewPayment}
          style={({ pressed }) => [styles.backButton, pressed && styles.pressed]}
        >
          <Ionicons name="arrow-back" size={24} color={textColor} />
        </Pressable>
        <ThemedText style={[styles.headerTitle, { color: textColor }]}>
          Scan to Pay
        </ThemedText>
        <Pressable
          onPress={handleShare}
          style={({ pressed }) => [styles.shareButton, pressed && styles.pressed]}
        >
          <Ionicons name="share-outline" size={24} color={primaryColor} />
        </Pressable>
      </View>

      {/* QR Code Display */}
      <View style={styles.qrContent}>
        <Animated.View entering={FadeIn.duration(300)} style={styles.merchantInfo}>
          <ThemedText style={styles.merchantName}>{merchantName}</ThemedText>
          <ThemedText style={[styles.merchantAddress, { color: mutedColor }]}>
            {walletAddress ? `${walletAddress.slice(0, 6)}...${walletAddress.slice(-4)}` : ""}
          </ThemedText>
        </Animated.View>

        <Animated.View
          entering={FadeInDown.delay(100).duration(400)}
          style={styles.qrCodeWrapper}
        >
          {qrData ? (
            <QRCode
              value={qrData.qrData}
              size={SCREEN_WIDTH - 120}
              backgroundColor="#fff"
              color="#000"
              logo={require("@/assets/icon.png")}
              logoSize={50}
              logoBackgroundColor="#fff"
              logoBorderRadius={12}
            />
          ) : (
            <View style={styles.qrPlaceholder}>
              <Ionicons name="qr-code" size={100} color={mutedColor} />
            </View>
          )}
        </Animated.View>

        {/* Amount Display */}
        <Animated.View entering={FadeInDown.delay(200).duration(400)} style={styles.qrAmountCard}>
          {taxCalculations.taxPercent > 0 ? (
            <>
              <View style={styles.qrBreakdownRow}>
                <ThemedText style={[styles.qrBreakdownLabel, { color: mutedColor }]}>Subtotal</ThemedText>
                <ThemedText style={[styles.qrBreakdownValue, { color: mutedColor }]}>
                  {selectedToken.currencySymbol}{taxCalculations.subtotal.toFixed(2)}
                </ThemedText>
              </View>
              <View style={styles.qrBreakdownRow}>
                <ThemedText style={[styles.qrBreakdownLabel, { color: mutedColor }]}>
                  Tax ({taxCalculations.taxPercent}%)
                </ThemedText>
                <ThemedText style={[styles.qrBreakdownValue, { color: mutedColor }]}>
                  {selectedToken.currencySymbol}{taxCalculations.taxAmount.toFixed(2)}
                </ThemedText>
              </View>
              <View style={[styles.qrBreakdownRow, styles.qrTotalRow]}>
                <ThemedText style={styles.qrTotalLabel}>Total</ThemedText>
                <ThemedText style={styles.qrTotalValue}>
                  {selectedToken.currencySymbol}{taxCalculations.total.toFixed(2)} {selectedToken.symbol}
                </ThemedText>
              </View>
            </>
          ) : (
            <>
              <ThemedText style={[styles.qrAmountLabel, { color: mutedColor }]}>
                Amount Due
              </ThemedText>
              <ThemedText style={styles.qrAmountValue}>
                {selectedToken.currencySymbol}{taxCalculations.total.toFixed(2)} {selectedToken.symbol}
              </ThemedText>
            </>
          )}
          {memo && (
            <ThemedText style={[styles.qrMemo, { color: mutedColor }]}>
              {memo}
            </ThemedText>
          )}
          {tipEnabled && (
            <View style={[styles.tipBadge, { backgroundColor: `${primaryColor}15` }]}>
              <Ionicons name="heart" size={14} color={primaryColor} />
              <ThemedText style={[styles.tipBadgeText, { color: primaryColor }]}>
                Tips enabled
              </ThemedText>
            </View>
          )}
        </Animated.View>

        {/* Instructions */}
        <Animated.View
          entering={FadeInDown.delay(300).duration(400)}
          style={[styles.instructionsCard, { backgroundColor: cardBg }]}
        >
          <View style={styles.instructionRow}>
            <View style={[styles.instructionNumber, { backgroundColor: `${primaryColor}20` }]}>
              <ThemedText style={[styles.instructionNumberText, { color: primaryColor }]}>1</ThemedText>
            </View>
            <ThemedText style={[styles.instructionText, { color: mutedColor }]}>
              Customer opens DisCard app
            </ThemedText>
          </View>
          <View style={styles.instructionRow}>
            <View style={[styles.instructionNumber, { backgroundColor: `${primaryColor}20` }]}>
              <ThemedText style={[styles.instructionNumberText, { color: primaryColor }]}>2</ThemedText>
            </View>
            <ThemedText style={[styles.instructionText, { color: mutedColor }]}>
              Scans this QR code
            </ThemedText>
          </View>
          <View style={styles.instructionRow}>
            <View style={[styles.instructionNumber, { backgroundColor: `${primaryColor}20` }]}>
              <ThemedText style={[styles.instructionNumberText, { color: primaryColor }]}>3</ThemedText>
            </View>
            <ThemedText style={[styles.instructionText, { color: mutedColor }]}>
              Confirms payment (any stablecoin)
            </ThemedText>
          </View>
        </Animated.View>
      </View>

      {/* New Payment Button */}
      <View style={[styles.qrBottomButtons, { paddingBottom: insets.bottom + 16 }]}>
        <Pressable
          onPress={handleNewPayment}
          style={({ pressed }) => [
            styles.newPaymentButton,
            { borderColor: primaryColor },
            pressed && styles.pressed,
          ]}
        >
          <Ionicons name="add-circle-outline" size={22} color={primaryColor} />
          <ThemedText style={[styles.newPaymentButtonText, { color: primaryColor }]}>
            New Payment
          </ThemedText>
        </Pressable>
      </View>
    </View>
  );

  // ============================================================================
  // RENDER: Main
  // ============================================================================

  return (
    <ThemedView style={styles.container}>
      <StatusBar style={mode === "qr" ? (isDark ? "light" : "dark") : "light"} />
      {mode === "qr" ? renderQRMode() : renderAmountMode()}
    </ThemedView>
  );
}

// ============================================================================
// Styles
// ============================================================================

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  mainContainer: {
    flex: 1,
  },
  scrollContent: {
    flex: 1,
  },
  scrollContentContainer: {
    flexGrow: 1,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  backButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: "#fff",
    marginLeft: 8,
  },
  headerSpacer: {
    flex: 1,
  },
  currencySelector: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginHorizontal: 20,
    marginBottom: 20,
    padding: 14,
    borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },
  currencySelectorLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  currencyIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  currencyIconText: {
    fontSize: 18,
    fontWeight: "700",
    color: "#00E5FF",
  },
  currencyLabel: {
    fontSize: 12,
    color: "rgba(255,255,255,0.5)",
  },
  currencyValue: {
    fontSize: 17,
    fontWeight: "600",
    color: "#fff",
  },
  amountContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
  },
  amountRow: {
    flexDirection: "row",
    alignItems: "flex-start",
  },
  amountCurrency: {
    fontSize: 42,
    fontWeight: "700",
    color: "#00E5FF",
    marginRight: 4,
    marginTop: 8,
  },
  amountValue: {
    fontSize: 64,
    fontWeight: "700",
    color: "#fff",
  },
  amountLabel: {
    fontSize: 18,
    color: "rgba(255,255,255,0.5)",
    marginTop: 4,
  },
  numpadContainer: {
    paddingHorizontal: 24,
  },
  numpad: {
    gap: 8,
  },
  numpadRow: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 16,
  },
  numpadKey: {
    width: (SCREEN_WIDTH - 80) / 3,
    height: 60,
    borderRadius: 30,
    alignItems: "center",
    justifyContent: "center",
  },
  numpadKeyPressed: {
    backgroundColor: "rgba(0,229,255,0.2)",
  },
  numpadKeyDisabled: {
    opacity: 0.5,
  },
  numpadKeyText: {
    fontSize: 28,
    fontWeight: "400",
    color: "#fff",
  },
  optionsContainer: {
    paddingHorizontal: 20,
    paddingTop: 16,
    gap: 12,
  },
  noteContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  noteInput: {
    flex: 1,
    fontSize: 15,
    color: "#fff",
  },
  tipToggle: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  tipToggleText: {
    flex: 1,
    fontSize: 15,
    color: "rgba(255,255,255,0.7)",
  },
  tipToggleSwitch: {
    width: 44,
    height: 24,
    borderRadius: 12,
    padding: 2,
  },
  tipToggleKnob: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: "#fff",
  },
  bottomButtons: {
    paddingHorizontal: 20,
    paddingTop: 20,
  },
  generateButton: {
    borderRadius: 28,
    overflow: "hidden",
  },
  generateButtonGradient: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    height: 56,
    borderRadius: 28,
  },
  generateButtonText: {
    fontSize: 17,
    fontWeight: "600",
    color: "#000",
  },
  buttonDisabled: {
    opacity: 0.4,
  },
  pressed: {
    opacity: 0.8,
    transform: [{ scale: 0.98 }],
  },

  // Token Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "flex-end",
  },
  modalOverlayPressable: {
    flex: 1,
    justifyContent: "flex-end",
  },
  tokenModal: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: "70%",
    paddingBottom: 34,
  },
  tokenModalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 8,
  },
  tokenModalTitle: {
    fontSize: 20,
    fontWeight: "600",
  },
  tokenModalClose: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
  },
  tokenModalSubtitle: {
    fontSize: 14,
    paddingHorizontal: 20,
    marginBottom: 16,
  },
  tokenList: {
    paddingHorizontal: 16,
  },
  tokenItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 14,
    borderRadius: 14,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: "transparent",
  },
  tokenItemLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  tokenIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  tokenIconText: {
    fontSize: 16,
    fontWeight: "700",
  },
  tokenItemSymbol: {
    fontSize: 16,
    fontWeight: "600",
  },
  tokenItemName: {
    fontSize: 13,
    marginTop: 2,
  },

  // QR Mode
  qrContainer: {
    flex: 1,
  },
  qrHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  shareButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  qrContent: {
    flex: 1,
    alignItems: "center",
    paddingHorizontal: 24,
  },
  merchantInfo: {
    alignItems: "center",
    marginBottom: 20,
  },
  merchantName: {
    fontSize: 24,
    fontWeight: "700",
  },
  merchantAddress: {
    fontSize: 14,
    marginTop: 4,
  },
  qrCodeWrapper: {
    backgroundColor: "#fff",
    padding: 20,
    borderRadius: 24,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
  },
  qrPlaceholder: {
    width: SCREEN_WIDTH - 120,
    height: SCREEN_WIDTH - 120,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#f4f4f5",
    borderRadius: 16,
  },
  qrAmountCard: {
    alignItems: "center",
    marginTop: 24,
    paddingHorizontal: 32,
    paddingVertical: 16,
    borderRadius: 16,
  },
  qrAmountLabel: {
    fontSize: 13,
    marginBottom: 4,
  },
  qrAmountValue: {
    fontSize: 28,
    fontWeight: "700",
  },
  qrMemo: {
    fontSize: 14,
    marginTop: 8,
    textAlign: "center",
  },
  tipBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 12,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  tipBadgeText: {
    fontSize: 13,
    fontWeight: "500",
  },
  instructionsCard: {
    width: "100%",
    marginTop: 24,
    padding: 16,
    borderRadius: 16,
    gap: 12,
  },
  instructionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  instructionNumber: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  instructionNumberText: {
    fontSize: 14,
    fontWeight: "600",
  },
  instructionText: {
    fontSize: 14,
  },
  qrBottomButtons: {
    paddingHorizontal: 20,
    paddingTop: 16,
  },
  newPaymentButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    height: 52,
    borderRadius: 26,
    borderWidth: 2,
  },
  newPaymentButtonText: {
    fontSize: 16,
    fontWeight: "600",
  },

  // Tax Selector Styles
  taxSelector: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  taxSelectorContent: {
    flex: 1,
  },
  taxLabel: {
    fontSize: 15,
    color: "rgba(255,255,255,0.7)",
  },
  taxPreview: {
    fontSize: 12,
    marginTop: 2,
  },
  taxValue: {
    fontSize: 15,
    fontWeight: "600",
    color: "rgba(255,255,255,0.7)",
    marginRight: 4,
  },

  // Total Preview
  totalPreview: {
    backgroundColor: "rgba(0,229,255,0.08)",
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: "rgba(0,229,255,0.2)",
  },
  totalPreviewRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 4,
  },
  totalPreviewLabel: {
    fontSize: 14,
    color: "rgba(255,255,255,0.6)",
  },
  totalPreviewValue: {
    fontSize: 14,
    color: "rgba(255,255,255,0.8)",
  },
  totalPreviewTotal: {
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.1)",
    marginTop: 8,
    paddingTop: 10,
  },
  totalPreviewTotalLabel: {
    fontSize: 16,
    fontWeight: "600",
    color: "#00E5FF",
  },
  totalPreviewTotalValue: {
    fontSize: 16,
    fontWeight: "700",
    color: "#00E5FF",
  },

  // Tax Modal
  taxModal: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingBottom: 34,
  },
  taxModalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 8,
  },
  taxModalTitle: {
    fontSize: 20,
    fontWeight: "600",
  },
  taxModalSubtitle: {
    fontSize: 14,
    paddingHorizontal: 20,
    marginBottom: 16,
  },
  taxPresetsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    paddingHorizontal: 16,
    gap: 8,
  },
  taxPresetButton: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "transparent",
    minWidth: "30%",
    alignItems: "center",
  },
  taxPresetText: {
    fontSize: 15,
    fontWeight: "500",
  },
  customTaxContainer: {
    marginHorizontal: 16,
    marginTop: 16,
    padding: 16,
    borderRadius: 14,
  },
  customTaxLabel: {
    fontSize: 13,
    marginBottom: 8,
  },
  customTaxInputRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  customTaxInput: {
    flex: 1,
    fontSize: 24,
    fontWeight: "600",
    paddingVertical: 8,
  },
  customTaxPercent: {
    fontSize: 24,
    fontWeight: "600",
    marginRight: 12,
  },
  customTaxDoneButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  customTaxDoneText: {
    fontSize: 15,
    fontWeight: "600",
    color: "#000",
  },

  // QR Breakdown
  qrBreakdownRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    width: "100%",
    paddingVertical: 4,
  },
  qrBreakdownLabel: {
    fontSize: 14,
  },
  qrBreakdownValue: {
    fontSize: 14,
  },
  qrTotalRow: {
    borderTopWidth: 1,
    borderTopColor: "rgba(0,0,0,0.1)",
    marginTop: 8,
    paddingTop: 10,
  },
  qrTotalLabel: {
    fontSize: 16,
    fontWeight: "600",
  },
  qrTotalValue: {
    fontSize: 18,
    fontWeight: "700",
  },
});
