/**
 * DCA Agent
 *
 * Executes Dollar-Cost Averaging strategies by performing
 * scheduled token swaps via Jupiter aggregator.
 *
 * Supports encrypted balance execution via Inco TEE or ZK proofs
 * when strategy.encryptedMode is enabled.
 */

import { v4 as uuidv4 } from 'uuid';
import type { Job } from 'bullmq';
import type { Strategy, StrategyExecution, DCAConfig } from '../types/strategy.js';
import type { ExecutionJobData, ExecutionJobResult, ExecutionHandler } from '../services/executionQueue.js';
import { PriceMonitor, getPriceMonitor } from '../services/priceMonitor.js';

// ============================================================================
// Encrypted Execution Types (inlined to avoid cross-package imports)
// ============================================================================

/**
 * Strategy with encrypted balance support
 */
interface EncryptedStrategy {
  strategyId: string;
  userId: string;
  cardId: string;
  type: 'dca' | 'stop_loss' | 'take_profit' | 'limit_order';
  encryptedMode: boolean;
  encryptedBalanceHandle?: string;
  incoPublicKey?: string;
  incoEpoch?: number;
  config: DCAConfig;
}

/**
 * Attestation data from TEE operations
 */
interface Attestation {
  quote: string;
  timestamp: number;
  verified: boolean;
  operation: string;
  inputHash?: string;
}

/**
 * DCA execution result with trade details
 */
interface DCAResult {
  success: boolean;
  path: 'inco' | 'zk' | 'plaintext';
  newHandle?: string;
  newEpoch?: number;
  attestation?: Attestation;
  responseTimeMs: number;
  executedAmount?: number;
  inputAmount?: number;
  outputAmount?: number;
  executionPrice?: number;
  swapSignature?: string;
  error?: string;
}

// ============================================================================
// Configuration
// ============================================================================

export interface DCAAgentConfig {
  /** Jupiter Swap API URL */
  jupiterSwapApiUrl: string;
  /** Default slippage tolerance */
  defaultSlippageBps: number;
  /** Maximum slippage tolerance */
  maxSlippageBps: number;
  /** Request timeout in milliseconds */
  requestTimeoutMs: number;
  /** Whether to use versioned transactions */
  useVersionedTransactions: boolean;
  /** Priority fee in lamports (for faster execution) */
  priorityFeeLamports: number;
}

const DEFAULT_CONFIG: DCAAgentConfig = {
  jupiterSwapApiUrl: process.env.JUPITER_SWAP_API_URL || 'https://quote-api.jup.ag/v6',
  defaultSlippageBps: 50, // 0.5%
  maxSlippageBps: 500, // 5%
  requestTimeoutMs: 30000,
  useVersionedTransactions: true,
  priorityFeeLamports: 10000, // 0.00001 SOL
};

// ============================================================================
// Jupiter Types
// ============================================================================

interface JupiterQuoteResponse {
  inputMint: string;
  inAmount: string;
  outputMint: string;
  outAmount: string;
  otherAmountThreshold: string;
  swapMode: string;
  slippageBps: number;
  priceImpactPct: string;
  routePlan: Array<{
    swapInfo: {
      ammKey: string;
      label: string;
      inputMint: string;
      outputMint: string;
      inAmount: string;
      outAmount: string;
      feeAmount: string;
      feeMint: string;
    };
    percent: number;
  }>;
}

interface JupiterSwapResponse {
  swapTransaction: string;
  lastValidBlockHeight: number;
  prioritizationFeeLamports: number;
}

// ============================================================================
// Token Mints
// ============================================================================

const TOKEN_MINTS: Record<string, string> = {
  SOL: 'So11111111111111111111111111111111111111112',
  USDC: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
  USDT: 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB',
  JUP: 'JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN',
  BONK: 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263',
  WIF: 'EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm',
  MSOL: 'mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So',
  JITOSOL: 'J1toso1uCk3RLmjorhTtrVwY9HJ7X8V9yYac6Y7kGCPn',
};

