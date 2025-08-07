import { describe, test, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { fundingService } from '../../../services/funding/funding.service';
import { balanceService } from '../../../services/funding/balance.service';
import { stripeService } from '../../../services/funding/stripe.service';
import { supabase } from '../../../app';
import { 
  AccountFundingRequest, 
  CardAllocationRequest, 
  CardTransferRequest,
  FundingTransaction 
} from '@discard/shared/src/types/funding';
import { FUNDING_STATUSES, FUNDING_TYPES } from '@discard/shared/src/constants/funding';
import { createMockSupabaseClient } from '../../utils/supabase-mock';

// Mock dependencies
const mockSupabase = createMockSupabaseClient();
jest.mock('../../../app', () => ({
  supabase: mockSupabase
}));

jest.mock('../../../services/funding/balance.service', () => ({
  balanceService: {
    getAccountBalance: jest.fn(),
    getCardBalance: jest.fn()
  }
}));

jest.mock('../../../services/funding/stripe.service', () => ({
  stripeService: {
    createPaymentIntent: jest.fn(),
    createCustomer: jest.fn()
  }
}));

const mockSupabaseClient = supabase as jest.Mocked<typeof supabase>;
const mockBalanceService = balanceService as jest.Mocked<typeof balanceService>;
const mockStripeService = stripeService as jest.Mocked<typeof stripeService>;

describe('FundingService', () => {
  const mockUserId = 'test-user-id';
  const mockCardId = 'test-card-id';
  const mockTransactionId = 'funding_1234567890_abcde';

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Reset all mock methods
    Object.values(mockQuery).forEach(mock => {
      if (typeof mock === 'function' && mock.mockReset) {
        mock.mockReset();
        mock.mockReturnThis && mock.mockReturnThis();
      }
    });
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  describe('fundAccount', () => {
    const mockAccountFundingRequest: AccountFundingRequest = {
      amount: 10000, // $100.00
      paymentMethodId: 'pm_1234567890abcdef',
      currency: 'USD'
    };

    test('should fund account successfully with instant payment', async () => {
      // Arrange
      const mockPaymentIntent = {
        id: 'pi_1234567890abcdef',
        status: 'succeeded',
        clientSecret: 'pi_1234567890abcdef_secret_123',
        estimatedProcessingTime: 0
      };

      const mockStripeCustomer = {
        stripe_customer_id: 'cus_1234567890abcdef'
      };

      const mockTransaction = {
        id: 'tx-uuid',
        transaction_id: mockTransactionId,
        user_id: mockUserId,
        type: FUNDING_TYPES.ACCOUNT_FUNDING,
        amount: 10000,
        status: FUNDING_STATUSES.COMPLETED,
        stripe_payment_intent_id: 'pi_1234567890abcdef',
        stripe_payment_method_id: 'pm_1234567890abcdef',
        stripe_customer_id: 'cus_1234567890abcdef',
        processing_time: 0,
        created_at: '2024-01-01T00:00:00.000Z',
        updated_at: '2024-01-01T00:00:00.000Z'
      };

      // Mock recent transactions for fraud check
      mockQuery.order.mockResolvedValueOnce({ data: [], error: null }); // Fraud check query
      mockQuery.single
        .mockResolvedValueOnce({ data: null, error: { code: 'PGRST116' } }) // Existing customer check
        .mockResolvedValueOnce({ data: { email: 'test@example.com' }, error: null }) // User email
        .mockResolvedValueOnce({ data: mockStripeCustomer, error: null }) // Create customer
        .mockResolvedValueOnce({ data: mockTransaction, error: null }); // Insert transaction

      mockStripeService.createCustomer.mockResolvedValue({
        id: 'cus_1234567890abcdef',
        userId: mockUserId,
        email: 'test@example.com',
        created: '2024-01-01T00:00:00.000Z'
      });

      mockStripeService.createPaymentIntent.mockResolvedValue(mockPaymentIntent as any);

      // Act
      const result = await fundingService.fundAccount(mockUserId, mockAccountFundingRequest);

      // Assert
      expect(mockStripeService.createPaymentIntent).toHaveBeenCalledWith(
        10000,
        'USD',
        'pm_1234567890abcdef',
        'cus_1234567890abcdef',
        expect.objectContaining({
          userId: mockUserId,
          type: FUNDING_TYPES.ACCOUNT_FUNDING
        })
      );

      expect(mockSupabaseClient.from).toHaveBeenCalledWith('funding_transactions');
      expect(mockQuery.insert).toHaveBeenCalledWith(expect.objectContaining({
        user_id: mockUserId,
        type: FUNDING_TYPES.ACCOUNT_FUNDING,
        amount: 10000,
        status: FUNDING_STATUSES.COMPLETED,
        stripe_payment_intent_id: 'pi_1234567890abcdef'
      }));

      expect(result).toEqual(expect.objectContaining({
        userId: mockUserId,
        type: FUNDING_TYPES.ACCOUNT_FUNDING,
        amount: 10000,
        status: FUNDING_STATUSES.COMPLETED
      }));
    });

    test('should handle pending payment status', async () => {
      // Arrange
      const mockPaymentIntent = {
        id: 'pi_1234567890abcdef',
        status: 'requires_action',
        clientSecret: 'pi_1234567890abcdef_secret_123',
        estimatedProcessingTime: 259200 // 3 days
      };

      const mockTransaction = {
        id: 'tx-uuid',
        transaction_id: mockTransactionId,
        user_id: mockUserId,
        type: FUNDING_TYPES.ACCOUNT_FUNDING,
        amount: 10000,
        status: FUNDING_STATUSES.PENDING,
        stripe_payment_intent_id: 'pi_1234567890abcdef',
        processing_time: 259200,
        created_at: '2024-01-01T00:00:00.000Z',
        updated_at: '2024-01-01T00:00:00.000Z'
      };

      // Setup mocks
      const mockQuery = mockSupabaseClient.from('funding_transactions');
      mockQuery.order.mockResolvedValueOnce({ data: [], error: null });
      mockQuery.single.mockResolvedValueOnce({ data: { stripe_customer_id: 'cus_existing' }, error: null });
      mockQuery.single.mockResolvedValueOnce({ data: mockTransaction, error: null });

      mockStripeService.createPaymentIntent.mockResolvedValue(mockPaymentIntent as any);

      // Act
      const result = await fundingService.fundAccount(mockUserId, mockAccountFundingRequest);

      // Assert
      expect(result.status).toBe(FUNDING_STATUSES.PENDING);
      expect(result.processingTime).toBe(259200);
    });

    test('should throw error for fraud limit exceeded', async () => {
      // Arrange - Mock recent transactions that exceed daily limit
      const recentTransactions = Array(20).fill(null).map((_, i) => ({
        id: `tx-${i}`,
        user_id: mockUserId,
        type: FUNDING_TYPES.ACCOUNT_FUNDING,
        amount: 50000,
        status: FUNDING_STATUSES.COMPLETED,
        created_at: new Date().toISOString()
      }));

      const mockQuery = mockSupabaseClient.from('funding_transactions');
      mockQuery.order.mockResolvedValue({ data: recentTransactions, error: null });

      // Act & Assert
      await expect(fundingService.fundAccount(mockUserId, mockAccountFundingRequest))
        .rejects.toThrow('Daily funding limit exceeded');
    });

    test('should handle Stripe customer creation', async () => {
      // Arrange
      const mockQuery = mockSupabaseClient.from('funding_transactions');
      mockQuery.order.mockResolvedValueOnce({ data: [], error: null }); // Fraud check
      mockQuery.single.mockResolvedValueOnce({ data: null, error: { code: 'PGRST116' } }); // No existing customer
      mockQuery.single.mockResolvedValueOnce({ data: { email: 'test@example.com' }, error: null }); // User email
      mockQuery.single.mockResolvedValueOnce({ 
        data: { user_id: mockUserId, stripe_customer_id: 'cus_new' }, 
        error: null 
      }); // Created customer
      mockQuery.single.mockResolvedValueOnce({ 
        data: { id: 'tx-uuid', status: FUNDING_STATUSES.COMPLETED }, 
        error: null 
      }); // Transaction

      mockStripeService.createCustomer.mockResolvedValue({
        id: 'cus_new',
        userId: mockUserId,
        email: 'test@example.com',
        created: '2024-01-01T00:00:00.000Z'
      });

      mockStripeService.createPaymentIntent.mockResolvedValue({
        id: 'pi_test',
        status: 'succeeded',
        clientSecret: 'secret',
        estimatedProcessingTime: 0
      } as any);

      // Act
      await fundingService.fundAccount(mockUserId, mockAccountFundingRequest);

      // Assert
      expect(mockStripeService.createCustomer).toHaveBeenCalledWith(mockUserId, 'test@example.com');
    });

    test('should handle database insertion error', async () => {
      // Arrange
      const mockQuery = mockSupabaseClient.from('funding_transactions');
      mockQuery.order.mockResolvedValueOnce({ data: [], error: null });
      mockQuery.single.mockResolvedValueOnce({ data: { stripe_customer_id: 'cus_existing' }, error: null });
      mockQuery.single.mockResolvedValueOnce({ data: null, error: { message: 'Database error' } });

      mockStripeService.createPaymentIntent.mockResolvedValue({
        id: 'pi_test',
        status: 'succeeded',
        clientSecret: 'secret',
        estimatedProcessingTime: 0
      } as any);

      // Act & Assert
      await expect(fundingService.fundAccount(mockUserId, mockAccountFundingRequest))
        .rejects.toThrow('Failed to create funding transaction');
    });
  });

  describe('allocateToCard', () => {
    const mockAllocationRequest: CardAllocationRequest = {
      cardId: mockCardId,
      amount: 5000 // $50.00
    };

    test('should allocate funds to card successfully', async () => {
      // Arrange
      const mockAccountBalance = {
        userId: mockUserId,
        totalBalance: 20000,
        allocatedBalance: 10000,
        availableBalance: 10000,
        lastUpdated: '2024-01-01T00:00:00.000Z'
      };

      const mockCard = {
        user_id: mockUserId,
        status: 'active'
      };

      const mockTransaction = {
        id: 'tx-uuid',
        transaction_id: mockTransactionId,
        user_id: mockUserId,
        type: FUNDING_TYPES.CARD_ALLOCATION,
        amount: 5000,
        status: FUNDING_STATUSES.COMPLETED,
        target_card_id: mockCardId,
        processing_time: 0,
        created_at: '2024-01-01T00:00:00.000Z'
      };

      mockBalanceService.getAccountBalance.mockResolvedValue(mockAccountBalance);

      const mockQuery = mockSupabaseClient.from('cards');
      mockQuery.single.mockResolvedValueOnce({ data: mockCard, error: null }); // Card verification
      
      const mockTransactionQuery = mockSupabaseClient.from('funding_transactions');
      mockTransactionQuery.single.mockResolvedValueOnce({ data: mockTransaction, error: null }); // Transaction creation

      const mockAllocationQuery = mockSupabaseClient.from('fund_allocations');
      mockAllocationQuery.single.mockResolvedValue({ data: null, error: null }); // Allocation record

      // Act
      const result = await fundingService.allocateToCard(mockUserId, mockAllocationRequest);

      // Assert
      expect(mockBalanceService.getAccountBalance).toHaveBeenCalledWith(mockUserId);
      expect(mockSupabaseClient.from).toHaveBeenCalledWith('cards');
      expect(mockQuery.eq).toHaveBeenCalledWith('card_id', mockCardId);

      expect(result).toEqual(expect.objectContaining({
        userId: mockUserId,
        type: FUNDING_TYPES.CARD_ALLOCATION,
        amount: 5000,
        status: FUNDING_STATUSES.COMPLETED,
        targetCardId: mockCardId
      }));
    });

    test('should throw error for insufficient available balance', async () => {
      // Arrange
      const mockAccountBalance = {
        userId: mockUserId,
        totalBalance: 10000,
        allocatedBalance: 8000,
        availableBalance: 2000, // Only $20 available
        lastUpdated: '2024-01-01T00:00:00.000Z'
      };

      mockBalanceService.getAccountBalance.mockResolvedValue(mockAccountBalance);

      // Act & Assert
      await expect(fundingService.allocateToCard(mockUserId, mockAllocationRequest))
        .rejects.toThrow('Insufficient balance');
    });

    test('should throw error for card not owned by user', async () => {
      // Arrange
      const mockAccountBalance = {
        userId: mockUserId,
        totalBalance: 20000,
        allocatedBalance: 0,
        availableBalance: 20000,
        lastUpdated: '2024-01-01T00:00:00.000Z'
      };

      const mockCard = {
        user_id: 'different-user-id',
        status: 'active'
      };

      mockBalanceService.getAccountBalance.mockResolvedValue(mockAccountBalance);

      const mockQuery = mockSupabaseClient.from('cards');
      mockQuery.single.mockResolvedValue({ data: mockCard, error: null });

      // Act & Assert
      await expect(fundingService.allocateToCard(mockUserId, mockAllocationRequest))
        .rejects.toThrow('Card does not belong to user');
    });

    test('should throw error for deleted card', async () => {
      // Arrange
      const mockAccountBalance = {
        userId: mockUserId,
        totalBalance: 20000,
        allocatedBalance: 0,
        availableBalance: 20000,
        lastUpdated: '2024-01-01T00:00:00.000Z'
      };

      const mockCard = {
        user_id: mockUserId,
        status: 'deleted'
      };

      mockBalanceService.getAccountBalance.mockResolvedValue(mockAccountBalance);

      const mockQuery = mockSupabaseClient.from('cards');
      mockQuery.single.mockResolvedValue({ data: mockCard, error: null });

      // Act & Assert
      await expect(fundingService.allocateToCard(mockUserId, mockAllocationRequest))
        .rejects.toThrow('Cannot operate on deleted card');
    });
  });

  describe('transferBetweenCards', () => {
    const mockTransferRequest: CardTransferRequest = {
      fromCardId: 'source-card-id',
      toCardId: 'target-card-id',
      amount: 3000 // $30.00
    };

    test('should transfer funds between cards successfully', async () => {
      // Arrange
      const mockSourceCard = { user_id: mockUserId, status: 'active' };
      const mockTargetCard = { user_id: mockUserId, status: 'active' };
      const mockSourceCardBalance = {
        cardId: 'source-card-id',
        balance: 5000,
        lastUpdated: '2024-01-01T00:00:00.000Z'
      };

      const mockTransaction = {
        id: 'tx-uuid',
        transaction_id: mockTransactionId,
        user_id: mockUserId,
        type: FUNDING_TYPES.CARD_TRANSFER,
        amount: 3000,
        status: FUNDING_STATUSES.COMPLETED,
        source_card_id: 'source-card-id',
        target_card_id: 'target-card-id',
        processing_time: 0,
        created_at: '2024-01-01T00:00:00.000Z'
      };

      const mockQuery = mockSupabaseClient.from('cards');
      mockQuery.single
        .mockResolvedValueOnce({ data: mockSourceCard, error: null })
        .mockResolvedValueOnce({ data: mockTargetCard, error: null });

      mockBalanceService.getCardBalance.mockResolvedValue(mockSourceCardBalance);

      const mockTransactionQuery = mockSupabaseClient.from('funding_transactions');
      mockTransactionQuery.single.mockResolvedValue({ data: mockTransaction, error: null });

      // Act
      const result = await fundingService.transferBetweenCards(mockUserId, mockTransferRequest);

      // Assert
      expect(mockBalanceService.getCardBalance).toHaveBeenCalledWith('source-card-id');
      expect(result).toEqual(expect.objectContaining({
        userId: mockUserId,
        type: FUNDING_TYPES.CARD_TRANSFER,
        amount: 3000,
        status: FUNDING_STATUSES.COMPLETED,
        sourceCardId: 'source-card-id',
        targetCardId: 'target-card-id'
      }));
    });

    test('should throw error for insufficient source card balance', async () => {
      // Arrange
      const mockSourceCard = { user_id: mockUserId, status: 'active' };
      const mockTargetCard = { user_id: mockUserId, status: 'active' };
      const mockSourceCardBalance = {
        cardId: 'source-card-id',
        balance: 1000, // Only $10 available
        lastUpdated: '2024-01-01T00:00:00.000Z'
      };

      const mockQuery = mockSupabaseClient.from('cards');
      mockQuery.single
        .mockResolvedValueOnce({ data: mockSourceCard, error: null })
        .mockResolvedValueOnce({ data: mockTargetCard, error: null });

      mockBalanceService.getCardBalance.mockResolvedValue(mockSourceCardBalance);

      // Act & Assert
      await expect(fundingService.transferBetweenCards(mockUserId, mockTransferRequest))
        .rejects.toThrow('Insufficient balance');
    });
  });

  describe('getFundingTransactions', () => {
    test('should retrieve funding transactions with filters', async () => {
      // Arrange
      const mockTransactions = [
        {
          id: 'tx-1',
          user_id: mockUserId,
          type: FUNDING_TYPES.ACCOUNT_FUNDING,
          amount: 10000,
          status: FUNDING_STATUSES.COMPLETED,
          created_at: '2024-01-01T00:00:00.000Z'
        }
      ];

      const mockQuery = mockSupabaseClient.from('funding_transactions');
      mockQuery.limit.mockResolvedValue({ data: mockTransactions, error: null });

      // Act
      const result = await fundingService.getFundingTransactions(mockUserId, {
        status: FUNDING_STATUSES.COMPLETED,
        limit: 10
      });

      // Assert
      expect(mockSupabaseClient.from).toHaveBeenCalledWith('funding_transactions');
      expect(mockQuery.eq).toHaveBeenCalledWith('user_id', mockUserId);
      expect(mockQuery.eq).toHaveBeenCalledWith('status', FUNDING_STATUSES.COMPLETED);
      expect(mockQuery.limit).toHaveBeenCalledWith(10);
      expect(result).toHaveLength(1);
    });

    test('should handle database query error', async () => {
      // Arrange
      const mockQuery = mockSupabaseClient.from('funding_transactions');
      mockQuery.limit.mockResolvedValue({ data: null, error: { message: 'Database error' } });

      // Act & Assert
      await expect(fundingService.getFundingTransactions(mockUserId))
        .rejects.toThrow('Failed to fetch funding transactions');
    });
  });

  describe('processStripeWebhook', () => {
    test('should process payment_intent.succeeded webhook', async () => {
      // Arrange
      const mockEvent = {
        id: 'evt_1234567890',
        type: 'payment_intent.succeeded',
        data: {
          object: {
            id: 'pi_1234567890abcdef'
          }
        }
      };

      const mockWebhookQuery = mockSupabaseClient.from('stripe_webhook_events');
      mockWebhookQuery.single.mockResolvedValueOnce({ data: null, error: { code: 'PGRST116' } }); // Not processed
      mockWebhookQuery.eq.mockResolvedValue({ error: null }); // Upsert and update calls

      const mockTransactionQuery = mockSupabaseClient.from('funding_transactions');
      mockTransactionQuery.single.mockResolvedValue({ 
        data: { transaction_id: 'test-tx' }, 
        error: null 
      });

      // Act
      await fundingService.processStripeWebhook(mockEvent);

      // Assert
      expect(mockSupabaseClient.from).toHaveBeenCalledWith('stripe_webhook_events');
      expect(mockWebhookQuery.upsert).toHaveBeenCalledWith(expect.objectContaining({
        stripe_event_id: 'evt_1234567890',
        event_type: 'payment_intent.succeeded'
      }));
    });

    test('should skip already processed webhook events', async () => {
      // Arrange
      const mockEvent = {
        id: 'evt_1234567890',
        type: 'payment_intent.succeeded',
        data: { object: { id: 'pi_test' } }
      };

      const mockQuery = mockSupabaseClient.from('stripe_webhook_events');
      mockQuery.single.mockResolvedValue({ data: { processed: true }, error: null });

      // Act
      await fundingService.processStripeWebhook(mockEvent);

      // Assert
      expect(mockQuery.upsert).not.toHaveBeenCalled();
    });

    test('should handle webhook processing error', async () => {
      // Arrange
      const mockEvent = {
        id: 'evt_1234567890',
        type: 'payment_intent.succeeded',
        data: { object: { id: 'pi_nonexistent' } }
      };

      const mockWebhookQuery = mockSupabaseClient.from('stripe_webhook_events');
      mockWebhookQuery.single.mockResolvedValueOnce({ data: null, error: { code: 'PGRST116' } });
      mockWebhookQuery.eq.mockResolvedValue({ error: null });

      const mockTransactionQuery = mockSupabaseClient.from('funding_transactions');
      mockTransactionQuery.single.mockRejectedValue(new Error('Transaction not found'));

      // Act & Assert
      await expect(fundingService.processStripeWebhook(mockEvent))
        .rejects.toThrow('Transaction not found');

      // Should still record the error
      expect(mockWebhookQuery.update).toHaveBeenCalledWith(expect.objectContaining({
        processing_error: 'Transaction not found'
      }));
    });
  });
});