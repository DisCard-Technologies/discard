/**
 * Private Identity Client
 *
 * Privacy-preserving identity verification using:
 * - Aztec Noir ZK circuits for selective disclosure proofs
 * - Arcium MXE for encrypted credential vault
 * - SAS attestations as the credential source
 *
 * Key Features:
 * 1. Encrypted Vault: Credentials encrypted with user's key, stored off-chain
 * 2. ZK Proofs: Prove claims without revealing underlying data
 * 3. Selective Disclosure: Share only what's needed for each context
 * 4. Privacy-Preserving Compliance: Pass Range checks without identity exposure
 *
 * Example: Prove "over 21" without revealing birthdate, name, or ID number
 *
 * @see https://noir-lang.org
 * @see https://docs.arcium.com
 */

import { getArciumMpcService, type EncryptedInput } from "./arciumMpcClient";
import { getRangeComplianceService } from "./rangeComplianceClient";
import type { AttestationType, AttestationData, AttestationIssuer } from "@/lib/attestations/sas-client";
import { deriveEncryptionKey, encryptData, decryptData } from "@/lib/crypto-utils";

// ============================================================================
// Types
// ============================================================================

/**
 * Supported ZK proof types for selective disclosure
 */
export type ZkProofType =
  | "age_minimum"        // Prove age >= threshold without revealing birthdate
  | "country_in_set"     // Prove country in allowed list without revealing which
  | "kyc_level"          // Prove KYC level >= threshold without revealing details
  | "aml_cleared"        // Prove AML clearance without revealing check details
  | "sanctions_cleared"  // Prove not on sanctions list
  | "accredited"         // Prove accredited investor status
  | "income_range"       // Prove income in range without revealing exact amount
  | "net_worth_range"    // Prove net worth in range
  | "custom";            // Custom proof with arbitrary circuit

/**
 * A stored credential in the encrypted vault
 */
export interface StoredCredential {
  /** Credential ID */
  id: string;
  /** Original attestation type */
  attestationType: AttestationType;
  /** Issuer of the attestation */
  issuer: AttestationIssuer;
  /** When the credential was stored */
  storedAt: number;
  /** When the credential expires */
  expiresAt?: number;
  /** Encrypted credential data (only user can decrypt) */
  encryptedData: string;
  /** Hash of the credential for verification */
  credentialHash: string;
  /** Available proof types for this credential */
  availableProofs: ZkProofType[];
}

/**
 * Request to generate a ZK proof
 */
export interface ZkProofRequest {
  /** Type of proof to generate */
  proofType: ZkProofType;
  /** Credential ID to prove from */
  credentialId: string;
  /** Proof parameters (e.g., minimum age) */
  parameters: Record<string, unknown>;
  /** Optional context (e.g., merchant name for audit trail) */
  context?: string;
  /** Expiry time for this proof */
  validUntil?: number;
}

/**
 * Generated ZK proof for selective disclosure
 */
export interface ZkProof {
  /** Proof ID */
  id: string;
  /** Type of proof */
  proofType: ZkProofType;
  /** The actual proof bytes (Noir proof) */
  proof: Uint8Array;
  /** Public inputs (what the verifier sees) */
  publicInputs: {
    /** What is being proven (e.g., "age >= 21") */
    claim: string;
    /** Issuer's public key hash (proves credential authenticity) */
    issuerKeyHash: string;
    /** Proof expiry timestamp */
    validUntil: number;
    /** Optional nonce for replay protection */
    nonce?: string;
  };
  /** When the proof was generated */
  generatedAt: number;
  /** Verification key identifier */
  verificationKeyId: string;
}

/**
 * Verification result
 */
export interface VerificationResult {
  /** Whether the proof is valid */
  valid: boolean;
  /** The verified claim */
  claim?: string;
  /** Error message if invalid */
  error?: string;
  /** Verification metadata */
  metadata?: {
    proofType: ZkProofType;
    issuer: string;
    verifiedAt: number;
  };
}

/**
 * Selective disclosure request from a verifier
 */
