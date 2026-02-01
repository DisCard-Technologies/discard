/**
 * Inco Lightning Service (BETA - Disabled by Default)
 *
 * TEE-based confidential compute for realtime spending limit verification.
 * Provides ~50ms latency vs 1-5s for ZK proof generation, critical for
 * meeting the 800ms Marqeta authorization deadline.
 *
 * STATUS: Inco SVM is currently in beta. This module is disabled by default.
 * PRIMARY PATH: Noir ZK proofs via sunspot-client.ts (production-ready)
 *
 * To enable when Inco mainnet is ready:
 * - Set INCO_ENABLED=true in environment
 * - Install incojs SDK when published
 * - Replace simulated calls with real SDK calls
 *
 * Key Features (when enabled):
 * - Encrypted balance handles (Euint128)
 * - TEE-based comparison operations via CPI
 * - Intel SGX attestation verification
 * - Fallback to Noir when Inco unavailable
 *
 * @see https://docs.inco.org
 */

import { Connection, PublicKey, Transaction, TransactionInstruction } from '@solana/web3.js';

// ============ TYPES ============

/**
 * Inco encrypted handle for confidential values
 * Represents an encrypted Euint128 stored on-chain
 */
export interface EncryptedHandle {
  /** The encrypted value handle (16 bytes, stored as hex) */
  handle: string;
  /** Public key used for encryption */
  publicKey: string;
  /** Epoch for handle validity/freshness */
  epoch: number;
  /** Timestamp when handle was created */
  createdAt: number;
}

/**
 * Result of a spending limit check
 */
export interface SpendingCheckResult {
  /** Whether the spending is allowed (balance >= amount) */
  allowed: boolean;
  /** Response time in milliseconds */
  responseTimeMs: number;
  /** TEE attestation data */
  attestation?: {
    /** SGX enclave quote */
    quote: string;
    /** Attestation timestamp */
    timestamp: number;
    /** Verification status */
    verified: boolean;
  };
  /** Error message if check failed */
  error?: string;
}

/**
 * Inco Lightning network configuration
 */
export interface IncoConfig {
  /** Solana RPC connection */
  connection: Connection;
  /** Inco Lightning program ID on Solana */
  incoProgramId: PublicKey;
  /** TEE network endpoint */
  teeEndpoint?: string;
  /** Network environment */
  network: 'devnet' | 'mainnet';
}

// ============ CONSTANTS ============

/**
 * Inco Lightning Solana Devnet program ID
 */
export const INCO_PROGRAM_ID_DEVNET = new PublicKey(
  '5sjEbPiqgZrYwR31ahR6Uk9wf5awoX61YGg7jExQSwaj'
);

/**
 * Inco Lightning Solana Mainnet program ID (placeholder)
 */
export const INCO_PROGRAM_ID_MAINNET = new PublicKey(
  'Inco1111111111111111111111111111111111111111' // Update when mainnet is available
);

/**
 * Default TEE endpoint
 */
export const INCO_TEE_ENDPOINT_DEVNET = 'https://lightning-devnet.inco.org';

/**
 * Target response time for spending checks (50ms)
 */
export const TARGET_RESPONSE_TIME_MS = 50;

/**
 * Maximum acceptable response time before warning (100ms)
 */
export const MAX_RESPONSE_TIME_MS = 100;

/**
 * Handle validity period (1 hour)
 */
export const HANDLE_VALIDITY_MS = 60 * 60 * 1000;

// ============ SERVICE CLASS ============

/**
 * Inco Lightning Service
 *
 * Provides TEE-based confidential compute for realtime spending verification.
 * Uses encrypted handles (Euint128) for balance storage and comparison.
 */
export class IncoLightningService {
  private config: IncoConfig;
  private initialized: boolean = false;

  constructor(config: IncoConfig) {
    this.config = config;
  }

  // ============ ENCRYPTION OPERATIONS ============

