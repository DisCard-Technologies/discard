/**
 * DisCard 2035 - Approval Queue Management
 *
 * Gate 3 in the Intent → Plan → Validate → Execute flow.
 * Manages the approval queue with preview data and countdown functionality.
 *
 * Key features:
 * - Human-readable previews for approval UI
 * - Auto-approve countdown with cancel capability
 * - Manual approve/reject for high-value transactions
 * - Scheduled auto-approval processing
 */

import { v } from "convex/values";
import {
  mutation,
  query,
  internalMutation,
  internalQuery,
  action,
} from "../_generated/server";
import { internal } from "../_generated/api";
import { Id } from "../_generated/dataModel";

// ============================================================================
// Type Validators
// ============================================================================

const previewValidator = v.object({
  goalRecap: v.string(),
  stepsPreview: v.array(v.object({
    description: v.string(),
    estimatedCostUsd: v.string(),
    riskLevel: v.string(),
  })),
  totalMaxSpendUsd: v.string(),
  estimatedFeesUsd: v.string(),
  expectedOutcome: v.string(),
  warnings: v.array(v.string()),
});

// ============================================================================
// Queries
// ============================================================================

/**
 * Get pending approvals for a user
 */
export const getPendingApprovals = query({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const approvals = await ctx.db
      .query("approvalQueue")
      .withIndex("by_user_status", (q) =>
        q.eq("userId", args.userId).eq("status", "pending")
      )
      .collect();

    // Also get those counting down
    const countingDown = await ctx.db
      .query("approvalQueue")
      .withIndex("by_user_status", (q) =>
        q.eq("userId", args.userId).eq("status", "counting_down")
      )
      .collect();

    return [...approvals, ...countingDown];
  },
});

/**
 * Get a specific approval by ID
 */
export const getApproval = query({
  args: { approvalId: v.id("approvalQueue") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.approvalId);
  },
});

/**
 * Get approval by plan ID
 */
export const getApprovalByPlan = query({
  args: { planId: v.id("executionPlans") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("approvalQueue")
      .withIndex("by_plan", (q) => q.eq("planId", args.planId))
      .first();
  },
});

/**
 * Get approval history for a user
 */
export const getApprovalHistory = query({
  args: {
    userId: v.id("users"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 50;

    const approvals = await ctx.db
      .query("approvalQueue")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .order("desc")
      .take(limit);

    return approvals;
  },
});

/**
 * Get approvals ready for auto-approval processing
 * (Internal query for scheduled job)
 */
export const getAutoApprovalsDue = internalQuery({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();

    // Get all counting_down approvals where autoApproveAt has passed
    const allCountingDown = await ctx.db
      .query("approvalQueue")
      .withIndex("by_status", (q) => q.eq("status", "counting_down"))
      .collect();

    // Filter to those that are due
    return allCountingDown.filter(
      (a) => a.autoApproveAt && a.autoApproveAt <= now
    );
  },
});

// ============================================================================
// Mutations
// ============================================================================

/**
 * Create a new approval request (internal version for safety flow)
 */
export const createApproval = internalMutation({
  args: {
    userId: v.id("users"),
    planId: v.id("executionPlans"),
    intentId: v.id("intents"),
    preview: previewValidator,
    approvalMode: v.union(v.literal("auto"), v.literal("manual")),
    countdownDurationMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const expiresAt = now + 5 * 60 * 1000; // 5-minute expiry for pending approvals

    // Calculate auto-approve timestamp if auto mode
    let autoApproveAt: number | undefined;
    if (args.approvalMode === "auto" && args.countdownDurationMs) {
      autoApproveAt = now + args.countdownDurationMs;
    }

    const approvalId = await ctx.db.insert("approvalQueue", {
      userId: args.userId,
      planId: args.planId,
      intentId: args.intentId,
      preview: args.preview,
      approvalMode: args.approvalMode,
      countdownStartedAt: args.approvalMode === "auto" ? now : undefined,
      countdownDurationMs: args.countdownDurationMs,
      autoApproveAt,
      status: args.approvalMode === "auto" ? "counting_down" : "pending",
      createdAt: now,
      expiresAt,
    });

    // If auto mode, schedule the auto-approval check
    if (args.approvalMode === "auto" && args.countdownDurationMs) {
      await ctx.scheduler.runAfter(
        args.countdownDurationMs,
        internal.approvals.approvals.processAutoApproval,
        { approvalId }
      );
    }

    // Update execution plan status
    await ctx.db.patch(args.planId, {
      status: "awaiting_approval",
    });

    return { approvalId, status: args.approvalMode === "auto" ? "counting_down" : "pending" };
  },
});

/**
 * User approves an approval request
 */
