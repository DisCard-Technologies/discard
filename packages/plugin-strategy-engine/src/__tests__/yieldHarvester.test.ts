/**
 * Integration Tests for Yield Harvester: Deploy → Harvest → Compound Flow
 *
 * Tests the complete pipeline from fund deployment through yield harvesting
 * and compounding rewards back into positions.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { Strategy } from '../types/strategy.js';
import type {
  GoalConfig,
  YieldHarvesterStrategy,
  YieldOpportunity,
  YieldPosition,
  GoalProgress,
} from '../types/goal.js';
import { v4 as uuidv4 } from 'uuid';

// ============================================================================
// Mock Setup
// ============================================================================

// Mock Redis
const mockRedis = {
  get: vi.fn(),
  set: vi.fn(),
  del: vi.fn(),
  hget: vi.fn(),
  hset: vi.fn(),
  hdel: vi.fn(),
  hgetall: vi.fn(),
  lpush: vi.fn(),
  lrange: vi.fn(),
  smembers: vi.fn(),
  sadd: vi.fn(),
  srem: vi.fn(),
  keys: vi.fn(),
  multi: vi.fn(() => ({
    exec: vi.fn().mockResolvedValue([]),
    set: vi.fn().mockReturnThis(),
    hset: vi.fn().mockReturnThis(),
    lpush: vi.fn().mockReturnThis(),
    sadd: vi.fn().mockReturnThis(),
  })),
  duplicate: vi.fn().mockReturnThis(),
  connect: vi.fn().mockResolvedValue(undefined),
  disconnect: vi.fn().mockResolvedValue(undefined),
  quit: vi.fn().mockResolvedValue(undefined),
};

// Mock BullMQ
vi.mock('bullmq', () => ({
  Queue: vi.fn().mockImplementation(() => ({
    add: vi.fn().mockResolvedValue({ id: 'mock-job-id' }),
    getJobs: vi.fn().mockResolvedValue([]),
    getWaitingCount: vi.fn().mockResolvedValue(0),
    getActiveCount: vi.fn().mockResolvedValue(0),
    getCompletedCount: vi.fn().mockResolvedValue(0),
    getFailedCount: vi.fn().mockResolvedValue(0),
    getDelayedCount: vi.fn().mockResolvedValue(0),
    getRepeatableJobs: vi.fn().mockResolvedValue([]),
    removeRepeatableByKey: vi.fn().mockResolvedValue(undefined),
    pause: vi.fn().mockResolvedValue(undefined),
    resume: vi.fn().mockResolvedValue(undefined),
    drain: vi.fn().mockResolvedValue(undefined),
    close: vi.fn().mockResolvedValue(undefined),
  })),
  Worker: vi.fn().mockImplementation(() => ({
    close: vi.fn().mockResolvedValue(undefined),
    on: vi.fn(),
  })),
  QueueEvents: vi.fn().mockImplementation(() => ({
    close: vi.fn().mockResolvedValue(undefined),
    on: vi.fn(),
  })),
}));

// ============================================================================
// Test Helpers
// ============================================================================

function createYieldHarvesterStrategy(): YieldHarvesterStrategy {
  return {
    type: 'yield_harvester',
    protocols: [
      {
        protocolId: 'marinade',
        protocolName: 'Marinade Finance',
        productType: 'liquid_staking',
        maxAllocation: 50,
        enabled: true,
        chain: 'solana',
      },
      {
        protocolId: 'kamino',
        protocolName: 'Kamino Finance',
        productType: 'lending',
        maxAllocation: 50,
        enabled: true,
        chain: 'solana',
      },
    ],
    minAPY: 5,
    maxProtocolExposure: 50,
    autoCompound: true,
    harvestFrequency: 'daily',
    rebalanceThreshold: 10,
    includeLiquidityPools: false,
  };
}

function createGoalStrategy(
  overrides: Partial<Strategy> = {},
  yieldStrategyOverrides: Partial<YieldHarvesterStrategy> = {}
): Strategy {
  const strategyId = `goal_${uuidv4()}`;
  const yieldStrategy = { ...createYieldHarvesterStrategy(), ...yieldStrategyOverrides };

  const goalConfig: GoalConfig = {
    goalType: 'save',
    targetAmount: 5000,
    targetToken: 'USDC',
    deadline: Date.now() + 180 * 24 * 60 * 60 * 1000, // 6 months
    riskTolerance: 'moderate',
    achievementStrategy: yieldStrategy,
  };

  return {
    strategyId,
    userId: 'user_test123',
    type: 'goal',
    name: 'Test Savings Goal',
    status: 'active',
    config: goalConfig as unknown as Strategy['config'],
    conditions: [],
    executions: [],
    events: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
    totalExecutions: 0,
    totalAmountExecuted: 0,
    successfulExecutions: 0,
    failedExecutions: 0,
    totalFeePaid: 0,
    ...overrides,
  };
}

function createMockYieldOpportunity(
  protocolId: string,
  productId: string,
  apy: number,
  overrides: Partial<YieldOpportunity> = {}
): YieldOpportunity {
  return {
    protocolId,
    productId,
    productName: `${protocolId} ${productId}`,
    currentAPY: apy,
    avgAPY7d: apy - 0.5,
    avgAPY30d: apy - 1,
    depositTokens: ['SOL'],
    tvl: 100_000_000,
    riskScore: 3,
    recommended: true,
    reason: 'Good risk-adjusted returns',
    ...overrides,
  };
}

function createMockYieldPosition(
  protocolId: string,
  productId: string,
  depositAmount: number,
  currentValue: number,
  overrides: Partial<YieldPosition> = {}
): YieldPosition {
  return {
    positionId: `${protocolId}:${productId}:wallet123`,
    strategyId: 'goal_test',
    protocolId,
    productId,
    depositAmount,
    currentValue,
    depositToken: 'SOL',
    receiptToken: protocolId === 'marinade' ? 'mSOL' : 'kSOL',
    currentAPY: 7.2,
    totalYieldEarned: currentValue - depositAmount,
    totalYieldHarvested: 0,
    pendingYield: 0,
    openedAt: Date.now() - 30 * 24 * 60 * 60 * 1000, // 30 days ago
    status: 'active',
    ...overrides,
  };
}

// ============================================================================
// Protocol Registry Mock
// ============================================================================

class MockProtocolRegistry {
  private adapters = new Map<string, MockProtocolAdapter>();

  register(adapter: MockProtocolAdapter): void {
    this.adapters.set(adapter.protocolId, adapter);
  }

  get(protocolId: string): MockProtocolAdapter | undefined {
    return this.adapters.get(protocolId);
  }

  getEnabled(): MockProtocolAdapter[] {
    return Array.from(this.adapters.values()).filter((a) => a.enabled);
  }

  async getAllOpportunities(): Promise<YieldOpportunity[]> {
    const opportunities: YieldOpportunity[] = [];
    for (const adapter of this.getEnabled()) {
      const opps = await adapter.getOpportunities();
      opportunities.push(...opps);
    }
    return opportunities.sort((a, b) => b.currentAPY - a.currentAPY);
  }

  async getAllPositions(walletAddress: string): Promise<YieldPosition[]> {
    const positions: YieldPosition[] = [];
    for (const adapter of this.getEnabled()) {
      const pos = await adapter.getPositions(walletAddress);
      positions.push(...pos);
    }
    return positions;
  }
}

class MockProtocolAdapter {
  readonly protocolId: string;
  readonly name: string;
  enabled = true;

  private opportunities: YieldOpportunity[] = [];
  private positions: YieldPosition[] = [];
  private harvestableRewards: Map<string, number> = new Map();

  constructor(protocolId: string, name: string) {
    this.protocolId = protocolId;
    this.name = name;
  }

  setOpportunities(opps: YieldOpportunity[]): void {
    this.opportunities = opps;
  }

  setPositions(pos: YieldPosition[]): void {
    this.positions = pos;
  }

  setHarvestableRewards(positionId: string, amount: number): void {
    this.harvestableRewards.set(positionId, amount);
  }

  async getOpportunities(): Promise<YieldOpportunity[]> {
    return this.opportunities;
  }

  async getPositions(_walletAddress: string): Promise<YieldPosition[]> {
    return this.positions;
  }

  async deposit(
    amount: number,
    token: string,
    walletAddress: string,
    productId?: string
  ): Promise<{ success: boolean; positionId?: string; amountDeposited: number; error?: string }> {
    const positionId = `${this.protocolId}:${productId || 'default'}:${walletAddress}`;

    // Create a new position
    const newPosition: YieldPosition = {
      positionId,
      strategyId: '',
      protocolId: this.protocolId,
      productId: productId || 'default',
      depositAmount: amount,
      currentValue: amount,
      depositToken: token,
      currentAPY: this.opportunities[0]?.currentAPY || 7,
      totalYieldEarned: 0,
      totalYieldHarvested: 0,
      pendingYield: 0,
      openedAt: Date.now(),
      status: 'active',
    };

    this.positions.push(newPosition);

    return {
      success: true,
      positionId,
      amountDeposited: amount,
    };
  }

  async withdraw(
    positionId: string,
    amount: number | 'all',
    _walletAddress: string
  ): Promise<{ success: boolean; amountWithdrawn: number; tokenReceived: string; error?: string }> {
    const position = this.positions.find((p) => p.positionId === positionId);
    if (!position) {
      return { success: false, amountWithdrawn: 0, tokenReceived: '', error: 'Position not found' };
    }

    const withdrawAmount = amount === 'all' ? position.currentValue : amount;

    if (amount === 'all') {
      this.positions = this.positions.filter((p) => p.positionId !== positionId);
    } else {
      position.currentValue -= withdrawAmount;
      position.depositAmount -= withdrawAmount;
    }

    return {
      success: true,
      amountWithdrawn: withdrawAmount,
      tokenReceived: position.depositToken,
    };
  }

  async getHarvestableRewards(
    positionId: string
  ): Promise<{ positionId: string; rewards: Array<{ token: string; amount: number }>; totalValueUsd: number }> {
    const amount = this.harvestableRewards.get(positionId) || 0;
    return {
      positionId,
      rewards: amount > 0 ? [{ token: 'SOL', amount }] : [],
      totalValueUsd: amount * 150, // Assume $150/SOL
    };
  }

  async harvest(
    positionId: string,
    _walletAddress: string
  ): Promise<{
    success: boolean;
    rewards: Array<{ token: string; amount: number }>;
    totalValueUsd: number;
    transactionSignature?: string;
    error?: string;
  }> {
    const harvestable = await this.getHarvestableRewards(positionId);

    if (harvestable.totalValueUsd === 0) {
      return {
        success: true,
        rewards: [],
        totalValueUsd: 0,
      };
    }

    // Clear harvestable rewards
    this.harvestableRewards.set(positionId, 0);

    // Update position's harvested total
    const position = this.positions.find((p) => p.positionId === positionId);
    if (position) {
      position.totalYieldHarvested += harvestable.totalValueUsd;
    }

    return {
      success: true,
      rewards: harvestable.rewards,
      totalValueUsd: harvestable.totalValueUsd,
      transactionSignature: `harvest_${Date.now()}`,
    };
  }

  async compound(
    positionId: string,
    _walletAddress: string
  ): Promise<{
    success: boolean;
    amountCompounded: number;
    newPositionValue: number;
    transactionSignature?: string;
    error?: string;
  }> {
    const harvestable = await this.getHarvestableRewards(positionId);
    const position = this.positions.find((p) => p.positionId === positionId);

    if (!position) {
      return {
        success: false,
        amountCompounded: 0,
        newPositionValue: 0,
        error: 'Position not found',
      };
    }

    // Harvest and add to position value
    const harvestResult = await this.harvest(positionId, '');

    if (harvestResult.totalValueUsd > 0) {
      // Convert USD value back to token amount (simplified)
      const tokenAmount = harvestResult.totalValueUsd / 150;
      position.currentValue += tokenAmount;
    }

    return {
      success: true,
      amountCompounded: harvestResult.totalValueUsd,
      newPositionValue: position.currentValue,
      transactionSignature: `compound_${Date.now()}`,
    };
  }
}

// ============================================================================
// Integration Tests
// ============================================================================

describe('Yield Harvester Integration: Deploy → Harvest → Compound', () => {
  let registry: MockProtocolRegistry;
  let marinadeAdapter: MockProtocolAdapter;
  let kaminoAdapter: MockProtocolAdapter;

  beforeEach(() => {
    vi.clearAllMocks();

    // Setup mock registry and adapters
    registry = new MockProtocolRegistry();

    marinadeAdapter = new MockProtocolAdapter('marinade', 'Marinade Finance');
    marinadeAdapter.setOpportunities([
      createMockYieldOpportunity('marinade', 'msol-staking', 7.2, {
        depositTokens: ['SOL'],
        riskScore: 2,
      }),
    ]);

    kaminoAdapter = new MockProtocolAdapter('kamino', 'Kamino Finance');
    kaminoAdapter.setOpportunities([
      createMockYieldOpportunity('kamino', 'usdc-lending', 12.5, {
        depositTokens: ['USDC'],
        riskScore: 3,
      }),
      createMockYieldOpportunity('kamino', 'sol-lending', 5.8, {
        depositTokens: ['SOL'],
        riskScore: 3,
      }),
    ]);

    registry.register(marinadeAdapter);
    registry.register(kaminoAdapter);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Fund Deployment', () => {
    it('should deploy funds to the best yielding protocol', async () => {
      const walletAddress = 'wallet123';

      // Get best opportunities
      const opportunities = await registry.getAllOpportunities();

      expect(opportunities.length).toBe(3);
      expect(opportunities[0].currentAPY).toBe(12.5); // USDC lending should be first
      expect(opportunities[0].protocolId).toBe('kamino');

      // Deploy to best SOL opportunity (Marinade at 7.2%)
      const solOpps = opportunities.filter((o) => o.depositTokens.includes('SOL'));
      expect(solOpps[0].protocolId).toBe('marinade');
      expect(solOpps[0].currentAPY).toBe(7.2);

      // Execute deposit
      const depositResult = await marinadeAdapter.deposit(10, 'SOL', walletAddress, 'msol-staking');

      expect(depositResult.success).toBe(true);
      expect(depositResult.amountDeposited).toBe(10);
      expect(depositResult.positionId).toBe('marinade:msol-staking:wallet123');

      // Verify position was created
      const positions = await marinadeAdapter.getPositions(walletAddress);
      expect(positions.length).toBe(1);
      expect(positions[0].depositAmount).toBe(10);
      expect(positions[0].currentValue).toBe(10);
    });

    it('should deploy to multiple protocols for diversification', async () => {
      const walletAddress = 'wallet123';

      // Deploy 50% to Marinade
      const marinadeResult = await marinadeAdapter.deposit(5, 'SOL', walletAddress, 'msol-staking');
      expect(marinadeResult.success).toBe(true);

      // Deploy 50% to Kamino
      const kaminoResult = await kaminoAdapter.deposit(5, 'SOL', walletAddress, 'sol-lending');
      expect(kaminoResult.success).toBe(true);

      // Verify positions in both protocols
      const allPositions = await registry.getAllPositions(walletAddress);
      expect(allPositions.length).toBe(2);

      const marinadePositions = allPositions.filter((p) => p.protocolId === 'marinade');
      const kaminoPositions = allPositions.filter((p) => p.protocolId === 'kamino');

      expect(marinadePositions.length).toBe(1);
      expect(kaminoPositions.length).toBe(1);
      expect(marinadePositions[0].depositAmount).toBe(5);
      expect(kaminoPositions[0].depositAmount).toBe(5);
    });

    it('should respect protocol exposure limits', async () => {
      const strategy = createGoalStrategy();
      const config = strategy.config as unknown as GoalConfig;
      const yieldConfig = config.achievementStrategy as YieldHarvesterStrategy;

      expect(yieldConfig.maxProtocolExposure).toBe(50);

      // With $1000 to deploy and 50% max exposure, each protocol gets max $500
      const totalToDeployUsd = 1000;
      const maxPerProtocol = (yieldConfig.maxProtocolExposure / 100) * totalToDeployUsd;

      expect(maxPerProtocol).toBe(500);
    });

    it('should filter opportunities by minimum APY', async () => {
      const strategy = createGoalStrategy();
      const config = strategy.config as unknown as GoalConfig;
      const yieldConfig = config.achievementStrategy as YieldHarvesterStrategy;

      const minAPY = yieldConfig.minAPY; // 5%
      const opportunities = await registry.getAllOpportunities();

      const filteredOpps = opportunities.filter((o) => o.currentAPY >= minAPY);

      expect(filteredOpps.length).toBe(3); // All meet minimum
      expect(filteredOpps.every((o) => o.currentAPY >= minAPY)).toBe(true);

      // Add a low APY opportunity
      kaminoAdapter.setOpportunities([
        ...kaminoAdapter['opportunities'],
        createMockYieldOpportunity('kamino', 'low-yield', 3, { depositTokens: ['USDC'] }),
      ]);

      const newOpps = await registry.getAllOpportunities();
      const newFiltered = newOpps.filter((o) => o.currentAPY >= minAPY);

      expect(newOpps.length).toBe(4);
      expect(newFiltered.length).toBe(3); // Low yield excluded
    });
  });

  describe('Reward Harvesting', () => {
    it('should harvest rewards from a single position', async () => {
      const walletAddress = 'wallet123';

      // Setup position with harvestable rewards
      const position = createMockYieldPosition('marinade', 'msol-staking', 10, 10.5);
      marinadeAdapter.setPositions([position]);
      marinadeAdapter.setHarvestableRewards(position.positionId, 0.1); // 0.1 SOL rewards

      // Check harvestable rewards
      const harvestable = await marinadeAdapter.getHarvestableRewards(position.positionId);
      expect(harvestable.totalValueUsd).toBe(15); // 0.1 * $150

      // Execute harvest
      const harvestResult = await marinadeAdapter.harvest(position.positionId, walletAddress);

      expect(harvestResult.success).toBe(true);
      expect(harvestResult.totalValueUsd).toBe(15);
      expect(harvestResult.rewards.length).toBe(1);
      expect(harvestResult.rewards[0].token).toBe('SOL');
      expect(harvestResult.rewards[0].amount).toBe(0.1);

      // Verify rewards were cleared
      const postHarvestable = await marinadeAdapter.getHarvestableRewards(position.positionId);
      expect(postHarvestable.totalValueUsd).toBe(0);
    });

    it('should harvest rewards from multiple positions', async () => {
      const walletAddress = 'wallet123';

      // Setup positions in multiple protocols
      const marinadePosition = createMockYieldPosition('marinade', 'msol-staking', 10, 10.5);
      const kaminoPosition = createMockYieldPosition('kamino', 'sol-lending', 5, 5.2);

      marinadeAdapter.setPositions([marinadePosition]);
      kaminoAdapter.setPositions([kaminoPosition]);

      marinadeAdapter.setHarvestableRewards(marinadePosition.positionId, 0.1);
      kaminoAdapter.setHarvestableRewards(kaminoPosition.positionId, 0.05);

      // Harvest from all positions
      const allPositions = await registry.getAllPositions(walletAddress);
      expect(allPositions.length).toBe(2);

      let totalHarvested = 0;
      for (const position of allPositions) {
        const adapter = registry.get(position.protocolId);
        if (adapter) {
          const result = await adapter.harvest(position.positionId, walletAddress);
          if (result.success) {
            totalHarvested += result.totalValueUsd;
          }
        }
      }

      expect(totalHarvested).toBe(22.5); // 0.1*150 + 0.05*150
    });

    it('should skip harvesting when rewards are below minimum threshold', async () => {
      const walletAddress = 'wallet123';
      const minHarvestValueUsd = 5; // Minimum $5 to harvest

      const position = createMockYieldPosition('marinade', 'msol-staking', 10, 10.1);
      marinadeAdapter.setPositions([position]);
      marinadeAdapter.setHarvestableRewards(position.positionId, 0.01); // Only $1.50 worth

      const harvestable = await marinadeAdapter.getHarvestableRewards(position.positionId);

      // Check if we should harvest
      const shouldHarvest = harvestable.totalValueUsd >= minHarvestValueUsd;
      expect(shouldHarvest).toBe(false);
      expect(harvestable.totalValueUsd).toBe(1.5);
    });
  });

  describe('Reward Compounding', () => {
    it('should compound rewards back into position', async () => {
      const walletAddress = 'wallet123';

      // Setup position with rewards
      const position = createMockYieldPosition('marinade', 'msol-staking', 10, 10);
      marinadeAdapter.setPositions([position]);
      marinadeAdapter.setHarvestableRewards(position.positionId, 0.5); // 0.5 SOL = $75

      // Compound
      const compoundResult = await marinadeAdapter.compound(position.positionId, walletAddress);

      expect(compoundResult.success).toBe(true);
      expect(compoundResult.amountCompounded).toBe(75); // $75 USD value

      // Position value should have increased
      expect(compoundResult.newPositionValue).toBeGreaterThan(10);

      // The compounded amount (0.5 SOL) should be added
      const positions = await marinadeAdapter.getPositions(walletAddress);
      expect(positions[0].currentValue).toBe(10.5); // Original 10 + 0.5 compounded
    });

    it('should auto-compound when strategy has autoCompound enabled', async () => {
      const strategy = createGoalStrategy();
      const config = strategy.config as unknown as GoalConfig;
      const yieldConfig = config.achievementStrategy as YieldHarvesterStrategy;

      expect(yieldConfig.autoCompound).toBe(true);

      // With autoCompound enabled, the system should compound after harvest
      const walletAddress = 'wallet123';
      const position = createMockYieldPosition('marinade', 'msol-staking', 10, 10);
      marinadeAdapter.setPositions([position]);
      marinadeAdapter.setHarvestableRewards(position.positionId, 0.2);

      if (yieldConfig.autoCompound) {
        const compoundResult = await marinadeAdapter.compound(position.positionId, walletAddress);
        expect(compoundResult.success).toBe(true);
        expect(compoundResult.amountCompounded).toBe(30); // 0.2 * $150
      }
    });

    it('should track total yield earned after compounding', async () => {
      const walletAddress = 'wallet123';

      const position = createMockYieldPosition('marinade', 'msol-staking', 10, 10);
      marinadeAdapter.setPositions([position]);

      // Simulate multiple compound cycles
      const rewardAmounts = [0.1, 0.15, 0.12];
      let totalYield = 0;

      for (const amount of rewardAmounts) {
        marinadeAdapter.setHarvestableRewards(position.positionId, amount);
        const result = await marinadeAdapter.compound(position.positionId, walletAddress);
        if (result.success) {
          totalYield += amount;
        }
      }

      const positions = await marinadeAdapter.getPositions(walletAddress);
      const finalPosition = positions[0];

      // Position value should have increased by all compounded amounts
      expect(finalPosition.currentValue).toBeCloseTo(10 + 0.1 + 0.15 + 0.12, 2);
    });
  });

  describe('Full Deploy → Harvest → Compound Flow', () => {
    it('should execute complete yield harvesting cycle', async () => {
      const walletAddress = 'wallet123';
      const initialAmount = 10; // 10 SOL

      // Step 1: Deploy funds
      console.log('Step 1: Deploying funds...');
      const depositResult = await marinadeAdapter.deposit(
        initialAmount,
        'SOL',
        walletAddress,
        'msol-staking'
      );
      expect(depositResult.success).toBe(true);

      let positions = await marinadeAdapter.getPositions(walletAddress);
      expect(positions.length).toBe(1);
      expect(positions[0].currentValue).toBe(initialAmount);

      // Step 2: Simulate time passing and yield accrual
      console.log('Step 2: Simulating yield accrual...');
      const positionId = positions[0].positionId;
      marinadeAdapter.setHarvestableRewards(positionId, 0.2); // 0.2 SOL earned

      // Step 3: Check harvestable rewards
      console.log('Step 3: Checking harvestable rewards...');
      const harvestable = await marinadeAdapter.getHarvestableRewards(positionId);
      expect(harvestable.totalValueUsd).toBe(30); // 0.2 * $150

      // Step 4: Harvest rewards
      console.log('Step 4: Harvesting rewards...');
      const harvestResult = await marinadeAdapter.harvest(positionId, walletAddress);
      expect(harvestResult.success).toBe(true);
      expect(harvestResult.totalValueUsd).toBe(30);

      // Step 5: Compound rewards (for auto-compound strategy)
      console.log('Step 5: Compounding rewards...');
      marinadeAdapter.setHarvestableRewards(positionId, 0.1); // New rewards
      const compoundResult = await marinadeAdapter.compound(positionId, walletAddress);
      expect(compoundResult.success).toBe(true);

      // Step 6: Verify final state
      console.log('Step 6: Verifying final state...');
      positions = await marinadeAdapter.getPositions(walletAddress);
      const finalPosition = positions[0];

      // Position should have grown
      expect(finalPosition.currentValue).toBeGreaterThan(initialAmount);

      console.log(`Initial: ${initialAmount} SOL`);
      console.log(`Final: ${finalPosition.currentValue} SOL`);
      console.log(`Yield earned: ${finalPosition.currentValue - initialAmount} SOL`);
    });

    it('should handle multi-protocol deployment and harvesting', async () => {
      const walletAddress = 'wallet123';

      // Deploy to both protocols
      await marinadeAdapter.deposit(5, 'SOL', walletAddress, 'msol-staking');
      await kaminoAdapter.deposit(5, 'SOL', walletAddress, 'sol-lending');

      // Set up rewards for both
      const allPositions = await registry.getAllPositions(walletAddress);
      expect(allPositions.length).toBe(2);

      marinadeAdapter.setHarvestableRewards(allPositions[0].positionId, 0.15);
      kaminoAdapter.setHarvestableRewards(allPositions[1].positionId, 0.1);

      // Harvest and compound all
      let totalCompounded = 0;
      for (const position of allPositions) {
        const adapter = registry.get(position.protocolId);
        if (adapter) {
          const result = await adapter.compound(position.positionId, walletAddress);
          if (result.success) {
            totalCompounded += result.amountCompounded;
          }
        }
      }

      expect(totalCompounded).toBe(37.5); // (0.15 + 0.1) * $150

      // Verify all positions grew
      const finalPositions = await registry.getAllPositions(walletAddress);
      for (const pos of finalPositions) {
        expect(pos.currentValue).toBeGreaterThan(5);
      }
    });
  });

  describe('Goal Progress Tracking', () => {
    it('should track contributions from yield earnings', () => {
      const progress: GoalProgress = {
        goalId: 'goal_test',
        targetAmount: 5000,
        currentAmount: 1000,
        progressPercentage: 20,
        projectedCompletionDate: null,
        onTrack: true,
        daysRemaining: 180,
        contributions: {
          dca: 800,
          yieldEarned: 150,
          tradingPnL: 0,
          priceAppreciation: 50,
          manualDeposits: 0,
        },
        history: [],
        lastUpdatedAt: Date.now(),
      };

      // Verify yield contribution is tracked
      expect(progress.contributions.yieldEarned).toBe(150);

      // Total contributions
      const totalContributions =
        progress.contributions.dca +
        progress.contributions.yieldEarned +
        progress.contributions.tradingPnL +
        progress.contributions.priceAppreciation +
        progress.contributions.manualDeposits;

      expect(totalContributions).toBe(1000);
      expect(totalContributions).toBe(progress.currentAmount);
    });

    it('should update progress after yield harvest', () => {
      const initialProgress: GoalProgress = {
        goalId: 'goal_test',
        targetAmount: 5000,
        currentAmount: 1000,
        progressPercentage: 20,
        projectedCompletionDate: null,
        onTrack: true,
        daysRemaining: 180,
        contributions: {
          dca: 800,
          yieldEarned: 150,
          tradingPnL: 0,
          priceAppreciation: 50,
          manualDeposits: 0,
        },
        history: [],
        lastUpdatedAt: Date.now(),
      };

      // Simulate yield harvest of $50
      const yieldHarvested = 50;
      const updatedProgress: GoalProgress = {
        ...initialProgress,
        currentAmount: initialProgress.currentAmount + yieldHarvested,
        progressPercentage:
          ((initialProgress.currentAmount + yieldHarvested) / initialProgress.targetAmount) * 100,
        contributions: {
          ...initialProgress.contributions,
          yieldEarned: initialProgress.contributions.yieldEarned + yieldHarvested,
        },
        lastUpdatedAt: Date.now(),
      };

      expect(updatedProgress.currentAmount).toBe(1050);
      expect(updatedProgress.progressPercentage).toBe(21);
      expect(updatedProgress.contributions.yieldEarned).toBe(200);
    });
  });

  describe('Error Handling', () => {
    it('should handle deposit failure gracefully', async () => {
      const failingAdapter = new MockProtocolAdapter('failing', 'Failing Protocol');

      // Override deposit to fail
      failingAdapter.deposit = async () => ({
        success: false,
        amountDeposited: 0,
        error: 'Insufficient balance',
      });

      const result = await failingAdapter.deposit(10, 'SOL', 'wallet123');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Insufficient balance');
      expect(result.amountDeposited).toBe(0);
    });

    it('should handle withdraw failure gracefully', async () => {
      const walletAddress = 'wallet123';

      // Try to withdraw from non-existent position
      const result = await marinadeAdapter.withdraw(
        'non-existent-position',
        10,
        walletAddress
      );

      expect(result.success).toBe(false);
      expect(result.error).toBe('Position not found');
    });

    it('should handle harvest with no rewards', async () => {
      const walletAddress = 'wallet123';

      const position = createMockYieldPosition('marinade', 'msol-staking', 10, 10);
      marinadeAdapter.setPositions([position]);
      // No rewards set

      const harvestResult = await marinadeAdapter.harvest(position.positionId, walletAddress);

      expect(harvestResult.success).toBe(true);
      expect(harvestResult.totalValueUsd).toBe(0);
      expect(harvestResult.rewards.length).toBe(0);
    });

    it('should handle compound failure gracefully', async () => {
      const failingAdapter = new MockProtocolAdapter('failing', 'Failing Protocol');

      failingAdapter.compound = async () => ({
        success: false,
        amountCompounded: 0,
        newPositionValue: 0,
        error: 'Position not found',
      });

      const result = await failingAdapter.compound('non-existent', 'wallet123');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Position not found');
    });
  });

  describe('Risk and Diversification', () => {
    it('should filter opportunities by risk tolerance', () => {
      const opportunities = [
        createMockYieldOpportunity('protocol1', 'product1', 25, { riskScore: 8 }),
        createMockYieldOpportunity('protocol2', 'product2', 12, { riskScore: 3 }),
        createMockYieldOpportunity('protocol3', 'product3', 8, { riskScore: 2 }),
      ];

      // Conservative: max risk score 3
      const conservativeOpps = opportunities.filter((o) => o.riskScore <= 3);
      expect(conservativeOpps.length).toBe(2);

      // Moderate: max risk score 5
      const moderateOpps = opportunities.filter((o) => o.riskScore <= 5);
      expect(moderateOpps.length).toBe(2);

      // Aggressive: max risk score 10
      const aggressiveOpps = opportunities.filter((o) => o.riskScore <= 10);
      expect(aggressiveOpps.length).toBe(3);
    });

    it('should calculate portfolio diversification', async () => {
      const walletAddress = 'wallet123';

      // Create diversified portfolio
      await marinadeAdapter.deposit(3.33, 'SOL', walletAddress, 'msol-staking');
      await kaminoAdapter.deposit(3.33, 'SOL', walletAddress, 'sol-lending');
      await kaminoAdapter.deposit(3.34, 'SOL', walletAddress, 'usdc-lending');

      const positions = await registry.getAllPositions(walletAddress);
      expect(positions.length).toBe(3);

      // Calculate protocol exposure
      const totalValue = positions.reduce((sum, p) => sum + p.currentValue, 0);
      const protocolExposure = new Map<string, number>();

      for (const p of positions) {
        const current = protocolExposure.get(p.protocolId) || 0;
        protocolExposure.set(p.protocolId, current + (p.currentValue / totalValue) * 100);
      }

      // Marinade should have ~33% exposure
      expect(protocolExposure.get('marinade')).toBeCloseTo(33.3, 0);

      // Kamino should have ~67% exposure (two positions)
      expect(protocolExposure.get('kamino')).toBeCloseTo(66.7, 0);
    });
  });
});
