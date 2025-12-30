/**
 * DisCard 2035 - Optimistic Settlement
 *
 * Handles optimistic UI updates and blockchain confirmations
 * for Firedancer/Alpenglow-ready architecture.
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

const entityTypeValidator = v.union(
  v.literal("card_balance"),
  v.literal("wallet_balance"),
  v.literal("card_status"),
  v.literal("policy_update")
);

const settlementStatusValidator = v.union(
  v.literal("pending"),
  v.literal("submitted"),
  v.literal("confirmed"),
  v.literal("finalized"),
  v.literal("rolled_back"),
  v.literal("failed")
);

// ============================================================================
// Queries
// ============================================================================

/**
 * Get pending settlements for a user
 */
export const getPending = query({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("optimisticSettlements")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .filter((q) =>
        q.or(
          q.eq(q.field("status"), "pending"),
          q.eq(q.field("status"), "submitted")
        )
      )
      .collect();
  },
});

/**
 * Get settlement by transaction signature
 */
export const getBySignature = query({
  args: { signature: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("optimisticSettlements")
      .withIndex("by_signature", (q) => q.eq("solanaSignature", args.signature))
      .first();
  },
});

/**
 * Get settlements for an entity (card, wallet, etc.)
 */
export const getByEntity = query({
  args: {
    entityType: entityTypeValidator,
    entityId: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("optimisticSettlements")
      .withIndex("by_entity", (q) =>
        q.eq("entityType", args.entityType).eq("entityId", args.entityId)
      )
      .collect();
  },
});

/**
 * Get recent settlements for a user
 */
export const getRecent = query({
  args: {
    userId: v.id("users"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 20;
    return await ctx.db
      .query("optimisticSettlements")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .order("desc")
      .take(limit);
  },
});

/**
 * Get settlement statistics for a user
 */
export const getStats = query({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const settlements = await ctx.db
      .query("optimisticSettlements")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .collect();

    const byStatus = settlements.reduce(
      (acc, s) => {
        acc[s.status] = (acc[s.status] || 0) + 1;
        return acc;
      },
      {} as Record<string, number>
    );

    const confirmedSettlements = settlements.filter(
      (s) => s.status === "confirmed" || s.status === "finalized"
    );

    const avgConfirmationTime =
      confirmedSettlements.length > 0
        ? confirmedSettlements.reduce(
            (sum, s) => sum + (s.confirmationTimeMs ?? 0),
            0
          ) / confirmedSettlements.length
        : 0;

    return {
      total: settlements.length,
      byStatus,
      avgConfirmationTimeMs: avgConfirmationTime,
      pendingCount: byStatus.pending ?? 0,
      submittedCount: byStatus.submitted ?? 0,
      confirmedCount: byStatus.confirmed ?? 0,
      finalizedCount: byStatus.finalized ?? 0,
      rolledBackCount: byStatus.rolled_back ?? 0,
      failedCount: byStatus.failed ?? 0,
    };
  },
});

// ============================================================================
// Mutations
// ============================================================================

/**
 * Create an optimistic settlement (before blockchain submission)
 */
export const createOptimistic = mutation({
  args: {
    userId: v.id("users"),
    intentId: v.optional(v.id("intents")),
    entityType: entityTypeValidator,
    entityId: v.string(),
    previousState: v.any(),
    optimisticState: v.any(),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const optimisticTxId = `opt_${now}_${Math.random().toString(36).slice(2, 11)}`;

    const id = await ctx.db.insert("optimisticSettlements", {
      userId: args.userId,
      intentId: args.intentId,
      optimisticTxId,
      entityType: args.entityType,
      entityId: args.entityId,
      previousState: args.previousState,
      optimisticState: args.optimisticState,
      status: "pending",
      retryCount: 0,
      createdAt: now,
    });

    return { id, optimisticTxId };
  },
});

/**
 * Mark settlement as submitted to blockchain
 */
export const markSubmitted = mutation({
  args: {
    id: v.id("optimisticSettlements"),
    solanaSignature: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, {
      status: "submitted",
      solanaSignature: args.solanaSignature,
      submittedAt: Date.now(),
    });
  },
});

