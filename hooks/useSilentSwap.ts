/**
 * DisCard 2035 - useSilentSwap Hook
 *
 * React hook for privacy swaps via SilentSwap SDK.
 * Supports cross-chain swaps between Solana and EVM chains.
 *
 * Features:
 * - Non-custodial shielded transactions
 * - Cross-chain support (Solana <-> EVM)
 * - CAIP-10/CAIP-19 standards
 * - Real-time order tracking
 */

import { useState, useCallback, useEffect } from "react";
import {
  getSilentSwapService,
  type SilentSwapQuote,
  type SilentSwapResult,
  type SilentSwapOrderStatus,
  type SilentSwapChain,
  type SwapRequest,
} from "@/services/silentSwapClient";
import { emitRefreshEvent } from "@/hooks/useRefreshStrategy";

// ============================================================================
// Types
// ============================================================================

export interface SilentSwapState {
  /** Current phase */
  phase:
    | "idle"
    | "quoting"
    | "quoted"
    | "confirming"
    | "executing"
    | "bridging"
    | "completed"
    | "failed";
  /** Active quote */
  quote?: SilentSwapQuote;
  /** Swap result */
  result?: SilentSwapResult;
  /** Error message */
  error?: string;
  /** Current step description */
  currentStep?: string;
}

export interface SilentSwapTokenInfo {
  mint: string;
  symbol: string;
  name: string;
  decimals: number;
  logoUri?: string;
}

// ============================================================================
// Hook
// ============================================================================

