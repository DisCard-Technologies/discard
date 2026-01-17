/**
 * Privacy Storage - End-to-End Encrypted Convex Storage
 * 
 * Client-side library for storing encrypted privacy data in Convex.
 * 
 * SECURITY GUARANTEES:
 * - All sensitive data encrypted CLIENT-SIDE before sending to Convex
 * - User's wallet private key derives encryption keys (never stored)
 * - Convex cannot decrypt any sensitive data (E2EE)
 * - Storage is just for backup and cross-device sync
 * - User can always export and self-host their encrypted data
 * 
 * DECENTRALIZATION:
 * - User controls encryption keys (self-custody)
 * - Can switch to self-hosted storage anytime
 * - Convex is replaceable (not vendor lock-in)
 */

import { deriveEncryptionKey, encryptData, decryptData } from './crypto-utils';
import type { Id } from '@/convex/_generated/dataModel';

// ============================================================================
// Types
// ============================================================================

export interface StorageConfig {
  /** Convex action/query executor */
  convex: ConvexStorageActions;
  /** User's Convex ID */
  userId: Id<"users">;
  /** User's wallet private key (for deriving encryption keys) */
  userPrivateKey: Uint8Array;
}

/**
 * Convex actions for encrypted storage
 */
export type ConvexStorageActions = {
  // Credentials
  storeCredential: (args: {
    userId: Id<"users">;
    credentialId: string;
    encryptedData: string;
    credentialHash: string;
    attestationType: string;
    issuer: string;
    availableProofs: string[];
    expiresAt?: number;
  }) => Promise<{ success: boolean }>;
  
  getCredentials: (args: {
    userId: Id<"users">;
  }) => Promise<EncryptedCredential[]>;
  
  deleteCredential: (args: {
    userId: Id<"users">;
    credentialId: string;
  }) => Promise<{ success: boolean }>;
  
  // Deposit Notes
  storeDepositNote: (args: {
    userId: Id<"users">;
    noteId: string;
    encryptedNote: string;
    poolId: string;
  }) => Promise<{ success: boolean }>;
  
  getDepositNotes: (args: {
    userId: Id<"users">;
    includeSpent?: boolean;
  }) => Promise<EncryptedDepositNote[]>;
  
  markNoteSpent: (args: {
    userId: Id<"users">;
    noteId: string;
    txSignature: string;
  }) => Promise<{ success: boolean }>;
  
  // Shielded Commitments
  addShieldedCommitment: (args: {
    userId: Id<"users">;
    commitmentId: string;
    commitment: string;
    encryptedAmount: string;
    encryptedRandomness: string;
    nullifier: string;
    sourceType: string;
    sourceId: string;
  }) => Promise<{ success: boolean }>;
  
  getShieldedCommitments: (args: {
    userId: Id<"users">;
    includeSpent?: boolean;
  }) => Promise<EncryptedShieldedCommitment[]>;
  
  // Redemption Codes
  storeRedemptionCode: (args: {
    userId: Id<"users">;
    redemptionId: string;
    productType: string;
    brand: string;
    encryptedCode: string;
    redemptionUrl?: string;
    expiresAt?: number;
  }) => Promise<{ success: boolean }>;
  
  getRedemptionCodes: (args: {
    userId: Id<"users">;
    status?: string;
  }) => Promise<EncryptedRedemptionCode[]>;
};

export interface EncryptedCredential {
  credentialId: string;
  encryptedData: string;         // ENCRYPTED
  credentialHash: string;
  attestationType: string;
  issuer: string;
  availableProofs: string[];
  storedAt: number;
  expiresAt?: number;
}

export interface EncryptedDepositNote {
  noteId: string;
  encryptedNote: string;         // ENCRYPTED
  poolId: string;
  spent: boolean;
  createdAt: number;
  spentAt?: number;
}

export interface EncryptedShieldedCommitment {
  commitmentId: string;
  commitment: string;            // Public (hash)
  encryptedAmount: string;       // ENCRYPTED
  encryptedRandomness: string;   // ENCRYPTED
  nullifier: string;             // Public (hash)
  spent: boolean;
  sourceType: string;
  sourceId: string;
  createdAt: number;
}

export interface EncryptedRedemptionCode {
  redemptionId: string;
  productType: string;
  brand: string;
  encryptedCode: string;         // ENCRYPTED
  redemptionUrl?: string;
  status: string;
  expiresAt?: number;
  createdAt: number;
}

// ============================================================================
// Privacy Storage Service
// ============================================================================

export class PrivacyStorage {
  private config: StorageConfig;
  
  // Derived encryption keys (cached for performance)
  private keyCache: Map<string, Uint8Array> = new Map();

  constructor(config: StorageConfig) {
    this.config = config;
  }

  // ==========================================================================
  // Credential Storage (E2EE)
  // ==========================================================================

