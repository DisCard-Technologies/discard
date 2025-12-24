/**
 * DisCard 2035 - useOptimistic Hook
 *
 * React hooks for optimistic UI updates with Alpenglow-ready
 * confirmation tracking.
 */

import { useState, useCallback, useEffect, useMemo } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Id } from "../../convex/_generated/dataModel";

// ============================================================================
// Types
// ============================================================================

export interface OptimisticState {
  isPending: boolean;
  isConfirmed: boolean;
  isFailed: boolean;
  settlementId: string | null;
  confirmationTimeMs: number | null;
  withinTarget: boolean;
  error: string | null;
}

export interface UseOptimisticBalanceReturn {
  /** Current balance (may be optimistic) */
  balance: number;
  /** Execute an optimistic balance update */
  updateBalance: (amount: number, operation: "add" | "subtract") => Promise<void>;
  /** Current optimistic state */
  state: OptimisticState;
  /** Rollback the last optimistic update */
  rollback: () => Promise<void>;
  /** Pending updates for this card */
  pendingUpdates: number;
}

export interface UseOptimisticStatusReturn {
  /** Current status (may be optimistic) */
  status: string;
  /** Execute an optimistic status update */
  updateStatus: (newStatus: "active" | "paused" | "frozen") => Promise<void>;
  /** Current optimistic state */
  state: OptimisticState;
}

export interface ConfirmationStats {
  total: number;
  confirmed: number;
  pending: number;
  failed: number;
  avgConfirmationTimeMs: number;
  alpenglowTargetMs: number;
  alpenglowCompliancePercent: number;
  successRate: number;
}

// ============================================================================
// useOptimisticBalance Hook
// ============================================================================

export function useOptimisticBalance(
  userId: Id<"users"> | null,
  cardId: Id<"cards"> | null
): UseOptimisticBalanceReturn {
  const [state, setState] = useState<OptimisticState>({
    isPending: false,
    isConfirmed: false,
    isFailed: false,
    settlementId: null,
    confirmationTimeMs: null,
    withinTarget: false,
    error: null,
  });

  // Query current card
  const card = useQuery(
    api.cards?.get,
    cardId ? { id: cardId } : "skip"
  );

  // Query pending updates
  const pendingUpdates = useQuery(
    api.realtime?.optimistic?.getPendingUpdates,
    userId ? { userId } : "skip"
  );

  // Mutation for optimistic update
  const optimisticUpdateMutation = useMutation(
    api.realtime?.optimistic?.optimisticBalanceUpdate
  );

  // Subscription to settlement status
  const settlementStatus = useQuery(
    api.realtime?.optimistic?.getSettlementStatus,
    state.settlementId ? { settlementId: state.settlementId as Id<"optimisticSettlements"> } : "skip"
  );

  // Update state when settlement status changes
  useEffect(() => {
    if (settlementStatus) {
      setState((prev) => ({
        ...prev,
        isConfirmed: settlementStatus.status === "confirmed" || settlementStatus.status === "finalized",
        isFailed: settlementStatus.status === "rolled_back" || settlementStatus.status === "failed",
        confirmationTimeMs: settlementStatus.confirmationTimeMs ?? null,
        withinTarget: settlementStatus.isWithinTarget,
        error: settlementStatus.errorMessage ?? null,
      }));

      // Clear pending after confirmation
      if (settlementStatus.status === "confirmed" || settlementStatus.status === "finalized") {
        setTimeout(() => {
          setState((prev) => ({ ...prev, isPending: false }));
        }, 1000);
      }
    }
  }, [settlementStatus]);

  const updateBalance = useCallback(
    async (amount: number, operation: "add" | "subtract") => {
      if (!userId || !cardId) {
        throw new Error("User and card required");
      }

      setState({
        isPending: true,
        isConfirmed: false,
        isFailed: false,
        settlementId: null,
        confirmationTimeMs: null,
        withinTarget: false,
        error: null,
      });

      try {
        const result = await optimisticUpdateMutation({
          userId,
          cardId,
          amount,
          operation,
        });

        setState((prev) => ({
          ...prev,
          settlementId: result.settlementId,
        }));
      } catch (error) {
        setState((prev) => ({
          ...prev,
          isPending: false,
          isFailed: true,
          error: error instanceof Error ? error.message : "Update failed",
        }));
        throw error;
      }
    },
    [userId, cardId, optimisticUpdateMutation]
  );

  const rollback = useCallback(async () => {
    // In production, trigger manual rollback
    setState({
      isPending: false,
      isConfirmed: false,
      isFailed: false,
      settlementId: null,
      confirmationTimeMs: null,
      withinTarget: false,
      error: null,
    });
  }, []);

  const cardPendingCount = useMemo(() => {
    if (!pendingUpdates || !cardId) return 0;
    return pendingUpdates.filter((u) => u.entityId === cardId).length;
  }, [pendingUpdates, cardId]);

  return {
    balance: card?.currentBalance ?? 0,
    updateBalance,
    state,
    rollback,
    pendingUpdates: cardPendingCount,
  };
}

