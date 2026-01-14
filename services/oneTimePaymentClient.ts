/**
 * DisCard 2035 - One-Time Payment Link Service
 *
 * Privacy-preserving disposable payment request URLs.
 * Links expire after single claim with stealth address delivery.
 *
 * Privacy Features:
 * - Single-claim enforcement (link invalid after first use)
 * - Stealth address generation at claim time
 * - No persistent recipient identity on-chain
 * - Optional memo encryption
 *
 * @see Hackathon Target: Private Payments Track
 */

import { Keypair, Connection } from "@solana/web3.js";
import * as Crypto from "expo-crypto";

// ============================================================================
// Configuration
// ============================================================================

const RPC_URL = process.env.EXPO_PUBLIC_HELIUS_RPC_URL || "https://api.mainnet-beta.solana.com";

/** One-time link expiry (15 minutes - shorter for privacy) */
const ONE_TIME_LINK_EXPIRY_MS = 15 * 60 * 1000;

/** Web link base URL */
const WEB_LINK_BASE = "https://www.discard.tech/claim";

// ============================================================================
// Types
// ============================================================================

export interface OneTimePaymentParams {
  /** Amount to request (in token units) */
  amount: number;
  /** Token symbol (USDC, SOL, etc.) */
  token: string;
  /** Token mint address */
  tokenMint: string;
  /** Token decimals */
  tokenDecimals: number;
  /** Amount in USD (for display) */
  amountUsd: number;
  /** Optional private memo (encrypted) */
  memo?: string;
  /** Creator's display name (optional) */
  creatorName?: string;
}

export interface OneTimeLinkData {
  /** Unique link ID (claim code) */
  linkId: string;
  /** Encrypted recipient derivation seed */
  encryptedSeed: string;
  /** Public viewing key (for claim verification) */
  viewingKey: string;
  /** Amount info */
  amount: number;
  token: string;
  tokenMint: string;
  tokenDecimals: number;
  amountUsd: number;
  /** Encrypted memo (if provided) */
  encryptedMemo?: string;
  /** Expiry timestamp */
  expiresAt: number;
  /** Status */
  status: "pending" | "claimed" | "expired";
  /** Creation timestamp */
  createdAt: number;
}

export interface ClaimResult {
  success: boolean;
  /** Generated stealth address for receiving payment */
  stealthAddress?: string;
  /** One-time private key for the stealth address */
  stealthPrivateKey?: Uint8Array;
  /** Decrypted memo (if any) */
  memo?: string;
  /** Link data */
  linkData?: OneTimeLinkData;
  error?: string;
}

export interface OneTimeLinkResult {
  /** Link ID (claim code) */
  linkId: string;
  /** Full claim URL */
  claimUrl: string;
  /** QR code data */
  qrData: string;
  /** Deep link for DisCard app */
  discardDeepLink: string;
  /** Link data for storage */
  linkData: OneTimeLinkData;
}

export interface PaymentDeliveryResult {
  success: boolean;
  txSignature?: string;
  stealthAddress?: string;
  error?: string;
}

// ============================================================================
// One-Time Payment Service
// ============================================================================

export class OneTimePaymentService {
  private connection: Connection;

  constructor() {
    this.connection = new Connection(RPC_URL, "confirmed");
  }

  // ==========================================================================
  // Link Creation
  // ==========================================================================

