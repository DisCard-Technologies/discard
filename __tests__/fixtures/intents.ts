/**
 * Intent Test Fixtures
 *
 * Factory functions for creating test intent data and AI classification scenarios.
 */

import type { Id } from '@/convex/_generated/dataModel';

// ============================================================================
// Types
// ============================================================================

export type IntentAction =
  | 'fund_card'
  | 'swap'
  | 'transfer'
  | 'withdraw_defi'
  | 'create_card'
  | 'pay_bill'
  | 'freeze_card'
  | 'delete_card'
  | 'question'
  | 'conversation'
  | 'unknown';

export type IntentStatus =
  | 'pending'
  | 'parsing'
  | 'clarifying'
  | 'ready'
  | 'approved'
  | 'executing'
  | 'completed'
  | 'failed'
  | 'cancelled';

export interface ParsedIntent {
  action: IntentAction;
  sourceType?: 'wallet' | 'defi_position' | 'card';
  sourceId?: string;
  targetType?: 'card' | 'wallet' | 'external';
  targetId?: string;
  amount?: number;
  currency?: string;
  needsClarification: boolean;
  clarificationQuestion?: string;
  confidence: number;
  metadata?: Record<string, any>;
}

export interface TestIntent {
  _id: Id<'intents'>;
  userId: Id<'users'>;
  rawText: string;
  parsedIntent?: ParsedIntent;
  status: IntentStatus;
  clarificationQuestion?: string;
  clarificationResponse?: string;
  responseText?: string;
  solanaTransactionSignature?: string;
  error?: string;
  createdAt: number;
  updatedAt: number;
}

// ============================================================================
// Test Intent Input/Output Pairs
// ============================================================================

/**
 * Test cases for intent classification
 * Each case has input text and expected classification
 */
export const INTENT_TEST_CASES = {
  // Transfer intents
  transfers: [
    { input: 'send $50 to alice', expected: { action: 'transfer', amount: 5000, currency: 'USD' } },
    { input: 'transfer 100 USDC to bob.sol', expected: { action: 'transfer', amount: 100, currency: 'USDC' } },
    { input: 'pay john $25', expected: { action: 'transfer', amount: 2500, currency: 'USD' } },
    { input: 'send 1.5 SOL to DYw8...', expected: { action: 'transfer', amount: 1.5, currency: 'SOL' } },
    { input: 'wire $1,500 to mom', expected: { action: 'transfer', amount: 150000, currency: 'USD' } },
    { input: 'send 5k to savings', expected: { action: 'transfer', amount: 500000, currency: 'USD' } },
  ],

  // Swap intents
  swaps: [
    { input: 'swap 1 SOL for USDC', expected: { action: 'swap', amount: 1, currency: 'SOL' } },
    { input: 'convert 100 USDC to SOL', expected: { action: 'swap', amount: 100, currency: 'USDC' } },
    { input: 'exchange my SOL for USDT', expected: { action: 'swap', currency: 'SOL' } },
    { input: 'buy 50 USDC with SOL', expected: { action: 'swap', amount: 50, currency: 'USDC' } },
    { input: 'trade 0.5 ETH for USDC', expected: { action: 'swap', amount: 0.5, currency: 'ETH' } },
  ],

  // Card funding intents
  cardFunding: [
    { input: 'fund my card with $100', expected: { action: 'fund_card', amount: 10000, currency: 'USD' } },
    { input: 'add $50 to my travel card', expected: { action: 'fund_card', amount: 5000, currency: 'USD' } },
    { input: 'load 200 USDC onto my card', expected: { action: 'fund_card', amount: 200, currency: 'USDC' } },
    { input: 'top up my card', expected: { action: 'fund_card', needsClarification: true } },
    { input: 'put money on my shopping card', expected: { action: 'fund_card', needsClarification: true } },
  ],

  // Card management intents
  cardManagement: [
    { input: 'freeze my card', expected: { action: 'freeze_card' } },
    { input: 'lock my travel card', expected: { action: 'freeze_card' } },
    { input: 'pause my card', expected: { action: 'freeze_card' } },
    { input: 'create a new card', expected: { action: 'create_card' } },
    { input: 'make a card for shopping', expected: { action: 'create_card' } },
    { input: 'delete my old card', expected: { action: 'delete_card' } },
  ],

  // Questions
  questions: [
    { input: 'what is my balance?', expected: { action: 'question' } },
    { input: 'how much do I have?', expected: { action: 'question' } },
    { input: 'how do I send money?', expected: { action: 'question' } },
    { input: 'what are my spending limits?', expected: { action: 'question' } },
    { input: 'can I see my transactions?', expected: { action: 'question' } },
    { input: 'where is the settings?', expected: { action: 'question' } },
  ],

  // Conversations
  conversations: [
    { input: 'hello', expected: { action: 'conversation' } },
    { input: 'hi there', expected: { action: 'conversation' } },
    { input: 'thanks', expected: { action: 'conversation' } },
    { input: 'thank you', expected: { action: 'conversation' } },
    { input: 'good morning', expected: { action: 'conversation' } },
    { input: 'bye', expected: { action: 'conversation' } },
    { input: 'ok', expected: { action: 'conversation' } },
  ],

  // Amount extraction edge cases
  amountExtraction: [
    { input: 'send $50', expected: { amount: 5000 } },
    { input: 'send $1,500', expected: { amount: 150000 } },
    { input: 'send $1,500.50', expected: { amount: 150050 } },
    { input: 'send 5k', expected: { amount: 500000 } },
    { input: 'send 1.5k', expected: { amount: 150000 } },
    { input: 'send 100', expected: { amount: 10000 } },
    { input: 'send 0.5 SOL', expected: { amount: 0.5 } },
    { input: 'send .25 USDC', expected: { amount: 0.25 } },
  ],

  // Currency extraction
  currencyExtraction: [
    { input: '100 USDC', expected: { currency: 'USDC' } },
    { input: '50 bucks', expected: { currency: 'USD' } },
    { input: '1 solana', expected: { currency: 'SOL' } },
    { input: '2 SOL', expected: { currency: 'SOL' } },
    { input: '$100', expected: { currency: 'USD' } },
    { input: '100 dollars', expected: { currency: 'USD' } },
    { input: '50 USDT', expected: { currency: 'USDT' } },
  ],
};

