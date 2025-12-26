/**
 * Velocity Checker Service
 *
 * Checks spending velocity against ZK-compressed state using Light Protocol.
 * Tracks daily, weekly, and monthly spending limits.
 */

import { Connection, PublicKey } from "@solana/web3.js";
import { createHash } from "crypto";
import type {
  VelocityState,
  VelocityCheckResult,
  VelocityDenialReason,
  VelocitySnapshot,
  VelocityLimits,
  PeriodResetConfig,
} from "../types/index.js";
import {
  DEFAULT_PERIOD_CONFIG,
  DEFAULT_VELOCITY_LIMITS,
  VELOCITY_SEEDS,
} from "../types/index.js";

/**
 * Service for checking velocity limits using Light Protocol compressed state
 */
export class VelocityChecker {
  private connection: Connection;
  private compressionEndpoint: string;
  private periodConfig: PeriodResetConfig;

  constructor(
    rpcEndpoint: string,
    compressionEndpoint?: string,
    periodConfig?: PeriodResetConfig
  ) {
    this.connection = new Connection(rpcEndpoint, "confirmed");
    this.compressionEndpoint = compressionEndpoint ?? rpcEndpoint;
    this.periodConfig = periodConfig ?? DEFAULT_PERIOD_CONFIG;
  }

  /**
   * Check if a transaction amount is within velocity limits
   */
  async check(
    userId: string,
    cardId: string,
    amountCents: number,
    limits: VelocityLimits
  ): Promise<VelocityCheckResult> {
    const startTime = Date.now();

    try {
      // Derive velocity state address
      const addressSeed = this.deriveVelocitySeed(userId, cardId);

      // Query compressed account
      const velocityState = await this.getVelocityState(addressSeed);

      // Get current slot for period calculations
      const currentSlot = await this.connection.getSlot();

      // If no state exists, this is first transaction
      if (!velocityState) {
        return this.evaluateLimits(
          {
            dailySpent: 0,
            weeklySpent: 0,
            monthlySpent: 0,
            dailyTxCount: 0,
            weeklyTxCount: 0,
            monthlyTxCount: 0,
          },
          amountCents,
          limits,
          startTime
        );
      }

      // Adjust for period resets
      const adjustedState = this.adjustForPeriodReset(
        velocityState,
        currentSlot
      );

      return this.evaluateLimits(adjustedState, amountCents, limits, startTime);
    } catch (error) {
      console.error("[VelocityChecker] Error:", error);
      return {
        withinLimits: false,
        denialReason: "VELOCITY_CHECK_ERROR",
        details: `Failed to check velocity: ${error instanceof Error ? error.message : "Unknown error"}`,
        currentState: this.createEmptySnapshot(limits),
        checkTimeMs: Date.now() - startTime,
      };
    }
  }

  /**
   * Derive the velocity state seed from userId and cardId
   */
  private deriveVelocitySeed(userId: string, cardId: string): Uint8Array {
    const combined = `${VELOCITY_SEEDS.STATE}:${userId}:${cardId}`;
    const hash = createHash("sha256").update(combined).digest();
    return new Uint8Array(hash);
  }

