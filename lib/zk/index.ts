/**
 * ZK Privacy Module
 *
 * This module provides zero-knowledge and confidential compute capabilities:
 *
 * PRIMARY (Production-Ready):
 * 1. Sunspot/Noir (lib/zk/sunspot-client.ts)
 *    - Groth16 ZK proofs for privacy-preserving verification
 *    - Used for: spending limits, compliance, balance thresholds
 *    - Latency: 1-5 seconds (proof generation)
 *    - Status: PRODUCTION READY
 *
 * FUTURE (Beta - Disabled by Default):
 * 2. Inco Lightning (lib/zk/inco-client.ts)
 *    - TEE-based confidential compute for realtime verification
 *    - Used for: spending limits (fast path)
 *    - Latency: ~50ms (critical for 800ms Marqeta deadline)
 *    - Status: BETA - Set INCO_ENABLED=true when mainnet ready
 *
 * 3. Frontend Encryption (lib/zk/inco-encryption.ts)
 *    - Client-side encryption utilities for Inco
 *    - Handle management and validation
 */

// Sunspot/Noir ZK Proofs
export {
  SunspotService,
  getSunspotService,
  isSunspotConfigured,
  DEFAULT_VERIFIER_PROGRAM_ID,
  GROTH16_PROOF_SIZE,
  VERIFICATION_COMPUTE_UNITS,
  DEFAULT_PROOF_VALIDITY_MS,
  type ProofType,
  type SpendingLimitInputs,
  type SpendingLimitWitness,
  type IncoSpendingLimitInputs,
  type IncoSpendingResult,
  type ComplianceInputs,
  type ComplianceWitness,
  type ZkProof,
  type VerificationResult,
  type SunspotConfig,
} from './sunspot-client';

// Inco Lightning TEE
export {
  IncoLightningService,
  getIncoLightningService,
  isIncoEnabled,
  isIncoAvailableForCard,
  INCO_PROGRAM_ID_DEVNET,
  INCO_PROGRAM_ID_MAINNET,
  INCO_TEE_ENDPOINT_DEVNET,
  TARGET_RESPONSE_TIME_MS,
  MAX_RESPONSE_TIME_MS,
  HANDLE_VALIDITY_MS,
  type EncryptedHandle,
  type SpendingCheckResult,
  type IncoConfig,
} from './inco-client';

// Inco Frontend Encryption
export {
  encryptBalanceForInco,
  decryptBalanceFromInco,
  handleToOnChainFormat,
  handleFromOnChainFormat,
  isHandleValid,
  getHandleRemainingValidity,
  shouldRefreshHandle,
  prepareAmountForComparison,
  parseComparisonResult,
  generateEphemeralKeyPair,
  deriveIncoPublicKey,
  HANDLE_SIZE,
  PUBLIC_KEY_SIZE,
  EPOCH_DURATION_MS,
  type EncryptionParams,
  type DecryptedBalance,
  type OnChainHandle,
} from './inco-encryption';
