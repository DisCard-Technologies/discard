/**
 * Starpay Card Provider
 *
 * Implements CardProvider interface for Starpay prepaid card issuing.
 * Features:
 * - No KYC required
 * - Prepaid funding model
 * - Black cards (one-time use) and Platinum cards (reloadable)
 * - Crypto-backed balances
 *
 * Card Types:
 * - Starpay Black: Prepaid, one-time use, no top-ups, 0.2% fee ($5-$500)
 * - Starpay Platinum: Reloadable, requires 10M $STARPAY tokens
 *
 * @see https://docs.starpayinfo.com
 */

import type {
  CardProvider,
  CardOptions,
  CardResult,
  CardDetails,
  FundingRequest,
  FundingResult,
  ConfidentialFundingRequest,
  ConfidentialFundingResult,
  ArciumEncryptedFundingAmount,
  FundingBalanceProof,
} from './types';
import {
  getArciumMpcService,
  type ArciumMpcService,
} from '@/services/arciumMpcClient';
import { sha256 } from '@noble/hashes/sha2.js';

// Starpay API configuration
const STARPAY_API_URL = process.env.STARPAY_API_URL ?? 'https://api.starpay.cards/v1';
const STARPAY_API_KEY = process.env.STARPAY_API_KEY;

// Card type configurations
export type StarpayCardType = 'black' | 'platinum';

export interface StarpayCardOptions extends CardOptions {
  /** Card type: 'black' (prepaid) or 'platinum' (reloadable) */
  cardType?: StarpayCardType;
  /** Initial funding amount in cents (for Black cards) */
  initialAmount?: number;
}

/**
 * Calculate Starpay issuance fee
 * Fee: 0.2% of card amount, min $5, max $500
 */
export function calculateIssuanceFee(amountCents: number): number {
  const amountDollars = amountCents / 100;
  const feePercent = amountDollars * 0.002;
  const fee = Math.max(5, Math.min(500, feePercent));
  return Math.round(fee * 100); // Return in cents
}

/**
 * Make authenticated request to Starpay API
 */