export interface DisclosureRequest {
  /** Request ID */
  requestId: string;
  /** Verifier's identity */
  verifier: {
    name: string;
    did?: string;
    website?: string;
  };
  /** Required proofs */
  requiredProofs: {
    proofType: ZkProofType;
    parameters: Record<string, unknown>;
    optional?: boolean;
  }[];
  /** Purpose of the request */
  purpose: string;
  /** Request expiry */
  expiresAt: number;
}

/**
 * Response to a disclosure request
 */
export interface DisclosureResponse {
  /** Request ID being responded to */
  requestId: string;
  /** Generated proofs */
  proofs: ZkProof[];
  /** User's DID (if they choose to reveal) */
  userDid?: string;
  /** Timestamp */
  respondedAt: number;
}

// ============================================================================
// Noir Circuit Definitions (Mock)
// ============================================================================

/**
 * Mock Noir circuit definitions
 * In production, these would be actual compiled Noir circuits
 */
const NOIR_CIRCUITS: Record<ZkProofType, {
  name: string;
  publicInputs: string[];
  privateInputs: string[];
}> = {
  age_minimum: {
    name: "age_minimum",
    publicInputs: ["minimum_age", "current_timestamp", "issuer_key_hash"],
    privateInputs: ["birthdate", "credential_signature"],
  },
  country_in_set: {
    name: "country_in_set",
    publicInputs: ["country_set_hash", "issuer_key_hash"],
    privateInputs: ["country_code", "credential_signature"],
  },
  kyc_level: {
    name: "kyc_level",
    publicInputs: ["minimum_level", "issuer_key_hash"],
    privateInputs: ["kyc_level", "kyc_data", "credential_signature"],
  },
  aml_cleared: {
    name: "aml_cleared",
    publicInputs: ["check_timestamp", "issuer_key_hash"],
    privateInputs: ["aml_result", "credential_signature"],
  },
  sanctions_cleared: {
    name: "sanctions_cleared",
    publicInputs: ["check_timestamp", "issuer_key_hash"],
    privateInputs: ["sanctions_result", "credential_signature"],
  },
  accredited: {
    name: "accredited_investor",
    publicInputs: ["jurisdiction", "issuer_key_hash"],
    privateInputs: ["accreditation_data", "credential_signature"],
  },
  income_range: {
    name: "income_range",
    publicInputs: ["min_income", "max_income", "issuer_key_hash"],
    privateInputs: ["income", "credential_signature"],
  },
  net_worth_range: {
    name: "net_worth_range",
    publicInputs: ["min_net_worth", "max_net_worth", "issuer_key_hash"],
    privateInputs: ["net_worth", "credential_signature"],
  },
  custom: {
    name: "custom",
    publicInputs: ["circuit_hash"],
    privateInputs: ["private_data"],
  },
};

// ============================================================================
// Service
// ============================================================================

export class PrivateIdentityService {
  private arcium = getArciumMpcService();
  private rangeCompliance = getRangeComplianceService();

  // Encrypted credential vault (in production, this would be decentralized storage)
  private vault: Map<string, StoredCredential> = new Map();

  // Generated proofs cache
  private proofCache: Map<string, ZkProof> = new Map();

  // User's vault encryption key (derived from their wallet)
  private vaultKey: Uint8Array | null = null;

  /**
   * Initialize the vault with user's key
   */
  async initializeVault(userPrivateKey: Uint8Array): Promise<boolean> {
    try {
      // Derive vault encryption key from user's wallet key
      this.vaultKey = await this.deriveVaultKey(userPrivateKey);
      console.log("[PrivateIdentity] Vault initialized");
      return true;
    } catch (error) {
      console.error("[PrivateIdentity] Vault initialization failed:", error);
      return false;
    }
  }

