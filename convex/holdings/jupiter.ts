/**
 * Jupiter Holdings Convex Functions
 *
 * Provides caching and real-time subscriptions for token holdings
 * fetched from Jupiter Ultra API (mainnet) or direct RPC (devnet).
 *
 * Privacy Features:
 * - Optional routing through private RPC proxy
 * - Timing obfuscation based on privacy level
 * - Server-side Tor routing for maximum privacy
 */
import { v } from "convex/values";
import { query, mutation, action, internalMutation, internalAction } from "../_generated/server";
import { internal, api } from "../_generated/api";
import type { Doc } from "../_generated/dataModel";

// ============================================================================
// Privacy Types
// ============================================================================

type PrivacyLevel = "basic" | "enhanced" | "maximum";

// Network configuration - log on load for debugging
const SOLANA_NETWORK = process.env.SOLANA_NETWORK || "mainnet-beta";
const SOLANA_RPC_URL = process.env.HELIUS_RPC_URL || process.env.SOLANA_RPC_URL || "https://api.mainnet-beta.solana.com";
const IS_DEVNET = SOLANA_NETWORK === "devnet" || SOLANA_RPC_URL.includes("devnet");

console.log(`[Holdings] Network config: SOLANA_NETWORK=${SOLANA_NETWORK}, IS_DEVNET=${IS_DEVNET}, RPC=${SOLANA_RPC_URL.slice(0, 50)}...`);

// Known RWA token mints for classification
const RWA_MINTS = new Set([
  "A1KLoBrKBde8Ty9qtNQUtq3C2ortoC3u7twggz7sEto6", // USDY
  "CXLBjMMcwkc17GfJtBos6rQCo1ypeH6eDbB82Kby4MRm", // OUSG
  "43m2ewFV5nDepieFjT9EmAQnc1HRtAF247RBpLGFem5F", // BUIDL
  "Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr", // BENJI
  "3NZ9JMVBmGAqocybic2c7LQCJScmgsAZ6vQqTDzcqmJh", // VBILL
  "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU", // TBILL
  "Mapuuts5DjNrLM7mhCRiEbDyNtPwfQWKr3xmyLMM8fVp", // syrupUSDC
  "ApoL1k7GWhhmE8AvCXeFHVGrw3aKNc5SpJbT3V9UpGNu", // ACRED
]);

const RWA_METADATA: Record<string, { issuer: string; type: string; expectedYield?: number }> = {
  A1KLoBrKBde8Ty9qtNQUtq3C2ortoC3u7twggz7sEto6: { issuer: "Ondo", type: "yield-bearing-stablecoin", expectedYield: 5.0 },
  CXLBjMMcwkc17GfJtBos6rQCo1ypeH6eDbB82Kby4MRm: { issuer: "Ondo", type: "tokenized-fund", expectedYield: 4.5 },
  "43m2ewFV5nDepieFjT9EmAQnc1HRtAF247RBpLGFem5F": { issuer: "BlackRock", type: "money-market", expectedYield: 4.8 },
  Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr: { issuer: "Franklin Templeton", type: "money-fund", expectedYield: 4.5 },
  "3NZ9JMVBmGAqocybic2c7LQCJScmgsAZ6vQqTDzcqmJh": { issuer: "VanEck", type: "treasury-bill", expectedYield: 4.3 },
  "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU": { issuer: "OpenEden", type: "treasury-bill", expectedYield: 4.5 },
  Mapuuts5DjNrLM7mhCRiEbDyNtPwfQWKr3xmyLMM8fVp: { issuer: "Maple", type: "lending", expectedYield: 8.0 },
  ApoL1k7GWhhmE8AvCXeFHVGrw3aKNc5SpJbT3V9UpGNu: { issuer: "Apollo", type: "private-credit", expectedYield: 9.5 },
};

