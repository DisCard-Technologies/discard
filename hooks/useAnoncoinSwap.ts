/**
 * DisCard 2035 - useAnoncoinSwap Hook
 *
 * React hook for confidential token swaps that hide amounts while
 * still getting best-price routing from Jupiter.
 *
 * Features:
 * - Encrypted swap amounts via Arcium MPC
 * - Stealth addresses for unlinkable outputs
 * - MEV protection
 * - Fallback to regular Jupiter when MPC unavailable
 */

import { useState, useCallback, useEffect } from "react";
import {
  getAnoncoinSwapService,
  type ConfidentialSwapRequest,
  type ConfidentialSwapQuote,
  type ConfidentialSwapResult,
  type SwapHistory,
} from "@/services/anoncoinSwapClient";

// ============================================================================
// Types
// ============================================================================

export interface SwapState {
  /** Current phase */
  phase:
    | "idle"
    | "quoting"
    | "quoted"
    | "confirming"
    | "executing"
    | "completed"
    | "failed";
  /** Active quote */
  quote?: ConfidentialSwapQuote;
  /** Swap result */
  result?: ConfidentialSwapResult;
  /** Error message */
  error?: string;
}

export interface SwapTokenInfo {
  mint: string;
  symbol: string;
  name: string;
  decimals: number;
  logoUri?: string;
}

// ============================================================================
// Hook
// ============================================================================

export function useAnoncoinSwap() {
  const [state, setState] = useState<SwapState>({ phase: "idle" });
  const [isLoading, setIsLoading] = useState(false);
  const [history, setHistory] = useState<SwapHistory[]>([]);
  const [isConfidentialAvailable, setIsConfidentialAvailable] = useState(false);

  const anoncoinService = getAnoncoinSwapService();

  // Check service availability on mount
  useEffect(() => {
    const checkAvailability = async () => {
      const status = await anoncoinService.getStatus();
      setIsConfidentialAvailable(status.confidentialEnabled);
    };
    checkAvailability();
  }, [anoncoinService]);

  /**
   * Get a confidential swap quote
   */
  const getQuote = useCallback(
    async (
      inputMint: string,
      outputMint: string,
      amount: bigint,
      userAddress: string,
      useStealthOutput: boolean = true
    ): Promise<ConfidentialSwapQuote | null> => {
      console.log("[AnoncoinSwap] Getting quote...");
      setIsLoading(true);
      setState({ phase: "quoting" });

      try {
        const request: ConfidentialSwapRequest = {
          inputMint,
          outputMint,
          amount,
          userAddress,
          useStealthOutput,
        };

        const quote = await anoncoinService.getConfidentialQuote(request);

        setState({
          phase: "quoted",
          quote,
        });

        setIsLoading(false);
        return quote;
      } catch (error) {
        console.error("[AnoncoinSwap] Quote failed:", error);
        setState({
          phase: "failed",
          error: error instanceof Error ? error.message : "Failed to get quote",
        });
        setIsLoading(false);
        return null;
      }
    },
    [anoncoinService]
  );

  /**
   * Execute the confidential swap
   */
  const executeSwap = useCallback(
    async (
      quote: ConfidentialSwapQuote,
      userPrivateKey: Uint8Array
    ): Promise<ConfidentialSwapResult | null> => {
      console.log("[AnoncoinSwap] Executing swap:", quote.requestId);
      setIsLoading(true);
      setState((prev) => ({ ...prev, phase: "executing" }));

      try {
        const result = await anoncoinService.executeConfidentialSwap(
          quote,
          userPrivateKey
        );

        if (result.success) {
          setState({
            phase: "completed",
            quote,
            result,
          });
        } else {
          setState({
            phase: "failed",
            quote,
            result,
            error: result.error,
          });
        }

        // Refresh history
        setHistory(anoncoinService.getSwapHistory());

        setIsLoading(false);
        return result;
      } catch (error) {
        console.error("[AnoncoinSwap] Execution failed:", error);
        setState({
          phase: "failed",
          quote,
          error: error instanceof Error ? error.message : "Swap failed",
        });
        setIsLoading(false);
        return null;
      }
    },
    [anoncoinService]
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
      userPrivateKey: Uint8Array,
      useStealthOutput: boolean = true
    ): Promise<ConfidentialSwapResult | null> => {
      const quote = await getQuote(
        inputMint,
        outputMint,
        amount,
        userAddress,
        useStealthOutput
      );

      if (!quote) return null;

      return executeSwap(quote, userPrivateKey);
    },
    [getQuote, executeSwap]
  );

  /**
   * Claim funds from stealth address
   */
  const claimStealthOutput = useCallback(
    async (
      stealthAddress: string,
      viewingKey: string,
      destinationAddress: string
    ) => {
      console.log("[AnoncoinSwap] Claiming stealth output...");
      setIsLoading(true);

      try {
        const result = await anoncoinService.claimStealthOutput(
          stealthAddress,
          viewingKey,
          destinationAddress
        );

        setIsLoading(false);
        return result;
      } catch (error) {
        console.error("[AnoncoinSwap] Claim failed:", error);
        setIsLoading(false);
        return {
          success: false,
          error: error instanceof Error ? error.message : "Claim failed",
        };
      }
    },
    [anoncoinService]
  );

  /**
   * Refresh swap history
   */
  const refreshHistory = useCallback(() => {
    setHistory(anoncoinService.getSwapHistory());
  }, [anoncoinService]);

  /**
   * Reset state
   */
  const reset = useCallback(() => {
    setState({ phase: "idle" });
    setIsLoading(false);
  }, []);

  /**
   * Format output range for display
   */
  const formatOutputRange = useCallback(
    (quote: ConfidentialSwapQuote, decimals: number): string => {
      const min = Number(quote.estimatedOutputRange.min) / Math.pow(10, decimals);
      const max = Number(quote.estimatedOutputRange.max) / Math.pow(10, decimals);
      return `${min.toFixed(4)} - ${max.toFixed(4)}`;
    },
    []
  );

  /**
   * Get privacy level indicator
   */
  const getPrivacyLevel = useCallback(
    (result?: ConfidentialSwapResult): "high" | "medium" | "low" => {
      if (!result?.privacyMetrics) return "low";

      const metrics = result.privacyMetrics;
      if (
        metrics.amountHidden &&
        metrics.addressesUnlinkable &&
        metrics.mevProtection === "full"
      ) {
        return "high";
      }
      if (metrics.amountHidden || metrics.addressesUnlinkable) {
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
    isConfidentialAvailable,

    // Actions
    getQuote,
    executeSwap,
    quickSwap,
    claimStealthOutput,
    refreshHistory,
    reset,

    // Helpers
    formatOutputRange,
    getPrivacyLevel,
  };
}

export default useAnoncoinSwap;
