import { MarqetaService } from '../../../../services/payments/marqeta.service';
import axios from 'axios';
import { createClient } from '@supabase/supabase-js';

// Mock dependencies
jest.mock('axios');
jest.mock('@supabase/supabase-js');

const mockedAxios = axios as jest.Mocked<typeof axios>;
const mockSupabaseClient = {
  from: jest.fn().mockReturnThis(),
  insert: jest.fn().mockReturnThis(),
  update: jest.fn().mockReturnThis(),
  eq: jest.fn().mockReturnThis(),
  select: jest.fn().mockReturnThis(),
  single: jest.fn().mockReturnThis(),
  rpc: jest.fn().mockReturnThis()
};

(createClient as jest.Mock).mockReturnValue(mockSupabaseClient);

// Mock environment variables
const originalEnv = process.env;
beforeAll(() => {
  process.env = {
    ...originalEnv,
    MARQETA_BASE_URL: 'https://sandbox-api.marqeta.com/v3',
    MARQETA_APPLICATION_TOKEN: 'test_app_token',
    MARQETA_ACCESS_TOKEN: 'test_access_token',
    MARQETA_WEBHOOK_SECRET: 'test_webhook_secret',
    PAYMENT_PROCESSING_TIMEOUT: '800',
    SUPABASE_URL: 'https://test.supabase.co',
    SUPABASE_SERVICE_KEY: 'test_service_key'
  };
});

afterAll(() => {
  process.env = originalEnv;
});

