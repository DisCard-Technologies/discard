/**
 * AI/Intent Test Helpers
 *
 * Utilities for testing AI intent classification, NLP parsing, and conversation flows.
 */

import { INTENT_TEST_CASES, type ParsedIntent, type IntentAction } from '../fixtures/intents';

// ============================================================================
// Amount Parsing
// ============================================================================

/**
 * Parse amount from natural language input
 * Returns amount in cents for USD, or raw amount for crypto
 */
export function parseAmount(input: string): {
  amount: number | null;
  isCrypto: boolean;
  currency: string | null;
} {
  const patterns = {
    // $50, $1,500, $1,500.50
    usdDollarSign: /\$([0-9,]+(?:\.[0-9]{1,2})?)/i,
    // 50 dollars, 100 bucks
    usdWord: /([0-9,]+(?:\.[0-9]{1,2})?)\s*(dollars?|bucks?)/i,
    // 5k, 1.5k (thousands)
    thousands: /([0-9.]+)k\b/i,
    // 100 USDC, 1.5 SOL
    crypto: /([0-9.]+)\s*(USDC|USDT|SOL|ETH|BTC|BONK)/i,
    // Plain number at start
    plainNumber: /^([0-9,]+(?:\.[0-9]+)?)\b/,
  };

  // Check for thousands notation
  const thousandsMatch = input.match(patterns.thousands);
  if (thousandsMatch) {
    const amount = parseFloat(thousandsMatch[1]) * 1000;
    return { amount: amount * 100, isCrypto: false, currency: 'USD' }; // Convert to cents
  }

  // Check for USD with dollar sign
  const usdDollarMatch = input.match(patterns.usdDollarSign);
  if (usdDollarMatch) {
    const amount = parseFloat(usdDollarMatch[1].replace(/,/g, ''));
    return { amount: amount * 100, isCrypto: false, currency: 'USD' }; // Convert to cents
  }

  // Check for USD with word
  const usdWordMatch = input.match(patterns.usdWord);
  if (usdWordMatch) {
    const amount = parseFloat(usdWordMatch[1].replace(/,/g, ''));
    return { amount: amount * 100, isCrypto: false, currency: 'USD' }; // Convert to cents
  }

  // Check for crypto amounts
  const cryptoMatch = input.match(patterns.crypto);
  if (cryptoMatch) {
    const amount = parseFloat(cryptoMatch[1]);
    const currency = cryptoMatch[2].toUpperCase();
    return { amount, isCrypto: true, currency };
  }

  // Check for plain number
  const plainMatch = input.match(patterns.plainNumber);
  if (plainMatch) {
    const amount = parseFloat(plainMatch[1].replace(/,/g, ''));
    return { amount: amount * 100, isCrypto: false, currency: 'USD' }; // Assume USD cents
  }

  return { amount: null, isCrypto: false, currency: null };
}

/**
 * Parse currency from input
 */
export function parseCurrency(input: string): string | null {
  const currencyMap: Record<string, string> = {
    '$': 'USD',
    'dollar': 'USD',
    'dollars': 'USD',
    'buck': 'USD',
    'bucks': 'USD',
    'usdc': 'USDC',
    'usdt': 'USDT',
    'sol': 'SOL',
    'solana': 'SOL',
    'eth': 'ETH',
    'ethereum': 'ETH',
    'btc': 'BTC',
    'bitcoin': 'BTC',
    'bonk': 'BONK',
  };

  const lowerInput = input.toLowerCase();

  for (const [key, value] of Object.entries(currencyMap)) {
    if (lowerInput.includes(key)) {
      return value;
    }
  }

  // Check for dollar sign
  if (input.includes('$')) {
    return 'USD';
  }

  return null;
}

// ============================================================================
// Intent Classification
// ============================================================================

/**
 * Simple rule-based intent classifier for testing
 * In production, this would use the AI model
 */
