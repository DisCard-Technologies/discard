/**
 * DisCard 2035 - Convex Light Protocol Functions
 *
 * Server-side functions for managing ZK-compressed accounts
 * and syncing state between Convex and Solana.
 */

import { v } from "convex/values";
import {
  mutation,
  query,
  internalMutation,
  internalQuery,
  action,
  internalAction,
} from "../_generated/server";
import { Id } from "../_generated/dataModel";

// ============================================================================
// Validators
// ============================================================================

const accountTypeValidator = v.union(
  v.literal("card_state"),
  v.literal("did_commitment"),
  v.literal("policy_state"),
  v.literal("vault")
);

const syncStatusValidator = v.union(
  v.literal("synced"),
  v.literal("pending_update"),
  v.literal("error")
);

// ============================================================================
// Queries
// ============================================================================

/**
 * Get compressed account by user ID and type
 */
export const getByUserAndType = query({
  args: {
    userId: v.id("users"),
    accountType: accountTypeValidator,
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("compressedAccounts")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .filter((q) => q.eq(q.field("accountType"), args.accountType))
      .collect();
  },
});

/**
 * Get compressed account for a specific card
 */
export const getByCardId = query({
  args: { cardId: v.id("cards") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("compressedAccounts")
      .withIndex("by_card", (q) => q.eq("cardId", args.cardId))
      .first();
  },
});

/**
 * Get compressed account for a specific DID
 */
export const getByDIDId = query({
  args: { didDocumentId: v.id("didDocuments") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("compressedAccounts")
      .withIndex("by_did", (q) => q.eq("didDocumentId", args.didDocumentId))
      .first();
  },
});

/**
 * Get all compressed accounts for a user
 */
export const getAllByUser = query({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("compressedAccounts")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .collect();
  },
});

/**
 * Get accounts pending sync
 */
export const getPendingSync = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db
      .query("compressedAccounts")
      .withIndex("by_sync_status", (q) => q.eq("syncStatus", "pending_update"))
      .collect();
  },
});

/**
 * Get accounts with errors
 */
export const getWithErrors = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db
      .query("compressedAccounts")
      .withIndex("by_sync_status", (q) => q.eq("syncStatus", "error"))
      .collect();
  },
});

/**
 * Get compressed account by merkle tree and leaf index
 */
export const getByMerklePosition = query({
  args: {
    merkleTreeAddress: v.string(),
    leafIndex: v.number(),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("compressedAccounts")
      .withIndex("by_merkle_tree", (q) => q.eq("merkleTreeAddress", args.merkleTreeAddress))
      .filter((q) => q.eq(q.field("leafIndex"), args.leafIndex))
      .first();
  },
});

// ============================================================================
// Mutations
// ============================================================================

/**
 * Create a new compressed account record
 */
export const create = mutation({
  args: {
    userId: v.id("users"),
    accountType: accountTypeValidator,
    cardId: v.optional(v.id("cards")),
    didDocumentId: v.optional(v.id("didDocuments")),
    merkleTreeAddress: v.string(),
    leafIndex: v.number(),
    stateHash: v.string(),
    compressedData: v.optional(v.bytes()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    const id = await ctx.db.insert("compressedAccounts", {
      userId: args.userId,
      accountType: args.accountType,
      cardId: args.cardId,
      didDocumentId: args.didDocumentId,
      merkleTreeAddress: args.merkleTreeAddress,
      leafIndex: args.leafIndex,
      stateHash: args.stateHash,
      compressedData: args.compressedData,
      syncStatus: "synced",
      createdAt: now,
      updatedAt: now,
    });

    return id;
  },
});

/**
 * Update compressed account after on-chain update
 */
export const updateAfterSync = mutation({
  args: {
    id: v.id("compressedAccounts"),
    stateHash: v.string(),
    leafIndex: v.optional(v.number()),
    compressedData: v.optional(v.bytes()),
    lastProofSlot: v.optional(v.number()),
    lastProofSignature: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const updates: Record<string, unknown> = {
      stateHash: args.stateHash,
      syncStatus: "synced",
      syncError: undefined,
      updatedAt: Date.now(),
    };

    if (args.leafIndex !== undefined) {
      updates.leafIndex = args.leafIndex;
    }
    if (args.compressedData !== undefined) {
      updates.compressedData = args.compressedData;
    }
    if (args.lastProofSlot !== undefined) {
      updates.lastProofSlot = args.lastProofSlot;
    }
    if (args.lastProofSignature !== undefined) {
      updates.lastProofSignature = args.lastProofSignature;
    }

    await ctx.db.patch(args.id, updates);
  },
});

/**
 * Mark account as pending update (before on-chain sync)
 */
export const markPendingUpdate = mutation({
  args: { id: v.id("compressedAccounts") },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, {
      syncStatus: "pending_update",
      updatedAt: Date.now(),
    });
  },
});

