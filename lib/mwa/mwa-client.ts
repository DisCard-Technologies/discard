/**
 * DisCard 2035 - Mobile Wallet Adapter (MWA) Client
 *
 * Utilities for connecting to Seed Vault and other MWA-compatible wallets
 * on Solana Mobile devices (Seeker, Saga).
 *
 * MWA is Android-only and provides hardware wallet security through the
 * device's secure element (Seed Vault).
 */

import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";
import { PublicKey } from "@solana/web3.js";

// ============================================================================
// Constants
// ============================================================================

const MWA_AUTH_TOKEN_KEY = "discard_mwa_auth_token";
const MWA_WALLET_ADDRESS_KEY = "discard_mwa_wallet_address";
const MWA_WALLET_NAME_KEY = "discard_mwa_wallet_name";

// Known Seeker/Saga device identifiers
const SEEKER_DEVICE_MODELS = [
  "seeker",
  "saga",
  "solana mobile",
];

// App identity for MWA authorization
export const APP_IDENTITY = {
  name: "DisCard",
  uri: "https://discard.app",
  icon: "https://discard.app/icon.png",
};

// ============================================================================
// Types
// ============================================================================

export interface MWASessionInfo {
  authToken: string;
  walletAddress: string;
  walletName: string;
  expiresAt?: number;
}

export interface MWADeviceInfo {
  isAndroid: boolean;
  isSeeker: boolean;
  isSaga: boolean;
  isMWASupported: boolean;
  deviceModel: string;
}

export interface MWAAuthorizationResult {
  authToken: string;
  publicKey: PublicKey;
  walletName: string;
}

// ============================================================================
// Platform Detection
// ============================================================================

/**
 * Check if the current platform supports MWA (Android only)
 */
export function isMWASupported(): boolean {
  return Platform.OS === "android";
}

/**
 * Check if running on a Seeker device
 */
export function isSeekerDevice(): boolean {
  if (Platform.OS !== "android") return false;

  // Check device model/brand for Seeker identification
  // Note: This is a heuristic - actual Seeker detection may require
  // checking for the Seed Vault app or specific system properties
  const constants = Platform.constants as any;
  const model = (constants?.Model ?? "").toLowerCase();
  const brand = (constants?.Brand ?? "").toLowerCase();
  const manufacturer = (constants?.Manufacturer ?? "").toLowerCase();

  return (
    SEEKER_DEVICE_MODELS.some(
      (d) =>
        model.includes(d) ||
        brand.includes(d) ||
        manufacturer.includes(d)
    ) || hasSeedVaultApp()
  );
}

/**
 * Check if running on a Saga device
 */
export function isSagaDevice(): boolean {
  if (Platform.OS !== "android") return false;

  const constants = Platform.constants as any;
  const model = (constants?.Model ?? "").toLowerCase();
  return model.includes("saga");
}

/**
 * Check if Seed Vault app is installed (heuristic)
 * In a real implementation, this would use native modules to check
 */
export function hasSeedVaultApp(): boolean {
  // This is a placeholder - actual implementation would use
  // native Android code to check if the Seed Vault app responds
  // to MWA intents
  return Platform.OS === "android";
}

/**
 * Get comprehensive device info
 */
export function getDeviceInfo(): MWADeviceInfo {
  const isAndroid = Platform.OS === "android";
  const isSeeker = isSeekerDevice();
  const isSaga = isSagaDevice();
  const constants = Platform.constants as any;

  return {
    isAndroid,
    isSeeker,
    isSaga,
    isMWASupported: isAndroid,
    deviceModel: constants?.Model ?? "unknown",
  };
}

// ============================================================================
// Session Management
// ============================================================================

/**
 * Store MWA session info securely
 */
export async function storeMWASession(session: MWASessionInfo): Promise<void> {
  await Promise.all([
    SecureStore.setItemAsync(MWA_AUTH_TOKEN_KEY, session.authToken),
    SecureStore.setItemAsync(MWA_WALLET_ADDRESS_KEY, session.walletAddress),
    SecureStore.setItemAsync(MWA_WALLET_NAME_KEY, session.walletName),
  ]);
}

/**
 * Retrieve stored MWA session info
 */
export async function getMWASession(): Promise<MWASessionInfo | null> {
  try {
    const [authToken, walletAddress, walletName] = await Promise.all([
      SecureStore.getItemAsync(MWA_AUTH_TOKEN_KEY),
      SecureStore.getItemAsync(MWA_WALLET_ADDRESS_KEY),
      SecureStore.getItemAsync(MWA_WALLET_NAME_KEY),
    ]);

    if (!authToken || !walletAddress) {
      return null;
    }

    return {
      authToken,
      walletAddress,
      walletName: walletName ?? "Seed Vault",
    };
  } catch {
    return null;
  }
}

/**
 * Clear stored MWA session
 */
export async function clearMWASession(): Promise<void> {
  await Promise.all([
    SecureStore.deleteItemAsync(MWA_AUTH_TOKEN_KEY),
    SecureStore.deleteItemAsync(MWA_WALLET_ADDRESS_KEY),
    SecureStore.deleteItemAsync(MWA_WALLET_NAME_KEY),
  ]);
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Validate a Solana public key string
 */
export function isValidSolanaAddress(address: string): boolean {
  try {
    new PublicKey(address);
    return true;
  } catch {
    return false;
  }
}

/**
 * Format wallet address for display
 */
export function formatWalletAddress(address: string): string {
  if (address.length <= 8) return address;
  return `${address.slice(0, 4)}...${address.slice(-4)}`;
}

/**
 * Get a human-readable wallet name
 */
export function getWalletDisplayName(
  walletName: string,
  address: string
): string {
  if (walletName && walletName !== "Unknown") {
    return walletName;
  }
  return `Seed Vault (${formatWalletAddress(address)})`;
}

// ============================================================================
// MWA Transaction Helpers
// ============================================================================

/**
 * Serialize a transaction for MWA signing
 */
export function serializeTransactionForMWA(
  transaction: Uint8Array
): Uint8Array {
  // MWA expects raw serialized transaction bytes
  return transaction;
}

/**
 * Deserialize a signature from MWA
 */
export function deserializeSignatureFromMWA(
  signature: Uint8Array
): Uint8Array {
  // MWA returns raw 64-byte Ed25519 signatures
  return signature;
}

// ============================================================================
// Exports
// ============================================================================

export default {
  isMWASupported,
  isSeekerDevice,
  isSagaDevice,
  hasSeedVaultApp,
  getDeviceInfo,
  storeMWASession,
  getMWASession,
  clearMWASession,
  isValidSolanaAddress,
  formatWalletAddress,
  getWalletDisplayName,
  APP_IDENTITY,
};
