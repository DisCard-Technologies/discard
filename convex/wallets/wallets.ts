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
      v.literal("bitcoin"),
      v.literal("seed_vault")
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

/**
 * Connect a Seed Vault wallet via Mobile Wallet Adapter
 */
export const connectSeedVault = mutation({
  args: {
    userId: v.id("users"),
    address: v.string(),
    mwaAuthToken: v.string(),
    mwaWalletName: v.string(),
    nickname: v.optional(v.string()),
    setAsPreferredSigner: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    // Check if wallet already exists
    const existing = await ctx.db
      .query("wallets")
      .withIndex("by_address", (q) => q.eq("address", args.address))
      .first();

    if (existing) {
      // Update connection status and MWA fields
      await ctx.db.patch(existing._id, {
        connectionStatus: "connected",
        mwaAuthToken: args.mwaAuthToken,
        mwaWalletName: args.mwaWalletName,
        isPreferredSigner: args.setAsPreferredSigner ?? false,
        lastUsedAt: Date.now(),
      });

      // Update user's preferred signing wallet if requested
      if (args.setAsPreferredSigner) {
        await ctx.db.patch(args.userId, {
          preferredSigningWallet: existing._id,
        });
      }

      return existing._id;
    }

    // Create new Seed Vault wallet
    const addressLastFour = args.address.slice(-4);
    const now = Date.now();

    const walletId = await ctx.db.insert("wallets", {
      userId: args.userId,
      walletType: "seed_vault",
      address: args.address,
      addressLastFour,
      networkType: "solana",
      connectionStatus: "connected",
      permissions: ["sign_transaction", "sign_message"],
      isDefault: false,
      mwaAuthToken: args.mwaAuthToken,
      mwaWalletName: args.mwaWalletName,
      isPreferredSigner: args.setAsPreferredSigner ?? false,
      nickname: args.nickname ?? `Seed Vault (${addressLastFour})`,
      createdAt: now,
      lastUsedAt: now,
    });

    // Update user's preferred signing wallet if requested
    if (args.setAsPreferredSigner) {
      await ctx.db.patch(args.userId, {
        preferredSigningWallet: walletId,
      });
    }

    return walletId;
  },
});

/**
 * Update MWA auth token (for reauthorization)
 */
export const updateMwaAuthToken = mutation({
  args: {
    walletId: v.id("wallets"),
    mwaAuthToken: v.string(),
  },
  handler: async (ctx, args) => {
    const wallet = await ctx.db.get(args.walletId);
    if (!wallet) {
      throw new Error("Wallet not found");
    }

    if (wallet.walletType !== "seed_vault") {
      throw new Error("Wallet is not a Seed Vault wallet");
    }

    await ctx.db.patch(args.walletId, {
      mwaAuthToken: args.mwaAuthToken,
      lastUsedAt: Date.now(),
    });

    return { success: true };
  },
});

/**
 * Set preferred signing wallet for a user
 */
export const setPreferredSigningWallet = mutation({
  args: {
    userId: v.id("users"),
    walletId: v.optional(v.id("wallets")),
  },
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.userId);
    if (!user) {
      throw new Error("User not found");
    }

    if (args.walletId) {
      const wallet = await ctx.db.get(args.walletId);
      if (!wallet) {
        throw new Error("Wallet not found");
      }

      if (wallet.userId !== args.userId) {
        throw new Error("Wallet does not belong to user");
      }

      // Only seed_vault wallets can be preferred signers (Turnkey is implicit default)
      if (wallet.walletType !== "seed_vault") {
        throw new Error("Only Seed Vault wallets can be set as preferred signer");
      }

      // Clear isPreferredSigner from all other wallets
      const userWallets = await ctx.db
        .query("wallets")
        .withIndex("by_user", (q) => q.eq("userId", args.userId))
        .collect();

      for (const w of userWallets) {
        if (w.isPreferredSigner && w._id !== args.walletId) {
          await ctx.db.patch(w._id, { isPreferredSigner: false });
        }
      }

      // Set this wallet as preferred
      await ctx.db.patch(args.walletId, { isPreferredSigner: true });
    }

    // Update user's preferred signing wallet
    await ctx.db.patch(args.userId, {
      preferredSigningWallet: args.walletId,
    });

    return { success: true };
  },
});

/**
 * Get the preferred signing wallet for a user
 */
export const getPreferredSigningWallet = query({
  args: {
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.userId);
    if (!user) {
      return null;
    }

    if (!user.preferredSigningWallet) {
      return null; // Fallback to Turnkey
    }

    const wallet = await ctx.db.get(user.preferredSigningWallet);
    if (!wallet || wallet.connectionStatus !== "connected") {
      return null; // Fallback to Turnkey
    }

    return {
      ...wallet,
      encryptedPrivateData: undefined, // Hide sensitive data
    };
  },
});

