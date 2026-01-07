import { useState, useMemo, useCallback } from 'react';
import { StyleSheet, View, Pressable, ScrollView, TextInput, Keyboard, Alert, Text, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { KeyboardStickyView } from 'react-native-keyboard-controller';
import Animated, { useSharedValue, useAnimatedStyle, withTiming } from 'react-native-reanimated';
import * as Clipboard from 'expo-clipboard';
import { router } from 'expo-router';
import QRCode from 'react-native-qrcode-svg';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { CommandBar } from '@/components/command-bar';
import { useThemeColor } from '@/hooks/use-theme-color';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useAuth } from '@/stores/authConvex';
import { useTokenHoldings } from '@/hooks/useTokenHoldings';
import { RecipientInput, SettlementSelector } from '@/components/transfer';
import { useContacts } from '@/hooks/useContacts';
import { useAddressResolver, type ResolvedAddress } from '@/hooks/useAddressResolver';
import { useTransfer, type TransferToken } from '@/hooks/useTransfer';
import { useCrossCurrencyTransfer } from '@/hooks/useCrossCurrencyTransfer';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

type TransferMode = 'send' | 'receive' | 'request';

// Local contact type for display (adapts from Convex Contact)
interface LocalContact {
  id: string;
  name: string;
  handle: string;
  avatar: string;
  recent?: boolean;
  verified?: boolean;
}

interface RecentTransfer {
  id: string;
  type: 'sent' | 'received' | 'requested';
  contact: LocalContact;
  amount: number;
  token: string;
  timestamp: string;
  status: 'completed' | 'pending' | 'expired';
}

// Initial empty contacts - users add their own
const initialContacts: LocalContact[] = [];

// Recent transfers will be populated from real transaction history when available
const recentTransfers: RecentTransfer[] = [];

