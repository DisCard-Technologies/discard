/**
 * Transaction History Convex Functions
 *
 * Provides caching and fetching of on-chain transaction history
 * from Helius Enhanced Transactions API.
 *
 * Supports both devnet and mainnet via environment-based detection.
 */
import { v } from "convex/values";
import { query, action, internalMutation } from "../_generated/server";
import { internal, api } from "../_generated/api";

// Network configuration
const SOLANA_NETWORK = process.env.SOLANA_NETWORK || "mainnet-beta";
const SOLANA_RPC_URL = process.env.HELIUS_RPC_URL || process.env.SOLANA_RPC_URL || "https://api.mainnet-beta.solana.com";
const IS_DEVNET = SOLANA_NETWORK === "devnet" || SOLANA_RPC_URL.includes("devnet");
const HELIUS_API_KEY = process.env.HELIUS_API_KEY;

// Helius API endpoints
const HELIUS_API_MAINNET = "https://api.helius.xyz/v0/addresses";
const HELIUS_API_DEVNET = "https://api-devnet.helius.xyz/v0/addresses";

console.log(`[TransactionHistory] Network config: IS_DEVNET=${IS_DEVNET}`);

// ============================================================================
// Types
// ============================================================================

interface HeliusTransaction {
  signature: string;
  description?: string;
  type?: string;
  source?: string;
  fee: number;
  feePayer: string;
  slot: number;
  timestamp: number;
  nativeTransfers?: Array<{
    fromUserAccount: string;
    toUserAccount: string;
    amount: number;
  }>;
  tokenTransfers?: Array<{
    fromUserAccount: string;
    toUserAccount: string;
    fromTokenAccount: string;
    toTokenAccount: string;
    tokenAmount: number;
    mint: string;
    tokenStandard?: string;
  }>;
  accountData?: Array<{
    account: string;
    nativeBalanceChange: number;
    tokenBalanceChanges: Array<{
      mint: string;
      rawTokenAmount: { tokenAmount: string; decimals: number };
      userAccount: string;
    }>;
  }>;
}

type TransactionType = "send" | "receive" | "swap" | "unknown";

interface ParsedTransaction {
  signature: string;
  type: TransactionType;
  counterpartyAddress?: string;
  tokenMint: string;
  tokenSymbol: string;
  amount: number;
  amountUsd?: number;
  fee: number;
  blockTime: number;
  description?: string;
  source?: string;
}

// Well-known token symbols
const KNOWN_TOKENS: Record<string, string> = {
  So11111111111111111111111111111111111111112: "SOL",
  EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v: "USDC",
  Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB: "USDT",
  JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN: "JUP",
  DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263: "BONK",
  mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So: "mSOL",
  bSo13r4TkiE4KumL71LsHTPpL2euBYLFx6h9HP3piy1: "bSOL",
  J1toso1uCk3RLmjorhTtrVwY9HJ7X8V9yYac6Y7kGCPn: "jitoSOL",
};

// Native SOL mint address constant
const NATIVE_SOL_MINT = "So11111111111111111111111111111111111111112";

// ============================================================================
// Helpers
// ============================================================================

/**
 * Classify transaction type based on Helius response
 */
