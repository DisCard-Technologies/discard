/**
 * DisCard 2035 - Compressed Account Utilities
 *
 * High-level utilities for managing ZK-compressed accounts
 * for virtual cards, DID commitments, and policy states.
 */

import { PublicKey, TransactionInstruction } from "@solana/web3.js";
import {
  LightClient,
  getLightClient,
  CardStateData,
  DIDCommitmentData,
  CompressedProof,
} from "./light-client";
import { poseidon2 } from "poseidon-lite";
import { sha256 } from "@noble/hashes/sha256";
import { bytesToHex } from "@noble/hashes/utils";

// ============================================================================
// Types
// ============================================================================

export interface CreateCardAccountParams {
  cardId: string;
  ownerDid: string;
  ownerCommitment: string;
  initialBalance: bigint;
  spendingLimit: bigint;
  dailyLimit: bigint;
  monthlyLimit: bigint;
  merchantWhitelist?: string[];
  mccWhitelist?: number[];
}

export interface CreateDIDAccountParams {
  did: string;
  commitmentHash: string;
  documentHash: string;
  verificationMethodCount: number;
  recoveryThreshold: number;
}

export interface CardBalanceUpdate {
  cardId: string;
  newBalance: bigint;
  reason: "funding" | "spending" | "refund" | "adjustment";
}

export interface VelocityUpdate {
  cardId: string;
  spendAmount: bigint;
}

export interface AccountSyncResult {
  success: boolean;
  signature?: string;
  error?: string;
  stateHash?: string;
  leafIndex?: number;
}

// ============================================================================
// Compressed Account Manager
// ============================================================================

export class CompressedAccountManager {
  private lightClient: LightClient;

  constructor(lightClient?: LightClient) {
    this.lightClient = lightClient ?? getLightClient();
  }

  // ==========================================================================
  // Card Account Operations
  // ==========================================================================

  /**
   * Create a new compressed card account
   */
  async createCardAccount(
    payer: PublicKey,
    params: CreateCardAccountParams
  ): Promise<TransactionInstruction[]> {
    const now = BigInt(Date.now());

    const cardState: CardStateData = {
      cardId: params.cardId,
      ownerDid: params.ownerDid,
      ownerCommitment: params.ownerCommitment,
      balance: params.initialBalance,
      spendingLimit: params.spendingLimit,
      dailyLimit: params.dailyLimit,
      monthlyLimit: params.monthlyLimit,
      currentDailySpend: BigInt(0),
      currentMonthlySpend: BigInt(0),
      lastResetSlot: BigInt(0),
      isFrozen: false,
      merchantWhitelist: params.merchantWhitelist ?? [],
      mccWhitelist: params.mccWhitelist ?? [],
      createdAt: now,
      updatedAt: now,
    };

    return this.lightClient.createCompressedCardState(payer, cardState);
  }

  /**
   * Get card state from compressed account
   */
  async getCardState(cardId: string): Promise<CardStateData | null> {
    return this.lightClient.getCardState(cardId);
  }

  /**
   * Update card balance
   */
  async updateCardBalance(
    payer: PublicKey,
    update: CardBalanceUpdate
  ): Promise<TransactionInstruction[]> {
    // Get current account
    const addressSeed = this.generateSeed("card", update.cardId);
    const currentAccount = await this.lightClient.getCompressedAccount(addressSeed);

    if (!currentAccount) {
      throw new Error(`Card account not found: ${update.cardId}`);
    }

    // Get validity proof
    const proof = await this.lightClient.getValidityProof([currentAccount]);

    // Build update instructions
    return this.lightClient.updateCardBalance(
      payer,
      update.cardId,
      update.newBalance,
      currentAccount,
      proof
    );
  }

  /**
   * Record spending and update velocity counters
   */
  async recordSpending(
    payer: PublicKey,
    update: VelocityUpdate
  ): Promise<TransactionInstruction[]> {
    // Get current state
    const currentState = await this.getCardState(update.cardId);
    if (!currentState) {
      throw new Error(`Card not found: ${update.cardId}`);
    }

    // Check velocity limits
    const newDailySpend = currentState.currentDailySpend + update.spendAmount;
    const newMonthlySpend = currentState.currentMonthlySpend + update.spendAmount;

    if (newDailySpend > currentState.dailyLimit) {
      throw new Error("Daily spending limit exceeded");
    }

    if (newMonthlySpend > currentState.monthlyLimit) {
      throw new Error("Monthly spending limit exceeded");
    }

    // Get current account
    const addressSeed = this.generateSeed("card", update.cardId);
    const currentAccount = await this.lightClient.getCompressedAccount(addressSeed);

    if (!currentAccount) {
      throw new Error(`Card account not found: ${update.cardId}`);
    }

    // Get validity proof
    const proof = await this.lightClient.getValidityProof([currentAccount]);

    // Update state
    return this.lightClient.updateCompressedCardState(
      payer,
      update.cardId,
      {
        balance: currentState.balance - update.spendAmount,
        currentDailySpend: newDailySpend,
        currentMonthlySpend: newMonthlySpend,
      },
      currentAccount,
      proof
    );
  }