// ============================================================================
// useOptimisticStatus Hook
// ============================================================================

export function useOptimisticStatus(
  userId: Id<"users"> | null,
  cardId: Id<"cards"> | null
): UseOptimisticStatusReturn {
  const [state, setState] = useState<OptimisticState>({
    isPending: false,
    isConfirmed: false,
    isFailed: false,
    settlementId: null,
    confirmationTimeMs: null,
    withinTarget: false,
    error: null,
  });

  // Query current card
  const card = useQuery(
    api.cards?.get,
    cardId ? { id: cardId } : "skip"
  );

  // Mutation for optimistic update
  const optimisticStatusMutation = useMutation(
    api.realtime?.optimistic?.optimisticStatusUpdate
  );

  // Subscription to settlement status
  const settlementStatus = useQuery(
    api.realtime?.optimistic?.getSettlementStatus,
    state.settlementId ? { settlementId: state.settlementId as Id<"optimisticSettlements"> } : "skip"
  );

  useEffect(() => {
    if (settlementStatus) {
      setState((prev) => ({
        ...prev,
        isConfirmed: settlementStatus.status === "confirmed" || settlementStatus.status === "finalized",
        isFailed: settlementStatus.status === "rolled_back" || settlementStatus.status === "failed",
        confirmationTimeMs: settlementStatus.confirmationTimeMs ?? null,
        withinTarget: settlementStatus.isWithinTarget,
        error: settlementStatus.errorMessage ?? null,
      }));

      if (settlementStatus.status === "confirmed" || settlementStatus.status === "finalized") {
        setTimeout(() => {
          setState((prev) => ({ ...prev, isPending: false }));
        }, 1000);
      }
    }
  }, [settlementStatus]);

  const updateStatus = useCallback(
    async (newStatus: "active" | "paused" | "frozen") => {
      if (!userId || !cardId) {
        throw new Error("User and card required");
      }

      setState({
        isPending: true,
        isConfirmed: false,
        isFailed: false,
        settlementId: null,
        confirmationTimeMs: null,
        withinTarget: false,
        error: null,
      });

      try {
        const result = await optimisticStatusMutation({
          userId,
          cardId,
          newStatus,
        });

        setState((prev) => ({
          ...prev,
          settlementId: result.settlementId,
        }));
      } catch (error) {
        setState((prev) => ({
          ...prev,
          isPending: false,
          isFailed: true,
          error: error instanceof Error ? error.message : "Update failed",
        }));
        throw error;
      }
    },
    [userId, cardId, optimisticStatusMutation]
  );

  return {
    status: card?.status ?? "pending",
    updateStatus,
    state,
  };
}

// ============================================================================
// useConfirmationStats Hook
// ============================================================================

export function useConfirmationStats(
  userId: Id<"users"> | null
): ConfirmationStats | null {
  const stats = useQuery(
    api.realtime?.optimistic?.getConfirmationStats,
    userId ? { userId } : "skip"
  );

  return stats ?? null;
}

// ============================================================================
// useAlpenglowMonitor Hook
// ============================================================================

