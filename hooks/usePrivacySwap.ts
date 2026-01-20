/**
 * DisCard 2035 - usePrivacySwap Hook
 *
 * Unified privacy swap hook with hybrid auto-selection between providers:
 * - Anoncoin (Arcium MPC): Solana-only, fast execution
 * - SilentSwap: Cross-chain support, shielded transactions
 *
 * Auto-selection Logic:
 * - Cross-chain swap selected -> SilentSwap (only option, showcases integration)
 * - Solana-only swap -> Anoncoin default (faster UX, but SilentSwap available)
 */

import { useState, useCallback, useMemo, useEffect } from "react";
import { useAnoncoinSwap, type SwapState as AnoncoinSwapState } from "./useAnoncoinSwap";
import { useSilentSwap, type SilentSwapState } from "./useSilentSwap";
import type { SilentSwapChain } from "@/services/silentSwapClient";
import type { ConfidentialSwapQuote, ConfidentialSwapResult } from "@/services/anoncoinSwapClient";
import type { SilentSwapQuote, SilentSwapResult } from "@/services/silentSwapClient";

// ============================================================================
// Types
// ============================================================================

export type PrivacyProvider = "anoncoin" | "silentswap";

export type Chain = SilentSwapChain;

export interface PrivacySwapOptions {
  fromChain?: Chain;
  toChain?: Chain;
}

export type PrivacySwapPhase =
  | "idle"
  | "quoting"
  | "quoted"
  | "confirming"
  | "executing"
  | "bridging"
  | "completed"
  | "failed";

export interface PrivacySwapState {
  phase: PrivacySwapPhase;
  quote?: ConfidentialSwapQuote | SilentSwapQuote;
  result?: ConfidentialSwapResult | SilentSwapResult;
  error?: string;
  currentStep?: string;
}

// ============================================================================
// Hook
// ============================================================================

