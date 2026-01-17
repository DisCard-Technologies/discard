/**
 * DisCard 2035 - DID Manager
 *
 * High-level manager for DID operations including creation, resolution,
 * key rotation, and social recovery.
 */

import type {
  DIDString,
  AlexSovereignDIDDocument,
  P256PublicKeyJwk,
  VerificationMethod,
  RecoveryGuardian,
  DIDCommitment,
  DisCardServiceEndpoint,
} from './did-document';
import {
  createDID,
  createMinimalDIDDocument,
  parseDID,
  canonicalizeDIDDocument,
  getVerificationMethod,
  hasRecoveryCapability,
} from './did-document';
import {
  createDIDCommitment,
  computeKeyRotationCommitment,
  computeGuardianCommitment,
  generateRandomFieldElement,
  verifyCommitment,
} from './zk-commitment';
import * as SecureStore from 'expo-secure-store';
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';

// ============================================================================
// Types
// ============================================================================

export interface DIDManagerConfig {
  storagePrefix?: string;
  defaultRecoveryThreshold?: number;
}

export interface CreateDIDOptions {
  identifier?: string;
  publicKeyJwk: P256PublicKeyJwk;
  recoveryThreshold?: number;
  services?: DisCardServiceEndpoint[];
}

export interface KeyRotationRequest {
  did: DIDString;
  newPublicKeyJwk: P256PublicKeyJwk;
  reason?: string;
}

export interface RecoveryRequest {
  did: DIDString;
  newPublicKeyJwk: P256PublicKeyJwk;
  guardianAttestations: GuardianAttestation[];
}

export interface GuardianAttestation {
  guardianDid: DIDString;
  attestationHash: string;
  signature: Uint8Array;
  timestamp: number;
}

// ============================================================================
// DID Manager Class
// ============================================================================

export class DIDManager {
  private config: Required<DIDManagerConfig>;
  private documentCache: Map<DIDString, AlexSovereignDIDDocument> = new Map();

  constructor(config: DIDManagerConfig = {}) {
    this.config = {
      storagePrefix: config.storagePrefix ?? 'discard_did_',
      defaultRecoveryThreshold: config.defaultRecoveryThreshold ?? 2,
    };
  }

  // ==========================================================================
  // DID Creation
  // ==========================================================================

  /**
   * Create a new DID with the did:sol:zk method
   */
  async createDID(options: CreateDIDOptions): Promise<{
    document: AlexSovereignDIDDocument;
    commitment: DIDCommitment;
  }> {
    // Generate identifier if not provided
    const identifier = options.identifier ?? await this.generateIdentifier();
    const did = createDID(identifier);

    // Create minimal document
    const document = createMinimalDIDDocument(did, options.publicKeyJwk);

    // Apply options
    document.recoveryThreshold =
      options.recoveryThreshold ?? this.config.defaultRecoveryThreshold;

    if (options.services) {
      document.service = options.services;
    }

    // Generate commitment for on-chain anchoring
    const commitment = createDIDCommitment(document);

    // Store locally
    await this.storeDocument(did, document);

    // Cache
    this.documentCache.set(did, document);

    return { document, commitment };
  }

  /**
   * Generate a unique identifier for a new DID
   */
  private async generateIdentifier(): Promise<string> {
    const randomBytes = new Uint8Array(16);
    crypto.getRandomValues(randomBytes);
    const hash = sha256(randomBytes);
    // Take first 8 bytes and convert to base58-like string
    return bytesToHex(hash.slice(0, 8));
  }

  // ==========================================================================
  // DID Resolution
  // ==========================================================================

  /**
   * Resolve a DID to its document
   */
  async resolveDID(did: DIDString): Promise<AlexSovereignDIDDocument | null> {
    // Check cache first
    if (this.documentCache.has(did)) {
      return this.documentCache.get(did)!;
    }

    // Try local storage
    const stored = await this.loadDocument(did);
    if (stored) {
      this.documentCache.set(did, stored);
      return stored;
    }

    return null;
  }

  /**
   * Check if a DID exists locally
   */
  async didExists(did: DIDString): Promise<boolean> {
    try {
      const key = this.getStorageKey(did);
      const stored = await SecureStore.getItemAsync(key);
      return stored !== null;
    } catch {
      return false;
    }
  }

  // ==========================================================================
  // Key Management
  // ==========================================================================

