/**
 * Convex-based Crypto Store
 *
 * Replaces the Zustand-based crypto.ts store with Convex real-time subscriptions.
 * Manages cryptocurrency wallets, balances, rates, and transaction processing.
 */

import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  ReactNode,
  useMemo,
} from 'react';
import { useQuery, useMutation } from 'convex/react';
import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import { useCurrentUserId, useConvexUserId, useIsMockAuth } from './authConvex';

// Type definitions
export type WalletType = 'metamask' | 'walletconnect' | 'phantom' | 'solflare' | 'coinbase';
export type NetworkType = 'ethereum' | 'solana' | 'polygon' | 'arbitrum' | 'base';
export type ConnectionStatus = 'connected' | 'disconnected' | 'expired' | 'error';

export interface CryptoWallet {
  _id: Id<'wallets'>;
  walletId: string;
  walletType: WalletType;
  networkType: NetworkType;
  publicAddress: string;
  connectionStatus: ConnectionStatus;
  nickname?: string;
  cachedBalanceUsd?: number;
  lastUsedAt?: number;
  createdAt: number;
}

export interface WalletBalance {
  walletId: string;
  totalUsdValue: number;
  balances: Array<{
    symbol: string;
    balance: number;
    valueUsd: number;
  }>;
  lastUpdated: number;
}

export interface CryptoRate {
  symbol: string;
  name: string;
  usdPrice: number;
  change24h: number;
  volume24h: number;
  marketCap: number;
  updatedAt: number;
}

export interface ConversionQuote {
  quoteId: string;
  fromCrypto: string;
  fromAmount: number;
  toUsd: number;
  rate: number;
  fee: number;
  expiresAt: number;
  status: 'active' | 'expired' | 'executed' | 'cancelled';
}

export interface DeFiPosition {
  _id: Id<'defi'>;
  positionId: string;
  protocolName: string;
  positionType: 'lending' | 'staking' | 'lp' | 'vault';
  totalValueUsd: number;
  earnedValueUsd: number;
  availableForFunding: number;
  currentYieldApy: number;
}

export interface NetworkCongestion {
  networkType: NetworkType;
  level: 'low' | 'medium' | 'high';
  feeEstimates: {
    slow: number;
    standard: number;
    fast: number;
  };
  lastUpdated: number;
}

// State interface
export interface CryptoState {
  // Wallet data (from Convex subscriptions)
  wallets: CryptoWallet[];
  walletBalances: Record<string, WalletBalance>;
  defiPositions: DeFiPosition[];

  // Rates data
  rates: CryptoRate[];
  ratesLastUpdated: Date | null;

  // Conversion state
  activeQuote: ConversionQuote | null;

  // Network state
  networkCongestion: Record<NetworkType, NetworkCongestion>;

  // Loading states
  isLoading: boolean;
  isConnecting: boolean;
  isProcessingTransaction: boolean;

  // Error state
  error: string | null;
  walletErrors: Record<string, string>;

  // Computed values
  totalPortfolioValue: number;
  totalDefiValue: number;
}

// Actions interface
export interface CryptoActions {
  // Wallet operations
  connectWallet: (
    walletType: WalletType,
    networkType: NetworkType,
    publicAddress: string,
    nickname?: string
  ) => Promise<CryptoWallet | null>;
  disconnectWallet: (walletId: string) => Promise<boolean>;
  refreshWalletBalance: (walletId: string) => Promise<void>;
  refreshAllBalances: () => Promise<void>;

  // Rate operations
  getRateBySymbol: (symbol: string) => CryptoRate | null;
  convertToUsd: (amount: number, symbol: string) => number | null;
  convertFromUsd: (usdAmount: number, symbol: string) => number | null;

  // Conversion quotes
  createConversionQuote: (
    fromCrypto: string,
    toUsd: number
  ) => Promise<ConversionQuote | null>;
  executeQuote: (quoteId: string) => Promise<boolean>;
  cancelQuote: (quoteId: string) => Promise<boolean>;

  // Network
  getNetworkCongestion: (networkType: NetworkType) => NetworkCongestion | null;