function classifyTransaction(
  tx: HeliusTransaction,
  walletAddress: string
): { type: TransactionType; counterparty?: string; tokenMint: string; tokenSymbol: string; amount: number } {
  const walletLower = walletAddress.toLowerCase();

  // Check token transfers first (SPL tokens)
  if (tx.tokenTransfers && tx.tokenTransfers.length > 0) {
    const transfers = tx.tokenTransfers;

    // Check for swap: wallet appears in both from and to positions
    const fromWallet = transfers.some(
      (t) => t.fromUserAccount?.toLowerCase() === walletLower
    );
    const toWallet = transfers.some(
      (t) => t.toUserAccount?.toLowerCase() === walletLower
    );

    if (fromWallet && toWallet) {
      // Swap detected - use the outgoing token as primary
      const outgoing = transfers.find(
        (t) => t.fromUserAccount?.toLowerCase() === walletLower
      );
      if (outgoing) {
        return {
          type: "swap",
          counterparty: outgoing.toUserAccount,
          tokenMint: outgoing.mint,
          tokenSymbol: KNOWN_TOKENS[outgoing.mint] || outgoing.mint.slice(0, 4).toUpperCase(),
          amount: outgoing.tokenAmount,
        };
      }
    }

    // Send: wallet is only in fromUserAccount
    if (fromWallet && !toWallet) {
      const transfer = transfers.find(
        (t) => t.fromUserAccount?.toLowerCase() === walletLower
      );
      if (transfer) {
        return {
          type: "send",
          counterparty: transfer.toUserAccount,
          tokenMint: transfer.mint,
          tokenSymbol: KNOWN_TOKENS[transfer.mint] || transfer.mint.slice(0, 4).toUpperCase(),
          amount: transfer.tokenAmount,
        };
      }
    }

    // Receive: wallet is only in toUserAccount
    if (!fromWallet && toWallet) {
      const transfer = transfers.find(
        (t) => t.toUserAccount?.toLowerCase() === walletLower
      );
      if (transfer) {
        return {
          type: "receive",
          counterparty: transfer.fromUserAccount,
          tokenMint: transfer.mint,
          tokenSymbol: KNOWN_TOKENS[transfer.mint] || transfer.mint.slice(0, 4).toUpperCase(),
          amount: transfer.tokenAmount,
        };
      }
    }
  }

  // Check native SOL transfers
  if (tx.nativeTransfers && tx.nativeTransfers.length > 0) {
    const transfers = tx.nativeTransfers;

    const fromWallet = transfers.some(
      (t) => t.fromUserAccount?.toLowerCase() === walletLower
    );
    const toWallet = transfers.some(
      (t) => t.toUserAccount?.toLowerCase() === walletLower
    );

    // Send: wallet is only in fromUserAccount
    if (fromWallet && !toWallet) {
      const transfer = transfers.find(
        (t) => t.fromUserAccount?.toLowerCase() === walletLower
      );
      if (transfer) {
        return {
          type: "send",
          counterparty: transfer.toUserAccount,
          tokenMint: NATIVE_SOL_MINT,
          tokenSymbol: "SOL",
          amount: transfer.amount / 1e9, // Convert lamports to SOL
        };
      }
    }

    // Receive: wallet is only in toUserAccount
    if (!fromWallet && toWallet) {
      const transfer = transfers.find(
        (t) => t.toUserAccount?.toLowerCase() === walletLower
      );
      if (transfer) {
        return {
          type: "receive",
          counterparty: transfer.fromUserAccount,
          tokenMint: NATIVE_SOL_MINT,
          tokenSymbol: "SOL",
          amount: transfer.amount / 1e9, // Convert lamports to SOL
        };
      }
    }

    // Both directions (internal transfer or fee payment)
    if (fromWallet && toWallet) {
      // Calculate net flow
      const outgoing = transfers
        .filter((t) => t.fromUserAccount?.toLowerCase() === walletLower)
        .reduce((sum, t) => sum + t.amount, 0);
      const incoming = transfers
        .filter((t) => t.toUserAccount?.toLowerCase() === walletLower)
        .reduce((sum, t) => sum + t.amount, 0);

      const netFlow = incoming - outgoing;
      if (netFlow > 0) {
        return {
          type: "receive",
          tokenMint: NATIVE_SOL_MINT,
          tokenSymbol: "SOL",
          amount: netFlow / 1e9,
        };
      } else if (netFlow < 0) {
        return {
          type: "send",
          tokenMint: NATIVE_SOL_MINT,
          tokenSymbol: "SOL",
          amount: Math.abs(netFlow) / 1e9,
        };
      }
    }
  }

  // Unknown type
  return {
    type: "unknown",
    tokenMint: NATIVE_SOL_MINT,
    tokenSymbol: "SOL",
    amount: 0,
  };
}

/**
 * Parse Helius transaction response
 */
function parseTransaction(
  tx: HeliusTransaction,
  walletAddress: string
): ParsedTransaction {
  const { type, counterparty, tokenMint, tokenSymbol, amount } = classifyTransaction(tx, walletAddress);

  return {
    signature: tx.signature,
    type,
    counterpartyAddress: counterparty,
    tokenMint,
    tokenSymbol,
    amount,
    fee: tx.fee / 1e9, // Convert lamports to SOL
    blockTime: tx.timestamp,
    description: tx.description,
    source: tx.source,
  };
}

// ============================================================================
// Queries
// ============================================================================

/**
 * Get cached transactions for a wallet
 */
