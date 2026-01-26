/**
 * Marinade Finance Protocol Adapter
 *
 * Integration with Marinade for liquid staking (SOL -> mSOL).
 * Marinade is a non-custodial liquid staking protocol on Solana.
 */

import type { YieldPosition, YieldOpportunity } from '../../../types/goal.js';
import type {
  ProtocolAdapter,
  DepositResult,
  WithdrawResult,
  HarvestableReward,
  HarvestResult,
  CompoundResult,
} from './index.js';

// ============================================================================
// Configuration
// ============================================================================

export interface MarinadeAdapterConfig {
  /** Marinade program ID */
  programId: string;
  /** mSOL token mint */
  msolMint: string;
  /** Marinade API endpoint */
  apiUrl: string;
  /** Request timeout in milliseconds */
  requestTimeoutMs: number;
}

const DEFAULT_CONFIG: MarinadeAdapterConfig = {
  programId: 'MarBmsSgKXdrN1egZf5sqe1TMai9K1rChYNDJgjq7aD',
  msolMint: 'mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So',
  apiUrl: 'https://api.marinade.finance',
  requestTimeoutMs: 30000,
};

// ============================================================================
// Types
// ============================================================================

interface MarinadeStats {
  tvl: number;
  apy: number;
  msolPrice: number;
  validators: number;
  epochsRemaining: number;
}

interface MarinadePosition {
  owner: string;
  msolBalance: number;
  solValue: number;
  rewards: number;
  stakingStartedAt: number;
}

// ============================================================================
// Marinade Adapter
// ============================================================================

export class MarinadeAdapter implements ProtocolAdapter {
  readonly protocolId = 'marinade';
  readonly name = 'Marinade Finance';
  readonly productType = 'staking' as const;
  enabled = true;

  private config: MarinadeAdapterConfig;
  private stats: MarinadeStats | null = null;
  private lastStatsUpdate: number = 0;
  private statsUpdateIntervalMs = 60000; // 1 minute

  // Callbacks for actual transaction execution
  private executeStake?: (
    amount: number,
    walletAddress: string
  ) => Promise<{ signature: string; msolReceived: number }>;

  private executeUnstake?: (
    msolAmount: number,
    walletAddress: string,
    immediate: boolean
  ) => Promise<{ signature: string; solReceived: number }>;

  private getMsolBalance?: (walletAddress: string) => Promise<number>;

