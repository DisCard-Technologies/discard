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
import { useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import * as SecureStore from "expo-secure-store";
import { Passkey } from "react-native-passkey";
import * as LocalAuthentication from "expo-local-authentication";
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
  const logoutMutation = useMutation(api.auth.sessions.logout);

  // Get user data from Convex (reactive)
  const userData = useQuery(
    api.auth.passkeys.getUser,
    state.userId ? { userId: state.userId } : "skip"
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
     * Login with existing passkey
     */
    loginWithPasskey: async (): Promise<boolean> => {
      try {
        setState((prev) => ({ ...prev, isLoading: true, error: null }));

        // Check biometric support
        const hasHardware = await LocalAuthentication.hasHardwareAsync();
        const isEnrolled = await LocalAuthentication.isEnrolledAsync();
        const useMockAuth = !hasHardware || !isEnrolled;

        // Get stored credential
        const stored = await getStoredCredential();

        // DEV MODE: If no biometrics available (emulator), use stored mock credentials
        if (useMockAuth) {
          console.log("[DEV] Biometrics not available, using mock login");
          
          if (stored.userId) {
            setState((prev) => ({
              ...prev,
              userId: stored.userId as Id<"users">,
              user: {
                id: stored.userId,
                displayName: "Dev User",
                solanaAddress: "DevWa11et123456789abcdefghij",
                kycStatus: "pending",
                createdAt: Date.now(),
              },
              isAuthenticated: true,
              error: null,
            }));
            console.log("[DEV] Mock login successful:", stored.userId);
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
          await SecureStore.setItemAsync(USER_ID_KEY, result.userId);
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
        const message = error instanceof Error ? error.message : "Login failed";
        setState((prev) => ({ ...prev, error: message }));
        return false;
      } finally {
        setState((prev) => ({ ...prev, isLoading: false }));
      }
    },

    /**
     * Register new passkey
     */
    registerWithPasskey: async (displayName: string): Promise<boolean> => {
      try {
        setState((prev) => ({ ...prev, isLoading: true, error: null }));

        // Check biometric support
        const hasHardware = await LocalAuthentication.hasHardwareAsync();
        const isEnrolled = await LocalAuthentication.isEnrolledAsync();

        // DEV MODE: If no biometrics available (emulator), use mock auth
        const useMockAuth = !hasHardware || !isEnrolled;

        if (useMockAuth) {
          console.log("[DEV] Biometrics not available, using mock authentication");
          
          // Generate mock credentials for development (fully offline)
          const mockUserId = `mock_user_${Date.now()}`;
          const mockCredentialId = `mock_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

          // Store mock credentials locally (skip Convex for dev)
          await SecureStore.setItemAsync(USER_ID_KEY, mockUserId);
          await storeCredential({
            credentialId: mockCredentialId,
            userId: mockUserId,
            publicKey: "mock_public_key_for_development",
          });

          setState((prev) => ({
            ...prev,
            userId: mockUserId as Id<"users">,
            user: {
              id: mockUserId,
              displayName: displayName,
              solanaAddress: "DevWa11et123456789abcdefghij",
              kycStatus: "pending",
              createdAt: Date.now(),
            },
            isAuthenticated: true,
            error: null,
          }));

          console.log("[DEV] Mock user created:", mockUserId);
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
        await SecureStore.setItemAsync(USER_ID_KEY, result.userId);
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
        const message = error instanceof Error ? error.message : "Registration failed";
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
        await SecureStore.deleteItemAsync(USER_ID_KEY);
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

        const storedUserId = await SecureStore.getItemAsync(USER_ID_KEY);

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
