import { FraudDetectionService } from '../../../../services/payments/fraud-detection.service';

// Mock Supabase
jest.mock('@supabase/supabase-js');

describe('FraudDetectionService', () => {
  let fraudDetectionService: FraudDetectionService;
  let mockSupabase: any;

  const baseRequest = {
    cardContext: 'card_123',
    amount: 10000, // $100.00
    merchantName: 'Test Store',
    merchantCategoryCode: '5411', // Grocery store
    merchantCountry: 'US',
    transactionTime: new Date('2024-01-15T14:30:00Z') // Monday 2:30 PM
  };

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Mock Supabase client
    mockSupabase = {
      from: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      gte: jest.fn().mockReturnThis(),
      in: jest.fn().mockReturnThis(),
      insert: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({ data: null, error: null }),
      rpc: jest.fn().mockResolvedValue({ data: null, error: null })
    };

    const mockCreateClient = require('@supabase/supabase-js').createClient as jest.Mock;
    mockCreateClient.mockReturnValue(mockSupabase);

    fraudDetectionService = new FraudDetectionService();
  });

  describe('analyzeTransaction', () => {
    const baseRequest = {
      cardContext: 'card_123',
      amount: 10000, // $100.00
      merchantName: 'Test Store',
      merchantCategoryCode: '5411', // Grocery store
      merchantCountry: 'US',
      transactionTime: new Date('2024-01-15T14:30:00Z') // Monday 2:30 PM
    };

    beforeEach(() => {
      // Mock empty transaction history by default
      mockSupabase.from.mockReturnValue({
        ...mockSupabase,
        data: []
      });
    });

    it('should approve low-risk transactions', async () => {
      const result = await fraudDetectionService.analyzeTransaction(baseRequest);

      expect(result).toMatchObject({
        riskScore: expect.any(Number),
        riskLevel: 'low',
        action: 'approve',
        riskFactors: {
          velocityScore: 0, // No previous transactions
          amountScore: 0, // No history to compare against
          locationScore: 0, // US is low risk
          timeScore: 0, // Business hours
          merchantScore: 0 // Grocery store is low risk
        }
      });

      expect(result.riskScore).toBeLessThan(31); // Should be low risk threshold
    });

    it('should detect high velocity fraud patterns', async () => {
      // Mock 15 transactions in the last hour (above the 10 transaction limit)
      const recentTransactions = Array(15).fill(null).map((_, i) => ({
        authorization_id: `auth_${i}`,
        processed_at: new Date(baseRequest.transactionTime.getTime() - (i * 2 * 60 * 1000)).toISOString() // 2 min intervals
      }));

      mockSupabase.from.mockImplementation((table: string) => {
        if (table === 'authorization_transactions') {
          return {
            ...mockSupabase,
            data: recentTransactions
          };
        }
        return mockSupabase;
      });

      const result = await fraudDetectionService.analyzeTransaction(baseRequest);

      expect(result.riskFactors.velocityScore).toBe(30); // Maximum velocity score
      expect(result.riskLevel).toBe('high');
      expect(result.action).toBe('decline');
    });

    it('should detect amount anomalies', async () => {
      // Mock historical transactions with average of $10.00
      const historicalTransactions = Array(10).fill(null).map((_, i) => ({
        authorization_amount: 1000 + (i * 100) // $10-19 range, avg ~$15
      }));

      mockSupabase.from.mockImplementation((table: string) => {
        if (table === 'authorization_transactions') {
          return {
            ...mockSupabase,
            data: historicalTransactions
          };
        }
        return mockSupabase;
      });

      // Test with $800 transaction (much higher than $15 average)
      const highAmountRequest = { ...baseRequest, amount: 80000 };
      const result = await fraudDetectionService.analyzeTransaction(highAmountRequest);

      expect(result.riskFactors.amountScore).toBeGreaterThan(20); // Should be high amount risk
      expect(result.riskLevel).toBe('high');
    });

    it('should apply geographic risk scoring', async () => {
      const testCases = [
        { country: 'US', expectedScore: 0 }, // Low risk
        { country: 'DE', expectedScore: 0 }, // Low risk
        { country: 'BR', expectedScore: 5 }, // Medium risk
        { country: 'CN', expectedScore: 8 }, // Medium-high risk
        { country: 'AF', expectedScore: 20 } // High risk
      ];

      for (const testCase of testCases) {
        const request = { ...baseRequest, merchantCountry: testCase.country };
        const result = await fraudDetectionService.analyzeTransaction(request);

        expect(result.riskFactors.locationScore).toBe(testCase.expectedScore);
      }
    });

    it('should apply time-based risk scoring', async () => {
      const testCases = [
        {
          description: 'Business hours weekday',
          time: new Date('2024-01-15T14:30:00Z'), // Monday 2:30 PM
          expectedScore: 0
        },
        {
          description: 'Late night transaction',
          time: new Date('2024-01-15T02:30:00Z'), // Monday 2:30 AM
          expectedScore: 13 // 8 (off hours) + 5 (very late night)
        },
        {
          description: 'Weekend business transaction',
          time: new Date('2024-01-14T14:30:00Z'), // Sunday 2:30 PM
          expectedScore: 2 // Weekend + business MCC
        }
      ];

      for (const testCase of testCases) {
        const request = { 
          ...baseRequest, 
          transactionTime: testCase.time,
          merchantCategoryCode: '5411' // Business MCC for weekend test
        };
        const result = await fraudDetectionService.analyzeTransaction(request);

        expect(result.riskFactors.timeScore).toBe(testCase.expectedScore);
      }
    });

    it('should apply merchant category risk scoring', async () => {
      const testCases = [
        { mcc: '5411', expectedScore: 0 }, // Grocery store - low risk
        { mcc: '7538', expectedScore: 3 }, // Auto service - medium risk
        { mcc: '5962', expectedScore: 9 }, // Adult entertainment - high risk
        { mcc: '7995', expectedScore: 10 } // Gambling - highest risk
      ];

      for (const testCase of testCases) {
        const request = { ...baseRequest, merchantCategoryCode: testCase.mcc };
        const result = await fraudDetectionService.analyzeTransaction(request);

        expect(result.riskFactors.merchantScore).toBe(testCase.expectedScore);
      }
    });

    it('should calculate weighted total risk score', async () => {
      // Create a scenario with moderate risk in all categories
      const riskFactors = {
        velocityScore: 15, // 50% of max
        amountScore: 12, // ~50% of max
        locationScore: 8, // Medium risk country
        timeScore: 8, // Off hours
        merchantScore: 6 // Medium risk merchant
      };

      // Expected weighted total: (15*0.30) + (12*0.25) + (8*0.20) + (8*0.15) + (6*0.10) = 12.5
      const expectedTotal = Math.round(
        riskFactors.velocityScore * 0.30 +
        riskFactors.amountScore * 0.25 +
        riskFactors.locationScore * 0.20 +
        riskFactors.timeScore * 0.15 +
        riskFactors.merchantScore * 0.10
      );

      // Mock the conditions to achieve these risk factors
      mockSupabase.from.mockImplementation((table: string) => {
        if (table === 'authorization_transactions') {
          // Mock 5 recent transactions for moderate velocity risk
          const recentTransactions = Array(5).fill(null).map((_, i) => ({
            authorization_id: `auth_${i}`
          }));

          // Mock historical transactions for amount comparison
          const historicalTransactions = Array(10).fill(null).map(() => ({
            authorization_amount: 2000 // $20 average
          }));

          return {
            ...mockSupabase,
            data: table === 'authorization_transactions' ? 
              (mockSupabase.gte.mock.calls.length > 0 ? recentTransactions : historicalTransactions) : []
          };
        }
        return mockSupabase;
      });

      const request = {
        ...baseRequest,
        amount: 6000, // $60 (3x average of $20)
        merchantCountry: 'MX', // Medium risk
        merchantCategoryCode: '7299', // Medium risk MCC
        transactionTime: new Date('2024-01-15T22:30:00Z') // Off hours
      };

      const result = await fraudDetectionService.analyzeTransaction(request);

      expect(result.riskScore).toBe(expectedTotal);
      expect(result.riskLevel).toBe(expectedTotal >= 31 ? 'medium' : 'low');
    });

    it('should enforce privacy isolation', async () => {
      await fraudDetectionService.analyzeTransaction(baseRequest);

      expect(mockSupabase.rpc).toHaveBeenCalledWith('set_config', {
        setting_name: 'app.current_card_context',
        new_value: 'card_123',
        is_local: true
      });
    });

    it('should handle analysis failures gracefully', async () => {
      // Mock database error
      mockSupabase.from.mockImplementation(() => {
        throw new Error('Database connection failed');
      });

      const result = await fraudDetectionService.analyzeTransaction(baseRequest);

      // Should fail safe with low risk
      expect(result).toMatchObject({
        riskScore: 0,
        riskLevel: 'low',
        action: 'approve',
        recommendation: 'Analysis failed - defaulting to approve with monitoring'
      });
    });

    it('should determine correct actions based on risk thresholds', async () => {
      const testCases = [
        { riskScore: 15, expectedAction: 'approve' },
        { riskScore: 20, expectedAction: 'step_up_auth' },
        { riskScore: 45, expectedAction: 'review' },
        { riskScore: 80, expectedAction: 'decline' }
      ];

      // We can't easily mock the internal calculation, so we'll test the threshold logic
      for (const testCase of testCases) {
        // Use environment variables to set thresholds for testing
        process.env.FRAUD_RISK_THRESHOLD_DECLINE = '75';
        process.env.FRAUD_RISK_THRESHOLD_REVIEW = '31';

        const service = new FraudDetectionService();
        const action = service['determineAction'](testCase.riskScore, 
          testCase.riskScore >= 75 ? 'high' : testCase.riskScore >= 31 ? 'medium' : 'low'
        );

        expect(action).toBe(testCase.expectedAction);
      }
    });
  });

  describe('getFraudMetrics', () => {
    it('should return fraud metrics for card context', async () => {
      const mockLogs = [
        { total_risk_score: 15, action_taken: 'approve' },
        { total_risk_score: 45, action_taken: 'review' },
        { total_risk_score: 80, action_taken: 'decline' },
        { total_risk_score: 25, action_taken: 'approve' }
      ];

      mockSupabase.from.mockReturnValue({
        ...mockSupabase,
        data: mockLogs
      });

      const metrics = await fraudDetectionService.getFraudMetrics('card_123', 24);

      expect(metrics).toEqual({
        totalTransactions: 4,
        averageRiskScore: 41.3, // (15+45+80+25)/4 = 41.25, rounded to 41.3
        highRiskTransactions: 2, // 45 and 80 are >= 31
        declinedTransactions: 1 // Only the 80-score one was declined
      });
    });

    it('should handle empty fraud logs', async () => {
      mockSupabase.from.mockReturnValue({
        ...mockSupabase,
        data: []
      });

      const metrics = await fraudDetectionService.getFraudMetrics('card_123');

      expect(metrics).toEqual({
        totalTransactions: 0,
        averageRiskScore: 0,
        highRiskTransactions: 0,
        declinedTransactions: 0
      });
    });
  });

  describe('Privacy and Security', () => {
    it('should ensure no cross-card correlation', async () => {
      const request1 = { ...baseRequest, cardContext: 'card_123' };
      const request2 = { ...baseRequest, cardContext: 'card_456' };

      // Mock different transaction histories for each card
      mockSupabase.from.mockImplementation((table: string) => {
        if (table === 'authorization_transactions') {
          // Each card should only see its own transactions
          const currentCardContext = mockSupabase.rpc.mock.calls.length > 0 ? 
            mockSupabase.rpc.mock.calls[mockSupabase.rpc.mock.calls.length - 1][1].new_value : null;
            
          if (currentCardContext === 'card_123') {
            return { ...mockSupabase, data: [{ authorization_id: 'auth_1' }] };
          } else if (currentCardContext === 'card_456') {
            return { ...mockSupabase, data: [{ authorization_id: 'auth_2' }] };
          }
        }
        return mockSupabase;
      });

      await fraudDetectionService.analyzeTransaction(request1);
      await fraudDetectionService.analyzeTransaction(request2);

      // Verify each call set the correct card context
      expect(mockSupabase.rpc).toHaveBeenCalledWith('set_config', {
        setting_name: 'app.current_card_context',
        new_value: 'card_123',
        is_local: true
      });

      expect(mockSupabase.rpc).toHaveBeenCalledWith('set_config', {
        setting_name: 'app.current_card_context',
        new_value: 'card_456',
        is_local: true
      });
    });

    it('should log fraud analysis with privacy isolation flag', async () => {
      await fraudDetectionService.analyzeTransaction(baseRequest);

      expect(mockSupabase.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          privacy_isolated: true,
          card_context: 'card_123'
        })
      );
    });
  });

  describe('Configuration and Thresholds', () => {
    it('should respect environment variable configuration', async () => {
      // Set custom thresholds
      process.env.FRAUD_VELOCITY_LIMIT_HOURLY = '5';
      process.env.FRAUD_AMOUNT_MULTIPLIER_LIMIT = '3.0';
      process.env.FRAUD_RISK_THRESHOLD_DECLINE = '60';

      const service = new FraudDetectionService();

      // Test that custom velocity limit is used
      mockSupabase.from.mockReturnValue({
        ...mockSupabase,
        data: Array(6).fill({ authorization_id: 'auth' }) // 6 transactions (over custom limit of 5)
      });

      const result = await service.analyzeTransaction(baseRequest);
      
      expect(result.riskFactors.velocityScore).toBe(30); // Should hit max due to lower threshold
    });
  });
});