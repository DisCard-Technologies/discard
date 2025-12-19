/**
 * Intent Solver Module - Claude AI Integration
 *
 * Uses Claude API to parse natural language intents into structured actions
 * that can be executed as Solana transactions.
 *
 * The solver:
 * 1. Gathers user context (cards, wallets, DeFi positions)
 * 2. Constructs a system prompt with available resources
 * 3. Calls Claude API to parse the intent
 * 4. Returns structured action or clarification request
 */
import { internalAction } from "../_generated/server";
import { v } from "convex/values";
import { internal } from "../_generated/api";
import { Doc, Id } from "../_generated/dataModel";

// Claude API configuration
const CLAUDE_API_KEY = process.env.CLAUDE_API_KEY;
const CLAUDE_API_URL = "https://api.anthropic.com/v1/messages";
const CLAUDE_MODEL = "claude-3-5-sonnet-20241022";

// Action types that the solver can return
type IntentAction =
  | "fund_card"
  | "swap"
  | "transfer"
  | "withdraw_defi"
  | "create_card"
  | "freeze_card"
  | "pay_bill";

type SourceType = "wallet" | "defi_position" | "card" | "external";
type TargetType = "card" | "wallet" | "external";

interface ParsedIntent {
  action: IntentAction;
  sourceType: SourceType;
  sourceId?: string;
  targetType: TargetType;
  targetId?: string;
  amount?: number;
  currency?: string;
  metadata?: Record<string, any>;
}

interface ClaudeResponse {
  parsedIntent?: ParsedIntent;
  needsClarification: boolean;
  clarificationQuestion?: string;
  confidence: number;
}

// ============ INTERNAL ACTIONS ============

/**
 * Parse a natural language intent using Claude AI
 */
export const parseIntent = internalAction({
  args: {
    intentId: v.id("intents"),
  },
  handler: async (ctx, args): Promise<void> => {
    try {
      // Update status to parsing
      await ctx.runMutation(internal.intents.intents.updateStatus, {
        intentId: args.intentId,
        status: "parsing",
      });

      // Get intent details
      const intent = await ctx.runQuery(internal.intents.intents.getById, {
        intentId: args.intentId,
      });

      if (!intent) {
        throw new Error("Intent not found");
      }

      // Gather user context for personalization
      const userContext = await gatherUserContext(ctx, intent.userId);

      // Build system prompt
      const systemPrompt = buildSystemPrompt(userContext);

      // Build user message (include clarification if present)
      let userMessage = intent.rawText;
      if (intent.clarificationResponse) {
        userMessage = `Original request: ${intent.rawText}\n\nClarification provided: ${intent.clarificationResponse}`;
      }

      // Call Claude API
      const claudeResponse = await callClaudeAPI(systemPrompt, userMessage);

      // Handle response
      if (claudeResponse.needsClarification) {
        await ctx.runMutation(internal.intents.intents.updateStatus, {
          intentId: args.intentId,
          status: "clarifying",
          clarificationQuestion: claudeResponse.clarificationQuestion,
        });
      } else if (claudeResponse.parsedIntent) {
        // Validate the parsed intent
        const validationResult = validateParsedIntent(claudeResponse.parsedIntent, userContext);

        if (!validationResult.valid) {
          await ctx.runMutation(internal.intents.intents.updateStatus, {
            intentId: args.intentId,
            status: "clarifying",
            clarificationQuestion: validationResult.clarificationQuestion,
          });
        } else {
          // Auto-approve simple intents with high confidence
          const shouldAutoApprove =
            claudeResponse.confidence > 0.9 &&
            isSimpleIntent(claudeResponse.parsedIntent);

          await ctx.runMutation(internal.intents.intents.updateStatus, {
            intentId: args.intentId,
            status: shouldAutoApprove ? "approved" : "ready",
            parsedIntent: claudeResponse.parsedIntent,
          });

          // If auto-approved, schedule execution
          if (shouldAutoApprove) {
            await ctx.scheduler.runAfter(0, internal.intents.executor.execute, {
              intentId: args.intentId,
            });
          }
        }
      } else {
        throw new Error("Failed to parse intent");
      }
    } catch (error) {
      console.error("Intent parsing failed:", error);
      await ctx.runMutation(internal.intents.intents.updateStatus, {
        intentId: args.intentId,
        status: "failed",
        errorMessage: error instanceof Error ? error.message : "Unknown parsing error",
        errorCode: "PARSE_ERROR",
      });
    }
  },
});

