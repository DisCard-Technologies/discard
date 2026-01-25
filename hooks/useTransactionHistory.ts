/**
 * Transaction History Hook
 *
 * Fetches and merges on-chain transaction history with in-app transfers.
 * Uses Helius Enhanced API via Convex for caching.
 */
import { useState, useEffect, useCallback, useMemo } from "react";
import { useQuery, useAction } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { StackTransaction, TransactionType } from "@/components/transaction-stack";

interface UseTransactionHistoryOptions {
  /** Maximum number of transactions to fetch */
  limit?: number;
  /** Whether to merge with in-app transfers */
  mergeWithInApp?: boolean;
  /** Whether to auto-refresh periodically */
  autoRefresh?: boolean;
  /** Refresh interval in milliseconds (default: 60000) */
  refreshInterval?: number;
}

interface UseTransactionHistoryReturn {
  transactions: StackTransaction[];
  isLoading: boolean;
  isRefreshing: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

/**
 * Hook for fetching and managing transaction history
 *
 * @param walletAddress - User's Solana wallet address
 * @param options - Configuration options
 * @returns Transaction history data and controls
 *
 * @example
 * ```tsx
 * const { transactions, isLoading, refresh } = useTransactionHistory(
 *   walletAddress,
 *   { limit: 10, mergeWithInApp: true }
 * );
 * ```
 */
export function useTransactionHistory(
  walletAddress: string | null,
  options: UseTransactionHistoryOptions = {}
): UseTransactionHistoryReturn {
  const {
    limit = 10,
    mergeWithInApp = true,
    autoRefresh = false,
    refreshInterval = 60000,
  } = options;

  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Subscribe to cached on-chain transactions
  const onChainTransactions = useQuery(
    api.holdings.transactionHistory.getRecentTransactions,
    walletAddress ? { walletAddress, limit } : "skip"
  );

  // Subscribe to in-app transfers
  const inAppTransfers = useQuery(
    api.transfers.transfers.getRecent,
    mergeWithInApp ? { limit } : "skip"
  );

  // Action to refresh from Helius
  const refreshAction = useAction(api.holdings.transactionHistory.refreshTransactionHistory);

  // Refresh function
  const refresh = useCallback(async () => {
    if (!walletAddress) return;

    setIsRefreshing(true);
    setError(null);

    try {
      await refreshAction({ walletAddress, limit });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to refresh transactions";
      setError(message);
      console.error("[useTransactionHistory] Refresh error:", err);
    } finally {
      setIsRefreshing(false);
    }
  }, [walletAddress, limit, refreshAction]);

  // Initial fetch on mount
  useEffect(() => {
    if (walletAddress) {
      refresh();
    }
  }, [walletAddress]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-refresh interval
  useEffect(() => {
    if (!autoRefresh || !walletAddress) return;

    const interval = setInterval(refresh, refreshInterval);
    return () => clearInterval(interval);
  }, [autoRefresh, refreshInterval, walletAddress, refresh]);

  // Transform and merge transactions
  const transactions: StackTransaction[] = useMemo(() => {
    const result: StackTransaction[] = [];
    const seenSignatures = new Set<string>();

    // Add in-app transfers first (they have richer data)
    if (mergeWithInApp && inAppTransfers && inAppTransfers.length > 0) {
      for (const transfer of inAppTransfers) {
        if (transfer.solanaSignature) {
          seenSignatures.add(transfer.solanaSignature);
        }

        // Format address for display
        const addr = transfer.recipientAddress;
        const shortAddr =
          addr.length > 10 ? `${addr.slice(0, 6)}...${addr.slice(-4)}` : addr;

        // Format amount
        const amount = transfer.amount / Math.pow(10, transfer.tokenDecimals);
        const formattedAmount = amount.toLocaleString(undefined, {
          minimumFractionDigits: 2,
          maximumFractionDigits: transfer.tokenDecimals > 2 ? 4 : 2,
        });

        // Calculate total fee
        const totalFee =
          transfer.networkFee +
          transfer.platformFee +
          (transfer.priorityFee || 0);
        const feeFormatted =
          totalFee > 0 ? `$${(totalFee / 100).toFixed(2)}` : undefined;

        result.push({
          id: transfer._id,
          type: "send" as TransactionType,
          address: transfer.recipientDisplayName || shortAddr,
          tokenAmount: `-${formattedAmount} ${transfer.token}`,
          fiatValue: `$${(transfer.amountUsd / 100).toFixed(2)}`,
          fee: feeFormatted,
        });
      }
    }

    // Add on-chain transactions (skip duplicates)
    if (onChainTransactions && onChainTransactions.length > 0) {
      for (const tx of onChainTransactions) {
        // Skip if we already have this transaction from in-app transfers
        if (seenSignatures.has(tx.signature)) {
          continue;
        }

        // Skip unknown transactions
        if (tx.type === "unknown") {
          continue;
        }

        // Format counterparty address
        const addr = tx.counterpartyAddress || "";
        const shortAddr =
          addr.length > 10 ? `${addr.slice(0, 6)}...${addr.slice(-4)}` : addr || "Unknown";

        // Format amount
        const formattedAmount = tx.amount.toLocaleString(undefined, {
          minimumFractionDigits: 2,
          maximumFractionDigits: 4,
        });

        // Determine sign based on transaction type
        const amountPrefix = tx.type === "send" ? "-" : tx.type === "receive" ? "+" : "";

        // Format fiat value
        const fiatValue = tx.amountUsd
          ? `$${tx.amountUsd.toFixed(2)}`
          : "—";

        // Format fee
        const feeFormatted = tx.fee > 0 ? `${tx.fee.toFixed(6)} SOL` : undefined;

        result.push({
          id: tx.signature,
          type: tx.type as TransactionType,
          address: shortAddr,
          tokenAmount: `${amountPrefix}${formattedAmount} ${tx.tokenSymbol}`,
          fiatValue,
          fee: feeFormatted,
        });
      }
    }

    // Sort by most recent (in-app transfers don't have blockTime, so they stay at top)
    // This works because in-app transfers are added first and are typically most recent
    return result.slice(0, limit);
  }, [onChainTransactions, inAppTransfers, mergeWithInApp, limit]);

  return {
    transactions,
    isLoading: onChainTransactions === undefined,
    isRefreshing,
    error,
    refresh,
  };
}
