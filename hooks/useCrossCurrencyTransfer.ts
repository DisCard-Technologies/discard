/**
 * DisCard 2035 - useCrossCurrencyTransfer Hook
 *
 * Hook for managing cross-currency transfer state.
 * Extends transfer functionality with settlement currency selection.
 */

import { useState, useCallback, useMemo, useEffect } from "react";
import { useAction } from "convex/react";
import { api } from "@/convex/_generated/api";
import {
  SETTLEMENT_TOKENS,
  type SettlementToken,
  getSettlementToken,
  getDefaultSettlementToken,
} from "@/lib/transfer/settlement-tokens";

// ============================================================================
// Types
// ============================================================================

export interface SwapQuote {
  inputMint: string;
  inputAmount: string;
  outputMint: string;
  outputAmount: string;
  priceImpact: string;
  rate: number;
  estimatedOutput: number;
  estimatedOutputFormatted: string;
}

export interface CrossCurrencyState {
  /** Selected settlement token */
  settlementToken: SettlementToken;
  /** Whether a swap is required (different tokens) */
  needsSwap: boolean;
  /** Current swap quote */
  swapQuote: SwapQuote | null;
  /** Whether quote is loading */
  isLoadingQuote: boolean;
  /** Quote error if any */
  quoteError: string | null;
  /** Estimated amount recipient receives */
  estimatedReceived: number;
  /** Formatted estimated amount */
  estimatedReceivedFormatted: string;
}

export interface UseCrossCurrencyTransferOptions {
  /** Payment token mint address */
  paymentMint?: string;
  /** Payment amount in base units */
  paymentAmount?: string;
  /** Debounce delay for quote fetching */
  debounceMs?: number;
}

export interface UseCrossCurrencyTransferReturn extends CrossCurrencyState {
  /** Set settlement token */
  setSettlementToken: (token: SettlementToken) => void;
  /** Set settlement token by symbol */
  setSettlementTokenBySymbol: (symbol: string) => void;
  /** Refresh quote */
  refreshQuote: () => Promise<void>;
  /** Available settlement tokens */
  availableTokens: SettlementToken[];
  /** Check if token is same as payment token */
  isSameToken: (token: SettlementToken) => boolean;
}

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_DEBOUNCE_MS = 500;

// ============================================================================
// Hook Implementation
// ============================================================================

export function useCrossCurrencyTransfer(
  options: UseCrossCurrencyTransferOptions = {}
): UseCrossCurrencyTransferReturn {
  const {
    paymentMint,
    paymentAmount,
    debounceMs = DEFAULT_DEBOUNCE_MS,
  } = options;

  // State
  const [settlementToken, setSettlementTokenState] = useState<SettlementToken>(
    getDefaultSettlementToken()
  );
  const [swapQuote, setSwapQuote] = useState<SwapQuote | null>(null);
  const [isLoadingQuote, setIsLoadingQuote] = useState(false);
  const [quoteError, setQuoteError] = useState<string | null>(null);

  // Convex action
  const getSwapQuote = useAction(api.transfers.crossCurrency.getSwapQuote);

  // Computed values
  const needsSwap = useMemo(() => {
    if (!paymentMint) return false;
    return paymentMint !== settlementToken.mint;
  }, [paymentMint, settlementToken.mint]);

  const estimatedReceived = useMemo(() => {
    if (!needsSwap) {
      // Same token - no swap needed
      return paymentAmount ? parseInt(paymentAmount) : 0;
    }
    return swapQuote ? parseInt(swapQuote.outputAmount) : 0;
  }, [needsSwap, paymentAmount, swapQuote]);

  const estimatedReceivedFormatted = useMemo(() => {
    const amount = estimatedReceived / Math.pow(10, settlementToken.decimals);
    return amount.toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 6,
    });
  }, [estimatedReceived, settlementToken.decimals]);

  // Check if token is same as payment token
  const isSameToken = useCallback(
    (token: SettlementToken) => {
      return paymentMint === token.mint;
    },
    [paymentMint]
  );

  // Fetch quote when parameters change
  const fetchQuote = useCallback(async () => {
    if (!paymentMint || !paymentAmount || !needsSwap) {
      setSwapQuote(null);
      setQuoteError(null);
      return;
    }

    // Don't fetch if amount is 0 or invalid
    if (paymentAmount === "0" || parseInt(paymentAmount) <= 0) {
      setSwapQuote(null);
      return;
    }

    setIsLoadingQuote(true);
    setQuoteError(null);

    try {
      const result = await getSwapQuote({
        inputMint: paymentMint,
        outputMint: settlementToken.mint,
        amount: paymentAmount,
        slippageBps: 50, // 0.5% slippage
      });

      if (result.error) {
        setQuoteError(result.error);
        setSwapQuote(null);
      } else if (result.quote) {
        const inputAmount = parseInt(result.quote.inAmount);
        const outputAmount = parseInt(result.quote.outAmount);
        const rate = outputAmount / inputAmount;

        setSwapQuote({
          inputMint: result.quote.inputMint,
          inputAmount: result.quote.inAmount,
          outputMint: result.quote.outputMint,
          outputAmount: result.quote.outAmount,
          priceImpact: result.priceImpact,
          rate,
          estimatedOutput: outputAmount,
          estimatedOutputFormatted: (
            outputAmount / Math.pow(10, settlementToken.decimals)
          ).toLocaleString(undefined, {
            minimumFractionDigits: 2,
            maximumFractionDigits: 6,
          }),
        });
        setQuoteError(null);
      }
    } catch (err) {
      setQuoteError(err instanceof Error ? err.message : "Failed to get quote");
      setSwapQuote(null);
    } finally {
      setIsLoadingQuote(false);
    }
  }, [paymentMint, paymentAmount, settlementToken.mint, needsSwap, getSwapQuote, settlementToken.decimals]);

  // Debounced quote fetching
  useEffect(() => {
    if (!needsSwap) {
      setSwapQuote(null);
      setQuoteError(null);
      return;
    }

    const timer = setTimeout(() => {
      fetchQuote();
    }, debounceMs);

    return () => clearTimeout(timer);
  }, [paymentMint, paymentAmount, settlementToken.mint, needsSwap, debounceMs]);

  // Set settlement token
  const setSettlementToken = useCallback((token: SettlementToken) => {
    setSettlementTokenState(token);
    setSwapQuote(null);
    setQuoteError(null);
  }, []);

  // Set settlement token by symbol
  const setSettlementTokenBySymbol = useCallback((symbol: string) => {
    const token = getSettlementToken(symbol);
    if (token) {
      setSettlementToken(token);
    }
  }, [setSettlementToken]);

  // Refresh quote manually
  const refreshQuote = useCallback(async () => {
    await fetchQuote();
  }, [fetchQuote]);

  return {
    // State
    settlementToken,
    needsSwap,
    swapQuote,
    isLoadingQuote,
    quoteError,
    estimatedReceived,
    estimatedReceivedFormatted,

    // Actions
    setSettlementToken,
    setSettlementTokenBySymbol,
    refreshQuote,

    // Helpers
    availableTokens: SETTLEMENT_TOKENS,
    isSameToken,
  };
}

export default useCrossCurrencyTransfer;
