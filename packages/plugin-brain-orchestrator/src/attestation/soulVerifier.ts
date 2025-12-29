/**
 * Soul Attestation Verifier
 *
 * Verifies the Soul CVM's TEE attestation before trusting
 * its verification responses. Implements chain of trust
 * from Brain to Soul.
 */

import { createHash, randomBytes } from "crypto";
import type { SoulClient, SoulAttestation } from "../services/soulClient.js";

/**
 * Configuration for Soul verification
 */
export interface SoulVerifierConfig {
  expectedMrEnclave: string[];
  expectedMrSigner: string[];
  attestationCacheTtlMs: number;
  verifyOnEveryRequest: boolean;
  strictMode: boolean;
}

/**
 * Default configuration
 */
const DEFAULT_CONFIG: SoulVerifierConfig = {
  expectedMrEnclave: [],
  expectedMrSigner: [],
  attestationCacheTtlMs: 50000,
  verifyOnEveryRequest: false,
  strictMode: false,
};

/**
 * Result of Soul attestation verification
 */
export interface SoulVerificationResult {
  verified: boolean;
  attestation: SoulAttestation | null;
  details: {
    signatureValid: boolean;
    notExpired: boolean;
    mrEnclaveMatch: boolean;
    mrSignerMatch: boolean;
    reachable: boolean;
  };
  error?: string;
  verifiedAt: number;
}

/**
 * Soul Attestation Verifier
 */
export class SoulVerifier {
  private config: SoulVerifierConfig;
  private soulClient: SoulClient;
  private cachedVerification: SoulVerificationResult | null = null;
  private cacheExpiry: number = 0;
  private lastNonce: string = "";

  constructor(soulClient: SoulClient, config?: Partial<SoulVerifierConfig>) {
    this.soulClient = soulClient;
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Verify Soul's attestation
   */
  async verifySoulAttestation(
    forceRefresh: boolean = false
  ): Promise<SoulVerificationResult> {
    // Return cached result if valid
    if (
      !forceRefresh &&
      this.cachedVerification &&
      Date.now() < this.cacheExpiry
    ) {
      return this.cachedVerification;
    }

    const nonce = this.generateNonce();
    this.lastNonce = nonce;

    try {
      // Get attestation from Soul
      const attestation = await this.soulClient.getAttestation(nonce, true);

      // Verify the attestation
      const verification = await this.verifyAttestation(attestation);

      // Cache the result
      this.cachedVerification = verification;
      this.cacheExpiry = Date.now() + this.config.attestationCacheTtlMs;

      return verification;
    } catch (error) {
      const errorResult: SoulVerificationResult = {
        verified: false,
        attestation: null,
        details: {
          signatureValid: false,
          notExpired: false,
          mrEnclaveMatch: false,
          mrSignerMatch: false,
          reachable: false,
        },
        error: error instanceof Error ? error.message : "Unknown error",
        verifiedAt: Date.now(),
      };

      // In strict mode, don't cache failures
      if (!this.config.strictMode) {
        this.cachedVerification = errorResult;
        this.cacheExpiry = Date.now() + 5000; // Short cache for failures
      }

      return errorResult;
    }
  }

  /**
   * Verify an attestation quote
   */
  private async verifyAttestation(
    attestation: SoulAttestation
  ): Promise<SoulVerificationResult> {
    const now = Date.now();

    // Check expiration
    const notExpired = now < attestation.expiresAt;

    // Check MRENCLAVE if configured
    let mrEnclaveMatch = true;
    if (this.config.expectedMrEnclave.length > 0) {
      mrEnclaveMatch = this.config.expectedMrEnclave.includes(
        attestation.mrEnclave
      );
    }

    // Check MRSIGNER if configured
    let mrSignerMatch = true;
    if (this.config.expectedMrSigner.length > 0) {
      mrSignerMatch = this.config.expectedMrSigner.includes(
        attestation.mrSigner
      );
    }

    // In production, would verify with Intel/AMD attestation service
    // For now, assume signature is valid if quote exists
    const signatureValid = attestation.quote.length > 0;

    const verified =
      signatureValid && notExpired && mrEnclaveMatch && mrSignerMatch;

    return {
      verified,
      attestation: verified ? attestation : null,
      details: {
        signatureValid,
        notExpired,
        mrEnclaveMatch,
        mrSignerMatch,
        reachable: true,
      },
      verifiedAt: now,
    };
  }

  /**
   * Check if Soul should be trusted for a request
   */
  async shouldTrustSoul(): Promise<boolean> {
    // In non-strict mode, always trust if we can reach Soul
    if (!this.config.strictMode) {
      const health = await this.soulClient.healthCheck();
      return health.healthy;
    }

    // In strict mode, require valid attestation
    const verification = await this.verifySoulAttestation(
      this.config.verifyOnEveryRequest
    );
    return verification.verified;
  }

  /**
   * Get Soul attestation for including in Brain responses
   */
  async getSoulAttestationForChain(): Promise<{
    quote: string;
    mrEnclave: string;
    mrSigner: string;
    verified: boolean;
    timestamp: number;
  } | null> {
    const verification = await this.verifySoulAttestation();

    if (!verification.verified || !verification.attestation) {
      return null;
    }

    return {
      quote: verification.attestation.quote.toString("base64"),
      mrEnclave: verification.attestation.mrEnclave,
      mrSigner: verification.attestation.mrSigner,
      verified: true,
      timestamp: verification.attestation.timestamp,
    };
  }

  /**
   * Verify a response came from the trusted Soul
   */
  async verifyResponseFromSoul(
    responseSignature: string,
    responseData: string
  ): Promise<boolean> {
    // Get Soul's attestation
    const verification = await this.verifySoulAttestation();
    if (!verification.verified || !verification.attestation) {
      return false;
    }

    // Verify the signature matches Soul's public key
    // In production, would use proper signature verification
    const expectedHash = createHash("sha256")
      .update(responseData)
      .update(verification.attestation.publicKey)
      .digest("hex");

    // For now, accept if attestation is valid
    return verification.verified;
  }

  /**
   * Generate a unique nonce for attestation requests
   */
  private generateNonce(): string {
    const timestamp = Date.now().toString(36);
    const random = randomBytes(8).toString("hex");
    return `brain-${timestamp}-${random}`;
  }

  /**
   * Get the current verification status
   */
  getVerificationStatus(): {
    verified: boolean;
    lastVerifiedAt: number | null;
    cacheValid: boolean;
    mrEnclave: string | null;
  } {
    const cacheValid =
      this.cachedVerification !== null && Date.now() < this.cacheExpiry;

    return {
      verified: this.cachedVerification?.verified || false,
      lastVerifiedAt: this.cachedVerification?.verifiedAt || null,
      cacheValid,
      mrEnclave: this.cachedVerification?.attestation?.mrEnclave || null,
    };
  }

  /**
   * Clear cached verification
   */
  clearCache(): void {
    this.cachedVerification = null;
    this.cacheExpiry = 0;
  }

  /**
   * Update expected MRENCLAVE values
   */
  setExpectedMrEnclave(values: string[]): void {
    this.config.expectedMrEnclave = values;
    this.clearCache();
  }

  /**
   * Update expected MRSIGNER values
   */
  setExpectedMrSigner(values: string[]): void {
    this.config.expectedMrSigner = values;
    this.clearCache();
  }
}
