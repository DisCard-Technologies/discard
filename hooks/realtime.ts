/**
 * Real-time Subscription Hooks
 *
 * This module exports all Convex-based real-time subscription hooks.
 * These hooks replace the legacy WebSocket-based implementations with
 * Convex's built-in real-time subscriptions.
 *
 * Benefits of Convex subscriptions:
 * - Automatic reconnection handling
 * - No manual WebSocket management
 * - Optimistic updates
 * - Consistent state across components
 * - Automatic caching and deduplication
 */

// Crypto Rates - Real-time cryptocurrency price updates
export {
  useCryptoRates,
  useHistoricalRates,
  useRateComparison,
  type CryptoRate,
  type ConnectionState,
} from './useCryptoRatesConvex';

// Transaction Subscriptions - Real-time transaction and alert updates
export {
  useTransactionSubscription,
  useCardTransactions,
  useAuthorizationStatus,
  type Transaction,
  type SpendingAlert,
  type TransactionUpdate,
  type CardSpendingSummary,
} from './useTransactionSubscription';

// Re-export from stores for convenience
export { useCrypto, useCryptoState, useCryptoActions } from '@/stores/cryptoConvex';
export { useWallets, useWalletsState, useFundingSources } from '@/stores/walletsConvex';
export { useFunding, useFundingState } from '@/stores/fundingConvex';
export { useCards, useCardsState, useCardOperations } from '@/stores/cardsConvex';

/**
 * Migration Guide
 *
 * Legacy WebSocket hooks -> Convex real-time hooks:
 *
 * 1. useCryptoRatesWebSocket -> useCryptoRates
 *    - No need to manage connect/disconnect
 *    - Rates update automatically
 *    - Use getRateBySymbol, convertToUsd utilities
 *
 * 2. useTransactionWebSocket -> useTransactionSubscription
 *    - Automatic subscription to card transactions
 *    - Built-in spending alerts
 *    - Callbacks for new transactions (onNewTransaction)
 *
 * 3. useWebSocketConnection -> Convex useQuery
 *    - Use domain-specific hooks above
 *    - Or create custom subscriptions with useQuery(api.your.query)
 *
 * 4. crypto.ts (Zustand store) -> cryptoConvex.tsx
 *    - Replace useCrypto() Zustand with useCrypto() Context
 *    - Same API, now with real-time updates
 */