// ============================================================================
// Factory Functions
// ============================================================================

let intentCounter = 0;

/**
 * Create a test intent with optional overrides
 */
export function createTestIntent(
  overrides: Partial<TestIntent> = {},
  userId: Id<'users'> = 'test_user_001' as Id<'users'>
): TestIntent {
  intentCounter++;
  return {
    _id: `intent_${intentCounter}_${Date.now()}` as Id<'intents'>,
    userId,
    rawText: 'test intent',
    status: 'pending',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...overrides,
  };
}

/**
 * Create a transfer intent
 */
export function createTransferIntent(
  amount: number,
  recipient: string,
  currency: string = 'USD',
  overrides: Partial<TestIntent> = {}
): TestIntent {
  return createTestIntent({
    rawText: `send ${currency === 'USD' ? '$' : ''}${amount / 100} ${currency !== 'USD' ? currency : ''} to ${recipient}`.trim(),
    parsedIntent: {
      action: 'transfer',
      targetType: 'external',
      targetId: recipient,
      amount,
      currency,
      needsClarification: false,
      confidence: 0.95,
    },
    status: 'ready',
    ...overrides,
  });
}

/**
 * Create a swap intent
 */
export function createSwapIntent(
  fromAmount: number,
  fromCurrency: string,
  toCurrency: string,
  overrides: Partial<TestIntent> = {}
): TestIntent {
  return createTestIntent({
    rawText: `swap ${fromAmount} ${fromCurrency} for ${toCurrency}`,
    parsedIntent: {
      action: 'swap',
      sourceType: 'wallet',
      amount: fromAmount,
      currency: fromCurrency,
      needsClarification: false,
      confidence: 0.92,
      metadata: { toCurrency },
    },
    status: 'ready',
    ...overrides,
  });
}

/**
 * Create an intent that needs clarification
 */
export function createClarificationIntent(
  rawText: string,
  clarificationQuestion: string,
  overrides: Partial<TestIntent> = {}
): TestIntent {
  return createTestIntent({
    rawText,
    parsedIntent: {
      action: 'unknown',
      needsClarification: true,
      clarificationQuestion,
      confidence: 0.5,
    },
    status: 'clarifying',
    clarificationQuestion,
    ...overrides,
  });
}

/**
 * Create a completed intent
 */
export function createCompletedIntent(
  action: IntentAction,
  signature?: string,
  overrides: Partial<TestIntent> = {}
): TestIntent {
  return createTestIntent({
    rawText: `completed ${action} intent`,
    parsedIntent: {
      action,
      needsClarification: false,
      confidence: 0.98,
    },
    status: 'completed',
    solanaTransactionSignature: signature ?? `sig_${Date.now()}`,
    responseText: 'Your request has been completed successfully.',
    ...overrides,
  });
}

/**
 * Create a failed intent
 */
export function createFailedIntent(
  error: string,
  overrides: Partial<TestIntent> = {}
): TestIntent {
  return createTestIntent({
    rawText: 'failed intent',
    status: 'failed',
    error,
    ...overrides,
  });
}

/**
 * Create a conversation/question intent (non-action)
 */
export function createConversationIntent(
  rawText: string,
  responseText: string,
  overrides: Partial<TestIntent> = {}
): TestIntent {
  return createTestIntent({
    rawText,
    parsedIntent: {
      action: 'conversation',
      needsClarification: false,
      confidence: 0.99,
    },
    status: 'completed',
    responseText,
    ...overrides,
  });
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Get all test cases as a flat array for parameterized tests
 */
export function getAllIntentTestCases(): Array<{
  category: string;
  input: string;
  expected: Partial<ParsedIntent>;
}> {
  const cases: Array<{ category: string; input: string; expected: Partial<ParsedIntent> }> = [];

  Object.entries(INTENT_TEST_CASES).forEach(([category, testCases]) => {
    testCases.forEach((tc) => {
      cases.push({
        category,
        input: tc.input,
        expected: tc.expected as Partial<ParsedIntent>,
      });
    });
  });

  return cases;
}

/**
 * Reset intent counter
 */
export function resetIntentCounter(): void {
  intentCounter = 0;
}
