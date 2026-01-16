/**
 * MagicBlock Ephemeral Rollups - Convex Actions
 *
 * Server-side orchestration for MagicBlock Private Ephemeral Rollups (PER):
 * - Session lifecycle management
 * - Card state delegation/undelegation
 * - Authorization routing
 * - Batch commitment tracking
 */

import { v } from "convex/values";
import { mutation, query, action, internalMutation, internalQuery } from "../_generated/server";
import { internal } from "../_generated/api";
import type { Id, Doc } from "../_generated/dataModel";

// ============ CONFIGURATION ============

const MAGICBLOCK_API_URL = process.env.MAGICBLOCK_API_URL || "https://tee.magicblock.app";
const MAGICBLOCK_API_KEY = process.env.MAGICBLOCK_API_KEY;
const DEFAULT_SESSION_DURATION = 3600000; // 1 hour
const DEFAULT_COMMIT_INTERVAL = 5000; // 5 seconds

// ============ SESSION MANAGEMENT ============

/**
 * Create a new MagicBlock session for card authorization
 */
export const createSession = mutation({
  args: {
    cardId: v.id("cards"),
    delegatedAccounts: v.optional(v.array(v.string())),
    maxDuration: v.optional(v.number()),
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

    // Verify card ownership
    const card = await ctx.db.get(args.cardId);
    if (!card || card.userId !== user._id) {
      throw new Error("Card not found or access denied");
    }

    // Check for existing active session
    const existingSession = await ctx.db
      .query("magicblockSessions")
      .withIndex("by_card", (q) => q.eq("cardId", args.cardId))
      .filter((q) => q.eq(q.field("status"), "active"))
      .first();

    if (existingSession) {
      throw new Error("Card already has an active session");
    }

    // Generate session ID (will be replaced by actual MagicBlock ID)
    const sessionId = `mb_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const now = Date.now();
    const duration = args.maxDuration || DEFAULT_SESSION_DURATION;

    // Create session record
    const session = await ctx.db.insert("magicblockSessions", {
      cardId: args.cardId,
      userId: user._id,
      sessionId,
      clusterEndpoint: MAGICBLOCK_API_URL,
      delegatedAccounts: args.delegatedAccounts || [],
      status: "creating",
      transactionCount: 0,
      expiresAt: now + duration,
      createdAt: now,
    });

    return {
      sessionId: session,
      magicblockSessionId: sessionId,
      status: "creating",
      expiresAt: now + duration,
    };
  },
});

/**
 * Activate a session after delegation is complete
 */
export const activateSession = mutation({
  args: {
    sessionId: v.id("magicblockSessions"),
    magicblockSessionId: v.string(),
    clusterEndpoint: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const session = await ctx.db.get(args.sessionId);
    if (!session) {
      throw new Error("Session not found");
    }

    if (session.status !== "creating") {
      throw new Error("Session cannot be activated");
    }

    await ctx.db.patch(args.sessionId, {
      sessionId: args.magicblockSessionId,
      clusterEndpoint: args.clusterEndpoint || session.clusterEndpoint,
      status: "active",
    });

    return { success: true };
  },
});

/**
 * Update session transaction count
 */
export const incrementTransactionCount = internalMutation({
  args: {
    sessionId: v.id("magicblockSessions"),
  },
  handler: async (ctx, args) => {
    const session = await ctx.db.get(args.sessionId);
    if (!session) return;

    await ctx.db.patch(args.sessionId, {
      transactionCount: session.transactionCount + 1,
    });
  },
});

/**
 * Mark session as committing
 */
export const startCommit = mutation({
  args: {
    sessionId: v.id("magicblockSessions"),
  },
  handler: async (ctx, args) => {
    const session = await ctx.db.get(args.sessionId);
    if (!session || session.status !== "active") {
      throw new Error("Session not active");
    }

    await ctx.db.patch(args.sessionId, {
      status: "committing",
    });

    return { success: true };
  },
});

/**
 * Complete session after undelegation
 */
export const completeSession = mutation({
  args: {
    sessionId: v.id("magicblockSessions"),
    finalBatchId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const session = await ctx.db.get(args.sessionId);
    if (!session) {
      throw new Error("Session not found");
    }

    await ctx.db.patch(args.sessionId, {
      status: "committed",
      lastCommitAt: Date.now(),
    });

    return { success: true };
  },
});

/**
 * Expire a session
 */
export const expireSession = internalMutation({
  args: {
    sessionId: v.id("magicblockSessions"),
  },
  handler: async (ctx, args) => {
    const session = await ctx.db.get(args.sessionId);
    if (!session) return;

    if (session.status === "active" || session.status === "creating") {
      await ctx.db.patch(args.sessionId, {
        status: "expired",
      });
    }
  },
});

/**
 * Fail a session
 */
export const failSession = mutation({
  args: {
    sessionId: v.id("magicblockSessions"),
    error: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const session = await ctx.db.get(args.sessionId);
    if (!session) {
      throw new Error("Session not found");
    }

    await ctx.db.patch(args.sessionId, {
      status: "failed",
    });

    return { success: true };
  },
});

// ============ SESSION QUERIES ============

/**
 * Get active session for a card
 */
export const getActiveSession = query({
  args: {
    cardId: v.id("cards"),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("magicblockSessions")
      .withIndex("by_card", (q) => q.eq("cardId", args.cardId))
      .filter((q) => q.eq(q.field("status"), "active"))
      .first();
  },
});

/**
 * Get session by ID
 */
export const getSession = query({
  args: {
    sessionId: v.id("magicblockSessions"),
  },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.sessionId);
  },
});

/**
 * Get all sessions for a user
 */
export const getUserSessions = query({
  args: {
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

    return await ctx.db
      .query("magicblockSessions")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .order("desc")
      .take(args.limit || 50);
  },
});

// ============ BATCH MANAGEMENT ============

/**
 * Record a batch commitment
 */
export const recordBatchCommitment = mutation({
  args: {
    sessionId: v.string(),
    merkleRoot: v.string(),
    decisionCount: v.number(),
    startTimestamp: v.number(),
    endTimestamp: v.number(),
    txSignature: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const batch = await ctx.db.insert("authorizationBatches", {
      sessionId: args.sessionId,
      merkleRoot: args.merkleRoot,
      decisionCount: args.decisionCount,
      startTimestamp: args.startTimestamp,
      endTimestamp: args.endTimestamp,
      committedAt: Date.now(),
      txSignature: args.txSignature,
      status: args.txSignature ? "submitted" : "pending",
    });

    return { batchId: batch };
  },
});

/**
 * Update batch status
 */
export const updateBatchStatus = mutation({
  args: {
    batchId: v.id("authorizationBatches"),
    status: v.union(
      v.literal("pending"),
      v.literal("submitted"),
      v.literal("confirmed"),
      v.literal("failed")
    ),
    txSignature: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.batchId, {
      status: args.status,
      ...(args.txSignature && { txSignature: args.txSignature }),
    });

    return { success: true };
  },
});

/**
 * Get batches for a session
 */
export const getSessionBatches = query({
  args: {
    sessionId: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("authorizationBatches")
      .withIndex("by_session", (q) => q.eq("sessionId", args.sessionId))
      .order("desc")
      .collect();
  },
});

// ============ AUTHORIZATION ACTION ============

/**
 * Process card authorization through MagicBlock PER
 * This is an action because it calls external MagicBlock API
 */
export const processAuthorization = action({
  args: {
    cardId: v.id("cards"),
    transactionId: v.string(),
    amount: v.number(),
    merchantMcc: v.string(),
    merchantName: v.string(),
    merchantCountry: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<{
    decision: "approved" | "declined" | "pending";
    declineReason?: string;
    authorizationCode?: string;
    processingTimeMs: number;
  }> => {
    const startTime = Date.now();

    // Get active session for card
    const session = await ctx.runQuery(internal.tee.magicblock.getActiveSessionInternal, {
      cardId: args.cardId,
    });

    if (!session) {
      // No active session - create one or use fallback
      console.log(`[MagicBlock] No active session for card ${args.cardId}, using fallback`);
      return {
        decision: "pending",
        processingTimeMs: Date.now() - startTime,
      };
    }

    try {
      // Call MagicBlock PER for authorization
      const response = await fetch(`${session.clusterEndpoint}/sessions/${session.sessionId}/authorize`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(MAGICBLOCK_API_KEY && { Authorization: `Bearer ${MAGICBLOCK_API_KEY}` }),
        },
        body: JSON.stringify({
          transaction_id: args.transactionId,
          card_id: args.cardId,
          amount: args.amount,
          merchant_mcc: args.merchantMcc,
          merchant_name: args.merchantName,
          merchant_country: args.merchantCountry,
          timestamp: Date.now(),
        }),
      });

      if (!response.ok) {
        throw new Error(`MagicBlock API error: ${response.status}`);
      }

      const result = await response.json() as {
        decision: "approved" | "declined" | "pending";
        decline_reason?: string;
        authorization_code?: string;
      };

      // Increment transaction count
      await ctx.runMutation(internal.tee.magicblock.incrementTransactionCountInternal, {
        sessionId: session._id,
      });

      return {
        decision: result.decision,
        declineReason: result.decline_reason,
        authorizationCode: result.authorization_code,
        processingTimeMs: Date.now() - startTime,
      };
    } catch (error) {
      console.error("[MagicBlock] Authorization error:", error);
      return {
        decision: "declined",
        declineReason: "policy_violation",
        processingTimeMs: Date.now() - startTime,
      };
    }
  },
});

// ============ INTERNAL QUERIES/MUTATIONS ============

export const getActiveSessionInternal = internalQuery({
  args: {
    cardId: v.id("cards"),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("magicblockSessions")
      .withIndex("by_card", (q) => q.eq("cardId", args.cardId))
      .filter((q) => q.eq(q.field("status"), "active"))
      .first();
  },
});

export const incrementTransactionCountInternal = internalMutation({
  args: {
    sessionId: v.id("magicblockSessions"),
  },
  handler: async (ctx, args) => {
    const session = await ctx.db.get(args.sessionId);
    if (!session) return;

    await ctx.db.patch(args.sessionId, {
      transactionCount: session.transactionCount + 1,
    });
  },
});

// ============ WEBHOOK HANDLER ============

/**
 * Handle webhooks from MagicBlock
 */
export const handleWebhook = action({
  args: {
    type: v.string(),
    sessionId: v.string(),
    data: v.any(),
    signature: v.string(),
  },
  handler: async (ctx, args) => {
    // TODO: Verify webhook signature with MAGICBLOCK_WEBHOOK_SECRET

    console.log(`[MagicBlock] Webhook received: ${args.type}`);

    switch (args.type) {
      case "session.active":
        // Session is now active
        break;

      case "session.committed":
        // Session state committed to L1
        break;

      case "session.expired":
        // Session expired
        break;

      case "batch.committed":
        // Batch committed to L1
        if (args.data.batch_id && args.data.tx_signature) {
          // Update batch status
        }
        break;

      default:
        console.log(`[MagicBlock] Unknown webhook type: ${args.type}`);
    }

    return { received: true };
  },
});

// ============ CLEANUP CRON ============

/**
 * Expire old sessions (called by cron)
 */
export const expireOldSessions = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();

    // Find expired sessions
    const expiredSessions = await ctx.db
      .query("magicblockSessions")
      .withIndex("by_status", (q) => q.eq("status", "active"))
      .filter((q) => q.lt(q.field("expiresAt"), now))
      .collect();

    for (const session of expiredSessions) {
      await ctx.db.patch(session._id, {
        status: "expired",
      });
      console.log(`[MagicBlock] Expired session: ${session.sessionId}`);
    }

    return { expired: expiredSessions.length };
  },
});
