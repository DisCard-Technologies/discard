import { useState, useMemo, useCallback, useRef } from 'react';
import { StyleSheet, View, Pressable, ScrollView, TextInput, Keyboard, Alert, Text, ActivityIndicator, Dimensions } from 'react-native';
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

const { width: SCREEN_WIDTH } = Dimensions.get('window');

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
  const mutedColor = 'rgba(0,229,255,0.6)';
  const textColor = '#fff';

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
              {key === 'del' ? (
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
  const mutedColor = useThemeColor({ light: '#687076', dark: '#9BA1A6' }, 'icon');

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.contactsScrollContent}
    >
      {/* Add new contact button */}
      <Pressable
        onPress={onAddNew}
        style={({ pressed }) => [styles.contactCircle, pressed && styles.pressed]}
      >
        <View style={[styles.contactAvatar, styles.addContactAvatar]}>
          <Ionicons name="add" size={24} color={mutedColor} />
        </View>
        <ThemedText style={[styles.contactName, { color: mutedColor }]} numberOfLines={1}>
          Get $15
        </ThemedText>
      </Pressable>

      {/* Favorites first, then recent */}
      {[...favorites, ...contacts.filter(c => !favorites.some(f => f.id === c.id))].slice(0, 10).map((contact) => (
        <Pressable
          key={contact.id}
          onPress={() => onSelect(contact)}
          style={({ pressed }) => [styles.contactCircle, pressed && styles.pressed]}
        >
          <View style={[styles.contactAvatar, { backgroundColor: primaryColor }]}>
            <ThemedText style={styles.contactAvatarText}>{contact.avatar}</ThemedText>
          </View>
          <ThemedText style={[styles.contactName, { color: mutedColor }]} numberOfLines={1}>
            {contact.name.split(' ')[0]}
          </ThemedText>
        </Pressable>
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

  // CashApp green color
  const cashAppGreen = '#00D632';
  const primaryColor = useThemeColor({}, 'tint');
  const mutedColor = useThemeColor({ light: '#687076', dark: '#9BA1A6' }, 'icon');
  const textColor = useThemeColor({}, 'text');
  const bgColor = isDark ? '#000' : '#fff';

  // Auth and wallet
  const { user } = useAuth();
  const walletAddress = user?.solanaAddress || null;

  // Token holdings
  const { holdings: tokenHoldings, isLoading: tokensLoading } = useTokenHoldings(walletAddress);

  // Contacts
  const {
    contacts: allContacts,
    favoriteContacts,
    createContact,
  } = useContacts();

  // Transform contacts for UI
  const contactsList = useMemo(() => {
    return allContacts.map((c) => ({
      id: c.id,
      name: c.name,
      handle: c.identifier,
      avatar: c.avatarInitials,
      recent: c.lastUsedAt !== undefined,
      verified: c.verified,
    }));
  }, [allContacts]);

  const favoritesList = useMemo(() => {
    return favoriteContacts.map((c) => ({
      id: c.id,
      name: c.name,
      handle: c.identifier,
      avatar: c.avatarInitials || c.name.slice(0, 2).toUpperCase(),
      recent: true,
      verified: c.verified,
    }));
  }, [favoriteContacts]);

  // Transform token holdings
  const tokens = useMemo(() => {
    if (!tokenHoldings || tokenHoldings.length === 0) return [];
    return tokenHoldings.map(h => ({
      symbol: h.symbol,
      balance: h.balanceFormatted,
      mint: h.mint,
      decimals: h.decimals,
    }));
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

  // Cross-currency settlement
  const paymentAmountBaseUnits = useMemo(() => {
    if (!amount || amount === '0' || !selectedPaymentToken) return undefined;
    const parsed = parseFloat(amount);
    if (isNaN(parsed) || parsed <= 0) return undefined;
    return Math.floor(parsed * Math.pow(10, selectedPaymentToken.decimals)).toString();
  }, [amount, selectedPaymentToken]);

  const {
    settlementToken,
    needsSwap,
    isLoadingQuote,
    estimatedReceivedFormatted,
    setSettlementToken,
    availableTokens,
  } = useCrossCurrencyTransfer({
    paymentMint: selectedPaymentToken?.mint,
    paymentAmount: paymentAmountBaseUnits,
    debounceMs: 500,
  });

  // Format wallet address for display
  const displayAddress = walletAddress
    ? `${walletAddress.slice(0, 6)}...${walletAddress.slice(-4)}`
    : 'No wallet';

  // Get currency symbol for selected token ($ for stablecoins, token symbol for others)
  const currencySymbol = useMemo(() => {
    const stablecoins = ['USDC', 'USDT', 'BUSD', 'DAI', 'UST', 'USDP', 'TUSD'];
    return stablecoins.includes(selectedToken) ? '$' : '';
  }, [selectedToken]);

  // Numpad handler
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
      // Limit decimal places based on token
      const decimals = selectedPaymentToken?.decimals || 2;
      if (prev.includes('.')) {
        const [, decimal] = prev.split('.');
        if (decimal && decimal.length >= decimals) return prev;
      }
      // Remove leading zero unless it's a decimal
      if (prev === '0' && key !== '.') return key;
      // Limit total length
      if (prev.length >= 10) return prev;
      return prev + key;
    });
  }, [selectedPaymentToken]);

  // Navigate to confirmation
  const handlePay = useCallback(() => {
    if (amount === '0' || parseFloat(amount) <= 0) {
      Alert.alert('Enter Amount', 'Please enter an amount to send');
      return;
    }

    // If no contact selected, go to send screen for recipient selection
    if (!selectedContact) {
      (router.push as any)({
        pathname: '/transfer/send',
        params: {
          amount: JSON.stringify({
            amount: parseFloat(amount),
            amountUsd: parseFloat(amount),
            amountBaseUnits: paymentAmountBaseUnits || (parseFloat(amount) * 1e6).toString(),
          }),
          token: JSON.stringify({
            symbol: selectedToken,
            mint: selectedPaymentToken?.mint || 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
            decimals: selectedPaymentToken?.decimals || 6,
            balance: 0,
            balanceUsd: 0,
          }),
        },
      });
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
          contactId: selectedContact.id,
        }),
        token: JSON.stringify({
          symbol: selectedToken,
          mint: selectedPaymentToken?.mint || 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
          decimals: selectedPaymentToken?.decimals || 6,
          balance: 0,
          balanceUsd: 0,
        }),
        amount: JSON.stringify({
          amount: parseFloat(amount),
          amountUsd: parseFloat(amount),
          amountBaseUnits: paymentAmountBaseUnits || (parseFloat(amount) * 1e6).toString(),
        }),
        fees: JSON.stringify({
          networkFee: 0.00001,
          networkFeeUsd: 0.001,
          platformFee: 0,
          priorityFee: 0.00001,
          ataRent: 0,
          totalFeesUsd: 0.001,
          totalCostUsd: parseFloat(amount) + 0.001,
        }),
        settlement: JSON.stringify({
          token: settlementToken.symbol,
          mint: settlementToken.mint,
          decimals: settlementToken.decimals,
          currencySymbol: settlementToken.currencySymbol,
          needsSwap,
          estimatedOutput: estimatedReceivedFormatted,
        }),
      },
    });
  }, [amount, selectedContact, selectedToken, selectedPaymentToken, paymentAmountBaseUnits, settlementToken, needsSwap, estimatedReceivedFormatted]);

  // Request payment
  const handleRequest = useCallback(() => {
    if (amount === '0' || parseFloat(amount) <= 0) {
      Alert.alert('Enter Amount', 'Please enter an amount to request');
      return;
    }
    router.push('/transfer/request-link' as any);
  }, [amount]);

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

  // Render token balance indicator
  const renderBalance = () => {
    if (tokensLoading) {
      return <ActivityIndicator size="small" color={mutedColor} />;
    }
    const balance = selectedPaymentToken?.balanceFormatted || '0';
    return (
      <Pressable
        onPress={() => setShowTokenSelector(true)}
        style={styles.balanceButton}
      >
        <ThemedText style={[styles.balanceText, { color: mutedColor }]}>
          {selectedToken} {balance}
        </ThemedText>
        <Ionicons name="chevron-down" size={14} color={mutedColor} />
      </Pressable>
    );
  };

  // ============================================================================
  // RENDER: Main Numpad View (Pay/Request modes)
  // ============================================================================

  const renderMainView = () => (
    <LinearGradient
      colors={['#2A2E35', '#1F2228', '#2A2E35']}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={styles.mainContainer}
    >
      {/* Header with QR button */}
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <Pressable
          onPress={() => setMode('qr')}
          style={({ pressed }) => [styles.qrButton, pressed && styles.pressed]}
        >
          <Ionicons name="qr-code-outline" size={24} color="#fff" />
        </Pressable>
        <View style={styles.headerSpacer} />
        <Pressable
          onPress={() => router.push('/contacts' as any)}
          style={({ pressed }) => [styles.searchButton, pressed && styles.pressed]}
        >
          <Ionicons name="search" size={24} color="#fff" />
        </Pressable>
        {user && (
          <Pressable
            onPress={() => router.push('/settings' as any)}
            style={({ pressed }) => [styles.profileButton, pressed && styles.pressed]}
          >
            <View style={styles.profileAvatar}>
              <ThemedText style={styles.profileAvatarText}>
                {user.displayName?.[0]?.toUpperCase() || 'U'}
              </ThemedText>
            </View>
          </Pressable>
        )}
      </View>

      {/* Amount Display */}
      <View style={styles.amountContainer}>
        <View style={styles.amountRow}>
          {currencySymbol ? (
            <Text style={styles.amountCurrency}>{currencySymbol}</Text>
          ) : null}
          <Text style={styles.amountValue}>{amount}</Text>
        </View>
        {!currencySymbol && (
          <Text style={styles.amountTokenLabel}>{selectedToken}</Text>
        )}
        {renderBalance()}
      </View>

      {/* Numpad */}
      <View style={styles.numpadContainer}>
        <Numpad onPress={handleNumpadPress} />
      </View>

      {/* Bottom buttons */}
      <View style={[styles.bottomButtons, { paddingBottom: insets.bottom + 16 }]}>
        <View style={styles.actionRow}>
          <Pressable
            onPress={handleRequest}
            style={styles.actionButton}
          >
            {({ pressed }) => (
              <LinearGradient
                colors={pressed ? ['#00E5FF', '#7B61FF'] : ['#2A2E35', '#1A4D5C', '#3D2680']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.actionButtonGradient}
              >
                <ThemedText style={styles.actionButtonText}>Request</ThemedText>
              </LinearGradient>
            )}
          </Pressable>
          <Pressable
            onPress={handlePay}
            style={styles.actionButton}
          >
            {({ pressed }) => (
              <LinearGradient
                colors={pressed ? ['#00E5FF', '#7B61FF'] : ['#2A2E35', '#00464D', '#1A0F33']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.actionButtonGradient}
              >
                <ThemedText style={styles.actionButtonText}>Pay</ThemedText>
              </LinearGradient>
            )}
          </Pressable>
        </View>

        {/* Selected contact indicator */}
        {selectedContact && (
          <Animated.View entering={FadeIn.duration(200)} style={styles.selectedContactBar}>
            <View style={styles.selectedContactInfo}>
              <View style={[styles.selectedContactAvatar, { backgroundColor: '#fff' }]}>
                <ThemedText style={[styles.selectedContactAvatarText, { color: cashAppGreen }]}>
                  {selectedContact.avatar}
                </ThemedText>
              </View>
              <ThemedText style={styles.selectedContactName}>{selectedContact.name}</ThemedText>
            </View>
            <Pressable onPress={() => setSelectedContact(null)}>
              <Ionicons name="close-circle" size={24} color="rgba(255,255,255,0.6)" />
            </Pressable>
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
      </View>

      {/* Token selector modal */}
      {showTokenSelector && (
        <Pressable
          style={styles.modalOverlay}
          onPress={() => setShowTokenSelector(false)}
        >
          <Animated.View
            entering={FadeIn.duration(200)}
            style={[styles.tokenModal, { backgroundColor: isDark ? '#1c1c1e' : '#fff' }]}
          >
            <ThemedText style={styles.tokenModalTitle}>Select Token</ThemedText>
            <ScrollView style={styles.tokenList}>
              {tokens.map((token) => (
                <Pressable
                  key={token.symbol}
                  onPress={() => {
                    setSelectedToken(token.symbol);
                    setShowTokenSelector(false);
                  }}
                  style={({ pressed }) => [
                    styles.tokenItem,
                    selectedToken === token.symbol && { backgroundColor: `${primaryColor}20` },
                    pressed && styles.pressed,
                  ]}
                >
                  <ThemedText style={styles.tokenItemSymbol}>{token.symbol}</ThemedText>
                  <ThemedText style={[styles.tokenItemBalance, { color: mutedColor }]}>
                    {token.balance}
                  </ThemedText>
                </Pressable>
              ))}
            </ScrollView>
          </Animated.View>
        </Pressable>
      )}
    </LinearGradient>
  );

  // ============================================================================
  // RENDER: QR Mode
  // ============================================================================

  const renderQRView = () => (
    <View style={[styles.qrContainer, { backgroundColor: bgColor }]}>
      {/* Header */}
      <View style={[styles.qrHeader, { paddingTop: insets.top + 8 }]}>
        <Pressable
          onPress={() => setMode('pay')}
          style={({ pressed }) => [styles.closeButton, pressed && styles.pressed]}
        >
          <Ionicons name="close" size={28} color={textColor} />
        </Pressable>
        <View style={styles.headerSpacer} />
        {qrMode === 'scan' && (
          <Pressable
            style={({ pressed }) => [styles.flashButton, pressed && styles.pressed]}
          >
            <Ionicons name="flashlight-outline" size={24} color={textColor} />
          </Pressable>
        )}
      </View>

      {/* QR Mode Tabs */}
      <View style={[styles.qrTabs, { backgroundColor: isDark ? '#1c1c1e' : '#f4f4f5' }]}>
        <Pressable
          onPress={() => setQrMode('scan')}
          style={styles.qrTab}
        >
          {({ pressed }) => (
            qrMode === 'scan' || pressed ? (
              <LinearGradient
                colors={pressed ? ['#00E5FF', '#7B61FF'] : ['#2A2E35', '#1A4D5C', '#3D2680']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.qrTabGradient}
              >
                <ThemedText style={[styles.qrTabText, { color: '#fff' }]}>
                  Scan
                </ThemedText>
              </LinearGradient>
            ) : (
              <View style={styles.qrTabGradient}>
                <ThemedText style={[styles.qrTabText, { color: mutedColor }]}>
                  Scan
                </ThemedText>
              </View>
            )
          )}
        </Pressable>
        <Pressable
          onPress={() => setQrMode('mycode')}
          style={styles.qrTab}
        >
          {({ pressed }) => (
            qrMode === 'mycode' || pressed ? (
              <LinearGradient
                colors={pressed ? ['#00E5FF', '#7B61FF'] : ['#2A2E35', '#1A4D5C', '#3D2680']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.qrTabGradient}
              >
                <ThemedText style={[styles.qrTabText, { color: '#fff' }]}>
                  My Code
                </ThemedText>
              </LinearGradient>
            ) : (
              <View style={styles.qrTabGradient}>
                <ThemedText style={[styles.qrTabText, { color: mutedColor }]}>
                  My Code
                </ThemedText>
              </View>
            )
          )}
        </Pressable>
      </View>

      {/* QR Content */}
      <View style={styles.qrContent}>
        {qrMode === 'scan' ? (
          // Camera Scanner
          <View style={styles.scannerContainer}>
            {!CameraView ? (
              // Camera not available (Expo Go limitation)
              <View style={styles.permissionContainer}>
                <Ionicons name="camera-off-outline" size={48} color={mutedColor} />
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
                    barcodeTypes: ['qr'],
                  }}
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
                <Pressable
                  onPress={requestPermission}
                  style={[styles.permissionButton, { backgroundColor: primaryColor }]}
                >
                  <ThemedText style={styles.permissionButtonText}>Enable Camera</ThemedText>
                </Pressable>
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
            <Pressable
              onPress={handleCopy}
              style={[styles.copyButton, { backgroundColor: isDark ? '#333' : '#f4f4f5' }]}
            >
              <Ionicons
                name={copied ? 'checkmark' : 'copy-outline'}
                size={18}
                color={copied ? cashAppGreen : mutedColor}
              />
              <ThemedText style={[styles.copyButtonText, copied && { color: cashAppGreen }]}>
                {copied ? 'Copied!' : 'Copy Address'}
              </ThemedText>
            </Pressable>
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
    flex: 1,
  },
  mainContainer: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  headerSpacer: {
    flex: 1,
  },
  qrButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  profileButton: {
    marginLeft: 8,
  },
  profileAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(0,0,0,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  profileAvatarText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  amountContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  amountRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  amountCurrency: {
    fontSize: 48,
    fontWeight: '700',
    color: '#00E5FF',
    marginRight: 4,
    marginTop: 8,
  },
  amountValue: {
    fontSize: 72,
    fontWeight: '700',
    color: '#fff',
  },
  amountTokenLabel: {
    fontSize: 24,
    fontWeight: '500',
    color: 'rgba(0,229,255,0.7)',
    marginTop: 4,
  },
  balanceButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: 'rgba(0,229,255,0.15)',
    borderWidth: 1,
    borderColor: 'rgba(0,229,255,0.3)',
  },
  balanceText: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.7)',
  },
  numpadContainer: {
    paddingHorizontal: 24,
  },
  numpad: {
    gap: 8,
  },
  numpadRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 16,
  },
  numpadKey: {
    width: (SCREEN_WIDTH - 80) / 3,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  numpadKeyPressed: {
    backgroundColor: 'rgba(0,229,255,0.2)',
  },
  numpadKeyDisabled: {
    opacity: 0.5,
  },
  numpadKeyText: {
    fontSize: 32,
    fontWeight: '400',
    color: '#fff',
  },
  bottomButtons: {
    paddingHorizontal: 16,
    paddingTop: 16,
    gap: 16,
  },
  actionRow: {
    flexDirection: 'row',
    gap: 12,
  },
  actionButton: {
    flex: 1,
    borderRadius: 28,
    overflow: 'hidden',
  },
  actionButtonGradient: {
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  requestButton: {
    backgroundColor: 'rgba(0,0,0,0.15)',
  },
  payButton: {
    backgroundColor: '#000',
  },
  actionButtonText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#fff',
  },
  selectedContactBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(0,229,255,0.1)',
    borderRadius: 16,
    padding: 12,
    borderWidth: 1,
    borderColor: 'rgba(0,229,255,0.3)',
  },
  selectedContactInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  selectedContactAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  selectedContactAvatarText: {
    fontSize: 14,
    fontWeight: '600',
  },
  selectedContactName: {
    fontSize: 16,
    fontWeight: '500',
    color: '#fff',
  },
  contactsScrollContent: {
    paddingHorizontal: 8,
    gap: 16,
  },
  contactCircle: {
    alignItems: 'center',
    width: 64,
  },
  contactAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  addContactAvatar: {
    backgroundColor: 'rgba(42,46,53,0.6)',
    borderWidth: 2,
    borderColor: 'rgba(0,229,255,0.4)',
    borderStyle: 'dashed',
  },
  contactAvatarText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  contactName: {
    fontSize: 12,
    textAlign: 'center',
    color: 'rgba(255,255,255,0.7)',
  },
  pressed: {
    opacity: 0.7,
  },
  modalOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  tokenModal: {
    width: '100%',
    maxHeight: '60%',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
  },
  tokenModalTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 16,
    textAlign: 'center',
  },
  tokenList: {
    maxHeight: 300,
  },
  tokenItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 16,
    paddingHorizontal: 16,
    borderRadius: 12,
    marginBottom: 8,
  },
  tokenItemSymbol: {
    fontSize: 16,
    fontWeight: '500',
  },
  tokenItemBalance: {
    fontSize: 14,
  },

  // QR Mode Styles
  qrContainer: {
    flex: 1,
  },
  qrHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  closeButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  flashButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  qrTabs: {
    flexDirection: 'row',
    marginHorizontal: 24,
    borderRadius: 12,
    padding: 4,
  },
  qrTab: {
    flex: 1,
    borderRadius: 8,
    overflow: 'hidden',
  },
  qrTabGradient: {
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  qrTabText: {
    fontSize: 15,
    fontWeight: '500',
  },
  qrContent: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 24,
  },
  scannerContainer: {
    flex: 1,
    alignItems: 'center',
  },
  camera: {
    width: SCREEN_WIDTH - 48,
    height: SCREEN_WIDTH - 48,
    borderRadius: 24,
    overflow: 'hidden',
  },
  scannerOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    top: 0,
    left: 24,
    right: 24,
    bottom: 0,
  },
  scannerFrame: {
    width: 200,
    height: 200,
    borderWidth: 3,
    borderColor: '#fff',
    borderRadius: 24,
  },
  scanHint: {
    marginTop: 24,
    fontSize: 16,
    textAlign: 'center',
  },
  permissionContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
    padding: 32,
  },
  permissionText: {
    fontSize: 16,
    textAlign: 'center',
  },
  permissionSubtext: {
    fontSize: 14,
    textAlign: 'center',
    marginTop: 8,
  },
  permissionButton: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 24,
  },
  permissionButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  myCodeContainer: {
    flex: 1,
    alignItems: 'center',
    paddingTop: 24,
  },
  myCodeName: {
    fontSize: 28,
    fontWeight: '700',
    marginBottom: 4,
  },
  myCodeHandle: {
    fontSize: 16,
    marginBottom: 32,
  },
  qrCodeWrapper: {
    backgroundColor: '#fff',
    padding: 24,
    borderRadius: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 8,
  },
  qrPlaceholder: {
    width: 200,
    height: 200,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  copyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 32,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 24,
  },
  copyButtonText: {
    fontSize: 15,
    fontWeight: '500',
  },
});
