/**
 * DisCard 2035 - Cross-Currency Transfer Functions
 *
 * Jupiter Ultra API integration for settlement currency swaps.
 * Enables sending in one token and recipient receiving another.
 */

import { v } from "convex/values";
import { action } from "../_generated/server";

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

// ============================================================================
// Actions
// ============================================================================

/**
 * Get swap quote from Jupiter Ultra API
 */
export const getSwapQuote = action({
  args: {
    inputMint: v.string(),
    outputMint: v.string(),
    amount: v.string(), // Amount in base units (lamports/smallest unit)
    slippageBps: v.optional(v.number()), // Slippage in basis points (default: 50 = 0.5%)
  },
  handler: async (ctx, args): Promise<{
    quote: JupiterQuoteResponse | null;
    estimatedOutput: string;
    priceImpact: string;
    error?: string;
  }> => {
    const JUPITER_API_KEY = process.env.JUPITER_API_KEY;
    const slippage = args.slippageBps || 50;

    try {
      const url = new URL("https://quote-api.jup.ag/v6/quote");
      url.searchParams.set("inputMint", args.inputMint);
      url.searchParams.set("outputMint", args.outputMint);
      url.searchParams.set("amount", args.amount);
      url.searchParams.set("slippageBps", slippage.toString());
      url.searchParams.set("swapMode", "ExactIn");

      const headers: Record<string, string> = {
        "Accept": "application/json",
      };

      if (JUPITER_API_KEY) {
        headers["x-api-key"] = JUPITER_API_KEY;
      }

      const response = await fetch(url.toString(), { headers });

      if (!response.ok) {
        const errorText = await response.text();
        console.error("[CrossCurrency] Jupiter quote error:", errorText);
        return {
          quote: null,
          estimatedOutput: "0",
          priceImpact: "0",
          error: `Quote failed: ${response.status}`,
        };
      }

      const quote: JupiterQuoteResponse = await response.json();

      return {
        quote,
        estimatedOutput: quote.outAmount,
        priceImpact: quote.priceImpactPct,
      };
    } catch (err) {
      console.error("[CrossCurrency] Quote error:", err);
      return {
        quote: null,
        estimatedOutput: "0",
        priceImpact: "0",
        error: err instanceof Error ? err.message : "Failed to get quote",
      };
    }
  },
});

/**
 * Build swap transaction from Jupiter
 */
export const buildSwapTransaction = action({
  args: {
    quoteResponse: v.any(), // JupiterQuoteResponse
    userPublicKey: v.string(),
    wrapUnwrapSOL: v.optional(v.boolean()),
    dynamicComputeUnitLimit: v.optional(v.boolean()),
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
        "Accept": "application/json",
      };

      if (JUPITER_API_KEY) {
        headers["x-api-key"] = JUPITER_API_KEY;
      }

      const response = await fetch("https://quote-api.jup.ag/v6/swap", {
        method: "POST",
        headers,
        body: JSON.stringify({
          quoteResponse: args.quoteResponse,
          userPublicKey: args.userPublicKey,
          wrapAndUnwrapSol: args.wrapUnwrapSOL ?? true,
          dynamicComputeUnitLimit: args.dynamicComputeUnitLimit ?? true,
          prioritizationFeeLamports: args.prioritizationFeeLamports ?? "auto",
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error("[CrossCurrency] Jupiter swap error:", errorText);
        return {
          transaction: null,
          lastValidBlockHeight: 0,
          error: `Swap failed: ${response.status}`,
        };
      }

      const swap: JupiterSwapResponse = await response.json();

      return {
        transaction: swap.swapTransaction,
        lastValidBlockHeight: swap.lastValidBlockHeight,
      };
    } catch (err) {
      console.error("[CrossCurrency] Swap build error:", err);
      return {
        transaction: null,
        lastValidBlockHeight: 0,
        error: err instanceof Error ? err.message : "Failed to build swap",
      };
    }
  },
});

/**
 * Get token price in USD from Jupiter
 */
export const getTokenPrice = action({
  args: {
    mintAddress: v.string(),
  },
  handler: async (ctx, args): Promise<{
    price: number;
    error?: string;
  }> => {
    try {
      const response = await fetch(
        `https://price.jup.ag/v4/price?ids=${args.mintAddress}`
      );

      if (!response.ok) {
        return {
          price: 0,
          error: `Price fetch failed: ${response.status}`,
        };
      }

      const data = await response.json();
      const priceData = data.data?.[args.mintAddress];

      return {
        price: priceData?.price || 0,
      };
    } catch (err) {
      return {
        price: 0,
        error: err instanceof Error ? err.message : "Failed to get price",
      };
    }
  },
});

/**
 * Get swap quote with ExactOut mode (specify output amount, get required input)
 * Useful for merchant payments where you need to deliver an exact amount.
 */
export const getExactOutQuote = action({
  args: {
    inputMint: v.string(),
    outputMint: v.string(),
    outputAmount: v.string(), // Exact amount to receive (in base units)
    slippageBps: v.optional(v.number()), // Slippage in basis points (default: 50 = 0.5%)
  },
  handler: async (ctx, args): Promise<{
    quote: JupiterQuoteResponse | null;
    requiredInput: string;
    priceImpact: string;
    error?: string;
  }> => {
    const JUPITER_API_KEY = process.env.JUPITER_API_KEY;
    const slippage = args.slippageBps || 50;

    try {
      const url = new URL("https://quote-api.jup.ag/v6/quote");
      url.searchParams.set("inputMint", args.inputMint);
      url.searchParams.set("outputMint", args.outputMint);
      url.searchParams.set("amount", args.outputAmount);
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
        console.error("[CrossCurrency] Jupiter ExactOut quote error:", errorText);
        return {
          quote: null,
          requiredInput: "0",
          priceImpact: "0",
          error: `ExactOut quote failed: ${response.status}`,
        };
      }

      const quote: JupiterQuoteResponse = await response.json();

      return {
        quote,
        requiredInput: quote.inAmount,
        priceImpact: quote.priceImpactPct,
      };
    } catch (err) {
      console.error("[CrossCurrency] ExactOut quote error:", err);
      return {
        quote: null,
        requiredInput: "0",
        priceImpact: "0",
        error: err instanceof Error ? err.message : "Failed to get ExactOut quote",
      };
    }
  },
});

/**
 * Get exchange rate between two tokens
 */
export const getExchangeRate = action({
  args: {
    inputMint: v.string(),
    outputMint: v.string(),
  },
  handler: async (ctx, args): Promise<{
    rate: number;
    inputPrice: number;
    outputPrice: number;
    error?: string;
  }> => {
    try {
      const response = await fetch(
        `https://price.jup.ag/v4/price?ids=${args.inputMint},${args.outputMint}`
      );

      if (!response.ok) {
        return {
          rate: 0,
          inputPrice: 0,
          outputPrice: 0,
          error: `Price fetch failed: ${response.status}`,
        };
      }

      const data = await response.json();
      const inputPrice = data.data?.[args.inputMint]?.price || 0;
      const outputPrice = data.data?.[args.outputMint]?.price || 0;

      const rate = outputPrice > 0 ? inputPrice / outputPrice : 0;

      return {
        rate,
        inputPrice,
        outputPrice,
      };
    } catch (err) {
      return {
        rate: 0,
        inputPrice: 0,
        outputPrice: 0,
        error: err instanceof Error ? err.message : "Failed to get rate",
      };
    }
  },
});