  /**
   * Rotate the primary key for a DID
   */
  async rotateKey(request: KeyRotationRequest): Promise<{
    document: AlexSovereignDIDDocument;
    commitment: DIDCommitment;
    rotationCommitment: string;
  }> {
    const document = await this.resolveDID(request.did);
    if (!document) {
      throw new Error(`DID not found: ${request.did}`);
    }

    // Generate rotation commitment for verification
    const nonce = await generateRandomFieldElement();
    const rotationCommitment = computeKeyRotationCommitment(
      request.did,
      JSON.stringify(request.newPublicKeyJwk),
      nonce
    );

    // Create new verification method
    const keyIndex = (document.verificationMethod?.length ?? 0) + 1;
    const newKeyId = `${request.did}#key-${keyIndex}`;
    const newVerificationMethod: VerificationMethod = {
      id: newKeyId,
      type: 'JsonWebKey2020',
      controller: request.did,
      publicKeyJwk: request.newPublicKeyJwk,
    };

    // Update document
    const updatedDoc: AlexSovereignDIDDocument = {
      ...document,
      verificationMethod: [
        ...(document.verificationMethod ?? []),
        newVerificationMethod,
      ],
      authentication: [newKeyId], // New key becomes primary auth
      assertionMethod: [newKeyId],
      updated: new Date().toISOString(),
      keyRotationCount: (document.keyRotationCount ?? 0) + 1,
      lastKeyRotationAt: Date.now(),
    };

    // Generate new commitment
    const commitment = createDIDCommitment(updatedDoc);

    // Store updated document
    await this.storeDocument(request.did, updatedDoc);
    this.documentCache.set(request.did, updatedDoc);

    return {
      document: updatedDoc,
      commitment,
      rotationCommitment,
    };
  }

  /**
   * Get the current authentication key
   */
  async getAuthenticationKey(
    did: DIDString
  ): Promise<VerificationMethod | null> {
    const document = await this.resolveDID(did);
    if (!document || !document.authentication?.length) {
      return null;
    }

    // Get first authentication method
    const authRef = document.authentication[0];
    if (typeof authRef === 'string') {
      return getVerificationMethod(document, authRef) ?? null;
    }
    return authRef;
  }

  // ==========================================================================
  // Recovery Management
  // ==========================================================================

  /**
   * Add a recovery guardian to a DID
   */
  async addRecoveryGuardian(
    did: DIDString,
    guardian: Omit<RecoveryGuardian, 'addedAt' | 'status'>
  ): Promise<AlexSovereignDIDDocument> {
    const document = await this.resolveDID(did);
    if (!document) {
      throw new Error(`DID not found: ${did}`);
    }

    const newGuardian: RecoveryGuardian = {
      ...guardian,
      addedAt: Date.now(),
      status: 'active',
    };

    const updatedDoc: AlexSovereignDIDDocument = {
      ...document,
      recoveryGuardians: [...(document.recoveryGuardians ?? []), newGuardian],
      updated: new Date().toISOString(),
    };

    await this.storeDocument(did, updatedDoc);
    this.documentCache.set(did, updatedDoc);

    return updatedDoc;
  }

  /**
   * Revoke a recovery guardian
   */
  async revokeRecoveryGuardian(
    did: DIDString,
    guardianDid: DIDString
  ): Promise<AlexSovereignDIDDocument> {
    const document = await this.resolveDID(did);
    if (!document) {
      throw new Error(`DID not found: ${did}`);
    }

    const updatedGuardians = (document.recoveryGuardians ?? []).map((g) =>
      g.guardianDid === guardianDid ? { ...g, status: 'revoked' as const } : g
    );

    const updatedDoc: AlexSovereignDIDDocument = {
      ...document,
      recoveryGuardians: updatedGuardians,
      updated: new Date().toISOString(),
    };

    await this.storeDocument(did, updatedDoc);
    this.documentCache.set(did, updatedDoc);

    return updatedDoc;
  }

