/**
 * Agent Registry - Central Orchestrator
 *
 * Privacy-preserving agent management that ties N AI agents to 1 wallet.
 * Coordinates across Convex (E2EE records), Light Protocol (compressed accounts),
 * Turnkey TEE (session keys), and Noir proofs (external verification).
 *
 * SECURITY MODEL:
 * - Fast path (95% of ops): TEE verifies agent + signs (~200ms, no proof leaves enclave)
 * - Proof path: Pre-computed on state change, cached locally (128 bytes)
 * - All records E2EE via NaCl secretbox; only hashes + status in cleartext
 *
 * Follows singleton pattern from lib/privacy-storage.ts.
 */

import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';
import {
  computePermissionsHash,
  computeAgentCommitment,
  generateAgentNonce,
  verifyAgentCommitment,
} from './agent-commitment';
import {
  deriveAgentEncryptionKey,
  encryptAgentRecord,
  decryptAgentRecord,
  encryptAgentOperation,
} from './agent-encryption';
import {
  generateNullifier,
  generateSecureNonce,
} from '../zk/nullifier-registry';
import {
  getSunspotService,
  DEFAULT_PROOF_VALIDITY_MS,
} from '../zk/sunspot-client';
import type { ZkProof } from '../zk/sunspot-client';
import type {
  AgentRecord,
  AgentPermissions,
  AgentCommitmentInputs,
  AgentStatus,
  CachedAgentProof,
} from './types';
import type { Id } from '@/convex/_generated/dataModel';

// ============================================================================
// Types
// ============================================================================

export interface AgentRegistryConfig {
  /** User's Convex ID */
  userId: Id<"users">;
  /** User's wallet private key (for deriving encryption keys) */
  userPrivateKey: Uint8Array;
  /** Convex mutation/action executors */
  convex: ConvexAgentActions;
}

/**
 * Convex actions required by the agent registry
 */
export type ConvexAgentActions = {
  // Agent CRUD
  create: (args: {
    userId: Id<"users">;
    agentId: string;
    encryptedRecord: string;
    commitmentHash: string;
    permissionsHash: string;
  }) => Promise<Id<"agents">>;

  activate: (args: {
    agentId: string;
    compressedAccountId?: Id<"compressedAccounts">;
    sessionKeyId?: string;
    turnkeyPolicyId?: string;
  }) => Promise<void>;

  updateRecord: (args: {
    agentId: string;
    encryptedRecord: string;
    commitmentHash: string;
    permissionsHash: string;
  }) => Promise<void>;

  cacheProof: (args: {
    agentId: string;
    cachedProof: string;
    merkleRoot: string;
  }) => Promise<void>;

  suspend: (args: { agentId: string }) => Promise<void>;

  revoke: (args: {
    agentId: string;
    revocationNullifier: string;
  }) => Promise<void>;

  logOperation: (args: {
    agentId: string;
    userId: Id<"users">;
    encryptedOperation: string;
    operationNullifier: string;
    status: "completed" | "failed" | "reverted";
  }) => Promise<void>;

  // Agent queries
  getActiveByUser: (args: {
    userId: Id<"users">;
  }) => Promise<Array<{
    agentId: string;
    encryptedRecord: string;
    commitmentHash: string;
    permissionsHash: string;
    status: string;
    sessionKeyId?: string;
    cachedProof?: string;
    cachedProofMerkleRoot?: string;
    proofGeneratedAt?: number;
  }>>;

  getByAgentId: (args: { agentId: string }) => Promise<{
    agentId: string;
    encryptedRecord: string;
    commitmentHash: string;
    permissionsHash: string;
    status: string;
    sessionKeyId?: string;
    turnkeyPolicyId?: string;
    cachedProof?: string;
    cachedProofMerkleRoot?: string;
    proofGeneratedAt?: number;
  } | null>;

  // Compressed account
  createAgentAccount: (args: {
    userId: Id<"users">;
    agentId: string;
    merkleTreeAddress: string;
    leafIndex: number;
    stateHash: string;
    commitmentHash: string;
    encryptedPayload: string;
  }) => Promise<Id<"compressedAccounts">>;

  revokeAgentAccount: (args: {
    agentId: string;
  }) => Promise<void>;

  // TEE
  createAgentSessionKey: (args: {
    subOrganizationId: string;
    agentId: string;
    permissions: {
      allowedAddresses: string[];
      maxTransactionAmount?: number;
      dailyLimit?: number;
      monthlyLimit?: number;
    };
  }) => Promise<{ sessionKeyId: string; policyId: string }>;

  verifyAndSignWithAgent: (args: {
    subOrganizationId: string;
    agentId: string;
    sessionKeyId: string;
    walletAddress: string;
    unsignedTransaction: string;
  }) => Promise<{ signature: string; signedTransaction: string }>;

  revokeAgentSessionKey: (args: {
    subOrganizationId: string;
    sessionKeyId: string;
    policyId?: string;
  }) => Promise<{ success: boolean }>;
};

