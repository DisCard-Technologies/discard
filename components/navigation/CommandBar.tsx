import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  StyleSheet,
  TextInput,
  ScrollView,
  Keyboard,
  ActivityIndicator,
  ViewStyle,
} from 'react-native';
import { PressableScale } from 'pressto';
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

// Theme colors
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

const springConfig = { damping: 20, stiffness: 300 };

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
}

export interface CommandBarProps {
  suggestions?: string[];
  placeholderText?: string;
  collapsedHintText?: string;
  onSubmit?: (text: string) => Promise<string> | string;
  onMicPress?: () => void;
  leftContent?: React.ReactNode;
  style?: ViewStyle;
}

export function CommandBar({
  suggestions = [
    'Keep my card balance at $200',
    'Send $50 to alex.eth',
    'Show me trending tokens',
    "What's my portfolio breakdown?",
  ],
  placeholderText = 'Ask anything or give a command...',
  collapsedHintText = 'Ask anything...',
  onSubmit,
  onMicPress,
  leftContent,
  style,
}: CommandBarProps) {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  const dockBg = isDark ? DOCK_BG_DARK : DOCK_BG_LIGHT;
  const borderColor = isDark ? BORDER_DARK : BORDER_LIGHT;
  const iconColor = isDark ? INACTIVE_ICON_COLOR_DARK : INACTIVE_ICON_COLOR;

  const [isExpanded, setIsExpanded] = useState(false);
  const [commandText, setCommandText] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [isListening, setIsListening] = useState(false);

  const inputRef = useRef<TextInput>(null);
  const scrollViewRef = useRef<ScrollView>(null);
  const expandProgress = useSharedValue(0);

  useEffect(() => {
    expandProgress.value = withSpring(isExpanded ? 1 : 0, springConfig);
  }, [isExpanded]);

  useEffect(() => {
    if (isExpanded) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isExpanded]);

  useEffect(() => {
    if (chatMessages.length > 0) {
      setTimeout(() => scrollViewRef.current?.scrollToEnd({ animated: true }), 100);
    }
  }, [chatMessages.length]);

  const handlePress = () => {
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

  const handleSubmit = async () => {
    if (!commandText.trim() || isProcessing) return;

    const userMessage: ChatMessage = {
      id: `user_${Date.now()}`,
      role: 'user',
      content: commandText.trim(),
    };

    setChatMessages((prev) => [...prev, userMessage]);
    setCommandText('');
    setIsProcessing(true);

    try {
      const response = onSubmit
        ? await onSubmit(userMessage.content)
        : getDefaultResponse(userMessage.content);

      const assistantMessage: ChatMessage = {
        id: `ai_${Date.now()}`,
        role: 'assistant',
        content: response,
      };

      setChatMessages((prev) => [...prev, assistantMessage]);
    } finally {
      setIsProcessing(false);
    }
  };

  const getDefaultResponse = (input: string): string => {
    const lowered = input.toLowerCase();
    if (lowered.includes('hi') || lowered.includes('hello')) {
      return "Hey! I'm your assistant. What would you like to do?";
    }
    if (lowered.includes('help')) {
      return 'I can help you send/receive crypto, manage your card, and answer questions.';
    }
    return 'I understood your message. Is there something specific I can help with?';
  };

  const animatedStyle = useAnimatedStyle(() => {
    const height = interpolate(expandProgress.value, [0, 1], [48, 280]);
    const borderRadius = interpolate(expandProgress.value, [0, 1], [28, 24]);
    return { height, borderRadius };
  });

  return (
    <Animated.View
      style={[styles.container, { backgroundColor: dockBg, borderColor }, animatedStyle, style]}
    >
      {isExpanded ? (
        <View style={styles.expandedContent}>
          {/* Header */}
          <View style={styles.expandedHeader}>
            <View style={styles.headerLeft}>
              <Ionicons name="sparkles" size={16} color={SPARKLE_COLOR} />
              <ThemedText style={styles.headerTitle}>Assistant</ThemedText>
            </View>
            <PressableScale onPress={handleClose} style={styles.closeButton}>
              <Ionicons name="close" size={20} color={INACTIVE_ICON_COLOR} />
            </PressableScale>
          </View>

          {/* Chat Area */}
          <ScrollView
            ref={scrollViewRef}
            style={styles.chatArea}
            contentContainerStyle={styles.chatContent}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            {chatMessages.length === 0 ? (
              <View style={styles.suggestionsContainer}>
                <ThemedText style={styles.suggestionsLabel}>Try saying</ThemedText>
                <View style={styles.suggestionsWrap}>
                  {suggestions.map((suggestion, index) => (
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
              placeholder={placeholderText}
              placeholderTextColor={PLACEHOLDER_COLOR}
              style={styles.expandedInput}
              returnKeyType="send"
              onSubmitEditing={handleSubmit}
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
              onPress={handleSubmit}
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
        <PressableScale onPress={handlePress} style={styles.collapsedBar}>
          <Ionicons name="sparkles" size={18} color={SPARKLE_COLOR} />
          {leftContent ? (
            <View style={styles.collapsedContent}>
              <ThemedText style={[styles.collapsedTextShort, { color: iconColor }]}>Ask...</ThemedText>
              {leftContent}
            </View>
          ) : (
            <ThemedText style={[styles.collapsedText, { color: iconColor }]}>
              {collapsedHintText}
            </ThemedText>
          )}
          <PressableScale onPress={handleMicPress} hitSlop={8}>
            <Ionicons name="mic-outline" size={20} color={iconColor} />
          </PressableScale>
        </PressableScale>
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    overflow: 'hidden',
    borderWidth: 1,
    borderRadius: 28,
  },
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
  chatArea: {
    flex: 1,
    marginBottom: 8,
  },
  chatContent: {
    paddingVertical: 4,
  },
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
});
