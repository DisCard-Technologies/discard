/**
 * Smart Refresh Strategy Hook
 *
 * Provides intelligent refresh triggers:
 * 1. App foreground - refresh when returning from background
 * 2. Event-driven - refresh on transaction completion
 * 3. Staleness-aware - track data age and refresh accordingly
 */
import { useEffect, useRef, useCallback } from 'react';
import { AppState, AppStateStatus } from 'react-native';

interface UseRefreshOnForegroundOptions {
  /** Callback to execute when app returns to foreground */
  onForeground: () => void;
  /** Minimum time in background before triggering refresh (ms). Default: 5000 (5s) */
  minBackgroundTime?: number;
  /** Whether the hook is enabled. Default: true */
  enabled?: boolean;
}

/**
 * Triggers a callback when app returns to foreground after being backgrounded
 *
 * @example
 * ```tsx
 * useRefreshOnForeground({
 *   onForeground: () => refresh(),
 *   minBackgroundTime: 10000, // Only refresh if backgrounded for 10s+
 * });
 * ```
 */
export function useRefreshOnForeground({
  onForeground,
  minBackgroundTime = 5000,
  enabled = true,
}: UseRefreshOnForegroundOptions) {
  const appState = useRef<AppStateStatus>(AppState.currentState);
  const backgroundedAt = useRef<number | null>(null);

  useEffect(() => {
    if (!enabled) return;

    const handleAppStateChange = (nextAppState: AppStateStatus) => {
      // App went to background
      if (
        appState.current === 'active' &&
        (nextAppState === 'background' || nextAppState === 'inactive')
      ) {
        backgroundedAt.current = Date.now();
      }

      // App came to foreground
      if (
        (appState.current === 'background' || appState.current === 'inactive') &&
        nextAppState === 'active'
      ) {
        const wasBackgroundedAt = backgroundedAt.current;
        if (wasBackgroundedAt) {
          const timeInBackground = Date.now() - wasBackgroundedAt;
          if (timeInBackground >= minBackgroundTime) {
            onForeground();
          }
        }
        backgroundedAt.current = null;
      }

      appState.current = nextAppState;
    };

    const subscription = AppState.addEventListener('change', handleAppStateChange);
    return () => subscription.remove();
  }, [enabled, minBackgroundTime, onForeground]);
}

interface StalenessInfo {
  /** Whether data is considered stale */
  isStale: boolean;
  /** Time since last update in milliseconds */
  age: number | null;
  /** Human-readable age string */
  ageText: string | null;
}

interface UseStalenessOptions {
  /** Last update timestamp */
  lastUpdated: Date | null;
  /** Time after which data is considered stale (ms). Default: 300000 (5 min) */
  staleAfter?: number;
}

/**
 * Tracks data staleness and provides age information
 *
 * @example
 * ```tsx
 * const { isStale, ageText } = useStaleness({
 *   lastUpdated,
 *   staleAfter: 60000 // 1 minute
 * });
 *
 * if (isStale) {
 *   return <Text>Updated {ageText}</Text>;
 * }
 * ```
 */
export function useStaleness({
  lastUpdated,
  staleAfter = 5 * 60 * 1000, // 5 minutes
}: UseStalenessOptions): StalenessInfo {
  if (!lastUpdated) {
    return { isStale: false, age: null, ageText: null };
  }

  const age = Date.now() - lastUpdated.getTime();
  const isStale = age > staleAfter;

  let ageText: string | null = null;
  if (age < 60000) {
    ageText = 'just now';
  } else if (age < 3600000) {
    const mins = Math.floor(age / 60000);
    ageText = `${mins}m ago`;
  } else if (age < 86400000) {
    const hours = Math.floor(age / 3600000);
    ageText = `${hours}h ago`;
  } else {
    const days = Math.floor(age / 86400000);
    ageText = `${days}d ago`;
  }

  return { isStale, age, ageText };
}

// Event types for refresh triggers
type RefreshEventType =
  | 'transaction_completed'
  | 'swap_completed'
  | 'transfer_sent'
  | 'transfer_received'
  | 'deposit_completed';

type RefreshEventListener = (event: RefreshEventType) => void;

// Simple event emitter for refresh events
const listeners = new Set<RefreshEventListener>();

/**
 * Emit a refresh event to trigger data updates across the app
 *
 * @example
 * ```tsx
 * // After completing a transaction
 * await sendTransaction();
 * emitRefreshEvent('transaction_completed');
 * ```
 */
export function emitRefreshEvent(event: RefreshEventType) {
  listeners.forEach(listener => listener(event));
}

/**
 * Subscribe to refresh events for event-driven data updates
 *
 * @example
 * ```tsx
 * useRefreshOnEvent({
 *   events: ['transaction_completed', 'swap_completed'],
 *   onEvent: (event) => refresh(),
 * });
 * ```
 */
export function useRefreshOnEvent({
  events,
  onEvent,
  enabled = true,
}: {
  events: RefreshEventType[];
  onEvent: (event: RefreshEventType) => void;
  enabled?: boolean;
}) {
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;

  useEffect(() => {
    if (!enabled) return;

    const handler: RefreshEventListener = (event) => {
      if (events.includes(event)) {
        onEventRef.current(event);
      }
    };

    listeners.add(handler);
    return () => {
      listeners.delete(handler);
    };
  }, [enabled, events]);
}

/**
 * Combined smart refresh hook - use this for most cases
 *
 * Combines foreground refresh + event-driven refresh
 *
 * @example
 * ```tsx
 * useSmartRefresh({
 *   refresh: () => refreshHoldings(),
 *   refreshEvents: ['transaction_completed', 'swap_completed'],
 *   minBackgroundTime: 10000,
 * });
 * ```
 */
export function useSmartRefresh({
  refresh,
  refreshEvents = ['transaction_completed', 'swap_completed', 'transfer_sent', 'deposit_completed'],
  minBackgroundTime = 5000,
  enabled = true,
}: {
  refresh: () => void;
  refreshEvents?: RefreshEventType[];
  minBackgroundTime?: number;
  enabled?: boolean;
}) {
  const refreshRef = useRef(refresh);
  refreshRef.current = refresh;

  const stableRefresh = useCallback(() => {
    refreshRef.current();
  }, []);

  // Refresh on app foreground
  useRefreshOnForeground({
    onForeground: stableRefresh,
    minBackgroundTime,
    enabled,
  });

  // Refresh on events
  useRefreshOnEvent({
    events: refreshEvents,
    onEvent: stableRefresh,
    enabled,
  });
}
