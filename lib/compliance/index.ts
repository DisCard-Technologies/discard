/**
 * Compliance Module
 *
 * Privacy-preserving compliance verification for DisCard.
 * Exports ZK compliance proofs that enable selective disclosure.
 */

// ZK Compliance Service
export {
  // Types
  type ComplianceProofType,
  type KYCLevel,
  type AttestationCommitment,
  type AttestationProof,
  type ComplianceProof,
  type ComplianceVerificationResult,
  KYC_LEVELS,

  // Commitment functions
  createAttestationCommitment,
  commitAttestation,

  // Proof generation
  generateKYCLevelProof,
  generateAgeThresholdProof,
  generateSanctionsClearanceProof,
  generateAMLClearanceProof,

  // Verification
  verifyComplianceProof,
  verifyComplianceProofBatch,

  // Utilities
  checkAttestationRequirements,
  getRequiredAttestationsForAction,
  createNullifierRecord,
} from './zk-compliance';

// Re-export types from attestation system for convenience
export type {
  AttestationType,
  AttestationIssuer,
  AttestationStatus,
  AttestationData,
} from '../attestations/sas-client';

// Compliance Service (unified interface)
export {
  ComplianceService,
  getComplianceService,
  initializeComplianceService,
  type ComplianceServiceConfig,
  type UserComplianceState,
  type ComplianceCheckResult,
} from './compliance-service';