export const approve = mutation({
  args: {
    approvalId: v.id("approvalQueue"),
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const approval = await ctx.db.get(args.approvalId);

    if (!approval) {
      throw new Error("Approval not found");
    }

    if (approval.userId !== args.userId) {
      throw new Error("Unauthorized: approval belongs to different user");
    }

    if (approval.status !== "pending" && approval.status !== "counting_down") {
      throw new Error(`Cannot approve: current status is ${approval.status}`);
    }

    const now = Date.now();

    // Update approval status
    await ctx.db.patch(args.approvalId, {
      status: "approved",
      approvedBy: "user",
      resolvedAt: now,
    });

    // Update execution plan status
    await ctx.db.patch(approval.planId, {
      status: "approved",
      approvedAt: now,
    });

    // Log audit event
    await logApprovalEvent(ctx, approval.userId, {
      eventType: "approval_granted",
      intentId: approval.intentId,
      planId: approval.planId,
      approvalId: args.approvalId,
      approvedBy: "user",
    });

    // Schedule execution
    await ctx.scheduler.runAfter(0, internal.intents.executor.executeFromPlan, {
      planId: approval.planId,
    });

    return { success: true, status: "approved" };
  },
});

/**
 * User rejects an approval request
 */
export const reject = mutation({
  args: {
    approvalId: v.id("approvalQueue"),
    userId: v.id("users"),
    reason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const approval = await ctx.db.get(args.approvalId);

    if (!approval) {
      throw new Error("Approval not found");
    }

    if (approval.userId !== args.userId) {
      throw new Error("Unauthorized: approval belongs to different user");
    }

    if (approval.status !== "pending" && approval.status !== "counting_down") {
      throw new Error(`Cannot reject: current status is ${approval.status}`);
    }

    const now = Date.now();

    // Update approval status
    await ctx.db.patch(args.approvalId, {
      status: "rejected",
      rejectionReason: args.reason,
      resolvedAt: now,
    });

    // Update execution plan status
    await ctx.db.patch(approval.planId, {
      status: "cancelled",
    });

    // Update intent status
    await ctx.db.patch(approval.intentId, {
      status: "cancelled",
      updatedAt: now,
    });

    // Log audit event
    await logApprovalEvent(ctx, approval.userId, {
      eventType: "approval_rejected",
      intentId: approval.intentId,
      planId: approval.planId,
      approvalId: args.approvalId,
      reason: args.reason,
    });

    return { success: true, status: "rejected" };
  },
});

/**
 * User cancels countdown during auto-approval
 */
export const cancelCountdown = mutation({
  args: {
    approvalId: v.id("approvalQueue"),
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const approval = await ctx.db.get(args.approvalId);

    if (!approval) {
      throw new Error("Approval not found");
    }

    if (approval.userId !== args.userId) {
      throw new Error("Unauthorized: approval belongs to different user");
    }

    if (approval.status !== "counting_down") {
      throw new Error(`Cannot cancel countdown: current status is ${approval.status}`);
    }

    const now = Date.now();

    // Update approval status to cancelled
    await ctx.db.patch(args.approvalId, {
      status: "cancelled",
      resolvedAt: now,
    });

    // Update execution plan status
    await ctx.db.patch(approval.planId, {
      status: "cancelled",
    });

    // Update intent status
    await ctx.db.patch(approval.intentId, {
      status: "cancelled",
      updatedAt: now,
    });

    // Log audit event
    await logApprovalEvent(ctx, approval.userId, {
      eventType: "countdown_cancelled",
      intentId: approval.intentId,
      planId: approval.planId,
      approvalId: args.approvalId,
    });

    return { success: true, status: "cancelled" };
  },
});

/**
 * Process auto-approval when countdown expires (internal mutation)
 */
export const processAutoApproval = internalMutation({
  args: { approvalId: v.id("approvalQueue") },
  handler: async (ctx, args) => {
    const approval = await ctx.db.get(args.approvalId);

    if (!approval) {
      console.log(`[AutoApproval] Approval ${args.approvalId} not found, skipping`);
      return;
    }

    // Only process if still counting down
    if (approval.status !== "counting_down") {
      console.log(`[AutoApproval] Approval ${args.approvalId} no longer counting down (status: ${approval.status}), skipping`);
      return;
    }

    const now = Date.now();

    // Verify countdown has actually expired
    if (approval.autoApproveAt && approval.autoApproveAt > now) {
      console.log(`[AutoApproval] Approval ${args.approvalId} not yet due, skipping`);
      return;
    }

    // Check if expired
    if (approval.expiresAt < now) {
      await ctx.db.patch(args.approvalId, {
        status: "expired",
        resolvedAt: now,
      });

      await ctx.db.patch(approval.planId, {
        status: "cancelled",
      });

      console.log(`[AutoApproval] Approval ${args.approvalId} expired`);
      return;
    }

    // Auto-approve
    await ctx.db.patch(args.approvalId, {
      status: "approved",
      approvedBy: "auto",
      resolvedAt: now,
    });

    // Update execution plan status
    await ctx.db.patch(approval.planId, {
      status: "approved",
      approvedAt: now,
    });

    // Log audit event
    await logApprovalEvent(ctx, approval.userId, {
      eventType: "approval_granted",
      intentId: approval.intentId,
      planId: approval.planId,
      approvalId: args.approvalId,
      approvedBy: "auto",
    });

    // Schedule execution
    await ctx.scheduler.runAfter(0, internal.intents.executor.executeFromPlan, {
      planId: approval.planId,
    });

    console.log(`[AutoApproval] Approval ${args.approvalId} auto-approved`);
  },
});