export const getRecentTransactions = query({
  args: {
    walletAddress: v.string(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit || 10;

    const transactions = await ctx.db
      .query("onChainTransactions")
      .withIndex("by_wallet_time", (q) => q.eq("walletAddress", args.walletAddress))
      .order("desc")
      .take(limit);

    return transactions;
  },
});

/**
 * Get cached transaction by signature
 */
export const getBySignature = query({
  args: {
    signature: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("onChainTransactions")
      .withIndex("by_signature", (q) => q.eq("signature", args.signature))
      .first();
  },
});

// ============================================================================
// Actions
// ============================================================================

/**
 * Refresh transaction history from Helius
 */
export const refreshTransactionHistory = action({
  args: {
    walletAddress: v.string(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit || 10;

    if (!HELIUS_API_KEY) {
      console.error("[TransactionHistory] HELIUS_API_KEY not configured");
      throw new Error("Helius API key not configured");
    }

    const baseUrl = IS_DEVNET ? HELIUS_API_DEVNET : HELIUS_API_MAINNET;
    const url = `${baseUrl}/${args.walletAddress}/transactions?api-key=${HELIUS_API_KEY}&limit=${limit}`;

    console.log(`[TransactionHistory] Fetching from ${IS_DEVNET ? "devnet" : "mainnet"} for ${args.walletAddress.slice(0, 8)}...`);

    const response = await fetch(url);

    if (!response.ok) {
      const errorText = await response.text().catch(() => "");
      console.error(`[TransactionHistory] Helius API error: ${response.status} - ${errorText}`);
      throw new Error(`Helius API error: ${response.status}`);
    }

    const transactions: HeliusTransaction[] = await response.json();

    console.log(`[TransactionHistory] Fetched ${transactions.length} transactions`);

    // Parse transactions
    const parsed: ParsedTransaction[] = transactions.map((tx) =>
      parseTransaction(tx, args.walletAddress)
    );

    // Get USD values for transactions (use cached SOL price)
    let solPrice = 0;
    try {
      const cachedRate = await ctx.runQuery(api.holdings.jupiter.getCachedSolPrice, {});
      if (cachedRate) {
        solPrice = cachedRate.price;
      }
    } catch {
      console.log("[TransactionHistory] Could not fetch SOL price");
    }

    // Add USD values to SOL transactions
    const withUsd = parsed.map((tx) => ({
      ...tx,
      amountUsd: tx.tokenMint === NATIVE_SOL_MINT && solPrice > 0
        ? tx.amount * solPrice
        : undefined,
    }));

    // Upsert into cache
    await ctx.runMutation(internal.holdings.transactionHistory.upsertTransactions, {
      walletAddress: args.walletAddress,
      transactions: withUsd,
    });

    return {
      transactions: withUsd,
      count: withUsd.length,
      network: IS_DEVNET ? "devnet" : "mainnet",
    };
  },
});

// ============================================================================
// Internal Mutations
// ============================================================================

/**
 * Upsert transactions into cache
 */
export const upsertTransactions = internalMutation({
  args: {
    walletAddress: v.string(),
    transactions: v.array(
      v.object({
        signature: v.string(),
        type: v.union(
          v.literal("send"),
          v.literal("receive"),
          v.literal("swap"),
          v.literal("unknown")
        ),
        counterpartyAddress: v.optional(v.string()),
        tokenMint: v.string(),
        tokenSymbol: v.string(),
        amount: v.number(),
        amountUsd: v.optional(v.number()),
        fee: v.number(),
        blockTime: v.number(),
        description: v.optional(v.string()),
        source: v.optional(v.string()),
      })
    ),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    for (const tx of args.transactions) {
      // Check if transaction already exists
      const existing = await ctx.db
        .query("onChainTransactions")
        .withIndex("by_signature", (q) => q.eq("signature", tx.signature))
        .first();

      if (existing) {
        // Update existing (in case USD value changed)
        await ctx.db.patch(existing._id, {
          amountUsd: tx.amountUsd,
          fetchedAt: now,
        });
      } else {
        // Insert new transaction
        await ctx.db.insert("onChainTransactions", {
          walletAddress: args.walletAddress,
          signature: tx.signature,
          type: tx.type,
          counterpartyAddress: tx.counterpartyAddress,
          tokenMint: tx.tokenMint,
          tokenSymbol: tx.tokenSymbol,
          amount: tx.amount,
          amountUsd: tx.amountUsd,
          fee: tx.fee,
          blockTime: tx.blockTime,
          description: tx.description,
          source: tx.source,
          fetchedAt: now,
        });
      }
    }
  },
});

/**
 * Clear transaction cache for a wallet
 */
export const clearCache = internalMutation({
  args: {
    walletAddress: v.string(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("onChainTransactions")
      .withIndex("by_wallet", (q) => q.eq("walletAddress", args.walletAddress))
      .collect();

    for (const tx of existing) {
      await ctx.db.delete(tx._id);
    }

    return { deleted: existing.length };
  },
});
