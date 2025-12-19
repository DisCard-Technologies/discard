/**
 * Convex-based Transaction Subscription Hook
 *
 * Replaces WebSocket-based transaction updates with Convex real-time subscriptions.
 * Provides automatic updates for transaction history, spending alerts, and card activity.
 */

import { useCallback, useMemo, useEffect, useRef } from 'react';
import { useQuery } from 'convex/react';
import { api } from '../../convex/_generated/api';
import type { Id } from '../../convex/_generated/dataModel';
import { useCurrentUserId } from '../stores/authConvex';

// Type definitions
export interface Transaction {
  _id: Id<'authorizations'>;
  transactionId: string;
  cardId: Id<'cards'>;
  merchantName: string;
  merchantCategory: string;
  amount: number;
  currency: string;
  status: 'pending' | 'authorized' | 'settled' | 'declined' | 'refunded';
  processedAt: number;
  settledAt?: number;
  declineReason?: string;
}

export interface SpendingAlert {
  _id: string;
  cardId: string;
  alertType: 'limit_threshold' | 'unusual_pattern' | 'velocity' | 'high_risk';
  threshold?: number;
  currentAmount?: number;
  message: string;
  severity: 'info' | 'warning' | 'critical';
  timestamp: number;
  acknowledged: boolean;
}

export interface TransactionUpdate {
  type: 'new_transaction' | 'status_change' | 'refund';
  transaction: Transaction;
  previousStatus?: string;
}

export interface CardSpendingSummary {
  cardId: string;
  totalSpent24h: number;
  totalSpent7d: number;
  totalSpent30d: number;
  transactionCount24h: number;
  averageTransaction: number;
  topCategories: Array<{ category: string; amount: number; percentage: number }>;
}

interface UseTransactionSubscriptionOptions {
  cardIds?: string[];
  enabled?: boolean;
  onNewTransaction?: (transaction: Transaction) => void;
  onSpendingAlert?: (alert: SpendingAlert) => void;
}

interface UseTransactionSubscriptionReturn {
  // Transaction Data
  transactions: Transaction[];
  recentTransactions: Transaction[];
  pendingTransactions: Transaction[];

  // Alerts
  alerts: SpendingAlert[];
  unacknowledgedAlerts: SpendingAlert[];

  // Spending Summary
  spendingSummary: CardSpendingSummary | null;

  // Connection State
  isConnected: boolean;
  isLoading: boolean;
  lastUpdate: Date | null;

  // Actions
  acknowledgeAlert: (alertId: string) => void;
  getTransactionById: (transactionId: string) => Transaction | null;
  getTransactionsByCard: (cardId: string) => Transaction[];
  getTransactionsByStatus: (status: Transaction['status']) => Transaction[];
}

