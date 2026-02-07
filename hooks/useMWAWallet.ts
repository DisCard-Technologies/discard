/**
 * DisCard 2035 - useMWAWallet Hook
 *
 * React hook for connecting to and interacting with Seed Vault
 * and other MWA-compatible wallets via Mobile Wallet Adapter.
 *
 * MWA is Android-only and provides hardware wallet security through
 * the device's secure element.
 */

import { useState, useCallback, useEffect, useRef } from "react";
import { Platform } from "react-native";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { PublicKey, Transaction, VersionedTransaction } from "@solana/web3.js";
import {
  isMWASupported,
  getDeviceInfo,
  storeMWASession,
  getMWASession,
  clearMWASession,
  APP_IDENTITY,
  type MWASessionInfo,
  type MWADeviceInfo,
} from "@/lib/mwa/mwa-client";

// Conditionally import MWA - only available on Android
let transact: any = null;
if (Platform.OS === "android") {
  try {
    // Dynamic import for Android only
    const mwaModule = require("@solana-mobile/mobile-wallet-adapter-protocol-web3js");
    transact = mwaModule.transact;
  } catch {
    console.log("[MWA] Mobile Wallet Adapter not available");
  }
}

// ============================================================================
// Types
// ============================================================================

export interface UseMWAWalletReturn {
  // State
  isAvailable: boolean;
  isConnected: boolean;
  isConnecting: boolean;
  walletAddress: string | null;
  walletName: string | null;
  walletId: Id<"wallets"> | null;
  error: string | null;
  deviceInfo: MWADeviceInfo;

  // Actions
  connect: (setAsPreferredSigner?: boolean) => Promise<boolean>;
  disconnect: () => Promise<void>;
  signTransaction: (
    transaction: Transaction | VersionedTransaction
  ) => Promise<SignedTransaction>;
  signMessage: (message: Uint8Array) => Promise<Uint8Array>;
  signAllTransactions: (
    transactions: (Transaction | VersionedTransaction)[]
  ) => Promise<SignedTransaction[]>;

  // Helpers
  refreshSession: () => Promise<void>;
}

export interface SignedTransaction {
  transaction: Transaction | VersionedTransaction;
  signature: Uint8Array;
}

// ============================================================================
// Hook Implementation
// ============================================================================