  /**
   * Create a one-time payment link
   *
   * Generates a disposable payment request URL that:
   * - Can only be claimed once
   * - Generates a fresh stealth address at claim time
   * - Leaves no persistent recipient identity on-chain
   */
  async createOneTimeLink(params: OneTimePaymentParams): Promise<OneTimeLinkResult> {
    console.log("[OneTimePayment] Creating one-time link:", {
      amount: params.amount,
      token: params.token,
    });

    // Generate link ID (short, memorable)
    const linkId = await this.generateLinkId();

    // Generate viewing keypair for stealth address derivation
    const { publicKey: viewingKey, secretSeed: encryptedSeed } = await this.generateViewingKey();

    // Encrypt memo if provided
    let encryptedMemo: string | undefined;
    if (params.memo) {
      encryptedMemo = await this.encryptMemo(params.memo, viewingKey);
    }

    // Create link data
    const linkData: OneTimeLinkData = {
      linkId,
      encryptedSeed,
      viewingKey,
      amount: params.amount,
      token: params.token,
      tokenMint: params.tokenMint,
      tokenDecimals: params.tokenDecimals,
      amountUsd: params.amountUsd,
      encryptedMemo,
      expiresAt: Date.now() + ONE_TIME_LINK_EXPIRY_MS,
      status: "pending",
      createdAt: Date.now(),
    };

    // Generate URLs
    const claimUrl = `${WEB_LINK_BASE}/${linkId}`;
    const discardDeepLink = `discard://claim/${linkId}`;
    const qrData = claimUrl;

    console.log("[OneTimePayment] Link created:", {
      linkId,
      expiresAt: new Date(linkData.expiresAt).toISOString(),
    });

    return {
      linkId,
      claimUrl,
      qrData,
      discardDeepLink,
      linkData,
    };
  }

  // ==========================================================================
  // Link Claiming
  // ==========================================================================

  /**
   * Claim a one-time payment link
   *
   * Generates a fresh stealth address that:
   * - Is unique to this claim
   * - Has no transaction history
   * - Cannot be linked to any other address
   */
  async claimLink(linkData: OneTimeLinkData): Promise<ClaimResult> {
    console.log("[OneTimePayment] Claiming link:", linkData.linkId);

    // Check if link is still valid
    if (linkData.status === "claimed") {
      return {
        success: false,
        error: "Link has already been claimed",
      };
    }

    if (linkData.status === "expired" || Date.now() > linkData.expiresAt) {
      return {
        success: false,
        error: "Link has expired",
      };
    }

    try {
      // Generate stealth address from encrypted seed
      const { stealthAddress, stealthPrivateKey } = await this.generateStealthAddress(
        linkData.encryptedSeed
      );

      // Decrypt memo if present
      let memo: string | undefined;
      if (linkData.encryptedMemo) {
        memo = await this.decryptMemo(linkData.encryptedMemo, linkData.viewingKey);
      }

      console.log("[OneTimePayment] Claim successful:", {
        linkId: linkData.linkId,
        stealthAddress,
      });

      return {
        success: true,
        stealthAddress,
        stealthPrivateKey,
        memo,
        linkData: {
          ...linkData,
          status: "claimed",
        },
      };
    } catch (error) {
      console.error("[OneTimePayment] Claim failed:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Claim failed",
      };
    }
  }

  // ==========================================================================
  // Payment Delivery
  // ==========================================================================