/**
 * Generate clarification question for ambiguous intents
 */
export const generateClarification = internalAction({
  args: {
    intentId: v.id("intents"),
    ambiguityType: v.string(),
  },
  handler: async (ctx, args): Promise<string> => {
    const intent = await ctx.runQuery(internal.intents.intents.getById, {
      intentId: args.intentId,
    });

    if (!intent) {
      return "Could you please provide more details about what you'd like to do?";
    }

    // Generate context-aware clarification
    const clarificationPrompts: Record<string, string> = {
      source_ambiguous: "Which account or wallet would you like to use as the source?",
      target_ambiguous: "Which card would you like to fund?",
      amount_missing: "How much would you like to transfer?",
      currency_ambiguous: "Which currency would you like to use?",
      action_unclear: "Could you clarify what action you'd like to take?",
    };

    return clarificationPrompts[args.ambiguityType] ??
      "Could you please provide more details about what you'd like to do?";
  },
});

// ============ HELPER FUNCTIONS ============

/**
 * Gather user context for Claude prompt
 */
async function gatherUserContext(ctx: any, userId: Id<"users">): Promise<{
  cards: Array<{ id: string; last4: string; balance: number; status: string; nickname?: string }>;
  wallets: Array<{ id: string; network: string; type: string; balance?: number; nickname?: string }>;
  defiPositions: Array<{ id: string; protocol: string; available: number; yield: number }>;
}> {
  // Note: In production, these would be proper internal queries
  // For now, return empty arrays - the actual implementation would query the database

  return {
    cards: [],
    wallets: [],
    defiPositions: [],
  };
}

/**
 * Build system prompt for Claude
 */
function buildSystemPrompt(userContext: {
  cards: Array<{ id: string; last4: string; balance: number; status: string; nickname?: string }>;
  wallets: Array<{ id: string; network: string; type: string; balance?: number; nickname?: string }>;
  defiPositions: Array<{ id: string; protocol: string; available: number; yield: number }>;
}): string {
  return `You are a financial intent parser for DisCard, a privacy-first virtual card platform built on Solana.

Your task is to parse natural language requests into structured financial actions.

## Available Resources for This User

### Cards
${userContext.cards.length > 0
  ? JSON.stringify(userContext.cards.map(c => ({
      id: c.id,
      last4: c.last4,
      balance_cents: c.balance,
      status: c.status,
      nickname: c.nickname,
    })), null, 2)
  : "No cards available. User may need to create one first."}

### Wallets
${userContext.wallets.length > 0
  ? JSON.stringify(userContext.wallets.map(w => ({
      id: w.id,
      network: w.network,
      type: w.type,
      balance_cents: w.balance,
      nickname: w.nickname,
    })), null, 2)
  : "No wallets connected. Default passkey wallet is available."}

### DeFi Positions
${userContext.defiPositions.length > 0
  ? JSON.stringify(userContext.defiPositions.map(d => ({
      id: d.id,
      protocol: d.protocol,
      available_cents: d.available,
      yield_apy_bps: d.yield,
    })), null, 2)
  : "No DeFi positions."}

## Output Format

Respond with a JSON object containing:
{
  "parsedIntent": {
    "action": "fund_card" | "swap" | "transfer" | "withdraw_defi" | "create_card" | "freeze_card" | "pay_bill",
    "sourceType": "wallet" | "defi_position" | "card" | "external",
    "sourceId": "<id or null>",
    "targetType": "card" | "wallet" | "external",
    "targetId": "<id or null>",
    "amount": <number in cents or null>,
    "currency": "USD" | "ETH" | "SOL" | etc,
    "metadata": { any additional context }
  },
  "needsClarification": true | false,
  "clarificationQuestion": "<question if clarification needed>",
  "confidence": <0.0 to 1.0>
}

## Rules

1. All amounts are in cents (100 = $1.00)
2. If the user references "my card" without specifying, use the most recently used active card
3. If the user says "ETH yield" or "DeFi yield", look for defi_position sources
4. For "pay bill", the target should be "external"
5. If any required information is missing, set needsClarification to true
6. Set confidence based on how certain you are of the interpretation

## Examples

User: "Pay $50 to my Amazon card"
Response: {
  "parsedIntent": {
    "action": "fund_card",
    "sourceType": "wallet",
    "sourceId": null,
    "targetType": "card",
    "targetId": "<amazon card id if found>",
    "amount": 5000,
    "currency": "USD"
  },
  "needsClarification": false,
  "confidence": 0.95
}

User: "Use my ETH yield to fund my shopping card"
Response: {
  "parsedIntent": {
    "action": "withdraw_defi",
    "sourceType": "defi_position",
    "sourceId": "<eth lending position id>",
    "targetType": "card",
    "targetId": "<shopping card id>",
    "amount": null,
    "currency": "ETH"
  },
  "needsClarification": true,
  "clarificationQuestion": "How much would you like to withdraw from your ETH yield position?",
  "confidence": 0.7
}`;
}

