/**
 * Tool Orchestrator Service
 *
 * Coordinates calls to various tools and services,
 * including Soul CVM and external APIs.
 */

import { v4 as uuidv4 } from "uuid";
import type { SoulClient } from "./soulClient.js";
import type { SoulVerifier } from "../attestation/soulVerifier.js";
import type { ParsedIntent, SoulVerificationRequest } from "../types/intent.js";
import type { ToolCallRecord } from "../types/context.js";

/**
 * Tool definition
 */
export interface Tool {
  name: string;
  description: string;
  requiresSoulVerification: boolean;
  handler: (input: Record<string, unknown>) => Promise<Record<string, unknown>>;
}

/**
 * Tool call result
 */
export interface ToolCallResult {
  toolName: string;
  success: boolean;
  output: Record<string, unknown>;
  error?: string;
  durationMs: number;
  soulVerified?: boolean;
  attestationQuote?: string;
}

/**
 * Configuration for tool orchestrator
 */
export interface ToolOrchestratorConfig {
  timeoutMs: number;
  maxConcurrentCalls: number;
  circuitBreakerThreshold: number;
  circuitBreakerResetMs: number;
}

/**
 * Default configuration
 */
const DEFAULT_CONFIG: ToolOrchestratorConfig = {
  timeoutMs: 10000,
  maxConcurrentCalls: 5,
  circuitBreakerThreshold: 5,
  circuitBreakerResetMs: 30000,
};

/**
 * Circuit breaker state
 */
interface CircuitBreaker {
  failures: number;
  lastFailure: number;
  isOpen: boolean;
}

/**
 * Tool Orchestrator Service
 */
export class ToolOrchestrator {
  private config: ToolOrchestratorConfig;
  private soulClient: SoulClient;
  private soulVerifier: SoulVerifier;
  private tools: Map<string, Tool>;
  private circuitBreakers: Map<string, CircuitBreaker>;
  private activeCalls: number = 0;

  constructor(
    soulClient: SoulClient,
    soulVerifier: SoulVerifier,
    config?: Partial<ToolOrchestratorConfig>
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.soulClient = soulClient;
    this.soulVerifier = soulVerifier;
    this.tools = new Map();
    this.circuitBreakers = new Map();

    // Register built-in tools
    this.registerBuiltInTools();
  }

  /**
   * Register built-in tools
   */
  private registerBuiltInTools(): void {
    // Verify Intent Tool
    this.registerTool({
      name: "verify_intent",
      description: "Verify an intent with the Soul CVM",
      requiresSoulVerification: true,
      handler: async (input) => {
        const intent = input.intent as ParsedIntent;
        const context = input.context as {
          userId: string;
          walletAddress: string;
          subOrganizationId: string;
          cardId?: string;
        };

        const request: SoulVerificationRequest = {
          requestId: uuidv4(),
          intentId: intent.intentId,
          action: intent.action,
          amount: intent.amount,
          currency: intent.currency,
          merchant: intent.merchant
            ? {
                merchantId: intent.merchant.merchantId || "",
                merchantName: intent.merchant.merchantName,
                mccCode: intent.merchant.mccCode || "",
              }
            : undefined,
          sourceType: intent.sourceType || "wallet",
          sourceId: intent.sourceId,
          targetType: intent.targetType || "card",
          targetId: intent.targetId,
          timestamp: Date.now(),
        };

        const response = await this.soulClient.verifyIntent(request, context);
        return response as unknown as Record<string, unknown>;
      },
    });

    // Check Balance Tool
    this.registerTool({
      name: "check_balance",
      description: "Check wallet or card balance",
      requiresSoulVerification: false,
      handler: async (input) => {
        // In real implementation, would call balance service
        return {
          available: 10000,
          pending: 0,
          currency: input.currency || "USDC",
        };
      },
    });

    // Get Attestation Tool
    this.registerTool({
      name: "get_attestation",
      description: "Get current attestation status",
      requiresSoulVerification: false,
      handler: async () => {
        const attestation = await this.soulVerifier.getSoulAttestationForChain();
        return attestation || { verified: false };
      },
    });

    // Check Merchant Tool
    this.registerTool({
      name: "check_merchant",
      description: "Validate a merchant",
      requiresSoulVerification: false,
      handler: async (input) => {
        const result = await this.soulClient.validateMerchant(
          input.merchantId as string,
          input.mccCode as string,
          input.countryCode as string
        );
        return result as unknown as Record<string, unknown>;
      },
    });

    // Check Velocity Tool
    this.registerTool({
      name: "check_velocity",
      description: "Check spending velocity limits",
      requiresSoulVerification: false,
      handler: async (input) => {
        const result = await this.soulClient.checkVelocity(
          input.userId as string,
          input.cardId as string,
          input.amountCents as number
        );
        return result as unknown as Record<string, unknown>;
      },
    });
  }

  /**
   * Register a tool
   */
  registerTool(tool: Tool): void {
    this.tools.set(tool.name, tool);
    this.circuitBreakers.set(tool.name, {
      failures: 0,
      lastFailure: 0,
      isOpen: false,
    });
  }

