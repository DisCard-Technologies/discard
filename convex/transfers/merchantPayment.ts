/**
 * DisCard 2035 - Merchant Payment Functions
 *
 * Cross-currency payment support for merchant payments.
 * Enables paying with any stablecoin while merchant receives their settlement currency.
 */

import { v } from "convex/values";
import { action, query } from "../_generated/server";

// ============================================================================
// Types
// ============================================================================

interface JupiterQuoteResponse {
  inputMint: string;
  inAmount: string;
  outputMint: string;
  outAmount: string;
  otherAmountThreshold: string;
  swapMode: string;
  slippageBps: number;
  priceImpactPct: string;
  routePlan: Array<{
    swapInfo: {
      ammKey: string;
      label: string;
      inputMint: string;
      outputMint: string;
      inAmount: string;
      outAmount: string;
      feeAmount: string;
      feeMint: string;
    };
    percent: number;
  }>;
}

interface JupiterSwapResponse {
  swapTransaction: string;
  lastValidBlockHeight: number;
  prioritizationFeeLamports: number;
}

export interface MerchantPaymentQuote {
  /** Whether swap is needed (false if user has settlement token) */
  swapRequired: boolean;
  /** Amount user pays in source token (base units) */
  sourceAmount: string;
  /** Source token mint */
  sourceMint: string;
  /** Source token symbol */
  sourceSymbol: string;
  /** Source token decimals */
  sourceDecimals: number;
  /** Settlement amount requested by merchant (base units) */
  settlementAmount: string;
  /** Settlement token mint */
  settlementMint: string;
  /** Settlement token symbol */
  settlementSymbol: string;
  /** Settlement token decimals */
  settlementDecimals: number;
  /** Exchange rate (source per settlement) */
  exchangeRate: number;
  /** Platform fee (0.3% of settlement, in base units) */
  platformFee: string;
  /** Amount merchant receives after fees (base units) */
  merchantReceives: string;
  /** Price impact percentage */
  priceImpact: string;
  /** Jupiter quote response (for building transaction) */
  jupiterQuote: JupiterQuoteResponse | null;
  /** Quote expiry timestamp */
  expiresAt: number;
}

// ============================================================================
// Constants
// ============================================================================

/** Platform fee in basis points (0.3% = 30 bps) */
const PLATFORM_FEE_BPS = 30;

/** Default slippage in basis points (0.5% = 50 bps) */
const DEFAULT_SLIPPAGE_BPS = 50;

/** Quote validity period in milliseconds (30 seconds) */
const QUOTE_VALIDITY_MS = 30_000;