  /**
   * Store a credential in the encrypted vault
   */
  async storeCredential(
    attestation: AttestationData,
    userPrivateKey: Uint8Array
  ): Promise<StoredCredential | null> {
    console.log("[PrivateIdentity] Storing credential:", attestation.type);

    try {
      // Ensure vault is initialized
      if (!this.vaultKey) {
        await this.initializeVault(userPrivateKey);
      }

      // Serialize attestation data
      const credentialData = JSON.stringify({
        type: attestation.type,
        issuer: attestation.issuer,
        subjectDid: attestation.subjectDid,
        claims: attestation.claims,
        issuedAt: attestation.issuedAt,
        expiresAt: attestation.expiresAt,
        zkProof: attestation.zkProof ? Array.from(attestation.zkProof) : undefined,
      });

      // Encrypt with Arcium
      const encryptedData = await this.encryptCredential(credentialData, userPrivateKey);

      // Generate credential hash for verification
      const credentialHash = await this.hashCredential(credentialData);

      // Determine available proof types
      const availableProofs = this.getAvailableProofTypes(attestation.type);

      const credential: StoredCredential = {
        id: `cred_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        attestationType: attestation.type,
        issuer: attestation.issuer,
        storedAt: Date.now(),
        expiresAt: attestation.expiresAt,
        encryptedData,
        credentialHash,
        availableProofs,
      };

      this.vault.set(credential.id, credential);

      console.log("[PrivateIdentity] Credential stored:", {
        id: credential.id,
        type: credential.attestationType,
        availableProofs: credential.availableProofs,
      });

      return credential;
    } catch (error) {
      console.error("[PrivateIdentity] Store credential failed:", error);
      return null;
    }
  }

  /**
   * Generate a ZK proof for selective disclosure
   */
  async generateProof(
    request: ZkProofRequest,
    userPrivateKey: Uint8Array
  ): Promise<ZkProof | null> {
    console.log("[PrivateIdentity] Generating proof:", request.proofType);

    try {
      // Get credential from vault
      const credential = this.vault.get(request.credentialId);
      if (!credential) {
        throw new Error("Credential not found");
      }

      // Check if proof type is available for this credential
      if (!credential.availableProofs.includes(request.proofType)) {
        throw new Error(`Proof type ${request.proofType} not available for this credential`);
      }

      // Check credential expiry
      if (credential.expiresAt && Date.now() > credential.expiresAt) {
        throw new Error("Credential has expired");
      }

      // Decrypt credential for proof generation
      const decryptedData = await this.decryptCredential(
        credential.encryptedData,
        userPrivateKey
      );

      // Generate the ZK proof using Noir circuit
      const proof = await this.executeNoirCircuit(
        request.proofType,
        decryptedData,
        request.parameters
      );

      // Build claim string
      const claim = this.buildClaimString(request.proofType, request.parameters);

      const zkProof: ZkProof = {
        id: `proof_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        proofType: request.proofType,
        proof,
        publicInputs: {
          claim,
          issuerKeyHash: await this.hashIssuerKey(credential.issuer),
          validUntil: request.validUntil || Date.now() + 24 * 60 * 60 * 1000, // 24 hours default
          nonce: Math.random().toString(36).slice(2, 10),
        },
        generatedAt: Date.now(),
        verificationKeyId: `vk_${request.proofType}_v1`,
      };

      // Cache the proof
      this.proofCache.set(zkProof.id, zkProof);

      console.log("[PrivateIdentity] Proof generated:", {
        id: zkProof.id,
        claim: zkProof.publicInputs.claim,
        validUntil: new Date(zkProof.publicInputs.validUntil).toISOString(),
      });

      return zkProof;
    } catch (error) {
      console.error("[PrivateIdentity] Proof generation failed:", error);
      return null;
    }
  }