  /**
   * Initiate social recovery for a DID
   */
  async initiateRecovery(request: RecoveryRequest): Promise<{
    success: boolean;
    document?: AlexSovereignDIDDocument;
    commitment?: DIDCommitment;
    error?: string;
  }> {
    const document = await this.resolveDID(request.did);
    if (!document) {
      return { success: false, error: `DID not found: ${request.did}` };
    }

    // Verify threshold is met
    const threshold = document.recoveryThreshold ?? 2;
    const validAttestations = request.guardianAttestations.filter((att) => {
      const guardian = document.recoveryGuardians?.find(
        (g) => g.guardianDid === att.guardianDid && g.status === 'active'
      );
      if (!guardian) return false;

      // Verify attestation hash matches
      const expectedHash = computeGuardianCommitment(
        request.did,
        att.guardianDid,
        JSON.stringify(request.newPublicKeyJwk),
        att.timestamp
      );
      return expectedHash === att.attestationHash;
    });

    if (validAttestations.length < threshold) {
      return {
        success: false,
        error: `Insufficient guardian attestations: ${validAttestations.length}/${threshold}`,
      };
    }

    // Perform key rotation
    const result = await this.rotateKey({
      did: request.did,
      newPublicKeyJwk: request.newPublicKeyJwk,
      reason: 'Social recovery',
    });

    return {
      success: true,
      document: result.document,
      commitment: result.commitment,
    };
  }

  /**
   * Check if recovery is possible
   */
  async canRecover(did: DIDString): Promise<{
    possible: boolean;
    threshold: number;
    activeGuardians: number;
  }> {
    const document = await this.resolveDID(did);
    if (!document) {
      return { possible: false, threshold: 0, activeGuardians: 0 };
    }

    const threshold = document.recoveryThreshold ?? 0;
    const activeGuardians =
      document.recoveryGuardians?.filter((g) => g.status === 'active').length ??
      0;

    return {
      possible: activeGuardians >= threshold && threshold > 0,
      threshold,
      activeGuardians,
    };
  }

  // ==========================================================================
  // Service Management
  // ==========================================================================

  /**
   * Add a service endpoint to a DID
   */
  async addService(
    did: DIDString,
    service: DisCardServiceEndpoint
  ): Promise<AlexSovereignDIDDocument> {
    const document = await this.resolveDID(did);
    if (!document) {
      throw new Error(`DID not found: ${did}`);
    }

    const updatedDoc: AlexSovereignDIDDocument = {
      ...document,
      service: [...(document.service ?? []), service],
      updated: new Date().toISOString(),
    };

    await this.storeDocument(did, updatedDoc);
    this.documentCache.set(did, updatedDoc);

    return updatedDoc;
  }

  /**
   * Remove a service endpoint
   */
  async removeService(
    did: DIDString,
    serviceId: string
  ): Promise<AlexSovereignDIDDocument> {
    const document = await this.resolveDID(did);
    if (!document) {
      throw new Error(`DID not found: ${did}`);
    }

    const updatedDoc: AlexSovereignDIDDocument = {
      ...document,
      service: (document.service ?? []).filter((s) => s.id !== serviceId),
      updated: new Date().toISOString(),
    };

    await this.storeDocument(did, updatedDoc);
    this.documentCache.set(did, updatedDoc);

    return updatedDoc;
  }

  // ==========================================================================
  // Storage
  // ==========================================================================

  private getStorageKey(did: DIDString): string {
    // Hash the DID to create a storage key
    const hash = sha256(new TextEncoder().encode(did));
    return `${this.config.storagePrefix}${bytesToHex(hash.slice(0, 16))}`;
  }

  private async storeDocument(
    did: DIDString,
    document: AlexSovereignDIDDocument
  ): Promise<void> {
    const key = this.getStorageKey(did);
    const canonical = canonicalizeDIDDocument(document);
    await SecureStore.setItemAsync(key, canonical);
  }

  private async loadDocument(
    did: DIDString
  ): Promise<AlexSovereignDIDDocument | null> {
    try {
      const key = this.getStorageKey(did);
      const stored = await SecureStore.getItemAsync(key);
      if (!stored) return null;
      return JSON.parse(stored) as AlexSovereignDIDDocument;
    } catch {
      return null;
    }
  }

  /**
   * Delete a DID document (for testing/development)
   */
  async deleteDocument(did: DIDString): Promise<void> {
    const key = this.getStorageKey(did);
    await SecureStore.deleteItemAsync(key);
    this.documentCache.delete(did);
  }

  /**
   * Clear the in-memory cache
   */
  clearCache(): void {
    this.documentCache.clear();
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

let didManagerInstance: DIDManager | null = null;

export function getDIDManager(config?: DIDManagerConfig): DIDManager {
  if (!didManagerInstance || config) {
    didManagerInstance = new DIDManager(config);
  }
  return didManagerInstance;
}

// ============================================================================
// Convenience Exports
// ============================================================================

export { createDID, parseDID, hasRecoveryCapability, verifyCommitment };