export function useMWAWallet(
  userId: Id<"users"> | null
): UseMWAWalletReturn {
  // State
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [session, setSession] = useState<MWASessionInfo | null>(null);
  const [deviceInfo] = useState<MWADeviceInfo>(getDeviceInfo);
  const authTokenRef = useRef<string | null>(null);

  // Convex mutations
  const connectSeedVault = useMutation(api.wallets.wallets.connectSeedVault);
  const disconnectWallet = useMutation(api.wallets.wallets.disconnect);
  const updateMwaAuthToken = useMutation(api.wallets.wallets.updateMwaAuthToken);

  // Query for existing Seed Vault wallet
  const existingWallet = useQuery(
    api.wallets.wallets.list,
    userId ? { userId } : "skip"
  );

  // Find the Seed Vault wallet from the list
  const seedVaultWallet = existingWallet?.find(
    (w: any) => w.walletType === "seed_vault" && w.connectionStatus === "connected"
  );

  // Check MWA availability
  const isAvailable = isMWASupported() && transact !== null;

  // Derived state
  const isConnected = !!seedVaultWallet || !!session;
  const walletAddress = seedVaultWallet?.address ?? session?.walletAddress ?? null;
  const walletName = seedVaultWallet?.mwaWalletName ?? session?.walletName ?? null;
  const walletId = seedVaultWallet?._id ?? null;

  // Load stored session on mount
  useEffect(() => {
    async function loadSession() {
      if (!isAvailable) return;

      const storedSession = await getMWASession();
      if (storedSession) {
        setSession(storedSession);
        authTokenRef.current = storedSession.authToken;
      }
    }

    loadSession();
  }, [isAvailable]);

  // Connect to Seed Vault via MWA
  const connect = useCallback(
    async (setAsPreferredSigner = false): Promise<boolean> => {
      if (!isAvailable || !transact) {
        setError("MWA is not supported on this device");
        return false;
      }

      if (!userId) {
        setError("Not authenticated");
        return false;
      }

      setIsConnecting(true);
      setError(null);

      try {
        // Use MWA transact to authorize with the wallet
        const result = await transact(async (wallet: any) => {
          // Authorize with the wallet
          const authResult = await wallet.authorize({
            cluster: "mainnet-beta",
            identity: APP_IDENTITY,
          });

          return {
            authToken: authResult.auth_token,
            publicKey: new PublicKey(authResult.accounts[0].address),
            walletName: authResult.wallet_uri_base
              ? new URL(authResult.wallet_uri_base).hostname
              : "Seed Vault",
          };
        });

        if (!result) {
          setError("Authorization was cancelled");
          return false;
        }

        const { authToken, publicKey, walletName: name } = result;

        // Store session locally
        const sessionInfo: MWASessionInfo = {
          authToken,
          walletAddress: publicKey.toBase58(),
          walletName: name,
        };

        await storeMWASession(sessionInfo);
        setSession(sessionInfo);
        authTokenRef.current = authToken;

        // Store in Convex
        await connectSeedVault({
          userId,
          address: publicKey.toBase58(),
          mwaAuthToken: authToken,
          mwaWalletName: name,
          setAsPreferredSigner,
        });

        return true;
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to connect";
        setError(message);
        console.error("[useMWAWallet] Connect failed:", err);
        return false;
      } finally {
        setIsConnecting(false);
      }
    },
    [isAvailable, userId, connectSeedVault]
  );

  // Disconnect from Seed Vault
  const disconnect = useCallback(async (): Promise<void> => {
    try {
      // Clear local session
      await clearMWASession();
      setSession(null);
      authTokenRef.current = null;

      // Disconnect in Convex
      if (walletId) {
        await disconnectWallet({ walletId });
      }

      // Deauthorize with MWA
      if (isAvailable && transact) {
        try {
          await transact(async (wallet: any) => {
            const currentAuthToken = authTokenRef.current;
            if (currentAuthToken) {
              await wallet.deauthorize({ auth_token: currentAuthToken });
            }
          });
        } catch {
          // Deauthorization can fail if the app was already deauthorized
          console.log("[useMWAWallet] Deauthorization skipped or failed");
        }
      }
    } catch (err) {
      console.error("[useMWAWallet] Disconnect failed:", err);
    }
  }, [isAvailable, walletId, disconnectWallet]);

  // Sign a single transaction
  const signTransaction = useCallback(
    async (
      transaction: Transaction | VersionedTransaction
    ): Promise<SignedTransaction> => {
      if (!isAvailable || !transact) {
        throw new Error("MWA is not supported on this device");
      }

      if (!session && !seedVaultWallet) {
        throw new Error("Not connected to Seed Vault");
      }

      const authToken = authTokenRef.current ?? session?.authToken;
      if (!authToken) {
        throw new Error("No auth token available");
      }

      const signedTxs = await transact(async (wallet: any) => {
        // Reauthorize if needed
        const reauth = await wallet.reauthorize({
          auth_token: authToken,
          identity: APP_IDENTITY,
        });

        // Update stored auth token if changed
        if (reauth.auth_token !== authToken) {
          authTokenRef.current = reauth.auth_token;
          if (walletId) {
            await updateMwaAuthToken({
              walletId,
              mwaAuthToken: reauth.auth_token,
            });
          }
        }

        // Sign transaction with MWA
        const signedTransactions = await wallet.signTransactions({
          transactions: [transaction],
        });

        return signedTransactions;
      });

      if (!signedTxs || signedTxs.length === 0) {
        throw new Error("Signing was cancelled");
      }

      const signedTx = signedTxs[0];

      // Extract signature from the signed transaction
      let signature: Uint8Array;
      if (signedTx instanceof VersionedTransaction) {
        signature = signedTx.signatures[0];
      } else {
        signature = signedTx.signature ?? new Uint8Array(64);
      }

      return {
        transaction: signedTx,
        signature,
      };
    },
    [isAvailable, session, seedVaultWallet, walletId, updateMwaAuthToken]
  );

  // Sign multiple transactions
  const signAllTransactions = useCallback(
    async (
      transactions: (Transaction | VersionedTransaction)[]
    ): Promise<SignedTransaction[]> => {
      if (!isAvailable || !transact) {
        throw new Error("MWA is not supported on this device");
      }

      if (!session && !seedVaultWallet) {
        throw new Error("Not connected to Seed Vault");
      }

      const authToken = authTokenRef.current ?? session?.authToken;
      if (!authToken) {
        throw new Error("No auth token available");
      }

      const signedTxs = await transact(async (wallet: any) => {
        // Reauthorize if needed
        const reauth = await wallet.reauthorize({
          auth_token: authToken,
          identity: APP_IDENTITY,
        });

        // Update stored auth token if changed
        if (reauth.auth_token !== authToken) {
          authTokenRef.current = reauth.auth_token;
          if (walletId) {
            await updateMwaAuthToken({
              walletId,
              mwaAuthToken: reauth.auth_token,
            });
          }
        }

        // Sign all transactions with MWA
        return wallet.signTransactions({ transactions });
      });

      if (!signedTxs) {
        throw new Error("Signing was cancelled");
      }

      // Extract signatures from signed transactions
      return signedTxs.map((signedTx: Transaction | VersionedTransaction) => {
        let signature: Uint8Array;
        if (signedTx instanceof VersionedTransaction) {
          signature = signedTx.signatures[0];
        } else {
          signature = signedTx.signature ?? new Uint8Array(64);
        }

        return {
          transaction: signedTx,
          signature,
        };
      });
    },
    [isAvailable, session, seedVaultWallet, walletId, updateMwaAuthToken]
  );

  // Sign a message
  const signMessage = useCallback(
    async (message: Uint8Array): Promise<Uint8Array> => {
      if (!isAvailable || !transact) {
        throw new Error("MWA is not supported on this device");
      }

      if (!session && !seedVaultWallet) {
        throw new Error("Not connected to Seed Vault");
      }

      const authToken = authTokenRef.current ?? session?.authToken;
      if (!authToken) {
        throw new Error("No auth token available");
      }

      const currentAddress = walletAddress;
      if (!currentAddress) {
        throw new Error("No wallet address available");
      }

      const signatures = await transact(async (wallet: any) => {
        // Reauthorize if needed
        const reauth = await wallet.reauthorize({
          auth_token: authToken,
          identity: APP_IDENTITY,
        });

        // Update stored auth token if changed
        if (reauth.auth_token !== authToken) {
          authTokenRef.current = reauth.auth_token;
          if (walletId) {
            await updateMwaAuthToken({
              walletId,
              mwaAuthToken: reauth.auth_token,
            });
          }
        }

        // Sign message with MWA
        return wallet.signMessages({
          addresses: [new PublicKey(currentAddress)],
          payloads: [message],
        });
      });

      if (!signatures || signatures.length === 0) {
        throw new Error("Signing was cancelled");
      }

      return signatures[0];
    },
    [isAvailable, session, seedVaultWallet, walletAddress, walletId, updateMwaAuthToken]
  );

  // Refresh session (reauthorize)
  const refreshSession = useCallback(async (): Promise<void> => {
    if (!isAvailable || !transact || !session) return;

    try {
      await transact(async (wallet: any) => {
        const reauth = await wallet.reauthorize({
          auth_token: session.authToken,
          identity: APP_IDENTITY,
        });

        // Update stored auth token if changed
        if (reauth.auth_token !== session.authToken) {
          const newSession: MWASessionInfo = {
            ...session,
            authToken: reauth.auth_token,
          };

          await storeMWASession(newSession);
          setSession(newSession);
          authTokenRef.current = reauth.auth_token;

          if (walletId) {
            await updateMwaAuthToken({
              walletId,
              mwaAuthToken: reauth.auth_token,
            });
          }
        }
      });
    } catch (err) {
      console.error("[useMWAWallet] Session refresh failed:", err);
      // Session may have expired, clear it
      await clearMWASession();
      setSession(null);
      authTokenRef.current = null;
    }
  }, [isAvailable, session, walletId, updateMwaAuthToken]);

  return {
    // State
    isAvailable,
    isConnected,
    isConnecting,
    walletAddress,
    walletName,
    walletId,
    error,
    deviceInfo,

    // Actions
    connect,
    disconnect,
    signTransaction,
    signMessage,
    signAllTransactions,

    // Helpers
    refreshSession,
  };
}

// ============================================================================
// Export Default
// ============================================================================

export default useMWAWallet;
