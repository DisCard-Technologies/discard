/**
 * DisCard Action Handler
 *
 * Handles financial action intents that require execution.
 * Uses LLM to parse structured intent from natural language.
 *
 * Actions:
 * - fund_card, transfer, swap
 * - create_card, freeze_card, delete_card
 * - check_balance, view_transactions
 * - set_limit, pay_bill, withdraw_defi
 */

import { ActionCtx } from "../../_generated/server";
import { Id } from "../../_generated/dataModel";
import { ClassificationResult, ActionType, extractAmount, extractCurrency } from "../classifier";

// ============================================================================
// Types
// ============================================================================

export type SourceType = "wallet" | "defi_position" | "card" | "external";
export type TargetType = "card" | "wallet" | "external" | "merchant";

export interface ParsedIntent {
  action: ActionType;
  sourceType?: SourceType;
  sourceId?: string;
  targetType?: TargetType;
  targetId?: string;
  amount?: number;
  currency?: string;
  metadata?: Record<string, unknown>;
}

export interface ActionResponse {
  /** Whether parsing was successful */
  success: boolean;
  /** Parsed intent if successful */
  parsedIntent?: ParsedIntent;
  /** Confidence score 0-1 */
  confidence: number;
  /** Human-readable description of the action */
  description?: string;
  /** Whether clarification is needed */
  needsClarification: boolean;
  /** Clarification question if needed */
  clarificationQuestion?: string;
  /** Missing fields that need clarification */
  missingFields?: string[];
  /** Error message if failed */
  error?: string;
  /** Whether LLM was used */
  usedLLM: boolean;
}

export interface UserContext {
  cards: Array<{
    id: string;
    last4: string;
    balance: number;
    status: string;
    nickname?: string;
  }>;
  wallets: Array<{
    address: string;
    network: string;
    balance: number;
    currency: string;
  }>;
  defiPositions?: Array<{
    id: string;
    protocol: string;
    amount: number;
    apy: number;
  }>;
}

// ============================================================================
// Handler Functions
// ============================================================================

/**
 * Handle an action intent
 */
export async function handleAction(
  ctx: ActionCtx,
  userId: Id<"users">,
  rawText: string,
  classification: ClassificationResult,
  userContext: UserContext
): Promise<ActionResponse> {
  // If we already have high-confidence classification with amount, try to parse directly
  if (
    classification.suggestedAction &&
    classification.suggestedAction !== "unknown" &&
    classification.confidence >= 0.8
  ) {
    const directParse = tryDirectParse(rawText, classification, userContext);
    if (directParse.success && !directParse.needsClarification) {
      return directParse;
    }
  }

  // Use LLM for full parsing
  return await parseLLMAction(ctx, userId, rawText, userContext);
}

/**
 * Try to parse action directly without LLM
 * Works for simple, unambiguous requests
 */
function tryDirectParse(
  rawText: string,
  classification: ClassificationResult,
  userContext: UserContext
): ActionResponse {
  const action = classification.suggestedAction!;
  const amount = classification.extractedAmount ?? extractAmount(rawText);
  const currency = classification.extractedCurrency ?? extractCurrency(rawText) ?? "USDC";

  // Check for missing required fields
  const missingFields: string[] = [];

  // Amount required for most actions
  const amountRequiredActions: ActionType[] = [
    "fund_card",
    "transfer",
    "swap",
    "pay_bill",
    "withdraw_defi",
  ];

  if (amountRequiredActions.includes(action) && !amount) {
    missingFields.push("amount");
  }

  // Target required for transfers
  if (action === "transfer") {
    const hasTarget = /@\w+|\.sol|0x[a-fA-F0-9]{40}|[1-9A-HJ-NP-Za-km-z]{32,44}/.test(rawText);
    if (!hasTarget) {
      missingFields.push("recipient");
    }
  }

  // Card ID may be needed
  const cardActions: ActionType[] = ["fund_card", "freeze_card", "delete_card"];
  if (cardActions.includes(action) && userContext.cards.length > 1) {
    // Check if a specific card is mentioned
    const cardMentioned = userContext.cards.some(
      (card) =>
        rawText.includes(card.last4) ||
        (card.nickname && rawText.toLowerCase().includes(card.nickname.toLowerCase()))
    );

    if (!cardMentioned) {
      missingFields.push("card");
    }
  }

  // If missing fields, need clarification
  if (missingFields.length > 0) {
    return {
      success: true,
      parsedIntent: {
        action,
        amount,
        currency,
      },
      confidence: classification.confidence,
      needsClarification: true,
      clarificationQuestion: generateClarificationQuestion(action, missingFields, userContext),
      missingFields,
      usedLLM: false,
    };
  }

  // Build complete intent
  const parsedIntent = buildIntent(action, rawText, amount, currency, userContext);

  return {
    success: true,
    parsedIntent,
    confidence: classification.confidence,
    description: generateDescription(parsedIntent),
    needsClarification: false,
    usedLLM: false,
  };
}

