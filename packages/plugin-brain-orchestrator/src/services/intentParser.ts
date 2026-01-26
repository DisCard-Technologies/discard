/**
 * Intent Parser Service
 *
 * Parses natural language input into structured intents
 * using LLM-based NLP.
 */

import { v4 as uuidv4 } from "uuid";
import type {
  ParsedIntent,
  IntentAction,
  ExtractedEntity,
  EntityType,
  IntentClarification,
  SourceType,
  TargetType,
} from "../types/intent.js";

/**
 * Configuration for intent parser
 */
export interface IntentParserConfig {
  confidenceThreshold: number;
  clarificationThreshold: number;
  maxEntities: number;
  defaultCurrency: string;
}

/**
 * Default configuration
 */
const DEFAULT_CONFIG: IntentParserConfig = {
  confidenceThreshold: 0.7,
  clarificationThreshold: 0.5,
  maxEntities: 10,
  defaultCurrency: "USDC",
};

/**
 * Action patterns for intent recognition
 */
const ACTION_PATTERNS: Record<IntentAction, RegExp[]> = {
  // === Transactional Actions ===
  fund_card: [
    /(?:add|load|fund|put|deposit)\s+(?:money|funds?|cash|\$?\d+)\s*(?:on|to|into)?\s*(?:my\s+)?card/i,
    /(?:top\s*up|reload)\s+(?:my\s+)?card/i,
    /card\s+(?:fund|load|top\s*up)/i,
  ],
  transfer: [
    /(?:send|transfer|move|wire)\s+(?:\$?\d+|\d+\s*(?:usdc|sol|dollars?))/i,
    /(?:send|transfer)\s+(?:money|funds?|crypto)\s+to/i,
    /pay\s+(?:back|to)\s+\w+/i,
  ],
  swap: [
    /(?:swap|exchange|convert|trade)\s+(?:\$?\d+|\d+\s*(?:usdc|sol))/i,
    /(?:buy|sell)\s+(?:\$?\d+|\d+\s*(?:usdc|sol))/i,
  ],
  withdraw_defi: [
    /(?:withdraw|pull|exit|remove)\s+(?:from\s+)?(?:defi|liquidity|pool|staking|lending)/i,
    /(?:unstake|unlend|exit)\s+/i,
  ],
  create_card: [
    /(?:create|make|get|generate|new)\s+(?:a\s+)?(?:virtual\s+)?card/i,
    /(?:set\s*up|add)\s+(?:a\s+)?(?:new\s+)?card/i,
  ],
  freeze_card: [
    /(?:freeze|lock|pause|disable|block)\s+(?:my\s+)?card/i,
    /card\s+(?:freeze|lock|pause)/i,
  ],
  pay_bill: [
    /pay\s+(?:my\s+)?(?:bill|invoice|subscription)/i,
    /(?:bill|invoice)\s+pay(?:ment)?/i,
  ],
  check_balance: [
    /(?:check|show|what(?:'s| is)?)\s+(?:my\s+)?balance/i,
    /(?:how\s+much|balance)\s+(?:do\s+i\s+have|remaining)/i,
  ],
  view_transactions: [
    /(?:show|view|list|see)\s+(?:my\s+)?(?:transactions?|history|spending)/i,
    /(?:recent|past)\s+(?:transactions?|activity)/i,
  ],
  set_limit: [
    /(?:set|change|update|modify)\s+(?:my\s+)?(?:spending\s+)?limit/i,
    /limit\s+(?:to|at)\s+\$?\d+/i,
  ],

  // === Strategic Actions ===
  create_dca: [
    /(?:set\s*up|create|start|begin)\s+(?:a\s+)?dca/i,
    /(?:set\s*up|create|start)\s+(?:a\s+)?dollar[\s-]?cost[\s-]?averag/i,
    /buy\s+\$?\d+\s+(?:of\s+)?\w+\s+every\s+(?:hour|day|week|month)/i,
    /(?:recurring|automatic|auto)\s+(?:buy|purchase)\s+(?:of\s+)?\w+/i,
    /invest\s+\$?\d+\s+(?:in\s+)?\w+\s+(?:every|each)\s+(?:hour|day|week|month)/i,
    /dca\s+(?:into|for)\s+\w+/i,
  ],
  create_stop_loss: [
    /(?:set|create|add)\s+(?:a\s+)?stop[\s-]?loss/i,
    /sell\s+(?:my\s+)?\w+\s+(?:if|when)\s+(?:price\s+)?(?:drops?|falls?|goes?)\s+(?:below|under)/i,
    /protect\s+(?:my\s+)?\w+\s+(?:at|below)\s+\$?\d+/i,
    /(?:if|when)\s+\w+\s+(?:drops?|falls?)\s+(?:below|under)\s+\$?\d+\s*,?\s*sell/i,
  ],
  create_take_profit: [
    /(?:set|create|add)\s+(?:a\s+)?take[\s-]?profit/i,
    /sell\s+(?:my\s+)?\w+\s+(?:if|when)\s+(?:price\s+)?(?:hits?|reaches?|goes?\s+(?:above|over))/i,
    /(?:take|lock[\s-]?in)\s+profit\s+(?:at|when)\s+\$?\d+/i,
    /(?:if|when)\s+\w+\s+(?:hits?|reaches?)\s+\$?\d+\s*,?\s*sell/i,
  ],
  create_goal: [
    /(?:help\s+me\s+)?(?:save|accumulate)\s+\$?\d+/i,
    /(?:i\s+want\s+to|goal\s+(?:is\s+)?to|set\s+(?:a\s+)?goal\s+to)\s+(?:save|accumulate|reach|grow)/i,
    /(?:create|set\s*up|start)\s+(?:a\s+)?(?:savings?|investment|accumulation)\s+goal/i,
    /(?:grow|build|increase)\s+(?:my\s+)?(?:portfolio|savings?|wealth)\s+to\s+\$?\d+/i,
    /reach\s+\$?\d+\s+(?:by|before|within)/i,
    /(?:help\s+me\s+)?(?:save|invest)\s+(?:for|towards?)\s+\w+/i,
  ],
  list_strategies: [
    /(?:show|list|view|see|what(?:'s| is| are)?)\s+(?:my\s+)?(?:active\s+)?strateg(?:y|ies)/i,
    /(?:show|list|view)\s+(?:my\s+)?(?:dca|stop[\s-]?loss|take[\s-]?profit|goal)s?/i,
    /what\s+(?:strategies|automations?)\s+(?:do\s+i\s+have|are\s+active|are\s+running)/i,
    /(?:my\s+)?(?:active|running|current)\s+strateg(?:y|ies)/i,
  ],
  pause_strategy: [
    /(?:pause|hold|suspend)\s+(?:my\s+)?(?:dca|stop[\s-]?loss|take[\s-]?profit|goal|strategy)/i,
    /(?:stop|halt)\s+(?:my\s+)?(?:dca|strategy)\s+(?:temporarily|for\s+now)/i,
    /(?:put|place)\s+(?:my\s+)?(?:dca|strategy)\s+on\s+(?:hold|pause)/i,
  ],
  resume_strategy: [
    /(?:resume|restart|continue|reactivate)\s+(?:my\s+)?(?:dca|stop[\s-]?loss|take[\s-]?profit|goal|strategy)/i,
    /(?:unpause|start\s+again)\s+(?:my\s+)?(?:dca|strategy)/i,
    /(?:take|remove)\s+(?:my\s+)?(?:dca|strategy)\s+off\s+(?:hold|pause)/i,
  ],
  cancel_strategy: [
    /(?:cancel|stop|delete|remove|end)\s+(?:my\s+)?(?:dca|stop[\s-]?loss|take[\s-]?profit|goal|strategy)/i,
    /(?:turn\s+off|disable)\s+(?:my\s+)?(?:dca|strategy)/i,
    /(?:i\s+)?(?:don't|do\s+not)\s+want\s+(?:my\s+)?(?:dca|strategy)\s+anymore/i,
  ],
  strategy_status: [
    /(?:how(?:'s| is)?|what(?:'s| is)?)\s+(?:my\s+)?(?:dca|stop[\s-]?loss|take[\s-]?profit|goal|strategy)\s+(?:doing|status|progress)/i,
    /(?:check|show|view)\s+(?:my\s+)?(?:goal|dca|strategy)\s+(?:progress|status)/i,
    /(?:progress|status)\s+(?:of|on)\s+(?:my\s+)?(?:goal|dca|strategy)/i,
  ],
  unknown: [],
};

/**
 * Amount patterns for extraction
 */
const AMOUNT_PATTERNS = [
  /\$\s*(\d+(?:,\d{3})*(?:\.\d{2})?)/i,
  /(\d+(?:,\d{3})*(?:\.\d{2})?)\s*(?:dollars?|usd|usdc)/i,
  /(\d+(?:\.\d+)?)\s*(?:sol|solana)/i,
  /(\d+(?:,\d{3})*(?:\.\d{2})?)\s*(?:bucks?|k)/i,
];

/**
 * Intent Parser Service
 */
export class IntentParser {
  private config: IntentParserConfig;

  constructor(config?: Partial<IntentParserConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Parse natural language into structured intent
   */
  async parse(rawText: string): Promise<{
    intent: ParsedIntent;
    needsClarification: boolean;
    clarification?: IntentClarification;
  }> {
    const normalizedText = this.normalizeText(rawText);

    // Extract entities
    const entities = this.extractEntities(normalizedText);

    // Detect action
    const { action, confidence } = this.detectAction(normalizedText);

    // Extract amount
    const amount = this.extractAmount(normalizedText, entities);

    // Detect source and target
    const { sourceType, targetType } = this.detectSourceTarget(
      action,
      normalizedText
    );

    // Detect merchant if applicable
    const merchant = this.extractMerchant(normalizedText, entities);

    // Create parsed intent
    const intent: ParsedIntent = {
      intentId: uuidv4(),
      action,
      confidence,
      sourceType,
      targetType,
      amount,
      currency: this.detectCurrency(normalizedText) || this.config.defaultCurrency,
      merchant,
      rawText,
      entities,
      parsedAt: Date.now(),
    };

    // Check if clarification needed
    const needsClarification =
      confidence < this.config.clarificationThreshold ||
      this.isMissingRequiredFields(intent);

    let clarification: IntentClarification | undefined;
    if (needsClarification) {
      clarification = this.generateClarification(intent);
    }

    return { intent, needsClarification, clarification };
  }

  /**
   * Normalize input text
   */
  private normalizeText(text: string): string {
    return text
      .toLowerCase()
      .replace(/[^\w\s$.,@-]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  /**
   * Detect action from text
   */
  private detectAction(text: string): { action: IntentAction; confidence: number } {
    let bestMatch: { action: IntentAction; confidence: number } = {
      action: "unknown",
      confidence: 0,
    };

    for (const [action, patterns] of Object.entries(ACTION_PATTERNS)) {
      for (const pattern of patterns) {
        const match = text.match(pattern);
        if (match) {
          // Calculate confidence based on match quality
          const matchRatio = match[0].length / text.length;
          const confidence = Math.min(0.95, 0.7 + matchRatio * 0.3);

          if (confidence > bestMatch.confidence) {
            bestMatch = { action: action as IntentAction, confidence };
          }
        }
      }
    }

    return bestMatch;
  }

  /**
   * Extract entities from text
   */
  private extractEntities(text: string): ExtractedEntity[] {
    const entities: ExtractedEntity[] = [];

    // Extract amounts
    for (const pattern of AMOUNT_PATTERNS) {
      const match = text.match(pattern);
      if (match) {
        entities.push({
          type: "amount",
          value: match[1].replace(/,/g, ""),
          confidence: 0.9,
          startIndex: match.index || 0,
          endIndex: (match.index || 0) + match[0].length,
        });
        break;
      }
    }

    // Extract currency
    const currencyMatch = text.match(/\b(usdc|sol|usd|dollars?)\b/i);
    if (currencyMatch) {
      entities.push({
        type: "currency",
        value: this.normalizeCurrency(currencyMatch[1]),
        confidence: 0.95,
        startIndex: currencyMatch.index || 0,
        endIndex: (currencyMatch.index || 0) + currencyMatch[0].length,
      });
    }

    // Extract potential merchants
    const merchantMatch = text.match(
      /(?:at|to|from|for)\s+([A-Za-z]+(?:\s+[A-Za-z]+)?)/i
    );
    if (merchantMatch && !this.isCommonWord(merchantMatch[1])) {
      entities.push({
        type: "merchant",
        value: merchantMatch[1],
        confidence: 0.6,
        startIndex: merchantMatch.index || 0,
        endIndex: (merchantMatch.index || 0) + merchantMatch[0].length,
      });
    }

    return entities.slice(0, this.config.maxEntities);
  }

  /**
   * Extract amount from text
   */
  private extractAmount(
    text: string,
    entities: ExtractedEntity[]
  ): number | undefined {
    const amountEntity = entities.find((e) => e.type === "amount");
    if (amountEntity) {
      const value = parseFloat(amountEntity.value);
      // Handle "k" suffix (e.g., "5k" = 5000)
      if (text.includes("k") && value < 1000) {
        return value * 1000;
      }
      return value;
    }
    return undefined;
  }

  /**
   * Detect currency from text
   */
  private detectCurrency(text: string): string | undefined {
    if (/\b(usdc|usd|dollars?)\b/i.test(text)) return "USDC";
    if (/\b(sol|solana)\b/i.test(text)) return "SOL";
    return undefined;
  }

  /**
   * Normalize currency name
   */
  private normalizeCurrency(currency: string): string {
    const normalized = currency.toLowerCase();
    if (["usd", "dollars", "dollar"].includes(normalized)) return "USDC";
    if (["sol", "solana"].includes(normalized)) return "SOL";
    return currency.toUpperCase();
  }

  /**
   * Detect source and target types
   */
  private detectSourceTarget(
    action: IntentAction,
    text: string
  ): { sourceType?: SourceType; targetType?: TargetType } {
    switch (action) {
      case "fund_card":
        return { sourceType: "wallet", targetType: "card" };
      case "transfer":
        if (/to\s+(?:my\s+)?card/i.test(text)) {
          return { sourceType: "wallet", targetType: "card" };
        }
        if (/from\s+(?:my\s+)?card/i.test(text)) {
          return { sourceType: "card", targetType: "wallet" };
        }
        return { sourceType: "wallet", targetType: "external" };
      case "swap":
        return { sourceType: "wallet", targetType: "wallet" };
      case "withdraw_defi":
        return { sourceType: "defi_position", targetType: "wallet" };
      case "pay_bill":
        return { sourceType: "card", targetType: "merchant" };
      default:
        return {};
    }
  }

  /**
   * Extract merchant information
   */
  private extractMerchant(
    text: string,
    entities: ExtractedEntity[]
  ): ParsedIntent["merchant"] | undefined {
    const merchantEntity = entities.find((e) => e.type === "merchant");
    if (merchantEntity) {
      return {
        merchantName: merchantEntity.value,
        inferredFromText: true,
      };
    }
    return undefined;
  }

  /**
   * Check if word is a common word (not a merchant)
   */
  private isCommonWord(word: string): boolean {
    const commonWords = [
      "my",
      "the",
      "a",
      "an",
      "card",
      "wallet",
      "account",
      "balance",
      "money",
      "funds",
      "it",
      "this",
      "that",
    ];
    return commonWords.includes(word.toLowerCase());
  }

  /**
   * Check if intent is missing required fields
   */
  private isMissingRequiredFields(intent: ParsedIntent): boolean {
    switch (intent.action) {
      case "fund_card":
      case "transfer":
      case "swap":
        return intent.amount === undefined;
      case "pay_bill":
        return intent.merchant === undefined;
      // Strategy actions - these require conversational flow, not simple field extraction
      // Return false to let the strategy builder handle the conversation
      case "create_dca":
      case "create_stop_loss":
      case "create_take_profit":
      case "create_goal":
      case "list_strategies":
      case "pause_strategy":
      case "resume_strategy":
      case "cancel_strategy":
      case "strategy_status":
        return false;
      default:
        return false;
    }
  }

  /**
   * Generate clarification for ambiguous intent
   */
  private generateClarification(intent: ParsedIntent): IntentClarification {
    const missingFields: string[] = [];
    const ambiguousFields: string[] = [];
    let question = "";

    if (intent.action === "unknown") {
      question = "What would you like to do?";
      ambiguousFields.push("action");
    } else if (intent.amount === undefined) {
      question = "How much would you like to " + this.actionToVerb(intent.action) + "?";
      missingFields.push("amount");
    } else if (intent.confidence < this.config.confidenceThreshold) {
      question = `Did you mean to ${this.actionToVerb(intent.action)}?`;
      ambiguousFields.push("action");
    }

    return {
      intentId: intent.intentId,
      question,
      options: this.generateClarificationOptions(intent),
      missingFields,
      ambiguousFields,
    };
  }

  /**
   * Generate clarification options
   */
  private generateClarificationOptions(
    intent: ParsedIntent
  ): IntentClarification["options"] {
    if (intent.action === "unknown") {
      return [
        { label: "Add funds to card", value: "fund_card", confidence: 0.8 },
        { label: "Transfer money", value: "transfer", confidence: 0.8 },
        { label: "Swap crypto", value: "swap", confidence: 0.7 },
        { label: "Check balance", value: "check_balance", confidence: 0.7 },
        { label: "Set up DCA", value: "create_dca", confidence: 0.7 },
        { label: "Create a savings goal", value: "create_goal", confidence: 0.6 },
        { label: "View my strategies", value: "list_strategies", confidence: 0.6 },
      ];
    }
    return undefined;
  }

  /**
   * Convert action to verb for natural language
   */
  private actionToVerb(action: IntentAction): string {
    const verbs: Record<IntentAction, string> = {
      // Transactional
      fund_card: "add funds to your card",
      transfer: "transfer",
      swap: "swap",
      withdraw_defi: "withdraw from DeFi",
      create_card: "create a card",
      freeze_card: "freeze your card",
      pay_bill: "pay a bill",
      check_balance: "check your balance",
      view_transactions: "view transactions",
      set_limit: "set a limit",
      // Strategic
      create_dca: "set up dollar-cost averaging",
      create_stop_loss: "create a stop-loss",
      create_take_profit: "create a take-profit order",
      create_goal: "set up a savings goal",
      list_strategies: "view your strategies",
      pause_strategy: "pause your strategy",
      resume_strategy: "resume your strategy",
      cancel_strategy: "cancel your strategy",
      strategy_status: "check your strategy status",
      unknown: "proceed",
    };
    return verbs[action];
  }
}
