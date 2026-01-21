import { useState, useRef, useEffect } from 'react';
import {
  View,
  Pressable,
  StyleSheet,
  TextInput,
  ScrollView,
  Keyboard,
  ActivityIndicator,
  Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  interpolate,
} from 'react-native-reanimated';

import { ThemedText } from '@/components/themed-text';
import { useColorScheme } from '@/hooks/use-color-scheme';

// Colors matching the design
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

const { height: SCREEN_HEIGHT } = Dimensions.get('window');
const EXPANDED_HEIGHT = Math.min(SCREEN_HEIGHT * 0.4, 320);

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
}

export interface FloatingCommandBarProps {
  initialMessages?: ChatMessage[];
  sessionId?: string | null;
  onNewSession?: (firstMessage: string) => void;
  onMessagesChange?: (messages: ChatMessage[]) => void;
  onChatClose?: () => void;
  onMicPress?: () => void;
  bottomOffset?: number; // Distance from bottom (default: 72)
}

const springConfig = {
  damping: 20,
  stiffness: 300,
};

export function FloatingCommandBar({
  initialMessages = [],
  onMessagesChange,
  onChatClose,
  onMicPress,
  bottomOffset = 72,
}: FloatingCommandBarProps) {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  // Theme-aware colors
  const dockBg = isDark ? DOCK_BG_DARK : DOCK_BG_LIGHT;
  const borderColor = isDark ? BORDER_DARK : BORDER_LIGHT;
  const iconColor = isDark ? INACTIVE_ICON_COLOR_DARK : INACTIVE_ICON_COLOR;

  // Command bar state
  const [isExpanded, setIsExpanded] = useState(false);
  const [commandText, setCommandText] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>(initialMessages);
  const [isListening, setIsListening] = useState(false);

  const inputRef = useRef<TextInput>(null);
  const scrollViewRef = useRef<ScrollView>(null);

  // Animation value
  const expandProgress = useSharedValue(0);

  // Animate expansion
  useEffect(() => {
    expandProgress.value = withSpring(isExpanded ? 1 : 0, springConfig);
  }, [isExpanded]);

  // Focus input when expanded
  useEffect(() => {
    if (isExpanded) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isExpanded]);

  // Scroll to bottom when messages change
  useEffect(() => {
    if (chatMessages.length > 0) {
      setTimeout(() => scrollViewRef.current?.scrollToEnd({ animated: true }), 100);
    }
    onMessagesChange?.(chatMessages);
  }, [chatMessages.length]);

  const handleBarPress = () => {
    if (process.env.EXPO_OS === 'ios') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    setIsExpanded(true);
  };

  const handleClose = () => {
    Keyboard.dismiss();
    setIsExpanded(false);
    setChatMessages([]);
    setCommandText('');
    onChatClose?.();
  };

  const handleMicPress = () => {
    if (process.env.EXPO_OS === 'ios') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    setIsListening(!isListening);
    onMicPress?.();
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
      return 'Your portfolio shows your current holdings. Check the Home screen for your balance breakdown!';
    }
    if (lowered.includes('send') || lowered.includes('transfer')) {
      return "I can help you send crypto. Use the Transfer tab or tell me who you'd like to send to!";
    }
    if (lowered.includes('help') || lowered.includes('what can you do')) {
      return 'I can help you: send/receive crypto, manage your card, explore tokens, set goals, and answer questions. Just ask naturally!';
    }
    if (lowered.includes('thank')) {
      return "You're welcome! Let me know if you need anything else.";
    }

    return 'I understood your message. Is there something specific I can help you with?';
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

  // Animated styles
  const containerAnimatedStyle = useAnimatedStyle(() => {
    const height = interpolate(expandProgress.value, [0, 1], [48, EXPANDED_HEIGHT]);
    const borderRadius = interpolate(expandProgress.value, [0, 1], [28, 24]);

    return {
      height,
      borderRadius,
    };
  });

  // Z-index based on expansion state
  const zIndex = isExpanded ? 1001 : 999;

  return (
    <Animated.View
      style={[
        styles.container,
        { bottom: bottomOffset, backgroundColor: dockBg, borderColor, zIndex },
        containerAnimatedStyle,
      ]}
    >
      {isExpanded ? (
        // Expanded State
        <View style={styles.expandedContent}>
          {/* Header with close button */}
          <View style={styles.expandedHeader}>
            <View style={styles.headerLeft}>
              <Ionicons name="sparkles" size={16} color={SPARKLE_COLOR} />
              <ThemedText style={styles.headerTitle}>DisCard Assistant</ThemedText>
            </View>
            <Pressable onPress={handleClose} style={styles.closeButton}>
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
        // Collapsed State - Mini bar with sparkle + "Ask anything..." + mic
        <Pressable onPress={handleBarPress} style={styles.collapsedBar}>
          <Ionicons name="sparkles" size={18} color={SPARKLE_COLOR} />
          <ThemedText style={[styles.collapsedText, { color: iconColor }]}>Ask anything...</ThemedText>
          <Pressable
            onPress={(e) => {
              e.stopPropagation();
              handleMicPress();
            }}
            hitSlop={8}
          >
            <Ionicons name="mic-outline" size={20} color={iconColor} />
          </Pressable>
        </Pressable>
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    left: 16,
    right: 16,
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

  pressed: {
    opacity: 0.7,
    transform: [{ scale: 0.96 }],
  },
});