/**
 * Parse action using LLM for complex cases
 */
async function parseLLMAction(
  ctx: ActionCtx,
  userId: Id<"users">,
  rawText: string,
  userContext: UserContext
): Promise<ActionResponse> {
  const systemPrompt = buildActionSystemPrompt(userContext);
  const userPrompt = rawText;

  try {
    const response = await callPhalLLM(systemPrompt, userPrompt);
    const parsed = parseJSONResponse(response);

    if (!parsed) {
      return {
        success: false,
        confidence: 0,
        needsClarification: true,
        clarificationQuestion: "I didn't quite understand that. Could you please rephrase what you'd like to do?",
        error: "Failed to parse LLM response",
        usedLLM: true,
      };
    }

    // Validate parsed intent
    if (parsed.needsClarification) {
      return {
        success: true,
        parsedIntent: parsed.parsedIntent,
        confidence: parsed.confidence || 0.5,
        needsClarification: true,
        clarificationQuestion: parsed.clarificationQuestion,
        missingFields: parsed.missingFields,
        usedLLM: true,
      };
    }

    return {
      success: true,
      parsedIntent: parsed.parsedIntent,
      confidence: parsed.confidence || 0.8,
      description: parsed.parsedIntent ? generateDescription(parsed.parsedIntent) : undefined,
      needsClarification: false,
      usedLLM: true,
    };
  } catch (error) {
    console.error("[ActionHandler] LLM parsing failed:", error);
    return {
      success: false,
      confidence: 0,
      needsClarification: true,
      clarificationQuestion: "I encountered an error understanding your request. Could you try again?",
      error: error instanceof Error ? error.message : "Unknown error",
      usedLLM: true,
    };
  }
}

/**
 * Build system prompt for action parsing
 */
function buildActionSystemPrompt(userContext: UserContext): string {
  const cardsInfo =
    userContext.cards.length > 0
      ? userContext.cards
          .map((c) => `- Card •••${c.last4}${c.nickname ? ` (${c.nickname})` : ""}: $${(c.balance / 100).toFixed(2)}, ${c.status}`)
          .join("\n")
      : "No cards";

  const walletsInfo =
    userContext.wallets.length > 0
      ? userContext.wallets
          .map((w) => `- ${w.network}: ${w.balance} ${w.currency}`)
          .join("\n")
      : "No wallets";

  return `You are DisCard's intent parser. Parse the user's request into a structured financial action.

## User's Resources
Cards:
${cardsInfo}

Wallets:
${walletsInfo}

## Available Actions
- fund_card: Add money to a card
- transfer: Send funds to wallet/address
- swap: Exchange tokens
- create_card: Create new virtual card
- freeze_card: Lock a card
- delete_card: Remove a card
- check_balance: View balances
- view_transactions: See history
- set_limit: Set spending limit
- pay_bill: Pay a bill
- withdraw_defi: Exit DeFi position

## Response Format (JSON only)
{
  "parsedIntent": {
    "action": "fund_card|transfer|swap|...",
    "sourceType": "wallet|card|defi_position",
    "sourceId": "optional id",
    "targetType": "card|wallet|external|merchant",
    "targetId": "card id or address",
    "amount": 100,
    "currency": "USDC",
    "metadata": {}
  },
  "confidence": 0.0-1.0,
  "needsClarification": false,
  "clarificationQuestion": "optional question if clarification needed",
  "missingFields": ["optional", "list"]
}

Respond with ONLY valid JSON. No other text.`;
}

/**
 * Call Phala LLM API
 */
async function callPhalLLM(systemPrompt: string, userPrompt: string): Promise<string> {
  const apiKey = process.env.PHALA_AI_API_KEY;
  const baseUrl = process.env.PHALA_AI_BASE_URL || "https://api.redpill.ai/v1";
  const model = process.env.PHALA_AI_MODEL || "meta-llama/llama-3.3-70b-instruct";

  if (!apiKey) {
    throw new Error("PHALA_AI_API_KEY not configured");
  }

  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      max_tokens: 1024,
      temperature: 0.2, // Low temperature for consistent parsing
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
    }),
  });

  if (!response.ok) {
    throw new Error(`LLM API error: ${response.status}`);
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content || "";
}

