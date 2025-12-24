/**
 * DisCard 2035 - Optimistic Update Patterns
 *
 * Firedancer/Alpenglow-ready architecture for instant UI updates
 * with async blockchain confirmation. Designed for 150ms finality.
 *
 * Pattern:
 * 1. User initiates action
 * 2. Immediately update Convex (optimistic state)
 * 3. Submit transaction to Solana
 * 4. Confirm via WebSocket subscription
 * 5. Reconcile or rollback if needed
 */

import { v } from "convex/values";
import {
  mutation,
  query,
  internalMutation,
  internalAction,
  action,
} from "../_generated/server";
import { internal } from "../_generated/api";
import { Id } from "../_generated/dataModel";

// ============================================================================
// Constants
// ============================================================================

/** Target confirmation time for Alpenglow (milliseconds) */
const ALPENGLOW_TARGET_CONFIRMATION_MS = 150;

/** Maximum wait time before considering transaction stale */
const MAX_CONFIRMATION_WAIT_MS = 30000;

/** Retry interval for confirmation polling */
const CONFIRMATION_POLL_INTERVAL_MS = 100;

// ============================================================================
// Types
// ============================================================================

type OptimisticEntityType =
  | "card_balance"
  | "card_status"
  | "wallet_balance"
  | "policy_update"
  | "merchant_list"
  | "velocity_limit";

interface OptimisticUpdate {
  entityType: OptimisticEntityType;
  entityId: string;
  previousState: unknown;
  optimisticState: unknown;
  timestamp: number;
}

// ============================================================================
// Core Optimistic Mutation Pattern
// ============================================================================

/**
 * Execute an optimistic card balance update
 * This is the core pattern for Alpenglow-ready updates
 */
export const optimisticBalanceUpdate = mutation({
  args: {
    userId: v.id("users"),
    cardId: v.id("cards"),
    amount: v.number(),
    operation: v.union(v.literal("add"), v.literal("subtract")),
    description: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    // 1. Get current state
    const card = await ctx.db.get(args.cardId);
    if (!card) {
      throw new Error("Card not found");
    }

    const previousBalance = card.currentBalance;
    const newBalance =
      args.operation === "add"
        ? previousBalance + args.amount
        : previousBalance - args.amount;

    // Validate
    if (newBalance < 0) {
      throw new Error("Insufficient balance");
    }

    // 2. Immediately update (optimistic)
    await ctx.db.patch(args.cardId, {
      currentBalance: newBalance,
      updatedAt: now,
    });

    // 3. Create settlement record for tracking
    const optimisticTxId = `opt_${now}_${Math.random().toString(36).slice(2, 11)}`;

    const settlementId = await ctx.db.insert("optimisticSettlements", {
      userId: args.userId,
      optimisticTxId,
      entityType: "card_balance",
      entityId: args.cardId,
      previousState: { balance: previousBalance },
      optimisticState: { balance: newBalance },
      status: "pending",
      retryCount: 0,
      createdAt: now,
    });

    // 4. Schedule blockchain confirmation (non-blocking)
    await ctx.scheduler.runAfter(0, internal.realtime.optimistic.scheduleConfirmation, {
      settlementId,
      cardId: args.cardId,
      amount: args.amount,
      operation: args.operation,
    });

    return {
      success: true,
      optimisticTxId,
      settlementId,
      newBalance,
      previousBalance,
      pendingConfirmation: true,
    };
  },
});

/**
 * Execute an optimistic card status update
 */
export const optimisticStatusUpdate = mutation({
  args: {
    userId: v.id("users"),
    cardId: v.id("cards"),
    newStatus: v.union(
      v.literal("active"),
      v.literal("paused"),
      v.literal("frozen")
    ),
    reason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    const card = await ctx.db.get(args.cardId);
    if (!card) {
      throw new Error("Card not found");
    }

    const previousStatus = card.status;

    // Immediate update
    await ctx.db.patch(args.cardId, {
      status: args.newStatus,
      updatedAt: now,
    });

    // Create settlement record
    const optimisticTxId = `opt_status_${now}_${Math.random().toString(36).slice(2, 11)}`;

    const settlementId = await ctx.db.insert("optimisticSettlements", {
      userId: args.userId,
      optimisticTxId,
      entityType: "card_status",
      entityId: args.cardId,
      previousState: { status: previousStatus },
      optimisticState: { status: args.newStatus },
      status: "pending",
      retryCount: 0,
      createdAt: now,
    });

    // Schedule confirmation
    await ctx.scheduler.runAfter(0, internal.realtime.optimistic.scheduleStatusConfirmation, {
      settlementId,
      cardId: args.cardId,
      newStatus: args.newStatus,
    });

    return {
      success: true,
      optimisticTxId,
      settlementId,
      previousStatus,
      newStatus: args.newStatus,
      pendingConfirmation: true,
    };
  },
});