// Fallback metadata for well-known tokens (used when Jupiter Token API fails)
const KNOWN_TOKEN_METADATA: Record<string, { symbol: string; name: string; logoUri: string }> = {
  EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v: {
    symbol: "USDC",
    name: "USD Coin",
    logoUri: "https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v/logo.png",
  },
  Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB: {
    symbol: "USDT",
    name: "Tether USD",
    logoUri: "https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB/logo.svg",
  },
  So11111111111111111111111111111111111111112: {
    symbol: "SOL",
    name: "Wrapped SOL",
    logoUri: "https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/So11111111111111111111111111111111111111112/logo.png",
  },
  mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So: {
    symbol: "mSOL",
    name: "Marinade staked SOL",
    logoUri: "https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So/logo.png",
  },
  DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263: {
    symbol: "BONK",
    name: "Bonk",
    logoUri: "https://arweave.net/hQiPZOsRZXGXBJd_82PhVdlM_hACsT_q6wqwf5cSY7I",
  },
  JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN: {
    symbol: "JUP",
    name: "Jupiter",
    logoUri: "https://static.jup.ag/jup/icon.png",
  },
  "7vfCXTUXx5WJV5JADk17DUJ4ksgau7utNKj4b963voxs": {
    symbol: "ETH",
    name: "Wormhole Wrapped ETH",
    logoUri: "https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/7vfCXTUXx5WJV5JADk17DUJ4ksgau7utNKj4b963voxs/logo.png",
  },
  bSo13r4TkiE4KumL71LsHTPpL2euBYLFx6h9HP3piy1: {
    symbol: "bSOL",
    name: "BlazeStake Staked SOL",
    logoUri: "https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/bSo13r4TkiE4KumL71LsHTPpL2euBYLFx6h9HP3piy1/logo.png",
  },
  J1toso1uCk3RLmjorhTtrVwY9HJ7X8V9yYac6Y7kGCPn: {
    symbol: "jitoSOL",
    name: "Jito Staked SOL",
    logoUri: "https://storage.googleapis.com/token-metadata/JitoSOL-256.png",
  },
};

// Helper to fetch token metadata from Jupiter Token API
// When privacyLevel is provided, routes through private proxy
async function fetchTokenMetadata(
  mint: string,
  privacyLevel?: PrivacyLevel,
  runAction?: (action: any, args: any) => Promise<any>
): Promise<{
  symbol: string;
  name: string;
  logoUri?: string;
} | null> {
  // Check known tokens fallback first
  const knownToken = KNOWN_TOKEN_METADATA[mint];
  if (knownToken) {
    return knownToken;
  }

  try {
    // Use private route if privacy level is enhanced or maximum
    if (privacyLevel && privacyLevel !== "basic" && runAction) {
      const data = await runAction(api.network.privateRpc.privateRestCall, {
        endpoint: "jupiter-token",
        path: `/token/${mint}`,
        method: "GET",
        privacyLevel,
      });
      return {
        symbol: data.symbol || mint.slice(0, 4).toUpperCase(),
        name: data.name || mint.slice(0, 8),
        logoUri: data.logoURI,
      };
    }

    // Direct call for basic privacy or when no context
    const response = await fetch(`https://tokens.jup.ag/token/${mint}`);
    if (!response.ok) return null;
    const data = await response.json();
    return {
      symbol: data.symbol || mint.slice(0, 4).toUpperCase(),
      name: data.name || mint.slice(0, 8),
      logoUri: data.logoURI,
    };
  } catch {
    return null;
  }
}

// ============================================================================
// Queries
// ============================================================================

/**
 * Get cached holdings for a wallet address
 */
export const getHoldings = query({
  args: { walletAddress: v.string() },
  handler: async (ctx, args) => {
    return ctx.db
      .query("tokenHoldings")
      .withIndex("by_wallet", (q) => q.eq("walletAddress", args.walletAddress))
      .collect();
  },
});

/**
 * Get RWA holdings only
 */
export const getRwaHoldings = query({
  args: { walletAddress: v.string() },
  handler: async (ctx, args) => {
    return ctx.db
      .query("tokenHoldings")
      .withIndex("by_wallet_rwa", (q) =>
        q.eq("walletAddress", args.walletAddress).eq("isRwa", true)
      )
      .collect();
  },
});

/**
 * Get total portfolio value for a wallet
 */
