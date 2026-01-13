/**
 * DisCard 2035 - useArciumYield Hook
 *
 * React hook for privacy-preserving yield vaults.
 * Earn yield without revealing deposit amounts on-chain.
 *
 * Features:
 * - Encrypted deposits via Arcium MPC
 * - Position sizes hidden from public view
 * - Stealth address withdrawals
 * - Real-time APY tracking
 */

import { useState, useCallback, useEffect, useMemo } from "react";
import {
  getArciumYieldService,
  type YieldVault,
  type PrivateVaultPosition,
  type DepositQuote,
  type DepositResult,
  type WithdrawQuote,
  type WithdrawResult,
  type VaultStats,
  type VaultRiskLevel,
} from "@/services/arciumYieldClient";

// ============================================================================
// Types
// ============================================================================

export interface YieldState {
  /** Current phase */
  phase:
    | "idle"
    | "loading_vaults"
    | "quoting_deposit"
    | "depositing"
    | "quoting_withdraw"
    | "withdrawing"
    | "completed"
    | "failed";
  /** Selected vault */
  selectedVault?: YieldVault;
  /** Active deposit quote */
  depositQuote?: DepositQuote;
  /** Active withdraw quote */
  withdrawQuote?: WithdrawQuote;
  /** Error message */
  error?: string;
}

// ============================================================================
// Hook
// ============================================================================

