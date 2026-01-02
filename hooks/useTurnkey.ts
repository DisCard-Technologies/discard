/**
 * DisCard 2035 - useTurnkey Hook
 *
 * React hook for interacting with Turnkey TEE-protected wallets
 * and biometric authentication.
 */

import { useState, useCallback, useEffect } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import {
  TurnkeyManager,
  getTurnkeyManager,
  initializeTurnkeyManager,
  type SubOrganization,
  type PolicyConfig,
  type SignatureResult,
} from "@/lib/tee/turnkey-client";
import {
  DisCardStamper,
  getStamper,
  initializeStamper,
} from "@/lib/tee/stamper";
import { Transaction, VersionedTransaction } from "@solana/web3.js";

// ============================================================================
// Types
// ============================================================================

export interface UseTurnkeyConfig {
  organizationId: string;
  rpId: string;
  apiBaseUrl?: string;
}

export interface UseTurnkeyReturn {
  // State
  isInitialized: boolean;
  isLoading: boolean;
  error: string | null;
  subOrg: SubOrganizationData | null;
  walletAddress: string | null;
  spending: SpendingData | null;

  // Actions
  initialize: () => Promise<void>;
  createSubOrganization: (displayName: string) => Promise<SubOrganization>;
  signTransaction: (
    transaction: Transaction | VersionedTransaction
  ) => Promise<SignatureResult>;
  signMessage: (message: Uint8Array) => Promise<SignatureResult>;
  updatePolicies: (policies: Partial<PolicyConfig>) => Promise<void>;
  updateVelocityLimits: (limits: VelocityLimits) => Promise<void>;
  checkCanTransact: (amount: number) => Promise<VelocityCheckResult>;
  refreshSpending: () => Promise<void>;

  // Biometric
  authenticate: () => Promise<boolean>;
  isWebAuthnSupported: boolean;
  isPlatformAuthenticatorAvailable: boolean;
}

export interface SubOrganizationData {
  id: Id<"turnkeyOrganizations">;
  subOrganizationId: string;
  walletAddress: string;
  walletPublicKey: string;
  status: "creating" | "active" | "suspended" | "frozen";
  policies: PolicyConfig;
}

export interface SpendingData {
  daily: number;
  weekly: number;
  monthly: number;
  limits: VelocityLimits;
}

export interface VelocityLimits {
  perTransaction: number;
  daily: number;
  weekly: number;
  monthly: number;
}

export interface VelocityCheckResult {
  allowed: boolean;
  reason?: string;
}

// ============================================================================
// Hook Implementation
// ============================================================================

