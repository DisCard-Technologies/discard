/**
 * DisCard 2035 - Toast/Snackbar Component
 *
 * Reusable toast component with:
 * - Slide-up animation from bottom
 * - Auto-dismiss after configurable duration
 * - Optional UNDO action button
 * - Uses react-native-reanimated for smooth animations
 */

import { useEffect, useCallback } from "react";
import { StyleSheet, View, Text } from "react-native";
import { PressableScale } from "pressto";
import { Ionicons } from "@expo/vector-icons";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSpring,
  runOnJS,
  Easing,
} from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import { useSafeAreaInsets } from "react-native-safe-area-context";

// ============================================================================
// Types
// ============================================================================

export interface ToastProps {
  /** Whether the toast is visible */
  visible: boolean;
  /** Message to display */
  message: string;
  /** Optional action button label (e.g., "UNDO") */
  actionLabel?: string;
  /** Callback when action button is pressed */
  onAction?: () => void;
  /** Callback when toast is dismissed (auto or manual) */
  onDismiss: () => void;
  /** Auto-dismiss duration in ms (default: 4000) */
  duration?: number;
  /** Toast type for styling */
  type?: "default" | "success" | "error" | "warning";
  /** Icon name (Ionicons) */
  icon?: keyof typeof Ionicons.glyphMap;
}

// ============================================================================
// Constants
// ============================================================================

const ANIMATION_DURATION = 250;
const TOAST_HEIGHT = 56;

// ============================================================================
// Component
// ============================================================================

export function Toast({
  visible,
  message,
  actionLabel,
  onAction,
  onDismiss,
  duration = 4000,
  type = "default",
  icon,
}: ToastProps) {
  const insets = useSafeAreaInsets();
  const translateY = useSharedValue(100);
  const opacity = useSharedValue(0);

  // Get colors based on type
  const getColors = () => {
    switch (type) {
      case "success":
        return { bg: "#1B5E20", text: "#fff", accent: "#81C784" };
      case "error":
        return { bg: "#B71C1C", text: "#fff", accent: "#EF5350" };
      case "warning":
        return { bg: "#E65100", text: "#fff", accent: "#FFB74D" };
      default:
        return { bg: "#323232", text: "#fff", accent: "#10B981" };
    }
  };

  const colors = getColors();

  // Handle auto-dismiss
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;

    if (visible) {
      // Animate in
      translateY.value = withSpring(0, { damping: 15, stiffness: 150 });
      opacity.value = withTiming(1, { duration: ANIMATION_DURATION });

      // Set auto-dismiss timer
      if (duration > 0) {
        timer = setTimeout(() => {
          handleDismiss();
        }, duration);
      }
    } else {
      // Animate out
      translateY.value = withTiming(100, {
        duration: ANIMATION_DURATION,
        easing: Easing.inOut(Easing.ease),
      });
      opacity.value = withTiming(0, { duration: ANIMATION_DURATION });
    }

    return () => {
      if (timer) clearTimeout(timer);
    };
  }, [visible, duration]);

  const handleDismiss = useCallback(() => {
    translateY.value = withTiming(
      100,
      { duration: ANIMATION_DURATION, easing: Easing.inOut(Easing.ease) },
      () => {
        runOnJS(onDismiss)();
      }
    );
    opacity.value = withTiming(0, { duration: ANIMATION_DURATION });
  }, [onDismiss]);

  const handleAction = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onAction?.();
    handleDismiss();
  }, [onAction, handleDismiss]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
    opacity: opacity.value,
  }));

  if (!visible && opacity.value === 0) {
    return null;
  }

  return (
    <Animated.View
      style={[
        styles.container,
        { bottom: insets.bottom + 16 },
        animatedStyle,
      ]}
      pointerEvents={visible ? "auto" : "none"}
    >
      <View style={[styles.toast, { backgroundColor: colors.bg }]}>
        {/* Icon */}
        {icon && (
          <Ionicons
            name={icon}
            size={20}
            color={colors.text}
            style={styles.icon}
          />
        )}

        {/* Message */}
        <Text style={[styles.message, { color: colors.text }]} numberOfLines={2}>
          {message}
        </Text>

        {/* Action Button */}
        {actionLabel && onAction && (
          <PressableScale onPress={handleAction} style={styles.actionButton}>
            <Text style={[styles.actionLabel, { color: colors.accent }]}>
              {actionLabel}
            </Text>
          </PressableScale>
        )}

        {/* Close Button */}
        <PressableScale onPress={handleDismiss} style={styles.closeButton}>
          <Ionicons name="close" size={18} color={colors.text} />
        </PressableScale>
      </View>
    </Animated.View>
  );
}

// ============================================================================
// Styles
// ============================================================================

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    left: 16,
    right: 16,
    zIndex: 1000,
  },
  toast: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: TOAST_HEIGHT,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  icon: {
    marginRight: 12,
  },
  message: {
    flex: 1,
    fontSize: 14,
    fontWeight: "500",
    lineHeight: 20,
  },
  actionButton: {
    marginLeft: 12,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  actionLabel: {
    fontSize: 14,
    fontWeight: "700",
    letterSpacing: 0.5,
  },
  closeButton: {
    marginLeft: 8,
    padding: 4,
  },
});

export default Toast;
