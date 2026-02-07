/**
 * Holdings & Explore Types
 *
 * Type definitions for:
 * - Jupiter Ultra API (user holdings)
 * - Jupiter Tokens API V2 (trending/discovery)
 * - DFlow Prediction Markets API
 * - RWA token registry
 */

import type { Id } from "../convex/_generated/dataModel";

// ============================================================================
// JUPITER ULTRA API TYPES (User Holdings)
// ============================================================================

export interface JupiterHolding {
  mint: string;
  symbol: string;
  name: string;
  decimals: number;
  balance: string; // Raw balance in smallest units
  balanceFormatted: number; // Human-readable balance
  valueUsd: number;
  priceUsd: number;
  change24h: number;
  logoUri?: string;
}

export interface JupiterHoldingsResponse {
  holdings: JupiterHolding[];
  totalValueUsd: number;
  lastUpdated: number;
}

export interface JupiterShieldData {
  mint: string;
  isVerified: boolean;
  warnings: ShieldWarning[];
  riskLevel: "safe" | "caution" | "danger";
}

export interface ShieldWarning {
  type:
    | "rugpull"
    | "honeypot"
    | "low_liquidity"
    | "concentration"
    | "unknown";
  message: string;
  severity: "low" | "medium" | "high";
}

// ============================================================================
// RWA TOKEN TYPES
// ============================================================================

export interface RwaToken extends JupiterHolding {
  issuer: string;
  underlyingAsset: string;
  rwaType: RwaType;
  yield?: number; // APY in percentage
  maturityDate?: string;
}

export type RwaType =
  | "yield-bearing-stablecoin"
  | "tokenized-fund"
  | "money-market"
  | "money-fund"
  | "treasury-bill"
  | "lending"
  | "private-credit";

export interface RwaTokenInfo {
  symbol: string;
  issuer: string;
  type: RwaType;
  description?: string;
  minInvestment?: number; // In USD
  expectedYield?: number; // APY percentage
}

/**
 * Known RWA token mints on Solana
 * These are filtered from Jupiter holdings to identify RWA positions
 *
 * NOTE: Mint addresses need to be verified - these are placeholders
 * TODO: Fetch actual mint addresses from on-chain data
 */
export const RWA_TOKEN_MINTS: Record<string, RwaTokenInfo> = {
  // Ondo Finance
  A1KLoBrKBde8Ty9qtNQUtq3C2ortoC3u7twggz7sEto6: {
    symbol: "USDY",
    issuer: "Ondo",
    type: "yield-bearing-stablecoin",
    description: "Yield-bearing stablecoin backed by US Treasuries",
    expectedYield: 5.0,
  },
  CXLBjMMcwkc17GfJtBos6rQCo1ypeH6eDbB82Kby4MRm: {
    symbol: "OUSG",
    issuer: "Ondo",
    type: "tokenized-fund",
    description: "Tokenized short-term US Treasuries fund",
    minInvestment: 100000,
    expectedYield: 4.5,
  },
  // BlackRock (placeholder mint - needs verification)
  "43m2ewFV5nDepieFjT9EmAQnc1HRtAF247RBpLGFem5F": {
    symbol: "BUIDL",
    issuer: "BlackRock",
    type: "money-market",
    description: "BlackRock USD Institutional Digital Liquidity Fund",
    minInvestment: 5000000,
    expectedYield: 4.8,
  },
  // Franklin Templeton (placeholder mint - needs verification)
  Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr: {
    symbol: "BENJI",
    issuer: "Franklin Templeton",
    type: "money-fund",
    description: "Franklin OnChain U.S. Government Money Fund",
    expectedYield: 4.5,
  },
  // VanEck (placeholder mint - needs verification)
  "3NZ9JMVBmGAqocybic2c7LQCJScmgsAZ6vQqTDzcqmJh": {
    symbol: "VBILL",
    issuer: "VanEck",
    type: "treasury-bill",
    description: "VanEck tokenized treasury-bill fund",
    minInvestment: 100000,
    expectedYield: 4.3,
  },
  // OpenEden (placeholder mint - needs verification)
  "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU": {
    symbol: "TBILL",
    issuer: "OpenEden",
    type: "treasury-bill",
    description: "Tokenized short-term US Treasury bills",
    expectedYield: 4.5,
  },
  // Maple Finance (placeholder mint - needs verification)
  Mapuuts5DjNrLM7mhCRiEbDyNtPwfQWKr3xmyLMM8fVp: {
    symbol: "syrupUSDC",
    issuer: "Maple",
    type: "lending",
    description: "Yield-bearing USDC from Maple lending pools",
    expectedYield: 8.0,
  },
  // Apollo (placeholder mint - needs verification)
  ApoL1k7GWhhmE8AvCXeFHVGrw3aKNc5SpJbT3V9UpGNu: {
    symbol: "ACRED",
    issuer: "Apollo",
    type: "private-credit",
    description: "Tokenized private credit fund",
    minInvestment: 25000,
    expectedYield: 9.5,
  },
};

/**
 * Check if a mint address is a known RWA token
 */
