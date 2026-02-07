/**
 * DisCard 2035 - Payment Requests Mutations & Queries
 *
 * Convex functions for payment request link management.
 */

import { v } from "convex/values";
import { mutation, query, internalMutation } from "../_generated/server";
import { Keypair } from "@solana/web3.js";

// ============================================================================
// Constants
// ============================================================================

/** Default expiry time (24 hours) */
const DEFAULT_EXPIRY_MS = 24 * 60 * 60 * 1000;

/** Web link base URL */
const WEB_LINK_BASE = "https://www.discard.tech/pay";

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Generate a unique request ID
 */
function generateRequestId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 10);
  return `${timestamp}-${random}`;
}

// ============================================================================
// Mutations
// ============================================================================

/**
 * Create a new payment request
 */
export const create = mutation({
  args: {
    amount: v.number(),
    token: v.string(),
    tokenMint: v.string(),
    tokenDecimals: v.number(),
    amountUsd: v.number(),
    memo: v.optional(v.string()),
    recipientName: v.optional(v.string()),
    expiryMs: v.optional(v.number()),
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

    const user = await ctx.db
      .query("users")
      .withIndex("by_credential", (q) =>
        q.eq("credentialId", credentialId)
      )
      .first();

    if (!user) {
      throw new Error("User not found");
    }

    // Get user's wallet address - try Turnkey org first, then fall back to user's solanaAddress
    let walletAddress: string | undefined;

    const turnkeyOrg = await ctx.db
      .query("turnkeyOrganizations")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .first();

    if (turnkeyOrg?.walletAddress) {
      walletAddress = turnkeyOrg.walletAddress;
    } else if (user.solanaAddress) {
      walletAddress = user.solanaAddress;
    }

    if (!walletAddress) {
      throw new Error("No wallet found");
    }

    const requestId = generateRequestId();
    const expiryMs = args.expiryMs ?? DEFAULT_EXPIRY_MS;

    // Generate links
    const webLink = `${WEB_LINK_BASE}/${requestId}`;

    // Generate a stealth address for privacy (never expose the real wallet)
    const stealthKeypair = Keypair.generate();
    const stealthAddress = stealthKeypair.publicKey.toBase58();
    const stealthSeed = Buffer.from(stealthKeypair.secretKey.slice(0, 32)).toString("base64");

    // Generate Solana Pay URI using stealth address (NOT walletAddress)
    let solanaPayUri = `solana:${stealthAddress}`;
    const queryParams: string[] = [];

    if (args.amount > 0) {
      queryParams.push(`amount=${args.amount}`);
    }

    // Add SPL token if not native SOL
    const nativeMint = "So11111111111111111111111111111111111111112";
    if (args.tokenMint && args.tokenMint !== nativeMint) {
      queryParams.push(`spl-token=${args.tokenMint}`);
    }

    if (args.memo) {
      queryParams.push(`memo=${encodeURIComponent(args.memo)}`);
    }

    const label = args.recipientName || user.displayName;
    if (label) {
      queryParams.push(`label=${encodeURIComponent(label)}`);
    }

    if (queryParams.length > 0) {
      solanaPayUri += `?${queryParams.join("&")}`;
    }

    const now = Date.now();
    const expiresAt = now + expiryMs;

    // Create payment request record (stores stealth address, not real wallet)
    const paymentRequestId = await ctx.db.insert("paymentRequests", {
      userId: user._id,
      requestId,
      amount: args.amount,
      token: args.token,
      tokenMint: args.tokenMint,
      tokenDecimals: args.tokenDecimals,
      amountUsd: args.amountUsd,
      memo: args.memo,
      recipientAddress: stealthAddress, // Stealth, not real wallet
      recipientName: args.recipientName || user.displayName,
      linkType: "web_link",
      linkUrl: webLink,
      qrData: solanaPayUri,
      status: "pending",
      expiresAt,
      createdAt: now,
    });

    // Create a receive address record so the deposit monitor picks up payments
    const ACTIVE_WINDOW_MS = 30 * 60 * 1000;
    const GRACE_PERIOD_MS = 30 * 60 * 1000;
    const addrExpiresAt = now + Math.max(expiryMs, ACTIVE_WINDOW_MS);

    await ctx.db.insert("receiveAddresses", {
      userId: user._id,
      stealthAddress,
      stealthSeed,
      ephemeralPubKey: stealthAddress,
      tokenMint: args.tokenMint,
      status: "active",
      paymentRequestId,
      expiresAt: addrExpiresAt,
      graceExpiresAt: addrExpiresAt + GRACE_PERIOD_MS,
      createdAt: now,
    });

    return {
      id: paymentRequestId,
      requestId,
      webLink,
      solanaPayUri,
      qrData: solanaPayUri,
      expiresAt,
    };
  },
});