/**
 * Mark account as having sync error
 */
export const markError = mutation({
  args: {
    id: v.id("compressedAccounts"),
    error: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, {
      syncStatus: "error",
      syncError: args.error,
      updatedAt: Date.now(),
    });
  },
});

/**
 * Clear sync error and retry
 */
export const clearError = mutation({
  args: { id: v.id("compressedAccounts") },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, {
      syncStatus: "pending_update",
      syncError: undefined,
      updatedAt: Date.now(),
    });
  },
});

/**
 * Delete compressed account record
 */
export const remove = mutation({
  args: { id: v.id("compressedAccounts") },
  handler: async (ctx, args) => {
    await ctx.db.delete(args.id);
  },
});

// ============================================================================
// Card-Specific Operations
// ============================================================================

/**
 * Create compressed card account
 */
export const createCardAccount = mutation({
  args: {
    userId: v.id("users"),
    cardId: v.id("cards"),
    merkleTreeAddress: v.string(),
    leafIndex: v.number(),
    stateHash: v.string(),
    initialBalance: v.number(),
    spendingLimit: v.number(),
    dailyLimit: v.number(),
    monthlyLimit: v.number(),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    // Store card state as compressed data
    const cardState = {
      balance: args.initialBalance,
      spendingLimit: args.spendingLimit,
      dailyLimit: args.dailyLimit,
      monthlyLimit: args.monthlyLimit,
      currentDailySpend: 0,
      currentMonthlySpend: 0,
      isFrozen: false,
      createdAt: now,
    };

    const id = await ctx.db.insert("compressedAccounts", {
      userId: args.userId,
      accountType: "card_state",
      cardId: args.cardId,
      merkleTreeAddress: args.merkleTreeAddress,
      leafIndex: args.leafIndex,
      stateHash: args.stateHash,
      compressedData: new TextEncoder().encode(JSON.stringify(cardState)),
      syncStatus: "synced",
      createdAt: now,
      updatedAt: now,
    });

    return id;
  },
});

/**
 * Update card balance in compressed account
 */
export const updateCardBalance = mutation({
  args: {
    cardId: v.id("cards"),
    newBalance: v.number(),
    newStateHash: v.string(),
  },
  handler: async (ctx, args) => {
    const account = await ctx.db
      .query("compressedAccounts")
      .withIndex("by_card", (q) => q.eq("cardId", args.cardId))
      .first();

    if (!account) {
      throw new Error("Compressed card account not found");
    }

    // Update state
    const currentState = account.compressedData
      ? JSON.parse(new TextDecoder().decode(account.compressedData))
      : {};

    const newState = {
      ...currentState,
      balance: args.newBalance,
      updatedAt: Date.now(),
    };

    await ctx.db.patch(account._id, {
      stateHash: args.newStateHash,
      compressedData: new TextEncoder().encode(JSON.stringify(newState)),
      syncStatus: "synced",
      updatedAt: Date.now(),
    });
  },
});

// ============================================================================
// DID-Specific Operations
// ============================================================================

/**
 * Create compressed DID commitment account
 */
