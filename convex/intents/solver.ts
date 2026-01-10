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

// Phala RedPill AI configuration (OpenAI-compatible API)
const PHALA_AI_API_KEY = process.env.PHALA_AI_API_KEY;
const PHALA_AI_BASE_URL = process.env.PHALA_AI_BASE_URL || "https://api.redpill.ai/v1";
const PHALA_AI_MODEL = process.env.PHALA_AI_MODEL || "meta-llama/llama-3.3-70b-instruct";

// Action types that the solver can return
type IntentAction =
  | "fund_card"
  | "swap"
  | "transfer"
  | "withdraw_defi"
  | "create_card"
  | "freeze_card"
  | "delete_card"
  | "pay_bill";

const VALID_ACTIONS: IntentAction[] = [
  "fund_card", "swap", "transfer", "withdraw_defi", "create_card", "freeze_card", "delete_card", "pay_bill"
];

type SourceType = "wallet" | "defi_position" | "card" | "external";
type TargetType = "card" | "wallet" | "external";

const VALID_SOURCE_TYPES: SourceType[] = ["wallet", "defi_position", "card", "external"];
const VALID_TARGET_TYPES: TargetType[] = ["card", "wallet", "external"];

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
  responseText?: string; // AI's conversational response
  isConversational?: boolean; // True if this is just a chat response (no action)
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
    console.log("[Solver] parseIntent called with intentId:", args.intentId);
    console.log("[Solver] PHALA_AI_API_KEY exists:", !!PHALA_AI_API_KEY);
    console.log("[Solver] PHALA_AI_BASE_URL:", PHALA_AI_BASE_URL);
    console.log("[Solver] PHALA_AI_MODEL:", PHALA_AI_MODEL);

    try {
      // Update status to parsing
      console.log("[Solver] Updating status to parsing...");
      await ctx.runMutation(internal.intents.intents.updateStatus, {
        intentId: args.intentId,
        status: "parsing",
      });

      // Get intent details
      console.log("[Solver] Fetching intent details...");
      const intent = await ctx.runQuery(internal.intents.intents.getById, {
        intentId: args.intentId,
      });

      if (!intent) {
        console.error("[Solver] Intent not found!");
        throw new Error("Intent not found");
      }
      console.log("[Solver] Intent found:", intent.rawText);

      // Gather user context for personalization
      console.log("[Solver] Gathering user context for userId:", intent.userId);
      const userContext = await gatherUserContext(ctx, intent.userId);
      console.log("[Solver] User context gathered:", JSON.stringify(userContext));

      // Fetch recent conversation history for context
      console.log("[Solver] Fetching conversation history...");
      const recentIntents = await ctx.runQuery(internal.intents.intents.getRecentForContext, {
        userId: intent.userId,
        excludeIntentId: args.intentId,
        limit: 5,
      });
      const conversationHistory = buildConversationHistory(recentIntents);
      console.log("[Solver] Conversation history built:", conversationHistory.length, "messages");

      // Build system prompt
      const systemPrompt = buildSystemPrompt(userContext);

      // Build user message (include clarification and conversation history if present)
      let userMessage = "";

      // Add conversation history if available
      if (conversationHistory.length > 0) {
        userMessage += "## Recent Conversation History\n";
        userMessage += "(Use this context to understand what the user is referring to)\n\n";
        userMessage += conversationHistory + "\n\n";
        userMessage += "## Current Request\n";
      }

      if (intent.clarificationResponse) {
        userMessage += `Original request: ${intent.rawText}\n\nClarification provided: ${intent.clarificationResponse}`;
      } else {
        userMessage += intent.rawText;
      }
      console.log("[Solver] User message:", userMessage);

      // Call Phala RedPill AI
      console.log("[Solver] Calling Phala AI...");
      const aiResponse = await callPhalaAI(systemPrompt, userMessage);
      console.log("[Solver] AI response received:", JSON.stringify(aiResponse));

      // Handle response based on type

      // Type 1: Conversational response (no action needed, just display the response)
      if (aiResponse.isConversational) {
        console.log("[Solver] Conversational response - marking as completed");
        await ctx.runMutation(internal.intents.intents.updateStatus, {
          intentId: args.intentId,
          status: "completed",
          responseText: aiResponse.responseText || "I'm here to help!",
        });
        return;
      }

      // Type 2: Clarification needed
      if (aiResponse.needsClarification) {
        await ctx.runMutation(internal.intents.intents.updateStatus, {
          intentId: args.intentId,
          status: "clarifying",
          clarificationQuestion: aiResponse.clarificationQuestion || "Could you provide more details about what you'd like to do?",
          responseText: aiResponse.responseText,
        });
        return;
      }

      // Type 3: Action response with parsed intent
      if (aiResponse.parsedIntent) {
        // Sanitize the AI response to convert null to undefined and validate types
        const sanitizedIntent = sanitizeParsedIntent(aiResponse.parsedIntent);

        if (!sanitizedIntent) {
          // AI returned something that doesn't fit our schema
          console.log("[Solver] AI response doesn't fit intent schema, treating as conversational");
          await ctx.runMutation(internal.intents.intents.updateStatus, {
            intentId: args.intentId,
            status: "completed",
            responseText: aiResponse.responseText || "I'm not sure how to help with that. Try asking me to create a card, fund your wallet, or make a transfer!",
          });
          return;
        }

        // Validate the parsed intent against user's resources
        const validationResult = validateParsedIntent(sanitizedIntent, userContext);

        if (!validationResult.valid) {
          await ctx.runMutation(internal.intents.intents.updateStatus, {
            intentId: args.intentId,
            status: "clarifying",
            clarificationQuestion: validationResult.clarificationQuestion,
            responseText: aiResponse.responseText,
          });
        } else {
          // Auto-approve simple intents with high confidence
          const shouldAutoApprove =
            aiResponse.confidence > 0.9 &&
            isSimpleIntent(sanitizedIntent);

          await ctx.runMutation(internal.intents.intents.updateStatus, {
            intentId: args.intentId,
            status: shouldAutoApprove ? "approved" : "ready",
            parsedIntent: sanitizedIntent,
            responseText: aiResponse.responseText,
          });

          // If auto-approved, schedule execution
          if (shouldAutoApprove) {
            await ctx.scheduler.runAfter(0, internal.intents.executor.execute, {
              intentId: args.intentId,
            });
          }
        }
      } else {
        // No parsed intent and not conversational - use responseText if available
        console.log("[Solver] AI returned no parsedIntent, using responseText");
        await ctx.runMutation(internal.intents.intents.updateStatus, {
          intentId: args.intentId,
          status: "completed",
          responseText: aiResponse.responseText || "I'm not sure how to help with that. Try asking me to create a card, fund your wallet, or make a transfer!",
        });
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
 * Build conversation history from recent intents
 * Formats previous user requests and AI responses for context
 */
function buildConversationHistory(recentIntents: any[]): string {
  if (!recentIntents || recentIntents.length === 0) {
    return "";
  }

  // Reverse to show oldest first (chronological order)
  const chronological = [...recentIntents].reverse();

  const history = chronological.map((intent) => {
    let entry = `User: ${intent.rawText}`;
    if (intent.responseText) {
      entry += `\nAssistant: ${intent.responseText}`;
    }
    if (intent.parsedIntent?.action) {
      entry += ` [Action: ${intent.parsedIntent.action}]`;
    }
    return entry;
  });

  return history.join("\n\n");
}

/**
 * Gather user context for Claude prompt
 */
async function gatherUserContext(ctx: any, userId: Id<"users">): Promise<{
  cards: Array<{ id: string; last4: string; balance: number; status: string; nickname?: string; createdAt: number }>;
  wallets: Array<{ id: string; network: string; type: string; balance?: number; nickname?: string }>;
  defiPositions: Array<{ id: string; protocol: string; available: number; yield: number }>;
}> {
  // Query user's cards
  const cards = await ctx.runQuery(internal.cards.cards.listByUserId, { userId });

  // Query user's wallets
  const wallets = await ctx.runQuery(internal.wallets.wallets.listByUserId, { userId });

  // Query user's DeFi positions
  const defiPositions = await ctx.runQuery(internal.wallets.defi.listByUserId, { userId });

  return {
    // Sort cards by createdAt (oldest first) so AI knows order
    cards: (cards || [])
      .sort((a: Doc<"cards">, b: Doc<"cards">) => a.createdAt - b.createdAt)
      .map((c: Doc<"cards">) => ({
        id: c._id,
        last4: c.last4,
        balance: c.currentBalance || 0,
        status: c.status,
        nickname: c.nickname,
        createdAt: c.createdAt,
      })),
    wallets: (wallets || []).map((w: Doc<"wallets">) => ({
      id: w._id,
      network: w.networkType,
      type: w.walletType,
      balance: w.cachedBalanceUsd,
      nickname: w.nickname,
    })),
    defiPositions: (defiPositions || []).map((d: Doc<"defi">) => ({
      id: d._id,
      protocol: d.protocolName,
      available: d.availableForFunding,
      yield: d.currentYieldApy,
    })),
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
  return `You are DisCard AI, a friendly and helpful assistant for DisCard - a privacy-first virtual card platform built on Solana.

You can help users with two types of requests:
1. **Conversational**: Answer questions, explain features, provide guidance
2. **Actions**: Execute financial actions like creating cards, funding cards, transfers, swaps

## User's Available Resources

### Cards (sorted oldest to newest)
${userContext.cards.length > 0
  ? JSON.stringify(userContext.cards.map((c, index) => ({
      id: c.id,
      last4: c.last4,
      balance_cents: c.balance,
      status: c.status,
      nickname: c.nickname,
      created_at: c.createdAt,
      age_rank: index + 1, // 1 = oldest, higher = newer
    })), null, 2)
  : "No cards yet. User can create their first virtual card."}

### Wallets
${userContext.wallets.length > 0
  ? JSON.stringify(userContext.wallets.map(w => ({
      id: w.id,
      network: w.network,
      type: w.type,
      balance_cents: w.balance,
      nickname: w.nickname,
    })), null, 2)
  : "Default passkey wallet available (linked to their Solana address)."}

### DeFi Positions
${userContext.defiPositions.length > 0
  ? JSON.stringify(userContext.defiPositions.map(d => ({
      id: d.id,
      protocol: d.protocol,
      available_cents: d.available,
      yield_apy_bps: d.yield,
    })), null, 2)
  : "No DeFi positions yet."}

## Output Format

ALWAYS respond with a JSON object. Choose ONE of these response types:

### Type 1: Conversational Response (for questions, greetings, info requests)
{
  "isConversational": true,
  "responseText": "Your friendly, helpful response here. Be concise but informative.",
  "needsClarification": false,
  "confidence": 1.0
}

### Type 2: Action Response (for financial actions)
{
  "isConversational": false,
  "responseText": "I'll create a new virtual card for you.",
  "parsedIntent": {
    "action": "fund_card" | "swap" | "transfer" | "withdraw_defi" | "create_card" | "freeze_card" | "delete_card" | "pay_bill",
    "sourceType": "wallet" | "defi_position" | "card" | "external",
    "sourceId": "<id or null>",
    "targetType": "card" | "wallet" | "external",
    "targetId": "<id or null>",
    "amount": <number in cents or null>,
    "currency": "USD" | "ETH" | "SOL" | etc,
    "metadata": { any additional context }
  },
  "needsClarification": false,
  "confidence": 0.95
}

### Type 3: Clarification Needed
{
  "isConversational": false,
  "responseText": "I'd be happy to help with that!",
  "needsClarification": true,
  "clarificationQuestion": "How much would you like to add to your card?",
  "confidence": 0.6
}

## Important Rules

1. **ALWAYS include responseText** - This is your natural language response to the user
2. For conversational messages (greetings, questions about the app, asking for info), set isConversational: true
3. For action requests (create card, fund, transfer, swap), set isConversational: false and include parsedIntent
4. Be friendly, concise, and helpful
5. All amounts are in cents (100 = $1.00)
6. If information is missing for an action, ask for clarification naturally

## Examples

User: "Hello!"
Response: {
  "isConversational": true,
  "responseText": "Hey there! I'm your DisCard assistant. I can help you create virtual cards, manage your funds, make transfers, and more. What would you like to do?",
  "needsClarification": false,
  "confidence": 1.0
}

User: "What can you do?"
Response: {
  "isConversational": true,
  "responseText": "I can help you with: creating virtual cards for online privacy, funding your cards from your Solana wallet, transferring money to friends, swapping tokens, and managing your DeFi positions. Just tell me what you need!",
  "needsClarification": false,
  "confidence": 1.0
}

User: "Show me my cards"
Response: {
  "isConversational": true,
  "responseText": "${userContext.cards.length > 0
    ? `You have ${userContext.cards.length} card(s). Check the Cards tab to see details like balances and spending limits.`
    : "You don't have any cards yet. Would you like me to create one for you?"}",
  "needsClarification": false,
  "confidence": 1.0
}

User: "Create a new card"
Response: {
  "isConversational": false,
  "responseText": "I'll create a new virtual card for you right away.",
  "parsedIntent": {
    "action": "create_card",
    "sourceType": "wallet",
    "targetType": "card",
    "metadata": {}
  },
  "needsClarification": false,
  "confidence": 0.95
}

User: "Fund my card with $50"
Response: {
  "isConversational": false,
  "responseText": "I'll add $50 to your card.",
  "parsedIntent": {
    "action": "fund_card",
    "sourceType": "wallet",
    "sourceId": null,
    "targetType": "card",
    "targetId": null,
    "amount": 5000,
    "currency": "USD"
  },
  "needsClarification": false,
  "confidence": 0.95
}

User: "Send money"
Response: {
  "isConversational": false,
  "responseText": "I can help you send money!",
  "needsClarification": true,
  "clarificationQuestion": "How much would you like to send, and who should I send it to?",
  "confidence": 0.5
}

User: "Delete my card ending in 7796"
Response: {
  "isConversational": false,
  "responseText": "I'll delete the card ending in 7796 for you.",
  "parsedIntent": {
    "action": "delete_card",
    "sourceType": "wallet",
    "targetType": "card",
    "targetId": "<the card id from context with last4=7796>",
    "metadata": {}
  },
  "needsClarification": false,
  "confidence": 0.95
}

User: "Delete my 3 oldest cards"
Response: {
  "isConversational": false,
  "responseText": "I'll delete your 3 oldest cards.",
  "parsedIntent": {
    "action": "delete_card",
    "sourceType": "wallet",
    "targetType": "card",
    "metadata": {
      "cardIds": ["<id1>", "<id2>", "<id3>"]
    }
  },
  "needsClarification": false,
  "confidence": 0.95
}

## Card Selection Rules
- When user says "oldest cards", sort by creation time (older cards have smaller timestamps/ids)
- When user says "card ending in XXXX", match the last4 field
- For delete_card with multiple cards, put the card IDs in metadata.cardIds array
- For delete_card with single card, use targetId
- ALWAYS use actual card IDs from the User's Available Resources section above`;
}

/**
 * Call Phala RedPill AI (OpenAI-compatible API)
 */
async function callPhalaAI(
  systemPrompt: string,
  userMessage: string
): Promise<ClaudeResponse> {
  console.log("[Solver] callPhalaAI - checking API key...");
  if (!PHALA_AI_API_KEY) {
    console.error("[Solver] PHALA_AI_API_KEY is missing!");
    throw new Error("Phala AI API key not configured. Please add PHALA_AI_API_KEY to Convex environment variables.");
  }

  const endpoint = `${PHALA_AI_BASE_URL}/chat/completions`;
  console.log("[Solver] Making fetch request to:", endpoint);
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${PHALA_AI_API_KEY}`,
    },
    body: JSON.stringify({
      model: PHALA_AI_MODEL,
      max_tokens: 1024,
      messages: [
        {
          role: "system",
          content: systemPrompt,
        },
        {
          role: "user",
          content: userMessage,
        },
      ],
    }),
  });

  console.log("[Solver] Fetch response status:", response.status);
  if (!response.ok) {
    const error = await response.text();
    console.error("[Solver] Phala AI API error:", response.status, error);
    throw new Error(`Phala AI API error: ${response.status} - ${error}`);
  }

  const result = await response.json();
  console.log("[Solver] Raw Phala AI result received");

  // Extract content from OpenAI-compatible response
  const content = result.choices?.[0]?.message?.content;
  if (!content) {
    console.error("[Solver] Empty response from Phala AI:", JSON.stringify(result));
    throw new Error("Empty response from Phala AI");
  }
  console.log("[Solver] Extracted content length:", content.length);

  // Parse JSON from response
  try {
    // Find JSON in the response (LLM might include explanation text)
    console.log("[Solver] Parsing JSON from response...");
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.error("[Solver] No JSON found in content:", content.substring(0, 500));
      throw new Error("No JSON found in Phala AI response");
    }

    const parsed = JSON.parse(jsonMatch[0]);
    console.log("[Solver] Successfully parsed JSON response");

    return {
      parsedIntent: parsed.parsedIntent,
      needsClarification: parsed.needsClarification ?? false,
      clarificationQuestion: parsed.clarificationQuestion,
      confidence: parsed.confidence ?? 0.5,
      responseText: parsed.responseText,
      isConversational: parsed.isConversational ?? false,
    };
  } catch (parseError) {
    console.error("[Solver] Failed to parse Phala AI response:", content.substring(0, 500));
    throw new Error("Failed to parse Phala AI response as JSON");
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
 * Sanitize parsed intent from AI response
 * - Converts null values to undefined (Convex validators expect undefined, not null)
 * - Validates action, sourceType, targetType are valid enum values
 * - Returns null if the intent is not valid (e.g., conversational messages)
 */
function sanitizeParsedIntent(rawIntent: any): ParsedIntent | null {
  if (!rawIntent || typeof rawIntent !== 'object') {
    console.log("[Solver] sanitizeParsedIntent: rawIntent is null or not an object");
    return null;
  }

  // Validate action is a known type
  const action = rawIntent.action;
  if (!action || !VALID_ACTIONS.includes(action)) {
    console.log("[Solver] sanitizeParsedIntent: invalid action:", action);
    return null;
  }

  // Validate sourceType (default to 'wallet' if missing)
  let sourceType = rawIntent.sourceType;
  if (!sourceType || !VALID_SOURCE_TYPES.includes(sourceType)) {
    sourceType = "wallet"; // Default source
  }

  // Validate targetType (default based on action)
  let targetType = rawIntent.targetType;
  if (!targetType || !VALID_TARGET_TYPES.includes(targetType)) {
    targetType = action === "fund_card" ? "card" : "wallet"; // Default target
  }

  // Build sanitized intent, converting null to undefined
  const sanitized: ParsedIntent = {
    action: action as IntentAction,
    sourceType: sourceType as SourceType,
    targetType: targetType as TargetType,
  };

  // Only include optional fields if they have non-null values
  if (rawIntent.sourceId != null && rawIntent.sourceId !== "") {
    sanitized.sourceId = String(rawIntent.sourceId);
  }
  if (rawIntent.targetId != null && rawIntent.targetId !== "") {
    sanitized.targetId = String(rawIntent.targetId);
  }
  if (rawIntent.amount != null && typeof rawIntent.amount === 'number') {
    sanitized.amount = rawIntent.amount;
  }
  if (rawIntent.currency != null && rawIntent.currency !== "") {
    sanitized.currency = String(rawIntent.currency);
  }
  if (rawIntent.metadata != null && typeof rawIntent.metadata === 'object') {
    sanitized.metadata = rawIntent.metadata;
  }

  console.log("[Solver] sanitizeParsedIntent: sanitized intent:", JSON.stringify(sanitized));
  return sanitized;
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
