/**
 * DisCard 2035 - One-Time Payment Links (Privacy-Preserving)
 *
 * Convex functions for disposable payment request links.
 * Links expire after single claim with stealth address delivery.
 *
 * Privacy Features:
 * - Single-claim enforcement
 * - No persistent recipient identity on-chain
 * - 15-minute expiry for minimal exposure
 */

import { v } from "convex/values";
import { mutation, query, internalMutation } from "../_generated/server";

// ============================================================================
// Constants
// ============================================================================

/** One-time link expiry (15 minutes) */
const ONE_TIME_LINK_EXPIRY_MS = 15 * 60 * 1000;

/** Web link base URL */
const WEB_LINK_BASE = "https://www.discard.tech/claim";

// ============================================================================
// Mutations
// ============================================================================

/**
 * Create a one-time payment link
 */
export const create = mutation({
  args: {
    linkId: v.string(),
    amount: v.number(),
    token: v.string(),
    tokenMint: v.string(),
    tokenDecimals: v.number(),
    amountUsd: v.number(),
    encryptedSeed: v.string(),
    viewingKey: v.string(),
    encryptedMemo: v.optional(v.string()),
    expiresAt: v.number(),
    // Fallback for custom auth
    credentialId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // Try Convex auth first, fall back to credentialId
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

    // Store one-time link data in paymentRequests with special link type
    const requestId = await ctx.db.insert("paymentRequests", {
      userId: user._id,
      requestId: args.linkId,
      amount: args.amount,
      token: args.token,
      tokenMint: args.tokenMint,
      tokenDecimals: args.tokenDecimals,
      amountUsd: args.amountUsd,
      memo: args.encryptedMemo,
      // Store privacy keys in recipientAddress/Name fields for now
      // In production, would use a dedicated table
      recipientAddress: args.encryptedSeed,
      recipientName: args.viewingKey,
      linkType: "web_link",
      linkUrl: `${WEB_LINK_BASE}/${args.linkId}`,
      qrData: `${WEB_LINK_BASE}/${args.linkId}`,
      status: "pending",
      expiresAt: args.expiresAt,
      createdAt: Date.now(),
    });

    return {
      id: requestId,
      linkId: args.linkId,
      claimUrl: `${WEB_LINK_BASE}/${args.linkId}`,
      expiresAt: args.expiresAt,
    };
  },
});

/**
 * Claim a one-time payment link
 */
export const claim = mutation({
  args: {
    linkId: v.string(),
  },
  handler: async (ctx, args) => {
    const request = await ctx.db
      .query("paymentRequests")
      .withIndex("by_request_id", (q) => q.eq("requestId", args.linkId))
      .first();

    if (!request) {
      throw new Error("Link not found");
    }

    // Check if already claimed
    if (request.status === "paid") {
      throw new Error("Link has already been claimed");
    }

    // Check if expired
    if (request.expiresAt && Date.now() > request.expiresAt) {
      // Mark as expired
      await ctx.db.patch(request._id, {
        status: "expired",
      });
      throw new Error("Link has expired");
    }

    // Mark as claimed (status = paid for one-time links)
    await ctx.db.patch(request._id, {
      status: "paid",
      paidAt: Date.now(),
    });

    // Return link data for stealth address generation
    return {
      linkId: args.linkId,
      amount: request.amount,
      token: request.token,
      tokenMint: request.tokenMint,
      tokenDecimals: request.tokenDecimals,
      amountUsd: request.amountUsd,
      encryptedSeed: request.recipientAddress, // Contains encrypted seed
      viewingKey: request.recipientName, // Contains viewing key
      encryptedMemo: request.memo,
      expiresAt: request.expiresAt,
      status: "claimed" as const,
      createdAt: request.createdAt,
    };
  },
});

/**
 * Get one-time links created by user
 */
export const getByCreator = query({
  args: {
    limit: v.optional(v.number()),
    credentialId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    const credentialId = identity?.subject ?? args.credentialId;

    if (!credentialId) {
      return [];
    }

    const user = await ctx.db
      .query("users")
      .withIndex("by_credential", (q) => q.eq("credentialId", credentialId))
      .first();

    if (!user) {
      return [];
    }

    // Get payment requests that are one-time links (claim URL pattern)
    const requests = await ctx.db
      .query("paymentRequests")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .order("desc")
      .take(args.limit ?? 20);

    // Filter to only include claim links (one-time)
    return requests
      .filter((r) => r.linkUrl?.includes("/claim/"))
      .map((r) => ({
        linkId: r.requestId,
        amount: r.amount,
        token: r.token,
        tokenMint: r.tokenMint,
        tokenDecimals: r.tokenDecimals,
        amountUsd: r.amountUsd,
        encryptedSeed: r.recipientAddress,
        viewingKey: r.recipientName,
        encryptedMemo: r.memo,
        expiresAt: r.expiresAt,
        status: r.status === "paid" ? "claimed" : r.status === "expired" ? "expired" : "pending",
        createdAt: r.createdAt,
      }));
  },
});

/**
 * Get one-time link by ID (public - for claiming)
 */
export const getByLinkId = query({
  args: {
    linkId: v.string(),
  },
  handler: async (ctx, args) => {
    const request = await ctx.db
      .query("paymentRequests")
      .withIndex("by_request_id", (q) => q.eq("requestId", args.linkId))
      .first();

    if (!request) {
      return null;
    }

    // Check if expired
    if (request.expiresAt && Date.now() > request.expiresAt) {
      return {
        linkId: args.linkId,
        amount: request.amount,
        token: request.token,
        amountUsd: request.amountUsd,
        status: "expired" as const,
        expiresAt: request.expiresAt,
      };
    }

    // Return public info (not the encrypted data until claimed)
    return {
      linkId: args.linkId,
      amount: request.amount,
      token: request.token,
      tokenMint: request.tokenMint,
      tokenDecimals: request.tokenDecimals,
      amountUsd: request.amountUsd,
      status: request.status === "paid" ? "claimed" : "pending",
      expiresAt: request.expiresAt,
      createdAt: request.createdAt,
    };
  },
});

/**
 * Cancel a one-time link
 */
export const cancel = mutation({
  args: {
    linkId: v.string(),
    credentialId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    const credentialId = identity?.subject ?? args.credentialId;

    if (!credentialId) {
      throw new Error("Not authenticated");
    }

    const request = await ctx.db
      .query("paymentRequests")
      .withIndex("by_request_id", (q) => q.eq("requestId", args.linkId))
      .first();

    if (!request) {
      throw new Error("Link not found");
    }

    // Verify ownership
    const user = await ctx.db
      .query("users")
      .withIndex("by_credential", (q) => q.eq("credentialId", credentialId))
      .first();

    if (!user || request.userId !== user._id) {
      throw new Error("Not authorized");
    }

    if (request.status === "paid") {
      throw new Error("Cannot cancel claimed link");
    }

    await ctx.db.patch(request._id, {
      status: "expired",
    });
  },
});

/**
 * Internal: Expire old one-time links
 */
export const expireOld = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();

    // Find pending one-time links that have expired
    const expiredLinks = await ctx.db
      .query("paymentRequests")
      .filter((q) =>
        q.and(
          q.eq(q.field("status"), "pending"),
          q.lt(q.field("expiresAt"), now)
        )
      )
      .take(100);

    // Only expire claim links (one-time)
    const oneTimeLinks = expiredLinks.filter((r) => r.linkUrl?.includes("/claim/"));

    for (const link of oneTimeLinks) {
      await ctx.db.patch(link._id, {
        status: "expired",
      });
    }

    return oneTimeLinks.length;
  },
});
