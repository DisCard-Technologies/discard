/**
 * DisCard 2035 - Solana Attestation Service Client
 *
 * Client for managing on-chain identity attestations using
 * Solana Attestation Service (SAS) patterns.
 */

import { Connection, PublicKey, TransactionInstruction } from "@solana/web3.js";

// ============================================================================
// Types
// ============================================================================

export type AttestationType =
  | "age_over_18"
  | "age_over_21"
  | "uk_resident"
  | "eu_resident"
  | "us_resident"
  | "kyc_basic"
  | "kyc_enhanced"
  | "kyc_full"
  | "aml_cleared"
  | "sanctions_cleared"
  | "accredited_investor"
  | "professional_investor"
  | "pep_check"
  | "identity_verified"
  | "address_verified"
  | "phone_verified"
  | "email_verified"
  | "biometric_verified";

export type AttestationIssuer =
  | "civic"
  | "solid"
  | "persona"
  | "jumio"
  | "onfido"
  | "sumsub"
  | "veriff"
  | "discard_internal";

export type AttestationStatus = "active" | "expired" | "revoked" | "pending";

export interface AttestationData {
  /** Unique attestation ID */
  id: string;
  /** Type of attestation */
  type: AttestationType;
  /** Issuer of the attestation */
  issuer: AttestationIssuer;
  /** Subject DID */
  subjectDid: string;
  /** On-chain attestation address (if minted) */
  onChainAddress?: string;
  /** ZK proof for privacy-preserving verification */
  zkProof?: Uint8Array;
  /** Commitment hash (what's stored on-chain) */
  commitmentHash?: string;
  /** Status */
  status: AttestationStatus;
  /** When issued */
  issuedAt: number;
  /** When expires (if applicable) */
  expiresAt?: number;
  /** Last verification timestamp */
  lastVerifiedAt?: number;
  /** Additional metadata (encrypted off-chain) */
  metadata?: Record<string, unknown>;
}

export interface CreateAttestationParams {
  type: AttestationType;
  issuer: AttestationIssuer;
  subjectDid: string;
  proof?: Uint8Array;
  expiresAt?: number;
  metadata?: Record<string, unknown>;
}

export interface VerifyAttestationParams {
  attestationId: string;
  expectedType: AttestationType;
  expectedSubject: string;
  maxAgeMs?: number;
}

export interface VerificationResult {
  valid: boolean;
  attestationType?: AttestationType;
  issuer?: AttestationIssuer;
  issuedAt?: number;
  expiresAt?: number;
  reason?: string;
}

export interface SASClientConfig {
  rpcEndpoint: string;
  programId?: string;
}

// ============================================================================
// Constants
// ============================================================================

/** Default SAS program ID (placeholder - use actual SAS program when available) */
const DEFAULT_SAS_PROGRAM_ID = "SAS1111111111111111111111111111111111111111";

/** Attestation type weights for risk scoring */
const ATTESTATION_WEIGHTS: Record<AttestationType, number> = {
  age_over_18: 10,
  age_over_21: 10,
  uk_resident: 15,
  eu_resident: 15,
  us_resident: 15,
  kyc_basic: 25,
  kyc_enhanced: 50,
  kyc_full: 100,
  aml_cleared: 30,
  sanctions_cleared: 40,
  accredited_investor: 60,
  professional_investor: 70,
  pep_check: 35,
  identity_verified: 40,
  address_verified: 20,
  phone_verified: 10,
  email_verified: 5,
  biometric_verified: 45,
};

/** Issuer trust scores */
const ISSUER_TRUST_SCORES: Record<AttestationIssuer, number> = {
  civic: 90,
  solid: 85,
  persona: 88,
  jumio: 87,
  onfido: 86,
  sumsub: 84,
  veriff: 85,
  discard_internal: 70,
};

// ============================================================================
// SAS Client Implementation
// ============================================================================

export class SASClient {
  private connection: Connection;
  private programId: PublicKey;
  private attestationCache: Map<string, AttestationData> = new Map();

  constructor(config: SASClientConfig) {
    this.connection = new Connection(config.rpcEndpoint, "confirmed");
    this.programId = new PublicKey(config.programId ?? DEFAULT_SAS_PROGRAM_ID);
  }

  // ==========================================================================
  // Attestation Creation
  // ==========================================================================

