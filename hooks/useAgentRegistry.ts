/**
 * Agent Registry Hook
 *
 * React hook for AI agent CRUD with real-time E2EE.
 * Subscribes to encrypted agent records via Convex and decrypts client-side.
 *
 * Pattern from: useTokenHoldings.ts (useQuery + client processing),
 * useCards.ts (useMutation/useAction wiring)
 */

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useQuery, useMutation, useAction } from 'convex/react';
import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import {
  deriveAgentEncryptionKey,
  decryptAgentRecord,
} from '@/lib/agents/agent-encryption';
import {
  AgentRegistry,
  initializeAgentRegistry,
} from '@/lib/agents/agent-registry';
import type {
  AgentRecord,
  AgentPermissions,
  AgentStatus,
} from '@/lib/agents/types';
import type { ConvexAgentActions } from '@/lib/agents/agent-registry';

// ============================================================================
// Types
// ============================================================================

interface UseAgentRegistryOptions {
  /** User's wallet private key for E2EE */
  userPrivateKey?: Uint8Array;
  /** Turnkey sub-organization ID */
  subOrgId?: string;
  /** User's wallet public key (base58) */
  walletPubkey?: string;
}

interface UseAgentRegistryReturn {
  /** Decrypted agent records */
  agents: AgentRecord[];
  /** Loading state */
  isLoading: boolean;
  /** Error state */
  error: string | null;
  /** Create a new agent */
  createAgent: (
    name: string,
    description: string,
    permissions: AgentPermissions
  ) => Promise<AgentRecord | null>;
  /** Suspend an agent temporarily */
  suspendAgent: (agentId: string) => Promise<void>;
  /** Revoke an agent permanently */
  revokeAgent: (agentId: string) => Promise<void>;
  /** Update agent permissions */
  updatePermissions: (
    agentId: string,
    newPermissions: AgentPermissions
  ) => Promise<AgentRecord | null>;
  /** Execute an operation via TEE fast path */
  executeOperation: (
    agentId: string,
    operationType: string,
    walletAddress: string,
    unsignedTransaction: string
  ) => Promise<{ signature: string; signedTransaction: string } | null>;
}

// ============================================================================
// Hook
// ============================================================================