  /**
   * Verify a ZK proof
   */
  async verifyProof(proof: ZkProof): Promise<VerificationResult> {
    console.log("[PrivateIdentity] Verifying proof:", proof.id);

    try {
      // Check expiry
      if (Date.now() > proof.publicInputs.validUntil) {
        return {
          valid: false,
          error: "Proof has expired",
        };
      }

      // In production, this would verify the actual Noir proof
      // using the verification key on-chain
      const isValid = await this.verifyNoirProof(proof);

      if (isValid) {
        return {
          valid: true,
          claim: proof.publicInputs.claim,
          metadata: {
            proofType: proof.proofType,
            issuer: proof.publicInputs.issuerKeyHash,
            verifiedAt: Date.now(),
          },
        };
      } else {
        return {
          valid: false,
          error: "Proof verification failed",
        };
      }
    } catch (error) {
      console.error("[PrivateIdentity] Verification failed:", error);
      return {
        valid: false,
        error: error instanceof Error ? error.message : "Verification failed",
      };
    }
  }

  /**
   * Respond to a selective disclosure request
   */
  async respondToDisclosureRequest(
    request: DisclosureRequest,
    userPrivateKey: Uint8Array
  ): Promise<DisclosureResponse | null> {
    console.log("[PrivateIdentity] Responding to disclosure request:", request.requestId);

    try {
      // Check request hasn't expired
      if (Date.now() > request.expiresAt) {
        throw new Error("Disclosure request has expired");
      }

      const proofs: ZkProof[] = [];

      // Generate proofs for each required proof type
      for (const required of request.requiredProofs) {
        // Find a credential that can satisfy this proof
        const credential = this.findCredentialForProof(required.proofType);

        if (!credential) {
          if (required.optional) {
            console.log(`[PrivateIdentity] Skipping optional proof: ${required.proofType}`);
            continue;
          } else {
            throw new Error(`No credential available for required proof: ${required.proofType}`);
          }
        }

        const proof = await this.generateProof(
          {
            proofType: required.proofType,
            credentialId: credential.id,
            parameters: required.parameters,
            context: request.verifier.name,
            validUntil: request.expiresAt,
          },
          userPrivateKey
        );

        if (proof) {
          proofs.push(proof);
        } else if (!required.optional) {
          throw new Error(`Failed to generate required proof: ${required.proofType}`);
        }
      }

      const response: DisclosureResponse = {
        requestId: request.requestId,
        proofs,
        respondedAt: Date.now(),
      };

      console.log("[PrivateIdentity] Disclosure response generated:", {
        requestId: request.requestId,
        proofsGenerated: proofs.length,
      });

      return response;
    } catch (error) {
      console.error("[PrivateIdentity] Disclosure response failed:", error);
      return null;
    }
  }

  /**
   * Generate compliance proof for Range
   * Proves KYC/AML status without revealing identity
   */
  async generateComplianceProof(
    complianceRequirements: {
      minKycLevel?: number;
      requireAmlCleared?: boolean;
      requireSanctionsCleared?: boolean;
      allowedCountries?: string[];
    },
    userPrivateKey: Uint8Array
  ): Promise<{ proofs: ZkProof[]; complianceToken: string } | null> {
    console.log("[PrivateIdentity] Generating compliance proof for Range");

    try {
      const proofs: ZkProof[] = [];

      // Generate KYC level proof if required
      if (complianceRequirements.minKycLevel !== undefined) {
        const kycCredential = this.findCredentialForProof("kyc_level");
        if (kycCredential) {
          const proof = await this.generateProof(
            {
              proofType: "kyc_level",
              credentialId: kycCredential.id,
              parameters: { minimum_level: complianceRequirements.minKycLevel },
            },
            userPrivateKey
          );
          if (proof) proofs.push(proof);
        }
      }

      // Generate AML proof if required
      if (complianceRequirements.requireAmlCleared) {
        const amlCredential = this.findCredentialForProof("aml_cleared");
        if (amlCredential) {
          const proof = await this.generateProof(
            {
              proofType: "aml_cleared",
              credentialId: amlCredential.id,
              parameters: {},
            },
            userPrivateKey
          );
          if (proof) proofs.push(proof);
        }
      }

      // Generate sanctions proof if required
      if (complianceRequirements.requireSanctionsCleared) {
        const sanctionsCredential = this.findCredentialForProof("sanctions_cleared");
        if (sanctionsCredential) {
          const proof = await this.generateProof(
            {
              proofType: "sanctions_cleared",
              credentialId: sanctionsCredential.id,
              parameters: {},
            },
            userPrivateKey
          );
          if (proof) proofs.push(proof);
        }
      }

      // Generate country proof if required
      if (complianceRequirements.allowedCountries?.length) {
        const countryCredential = this.findCredentialForProof("country_in_set");
        if (countryCredential) {
          const proof = await this.generateProof(
            {
              proofType: "country_in_set",
              credentialId: countryCredential.id,
              parameters: { allowed_countries: complianceRequirements.allowedCountries },
            },
            userPrivateKey
          );
          if (proof) proofs.push(proof);
        }
      }

      // Generate compliance token for Range
      const complianceToken = await this.generateComplianceToken(proofs);

      return { proofs, complianceToken };
    } catch (error) {
      console.error("[PrivateIdentity] Compliance proof generation failed:", error);
      return null;
    }
  }