export function isRwaToken(mint: string): boolean {
  return mint in RWA_TOKEN_MINTS;
}

/**
 * Get RWA info for a mint address
 */
export function getRwaInfo(mint: string): RwaTokenInfo | undefined {
  return RWA_TOKEN_MINTS[mint];
}

// ============================================================================
// DFLOW / KALSHI PREDICTION MARKET TYPES
// ============================================================================

export interface MarketOutcome {
  id: string;
  label: string;
  probability: number;
  icon?: string;
  scoreBadge?: string;
  color?: string;
}

export interface PredictionMarket {
  marketId: string;
  ticker: string;
  eventId: string;
  question: string;
  status: "open" | "closed" | "resolved";
  yesPrice: number; // 0-1 probability
  noPrice: number; // 0-1 probability
  volume24h: number;
  endDate: string;
  category: string;
  resolutionSource?: string;
  // Extended fields for card display
  outcomes?: MarketOutcome[];
  isLive?: boolean;
  contextLabel?: string;
}

export interface PredictionPosition {
  marketId: string;
  market: PredictionMarket;
  side: "yes" | "no";
  mintAddress: string;
  shares: number;
  avgPrice: number; // What user paid per share
  currentPrice: number; // Current market price
  valueUsd: number; // Current value
  pnl: number; // Profit/loss in USD
  pnlPercent: number; // Profit/loss percentage
}

export interface DFlowHoldingsResponse {
  positions: PredictionPosition[];
  totalValueUsd: number;
  totalPnl: number;
}

export interface DFlowOutcomeToken {
  mint: string;
  marketId: string;
  side: "yes" | "no";
  balance: number;
}

// ============================================================================
// JUPITER TOKENS API V2 TYPES (Explore/Discovery)
// ============================================================================

export interface TrendingToken {
  mint: string;
  symbol: string;
  name: string;
  priceUsd: number;
  change24h: number;
  volume24h: number;
  marketCap?: number;
  logoUri?: string;
  verified: boolean;
  organicScore?: number;
}

export type TrendingCategory = "trending" | "top_traded" | "recent";
export type TrendingInterval = "5m" | "1h" | "6h" | "24h";

export interface TrendingTokensResponse {
  tokens: TrendingToken[];
  category: TrendingCategory;
  interval: TrendingInterval;
  updatedAt: number;
}

// ============================================================================
// HOOK RETURN TYPES
// ============================================================================

export interface UseTokenHoldingsReturn {
  holdings: JupiterHolding[];
  totalValue: number;
  isLoading: boolean;
  isRefreshing: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  lastUpdated: Date | null;
  /** Whether data is stale (>5 min old) */
  isStale: boolean;
  /** Human-readable age (e.g., "2m ago", "1h ago") */
  ageText: string | null;
}

export interface UseRwaHoldingsReturn {
  rwaTokens: RwaToken[];
  totalValue: number;
  isLoading: boolean;
  isRefreshing: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

export interface UsePredictionMarketsReturn {
  positions: PredictionPosition[];
  totalValue: number;
  totalPnl: number;
  isLoading: boolean;
  isRefreshing: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

export interface UseTrendingTokensReturn {
  tokens: TrendingToken[];
  category: TrendingCategory;
  interval: TrendingInterval;
  isLoading: boolean;
  error: string | null;
  setCategory: (category: TrendingCategory) => void;
  setInterval: (interval: TrendingInterval) => void;
  refresh: () => Promise<void>;
}

export interface UseRwaOpportunitiesReturn {
  opportunities: (RwaTokenInfo & { mint: string })[];
  isLoading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  filterType: RwaType | undefined;
  setFilterType: (type: RwaType | undefined) => void;
  minYield: number | undefined;
  setMinYield: (yield_: number | undefined) => void;
  availableTypes: RwaType[];
  availableIssuers: string[];
}

export interface UseOpenMarketsReturn {
  markets: PredictionMarket[];
  isLoading: boolean;
  error: string | null;
  categories: string[];
  selectedCategory: string | null;
  setCategory: (category: string | null) => void;
  refresh: () => Promise<void>;
}

// ============================================================================
// CONVEX DOCUMENT TYPES
// ============================================================================

export interface TokenHoldingDoc {
  _id: Id<"tokenHoldings">;
  walletAddress: string;
  mint: string;
  symbol: string;
  name: string;
  balance: string;
  valueUsd: number;
  priceUsd: number;
  change24h: number;
  logoUri?: string;
  isRwa?: boolean;
  updatedAt: number;
}

export interface PredictionPositionDoc {
  _id: Id<"predictionPositions">;
  userId: Id<"users">;
  walletAddress: string;
  marketId: string;
  ticker: string;
  question: string;
  side: "yes" | "no";
  mintAddress: string;
  shares: number;
  avgPrice: number;
  currentPrice: number;
  valueUsd: number;
  pnl: number;
  pnlPercent: number;
  updatedAt: number;
}

export interface TrendingTokensDoc {
  _id: Id<"trendingTokens">;
  category: TrendingCategory;
  interval: string;
  tokens: TrendingToken[];
  updatedAt: number;
}