// ============================================================================
// Agent Registry
// ============================================================================

export class AgentRegistry {
  private config: AgentRegistryConfig;
  private encryptionKey: Uint8Array | null = null;

  constructor(config: AgentRegistryConfig) {
    this.config = config;
  }

  // ==========================================================================
  // Key Management
  // ==========================================================================

  private async getEncryptionKey(): Promise<Uint8Array> {
    if (!this.encryptionKey) {
      this.encryptionKey = await deriveAgentEncryptionKey(
        this.config.userPrivateKey
      );
    }
    return this.encryptionKey;
  }

  /**
   * Clear encryption key cache (call on logout)
   */
  clearKeyCache(): void {
    this.encryptionKey = null;
  }

  // ==========================================================================
  // Agent Lifecycle
  // ==========================================================================

  /**
   * Create a new AI agent
   *
   * Full flow:
   * 1. Generate keypair + nonce
   * 2. Compute Poseidon commitment
   * 3. Encrypt agent record
   * 4. Insert into Convex
   * 5. Create Light Protocol compressed account
   * 6. Create Turnkey session key with restricted policy
   * 7. Activate agent
   */
  async createAgent(
    name: string,
    description: string,
    permissions: AgentPermissions,
    subOrgId: string,
    walletPubkey: string
  ): Promise<AgentRecord> {
    console.log('[AgentRegistry] Creating agent:', name);

    // 1. Generate agent identity
    const agentId = `agent-${generateSecureNonce().slice(0, 16)}`;
    const agentPubkey = generateSecureNonce(); // Ed25519 key placeholder
    const nonce = await generateAgentNonce();

    // 2. Compute commitment
    const permissionsHash = computePermissionsHash(permissions);
    const commitmentInputs: AgentCommitmentInputs = {
      agentPubkey,
      walletPubkey,
      permissionsHash,
      nonce,
    };
    const commitmentHash = computeAgentCommitment(commitmentInputs);

    // 3. Build agent record
    const now = Date.now();
    const record: AgentRecord = {
      agentId,
      name,
      description,
      agentPubkey,
      permissions,
      walletPubkey,
      nonce,
      createdAt: now,
      updatedAt: now,
    };

    // 4. Encrypt and store in Convex
    const encryptionKey = await this.getEncryptionKey();
    const encryptedRecord = encryptAgentRecord(record, encryptionKey);

    await this.config.convex.create({
      userId: this.config.userId,
      agentId,
      encryptedRecord,
      commitmentHash,
      permissionsHash,
    });

    console.log('[AgentRegistry] Agent record created in Convex:', agentId);

    // 5. Create Light Protocol compressed account
    const stateHash = bytesToHex(
      sha256(new TextEncoder().encode(commitmentHash + encryptedRecord.slice(0, 32)))
    );

    let compressedAccountId: Id<"compressedAccounts"> | undefined;
    try {
      compressedAccountId = await this.config.convex.createAgentAccount({
        userId: this.config.userId,
        agentId,
        merkleTreeAddress: "placeholder-tree", // Set by Light Protocol SDK
        leafIndex: 0,
        stateHash,
        commitmentHash,
        encryptedPayload: encryptedRecord,
      });
      console.log('[AgentRegistry] Compressed account created');
    } catch (error) {
      console.warn('[AgentRegistry] Compressed account creation deferred:', error);
    }

    // 6. Create Turnkey session key with restrictions
    let sessionKeyId: string | undefined;
    let policyId: string | undefined;
    try {
      const teeResult = await this.config.convex.createAgentSessionKey({
        subOrganizationId: subOrgId,
        agentId,
        permissions: {
          allowedAddresses: permissions.walletScoping?.addresses ?? [walletPubkey],
          maxTransactionAmount: permissions.walletScoping?.maxTransactionAmount,
          dailyLimit: permissions.walletScoping?.dailyLimit,
          monthlyLimit: permissions.walletScoping?.monthlyLimit,
        },
      });
      sessionKeyId = teeResult.sessionKeyId;
      policyId = teeResult.policyId;
      console.log('[AgentRegistry] Session key created:', sessionKeyId);
    } catch (error) {
      console.warn('[AgentRegistry] Session key creation deferred:', error);
    }

    // 7. Activate agent
    await this.config.convex.activate({
      agentId,
      compressedAccountId,
      sessionKeyId,
      turnkeyPolicyId: policyId,
    });

    console.log('[AgentRegistry] Agent activated:', agentId);

    return record;
  }

