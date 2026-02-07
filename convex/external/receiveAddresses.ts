/**
 * Receive Addresses — Stealth address CRUD + status machine
 *
 * Manages single-use stealth addresses for receiving external transfers.
 * Each address has a lifecycle: active → funded → shielded / quarantined / expired
 *
 * Active window: 30 minutes (after which no new deposits expected)
 * Grace period: 30 minutes after expiry (late deposits still accepted)
 */

import { v } from "convex/values";
import { mutation, query, internalMutation, internalQuery } from "../_generated/server";
import { Keypair } from "@solana/web3.js";

// ============================================================================
// Configuration
// ============================================================================

/** Active window for receive addresses (30 minutes) */
const ACTIVE_WINDOW_MS = 30 * 60 * 1000;

/** Grace period after expiry (30 minutes) — late deposits still processed */
const GRACE_PERIOD_MS = 30 * 60 * 1000;

// ============================================================================
// Mutations
// ============================================================================

/**
 * Generate a new stealth receive address for the authenticated user.
 * Returns the stealth address for QR code / sharing.
 */
export const generate = mutation({
  args: {
    tokenMint: v.optional(v.string()),
    paymentRequestId: v.optional(v.id("paymentRequests")),
    credentialId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    const credentialId = identity?.subject ?? args.credentialId;
    if (!credentialId) {
      throw new Error("Not authenticated");
    }

    const user = await ctx.db
      .query("users")
      .withIndex("by_credential", (q) => q.eq("credentialId", credentialId))
      .first();
    if (!user) {
      throw new Error("User not found");
    }

    // Generate a fresh stealth keypair (one-time use)
    const stealthKeypair = Keypair.generate();
    const stealthAddress = stealthKeypair.publicKey.toBase58();

    // Store the seed so server can reconstruct the keypair later for shielding
    const seed = stealthKeypair.secretKey.slice(0, 32);
    const stealthSeed = Buffer.from(seed).toString("base64");

    // Ephemeral pubkey (stored for metadata, not strictly needed for external receive)
    const ephemeralPubKey = stealthKeypair.publicKey.toBase58();

    const now = Date.now();
    const expiresAt = now + ACTIVE_WINDOW_MS;
    const graceExpiresAt = expiresAt + GRACE_PERIOD_MS;

    const addressId = await ctx.db.insert("receiveAddresses", {
      userId: user._id,
      stealthAddress,
      stealthSeed,
      ephemeralPubKey,
      tokenMint: args.tokenMint,
      status: "active",
      paymentRequestId: args.paymentRequestId,
      expiresAt,
      graceExpiresAt,
      createdAt: now,
    });

    return {
      id: addressId,
      stealthAddress,
      expiresAt,
    };
  },
});

// ============================================================================
// Internal Mutations (called by deposit monitor & shield pipeline)
// ============================================================================

/**
 * Record a detected deposit at a receive address.
 */
export const recordDeposit = internalMutation({
  args: {
    stealthAddress: v.string(),
    senderAddress: v.string(),
    depositTxSignature: v.string(),
    depositAmount: v.number(),
    depositTokenMint: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const receiveAddr = await ctx.db
      .query("receiveAddresses")
      .withIndex("by_stealth_address", (q) =>
        q.eq("stealthAddress", args.stealthAddress)
      )
      .first();

    if (!receiveAddr) {
      throw new Error("Receive address not found");
    }

    if (receiveAddr.status !== "active") {
      throw new Error(`Receive address not active (status: ${receiveAddr.status})`);
    }

    await ctx.db.patch(receiveAddr._id, {
      status: "funded",
      senderAddress: args.senderAddress,
      depositTxSignature: args.depositTxSignature,
      depositAmount: args.depositAmount,
      depositTokenMint: args.depositTokenMint,
      fundedAt: Date.now(),
    });
  },
});

/**
 * Mark receive address as shielding (shield tx in progress).
 */
export const markShielding = internalMutation({
  args: {
    addressId: v.id("receiveAddresses"),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.addressId, {
      status: "shielding",
    });
  },
});

/**
 * Mark receive address as successfully shielded.
 */
export const markShielded = internalMutation({
  args: {
    addressId: v.id("receiveAddresses"),
    shieldTxSignature: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.addressId, {
      status: "shielded",
      shieldTxSignature: args.shieldTxSignature,
      shieldedAt: Date.now(),
    });
  },
});

