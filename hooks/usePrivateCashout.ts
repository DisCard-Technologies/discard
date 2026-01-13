/**
 * DisCard 2035 - usePrivateCashout Hook
 *
 * Privacy-preserving fiat off-ramp flow:
 * 1. Create single-use cashout address (zero history)
 * 2. Unshield from Privacy Cash pool
 * 3. Route to MoonPay Sell widget
 *
 * Privacy guarantees:
 * - MoonPay never sees user's spending wallet
 * - Cashout address has no transaction history
 * - No link between KYC and on-chain activity
 */

import { useState, useCallback } from "react";
import {
  getPrivacyCashService,
  type PrivateCashoutSession,
  type CashoutResult,
  type ShieldedBalance,
} from "@/services/privacyCashClient";

// ============================================================================
// Types
// ============================================================================

export interface CashoutState {
  /** Current phase of cashout */
  phase:
    | "idle"
    | "creating_address"
    | "unshielding"
    | "sending_to_moonpay"
    | "awaiting_fiat"
    | "completed"
    | "cancelled"
    | "error";
  /** Active cashout session */
  session?: PrivateCashoutSession;
  /** Cashout result */
  result?: CashoutResult;
  /** Error message */
  error?: string;
}

export interface MoonPaySellParams {
  /** Crypto currency code (e.g., "usdc_sol") */
  baseCurrencyCode: string;
  /** Amount of crypto to sell */
  quoteCurrencyAmount: number;
  /** Refund address (single-use cashout address) */
  refundWalletAddress: string;
  /** External transaction ID for tracking */
  externalTransactionId: string;
}

// ============================================================================
// Hook
// ============================================================================

