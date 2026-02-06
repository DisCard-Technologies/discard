/**
 * Agent Registry - Barrel Export
 *
 * Privacy-preserving AI agent management for DisCard.
 */

// Types
export type {
  AgentPermission,
  AgentPermissions,
  AgentRecord,
  AgentCommitmentInputs,
  CachedAgentProof,
  AgentStatus,
  AgentRegistryData,
} from './types';

// Commitment computation
export {
  computePermissionsHash,
  computeAgentCommitment,
  computeAgentMerkleLeaf,
  verifyAgentCommitment,
  generateAgentNonce,
} from './agent-commitment';

// Encryption
export {
  deriveAgentEncryptionKey,
  encryptAgentRecord,
  decryptAgentRecord,
  encryptAgentOperation,
  decryptAgentOperation,
} from './agent-encryption';

// Registry orchestrator
export {
  AgentRegistry,
  getAgentRegistry,
  initializeAgentRegistry,
} from './agent-registry';
export type { AgentRegistryConfig, ConvexAgentActions } from './agent-registry';
