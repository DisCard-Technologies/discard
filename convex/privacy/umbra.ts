/**
 * Umbra Shielded Pools - Convex Actions
 *
 * Server-side orchestration for Umbra shielded pool operations:
 * - Record pool deposits and withdrawals
 * - Track deposit notes (encrypted)
 * - Manage cross-card transfers
 */

import { v } from "convex/values";
import { mutation, query, action, internalMutation } from "../_generated/server";
import type { Id } from "../_generated/dataModel";

// ============ DEPOSIT RECORDING ============

/**
 * Record a new pool deposit
 */
export const recordDeposit = mutation({
  args: {
    cardId: v.optional(v.id("cards")),
    noteId: v.string(),
    commitment: v.string(),
    nullifier: v.string(),
    encryptedAmount: v.string(),
    poolId: v.string(),
  },
  handler: async (ctx, args) => {
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

    // Check for duplicate note
    const existingNote = await ctx.db
      .query("umbraTransfers")
      .filter((q) => q.eq(q.field("noteId"), args.noteId))
      .first();

    if (existingNote) {
      throw new Error("Deposit note already recorded");
    }

    // Verify card ownership if cardId provided
    if (args.cardId) {
      const card = await ctx.db.get(args.cardId);
      if (!card || card.userId !== user._id) {
        throw new Error("Card not found or access denied");
      }
    }

    // Record deposit
    const transferId = await ctx.db.insert("umbraTransfers", {
      userId: user._id,
      sourceCardId: args.cardId,
      noteId: args.noteId,
      commitment: args.commitment,
      nullifier: args.nullifier,
      encryptedAmount: args.encryptedAmount,
      poolId: args.poolId,
      type: "deposit",
      status: "pending",
      createdAt: Date.now(),
    });

    return { transferId, noteId: args.noteId };
  },
});

/**
 * Mark deposit as confirmed
 */
export const confirmDeposit = mutation({
  args: {
    noteId: v.string(),
    txSignature: v.string(),
  },
  handler: async (ctx, args) => {
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

    // Find transfer
    const transfer = await ctx.db
      .query("umbraTransfers")
      .filter((q) => q.eq(q.field("noteId"), args.noteId))
      .first();

    if (!transfer) {
      throw new Error("Deposit not found");
    }

    // Verify ownership
    if (transfer.userId !== user._id) {
      throw new Error("Access denied");
    }

    // Update status
    await ctx.db.patch(transfer._id, {
      status: "confirmed",
      confirmedAt: Date.now(),
      txSignature: args.txSignature,
    });

    return { success: true };
  },
});

// ============ WITHDRAWAL RECORDING ============

/**
 * Record a withdrawal request
 */
export const recordWithdrawal = mutation({
  args: {
    noteId: v.string(),
    targetCardId: v.optional(v.id("cards")),
    recipientAddress: v.string(),
  },
  handler: async (ctx, args) => {
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

    // Find original deposit
    const deposit = await ctx.db
      .query("umbraTransfers")
      .filter((q) =>
        q.and(
          q.eq(q.field("noteId"), args.noteId),
          q.eq(q.field("type"), "deposit")
        )
      )
      .first();

    if (!deposit) {
      throw new Error("Deposit note not found");
    }

    // Verify ownership
    if (deposit.userId !== user._id) {
      throw new Error("Access denied");
    }

    // Check if already withdrawn
    if (deposit.status === "withdrawn") {
      throw new Error("Note already withdrawn");
    }

    // Verify target card ownership if provided
    if (args.targetCardId) {
      const card = await ctx.db.get(args.targetCardId);
      if (!card || card.userId !== user._id) {
        throw new Error("Target card not found or access denied");
      }
    }

    // Record withdrawal
    const withdrawalId = await ctx.db.insert("umbraTransfers", {
      userId: user._id,
      targetCardId: args.targetCardId,
      noteId: `withdraw_${args.noteId}`,
      commitment: deposit.commitment,
      nullifier: deposit.nullifier,
      encryptedAmount: deposit.encryptedAmount,
      poolId: deposit.poolId,
      type: "withdrawal",
      status: "pending",
      recipientAddress: args.recipientAddress,
      sourceNoteId: args.noteId,
      createdAt: Date.now(),
    });

    // Mark original deposit as withdrawing
    await ctx.db.patch(deposit._id, {
      status: "withdrawing",
    });

    return { withdrawalId };
  },
});

