/**
 * Convex-based Authentication Store
 *
 * Replaces JWT auth with passkey-based authentication using Convex.
 * Maintains same interface as legacy auth store for backwards compatibility.
 */
import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  ReactNode,
  useCallback,
} from "react";
import { Platform } from "react-native";
import { useMutation, useQuery, useAction } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import * as SecureStore from "expo-secure-store";
import * as LocalAuthentication from "expo-local-authentication";
import * as Crypto from "expo-crypto";
import Constants from "expo-constants";
import { Keypair } from "@solana/web3.js";
import * as bs58 from "bs58";

// Mnemonic wallet generation for seed phrase backup
import {
  generateMnemonic,
  deriveKeypairFromMnemonic,
  storeMnemonicLocally,
  hasMnemonicWallet,
  getMnemonicLocally,
  setWalletType,
  type MnemonicWallet,
} from "@/lib/mnemonic";

// Conditionally import Passkey - it may not be available in Expo Go
let Passkey: any = null;
try {
  const passkeyModule = require("react-native-passkey");
  Passkey = passkeyModule.Passkey;
  console.log("[Auth] react-native-passkey loaded:", {
    hasPasskey: !!Passkey,
    // v3 API uses create/get instead of register/authenticate
    hasCreate: typeof Passkey?.create,
    hasGet: typeof Passkey?.get,
    // v2 API (deprecated)
    hasRegister: typeof Passkey?.register,
    hasAuthenticate: typeof Passkey?.authenticate,
    passkeyMethods: Passkey ? Object.keys(Passkey) : [],
  });
} catch (e) {
  console.log("[Auth] react-native-passkey not available:", e);
}

// Turnkey React Native Passkey Stamper for non-custodial wallets
let PasskeyStamper: any = null;
let createPasskey: any = null;
try {
  const turnkeyPasskey = require("@turnkey/react-native-passkey-stamper");
  PasskeyStamper = turnkeyPasskey.PasskeyStamper;
  createPasskey = turnkeyPasskey.createPasskey;
  console.log("[Auth] @turnkey/react-native-passkey-stamper loaded:", {
    hasStamper: !!PasskeyStamper,
    hasCreatePasskey: typeof createPasskey,
  });
} catch (e) {
  console.log("[Auth] @turnkey/react-native-passkey-stamper not available:", e);
}

// Check if running in Expo Go (native modules unavailable)
function isExpoGo(): boolean {
  return Constants.appOwnership === "expo";
}

// Check if native passkey module is available
function isPasskeyAvailable(): boolean {
  // Native passkey module requires a development build, not Expo Go
  if (isExpoGo()) return false;
  // v3 API uses create/get, v2 used register/authenticate
  return Passkey !== null && (typeof Passkey?.create === "function" || typeof Passkey?.register === "function");
}

// Check if Turnkey passkey stamper is available
// NOTE: Turnkey passkey stamper also requires native code (react-native-passkey)
// so it won't work in Expo Go even though the JS function exists
function isTurnkeyPasskeyAvailable(): boolean {
  // Native modules required - not available in Expo Go
  if (isExpoGo()) return false;
  return createPasskey !== null && typeof createPasskey === "function";
}

// Turnkey configuration - your app's domain for passkey binding
const TURNKEY_RP_ID = process.env.EXPO_PUBLIC_TURNKEY_RP_ID || "www.discard.tech";

// Helper to check if userId is a local-only (not in Convex) ID
// Now most users are in Convex, only offline/dev mode creates local IDs
export function isLocalUserId(userId: string | null | undefined): boolean {
  if (typeof userId !== 'string') return false;
  return (
    userId.startsWith('local_') ||      // Offline fallback (pending sync)
    userId.startsWith('dev_user_') ||   // Dev mode (no biometrics)
    userId.startsWith('mock_user_') ||  // Legacy mock auth
    userId.startsWith('bio_user_')      // Legacy biometric (before Convex integration)
  );
}

import {
  generateChallenge,
  generateUserId,
  storeCredential,
  getStoredCredential,
  clearStoredCredentials,
  RP_CONFIG,
} from "@/lib/passkeys";

// Storage keys
const USER_ID_KEY = "discard_user_id";
const SOLANA_SECRET_KEY = "discard_solana_secret";
const CREDENTIAL_ID_KEY = "discard_credential_id";

