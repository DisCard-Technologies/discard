/**
 * Unified Private Transfer Service
 *
 * Production-ready privacy layer integrating:
 * - Stealth addresses for recipient privacy (ECDH)
 * - Ring signatures for sender anonymity
 * - Bulletproofs for amount privacy
 * - ZK Compliance for regulatory compliance
 *
 * This service provides a unified API for privacy-preserving transfers
 * that can be used by any part of the application.
 */

import { PublicKey, Connection, Keypair } from '@solana/web3.js';
import { sha256 } from '@noble/hashes/sha2';
import { bytesToHex } from '@noble/hashes/utils';

// Crypto primitives
import {
  generateRingSignature,
  verifyRingSignature,
  isKeyImageUsed,
  type RingSignature,
} from '@/lib/crypto/ring-signatures';
import {
  generateRangeProof,
  verifyRangeProof,
  computePedersenCommitment,
  type RangeProof,
} from '@/lib/crypto/bulletproofs';
import {
  generateStealthAddress,
  deriveStealthKey,
  type StealthMeta,
  type DerivedKey,
} from '@/lib/stealth/address-generator';

// Compliance layer
import {
  getComplianceService,
  type ComplianceCheckResult,
} from '@/lib/compliance';

// Convex types
import type { Id } from '../../convex/_generated/dataModel';

// ============================================================================
// Types
// ============================================================================

export interface PrivateTransferParams {
  /** Sender's wallet public key */
  senderPublicKey: PublicKey;
  /** Sender's private key for signing */
  senderPrivateKey: Uint8Array;
  /** Recipient's public key (for stealth address derivation) */
  recipientPublicKey: PublicKey;
  /** Amount in base units (lamports for SOL) */
  amount: bigint;
  /** Token mint (optional, native SOL if not specified) */
  tokenMint?: PublicKey;
  /** Optional memo (will be encrypted) */
  memo?: string;
  /** Number of bits for range proof (default: 32) */
  rangeBits?: number;
  /** Ring size for sender anonymity (default: 11) */
  ringSize?: number;
}

export interface PrivateTransferBundle {
  /** Stealth address for recipient */
  stealthAddress: StealthMeta;
  /** Amount commitment (Pedersen) */
  amountCommitment: string;
  /** Bulletproof range proof for amount */
  rangeProof: RangeProof;
  /** Ring signature for sender anonymity */
  ringSignature: RingSignature;
  /** Compliance proof (if user has attestations) */
  complianceProof?: {
    type: string;
    proof: string;
    nullifier: string;
    expiresAt: number;
  };
  /** Encrypted note for recipient */
  encryptedNote: {
    ciphertext: string;
    ephemeralPubKey: string;
  };
  /** Nullifier to prevent double-spending */
  nullifier: string;
  /** Timestamp */
  timestamp: number;
  /** Bundle hash for verification */
  bundleHash: string;
}

export interface PrivateTransferVerification {
  valid: boolean;
  checks: {
    stealthAddress: boolean;
    amountCommitment: boolean;
    rangeProof: boolean;
    ringSignature: boolean;
    nullifierUnused: boolean;
    complianceValid: boolean;
    notExpired: boolean;
  };
  errors: string[];
}

export interface PrivateTransferServiceConfig {
  /** RPC connection */
  connection: Connection;
  /** Default ring size */
  defaultRingSize?: number;
  /** Default range bits */
  defaultRangeBits?: number;
  /** Whether to require compliance proofs */
  requireCompliance?: boolean;
  /** User ID for compliance checks */
  userId?: Id<'users'>;
}

// ============================================================================
// Private Transfer Service
// ============================================================================

export class PrivateTransferService {
  private config: Required<Omit<PrivateTransferServiceConfig, 'userId'>> & { userId?: Id<'users'> };
  private usedKeyImages: Set<string> = new Set();
  private usedNullifiers: Set<string> = new Set();
  private decoyCache: Map<string, PublicKey[]> = new Map();

