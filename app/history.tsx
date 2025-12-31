import { useState } from 'react';
import { StyleSheet, View, Pressable, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useThemeColor } from '@/hooks/use-theme-color';

interface Transaction {
  id: number;
  type: 'send' | 'receive' | 'swap' | 'auto';
  label: string;
  amount: string;
  value: string;
  time: string;
  status: 'completed' | 'ambient';
}

interface ChatMessage {
  id: number;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

const transactions: Transaction[] = [
  {
    id: 1,
    type: 'send',
    label: 'Sent to alex.eth',
    amount: '-0.5 ETH',
    value: '-$1,847.50',
    time: '2 hours ago',
    status: 'completed',
  },
  {
    id: 2,
    type: 'receive',
    label: 'Received from vitalik.eth',
    amount: '+1.2 ETH',
    value: '+$4,434.00',
    time: '5 hours ago',
    status: 'completed',
  },
  {
    id: 3,
    type: 'swap',
    label: 'Swapped ETH → USDC',
    amount: '0.3 ETH → 1,108 USDC',
    value: '$1,108.50',
    time: 'Yesterday',
    status: 'completed',
  },
  {
    id: 4,
    type: 'auto',
    label: 'Auto-Rebalance',
    amount: 'Card topped up',
    value: '+$200.00',
    time: 'Yesterday',
    status: 'ambient',
  },
  {
    id: 5,
    type: 'receive',
    label: 'Yield Earned',
    amount: '+12.45 USDC',
    value: '+$12.45',
    time: '2 days ago',
    status: 'ambient',
  },
  {
    id: 6,
    type: 'send',
    label: 'Sent to 0x8f2...3a1',
    amount: '-500 USDC',
    value: '-$500.00',
    time: '3 days ago',
    status: 'completed',
  },
  {
    id: 7,
    type: 'swap',
    label: 'Swapped USDC → SOL',
    amount: '1,000 USDC → 8.2 SOL',
    value: '$1,000.00',
    time: '1 week ago',
    status: 'completed',
  },
];

// Mock chat history - in real app this would come from props or context
const chatHistory: ChatMessage[] = [
  { id: 1, role: 'user', content: 'Send 0.5 ETH to alex.eth', timestamp: new Date(Date.now() - 7200000) },
  { id: 2, role: 'assistant', content: 'I\'ve sent 0.5 ETH to alex.eth. Transaction confirmed!', timestamp: new Date(Date.now() - 7190000) },
  { id: 3, role: 'user', content: 'What\'s my balance?', timestamp: new Date(Date.now() - 3600000) },
  { id: 4, role: 'assistant', content: 'Your total balance is $178,171 across all wallets.', timestamp: new Date(Date.now() - 3590000) },
];

const getIcon = (type: string): keyof typeof Ionicons.glyphMap => {
  switch (type) {
    case 'send':
      return 'arrow-up-circle';
    case 'receive':
      return 'arrow-down-circle';
    case 'swap':
      return 'swap-horizontal';
    case 'auto':
      return 'sync-circle';
    default:
      return 'arrow-up-circle';
  }
};

const formatTime = (date: Date) => {
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);

  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  return date.toLocaleDateString();
};

type FilterType = 'all' | 'send' | 'receive' | 'swap' | 'auto';
type TabType = 'transactions' | 'conversations';

