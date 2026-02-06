/**
 * AI Agent Registry - Type Definitions
 *
 * Shared types for the privacy-preserving agent registry.
 * Agents act on behalf of users for card spending, swaps, and intents.
 */

// ============================================================================
// Permission Types
// ============================================================================

/**
 * Individual agent permission
 */
export type AgentPermission =
  | 'sign_transaction'
  | 'read_balance'
  | 'fund_card'
  | 'swap_tokens'
  | 'transfer_funds'
  | 'manage_cards'
  | 'view_history'
  | 'create_intent'
  | 'approve_intent'
  | 'read_holdings';

/**
 * Structured agent permissions with scoping and restrictions
 */
export interface AgentPermissions {
  /** Allowed permission set */
  allowed: AgentPermission[];

  /** Wallet-level scoping */
  walletScoping?: {
    /** Addresses the agent can operate on */
    addresses: string[];
    /** Per-transaction limit in lamports */
    maxTransactionAmount?: number;
    /** Daily spending limit in lamports */
    dailyLimit?: number;
    /** Monthly spending limit in lamports */
    monthlyLimit?: number;
  };

  /** Activity-level restrictions */
  activityRestrictions?: {
    /** Allowed intent types */
    allowedIntents?: string[];
    /** Allowed MCC codes for card spending */
    allowedMccCodes?: string[];
    /** Blocked MCC codes */
    blockedMccCodes?: string[];
  };

  /** Time-based restrictions */
  timeRestrictions?: {
    /** Permission valid from (unix ms) */
    validFrom?: number;
    /** Permission valid until (unix ms) */
    validUntil?: number;
    /** Allowed hours of day [start, end] in UTC (0-23) */
    allowedHours?: [number, number];
  };
}

// ============================================================================
// Agent Record
// ============================================================================

/**
 * Plaintext agent record (encrypted before storage)
 */
export interface AgentRecord {
  /** Unique agent identifier */
  agentId: string;
  /** Human-readable agent name */
  name: string;
  /** Agent description/purpose */
  description: string;
  /** Agent's Ed25519 public key (base58) */
  agentPubkey: string;
  /** Structured permissions */
  permissions: AgentPermissions;
  /** Owner wallet public key (base58) */
  walletPubkey: string;
  /** Random nonce for commitment uniqueness */
  nonce: string;
  /** Creation timestamp (unix ms) */
  createdAt: number;
  /** Last update timestamp (unix ms) */
  updatedAt: number;
}

// ============================================================================
// Commitment Types
// ============================================================================

/**
 * Inputs for Poseidon commitment computation
 */
export interface AgentCommitmentInputs {
  /** Agent's public key (base58) */
  agentPubkey: string;
  /** Owner wallet public key (base58) */
  walletPubkey: string;
  /** SHA-256 hash of canonicalized permissions */
  permissionsHash: string;
  /** Random nonce as hex string */
  nonce: string;
}

/**
 * Cached Groth16 proof for agent authorization
 */
export interface CachedAgentProof {
  /** Base64-encoded proof bytes */
  proof: string;
  /** Public inputs as hex strings */
  publicInputs: string[];
  /** Merkle root the proof was computed against */
  merkleRoot: string;
  /** When the proof was generated (unix ms) */
  generatedAt: number;
  /** When the proof expires (unix ms) */
  expiresAt: number;
}

// ============================================================================
// Agent Status
// ============================================================================

/**
 * Agent lifecycle status
 */
export type AgentStatus = 'creating' | 'active' | 'suspended' | 'revoked';

// ============================================================================
// Agent Registry Data (for Light Protocol compressed accounts)
// ============================================================================

/**
 * Data stored in Light Protocol compressed account
 */
export interface AgentRegistryData {
  /** Unique agent identifier */
  agentId: string;
  /** Poseidon commitment hash */
  commitmentHash: string;
  /** E2EE encrypted payload (opaque to indexers) */
  encryptedPayload: string;
  /** Agent status */
  status: AgentStatus;
  /** Leaf nullifier for revocation */
  leafNullifier?: string;
  /** Creation timestamp */
  createdAt: number;
  /** Last update timestamp */
  updatedAt: number;
}
