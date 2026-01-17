/**
 * DisCard 2035 - Attestation Management
 *
 * Convex functions for managing identity attestations,
 * including Civic Gateway tokens and custom SAS attestations.
 */

import { v } from "convex/values";
import {
  mutation,
  query,
  internalMutation,
  internalQuery,
  action,
} from "../_generated/server";
import { Id } from "../_generated/dataModel";

// ============================================================================
// Validators
// ============================================================================

const attestationTypeValidator = v.union(
  v.literal("age_over_18"),
  v.literal("age_over_21"),
  v.literal("uk_resident"),
  v.literal("eu_resident"),
  v.literal("us_resident"),
  v.literal("kyc_basic"),
  v.literal("kyc_enhanced"),
  v.literal("kyc_full"),
  v.literal("aml_cleared"),
  v.literal("sanctions_cleared"),
  v.literal("accredited_investor"),
  v.literal("professional_investor"),
  v.literal("pep_check"),
  v.literal("identity_verified"),
  v.literal("address_verified"),
  v.literal("phone_verified"),
  v.literal("email_verified"),
  v.literal("biometric_verified")
);

const issuerValidator = v.union(
  v.literal("civic"),
  v.literal("solid"),
  v.literal("persona"),
  v.literal("jumio"),
  v.literal("onfido"),
  v.literal("sumsub"),
  v.literal("veriff"),
  v.literal("discard_internal")
);

const statusValidator = v.union(
  v.literal("active"),
  v.literal("expired"),
  v.literal("revoked"),
  v.literal("pending")
);

// ============================================================================
// Queries
// ============================================================================

/**
 * Get all attestations for a user
 */
export const getByUser = query({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("attestations")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .collect();
  },
});

/**
 * Get active attestations for a user
 */
export const getActiveByUser = query({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const all = await ctx.db
      .query("attestations")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .collect();

    const now = Date.now();
    return all.filter(
      (a) => a.status === "active" && (!a.expiresAt || a.expiresAt > now)
    );
  },
});

/**
 * Get attestation by type for a user
 */
export const getByType = query({
  args: {
    userId: v.id("users"),
    attestationType: attestationTypeValidator,
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("attestations")
      .withIndex("by_user_type", (q) =>
        q.eq("userId", args.userId).eq("attestationType", args.attestationType)
      )
      .first();
  },
});

/**
 * Get attestation by on-chain address
 */
export const getByChainAddress = query({
  args: { sasAttestationAddress: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("attestations")
      .withIndex("by_chain_address", (q) =>
        q.eq("sasAttestationAddress", args.sasAttestationAddress)
      )
      .first();
  },
});

/**
 * Get trust score for a user
 */
export const getTrustScore = query({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const attestations = await ctx.db
      .query("attestations")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .collect();

    const now = Date.now();
    const active = attestations.filter(
      (a) => a.status === "active" && (!a.expiresAt || a.expiresAt > now)
    );

    // Weight table for attestation types
    const weights: Record<string, number> = {
      age_over_18: 10,
      age_over_21: 10,
      uk_resident: 15,
      eu_resident: 15,
      us_resident: 15,
      kyc_basic: 25,
      kyc_enhanced: 50,
      kyc_full: 100,
      aml_cleared: 30,
      sanctions_cleared: 40,
      accredited_investor: 60,
      professional_investor: 70,
      pep_check: 35,
      identity_verified: 40,
      address_verified: 20,
      phone_verified: 10,
      email_verified: 5,
      biometric_verified: 45,
    };

    // Issuer trust multipliers
    const issuerMultipliers: Record<string, number> = {
      civic: 0.9,
      solid: 0.85,
      persona: 0.88,
      jumio: 0.87,
      onfido: 0.86,
      sumsub: 0.84,
      veriff: 0.85,
      discard_internal: 0.7,
    };

    let score = 0;
    const breakdown: Record<string, number> = {};

    for (const attestation of active) {
      const weight = weights[attestation.attestationType] ?? 0;
      const multiplier = issuerMultipliers[attestation.issuer] ?? 0.5;
      const points = Math.round(weight * multiplier);
      breakdown[attestation.attestationType] = points;
      score += points;
    }

    const maxScore = Object.values(weights).reduce((a, b) => a + b, 0);
    const percentage = (score / maxScore) * 100;

    let level: "none" | "basic" | "standard" | "enhanced" | "full";
    if (percentage >= 80) level = "full";
    else if (percentage >= 60) level = "enhanced";
    else if (percentage >= 40) level = "standard";
    else if (percentage >= 20) level = "basic";
    else level = "none";

    return {
      score,
      maxScore,
      percentage: Math.round(percentage * 100) / 100,
      level,
      breakdown,
      attestationCount: active.length,
    };
  },
});

