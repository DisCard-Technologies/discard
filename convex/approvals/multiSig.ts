/**
 * Multi-Sig Approval Logic
 *
 * M-of-N approval workflows for organizational accounts.
 * Single-user approval (existing flow) unchanged for personal accounts.
 * Multi-sig only activates when organizationId is present.
 */

import { v } from "convex/values";
import {
  mutation,
  query,
  internalMutation,
  internalQuery,
} from "../_generated/server";
import { internal } from "../_generated/api";

// ============================================================================
// Queries
// ============================================================================

/**
 * Get M-of-N approval config based on org policy and transaction amount.
 * Returns the quorum requirements for a given approval.
 */
export const getApprovalConfig = internalQuery({
  args: {
    organizationId: v.id("turnkeyOrganizations"),
    amountCents: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    // Get all active members who can vote (operators + admins)
    const members = await ctx.db
      .query("organizationMembers")
      .withIndex("by_org", (q) => q.eq("organizationId", args.organizationId))
      .collect();

    const activeVoters = members.filter(
      (m) =>
        m.status === "active" &&
        (m.role === "operator" || m.role === "admin")
    );

    const totalApprovers = activeVoters.length;

    // Default quorum: majority rule
    // For amounts > $10,000: require 2/3 supermajority
    // For amounts > $100,000: require all approvers
    const amount = args.amountCents ?? 0;
    let requiredApprovals: number;

    if (amount > 10_000_000) {
      // > $100k: unanimous
      requiredApprovals = totalApprovers;
    } else if (amount > 1_000_000) {
      // > $10k: 2/3 supermajority
      requiredApprovals = Math.ceil(totalApprovers * 2 / 3);
    } else {
      // Default: simple majority
      requiredApprovals = Math.ceil(totalApprovers / 2);
    }

    // Minimum 1 approval always required
    requiredApprovals = Math.max(1, requiredApprovals);

    return {
      requiredApprovals,
      totalApprovers,
      requiredRoles: amount > 1_000_000 ? ["admin"] : undefined,
    };
  },
});

/**
 * Get pending multi-sig approvals for a member across orgs
 */
export const getPendingForMember = query({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    // Get all orgs this user belongs to
    const memberships = await ctx.db
      .query("organizationMembers")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .collect();

    const activeOrgs = memberships
      .filter((m) => m.status === "active")
      .map((m) => m.organizationId);

    if (activeOrgs.length === 0) return [];

    // Get all pending multi-sig approvals for these orgs
    const pendingApprovals = await ctx.db
      .query("multiSigApprovals")
      .withIndex("by_status", (q) => q.eq("status", "pending"))
      .collect();

    // Filter to user's orgs and exclude already-voted
    return pendingApprovals.filter((a) => {
      if (!activeOrgs.includes(a.organizationId)) return false;
      // Exclude if user already voted
      const alreadyVoted = a.approvalVotes.some(
        (vote) => vote.userId === args.userId
      );
      return !alreadyVoted;
    });
  },
});

// ============================================================================
// Mutations
// ============================================================================

/**
 * Submit a vote on a multi-sig approval.
 * Checks quorum and transitions to approved/rejected when threshold reached.
 */
