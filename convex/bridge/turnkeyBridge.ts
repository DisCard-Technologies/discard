/**
 * DisCard 2035 - Turnkey Bridge
 *
 * Orchestrates the flow between Convex intents and Turnkey TEE signing.
 * Handles the complete lifecycle:
 *
 * 1. Intent received from user
 * 2. Build unsigned Solana transaction
 * 3. Request Turnkey TEE signature (user passkey approval)
 * 4. Submit signed transaction to Firedancer RPC
 * 5. Track confirmation with optimistic updates
 *
 * Security Model:
 * - DisCard server has PROPOSE-ONLY permissions
 * - User approval required for all signing (passkey biometric)
 * - Policy enforcement happens in TEE before signing
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
import { internal } from "../_generated/api";
import { Id } from "../_generated/dataModel";

// ============================================================================
// Types
// ============================================================================

export type SigningStatus =
  | "pending"
  | "awaiting_approval"
  | "signing"
  | "signed"
  | "submitted"
  | "confirmed"
  | "failed"
  | "rejected";

export interface SigningRequest {
  requestId: string;
  intentId: string;
  userId: string;
  subOrganizationId: string;
  walletAddress: string;
  unsignedTransaction: string;
  transactionMessage: string;
  status: SigningStatus;
  turnkeyActivityId?: string;
  signature?: string;
  solanaSignature?: string;
  error?: string;
  createdAt: number;
  updatedAt: number;
  confirmationTimeMs?: number;
}

// ============================================================================
// Signing Request Management
// ============================================================================

/**
 * Create a signing request for an intent
 */
export const createSigningRequest = mutation({
  args: {
    intentId: v.id("intents"),
    unsignedTransaction: v.string(),
    transactionMessage: v.string(),
  },
  handler: async (ctx, args) => {
    // Get intent
    const intent = await ctx.db.get(args.intentId);
    if (!intent) {
      throw new Error("Intent not found");
    }

    // Get user's Turnkey organization
    const turnkeyOrg = await ctx.db
      .query("turnkeyOrganizations")
      .withIndex("by_user", (q) => q.eq("userId", intent.userId))
      .first();

    if (!turnkeyOrg) {
      throw new Error("User has no Turnkey wallet configured");
    }

    const now = Date.now();
    const requestId = `sign_${now}_${Math.random().toString(36).slice(2, 11)}`;

    // Store signing request
    const id = await ctx.db.insert("signingRequests", {
      requestId,
      intentId: args.intentId,
      userId: intent.userId,
      subOrganizationId: turnkeyOrg.subOrganizationId,
      walletAddress: turnkeyOrg.walletAddress,
      unsignedTransaction: args.unsignedTransaction,
      transactionMessage: args.transactionMessage,
      status: "pending",
      createdAt: now,
      updatedAt: now,
    });

    return {
      signingRequestId: id,
      requestId,
      walletAddress: turnkeyOrg.walletAddress,
    };
  },
});

/**
 * Get signing request by ID
 */
export const getSigningRequest = query({
  args: { requestId: v.string() },
  handler: async (ctx, args) => {
    return ctx.db
      .query("signingRequests")
      .withIndex("by_request_id", (q) => q.eq("requestId", args.requestId))
      .first();
  },
});

/**
 * Get pending signing requests for user
 */
export const getPendingRequests = query({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    return ctx.db
      .query("signingRequests")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .filter((q) =>
        q.or(
          q.eq(q.field("status"), "pending"),
          q.eq(q.field("status"), "awaiting_approval")
        )
      )
      .collect();
  },
});

/**
 * Get a signing request by request ID (internal)
 */
export const getSigningRequestInternal = internalQuery({
  args: { requestId: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("signingRequests")
      .withIndex("by_request_id", (q) => q.eq("requestId", args.requestId))
      .first();
  },
});

/**
 * Update signing request status
 */
export const updateSigningStatus = internalMutation({
  args: {
    requestId: v.string(),
    status: v.string(),
    turnkeyActivityId: v.optional(v.string()),
    signature: v.optional(v.string()),
    solanaSignature: v.optional(v.string()),
    error: v.optional(v.string()),
    confirmationTimeMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const request = await ctx.db
      .query("signingRequests")
      .withIndex("by_request_id", (q) => q.eq("requestId", args.requestId))
      .first();

    if (!request) {
      throw new Error("Signing request not found");
    }

    const updateData: Record<string, unknown> = {
      status: args.status,
      updatedAt: Date.now(),
    };

    if (args.turnkeyActivityId) {
      updateData.turnkeyActivityId = args.turnkeyActivityId;
    }
    if (args.signature) {
      updateData.signature = args.signature;
    }
    if (args.solanaSignature) {
      updateData.solanaSignature = args.solanaSignature;
    }
    if (args.error) {
      updateData.error = args.error;
    }
    if (args.confirmationTimeMs !== undefined) {
      updateData.confirmationTimeMs = args.confirmationTimeMs;
    }

    await ctx.db.patch(request._id, updateData);

    return { success: true };
  },
});

