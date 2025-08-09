import request from 'supertest';
import app  from '../../app';
import { createClient } from '@supabase/supabase-js';
import { VisaService } from '../../services/payments/visa.service';
import { MarqetaService } from '../../services/payments/marqeta.service';
import { RestrictionsService } from '../../services/payments/restrictions.service';

// Mock external services
jest.mock('../../services/payments/marqeta.service');
jest.mock('@supabase/supabase-js');

const MockedMarqetaService = MarqetaService as jest.MockedClass<typeof MarqetaService>;
const mockSupabaseClient = {
  from: jest.fn().mockReturnThis(),
  insert: jest.fn().mockReturnThis(),
  update: jest.fn().mockReturnThis(),
  select: jest.fn().mockReturnThis(),
  delete: jest.fn().mockReturnThis(),
  eq: jest.fn().mockReturnThis(),
  single: jest.fn().mockReturnThis(),
  rpc: jest.fn().mockReturnThis(),
  auth: {
    getUser: jest.fn()
  }
};

(createClient as jest.Mock).mockReturnValue(mockSupabaseClient);

// Mock JWT for authentication
const mockJWT = {
  sign: jest.fn(),
  verify: jest.fn()
};

jest.mock('jsonwebtoken', () => mockJWT);

// Test data
const mockUser = {
  id: 'user_123',
  email: 'test@example.com'
};

const mockCard = {
  card_id: 'card_123',
  user_id: 'user_123',
  card_context: 'context_123',
  status: 'active',
  spending_limit: 50000,
  current_balance: 50000,
  created_at: '2024-01-20T10:00:00Z'
};

const mockMarqetaCard = {
  token: 'marqeta_token_123',
  pan: '5549481234567890',
  cvv_number: '123',
  last_four: '7890',
  expiration: '1225',
  state: 'UNACTIVATED'
};

const mockVisaCard = {
  visa_card_id: 'visa_123',
  card_id: 'card_123',
  card_context: 'context_123',
  marqeta_card_token: 'marqeta_token_123',
  encrypted_card_number: 'encrypted_pan',
  encrypted_cvv: 'encrypted_cvv',
  expiration_month: 12,
  expiration_year: 2025,
  bin_number: '554948',
  provisioning_status: 'active',
  last_four_digits: '7890'
};

// Mock environment variables
const originalEnv = process.env;
beforeAll(() => {
  process.env = {
    ...originalEnv,
    JWT_SECRET: 'test_jwt_secret',
    CARD_ENCRYPTION_KEY: 'test_encryption_key_32_characters',
    MARQETA_BASE_URL: 'https://sandbox-api.marqeta.com/v3',
    MARQETA_APPLICATION_TOKEN: 'test_app_token',
    MARQETA_ACCESS_TOKEN: 'test_access_token',
    SUPABASE_URL: 'https://test.supabase.co',
    SUPABASE_SERVICE_KEY: 'test_service_key'
  };
});

afterAll(() => {
  process.env = originalEnv;
});

