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
import { useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import * as SecureStore from "expo-secure-store";
import * as LocalAuthentication from "expo-local-authentication";
import * as Crypto from "expo-crypto";
import { Keypair } from "@solana/web3.js";
import * as bs58 from "bs58";

// Conditionally import Passkey - it may not be available in Expo Go
let Passkey: any = null;
try {
  Passkey = require("react-native-passkey").Passkey;
} catch (e) {
  console.log("[Auth] react-native-passkey not available (Expo Go mode)");
}

// Check if native passkey module is available
function isPasskeyAvailable(): boolean {
  return Passkey !== null && typeof Passkey?.register === "function";
}

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
} from "../lib/passkeys";

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

// Retrieve stored Solana wallet
async function getStoredSolanaWallet(): Promise<{ publicKey: string; secretKey: Uint8Array } | null> {
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
  solanaAddress?: string;
  kycStatus: string;
  createdAt: number;
}

// Auth state interface (compatible with legacy)
export interface AuthState {
  user: User | null;
  userId: Id<"users"> | null;
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
    isLoading: true,
    isAuthenticated: false,
    error: null,
  });

  // Convex mutations
  const registerPasskeyMutation = useMutation(api.auth.passkeys.registerPasskey);
  const verifyPasskeyMutation = useMutation(api.auth.passkeys.verifyPasskey);
  const registerBiometricMutation = useMutation(api.auth.passkeys.registerBiometric);
  const loginBiometricMutation = useMutation(api.auth.passkeys.loginBiometric);
  const logoutMutation = useMutation(api.auth.sessions.logout);

  // Get user data from Convex (reactive)
  // Skip query for legacy local IDs (bio_user_*, dev_user_*, etc.)
  const shouldQueryConvex = state.userId && !isLocalUserId(state.userId);
  const userData = useQuery(
    api.auth.passkeys.getUser,
    shouldQueryConvex ? { userId: state.userId } : "skip"
  );

  // Update user when data changes
  useEffect(() => {
    if (userData && state.userId) {
      setState((prev) => ({
        ...prev,
        user: {
          id: userData._id,
          displayName: userData.displayName,
          solanaAddress: userData.solanaAddress,
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

        // Authenticate with passkey
        const authResult = await Passkey.authenticate({
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
          challenge,
        });

        if (result.verified && result.userId) {
          // Store user ID
          await storage.setItem(USER_ID_KEY, result.userId);
          await storeCredential({
            credentialId: authResult.id,
            userId: result.userId,
          });

          setState((prev) => ({
            ...prev,
            userId: result.userId as Id<"users">,
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

        console.log("[Auth] Registration - Environment check:", {
          platform: Platform.OS,
          hasHardware,
          isEnrolled,
          passkeyAvailable,
        });

        // Use biometric registration if passkeys unavailable (Expo Go) but biometrics available
        const useBiometricAuth = !passkeyAvailable && hasHardware && isEnrolled;
        // Fall back to simple stored credentials if no biometrics
        const useStoredAuthOnly = !passkeyAvailable && (!hasHardware || !isEnrolled);

        if (useBiometricAuth) {
          console.log("[Auth] Using biometric registration (Expo Go mode)");

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

          // Generate Solana wallet
          console.log("[Auth] Generating Solana wallet...");
          const wallet = await generateAndStoreSolanaWallet();

          // Generate unique credential ID for this device
          const credentialId = await generateCredentialId();
          await storage.setItem(CREDENTIAL_ID_KEY, credentialId);

          // Try to register with Convex (creates backend user record)
          let userId: string;
          let solanaAddress = wallet.publicKey;

          try {
            console.log("[Auth] Registering with Convex...");
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
            console.log("[Auth] Convex registration successful:", userId);
          } catch (convexError) {
            // Offline or Convex unavailable - use local-only mode
            console.warn("[Auth] Convex unavailable, using local-only mode:", convexError);
            userId = `local_${Date.now()}`;
            // Mark for sync later
            await storage.setItem("pending_sync", "true");
          }

          // Store credentials locally
          await storage.setItem(USER_ID_KEY, userId);
          await storeCredential({
            credentialId,
            userId,
            publicKey: wallet.publicKey,
          });

          setState((prev) => ({
            ...prev,
            userId: userId as Id<"users">,
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

          console.log("[Auth] Biometric registration successful:", {
            userId,
            solanaAddress,
            isConvexUser: !userId.startsWith("local_"),
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
        // Generate challenge and user ID
        const challenge = await generateChallenge();
        const webauthnUserId = await generateUserId();

        // Create passkey
        const registrationResult = await Passkey.register({
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
            requireResidentKey: true,
            residentKey: "required",
            userVerification: "required",
          },
          timeout: 60000,
          attestation: "none",
        });

        // Register with Convex
        const result = await registerPasskeyMutation({
          credentialId: registrationResult.id,
          publicKey: registrationResult.response.publicKey || "",
          displayName,
          deviceInfo: {
            platform: "mobile",
            userAgent: "DisCard Mobile App",
          },
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
          isAuthenticated: true,
          error: null,
        }));

        return true;
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
          await logoutMutation({ userId: state.userId });
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
          isLoading: false,
          isAuthenticated: false,
          error: null,
        });
      }
    },

    /**
     * Check if user is already authenticated
     */
    checkAuthStatus: async (): Promise<void> => {
      try {
        setState((prev) => ({ ...prev, isLoading: true }));

        const storedUserId = await storage.getItem(USER_ID_KEY);

        if (storedUserId) {
          setState((prev) => ({
            ...prev,
            userId: storedUserId as Id<"users">,
            // isAuthenticated will be set when userData query returns
          }));
        }
      } catch (error) {
        console.error("Auth status check error:", error);
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
