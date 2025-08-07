import { DeclineReasonsService } from '../../../../services/payments/decline-reasons.service';

// Mock Supabase
jest.mock('@supabase/supabase-js');

describe('DeclineReasonsService', () => {
  let declineReasonsService: DeclineReasonsService;
  let mockSupabase: any;

  const mockDeclineReason = {
    reason_id: 'reason_123',
    decline_code: 'INSUFFICIENT_FUNDS',
    reason_category: 'insufficient_funds',
    user_friendly_message: 'Insufficient funds available',
    merchant_message: 'Declined - Insufficient Funds',
    resolution_suggestion: 'Add funds to your account and try again',
    is_retryable: true
  };

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Mock Supabase client
    mockSupabase = {
      from: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      gte: jest.fn().mockReturnThis(),
      not: jest.fn().mockReturnThis(),
      order: jest.fn().mockReturnThis(),
      insert: jest.fn().mockReturnThis(),
      update: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({ data: null, error: null }),
      rpc: jest.fn().mockResolvedValue({ data: null, error: null })
    };

    const mockCreateClient = require('@supabase/supabase-js').createClient as jest.Mock;
    mockCreateClient.mockReturnValue(mockSupabase);

    declineReasonsService = new DeclineReasonsService();
  });

  describe('getDeclineReason', () => {
    it('should return decline reason by code', async () => {
      mockSupabase.single.mockResolvedValue({
        data: mockDeclineReason
      });

      const result = await declineReasonsService.getDeclineReason('INSUFFICIENT_FUNDS');

      expect(mockSupabase.from).toHaveBeenCalledWith('decline_reason_codes');
      expect(mockSupabase.eq).toHaveBeenCalledWith('decline_code', 'INSUFFICIENT_FUNDS');
      
      expect(result).toEqual({
        reasonId: 'reason_123',
        declineCode: 'INSUFFICIENT_FUNDS',
        reasonCategory: 'insufficient_funds',
        userFriendlyMessage: 'Insufficient funds available',
        merchantMessage: 'Declined - Insufficient Funds',
        resolutionSuggestion: 'Add funds to your account and try again',
        isRetryable: true
      });
    });

    it('should return null for non-existent decline code', async () => {
      mockSupabase.single.mockResolvedValue({ data: null });

      const result = await declineReasonsService.getDeclineReason('NONEXISTENT_CODE');

      expect(result).toBeNull();
    });

    it('should handle database errors gracefully', async () => {
      mockSupabase.single.mockRejectedValue(new Error('Database error'));

      const result = await declineReasonsService.getDeclineReason('INSUFFICIENT_FUNDS');

      expect(result).toBeNull();
    });
  });

  describe('getDeclineReasonsByCategory', () => {
    const mockReasons = [
      { ...mockDeclineReason, decline_code: 'INSUFFICIENT_FUNDS' },
      { 
        ...mockDeclineReason, 
        reason_id: 'reason_456',
        decline_code: 'OVERDRAFT_LIMIT_EXCEEDED',
        user_friendly_message: 'Transaction exceeds overdraft limit'
      }
    ];

    it('should return all decline reasons when no category specified', async () => {
      mockSupabase.order.mockResolvedValue({ data: mockReasons });

      const result = await declineReasonsService.getDeclineReasonsByCategory();

      expect(mockSupabase.from).toHaveBeenCalledWith('decline_reason_codes');
      expect(mockSupabase.order).toHaveBeenCalledWith('decline_code');
      expect(result).toHaveLength(2);
      expect(result[0].declineCode).toBe('INSUFFICIENT_FUNDS');
    });

    it('should filter by category when specified', async () => {
      mockSupabase.eq.mockReturnThis();
      mockSupabase.order.mockResolvedValue({ 
        data: [mockReasons[0]] // Only insufficient_funds category
      });

      const result = await declineReasonsService.getDeclineReasonsByCategory('insufficient_funds');

      expect(mockSupabase.eq).toHaveBeenCalledWith('reason_category', 'insufficient_funds');
      expect(result).toHaveLength(1);
    });

    it('should handle empty results', async () => {
      mockSupabase.order.mockResolvedValue({ data: null });

      const result = await declineReasonsService.getDeclineReasonsByCategory();

      expect(result).toEqual([]);
    });
  });

  describe('getUserFriendlyMessage', () => {
    it('should return user-friendly message for valid code', async () => {
      mockSupabase.single.mockResolvedValue({
        data: mockDeclineReason
      });

      const message = await declineReasonsService.getUserFriendlyMessage('INSUFFICIENT_FUNDS');

      expect(message).toBe('Insufficient funds available');
    });

    it('should return default message for invalid code', async () => {
      mockSupabase.single.mockResolvedValue({ data: null });

      const message = await declineReasonsService.getUserFriendlyMessage('INVALID_CODE');

      expect(message).toBe('Transaction was declined. Please try again or contact support.');
    });
  });

  describe('getMerchantMessage', () => {
    it('should return merchant-specific message for valid code', async () => {
      mockSupabase.single.mockResolvedValue({
        data: mockDeclineReason
      });

      const message = await declineReasonsService.getMerchantMessage('INSUFFICIENT_FUNDS');

      expect(message).toBe('Declined - Insufficient Funds');
    });

    it('should return default merchant message for invalid code', async () => {
      mockSupabase.single.mockResolvedValue({ data: null });

      const message = await declineReasonsService.getMerchantMessage('INVALID_CODE');

      expect(message).toBe('Declined - Processing Error');
    });
  });

  describe('getResolutionSuggestion', () => {
    it('should return resolution suggestion when available', async () => {
      mockSupabase.single.mockResolvedValue({
        data: mockDeclineReason
      });

      const suggestion = await declineReasonsService.getResolutionSuggestion('INSUFFICIENT_FUNDS');

      expect(suggestion).toBe('Add funds to your account and try again');
    });

    it('should return null when no suggestion available', async () => {
      mockSupabase.single.mockResolvedValue({
        data: { ...mockDeclineReason, resolution_suggestion: null }
      });

      const suggestion = await declineReasonsService.getResolutionSuggestion('INSUFFICIENT_FUNDS');

      expect(suggestion).toBeNull();
    });
  });

  describe('isDeclineRetryable', () => {
    it('should return true for retryable decline codes', async () => {
      mockSupabase.single.mockResolvedValue({
        data: { ...mockDeclineReason, is_retryable: true }
      });

      const isRetryable = await declineReasonsService.isDeclineRetryable('INSUFFICIENT_FUNDS');

      expect(isRetryable).toBe(true);
    });

    it('should return false for non-retryable decline codes', async () => {
      mockSupabase.single.mockResolvedValue({
        data: { ...mockDeclineReason, is_retryable: false }
      });

      const isRetryable = await declineReasonsService.isDeclineRetryable('FRAUD_SUSPECTED');

      expect(isRetryable).toBe(false);
    });

    it('should return false for invalid codes', async () => {
      mockSupabase.single.mockResolvedValue({ data: null });

      const isRetryable = await declineReasonsService.isDeclineRetryable('INVALID_CODE');

      expect(isRetryable).toBe(false);
    });
  });

  describe('getDeclineAnalytics', () => {
    const mockDeclines = [
      { decline_code: 'INSUFFICIENT_FUNDS' },
      { decline_code: 'INSUFFICIENT_FUNDS' },
      { decline_code: 'FRAUD_SUSPECTED' },
      { decline_code: 'MERCHANT_BLOCKED' }
    ];

    beforeEach(() => {
      // Mock setting card context
      mockSupabase.rpc.mockResolvedValue({ data: null, error: null });
    });

    it('should return decline analytics for card context', async () => {
      mockSupabase.from.mockImplementation((table: string) => {
        if (table === 'authorization_transactions') {
          return {
            ...mockSupabase,
            data: mockDeclines
          };
        }
        return mockSupabase;
      });

      // Mock decline reason lookups
      jest.spyOn(declineReasonsService, 'getDeclineReason').mockImplementation(async (code) => {
        const reasons = {
          'INSUFFICIENT_FUNDS': {
            reasonId: '1',
            declineCode: 'INSUFFICIENT_FUNDS',
            reasonCategory: 'insufficient_funds' as const,
            userFriendlyMessage: 'Insufficient funds',
            merchantMessage: 'Declined',
            isRetryable: true
          },
          'FRAUD_SUSPECTED': {
            reasonId: '2',
            declineCode: 'FRAUD_SUSPECTED',
            reasonCategory: 'fraud' as const,
            userFriendlyMessage: 'Fraud suspected',
            merchantMessage: 'Declined',
            isRetryable: false
          },
          'MERCHANT_BLOCKED': {
            reasonId: '3',
            declineCode: 'MERCHANT_BLOCKED',
            reasonCategory: 'restrictions' as const,
            userFriendlyMessage: 'Merchant blocked',
            merchantMessage: 'Declined',
            isRetryable: true
          }
        };
        return reasons[code] || null;
      });

      const analytics = await declineReasonsService.getDeclineAnalytics('card_123', 24);

      expect(analytics).toHaveLength(3);
      expect(analytics[0]).toEqual({
        declineCode: 'INSUFFICIENT_FUNDS',
        count: 2,
        percentage: 50.0,
        category: 'insufficient_funds',
        isRetryable: true
      });
      expect(analytics[1]).toEqual({
        declineCode: 'FRAUD_SUSPECTED',
        count: 1,
        percentage: 25.0,
        category: 'fraud',
        isRetryable: false
      });
    });

    it('should return empty analytics when no declines', async () => {
      mockSupabase.from.mockReturnValue({
        ...mockSupabase,
        data: []
      });

      const analytics = await declineReasonsService.getDeclineAnalytics('card_123');

      expect(analytics).toEqual([]);
    });

    it('should set card context for privacy isolation', async () => {
      mockSupabase.from.mockReturnValue({
        ...mockSupabase,
        data: []
      });

      await declineReasonsService.getDeclineAnalytics('card_123');

      expect(mockSupabase.rpc).toHaveBeenCalledWith('set_config', {
        setting_name: 'app.current_card_context',
        new_value: 'card_123',
        is_local: true
      });
    });
  });

  describe('createDeclineReason', () => {
    const newReason = {
      declineCode: 'CUSTOM_DECLINE',
      reasonCategory: 'technical' as const,
      userFriendlyMessage: 'Custom decline reason',
      merchantMessage: 'Declined - Custom',
      resolutionSuggestion: 'Try again later',
      isRetryable: true
    };

    it('should create new decline reason', async () => {
      mockSupabase.insert.mockReturnThis();
      mockSupabase.single.mockResolvedValue({
        data: {
          reason_id: 'reason_new_123',
          decline_code: 'CUSTOM_DECLINE',
          reason_category: 'technical',
          user_friendly_message: 'Custom decline reason',
          merchant_message: 'Declined - Custom',
          resolution_suggestion: 'Try again later',
          is_retryable: true
        }
      });

      const result = await declineReasonsService.createDeclineReason(newReason);

      expect(mockSupabase.insert).toHaveBeenCalledWith({
        decline_code: 'CUSTOM_DECLINE',
        reason_category: 'technical',
        user_friendly_message: 'Custom decline reason',
        merchant_message: 'Declined - Custom',
        resolution_suggestion: 'Try again later',
        is_retryable: true
      });

      expect(result.declineCode).toBe('CUSTOM_DECLINE');
    });

    it('should handle creation errors', async () => {
      mockSupabase.single.mockResolvedValue({ data: null });

      await expect(declineReasonsService.createDeclineReason(newReason))
        .rejects.toThrow('Failed to create decline reason');
    });
  });

  describe('updateDeclineReason', () => {
    const updates = {
      userFriendlyMessage: 'Updated message',
      isRetryable: false
    };

    it('should update existing decline reason', async () => {
      mockSupabase.update.mockReturnThis();
      mockSupabase.single.mockResolvedValue({
        data: {
          ...mockDeclineReason,
          user_friendly_message: 'Updated message',
          is_retryable: false
        }
      });

      const result = await declineReasonsService.updateDeclineReason('INSUFFICIENT_FUNDS', updates);

      expect(mockSupabase.update).toHaveBeenCalledWith({
        user_friendly_message: 'Updated message',
        merchant_message: undefined,
        resolution_suggestion: undefined,
        is_retryable: false
      });

      expect(result?.userFriendlyMessage).toBe('Updated message');
      expect(result?.isRetryable).toBe(false);
    });

    it('should return null for non-existent decline code', async () => {
      mockSupabase.single.mockResolvedValue({ data: null });

      const result = await declineReasonsService.updateDeclineReason('NONEXISTENT', updates);

      expect(result).toBeNull();
    });
  });

  describe('getRetryableDeclineCodes', () => {
    it('should return list of retryable decline codes', async () => {
      const mockRetryableReasons = [
        { decline_code: 'INSUFFICIENT_FUNDS' },
        { decline_code: 'RATE_LIMIT_EXCEEDED' },
        { decline_code: 'PROCESSING_ERROR' }
      ];

      mockSupabase.from.mockReturnValue({
        ...mockSupabase,
        data: mockRetryableReasons
      });

      const codes = await declineReasonsService.getRetryableDeclineCodes();

      expect(mockSupabase.eq).toHaveBeenCalledWith('is_retryable', true);
      expect(codes).toEqual(['INSUFFICIENT_FUNDS', 'RATE_LIMIT_EXCEEDED', 'PROCESSING_ERROR']);
    });

    it('should handle empty results', async () => {
      mockSupabase.from.mockReturnValue({
        ...mockSupabase,
        data: null
      });

      const codes = await declineReasonsService.getRetryableDeclineCodes();

      expect(codes).toEqual([]);
    });
  });

  describe('getGlobalDeclineStatistics', () => {
    const mockGlobalDeclines = [
      { decline_code: 'INSUFFICIENT_FUNDS' },
      { decline_code: 'INSUFFICIENT_FUNDS' },
      { decline_code: 'FRAUD_SUSPECTED' },
      { decline_code: 'MERCHANT_BLOCKED' },
      { decline_code: 'PROCESSING_ERROR' }
    ];

    it('should return global decline statistics', async () => {
      mockSupabase.from.mockReturnValue({
        ...mockSupabase,
        data: mockGlobalDeclines
      });

      // Mock decline reason lookups
      jest.spyOn(declineReasonsService, 'getDeclineReason').mockImplementation(async (code) => {
        const categories = {
          'INSUFFICIENT_FUNDS': { reasonCategory: 'insufficient_funds' as const, isRetryable: true },
          'FRAUD_SUSPECTED': { reasonCategory: 'fraud' as const, isRetryable: false },
          'MERCHANT_BLOCKED': { reasonCategory: 'restrictions' as const, isRetryable: true },
          'PROCESSING_ERROR': { reasonCategory: 'technical' as const, isRetryable: true }
        };
        return categories[code] || null;
      });

      const stats = await declineReasonsService.getGlobalDeclineStatistics(24);

      expect(stats).toEqual({
        totalDeclines: 5,
        declinesByCategory: {
          insufficient_funds: 2,
          fraud: 1,
          restrictions: 1,
          technical: 1
        },
        declinesByCode: {
          'INSUFFICIENT_FUNDS': 2,
          'FRAUD_SUSPECTED': 1,
          'MERCHANT_BLOCKED': 1,
          'PROCESSING_ERROR': 1
        },
        retryablePercentage: 80.0 // 4 out of 5 are retryable
      });
    });

    it('should handle no declines', async () => {
      mockSupabase.from.mockReturnValue({
        ...mockSupabase,
        data: []
      });

      const stats = await declineReasonsService.getGlobalDeclineStatistics();

      expect(stats).toEqual({
        totalDeclines: 0,
        declinesByCategory: {},
        declinesByCode: {},
        retryablePercentage: 0
      });
    });
  });
});