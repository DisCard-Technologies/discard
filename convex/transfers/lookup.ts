/**
 * DisCard 2035 - Contact Discovery & Lookup
 *
 * Convex functions for discovering DisCard users by phone/email.
 * Used by the P2P transfer flow to find recipients.
 */

import { v } from "convex/values";
import { query, mutation } from "../_generated/server";

// ============================================================================
// Types
// ============================================================================

export interface DiscoveredUser {
  userId: string;
  displayName: string | null;
  solanaAddress: string | null;
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Normalize phone number to E.164 format
 * Assumes input is already in E.164 format (starts with +)
 */
function normalizePhone(phone: string): string {
  // Remove any whitespace
  return phone.trim().replace(/\s+/g, "");
}

/**
 * Normalize email to lowercase
 */
function normalizeEmail(email: string): string {
  return email.toLowerCase().trim();
}

// ============================================================================
// Queries
// ============================================================================

/**
 * Find a DisCard user by phone number
 */
export const findByPhone = query({
  args: { phoneNumber: v.string() },
  handler: async (ctx, args): Promise<DiscoveredUser | null> => {
    const normalized = normalizePhone(args.phoneNumber);

    const user = await ctx.db
      .query("users")
      .withIndex("by_phone_number", (q) => q.eq("phoneNumber", normalized))
      .first();

    if (!user) {
      return null;
    }

    return {
      userId: user._id,
      displayName: user.displayName ?? null,
      solanaAddress: user.solanaAddress ?? null,
    };
  },
});

/**
 * Find a DisCard user by email
 */
export const findByEmail = query({
  args: { email: v.string() },
  handler: async (ctx, args): Promise<DiscoveredUser | null> => {
    const normalized = normalizeEmail(args.email);

    const user = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", normalized))
      .first();

    if (!user) {
      return null;
    }

    return {
      userId: user._id,
      displayName: user.displayName ?? null,
      solanaAddress: user.solanaAddress ?? null,
    };
  },
});

/**
 * Batch lookup for multiple phone numbers and emails
 * Useful for syncing device contacts
 */
export const batchLookup = query({
  args: {
    phoneNumbers: v.optional(v.array(v.string())),
    emails: v.optional(v.array(v.string())),
  },
  handler: async (
    ctx,
    args
  ): Promise<{
    byPhone: Record<string, DiscoveredUser>;
    byEmail: Record<string, DiscoveredUser>;
  }> => {
    const result: {
      byPhone: Record<string, DiscoveredUser>;
      byEmail: Record<string, DiscoveredUser>;
    } = {
      byPhone: {},
      byEmail: {},
    };

    // Look up phone numbers
    if (args.phoneNumbers) {
      for (const phone of args.phoneNumbers) {
        const normalized = normalizePhone(phone);
        const user = await ctx.db
          .query("users")
          .withIndex("by_phone_number", (q) => q.eq("phoneNumber", normalized))
          .first();

        if (user) {
          result.byPhone[phone] = {
            userId: user._id,
            displayName: user.displayName ?? null,
            solanaAddress: user.solanaAddress ?? null,
          };
        }
      }
    }

    // Look up emails
    if (args.emails) {
      for (const email of args.emails) {
        const normalized = normalizeEmail(email);
        const user = await ctx.db
          .query("users")
          .withIndex("by_email", (q) => q.eq("email", normalized))
          .first();

        if (user) {
          result.byEmail[email] = {
            userId: user._id,
            displayName: user.displayName ?? null,
            solanaAddress: user.solanaAddress ?? null,
          };
        }
      }
    }

    return result;
  },
});

// ============================================================================
// Mutations
// ============================================================================

/**
 * Link a phone number to the current user's account
 */
export const linkPhoneNumber = mutation({
  args: { phoneNumber: v.string() },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }

    // Normalize phone number
    const normalized = normalizePhone(args.phoneNumber);

    // Validate E.164 format
    if (!/^\+[1-9]\d{6,14}$/.test(normalized)) {
      throw new Error("Invalid phone number format. Use E.164 format (e.g., +14155551234)");
    }

    // Check if phone number is already in use
    const existing = await ctx.db
      .query("users")
      .withIndex("by_phone_number", (q) => q.eq("phoneNumber", normalized))
      .first();

    if (existing) {
      throw new Error("Phone number already in use by another account");
    }

    // Get current user
    const user = await ctx.db
      .query("users")
      .withIndex("by_credential", (q) => q.eq("credentialId", identity.subject))
      .first();

    if (!user) {
      throw new Error("User not found");
    }

    // Update user with phone number
    await ctx.db.patch(user._id, { phoneNumber: normalized });

    return { success: true };
  },
});

/**
 * Unlink phone number from current user's account
 */
export const unlinkPhoneNumber = mutation({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }

    // Get current user
    const user = await ctx.db
      .query("users")
      .withIndex("by_credential", (q) => q.eq("credentialId", identity.subject))
      .first();

    if (!user) {
      throw new Error("User not found");
    }

    // Remove phone number
    await ctx.db.patch(user._id, { phoneNumber: undefined });

    return { success: true };
  },
});
