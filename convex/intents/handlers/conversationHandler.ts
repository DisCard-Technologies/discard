/**
 * DisCard Conversation Handler
 *
 * Handles conversational interactions that don't require actions.
 * Greetings, thanks, feedback, and general chat.
 *
 * Most responses are templated for instant response without LLM.
 */

import { ActionCtx } from "../../_generated/server";
import { Id } from "../../_generated/dataModel";

// ============================================================================
// Types
// ============================================================================

export interface ConversationResponse {
  /** The response text */
  response: string;
  /** Whether LLM was used */
  usedLLM: boolean;
  /** Conversation type detected */
  conversationType: ConversationType;
  /** Suggested follow-up actions */
  suggestedActions?: string[];
}

export type ConversationType =
  | "greeting"
  | "thanks"
  | "goodbye"
  | "acknowledgment"
  | "help"
  | "feedback"
  | "general";

// ============================================================================
// Constants
// ============================================================================

/** Template responses for common conversation types */
const CONVERSATION_TEMPLATES: Record<ConversationType, string[]> = {
  greeting: [
    "Hello! How can I help you today?",
    "Hi there! What would you like to do?",
    "Hey! Ready to help. What do you need?",
  ],
  thanks: [
    "You're welcome! Let me know if you need anything else.",
    "Happy to help! Anything else?",
    "No problem! Is there anything else I can assist with?",
  ],
  goodbye: [
    "Goodbye! Have a great day!",
    "See you later! Take care.",
    "Bye! Come back anytime.",
  ],
  acknowledgment: [
    "Got it! What would you like to do next?",
    "Understood. How can I help?",
    "Okay! What's next?",
  ],
  help: [
    `Here's what I can help you with:

• **Fund a card** - Add money to your virtual card
• **Send/Transfer** - Send funds to another wallet
• **Swap tokens** - Exchange USDC, SOL, etc.
• **Create card** - Get a new virtual card
• **Check balance** - View your balances
• **View history** - See recent transactions

Just tell me what you'd like to do!`,
  ],
  feedback: [
    "Thanks for the feedback! We're always looking to improve.",
    "I appreciate you letting me know. Is there anything else I can help with?",
  ],
  general: [
    "I'm here to help with your DisCard wallet. What would you like to do?",
  ],
};

/** Suggested actions for different conversation types */
const SUGGESTED_ACTIONS: Record<ConversationType, string[]> = {
  greeting: ["Check balance", "Fund card", "Send money"],
  thanks: ["Check balance", "View history"],
  goodbye: [],
  acknowledgment: ["Check balance", "Fund card", "Send money"],
  help: ["Fund card", "Send money", "Swap tokens", "Create card"],
  feedback: ["Continue with a task"],
  general: ["Check balance", "Fund card", "Send money"],
};

// ============================================================================
// Handler Functions
// ============================================================================

/**
 * Handle a conversational input
 */
export async function handleConversation(
  ctx: ActionCtx,
  userId: Id<"users">,
  rawText: string
): Promise<ConversationResponse> {
  const conversationType = detectConversationType(rawText);
  const response = getTemplateResponse(conversationType);

  return {
    response,
    usedLLM: false,
    conversationType,
    suggestedActions: SUGGESTED_ACTIONS[conversationType],
  };
}

/**
 * Detect the type of conversation
 */
function detectConversationType(input: string): ConversationType {
  const normalized = input.toLowerCase().trim();

  // Greeting patterns
  if (/^(hi|hello|hey|good (morning|afternoon|evening)|howdy|yo|sup|what'?s up)/i.test(normalized)) {
    return "greeting";
  }

  // Thanks patterns
  if (/^(thanks|thank you|thx|ty|appreciate|great|awesome|perfect|nice|wonderful|excellent)/i.test(normalized)) {
    return "thanks";
  }

  // Goodbye patterns
  if (/^(bye|goodbye|see you|later|cya|gtg|gotta go|take care)/i.test(normalized)) {
    return "goodbye";
  }

  // Acknowledgment patterns
  if (/^(ok|okay|sure|got it|understood|makes sense|i see|alright|right|yep|yeah|yes)/i.test(normalized)) {
    return "acknowledgment";
  }

  // Help patterns
  if (/^(help|assist|support|what can you do|commands|options|menu)$/i.test(normalized)) {
    return "help";
  }

  // Feedback patterns
  if (/\b(feedback|suggest|improve|issue|problem|bug|complaint)\b/i.test(normalized)) {
    return "feedback";
  }

  return "general";
}

/**
 * Get a random template response for variety
 */
function getTemplateResponse(conversationType: ConversationType): string {
  const templates = CONVERSATION_TEMPLATES[conversationType];
  const randomIndex = Math.floor(Math.random() * templates.length);
  return templates[randomIndex];
}

/**
 * Check if input looks conversational
 */
export function isConversational(input: string): boolean {
  const normalized = input.toLowerCase().trim();

  // Short inputs are often conversational
  if (normalized.length < 15 && !/\d/.test(normalized)) {
    // Check if it matches any conversation pattern
    const patterns = [
      /^(hi|hello|hey|yo|sup)/i,
      /^(thanks|thank|thx|ty)/i,
      /^(bye|goodbye|later|cya)/i,
      /^(ok|okay|sure|got it|yes|no|yeah|nah)/i,
      /^(help)$/i,
    ];

    return patterns.some((p) => p.test(normalized));
  }

  return false;
}

// ============================================================================
// Exports
// ============================================================================

export default {
  handleConversation,
  detectConversationType,
  isConversational,
};