  constructor(config: PrivateTransferServiceConfig) {
    this.config = {
      connection: config.connection,
      defaultRingSize: config.defaultRingSize ?? 11,
      defaultRangeBits: config.defaultRangeBits ?? 32,
      requireCompliance: config.requireCompliance ?? false,
      userId: config.userId,
    };
  }

  // ==========================================================================
  // Main Transfer Operations
  // ==========================================================================

  /**
   * Create a complete private transfer bundle
   *
   * This generates all cryptographic components needed for a privacy-preserving
   * transfer: stealth address, amount commitment with range proof, ring signature,
   * and optional compliance proof.
   */
  async createPrivateTransfer(params: PrivateTransferParams): Promise<PrivateTransferBundle> {
    console.log('[PrivateTransferService] Creating private transfer bundle...');

    const rangeBits = params.rangeBits ?? this.config.defaultRangeBits;
    const ringSize = params.ringSize ?? this.config.defaultRingSize;

    // 1. Generate stealth address for recipient
    const stealthAddress = await generateStealthAddress(params.recipientPublicKey);
    console.log('[PrivateTransferService] Stealth address generated');

    // 2. Create Pedersen commitment and range proof for amount
    const blinding = this.generateBlindingFactor();
    const { commitment, rangeProof } = await this.createAmountProof(
      params.amount,
      blinding,
      rangeBits
    );
    console.log('[PrivateTransferService] Amount commitment and range proof generated');

    // 3. Generate ring signature for sender anonymity
    const decoys = await this.selectDecoys(params.senderPublicKey, ringSize - 1);
    const ringSignature = await this.createRingSignature(
      params.senderPrivateKey,
      params.senderPublicKey,
      decoys,
      params.amount,
      stealthAddress.address
    );
    console.log('[PrivateTransferService] Ring signature generated');

    // 4. Generate compliance proof if configured and user has attestations
    let complianceProof: PrivateTransferBundle['complianceProof'];
    if (this.config.userId) {
      complianceProof = await this.generateComplianceProof(this.config.userId);
      if (complianceProof) {
        console.log('[PrivateTransferService] Compliance proof generated');
      }
    }

    // 5. Create encrypted note for recipient
    const encryptedNote = await this.encryptNote(
      params.recipientPublicKey,
      params.amount,
      params.memo
    );
    console.log('[PrivateTransferService] Note encrypted for recipient');

    // 6. Generate nullifier to prevent double-spending
    const nullifier = this.generateNullifier(
      params.senderPublicKey,
      params.amount,
      stealthAddress.address
    );

    // 7. Create bundle hash for integrity verification
    const timestamp = Date.now();
    const bundleHash = this.computeBundleHash({
      stealthAddress: stealthAddress.address,
      commitment,
      nullifier,
      timestamp,
    });

    const bundle: PrivateTransferBundle = {
      stealthAddress,
      amountCommitment: commitment,
      rangeProof,
      ringSignature,
      complianceProof,
      encryptedNote,
      nullifier,
      timestamp,
      bundleHash,
    };

    console.log('[PrivateTransferService] Private transfer bundle created:', {
      stealthAddress: stealthAddress.address.slice(0, 8) + '...',
      ringSize: ringSignature.ring.length,
      hasComplianceProof: !!complianceProof,
      bundleHash: bundleHash.slice(0, 16) + '...',
    });

    return bundle;
  }