/**
 * Mark settlement as confirmed
 */
export const markConfirmed = mutation({
  args: {
    id: v.id("optimisticSettlements"),
    confirmationSlot: v.number(),
    finalState: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    const settlement = await ctx.db.get(args.id);
    if (!settlement) {
      throw new Error("Settlement not found");
    }

    const now = Date.now();
    const confirmationTimeMs = settlement.submittedAt
      ? now - settlement.submittedAt
      : now - settlement.createdAt;

    await ctx.db.patch(args.id, {
      status: "confirmed",
      confirmationSlot: args.confirmationSlot,
      confirmationTimeMs,
      finalState: args.finalState ?? settlement.optimisticState,
      confirmedAt: now,
    });
  },
});

/**
 * Mark settlement as finalized (Alpenglow)
 */
export const markFinalized = mutation({
  args: {
    id: v.id("optimisticSettlements"),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, {
      status: "finalized",
      finalizedAt: Date.now(),
    });
  },
});

/**
 * Roll back an optimistic settlement
 */
export const rollback = mutation({
  args: {
    id: v.id("optimisticSettlements"),
    errorMessage: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const settlement = await ctx.db.get(args.id);
    if (!settlement) {
      throw new Error("Settlement not found");
    }

    await ctx.db.patch(args.id, {
      status: "rolled_back",
      errorMessage: args.errorMessage,
      finalState: settlement.previousState, // Revert to previous state
    });

    return { rolledBackTo: settlement.previousState };
  },
});

/**
 * Mark settlement as failed
 */
export const markFailed = mutation({
  args: {
    id: v.id("optimisticSettlements"),
    errorMessage: v.string(),
  },
  handler: async (ctx, args) => {
    const settlement = await ctx.db.get(args.id);
    if (!settlement) {
      throw new Error("Settlement not found");
    }

    await ctx.db.patch(args.id, {
      status: "failed",
      errorMessage: args.errorMessage,
      retryCount: settlement.retryCount + 1,
    });
  },
});

/**
 * Retry a failed settlement
 */
export const retry = mutation({
  args: { id: v.id("optimisticSettlements") },
  handler: async (ctx, args) => {
    const settlement = await ctx.db.get(args.id);
    if (!settlement) {
      throw new Error("Settlement not found");
    }

    if (settlement.status !== "failed" && settlement.status !== "rolled_back") {
      throw new Error(`Cannot retry settlement in ${settlement.status} status`);
    }

    await ctx.db.patch(args.id, {
      status: "pending",
      errorMessage: undefined,
      solanaSignature: undefined,
      submittedAt: undefined,
      confirmedAt: undefined,
      finalizedAt: undefined,
    });
  },
});

// ============================================================================
// Card Balance Operations (Optimistic)
// ============================================================================

/**
 * Optimistically update card balance
 */
export const optimisticCardBalanceUpdate = mutation({
  args: {
    userId: v.id("users"),
    cardId: v.id("cards"),
    intentId: v.optional(v.id("intents")),
    previousBalance: v.number(),
    newBalance: v.number(),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const optimisticTxId = `card_bal_${now}_${Math.random().toString(36).slice(2, 11)}`;

    // Create optimistic settlement record
    const settlementId = await ctx.db.insert("optimisticSettlements", {
      userId: args.userId,
      intentId: args.intentId,
      optimisticTxId,
      entityType: "card_balance",
      entityId: args.cardId,
      previousState: { balance: args.previousBalance },
      optimisticState: { balance: args.newBalance },
      status: "pending",
      retryCount: 0,
      createdAt: now,
    });

    // Immediately update the card balance (optimistic)
    await ctx.db.patch(args.cardId, {
      currentBalance: args.newBalance,
      updatedAt: now,
    });

    return { settlementId, optimisticTxId };
  },
});

/**
 * Confirm card balance update
 */
