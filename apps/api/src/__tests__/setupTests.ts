// Test environment setup
import { jest } from '@jest/globals';

// Set environment variables for tests
process.env.NODE_ENV = 'test';
process.env.STRIPE_SECRET_KEY = 'sk_test_1234567890abcdef';
process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test_1234567890abcdef';
process.env.APP_BASE_URL = 'https://test.discard.app';
process.env.SUPABASE_URL = 'https://test.supabase.co';
process.env.SUPABASE_ANON_KEY = 'test_anon_key';

// Mock Stripe module before any imports
jest.mock('stripe', () => {
  const mockStripe = {
    customers: {
      create: jest.fn(),
    },
    paymentIntents: {
      create: jest.fn(),
      confirm: jest.fn(),
      retrieve: jest.fn(),
    },
    paymentMethods: {
      attach: jest.fn(),
      list: jest.fn(),
      retrieve: jest.fn(),
    },
    webhooks: {
      constructEvent: jest.fn(),
    },
    errors: {
      StripeCardError: class extends Error {
        type = 'card_error';
        code = 'card_declined';
        decline_code = 'generic_decline';
        constructor(params: any) {
          super(params.message);
          Object.assign(this, params);
        }
      },
      StripeRateLimitError: class extends Error {
        type = 'rate_limit_error';
        constructor(params: any) {
          super(params.message);
          Object.assign(this, params);
        }
      },
      StripeInvalidRequestError: class extends Error {
        type = 'invalid_request_error';
        constructor(params: any) {
          super(params.message);
          Object.assign(this, params);
        }
      },
      StripeAPIError: class extends Error {
        type = 'api_error';
        constructor(params: any) {
          super(params.message);
          Object.assign(this, params);
        }
      },
      StripeConnectionError: class extends Error {
        type = 'connection_error';
        constructor(params: any) {
          super(params.message);
          Object.assign(this, params);
        }
      },
      StripeAuthenticationError: class extends Error {
        type = 'authentication_error';
        constructor(params: any) {
          super(params.message);
          Object.assign(this, params);
        }
      }
    }
  };

  return jest.fn(() => mockStripe);
});

// Global test utilities
global.console = {
  ...console,
  // Suppress console.error in tests unless explicitly needed
  error: jest.fn(),
  warn: jest.fn(),
};

// Suppress React warnings in tests
const originalError = console.error;
beforeEach(() => {
  console.error = (...args: any[]) => {
    if (
      typeof args[0] === 'string' &&
      args[0].includes('Warning: ReactDOM.render is deprecated in React 18')
    ) {
      return;
    }
    originalError.call(console, ...args);
  };
});

afterEach(() => {
  console.error = originalError;
});