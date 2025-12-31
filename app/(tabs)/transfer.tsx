import { useState } from 'react';
import { StyleSheet, View, Pressable, ScrollView, TextInput, Keyboard, Alert, Text } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { KeyboardStickyView } from 'react-native-keyboard-controller';
import Animated, { useSharedValue, useAnimatedStyle, withTiming } from 'react-native-reanimated';
import * as Clipboard from 'expo-clipboard';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { CommandBar } from '@/components/command-bar';
import { useThemeColor } from '@/hooks/use-theme-color';
import { useColorScheme } from '@/hooks/use-color-scheme';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

type TransferMode = 'send' | 'receive' | 'request';

interface Contact {
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
  contact: Contact;
  amount: number;
  token: string;
  timestamp: string;
  status: 'completed' | 'pending' | 'expired';
}

const initialContacts: Contact[] = [
  { id: '1', name: 'Alex Chen', handle: 'alex.eth', avatar: 'AC', recent: true, verified: true },
  { id: '2', name: 'Sarah Miller', handle: '0x7a3...f29', avatar: 'SM', recent: true },
  { id: '3', name: 'MetaMask Vault', handle: 'vault.metamask.eth', avatar: 'MM', verified: true },
  { id: '4', name: 'Jordan Lee', handle: 'jordan.base', avatar: 'JL', recent: true, verified: true },
  { id: '5', name: 'Dev Wallet', handle: '0x9b2...c18', avatar: 'DW' },
  { id: '6', name: 'Emma Wilson', handle: 'emma.ens', avatar: 'EW', verified: true },
];

const recentTransfers: RecentTransfer[] = [
  {
    id: '1',
    type: 'sent',
    contact: { id: '1', name: 'Alex Chen', handle: 'alex.eth', avatar: 'AC', verified: true },
    amount: 150,
    token: 'USDC',
    timestamp: '2 hours ago',
    status: 'completed',
  },
  {
    id: '2',
    type: 'received',
    contact: { id: '4', name: 'Jordan Lee', handle: 'jordan.base', avatar: 'JL', verified: true },
    amount: 0.25,
    token: 'ETH',
    timestamp: 'Yesterday',
    status: 'completed',
  },
  {
    id: '3',
    type: 'requested',
    contact: { id: '2', name: 'Sarah Miller', handle: '0x7a3...f29', avatar: 'SM' },
    amount: 75,
    token: 'USDC',
    timestamp: '2 days ago',
    status: 'pending',
  },
];

const tokens = [
  { symbol: 'USDC', balance: 2847.5 },
  { symbol: 'ETH', balance: 1.834 },
  { symbol: 'SOL', balance: 24.5 },
  { symbol: 'USDT', balance: 500 },
];

export default function TransferScreen() {
  const insets = useSafeAreaInsets();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  const primaryColor = useThemeColor({}, 'tint');
  const mutedColor = useThemeColor({ light: '#687076', dark: '#9BA1A6' }, 'icon');
  const textColor = useThemeColor({}, 'text');

  const [mode, setMode] = useState<TransferMode>('send');
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);
  const [amount, setAmount] = useState('');
  const [selectedToken, setSelectedToken] = useState('USDC');
  const [searchQuery, setSearchQuery] = useState('');
  const [copied, setCopied] = useState(false);
  const [memo, setMemo] = useState('');
  const [showAllContacts, setShowAllContacts] = useState(false);
  const [showAddContact, setShowAddContact] = useState(false);
  const [newContactName, setNewContactName] = useState('');
  const [newContactHandle, setNewContactHandle] = useState('');
  const [contactsList, setContactsList] = useState<Contact[]>(initialContacts);

  const walletAddress = '0x7F3a...8b2E';
  const fullAddress = '0x7F3a92Bc4D1e8A6f5C0B9E7D2F4A8b2E';

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
    Alert.alert('Sending', `Sending $${amount} ${selectedToken} to ${selectedContact?.handle}`);
  };

  const handleRequest = () => {
    Alert.alert('Request', `Requesting $${amount} from ${selectedContact?.name}`);
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

  const renderRecentContacts = () => (
    <View style={styles.section}>
      <ThemedText style={[styles.sectionLabel, { color: mutedColor }]}>RECENT</ThemedText>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.recentContactsScroll}
      >
        {contactsList.filter((c) => c.recent).map((contact) => (
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

  const handleAddContact = () => {
    if (!newContactName.trim() || !newContactHandle.trim()) return;

    const initials = newContactName
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);

    const newContact: Contact = {
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
          {filteredContacts.map((contact) => (
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
          ))}
        </View>
      )}
    </View>
  );

  const renderRecentActivity = () => (
    <ThemedView style={styles.card} lightColor="#f4f4f5" darkColor="#1c1c1e">
      <ThemedText style={[styles.sectionLabel, { color: mutedColor }]}>RECENT ACTIVITY</ThemedText>
      {recentTransfers.slice(0, 3).map((transfer) => (
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
      ))}
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
                  {token.symbol === 'USDC' || token.symbol === 'USDT'
                    ? `$${token.balance.toLocaleString()}`
                    : token.balance.toFixed(3)}
                </ThemedText>
              </Pressable>
            ))}
          </View>
        </View>
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
        {/* QR Code Placeholder */}
        <View style={styles.qrContainer}>
          <View style={styles.qrCode}>
            <View style={styles.qrInner}>
              <Ionicons name="qr-code" size={96} color="#18181b" />
            </View>
            <View style={[styles.qrLogo, { backgroundColor: primaryColor }]}>
              <Text style={styles.qrLogoText}>N</Text>
            </View>
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
            <ThemedText style={styles.addressText}>{walletAddress}</ThemedText>
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
          <Pressable style={styles.historyButton}>
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
});