  // Error handling
  setError: (error: string | null) => void;
  setWalletError: (walletId: string, error: string | null) => void;
  clearAllErrors: () => void;
}

// Context
const CryptoContext = createContext<{
  state: CryptoState;
  actions: CryptoActions;
} | null>(null);

// Provider component
export function CryptoProvider({ children }: { children: ReactNode }) {
  const userId = useCurrentUserId();
  const convexUserId = useConvexUserId(); // Returns null for mock users
  const isMockAuth = useIsMockAuth();
  const [error, setError] = useState<string | null>(null);
  const [walletErrors, setWalletErrors] = useState<Record<string, string>>({});
  const [isConnecting, setIsConnecting] = useState(false);
  const [activeQuote, setActiveQuote] = useState<ConversionQuote | null>(null);

  // Real-time subscription to wallets (skip for mock users)
  const walletsData = useQuery(
    api.wallets.wallets.list,
    convexUserId ? { userId: convexUserId } : 'skip'
  );

  // Real-time subscription to DeFi positions (skip for mock users)
  const defiData = useQuery(
    api.wallets.defi.listPositions,
    convexUserId ? { userId: convexUserId } : 'skip'
  );

  // Real-time subscription to crypto rates
  const ratesData = useQuery(api.wallets.rates.list, {
    symbols: ['BTC', 'ETH', 'USDT', 'USDC', 'SOL', 'XRP', 'MATIC', 'ARB'],
  });

  // Real-time subscription to network congestion
  const congestionData = useQuery(api.wallets.network.getCongestion, {});

  // Mutations
  const connectWalletMutation = useMutation(api.wallets.wallets.connect);
  const disconnectWalletMutation = useMutation(api.wallets.wallets.disconnect);
  const refreshBalanceMutation = useMutation(api.wallets.wallets.refreshBalance);
  const createQuoteMutation = useMutation(api.wallets.quotes.create);
  const executeQuoteMutation = useMutation(api.wallets.quotes.execute);
  const cancelQuoteMutation = useMutation(api.wallets.quotes.cancel);

  // Transform wallets data
  const wallets: CryptoWallet[] = useMemo(() => {
    if (!walletsData) return [];
    return walletsData.map((w) => ({
      _id: w._id,
      walletId: w._id,
      walletType: w.walletType as WalletType,
      networkType: w.networkType as NetworkType,
      publicAddress: (w as any).address || (w as any).publicAddress,
      connectionStatus: w.connectionStatus as ConnectionStatus,
      nickname: w.nickname,
      cachedBalanceUsd: w.cachedBalanceUsd,
      lastUsedAt: w.lastUsedAt,
      createdAt: w.createdAt,
    }));
  }, [walletsData]);

  // Transform DeFi data
  const defiPositions: DeFiPosition[] = useMemo(() => {
    if (!defiData) return [];
    return defiData.map((p) => ({
      _id: p._id,
      positionId: p._id,
      protocolName: p.protocolName,
      positionType: p.positionType as DeFiPosition['positionType'],
      totalValueUsd: p.totalValueUsd,
      earnedValueUsd: p.earnedValueUsd,
      availableForFunding: p.availableForFunding,
      currentYieldApy: p.currentYieldApy,
    }));
  }, [defiData]);

  // Transform rates data
  const rates: CryptoRate[] = useMemo(() => {
    if (!ratesData) return [];
    return ratesData.filter((r): r is NonNullable<typeof r> => r !== null).map((r) => ({
      symbol: r.symbol,
      name: r.name || r.symbol,
      usdPrice: r.usdPrice,
      change24h: r.change24h || 0,
      volume24h: r.volume24h || 0,
      marketCap: r.marketCap || 0,
      updatedAt: r.updatedAt || Date.now(),
    }));
  }, [ratesData]);

  // Transform network congestion data
  const networkCongestion: Record<NetworkType, NetworkCongestion> = useMemo(() => {
    if (!congestionData?.networks) return {} as Record<NetworkType, NetworkCongestion>;
    const result: Record<NetworkType, NetworkCongestion> = {} as Record<NetworkType, NetworkCongestion>;
    congestionData.networks.forEach((c) => {
      result[c.network as NetworkType] = {
        networkType: c.network as NetworkType,
        level: c.congestionLevel as NetworkCongestion['level'],
        feeEstimates: {
          slow: c.baseFee,
          normal: c.baseFee + c.priorityFee,
          fast: c.baseFee + c.priorityFee * 2,
        },
        lastUpdated: c.lastBlockTime,
      };
    });
    return result;
  }, [congestionData]);

  // Calculate totals
  const totalPortfolioValue = useMemo(
    () => wallets.reduce((sum, w) => sum + (w.cachedBalanceUsd || 0), 0),
    [wallets]
  );

  const totalDefiValue = useMemo(
    () => defiPositions.reduce((sum, p) => sum + p.totalValueUsd, 0),
    [defiPositions]
  );

  // Build wallet balances map
  const walletBalances: Record<string, WalletBalance> = useMemo(() => {
    const balances: Record<string, WalletBalance> = {};
    wallets.forEach((w) => {
      balances[w.walletId] = {
        walletId: w.walletId,
        totalUsdValue: w.cachedBalanceUsd || 0,
        balances: [], // Would come from detailed balance query
        lastUpdated: w.lastUsedAt || w.createdAt,
      };
    });
    return balances;
  }, [wallets]);

  const isLoading = walletsData === undefined || ratesData === undefined;

  // Build state
  const state: CryptoState = {
    wallets,
    walletBalances,
    defiPositions,
    rates,
    ratesLastUpdated: ratesData ? new Date() : null,
    activeQuote,
    networkCongestion,
    isLoading,
    isConnecting,
    isProcessingTransaction: false,
    error,
    walletErrors,
    totalPortfolioValue,
    totalDefiValue,
  };

  // Actions
  const actions: CryptoActions = {
    connectWallet: async (
      walletType: WalletType,
      networkType: NetworkType,
      publicAddress: string,
      nickname?: string
    ): Promise<CryptoWallet | null> => {
      if (!userId) {
        setError('Not authenticated');
        return null;
      }

      try {
        setIsConnecting(true);
        setError(null);

        const walletId = await connectWalletMutation({
          userId,
          walletType,
          networkType,
          publicAddress,
          nickname,
        });

        const newWallet = wallets.find((w) => w._id === walletId);
        return newWallet || null;
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to connect wallet';
        setError(message);
        return null;
      } finally {
        setIsConnecting(false);
      }
    },

    disconnectWallet: async (walletId: string): Promise<boolean> => {
      try {
        await disconnectWalletMutation({
          walletId: walletId as Id<'wallets'>,
        });
        return true;
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to disconnect wallet';
        setError(message);
        return false;
      }
    },

    refreshWalletBalance: async (walletId: string): Promise<void> => {
      try {
        await refreshBalanceMutation({
          walletId: walletId as Id<'wallets'>,
        });
      } catch (err) {
        console.error('Failed to refresh wallet balance:', err);
      }
    },

    refreshAllBalances: async (): Promise<void> => {
      try {
        await Promise.all(
          wallets.map((w) => refreshBalanceMutation({ walletId: w._id }))
        );
      } catch (err) {
        console.error('Failed to refresh all balances:', err);
      }
    },

    getRateBySymbol: (symbol: string): CryptoRate | null => {
      return rates.find((r) => r.symbol.toUpperCase() === symbol.toUpperCase()) || null;
    },

    convertToUsd: (amount: number, symbol: string): number | null => {
      const rate = rates.find((r) => r.symbol.toUpperCase() === symbol.toUpperCase());
      if (!rate) return null;
      return amount * rate.usdPrice;
    },

    convertFromUsd: (usdAmount: number, symbol: string): number | null => {
      const rate = rates.find((r) => r.symbol.toUpperCase() === symbol.toUpperCase());
      if (!rate || rate.usdPrice === 0) return null;
      return usdAmount / rate.usdPrice;
    },

    createConversionQuote: async (
      fromCrypto: string,
      toUsd: number
    ): Promise<ConversionQuote | null> => {
      if (!userId) {
        setError('Not authenticated');
        return null;
      }

      try {
        const quote = await createQuoteMutation({
          userId,
          fromCrypto,
          toUsd,
        });

        const conversionQuote: ConversionQuote = {
          quoteId: quote.quoteId,
          fromCrypto,
          fromAmount: quote.fromAmount,
          toUsd,
          rate: quote.rate,
          fee: quote.fee,
          expiresAt: quote.expiresAt,
          status: 'active',
        };

        setActiveQuote(conversionQuote);
        return conversionQuote;
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to create quote';
        setError(message);
        return null;
      }
    },

    executeQuote: async (quoteId: string): Promise<boolean> => {
      try {
        await executeQuoteMutation({ quoteId });
        setActiveQuote(null);
        return true;
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to execute quote';
        setError(message);
        return false;
      }
    },

    cancelQuote: async (quoteId: string): Promise<boolean> => {
      try {
        await cancelQuoteMutation({ quoteId });
        if (activeQuote?.quoteId === quoteId) {
          setActiveQuote(null);
        }
        return true;
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to cancel quote';
        setError(message);
        return false;
      }
    },

    getNetworkCongestion: (networkType: NetworkType): NetworkCongestion | null => {
      return networkCongestion[networkType] || null;
    },

    setError: (err: string | null): void => {
      setError(err);
    },

    setWalletError: (walletId: string, err: string | null): void => {
      setWalletErrors((prev) => {
        if (err === null) {
          const { [walletId]: _, ...rest } = prev;
          return rest;
        }
        return { ...prev, [walletId]: err };
      });
    },

    clearAllErrors: (): void => {
      setError(null);
      setWalletErrors({});
    },
  };

  return (
    <CryptoContext.Provider value={{ state, actions }}>
      {children}
    </CryptoContext.Provider>
  );
}

