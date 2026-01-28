import { useState, useMemo, useCallback, useRef } from 'react';
import { StyleSheet, View, ScrollView, TextInput, Keyboard, Alert, Text, ActivityIndicator, Dimensions, Image } from 'react-native';
import { PressableScale } from 'pressto';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeIn, FadeOut, useSharedValue, useAnimatedStyle, withTiming, withSpring } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import QRCode from 'react-native-qrcode-svg';

import { ThemedText } from '@/components/themed-text';

// expo-camera is optional - may not be available in Expo Go
type CameraViewType = React.ComponentType<any>;
type PermissionStatus = { granted: boolean; canAskAgain: boolean };

let CameraView: CameraViewType | null = null;
let useCameraPermissionsHook: (() => [PermissionStatus | null, () => Promise<PermissionStatus>]) | null = null;

try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const expoCamera = require('expo-camera');
  CameraView = expoCamera.CameraView;
  useCameraPermissionsHook = expoCamera.useCameraPermissions;
} catch {
  console.warn('[Transfer] expo-camera not available');
}

import { ThemedView } from '@/components/themed-view';
import { useThemeColor } from '@/hooks/use-theme-color';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useAuth } from '@/stores/authConvex';
import { useTokenHoldings } from '@/hooks/useTokenHoldings';
import { useContacts } from '@/hooks/useContacts';
import { useCrossCurrencyTransfer } from '@/hooks/useCrossCurrencyTransfer';
import { useFeeEstimate } from '@/hooks/useFeeEstimate';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// Fallback token logos for common tokens
const TOKEN_LOGO_FALLBACKS: Record<string, string> = {
  USDC: 'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v/logo.png',
  SOL: 'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/So11111111111111111111111111111111111111112/logo.png',
  USDT: 'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB/logo.png' };

type TransferMode = 'pay' | 'request' | 'qr';
type QRMode = 'scan' | 'mycode';

// Local contact type for display
interface LocalContact {
  id: string;
  name: string;
  handle: string;
  avatar: string;
  recent?: boolean;
  verified?: boolean;
}

// ============================================================================
// Numpad Component
// ============================================================================

interface NumpadProps {
  onPress: (key: string) => void;
  disabled?: boolean;
}

function Numpad({ onPress, disabled }: NumpadProps) {
  const keys = [
    ['1', '2', '3'],
    ['4', '5', '6'],
    ['7', '8', '9'],
    ['.', '0', 'del'],
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
            <PressableScale
              key={key}
              onPress={() => handlePress(key)}
              enabled={!disabled}
              style={[
                styles.numpadKey,
                disabled && styles.numpadKeyDisabled]}
            >
              {key === 'del' ? (
                <Ionicons name="backspace-outline" size={28} color="#1C1C1E" />
              ) : (
                <Text style={styles.numpadKeyText}>{key}</Text>
              )}
            </PressableScale>
          ))}
        </View>
      ))}
    </View>
  );
}

// ============================================================================
// Contact Selector
// ============================================================================

interface ContactSelectorProps {
  contacts: LocalContact[];
  favorites: LocalContact[];
  onSelect: (contact: LocalContact) => void;
  onAddNew: () => void;
}

function ContactSelector({ contacts, favorites, onSelect, onAddNew }: ContactSelectorProps) {
  const primaryColor = useThemeColor({}, 'tint');

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.contactsScrollContent}
    >
      {/* Add new contact button */}
      <PressableScale
        onPress={onAddNew}
        style={[styles.contactCircle]}
      >
        <View style={[styles.contactAvatar, styles.addContactAvatar]}>
          <Ionicons name="add" size={24} color="#6B7280" />
        </View>
        <Text style={styles.contactName} numberOfLines={1}>
          Get $15
        </Text>
      </PressableScale>

      {/* Favorites first, then recent */}
      {[...favorites, ...contacts.filter(c => !favorites.some(f => f.id === c.id))].slice(0, 10).map((contact) => (
        <PressableScale
          key={contact.id}
          onPress={() => onSelect(contact)}
          style={[styles.contactCircle]}
        >
          <View style={[styles.contactAvatar, { backgroundColor: primaryColor }]}>
            <Text style={styles.contactAvatarText}>{contact.avatar}</Text>
          </View>
          <Text style={styles.contactName} numberOfLines={1}>
            {contact.name.split(' ')[0]}
          </Text>
        </PressableScale>
      ))}
    </ScrollView>
  );
}

