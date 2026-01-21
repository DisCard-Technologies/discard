/**
 * Scheduled Jobs (Cron)
 *
 * Defines background tasks that run on a schedule:
 * - Expire old authorization holds
 * - Sync DeFi positions
 * - Cleanup expired wallet sessions
 * - Self-healing card checks
 */
import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// ============ AUTHORIZATION HOLDS ============

/**
 * Expire old authorization holds every 5 minutes
 * Releases reserved funds from expired holds
 */
crons.interval(
  "expire-authorization-holds",
  { minutes: 5 },
  internal.crons.expireHolds.run
);

// ============ DEFI SYNC ============

/**
 * Sync DeFi positions every 15 minutes
 * Updates balances and yield data for user positions
 */
crons.interval(
  "sync-defi-positions",
  { minutes: 15 },
  internal.crons.syncDefi.run
);

// ============ SESSION CLEANUP ============

/**
 * Cleanup expired wallet sessions daily
 * Removes disconnected and expired WalletConnect sessions
 */
crons.daily(
  "cleanup-wallet-sessions",
  { hourUTC: 4, minuteUTC: 0 }, // 4:00 AM UTC
  internal.crons.cleanupSessions.run
);

// ============ SELF-HEALING CARDS ============

/**
 * Check for card breaches hourly
 * Triggers self-healing card reissue if breach detected
 */
crons.hourly(
  "self-healing-card-check",
  { minuteUTC: 30 }, // At :30 of every hour
  internal.crons.selfHealingCheck.run
);

// ============ CRYPTO RATES SYNC ============

/**
 * Sync crypto rates every minute
 * Updates prices from external APIs for real-time subscriptions
 */
crons.interval(
  "sync-crypto-rates",
  { minutes: 1 },
  internal.crons.syncRates.run
);

// ============ HISTORICAL PRICE SYNC ============

/**
 * Sync historical prices every 15 minutes
 * Fetches price history from CoinGecko for chart displays
 */
crons.interval(
  "sync-historical-prices",
  { minutes: 15 },
  internal.crons.syncHistoricalPrices.run
);

// ============ METRICS CLEANUP ============

/**
 * Cleanup old metrics and logs weekly
 * Removes fraud records older than retention period
 */
crons.weekly(
  "cleanup-old-metrics",
  { dayOfWeek: "sunday", hourUTC: 3, minuteUTC: 0 },
  internal.crons.cleanupMetrics.run
);

export default crons;
