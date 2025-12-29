import React, { useState, useCallback } from 'react';
import { View, Text, ScrollView, TextInput, TouchableOpacity, Alert, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import QRCode from 'react-native-qrcode-svg';
import { AmbientBackground, GlassCard, ContactAvatar } from '../../components/ui';
import { CommandBar } from '../../components/command';
import { colors, truncateAddress } from '../../lib/utils';
import { useWallets } from '../../stores/walletsConvex';
import { useCrypto } from '../../stores/cryptoConvex';
import { useAuth, useCurrentUserId } from '../../stores/authConvex';
import { useTurnkey } from '../../hooks/useTurnkey';
import { useMutation } from 'convex/react';
import { api } from '../../../convex/_generated/api';

// Turnkey configuration - these should come from environment variables
const TURNKEY_CONFIG = {
  organizationId: process.env.EXPO_PUBLIC_TURNKEY_ORGANIZATION_ID || '',
  rpId: process.env.EXPO_PUBLIC_TURNKEY_RP_ID || 'discard.app',
  apiBaseUrl: 'https://api.turnkey.com',
};

type TransferMode = 'send' | 'receive' | 'request';

interface Contact {
  id: string;
  name: string;
  handle: string;
  initials: string;
  verified?: boolean;
  recent?: boolean;
}

const mockContacts: Contact[] = [
  { id: '1', name: 'Alex Chen', handle: 'alex.eth', initials: 'AC', recent: true, verified: true },
  { id: '2', name: 'Sarah Miller', handle: '0x7a3...f29', initials: 'SM', recent: true },
  { id: '3', name: 'MetaMask Vault', handle: 'vault.metamask.eth', initials: 'MM', verified: true },
  { id: '4', name: 'Jordan Lee', handle: 'jordan.base', initials: 'JL', recent: true, verified: true },
  { id: '5', name: 'Dev Wallet', handle: '0x9b2...c18', initials: 'DW' },
  { id: '6', name: 'Emma Wilson', handle: 'emma.ens', initials: 'EW', verified: true },
];

const tokens = [
  { symbol: 'USDC', balance: 2847.5 },
  { symbol: 'ETH', balance: 1.834 },
  { symbol: 'SOL', balance: 24.5 },
  { symbol: 'USDT', balance: 500 },
];

export default function TransferScreen() {
  const [mode, setMode] = useState<TransferMode>('send');
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);
  const [amount, setAmount] = useState('');
  const [selectedToken, setSelectedToken] = useState('USDC');
  const [searchQuery, setSearchQuery] = useState('');
  const [memo, setMemo] = useState('');

  // Get auth state and user's Solana address
  const { user } = useAuth();
  const userId = useCurrentUserId();

  // Turnkey hook for wallet creation
  const turnkey = useTurnkey(userId, TURNKEY_CONFIG);

  // Mutation to update user's Solana address after wallet creation
  const updateSolanaAddress = useMutation(api.auth.passkeys.updateSolanaAddress);

  // Check if user has a real Solana address (not a placeholder)
  const hasRealWallet = user?.solanaAddress &&
    !user.solanaAddress.startsWith('derived_') &&
    !user.solanaAddress.startsWith('DevWa11et');

  const solanaAddress = hasRealWallet ? user.solanaAddress : turnkey.walletAddress;

  const filteredContacts = mockContacts.filter(
    (c) =>
      c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.handle.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleSend = () => {
    if (!amount || !selectedContact) return;
    Alert.alert('Send', `Send ${amount} ${selectedToken} to ${selectedContact.name}?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Confirm', onPress: () => Alert.alert('Success', 'Transaction sent!') },
    ]);
  };

  const handleCopy = useCallback(async (address: string) => {
    await Clipboard.setStringAsync(address);
    Alert.alert('Copied', 'Solana address copied to clipboard');
  }, []);

  const handleCreateWallet = useCallback(async () => {
    try {
      // Initialize Turnkey if not already
      if (!turnkey.isInitialized) {
        await turnkey.initialize();
      }

      // Create sub-organization and wallet
      const subOrg = await turnkey.createSubOrganization(user?.displayName || 'DisCard User');

      // Update user's Solana address in Convex
      if (subOrg.walletAddress) {
        await updateSolanaAddress({ solanaAddress: subOrg.walletAddress });
        Alert.alert('Success', 'Your Solana wallet has been created!');
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to create wallet';
      Alert.alert('Error', message);
    }
  }, [turnkey, user, updateSolanaAddress]);

  return (
    <AmbientBackground>
      <SafeAreaView style={{ flex: 1 }} edges={['top']}>
        <ScrollView className="flex-1" showsVerticalScrollIndicator={false}>
          {/* Header */}
          <View className="px-6 pt-6 pb-4">
            <View className="flex-row items-center justify-between mb-4">
              <Text className="text-2xl font-semibold text-foreground">Move Money</Text>
              <TouchableOpacity className="flex-row items-center">
                <Ionicons name="time-outline" size={16} color={colors.primary} />
                <Text className="text-sm text-primary ml-1.5">History</Text>
              </TouchableOpacity>
            </View>

            {/* Mode Tabs */}
            <View style={{ 
              flexDirection: 'row', 
              gap: 8,
              padding: 4,
              borderRadius: 12,
              backgroundColor: 'rgba(31, 41, 55, 0.3)',
            }}>
              {[
                { id: 'send' as const, icon: 'arrow-up', label: 'Send' },
                { id: 'receive' as const, icon: 'arrow-down', label: 'Receive' },
                { id: 'request' as const, icon: 'document-text', label: 'Request' },
              ].map((tab) => (
                <TouchableOpacity
                  key={tab.id}
                  onPress={() => {
                    setMode(tab.id);
                    setSelectedContact(null);
                    setAmount('');
                  }}
                  style={{
                    flex: 1,
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 8,
                    paddingVertical: 10,
                    paddingHorizontal: 16,
                    borderRadius: 8,
                    backgroundColor: mode === tab.id ? '#10B981' : 'transparent',
                  }}
                  activeOpacity={0.7}
                >
                  <Ionicons 
                    name={tab.icon as any} 
                    size={16} 
                    color={mode === tab.id ? '#FFFFFF' : '#9CA3AF'} 
                  />
                  <Text style={{
                    fontSize: 14,
                    fontWeight: '500',
                    color: mode === tab.id ? '#FFFFFF' : '#9CA3AF',
                  }}>
                    {tab.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Content */}
          <View className="px-6 pb-6">
            {mode === 'send' && (
              <SendMode
                selectedContact={selectedContact}
                setSelectedContact={setSelectedContact}
                amount={amount}
                setAmount={setAmount}
                selectedToken={selectedToken}
                setSelectedToken={setSelectedToken}
                searchQuery={searchQuery}
                setSearchQuery={setSearchQuery}
                filteredContacts={filteredContacts}
                tokens={tokens}
                memo={memo}
                setMemo={setMemo}
                onSend={handleSend}
              />
            )}
            {mode === 'receive' && (
              <ReceiveMode
                solanaAddress={solanaAddress}
                onCopy={handleCopy}
                onCreateWallet={handleCreateWallet}
                isCreatingWallet={turnkey.isLoading}
                hasRealWallet={!!solanaAddress}
              />
            )}
            {mode === 'request' && (
              <RequestMode
                selectedContact={selectedContact}
                setSelectedContact={setSelectedContact}
                amount={amount}
                setAmount={setAmount}
                searchQuery={searchQuery}
                setSearchQuery={setSearchQuery}
                filteredContacts={filteredContacts}
                memo={memo}
                setMemo={setMemo}
              />
            )}
          </View>
        </ScrollView>

        {/* Command Bar */}
        <CommandBar placeholder="What would you like to do?" />
      </SafeAreaView>
    </AmbientBackground>
  );
}

function SendMode({
  selectedContact,
  setSelectedContact,
  amount,
  setAmount,
  selectedToken,
  setSelectedToken,
  searchQuery,
  setSearchQuery,
  filteredContacts,
  tokens,
  memo,
  setMemo,
  onSend,
}: any) {
  if (!selectedContact) {
    return (
      <View>
        {/* Main Card - Search, Recent & Contacts */}
        <GlassCard className="mb-4">
          {/* Search */}
          <View 
            style={{ 
              flexDirection: 'row',
              alignItems: 'center',
              paddingHorizontal: 12,
              paddingVertical: 12,
              borderRadius: 12,
              backgroundColor: 'rgba(31, 41, 55, 0.3)',
            }}
          >
            <Ionicons name="search" size={16} color="#6B7280" />
            <TextInput
              placeholder="Search name, ENS, or address..."
              placeholderTextColor="#6B7280"
              value={searchQuery}
              onChangeText={setSearchQuery}
              style={{
                flex: 1,
                fontSize: 14,
                color: '#FFFFFF',
                paddingHorizontal: 12,
              }}
            />
            <Ionicons name="sparkles" size={16} color="#10B981" />
          </View>

          {/* Recent Contacts */}
          <View style={{ marginTop: 16 }}>
            <Text style={{ 
              fontSize: 10, 
              textTransform: 'uppercase', 
              letterSpacing: 1.5, 
              color: '#9CA3AF',
              marginBottom: 12,
            }}>
              Recent
            </Text>
            <ScrollView 
              horizontal 
              showsHorizontalScrollIndicator={false}
              style={{ marginHorizontal: -4 }}
              contentContainerStyle={{ paddingHorizontal: 4, gap: 12 }}
            >
              {filteredContacts.filter((c: Contact) => c.recent).map((contact: Contact) => (
                <TouchableOpacity
                  key={contact.id}
                  onPress={() => setSelectedContact(contact)}
                  style={{ alignItems: 'center', minWidth: 64 }}
                  activeOpacity={0.7}
                >
                  <View style={{ position: 'relative' }}>
                    <View style={{
                      width: 48,
                      height: 48,
                      borderRadius: 24,
                      alignItems: 'center',
                      justifyContent: 'center',
                      backgroundColor: 'rgba(16, 185, 129, 0.1)',
                    }}>
                      <Text style={{ fontSize: 14, fontWeight: '500', color: '#FFFFFF' }}>
                        {contact.initials}
                      </Text>
                    </View>
                    {contact.verified && (
                      <View style={{
                        position: 'absolute',
                        bottom: -2,
                        right: -2,
                        width: 16,
                        height: 16,
                        borderRadius: 8,
                        backgroundColor: '#10B981',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}>
                        <Ionicons name="checkmark" size={10} color="#FFFFFF" />
                      </View>
                    )}
                  </View>
                  <Text style={{ 
                    fontSize: 12, 
                    color: '#9CA3AF', 
                    marginTop: 8,
                    maxWidth: 64,
                  }} numberOfLines={1}>
                    {contact.name.split(' ')[0]}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>

          {/* All Contacts */}
          <View style={{ marginTop: 16 }}>
            <Text style={{ 
              fontSize: 10, 
              textTransform: 'uppercase', 
              letterSpacing: 1.5, 
              color: '#9CA3AF',
              marginBottom: 8,
            }}>
              All Contacts
            </Text>
            <View>
              {filteredContacts.map((contact: Contact) => (
                <TouchableOpacity
                  key={contact.id}
                  onPress={() => setSelectedContact(contact)}
                  style={{ 
                    flexDirection: 'row', 
                    alignItems: 'center', 
                    paddingVertical: 12,
                    paddingHorizontal: 12,
                    marginHorizontal: -12,
                    borderRadius: 12,
                  }}
                  activeOpacity={0.7}
                >
                  <View style={{ position: 'relative' }}>
                    <View style={{
                      width: 40,
                      height: 40,
                      borderRadius: 20,
                      alignItems: 'center',
                      justifyContent: 'center',
                      backgroundColor: 'rgba(16, 185, 129, 0.1)',
                    }}>
                      <Text style={{ fontSize: 14, fontWeight: '500', color: '#FFFFFF' }}>
                        {contact.initials}
                      </Text>
                    </View>
                    {contact.verified && (
                      <View style={{
                        position: 'absolute',
                        bottom: -2,
                        right: -2,
                        width: 14,
                        height: 14,
                        borderRadius: 7,
                        backgroundColor: '#10B981',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}>
                        <Ionicons name="checkmark" size={8} color="#FFFFFF" />
                      </View>
                    )}
                  </View>
                  <View style={{ flex: 1, marginLeft: 12 }}>
                    <Text style={{ fontSize: 14, fontWeight: '500', color: '#FFFFFF' }}>
                      {contact.name}
                    </Text>
                    <Text style={{ fontSize: 12, color: '#9CA3AF', marginTop: 1 }}>
                      {contact.handle}
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={16} color="#6B7280" />
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </GlassCard>
      </View>
    );
  }

  return (
    <View>
      {/* Selected Contact */}
      <GlassCard className="mb-4">
        <TouchableOpacity
          onPress={() => setSelectedContact(null)}
          className="flex-row items-center"
          activeOpacity={0.7}
        >
          <ContactAvatar
            initials={selectedContact.initials}
            name={selectedContact.name}
            handle={selectedContact.handle}
            verified={selectedContact.verified}
            size="md"
          />
          <View className="flex-1 ml-3">
            <Text className="text-xs text-muted-foreground">Sending to</Text>
            <Text className="text-base font-medium text-foreground">{selectedContact.name}</Text>
          </View>
          <Text className="text-xs text-primary">Change</Text>
        </TouchableOpacity>
      </GlassCard>

      {/* Amount Input */}
      <GlassCard className="mb-4">
        <View className="items-center py-4">
          <View className="flex-row items-center justify-center">
            <Text className="text-4xl font-light text-muted-foreground">$</Text>
            <TextInput
              value={amount}
              onChangeText={(text) => setAmount(text.replace(/[^0-9.]/g, ''))}
              placeholder="0"
              placeholderTextColor={colors.muted}
              keyboardType="decimal-pad"
              className="text-5xl font-light text-foreground w-48 text-center"
            />
          </View>

          {/* Quick amounts */}
          <View className="flex-row gap-2 mt-4">
            {['25', '50', '100', '500'].map((amt) => (
              <TouchableOpacity
                key={amt}
                onPress={() => setAmount(amt)}
                className="px-4 py-1.5 rounded-full bg-surface/30"
                activeOpacity={0.7}
              >
                <Text className="text-xs text-muted-foreground">${amt}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Token Selector */}
        <View className="border-t border-border/30 pt-4">
          <Text className="text-[10px] uppercase tracking-widest text-muted-foreground text-center mb-2">
            Pay with
          </Text>
          <View className="flex-row flex-wrap gap-2 justify-center">
            {tokens.map((token) => (
              <TouchableOpacity
                key={token.symbol}
                onPress={() => setSelectedToken(token.symbol)}
                className={`flex-row items-center gap-2 px-4 py-2 rounded-xl ${
                  selectedToken === token.symbol
                    ? 'bg-primary/10 border border-primary/30'
                    : 'bg-surface/30'
                }`}
                activeOpacity={0.7}
              >
                <Text className={`text-sm font-medium ${
                  selectedToken === token.symbol ? 'text-foreground' : 'text-muted-foreground'
                }`}>
                  {token.symbol}
                </Text>
                <Text className="text-xs text-muted-foreground">
                  {token.balance.toLocaleString()}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Memo */}
        <View className="flex-row items-center gap-3 mt-4 p-3 rounded-xl bg-surface/20">
          <Ionicons name="document-text-outline" size={16} color={colors.muted} />
          <TextInput
            placeholder="Add a note (optional)"
            placeholderTextColor={colors.muted}
            value={memo}
            onChangeText={setMemo}
            className="flex-1 text-sm text-foreground"
          />
        </View>
      </GlassCard>

      {/* Transfer Details */}
      <GlassCard className="mb-4">
        <View className="flex-row items-center justify-between mb-2">
          <Text className="text-sm text-muted-foreground">Network fee</Text>
          <View className="flex-row items-center">
            <Ionicons name="flash" size={12} color="#10B981" />
            <Text className="text-sm text-foreground ml-1">~$0.02</Text>
          </View>
        </View>
        <View className="flex-row items-center justify-between mb-2">
          <Text className="text-sm text-muted-foreground">Arrives in</Text>
          <Text className="text-sm text-foreground">Instant</Text>
        </View>
        <View className="flex-row items-center justify-between">
          <Text className="text-sm text-muted-foreground">Route</Text>
          <View className="flex-row items-center">
            <Ionicons name="sparkles" size={12} color={colors.primary} />
            <Text className="text-sm text-foreground ml-1">AI Optimized</Text>
          </View>
        </View>
      </GlassCard>

      {/* Send Button */}
      <TouchableOpacity
        onPress={onSend}
        disabled={!amount || parseFloat(amount) <= 0}
        className={`py-4 rounded-2xl items-center justify-center flex-row ${
          !amount || parseFloat(amount) <= 0 ? 'bg-surface/30' : 'bg-primary'
        }`}
        activeOpacity={0.8}
      >
        <Ionicons name="arrow-up" size={20} color={!amount || parseFloat(amount) <= 0 ? colors.muted : '#FFFFFF'} />
        <Text className={`text-lg font-medium ml-2 ${
          !amount || parseFloat(amount) <= 0 ? 'text-muted-foreground' : 'text-white'
        }`}>
          Send {amount ? `$${amount}` : ''} {selectedToken}
        </Text>
      </TouchableOpacity>
    </View>
  );
}

interface ReceiveModeProps {
  solanaAddress: string | null | undefined;
  onCopy: (address: string) => void;
  onCreateWallet: () => void;
  isCreatingWallet: boolean;
  hasRealWallet: boolean;
}

function ReceiveMode({
  solanaAddress,
  onCopy,
  onCreateWallet,
  isCreatingWallet,
  hasRealWallet,
}: ReceiveModeProps) {
  // If no wallet, show setup screen
  if (!hasRealWallet) {
    return (
      <View>
        <GlassCard className="mb-4">
          <View className="items-center py-8">
            <View className="w-20 h-20 rounded-full bg-primary/10 items-center justify-center mb-4">
              <Ionicons name="wallet-outline" size={40} color={colors.primary} />
            </View>
            <Text className="text-xl font-semibold text-foreground mb-2">
              Set Up Your Wallet
            </Text>
            <Text className="text-sm text-muted-foreground text-center px-4 mb-6">
              Create a secure Solana wallet to receive SOL, USDC, and other tokens on the Solana network.
            </Text>
            <TouchableOpacity
              onPress={onCreateWallet}
              disabled={isCreatingWallet}
              style={{
                backgroundColor: '#10B981',
                paddingVertical: 14,
                paddingHorizontal: 32,
                borderRadius: 12,
                flexDirection: 'row',
                alignItems: 'center',
                gap: 8,
                opacity: isCreatingWallet ? 0.7 : 1,
              }}
              activeOpacity={0.8}
            >
              {isCreatingWallet ? (
                <>
                  <ActivityIndicator size="small" color="#FFFFFF" />
                  <Text style={{ color: '#FFFFFF', fontSize: 16, fontWeight: '600' }}>
                    Creating Wallet...
                  </Text>
                </>
              ) : (
                <>
                  <Ionicons name="add-circle-outline" size={20} color="#FFFFFF" />
                  <Text style={{ color: '#FFFFFF', fontSize: 16, fontWeight: '600' }}>
                    Create Wallet
                  </Text>
                </>
              )}
            </TouchableOpacity>
          </View>

          {/* Security Info */}
          <View className="border-t border-border/30 pt-4 mt-4">
            <View className="flex-row items-center gap-3 mb-3">
              <Ionicons name="shield-checkmark" size={16} color={colors.primary} />
              <Text className="text-xs text-muted-foreground">
                Hardware-protected keys via Turnkey TEE
              </Text>
            </View>
            <View className="flex-row items-center gap-3 mb-3">
              <Ionicons name="finger-print" size={16} color={colors.primary} />
              <Text className="text-xs text-muted-foreground">
                Biometric authentication required for transactions
              </Text>
            </View>
            <View className="flex-row items-center gap-3">
              <Ionicons name="key" size={16} color={colors.primary} />
              <Text className="text-xs text-muted-foreground">
                No seed phrases to manage or lose
              </Text>
            </View>
          </View>
        </GlassCard>
      </View>
    );
  }

  // Show wallet address and QR code
  return (
    <View>
      <GlassCard className="mb-4">
        {/* QR Code */}
        <View className="items-center py-6">
          <View style={{
            width: 200,
            height: 200,
            borderRadius: 16,
            backgroundColor: '#FFFFFF',
            padding: 12,
            alignItems: 'center',
            justifyContent: 'center',
          }}>
            <QRCode
              value={solanaAddress || ''}
              size={176}
              backgroundColor="#FFFFFF"
              color="#000000"
            />
          </View>
          <Text className="text-sm text-muted-foreground mt-4">
            Scan to send SOL or tokens to this wallet
          </Text>
        </View>

        {/* Address */}
        <View className="border-t border-border/30 pt-4">
          <Text className="text-[10px] uppercase tracking-widest text-muted-foreground text-center mb-2">
            Your Solana Address
          </Text>
          <TouchableOpacity
            onPress={() => solanaAddress && onCopy(solanaAddress)}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 12,
              padding: 16,
              borderRadius: 12,
              backgroundColor: 'rgba(31, 41, 55, 0.3)',
            }}
            activeOpacity={0.7}
          >
            <Text
              style={{
                fontSize: 12,
                color: '#FFFFFF',
                fontFamily: 'monospace',
                flex: 1,
                textAlign: 'center',
              }}
              numberOfLines={1}
              ellipsizeMode="middle"
            >
              {solanaAddress}
            </Text>
            <Ionicons name="copy-outline" size={18} color={colors.muted} />
          </TouchableOpacity>
        </View>

        {/* Network */}
        <View className="mt-4">
          <Text className="text-[10px] uppercase tracking-widest text-muted-foreground text-center mb-2">
            Network
          </Text>
          <View className="flex-row flex-wrap gap-2 justify-center">
            <View style={{
              paddingHorizontal: 16,
              paddingVertical: 8,
              borderRadius: 20,
              backgroundColor: 'rgba(16, 185, 129, 0.1)',
              borderWidth: 1,
              borderColor: 'rgba(16, 185, 129, 0.3)',
            }}>
              <Text style={{ fontSize: 14, color: '#10B981', fontWeight: '500' }}>
                Solana (Devnet)
              </Text>
            </View>
          </View>
        </View>
      </GlassCard>

      {/* Share Options */}
      <GlassCard>
        <View className="flex-row gap-3">
          {[
            { icon: 'share-outline', label: 'Share', onPress: () => solanaAddress && onCopy(solanaAddress) },
            { icon: 'document-text-outline', label: 'Invoice', onPress: () => Alert.alert('Coming Soon', 'Invoice generation will be available soon.') },
            { icon: 'water-outline', label: 'Faucet', onPress: () => Alert.alert('Devnet Faucet', 'Visit sol-faucet.com to get free devnet SOL for testing.') },
          ].map((action) => (
            <TouchableOpacity
              key={action.label}
              onPress={action.onPress}
              className="flex-1 flex-col items-center gap-2 py-4 rounded-xl bg-surface/20"
              activeOpacity={0.7}
            >
              <Ionicons name={action.icon as any} size={20} color={colors.primary} />
              <Text className="text-xs text-muted-foreground">{action.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </GlassCard>

      {/* Devnet Notice */}
      <View style={{
        marginTop: 16,
        padding: 12,
        borderRadius: 12,
        backgroundColor: 'rgba(251, 191, 36, 0.1)',
        borderWidth: 1,
        borderColor: 'rgba(251, 191, 36, 0.2)',
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
      }}>
        <Ionicons name="information-circle" size={20} color="#FBBF24" />
        <Text style={{ flex: 1, fontSize: 12, color: '#FBBF24' }}>
          This is a Solana Devnet address. Only send test tokens - real funds will be lost.
        </Text>
      </View>
    </View>
  );
}

function RequestMode({
  selectedContact,
  setSelectedContact,
  amount,
  setAmount,
  searchQuery,
  setSearchQuery,
  filteredContacts,
  memo,
  setMemo,
}: any) {
  if (!selectedContact) {
    return (
      <View>
        <GlassCard className="flex-row items-center mb-4">
          <Ionicons name="search" size={16} color={colors.muted} />
          <TextInput
            placeholder="Request from..."
            placeholderTextColor={colors.muted}
            value={searchQuery}
            onChangeText={setSearchQuery}
            className="flex-1 text-sm text-foreground px-3 py-2"
          />
        </GlassCard>

        <View className="gap-1">
          {filteredContacts.map((contact: Contact) => (
            <TouchableOpacity
              key={contact.id}
              onPress={() => setSelectedContact(contact)}
              className="flex-row items-center p-3 rounded-xl bg-surface/20 active:bg-surface/40"
              activeOpacity={0.7}
            >
              <ContactAvatar
                initials={contact.initials}
                name={contact.name}
                handle={contact.handle}
                verified={contact.verified}
                size="sm"
              />
              <View className="flex-1 ml-3">
                <Text className="text-sm font-medium text-foreground">{contact.name}</Text>
                <Text className="text-xs text-muted-foreground">{contact.handle}</Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={colors.muted} />
            </TouchableOpacity>
          ))}
        </View>
      </View>
    );
  }

  return (
    <View>
      <GlassCard className="mb-4">
        <TouchableOpacity
          onPress={() => setSelectedContact(null)}
          className="flex-row items-center"
          activeOpacity={0.7}
        >
          <ContactAvatar
            initials={selectedContact.initials}
            name={selectedContact.name}
            handle={selectedContact.handle}
            verified={selectedContact.verified}
            size="md"
          />
          <View className="flex-1 ml-3">
            <Text className="text-xs text-muted-foreground">Requesting from</Text>
            <Text className="text-base font-medium text-foreground">{selectedContact.name}</Text>
          </View>
          <Text className="text-xs text-primary">Change</Text>
        </TouchableOpacity>
      </GlassCard>

      <GlassCard className="mb-4">
        <View className="items-center py-4">
          <View className="flex-row items-center justify-center">
            <Text className="text-4xl font-light text-muted-foreground">$</Text>
            <TextInput
              value={amount}
              onChangeText={(text) => setAmount(text.replace(/[^0-9.]/g, ''))}
              placeholder="0"
              placeholderTextColor={colors.muted}
              keyboardType="decimal-pad"
              className="text-5xl font-light text-foreground w-48 text-center"
            />
          </View>

          <View className="flex-row gap-2 mt-4">
            {['25', '50', '100', '500'].map((amt) => (
              <TouchableOpacity
                key={amt}
                onPress={() => setAmount(amt)}
                className="px-4 py-1.5 rounded-full bg-surface/30"
                activeOpacity={0.7}
              >
                <Text className="text-xs text-muted-foreground">${amt}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <View className="flex-row items-center gap-3 p-3 rounded-xl bg-surface/20">
          <Ionicons name="document-text-outline" size={16} color={colors.muted} />
          <TextInput
            placeholder="What's this for?"
            placeholderTextColor={colors.muted}
            value={memo}
            onChangeText={setMemo}
            className="flex-1 text-sm text-foreground"
          />
        </View>
      </GlassCard>

      <TouchableOpacity
        disabled={!amount || parseFloat(amount) <= 0}
        className={`py-4 rounded-2xl items-center justify-center flex-row ${
          !amount || parseFloat(amount) <= 0 ? 'bg-surface/30' : 'bg-primary'
        }`}
        activeOpacity={0.8}
      >
        <Ionicons name="arrow-forward" size={20} color={!amount || parseFloat(amount) <= 0 ? colors.muted : '#FFFFFF'} />
        <Text className={`text-lg font-medium ml-2 ${
          !amount || parseFloat(amount) <= 0 ? 'text-muted-foreground' : 'text-white'
        }`}>
          Request ${amount || '0'}
        </Text>
      </TouchableOpacity>
    </View>
  );
}

