/**
 * Unified Compliance Service
 *
 * Bridges the attestation system with ZK compliance proofs.
 * Provides a single interface for:
 * - Fetching attestations from Convex
 * - Converting to ZK-provable commitments
 * - Generating privacy-preserving compliance proofs
 * - Verifying proofs for on-chain/off-chain use
 *
 * Used for Range bounty: selective disclosure tools
 */

import { ConvexClient } from 'convex/browser';
import { api } from '../../convex/_generated/api';
import { Id } from '../../convex/_generated/dataModel';
import {
  commitAttestation,
  generateKYCLevelProof,
  generateAgeThresholdProof,
  generateSanctionsClearanceProof,
  generateAMLClearanceProof,
  verifyComplianceProof,
  checkAttestationRequirements,
  getRequiredAttestationsForAction,
  createNullifierRecord,
  type AttestationCommitment,
  type ComplianceProof,
  type ComplianceVerificationResult,
  type KYCLevel,
  KYC_LEVELS,
} from './zk-compliance';
import {
  type AttestationType,
  type AttestationData,
} from '../attestations/sas-client';
import {
  getNullifierRegistry,
  type NullifierRecord,
} from '../zk/nullifier-registry';

// ============================================================================
// Types
// ============================================================================

export interface ComplianceServiceConfig {
  /** Convex client for fetching attestations */
  convexClient?: ConvexClient;
  /** Whether to persist nullifiers to Convex */
  persistNullifiers?: boolean;
  /** Default proof validity in ms */
  defaultProofValidityMs?: number;
}

export interface UserComplianceState {
  /** User ID */
  userId: string;
  /** Active attestations from Convex */
  attestations: AttestationData[];
  /** Converted to ZK-provable commitments */
  commitments: Map<string, AttestationCommitment>;
  /** Current KYC level */
  kycLevel: KYCLevel;
  /** Trust score */
  trustScore: {
    score: number;
    maxScore: number;
    level: 'none' | 'basic' | 'standard' | 'enhanced' | 'full';
  };
  /** Last refresh timestamp */
  lastRefresh: number;
}

export interface ComplianceCheckResult {
  allowed: boolean;
  proof?: ComplianceProof;
  missing?: string[];
  error?: string;
}

// ============================================================================
// Compliance Service
// ============================================================================

export class ComplianceService {
  private config: Required<ComplianceServiceConfig>;
  private userStates: Map<string, UserComplianceState> = new Map();
  private nullifierRegistry = getNullifierRegistry();

  constructor(config: ComplianceServiceConfig = {}) {
    this.config = {
      convexClient: config.convexClient ?? null as unknown as ConvexClient,
      persistNullifiers: config.persistNullifiers ?? true,
      defaultProofValidityMs: config.defaultProofValidityMs ?? 60 * 60 * 1000,
    };
  }

  // ==========================================================================
  // User State Management
  // ==========================================================================

  /**
   * Load user's attestations and convert to commitments
   */
  async loadUserState(userId: Id<'users'>): Promise<UserComplianceState> {
    const cached = this.userStates.get(userId);
    if (cached && Date.now() - cached.lastRefresh < 60000) {
      return cached;
    }

    // Fetch attestations from Convex
    const attestations = this.config.convexClient
      ? await this.config.convexClient.query(api.attestations.sas.getActiveByUser, { userId })
      : [];

    // Convert to commitments
    const commitments = new Map<string, AttestationCommitment>();
    for (const att of attestations) {
      const kycLevel = this.attestationTypeToKycLevel(att.attestationType);
      const commitment = commitAttestation(
        att.attestationType,
        kycLevel,
        att.expiresAt,
        att.issuer
      );
      commitments.set(att.attestationType, commitment);
    }

    // Determine overall KYC level
    const kycLevel = this.determineKycLevel(attestations);

    // Calculate trust score
    const trustScore = this.calculateTrustScore(attestations);

    const state: UserComplianceState = {
      userId,
      attestations,
      commitments,
      kycLevel,
      trustScore,
      lastRefresh: Date.now(),
    };

    this.userStates.set(userId, state);
    return state;
  }

  /**
   * Refresh user's state from Convex
   */
  async refreshUserState(userId: Id<'users'>): Promise<UserComplianceState> {
    this.userStates.delete(userId);
    return this.loadUserState(userId);
  }

  // ==========================================================================
  // Compliance Checks with ZK Proofs
  // ==========================================================================

