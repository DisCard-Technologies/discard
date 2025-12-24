/**
 * DisCard 2035 - Merchant Whitelist/Blocklist Management
 *
 * Convex functions for managing merchant and MCC restrictions
 * that are enforced by Token-2022 transfer hooks.
 */

import { v } from "convex/values";
import {
  mutation,
  query,
  internalMutation,
  internalQuery,
} from "../_generated/server";
import { Id } from "../_generated/dataModel";

// ============================================================================
// MCC (Merchant Category Code) Categories
// ============================================================================

/**
 * Common MCC code categories for easy management
 */
const MCC_CATEGORIES = {
  // High-risk categories (commonly blocked)
  highRisk: [
    { code: "5933", name: "Pawn shops" },
    { code: "5944", name: "Jewelry stores" },
    { code: "5993", name: "Cigar stores" },
    { code: "6010", name: "Financial institutions - manual cash" },
    { code: "6011", name: "ATMs" },
    { code: "6012", name: "Financial institutions" },
    { code: "7273", name: "Dating services" },
    { code: "7995", name: "Gambling" },
  ],

  // Gambling
  gambling: [
    { code: "7800", name: "State lotteries" },
    { code: "7801", name: "Betting" },
    { code: "7802", name: "Horse racing" },
    { code: "7995", name: "Casinos" },
  ],

  // Travel
  travel: [
    { code: "3000", name: "Airlines" },
    { code: "4111", name: "Transportation - suburban/commuter" },
    { code: "4112", name: "Passenger railways" },
    { code: "4121", name: "Taxicabs" },
    { code: "4131", name: "Bus lines" },
    { code: "7011", name: "Lodging" },
  ],

  // Food & Dining
  foodAndDining: [
    { code: "5411", name: "Grocery stores" },
    { code: "5462", name: "Bakeries" },
    { code: "5812", name: "Restaurants" },
    { code: "5813", name: "Bars" },
    { code: "5814", name: "Fast food" },
  ],

  // Entertainment
  entertainment: [
    { code: "7832", name: "Movie theaters" },
    { code: "7911", name: "Dance halls" },
    { code: "7922", name: "Theatrical producers" },
    { code: "7929", name: "Bands" },
    { code: "7932", name: "Billiard halls" },
    { code: "7933", name: "Bowling alleys" },
    { code: "7941", name: "Athletic fields" },
    { code: "7991", name: "Tourist attractions" },
  ],

  // Retail
  retail: [
    { code: "5200", name: "Home supply warehouse" },
    { code: "5211", name: "Building materials" },
    { code: "5251", name: "Hardware stores" },
    { code: "5311", name: "Department stores" },
    { code: "5411", name: "Grocery stores" },
    { code: "5541", name: "Gas stations" },
    { code: "5651", name: "Family clothing" },
    { code: "5691", name: "Clothing stores" },
  ],

  // Online/Digital
  digitalGoods: [
    { code: "5815", name: "Digital goods - media" },
    { code: "5816", name: "Digital goods - games" },
    { code: "5817", name: "Digital goods - applications" },
    { code: "5818", name: "Digital goods - large retailer" },
  ],
};

// ============================================================================
// Queries
// ============================================================================

/**
 * Get merchant lists for a card
 */
export const getMerchantLists = query({
  args: { cardId: v.id("cards") },
  handler: async (ctx, args) => {
    const card = await ctx.db.get(args.cardId);
    if (!card) {
      return null;
    }

    const turnkeyOrg = await ctx.db
      .query("turnkeyOrganizations")
      .withIndex("by_user", (q) => q.eq("userId", card.userId))
      .first();

    if (!turnkeyOrg) {
      return {
        merchantWhitelistEnabled: false,
        merchantWhitelist: [],
        merchantBlocklist: [],
        mccWhitelistEnabled: false,
        mccWhitelist: [],
        mccBlocklist: [],
      };
    }

    return {
      merchantWhitelistEnabled: turnkeyOrg.policies.merchantLocking,
      merchantWhitelist: turnkeyOrg.policies.allowedMerchants ?? [],
      merchantBlocklist: turnkeyOrg.policies.blockedMerchants ?? [],
      mccWhitelistEnabled: false, // MCC whitelisting managed separately
      mccWhitelist: turnkeyOrg.policies.allowedMccCodes ?? [],
      mccBlocklist: turnkeyOrg.policies.blockedMccCodes ?? [],
    };
  },
});