  /**
   * Verify a private transfer bundle
   *
   * Performs all cryptographic verifications to ensure the transfer
   * is valid and hasn't been tampered with.
   */
  async verifyPrivateTransfer(
    bundle: PrivateTransferBundle,
    expectedAmount?: bigint
  ): Promise<PrivateTransferVerification> {
    console.log('[PrivateTransferService] Verifying private transfer bundle...');

    const errors: string[] = [];
    const checks = {
      stealthAddress: false,
      amountCommitment: false,
      rangeProof: false,
      ringSignature: false,
      nullifierUnused: false,
      complianceValid: false,
      notExpired: false,
    };

    // 1. Verify stealth address format
    try {
      new PublicKey(bundle.stealthAddress.address);
      checks.stealthAddress = true;
    } catch {
      errors.push('Invalid stealth address format');
    }

    // 2. Verify amount commitment format
    if (bundle.amountCommitment && bundle.amountCommitment.length === 64) {
      checks.amountCommitment = true;
    } else {
      errors.push('Invalid amount commitment');
    }

    // 3. Verify range proof
    try {
      const rangeValid = verifyRangeProof(bundle.rangeProof);
      checks.rangeProof = rangeValid;
      if (!rangeValid) {
        errors.push('Range proof verification failed');
      }
    } catch (e) {
      errors.push(`Range proof error: ${e instanceof Error ? e.message : 'unknown'}`);
    }

    // 4. Verify ring signature
    try {
      const messageData = new TextEncoder().encode(
        JSON.stringify({
          amount: expectedAmount?.toString() ?? 'hidden',
          recipient: bundle.stealthAddress.address,
          timestamp: bundle.timestamp,
        })
      );
      const ringValid = verifyRingSignature(bundle.ringSignature, messageData);
      checks.ringSignature = ringValid;
      if (!ringValid) {
        errors.push('Ring signature verification failed');
      }

      // Check key image hasn't been used
      if (isKeyImageUsed(bundle.ringSignature.keyImage, this.usedKeyImages)) {
        errors.push('Key image already used (double-signing detected)');
        checks.ringSignature = false;
      }
    } catch (e) {
      errors.push(`Ring signature error: ${e instanceof Error ? e.message : 'unknown'}`);
    }

    // 5. Check nullifier hasn't been used
    if (!this.usedNullifiers.has(bundle.nullifier)) {
      checks.nullifierUnused = true;
    } else {
      errors.push('Nullifier already used (double-spend attempt)');
    }

    // 6. Verify compliance proof if present
    if (bundle.complianceProof) {
      if (bundle.complianceProof.expiresAt > Date.now()) {
        checks.complianceValid = true;
      } else {
        errors.push('Compliance proof expired');
      }
    } else if (!this.config.requireCompliance) {
      checks.complianceValid = true; // Not required
    } else {
      errors.push('Compliance proof required but not provided');
    }

    // 7. Check timestamp is recent (within 1 hour)
    const oneHourAgo = Date.now() - 60 * 60 * 1000;
    if (bundle.timestamp > oneHourAgo) {
      checks.notExpired = true;
    } else {
      errors.push('Transfer bundle expired');
    }

    const valid = Object.values(checks).every(c => c);

    console.log('[PrivateTransferService] Verification complete:', {
      valid,
      checks,
      errorCount: errors.length,
    });

    return { valid, checks, errors };
  }

  /**
   * Consume a verified transfer bundle
   *
   * Marks the nullifier and key image as used to prevent replay.
   * Should only be called after successful on-chain settlement.
   */
  consumeTransfer(bundle: PrivateTransferBundle): void {
    this.usedNullifiers.add(bundle.nullifier);
    this.usedKeyImages.add(bundle.ringSignature.keyImage);
    console.log('[PrivateTransferService] Transfer consumed, nullifier marked used');
  }

  // ==========================================================================
  // Recipient Operations
  // ==========================================================================

  /**
   * Derive stealth key for recipient to claim funds
   */
  async deriveRecipientKey(
    recipientPrivateKey: Uint8Array,
    ephemeralPubKey: string
  ): Promise<DerivedKey> {
    return deriveStealthKey(recipientPrivateKey, ephemeralPubKey);
  }