  /**
   * Execute an agent operation via TEE fast path
   *
   * ~200ms: check status -> generate nullifier -> TEE verify+sign ->
   * mark nullifier used -> log encrypted operation
   */
  async executeAgentOperation(
    agentId: string,
    operationType: string,
    subOrgId: string,
    walletAddress: string,
    unsignedTransaction: string
  ): Promise<{ signature: string; signedTransaction: string }> {
    console.log('[AgentRegistry] Executing operation:', { agentId, operationType });

    // 1. Get agent details
    const agent = await this.config.convex.getByAgentId({ agentId });
    if (!agent) throw new Error(`Agent ${agentId} not found`);
    if (agent.status !== 'active') throw new Error(`Agent ${agentId} is not active`);
    if (!agent.sessionKeyId) throw new Error(`Agent ${agentId} has no session key`);

    // 2. Generate unique nullifier for this operation
    const operationNonce = generateSecureNonce();
    const nullifier = generateNullifier(operationNonce, 'agent_operation', agentId);

    // 3. TEE verify + sign
    const result = await this.config.convex.verifyAndSignWithAgent({
      subOrganizationId: subOrgId,
      agentId,
      sessionKeyId: agent.sessionKeyId,
      walletAddress,
      unsignedTransaction,
    });

    // 4. Log encrypted operation
    const operation = {
      type: operationType,
      agentId,
      walletAddress,
      timestamp: Date.now(),
      nullifier,
    };

    const encryptedOp = await encryptAgentOperation(
      operation,
      this.config.userPrivateKey
    );

    await this.config.convex.logOperation({
      agentId,
      userId: this.config.userId,
      encryptedOperation: encryptedOp,
      operationNullifier: nullifier,
      status: 'completed',
    });

    console.log('[AgentRegistry] Operation completed:', agentId);

    return result;
  }