export interface AlpenglowMetrics {
  isAlpenglowReady: boolean;
  currentAvgConfirmationMs: number;
  targetMs: number;
  compliancePercent: number;
  recentConfirmations: Array<{
    timeMs: number;
    withinTarget: boolean;
  }>;
}

export function useAlpenglowMonitor(
  userId: Id<"users"> | null
): AlpenglowMetrics {
  const stats = useConfirmationStats(userId);

  return useMemo(() => {
    if (!stats) {
      return {
        isAlpenglowReady: true,
        currentAvgConfirmationMs: 0,
        targetMs: 150,
        compliancePercent: 100,
        recentConfirmations: [],
      };
    }

    return {
      isAlpenglowReady: stats.alpenglowCompliancePercent >= 95,
      currentAvgConfirmationMs: stats.avgConfirmationTimeMs,
      targetMs: stats.alpenglowTargetMs,
      compliancePercent: stats.alpenglowCompliancePercent,
      recentConfirmations: [], // Would be populated from detailed data
    };
  }, [stats]);
}

// ============================================================================
// usePendingSettlements Hook
// ============================================================================

export function usePendingSettlements(userId: Id<"users"> | null) {
  const pending = useQuery(
    api.realtime?.optimistic?.getPendingUpdates,
    userId ? { userId } : "skip"
  );

  return useMemo(() => {
    if (!pending) return { count: 0, settlements: [] };

    return {
      count: pending.length,
      settlements: pending.map((s) => ({
        id: s._id,
        entityType: s.entityType,
        entityId: s.entityId,
        status: s.status,
        createdAt: s.createdAt,
        elapsedMs: Date.now() - s.createdAt,
      })),
    };
  }, [pending]);
}

// ============================================================================
// useOptimisticTransaction Hook (General Purpose)
// ============================================================================

export interface UseOptimisticTransactionReturn<T> {
  execute: (params: T) => Promise<void>;
  state: OptimisticState;
  reset: () => void;
}

export function useOptimisticTransaction<T>(
  mutationFn: (params: T) => Promise<{ settlementId: string }>
): UseOptimisticTransactionReturn<T> {
  const [state, setState] = useState<OptimisticState>({
    isPending: false,
    isConfirmed: false,
    isFailed: false,
    settlementId: null,
    confirmationTimeMs: null,
    withinTarget: false,
    error: null,
  });

  const settlementStatus = useQuery(
    api.realtime?.optimistic?.getSettlementStatus,
    state.settlementId ? { settlementId: state.settlementId as Id<"optimisticSettlements"> } : "skip"
  );

  useEffect(() => {
    if (settlementStatus) {
      setState((prev) => ({
        ...prev,
        isConfirmed: settlementStatus.status === "confirmed" || settlementStatus.status === "finalized",
        isFailed: settlementStatus.status === "rolled_back" || settlementStatus.status === "failed",
        confirmationTimeMs: settlementStatus.confirmationTimeMs ?? null,
        withinTarget: settlementStatus.isWithinTarget,
        error: settlementStatus.errorMessage ?? null,
        isPending: settlementStatus.status === "pending" || settlementStatus.status === "submitted",
      }));
    }
  }, [settlementStatus]);

  const execute = useCallback(
    async (params: T) => {
      setState({
        isPending: true,
        isConfirmed: false,
        isFailed: false,
        settlementId: null,
        confirmationTimeMs: null,
        withinTarget: false,
        error: null,
      });

      try {
        const result = await mutationFn(params);
        setState((prev) => ({
          ...prev,
          settlementId: result.settlementId,
        }));
      } catch (error) {
        setState((prev) => ({
          ...prev,
          isPending: false,
          isFailed: true,
          error: error instanceof Error ? error.message : "Transaction failed",
        }));
        throw error;
      }
    },
    [mutationFn]
  );

  const reset = useCallback(() => {
    setState({
      isPending: false,
      isConfirmed: false,
      isFailed: false,
      settlementId: null,
      confirmationTimeMs: null,
      withinTarget: false,
      error: null,
    });
  }, []);

  return { execute, state, reset };
}

export default useOptimisticBalance;
