/**
 * Passkey Authentication Hook
 *
 * Provides passkey-based authentication using WebAuthn P-256 keys.
 * Derives Solana addresses from P-256 public keys for seamless crypto integration.
 */
import { useState, useCallback } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Passkey, PasskeyRegistrationResult, PasskeyAuthenticationResult } from "react-native-passkey";
import * as LocalAuthentication from "expo-local-authentication";
import * as SecureStore from "expo-secure-store";

const CREDENTIAL_ID_KEY = "discard_credential_id";
const RP_ID = "discard.app";
const RP_NAME = "DisCard";

interface UsePasskeyAuthReturn {
  isAuthenticated: boolean;
  isLoading: boolean;
  user: any | null;
  error: string | null;
  register: (displayName: string) => Promise<boolean>;
  login: () => Promise<boolean>;
  logout: () => Promise<void>;
  checkBiometricSupport: () => Promise<boolean>;
}

export function usePasskeyAuth(): UsePasskeyAuthReturn {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);

  // Convex mutations
  const registerPasskey = useMutation(api.auth.passkeys.registerPasskey);
  const verifyPasskey = useMutation(api.auth.passkeys.verifyPasskey);
  const logoutMutation = useMutation(api.auth.sessions.logout);

  // Get current user if we have a userId
  const user = useQuery(
    api.auth.passkeys.getUser,
    userId ? { userId: userId as any } : "skip"
  );

  const isAuthenticated = !!userId && !!user;

  /**
   * Check if device supports biometric authentication
   */
  const checkBiometricSupport = useCallback(async (): Promise<boolean> => {
    try {
      const hasHardware = await LocalAuthentication.hasHardwareAsync();
      const isEnrolled = await LocalAuthentication.isEnrolledAsync();
      return hasHardware && isEnrolled;
    } catch {
      return false;
    }
  }, []);

  /**
   * Register a new passkey
   */
  const register = useCallback(
    async (displayName: string): Promise<boolean> => {
      setIsLoading(true);
      setError(null);

      try {
        // Check biometric support
        const hasBiometric = await checkBiometricSupport();
        if (!hasBiometric) {
          throw new Error("Device does not support biometric authentication");
        }

        // Generate challenge
        const challenge = generateChallenge();

        // Create passkey registration request
        const registrationResult: PasskeyRegistrationResult = await Passkey.register({
          challenge: challenge,
          rp: {
            id: RP_ID,
            name: RP_NAME,
          },
          user: {
            id: generateUserId(),
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

        // Extract credential data
        const credentialId = registrationResult.id;
        const publicKey = registrationResult.response.publicKey || "";

        // Store credential ID locally
        await SecureStore.setItemAsync(CREDENTIAL_ID_KEY, credentialId);

        // Register with Convex backend
        const result = await registerPasskey({
          credentialId,
          publicKey,
          displayName,
          deviceInfo: {
            platform: "mobile",
            userAgent: "DisCard Mobile App",
          },
        });

        setUserId(result.userId);
        return true;
      } catch (err) {
        const message = err instanceof Error ? err.message : "Registration failed";
        setError(message);
        return false;
      } finally {
        setIsLoading(false);
      }
    },
    [registerPasskey, checkBiometricSupport]
  );

  /**
   * Login with existing passkey
   */
  const login = useCallback(async (): Promise<boolean> => {
    setIsLoading(true);
    setError(null);

    try {
      // Get stored credential ID
      const storedCredentialId = await SecureStore.getItemAsync(CREDENTIAL_ID_KEY);

      // Generate challenge
      const challenge = generateChallenge();

      // Authenticate with passkey
      const authResult: PasskeyAuthenticationResult = await Passkey.authenticate({
        challenge: challenge,
        rpId: RP_ID,
        allowCredentials: storedCredentialId
          ? [{ id: storedCredentialId, type: "public-key" }]
          : undefined,
        userVerification: "required",
        timeout: 60000,
      });

      // Verify with Convex backend
      const result = await verifyPasskey({
        credentialId: authResult.id,
        signature: authResult.response.signature,
        authenticatorData: authResult.response.authenticatorData,
        clientDataJSON: authResult.response.clientDataJSON,
        challenge,
      });

      if (result.verified) {
        setUserId(result.userId);

        // Update stored credential ID
        await SecureStore.setItemAsync(CREDENTIAL_ID_KEY, authResult.id);
        return true;
      } else {
        throw new Error("Passkey verification failed");
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Login failed";
      setError(message);
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [verifyPasskey]);

  /**
   * Logout current session
   */
  const logout = useCallback(async (): Promise<void> => {
    try {
      if (userId) {
        await logoutMutation({ userId: userId as any });
      }
    } finally {
      setUserId(null);
      // Clear stored credential (optional - keep for faster re-login)
      // await SecureStore.deleteItemAsync(CREDENTIAL_ID_KEY);
    }
  }, [userId, logoutMutation]);

  return {
    isAuthenticated,
    isLoading,
    user: user ?? null,
    error,
    register,
    login,
    logout,
    checkBiometricSupport,
  };
}

/**
 * Generate a random challenge for WebAuthn
 */
function generateChallenge(): string {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return btoa(String.fromCharCode(...array));
}

/**
 * Generate a user ID for WebAuthn
 */
function generateUserId(): string {
  const array = new Uint8Array(16);
  crypto.getRandomValues(array);
  return btoa(String.fromCharCode(...array));
}