  /**
   * Encrypt a balance value for storage on-chain
   *
   * @param balance - The balance to encrypt (in smallest units, e.g., lamports)
   * @param publicKey - Optional public key for encryption (uses default if not provided)
   * @returns Encrypted handle for on-chain storage
   */
  async encryptBalance(
    balance: bigint,
    publicKey?: string
  ): Promise<EncryptedHandle> {
    console.log(`[Inco] Encrypting balance: ${balance}`);
    const startTime = Date.now();

    try {
      // In production, this would:
      // 1. Generate or use provided encryption key
      // 2. Call Inco SDK to encrypt the value
      // 3. Return the encrypted handle

      // For now, create a deterministic handle for development
      const handleBytes = new Uint8Array(16);
      const balanceBytes = this.bigintToBytes(balance, 8);
      const randomBytes = new Uint8Array(8);
      crypto.getRandomValues(randomBytes);

      handleBytes.set(balanceBytes, 0);
      handleBytes.set(randomBytes, 8);

      const handle = this.bytesToHex(handleBytes);
      const epoch = Math.floor(Date.now() / HANDLE_VALIDITY_MS);

      const encryptedHandle: EncryptedHandle = {
        handle,
        publicKey: publicKey || this.getDefaultPublicKey(),
        epoch,
        createdAt: Date.now(),
      };

      const responseTime = Date.now() - startTime;
      console.log(`[Inco] Balance encrypted in ${responseTime}ms, handle: ${handle.slice(0, 8)}...`);

      return encryptedHandle;
    } catch (error) {
      console.error('[Inco] Failed to encrypt balance:', error);
      throw new Error(`Inco encryption failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Check if encrypted balance is sufficient for a spending amount
   *
   * This is the critical path for Marqeta authorization - must respond in <100ms.
   *
   * @param handle - The encrypted balance handle
   * @param amount - The spending amount to check (plaintext, in smallest units)
   * @returns Whether the balance is sufficient
   */
  async checkSpendingLimit(
    handle: EncryptedHandle,
    amount: bigint
  ): Promise<SpendingCheckResult> {
    console.log(`[Inco] Checking spending limit: amount=${amount}`);
    const startTime = Date.now();

    try {
      // Validate handle freshness
      if (!this.isHandleValid(handle)) {
        return {
          allowed: false,
          responseTimeMs: Date.now() - startTime,
          error: 'Handle expired or invalid epoch',
        };
      }

      // In production, this would:
      // 1. Build CPI instruction to Inco program
      // 2. Call e_ge(encrypted_balance, amount) in TEE
      // 3. Return boolean result with attestation

      // For development, simulate the TEE check
      const result = await this.simulateTeeCheck(handle, amount);

      const responseTime = Date.now() - startTime;

      // Log performance warning if slow
      if (responseTime > MAX_RESPONSE_TIME_MS) {
        console.warn(`[Inco] Spending check slow: ${responseTime}ms (target: ${TARGET_RESPONSE_TIME_MS}ms)`);
      } else {
        console.log(`[Inco] Spending check completed in ${responseTime}ms`);
      }

      return {
        allowed: result.allowed,
        responseTimeMs: responseTime,
        attestation: result.attestation,
      };
    } catch (error) {
      const responseTime = Date.now() - startTime;
      console.error('[Inco] Spending check failed:', error);

      return {
        allowed: false,
        responseTimeMs: responseTime,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Update encrypted balance after a spending transaction
   *
   * Performs homomorphic subtraction: E(balance) - amount = E(balance - amount)
   *
   * @param handle - Current encrypted balance handle
   * @param spentAmount - Amount that was spent (plaintext)
   * @returns New encrypted handle with updated balance
   */
  async updateEncryptedBalance(
    handle: EncryptedHandle,
    spentAmount: bigint
  ): Promise<EncryptedHandle> {
    console.log(`[Inco] Updating encrypted balance after spending: ${spentAmount}`);
    const startTime = Date.now();

    try {
      // Validate handle
      if (!this.isHandleValid(handle)) {
        throw new Error('Cannot update invalid or expired handle');
      }

      // In production, this would:
      // 1. Call Inco SDK to perform encrypted subtraction
      // 2. Return new encrypted handle

      // For development, create new handle with updated epoch
      const newHandleBytes = new Uint8Array(16);
      const existingBytes = this.hexToBytes(handle.handle);

      // Copy and modify (simulation only)
      newHandleBytes.set(existingBytes, 0);
      // Update the random portion to indicate a new handle
      const randomBytes = new Uint8Array(4);
      crypto.getRandomValues(randomBytes);
      newHandleBytes.set(randomBytes, 12);

      const newHandle: EncryptedHandle = {
        handle: this.bytesToHex(newHandleBytes),
        publicKey: handle.publicKey,
        epoch: Math.floor(Date.now() / HANDLE_VALIDITY_MS),
        createdAt: Date.now(),
      };

      const responseTime = Date.now() - startTime;
      console.log(`[Inco] Balance updated in ${responseTime}ms`);

      return newHandle;
    } catch (error) {
      console.error('[Inco] Failed to update balance:', error);
      throw new Error(`Inco balance update failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  // ============ ATTESTATION VERIFICATION ============

  /**
   * Verify Intel SGX attestation from TEE
   *
   * @param attestation - Attestation data from spending check
   * @returns Whether attestation is valid
   */
  async verifyAttestation(attestation: {
    quote: string;
    timestamp: number;
    verified: boolean;
  }): Promise<boolean> {
    console.log('[Inco] Verifying TEE attestation');

    try {
      // In production, this would:
      // 1. Verify the SGX quote cryptographically
      // 2. Check attestation is recent (not stale)
      // 3. Verify enclave measurement matches expected

      // Check attestation is not too old (5 minutes)
      const maxAge = 5 * 60 * 1000;
      if (Date.now() - attestation.timestamp > maxAge) {
        console.warn('[Inco] Attestation is stale');
        return false;
      }

      // Trust the pre-verified flag for development
      return attestation.verified;
    } catch (error) {
      console.error('[Inco] Attestation verification failed:', error);
      return false;
    }
  }

  // ============ TRANSACTION BUILDING ============

  /**
   * Build CPI instruction for Inco spending check
   *
   * @param handle - Encrypted balance handle
   * @param amount - Spending amount to check
   * @param cardConfig - Card configuration PDA
   * @returns Transaction instruction for CPI
   */
  buildSpendingCheckInstruction(
    handle: EncryptedHandle,
    amount: bigint,
    cardConfig: PublicKey
  ): TransactionInstruction {
    // Instruction data: [discriminator (8)][handle (16)][amount (8)]
    const data = Buffer.alloc(32);
    data.writeUInt32LE(0x696e636f, 0); // 'inco' discriminator
    data.writeUInt32LE(0x63686b31, 4); // 'chk1' sub-discriminator

    const handleBytes = this.hexToBytes(handle.handle);
    data.set(handleBytes, 8);

    const amountBytes = this.bigintToBytes(amount, 8);
    data.set(amountBytes, 24);

    return new TransactionInstruction({
      keys: [
        { pubkey: cardConfig, isSigner: false, isWritable: false },
        { pubkey: this.config.incoProgramId, isSigner: false, isWritable: false },
      ],
      programId: this.config.incoProgramId,
      data,
    });
  }

  // ============ HANDLE MANAGEMENT ============

  /**
   * Check if an encrypted handle is still valid
   *
   * @param handle - Handle to check
   * @returns Whether handle is valid
   */
  isHandleValid(handle: EncryptedHandle): boolean {
    const currentEpoch = Math.floor(Date.now() / HANDLE_VALIDITY_MS);
    const age = Date.now() - handle.createdAt;

    // Handle must be from current or previous epoch
    if (handle.epoch < currentEpoch - 1) {
      return false;
    }

    // Handle must not be too old
    if (age > HANDLE_VALIDITY_MS * 2) {
      return false;
    }

    return true;
  }

  /**
   * Get handle epoch for validation
   */
  getCurrentEpoch(): number {
    return Math.floor(Date.now() / HANDLE_VALIDITY_MS);
  }

  // ============ INTERNAL HELPERS ============

  /**
   * Simulate TEE check for development
   */
  private async simulateTeeCheck(
    handle: EncryptedHandle,
    amount: bigint
  ): Promise<{
    allowed: boolean;
    attestation: {
      quote: string;
      timestamp: number;
      verified: boolean;
    };
  }> {
    // Simulate network latency (5-50ms)
    const latency = 5 + Math.random() * 45;
    await new Promise(resolve => setTimeout(resolve, latency));

    // For development, extract balance hint from handle and compare
    // In production, this happens entirely in the TEE
    const handleBytes = this.hexToBytes(handle.handle);
    const balanceHint = this.bytesToBigint(handleBytes.slice(0, 8));

    return {
      allowed: balanceHint >= amount,
      attestation: {
        quote: 'simulated-sgx-quote-' + Date.now().toString(16),
        timestamp: Date.now(),
        verified: true,
      },
    };
  }

  /**
   * Get default encryption public key
   */
  private getDefaultPublicKey(): string {
    // In production, this would be derived from user's DID or card config
    return 'inco-default-pubkey-' + this.config.network;
  }

  /**
   * Convert bigint to bytes (little-endian)
   */
  private bigintToBytes(value: bigint, length: number): Uint8Array {
    const bytes = new Uint8Array(length);
    let remaining = value;
    for (let i = 0; i < length; i++) {
      bytes[i] = Number(remaining & BigInt(0xff));
      remaining >>= BigInt(8);
    }
    return bytes;
  }

  /**
   * Convert bytes to bigint (little-endian)
   */
  private bytesToBigint(bytes: Uint8Array): bigint {
    let value = BigInt(0);
    for (let i = bytes.length - 1; i >= 0; i--) {
      value = (value << BigInt(8)) | BigInt(bytes[i]);
    }
    return value;
  }

  /**
   * Convert bytes to hex string
   */
  private bytesToHex(bytes: Uint8Array): string {
    return Array.from(bytes)
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
  }

  /**
   * Convert hex string to bytes
   */
  private hexToBytes(hex: string): Uint8Array {
    const cleanHex = hex.startsWith('0x') ? hex.slice(2) : hex;
    const bytes = new Uint8Array(cleanHex.length / 2);
    for (let i = 0; i < cleanHex.length; i += 2) {
      bytes[i / 2] = parseInt(cleanHex.substr(i, 2), 16);
    }
    return bytes;
  }
}

// ============ FACTORY ============

let incoInstance: IncoLightningService | null = null;

/**
 * Get Inco Lightning service instance
 */
export function getIncoLightningService(config?: Partial<IncoConfig>): IncoLightningService {
  if (!incoInstance) {
    const rpcUrl = process.env.EXPO_PUBLIC_HELIUS_RPC_URL || 'https://api.devnet.solana.com';
    const connection = new Connection(rpcUrl, 'confirmed');
    const network = rpcUrl.includes('mainnet') ? 'mainnet' : 'devnet';

    incoInstance = new IncoLightningService({
      connection,
      incoProgramId: network === 'mainnet' ? INCO_PROGRAM_ID_MAINNET : INCO_PROGRAM_ID_DEVNET,
      teeEndpoint: INCO_TEE_ENDPOINT_DEVNET,
      network,
      ...config,
    });
  }
  return incoInstance;
}

/**
 * Check if Inco Lightning is enabled
 *
 * NOTE: Inco SVM is currently in beta. Disabled by default.
 * Set INCO_ENABLED=true to opt-in once Inco goes to mainnet.
 * Primary path uses Noir ZK proofs (slower but production-ready).
 */
export function isIncoEnabled(): boolean {
  // Disabled by default - Inco SVM is in beta
  // Enable explicitly when Inco mainnet is ready
  return process.env.INCO_ENABLED === 'true' || process.env.EXPO_PUBLIC_INCO_ENABLED === 'true';
}

/**
 * Check if Inco is available for a specific card
 */
export function isIncoAvailableForCard(card: {
  encryptedBalanceHandle?: string | null;
  incoEpoch?: number | null;
}): boolean {
  if (!isIncoEnabled()) {
    return false;
  }

  if (!card.encryptedBalanceHandle) {
    return false;
  }

  // Check epoch is current
  const currentEpoch = Math.floor(Date.now() / HANDLE_VALIDITY_MS);
  if (card.incoEpoch && card.incoEpoch < currentEpoch - 1) {
    return false;
  }

  return true;
}
