import { describe, test, expect, beforeAll, afterAll, beforeEach, afterEach, jest } from '@jest/globals';
import request from 'supertest';
import express from 'express';
import nock from 'nock';
import { fundingController } from '../../services/funding/funding.controller';
import fundingRoutes from '../../services/funding/funding.routes';
import { authenticateToken } from '../../middleware/auth';
import { 
  AccountFundingRequest, 
  CardAllocationRequest, 
  CardTransferRequest 
} from '@discard/shared/src/types/funding';

// Create test app
const app = express();
app.use(express.json());

// Mock authentication middleware
jest.mock('../../middleware/auth', () => ({
  authenticateToken: jest.fn((req: any, res: any, next: any) => {
    req.user = { id: 'test-user-id', email: 'test@example.com' };
    next();
  })
}));

// Mock Supabase
jest.mock('../../app', () => ({
  supabase: {
    from: jest.fn(() => ({
      insert: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      update: jest.fn().mockReturnThis(),
      upsert: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      order: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      range: jest.fn().mockReturnThis(),
      gte: jest.fn().mockReturnThis(),
      lte: jest.fn().mockReturnThis(),
      single: jest.fn()
    }))
  }
}));

// Mock services
jest.mock('../../services/funding/stripe.service', () => ({
  stripeService: {
    createPaymentIntent: jest.fn(),
    createCustomer: jest.fn(),
    validateWebhookSignature: jest.fn()
  }
}));

jest.mock('../../services/funding/balance.service', () => ({
  balanceService: {
    getAccountBalance: jest.fn(),
    getCardBalance: jest.fn(),
    getNotificationThresholds: jest.fn(),
    updateNotificationThresholds: jest.fn()
  }
}));

// Add funding routes to test app
app.use('/api/v1/funding', fundingRoutes);

