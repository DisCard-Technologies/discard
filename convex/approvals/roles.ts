/**
 * Organization Roles and Permissions
 *
 * Role-based access control for multi-sig organizations.
 * Defines permission maps and membership management functions.
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
// Permission Definitions
// ============================================================================

/**
 * Permission map per role.
 * Higher roles inherit all lower-role permissions.
 */
export const ROLE_PERMISSIONS: Record<string, string[]> = {
  viewer: [
    "view_transactions",
    "view_audit",
    "view_policies",
  ],
  operator: [
    "view_transactions",
    "view_audit",
    "view_policies",
    "approve_tx",
    "create_intent",
  ],
  admin: [
    "view_transactions",
    "view_audit",
    "view_policies",
    "approve_tx",
    "create_intent",
    "manage_policy",
    "manage_members",
    "manage_breakers",
  ],
  auditor: [
    "view_transactions",
    "view_audit",
    "view_policies",
    "export_data",
    "verify_chain",
  ],
};

const roleValidator = v.union(
  v.literal("viewer"),
  v.literal("operator"),
  v.literal("admin"),
  v.literal("auditor")
);

const memberStatusValidator = v.union(
  v.literal("active"),
  v.literal("suspended"),
  v.literal("revoked")
);

// ============================================================================
// Queries
// ============================================================================

/**
 * Get all members for an organization
 */
export const getMembersForOrg = query({
  args: { organizationId: v.id("turnkeyOrganizations") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("organizationMembers")
      .withIndex("by_org", (q) => q.eq("organizationId", args.organizationId))
      .collect();
  },
});

/**
 * Check if a user has a specific permission in an organization
 */
export const checkPermission = internalQuery({
  args: {
    organizationId: v.id("turnkeyOrganizations"),
    userId: v.id("users"),
    permission: v.string(),
  },
  handler: async (ctx, args) => {
    const member = await ctx.db
      .query("organizationMembers")
      .withIndex("by_org_user", (q) =>
        q.eq("organizationId", args.organizationId).eq("userId", args.userId)
      )
      .first();

    if (!member || member.status !== "active") {
      return { allowed: false, reason: "Not an active member" };
    }

    const hasPermission = member.permissions.includes(args.permission);
    return {
      allowed: hasPermission,
      reason: hasPermission ? "Permitted" : `Role '${member.role}' lacks '${args.permission}'`,
      role: member.role,
    };
  },
});

/**
 * Get a specific member's role in an organization
 */
export const getMemberRole = internalQuery({
  args: {
    organizationId: v.id("turnkeyOrganizations"),
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const member = await ctx.db
      .query("organizationMembers")
      .withIndex("by_org_user", (q) =>
        q.eq("organizationId", args.organizationId).eq("userId", args.userId)
      )
      .first();

    if (!member || member.status !== "active") {
      return null;
    }

    return { role: member.role, permissions: member.permissions };
  },
});

// ============================================================================
// Mutations
// ============================================================================

/**
 * Add a member to an organization
 */
export const addMember = mutation({
  args: {
    organizationId: v.id("turnkeyOrganizations"),
    userId: v.id("users"),
    role: roleValidator,
    addedBy: v.id("users"),
  },
  handler: async (ctx, args) => {
    // Check if already a member
    const existing = await ctx.db
      .query("organizationMembers")
      .withIndex("by_org_user", (q) =>
        q.eq("organizationId", args.organizationId).eq("userId", args.userId)
      )
      .first();

    if (existing && existing.status === "active") {
      throw new Error("User is already an active member of this organization");
    }

    const now = Date.now();
    const permissions = ROLE_PERMISSIONS[args.role] || [];

    const id = await ctx.db.insert("organizationMembers", {
      organizationId: args.organizationId,
      userId: args.userId,
      role: args.role,
      permissions,
      addedBy: args.addedBy,
      status: "active",
      createdAt: now,
      updatedAt: now,
    });

    // Log audit event
    await ctx.scheduler.runAfter(0, internal.audit.auditLog.logEvent, {
      userId: args.addedBy,
      eventType: "member_added",
      eventData: {
        action: "member_added",
        targetId: args.userId,
        metadata: {
          organizationId: args.organizationId,
          role: args.role,
          newMemberId: args.userId,
        },
      },
    });

    return { memberId: id, role: args.role };
  },
});

/**
 * Remove a member from an organization
 */
export const removeMember = mutation({
  args: {
    organizationId: v.id("turnkeyOrganizations"),
    userId: v.id("users"),
    removedBy: v.id("users"),
  },
  handler: async (ctx, args) => {
    const member = await ctx.db
      .query("organizationMembers")
      .withIndex("by_org_user", (q) =>
        q.eq("organizationId", args.organizationId).eq("userId", args.userId)
      )
      .first();

    if (!member) {
      throw new Error("Member not found in organization");
    }

    const now = Date.now();

    await ctx.db.patch(member._id, {
      status: "revoked",
      updatedAt: now,
    });

    // Log audit event
    await ctx.scheduler.runAfter(0, internal.audit.auditLog.logEvent, {
      userId: args.removedBy,
      eventType: "member_removed",
      eventData: {
        action: "member_removed",
        targetId: args.userId,
        metadata: {
          organizationId: args.organizationId,
          removedMemberId: args.userId,
          previousRole: member.role,
        },
      },
    });

    return { success: true };
  },
});

/**
 * Update a member's role
 */
export const updateRole = mutation({
  args: {
    organizationId: v.id("turnkeyOrganizations"),
    userId: v.id("users"),
    newRole: roleValidator,
    updatedBy: v.id("users"),
  },
  handler: async (ctx, args) => {
    const member = await ctx.db
      .query("organizationMembers")
      .withIndex("by_org_user", (q) =>
        q.eq("organizationId", args.organizationId).eq("userId", args.userId)
      )
      .first();

    if (!member || member.status !== "active") {
      throw new Error("Active member not found");
    }

    const previousRole = member.role;
    const newPermissions = ROLE_PERMISSIONS[args.newRole] || [];
    const now = Date.now();

    await ctx.db.patch(member._id, {
      role: args.newRole,
      permissions: newPermissions,
      updatedAt: now,
    });

    // Log audit event
    await ctx.scheduler.runAfter(0, internal.audit.auditLog.logEvent, {
      userId: args.updatedBy,
      eventType: "role_changed",
      eventData: {
        action: "role_changed",
        targetId: args.userId,
        metadata: {
          organizationId: args.organizationId,
          previousRole,
          newRole: args.newRole,
        },
      },
    });

    return { success: true, previousRole, newRole: args.newRole };
  },
});
