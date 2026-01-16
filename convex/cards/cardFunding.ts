/**
 * Privacy-Preserving Card Funding
 *
 * Handles shielded funding flows for prepaid cards with:
 * - Single-use address generation for top-ups
 * - Session key restrictions (can only fund cards)
 * - Balance commitment tracking
 * - No on-chain correlation between user and card
 *
 * Flow:
 * 1. User requests to fund card
 * 2. Generate single-use Turnkey address
 * 3. Create session key restricted to card funding endpoint
 * 4. User unshields from Privacy Cash to single-use address
 * 5. Single-use address funds card via provider API
 * 6. Balance commitment updated, address discarded
 */
import { action, internalAction, internalMutation, internalQuery, mutation, query } from "../_generated/server";
import { v } from "convex/values";
import { Id } from "../_generated/dataModel";
import { internal } from "../_generated/api";

// Configuration
const FUNDING_ADDRESS_EXPIRY_MS = 30 * 60 * 1000; // 30 minutes
const MAX_PENDING_FUNDING_REQUESTS = 3; // Per user

// ============ TYPES ============

interface FundingAddressResult {
  /** Single-use address for funding */
  address: string;
  /** Funding request ID for tracking */
  fundingRequestId: Id<"cardFundingRequests">;
  /** Session key ID for restricted signing */
  sessionKeyId: string;
  /** When this address expires */
  expiresAt: number;
  /** Amount to fund (cents) */
  amount: number;
  /** Provider fee (cents) */
  fee: number;
  /** Net amount after fee (cents) */
  netAmount: number;
}

// ============ SCHEMA EXTENSION ============
// Note: This table should be added to schema.ts

/*
cardFundingRequests: defineTable({
  userId: v.id("users"),
  cardId: v.id("cards"),

  // Funding details
  amount: v.number(),              // Requested amount (cents)
  fee: v.number(),                 // Provider fee (cents)
  netAmount: v.number(),           // Net amount after fee (cents)

  // Single-use address
  depositAddress: v.string(),      // Turnkey-generated address
  sessionKeyId: v.string(),        // Restricted session key
  subOrgId: v.string(),            // Turnkey sub-org ID

  // Status
  status: v.union(
    v.literal("pending"),          // Awaiting deposit
    v.literal("funded"),           // Deposit received
    v.literal("processing"),       // Funding card
    v.literal("completed"),        // Card funded
    v.literal("expired"),          // Address expired
    v.literal("failed")            // Error occurred
  ),

  // Tracking
  depositTxSignature: v.optional(v.string()),
  fundingTransactionId: v.optional(v.string()),
  errorMessage: v.optional(v.string()),

  // Timestamps
  createdAt: v.number(),
  expiresAt: v.number(),
  fundedAt: v.optional(v.number()),
  completedAt: v.optional(v.number()),
})
  .index("by_user", ["userId"])
  .index("by_card", ["cardId"])
  .index("by_address", ["depositAddress"])
  .index("by_status", ["status"])
  .index("by_expires", ["expiresAt"]),
*/

// ============ PUBLIC MUTATIONS ============

/**
 * Create a funding request for a prepaid card
 * Returns a single-use address for depositing funds
 */
