/**
 * DisCard 2035 - Transaction Builder
 *
 * Builds Solana transactions for P2P transfers:
 * - Native SOL transfers
 * - SPL Token transfers (with ATA creation if needed)
 * - Fee estimation
 *
 * Integrates with Turnkey TEE for signing.
 */

import {
  Connection,
  PublicKey,
  Transaction,
  TransactionInstruction,
  SystemProgram,
  LAMPORTS_PER_SOL,
  ComputeBudgetProgram,
} from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  getAssociatedTokenAddress,
  createAssociatedTokenAccountInstruction,
  createTransferInstruction,
  getAccount,
  TokenAccountNotFoundError,
} from "@solana/spl-token";

// ============================================================================
// Types
// ============================================================================

export interface TransferParams {
  /** Sender's public key */
  from: PublicKey;
  /** Recipient's public key */
  to: PublicKey;
  /** Amount to transfer (in smallest units - lamports or token base units) */
  amount: bigint;
  /** Token mint address (use NATIVE_MINT for SOL) */
  mint?: PublicKey;
  /** Token decimals (for display, not used in transaction) */
  decimals?: number;
  /** Optional memo for the transaction */
  memo?: string;
}

export interface TransferTransaction {
  /** Built transaction ready for signing */
  transaction: Transaction;
  /** Whether recipient ATA needs to be created */
  createsAta: boolean;
  /** Estimated network fee in lamports */
  estimatedFee: number;
  /** Priority fee in lamports (if using priority) */
  priorityFee: number;
  /** Total cost in lamports (including ATA rent if applicable) */
  totalCost: number;
}

export interface FeeEstimate {
  /** Base network fee in lamports */
  networkFee: number;
  /** Priority fee in lamports */
  priorityFee: number;
  /** ATA creation rent if needed */
  ataRent: number;
  /** Total fee in lamports */
  total: number;
  /** Fee in USD (approximate) */
  totalUsd: number;
}

// ============================================================================
// Constants
// ============================================================================

/** Native SOL mint address (special marker) */
export const NATIVE_MINT = new PublicKey(
  "So11111111111111111111111111111111111111112"
);

/** USDC mint on mainnet */
export const USDC_MINT = new PublicKey(
  "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"
);

/** USDT mint on mainnet */
export const USDT_MINT = new PublicKey(
  "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB"
);

/** Default priority fee in micro-lamports per compute unit */
const DEFAULT_PRIORITY_FEE_MICRO_LAMPORTS = 10000;

/** Compute units for a simple transfer */
const TRANSFER_COMPUTE_UNITS = 200000;

/** ATA account rent exemption (approximately 0.00203 SOL) */
const ATA_RENT_LAMPORTS = 2039280;

/** Base transaction fee */
const BASE_FEE_LAMPORTS = 5000;

/** Approximate SOL price for fee estimation (updated periodically) */
let cachedSolPrice = 150; // Default fallback

// ============================================================================
// Fee Estimation
// ============================================================================

/**
 * Estimate fees for a transfer
 */
export async function estimateTransferFees(
  connection: Connection,
  params: TransferParams
): Promise<FeeEstimate> {
  let ataRent = 0;
  let priorityFee = 0;

  // Check if we need to create recipient ATA for SPL tokens
  if (params.mint && !params.mint.equals(NATIVE_MINT)) {
    const needsAta = await recipientNeedsAta(
      connection,
      params.to,
      params.mint
    );
    if (needsAta) {
      ataRent = ATA_RENT_LAMPORTS;
    }
  }

  // Calculate priority fee
  priorityFee = Math.ceil(
    (DEFAULT_PRIORITY_FEE_MICRO_LAMPORTS * TRANSFER_COMPUTE_UNITS) / 1_000_000
  );

  const total = BASE_FEE_LAMPORTS + priorityFee + ataRent;

  // Estimate USD value
  const totalUsd = (total / LAMPORTS_PER_SOL) * cachedSolPrice;

  return {
    networkFee: BASE_FEE_LAMPORTS,
    priorityFee,
    ataRent,
    total,
    totalUsd: Math.round(totalUsd * 100) / 100, // Round to cents
  };
}

/**
 * Check if recipient needs ATA creation
 */
async function recipientNeedsAta(
  connection: Connection,
  recipient: PublicKey,
  mint: PublicKey
): Promise<boolean> {
  try {
    const ata = await getAssociatedTokenAddress(mint, recipient);
    await getAccount(connection, ata);
    return false; // ATA exists
  } catch (error) {
    if (error instanceof TokenAccountNotFoundError) {
      return true; // ATA doesn't exist
    }
    throw error;
  }
}

/**
 * Update cached SOL price (call periodically)
 */
export function updateSolPrice(price: number): void {
  cachedSolPrice = price;
}

// ============================================================================
// Transaction Builders
// ============================================================================

/**
 * Build a native SOL transfer transaction
 */
export async function buildSOLTransfer(
  connection: Connection,
  from: PublicKey,
  to: PublicKey,
  lamports: bigint
): Promise<TransferTransaction> {
  const transaction = new Transaction();

  // Add priority fee instruction
  const priorityFee = Math.ceil(
    (DEFAULT_PRIORITY_FEE_MICRO_LAMPORTS * TRANSFER_COMPUTE_UNITS) / 1_000_000
  );

  transaction.add(
    ComputeBudgetProgram.setComputeUnitLimit({
      units: TRANSFER_COMPUTE_UNITS,
    }),
    ComputeBudgetProgram.setComputeUnitPrice({
      microLamports: DEFAULT_PRIORITY_FEE_MICRO_LAMPORTS,
    })
  );

  // Add transfer instruction
  transaction.add(
    SystemProgram.transfer({
      fromPubkey: from,
      toPubkey: to,
      lamports,
    })
  );

  // Get recent blockhash
  const { blockhash, lastValidBlockHeight } =
    await connection.getLatestBlockhash("confirmed");
  transaction.recentBlockhash = blockhash;
  transaction.lastValidBlockHeight = lastValidBlockHeight;
  transaction.feePayer = from;

  return {
    transaction,
    createsAta: false,
    estimatedFee: BASE_FEE_LAMPORTS,
    priorityFee,
    totalCost: BASE_FEE_LAMPORTS + priorityFee,
  };
}

