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
      ];
    }
    return undefined;
  }

  /**
   * Convert action to verb for natural language
   */
  private actionToVerb(action: IntentAction): string {
    const verbs: Record<IntentAction, string> = {
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
      unknown: "proceed",
    };
    return verbs[action];
  }
}