  /**
   * Check if user can fund a card (with ZK proof)
   */
  async checkCardFunding(userId: Id<'users'>): Promise<ComplianceCheckResult> {
    const state = await this.loadUserState(userId);
    const requirements = getRequiredAttestationsForAction('card_funding');

    // Check attestation requirements
    const check = checkAttestationRequirements(
      Array.from(state.commitments.values()),
      requirements.types
    );

    if (!check.allowed) {
      return { allowed: false, missing: check.missing };
    }

    // Check KYC level
    if (KYC_LEVELS[state.kycLevel] < KYC_LEVELS[requirements.minKycLevel]) {
      return {
        allowed: false,
        error: `KYC level ${state.kycLevel} below required ${requirements.minKycLevel}`,
      };
    }

    // Generate ZK proof
    const identityCommitment = state.commitments.get('identity_verified');
    if (!identityCommitment) {
      return { allowed: false, missing: ['identity_verified'] };
    }

    try {
      const proof = await generateKYCLevelProof(
        identityCommitment,
        state.kycLevel,
        requirements.minKycLevel,
        this.config.defaultProofValidityMs
      );

      // Register nullifier
      await this.registerNullifier(proof);

      return { allowed: true, proof };
    } catch (error) {
      return {
        allowed: false,
        error: error instanceof Error ? error.message : 'Proof generation failed',
      };
    }
  }

  /**
   * Check if user can perform a private transfer (with ZK proof)
   */
  async checkPrivateTransfer(userId: Id<'users'>): Promise<ComplianceCheckResult> {
    const state = await this.loadUserState(userId);
    const requirements = getRequiredAttestationsForAction('private_transfer');

    // Check attestation requirements
    const check = checkAttestationRequirements(
      Array.from(state.commitments.values()),
      requirements.types
    );

    if (!check.allowed) {
      return { allowed: false, missing: check.missing };
    }

    // Generate sanctions clearance proof
    const sanctionsCommitment = state.commitments.get('sanctions_cleared');
    if (!sanctionsCommitment) {
      return { allowed: false, missing: ['sanctions_cleared'] };
    }

    try {
      // Mark as sanctions_cleared for the proof generator
      sanctionsCommitment.type = 'sanctions_cleared';

      const proof = await generateSanctionsClearanceProof(
        sanctionsCommitment,
        this.config.defaultProofValidityMs
      );

      await this.registerNullifier(proof);

      return { allowed: true, proof };
    } catch (error) {
      return {
        allowed: false,
        error: error instanceof Error ? error.message : 'Proof generation failed',
      };
    }
  }

  /**
   * Check if user can perform high-value transaction
   */
  async checkHighValueTx(
    userId: Id<'users'>,
    _amount: bigint
  ): Promise<ComplianceCheckResult> {
    const state = await this.loadUserState(userId);
    const requirements = getRequiredAttestationsForAction('high_value_tx');

    const check = checkAttestationRequirements(
      Array.from(state.commitments.values()),
      requirements.types
    );

    if (!check.allowed) {
      return { allowed: false, missing: check.missing };
    }

    // Need enhanced KYC for high-value
    const kycCommitment = state.commitments.get('kyc_enhanced') ??
                          state.commitments.get('kyc_full');

    if (!kycCommitment) {
      return { allowed: false, missing: ['kyc_enhanced'] };
    }

    try {
      const proof = await generateKYCLevelProof(
        kycCommitment,
        state.kycLevel,
        requirements.minKycLevel,
        this.config.defaultProofValidityMs
      );

      await this.registerNullifier(proof);

      return { allowed: true, proof };
    } catch (error) {
      return {
        allowed: false,
        error: error instanceof Error ? error.message : 'Proof generation failed',
      };
    }
  }

  /**
   * Check age threshold (for age-restricted purchases)
   */
  async checkAgeThreshold(
    userId: Id<'users'>,
    minAge: 18 | 21
  ): Promise<ComplianceCheckResult> {
    const state = await this.loadUserState(userId);

    const ageType = minAge === 21 ? 'age_over_21' : 'age_over_18';
    const ageCommitment = state.commitments.get(ageType) ??
                          state.commitments.get('age_over_21'); // 21+ implies 18+

    if (!ageCommitment) {
      return { allowed: false, missing: [ageType] };
    }

    try {
      // For age proofs, we use a fixed "verified age" of minAge + buffer
      // The actual age is hidden, we just prove it's >= minAge
      const proof = await generateAgeThresholdProof(
        ageCommitment,
        minAge + 5, // Assume verified age is at least 5 years above threshold
        minAge,
        this.config.defaultProofValidityMs
      );

      await this.registerNullifier(proof);

      return { allowed: true, proof };
    } catch (error) {
      return {
        allowed: false,
        error: error instanceof Error ? error.message : 'Proof generation failed',
      };
    }
  }