  constructor(config: Partial<MarinadeAdapterConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  // ==========================================================================
  // Lifecycle
  // ==========================================================================

  async initialize(): Promise<void> {
    console.log('[MarinadeAdapter] Initializing...');
    await this.refreshStats();
    console.log('[MarinadeAdapter] Initialized successfully');
  }

  async shutdown(): Promise<void> {
    console.log('[MarinadeAdapter] Shutting down...');
    this.stats = null;
  }

  // ==========================================================================
  // Discovery
  // ==========================================================================

  async getOpportunities(): Promise<YieldOpportunity[]> {
    await this.ensureStats();

    const apy = this.stats?.apy || 0;

    return [
      {
        protocolId: this.protocolId,
        productId: 'msol-staking',
        productName: 'mSOL Liquid Staking',
        currentAPY: apy,
        avgAPY7d: apy, // Would track historical in production
        avgAPY30d: apy, // Would track historical in production
        depositTokens: ['SOL'],
        tvl: this.stats?.tvl || 0,
        riskScore: 2, // Low risk (1-10 scale)
        recommended: true,
        reason: 'Marinade is the largest liquid staking protocol on Solana with strong track record',
      },
    ];
  }

  async getCurrentAPY(productId?: string): Promise<number> {
    await this.ensureStats();
    return this.stats?.apy || 0;
  }

  // ==========================================================================
  // Position Management
  // ==========================================================================

  async deposit(
    amount: number,
    token: string,
    walletAddress: string,
    productId?: string
  ): Promise<DepositResult> {
    if (token.toUpperCase() !== 'SOL') {
      return {
        success: false,
        amountDeposited: 0,
        error: 'Marinade only accepts SOL deposits',
      };
    }

    if (amount < 0.001) {
      return {
        success: false,
        amountDeposited: 0,
        error: 'Minimum deposit is 0.001 SOL',
      };
    }

    try {
      if (this.executeStake) {
        const result = await this.executeStake(amount, walletAddress);

        return {
          success: true,
          positionId: `marinade:${walletAddress}`,
          transactionSignature: result.signature,
          amountDeposited: amount,
          tokenReceived: 'mSOL',
          tokenReceivedAmount: result.msolReceived,
        };
      }

      // Simulation mode
      await this.ensureStats();
      const msolPrice = this.stats?.msolPrice || 1.05;
      const msolReceived = amount / msolPrice;

      console.log(
        `[MarinadeAdapter] Simulation: Would stake ${amount} SOL -> ${msolReceived.toFixed(6)} mSOL`
      );

      return {
        success: true,
        positionId: `marinade:${walletAddress}`,
        transactionSignature: `sim_stake_${Date.now()}`,
        amountDeposited: amount,
        tokenReceived: 'mSOL',
        tokenReceivedAmount: msolReceived,
      };
    } catch (error) {
      return {
        success: false,
        amountDeposited: 0,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  async withdraw(
    positionId: string,
    amount: number | 'all',
    walletAddress: string
  ): Promise<WithdrawResult> {
    try {
      // Get current mSOL balance
      let msolBalance: number;
      if (this.getMsolBalance) {
        msolBalance = await this.getMsolBalance(walletAddress);
      } else {
        // Simulation - assume some balance
        msolBalance = 10;
      }

      const msolAmount = amount === 'all' ? msolBalance : amount;

      if (msolAmount > msolBalance) {
        return {
          success: false,
          amountWithdrawn: 0,
          tokenReceived: 'SOL',
          error: `Insufficient mSOL balance: ${msolBalance}`,
        };
      }

      if (this.executeUnstake) {
        // Use delayed unstake for better rate (vs immediate unstake)
        const result = await this.executeUnstake(msolAmount, walletAddress, false);

        return {
          success: true,
          transactionSignature: result.signature,
          amountWithdrawn: result.solReceived,
          tokenReceived: 'SOL',
        };
      }

      // Simulation mode
      await this.ensureStats();
      const msolPrice = this.stats?.msolPrice || 1.05;
      const solReceived = msolAmount * msolPrice;

      console.log(
        `[MarinadeAdapter] Simulation: Would unstake ${msolAmount} mSOL -> ${solReceived.toFixed(6)} SOL`
      );

      return {
        success: true,
        transactionSignature: `sim_unstake_${Date.now()}`,
        amountWithdrawn: solReceived,
        tokenReceived: 'SOL',
      };
    } catch (error) {
      return {
        success: false,
        amountWithdrawn: 0,
        tokenReceived: 'SOL',
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  // ==========================================================================
  // Harvesting
  // ==========================================================================

  async getHarvestableRewards(positionId: string): Promise<HarvestableReward> {
    // Marinade's rewards are automatically compounded into mSOL value
    // There are no separate rewards to harvest - the mSOL/SOL ratio increases over time
    return {
      positionId,
      rewards: [],
      totalValueUsd: 0,
    };
  }

  async harvest(positionId: string, walletAddress: string): Promise<HarvestResult> {
    // Marinade auto-compounds - no manual harvest needed
    return {
      success: true,
      rewards: [],
      totalValueUsd: 0,
    };
  }

  async compound(positionId: string, walletAddress: string): Promise<CompoundResult> {
    // Marinade auto-compounds - no manual compound needed
    const position = await this.getPosition(positionId);

    return {
      success: true,
      amountCompounded: 0,
      newPositionValue: position?.currentValue || 0,
    };
  }

  // ==========================================================================
  // Queries
  // ==========================================================================

  async getPosition(positionId: string): Promise<YieldPosition | null> {
    const walletAddress = positionId.replace('marinade:', '');

    let msolBalance: number;
    if (this.getMsolBalance) {
      msolBalance = await this.getMsolBalance(walletAddress);
    } else {
      // Simulation - return mock position
      msolBalance = 10;
    }

    if (msolBalance === 0) {
      return null;
    }

    await this.ensureStats();
    const msolPrice = this.stats?.msolPrice || 1.05;
    const solValue = msolBalance * msolPrice;

    // Calculate yield earned based on mSOL appreciation
    // Original SOL deposited = msolBalance (1:1 at deposit time in simplified model)
    const originalSolDeposited = msolBalance;
    const yieldEarned = solValue - originalSolDeposited;

    return {
      positionId,
      strategyId: '', // Will be set by caller
      protocolId: this.protocolId,
      productId: 'msol-staking',
      depositAmount: originalSolDeposited,
      currentValue: solValue,
      depositToken: 'SOL',
      receiptToken: 'mSOL',
      currentAPY: this.stats?.apy || 0,
      totalYieldEarned: yieldEarned,
      totalYieldHarvested: 0, // Auto-compounded, no manual harvest
      pendingYield: 0, // Auto-compounded into position
      openedAt: Date.now() - 86400000, // Placeholder
      status: 'active',
    };
  }

  async getPositions(walletAddress: string): Promise<YieldPosition[]> {
    const position = await this.getPosition(`marinade:${walletAddress}`);
    return position ? [position] : [];
  }

  async getTVL(): Promise<number> {
    await this.ensureStats();
    return this.stats?.tvl || 0;
  }

  // ==========================================================================
  // Stats
  // ==========================================================================

  private async ensureStats(): Promise<void> {
    const now = Date.now();
    if (!this.stats || now - this.lastStatsUpdate > this.statsUpdateIntervalMs) {
      await this.refreshStats();
    }
  }

  private async refreshStats(): Promise<void> {
    try {
      // In production, fetch from Marinade API
      // For now, use reasonable defaults
      this.stats = {
        tvl: 8_500_000_000, // ~8.5B TVL
        apy: 7.2, // ~7.2% APY
        msolPrice: 1.052, // mSOL is worth more than SOL due to rewards
        validators: 450,
        epochsRemaining: 1.5,
      };

      this.lastStatsUpdate = Date.now();
      console.log(
        `[MarinadeAdapter] Stats updated: APY=${this.stats.apy}%, TVL=$${(this.stats.tvl / 1e9).toFixed(2)}B`
      );
    } catch (error) {
      console.error('[MarinadeAdapter] Failed to refresh stats:', error);
    }
  }

  // ==========================================================================
  // Callbacks
  // ==========================================================================

  setExecuteStake(
    callback: (
      amount: number,
      walletAddress: string
    ) => Promise<{ signature: string; msolReceived: number }>
  ): void {
    this.executeStake = callback;
  }

  setExecuteUnstake(
    callback: (
      msolAmount: number,
      walletAddress: string,
      immediate: boolean
    ) => Promise<{ signature: string; solReceived: number }>
  ): void {
    this.executeUnstake = callback;
  }

  setGetMsolBalance(callback: (walletAddress: string) => Promise<number>): void {
    this.getMsolBalance = callback;
  }
}

// ============================================================================
// Singleton
// ============================================================================

let marinadeAdapterInstance: MarinadeAdapter | null = null;

export function getMarinadeAdapter(config?: Partial<MarinadeAdapterConfig>): MarinadeAdapter {
  if (!marinadeAdapterInstance) {
    marinadeAdapterInstance = new MarinadeAdapter(config);
  }
  return marinadeAdapterInstance;
}

export function resetMarinadeAdapter(): void {
  marinadeAdapterInstance = null;
}