/**
 * Parse JSON from LLM response
 */
function parseJSONResponse(response: string): {
  parsedIntent?: ParsedIntent;
  confidence?: number;
  needsClarification?: boolean;
  clarificationQuestion?: string;
  missingFields?: string[];
} | null {
  try {
    // Try to extract JSON from response
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return null;
    }

    return JSON.parse(jsonMatch[0]);
  } catch {
    return null;
  }
}

/**
 * Build intent from parsed components
 */
function buildIntent(
  action: ActionType,
  rawText: string,
  amount: number | undefined,
  currency: string,
  userContext: UserContext
): ParsedIntent {
  const intent: ParsedIntent = {
    action,
    amount,
    currency,
  };

  // Infer source and target based on action
  switch (action) {
    case "fund_card":
      intent.sourceType = "wallet";
      intent.targetType = "card";
      // Find card if only one or mentioned
      if (userContext.cards.length === 1) {
        intent.targetId = userContext.cards[0].id;
      }
      break;

    case "transfer":
      intent.sourceType = "wallet";
      intent.targetType = "external";
      // Extract recipient from text
      const solMatch = rawText.match(/(\w+\.sol)/i);
      const addressMatch = rawText.match(/([1-9A-HJ-NP-Za-km-z]{32,44})/);
      const usernameMatch = rawText.match(/@(\w+)/);

      if (solMatch) {
        intent.targetId = solMatch[1];
      } else if (addressMatch) {
        intent.targetId = addressMatch[1];
      } else if (usernameMatch) {
        intent.targetId = usernameMatch[1];
        intent.metadata = { isUsername: true };
      }
      break;

    case "swap":
      intent.sourceType = "wallet";
      intent.targetType = "wallet";
      // Extract target currency
      const swapMatch = rawText.match(/(?:for|to|into)\s+(\w+)/i);
      if (swapMatch) {
        intent.metadata = { outputCurrency: swapMatch[1].toUpperCase() };
      }
      break;

    case "freeze_card":
    case "delete_card":
      intent.targetType = "card";
      if (userContext.cards.length === 1) {
        intent.targetId = userContext.cards[0].id;
      }
      break;

    case "create_card":
      intent.targetType = "card";
      break;
  }

  return intent;
}

/**
 * Generate clarification question
 */
function generateClarificationQuestion(
  action: ActionType,
  missingFields: string[],
  userContext: UserContext
): string {
  if (missingFields.includes("amount")) {
    switch (action) {
      case "fund_card":
        return "How much would you like to add to your card?";
      case "transfer":
        return "How much would you like to send?";
      case "swap":
        return "How much would you like to swap?";
      default:
        return "What amount did you have in mind?";
    }
  }

  if (missingFields.includes("recipient")) {
    return "Who would you like to send this to? (address, .sol name, or @username)";
  }

  if (missingFields.includes("card")) {
    const cardOptions = userContext.cards
      .map((c) => `•••${c.last4}${c.nickname ? ` (${c.nickname})` : ""}`)
      .join(", ");
    return `Which card? You have: ${cardOptions}`;
  }

  return "I need a bit more information. Could you provide more details?";
}

/**
 * Generate human-readable description of intent
 */
function generateDescription(intent: ParsedIntent): string {
  const amount = intent.amount ? `$${intent.amount}` : "";
  const currency = intent.currency || "USDC";

  switch (intent.action) {
    case "fund_card":
      return `Add ${amount} ${currency} to your card`;
    case "transfer":
      return `Send ${amount} ${currency} to ${intent.targetId || "recipient"}`;
    case "swap":
      const output = intent.metadata?.outputCurrency || "tokens";
      return `Swap ${amount} ${currency} for ${output}`;
    case "create_card":
      return "Create a new virtual card";
    case "freeze_card":
      return "Freeze your card";
    case "delete_card":
      return "Delete your card";
    case "check_balance":
      return "Check your balance";
    case "view_transactions":
      return "View recent transactions";
    case "set_limit":
      return `Set spending limit to ${amount}`;
    default:
      return `Execute ${intent.action}`;
  }
}

// ============================================================================
// Exports
// ============================================================================

export default {
  handleAction,
  tryDirectParse,
  generateDescription,
};
