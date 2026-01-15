import { useState, useRef, useEffect } from 'react';
import {
  View,
  Pressable,
  StyleSheet,
  TextInput,
  ScrollView,
  Keyboard,
  Dimensions,
  ActivityIndicator,
  LayoutAnimation,
  Platform,
  UIManager,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  interpolate,
  FadeIn,
  FadeOut,
} from 'react-native-reanimated';

import { ThemedText } from '@/components/themed-text';
import { useColorScheme } from '@/hooks/use-color-scheme';

// Enable LayoutAnimation on Android
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const { width: SCREEN_WIDTH } = Dimensions.get('window');

type IconName = 'home' | 'swap-horizontal' | 'grid' | 'search';

interface TabConfig {
  icon: IconName;
  label: string;
}

// Tab configuration for navigation items (left pill)
const navTabConfig: Record<string, TabConfig> = {
  index: { icon: 'home', label: 'Home' },
  transfer: { icon: 'swap-horizontal', label: 'Transfer' },
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

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
}

interface PillTabBarProps extends BottomTabBarProps {
  onCommandSubmit?: (text: string) => void;
  onMicPress?: () => void;
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);
const AnimatedView = Animated.createAnimatedComponent(View);

const springConfig = {
  damping: 20,
  stiffness: 300,
};

