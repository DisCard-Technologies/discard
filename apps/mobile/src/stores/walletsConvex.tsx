/**
 * Convex-based Wallets Store
 *
 * Replaces REST/WebSocket with Convex real-time subscriptions.
 * Manages crypto wallets, DeFi positions, and balances.
 */
import React, {
  createContext,
  useContext,
  useState,
  ReactNode,
} from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { useCurrentUserId } from "./authConvex";

// Type definitions
export type WalletType = "metamask" | "walletconnect" | "phantom" | "solflare" | "coinbase";
export type NetworkType = "ethereum" | "solana" | "polygon" | "arbitrum" | "base";
export type ConnectionStatus = "connected" | "disconnected" | "expired" | "error";

export interface CryptoWallet {
  _id: Id<"wallets">;
  walletId: string;
  userId: Id<"users">;
  walletType: WalletType;
  networkType: NetworkType;
  publicAddress: string;
  connectionStatus: ConnectionStatus;
  nickname?: string;
  cachedBalanceUsd?: number;
  lastUsedAt?: number;
  createdAt: number;
}

export interface DeFiPosition {
  _id: Id<"defi">;
  positionId: string;
  userId: Id<"users">;
  walletId: Id<"wallets">;
  protocolName: string;
  positionType: "lending" | "staking" | "lp" | "vault";
  depositedTokens: string;
  depositedValueUsd: number;
  totalValueUsd: number;
  earnedValueUsd: number;
  availableForFunding: number;
  currentYieldApy: number;
  estimatedDailyYield: number;
  syncStatus: "synced" | "syncing" | "error";
  lastSyncedAt?: number;
}

export interface WalletBalance {
  walletId: string;
  balanceUsd: number;
  tokens: Array<{
    symbol: string;
    balance: number;
    valueUsd: number;
  }>;
  lastUpdated: number;
}

// State interface
export interface WalletsState {
  wallets: CryptoWallet[];
  defiPositions: DeFiPosition[];
  isLoading: boolean;
  isConnecting: boolean;
  error: string | null;
  totalPortfolioValue: number;
  totalDefiValue: number;
  totalAvailableForFunding: number;
}

// Actions interface
export interface WalletsActions {
  connectWallet: (
    walletType: WalletType,
    networkType: NetworkType,
    publicAddress: string,
    nickname?: string
  ) => Promise<CryptoWallet | null>;
  disconnectWallet: (walletId: string) => Promise<boolean>;
  refreshWalletBalance: (walletId: string) => Promise<void>;
  refreshAllBalances: () => Promise<void>;
  setError: (error: string | null) => void;
  clearError: () => void;
}

// Context
const WalletsContext = createContext<{
  state: WalletsState;
  actions: WalletsActions;
} | null>(null);

