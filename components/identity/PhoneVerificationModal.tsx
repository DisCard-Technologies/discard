/**
 * DisCard 2035 - PhoneVerificationModal Component
 *
 * Two-step phone verification modal:
 * 1. Phone number input with country code
 * 2. 6-digit OTP input with countdown timer
 */

import { useState, useRef, useEffect } from "react";
import {
  StyleSheet,
  View,
  Modal,
  Pressable,
  TextInput,
  ActivityIndicator,
  KeyboardAvoidingView,
  ScrollView,
  Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Animated, { FadeIn, SlideInDown, FadeInUp } from "react-native-reanimated";

import { ThemedText } from "@/components/themed-text";
import { useThemeColor } from "@/hooks/use-theme-color";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { usePhoneVerification } from "@/hooks/usePhoneVerification";

// ============================================================================
// Types
// ============================================================================

export interface PhoneVerificationModalProps {
  visible: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

// ============================================================================
// Main Component
// ============================================================================

export function PhoneVerificationModal({
  visible,
  onClose,
  onSuccess,
}: PhoneVerificationModalProps) {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";

  const primaryColor = useThemeColor({}, "tint");
  const mutedColor = useThemeColor({ light: "#687076", dark: "#9BA1A6" }, "icon");
  const textColor = useThemeColor({}, "text");
  const bgColor = useThemeColor({ light: "#fff", dark: "#1c1c1e" }, "background");
  const cardBg = useThemeColor({ light: "#f8f9fa", dark: "#2c2c2e" }, "background");
  const errorColor = useThemeColor({ light: "#F44336", dark: "#EF5350" }, "text");
  const successColor = "#4CAF50";

  // Phone verification hook
  const {
    step,
    phoneNumber,
    isLoading,
    error,
    countdown,
    canResend,
    setPhoneNumber,
    requestVerification,
    verifyCode,
    resendCode,
    reset,
  } = usePhoneVerification();

  // OTP input state - 6 separate inputs for better UX
  const [otpDigits, setOtpDigits] = useState(["", "", "", "", "", ""]);
  const otpRefs = useRef<(TextInput | null)[]>([]);

  // Reset state when modal opens/closes
  useEffect(() => {
    if (!visible) {
      reset();
      setOtpDigits(["", "", "", "", "", ""]);
    }
  }, [visible, reset]);

  // Auto-focus first OTP input when entering verify step
  useEffect(() => {
    if (step === "verify") {
      setTimeout(() => {
        otpRefs.current[0]?.focus();
      }, 300);
    }
  }, [step]);

  // Handle success
  useEffect(() => {
    if (step === "success") {
      setTimeout(() => {
        onSuccess?.();
        onClose();
      }, 1500);
    }
  }, [step, onSuccess, onClose]);

  // Handle close
  const handleClose = () => {
    reset();
    setOtpDigits(["", "", "", "", "", ""]);
    onClose();
  };

  // Handle OTP digit change
  const handleOtpChange = (index: number, value: string) => {
    // Only allow digits
    const digit = value.replace(/\D/g, "").slice(-1);

    const newDigits = [...otpDigits];
    newDigits[index] = digit;
    setOtpDigits(newDigits);

    // Auto-advance to next input
    if (digit && index < 5) {
      otpRefs.current[index + 1]?.focus();
    }

    // Auto-submit when all digits entered
    if (digit && index === 5) {
      const code = newDigits.join("");
      if (code.length === 6) {
        verifyCode(code);
      }
    }
  };

  // Handle OTP backspace
  const handleOtpKeyPress = (index: number, key: string) => {
    if (key === "Backspace" && !otpDigits[index] && index > 0) {
      // Move to previous input on backspace of empty field
      otpRefs.current[index - 1]?.focus();
      const newDigits = [...otpDigits];
      newDigits[index - 1] = "";
      setOtpDigits(newDigits);
    }
  };

  // Format countdown
  const formatCountdown = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={handleClose}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={styles.overlay}
        keyboardVerticalOffset={Platform.OS === "ios" ? 10 : 0}
      >
        <Pressable style={styles.backdrop} onPress={handleClose} />

        <Animated.View
          entering={FadeIn.duration(200)}
          style={[styles.modal, { backgroundColor: bgColor }]}
        >
          <ScrollView
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            bounces={false}
          >
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.headerContent}>
              <View style={[styles.headerIcon, { backgroundColor: `${primaryColor}15` }]}>
                <Ionicons name="call" size={24} color={primaryColor} />
              </View>
              <View>
                <ThemedText style={styles.title}>
                  {step === "input" && "Add Phone Number"}
                  {step === "verify" && "Enter Code"}
                  {step === "success" && "Verified!"}
                </ThemedText>
                <ThemedText style={[styles.subtitle, { color: mutedColor }]}>
                  {step === "input" && "For P2P transfers and discovery"}
                  {step === "verify" && `Sent to ${phoneNumber}`}
                  {step === "success" && "Your phone is now linked"}
                </ThemedText>
              </View>
            </View>
            <Pressable
              onPress={handleClose}
              style={({ pressed }) => [styles.closeButton, pressed && styles.pressed]}
            >
              <Ionicons name="close" size={24} color={mutedColor} />
            </Pressable>
          </View>

          {/* Step 1: Phone Input */}
          {step === "input" && (
            <Animated.View entering={FadeIn.duration(200)}>
              <View style={styles.inputSection}>
                <ThemedText style={[styles.inputLabel, { color: mutedColor }]}>
                  Phone Number
                </ThemedText>
                <View
                  style={[
                    styles.phoneInputContainer,
                    {
                      backgroundColor: cardBg,
                      borderColor: error ? errorColor : isDark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.1)",
                    },
                  ]}
                >
                  <ThemedText style={[styles.countryCode, { color: isDark ? "#fff" : "#000" }]}>+1</ThemedText>
                  <TextInput
                    value={phoneNumber.replace("+1", "")}
                    onChangeText={(text) => setPhoneNumber("+1" + text.replace(/\D/g, ""))}
                    placeholder="(555) 123-4567"
                    placeholderTextColor={mutedColor}
                    keyboardType="phone-pad"
                    style={[styles.phoneInput, { color: isDark ? "#fff" : "#000" }]}
                    maxLength={14}
                    autoFocus
                  />
                </View>
                <ThemedText style={[styles.hint, { color: mutedColor }]}>
                  We'll send a 6-digit code to verify your number
                </ThemedText>
              </View>

              {/* Error Message */}
              {error && (
                <Animated.View entering={FadeIn} style={styles.errorContainer}>
                  <Ionicons name="alert-circle" size={16} color={errorColor} />
                  <ThemedText style={[styles.errorText, { color: errorColor }]}>
                    {error}
                  </ThemedText>
                </Animated.View>
              )}

              {/* Send Code Button */}
              <Pressable
                onPress={requestVerification}
                disabled={isLoading || phoneNumber.length < 11}
                style={({ pressed }) => [
                  styles.primaryButton,
                  { backgroundColor: primaryColor },
                  pressed && styles.pressed,
                  (isLoading || phoneNumber.length < 11) && styles.buttonDisabled,
                ]}
              >
                {isLoading ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <>
                    <Ionicons name="paper-plane" size={18} color="#fff" />
                    <ThemedText style={styles.primaryButtonText}>Send Code</ThemedText>
                  </>
                )}
              </Pressable>
            </Animated.View>
          )}

          {/* Step 2: OTP Input */}
          {step === "verify" && (
            <Animated.View entering={FadeInUp.duration(300)}>
              <View style={styles.otpSection}>
                <View style={styles.otpContainer}>
                  {otpDigits.map((digit, index) => (
                    <TextInput
                      key={index}
                      ref={(ref) => { otpRefs.current[index] = ref; }}
                      value={digit}
                      onChangeText={(value) => handleOtpChange(index, value)}
                      onKeyPress={({ nativeEvent }) => handleOtpKeyPress(index, nativeEvent.key)}
                      keyboardType="number-pad"
                      maxLength={1}
                      style={[
                        styles.otpInput,
                        {
                          backgroundColor: cardBg,
                          borderColor: digit
                            ? primaryColor
                            : isDark
                            ? "rgba(255,255,255,0.1)"
                            : "rgba(0,0,0,0.1)",
                          color: textColor,
                        },
                      ]}
                      selectTextOnFocus
                    />
                  ))}
                </View>

                {/* Countdown / Resend */}
                <View style={styles.resendContainer}>
                  {canResend ? (
                    <Pressable
                      onPress={resendCode}
                      disabled={isLoading}
                      style={({ pressed }) => [pressed && styles.pressed]}
                    >
                      <ThemedText style={[styles.resendText, { color: primaryColor }]}>
                        Resend Code
                      </ThemedText>
                    </Pressable>
                  ) : (
                    <ThemedText style={[styles.countdownText, { color: mutedColor }]}>
                      Resend in {formatCountdown(countdown)}
                    </ThemedText>
                  )}
                </View>
              </View>

              {/* Error Message */}
              {error && (
                <Animated.View entering={FadeIn} style={styles.errorContainer}>
                  <Ionicons name="alert-circle" size={16} color={errorColor} />
                  <ThemedText style={[styles.errorText, { color: errorColor }]}>
                    {error}
                  </ThemedText>
                </Animated.View>
              )}

              {/* Loading indicator */}
              {isLoading && (
                <View style={styles.verifyingContainer}>
                  <ActivityIndicator size="small" color={primaryColor} />
                  <ThemedText style={[styles.verifyingText, { color: mutedColor }]}>
                    Verifying...
                  </ThemedText>
                </View>
              )}

              {/* Back Button */}
              <Pressable
                onPress={() => {
                  reset();
                  setOtpDigits(["", "", "", "", "", ""]);
                }}
                disabled={isLoading}
                style={({ pressed }) => [
                  styles.secondaryButton,
                  { borderColor: isDark ? "rgba(255,255,255,0.2)" : "rgba(0,0,0,0.1)" },
                  pressed && styles.pressed,
                ]}
              >
                <Ionicons name="arrow-back" size={18} color={mutedColor} />
                <ThemedText style={[styles.secondaryButtonText, { color: mutedColor }]}>
                  Change Number
                </ThemedText>
              </Pressable>
            </Animated.View>
          )}

          {/* Step 3: Success */}
          {step === "success" && (
            <Animated.View
              entering={FadeIn.duration(300)}
              style={[styles.successContainer, { backgroundColor: `${successColor}15` }]}
            >
              <View style={[styles.successIcon, { backgroundColor: successColor }]}>
                <Ionicons name="checkmark" size={32} color="#fff" />
              </View>
              <ThemedText style={[styles.successText, { color: successColor }]}>
                Phone number verified!
              </ThemedText>
              <ThemedText style={[styles.successSubtext, { color: mutedColor }]}>
                Friends can now find you by phone
              </ThemedText>
            </Animated.View>
          )}
          </ScrollView>
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ============================================================================
// Styles
// ============================================================================

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: "center",
    padding: 20,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.5)",
  },
  modal: {
    borderRadius: 24,
    padding: 24,
    paddingBottom: 32,
    maxHeight: "90%",
  },
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    marginBottom: 24,
  },
  headerContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    flex: 1,
  },
  headerIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    fontSize: 20,
    fontWeight: "600",
  },
  subtitle: {
    fontSize: 13,
    marginTop: 2,
  },
  closeButton: {
    padding: 4,
  },
  pressed: {
    opacity: 0.6,
  },
  inputSection: {
    marginBottom: 16,
  },
  inputLabel: {
    fontSize: 13,
    marginBottom: 8,
    fontWeight: "500",
  },
  phoneInputContainer: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 12,
    borderWidth: 1.5,
    paddingHorizontal: 14,
    gap: 8,
  },
  countryCode: {
    fontSize: 17,
    fontWeight: "500",
    paddingVertical: 14,
  },
  phoneInput: {
    flex: 1,
    fontSize: 17,
    fontWeight: "500",
    paddingVertical: 14,
  },
  hint: {
    fontSize: 12,
    marginTop: 8,
  },
  errorContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 16,
    paddingHorizontal: 4,
  },
  errorText: {
    fontSize: 13,
    flex: 1,
  },
  primaryButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 16,
    borderRadius: 12,
    marginTop: 8,
  },
  primaryButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  otpSection: {
    marginBottom: 20,
  },
  otpContainer: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 10,
  },
  otpInput: {
    width: 48,
    height: 56,
    borderRadius: 12,
    borderWidth: 2,
    fontSize: 24,
    fontWeight: "700",
    textAlign: "center",
  },
  resendContainer: {
    alignItems: "center",
    marginTop: 20,
  },
  resendText: {
    fontSize: 14,
    fontWeight: "600",
  },
  countdownText: {
    fontSize: 14,
  },
  verifyingContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    marginBottom: 16,
  },
  verifyingText: {
    fontSize: 14,
  },
  secondaryButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1.5,
  },
  secondaryButtonText: {
    fontSize: 15,
    fontWeight: "500",
  },
  successContainer: {
    alignItems: "center",
    padding: 32,
    borderRadius: 16,
  },
  successIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  successText: {
    fontSize: 20,
    fontWeight: "600",
    marginBottom: 8,
  },
  successSubtext: {
    fontSize: 14,
    textAlign: "center",
  },
});

export default PhoneVerificationModal;
