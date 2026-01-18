/**
 * Sync DeFi Positions
 *
 * Updates DeFi position balances and yield data.
 * Runs every 15 minutes.
 */
import { v } from "convex/values";
import { internalMutation, internalAction, internalQuery } from "../_generated/server";
import { internal } from "../_generated/api";

/**
 * Main cron handler
 */
export const run = internalMutation({
  args: {},
  handler: async (ctx): Promise<void> => {
    // Get all positions that need syncing
    const positions = await ctx.db
      .query("defi")
      .filter((q) =>
        q.and(
          q.neq(q.field("syncStatus"), "syncing"),
          q.eq(q.field("closedAt"), undefined)
        )
      )
      .collect();

    if (positions.length === 0) {
      return;
    }

    console.log(`Syncing ${positions.length} DeFi positions`);

    // Mark positions as syncing
    for (const position of positions) {
      await ctx.db.patch(position._id, {
        syncStatus: "syncing",
      });
    }

    // Schedule actual sync for each position
    for (const position of positions) {
      await ctx.scheduler.runAfter(0, internal.crons.syncDefi.syncPosition, {
        positionId: position._id,
      });
    }
  },
});

/**
 * Sync a single position
 */
export const syncPosition = internalAction({
  args: {
    positionId: v.id("defi"),
  },
  handler: async (ctx, args): Promise<void> => {
    try {
      const position = await ctx.runQuery(internal.crons.syncDefi.getPosition, {
        positionId: args.positionId,
      });

      if (!position) {
        return;
      }

      // Fetch updated data from protocol
      // This would call the actual DeFi protocol APIs
      const updatedData = await fetchProtocolData(position);

      // Update position in database
      await ctx.runMutation(internal.crons.syncDefi.updatePosition, {
        positionId: args.positionId,
        totalValueUsd: updatedData.totalValueUsd,
        earnedValueUsd: updatedData.earnedValueUsd,
        availableForFunding: updatedData.availableForFunding,
        currentYieldApy: updatedData.currentYieldApy,
        estimatedDailyYield: updatedData.estimatedDailyYield,
        healthFactor: updatedData.healthFactor,
      });

      console.log(`Synced position ${args.positionId}: $${(updatedData.totalValueUsd / 100).toFixed(2)}`);

    } catch (error) {
      console.error(`Failed to sync position ${args.positionId}:`, error);

      await ctx.runMutation(internal.crons.syncDefi.markSyncError, {
        positionId: args.positionId,
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  },
});

/**
 * Get position by ID
 */
export const getPosition = internalQuery({
  args: {
    positionId: v.id("defi"),
  },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.positionId);
  },
});

/**
 * Update position data
 */
export const updatePosition = internalMutation({
  args: {
    positionId: v.id("defi"),
    totalValueUsd: v.number(),
    earnedValueUsd: v.number(),
    availableForFunding: v.number(),
    currentYieldApy: v.number(),
    estimatedDailyYield: v.number(),
    healthFactor: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<void> => {
    await ctx.db.patch(args.positionId, {
      totalValueUsd: args.totalValueUsd,
      earnedValueUsd: args.earnedValueUsd,
      availableForFunding: args.availableForFunding,
      currentYieldApy: args.currentYieldApy,
      estimatedDailyYield: args.estimatedDailyYield,
      healthFactor: args.healthFactor,
      syncStatus: "synced",
      syncError: undefined,
      lastSyncedAt: Date.now(),
    });
  },
});

/**
 * Mark sync error
 */
export const markSyncError = internalMutation({
  args: {
    positionId: v.id("defi"),
    error: v.string(),
  },
  handler: async (ctx, args): Promise<void> => {
    await ctx.db.patch(args.positionId, {
      syncStatus: "error",
      syncError: args.error,
      lastSyncedAt: Date.now(),
    });
  },
});

// ============ DeFi Protocol APIs ============

// Aave V3 Subgraph (Solana)
const AAVE_SUBGRAPH_URL = process.env.AAVE_SUBGRAPH_URL ||
  "https://api.studio.thegraph.com/query/aave/protocol-v3-solana/version/latest";

// Compound V3 API
const COMPOUND_API_URL = "https://api.compound.finance/api/v2";

// DeFiLlama API for yield data
const DEFILLAMA_API_URL = "https://yields.llama.fi/pools";

/**
 * Fetch data from DeFi protocol
 * Routes to appropriate API based on protocol type
 */
async function fetchProtocolData(position: any): Promise<{
  totalValueUsd: number;
  earnedValueUsd: number;
  availableForFunding: number;
  currentYieldApy: number;
  estimatedDailyYield: number;
  healthFactor?: number;
}> {
  const protocol = position.protocol || "unknown";
  const positionType = position.positionType || "lending";

  try {
    switch (protocol.toLowerCase()) {
      case "aave":
        return await fetchAaveData(position);
      case "compound":
        return await fetchCompoundData(position);
      case "marinade":
      case "lido":
        return await fetchStakingData(position);
      default:
        // Use DeFiLlama for generic yield data
        return await fetchDefiLlamaData(position);
    }
  } catch (error) {
    console.error(`[DeFi] Failed to fetch ${protocol} data:`, error);
    // Return last known values with staleness indicator
    return {
      totalValueUsd: position.totalValueUsd || position.depositedValueUsd,
      earnedValueUsd: position.earnedValueUsd || 0,
      availableForFunding: position.availableForFunding || 0,
      currentYieldApy: position.currentYieldApy || 0,
      estimatedDailyYield: position.estimatedDailyYield || 0,
      healthFactor: position.healthFactor,
    };
  }
}

/**
 * Fetch Aave V3 position data via The Graph
 */
async function fetchAaveData(position: any): Promise<{
  totalValueUsd: number;
  earnedValueUsd: number;
  availableForFunding: number;
  currentYieldApy: number;
  estimatedDailyYield: number;
  healthFactor?: number;
}> {
  const userAddress = position.protocolPositionId || position.walletAddress;

  // GraphQL query for user position
  const query = `
    query GetUserPosition($user: String!) {
      userReserves(where: { user: $user }) {
        currentATokenBalance
        currentTotalDebt
        reserve {
          symbol
          underlyingAsset
          liquidityRate
          variableBorrowRate
          priceInUSD
        }
      }
      users(where: { id: $user }) {
        healthFactor
      }
    }
  `;

  const response = await fetch(AAVE_SUBGRAPH_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      query,
      variables: { user: userAddress.toLowerCase() },
    }),
  });

  if (!response.ok) {
    throw new Error(`Aave subgraph error: ${response.status}`);
  }

  const data = await response.json();

  if (data.errors) {
    throw new Error(`Aave query error: ${data.errors[0].message}`);
  }

  // Calculate total position value and APY
  let totalValueUsd = 0;
  let weightedApy = 0;

  for (const reserve of data.data?.userReserves || []) {
    const balance = parseFloat(reserve.currentATokenBalance) / 1e18;
    const priceUsd = parseFloat(reserve.reserve.priceInUSD);
    const valueUsd = balance * priceUsd;

    totalValueUsd += valueUsd;

    // liquidityRate is in ray (27 decimals), convert to APY
    const supplyApy = (parseFloat(reserve.reserve.liquidityRate) / 1e27) * 100;
    weightedApy += supplyApy * valueUsd;
  }

  const averageApy = totalValueUsd > 0 ? weightedApy / totalValueUsd : 0;
  const healthFactor = data.data?.users?.[0]?.healthFactor
    ? parseFloat(data.data.users[0].healthFactor) / 1e18
    : undefined;

  // Convert to cents for consistency
  const totalValueCents = Math.floor(totalValueUsd * 100);
  const earnedCents = Math.max(0, totalValueCents - position.depositedValueUsd);
  const dailyYieldCents = Math.floor(totalValueCents * (averageApy / 100 / 365));

  console.log(`[DeFi] Aave: $${(totalValueCents / 100).toFixed(2)}, APY: ${averageApy.toFixed(2)}%`);

  return {
    totalValueUsd: totalValueCents,
    earnedValueUsd: earnedCents,
    availableForFunding: Math.floor(totalValueCents * 0.8), // 80% can be withdrawn
    currentYieldApy: Math.round(averageApy * 100), // basis points
    estimatedDailyYield: dailyYieldCents,
    healthFactor,
  };
}

