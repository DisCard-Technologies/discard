/**
 * DisCard 2035 - Transfer Mutations & Queries
 *
 * Convex functions for P2P transfer management.
 */

import { v } from "convex/values";
import { mutation, query, internalMutation } from "../_generated/server";
import { Id } from "../_generated/dataModel";

// ============================================================================
// Mutations
// ============================================================================

/**
 * Create a new transfer record
 */
export const create = mutation({
  args: {
    recipientType: v.union(
      v.literal("address"),
      v.literal("sol_name"),
      v.literal("contact")
    ),
    recipientIdentifier: v.string(),
    recipientAddress: v.string(),
    recipientDisplayName: v.optional(v.string()),
    amount: v.number(),
    token: v.string(),
    tokenMint: v.string(),
    tokenDecimals: v.number(),
    amountUsd: v.number(),
    networkFee: v.number(),
    platformFee: v.number(),
    priorityFee: v.optional(v.number()),
    memo: v.optional(v.string()),
    idempotencyKey: v.optional(v.string()),
    // Privacy fields
    isPrivate: v.optional(v.boolean()),
    stealthAddress: v.optional(v.string()),
    ephemeralPubKey: v.optional(v.string()),
    encryptedNote: v.optional(v.string()),
    ringSignatureHash: v.optional(v.string()),
    privacyMethod: v.optional(v.union(
      v.literal("shadowwire"),
      v.literal("zk_compressed"),
      v.literal("relay")
    )),
    // Fallback for custom auth when ctx.auth is not configured
    credentialId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // Try Convex auth first, fall back to credentialId parameter
    const identity = await ctx.auth.getUserIdentity();
    const credentialId = identity?.subject ?? args.credentialId;

    if (!credentialId) {
      throw new Error("Not authenticated");
    }

    // Get user from database
    const user = await ctx.db
      .query("users")
      .withIndex("by_credential", (q) =>
        q.eq("credentialId", credentialId)
      )
      .first();

    if (!user) {
      throw new Error("User not found");
    }

    // Check idempotency
    if (args.idempotencyKey) {
      const existing = await ctx.db
        .query("transfers")
        .withIndex("by_idempotency", (q) =>
          q.eq("idempotencyKey", args.idempotencyKey)
        )
        .first();

      if (existing) {
        return existing._id;
      }
    }

    // Create transfer record
    const transferId = await ctx.db.insert("transfers", {
      userId: user._id,
      recipientType: args.recipientType,
      recipientIdentifier: args.recipientIdentifier,
      recipientAddress: args.recipientAddress,
      recipientDisplayName: args.recipientDisplayName,
      amount: args.amount,
      token: args.token,
      tokenMint: args.tokenMint,
      tokenDecimals: args.tokenDecimals,
      amountUsd: args.amountUsd,
      networkFee: args.networkFee,
      platformFee: args.platformFee,
      priorityFee: args.priorityFee,
      memo: args.memo,
      // Privacy metadata
      isPrivate: args.isPrivate,
      stealthAddress: args.stealthAddress,
      ephemeralPubKey: args.ephemeralPubKey,
      encryptedNote: args.encryptedNote,
      ringSignatureHash: args.ringSignatureHash,
      privacyMethod: args.privacyMethod,
      status: "pending",
      idempotencyKey: args.idempotencyKey,
      createdAt: Date.now(),
    });

    return transferId;
  },
});

/**
 * Update transfer status
 */
export const updateStatus = mutation({
  args: {
    transferId: v.id("transfers"),
    status: v.union(
      v.literal("pending"),
      v.literal("signing"),
      v.literal("submitted"),
      v.literal("confirmed"),
      v.literal("finalized"),
      v.literal("failed")
    ),
    solanaSignature: v.optional(v.string()),
    errorMessage: v.optional(v.string()),
    confirmationTimeMs: v.optional(v.number()),
    // Fallback for custom auth when ctx.auth is not configured
    credentialId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // Try Convex auth first, fall back to credentialId parameter
    const identity = await ctx.auth.getUserIdentity();
    const credentialId = identity?.subject ?? args.credentialId;

    if (!credentialId) {
      throw new Error("Not authenticated");
    }

    const transfer = await ctx.db.get(args.transferId);
    if (!transfer) {
      throw new Error("Transfer not found");
    }

    const updates: Record<string, unknown> = {
      status: args.status,
    };

    if (args.solanaSignature) {
      updates.solanaSignature = args.solanaSignature;
    }

    if (args.errorMessage) {
      updates.errorMessage = args.errorMessage;
    }

    if (args.confirmationTimeMs !== undefined) {
      updates.confirmationTimeMs = args.confirmationTimeMs;
    }

    // Set timestamps based on status
    const now = Date.now();
    if (args.status === "signing") {
      updates.signedAt = now;
    } else if (args.status === "submitted") {
      updates.submittedAt = now;
    } else if (args.status === "confirmed" || args.status === "finalized") {
      updates.confirmedAt = now;
    }

    await ctx.db.patch(args.transferId, updates);
  },
});

/**
 * Internal mutation for updating status (from actions)
 */