/**
 * Check if user has required attestations for an action
 */
export const hasRequiredForAction = query({
  args: {
    userId: v.id("users"),
    action: v.union(
      v.literal("card_creation"),
      v.literal("high_value_tx"),
      v.literal("international_tx"),
      v.literal("wire_transfer")
    ),
  },
  handler: async (ctx, args) => {
    const requirements: Record<string, string[]> = {
      card_creation: ["identity_verified", "email_verified"],
      high_value_tx: ["kyc_basic", "identity_verified", "aml_cleared"],
      international_tx: ["kyc_enhanced", "sanctions_cleared"],
      wire_transfer: [
        "kyc_full",
        "aml_cleared",
        "sanctions_cleared",
        "address_verified",
      ],
    };

    const required = requirements[args.action] ?? [];

    const attestations = await ctx.db
      .query("attestations")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .collect();

    const now = Date.now();
    const activeTypes = new Set<string>(
      attestations
        .filter((a) => a.status === "active" && (!a.expiresAt || a.expiresAt > now))
        .map((a) => a.attestationType)
    );

    const missing = required.filter((type) => !activeTypes.has(type));

    return {
      allowed: missing.length === 0,
      missing,
      hasAll: missing.length === 0,
    };
  },
});

// ============================================================================
// Mutations
// ============================================================================

/**
 * Create a new attestation record
 */
export const create = mutation({
  args: {
    userId: v.id("users"),
    attestationType: attestationTypeValidator,
    issuer: issuerValidator,
    sasAttestationAddress: v.optional(v.string()),
    zkProof: v.optional(v.bytes()),
    expiresAt: v.optional(v.number()),
    metadata: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    // Check for existing attestation of same type
    const existing = await ctx.db
      .query("attestations")
      .withIndex("by_user_type", (q) =>
        q.eq("userId", args.userId).eq("attestationType", args.attestationType)
      )
      .first();

    if (existing) {
      // Update existing instead of creating new
      await ctx.db.patch(existing._id, {
        issuer: args.issuer,
        sasAttestationAddress: args.sasAttestationAddress,
        zkProof: args.zkProof,
        status: "active",
        expiresAt: args.expiresAt,
        metadata: args.metadata,
        verifiedAt: now,
        updatedAt: now,
      });
      return existing._id;
    }

    // Create new attestation
    return await ctx.db.insert("attestations", {
      userId: args.userId,
      attestationType: args.attestationType,
      issuer: args.issuer,
      sasAttestationAddress: args.sasAttestationAddress,
      zkProof: args.zkProof,
      status: "active",
      expiresAt: args.expiresAt,
      metadata: args.metadata,
      verifiedAt: now,
      issuedAt: now,
      updatedAt: now,
    });
  },
});

/**
 * Update attestation status
 */
export const updateStatus = mutation({
  args: {
    id: v.id("attestations"),
    status: statusValidator,
    reason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, {
      status: args.status,
      statusReason: args.reason,
      updatedAt: Date.now(),
    });
  },
});

/**
 * Revoke an attestation
 */
export const revoke = mutation({
  args: {
    id: v.id("attestations"),
    reason: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, {
      status: "revoked",
      statusReason: args.reason,
      revokedAt: Date.now(),
      updatedAt: Date.now(),
    });
  },
});

/**
 * Link on-chain attestation address
 */
export const linkChainAddress = mutation({
  args: {
    id: v.id("attestations"),
    sasAttestationAddress: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, {
      sasAttestationAddress: args.sasAttestationAddress,
      updatedAt: Date.now(),
    });
  },
});

/**
 * Update ZK proof for attestation
 */
export const updateZKProof = mutation({
  args: {
    id: v.id("attestations"),
    zkProof: v.bytes(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, {
      zkProof: args.zkProof,
      updatedAt: Date.now(),
    });
  },
});

/**
 * Refresh verification timestamp
 */