/**
 * Get a payment request by request ID (public)
 */
export const getByRequestId = query({
  args: {
    requestId: v.string(),
  },
  handler: async (ctx, args) => {
    const request = await ctx.db
      .query("paymentRequests")
      .withIndex("by_request_id", (q) => q.eq("requestId", args.requestId))
      .first();

    if (!request) {
      return null;
    }

    // Check if expired
    if (request.expiresAt && Date.now() > request.expiresAt) {
      return {
        ...request,
        status: "expired" as const,
      };
    }

    return request;
  },
});

/**
 * Get payment requests by user
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

    const requests = await ctx.db
      .query("paymentRequests")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .order("desc")
      .take(args.limit ?? 20);

    return requests;
  },
});

/**
 * Mark payment request as paid
 */
export const markPaid = mutation({
  args: {
    requestId: v.string(),
    paymentSignature: v.string(),
    payerAddress: v.string(),
    transferId: v.optional(v.id("transfers")),
  },
  handler: async (ctx, args) => {
    const request = await ctx.db
      .query("paymentRequests")
      .withIndex("by_request_id", (q) => q.eq("requestId", args.requestId))
      .first();

    if (!request) {
      throw new Error("Payment request not found");
    }

    if (request.status === "paid") {
      return; // Already paid
    }

    await ctx.db.patch(request._id, {
      status: "paid",
      paymentSignature: args.paymentSignature,
      payerAddress: args.payerAddress,
      transferId: args.transferId,
      paidAt: Date.now(),
      updatedAt: Date.now(),
    });
  },
});

/**
 * Cancel a payment request
 */
export const cancel = mutation({
  args: {
    requestId: v.string(),
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

    const request = await ctx.db
      .query("paymentRequests")
      .withIndex("by_request_id", (q) => q.eq("requestId", args.requestId))
      .first();

    if (!request) {
      throw new Error("Payment request not found");
    }

    // Only owner can cancel
    const user = await ctx.db
      .query("users")
      .withIndex("by_credential", (q) =>
        q.eq("credentialId", credentialId)
      )
      .first();

    if (!user || request.userId !== user._id) {
      throw new Error("Not authorized");
    }

    if (request.status === "paid") {
      throw new Error("Cannot cancel paid request");
    }

    await ctx.db.patch(request._id, {
      status: "expired",
      updatedAt: Date.now(),
    });
  },
});

/**
 * Delete a payment request
 */
export const remove = mutation({
  args: {
    requestId: v.string(),
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

    const request = await ctx.db
      .query("paymentRequests")
      .withIndex("by_request_id", (q) => q.eq("requestId", args.requestId))
      .first();

    if (!request) {
      throw new Error("Payment request not found");
    }

    // Only owner can delete
    const user = await ctx.db
      .query("users")
      .withIndex("by_credential", (q) =>
        q.eq("credentialId", credentialId)
      )
      .first();

    if (!user || request.userId !== user._id) {
      throw new Error("Not authorized");
    }

    await ctx.db.delete(request._id);
  },
});

/**
 * Internal: Expire old payment requests
 */
export const expireOld = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();

    const expiredRequests = await ctx.db
      .query("paymentRequests")
      .filter((q) =>
        q.and(
          q.eq(q.field("status"), "pending"),
          q.lt(q.field("expiresAt"), now)
        )
      )
      .take(100);

    for (const request of expiredRequests) {
      await ctx.db.patch(request._id, {
        status: "expired",
        updatedAt: now,
      });
    }

    return expiredRequests.length;
  },
});