/**
 * Execute an optimistic policy update
 */
export const optimisticPolicyUpdate = mutation({
  args: {
    userId: v.id("users"),
    cardId: v.id("cards"),
    policyChanges: v.object({
      velocityLimits: v.optional(v.object({
        perTransaction: v.optional(v.number()),
        daily: v.optional(v.number()),
        weekly: v.optional(v.number()),
        monthly: v.optional(v.number()),
      })),
      merchantLocking: v.optional(v.boolean()),
      allowedMerchants: v.optional(v.array(v.string())),
      blockedMerchants: v.optional(v.array(v.string())),
    }),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    const card = await ctx.db.get(args.cardId);
    if (!card) {
      throw new Error("Card not found");
    }

    // Get Turnkey org for policy
    const turnkeyOrg = await ctx.db
      .query("turnkeyOrganizations")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .first();

    if (!turnkeyOrg) {
      throw new Error("Turnkey organization not found");
    }

    const previousPolicies = { ...turnkeyOrg.policies };

    // Apply changes
    const newPolicies = {
      ...turnkeyOrg.policies,
      ...(args.policyChanges.merchantLocking !== undefined && {
        merchantLocking: args.policyChanges.merchantLocking,
      }),
      ...(args.policyChanges.allowedMerchants && {
        allowedMerchants: args.policyChanges.allowedMerchants,
      }),
      ...(args.policyChanges.blockedMerchants && {
        blockedMerchants: args.policyChanges.blockedMerchants,
      }),
      ...(args.policyChanges.velocityLimits && {
        velocityLimits: {
          ...turnkeyOrg.policies.velocityLimits,
          ...args.policyChanges.velocityLimits,
        },
      }),
    };

    // Immediate update
    await ctx.db.patch(turnkeyOrg._id, {
      policies: newPolicies,
      updatedAt: now,
    });

    // Create settlement record
    const optimisticTxId = `opt_policy_${now}_${Math.random().toString(36).slice(2, 11)}`;

    const settlementId = await ctx.db.insert("optimisticSettlements", {
      userId: args.userId,
      optimisticTxId,
      entityType: "policy_update",
      entityId: args.cardId,
      previousState: previousPolicies,
      optimisticState: newPolicies,
      status: "pending",
      retryCount: 0,
      createdAt: now,
    });

    return {
      success: true,
      optimisticTxId,
      settlementId,
      pendingConfirmation: true,
    };
  },
});

// ============================================================================
// Confirmation Scheduling (Internal)
// ============================================================================

/**
 * Schedule blockchain confirmation for balance update
 */
export const scheduleConfirmation = internalMutation({
  args: {
    settlementId: v.id("optimisticSettlements"),
    cardId: v.id("cards"),
    amount: v.number(),
    operation: v.union(v.literal("add"), v.literal("subtract")),
  },
  handler: async (ctx, args) => {
    // Mark as submitted
    await ctx.db.patch(args.settlementId, {
      status: "submitted",
      submittedAt: Date.now(),
    });

    // In production, this would:
    // 1. Build the Solana transaction
    // 2. Submit via Turnkey TEE signing
    // 3. Return signature for confirmation tracking

    // Schedule confirmation check
    await ctx.scheduler.runAfter(
      CONFIRMATION_POLL_INTERVAL_MS,
      internal.realtime.optimistic.checkConfirmation,
      { settlementId: args.settlementId }
    );
  },
});

/**
 * Schedule blockchain confirmation for status update
 */
export const scheduleStatusConfirmation = internalMutation({
  args: {
    settlementId: v.id("optimisticSettlements"),
    cardId: v.id("cards"),
    newStatus: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.settlementId, {
      status: "submitted",
      submittedAt: Date.now(),
    });

    await ctx.scheduler.runAfter(
      CONFIRMATION_POLL_INTERVAL_MS,
      internal.realtime.optimistic.checkConfirmation,
      { settlementId: args.settlementId }
    );
  },
});

/**
 * Check confirmation status
 */