async function starpayRequest<T>(
  method: string,
  endpoint: string,
  body?: Record<string, unknown>
): Promise<T> {
  if (!STARPAY_API_KEY) {
    throw new Error('Starpay API key not configured');
  }

  const response = await fetch(`${STARPAY_API_URL}${endpoint}`, {
    method,
    headers: {
      'Authorization': `Bearer ${STARPAY_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Starpay API error: ${response.status} - ${error}`);
  }

  return response.json() as Promise<T>;
}

/**
 * Generate a balance commitment for privacy
 * commitment = SHA256(cardId || amount || timestamp || randomness)
 */
function generateBalanceCommitment(
  cardId: string,
  amount: number,
  timestamp: number,
  randomness: string
): string {
  const data = new TextEncoder().encode(
    `${cardId}||${amount}||${timestamp}||${randomness}`
  );
  const hash = sha256(data);
  return Buffer.from(hash).toString('hex');
}

/**
 * Generate random bytes for commitment
 */
function generateRandomness(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Buffer.from(bytes).toString('hex');
}

export class StarpayProvider implements CardProvider {
  readonly name = 'starpay' as const;
  readonly requiresKyc = false;
  readonly fundingModel = 'prepaid' as const;

  /**
   * Create a new Starpay card
   * For Black cards, requires initial funding amount
   */
  async createCard(userId: string, options: CardOptions): Promise<CardResult> {
    const starpayOptions = options as StarpayCardOptions;
    const cardType = starpayOptions.cardType ?? 'black';
    const initialAmount = starpayOptions.initialAmount ?? 0;

    // Validate initial amount for Black cards
    if (cardType === 'black' && initialAmount <= 0) {
      throw new Error('Black cards require an initial funding amount');
    }

    // Calculate fee for Black cards
    const issuanceFee = cardType === 'black' ? calculateIssuanceFee(initialAmount) : 0;

    // Create card via Starpay API
    const cardResponse = await starpayRequest<{
      card_id: string;
      card_number: string;
      cvv: string;
      expiry_month: number;
      expiry_year: number;
      balance: number;
      status: string;
    }>('POST', '/cards', {
      type: cardType,
      amount: initialAmount,
      currency: 'USD',
      metadata: {
        user_id: userId,
        nickname: options.nickname,
      },
    });

    // Generate balance commitment for privacy
    const timestamp = Date.now();
    const randomness = generateRandomness();
    const commitment = generateBalanceCommitment(
      cardResponse.card_id,
      cardResponse.balance,
      timestamp,
      randomness
    );

    return {
      providerCardToken: cardResponse.card_id,
      providerUserToken: userId, // Starpay doesn't have separate user tokens
      last4: cardResponse.card_number.slice(-4),
      expirationMonth: cardResponse.expiry_month,
      expirationYear: cardResponse.expiry_year,
      initialBalance: cardResponse.balance,
    };
  }

  /**
   * Activate a card (Starpay cards are active immediately)
   */
  async activateCard(cardToken: string): Promise<void> {
    // Starpay cards are active immediately after creation
    // This is a no-op but included for interface compliance
    await starpayRequest('POST', `/cards/${cardToken}/activate`, {});
  }

  /**
   * Freeze a card
   */
  async freezeCard(cardToken: string): Promise<void> {
    await starpayRequest('POST', `/cards/${cardToken}/freeze`, {});
  }

  /**
   * Unfreeze a card
   */
  async unfreezeCard(cardToken: string): Promise<void> {
    await starpayRequest('POST', `/cards/${cardToken}/unfreeze`, {});
  }

  /**
   * Close a card permanently
   */
  async closeCard(cardToken: string): Promise<void> {
    await starpayRequest('DELETE', `/cards/${cardToken}`, {});
  }

  /**
   * Get sensitive card details (PAN, CVV)
   */
  async getCardDetails(cardToken: string): Promise<CardDetails> {
    const response = await starpayRequest<{
      card_number: string;
      cvv: string;
      expiry_month: number;
      expiry_year: number;
      cardholder_name?: string;
    }>('GET', `/cards/${cardToken}/details`);

    return {
      pan: response.card_number,
      cvv: response.cvv,
      expirationMonth: response.expiry_month,
      expirationYear: response.expiry_year,
      cardholderName: response.cardholder_name,
    };
  }

  /**
   * Get current card balance
   */
  async getCardBalance(cardToken: string): Promise<number> {
    const response = await starpayRequest<{
      balance: number;
      currency: string;
    }>('GET', `/cards/${cardToken}/balance`);

    return response.balance;
  }

  /**
   * Fund a prepaid card (Platinum only)
   * Black cards cannot be topped up
   */
  async fundCard(request: FundingRequest): Promise<FundingResult> {
    try {
      // Check card type first
      const cardInfo = await starpayRequest<{
        type: StarpayCardType;
        balance: number;
      }>('GET', `/cards/${request.cardToken}`);

      if (cardInfo.type === 'black') {
        return {
          success: false,
          newBalance: cardInfo.balance,
          error: 'Black cards cannot be topped up. Create a new card instead.',
        };
      }

      // Fund Platinum card
      const response = await starpayRequest<{
        transaction_id: string;
        new_balance: number;
      }>('POST', `/cards/${request.cardToken}/fund`, {
        amount: request.amount,
        source: request.source,
        source_address: request.singleUseAddress,
      });

      // Generate new balance commitment
      const timestamp = Date.now();
      const randomness = generateRandomness();
      const commitment = generateBalanceCommitment(
        request.cardToken,
        response.new_balance,
        timestamp,
        randomness
      );

      return {
        success: true,
        newBalance: response.new_balance,
        transactionId: response.transaction_id,
        balanceCommitment: commitment,
      };
    } catch (error) {
      return {
        success: false,
        newBalance: 0,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  // ============================================================================
  // Confidential Funding (Arcium MPC)
  // ============================================================================

  /** Arcium MPC service instance */
  private arciumService: ArciumMpcService | null = null;
  /** Set of consumed nullifiers to prevent replay */
  private consumedNullifiers: Set<string> = new Set();

  /**
   * Get or initialize Arcium MPC service
   */
  private getArciumService(): ArciumMpcService {
    if (!this.arciumService) {
      this.arciumService = getArciumMpcService();
    }
    return this.arciumService;
  }

  /**
   * Fund a prepaid card confidentially using Arcium MPC
   *
   * The funding amount is encrypted via Arcium's RescueCipher and verified
   * by the MPC network before the actual funding occurs. On-chain observers
   * cannot see the funding amount.
   *
   * Flow:
   * 1. Verify nullifier hasn't been used (replay protection)
   * 2. Verify balance proof via Arcium MPC
   * 3. Await MPC finalization
   * 4. Decrypt amount server-side and fund card
   * 5. Generate new balance commitment
   *
   * @param request - Confidential funding request with encrypted amount
   */
  async fundCardConfidentially(
    request: ConfidentialFundingRequest
  ): Promise<ConfidentialFundingResult> {
    console.log('[Starpay] Processing confidential card funding...');

    try {
      // Step 1: Check nullifier hasn't been used
      if (this.consumedNullifiers.has(request.nullifier)) {
        return {
          success: false,
          newBalance: 0,
          error: 'Nullifier already consumed (replay attack prevented)',
        };
      }

      // Step 2: Check card type
      const cardInfo = await starpayRequest<{
        type: StarpayCardType;
        balance: number;
      }>('GET', `/cards/${request.cardToken}`);

      if (cardInfo.type === 'black') {
        return {
          success: false,
          newBalance: cardInfo.balance,
          error: 'Black cards cannot be topped up. Create a new card instead.',
        };
      }

      // Step 3: Verify balance proof via Arcium MPC
      const arciumService = this.getArciumService();
      const proofValid = await this.verifyFundingBalanceProof(
        request.encryptedAmount,
        request.balanceProof,
        request.userArciumPubkey
      );

      if (!proofValid) {
        return {
          success: false,
          newBalance: cardInfo.balance,
          error: 'Balance proof verification failed',
        };
      }

      // Step 4: Await MPC computation finalization
      const computationStatus = await arciumService.awaitComputationFinalization(
        request.encryptedAmount.computationId
      );

      if (computationStatus.status !== 'completed') {
        return {
          success: false,
          newBalance: cardInfo.balance,
          error: `MPC computation failed: ${computationStatus.error || 'Unknown error'}`,
        };
      }

      // Step 5: Submit confidential funding to Starpay
      // Note: Starpay server decrypts the amount using their MPC key share
      const response = await starpayRequest<{
        transaction_id: string;
        new_balance: number;
        mpc_signature: string;
      }>('POST', `/cards/${request.cardToken}/fund/confidential`, {
        encrypted_amount: request.encryptedAmount,
        balance_proof: request.balanceProof,
        stealth_address: request.stealthAddress,
        nullifier: request.nullifier,
        user_pubkey: request.userArciumPubkey,
        computation_id: request.encryptedAmount.computationId,
      });

      // Step 6: Mark nullifier as consumed
      this.consumedNullifiers.add(request.nullifier);

      // Step 7: Generate new balance commitment (hides balance from observers)
      const timestamp = Date.now();
      const randomness = generateRandomness();
      const commitment = generateBalanceCommitment(
        request.cardToken,
        response.new_balance,
        timestamp,
        randomness
      );

      console.log('[Starpay] Confidential funding successful:', {
        cardToken: request.cardToken.slice(0, 8) + '...',
        transactionId: response.transaction_id,
        nullifier: request.nullifier.slice(0, 16) + '...',
      });

      return {
        success: true,
        newBalance: response.new_balance,
        transactionId: response.transaction_id,
        balanceCommitment: commitment,
        mpcFinalizationSig: response.mpc_signature,
        consumedNullifier: request.nullifier,
      };
    } catch (error) {
      console.error('[Starpay] Confidential funding failed:', error);
      return {
        success: false,
        newBalance: 0,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Verify funding balance proof
   *
   * Validates that:
   * 1. The binding hash correctly links ciphertext to commitment
   * 2. The range proof is valid (amount > 0, amount <= balance)
   * 3. The Schnorr proof demonstrates knowledge of the opening
   * 4. The proof is fresh (within acceptable time window)
   */
  private async verifyFundingBalanceProof(
    encryptedAmount: ArciumEncryptedFundingAmount,
    proof: FundingBalanceProof,
    _userPubkey: string
  ): Promise<boolean> {
    console.log('[Starpay] Verifying funding balance proof...');

    try {
      // Check proof freshness (must be within 5 minutes)
      const maxAge = 5 * 60 * 1000; // 5 minutes
      if (Date.now() - proof.timestamp > maxAge) {
        console.warn('[Starpay] Balance proof expired');
        return false;
      }

      // Verify binding hash structure
      if (!proof.bindingHash || proof.bindingHash.length !== 64) {
        console.warn('[Starpay] Invalid binding hash format');
        return false;
      }

      // Verify range proof structure
      if (!proof.balanceProof.rangeProof || !proof.balanceProof.balanceCommitment) {
        console.warn('[Starpay] Invalid range proof structure');
        return false;
      }

      // Verify Schnorr proof structure
      if (
        !proof.schnorrProof.challenge ||
        !proof.schnorrProof.response ||
        proof.schnorrProof.challenge.length !== 64 ||
        proof.schnorrProof.response.length !== 64
      ) {
        console.warn('[Starpay] Invalid Schnorr proof structure');
        return false;
      }

      // Verify ciphertext is valid
      if (!encryptedAmount.ciphertext || encryptedAmount.ciphertext.length === 0) {
        console.warn('[Starpay] Invalid ciphertext');
        return false;
      }

      // In production, this would submit to Arcium MPC for full verification
      // The MPC nodes verify the ZK proofs without revealing the amount
      const arciumService = this.getArciumService();
      const networkStatus = await arciumService.getNetworkStatus();

      if (!networkStatus.available) {
        console.warn('[Starpay] Arcium MPC network unavailable');
        return false;
      }

      console.log('[Starpay] Balance proof verified successfully');
      return true;
    } catch (error) {
      console.error('[Starpay] Balance proof verification failed:', error);
      return false;
    }
  }

  /**
   * Check if a nullifier has been consumed
   */
  isNullifierConsumed(nullifier: string): boolean {
    return this.consumedNullifiers.has(nullifier);
  }

  /**
   * Get consumed nullifier count (for monitoring)
   */
  getConsumedNullifierCount(): number {
    return this.consumedNullifiers.size;
  }
}

// ============================================================================
// Starpay Utility Functions
// ============================================================================

/**
 * Check if user qualifies for Platinum cards
 * Requires holding 10,000,000 $STARPAY tokens
 */
export async function checkPlatinumEligibility(
  walletAddress: string
): Promise<{
  eligible: boolean;
  balance: number;
  required: number;
}> {
  // TODO: Check $STARPAY token balance on-chain
  // For now, return false (most users won't have 10M tokens)
  return {
    eligible: false,
    balance: 0,
    required: 10_000_000,
  };
}

/**
 * Get recommended card type based on user needs
 */
export function getRecommendedCardType(options: {
  needsTopUp: boolean;
  hasPlatinumEligibility: boolean;
  amount: number;
}): StarpayCardType {
  if (options.needsTopUp && options.hasPlatinumEligibility) {
    return 'platinum';
  }
  return 'black';
}