export const submitVote = mutation({
  args: {
    multiSigApprovalId: v.id("multiSigApprovals"),
    userId: v.id("users"),
    vote: v.union(
      v.literal("approve"),
      v.literal("reject"),
      v.literal("abstain")
    ),
    reason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const msApproval = await ctx.db.get(args.multiSigApprovalId);
    if (!msApproval) throw new Error("Multi-sig approval not found");

    if (msApproval.status !== "pending") {
      throw new Error(`Cannot vote: approval status is ${msApproval.status}`);
    }

    // Verify user is an active member with voting rights
    const member = await ctx.db
      .query("organizationMembers")
      .withIndex("by_org_user", (q) =>
        q.eq("organizationId", msApproval.organizationId).eq("userId", args.userId)
      )
      .first();

    if (!member || member.status !== "active") {
      throw new Error("Not an active member of this organization");
    }

    // Only operators and admins can vote
    if (member.role !== "operator" && member.role !== "admin") {
      throw new Error(`Role '${member.role}' cannot vote on approvals`);
    }

    // Check for duplicate votes
    const alreadyVoted = msApproval.approvalVotes.some(
      (v) => v.userId === args.userId
    );
    if (alreadyVoted) {
      throw new Error("Already voted on this approval");
    }

    const now = Date.now();

    // Add vote
    const newVotes = [
      ...msApproval.approvalVotes,
      {
        userId: args.userId,
        role: member.role,
        vote: args.vote,
        timestamp: now,
        reason: args.reason,
      },
    ];

    // Count approvals and rejections
    const approveCount = newVotes.filter((v) => v.vote === "approve").length;
    const rejectCount = newVotes.filter((v) => v.vote === "reject").length;
    const remainingVoters = msApproval.totalApprovers - newVotes.length;

    // Check role requirements
    let rolesSatisfied = true;
    if (msApproval.requiredRoles && msApproval.requiredRoles.length > 0) {
      for (const requiredRole of msApproval.requiredRoles) {
        const hasRoleVote = newVotes.some(
          (v) => v.role === requiredRole && v.vote === "approve"
        );
        if (!hasRoleVote) rolesSatisfied = false;
      }
    }

    // Determine outcome
    let newStatus = msApproval.status;

    if (approveCount >= msApproval.requiredApprovals && rolesSatisfied) {
      newStatus = "approved";
    } else if (rejectCount > msApproval.totalApprovers - msApproval.requiredApprovals) {
      // Mathematically impossible to reach quorum
      newStatus = "rejected";
    }

    // Update multi-sig approval
    await ctx.db.patch(args.multiSigApprovalId, {
      approvalVotes: newVotes,
      status: newStatus,
      updatedAt: now,
    });

    // Log vote audit event
    await ctx.scheduler.runAfter(0, internal.audit.auditLog.logEvent, {
      userId: args.userId,
      eventType: "multisig_vote_submitted",
      approvalId: msApproval.approvalId,
      eventData: {
        action: "multisig_vote_submitted",
        metadata: {
          vote: args.vote,
          approveCount,
          rejectCount,
          requiredApprovals: msApproval.requiredApprovals,
          organizationId: msApproval.organizationId,
        },
      },
    });

    // If quorum reached, also log threshold event and update parent approval
    if (newStatus === "approved") {
      await ctx.scheduler.runAfter(0, internal.audit.auditLog.logEvent, {
        userId: args.userId,
        eventType: "multisig_threshold_reached",
        approvalId: msApproval.approvalId,
        eventData: {
          action: "multisig_threshold_reached",
          metadata: {
            approveCount,
            requiredApprovals: msApproval.requiredApprovals,
            totalVotes: newVotes.length,
          },
        },
      });

      // Transition the parent approval to approved
      await ctx.db.patch(msApproval.approvalId, {
        status: "approved",
        approvedBy: "multisig",
        resolvedAt: now,
      });

      // Get parent approval to trigger execution
      const parentApproval = await ctx.db.get(msApproval.approvalId);
      if (parentApproval) {
        await ctx.db.patch(parentApproval.planId, {
          status: "approved",
          approvedAt: now,
        });

        await ctx.scheduler.runAfter(0, internal.intents.executor.executeFromPlan, {
          planId: parentApproval.planId,
        });
      }
    } else if (newStatus === "rejected") {
      // Reject the parent approval
      await ctx.db.patch(msApproval.approvalId, {
        status: "rejected",
        rejectionReason: "Multi-sig quorum rejected",
        resolvedAt: now,
      });

      const parentApproval = await ctx.db.get(msApproval.approvalId);
      if (parentApproval) {
        await ctx.db.patch(parentApproval.planId, {
          status: "cancelled",
        });
      }
    }

    return {
      success: true,
      vote: args.vote,
      approveCount,
      rejectCount,
      status: newStatus,
      quorumReached: newStatus === "approved",
    };
  },
});

/**
 * Check for stalled multi-sig approvals that need escalation.
 * Called periodically or on-demand.
 */
export const checkEscalations = internalMutation({
  args: {
    escalationTimeoutMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const timeoutMs = args.escalationTimeoutMs ?? 24 * 60 * 60 * 1000; // 24h default
    const cutoff = Date.now() - timeoutMs;

    // Find pending multi-sig approvals older than the timeout
    const pendingApprovals = await ctx.db
      .query("multiSigApprovals")
      .withIndex("by_status", (q) => q.eq("status", "pending"))
      .collect();

    const stalled = pendingApprovals.filter(
      (a) => a.createdAt < cutoff && !a.escalatedAt
    );

    const now = Date.now();

    for (const approval of stalled) {
      await ctx.db.patch(approval._id, {
        status: "escalated",
        escalatedAt: now,
        escalationReason: `No quorum reached within ${Math.round(timeoutMs / 3600000)}h`,
        updatedAt: now,
      });

      // Log escalation audit event
      await ctx.scheduler.runAfter(0, internal.audit.auditLog.logEvent, {
        userId: approval.approvalVotes[0]?.userId ?? ("system" as any),
        eventType: "multisig_escalated",
        approvalId: approval.approvalId,
        eventData: {
          action: "multisig_escalated",
          metadata: {
            organizationId: approval.organizationId,
            currentVotes: approval.approvalVotes.length,
            requiredApprovals: approval.requiredApprovals,
          },
        },
      });
    }

    return { escalatedCount: stalled.length };
  },
});