export const checkConfirmation = internalMutation({
  args: { settlementId: v.id("optimisticSettlements") },
  handler: async (ctx, args) => {
    const settlement = await ctx.db.get(args.settlementId);
    if (!settlement) return;

    // Already confirmed or failed
    if (settlement.status === "confirmed" || settlement.status === "finalized") {
      return;
    }

    const now = Date.now();
    const elapsed = now - settlement.createdAt;

    // Check if transaction is stale
    if (elapsed > MAX_CONFIRMATION_WAIT_MS) {
      // Rollback the optimistic update
      await ctx.scheduler.runAfter(0, internal.realtime.optimistic.rollbackOptimistic, {
        settlementId: args.settlementId,
        reason: "Confirmation timeout",
      });
      return;
    }

    // In production, check Solana for transaction confirmation
    // For now, simulate confirmation after ~150ms (Alpenglow target)
    if (elapsed >= ALPENGLOW_TARGET_CONFIRMATION_MS) {
      // Mark as confirmed
      await ctx.db.patch(args.settlementId, {
        status: "confirmed",
        confirmationTimeMs: elapsed,
        confirmedAt: now,
      });

      // After a few more confirmations, mark as finalized
      await ctx.scheduler.runAfter(500, internal.realtime.optimistic.markFinalized, {
        settlementId: args.settlementId,
      });

      return;
    }

    // Continue polling
    await ctx.scheduler.runAfter(
      CONFIRMATION_POLL_INTERVAL_MS,
      internal.realtime.optimistic.checkConfirmation,
      { settlementId: args.settlementId }
    );
  },
});

/**
 * Mark settlement as finalized (Alpenglow final confirmation)
 */
export const markFinalized = internalMutation({
  args: { settlementId: v.id("optimisticSettlements") },
  handler: async (ctx, args) => {
    const settlement = await ctx.db.get(args.settlementId);
    if (!settlement || settlement.status !== "confirmed") return;

    await ctx.db.patch(args.settlementId, {
      status: "finalized",
      finalizedAt: Date.now(),
      finalState: settlement.optimisticState,
    });
  },
});

/**
 * Rollback an optimistic update
 */
export const rollbackOptimistic = internalMutation({
  args: {
    settlementId: v.id("optimisticSettlements"),
    reason: v.string(),
  },
  handler: async (ctx, args) => {
    const settlement = await ctx.db.get(args.settlementId);
    if (!settlement) return;

    const now = Date.now();

    // Restore previous state based on entity type
    switch (settlement.entityType) {
      case "card_balance": {
        const previousState = settlement.previousState as { balance: number };
        await ctx.db.patch(settlement.entityId as Id<"cards">, {
          currentBalance: previousState.balance,
          updatedAt: now,
        });
        break;
      }

      case "card_status": {
        const previousState = settlement.previousState as { status: string };
        await ctx.db.patch(settlement.entityId as Id<"cards">, {
          status: previousState.status as any,
          updatedAt: now,
        });
        break;
      }

      case "policy_update": {
        // Restore policy - would need to get turnkey org
        // In production, store the org ID in settlement
        break;
      }
    }

    // Mark as rolled back
    await ctx.db.patch(args.settlementId, {
      status: "rolled_back",
      errorMessage: args.reason,
      finalState: settlement.previousState,
    });
  },
});

// ============================================================================
// Queries for Real-time UI
// ============================================================================

/**
 * Get pending optimistic updates for a user
 */
