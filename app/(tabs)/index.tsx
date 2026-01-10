import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { StyleSheet, View, Alert, Pressable, Keyboard } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { KeyboardStickyView } from 'react-native-keyboard-controller';
import Animated, { useSharedValue, useAnimatedStyle, withTiming } from 'react-native-reanimated';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { TopBar } from '@/components/top-bar';
import { CommandBar } from '@/components/command-bar';
import { useThemeColor } from '@/hooks/use-theme-color';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useAuth } from '@/stores/authConvex';
import { useFunding } from '@/stores/fundingConvex';
import { useTokenHoldings } from '@/hooks/useTokenHoldings';
import { useChatHistory } from '@/hooks/useChatHistory';
import type { ChatMessage } from '@/types/chat';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

interface AmbientAction {
  id: number;
  action: string;
  time: string;
  type: 'yield' | 'rebalance' | 'optimization';
}

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const colorScheme = useColorScheme();

  // Get chat session ID from navigation params (when coming from history)
  const { chatSessionId } = useLocalSearchParams<{ chatSessionId?: string }>();

  // Chat history hook
  const {
    activeSession,
    createNewChat,
    loadChat,
    updateMessages,
    clearActiveChat,
  } = useChatHistory();

  // Load chat when navigated with session ID
  useEffect(() => {
    if (chatSessionId) {
      loadChat(chatSessionId);
    }
  }, [chatSessionId, loadChat]);

  // Handle new session creation (when first message is sent without a session)
  const handleNewSession = useCallback((firstMessage: string) => {
    const session = createNewChat(firstMessage);
    console.log('[HomeScreen] Created new chat session:', session.id);
  }, [createNewChat]);

  // Use ref to track active session for the callback (avoids dependency issues)
  const activeSessionRef = useRef(activeSession);
  activeSessionRef.current = activeSession;

  // Handle messages change (for persistence)
  // Using ref to avoid recreating callback when activeSession changes
  const handleMessagesChange = useCallback((messages: ChatMessage[]) => {
    if (activeSessionRef.current && messages.length > 0) {
      updateMessages(messages);
    }
  }, [updateMessages]);

  // Handle chat close - clear active session so next chat starts fresh
  const handleChatClose = useCallback(() => {
    clearActiveChat();
  }, [clearActiveChat]);

  // Real data from stores
  const { user, isAuthenticated } = useAuth();
  const { state: fundingState } = useFunding();
  const { totalValue: cryptoValue, isLoading: cryptoLoading } = useTokenHoldings(user?.solanaAddress || null);

  // Calculate net worth from funding balance + crypto holdings
  const netWorth = useMemo(() => {
    const accountBalance = fundingState?.accountBalance?.availableBalance || 0;
    const cryptoTotal = cryptoValue || 0;
    return (accountBalance / 100) + cryptoTotal; // accountBalance is in cents
  }, [fundingState?.accountBalance, cryptoValue]);

  const [dailyChange] = useState(4.96); // TODO: Calculate from historical data
  const isPositive = dailyChange >= 0;

  const primaryColor = useThemeColor({}, 'tint');
  const mutedColor = useThemeColor({ light: '#687076', dark: '#9BA1A6' }, 'icon');

  // Backdrop overlay animation
  const backdropOpacity = useSharedValue(0);
  const [isCommandBarFocused, setIsCommandBarFocused] = useState(false);

  const handleCommandBarFocusChange = (focused: boolean) => {
    setIsCommandBarFocused(focused);
    backdropOpacity.value = withTiming(focused ? 1 : 0, { duration: 200 });
  };

  const handleBackdropPress = () => {
    Keyboard.dismiss();
    setIsCommandBarFocused(false);
    backdropOpacity.value = withTiming(0, { duration: 200 });
  };

  const backdropAnimatedStyle = useAnimatedStyle(() => ({
    opacity: backdropOpacity.value,
    pointerEvents: backdropOpacity.value > 0 ? 'auto' : 'none',
  }));

  // Real wallet address from auth
  const walletAddress = user?.solanaAddress || '0x742d...4438f44e';

  const [ambientActions, setAmbientActions] = useState<AmbientAction[]>([
    { id: 1, action: 'Auto-rebalanced card to $200', time: 'Just now', type: 'rebalance' },
    { id: 2, action: 'Yield optimized +$12.84', time: '2h ago', type: 'yield' },
    { id: 3, action: 'Gas saved on 3 transactions', time: '4h ago', type: 'optimization' },
  ]);

  // Simulate ambient actions happening in background
  useEffect(() => {
    const interval = setInterval(() => {
      setAmbientActions((prev) => [
        {
          id: Date.now(),
          action: 'Yield compounded +$0.42',
          time: 'Just now',
          type: 'yield',
        },
        ...prev.slice(0, 4),
      ]);
    }, 30000);
    return () => clearInterval(interval);
  }, []);

  const getIndicatorColor = (type: AmbientAction['type']) => {
    switch (type) {
      case 'yield':
        return primaryColor;
      case 'rebalance':
        return '#a855f7'; // accent purple
      case 'optimization':
        return '#22c55e'; // green
    }
  };

  const handleIdentityTap = () => {
    router.push('/identity');
  };

  const handleHistoryTap = () => {
    router.push('/history');
  };

  const handleSettingsTap = () => {
    router.push('/settings');
  };

  const handleSendMessage = (message: string) => {
    Alert.alert('Command', `You said: "${message}"`);
  };

  const handleCamera = () => {
    Alert.alert('Camera', 'Camera/scan coming soon');
  };

  const handleMic = () => {
    // Voice input feedback handled by CommandBar
  };

  return (
    <ThemedView style={styles.container}>
      <StatusBar style={colorScheme === 'dark' ? 'light' : 'dark'} />
      
      {/* Safe area for top (status bar) */}
      <View style={{ height: insets.top }} />

      {/* Top Bar */}
      <TopBar
        walletAddress={walletAddress}
        onIdentityTap={handleIdentityTap}
        onHistoryTap={handleHistoryTap}
        onSettingsTap={handleSettingsTap}
      />

      {/* Main Content */}
      <View style={styles.content}>
        {/* Net Worth - the only "dashboard" element */}
        <View style={styles.netWorthContainer}>
          <ThemedText style={styles.netWorthLabel}>NET WORTH</ThemedText>
          <ThemedText style={styles.netWorthValue}>${netWorth.toLocaleString()}</ThemedText>
          <View style={[styles.changeRow, { backgroundColor: isPositive ? '#22c55e20' : '#ef444420' }]}>
            <Ionicons
              name={isPositive ? 'trending-up' : 'trending-down'}
              size={16}
              color={isPositive ? '#22c55e' : '#ef4444'}
            />
            <ThemedText style={[styles.changeText, { color: isPositive ? '#22c55e' : '#ef4444' }]}>
              {isPositive ? '+' : ''}
              {dailyChange.toFixed(2)}% today
            </ThemedText>
          </View>
        </View>

        {/* Ambient Activity Feed - what's happening in the background */}
        <View style={styles.activitySection}>
          <View style={styles.sectionHeader}>
            <Ionicons name="flash" size={12} color={primaryColor} />
            <ThemedText style={[styles.sectionLabel, { color: mutedColor }]}>BACKGROUND ACTIVITY</ThemedText>
          </View>
          {ambientActions.slice(0, 3).map((action) => (
            <ThemedView key={action.id} style={styles.activityItem} lightColor="#f4f4f5" darkColor="#27272a">
              <View style={styles.activityLeft}>
                <View style={[styles.indicator, { backgroundColor: getIndicatorColor(action.type) }]} />
                <ThemedText style={[styles.activityText, { color: mutedColor }]}>{action.action}</ThemedText>
              </View>
              <ThemedText style={[styles.timeText, { color: mutedColor, opacity: 0.6 }]}>{action.time}</ThemedText>
            </ThemedView>
          ))}
        </View>

        {/* Declarative Goals - 2035 style */}
        <ThemedView style={styles.goalsCard} lightColor="#f4f4f5" darkColor="#1c1c1e">
          <View style={styles.goalsHeader}>
            <Ionicons name="shield-checkmark" size={16} color={primaryColor} />
            <ThemedText style={styles.goalsTitle}>Active Goals</ThemedText>
          </View>
          <View style={styles.goalsList}>
            <View style={styles.goalItem}>
              <ThemedText style={[styles.goalText, { color: mutedColor }]}>{'"Keep card at $200"'}</ThemedText>
              <ThemedText style={[styles.goalStatus, { color: primaryColor }]}>Active</ThemedText>
            </View>
            <View style={styles.goalItem}>
              <ThemedText style={[styles.goalText, { color: mutedColor }]}>{'"Maximize yield on idle USDC"'}</ThemedText>
              <ThemedText style={[styles.goalStatus, { color: primaryColor }]}>+$847/mo</ThemedText>
            </View>
          </View>
        </ThemedView>
      </View>

      {/* Backdrop Overlay */}
      <AnimatedPressable
        style={[styles.backdrop, backdropAnimatedStyle]}
        onPress={handleBackdropPress}
      />

      {/* Command Bar - Sticky above keyboard */}
      <KeyboardStickyView offset={{ closed: 0, opened: insets.bottom }} style={styles.stickyCommandBar}>
        <CommandBar
          onSend={handleSendMessage}
          onCamera={handleCamera}
          onMic={handleMic}
          onFocusChange={handleCommandBarFocusChange}
          // Chat history integration
          initialMessages={activeSession?.messages}
          sessionId={activeSession?.id || null}
          onNewSession={handleNewSession}
          onMessagesChange={handleMessagesChange}
          onChatClose={handleChatClose}
        />
        {/* Safe area for bottom (home indicator) */}
        <View style={{ height: insets.bottom }} />
      </KeyboardStickyView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    flex: 1,
    paddingHorizontal: 24,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    zIndex: 10,
  },
  stickyCommandBar: {
    zIndex: 20,
  },
  netWorthContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: -40,
  },
  netWorthLabel: {
    fontSize: 10,
    letterSpacing: 3,
    opacity: 0.5,
    marginBottom: 12,
  },
  netWorthValue: {
    fontSize: 48,
    lineHeight: 48,
    fontWeight: '200',
    letterSpacing: -1,
    marginBottom: 12,
  },
  changeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  changeText: {
    fontSize: 14,
    fontWeight: '500',
  },
  activitySection: {
    gap: 8,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  sectionLabel: {
    fontSize: 10,
    letterSpacing: 2,
  },
  activityItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 12,
  },
  activityLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  indicator: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  activityText: {
    fontSize: 12,
  },
  timeText: {
    fontSize: 10,
  },
  goalsCard: {
    marginTop: 16,
    marginBottom: 16,
    borderRadius: 16,
    padding: 16,
  },
  goalsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  goalsTitle: {
    fontSize: 12,
    fontWeight: '500',
  },
  goalsList: {
    gap: 8,
  },
  goalItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  goalText: {
    fontSize: 14,
  },
  goalStatus: {
    fontSize: 12,
  },
});
