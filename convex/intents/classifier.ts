/**
 * DisCard Intent Classifier
 *
 * Fast, rules-based intent classification to minimize LLM calls.
 * Routes user input to appropriate handler without hitting the AI for simple cases.
 *
 * Classification types:
 * - question: User asking for information (no action needed)
 * - conversation: Greetings, feedback, general chat
 * - action: Financial operations requiring execution
 * - ambiguous: Needs LLM to determine intent
 */

// ============================================================================
// Types
// ============================================================================

export type IntentType = "question" | "conversation" | "action" | "ambiguous";

export type ActionType =
  | "fund_card"
  | "transfer"
  | "swap"
  | "create_card"
  | "freeze_card"
  | "delete_card"
  | "check_balance"
  | "view_transactions"
  | "set_limit"
  | "pay_bill"
  | "withdraw_defi"
  | "create_goal"
  | "unknown";

export interface ClassificationResult {
  /** Primary classification */
  type: IntentType;
  /** Confidence score 0-1 */
  confidence: number;
  /** Suggested action type if type is "action" */
  suggestedAction?: ActionType;
  /** Extracted amount if present */
  extractedAmount?: number;
  /** Extracted currency if present */
  extractedCurrency?: string;
  /** Whether this can be handled without LLM */
  skipLLM: boolean;
  /** Reason for classification (debugging) */
  reason: string;
}

// ============================================================================
// Patterns
// ============================================================================

/** Question indicators - user seeking information */
const QUESTION_PATTERNS = [
  /^(what|how|why|when|where|who|which|can i|could i|is there|are there|do i|does|did|will|would|should)\b/i,
  /\?$/,
  /^(tell me|explain|show me|help me understand)/i,
  /^(what's|what is|how's|how do|how does|how can)/i,
];