export function classifyIntentSimple(input: string): {
  action: IntentAction;
  confidence: number;
  needsClarification: boolean;
} {
  const lowerInput = input.toLowerCase().trim();

  // Greeting patterns
  const greetings = ['hello', 'hi', 'hey', 'good morning', 'good afternoon', 'good evening'];
  if (greetings.some((g) => lowerInput.startsWith(g))) {
    return { action: 'conversation', confidence: 0.95, needsClarification: false };
  }

  // Thanks patterns
  const thanks = ['thanks', 'thank you', 'thx', 'ty'];
  if (thanks.some((t) => lowerInput.includes(t))) {
    return { action: 'conversation', confidence: 0.95, needsClarification: false };
  }

  // Bye patterns
  const byes = ['bye', 'goodbye', 'see you', 'later'];
  if (byes.some((b) => lowerInput.includes(b))) {
    return { action: 'conversation', confidence: 0.95, needsClarification: false };
  }

  // Simple acknowledgments
  if (['ok', 'okay', 'sure', 'yes', 'no', 'yep', 'nope'].includes(lowerInput)) {
    return { action: 'conversation', confidence: 0.90, needsClarification: false };
  }

  // Question patterns
  if (
    lowerInput.includes('what is') ||
    lowerInput.includes('how do') ||
    lowerInput.includes('how much') ||
    lowerInput.includes('where is') ||
    lowerInput.includes('can i') ||
    lowerInput.includes('?')
  ) {
    return { action: 'question', confidence: 0.85, needsClarification: false };
  }

  // Transfer patterns
  if (
    lowerInput.includes('send') ||
    lowerInput.includes('transfer') ||
    lowerInput.includes('pay') ||
    lowerInput.includes('wire')
  ) {
    const hasAmount = parseAmount(input).amount !== null;
    return {
      action: 'transfer',
      confidence: hasAmount ? 0.90 : 0.70,
      needsClarification: !hasAmount,
    };
  }

  // Swap patterns
  if (
    lowerInput.includes('swap') ||
    lowerInput.includes('convert') ||
    lowerInput.includes('exchange') ||
    lowerInput.includes('trade') ||
    lowerInput.includes('buy')
  ) {
    return { action: 'swap', confidence: 0.85, needsClarification: false };
  }

  // Card funding patterns
  if (
    lowerInput.includes('fund my card') ||
    (lowerInput.includes('add') && lowerInput.includes('card')) ||
    (lowerInput.includes('load') && lowerInput.includes('card')) ||
    (lowerInput.includes('put') && lowerInput.includes('card')) ||
    lowerInput.includes('top up')
  ) {
    const hasAmount = parseAmount(input).amount !== null;
    return {
      action: 'fund_card',
      confidence: hasAmount ? 0.88 : 0.65,
      needsClarification: !hasAmount,
    };
  }

  // Card freeze patterns
  if (
    lowerInput.includes('freeze') ||
    lowerInput.includes('lock') ||
    lowerInput.includes('pause')
  ) {
    return { action: 'freeze_card', confidence: 0.90, needsClarification: false };
  }

  // Card creation patterns
  if (
    lowerInput.includes('create') && lowerInput.includes('card') ||
    lowerInput.includes('new card') ||
    lowerInput.includes('make a card')
  ) {
    return { action: 'create_card', confidence: 0.88, needsClarification: false };
  }

  // Card deletion patterns
  if (
    lowerInput.includes('delete') && lowerInput.includes('card') ||
    lowerInput.includes('remove') && lowerInput.includes('card')
  ) {
    return { action: 'delete_card', confidence: 0.88, needsClarification: false };
  }

  // Unknown intent
  return { action: 'unknown', confidence: 0.30, needsClarification: true };
}

// ============================================================================
// Test Assertion Helpers
// ============================================================================

/**
 * Create expected parsed intent for comparison
 */
export function expectedIntent(
  action: IntentAction,
  overrides: Partial<ParsedIntent> = {}
): Partial<ParsedIntent> {
  return {
    action,
    needsClarification: false,
    ...overrides,
  };
}

/**
 * Verify intent classification matches expected
 */
export function expectIntentToMatch(
  actual: Partial<ParsedIntent>,
  expected: Partial<ParsedIntent>
): void {
  if (expected.action) {
    expect(actual.action).toBe(expected.action);
  }
  if (expected.amount !== undefined) {
    expect(actual.amount).toBe(expected.amount);
  }
  if (expected.currency) {
    expect(actual.currency).toBe(expected.currency);
  }
  if (expected.needsClarification !== undefined) {
    expect(actual.needsClarification).toBe(expected.needsClarification);
  }
  if (expected.confidence !== undefined) {
    expect(actual.confidence).toBeGreaterThanOrEqual(expected.confidence - 0.1);
  }
}

// ============================================================================
// Test Case Generation
// ============================================================================

/**
 * Generate parameterized test cases for intent classification
 */
export function generateIntentTestCases(category: keyof typeof INTENT_TEST_CASES) {
  return INTENT_TEST_CASES[category];
}

/**
 * Get all transfer test cases
 */
export function getTransferTestCases() {
  return INTENT_TEST_CASES.transfers;
}

/**
 * Get all swap test cases
 */
export function getSwapTestCases() {
  return INTENT_TEST_CASES.swaps;
}

/**
 * Get all question test cases
 */
export function getQuestionTestCases() {
  return INTENT_TEST_CASES.questions;
}

/**
 * Get all conversation test cases
 */
export function getConversationTestCases() {
  return INTENT_TEST_CASES.conversations;
}

/**
 * Get amount extraction test cases
 */
export function getAmountExtractionTestCases() {
  return INTENT_TEST_CASES.amountExtraction;
}

// ============================================================================
// Mock AI Response Builder
// ============================================================================

/**
 * Build a mock AI response for testing
 */
export function buildMockAIResponse(config: {
  action: IntentAction;
  success?: boolean;
  needsClarification?: boolean;
  clarificationQuestion?: string;
  responseText?: string;
  confidence?: number;
  intent?: Partial<ParsedIntent>;
  error?: string;
}): {
  success: boolean;
  responseText: string;
  needsClarification: boolean;
  clarificationQuestion?: string;
  confidence: number;
  intent?: Partial<ParsedIntent>;
  error?: string;
} {
  return {
    success: config.success ?? true,
    responseText: config.responseText ?? `Processing ${config.action} request...`,
    needsClarification: config.needsClarification ?? false,
    clarificationQuestion: config.clarificationQuestion,
    confidence: config.confidence ?? 0.90,
    intent: config.intent ?? {
      action: config.action,
      needsClarification: config.needsClarification ?? false,
    },
    error: config.error,
  };
}