export function useAgentRegistry(
  userId: Id<"users"> | null,
  options: UseAgentRegistryOptions = {}
): UseAgentRegistryReturn {
  const { userPrivateKey, subOrgId, walletPubkey } = options;

  const [decryptedAgents, setDecryptedAgents] = useState<AgentRecord[]>([]);
  const [isDecrypting, setIsDecrypting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const registryRef = useRef<AgentRegistry | null>(null);

  // Real-time subscription to encrypted agent records
  const encryptedAgents = useQuery(
    api.agents.agents.getActiveByUser,
    userId ? { userId } : 'skip'
  );

  // Mutations
  const createMutation = useMutation(api.agents.agents.create);
  const activateMutation = useMutation(api.agents.agents.activate);
  const updateRecordMutation = useMutation(api.agents.agents.updateRecord);
  const cacheProofMutation = useMutation(api.agents.agents.cacheProof);
  const suspendMutation = useMutation(api.agents.agents.suspend);
  const revokeMutation = useMutation(api.agents.agents.revoke);
  const logOperationMutation = useMutation(api.agents.agents.logOperation);

  // Compressed account mutations
  const createAgentAccountMutation = useMutation(
    api.compression.light.createAgentAccount
  );
  const revokeAgentAccountMutation = useMutation(
    api.compression.light.revokeAgentAccount
  );

  // Initialize registry when private key is available
  useEffect(() => {
    if (!userId || !userPrivateKey) {
      registryRef.current = null;
      return;
    }

    // Build Convex actions interface
    const convexActions: ConvexAgentActions = {
      create: (args) => createMutation(args),
      activate: (args) => activateMutation(args),
      updateRecord: (args) => updateRecordMutation(args),
      cacheProof: (args) => cacheProofMutation(args),
      suspend: (args) => suspendMutation(args),
      revoke: (args) => revokeMutation(args),
      logOperation: (args) => logOperationMutation(args),
      getActiveByUser: async () => encryptedAgents ?? [],
      getByAgentId: async ({ agentId }) => {
        const found = encryptedAgents?.find((a: any) => a.agentId === agentId);
        return found ?? null;
      },
      createAgentAccount: (args) => createAgentAccountMutation(args),
      revokeAgentAccount: (args) => revokeAgentAccountMutation(args),
      // TEE actions are called via the registry internally
      createAgentSessionKey: async () => {
        throw new Error('TEE session key creation requires server-side action');
      },
      verifyAndSignWithAgent: async () => {
        throw new Error('TEE verification requires server-side action');
      },
      revokeAgentSessionKey: async () => {
        throw new Error('TEE session key revocation requires server-side action');
      },
    };

    registryRef.current = initializeAgentRegistry({
      userId,
      userPrivateKey,
      convex: convexActions,
    });
  }, [userId, userPrivateKey]);

  // Decrypt records when subscription data changes
  useEffect(() => {
    if (!encryptedAgents || !userPrivateKey) {
      setDecryptedAgents([]);
      return;
    }

    let cancelled = false;

    const decryptAll = async () => {
      setIsDecrypting(true);
      try {
        const key = await deriveAgentEncryptionKey(userPrivateKey);
        const decrypted: AgentRecord[] = [];

        for (const agent of encryptedAgents) {
          try {
            const record = decryptAgentRecord(
              agent.encryptedRecord,
              key
            );
            decrypted.push(record);
          } catch (err) {
            console.error(
              `[useAgentRegistry] Failed to decrypt agent ${agent.agentId}:`,
              err
            );
          }
        }

        if (!cancelled) {
          setDecryptedAgents(decrypted);
          setError(null);
        }
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : 'Failed to decrypt agents'
          );
        }
      } finally {
        if (!cancelled) {
          setIsDecrypting(false);
        }
      }
    };

    decryptAll();

    return () => {
      cancelled = true;
    };
  }, [encryptedAgents, userPrivateKey]);

  // Create agent
  const createAgent = useCallback(
    async (
      name: string,
      description: string,
      permissions: AgentPermissions
    ): Promise<AgentRecord | null> => {
      if (!registryRef.current || !subOrgId || !walletPubkey) {
        setError('Registry not initialized or missing config');
        return null;
      }

      try {
        setError(null);
        const record = await registryRef.current.createAgent(
          name,
          description,
          permissions,
          subOrgId,
          walletPubkey
        );
        return record;
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to create agent';
        setError(message);
        console.error('[useAgentRegistry] Create failed:', err);
        return null;
      }
    },
    [subOrgId, walletPubkey]
  );

  // Suspend agent
  const suspendAgent = useCallback(
    async (agentId: string): Promise<void> => {
      if (!registryRef.current) {
        setError('Registry not initialized');
        return;
      }

      try {
        setError(null);
        await registryRef.current.suspendAgent(agentId);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to suspend agent';
        setError(message);
        console.error('[useAgentRegistry] Suspend failed:', err);
      }
    },
    []
  );

  // Revoke agent
  const revokeAgent = useCallback(
    async (agentId: string): Promise<void> => {
      if (!registryRef.current || !subOrgId) {
        setError('Registry not initialized');
        return;
      }

      try {
        setError(null);
        await registryRef.current.revokeAgent(agentId, subOrgId);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to revoke agent';
        setError(message);
        console.error('[useAgentRegistry] Revoke failed:', err);
      }
    },
    [subOrgId]
  );

  // Update permissions
  const updatePermissions = useCallback(
    async (
      agentId: string,
      newPermissions: AgentPermissions
    ): Promise<AgentRecord | null> => {
      if (!registryRef.current || !subOrgId) {
        setError('Registry not initialized');
        return null;
      }

      try {
        setError(null);
        const updated = await registryRef.current.updatePermissions(
          agentId,
          newPermissions,
          subOrgId
        );
        return updated;
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to update permissions';
        setError(message);
        console.error('[useAgentRegistry] Update failed:', err);
        return null;
      }
    },
    [subOrgId]
  );

  // Execute operation via TEE fast path
  const executeOperation = useCallback(
    async (
      agentId: string,
      operationType: string,
      walletAddress: string,
      unsignedTransaction: string
    ): Promise<{ signature: string; signedTransaction: string } | null> => {
      if (!registryRef.current || !subOrgId) {
        setError('Registry not initialized');
        return null;
      }

      try {
        setError(null);
        const result = await registryRef.current.executeAgentOperation(
          agentId,
          operationType,
          subOrgId,
          walletAddress,
          unsignedTransaction
        );
        return result;
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Operation failed';
        setError(message);
        console.error('[useAgentRegistry] Operation failed:', err);
        return null;
      }
    },
    [subOrgId]
  );

  const isLoading = encryptedAgents === undefined || isDecrypting;

  return {
    agents: decryptedAgents,
    isLoading,
    error,
    createAgent,
    suspendAgent,
    revokeAgent,
    updatePermissions,
    executeOperation,
  };
}