// ============================================================================
// Main Transfer Screen
// ============================================================================

export default function TransferScreen() {
  const insets = useSafeAreaInsets();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  // App primary color (teal/emerald)
  const primaryColor = useThemeColor({}, 'tint');
  const mutedColor = useThemeColor({ light: '#687076', dark: '#9BA1A6' }, 'icon');
  const textColor = useThemeColor({}, 'text');
  const bgColor = useThemeColor({}, 'background');
  const cardColor = useThemeColor({}, 'card');

  // Auth and wallet
  const { user } = useAuth();
  const walletAddress = user?.solanaAddress || null;

  // Token holdings
  const { holdings: tokenHoldings, isLoading: tokensLoading } = useTokenHoldings(walletAddress);

  // Contacts
  const {
    contacts: allContacts,
    favoriteContacts,
    createContact } = useContacts();

  // Transform contacts for UI
  const contactsList = useMemo(() => {
    return allContacts.map((c) => ({
      id: c.id,
      name: c.name,
      handle: c.identifier,
      avatar: c.avatarInitials,
      recent: c.lastUsedAt !== undefined,
      verified: c.verified }));
  }, [allContacts]);

  const favoritesList = useMemo(() => {
    return favoriteContacts.map((c) => ({
      id: c.id,
      name: c.name,
      handle: c.identifier,
      avatar: c.avatarInitials || c.name.slice(0, 2).toUpperCase(),
      recent: true,
      verified: c.verified }));
  }, [favoriteContacts]);

  // Transform token holdings with fallback logos
  const tokens = useMemo(() => {
    if (!tokenHoldings || tokenHoldings.length === 0) return [];
    return tokenHoldings.map(h => ({
      symbol: h.symbol,
      balance: h.balanceFormatted,
      valueUsd: h.valueUsd,
      mint: h.mint,
      decimals: h.decimals,
      logoUri: h.logoUri || TOKEN_LOGO_FALLBACKS[h.symbol] || null }));
  }, [tokenHoldings]);

  // State
  const [mode, setMode] = useState<TransferMode>('pay');
  const [qrMode, setQrMode] = useState<QRMode>('scan');
  const [amount, setAmount] = useState('0');
  const [selectedToken, setSelectedToken] = useState('USDC');
  const [selectedContact, setSelectedContact] = useState<LocalContact | null>(null);
  const [copied, setCopied] = useState(false);
  const [showTokenSelector, setShowTokenSelector] = useState(false);

  // Camera permissions for QR scan (conditional - may not be available in Expo Go)
  const cameraPermissions = useCameraPermissionsHook ? useCameraPermissionsHook() : null;
  const permission = cameraPermissions?.[0] ?? null;
  const requestPermission = cameraPermissions?.[1] ?? (async () => ({ granted: false, canAskAgain: false }));

  // Get selected token details
  const selectedPaymentToken = useMemo(() => {
    if (!tokenHoldings) return null;
    return tokenHoldings.find(h => h.symbol === selectedToken) || null;
  }, [tokenHoldings, selectedToken]);

  // Convert USD amount to token amount using price
  const tokenAmount = useMemo(() => {
    if (!amount || amount === '0' || !selectedPaymentToken) return undefined;
    const usdAmount = parseFloat(amount);
    if (isNaN(usdAmount) || usdAmount <= 0) return undefined;

    const price = selectedPaymentToken.priceUsd;
    if (!price || price <= 0) return undefined;

    // USD amount / token price = token amount
    return usdAmount / price;
  }, [amount, selectedPaymentToken]);

  // Cross-currency settlement - convert token amount to base units
  const paymentAmountBaseUnits = useMemo(() => {
    if (tokenAmount === undefined || !selectedPaymentToken) return undefined;
    // Token amount * 10^decimals = base units (lamports for SOL, micro-units for tokens)
    return Math.floor(tokenAmount * Math.pow(10, selectedPaymentToken.decimals)).toString();
  }, [tokenAmount, selectedPaymentToken]);

  const {
    settlementToken,
    needsSwap,
    isLoadingQuote,
    estimatedReceivedFormatted,
    setSettlementToken,
    availableTokens } = useCrossCurrencyTransfer({
    paymentMint: selectedPaymentToken?.mint,
    paymentAmount: paymentAmountBaseUnits,
    debounceMs: 500 });

  // Dynamic fee estimation
  const { fees: dynamicFees } = useFeeEstimate({
    amountUsd: amount !== '0' ? parseFloat(amount) : 0,
    includeAtaRent: false,
    enabled: true });

  // Format wallet address for display
  const displayAddress = walletAddress
    ? `${walletAddress.slice(0, 6)}...${walletAddress.slice(-4)}`
    : 'No wallet';

  // Numpad handler - always USD (2 decimal places)
  const handleNumpadPress = useCallback((key: string) => {
    setAmount(prev => {
      if (key === 'del') {
        if (prev.length <= 1) return '0';
        return prev.slice(0, -1);
      }
      if (key === '.') {
        if (prev.includes('.')) return prev;
        return prev + '.';
      }
      // Always limit to 2 decimal places (USD)
      if (prev.includes('.')) {
        const [, decimal] = prev.split('.');
        if (decimal && decimal.length >= 2) return prev;
      }
      // Remove leading zero unless it's a decimal
      if (prev === '0' && key !== '.') return key;
      // Limit total length
      if (prev.length >= 10) return prev;
      return prev + key;
    });
  }, []);

  // Navigate to confirmation
  const handlePay = useCallback(() => {
    if (amount === '0' || parseFloat(amount) <= 0) {
      Alert.alert('Enter Amount', 'Please enter an amount to send');
      return;
    }

    // Check if we can convert USD to token amount
    if (tokenAmount === undefined || !paymentAmountBaseUnits) {
      Alert.alert('Price Unavailable', `Unable to get price for ${selectedToken}. Please try again.`);
      return;
    }

    // If no contact selected, go to send screen for recipient selection
    if (!selectedContact) {
      (router.push as any)({
        pathname: '/transfer/send',
        params: {
          amount: JSON.stringify({
            amount: tokenAmount || 0, // Token amount (converted from USD)
            amountUsd: parseFloat(amount), // Original USD amount entered
            amountBaseUnits: paymentAmountBaseUnits || '0' }),
          token: JSON.stringify({
            symbol: selectedToken,
            mint: selectedPaymentToken?.mint || 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
            decimals: selectedPaymentToken?.decimals || 6,
            logoUri: selectedPaymentToken?.logoUri || TOKEN_LOGO_FALLBACKS[selectedToken] || null,
            balance: 0,
            balanceUsd: 0 }) } });
      return;
    }

    // Navigate to confirmation
    (router.push as any)({
      pathname: '/transfer/confirmation',
      params: {
        recipient: JSON.stringify({
          input: selectedContact.handle,
          address: selectedContact.handle,
          displayName: selectedContact.name,
          type: 'contact',
          contactId: selectedContact.id }),
        token: JSON.stringify({
          symbol: selectedToken,
          mint: selectedPaymentToken?.mint || 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
          decimals: selectedPaymentToken?.decimals || 6,
          logoUri: selectedPaymentToken?.logoUri || TOKEN_LOGO_FALLBACKS[selectedToken] || null,
          balance: 0,
          balanceUsd: 0 }),
        amount: JSON.stringify({
          amount: tokenAmount || 0, // Token amount (converted from USD)
          amountUsd: parseFloat(amount), // Original USD amount entered
          amountBaseUnits: paymentAmountBaseUnits || '0' }),
        fees: JSON.stringify({
          networkFee: dynamicFees.networkFee,
          networkFeeUsd: dynamicFees.networkFeeUsd,
          platformFee: dynamicFees.platformFee,
          priorityFee: dynamicFees.priorityFee,
          ataRent: dynamicFees.ataRent,
          totalFeesUsd: dynamicFees.totalFeesUsd,
          totalCostUsd: dynamicFees.totalCostUsd }),
        settlement: JSON.stringify({
          token: settlementToken.symbol,
          mint: settlementToken.mint,
          decimals: settlementToken.decimals,
          currencySymbol: settlementToken.currencySymbol,
          needsSwap,
          estimatedOutput: estimatedReceivedFormatted }) } });
  }, [amount, selectedContact, selectedToken, selectedPaymentToken, tokenAmount, paymentAmountBaseUnits, settlementToken, needsSwap, estimatedReceivedFormatted, dynamicFees]);

  // Request payment
  const handleRequest = useCallback(() => {
    if (amount === '0' || parseFloat(amount) <= 0) {
      Alert.alert('Enter Amount', 'Please enter an amount to request');
      return;
    }
    (router.push as any)({
      pathname: '/transfer/request-link',
      params: {
        amount: amount,
        token: selectedToken,
        tokenMint: selectedPaymentToken?.mint || 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
        tokenDecimals: selectedPaymentToken?.decimals || 6,
        tokenLogoUri: selectedPaymentToken?.logoUri || TOKEN_LOGO_FALLBACKS[selectedToken] || '' } });
  }, [amount, selectedToken, selectedPaymentToken]);

  // Copy address
  const handleCopy = useCallback(async () => {
    if (!walletAddress) return;
    await Clipboard.setStringAsync(walletAddress);
    setCopied(true);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setTimeout(() => setCopied(false), 2000);
  }, [walletAddress]);

  // QR code scanned
  const handleQRScanned = useCallback((data: string) => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    // Parse Solana pay URI or address
    let address = data;
    if (data.startsWith('solana:')) {
      address = data.replace('solana:', '').split('?')[0];
    }
    // Navigate to send with the scanned address
    Alert.alert('Scanned', `Address: ${address.slice(0, 8)}...${address.slice(-8)}`);
  }, []);

  // Add contact
  const handleAddContact = useCallback(() => {
    router.push('/contacts' as any);
  }, []);

  // Select contact
  const handleSelectContact = useCallback((contact: LocalContact) => {
    setSelectedContact(contact);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, []);

  // ============================================================================
  // RENDER: Main Numpad View (Pay/Request modes)
  // ============================================================================

  const renderMainView = () => (
    <View style={[styles.mainContainer, { backgroundColor: bgColor }]}>
      {/* Ambient gradient */}
      <LinearGradient
        colors={isDark 
          ? ['rgba(16, 185, 129, 0.08)', 'transparent'] 
          : ['rgba(16, 185, 129, 0.05)', 'transparent']}
        style={styles.ambientGradient}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 0.6 }}
      />
      {/* Header with QR button */}
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <PressableScale
          onPress={() => setMode('qr')}
          style={[styles.qrButton]}
        >
          <Ionicons name="qr-code-outline" size={24} color="#fff" />
        </PressableScale>
        <View style={styles.headerSpacer} />
        <PressableScale
          onPress={() => router.push('/contacts' as any)}
          style={[styles.searchButton]}
        >
          <Ionicons name="search" size={24} color="#fff" />
        </PressableScale>
        {user && (
          <PressableScale
            onPress={() => router.push('/settings' as any)}
            style={[styles.profileButton]}
          >
            <View style={styles.profileAvatar}>
              <ThemedText style={styles.profileAvatarText}>
                {user.displayName?.[0]?.toUpperCase() || 'U'}
              </ThemedText>
            </View>
          </PressableScale>
        )}
      </View>

      {/* Amount Display - Always USD, Centered */}
      <View style={styles.amountContainer}>
        <View style={styles.amountCentered}>
          <View style={styles.amountRow}>
            <Text style={styles.amountCurrency}>$</Text>
            <Text style={styles.amountValue}>{amount}</Text>
          </View>
          {/* Token Selector Badge with Dropdown */}
          <View style={styles.tokenBadgeContainer}>
            <PressableScale
              onPress={() => setShowTokenSelector(!showTokenSelector)}
              style={[
                styles.inlineTokenBadge]}
            >
              {(selectedPaymentToken?.logoUri || TOKEN_LOGO_FALLBACKS[selectedToken]) && (
                <Image
                  source={{ uri: selectedPaymentToken?.logoUri || TOKEN_LOGO_FALLBACKS[selectedToken] }}
                  style={styles.tokenBadgeImage}
                />
              )}
              <Text style={styles.inlineTokenText}>{selectedToken}</Text>
              <Ionicons
                name={showTokenSelector ? "chevron-up" : "chevron-down"}
                size={16}
                color="#fff"
              />
            </PressableScale>

            {/* Dropdown Menu */}
            {showTokenSelector && (
              <Animated.View
                entering={FadeIn.duration(150)}
                style={[styles.tokenDropdown, { backgroundColor: cardColor }]}
              >
                <ScrollView
                  style={styles.tokenDropdownScroll}
                  showsVerticalScrollIndicator={false}
                  nestedScrollEnabled
                >
                  {tokens.map((token) => (
                    <PressableScale
                      key={token.symbol}
                      onPress={() => {
                        setSelectedToken(token.symbol);
                        setShowTokenSelector(false);
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      }}
                      style={[
                        styles.tokenDropdownItem,
                        selectedToken === token.symbol && styles.tokenDropdownItemSelected]}
                    >
                      {token.logoUri ? (
                        <Image
                          source={{ uri: token.logoUri }}
                          style={styles.tokenDropdownImage}
                        />
                      ) : (
                        <View style={[styles.tokenDropdownImagePlaceholder, { backgroundColor: primaryColor }]}>
                          <Text style={styles.tokenDropdownImagePlaceholderText}>
                            {token.symbol[0]}
                          </Text>
                        </View>
                      )}
                      <Text style={[styles.tokenDropdownSymbol, { color: textColor }]}>
                        {token.symbol}
                      </Text>
                      <Text style={[styles.tokenDropdownAvailable, { color: mutedColor }]}>
                        Available: ${token.valueUsd?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) || '0.00'}
                      </Text>
                      {selectedToken === token.symbol && (
                        <Ionicons name="checkmark" size={20} color={primaryColor} />
                      )}
                    </PressableScale>
                  ))}
                </ScrollView>
              </Animated.View>
            )}
          </View>
          {/* Balance indicator - always show USD value */}
          <Text style={[styles.balanceIndicator, { color: mutedColor }]}>
            Balance: ${tokensLoading ? '...' : (selectedPaymentToken?.valueUsd?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) || '0.00')}
          </Text>
        </View>
      </View>

      {/* Dismiss dropdown when tapping outside */}
      {showTokenSelector && (
        <PressableScale
          style={styles.dropdownBackdrop}
          onPress={() => setShowTokenSelector(false)}
        />
      )}

      {/* White Numpad Container with buttons */}
      <View style={styles.numpadSection}>
        <View style={styles.numpadContainer}>
          <Numpad onPress={handleNumpadPress} />
        </View>

        {/* Action buttons */}
        <View style={styles.actionRow}>
          <PressableScale
            onPress={handleRequest}
            style={[
              styles.actionButton,
              styles.requestButtonStyle]}
          >
            <Text style={styles.requestButtonText}>Request</Text>
          </PressableScale>
          <PressableScale
            onPress={handlePay}
            style={[
              styles.actionButton,
              styles.payButtonStyle,
              { backgroundColor: primaryColor }]}
          >
            <Text style={styles.payButtonText}>Pay</Text>
          </PressableScale>
        </View>

        {/* Selected contact indicator */}
        {selectedContact && (
          <Animated.View entering={FadeIn.duration(200)} style={styles.selectedContactBar}>
            <View style={styles.selectedContactInfo}>
              <View style={[styles.selectedContactAvatar, { backgroundColor: primaryColor }]}>
                <Text style={styles.selectedContactAvatarText}>
                  {selectedContact.avatar}
                </Text>
              </View>
              <Text style={styles.selectedContactName}>{selectedContact.name}</Text>
            </View>
            <PressableScale onPress={() => setSelectedContact(null)}>
              <Ionicons name="close-circle" size={24} color="#9BA1A6" />
            </PressableScale>
          </Animated.View>
        )}

        {/* Quick contacts */}
        {!selectedContact && contactsList.length > 0 && (
          <ContactSelector
            contacts={contactsList}
            favorites={favoritesList}
            onSelect={handleSelectContact}
            onAddNew={handleAddContact}
          />
        )}

        {/* Bottom safe area spacer */}
        <View style={{ height: insets.bottom + 80 }} />
      </View>

    </View>
  );

  // ============================================================================
  // RENDER: QR Mode
  // ============================================================================

  const renderQRView = () => (
    <View style={[styles.qrContainer, { backgroundColor: bgColor }]}>
      {/* Header */}
      <View style={[styles.qrHeader, { paddingTop: insets.top + 8 }]}>
        <PressableScale
          onPress={() => setMode('pay')}
          style={[styles.closeButton]}
        >
          <Ionicons name="close" size={28} color={textColor} />
        </PressableScale>
        <View style={styles.headerSpacer} />
        {qrMode === 'scan' && (
          <PressableScale
            style={[styles.flashButton]}
          >
            <Ionicons name="flashlight-outline" size={24} color={textColor} />
          </PressableScale>
        )}
      </View>

      {/* QR Mode Tabs */}
      <View style={[styles.qrTabs, { backgroundColor: cardColor }]}>
        <PressableScale
          onPress={() => setQrMode('scan')}
          style={[
            styles.qrTab,
            qrMode === 'scan' && { backgroundColor: primaryColor },
          ]}
        >
          <ThemedText style={[styles.qrTabText, { color: qrMode === 'scan' ? '#fff' : mutedColor }]}>
            Scan
          </ThemedText>
        </PressableScale>
        <PressableScale
          onPress={() => setQrMode('mycode')}
          style={[
            styles.qrTab,
            qrMode === 'mycode' && { backgroundColor: primaryColor },
          ]}
        >
          <ThemedText style={[styles.qrTabText, { color: qrMode === 'mycode' ? '#fff' : mutedColor }]}>
            My Code
          </ThemedText>
        </PressableScale>
      </View>

      {/* QR Content */}
      <View style={styles.qrContent}>
        {qrMode === 'scan' ? (
          // Camera Scanner
          <View style={styles.scannerContainer}>
            {!CameraView ? (
              // Camera not available (Expo Go limitation)
              <View style={styles.permissionContainer}>
                <Ionicons name="camera-outline" size={48} color={mutedColor} />
                <ThemedText style={[styles.permissionText, { color: mutedColor }]}>
                  Camera not available
                </ThemedText>
                <ThemedText style={[styles.permissionSubtext, { color: mutedColor }]}>
                  Build a development client to use QR scanning
                </ThemedText>
              </View>
            ) : permission?.granted ? (
              <>
                <CameraView
                  style={styles.camera}
                  facing="back"
                  barcodeScannerSettings={{
                    barcodeTypes: ['qr'] }}
                  onBarcodeScanned={(result: { data: string }) => handleQRScanned(result.data)}
                />
                <View style={styles.scannerOverlay}>
                  <View style={styles.scannerFrame} />
                </View>
              </>
            ) : (
              <View style={styles.permissionContainer}>
                <Ionicons name="camera-outline" size={48} color={mutedColor} />
                <ThemedText style={[styles.permissionText, { color: mutedColor }]}>
                  Camera access needed to scan QR codes
                </ThemedText>
                <PressableScale
                  onPress={requestPermission}
                  style={[styles.permissionButton, { backgroundColor: primaryColor }]}
                >
                  <ThemedText style={styles.permissionButtonText}>Enable Camera</ThemedText>
                </PressableScale>
              </View>
            )}
            <ThemedText style={styles.scanHint}>Scan QR code to pay</ThemedText>
          </View>
        ) : (
          // My QR Code
          <View style={styles.myCodeContainer}>
            <ThemedText style={styles.myCodeName}>{user?.displayName || 'Your Name'}</ThemedText>
            {walletAddress && (
              <ThemedText style={[styles.myCodeHandle, { color: mutedColor }]}>
                {displayAddress}
              </ThemedText>
            )}
            <View style={styles.qrCodeWrapper}>
              {walletAddress ? (
                <QRCode
                  value={`solana:${walletAddress}`}
                  size={200}
                  backgroundColor="#fff"
                  color="#000"
                  logo={require('@/assets/icon.png')}
                  logoSize={50}
                  logoBackgroundColor="#fff"
                  logoBorderRadius={12}
                />
              ) : (
                <View style={[styles.qrPlaceholder, { backgroundColor: isDark ? '#333' : '#eee' }]}>
                  <Ionicons name="qr-code" size={100} color={mutedColor} />
                </View>
              )}
            </View>
            <PressableScale
              onPress={handleCopy}
              style={[styles.copyButton, { backgroundColor: cardColor }]}
            >
              <Ionicons
                name={copied ? 'checkmark' : 'copy-outline'}
                size={18}
                color={copied ? primaryColor : mutedColor}
              />
              <ThemedText style={[styles.copyButtonText, copied && { color: primaryColor }]}>
                {copied ? 'Copied!' : 'Copy Address'}
              </ThemedText>
            </PressableScale>

            {/* Private Link Button */}
            <PressableScale
              onPress={() => router.push('/transfer/one-time-link' as any)}
              style={[styles.privateLinkButton, { backgroundColor: '#7C3AED' }]}
            >
              <Ionicons name="shield-checkmark" size={18} color="#fff" />
              <ThemedText style={styles.privateLinkButtonText}>
                Create Private Link
              </ThemedText>
            </PressableScale>
            <ThemedText style={[styles.privateLinkHint, { color: mutedColor }]}>
              One-time use, expires in 15 min
            </ThemedText>
          </View>
        )}
      </View>
    </View>
  );

  // ============================================================================
  // RENDER: Main
  // ============================================================================

  return (
    <ThemedView style={styles.container}>
      <StatusBar style={mode === 'qr' ? (isDark ? 'light' : 'dark') : 'light'} />
      {mode === 'qr' ? renderQRView() : renderMainView()}
    </ThemedView>
  );
}

