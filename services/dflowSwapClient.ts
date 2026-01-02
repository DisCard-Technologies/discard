/**
 * DisCard 2035 - DFlow Swap Client
 *
 * Integration with DFlow Swap API for:
 * - Cross-token transfers (e.g., send USDC when you have SOL)
 * - Efficient routing for small amounts (no minimums)
 * - Market maker liquidity aggregation
 *
 * API Base: https://swap-api.dflow.net/solana
 */

import { PublicKey, Transaction, TransactionInstruction } from "@solana/web3.js";

// ============================================================================
// Types
// ============================================================================

export interface SwapQuote {
  /** Input token mint */
  inputMint: string;
  /** Output token mint */
  outputMint: string;
  /** Input amount in base units */
  inputAmount: string;
  /** Output amount in base units */
  outputAmount: string;
  /** Output amount with slippage applied */
  minOutputAmount: string;
  /** Price impact percentage */
  priceImpact: number;
  /** Route info */
  route: SwapRoute[];
  /** Quote expiry timestamp */
  expiresAt: number;
  /** Quote ID for executing swap */
  quoteId: string;
}

export interface SwapRoute {
  /** AMM/DEX name */
  amm: string;
  /** Percentage of trade through this route */
  percent: number;
  /** Input mint for this leg */
  inputMint: string;
  /** Output mint for this leg */
  outputMint: string;
}

export interface SwapInstructions {
  /** Setup instructions (create ATAs, etc.) */
  setupInstructions: TransactionInstruction[];
  /** Main swap instruction */
  swapInstruction: TransactionInstruction;
  /** Cleanup instructions (close wrapped SOL, etc.) */
  cleanupInstructions: TransactionInstruction[];
  /** Address lookup tables for v0 transactions */
  addressLookupTableAddresses: string[];
}

export interface DFlowConfig {
  /** API base URL */
  baseUrl?: string;
  /** Default slippage in basis points (100 = 1%) */
  defaultSlippageBps?: number;
  /** Enable debug logging */
  debug?: boolean;
}

// ============================================================================
// Constants
// ============================================================================

const DFLOW_API_BASE = "https://swap-api.dflow.net/solana";
const DEFAULT_SLIPPAGE_BPS = 50; // 0.5%

/** Common token mints */
export const MINTS = {
  SOL: "So11111111111111111111111111111111111111112",
  USDC: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
  USDT: "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB",
  BONK: "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263",
  JUP: "JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN",
};

// ============================================================================
// DFlow Swap Client
// ============================================================================

export class DFlowSwapClient {
  private baseUrl: string;
  private defaultSlippageBps: number;
  private debug: boolean;

  constructor(config: DFlowConfig = {}) {
    this.baseUrl = config.baseUrl ?? DFLOW_API_BASE;
    this.defaultSlippageBps = config.defaultSlippageBps ?? DEFAULT_SLIPPAGE_BPS;
    this.debug = config.debug ?? false;
  }

