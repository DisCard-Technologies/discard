import React, { useState } from 'react';
import { View, Text, ScrollView, TextInput, TouchableOpacity, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import {
  AmbientBackground,
  GlassCard,
  ContactAvatar,
  CommandBar,
} from '../../components/vision';
import { colors, truncateAddress } from '../../lib/utils';
import { useWallets } from '../../stores/walletsConvex';
import { useCrypto} from '../../stores/cryptoConvex';

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

  const walletAddress = '0x7F3a...8b2E';

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

  const handleCopy = () => {
    Alert.alert('Copied', 'Wallet address copied to clipboard');
  };

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
              <ReceiveMode walletAddress={walletAddress} onCopy={handleCopy} />
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

function ReceiveMode({ walletAddress, onCopy }: any) {
  return (
    <View>
      <GlassCard className="mb-4">
        {/* QR Code */}
        <View className="items-center py-6">
          <View className="w-48 h-48 rounded-2xl bg-white p-3">
            <View className="w-full h-full rounded-xl bg-gradient-to-br from-foreground/90 to-foreground items-center justify-center">
              <Ionicons name="qr-code" size={128} color="#FFFFFF" />
              <View className="absolute w-12 h-12 rounded-xl bg-primary items-center justify-center">
                <Text className="text-white font-bold text-lg">N</Text>
              </View>
            </View>
          </View>
          <Text className="text-sm text-muted-foreground mt-4">Scan to send funds to this wallet</Text>
        </View>

        {/* Address */}
        <View className="border-t border-border/30 pt-4">
          <Text className="text-[10px] uppercase tracking-widest text-muted-foreground text-center mb-2">
            Your Address
          </Text>
          <TouchableOpacity
            onPress={onCopy}
            className="flex-row items-center justify-center gap-3 p-4 rounded-xl bg-surface/30"
            activeOpacity={0.7}
          >
            <Text className="text-sm text-foreground font-mono">{walletAddress}</Text>
            <Ionicons name="copy-outline" size={16} color={colors.muted} />
          </TouchableOpacity>
        </View>

        {/* Networks */}
        <View className="mt-4">
          <Text className="text-[10px] uppercase tracking-widest text-muted-foreground text-center mb-2">
            Supported Networks
          </Text>
          <View className="flex-row flex-wrap gap-2 justify-center">
            {['Ethereum', 'Base', 'Arbitrum', 'Optimism', 'Polygon'].map((network) => (
              <View key={network} className="px-3 py-1.5 rounded-full bg-surface/30">
                <Text className="text-xs text-muted-foreground">{network}</Text>
              </View>
            ))}
          </View>
        </View>
      </GlassCard>

      {/* Share Options */}
      <GlassCard>
        <View className="flex-row gap-3">
          {[
            { icon: 'people', label: 'Share' },
            { icon: 'document-text', label: 'Invoice' },
            { icon: 'repeat', label: 'Recurring' },
          ].map((action) => (
            <TouchableOpacity
              key={action.label}
              className="flex-1 flex-col items-center gap-2 py-4 rounded-xl bg-surface/20"
              activeOpacity={0.7}
            >
              <Ionicons name={action.icon as any} size={20} color={colors.primary} />
              <Text className="text-xs text-muted-foreground">{action.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </GlassCard>
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

