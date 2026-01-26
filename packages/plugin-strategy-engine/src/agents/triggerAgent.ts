/**
 * Trigger Agent
 *
 * Handles price-triggered executions for stop-loss and take-profit strategies.
 * Executes token swaps when price conditions are met.
 */

import { v4 as uuidv4 } from 'uuid';
import type { Job } from 'bullmq';
import type { Strategy, StrategyExecution, StopLossConfig, TakeProfitConfig } from '../types/strategy.js';
import type { ExecutionJobData, ExecutionJobResult, ExecutionHandler } from '../services/executionQueue.js';
import { PriceMonitor, getPriceMonitor } from '../services/priceMonitor.js';

// ============================================================================
// Configuration
// ============================================================================

export interface TriggerAgentConfig {
  /** Jupiter Swap API URL */
  jupiterSwapApiUrl: string;
  /** Default slippage tolerance for stop-loss (higher for urgency) */
  stopLossSlippageBps: number;
  /** Default slippage tolerance for take-profit */
  takeProfitSlippageBps: number;
  /** Maximum slippage tolerance */
  maxSlippageBps: number;
  /** Request timeout in milliseconds */
  requestTimeoutMs: number;
  /** Priority fee for stop-loss (higher for faster execution) */
  stopLossPriorityFeeLamports: number;
  /** Priority fee for take-profit */
  takeProfitPriorityFeeLamports: number;
}

const DEFAULT_CONFIG: TriggerAgentConfig = {
  jupiterSwapApiUrl: process.env.JUPITER_SWAP_API_URL || 'https://quote-api.jup.ag/v6',
  stopLossSlippageBps: 100, // 1% for stop-loss (needs to execute fast)
  takeProfitSlippageBps: 50, // 0.5% for take-profit
  maxSlippageBps: 500, // 5%
  requestTimeoutMs: 30000,
  stopLossPriorityFeeLamports: 50000, // Higher priority for stop-loss
  takeProfitPriorityFeeLamports: 10000,
};

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
// Jupiter Types
// ============================================================================

interface JupiterQuoteResponse {
  inputMint: string;
  inAmount: string;
  outputMint: string;
  outAmount: string;
  otherAmountThreshold: string;
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

// ============================================================================
// Trigger Agent Class
// ============================================================================

export class TriggerAgent {
  private config: TriggerAgentConfig;
  private priceMonitor: PriceMonitor;

  // Callbacks for external execution
  private executeSwap?: (
    quote: JupiterQuoteResponse,
    strategy: Strategy,
    userWallet: string
  ) => Promise<{ signature: string; success: boolean; error?: string }>;

  private getBalance?: (
    token: string,
    walletAddress: string
  ) => Promise<number>;

  constructor(config: Partial<TriggerAgentConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.priceMonitor = getPriceMonitor();
  }

  // ==========================================================================
  // Execution Handlers
  // ==========================================================================

  /**
   * Get the stop-loss execution handler
   */
  getStopLossHandler(): ExecutionHandler {
    return async (job: Job<ExecutionJobData>, strategy: Strategy): Promise<ExecutionJobResult> => {
      return this.executeStopLoss(job, strategy);
    };
  }

  /**
   * Get the take-profit execution handler
   */
  getTakeProfitHandler(): ExecutionHandler {
    return async (job: Job<ExecutionJobData>, strategy: Strategy): Promise<ExecutionJobResult> => {
      return this.executeTakeProfit(job, strategy);
    };
  }

  // ==========================================================================
  // Stop-Loss Execution
  // ==========================================================================

