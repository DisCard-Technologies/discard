/**
 * Yield Optimizer
 *
 * Analyzes yield opportunities across protocols and determines
 * optimal allocations based on risk tolerance, APY, and diversification.
 */

import type { YieldOpportunity, YieldPosition, RiskTolerance } from '../../types/goal.js';
import { getProtocolRegistry } from './protocols/index.js';

// ============================================================================
// Configuration
// ============================================================================

export interface YieldOptimizerConfig {
  /** Minimum APY to consider (percentage) */
  minAPY: number;
  /** Maximum exposure to a single protocol (percentage) */
  maxProtocolExposure: number;
  /** Maximum exposure to a single position (percentage) */
  maxPositionExposure: number;
  /** Rebalance threshold - rebalance if allocation drifts by this percentage */
  rebalanceThreshold: number;
  /** Minimum position size in USD */
  minPositionSizeUsd: number;
  /** Gas/fee buffer (percentage of total) */
  feeBufferPercentage: number;
}

const DEFAULT_CONFIG: YieldOptimizerConfig = {
  minAPY: 3,
  maxProtocolExposure: 50,
  maxPositionExposure: 40,
  rebalanceThreshold: 10,
  minPositionSizeUsd: 10,
  feeBufferPercentage: 2,
};

// ============================================================================
// Types
// ============================================================================

export interface AllocationTarget {
  protocolId: string;
  productId: string;
  token: string;
  targetPercentage: number;
  expectedAPY: number;
  risk: 'low' | 'medium' | 'high';
}

export interface AllocationPlan {
  targets: AllocationTarget[];
  totalExpectedAPY: number;
  riskScore: number;
  diversificationScore: number;
}

export interface RebalanceAction {
  type: 'deposit' | 'withdraw' | 'transfer';
  fromProtocol?: string;
  fromProductId?: string;
  toProtocol: string;
  toProductId: string;
  token: string;
  amount: number;
  amountUsd: number;
  reason: string;
}

export interface RebalancePlan {
  actions: RebalanceAction[];
  currentAllocation: AllocationTarget[];
  targetAllocation: AllocationTarget[];
  estimatedGasCostUsd: number;
  expectedAPYImprovement: number;
  shouldRebalance: boolean;
  reason: string;
}

export interface PortfolioAnalysis {
  totalValueUsd: number;
  currentAPY: number;
  positions: Array<{
    position: YieldPosition;
    percentageOfTotal: number;
  }>;
  protocolExposure: Map<string, number>;
  riskBreakdown: {
    low: number;
    medium: number;
    high: number;
  };
  diversificationScore: number;
  recommendations: string[];
}

// ============================================================================
// Risk Scoring
// ============================================================================

// Risk score thresholds (opportunities use 1-10 scale)
const RISK_TOLERANCE_LIMITS: Record<RiskTolerance, number> = {
  conservative: 3, // Only allow low-risk (score 1-3)
  moderate: 5,     // Allow medium-risk (score 1-5)
  aggressive: 10,  // Allow all (score 1-10)
};

// Helper to convert riskScore (1-10) to risk category
function riskScoreToCategory(riskScore: number): 'low' | 'medium' | 'high' {
  if (riskScore <= 3) return 'low';
  if (riskScore <= 6) return 'medium';
  return 'high';
}

// ============================================================================
// Yield Optimizer
// ============================================================================

export class YieldOptimizer {
  private config: YieldOptimizerConfig;

