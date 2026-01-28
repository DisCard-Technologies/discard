/**
 * DisCard 2035 - SuccessScreen Component
 *
 * Celebratory success screen for completed transfers:
 * - Confetti animation
 * - Haptic burst celebration
 * - Clean hero layout
 * - Subtle explorer link
 */

import { useEffect, useCallback, useState } from "react";
import { StyleSheet, View, Linking, Dimensions, Text, TextInput } from "react-native";
import { PressableScale, PressableOpacity } from "pressto";
import { Ionicons } from "@expo/vector-icons";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  withSequence,
  withDelay,
  withSpring,
  withRepeat,
  Easing,
  FadeIn,
  FadeInUp,
  FadeInDown,
} from "react-native-reanimated";
import * as Haptics from "expo-haptics";

import { useThemeColor } from "@/hooks/use-theme-color";
import { formatAddress } from "@/lib/transfer/address-resolver";
import { ContactsStorage } from "@/lib/contacts-storage";
import type { TransferResult, TransferRecipient } from "@/hooks/useTransfer";

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get("window");

// Confetti colors
const CONFETTI_COLORS = [
  "#FFD700", // Gold
  "#FF6B6B", // Coral
  "#4ECDC4", // Teal
  "#45B7D1", // Sky blue
  "#96E6A1", // Mint
  "#DDA0DD", // Plum
  "#FF9F43", // Orange
];

// ============================================================================
// Types
// ============================================================================

export interface SuccessScreenProps {
  /** Transfer result */
  result: TransferResult;
  /** Recipient information */
  recipient: TransferRecipient;
  /** Amount sent (display) */
  amountDisplay: string;
  /** Amount in USD */
  amountUsd: number;
  /** Token symbol */
  tokenSymbol: string;
  /** Fees paid */
  feesPaid: number;
  /** Callback when done is pressed */
  onDone: () => void;
  /** Auto dismiss after delay (ms), 0 to disable */
  autoDismissMs?: number;
  /** Whether the recipient is a new (not saved) contact */
  isNewRecipient?: boolean;
}

// ============================================================================
// Confetti Particle Component
// ============================================================================

interface ConfettiParticleProps {
  index: number;
  color: string;
}

function ConfettiParticle({ index, color }: ConfettiParticleProps) {
  const translateY = useSharedValue(-50);
  const translateX = useSharedValue(0);
  const rotate = useSharedValue(0);
  const opacity = useSharedValue(1);
  const scale = useSharedValue(1);

  // Random starting position and physics
  const startX = Math.random() * SCREEN_WIDTH - SCREEN_WIDTH / 2;
  const endX = startX + (Math.random() - 0.5) * 200;
  const duration = 2000 + Math.random() * 1000;
  const delay = index * 30;
  const size = 8 + Math.random() * 8;

  useEffect(() => {
    translateY.value = withDelay(
      delay,
      withTiming(SCREEN_HEIGHT * 0.8, { duration, easing: Easing.out(Easing.quad) })
    );
    translateX.value = withDelay(
      delay,
      withTiming(endX, { duration, easing: Easing.out(Easing.quad) })
    );
    rotate.value = withDelay(
      delay,
      withRepeat(withTiming(360, { duration: 1000 }), -1, false)
    );
    opacity.value = withDelay(
      delay + duration * 0.6,
      withTiming(0, { duration: duration * 0.4 })
    );
    scale.value = withDelay(
      delay,
      withSequence(
        withSpring(1.2, { damping: 8 }),
        withTiming(0.8, { duration: duration * 0.8 })
      )
    );
  }, []);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { rotate: `${rotate.value}deg` },
      { scale: scale.value },
    ],
    opacity: opacity.value,
  }));

  return (
    <Animated.View
      style={[
        styles.confettiParticle,
        {
          left: SCREEN_WIDTH / 2 + startX,
          width: size,
          height: size * 0.6,
          backgroundColor: color,
          borderRadius: size / 4,
        },
        animatedStyle,
      ]}
    />
  );
}

// ============================================================================
// Confetti Burst Component
// ============================================================================

function ConfettiBurst() {
  const particles = Array.from({ length: 50 }, (_, i) => ({
    id: i,
    color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
  }));

  return (
    <View style={styles.confettiContainer} pointerEvents="none">
      {particles.map((particle) => (
        <ConfettiParticle key={particle.id} index={particle.id} color={particle.color} />
      ))}
    </View>
  );
}