  /**
   * Create instruction to mint an attestation on-chain
   */
  async createAttestationInstruction(
    payer: PublicKey,
    params: CreateAttestationParams
  ): Promise<TransactionInstruction[]> {
    const instructions: TransactionInstruction[] = [];

    // Derive attestation PDA
    const [attestationPda] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("attestation"),
        Buffer.from(params.subjectDid),
        Buffer.from(params.type),
      ],
      this.programId
    );

    // Compute commitment hash for the attestation
    const commitmentHash = this.computeAttestationCommitment(params);

    // Create attestation instruction
    // In production, this would be the actual SAS program instruction
    const createIx = new TransactionInstruction({
      keys: [
        { pubkey: payer, isSigner: true, isWritable: true },
        { pubkey: attestationPda, isSigner: false, isWritable: true },
        { pubkey: new PublicKey("11111111111111111111111111111111"), isSigner: false, isWritable: false },
      ],
      programId: this.programId,
      data: Buffer.from([
        0, // Create attestation instruction
        ...Buffer.from(params.type),
        ...Buffer.from(params.issuer),
        ...Buffer.from(commitmentHash, "hex"),
      ]),
    });

    instructions.push(createIx);

    return instructions;
  }

  /**
   * Create instruction to revoke an attestation
   */
  async revokeAttestationInstruction(
    authority: PublicKey,
    attestationAddress: string,
    reason: string
  ): Promise<TransactionInstruction[]> {
    const attestationPubkey = new PublicKey(attestationAddress);

    const revokeIx = new TransactionInstruction({
      keys: [
        { pubkey: authority, isSigner: true, isWritable: false },
        { pubkey: attestationPubkey, isSigner: false, isWritable: true },
      ],
      programId: this.programId,
      data: Buffer.from([
        1, // Revoke attestation instruction
        ...Buffer.from(reason),
      ]),
    });

    return [revokeIx];
  }

  // ==========================================================================
  // Attestation Verification
  // ==========================================================================

  /**
   * Verify an attestation on-chain
   */
  async verifyAttestation(
    params: VerifyAttestationParams
  ): Promise<VerificationResult> {
    try {
      // Check cache first
      const cached = this.attestationCache.get(params.attestationId);
      if (cached) {
        return this.validateCachedAttestation(cached, params);
      }

      // In production, fetch from chain
      // For now, simulate verification
      const attestation = await this.fetchAttestation(params.attestationId);
      if (!attestation) {
        return { valid: false, reason: "Attestation not found" };
      }

      // Cache the result
      this.attestationCache.set(params.attestationId, attestation);

      return this.validateCachedAttestation(attestation, params);
    } catch (error) {
      return {
        valid: false,
        reason: error instanceof Error ? error.message : "Verification failed",
      };
    }
  }

  /**
   * Verify attestation using ZK proof (privacy-preserving)
   */
  async verifyAttestationZK(
    proof: Uint8Array,
    expectedType: AttestationType,
    publicInputs: bigint[]
  ): Promise<{ valid: boolean; reason?: string }> {
    try {
      // In production, verify the ZK proof against on-chain verifier
      // The proof proves possession of a valid attestation without revealing details

      // Placeholder verification
      if (proof.length < 32) {
        return { valid: false, reason: "Invalid proof format" };
      }

      // Verify public inputs match expected type encoding
      const typeEncoding = this.encodeAttestationType(expectedType);
      if (publicInputs[0] !== typeEncoding) {
        return { valid: false, reason: "Type mismatch in proof" };
      }

      return { valid: true };
    } catch (error) {
      return {
        valid: false,
        reason: error instanceof Error ? error.message : "ZK verification failed",
      };
    }
  }

  /**
   * Batch verify multiple attestations
   */
  async batchVerifyAttestations(
    attestationIds: string[],
    expectedTypes: AttestationType[]
  ): Promise<Map<string, VerificationResult>> {
    const results = new Map<string, VerificationResult>();

    // Fetch all in parallel
    const verifications = await Promise.all(
      attestationIds.map((id, index) =>
        this.verifyAttestation({
          attestationId: id,
          expectedType: expectedTypes[index],
          expectedSubject: "", // Not checking subject in batch
        })
      )
    );

    attestationIds.forEach((id, index) => {
      results.set(id, verifications[index]);
    });

    return results;
  }

  // ==========================================================================
  // Trust Scoring
  // ==========================================================================

  /**
   * Calculate trust score based on attestations
   */
  calculateTrustScore(attestations: AttestationData[]): {
    score: number;
    maxScore: number;
    breakdown: Record<AttestationType, number>;
    level: "none" | "basic" | "standard" | "enhanced" | "full";
  } {
    const breakdown: Record<string, number> = {};
    let totalScore = 0;

    for (const attestation of attestations) {
      if (attestation.status !== "active") continue;

      // Check if expired
      if (attestation.expiresAt && attestation.expiresAt < Date.now()) continue;

      const typeWeight = ATTESTATION_WEIGHTS[attestation.type] ?? 0;
      const issuerMultiplier = (ISSUER_TRUST_SCORES[attestation.issuer] ?? 50) / 100;
      const score = Math.round(typeWeight * issuerMultiplier);

      breakdown[attestation.type] = score;
      totalScore += score;
    }

    const maxScore = Object.values(ATTESTATION_WEIGHTS).reduce((a, b) => a + b, 0);

    // Determine trust level
    let level: "none" | "basic" | "standard" | "enhanced" | "full";
    const percentage = (totalScore / maxScore) * 100;
    if (percentage >= 80) level = "full";
    else if (percentage >= 60) level = "enhanced";
    else if (percentage >= 40) level = "standard";
    else if (percentage >= 20) level = "basic";
    else level = "none";

    return {
      score: totalScore,
      maxScore,
      breakdown: breakdown as Record<AttestationType, number>,
      level,
    };
  }

  /**
   * Get required attestations for a specific action
   */
  getRequiredAttestations(
    action: "card_creation" | "high_value_tx" | "international_tx" | "wire_transfer"
  ): AttestationType[] {
    switch (action) {
      case "card_creation":
        return ["identity_verified", "email_verified"];
      case "high_value_tx":
        return ["kyc_basic", "identity_verified", "aml_cleared"];
      case "international_tx":
        return ["kyc_enhanced", "sanctions_cleared"];
      case "wire_transfer":
        return ["kyc_full", "aml_cleared", "sanctions_cleared", "address_verified"];
      default:
        return [];
    }
  }

  /**
   * Check if user has required attestations for action
   */
  hasRequiredAttestations(
    userAttestations: AttestationData[],
    action: "card_creation" | "high_value_tx" | "international_tx" | "wire_transfer"
  ): { allowed: boolean; missing: AttestationType[] } {
    const required = this.getRequiredAttestations(action);
    const activeTypes = new Set(
      userAttestations
        .filter((a) => a.status === "active" && (!a.expiresAt || a.expiresAt > Date.now()))
        .map((a) => a.type)
    );

    const missing = required.filter((type) => !activeTypes.has(type));

    return {
      allowed: missing.length === 0,
      missing,
    };
  }

  // ==========================================================================
  // Helper Methods
  // ==========================================================================

  /**
   * Compute commitment hash for attestation (stored on-chain)
   */
  private computeAttestationCommitment(params: CreateAttestationParams): string {
    // In production, use Poseidon hash for ZK compatibility
    const data = [
      params.type,
      params.issuer,
      params.subjectDid,
      params.expiresAt?.toString() ?? "0",
    ].join("|");

    // Simplified hash - use Poseidon in production
    let hash = 0;
    for (let i = 0; i < data.length; i++) {
      const char = data.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash;
    }
    return Math.abs(hash).toString(16).padStart(16, "0");
  }

  /**
   * Fetch attestation from chain
   */
  private async fetchAttestation(
    attestationId: string
  ): Promise<AttestationData | null> {
    try {
      // In production, fetch account data from chain
      // For now, return null (not found)
      return null;
    } catch {
      return null;
    }
  }

  /**
   * Validate cached attestation against params
   */
  private validateCachedAttestation(
    attestation: AttestationData,
    params: VerifyAttestationParams
  ): VerificationResult {
    // Check status
    if (attestation.status !== "active") {
      return {
        valid: false,
        reason: `Attestation is ${attestation.status}`,
        attestationType: attestation.type,
        issuer: attestation.issuer,
      };
    }

    // Check type
    if (attestation.type !== params.expectedType) {
      return {
        valid: false,
        reason: "Attestation type mismatch",
        attestationType: attestation.type,
        issuer: attestation.issuer,
      };
    }

    // Check subject
    if (params.expectedSubject && attestation.subjectDid !== params.expectedSubject) {
      return {
        valid: false,
        reason: "Subject DID mismatch",
        attestationType: attestation.type,
        issuer: attestation.issuer,
      };
    }

    // Check expiration
    if (attestation.expiresAt && attestation.expiresAt < Date.now()) {
      return {
        valid: false,
        reason: "Attestation expired",
        attestationType: attestation.type,
        issuer: attestation.issuer,
        expiresAt: attestation.expiresAt,
      };
    }

    // Check max age
    if (params.maxAgeMs) {
      const age = Date.now() - attestation.issuedAt;
      if (age > params.maxAgeMs) {
        return {
          valid: false,
          reason: "Attestation too old",
          attestationType: attestation.type,
          issuer: attestation.issuer,
          issuedAt: attestation.issuedAt,
        };
      }
    }

    return {
      valid: true,
      attestationType: attestation.type,
      issuer: attestation.issuer,
      issuedAt: attestation.issuedAt,
      expiresAt: attestation.expiresAt,
    };
  }

  /**
   * Encode attestation type to bigint for ZK circuits
   */
  private encodeAttestationType(type: AttestationType): bigint {
    const typeIndex = Object.keys(ATTESTATION_WEIGHTS).indexOf(type);
    return BigInt(typeIndex + 1);
  }

  /**
   * Clear attestation cache
   */
  clearCache(): void {
    this.attestationCache.clear();
  }
}

// ============================================================================
// Singleton Access
// ============================================================================

let sasClientInstance: SASClient | null = null;

export function getSASClient(config?: SASClientConfig): SASClient {
  if (!sasClientInstance && config) {
    sasClientInstance = new SASClient(config);
  }
  if (!sasClientInstance) {
    throw new Error("SAS client not initialized. Call initializeSASClient first.");
  }
  return sasClientInstance;
}

export function initializeSASClient(config: SASClientConfig): SASClient {
  sasClientInstance = new SASClient(config);
  return sasClientInstance;
}

export default SASClient;