export const internalUpdateStatus = internalMutation({
  args: {
    transferId: v.id("transfers"),
    status: v.union(
      v.literal("pending"),
      v.literal("signing"),
      v.literal("submitted"),
      v.literal("confirmed"),
      v.literal("finalized"),
      v.literal("failed")
    ),
    solanaSignature: v.optional(v.string()),
    errorMessage: v.optional(v.string()),
    confirmationTimeMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const transfer = await ctx.db.get(args.transferId);
    if (!transfer) {
      throw new Error("Transfer not found");
    }

    const updates: Record<string, unknown> = {
      status: args.status,
    };

    if (args.solanaSignature) {
      updates.solanaSignature = args.solanaSignature;
    }

    if (args.errorMessage) {
      updates.errorMessage = args.errorMessage;
    }

    if (args.confirmationTimeMs !== undefined) {
      updates.confirmationTimeMs = args.confirmationTimeMs;
    }

    const now = Date.now();
    if (args.status === "signing") {
      updates.signedAt = now;
    } else if (args.status === "submitted") {
      updates.submittedAt = now;
    } else if (args.status === "confirmed" || args.status === "finalized") {
      updates.confirmedAt = now;
    }

    await ctx.db.patch(args.transferId, updates);
  },
});

// ============================================================================
// Queries
// ============================================================================

/**
 * Get a single transfer by ID
 */
export const get = query({
  args: {
    transferId: v.id("transfers"),
  },
  handler: async (ctx, args) => {
    const transfer = await ctx.db.get(args.transferId);
    return transfer;
  },
});

/**
 * Get all transfers for the current user
 */
export const getByUser = query({
  args: {
    limit: v.optional(v.number()),
    // Fallback for custom auth when ctx.auth is not configured
    credentialId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // Try Convex auth first, fall back to credentialId parameter
    const identity = await ctx.auth.getUserIdentity();
    const credentialId = identity?.subject ?? args.credentialId;

    if (!credentialId) {
      return [];
    }

    const user = await ctx.db
      .query("users")
      .withIndex("by_credential", (q) =>
        q.eq("credentialId", credentialId)
      )
      .first();

    if (!user) {
      return [];
    }

    const transfers = await ctx.db
      .query("transfers")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .order("desc")
      .take(args.limit ?? 50);

    return transfers;
  },
});

/**
 * Get transfers to a specific recipient (contact history)
 */
export const getByContact = query({
  args: {
    recipientAddress: v.string(),
    limit: v.optional(v.number()),
    // Fallback for custom auth when ctx.auth is not configured
    credentialId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // Try Convex auth first, fall back to credentialId parameter
    const identity = await ctx.auth.getUserIdentity();
    const credentialId = identity?.subject ?? args.credentialId;

    if (!credentialId) {
      return [];
    }

    const user = await ctx.db
      .query("users")
      .withIndex("by_credential", (q) =>
        q.eq("credentialId", credentialId)
      )
      .first();

    if (!user) {
      return [];
    }

    const transfers = await ctx.db
      .query("transfers")
      .withIndex("by_user_recipient", (q) =>
        q.eq("userId", user._id).eq("recipientAddress", args.recipientAddress)
      )
      .order("desc")
      .take(args.limit ?? 20);

    return transfers;
  },
});

/**
 * Get recent transfers (last 24 hours)
 */
export const getRecent = query({
  args: {
    limit: v.optional(v.number()),
    // Fallback for custom auth when ctx.auth is not configured
    credentialId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // Try Convex auth first, fall back to credentialId parameter
    const identity = await ctx.auth.getUserIdentity();
    const credentialId = identity?.subject ?? args.credentialId;

    if (!credentialId) {
      return [];
    }

    const user = await ctx.db
      .query("users")
      .withIndex("by_credential", (q) =>
        q.eq("credentialId", credentialId)
      )
      .first();

    if (!user) {
      return [];
    }

    const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;

    const transfers = await ctx.db
      .query("transfers")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .filter((q) => q.gte(q.field("createdAt"), oneDayAgo))
      .order("desc")
      .take(args.limit ?? 10);

    return transfers;
  },
});

/**
 * Get transfer by Solana signature
 */
export const getBySignature = query({
  args: {
    signature: v.string(),
  },
  handler: async (ctx, args) => {
    const transfer = await ctx.db
      .query("transfers")
      .withIndex("by_signature", (q) =>
        q.eq("solanaSignature", args.signature)
      )
      .first();

    return transfer;
  },
});

/**
 * Get transfer statistics for the current user
 */
export const getStats = query({
  args: {
    // Fallback for custom auth when ctx.auth is not configured
    credentialId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // Try Convex auth first, fall back to credentialId parameter
    const identity = await ctx.auth.getUserIdentity();
    const credentialId = identity?.subject ?? args.credentialId;

    if (!credentialId) {
      return null;
    }

    const user = await ctx.db
      .query("users")
      .withIndex("by_credential", (q) =>
        q.eq("credentialId", credentialId)
      )
      .first();

    if (!user) {
      return null;
    }

    const transfers = await ctx.db
      .query("transfers")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .collect();

    const completed = transfers.filter(
      (t) => t.status === "confirmed" || t.status === "finalized"
    );
    const failed = transfers.filter((t) => t.status === "failed");

    const totalSentUsd = completed.reduce((sum, t) => sum + t.amountUsd, 0);
    const totalFeesPaid = completed.reduce(
      (sum, t) => sum + t.networkFee + t.platformFee + (t.priorityFee ?? 0),
      0
    );

    // Get unique recipients
    const uniqueRecipients = new Set(completed.map((t) => t.recipientAddress));

    return {
      totalTransfers: transfers.length,
      completedTransfers: completed.length,
      failedTransfers: failed.length,
      totalSentUsd,
      totalFeesPaid,
      uniqueRecipients: uniqueRecipients.size,
      averageConfirmationTimeMs:
        completed.length > 0
          ? completed.reduce((sum, t) => sum + (t.confirmationTimeMs ?? 0), 0) /
            completed.length
          : 0,
    };
  },
});
