import { useState, useRef, useEffect } from 'react';
import {
  View,
  StyleSheet,
  TextInput,
  ScrollView,
  Keyboard,
  ActivityIndicator,
} from 'react-native';
import { PressableScale } from 'pressto';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  interpolate,
} from 'react-native-reanimated';

import { ThemedText } from '@/components/themed-text';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { GoalChipsRow, GoalChipData } from '@/components/goal-chips-row';
import { GoalOverflowPopover } from '@/components/goal-overflow-popover';
import { useGoalChips } from '@/hooks/useGoalChips';

// Note: PillNavBar and CommandBar are available as extracted components in @/components/navigation
// This file is kept for backward compatibility but can be refactored to use those components

type IconName = 'home' | 'swap-horizontal' | 'search' | 'grid';

interface TabConfig {
  icon: IconName;
  label: string;
}

// Tab configuration for navigation items - now includes Explore as 4th item
const navTabConfig: Record<string, TabConfig> = {
  index: { icon: 'home', label: 'Home' },
  transfer: { icon: 'swap-horizontal', label: 'Transfer' },
  explore: { icon: 'search', label: 'Explore' },
  menu: { icon: 'grid', label: 'Menu' },
};

// Colors matching the design - matches top bar styling
const DOCK_BG_LIGHT = 'rgba(0,0,0,0.05)';
const DOCK_BG_DARK = 'rgba(255,255,255,0.08)';
const BORDER_LIGHT = 'rgba(0,0,0,0.08)';
const BORDER_DARK = 'rgba(255,255,255,0.1)';
const ACTIVE_COLOR = '#10B981';
const INACTIVE_ICON_COLOR = '#6B7280';
const INACTIVE_ICON_COLOR_DARK = '#9BA1A6';
const PLACEHOLDER_COLOR = '#6B7280';
const SPARKLE_COLOR = '#10B981';
const USER_BUBBLE_COLOR = '#10B981';
const AI_BUBBLE_COLOR = '#374151';

// Suggestions for command bar
const SUGGESTIONS = [
  'Keep my card balance at $200',
  'Send $50 to alex.eth',
  'Show me trending tokens',
  "What's my portfolio breakdown?",
];

// Mock goals data for testing - will be replaced with real Convex data
const MOCK_GOALS: GoalChipData[] = [
  {
    id: '1',
    icon: '🎯',
    value: 34,
    type: 'percentage',
    attention: 'normal',
    queryPrompt: 'Tell me about my BTC Stack goal',
  },
  {
    id: '2',
    icon: '🏖️',
    value: 67,
    type: 'percentage',
    attention: 'normal',
    queryPrompt: 'Tell me about my Vacation Fund goal',
  },
  {
    id: '3',
    icon: '💳',
    value: 42,
    type: 'currency',
    attention: 'warning',
    queryPrompt: 'Tell me about my Card Balance goal',
  },
  {
    id: '4',
    icon: '🚗',
    value: 12,
    type: 'percentage',
    attention: 'normal',
    queryPrompt: 'Tell me about my New Car goal',
  },
  {
    id: '5',
    icon: '🏠',
    value: 8,
    type: 'percentage',
    attention: 'critical',
    queryPrompt: 'Tell me about my House Fund goal',
  },
];

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
}

interface PillTabBarProps extends BottomTabBarProps {
  onCommandSubmit?: (text: string) => void;
  onMicPress?: () => void;
}

const springConfig = {
  damping: 20,
  stiffness: 300,
};

