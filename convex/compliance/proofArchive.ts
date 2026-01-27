/**
 * Compliance Proof Archive
 *
 * Store, query, and re-verify archived ZK compliance proofs.
 * Supports compliance reporting and institutional auditing.
 */

import { v } from "convex/values";
import {
  mutation,
  query,
  internalMutation,
  internalQuery,
} from "../_generated/server";

// ============================================================================
// Validators
// ============================================================================

const proofFormatValidator = v.union(
  v.literal("noir_bb"),
  v.literal("bulletproof"),
  v.literal("schnorr")
);

// ============================================================================
// Mutations
// ============================================================================

/**
 * Archive a compliance proof after generation.
 */
export const archiveProof = mutation({
  args: {
    userId: v.id("users"),
    organizationId: v.optional(v.id("turnkeyOrganizations")),
    proofId: v.string(),
    proofType: v.string(),
    circuitId: v.optional(v.string()),
    publicInputs: v.any(),
    proof: v.object({
      format: proofFormatValidator,
      data: v.string(),
    }),
    verificationKeyHash: v.string(),
    nullifier: v.string(),
    anchorTxSignature: v.optional(v.string()),
    anchorMerkleRoot: v.optional(v.string()),
    issuerDid: v.optional(v.string()),
    generatedAt: v.number(),
    expiresAt: v.number(),
  },
  handler: async (ctx, args) => {
    // Check for nullifier replay
    const existing = await ctx.db
      .query("complianceProofArchive")
      .withIndex("by_nullifier", (q) => q.eq("nullifier", args.nullifier))
      .first();

    if (existing) {
      throw new Error("Nullifier already used — proof replay detected");
    }

    const id = await ctx.db.insert("complianceProofArchive", {
      userId: args.userId,
      organizationId: args.organizationId,
      proofId: args.proofId,
      proofType: args.proofType,
      circuitId: args.circuitId,
      publicInputs: args.publicInputs,
      proof: args.proof,
      verificationKeyHash: args.verificationKeyHash,
      nullifier: args.nullifier,
      anchorTxSignature: args.anchorTxSignature,
      anchorMerkleRoot: args.anchorMerkleRoot,
      issuerDid: args.issuerDid,
      generatedAt: args.generatedAt,
      expiresAt: args.expiresAt,
      verified: true,
      lastVerifiedAt: Date.now(),
    });

    return { archiveId: id, proofId: args.proofId };
  },
});

// ============================================================================
// Queries
// ============================================================================

/**
 * Get archived proofs for compliance export/reporting.
 * Supports filtering by user, org, and proof type.
 */
export const getProofsForExport = query({
  args: {
    userId: v.optional(v.id("users")),
    organizationId: v.optional(v.id("turnkeyOrganizations")),
    proofType: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 100;

    if (args.userId) {
      const proofs = await ctx.db
        .query("complianceProofArchive")
        .withIndex("by_user", (q) => q.eq("userId", args.userId!))
        .order("desc")
        .collect();

      let filtered = proofs;
      if (args.proofType) {
        filtered = filtered.filter((p) => p.proofType === args.proofType);
      }

      return filtered.slice(0, limit);
    }

    if (args.organizationId) {
      const proofs = await ctx.db
        .query("complianceProofArchive")
        .withIndex("by_org", (q) => q.eq("organizationId", args.organizationId!))
        .order("desc")
        .collect();

      let filtered = proofs;
      if (args.proofType) {
        filtered = filtered.filter((p) => p.proofType === args.proofType);
      }

      return filtered.slice(0, limit);
    }

    if (args.proofType) {
      return await ctx.db
        .query("complianceProofArchive")
        .withIndex("by_proof_type", (q) => q.eq("proofType", args.proofType!))
        .order("desc")
        .take(limit);
    }

    // No filters — return most recent
    return await ctx.db
      .query("complianceProofArchive")
      .order("desc")
      .take(limit);
  },
});

/**
 * Get a specific proof by proofId.
 */
export const getByProofId = query({
  args: { proofId: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("complianceProofArchive")
      .withIndex("by_proof_id", (q) => q.eq("proofId", args.proofId))
      .first();
  },
});

/**
 * Re-verify an archived proof on demand.
 * Checks structural validity and expiration. Full cryptographic verification
 * would require the circuit verifier.
 */
export const reverifyProof = mutation({
  args: { proofId: v.string() },
  handler: async (ctx, args) => {
    const proof = await ctx.db
      .query("complianceProofArchive")
      .withIndex("by_proof_id", (q) => q.eq("proofId", args.proofId))
      .first();

    if (!proof) {
      throw new Error("Proof not found in archive");
    }

    const now = Date.now();
    const errors: string[] = [];

    // Structural checks
    if (!proof.proof?.data) errors.push("Missing proof data");
    if (!proof.nullifier) errors.push("Missing nullifier");
    if (proof.expiresAt < now) errors.push("Proof has expired");
    if (proof.generatedAt > now) errors.push("Proof generated in the future");

    const verified = errors.length === 0;

    // Update verification status
    await ctx.db.patch(proof._id, {
      verified,
      lastVerifiedAt: now,
    });

    return {
      proofId: args.proofId,
      verified,
      errors,
      verifiedAt: now,
    };
  },
});
