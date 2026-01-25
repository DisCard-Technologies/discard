/**
 * Shared refresh lock for holdings hooks
 *
 * Prevents concurrent refreshHoldings calls from multiple hooks
 * (useTokenHoldings and useRwaHoldings) for the same wallet.
 */

// Global lock map: walletAddress -> isRefreshing
const refreshLocks = new Map<string, boolean>();

/**
 * Acquire a refresh lock for a wallet
 * @returns true if lock acquired, false if already locked
 */
export function acquireRefreshLock(walletAddress: string): boolean {
  if (refreshLocks.get(walletAddress)) {
    return false;
  }
  refreshLocks.set(walletAddress, true);
  return true;
}

/**
 * Release a refresh lock for a wallet
 */
export function releaseRefreshLock(walletAddress: string): void {
  refreshLocks.delete(walletAddress);
}

/**
 * Check if a wallet has an active refresh
 */
export function isRefreshLocked(walletAddress: string): boolean {
  return refreshLocks.get(walletAddress) ?? false;
}