export const confirmCardBalanceUpdate = mutation({
  args: {
    settlementId: v.id("optimisticSettlements"),
    solanaSignature: v.string(),
    confirmationSlot: v.number(),
    actualBalance: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const settlement = await ctx.db.get(args.settlementId);
    if (!settlement) {
      throw new Error("Settlement not found");
    }

    const now = Date.now();
    const confirmationTimeMs = now - settlement.createdAt;

    // If actual balance differs, update the card
    if (
      args.actualBalance !== undefined &&
      args.actualBalance !== settlement.optimisticState.balance
    ) {
      await ctx.db.patch(settlement.entityId as Id<"cards">, {
        currentBalance: args.actualBalance,
        updatedAt: now,
      });
    }

    // Mark settlement as confirmed
    await ctx.db.patch(args.settlementId, {
      status: "confirmed",
      solanaSignature: args.solanaSignature,
      confirmationSlot: args.confirmationSlot,
      confirmationTimeMs,
      finalState: {
        balance: args.actualBalance ?? settlement.optimisticState.balance,
      },
      confirmedAt: now,
    });
  },
});

/**
 * Rollback card balance update
 */
export const rollbackCardBalanceUpdate = mutation({
  args: {
    settlementId: v.id("optimisticSettlements"),
    errorMessage: v.string(),
  },
  handler: async (ctx, args) => {
    const settlement = await ctx.db.get(args.settlementId);
    if (!settlement) {
      throw new Error("Settlement not found");
    }

    // Restore previous balance
    await ctx.db.patch(settlement.entityId as Id<"cards">, {
      currentBalance: settlement.previousState.balance,
      updatedAt: Date.now(),
    });

    // Mark settlement as rolled back
    await ctx.db.patch(args.settlementId, {
      status: "rolled_back",
      errorMessage: args.errorMessage,
      finalState: settlement.previousState,
    });
  },
});

// ============================================================================
// Internal Functions
// ============================================================================

/**
 * Clean up old settlements (run periodically)
 */
export const cleanupOldSettlements = internalMutation({
  args: {
    olderThanDays: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const daysToKeep = args.olderThanDays ?? 30;
    const cutoffTime = Date.now() - daysToKeep * 24 * 60 * 60 * 1000;

    // Get old finalized or failed settlements
    const oldSettlements = await ctx.db
      .query("optimisticSettlements")
      .filter((q) =>
        q.and(
          q.lt(q.field("createdAt"), cutoffTime),
          q.or(
            q.eq(q.field("status"), "finalized"),
            q.eq(q.field("status"), "failed"),
            q.eq(q.field("status"), "rolled_back")
          )
        )
      )
      .collect();

    // Delete old settlements
    for (const settlement of oldSettlements) {
      await ctx.db.delete(settlement._id);
    }

    return { deleted: oldSettlements.length };
  },
});

/**
 * Get stale pending settlements (for monitoring)
 */
export const getStalePending = internalQuery({
  args: {
    olderThanMinutes: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const minutesCutoff = args.olderThanMinutes ?? 5;
    const cutoffTime = Date.now() - minutesCutoff * 60 * 1000;

    return await ctx.db
      .query("optimisticSettlements")
      .filter((q) =>
        q.and(
          q.eq(q.field("status"), "pending"),
          q.lt(q.field("createdAt"), cutoffTime)
        )
      )
      .collect();
  },
});

// ============================================================================
// Solana Transaction Submission (Firedancer-Optimized)
// ============================================================================

const ALPENGLOW_TARGET_MS = 150;
const MAX_CONFIRMATION_WAIT_MS = 30000;
const POLL_INTERVAL_MS = 50;

const SOLANA_RPC_URL = process.env.SOLANA_RPC_URL ?? "https://api.mainnet-beta.solana.com";
const HELIUS_FIREDANCER_URL = process.env.HELIUS_RPC_URL;

/**
 * Submit signed transaction to Solana and track confirmation
 */
