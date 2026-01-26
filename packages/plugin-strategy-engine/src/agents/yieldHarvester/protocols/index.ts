/**
 * Protocol Registry
 *
 * Central registry for yield protocol integrations.
 * Each protocol adapter implements a common interface for
 * deposits, withdrawals, harvesting, and querying positions.
 */

import type { YieldProtocol, YieldPosition, YieldOpportunity } from '../../../types/goal.js';

// ============================================================================
// Protocol Adapter Interface
// ============================================================================

/**
 * Common interface for all protocol adapters
 */
export interface ProtocolAdapter {
  /** Protocol identifier */
  readonly protocolId: string;

  /** Human-readable name */
  readonly name: string;

  /** Protocol type */
  readonly productType: 'staking' | 'lending' | 'lp' | 'vault';

  /** Whether the protocol is currently enabled */
  enabled: boolean;

  // Lifecycle
  initialize(): Promise<void>;
  shutdown(): Promise<void>;

  // Discovery
  getOpportunities(): Promise<YieldOpportunity[]>;
  getCurrentAPY(productId?: string): Promise<number>;

  // Position Management
  deposit(
    amount: number,
    token: string,
    walletAddress: string,
    productId?: string
  ): Promise<DepositResult>;

  withdraw(
    positionId: string,
    amount: number | 'all',
    walletAddress: string
  ): Promise<WithdrawResult>;

  // Harvesting
  getHarvestableRewards(positionId: string): Promise<HarvestableReward>;
  harvest(positionId: string, walletAddress: string): Promise<HarvestResult>;
  compound(positionId: string, walletAddress: string): Promise<CompoundResult>;

  // Queries
  getPosition(positionId: string): Promise<YieldPosition | null>;
  getPositions(walletAddress: string): Promise<YieldPosition[]>;
  getTVL(): Promise<number>;
}

// ============================================================================
// Result Types
// ============================================================================

export interface DepositResult {
  success: boolean;
  positionId?: string;
  transactionSignature?: string;
  amountDeposited: number;
  tokenReceived?: string;
  tokenReceivedAmount?: number;
  error?: string;
}

export interface WithdrawResult {
  success: boolean;
  transactionSignature?: string;
  amountWithdrawn: number;
  tokenReceived: string;
  error?: string;
}

export interface HarvestableReward {
  positionId: string;
  rewards: Array<{
    token: string;
    amount: number;
    valueUsd: number;
  }>;
  totalValueUsd: number;
  lastHarvestAt?: number;
}

export interface HarvestResult {
  success: boolean;
  transactionSignature?: string;
  rewards: Array<{
    token: string;
    amount: number;
  }>;
  totalValueUsd: number;
  error?: string;
}

export interface CompoundResult {
  success: boolean;
  transactionSignature?: string;
  amountCompounded: number;
  newPositionValue: number;
  error?: string;
}

// ============================================================================
// Protocol Registry
// ============================================================================

class ProtocolRegistry {
  private adapters: Map<string, ProtocolAdapter> = new Map();
  private initialized: boolean = false;

  /**
   * Register a protocol adapter
   */
  register(adapter: ProtocolAdapter): void {
    this.adapters.set(adapter.protocolId, adapter);
    console.log(`[ProtocolRegistry] Registered adapter: ${adapter.protocolId}`);
  }

  /**
   * Get a protocol adapter by ID
   */
  get(protocolId: string): ProtocolAdapter | undefined {
    return this.adapters.get(protocolId);
  }

  /**
   * Get all registered adapters
   */
  getAll(): ProtocolAdapter[] {
    return Array.from(this.adapters.values());
  }

  /**
   * Get enabled adapters only
   */
  getEnabled(): ProtocolAdapter[] {
    return this.getAll().filter((a) => a.enabled);
  }

  /**
   * Get adapters by product type
   */
  getByType(productType: ProtocolAdapter['productType']): ProtocolAdapter[] {
    return this.getEnabled().filter((a) => a.productType === productType);
  }

  /**
   * Initialize all registered adapters
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    console.log('[ProtocolRegistry] Initializing all adapters...');

    const results = await Promise.allSettled(
      this.getAll().map((adapter) => adapter.initialize())
    );

    results.forEach((result, index) => {
      const adapter = this.getAll()[index];
      if (result.status === 'rejected') {
        console.error(
          `[ProtocolRegistry] Failed to initialize ${adapter.protocolId}:`,
          result.reason
        );
        adapter.enabled = false;
      }
    });

    this.initialized = true;
    console.log(
      `[ProtocolRegistry] Initialized ${this.getEnabled().length}/${this.adapters.size} adapters`
    );
  }

  /**
   * Shutdown all adapters
   */
  async shutdown(): Promise<void> {
    console.log('[ProtocolRegistry] Shutting down all adapters...');

    await Promise.allSettled(
      this.getAll().map((adapter) => adapter.shutdown())
    );

    this.initialized = false;
    console.log('[ProtocolRegistry] All adapters shut down');
  }

  /**
   * Get all available yield opportunities across protocols
   */
  async getAllOpportunities(): Promise<YieldOpportunity[]> {
    const opportunities: YieldOpportunity[] = [];

    const results = await Promise.allSettled(
      this.getEnabled().map((adapter) => adapter.getOpportunities())
    );

    results.forEach((result) => {
      if (result.status === 'fulfilled') {
        opportunities.push(...result.value);
      }
    });

    // Sort by APY descending
    return opportunities.sort((a, b) => b.currentAPY - a.currentAPY);
  }

  /**
   * Get all positions for a wallet across protocols
   */
  async getAllPositions(walletAddress: string): Promise<YieldPosition[]> {
    const positions: YieldPosition[] = [];

    const results = await Promise.allSettled(
      this.getEnabled().map((adapter) => adapter.getPositions(walletAddress))
    );

    results.forEach((result) => {
      if (result.status === 'fulfilled') {
        positions.push(...result.value);
      }
    });

    return positions;
  }

  /**
   * Get total TVL across all protocols
   */
  async getTotalTVL(): Promise<number> {
    let totalTVL = 0;

    const results = await Promise.allSettled(
      this.getEnabled().map((adapter) => adapter.getTVL())
    );

    results.forEach((result) => {
      if (result.status === 'fulfilled') {
        totalTVL += result.value;
      }
    });

    return totalTVL;
  }
}

// ============================================================================
// Singleton
// ============================================================================

let registryInstance: ProtocolRegistry | null = null;

export function getProtocolRegistry(): ProtocolRegistry {
  if (!registryInstance) {
    registryInstance = new ProtocolRegistry();
  }
  return registryInstance;
}

export function resetProtocolRegistry(): void {
  if (registryInstance) {
    registryInstance.shutdown();
    registryInstance = null;
  }
}

// Re-export protocol adapters (will be implemented next)
export { MarinadeAdapter } from './marinade.js';
export { KaminoAdapter } from './kamino.js';
