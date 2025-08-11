import { CardFreezeService, FreezeRequest, UnfreezeRequest } from '../card-freeze.service';
import { TransactionIsolationService } from '../../privacy/transaction-isolation.service';
import axios from 'axios';

// Mock dependencies
jest.mock('axios');
jest.mock('../../privacy/transaction-isolation.service');
jest.mock('../../../utils/supabase', () => ({
  supabase: {
    from: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    insert: jest.fn().mockReturnThis(),
    update: jest.fn().mockReturnThis(),
    delete: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    is: jest.fn().mockReturnThis(),
    lte: jest.fn().mockReturnThis(),
    order: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    single: jest.fn().mockResolvedValue({ data: null, error: null })
  }
}));

jest.mock('../../../utils/logger', () => ({
  logger: {
    error: jest.fn(),
    warn: jest.fn(),
    info: jest.fn()
  }
}));

describe('CardFreezeService', () => {
  let service: CardFreezeService;
  let mockIsolationService: jest.Mocked<TransactionIsolationService>;
  let mockAxios: jest.Mocked<typeof axios>;

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Set up environment variables
    process.env.MARQETA_BASE_URL = 'https://sandbox-api.marqeta.com';
    process.env.MARQETA_APPLICATION_TOKEN = 'test-app-token';
    process.env.MARQETA_ACCESS_TOKEN = 'test-access-token';
    
    service = new CardFreezeService();
    mockIsolationService = (TransactionIsolationService as jest.MockedClass<typeof TransactionIsolationService>).mock.instances[0] as any;
    mockAxios = axios as jest.Mocked<typeof axios>;
    
    // Set up default mock implementations
    mockIsolationService.enforceTransactionIsolation.mockResolvedValue(undefined);
    mockIsolationService.getCardContext.mockResolvedValue({
      contextId: 'test-context',
      cardContextHash: 'test-hash',
      sessionBoundary: 'test-boundary',
      correlationResistance: {
        ipObfuscation: true,
        timingRandomization: true,
        behaviorMasking: true
      }
    });
  });

  describe('freezeCard', () => {
    const freezeRequest: FreezeRequest = {
      cardId: 'card-123',
      reason: 'fraud_detected',
      relatedEventId: 'event-456',
      metadata: { riskScore: 85 }
    };

    it('should successfully freeze a card', async () => {
      const { supabase } = require('../../../utils/supabase');
      
      // Mock card is not frozen
      supabase.from().select().eq().is().order().limit.mockResolvedValueOnce({
        data: [],
        error: null
      });
      
      // Mock get card token
      supabase.from().select().eq().eq().single.mockResolvedValueOnce({
        data: { marqeta_card_token: 'marqeta-token-123' },
        error: null
      });
      
      // Mock create freeze record
      supabase.from().insert().select().single.mockResolvedValueOnce({
        data: { freeze_id: 'freeze-789' },
        error: null
      });
      
      // Mock Marqeta API call
      mockAxios.post.mockResolvedValueOnce({
        data: {
          token: 'transition-token-123',
          card_token: 'marqeta-token-123',
          state: 'SUSPENDED'
        }
      });
      
      const result = await service.freezeCard(freezeRequest);
      
      expect(result.success).toBe(true);
      expect(result.freezeId).toBe('freeze-789');
      expect(result.marqetaTransitionToken).toBe('transition-token-123');
      
      expect(mockAxios.post).toHaveBeenCalledWith(
        'https://sandbox-api.marqeta.com/cards/marqeta-token-123/transitions',
        {
          state: 'SUSPENDED',
          reason: 'FRAUD_DETECTED',
          channel: 'API'
        },
        expect.objectContaining({
          headers: expect.objectContaining({
            'Authorization': expect.stringContaining('Basic'),
            'Content-Type': 'application/json'
          })
        })
      );
    });

    it('should not freeze an already frozen card', async () => {
      const { supabase } = require('../../../utils/supabase');
      
      // Mock card is already frozen
      supabase.from().select().eq().is().order().limit.mockResolvedValueOnce({
        data: [{
          freeze_id: 'existing-freeze',
          freeze_reason: 'user_requested',
          frozen_at: new Date().toISOString()
        }],
        error: null
      });
      
      const result = await service.freezeCard(freezeRequest);
      
      expect(result.success).toBe(false);
      expect(result.error).toBe('Card is already frozen');
      expect(mockAxios.post).not.toHaveBeenCalled();
    });

    it('should handle card not found error', async () => {
      const { supabase } = require('../../../utils/supabase');
      
      // Mock card is not frozen
      supabase.from().select().eq().is().order().limit.mockResolvedValueOnce({
        data: [],
        error: null
      });
      
      // Mock card token not found
      supabase.from().select().eq().eq().single.mockResolvedValueOnce({
        data: null,
        error: null
      });
      
      const result = await service.freezeCard(freezeRequest);
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('Card not found');
    });

    it('should rollback freeze record if Marqeta call fails', async () => {
      const { supabase } = require('../../../utils/supabase');
      
      // Set up successful mocks until Marqeta call
      supabase.from().select().eq().is().order().limit.mockResolvedValueOnce({
        data: [],
        error: null
      });
      
      supabase.from().select().eq().eq().single.mockResolvedValueOnce({
        data: { marqeta_card_token: 'marqeta-token-123' },
        error: null
      });
      
      supabase.from().insert().select().single.mockResolvedValueOnce({
        data: { freeze_id: 'freeze-789' },
        error: null
      });
      
      // Mock Marqeta API failure
      mockAxios.post.mockRejectedValueOnce(new Error('Marqeta API error'));
      
      // Mock rollback
      supabase.from().delete().eq().is().order().limit.mockResolvedValueOnce({
        data: null,
        error: null
      });
      
      const result = await service.freezeCard(freezeRequest);
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('Marqeta');
      
      // Verify rollback was called
      expect(supabase.from().delete).toHaveBeenCalled();
    });

    it('should enforce transaction isolation', async () => {
      await service.freezeCard(freezeRequest);
      
      expect(mockIsolationService.enforceTransactionIsolation).toHaveBeenCalledWith('card-123');
      expect(mockIsolationService.getCardContext).toHaveBeenCalledWith('card-123');
    });
  });

  describe('unfreezeCard', () => {
    const unfreezeRequest: UnfreezeRequest = {
      cardId: 'card-123',
      unfreezeBy: 'user',
      reason: 'User requested unfreeze'
    };

    it('should successfully unfreeze a card', async () => {
      const { supabase } = require('../../../utils/supabase');
      
      // Mock card is frozen
      supabase.from().select().eq().is().order().limit.mockResolvedValueOnce({
        data: [{
          freeze_id: 'freeze-789',
          freeze_reason: 'user_requested',
          frozen_at: new Date().toISOString()
        }],
        error: null
      });
      
      // Mock get card token
      supabase.from().select().eq().eq().single.mockResolvedValueOnce({
        data: { marqeta_card_token: 'marqeta-token-123' },
        error: null
      });
      
      // Mock Marqeta API call
      mockAxios.post.mockResolvedValueOnce({
        data: {
          token: 'transition-token-456',
          card_token: 'marqeta-token-123',
          state: 'ACTIVE'
        }
      });
      
      // Mock update freeze record
      supabase.from().update().eq.mockResolvedValueOnce({
        data: null,
        error: null
      });
      
      const result = await service.unfreezeCard(unfreezeRequest);
      
      expect(result.success).toBe(true);
      expect(result.freezeId).toBe('freeze-789');
      expect(result.marqetaTransitionToken).toBe('transition-token-456');
    });

    it('should not unfreeze a card that is not frozen', async () => {
      const { supabase } = require('../../../utils/supabase');
      
      // Mock card is not frozen
      supabase.from().select().eq().is().order().limit.mockResolvedValueOnce({
        data: [],
        error: null
      });
      
      const result = await service.unfreezeCard(unfreezeRequest);
      
      expect(result.success).toBe(false);
      expect(result.error).toBe('Card is not frozen');
    });

    it('should prevent user unfreeze for compliance freezes', async () => {
      const { supabase } = require('../../../utils/supabase');
      
      // Mock card is frozen for compliance
      supabase.from().select().eq().is().order().limit.mockResolvedValueOnce({
        data: [{
          freeze_id: 'freeze-789',
          freeze_reason: 'compliance_required',
          frozen_at: new Date().toISOString()
        }],
        error: null
      });
      
      const result = await service.unfreezeCard(unfreezeRequest);
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('cannot be unfrozen by user');
    });
  });

  describe('getCardFreezeStatus', () => {
    it('should return frozen status for frozen card', async () => {
      const { supabase } = require('../../../utils/supabase');
      
      const frozenAt = new Date();
      supabase.from().select().eq().is().order().limit.mockResolvedValueOnce({
        data: [{
          freeze_id: 'freeze-789',
          freeze_reason: 'fraud_detected',
          frozen_at: frozenAt.toISOString(),
          freeze_type: 'permanent'
        }],
        error: null
      });
      
      const status = await service.getCardFreezeStatus('card-123');
      
      expect(status.isFrozen).toBe(true);
      expect(status.freezeId).toBe('freeze-789');
      expect(status.reason).toBe('fraud_detected');
      expect(status.frozenAt).toEqual(frozenAt);
    });

    it('should return not frozen status for unfrozen card', async () => {
      const { supabase } = require('../../../utils/supabase');
      
      supabase.from().select().eq().is().order().limit.mockResolvedValueOnce({
        data: [],
        error: null
      });
      
      const status = await service.getCardFreezeStatus('card-123');
      
      expect(status.isFrozen).toBe(false);
      expect(status.canUnfreeze).toBe(true);
    });

    it('should calculate canUnfreeze based on freeze type and time', async () => {
      const { supabase } = require('../../../utils/supabase');
      
      // Mock fraud freeze from 25 hours ago (past auto-unfreeze threshold)
      const frozenAt = new Date(Date.now() - 25 * 60 * 60 * 1000);
      supabase.from().select().eq().is().order().limit.mockResolvedValueOnce({
        data: [{
          freeze_id: 'freeze-789',
          freeze_reason: 'fraud_detected',
          frozen_at: frozenAt.toISOString(),
          freeze_type: 'temporary'
        }],
        error: null
      });
      
      const status = await service.getCardFreezeStatus('card-123');
      
      expect(status.isFrozen).toBe(true);
      expect(status.canUnfreeze).toBe(true); // Can unfreeze after timeout
    });
  });

  describe('applyRuleBasedFreezing', () => {
    it('should freeze card for high risk score', async () => {
      const { supabase } = require('../../../utils/supabase');
      
      // Set up mocks for successful freeze
      supabase.from().select().eq().is().order().limit.mockResolvedValueOnce({
        data: [],
        error: null
      });
      
      supabase.from().select().eq().eq().single.mockResolvedValueOnce({
        data: { marqeta_card_token: 'marqeta-token-123' },
        error: null
      });
      
      supabase.from().insert().select().single.mockResolvedValueOnce({
        data: { freeze_id: 'freeze-auto' },
        error: null
      });
      
      mockAxios.post.mockResolvedValueOnce({
        data: { token: 'transition-auto', state: 'SUSPENDED' }
      });
      
      const result = await service.applyRuleBasedFreezing('card-123', 85, 'event-456');
      
      expect(result).not.toBeNull();
      expect(result?.success).toBe(true);
      expect(result?.freezeId).toBe('freeze-auto');
    });

    it('should not freeze card for medium risk score', async () => {
      const result = await service.applyRuleBasedFreezing('card-123', 60, 'event-456');
      
      expect(result).toBeNull();
    });
  });

  describe('processAutomaticUnfreezing', () => {
    it('should unfreeze eligible temporary freezes', async () => {
      const { supabase } = require('../../../utils/supabase');
      
      // Mock eligible freezes
      const oldFreezeTime = new Date(Date.now() - 25 * 60 * 60 * 1000);
      supabase.from().select().eq().is().lte().limit.mockResolvedValueOnce({
        data: [{
          freeze_id: 'freeze-old',
          card_context_hash: 'test-hash',
          freeze_type: 'temporary'
        }],
        error: null
      });
      
      await service.processAutomaticUnfreezing();
      
      // Verify query was made for eligible freezes
      expect(supabase.from).toHaveBeenCalledWith('card_freeze_history');
    });

    it('should handle errors gracefully', async () => {
      const { supabase } = require('../../../utils/supabase');
      const { logger } = require('../../../utils/logger');
      
      supabase.from().select().eq().is().lte().limit.mockResolvedValueOnce({
        data: null,
        error: new Error('Database error')
      });
      
      await service.processAutomaticUnfreezing();
      
      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining('Failed to query eligible freezes'),
        expect.any(Error)
      );
    });
  });
});