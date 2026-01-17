/**
 * Transaction Test Fixtures
 *
 * Factory functions for creating test transaction data.
 */

import type { Id } from '@/convex/_generated/dataModel';

// ============================================================================
// Types
// ============================================================================

export type TransactionType = 'transfer' | 'swap' | 'card_fund' | 'card_spend' | 'withdrawal';

export type TransactionStatus =
  | 'pending'
  | 'signing'
  | 'submitted'
  | 'confirmed'
  | 'failed'
  | 'cancelled';

export interface TestTransaction {
  _id: Id<'transfers'>;
  userId: Id<'users'>;
  type: TransactionType;
  status: TransactionStatus;
  // Transfer specific
  recipientAddress?: string;
  recipientDisplayName?: string;
  recipientType?: 'address' | 'sol_name' | 'contact';
  // Amount
  amount: number;
  amountUsd: number;
  token: string;
  tokenMint: string;
  tokenDecimals: number;
  // Fees
  networkFee: number;
  platformFee: number;
  priorityFee: number;
  // Blockchain
  solanaSignature?: string;
  confirmationTimeMs?: number;
  // Timestamps
  createdAt: number;
  updatedAt: number;
  // Error
  errorMessage?: string;
  // Idempotency
  idempotencyKey?: string;
}

// ============================================================================
// Token Constants
// ============================================================================

export const TOKENS = {
  SOL: {
    symbol: 'SOL',
    mint: 'So11111111111111111111111111111111111111112',
    decimals: 9,
    name: 'Solana',
  },
  USDC: {
    symbol: 'USDC',
    mint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
    decimals: 6,
    name: 'USD Coin',
  },
  USDT: {
    symbol: 'USDT',
    mint: 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB',
    decimals: 6,
    name: 'Tether',
  },
};

// ============================================================================
// Default Values
// ============================================================================

const defaultTransaction: Omit<TestTransaction, '_id' | 'userId'> = {
  type: 'transfer',
  status: 'pending',
  amount: 100,
  amountUsd: 100,
  token: 'USDC',
  tokenMint: TOKENS.USDC.mint,
  tokenDecimals: TOKENS.USDC.decimals,
  networkFee: 0.001,
  platformFee: 0.30, // 0.3%
  priorityFee: 0.0001,
  createdAt: Date.now(),
  updatedAt: Date.now(),
};

// ============================================================================
// Factory Functions
// ============================================================================

let transactionCounter = 0;

/**
 * Create a test transaction with optional overrides
 */
export function createTestTransaction(
  overrides: Partial<TestTransaction> = {},
  userId: Id<'users'> = 'test_user_001' as Id<'users'>
): TestTransaction {
  transactionCounter++;
  return {
    _id: `tx_${transactionCounter}_${Date.now()}` as Id<'transfers'>,
    userId,
    ...defaultTransaction,
    ...overrides,
    createdAt: overrides.createdAt ?? Date.now(),
    updatedAt: overrides.updatedAt ?? Date.now(),
  };
}

/**
 * Create a transfer transaction
 */
export function createTransferTransaction(
  recipientAddress: string,
  amount: number,
  token: keyof typeof TOKENS = 'USDC',
  overrides: Partial<TestTransaction> = {}
): TestTransaction {
  const tokenInfo = TOKENS[token];
  const amountUsd = token === 'SOL' ? amount * 150 : amount; // Assume SOL = $150

  return createTestTransaction({
    type: 'transfer',
    recipientAddress,
    recipientDisplayName: recipientAddress.slice(0, 8) + '...',
    recipientType: 'address',
    amount,
    amountUsd,
    token: tokenInfo.symbol,
    tokenMint: tokenInfo.mint,
    tokenDecimals: tokenInfo.decimals,
    ...overrides,
  });
}

/**
 * Create a swap transaction
 */
export function createSwapTransaction(
  fromToken: keyof typeof TOKENS,
  toToken: keyof typeof TOKENS,
  amount: number,
  overrides: Partial<TestTransaction> = {}
): TestTransaction {
  const fromTokenInfo = TOKENS[fromToken];

  return createTestTransaction({
    type: 'swap',
    amount,
    amountUsd: fromToken === 'SOL' ? amount * 150 : amount,
    token: fromTokenInfo.symbol,
    tokenMint: fromTokenInfo.mint,
    tokenDecimals: fromTokenInfo.decimals,
    ...overrides,
  });
}

/**
 * Create a confirmed transaction
 */
export function createConfirmedTransaction(
  overrides: Partial<TestTransaction> = {}
): TestTransaction {
  return createTestTransaction({
    status: 'confirmed',
    solanaSignature: `sig_confirmed_${Date.now()}`,
    confirmationTimeMs: 150, // Alpenglow target
    ...overrides,
  });
}

/**
 * Create a failed transaction
 */
export function createFailedTransaction(
  errorMessage: string = 'Transaction failed',
  overrides: Partial<TestTransaction> = {}
): TestTransaction {
  return createTestTransaction({
    status: 'failed',
    errorMessage,
    ...overrides,
  });
}

/**
 * Create a card funding transaction
 */
export function createCardFundTransaction(
  cardId: string,
  amount: number,
  overrides: Partial<TestTransaction> = {}
): TestTransaction {
  return createTestTransaction({
    type: 'card_fund',
    amount,
    amountUsd: amount,
    recipientAddress: cardId,
    recipientType: 'address',
    token: 'USDC',
    tokenMint: TOKENS.USDC.mint,
    tokenDecimals: TOKENS.USDC.decimals,
    ...overrides,
  });
}

/**
 * Create multiple transactions for a user
 */
export function createTransactionHistory(
  count: number,
  userId?: Id<'users'>
): TestTransaction[] {
  const types: TransactionType[] = ['transfer', 'swap', 'card_fund', 'card_spend'];
  const statuses: TransactionStatus[] = ['confirmed', 'confirmed', 'confirmed', 'failed'];

  return Array.from({ length: count }, (_, i) => {
    const type = types[i % types.length];
    const status = statuses[i % statuses.length];
    const daysAgo = i;
    const createdAt = Date.now() - daysAgo * 24 * 60 * 60 * 1000;

    return createTestTransaction(
      {
        type,
        status,
        amount: (i + 1) * 10,
        amountUsd: (i + 1) * 10,
        createdAt,
        updatedAt: createdAt,
        solanaSignature: status === 'confirmed' ? `sig_history_${i}` : undefined,
        confirmationTimeMs: status === 'confirmed' ? 100 + i * 10 : undefined,
        errorMessage: status === 'failed' ? 'Simulated failure' : undefined,
      },
      userId
    );
  });
}

// ============================================================================
// Fee Calculations
// ============================================================================

/**
 * Calculate standard fees for a transaction amount
 */
export function calculateFees(amountUsd: number): {
  networkFee: number;
  platformFee: number;
  priorityFee: number;
  totalFeeUsd: number;
} {
  const networkFee = 0.001; // ~$0.15 at $150/SOL
  const platformFee = amountUsd * 0.003; // 0.3%
  const priorityFee = 0.0001;
  const totalFeeUsd = networkFee * 150 + platformFee + priorityFee * 150;

  return {
    networkFee,
    platformFee,
    priorityFee,
    totalFeeUsd: Math.round(totalFeeUsd * 100) / 100,
  };
}

// ============================================================================
// Reset Helper
// ============================================================================

/**
 * Reset transaction counter
 */
export function resetTransactionCounter(): void {
  transactionCounter = 0;
}
