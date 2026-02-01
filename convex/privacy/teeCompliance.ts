/**
 * TEE Compliance - Convex Actions
 *
 * Server-side storage and retrieval for Phala TEE compliance proofs:
 * - Store attestation-backed compliance results
 * - Track nullifier usage for replay protection
 * - Query proof history and verification status
 */

import { v } from "convex/values";
import { mutation, query } from "../_generated/server";

// ============ PROOF STORAGE ============

/**
 * Store a TEE compliance proof
 */
export const storeProof = mutation({
  args: {
    nullifier: v.string(),
    addressCommitment: v.string(),
    compliant: v.boolean(),
    riskLevel: v.union(
      v.literal("low"),
      v.literal("medium"),
      v.literal("high"),
      v.literal("critical")
    ),
    mrEnclave: v.string(),
    mrSigner: v.optional(v.string()),
    attestationQuote: v.optional(v.string()),
    expiresAt: v.number(),
    usedFor: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();

    // Get user if authenticated
    let userId = undefined;
    if (identity) {
      const user = await ctx.db
        .query("users")
        .withIndex("by_credential", (q) => q.eq("credentialId", identity.subject))
        .first();
      userId = user?._id;
    }

    // Check for duplicate nullifier
    const existingProof = await ctx.db
      .query("teeComplianceProofs")
      .withIndex("by_nullifier", (q) => q.eq("nullifier", args.nullifier))
      .first();

    if (existingProof) {
      throw new Error("Nullifier already used - proof replay detected");
    }

    // Store the proof
    const proofId = await ctx.db.insert("teeComplianceProofs", {
      nullifier: args.nullifier,
      addressCommitment: args.addressCommitment,
      compliant: args.compliant,
      riskLevel: args.riskLevel,
      mrEnclave: args.mrEnclave,
      mrSigner: args.mrSigner,
      attestationQuote: args.attestationQuote,
      checkedAt: Date.now(),
      expiresAt: args.expiresAt,
      storedAt: Date.now(),
      usedBy: userId,
      usedFor: args.usedFor,
      status: "valid",
    });

    return { proofId, stored: true };
  },
});

/**
 * Mark a proof as used (consumed)
 */
export const markProofUsed = mutation({
  args: {
    nullifier: v.string(),
    usedFor: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const proof = await ctx.db
      .query("teeComplianceProofs")
      .withIndex("by_nullifier", (q) => q.eq("nullifier", args.nullifier))
      .first();

    if (!proof) {
      throw new Error("Proof not found");
    }

    if (proof.status === "used") {
      throw new Error("Proof already used");
    }

    if (proof.status === "expired" || Date.now() >= proof.expiresAt) {
      await ctx.db.patch(proof._id, { status: "expired" });
      throw new Error("Proof has expired");
    }

    await ctx.db.patch(proof._id, {
      status: "used",
      usedFor: args.usedFor || proof.usedFor,
    });

    return { success: true };
  },
});

/**
 * Revoke a proof (e.g., new sanctions data invalidates old check)
 */
export const revokeProof = mutation({
  args: {
    nullifier: v.string(),
    reason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const proof = await ctx.db
      .query("teeComplianceProofs")
      .withIndex("by_nullifier", (q) => q.eq("nullifier", args.nullifier))
      .first();

    if (!proof) {
      throw new Error("Proof not found");
    }

    await ctx.db.patch(proof._id, { status: "revoked" });

    return { success: true };
  },
});

// ============ PROOF QUERIES ============

/**
 * Get a proof by nullifier
 */
export const getByNullifier = query({
  args: {
    nullifier: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("teeComplianceProofs")
      .withIndex("by_nullifier", (q) => q.eq("nullifier", args.nullifier))
      .first();
  },
});

/**
 * Get proofs by address commitment
 */
export const getByCommitment = query({
  args: {
    addressCommitment: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("teeComplianceProofs")
      .withIndex("by_commitment", (q) => q.eq("addressCommitment", args.addressCommitment))
      .collect();
  },
});

/**
 * Get proofs by MRENCLAVE (for enclave version tracking)
 */
export const getByMrEnclave = query({
  args: {
    mrEnclave: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("teeComplianceProofs")
      .withIndex("by_mr_enclave", (q) => q.eq("mrEnclave", args.mrEnclave))
      .collect();
  },
});

/**
 * Get valid proofs for a user
 */
export const getValidProofsForUser = query({
  args: {},
  handler: async (ctx) => {
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

    const now = Date.now();

    // Get all valid proofs for user that haven't expired
    const proofs = await ctx.db
      .query("teeComplianceProofs")
      .withIndex("by_user", (q) => q.eq("usedBy", user._id))
      .filter((q) =>
        q.and(
          q.eq(q.field("status"), "valid"),
          q.gt(q.field("expiresAt"), now)
        )
      )
      .collect();

    return proofs;
  },
});

/**
 * Check if nullifier has been used
 */
export const isNullifierUsed = query({
  args: {
    nullifier: v.string(),
  },
  handler: async (ctx, args) => {
    const proof = await ctx.db
      .query("teeComplianceProofs")
      .withIndex("by_nullifier", (q) => q.eq("nullifier", args.nullifier))
      .first();

    return {
      used: proof !== null,
      status: proof?.status,
    };
  },
});

/**
 * Get proof statistics for monitoring
 */
export const getStats = query({
  args: {},
  handler: async (ctx) => {
    const allProofs = await ctx.db
      .query("teeComplianceProofs")
      .collect();

    const now = Date.now();
    const oneDayAgo = now - 24 * 60 * 60 * 1000;

    const stats = {
      total: allProofs.length,
      valid: 0,
      used: 0,
      expired: 0,
      revoked: 0,
      compliant: 0,
      nonCompliant: 0,
      last24h: 0,
      byRiskLevel: {
        low: 0,
        medium: 0,
        high: 0,
        critical: 0,
      },
      uniqueEnclaves: new Set<string>(),
    };

    for (const proof of allProofs) {
      // Count by status
      if (proof.status === "valid") stats.valid++;
      else if (proof.status === "used") stats.used++;
      else if (proof.status === "expired") stats.expired++;
      else if (proof.status === "revoked") stats.revoked++;

      // Count compliance
      if (proof.compliant) stats.compliant++;
      else stats.nonCompliant++;

      // Count by risk level
      stats.byRiskLevel[proof.riskLevel]++;

      // Count last 24h
      if (proof.storedAt >= oneDayAgo) stats.last24h++;

      // Track unique enclaves
      stats.uniqueEnclaves.add(proof.mrEnclave);
    }

    return {
      ...stats,
      uniqueEnclaves: stats.uniqueEnclaves.size,
    };
  },
});

// ============ CLEANUP ============

/**
 * Mark expired proofs (can be run periodically)
 */
export const markExpiredProofs = mutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();

    // Find expired but still marked as valid
    const expiredProofs = await ctx.db
      .query("teeComplianceProofs")
      .withIndex("by_status", (q) => q.eq("status", "valid"))
      .filter((q) => q.lt(q.field("expiresAt"), now))
      .collect();

    let count = 0;
    for (const proof of expiredProofs) {
      await ctx.db.patch(proof._id, { status: "expired" });
      count++;
    }

    return { expiredCount: count };
  },
});