// ============================================================================
// Turnkey Activity Handling
// ============================================================================

/**
 * Record Turnkey activity for a signing request
 */
export const recordTurnkeyActivity = mutation({
  args: {
    requestId: v.string(),
    activityId: v.string(),
    activityType: v.string(),
    status: v.string(),
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

    // Update request with activity ID
    await ctx.db.patch(request._id, {
      turnkeyActivityId: args.activityId,
      status: args.status === "ACTIVITY_STATUS_PENDING" ? "awaiting_approval" : "signing",
      updatedAt: now,
    });

    // Log the activity
    await ctx.db.insert("turnkeyActivities", {
      signingRequestId: request._id,
      activityId: args.activityId,
      activityType: args.activityType,
      status: args.status,
      createdAt: now,
      updatedAt: now,
    });

    return { success: true };
  },
});

/**
 * Handle Turnkey activity completion (from webhook)
 */
export const handleActivityCompletion = internalMutation({
  args: {
    activityId: v.string(),
    status: v.string(),
    result: v.optional(v.any()),
    error: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // Find signing request by activity ID
    const request = await ctx.db
      .query("signingRequests")
      .withIndex("by_activity_id", (q) => q.eq("turnkeyActivityId", args.activityId))
      .first();

    if (!request) {
      console.log(`[Bridge] No request found for activity ${args.activityId}`);
      return { success: false };
    }

    const now = Date.now();

    if (args.status === "ACTIVITY_STATUS_COMPLETED" && args.result?.signRawPayloadResult) {
      // Signing successful
      await ctx.db.patch(request._id, {
        status: "signed",
        signature: args.result.signRawPayloadResult.signature,
        updatedAt: now,
      });

      // Schedule transaction submission
      await ctx.scheduler.runAfter(0, internal.bridge.settlement.submitSignedTransaction, {
        requestId: request.requestId,
      });
    } else if (args.status === "ACTIVITY_STATUS_FAILED") {
      await ctx.db.patch(request._id, {
        status: "failed",
        error: args.error || "Turnkey activity failed",
        updatedAt: now,
      });

      // Update intent status
      await ctx.db.patch(request.intentId, {
        status: "failed",
        updatedAt: now,
      });
    } else if (args.status === "ACTIVITY_STATUS_REJECTED") {
      await ctx.db.patch(request._id, {
        status: "rejected",
        error: "User rejected signing request",
        updatedAt: now,
      });

      // Update intent status
      await ctx.db.patch(request.intentId, {
        status: "cancelled",
        updatedAt: now,
      });
    }

    // Update activity log
    const activity = await ctx.db
      .query("turnkeyActivities")
      .withIndex("by_activity_id", (q) => q.eq("activityId", args.activityId))
      .first();

    if (activity) {
      await ctx.db.patch(activity._id, {
        status: args.status,
        result: args.result,
        error: args.error,
        updatedAt: now,
      });
    }

    return { success: true };
  },
});

// ============================================================================
// Policy Verification
// ============================================================================

/**
 * Verify transaction against user's policies before signing
 */
export const verifyTransactionPolicy = internalQuery({
  args: {
    userId: v.id("users"),
    transactionType: v.string(),
    amount: v.optional(v.number()),
    destination: v.optional(v.string()),
    mccCode: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // Get user's Turnkey org with policies
    const turnkeyOrg = await ctx.db
      .query("turnkeyOrganizations")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .first();

    if (!turnkeyOrg) {
      return { allowed: false, reason: "No wallet configured" };
    }

    const { policies } = turnkeyOrg;

    // Check velocity limits
    if (args.amount) {
      const { velocityLimits, currentSpending } = policies;

      // Per-transaction limit
      if (args.amount > velocityLimits.perTransaction) {
        return {
          allowed: false,
          reason: `Amount exceeds per-transaction limit of ${velocityLimits.perTransaction}`,
          requiresOverride: true,
        };
      }

      // Daily limit
      if (currentSpending.daily + args.amount > velocityLimits.daily) {
        return {
          allowed: false,
          reason: `Would exceed daily limit of ${velocityLimits.daily}`,
          requiresOverride: true,
        };
      }

      // Monthly limit
      if (currentSpending.monthly + args.amount > velocityLimits.monthly) {
        return {
          allowed: false,
          reason: `Would exceed monthly limit of ${velocityLimits.monthly}`,
          requiresOverride: true,
        };
      }
    }

    // Check if 2FA required for this amount
    if (args.amount && policies.require2faAbove && args.amount > policies.require2faAbove) {
      return {
        allowed: true,
        requires2FA: true,
        reason: `Amount over ${policies.require2faAbove} requires 2FA`,
      };
    }

    // Check biometric requirement
    if (policies.requireBiometric) {
      return {
        allowed: true,
        requiresBiometric: true,
      };
    }

    return { allowed: true };
  },
});