/**
 * Quarantine a receive address (sender failed compliance).
 */
export const quarantine = internalMutation({
  args: {
    addressId: v.id("receiveAddresses"),
    reason: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.addressId, {
      status: "quarantined",
      quarantineReason: args.reason,
      compliancePassed: false,
      complianceReason: args.reason,
      complianceCheckedAt: Date.now(),
    });
  },
});

/**
 * Record compliance check result (without changing status).
 */
export const recordComplianceResult = internalMutation({
  args: {
    addressId: v.id("receiveAddresses"),
    passed: v.boolean(),
    reason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.addressId, {
      compliancePassed: args.passed,
      complianceReason: args.reason,
      complianceCheckedAt: Date.now(),
    });
  },
});

/**
 * Expire old receive addresses (called by cron).
 */
export const expireOld = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();

    // Find active addresses past their grace period
    const expired = await ctx.db
      .query("receiveAddresses")
      .withIndex("by_status", (q) => q.eq("status", "active"))
      .collect();

    let count = 0;
    for (const addr of expired) {
      if (addr.graceExpiresAt < now) {
        await ctx.db.patch(addr._id, { status: "expired" });
        count++;
      }
    }

    if (count > 0) {
      console.log(`[ReceiveAddresses] Expired ${count} unused receive addresses`);
    }
  },
});

// ============================================================================
// Internal Queries
// ============================================================================

/**
 * Get all active receive addresses (for deposit monitoring).
 */
export const getActiveAddresses = internalQuery({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();

    const addresses = await ctx.db
      .query("receiveAddresses")
      .withIndex("by_status", (q) => q.eq("status", "active"))
      .collect();

    // Include addresses in active window OR grace period
    return addresses.filter((addr) => addr.graceExpiresAt > now);
  },
});

/**
 * Get a receive address by its stealth address (internal).
 */
export const getByStealthAddress = internalQuery({
  args: { stealthAddress: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("receiveAddresses")
      .withIndex("by_stealth_address", (q) =>
        q.eq("stealthAddress", args.stealthAddress)
      )
      .first();
  },
});

// ============================================================================
// Public Queries
// ============================================================================

/**
 * Get the user's current active receive address (if any).
 * Reactive — auto-updates when deposit arrives or status changes.
 */
export const getActiveForUser = query({
  args: {
    credentialId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    const credentialId = identity?.subject ?? args.credentialId;
    if (!credentialId) return null;

    const user = await ctx.db
      .query("users")
      .withIndex("by_credential", (q) => q.eq("credentialId", credentialId))
      .first();
    if (!user) return null;

    // Get most recent active address
    const addresses = await ctx.db
      .query("receiveAddresses")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .order("desc")
      .take(5);

    const now = Date.now();
    const active = addresses.find(
      (a) => a.status === "active" && a.graceExpiresAt > now
    );

    if (!active) return null;

    // Never expose seed to client
    return {
      id: active._id,
      stealthAddress: active.stealthAddress,
      status: active.status,
      expiresAt: active.expiresAt,
      graceExpiresAt: active.graceExpiresAt,
      createdAt: active.createdAt,
    };
  },
});

/**
 * Get recent receive address history for the user.
 */
export const getHistory = query({
  args: {
    limit: v.optional(v.number()),
    credentialId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    const credentialId = identity?.subject ?? args.credentialId;
    if (!credentialId) return [];

    const user = await ctx.db
      .query("users")
      .withIndex("by_credential", (q) => q.eq("credentialId", credentialId))
      .first();
    if (!user) return [];

    const addresses = await ctx.db
      .query("receiveAddresses")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .order("desc")
      .take(args.limit ?? 20);

    // Never expose seeds
    return addresses.map((a) => ({
      id: a._id,
      stealthAddress: a.stealthAddress,
      status: a.status,
      depositAmount: a.depositAmount,
      depositTokenMint: a.depositTokenMint,
      compliancePassed: a.compliancePassed,
      expiresAt: a.expiresAt,
      createdAt: a.createdAt,
      fundedAt: a.fundedAt,
      shieldedAt: a.shieldedAt,
    }));
  },
});