export function useArciumYield(userAddress?: string) {
  const [state, setState] = useState<YieldState>({ phase: "idle" });
  const [isLoading, setIsLoading] = useState(false);
  const [vaults, setVaults] = useState<YieldVault[]>([]);
  const [positions, setPositions] = useState<PrivateVaultPosition[]>([]);
  const [stats, setStats] = useState<VaultStats | null>(null);

  const yieldService = getArciumYieldService();

  // ==========================================================================
  // Vault Discovery
  // ==========================================================================

  /**
   * Load available yield vaults
   */
  const loadVaults = useCallback(async (filter?: {
    riskLevel?: VaultRiskLevel;
    asset?: string;
    minApy?: number;
  }) => {
    setIsLoading(true);
    setState((prev) => ({ ...prev, phase: "loading_vaults" }));

    try {
      const [allVaults, vaultStats] = await Promise.all([
        yieldService.getVaults(filter),
        yieldService.getVaultStats(),
      ]);

      setVaults(allVaults);
      setStats(vaultStats);
      setState({ phase: "idle" });
    } catch (error) {
      console.error("[ArciumYield] Failed to load vaults:", error);
      setState({
        phase: "failed",
        error: error instanceof Error ? error.message : "Failed to load vaults",
      });
    }

    setIsLoading(false);
  }, [yieldService]);

  /**
   * Select a vault for deposit
   */
  const selectVault = useCallback((vault: YieldVault) => {
    setState({
      phase: "idle",
      selectedVault: vault,
    });
  }, []);

  // ==========================================================================
  // Deposits
  // ==========================================================================

  /**
   * Get a deposit quote
   */
  const getDepositQuote = useCallback(async (
    vaultId: string,
    amount: bigint
  ): Promise<DepositQuote | null> => {
    if (!userAddress) {
      setState({ phase: "failed", error: "Wallet not connected" });
      return null;
    }

    setIsLoading(true);
    setState((prev) => ({ ...prev, phase: "quoting_deposit" }));

    try {
      const quote = await yieldService.getDepositQuote(vaultId, amount, userAddress);

      if (quote) {
        setState({
          phase: "idle",
          selectedVault: quote.vault,
          depositQuote: quote,
        });
      } else {
        setState({
          phase: "failed",
          error: "Failed to get deposit quote",
        });
      }

      setIsLoading(false);
      return quote;
    } catch (error) {
      console.error("[ArciumYield] Deposit quote failed:", error);
      setState({
        phase: "failed",
        error: error instanceof Error ? error.message : "Quote failed",
      });
      setIsLoading(false);
      return null;
    }
  }, [userAddress, yieldService]);

  /**
   * Execute deposit
   */
  const deposit = useCallback(async (
    quote: DepositQuote,
    userPrivateKey: Uint8Array
  ): Promise<DepositResult | null> => {
    setIsLoading(true);
    setState((prev) => ({ ...prev, phase: "depositing" }));

    try {
      const result = await yieldService.deposit(quote, userPrivateKey);

      if (result.success) {
        setState({ phase: "completed" });
        // Refresh positions
        refreshPositions();
      } else {
        setState({
          phase: "failed",
          depositQuote: quote,
          error: result.error,
        });
      }

      setIsLoading(false);
      return result;
    } catch (error) {
      console.error("[ArciumYield] Deposit failed:", error);
      setState({
        phase: "failed",
        error: error instanceof Error ? error.message : "Deposit failed",
      });
      setIsLoading(false);
      return null;
    }
  }, [yieldService]);

  /**
   * Quick deposit - get quote and execute in one call
   */
  const quickDeposit = useCallback(async (
    vaultId: string,
    amount: bigint,
    userPrivateKey: Uint8Array
  ): Promise<DepositResult | null> => {
    const quote = await getDepositQuote(vaultId, amount);
    if (!quote) return null;

    return deposit(quote, userPrivateKey);
  }, [getDepositQuote, deposit]);

  // ==========================================================================
  // Withdrawals
  // ==========================================================================

  /**
   * Get a withdrawal quote
   */
  const getWithdrawQuote = useCallback(async (
    positionId: string
  ): Promise<WithdrawQuote | null> => {
    if (!userAddress) {
      setState({ phase: "failed", error: "Wallet not connected" });
      return null;
    }

    setIsLoading(true);
    setState((prev) => ({ ...prev, phase: "quoting_withdraw" }));

    try {
      const quote = await yieldService.getWithdrawQuote(positionId, userAddress);

      if (quote) {
        setState({
          phase: "idle",
          withdrawQuote: quote,
        });
      } else {
        setState({
          phase: "failed",
          error: "Failed to get withdrawal quote",
        });
      }

      setIsLoading(false);
      return quote;
    } catch (error) {
      console.error("[ArciumYield] Withdraw quote failed:", error);
      setState({
        phase: "failed",
        error: error instanceof Error ? error.message : "Quote failed",
      });
      setIsLoading(false);
      return null;
    }
  }, [userAddress, yieldService]);

  /**
   * Execute withdrawal
   */
  const withdraw = useCallback(async (
    quote: WithdrawQuote,
    userPrivateKey: Uint8Array
  ): Promise<WithdrawResult | null> => {
    setIsLoading(true);
    setState((prev) => ({ ...prev, phase: "withdrawing" }));

    try {
      const result = await yieldService.withdraw(quote, userPrivateKey);

      if (result.success) {
        setState({ phase: "completed" });
        refreshPositions();
      } else {
        setState({
          phase: "failed",
          withdrawQuote: quote,
          error: result.error,
        });
      }

      setIsLoading(false);
      return result;
    } catch (error) {
      console.error("[ArciumYield] Withdrawal failed:", error);
      setState({
        phase: "failed",
        error: error instanceof Error ? error.message : "Withdrawal failed",
      });
      setIsLoading(false);
      return null;
    }
  }, [yieldService]);

  /**
   * Quick withdraw - get quote and execute in one call
   */
  const quickWithdraw = useCallback(async (
    positionId: string,
    userPrivateKey: Uint8Array
  ): Promise<WithdrawResult | null> => {
    const quote = await getWithdrawQuote(positionId);
    if (!quote) return null;

    return withdraw(quote, userPrivateKey);
  }, [getWithdrawQuote, withdraw]);

  // ==========================================================================
  // Position Management
  // ==========================================================================

  /**
   * Refresh positions
   */
  const refreshPositions = useCallback(() => {
    const userPositions = yieldService.getPositions();
    setPositions(userPositions);
  }, [yieldService]);

  /**
   * Get positions by vault
   */
  const getPositionsByVault = useCallback((vaultId: string): PrivateVaultPosition[] => {
    return positions.filter((p) => p.vaultId === vaultId);
  }, [positions]);

  /**
   * Get active positions count
   */
  const activePositionsCount = useMemo(() => {
    return positions.filter((p) => p.status === "active").length;
  }, [positions]);

  // ==========================================================================
  // Lifecycle
  // ==========================================================================

  // Load vaults on mount
  useEffect(() => {
    loadVaults();
  }, [loadVaults]);

  // Refresh positions periodically
  useEffect(() => {
    refreshPositions();
    const interval = setInterval(refreshPositions, 60000); // Every minute
    return () => clearInterval(interval);
  }, [refreshPositions]);

  /**
   * Reset state
   */
  const reset = useCallback(() => {
    setState({ phase: "idle" });
    setIsLoading(false);
  }, []);

  // ==========================================================================
  // Utilities
  // ==========================================================================

  /**
   * Get vault by ID
   */
  const getVault = useCallback((vaultId: string): YieldVault | undefined => {
    return vaults.find((v) => v.id === vaultId);
  }, [vaults]);

  /**
   * Filter vaults by risk level
   */
  const vaultsByRisk = useMemo(() => ({
    low: vaults.filter((v) => v.riskLevel === "low"),
    medium: vaults.filter((v) => v.riskLevel === "medium"),
    high: vaults.filter((v) => v.riskLevel === "high"),
  }), [vaults]);

  /**
   * Get best APY vault
   */
  const bestApyVault = useMemo(() => {
    if (vaults.length === 0) return null;
    return vaults.reduce((best, v) => v.apy > best.apy ? v : best, vaults[0]);
  }, [vaults]);

  /**
   * Format helpers from service
   */
  const formatApy = yieldService.formatApy.bind(yieldService);
  const formatTvl = yieldService.formatTvl.bind(yieldService);
  const getRiskColor = yieldService.getRiskColor.bind(yieldService);

  return {
    // State
    state,
    isLoading,
    vaults,
    positions,
    stats,
    activePositionsCount,

    // Vault Discovery
    loadVaults,
    selectVault,
    getVault,
    vaultsByRisk,
    bestApyVault,

    // Deposits
    getDepositQuote,
    deposit,
    quickDeposit,

    // Withdrawals
    getWithdrawQuote,
    withdraw,
    quickWithdraw,

    // Position Management
    refreshPositions,
    getPositionsByVault,

    // Utilities
    reset,
    formatApy,
    formatTvl,
    getRiskColor,

    // Service status
    isAvailable: yieldService.isAvailable(),
  };
}

export default useArciumYield;