export const getPendingUpdates = query({
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
 * Get confirmation stats for a user
 */
export const getConfirmationStats = query({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const settlements = await ctx.db
      .query("optimisticSettlements")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .collect();

    const confirmed = settlements.filter(
      (s) => s.status === "confirmed" || s.status === "finalized"
    );
    const pending = settlements.filter(
      (s) => s.status === "pending" || s.status === "submitted"
    );
    const failed = settlements.filter(
      (s) => s.status === "rolled_back" || s.status === "failed"
    );

    // Calculate average confirmation time
    const confirmationTimes = confirmed
      .filter((s) => s.confirmationTimeMs)
      .map((s) => s.confirmationTimeMs!);

    const avgConfirmationTime =
      confirmationTimes.length > 0
        ? confirmationTimes.reduce((a, b) => a + b, 0) / confirmationTimes.length
        : 0;

    // Calculate percentage under Alpenglow target
    const underTarget = confirmationTimes.filter(
      (t) => t <= ALPENGLOW_TARGET_CONFIRMATION_MS
    );
    const alpenglowCompliance =
      confirmationTimes.length > 0
        ? (underTarget.length / confirmationTimes.length) * 100
        : 100;

    return {
      total: settlements.length,
      confirmed: confirmed.length,
      pending: pending.length,
      failed: failed.length,
      avgConfirmationTimeMs: Math.round(avgConfirmationTime),
      alpenglowTargetMs: ALPENGLOW_TARGET_CONFIRMATION_MS,
      alpenglowCompliancePercent: Math.round(alpenglowCompliance * 100) / 100,
      successRate:
        settlements.length > 0
          ? Math.round((confirmed.length / settlements.length) * 10000) / 100
          : 100,
    };
  },
});

/**
 * Subscribe to settlement status changes
 */
export const getSettlementStatus = query({
  args: { settlementId: v.id("optimisticSettlements") },
  handler: async (ctx, args) => {
    const settlement = await ctx.db.get(args.settlementId);
    if (!settlement) return null;

    const elapsed = Date.now() - settlement.createdAt;

    return {
      id: settlement._id,
      status: settlement.status,
      entityType: settlement.entityType,
      entityId: settlement.entityId,
      elapsedMs: elapsed,
      confirmationTimeMs: settlement.confirmationTimeMs,
      isWithinTarget: (settlement.confirmationTimeMs ?? elapsed) <= ALPENGLOW_TARGET_CONFIRMATION_MS,
      optimisticState: settlement.optimisticState,
      finalState: settlement.finalState,
      errorMessage: settlement.errorMessage,
    };
  },
});

// ============================================================================
// Batch Operations
// ============================================================================

/**
 * Batch optimistic updates for multiple cards
 */
export const batchOptimisticUpdate = mutation({
  args: {
    userId: v.id("users"),
    updates: v.array(
      v.object({
        cardId: v.id("cards"),
        amount: v.number(),
        operation: v.union(v.literal("add"), v.literal("subtract")),
      })
    ),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const results: Array<{
      cardId: Id<"cards">;
      settlementId: Id<"optimisticSettlements">;
      success: boolean;
    }> = [];

    for (const update of args.updates) {
      const card = await ctx.db.get(update.cardId);
      if (!card) {
        results.push({ cardId: update.cardId, settlementId: "" as any, success: false });
        continue;
      }

      const previousBalance = card.currentBalance;
      const newBalance =
        update.operation === "add"
          ? previousBalance + update.amount
          : previousBalance - update.amount;

      if (newBalance < 0) {
        results.push({ cardId: update.cardId, settlementId: "" as any, success: false });
        continue;
      }

      // Update
      await ctx.db.patch(update.cardId, {
        currentBalance: newBalance,
        updatedAt: now,
      });

      // Create settlement
      const optimisticTxId = `opt_batch_${now}_${Math.random().toString(36).slice(2, 11)}`;
      const settlementId = await ctx.db.insert("optimisticSettlements", {
        userId: args.userId,
        optimisticTxId,
        entityType: "card_balance",
        entityId: update.cardId,
        previousState: { balance: previousBalance },
        optimisticState: { balance: newBalance },
        status: "pending",
        retryCount: 0,
        createdAt: now,
      });

      results.push({ cardId: update.cardId, settlementId, success: true });
    }

    // Schedule batch confirmation
    const successfulSettlements = results
      .filter((r) => r.success)
      .map((r) => r.settlementId);

    if (successfulSettlements.length > 0) {
      await ctx.scheduler.runAfter(0, internal.realtime.optimistic.batchConfirmation, {
        settlementIds: successfulSettlements,
      });
    }

    return {
      total: args.updates.length,
      successful: results.filter((r) => r.success).length,
      failed: results.filter((r) => !r.success).length,
      results,
    };
  },
});

/**
 * Batch confirmation check
 */
export const batchConfirmation = internalMutation({
  args: { settlementIds: v.array(v.id("optimisticSettlements")) },
  handler: async (ctx, args) => {
    const now = Date.now();

    for (const settlementId of args.settlementIds) {
      await ctx.db.patch(settlementId, {
        status: "submitted",
        submittedAt: now,
      });
    }

    // Schedule confirmation check for first one (will cascade)
    if (args.settlementIds.length > 0) {
      await ctx.scheduler.runAfter(
        CONFIRMATION_POLL_INTERVAL_MS,
        internal.realtime.optimistic.checkBatchConfirmation,
        { settlementIds: args.settlementIds }
      );
    }
  },
});

/**
 * Check batch confirmation status
 */
export const checkBatchConfirmation = internalMutation({
  args: { settlementIds: v.array(v.id("optimisticSettlements")) },
  handler: async (ctx, args) => {
    const now = Date.now();

    for (const settlementId of args.settlementIds) {
      const settlement = await ctx.db.get(settlementId);
      if (!settlement || settlement.status !== "submitted") continue;

      const elapsed = now - settlement.createdAt;

      if (elapsed >= ALPENGLOW_TARGET_CONFIRMATION_MS) {
        await ctx.db.patch(settlementId, {
          status: "confirmed",
          confirmationTimeMs: elapsed,
          confirmedAt: now,
        });
      }
    }

    // Check if any still pending
    const stillPending = [];
    for (const settlementId of args.settlementIds) {
      const settlement = await ctx.db.get(settlementId);
      if (settlement?.status === "submitted") {
        stillPending.push(settlementId);
      }
    }

    if (stillPending.length > 0) {
      await ctx.scheduler.runAfter(
        CONFIRMATION_POLL_INTERVAL_MS,
        internal.realtime.optimistic.checkBatchConfirmation,
        { settlementIds: stillPending }
      );
    }
  },
});