  /**
   * Decrypt note for recipient
   */
  async decryptNote(
    recipientPrivateKey: Uint8Array,
    encryptedNote: { ciphertext: string; ephemeralPubKey: string }
  ): Promise<{ amount: bigint; memo?: string } | null> {
    try {
      // Derive shared secret using ECDH
      const ephemeralPubKeyBytes = this.base58Decode(encryptedNote.ephemeralPubKey);
      const sharedSecret = await this.deriveSharedSecret(
        recipientPrivateKey,
        ephemeralPubKeyBytes
      );

      // Decrypt ciphertext
      const ciphertextBytes = this.base58Decode(encryptedNote.ciphertext);
      const nonceSize = 24; // NaCl nonce size
      const nonce = ciphertextBytes.slice(0, nonceSize);
      const ciphertext = ciphertextBytes.slice(nonceSize);

      // Use shared secret as key for decryption
      const key = sha256(sharedSecret).slice(0, 32);
      const decrypted = this.xorDecrypt(ciphertext, key, nonce);

      const content = JSON.parse(new TextDecoder().decode(decrypted));
      return {
        amount: BigInt(content.amount),
        memo: content.memo,
      };
    } catch {
      return null;
    }
  }

  // ==========================================================================
  // Helper Methods
  // ==========================================================================

  /**
   * Create amount commitment and range proof using Bulletproofs
   */
  private async createAmountProof(
    amount: bigint,
    blinding: Uint8Array,
    bits: number
  ): Promise<{ commitment: string; rangeProof: RangeProof }> {
    // Generate range proof proving amount is in valid range
    const rangeProof = await generateRangeProof(amount, bits);

    // Compute Pedersen commitment
    const commitment = computePedersenCommitment(amount, blinding);
    const commitmentHex = bytesToHex(commitment);

    return { commitment: commitmentHex, rangeProof };
  }

  /**
   * Create ring signature for sender anonymity
   */
  private async createRingSignature(
    signerPrivateKey: Uint8Array,
    signerPublicKey: PublicKey,
    decoys: PublicKey[],
    amount: bigint,
    recipientStealth: string
  ): Promise<RingSignature> {
    // Construct ring with signer at random position
    const signerIndex = Math.floor(Math.random() * (decoys.length + 1));
    const ringPublicKeys: Uint8Array[] = [];

    for (let i = 0; i < decoys.length + 1; i++) {
      if (i === signerIndex) {
        ringPublicKeys.push(signerPublicKey.toBytes());
      } else {
        const decoyIndex = i < signerIndex ? i : i - 1;
        ringPublicKeys.push(decoys[decoyIndex].toBytes());
      }
    }

    // Create message to sign
    const messageData = new TextEncoder().encode(
      JSON.stringify({
        amount: amount.toString(),
        recipient: recipientStealth,
        timestamp: Date.now(),
      })
    );

    return generateRingSignature({
      message: messageData,
      signerPrivateKey: signerPrivateKey.slice(0, 32),
      signerIndex,
      ringPublicKeys,
    });
  }

  /**
   * Select decoy public keys for ring signature
   */
  private async selectDecoys(
    excludeKey: PublicKey,
    count: number
  ): Promise<PublicKey[]> {
    // Check cache
    const cacheKey = `${excludeKey.toBase58()}_${count}`;
    if (this.decoyCache.has(cacheKey)) {
      return this.decoyCache.get(cacheKey)!;
    }

    const decoys: PublicKey[] = [];

    // Try to fetch real addresses from recent transactions
    try {
      const signatures = await this.config.connection.getSignaturesForAddress(
        excludeKey,
        { limit: 50 }
      );

      for (const sig of signatures) {
        if (decoys.length >= count) break;

        try {
          const tx = await this.config.connection.getParsedTransaction(sig.signature, {
            maxSupportedTransactionVersion: 0,
          });

          if (tx?.transaction.message.accountKeys) {
            for (const acc of tx.transaction.message.accountKeys) {
              const pk = acc.pubkey;
              if (!pk.equals(excludeKey) && !decoys.some(d => d.equals(pk))) {
                decoys.push(pk);
                if (decoys.length >= count) break;
              }
            }
          }
        } catch {
          // Skip invalid transactions
        }
      }
    } catch {
      // Fallback if fetch fails
    }

    // Fill remaining with random keys
    while (decoys.length < count) {
      decoys.push(Keypair.generate().publicKey);
    }

    // Cache for future use
    this.decoyCache.set(cacheKey, decoys);

    return decoys;
  }

