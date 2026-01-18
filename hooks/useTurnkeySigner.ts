/**
 * DisCard 2035 - useTurnkeySigner Hook
 *
 * Provides transaction signing via Turnkey TEE (Trusted Execution Environment).
 * This hook replaces local private keys with secure, non-custodial wallet signing.
 *
 * Features:
 * - Non-custodial: User controls their wallet via passkey
 * - Secure: Private keys never leave Turnkey's TEE
 * - Auditable: All signing operations are logged
 * - Policy-enforced: Turnkey policies can restrict operations
 */

import { useState, useCallback, useEffect } from "react";
import { useConvex, useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";

// ============================================================================
// Types
// ============================================================================

export interface TurnkeySignerState {
  /** Whether signer is ready */
  isReady: boolean;
  /** Whether signing is in progress */
  isSigning: boolean;
  /** Last signing error */
  error?: string;
  /** Sub-organization ID */
  subOrgId?: string;
  /** Wallet address */
  walletAddress?: string;
  /** Ethereum address (for MoonPay) */
  ethereumAddress?: string;
}

export interface SignTransactionRequest {
  /** Base64 or hex encoded unsigned transaction */
  unsignedTransaction: string;
  /** Optional: use a session key instead of passkey */
  sessionKeyId?: string;
}

export interface SignTransactionResult {
  /** Success status */
  success: boolean;
  /** Base64 encoded signature */
  signature?: string;
  /** Error message if failed */
  error?: string;
}

// ============================================================================
// Hook
// ============================================================================

export function useTurnkeySigner(userId?: Id<"users">) {
  const convex = useConvex();
  const [state, setState] = useState<TurnkeySignerState>({
    isReady: false,
    isSigning: false,
  });

  // Get user's Turnkey organization
  const turnkeyOrg = useQuery(
    api.tee.turnkey.getByUserId,
    userId ? { userId } : "skip"
  );

  // Update state when Turnkey org is loaded
  useEffect(() => {
    if (turnkeyOrg) {
      setState((prev) => ({
        ...prev,
        isReady: turnkeyOrg.status === "active",
        subOrgId: turnkeyOrg.subOrganizationId,
        walletAddress: turnkeyOrg.walletAddress,
        ethereumAddress: turnkeyOrg.ethereumAddress,
        error: turnkeyOrg.status !== "active"
          ? `Wallet status: ${turnkeyOrg.status}`
          : undefined,
      }));
    } else if (turnkeyOrg === null) {
      setState((prev) => ({
        ...prev,
        isReady: false,
        error: "No Turnkey wallet found. Please complete registration.",
      }));
    }
  }, [turnkeyOrg]);

  /**
   * Sign a Solana transaction via Turnkey
   *
   * This requires the user's passkey authentication.
   * The transaction is signed in Turnkey's TEE - private keys never leave the secure environment.
   */
  const signTransaction = useCallback(
    async (request: SignTransactionRequest): Promise<SignTransactionResult> => {
      if (!state.isReady || !state.subOrgId || !state.walletAddress) {
        return {
          success: false,
          error: "Signer not ready. Please ensure wallet is initialized.",
        };
      }

      setState((prev) => ({ ...prev, isSigning: true, error: undefined }));

      try {
        console.log("[TurnkeySigner] Signing transaction:", {
          walletAddress: state.walletAddress,
          hasSessionKey: !!request.sessionKeyId,
        });

        let result;

        if (request.sessionKeyId) {
          // Use session key for automated signing (auto-shield, etc.)
          result = await convex.action(api.tee.turnkey.signWithSessionKey, {
            subOrganizationId: state.subOrgId,
            sessionKeyId: request.sessionKeyId,
            walletAddress: state.walletAddress,
            unsignedTransaction: request.unsignedTransaction,
          });
        } else {
          // Use passkey for user-initiated signing
          result = await convex.action(api.tee.turnkey.signSolanaTransaction, {
            subOrganizationId: state.subOrgId,
            walletAddress: state.walletAddress,
            unsignedTransaction: request.unsignedTransaction,
          });
        }

        setState((prev) => ({ ...prev, isSigning: false }));

        console.log("[TurnkeySigner] Transaction signed successfully");

        return {
          success: true,
          signature: result.signature,
        };
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : "Signing failed";
        console.error("[TurnkeySigner] Signing failed:", error);

        setState((prev) => ({
          ...prev,
          isSigning: false,
          error: errorMessage,
        }));

        return {
          success: false,
          error: errorMessage,
        };
      }
    },
    [state.isReady, state.subOrgId, state.walletAddress, convex]
  );

  /**
   * Create a single-use deposit wallet for auto-shielding
   *
   * Returns a new wallet address with a restricted session key
   * that can only transfer to the Privacy Cash pool.
   */
  const createDepositWallet = useCallback(
    async (destinationAddress: string) => {
      if (!state.subOrgId) {
        return { success: false, error: "Signer not ready" };
      }

      try {
        console.log("[TurnkeySigner] Creating deposit wallet");

        const result = await convex.action(api.tee.turnkey.createDepositWallet, {
          subOrganizationId: state.subOrgId,
          walletName: `Deposit-${Date.now()}`,
          destinationAddress,
        });

        console.log("[TurnkeySigner] Deposit wallet created:", result.depositAddress);

        return {
          success: true,
          walletId: result.walletId,
          depositAddress: result.depositAddress,
          sessionKeyId: result.sessionKeyId,
          policyId: result.policyId,
        };
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : "Failed to create deposit wallet";
        console.error("[TurnkeySigner] Create deposit wallet failed:", error);
        return { success: false, error: errorMessage };
      }
    },
    [state.subOrgId, convex]
  );

  /**
   * Create a single-use cashout wallet for private off-ramp
   *
   * Returns a new wallet address with a restricted session key
   * that can only transfer to MoonPay's receive address.
   */
  const createCashoutWallet = useCallback(
    async (moonPayReceiveAddress: string) => {
      if (!state.subOrgId) {
        return { success: false, error: "Signer not ready" };
      }

      try {
        console.log("[TurnkeySigner] Creating cashout wallet");

        const result = await convex.action(api.tee.turnkey.createCashoutWallet, {
          subOrganizationId: state.subOrgId,
          walletName: `Cashout-${Date.now()}`,
          moonPayReceiveAddress,
        });

        console.log("[TurnkeySigner] Cashout wallet created:", result.cashoutAddress);

        return {
          success: true,
          walletId: result.walletId,
          cashoutAddress: result.cashoutAddress,
          sessionKeyId: result.sessionKeyId,
          policyId: result.policyId,
        };
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : "Failed to create cashout wallet";
        console.error("[TurnkeySigner] Create cashout wallet failed:", error);
        return { success: false, error: errorMessage };
      }
    },
    [state.subOrgId, convex]
  );

  /**
   * Revoke a session key (cleanup after use or security event)
   */
  const revokeSessionKey = useCallback(
    async (sessionKeyId: string, policyId?: string) => {
      if (!state.subOrgId) {
        return { success: false, error: "Signer not ready" };
      }

      try {
        console.log("[TurnkeySigner] Revoking session key:", sessionKeyId);

        const result = await convex.action(api.tee.turnkey.revokeSessionKey, {
          subOrganizationId: state.subOrgId,
          sessionKeyId,
          policyId,
        });

        if (result.success) {
          console.log("[TurnkeySigner] Session key revoked");
        }

        return result;
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : "Failed to revoke session key";
        console.error("[TurnkeySigner] Revoke session key failed:", error);
        return { success: false, error: errorMessage };
      }
    },
    [state.subOrgId, convex]
  );

  /**
   * Get a fake private key placeholder for libraries that require it
   *
   * IMPORTANT: This returns a zero-filled buffer that CANNOT be used for actual signing.
   * It's only for satisfying type requirements in swap/prediction libraries
   * that expect a private key but will have their signing intercepted by Turnkey.
   *
   * @deprecated Use signTransaction() directly instead
   */
  const getSigningPlaceholder = useCallback((): Uint8Array => {
    console.warn(
      "[TurnkeySigner] getSigningPlaceholder() called - this should not be used for actual signing"
    );
    return new Uint8Array(32); // Zero-filled, cannot sign anything
  }, []);

  return {
    // State
    state,
    isReady: state.isReady,
    isSigning: state.isSigning,
    walletAddress: state.walletAddress,
    ethereumAddress: state.ethereumAddress,
    subOrgId: state.subOrgId,
    error: state.error,

    // Actions
    signTransaction,
    createDepositWallet,
    createCashoutWallet,
    revokeSessionKey,

    // Compatibility
    getSigningPlaceholder,
  };
}

export default useTurnkeySigner;