/** Settlement token configurations */
const SETTLEMENT_TOKENS: Record<string, { mint: string; decimals: number; symbol: string }> = {
  USDC: { mint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", decimals: 6, symbol: "USDC" },
  PYUSD: { mint: "2b1kV6DkPAnxd5ixfnxCpjxmKwqjjaYmCZfHsFu24GXo", decimals: 6, symbol: "PYUSD" },
  EURC: { mint: "HzwqbKZw8HxMN6bF2yFZNrht3c2iXXzpKcFu7uBEDKtr", decimals: 6, symbol: "EURC" },
  BRZ: { mint: "FtgGSFADXBtroxq8VCausXRr2of47QBf5AS1NtZCu4GD", decimals: 4, symbol: "BRZ" },
  MXNE: { mint: "E77cpQ4VncGmcAXX16LHFFzNBEBb2U7Ar7LBmZNfCgwL", decimals: 6, symbol: "MXNE" },
  VCHF: { mint: "AhhdRu5YZdjVkKR3wbnUDaymVQL2ucjMQ63sZ3LFHsch", decimals: 6, symbol: "VCHF" },
  VGBP: { mint: "C2oEjBbrwaaAg9zpcMvd4VKKhqBjFFzGKybxPFQN9sBN", decimals: 6, symbol: "VGBP" },
};

// ============================================================================
// Actions
// ============================================================================

/**
 * Get a quote for paying a merchant with a different token than they accept.
 *
 * Fee model: Merchant absorbs fees
 * - Customer pays: exact equivalent of settlement amount
 * - Merchant receives: settlement amount - platform fee (0.3%) - slippage
 */
export const getMerchantPaymentQuote = action({
  args: {
    /** User's source token mint (what they want to pay with) */
    sourceMint: v.string(),
    /** Source token symbol */
    sourceSymbol: v.string(),
    /** Source token decimals */
    sourceDecimals: v.number(),
    /** Settlement token mint (what merchant accepts) */
    settlementMint: v.string(),
    /** Amount merchant requested in settlement token (base units) */
    settlementAmount: v.string(),
    /** Optional custom slippage in basis points */
    slippageBps: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<{
    quote: MerchantPaymentQuote | null;
    error?: string;
  }> => {
    const JUPITER_API_KEY = process.env.JUPITER_API_KEY;
    const slippage = args.slippageBps ?? DEFAULT_SLIPPAGE_BPS;

    // Find settlement token info
    const settlementToken = Object.values(SETTLEMENT_TOKENS).find(
      (t) => t.mint === args.settlementMint
    );

    if (!settlementToken) {
      return {
        quote: null,
        error: `Unsupported settlement token: ${args.settlementMint}`,
      };
    }

    // Check if same currency (no swap needed)
    if (args.sourceMint === args.settlementMint) {
      const platformFee = calculatePlatformFee(args.settlementAmount, settlementToken.decimals);
      const merchantReceives = (BigInt(args.settlementAmount) - BigInt(platformFee)).toString();

      return {
        quote: {
          swapRequired: false,
          sourceAmount: args.settlementAmount,
          sourceMint: args.sourceMint,
          sourceSymbol: args.sourceSymbol,
          sourceDecimals: args.sourceDecimals,
          settlementAmount: args.settlementAmount,
          settlementMint: args.settlementMint,
          settlementSymbol: settlementToken.symbol,
          settlementDecimals: settlementToken.decimals,
          exchangeRate: 1,
          platformFee,
          merchantReceives,
          priceImpact: "0",
          jupiterQuote: null,
          expiresAt: Date.now() + QUOTE_VALIDITY_MS,
        },
      };
    }

    try {
      // Get Jupiter quote using ExactOut mode
      // We want the merchant to receive exactly (settlementAmount - platformFee)
      const platformFee = calculatePlatformFee(args.settlementAmount, settlementToken.decimals);
      const targetOutputAmount = (BigInt(args.settlementAmount) - BigInt(platformFee)).toString();

      const url = new URL("https://quote-api.jup.ag/v6/quote");
      url.searchParams.set("inputMint", args.sourceMint);
      url.searchParams.set("outputMint", args.settlementMint);
      url.searchParams.set("amount", targetOutputAmount);
      url.searchParams.set("slippageBps", slippage.toString());
      url.searchParams.set("swapMode", "ExactOut");

      const headers: Record<string, string> = {
        Accept: "application/json",
      };

      if (JUPITER_API_KEY) {
        headers["x-api-key"] = JUPITER_API_KEY;
      }

      const response = await fetch(url.toString(), { headers });

      if (!response.ok) {
        const errorText = await response.text();
        console.error("[MerchantPayment] Jupiter quote error:", errorText);
        return {
          quote: null,
          error: `Failed to get swap quote: ${response.status}`,
        };
      }

      const jupiterQuote: JupiterQuoteResponse = await response.json();

      // Calculate exchange rate
      const sourceAmountNum = parseFloat(jupiterQuote.inAmount) / Math.pow(10, args.sourceDecimals);
      const settlementAmountNum = parseFloat(args.settlementAmount) / Math.pow(10, settlementToken.decimals);
      const exchangeRate = sourceAmountNum / settlementAmountNum;

      return {
        quote: {
          swapRequired: true,
          sourceAmount: jupiterQuote.inAmount,
          sourceMint: args.sourceMint,
          sourceSymbol: args.sourceSymbol,
          sourceDecimals: args.sourceDecimals,
          settlementAmount: args.settlementAmount,
          settlementMint: args.settlementMint,
          settlementSymbol: settlementToken.symbol,
          settlementDecimals: settlementToken.decimals,
          exchangeRate,
          platformFee,
          merchantReceives: jupiterQuote.outAmount, // What Jupiter will output
          priceImpact: jupiterQuote.priceImpactPct,
          jupiterQuote,
          expiresAt: Date.now() + QUOTE_VALIDITY_MS,
        },
      };
    } catch (err) {
      console.error("[MerchantPayment] Quote error:", err);
      return {
        quote: null,
        error: err instanceof Error ? err.message : "Failed to get quote",
      };
    }
  },
});

/**
 * Build the atomic swap-to-merchant transaction.
 * Uses Jupiter's destinationTokenAccount to send output directly to merchant.
 */
export const buildMerchantPaymentTransaction = action({
  args: {
    /** Jupiter quote response from getMerchantPaymentQuote */
    quoteResponse: v.any(),
    /** User's public key (payer) */
    userPublicKey: v.string(),
    /** Merchant's wallet address (receives settlement token) */
    merchantAddress: v.string(),
    /** Merchant's token account for settlement token (ATA) */
    merchantTokenAccount: v.optional(v.string()),
    /** Priority fee setting */
    prioritizationFeeLamports: v.optional(v.union(v.number(), v.literal("auto"))),
  },
  handler: async (ctx, args): Promise<{
    transaction: string | null;
    lastValidBlockHeight: number;
    error?: string;
  }> => {
    const JUPITER_API_KEY = process.env.JUPITER_API_KEY;

    try {
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        Accept: "application/json",
      };

      if (JUPITER_API_KEY) {
        headers["x-api-key"] = JUPITER_API_KEY;
      }

      // Build swap request with destination set to merchant
      const swapRequest: Record<string, unknown> = {
        quoteResponse: args.quoteResponse,
        userPublicKey: args.userPublicKey,
        wrapAndUnwrapSol: true,
        dynamicComputeUnitLimit: true,
        prioritizationFeeLamports: args.prioritizationFeeLamports ?? "auto",
      };

      // If merchant token account provided, send output directly there
      if (args.merchantTokenAccount) {
        swapRequest.destinationTokenAccount = args.merchantTokenAccount;
      }

      const response = await fetch("https://quote-api.jup.ag/v6/swap", {
        method: "POST",
        headers,
        body: JSON.stringify(swapRequest),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error("[MerchantPayment] Jupiter swap build error:", errorText);
        return {
          transaction: null,
          lastValidBlockHeight: 0,
          error: `Failed to build swap: ${response.status}`,
        };
      }

      const swap: JupiterSwapResponse = await response.json();

      return {
        transaction: swap.swapTransaction,
        lastValidBlockHeight: swap.lastValidBlockHeight,
      };
    } catch (err) {
      console.error("[MerchantPayment] Swap build error:", err);
      return {
        transaction: null,
        lastValidBlockHeight: 0,
        error: err instanceof Error ? err.message : "Failed to build swap",
      };
    }
  },
});

/**
 * Validate that a swap route exists between two tokens.
 */
export const validateSwapRoute = action({
  args: {
    sourceMint: v.string(),
    settlementMint: v.string(),
  },
  handler: async (ctx, args): Promise<{
    valid: boolean;
    estimatedSlippage?: number;
    error?: string;
  }> => {
    // Same token = always valid, no swap needed
    if (args.sourceMint === args.settlementMint) {
      return { valid: true, estimatedSlippage: 0 };
    }

    try {
      // Try to get a small test quote
      const url = new URL("https://quote-api.jup.ag/v6/quote");
      url.searchParams.set("inputMint", args.sourceMint);
      url.searchParams.set("outputMint", args.settlementMint);
      url.searchParams.set("amount", "1000000"); // 1 unit with 6 decimals
      url.searchParams.set("slippageBps", "100");

      const response = await fetch(url.toString());

      if (!response.ok) {
        return {
          valid: false,
          error: "No swap route available",
        };
      }

      const quote: JupiterQuoteResponse = await response.json();

      return {
        valid: true,
        estimatedSlippage: parseFloat(quote.priceImpactPct),
      };
    } catch {
      return {
        valid: false,
        error: "Failed to validate swap route",
      };
    }
  },
});

/**
 * Get current exchange rate between two tokens.
 */
export const getExchangeRate = action({
  args: {
    sourceMint: v.string(),
    settlementMint: v.string(),
  },
  handler: async (ctx, args): Promise<{
    rate: number;
    sourcePrice: number;
    settlementPrice: number;
    error?: string;
  }> => {
    if (args.sourceMint === args.settlementMint) {
      return { rate: 1, sourcePrice: 1, settlementPrice: 1 };
    }

    try {
      const response = await fetch(
        `https://price.jup.ag/v4/price?ids=${args.sourceMint},${args.settlementMint}`
      );

      if (!response.ok) {
        return {
          rate: 0,
          sourcePrice: 0,
          settlementPrice: 0,
          error: `Price fetch failed: ${response.status}`,
        };
      }

      const data = await response.json();
      const sourcePrice = data.data?.[args.sourceMint]?.price || 0;
      const settlementPrice = data.data?.[args.settlementMint]?.price || 0;

      // Rate = how many source tokens for 1 settlement token
      const rate = settlementPrice > 0 ? sourcePrice / settlementPrice : 0;

      return {
        rate,
        sourcePrice,
        settlementPrice,
      };
    } catch (err) {
      return {
        rate: 0,
        sourcePrice: 0,
        settlementPrice: 0,
        error: err instanceof Error ? err.message : "Failed to get rate",
      };
    }
  },
});

// ============================================================================
// Helpers
// ============================================================================

/**
 * Calculate platform fee (0.3% of amount)
 */
function calculatePlatformFee(amount: string, decimals: number): string {
  const amountBigInt = BigInt(amount);
  // 0.3% = 30 / 10000
  const fee = (amountBigInt * BigInt(PLATFORM_FEE_BPS)) / BigInt(10000);
  return fee.toString();
}

/**
 * Format amount for display
 */
export function formatAmount(amount: string, decimals: number): string {
  const num = parseFloat(amount) / Math.pow(10, decimals);
  return num.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: decimals,
  });
}
