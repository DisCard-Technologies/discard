/**
 * Kamino Finance Protocol Adapter
 *
 * Integration with Kamino for lending and concentrated liquidity.
 * Kamino offers lending vaults, multiply strategies, and LP management.
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

export interface KaminoAdapterConfig {
  /** Kamino API endpoint */
  apiUrl: string;
  /** Request timeout in milliseconds */
  requestTimeoutMs: number;
}

const DEFAULT_CONFIG: KaminoAdapterConfig = {
  apiUrl: 'https://api.kamino.finance',
  requestTimeoutMs: 30000,
};

// ============================================================================
// Types
// ============================================================================

interface KaminoMarket {
  marketId: string;
  name: string;
  token: string;
  tokenMint: string;
  supplyApy: number;
  borrowApy: number;
  totalSupply: number;
  totalBorrow: number;
  utilization: number;
  ltv: number;
}

interface KaminoVault {
  vaultId: string;
  name: string;
  strategy: string;
  tokens: string[];
  apy: number;
  tvl: number;
  risk: 'low' | 'medium' | 'high';
}

interface KaminoPosition {
  positionId: string;
  type: 'lending' | 'vault';
  marketId?: string;
  vaultId?: string;
  walletAddress: string;
  depositedAmount: number;
  depositToken: string;
  currentValue: number;
  rewards: number;
  rewardsToken: string;
  createdAt: number;
}

// ============================================================================
// Kamino Adapter
// ============================================================================

export class KaminoAdapter implements ProtocolAdapter {
  readonly protocolId = 'kamino';
  readonly name = 'Kamino Finance';
  readonly productType = 'lending' as const;
  enabled = true;

  private config: KaminoAdapterConfig;
  private markets: KaminoMarket[] = [];
  private vaults: KaminoVault[] = [];
  private lastUpdate: number = 0;
  private updateIntervalMs = 60000; // 1 minute

  // Callbacks for transaction execution
  private executeDeposit?: (
    marketId: string,
    amount: number,
    token: string,
    walletAddress: string
  ) => Promise<{ signature: string; sharesReceived: number }>;

  private executeWithdraw?: (
    positionId: string,
    shares: number | 'all',
    walletAddress: string
  ) => Promise<{ signature: string; amountReceived: number }>;

  private executeClaimRewards?: (
    positionId: string,
    walletAddress: string
  ) => Promise<{ signature: string; rewards: Array<{ token: string; amount: number }> }>;

  private getPositionData?: (
    walletAddress: string
  ) => Promise<KaminoPosition[]>;