// Token decimals
const TOKEN_DECIMALS: Record<string, number> = {
  SOL: 9,
  USDC: 6,
  USDT: 6,
  JUP: 6,
  BONK: 5,
  WIF: 6,
  MSOL: 9,
  JITOSOL: 9,
};

// ============================================================================
// DCA Agent Class
// ============================================================================

export class DCAAgent {
  private config: DCAAgentConfig;
  private priceMonitor: PriceMonitor;
  private incoEnabled: boolean | null = null;

  // Callbacks for integration with external execution
  private executeSwap?: (
    quote: JupiterQuoteResponse,
    strategy: Strategy,
    userWallet: string
  ) => Promise<{ signature: string; success: boolean; error?: string }>;

  // Callback for encrypted DCA execution (set by external Inco bridge)
  private executeEncryptedDCA?: (
    strategy: EncryptedStrategy
  ) => Promise<DCAResult>;

  constructor(config: Partial<DCAAgentConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.priceMonitor = getPriceMonitor();
  }

  /**
   * Check if Inco execution is enabled
   */
  private isIncoEnabled(): boolean {
    if (this.incoEnabled === null) {
      this.incoEnabled = process.env.INCO_ENABLED === 'true' ||
                         process.env.EXPO_PUBLIC_INCO_ENABLED === 'true';
    }
    return this.incoEnabled;
  }

  /**
   * Check if a strategy should use encrypted execution
   */
  private isEncryptedStrategy(strategy: Strategy): boolean {
    // Check if strategy has encrypted mode enabled via metadata
    return !!(strategy.metadata?.encryptedMode === true);
  }

  /**
   * Get encrypted strategy details from standard strategy
   */
  private toEncryptedStrategy(strategy: Strategy): EncryptedStrategy | null {
    if (!this.isEncryptedStrategy(strategy)) {
      return null;
    }

    const metadata = strategy.metadata || {};

    return {
      strategyId: strategy.strategyId,
      userId: strategy.userId,
      cardId: metadata.cardId as string || '',
      type: 'dca',
      encryptedMode: true,
      encryptedBalanceHandle: metadata.encryptedBalanceHandle as string || undefined,
      incoPublicKey: metadata.incoPublicKey as string || undefined,
      incoEpoch: metadata.incoEpoch as number || undefined,
      config: strategy.config as DCAConfig,
    };
  }

  /**
   * Set the encrypted DCA execution callback
   *
   * This allows external code (like Inco strategy bridge) to provide
   * the encrypted execution implementation without cross-package imports.
   */
  setExecuteEncryptedDCA(
    callback: (strategy: EncryptedStrategy) => Promise<DCAResult>
  ): void {
    this.executeEncryptedDCA = callback;
  }

  // ==========================================================================
  // Execution Handler
  // ==========================================================================

  /**
   * Get the execution handler for the queue
   */
  getExecutionHandler(): ExecutionHandler {
    return async (job: Job<ExecutionJobData>, strategy: Strategy): Promise<ExecutionJobResult> => {
      return this.execute(job, strategy);
    };
  }

