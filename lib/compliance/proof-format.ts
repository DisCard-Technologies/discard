/**
 * Standardized Compliance Proof Format
 *
 * Unified proof format for all ZK compliance proofs (Noir, Bulletproofs, Schnorr).
 * Supports archiving, on-chain anchoring, and cross-system verification.
 */

// ============================================================================
// Types
// ============================================================================

/** Supported proof formats */
export type ProofFormat = "noir_bb" | "bulletproof" | "schnorr";

/**
 * Standard compliance proof — the canonical format for all ZK compliance proofs.
 * Used for archiving, export, re-verification, and on-chain anchoring.
 */
export interface StandardComplianceProof {
  /** Unique identifier for this proof instance */
  proofId: string;

  /** Proof classification (kyc_level, age_threshold, sanctions, reserve, etc.) */
  proofType: string;

  /** Circuit identifier (Noir circuit name, if applicable) */
  circuitId?: string;

  /** Named public inputs used in the proof */
  publicInputs: Record<string, string | number>;

  /** The proof data */
  proof: {
    format: ProofFormat;
    data: string; // Base64-encoded proof bytes
  };

  /** Hash of the verification key for this circuit */
  verificationKeyHash: string;

  /** Nullifier for replay protection */
  nullifier: string;

  /** When the proof was generated (unix ms) */
  generatedAt: number;

  /** When the proof expires (unix ms) */
  expiresAt: number;

  /** On-chain anchor reference (if anchored) */
  anchorTxSignature?: string;

  /** Merkle root the proof was included in */
  anchorMerkleRoot?: string;

  /** DID of the issuer/attestor */
  issuerDid?: string;
}

// ============================================================================
// Conversion from Legacy Formats
// ============================================================================

/**
 * Legacy proof format from zk-compliance.ts
 */
interface LegacyComplianceProof {
  attestationProof: {
    commitment: bigint | string;
    blinding: bigint | string;
    issuer: string;
    expiresAt: number;
  };
  rangeProof?: {
    commitment: bigint | string;
    proof: Uint8Array | string;
    bitLength: number;
  };
  nullifier: bigint | string;
  nonce: string;
  timestamp: number;
  proofType: string;
  publicInputs: Record<string, unknown>;
}

/**
 * Convert a legacy ComplianceProof to StandardComplianceProof.
 * Backwards-compatible conversion for existing proof generators.
 */
export function fromLegacyProof(
  legacy: LegacyComplianceProof,
  options?: {
    circuitId?: string;
    verificationKeyHash?: string;
    expiresInMs?: number;
    issuerDid?: string;
  }
): StandardComplianceProof {
  const now = Date.now();
  const expiresInMs = options?.expiresInMs ?? 3600_000; // 1 hour default

  // Serialize the proof data
  const proofPayload = {
    attestation: {
      commitment: String(legacy.attestationProof.commitment),
      blinding: String(legacy.attestationProof.blinding),
      issuer: legacy.attestationProof.issuer,
      expiresAt: legacy.attestationProof.expiresAt,
    },
    rangeProof: legacy.rangeProof
      ? {
          commitment: String(legacy.rangeProof.commitment),
          proof:
            typeof legacy.rangeProof.proof === "string"
              ? legacy.rangeProof.proof
              : uint8ArrayToBase64(legacy.rangeProof.proof),
          bitLength: legacy.rangeProof.bitLength,
        }
      : undefined,
    nonce: legacy.nonce,
  };

  // Serialize public inputs to string values
  const publicInputs: Record<string, string | number> = {};
  for (const [key, value] of Object.entries(legacy.publicInputs)) {
    publicInputs[key] =
      typeof value === "bigint"
        ? value.toString()
        : typeof value === "number"
          ? value
          : String(value);
  }

  return {
    proofId: `proof-${now}-${Math.random().toString(36).substr(2, 9)}`,
    proofType: legacy.proofType,
    circuitId: options?.circuitId,
    publicInputs,
    proof: {
      format: "schnorr", // Legacy proofs use Schnorr ownership proofs
      data: stringToBase64(JSON.stringify(proofPayload)),
    },
    verificationKeyHash:
      options?.verificationKeyHash ?? computeSimpleHash(legacy.proofType),
    nullifier: String(legacy.nullifier),
    generatedAt: legacy.timestamp,
    expiresAt: legacy.timestamp + expiresInMs,
    issuerDid: options?.issuerDid ?? legacy.attestationProof.issuer,
  };
}

// ============================================================================
// Factory Functions for New Proof Types
// ============================================================================

/**
 * Create a StandardComplianceProof for a Noir circuit proof.
 */
export function createNoirProof(params: {
  proofType: string;
  circuitId: string;
  publicInputs: Record<string, string | number>;
  proofData: Uint8Array;
  verificationKeyHash: string;
  nullifier: string;
  expiresInMs?: number;
  issuerDid?: string;
}): StandardComplianceProof {
  const now = Date.now();

  return {
    proofId: `noir-${now}-${Math.random().toString(36).substr(2, 9)}`,
    proofType: params.proofType,
    circuitId: params.circuitId,
    publicInputs: params.publicInputs,
    proof: {
      format: "noir_bb",
      data: uint8ArrayToBase64(params.proofData),
    },
    verificationKeyHash: params.verificationKeyHash,
    nullifier: params.nullifier,
    generatedAt: now,
    expiresAt: now + (params.expiresInMs ?? 3600_000),
    issuerDid: params.issuerDid,
  };
}

/**
 * Create a StandardComplianceProof for a Bulletproof range proof.
 */
export function createBulletproofProof(params: {
  proofType: string;
  publicInputs: Record<string, string | number>;
  proofData: Uint8Array;
  verificationKeyHash: string;
  nullifier: string;
  expiresInMs?: number;
}): StandardComplianceProof {
  const now = Date.now();

  return {
    proofId: `bp-${now}-${Math.random().toString(36).substr(2, 9)}`,
    proofType: params.proofType,
    publicInputs: params.publicInputs,
    proof: {
      format: "bulletproof",
      data: uint8ArrayToBase64(params.proofData),
    },
    verificationKeyHash: params.verificationKeyHash,
    nullifier: params.nullifier,
    generatedAt: now,
    expiresAt: now + (params.expiresInMs ?? 3600_000),
  };
}

// ============================================================================
// Validation
// ============================================================================

/**
 * Check if a StandardComplianceProof is structurally valid and not expired.
 */
export function isProofValid(proof: StandardComplianceProof): {
  valid: boolean;
  reason?: string;
} {
  const now = Date.now();

  if (!proof.proofId) return { valid: false, reason: "Missing proofId" };
  if (!proof.proofType) return { valid: false, reason: "Missing proofType" };
  if (!proof.proof?.data) return { valid: false, reason: "Missing proof data" };
  if (!proof.nullifier) return { valid: false, reason: "Missing nullifier" };
  if (proof.expiresAt < now) return { valid: false, reason: "Proof expired" };
  if (proof.generatedAt > now)
    return { valid: false, reason: "Proof generated in the future" };

  return { valid: true };
}

// ============================================================================
// Utility Functions
// ============================================================================

function uint8ArrayToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function stringToBase64(str: string): string {
  return btoa(unescape(encodeURIComponent(str)));
}

function computeSimpleHash(input: string): string {
  // Deterministic hash for verification key references
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    const char = input.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(16).padStart(8, "0");
}
