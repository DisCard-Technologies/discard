/**
 * Network Status Convex Functions
 * Blockchain network congestion and gas prices
 */
import { v } from "convex/values";
import { query } from "../_generated/server";

// Get network congestion data
export const getCongestion = query({
  args: {},
  handler: async (ctx) => {
    // In production, this would fetch real-time data from:
    // - Solana: getRecentPerformanceSamples, getSlot
    // - Ethereum: eth_gasPrice, eth_maxPriorityFeePerGas
    // - Polygon: similar to Ethereum

    // Mock congestion data for demo
    const networks = [
      {
        network: "solana",
        displayName: "Solana",
        congestionLevel: Math.random() < 0.3 ? "high" : Math.random() < 0.6 ? "medium" : "low",
        avgConfirmationTime: Math.floor(400 + Math.random() * 200), // 400-600ms
        baseFee: 5000, // lamports
        priorityFee: Math.floor(1000 + Math.random() * 5000),
        tps: Math.floor(2000 + Math.random() * 2000), // transactions per second
        lastBlockTime: Date.now() - Math.floor(Math.random() * 500),
      },
      {
        network: "ethereum",
        displayName: "Ethereum",
        congestionLevel: Math.random() < 0.4 ? "high" : Math.random() < 0.7 ? "medium" : "low",
        avgConfirmationTime: Math.floor(12000 + Math.random() * 6000), // 12-18s
        baseFee: Math.floor(20 + Math.random() * 80) * 1e9, // gwei to wei
        priorityFee: Math.floor(1 + Math.random() * 5) * 1e9,
        tps: Math.floor(12 + Math.random() * 8),
        lastBlockTime: Date.now() - Math.floor(Math.random() * 12000),
      },
      {
        network: "polygon",
        displayName: "Polygon",
        congestionLevel: Math.random() < 0.2 ? "high" : Math.random() < 0.5 ? "medium" : "low",
        avgConfirmationTime: Math.floor(2000 + Math.random() * 1000), // 2-3s
        baseFee: Math.floor(30 + Math.random() * 50) * 1e9,
        priorityFee: Math.floor(30 + Math.random() * 30) * 1e9,
        tps: Math.floor(50 + Math.random() * 50),
        lastBlockTime: Date.now() - Math.floor(Math.random() * 2000),
      },
    ];

    return {
      timestamp: Date.now(),
      networks,
      recommendation: networks.find((n) => n.congestionLevel === "low")?.network || "solana",
    };
  },
});

// Get gas estimates for a specific network
export const getGasEstimate = query({
  args: {
    network: v.string(),
    transactionType: v.optional(
      v.union(
        v.literal("transfer"),
        v.literal("swap"),
        v.literal("defi_withdraw"),
        v.literal("card_fund")
      )
    ),
  },
  handler: async (ctx, args) => {
    // Mock gas estimates based on transaction type
    const baseGas: Record<string, number> = {
      solana: 5000, // lamports
      ethereum: 21000, // base gas units
      polygon: 21000,
    };

    const multipliers: Record<string, number> = {
      transfer: 1,
      swap: 3,
      defi_withdraw: 2.5,
      card_fund: 1.5,
    };

    const network = args.network.toLowerCase();
    const txType = args.transactionType || "transfer";
    const base = baseGas[network] || 21000;
    const multiplier = multipliers[txType] || 1;

    const gasUnits = Math.floor(base * multiplier);
    
    // Mock gas prices
    const gasPrices: Record<string, { slow: number; normal: number; fast: number }> = {
      solana: { slow: 1000, normal: 5000, fast: 10000 },
      ethereum: { slow: 15e9, normal: 25e9, fast: 50e9 },
      polygon: { slow: 30e9, normal: 50e9, fast: 100e9 },
    };

    const prices = gasPrices[network] || gasPrices.ethereum;

    return {
      network,
      transactionType: txType,
      gasUnits,
      estimates: {
        slow: {
          price: prices.slow,
          totalCost: gasUnits * prices.slow,
          estimatedTime: network === "solana" ? 2000 : 120000,
        },
        normal: {
          price: prices.normal,
          totalCost: gasUnits * prices.normal,
          estimatedTime: network === "solana" ? 500 : 30000,
        },
        fast: {
          price: prices.fast,
          totalCost: gasUnits * prices.fast,
          estimatedTime: network === "solana" ? 400 : 15000,
        },
      },
    };
  },
});

