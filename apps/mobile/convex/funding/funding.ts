/**
 * Funding Module
 *
 * Handles account funding and card balance management:
 * - Fund account via Stripe
 * - Allocate funds to cards
 * - Transfer between cards
 * - Track funding transactions
 *
 * Ported from: apps/api/src/services/funding/funding.service.ts
 */
import { mutation, query, internalMutation, internalQuery } from "../_generated/server";
import { v } from "convex/values";
import { Doc, Id } from "../_generated/dataModel";
import { internal } from "../_generated/api";

// ============ CONSTANTS ============

const LIMITS = {
  MIN_FUNDING_AMOUNT: 100,           // $1.00 minimum
  MAX_FUNDING_AMOUNT: 1000000,       // $10,000 maximum
  DAILY_FUNDING_LIMIT: 500000,       // $5,000 per day
  MONTHLY_FUNDING_LIMIT: 5000000,    // $50,000 per month
};

// ============ QUERIES ============

/**
 * Get account balance (sum of all card balances)
 */
export const accountBalance = query({
  args: {},
  handler: async (ctx): Promise<{
    totalBalance: number;
    availableBalance: number;
    reservedBalance: number;
    cardCount: number;
  }> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return { totalBalance: 0, availableBalance: 0, reservedBalance: 0, cardCount: 0 };
    }

    const user = await ctx.db
      .query("users")
      .withIndex("by_credential", (q) => q.eq("credentialId", identity.subject))
      .first();

    if (!user) {
      return { totalBalance: 0, availableBalance: 0, reservedBalance: 0, cardCount: 0 };
    }

    // Get all active cards
    const cards = await ctx.db
      .query("cards")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .filter((q) =>
        q.and(
          q.neq(q.field("status"), "deleted"),
          q.neq(q.field("status"), "terminated")
        )
      )
      .collect();

    const totalBalance = cards.reduce((sum, card) => sum + card.currentBalance, 0);
    const reservedBalance = cards.reduce((sum, card) => sum + card.reservedBalance, 0);

    return {
      totalBalance,
      availableBalance: totalBalance - reservedBalance,
      reservedBalance,
      cardCount: cards.length,
    };
  },
});

/**
 * Get funding transaction history
 */
export const transactions = query({
  args: {
    limit: v.optional(v.number()),
    offset: v.optional(v.number()),
    transactionType: v.optional(v.union(
      v.literal("all"),
      v.literal("account_funding"),
      v.literal("card_allocation"),
      v.literal("card_transfer"),
      v.literal("defi_withdrawal")
    )),
  },
  handler: async (ctx, args): Promise<{
    transactions: Doc<"fundingTransactions">[];
    total: number;
  }> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return { transactions: [], total: 0 };
    }

    const user = await ctx.db
      .query("users")
      .withIndex("by_credential", (q) => q.eq("credentialId", identity.subject))
      .first();

    if (!user) {
      return { transactions: [], total: 0 };
    }

    let allTransactions = await ctx.db
      .query("fundingTransactions")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .collect();

    // Filter by type if specified
    if (args.transactionType && args.transactionType !== "all") {
      allTransactions = allTransactions.filter(
        (t) => t.transactionType === args.transactionType
      );
    }

    // Sort by creation date (newest first)
    allTransactions.sort((a, b) => b.createdAt - a.createdAt);

    // Apply pagination
    const offset = args.offset ?? 0;
    const limit = args.limit ?? 50;
    const paginatedTransactions = allTransactions.slice(offset, offset + limit);

    return {
      transactions: paginatedTransactions,
      total: allTransactions.length,
    };
  },
});

/**
 * Get a single transaction
 */
export const getTransaction = query({
  args: {
    transactionId: v.id("fundingTransactions"),
  },
  handler: async (ctx, args): Promise<Doc<"fundingTransactions"> | null> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;

    const user = await ctx.db
      .query("users")
      .withIndex("by_credential", (q) => q.eq("credentialId", identity.subject))
      .first();

    if (!user) return null;

    const transaction = await ctx.db.get(args.transactionId);

    if (!transaction || transaction.userId !== user._id) {
      return null;
    }

    return transaction;
  },
});

// ============ MUTATIONS ============

/**
 * Fund account via Stripe (creates payment intent)
 */