// ============================================================================
// Bridge Orchestration Action
// ============================================================================

/**
 * Full bridge flow: Intent → Build → Sign → Submit → Confirm
 */
export const executeIntentViaBridge = internalAction({
  args: {
    intentId: v.id("intents"),
  },
  handler: async (ctx, args) => {
    const startTime = Date.now();

    try {
      // Get intent
      const intent = await ctx.runQuery(internal.intents.intents.getById, {
        intentId: args.intentId,
      });

      if (!intent) {
        throw new Error("Intent not found");
      }

      // Verify policies
      const policyCheck = await ctx.runQuery(
        internal.bridge.turnkeyBridge.verifyTransactionPolicy,
        {
          userId: intent.userId,
          transactionType: intent.parsedIntent?.action || "unknown",
          amount: intent.parsedIntent?.amount,
        }
      );

      if (!policyCheck.allowed) {
        throw new Error(`Policy violation: ${policyCheck.reason}`);
      }

      // Execute via the optimized executor
      await ctx.runAction(internal.intents.executor.execute, {
        intentId: args.intentId,
      });

      const totalTime = Date.now() - startTime;
      console.log(`[Bridge] Intent ${args.intentId} processed in ${totalTime}ms`);

      return { success: true, timeMs: totalTime };
    } catch (error) {
      console.error("[Bridge] Execution failed:", error);

      await ctx.runMutation(internal.intents.intents.updateStatus, {
        intentId: args.intentId,
        status: "failed",
        errorMessage: error instanceof Error ? error.message : "Bridge execution failed",
        errorCode: "BRIDGE_ERROR",
      });

      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  },
});

// ============================================================================
// Query Functions for UI
// ============================================================================

/**
 * Get signing request details for UI display
 */
export const getSigningRequestForApproval = query({
  args: { requestId: v.string() },
  handler: async (ctx, args) => {
    const request = await ctx.db
      .query("signingRequests")
      .withIndex("by_request_id", (q) => q.eq("requestId", args.requestId))
      .first();

    if (!request) {
      return null;
    }

    // Get intent for display
    const intent = await ctx.db.get(request.intentId);

    return {
      requestId: request.requestId,
      status: request.status,
      walletAddress: request.walletAddress,
      transactionMessage: request.transactionMessage,
      intent: intent
        ? {
            action: intent.parsedIntent?.action,
            amount: intent.parsedIntent?.amount,
            currency: intent.parsedIntent?.currency,
            description: intent.rawInput,
          }
        : null,
      createdAt: request.createdAt,
      requiresApproval: request.status === "awaiting_approval",
    };
  },
});

/**
 * Get bridge metrics
 */
export const getBridgeMetrics = query({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const requests = await ctx.db
      .query("signingRequests")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .collect();

    const confirmed = requests.filter((r) => r.status === "confirmed");
    const failed = requests.filter((r) => r.status === "failed" || r.status === "rejected");

    const avgConfirmationTime =
      confirmed.length > 0
        ? confirmed.reduce((sum, r) => sum + (r.confirmationTimeMs || 0), 0) / confirmed.length
        : 0;

    return {
      totalRequests: requests.length,
      confirmed: confirmed.length,
      failed: failed.length,
      pending: requests.filter((r) => ["pending", "awaiting_approval", "signing", "submitted"].includes(r.status)).length,
      successRate: requests.length > 0 ? (confirmed.length / requests.length) * 100 : 100,
      avgConfirmationTimeMs: Math.round(avgConfirmationTime),
      alpenglowCompliance: confirmed.filter((r) => (r.confirmationTimeMs || 0) <= 150).length,
    };
  },
});
