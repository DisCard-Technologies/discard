/**
 * DisCard 2035 - useUnifiedSigner Hook
 *
 * Unified signing abstraction that routes transaction signing to either:
 * - Turnkey TEE (default, passkey-based)
 * - Seed Vault via MWA (power user option)
 *
 * Automatically falls back to Turnkey if Seed Vault is unavailable.
 */

import { useState, useCallback, useMemo } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { Transaction, VersionedTransaction } from "@solana/web3.js";
import { useTurnkey, type UseTurnkeyConfig } from "@/hooks/useTurnkey";
import { useMWA } from "@/providers/MWAProvider";

// ============================================================================
// Types
// ============================================================================

export type SignerType = "turnkey" | "seed_vault";

export interface Signer {
  type: SignerType;
  name: string;
  address: string;
  isAvailable: boolean;
  isPreferred: boolean;
}

export interface UnifiedSignatureResult {
  /** Signed transaction */
  signedTransaction: Transaction | VersionedTransaction;
  /** Signature bytes */
  signature: Uint8Array;
  /** Which signer was used */
  signerType: SignerType;
  /** Time taken to sign (ms) */
  signTimeMs: number;
}

export interface UseUnifiedSignerOptions {
  userId: Id<"users"> | null;
  turnkeyConfig: UseTurnkeyConfig;
}

export interface UseUnifiedSignerReturn {
  // State
  isLoading: boolean;
  error: string | null;
  activeSigner: SignerType;
  activeSignerName: string;
  activeSignerAddress: string | null;

  // Available signers
  availableSigners: Signer[];
  preferredSigner: SignerType;

  // Actions
  signTransaction: (
    transaction: Transaction | VersionedTransaction
  ) => Promise<UnifiedSignatureResult>;
  signMessage: (message: Uint8Array) => Promise<Uint8Array>;
  selectSigner: (signerType: SignerType) => Promise<void>;
  setPreferredSigner: (signerType: SignerType) => Promise<void>;

  // Status
  isTurnkeyAvailable: boolean;
  isSeedVaultAvailable: boolean;
  isSeedVaultConnected: boolean;
}

// ============================================================================
// Hook Implementation
// ============================================================================