  /**
   * Execute a DCA buy
   *
   * Execution priority:
   * 1. If encrypted mode enabled: Inco TEE (~50ms) → ZK proofs (~1-5s)
   * 2. Standard Jupiter swap execution
   */
  async execute(
    job: Job<ExecutionJobData>,
    strategy: Strategy
  ): Promise<ExecutionJobResult> {
    const startTime = Date.now();
    const executionId = `exec_${uuidv4()}`;

    try {
      const dcaConfig = strategy.config as DCAConfig;

      // Validate config
      if (!dcaConfig.tokenPair?.from || !dcaConfig.tokenPair?.to) {
        throw new Error('Invalid DCA config: missing token pair');
      }

      // Check execution limits
      const limitCheck = this.checkExecutionLimits(strategy, dcaConfig);
      if (!limitCheck.canExecute) {
        return {
          success: false,
          error: limitCheck.reason,
          execution: this.createExecution(executionId, strategy.strategyId, startTime, false, limitCheck.reason),
        };
      }

      // ============ ENCRYPTED EXECUTION PATH ============
      // If strategy uses encrypted balance, route through Inco/ZK
      if (this.isEncryptedStrategy(strategy) && this.isIncoEnabled()) {
        console.log(`[DCAAgent] Strategy ${strategy.strategyId} using encrypted execution path`);

        const encryptedResult = await this.executeWithEncryptedBalance(strategy, executionId, startTime);
        if (encryptedResult) {
          return encryptedResult;
        }

        // If encrypted path returned null, fall through to standard execution
        console.log(`[DCAAgent] Encrypted path unavailable, falling back to standard execution`);
      }

      // ============ STANDARD EXECUTION PATH ============
      // Get token mints
      const inputMint = this.getTokenMint(dcaConfig.tokenPair.from);
      const outputMint = this.getTokenMint(dcaConfig.tokenPair.to);

      if (!inputMint || !outputMint) {
        throw new Error(`Unknown token: ${dcaConfig.tokenPair.from} or ${dcaConfig.tokenPair.to}`);
      }

      // Calculate input amount in smallest units
      const inputDecimals = this.getTokenDecimals(dcaConfig.tokenPair.from);
      const inputAmount = Math.floor(dcaConfig.amountPerExecution * Math.pow(10, inputDecimals));

      // Get quote from Jupiter
      const quote = await this.getJupiterQuote(
        inputMint,
        outputMint,
        inputAmount,
        Math.floor((dcaConfig.slippageTolerance || 0.01) * 10000) // Convert to bps
      );

      if (!quote) {
        throw new Error('Failed to get Jupiter quote');
      }

      // Log quote details
      const outputDecimals = this.getTokenDecimals(dcaConfig.tokenPair.to);
      const outputAmount = parseInt(quote.outAmount) / Math.pow(10, outputDecimals);
      const priceImpact = parseFloat(quote.priceImpactPct);

      console.log(
        `[DCAAgent] Quote: ${dcaConfig.amountPerExecution} ${dcaConfig.tokenPair.from} -> ${outputAmount.toFixed(6)} ${dcaConfig.tokenPair.to} (impact: ${priceImpact.toFixed(4)}%)`
      );

      // Check price impact
      if (priceImpact > 1) {
        console.warn(`[DCAAgent] High price impact: ${priceImpact.toFixed(2)}%`);
      }

      // Execute swap if callback is set
      let transactionSignature: string | undefined;
      let swapSuccess = true;
      let swapError: string | undefined;

      if (this.executeSwap) {
        const result = await this.executeSwap(quote, strategy, job.data.params.walletAddress as string);
        transactionSignature = result.signature;
        swapSuccess = result.success;
        swapError = result.error;
      } else {
        // Simulation mode - no actual execution
        console.log(`[DCAAgent] Simulation mode - swap would execute for strategy ${strategy.strategyId}`);
        transactionSignature = `sim_${executionId}`;
      }

      // Get execution price
      const executionPrice = await this.getExecutionPrice(dcaConfig.tokenPair.to, dcaConfig.tokenPair.from);

      // Create execution record
      const execution: StrategyExecution = {
        executionId,
        strategyId: strategy.strategyId,
        startedAt: startTime,
        completedAt: Date.now(),
        success: swapSuccess,
        error: swapError,
        transactionSignature,
        amountExecuted: dcaConfig.amountPerExecution,
        executionPrice,
        feesPaid: this.estimateFees(quote),
        actualSlippage: priceImpact / 100,
        triggeredBy: job.data.conditionId,
      };

      return {
        success: swapSuccess,
        execution,
        transactionSignature,
        metadata: {
          quote: {
            inputAmount: dcaConfig.amountPerExecution,
            outputAmount,
            priceImpact,
          },
        },
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error(`[DCAAgent] Execution failed:`, error);

      return {
        success: false,
        error: errorMessage,
        execution: this.createExecution(executionId, strategy.strategyId, startTime, false, errorMessage),
      };
    }
  }

  /**
   * Execute DCA with encrypted balance via Inco/ZK path
   *
   * Uses the executeEncryptedDCA callback if set, otherwise simulates
   * encrypted execution for development/testing.
   *
   * @returns ExecutionJobResult if successful, null if should fall back to standard path
   */
  private async executeWithEncryptedBalance(
    strategy: Strategy,
    executionId: string,
    startTime: number
  ): Promise<ExecutionJobResult | null> {
    try {
      // Convert to encrypted strategy format
      const encryptedStrategy = this.toEncryptedStrategy(strategy);
      if (!encryptedStrategy) {
        return null;
      }

      // Check if strategy has required encrypted balance handle
      if (!encryptedStrategy.encryptedBalanceHandle) {
        console.log(`[DCAAgent] Strategy ${strategy.strategyId} missing encrypted balance handle`);
        return null;
      }

      const dcaConfig = strategy.config as DCAConfig;
      let dcaResult: DCAResult;

      // Use callback if available, otherwise simulate
      if (this.executeEncryptedDCA) {
        console.log(`[DCAAgent] Executing DCA via encrypted callback for strategy ${strategy.strategyId}`);
        dcaResult = await this.executeEncryptedDCA(encryptedStrategy);
      } else {
        // Simulate encrypted execution for development
        console.log(`[DCAAgent] Simulating encrypted DCA for strategy ${strategy.strategyId}`);
        dcaResult = await this.simulateEncryptedDCA(encryptedStrategy);
      }

      // Create execution record
      const execution: StrategyExecution = {
        executionId,
        strategyId: strategy.strategyId,
        startedAt: startTime,
        completedAt: Date.now(),
        success: dcaResult.success,
        error: dcaResult.error,
        transactionSignature: dcaResult.attestation?.quote || `encrypted-${dcaResult.path}-${executionId}`,
        amountExecuted: dcaResult.executedAmount || dcaConfig.amountPerExecution,
        executionPrice: dcaResult.executionPrice,
      };

      const result: ExecutionJobResult = {
        success: dcaResult.success,
        execution,
        transactionSignature: dcaResult.attestation?.quote,
        metadata: {
          encryptedExecution: true,
          path: dcaResult.path,
          attestation: dcaResult.attestation,
          newHandle: dcaResult.newHandle,
          newEpoch: dcaResult.newEpoch,
          responseTimeMs: dcaResult.responseTimeMs,
        },
      };

      if (!dcaResult.success) {
        result.error = dcaResult.error;
      }

      console.log(
        `[DCAAgent] Encrypted DCA execution ${dcaResult.success ? 'succeeded' : 'failed'} ` +
        `via ${dcaResult.path} path in ${dcaResult.responseTimeMs}ms`
      );

      return result;
    } catch (error) {
      console.error(`[DCAAgent] Encrypted execution error:`, error);

      // Return error result rather than falling back
      const execution: StrategyExecution = {
        executionId,
        strategyId: strategy.strategyId,
        startedAt: startTime,
        completedAt: Date.now(),
        success: false,
        error: error instanceof Error ? error.message : 'Encrypted execution failed',
      };

      return {
        success: false,
        error: error instanceof Error ? error.message : 'Encrypted execution failed',
        execution,
        metadata: {
          encryptedExecution: true,
          path: 'unknown',
        },
      };
    }
  }

  /**
   * Simulate encrypted DCA execution for development
   *
   * This simulates the Inco TEE path with realistic latency.
   * In production, use setExecuteEncryptedDCA to provide real implementation.
   */
  private async simulateEncryptedDCA(strategy: EncryptedStrategy): Promise<DCAResult> {
    const startTime = Date.now();

    try {
      // Simulate Inco TEE latency (5-50ms)
      const simulatedDelay = 5 + Math.random() * 45;
      await new Promise(resolve => setTimeout(resolve, simulatedDelay));

      const dcaAmount = strategy.config.amountPerExecution || 0;

      return {
        success: true,
        path: 'inco',
        newHandle: `sim-handle-${Date.now().toString(16)}`,
        newEpoch: Math.floor(Date.now() / (60 * 60 * 1000)),
        attestation: {
          quote: `sim-sgx-quote-dca-${Date.now().toString(16)}`,
          timestamp: Date.now(),
          verified: true,
          operation: 'e_dca_execute',
        },
        responseTimeMs: Date.now() - startTime,
        executedAmount: dcaAmount,
        inputAmount: dcaAmount,
      };
    } catch (error) {
      return {
        success: false,
        path: 'inco',
        responseTimeMs: Date.now() - startTime,
        error: error instanceof Error ? error.message : 'Simulation failed',
      };
    }
  }

  // ==========================================================================
  // Jupiter Integration
  // ==========================================================================

  /**
   * Get a quote from Jupiter
   */
  private async getJupiterQuote(
    inputMint: string,
    outputMint: string,
    amount: number,
    slippageBps: number
  ): Promise<JupiterQuoteResponse | null> {
    try {
      const url = new URL(`${this.config.jupiterSwapApiUrl}/quote`);
      url.searchParams.set('inputMint', inputMint);
      url.searchParams.set('outputMint', outputMint);
      url.searchParams.set('amount', amount.toString());
      url.searchParams.set('slippageBps', Math.min(slippageBps, this.config.maxSlippageBps).toString());
      url.searchParams.set('swapMode', 'ExactIn');

      const response = await this.fetchWithTimeout(url.toString());
      const data = await response.json();

      return data as JupiterQuoteResponse;
    } catch (error) {
      console.error('[DCAAgent] Failed to get Jupiter quote:', error);
      return null;
    }
  }

  /**
   * Get swap transaction from Jupiter
   */
  async getSwapTransaction(
    quote: JupiterQuoteResponse,
    userPublicKey: string
  ): Promise<JupiterSwapResponse | null> {
    try {
      const response = await this.fetchWithTimeout(`${this.config.jupiterSwapApiUrl}/swap`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          quoteResponse: quote,
          userPublicKey,
          wrapAndUnwrapSol: true,
          useVersionedTransaction: this.config.useVersionedTransactions,
          prioritizationFeeLamports: this.config.priorityFeeLamports,
        }),
      });