  /**
   * Get all stored credentials
   */
  getStoredCredentials(): StoredCredential[] {
    return Array.from(this.vault.values());
  }

  /**
   * Get credential by ID
   */
  getCredential(id: string): StoredCredential | undefined {
    return this.vault.get(id);
  }

  /**
   * Remove credential from vault
   */
  removeCredential(id: string): boolean {
    return this.vault.delete(id);
  }

  /**
   * Check if service is available
   */
  isAvailable(): boolean {
    return this.arcium.isConfigured();
  }

  // ==========================================================================
  // Private Helpers
  // ==========================================================================

  private async deriveVaultKey(userPrivateKey: Uint8Array): Promise<Uint8Array> {
    // In production, use proper key derivation (HKDF)
    const encoder = new TextEncoder();
    const info = encoder.encode("discard-vault-key-v1");

    // Mock derivation - would use actual HKDF in production
    const derived = new Uint8Array(32);
    for (let i = 0; i < 32; i++) {
      derived[i] = userPrivateKey[i % userPrivateKey.length] ^ info[i % info.length];
    }
    return derived;
  }

  private async encryptCredential(data: string, userPrivateKey: Uint8Array): Promise<string> {
    try {
      // Derive encryption key from user's private key using HKDF
      const encryptionKey = await deriveEncryptionKey(
        userPrivateKey,
        'discard-credential-encryption-v1'
      );
      
      // Encrypt with NaCl secretbox (XSalsa20-Poly1305)
      // This provides authenticated encryption with a random nonce
      const encrypted = encryptData(data, encryptionKey);
      
      console.log('[PrivateIdentity] Credential encrypted with NaCl secretbox');
      return encrypted;
    } catch (error) {
      console.error('[PrivateIdentity] Credential encryption failed:', error);
      throw new Error('Failed to encrypt credential');
    }
  }

  private async decryptCredential(encryptedData: string, userPrivateKey: Uint8Array): Promise<string> {
    try {
      // Derive same encryption key from user's private key
      const encryptionKey = await deriveEncryptionKey(
        userPrivateKey,
        'discard-credential-encryption-v1'
      );
      
      // Decrypt and verify MAC
      const decrypted = decryptData(encryptedData, encryptionKey);
      
      console.log('[PrivateIdentity] Credential decrypted successfully');
      return decrypted;
    } catch (error) {
      console.error('[PrivateIdentity] Credential decryption failed:', error);
      throw new Error('Failed to decrypt credential - wrong key or corrupted data');
    }
  }

  private async hashCredential(data: string): Promise<string> {
    // In production, use proper cryptographic hash
    const encoder = new TextEncoder();
    const dataBytes = encoder.encode(data);

    // Mock hash - would use SHA256 in production
    let hash = 0;
    for (let i = 0; i < dataBytes.length; i++) {
      hash = ((hash << 5) - hash) + dataBytes[i];
      hash = hash & hash;
    }
    return hash.toString(16).padStart(16, "0");
  }