/**
 * Get available MCC categories
 */
export const getMccCategories = query({
  args: {},
  handler: async () => {
    return MCC_CATEGORIES;
  },
});

/**
 * Check if a merchant/MCC is allowed for a card
 */
export const checkMerchantAllowed = query({
  args: {
    cardId: v.id("cards"),
    merchantId: v.optional(v.string()),
    mccCode: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const card = await ctx.db.get(args.cardId);
    if (!card) {
      return { allowed: false, reason: "Card not found" };
    }

    const turnkeyOrg = await ctx.db
      .query("turnkeyOrganizations")
      .withIndex("by_user", (q) => q.eq("userId", card.userId))
      .first();

    if (!turnkeyOrg) {
      return { allowed: true, reason: "No policy configured" };
    }

    const policies = turnkeyOrg.policies;

    // Check merchant whitelist
    if (policies.merchantLocking && args.merchantId) {
      const whitelist = policies.allowedMerchants ?? [];
      if (whitelist.length > 0 && !whitelist.includes(args.merchantId)) {
        return { allowed: false, reason: "Merchant not in whitelist" };
      }
    }

    // Check merchant blocklist
    if (args.merchantId) {
      const blocklist = policies.blockedMerchants ?? [];
      if (blocklist.includes(args.merchantId)) {
        return { allowed: false, reason: "Merchant is blocked" };
      }
    }

    // Check MCC whitelist
    if (args.mccCode) {
      const mccWhitelist = policies.allowedMccCodes ?? [];
      if (mccWhitelist.length > 0 && !mccWhitelist.includes(args.mccCode)) {
        return { allowed: false, reason: "MCC code not in whitelist" };
      }
    }

    // Check MCC blocklist
    if (args.mccCode) {
      const mccBlocklist = policies.blockedMccCodes ?? [];
      if (mccBlocklist.includes(args.mccCode)) {
        return { allowed: false, reason: "MCC code is blocked" };
      }
    }

    return { allowed: true, reason: null };
  },
});

// ============================================================================
// Mutations
// ============================================================================

/**
 * Enable/disable merchant locking
 */
export const setMerchantLocking = mutation({
  args: {
    cardId: v.id("cards"),
    enabled: v.boolean(),
  },
  handler: async (ctx, args) => {
    const card = await ctx.db.get(args.cardId);
    if (!card) {
      throw new Error("Card not found");
    }

    const turnkeyOrg = await ctx.db
      .query("turnkeyOrganizations")
      .withIndex("by_user", (q) => q.eq("userId", card.userId))
      .first();

    if (!turnkeyOrg) {
      throw new Error("Turnkey organization not found");
    }

    await ctx.db.patch(turnkeyOrg._id, {
      policies: {
        ...turnkeyOrg.policies,
        merchantLocking: args.enabled,
      },
      updatedAt: Date.now(),
    });

    return { success: true };
  },
});

/**
 * Add merchants to whitelist
 */
export const addToMerchantWhitelist = mutation({
  args: {
    cardId: v.id("cards"),
    merchantIds: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    const card = await ctx.db.get(args.cardId);
    if (!card) {
      throw new Error("Card not found");
    }

    const turnkeyOrg = await ctx.db
      .query("turnkeyOrganizations")
      .withIndex("by_user", (q) => q.eq("userId", card.userId))
      .first();

    if (!turnkeyOrg) {
      throw new Error("Turnkey organization not found");
    }

    const existing = turnkeyOrg.policies.allowedMerchants ?? [];
    const newMerchants = [...new Set([...existing, ...args.merchantIds])];

    // Check limit
    if (newMerchants.length > 50) {
      throw new Error("Merchant whitelist limit exceeded (max 50)");
    }

    await ctx.db.patch(turnkeyOrg._id, {
      policies: {
        ...turnkeyOrg.policies,
        allowedMerchants: newMerchants,
      },
      updatedAt: Date.now(),
    });

    return { success: true, count: newMerchants.length };
  },
});