  /**
   * Execute a stop-loss order
   */
  async executeStopLoss(
    job: Job<ExecutionJobData>,
    strategy: Strategy
  ): Promise<ExecutionJobResult> {
    const startTime = Date.now();
    const executionId = `exec_${uuidv4()}`;

    try {
      const config = strategy.config as StopLossConfig;
      const triggerPrice = job.data.params.triggerPrice as number;

      console.log(
        `[TriggerAgent] Executing stop-loss for ${config.token} at price ${triggerPrice} (trigger: ${config.triggerPrice})`
      );

      // Get current balance
      const balance = await this.getTokenBalance(config.token, job.data.params.walletAddress as string);

      if (!balance || balance <= 0) {
        return {
          success: false,
          error: `No ${config.token} balance found`,
          execution: this.createExecution(executionId, strategy.strategyId, startTime, false, 'No balance'),
        };
      }

      // Calculate amount to sell
      const amountToSell = this.calculateAmountToSell(balance, config);

      if (amountToSell <= 0) {
        return {
          success: false,
          error: 'Amount to sell is zero',
          execution: this.createExecution(executionId, strategy.strategyId, startTime, false, 'Zero amount'),
        };
      }

      // Get token mints
      const inputMint = this.getTokenMint(config.token);
      const outputMint = this.getTokenMint('USDC'); // Default to USDC for stop-loss

      if (!inputMint) {
        throw new Error(`Unknown token: ${config.token}`);
      }

      // Calculate amount in smallest units
      const decimals = this.getTokenDecimals(config.token);
      const amountInSmallestUnits = Math.floor(amountToSell * Math.pow(10, decimals));

      // Get quote with higher slippage for stop-loss urgency
      const slippageBps = Math.floor((config.slippageTolerance || 0.02) * 10000);
      const quote = await this.getJupiterQuote(
        inputMint,
        outputMint!,
        amountInSmallestUnits,
        Math.max(slippageBps, this.config.stopLossSlippageBps)
      );

      if (!quote) {
        throw new Error('Failed to get Jupiter quote');
      }

      // Check minimum price if set
      if (config.minimumPrice) {
        const effectivePrice = this.calculateEffectivePrice(quote, config.token, 'USDC');
        if (effectivePrice < config.minimumPrice) {
          return {
            success: false,
            error: `Price ${effectivePrice} below minimum ${config.minimumPrice}`,
            execution: this.createExecution(
              executionId,
              strategy.strategyId,
              startTime,
              false,
              'Below minimum price'
            ),
          };
        }
      }

      // Execute swap
      const result = await this.performSwap(quote, strategy, job.data.params.walletAddress as string);

      // Create execution record
      const execution: StrategyExecution = {
        executionId,
        strategyId: strategy.strategyId,
        startedAt: startTime,
        completedAt: Date.now(),
        success: result.success,
        error: result.error,
        transactionSignature: result.signature,
        amountExecuted: amountToSell,
        executionPrice: triggerPrice,
        feesPaid: this.estimateFees(quote),
        actualSlippage: parseFloat(quote.priceImpactPct) / 100,
        triggeredBy: job.data.conditionId,
      };

      return {
        success: result.success,
        execution,
        transactionSignature: result.signature,
        metadata: {
          type: 'stop_loss',
          triggerPrice: config.triggerPrice,
          actualPrice: triggerPrice,
          amountSold: amountToSell,
          priceImpact: quote.priceImpactPct,
        },
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error(`[TriggerAgent] Stop-loss execution failed:`, error);

      return {
        success: false,
        error: errorMessage,
        execution: this.createExecution(executionId, strategy.strategyId, startTime, false, errorMessage),
      };
    }
  }

  // ==========================================================================
  // Take-Profit Execution
  // ==========================================================================

  /**
   * Execute a take-profit order
   */
  async executeTakeProfit(
    job: Job<ExecutionJobData>,
    strategy: Strategy
  ): Promise<ExecutionJobResult> {
    const startTime = Date.now();
    const executionId = `exec_${uuidv4()}`;

    try {
      const config = strategy.config as TakeProfitConfig;
      const triggerPrice = job.data.params.triggerPrice as number;

      console.log(
        `[TriggerAgent] Executing take-profit for ${config.token} at price ${triggerPrice} (trigger: ${config.triggerPrice})`
      );

      // Check for scaled take-profit
      if (config.scaled?.enabled && config.scaled.levels) {
        return this.executeScaledTakeProfit(job, strategy, config, triggerPrice, executionId, startTime);
      }

      // Get current balance
      const balance = await this.getTokenBalance(config.token, job.data.params.walletAddress as string);

      if (!balance || balance <= 0) {
        return {
          success: false,
          error: `No ${config.token} balance found`,
          execution: this.createExecution(executionId, strategy.strategyId, startTime, false, 'No balance'),
        };
      }

      // Calculate amount to sell
      const amountToSell = this.calculateTakeProfitAmount(balance, config);

      if (amountToSell <= 0) {
        return {
          success: false,
          error: 'Amount to sell is zero',
          execution: this.createExecution(executionId, strategy.strategyId, startTime, false, 'Zero amount'),
        };
      }

      // Get token mints
      const inputMint = this.getTokenMint(config.token);
      const outputMint = this.getTokenMint('USDC');

      if (!inputMint) {
        throw new Error(`Unknown token: ${config.token}`);
      }

      // Calculate amount in smallest units
      const decimals = this.getTokenDecimals(config.token);
      const amountInSmallestUnits = Math.floor(amountToSell * Math.pow(10, decimals));

      // Get quote
      const slippageBps = Math.floor((config.slippageTolerance || 0.01) * 10000);
      const quote = await this.getJupiterQuote(
        inputMint,
        outputMint!,
        amountInSmallestUnits,
        Math.max(slippageBps, this.config.takeProfitSlippageBps)
      );

      if (!quote) {
        throw new Error('Failed to get Jupiter quote');
      }

      // Execute swap
      const result = await this.performSwap(quote, strategy, job.data.params.walletAddress as string);

      // Calculate profit
      const outputAmount = parseInt(quote.outAmount) / Math.pow(10, 6); // USDC decimals

      // Create execution record
      const execution: StrategyExecution = {
        executionId,
        strategyId: strategy.strategyId,
        startedAt: startTime,
        completedAt: Date.now(),
        success: result.success,
        error: result.error,
        transactionSignature: result.signature,
        amountExecuted: amountToSell,
        executionPrice: triggerPrice,
        feesPaid: this.estimateFees(quote),
        actualSlippage: parseFloat(quote.priceImpactPct) / 100,
        triggeredBy: job.data.conditionId,
      };

      return {
        success: result.success,
        execution,
        transactionSignature: result.signature,
        metadata: {
          type: 'take_profit',
          triggerPrice: config.triggerPrice,
          actualPrice: triggerPrice,
          amountSold: amountToSell,
          outputAmount,
          priceImpact: quote.priceImpactPct,
        },
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error(`[TriggerAgent] Take-profit execution failed:`, error);

      return {
        success: false,
        error: errorMessage,
        execution: this.createExecution(executionId, strategy.strategyId, startTime, false, errorMessage),
      };
    }
  }

  /**
   * Execute scaled take-profit (multiple levels)
   */
  private async executeScaledTakeProfit(
    job: Job<ExecutionJobData>,
    strategy: Strategy,
    config: TakeProfitConfig,
    triggerPrice: number,
    executionId: string,
    startTime: number
  ): Promise<ExecutionJobResult> {
    // Find the level that triggered
    const triggeredLevel = config.scaled!.levels.find((level) => triggerPrice >= level.price);

    if (!triggeredLevel) {
      return {
        success: false,
        error: 'No matching scaled level found',
        execution: this.createExecution(executionId, strategy.strategyId, startTime, false, 'No level matched'),
      };
    }

    // Get balance and calculate amount for this level
    const balance = await this.getTokenBalance(config.token, job.data.params.walletAddress as string);
    if (!balance) {
      return {
        success: false,
        error: `No ${config.token} balance found`,
        execution: this.createExecution(executionId, strategy.strategyId, startTime, false, 'No balance'),
      };
    }

    const amountToSell = (balance * triggeredLevel.sellPercentage) / 100;

    console.log(
      `[TriggerAgent] Scaled take-profit: selling ${triggeredLevel.sellPercentage}% (${amountToSell} ${config.token}) at level ${triggeredLevel.price}`
    );

    // Get quote and execute
    const inputMint = this.getTokenMint(config.token)!;
    const outputMint = this.getTokenMint('USDC')!;
    const decimals = this.getTokenDecimals(config.token);
    const amountInSmallestUnits = Math.floor(amountToSell * Math.pow(10, decimals));

    const quote = await this.getJupiterQuote(
      inputMint,
      outputMint,
      amountInSmallestUnits,
      this.config.takeProfitSlippageBps
    );

    if (!quote) {
      throw new Error('Failed to get Jupiter quote');
    }

    const result = await this.performSwap(quote, strategy, job.data.params.walletAddress as string);

    const execution: StrategyExecution = {
      executionId,
      strategyId: strategy.strategyId,
      startedAt: startTime,
      completedAt: Date.now(),
      success: result.success,
      error: result.error,
      transactionSignature: result.signature,
      amountExecuted: amountToSell,
      executionPrice: triggerPrice,
      feesPaid: this.estimateFees(quote),
      actualSlippage: parseFloat(quote.priceImpactPct) / 100,
      triggeredBy: job.data.conditionId,
    };

    return {
      success: result.success,
      execution,
      transactionSignature: result.signature,
      metadata: {
        type: 'scaled_take_profit',
        level: triggeredLevel,
        triggerPrice,
        amountSold: amountToSell,
      },
    };
  }

  // ==========================================================================
  // Jupiter Integration
  // ==========================================================================

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
      return await response.json() as JupiterQuoteResponse;
    } catch (error) {
      console.error('[TriggerAgent] Failed to get Jupiter quote:', error);
      return null;
    }
  }