export function useSilentSwap() {
  const [state, setState] = useState<SilentSwapState>({ phase: "idle" });
  const [isLoading, setIsLoading] = useState(false);
  const [history, setHistory] = useState<SilentSwapOrderStatus[]>([]);
  const [isSilentSwapAvailable, setIsSilentSwapAvailable] = useState(false);

  const silentSwapService = getSilentSwapService();

  // Check service availability on mount
  useEffect(() => {
    const checkAvailability = async () => {
      const available = await silentSwapService.isAvailable();
      setIsSilentSwapAvailable(available);
    };
    checkAvailability();
  }, [silentSwapService]);

  /**
   * Get a swap quote from SilentSwap
   */
  const getQuote = useCallback(
    async (
      inputMint: string,
      outputMint: string,
      amount: bigint,
      userAddress: string,
      sourceChain: SilentSwapChain = "solana",
      destChain: SilentSwapChain = "solana",
      recipientAddress?: string
    ): Promise<SilentSwapQuote | null> => {
      console.log("[SilentSwap] Getting quote...");
      setIsLoading(true);
      setState({ phase: "quoting" });

      try {
        const request: SwapRequest = {
          inputMint,
          outputMint,
          amount,
          userAddress,
          sourceChain,
          destChain,
          recipientAddress,
        };

        const quote = await silentSwapService.getQuote(request);

        setState({
          phase: "quoted",
          quote,
          currentStep: "Quote received",
        });

        setIsLoading(false);
        return quote;
      } catch (error) {
        console.error("[SilentSwap] Quote failed:", error);
        setState({
          phase: "failed",
          error: error instanceof Error ? error.message : "Failed to get quote",
        });
        setIsLoading(false);
        return null;
      }
    },
    [silentSwapService]
  );

  /**
   * Execute swap with the quote
   */
  const executeSwap = useCallback(
    async (
      quote: SilentSwapQuote,
      walletAdapter: {
        signTransaction?: (tx: any) => Promise<any>;
        signMessage?: (msg: Uint8Array) => Promise<Uint8Array>;
      }
    ): Promise<SilentSwapResult | null> => {
      console.log("[SilentSwap] Executing swap:", quote.quoteId);
      setIsLoading(true);
      setState((prev) => ({ ...prev, phase: "executing", currentStep: "Preparing transaction..." }));

      try {
        const result = await silentSwapService.executeSwap(quote, walletAdapter);

        if (result.success) {
          setState({
            phase: "completed",
            quote,
            result,
            currentStep: "Swap completed",
          });
          // Trigger holdings refresh across the app
          emitRefreshEvent("swap_completed");
        } else {
          setState({
            phase: "failed",
            quote,
            result,
            error: result.error,
            currentStep: result.currentStep,
          });
        }

        // Refresh history
        setHistory(silentSwapService.getOrderHistory());

        setIsLoading(false);
        return result;
      } catch (error) {
        console.error("[SilentSwap] Execution failed:", error);
        setState({
          phase: "failed",
          quote,
          error: error instanceof Error ? error.message : "Swap failed",
        });
        setIsLoading(false);
        return null;
      }
    },
    [silentSwapService]
  );

  /**
   * Quick swap - get quote and execute in one call
   */
  const quickSwap = useCallback(
    async (
      inputMint: string,
      outputMint: string,
      amount: bigint,
      userAddress: string,
      walletAdapter: {
        signTransaction?: (tx: any) => Promise<any>;
        signMessage?: (msg: Uint8Array) => Promise<Uint8Array>;
      },
      sourceChain: SilentSwapChain = "solana",
      destChain: SilentSwapChain = "solana",
      recipientAddress?: string
    ): Promise<SilentSwapResult | null> => {
      const quote = await getQuote(
        inputMint,
        outputMint,
        amount,
        userAddress,
        sourceChain,
        destChain,
        recipientAddress
      );

      if (!quote) return null;

      return executeSwap(quote, walletAdapter);
    },
    [getQuote, executeSwap]
  );

  /**
   * Get order status
   */
  const getOrderStatus = useCallback(
    async (orderId: string): Promise<SilentSwapOrderStatus | null> => {
      return silentSwapService.getOrderStatus(orderId);
    },
    [silentSwapService]
  );

  /**
   * Refresh order history
   */
  const refreshHistory = useCallback(() => {
    setHistory(silentSwapService.getOrderHistory());
  }, [silentSwapService]);

  /**
   * Reset state
   */
  const reset = useCallback(() => {
    setState({ phase: "idle" });
    setIsLoading(false);
  }, []);

  /**
   * Format output for display
   */
  const formatOutput = useCallback(
    (quote: SilentSwapQuote, decimals: number): string => {
      const output = Number(quote.outputAmount) / Math.pow(10, decimals);
      return output.toFixed(6);
    },
    []
  );

  /**
   * Format cross-chain info
   */
  const formatCrossChainInfo = useCallback(
    (quote: SilentSwapQuote): { bridgeFee: string; estimatedTime: string } | null => {
      if (quote.sourceChain === quote.destChain) {
        return null;
      }

      return {
        bridgeFee: quote.bridgeFee
          ? `${(Number(quote.bridgeFee) / 1e9).toFixed(4)}`
          : "N/A",
        estimatedTime: quote.estimatedTime
          ? `~${Math.ceil(quote.estimatedTime / 60)} min`
          : "~3 min",
      };
    },
    []
  );

  /**
   * Get supported chains
   */
  const getSupportedChains = useCallback((): { id: SilentSwapChain; name: string }[] => {
    return silentSwapService.getSupportedChains();
  }, [silentSwapService]);

  /**
   * Check if swap is cross-chain
   */
  const isCrossChain = useCallback(
    (sourceChain: SilentSwapChain, destChain: SilentSwapChain): boolean => {
      return silentSwapService.isCrossChain(sourceChain, destChain);
    },
    [silentSwapService]
  );

  /**
   * Get privacy level indicator
   */
  const getPrivacyLevel = useCallback(
    (result?: SilentSwapResult): "high" | "medium" | "low" => {
      if (!result?.privacyMetrics) return "low";

      const metrics = result.privacyMetrics;
      if (metrics.amountShielded && metrics.addressesUnlinkable) {
        return "high";
      }
      if (metrics.amountShielded || metrics.addressesUnlinkable) {
        return "medium";
      }
      return "low";
    },
    []
  );

  return {
    // State
    state,
    isLoading,
    history,
    isSilentSwapAvailable,

    // Actions
    getQuote,
    executeSwap,
    quickSwap,
    getOrderStatus,
    refreshHistory,
    reset,

    // Helpers
    formatOutput,
    formatCrossChainInfo,
    getSupportedChains,
    isCrossChain,
    getPrivacyLevel,
  };
}

export default useSilentSwap;
