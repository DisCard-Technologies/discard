import { useState, useMemo } from 'react';
import { StyleSheet, View, Pressable, ScrollView, Linking, ActivityIndicator, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { useQuery } from 'convex/react';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useThemeColor } from '@/hooks/use-theme-color';
import { api } from '@/convex/_generated/api';
import { formatAddress } from '@/lib/transfer/address-resolver';
import { Doc } from '@/convex/_generated/dataModel';
import { useChatHistory } from '@/hooks/useChatHistory';

interface Transaction {
  id: string;
  type: 'send' | 'receive' | 'swap' | 'auto' | 'transfer';
  label: string;
  amount: string;
  value: string;
  time: string;
  status: 'completed' | 'ambient' | 'pending' | 'failed';
  signature?: string;
  isRealTransfer?: boolean;
}

// ChatMessage type from useChatHistory hook

// No mock transactions - use real data only

// Helper to format relative time
const formatRelativeTime = (timestamp: number): string => {
  const now = Date.now();
  const diff = now - timestamp;
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;
  return new Date(timestamp).toLocaleDateString();
};

// Transform Convex transfer to Transaction format
const transferToTransaction = (transfer: Doc<'transfers'>): Transaction => {
  const isConfirmed = transfer.status === 'confirmed';
  const isFailed = transfer.status === 'failed';
  const isPending = transfer.status === 'pending' || transfer.status === 'signing' || transfer.status === 'submitted';

  let label = '';
  if (transfer.recipientType === 'sol_name') {
    label = `Sent to ${transfer.recipientIdentifier}`;
  } else if (transfer.recipientType === 'contact') {
    label = `Sent to ${transfer.recipientIdentifier}`;
  } else {
    label = `Sent to ${formatAddress(transfer.recipientAddress)}`;
  }

  return {
    id: transfer._id,
    type: 'transfer',
    label,
    amount: `-${transfer.amount} ${transfer.token}`,
    value: `-$${transfer.amountUsd.toFixed(2)}`,
    time: formatRelativeTime(transfer.createdAt),
    status: isFailed ? 'failed' : isPending ? 'pending' : 'completed',
    signature: transfer.solanaSignature,
    isRealTransfer: true,
  };
};

// Chat history now comes from useChatHistory hook

