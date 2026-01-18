/**
 * Dynamic Fee Estimation for Solana Transfers
 *
 * Provides real-time fee estimation based on:
 * - Recent prioritization fees from the network
 * - Base transaction fee (5000 lamports)
 * - Optional ATA (Associated Token Account) rent
 * - USD conversion using current SOL price
 */

import { Connection, PublicKey } from '@solana/web3.js';

// Constants
const BASE_FEE_LAMPORTS = 5000; // 0.000005 SOL
const ATA_RENT_LAMPORTS = 2039280; // ~0.002 SOL for creating an ATA
const LAMPORTS_PER_SOL = 1_000_000_000;

// RPC URL from environment
const SOLANA_RPC_URL =
  process.env.EXPO_PUBLIC_HELIUS_RPC_URL ||
  process.env.EXPO_PUBLIC_SOLANA_RPC_URL ||
  'https://api.mainnet-beta.solana.com';

export interface TransferFees {
  networkFee: number; // Base fee in SOL
  networkFeeUsd: number; // Base fee in USD
  platformFee: number; // Platform fee (currently 0)
  priorityFee: number; // Priority fee in SOL
  priorityFeeUsd: number; // Priority fee in USD
  ataRent: number; // ATA rent in SOL (if needed)
  ataRentUsd: number; // ATA rent in USD
  totalFeesUsd: number; // Total fees in USD
  totalCostUsd: number; // Amount + total fees in USD
}

export interface FeeEstimateParams {
  amountUsd?: number; // Transfer amount in USD (for calculating total)
  includeAtaRent?: boolean; // Whether recipient needs a new ATA
  solPriceUsd?: number; // Current SOL price (optional, fetched if not provided)
}

// Cache for SOL price (5 minute TTL)
let cachedSolPrice: number | null = null;
let solPriceCacheTime: number = 0;
const SOL_PRICE_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/**
 * Fetch current SOL price in USD
 */
export async function getSolPriceUsd(): Promise<number> {
  const now = Date.now();

  // Return cached price if still valid
  if (cachedSolPrice && now - solPriceCacheTime < SOL_PRICE_CACHE_TTL) {
    return cachedSolPrice;
  }

  try {
    // Use CoinGecko simple price API
    const response = await fetch(
      'https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd',
      { method: 'GET', headers: { Accept: 'application/json' } }
    );

    if (response.ok) {
      const data = await response.json();
      if (data?.solana?.usd) {
        const price: number = data.solana.usd;
        cachedSolPrice = price;
        solPriceCacheTime = now;
        return price;
      }
    }
  } catch (error) {
    console.warn('[Fees] Failed to fetch SOL price:', error);
  }

  // Fallback to a reasonable estimate if fetch fails
  return cachedSolPrice ?? 150; // Use cached or fallback
}

/**
 * Get recent prioritization fees from the network
 */
export async function getRecentPriorityFee(
  connection?: Connection
): Promise<number> {
  try {
    const conn = connection || new Connection(SOLANA_RPC_URL, 'confirmed');
    const recentFees = await conn.getRecentPrioritizationFees();

    if (recentFees && recentFees.length > 0) {
      // Get the median priority fee from recent slots
      const fees = recentFees
        .map((f) => f.prioritizationFee)
        .sort((a, b) => a - b);
      const medianIndex = Math.floor(fees.length / 2);
      const medianFee = fees[medianIndex] || 0;

      // Cap at a reasonable maximum (10,000 lamports = 0.00001 SOL)
      return Math.min(medianFee, 10000);
    }
  } catch (error) {
    console.warn('[Fees] Failed to get priority fees:', error);
  }

  // Default priority fee if fetch fails (1000 lamports)
  return 1000;
}

/**
 * Estimate transfer fees with real network data
 */
export async function estimateTransferFees(
  params: FeeEstimateParams = {}
): Promise<TransferFees> {
  const { amountUsd = 0, includeAtaRent = false, solPriceUsd } = params;

  // Get current SOL price
  const solPrice = solPriceUsd || (await getSolPriceUsd());

  // Get recent priority fee
  const priorityFeeLamports = await getRecentPriorityFee();

  // Calculate fees in SOL
  const networkFeeSol = BASE_FEE_LAMPORTS / LAMPORTS_PER_SOL;
  const priorityFeeSol = priorityFeeLamports / LAMPORTS_PER_SOL;
  const ataRentSol = includeAtaRent ? ATA_RENT_LAMPORTS / LAMPORTS_PER_SOL : 0;

  // Convert to USD
  const networkFeeUsd = networkFeeSol * solPrice;
  const priorityFeeUsd = priorityFeeSol * solPrice;
  const ataRentUsd = ataRentSol * solPrice;

  // Calculate totals
  const totalFeesUsd = networkFeeUsd + priorityFeeUsd + ataRentUsd;
  const totalCostUsd = amountUsd + totalFeesUsd;

  return {
    networkFee: networkFeeSol,
    networkFeeUsd: Math.max(0.001, networkFeeUsd), // Minimum display of $0.001
    platformFee: 0, // No platform fee currently
    priorityFee: priorityFeeSol,
    priorityFeeUsd,
    ataRent: ataRentSol,
    ataRentUsd,
    totalFeesUsd: Math.max(0.001, totalFeesUsd),
    totalCostUsd,
  };
}

/**
 * Quick fee estimate with just USD conversion (for display)
 * Uses cached/default values for speed
 */
export function quickEstimateFees(
  amountUsd: number = 0,
  solPriceUsd: number = 150,
  includeAtaRent: boolean = false
): TransferFees {
  const networkFeeSol = BASE_FEE_LAMPORTS / LAMPORTS_PER_SOL;
  const priorityFeeSol = 1000 / LAMPORTS_PER_SOL; // Default 1000 lamports
  const ataRentSol = includeAtaRent ? ATA_RENT_LAMPORTS / LAMPORTS_PER_SOL : 0;

  const networkFeeUsd = networkFeeSol * solPriceUsd;
  const priorityFeeUsd = priorityFeeSol * solPriceUsd;
  const ataRentUsd = ataRentSol * solPriceUsd;

  const totalFeesUsd = networkFeeUsd + priorityFeeUsd + ataRentUsd;

  return {
    networkFee: networkFeeSol,
    networkFeeUsd: Math.max(0.001, networkFeeUsd),
    platformFee: 0,
    priorityFee: priorityFeeSol,
    priorityFeeUsd,
    ataRent: ataRentSol,
    ataRentUsd,
    totalFeesUsd: Math.max(0.001, totalFeesUsd),
    totalCostUsd: amountUsd + totalFeesUsd,
  };
}
