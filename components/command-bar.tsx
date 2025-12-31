import { useState, useRef } from 'react';
import { StyleSheet, View, Pressable, TextInput, Keyboard } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { ThemedText } from '@/components/themed-text';
import { useThemeColor } from '@/hooks/use-theme-color';
import { useIntents } from '@/hooks/useIntents';
import { useCurrentUserId } from '@/stores/authConvex';
import { IntentPreview } from '@/components/command/IntentPreview';
import { ExecutionStatus } from '@/components/command/ExecutionStatus';

interface CommandBarProps {
  onSend?: (message: string) => void;
  onCamera?: () => void;
  onMic?: () => void;
  onFocusChange?: (focused: boolean) => void;
}

const suggestions = [
  'Keep my card balance at $200',
  'Send $50 to alex.eth',
  'Show me trending tokens',
  "What's my portfolio breakdown?",
];

export function CommandBar({ onSend, onCamera, onMic, onFocusChange }: CommandBarProps) {
  const [input, setInput] = useState('');
  const [isListening, setIsListening] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const inputRef = useRef<TextInput>(null);

  // Intent integration
  const userId = useCurrentUserId();
  const {
    activeIntent,
    isProcessing,
    submitIntent,
    approveIntent,
    cancelIntent,
    clarifyIntent,
  } = useIntents(userId);

  const handleFocus = () => {
    setShowSuggestions(true);
    onFocusChange?.(true);
  };

  const handleBlur = () => {
    setTimeout(() => {
      setShowSuggestions(false);
      onFocusChange?.(false);
    }, 200);
  };

  const primaryColor = useThemeColor({}, 'tint');
  const mutedColor = useThemeColor({ light: '#687076', dark: '#9BA1A6' }, 'icon');
  const cardBg = useThemeColor({ light: 'rgba(0,0,0,0.05)', dark: 'rgba(255,255,255,0.08)' }, 'background');
  const borderColor = useThemeColor({ light: 'rgba(0,0,0,0.1)', dark: 'rgba(255,255,255,0.15)' }, 'background');
  const inputBg = useThemeColor({ light: '#ffffff', dark: '#1c1c1e' }, 'background');
  const textColor = useThemeColor({}, 'text');

  const handleSubmit = async () => {
    if (!input.trim()) return;

    const text = input.trim();
    setInput('');
    setShowSuggestions(false);
    Keyboard.dismiss();

    // Submit to intent system if authenticated
    if (userId) {
      try {
        await submitIntent(text);
      } catch (error) {
        console.error('[CommandBar] Intent submission failed:', error);
        // Fallback to onSend callback
        onSend?.(text);
      }
    } else {
      // Not authenticated, use simple callback
      onSend?.(text);
    }
  };

  const handleMicPress = () => {
    setIsListening(!isListening);
    onMic?.();
  };

  const handleSuggestionPress = (text: string) => {
    setInput(text);
    setShowSuggestions(false);
    inputRef.current?.focus();
  };

  // Determine what to show based on intent state
  const showPreview = activeIntent &&
    ['parsing', 'clarifying', 'ready'].includes(activeIntent.status);
  const showExecution = activeIntent &&
    ['executing', 'completed', 'failed'].includes(activeIntent.status);

  return (
    <View style={styles.wrapper}>
      {/* Intent Preview - shows when parsing/clarifying/ready */}
      {showPreview && activeIntent && (
        <View style={[styles.intentCard, { backgroundColor: inputBg, borderColor }]}>
          <IntentPreview
            intent={activeIntent}
            isProcessing={isProcessing}
            onApprove={() => approveIntent(activeIntent._id)}
            onCancel={() => cancelIntent(activeIntent._id)}
            onClarify={(text) => clarifyIntent(activeIntent._id, text)}
          />
        </View>
      )}

      {/* Execution Status - shows when executing/completed/failed */}
      {showExecution && activeIntent && (
        <View style={[styles.intentCard, { backgroundColor: inputBg, borderColor }]}>
          <ExecutionStatus
            intent={activeIntent}
            onClose={() => cancelIntent(activeIntent._id)}
          />
        </View>
      )}

      {/* Suggestions Popup */}
      {showSuggestions && !showPreview && !showExecution && (
        <View style={[styles.suggestionsCard, { backgroundColor: inputBg, borderColor }]}>
          <ThemedText style={[styles.suggestionsLabel, { color: mutedColor }]}>TRY SAYING</ThemedText>
          {suggestions.map((suggestion, i) => (
            <Pressable
              key={i}
              onPress={() => handleSuggestionPress(suggestion)}
              style={({ pressed }) => [styles.suggestionItem, pressed && styles.suggestionPressed]}
            >
              {(suggestion.includes('trending') || suggestion.includes('Find')) && (
                <Ionicons name="compass-outline" size={14} color={primaryColor} />
              )}
              <ThemedText style={[styles.suggestionText, { color: mutedColor }]}>"{suggestion}"</ThemedText>
            </Pressable>
          ))}
        </View>
      )}

      {/* Listening indicator */}
      {isListening && (
        <View style={styles.listeningIndicator}>
          <View style={styles.waveContainer}>
            {[0, 1, 2, 3, 4].map((i) => (
              <View
                key={i}
                style={[styles.wave, { backgroundColor: primaryColor, height: 12 + Math.random() * 8 }]}
              />
            ))}
          </View>
          <ThemedText style={[styles.listeningText, { color: primaryColor }]}>Listening...</ThemedText>
        </View>
      )}

      {/* Main Command Bar */}
      <View style={[styles.commandBar, { backgroundColor: inputBg, borderColor }]}>
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
          onFocus={handleFocus}
          onBlur={handleBlur}
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
  );
}

const styles = StyleSheet.create({
  wrapper: {
    paddingHorizontal: 16,
  },
  commandBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 8,
    borderRadius: 32,
    borderWidth: 1,
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
  suggestionsCard: {
    marginBottom: 8,
    padding: 12,
    borderRadius: 20,
    borderWidth: 1,
  },
  suggestionsLabel: {
    fontSize: 10,
    letterSpacing: 2,
    marginBottom: 8,
    paddingHorizontal: 4,
  },
  suggestionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 12,
  },
  suggestionPressed: {
    opacity: 0.6,
  },
  suggestionText: {
    fontSize: 14,
  },
  listeningIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 12,
  },
  waveContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  wave: {
    width: 3,
    borderRadius: 2,
  },
  listeningText: {
    fontSize: 12,
  },
  intentCard: {
    marginBottom: 8,
    padding: 16,
    borderRadius: 20,
    borderWidth: 1,
  },
});