export const getPortfolioValue = query({
  args: { walletAddress: v.string() },
  handler: async (ctx, args) => {
    const holdings = await ctx.db
      .query("tokenHoldings")
      .withIndex("by_wallet", (q) => q.eq("walletAddress", args.walletAddress))
      .collect();

    const totalValue = holdings.reduce((sum, h) => sum + h.valueUsd, 0);
    const rwaValue = holdings
      .filter((h) => h.isRwa)
      .reduce((sum, h) => sum + h.valueUsd, 0);
    const tokenValue = totalValue - rwaValue;

    return {
      totalValue,
      tokenValue,
      rwaValue,
      holdingsCount: holdings.length,
      rwaCount: holdings.filter((h) => h.isRwa).length,
    };
  },
});

// ============================================================================
// Devnet Balance Fetching (Direct RPC)
// ============================================================================

/**
 * Fetch holdings directly from Solana RPC (for devnet)
 * Uses getBalance for SOL and getTokenAccountsByOwner for SPL tokens
 *
 * @param walletAddress - Wallet address to fetch holdings for
 * @param privacyLevel - Optional privacy level for routing decisions
 * @param runAction - Action runner for private RPC calls
 */
async function fetchDevnetHoldings(
  walletAddress: string,
  privacyLevel?: PrivacyLevel,
  runAction?: (action: any, args: any) => Promise<any>
): Promise<{
  holdings: Array<{
    mint: string;
    symbol: string;
    name: string;
    decimals: number;
    balance: string;
    balanceFormatted: number;
    valueUsd: number;
    priceUsd: number;
    change24h: number;
    logoUri?: string;
    isRwa?: boolean;
    rwaMetadata?: { issuer: string; type: string; expectedYield?: number };
  }>;
  totalValueUsd: number;
}> {
  console.log(`[Holdings] fetchDevnetHoldings called for ${walletAddress}`);
  console.log(`[Holdings] Using RPC: ${SOLANA_RPC_URL}`);

  const holdings: Array<{
    mint: string;
    symbol: string;
    name: string;
    decimals: number;
    balance: string;
    balanceFormatted: number;
    valueUsd: number;
    priceUsd: number;
    change24h: number;
    logoUri?: string;
    isRwa?: boolean;
    rwaMetadata?: { issuer: string; type: string; expectedYield?: number };
  }> = [];

  // Fetch SOL balance - use private route if privacy enabled
  let balanceData: any;
  const usePrivateRoute = privacyLevel && privacyLevel !== "basic" && runAction;

  if (usePrivateRoute) {
    balanceData = await runAction(api.network.privateRpc.privateRpcCall, {
      endpoint: "solana",
      method: "getBalance",
      params: [walletAddress],
      privacyLevel,
    });
  } else {
    const balanceResponse = await fetch(SOLANA_RPC_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "getBalance",
        params: [walletAddress],
      }),
    });
    balanceData = await balanceResponse.json();
  }
  console.log(`[Holdings] Balance response:`, JSON.stringify(balanceData));
  const lamports = balanceData.result?.value || 0;
  const solBalance = lamports / 1e9;
  console.log(`[Holdings] SOL balance: ${solBalance} (${lamports} lamports)`);

  if (solBalance > 0) {
    // Fetch SOL price from CoinGecko (works for devnet testing)
    let solPrice = 0;
    let change24h = 0;
    try {
      let priceData: any;
      if (usePrivateRoute) {
        priceData = await runAction(api.network.privateRpc.privateRestCall, {
          endpoint: "coingecko",
          path: "/simple/price",
          method: "GET",
          queryParams: {
            ids: "solana",
            vs_currencies: "usd",
            include_24hr_change: "true",
          },
          privacyLevel,
        });
      } else {
        const priceResponse = await fetch(
          "https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd&include_24hr_change=true"
        );
        priceData = await priceResponse.json();
      }
      console.log(`[Holdings] CoinGecko response:`, JSON.stringify(priceData));
      solPrice = priceData.solana?.usd || 0;
      change24h = priceData.solana?.usd_24h_change || 0;
      console.log(`[Holdings] SOL price: $${solPrice}, 24h change: ${change24h}%`);
    } catch (err) {
      console.error(`[Holdings] CoinGecko price fetch failed:`, err);
    }

    // Use fallback price if CoinGecko failed or was rate limited
    if (solPrice === 0) {
      solPrice = 150; // Fallback price for devnet testing
      console.log(`[Holdings] Using fallback SOL price: $${solPrice}`);
    }

    const valueUsd = solBalance * solPrice;
    console.log(`[Holdings] Adding SOL holding: ${solBalance} SOL = $${valueUsd}`);

    holdings.push({
      mint: "So11111111111111111111111111111111111111112",
      symbol: "SOL",
      name: "Solana",
      decimals: 9,
      balance: lamports.toString(),
      balanceFormatted: solBalance,
      valueUsd,
      priceUsd: solPrice,
      change24h,
      logoUri: "https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/So11111111111111111111111111111111111111112/logo.png",
      isRwa: false,
    });
  }

  // Fetch SPL token accounts - use private route if privacy enabled
  let tokenData: any;
  if (usePrivateRoute) {
    tokenData = await runAction(api.network.privateRpc.privateRpcCall, {
      endpoint: "solana",
      method: "getTokenAccountsByOwner",
      params: [
        walletAddress,
        { programId: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA" },
        { encoding: "jsonParsed" },
      ],
      privacyLevel,
    });
  } else {
    const tokenResponse = await fetch(SOLANA_RPC_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 2,
        method: "getTokenAccountsByOwner",
        params: [
          walletAddress,
          { programId: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA" },
          { encoding: "jsonParsed" },
        ],
      }),
    });
    tokenData = await tokenResponse.json();
  }
  const tokenAccounts = tokenData.result?.value || [];

  for (const account of tokenAccounts) {
    const info = account.account?.data?.parsed?.info;
    if (!info) continue;

    const mint = info.mint;
    const balance = info.tokenAmount?.amount || "0";
    const decimals = info.tokenAmount?.decimals || 0;
    const uiAmount = info.tokenAmount?.uiAmount || 0;

    if (uiAmount === 0) continue;

    const isRwa = RWA_MINTS.has(mint);
    const rwaMetadata = isRwa ? RWA_METADATA[mint] : undefined;
    const meta = await fetchTokenMetadata(mint, privacyLevel, runAction);

    holdings.push({
      mint,
      symbol: meta?.symbol || mint.slice(0, 4).toUpperCase(),
      name: meta?.name || mint.slice(0, 8),
      decimals,
      balance,
      balanceFormatted: uiAmount,
      valueUsd: 0, // No price data for devnet tokens
      priceUsd: 0,
      change24h: 0,
      logoUri: meta?.logoUri,
      isRwa,
      rwaMetadata,
    });
  }

  const totalValueUsd = holdings.reduce((sum, h) => sum + h.valueUsd, 0);

  console.log(`[Holdings] Devnet fetch complete: ${holdings.length} holdings, total value: $${totalValueUsd}`);
  return { holdings, totalValueUsd };
}