/**
 * Clean up expired approvals (internal mutation)
 */
export const cleanupExpiredApprovals = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();

    // Find expired pending approvals
    const pendingApprovals = await ctx.db
      .query("approvalQueue")
      .withIndex("by_status", (q) => q.eq("status", "pending"))
      .collect();

    const expired = pendingApprovals.filter((a) => a.expiresAt < now);

    for (const approval of expired) {
      await ctx.db.patch(approval._id, {
        status: "expired",
        resolvedAt: now,
      });

      await ctx.db.patch(approval.planId, {
        status: "cancelled",
      });
    }

    console.log(`[Cleanup] Expired ${expired.length} approvals`);
    return { expiredCount: expired.length };
  },
});

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Format cents to USD string
 */
export function formatCentsToUsd(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

/**
 * Build a preview object from plan data
 */
export function buildPreview(plan: {
  goalRecap: string;
  steps: Array<{
    description: string;
    estimatedCost: { maxSpendCents: number; riskLevel: string };
  }>;
  totalMaxSpendCents: number;
  totalEstimatedFeeCents: number;
  expectedOutcome?: string;
  warnings?: string[];
}): {
  goalRecap: string;
  stepsPreview: Array<{ description: string; estimatedCostUsd: string; riskLevel: string }>;
  totalMaxSpendUsd: string;
  estimatedFeesUsd: string;
  expectedOutcome: string;
  warnings: string[];
} {
  return {
    goalRecap: plan.goalRecap,
    stepsPreview: plan.steps.map((step) => ({
      description: step.description,
      estimatedCostUsd: formatCentsToUsd(step.estimatedCost.maxSpendCents),
      riskLevel: step.estimatedCost.riskLevel,
    })),
    totalMaxSpendUsd: formatCentsToUsd(plan.totalMaxSpendCents),
    estimatedFeesUsd: formatCentsToUsd(plan.totalEstimatedFeeCents),
    expectedOutcome: plan.expectedOutcome || "Transaction will be executed as planned",
    warnings: plan.warnings || [],
  };
}

/**
 * Log an approval-related audit event
 */
async function logApprovalEvent(
  ctx: any,
  userId: Id<"users">,
  event: {
    eventType: string;
    intentId: Id<"intents">;
    planId: Id<"executionPlans">;
    approvalId: Id<"approvalQueue">;
    approvedBy?: string;
    reason?: string;
  }
) {
  // Get last audit log entry for sequence number
  const lastEntry = await ctx.db
    .query("auditLog")
    .withIndex("by_user", (q: any) => q.eq("userId", userId))
    .order("desc")
    .first();

  const sequence = lastEntry ? lastEntry.sequence + 1 : 1;
  const previousHash = lastEntry ? lastEntry.eventHash : "genesis";

  // Create event data
  const eventData = {
    approvedBy: event.approvedBy,
    reason: event.reason,
    metadata: {},
  };

  // Calculate event hash (simplified - in production use proper SHA-256)
  const eventHash = `${userId}-${sequence}-${event.eventType}-${Date.now()}`;

  await ctx.db.insert("auditLog", {
    userId,
    eventId: `audit-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    sequence,
    eventType: event.eventType as any,
    intentId: event.intentId,
    planId: event.planId,
    approvalId: event.approvalId,
    eventData,
    previousHash,
    eventHash,
    anchoredToChain: false,
    timestamp: Date.now(),
  });
}

// ============================================================================
// Countdown Calculation
// ============================================================================

/**
 * Calculate countdown duration based on amount
 *
 * Formula:
 * - Base: 5 seconds
 * - Add: 1 second per $10 (100ms per dollar)
 * - Max: 30 seconds
 */
export function calculateCountdownDuration(
  amountCents: number,
  config?: {
    baseDurationMs?: number;
    perDollarMs?: number;
    maxDurationMs?: number;
  }
): number {
  const baseDurationMs = config?.baseDurationMs ?? 5000;
  const perDollarMs = config?.perDollarMs ?? 100;
  const maxDurationMs = config?.maxDurationMs ?? 30000;

  const amountDollars = amountCents / 100;
  const additionalMs = Math.floor(amountDollars / 10) * (perDollarMs * 10);
  const totalMs = baseDurationMs + additionalMs;

  return Math.min(totalMs, maxDurationMs);
}