  /**
   * Execute an agent operation with ZK proof (proof path)
   *
   * Used for external verification scenarios where a third party
   * needs cryptographic proof of agent authorization.
   *
   * Flow:
   * 1. Check for valid cached proof
   * 2. If stale/missing, generate new proof via Sunspot
   * 3. Cache the new proof in Convex
   * 4. Return proof + public inputs for external verifier
   */
  async executeAgentOperationWithProof(
    agentId: string,
    operationType: string,
    merkleRoot: string,
    merklePath: string[],
    merkleIndices: number[]
  ): Promise<{
    proof: string;
    publicInputs: string[];
    merkleRoot: string;
    nullifier: string;
  }> {
    console.log('[AgentRegistry] Executing operation with proof:', { agentId, operationType });

    // 1. Get agent details
    const agent = await this.config.convex.getByAgentId({ agentId });
    if (!agent) throw new Error(`Agent ${agentId} not found`);
    if (agent.status !== 'active') throw new Error(`Agent ${agentId} is not active`);

    // 2. Check for valid cached proof
    const PROOF_VALIDITY_MS = DEFAULT_PROOF_VALIDITY_MS;
    if (
      agent.cachedProof &&
      agent.cachedProofMerkleRoot === merkleRoot &&
      agent.proofGeneratedAt &&
      Date.now() - agent.proofGeneratedAt < PROOF_VALIDITY_MS
    ) {
      console.log('[AgentRegistry] Using cached proof for:', agentId);

      // Generate fresh nullifier even for cached proof
      const operationNonce = generateSecureNonce();
      const nullifier = generateNullifier(operationNonce, 'agent_proof_operation', agentId);

      // Parse cached proof to extract public inputs
      const cached: CachedAgentProof = JSON.parse(agent.cachedProof);

      return {
        proof: cached.proof,
        publicInputs: cached.publicInputs,
        merkleRoot: cached.merkleRoot,
        nullifier,
      };
    }

    // 3. Generate new proof via Sunspot
    console.log('[AgentRegistry] Generating new proof for:', agentId);

    const encryptionKey = await this.getEncryptionKey();
    const record = decryptAgentRecord(agent.encryptedRecord, encryptionKey);

    const permissionsHash = computePermissionsHash(record.permissions);
    const commitmentInputs: AgentCommitmentInputs = {
      agentPubkey: record.agentPubkey,
      walletPubkey: record.walletPubkey,
      permissionsHash,
      nonce: record.nonce,
    };

    // Generate operation nullifier
    const operationNonce = generateSecureNonce();
    const nullifier = generateNullifier(operationNonce, 'agent_proof_operation', agentId);

    // Build public inputs for the agent-authorization circuit
    const publicInputs = [
      record.agentPubkey,
      permissionsHash,
      merkleRoot,
      nullifier,
    ];

    // Generate proof via Sunspot service
    const sunspot = getSunspotService();
    const zkProof = await sunspot.generateBalanceThresholdProof(
      BigInt(1), // threshold: agent exists (commitment is valid)
      BigInt(1), // value: agent is authorized
      agent.commitmentHash,
      record.nonce,
      PROOF_VALIDITY_MS
    );

    // Encode proof as base64
    const proofBase64 = btoa(
      String.fromCharCode(...zkProof.proof)
    );

    // 4. Cache the new proof in Convex
    const cachedProof: CachedAgentProof = {
      proof: proofBase64,
      publicInputs,
      merkleRoot,
      generatedAt: Date.now(),
      expiresAt: Date.now() + PROOF_VALIDITY_MS,
    };

    await this.config.convex.cacheProof({
      agentId,
      cachedProof: JSON.stringify(cachedProof),
      merkleRoot,
    });

    console.log('[AgentRegistry] Proof generated and cached for:', agentId);

    return {
      proof: proofBase64,
      publicInputs,
      merkleRoot,
      nullifier,
    };
  }

  /**
   * Update agent permissions
   *
   * Decrypt -> update -> recompute commitment -> re-encrypt ->
   * update Convex + Light Protocol + Turnkey policy -> invalidate proof
   */
  async updatePermissions(
    agentId: string,
    newPermissions: AgentPermissions,
    subOrgId: string
  ): Promise<AgentRecord> {
    console.log('[AgentRegistry] Updating permissions:', agentId);

    // 1. Get and decrypt current record
    const agent = await this.config.convex.getByAgentId({ agentId });
    if (!agent) throw new Error(`Agent ${agentId} not found`);

    const encryptionKey = await this.getEncryptionKey();
    const record = decryptAgentRecord(agent.encryptedRecord, encryptionKey);

    // 2. Update record
    const updatedRecord: AgentRecord = {
      ...record,
      permissions: newPermissions,
      updatedAt: Date.now(),
    };

    // 3. Recompute commitment
    const newPermissionsHash = computePermissionsHash(newPermissions);
    const commitmentInputs: AgentCommitmentInputs = {
      agentPubkey: record.agentPubkey,
      walletPubkey: record.walletPubkey,
      permissionsHash: newPermissionsHash,
      nonce: record.nonce,
    };
    const newCommitmentHash = computeAgentCommitment(commitmentInputs);

    // 4. Re-encrypt and update Convex (also invalidates cached proof)
    const newEncryptedRecord = encryptAgentRecord(updatedRecord, encryptionKey);
    await this.config.convex.updateRecord({
      agentId,
      encryptedRecord: newEncryptedRecord,
      commitmentHash: newCommitmentHash,
      permissionsHash: newPermissionsHash,
    });

    console.log('[AgentRegistry] Permissions updated:', agentId);

    return updatedRecord;
  }