  /**
   * Store credential with client-side encryption
   */
  async storeCredential(credential: {
    credentialId: string;
    data: any;
    attestationType: string;
    issuer: string;
    availableProofs: string[];
    expiresAt?: number;
  }): Promise<{ success: boolean }> {
    console.log('[PrivacyStorage] Storing credential with E2EE:', credential.credentialId);
    
    try {
      // 1. Serialize credential data
      const plaintext = JSON.stringify(credential.data);
      
      // 2. Derive encryption key
      const encryptionKey = await this.getOrDeriveKey('credential-vault-v1');
      
      // 3. Encrypt client-side
      const encryptedData = encryptData(plaintext, encryptionKey);
      
      // 4. Hash for deduplication
      const credentialHash = await this.hashData(plaintext);
      
      // 5. Store encrypted blob in Convex
      const result = await this.config.convex.storeCredential({
        userId: this.config.userId,
        credentialId: credential.credentialId,
        encryptedData,
        credentialHash,
        attestationType: credential.attestationType,
        issuer: credential.issuer,
        availableProofs: credential.availableProofs,
        expiresAt: credential.expiresAt,
      });
      
      console.log('[PrivacyStorage] Credential encrypted and stored');
      return result;
    } catch (error) {
      console.error('[PrivacyStorage] Failed to store credential:', error);
      return { success: false };
    }
  }

  /**
   * Load and decrypt credentials
   */
  async loadCredentials(): Promise<Array<{
    credentialId: string;
    data: any;
    attestationType: string;
    issuer: string;
    availableProofs: string[];
    expiresAt?: number;
  }>> {
    console.log('[PrivacyStorage] Loading encrypted credentials');
    
    try {
      // 1. Fetch encrypted credentials from Convex
      const encrypted = await this.config.convex.getCredentials({
        userId: this.config.userId,
      });
      
      // 2. Derive decryption key
      const encryptionKey = await this.getOrDeriveKey('credential-vault-v1');
      
      // 3. Decrypt all credentials client-side
      const decrypted = [];
      for (const cred of encrypted) {
        try {
          const plaintext = decryptData(cred.encryptedData, encryptionKey);
          const data = JSON.parse(plaintext);
          
          decrypted.push({
            credentialId: cred.credentialId,
            data,
            attestationType: cred.attestationType,
            issuer: cred.issuer,
            availableProofs: cred.availableProofs,
            expiresAt: cred.expiresAt,
          });
        } catch (error) {
          console.error(`[PrivacyStorage] Failed to decrypt credential ${cred.credentialId}:`, error);
          // Skip corrupted/undecryptable credentials
        }
      }
      
      console.log(`[PrivacyStorage] Loaded ${decrypted.length} credentials`);
      return decrypted;
    } catch (error) {
      console.error('[PrivacyStorage] Failed to load credentials:', error);
      return [];
    }
  }

  // ==========================================================================
  // Deposit Notes Storage (E2EE)
  // ==========================================================================

  /**
   * Store deposit note with encryption
   */
  async storeDepositNote(note: {
    noteId: string;
    commitment: string;
    nullifier: string;
    encryptedAmount: string;
    poolId: string;
  }): Promise<{ success: boolean }> {
    console.log('[PrivacyStorage] Storing deposit note with E2EE:', note.noteId);
    
    try {
      // 1. Serialize note
      const plaintext = JSON.stringify(note);
      
      // 2. Derive encryption key
      const encryptionKey = await this.getOrDeriveKey('deposit-notes-v1');
      
      // 3. Encrypt entire note
      const encryptedNote = encryptData(plaintext, encryptionKey);
      
      // 4. Store in Convex
      const result = await this.config.convex.storeDepositNote({
        userId: this.config.userId,
        noteId: note.noteId,
        encryptedNote,
        poolId: note.poolId,
      });
      
      console.log('[PrivacyStorage] Deposit note encrypted and stored');
      return result;
    } catch (error) {
      console.error('[PrivacyStorage] Failed to store note:', error);
      return { success: false };
    }
  }

  /**
   * Load and decrypt deposit notes
   */
  async loadDepositNotes(includeSpent: boolean = false): Promise<Array<{
    noteId: string;
    commitment: string;
    nullifier: string;
    encryptedAmount: string;
    poolId: string;
    spent: boolean;
  }>> {
    console.log('[PrivacyStorage] Loading encrypted deposit notes');
    
    try {
      // 1. Fetch from Convex
      const encrypted = await this.config.convex.getDepositNotes({
        userId: this.config.userId,
        includeSpent,
      });
      
      // 2. Derive decryption key
      const encryptionKey = await this.getOrDeriveKey('deposit-notes-v1');
      
      // 3. Decrypt all notes
      const decrypted = [];
      for (const encNote of encrypted) {
        try {
          const plaintext = decryptData(encNote.encryptedNote, encryptionKey);
          const note = JSON.parse(plaintext);
          
          decrypted.push({
            ...note,
            spent: encNote.spent,
          });
        } catch (error) {
          console.error(`[PrivacyStorage] Failed to decrypt note ${encNote.noteId}:`, error);
        }
      }
      
      console.log(`[PrivacyStorage] Loaded ${decrypted.length} deposit notes`);
      return decrypted;
    } catch (error) {
      console.error('[PrivacyStorage] Failed to load notes:', error);
      return [];
    }
  }