describe('Visa Card Provisioning Integration', () => {
  let mockMarqetaService: jest.Mocked<MarqetaService>;

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Setup authentication mock
    mockJWT.verify.mockReturnValue({ userId: 'user_123' });
    mockSupabaseClient.auth.getUser.mockResolvedValue({
      data: { user: mockUser },
      error: null
    });

    // Setup Marqeta service mock
    mockMarqetaService = new MockedMarqetaService() as jest.Mocked<MarqetaService>;
    MockedMarqetaService.prototype.createCard = jest.fn().mockResolvedValue(mockMarqetaCard);
    MockedMarqetaService.prototype.activateCard = jest.fn().mockResolvedValue({
      ...mockMarqetaCard,
      state: 'ACTIVE'
    });
    MockedMarqetaService.prototype.checkNetworkHealth = jest.fn().mockResolvedValue({
      isHealthy: true,
      responseTime: 150,
      status: 'HTTP 200'
    });

    // Setup database mocks
    mockSupabaseClient.rpc.mockResolvedValue({ data: null });
  });

  describe('POST /api/v1/cards - Card Creation with Visa Provisioning', () => {
    beforeEach(() => {
      // Mock card creation response
      mockSupabaseClient.insert.mockResolvedValue({ data: mockCard });
      mockSupabaseClient.select.mockReturnThis();
      mockSupabaseClient.single.mockResolvedValue({ data: mockCard });
    });

    it('should create card with Visa provisioning successfully', async () => {
      const cardData = {
        spendingLimit: 50000, // $500 in cents
        merchantRestrictions: ['7995', '5967'] // Gambling and adult content
      };

      const response = await request(app)
        .post('/api/v1/cards')
        .set('Authorization', 'Bearer valid_token')
        .send(cardData)
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.message).toBe('Card created successfully');
      expect(response.body.data.card).toMatchObject({
        cardId: mockCard.card_id,
        userId: mockUser.id,
        spendingLimit: 50000
      });

      // Verify card credentials are returned
      expect(response.body.data.cardNumber).toBeDefined();
      expect(response.body.data.cvv).toBeDefined();
    });

    it('should apply merchant restrictions during creation', async () => {
      const cardData = {
        spendingLimit: 25000,
        merchantRestrictions: ['7995', '6010'] // Gambling and cash advances
      };

      await request(app)
        .post('/api/v1/cards')
        .set('Authorization', 'Bearer valid_token')
        .send(cardData)
        .expect(201);

      // In a real test, we would verify that restrictions were applied
      // through the RestrictionsService
    });

    it('should handle Visa provisioning failure gracefully', async () => {
      MockedMarqetaService.prototype.createCard = jest.fn().mockRejectedValue(
        new Error('Marqeta API error')
      );

      const cardData = {
        spendingLimit: 10000
      };

      // Card should still be created even if Visa provisioning fails
      const response = await request(app)
        .post('/api/v1/cards')
        .set('Authorization', 'Bearer valid_token')
        .send(cardData)
        .expect(201);

      expect(response.body.success).toBe(true);
    });
  });

  describe('PUT /api/v1/cards/:cardId/activate - Card Activation', () => {
    beforeEach(() => {
      // Mock card lookup
      mockSupabaseClient.select.mockReturnThis();
      mockSupabaseClient.single.mockResolvedValue({ data: mockCard });
      
      // Mock visa card lookup
      mockSupabaseClient.eq.mockReturnThis();
      mockSupabaseClient.single.mockResolvedValueOnce({ data: mockVisaCard });
      
      // Mock update response
      mockSupabaseClient.update.mockReturnThis();
      mockSupabaseClient.single.mockResolvedValueOnce({ 
        data: { ...mockVisaCard, provisioning_status: 'active' }
      });
    });

    it('should activate card successfully', async () => {
      const response = await request(app)
        .put('/api/v1/cards/card_123/activate')
        .set('Authorization', 'Bearer valid_token')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.message).toBe('Card activated successfully');
      expect(response.body.data.provisioningStatus).toBe('active');
    });

    it('should return 404 for non-existent card', async () => {
      mockSupabaseClient.single
        .mockResolvedValueOnce({ data: null }) // Card not found
        .mockResolvedValueOnce({ data: null }); // Visa card not found

      const response = await request(app)
        .put('/api/v1/cards/nonexistent/activate')
        .set('Authorization', 'Bearer valid_token')
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('not found');
    });

    it('should return 404 if visa card not found', async () => {
      mockSupabaseClient.single
        .mockResolvedValueOnce({ data: mockCard }) // Card found
        .mockResolvedValueOnce({ data: null }); // Visa card not found

      const response = await request(app)
        .put('/api/v1/cards/card_123/activate')
        .set('Authorization', 'Bearer valid_token')
        .expect(404);

      expect(response.body.error).toBe('Visa card not found');
    });
  });

  describe('PUT /api/v1/cards/:cardId/restrictions - Update Restrictions', () => {
    beforeEach(() => {
      // Mock card ownership verification
      mockSupabaseClient.select.mockReturnThis();
      mockSupabaseClient.single.mockResolvedValue({ data: mockCard });
      
      // Mock restrictions service responses
      const mockRestrictions = [
        {
          restrictionId: 'restr_1',
          cardContext: 'context_123',
          restrictionType: 'merchant_category',
          restrictionValue: '7995',
          isAllowed: false
        }
      ];
      
      mockSupabaseClient.delete.mockReturnThis();
      mockSupabaseClient.eq.mockReturnThis();
      mockSupabaseClient.insert.mockResolvedValue({ data: mockRestrictions[0] });
    });

    it('should apply restriction template successfully', async () => {
      const restrictionData = {
        template: 'Safe Spending'
      };

      const response = await request(app)
        .put('/api/v1/cards/card_123/restrictions')
        .set('Authorization', 'Bearer valid_token')
        .send(restrictionData)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.message).toBe('Restrictions updated successfully');
    });

    it('should update individual restrictions successfully', async () => {
      const restrictionData = {
        restrictions: [
          {
            restrictionType: 'merchant_category',
            restrictionValue: '7995',
            isAllowed: false
          },
          {
            restrictionType: 'geographic',
            restrictionValue: 'US',
            isAllowed: true
          }
        ]
      };

      const response = await request(app)
        .put('/api/v1/cards/card_123/restrictions')
        .set('Authorization', 'Bearer valid_token')
        .send(restrictionData)
        .expect(200);

      expect(response.body.success).toBe(true);
    });

    it('should return 400 for missing restriction data', async () => {
      const response = await request(app)
        .put('/api/v1/cards/card_123/restrictions')
        .set('Authorization', 'Bearer valid_token')
        .send({})
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('Either restrictions array or template name is required');
    });
  });

  describe('GET /api/v1/cards/:cardId/status - Card Status', () => {
    beforeEach(() => {
      // Mock card details lookup
      mockSupabaseClient.select.mockReturnThis();
      mockSupabaseClient.single
        .mockResolvedValueOnce({ data: mockCard }) // Basic card details
        .mockResolvedValueOnce({ data: mockVisaCard }) // Visa card details
        .mockResolvedValueOnce({ data: [] }) // Provisioning status
        .mockResolvedValueOnce({ data: [] }); // Restrictions
    });

    it('should return comprehensive card status', async () => {
      const response = await request(app)
        .get('/api/v1/cards/card_123/status')
        .set('Authorization', 'Bearer valid_token')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toMatchObject({
        cardId: 'card_123',
        basicStatus: 'active',
        visaCard: {
          provisioningStatus: 'active'
        },
        restrictions: {
          count: 0
        }
      });
    });
  });

  describe('GET /api/v1/network/status - Network Status', () => {
    it('should return network health status', async () => {
      const response = await request(app)
        .get('/api/v1/network/status')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.network).toBe('Marqeta/Visa');
      expect(response.body.data.isHealthy).toBe(true);
      expect(response.body.data.responseTime).toBe(150);
    });

    it('should handle network health check failure', async () => {
      MockedMarqetaService.prototype.checkNetworkHealth = jest.fn().mockRejectedValue(
        new Error('Network error')
      );

      const response = await request(app)
        .get('/api/v1/network/status')
        .expect(500);

      expect(response.body.success).toBe(false);
      expect(response.body.data.isHealthy).toBe(false);
    });
  });

  describe('Authorization Flow Integration', () => {
    it('should process authorization request end-to-end', async () => {
      // Mock authorization service
      const mockAuthResult = {
        approved: true,
        authorizationCode: 'AUTH123',
        holdId: 'hold_123',
        responseTimeMs: 250
      };

      // This would test the complete authorization flow
      // from webhook to database to WebSocket notification
      const authRequest = {
        cardContext: 'context_123',
        marqetaTransactionToken: 'tx_123',
        merchantName: 'Test Store',
        merchantCategoryCode: '5411',
        amount: 2500 // $25.00
      };

      const response = await request(app)
        .post('/api/v1/payments/authorize')
        .send(authRequest)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.approved).toBe(true);
    });
  });

  describe('Performance Requirements', () => {
    it('should meet sub-second response time requirement', async () => {
      const startTime = Date.now();

      await request(app)
        .get('/api/v1/network/status')
        .expect(200);

      const responseTime = Date.now() - startTime;
      expect(responseTime).toBeLessThan(800); // Should be under 800ms
    });

    it('should handle concurrent card creations', async () => {
      const cardRequests = Array(5).fill({
        spendingLimit: 10000
      });

      // Mock card creation responses
      mockSupabaseClient.insert.mockResolvedValue({ data: mockCard });
      mockSupabaseClient.select.mockReturnThis();
      mockSupabaseClient.single.mockResolvedValue({ data: mockCard });

      const promises = cardRequests.map((cardData, index) =>
        request(app)
          .post('/api/v1/cards')
          .set('Authorization', 'Bearer valid_token')
          .send({ ...cardData, spendingLimit: 10000 + index * 1000 })
          .expect(201)
      );

      const responses = await Promise.all(promises);

      responses.forEach(response => {
        expect(response.body.success).toBe(true);
      });
    });
  });

  describe('Error Handling', () => {
    it('should handle database connection errors', async () => {
      mockSupabaseClient.single.mockRejectedValue(new Error('Database connection failed'));

      const response = await request(app)
        .get('/api/v1/cards/card_123/status')
        .set('Authorization', 'Bearer valid_token')
        .expect(500);

      expect(response.body.success).toBe(false);
    });

    it('should handle authentication errors', async () => {
      const response = await request(app)
        .post('/api/v1/cards')
        .send({ spendingLimit: 10000 })
        .expect(401);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Authentication required');
    });

    it('should validate request data', async () => {
      const response = await request(app)
        .post('/api/v1/cards')
        .set('Authorization', 'Bearer valid_token')
        .send({ spendingLimit: 50 }) // Below minimum
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('Spending limit must be between');
    });
  });
});