  private async hashIssuerKey(issuer: AttestationIssuer): Promise<string> {
    // Hash the issuer's public key
    return `issuer_${issuer.id}_${issuer.name}`.split("").reduce((hash, char) => {
      return ((hash << 5) - hash) + char.charCodeAt(0);
    }, 0).toString(16).padStart(16, "0");
  }

  private getAvailableProofTypes(attestationType: AttestationType): ZkProofType[] {
    const proofMap: Record<string, ZkProofType[]> = {
      age_over_18: ["age_minimum"],
      age_over_21: ["age_minimum"],
      uk_resident: ["country_in_set"],
      eu_resident: ["country_in_set"],
      us_resident: ["country_in_set"],
      kyc_basic: ["kyc_level"],
      kyc_enhanced: ["kyc_level", "aml_cleared"],
      kyc_full: ["kyc_level", "aml_cleared", "sanctions_cleared"],
      aml_cleared: ["aml_cleared"],
      sanctions_cleared: ["sanctions_cleared"],
      accredited_investor: ["accredited", "income_range", "net_worth_range"],
      professional_investor: ["accredited"],
    };

    return proofMap[attestationType] || [];
  }

  private findCredentialForProof(proofType: ZkProofType): StoredCredential | undefined {
    for (const credential of this.vault.values()) {
      if (credential.availableProofs.includes(proofType)) {
        // Check not expired
        if (!credential.expiresAt || Date.now() < credential.expiresAt) {
          return credential;
        }
      }
    }
    return undefined;
  }

  private async executeNoirCircuit(
    proofType: ZkProofType,
    credentialData: string,
    parameters: Record<string, unknown>
  ): Promise<Uint8Array> {
    // In production, this would:
    // 1. Load the compiled Noir circuit
    // 2. Set up the witness with private inputs
    // 3. Generate the proof using Barretenberg

    console.log(`[PrivateIdentity] Executing Noir circuit: ${proofType}`);

    const circuit = NOIR_CIRCUITS[proofType];
    console.log(`[PrivateIdentity] Circuit inputs:`, {
      public: circuit.publicInputs,
      private: circuit.privateInputs,
    });

    // Mock proof generation
    const mockProof = new Uint8Array(256);
    for (let i = 0; i < 256; i++) {
      mockProof[i] = Math.floor(Math.random() * 256);
    }

    return mockProof;
  }

  private async verifyNoirProof(proof: ZkProof): Promise<boolean> {
    // In production, this would verify the proof on-chain or using Barretenberg
    // For demo, always return true if proof exists
    return proof.proof.length > 0;
  }

  private buildClaimString(proofType: ZkProofType, parameters: Record<string, unknown>): string {
    switch (proofType) {
      case "age_minimum":
        return `age >= ${parameters.minimum_age || parameters.minimumAge || 18}`;
      case "country_in_set":
        return `country in allowed list`;
      case "kyc_level":
        return `KYC level >= ${parameters.minimum_level || parameters.minimumLevel || 1}`;
      case "aml_cleared":
        return "AML check cleared";
      case "sanctions_cleared":
        return "Not on sanctions list";
      case "accredited":
        return "Accredited investor";
      case "income_range":
        return `income in range [${parameters.min_income}, ${parameters.max_income}]`;
      case "net_worth_range":
        return `net worth in range [${parameters.min_net_worth}, ${parameters.max_net_worth}]`;
      default:
        return `${proofType} verified`;
    }
  }

  private async generateComplianceToken(proofs: ZkProof[]): Promise<string> {
    // Generate a compliance token that can be verified by Range
    // This would be a signed bundle of proof commitments
    const proofHashes = proofs.map(p => p.id).join(",");
    const timestamp = Date.now();
    return Buffer.from(`compliance:${proofHashes}:${timestamp}`).toString("base64");
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

let privateIdentityServiceInstance: PrivateIdentityService | null = null;

export function getPrivateIdentityService(): PrivateIdentityService {
  if (!privateIdentityServiceInstance) {
    privateIdentityServiceInstance = new PrivateIdentityService();
  }
  return privateIdentityServiceInstance;
}

export default PrivateIdentityService;
