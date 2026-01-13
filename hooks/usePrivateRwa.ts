/**
 * DisCard 2035 - usePrivateRwa Hook
 *
 * React hook for privacy-preserving RWA (Real World Asset) purchases.
 * Buy gift cards, prepaid cards, and vouchers without revealing
 * purchase amounts or linking to your identity.
 *
 * Features:
 * - Encrypted purchase amounts
 * - Stealth address delivery
 * - No purchase history linkage
 * - Instant code delivery
 */

import { useState, useCallback, useEffect } from "react";
import {
  getPrivateRwaService,
  type RwaProduct,
  type PrivateRwaPurchaseRequest,
  type PrivateRwaPurchaseQuote,
  type RwaPurchaseResult,
  type RwaRedemption,
} from "@/services/privateRwaClient";

// ============================================================================
// Types
// ============================================================================

export interface RwaPurchaseState {
  /** Current phase */
  phase:
    | "idle"
    | "browsing"
    | "quoting"
    | "quoted"
    | "confirming"
    | "purchasing"
    | "completed"
    | "failed";
  /** Selected product */
  selectedProduct?: RwaProduct;
  /** Active quote */
  quote?: PrivateRwaPurchaseQuote;
  /** Purchase result */
  result?: RwaPurchaseResult;
  /** Error message */
  error?: string;
}

// ============================================================================
// Hook
// ============================================================================

export function usePrivateRwa(userAddress?: string) {
  const [state, setState] = useState<RwaPurchaseState>({ phase: "idle" });
  const [isLoading, setIsLoading] = useState(false);
  const [catalog, setCatalog] = useState<RwaProduct[]>([]);
  const [redemptions, setRedemptions] = useState<RwaRedemption[]>([]);

  const rwaService = getPrivateRwaService();

  // Load catalog on mount
  useEffect(() => {
    const loadCatalog = async () => {
      const products = await rwaService.getCatalog();
      setCatalog(products);
    };
    loadCatalog();
  }, [rwaService]);

  // Load user's redemptions
  useEffect(() => {
    const loadRedemptions = async () => {
      const userRedemptions = await rwaService.getRedemptions();
      setRedemptions(userRedemptions);
    };
    loadRedemptions();
  }, [rwaService]);

  /**
   * Filter catalog by type, brand, or accepted token
   */
  const filterCatalog = useCallback(
    async (filter: {
      type?: RwaProduct["type"];
      brand?: string;
      acceptsToken?: string;
    }) => {
      setIsLoading(true);
      const filtered = await rwaService.getCatalog(filter);
      setCatalog(filtered);
      setIsLoading(false);
    },
    [rwaService]
  );

  /**
   * Select a product for purchase
   */
  const selectProduct = useCallback((product: RwaProduct) => {
    setState({
      phase: "browsing",
      selectedProduct: product,
    });
  }, []);

  /**
   * Get a purchase quote
   */
  const getQuote = useCallback(
    async (
      productId: string,
      amount: number,
      paymentToken: string = "USDC"
    ): Promise<PrivateRwaPurchaseQuote | null> => {
      if (!userAddress) {
        setState({
          phase: "failed",
          error: "Wallet not connected",
        });
        return null;
      }

      console.log("[PrivateRwa] Getting quote...");
      setIsLoading(true);
      setState((prev) => ({ ...prev, phase: "quoting" }));

      try {
        const request: PrivateRwaPurchaseRequest = {
          productId,
          amount,
          userAddress,
          paymentToken,
          useShieldedBalance: true,
        };

        const quote = await rwaService.getPrivatePurchaseQuote(request);

        if (!quote) {
          throw new Error("Failed to get quote");
        }

        setState({
          phase: "quoted",
          selectedProduct: await rwaService.getProduct(productId) || undefined,
          quote,
        });

        setIsLoading(false);
        return quote;
      } catch (error) {
        console.error("[PrivateRwa] Quote failed:", error);
        setState({
          phase: "failed",
          error: error instanceof Error ? error.message : "Failed to get quote",
        });
        setIsLoading(false);
        return null;
      }
    },
    [userAddress, rwaService]
  );

  /**
   * Execute the purchase
   */
  const purchase = useCallback(
    async (
      quote: PrivateRwaPurchaseQuote,
      userPrivateKey: Uint8Array
    ): Promise<RwaPurchaseResult | null> => {
      console.log("[PrivateRwa] Executing purchase...");
      setIsLoading(true);
      setState((prev) => ({ ...prev, phase: "purchasing" }));

      try {
        const result = await rwaService.executePurchase(quote, userPrivateKey);

        if (result.success) {
          setState({
            phase: "completed",
            quote,
            result,
          });

          // Refresh redemptions
          const updated = await rwaService.getRedemptions();
          setRedemptions(updated);
        } else {
          setState({
            phase: "failed",
            quote,
            result,
            error: result.error,
          });
        }

        setIsLoading(false);
        return result;
      } catch (error) {
        console.error("[PrivateRwa] Purchase failed:", error);
        setState({
          phase: "failed",
          quote,
          error: error instanceof Error ? error.message : "Purchase failed",
        });
        setIsLoading(false);
        return null;
      }
    },
    [rwaService]
  );

  /**
   * Quick purchase - get quote and execute in one call
   */
  const quickPurchase = useCallback(
    async (
      productId: string,
      amount: number,
      userPrivateKey: Uint8Array,
      paymentToken: string = "USDC"
    ): Promise<RwaPurchaseResult | null> => {
      const quote = await getQuote(productId, amount, paymentToken);
      if (!quote) return null;

      return purchase(quote, userPrivateKey);
    },
    [getQuote, purchase]
  );

  /**
   * Mark a redemption as used
   */
  const markRedeemed = useCallback(
    async (redemptionId: string) => {
      const success = await rwaService.markRedeemed(redemptionId);
      if (success) {
        // Refresh redemptions
        const updated = await rwaService.getRedemptions();
        setRedemptions(updated);
      }
      return success;
    },
    [rwaService]
  );

  /**
   * Decrypt and reveal a code
   */
  const revealCode = useCallback(
    async (
      encryptedCode: string,
      userPrivateKey: Uint8Array
    ): Promise<string | null> => {
      return rwaService.decryptCode(encryptedCode, userPrivateKey);
    },
    [rwaService]
  );

  /**
   * Reset state
   */
  const reset = useCallback(() => {
    setState({ phase: "idle" });
    setIsLoading(false);
  }, []);

  /**
   * Format amount for display
   */
  const formatAmount = useCallback((cents: number): string => {
    return `$${(cents / 100).toFixed(2)}`;
  }, []);

  /**
   * Get product by ID
   */
  const getProduct = useCallback(
    async (productId: string): Promise<RwaProduct | null> => {
      return rwaService.getProduct(productId);
    },
    [rwaService]
  );

  /**
   * Get active redemptions count
   */
  const activeRedemptionsCount = redemptions.filter(
    (r) => r.status === "active"
  ).length;

  return {
    // State
    state,
    isLoading,
    catalog,
    redemptions,
    activeRedemptionsCount,

    // Actions
    filterCatalog,
    selectProduct,
    getQuote,
    purchase,
    quickPurchase,
    markRedeemed,
    revealCode,
    reset,
    getProduct,

    // Helpers
    formatAmount,
    isAvailable: rwaService.isAvailable(),
  };
}

export default usePrivateRwa;
