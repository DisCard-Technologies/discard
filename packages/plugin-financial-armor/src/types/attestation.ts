/**
 * Attestation Types
 *
 * Types for Phala TEE Remote Attestation and Turnkey stamping.
 * The attestation proves code integrity and provides cryptographic
 * proof that requests originate from our verified enclave.
 */

/**
 * Phala TEE attestation quote
 */
export interface PhalaAttestationQuote {
  /** Raw attestation quote bytes */
  quote: Uint8Array;
  /** Public key of the enclave signing key */
  publicKey: string;
  /** Timestamp when quote was generated */
  timestamp: number;
  /** Measurement of enclave code (MRENCLAVE) */
  mrEnclave: string;
  /** Measurement of signing key (MRSIGNER) */
  mrSigner: string;
  /** ISV Product ID */
  isvProdId: number;
  /** ISV Security Version Number */
  isvSvn: number;
  /** Custom data embedded in quote */
  reportData: Uint8Array;
  /** Quote expiry time */
  expiresAt: number;
}

/**
 * Turnkey stamp configuration
 */
export interface TurnkeyStampConfig {
  /** Parent organization ID */
  organizationId: string;
  /** Turnkey API base URL */
  apiBaseUrl: string;
  /** Current attestation quote */
  attestationQuote: PhalaAttestationQuote;
}

/**
 * Stamper interface for Turnkey API requests
 */
export interface AttestationStamper {
  /**
   * Generate a stamp for a Turnkey API request payload
   */
  stamp(payload: string): Promise<StampResult>;

  /**
   * Get the public key used for stamping
   */
  getPublicKey(): string;

  /**
   * Refresh the attestation quote
   */
  refreshAttestation(): Promise<void>;

  /**
   * Check if current attestation is valid
   */
  isAttestationValid(): boolean;

  /**
   * Get the current attestation quote
   */
  getAttestation(): PhalaAttestationQuote | null;
}

/**
 * Result of stamping operation
 */
export interface StampResult {
  /** Header name for the stamp */
  stampHeaderName: string;
  /** Header value containing attestation + signature */
  stampHeaderValue: string;
}

/**
 * Attestation stamp payload
 */
export interface AttestationStampPayload {
  /** Base64-encoded attestation quote */
  attestation: string;
  /** Base64-encoded signature over request payload */
  signature: string;
  /** Public key used for signing */
  publicKey: string;
  /** Timestamp of stamp creation */
  timestamp: number;
  /** Nonce for replay protection */
  nonce: string;
}

/**
 * Remote attestation request
 */
export interface RemoteAttestationRequest {
  /** Custom data to embed in quote */
  reportData?: Record<string, unknown>;
  /** Nonce for freshness */
  nonce?: string;
}

/**
 * Remote attestation response
 */
export interface RemoteAttestationResponse {
  /** Attestation quote */
  quote: PhalaAttestationQuote;
  /** Verification status */
  verified: boolean;
  /** Verification details */
  verificationDetails?: AttestationVerificationDetails;
}

/**
 * Details of attestation verification
 */
export interface AttestationVerificationDetails {
  /** Whether quote signature is valid */
  signatureValid: boolean;
  /** Whether MRENCLAVE matches expected */
  mrEnclaveMatch: boolean;
  /** Whether MRSIGNER matches expected */
  mrSignerMatch: boolean;
  /** Whether quote is not expired */
  notExpired: boolean;
  /** Whether security version is acceptable */
  securityVersionOk: boolean;
  /** Any verification warnings */
  warnings?: string[];
}

/**
 * TEE signing key pair
 */
export interface TEEKeyPair {
  /** Private key (never leaves TEE) */
  privateKey: Uint8Array;
  /** Public key (can be shared) */
  publicKey: string;
  /** Key algorithm */
  algorithm: "Ed25519" | "ECDSA-P256";
  /** Key creation timestamp */
  createdAt: number;
}

/**
 * Attestation provider configuration
 */
export interface AttestationProviderConfig {
  /** Phala attestation endpoint */
  attestationEndpoint: string;
  /** Quote validity duration (ms) */
  quoteValidityMs: number;
  /** Whether to auto-refresh quotes */
  autoRefresh: boolean;
  /** Refresh interval (ms) */
  refreshIntervalMs: number;
  /** Expected MRENCLAVE values (for verification) */
  expectedMrEnclave?: string[];
  /** Expected MRSIGNER values (for verification) */
  expectedMrSigner?: string[];
}

/**
 * Default attestation configuration
 */
export const DEFAULT_ATTESTATION_CONFIG: AttestationProviderConfig = {
  attestationEndpoint: "http://localhost:8090/attestation",
  quoteValidityMs: 60000, // 1 minute
  autoRefresh: true,
  refreshIntervalMs: 45000, // Refresh 15s before expiry
};

/**
 * Header names for attestation
 */
export const ATTESTATION_HEADERS = {
  /** Main attestation stamp header */
  STAMP: "X-Phala-Attestation-Stamp",
  /** Quote hash header */
  QUOTE_HASH: "X-Phala-Quote-Hash",
  /** Timestamp header */
  TIMESTAMP: "X-Phala-Timestamp",
  /** Nonce header */
  NONCE: "X-Phala-Nonce",
} as const;