  private async performSwap(
    quote: JupiterQuoteResponse,
    strategy: Strategy,
    walletAddress: string
  ): Promise<{ signature: string; success: boolean; error?: string }> {
    if (this.executeSwap) {
      return this.executeSwap(quote, strategy, walletAddress);
    }

    // Simulation mode
    console.log(`[TriggerAgent] Simulation mode - swap would execute`);
    return {
      signature: `sim_${Date.now()}`,
      success: true,
    };
  }

  // ==========================================================================
  // Helper Methods
  // ==========================================================================

  private calculateAmountToSell(balance: number, config: StopLossConfig): number {
    switch (config.amountToSell) {
      case 'all':
        return balance;
      case 'percentage':
        return (balance * config.amount) / 100;
      case 'fixed':
        return Math.min(config.amount, balance);
      default:
        return balance;
    }
  }

  private calculateTakeProfitAmount(balance: number, config: TakeProfitConfig): number {
    switch (config.amountToSell) {
      case 'all':
        return balance;
      case 'percentage':
        return (balance * config.amount) / 100;
      case 'fixed':
        return Math.min(config.amount, balance);
      default:
        return balance;
    }
  }

  private calculateEffectivePrice(
    quote: JupiterQuoteResponse,
    inputToken: string,
    outputToken: string
  ): number {
    const inputDecimals = this.getTokenDecimals(inputToken);
    const outputDecimals = this.getTokenDecimals(outputToken);

    const inputAmount = parseInt(quote.inAmount) / Math.pow(10, inputDecimals);
    const outputAmount = parseInt(quote.outAmount) / Math.pow(10, outputDecimals);

    return outputAmount / inputAmount;
  }