export const createFundingRequest = mutation({
  args: {
    cardId: v.id("cards"),
    amount: v.number(), // In cents
  },
  handler: async (ctx, args): Promise<FundingAddressResult> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }

    // Get user
    const user = await ctx.db
      .query("users")
      .withIndex("by_credential", (q) => q.eq("credentialId", identity.subject))
      .first();

    if (!user) {
      throw new Error("User not found");
    }

    // Get card and validate
    const card = await ctx.db.get(args.cardId);
    if (!card) {
      throw new Error("Card not found");
    }

    if (card.userId !== user._id) {
      throw new Error("Card does not belong to user");
    }

    if (card.provider !== "starpay") {
      throw new Error("Only Starpay prepaid cards can be funded this way");
    }

    if (card.starpayCardType === "black") {
      throw new Error("Black cards cannot be topped up. Create a new card instead.");
    }

    // Check pending funding requests limit
    const pendingRequests = await ctx.db
      .query("cardFundingRequests")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .filter((q) => q.eq(q.field("status"), "pending"))
      .collect();

    if (pendingRequests.length >= MAX_PENDING_FUNDING_REQUESTS) {
      throw new Error(`Maximum ${MAX_PENDING_FUNDING_REQUESTS} pending funding requests allowed`);
    }

    // Check daily limit
    const now = Date.now();
    const todayStart = new Date().setHours(0, 0, 0, 0);
    const totalToday = card.topUpResetAt && card.topUpResetAt > todayStart
      ? (card.totalTopUpToday ?? 0)
      : 0;

    const dailyLimit = card.dailyTopUpLimit ?? 500000; // $5,000 default
    if (totalToday + args.amount > dailyLimit) {
      throw new Error(`Daily top-up limit exceeded. Remaining: $${(dailyLimit - totalToday) / 100}`);
    }

    // Check single top-up limit
    const maxSingle = card.maxSingleTopUp ?? 100000; // $1,000 default
    if (args.amount > maxSingle) {
      throw new Error(`Max single top-up is $${maxSingle / 100}`);
    }

    // Calculate fee (Starpay doesn't charge for Platinum top-ups based on docs)
    const fee = 0;
    const netAmount = args.amount;

    // Generate single-use address via Turnkey
    // This is a placeholder - actual implementation calls Turnkey
    const expiresAt = now + FUNDING_ADDRESS_EXPIRY_MS;
    const depositAddress = `funding_${card._id}_${now}`; // Placeholder
    const sessionKeyId = `session_${now}`; // Placeholder
    const subOrgId = "user_suborg"; // Placeholder

    // Create funding request record
    const fundingRequestId = await ctx.db.insert("cardFundingRequests", {
      userId: user._id,
      cardId: args.cardId,
      amount: args.amount,
      fee,
      netAmount,
      depositAddress,
      sessionKeyId,
      subOrgId,
      status: "pending",
      createdAt: now,
      expiresAt,
    });

    return {
      address: depositAddress,
      fundingRequestId,
      sessionKeyId,
      expiresAt,
      amount: args.amount,
      fee,
      netAmount,
    };
  },
});

/**
 * Cancel a pending funding request
 */
export const cancelFundingRequest = mutation({
  args: {
    fundingRequestId: v.id("cardFundingRequests"),
  },
  handler: async (ctx, args): Promise<void> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }

    const request = await ctx.db.get(args.fundingRequestId);
    if (!request) {
      throw new Error("Funding request not found");
    }

    // Get user to verify ownership
    const user = await ctx.db
      .query("users")
      .withIndex("by_credential", (q) => q.eq("credentialId", identity.subject))
      .first();

    if (!user || request.userId !== user._id) {
      throw new Error("Funding request does not belong to user");
    }

    if (request.status !== "pending") {
      throw new Error("Can only cancel pending requests");
    }

    // Mark as expired (effectively cancelled)
    await ctx.db.patch(args.fundingRequestId, {
      status: "expired",
    });

    // TODO: Revoke session key via Turnkey
  },
});

// ============ PUBLIC QUERIES ============

/**
 * Get pending funding requests for a card
 */
export const getPendingFundingRequests = query({
  args: {
    cardId: v.id("cards"),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return [];
    }

    const user = await ctx.db
      .query("users")
      .withIndex("by_credential", (q) => q.eq("credentialId", identity.subject))
      .first();

    if (!user) {
      return [];
    }

    const requests = await ctx.db
      .query("cardFundingRequests")
      .withIndex("by_card", (q) => q.eq("cardId", args.cardId))
      .filter((q) =>
        q.and(
          q.eq(q.field("userId"), user._id),
          q.eq(q.field("status"), "pending")
        )
      )
      .collect();

    // Filter out expired requests
    const now = Date.now();
    return requests.filter((r) => r.expiresAt > now);
  },
});

/**
 * Get funding history for a card
 */
export const getFundingHistory = query({
  args: {
    cardId: v.id("cards"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return [];
    }

    const user = await ctx.db
      .query("users")
      .withIndex("by_credential", (q) => q.eq("credentialId", identity.subject))
      .first();

    if (!user) {
      return [];
    }

    const requests = await ctx.db
      .query("cardFundingRequests")
      .withIndex("by_card", (q) => q.eq("cardId", args.cardId))
      .filter((q) => q.eq(q.field("userId"), user._id))
      .order("desc")
      .take(args.limit ?? 50);

    return requests;
  },
});

// ============ INTERNAL ACTIONS ============

/**
 * Process a funded deposit (called by webhook)
 */