export function PillTabBar({ state, descriptors, navigation }: PillTabBarProps) {
  const insets = useSafeAreaInsets();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  
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
  
  // Search bar state
  const [isSearchExpanded, setIsSearchExpanded] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  
  const inputRef = useRef<TextInput>(null);
  const searchInputRef = useRef<TextInput>(null);
  const scrollViewRef = useRef<ScrollView>(null);

  // Animation values
  const commandExpandProgress = useSharedValue(0);

  // Filter routes for main nav (index, transfer, menu) and search
  const navRoutes = state.routes.filter((route) => navTabConfig[route.name]);
  const searchRoute = state.routes.find((route) => route.name === 'explore');

  // Check if on explore tab
  const isOnExplore = searchRoute && state.index === state.routes.findIndex((r) => r.key === searchRoute.key);

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

  // Don't auto-focus search input - user must tap into it

  // Collapse search when leaving explore view
  useEffect(() => {
    if (!isOnExplore && isSearchExpanded) {
      animateLayout();
      setIsSearchExpanded(false);
    }
  }, [isOnExplore]);

  // Scroll to bottom when messages change
  useEffect(() => {
    if (chatMessages.length > 0) {
      setTimeout(() => scrollViewRef.current?.scrollToEnd({ animated: true }), 100);
    }
  }, [chatMessages.length]);

  const animateLayout = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
  };

  const handleCommandBarPress = () => {
    if (process.env.EXPO_OS === 'ios') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    setIsCommandExpanded(true);
    // Collapse search when command bar opens
    if (isSearchExpanded) {
      animateLayout();
      setIsSearchExpanded(false);
    }
  };

  const handleCommandClose = () => {
    Keyboard.dismiss();
    setIsCommandExpanded(false);
    setChatMessages([]);
    setCommandText('');
  };

  const handleSearchPress = () => {
    if (process.env.EXPO_OS === 'ios') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    
    if (!isSearchExpanded) {
      // Navigate to explore and expand search
      if (searchRoute) {
        navigation.navigate(searchRoute.name);
      }
      animateLayout();
      setIsSearchExpanded(true);
      setIsCommandExpanded(false);
    } else {
      // Collapse search
      animateLayout();
      setIsSearchExpanded(false);
    }
  };

  const handleNavExpand = () => {
    // Navigate to home and collapse search when navbar is clicked
    if (process.env.EXPO_OS === 'ios') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    // Navigate to home (index) screen
    const homeRoute = state.routes.find((r) => r.name === 'index');
    if (homeRoute) {
      navigation.navigate(homeRoute.name);
    }
    animateLayout();
    setIsSearchExpanded(false);
    setIsCommandExpanded(false);
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
      <Pressable
        key={route.key}
        accessibilityRole="button"
        accessibilityState={isFocused ? { selected: true } : {}}
        accessibilityLabel={options.tabBarAccessibilityLabel}
        onPress={onPress}
        style={({ pressed }) => [styles.navItem, isFocused && styles.navItemActive, pressed && styles.pressed]}
      >
        <Ionicons name={config.icon} size={20} color={isFocused ? '#FFFFFF' : iconColor} />
        <ThemedText style={[styles.navLabel, isFocused && styles.navLabelActive, !isFocused && { color: iconColor }]}>{config.label}</ThemedText>
      </Pressable>
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
              <Pressable onPress={handleCommandClose} style={styles.closeButton}>
                <Ionicons name="close" size={20} color={INACTIVE_ICON_COLOR} />
              </Pressable>
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
                      <Pressable
                        key={index}
                        onPress={() => handleSuggestionPress(suggestion)}
                        style={({ pressed }) => [styles.suggestionChip, pressed && styles.pressed]}
                      >
                        <ThemedText style={styles.suggestionText}>{suggestion}</ThemedText>
                      </Pressable>
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
              <Pressable
                onPress={handleMicPress}
                style={({ pressed }) => [
                  styles.inputButton,
                  isListening && styles.inputButtonActive,
                  pressed && styles.pressed,
                ]}
              >
                <Ionicons name="mic" size={20} color={isListening ? '#FFFFFF' : INACTIVE_ICON_COLOR} />
              </Pressable>
              <Pressable
                onPress={handleCommandSubmit}
                disabled={!commandText.trim() || isProcessing}
                style={({ pressed }) => [
                  styles.sendButton,
                  (!commandText.trim() || isProcessing) && styles.sendButtonDisabled,
                  pressed && styles.pressed,
                ]}
              >
                <Ionicons name="send" size={18} color="#FFFFFF" />
              </Pressable>
            </View>
          </View>
        ) : (
          // Collapsed State
          <Pressable onPress={handleCommandBarPress} style={styles.collapsedBar}>
            <Ionicons name="sparkles" size={18} color={SPARKLE_COLOR} />
            <ThemedText style={[styles.collapsedText, { color: iconColor }]}>Ask anything or give a command...</ThemedText>
            <Pressable onPress={handleMicPress} hitSlop={8}>
              <Ionicons name="mic-outline" size={20} color={iconColor} />
            </Pressable>
          </Pressable>
        )}
      </Animated.View>

      {/* Bottom Row: Nav Pill + Search */}
      <View style={styles.bottomRow}>
        {/* Navigation Pill - Collapses when search is expanded */}
        <View style={[styles.navPill, { backgroundColor: dockBg, borderColor }, isSearchExpanded && styles.navPillCollapsed]}>
          {!isSearchExpanded ? (
            // Expanded Navbar - Home, Transfer, Menu
            navRoutes.map((route) => renderNavItem(route))
          ) : (
            // Collapsed Navbar - Just Home icon
            <Pressable
              onPress={handleNavExpand}
              style={({ pressed }) => [styles.collapsedNavButton, pressed && styles.pressed]}
            >
              <Ionicons 
                name="home" 
                size={24} 
                color={state.index === 0 ? ACTIVE_COLOR : iconColor} 
              />
            </Pressable>
          )}
        </View>

        {/* Search Button / Expanded Search Bar */}
        <View style={[styles.searchContainer, { backgroundColor: dockBg, borderColor }, isSearchExpanded && styles.searchContainerExpanded]}>
          {isSearchExpanded ? (
            // Expanded Search Bar
            <View style={styles.searchBarExpanded}>
              <Ionicons name="search" size={20} color={iconColor} />
              <TextInput
                ref={searchInputRef}
                value={searchQuery}
                onChangeText={setSearchQuery}
                placeholder="Search tokens, markets, assets..."
                placeholderTextColor={iconColor}
                style={[styles.searchInput, { color: isDark ? '#FFFFFF' : '#11181C' }]}
              />
              <Pressable
                onPress={() => {
                  animateLayout();
                  setIsSearchExpanded(false);
                  setSearchQuery('');
                }}
                style={styles.searchCloseButton}
              >
                <Ionicons name="close" size={18} color={iconColor} />
              </Pressable>
            </View>
          ) : (
            // Collapsed Search Button
            <Pressable
              onPress={handleSearchPress}
              style={({ pressed }) => [styles.searchButton, isOnExplore && styles.searchButtonActive, pressed && styles.pressed]}
            >
              <Ionicons name="search" size={20} color={isOnExplore ? '#FFFFFF' : iconColor} />
            </Pressable>
          )}
        </View>
      </View>
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
    paddingHorizontal: 16,
    gap: 10,
  },
  collapsedText: {
    flex: 1,
    fontSize: 14,
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

  // Bottom Row
  bottomRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: 8,
  },

  // Navigation Pill - matches top bar styling
  navPill: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    borderRadius: 28,
    borderWidth: 1,
    paddingVertical: 6,
    paddingHorizontal: 8,
  },
  navPillCollapsed: {
    flex: 0,
    width: 52,
    paddingHorizontal: 0,
  },
  collapsedNavButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Vertical layout: icon on top, label below, both inside active pill
  navItem: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    paddingHorizontal: 12,
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

  // Search Container - matches top bar styling
  searchContainer: {
    borderRadius: 28,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 6,
  },
  searchContainerExpanded: {
    flex: 1,
  },
  searchButton: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  searchButtonActive: {
    backgroundColor: ACTIVE_COLOR,
  },
  searchBarExpanded: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 10,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: '#FFFFFF',
    paddingVertical: 0,
  },
  searchCloseButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  pressed: {
    opacity: 0.7,
    transform: [{ scale: 0.96 }],
  },
});