  private async getTokenBalance(token: string, walletAddress: string): Promise<number | null> {
    if (this.getBalance) {
      return this.getBalance(token, walletAddress);
    }

    // Simulation mode - return mock balance
    console.log(`[TriggerAgent] Simulation mode - returning mock balance for ${token}`);
    return 100;
  }

  private getTokenMint(symbol: string): string | undefined {
    return TOKEN_MINTS[symbol.toUpperCase()];
  }

  private getTokenDecimals(symbol: string): number {
    return TOKEN_DECIMALS[symbol.toUpperCase()] || 9;
  }

  private estimateFees(quote: JupiterQuoteResponse): number {
    let totalFees = 0;
    for (const route of quote.routePlan) {
      if (route.swapInfo.feeAmount) {
        totalFees += parseInt(route.swapInfo.feeAmount);
      }
    }
    return totalFees / 1e9 * 150; // Rough USD estimate
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

  private async fetchWithTimeout(url: string, options: RequestInit = {}): Promise<Response> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.config.requestTimeoutMs);

    try {
      const response = await fetch(url, { ...options, signal: controller.signal });
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

  setExecuteSwap(
    callback: (
      quote: JupiterQuoteResponse,
      strategy: Strategy,
      userWallet: string
    ) => Promise<{ signature: string; success: boolean; error?: string }>
  ): void {
    this.executeSwap = callback;
  }

  setGetBalance(callback: (token: string, walletAddress: string) => Promise<number>): void {
    this.getBalance = callback;
  }
}

// ============================================================================
// Singleton Factory
// ============================================================================

let triggerAgentInstance: TriggerAgent | null = null;

export function getTriggerAgent(config?: Partial<TriggerAgentConfig>): TriggerAgent {
  if (!triggerAgentInstance) {
    triggerAgentInstance = new TriggerAgent(config);
  }
  return triggerAgentInstance;
}

export function resetTriggerAgent(): void {
  triggerAgentInstance = null;
}