export function usePrivateCashout(userId?: string, subOrgId?: string) {
  const [state, setState] = useState<CashoutState>({ phase: "idle" });
  const [isLoading, setIsLoading] = useState(false);
  const [shieldedBalance, setShieldedBalance] = useState<ShieldedBalance | null>(null);

  const privacyCashService = getPrivacyCashService();

  /**
   * Fetch user's shielded balance
   */
  const fetchShieldedBalance = useCallback(async () => {
    if (!userId) return null;

    try {
      const balance = await privacyCashService.getShieldedBalance(userId);
      setShieldedBalance(balance);
      return balance;
    } catch (error) {
      console.error("[PrivateCashout] Failed to fetch balance:", error);
      return null;
    }
  }, [userId, privacyCashService]);

  /**
   * Initialize a private cashout session
   *
   * Creates a single-use cashout address with zero transaction history.
   * This address will receive unshielded funds and send to MoonPay.
   *
   * @param amount - Amount to cash out in base units (e.g., 1000000 for 1 USDC)
   * @param fiatCurrency - Target fiat currency (default: USD)
   */
  const initiateCashout = useCallback(
    async (amount: number, fiatCurrency: string = "USD"): Promise<PrivateCashoutSession | null> => {
      if (!userId || !subOrgId) {
        setState({
          phase: "error",
          error: "User authentication required",
        });
        return null;
      }

      console.log("[PrivateCashout] Initiating cashout:", { amount, fiatCurrency });
      setIsLoading(true);
      setState({ phase: "creating_address" });

      try {
        const session = await privacyCashService.initPrivateCashout(
          userId,
          subOrgId,
          amount,
          fiatCurrency
        );

        setState({
          phase: "unshielding",
          session,
        });

        setIsLoading(false);
        return session;
      } catch (error) {
        console.error("[PrivateCashout] Failed to create session:", error);
        setState({
          phase: "error",
          error: error instanceof Error ? error.message : "Failed to create cashout session",
        });
        setIsLoading(false);
        return null;
      }
    },
    [userId, subOrgId, privacyCashService]
  );

  /**
   * Execute the full private cashout flow
   *
   * 1. Unshields funds from Privacy Cash pool to cashout address
   * 2. Sends from cashout address to MoonPay
   * 3. Returns MoonPay Sell widget parameters
   *
   * @param session - Active cashout session
   * @param userCommitment - User's shielded balance commitment
   */
  const executeCashout = useCallback(
    async (
      session: PrivateCashoutSession,
      userCommitment: string
    ): Promise<CashoutResult | null> => {
      console.log("[PrivateCashout] Executing cashout:", session.sessionId);
      setIsLoading(true);

      try {
        // Phase 1: Unshield
        setState({ phase: "unshielding", session });

        // Phase 2: Send to MoonPay
        setState({ phase: "sending_to_moonpay", session });

        const result = await privacyCashService.executePrivateCashout(session, userCommitment);

        if (result.success) {
          setState({
            phase: "awaiting_fiat",
            session,
            result,
          });
        } else {
          setState({
            phase: "error",
            session,
            result,
            error: result.error,
          });
        }

        setIsLoading(false);
        return result;
      } catch (error) {
        console.error("[PrivateCashout] Execution failed:", error);
        setState({
          phase: "error",
          session,
          error: error instanceof Error ? error.message : "Cashout execution failed",
        });
        setIsLoading(false);
        return null;
      }
    },
    [privacyCashService]
  );

  /**
   * Generate MoonPay Sell widget URL
   *
   * @param result - Successful cashout result
   * @returns URL to open MoonPay Sell widget
   */
  const getMoonPaySellUrl = useCallback(
    (result: CashoutResult): string | null => {
      if (!result.success || !result.moonPayParams || !result.sessionId) {
        return null;
      }

      const MOONPAY_SELL_URL =
        process.env.EXPO_PUBLIC_MOONPAY_SELL_URL || "https://sell.moonpay.com";
      const MOONPAY_API_KEY = process.env.EXPO_PUBLIC_MOONPAY_API_KEY || "";

      const params = new URLSearchParams({
        apiKey: MOONPAY_API_KEY,
        baseCurrencyCode: result.moonPayParams.baseCurrencyCode,
        quoteCurrencyAmount: result.moonPayParams.quoteCurrencyAmount.toString(),
        refundWalletAddress: result.moonPayParams.refundWalletAddress,
        externalTransactionId: result.sessionId,
      });

      return `${MOONPAY_SELL_URL}?${params.toString()}`;
    },
    []
  );

  /**
   * Cancel an active cashout session
   */
  const cancelCashout = useCallback(async () => {
    if (!state.session) return;

    console.log("[PrivateCashout] Cancelling cashout:", state.session.sessionId);
    setIsLoading(true);

    try {
      await privacyCashService.cancelCashout(state.session);
      setState({ phase: "cancelled" });
    } catch (error) {
      console.error("[PrivateCashout] Cancel failed:", error);
      // Still mark as cancelled even if revoke fails
      setState({ phase: "cancelled" });
    }

    setIsLoading(false);
  }, [state.session, privacyCashService]);

  /**
   * Mark cashout as completed (called when MoonPay confirms fiat sent)
   */
  const completeCashout = useCallback(() => {
    console.log("[PrivateCashout] Cashout completed");
    setState((prev) => ({
      ...prev,
      phase: "completed",
    }));
  }, []);

  /**
   * Reset to idle state
   */
  const reset = useCallback(() => {
    setState({ phase: "idle" });
    setIsLoading(false);
  }, []);

  /**
   * Quick cashout - full flow in one call
   *
   * @param amount - Amount in base units
   * @param fiatCurrency - Target fiat currency
   * @param userCommitment - User's shielded balance commitment
   */
  const quickCashout = useCallback(
    async (
      amount: number,
      fiatCurrency: string = "USD",
      userCommitment: string
    ): Promise<{ result: CashoutResult | null; moonPayUrl: string | null }> => {
      // Step 1: Create session
      const session = await initiateCashout(amount, fiatCurrency);
      if (!session) {
        return { result: null, moonPayUrl: null };
      }

      // Step 2: Execute cashout
      const result = await executeCashout(session, userCommitment);
      if (!result || !result.success) {
        return { result, moonPayUrl: null };
      }

      // Step 3: Get MoonPay URL
      const moonPayUrl = getMoonPaySellUrl(result);

      return { result, moonPayUrl };
    },
    [initiateCashout, executeCashout, getMoonPaySellUrl]
  );

  return {
    // State
    state,
    isLoading,
    shieldedBalance,

    // Actions
    fetchShieldedBalance,
    initiateCashout,
    executeCashout,
    getMoonPaySellUrl,
    cancelCashout,
    completeCashout,
    reset,
    quickCashout,

    // Helpers
    isAvailable: privacyCashService.isAvailable(),
    poolAddress: privacyCashService.getPoolAddress(),
  };
}

export default usePrivateCashout;