/**
 * Confirm withdrawal completion
 */
export const confirmWithdrawal = mutation({
  args: {
    noteId: v.string(),
    txSignature: v.string(),
  },
  handler: async (ctx, args) => {
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

    // Find withdrawal
    const withdrawal = await ctx.db
      .query("umbraTransfers")
      .filter((q) =>
        q.and(
          q.eq(q.field("noteId"), `withdraw_${args.noteId}`),
          q.eq(q.field("type"), "withdrawal")
        )
      )
      .first();

    if (!withdrawal) {
      throw new Error("Withdrawal not found");
    }

    if (withdrawal.userId !== user._id) {
      throw new Error("Access denied");
    }

    // Update withdrawal status
    await ctx.db.patch(withdrawal._id, {
      status: "confirmed",
      confirmedAt: Date.now(),
      txSignature: args.txSignature,
    });

    // Mark original deposit as withdrawn
    const deposit = await ctx.db
      .query("umbraTransfers")
      .filter((q) =>
        q.and(
          q.eq(q.field("noteId"), args.noteId),
          q.eq(q.field("type"), "deposit")
        )
      )
      .first();

    if (deposit) {
      await ctx.db.patch(deposit._id, {
        status: "withdrawn",
      });
    }

    return { success: true };
  },
});

// ============ QUERIES ============

/**
 * Get user's deposit notes
 */
export const getUserDeposits = query({
  args: {
    status: v.optional(v.union(
      v.literal("pending"),
      v.literal("confirmed"),
      v.literal("withdrawing"),
      v.literal("withdrawn"),
      v.literal("failed")
    )),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];

    const user = await ctx.db
      .query("users")
      .withIndex("by_credential", (q) => q.eq("credentialId", identity.subject))
      .first();

    if (!user) return [];

    let query = ctx.db
      .query("umbraTransfers")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .filter((q) => q.eq(q.field("type"), "deposit"));

    if (args.status) {
      query = query.filter((q) => q.eq(q.field("status"), args.status));
    }

    return await query.order("desc").take(args.limit || 50);
  },
});

/**
 * Get available (unspent) deposit notes
 */
export const getAvailableNotes = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];

    const user = await ctx.db
      .query("users")
      .withIndex("by_credential", (q) => q.eq("credentialId", identity.subject))
      .first();

    if (!user) return [];

    return await ctx.db
      .query("umbraTransfers")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .filter((q) =>
        q.and(
          q.eq(q.field("type"), "deposit"),
          q.eq(q.field("status"), "confirmed")
        )
      )
      .collect();
  },
});

/**
 * Get deposit note by ID
 */
export const getNote = query({
  args: {
    noteId: v.string(),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;

    const user = await ctx.db
      .query("users")
      .withIndex("by_credential", (q) => q.eq("credentialId", identity.subject))
      .first();

    if (!user) return null;

    const note = await ctx.db
      .query("umbraTransfers")
      .filter((q) => q.eq(q.field("noteId"), args.noteId))
      .first();

    if (!note || note.userId !== user._id) return null;

    return note;
  },
});

/**
 * Get transfers for a card
 */
export const getCardTransfers = query({
  args: {
    cardId: v.id("cards"),
    type: v.optional(v.union(v.literal("deposit"), v.literal("withdrawal"))),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];

    const user = await ctx.db
      .query("users")
      .withIndex("by_credential", (q) => q.eq("credentialId", identity.subject))
      .first();

    if (!user) return [];

    // Verify card ownership
    const card = await ctx.db.get(args.cardId);
    if (!card || card.userId !== user._id) return [];

    // Get deposits from this card
    const deposits = await ctx.db
      .query("umbraTransfers")
      .filter((q) =>
        q.and(
          q.eq(q.field("sourceCardId"), args.cardId),
          args.type ? q.eq(q.field("type"), args.type) : true
        )
      )
      .take(args.limit || 25);

    // Get withdrawals to this card
    const withdrawals = await ctx.db
      .query("umbraTransfers")
      .filter((q) =>
        q.and(
          q.eq(q.field("targetCardId"), args.cardId),
          args.type ? q.eq(q.field("type"), args.type) : true
        )
      )
      .take(args.limit || 25);

    // Combine and sort
    const all = [...deposits, ...withdrawals];
    all.sort((a, b) => b.createdAt - a.createdAt);

    return all.slice(0, args.limit || 50);
  },
});

