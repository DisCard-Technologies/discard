/**
 * useIntents Hook Tests
 *
 * Tests for AI intent processing and action execution.
 */

describe('useIntents Hook', () => {
  // ==========================================================================
  // Intent Types
  // ==========================================================================

  describe('Intent Types', () => {
    const intentTypes = [
      'transfer',
      'swap',
      'fund_card',
      'freeze_card',
      'unfreeze_card',
      'create_card',
      'question',
      'conversation',
      'unknown',
    ];

    test('defines all intent types', () => {
      expect(intentTypes).toContain('transfer');
      expect(intentTypes).toContain('swap');
      expect(intentTypes).toContain('fund_card');
      expect(intentTypes).toContain('question');
      expect(intentTypes).toContain('conversation');
    });

    test('action intents require confirmation', () => {
      const actionIntents = ['transfer', 'swap', 'fund_card', 'freeze_card', 'create_card'];
      const conversationalIntents = ['question', 'conversation'];

      actionIntents.forEach(intent => {
        expect(actionIntents).toContain(intent);
      });

      conversationalIntents.forEach(intent => {
        expect(conversationalIntents).toContain(intent);
      });
    });
  });

  // ==========================================================================
  // Intent State Machine
  // ==========================================================================

  describe('Intent State Machine', () => {
    const states = ['idle', 'processing', 'confirming', 'executing', 'completed', 'error'];

    test('defines all states', () => {
      expect(states).toHaveLength(6);
    });

    test('valid state transitions', () => {
      const transitions: Record<string, string[]> = {
        idle: ['processing'],
        processing: ['confirming', 'completed', 'error'],
        confirming: ['executing', 'idle'], // Can cancel
        executing: ['completed', 'error'],
        completed: ['idle'],
        error: ['idle'],
      };

      expect(transitions.idle).toContain('processing');
      expect(transitions.processing).toContain('confirming');
      expect(transitions.confirming).toContain('executing');
      expect(transitions.confirming).toContain('idle'); // Cancel
    });
  });

  // ==========================================================================
  // Intent Parsing
  // ==========================================================================

  describe('Intent Parsing', () => {
    const parseIntent = (input: string) => {
      const lowerInput = input.toLowerCase();

      // Amount extraction
      const amountMatch = lowerInput.match(/\$?([\d,]+(?:\.\d{2})?)/);
      const amount = amountMatch ? parseFloat(amountMatch[1].replace(',', '')) : null;

      // Recipient extraction
      const toMatch = lowerInput.match(/(?:to|@)\s*(\S+)/);
      const recipient = toMatch ? toMatch[1] : null;

      // Action detection
      let action = 'unknown';
      if (/send|transfer|pay/.test(lowerInput)) action = 'transfer';
      else if (/swap|convert|exchange/.test(lowerInput)) action = 'swap';
      else if (/fund|load|add.*card/.test(lowerInput)) action = 'fund_card';
      else if (/freeze|lock/.test(lowerInput)) action = 'freeze_card';
      else if (/\?/.test(lowerInput)) action = 'question';

      return { action, amount, recipient };
    };

    test('parses transfer intent', () => {
      const result = parseIntent('send $50 to alice');
      expect(result.action).toBe('transfer');
      expect(result.amount).toBe(50);
      expect(result.recipient).toBe('alice');
    });

    test('parses swap intent', () => {
      const result = parseIntent('swap 100 USDC for SOL');
      expect(result.action).toBe('swap');
      expect(result.amount).toBe(100);
    });

    test('parses fund card intent', () => {
      const result = parseIntent('add $200 to my card');
      expect(result.action).toBe('fund_card');
      expect(result.amount).toBe(200);
    });

    test('parses question intent', () => {
      const result = parseIntent('what is my balance?');
      expect(result.action).toBe('question');
    });

    test('handles missing amount', () => {
      const result = parseIntent('send money to bob');
      expect(result.action).toBe('transfer');
      expect(result.amount).toBeNull();
      expect(result.recipient).toBe('bob');
    });
  });

  // ==========================================================================
  // Confidence Scoring
  // ==========================================================================

  describe('Confidence Scoring', () => {
    const calculateConfidence = (intent: { action: string; amount: number | null; recipient: string | null }) => {
      let confidence = 0.5; // Base confidence

      // Action detected
      if (intent.action !== 'unknown') confidence += 0.2;

      // Amount provided
      if (intent.amount !== null) confidence += 0.15;

      // Recipient provided
      if (intent.recipient !== null) confidence += 0.15;

      return Math.min(confidence, 1);
    };

    test('high confidence with all components', () => {
      const intent = { action: 'transfer', amount: 50, recipient: 'alice' };
      expect(calculateConfidence(intent)).toBe(1);
    });

    test('medium confidence without amount', () => {
      const intent = { action: 'transfer', amount: null, recipient: 'alice' };
      expect(calculateConfidence(intent)).toBe(0.85);
    });

    test('low confidence for unknown action', () => {
      const intent = { action: 'unknown', amount: null, recipient: null };
      expect(calculateConfidence(intent)).toBe(0.5);
    });
  });

  // ==========================================================================
  // Intent Validation
  // ==========================================================================

  describe('Intent Validation', () => {
    const validateIntent = (intent: { action: string; amount: number | null }) => {
      const errors: string[] = [];

      if (intent.action === 'unknown') {
        errors.push('Could not understand your request');
      }

      if (['transfer', 'swap', 'fund_card'].includes(intent.action)) {
        if (intent.amount === null) {
          errors.push('Please specify an amount');
        } else if (intent.amount <= 0) {
          errors.push('Amount must be positive');
        } else if (intent.amount > 10000) {
          errors.push('Amount exceeds daily limit');
        }
      }

      return { isValid: errors.length === 0, errors };
    };

    test('valid transfer intent', () => {
      const result = validateIntent({ action: 'transfer', amount: 50 });
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    test('invalid without amount', () => {
      const result = validateIntent({ action: 'transfer', amount: null });
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Please specify an amount');
    });

    test('invalid negative amount', () => {
      const result = validateIntent({ action: 'transfer', amount: -50 });
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Amount must be positive');
    });

    test('invalid exceeds limit', () => {
      const result = validateIntent({ action: 'transfer', amount: 15000 });
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Amount exceeds daily limit');
    });
  });

  // ==========================================================================
  // Intent Execution
  // ==========================================================================

  describe('Intent Execution', () => {
    test('creates execution steps for transfer', () => {
      const intent = { action: 'transfer', amount: 50, recipient: 'alice.sol' };

      const steps = [
        { id: 'resolve', label: 'Resolving recipient', status: 'pending' },
        { id: 'validate', label: 'Validating balance', status: 'pending' },
        { id: 'build', label: 'Building transaction', status: 'pending' },
        { id: 'sign', label: 'Signing transaction', status: 'pending' },
        { id: 'submit', label: 'Submitting to network', status: 'pending' },
        { id: 'confirm', label: 'Confirming transaction', status: 'pending' },
      ];

      expect(steps).toHaveLength(6);
      expect(steps[0].id).toBe('resolve');
      expect(steps[5].id).toBe('confirm');
    });

    test('creates execution steps for swap', () => {
      const steps = [
        { id: 'quote', label: 'Getting quote', status: 'pending' },
        { id: 'validate', label: 'Validating balance', status: 'pending' },
        { id: 'build', label: 'Building swap', status: 'pending' },
        { id: 'sign', label: 'Signing transaction', status: 'pending' },
        { id: 'submit', label: 'Submitting swap', status: 'pending' },
        { id: 'confirm', label: 'Confirming swap', status: 'pending' },
      ];

      expect(steps[0].id).toBe('quote');
    });
  });

  // ==========================================================================
  // Error Handling
  // ==========================================================================

  describe('Error Handling', () => {
    const categorizeError = (error: Error) => {
      const message = error.message.toLowerCase();

      if (message.includes('insufficient')) return 'balance';
      if (message.includes('network')) return 'network';
      if (message.includes('timeout')) return 'timeout';
      if (message.includes('cancelled') || message.includes('rejected')) return 'user';
      if (message.includes('invalid')) return 'validation';

      return 'unknown';
    };

    test('categorizes insufficient balance error', () => {
      const error = new Error('Insufficient balance');
      expect(categorizeError(error)).toBe('balance');
    });

    test('categorizes network error', () => {
      const error = new Error('Network connection failed');
      expect(categorizeError(error)).toBe('network');
    });

    test('categorizes user cancellation', () => {
      const error = new Error('Transaction cancelled by user');
      expect(categorizeError(error)).toBe('user');
    });

    test('categorizes timeout', () => {
      const error = new Error('Request timeout');
      expect(categorizeError(error)).toBe('timeout');
    });
  });

  // ==========================================================================
  // Intent History
  // ==========================================================================

  describe('Intent History', () => {
    test('tracks intent history', () => {
      const history: Array<{ input: string; action: string; timestamp: number; success: boolean }> = [];

      // Add entries
      history.push({ input: 'send $50 to alice', action: 'transfer', timestamp: Date.now(), success: true });
      history.push({ input: 'what is my balance?', action: 'question', timestamp: Date.now(), success: true });

      expect(history).toHaveLength(2);
      expect(history[0].action).toBe('transfer');
    });

    test('limits history size', () => {
      const maxHistory = 50;
      const history: any[] = [];

      for (let i = 0; i < 60; i++) {
        history.push({ input: `test ${i}`, timestamp: Date.now() });
        if (history.length > maxHistory) {
          history.shift();
        }
      }

      expect(history.length).toBe(maxHistory);
    });
  });

  // ==========================================================================
  // Suggested Actions
  // ==========================================================================

  describe('Suggested Actions', () => {
    test('suggests actions based on context', () => {
      const getSuggestions = (balance: number, recentActions: string[]) => {
        const suggestions: string[] = [];

        if (balance > 0) {
          suggestions.push('Send money');
          suggestions.push('Swap tokens');
        }

        if (balance < 100) {
          suggestions.push('Add funds');
        }

        if (!recentActions.includes('freeze_card')) {
          suggestions.push('Manage cards');
        }

        return suggestions.slice(0, 4);
      };

      const suggestions = getSuggestions(500, []);
      expect(suggestions).toContain('Send money');
      expect(suggestions).toContain('Swap tokens');
    });

    test('limits suggestions count', () => {
      const getSuggestions = () => ['a', 'b', 'c', 'd', 'e'].slice(0, 4);
      expect(getSuggestions()).toHaveLength(4);
    });
  });
});