export const refreshVerification = mutation({
  args: { id: v.id("attestations") },
  handler: async (ctx, args) => {
    const attestation = await ctx.db.get(args.id);
    if (!attestation) {
      throw new Error("Attestation not found");
    }

    // Check if expired
    if (attestation.expiresAt && attestation.expiresAt < Date.now()) {
      await ctx.db.patch(args.id, {
        status: "expired",
        updatedAt: Date.now(),
      });
      return { refreshed: false, reason: "Attestation expired" };
    }

    await ctx.db.patch(args.id, {
      verifiedAt: Date.now(),
      updatedAt: Date.now(),
    });

    return { refreshed: true };
  },
});

// ============================================================================
// Civic-Specific Functions
// ============================================================================

/**
 * Sync Civic gateway token to attestation
 */
export const syncCivicToken = mutation({
  args: {
    userId: v.id("users"),
    gatekeeperNetwork: v.string(),
    gatewayTokenAddress: v.string(),
    state: v.union(
      v.literal("active"),
      v.literal("expired"),
      v.literal("revoked"),
      v.literal("frozen")
    ),
    issuedAt: v.number(),
    expiresAt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    // Map Civic network to attestation type
    const networkToType: Record<string, string> = {
      ignREusXmGrscGNUesoU9mxfds9AiYTezUKex2PsZV6: "identity_verified",
      ni1jXzPTq1yTqo67tUmVgnp22b1qGAAZCtPmHtskqYG: "identity_verified",
      bni1ewus6aMxTxBi5SAfzEmmXLf8KcVFRmTfproJuKw: "kyc_basic",
      gatbGF9DvLAw3kWyn1EmH5Nh1Sqp8sTukF7yaQpSc71: "biometric_verified",
    };

    const attestationType = networkToType[args.gatekeeperNetwork] ?? "identity_verified";

    // Map Civic state to attestation status
    const stateToStatus: Record<string, string> = {
      active: "active",
      expired: "expired",
      revoked: "revoked",
      frozen: "pending",
    };

    const status = stateToStatus[args.state] ?? "pending";

    // Find or create attestation
    const existing = await ctx.db
      .query("attestations")
      .withIndex("by_chain_address", (q) =>
        q.eq("sasAttestationAddress", args.gatewayTokenAddress)
      )
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, {
        status: status as "active" | "expired" | "revoked" | "pending",
        expiresAt: args.expiresAt,
        verifiedAt: now,
        updatedAt: now,
        metadata: {
          ...((existing.metadata as Record<string, unknown>) ?? {}),
          gatekeeperNetwork: args.gatekeeperNetwork,
          lastSyncAt: now,
        },
      });
      return existing._id;
    }

    // Create new
    return await ctx.db.insert("attestations", {
      userId: args.userId,
      attestationType: attestationType as
        | "identity_verified"
        | "kyc_basic"
        | "biometric_verified",
      issuer: "civic",
      sasAttestationAddress: args.gatewayTokenAddress,
      status: status as "active" | "expired" | "revoked" | "pending",
      expiresAt: args.expiresAt,
      verifiedAt: now,
      issuedAt: args.issuedAt,
      updatedAt: now,
      metadata: {
        gatekeeperNetwork: args.gatekeeperNetwork,
      },
    });
  },
});

// ============================================================================
// Internal Functions
// ============================================================================

/**
 * Check and mark expired attestations
 */
export const checkExpiredAttestations = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();

    // Get all active attestations
    const active = await ctx.db
      .query("attestations")
      .filter((q) => q.eq(q.field("status"), "active"))
      .collect();

    let expiredCount = 0;
    for (const attestation of active) {
      if (attestation.expiresAt && attestation.expiresAt < now) {
        await ctx.db.patch(attestation._id, {
          status: "expired",
          updatedAt: now,
        });
        expiredCount++;
      }
    }

    return { checked: active.length, expired: expiredCount };
  },
});

/**
 * Get attestation statistics
 */
export const getStats = internalQuery({
  args: {},
  handler: async (ctx) => {
    const all = await ctx.db.query("attestations").collect();

    const byStatus = all.reduce(
      (acc, a) => {
        acc[a.status] = (acc[a.status] || 0) + 1;
        return acc;
      },
      {} as Record<string, number>
    );

    const byIssuer = all.reduce(
      (acc, a) => {
        acc[a.issuer] = (acc[a.issuer] || 0) + 1;
        return acc;
      },
      {} as Record<string, number>
    );

    const byType = all.reduce(
      (acc, a) => {
        acc[a.attestationType] = (acc[a.attestationType] || 0) + 1;
        return acc;
      },
      {} as Record<string, number>
    );

    return {
      total: all.length,
      byStatus,
      byIssuer,
      byType,
    };
  },
});