export function PillTabBar({ state, descriptors, navigation }: PillTabBarProps) {
  const insets = useSafeAreaInsets();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  // Get real goals data from Convex (falls back to mock data in dev)
  const { goals: realGoals, isLoading: goalsLoading, isEmpty: noGoals } = useGoalChips();
  const goals = realGoals.length > 0 ? realGoals : MOCK_GOALS;
  
  // Theme-aware colors matching top bar
  const dockBg = isDark ? DOCK_BG_DARK : DOCK_BG_LIGHT;
  const borderColor = isDark ? BORDER_DARK : BORDER_LIGHT;
  const iconColor = isDark ? INACTIVE_ICON_COLOR_DARK : INACTIVE_ICON_COLOR;
  
  // Command bar state
  const [isCommandExpanded, setIsCommandExpanded] = useState(false);
  const [commandText, setCommandText] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [isListening, setIsListening] = useState(false);
  const [isOverflowVisible, setIsOverflowVisible] = useState(false);

  const inputRef = useRef<TextInput>(null);
  const scrollViewRef = useRef<ScrollView>(null);

  // Animation values
  const commandExpandProgress = useSharedValue(0);

  // Filter routes for nav items that have config
  const navRoutes = state.routes.filter((route) => navTabConfig[route.name]);

  // Animate command bar expansion
  useEffect(() => {
    commandExpandProgress.value = withSpring(isCommandExpanded ? 1 : 0, springConfig);
  }, [isCommandExpanded]);

  // Focus input when command bar expands
  useEffect(() => {
    if (isCommandExpanded) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isCommandExpanded]);

  // Scroll to bottom when messages change
  useEffect(() => {
    if (chatMessages.length > 0) {
      setTimeout(() => scrollViewRef.current?.scrollToEnd({ animated: true }), 100);
    }
  }, [chatMessages.length]);

  const handleCommandBarPress = () => {
    if (process.env.EXPO_OS === 'ios') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    setIsCommandExpanded(true);
  };

  const handleCommandClose = () => {
    Keyboard.dismiss();
    setIsCommandExpanded(false);
    setChatMessages([]);
    setCommandText('');
  };

  const handleMicPress = () => {
    if (process.env.EXPO_OS === 'ios') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    setIsListening(!isListening);
  };

  const handleSuggestionPress = (suggestion: string) => {
    setCommandText(suggestion);
    inputRef.current?.focus();
  };

  // Goal chip handlers
  const handleGoalChipPress = (goal: GoalChipData) => {
    // Pre-fill the command text with the goal query and expand
    setCommandText(goal.queryPrompt);
    setIsCommandExpanded(true);
    // Auto-submit after a short delay
    setTimeout(() => {
      handleCommandSubmit();
    }, 100);
  };

  const handleOverflowPress = () => {
    setIsOverflowVisible(true);
  };

  const handleOverflowClose = () => {
    setIsOverflowVisible(false);
  };

  const handleOverflowGoalPress = (goal: GoalChipData) => {
    setIsOverflowVisible(false);
    handleGoalChipPress(goal);
  };

  // Get overflow goals (goals beyond maxVisible)
  const MAX_VISIBLE_CHIPS = 3;
  const overflowGoals = goals.slice(MAX_VISIBLE_CHIPS);

  const getAIResponse = (input: string): string => {
    const lowered = input.toLowerCase();

    if (lowered.includes('hi') || lowered.includes('hello') || lowered.includes('hey')) {
      return "Hey! I'm your DisCard assistant. I can help you send money, check your portfolio, or answer questions. What would you like to do?";
    }
    if (lowered.includes('portfolio') || lowered.includes('holdings') || lowered.includes('balance')) {
      return "Your portfolio shows your current holdings. Check the Home screen for your balance breakdown!";
    }
    if (lowered.includes('send') || lowered.includes('transfer')) {
      return "I can help you send crypto. Use the Transfer tab or tell me who you'd like to send to!";
    }
    if (lowered.includes('help') || lowered.includes('what can you do')) {
      return "I can help you: send/receive crypto, manage your card, explore tokens, set goals, and answer questions. Just ask naturally!";
    }
    if (lowered.includes('thank')) {
      return "You're welcome! Let me know if you need anything else.";
    }

    return "I understood your message. Is there something specific I can help you with?";
  };

  const handleCommandSubmit = async () => {
    if (!commandText.trim() || isProcessing) return;

    const userMessage: ChatMessage = {
      id: `user_${Date.now()}`,
      role: 'user',
      content: commandText.trim(),
    };

    setChatMessages((prev) => [...prev, userMessage]);
    setCommandText('');
    setIsProcessing(true);

    // Simulate AI response
    await new Promise((resolve) => setTimeout(resolve, 800));

    const aiResponse = getAIResponse(userMessage.content);
    const assistantMessage: ChatMessage = {
      id: `ai_${Date.now()}`,
      role: 'assistant',
      content: aiResponse,
    };

    setChatMessages((prev) => [...prev, assistantMessage]);
    setIsProcessing(false);
  };

  // Animated styles for command bar
  const commandBarAnimatedStyle = useAnimatedStyle(() => {
    const height = interpolate(commandExpandProgress.value, [0, 1], [48, 280]);
    const borderRadius = interpolate(commandExpandProgress.value, [0, 1], [28, 24]);

    return {
      height,
      borderRadius,
    };
  });

  const renderNavItem = (route: (typeof navRoutes)[0]) => {
    const { options } = descriptors[route.key];
    const routeIndex = state.routes.findIndex((r) => r.key === route.key);
    const isFocused = state.index === routeIndex;
    const config = navTabConfig[route.name];

    const onPress = () => {
      const event = navigation.emit({
        type: 'tabPress',
        target: route.key,
        canPreventDefault: true,
      });

      if (!isFocused && !event.defaultPrevented) {
        if (process.env.EXPO_OS === 'ios') {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        }
        navigation.navigate(route.name);
      }
    };

    return (
      <PressableScale
        key={route.key}
        accessibilityRole="button"
        accessibilityState={isFocused ? { selected: true } : {}}
        accessibilityLabel={options.tabBarAccessibilityLabel}
        onPress={onPress}
        style={[styles.navItem, isFocused && styles.navItemActive]}
      >
        <Ionicons name={config.icon} size={20} color={isFocused ? '#FFFFFF' : iconColor} />
        <ThemedText style={[styles.navLabel, isFocused && styles.navLabelActive, !isFocused && { color: iconColor }]}>{config.label}</ThemedText>
      </PressableScale>
    );
  };

  return (
    <View style={[styles.container, { paddingBottom: Math.max(insets.bottom, 8) }]}>
      {/* Command Bar - Expandable */}
      <Animated.View style={[styles.commandBar, { backgroundColor: dockBg, borderColor }, commandBarAnimatedStyle]}>
        {isCommandExpanded ? (
          // Expanded State
          <View style={styles.expandedContent}>
            {/* Header with close button */}
            <View style={styles.expandedHeader}>
              <View style={styles.headerLeft}>
                <Ionicons name="sparkles" size={16} color={SPARKLE_COLOR} />
                <ThemedText style={styles.headerTitle}>DisCard Assistant</ThemedText>
              </View>
              <PressableScale onPress={handleCommandClose} style={styles.closeButton}>
                <Ionicons name="close" size={20} color={INACTIVE_ICON_COLOR} />
              </PressableScale>
            </View>

            {/* Chat Messages or Suggestions */}
            <ScrollView
              ref={scrollViewRef}
              style={styles.chatArea}
              contentContainerStyle={styles.chatContent}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            >
              {chatMessages.length === 0 ? (
                // Show suggestions when no messages
                <View style={styles.suggestionsContainer}>
                  <ThemedText style={styles.suggestionsLabel}>Try saying</ThemedText>
                  <View style={styles.suggestionsWrap}>
                    {SUGGESTIONS.map((suggestion, index) => (
                      <PressableScale
                        key={index}
                        onPress={() => handleSuggestionPress(suggestion)}
                        style={styles.suggestionChip}
                      >
                        <ThemedText style={styles.suggestionText}>{suggestion}</ThemedText>
                      </PressableScale>
                    ))}
                  </View>
                </View>
              ) : (
                // Show chat messages
                chatMessages.map((msg) => (
                  <View
                    key={msg.id}
                    style={[styles.messageBubble, msg.role === 'user' ? styles.userBubble : styles.aiBubble]}
                  >
                    {msg.role === 'assistant' && (
                      <Ionicons name="sparkles" size={14} color={SPARKLE_COLOR} style={styles.bubbleIcon} />
                    )}
                    <ThemedText style={styles.messageText}>{msg.content}</ThemedText>
                  </View>
                ))
              )}

              {isProcessing && (
                <View style={[styles.messageBubble, styles.aiBubble]}>
                  <ActivityIndicator size="small" color={SPARKLE_COLOR} />
                  <ThemedText style={[styles.messageText, { marginLeft: 8 }]}>Thinking...</ThemedText>
                </View>
              )}
            </ScrollView>

            {/* Input Row */}
            <View style={styles.inputRow}>
              <TextInput
                ref={inputRef}
                value={commandText}
                onChangeText={setCommandText}
                placeholder="Ask anything or give a command..."
                placeholderTextColor={PLACEHOLDER_COLOR}
                style={styles.expandedInput}
                returnKeyType="send"
                onSubmitEditing={handleCommandSubmit}
                editable={!isProcessing}
              />
              <PressableScale
                onPress={handleMicPress}
                style={[
                  styles.inputButton,
                  isListening && styles.inputButtonActive,
                ]}
              >
                <Ionicons name="mic" size={20} color={isListening ? '#FFFFFF' : INACTIVE_ICON_COLOR} />
              </PressableScale>
              <PressableScale
                onPress={handleCommandSubmit}
                enabled={!!commandText.trim() && !isProcessing}
                style={[
                  styles.sendButton,
                  (!commandText.trim() || isProcessing) && styles.sendButtonDisabled,
                ]}
              >
                <Ionicons name="send" size={18} color="#FFFFFF" />
              </PressableScale>
            </View>
          </View>
        ) : (
          // Collapsed State with Goal Chips
          <PressableScale onPress={handleCommandBarPress} style={styles.collapsedBar}>
            <Ionicons name="sparkles" size={18} color={SPARKLE_COLOR} />
            {goals.length > 0 ? (
              // Show goal chips when goals exist
              <View style={styles.collapsedContent}>
                <ThemedText style={[styles.collapsedTextShort, { color: iconColor }]}>Ask...</ThemedText>
                <GoalChipsRow
                  goals={goals}
                  maxVisible={MAX_VISIBLE_CHIPS}
                  onChipPress={handleGoalChipPress}
                  onOverflowPress={handleOverflowPress}
                />
              </View>
            ) : (
              // Show hint text when no goals
              <ThemedText style={[styles.collapsedText, { color: iconColor }]}>
                Ask anything... "Set a savings goal"
              </ThemedText>
            )}
            <PressableScale onPress={handleMicPress} hitSlop={8}>
              <Ionicons name="mic-outline" size={20} color={iconColor} />
            </PressableScale>
          </PressableScale>
        )}
      </Animated.View>

      {/* Bottom Row: Static Navigation */}
      <View style={[styles.navPill, { backgroundColor: dockBg, borderColor }]}>
        {navRoutes.map((route) => renderNavItem(route))}
      </View>

      {/* Goal Overflow Popover */}
      <GoalOverflowPopover
        visible={isOverflowVisible}
        goals={overflowGoals}
        onGoalPress={handleOverflowGoalPress}
        onClose={handleOverflowClose}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
    paddingTop: 8,
    gap: 8,
    backgroundColor: 'transparent',
  },

  // Command Bar - matches top bar styling
  commandBar: {
    overflow: 'hidden',
    borderWidth: 1,
    borderRadius: 28,
  },

  // Collapsed State
  collapsedBar: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    gap: 8,
  },
  collapsedContent: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  collapsedText: {
    flex: 1,
    fontSize: 14,
  },
  collapsedTextShort: {
    fontSize: 13,
  },

  // Expanded State
  expandedContent: {
    flex: 1,
    padding: 12,
  },
  expandedHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  headerTitle: {
    fontSize: 12,
    fontWeight: '500',
    color: INACTIVE_ICON_COLOR,
  },
  closeButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Chat Area
  chatArea: {
    flex: 1,
    marginBottom: 8,
  },
  chatContent: {
    paddingVertical: 4,
  },

  // Suggestions
  suggestionsContainer: {
    flex: 1,
  },
  suggestionsLabel: {
    fontSize: 10,
    fontWeight: '500',
    color: INACTIVE_ICON_COLOR,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 10,
  },
  suggestionsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  suggestionChip: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 16,
  },
  suggestionText: {
    fontSize: 12,
    color: '#9CA3AF',
  },

  // Message Bubbles
  messageBubble: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 16,
    marginBottom: 8,
    maxWidth: '85%',
  },
  userBubble: {
    alignSelf: 'flex-end',
    backgroundColor: USER_BUBBLE_COLOR,
    borderBottomRightRadius: 4,
  },
  aiBubble: {
    alignSelf: 'flex-start',
    backgroundColor: AI_BUBBLE_COLOR,
    borderBottomLeftRadius: 4,
  },
  bubbleIcon: {
    marginRight: 8,
    marginTop: 2,
  },
  messageText: {
    fontSize: 14,
    lineHeight: 20,
    color: '#FFFFFF',
    flexShrink: 1,
  },

  // Input Row
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 24,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  expandedInput: {
    flex: 1,
    fontSize: 14,
    color: '#FFFFFF',
    paddingVertical: 4,
  },
  inputButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  inputButtonActive: {
    backgroundColor: ACTIVE_COLOR,
  },
  sendButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: ACTIVE_COLOR,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendButtonDisabled: {
    opacity: 0.5,
  },

  // Navigation Pill - static 4-item navbar
  navPill: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    borderRadius: 28,
    borderWidth: 1,
    paddingVertical: 6,
    paddingHorizontal: 8,
  },
  navItem: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 20,
  },
  navItemActive: {
    backgroundColor: ACTIVE_COLOR,
  },
  navLabel: {
    fontSize: 10,
    fontWeight: '600',
  },
  navLabelActive: {
    color: '#FFFFFF',
  },

});