// ============================================================================
// Haptic Celebration Sequence
// ============================================================================

async function triggerCelebrationHaptics() {
  // Initial success notification
  await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

  // Burst sequence for extra celebration
  await new Promise(resolve => setTimeout(resolve, 100));
  await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  await new Promise(resolve => setTimeout(resolve, 80));
  await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  await new Promise(resolve => setTimeout(resolve, 80));
  await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
}

// ============================================================================
// Animated Checkmark Component
// ============================================================================

function AnimatedCheckmark() {
  const scale = useSharedValue(0);
  const opacity = useSharedValue(0);
  const rotation = useSharedValue(-30);
  const ringScale = useSharedValue(0.8);
  const ringOpacity = useSharedValue(0);

  const successColor = useThemeColor({ light: "#4CAF50", dark: "#66BB6A" }, "text");
  const bgColor = useThemeColor(
    { light: "rgba(76, 175, 80, 0.15)", dark: "rgba(102, 187, 106, 0.2)" },
    "background"
  );

  useEffect(() => {
    // Trigger celebration haptics
    triggerCelebrationHaptics();

    // Animate checkmark with more bounce
    opacity.value = withTiming(1, { duration: 150 });
    scale.value = withSequence(
      withTiming(1.3, { duration: 250, easing: Easing.out(Easing.back(3)) }),
      withSpring(1, { damping: 8, stiffness: 150 })
    );
    rotation.value = withSpring(0, { damping: 12, stiffness: 100 });

    // Animate ring burst
    ringOpacity.value = withSequence(
      withTiming(0.6, { duration: 200 }),
      withDelay(300, withTiming(0, { duration: 400 }))
    );
    ringScale.value = withTiming(2, { duration: 600, easing: Easing.out(Easing.quad) });
  }, []);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { scale: scale.value },
      { rotate: `${rotation.value}deg` },
    ],
    opacity: opacity.value,
  }));

  const ringStyle = useAnimatedStyle(() => ({
    transform: [{ scale: ringScale.value }],
    opacity: ringOpacity.value,
  }));

  return (
    <View style={styles.checkmarkWrapper}>
      {/* Expanding ring effect */}
      <Animated.View
        style={[
          styles.checkmarkRing,
          { borderColor: successColor },
          ringStyle,
        ]}
      />
      {/* Main checkmark */}
      <Animated.View
        style={[
          styles.checkmarkContainer,
          { backgroundColor: bgColor },
          animatedStyle,
        ]}
      >
        <Ionicons name="checkmark" size={56} color={successColor} />
      </Animated.View>
    </View>
  );
}

// ============================================================================
// Main Component
// ============================================================================