export const fundAccount = mutation({
  args: {
    amount: v.number(),                // In cents
    paymentMethodId: v.optional(v.string()), // Stripe payment method ID
  },
  handler: async (ctx, args): Promise<{
    transactionId: Id<"fundingTransactions">;
    clientSecret: string;
  }> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }

    const user = await ctx.db
      .query("users")
      .withIndex("by_credential", (q) => q.eq("credentialId", identity.subject))
      .first();

    if (!user) {
      throw new Error("User not found");
    }

    // Validate amount
    if (args.amount < LIMITS.MIN_FUNDING_AMOUNT) {
      throw new Error(`Minimum funding amount is $${(LIMITS.MIN_FUNDING_AMOUNT / 100).toFixed(2)}`);
    }

    if (args.amount > LIMITS.MAX_FUNDING_AMOUNT) {
      throw new Error(`Maximum funding amount is $${(LIMITS.MAX_FUNDING_AMOUNT / 100).toFixed(2)}`);
    }

    // Check daily limit
    const dailyUsed = await checkDailyLimit(ctx, user._id);
    if (dailyUsed + args.amount > LIMITS.DAILY_FUNDING_LIMIT) {
      throw new Error(`Daily funding limit of $${(LIMITS.DAILY_FUNDING_LIMIT / 100).toFixed(2)} exceeded`);
    }

    // Check monthly limit
    const monthlyUsed = await checkMonthlyLimit(ctx, user._id);
    if (monthlyUsed + args.amount > LIMITS.MONTHLY_FUNDING_LIMIT) {
      throw new Error(`Monthly funding limit of $${(LIMITS.MONTHLY_FUNDING_LIMIT / 100).toFixed(2)} exceeded`);
    }

    // Create funding transaction record
    const transactionId = await ctx.db.insert("fundingTransactions", {
      userId: user._id,
      transactionType: "account_funding",
      amount: args.amount,
      currency: "USD",
      sourceType: "stripe",
      status: "pending",
      createdAt: Date.now(),
    });

    // Schedule Stripe payment intent creation
    await ctx.scheduler.runAfter(0, internal.funding.stripe.createPaymentIntent, {
      transactionId,
      userId: user._id,
      amount: args.amount,
      paymentMethodId: args.paymentMethodId,
    });

    // Return placeholder - actual client secret will be updated by the action
    return {
      transactionId,
      clientSecret: "pending",
    };
  },
});

/**
 * Allocate funds to a card
 */
export const allocateToCard = mutation({
  args: {
    cardId: v.id("cards"),
    amount: v.number(),
  },
  handler: async (ctx, args): Promise<Id<"fundingTransactions">> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }

    const user = await ctx.db
      .query("users")
      .withIndex("by_credential", (q) => q.eq("credentialId", identity.subject))
      .first();

    if (!user) {
      throw new Error("User not found");
    }

    // Verify card ownership
    const card = await ctx.db.get(args.cardId);
    if (!card || card.userId !== user._id) {
      throw new Error("Card not found");
    }

    if (card.status !== "active" && card.status !== "paused") {
      throw new Error("Card is not available for funding");
    }

    if (args.amount <= 0) {
      throw new Error("Amount must be positive");
    }

    // For card allocation, we need a source card or available balance
    // This simplified version just adds to the card balance
    // In production, this would debit from account balance

    // Create transaction record
    const transactionId = await ctx.db.insert("fundingTransactions", {
      userId: user._id,
      transactionType: "card_allocation",
      amount: args.amount,
      currency: "USD",
      targetCardId: args.cardId,
      status: "completed",
      createdAt: Date.now(),
      completedAt: Date.now(),
    });

    // Update card balance
    await ctx.db.patch(args.cardId, {
      currentBalance: card.currentBalance + args.amount,
      updatedAt: Date.now(),
    });

    return transactionId;
  },
});

/**
 * Transfer funds between cards
 */
export const transferBetweenCards = mutation({
  args: {
    sourceCardId: v.id("cards"),
    targetCardId: v.id("cards"),
    amount: v.number(),
  },
  handler: async (ctx, args): Promise<Id<"fundingTransactions">> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }

    const user = await ctx.db
      .query("users")
      .withIndex("by_credential", (q) => q.eq("credentialId", identity.subject))
      .first();

    if (!user) {
      throw new Error("User not found");
    }

    // Verify both cards belong to user
    const sourceCard = await ctx.db.get(args.sourceCardId);
    const targetCard = await ctx.db.get(args.targetCardId);

    if (!sourceCard || sourceCard.userId !== user._id) {
      throw new Error("Source card not found");
    }

    if (!targetCard || targetCard.userId !== user._id) {
      throw new Error("Target card not found");
    }

    if (args.sourceCardId === args.targetCardId) {
      throw new Error("Cannot transfer to same card");
    }

    if (sourceCard.status !== "active" && sourceCard.status !== "paused") {
      throw new Error("Source card is not available");
    }

    if (targetCard.status !== "active" && targetCard.status !== "paused") {
      throw new Error("Target card is not available");
    }

    if (args.amount <= 0) {
      throw new Error("Amount must be positive");
    }

    // Check source card balance
    const availableBalance = sourceCard.currentBalance - sourceCard.reservedBalance;
    if (availableBalance < args.amount) {
      throw new Error("Insufficient balance on source card");
    }

    // Create transaction record
    const transactionId = await ctx.db.insert("fundingTransactions", {
      userId: user._id,
      transactionType: "card_transfer",
      amount: args.amount,
      currency: "USD",
      sourceType: "card",
      sourceCardId: args.sourceCardId,
      targetCardId: args.targetCardId,
      status: "completed",
      createdAt: Date.now(),
      completedAt: Date.now(),
    });

    // Update balances
    await ctx.db.patch(args.sourceCardId, {
      currentBalance: sourceCard.currentBalance - args.amount,
      updatedAt: Date.now(),
    });

    await ctx.db.patch(args.targetCardId, {
      currentBalance: targetCard.currentBalance + args.amount,
      updatedAt: Date.now(),
    });

    return transactionId;
  },
});

