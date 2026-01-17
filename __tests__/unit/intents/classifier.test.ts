/**
 * Intent Classifier Tests
 *
 * Tests for AI-powered intent classification including:
 * - Action classification (transfer, swap, fund_card, etc.)
 * - Amount extraction from natural language
 * - Currency extraction
 * - Confidence scoring
 * - Clarification detection
 */

import {
  classifyIntentSimple,
  parseAmount,
  parseCurrency,
  expectIntentToMatch,
  buildMockAIResponse,
} from '../../helpers/ai';
import { INTENT_TEST_CASES, type IntentAction } from '../../fixtures/intents';

describe('Intent Classifier', () => {
  // ==========================================================================
  // Action Classification
  // ==========================================================================

  describe('classifies action types correctly', () => {
    describe('Transfer intents', () => {
      test.each(INTENT_TEST_CASES.transfers)(
        'classifies "$input" as transfer action',
        ({ input, expected }) => {
          const result = classifyIntentSimple(input);
          expect(result.action).toBe('transfer');
          expect(result.confidence).toBeGreaterThan(0.5);
        }
      );

      test('classifies "send $50 to alice" as transfer action', () => {
        const result = classifyIntentSimple('send $50 to alice');
        expect(result.action).toBe('transfer');
        expect(result.confidence).toBeGreaterThan(0.8);
      });

      test('classifies "transfer 100 USDC to bob.sol" as transfer action', () => {
        const result = classifyIntentSimple('transfer 100 USDC to bob.sol');
        expect(result.action).toBe('transfer');
      });

      test('classifies "pay john $25" as transfer action', () => {
        const result = classifyIntentSimple('pay john $25');
        expect(result.action).toBe('transfer');
      });

      test('classifies "wire $1,500 to mom" as transfer action', () => {
        const result = classifyIntentSimple('wire $1,500 to mom');
        expect(result.action).toBe('transfer');
      });
    });

    describe('Swap intents', () => {
      test.each(INTENT_TEST_CASES.swaps)(
        'classifies "$input" as swap action',
        ({ input }) => {
          const result = classifyIntentSimple(input);
          expect(result.action).toBe('swap');
        }
      );

      test('classifies "swap 1 SOL for USDC" as swap action', () => {
        const result = classifyIntentSimple('swap 1 SOL for USDC');
        expect(result.action).toBe('swap');
      });

      test('classifies "convert 100 USDC to SOL" as swap action', () => {
        const result = classifyIntentSimple('convert 100 USDC to SOL');
        expect(result.action).toBe('swap');
      });

      test('classifies "exchange my SOL for USDT" as swap action', () => {
        const result = classifyIntentSimple('exchange my SOL for USDT');
        expect(result.action).toBe('swap');
      });

      test('classifies "buy 50 USDC with SOL" as swap action', () => {
        const result = classifyIntentSimple('buy 50 USDC with SOL');
        expect(result.action).toBe('swap');
      });
    });

    describe('Card funding intents', () => {
      test.each(INTENT_TEST_CASES.cardFunding)(
        'classifies "$input" as fund_card action',
        ({ input }) => {
          const result = classifyIntentSimple(input);
          expect(result.action).toBe('fund_card');
        }
      );

      test('classifies "fund my card with $100" as fund_card action', () => {
        const result = classifyIntentSimple('fund my card with $100');
        expect(result.action).toBe('fund_card');
      });

      test('classifies "add $50 to my travel card" as fund_card action', () => {
        const result = classifyIntentSimple('add $50 to my travel card');
        expect(result.action).toBe('fund_card');
      });

      test('needs clarification for "top up my card" (no amount)', () => {
        const result = classifyIntentSimple('top up my card');
        expect(result.action).toBe('fund_card');
        expect(result.needsClarification).toBe(true);
      });
    });

    describe('Card management intents', () => {
      test.each(INTENT_TEST_CASES.cardManagement)(
        'classifies "$input" correctly',
        ({ input, expected }) => {
          const result = classifyIntentSimple(input);
          expect(result.action).toBe(expected.action);
        }
      );

      test('classifies "freeze my card" as freeze_card action', () => {
        const result = classifyIntentSimple('freeze my card');
        expect(result.action).toBe('freeze_card');
      });

      test('classifies "lock my travel card" as freeze_card action', () => {
        const result = classifyIntentSimple('lock my travel card');
        expect(result.action).toBe('freeze_card');
      });

      test('classifies "create a new card" as create_card action', () => {
        const result = classifyIntentSimple('create a new card');
        expect(result.action).toBe('create_card');
      });

      test('classifies "delete my old card" as delete_card action', () => {
        const result = classifyIntentSimple('delete my old card');
        expect(result.action).toBe('delete_card');
      });
    });

    describe('Question intents', () => {
      test.each(INTENT_TEST_CASES.questions)(
        'classifies "$input" as question',
        ({ input }) => {
          const result = classifyIntentSimple(input);
          expect(result.action).toBe('question');
        }
      );

      test('classifies "what is my balance?" as question', () => {
        const result = classifyIntentSimple('what is my balance?');
        expect(result.action).toBe('question');
      });

      test('classifies "how do I send money?" as question', () => {
        const result = classifyIntentSimple('how do I send money?');
        expect(result.action).toBe('question');
      });

      test('classifies "how much do I have?" as question', () => {
        const result = classifyIntentSimple('how much do I have?');
        expect(result.action).toBe('question');
      });
    });

    describe('Conversation intents', () => {
      test.each(INTENT_TEST_CASES.conversations)(
        'classifies "$input" as conversation',
        ({ input }) => {
          const result = classifyIntentSimple(input);
          expect(result.action).toBe('conversation');
        }
      );

      test('classifies "hello" as conversation', () => {
        const result = classifyIntentSimple('hello');
        expect(result.action).toBe('conversation');
        expect(result.confidence).toBeGreaterThan(0.9);
      });

      test('classifies "hi there" as conversation', () => {
        const result = classifyIntentSimple('hi there');
        expect(result.action).toBe('conversation');
      });

      test('classifies "thanks" as conversation', () => {
        const result = classifyIntentSimple('thanks');
        expect(result.action).toBe('conversation');
      });

      test('classifies "thank you" as conversation', () => {
        const result = classifyIntentSimple('thank you');
        expect(result.action).toBe('conversation');
      });

      test('classifies "ok" as conversation', () => {
        const result = classifyIntentSimple('ok');
        expect(result.action).toBe('conversation');
      });

      test('classifies "bye" as conversation', () => {
        const result = classifyIntentSimple('bye');
        expect(result.action).toBe('conversation');
      });
    });
  });

  // ==========================================================================
  // Amount Extraction
  // ==========================================================================

  describe('Amount Extraction', () => {
    describe('USD amounts with dollar sign', () => {
      test('extracts $50', () => {
        const result = parseAmount('send $50');
        expect(result.amount).toBe(5000); // cents
        expect(result.currency).toBe('USD');
      });

      test('extracts $1,500', () => {
        const result = parseAmount('send $1,500');
        expect(result.amount).toBe(150000);
      });

      test('extracts $1,500.50', () => {
        const result = parseAmount('send $1,500.50');
        expect(result.amount).toBe(150050);
      });

      test('extracts $0.50', () => {
        const result = parseAmount('send $0.50');
        expect(result.amount).toBe(50);
      });

      test('extracts $100.00', () => {
        const result = parseAmount('$100.00 to alice');
        expect(result.amount).toBe(10000);
      });
    });

    describe('Thousands notation (k)', () => {
      test('extracts 5k', () => {
        const result = parseAmount('send 5k');
        expect(result.amount).toBe(500000); // $5000 in cents
      });

      test('extracts 1.5k', () => {
        const result = parseAmount('send 1.5k');
        expect(result.amount).toBe(150000);
      });

      test('extracts 10k', () => {
        const result = parseAmount('transfer 10k to savings');
        expect(result.amount).toBe(1000000);
      });
    });

    describe('Crypto amounts', () => {
      test('extracts 1 SOL', () => {
        const result = parseAmount('send 1 SOL');
        expect(result.amount).toBe(1);
        expect(result.isCrypto).toBe(true);
        expect(result.currency).toBe('SOL');
      });

      test('extracts 0.5 SOL', () => {
        const result = parseAmount('transfer 0.5 SOL');
        expect(result.amount).toBe(0.5);
        expect(result.isCrypto).toBe(true);
      });

      test('extracts 100 USDC', () => {
        const result = parseAmount('send 100 USDC');
        expect(result.amount).toBe(100);
        expect(result.isCrypto).toBe(true);
        expect(result.currency).toBe('USDC');
      });

      test('extracts 50.5 USDT', () => {
        const result = parseAmount('transfer 50.5 USDT');
        expect(result.amount).toBe(50.5);
        expect(result.currency).toBe('USDT');
      });

      test('extracts .25 USDC (leading decimal)', () => {
        const result = parseAmount('send .25 USDC');
        expect(result.amount).toBe(0.25);
      });
    });

    describe('Plain numbers', () => {
      test('extracts plain 100 as USD cents', () => {
        const result = parseAmount('100');
        expect(result.amount).toBe(10000); // Assumes $100 in cents
        expect(result.isCrypto).toBe(false);
      });

      test('extracts plain 50 from sentence', () => {
        const result = parseAmount('50 to alice');
        expect(result.amount).toBe(5000);
      });
    });

    describe('Edge cases', () => {
      test('returns null for no amount', () => {
        const result = parseAmount('send money to alice');
        expect(result.amount).toBeNull();
      });

      test('handles mixed text correctly', () => {
        const result = parseAmount('please send $25 to my friend john');
        expect(result.amount).toBe(2500);
      });

      test('handles large amounts', () => {
        const result = parseAmount('transfer $50,000');
        expect(result.amount).toBe(5000000);
      });
    });
  });

  // ==========================================================================
  // Currency Extraction
  // ==========================================================================

  describe('Currency Extraction', () => {
    test('extracts USDC from "100 USDC"', () => {
      expect(parseCurrency('100 USDC')).toBe('USDC');
    });

    test('extracts USD from "50 bucks"', () => {
      expect(parseCurrency('50 bucks')).toBe('USD');
    });

    test('extracts USD from "50 dollars"', () => {
      expect(parseCurrency('50 dollars')).toBe('USD');
    });

    test('extracts SOL from "1 solana"', () => {
      expect(parseCurrency('buy solana')).toBe('SOL');
    });

    test('extracts SOL from "2 SOL"', () => {
      expect(parseCurrency('2 SOL')).toBe('SOL');
    });

    test('extracts USD from "$100"', () => {
      expect(parseCurrency('$100')).toBe('USD');
    });

    test('extracts USDT from "50 USDT"', () => {
      expect(parseCurrency('50 USDT')).toBe('USDT');
    });

    test('extracts ETH from "0.1 ETH"', () => {
      expect(parseCurrency('0.1 ETH')).toBe('ETH');
    });

    test('returns null for no currency', () => {
      expect(parseCurrency('send money')).toBeNull();
    });
  });

  // ==========================================================================
  // Confidence Scoring
  // ==========================================================================

  describe('Confidence Scoring', () => {
    test('high confidence for clear transfer intent', () => {
      const result = classifyIntentSimple('send $50 to alice');
      expect(result.confidence).toBeGreaterThan(0.8);
    });

    test('lower confidence for ambiguous intent', () => {
      const result = classifyIntentSimple('top up');
      expect(result.confidence).toBeLessThan(0.8);
    });

    test('high confidence for greetings', () => {
      const result = classifyIntentSimple('hello');
      expect(result.confidence).toBeGreaterThan(0.9);
    });

    test('low confidence for unknown intent', () => {
      const result = classifyIntentSimple('foobar baz qux');
      expect(result.confidence).toBeLessThan(0.5);
    });
  });

  // ==========================================================================
  // Clarification Detection
  // ==========================================================================

  describe('Clarification Detection', () => {
    test('needs clarification for transfer without amount', () => {
      const result = classifyIntentSimple('send money to alice');
      expect(result.action).toBe('transfer');
      expect(result.needsClarification).toBe(true);
    });

    test('needs clarification for fund card without amount', () => {
      const result = classifyIntentSimple('fund my card');
      expect(result.action).toBe('fund_card');
      expect(result.needsClarification).toBe(true);
    });

    test('no clarification needed for complete transfer', () => {
      const result = classifyIntentSimple('send $50 to alice');
      expect(result.needsClarification).toBe(false);
    });

    test('needs clarification for unknown intent', () => {
      const result = classifyIntentSimple('do something');
      expect(result.action).toBe('unknown');
      expect(result.needsClarification).toBe(true);
    });

    test('no clarification needed for questions', () => {
      const result = classifyIntentSimple('what is my balance?');
      expect(result.needsClarification).toBe(false);
    });

    test('no clarification needed for conversations', () => {
      const result = classifyIntentSimple('hello');
      expect(result.needsClarification).toBe(false);
    });
  });

  // ==========================================================================
  // Mock AI Response Builder
  // ==========================================================================

  describe('Mock AI Response Builder', () => {
    test('builds successful transfer response', () => {
      const response = buildMockAIResponse({
        action: 'transfer',
        success: true,
        confidence: 0.95,
      });

      expect(response.success).toBe(true);
      expect(response.confidence).toBe(0.95);
      expect(response.intent?.action).toBe('transfer');
    });

    test('builds clarification response', () => {
      const response = buildMockAIResponse({
        action: 'fund_card',
        needsClarification: true,
        clarificationQuestion: 'How much would you like to add?',
      });

      expect(response.needsClarification).toBe(true);
      expect(response.clarificationQuestion).toBe('How much would you like to add?');
    });

    test('builds error response', () => {
      const response = buildMockAIResponse({
        action: 'transfer',
        success: false,
        error: 'Insufficient balance',
      });

      expect(response.success).toBe(false);
      expect(response.error).toBe('Insufficient balance');
    });
  });

  // ==========================================================================
  // Integration Tests
  // ==========================================================================

  describe('End-to-End Intent Flow', () => {
    test('complete transfer flow: classify -> extract amount -> extract currency', () => {
      const input = 'send $50 to alice';

      // Classify
      const classification = classifyIntentSimple(input);
      expect(classification.action).toBe('transfer');

      // Extract amount
      const amountResult = parseAmount(input);
      expect(amountResult.amount).toBe(5000);

      // Extract currency
      const currency = parseCurrency(input);
      expect(currency).toBe('USD');
    });

    test('complete swap flow: classify -> extract amounts -> extract currencies', () => {
      const input = 'swap 1 SOL for USDC';

      // Classify
      const classification = classifyIntentSimple(input);
      expect(classification.action).toBe('swap');

      // Extract amount
      const amountResult = parseAmount(input);
      expect(amountResult.amount).toBe(1);
      expect(amountResult.currency).toBe('SOL');
    });

    test('clarification flow: classify -> detect missing info', () => {
      const input = 'fund my card';

      // Classify
      const classification = classifyIntentSimple(input);
      expect(classification.action).toBe('fund_card');
      expect(classification.needsClarification).toBe(true);

      // No amount to extract
      const amountResult = parseAmount(input);
      expect(amountResult.amount).toBeNull();
    });
  });
});