export default function TransferScreen() {
  const insets = useSafeAreaInsets();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  const primaryColor = useThemeColor({}, 'tint');
  const mutedColor = useThemeColor({ light: '#687076', dark: '#9BA1A6' }, 'icon');
  const textColor = useThemeColor({}, 'text');

  // Real data from hooks
  const { user } = useAuth();
  const walletAddress = user?.solanaAddress || null;

  const {
    holdings: tokenHoldings,
    isLoading: tokensLoading,
  } = useTokenHoldings(walletAddress);

  // Transform real token holdings for the UI
  const tokens = useMemo(() => {
    if (!tokenHoldings || tokenHoldings.length === 0) {
      return [];
    }
    return tokenHoldings.map(h => ({
      symbol: h.symbol,
      balance: h.balanceFormatted,
      mint: h.mint,
      decimals: h.decimals,
    }));
  }, [tokenHoldings]);

  // Get the selected payment token's details
  const selectedPaymentToken = useMemo(() => {
    if (!tokenHoldings) return null;
    return tokenHoldings.find(h => h.symbol === selectedToken) || null;
  }, [tokenHoldings, selectedToken]);

  const [mode, setMode] = useState<TransferMode>('send');
  const [selectedContact, setSelectedContact] = useState<LocalContact | null>(null);
  const [amount, setAmount] = useState('');
  const [selectedToken, setSelectedToken] = useState('USDC');
  const [searchQuery, setSearchQuery] = useState('');
  const [copied, setCopied] = useState(false);
  const [memo, setMemo] = useState('');
  const [showAllContacts, setShowAllContacts] = useState(false);
  const [showAddContact, setShowAddContact] = useState(false);
  const [newContactName, setNewContactName] = useState('');
  const [newContactHandle, setNewContactHandle] = useState('');
  const [contactsList, setContactsList] = useState<LocalContact[]>(initialContacts);

  // Cross-currency settlement
  const paymentAmountBaseUnits = useMemo(() => {
    if (!amount || !selectedPaymentToken) return undefined;
    const parsed = parseFloat(amount);
    if (isNaN(parsed) || parsed <= 0) return undefined;
    return Math.floor(parsed * Math.pow(10, selectedPaymentToken.decimals)).toString();
  }, [amount, selectedPaymentToken]);

  const {
    settlementToken,
    needsSwap,
    isLoadingQuote,
    quoteError,
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
  const fullAddress = walletAddress || '';

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
    router.push('/transfer/scan' as any);
  };

  const handleMic = () => {};

  const filteredContacts = contactsList.filter(
    (c) =>
      c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.handle.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleCopy = async () => {
    await Clipboard.setStringAsync(fullAddress);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSend = () => {
    if (!selectedContact || !amount) return;

    // Navigate to confirmation screen with transfer data
    (router.push as any)({
      pathname: '/transfer/confirmation',
      params: {
        recipient: JSON.stringify({
          input: selectedContact.handle,
          address: selectedContact.handle, // Would be resolved address in real implementation
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
          amountUsd: parseFloat(amount), // Simplified - assume stablecoin
          amountBaseUnits: paymentAmountBaseUnits || (parseFloat(amount) * 1e6).toString(),
        }),
        fees: JSON.stringify({
          networkFee: 0.00001,
          networkFeeUsd: 0.001,
          platformFee: parseFloat(amount) * 0.003,
          priorityFee: 0.00001,
          ataRent: 0,
          totalFeesUsd: 0.001 + parseFloat(amount) * 0.003,
          totalCostUsd: parseFloat(amount) + 0.001 + parseFloat(amount) * 0.003,
        }),
        // Settlement token info for cross-currency transfers
        settlement: JSON.stringify({
          token: settlementToken.symbol,
          mint: settlementToken.mint,
          decimals: settlementToken.decimals,
          currencySymbol: settlementToken.currencySymbol,
          needsSwap,
          estimatedOutput: estimatedReceivedFormatted,
        }),
        memo,
      },
    });
  };

  const handleRequest = () => {
    router.push('/transfer/request-link' as any);
  };

  const handleModeChange = (newMode: TransferMode) => {
    setMode(newMode);
    setSelectedContact(null);
    setAmount('');
  };

  const renderModeTabs = () => {
    // In dark mode, primaryColor is white so we need dark text on active tab
    // In light mode, primaryColor is a tint color so white text works
    const activeTextColor = isDark ? '#000' : '#fff';
    
    return (
      <View style={[styles.modeTabs, { backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)' }]}>
        {[
          { id: 'send' as const, icon: 'arrow-up' as const, label: 'Send' },
          { id: 'receive' as const, icon: 'arrow-down' as const, label: 'Receive' },
          { id: 'request' as const, icon: 'document-text' as const, label: 'Request' },
        ].map((tab) => {
          const isActive = mode === tab.id;
          return (
            <Pressable
              key={tab.id}
              onPress={() => handleModeChange(tab.id)}
              style={[
                styles.modeTab,
                isActive && { backgroundColor: primaryColor },
              ]}
            >
              <Ionicons
                name={tab.icon}
                size={16}
                color={isActive ? activeTextColor : mutedColor}
              />
              <Text
                style={[
                  styles.modeTabText,
                  { color: isActive ? activeTextColor : mutedColor },
                ]}
              >
                {tab.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    );
  };

  const renderRecentContacts = () => {
    const recentContacts = contactsList.filter((c) => c.recent);

    if (recentContacts.length === 0) {
      return null; // Don't show section if no recent contacts
    }

    return (
      <View style={styles.section}>
        <ThemedText style={[styles.sectionLabel, { color: mutedColor }]}>RECENT</ThemedText>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.recentContactsScroll}
        >
          {recentContacts.map((contact) => (
            <Pressable
              key={contact.id}
              onPress={() => setSelectedContact(contact)}
              style={styles.recentContact}
            >
              <View style={styles.avatarContainer}>
                <View style={[styles.avatar, { backgroundColor: `${primaryColor}20` }]}>
                  <ThemedText style={styles.avatarText}>{contact.avatar}</ThemedText>
                </View>
                {contact.verified && (
                  <View style={[styles.verifiedBadge, { backgroundColor: primaryColor }]}>
                    <Ionicons name="checkmark" size={10} color="#fff" />
                  </View>
                )}
              </View>
              <ThemedText style={[styles.recentContactName, { color: mutedColor }]} numberOfLines={1}>
                {contact.name.split(' ')[0]}
              </ThemedText>
            </Pressable>
          ))}
        </ScrollView>
      </View>
    );
  };

  const handleAddContact = () => {
    if (!newContactName.trim() || !newContactHandle.trim()) return;

    const initials = newContactName
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);

    const newContact: LocalContact = {
      id: Date.now().toString(),
      name: newContactName.trim(),
      handle: newContactHandle.trim(),
      avatar: initials,
      recent: true,
      verified: false,
    };

    setContactsList([newContact, ...contactsList]);
    setNewContactName('');
    setNewContactHandle('');
    setShowAddContact(false);
    setShowAllContacts(true);
  };

  const handleCancelAddContact = () => {
    setShowAddContact(false);
    setNewContactName('');
    setNewContactHandle('');
  };

  const renderContactsList = () => (
    <View style={styles.section}>
      <View style={styles.sectionHeaderRow}>
        <Pressable
          onPress={() => setShowAllContacts(!showAllContacts)}
          style={styles.contactsHeaderLeft}
        >
          <ThemedText style={[styles.sectionLabel, { color: mutedColor }]}>
            ALL CONTACTS ({filteredContacts.length})
          </ThemedText>
          <Ionicons
            name={showAllContacts ? 'chevron-up' : 'chevron-down'}
            size={16}
            color={mutedColor}
          />
        </Pressable>
        <Pressable
          onPress={() => setShowAddContact(true)}
          style={[styles.addContactButton, { backgroundColor: `${primaryColor}15` }]}
        >
          <Ionicons name="person-add" size={12} color={primaryColor} />
          <ThemedText style={[styles.addContactText, { color: primaryColor }]}>Add</ThemedText>
        </Pressable>
      </View>

      {/* Add Contact Form */}
      {showAddContact && (
        <View style={[styles.addContactForm, { backgroundColor: `${primaryColor}08`, borderColor: `${primaryColor}25` }]}>
          <View style={styles.addContactFormHeader}>
            <ThemedText style={styles.addContactFormTitle}>New Contact</ThemedText>
            <Pressable
              onPress={handleCancelAddContact}
              style={({ pressed }) => [styles.closeButton, pressed && { opacity: 0.7 }]}
            >
              <Ionicons name="close" size={18} color={mutedColor} />
            </Pressable>
          </View>

          <View style={styles.addContactInputs}>
            <TextInput
              value={newContactName}
              onChangeText={setNewContactName}
              placeholder="Name"
              placeholderTextColor={mutedColor}
              style={[styles.addContactInput, { backgroundColor: isDark ? '#27272a' : '#e4e4e7', color: textColor }]}
            />
            <TextInput
              value={newContactHandle}
              onChangeText={setNewContactHandle}
              placeholder="ENS, address, or handle"
              placeholderTextColor={mutedColor}
              style={[styles.addContactInput, { backgroundColor: isDark ? '#27272a' : '#e4e4e7', color: textColor }]}
              autoCapitalize="none"
            />
          </View>

          <View style={styles.addContactButtons}>
            <Pressable
              onPress={handleCancelAddContact}
              style={({ pressed }) => [
                styles.addContactCancelButton,
                { backgroundColor: isDark ? '#27272a' : '#e4e4e7' },
                pressed && { opacity: 0.7 },
              ]}
            >
              <ThemedText style={[styles.addContactCancelText, { color: mutedColor }]}>Cancel</ThemedText>
            </Pressable>
            <Pressable
              onPress={handleAddContact}
              disabled={!newContactName.trim() || !newContactHandle.trim()}
              style={({ pressed }) => [
                styles.addContactSaveButton,
                { backgroundColor: primaryColor },
                (!newContactName.trim() || !newContactHandle.trim()) && { opacity: 0.5 },
                pressed && { opacity: 0.9 },
              ]}
            >
              <ThemedText style={styles.addContactSaveText}>Save Contact</ThemedText>
            </Pressable>
          </View>
        </View>
      )}
      {showAllContacts && (
        <View style={styles.contactsList}>
          {filteredContacts.length === 0 ? (
            <View style={styles.emptyContactsContainer}>
              <View style={[styles.emptyContactsIcon, { backgroundColor: `${primaryColor}10` }]}>
                <Ionicons name="people-outline" size={24} color={primaryColor} />
              </View>
              <ThemedText style={[styles.emptyContactsText, { color: mutedColor }]}>
                No contacts yet
              </ThemedText>
              <ThemedText style={[styles.emptyContactsSubtext, { color: mutedColor }]}>
                Add contacts to send money quickly
              </ThemedText>
            </View>
          ) : (
            filteredContacts.map((contact) => (
              <Pressable
                key={contact.id}
                onPress={() => setSelectedContact(contact)}
                style={({ pressed }) => [
                  styles.contactItem,
                  pressed && { opacity: 0.7 },
                ]}
              >
                <View style={styles.avatarContainer}>
                  <View style={[styles.avatarSmall, { backgroundColor: `${primaryColor}20` }]}>
                    <ThemedText style={styles.avatarTextSmall}>{contact.avatar}</ThemedText>
                  </View>
                  {contact.verified && (
                    <View style={[styles.verifiedBadgeSmall, { backgroundColor: primaryColor }]}>
                      <Ionicons name="checkmark" size={8} color="#fff" />
                    </View>
                  )}
                </View>
                <View style={styles.contactInfo}>
                  <ThemedText style={styles.contactName}>{contact.name}</ThemedText>
                  <ThemedText style={[styles.contactHandle, { color: mutedColor }]}>{contact.handle}</ThemedText>
                </View>
                <Ionicons name="chevron-forward" size={16} color={mutedColor} />
              </Pressable>
            ))
          )}
        </View>
      )}
    </View>
  );

  const renderRecentActivity = () => (
    <ThemedView style={styles.card} lightColor="#f4f4f5" darkColor="#1c1c1e">
      <ThemedText style={[styles.sectionLabel, { color: mutedColor }]}>RECENT ACTIVITY</ThemedText>
      {recentTransfers.length === 0 ? (
        <View style={styles.emptyActivityContainer}>
          <View style={[styles.emptyActivityIcon, { backgroundColor: `${primaryColor}10` }]}>
            <Ionicons name="swap-horizontal-outline" size={24} color={primaryColor} />
          </View>
          <ThemedText style={[styles.emptyActivityText, { color: mutedColor }]}>
            No transfers yet
          </ThemedText>
          <ThemedText style={[styles.emptyActivitySubtext, { color: mutedColor }]}>
            Your transfer history will appear here
          </ThemedText>
        </View>
      ) : (
        recentTransfers.slice(0, 3).map((transfer) => (
          <View key={transfer.id} style={styles.activityItem}>
            <View
              style={[
                styles.activityIcon,
                {
                  backgroundColor:
                    transfer.type === 'sent'
                      ? 'rgba(249, 115, 22, 0.1)'
                      : transfer.type === 'received'
                      ? 'rgba(34, 197, 94, 0.1)'
                      : `${primaryColor}15`,
                },
              ]}
            >
              <Ionicons
                name={
                  transfer.type === 'sent'
                    ? 'arrow-up'
                    : transfer.type === 'received'
                    ? 'arrow-down'
                    : 'document-text'
                }
                size={16}
                color={
                  transfer.type === 'sent'
                    ? '#f97316'
                    : transfer.type === 'received'
                    ? '#22c55e'
                    : primaryColor
                }
              />
            </View>
            <View style={styles.activityInfo}>
              <ThemedText style={styles.activityLabel}>
                {transfer.type === 'sent'
                  ? 'Sent to'
                  : transfer.type === 'received'
                  ? 'From'
                  : 'Requested from'}{' '}
                {transfer.contact.name.split(' ')[0]}
              </ThemedText>
              <ThemedText style={[styles.activityTime, { color: mutedColor }]}>
                {transfer.timestamp}
              </ThemedText>
            </View>
            <View style={styles.activityAmountContainer}>
              <ThemedText
                style={[
                  styles.activityAmount,
                  transfer.type === 'received' && { color: '#22c55e' },
                ]}
              >
                {transfer.type === 'received' ? '+' : transfer.type === 'sent' ? '-' : ''}
                {transfer.amount} {transfer.token}
              </ThemedText>
              {transfer.status === 'pending' && (
                <ThemedText style={styles.pendingLabel}>Pending</ThemedText>
              )}
            </View>
          </View>
        ))
      )}
    </ThemedView>
  );

  const renderAmountEntry = () => (
    <ThemedView style={styles.card} lightColor="#f4f4f5" darkColor="#1c1c1e">
      {/* Selected Contact */}
      <Pressable onPress={() => setSelectedContact(null)} style={styles.selectedContactRow}>
        <View style={styles.avatarContainer}>
          <View style={[styles.avatar, { backgroundColor: `${primaryColor}20` }]}>
            <ThemedText style={styles.avatarText}>{selectedContact?.avatar}</ThemedText>
          </View>
          {selectedContact?.verified && (
            <View style={[styles.verifiedBadge, { backgroundColor: primaryColor }]}>
              <Ionicons name="checkmark" size={10} color="#fff" />
            </View>
          )}
        </View>
        <View style={styles.selectedContactInfo}>
          <ThemedText style={[styles.sendingToLabel, { color: mutedColor }]}>
            {mode === 'send' ? 'Sending to' : 'Requesting from'}
          </ThemedText>
          <ThemedText style={styles.selectedContactName}>{selectedContact?.name}</ThemedText>
        </View>
        <ThemedText style={[styles.changeText, { color: primaryColor }]}>Change</ThemedText>
      </Pressable>

      {/* Amount Input */}
      <View style={styles.amountInputContainer}>
        <View style={styles.amountRow}>
          <ThemedText style={[styles.currencySymbol, { color: mutedColor }]}>$</ThemedText>
          <TextInput
            value={amount}
            onChangeText={(text) => setAmount(text.replace(/[^0-9.]/g, ''))}
            placeholder="0"
            placeholderTextColor={mutedColor}
            keyboardType="decimal-pad"
            style={[styles.amountInput, { color: textColor }]}
          />
        </View>

        {/* Quick amounts */}
        <View style={styles.quickAmounts}>
          {['25', '50', '100', '500'].map((amt) => (
            <Pressable
              key={amt}
              onPress={() => setAmount(amt)}
              style={[styles.quickAmountButton, { backgroundColor: isDark ? '#27272a' : '#e4e4e7' }]}
            >
              <ThemedText style={[styles.quickAmountText, { color: mutedColor }]}>${amt}</ThemedText>
            </Pressable>
          ))}
        </View>
      </View>

      {/* Token Selector (Send mode only) */}
      {mode === 'send' && (
        <View style={styles.tokenSection}>
          <ThemedText style={[styles.tokenLabel, { color: mutedColor }]}>PAY WITH</ThemedText>
          {tokensLoading ? (
            <View style={styles.tokenLoadingContainer}>
              <ActivityIndicator size="small" color={primaryColor} />
              <ThemedText style={[styles.tokenLoadingText, { color: mutedColor }]}>Loading tokens...</ThemedText>
            </View>
          ) : tokens.length === 0 ? (
            <View style={styles.tokenEmptyContainer}>
              <ThemedText style={[styles.tokenEmptyText, { color: mutedColor }]}>
                {walletAddress ? 'No tokens found' : 'Connect wallet to see tokens'}
              </ThemedText>
            </View>
          ) : (
            <View style={styles.tokenList}>
              {tokens.map((token) => (
                <Pressable
                  key={token.symbol}
                  onPress={() => setSelectedToken(token.symbol)}
                  style={[
                    styles.tokenButton,
                    {
                      backgroundColor:
                        selectedToken === token.symbol
                          ? `${primaryColor}15`
                          : isDark
                          ? '#27272a'
                          : '#e4e4e7',
                      borderColor: selectedToken === token.symbol ? `${primaryColor}40` : 'transparent',
                      borderWidth: selectedToken === token.symbol ? 1 : 0,
                    },
                  ]}
                >
                  <ThemedText style={styles.tokenSymbol}>{token.symbol}</ThemedText>
                  <ThemedText style={[styles.tokenBalance, { color: mutedColor }]}>
                    {typeof token.balance === 'number' ? token.balance.toLocaleString() : token.balance}
                  </ThemedText>
                </Pressable>
              ))}
            </View>
          )}
        </View>
      )}

      {/* Settlement Currency Selector (Send mode only) */}
      {mode === 'send' && selectedPaymentToken && (
        <SettlementSelector
          selectedToken={settlementToken}
          availableTokens={availableTokens}
          paymentMint={selectedPaymentToken.mint}
          isLoadingQuote={isLoadingQuote}
          estimatedOutput={estimatedReceivedFormatted}
          quoteError={quoteError}
          needsSwap={needsSwap}
          onSelect={setSettlementToken}
          disabled={!amount || parseFloat(amount) <= 0}
        />
      )}

      {/* Memo */}
      <View style={[styles.memoContainer, { backgroundColor: isDark ? '#27272a' : '#e4e4e7' }]}>
        <Ionicons name="document-text-outline" size={16} color={mutedColor} />
        <TextInput
          value={memo}
          onChangeText={setMemo}
          placeholder={mode === 'send' ? 'Add a note (optional)' : "What's this for?"}
          placeholderTextColor={mutedColor}
          style={[styles.memoInput, { color: textColor }]}
        />
      </View>
    </ThemedView>
  );

  const renderTransferDetails = () => (
    <ThemedView style={styles.card} lightColor="#f4f4f5" darkColor="#1c1c1e">
      <View style={styles.detailRow}>
        <ThemedText style={[styles.detailLabel, { color: mutedColor }]}>Network fee</ThemedText>
        <View style={styles.detailValue}>
          <Ionicons name="flash" size={12} color="#22c55e" />
          <ThemedText style={styles.detailValueText}>~$0.02</ThemedText>
        </View>
      </View>
      <View style={styles.detailRow}>
        <ThemedText style={[styles.detailLabel, { color: mutedColor }]}>Arrives in</ThemedText>
        <ThemedText style={styles.detailValueText}>Instant</ThemedText>
      </View>
      <View style={styles.detailRow}>
        <ThemedText style={[styles.detailLabel, { color: mutedColor }]}>Route</ThemedText>
        <View style={styles.detailValue}>
          <Ionicons name="sparkles" size={12} color={primaryColor} />
          <ThemedText style={styles.detailValueText}>AI Optimized</ThemedText>
        </View>
      </View>
    </ThemedView>
  );

  const renderSendButton = () => (
    <Pressable
      onPress={handleSend}
      disabled={!amount || parseFloat(amount) <= 0}
      style={({ pressed }) => [
        styles.sendButton,
        { backgroundColor: primaryColor },
        (!amount || parseFloat(amount) <= 0) && styles.sendButtonDisabled,
        pressed && { opacity: 0.9 },
      ]}
    >
      <Ionicons name="arrow-up" size={20} color="#fff" />
      <ThemedText style={styles.sendButtonText}>
        Send {amount ? `$${amount}` : ''} {selectedToken}
      </ThemedText>
    </Pressable>
  );

  const renderRequestButton = () => (
    <Pressable
      onPress={handleRequest}
      disabled={!amount || parseFloat(amount) <= 0}
      style={({ pressed }) => [
        styles.sendButton,
        { backgroundColor: primaryColor },
        (!amount || parseFloat(amount) <= 0) && styles.sendButtonDisabled,
        pressed && { opacity: 0.9 },
      ]}
    >
      <Ionicons name="arrow-forward" size={20} color="#fff" />
      <ThemedText style={styles.sendButtonText}>Request ${amount || '0'}</ThemedText>
    </Pressable>
  );

  const renderReceiveMode = () => (
    <View style={styles.receiveContainer}>
      <ThemedView style={styles.card} lightColor="#f4f4f5" darkColor="#1c1c1e">
        {/* QR Code */}
        <View style={styles.qrContainer}>
          <View style={styles.qrCode}>
            {fullAddress ? (
              <QRCode
                value={`solana:${fullAddress}`}
                size={160}
                backgroundColor="#fff"
                color="#18181b"
              />
            ) : (
              <View style={styles.qrInner}>
                <Ionicons name="qr-code" size={96} color="#18181b" />
              </View>
            )}
          </View>
          <ThemedText style={[styles.qrHint, { color: mutedColor }]}>
            Scan to send funds to this wallet
          </ThemedText>
        </View>

        {/* Address */}
        <View style={styles.addressSection}>
          <ThemedText style={[styles.sectionLabel, { color: mutedColor, textAlign: 'center' }]}>
            YOUR ADDRESS
          </ThemedText>
          <Pressable
            onPress={handleCopy}
            style={[styles.addressButton, { backgroundColor: isDark ? '#27272a' : '#e4e4e7' }]}
          >
            <ThemedText style={styles.addressText}>{displayAddress}</ThemedText>
            <Ionicons
              name={copied ? 'checkmark' : 'copy-outline'}
              size={16}
              color={copied ? '#22c55e' : mutedColor}
            />
          </Pressable>
        </View>

        {/* Networks */}
        <View style={styles.networksSection}>
          <ThemedText style={[styles.sectionLabel, { color: mutedColor, textAlign: 'center' }]}>
            SUPPORTED NETWORKS
          </ThemedText>
          <View style={styles.networkPills}>
            {['Ethereum', 'Base', 'Arbitrum', 'Optimism', 'Polygon'].map((network) => (
              <View
                key={network}
                style={[styles.networkPill, { backgroundColor: isDark ? '#27272a' : '#e4e4e7' }]}
              >
                <ThemedText style={[styles.networkPillText, { color: mutedColor }]}>{network}</ThemedText>
              </View>
            ))}
          </View>
        </View>
      </ThemedView>

      {/* Share Options */}
      <ThemedView style={styles.card} lightColor="#f4f4f5" darkColor="#1c1c1e">
        <View style={styles.shareOptions}>
          {[
            { icon: 'people' as const, label: 'Share' },
            { icon: 'document-text' as const, label: 'Invoice' },
            { icon: 'repeat' as const, label: 'Recurring' },
          ].map((action) => (
            <Pressable
              key={action.label}
              style={[styles.shareOption, { backgroundColor: isDark ? '#27272a' : '#e4e4e7' }]}
            >
              <Ionicons name={action.icon} size={20} color={primaryColor} />
              <ThemedText style={[styles.shareOptionText, { color: mutedColor }]}>{action.label}</ThemedText>
            </Pressable>
          ))}
        </View>
      </ThemedView>
    </View>
  );

  const renderPendingRequests = () => {
    const pendingRequests = recentTransfers.filter(
      (t) => t.type === 'requested' && t.status === 'pending'
    );

    if (pendingRequests.length === 0) return null;

    return (
      <ThemedView style={styles.card} lightColor="#f4f4f5" darkColor="#1c1c1e">
        <View style={styles.sectionHeaderRow}>
          <ThemedText style={[styles.sectionLabel, { color: mutedColor }]}>PENDING REQUESTS</ThemedText>
          <ThemedText style={[styles.viewAllText, { color: primaryColor }]}>View all</ThemedText>
        </View>
        {pendingRequests.map((request) => (
          <View
            key={request.id}
            style={[styles.pendingItem, { backgroundColor: 'rgba(251, 191, 36, 0.05)', borderColor: 'rgba(251, 191, 36, 0.1)' }]}
          >
            <View style={[styles.pendingIcon, { backgroundColor: 'rgba(251, 191, 36, 0.1)' }]}>
              <Ionicons name="time" size={16} color="#fbbf24" />
            </View>
            <View style={styles.pendingInfo}>
              <ThemedText style={styles.pendingName}>From {request.contact.name}</ThemedText>
              <ThemedText style={[styles.pendingTime, { color: mutedColor }]}>{request.timestamp}</ThemedText>
            </View>
            <View style={styles.pendingAmountContainer}>
              <ThemedText style={styles.pendingAmount}>
                ${request.amount} {request.token}
              </ThemedText>
              <ThemedText style={[styles.remindText, { color: primaryColor }]}>Remind</ThemedText>
            </View>
          </View>
        ))}
      </ThemedView>
    );
  };

  return (
    <ThemedView style={styles.container}>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <View style={{ height: insets.top }} />

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Header */}
        <View style={styles.header}>
          <ThemedText style={styles.title}>Move Money</ThemedText>
          <Pressable
            style={styles.historyButton}
            onPress={() => router.push('/history')}
          >
            <Ionicons name="time-outline" size={14} color={primaryColor} />
            <ThemedText style={[styles.historyText, { color: primaryColor }]}>History</ThemedText>
          </Pressable>
        </View>

        {/* Mode Tabs */}
        {renderModeTabs()}

        {/* SEND MODE */}
        {mode === 'send' && (
          <View style={styles.modeContent}>
            {!selectedContact ? (
              <>
                {/* Search */}
                <ThemedView style={styles.card} lightColor="#f4f4f5" darkColor="#1c1c1e">
                  <View style={[styles.searchContainer, { backgroundColor: isDark ? '#27272a' : '#e4e4e7' }]}>
                    <Ionicons name="search" size={16} color={mutedColor} />
                    <TextInput
                      value={searchQuery}
                      onChangeText={setSearchQuery}
                      placeholder="Search name, ENS, or address..."
                      placeholderTextColor={mutedColor}
                      style={[styles.searchInput, { color: textColor }]}
                    />
                    <Ionicons name="sparkles" size={16} color={primaryColor} />
                  </View>
                  {renderRecentContacts()}
                  {renderContactsList()}
                </ThemedView>
                {renderRecentActivity()}
              </>
            ) : (
              <>
                {renderAmountEntry()}
                {renderTransferDetails()}
                {renderSendButton()}
              </>
            )}
          </View>
        )}

        {/* RECEIVE MODE */}
        {mode === 'receive' && renderReceiveMode()}

        {/* REQUEST MODE */}
        {mode === 'request' && (
          <View style={styles.modeContent}>
            {!selectedContact ? (
              <>
                <ThemedView style={styles.card} lightColor="#f4f4f5" darkColor="#1c1c1e">
                  <View style={[styles.searchContainer, { backgroundColor: isDark ? '#27272a' : '#e4e4e7' }]}>
                    <Ionicons name="search" size={16} color={mutedColor} />
                    <TextInput
                      value={searchQuery}
                      onChangeText={setSearchQuery}
                      placeholder="Request from..."
                      placeholderTextColor={mutedColor}
                      style={[styles.searchInput, { color: textColor }]}
                    />
                  </View>
                  <View style={styles.contactsList}>
                    {filteredContacts.map((contact) => (
                      <Pressable
                        key={contact.id}
                        onPress={() => setSelectedContact(contact)}
                        style={({ pressed }) => [
                          styles.contactItem,
                          pressed && { opacity: 0.7 },
                        ]}
                      >
                        <View style={[styles.avatarSmall, { backgroundColor: `${primaryColor}20` }]}>
                          <ThemedText style={styles.avatarTextSmall}>{contact.avatar}</ThemedText>
                        </View>
                        <View style={styles.contactInfo}>
                          <ThemedText style={styles.contactName}>{contact.name}</ThemedText>
                          <ThemedText style={[styles.contactHandle, { color: mutedColor }]}>{contact.handle}</ThemedText>
                        </View>
                        <Ionicons name="chevron-forward" size={16} color={mutedColor} />
                      </Pressable>
                    ))}
                  </View>
                </ThemedView>
                {renderPendingRequests()}
              </>
            ) : (
              <>
                {renderAmountEntry()}
                {renderRequestButton()}
              </>
            )}
          </View>
        )}
      </ScrollView>

      {/* Backdrop Overlay */}
      <AnimatedPressable
        style={[styles.backdrop, backdropAnimatedStyle]}
        onPress={handleBackdropPress}
      />

      {/* Command Bar */}
      <KeyboardStickyView offset={{ closed: 0, opened: insets.bottom }} style={styles.stickyCommandBar}>
        <CommandBar
          onSend={handleSendMessage}
          onCamera={handleCamera}
          onMic={handleMic}
          onFocusChange={handleCommandBarFocusChange}
        />
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
    paddingHorizontal: 16,
    paddingBottom: 100,
    gap: 16,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    zIndex: 10,
  },
  stickyCommandBar: {
    zIndex: 20,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 8,
  },
  title: {
    fontSize: 20,
    fontWeight: '600',
  },
  historyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  historyText: {
    fontSize: 12,
  },
  modeTabs: {
    flexDirection: 'row',
    padding: 4,
    borderRadius: 12,
    gap: 4,
  },
  modeTab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
  },
  modeTabText: {
    fontSize: 13,
    fontWeight: '500',
  },
  modeContent: {
    gap: 16,
  },
  card: {
    borderRadius: 16,
    padding: 16,
    gap: 16,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    borderRadius: 12,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
  },
  section: {
    gap: 8,
  },
  sectionLabel: {
    fontSize: 10,
    letterSpacing: 2,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  contactsHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  addContactButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 20,
  },
  addContactText: {
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  addContactForm: {
    padding: 16,
    borderRadius: 14,
    borderWidth: 1,
    gap: 14,
  },
  addContactFormHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  addContactFormTitle: {
    fontSize: 14,
    fontWeight: '500',
  },
  closeButton: {
    padding: 4,
  },
  addContactInputs: {
    gap: 10,
  },
  addContactInput: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 12,
    fontSize: 14,
  },
  addContactButtons: {
    flexDirection: 'row',
    gap: 10,
  },
  addContactCancelButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
  },
  addContactCancelText: {
    fontSize: 14,
  },
  addContactSaveButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
  },
  addContactSaveText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '500',
  },
  recentContactsScroll: {
    gap: 16,
  },
  recentContact: {
    alignItems: 'center',
    gap: 8,
    width: 64,
  },
  avatarContainer: {
    position: 'relative',
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontSize: 14,
    fontWeight: '500',
  },
  avatarSmall: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarTextSmall: {
    fontSize: 12,
    fontWeight: '500',
  },
  verifiedBadge: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  verifiedBadgeSmall: {
    position: 'absolute',
    bottom: -1,
    right: -1,
    width: 16,
    height: 16,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  recentContactName: {
    fontSize: 12,
    textAlign: 'center',
  },
  contactsList: {
    gap: 4,
  },
  contactItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 8,
  },
  contactInfo: {
    flex: 1,
  },
  contactName: {
    fontSize: 14,
    fontWeight: '500',
  },
  contactHandle: {
    fontSize: 12,
  },
  activityItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 8,
  },
  activityIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  activityInfo: {
    flex: 1,
  },
  activityLabel: {
    fontSize: 14,
  },
  activityTime: {
    fontSize: 12,
  },
  activityAmountContainer: {
    alignItems: 'flex-end',
  },
  activityAmount: {
    fontSize: 14,
    fontWeight: '500',
  },
  pendingLabel: {
    fontSize: 10,
    color: '#fbbf24',
  },
  selectedContactRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  selectedContactInfo: {
    flex: 1,
  },
  sendingToLabel: {
    fontSize: 12,
  },
  selectedContactName: {
    fontSize: 16,
    fontWeight: '500',
  },
  changeText: {
    fontSize: 12,
  },
  amountInputContainer: {
    gap: 16,
    paddingVertical: 8,
  },
  amountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  currencySymbol: {
    fontSize: 32,
    fontWeight: '300',
  },
  amountInput: {
    fontSize: 48,
    fontWeight: '300',
    textAlign: 'center',
    minWidth: 100,
  },
  quickAmounts: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
  },
  quickAmountButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
  },
  quickAmountText: {
    fontSize: 12,
  },
  tokenSection: {
    gap: 8,
    alignItems: 'center',
  },
  tokenLabel: {
    fontSize: 10,
    letterSpacing: 2,
  },
  tokenList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 8,
  },
  tokenButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
  },
  tokenSymbol: {
    fontSize: 14,
    fontWeight: '500',
  },
  tokenBalance: {
    fontSize: 12,
  },
  memoContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    borderRadius: 12,
  },
  memoInput: {
    flex: 1,
    fontSize: 14,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  detailLabel: {
    fontSize: 14,
  },
  detailValue: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  detailValueText: {
    fontSize: 14,
  },
  sendButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 16,
    borderRadius: 16,
  },
  sendButtonDisabled: {
    opacity: 0.5,
  },
  sendButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '500',
  },
  receiveContainer: {
    gap: 16,
  },
  qrContainer: {
    alignItems: 'center',
    gap: 16,
  },
  qrCode: {
    width: 192,
    height: 192,
    borderRadius: 16,
    backgroundColor: '#fff',
    padding: 12,
    position: 'relative',
  },
  qrInner: {
    flex: 1,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  qrLogo: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    width: 48,
    height: 48,
    marginTop: -24,
    marginLeft: -24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  qrLogoText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
  },
  qrHint: {
    fontSize: 14,
  },
  addressSection: {
    gap: 8,
    alignItems: 'center',
  },
  addressButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 12,
  },
  addressText: {
    fontFamily: 'monospace',
    fontSize: 14,
  },
  networksSection: {
    gap: 8,
  },
  networkPills: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 8,
  },
  networkPill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  networkPillText: {
    fontSize: 12,
  },
  shareOptions: {
    flexDirection: 'row',
    gap: 12,
  },
  shareOption: {
    flex: 1,
    alignItems: 'center',
    gap: 8,
    paddingVertical: 16,
    borderRadius: 12,
  },
  shareOptionText: {
    fontSize: 12,
  },
  viewAllText: {
    fontSize: 12,
  },
  pendingItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  pendingIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pendingInfo: {
    flex: 1,
  },
  pendingName: {
    fontSize: 14,
  },
  pendingTime: {
    fontSize: 12,
  },
  pendingAmountContainer: {
    alignItems: 'flex-end',
  },
  pendingAmount: {
    fontSize: 14,
    fontWeight: '500',
  },
  remindText: {
    fontSize: 10,
  },
  // Token loading/empty states
  tokenLoadingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 16,
  },
  tokenLoadingText: {
    fontSize: 12,
  },
  tokenEmptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
  },
  tokenEmptyText: {
    fontSize: 12,
  },
  // Empty contacts state
  emptyContactsContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 24,
    gap: 8,
  },
  emptyContactsIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  emptyContactsText: {
    fontSize: 14,
    fontWeight: '500',
  },
  emptyContactsSubtext: {
    fontSize: 12,
    textAlign: 'center',
  },
  // Empty activity state
  emptyActivityContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 24,
    gap: 8,
  },
  emptyActivityIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  emptyActivityText: {
    fontSize: 14,
    fontWeight: '500',
  },
  emptyActivitySubtext: {
    fontSize: 12,
    textAlign: 'center',
  },
});