/**
 * Remove merchants from whitelist
 */
export const removeFromMerchantWhitelist = mutation({
  args: {
    cardId: v.id("cards"),
    merchantIds: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    const card = await ctx.db.get(args.cardId);
    if (!card) {
      throw new Error("Card not found");
    }

    const turnkeyOrg = await ctx.db
      .query("turnkeyOrganizations")
      .withIndex("by_user", (q) => q.eq("userId", card.userId))
      .first();

    if (!turnkeyOrg) {
      throw new Error("Turnkey organization not found");
    }

    const existing = turnkeyOrg.policies.allowedMerchants ?? [];
    const removeSet = new Set(args.merchantIds);
    const newMerchants = existing.filter((m) => !removeSet.has(m));

    await ctx.db.patch(turnkeyOrg._id, {
      policies: {
        ...turnkeyOrg.policies,
        allowedMerchants: newMerchants,
      },
      updatedAt: Date.now(),
    });

    return { success: true, count: newMerchants.length };
  },
});

/**
 * Add merchants to blocklist
 */
export const addToMerchantBlocklist = mutation({
  args: {
    cardId: v.id("cards"),
    merchantIds: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    const card = await ctx.db.get(args.cardId);
    if (!card) {
      throw new Error("Card not found");
    }

    const turnkeyOrg = await ctx.db
      .query("turnkeyOrganizations")
      .withIndex("by_user", (q) => q.eq("userId", card.userId))
      .first();

    if (!turnkeyOrg) {
      throw new Error("Turnkey organization not found");
    }

    const existing = turnkeyOrg.policies.blockedMerchants ?? [];
    const newMerchants = [...new Set([...existing, ...args.merchantIds])];

    if (newMerchants.length > 50) {
      throw new Error("Merchant blocklist limit exceeded (max 50)");
    }

    await ctx.db.patch(turnkeyOrg._id, {
      policies: {
        ...turnkeyOrg.policies,
        blockedMerchants: newMerchants,
      },
      updatedAt: Date.now(),
    });

    return { success: true, count: newMerchants.length };
  },
});

/**
 * Remove merchants from blocklist
 */
export const removeFromMerchantBlocklist = mutation({
  args: {
    cardId: v.id("cards"),
    merchantIds: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    const card = await ctx.db.get(args.cardId);
    if (!card) {
      throw new Error("Card not found");
    }

    const turnkeyOrg = await ctx.db
      .query("turnkeyOrganizations")
      .withIndex("by_user", (q) => q.eq("userId", card.userId))
      .first();

    if (!turnkeyOrg) {
      throw new Error("Turnkey organization not found");
    }

    const existing = turnkeyOrg.policies.blockedMerchants ?? [];
    const removeSet = new Set(args.merchantIds);
    const newMerchants = existing.filter((m) => !removeSet.has(m));

    await ctx.db.patch(turnkeyOrg._id, {
      policies: {
        ...turnkeyOrg.policies,
        blockedMerchants: newMerchants,
      },
      updatedAt: Date.now(),
    });

    return { success: true, count: newMerchants.length };
  },
});

// ============================================================================
// MCC Management
// ============================================================================

/**
 * Add MCC codes to whitelist
 */