/**
 * Call Claude API
 */
async function callClaudeAPI(
  systemPrompt: string,
  userMessage: string
): Promise<ClaudeResponse> {
  if (!CLAUDE_API_KEY) {
    throw new Error("Claude API key not configured");
  }

  const response = await fetch(CLAUDE_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": CLAUDE_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: CLAUDE_MODEL,
      max_tokens: 1024,
      system: systemPrompt,
      messages: [
        {
          role: "user",
          content: userMessage,
        },
      ],
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Claude API error: ${response.status} - ${error}`);
  }

  const result = await response.json();

  // Extract content from Claude response
  const content = result.content?.[0]?.text;
  if (!content) {
    throw new Error("Empty response from Claude");
  }

  // Parse JSON from response
  try {
    // Find JSON in the response (Claude might include explanation text)
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error("No JSON found in Claude response");
    }

    const parsed = JSON.parse(jsonMatch[0]);

    return {
      parsedIntent: parsed.parsedIntent,
      needsClarification: parsed.needsClarification ?? false,
      clarificationQuestion: parsed.clarificationQuestion,
      confidence: parsed.confidence ?? 0.5,
    };
  } catch (parseError) {
    console.error("Failed to parse Claude response:", content);
    throw new Error("Failed to parse Claude response as JSON");
  }
}

/**
 * Validate parsed intent against user's available resources
 */
function validateParsedIntent(
  intent: ParsedIntent,
  userContext: {
    cards: Array<{ id: string; last4: string; balance: number; status: string }>;
    wallets: Array<{ id: string; network: string; type: string; balance?: number }>;
    defiPositions: Array<{ id: string; protocol: string; available: number; yield: number }>;
  }
): { valid: boolean; clarificationQuestion?: string } {
  // Validate source exists
  if (intent.sourceId) {
    if (intent.sourceType === "card") {
      const card = userContext.cards.find((c) => c.id === intent.sourceId);
      if (!card) {
        return {
          valid: false,
          clarificationQuestion: "I couldn't find that card. Which card would you like to use?",
        };
      }
    } else if (intent.sourceType === "wallet") {
      const wallet = userContext.wallets.find((w) => w.id === intent.sourceId);
      if (!wallet) {
        return {
          valid: false,
          clarificationQuestion: "I couldn't find that wallet. Which wallet would you like to use?",
        };
      }
    } else if (intent.sourceType === "defi_position") {
      const position = userContext.defiPositions.find((d) => d.id === intent.sourceId);
      if (!position) {
        return {
          valid: false,
          clarificationQuestion: "I couldn't find that DeFi position. Which position would you like to use?",
        };
      }
    }
  }

  // Validate target exists
  if (intent.targetId && intent.targetType === "card") {
    const card = userContext.cards.find((c) => c.id === intent.targetId);
    if (!card) {
      return {
        valid: false,
        clarificationQuestion: "I couldn't find that card. Which card would you like to fund?",
      };
    }
  }

  // Validate amount for fund_card actions
  if (intent.action === "fund_card" && !intent.amount) {
    return {
      valid: false,
      clarificationQuestion: "How much would you like to add to the card?",
    };
  }

  return { valid: true };
}

/**
 * Check if intent is simple enough for auto-approval
 */
function isSimpleIntent(intent: ParsedIntent): boolean {
  // Simple intents are card funding under $100
  if (intent.action === "fund_card" && intent.amount && intent.amount <= 10000) {
    return true;
  }

  // Creating a card is always safe to auto-approve
  if (intent.action === "create_card") {
    return true;
  }

  return false;
}