      const data = await response.json();
      return data as JupiterSwapResponse;
    } catch (error) {
      console.error('[DCAAgent] Failed to get swap transaction:', error);
      return null;
    }
  }

  // ==========================================================================
  // Execution Limits
  // ==========================================================================

  /**
   * Check if execution should proceed based on limits
   */
  private checkExecutionLimits(
    strategy: Strategy,
    config: DCAConfig
  ): { canExecute: boolean; reason?: string } {
    // Check max total amount
    if (config.maxTotalAmount) {
      const totalExecuted = strategy.totalAmountExecuted;
      if (totalExecuted >= config.maxTotalAmount) {
        return {
          canExecute: false,
          reason: `Max total amount reached: ${totalExecuted}/${config.maxTotalAmount}`,
        };
      }
    }

    // Check max executions
    if (config.maxExecutions) {
      if (strategy.totalExecutions >= config.maxExecutions) {
        return {
          canExecute: false,
          reason: `Max executions reached: ${strategy.totalExecutions}/${config.maxExecutions}`,
        };
      }
    }

    // Check end date
    if (config.endDate) {
      if (Date.now() > config.endDate) {
        return {
          canExecute: false,
          reason: `End date passed: ${new Date(config.endDate).toISOString()}`,
        };
      }
    }

    return { canExecute: true };
  }

  // ==========================================================================
  // Helper Methods
  // ==========================================================================

  private getTokenMint(symbol: string): string | undefined {
    return TOKEN_MINTS[symbol.toUpperCase()];
  }

  private getTokenDecimals(symbol: string): number {
    return TOKEN_DECIMALS[symbol.toUpperCase()] || 9;
  }

  private async getExecutionPrice(
    baseToken: string,
    quoteToken: string
  ): Promise<number | undefined> {
    try {
      const price = await this.priceMonitor.getPrice(baseToken, 'USD');
      return price.price;
    } catch {
      return undefined;
    }
  }

  private estimateFees(quote: JupiterQuoteResponse): number {
    // Estimate fees from route plan
    let totalFees = 0;
    for (const route of quote.routePlan) {
      if (route.swapInfo.feeAmount) {
        totalFees += parseInt(route.swapInfo.feeAmount);
      }
    }
    // Convert to rough USD estimate (assuming SOL fee token)
    return totalFees / 1e9 * 150; // Rough SOL price estimate
  }

  private createExecution(
    executionId: string,
    strategyId: string,
    startTime: number,
    success: boolean,
    error?: string
  ): StrategyExecution {
    return {
      executionId,
      strategyId,
      startedAt: startTime,
      completedAt: Date.now(),
      success,
      error,
    };
  }

  private async fetchWithTimeout(
    url: string,
    options: RequestInit = {}
  ): Promise<Response> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.config.requestTimeoutMs);

    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      return response;
    } finally {
      clearTimeout(timeout);
    }
  }

  // ==========================================================================
  // Callbacks
  // ==========================================================================

  /**
   * Set the swap execution callback
   */
  setExecuteSwap(
    callback: (
      quote: JupiterQuoteResponse,
      strategy: Strategy,
      userWallet: string
    ) => Promise<{ signature: string; success: boolean; error?: string }>
  ): void {
    this.executeSwap = callback;
  }

  // ==========================================================================
  // Utility Methods
  // ==========================================================================

  /**
   * Calculate frequency in milliseconds
   */
  static frequencyToMs(frequency: DCAConfig['frequency']): number {
    switch (frequency) {
      case 'hourly':
        return 60 * 60 * 1000;
      case 'daily':
        return 24 * 60 * 60 * 1000;
      case 'weekly':
        return 7 * 24 * 60 * 60 * 1000;
      case 'monthly':
        return 30 * 24 * 60 * 60 * 1000;
      default:
        return 24 * 60 * 60 * 1000;
    }
  }

  /**
   * Calculate cron expression for frequency
   */
  static frequencyToCron(frequency: DCAConfig['frequency']): string {
    switch (frequency) {
      case 'hourly':
        return '0 * * * *'; // Every hour at minute 0
      case 'daily':
        return '0 9 * * *'; // Every day at 9 AM
      case 'weekly':
        return '0 9 * * 1'; // Every Monday at 9 AM
      case 'monthly':
        return '0 9 1 * *'; // First of month at 9 AM
      default:
        return '0 9 * * *';
    }
  }

  /**
   * Estimate total cost for a DCA strategy
   */
  static estimateTotalCost(config: DCAConfig): {
    minCost: number;
    maxCost: number;
    estimatedExecutions: number;
  } {
    let estimatedExecutions = 0;

    if (config.maxExecutions) {
      estimatedExecutions = config.maxExecutions;
    } else if (config.maxTotalAmount) {
      estimatedExecutions = Math.ceil(config.maxTotalAmount / config.amountPerExecution);
    } else if (config.endDate) {
      const durationMs = config.endDate - Date.now();
      const frequencyMs = this.frequencyToMs(config.frequency);
      estimatedExecutions = Math.ceil(durationMs / frequencyMs);
    } else {
      estimatedExecutions = 52; // Default to 1 year weekly
    }

    const totalAmount = estimatedExecutions * config.amountPerExecution;

    return {
      minCost: totalAmount,
      maxCost: totalAmount * (1 + (config.slippageTolerance || 0.01)),
      estimatedExecutions,
    };
  }
}

// ============================================================================
// Singleton Factory
// ============================================================================

let dcaAgentInstance: DCAAgent | null = null;

export function getDCAAgent(config?: Partial<DCAAgentConfig>): DCAAgent {
  if (!dcaAgentInstance) {
    dcaAgentInstance = new DCAAgent(config);
  }
  return dcaAgentInstance;
}

export function resetDCAAgent(): void {
  dcaAgentInstance = null;
}