// ============================================================================
// Styles
// ============================================================================

const styles = StyleSheet.create({
  container: {
    flex: 1 },
  mainContainer: {
    flex: 1 },
  ambientGradient: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: '50%',
    pointerEvents: 'none' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 8 },
  headerSpacer: {
    flex: 1 },
  qrButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center' },
  searchButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center' },
  profileButton: {
    marginLeft: 8 },
  profileAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(0,0,0,0.2)',
    alignItems: 'center',
    justifyContent: 'center' },
  profileAvatarText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600' },
  amountContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24 },
  amountCentered: {
    alignItems: 'center' },
  amountRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'center' },
  tokenBadgeContainer: {
    marginTop: 16,
    zIndex: 100,
    alignItems: 'center' },
  amountCurrency: {
    fontSize: 48,
    fontWeight: '700',
    color: '#10B981',
    marginRight: 4,
    marginTop: 8 },
  amountValue: {
    fontSize: 72,
    fontWeight: '700',
    color: '#ECEDEE' },
  amountTokenLabel: {
    fontSize: 24,
    fontWeight: '500',
    color: 'rgba(16, 185, 129, 0.7)',
    marginTop: 4 },
  inlineTokenBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingLeft: 6,
    paddingRight: 12,
    paddingVertical: 6,
    borderRadius: 24,
    backgroundColor: 'rgba(16, 185, 129, 0.9)' },
  inlineTokenBadgePressed: {
    backgroundColor: 'rgba(16, 185, 129, 0.7)',
    transform: [{ scale: 0.96 }] },
  tokenBadgeImage: {
    width: 24,
    height: 24,
    borderRadius: 12 },
  inlineTokenText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff' },
  tokenDropdown: {
    position: 'absolute',
    top: '100%',
    marginTop: 8,
    width: 220,
    borderRadius: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
    overflow: 'hidden',
    alignSelf: 'center',
    left: -60 },
  tokenDropdownScroll: {
    maxHeight: 240 },
  tokenDropdownItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 14,
    gap: 10 },
  tokenDropdownItemSelected: {
    backgroundColor: 'rgba(16, 185, 129, 0.1)' },
  tokenDropdownImage: {
    width: 32,
    height: 32,
    borderRadius: 16 },
  tokenDropdownImagePlaceholder: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center' },
  tokenDropdownImagePlaceholderText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600' },
  tokenDropdownSymbol: {
    fontSize: 15,
    fontWeight: '600' },
  tokenDropdownAvailable: {
    flex: 1,
    fontSize: 13,
    textAlign: 'right' },
  dropdownBackdrop: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 50 },
  balanceIndicator: {
    fontSize: 14,
    marginTop: 12 },
  balanceButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.3)' },
  balanceText: {
    fontSize: 14 },
  numpadSection: {
    backgroundColor: '#F2F2F7',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 16,
    paddingHorizontal: 16 },
  numpadContainer: {
    paddingHorizontal: 8 },
  numpad: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between' },
  numpadRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    width: '100%' },
  numpadKey: {
    width: (SCREEN_WIDTH - 48) / 3,
    height: 56,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8 },
  numpadKeyPressed: {
    backgroundColor: 'rgba(0,0,0,0.05)',
    borderRadius: 12 },
  numpadKeyDisabled: {
    opacity: 0.5 },
  numpadKeyText: {
    fontSize: 28,
    fontWeight: '400',
    color: '#1C1C1E' },
  actionRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 8,
    marginBottom: 16 },
  actionButton: {
    flex: 1,
    height: 50,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center' },
  requestButtonStyle: {
    borderWidth: 1,
    borderColor: '#1C1C1E',
    backgroundColor: 'transparent' },
  payButtonStyle: {
    // backgroundColor set dynamically
  },
  requestButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1C1C1E' },
  payButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff' },
  selectedContactBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: 16,
    padding: 12,
    backgroundColor: 'rgba(0,0,0,0.05)',
    marginBottom: 16 },
  selectedContactInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12 },
  selectedContactAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center' },
  selectedContactAvatarText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff' },
  selectedContactName: {
    fontSize: 16,
    fontWeight: '500',
    color: '#1C1C1E' },
  contactsScrollContent: {
    paddingHorizontal: 8,
    gap: 16,
    paddingBottom: 8 },
  contactCircle: {
    alignItems: 'center',
    width: 64 },
  contactAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4 },
  addContactAvatar: {
    backgroundColor: 'rgba(0, 0, 0, 0.05)',
    borderWidth: 2,
    borderColor: 'rgba(0, 0, 0, 0.2)',
    borderStyle: 'dashed' },
  contactAvatarText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600' },
  contactName: {
    fontSize: 12,
    textAlign: 'center',
    color: '#6B7280' },
  pressed: {
    opacity: 0.7 },

  // QR Mode Styles
  qrContainer: {
    flex: 1 },
  qrHeader: {
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
  flashButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center' },
  qrTabs: {
    flexDirection: 'row',
    marginHorizontal: 24,
    borderRadius: 12,
    padding: 4 },
  qrTab: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center' },
  qrTabText: {
    fontSize: 15,
    fontWeight: '600' },
  qrContent: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 24 },
  scannerContainer: {
    flex: 1,
    alignItems: 'center' },
  camera: {
    width: SCREEN_WIDTH - 48,
    height: SCREEN_WIDTH - 48,
    borderRadius: 24,
    overflow: 'hidden' },
  scannerOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    top: 0,
    left: 24,
    right: 24,
    bottom: 0 },
  scannerFrame: {
    width: 200,
    height: 200,
    borderWidth: 3,
    borderColor: '#fff',
    borderRadius: 24 },
  scanHint: {
    marginTop: 24,
    fontSize: 16,
    textAlign: 'center' },
  permissionContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
    padding: 32 },
  permissionText: {
    fontSize: 16,
    textAlign: 'center' },
  permissionSubtext: {
    fontSize: 14,
    textAlign: 'center',
    marginTop: 8 },
  permissionButton: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 24 },
  permissionButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600' },
  myCodeContainer: {
    flex: 1,
    alignItems: 'center',
    paddingTop: 24 },
  myCodeName: {
    fontSize: 28,
    fontWeight: '700',
    marginBottom: 4 },
  myCodeHandle: {
    fontSize: 16,
    marginBottom: 32 },
  qrCodeWrapper: {
    backgroundColor: '#fff',
    padding: 24,
    borderRadius: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 8 },
  qrPlaceholder: {
    width: 200,
    height: 200,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center' },
  copyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 32,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 24 },
  copyButtonText: {
    fontSize: 15,
    fontWeight: '500' },
  privateLinkButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 16,
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 24 },
  privateLinkButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600' },
  privateLinkHint: {
    fontSize: 12,
    marginTop: 8 } });