export const processDeposit = internalAction({
  args: {
    depositAddress: v.string(),
    txSignature: v.string(),
    amount: v.number(), // Amount received (in cents/smallest unit)
  },
  handler: async (ctx, args): Promise<void> => {
    console.log(`[CardFunding] Processing deposit to ${args.depositAddress}`);

    // Find funding request by address
    const request = await ctx.runQuery(internal.cards.cardFunding.getFundingRequestByAddress, {
      address: args.depositAddress,
    });

    if (!request) {
      console.warn(`No funding request found for address ${args.depositAddress}`);
      return;
    }

    if (request.status !== "pending") {
      console.warn(`Funding request ${request._id} is not pending (status: ${request.status})`);
      return;
    }

    // Verify amount matches (with small tolerance for fees)
    const tolerance = 100; // $1 tolerance
    if (Math.abs(args.amount - request.amount) > tolerance) {
      console.warn(`Amount mismatch: expected ${request.amount}, got ${args.amount}`);
      // Still process but log the discrepancy
    }

    // Update request status
    await ctx.runMutation(internal.cards.cardFunding.updateRequestStatus, {
      requestId: request._id,
      status: "funded",
      depositTxSignature: args.txSignature,
    });

    // Fund the card via provider
    const fundResult = await ctx.runAction(internal.cards.starpay.fundCard, {
      cardId: request.cardId,
      amount: Math.min(args.amount, request.amount), // Use smaller amount
      singleUseAddress: args.depositAddress,
    });

    if (fundResult.success) {
      await ctx.runMutation(internal.cards.cardFunding.updateRequestStatus, {
        requestId: request._id,
        status: "completed",
        fundingTransactionId: fundResult.transactionId,
      });
      console.log(`Card ${request.cardId} funded successfully`);
    } else {
      await ctx.runMutation(internal.cards.cardFunding.updateRequestStatus, {
        requestId: request._id,
        status: "failed",
        errorMessage: fundResult.error,
      });
      console.error(`Failed to fund card ${request.cardId}: ${fundResult.error}`);
    }

    // Revoke session key (cleanup)
    // TODO: Call Turnkey to revoke session key
  },
});

/**
 * Expire old funding requests (scheduled job)
 */
export const expireOldRequests = internalAction({
  args: {},
  handler: async (ctx): Promise<number> => {
    const now = Date.now();

    const expiredRequests = await ctx.runQuery(internal.cards.cardFunding.getExpiredRequests, {
      beforeTimestamp: now,
    });

    for (const request of expiredRequests) {
      await ctx.runMutation(internal.cards.cardFunding.updateRequestStatus, {
        requestId: request._id,
        status: "expired",
      });

      // Revoke session key
      // TODO: Call Turnkey to revoke session key
    }

    console.log(`[CardFunding] Expired ${expiredRequests.length} funding requests`);
    return expiredRequests.length;
  },
});

// ============ INTERNAL QUERIES ============

/**
 * Get funding request by deposit address
 */
export const getFundingRequestByAddress = internalQuery({
  args: {
    address: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("cardFundingRequests")
      .withIndex("by_address", (q) => q.eq("depositAddress", args.address))
      .first();
  },
});

/**
 * Get expired pending requests
 */
export const getExpiredRequests = internalQuery({
  args: {
    beforeTimestamp: v.number(),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("cardFundingRequests")
      .withIndex("by_status", (q) => q.eq("status", "pending"))
      .filter((q) => q.lt(q.field("expiresAt"), args.beforeTimestamp))
      .collect();
  },
});

// ============ INTERNAL MUTATIONS ============

/**
 * Update funding request status
 */
export const updateRequestStatus = internalMutation({
  args: {
    requestId: v.id("cardFundingRequests"),
    status: v.union(
      v.literal("pending"),
      v.literal("funded"),
      v.literal("processing"),
      v.literal("completed"),
      v.literal("expired"),
      v.literal("failed")
    ),
    depositTxSignature: v.optional(v.string()),
    fundingTransactionId: v.optional(v.string()),
    errorMessage: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const updates: Record<string, unknown> = {
      status: args.status,
    };

    if (args.depositTxSignature) {
      updates.depositTxSignature = args.depositTxSignature;
    }
    if (args.fundingTransactionId) {
      updates.fundingTransactionId = args.fundingTransactionId;
    }
    if (args.errorMessage) {
      updates.errorMessage = args.errorMessage;
    }

    if (args.status === "funded") {
      updates.fundedAt = Date.now();
    }
    if (args.status === "completed") {
      updates.completedAt = Date.now();
    }

    await ctx.db.patch(args.requestId, updates);
  },
});
