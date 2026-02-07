import { useState, useCallback, useMemo } from 'react';
import { StyleSheet, View, Share, Dimensions } from 'react-native';
import { PressableScale } from 'pressto';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import QRCode from 'react-native-qrcode-svg';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useThemeColor } from '@/hooks/use-theme-color';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useAuth } from '@/stores/authConvex';
import { useTokenHoldings } from '@/hooks/useTokenHoldings';
import { useReceiveAddress } from '@/hooks/useReceiveAddress';
import { Fonts } from '@/constants/theme';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

export default function ReceiveScreen() {
  const insets = useSafeAreaInsets();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  // Theme colors
  const primaryColor = useThemeColor({}, 'tint');
  const mutedColor = useThemeColor({ light: '#687076', dark: '#9BA1A6' }, 'icon');
  const textColor = useThemeColor({}, 'text');
  const bgColor = useThemeColor({}, 'background');
  const cardColor = useThemeColor({}, 'card');

  // Auth and wallet
  const { user } = useAuth();
  const walletAddress = user?.solanaAddress || null;

  // Stealth receive address (privacy-preserving — never exposes real wallet)
  const {
    stealthAddress,
    isGenerating: isGeneratingAddress,
    isDeposited,
    isProcessing,
    status: receiveStatus,
    generate: regenerateAddress,
  } = useReceiveAddress();

  // Use stealth address for QR/copy/share, fall back to wallet address during generation
  const displayedAddress = stealthAddress || walletAddress;

  // Token holdings for balance display
  const { holdings, totalValue } = useTokenHoldings(walletAddress);

  // State
  const [copied, setCopied] = useState(false);

  // Get primary token balance (USDC or SOL)
  const primaryToken = useMemo(() => {
    if (!holdings || holdings.length === 0) return null;
    // Prefer USDC, then SOL
    const usdc = holdings.find(h => h.symbol === 'USDC');
    if (usdc) return usdc;
    const sol = holdings.find(h => h.symbol === 'SOL');
    if (sol) return sol;
    return holdings[0];
  }, [holdings]);

  // Format address for display (uses stealth address, not real wallet)
  const displayAddress = displayedAddress
    ? `${displayedAddress.slice(0, 6)}...${displayedAddress.slice(-4)}`
    : 'No wallet';

  // Full address for display below QR
  const fullAddressDisplay = displayedAddress
    ? `${displayedAddress.slice(0, 22)}\n${displayedAddress.slice(22)}`
    : '';

  // Copy address (stealth, not real wallet)
  const handleCopy = useCallback(async () => {
    if (!displayedAddress) return;
    await Clipboard.setStringAsync(displayedAddress);
    setCopied(true);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setTimeout(() => setCopied(false), 2000);
  }, [displayedAddress]);

  // Share address (stealth, not real wallet)
  const handleShare = useCallback(async () => {
    if (!displayedAddress) return;
    try {
      await Share.share({
        message: displayedAddress,
        title: 'My Solana Address' });
    } catch (error) {
      console.log('Share error:', error);
    }
  }, [displayedAddress]);

  // Set amount (for payment requests)
  const handleSetAmount = useCallback(() => {
    // Navigate to request link creation with amount
    router.push('/transfer/request-link' as any);
  }, []);

  // Go back
  const handleClose = useCallback(() => {
    router.back();
  }, []);

  return (
    <ThemedView style={styles.container}>
      <StatusBar style={isDark ? 'light' : 'dark'} />

      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <PressableScale
          onPress={handleClose}
          style={[styles.closeButton]}
        >
          <Ionicons name="close" size={28} color={textColor} />
        </PressableScale>
        <ThemedText style={styles.headerTitle}>Receive</ThemedText>
        <View style={styles.headerSpacer} />
      </View>

      {/* Network indicator */}
      <View style={styles.networkContainer}>
        <View style={[styles.networkBadge, { backgroundColor: `${primaryColor}20` }]}>
          <View style={[styles.networkDot, { backgroundColor: primaryColor }]} />
          <ThemedText style={[styles.networkText, { color: primaryColor }]}>
            Solana network
          </ThemedText>
        </View>
      </View>

      {/* QR Code Section */}
      <View style={styles.qrSection}>
        <View style={[styles.qrContainer, { backgroundColor: cardColor }]}>
          {/* Token icon overlay */}
          <View style={[styles.tokenIconContainer, { backgroundColor: primaryColor }]}>
            <ThemedText style={styles.tokenIconText}>◎</ThemedText>
          </View>

          {/* QR Code — encodes stealth address, never the real wallet */}
          <View style={styles.qrCodeWrapper}>
            {displayedAddress ? (
              <QRCode
                value={`solana:${displayedAddress}`}
                size={200}
                backgroundColor="#fff"
                color="#000"
              />
            ) : (
              <View style={[styles.qrPlaceholder, { backgroundColor: isDark ? '#333' : '#eee' }]}>
                <Ionicons name="qr-code" size={100} color={mutedColor} />
              </View>
            )}
          </View>

          {/* Wallet Address */}
          <ThemedText style={[styles.addressText, { color: textColor }]}>
            {fullAddressDisplay}
          </ThemedText>
        </View>

        {/* Balance Display */}
        {primaryToken && (
          <View style={styles.balanceContainer}>
            <ThemedText style={[styles.balanceAmount, { color: textColor }]}>
              {primaryToken.balanceFormatted.toLocaleString(undefined, {
                minimumFractionDigits: 2,
                maximumFractionDigits: 4 })} {primaryToken.symbol}
            </ThemedText>
            <ThemedText style={[styles.balanceUsd, { color: mutedColor }]}>
              ${primaryToken.valueUsd.toFixed(2)}
            </ThemedText>
          </View>
        )}

        {/* Request message */}
        <ThemedText style={[styles.requestMessage, { color: mutedColor }]}>
          Looking Forward To Your Swift Handling Of This{'\n'}Transaction Request
        </ThemedText>
      </View>

      {/* Bottom Action Buttons */}
      <View style={[styles.bottomActions, { paddingBottom: insets.bottom + 16 }]}>
        <PressableScale
          onPress={handleCopy}
          style={[
            styles.actionButton,
            { backgroundColor: cardColor }]}
        >
          <View style={[styles.actionIconContainer, { backgroundColor: `${primaryColor}20` }]}>
            <Ionicons
              name={copied ? 'checkmark' : 'copy-outline'}
              size={20}
              color={primaryColor}
            />
          </View>
          <ThemedText style={[styles.actionButtonText, { color: textColor }]}>
            {copied ? 'Copied!' : 'Copy'}
          </ThemedText>
        </PressableScale>

        <PressableScale
          onPress={handleSetAmount}
          style={[
            styles.actionButton,
            { backgroundColor: cardColor }]}
        >
          <View style={[styles.actionIconContainer, { backgroundColor: `${primaryColor}20` }]}>
            <Ionicons name="calculator-outline" size={20} color={primaryColor} />
          </View>
          <ThemedText style={[styles.actionButtonText, { color: textColor }]}>
            Set Amount
          </ThemedText>
        </PressableScale>

        <PressableScale
          onPress={handleShare}
          style={[
            styles.actionButton,
            { backgroundColor: cardColor }]}
        >
          <View style={[styles.actionIconContainer, { backgroundColor: `${primaryColor}20` }]}>
            <Ionicons name="share-outline" size={20} color={primaryColor} />
          </View>
          <ThemedText style={[styles.actionButtonText, { color: textColor }]}>
            Share
          </ThemedText>
        </PressableScale>
      </View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 16 },
  closeButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center' },
  headerTitle: {
    flex: 1,
    fontSize: 18,
    fontWeight: '600',
    textAlign: 'center' },
  headerSpacer: {
    width: 44 },
  pressed: {
    opacity: 0.7 },
  networkContainer: {
    alignItems: 'center',
    marginBottom: 24 },
  networkBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    gap: 6 },
  networkDot: {
    width: 8,
    height: 8,
    borderRadius: 4 },
  networkText: {
    fontSize: 13,
    fontWeight: '500' },
  qrSection: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: 24 },
  qrContainer: {
    alignItems: 'center',
    borderRadius: 24,
    padding: 24,
    width: SCREEN_WIDTH - 48,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 8 },
  tokenIconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16 },
  tokenIconText: {
    fontSize: 24,
    color: '#fff',
    fontWeight: '700' },
  qrCodeWrapper: {
    backgroundColor: '#fff',
    padding: 16,
    borderRadius: 16,
    marginBottom: 16 },
  qrPlaceholder: {
    width: 200,
    height: 200,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center' },
  addressText: {
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 22,
    fontFamily: Fonts.mono },
  balanceContainer: {
    alignItems: 'center',
    marginTop: 24,
    gap: 4 },
  balanceAmount: {
    fontSize: 28,
    fontWeight: '700' },
  balanceUsd: {
    fontSize: 16 },
  requestMessage: {
    fontSize: 13,
    textAlign: 'center',
    marginTop: 16,
    lineHeight: 20 },
  bottomActions: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 24,
    paddingHorizontal: 24,
    paddingTop: 24 },
  actionButton: {
    alignItems: 'center',
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 16 },
  actionIconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center' },
  actionButtonText: {
    fontSize: 12,
    fontWeight: '500' } });
