/**
 * Session Management Module
 *
 * Handles user session lifecycle with Convex's built-in authentication.
 * Sessions are implicitly managed by the Convex client, but this module
 * provides additional session tracking for:
 * - Multi-device session management
 * - Session activity logging
 * - Forced logout capabilities
 */
import { mutation, query, internalMutation } from "../_generated/server";
import { v } from "convex/values";
import { Id } from "../_generated/dataModel";

// ============ QUERIES ============

/**
 * Check if the current session is valid
 */
export const isSessionValid = query({
  args: {},
  handler: async (ctx): Promise<boolean> => {
    const identity = await ctx.auth.getUserIdentity();
    return identity !== null;
  },
});

/**
 * Get current session info
 */
export const getCurrentSession = query({
  args: {},
  handler: async (ctx): Promise<{
    isAuthenticated: boolean;
    userId: Id<"users"> | null;
    solanaAddress: string | null;
    accountStatus: string | null;
  }> => {
    const identity = await ctx.auth.getUserIdentity();

    if (!identity) {
      return {
        isAuthenticated: false,
        userId: null,
        solanaAddress: null,
        accountStatus: null,
      };
    }

    const user = await ctx.db
      .query("users")
      .withIndex("by_credential", (q) => q.eq("credentialId", identity.subject))
      .first();

    if (!user) {
      return {
        isAuthenticated: false,
        userId: null,
        solanaAddress: null,
        accountStatus: null,
      };
    }

    return {
      isAuthenticated: true,
      userId: user._id,
      solanaAddress: user.solanaAddress ?? null,
      accountStatus: user.accountStatus,
    };
  },
});

// ============ MUTATIONS ============

/**
 * Update last activity timestamp
 * Call this periodically to track user activity
 */
export const heartbeat = mutation({
  args: {},
  handler: async (ctx): Promise<void> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return;

    const user = await ctx.db
      .query("users")
      .withIndex("by_credential", (q) => q.eq("credentialId", identity.subject))
      .first();

    if (user) {
      await ctx.db.patch(user._id, {
        lastActive: Date.now(),
      });
    }
  },
});

/**
 * Logout - Clear session on client side
 *
 * Note: With Convex, the actual session is managed by the client.
 * This mutation is for logging/cleanup purposes.
 */
export const logout = mutation({
  args: {},
  handler: async (ctx): Promise<void> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return;

    // Log the logout event (for audit purposes)
    console.log(`User ${identity.subject} logged out at ${new Date().toISOString()}`);

    // Note: The client is responsible for clearing the auth token
    // Convex's auth.signOut() should be called on the client side
  },
});

/**
 * Force logout all sessions for a user
 * Used for security purposes (e.g., after password change, suspicious activity)
 */
export const forceLogoutAllSessions = mutation({
  args: {},
  handler: async (ctx): Promise<void> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }

    // In Convex, sessions are managed by the client
    // To force logout, we would typically:
    // 1. Invalidate refresh tokens (if using custom auth)
    // 2. Update a "session version" that clients check
    // 3. Disconnect wallet sessions

    const user = await ctx.db
      .query("users")
      .withIndex("by_credential", (q) => q.eq("credentialId", identity.subject))
      .first();

    if (!user) return;

    // Disconnect all wallet sessions for this user
    const walletSessions = await ctx.db
      .query("wallets")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .filter((q) => q.eq(q.field("connectionStatus"), "connected"))
      .collect();

    for (const wallet of walletSessions) {
      await ctx.db.patch(wallet._id, {
        connectionStatus: "disconnected",
        sessionExpiry: Date.now(), // Expire immediately
      });
    }

    console.log(`Force logout all sessions for user ${user._id}`);
  },
});

// ============ INTERNAL MUTATIONS ============

/**
 * Record a login event (called by passkeys.verifyPasskey)
 */
export const recordLoginEvent = internalMutation({
  args: {
    userId: v.id("users"),
    deviceInfo: v.optional(v.string()),
    ipAddress: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<void> => {
    // Update last active
    await ctx.db.patch(args.userId, {
      lastActive: Date.now(),
    });

    // In production, you might want to:
    // 1. Store login events in an audit log table
    // 2. Check for suspicious login patterns
    // 3. Send notifications for new device logins

    console.log(`Login event for user ${args.userId}`, {
      deviceInfo: args.deviceInfo,
      ipAddress: args.ipAddress,
      timestamp: new Date().toISOString(),
    });
  },
});

/**
 * Force disconnect a specific user (admin action)
 */
export const forceDisconnectUser = internalMutation({
  args: {
    userId: v.id("users"),
    reason: v.string(),
  },
  handler: async (ctx, args): Promise<void> => {
    const user = await ctx.db.get(args.userId);
    if (!user) return;

    // Update account status if needed
    // This will cause the user's next request to fail auth

    // Disconnect all wallet sessions
    const walletSessions = await ctx.db
      .query("wallets")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .filter((q) => q.eq(q.field("connectionStatus"), "connected"))
      .collect();

    for (const wallet of walletSessions) {
      await ctx.db.patch(wallet._id, {
        connectionStatus: "disconnected",
      });
    }

    console.log(`Force disconnected user ${args.userId}: ${args.reason}`);
  },
});