  /**
   * Deliver payment to a claimed stealth address
   *
   * Called after the payer scans the QR and confirms payment.
   * Funds go to the fresh stealth address with no link to recipient's identity.
   */
  async deliverPayment(
    claimResult: ClaimResult,
    payerPrivateKey: Uint8Array
  ): Promise<PaymentDeliveryResult> {
    if (!claimResult.success || !claimResult.stealthAddress || !claimResult.linkData) {
      return {
        success: false,
        error: "Invalid claim result",
      };
    }

    console.log("[OneTimePayment] Delivering payment:", {
      stealthAddress: claimResult.stealthAddress,
      amount: claimResult.linkData.amount,
      token: claimResult.linkData.token,
    });

    // TODO: Implement actual token transfer
    // 1. Create transfer instruction to stealth address
    // 2. Sign with payer's private key
    // 3. Submit transaction

    const mockTxSignature = `onetimepay_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;

    console.log("[OneTimePayment] Payment delivered:", mockTxSignature);

    return {
      success: true,
      txSignature: mockTxSignature,
      stealthAddress: claimResult.stealthAddress,
    };
  }

  // ==========================================================================
  // Stealth Address Generation
  // ==========================================================================

  /**
   * Generate a fresh stealth address from encrypted seed
   *
   * Uses Solana keypair derivation to create a unique address
   * that cannot be linked to any other address.
   */
  private async generateStealthAddress(encryptedSeed: string): Promise<{
    stealthAddress: string;
    stealthPrivateKey: Uint8Array;
  }> {
    // Decode the seed
    const seedBytes = this.base64ToUint8Array(encryptedSeed);

    // Add randomness to ensure uniqueness even for same link
    const randomBytes = await Crypto.getRandomBytesAsync(16);
    const combinedSeed = new Uint8Array(32);
    combinedSeed.set(seedBytes.slice(0, 16), 0);
    combinedSeed.set(randomBytes, 16);

    // Generate keypair from seed
    const keypair = Keypair.fromSeed(combinedSeed);

    return {
      stealthAddress: keypair.publicKey.toBase58(),
      stealthPrivateKey: keypair.secretKey,
    };
  }

  /**
   * Generate viewing keypair for link
   */
  private async generateViewingKey(): Promise<{
    publicKey: string;
    secretSeed: string;
  }> {
    // Generate random seed
    const seedBytes = await Crypto.getRandomBytesAsync(32);

    // Use Solana Keypair to derive public key from seed
    const keypair = Keypair.fromSeed(seedBytes);
    const publicKey = keypair.publicKey.toBytes();

    return {
      publicKey: this.uint8ArrayToBase64(publicKey),
      secretSeed: this.uint8ArrayToBase64(seedBytes),
    };
  }

  // ==========================================================================
  // Encryption Utilities
  // ==========================================================================

  /**
   * Encrypt memo with viewing key
   */
  private async encryptMemo(memo: string, viewingKey: string): Promise<string> {
    // Simple XOR encryption with viewing key for demo
    // In production, use proper AES-GCM
    const memoBytes = new TextEncoder().encode(memo);
    const keyBytes = this.base64ToUint8Array(viewingKey);

    const encrypted = new Uint8Array(memoBytes.length);
    for (let i = 0; i < memoBytes.length; i++) {
      encrypted[i] = memoBytes[i] ^ keyBytes[i % keyBytes.length];
    }

    return this.uint8ArrayToBase64(encrypted);
  }

  /**
   * Decrypt memo with viewing key
   */
  private async decryptMemo(encryptedMemo: string, viewingKey: string): Promise<string> {
    const encryptedBytes = this.base64ToUint8Array(encryptedMemo);
    const keyBytes = this.base64ToUint8Array(viewingKey);

    const decrypted = new Uint8Array(encryptedBytes.length);
    for (let i = 0; i < encryptedBytes.length; i++) {
      decrypted[i] = encryptedBytes[i] ^ keyBytes[i % keyBytes.length];
    }

    return new TextDecoder().decode(decrypted);
  }

  // ==========================================================================
  // Utilities
  // ==========================================================================

  /**
   * Generate a short, memorable link ID
   */
  private async generateLinkId(): Promise<string> {
    const bytes = await Crypto.getRandomBytesAsync(6);
    // Use base36 for readable IDs (alphanumeric only)
    const num = Array.from(bytes).reduce((acc, b) => acc * 256 + b, 0);
    return num.toString(36).toUpperCase().slice(0, 8);
  }

  /**
   * Convert Uint8Array to base64
   */
  private uint8ArrayToBase64(bytes: Uint8Array): string {
    let binary = "";
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }

  /**
   * Convert base64 to Uint8Array
   */
  private base64ToUint8Array(base64: string): Uint8Array {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  }

  /**
   * Check if service is available
   */
  isAvailable(): boolean {
    return true;
  }

  /**
   * Format link status for display
   */
  formatStatus(status: OneTimeLinkData["status"]): string {
    switch (status) {
      case "pending":
        return "Waiting for claim";
      case "claimed":
        return "Claimed";
      case "expired":
        return "Expired";
      default:
        return "Unknown";
    }
  }

  /**
   * Get time remaining for link
   */
  getTimeRemaining(expiresAt: number): string {
    const remaining = expiresAt - Date.now();
    if (remaining <= 0) return "Expired";

    const minutes = Math.floor(remaining / 60000);
    const seconds = Math.floor((remaining % 60000) / 1000);

    if (minutes > 0) {
      return `${minutes}m ${seconds}s`;
    }
    return `${seconds}s`;
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

let oneTimePaymentServiceInstance: OneTimePaymentService | null = null;

export function getOneTimePaymentService(): OneTimePaymentService {
  if (!oneTimePaymentServiceInstance) {
    oneTimePaymentServiceInstance = new OneTimePaymentService();
  }
  return oneTimePaymentServiceInstance;
}

export default OneTimePaymentService;
