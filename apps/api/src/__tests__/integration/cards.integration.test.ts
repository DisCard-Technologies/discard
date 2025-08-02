import { describe, test, expect, beforeAll, afterAll, beforeEach, afterEach } from '@jest/globals';
import request from 'supertest';
import app from '../../app';
import { supabase } from '../../app';
import { authService } from '../../services/auth/auth.service';

describe('Cards API Integration Tests', () => {
  let authToken: string;
  let userId: string;
  let testCardId: string;

  beforeAll(async () => {
    // Create a test user and get auth token
    const testUser = {
      email: 'test-cards@example.com',
      password: 'TestPassword123!',
      username: 'testcardsuser'
    };

    try {
      const result = await authService.register(testUser);
      userId = result.user.id;
      authToken = result.tokens.accessToken;
    } catch (error) {
      // User might already exist, try to login
      const loginResult = await authService.login({
        email: testUser.email,
        password: testUser.password
      });
      userId = loginResult.user.id;
      authToken = loginResult.tokens.accessToken;
    }
  });

  afterAll(async () => {
    // Clean up test data
    if (userId) {
      await supabase.from('cards').delete().eq('user_id', userId);
      await supabase.from('users').delete().eq('id', userId);
    }
  });

  beforeEach(async () => {
    // Clean up any existing cards before each test
    if (userId) {
      await supabase.from('cards').delete().eq('user_id', userId);
    }
  });

  describe('POST /api/v1/cards', () => {
    test('should create a new card successfully', async () => {
      const cardData = {
        spendingLimit: 10000, // $100.00
        expirationDate: '1226', // Dec 2026
        merchantRestrictions: ['grocery', 'gas']
      };

      const response = await request(app)
        .post('/api/v1/cards')
        .set('Authorization', `Bearer ${authToken}`)
        .send(cardData)
        .expect(201);

      expect(response.body).toEqual({
        success: true,
        message: 'Card created successfully',
        data: expect.objectContaining({
          card: expect.objectContaining({
            cardId: expect.any(String),
            status: 'active',
            spendingLimit: 10000,
            currentBalance: 0,
            merchantRestrictions: ['grocery', 'gas']
          }),
          cardNumber: expect.stringMatching(/^\d{16}$/),
          cvv: expect.stringMatching(/^\d{3}$/)
        })
      });

      testCardId = response.body.data.card.cardId;
    });

    test('should reject card creation with invalid spending limit', async () => {
      const cardData = {
        spendingLimit: 50 // Too low
      };

      const response = await request(app)
        .post('/api/v1/cards')
        .set('Authorization', `Bearer ${authToken}`)
        .send(cardData)
        .expect(400);

      expect(response.body).toEqual({
        success: false,
        error: expect.stringContaining('Spending limit must be between')
      });
    });

    test('should reject card creation without authentication', async () => {
      const cardData = {
        spendingLimit: 10000
      };

      const response = await request(app)
        .post('/api/v1/cards')
        .send(cardData)
        .expect(401);

      expect(response.body).toEqual({
        success: false,
        error: 'Authentication required'
      });
    });

    test('should reject card creation without spending limit', async () => {
      const cardData = {};

      const response = await request(app)
        .post('/api/v1/cards')
        .set('Authorization', `Bearer ${authToken}`)
        .send(cardData)
        .expect(400);

      expect(response.body).toEqual({
        success: false,
        error: 'Spending limit is required'
      });
    });
  });

  describe('GET /api/v1/cards', () => {
    beforeEach(async () => {
      // Create a test card for listing tests
      const response = await request(app)
        .post('/api/v1/cards')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ spendingLimit: 10000 });
      
      testCardId = response.body.data.card.cardId;
    });

    test('should list user cards successfully', async () => {
      const response = await request(app)
        .get('/api/v1/cards')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body).toEqual({
        success: true,
        data: expect.arrayContaining([
          expect.objectContaining({
            cardId: testCardId,
            status: 'active',
            spendingLimit: 10000
          })
        ]),
        pagination: expect.objectContaining({
          total: expect.any(Number),
          limit: 50
        })
      });
    });

    test('should filter cards by status', async () => {
      const response = await request(app)
        .get('/api/v1/cards?status=active&limit=10')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.data).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            status: 'active'
          })
        ])
      );
    });

    test('should reject listing without authentication', async () => {
      const response = await request(app)
        .get('/api/v1/cards')
        .expect(401);

      expect(response.body).toEqual({
        success: false,
        error: 'Authentication required'
      });
    });
  });

  describe('GET /api/v1/cards/:cardId', () => {
    beforeEach(async () => {
      // Create a test card
      const response = await request(app)
        .post('/api/v1/cards')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ spendingLimit: 10000 });
      
      testCardId = response.body.data.card.cardId;
    });

    test('should get card details successfully', async () => {
      const response = await request(app)
        .get(`/api/v1/cards/${testCardId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body).toEqual({
        success: true,
        data: expect.objectContaining({
          card: expect.objectContaining({
            cardId: testCardId,
            status: 'active',
            spendingLimit: 10000
          }),
          transactionHistory: expect.any(Array)
        })
      });
    });

    test('should return 404 for non-existent card', async () => {
      const nonExistentCardId = 'non-existent-card-id';
      
      const response = await request(app)
        .get(`/api/v1/cards/${nonExistentCardId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(404);

      expect(response.body).toEqual({
        success: false,
        error: expect.stringContaining('not found')
      });
    });
  });

  describe('PUT /api/v1/cards/:cardId/status', () => {
    beforeEach(async () => {
      // Create a test card
      const response = await request(app)
        .post('/api/v1/cards')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ spendingLimit: 10000 });
      
      testCardId = response.body.data.card.cardId;
    });

    test('should pause card successfully', async () => {
      const response = await request(app)
        .put(`/api/v1/cards/${testCardId}/status`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ status: 'paused' })
        .expect(200);

      expect(response.body).toEqual({
        success: true,
        message: 'Card paused successfully',
        data: expect.objectContaining({
          cardId: testCardId,
          status: 'paused'
        })
      });
    });

    test('should reactivate card successfully', async () => {
      // First pause the card
      await request(app)
        .put(`/api/v1/cards/${testCardId}/status`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ status: 'paused' });

      // Then reactivate it
      const response = await request(app)
        .put(`/api/v1/cards/${testCardId}/status`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ status: 'active' })
        .expect(200);

      expect(response.body).toEqual({
        success: true,
        message: 'Card activated successfully',
        data: expect.objectContaining({
          cardId: testCardId,
          status: 'active'
        })
      });
    });

    test('should reject invalid status', async () => {
      const response = await request(app)
        .put(`/api/v1/cards/${testCardId}/status`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ status: 'invalid' })
        .expect(400);

      expect(response.body).toEqual({
        success: false,
        error: 'Valid status is required (active or paused)'
      });
    });
  });

  describe('DELETE /api/v1/cards/:cardId', () => {
    beforeEach(async () => {
      // Create a test card
      const response = await request(app)
        .post('/api/v1/cards')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ spendingLimit: 10000 });
      
      testCardId = response.body.data.card.cardId;
    });

    test('should delete card successfully', async () => {
      const response = await request(app)
        .delete(`/api/v1/cards/${testCardId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body).toEqual({
        success: true,
        message: 'Card deleted successfully',
        data: expect.objectContaining({
          deletionProof: expect.any(String)
        })
      });

      // Verify card is marked as deleted
      const cardResponse = await request(app)
        .get(`/api/v1/cards/${testCardId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(cardResponse.body.data.card.status).toBe('deleted');
    });

    test('should return 404 for non-existent card', async () => {
      const nonExistentCardId = 'non-existent-card-id';
      
      const response = await request(app)
        .delete(`/api/v1/cards/${nonExistentCardId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(404);

      expect(response.body).toEqual({
        success: false,
        error: expect.stringContaining('not found')
      });
    });

    test('should prevent double deletion', async () => {
      // First deletion
      await request(app)
        .delete(`/api/v1/cards/${testCardId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      // Second deletion attempt
      const response = await request(app)
        .delete(`/api/v1/cards/${testCardId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(409);

      expect(response.body).toEqual({
        success: false,
        error: expect.stringContaining('already deleted')
      });
    });
  });

  describe('GET /api/v1/cards/:cardId/credentials', () => {
    beforeEach(async () => {
      // Create a test card
      const response = await request(app)
        .post('/api/v1/cards')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ spendingLimit: 10000 });
      
      testCardId = response.body.data.card.cardId;
    });

    test('should return card credentials securely', async () => {
      const response = await request(app)
        .get(`/api/v1/cards/${testCardId}/credentials`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body).toEqual({
        success: true,
        data: expect.objectContaining({
          cardNumber: expect.stringMatching(/^\d{16}$/),
          cvv: expect.stringMatching(/^\d{3}$/)
        })
      });
    });

    test('should return 404 for non-existent card', async () => {
      const nonExistentCardId = 'non-existent-card-id';
      
      const response = await request(app)
        .get(`/api/v1/cards/${nonExistentCardId}/credentials`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(404);

      expect(response.body).toEqual({
        success: false,
        error: expect.stringContaining('not found')
      });
    });
  });

  describe('GET /api/v1/cards/:cardId/privacy-status', () => {
    beforeEach(async () => {
      // Create a test card
      const response = await request(app)
        .post('/api/v1/cards')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ spendingLimit: 10000 });
      
      testCardId = response.body.data.card.cardId;
    });

    test('should return privacy status successfully', async () => {
      const response = await request(app)
        .get(`/api/v1/cards/${testCardId}/privacy-status`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body).toEqual({
        success: true,
        data: expect.objectContaining({
          cardId: testCardId,
          privacyIsolated: true,
          encryptionStatus: 'active',
          deletionVerifiable: true,
          status: 'active'
        })
      });
    });
  });

  describe('GET /api/v1/cards/health', () => {
    test('should return health status', async () => {
      const response = await request(app)
        .get('/api/v1/cards/health')
        .expect(200);

      expect(response.body).toEqual({
        success: true,
        message: 'Cards service is healthy',
        timestamp: expect.any(String)
      });
    });
  });
});