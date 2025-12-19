/**
 * Passkey Authentication Screen
 *
 * Unified login/registration using WebAuthn passkeys.
 * No passwords, no seed phrases - just biometrics.
 */
import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { usePasskeyAuth } from "../../hooks/usePasskeyAuth";
import {
  isPasskeySupported,
  hasStoredCredential,
  formatBiometricType,
} from "../../lib/passkeys";
import * as LocalAuthentication from "expo-local-authentication";

type AuthMode = "welcome" | "login" | "register";

interface PasskeyAuthScreenProps {
  onAuthSuccess?: () => void;
}

export default function PasskeyAuthScreen({
  onAuthSuccess,
}: PasskeyAuthScreenProps) {
  const [mode, setMode] = useState<AuthMode>("welcome");
  const [displayName, setDisplayName] = useState("");
  const [isCheckingSupport, setIsCheckingSupport] = useState(true);
  const [biometricType, setBiometricType] = useState<string>("Biometric");
  const [hasExistingCredential, setHasExistingCredential] = useState(false);

  const { isLoading, error, register, login } = usePasskeyAuth();

  // Check device support and existing credentials on mount
  useEffect(() => {
    checkDeviceSupport();
  }, []);

  async function checkDeviceSupport() {
    try {
      const support = await isPasskeySupported();

      if (!support.supported) {
        Alert.alert(
          "Biometrics Required",
          "Please enable biometric authentication (Face ID, Touch ID, or Fingerprint) in your device settings to use DisCard.",
          [{ text: "OK" }]
        );
      }

      // Get biometric type for display
      if (support.biometricTypes.length > 0) {
        setBiometricType(formatBiometricType(support.biometricTypes[0]));
      }

      // Check for existing credentials
      const hasCredential = await hasStoredCredential();
      setHasExistingCredential(hasCredential);

      // Auto-select mode
      if (hasCredential) {
        setMode("login");
      }
    } finally {
      setIsCheckingSupport(false);
    }
  }

  async function handleLogin() {
    const success = await login();
    if (success) {
      onAuthSuccess?.();
    }
  }

  async function handleRegister() {
    if (!displayName.trim()) {
      Alert.alert("Name Required", "Please enter your name to continue.");
      return;
    }

    const success = await register(displayName.trim());
    if (success) {
      onAuthSuccess?.();
    }
  }

  // Loading state
  if (isCheckingSupport) {
    return (
      <View style={styles.container}>
        <View style={styles.content}>
          <ActivityIndicator size="large" color="#8B5CF6" />
          <Text style={styles.loadingText}>Checking device support...</Text>
        </View>
      </View>
    );
  }

  // Welcome screen
  if (mode === "welcome") {
    return (
      <View style={styles.container}>
        <View style={styles.content}>
          <Text style={styles.logo}>💳</Text>
          <Text style={styles.title}>DisCard</Text>
          <Text style={styles.subtitle}>
            Privacy-first virtual cards{"\n"}powered by passkeys
          </Text>

          <View style={styles.featureList}>
            <FeatureItem
              icon="finger-print"
              title="No Passwords"
              description="Sign in with Face ID or fingerprint"
            />
            <FeatureItem
              icon="shield-checkmark"
              title="Hardware Security"
              description="Keys stored in secure enclave"
            />
            <FeatureItem
              icon="wallet"
              title="Crypto Ready"
              description="Solana wallet derived from passkey"
            />
          </View>

          {hasExistingCredential ? (
            <TouchableOpacity
              style={styles.primaryButton}
              onPress={() => setMode("login")}
            >
              <Ionicons name="finger-print" size={24} color="#FFFFFF" />
              <Text style={styles.primaryButtonText}>
                Sign in with {biometricType}
              </Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={styles.primaryButton}
              onPress={() => setMode("register")}
            >
              <Ionicons name="add-circle" size={24} color="#FFFFFF" />
              <Text style={styles.primaryButtonText}>Create Account</Text>
            </TouchableOpacity>
          )}

          {hasExistingCredential ? (
            <TouchableOpacity
              style={styles.secondaryButton}
              onPress={() => setMode("register")}
            >
              <Text style={styles.secondaryButtonText}>
                Create new account instead
              </Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={styles.secondaryButton}
              onPress={() => setMode("login")}
            >
              <Text style={styles.secondaryButtonText}>
                I already have an account
              </Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    );
  }

  // Login screen
  if (mode === "login") {
    return (
      <View style={styles.container}>
        <View style={styles.content}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => setMode("welcome")}
          >
            <Ionicons name="arrow-back" size={24} color="#6B7280" />
          </TouchableOpacity>

          <View style={styles.iconContainer}>
            <Ionicons name="finger-print" size={80} color="#8B5CF6" />
          </View>

          <Text style={styles.title}>Welcome Back</Text>
          <Text style={styles.subtitle}>
            Use {biometricType} to sign in securely
          </Text>

          {error && (
            <View style={styles.errorContainer}>
              <Ionicons name="alert-circle" size={20} color="#DC2626" />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          )}

          <TouchableOpacity
            style={[styles.primaryButton, isLoading && styles.buttonDisabled]}
            onPress={handleLogin}
            disabled={isLoading}
          >
            {isLoading ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <>
                <Ionicons name="log-in" size={24} color="#FFFFFF" />
                <Text style={styles.primaryButtonText}>Sign In</Text>
              </>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.secondaryButton}
            onPress={() => setMode("register")}
          >
            <Text style={styles.secondaryButtonText}>
              Create new account instead
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // Register screen
  return (
    <View style={styles.container}>
      <View style={styles.content}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => setMode("welcome")}
        >
          <Ionicons name="arrow-back" size={24} color="#6B7280" />
        </TouchableOpacity>

        <View style={styles.iconContainer}>
          <Ionicons name="person-add" size={80} color="#8B5CF6" />
        </View>

        <Text style={styles.title}>Create Account</Text>
        <Text style={styles.subtitle}>
          Your passkey will be secured with {biometricType}
        </Text>

        {error && (
          <View style={styles.errorContainer}>
            <Ionicons name="alert-circle" size={20} color="#DC2626" />
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        <TextInput
          style={styles.input}
          placeholder="Your name"
          placeholderTextColor="#9CA3AF"
          value={displayName}
          onChangeText={setDisplayName}
          autoCapitalize="words"
          autoCorrect={false}
        />

        <View style={styles.infoBox}>
          <Ionicons name="information-circle" size={20} color="#8B5CF6" />
          <Text style={styles.infoText}>
            Your passkey creates a secure Solana wallet automatically.
            No seed phrases to remember.
          </Text>
        </View>

        <TouchableOpacity
          style={[styles.primaryButton, isLoading && styles.buttonDisabled]}
          onPress={handleRegister}
          disabled={isLoading || !displayName.trim()}
        >
          {isLoading ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <>
              <Ionicons name="finger-print" size={24} color="#FFFFFF" />
              <Text style={styles.primaryButtonText}>
                Create with {biometricType}
              </Text>
            </>
          )}
        </TouchableOpacity>

        {hasExistingCredential && (
          <TouchableOpacity
            style={styles.secondaryButton}
            onPress={() => setMode("login")}
          >
            <Text style={styles.secondaryButtonText}>
              Sign in to existing account
            </Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

function FeatureItem({
  icon,
  title,
  description,
}: {
  icon: string;
  title: string;
  description: string;
}) {
  return (
    <View style={styles.featureItem}>
      <View style={styles.featureIcon}>
        <Ionicons name={icon as any} size={24} color="#8B5CF6" />
      </View>
      <View style={styles.featureText}>
        <Text style={styles.featureTitle}>{title}</Text>
        <Text style={styles.featureDescription}>{description}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#111827",
  },
  content: {
    flex: 1,
    justifyContent: "center",
    padding: 24,
  },
  backButton: {
    position: "absolute",
    top: Platform.OS === "ios" ? 60 : 40,
    left: 24,
    padding: 8,
  },
  logo: {
    fontSize: 80,
    textAlign: "center",
    marginBottom: 16,
  },
  iconContainer: {
    alignItems: "center",
    marginBottom: 24,
  },
  title: {
    fontSize: 32,
    fontWeight: "700",
    color: "#FFFFFF",
    textAlign: "center",
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: "#9CA3AF",
    textAlign: "center",
    marginBottom: 32,
    lineHeight: 24,
  },
  loadingText: {
    color: "#9CA3AF",
    fontSize: 16,
    marginTop: 16,
    textAlign: "center",
  },
  featureList: {
    marginBottom: 32,
  },
  featureItem: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 16,
  },
  featureIcon: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: "#1F2937",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 16,
  },
  featureText: {
    flex: 1,
  },
  featureTitle: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "600",
    marginBottom: 2,
  },
  featureDescription: {
    color: "#9CA3AF",
    fontSize: 14,
  },
  input: {
    backgroundColor: "#1F2937",
    borderWidth: 1,
    borderColor: "#374151",
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    color: "#FFFFFF",
    marginBottom: 16,
  },
  infoBox: {
    flexDirection: "row",
    backgroundColor: "#1F2937",
    borderRadius: 12,
    padding: 16,
    marginBottom: 24,
  },
  infoText: {
    flex: 1,
    color: "#9CA3AF",
    fontSize: 14,
    marginLeft: 12,
    lineHeight: 20,
  },
  errorContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#7F1D1D",
    padding: 12,
    borderRadius: 12,
    marginBottom: 16,
  },
  errorText: {
    color: "#FCA5A5",
    fontSize: 14,
    marginLeft: 8,
    flex: 1,
  },
  primaryButton: {
    backgroundColor: "#8B5CF6",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    padding: 16,
    borderRadius: 12,
    marginBottom: 16,
    gap: 8,
  },
  buttonDisabled: {
    backgroundColor: "#4B5563",
  },
  primaryButtonText: {
    color: "#FFFFFF",
    fontSize: 18,
    fontWeight: "600",
  },
  secondaryButton: {
    padding: 12,
    alignItems: "center",
  },
  secondaryButtonText: {
    color: "#8B5CF6",
    fontSize: 16,
  },
});
