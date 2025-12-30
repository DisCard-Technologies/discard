/**
 * LLM Service - Phala Confidential AI Integration
 *
 * Provides LLM capabilities via Phala's TEE-protected Confidential AI API.
 * Uses OpenAI-compatible endpoint at api.redpill.ai.
 */

import OpenAI from "openai";

/**
 * Configuration for LLM Service
 */
export interface LLMServiceConfig {
  apiKey: string;
  baseUrl: string;
  model: string;
  maxTokens: number;
  temperature: number;
}

/**
 * Default configuration
 */
const DEFAULT_CONFIG: Partial<LLMServiceConfig> = {
  baseUrl: "https://api.redpill.ai/v1",
  model: "meta-llama/llama-3.3-70b-instruct",
  maxTokens: 1024,
  temperature: 0.7,
};

/**
 * Message format for chat
 */
export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

/**
 * Response from LLM
 */
export interface LLMResponse {
  success: boolean;
  text: string;
  model: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  error?: string;
  latencyMs: number;
}

/**
 * System prompt for the Brain Orchestrator
 */
const BRAIN_SYSTEM_PROMPT = `You are the DisCard Brain Orchestrator, a helpful AI assistant for a privacy-first virtual card platform built on Solana.

Your role is to:
1. Understand user requests related to financial actions (funding cards, transfers, swaps, etc.)
2. Provide clear, concise responses
3. Ask clarifying questions when needed
4. Help users navigate the platform

Communication style:
- Be direct and helpful
- Use clear, simple language
- Focus on understanding user intent
- Don't be overly formal or robotic

Available actions you can help with:
- Fund card: Add money to a virtual card
- Transfer: Send funds to another wallet
- Swap: Exchange one token for another
- Check balance: View current balances
- Create card: Set up a new virtual card

When you understand a clear financial intent, acknowledge it and confirm the details.
When the request is ambiguous, ask for clarification.
For general conversation (like "hi"), respond naturally and ask how you can help.`;

/**
 * LLM Service for Phala Confidential AI
 */
export class LLMService {
  private client: OpenAI;
  private config: LLMServiceConfig;
  private initialized: boolean = false;

  constructor(config: Partial<LLMServiceConfig> & { apiKey: string }) {
    this.config = {
      ...DEFAULT_CONFIG,
      ...config,
    } as LLMServiceConfig;

    this.client = new OpenAI({
      apiKey: this.config.apiKey,
      baseURL: this.config.baseUrl,
    });

    this.initialized = true;
    console.log(`[LLM] Initialized with model: ${this.config.model}`);
    console.log(`[LLM] Base URL: ${this.config.baseUrl}`);
  }

  /**
   * Send a chat message and get a response
   */
  async chat(
    userMessage: string,
    conversationHistory: ChatMessage[] = []
  ): Promise<LLMResponse> {
    const startTime = Date.now();

    try {
      // Build messages array
      const messages: ChatMessage[] = [
        { role: "system", content: BRAIN_SYSTEM_PROMPT },
        ...conversationHistory,
        { role: "user", content: userMessage },
      ];

      console.log(`[LLM] Sending message: "${userMessage.substring(0, 50)}..."`);

      const response = await this.client.chat.completions.create({
        model: this.config.model,
        messages: messages.map((m) => ({
          role: m.role,
          content: m.content,
        })),
        max_tokens: this.config.maxTokens,
        temperature: this.config.temperature,
      });

      const latencyMs = Date.now() - startTime;
      const content = response.choices[0]?.message?.content || "";

      console.log(`[LLM] Response received in ${latencyMs}ms`);

      return {
        success: true,
        text: content,
        model: response.model,
        usage: response.usage
          ? {
              promptTokens: response.usage.prompt_tokens,
              completionTokens: response.usage.completion_tokens,
              totalTokens: response.usage.total_tokens,
            }
          : undefined,
        latencyMs,
      };
    } catch (error) {
      const latencyMs = Date.now() - startTime;
      const errorMessage =
        error instanceof Error ? error.message : "Unknown LLM error";

      console.error(`[LLM] Error: ${errorMessage}`);

      return {
        success: false,
        text: "",
        model: this.config.model,
        error: errorMessage,
        latencyMs,
      };
    }
  }

  /**
   * Simple completion without conversation history
   */
  async complete(prompt: string): Promise<LLMResponse> {
    return this.chat(prompt, []);
  }

  /**
   * Check if service is initialized
   */
  isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * Get current model
   */
  getModel(): string {
    return this.config.model;
  }

  /**
   * Health check - verify API connectivity
   */
  async healthCheck(): Promise<boolean> {
    try {
      const response = await this.chat("ping", []);
      return response.success;
    } catch {
      return false;
    }
  }
}
