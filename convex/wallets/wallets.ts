/**
 * Wallets Convex Functions
 * Manages connected crypto wallets (Solana, Ethereum, etc.)
 */
import { v } from "convex/values";
import { query, mutation, internalQuery } from "../_generated/server";
import { Id, Doc } from "../_generated/dataModel";

// List all wallets for the current user
export const list = query({
  args: {
    userId: v.optional(v.id("users")),
  },
  handler: async (ctx, args) => {
    // For dev/demo purposes, if no userId provided, return empty array
    if (!args.userId) {
      return [];
    }

    const wallets = await ctx.db
      .query("wallets")
      .withIndex("by_user", (q) => q.eq("userId", args.userId!))
      .collect();

    return wallets.map((wallet) => ({
      ...wallet,
      // Hide sensitive data
      encryptedPrivateData: undefined,
    }));
  },
});

// Get a specific wallet by ID
export const get = query({
  args: {
    walletId: v.id("wallets"),
  },
  handler: async (ctx, args) => {
    const wallet = await ctx.db.get(args.walletId);
    if (!wallet) {
      return null;
    }

    return {
      ...wallet,
      encryptedPrivateData: undefined,
    };
  },
});

// Connect a new wallet
export const connect = mutation({
  args: {
    userId: v.id("users"),
    walletType: v.union(
      v.literal("passkey"),
      v.literal("walletconnect"),
      v.literal("solana_external"),
      v.literal("eth_external"),
      v.literal("bitcoin")
    ),
    address: v.string(),
    networkType: v.string(),
    chainId: v.optional(v.number()),
    nickname: v.optional(v.string()),
    wcTopic: v.optional(v.string()),
    wcPeerMetadata: v.optional(
      v.object({
        name: v.string(),
        url: v.string(),
        icons: v.array(v.string()),
      })
    ),
    permissions: v.optional(v.array(v.string())),
    isDefault: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    // Check if wallet already exists
    const existing = await ctx.db
      .query("wallets")
      .withIndex("by_address", (q) => q.eq("address", args.address))
      .first();

    if (existing) {
      // Update connection status
      await ctx.db.patch(existing._id, {
        connectionStatus: "connected",
        lastUsedAt: Date.now(),
      });
      return existing._id;
    }

    // Create new wallet
    const addressLastFour = args.address.slice(-4);
    const now = Date.now();

    const walletId = await ctx.db.insert("wallets", {
      userId: args.userId,
      walletType: args.walletType,
      address: args.address,
      addressLastFour,
      networkType: args.networkType,
      chainId: args.chainId,
      connectionStatus: "connected",
      wcTopic: args.wcTopic,
      wcPeerMetadata: args.wcPeerMetadata,
      permissions: args.permissions ?? ["sign_transaction", "sign_message"],
      isDefault: args.isDefault ?? false,
      nickname: args.nickname,
      createdAt: now,
      lastUsedAt: now,
    });

    return walletId;
  },
});

// Disconnect a wallet
export const disconnect = mutation({
  args: {
    walletId: v.id("wallets"),
  },
  handler: async (ctx, args) => {
    const wallet = await ctx.db.get(args.walletId);
    if (!wallet) {
      throw new Error("Wallet not found");
    }

    await ctx.db.patch(args.walletId, {
      connectionStatus: "disconnected",
    });

    return { success: true };
  },
});

// Refresh wallet balance from blockchain
export const refreshBalance = mutation({
  args: {
    walletId: v.id("wallets"),
  },
  handler: async (ctx, args) => {
    const wallet = await ctx.db.get(args.walletId);
    if (!wallet) {
      throw new Error("Wallet not found");
    }

    // In production, this would call external APIs (Helius, Alchemy, etc.)
    // For now, simulate a balance refresh
    const mockBalance = Math.floor(Math.random() * 10000000000); // lamports/wei
    const mockBalanceUsd = Math.floor(mockBalance * 0.00001); // Mock USD conversion

    await ctx.db.patch(args.walletId, {
      cachedBalance: mockBalance,
      cachedBalanceUsd: mockBalanceUsd,
      balanceLastUpdated: Date.now(),
      lastUsedAt: Date.now(),
    });

    return {
      balance: mockBalance,
      balanceUsd: mockBalanceUsd,
    };
  },
});

/**
 * List wallets by user ID (internal - for solver context)
 */
export const listByUserId = internalQuery({
  args: {
    userId: v.id("users"),
  },
  handler: async (ctx, args): Promise<Doc<"wallets">[]> => {
    return await ctx.db
      .query("wallets")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .filter((q) => q.eq(q.field("connectionStatus"), "connected"))
      .collect();
  },
});

