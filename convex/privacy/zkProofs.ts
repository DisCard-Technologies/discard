/**
 * ZK Proofs - Convex Actions
 *
 * Server-side orchestration for Sunspot/Groth16 ZK proof verification:
 * - Record proof submissions
 * - Track verification status
 * - Query proof history
 */

import { v } from "convex/values";
import { mutation, query, action, internalMutation } from "../_generated/server";
import type { Id } from "../_generated/dataModel";

// ============ PROOF RECORDING ============

/**
 * Record a new ZK proof submission
 */
export const recordProof = mutation({
  args: {
    cardId: v.optional(v.id("cards")),
    proofType: v.union(
      v.literal("spending_limit"),
      v.literal("compliance"),
      v.literal("balance_threshold"),
      v.literal("age_verification"),
      v.literal("kyc_level")
    ),
    publicInputs: v.string(),
    proofHash: v.string(),
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

    // Check for duplicate proof
    const existingProof = await ctx.db
      .query("zkProofs")
      .filter((q) => q.eq(q.field("proofHash"), args.proofHash))
      .first();

    if (existingProof) {
      throw new Error("Proof already submitted");
    }

    // Verify card ownership if cardId provided
    if (args.cardId) {
      const card = await ctx.db.get(args.cardId);
      if (!card || card.userId !== user._id) {
        throw new Error("Card not found or access denied");
      }
    }

    // Record proof
    const proofId = await ctx.db.insert("zkProofs", {
      userId: user._id,
      cardId: args.cardId,
      proofType: args.proofType,
      publicInputs: args.publicInputs,
      proofHash: args.proofHash,
      verified: false,
      createdAt: Date.now(),
    });

    return { proofId };
  },
});

/**
 * Mark proof as verified
 */
export const markVerified = mutation({
  args: {
    proofId: v.id("zkProofs"),
    txSignature: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const proof = await ctx.db.get(args.proofId);
    if (!proof) {
      throw new Error("Proof not found");
    }

    await ctx.db.patch(args.proofId, {
      verified: true,
      verifiedAt: Date.now(),
      txSignature: args.txSignature,
    });

    return { success: true };
  },
});

/**
 * Mark proof verification failed
 */
export const markFailed = internalMutation({
  args: {
    proofId: v.id("zkProofs"),
  },
  handler: async (ctx, args) => {
    const proof = await ctx.db.get(args.proofId);
    if (!proof) return;

    // Delete failed proof
    await ctx.db.delete(args.proofId);
  },
});

// ============ PROOF QUERIES ============

/**
 * Get proof by ID
 */
export const getProof = query({
  args: {
    proofId: v.id("zkProofs"),
  },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.proofId);
  },
});

/**
 * Get proofs for a card
 */
export const getCardProofs = query({
  args: {
    cardId: v.id("cards"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("zkProofs")
      .withIndex("by_card", (q) => q.eq("cardId", args.cardId))
      .order("desc")
      .take(args.limit || 50);
  },
});

/**
 * Get user's proofs
 */
export const getUserProofs = query({
  args: {
    proofType: v.optional(v.union(
      v.literal("spending_limit"),
      v.literal("compliance"),
      v.literal("balance_threshold"),
      v.literal("age_verification"),
      v.literal("kyc_level")
    )),
    verified: v.optional(v.boolean()),
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
      .query("zkProofs")
      .withIndex("by_user", (q) => q.eq("userId", user._id));

    // Apply filters
    if (args.proofType) {
      query = query.filter((q) => q.eq(q.field("proofType"), args.proofType));
    }

    if (args.verified !== undefined) {
      query = query.filter((q) => q.eq(q.field("verified"), args.verified));
    }

    return await query.order("desc").take(args.limit || 50);
  },
});

/**
 * Check if user has valid spending limit proof for an amount
 */
export const hasValidSpendingProof = query({
  args: {
    cardId: v.id("cards"),
    amount: v.number(),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return false;

    // Look for recent verified spending_limit proof for this card
    const recentProof = await ctx.db
      .query("zkProofs")
      .withIndex("by_card", (q) => q.eq("cardId", args.cardId))
      .filter((q) =>
        q.and(
          q.eq(q.field("proofType"), "spending_limit"),
          q.eq(q.field("verified"), true),
          // Proof must be less than 1 hour old
          q.gt(q.field("verifiedAt"), Date.now() - 3600000)
        )
      )
      .first();

    if (!recentProof) return false;

    // Parse public inputs to check amount
    try {
      const inputs = JSON.parse(recentProof.publicInputs);
      // The proof is valid if the proved amount is >= requested amount
      return inputs.amount >= args.amount;
    } catch {
      return false;
    }
  },
});

// ============ VERIFICATION ACTION ============

/**
 * Submit and verify a ZK proof on-chain
 */
export const submitAndVerify = action({
  args: {
    cardId: v.optional(v.id("cards")),
    proofType: v.union(
      v.literal("spending_limit"),
      v.literal("compliance"),
      v.literal("balance_threshold"),
      v.literal("age_verification"),
      v.literal("kyc_level")
    ),
    publicInputs: v.string(),
    proofHash: v.string(),
    proofBytes: v.string(), // Base64 encoded proof
  },
  handler: async (ctx, args): Promise<{
    success: boolean;
    proofId?: string;
    txSignature?: string;
    error?: string;
  }> => {
    try {
      // Record proof in database
      const { proofId } = await ctx.runMutation(
        // @ts-expect-error - api type
        "privacy/zkProofs:recordProof",
        {
          cardId: args.cardId,
          proofType: args.proofType,
          publicInputs: args.publicInputs,
          proofHash: args.proofHash,
        }
      );

      // In production, this would:
      // 1. Build verification transaction
      // 2. Submit to Solana
      // 3. Wait for confirmation
      // 4. Update proof status

      // For now, simulate verification
      const isValid = true; // Simulated verification result

      if (isValid) {
        await ctx.runMutation(
          // @ts-expect-error - api type
          "privacy/zkProofs:markVerified",
          {
            proofId,
            txSignature: `sim_${Date.now()}`, // Simulated signature
          }
        );

        return {
          success: true,
          proofId,
          txSignature: `sim_${Date.now()}`,
        };
      } else {
        return {
          success: false,
          error: "Proof verification failed",
        };
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  },
});

// ============ CLEANUP ============

/**
 * Delete old unverified proofs (called by cron)
 */
export const cleanupOldProofs = internalMutation({
  args: {},
  handler: async (ctx) => {
    const cutoff = Date.now() - 24 * 60 * 60 * 1000; // 24 hours ago

    const oldProofs = await ctx.db
      .query("zkProofs")
      .withIndex("by_verified", (q) => q.eq("verified", false))
      .filter((q) => q.lt(q.field("createdAt"), cutoff))
      .collect();

    for (const proof of oldProofs) {
      await ctx.db.delete(proof._id);
    }

    return { deleted: oldProofs.length };
  },
});