export function useTransactionSubscription(
  options: UseTransactionSubscriptionOptions = {}
): UseTransactionSubscriptionReturn {
  const { cardIds, enabled = true, onNewTransaction, onSpendingAlert } = options;
  const userId = useCurrentUserId();

  // Track previous transactions for detecting new ones
  const previousTransactionsRef = useRef<Set<string>>(new Set());
  const previousAlertsRef = useRef<Set<string>>(new Set());

  // Real-time subscription to transactions
  const transactionsData = useQuery(
    api.cards.authorizations.listRecent,
    enabled && userId
      ? { userId, cardIds: cardIds as Id<'cards'>[] | undefined, limit: 100 }
      : 'skip'
  );

  // Real-time subscription to spending alerts
  const alertsData = useQuery(
    api.fraud.alerts.listActive,
    enabled && userId ? { userId } : 'skip'
  );

  // Real-time subscription to spending summary
  const summaryData = useQuery(
    api.funding.spending.getSummary,
    enabled && userId && cardIds?.length === 1
      ? { cardId: cardIds[0] as Id<'cards'> }
      : 'skip'
  );

  // Transform transactions
  const transactions: Transaction[] = useMemo(() => {
    if (!transactionsData) return [];
    return transactionsData.map((t) => ({
      _id: t._id,
      transactionId: t._id,
      cardId: t.cardId,
      merchantName: t.merchantName || 'Unknown Merchant',
      merchantCategory: t.merchantCategory || 'other',
      amount: t.amount,
      currency: t.currency || 'USD',
      status: t.status as Transaction['status'],
      processedAt: t.processedAt,
      settledAt: t.settledAt,
      declineReason: t.declineReason,
    }));
  }, [transactionsData]);

  // Recent transactions (last 24 hours)
  const recentTransactions = useMemo(() => {
    const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
    return transactions.filter((t) => t.processedAt > oneDayAgo);
  }, [transactions]);

  // Pending transactions
  const pendingTransactions = useMemo(() => {
    return transactions.filter((t) => t.status === 'pending' || t.status === 'authorized');
  }, [transactions]);

  // Transform alerts
  const alerts: SpendingAlert[] = useMemo(() => {
    if (!alertsData) return [];
    return alertsData.map((a) => ({
      _id: a._id,
      cardId: a.cardId,
      alertType: a.alertType as SpendingAlert['alertType'],
      threshold: a.threshold,
      currentAmount: a.currentAmount,
      message: a.message,
      severity: a.severity as SpendingAlert['severity'],
      timestamp: a.createdAt,
      acknowledged: a.acknowledged || false,
    }));
  }, [alertsData]);

  // Unacknowledged alerts
  const unacknowledgedAlerts = useMemo(() => {
    return alerts.filter((a) => !a.acknowledged);
  }, [alerts]);

  // Spending summary
  const spendingSummary: CardSpendingSummary | null = useMemo(() => {
    if (!summaryData || !cardIds?.length) return null;
    return {
      cardId: cardIds[0],
      totalSpent24h: summaryData.totalSpent24h || 0,
      totalSpent7d: summaryData.totalSpent7d || 0,
      totalSpent30d: summaryData.totalSpent30d || 0,
      transactionCount24h: summaryData.transactionCount24h || 0,
      averageTransaction: summaryData.averageTransaction || 0,
      topCategories: summaryData.topCategories || [],
    };
  }, [summaryData, cardIds]);

  // Detect new transactions and trigger callbacks
  useEffect(() => {
    if (!transactionsData || !onNewTransaction) return;

    const currentIds = new Set(transactionsData.map((t) => t._id));
    const previousIds = previousTransactionsRef.current;

    // Find new transactions
    transactionsData.forEach((t) => {
      if (!previousIds.has(t._id)) {
        onNewTransaction({
          _id: t._id,
          transactionId: t._id,
          cardId: t.cardId,
          merchantName: t.merchantName || 'Unknown Merchant',
          merchantCategory: t.merchantCategory || 'other',
          amount: t.amount,
          currency: t.currency || 'USD',
          status: t.status as Transaction['status'],
          processedAt: t.processedAt,
          settledAt: t.settledAt,
          declineReason: t.declineReason,
        });
      }
    });

    previousTransactionsRef.current = currentIds;
  }, [transactionsData, onNewTransaction]);

  // Detect new alerts and trigger callbacks
  useEffect(() => {
    if (!alertsData || !onSpendingAlert) return;

    const currentIds = new Set(alertsData.map((a) => a._id));
    const previousIds = previousAlertsRef.current;

    // Find new alerts
    alertsData.forEach((a) => {
      if (!previousIds.has(a._id)) {
        onSpendingAlert({
          _id: a._id,
          cardId: a.cardId,
          alertType: a.alertType as SpendingAlert['alertType'],
          threshold: a.threshold,
          currentAmount: a.currentAmount,
          message: a.message,
          severity: a.severity as SpendingAlert['severity'],
          timestamp: a.createdAt,
          acknowledged: a.acknowledged || false,
        });
      }
    });

    previousAlertsRef.current = currentIds;
  }, [alertsData, onSpendingAlert]);

  // Action to acknowledge alert (would need mutation)
  const acknowledgeAlert = useCallback((_alertId: string) => {
    // This would call a Convex mutation to mark alert as acknowledged
    console.log('Acknowledge alert:', _alertId);
  }, []);

  // Utility functions
  const getTransactionById = useCallback(
    (transactionId: string): Transaction | null => {
      return transactions.find((t) => t.transactionId === transactionId) || null;
    },
    [transactions]
  );

  const getTransactionsByCard = useCallback(
    (cardId: string): Transaction[] => {
      return transactions.filter((t) => t.cardId === cardId);
    },
    [transactions]
  );

  const getTransactionsByStatus = useCallback(
    (status: Transaction['status']): Transaction[] => {
      return transactions.filter((t) => t.status === status);
    },
    [transactions]
  );

  return {
    transactions,
    recentTransactions,
    pendingTransactions,
    alerts,
    unacknowledgedAlerts,
    spendingSummary,
    isConnected: transactionsData !== undefined,
    isLoading: transactionsData === undefined,
    lastUpdate: transactionsData ? new Date() : null,
    acknowledgeAlert,
    getTransactionById,
    getTransactionsByCard,
    getTransactionsByStatus,
  };
}

/**
 * Hook for subscribing to a single card's transactions
 */
export function useCardTransactions(cardId: string | null) {
  const userId = useCurrentUserId();

  const transactionsData = useQuery(
    api.cards.authorizations.listByCard,
    cardId && userId ? { cardId: cardId as Id<'cards'>, limit: 50 } : 'skip'
  );

  const transactions: Transaction[] = useMemo(() => {
    if (!transactionsData) return [];
    return transactionsData.map((t) => ({
      _id: t._id,
      transactionId: t._id,
      cardId: t.cardId,
      merchantName: t.merchantName || 'Unknown Merchant',
      merchantCategory: t.merchantCategory || 'other',
      amount: t.amount,
      currency: t.currency || 'USD',
      status: t.status as Transaction['status'],
      processedAt: t.processedAt,
      settledAt: t.settledAt,
      declineReason: t.declineReason,
    }));
  }, [transactionsData]);

  return {
    transactions,
    isLoading: transactionsData === undefined,
    isEmpty: transactions.length === 0,
    totalCount: transactions.length,
  };
}

/**
 * Hook for real-time authorization status tracking
 */
export function useAuthorizationStatus(authorizationId: string | null) {
  const authorization = useQuery(
    api.cards.authorizations.get,
    authorizationId ? { authorizationId: authorizationId as Id<'authorizations'> } : 'skip'
  );

  return {
    authorization: authorization
      ? {
          id: authorization._id,
          status: authorization.status,
          amount: authorization.amount,
          merchantName: authorization.merchantName,
          processedAt: authorization.processedAt,
          responseTimeMs: authorization.responseTimeMs,
        }
      : null,
    isLoading: authorization === undefined,
    isApproved: authorization?.status === 'authorized' || authorization?.status === 'settled',
    isDeclined: authorization?.status === 'declined',
    isPending: authorization?.status === 'pending',
  };
}

export default useTransactionSubscription;