// ============================================================================
// Actions (External API calls)
// ============================================================================

/**
 * Refresh holdings from Jupiter Ultra API (mainnet) or direct RPC (devnet)
 *
 * @param walletAddress - Wallet address to refresh holdings for
 * @param privacyLevel - Optional privacy level (basic/enhanced/maximum)
 *   - basic: Direct API calls
 *   - enhanced: Timing jitter + server routing
 *   - maximum: Timing jitter + Tor routing (when available)
 */
export const refreshHoldings = action({
  args: {
    walletAddress: v.string(),
    privacyLevel: v.optional(
      v.union(v.literal("basic"), v.literal("enhanced"), v.literal("maximum"))
    ),
  },
  handler: async (ctx, args) => {
    const privacyLevel = args.privacyLevel || "basic";

    // Use devnet path if on devnet (Jupiter Ultra only supports mainnet)
    if (IS_DEVNET) {
      console.log(`[Holdings] Using devnet RPC for ${args.walletAddress.slice(0, 8)}... (privacy: ${privacyLevel})`);
      const { holdings, totalValueUsd } = await fetchDevnetHoldings(
        args.walletAddress,
        privacyLevel,
        ctx.runAction
      );

      // Update cache via mutation
      await ctx.runMutation(internal.holdings.jupiter.updateCache, {
        walletAddress: args.walletAddress,
        holdings,
        totalValueUsd,
      });

      return {
        holdings,
        totalValueUsd,
        lastUpdated: Date.now(),
        network: "devnet",
      };
    }

    // Mainnet path: Use Jupiter Ultra API
    const JUPITER_ULTRA_URL = "https://api.jup.ag/ultra/v1";
    const JUPITER_API_KEY = process.env.JUPITER_API_KEY;

    if (!JUPITER_API_KEY) {
      throw new Error("JUPITER_API_KEY environment variable not set");
    }

    console.log(`[Holdings] Using mainnet Jupiter Ultra for ${args.walletAddress.slice(0, 8)}... (privacy: ${privacyLevel})`);

    // Fetch from Jupiter Ultra API - use private route if privacy enabled
    let data: any;
    const usePrivateRoute = privacyLevel !== "basic";

    if (usePrivateRoute) {
      try {
        data = await ctx.runAction(api.network.privateRpc.privateRestCall, {
          endpoint: "jupiter-ultra",
          path: `/holdings/${args.walletAddress}`,
          method: "GET",
          privacyLevel,
        });
      } catch (error) {
        console.error(`[Holdings] Private route failed, error:`, error);
        throw error;
      }
    } else {
      const response = await fetch(
        `${JUPITER_ULTRA_URL}/holdings/${args.walletAddress}`,
        {
          headers: {
            "Content-Type": "application/json",
            "x-api-key": JUPITER_API_KEY,
          },
        }
      );

      if (!response.ok) {
        const errorText = await response.text().catch(() => "");
        throw new Error(`Jupiter API error: ${response.status} - ${errorText}`);
      }

      data = await response.json();
    }

    // Jupiter Ultra returns tokens as object keyed by mint address:
    // { "amount": "sol_lamports", "uiAmount": 1.5, "tokens": { "mint1": [...], "mint2": [...] } }
    const holdings: Array<{
      mint: string;
      symbol: string;
      name: string;
      decimals: number;
      balance: string;
      balanceFormatted: number;
      valueUsd: number;
      priceUsd: number;
      change24h: number;
      logoUri?: string;
      isRwa?: boolean;
      rwaMetadata?: { issuer: string; type: string; expectedYield?: number };
    }> = [];

    let totalValueUsd = 0;

    // Add native SOL balance if present
    if (data.uiAmount && data.uiAmount > 0) {
      const solPrice = 0; // Jupiter doesn't include SOL price in holdings response
      holdings.push({
        mint: "So11111111111111111111111111111111111111112",
        symbol: "SOL",
        name: "Solana",
        decimals: 9,
        balance: data.amount || "0",
        balanceFormatted: data.uiAmount,
        valueUsd: 0, // Would need price feed
        priceUsd: solPrice,
        change24h: 0,
        logoUri: "https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/So11111111111111111111111111111111111111112/logo.png",
        isRwa: false,
      });
    }

    // Iterate over token holdings (object keyed by mint)
    const tokensObj = data.tokens || {};
    const mints = Object.keys(tokensObj);

    // Fetch token metadata from Jupiter Token API in parallel
    // Pass privacy options for routing decisions
    const metadataResults = await Promise.all(
      mints.map(mint => fetchTokenMetadata(mint, privacyLevel, ctx.runAction))
    );
    const tokenMetadata = new Map(
      mints.map((mint, i) => [mint, metadataResults[i]])
    );

    for (const [mint, accounts] of Object.entries(tokensObj)) {
      // Each mint can have multiple token accounts (array)
      const tokenAccounts = accounts as Array<{
        account: string;
        amount: string;
        uiAmount: number;
        uiAmountString: string;
        decimals: number;
        isFrozen?: boolean;
      }>;

      if (!tokenAccounts || tokenAccounts.length === 0) continue;

      // Sum up balances across all accounts for this mint
      let totalBalance = BigInt(0);
      let totalUiAmount = 0;
      let decimals = 0;

      for (const acc of tokenAccounts) {
        totalBalance += BigInt(acc.amount || "0");
        totalUiAmount += acc.uiAmount || 0;
        decimals = acc.decimals || 0;
      }

      const isRwa = RWA_MINTS.has(mint);
      const rwaMetadata = isRwa ? RWA_METADATA[mint] : undefined;
      const meta = tokenMetadata.get(mint);

      holdings.push({
        mint,
        symbol: meta?.symbol || mint.slice(0, 4).toUpperCase(),
        name: meta?.name || mint.slice(0, 8),
        decimals,
        balance: totalBalance.toString(),
        balanceFormatted: totalUiAmount,
        valueUsd: 0, // Jupiter holdings doesn't include prices
        priceUsd: 0,
        change24h: 0,
        logoUri: meta?.logoUri,
        isRwa,
        rwaMetadata,
      });
    }

    // Update cache via mutation
    await ctx.runMutation(internal.holdings.jupiter.updateCache, {
      walletAddress: args.walletAddress,
      holdings,
      totalValueUsd,
    });

    return {
      holdings,
      totalValueUsd,
      lastUpdated: Date.now(),
    };
  },
});