export function useTurnkey(
  userId: Id<"users"> | null,
  config: UseTurnkeyConfig
): UseTurnkeyReturn {
  // State
  const [isInitialized, setIsInitialized] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [turnkeyManager, setTurnkeyManager] = useState<TurnkeyManager | null>(null);
  const [stamper, setStamper] = useState<DisCardStamper | null>(null);
  const [isPlatformAuthenticatorAvailable, setIsPlatformAuthenticatorAvailable] = useState(false);

  // Convex queries
  const subOrgData = useQuery(
    api.tee.turnkey.getByUserId,
    userId ? { userId } : "skip"
  );
  const spendingData = useQuery(
    api.tee.turnkey.getCurrentSpending,
    userId ? { userId } : "skip"
  );

  // Convex mutations
  const createSubOrgMutation = useMutation(api.tee.turnkey.create);
  const activateSubOrgMutation = useMutation(api.tee.turnkey.activate);
  const updatePoliciesMutation = useMutation(api.tee.turnkey.updatePolicies);
  const updateVelocityLimitsMutation = useMutation(api.tee.turnkey.updateVelocityLimits);
  const recordSpendingMutation = useMutation(api.tee.turnkey.recordSpending);

  // Check WebAuthn support
  const isWebAuthnSupported = DisCardStamper.isSupported();

  // Check platform authenticator availability on mount
  useEffect(() => {
    DisCardStamper.isPlatformAuthenticatorAvailable().then(
      setIsPlatformAuthenticatorAvailable
    );
  }, []);

  // Initialize Turnkey and stamper
  const initialize = useCallback(async () => {
    if (isInitialized) return;

    try {
      setIsLoading(true);
      setError(null);

      // Initialize Turnkey manager
      const manager = initializeTurnkeyManager({
        organizationId: config.organizationId,
        rpId: config.rpId,
        apiBaseUrl: config.apiBaseUrl,
      });
      await manager.initialize();
      setTurnkeyManager(manager);

      // Initialize stamper
      const s = initializeStamper({
        rpId: config.rpId,
      });
      setStamper(s);

      setIsInitialized(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Initialization failed");
    } finally {
      setIsLoading(false);
    }
  }, [config, isInitialized]);

  // Create sub-organization
  const createSubOrganization = useCallback(
    async (displayName: string): Promise<SubOrganization> => {
      if (!turnkeyManager || !userId) {
        throw new Error("Not initialized or no user");
      }

      setIsLoading(true);
      setError(null);

      try {
        // Create in Turnkey
        const subOrg = await turnkeyManager.createSubOrganization(
          userId,
          displayName
        );

        // Store in Convex
        const id = await createSubOrgMutation({
          userId,
          subOrganizationId: subOrg.subOrganizationId,
          rootUserId: subOrg.rootUserId,
          serviceUserId: subOrg.serviceUserId,
          walletId: subOrg.walletId,
          walletAddress: subOrg.walletAddress,
          walletPublicKey: subOrg.walletPublicKey,
          ethereumAddress: subOrg.ethereumAddress,
        });

        // Activate
        await activateSubOrgMutation({ id });

        return subOrg;
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to create sub-organization";
        setError(message);
        throw new Error(message);
      } finally {
        setIsLoading(false);
      }
    },
    [turnkeyManager, userId, createSubOrgMutation, activateSubOrgMutation]
  );

  // Sign transaction
  const signTransaction = useCallback(
    async (
      transaction: Transaction | VersionedTransaction
    ): Promise<SignatureResult> => {
      if (!turnkeyManager || !subOrgData) {
        throw new Error("Not initialized or no sub-organization");
      }

      if (subOrgData.status !== "active") {
        throw new Error(`Sub-organization is ${subOrgData.status}`);
      }

      setIsLoading(true);
      setError(null);

      try {
        const result = await turnkeyManager.signTransaction(
          subOrgData.subOrganizationId,
          subOrgData.walletAddress,
          transaction
        );

        return result;
      } catch (err) {
        const message = err instanceof Error ? err.message : "Signing failed";
        setError(message);
        throw new Error(message);
      } finally {
        setIsLoading(false);
      }
    },
    [turnkeyManager, subOrgData]
  );

  // Sign message
  const signMessage = useCallback(
    async (message: Uint8Array): Promise<SignatureResult> => {
      if (!turnkeyManager || !subOrgData) {
        throw new Error("Not initialized or no sub-organization");
      }

      setIsLoading(true);
      setError(null);

      try {
        const result = await turnkeyManager.signMessage(
          subOrgData.subOrganizationId,
          subOrgData.walletAddress,
          message
        );

        return result;
      } catch (err) {
        const message = err instanceof Error ? err.message : "Signing failed";
        setError(message);
        throw new Error(message);
      } finally {
        setIsLoading(false);
      }
    },
    [turnkeyManager, subOrgData]
  );

  // Update policies
  const updatePolicies = useCallback(
    async (policies: Partial<PolicyConfig>): Promise<void> => {
      if (!subOrgData) {
        throw new Error("No sub-organization");
      }

      setIsLoading(true);
      setError(null);

      try {
        const currentPolicies = subOrgData.policies;
        const updatedPolicies = {
          ...currentPolicies,
          ...policies,
        };

        await updatePoliciesMutation({
          id: subOrgData._id,
          policies: updatedPolicies,
        });

        // Also update in Turnkey
        if (turnkeyManager) {
          await turnkeyManager.updatePolicies(
            subOrgData.subOrganizationId,
            updatedPolicies
          );
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to update policies";
        setError(message);
        throw new Error(message);
      } finally {
        setIsLoading(false);
      }
    },
    [subOrgData, turnkeyManager, updatePoliciesMutation]
  );

  // Update velocity limits
  const updateVelocityLimits = useCallback(
    async (limits: VelocityLimits): Promise<void> => {
      if (!subOrgData) {
        throw new Error("No sub-organization");
      }

      setIsLoading(true);
      setError(null);

      try {
        await updateVelocityLimitsMutation({
          id: subOrgData._id,
          velocityLimits: limits,
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to update limits";
        setError(message);
        throw new Error(message);
      } finally {
        setIsLoading(false);
      }
    },
    [subOrgData, updateVelocityLimitsMutation]
  );

  // Check if transaction is allowed
  const checkCanTransact = useCallback(
    async (amount: number): Promise<VelocityCheckResult> => {
      if (!spendingData) {
        return { allowed: false, reason: "No spending data available" };
      }

      const { spending, limits } = spendingData;

      // Check per-transaction limit
      if (amount > limits.perTransaction) {
        return {
          allowed: false,
          reason: `Amount exceeds per-transaction limit of $${limits.perTransaction / 100}`,
        };
      }

      // Check daily limit
      if (spending.daily + amount > limits.daily) {
        return {
          allowed: false,
          reason: `Amount would exceed daily limit of $${limits.daily / 100}`,
        };
      }

      // Check weekly limit
      if (spending.weekly + amount > limits.weekly) {
        return {
          allowed: false,
          reason: `Amount would exceed weekly limit of $${limits.weekly / 100}`,
        };
      }

      // Check monthly limit
      if (spending.monthly + amount > limits.monthly) {
        return {
          allowed: false,
          reason: `Amount would exceed monthly limit of $${limits.monthly / 100}`,
        };
      }

      return { allowed: true };
    },
    [spendingData]
  );

  // Refresh spending data (no-op, Convex handles this)
  const refreshSpending = useCallback(async () => {
    // Convex automatically keeps the query up to date
  }, []);

  // Biometric authentication
  const authenticate = useCallback(async (): Promise<boolean> => {
    if (!stamper) {
      return false;
    }

    try {
      await stamper.authenticate();
      return true;
    } catch {
      return false;
    }
  }, [stamper]);

  // Transform query data
  const subOrg: SubOrganizationData | null = subOrgData
    ? {
        id: subOrgData._id,
        subOrganizationId: subOrgData.subOrganizationId,
        walletAddress: subOrgData.walletAddress,
        walletPublicKey: subOrgData.walletPublicKey,
        status: subOrgData.status,
        policies: subOrgData.policies,
      }
    : null;

  const spending: SpendingData | null = spendingData
    ? {
        daily: spendingData.spending.daily,
        weekly: spendingData.spending.weekly,
        monthly: spendingData.spending.monthly,
        limits: spendingData.limits,
      }
    : null;

  return {
    // State
    isInitialized,
    isLoading,
    error,
    subOrg,
    walletAddress: subOrg?.walletAddress ?? null,
    spending,

    // Actions
    initialize,
    createSubOrganization,
    signTransaction,
    signMessage,
    updatePolicies,
    updateVelocityLimits,
    checkCanTransact,
    refreshSpending,

    // Biometric
    authenticate,
    isWebAuthnSupported,
    isPlatformAuthenticatorAvailable,
  };
}

// ============================================================================
// Export Default
// ============================================================================

export default useTurnkey;