export default function HistoryScreen() {
  const insets = useSafeAreaInsets();
  const [activeTab, setActiveTab] = useState<TabType>('transactions');
  const [filter, setFilter] = useState<FilterType>('all');

  const primaryColor = useThemeColor({}, 'tint');
  const mutedColor = useThemeColor({ light: '#687076', dark: '#9BA1A6' }, 'icon');
  const cardBg = useThemeColor({ light: 'rgba(0,0,0,0.03)', dark: 'rgba(255,255,255,0.06)' }, 'background');
  const borderColor = useThemeColor({ light: 'rgba(0,0,0,0.06)', dark: 'rgba(255,255,255,0.08)' }, 'background');
  const foregroundColor = useThemeColor({}, 'text');

  const sendColor = '#ef4444';
  const receiveColor = '#10b981';
  const swapColor = '#3b82f6';
  const blueAccent = '#60a5fa';

  const filteredTransactions = filter === 'all' 
    ? transactions 
    : transactions.filter((t) => t.type === filter);

  const handleBack = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/');
    }
  };

  const getIconColor = (type: string) => {
    switch (type) {
      case 'send':
        return { bg: `${sendColor}20`, icon: sendColor };
      case 'receive':
        return { bg: `${receiveColor}20`, icon: receiveColor };
      case 'swap':
        return { bg: `${swapColor}20`, icon: swapColor };
      case 'auto':
        return { bg: `${primaryColor}20`, icon: primaryColor };
      default:
        return { bg: cardBg, icon: mutedColor };
    }
  };

  const getAmountColor = (tx: Transaction) => {
    if (tx.type === 'receive' || tx.status === 'ambient') return receiveColor;
    if (tx.type === 'send') return sendColor;
    return foregroundColor;
  };

  const filters: FilterType[] = ['all', 'send', 'receive', 'swap', 'auto'];

  return (
    <ThemedView style={styles.container}>
      <View style={{ height: insets.top }} />

      {/* Header */}
      <View style={styles.header}>
        <Pressable
          onPress={handleBack}
          style={({ pressed }) => [styles.backButton, pressed && styles.pressed]}
        >
          <Ionicons name="chevron-back" size={24} color={mutedColor} />
        </Pressable>
        <ThemedText style={styles.headerTitle}>History</ThemedText>
        <Pressable style={({ pressed }) => [styles.filterButton, pressed && styles.pressed]}>
          <Ionicons name="filter" size={20} color={mutedColor} />
        </Pressable>
      </View>

      {/* Tab Switcher */}
      <View style={styles.tabContainer}>
        <Pressable
          onPress={() => setActiveTab('transactions')}
          style={[
            styles.tab,
            activeTab === 'transactions'
              ? { backgroundColor: primaryColor }
              : { backgroundColor: cardBg, borderWidth: 1, borderColor },
          ]}
        >
          <Ionicons
            name="sync"
            size={16}
            color={activeTab === 'transactions' ? '#000' : mutedColor}
          />
          <ThemedText
            style={[
              styles.tabText,
              { color: activeTab === 'transactions' ? '#000' : mutedColor },
            ]}
          >
            Transactions
          </ThemedText>
        </Pressable>
        <Pressable
          onPress={() => setActiveTab('conversations')}
          style={[
            styles.tab,
            activeTab === 'conversations'
              ? { backgroundColor: primaryColor }
              : { backgroundColor: cardBg, borderWidth: 1, borderColor },
          ]}
        >
          <Ionicons
            name="chatbubble"
            size={16}
            color={activeTab === 'conversations' ? '#000' : mutedColor}
          />
          <ThemedText
            style={[
              styles.tabText,
              { color: activeTab === 'conversations' ? '#000' : mutedColor },
            ]}
          >
            Conversations
          </ThemedText>
          {chatHistory.length > 0 && activeTab !== 'conversations' && (
            <View style={[styles.badge, { backgroundColor: blueAccent }]}>
              <ThemedText style={styles.badgeText}>{chatHistory.length}</ThemedText>
            </View>
          )}
        </Pressable>
      </View>

      {/* Conversations Tab */}
      {activeTab === 'conversations' && (
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={[styles.conversationsContent, { paddingBottom: insets.bottom + 24 }]}
          showsVerticalScrollIndicator={false}
        >
          {chatHistory.length === 0 ? (
            <View style={styles.emptyState}>
              <View style={[styles.emptyIcon, { backgroundColor: cardBg }]}>
                <Ionicons name="chatbubble" size={32} color={mutedColor} />
              </View>
              <ThemedText style={[styles.emptyTitle, { color: mutedColor }]}>
                No conversations yet
              </ThemedText>
              <ThemedText style={[styles.emptySubtitle, { color: mutedColor, opacity: 0.6 }]}>
                Start chatting in the command bar
              </ThemedText>
            </View>
          ) : (
            chatHistory.map((msg) => (
              <View
                key={msg.id}
                style={[
                  styles.messageRow,
                  msg.role === 'user' ? styles.messageRowUser : styles.messageRowAssistant,
                ]}
              >
                {msg.role === 'assistant' && (
                  <View style={[styles.avatar, { backgroundColor: `${primaryColor}20` }]}>
                    <Ionicons name="sparkles" size={16} color={primaryColor} />
                  </View>
                )}
                <View style={[styles.messageContainer, msg.role === 'user' && styles.messageContainerUser]}>
                  <View
                    style={[
                      styles.messageBubble,
                      msg.role === 'user'
                        ? { backgroundColor: primaryColor, borderBottomRightRadius: 4 }
                        : { backgroundColor: cardBg, borderColor, borderWidth: 1, borderBottomLeftRadius: 4 },
                    ]}
                  >
                    <ThemedText
                      style={[
                        styles.messageText,
                        { color: msg.role === 'user' ? '#000' : foregroundColor },
                      ]}
                    >
                      {msg.content}
                    </ThemedText>
                  </View>
                  <ThemedText style={[styles.messageTime, { color: mutedColor }]}>
                    {formatTime(msg.timestamp)}
                  </ThemedText>
                </View>
                {msg.role === 'user' && (
                  <View style={[styles.avatar, { backgroundColor: `${blueAccent}20` }]}>
                    <Ionicons name="person" size={16} color={blueAccent} />
                  </View>
                )}
              </View>
            ))
          )}
        </ScrollView>
      )}

      {/* Transactions Tab */}
      {activeTab === 'transactions' && (
        <>
          {/* Filter Pills */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.filterScroll}
            contentContainerStyle={styles.filterContainer}
          >
            {filters.map((f) => (
              <Pressable
                key={f}
                onPress={() => setFilter(f)}
                style={[
                  styles.filterPill,
                  filter === f
                    ? { backgroundColor: primaryColor }
                    : { backgroundColor: cardBg, borderWidth: 1, borderColor },
                ]}
              >
                <ThemedText
                  style={[
                    styles.filterText,
                    { color: filter === f ? '#000' : mutedColor },
                  ]}
                >
                  {f === 'all' ? 'All' : f.charAt(0).toUpperCase() + f.slice(1)}
                </ThemedText>
              </Pressable>
            ))}
          </ScrollView>

          {/* Transaction List */}
          <ScrollView
            style={styles.scrollView}
            contentContainerStyle={[styles.transactionsList, { paddingBottom: insets.bottom + 24 }]}
            showsVerticalScrollIndicator={false}
          >
            {filteredTransactions.map((tx) => {
              const iconColors = getIconColor(tx.type);
              return (
                <ThemedView
                  key={tx.id}
                  style={[styles.transactionItem, { backgroundColor: cardBg, borderColor }]}
                  lightColor="rgba(0,0,0,0.03)"
                  darkColor="rgba(255,255,255,0.06)"
                >
                  <View style={[styles.txIcon, { backgroundColor: iconColors.bg }]}>
                    <Ionicons name={getIcon(tx.type)} size={18} color={iconColors.icon} />
                  </View>

                  <View style={styles.txInfo}>
                    <View style={styles.txLabelRow}>
                      <ThemedText style={styles.txLabel} numberOfLines={1}>
                        {tx.label}
                      </ThemedText>
                      {tx.status === 'ambient' && (
                        <View style={[styles.autoBadge, { backgroundColor: `${primaryColor}20` }]}>
                          <ThemedText style={[styles.autoBadgeText, { color: primaryColor }]}>
                            AUTO
                          </ThemedText>
                        </View>
                      )}
                    </View>
                    <ThemedText style={[styles.txTime, { color: mutedColor }]}>{tx.time}</ThemedText>
                  </View>

                  <View style={styles.txAmounts}>
                    <ThemedText style={[styles.txAmount, { color: getAmountColor(tx) }]}>
                      {tx.amount}
                    </ThemedText>
                    <ThemedText style={[styles.txValue, { color: mutedColor }]}>{tx.value}</ThemedText>
                  </View>
                </ThemedView>
              );
            })}
          </ScrollView>
        </>
      )}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(128,128,128,0.1)',
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '600',
  },
  filterButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabContainer: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(128,128,128,0.08)',
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 10,
    borderRadius: 14,
  },
  tabText: {
    fontSize: 14,
    fontWeight: '500',
  },
  badge: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#fff',
  },
  scrollView: {
    flex: 1,
  },
  filterScroll: {
    flexGrow: 0,
    flexShrink: 0,
  },
  filterContainer: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    alignItems: 'center',
  },
  filterPill: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
  },
  filterText: {
    fontSize: 14,
    fontWeight: '500',
    textAlign: 'center',
  },
  transactionsList: {
    paddingHorizontal: 16,
    gap: 8,
  },
  transactionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 16,
    borderWidth: 1,
    gap: 12,
  },
  txIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  txInfo: {
    flex: 1,
    minWidth: 0,
  },
  txLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  txLabel: {
    fontSize: 14,
    fontWeight: '500',
    flexShrink: 1,
  },
  autoBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  autoBadgeText: {
    fontSize: 9,
    fontWeight: '600',
  },
  txTime: {
    fontSize: 12,
    marginTop: 2,
  },
  txAmounts: {
    alignItems: 'flex-end',
  },
  txAmount: {
    fontSize: 14,
    fontWeight: '500',
  },
  txValue: {
    fontSize: 12,
    marginTop: 2,
  },
  conversationsContent: {
    paddingHorizontal: 16,
    paddingTop: 16,
    gap: 12,
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 80,
  },
  emptyIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 14,
  },
  emptySubtitle: {
    fontSize: 12,
    marginTop: 4,
  },
  messageRow: {
    flexDirection: 'row',
    gap: 12,
  },
  messageRowUser: {
    justifyContent: 'flex-end',
  },
  messageRowAssistant: {
    justifyContent: 'flex-start',
  },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  messageContainer: {
    maxWidth: '75%',
  },
  messageContainerUser: {
    alignItems: 'flex-end',
  },
  messageBubble: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 18,
  },
  messageText: {
    fontSize: 14,
    lineHeight: 20,
  },
  messageTime: {
    fontSize: 10,
    marginTop: 4,
    paddingHorizontal: 4,
  },
  pressed: {
    opacity: 0.7,
    transform: [{ scale: 0.98 }],
  },
});