  /**
   * Freeze a card (emergency)
   */
  async freezeCard(
    payer: PublicKey,
    cardId: string
  ): Promise<TransactionInstruction[]> {
    const addressSeed = this.generateSeed("card", cardId);
    const currentAccount = await this.lightClient.getCompressedAccount(addressSeed);

    if (!currentAccount) {
      throw new Error(`Card account not found: ${cardId}`);
    }

    const proof = await this.lightClient.getValidityProof([currentAccount]);

    return this.lightClient.freezeCard(payer, cardId, currentAccount, proof);
  }

  /**
   * Check if card can process a transaction
   */
  async canProcessTransaction(
    cardId: string,
    amount: bigint,
    merchantId?: string,
    mccCode?: number
  ): Promise<{ allowed: boolean; reason?: string }> {
    const state = await this.getCardState(cardId);
    if (!state) {
      return { allowed: false, reason: "Card not found" };
    }

    if (state.isFrozen) {
      return { allowed: false, reason: "Card is frozen" };
    }

    if (amount > state.balance) {
      return { allowed: false, reason: "Insufficient balance" };
    }

    if (amount > state.spendingLimit) {
      return { allowed: false, reason: "Exceeds per-transaction limit" };
    }

    if (state.currentDailySpend + amount > state.dailyLimit) {
      return { allowed: false, reason: "Exceeds daily limit" };
    }

    if (state.currentMonthlySpend + amount > state.monthlyLimit) {
      return { allowed: false, reason: "Exceeds monthly limit" };
    }

    // Check merchant whitelist if enabled
    if (merchantId && state.merchantWhitelist.length > 0) {
      if (!state.merchantWhitelist.includes(merchantId)) {
        return { allowed: false, reason: "Merchant not in whitelist" };
      }
    }

    // Check MCC whitelist if enabled
    if (mccCode && state.mccWhitelist.length > 0) {
      if (!state.mccWhitelist.includes(mccCode)) {
        return { allowed: false, reason: "Merchant category not allowed" };
      }
    }

    return { allowed: true };
  }

  // ==========================================================================
  // DID Commitment Operations
  // ==========================================================================

  /**
   * Create a compressed DID commitment account
   */
  async createDIDCommitment(
    payer: PublicKey,
    params: CreateDIDAccountParams
  ): Promise<TransactionInstruction[]> {
    const now = BigInt(Date.now());

    const didCommitment: DIDCommitmentData = {
      did: params.did,
      commitmentHash: params.commitmentHash,
      documentHash: params.documentHash,
      verificationMethodCount: params.verificationMethodCount,
      recoveryThreshold: params.recoveryThreshold,
      activeGuardiansCount: 0,
      status: "active",
      lastKeyRotationSlot: BigInt(0),
      createdAt: now,
      updatedAt: now,
    };

    return this.lightClient.createCompressedDIDCommitment(payer, didCommitment);
  }

  /**
   * Get DID commitment from compressed account
   */
  async getDIDCommitment(did: string): Promise<DIDCommitmentData | null> {
    return this.lightClient.getDIDCommitment(did);
  }

  /**
   * Update DID commitment after key rotation
   */
  async updateDIDCommitment(
    payer: PublicKey,
    did: string,
    newCommitmentHash: string,
    newDocumentHash: string
  ): Promise<TransactionInstruction[]> {
    const addressSeed = this.generateSeed("did", did);
    const currentAccount = await this.lightClient.getCompressedAccount(addressSeed);

    if (!currentAccount) {
      throw new Error(`DID commitment not found: ${did}`);
    }

    const currentState = await this.getDIDCommitment(did);
    if (!currentState) {
      throw new Error(`DID state not found: ${did}`);
    }

    const proof = await this.lightClient.getValidityProof([currentAccount]);

    // Note: This would need to be implemented in the light-client
    // For now, return empty array as placeholder
    return [];
  }