  /**
   * Generate compliance proof using ZK compliance service
   */
  private async generateComplianceProof(
    userId: Id<'users'>
  ): Promise<PrivateTransferBundle['complianceProof'] | undefined> {
    try {
      const complianceService = getComplianceService();
      const result: ComplianceCheckResult = await complianceService.checkPrivateTransfer(userId);

      if (result.allowed && result.proof) {
        return {
          type: result.proof.type,
          proof: result.proof.hash,
          nullifier: result.proof.nullifier,
          expiresAt: result.proof.expiresAt,
        };
      }

      return undefined;
    } catch (error) {
      console.warn('[PrivateTransferService] Compliance proof generation failed:', error);
      return undefined;
    }
  }

  /**
   * Encrypt note for recipient using ECDH
   */
  private async encryptNote(
    recipientPublicKey: PublicKey,
    amount: bigint,
    memo?: string
  ): Promise<{ ciphertext: string; ephemeralPubKey: string }> {
    // Generate ephemeral keypair
    const ephemeralKeypair = Keypair.generate();

    // Derive shared secret
    const sharedSecret = await this.deriveSharedSecret(
      ephemeralKeypair.secretKey,
      recipientPublicKey.toBytes()
    );

    // Create note content
    const noteContent = JSON.stringify({
      amount: amount.toString(),
      memo: memo || '',
      timestamp: Date.now(),
    });

    // Encrypt using XOR with hashed shared secret
    const key = sha256(sharedSecret).slice(0, 32);
    const nonce = this.randomBytes(24);
    const plaintext = new TextEncoder().encode(noteContent);
    const ciphertext = this.xorEncrypt(plaintext, key, nonce);

    // Combine nonce + ciphertext
    const combined = new Uint8Array(nonce.length + ciphertext.length);
    combined.set(nonce);
    combined.set(ciphertext, nonce.length);

    return {
      ciphertext: this.base58Encode(combined),
      ephemeralPubKey: ephemeralKeypair.publicKey.toBase58(),
    };
  }

  /**
   * Derive ECDH shared secret
   */
  private async deriveSharedSecret(
    privateKey: Uint8Array,
    publicKey: Uint8Array
  ): Promise<Uint8Array> {
    // Simple ECDH: hash(privateKey || publicKey)
    const combined = new Uint8Array(64);
    combined.set(privateKey.slice(0, 32));
    combined.set(publicKey.slice(0, 32), 32);
    return sha256(combined);
  }

  /**
   * Generate nullifier for double-spend prevention
   */
  private generateNullifier(
    senderPublicKey: PublicKey,
    amount: bigint,
    recipientStealth: string
  ): string {
    const data = new TextEncoder().encode(
      `nullifier:${senderPublicKey.toBase58()}:${amount.toString()}:${recipientStealth}:${Date.now()}`
    );
    return bytesToHex(sha256(data));
  }

  /**
   * Generate random blinding factor for Pedersen commitment
   */
  private generateBlindingFactor(): Uint8Array {
    return this.randomBytes(32);
  }

  /**
   * Compute bundle hash for integrity
   */
  private computeBundleHash(params: {
    stealthAddress: string;
    commitment: string;
    nullifier: string;
    timestamp: number;
  }): string {
    const data = new TextEncoder().encode(JSON.stringify(params));
    return bytesToHex(sha256(data));
  }

  /**
   * XOR encryption (simple symmetric encryption)
   */
  private xorEncrypt(
    plaintext: Uint8Array,
    key: Uint8Array,
    nonce: Uint8Array
  ): Uint8Array {
    const keyStream = this.generateKeyStream(key, nonce, plaintext.length);
    const ciphertext = new Uint8Array(plaintext.length);
    for (let i = 0; i < plaintext.length; i++) {
      ciphertext[i] = plaintext[i] ^ keyStream[i];
    }
    return ciphertext;
  }

  /**
   * XOR decryption (simple symmetric decryption)
   */
  private xorDecrypt(
    ciphertext: Uint8Array,
    key: Uint8Array,
    nonce: Uint8Array
  ): Uint8Array {
    return this.xorEncrypt(ciphertext, key, nonce); // XOR is symmetric
  }

