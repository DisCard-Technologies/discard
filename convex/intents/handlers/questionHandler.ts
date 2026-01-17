/**
 * DisCard Question Handler
 *
 * Handles user questions and information requests.
 * Attempts to answer without LLM when possible using templates and DB queries.
 *
 * Types of questions:
 * - Balance inquiries → Direct DB query
 * - Card information → Direct DB query
 * - How-to questions → Template responses
 * - Complex questions → LLM required
 */

import { ActionCtx } from "../../_generated/server";
import { Id, Doc } from "../../_generated/dataModel";
import { getTemplateResponse } from "../cache";
import { getTemplateKey } from "../classifier";

// ============================================================================
// Types
// ============================================================================

export interface QuestionResponse {
  /** The response text */
  response: string;
  /** Whether LLM was used */
  usedLLM: boolean;
  /** Response source */
  source: "template" | "database" | "llm";
  /** Additional data if applicable */
  data?: Record<string, unknown>;
}

export interface UserContext {
  cards: Array<{
    id: string;
    last4: string;
    balance: number;
    status: string;
  }>;
  walletBalance: number;
  walletCurrency: string;
  recentTransactions?: Array<{
    id: string;
    type: string;
    amount: number;
    status: string;
  }>;
}

// ============================================================================
// Handler Functions
// ============================================================================

/**
 * Handle a user question
 * Attempts to answer without LLM when possible
 */
export async function handleQuestion(
  ctx: ActionCtx,
  userId: Id<"users">,
  rawText: string,
  userContext?: UserContext
): Promise<QuestionResponse> {
  // 1. Check for template response
  const templateKey = getTemplateKey(rawText);
  if (templateKey) {
    const templateContext = userContext
      ? {
          cardCount: userContext.cards.length,
          balance: userContext.walletBalance,
          currency: userContext.walletCurrency,
        }
      : undefined;

    const templateResponse = getTemplateResponse(templateKey, templateContext);
    if (templateResponse) {
      return {
        response: templateResponse,
        usedLLM: false,
        source: "template",
      };
    }
  }

  // 2. Check for database queries we can answer directly
  const dbResponse = await handleDatabaseQuery(ctx, userId, rawText, userContext);
  if (dbResponse) {
    return dbResponse;
  }

  // 3. Fall back to LLM for complex questions
  return await handleLLMQuestion(ctx, userId, rawText, userContext);
}

/**
 * Handle questions that can be answered with database queries
 */
async function handleDatabaseQuery(
  ctx: ActionCtx,
  userId: Id<"users">,
  rawText: string,
  userContext?: UserContext
): Promise<QuestionResponse | null> {
  const normalized = rawText.toLowerCase();

  // Balance query
  if (/\b(balance|how much|funds|money)\b/.test(normalized)) {
    if (userContext) {
      const totalCardBalance = userContext.cards.reduce(
        (sum, card) => sum + card.balance,
        0
      );

      let response = `Your wallet balance is ${userContext.walletBalance} ${userContext.walletCurrency}.`;

      if (userContext.cards.length > 0) {
        response += `\n\nYou also have ${userContext.cards.length} card${userContext.cards.length === 1 ? "" : "s"}:`;
        for (const card of userContext.cards) {
          response += `\n• Card ending in ${card.last4}: $${(card.balance / 100).toFixed(2)}`;
        }
        response += `\n\nTotal across cards: $${(totalCardBalance / 100).toFixed(2)}`;
      }

      return {
        response,
        usedLLM: false,
        source: "database",
        data: {
          walletBalance: userContext.walletBalance,
          cardBalance: totalCardBalance,
          cardCount: userContext.cards.length,
        },
      };
    }
  }

  // Card query
  if (/\b(card|cards|visa|mastercard)\b/.test(normalized) && /\b(my|have|show|list)\b/.test(normalized)) {
    if (userContext) {
      if (userContext.cards.length === 0) {
        return {
          response: "You don't have any cards yet. Would you like me to help you create one?",
          usedLLM: false,
          source: "database",
          data: { cardCount: 0 },
        };
      }

      let response = `You have ${userContext.cards.length} card${userContext.cards.length === 1 ? "" : "s"}:\n`;

      for (const card of userContext.cards) {
        const statusEmoji = card.status === "active" ? "✓" : card.status === "frozen" ? "❄" : "⏸";
        response += `\n${statusEmoji} Card •••${card.last4} - $${(card.balance / 100).toFixed(2)} (${card.status})`;
      }

      return {
        response,
        usedLLM: false,
        source: "database",
        data: { cards: userContext.cards },
      };
    }
  }

  // Transaction history query
  if (/\b(transaction|history|recent|activity)\b/.test(normalized)) {
    if (userContext?.recentTransactions) {
      if (userContext.recentTransactions.length === 0) {
        return {
          response: "You don't have any recent transactions.",
          usedLLM: false,
          source: "database",
        };
      }

      let response = "Here are your recent transactions:\n";

      for (const tx of userContext.recentTransactions.slice(0, 5)) {
        const emoji = tx.type === "credit" ? "↓" : "↑";
        response += `\n${emoji} ${tx.type}: $${(tx.amount / 100).toFixed(2)} (${tx.status})`;
      }

      return {
        response,
        usedLLM: false,
        source: "database",
        data: { transactions: userContext.recentTransactions },
      };
    }
  }

  return null;
}