export function SuccessScreen({
  result,
  recipient,
  amountDisplay,
  amountUsd,
  tokenSymbol,
  feesPaid,
  onDone,
  autoDismissMs = 0,
  isNewRecipient = false,
}: SuccessScreenProps) {
  const primaryColor = useThemeColor({}, "tint");
  const mutedColor = useThemeColor({ light: "#687076", dark: "#9BA1A6" }, "icon");
  const textColor = useThemeColor({}, "text");
  const successColor = useThemeColor({ light: "#4CAF50", dark: "#66BB6A" }, "text");
  const cardBg = useThemeColor(
    { light: "rgba(0,0,0,0.03)", dark: "rgba(255,255,255,0.06)" },
    "background"
  );
  const inputBg = useThemeColor({ light: "#ffffff", dark: "#1c1c1e" }, "background");

  // Save contact state
  const [showSaveExpanded, setShowSaveExpanded] = useState(false);
  const [contactName, setContactName] = useState(recipient.displayName || "");
  const [isSaving, setIsSaving] = useState(false);
  const [contactSaved, setContactSaved] = useState(false);

  // Auto dismiss
  useEffect(() => {
    if (autoDismissMs > 0) {
      const timer = setTimeout(onDone, autoDismissMs);
      return () => clearTimeout(timer);
    }
  }, [autoDismissMs, onDone]);

  // Open Solscan
  const handleViewOnSolscan = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    Linking.openURL(result.explorerUrl);
  }, [result.explorerUrl]);

  // Handle done with haptic
  const handleDone = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onDone();
  }, [onDone]);

  // Save contact handler
  const handleSaveContact = useCallback(async () => {
    if (!contactName.trim() || !recipient.address) return;

    setIsSaving(true);
    try {
      await ContactsStorage.create({
        name: contactName.trim(),
        identifier: recipient.input || recipient.address,
        identifierType: recipient.type === "sol_name" ? "sol_name" : "address",
        resolvedAddress: recipient.address,
        verified: false,
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setContactSaved(true);
      // Collapse after brief delay to show checkmark
      setTimeout(() => {
        setShowSaveExpanded(false);
      }, 1500);
    } catch (err) {
      console.error("[SuccessScreen] Failed to save contact:", err);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setIsSaving(false);
    }
  }, [contactName, recipient]);

  // Format recipient display
  const recipientDisplay =
    recipient.displayName || formatAddress(recipient.address, 6);

  return (
    <View style={styles.container}>
      {/* Confetti Burst */}
      <ConfettiBurst />

      {/* Main Content */}
      <View style={styles.content}>
        {/* Animated Checkmark */}
        <AnimatedCheckmark />

        {/* Success Title */}
        <Animated.View entering={FadeIn.delay(200).duration(300)}>
          <Text style={[styles.title, { color: textColor }]}>Sent!</Text>
        </Animated.View>

        {/* Amount Display */}
        <Animated.View
          entering={FadeInUp.delay(300).duration(300)}
          style={styles.amountContainer}
        >
          <Text style={[styles.amountText, { color: textColor }]}>
            ${amountUsd.toFixed(2)}
          </Text>
        </Animated.View>

        {/* Arrow */}
        <Animated.View entering={FadeIn.delay(350).duration(200)}>
          <View style={styles.arrowContainer}>
            <Ionicons name="arrow-down" size={24} color={mutedColor} />
          </View>
        </Animated.View>

        {/* Recipient */}
        <Animated.View
          entering={FadeInUp.delay(400).duration(300)}
          style={styles.recipientContainer}
        >
          <View style={[styles.recipientAvatar, { backgroundColor: primaryColor }]}>
            <Ionicons name="person" size={28} color="#fff" />
          </View>
          <Text style={[styles.recipientName, { color: textColor }]} numberOfLines={1}>
            {recipientDisplay}
          </Text>
        </Animated.View>

        {/* Fast confirmation indicator */}
        {result.withinTarget && (
          <Animated.View
            entering={FadeIn.delay(500).duration(300)}
            style={[styles.fastBadge, { backgroundColor: `${successColor}15` }]}
          >
            <Ionicons name="flash" size={14} color={successColor} />
            <Text style={[styles.fastBadgeText, { color: successColor }]}>
              Instant
            </Text>
          </Animated.View>
        )}

        {/* Save Contact Prompt */}
        {isNewRecipient && !contactSaved && (
          <Animated.View
            entering={FadeInUp.delay(600).duration(300)}
            style={[styles.saveContactCard, { backgroundColor: cardBg }]}
          >
            {!showSaveExpanded ? (
              // Collapsed state
              <PressableScale
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setShowSaveExpanded(true);
                }}
                style={styles.saveContactCollapsed}
              >
                <Ionicons name="person-add-outline" size={20} color={primaryColor} />
                <Text style={[styles.saveContactText, { color: textColor }]}>
                  Save as contact?
                </Text>
                <View style={[styles.addBadge, { backgroundColor: primaryColor }]}>
                  <Text style={styles.addBadgeText}>Add</Text>
                </View>
              </PressableScale>
            ) : (
              // Expanded state
              <View style={styles.saveContactExpanded}>
                <Text style={[styles.saveContactLabel, { color: mutedColor }]}>
                  Contact name
                </Text>
                <TextInput
                  value={contactName}
                  onChangeText={setContactName}
                  placeholder="Enter name"
                  placeholderTextColor={mutedColor}
                  style={[
                    styles.nameInput,
                    { backgroundColor: inputBg, color: textColor },
                  ]}
                  autoFocus
                  autoCapitalize="words"
                  returnKeyType="done"
                  onSubmitEditing={handleSaveContact}
                />
                <View style={styles.saveContactActions}>
                  <PressableScale
                    onPress={() => {
                      setShowSaveExpanded(false);
                      setContactName(recipient.displayName || "");
                    }}
                    style={styles.cancelButton}
                  >
                    <Text style={[styles.cancelButtonText, { color: mutedColor }]}>
                      Cancel
                    </Text>
                  </PressableScale>
                  <PressableScale
                    onPress={handleSaveContact}
                    enabled={!isSaving && contactName.trim().length > 0}
                    style={[
                      styles.saveButton,
                      { backgroundColor: primaryColor },
                      (!contactName.trim() || isSaving) && styles.saveButtonDisabled,
                    ]}
                  >
                    <Text style={styles.saveButtonText}>
                      {isSaving ? "Saving..." : "Save"}
                    </Text>
                  </PressableScale>
                </View>
              </View>
            )}
          </Animated.View>
        )}

        {/* Contact Saved Confirmation */}
        {contactSaved && (
          <Animated.View
            entering={FadeIn.duration(200)}
            style={[styles.savedConfirmation, { backgroundColor: `${successColor}15` }]}
          >
            <Ionicons name="checkmark-circle" size={20} color={successColor} />
            <Text style={[styles.savedText, { color: successColor }]}>
              Contact saved
            </Text>
          </Animated.View>
        )}
      </View>

      {/* Bottom Actions */}
      <Animated.View
        entering={FadeInDown.delay(600).duration(300)}
        style={styles.bottomActions}
      >
        {/* View Details Link */}
        <PressableOpacity
          onPress={handleViewOnSolscan}
          style={styles.detailsLink}
        >
          <Ionicons name="open-outline" size={16} color={mutedColor} />
          <Text style={[styles.detailsLinkText, { color: mutedColor }]}>
            View on Explorer
          </Text>
        </PressableOpacity>

        {/* Done Button */}
        <PressableScale
          onPress={handleDone}
          style={[
            styles.doneButton,
            { backgroundColor: primaryColor },
          ]}
        >
          <Text style={styles.doneButtonText}>Done</Text>
        </PressableScale>
      </Animated.View>
    </View>
  );
}