  // ==========================================================================
  // Proof Verification
  // ==========================================================================

  /**
   * Verify a compliance proof
   */
  verifyProof(
    proof: ComplianceProof,
    expectedCommitment: string
  ): ComplianceVerificationResult {
    // Check if nullifier was already used
    const usedNullifiers = this.nullifierRegistry.getUsedNullifiers?.() ??
                           new Set<string>();

    return verifyComplianceProof(proof, expectedCommitment, usedNullifiers);
  }

  /**
   * Verify and consume a proof (marks nullifier as used)
   */
  async verifyAndConsumeProof(
    proof: ComplianceProof,
    expectedCommitment: string,
    context?: string
  ): Promise<ComplianceVerificationResult> {
    const result = this.verifyProof(proof, expectedCommitment);

    if (result.valid) {
      await this.registerNullifier(proof, context);
    }

    return result;
  }

  // ==========================================================================
  // Nullifier Management
  // ==========================================================================

  /**
   * Register a nullifier to prevent proof replay
   */
  private async registerNullifier(
    proof: ComplianceProof,
    context?: string
  ): Promise<void> {
    const record = createNullifierRecord(proof, context);

    // Register in memory
    await this.nullifierRegistry.markNullifierUsed(
      proof.nullifier,
      proof.type,
      proof.expiresAt
    );

    // Persist to Convex if configured
    if (this.config.persistNullifiers && this.config.convexClient) {
      try {
        await this.config.convexClient.mutation(
          api.privacy.nullifiers.markUsed,
          {
            nullifier: proof.nullifier,
            proofType: proof.type,
            expiresAt: proof.expiresAt,
            proofHash: proof.hash,
            context,
          }
        );
      } catch (error) {
        console.warn('[Compliance] Failed to persist nullifier:', error);
      }
    }
  }

  // ==========================================================================
  // Helper Methods
  // ==========================================================================

  /**
   * Map attestation type to KYC level
   */
  private attestationTypeToKycLevel(type: string): KYCLevel {
    if (type.includes('full')) return 'full';
    if (type.includes('enhanced')) return 'enhanced';
    if (type.includes('basic') || type.includes('verified')) return 'basic';
    return 'none';
  }

  /**
   * Determine user's overall KYC level from attestations
   */
  private determineKycLevel(attestations: AttestationData[]): KYCLevel {
    const types = new Set(attestations.map(a => a.attestationType));

    if (types.has('kyc_full')) return 'full';
    if (types.has('kyc_enhanced')) return 'enhanced';
    if (types.has('kyc_basic') || types.has('identity_verified')) return 'basic';
    return 'none';
  }

  /**
   * Calculate trust score
   */
  private calculateTrustScore(attestations: AttestationData[]): {
    score: number;
    maxScore: number;
    level: 'none' | 'basic' | 'standard' | 'enhanced' | 'full';
  } {
    const weights: Record<string, number> = {
      identity_verified: 40,
      kyc_basic: 25,
      kyc_enhanced: 50,
      kyc_full: 100,
      aml_cleared: 30,
      sanctions_cleared: 40,
      age_over_18: 10,
      age_over_21: 10,
      biometric_verified: 45,
    };

    let score = 0;
    for (const att of attestations) {
      score += weights[att.attestationType] ?? 0;
    }

    const maxScore = Object.values(weights).reduce((a, b) => a + b, 0);
    const percentage = (score / maxScore) * 100;

    let level: 'none' | 'basic' | 'standard' | 'enhanced' | 'full';
    if (percentage >= 80) level = 'full';
    else if (percentage >= 60) level = 'enhanced';
    else if (percentage >= 40) level = 'standard';
    else if (percentage >= 20) level = 'basic';
    else level = 'none';

    return { score, maxScore, level };
  }

  /**
   * Get user's compliance state (cached)
   */
  getUserState(userId: string): UserComplianceState | undefined {
    return this.userStates.get(userId);
  }

  /**
   * Clear user state cache
   */
  clearCache(): void {
    this.userStates.clear();
  }
}

// ============================================================================
// Singleton
// ============================================================================

let complianceService: ComplianceService | null = null;

export function getComplianceService(
  config?: ComplianceServiceConfig
): ComplianceService {
  if (!complianceService) {
    complianceService = new ComplianceService(config);
  }
  return complianceService;
}

export function initializeComplianceService(
  config: ComplianceServiceConfig
): ComplianceService {
  complianceService = new ComplianceService(config);
  return complianceService;
}

export default ComplianceService;
