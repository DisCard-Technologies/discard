/**
 * Transaction History Hook
 *
 * Fetches and merges on-chain transaction history with in-app transfers.
 * Uses Helius Enhanced API via Convex for caching.
 */
import { useState, useEffect, useCallback, useMemo } from "react";
import { useQuery, useAction } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useCurrentCredentialId } from "@/stores/authConvex";
import type { StackTransaction, TransactionType } from "@/components/transaction-stack";

// Known token logos for in-app transfers
const TOKEN_LOGOS: Record<string, string> = {
  SOL: "https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/So11111111111111111111111111111111111111112/logo.png",
  USDC: "https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v/logo.png",
  USDT: "https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB/logo.svg",
  JUP: "https://static.jup.ag/jup/icon.png",
  BONK: "https://arweave.net/hQiPZOsRZXGXBJd_82PhVdlM_hACsT_q6wqwf5cSY7I",
  mSOL: "https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So/logo.png",
  bSOL: "https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/bSo13r4TkiE4KumL71LsHTPpL2euBYLFx6h9HP3piy1/logo.png",
  jitoSOL: "https://storage.googleapis.com/token-metadata/JitoSOL-256.png",
};

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

  // Get credential for authenticated queries
  const credentialId = useCurrentCredentialId();

  // Subscribe to cached on-chain transactions
  const onChainTransactions = useQuery(
    api.holdings.transactionHistory.getRecentTransactions,
    walletAddress ? { walletAddress, limit } : "skip"
  );

  // Subscribe to in-app transfers (requires credentialId for auth)
  const inAppTransfers = useQuery(
    api.transfers.transfers.getRecent,
    mergeWithInApp && credentialId ? { limit, credentialId } : "skip"
  );

  // Subscribe to active MoonPay deposits (Convex real-time subscription)
  const moonpayDeposits = useQuery(
    api.funding.moonpay.getTransactions,
    { status: "all", limit: 5 }
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

    // Add active MoonPay deposits at the TOP (most important for user visibility)
    if (moonpayDeposits && moonpayDeposits.length > 0) {
      const FIVE_MINUTES = 5 * 60 * 1000;
      for (const deposit of moonpayDeposits) {
        // Show active deposits + recently completed (< 5 min ago)
        const isActive = deposit.status === 'pending' ||
                         deposit.status === 'waitingPayment' ||
                         deposit.status === 'processing';
        const isRecentlyCompleted = deposit.status === 'completed' &&
                                    deposit.completedAt &&
                                    Date.now() - deposit.completedAt < FIVE_MINUTES;
        const isRecentlyFailed = deposit.status === 'failed' &&
                                  deposit.createdAt &&
                                  Date.now() - deposit.createdAt < FIVE_MINUTES;

        if (!isActive && !isRecentlyCompleted && !isRecentlyFailed) continue;

        // Map deposit status to StackTransaction status
        const stackStatus: 'processing' | 'completed' | 'failed' =
          deposit.status === 'completed' ? 'completed' :
          deposit.status === 'failed' ? 'failed' :
          'processing';

        // Format amounts
        const fiatDollars = deposit.fiatAmount ? (deposit.fiatAmount / 100).toFixed(2) : '0.00';
        const cryptoAmount = deposit.cryptoAmount
          ? deposit.cryptoAmount.toFixed(2)
          : (deposit.fiatAmount / 100).toFixed(2); // Estimate from fiat if crypto not yet known
        const cryptoSymbol = deposit.cryptoCurrency?.toUpperCase() || 'USDC';

        // Format fee
        const moonpayFee = (deposit as any).moonpayFee;
        const feeFormatted = moonpayFee ? `$${(moonpayFee / 100).toFixed(2)}` : undefined;

        result.push({
          id: deposit._id,
          type: 'deposit' as TransactionType,
          address: 'via MoonPay',
          tokenAmount: `+${cryptoAmount} ${cryptoSymbol}`,
          fiatValue: `$${fiatDollars}`,
          fee: feeFormatted,
          estimatedTime: stackStatus === 'processing' ? '~3-5m' : undefined,
          tokenLogoUri: TOKEN_LOGOS[cryptoSymbol] || TOKEN_LOGOS['USDC'],
          status: stackStatus,
        });
      }
    }

    // Add in-app transfers first (they have richer data)
    if (mergeWithInApp && inAppTransfers && inAppTransfers.length > 0) {
      for (const transfer of inAppTransfers) {
        if (transfer.solanaSignature) {
          seenSignatures.add(transfer.solanaSignature);
        }

        // For private transfers: show recipient display name, never raw/stealth addresses
        // For regular transfers: show truncated address
        const isPrivate = (transfer as any).isPrivate === true;
        let displayAddress: string;
        if (transfer.recipientDisplayName) {
          displayAddress = transfer.recipientDisplayName;
        } else {
          const addr = transfer.recipientAddress;
          displayAddress = addr.length > 10 ? `${addr.slice(0, 6)}...${addr.slice(-4)}` : addr;
        }

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
          address: displayAddress,
          tokenAmount: `-${formattedAmount} ${transfer.token}`,
          fiatValue: `$${(transfer.amountUsd / 100).toFixed(2)}`,
          fee: feeFormatted,
          tokenLogoUri: TOKEN_LOGOS[transfer.token],
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
          tokenLogoUri: tx.tokenLogoUri,
        });
      }
    }

    // Sort by most recent (in-app transfers don't have blockTime, so they stay at top)
    // This works because in-app transfers are added first and are typically most recent
    return result.slice(0, limit);
  }, [onChainTransactions, inAppTransfers, moonpayDeposits, mergeWithInApp, limit]);

  return {
    transactions,
    isLoading: onChainTransactions === undefined,
    isRefreshing,
    error,
    refresh,
  };
}