// ============================================================================
// Internal Mutations
// ============================================================================

/**
 * Update the holdings cache (internal only)
 */
export const updateCache = internalMutation({
  args: {
    walletAddress: v.string(),
    holdings: v.array(
      v.object({
        mint: v.string(),
        symbol: v.string(),
        name: v.string(),
        decimals: v.number(),
        balance: v.string(),
        balanceFormatted: v.number(),
        valueUsd: v.number(),
        priceUsd: v.number(),
        change24h: v.number(),
        logoUri: v.optional(v.string()),
        isRwa: v.optional(v.boolean()),
        rwaMetadata: v.optional(
          v.object({
            issuer: v.string(),
            type: v.string(),
            expectedYield: v.optional(v.number()),
          })
        ),
      })
    ),
    totalValueUsd: v.number(),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    // Get existing holdings for this wallet
    const existing = await ctx.db
      .query("tokenHoldings")
      .withIndex("by_wallet", (q) => q.eq("walletAddress", args.walletAddress))
      .collect();

    // Create a map of existing holdings by mint for upsert logic
    const existingByMint = new Map(existing.map((h) => [h.mint, h]));
    const newMints = new Set(args.holdings.map((h) => h.mint));

    // Upsert holdings: update existing or insert new
    for (const holding of args.holdings) {
      const existingHolding = existingByMint.get(holding.mint);

      if (existingHolding) {
        // Update existing holding
        await ctx.db.patch(existingHolding._id, {
          symbol: holding.symbol,
          name: holding.name,
          decimals: holding.decimals,
          balance: holding.balance,
          balanceFormatted: holding.balanceFormatted,
          valueUsd: holding.valueUsd,
          priceUsd: holding.priceUsd,
          change24h: holding.change24h,
          logoUri: holding.logoUri,
          isRwa: holding.isRwa,
          rwaMetadata: holding.rwaMetadata,
          updatedAt: now,
        });
      } else {
        // Insert new holding
        await ctx.db.insert("tokenHoldings", {
          walletAddress: args.walletAddress,
          mint: holding.mint,
          symbol: holding.symbol,
          name: holding.name,
          decimals: holding.decimals,
          balance: holding.balance,
          balanceFormatted: holding.balanceFormatted,
          valueUsd: holding.valueUsd,
          priceUsd: holding.priceUsd,
          change24h: holding.change24h,
          logoUri: holding.logoUri,
          isRwa: holding.isRwa,
          rwaMetadata: holding.rwaMetadata,
          updatedAt: now,
        });
      }
    }

    // Delete holdings that no longer exist
    for (const h of existing) {
      if (!newMints.has(h.mint)) {
        await ctx.db.delete(h._id);
      }
    }
  },
});

/**
 * Clear holdings cache for a wallet
 */
export const clearCache = mutation({
  args: { walletAddress: v.string() },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("tokenHoldings")
      .withIndex("by_wallet", (q) => q.eq("walletAddress", args.walletAddress))
      .collect();

    for (const h of existing) {
      await ctx.db.delete(h._id);
    }

    return { deleted: existing.length };
  },
});