// Provider component
export function WalletsProvider({ children }: { children: ReactNode }) {
  const userId = useCurrentUserId();
  const [error, setError] = useState<string | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);

  // Real-time subscription to wallets
  const walletsData = useQuery(
    api.wallets.wallets.list,
    userId ? { userId } : "skip"
  );

  // Real-time subscription to DeFi positions
  const defiData = useQuery(
    api.wallets.defi.listPositions,
    userId ? { userId } : "skip"
  );

  // Mutations
  const connectWalletMutation = useMutation(api.wallets.wallets.connect);
  const disconnectWalletMutation = useMutation(api.wallets.wallets.disconnect);
  const refreshBalanceMutation = useMutation(api.wallets.wallets.refreshBalance);

  // Transform data
  const wallets: CryptoWallet[] = (walletsData || []).map((w) => ({
    ...w,
    walletId: w._id,
  }));

  const defiPositions: DeFiPosition[] = (defiData || []).map((p) => ({
    ...p,
    positionId: p._id,
  }));

  // Calculate totals
  const totalPortfolioValue = wallets.reduce(
    (sum, w) => sum + (w.cachedBalanceUsd || 0),
    0
  );

  const totalDefiValue = defiPositions.reduce(
    (sum, p) => sum + p.totalValueUsd,
    0
  );

  const totalAvailableForFunding = defiPositions.reduce(
    (sum, p) => sum + p.availableForFunding,
    0
  );

  const isLoading = walletsData === undefined || defiData === undefined;

  // Build state
  const state: WalletsState = {
    wallets,
    defiPositions,
    isLoading,
    isConnecting,
    error,
    totalPortfolioValue,
    totalDefiValue,
    totalAvailableForFunding,
  };

  const actions: WalletsActions = {
    /**
     * Connect a new wallet
     */
    connectWallet: async (
      walletType: WalletType,
      networkType: NetworkType,
      publicAddress: string,
      nickname?: string
    ): Promise<CryptoWallet | null> => {
      if (!userId) {
        setError("Not authenticated");
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
        const message = err instanceof Error ? err.message : "Failed to connect wallet";
        setError(message);
        return null;
      } finally {
        setIsConnecting(false);
      }
    },

    /**
     * Disconnect a wallet
     */
    disconnectWallet: async (walletId: string): Promise<boolean> => {
      try {
        await disconnectWalletMutation({
          walletId: walletId as Id<"wallets">,
        });
        return true;
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to disconnect wallet";
        setError(message);
        return false;
      }
    },

    /**
     * Refresh wallet balance
     */
    refreshWalletBalance: async (walletId: string): Promise<void> => {
      try {
        await refreshBalanceMutation({
          walletId: walletId as Id<"wallets">,
        });
      } catch (err) {
        console.error("Failed to refresh wallet balance:", err);
      }
    },

    /**
     * Refresh all wallet balances
     */
    refreshAllBalances: async (): Promise<void> => {
      try {
        await Promise.all(
          wallets.map((w) => refreshBalanceMutation({ walletId: w._id }))
        );
      } catch (err) {
        console.error("Failed to refresh all balances:", err);
      }
    },

    /**
     * Set error
     */
    setError: (err: string | null): void => {
      setError(err);
    },

    /**
     * Clear error
     */
    clearError: (): void => {
      setError(null);
    },
  };

  return (
    <WalletsContext.Provider value={{ state, actions }}>
      {children}
    </WalletsContext.Provider>
  );
}

// Hook to use wallets context
export function useWallets() {
  const context = useContext(WalletsContext);
  if (!context) {
    throw new Error("useWallets must be used within a WalletsProvider");
  }
  return context;
}

// Hook for wallet operations
export function useWalletOperations() {
  const { actions } = useWallets();
  return actions;
}

// Hook for wallets state
export function useWalletsState() {
  const { state } = useWallets();
  return state;
}

// Hook for DeFi positions
export function useDefiPositions() {
  const { state } = useWallets();
  return {
    positions: state.defiPositions,
    totalValue: state.totalDefiValue,
    availableForFunding: state.totalAvailableForFunding,
    isLoading: state.isLoading,
  };
}

// Hook for funding sources (wallets + DeFi)
export function useFundingSources() {
  const { state } = useWallets();

  const sources = [
    ...state.wallets
      .filter((w) => w.connectionStatus === "connected")
      .map((w) => ({
        id: w._id,
        type: "wallet" as const,
        name: w.nickname || `${w.walletType} (${w.networkType})`,
        availableAmount: w.cachedBalanceUsd || 0,
        network: w.networkType,
      })),
    ...state.defiPositions
      .filter((p) => p.availableForFunding > 0)
      .map((p) => ({
        id: p._id,
        type: "defi" as const,
        name: `${p.protocolName} ${p.positionType}`,
        availableAmount: p.availableForFunding,
        yield: p.currentYieldApy,
      })),
  ];

  return {
    sources,
    isLoading: state.isLoading,
    totalAvailable: state.totalPortfolioValue + state.totalAvailableForFunding,
  };
}