  /**
   * Get a swap quote
   */
  async getQuote(params: {
    inputMint: string;
    outputMint: string;
    amount: string;
    slippageBps?: number;
  }): Promise<SwapQuote> {
    const { inputMint, outputMint, amount, slippageBps } = params;

    const queryParams = new URLSearchParams({
      inputMint,
      outputMint,
      amount,
      slippageBps: (slippageBps ?? this.defaultSlippageBps).toString(),
    });

    const response = await this.fetch(`/quote?${queryParams}`);

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to get quote: ${error}`);
    }

    const data = await response.json();

    return {
      inputMint: data.inputMint,
      outputMint: data.outputMint,
      inputAmount: data.inputAmount,
      outputAmount: data.outputAmount,
      minOutputAmount: data.minOutputAmount,
      priceImpact: data.priceImpact ?? 0,
      route: data.route ?? [],
      expiresAt: data.expiresAt ?? Date.now() + 30000,
      quoteId: data.quoteId,
    };
  }

  /**
   * Get swap instructions to build a transaction
   */
  async getSwapInstructions(params: {
    quoteId: string;
    userPublicKey: string;
  }): Promise<SwapInstructions> {
    const response = await this.fetch("/swap-instructions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        quoteId: params.quoteId,
        userPublicKey: params.userPublicKey,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to get swap instructions: ${error}`);
    }

    const data = await response.json();

    // Parse instructions from response
    return {
      setupInstructions: this.parseInstructions(data.setupInstructions ?? []),
      swapInstruction: this.parseInstruction(data.swapInstruction),
      cleanupInstructions: this.parseInstructions(data.cleanupInstructions ?? []),
      addressLookupTableAddresses: data.addressLookupTableAddresses ?? [],
    };
  }

  /**
   * Execute a swap with transfer to recipient
   * Combines swap + transfer in single transaction
   */
  async buildSwapAndTransfer(params: {
    inputMint: string;
    outputMint: string;
    inputAmount: string;
    recipientAddress: string;
    userPublicKey: string;
    slippageBps?: number;
  }): Promise<{
    quote: SwapQuote;
    instructions: SwapInstructions;
    estimatedOutput: string;
  }> {
    // Get quote first
    const quote = await this.getQuote({
      inputMint: params.inputMint,
      outputMint: params.outputMint,
      amount: params.inputAmount,
      slippageBps: params.slippageBps,
    });

    // Get swap instructions
    const instructions = await this.getSwapInstructions({
      quoteId: quote.quoteId,
      userPublicKey: params.userPublicKey,
    });

    return {
      quote,
      instructions,
      estimatedOutput: quote.outputAmount,
    };
  }

  /**
   * Check if a direct swap is available
   */
  async isSwapAvailable(
    inputMint: string,
    outputMint: string
  ): Promise<boolean> {
    try {
      // Try to get a minimal quote
      await this.getQuote({
        inputMint,
        outputMint,
        amount: "1000", // Minimal amount
      });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get best route for a swap
   */
  async getBestRoute(
    inputMint: string,
    outputMint: string,
    amount: string
  ): Promise<SwapRoute[]> {
    const quote = await this.getQuote({
      inputMint,
      outputMint,
      amount,
    });
    return quote.route;
  }

  // ==========================================================================
  // Helpers
  // ==========================================================================

  private async fetch(
    path: string,
    options?: RequestInit
  ): Promise<Response> {
    const url = `${this.baseUrl}${path}`;

    if (this.debug) {
      console.log(`[DFlow] ${options?.method ?? "GET"} ${url}`);
    }

    const response = await fetch(url, {
      ...options,
      headers: {
        Accept: "application/json",
        ...options?.headers,
      },
    });

    if (this.debug) {
      console.log(`[DFlow] Response: ${response.status}`);
    }

    return response;
  }

  private parseInstruction(data: {
    programId: string;
    accounts: { pubkey: string; isSigner: boolean; isWritable: boolean }[];
    data: string;
  }): TransactionInstruction {
    return new TransactionInstruction({
      programId: new PublicKey(data.programId),
      keys: data.accounts.map((acc) => ({
        pubkey: new PublicKey(acc.pubkey),
        isSigner: acc.isSigner,
        isWritable: acc.isWritable,
      })),
      data: Buffer.from(data.data, "base64"),
    });
  }

  private parseInstructions(
    data: Parameters<typeof this.parseInstruction>[0][]
  ): TransactionInstruction[] {
    return data.map((ix) => this.parseInstruction(ix));
  }
}

// ============================================================================
// Singleton Access
// ============================================================================

let dflowClientInstance: DFlowSwapClient | null = null;

export function getDFlowClient(config?: DFlowConfig): DFlowSwapClient {
  if (!dflowClientInstance) {
    dflowClientInstance = new DFlowSwapClient(config);
  }
  return dflowClientInstance;
}

export function initializeDFlowClient(config: DFlowConfig): DFlowSwapClient {
  dflowClientInstance = new DFlowSwapClient(config);
  return dflowClientInstance;
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Convert token amount to base units
 */
export function toBaseUnits(amount: number, decimals: number): string {
  return Math.floor(amount * 10 ** decimals).toString();
}

/**
 * Convert base units to token amount
 */
export function fromBaseUnits(amount: string, decimals: number): number {
  return parseInt(amount) / 10 ** decimals;
}

/**
 * Calculate minimum output with slippage
 */
export function applySlippage(
  amount: string,
  slippageBps: number
): string {
  const amountNum = BigInt(amount);
  const slippageFactor = BigInt(10000 - slippageBps);
  return ((amountNum * slippageFactor) / BigInt(10000)).toString();
}

/**
 * Check if two mints are the same (handles wrapped SOL)
 */
export function isSameMint(mint1: string, mint2: string): boolean {
  return mint1 === mint2;
}

/**
 * Check if mint is native SOL
 */
export function isNativeSol(mint: string): boolean {
  return mint === MINTS.SOL;
}

export default DFlowSwapClient;