  constructor(config: Partial<YieldOptimizerConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  // ==========================================================================
  // Opportunity Discovery
  // ==========================================================================

  /**
   * Find the best yield opportunities based on risk tolerance
   */
  async findBestOpportunities(
    riskTolerance: RiskTolerance,
    availableTokens: string[],
    amountUsd: number
  ): Promise<YieldOpportunity[]> {
    const registry = getProtocolRegistry();
    const allOpportunities = await registry.getAllOpportunities();

    const maxRiskScore = RISK_TOLERANCE_LIMITS[riskTolerance];

    // Filter by risk tolerance and available tokens
    const filtered = allOpportunities.filter((opp) => {
      // Check risk level (riskScore is 1-10)
      if (opp.riskScore > maxRiskScore) return false;

      // Check token availability
      const oppTokens = opp.depositTokens.map((t) => t.toUpperCase());
      const hasAvailableToken = availableTokens.some((t) => oppTokens.includes(t.toUpperCase()));
      if (!hasAvailableToken) return false;

      // Check minimum APY
      if (opp.currentAPY < this.config.minAPY) return false;

      return true;
    });

    // Sort by APY (highest first)
    return filtered.sort((a, b) => b.currentAPY - a.currentAPY);
  }

  /**
   * Create an optimal allocation plan
   */
  async createAllocationPlan(
    riskTolerance: RiskTolerance,
    availableTokens: string[],
    totalAmountUsd: number
  ): Promise<AllocationPlan> {
    const opportunities = await this.findBestOpportunities(
      riskTolerance,
      availableTokens,
      totalAmountUsd
    );

    if (opportunities.length === 0) {
      return {
        targets: [],
        totalExpectedAPY: 0,
        riskScore: 0,
        diversificationScore: 0,
      };
    }

    const targets: AllocationTarget[] = [];
    let remainingPercentage = 100;
    const usedProtocols = new Set<string>();

    for (const opp of opportunities) {
      if (remainingPercentage <= 0) break;

      // Calculate allocation considering limits
      let allocation = Math.min(
        remainingPercentage,
        this.config.maxPositionExposure
      );

      // Apply protocol exposure limit
      if (usedProtocols.has(opp.protocolId)) {
        const currentExposure = targets
          .filter((t) => t.protocolId === opp.protocolId)
          .reduce((sum, t) => sum + t.targetPercentage, 0);

        const maxAllowed = this.config.maxProtocolExposure - currentExposure;
        allocation = Math.min(allocation, maxAllowed);
      }

      if (allocation < 5) continue; // Skip tiny allocations

      targets.push({
        protocolId: opp.protocolId,
        productId: opp.productId,
        token: opp.depositTokens[0],
        targetPercentage: allocation,
        expectedAPY: opp.currentAPY,
        risk: riskScoreToCategory(opp.riskScore),
      });

      remainingPercentage -= allocation;
      usedProtocols.add(opp.protocolId);
    }

    // Normalize percentages to 100%
    const total = targets.reduce((sum, t) => sum + t.targetPercentage, 0);
    if (total < 100 && targets.length > 0) {
      const scale = 100 / total;
      targets.forEach((t) => (t.targetPercentage *= scale));
    }

    // Calculate weighted average APY
    const totalExpectedAPY = targets.reduce(
      (sum, t) => sum + (t.expectedAPY * t.targetPercentage) / 100,
      0
    );

    // Calculate risk score (convert category back to numeric for weighted average)
    const riskCategoryToScore: Record<'low' | 'medium' | 'high', number> = {
      low: 2,
      medium: 5,
      high: 8,
    };
    const riskScore = targets.reduce(
      (sum, t) => sum + (riskCategoryToScore[t.risk] * t.targetPercentage) / 100,
      0
    );

    // Calculate diversification score (0-100)
    const diversificationScore = this.calculateDiversificationScore(targets);

    return {
      targets,
      totalExpectedAPY,
      riskScore,
      diversificationScore,
    };
  }

  // ==========================================================================
  // Rebalancing
  // ==========================================================================

  /**
   * Analyze current portfolio and create rebalance plan
   */
  async createRebalancePlan(
    currentPositions: YieldPosition[],
    targetAllocation: AllocationTarget[],
    totalValueUsd: number
  ): Promise<RebalancePlan> {
    // Calculate current allocation
    const currentAllocation = this.calculateCurrentAllocation(
      currentPositions,
      totalValueUsd
    );

    // Find drift from target
    const actions: RebalanceAction[] = [];
    let estimatedGasCostUsd = 0;

    // Build maps for easy lookup
    const currentMap = new Map<string, AllocationTarget>();
    currentAllocation.forEach((a) => {
      currentMap.set(`${a.protocolId}:${a.productId}`, a);
    });

    const targetMap = new Map<string, AllocationTarget>();
    targetAllocation.forEach((a) => {
      targetMap.set(`${a.protocolId}:${a.productId}`, a);
    });

    // Find positions to reduce or close
    for (const [key, current] of currentMap) {
      const target = targetMap.get(key);
      const targetPercentage = target?.targetPercentage || 0;
      const drift = current.targetPercentage - targetPercentage;

      if (drift > this.config.rebalanceThreshold) {
        const amountToWithdraw = (drift / 100) * totalValueUsd;

        actions.push({
          type: 'withdraw',
          fromProtocol: current.protocolId,
          fromProductId: current.productId,
          toProtocol: '', // Will be determined by deposit actions
          toProductId: '',
          token: current.token,
          amount: amountToWithdraw / 150, // Rough token conversion
          amountUsd: amountToWithdraw,
          reason: `Reduce ${current.protocolId} exposure from ${current.targetPercentage.toFixed(1)}% to ${targetPercentage.toFixed(1)}%`,
        });

        estimatedGasCostUsd += 0.5; // Rough gas estimate
      }
    }

    // Find positions to increase or open
    for (const [key, target] of targetMap) {
      const current = currentMap.get(key);
      const currentPercentage = current?.targetPercentage || 0;
      const drift = target.targetPercentage - currentPercentage;

      if (drift > this.config.rebalanceThreshold) {
        const amountToDeposit = (drift / 100) * totalValueUsd;

        actions.push({
          type: 'deposit',
          toProtocol: target.protocolId,
          toProductId: target.productId,
          token: target.token,
          amount: amountToDeposit / 150, // Rough token conversion
          amountUsd: amountToDeposit,
          reason: `Increase ${target.protocolId} exposure from ${currentPercentage.toFixed(1)}% to ${target.targetPercentage.toFixed(1)}%`,
        });

        estimatedGasCostUsd += 0.5; // Rough gas estimate
      }
    }

    // Calculate expected APY improvement
    const currentAPY = currentAllocation.reduce(
      (sum, a) => sum + (a.expectedAPY * a.targetPercentage) / 100,
      0
    );
    const targetAPY = targetAllocation.reduce(
      (sum, a) => sum + (a.expectedAPY * a.targetPercentage) / 100,
      0
    );
    const expectedAPYImprovement = targetAPY - currentAPY;

    // Determine if rebalancing is worth it
    const rebalanceValueUsd = actions.reduce((sum, a) => sum + a.amountUsd, 0);
    const annualBenefit = (expectedAPYImprovement / 100) * totalValueUsd;
    const shouldRebalance =
      actions.length > 0 &&
      estimatedGasCostUsd < annualBenefit / 12 && // Should pay off within 1 month
      rebalanceValueUsd > this.config.minPositionSizeUsd;

    let reason = 'No rebalancing needed';
    if (actions.length === 0) {
      reason = 'Portfolio is already optimally allocated';
    } else if (!shouldRebalance) {
      reason = 'Rebalancing cost exceeds expected benefit';
    } else {
      reason = `Rebalancing will improve APY by ${expectedAPYImprovement.toFixed(2)}%`;
    }

    return {
      actions,
      currentAllocation,
      targetAllocation,
      estimatedGasCostUsd,
      expectedAPYImprovement,
      shouldRebalance,
      reason,
    };
  }

  // ==========================================================================
  // Portfolio Analysis
  // ==========================================================================

  /**
   * Analyze current portfolio
   */
  async analyzePortfolio(positions: YieldPosition[]): Promise<PortfolioAnalysis> {
    if (positions.length === 0) {
      return {
        totalValueUsd: 0,
        currentAPY: 0,
        positions: [],
        protocolExposure: new Map(),
        riskBreakdown: { low: 0, medium: 0, high: 0 },
        diversificationScore: 0,
        recommendations: ['No positions found. Consider deploying capital to yield protocols.'],
      };
    }

    const totalValueUsd = positions.reduce((sum, p) => sum + p.currentValue, 0);

    // Calculate position percentages
    const positionAnalysis = positions.map((p) => ({
      position: p,
      percentageOfTotal: (p.currentValue / totalValueUsd) * 100,
    }));

    // Calculate protocol exposure
    const protocolExposure = new Map<string, number>();
    for (const { position, percentageOfTotal } of positionAnalysis) {
      const current = protocolExposure.get(position.protocolId) || 0;
      protocolExposure.set(position.protocolId, current + percentageOfTotal);
    }

    // Calculate weighted APY
    const currentAPY = positions.reduce(
      (sum, p) => sum + (p.currentAPY * p.currentValue) / totalValueUsd,
      0
    );

    // Risk breakdown (simplified - would use actual position risk data)
    const riskBreakdown = { low: 0, medium: 0, high: 0 };
    // In production, this would analyze each position's risk

    // Calculate diversification score
    const allocationTargets = this.calculateCurrentAllocation(positions, totalValueUsd);
    const diversificationScore = this.calculateDiversificationScore(allocationTargets);

    // Generate recommendations
    const recommendations: string[] = [];

    // Check for concentration risk
    for (const [protocol, exposure] of protocolExposure) {
      if (exposure > this.config.maxProtocolExposure) {
        recommendations.push(
          `High concentration in ${protocol} (${exposure.toFixed(1)}%). Consider diversifying.`
        );
      }
    }

    // Check for underperforming positions
    for (const { position, percentageOfTotal } of positionAnalysis) {
      if (position.currentAPY < this.config.minAPY && percentageOfTotal > 10) {
        recommendations.push(
          `Position in ${position.protocolId} has low APY (${position.currentAPY.toFixed(1)}%). Consider moving to higher yield.`
        );
      }
    }

    if (recommendations.length === 0) {
      recommendations.push('Portfolio is well-diversified and performing optimally.');
    }

    return {
      totalValueUsd,
      currentAPY,
      positions: positionAnalysis,
      protocolExposure,
      riskBreakdown,
      diversificationScore,
      recommendations,
    };
  }

  // ==========================================================================
  // Helper Methods
  // ==========================================================================

  private calculateCurrentAllocation(
    positions: YieldPosition[],
    totalValueUsd: number
  ): AllocationTarget[] {
    if (totalValueUsd === 0) return [];

    return positions.map((p) => ({
      protocolId: p.protocolId,
      productId: p.productId,
      token: p.depositToken,
      targetPercentage: (p.currentValue / totalValueUsd) * 100,
      expectedAPY: p.currentAPY,
      risk: 'medium' as const, // Would be determined from opportunity data
    }));
  }

  private calculateDiversificationScore(allocation: AllocationTarget[]): number {
    if (allocation.length === 0) return 0;
    if (allocation.length === 1) return 20;

    // Use Herfindahl-Hirschman Index (HHI) approach
    // Lower HHI = more diversified
    const hhi = allocation.reduce(
      (sum, a) => sum + Math.pow(a.targetPercentage / 100, 2),
      0
    );

    // Convert HHI to score (0-100, higher is better)
    // Perfect diversification (equal weights) HHI = 1/n
    // Complete concentration HHI = 1
    const minHHI = 1 / allocation.length;
    const maxHHI = 1;

    const normalizedHHI = (hhi - minHHI) / (maxHHI - minHHI);
    const diversificationScore = (1 - normalizedHHI) * 100;

    // Bonus for protocol diversity
    const uniqueProtocols = new Set(allocation.map((a) => a.protocolId)).size;
    const protocolBonus = Math.min(uniqueProtocols * 5, 20);

    return Math.min(diversificationScore + protocolBonus, 100);
  }

  // ==========================================================================
  // Configuration
  // ==========================================================================

  updateConfig(config: Partial<YieldOptimizerConfig>): void {
    this.config = { ...this.config, ...config };
  }

  getConfig(): YieldOptimizerConfig {
    return { ...this.config };
  }
}

// ============================================================================
// Singleton
// ============================================================================

let optimizerInstance: YieldOptimizer | null = null;

export function getYieldOptimizer(config?: Partial<YieldOptimizerConfig>): YieldOptimizer {
  if (!optimizerInstance) {
    optimizerInstance = new YieldOptimizer(config);
  }
  return optimizerInstance;
}

export function resetYieldOptimizer(): void {
  optimizerInstance = null;
}
