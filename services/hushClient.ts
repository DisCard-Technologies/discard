/**
 * Hush Client - Stealth Address Service
 *
 * Implements Hush-style stealth addresses for privacy-preserving card funding.
 * Each card top-up uses a fresh, disposable address that cannot be linked
 * to the user's main wallet.
 *
 * How it works:
 * 1. User has a master public key (from their wallet)
 * 2. For each transaction, generate ephemeral keypair
 * 3. Derive stealth address via ECDH: stealth = ECDH(user_pub, ephemeral_priv)
 * 4. Only the user can derive the private key to spend from stealth address
 */

import { Keypair, PublicKey } from '@solana/web3.js';
import * as ed25519 from '@noble/ed25519';

// ============ TYPES ============

/**
 * Stealth address result
 */
export interface StealthAddress {
  /** The stealth address (disposable, one-time use) */
  address: string;
  /** Ephemeral public key (published for recipient to derive) */
  ephemeralPubKey: string;
  /** Purpose of this address */
  purpose: 'card_funding' | 'merchant_payment' | 'p2p_transfer';
}

/**
 * Stealth address with private key (for scanning/spending)
 */
export interface StealthAddressWithKey extends StealthAddress {
  /** Private key for spending (derived by recipient) */
  privateKey: Uint8Array;
}

/**
 * Announcement for stealth address (published on-chain or via notification)
 */
export interface StealthAnnouncement {
  /** Stealth address */
  address: string;
  /** Ephemeral public key */
  ephemeralPubKey: string;
  /** Encrypted memo (optional) */
  encryptedMemo?: string;
  /** Timestamp */
  timestamp: number;
}

// ============ SERVICE CLASS ============

/**
 * Hush Stealth Address Service
 *
 * Generates disposable stealth addresses for private card funding.
 */
export class HushService {
  /**
   * Generate a stealth address for card funding
   *
   * @param recipientPubKey - Recipient's master public key
   * @param purpose - Purpose of the address
   * @returns Stealth address and ephemeral public key
   */
  async generateStealthAddress(
    recipientPubKey: string | PublicKey,
    purpose: StealthAddress['purpose'] = 'card_funding'
  ): Promise<StealthAddress> {
    const recipientKey = typeof recipientPubKey === 'string'
      ? new PublicKey(recipientPubKey)
      : recipientPubKey;

    // Generate ephemeral keypair
    const ephemeralKeypair = Keypair.generate();

    // Derive shared secret via ECDH
    // In production, this would use proper ECDH with ed25519 or x25519
    const sharedSecret = await this.deriveSharedSecret(
      ephemeralKeypair.secretKey,
      recipientKey.toBytes()
    );

    // Derive stealth address from shared secret
    const stealthKeypair = await this.deriveStealthKeypair(sharedSecret);

    console.log(`[Hush] Generated stealth address for ${purpose}: ${stealthKeypair.publicKey.toBase58()}`);

    return {
      address: stealthKeypair.publicKey.toBase58(),
      ephemeralPubKey: ephemeralKeypair.publicKey.toBase58(),
      purpose,
    };
  }

  /**
   * Derive stealth address private key (for recipient to spend)
   *
   * @param recipientPrivKey - Recipient's private key
   * @param ephemeralPubKey - Ephemeral public key from announcement
   * @returns Stealth address with private key
   */
  async deriveStealthPrivateKey(
    recipientPrivKey: Uint8Array,
    ephemeralPubKey: string | PublicKey
  ): Promise<StealthAddressWithKey> {
    const ephemeralKey = typeof ephemeralPubKey === 'string'
      ? new PublicKey(ephemeralPubKey)
      : ephemeralPubKey;

    // Derive shared secret (same as sender)
    const sharedSecret = await this.deriveSharedSecret(
      recipientPrivKey,
      ephemeralKey.toBytes()
    );

    // Derive stealth keypair (same derivation as sender)
    const stealthKeypair = await this.deriveStealthKeypair(sharedSecret);

    return {
      address: stealthKeypair.publicKey.toBase58(),
      ephemeralPubKey: ephemeralKey.toBase58(),
      purpose: 'card_funding', // Default, would be stored/retrieved
      privateKey: stealthKeypair.secretKey,
    };
  }