// ============================================================================
// Styles
// ============================================================================

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  confettiContainer: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 10,
  },
  confettiParticle: {
    position: "absolute",
    top: 0,
  },
  content: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
  },
  checkmarkWrapper: {
    width: 120,
    height: 120,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  checkmarkRing: {
    position: "absolute",
    width: 110,
    height: 110,
    borderRadius: 55,
    borderWidth: 3,
  },
  checkmarkContainer: {
    width: 110,
    height: 110,
    borderRadius: 55,
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    fontSize: 32,
    fontWeight: "700",
    textAlign: "center",
    marginBottom: 8,
  },
  amountContainer: {
    alignItems: "center",
    marginBottom: 16,
  },
  amountText: {
    fontSize: 44,
    fontWeight: "700",
  },
  arrowContainer: {
    marginVertical: 12,
    opacity: 0.5,
  },
  recipientContainer: {
    alignItems: "center",
    gap: 12,
  },
  recipientAvatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
  },
  recipientName: {
    fontSize: 20,
    fontWeight: "600",
    textAlign: "center",
    maxWidth: "80%",
  },
  fastBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    marginTop: 24,
  },
  fastBadgeText: {
    fontSize: 14,
    fontWeight: "600",
  },
  bottomActions: {
    paddingHorizontal: 24,
    paddingBottom: 40,
    gap: 16,
  },
  detailsLink: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 12,
  },
  detailsLinkText: {
    fontSize: 14,
    fontWeight: "500",
  },
  doneButton: {
    width: "100%",
    paddingVertical: 18,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  doneButtonText: {
    color: "#fff",
    fontSize: 17,
    fontWeight: "600",
  },
  // Save Contact Styles
  saveContactCard: {
    marginTop: 24,
    borderRadius: 16,
    overflow: "hidden",
    width: "100%",
  },
  saveContactCollapsed: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 12,
  },
  saveContactText: {
    flex: 1,
    fontSize: 15,
    fontWeight: "500",
  },
  addBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  addBadgeText: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "600",
  },
  saveContactExpanded: {
    padding: 16,
    gap: 12,
  },
  saveContactLabel: {
    fontSize: 12,
    fontWeight: "500",
    marginBottom: -4,
  },
  nameInput: {
    fontSize: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 10,
  },
  saveContactActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 12,
    marginTop: 4,
  },
  cancelButton: {
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  cancelButtonText: {
    fontSize: 15,
    fontWeight: "500",
  },
  saveButton: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 10,
  },
  saveButtonDisabled: {
    opacity: 0.5,
  },
  saveButtonText: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "600",
  },
  savedConfirmation: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
    marginTop: 24,
  },
  savedText: {
    fontSize: 14,
    fontWeight: "600",
  },
});

export default SuccessScreen;