  // ==========================================================================
  // Shielded Commitments Storage (Partially E2EE)
  // ==========================================================================

  /**
   * Store shielded balance commitment
   * 
   * Commitment and nullifier are public (hashes).
   * Amount and randomness are encrypted.
   */
  async storeShieldedCommitment(commitment: {
    commitmentId: string;
    commitment: string;
    amount: bigint;
    randomness: string;
    nullifier: string;
    sourceType: string;
    sourceId: string;
  }): Promise<{ success: boolean }> {
    console.log('[PrivacyStorage] Storing shielded commitment:', commitment.commitmentId);
    
    try {
      // 1. Derive encryption key
      const encryptionKey = await this.getOrDeriveKey('shielded-amounts-v1');
      
      // 2. Encrypt sensitive fields
      const encryptedAmount = encryptData(commitment.amount.toString(), encryptionKey);
      const encryptedRandomness = encryptData(commitment.randomness, encryptionKey);
      
      // 3. Store in Convex (commitment and nullifier are public)
      const result = await this.config.convex.addShieldedCommitment({
        userId: this.config.userId,
        commitmentId: commitment.commitmentId,
        commitment: commitment.commitment,        // Public hash
        encryptedAmount,                          // ENCRYPTED
        encryptedRandomness,                      // ENCRYPTED
        nullifier: commitment.nullifier,          // Public hash
        sourceType: commitment.sourceType,
        sourceId: commitment.sourceId,
      });
      
      console.log('[PrivacyStorage] Shielded commitment stored');
      return result;
    } catch (error) {
      console.error('[PrivacyStorage] Failed to store commitment:', error);
      return { success: false };
    }
  }

  /**
   * Load and decrypt shielded commitments
   */
  async loadShieldedCommitments(includeSpent: boolean = false): Promise<Array<{
    commitmentId: string;
    commitment: string;
    amount: bigint;
    randomness: string;
    nullifier: string;
    spent: boolean;
    sourceType: string;
    sourceId: string;
  }>> {
    console.log('[PrivacyStorage] Loading shielded commitments');
    
    try {
      // 1. Fetch from Convex
      const encrypted = await this.config.convex.getShieldedCommitments({
        userId: this.config.userId,
        includeSpent,
      });
      
      // 2. Derive decryption key
      const encryptionKey = await this.getOrDeriveKey('shielded-amounts-v1');
      
      // 3. Decrypt amounts and randomness
      const decrypted = [];
      for (const comm of encrypted) {
        try {
          const amount = BigInt(decryptData(comm.encryptedAmount, encryptionKey));
          const randomness = decryptData(comm.encryptedRandomness, encryptionKey);
          
          decrypted.push({
            commitmentId: comm.commitmentId,
            commitment: comm.commitment,
            amount,
            randomness,
            nullifier: comm.nullifier,
            spent: comm.spent,
            sourceType: comm.sourceType,
            sourceId: comm.sourceId,
          });
        } catch (error) {
          console.error(`[PrivacyStorage] Failed to decrypt commitment ${comm.commitmentId}:`, error);
        }
      }
      
      console.log(`[PrivacyStorage] Loaded ${decrypted.length} commitments`);
      return decrypted;
    } catch (error) {
      console.error('[PrivacyStorage] Failed to load commitments:', error);
      return [];
    }
  }

  // ==========================================================================
  // Gift Card Codes Storage (E2EE)
  // ==========================================================================

  /**
   * Store encrypted gift card/RWA code
   */
  async storeRedemptionCode(redemption: {
    redemptionId: string;
    productType: string;
    brand: string;
    code: string;
    redemptionUrl?: string;
    expiresAt?: number;
  }): Promise<{ success: boolean }> {
    console.log('[PrivacyStorage] Storing redemption code:', redemption.redemptionId);
    
    try {
      // 1. Derive encryption key
      const encryptionKey = await this.getOrDeriveKey('rwa-codes-v1');
      
      // 2. Encrypt code
      const encryptedCode = encryptData(redemption.code, encryptionKey);
      
      // 3. Store in Convex
      const result = await this.config.convex.storeRedemptionCode({
        userId: this.config.userId,
        redemptionId: redemption.redemptionId,
        productType: redemption.productType,
        brand: redemption.brand,
        encryptedCode,
        redemptionUrl: redemption.redemptionUrl,
        expiresAt: redemption.expiresAt,
      });
      
      console.log('[PrivacyStorage] Redemption code encrypted and stored');
      return result;
    } catch (error) {
      console.error('[PrivacyStorage] Failed to store redemption:', error);
      return { success: false };
    }
  }