  /**
   * Call a tool
   */
  async callTool(
    toolName: string,
    input: Record<string, unknown>
  ): Promise<ToolCallResult> {
    const tool = this.tools.get(toolName);
    if (!tool) {
      return {
        toolName,
        success: false,
        output: {},
        error: `Tool ${toolName} not found`,
        durationMs: 0,
      };
    }

    // Check circuit breaker
    const breaker = this.circuitBreakers.get(toolName)!;
    if (this.isCircuitOpen(breaker)) {
      return {
        toolName,
        success: false,
        output: {},
        error: "Circuit breaker is open",
        durationMs: 0,
      };
    }

    // Check concurrent call limit
    if (this.activeCalls >= this.config.maxConcurrentCalls) {
      return {
        toolName,
        success: false,
        output: {},
        error: "Max concurrent calls reached",
        durationMs: 0,
      };
    }

    const startTime = Date.now();
    this.activeCalls++;

    try {
      // Verify Soul if required
      let soulVerified = false;
      let attestationQuote: string | undefined;

      if (tool.requiresSoulVerification) {
        const shouldTrust = await this.soulVerifier.shouldTrustSoul();
        if (!shouldTrust) {
          this.activeCalls--;
          return {
            toolName,
            success: false,
            output: {},
            error: "Soul attestation verification failed",
            durationMs: Date.now() - startTime,
            soulVerified: false,
          };
        }
        soulVerified = true;

        const soulAttestation =
          await this.soulVerifier.getSoulAttestationForChain();
        attestationQuote = soulAttestation?.quote;
      }

      // Execute with timeout
      const output = await this.executeWithTimeout(
        () => tool.handler(input),
        this.config.timeoutMs
      );

      // Reset circuit breaker on success
      breaker.failures = 0;
      breaker.isOpen = false;

      this.activeCalls--;
      return {
        toolName,
        success: true,
        output,
        durationMs: Date.now() - startTime,
        soulVerified,
        attestationQuote,
      };
    } catch (error) {
      // Update circuit breaker
      breaker.failures++;
      breaker.lastFailure = Date.now();
      if (breaker.failures >= this.config.circuitBreakerThreshold) {
        breaker.isOpen = true;
      }

      this.activeCalls--;
      return {
        toolName,
        success: false,
        output: {},
        error: error instanceof Error ? error.message : "Unknown error",
        durationMs: Date.now() - startTime,
      };
    }
  }

  /**
   * Call multiple tools in parallel
   */
  async callToolsParallel(
    calls: Array<{ toolName: string; input: Record<string, unknown> }>
  ): Promise<ToolCallResult[]> {
    const results = await Promise.all(
      calls.map((call) => this.callTool(call.toolName, call.input))
    );
    return results;
  }

  /**
   * Call tools in sequence
   */
  async callToolsSequence(
    calls: Array<{
      toolName: string;
      input: Record<string, unknown>;
      inputMapper?: (
        prevResult: ToolCallResult | null
      ) => Record<string, unknown>;
    }>
  ): Promise<ToolCallResult[]> {
    const results: ToolCallResult[] = [];
    let prevResult: ToolCallResult | null = null;

    for (const call of calls) {
      const input = call.inputMapper
        ? call.inputMapper(prevResult)
        : call.input;

      const result = await this.callTool(call.toolName, input);
      results.push(result);

      if (!result.success) {
        break; // Stop sequence on failure
      }

      prevResult = result;
    }

    return results;
  }

  /**
   * Execute with timeout
   */
  private executeWithTimeout<T>(
    fn: () => Promise<T>,
    timeoutMs: number
  ): Promise<T> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error("Tool execution timeout"));
      }, timeoutMs);

      fn()
        .then((result) => {
          clearTimeout(timer);
          resolve(result);
        })
        .catch((error) => {
          clearTimeout(timer);
          reject(error);
        });
    });
  }

  /**
   * Check if circuit breaker is open
   */
  private isCircuitOpen(breaker: CircuitBreaker): boolean {
    if (!breaker.isOpen) return false;

    // Check if reset period has passed
    if (Date.now() - breaker.lastFailure > this.config.circuitBreakerResetMs) {
      breaker.isOpen = false;
      breaker.failures = 0;
      return false;
    }

    return true;
  }

  /**
   * Convert tool call result to record
   */
  resultToRecord(result: ToolCallResult): ToolCallRecord {
    return {
      toolName: result.toolName,
      input: {},
      output: result.output,
      success: result.success,
      durationMs: result.durationMs,
      timestamp: Date.now(),
    };
  }

  /**
   * Get available tools
   */
  getAvailableTools(): Array<{ name: string; description: string }> {
    return Array.from(this.tools.values()).map((tool) => ({
      name: tool.name,
      description: tool.description,
    }));
  }

  /**
   * Get tool status
   */
  getToolStatus(toolName: string): {
    available: boolean;
    circuitOpen: boolean;
    failures: number;
  } | null {
    const tool = this.tools.get(toolName);
    const breaker = this.circuitBreakers.get(toolName);

    if (!tool || !breaker) return null;

    return {
      available: !this.isCircuitOpen(breaker),
      circuitOpen: breaker.isOpen,
      failures: breaker.failures,
    };
  }

  /**
   * Reset circuit breaker for a tool
   */
  resetCircuitBreaker(toolName: string): boolean {
    const breaker = this.circuitBreakers.get(toolName);
    if (!breaker) return false;

    breaker.failures = 0;
    breaker.isOpen = false;
    return true;
  }

  /**
   * Get orchestrator stats
   */
  getStats(): {
    activeCalls: number;
    totalTools: number;
    openCircuits: number;
  } {
    let openCircuits = 0;
    for (const breaker of this.circuitBreakers.values()) {
      if (breaker.isOpen) openCircuits++;
    }

    return {
      activeCalls: this.activeCalls,
      totalTools: this.tools.size,
      openCircuits,
    };
  }

  /**
   * Destroy and cleanup
   */
  destroy(): void {
    this.tools.clear();
    this.circuitBreakers.clear();
  }
}