describe('Funding API Integration Tests', () => {
  const mockUserId = 'test-user-id';
  const mockCardId = 'test-card-id';
  let authToken: string;

  beforeAll(() => {
    authToken = 'mock_jwt_token';
    
    // Setup environment variables for tests
    process.env.STRIPE_SECRET_KEY = 'sk_test_1234567890';
    process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test_1234567890';
  });

  afterAll(() => {
    nock.cleanAll();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    nock.cleanAll();
  });

  afterEach(() => {
    nock.abortPendingRequests();
  });

  describe('POST /api/v1/funding/account', () => {
    const validAccountFundingRequest: AccountFundingRequest = {
      amount: 10000, // $100.00
      paymentMethodId: 'pm_1234567890abcdef',
      currency: 'USD'
    };

    test('should fund account successfully', async () => {
      // Setup mocks
      const { supabase } = require('../../app');
      const { stripeService } = require('../../services/funding/stripe.service');

      const mockQuery = supabase.from('funding_transactions');
      
      // Mock fraud check (empty recent transactions)
      mockQuery.order.mockResolvedValueOnce({ data: [], error: null });
      
      // Mock existing customer lookup
      mockQuery.single.mockResolvedValueOnce({ 
        data: { stripe_customer_id: 'cus_existing' }, 
        error: null 
      });
      
      // Mock transaction creation
      mockQuery.single.mockResolvedValueOnce({
        data: {
          id: 'tx-uuid',
          transaction_id: 'funding_123_abc',
          user_id: mockUserId,
          type: 'account_funding',
          amount: 10000,
          status: 'completed',
          stripe_payment_intent_id: 'pi_1234567890',
          created_at: '2024-01-01T00:00:00.000Z'
        },
        error: null
      });

      // Mock Stripe payment intent creation
      stripeService.createPaymentIntent.mockResolvedValue({
        id: 'pi_1234567890',
        status: 'succeeded',
        clientSecret: 'pi_secret_123',
        estimatedProcessingTime: 0
      });

      const response = await request(app)
        .post('/api/v1/funding/account')
        .set('Authorization', `Bearer ${authToken}`)
        .send(validAccountFundingRequest);

      expect(response.status).toBe(201);
      expect(response.body).toEqual({
        success: true,
        message: 'Account funding initiated successfully',
        data: {
          transaction: expect.objectContaining({
            userId: mockUserId,
            type: 'account_funding',
            amount: 10000,
            status: 'completed'
          })
        }
      });
    });

    test('should reject funding without authentication', async () => {
      const response = await request(app)
        .post('/api/v1/funding/account')
        .send(validAccountFundingRequest);

      expect(response.status).toBe(401);
      expect(response.body).toEqual({
        success: false,
        error: 'Authentication required'
      });
    });

    test('should reject funding with invalid amount', async () => {
      const invalidRequest = {
        ...validAccountFundingRequest,
        amount: 50 // Below minimum
      };

      const response = await request(app)
        .post('/api/v1/funding/account')
        .set('Authorization', `Bearer ${authToken}`)
        .send(invalidRequest);

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('Minimum funding amount');
    });

    test('should reject funding with invalid payment method ID', async () => {
      const invalidRequest = {
        ...validAccountFundingRequest,
        paymentMethodId: 'invalid_pm_id'
      };

      const response = await request(app)
        .post('/api/v1/funding/account')
        .set('Authorization', `Bearer ${authToken}`)
        .send(invalidRequest);

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('Invalid payment method ID');
    });

    test('should reject funding with unsupported currency', async () => {
      const invalidRequest = {
        ...validAccountFundingRequest,
        currency: 'JPY'
      };

      const response = await request(app)
        .post('/api/v1/funding/account')
        .set('Authorization', `Bearer ${authToken}`)
        .send(invalidRequest);

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('Unsupported currency');
    });

    test('should handle Stripe payment failure', async () => {
      // Setup mocks
      const { supabase } = require('../../app');
      const { stripeService } = require('../../services/funding/stripe.service');

      const mockQuery = supabase.from('funding_transactions');
      mockQuery.order.mockResolvedValueOnce({ data: [], error: null }); // Fraud check
      mockQuery.single.mockResolvedValueOnce({ 
        data: { stripe_customer_id: 'cus_existing' }, 
        error: null 
      });

      // Mock Stripe error
      stripeService.createPaymentIntent.mockRejectedValue(new Error('Card was declined'));

      const response = await request(app)
        .post('/api/v1/funding/account')
        .set('Authorization', `Bearer ${authToken}`)
        .send(validAccountFundingRequest);

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Card was declined');
    });
  });

  describe('POST /api/v1/funding/card/:cardId', () => {
    const validAllocationRequest = {
      amount: 5000 // $50.00
    };

    test('should allocate funds to card successfully', async () => {
      // Setup mocks
      const { supabase } = require('../../app');
      const { balanceService } = require('../../services/funding/balance.service');

      // Mock account balance check
      balanceService.getAccountBalance.mockResolvedValue({
        userId: mockUserId,
        totalBalance: 20000,
        allocatedBalance: 10000,
        availableBalance: 10000,
        lastUpdated: '2024-01-01T00:00:00.000Z'
      });

      // Mock card ownership verification
      const mockCardsQuery = supabase.from('cards');
      mockCardsQuery.single.mockResolvedValue({
        data: { user_id: mockUserId, status: 'active' },
        error: null
      });

      // Mock transaction creation
      const mockTransactionQuery = supabase.from('funding_transactions');
      mockTransactionQuery.single.mockResolvedValue({
        data: {
          id: 'tx-uuid',
          transaction_id: 'funding_456_def',
          user_id: mockUserId,
          type: 'card_allocation',
          amount: 5000,
          status: 'completed',
          target_card_id: mockCardId,
          created_at: '2024-01-01T00:00:00.000Z'
        },
        error: null
      });

      // Mock allocation record creation
      const mockAllocationQuery = supabase.from('fund_allocations');
      mockAllocationQuery.single.mockResolvedValue({ data: null, error: null });

      const response = await request(app)
        .post(`/api/v1/funding/card/${mockCardId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send(validAllocationRequest);

      expect(response.status).toBe(201);
      expect(response.body).toEqual({
        success: true,
        message: 'Card allocation completed successfully',
        data: {
          transaction: expect.objectContaining({
            userId: mockUserId,
            type: 'card_allocation',
            amount: 5000,
            targetCardId: mockCardId
          })
        }
      });
    });

    test('should reject allocation with insufficient balance', async () => {
      // Setup mocks
      const { balanceService } = require('../../services/funding/balance.service');

      balanceService.getAccountBalance.mockResolvedValue({
        userId: mockUserId,
        totalBalance: 10000,
        allocatedBalance: 8000,
        availableBalance: 2000, // Only $20 available
        lastUpdated: '2024-01-01T00:00:00.000Z'
      });

      const response = await request(app)
        .post(`/api/v1/funding/card/${mockCardId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send(validAllocationRequest);

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('Insufficient balance');
    });

    test('should reject allocation to non-owned card', async () => {
      // Setup mocks
      const { supabase } = require('../../app');
      const { balanceService } = require('../../services/funding/balance.service');

      balanceService.getAccountBalance.mockResolvedValue({
        userId: mockUserId,
        availableBalance: 10000
      });

      const mockQuery = supabase.from('cards');
      mockQuery.single.mockResolvedValue({
        data: { user_id: 'different-user-id', status: 'active' },
        error: null
      });

      const response = await request(app)
        .post(`/api/v1/funding/card/${mockCardId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send(validAllocationRequest);

      expect(response.status).toBe(500);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('Card does not belong to user');
    });

    test('should reject allocation with invalid card ID format', async () => {
      const response = await request(app)
        .post('/api/v1/funding/card/invalid-card-id')
        .set('Authorization', `Bearer ${authToken}`)
        .send(validAllocationRequest);

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('Invalid card ID format');
    });
  });

  describe('POST /api/v1/funding/transfer', () => {
    const validTransferRequest: CardTransferRequest = {
      fromCardId: 'source-card-id',
      toCardId: 'target-card-id',
      amount: 3000 // $30.00
    };

    test('should transfer funds between cards successfully', async () => {
      // Setup mocks
      const { supabase } = require('../../app');
      const { balanceService } = require('../../services/funding/balance.service');

      // Mock card ownership verification
      const mockCardsQuery = supabase.from('cards');
      mockCardsQuery.single
        .mockResolvedValueOnce({ data: { user_id: mockUserId, status: 'active' }, error: null })
        .mockResolvedValueOnce({ data: { user_id: mockUserId, status: 'active' }, error: null });

      // Mock source card balance
      balanceService.getCardBalance.mockResolvedValue({
        cardId: 'source-card-id',
        balance: 5000,
        lastUpdated: '2024-01-01T00:00:00.000Z'
      });

      // Mock transaction creation
      const mockTransactionQuery = supabase.from('funding_transactions');
      mockTransactionQuery.single.mockResolvedValue({
        data: {
          id: 'tx-uuid',
          transaction_id: 'funding_789_ghi',
          user_id: mockUserId,
          type: 'card_transfer',
          amount: 3000,
          status: 'completed',
          source_card_id: 'source-card-id',
          target_card_id: 'target-card-id',
          created_at: '2024-01-01T00:00:00.000Z'
        },
        error: null
      });

      const response = await request(app)
        .post('/api/v1/funding/transfer')
        .set('Authorization', `Bearer ${authToken}`)
        .send(validTransferRequest);

      expect(response.status).toBe(201);
      expect(response.body).toEqual({
        success: true,
        message: 'Card transfer completed successfully',
        data: {
          transaction: expect.objectContaining({
            userId: mockUserId,
            type: 'card_transfer',
            amount: 3000,
            sourceCardId: 'source-card-id',
            targetCardId: 'target-card-id'
          })
        }
      });
    });

    test('should reject transfer with same source and target cards', async () => {
      const invalidTransferRequest = {
        fromCardId: 'same-card-id',
        toCardId: 'same-card-id',
        amount: 3000
      };

      const response = await request(app)
        .post('/api/v1/funding/transfer')
        .set('Authorization', `Bearer ${authToken}`)
        .send(invalidTransferRequest);

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Source and target cards must be different');
    });

    test('should reject transfer with insufficient source card balance', async () => {
      // Setup mocks
      const { supabase } = require('../../app');
      const { balanceService } = require('../../services/funding/balance.service');

      const mockCardsQuery = supabase.from('cards');
      mockCardsQuery.single
        .mockResolvedValueOnce({ data: { user_id: mockUserId, status: 'active' }, error: null })
        .mockResolvedValueOnce({ data: { user_id: mockUserId, status: 'active' }, error: null });

      balanceService.getCardBalance.mockResolvedValue({
        cardId: 'source-card-id',
        balance: 1000, // Only $10 available
        lastUpdated: '2024-01-01T00:00:00.000Z'
      });

      const response = await request(app)
        .post('/api/v1/funding/transfer')
        .set('Authorization', `Bearer ${authToken}`)
        .send(validTransferRequest);

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('Insufficient balance');
    });
  });

  describe('GET /api/v1/funding/balance', () => {
    test('should return account balance and notification thresholds', async () => {
      // Setup mocks
      const { balanceService } = require('../../services/funding/balance.service');

      balanceService.getAccountBalance.mockResolvedValue({
        userId: mockUserId,
        totalBalance: 50000,
        allocatedBalance: 30000,
        availableBalance: 20000,
        lastUpdated: '2024-01-01T00:00:00.000Z'
      });

      balanceService.getNotificationThresholds.mockResolvedValue({
        userId: mockUserId,
        accountThreshold: 2000,
        cardThreshold: 1000,
        enableNotifications: true,
        notificationMethods: ['email']
      });

      const response = await request(app)
        .get('/api/v1/funding/balance')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        success: true,
        data: {
          balance: expect.objectContaining({
            totalBalance: 50000,
            allocatedBalance: 30000,
            availableBalance: 20000
          }),
          notificationThresholds: expect.objectContaining({
            accountThreshold: 2000,
            cardThreshold: 1000,
            enableNotifications: true
          })
        }
      });
    });
  });

  describe('GET /api/v1/funding/transactions', () => {
    test('should return funding transaction history with pagination', async () => {
      // Setup mocks
      const { supabase } = require('../../app');
      const mockTransactions = [
        {
          id: 'tx-1',
          user_id: mockUserId,
          type: 'account_funding',
          amount: 10000,
          status: 'completed',
          created_at: '2024-01-01T00:00:00.000Z'
        },
        {
          id: 'tx-2',
          user_id: mockUserId,
          type: 'card_allocation',
          amount: 5000,
          status: 'completed',
          created_at: '2024-01-01T01:00:00.000Z'
        }
      ];

      const mockQuery = supabase.from('funding_transactions');
      mockQuery.limit.mockResolvedValue({ data: mockTransactions, error: null });

      const response = await request(app)
        .get('/api/v1/funding/transactions?limit=10&status=completed')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        success: true,
        data: expect.arrayContaining([
          expect.objectContaining({
            type: 'account_funding',
            amount: 10000,
            status: 'completed'
          }),
          expect.objectContaining({
            type: 'card_allocation',
            amount: 5000,
            status: 'completed'
          })
        ]),
        pagination: expect.objectContaining({
          total: 2,
          limit: 10,
          offset: 0
        })
      });
    });

    test('should filter transactions by type', async () => {
      const { supabase } = require('../../app');
      const mockQuery = supabase.from('funding_transactions');
      mockQuery.limit.mockResolvedValue({ data: [], error: null });

      const response = await request(app)
        .get('/api/v1/funding/transactions?type=account_funding')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(mockQuery.eq).toHaveBeenCalledWith('type', 'account_funding');
    });
  });

  describe('POST /api/v1/funding/webhooks/stripe', () => {
    test('should process Stripe webhook successfully', async () => {
      // Setup Stripe webhook mock
      const { stripeService } = require('../../services/funding/stripe.service');
      const { supabase } = require('../../app');

      const mockEvent = {
        id: 'evt_1234567890',
        type: 'payment_intent.succeeded',
        data: {
          object: {
            id: 'pi_1234567890'
          }
        }
      };

      stripeService.validateWebhookSignature.mockReturnValue(mockEvent);

      // Mock webhook processing
      const mockQuery = supabase.from('stripe_webhook_events');
      mockQuery.single.mockResolvedValueOnce({ data: null, error: { code: 'PGRST116' } });
      mockQuery.eq.mockResolvedValue({ error: null });

      const mockTransactionQuery = supabase.from('funding_transactions');
      mockTransactionQuery.single.mockResolvedValue({
        data: { transaction_id: 'test-tx' },
        error: null
      });

      const response = await request(app)
        .post('/api/v1/funding/webhooks/stripe')
        .set('stripe-signature', 't=1640995200,v1=test_signature')
        .send(JSON.stringify(mockEvent));

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        success: true,
        message: 'Webhook processed successfully'
      });
    });

    test('should reject webhook without signature', async () => {
      const response = await request(app)
        .post('/api/v1/funding/webhooks/stripe')
        .send({ test: 'data' });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Missing Stripe signature');
    });
  });

  describe('PUT /api/v1/funding/notifications', () => {
    test('should update notification thresholds successfully', async () => {
      // Setup mocks
      const { balanceService } = require('../../services/funding/balance.service');

      balanceService.updateNotificationThresholds.mockResolvedValue({
        userId: mockUserId,
        accountThreshold: 3000,
        cardThreshold: 1500,
        enableNotifications: false,
        notificationMethods: ['email', 'sms']
      });

      const updateRequest = {
        accountThreshold: 3000,
        cardThreshold: 1500,
        enableNotifications: false,
        notificationMethods: ['email', 'sms']
      };

      const response = await request(app)
        .put('/api/v1/funding/notifications')
        .set('Authorization', `Bearer ${authToken}`)
        .send(updateRequest);

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        success: true,
        message: 'Notification thresholds updated successfully',
        data: expect.objectContaining({
          accountThreshold: 3000,
          cardThreshold: 1500,
          enableNotifications: false,
          notificationMethods: ['email', 'sms']
        })
      });
    });

    test('should reject invalid notification methods', async () => {
      const invalidRequest = {
        notificationMethods: ['invalid_method', 'email']
      };

      const response = await request(app)
        .put('/api/v1/funding/notifications')
        .set('Authorization', `Bearer ${authToken}`)
        .send(invalidRequest);

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('Invalid notification methods');
    });
  });

  describe('GET /api/v1/funding/health', () => {
    test('should return health status', async () => {
      const response = await request(app)
        .get('/api/v1/funding/health');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        success: true,
        message: 'Funding service is healthy',
        timestamp: expect.any(String)
      });
    });
  });
});