// Generate a new Solana keypair and store securely
async function generateAndStoreSolanaWallet(): Promise<{ publicKey: string; secretKey: Uint8Array }> {
  // Generate 32 random bytes for the keypair seed
  const randomBytes = await Crypto.getRandomBytesAsync(32);

  // Create Solana keypair from random bytes
  const keypair = Keypair.fromSeed(randomBytes);

  // Store secret key in SecureStore (base58 encoded)
  const secretKeyBase58 = bs58.encode(keypair.secretKey);
  await SecureStore.setItemAsync(SOLANA_SECRET_KEY, secretKeyBase58);

  console.log("[Auth] Generated new Solana wallet:", keypair.publicKey.toBase58());

  return {
    publicKey: keypair.publicKey.toBase58(),
    secretKey: keypair.secretKey,
  };
}

/**
 * Generate a new mnemonic-based Solana wallet
 * This creates a 12-word seed phrase that can be backed up
 *
 * @returns Wallet with mnemonic for backup capability
 */
async function generateMnemonicSolanaWallet(): Promise<{
  publicKey: string;
  secretKey: Uint8Array;
  mnemonic: string;
}> {
  // Generate 12-word mnemonic
  const mnemonic = generateMnemonic();

  // Derive Solana keypair from mnemonic using BIP44 path
  const wallet = deriveKeypairFromMnemonic(mnemonic);

  // Store mnemonic securely (encrypted by device keychain)
  await storeMnemonicLocally(mnemonic);

  // Also store secret key for quick access (same as legacy flow)
  const secretKeyBase58 = bs58.encode(wallet.secretKey);
  await SecureStore.setItemAsync(SOLANA_SECRET_KEY, secretKeyBase58);

  // Mark this as a mnemonic wallet
  await setWalletType('mnemonic');

  console.log("[Auth] Generated new mnemonic wallet:", wallet.publicKey);
  console.log("[Auth] Seed phrase stored - user should back up!");

  return {
    publicKey: wallet.publicKey,
    secretKey: wallet.secretKey,
    mnemonic,
  };
}

/**
 * Check if there's an existing mnemonic wallet that can be recovered
 */
export async function canRecoverMnemonicWallet(): Promise<boolean> {
  return await hasMnemonicWallet();
}

/**
 * Get wallet from stored mnemonic (if available)
 */
export async function getWalletFromMnemonic(): Promise<{
  publicKey: string;
  secretKey: Uint8Array;
} | null> {
  const mnemonic = await getMnemonicLocally();
  if (!mnemonic) return null;

  const wallet = deriveKeypairFromMnemonic(mnemonic);
  return {
    publicKey: wallet.publicKey,
    secretKey: wallet.secretKey,
  };
}

// Retrieve stored Solana wallet
export async function getStoredSolanaWallet(): Promise<{ publicKey: string; secretKey: Uint8Array } | null> {
  try {
    const secretKeyBase58 = await SecureStore.getItemAsync(SOLANA_SECRET_KEY);
    if (!secretKeyBase58) return null;

    const secretKey = bs58.decode(secretKeyBase58);
    const keypair = Keypair.fromSecretKey(secretKey);

    return {
      publicKey: keypair.publicKey.toBase58(),
      secretKey: keypair.secretKey,
    };
  } catch (e) {
    console.error("[Auth] Failed to retrieve Solana wallet:", e);
    return null;
  }
}

// Get Solana Keypair for local signing (biometric auth users without Turnkey)
export async function getLocalSolanaKeypair(): Promise<Keypair | null> {
  const wallet = await getStoredSolanaWallet();
  if (!wallet) return null;
  return Keypair.fromSecretKey(wallet.secretKey);
}

// Generate a unique credential ID for this device
async function generateCredentialId(): Promise<string> {
  const randomBytes = await Crypto.getRandomBytesAsync(16);
  const hex = Array.from(new Uint8Array(randomBytes))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
  return `bio_${Platform.OS}_${hex}`;
}

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

// User interface (compatible with legacy)
export interface User {
  id: string;
  displayName: string;
  email?: string;
  phoneNumber?: string;
  solanaAddress?: string;
  ethereumAddress?: string; // For MoonPay ETH purchases
  kycStatus: string;
  createdAt: number;
}

// Auth state interface (compatible with legacy)
export interface AuthState {
  user: User | null;
  userId: Id<"users"> | null;
  credentialId: string | null; // For passing to Convex mutations
  isLoading: boolean;
  isAuthenticated: boolean;
  error: string | null;
}

// Auth actions interface (compatible with legacy)
export interface AuthActions {
  loginWithPasskey: () => Promise<boolean>;
  registerWithPasskey: (displayName: string) => Promise<boolean>;
  logout: () => Promise<void>;
  checkAuthStatus: () => Promise<void>;
  // Legacy compatibility (no-op or redirect)
  login: (email: string, password: string) => Promise<boolean>;
  register: (email: string, password: string, username?: string) => Promise<boolean>;
  refreshToken: () => Promise<boolean>;
  getAuthToken: () => Promise<string | null>;
}

