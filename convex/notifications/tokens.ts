/**
 * Push Notification Token Management
 *
 * Handles registration, preferences, and lifecycle of Expo push tokens.
 */
import { v } from "convex/values";
import { mutation, query, internalQuery, internalMutation } from "../_generated/server";
import { Doc, Id } from "../_generated/dataModel";

// ============================================================================
// Public Mutations
// ============================================================================

/**
 * Register a new push token for the current user
 */
export const register = mutation({
  args: {
    expoPushToken: v.string(),
    deviceId: v.string(),
    platform: v.union(v.literal("ios"), v.literal("android")),
    deviceName: v.optional(v.string()),
    appVersion: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }

    const user = await ctx.db
      .query("users")
      .withIndex("by_credential", (q) => q.eq("credentialId", identity.subject))
      .first();

    if (!user) {
      throw new Error("User not found");
    }

    const now = Date.now();

    // Check if this device already has a token registered
    const existingToken = await ctx.db
      .query("pushTokens")
      .withIndex("by_device", (q) => q.eq("deviceId", args.deviceId))
      .first();

    if (existingToken) {
      // Update existing token
      await ctx.db.patch(existingToken._id, {
        expoPushToken: args.expoPushToken,
        userId: user._id,
        platform: args.platform,
        status: "active",
        deviceName: args.deviceName,
        appVersion: args.appVersion,
        updatedAt: now,
      });

      console.log("[PushTokens] Updated token for device:", args.deviceId);
      return existingToken._id;
    }

    // Create new token with default preferences
    const tokenId = await ctx.db.insert("pushTokens", {
      userId: user._id,
      expoPushToken: args.expoPushToken,
      deviceId: args.deviceId,
      platform: args.platform,
      status: "active",
      preferences: {
        cryptoReceipts: true,
        goalMilestones: true,
        agentActivity: true,
        fraudAlerts: true, // Always enabled by default for security
      },
      deviceName: args.deviceName,
      appVersion: args.appVersion,
      createdAt: now,
      updatedAt: now,
    });

    console.log("[PushTokens] Registered new token for user:", user._id);
    return tokenId;
  },
});

/**
 * Update notification preferences for a device
 */
export const updatePreferences = mutation({
  args: {
    deviceId: v.string(),
    preferences: v.object({
      cryptoReceipts: v.optional(v.boolean()),
      goalMilestones: v.optional(v.boolean()),
      agentActivity: v.optional(v.boolean()),
      fraudAlerts: v.optional(v.boolean()),
    }),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }

    const user = await ctx.db
      .query("users")
      .withIndex("by_credential", (q) => q.eq("credentialId", identity.subject))
      .first();

    if (!user) {
      throw new Error("User not found");
    }

    // Find the token for this device
    const token = await ctx.db
      .query("pushTokens")
      .withIndex("by_device", (q) => q.eq("deviceId", args.deviceId))
      .first();

    if (!token) {
      throw new Error("Push token not found for device");
    }

    // Verify ownership
    if (token.userId !== user._id) {
      throw new Error("Not authorized to update this token");
    }

    // Merge preferences
    const updatedPreferences = {
      cryptoReceipts: args.preferences.cryptoReceipts ?? token.preferences.cryptoReceipts,
      goalMilestones: args.preferences.goalMilestones ?? token.preferences.goalMilestones,
      agentActivity: args.preferences.agentActivity ?? token.preferences.agentActivity,
      fraudAlerts: args.preferences.fraudAlerts ?? token.preferences.fraudAlerts,
    };

    await ctx.db.patch(token._id, {
      preferences: updatedPreferences,
      updatedAt: Date.now(),
    });

    console.log("[PushTokens] Updated preferences for device:", args.deviceId);
    return { success: true };
  },
});

/**
 * Revoke/disable notifications for a device
 */
export const revoke = mutation({
  args: {
    deviceId: v.string(),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }

    const user = await ctx.db
      .query("users")
      .withIndex("by_credential", (q) => q.eq("credentialId", identity.subject))
      .first();

    if (!user) {
      throw new Error("User not found");
    }

    // Find the token for this device
    const token = await ctx.db
      .query("pushTokens")
      .withIndex("by_device", (q) => q.eq("deviceId", args.deviceId))
      .first();

    if (!token) {
      // No token to revoke
      return { success: true };
    }

    // Verify ownership
    if (token.userId !== user._id) {
      throw new Error("Not authorized to revoke this token");
    }

    await ctx.db.patch(token._id, {
      status: "revoked",
      updatedAt: Date.now(),
    });

    console.log("[PushTokens] Revoked token for device:", args.deviceId);
    return { success: true };
  },
});

// ============================================================================
// Public Queries
// ============================================================================

/**
 * Get push token for a device
 */
export const getByDevice = query({
  args: {
    deviceId: v.string(),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return null;
    }

    const user = await ctx.db
      .query("users")
      .withIndex("by_credential", (q) => q.eq("credentialId", identity.subject))
      .first();

    if (!user) {
      return null;
    }

    const token = await ctx.db
      .query("pushTokens")
      .withIndex("by_device", (q) => q.eq("deviceId", args.deviceId))
      .first();

    // Only return if owned by current user
    if (token && token.userId === user._id) {
      return token;
    }

    return null;
  },
});

/**
 * Get all push tokens for the current user
 */
export const listForUser = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return [];
    }

    const user = await ctx.db
      .query("users")
      .withIndex("by_credential", (q) => q.eq("credentialId", identity.subject))
      .first();

    if (!user) {
      return [];
    }

    return await ctx.db
      .query("pushTokens")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .collect();
  },
});

// ============================================================================
// Internal Queries (for notification sending)
// ============================================================================

/**
 * Get all active push tokens for a user (internal use)
 */
export const getActiveTokensForUser = internalQuery({
  args: {
    userId: v.id("users"),
  },
  handler: async (ctx, args): Promise<Doc<"pushTokens">[]> => {
    return await ctx.db
      .query("pushTokens")
      .withIndex("by_user_status", (q) =>
        q.eq("userId", args.userId).eq("status", "active")
      )
      .collect();
  },
});

/**
 * Get a token by its Expo push token string (for delivery status updates)
 */
export const getByExpoToken = internalQuery({
  args: {
    expoPushToken: v.string(),
  },
  handler: async (ctx, args): Promise<Doc<"pushTokens"> | null> => {
    return await ctx.db
      .query("pushTokens")
      .withIndex("by_token", (q) => q.eq("expoPushToken", args.expoPushToken))
      .first();
  },
});

// ============================================================================
// Internal Mutations
// ============================================================================

/**
 * Mark a token as invalid (called when Expo rejects it)
 */
export const markInvalid = internalMutation({
  args: {
    expoPushToken: v.string(),
  },
  handler: async (ctx, args) => {
    const token = await ctx.db
      .query("pushTokens")
      .withIndex("by_token", (q) => q.eq("expoPushToken", args.expoPushToken))
      .first();

    if (token) {
      await ctx.db.patch(token._id, {
        status: "invalid",
        updatedAt: Date.now(),
      });
      console.log("[PushTokens] Marked token as invalid:", args.expoPushToken);
    }
  },
});

/**
 * Update last used timestamp for a token
 */
export const updateLastUsed = internalMutation({
  args: {
    tokenId: v.id("pushTokens"),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.tokenId, {
      lastUsedAt: Date.now(),
    });
  },
});