/**
 * Build an SPL token transfer transaction
 * Automatically creates recipient ATA if needed
 */
export async function buildSPLTokenTransfer(
  connection: Connection,
  from: PublicKey,
  to: PublicKey,
  amount: bigint,
  mint: PublicKey
): Promise<TransferTransaction> {
  const transaction = new Transaction();
  let createsAta = false;
  let totalCost = BASE_FEE_LAMPORTS;

  // Add priority fee instruction
  const priorityFee = Math.ceil(
    (DEFAULT_PRIORITY_FEE_MICRO_LAMPORTS * TRANSFER_COMPUTE_UNITS) / 1_000_000
  );
  totalCost += priorityFee;

  transaction.add(
    ComputeBudgetProgram.setComputeUnitLimit({
      units: TRANSFER_COMPUTE_UNITS,
    }),
    ComputeBudgetProgram.setComputeUnitPrice({
      microLamports: DEFAULT_PRIORITY_FEE_MICRO_LAMPORTS,
    })
  );

  // Get sender's ATA
  const fromAta = await getAssociatedTokenAddress(mint, from);

  // Get or create recipient's ATA
  const toAta = await getAssociatedTokenAddress(mint, to);

  // Check if recipient ATA exists
  const needsAta = await recipientNeedsAta(connection, to, mint);

  if (needsAta) {
    // Add create ATA instruction
    transaction.add(
      createAssociatedTokenAccountInstruction(
        from, // payer
        toAta, // ata
        to, // owner
        mint // mint
      )
    );
    createsAta = true;
    totalCost += ATA_RENT_LAMPORTS;
  }

  // Add transfer instruction
  transaction.add(
    createTransferInstruction(
      fromAta, // source
      toAta, // destination
      from, // owner
      amount // amount
    )
  );

  // Get recent blockhash
  const { blockhash, lastValidBlockHeight } =
    await connection.getLatestBlockhash("confirmed");
  transaction.recentBlockhash = blockhash;
  transaction.lastValidBlockHeight = lastValidBlockHeight;
  transaction.feePayer = from;

  return {
    transaction,
    createsAta,
    estimatedFee: BASE_FEE_LAMPORTS,
    priorityFee,
    totalCost,
  };
}

/**
 * Build a transfer transaction (auto-detects SOL vs SPL)
 */
export async function buildTransfer(
  connection: Connection,
  params: TransferParams
): Promise<TransferTransaction> {
  // If no mint or native SOL mint, use SOL transfer
  if (!params.mint || params.mint.equals(NATIVE_MINT)) {
    return buildSOLTransfer(connection, params.from, params.to, params.amount);
  }

  // SPL token transfer
  return buildSPLTokenTransfer(
    connection,
    params.from,
    params.to,
    params.amount,
    params.mint
  );
}

// ============================================================================
// Transaction Utilities
// ============================================================================

/**
 * Simulate a transaction to check for errors
 */
export async function simulateTransaction(
  connection: Connection,
  transaction: Transaction
): Promise<{ success: boolean; error?: string; logs?: string[] }> {
  try {
    const result = await connection.simulateTransaction(transaction);

    if (result.value.err) {
      return {
        success: false,
        error:
          typeof result.value.err === "string"
            ? result.value.err
            : JSON.stringify(result.value.err),
        logs: result.value.logs ?? undefined,
      };
    }

    return {
      success: true,
      logs: result.value.logs ?? undefined,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Simulation failed",
    };
  }
}

/**
 * Get token balance for an address
 */
export async function getTokenBalance(
  connection: Connection,
  owner: PublicKey,
  mint: PublicKey
): Promise<bigint> {
  try {
    const ata = await getAssociatedTokenAddress(mint, owner);
    const account = await getAccount(connection, ata);
    return account.amount;
  } catch (error) {
    if (error instanceof TokenAccountNotFoundError) {
      return BigInt(0);
    }
    throw error;
  }
}

/**
 * Get SOL balance for an address
 */
export async function getSOLBalance(
  connection: Connection,
  address: PublicKey
): Promise<bigint> {
  const balance = await connection.getBalance(address);
  return BigInt(balance);
}

/**
 * Convert display amount to base units
 */
export function toBaseUnits(amount: number, decimals: number): bigint {
  return BigInt(Math.round(amount * 10 ** decimals));
}

/**
 * Convert base units to display amount
 */
export function fromBaseUnits(amount: bigint, decimals: number): number {
  return Number(amount) / 10 ** decimals;
}

/**
 * Format lamports as SOL string
 */
export function formatSOL(lamports: bigint | number): string {
  const sol = Number(lamports) / LAMPORTS_PER_SOL;
  return sol.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 9,
  });
}

/**
 * Format token amount
 */
export function formatTokenAmount(
  amount: bigint,
  decimals: number,
  symbol?: string
): string {
  const formatted = fromBaseUnits(amount, decimals).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: decimals,
  });
  return symbol ? `${formatted} ${symbol}` : formatted;
}