// Context
const AuthContext = createContext<{
  state: AuthState;
  actions: AuthActions;
} | null>(null);

// Provider component
export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({
    user: null,
    userId: null,
    credentialId: null,
    isLoading: true,
    isAuthenticated: false,
    error: null,
  });

  // Convex mutations and actions
  const registerPasskeyMutation = useMutation(api.auth.passkeys.registerPasskey);
  const verifyPasskeyMutation = useMutation(api.auth.passkeys.verifyPasskey);
  const registerBiometricMutation = useMutation(api.auth.passkeys.registerBiometric);
  const loginBiometricMutation = useMutation(api.auth.passkeys.loginBiometric);
  const logoutMutation = useMutation(api.auth.sessions.logout);
  // Turnkey registration action - creates TEE-managed wallets
  const registerWithTurnkeyAction = useAction(api.auth.passkeys.registerWithTurnkey);

  // Get user data from Convex (reactive)
  // Skip query for legacy local IDs (bio_user_*, dev_user_*, etc.)
  const shouldQueryConvex = state.userId && !isLocalUserId(state.userId);
  const userData = useQuery(
    api.auth.passkeys.getUser,
    shouldQueryConvex && state.userId ? { userId: state.userId } : "skip"
  );

  // Update user when data changes
  useEffect(() => {
    if (userData && state.userId) {
      setState((prev) => ({
        ...prev,
        user: {
          id: userData._id,
          displayName: userData.displayName ?? "",
          email: userData.email,
          phoneNumber: userData.phoneNumber,
          solanaAddress: userData.solanaAddress,
          ethereumAddress: userData.ethereumAddress,
          kycStatus: userData.kycStatus,
          createdAt: userData.createdAt,
        },
        isAuthenticated: true,
      }));
    }
  }, [userData, state.userId]);

  // Check auth status on mount
  useEffect(() => {
    actions.checkAuthStatus();
  }, []);

  const actions: AuthActions = {
    /**
     * Login with existing passkey (or biometric fallback)
     */
    loginWithPasskey: async (): Promise<boolean> => {
      try {
        setState((prev) => ({ ...prev, isLoading: true, error: null }));

        // Check biometric support
        const hasHardware = await LocalAuthentication.hasHardwareAsync();
        const isEnrolled = await LocalAuthentication.isEnrolledAsync();
        const passkeyAvailable = isPasskeyAvailable();

        console.log("[Auth] Login - Environment check:", {
          platform: Platform.OS,
          hasHardware,
          isEnrolled,
          passkeyAvailable,
        });

        // Get stored credential
        const stored = await getStoredCredential();

        // Use biometric auth if passkeys unavailable (Expo Go) but biometrics available
        const useBiometricAuth = !passkeyAvailable && hasHardware && isEnrolled;
        // Fall back to stored credentials only if no biometrics
        const useStoredAuthOnly = !passkeyAvailable && (!hasHardware || !isEnrolled);

        if (useBiometricAuth) {
          console.log("[Auth] Using biometric authentication (Expo Go mode)");

          // Get stored credential ID
          const credentialId = await storage.getItem(CREDENTIAL_ID_KEY);
          if (!credentialId && !stored.userId) {
            throw new Error("No stored credentials found. Please register first.");
          }

          // Authenticate with biometrics
          const biometricResult = await LocalAuthentication.authenticateAsync({
            promptMessage: "Authenticate to access DisCard",
            fallbackLabel: "Use passcode",
            disableDeviceFallback: false,
          });

          if (!biometricResult.success) {
            const errorMsg = 'error' in biometricResult ? biometricResult.error : "Biometric authentication failed";
            throw new Error(errorMsg || "Biometric authentication failed");
          }

          // Try to login via Convex (verifies user exists in backend)
          let userId: string;
          let solanaAddress: string | null = null;
          let displayName: string | null = null;

          if (credentialId) {
            try {
              console.log("[Auth] Verifying with Convex...");
              const result = await loginBiometricMutation({ credentialId });
              userId = result.userId;
              solanaAddress = result.solanaAddress;
              displayName = result.displayName;
              console.log("[Auth] Convex login successful:", userId);
            } catch (convexError) {
              // Convex unavailable or user not found - use stored credentials
              console.warn("[Auth] Convex unavailable, using stored credentials:", convexError);
              if (!stored.userId) {
                throw new Error("User not found. Please register first.");
              }
              userId = stored.userId;
              // Try to get wallet from local storage
              const wallet = await getStoredSolanaWallet();
              solanaAddress = wallet?.publicKey || null;
            }
          } else {
            // Legacy: use stored userId
            userId = stored.userId!;
            const wallet = await getStoredSolanaWallet();
            solanaAddress = wallet?.publicKey || null;
          }

          // Update last stored userId
          await storage.setItem(USER_ID_KEY, userId);

          setState((prev) => ({
            ...prev,
            userId: userId as Id<"users">,
            credentialId: credentialId || null,
            user: {
              id: userId,
              displayName: displayName || "DisCard User",
              solanaAddress: solanaAddress || undefined,
              kycStatus: "none",
              createdAt: Date.now(),
            },
            isAuthenticated: true,
            error: null,
          }));

          console.log("[Auth] Biometric login successful:", {
            userId,
            solanaAddress,
          });
          return true;
        }

        if (useStoredAuthOnly) {
          console.log("[Auth] No biometrics available, using stored credentials only");

          if (stored.userId) {
            setState((prev) => ({
              ...prev,
              userId: stored.userId as Id<"users">,
              credentialId: stored.credentialId || null,
              user: {
                id: stored.userId!,
                displayName: "DisCard User",
                solanaAddress: "DevWa11et123456789abcdefghij",
                kycStatus: "pending",
                createdAt: Date.now(),
              },
              isAuthenticated: true,
              error: null,
            }));
            console.log("[Auth] Stored credentials login successful:", stored.userId);
            return true;
          } else {
            throw new Error("No stored credentials found. Please register first.");
          }
        }

        // PRODUCTION: Use real passkey authentication
        // Generate challenge
        const challenge = await generateChallenge();

        // Authenticate with passkey using v3 API (Passkey.get instead of Passkey.authenticate)
        const authResult = await Passkey.get({
          challenge,
          rpId: RP_CONFIG.id,
          allowCredentials: stored.credentialId
            ? [{ id: stored.credentialId, type: "public-key" }]
            : undefined,
          userVerification: "required",
          timeout: 60000,
        });

        // Verify with Convex
        const result = await verifyPasskeyMutation({
          credentialId: authResult.id,
          signature: authResult.response.signature,
          authenticatorData: authResult.response.authenticatorData,
          clientDataJSON: authResult.response.clientDataJSON,
        });

        if (result.userId) {
          // Store user ID
          await storage.setItem(USER_ID_KEY, result.userId);
          await storeCredential({
            credentialId: authResult.id,
            userId: result.userId,
          });

          setState((prev) => ({
            ...prev,
            userId: result.userId as Id<"users">,
            credentialId: authResult.id,
            isAuthenticated: true,
            error: null,
          }));

          return true;
        } else {
          throw new Error("Passkey verification failed");
        }
      } catch (error) {
        // Enhanced error logging for passkey failures
        console.error("[Auth] Login error:", {
          error,
          errorType: typeof error,
          errorName: error instanceof Error ? error.name : "unknown",
          errorMessage: error instanceof Error ? error.message : String(error),
        });

        let message = "Login failed";
        if (error instanceof Error && error.message) {
          message = error.message;
        } else if (typeof error === "string") {
          message = error;
        }

        // Provide helpful context for common errors
        if (message.includes("not a function") || message.includes("undefined")) {
          message = "Passkey not available. Please use a development build instead of Expo Go.";
        }

        setState((prev) => ({ ...prev, error: message }));
        return false;
      } finally {
        setState((prev) => ({ ...prev, isLoading: false }));
      }
    },

    /**
     * Register new passkey (or biometric fallback)
     */
    registerWithPasskey: async (displayName: string): Promise<boolean> => {
      try {
        setState((prev) => ({ ...prev, isLoading: true, error: null }));

        // Check biometric support
        const hasHardware = await LocalAuthentication.hasHardwareAsync();
        const isEnrolled = await LocalAuthentication.isEnrolledAsync();
        const passkeyAvailable = isPasskeyAvailable();

        const turnkeyAvailable = isTurnkeyPasskeyAvailable();
        const expoGo = isExpoGo();

        console.log("[Auth] Registration - Environment check:", {
          platform: Platform.OS,
          hasHardware,
          isEnrolled,
          passkeyAvailable,
          turnkeyAvailable,
          expoGo,
        });

        // Use biometric registration if passkeys unavailable (Expo Go) but biometrics available
        const useBiometricAuth = !passkeyAvailable && hasHardware && isEnrolled;
        // Fall back to simple stored credentials if no biometrics
        const useStoredAuthOnly = !passkeyAvailable && (!hasHardware || !isEnrolled);

        if (useBiometricAuth) {
          if (turnkeyAvailable) {
            console.log("[Auth] Using biometric registration with Turnkey TEE wallets");
          } else {
            console.log("[Auth] Using biometric registration with local keypair (Expo Go - native passkey module unavailable)");
          }

          // Authenticate with biometrics to confirm device owner
          const biometricResult = await LocalAuthentication.authenticateAsync({
            promptMessage: "Authenticate to create your DisCard account",
            fallbackLabel: "Use passcode",
            disableDeviceFallback: false,
          });

          if (!biometricResult.success) {
            const errorMsg = 'error' in biometricResult ? biometricResult.error : "Biometric authentication failed";
            throw new Error(errorMsg || "Biometric authentication failed");
          }

          // Generate unique credential ID for this device
          const credentialId = await generateCredentialId();
          await storage.setItem(CREDENTIAL_ID_KEY, credentialId);

          // Check for existing Solana address for account recovery
          // This helps recover accounts when SecureStore is cleared but app data persists
          const existingWallet = await getStoredSolanaWallet();
          const existingSolanaAddress = existingWallet?.publicKey;
          if (existingSolanaAddress) {
            console.log("[Auth] Found existing Solana address for potential recovery:", existingSolanaAddress);
          }

          // Register with Turnkey via Convex action
          // This creates TEE-managed Solana + Ethereum wallets
          let userId: string;
          let solanaAddress: string;
          let ethereumAddress: string | undefined;

          try {
            console.log("[Auth] Creating Turnkey non-custodial wallets...");

            // Check if Turnkey passkey stamper is available
            if (isTurnkeyPasskeyAvailable()) {
              console.log("[Auth] Using Turnkey passkey for non-custodial wallet");

              // Generate a challenge for passkey creation
              const challengeBytes = await Crypto.getRandomBytesAsync(32);
              const challenge = btoa(String.fromCharCode(...challengeBytes));

              // Create passkey using Turnkey's stamper
              const passkeyResult = await createPasskey({
                rpId: TURNKEY_RP_ID,
                rpName: "DisCard",
                userName: displayName || "DisCard User",
                userDisplayName: displayName || "DisCard User",
                challenge,
                // Use platform authenticator (biometric)
                authenticatorSelection: {
                  authenticatorAttachment: "platform",
                  residentKey: "required",
                  userVerification: "required",
                },
              });

              console.log("[Auth] Passkey created, attestation received");

              // Register with Turnkey using passkey attestation (non-custodial)
              const result = await registerWithTurnkeyAction({
                credentialId,
                displayName,
                existingSolanaAddress, // For account recovery
                deviceInfo: {
                  platform: Platform.OS,
                },
                passkey: {
                  authenticatorName: `${Platform.OS}-passkey-${Date.now()}`,
                  challenge: passkeyResult.encodedChallenge || challenge,
                  attestation: {
                    credentialId: passkeyResult.attestation.credentialId,
                    clientDataJson: passkeyResult.attestation.clientDataJson,
                    attestationObject: passkeyResult.attestation.attestationObject,
                    transports: passkeyResult.attestation.transports || ["AUTHENTICATOR_TRANSPORT_INTERNAL"],
                  },
                },
              });

              userId = result.userId;
              solanaAddress = result.solanaAddress;
              ethereumAddress = result.ethereumAddress;

              console.log("[Auth] Non-custodial Turnkey registration successful:", {
                userId,
                solanaAddress,
                ethereumAddress,
                isExistingUser: result.isExistingUser,
                isRecoveredAccount: result.isRecoveredAccount,
              });
            } else {
              throw new Error("Turnkey passkey stamper not available");
            }
          } catch (turnkeyError: any) {
            // Turnkey/Convex unavailable - fall back to local wallet generation
            console.warn("[Auth] Turnkey unavailable, falling back to local keypair:", {
              error: turnkeyError?.message || turnkeyError,
            });

            // Use existing wallet if available (for recovery), otherwise generate new mnemonic wallet
            let walletPublicKey: string;
            if (existingSolanaAddress) {
              console.log("[Auth] Using existing Solana wallet for recovery:", existingSolanaAddress);
              walletPublicKey = existingSolanaAddress;
            } else {
              // Generate mnemonic-based wallet (enables cloud backup)
              console.log("[Auth] No existing wallet, generating new mnemonic wallet");
              const wallet = await generateMnemonicSolanaWallet();
              walletPublicKey = wallet.publicKey;
              // Note: User should be prompted to back up their seed phrase!
            }
            solanaAddress = walletPublicKey;

            // Register with Convex - will recover account if address exists in DB
            try {
              const result = await registerBiometricMutation({
                credentialId,
                displayName,
                solanaAddress: walletPublicKey,
                deviceInfo: {
                  platform: Platform.OS,
                },
              });
              userId = result.userId;
              solanaAddress = result.solanaAddress || walletPublicKey;

              if (result.isRecoveredAccount) {
                console.log("[Auth] Account recovered via Solana address!");
              }
            } catch (convexError) {
              // Complete offline - use local-only mode
              console.warn("[Auth] Convex unavailable, using local-only mode:", convexError);
              userId = `local_${Date.now()}`;
              await storage.setItem("pending_sync", "true");
            }
          }

          // Store credentials locally
          await storage.setItem(USER_ID_KEY, userId);
          await storeCredential({
            credentialId,
            userId,
            publicKey: solanaAddress,
          });

          setState((prev) => ({
            ...prev,
            userId: userId as Id<"users">,
            credentialId,
            user: {
              id: userId,
              displayName: displayName,
              solanaAddress: solanaAddress,
              ethereumAddress: ethereumAddress,
              kycStatus: "none",
              createdAt: Date.now(),
            },
            isAuthenticated: true,
            error: null,
          }));

          console.log("[Auth] Registration successful:", {
            userId,
            solanaAddress,
            ethereumAddress,
            isTurnkeyWallet: !userId.startsWith("local_"),
          });
          return true;
        }

        if (useStoredAuthOnly) {
          console.log("[Auth] No biometrics available, using stored credentials only");

          // Generate credentials without biometric check (dev/emulator only)
          const userId = `dev_user_${Date.now()}`;
          const credentialId = `dev_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

          await storage.setItem(USER_ID_KEY, userId);
          await storeCredential({
            credentialId,
            userId,
            publicKey: "dev_key_no_biometrics",
          });

          setState((prev) => ({
            ...prev,
            userId: userId as Id<"users">,
            credentialId,
            user: {
              id: userId,
              displayName: displayName,
              solanaAddress: "DevWa11et123456789abcdefghij",
              kycStatus: "pending",
              createdAt: Date.now(),
            },
            isAuthenticated: true,
            error: null,
          }));

          console.log("[Auth] Dev registration (no biometrics):", userId);
          return true;
        }

        // PRODUCTION: Use real passkey authentication
        // Try passkey first, fall back to biometric if it fails (e.g., domain not configured)
        try {
          console.log("[Auth] Attempting native passkey registration...");

          // Generate challenge and user ID
          const challenge = await generateChallenge();
          const webauthnUserId = await generateUserId();

          // Create passkey using v3 API (Passkey.create instead of Passkey.register)
          const registrationResult = await Passkey.create({
            challenge,
            rp: {
              id: RP_CONFIG.id,
              name: RP_CONFIG.name,
            },
            user: {
              id: webauthnUserId,
              name: displayName,
              displayName: displayName,
            },
            pubKeyCredParams: [
              { alg: -7, type: "public-key" }, // ES256 (P-256)
            ],
            authenticatorSelection: {
              authenticatorAttachment: "platform",
              residentKey: "required",
              userVerification: "required",
            },
            timeout: 60000,
            attestation: "none",
          });

          // Generate a mnemonic-based Solana wallet for this user (enables cloud backup)
          // Note: For TEE-managed wallets, use the Turnkey flow instead
          const wallet = await generateMnemonicSolanaWallet();
          console.log("[Auth] Generated mnemonic wallet for passkey user:", wallet.publicKey);
          // Note: User should be prompted to back up their seed phrase!

          // Register with Convex
          // Convert base64url public key to ArrayBuffer for Convex v.bytes() validator
          const publicKeyBase64url = registrationResult.response.publicKey || "";
          // Convert base64url to standard base64 (replace - with +, _ with /, add padding)
          let publicKeyBase64 = publicKeyBase64url.replace(/-/g, '+').replace(/_/g, '/');
          while (publicKeyBase64.length % 4) publicKeyBase64 += '=';
          const publicKeyBytes = publicKeyBase64
            ? Uint8Array.from(atob(publicKeyBase64), c => c.charCodeAt(0)).buffer
            : new ArrayBuffer(0);

          const result = await registerPasskeyMutation({
            credentialId: registrationResult.id,
            publicKey: publicKeyBytes,
            displayName,
            solanaAddress: wallet.publicKey, // Pass real wallet address
          });

          // Store credentials
          await storage.setItem(USER_ID_KEY, result.userId);
          await storeCredential({
            credentialId: registrationResult.id,
            userId: result.userId,
            publicKey: registrationResult.response.publicKey,
          });

          setState((prev) => ({
            ...prev,
            userId: result.userId as Id<"users">,
            credentialId: registrationResult.id,
            isAuthenticated: true,
            error: null,
          }));

          return true;
        } catch (passkeyError: any) {
          // Passkey failed (likely domain not configured) - fall back to biometric auth
          console.warn("[Auth] Passkey registration failed, falling back to biometric:", {
            error: passkeyError?.message || passkeyError?.error || passkeyError,
          });

          // Check biometric support for fallback
          const hasHardware = await LocalAuthentication.hasHardwareAsync();
          const isEnrolled = await LocalAuthentication.isEnrolledAsync();

          if (!hasHardware || !isEnrolled) {
            throw new Error("Passkey registration failed and biometrics not available");
          }

          // Authenticate with biometrics
          const biometricResult = await LocalAuthentication.authenticateAsync({
            promptMessage: "Authenticate to create your DisCard account",
            fallbackLabel: "Use passcode",
            disableDeviceFallback: false,
          });

          if (!biometricResult.success) {
            const errorMsg = 'error' in biometricResult ? biometricResult.error : "Biometric authentication failed";
            throw new Error(errorMsg || "Biometric authentication failed");
          }

          // Generate credential ID for biometric auth
          const credentialId = await generateCredentialId();
          await storage.setItem(CREDENTIAL_ID_KEY, credentialId);

          // Generate mnemonic wallet
          const wallet = await generateMnemonicSolanaWallet();
          console.log("[Auth] Generated mnemonic wallet (biometric fallback):", wallet.publicKey);

          // Register with Convex
          let userId: string;
          let solanaAddress = wallet.publicKey;

          try {
            const result = await registerBiometricMutation({
              credentialId,
              displayName,
              solanaAddress: wallet.publicKey,
              deviceInfo: {
                platform: Platform.OS,
              },
            });
            userId = result.userId;
            solanaAddress = result.solanaAddress || wallet.publicKey;
          } catch (convexError) {
            console.warn("[Auth] Convex unavailable, using local-only mode:", convexError);
            userId = `local_${Date.now()}`;
            await storage.setItem("pending_sync", "true");
          }

          // Store credentials
          await storage.setItem(USER_ID_KEY, userId);
          await storeCredential({
            credentialId,
            userId,
            publicKey: solanaAddress,
          });

          setState((prev) => ({
            ...prev,
            userId: userId as Id<"users">,
            credentialId,
            user: {
              id: userId,
              displayName: displayName,
              solanaAddress: solanaAddress,
              kycStatus: "none",
              createdAt: Date.now(),
            },
            isAuthenticated: true,
            error: null,
          }));

          console.log("[Auth] Biometric fallback registration successful:", {
            userId,
            solanaAddress,
          });
          return true;
        }
      } catch (error) {
        // Enhanced error logging for passkey failures
        console.error("[Auth] Registration error:", {
          error,
          errorType: typeof error,
          errorName: error instanceof Error ? error.name : "unknown",
          errorMessage: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
        });

        let message = "Registration failed";
        if (error instanceof Error && error.message) {
          message = error.message;
        } else if (typeof error === "string") {
          message = error;
        } else if (error && typeof error === "object" && "message" in error) {
          message = String((error as any).message) || "Registration failed";
        }

        // Provide helpful context for common errors
        if (message.includes("not a function") || message.includes("undefined")) {
          message = "Passkey not available. Please use a development build instead of Expo Go.";
        }

        setState((prev) => ({ ...prev, error: message }));
        return false;
      } finally {
        setState((prev) => ({ ...prev, isLoading: false }));
      }
    },

    /**
     * Logout
     */
    logout: async (): Promise<void> => {
      try {
        if (state.userId) {
          await logoutMutation();
        }
      } catch (error) {
        console.error("Logout error:", error);
      } finally {
        // Clear local storage
        await storage.deleteItem(USER_ID_KEY);
        // Optionally keep credentials for faster re-login
        // await clearStoredCredentials();

        setState({
          user: null,
          userId: null,
          credentialId: null,
          isLoading: false,
          isAuthenticated: false,
          error: null,
        });
      }
    },

    /**
     * Check if user is already authenticated
     * SECURITY: Requires biometric authentication before granting access
     */
    checkAuthStatus: async (): Promise<void> => {
      try {
        setState((prev) => ({ ...prev, isLoading: true }));

        const storedUserId = await storage.getItem(USER_ID_KEY);
        const storedCredentialId = await storage.getItem(CREDENTIAL_ID_KEY);

        if (storedUserId) {
          // Validate that the stored ID looks like a valid Convex ID
          // and isn't corrupted (e.g., from a different table)
          // Convex IDs are 32 chars and should be alphanumeric
          const isValidFormat = /^[a-z0-9]{32}$/.test(storedUserId);

          if (!isValidFormat) {
            console.warn("[Auth] Stored userId has invalid format, clearing:", storedUserId);
            await storage.deleteItem(USER_ID_KEY);
            await storage.deleteItem(CREDENTIAL_ID_KEY);
            setState((prev) => ({ ...prev, isLoading: false }));
            return;
          }

          // SECURITY: Require device authentication before granting access
          // Uses biometrics if available, falls back to device passcode
          console.log("[Auth] Stored credentials found, requiring authentication...");

          const authResult = await LocalAuthentication.authenticateAsync({
            promptMessage: "Authenticate to access DisCard",
            fallbackLabel: "Use passcode",
            disableDeviceFallback: false, // Allow passcode as fallback
          });

          if (!authResult.success) {
            // Authentication failed - don't grant access but DON'T clear credentials
            // User can retry authentication
            console.warn("[Auth] Authentication failed, access denied");
            setState((prev) => ({
              ...prev,
              isLoading: false,
              error: "Authentication required to access DisCard",
            }));
            return;
          }

          console.log("[Auth] Authentication successful, restoring session");

          setState((prev) => ({
            ...prev,
            userId: storedUserId as Id<"users">,
            credentialId: storedCredentialId,
            // isAuthenticated will be set when userData query returns
          }));
        }
      } catch (error) {
        console.error("Auth status check error:", error);
        // If there's an error checking auth, clear potentially corrupted credentials
        console.warn("[Auth] Clearing potentially corrupted credentials due to error");
        await storage.deleteItem(USER_ID_KEY);
        await storage.deleteItem(CREDENTIAL_ID_KEY);
      } finally {
        setState((prev) => ({ ...prev, isLoading: false }));
      }
    },

    // Legacy compatibility methods
    login: async (_email: string, _password: string): Promise<boolean> => {
      console.warn("Password login deprecated. Use loginWithPasskey instead.");
      return actions.loginWithPasskey();
    },

    register: async (
      _email: string,
      _password: string,
      username?: string
    ): Promise<boolean> => {
      console.warn("Password registration deprecated. Use registerWithPasskey instead.");
      return actions.registerWithPasskey(username || "User");
    },

    refreshToken: async (): Promise<boolean> => {
      // Convex handles auth automatically
      return true;
    },

    getAuthToken: async (): Promise<string | null> => {
      // Convex uses its own auth mechanism
      return state.userId || null;
    },
  };

  return (
    <AuthContext.Provider value={{ state, actions }}>
      {children}
    </AuthContext.Provider>
  );
}

// Hook to use auth state
export function useAuth(): AuthState {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context.state;
}

// Hook to use auth operations
export function useAuthOperations(): AuthActions {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuthOperations must be used within an AuthProvider");
  }
  return context.actions;
}

// Hook to get current user ID (for Convex queries)
export function useCurrentUserId(): Id<"users"> | null {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useCurrentUserId must be used within an AuthProvider");
  }
  return context.state.userId;
}

// Hook to get current credential ID (for Convex mutations that need auth)
export function useCurrentCredentialId(): string | null {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useCurrentCredentialId must be used within an AuthProvider");
  }
  return context.state.credentialId;
}

// Backwards compatibility alias
export const isMockUserId = isLocalUserId;

// Hook to check if current auth is local (biometric/dev mode, not Convex)
export function useIsLocalAuth(): boolean {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useIsLocalAuth must be used within an AuthProvider");
  }
  return isLocalUserId(context.state.userId);
}

// Backwards compatibility alias
export const useIsMockAuth = useIsLocalAuth;

// Hook to get user ID for Convex queries (returns null for local/biometric users)
// Use this when you need to pass userId to Convex queries with v.id("users") validators
export function useConvexUserId(): Id<"users"> | null {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useConvexUserId must be used within an AuthProvider");
  }
  const userId = context.state.userId;
  // Return null for local users so Convex queries are skipped
  if (isLocalUserId(userId)) {
    return null;
  }
  return userId;
}
