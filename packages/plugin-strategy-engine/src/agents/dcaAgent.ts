/**
 * DCA Agent
 *
 * Executes Dollar-Cost Averaging strategies by performing
 * scheduled token swaps via Jupiter aggregator.
 */

import { v4 as uuidv4 } from 'uuid';
import type { Job } from 'bullmq';
import type { Strategy, StrategyExecution, DCAConfig } from '../types/strategy.js';
import type { ExecutionJobData, ExecutionJobResult, ExecutionHandler } from '../services/executionQueue.js';
import { PriceMonitor, getPriceMonitor } from '../services/priceMonitor.js';

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

  // Callbacks for integration with external execution
  private executeSwap?: (
    quote: JupiterQuoteResponse,
    strategy: Strategy,
    userWallet: string
  ) => Promise<{ signature: string; success: boolean; error?: string }>;

  constructor(config: Partial<DCAAgentConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.priceMonitor = getPriceMonitor();
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

      // Get token mints
      const inputMint = this.getTokenMint(dcaConfig.tokenPair.from);
      const outputMint = this.getTokenMint(dcaConfig.tokenPair.to);

      if (!inputMint || !outputMint) {
        throw new Error(`Unknown token: ${dcaConfig.tokenPair.from} or ${dcaConfig.tokenPair.to}`);
      }

      // Calculate input amount in smallest units
      const inputDecimals = this.getTokenDecimals(dcaConfig.tokenPair.from);
      const inputAmount = Math.floor(dcaConfig.amountPerExecution * Math.pow(10, inputDecimals));

      // Check execution limits
      const limitCheck = this.checkExecutionLimits(strategy, dcaConfig);
      if (!limitCheck.canExecute) {
        return {
          success: false,
          error: limitCheck.reason,
          execution: this.createExecution(executionId, strategy.strategyId, startTime, false, limitCheck.reason),
        };
      }

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
