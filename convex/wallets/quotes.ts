/**
 * Swap Quotes Convex Functions
 * Crypto swap quotes and execution
 */
import { v } from "convex/values";
import { query, mutation } from "../_generated/server";

// Create a new swap quote
export const create = mutation({
  args: {
    userId: v.id("users"),
    fromSymbol: v.string(),
    toSymbol: v.string(),
    amount: v.number(),
    slippageTolerance: v.optional(v.number()), // basis points (e.g., 50 = 0.5%)
  },
  handler: async (ctx, args) => {
    // Get current rates
    const fromRate = await ctx.db
      .query("cryptoRates")
      .withIndex("by_symbol", (q) => q.eq("symbol", args.fromSymbol))
      .first();

    const toRate = await ctx.db
      .query("cryptoRates")
      .withIndex("by_symbol", (q) => q.eq("symbol", args.toSymbol))
      .first();

    if (!fromRate || !toRate) {
      throw new Error(`Rate not found for ${!fromRate ? args.fromSymbol : args.toSymbol}`);
    }

    // Calculate swap quote
    const fromUsdValue = args.amount * fromRate.usdPrice;
    const swapFeePercent = 0.003; // 0.3% fee
    const swapFee = fromUsdValue * swapFeePercent;
    const toAmount = (fromUsdValue - swapFee) / toRate.usdPrice;

    const slippage = args.slippageTolerance ?? 50; // default 0.5%
    const minToAmount = toAmount * (1 - slippage / 10000);

    const quote = {
      quoteId: `quote_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
      userId: args.userId,
      fromSymbol: args.fromSymbol,
      toSymbol: args.toSymbol,
      fromAmount: args.amount,
      toAmount,
      minToAmount,
      fromUsdValue,
      exchangeRate: fromRate.usdPrice / toRate.usdPrice,
      swapFee,
      swapFeePercent,
      slippageTolerance: slippage,
      expiresAt: Date.now() + 30000, // 30 second expiry
      status: "pending" as const,
      createdAt: Date.now(),
    };

    return quote;
  },
});

// Execute a swap quote
export const execute = mutation({
  args: {
    quoteId: v.string(),
    userId: v.id("users"),
    walletId: v.id("wallets"),
  },
  handler: async (ctx, args) => {
    // In production, this would:
    // 1. Validate the quote hasn't expired
    // 2. Connect to DEX aggregators (Jupiter, 1inch, etc.)
    // 3. Build and sign the swap transaction
    // 4. Submit to blockchain
    // 5. Wait for confirmation
    // 6. Create a fundingTransaction record

    // Mock execution
    const mockSignature = `sig_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;

    // Create a funding transaction record
    const txId = await ctx.db.insert("fundingTransactions", {
      userId: args.userId,
      transactionType: "crypto_conversion",
      amount: 0, // Would be populated from quote
      currency: "USD",
      sourceType: "wallet",
      sourceWalletId: args.walletId,
      status: "completed",
      solanaSignature: mockSignature,
      processingTimeMs: Math.floor(500 + Math.random() * 1500),
      createdAt: Date.now(),
      completedAt: Date.now(),
    });

    return {
      success: true,
      quoteId: args.quoteId,
      transactionId: txId,
      signature: mockSignature,
      executedAt: Date.now(),
    };
  },
});

// Cancel a pending quote
export const cancel = mutation({
  args: {
    quoteId: v.string(),
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    // Quotes are just in-memory until executed, so cancellation is a no-op
    return {
      success: true,
      quoteId: args.quoteId,
      cancelledAt: Date.now(),
    };
  },
});

// Get quote history for a user
export const history = query({
  args: {
    userId: v.id("users"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 20;

    // Get recent swap transactions
    const transactions = await ctx.db
      .query("fundingTransactions")
      .withIndex("by_user_type", (q) =>
        q.eq("userId", args.userId).eq("transactionType", "crypto_conversion")
      )
      .order("desc")
      .take(limit);

    return transactions;
  },
});

