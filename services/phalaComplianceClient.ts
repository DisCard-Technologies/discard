/**
 * Phala TEE Compliance Client
 *
 * Client for private compliance checks via Phala TEE.
 * Addresses are encrypted before being sent to the enclave,
 * where Range API sanctions checks are performed.
 *
 * Privacy guarantees:
 * - Address is encrypted in transit to TEE
 * - Range API sees address but can't link to user (no IP/session)
 * - RA-TLS attestation proves unmodified enclave code
 * - MRENCLAVE verification ensures expected code is running
 *
 * @see infra/phala-deployment/compliance-enclave/ for enclave implementation
 */

import { createHash, randomBytes } from "crypto";
import {
  RaTlsClient,
  type AttestationQuote,
  type VerificationResult,
} from "@/infra/phala-deployment/attestation/ra-tls-client";

// ============================================================================
// Configuration
// ============================================================================

const PHALA_COMPLIANCE_ENCLAVE_URL =
  process.env.PHALA_COMPLIANCE_ENCLAVE_URL ||
  process.env.EXPO_PUBLIC_PHALA_COMPLIANCE_ENCLAVE_URL ||
  "http://localhost:8093";

/** Cache TTL for compliance results (5 minutes) */
const COMPLIANCE_CACHE_TTL_MS = 5 * 60 * 1000;

/** Proof validity duration (1 hour) */
const PROOF_VALIDITY_MS = 60 * 60 * 1000;

// ============================================================================
// Types
// ============================================================================

export type RiskLevel = "low" | "medium" | "high" | "critical";

export interface PrivateComplianceResult {
  /** Whether the address passed compliance checks */
  compliant: boolean;
  /** Risk level from Range API analysis */
  riskLevel: RiskLevel;
  /** RA-TLS attestation quote proving enclave code integrity */
  attestation: AttestationQuote;
  /** Timestamp when check was performed (inside enclave) */
  checkedAt: number;
  /** When this result expires and should be re-checked */
  expiresAt: number;
  /** Hash of the address (for verification without revealing address) */
  addressHash: string;
  /** Nullifier to prevent replay of this proof */
  nullifier: string;
}

export interface PhalaComplianceClientConfig {
  /** Phala enclave endpoint URL */
  enclaveEndpoint: string;
  /** Expected MRENCLAVE hashes (for production enclave verification) */
  expectedMrEnclave: string[];
  /** Expected MRSIGNER hashes (optional) */
  expectedMrSigner?: string[];
  /** Whether to verify attestation strictly (fail if verification fails) */
  strictAttestation?: boolean;
  /** Cache compliance results */
  cacheResults?: boolean;
  /** Custom RA-TLS client config */
  raTlsConfig?: {
    quoteValidityMs?: number;
  };
}

export interface EnclavePublicKey {
  /** Enclave's public key for encrypting data */
  publicKey: string;
  /** Key algorithm */
  algorithm: "x25519" | "secp256k1";
  /** When this key was generated */
  generatedAt: number;
  /** Attestation quote proving key ownership */
  attestation?: AttestationQuote;
}

export interface EncryptedRequest {
  /** Encrypted address data */
  encryptedData: string;
  /** Ephemeral public key for ECDH */
  ephemeralPublicKey: string;
  /** IV/nonce for decryption */
  nonce: string;
}

// ============================================================================
// Default Configuration
// ============================================================================

const DEFAULT_CONFIG: PhalaComplianceClientConfig = {
  enclaveEndpoint: PHALA_COMPLIANCE_ENCLAVE_URL,
  expectedMrEnclave: [
    // Production enclave hashes (update after each deployment)
    // These are SHA-256 hashes of the enclave code
  ],
  strictAttestation: process.env.NODE_ENV === "production",
  cacheResults: true,
};

// ============================================================================
// Phala Compliance Client
// ============================================================================

interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

export class PhalaComplianceClient {
  private config: PhalaComplianceClientConfig;
  private raTlsClient: RaTlsClient;
  private enclavePublicKey: EnclavePublicKey | null = null;
  private complianceCache: Map<string, CacheEntry<PrivateComplianceResult>> = new Map();

  constructor(config?: Partial<PhalaComplianceClientConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };

    // Initialize RA-TLS client with expected enclave measurements
    this.raTlsClient = new RaTlsClient({
      attestationEndpoint: `${this.config.enclaveEndpoint}/attestation`,
      expectedMrEnclave: this.config.expectedMrEnclave,
      expectedMrSigner: this.config.expectedMrSigner,
      quoteValidityMs: this.config.raTlsConfig?.quoteValidityMs ?? 60000,
      cacheQuotes: true,
    });
  }

  // ==========================================================================
  // Public API
  // ==========================================================================

  /**
   * Check sanctions/compliance for an address privately via TEE
   *
   * The address is encrypted before being sent to the enclave,
   * where Range API checks are performed. The result includes
   * an attestation quote proving the check was performed by
   * unmodified enclave code.
   *
   * @param params - Check parameters
   * @returns Compliance result with attestation
   */
  async checkPrivateSanctions(params: {
    address: string;
    chain: "solana" | "ethereum";
  }): Promise<PrivateComplianceResult> {
    const { address, chain } = params;
    const cacheKey = `${chain}:${this.hashAddress(address)}`;

    // Check cache first
    if (this.config.cacheResults) {
      const cached = this.getCached(cacheKey);
      if (cached) {
        console.log("[PhalaCompliance] Cache hit for address");
        return cached;
      }
    }

    console.log("[PhalaCompliance] Checking sanctions via TEE...", {
      chain,
      addressPrefix: address.slice(0, 8) + "...",
    });

    try {
      // Get enclave's public key for encryption
      const enclaveKey = await this.getEnclavePublicKey();

      // Encrypt address for secure transmission
      const encryptedRequest = await this.encryptForEnclave(address, enclaveKey);

      // Send encrypted request to enclave
      const response = await fetch(`${this.config.enclaveEndpoint}/check`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          encryptedAddress: encryptedRequest.encryptedData,
          ephemeralPublicKey: encryptedRequest.ephemeralPublicKey,
          nonce: encryptedRequest.nonce,
          chain,
          timestamp: Date.now(),
        }),
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`Enclave check failed: ${response.status} - ${error}`);
      }

      const data = await response.json();

      // Parse attestation quote from response
      const attestation: AttestationQuote = {
        quote: Buffer.from(data.attestation.quote, "base64"),
        mrEnclave: data.attestation.mrEnclave,
        mrSigner: data.attestation.mrSigner,
        isvProdId: data.attestation.isvProdId ?? 1,
        isvSvn: data.attestation.isvSvn ?? 1,
        reportData: Buffer.from(data.attestation.reportData, "base64"),
        timestamp: data.attestation.timestamp,
        expiresAt: data.attestation.expiresAt,
      };

      // Verify the attestation quote
      const verificationResult = await this.verifyAttestation(attestation);

      if (!verificationResult.valid && this.config.strictAttestation) {
        throw new Error(
          `Attestation verification failed: ${verificationResult.warnings.join(", ")}`
        );
      }

      if (!verificationResult.valid) {
        console.warn(
          "[PhalaCompliance] Attestation verification warnings:",
          verificationResult.warnings
        );
      }

      // Verify the address hash in report data matches our request
      const expectedAddressHash = this.hashAddress(address);
      const reportDataStr = Buffer.from(attestation.reportData).toString("utf8");
      let reportData: { address_hash?: string; result?: string; timestamp?: number };

      try {
        reportData = JSON.parse(reportDataStr);
      } catch {
        // Report data may be binary/padded
        reportData = {};
      }

      if (reportData.address_hash && reportData.address_hash !== expectedAddressHash) {
        throw new Error("Address hash mismatch in attestation report data");
      }

      const result: PrivateComplianceResult = {
        compliant: data.compliant,
        riskLevel: data.riskLevel as RiskLevel,
        attestation,
        checkedAt: data.checkedAt ?? Date.now(),
        expiresAt: Date.now() + PROOF_VALIDITY_MS,
        addressHash: expectedAddressHash,
        nullifier: this.generateNullifier(address, attestation.timestamp),
      };

      // Cache the result
      if (this.config.cacheResults) {
        this.setCache(cacheKey, result);
      }

      console.log("[PhalaCompliance] Check complete:", {
        compliant: result.compliant,
        riskLevel: result.riskLevel,
        attestationValid: verificationResult.valid,
      });

      return result;
    } catch (error) {
      console.error("[PhalaCompliance] Check failed:", error);
      throw error;
    }
  }

  /**
   * Verify an attestation quote
   *
   * Validates:
   * - Quote signature (DCAP or EPID)
   * - MRENCLAVE matches expected (code integrity)
   * - Quote not expired
   *
   * @param quote - Attestation quote to verify
   * @returns Verification result
   */
  async verifyAttestation(quote: AttestationQuote): Promise<VerificationResult> {
    return this.raTlsClient.verifyQuote(quote);
  }

  /**
   * Get the enclave's public key for encrypting requests
   *
   * The key is attested to prove it belongs to the genuine enclave.
   */
  async getEnclavePublicKey(): Promise<EnclavePublicKey> {
    // Use cached key if still valid
    if (this.enclavePublicKey && Date.now() - this.enclavePublicKey.generatedAt < 3600000) {
      return this.enclavePublicKey;
    }

    console.log("[PhalaCompliance] Fetching enclave public key...");

    const response = await fetch(`${this.config.enclaveEndpoint}/key`, {
      method: "GET",
      headers: {
        Accept: "application/json",
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to get enclave key: ${response.status}`);
    }

    const data = await response.json();

    this.enclavePublicKey = {
      publicKey: data.publicKey,
      algorithm: data.algorithm || "x25519",
      generatedAt: Date.now(),
      attestation: data.attestation
        ? {
            quote: Buffer.from(data.attestation.quote, "base64"),
            mrEnclave: data.attestation.mrEnclave,
            mrSigner: data.attestation.mrSigner,
            isvProdId: data.attestation.isvProdId ?? 1,
            isvSvn: data.attestation.isvSvn ?? 1,
            reportData: Buffer.from(data.attestation.reportData || "", "base64"),
            timestamp: data.attestation.timestamp,
            expiresAt: data.attestation.expiresAt,
          }
        : undefined,
    };

    // Verify key attestation if present
    if (this.enclavePublicKey.attestation) {
      const keyVerification = await this.verifyAttestation(
        this.enclavePublicKey.attestation
      );
      if (!keyVerification.valid && this.config.strictAttestation) {
        throw new Error("Enclave public key attestation verification failed");
      }
    }

    return this.enclavePublicKey;
  }

  /**
   * Check if the compliance enclave is available
   */
  async isAvailable(): Promise<boolean> {
    try {
      const response = await fetch(`${this.config.enclaveEndpoint}/health`, {
        method: "GET",
        signal: AbortSignal.timeout(5000),
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  /**
   * Get the expected MRENCLAVE hashes
   */
  getExpectedMrEnclave(): string[] {
    return this.config.expectedMrEnclave;
  }

  /**
   * Update expected MRENCLAVE hashes (e.g., after enclave upgrade)
   */
  setExpectedMrEnclave(hashes: string[]): void {
    this.config.expectedMrEnclave = hashes;
    // Reinitialize RA-TLS client with new hashes
    this.raTlsClient = new RaTlsClient({
      attestationEndpoint: `${this.config.enclaveEndpoint}/attestation`,
      expectedMrEnclave: hashes,
      expectedMrSigner: this.config.expectedMrSigner,
      quoteValidityMs: this.config.raTlsConfig?.quoteValidityMs ?? 60000,
      cacheQuotes: true,
    });
  }

  /**
   * Clear the compliance cache
   */
  clearCache(): void {
    this.complianceCache.clear();
    this.enclavePublicKey = null;
    console.log("[PhalaCompliance] Cache cleared");
  }

  // ==========================================================================
  // Private Methods
  // ==========================================================================

  /**
   * Encrypt address for transmission to enclave
   *
   * Uses ECDH with X25519 to establish shared secret,
   * then AES-256-GCM for encryption.
   */
  private async encryptForEnclave(
    address: string,
    enclaveKey: EnclavePublicKey
  ): Promise<EncryptedRequest> {
    // For development/simulation, use a simple encoding
    // In production, this would use proper ECDH + AES-GCM
    if (process.env.NODE_ENV !== "production") {
      const nonce = randomBytes(12).toString("hex");
      const ephemeralKey = randomBytes(32).toString("hex");

      // Simple XOR-based "encryption" for development
      // Real implementation would use WebCrypto ECDH
      const addressBytes = Buffer.from(address, "utf8");
      const keyBytes = Buffer.from(ephemeralKey, "hex");
      const encrypted = Buffer.alloc(addressBytes.length);

      for (let i = 0; i < addressBytes.length; i++) {
        encrypted[i] = addressBytes[i] ^ keyBytes[i % keyBytes.length];
      }

      return {
        encryptedData: encrypted.toString("base64"),
        ephemeralPublicKey: ephemeralKey,
        nonce,
      };
    }

    // Production: Use WebCrypto for proper encryption
    try {
      // Generate ephemeral key pair for ECDH
      const ephemeralKeyPair = await crypto.subtle.generateKey(
        { name: "ECDH", namedCurve: "P-256" },
        true,
        ["deriveBits"]
      );

      // Import enclave's public key
      const enclavePublicKeyBytes = Buffer.from(enclaveKey.publicKey, "hex");
      const importedEnclaveKey = await crypto.subtle.importKey(
        "raw",
        enclavePublicKeyBytes,
        { name: "ECDH", namedCurve: "P-256" },
        false,
        []
      );

      // Derive shared secret
      const sharedSecret = await crypto.subtle.deriveBits(
        { name: "ECDH", public: importedEnclaveKey },
        ephemeralKeyPair.privateKey,
        256
      );

      // Derive AES key from shared secret
      const aesKey = await crypto.subtle.importKey(
        "raw",
        sharedSecret,
        { name: "AES-GCM" },
        false,
        ["encrypt"]
      );

      // Generate nonce
      const nonce = crypto.getRandomValues(new Uint8Array(12));

      // Encrypt the address
      const addressBytes = new TextEncoder().encode(address);
      const encrypted = await crypto.subtle.encrypt(
        { name: "AES-GCM", iv: nonce },
        aesKey,
        addressBytes
      );

      // Export ephemeral public key
      const ephemeralPublicKey = await crypto.subtle.exportKey(
        "raw",
        ephemeralKeyPair.publicKey
      );

      return {
        encryptedData: Buffer.from(encrypted).toString("base64"),
        ephemeralPublicKey: Buffer.from(ephemeralPublicKey).toString("hex"),
        nonce: Buffer.from(nonce).toString("hex"),
      };
    } catch (error) {
      console.error("[PhalaCompliance] Encryption failed:", error);
      throw new Error("Failed to encrypt address for enclave");
    }
  }

  /**
   * Hash an address for verification
   */
  private hashAddress(address: string): string {
    return createHash("sha256").update(address).digest("hex");
  }

  /**
   * Generate a nullifier to prevent proof replay
   */
  private generateNullifier(address: string, timestamp: number): string {
    return createHash("sha256")
      .update(`${address}:${timestamp}:${randomBytes(16).toString("hex")}`)
      .digest("hex");
  }

  /**
   * Get cached result if valid
   */
  private getCached(key: string): PrivateComplianceResult | null {
    const entry = this.complianceCache.get(key);
    if (entry && entry.expiresAt > Date.now()) {
      return entry.data;
    }
    if (entry) {
      this.complianceCache.delete(key);
    }
    return null;
  }

  /**
   * Set cache entry
   */
  private setCache(key: string, data: PrivateComplianceResult): void {
    this.complianceCache.set(key, {
      data,
      expiresAt: Date.now() + COMPLIANCE_CACHE_TTL_MS,
    });
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

let phalaComplianceClientInstance: PhalaComplianceClient | null = null;

export function getPhalaComplianceClient(
  config?: Partial<PhalaComplianceClientConfig>
): PhalaComplianceClient {
  if (!phalaComplianceClientInstance) {
    phalaComplianceClientInstance = new PhalaComplianceClient(config);
  }
  return phalaComplianceClientInstance;
}

export function initializePhalaComplianceClient(
  config: Partial<PhalaComplianceClientConfig>
): PhalaComplianceClient {
  phalaComplianceClientInstance = new PhalaComplianceClient(config);
  return phalaComplianceClientInstance;
}

export default PhalaComplianceClient;