// ============ INTERNAL MUTATIONS ============

/**
 * Update transaction status (called by Stripe webhook)
 */
export const updateTransactionStatus = internalMutation({
  args: {
    transactionId: v.id("fundingTransactions"),
    status: v.union(
      v.literal("pending"),
      v.literal("processing"),
      v.literal("completed"),
      v.literal("failed"),
      v.literal("cancelled"),
      v.literal("refunded")
    ),
    stripePaymentIntentId: v.optional(v.string()),
    stripeChargeId: v.optional(v.string()),
    errorMessage: v.optional(v.string()),
    errorCode: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<void> => {
    const updates: any = {
      status: args.status,
    };

    if (args.stripePaymentIntentId) {
      updates.stripePaymentIntentId = args.stripePaymentIntentId;
    }

    if (args.stripeChargeId) {
      updates.stripeChargeId = args.stripeChargeId;
    }

    if (args.errorMessage) {
      updates.errorMessage = args.errorMessage;
    }

    if (args.errorCode) {
      updates.errorCode = args.errorCode;
    }

    if (args.status === "completed") {
      updates.completedAt = Date.now();
    }

    await ctx.db.patch(args.transactionId, updates);
  },
});

/**
 * Complete account funding (called after successful payment)
 */
export const completeFunding = internalMutation({
  args: {
    transactionId: v.id("fundingTransactions"),
  },
  handler: async (ctx, args): Promise<void> => {
    const transaction = await ctx.db.get(args.transactionId);
    if (!transaction) {
      throw new Error("Transaction not found");
    }

    // Update transaction status
    await ctx.db.patch(args.transactionId, {
      status: "completed",
      completedAt: Date.now(),
    });

    // If this was direct funding to a card, update the card balance
    if (transaction.targetCardId) {
      const card = await ctx.db.get(transaction.targetCardId);
      if (card) {
        await ctx.db.patch(transaction.targetCardId, {
          currentBalance: card.currentBalance + transaction.amount,
          updatedAt: Date.now(),
        });
      }
    }
  },
});

/**
 * Get transaction by Stripe payment intent ID
 */
export const getByStripeIntentId = internalQuery({
  args: {
    stripePaymentIntentId: v.string(),
  },
  handler: async (ctx, args): Promise<Doc<"fundingTransactions"> | null> => {
    return await ctx.db
      .query("fundingTransactions")
      .withIndex("by_stripe_intent", (q) =>
        q.eq("stripePaymentIntentId", args.stripePaymentIntentId)
      )
      .first();
  },
});

// ============ HELPER FUNCTIONS ============

/**
 * Check daily funding usage
 */
async function checkDailyLimit(ctx: any, userId: Id<"users">): Promise<number> {
  const dayStart = new Date();
  dayStart.setHours(0, 0, 0, 0);

  const transactions = await ctx.db
    .query("fundingTransactions")
    .withIndex("by_user", (q: any) => q.eq("userId", userId))
    .filter((q: any) =>
      q.and(
        q.eq(q.field("transactionType"), "account_funding"),
        q.gte(q.field("createdAt"), dayStart.getTime()),
        q.or(
          q.eq(q.field("status"), "completed"),
          q.eq(q.field("status"), "pending"),
          q.eq(q.field("status"), "processing")
        )
      )
    )
    .collect();

  return transactions.reduce((sum: number, t: any) => sum + t.amount, 0);
}

/**
 * Check monthly funding usage
 */
async function checkMonthlyLimit(ctx: any, userId: Id<"users">): Promise<number> {
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);

  const transactions = await ctx.db
    .query("fundingTransactions")
    .withIndex("by_user", (q: any) => q.eq("userId", userId))
    .filter((q: any) =>
      q.and(
        q.eq(q.field("transactionType"), "account_funding"),
        q.gte(q.field("createdAt"), monthStart.getTime()),
        q.or(
          q.eq(q.field("status"), "completed"),
          q.eq(q.field("status"), "pending"),
          q.eq(q.field("status"), "processing")
        )
      )
    )
    .collect();

  return transactions.reduce((sum: number, t: any) => sum + t.amount, 0);
}