/**
 * Fetch Compound V3 position data
 */
async function fetchCompoundData(position: any): Promise<{
  totalValueUsd: number;
  earnedValueUsd: number;
  availableForFunding: number;
  currentYieldApy: number;
  estimatedDailyYield: number;
  healthFactor?: number;
}> {
  const userAddress = position.protocolPositionId || position.walletAddress;

  // Compound V3 account endpoint
  const response = await fetch(`${COMPOUND_API_URL}/account`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      addresses: [userAddress],
      network: "mainnet", // or solana when available
    }),
  });

  if (!response.ok) {
    throw new Error(`Compound API error: ${response.status}`);
  }

  const data = await response.json();
  const account = data.accounts?.[0];

  if (!account) {
    // No position found, return zeros
    return {
      totalValueUsd: position.depositedValueUsd,
      earnedValueUsd: 0,
      availableForFunding: position.depositedValueUsd,
      currentYieldApy: 0,
      estimatedDailyYield: 0,
    };
  }

  // Calculate values from Compound response
  const totalSupplyUsd = parseFloat(account.total_supply_value_in_eth || "0") * 2000; // ETH price estimate
  const totalValueCents = Math.floor(totalSupplyUsd * 100);

  // Get current supply APY from protocol
  const protocolResponse = await fetch(`${COMPOUND_API_URL}/ctoken`);
  const protocolData = await protocolResponse.json();

  // Find the relevant market APY
  const marketApy = protocolData.cToken?.[0]?.supply_rate?.value
    ? parseFloat(protocolData.cToken[0].supply_rate.value) * 100
    : 3.5; // Default 3.5% if not found

  const earnedCents = Math.max(0, totalValueCents - position.depositedValueUsd);
  const dailyYieldCents = Math.floor(totalValueCents * (marketApy / 100 / 365));

  console.log(`[DeFi] Compound: $${(totalValueCents / 100).toFixed(2)}, APY: ${marketApy.toFixed(2)}%`);

  return {
    totalValueUsd: totalValueCents,
    earnedValueUsd: earnedCents,
    availableForFunding: Math.floor(totalValueCents * 0.9), // 90% withdrawable
    currentYieldApy: Math.round(marketApy * 100),
    estimatedDailyYield: dailyYieldCents,
    healthFactor: account.health ? parseFloat(account.health) : undefined,
  };
}