export const createDIDAccount = mutation({
  args: {
    userId: v.id("users"),
    didDocumentId: v.id("didDocuments"),
    merkleTreeAddress: v.string(),
    leafIndex: v.number(),
    stateHash: v.string(),
    commitmentHash: v.string(),
    documentHash: v.string(),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    const didState = {
      commitmentHash: args.commitmentHash,
      documentHash: args.documentHash,
      status: "active",
      createdAt: now,
    };

    const id = await ctx.db.insert("compressedAccounts", {
      userId: args.userId,
      accountType: "did_commitment",
      didDocumentId: args.didDocumentId,
      merkleTreeAddress: args.merkleTreeAddress,
      leafIndex: args.leafIndex,
      stateHash: args.stateHash,
      compressedData: new TextEncoder().encode(JSON.stringify(didState)),
      syncStatus: "synced",
      createdAt: now,
      updatedAt: now,
    });

    return id;
  },
});

/**
 * Update DID commitment after key rotation
 */
export const updateDIDCommitment = mutation({
  args: {
    didDocumentId: v.id("didDocuments"),
    newCommitmentHash: v.string(),
    newDocumentHash: v.string(),
    newStateHash: v.string(),
  },
  handler: async (ctx, args) => {
    const account = await ctx.db
      .query("compressedAccounts")
      .withIndex("by_did", (q) => q.eq("didDocumentId", args.didDocumentId))
      .first();

    if (!account) {
      throw new Error("Compressed DID account not found");
    }

    const currentState = account.compressedData
      ? JSON.parse(new TextDecoder().decode(account.compressedData))
      : {};

    const newState = {
      ...currentState,
      commitmentHash: args.newCommitmentHash,
      documentHash: args.newDocumentHash,
      lastRotationAt: Date.now(),
    };

    await ctx.db.patch(account._id, {
      stateHash: args.newStateHash,
      compressedData: new TextEncoder().encode(JSON.stringify(newState)),
      syncStatus: "synced",
      updatedAt: Date.now(),
    });
  },
});

// ============================================================================
// Internal Mutations
// ============================================================================

export const syncAllPending = internalMutation({
  args: {},
  handler: async (ctx) => {
    const pending = await ctx.db
      .query("compressedAccounts")
      .withIndex("by_sync_status", (q) => q.eq("syncStatus", "pending_update"))
      .collect();

    // Return IDs for action to process
    return pending.map((p) => p._id);
  },
});

// ============================================================================
// Statistics
// ============================================================================

/**
 * Get compression statistics for a user
 */
export const getUserStats = query({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const accounts = await ctx.db
      .query("compressedAccounts")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .collect();

    const byType = accounts.reduce(
      (acc, account) => {
        acc[account.accountType] = (acc[account.accountType] || 0) + 1;
        return acc;
      },
      {} as Record<string, number>
    );

    const syncedCount = accounts.filter((a) => a.syncStatus === "synced").length;
    const pendingCount = accounts.filter((a) => a.syncStatus === "pending_update").length;
    const errorCount = accounts.filter((a) => a.syncStatus === "error").length;

    // Estimate rent savings
    const STANDARD_RENT = 0.002; // SOL per account
    const COMPRESSED_RENT = 0.000002; // SOL per leaf
    const totalAccounts = accounts.length;
    const rentSavings = totalAccounts * (STANDARD_RENT - COMPRESSED_RENT);

    return {
      totalAccounts,
      byType,
      syncedCount,
      pendingCount,
      errorCount,
      estimatedRentSavingsSOL: rentSavings,
    };
  },
});

/**
 * Get global compression statistics
 */
export const getGlobalStats = query({
  args: {},
  handler: async (ctx) => {
    const allAccounts = await ctx.db.query("compressedAccounts").collect();

    const byType = allAccounts.reduce(
      (acc, account) => {
        acc[account.accountType] = (acc[account.accountType] || 0) + 1;
        return acc;
      },
      {} as Record<string, number>
    );

    const uniqueUsers = new Set(allAccounts.map((a) => a.userId)).size;
    const uniqueMerkleTrees = new Set(allAccounts.map((a) => a.merkleTreeAddress)).size;

    const STANDARD_RENT = 0.002;
    const COMPRESSED_RENT = 0.000002;
    const totalRentSavings = allAccounts.length * (STANDARD_RENT - COMPRESSED_RENT);

    return {
      totalAccounts: allAccounts.length,
      byType,
      uniqueUsers,
      uniqueMerkleTrees,
      estimatedRentSavingsSOL: totalRentSavings,
    };
  },
});
