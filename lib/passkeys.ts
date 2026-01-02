/**
 * Passkey Utilities
 *
 * WebAuthn utilities for passkey-based authentication.
 * Uses P-256 keys for Solana address derivation.
 */
import * as Crypto from "expo-crypto";
import * as SecureStore from "expo-secure-store";
import * as LocalAuthentication from "expo-local-authentication";
import { Platform } from "react-native";

// Storage keys
const CREDENTIAL_ID_KEY = "discard_credential_id";
const USER_ID_KEY = "discard_user_id";
const PUBLIC_KEY_KEY = "discard_public_key";

// Web-compatible storage wrapper
const storage = {
  async setItem(key: string, value: string): Promise<void> {
    if (Platform.OS === 'web') {
      localStorage.setItem(key, value);
    } else {
      await SecureStore.setItemAsync(key, value);
    }
  },
  async getItem(key: string): Promise<string | null> {
    if (Platform.OS === 'web') {
      return localStorage.getItem(key);
    }
    return await SecureStore.getItemAsync(key);
  },
  async deleteItem(key: string): Promise<void> {
    if (Platform.OS === 'web') {
      localStorage.removeItem(key);
    } else {
      await SecureStore.deleteItemAsync(key);
    }
  },
};

// Relying Party configuration
export const RP_CONFIG = {
  id: process.env.EXPO_PUBLIC_TURNKEY_RP_ID || "discard.tech",
  name: "DisCard",
};

/**
 * Check if device supports passkeys
 */
export async function isPasskeySupported(): Promise<{
  supported: boolean;
  hasBiometrics: boolean;
  biometricTypes: LocalAuthentication.AuthenticationType[];
}> {
  const hasHardware = await LocalAuthentication.hasHardwareAsync();
  const isEnrolled = await LocalAuthentication.isEnrolledAsync();
  const supportedTypes = await LocalAuthentication.supportedAuthenticationTypesAsync();

  return {
    supported: hasHardware && isEnrolled,
    hasBiometrics: isEnrolled,
    biometricTypes: supportedTypes,
  };
}

/**
 * Authenticate with biometrics before passkey operation
 */
export async function authenticateWithBiometrics(
  promptMessage: string = "Authenticate to continue"
): Promise<boolean> {
  const result = await LocalAuthentication.authenticateAsync({
    promptMessage,
    fallbackLabel: "Use passcode",
    disableDeviceFallback: false,
  });

  return result.success;
}

/**
 * Generate a cryptographically secure challenge
 */
export async function generateChallenge(): Promise<string> {
  const randomBytes = await Crypto.getRandomBytesAsync(32);
  return bufferToBase64(randomBytes);
}

/**
 * Generate a user ID for WebAuthn registration
 */
export async function generateUserId(): Promise<string> {
  const randomBytes = await Crypto.getRandomBytesAsync(16);
  return bufferToBase64(randomBytes);
}

/**
 * Store credential data securely
 */
export async function storeCredential(data: {
  credentialId: string;
  userId: string;
  publicKey?: string;
}): Promise<void> {
  await storage.setItem(CREDENTIAL_ID_KEY, data.credentialId);
  await storage.setItem(USER_ID_KEY, data.userId);
  if (data.publicKey) {
    await storage.setItem(PUBLIC_KEY_KEY, data.publicKey);
  }
}

/**
 * Retrieve stored credential data
 */
export async function getStoredCredential(): Promise<{
  credentialId: string | null;
  userId: string | null;
  publicKey: string | null;
}> {
  const credentialId = await storage.getItem(CREDENTIAL_ID_KEY);
  const userId = await storage.getItem(USER_ID_KEY);
  const publicKey = await storage.getItem(PUBLIC_KEY_KEY);

  return { credentialId, userId, publicKey };
}

/**
 * Check if user has stored credentials
 */
export async function hasStoredCredential(): Promise<boolean> {
  const credentialId = await storage.getItem(CREDENTIAL_ID_KEY);
  return credentialId !== null;
}

/**
 * Clear stored credentials (for logout)
 */
export async function clearStoredCredentials(): Promise<void> {
  await storage.deleteItem(CREDENTIAL_ID_KEY);
  await storage.deleteItem(USER_ID_KEY);
  await storage.deleteItem(PUBLIC_KEY_KEY);
}

/**
 * Derive Solana address from P-256 public key
 * Uses SHA-256 hash of the public key, truncated to 32 bytes
 */
export async function deriveSolanaAddress(publicKeyBase64: string): Promise<string> {
  // Hash the public key
  const hash = await Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    publicKeyBase64
  );

  // Convert to base58 (Solana address format)
  return hexToBase58(hash);
}

/**
 * Convert Uint8Array to base64 string
 */
function bufferToBase64(buffer: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < buffer.length; i++) {
    binary += String.fromCharCode(buffer[i]);
  }
  return btoa(binary);
}

/**
 * Convert base64 string to Uint8Array
 */
export function base64ToBuffer(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/**
 * Convert hex string to base58 (Solana address format)
 */
function hexToBase58(hex: string): string {
  const ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

  // Convert hex to bytes
  const bytes: number[] = [];
  for (let i = 0; i < hex.length; i += 2) {
    bytes.push(parseInt(hex.substr(i, 2), 16));
  }

  // Count leading zeros
  let zeros = 0;
  for (let i = 0; i < bytes.length && bytes[i] === 0; i++) {
    zeros++;
  }

  // Convert to base58
  const encoded: number[] = [];
  let carry: number;

  for (let i = zeros; i < bytes.length; i++) {
    carry = bytes[i];
    for (let j = 0; j < encoded.length; j++) {
      carry += encoded[j] * 256;
      encoded[j] = carry % 58;
      carry = Math.floor(carry / 58);
    }
    while (carry > 0) {
      encoded.push(carry % 58);
      carry = Math.floor(carry / 58);
    }
  }

  // Add leading '1's for leading zeros
  let result = "";
  for (let i = 0; i < zeros; i++) {
    result += ALPHABET[0];
  }

  // Convert to string
  for (let i = encoded.length - 1; i >= 0; i--) {
    result += ALPHABET[encoded[i]];
  }

  return result;
}

/**
 * Format biometric type for display
 */
export function formatBiometricType(
  type: LocalAuthentication.AuthenticationType
): string {
  switch (type) {
    case LocalAuthentication.AuthenticationType.FINGERPRINT:
      return "Fingerprint";
    case LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION:
      return "Face ID";
    case LocalAuthentication.AuthenticationType.IRIS:
      return "Iris";
    default:
      return "Biometric";
  }
}
