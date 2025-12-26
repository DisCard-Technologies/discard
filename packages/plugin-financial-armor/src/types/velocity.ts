/**
 * Velocity State Types
 *
 * Types for ZK-compressed velocity tracking using Light Protocol.
 * Tracks spending limits and transaction counts per time period.
 */

import type { PublicKey } from "@solana/web3.js";

/**
 * Velocity state stored in ZK-compressed PDA
 */
export interface VelocityState {
  /** User identifier hash (32 bytes) */
  userId: Uint8Array;
  /** Card context hash (32 bytes) */
  cardId: Uint8Array;

  /** Current period spending in cents */
  dailySpent: bigint;
  weeklySpent: bigint;
  monthlySpent: bigint;

  /** Transaction counts */
  dailyTxCount: number;
  weeklyTxCount: number;
  monthlyTxCount: number;

  /** User-configured limits in cents */
  dailyLimit: bigint;
  weeklyLimit: bigint;
  monthlyLimit: bigint;
  perTxLimit: bigint;

  /** Transaction count limits */
  dailyTxCountLimit: number;
  weeklyTxCountLimit: number;
  monthlyTxCountLimit: number;

  /** Period boundaries (slot numbers) */
  currentDaySlot: bigint;
  currentWeekSlot: bigint;
  currentMonthSlot: bigint;

  /** State tracking */
  lastUpdateSlot: bigint;
  stateVersion: number;
}

/**
 * Result of velocity check
 */
export interface VelocityCheckResult {
  /** Whether transaction is within all limits */
  withinLimits: boolean;
  /** Specific denial reason if exceeded */
  denialReason?: VelocityDenialReason;
  /** Human-readable details */
  details?: string;
  /** Current state snapshot */
  currentState: VelocitySnapshot;
  /** Time taken to check (ms) */
  checkTimeMs: number;
}

/**
 * Velocity denial reasons
 */
export type VelocityDenialReason =
  | "VELOCITY_DAILY_EXCEEDED"
  | "VELOCITY_WEEKLY_EXCEEDED"
  | "VELOCITY_MONTHLY_EXCEEDED"
  | "VELOCITY_PER_TX_EXCEEDED"
  | "VELOCITY_DAILY_TX_COUNT_EXCEEDED"
  | "VELOCITY_WEEKLY_TX_COUNT_EXCEEDED"
  | "VELOCITY_MONTHLY_TX_COUNT_EXCEEDED"
  | "VELOCITY_CHECK_ERROR";

/**
 * Snapshot of current velocity state
 */
export interface VelocitySnapshot {
  dailySpent: number;
  dailyLimit: number;
  dailyRemaining: number;
  dailyPercentUsed: number;

  weeklySpent: number;
  weeklyLimit: number;
  weeklyRemaining: number;
  weeklyPercentUsed: number;

  monthlySpent: number;
  monthlyLimit: number;
  monthlyRemaining: number;
  monthlyPercentUsed: number;

  dailyTxCount: number;
  weeklyTxCount: number;
  monthlyTxCount: number;
}

/**
 * Request to update velocity state after transaction
 */
export interface VelocityUpdateRequest {
  userId: string;
  cardId: string;
  amount: number;
  transactionId: string;
  timestamp: number;
}

/**
 * Result of velocity state update
 */
export interface VelocityUpdateResult {
  success: boolean;
  newState: VelocitySnapshot;
  signature?: string;
  error?: string;
}

/**
 * Compressed account data for velocity state
 */
export interface CompressedVelocityAccount {
  address: PublicKey;
  owner: PublicKey;
  lamports: number;
  data: Uint8Array;
  dataHash: string;
  leafIndex: number;
  merkleTree: PublicKey;
}

/**
 * Period reset configuration
 */
export interface PeriodResetConfig {
  /** Slots per day (~400ms per slot) */
  slotsPerDay: number;
  /** Slots per week */
  slotsPerWeek: number;
  /** Slots per month (30 days) */
  slotsPerMonth: number;
}

/**
 * Default period configuration for Solana
 * Based on ~400ms slot time
 */
export const DEFAULT_PERIOD_CONFIG: PeriodResetConfig = {
  slotsPerDay: 216000, // 24 * 60 * 60 / 0.4
  slotsPerWeek: 1512000, // 7 * 216000
  slotsPerMonth: 6480000, // 30 * 216000
};

/**
 * Default velocity limits (in cents)
 */
export const DEFAULT_VELOCITY_LIMITS = {
  /** Conservative tier */
  conservative: {
    perTransaction: 10000, // $100
    daily: 50000, // $500
    weekly: 150000, // $1,500
    monthly: 500000, // $5,000
    dailyTxCount: 10,
    weeklyTxCount: 50,
    monthlyTxCount: 200,
  },
  /** Standard tier */
  standard: {
    perTransaction: 100000, // $1,000
    daily: 500000, // $5,000
    weekly: 1500000, // $15,000
    monthly: 5000000, // $50,000
    dailyTxCount: 25,
    weeklyTxCount: 100,
    monthlyTxCount: 400,
  },
  /** Premium tier */
  premium: {
    perTransaction: 500000, // $5,000
    daily: 2500000, // $25,000
    weekly: 10000000, // $100,000
    monthly: 25000000, // $250,000
    dailyTxCount: 50,
    weeklyTxCount: 250,
    monthlyTxCount: 1000,
  },
  /** Institutional tier */
  institutional: {
    perTransaction: 5000000000, // $50M
    daily: 5000000000, // $50M
    weekly: 200000000000, // $2B
    monthly: 500000000000, // $5B
    dailyTxCount: 1000,
    weeklyTxCount: 5000,
    monthlyTxCount: 20000,
  },
} as const;

/**
 * PDA derivation seeds for velocity state
 */
export const VELOCITY_SEEDS = {
  STATE: "velocity",
} as const;
