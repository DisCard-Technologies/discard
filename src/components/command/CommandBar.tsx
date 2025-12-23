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
  Animated,
  Keyboard,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Mic, Send, Sparkles, Camera, X, Loader2 } from "lucide-react-native";
import { useIntents } from "../../hooks/useIntents";
import { IntentPreview } from "./IntentPreview";
import { ExecutionStatus } from "./ExecutionStatus";
import type { Id } from "../../../convex/_generated/dataModel";

interface CommandBarProps {
  userId?: Id<"users">;
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
  const insets = useSafeAreaInsets();
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
  } = useIntents(userId ?? null);

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
  const handleSuggestionClick = useCallback((text: string) => {
    setInputText(text);
    setShowSuggestions(false);
    inputRef.current?.focus();
  }, []);

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
    outputRange: [56, 320],
  });

  const previewOpacity = expandAnimation.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [0, 0, 1],
  });

  // Calculate NavBar height: ~56px base + safe area bottom
  const navBarHeight = 56 + Math.max(insets.bottom, 16);

  return (
    <View className="px-4 pt-2" style={{ marginBottom: navBarHeight }}>
      {/* Listening Indicator */}
      {isListening && (
        <View className="flex-row items-center justify-center mb-3 gap-2.5">
          <View className="flex-row items-end gap-0.5">
            {listeningBars.map((barHeight, i) => (
              <Animated.View
                key={i}
                className="w-1 bg-primary rounded-full"
                style={{ height: barHeight }}
              />
            ))}
          </View>
          <Text className="text-primary text-xs font-medium">Listening...</Text>
        </View>
      )}

      {/* Response Bubble */}
      {lastResponse && (
        <Animated.View
          className="bg-secondary/95 rounded-2xl p-3.5 mb-2 border border-primary/20 flex-row items-start gap-2.5"
          style={{
            opacity: responseFadeAnim,
            transform: [
              {
                translateY: responseFadeAnim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [10, 0],
                }),
              },
            ],
          }}
        >
          <Sparkles size={16} color="#10B981" />
          <Text className="flex-1 text-foreground text-sm leading-5">
            {lastResponse}
          </Text>
        </Animated.View>
      )}

      {/* Suggestions */}
      {showSuggestions && !isExpanded && (
        <Animated.View
          className="bg-secondary/95 rounded-2xl p-2 mb-2 border border-white/10"
          style={{ opacity: suggestionsFadeAnim }}
        >
          <Text className="text-[10px] text-muted-foreground uppercase tracking-widest px-2 mb-2">
            Try saying
          </Text>
          {suggestions.map((suggestion, i) => (
            <TouchableOpacity
              key={i}
              onPress={() => handleSuggestionClick(suggestion)}
              className="px-3 py-2.5 rounded-xl active:bg-secondary/50"
            >
              <Text className="text-muted-foreground text-sm">
                "{suggestion}"
              </Text>
            </TouchableOpacity>
          ))}
        </Animated.View>
      )}

      {/* Main Command Bar */}
      <Animated.View
        className="bg-secondary/60 rounded-2xl border border-white/10 overflow-hidden shadow-lg"
        style={{ height: containerHeight }}
      >
        {/* Input Row */}
        <View className="flex-row items-center px-1.5 py-1.5 h-14 gap-1.5">
          {/* Camera Button */}
          <TouchableOpacity className="w-10 h-10 rounded-xl items-center justify-center active:bg-secondary/50">
            <Camera size={20} color="#6B7280" />
          </TouchableOpacity>

          {/* Input Field */}
          <View className="flex-1 flex-row items-center px-2 h-11">
            <TextInput
              ref={inputRef}
              className="flex-1 text-foreground text-sm"
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
                className="p-1.5"
              >
                <X size={16} color="#6B7280" />
              </TouchableOpacity>
            )}
          </View>

          {/* Mic Button */}
          <TouchableOpacity
            className={`w-10 h-10 rounded-xl items-center justify-center ${
              isListening ? "bg-primary" : "active:bg-secondary/50"
            }`}
            onPress={() => setIsListening(!isListening)}
          >
            <Mic size={20} color={isListening ? "#FFFFFF" : "#6B7280"} />
          </TouchableOpacity>

          {/* Send Button */}
          <TouchableOpacity
            className={`w-10 h-10 rounded-xl bg-primary items-center justify-center ml-1 ${
              !inputText.trim() || isProcessing ? "opacity-50" : "active:opacity-90"
            }`}
            onPress={handleSubmit}
            disabled={!inputText.trim() || isProcessing}
          >
            {isProcessing ? (
              <Loader2 size={18} color="#FFFFFF" />
            ) : (
              <Send size={18} color="#FFFFFF" />
            )}
          </TouchableOpacity>
        </View>

        {/* Expanded Preview/Status Area */}
        {isExpanded && (
          <Animated.View
            className="flex-1 px-3 pb-3"
            style={{ opacity: previewOpacity }}
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

export default CommandBar;