  /**
   * Load and decrypt redemption codes
   */
  async loadRedemptionCodes(status?: string): Promise<Array<{
    redemptionId: string;
    productType: string;
    brand: string;
    code: string;
    redemptionUrl?: string;
    status: string;
    expiresAt?: number;
  }>> {
    console.log('[PrivacyStorage] Loading redemption codes');
    
    try {
      // 1. Fetch from Convex
      const encrypted = await this.config.convex.getRedemptionCodes({
        userId: this.config.userId,
        status,
      });
      
      // 2. Derive decryption key
      const encryptionKey = await this.getOrDeriveKey('rwa-codes-v1');
      
      // 3. Decrypt codes
      const decrypted = [];
      for (const enc of encrypted) {
        try {
          const code = decryptData(enc.encryptedCode, encryptionKey);
          
          decrypted.push({
            redemptionId: enc.redemptionId,
            productType: enc.productType,
            brand: enc.brand,
            code,
            redemptionUrl: enc.redemptionUrl,
            status: enc.status,
            expiresAt: enc.expiresAt,
          });
        } catch (error) {
          console.error(`[PrivacyStorage] Failed to decrypt code ${enc.redemptionId}:`, error);
        }
      }
      
      console.log(`[PrivacyStorage] Loaded ${decrypted.length} redemption codes`);
      return decrypted;
    } catch (error) {
      console.error('[PrivacyStorage] Failed to load codes:', error);
      return [];
    }
  }

  // ==========================================================================
  // Key Management (Client-Side)
  // ==========================================================================

  /**
   * Get or derive an encryption key for a specific context
   * 
   * Keys are derived from user's wallet private key.
   * Keys are cached for performance (cleared on logout).
   */
  private async getOrDeriveKey(context: string): Promise<Uint8Array> {
    // Check cache first
    if (this.keyCache.has(context)) {
      return this.keyCache.get(context)!;
    }
    
    // Derive key using HKDF
    const key = await deriveEncryptionKey(
      this.config.userPrivateKey,
      `discard-${context}`
    );
    
    // Cache for performance
    this.keyCache.set(context, key);
    
    return key;
  }

  /**
   * Clear key cache (call on logout)
   */
  clearKeyCache(): void {
    this.keyCache.clear();
    console.log('[PrivacyStorage] Key cache cleared');
  }

  /**
   * Hash data for integrity checking
   */
  private async hashData(data: string): Promise<string> {
    const encoder = new TextEncoder();
    const dataBytes = encoder.encode(data);
    const hashBuffer = await crypto.subtle.digest('SHA-256', dataBytes);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  }

  // ==========================================================================
  // Export/Import (User Data Portability)
  // ==========================================================================

  /**
   * Export all user's encrypted data
   * 
   * User can save this file and import elsewhere (data portability)
   */
  async exportEncryptedData(): Promise<string> {
    console.log('[PrivacyStorage] Exporting encrypted data');
    
    const exported = {
      version: 1,
      exportedAt: Date.now(),
      credentials: await this.config.convex.getCredentials({ userId: this.config.userId }),
      depositNotes: await this.config.convex.getDepositNotes({ userId: this.config.userId, includeSpent: true }),
      shieldedCommitments: await this.config.convex.getShieldedCommitments({ userId: this.config.userId, includeSpent: true }),
      redemptionCodes: await this.config.convex.getRedemptionCodes({ userId: this.config.userId }),
    };
    
    // Still encrypted - user needs their wallet key to decrypt
    return JSON.stringify(exported, null, 2);
  }

  /**
   * Check if user has data in cloud
   */
  async hasSyncedData(): Promise<boolean> {
    try {
      const credentials = await this.config.convex.getCredentials({ userId: this.config.userId });
      return credentials.length > 0;
    } catch {
      return false;
    }
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

let privacyStorageInstance: PrivacyStorage | null = null;

export function getPrivacyStorage(config?: StorageConfig): PrivacyStorage {
  if (!privacyStorageInstance && config) {
    privacyStorageInstance = new PrivacyStorage(config);
  }
  if (!privacyStorageInstance) {
    throw new Error('PrivacyStorage not initialized. Call with config first.');
  }
  return privacyStorageInstance;
}

export function initializePrivacyStorage(config: StorageConfig): PrivacyStorage {
  if (privacyStorageInstance) {
    privacyStorageInstance.clearKeyCache();
  }
  privacyStorageInstance = new PrivacyStorage(config);
  return privacyStorageInstance;
}
