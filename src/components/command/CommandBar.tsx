/**
 * CommandBar Component
 *
 * Natural language input for Intent-Centric AI Middleware.
 * Allows users to express financial intents in plain English.
 *
 * Examples:
 * - "Fund my Netflix card with $50"
 * - "Move $100 from Aave to my shopping card"
 * - "Send $20 to mom's wallet"
 */
import React, { useState, useCallback, useRef } from "react";
import {
  View,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Animated,
  Keyboard,
  Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useIntents } from "../../hooks/useIntents";
import { IntentPreview } from "./IntentPreview";
import { ExecutionStatus } from "./ExecutionStatus";
import type { Id } from "../../../convex/_generated/dataModel";

interface CommandBarProps {
  userId: Id<"users">;
  onIntentComplete?: () => void;
  placeholder?: string;
}

export function CommandBar({
  userId,
  onIntentComplete,
  placeholder = "What would you like to do?",
}: CommandBarProps) {
  const [inputText, setInputText] = useState("");
  const [isExpanded, setIsExpanded] = useState(false);
  const inputRef = useRef<TextInput>(null);
  const expandAnimation = useRef(new Animated.Value(0)).current;

  const {
    activeIntent,
    isProcessing,
    submitIntent,
    clarifyIntent,
    approveIntent,
    cancelIntent,
  } = useIntents(userId);

  /**
   * Handle intent submission
   */
  const handleSubmit = useCallback(async () => {
    if (!inputText.trim() || isProcessing) return;

    Keyboard.dismiss();
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
  }, [inputText, isProcessing, submitIntent, expandAnimation]);

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

  // Animated styles
  const containerHeight = expandAnimation.interpolate({
    inputRange: [0, 1],
    outputRange: [60, 300],
  });

  const previewOpacity = expandAnimation.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [0, 0, 1],
  });

  return (
    <Animated.View style={[styles.container, { height: containerHeight }]}>
      {/* Input Row */}
      <View style={styles.inputRow}>
        <View style={styles.inputContainer}>
          <Ionicons
            name="sparkles"
            size={20}
            color="#8B5CF6"
            style={styles.inputIcon}
          />
          <TextInput
            ref={inputRef}
            style={styles.input}
            value={inputText}
            onChangeText={setInputText}
            placeholder={placeholder}
            placeholderTextColor="#6B7280"
            onSubmitEditing={handleSubmit}
            returnKeyType="send"
            editable={!isProcessing}
          />
          {inputText.length > 0 && (
            <TouchableOpacity
              onPress={() => setInputText("")}
              style={styles.clearButton}
            >
              <Ionicons name="close-circle" size={18} color="#6B7280" />
            </TouchableOpacity>
          )}
        </View>

        <TouchableOpacity
          style={[
            styles.submitButton,
            (!inputText.trim() || isProcessing) && styles.submitButtonDisabled,
          ]}
          onPress={handleSubmit}
          disabled={!inputText.trim() || isProcessing}
        >
          {isProcessing ? (
            <Ionicons name="hourglass" size={20} color="#FFFFFF" />
          ) : (
            <Ionicons name="arrow-forward" size={20} color="#FFFFFF" />
          )}
        </TouchableOpacity>
      </View>

      {/* Expanded Preview/Status Area */}
      {isExpanded && (
        <Animated.View style={[styles.expandedArea, { opacity: previewOpacity }]}>
          {activeIntent ? (
            activeIntent.status === "executing" ||
            activeIntent.status === "completed" ||
            activeIntent.status === "failed" ? (
              <ExecutionStatus
                intent={activeIntent}
                onClose={handleClose}
              />
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
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: "#1F2937",
    borderRadius: 16,
    marginHorizontal: 16,
    marginVertical: 8,
    overflow: "hidden",
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
      },
      android: {
        elevation: 8,
      },
    }),
  },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 8,
    height: 60,
  },
  inputContainer: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#374151",
    borderRadius: 12,
    paddingHorizontal: 12,
    marginRight: 8,
    height: 44,
  },
  inputIcon: {
    marginRight: 8,
  },
  input: {
    flex: 1,
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "500",
  },
  clearButton: {
    padding: 4,
  },
  submitButton: {
    backgroundColor: "#8B5CF6",
    borderRadius: 12,
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  submitButtonDisabled: {
    backgroundColor: "#4B5563",
  },
  expandedArea: {
    flex: 1,
    paddingHorizontal: 12,
    paddingBottom: 12,
  },
});

export default CommandBar;