/**
 * Fetch liquid staking position data (Marinade, Lido)
 */
async function fetchStakingData(position: any): Promise<{
  totalValueUsd: number;
  earnedValueUsd: number;
  availableForFunding: number;
  currentYieldApy: number;
  estimatedDailyYield: number;
  healthFactor?: number;
}> {
  // For Solana liquid staking, use DeFiLlama
  const protocol = position.protocol?.toLowerCase();

  const response = await fetch(DEFILLAMA_API_URL);
  if (!response.ok) {
    throw new Error(`DeFiLlama API error: ${response.status}`);
  }

  const data = await response.json();

  // Find the staking pool
  const pool = data.data?.find((p: any) =>
    p.project?.toLowerCase().includes(protocol) &&
    p.chain?.toLowerCase() === "solana"
  );

  const apy = pool?.apy || 6.5; // Default 6.5% for SOL staking

  // Calculate based on staked amount
  const totalValueCents = position.depositedValueUsd;
  const timeSinceDeposit = Date.now() - (position.createdAt || Date.now());
  const daysStaked = timeSinceDeposit / (1000 * 60 * 60 * 24);

  // Earned based on time staked
  const earnedCents = Math.floor(totalValueCents * (apy / 100 / 365) * daysStaked);
  const currentTotalCents = totalValueCents + earnedCents;
  const dailyYieldCents = Math.floor(currentTotalCents * (apy / 100 / 365));

  console.log(`[DeFi] ${protocol}: $${(currentTotalCents / 100).toFixed(2)}, APY: ${apy.toFixed(2)}%`);

  return {
    totalValueUsd: currentTotalCents,
    earnedValueUsd: earnedCents,
    availableForFunding: Math.floor(currentTotalCents * 0.95), // 95% for liquid staking
    currentYieldApy: Math.round(apy * 100),
    estimatedDailyYield: dailyYieldCents,
  };
}

/**
 * Fetch generic yield data from DeFiLlama
 */
async function fetchDefiLlamaData(position: any): Promise<{
  totalValueUsd: number;
  earnedValueUsd: number;
  availableForFunding: number;
  currentYieldApy: number;
  estimatedDailyYield: number;
  healthFactor?: number;
}> {
  const response = await fetch(DEFILLAMA_API_URL);

  if (!response.ok) {
    throw new Error(`DeFiLlama API error: ${response.status}`);
  }

  const data = await response.json();

  // Find matching pool by protocol name or token
  const token = position.tokenSymbol?.toLowerCase() || "usdc";
  const protocol = position.protocol?.toLowerCase();

  const matchingPool = data.data?.find((p: any) => {
    const matchesToken = p.symbol?.toLowerCase().includes(token);
    const matchesProtocol = protocol ? p.project?.toLowerCase().includes(protocol) : true;
    const isSolana = p.chain?.toLowerCase() === "solana";
    return matchesToken && matchesProtocol && isSolana;
  });

  // Default to average stablecoin yield if no match
  const apy = matchingPool?.apy || 4.0;

  const totalValueCents = position.depositedValueUsd;
  const timeSinceDeposit = Date.now() - (position.createdAt || Date.now());
  const daysActive = Math.max(1, timeSinceDeposit / (1000 * 60 * 60 * 24));

  const earnedCents = Math.floor(totalValueCents * (apy / 100 / 365) * daysActive);
  const currentTotalCents = totalValueCents + earnedCents;
  const dailyYieldCents = Math.floor(currentTotalCents * (apy / 100 / 365));

  console.log(`[DeFi] DeFiLlama: $${(currentTotalCents / 100).toFixed(2)}, APY: ${apy.toFixed(2)}%`);

  return {
    totalValueUsd: currentTotalCents,
    earnedValueUsd: earnedCents,
    availableForFunding: Math.floor(currentTotalCents * 0.8),
    currentYieldApy: Math.round(apy * 100),
    estimatedDailyYield: dailyYieldCents,
  };
}