// ============ CROSS-CARD TRANSFER ============

/**
 * Initiate a cross-card transfer through shielded pool
 */
export const initiateCardTransfer = mutation({
  args: {
    sourceCardId: v.id("cards"),
    targetCardId: v.id("cards"),
    noteId: v.string(),
    commitment: v.string(),
    nullifier: v.string(),
    encryptedAmount: v.string(),
    poolId: v.string(),
  },
  handler: async (ctx, args) => {
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
      throw new Error("Source card not found or access denied");
    }

    if (!targetCard || targetCard.userId !== user._id) {
      throw new Error("Target card not found or access denied");
    }

    // Record the transfer deposit
    const transferId = await ctx.db.insert("umbraTransfers", {
      userId: user._id,
      sourceCardId: args.sourceCardId,
      targetCardId: args.targetCardId,
      noteId: args.noteId,
      commitment: args.commitment,
      nullifier: args.nullifier,
      encryptedAmount: args.encryptedAmount,
      poolId: args.poolId,
      type: "deposit",
      status: "pending",
      isCardTransfer: true,
      createdAt: Date.now(),
    });

    return { transferId, noteId: args.noteId };
  },
});

// ============ CLEANUP ============

/**
 * Clean up old completed transfers
 */
export const cleanupOldTransfers = internalMutation({
  args: {},
  handler: async (ctx) => {
    // Delete transfers older than 90 days that are fully completed
    const cutoff = Date.now() - 90 * 24 * 60 * 60 * 1000;

    const oldTransfers = await ctx.db
      .query("umbraTransfers")
      .filter((q) =>
        q.and(
          q.eq(q.field("status"), "withdrawn"),
          q.lt(q.field("createdAt"), cutoff)
        )
      )
      .take(100);

    for (const transfer of oldTransfers) {
      await ctx.db.delete(transfer._id);
    }

    return { deleted: oldTransfers.length };
  },
});

// ============ ACTIONS ============

/**
 * Full deposit flow: record and wait for confirmation
 */
export const depositToPool = action({
  args: {
    cardId: v.optional(v.id("cards")),
    noteId: v.string(),
    commitment: v.string(),
    nullifier: v.string(),
    encryptedAmount: v.string(),
    poolId: v.string(),
  },
  handler: async (ctx, args): Promise<{
    success: boolean;
    transferId?: string;
    error?: string;
  }> => {
    try {
      // Record deposit
      const result = await ctx.runMutation(
        // @ts-expect-error - api type
        "privacy/umbra:recordDeposit",
        {
          cardId: args.cardId,
          noteId: args.noteId,
          commitment: args.commitment,
          nullifier: args.nullifier,
          encryptedAmount: args.encryptedAmount,
          poolId: args.poolId,
        }
      );

      // In production, this would:
      // 1. Build and send the deposit transaction
      // 2. Wait for confirmation
      // 3. Call confirmDeposit with the signature

      return {
        success: true,
        transferId: result.transferId,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  },
});

/**
 * Full withdrawal flow: record and execute
 */
export const withdrawFromPool = action({
  args: {
    noteId: v.string(),
    targetCardId: v.optional(v.id("cards")),
    recipientAddress: v.string(),
  },
  handler: async (ctx, args): Promise<{
    success: boolean;
    withdrawalId?: string;
    txSignature?: string;
    error?: string;
  }> => {
    try {
      // Record withdrawal request
      const result = await ctx.runMutation(
        // @ts-expect-error - api type
        "privacy/umbra:recordWithdrawal",
        {
          noteId: args.noteId,
          targetCardId: args.targetCardId,
          recipientAddress: args.recipientAddress,
        }
      );

      // In production, this would:
      // 1. Generate ZK proof of ownership
      // 2. Build and send withdrawal transaction
      // 3. Wait for confirmation
      // 4. Call confirmWithdrawal

      return {
        success: true,
        withdrawalId: result.withdrawalId,
        txSignature: `sim_${Date.now()}`,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  },
});
