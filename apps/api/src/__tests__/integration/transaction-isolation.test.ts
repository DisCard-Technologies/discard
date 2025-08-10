import request from 'supertest';
import { app } from '../../app';
import { TransactionIsolationService } from '../../services/privacy/transaction-isolation.service';

jest.mock('../../services/privacy/transaction-isolation.service');

describe('Transaction Isolation Integration', () => {
  let mockIsolationService: jest.Mocked<TransactionIsolationService>;

  beforeEach(() => {
    mockIsolationService = new TransactionIsolationService('', '') as jest.Mocked<TransactionIsolationService>;
    mockIsolationService.enforceTransactionIsolation = jest.fn();
    mockIsolationService.verifyIsolation = jest.fn();
    mockIsolationService.switchContext = jest.fn();
    mockIsolationService.getIsolationStatus = jest.fn();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('POST /api/v1/privacy/isolation/enforce', () => {
    it('should enforce isolation for valid card', async () => {
      const cardId = 'test-card-123';
      mockIsolationService.enforceTransactionIsolation.mockResolvedValueOnce();

      const response = await request(app)
        .post('/api/v1/privacy/isolation/enforce')
        .set('X-Card-Context', cardId)
        .send({ cardId });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(mockIsolationService.enforceTransactionIsolation).toHaveBeenCalledWith(cardId);
    });

    it('should reject request without card context', async () => {
      const response = await request(app)
        .post('/api/v1/privacy/isolation/enforce')
        .send({});

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('Card context required');
    });

    it('should handle isolation enforcement failure', async () => {
      const cardId = 'test-card-123';
      mockIsolationService.enforceTransactionIsolation.mockRejectedValueOnce(
        new Error('Isolation verification failed')
      );

      const response = await request(app)
        .post('/api/v1/privacy/isolation/enforce')
        .set('X-Card-Context', cardId)
        .send({ cardId });

      expect(response.status).toBe(403);
      expect(response.body.error).toContain('Privacy isolation could not be verified');
    });
  });

  describe('GET /api/v1/privacy/isolation/verify/:cardId', () => {
    it('should return isolation verification status', async () => {
      const cardId = 'test-card-123';
      const mockStatus = {
        isolated: true,
        lastVerified: new Date(),
        violationCount: 0,
        riskLevel: 'low' as const
      };

      mockIsolationService.getIsolationStatus.mockResolvedValueOnce(mockStatus);

      const response = await request(app)
        .get(`/api/v1/privacy/isolation/verify/${cardId}`)
        .set('X-Card-Context', cardId);

      expect(response.status).toBe(200);
      expect(response.body.isolated).toBe(true);
      expect(response.body.riskLevel).toBe('low');
      expect(response.body.violationCount).toBe(0);
    });

    it('should handle invalid card ID', async () => {
      const response = await request(app)
        .get('/api/v1/privacy/isolation/verify/invalid-card')
        .set('X-Card-Context', 'invalid-card');

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('Invalid card ID');
    });
  });

  describe('POST /api/v1/privacy/isolation/switch-context', () => {
    it('should successfully switch context', async () => {
      const fromCardId = 'card-1';
      const toCardId = 'card-2';

      mockIsolationService.switchContext.mockResolvedValueOnce();

      const response = await request(app)
        .post('/api/v1/privacy/isolation/switch-context')
        .send({ fromCardId, toCardId });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.newContext.cardId).toBe(toCardId);
      expect(mockIsolationService.switchContext).toHaveBeenCalledWith(fromCardId, toCardId);
    });

    it('should require both card IDs', async () => {
      const response = await request(app)
        .post('/api/v1/privacy/isolation/switch-context')
        .send({ fromCardId: 'card-1' });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('Both fromCardId and toCardId are required');
    });

    it('should handle context switch failure', async () => {
      const fromCardId = 'card-1';
      const toCardId = 'card-2';

      mockIsolationService.switchContext.mockRejectedValueOnce(
        new Error('Context switch verification failed')
      );

      const response = await request(app)
        .post('/api/v1/privacy/isolation/switch-context')
        .send({ fromCardId, toCardId });

      expect(response.status).toBe(500);
      expect(response.body.error).toContain('Failed to switch isolation context');
    });
  });

  describe('Isolation Middleware Integration', () => {
    it('should enforce isolation on protected routes', async () => {
      const cardId = 'test-card-123';
      
      // Mock successful isolation enforcement
      mockIsolationService.enforceTransactionIsolation.mockResolvedValueOnce();

      const response = await request(app)
        .get(`/api/v1/cards/${cardId}/transactions`)
        .set('X-Card-Context', cardId);

      // Should not be blocked by isolation middleware
      expect(response.status).not.toBe(403);
    });

    it('should block requests without card context', async () => {
      const response = await request(app)
        .get('/api/v1/cards/test-card/transactions');

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('Card context required');
    });

    it('should prevent cross-card access', async () => {
      const cardId = 'test-card-123';
      const differentCardId = 'different-card-456';

      mockIsolationService.enforceTransactionIsolation.mockResolvedValueOnce();

      const response = await request(app)
        .get(`/api/v1/cards/${differentCardId}/transactions`)
        .set('X-Card-Context', cardId);

      expect(response.status).toBe(403);
      expect(response.body.error).toContain('Cross-card access not permitted');
    });
  });

  describe('Performance Requirements', () => {
    it('should verify isolation within 100ms', async () => {
      const cardId = 'test-card-123';
      mockIsolationService.getIsolationStatus.mockResolvedValueOnce({
        isolated: true,
        lastVerified: new Date(),
        violationCount: 0,
        riskLevel: 'low'
      });

      const startTime = Date.now();
      await request(app)
        .get(`/api/v1/privacy/isolation/verify/${cardId}`)
        .set('X-Card-Context', cardId);
      const endTime = Date.now();

      expect(endTime - startTime).toBeLessThan(100);
    });

    it('should enforce context switching within 2 seconds', async () => {
      const fromCardId = 'card-1';
      const toCardId = 'card-2';

      mockIsolationService.switchContext.mockResolvedValueOnce();

      const startTime = Date.now();
      await request(app)
        .post('/api/v1/privacy/isolation/switch-context')
        .send({ fromCardId, toCardId });
      const endTime = Date.now();

      expect(endTime - startTime).toBeLessThan(2000);
    });
  });

  describe('Privacy Headers', () => {
    it('should include privacy protection headers', async () => {
      const cardId = 'test-card-123';
      mockIsolationService.getIsolationStatus.mockResolvedValueOnce({
        isolated: true,
        lastVerified: new Date(),
        violationCount: 0,
        riskLevel: 'low'
      });

      const response = await request(app)
        .get(`/api/v1/privacy/isolation/verify/${cardId}`)
        .set('X-Card-Context', cardId);

      expect(response.headers['x-privacy-protected']).toBe('true');
      expect(response.headers['x-correlation-resistant']).toBe('true');
      expect(response.headers['cache-control']).toContain('no-store');
      expect(response.headers['x-powered-by']).toBeUndefined();
    });
  });

  describe('Rate Limiting', () => {
    it('should apply rate limiting by context', async () => {
      const cardId = 'test-card-123';
      mockIsolationService.getIsolationStatus.mockResolvedValue({
        isolated: true,
        lastVerified: new Date(),
        violationCount: 0,
        riskLevel: 'low'
      });

      // Make rapid requests
      const requests = Array(150).fill(null).map(() =>
        request(app)
          .get(`/api/v1/privacy/isolation/verify/${cardId}`)
          .set('X-Card-Context', cardId)
      );

      const responses = await Promise.all(requests);
      const rateLimitedResponses = responses.filter(r => r.status === 429);

      expect(rateLimitedResponses.length).toBeGreaterThan(0);
    });
  });
});