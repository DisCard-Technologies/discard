/**
 * CommandBar Component
 *
 * Natural language input for Intent-Centric AI Middleware.
 * Allows users to express financial intents in plain English.
 *
 * Examples:
 * - "Keep my card balance at $200"
 * - "Send $50 to alex.eth"
 * - "What's my yield this month?"
 */
import React, { useState, useCallback, useRef, useEffect } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Animated,
  Keyboard,
  Platform,
  ActivityIndicator,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useIntents } from "../../hooks/useIntents";
import { IntentPreview } from "./IntentPreview";
import { ExecutionStatus } from "./ExecutionStatus";
import type { Id } from "../../../convex/_generated/dataModel";

interface CommandBarProps {
  userId: Id<"users">;
  onIntentComplete?: () => void;
  onHighValueIntent?: () => void;
  placeholder?: string;
}

const suggestions = [
  "Keep my card balance at $200",
  "Send $50 to alex.eth",
  "What's my yield this month?",
  "Show me suspicious activity",
];

export function CommandBar({
  userId,
  onIntentComplete,
  onHighValueIntent,
  placeholder = "What would you like to do?",
}: CommandBarProps) {
  const [inputText, setInputText] = useState("");
  const [isExpanded, setIsExpanded] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [lastResponse, setLastResponse] = useState<string | null>(null);
  const inputRef = useRef<TextInput>(null);
  const expandAnimation = useRef(new Animated.Value(0)).current;
  const responseFadeAnim = useRef(new Animated.Value(0)).current;
  const suggestionsFadeAnim = useRef(new Animated.Value(0)).current;
  const listeningBars = useRef(
    [0, 1, 2, 3, 4].map(() => new Animated.Value(12))
  ).current;

  const {
    activeIntent,
    isProcessing,
    submitIntent,
    clarifyIntent,
    approveIntent,
    cancelIntent,
  } = useIntents(userId);

  // Animate listening bars
  useEffect(() => {
    if (isListening) {
      const animations = listeningBars.map((bar, i) =>
        Animated.loop(
          Animated.sequence([
            Animated.timing(bar, {
              toValue: 12 + Math.random() * 8,
              duration: 150 + i * 50,
              useNativeDriver: false,
            }),
            Animated.timing(bar, {
              toValue: 12,
              duration: 150 + i * 50,
              useNativeDriver: false,
            }),
          ])
        )
      );
      Animated.parallel(animations).start();
    } else {
      listeningBars.forEach((bar) => bar.setValue(12));
    }
  }, [isListening, listeningBars]);

  // Animate suggestions visibility
  useEffect(() => {
    Animated.timing(suggestionsFadeAnim, {
      toValue: showSuggestions ? 1 : 0,
      duration: 200,
      useNativeDriver: true,
    }).start();
  }, [showSuggestions, suggestionsFadeAnim]);

  // Animate response visibility
  useEffect(() => {
    if (lastResponse) {
      Animated.timing(responseFadeAnim, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true,
      }).start();
    } else {
      responseFadeAnim.setValue(0);
    }
  }, [lastResponse, responseFadeAnim]);

  /**
   * Handle intent submission
   */
  const handleSubmit = useCallback(async () => {
    if (!inputText.trim() || isProcessing) return;

    const intent = inputText.toLowerCase();
    Keyboard.dismiss();
    setShowSuggestions(false);

    // Check for high-value intents
    if (
      intent.includes("send") &&
      (intent.includes("$") || intent.includes("eth"))
    ) {
      const amountMatch = intent.match(/\$?(\d+)/);
      const amount = amountMatch ? parseFloat(amountMatch[1]) : 0;
      if (amount > 100 && onHighValueIntent) {
        onHighValueIntent();
        setInputText("");
        return;
      }
    }

    // Declarative goal setting - quick responses
    if (
      intent.includes("keep") ||
      intent.includes("maintain") ||
      intent.includes("auto")
    ) {
      setLastResponse("Goal set. I'll handle this automatically.");
      setInputText("");
      setTimeout(() => setLastResponse(null), 4000);
      return;
    } else if (intent.includes("yield") || intent.includes("earning")) {
      setLastResponse(
        "You've earned $847.32 this month from ambient yield optimization."
      );
      setInputText("");
      setTimeout(() => setLastResponse(null), 4000);
      return;
    }

    // Normal intent processing flow
    setIsExpanded(true);

    Animated.spring(expandAnimation, {
      toValue: 1,
      useNativeDriver: false,
    }).start();

    try {
      await submitIntent(inputText.trim());
      setInputText("");
    } catch (error) {
      console.error("Failed to submit intent:", error);
    }
  }, [
    inputText,
    isProcessing,
    submitIntent,
    expandAnimation,
    onHighValueIntent,
  ]);

  /**
   * Handle suggestion click
   */
  const handleSuggestionClick = useCallback(
    (text: string) => {
      setInputText(text);
      setShowSuggestions(false);
      inputRef.current?.focus();
    },
    []
  );

  /**
   * Handle intent approval
   */
  const handleApprove = useCallback(async () => {
    if (!activeIntent) return;

    try {
      await approveIntent(activeIntent._id);
      onIntentComplete?.();
    } catch (error) {
      console.error("Failed to approve intent:", error);
    }
  }, [activeIntent, approveIntent, onIntentComplete]);

  /**
   * Handle intent cancellation
   */
  const handleCancel = useCallback(async () => {
    if (!activeIntent) return;

    await cancelIntent(activeIntent._id);

    Animated.spring(expandAnimation, {
      toValue: 0,
      useNativeDriver: false,
    }).start(() => {
      setIsExpanded(false);
    });
  }, [activeIntent, cancelIntent, expandAnimation]);

  /**
   * Handle clarification response
   */
  const handleClarify = useCallback(
    async (clarification: string) => {
      if (!activeIntent) return;
      await clarifyIntent(activeIntent._id, clarification);
    },
    [activeIntent, clarifyIntent]
  );

  /**
   * Close expanded view
   */
  const handleClose = useCallback(() => {
    Animated.spring(expandAnimation, {
      toValue: 0,
      useNativeDriver: false,
    }).start(() => {
      setIsExpanded(false);
    });
  }, [expandAnimation]);

  /**
   * Handle focus
   */
  const handleFocus = useCallback(() => {
    if (!isExpanded) {
      setShowSuggestions(true);
    }
  }, [isExpanded]);

  /**
   * Handle blur
   */
  const handleBlur = useCallback(() => {
    setTimeout(() => setShowSuggestions(false), 200);
  }, []);

  // Animated styles
  const containerHeight = expandAnimation.interpolate({
    inputRange: [0, 1],
    outputRange: [64, 320],
  });

  const previewOpacity = expandAnimation.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [0, 0, 1],
  });

  return (
    <View style={styles.wrapper}>
      {/* Listening Indicator */}
      {isListening && (
        <View style={styles.listeningIndicator}>
          <View style={styles.listeningBars}>
            {listeningBars.map((barHeight, i) => (
              <Animated.View
                key={i}
                style={[
                  styles.listeningBar,
                  { height: barHeight },
                ]}
              />
            ))}
          </View>
          <Text style={styles.listeningText}>Listening...</Text>
        </View>
      )}

      {/* Response Bubble */}
      {lastResponse && (
        <Animated.View
          style={[
            styles.responseBubble,
            {
              opacity: responseFadeAnim,
              transform: [
                {
                  translateY: responseFadeAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [10, 0],
                  }),
                },
              ],
            },
          ]}
        >
          <Ionicons name="sparkles" size={16} color="#8B5CF6" />
          <Text style={styles.responseText}>{lastResponse}</Text>
        </Animated.View>
      )}

      {/* Suggestions */}
      {showSuggestions && !isExpanded && (
        <Animated.View
          style={[
            styles.suggestionsContainer,
            { opacity: suggestionsFadeAnim },
          ]}
        >
          <Text style={styles.suggestionsLabel}>TRY SAYING</Text>
          {suggestions.map((suggestion, i) => (
            <TouchableOpacity
              key={i}
              onPress={() => handleSuggestionClick(suggestion)}
              style={styles.suggestionButton}
            >
              <Text style={styles.suggestionText}>"{suggestion}"</Text>
            </TouchableOpacity>
          ))}
        </Animated.View>
      )}

      {/* Main Command Bar */}
      <Animated.View style={[styles.container, { height: containerHeight }]}>
        {/* Input Row */}
        <View style={styles.inputRow}>
          {/* Camera Button */}
          <TouchableOpacity style={styles.iconButton}>
            <Ionicons name="camera-outline" size={22} color="#6B7280" />
          </TouchableOpacity>

          {/* Input Field */}
          <View style={styles.inputContainer}>
            <TextInput
              ref={inputRef}
              style={styles.input}
              value={inputText}
              onChangeText={setInputText}
              placeholder={placeholder}
              placeholderTextColor="#6B7280"
              onSubmitEditing={handleSubmit}
              onFocus={handleFocus}
              onBlur={handleBlur}
              returnKeyType="send"
              editable={!isProcessing}
            />
            {inputText.length > 0 && (
              <TouchableOpacity
                onPress={() => setInputText("")}
                style={styles.clearButton}
              >
                <Ionicons name="close" size={16} color="#6B7280" />
              </TouchableOpacity>
            )}
          </View>

          {/* Mic Button */}
          <TouchableOpacity
            style={[
              styles.iconButton,
              isListening && styles.iconButtonActive,
            ]}
            onPress={() => setIsListening(!isListening)}
          >
            <Ionicons
              name="mic"
              size={22}
              color={isListening ? "#FFFFFF" : "#6B7280"}
            />
          </TouchableOpacity>

          {/* Send Button */}
          <TouchableOpacity
            style={[
              styles.sendButton,
              (!inputText.trim() || isProcessing) && styles.sendButtonDisabled,
            ]}
            onPress={handleSubmit}
            disabled={!inputText.trim() || isProcessing}
          >
            {isProcessing ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <Ionicons name="send" size={18} color="#FFFFFF" />
            )}
          </TouchableOpacity>
        </View>

        {/* Expanded Preview/Status Area */}
        {isExpanded && (
          <Animated.View
            style={[styles.expandedArea, { opacity: previewOpacity }]}
          >
            {activeIntent ? (
              activeIntent.status === "executing" ||
              activeIntent.status === "completed" ||
              activeIntent.status === "failed" ? (
                <ExecutionStatus intent={activeIntent} onClose={handleClose} />
              ) : (
                <IntentPreview
                  intent={activeIntent}
                  isProcessing={isProcessing}
                  onApprove={handleApprove}
                  onCancel={handleCancel}
                  onClarify={handleClarify}
                />
              )
            ) : null}
          </Animated.View>
        )}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  container: {
    backgroundColor: "rgba(31, 41, 55, 0.95)",
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "rgba(139, 92, 246, 0.2)",
    overflow: "hidden",
    ...Platform.select({
      ios: {
        shadowColor: "#8B5CF6",
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.15,
        shadowRadius: 16,
      },
      android: {
        elevation: 8,
      },
    }),
  },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 6,
    paddingVertical: 6,
    height: 64,
    gap: 4,
  },
  iconButton: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  iconButtonActive: {
    backgroundColor: "#8B5CF6",
  },
  inputContainer: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    height: 44,
  },
  input: {
    flex: 1,
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "400",
  },
  clearButton: {
    padding: 6,
  },
  sendButton: {
    backgroundColor: "#8B5CF6",
    borderRadius: 14,
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  sendButtonDisabled: {
    opacity: 0.5,
  },
  expandedArea: {
    flex: 1,
    paddingHorizontal: 12,
    paddingBottom: 12,
  },
  // Suggestions
  suggestionsContainer: {
    backgroundColor: "rgba(31, 41, 55, 0.95)",
    borderRadius: 20,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.1)",
  },
  suggestionsLabel: {
    fontSize: 10,
    fontWeight: "600",
    color: "#6B7280",
    letterSpacing: 1.5,
    marginBottom: 8,
    marginLeft: 4,
  },
  suggestionButton: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
  },
  suggestionText: {
    color: "#9CA3AF",
    fontSize: 14,
  },
  // Response Bubble
  responseBubble: {
    flexDirection: "row",
    alignItems: "flex-start",
    backgroundColor: "rgba(31, 41, 55, 0.95)",
    borderRadius: 20,
    padding: 14,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: "rgba(139, 92, 246, 0.2)",
    gap: 10,
  },
  responseText: {
    flex: 1,
    color: "#FFFFFF",
    fontSize: 14,
    lineHeight: 20,
  },
  // Listening Indicator
  listeningIndicator: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
    gap: 10,
  },
  listeningBars: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 3,
  },
  listeningBar: {
    width: 4,
    backgroundColor: "#8B5CF6",
    borderRadius: 2,
  },
  listeningText: {
    color: "#8B5CF6",
    fontSize: 12,
    fontWeight: "500",
  },
});

export default CommandBar;
