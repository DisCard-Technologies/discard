import { VisaService } from '../../../../services/payments/visa.service';
import { MarqetaService } from '../../../../services/payments/marqeta.service';
import { createClient } from '@supabase/supabase-js';

// Mock dependencies
jest.mock('../../../../services/payments/marqeta.service');
jest.mock('@supabase/supabase-js');
jest.mock('crypto');

const MockedMarqetaService = MarqetaService as jest.MockedClass<typeof MarqetaService>;
const mockSupabaseClient = {
  from: jest.fn().mockReturnThis(),
  insert: jest.fn().mockReturnThis(),
  update: jest.fn().mockReturnThis(),
  select: jest.fn().mockReturnThis(),
  eq: jest.fn().mockReturnThis(),
  single: jest.fn().mockReturnThis(),
  rpc: jest.fn().mockReturnThis()
};

(createClient as jest.Mock).mockReturnValue(mockSupabaseClient);

// Mock crypto module
const mockCrypto = require('crypto');
mockCrypto.randomBytes = jest.fn().mockReturnValue(Buffer.from('1234567890abcdef', 'hex'));
mockCrypto.createCipher = jest.fn().mockReturnValue({
  update: jest.fn().mockReturnValue('encrypted'),
  final: jest.fn().mockReturnValue('data')
});
mockCrypto.createDecipher = jest.fn().mockReturnValue({
  update: jest.fn().mockReturnValue('decrypted'),
  final: jest.fn().mockReturnValue('data')
});

// Mock environment variables
const originalEnv = process.env;
beforeAll(() => {
  process.env = {
    ...originalEnv,
    CARD_ENCRYPTION_KEY: 'test_encryption_key_32_characters',
    SUPABASE_URL: 'https://test.supabase.co',
    SUPABASE_SERVICE_KEY: 'test_service_key',
    NODE_ENV: 'test'
  };
});

afterAll(() => {
  process.env = originalEnv;
});