const getIcon = (type: string): keyof typeof Ionicons.glyphMap => {
  switch (type) {
    case 'send':
    case 'transfer':
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

type FilterType = 'all' | 'transfer' | 'send' | 'receive' | 'swap' | 'auto';
type TabType = 'transactions' | 'conversations';

// Solscan base URL for viewing transactions
const SOLSCAN_BASE_URL = 'https://solscan.io/tx';

export default function HistoryScreen() {
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ contact?: string }>();
  const [activeTab, setActiveTab] = useState<TabType>('transactions');
  const [filter, setFilter] = useState<FilterType>('all');

  // Chat history hook
  const { sessions, isLoading: isLoadingChats, deleteChat, getChatPreview } = useChatHistory();

  const primaryColor = useThemeColor({}, 'tint');
  const mutedColor = useThemeColor({ light: '#687076', dark: '#9BA1A6' }, 'icon');
  const cardBg = useThemeColor({ light: 'rgba(0,0,0,0.03)', dark: 'rgba(255,255,255,0.06)' }, 'background');
  const borderColor = useThemeColor({ light: 'rgba(0,0,0,0.06)', dark: 'rgba(255,255,255,0.08)' }, 'background');
  const foregroundColor = useThemeColor({}, 'text');

  const sendColor = '#ef4444';
  const receiveColor = '#10b981';
  const swapColor = '#3b82f6';
  const blueAccent = '#60a5fa';
  const pendingColor = '#f59e0b';

  // Handle selecting a chat to continue
  const handleChatSelect = (sessionId: string) => {
    router.push({
      pathname: '/(tabs)',
      params: { chatSessionId: sessionId },
    });
  };

  // Handle deleting a chat
  const handleChatDelete = (sessionId: string) => {
    Alert.alert(
      'Delete Conversation',
      'Are you sure you want to delete this conversation?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => deleteChat(sessionId),
        },
      ]
    );
  };

  // Fetch real transfers from Convex
  const transfersQuery = useQuery(api.transfers.transfers.getByUser, { limit: 50 });
  const isLoadingTransfers = transfersQuery === undefined;

  // Get real transfers only
  const allTransactions = useMemo(() => {
    const realTransfers: Transaction[] = (transfersQuery ?? []).map(transferToTransaction);

    // Filter by contact if specified in params
    if (params.contact) {
      return realTransfers.filter(t => t.label.toLowerCase().includes(params.contact!.toLowerCase()));
    }

    return realTransfers;
  }, [transfersQuery, params.contact]);

  const filteredTransactions = useMemo(() => {
    if (filter === 'all') return allTransactions;
    // For 'transfer' filter, show only real P2P transfers
    if (filter === 'transfer') return allTransactions.filter(t => t.isRealTransfer);
    // For 'send' filter, also include transfers
    if (filter === 'send') return allTransactions.filter(t => t.type === 'send' || t.type === 'transfer');
    return allTransactions.filter(t => t.type === filter);
  }, [allTransactions, filter]);

  const handleBack = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/');
    }
  };

  const getIconColor = (type: string, status?: string) => {
    // Handle pending/failed status
    if (status === 'pending') return { bg: `${pendingColor}20`, icon: pendingColor };
    if (status === 'failed') return { bg: `${sendColor}20`, icon: sendColor };

    switch (type) {
      case 'send':
      case 'transfer':
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
    if (tx.status === 'pending') return pendingColor;
    if (tx.status === 'failed') return sendColor;
    if (tx.type === 'receive' || tx.status === 'ambient') return receiveColor;
    if (tx.type === 'send' || tx.type === 'transfer') return sendColor;
    return foregroundColor;
  };

  const handleTransactionPress = (tx: Transaction) => {
    // Open Solscan if there's a signature
    if (tx.signature) {
      Linking.openURL(`${SOLSCAN_BASE_URL}/${tx.signature}`);
    }
  };

  const filters: FilterType[] = ['all', 'transfer', 'send', 'receive', 'swap', 'auto'];

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
          {sessions.length > 0 && activeTab !== 'conversations' && (
            <View style={[styles.badge, { backgroundColor: blueAccent }]}>
              <ThemedText style={styles.badgeText}>{sessions.length}</ThemedText>
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
          {isLoadingChats && (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="small" color={primaryColor} />
              <ThemedText style={[styles.loadingText, { color: mutedColor }]}>
                Loading conversations...
              </ThemedText>
            </View>
          )}
          {!isLoadingChats && sessions.length === 0 ? (
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
            sessions.map((session) => {
              const preview = getChatPreview(session);
              return (
                <Pressable
                  key={session.id}
                  onPress={() => handleChatSelect(session.id)}
                  onLongPress={() => handleChatDelete(session.id)}
                  style={({ pressed }) => [
                    styles.chatSessionItem,
                    { backgroundColor: cardBg, borderColor },
                    pressed && styles.pressed,
                  ]}
                >
                  <View style={[styles.chatSessionIcon, { backgroundColor: `${primaryColor}20` }]}>
                    <Ionicons name="chatbubble" size={18} color={primaryColor} />
                  </View>
                  <View style={styles.chatSessionInfo}>
                    <ThemedText style={styles.chatSessionTitle} numberOfLines={1}>
                      {preview.title}
                    </ThemedText>
                    <ThemedText style={[styles.chatSessionPreview, { color: mutedColor }]} numberOfLines={1}>
                      {preview.lastMessage}
                    </ThemedText>
                  </View>
                  <View style={styles.chatSessionMeta}>
                    <ThemedText style={[styles.chatSessionTime, { color: mutedColor }]}>
                      {formatRelativeTime(preview.timestamp)}
                    </ThemedText>
                    <Ionicons name="chevron-forward" size={16} color={mutedColor} />
                  </View>
                </Pressable>
              );
            })
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
            {filters.map((f) => {
              const label = f === 'all' ? 'All'
                : f === 'transfer' ? 'Transfers'
                : f.charAt(0).toUpperCase() + f.slice(1);
              return (
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
                    {label}
                  </ThemedText>
                </Pressable>
              );
            })}
          </ScrollView>

          {/* Transaction List */}
          <ScrollView
            style={styles.scrollView}
            contentContainerStyle={[styles.transactionsList, { paddingBottom: insets.bottom + 24 }]}
            showsVerticalScrollIndicator={false}
          >
            {isLoadingTransfers && (
              <View style={styles.loadingContainer}>
                <ActivityIndicator size="small" color={primaryColor} />
                <ThemedText style={[styles.loadingText, { color: mutedColor }]}>
                  Loading transfers...
                </ThemedText>
              </View>
            )}
            {filteredTransactions.map((tx) => {
              const iconColors = getIconColor(tx.type, tx.status);
              const hasSolscanLink = !!tx.signature;
              return (
                <Pressable
                  key={tx.id}
                  onPress={() => handleTransactionPress(tx)}
                  disabled={!hasSolscanLink}
                  style={({ pressed }) => [
                    styles.transactionItem,
                    { backgroundColor: cardBg, borderColor },
                    pressed && hasSolscanLink && styles.pressed,
                  ]}
                >
                  <View style={[styles.txIcon, { backgroundColor: iconColors.bg }]}>
                    <Ionicons
                      name={tx.status === 'pending' ? 'time' : tx.status === 'failed' ? 'close-circle' : getIcon(tx.type)}
                      size={18}
                      color={iconColors.icon}
                    />
                  </View>

                  <View style={styles.txInfo}>
                    <View style={styles.txLabelRow}>
                      <ThemedText style={styles.txLabel} numberOfLines={1}>
                        {tx.label}
                      </ThemedText>
                      {tx.status === 'ambient' && (
                        <View style={[styles.statusBadge, { backgroundColor: `${primaryColor}20` }]}>
                          <ThemedText style={[styles.statusBadgeText, { color: primaryColor }]}>
                            AUTO
                          </ThemedText>
                        </View>
                      )}
                      {tx.status === 'pending' && (
                        <View style={[styles.statusBadge, { backgroundColor: `${pendingColor}20` }]}>
                          <ThemedText style={[styles.statusBadgeText, { color: pendingColor }]}>
                            PENDING
                          </ThemedText>
                        </View>
                      )}
                      {tx.status === 'failed' && (
                        <View style={[styles.statusBadge, { backgroundColor: `${sendColor}20` }]}>
                          <ThemedText style={[styles.statusBadgeText, { color: sendColor }]}>
                            FAILED
                          </ThemedText>
                        </View>
                      )}
                    </View>
                    <View style={styles.txTimeRow}>
                      <ThemedText style={[styles.txTime, { color: mutedColor }]}>{tx.time}</ThemedText>
                      {hasSolscanLink && (
                        <Ionicons name="open-outline" size={12} color={mutedColor} style={{ marginLeft: 4 }} />
                      )}
                    </View>
                  </View>

                  <View style={styles.txAmounts}>
                    <ThemedText style={[styles.txAmount, { color: getAmountColor(tx) }]}>
                      {tx.amount}
                    </ThemedText>
                    <ThemedText style={[styles.txValue, { color: mutedColor }]}>{tx.value}</ThemedText>
                  </View>
                </Pressable>
              );
            })}
            {!isLoadingTransfers && filteredTransactions.length === 0 && (
              <View style={styles.emptyState}>
                <View style={[styles.emptyIcon, { backgroundColor: cardBg }]}>
                  <Ionicons name="receipt-outline" size={32} color={mutedColor} />
                </View>
                <ThemedText style={[styles.emptyTitle, { color: mutedColor }]}>
                  No transactions yet
                </ThemedText>
                <ThemedText style={[styles.emptySubtitle, { color: mutedColor, opacity: 0.6 }]}>
                  Send or receive to see history
                </ThemedText>
              </View>
            )}
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
  statusBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  statusBadgeText: {
    fontSize: 9,
    fontWeight: '600',
  },
  txTimeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
  },
  txTime: {
    fontSize: 12,
  },
  loadingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    gap: 8,
  },
  loadingText: {
    fontSize: 13,
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
  // Chat session list styles
  chatSessionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 16,
    borderWidth: 1,
    gap: 12,
    marginBottom: 8,
  },
  chatSessionIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chatSessionInfo: {
    flex: 1,
    minWidth: 0,
  },
  chatSessionTitle: {
    fontSize: 14,
    fontWeight: '500',
  },
  chatSessionPreview: {
    fontSize: 12,
    marginTop: 2,
  },
  chatSessionMeta: {
    alignItems: 'flex-end',
    gap: 4,
  },
  chatSessionTime: {
    fontSize: 11,
  },
});