// Main hook
export function useCrypto() {
  const context = useContext(CryptoContext);
  if (!context) {
    throw new Error('useCrypto must be used within a CryptoProvider');
  }
  return context;
}

// Convenience hooks
export function useCryptoState() {
  const { state } = useCrypto();
  return state;
}

export function useCryptoActions() {
  const { actions } = useCrypto();
  return actions;
}

// Hook for wallet-specific operations
export function useWalletOperations(walletId: string) {
  const { state, actions } = useCrypto();

  const wallet = state.wallets.find((w) => w.walletId === walletId);
  const balance = state.walletBalances[walletId];
  const error = state.walletErrors[walletId];

  return {
    wallet,
    balance,
    error,
    refreshBalance: () => actions.refreshWalletBalance(walletId),
    disconnect: () => actions.disconnectWallet(walletId),
    clearError: () => actions.setWalletError(walletId, null),
  };
}

// Hook for portfolio overview
export function usePortfolioOverview() {
  const { state, actions } = useCrypto();

  return {
    totalValue: state.totalPortfolioValue + state.totalDefiValue,
    walletValue: state.totalPortfolioValue,
    defiValue: state.totalDefiValue,
    walletCount: state.wallets.length,
    defiPositionCount: state.defiPositions.length,
    isLoading: state.isLoading,
    refresh: actions.refreshAllBalances,
  };
}

// Hook for real-time rates
export function useRealTimeRates() {
  const { state, actions } = useCrypto();

  return {
    rates: state.rates,
    lastUpdated: state.ratesLastUpdated,
    isLoading: state.isLoading,
    getRateBySymbol: actions.getRateBySymbol,
    convertToUsd: actions.convertToUsd,
    convertFromUsd: actions.convertFromUsd,
  };
}

// Hook for conversion operations
export function useConversionOperations() {
  const { state, actions } = useCrypto();

  return {
    activeQuote: state.activeQuote,
    isLoading: state.isLoading,
    error: state.error,
    createQuote: actions.createConversionQuote,
    executeQuote: actions.executeQuote,
    cancelQuote: actions.cancelQuote,
    clearError: () => actions.setError(null),
  };
}

// Hook for network congestion
export function useNetworkCongestionInfo(networkType: NetworkType) {
  const { state } = useCrypto();

  return {
    congestion: state.networkCongestion[networkType] || null,
    isLoading: state.isLoading,
  };
}

export default useCrypto;