export function usePrivacySwap(options: PrivacySwapOptions = {}) {
  const { fromChain = "solana", toChain = "solana" } = options;

  // Provider hooks
  const anoncoin = useAnoncoinSwap();
  const silentswap = useSilentSwap();

  // Chain state
  const [sourceChain, setSourceChain] = useState<Chain>(fromChain);
  const [destChain, setDestChain] = useState<Chain>(toChain);

  // Manual provider override
  const [manualProvider, setManualProvider] = useState<PrivacyProvider | null>(null);

  // Hybrid auto-selection: cross-chain = SilentSwap, same-chain = Anoncoin
  const isCrossChain = sourceChain !== destChain;

  // Auto-select based on chain selection, unless manually overridden
  const activeProvider = useMemo((): PrivacyProvider => {
    if (manualProvider) return manualProvider;
    // Cross-chain MUST use SilentSwap (Anoncoin doesn't support it)
    if (isCrossChain) return "silentswap";
    // Same-chain defaults to Anoncoin (faster)
    return "anoncoin";
  }, [manualProvider, isCrossChain]);

  // Available providers based on chain selection
  const availableProviders = useMemo((): PrivacyProvider[] => {
    if (isCrossChain) {
      // Cross-chain: only SilentSwap available
      return silentswap.isSilentSwapAvailable ? ["silentswap"] : [];
    }
    // Same-chain: both available
    const providers: PrivacyProvider[] = [];
    if (anoncoin.isConfidentialAvailable) providers.push("anoncoin");
    if (silentswap.isSilentSwapAvailable) providers.push("silentswap");
    return providers;
  }, [isCrossChain, anoncoin.isConfidentialAvailable, silentswap.isSilentSwapAvailable]);

  // Reset manual selection when chains change
  useEffect(() => {
    setManualProvider(null);
  }, [sourceChain, destChain]);

  // Sync chains from options
  useEffect(() => {
    setSourceChain(fromChain);
  }, [fromChain]);

  useEffect(() => {
    setDestChain(toChain);
  }, [toChain]);

  // Combined state from active provider
  const state = useMemo((): PrivacySwapState => {
    if (activeProvider === "anoncoin") {
      return {
        phase: anoncoin.state.phase as PrivacySwapPhase,
        quote: anoncoin.state.quote,
        result: anoncoin.state.result,
        error: anoncoin.state.error,
      };
    }
    return {
      phase: silentswap.state.phase as PrivacySwapPhase,
      quote: silentswap.state.quote,
      result: silentswap.state.result,
      error: silentswap.state.error,
      currentStep: silentswap.state.currentStep,
    };
  }, [activeProvider, anoncoin.state, silentswap.state]);

  // Loading state
  const isLoading = activeProvider === "anoncoin" ? anoncoin.isLoading : silentswap.isLoading;

  /**
   * Get quote from active provider
   */
  const getQuote = useCallback(
    async (
      inputMint: string,
      outputMint: string,
      amount: bigint,
      userAddress: string,
      useStealthOutput: boolean = true
    ) => {
      if (activeProvider === "anoncoin") {
        return anoncoin.getQuote(inputMint, outputMint, amount, userAddress, useStealthOutput);
      }
      return silentswap.getQuote(
        inputMint,
        outputMint,
        amount,
        userAddress,
        sourceChain,
        destChain
      );
    },
    [activeProvider, anoncoin, silentswap, sourceChain, destChain]
  );

  /**
   * Execute swap with active provider
   */
  const executeSwap = useCallback(
    async (
      quote: ConfidentialSwapQuote | SilentSwapQuote,
      walletAdapter: any
    ) => {
      if (activeProvider === "anoncoin") {
        // Anoncoin uses private key
        return anoncoin.executeSwap(quote as ConfidentialSwapQuote, walletAdapter);
      }
      // SilentSwap uses wallet adapter
      return silentswap.executeSwap(quote as SilentSwapQuote, walletAdapter);
    },
    [activeProvider, anoncoin, silentswap]
  );

  /**
   * Quick swap
   */
  const quickSwap = useCallback(
    async (
      inputMint: string,
      outputMint: string,
      amount: bigint,
      userAddress: string,
      walletAdapter: any,
      useStealthOutput: boolean = true
    ) => {
      if (activeProvider === "anoncoin") {
        return anoncoin.quickSwap(
          inputMint,
          outputMint,
          amount,
          userAddress,
          walletAdapter,
          useStealthOutput
        );
      }
      return silentswap.quickSwap(
        inputMint,
        outputMint,
        amount,
        userAddress,
        walletAdapter,
        sourceChain,
        destChain
      );
    },
    [activeProvider, anoncoin, silentswap, sourceChain, destChain]
  );

  /**
   * Reset state
   */
  const reset = useCallback(() => {
    anoncoin.reset();
    silentswap.reset();
    setManualProvider(null);
  }, [anoncoin, silentswap]);

  /**
   * Set active provider manually (only for same-chain swaps)
   */
  const setActiveProvider = useCallback(
    (provider: PrivacyProvider | null) => {
      // Don't allow switching to anoncoin for cross-chain
      if (provider === "anoncoin" && isCrossChain) {
        console.warn("[PrivacySwap] Cannot use Anoncoin for cross-chain swaps");
        return;
      }
      setManualProvider(provider);
    },
    [isCrossChain]
  );

  /**
   * Get privacy level
   */
  const getPrivacyLevel = useCallback(
    (result?: ConfidentialSwapResult | SilentSwapResult): "high" | "medium" | "low" => {
      if (activeProvider === "anoncoin") {
        return anoncoin.getPrivacyLevel(result as ConfidentialSwapResult);
      }
      return silentswap.getPrivacyLevel(result as SilentSwapResult);
    },
    [activeProvider, anoncoin, silentswap]
  );

  /**
   * Get provider display name
   */
  const getProviderName = useCallback((provider: PrivacyProvider): string => {
    return provider === "anoncoin" ? "Anoncoin" : "SilentSwap";
  }, []);

  /**
   * Get chain display name
   */
  const getChainName = useCallback((chain: Chain): string => {
    const names: Record<Chain, string> = {
      solana: "Solana",
      ethereum: "Ethereum",
      polygon: "Polygon",
      avalanche: "Avalanche",
    };
    return names[chain] || chain;
  }, []);

  /**
   * Get supported chains
   */
  const supportedChains = useMemo((): { id: Chain; name: string }[] => {
    return silentswap.getSupportedChains();
  }, [silentswap]);

  /**
   * Format cross-chain info for display
   */
  const formatCrossChainInfo = useCallback(
    (quote?: SilentSwapQuote): { bridgeFee: string; estimatedTime: string } | null => {
      if (!quote || !isCrossChain) return null;
      return silentswap.formatCrossChainInfo(quote);
    },
    [isCrossChain, silentswap]
  );

  return {
    // Provider
    activeProvider,
    setActiveProvider,
    availableProviders,
    getProviderName,

    // Chain
    sourceChain,
    setSourceChain,
    destChain,
    setDestChain,
    isCrossChain,
    supportedChains,
    getChainName,

    // State
    state,
    isLoading,
    canSwitchProvider: !isCrossChain && availableProviders.length > 1,

    // Availability
    isConfidentialAvailable: anoncoin.isConfidentialAvailable,
    isSilentSwapAvailable: silentswap.isSilentSwapAvailable,
    isAnyProviderAvailable: anoncoin.isConfidentialAvailable || silentswap.isSilentSwapAvailable,

    // Actions
    getQuote,
    executeSwap,
    quickSwap,
    reset,

    // Helpers
    getPrivacyLevel,
    formatCrossChainInfo,
  };
}

export default usePrivacySwap;
