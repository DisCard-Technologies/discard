/**
 * Wallets Hook
 *
 * Provides wallet connection management and DeFi position tracking.
 * Supports external wallets (MetaMask, WalletConnect) and DeFi protocols.
 */
import { useCallback } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";

type WalletType = "metamask" | "walletconnect" | "phantom" | "solflare" | "coinbase";
type NetworkType = "ethereum" | "solana" | "polygon" | "arbitrum" | "base";
type ConnectionStatus = "connected" | "disconnected" | "expired" | "error";

interface Wallet {
  _id: Id<"wallets">;
  userId: Id<"users">;
  walletType: WalletType;
  networkType: NetworkType;
  publicAddress: string;
  connectionStatus: ConnectionStatus;
  nickname?: string;
  cachedBalanceUsd?: number;
  lastUsedAt?: number;
}

interface DeFiPosition {
  _id: Id<"defi">;
  userId: Id<"users">;
  walletId: Id<"wallets">;
  protocolName: string;
  positionType: "lending" | "staking" | "lp" | "vault";
  totalValueUsd: number;
  earnedValueUsd: number;
  availableForFunding: number;
  currentYieldApy: number;
}

interface UseWalletsReturn {
  wallets: Wallet[] | undefined;
  isLoading: boolean;
  connectWallet: (
    walletType: WalletType,
    networkType: NetworkType,
    publicAddress: string,
    nickname?: string
  ) => Promise<Id<"wallets">>;
  disconnectWallet: (walletId: Id<"wallets">) => Promise<void>;
  refreshWalletBalance: (walletId: Id<"wallets">) => Promise<void>;
}

export function useWallets(userId: Id<"users"> | null): UseWalletsReturn {
  // Real-time subscription to user's wallets
  const wallets = useQuery(
    api.wallets.wallets.list,
    userId ? { userId } : "skip"
  );

  // Mutations
  const connectWalletMutation = useMutation(api.wallets.wallets.connect);
  const disconnectWalletMutation = useMutation(api.wallets.wallets.disconnect);
  const refreshBalanceMutation = useMutation(api.wallets.wallets.refreshBalance);

  const isLoading = wallets === undefined;

  /**
   * Connect a new external wallet
   */
  const connectWallet = useCallback(
    async (
      walletType: WalletType,
      networkType: NetworkType,
      publicAddress: string,
      nickname?: string
    ): Promise<Id<"wallets">> => {
      if (!userId) {
        throw new Error("User not authenticated");
      }

      return await connectWalletMutation({
        userId,
        walletType,
        networkType,
        publicAddress,
        nickname,
      });
    },
    [userId, connectWalletMutation]
  );

  /**
   * Disconnect a wallet
   */
  const disconnectWallet = useCallback(
    async (walletId: Id<"wallets">): Promise<void> => {
      await disconnectWalletMutation({ walletId });
    },
    [disconnectWalletMutation]
  );

  /**
   * Refresh wallet balance
   */
  const refreshWalletBalance = useCallback(
    async (walletId: Id<"wallets">): Promise<void> => {
      await refreshBalanceMutation({ walletId });
    },
    [refreshBalanceMutation]
  );

  return {
    wallets: wallets as Wallet[] | undefined,
    isLoading,
    connectWallet,
    disconnectWallet,
    refreshWalletBalance,
  };
}

/**
 * Hook for DeFi position management
 */
export function useDefiPositions(userId: Id<"users"> | null) {
  // Real-time subscription to user's DeFi positions
  const positions = useQuery(
    api.wallets.defi.listPositions,
    userId ? { userId } : "skip"
  );

  // Calculate totals
  const totalValueUsd = positions?.reduce((sum, p) => sum + p.totalValueUsd, 0) ?? 0;
  const totalEarnedUsd = positions?.reduce((sum, p) => sum + p.earnedValueUsd, 0) ?? 0;
  const totalAvailableForFunding = positions?.reduce((sum, p) => sum + p.availableForFunding, 0) ?? 0;

  return {
    positions: positions as DeFiPosition[] | undefined,
    isLoading: positions === undefined,
    totalValueUsd,
    totalEarnedUsd,
    totalAvailableForFunding,
  };
}

/**
 * Hook for a single wallet with real-time updates
 */
export function useWallet(walletId: Id<"wallets"> | null) {
  const wallet = useQuery(
    api.wallets.wallets.get,
    walletId ? { walletId } : "skip"
  );

  return {
    wallet: wallet as Wallet | null | undefined,
    isLoading: wallet === undefined,
  };
}

/**
 * Hook for getting available funding sources (wallets + DeFi positions)
 */
export function useFundingSources(userId: Id<"users"> | null) {
  const wallets = useQuery(
    api.wallets.wallets.list,
    userId ? { userId } : "skip"
  );

  const defiPositions = useQuery(
    api.wallets.defi.listPositions,
    userId ? { userId } : "skip"
  );

  // Combine into funding sources
  const fundingSources = [
    ...(wallets?.map((w) => ({
      id: w._id,
      type: "wallet" as const,
      name: w.nickname || `${w.walletType} (${w.networkType})`,
      availableAmount: w.cachedBalanceUsd ?? 0,
      network: w.networkType,
    })) ?? []),
    ...(defiPositions?.map((p) => ({
      id: p._id,
      type: "defi" as const,
      name: `${p.protocolName} ${p.positionType}`,
      availableAmount: p.availableForFunding,
      yield: p.currentYieldApy,
    })) ?? []),
  ];

  return {
    fundingSources,
    isLoading: wallets === undefined || defiPositions === undefined,
  };
}