  /**
   * Verify DID commitment exists on-chain
   */
  async verifyDIDCommitment(
    did: string,
    expectedCommitmentHash: string
  ): Promise<{ verified: boolean; onChainHash?: string }> {
    const commitment = await this.getDIDCommitment(did);

    if (!commitment) {
      return { verified: false };
    }

    return {
      verified: commitment.commitmentHash === expectedCommitmentHash,
      onChainHash: commitment.commitmentHash,
    };
  }

  // ==========================================================================
  // Batch Operations
  // ==========================================================================

  /**
   * Create multiple card accounts in a batch
   */
  async batchCreateCards(
    payer: PublicKey,
    cards: CreateCardAccountParams[]
  ): Promise<TransactionInstruction[]> {
    const allInstructions: TransactionInstruction[] = [];

    for (const card of cards) {
      const instructions = await this.createCardAccount(payer, card);
      allInstructions.push(...instructions);
    }

    return allInstructions;
  }

  /**
   * Get multiple card states
   */
  async batchGetCardStates(
    cardIds: string[]
  ): Promise<Map<string, CardStateData | null>> {
    const results = new Map<string, CardStateData | null>();

    for (const cardId of cardIds) {
      const state = await this.getCardState(cardId);
      results.set(cardId, state);
    }

    return results;
  }

  // ==========================================================================
  // State Hash Computation
  // ==========================================================================

  /**
   * Compute state hash for a card state (for verification)
   */
  computeCardStateHash(state: CardStateData): string {
    const data = JSON.stringify({
      cardId: state.cardId,
      ownerCommitment: state.ownerCommitment,
      balance: state.balance.toString(),
      isFrozen: state.isFrozen,
      updatedAt: state.updatedAt.toString(),
    });

    const hash = sha256(new TextEncoder().encode(data));
    return bytesToHex(hash);
  }

  /**
   * Compute state hash for a DID commitment
   */
  computeDIDCommitmentHash(commitment: DIDCommitmentData): string {
    const data = JSON.stringify({
      did: commitment.did,
      commitmentHash: commitment.commitmentHash,
      status: commitment.status,
      updatedAt: commitment.updatedAt.toString(),
    });

    const hash = sha256(new TextEncoder().encode(data));
    return bytesToHex(hash);
  }

  // ==========================================================================
  // Utility Methods
  // ==========================================================================

  private generateSeed(prefix: string, identifier: string): Uint8Array {
    const encoder = new TextEncoder();
    const combined = `${prefix}:${identifier}`;
    const bytes = encoder.encode(combined);

    const seed = new Uint8Array(32);
    for (let i = 0; i < bytes.length && i < 32; i++) {
      seed[i] = bytes[i];
    }
    return seed;
  }

  /**
   * Estimate rent savings from using compression
   */
  estimateRentSavings(
    accountCount: number,
    averageDataSize: number
  ): {
    standardRent: number;
    compressedRent: number;
    savings: number;
    savingsPercent: number;
  } {
    // Standard Solana rent: ~0.002 SOL per account
    const STANDARD_RENT_PER_ACCOUNT = 0.002;

    // Compressed rent: ~0.000002 SOL per leaf
    const COMPRESSED_RENT_PER_LEAF = 0.000002;

    const standardRent = accountCount * STANDARD_RENT_PER_ACCOUNT;
    const compressedRent = accountCount * COMPRESSED_RENT_PER_LEAF;
    const savings = standardRent - compressedRent;
    const savingsPercent = (savings / standardRent) * 100;

    return {
      standardRent,
      compressedRent,
      savings,
      savingsPercent,
    };
  }
}

// ============================================================================
// Factory Functions
// ============================================================================

let accountManagerInstance: CompressedAccountManager | null = null;

export function getCompressedAccountManager(
  lightClient?: LightClient
): CompressedAccountManager {
  if (!accountManagerInstance) {
    accountManagerInstance = new CompressedAccountManager(lightClient);
  }
  return accountManagerInstance;
}

// ============================================================================
// Utility Exports
// ============================================================================

/**
 * Convert cents to lamports-like bigint
 */
export function centsToCompressedUnits(cents: number): bigint {
  return BigInt(cents);
}

/**
 * Convert compressed units back to cents
 */
export function compressedUnitsToCents(units: bigint): number {
  return Number(units);
}

/**
 * Generate a unique card context hash
 */
export function generateCardContextHash(
  userId: string,
  cardIndex: number
): string {
  const data = `${userId}:card:${cardIndex}:${Date.now()}`;
  const hash = sha256(new TextEncoder().encode(data));
  return bytesToHex(hash);
}