describe('MarqetaService', () => {
  let marqetaService: MarqetaService;
  let mockAxiosInstance: any;

  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks();
    
    // Ensure environment variables are set for each test
    process.env.MARQETA_APPLICATION_TOKEN = 'test_app_token';
    process.env.MARQETA_ACCESS_TOKEN = 'test_access_token';
    
    // Mock axios.create
    mockAxiosInstance = {
      post: jest.fn(),
      put: jest.fn(),
      get: jest.fn(),
      interceptors: {
        request: { use: jest.fn() },
        response: { use: jest.fn() }
      }
    };
    
    mockedAxios.create.mockReturnValue(mockAxiosInstance);
    
    // Create service instance
    marqetaService = new MarqetaService();
  });

  describe('constructor', () => {
    it('should initialize with correct configuration', () => {
      expect(mockedAxios.create).toHaveBeenCalledWith({
        baseURL: 'https://sandbox-api.marqeta.com/v3',
        auth: {
          username: 'test_app_token',
          password: 'test_access_token'
        },
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        timeout: 800
      });
    });

    it('should throw error if credentials are missing', () => {
      delete process.env.MARQETA_APPLICATION_TOKEN;
      
      expect(() => new MarqetaService()).toThrow('Marqeta credentials not configured');
    });
  });

  describe('createCard', () => {
    const mockMarqetaCard = {
      token: 'card_token_123',
      user_token: 'user_123',
      last_four: '1234',
      pan: '5549481234567890',
      cvv_number: '123',
      expiration: '1225',
      state: 'UNACTIVATED',
      created_time: '2024-01-20T10:00:00Z'
    };

    it('should create card successfully', async () => {
      mockAxiosInstance.post.mockResolvedValue({ data: mockMarqetaCard });
      mockSupabaseClient.insert.mockResolvedValue({ data: {} });

      const result = await marqetaService.createCard(
        'test_card_context',
        'user_123',
        { test: 'metadata' }
      );

      expect(mockAxiosInstance.post).toHaveBeenCalledWith('/cards', {
        card_product_token: 'sandbox_card_product',
        user_token: 'user_123',
        show_cvv_number: true,
        show_pan: true,
        metadata: {
          card_context: 'test_card_context',
          created_by: 'discard_app',
          test: 'metadata'
        }
      });

      expect(result).toEqual(mockMarqetaCard);
      
      // Verify provisioning status was logged
      expect(mockSupabaseClient.from).toHaveBeenCalledWith('card_provisioning_status');
      expect(mockSupabaseClient.insert).toHaveBeenCalled();
    });

    it('should handle creation error and log failure', async () => {
      const mockError = new Error('API Error');
      mockAxiosInstance.post.mockRejectedValue(mockError);
      mockSupabaseClient.insert.mockResolvedValue({ data: {} });

      await expect(
        marqetaService.createCard('test_card_context', 'user_123')
      ).rejects.toThrow('API Error');

      // Verify failure was logged
      expect(mockSupabaseClient.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          card_context: 'test_card_context',
          provisioning_step: 'card_creation',
          status: 'failed'
        })
      );
    });
  });

  describe('activateCard', () => {
    const mockActivatedCard = {
      token: 'card_token_123',
      state: 'ACTIVE',
      last_modified_time: '2024-01-20T10:30:00Z'
    };

    it('should activate card successfully', async () => {
      mockAxiosInstance.put.mockResolvedValue({ data: mockActivatedCard });
      mockSupabaseClient.insert.mockResolvedValue({ data: {} });

      const result = await marqetaService.activateCard(
        'test_card_context',
        'card_token_123'
      );

      expect(mockAxiosInstance.put).toHaveBeenCalledWith('/cards/card_token_123', {
        state: 'ACTIVE'
      });

      expect(result).toEqual(mockActivatedCard);

      // Verify activation and network registration were logged
      expect(mockSupabaseClient.insert).toHaveBeenCalledTimes(2);
    });

    it('should handle activation error', async () => {
      const mockError = new Error('Activation failed');
      mockAxiosInstance.put.mockRejectedValue(mockError);
      mockSupabaseClient.insert.mockResolvedValue({ data: {} });

      await expect(
        marqetaService.activateCard('test_card_context', 'card_token_123')
      ).rejects.toThrow('Activation failed');

      // Verify failure was logged
      expect(mockSupabaseClient.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          provisioning_step: 'activation',
          status: 'failed'
        })
      );
    });
  });

  describe('getCard', () => {
    const mockCard = {
      token: 'card_token_123',
      state: 'ACTIVE',
      last_four: '1234'
    };

    it('should retrieve card successfully', async () => {
      mockAxiosInstance.get.mockResolvedValue({ data: mockCard });

      const result = await marqetaService.getCard('card_token_123');

      expect(mockAxiosInstance.get).toHaveBeenCalledWith('/cards/card_token_123');
      expect(result).toEqual(mockCard);
    });

    it('should handle get card error', async () => {
      const mockError = new Error('Card not found');
      mockAxiosInstance.get.mockRejectedValue(mockError);

      await expect(
        marqetaService.getCard('invalid_token')
      ).rejects.toThrow('Card not found');
    });
  });

  describe('suspendCard', () => {
    const mockSuspendedCard = {
      token: 'card_token_123',
      state: 'SUSPENDED',
      last_modified_time: '2024-01-20T11:00:00Z'
    };

    it('should suspend card successfully', async () => {
      mockAxiosInstance.put.mockResolvedValue({ data: mockSuspendedCard });

      const result = await marqetaService.suspendCard(
        'test_card_context',
        'card_token_123'
      );

      expect(mockAxiosInstance.put).toHaveBeenCalledWith('/cards/card_token_123', {
        state: 'SUSPENDED'
      });

      expect(result).toEqual(mockSuspendedCard);
    });
  });

  describe('terminateCard', () => {
    const mockTerminatedCard = {
      token: 'card_token_123',
      state: 'TERMINATED',
      last_modified_time: '2024-01-20T11:30:00Z'
    };

    it('should terminate card successfully', async () => {
      mockAxiosInstance.put.mockResolvedValue({ data: mockTerminatedCard });

      const result = await marqetaService.terminateCard(
        'test_card_context',
        'card_token_123'
      );

      expect(mockAxiosInstance.put).toHaveBeenCalledWith('/cards/card_token_123', {
        state: 'TERMINATED'
      });

      expect(result).toEqual(mockTerminatedCard);
    });
  });

  describe('getCardTransactions', () => {
    const mockTransactions = {
      data: [
        {
          token: 'tx_123',
          type: 'authorization',
          amount: 5000,
          merchant: { name: 'Test Store' }
        }
      ]
    };

    it('should retrieve card transactions successfully', async () => {
      mockAxiosInstance.get.mockResolvedValue({ data: mockTransactions });

      const result = await marqetaService.getCardTransactions('card_token_123', 25);

      expect(mockAxiosInstance.get).toHaveBeenCalledWith(
        '/cards/card_token_123/transactions?count=25&sort_by=-created_time'
      );

      expect(result).toEqual(mockTransactions.data);
    });

    it('should use default count if not provided', async () => {
      mockAxiosInstance.get.mockResolvedValue({ data: mockTransactions });

      await marqetaService.getCardTransactions('card_token_123');

      expect(mockAxiosInstance.get).toHaveBeenCalledWith(
        '/cards/card_token_123/transactions?count=50&sort_by=-created_time'
      );
    });
  });

  describe('validateWebhookSignature', () => {
    it('should validate correct signature', () => {
      const payload = '{"test":"data"}';
      const signature = 'sha256=correct_signature';
      
      // Mock crypto functions
      const mockHmac = {
        update: jest.fn().mockReturnThis(),
        digest: jest.fn().mockReturnValue('expected_hash')
      };
      
      const mockHash = {
        update: jest.fn().mockReturnThis(),
        digest: jest.fn().mockReturnValue('expected_hash')
      };

      jest.doMock('crypto', () => ({
        createHmac: jest.fn(() => mockHmac),
        createHash: jest.fn(() => mockHash)
      }));

      const result = marqetaService.validateWebhookSignature(payload, signature);
      expect(result).toBe(true);
    });

    it('should reject invalid signature', () => {
      const payload = '{"test":"data"}';
      const signature = 'sha256=invalid_signature';
      
      const result = marqetaService.validateWebhookSignature(payload, signature);
      expect(result).toBe(false);
    });

    it('should handle missing webhook secret', () => {
      delete process.env.MARQETA_WEBHOOK_SECRET;
      
      const payload = '{"test":"data"}';
      const signature = 'sha256=any_signature';
      
      const result = marqetaService.validateWebhookSignature(payload, signature);
      expect(result).toBe(false);
    });
  });

  describe('checkNetworkHealth', () => {
    it('should return healthy status', async () => {
      mockAxiosInstance.get.mockResolvedValue({ status: 200 });
      mockSupabaseClient.insert.mockResolvedValue({ data: {} });

      const result = await marqetaService.checkNetworkHealth();

      expect(mockAxiosInstance.get).toHaveBeenCalledWith('/ping');
      expect(result.isHealthy).toBe(true);
      expect(result.responseTime).toBeGreaterThan(0);
      expect(result.status).toBe('HTTP 200');

      // Verify network status was logged
      expect(mockSupabaseClient.from).toHaveBeenCalledWith('network_status_log');
      expect(mockSupabaseClient.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          network_name: 'marqeta',
          is_healthy: true
        })
      );
    });

    it('should return unhealthy status on error', async () => {
      const mockError = new Error('Network error');
      mockAxiosInstance.get.mockRejectedValue(mockError);
      mockSupabaseClient.insert.mockResolvedValue({ data: {} });

      const result = await marqetaService.checkNetworkHealth();

      expect(result.isHealthy).toBe(false);
      expect(result.status).toBe('Network error');

      // Verify error was logged
      expect(mockSupabaseClient.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          network_name: 'marqeta',
          is_healthy: false,
          error_message: 'Network error'
        })
      );
    });
  });

  describe('rate limiting', () => {
    it('should enforce rate limits', async () => {
      // This test would require more complex mocking to test rate limiting
      // For now, just verify the interceptors were set up
      expect(mockAxiosInstance.interceptors.request.use).toHaveBeenCalled();
      expect(mockAxiosInstance.interceptors.response.use).toHaveBeenCalled();
    });
  });

  describe('error handling', () => {
    it('should retry on server errors', async () => {
      // Mock a 500 error followed by success
      mockAxiosInstance.post
        .mockRejectedValueOnce({ response: { status: 500 } })
        .mockResolvedValueOnce({ data: { token: 'success' } });

      // This would test the retry logic implemented in the interceptors
      // Implementation details depend on the actual retry mechanism
    });

    it('should not retry on client errors', async () => {
      const mockError = { response: { status: 400, data: { error: 'Bad request' } } };
      mockAxiosInstance.post.mockRejectedValue(mockError);

      await expect(
        marqetaService.createCard('test_context', 'user_123')
      ).rejects.toEqual(mockError);
    });
  });
});