export const submitSignedTransaction = internalAction({
  args: {
    requestId: v.string(),
  },
  handler: async (ctx, args) => {
    const startTime = Date.now();

    try {
      // Get signing request
      const request = await ctx.runQuery(
        internal.bridge.turnkeyBridge.getSigningRequest,
        { requestId: args.requestId }
      );

      if (!request) {
        throw new Error("Signing request not found");
      }

      if (request.status !== "signed" || !request.signature) {
        throw new Error(`Invalid request status: ${request.status}`);
      }

      // Combine unsigned transaction with signature
      const signedTransaction = combineTransactionWithSignature(
        request.unsignedTransaction,
        request.signature
      );

      // Update status to submitted
      await ctx.runMutation(internal.bridge.turnkeyBridge.updateSigningStatus, {
        requestId: args.requestId,
        status: "submitted",
      });

      // Submit to Firedancer RPC
      const signature = await submitToSolana(signedTransaction);

      // Track confirmation
      const confirmationResult = await waitForConfirmation(signature, startTime);

      if (confirmationResult.confirmed) {
        // Success - finalize
        await ctx.runMutation(internal.bridge.settlement.finalizeSigningRequest, {
          requestId: args.requestId,
          solanaSignature: signature,
          confirmationTimeMs: confirmationResult.timeMs,
          slot: confirmationResult.slot,
        });

        console.log(
          `[Settlement] Request ${args.requestId} confirmed in ${confirmationResult.timeMs}ms ` +
          `(target: ${ALPENGLOW_TARGET_MS}ms)`
        );

        return {
          success: true,
          signature,
          confirmationTimeMs: confirmationResult.timeMs,
          withinTarget: confirmationResult.timeMs <= ALPENGLOW_TARGET_MS,
        };
      } else {
        // Failed - rollback
        await ctx.runMutation(internal.bridge.settlement.rollbackSigningRequest, {
          requestId: args.requestId,
          error: confirmationResult.error || "Confirmation failed",
        });

        return {
          success: false,
          error: confirmationResult.error,
        };
      }
    } catch (error) {
      console.error("[Settlement] Submission failed:", error);

      await ctx.runMutation(internal.bridge.settlement.rollbackSigningRequest, {
        requestId: args.requestId,
        error: error instanceof Error ? error.message : "Submission failed",
      });

      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  },
});

/**
 * Finalize a signing request after successful confirmation
 */
export const finalizeSigningRequest = internalMutation({
  args: {
    requestId: v.string(),
    solanaSignature: v.string(),
    confirmationTimeMs: v.number(),
    slot: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const request = await ctx.db
      .query("signingRequests")
      .withIndex("by_request_id", (q) => q.eq("requestId", args.requestId))
      .first();

    if (!request) {
      throw new Error("Signing request not found");
    }

    const now = Date.now();
    const withinTarget = args.confirmationTimeMs <= ALPENGLOW_TARGET_MS;

    // Update signing request
    await ctx.db.patch(request._id, {
      status: "confirmed",
      solanaSignature: args.solanaSignature,
      confirmationTimeMs: args.confirmationTimeMs,
      updatedAt: now,
    });

    // Update intent
    await ctx.db.patch(request.intentId, {
      status: "completed",
      solanaTransactionSignature: args.solanaSignature,
      updatedAt: now,
    });

    // Record settlement for metrics
    await ctx.db.insert("settlementRecords", {
      signingRequestId: request._id,
      intentId: request.intentId,
      userId: request.userId,
      solanaSignature: args.solanaSignature,
      confirmationTimeMs: args.confirmationTimeMs,
      withinAlpenglowTarget: withinTarget,
      slot: args.slot,
      status: "finalized",
      createdAt: now,
    });

    return { success: true };
  },
});

/**
 * Rollback a failed signing request
 */
export const rollbackSigningRequest = internalMutation({
  args: {
    requestId: v.string(),
    error: v.string(),
  },
  handler: async (ctx, args) => {
    const request = await ctx.db
      .query("signingRequests")
      .withIndex("by_request_id", (q) => q.eq("requestId", args.requestId))
      .first();

    if (!request) {
      throw new Error("Signing request not found");
    }

    const now = Date.now();

    // Update signing request
    await ctx.db.patch(request._id, {
      status: "failed",
      error: args.error,
      updatedAt: now,
    });

    // Update intent
    await ctx.db.patch(request.intentId, {
      status: "failed",
      errorMessage: args.error,
      errorCode: "SETTLEMENT_FAILED",
      updatedAt: now,
    });

    // Record failed settlement
    await ctx.db.insert("settlementRecords", {
      signingRequestId: request._id,
      intentId: request.intentId,
      userId: request.userId,
      status: "failed",
      error: args.error,
      createdAt: now,
    });

    return { success: true };
  },
});

/**
 * Get user settlement metrics
 */
export const getUserSettlementMetrics = query({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const records = await ctx.db
      .query("settlementRecords")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .collect();

    const successful = records.filter((r) => r.status === "finalized");
    const failed = records.filter((r) => r.status === "failed");

    const avgConfirmation =
      successful.length > 0
        ? successful.reduce((sum, r) => sum + (r.confirmationTimeMs || 0), 0) / successful.length
        : 0;

    const withinTarget = successful.filter((r) => r.withinAlpenglowTarget).length;

    return {
      totalSettlements: records.length,
      successRate: records.length > 0 ? (successful.length / records.length) * 100 : 100,
      avgConfirmationTimeMs: Math.round(avgConfirmation),
      alpenglowCompliancePercent:
        successful.length > 0 ? (withinTarget / successful.length) * 100 : 100,
      targetMs: ALPENGLOW_TARGET_MS,
    };
  },
});