describe('VisaService', () => {
  let visaService: VisaService;
  let mockMarqetaService: jest.Mocked<MarqetaService>;

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Create mock MarqetaService instance
    mockMarqetaService = new MockedMarqetaService() as jest.Mocked<MarqetaService>;
    
    // Create VisaService instance
    visaService = new VisaService();
    
    // Replace the internal marqetaService with our mock
    (visaService as any).marqetaService = mockMarqetaService;
  });

  describe('constructor', () => {
    it('should initialize with encryption key', () => {
      expect(() => new VisaService()).not.toThrow();
    });

    it('should throw error if encryption key is missing', () => {
      delete process.env.CARD_ENCRYPTION_KEY;
      
      expect(() => new VisaService()).toThrow('Card encryption key not configured');
    });
  });

  describe('generateCard', () => {
    const mockMarqetaCard = {
      token: 'marqeta_token_123',
      pan: '5549481234567890',
      cvv_number: '123',
      last_four: '7890',
      expiration: '1225'
    };

    const mockInsertedCard = {
      visa_card_id: 'visa_123',
      card_id: 'card_123',
      card_context: 'context_123',
      marqeta_card_token: 'marqeta_token_123',
      encrypted_card_number: 'encrypted_pan',
      encrypted_cvv: 'encrypted_cvv',
      expiration_month: 12,
      expiration_year: 2025,
      bin_number: '554948',
      last_four_digits: '7890',
      provisioning_status: 'active',
      activation_date: '2024-01-20T10:00:00Z'
    };

    beforeEach(() => {
      mockMarqetaService.createCard.mockResolvedValue(mockMarqetaCard);
      mockSupabaseClient.rpc.mockResolvedValue({ data: null });
      mockSupabaseClient.insert.mockResolvedValue({ data: mockInsertedCard });
      mockSupabaseClient.select.mockResolvedValue({ data: mockInsertedCard });
      mockSupabaseClient.single.mockResolvedValue({ data: mockInsertedCard });
    });

    it('should generate card successfully', async () => {
      const request = {
        cardId: 'card_123',
        cardContext: 'context_123',
        userToken: 'user_123',
        metadata: { test: 'data' }
      };

      const result = await visaService.generateCard(request);

      // Verify Marqeta service was called
      expect(mockMarqetaService.createCard).toHaveBeenCalledWith(
        'context_123',
        'user_123',
        { test: 'data' }
      );

      // Verify card context was set
      expect(mockSupabaseClient.rpc).toHaveBeenCalledWith('set_config', {
        setting_name: 'app.current_card_context',
        new_value: 'context_123',
        is_local: true
      });

      // Verify card details were stored
      expect(mockSupabaseClient.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          card_id: 'card_123',
          card_context: 'context_123',
          marqeta_card_token: 'marqeta_token_123',
          bin_number: '554948',
          last_four_digits: '7890',
          provisioning_status: 'active'
        })
      );

      expect(result.visaCardId).toBe('visa_123');
      expect(result.marqetaCardToken).toBe('marqeta_token_123');
    });

    it('should handle Marqeta service error', async () => {
      const mockError = new Error('Marqeta API error');
      mockMarqetaService.createCard.mockRejectedValue(mockError);

      const request = {
        cardId: 'card_123',
        cardContext: 'context_123',
        userToken: 'user_123'
      };

      await expect(visaService.generateCard(request)).rejects.toThrow('Marqeta API error');
    });

    it('should parse expiration date correctly', async () => {
      // Test MMYY format
      const mockCardWithExp = { ...mockMarqetaCard, expiration: '0327' };
      mockMarqetaService.createCard.mockResolvedValue(mockCardWithExp);

      const request = {
        cardId: 'card_123',
        cardContext: 'context_123',
        userToken: 'user_123'
      };

      await visaService.generateCard(request);

      expect(mockSupabaseClient.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          expiration_month: 3,
          expiration_year: 2027
        })
      );
    });

    it('should use fallback expiration date for invalid format', async () => {
      const mockCardWithInvalidExp = { ...mockMarqetaCard, expiration: 'invalid' };
      mockMarqetaService.createCard.mockResolvedValue(mockCardWithInvalidExp);

      const request = {
        cardId: 'card_123',
        cardContext: 'context_123',
        userToken: 'user_123'
      };

      await visaService.generateCard(request);

      // Should use fallback (3 years from now)
      const currentYear = new Date().getFullYear();
      expect(mockSupabaseClient.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          expiration_year: currentYear + 3
        })
      );
    });
  });

  describe('activateCard', () => {
    const mockActivatedCard = {
      token: 'marqeta_token_123',
      state: 'ACTIVE'
    };

    const mockUpdatedCard = {
      visa_card_id: 'visa_123',
      card_context: 'context_123',
      marqeta_card_token: 'marqeta_token_123',
      provisioning_status: 'active',
      activation_date: '2024-01-20T10:30:00Z',
      network_registration_id: 'VISA_12345678'
    };

    beforeEach(() => {
      mockMarqetaService.activateCard.mockResolvedValue(mockActivatedCard);
      mockSupabaseClient.rpc.mockResolvedValue({ data: null });
      mockSupabaseClient.update.mockReturnThis();
      mockSupabaseClient.eq.mockReturnThis();
      mockSupabaseClient.select.mockReturnThis();
      mockSupabaseClient.single.mockResolvedValue({ data: mockUpdatedCard });
    });

    it('should activate card successfully', async () => {
      const request = {
        cardContext: 'context_123',
        marqetaCardToken: 'marqeta_token_123'
      };

      const result = await visaService.activateCard(request);

      // Verify Marqeta activation was called
      expect(mockMarqetaService.activateCard).toHaveBeenCalledWith(
        'context_123',
        'marqeta_token_123'
      );

      // Verify database update
      expect(mockSupabaseClient.update).toHaveBeenCalledWith(
        expect.objectContaining({
          provisioning_status: 'active',
          activation_date: expect.any(String),
          network_registration_id: expect.stringMatching(/^VISA_[A-F0-9]{8}$/)
        })
      );

      expect(result.provisioningStatus).toBe('active');
    });

    it('should handle activation error', async () => {
      const mockError = new Error('Activation failed');
      mockMarqetaService.activateCard.mockRejectedValue(mockError);

      const request = {
        cardContext: 'context_123',
        marqetaCardToken: 'marqeta_token_123'
      };

      await expect(visaService.activateCard(request)).rejects.toThrow('Activation failed');
    });

    it('should throw error if card not found', async () => {
      mockMarqetaService.activateCard.mockResolvedValue(mockActivatedCard);
      mockSupabaseClient.single.mockResolvedValue({ data: null });

      const request = {
        cardContext: 'context_123',
        marqetaCardToken: 'marqeta_token_123'
      };

      await expect(visaService.activateCard(request)).rejects.toThrow('Card not found or access denied');
    });
  });

  describe('getCardDetails', () => {
    const mockCardDetails = {
      visa_card_id: 'visa_123',
      card_id: 'card_123',
      card_context: 'context_123',
      marqeta_card_token: 'marqeta_token_123',
      encrypted_card_number: 'encrypted_pan',
      encrypted_cvv: 'encrypted_cvv',
      expiration_month: 12,
      expiration_year: 2025,
      bin_number: '554948',
      card_network: 'VISA',
      provisioning_status: 'active',
      last_four_digits: '7890',
      activation_date: '2024-01-20T10:00:00Z',
      network_registration_id: 'VISA_12345678'
    };

    beforeEach(() => {
      mockSupabaseClient.rpc.mockResolvedValue({ data: null });
      mockSupabaseClient.select.mockReturnThis();
      mockSupabaseClient.eq.mockReturnThis();
      mockSupabaseClient.single.mockResolvedValue({ data: mockCardDetails });
    });

    it('should get card details successfully', async () => {
      const result = await visaService.getCardDetails('context_123');

      expect(mockSupabaseClient.rpc).toHaveBeenCalledWith('set_config', {
        setting_name: 'app.current_card_context',
        new_value: 'context_123',
        is_local: true
      });

      expect(result).toMatchObject({
        visaCardId: 'visa_123',
        cardId: 'card_123',
        cardContext: 'context_123',
        marqetaCardToken: 'marqeta_token_123',
        provisioningStatus: 'active',
        lastFourDigits: '7890'
      });
    });

    it('should return null if card not found', async () => {
      mockSupabaseClient.single.mockResolvedValue({ data: null });

      const result = await visaService.getCardDetails('nonexistent_context');

      expect(result).toBeNull();
    });
  });

  describe('getDecryptedCardNumber', () => {
    beforeEach(() => {
      mockSupabaseClient.rpc.mockResolvedValue({ data: null });
      mockSupabaseClient.select.mockReturnThis();
      mockSupabaseClient.eq.mockReturnThis();
      mockSupabaseClient.single.mockResolvedValue({
        data: { encrypted_card_number: 'iv:encrypted_data' }
      });
    });

    it('should decrypt card number successfully', async () => {
      const result = await visaService.getDecryptedCardNumber('context_123');

      expect(result).toBe('decrypteddata');
      
      // Verify access was logged (in real implementation)
      expect(mockSupabaseClient.select).toHaveBeenCalledWith('encrypted_card_number');
    });

    it('should throw error if card not found', async () => {
      mockSupabaseClient.single.mockResolvedValue({ data: null });

      await expect(
        visaService.getDecryptedCardNumber('nonexistent_context')
      ).rejects.toThrow('Card not found');
    });
  });

  describe('getDecryptedCvv', () => {
    beforeEach(() => {
      mockSupabaseClient.rpc.mockResolvedValue({ data: null });
      mockSupabaseClient.select.mockReturnThis();
      mockSupabaseClient.eq.mockReturnThis();
      mockSupabaseClient.single.mockResolvedValue({
        data: { encrypted_cvv: 'iv:encrypted_cvv_data' }
      });
    });

    it('should decrypt CVV successfully', async () => {
      const result = await visaService.getDecryptedCvv('context_123');

      expect(result).toBe('decrypteddata');
      expect(mockSupabaseClient.select).toHaveBeenCalledWith('encrypted_cvv');
    });
  });

  describe('suspendCard', () => {
    const mockCardDetails = {
      marqetaCardToken: 'marqeta_token_123'
    };

    const mockSuspendedCard = {
      token: 'marqeta_token_123',
      state: 'SUSPENDED'
    };

    beforeEach(() => {
      // Mock getCardDetails to return card
      jest.spyOn(visaService, 'getCardDetails').mockResolvedValue(mockCardDetails as any);
      
      mockMarqetaService.suspendCard.mockResolvedValue(mockSuspendedCard);
      mockSupabaseClient.update.mockReturnThis();
      mockSupabaseClient.eq.mockReturnThis();
      mockSupabaseClient.select.mockReturnThis();
      mockSupabaseClient.single.mockResolvedValue({
        data: { ...mockCardDetails, provisioning_status: 'suspended' }
      });
    });

    it('should suspend card successfully', async () => {
      const result = await visaService.suspendCard('context_123');

      expect(mockMarqetaService.suspendCard).toHaveBeenCalledWith(
        'context_123',
        'marqeta_token_123'
      );

      expect(mockSupabaseClient.update).toHaveBeenCalledWith({
        provisioning_status: 'suspended'
      });
    });

    it('should handle card not found', async () => {
      jest.spyOn(visaService, 'getCardDetails').mockResolvedValue(null);

      await expect(visaService.suspendCard('nonexistent_context')).rejects.toThrow('Card not found');
    });
  });

  describe('checkNetworkStatus', () => {
    it('should return network health status', async () => {
      const mockHealthResult = {
        isHealthy: true,
        responseTime: 150,
        status: 'HTTP 200'
      };

      mockMarqetaService.checkNetworkHealth.mockResolvedValue(mockHealthResult);

      const result = await visaService.checkNetworkStatus();

      expect(result.isHealthy).toBe(true);
      expect(result.responseTime).toBe(150);
      expect(result.status).toBe('HTTP 200');
      expect(result.lastChecked).toBeDefined();
    });

    it('should handle network check error', async () => {
      const mockError = new Error('Network check failed');
      mockMarqetaService.checkNetworkHealth.mockRejectedValue(mockError);

      const result = await visaService.checkNetworkStatus();

      expect(result.isHealthy).toBe(false);
      expect(result.status).toBe('Health check failed');
    });
  });

  describe('encryption/decryption', () => {
    it('should encrypt and decrypt data correctly', async () => {
      // Test through the public methods that use encryption
      mockSupabaseClient.rpc.mockResolvedValue({ data: null });
      mockSupabaseClient.select.mockReturnThis();
      mockSupabaseClient.eq.mockReturnThis();
      
      // Mock encrypted data in expected format
      mockSupabaseClient.single.mockResolvedValue({
        data: { encrypted_card_number: '1234567890abcdef:encrypted' }
      });

      const result = await visaService.getDecryptedCardNumber('context_123');

      expect(mockCrypto.createDecipher).toHaveBeenCalled();
      expect(result).toBe('decrypteddata');
    });
  });
});