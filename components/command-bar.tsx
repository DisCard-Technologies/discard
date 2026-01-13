import { useState, useRef, useEffect } from 'react';
import { StyleSheet, View, Pressable, TextInput, Keyboard, Alert, ScrollView, Dimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';

import { ThemedText } from '@/components/themed-text';
import { useThemeColor } from '@/hooks/use-theme-color';
import { useIntents } from '@/hooks/useIntents';
import { useCurrentUserId } from '@/stores/authConvex';
import { ActivityIndicator } from 'react-native';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

import type { ChatMessage as ChatMessageType } from '@/types/chat';

interface CommandBarProps {
  onSend?: (message: string) => void;
  onCamera?: () => void;
  onMic?: () => void;
  onFocusChange?: (focused: boolean) => void;
  // Chat history integration
  initialMessages?: ChatMessageType[];
  sessionId?: string | null;
  onNewSession?: (sessionId: string) => void;
  onMessagesChange?: (messages: ChatMessageType[]) => void;
  onChatClose?: () => void; // Called when user closes the chat to clear active session
}

interface ChatMessage {
  id: string;
  type: 'user' | 'ai';
  text: string;
}

export function CommandBar({
  onSend,
  onCamera,
  onMic,
  onFocusChange,
  initialMessages,
  sessionId,
  onNewSession,
  onMessagesChange,
  onChatClose,
}: CommandBarProps) {
  const [input, setInput] = useState('');
  const [isListening, setIsListening] = useState(false);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>(
    // Convert initial messages to local format if provided
    initialMessages?.map(m => ({ id: m.id, type: m.type, text: m.text })) || []
  );
  const inputRef = useRef<TextInput>(null);
  const scrollViewRef = useRef<ScrollView>(null);

  // Track the current session ID to detect changes
  const prevSessionIdRef = useRef<string | null | undefined>(sessionId);

  // Intent integration
  const userId = useCurrentUserId();
  const {
    activeIntent,
    isProcessing,
    submitIntent,
    cancelIntent,
    clarifyIntent,
    approveIntent,
  } = useIntents(userId);

  const primaryColor = useThemeColor({}, 'tint');
  const mutedColor = useThemeColor({ light: '#687076', dark: '#9BA1A6' }, 'icon');
  const inputBg = useThemeColor({ light: '#ffffff', dark: '#1c1c1e' }, 'background');
  const borderColor = useThemeColor({ light: 'rgba(0,0,0,0.1)', dark: 'rgba(255,255,255,0.15)' }, 'background');
  const textColor = useThemeColor({}, 'text');

  // Track which AI messages we've already added to persist them
  // Using useRef instead of useState for synchronous updates to prevent duplicate messages
  const seenAiMessagesRef = useRef<Set<string>>(new Set());

  // Reset state when session changes (e.g., loading a different chat)
  useEffect(() => {
    if (sessionId !== prevSessionIdRef.current) {
      prevSessionIdRef.current = sessionId;

      // Load messages from initial messages when session changes
      const newMessages = initialMessages?.map(m => ({ id: m.id, type: m.type, text: m.text })) || [];
      setChatMessages(newMessages);

      // Reset seen AI messages based on loaded messages
      seenAiMessagesRef.current = new Set(
        newMessages.filter(m => m.type === 'ai').map(m => m.id)
      );
    }
  }, [sessionId, initialMessages]);

  // Ref to store the callback to avoid dependency issues
  const onMessagesChangeRef = useRef(onMessagesChange);
  onMessagesChangeRef.current = onMessagesChange;

  // Track last saved message count to avoid redundant saves
  const lastSavedCountRef = useRef(0);

  // Notify parent when messages change (for persistence)
  // Using ref for callback to avoid infinite loops
  useEffect(() => {
    // Only save if we have new messages beyond what we've already saved
    if (chatMessages.length > 0 && chatMessages.length !== lastSavedCountRef.current) {
      lastSavedCountRef.current = chatMessages.length;

      if (onMessagesChangeRef.current) {
        // Convert to ChatMessageType format with timestamps
        const messagesWithTimestamp = chatMessages.map(m => ({
          id: m.id,
          type: m.type,
          text: m.text,
          timestamp: Date.now(),
        }));
        onMessagesChangeRef.current(messagesWithTimestamp);
      }
    }
  }, [chatMessages]);

  // Show loading if parsing
  const showLoading = activeIntent && (activeIntent.status === 'parsing' || activeIntent.status === 'pending');

  // Persist AI messages when intent status changes
  // Only show messages for specific statuses to prevent duplicates
  useEffect(() => {
    if (!activeIntent) return;

    const aiMsgId = `ai_${activeIntent._id}_${activeIntent.status}`;
    if (seenAiMessagesRef.current.has(aiMsgId)) return;

    let aiText: string | null = null;

    // Only show messages for specific statuses
    switch (activeIntent.status) {
      case 'clarifying':
        aiText = activeIntent.clarificationQuestion || activeIntent.responseText || "Please provide more details.";
        break;

      case 'ready':
        // Show response when ready for user approval
        if (activeIntent.responseText) {
          aiText = activeIntent.responseText + " Tap approve to continue.";
        } else if (activeIntent.parsedIntent) {
          const actionLabels: Record<string, string> = {
            create_card: "I'll create a new virtual card for you.",
            fund_card: "I'll fund your card.",
            transfer: "I'll transfer the funds.",
            swap: "I'll swap the tokens.",
            withdraw_defi: "I'll withdraw from DeFi.",
            delete_card: "I'll delete the card(s) for you.",
            freeze_card: "I'll freeze the card for you.",
            pay_bill: "I'll pay the bill.",
          };
          aiText = (actionLabels[activeIntent.parsedIntent.action] || "Ready to proceed.") + " Tap approve to continue.";
        }
        break;

      case 'completed':
        // For conversational intents (no action), show the AI's response
        // For action intents, show a completion message
        if (activeIntent.parsedIntent?.action) {
          // Action was executed (create_card, fund_card, etc.)
          aiText = "Done! Your request has been completed successfully.";
        } else if (activeIntent.responseText) {
          // Conversational - show the AI's actual response
          aiText = activeIntent.responseText;
        } else {
          aiText = "Done!";
        }
        break;

      case 'failed':
        aiText = activeIntent.error || "Something went wrong. Please try again.";
        break;

      // Don't show messages for: pending, parsing, approved, executing
    }

    if (aiText) {
      seenAiMessagesRef.current.add(aiMsgId);
      setChatMessages(prev => [...prev, {
        id: aiMsgId,
        type: 'ai',
        text: aiText!,
      }]);
    }
  }, [activeIntent?.status, activeIntent?.clarificationQuestion, activeIntent?._id, activeIntent?.parsedIntent, activeIntent?.error, activeIntent?.responseText]);

  // Auto-navigate to transfer confirmation when a transfer intent is approved
  useEffect(() => {
    if (!activeIntent) return;
    if (activeIntent.status !== 'approved' && activeIntent.status !== 'executing') return;
    if (activeIntent.parsedIntent?.action !== 'transfer') return;
    if (!activeIntent.parsedIntent?.targetId) return;

    // Navigate to transfer confirmation with pre-filled data from intent
    const parsedIntent = activeIntent.parsedIntent;
    (router.push as any)({
      pathname: '/transfer/confirmation',
      params: {
        recipient: JSON.stringify({
          address: parsedIntent.targetId,
          displayName: parsedIntent.metadata?.recipientName || parsedIntent.targetId?.slice(0, 8),
          type: 'address',
        }),
        amount: JSON.stringify({
          amount: (parsedIntent.amount || 0) / 100, // Convert cents to dollars
          amountUsd: (parsedIntent.amount || 0) / 100,
          amountBaseUnits: ((parsedIntent.amount || 0) * 10000).toString(), // USDC has 6 decimals
        }),
        token: JSON.stringify({
          symbol: parsedIntent.currency || 'USDC',
          mint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', // USDC mint
          decimals: 6,
          balance: 0,
          balanceUsd: 0,
        }),
        fees: JSON.stringify({
          networkFee: 0.00001,
          networkFeeUsd: 0.001,
          platformFee: 0,
          priorityFee: 0.00001,
          ataRent: 0,
          totalFeesUsd: 0.001,
          totalCostUsd: ((parsedIntent.amount || 0) / 100) + 0.001,
        }),
        fromIntent: 'true', // Flag to indicate this came from AI intent
      },
    });
  }, [activeIntent?.status, activeIntent?.parsedIntent?.action]);

  // Expand ONLY when we have messages to show
  const isExpanded = chatMessages.length > 0 || showLoading;

  // Scroll to bottom when messages change
  useEffect(() => {
    if (chatMessages.length > 0) {
      setTimeout(() => scrollViewRef.current?.scrollToEnd({ animated: true }), 100);
    }
  }, [chatMessages.length]);

  const handleSubmit = async () => {
    if (!input.trim()) return;

    const text = input.trim();
    setInput('');
    Keyboard.dismiss();

    // If no session exists and this is the first message, notify parent to create one
    if (!sessionId && onNewSession && chatMessages.length === 0) {
      // Parent will create session - we signal with the first message text
      // The parent should call createNewChat() and set the sessionId
      onNewSession(text);
    }

    // Add user message to chat
    setChatMessages(prev => [...prev, {
      id: `user_${Date.now()}`,
      type: 'user',
      text
    }]);

    if (userId) {
      try {
        if (activeIntent?.status === 'clarifying') {
          await clarifyIntent(activeIntent._id, text);
        } else {
          await submitIntent(text);
        }
      } catch (error) {
        console.error('[CommandBar] Intent operation failed:', error);
        Alert.alert('Error', 'Failed to process command. Please try again.');
      }
    } else {
      Alert.alert('Not Logged In', 'Please log in to use AI commands.');
    }
  };

  const handleMicPress = () => {
    setIsListening(!isListening);
    onMic?.();
  };

  const handleClose = () => {
    // Only cancel if intent exists and is in a cancellable state
    if (activeIntent && !['completed', 'cancelled', 'failed', 'executing'].includes(activeIntent.status)) {
      cancelIntent(activeIntent._id);
    }
    setChatMessages([]);
    seenAiMessagesRef.current = new Set();
    lastSavedCountRef.current = 0;

    // Notify parent to clear active session so next chat starts fresh
    onChatClose?.();
  };

  return (
    <View style={styles.wrapper}>
      <View style={[
        styles.commandContainer,
        { backgroundColor: inputBg, borderColor },
      ]}>
        {/* Chat Messages Area - only when expanded */}
        {isExpanded && (
          <View style={styles.chatArea}>
            <Pressable style={styles.closeButton} onPress={handleClose}>
              <Ionicons name="close" size={18} color={mutedColor} />
            </Pressable>

            <ScrollView
              ref={scrollViewRef}
              style={styles.messagesScroll}
              contentContainerStyle={styles.messagesContent}
              showsVerticalScrollIndicator={false}
            >
              {chatMessages.map((msg) => (
                <View
                  key={msg.id}
                  style={[
                    styles.messageBubble,
                    msg.type === 'user' ? styles.userBubble : styles.aiBubble,
                  ]}
                >
                  {msg.type === 'ai' && (
                    <Ionicons name="sparkles" size={14} color="#8B5CF6" style={styles.aiIcon} />
                  )}
                  <ThemedText style={styles.messageText}>
                    {msg.text}
                  </ThemedText>
                </View>
              ))}

              {showLoading && (
                <View style={[styles.messageBubble, styles.aiBubble]}>
                  <Ionicons name="sparkles" size={14} color="#8B5CF6" style={styles.aiIcon} />
                  <ActivityIndicator size="small" color="#8B5CF6" />
                  <ThemedText style={[styles.messageText, { marginLeft: 8 }]}>
                    Thinking...
                  </ThemedText>
                </View>
              )}

              {/* Approve/Cancel buttons for ready status */}
              {activeIntent?.status === 'ready' && (
                <View style={styles.approvalButtons}>
                  <Pressable
                    onPress={() => cancelIntent(activeIntent._id)}
                    style={({ pressed }) => [styles.cancelButton, pressed && styles.pressed]}
                  >
                    <ThemedText style={styles.cancelButtonText}>Cancel</ThemedText>
                  </Pressable>
                  <Pressable
                    onPress={() => approveIntent(activeIntent._id)}
                    disabled={isProcessing}
                    style={({ pressed }) => [
                      styles.approveButton,
                      { backgroundColor: primaryColor },
                      isProcessing && styles.buttonDisabled,
                      pressed && styles.pressed,
                    ]}
                  >
                    <Ionicons name="checkmark" size={18} color="#fff" />
                    <ThemedText style={styles.approveButtonText}>Approve</ThemedText>
                  </Pressable>
                </View>
              )}
            </ScrollView>
          </View>
        )}

        {/* Input Row - ALWAYS visible */}
        <View style={[styles.inputRow, isExpanded && styles.inputRowExpanded]}>
          <Pressable
            onPress={onCamera}
            style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}
          >
            <Ionicons name="camera-outline" size={22} color={mutedColor} />
          </Pressable>

          <TextInput
            ref={inputRef}
            value={input}
            onChangeText={setInput}
            onFocus={() => onFocusChange?.(true)}
            onBlur={() => onFocusChange?.(false)}
            placeholder="Ask anything or give a command..."
            placeholderTextColor={mutedColor}
            style={[styles.input, { color: textColor }]}
            returnKeyType="send"
            onSubmitEditing={handleSubmit}
            editable={!isProcessing}
          />

          {input.length > 0 && (
            <Pressable
              onPress={() => setInput('')}
              style={({ pressed }) => [styles.clearButton, pressed && styles.pressed]}
            >
              <Ionicons name="close" size={16} color={mutedColor} />
            </Pressable>
          )}

          <Pressable
            onPress={handleMicPress}
            style={({ pressed }) => [
              styles.iconButton,
              isListening && { backgroundColor: primaryColor },
              pressed && styles.pressed,
            ]}
          >
            <Ionicons name="mic" size={22} color={isListening ? '#fff' : mutedColor} />
          </Pressable>

          <Pressable
            onPress={handleSubmit}
            disabled={!input.trim() || isProcessing}
            style={({ pressed }) => [
              styles.sendButton,
              { backgroundColor: primaryColor },
              (!input.trim() || isProcessing) && styles.sendDisabled,
              pressed && styles.pressed,
            ]}
          >
            <Ionicons name="send" size={18} color="#fff" style={{ marginLeft: 2 }} />
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    paddingHorizontal: 16,
  },
  commandContainer: {
    borderRadius: 24,
    borderWidth: 1,
    overflow: 'hidden',
  },
  chatArea: {
    height: SCREEN_HEIGHT * 0.35,
    position: 'relative',
  },
  closeButton: {
    position: 'absolute',
    top: 8,
    right: 8,
    zIndex: 10,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  messagesScroll: {
    flex: 1,
    marginTop: 36,
  },
  messagesContent: {
    paddingHorizontal: 12,
    paddingBottom: 8,
  },
  messageBubble: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 16,
    maxWidth: '85%',
  },
  userBubble: {
    alignSelf: 'flex-end',
    backgroundColor: '#8B5CF6',
    borderBottomRightRadius: 4,
  },
  aiBubble: {
    alignSelf: 'flex-start',
    backgroundColor: '#374151',
    borderBottomLeftRadius: 4,
  },
  aiIcon: {
    marginRight: 8,
    marginTop: 2,
  },
  messageText: {
    fontSize: 15,
    lineHeight: 20,
    color: '#FFFFFF',
    flexShrink: 1,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 8,
  },
  inputRowExpanded: {
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.1)',
  },
  iconButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  input: {
    flex: 1,
    fontSize: 14,
    paddingHorizontal: 8,
    paddingVertical: 12,
  },
  clearButton: {
    padding: 8,
  },
  sendButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendDisabled: {
    opacity: 0.5,
  },
  pressed: {
    opacity: 0.7,
    transform: [{ scale: 0.96 }],
  },
  approvalButtons: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
    marginTop: 8,
  },
  cancelButton: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  cancelButtonText: {
    color: '#9CA3AF',
    fontSize: 15,
    fontWeight: '500',
  },
  approveButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 20,
  },
  approveButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
  },
  buttonDisabled: {
    opacity: 0.5,
  },
});