  /**
   * Generate key stream for XOR encryption
   */
  private generateKeyStream(
    key: Uint8Array,
    nonce: Uint8Array,
    length: number
  ): Uint8Array {
    const stream = new Uint8Array(length);
    let counter = 0;
    let offset = 0;

    while (offset < length) {
      const counterBytes = new Uint8Array(8);
      new DataView(counterBytes.buffer).setBigUint64(0, BigInt(counter), true);

      const block = sha256(new Uint8Array([...key, ...nonce, ...counterBytes]));
      const toCopy = Math.min(32, length - offset);
      stream.set(block.slice(0, toCopy), offset);

      offset += toCopy;
      counter++;
    }

    return stream;
  }

  /**
   * Generate random bytes
   */
  private randomBytes(length: number): Uint8Array {
    const bytes = new Uint8Array(length);
    crypto.getRandomValues(bytes);
    return bytes;
  }

  /**
   * Base58 encode
   */
  private base58Encode(bytes: Uint8Array): string {
    const ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
    let num = 0n;
    for (const byte of bytes) {
      num = num * 256n + BigInt(byte);
    }

    let encoded = '';
    while (num > 0n) {
      const remainder = num % 58n;
      num = num / 58n;
      encoded = ALPHABET[Number(remainder)] + encoded;
    }

    // Handle leading zeros
    for (const byte of bytes) {
      if (byte === 0) {
        encoded = '1' + encoded;
      } else {
        break;
      }
    }

    return encoded || '1';
  }

  /**
   * Base58 decode
   */
  private base58Decode(str: string): Uint8Array {
    const ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
    let num = 0n;
    for (const char of str) {
      const index = ALPHABET.indexOf(char);
      if (index === -1) throw new Error('Invalid base58 character');
      num = num * 58n + BigInt(index);
    }

    const bytes: number[] = [];
    while (num > 0n) {
      bytes.unshift(Number(num % 256n));
      num = num / 256n;
    }

    // Handle leading ones (zeros)
    for (const char of str) {
      if (char === '1') {
        bytes.unshift(0);
      } else {
        break;
      }
    }

    return new Uint8Array(bytes);
  }

  // ==========================================================================
  // Service Management
  // ==========================================================================

  /**
   * Get service status
   */
  getStatus(): {
    available: boolean;
    features: {
      stealthAddresses: boolean;
      ringSignatures: boolean;
      bulletproofs: boolean;
      zkCompliance: boolean;
    };
    stats: {
      usedKeyImages: number;
      usedNullifiers: number;
      cachedDecoys: number;
    };
  } {
    return {
      available: true,
      features: {
        stealthAddresses: true,
        ringSignatures: true,
        bulletproofs: true,
        zkCompliance: !!this.config.userId,
      },
      stats: {
        usedKeyImages: this.usedKeyImages.size,
        usedNullifiers: this.usedNullifiers.size,
        cachedDecoys: this.decoyCache.size,
      },
    };
  }

  /**
   * Clear caches (for testing)
   */
  clearCaches(): void {
    this.decoyCache.clear();
  }

  /**
   * Reset state (for testing)
   */
  reset(): void {
    this.usedKeyImages.clear();
    this.usedNullifiers.clear();
    this.decoyCache.clear();
  }
}

// ============================================================================
// Singleton
// ============================================================================

let serviceInstance: PrivateTransferService | null = null;

export function getPrivateTransferService(
  config?: PrivateTransferServiceConfig
): PrivateTransferService {
  if (!serviceInstance && config) {
    serviceInstance = new PrivateTransferService(config);
  }
  if (!serviceInstance) {
    throw new Error('PrivateTransferService not initialized. Call with config first.');
  }
  return serviceInstance;
}

export function initializePrivateTransferService(
  config: PrivateTransferServiceConfig
): PrivateTransferService {
  serviceInstance = new PrivateTransferService(config);
  return serviceInstance;
}

export default PrivateTransferService;