// ============================================================================
// Helper Functions
// ============================================================================

function combineTransactionWithSignature(unsignedTx: string, signature: string): string {
  const txBytes = Buffer.from(unsignedTx, "base64");
  const sigBytes = Buffer.from(signature, "hex");
  const signedTx = Buffer.concat([Buffer.from([1]), sigBytes, txBytes]);
  return signedTx.toString("base64");
}

async function submitToSolana(signedTransaction: string): Promise<string> {
  const rpcUrl = HELIUS_FIREDANCER_URL || SOLANA_RPC_URL;

  const response = await fetch(rpcUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "sendTransaction",
      params: [
        signedTransaction,
        {
          encoding: "base64",
          skipPreflight: true,
          maxRetries: 0,
          preflightCommitment: "confirmed",
        },
      ],
    }),
  });

  const result = await response.json();
  if (result.error) {
    throw new Error(`RPC error: ${result.error.message}`);
  }
  return result.result;
}

interface ConfirmationResult {
  confirmed: boolean;
  signature?: string;
  slot?: number;
  confirmationStatus?: string;
  timeMs: number;
  error?: string;
}

async function waitForConfirmation(
  signature: string,
  startTime: number
): Promise<ConfirmationResult> {
  const rpcUrl = HELIUS_FIREDANCER_URL || SOLANA_RPC_URL;
  const maxAttempts = Math.ceil(MAX_CONFIRMATION_WAIT_MS / POLL_INTERVAL_MS);
  let attempts = 0;

  while (attempts < maxAttempts) {
    try {
      const response = await fetch(rpcUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "getSignatureStatuses",
          params: [[signature], { searchTransactionHistory: false }],
        }),
      });

      const result = await response.json();
      const status = result.result?.value?.[0];

      if (status?.confirmationStatus) {
        const timeMs = Date.now() - startTime;

        if (status.err) {
          return {
            confirmed: false,
            signature,
            timeMs,
            error: JSON.stringify(status.err),
          };
        }

        if (
          status.confirmationStatus === "confirmed" ||
          status.confirmationStatus === "finalized"
        ) {
          return {
            confirmed: true,
            signature,
            slot: result.context?.slot,
            confirmationStatus: status.confirmationStatus,
            timeMs,
          };
        }
      }
    } catch {
      // Continue polling
    }

    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
    attempts++;
  }

  return {
    confirmed: false,
    signature,
    timeMs: Date.now() - startTime,
    error: "Confirmation timeout",
  };
}