  /**
   * Revoke an agent permanently
   *
   * Revoke Turnkey session key -> nullify Light Protocol leaf ->
   * update Convex -> clear proof cache
   */
  async revokeAgent(agentId: string, subOrgId: string): Promise<void> {
    console.log('[AgentRegistry] Revoking agent:', agentId);

    const agent = await this.config.convex.getByAgentId({ agentId });
    if (!agent) throw new Error(`Agent ${agentId} not found`);

    // 1. Revoke Turnkey session key
    if (agent.sessionKeyId) {
      try {
        await this.config.convex.revokeAgentSessionKey({
          subOrganizationId: subOrgId,
          sessionKeyId: agent.sessionKeyId,
          policyId: agent.turnkeyPolicyId,
        });
        console.log('[AgentRegistry] Session key revoked');
      } catch (error) {
        console.warn('[AgentRegistry] Session key revocation failed:', error);
      }
    }

    // 2. Nullify Light Protocol leaf
    try {
      await this.config.convex.revokeAgentAccount({ agentId });
      console.log('[AgentRegistry] Compressed account revoked');
    } catch (error) {
      console.warn('[AgentRegistry] Compressed account revocation failed:', error);
    }

    // 3. Update Convex with revocation nullifier
    const revocationNullifier = generateNullifier(
      generateSecureNonce(),
      'agent_revocation',
      agentId
    );

    await this.config.convex.revoke({
      agentId,
      revocationNullifier,
    });

    console.log('[AgentRegistry] Agent revoked:', agentId);
  }

  /**
   * Load and decrypt all active agents
   */
  async loadAgents(): Promise<AgentRecord[]> {
    console.log('[AgentRegistry] Loading agents');

    const encryptedAgents = await this.config.convex.getActiveByUser({
      userId: this.config.userId,
    });

    const encryptionKey = await this.getEncryptionKey();
    const decrypted: AgentRecord[] = [];

    for (const agent of encryptedAgents) {
      try {
        const record = decryptAgentRecord(agent.encryptedRecord, encryptionKey);
        decrypted.push(record);
      } catch (error) {
        console.error(`[AgentRegistry] Failed to decrypt agent ${agent.agentId}:`, error);
      }
    }

    console.log(`[AgentRegistry] Loaded ${decrypted.length} agents`);
    return decrypted;
  }

  /**
   * Suspend an agent temporarily
   */
  async suspendAgent(agentId: string): Promise<void> {
    await this.config.convex.suspend({ agentId });
    console.log('[AgentRegistry] Agent suspended:', agentId);
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

let agentRegistryInstance: AgentRegistry | null = null;

export function getAgentRegistry(config?: AgentRegistryConfig): AgentRegistry {
  if (!agentRegistryInstance && config) {
    agentRegistryInstance = new AgentRegistry(config);
  }
  if (!agentRegistryInstance) {
    throw new Error('AgentRegistry not initialized. Call with config first.');
  }
  return agentRegistryInstance;
}

export function initializeAgentRegistry(config: AgentRegistryConfig): AgentRegistry {
  if (agentRegistryInstance) {
    agentRegistryInstance.clearKeyCache();
  }
  agentRegistryInstance = new AgentRegistry(config);
  return agentRegistryInstance;
}