  /**
   * Query Light Protocol compressed account for velocity state
   */
  private async getVelocityState(
    addressSeed: Uint8Array
  ): Promise<VelocityState | null> {
    try {
      // In production, this would use Light Protocol's RPC
      // For now, we simulate the query
      const response = await fetch(
        `${this.compressionEndpoint}/compressed-accounts`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            method: "getCompressedAccountsByOwner",
            params: {
              addressSeed: Buffer.from(addressSeed).toString("hex"),
            },
          }),
        }
      );

      if (!response.ok) {
        // Account doesn't exist yet
        return null;
      }

      const data = await response.json();

      if (!data.result || data.result.length === 0) {
        return null;
      }

      // Deserialize the compressed account data
      return this.deserializeVelocityState(
        Buffer.from(data.result[0].data, "base64")
      );
    } catch {
      // If we can't reach the compression endpoint, assume no state
      return null;
    }
  }

  /**
   * Deserialize velocity state from compressed account data
   */
  private deserializeVelocityState(data: Buffer): VelocityState {
    let offset = 0;

    // userId (32 bytes)
    const userId = new Uint8Array(data.slice(offset, offset + 32));
    offset += 32;

    // cardId (32 bytes)
    const cardId = new Uint8Array(data.slice(offset, offset + 32));
    offset += 32;

    // Spending amounts (8 bytes each)
    const dailySpent = data.readBigUInt64LE(offset);
    offset += 8;
    const weeklySpent = data.readBigUInt64LE(offset);
    offset += 8;
    const monthlySpent = data.readBigUInt64LE(offset);
    offset += 8;

    // Transaction counts (4 bytes each)
    const dailyTxCount = data.readUInt32LE(offset);
    offset += 4;
    const weeklyTxCount = data.readUInt32LE(offset);
    offset += 4;
    const monthlyTxCount = data.readUInt32LE(offset);
    offset += 4;

    // Limits (8 bytes each)
    const dailyLimit = data.readBigUInt64LE(offset);
    offset += 8;
    const weeklyLimit = data.readBigUInt64LE(offset);
    offset += 8;
    const monthlyLimit = data.readBigUInt64LE(offset);
    offset += 8;
    const perTxLimit = data.readBigUInt64LE(offset);
    offset += 8;

    // Transaction count limits (4 bytes each)
    const dailyTxCountLimit = data.readUInt32LE(offset);
    offset += 4;
    const weeklyTxCountLimit = data.readUInt32LE(offset);
    offset += 4;
    const monthlyTxCountLimit = data.readUInt32LE(offset);
    offset += 4;

    // Period slots (8 bytes each)
    const currentDaySlot = data.readBigUInt64LE(offset);
    offset += 8;
    const currentWeekSlot = data.readBigUInt64LE(offset);
    offset += 8;
    const currentMonthSlot = data.readBigUInt64LE(offset);
    offset += 8;

    // State tracking
    const lastUpdateSlot = data.readBigUInt64LE(offset);
    offset += 8;
    const stateVersion = data.readUInt32LE(offset);

    return {
      userId,
      cardId,
      dailySpent,
      weeklySpent,
      monthlySpent,
      dailyTxCount,
      weeklyTxCount,
      monthlyTxCount,
      dailyLimit,
      weeklyLimit,
      monthlyLimit,
      perTxLimit,
      dailyTxCountLimit,
      weeklyTxCountLimit,
      monthlyTxCountLimit,
      currentDaySlot,
      currentWeekSlot,
      currentMonthSlot,
      lastUpdateSlot,
      stateVersion,
    };
  }

  /**
   * Adjust state for period resets
   */
  private adjustForPeriodReset(
    state: VelocityState,
    currentSlot: number
  ): {
    dailySpent: number;
    weeklySpent: number;
    monthlySpent: number;
    dailyTxCount: number;
    weeklyTxCount: number;
    monthlyTxCount: number;
  } {
    let dailySpent = Number(state.dailySpent);
    let weeklySpent = Number(state.weeklySpent);
    let monthlySpent = Number(state.monthlySpent);
    let dailyTxCount = state.dailyTxCount;
    let weeklyTxCount = state.weeklyTxCount;
    let monthlyTxCount = state.monthlyTxCount;

    const currentDaySlot = Number(state.currentDaySlot);
    const currentWeekSlot = Number(state.currentWeekSlot);
    const currentMonthSlot = Number(state.currentMonthSlot);

    // Reset if new period
    if (currentSlot - currentDaySlot >= this.periodConfig.slotsPerDay) {
      dailySpent = 0;
      dailyTxCount = 0;
    }

    if (currentSlot - currentWeekSlot >= this.periodConfig.slotsPerWeek) {
      weeklySpent = 0;
      weeklyTxCount = 0;
    }

    if (currentSlot - currentMonthSlot >= this.periodConfig.slotsPerMonth) {
      monthlySpent = 0;
      monthlyTxCount = 0;
    }

    return {
      dailySpent,
      weeklySpent,
      monthlySpent,
      dailyTxCount,
      weeklyTxCount,
      monthlyTxCount,
    };
  }

  /**
   * Evaluate if transaction is within limits
   */
  private evaluateLimits(
    state: {
      dailySpent: number;
      weeklySpent: number;
      monthlySpent: number;
      dailyTxCount: number;
      weeklyTxCount: number;
      monthlyTxCount: number;
    },
    amountCents: number,
    limits: VelocityLimits,
    startTime: number
  ): VelocityCheckResult {
    const snapshot = this.createSnapshot(state, limits);

    // Check per-transaction limit
    if (amountCents > limits.perTransaction) {
      return {
        withinLimits: false,
        denialReason: "VELOCITY_PER_TX_EXCEEDED",
        details: `Amount $${(amountCents / 100).toFixed(2)} exceeds per-transaction limit of $${(limits.perTransaction / 100).toFixed(2)}`,
        currentState: snapshot,
        checkTimeMs: Date.now() - startTime,
      };
    }

    // Check daily limit
    if (state.dailySpent + amountCents > limits.daily) {
      return {
        withinLimits: false,
        denialReason: "VELOCITY_DAILY_EXCEEDED",
        details: `Would exceed daily limit of $${(limits.daily / 100).toFixed(2)} (current: $${(state.dailySpent / 100).toFixed(2)})`,
        currentState: snapshot,
        checkTimeMs: Date.now() - startTime,
      };
    }

    // Check weekly limit
    if (state.weeklySpent + amountCents > limits.weekly) {
      return {
        withinLimits: false,
        denialReason: "VELOCITY_WEEKLY_EXCEEDED",
        details: `Would exceed weekly limit of $${(limits.weekly / 100).toFixed(2)} (current: $${(state.weeklySpent / 100).toFixed(2)})`,
        currentState: snapshot,
        checkTimeMs: Date.now() - startTime,
      };
    }

    // Check monthly limit
    if (state.monthlySpent + amountCents > limits.monthly) {
      return {
        withinLimits: false,
        denialReason: "VELOCITY_MONTHLY_EXCEEDED",
        details: `Would exceed monthly limit of $${(limits.monthly / 100).toFixed(2)} (current: $${(state.monthlySpent / 100).toFixed(2)})`,
        currentState: snapshot,
        checkTimeMs: Date.now() - startTime,
      };
    }

    // Check transaction counts if limits are set
    if (
      limits.dailyTxCount &&
      state.dailyTxCount + 1 > limits.dailyTxCount
    ) {
      return {
        withinLimits: false,
        denialReason: "VELOCITY_DAILY_TX_COUNT_EXCEEDED",
        details: `Would exceed daily transaction count limit of ${limits.dailyTxCount}`,
        currentState: snapshot,
        checkTimeMs: Date.now() - startTime,
      };
    }

    if (
      limits.weeklyTxCount &&
      state.weeklyTxCount + 1 > limits.weeklyTxCount
    ) {
      return {
        withinLimits: false,
        denialReason: "VELOCITY_WEEKLY_TX_COUNT_EXCEEDED",
        details: `Would exceed weekly transaction count limit of ${limits.weeklyTxCount}`,
        currentState: snapshot,
        checkTimeMs: Date.now() - startTime,
      };
    }

    if (
      limits.monthlyTxCount &&
      state.monthlyTxCount + 1 > limits.monthlyTxCount
    ) {
      return {
        withinLimits: false,
        denialReason: "VELOCITY_MONTHLY_TX_COUNT_EXCEEDED",
        details: `Would exceed monthly transaction count limit of ${limits.monthlyTxCount}`,
        currentState: snapshot,
        checkTimeMs: Date.now() - startTime,
      };
    }

    // All checks passed
    return {
      withinLimits: true,
      currentState: snapshot,
      checkTimeMs: Date.now() - startTime,
    };
  }

  /**
   * Create a velocity snapshot
   */
  private createSnapshot(
    state: {
      dailySpent: number;
      weeklySpent: number;
      monthlySpent: number;
      dailyTxCount: number;
      weeklyTxCount: number;
      monthlyTxCount: number;
    },
    limits: VelocityLimits
  ): VelocitySnapshot {
    return {
      dailySpent: state.dailySpent,
      dailyLimit: limits.daily,
      dailyRemaining: Math.max(0, limits.daily - state.dailySpent),
      dailyPercentUsed: Math.round((state.dailySpent / limits.daily) * 100),

      weeklySpent: state.weeklySpent,
      weeklyLimit: limits.weekly,
      weeklyRemaining: Math.max(0, limits.weekly - state.weeklySpent),
      weeklyPercentUsed: Math.round((state.weeklySpent / limits.weekly) * 100),

      monthlySpent: state.monthlySpent,
      monthlyLimit: limits.monthly,
      monthlyRemaining: Math.max(0, limits.monthly - state.monthlySpent),
      monthlyPercentUsed: Math.round(
        (state.monthlySpent / limits.monthly) * 100
      ),

      dailyTxCount: state.dailyTxCount,
      weeklyTxCount: state.weeklyTxCount,
      monthlyTxCount: state.monthlyTxCount,
    };
  }

  /**
   * Create an empty snapshot for error cases
   */
  private createEmptySnapshot(limits: VelocityLimits): VelocitySnapshot {
    return {
      dailySpent: 0,
      dailyLimit: limits.daily,
      dailyRemaining: limits.daily,
      dailyPercentUsed: 0,

      weeklySpent: 0,
      weeklyLimit: limits.weekly,
      weeklyRemaining: limits.weekly,
      weeklyPercentUsed: 0,

      monthlySpent: 0,
      monthlyLimit: limits.monthly,
      monthlyRemaining: limits.monthly,
      monthlyPercentUsed: 0,

      dailyTxCount: 0,
      weeklyTxCount: 0,
      monthlyTxCount: 0,
    };
  }

  /**
   * Get default limits for a tier
   */
  static getDefaultLimits(
    tier: "conservative" | "standard" | "premium" | "institutional"
  ): VelocityLimits {
    const defaults = DEFAULT_VELOCITY_LIMITS[tier];
    return {
      perTransaction: defaults.perTransaction,
      daily: defaults.daily,
      weekly: defaults.weekly,
      monthly: defaults.monthly,
      dailyTxCount: defaults.dailyTxCount,
      weeklyTxCount: defaults.weeklyTxCount,
      monthlyTxCount: defaults.monthlyTxCount,
    };
  }
}