export function useUnifiedSigner(
  options: UseUnifiedSignerOptions
): UseUnifiedSignerReturn {
  const { userId, turnkeyConfig } = options;

  // State
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [manuallySelectedSigner, setManuallySelectedSigner] = useState<SignerType | null>(null);

  // Turnkey hook
  const turnkey = useTurnkey(userId, turnkeyConfig);

  // MWA context
  const mwa = useMWA();

  // Query for preferred signing wallet
  const preferredWallet = useQuery(
    api.wallets.wallets.getPreferredSigningWallet,
    userId ? { userId } : "skip"
  );

  // Mutation to set preferred signer
  const setPreferredSigningWallet = useMutation(api.wallets.wallets.setPreferredSigningWallet);

  // Determine availability
  const isTurnkeyAvailable = turnkey.isInitialized && !!turnkey.walletAddress;
  const isSeedVaultAvailable = mwa.isAvailable;
  const isSeedVaultConnected = mwa.isConnected;

  // Determine preferred signer from database
  const preferredSignerFromDb: SignerType =
    preferredWallet?.walletType === "seed_vault" ? "seed_vault" : "turnkey";

  // Determine actual preferred signer (manual selection overrides DB)
  const preferredSigner: SignerType =
    manuallySelectedSigner ?? preferredSignerFromDb;

  // Determine active signer (falls back to Turnkey if Seed Vault unavailable)
  const activeSigner: SignerType = useMemo(() => {
    if (preferredSigner === "seed_vault" && isSeedVaultConnected) {
      return "seed_vault";
    }
    return "turnkey";
  }, [preferredSigner, isSeedVaultConnected]);

  // Get active signer details
  const activeSignerName = useMemo(() => {
    if (activeSigner === "seed_vault") {
      return mwa.walletName ?? "Seed Vault";
    }
    return "Passkey Wallet";
  }, [activeSigner, mwa.walletName]);

  const activeSignerAddress = useMemo(() => {
    if (activeSigner === "seed_vault") {
      return mwa.walletAddress;
    }
    return turnkey.walletAddress;
  }, [activeSigner, mwa.walletAddress, turnkey.walletAddress]);

  // Build list of available signers
  const availableSigners: Signer[] = useMemo(() => {
    const signers: Signer[] = [];

    // Turnkey is always available if initialized
    if (isTurnkeyAvailable && turnkey.walletAddress) {
      signers.push({
        type: "turnkey",
        name: "Passkey Wallet",
        address: turnkey.walletAddress,
        isAvailable: true,
        isPreferred: preferredSigner === "turnkey",
      });
    }

    // Seed Vault is available if MWA is supported and connected
    if (isSeedVaultAvailable) {
      signers.push({
        type: "seed_vault",
        name: mwa.walletName ?? "Seed Vault",
        address: mwa.walletAddress ?? "",
        isAvailable: isSeedVaultConnected,
        isPreferred: preferredSigner === "seed_vault",
      });
    }

    return signers;
  }, [
    isTurnkeyAvailable,
    turnkey.walletAddress,
    isSeedVaultAvailable,
    isSeedVaultConnected,
    mwa.walletAddress,
    mwa.walletName,
    preferredSigner,
  ]);

  // Sign transaction using active signer
  const signTransaction = useCallback(
    async (
      transaction: Transaction | VersionedTransaction
    ): Promise<UnifiedSignatureResult> => {
      setIsLoading(true);
      setError(null);

      const startTime = Date.now();

      try {
        if (activeSigner === "seed_vault" && isSeedVaultConnected) {
          // Sign with Seed Vault via MWA
          const result = await mwa.signTransaction(transaction);

          return {
            signedTransaction: result.transaction,
            signature: result.signature,
            signerType: "seed_vault",
            signTimeMs: Date.now() - startTime,
          };
        } else {
          // Sign with Turnkey
          const result = await turnkey.signTransaction(transaction);

          // The transaction is already modified in place by Turnkey's signTransaction
          // Return the original transaction object with the signature attached
          return {
            signedTransaction: transaction,
            signature: result.signature,
            signerType: "turnkey",
            signTimeMs: Date.now() - startTime,
          };
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : "Signing failed";
        setError(message);
        throw new Error(message);
      } finally {
        setIsLoading(false);
      }
    },
    [activeSigner, isSeedVaultConnected, mwa, turnkey]
  );

  // Sign message using active signer
  const signMessage = useCallback(
    async (message: Uint8Array): Promise<Uint8Array> => {
      setIsLoading(true);
      setError(null);

      try {
        if (activeSigner === "seed_vault" && isSeedVaultConnected) {
          // Sign with Seed Vault via MWA
          return await mwa.signMessage(message);
        } else {
          // Sign with Turnkey
          const result = await turnkey.signMessage(message);
          return result.signature;
        }
      } catch (err) {
        const message_ = err instanceof Error ? err.message : "Signing failed";
        setError(message_);
        throw new Error(message_);
      } finally {
        setIsLoading(false);
      }
    },
    [activeSigner, isSeedVaultConnected, mwa, turnkey]
  );

  // Select a signer for the current session
  const selectSigner = useCallback(
    async (signerType: SignerType): Promise<void> => {
      // Validate selection
      if (signerType === "seed_vault" && !isSeedVaultConnected) {
        setError("Seed Vault is not connected");
        return;
      }

      if (signerType === "turnkey" && !isTurnkeyAvailable) {
        setError("Turnkey wallet is not available");
        return;
      }

      setManuallySelectedSigner(signerType);
      setError(null);
    },
    [isSeedVaultConnected, isTurnkeyAvailable]
  );

  // Set preferred signer (persists to database)
  const setPreferredSigner = useCallback(
    async (signerType: SignerType): Promise<void> => {
      if (!userId) {
        setError("Not authenticated");
        return;
      }

      setIsLoading(true);
      setError(null);

      try {
        if (signerType === "seed_vault") {
          // Set Seed Vault as preferred
          if (!mwa.walletId) {
            setError("Seed Vault wallet not found");
            return;
          }

          await setPreferredSigningWallet({
            userId,
            walletId: mwa.walletId,
          });
        } else {
          // Clear preferred wallet (falls back to Turnkey)
          await setPreferredSigningWallet({
            userId,
            walletId: undefined,
          });
        }

        // Update local state
        setManuallySelectedSigner(null);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to set preferred signer";
        setError(message);
      } finally {
        setIsLoading(false);
      }
    },
    [userId, mwa.walletId, setPreferredSigningWallet]
  );

  return {
    // State
    isLoading,
    error,
    activeSigner,
    activeSignerName,
    activeSignerAddress,

    // Available signers
    availableSigners,
    preferredSigner,

    // Actions
    signTransaction,
    signMessage,
    selectSigner,
    setPreferredSigner,

    // Status
    isTurnkeyAvailable,
    isSeedVaultAvailable,
    isSeedVaultConnected,
  };
}

// ============================================================================
// Export Default
// ============================================================================

export default useUnifiedSigner;