  /**
   * Check if a stealth address belongs to a recipient
   *
   * @param stealthAddress - Address to check
   * @param recipientPrivKey - Recipient's private key
   * @param ephemeralPubKey - Ephemeral public key
   * @returns True if address belongs to recipient
   */
  async isOwnAddress(
    stealthAddress: string,
    recipientPrivKey: Uint8Array,
    ephemeralPubKey: string
  ): Promise<boolean> {
    try {
      const derived = await this.deriveStealthPrivateKey(
        recipientPrivKey,
        ephemeralPubKey
      );
      return derived.address === stealthAddress;
    } catch {
      return false;
    }
  }

  /**
   * Scan announcements for addresses belonging to recipient
   *
   * @param announcements - List of stealth announcements
   * @param recipientPrivKey - Recipient's private key
   * @returns Matching addresses with private keys
   */
  async scanAnnouncements(
    announcements: StealthAnnouncement[],
    recipientPrivKey: Uint8Array
  ): Promise<StealthAddressWithKey[]> {
    const matches: StealthAddressWithKey[] = [];

    for (const announcement of announcements) {
      const isOwn = await this.isOwnAddress(
        announcement.address,
        recipientPrivKey,
        announcement.ephemeralPubKey
      );

      if (isOwn) {
        const derived = await this.deriveStealthPrivateKey(
          recipientPrivKey,
          announcement.ephemeralPubKey
        );
        matches.push(derived);
      }
    }

    return matches;
  }

  /**
   * Generate a batch of stealth addresses
   *
   * @param recipientPubKey - Recipient's master public key
   * @param count - Number of addresses to generate
   * @param purpose - Purpose of the addresses
   * @returns Array of stealth addresses
   */
  async generateBatch(
    recipientPubKey: string | PublicKey,
    count: number,
    purpose: StealthAddress['purpose'] = 'card_funding'
  ): Promise<StealthAddress[]> {
    const addresses: StealthAddress[] = [];

    for (let i = 0; i < count; i++) {
      const address = await this.generateStealthAddress(recipientPubKey, purpose);
      addresses.push(address);
    }

    return addresses;
  }

  // ============ INTERNAL HELPERS ============

  /**
   * Derive shared secret via ECDH
   * In production, use proper x25519 ECDH
   */
  private async deriveSharedSecret(
    privateKey: Uint8Array,
    publicKey: Uint8Array
  ): Promise<Uint8Array> {
    // Simplified ECDH simulation using hashing
    // In production, use @noble/curves for proper x25519
    const combined = new Uint8Array(privateKey.length + publicKey.length);
    combined.set(privateKey.slice(0, 32));
    combined.set(publicKey, 32);

    const hashBuffer = await crypto.subtle.digest('SHA-256', combined);
    return new Uint8Array(hashBuffer);
  }

  /**
   * Derive stealth keypair from shared secret
   */
  private async deriveStealthKeypair(sharedSecret: Uint8Array): Promise<Keypair> {
    // Use shared secret as seed for keypair
    // In production, use proper key derivation
    const seed = sharedSecret.slice(0, 32);
    return Keypair.fromSeed(seed);
  }
}

// ============ SINGLETON EXPORT ============

let hushInstance: HushService | null = null;

/**
 * Get Hush service instance (singleton)
 */
export function getHushService(): HushService {
  if (!hushInstance) {
    hushInstance = new HushService();
  }
  return hushInstance;
}

/**
 * Check if Hush is available
 * Hush is client-side only, always available
 */
export function isHushConfigured(): boolean {
  return true;
}