/**
 * Handle complex questions using LLM
 */
async function handleLLMQuestion(
  ctx: ActionCtx,
  userId: Id<"users">,
  rawText: string,
  userContext?: UserContext
): Promise<QuestionResponse> {
  // Build context-aware prompt
  const systemPrompt = buildQuestionSystemPrompt(userContext);
  const userPrompt = rawText;

  // Call Phala LLM
  const response = await callPhalLLM(systemPrompt, userPrompt);

  return {
    response,
    usedLLM: true,
    source: "llm",
  };
}

/**
 * Build system prompt for question answering
 */
function buildQuestionSystemPrompt(userContext?: UserContext): string {
  let prompt = `You are DisCard's helpful assistant. Answer the user's question concisely and accurately.

Keep responses under 100 words unless more detail is specifically needed.
Be direct and helpful. Don't be overly formal.`;

  if (userContext) {
    prompt += `\n\n## User's Current State
- Wallet balance: ${userContext.walletBalance} ${userContext.walletCurrency}
- Cards: ${userContext.cards.length} (${userContext.cards.map((c) => `•••${c.last4}`).join(", ") || "none"})`;
  }

  prompt += `\n\n## DisCard Features You Can Explain
- Virtual debit cards (Visa via Marqeta, Mastercard via Starpay)
- Token swaps via Jupiter DEX
- Privacy features (shielded deposits, ZK transfers)
- Card funding from crypto wallet
- P2P transfers

If the user asks about something you don't have information on, say so honestly.`;

  return prompt;
}

/**
 * Call Phala LLM API
 */
async function callPhalLLM(
  systemPrompt: string,
  userPrompt: string
): Promise<string> {
  const apiKey = process.env.PHALA_AI_API_KEY;
  const baseUrl = process.env.PHALA_AI_BASE_URL || "https://api.redpill.ai/v1";
  const model = process.env.PHALA_AI_MODEL || "meta-llama/llama-3.3-70b-instruct";

  if (!apiKey) {
    return "I'm having trouble connecting to my knowledge base. Please try again later.";
  }

  try {
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        max_tokens: 512,
        temperature: 0.3,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
      }),
    });

    if (!response.ok) {
      console.error("[QuestionHandler] LLM API error:", response.status);
      return "I'm having trouble processing your question right now. Please try again.";
    }

    const data = await response.json();
    return data.choices?.[0]?.message?.content || "I couldn't generate a response. Please try rephrasing your question.";
  } catch (error) {
    console.error("[QuestionHandler] LLM call failed:", error);
    return "I encountered an error while processing your question. Please try again.";
  }
}

// ============================================================================
// Exports
// ============================================================================

export default {
  handleQuestion,
};