export const addToMccWhitelist = mutation({
  args: {
    cardId: v.id("cards"),
    mccCodes: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    const card = await ctx.db.get(args.cardId);
    if (!card) {
      throw new Error("Card not found");
    }

    const turnkeyOrg = await ctx.db
      .query("turnkeyOrganizations")
      .withIndex("by_user", (q) => q.eq("userId", card.userId))
      .first();

    if (!turnkeyOrg) {
      throw new Error("Turnkey organization not found");
    }

    const existing = turnkeyOrg.policies.allowedMccCodes ?? [];
    const newMccCodes = [...new Set([...existing, ...args.mccCodes])];

    if (newMccCodes.length > 100) {
      throw new Error("MCC whitelist limit exceeded (max 100)");
    }

    await ctx.db.patch(turnkeyOrg._id, {
      policies: {
        ...turnkeyOrg.policies,
        allowedMccCodes: newMccCodes,
      },
      updatedAt: Date.now(),
    });

    return { success: true, count: newMccCodes.length };
  },
});

/**
 * Add MCC codes to blocklist
 */
export const addToMccBlocklist = mutation({
  args: {
    cardId: v.id("cards"),
    mccCodes: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    const card = await ctx.db.get(args.cardId);
    if (!card) {
      throw new Error("Card not found");
    }

    const turnkeyOrg = await ctx.db
      .query("turnkeyOrganizations")
      .withIndex("by_user", (q) => q.eq("userId", card.userId))
      .first();

    if (!turnkeyOrg) {
      throw new Error("Turnkey organization not found");
    }

    const existing = turnkeyOrg.policies.blockedMccCodes ?? [];
    const newMccCodes = [...new Set([...existing, ...args.mccCodes])];

    if (newMccCodes.length > 100) {
      throw new Error("MCC blocklist limit exceeded (max 100)");
    }

    await ctx.db.patch(turnkeyOrg._id, {
      policies: {
        ...turnkeyOrg.policies,
        blockedMccCodes: newMccCodes,
      },
      updatedAt: Date.now(),
    });

    return { success: true, count: newMccCodes.length };
  },
});

/**
 * Block an entire MCC category
 */
export const blockMccCategory = mutation({
  args: {
    cardId: v.id("cards"),
    category: v.union(
      v.literal("highRisk"),
      v.literal("gambling"),
      v.literal("travel"),
      v.literal("foodAndDining"),
      v.literal("entertainment"),
      v.literal("retail"),
      v.literal("digitalGoods")
    ),
  },
  handler: async (ctx, args) => {
    const codes = MCC_CATEGORIES[args.category].map((c) => c.code);

    const card = await ctx.db.get(args.cardId);
    if (!card) {
      throw new Error("Card not found");
    }

    const turnkeyOrg = await ctx.db
      .query("turnkeyOrganizations")
      .withIndex("by_user", (q) => q.eq("userId", card.userId))
      .first();

    if (!turnkeyOrg) {
      throw new Error("Turnkey organization not found");
    }

    const existing = turnkeyOrg.policies.blockedMccCodes ?? [];
    const newMccCodes = [...new Set([...existing, ...codes])];

    await ctx.db.patch(turnkeyOrg._id, {
      policies: {
        ...turnkeyOrg.policies,
        blockedMccCodes: newMccCodes,
      },
      updatedAt: Date.now(),
    });

    return { success: true, blockedCodes: codes };
  },
});

/**
 * Clear all merchant/MCC restrictions
 */
export const clearAllRestrictions = mutation({
  args: { cardId: v.id("cards") },
  handler: async (ctx, args) => {
    const card = await ctx.db.get(args.cardId);
    if (!card) {
      throw new Error("Card not found");
    }

    const turnkeyOrg = await ctx.db
      .query("turnkeyOrganizations")
      .withIndex("by_user", (q) => q.eq("userId", card.userId))
      .first();

    if (!turnkeyOrg) {
      throw new Error("Turnkey organization not found");
    }

    await ctx.db.patch(turnkeyOrg._id, {
      policies: {
        ...turnkeyOrg.policies,
        merchantLocking: false,
        allowedMerchants: [],
        blockedMerchants: [],
        allowedMccCodes: [],
        blockedMccCodes: [],
      },
      updatedAt: Date.now(),
    });

    return { success: true };
  },
});