/** Simple questions we can answer without LLM */
const SIMPLE_QUESTION_PATTERNS: Array<{ pattern: RegExp; response: string }> = [
  {
    pattern: /^(what('?s| is) my balance|show( me)? (my )?balance|balance\??)/i,
    response: "balance_query",
  },
  {
    pattern: /^(what('?s| is) my (card|cards)|show( me)? (my )?(card|cards)|my cards?\??)/i,
    response: "cards_query",
  },
  {
    pattern: /^(what can (you|i) do|help|what are (the )?commands)/i,
    response: "help_query",
  },
  {
    pattern: /^(how (do i|to) (fund|add|load|top up))/i,
    response: "help_funding",
  },
  {
    pattern: /^(how (do i|to) (send|transfer))/i,
    response: "help_transfer",
  },
  {
    pattern: /^(how (do i|to) (swap|exchange|convert))/i,
    response: "help_swap",
  },
  {
    pattern: /^(transaction|tx) (status|history)/i,
    response: "transaction_query",
  },
];

/** Conversation indicators - greetings, feedback, chat */
const CONVERSATION_PATTERNS = [
  /^(hi|hello|hey|good (morning|afternoon|evening)|howdy|yo|sup)/i,
  /^(thanks|thank you|thx|ty|appreciate it|great|awesome|perfect|nice)/i,
  /^(bye|goodbye|see you|later|cya|gtg)/i,
  /^(ok|okay|sure|got it|understood|makes sense|i see)/i,
  /^(help|assist|support)$/i,
  /^(yes|no|yeah|nah|yep|nope)$/i,
];

/** Action patterns - financial operations */
const ACTION_PATTERNS: Array<{ pattern: RegExp; action: ActionType }> = [
  // Fund card
  {
    pattern: /\b(fund|add|load|top[- ]?up|put)\b.*(card|visa|mastercard)/i,
    action: "fund_card",
  },
  {
    pattern: /\bcard\b.*(fund|add|load|top[- ]?up)/i,
    action: "fund_card",
  },

  // Transfer
  {
    pattern: /\b(send|transfer|move|wire|pay)\b.*\b(to|@)/i,
    action: "transfer",
  },
  {
    pattern: /\b(send|transfer)\b.*\$?\d+/i,
    action: "transfer",
  },

  // Swap
  {
    pattern: /\b(swap|exchange|convert|trade)\b/i,
    action: "swap",
  },
  {
    pattern: /\b(buy|sell)\b.*(sol|usdc|usdt|eth|btc)/i,
    action: "swap",
  },

  // Create card
  {
    pattern: /\b(create|make|get|new|generate|issue)\b.*(card|visa|mastercard)/i,
    action: "create_card",
  },

  // Freeze card
  {
    pattern: /\b(freeze|lock|pause|disable|block)\b.*(card)/i,
    action: "freeze_card",
  },
  {
    pattern: /\bcard\b.*(freeze|lock|pause|disable|block)/i,
    action: "freeze_card",
  },

  // Delete card
  {
    pattern: /\b(delete|remove|cancel|close)\b.*(card)/i,
    action: "delete_card",
  },

  // Check balance (action version - explicit request)
  {
    pattern: /\b(check|view|see|show)\b.*(balance|funds|money)/i,
    action: "check_balance",
  },

  // View transactions
  {
    pattern: /\b(view|show|see|list)\b.*(transaction|history|activity)/i,
    action: "view_transactions",
  },

  // Set limit
  {
    pattern: /\b(set|change|update|modify)\b.*(limit|spending|daily|monthly)/i,
    action: "set_limit",
  },

  // Pay bill
  {
    pattern: /\b(pay)\b.*(bill|invoice|subscription|rent|utilities)/i,
    action: "pay_bill",
  },

  // Withdraw DeFi
  {
    pattern: /\b(withdraw|pull|exit|unstake|claim)\b.*(defi|yield|staking|vault|pool)/i,
    action: "withdraw_defi",
  },

  // Goals
  {
    pattern: /\b(create|start|new)\b.*(goal|saving|target)/i,
    action: "create_goal",
  },
];

/** Amount extraction pattern */
const AMOUNT_PATTERN = /\$?\s*(\d{1,3}(?:,\d{3})*(?:\.\d{1,2})?|\d+(?:\.\d{1,2})?)\s*(k|thousand|million|m)?/i;

/** Currency patterns */
const CURRENCY_PATTERNS: Array<{ pattern: RegExp; currency: string }> = [
  { pattern: /\b(usd[c]?|dollar|dollars|\$)\b/i, currency: "USDC" },
  { pattern: /\busdt\b/i, currency: "USDT" },
  { pattern: /\b(sol|solana)\b/i, currency: "SOL" },
  { pattern: /\b(eth|ether|ethereum)\b/i, currency: "ETH" },
  { pattern: /\b(btc|bitcoin)\b/i, currency: "BTC" },
];

// ============================================================================
// Classification Functions
// ============================================================================

/**
 * Classify user input without using LLM
 * Returns classification with confidence and whether LLM can be skipped
 */
export function classifyIntent(input: string): ClassificationResult {
  const normalized = input.trim().toLowerCase();

  // Empty input
  if (!normalized) {
    return {
      type: "ambiguous",
      confidence: 0,
      skipLLM: false,
      reason: "Empty input",
    };
  }

  // Very short input (likely needs context)
  if (normalized.length < 3) {
    return {
      type: "ambiguous",
      confidence: 0.3,
      skipLLM: false,
      reason: "Input too short",
    };
  }

  // Check for simple questions we can answer directly
  for (const { pattern, response } of SIMPLE_QUESTION_PATTERNS) {
    if (pattern.test(normalized)) {
      return {
        type: "question",
        confidence: 0.95,
        skipLLM: true,
        reason: `Simple question: ${response}`,
      };
    }
  }

  // Check for conversation patterns
  for (const pattern of CONVERSATION_PATTERNS) {
    if (pattern.test(normalized)) {
      return {
        type: "conversation",
        confidence: 0.9,
        skipLLM: true,
        reason: "Matched conversation pattern",
      };
    }
  }

  // Check for action patterns
  for (const { pattern, action } of ACTION_PATTERNS) {
    if (pattern.test(input)) {
      const amount = extractAmount(input);
      const currency = extractCurrency(input);

      return {
        type: "action",
        confidence: 0.85,
        suggestedAction: action,
        extractedAmount: amount,
        extractedCurrency: currency,
        skipLLM: false, // Actions still need LLM for full parsing
        reason: `Matched action pattern: ${action}`,
      };
    }
  }

  // Check for general question patterns
  for (const pattern of QUESTION_PATTERNS) {
    if (pattern.test(normalized)) {
      return {
        type: "question",
        confidence: 0.7,
        skipLLM: false, // Complex questions need LLM
        reason: "Matched question pattern",
      };
    }
  }

  // Check if it contains financial indicators
  const hasAmount = AMOUNT_PATTERN.test(input);
  const hasCurrency = CURRENCY_PATTERNS.some(({ pattern }) => pattern.test(input));

  if (hasAmount || hasCurrency) {
    return {
      type: "action",
      confidence: 0.6,
      suggestedAction: "unknown",
      extractedAmount: hasAmount ? extractAmount(input) : undefined,
      extractedCurrency: hasCurrency ? extractCurrency(input) : undefined,
      skipLLM: false,
      reason: "Contains financial indicators",
    };
  }

  // Default: ambiguous, needs LLM
  return {
    type: "ambiguous",
    confidence: 0.5,
    skipLLM: false,
    reason: "No pattern matched",
  };
}

/**
 * Extract amount from input text
 */
export function extractAmount(input: string): number | undefined {
  const match = input.match(AMOUNT_PATTERN);
  if (!match) return undefined;

  let amount = parseFloat(match[1].replace(/,/g, ""));

  // Handle multipliers
  const multiplier = match[2]?.toLowerCase();
  if (multiplier === "k" || multiplier === "thousand") {
    amount *= 1000;
  } else if (multiplier === "m" || multiplier === "million") {
    amount *= 1000000;
  }

  return amount;
}

/**
 * Extract currency from input text
 */
export function extractCurrency(input: string): string | undefined {
  for (const { pattern, currency } of CURRENCY_PATTERNS) {
    if (pattern.test(input)) {
      return currency;
    }
  }
  return undefined;
}

/**
 * Check if classification allows skipping LLM entirely
 */
export function canSkipLLM(classification: ClassificationResult): boolean {
  return classification.skipLLM && classification.confidence >= 0.8;
}

/**
 * Get template response key for simple questions
 */
export function getTemplateKey(input: string): string | null {
  const normalized = input.trim().toLowerCase();

  for (const { pattern, response } of SIMPLE_QUESTION_PATTERNS) {
    if (pattern.test(normalized)) {
      return response;
    }
  }

  return null;
}

// ============================================================================
// Exports
// ============================================================================

export default {
  classifyIntent,
  extractAmount,
  extractCurrency,
  canSkipLLM,
  getTemplateKey,
};