  constructor(config: Partial<KaminoAdapterConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  // ==========================================================================
  // Lifecycle
  // ==========================================================================

  async initialize(): Promise<void> {
    console.log('[KaminoAdapter] Initializing...');
    await this.refreshData();
    console.log('[KaminoAdapter] Initialized successfully');
  }

  async shutdown(): Promise<void> {
    console.log('[KaminoAdapter] Shutting down...');
    this.markets = [];
    this.vaults = [];
  }

  // ==========================================================================
  // Discovery
  // ==========================================================================

  async getOpportunities(): Promise<YieldOpportunity[]> {
    await this.ensureData();

    const opportunities: YieldOpportunity[] = [];

    // Add lending markets
    for (const market of this.markets) {
      // Calculate risk score (1-10): higher utilization = higher risk
      const riskScore = market.utilization > 0.8 ? 5 : market.utilization > 0.6 ? 3 : 2;

      opportunities.push({
        protocolId: this.protocolId,
        productId: `lending:${market.marketId}`,
        productName: `${market.name} Lending`,
        currentAPY: market.supplyApy,
        avgAPY7d: market.supplyApy, // Would track historical in production
        avgAPY30d: market.supplyApy, // Would track historical in production
        depositTokens: [market.token],
        tvl: market.totalSupply,
        riskScore,
        recommended: market.supplyApy > 8 && market.utilization < 0.85,
        reason: market.utilization < 0.85
          ? `Strong lending yield with healthy utilization (${(market.utilization * 100).toFixed(0)}%)`
          : `High utilization may affect withdrawal availability`,
      });
    }

    // Add vaults
    for (const vault of this.vaults) {
      // Map risk level to score
      const riskScore = vault.risk === 'high' ? 8 : vault.risk === 'medium' ? 5 : 3;

      opportunities.push({
        protocolId: this.protocolId,
        productId: `vault:${vault.vaultId}`,
        productName: vault.name,
        currentAPY: vault.apy,
        avgAPY7d: vault.apy,
        avgAPY30d: vault.apy,
        depositTokens: vault.tokens,
        tvl: vault.tvl,
        riskScore,
        recommended: vault.apy > 10 && vault.risk !== 'high',
        reason: `${vault.strategy} strategy with ${vault.risk} risk profile`,
      });
    }

    return opportunities;
  }

  async getCurrentAPY(productId?: string): Promise<number> {
    await this.ensureData();

    if (!productId) {
      // Return average lending APY
      if (this.markets.length === 0) return 0;
      const totalApy = this.markets.reduce((sum, m) => sum + m.supplyApy, 0);
      return totalApy / this.markets.length;
    }

    if (productId.startsWith('lending:')) {
      const marketId = productId.replace('lending:', '');
      const market = this.markets.find((m) => m.marketId === marketId);
      return market?.supplyApy || 0;
    }

    if (productId.startsWith('vault:')) {
      const vaultId = productId.replace('vault:', '');
      const vault = this.vaults.find((v) => v.vaultId === vaultId);
      return vault?.apy || 0;
    }

    return 0;
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
    try {
      // Find the appropriate market
      const market = this.markets.find(
        (m) => m.token.toUpperCase() === token.toUpperCase()
      );

      if (!market) {
        return {
          success: false,
          amountDeposited: 0,
          error: `No lending market found for ${token}`,
        };
      }

      if (this.executeDeposit) {
        const result = await this.executeDeposit(
          market.marketId,
          amount,
          token,
          walletAddress
        );

        return {
          success: true,
          positionId: `kamino:${market.marketId}:${walletAddress}`,
          transactionSignature: result.signature,
          amountDeposited: amount,
          tokenReceived: `k${token}`,
          tokenReceivedAmount: result.sharesReceived,
        };
      }

      // Simulation mode
      console.log(
        `[KaminoAdapter] Simulation: Would deposit ${amount} ${token} to ${market.name}`
      );

      return {
        success: true,
        positionId: `kamino:${market.marketId}:${walletAddress}`,
        transactionSignature: `sim_deposit_${Date.now()}`,
        amountDeposited: amount,
        tokenReceived: `k${token}`,
        tokenReceivedAmount: amount, // 1:1 for simplicity
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
      if (this.executeWithdraw) {
        const result = await this.executeWithdraw(positionId, amount, walletAddress);

        const parts = positionId.split(':');
        const marketId = parts[1];
        const market = this.markets.find((m) => m.marketId === marketId);

        return {
          success: true,
          transactionSignature: result.signature,
          amountWithdrawn: result.amountReceived,
          tokenReceived: market?.token || 'UNKNOWN',
        };
      }

      // Simulation mode
      const withdrawAmount = amount === 'all' ? 100 : amount;
      const parts = positionId.split(':');
      const marketId = parts[1];
      const market = this.markets.find((m) => m.marketId === marketId);

      console.log(
        `[KaminoAdapter] Simulation: Would withdraw ${withdrawAmount} from ${market?.name || marketId}`
      );

      return {
        success: true,
        transactionSignature: `sim_withdraw_${Date.now()}`,
        amountWithdrawn: withdrawAmount,
        tokenReceived: market?.token || 'USDC',
      };
    } catch (error) {
      return {
        success: false,
        amountWithdrawn: 0,
        tokenReceived: 'UNKNOWN',
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  // ==========================================================================
  // Harvesting
  // ==========================================================================

  async getHarvestableRewards(positionId: string): Promise<HarvestableReward> {
    // In production, query the protocol for pending rewards
    // Kamino may have KMNO token rewards or other incentives

    return {
      positionId,
      rewards: [
        {
          token: 'KMNO',
          amount: 10,
          valueUsd: 5, // Mock value
        },
      ],
      totalValueUsd: 5,
      lastHarvestAt: Date.now() - 86400000, // 1 day ago
    };
  }

  async harvest(positionId: string, walletAddress: string): Promise<HarvestResult> {
    try {
      if (this.executeClaimRewards) {
        const result = await this.executeClaimRewards(positionId, walletAddress);

        const totalValueUsd = result.rewards.reduce((sum, r) => sum + r.amount, 0); // Simplified

        return {
          success: true,
          transactionSignature: result.signature,
          rewards: result.rewards,
          totalValueUsd,
        };
      }

      // Simulation mode
      console.log(`[KaminoAdapter] Simulation: Would harvest rewards for ${positionId}`);

      return {
        success: true,
        transactionSignature: `sim_harvest_${Date.now()}`,
        rewards: [{ token: 'KMNO', amount: 10 }],
        totalValueUsd: 5,
      };
    } catch (error) {
      return {
        success: false,
        rewards: [],
        totalValueUsd: 0,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  async compound(positionId: string, walletAddress: string): Promise<CompoundResult> {
    try {
      // For Kamino, compounding means:
      // 1. Harvest any KMNO rewards
      // 2. Swap KMNO for the deposit token
      // 3. Redeposit

      const harvestResult = await this.harvest(positionId, walletAddress);

      if (!harvestResult.success) {
        return {
          success: false,
          amountCompounded: 0,
          newPositionValue: 0,
          error: harvestResult.error,
        };
      }

      // In production, would execute swap and redeposit
      console.log(
        `[KaminoAdapter] Simulation: Would compound ${harvestResult.totalValueUsd} USD of rewards`
      );

      const position = await this.getPosition(positionId);

      return {
        success: true,
        transactionSignature: `sim_compound_${Date.now()}`,
        amountCompounded: harvestResult.totalValueUsd,
        newPositionValue: (position?.currentValue || 0) + harvestResult.totalValueUsd,
      };
    } catch (error) {
      return {
        success: false,
        amountCompounded: 0,
        newPositionValue: 0,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  // ==========================================================================
  // Queries
  // ==========================================================================

  async getPosition(positionId: string): Promise<YieldPosition | null> {
    const parts = positionId.split(':');
    if (parts.length < 3) return null;

    const [protocol, marketId, _walletAddress] = parts;
    if (protocol !== 'kamino') return null;

    // In production, fetch from chain
    if (this.getPositionData) {
      const positions = await this.getPositionData(_walletAddress);
      const position = positions.find(
        (p) => p.marketId === marketId || p.vaultId === marketId
      );

      if (!position) return null;

      const market = this.markets.find((m) => m.marketId === marketId);
      const yieldEarned = position.currentValue - position.depositedAmount;

      return {
        positionId,
        strategyId: '', // Will be set by caller
        protocolId: this.protocolId,
        productId: position.type === 'vault' ? `vault:${marketId}` : `lending:${marketId}`,
        depositAmount: position.depositedAmount,
        currentValue: position.currentValue,
        depositToken: position.depositToken,
        receiptToken: `k${position.depositToken}`,
        currentAPY: market?.supplyApy || 0,
        totalYieldEarned: yieldEarned > 0 ? yieldEarned : 0,
        totalYieldHarvested: 0, // Track when harvesting implemented
        pendingYield: position.rewards,
        openedAt: position.createdAt,
        status: 'active',
      };
    }

    // Simulation mode - return mock position
    const market = this.markets.find((m) => m.marketId === marketId);
    const depositAmount = 100;
    const currentValue = 105;
    const yieldEarned = currentValue - depositAmount;

    return {
      positionId,
      strategyId: '', // Will be set by caller
      protocolId: this.protocolId,
      productId: `lending:${marketId}`,
      depositAmount,
      currentValue,
      depositToken: market?.token || 'USDC',
      receiptToken: `k${market?.token || 'USDC'}`,
      currentAPY: market?.supplyApy || 12,
      totalYieldEarned: yieldEarned,
      totalYieldHarvested: 0,
      pendingYield: 5,
      openedAt: Date.now() - 86400000 * 30, // 30 days ago
      status: 'active',
    };
  }

  async getPositions(walletAddress: string): Promise<YieldPosition[]> {
    if (this.getPositionData) {
      const rawPositions = await this.getPositionData(walletAddress);
      const positions: YieldPosition[] = [];

      for (const raw of rawPositions) {
        const marketId = raw.marketId || raw.vaultId || 'unknown';
        const position = await this.getPosition(`kamino:${marketId}:${walletAddress}`);
        if (position) {
          positions.push(position);
        }
      }

      return positions;
    }

    // Simulation - return empty or mock
    return [];
  }

  async getTVL(): Promise<number> {
    await this.ensureData();

    const marketTvl = this.markets.reduce((sum, m) => sum + m.totalSupply, 0);
    const vaultTvl = this.vaults.reduce((sum, v) => sum + v.tvl, 0);

    return marketTvl + vaultTvl;
  }

  // ==========================================================================
  // Data Management
  // ==========================================================================

  private async ensureData(): Promise<void> {
    const now = Date.now();
    if (this.markets.length === 0 || now - this.lastUpdate > this.updateIntervalMs) {
      await this.refreshData();
    }
  }

  private async refreshData(): Promise<void> {
    try {
      // In production, fetch from Kamino API
      // For now, use mock data representing typical Kamino markets

      this.markets = [
        {
          marketId: 'usdc-main',
          name: 'USDC',
          token: 'USDC',
          tokenMint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
          supplyApy: 12.5,
          borrowApy: 15.8,
          totalSupply: 150_000_000,
          totalBorrow: 120_000_000,
          utilization: 0.8,
          ltv: 0.85,
        },
        {
          marketId: 'usdt-main',
          name: 'USDT',
          token: 'USDT',
          tokenMint: 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB',
          supplyApy: 11.2,
          borrowApy: 14.5,
          totalSupply: 80_000_000,
          totalBorrow: 60_000_000,
          utilization: 0.75,
          ltv: 0.85,
        },
        {
          marketId: 'sol-main',
          name: 'SOL',
          token: 'SOL',
          tokenMint: 'So11111111111111111111111111111111111111112',
          supplyApy: 5.8,
          borrowApy: 8.2,
          totalSupply: 500_000,
          totalBorrow: 200_000,
          utilization: 0.4,
          ltv: 0.75,
        },
      ];

      this.vaults = [
        {
          vaultId: 'sol-usdc-clmm',
          name: 'SOL-USDC CLMM',
          strategy: 'Concentrated Liquidity',
          tokens: ['SOL', 'USDC'],
          apy: 25.5,
          tvl: 50_000_000,
          risk: 'medium',
        },
        {
          vaultId: 'jitosol-sol',
          name: 'JitoSOL-SOL LP',
          strategy: 'Stable Pool',
          tokens: ['JITOSOL', 'SOL'],
          apy: 8.2,
          tvl: 30_000_000,
          risk: 'low',
        },
      ];

      this.lastUpdate = Date.now();
      console.log(
        `[KaminoAdapter] Data refreshed: ${this.markets.length} markets, ${this.vaults.length} vaults`
      );
    } catch (error) {
      console.error('[KaminoAdapter] Failed to refresh data:', error);
    }
  }

  // ==========================================================================
  // Callbacks
  // ==========================================================================

  setExecuteDeposit(
    callback: (
      marketId: string,
      amount: number,
      token: string,
      walletAddress: string
    ) => Promise<{ signature: string; sharesReceived: number }>
  ): void {
    this.executeDeposit = callback;
  }

  setExecuteWithdraw(
    callback: (
      positionId: string,
      shares: number | 'all',
      walletAddress: string
    ) => Promise<{ signature: string; amountReceived: number }>
  ): void {
    this.executeWithdraw = callback;
  }

  setExecuteClaimRewards(
    callback: (
      positionId: string,
      walletAddress: string
    ) => Promise<{ signature: string; rewards: Array<{ token: string; amount: number }> }>
  ): void {
    this.executeClaimRewards = callback;
  }

  setGetPositionData(
    callback: (walletAddress: string) => Promise<KaminoPosition[]>
  ): void {
    this.getPositionData = callback;
  }
}

// ============================================================================
// Singleton
// ============================================================================

let kaminoAdapterInstance: KaminoAdapter | null = null;

export function getKaminoAdapter(config?: Partial<KaminoAdapterConfig>): KaminoAdapter {
  if (!kaminoAdapterInstance) {
    kaminoAdapterInstance = new KaminoAdapter(config);
  }
  return kaminoAdapterInstance;
}

export function resetKaminoAdapter(): void {
  kaminoAdapterInstance = null;
}
