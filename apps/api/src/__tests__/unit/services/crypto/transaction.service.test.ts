import { jest } from '@jest/globals';
import { CryptoTransactionService } from '../../../../services/crypto/transaction.service';
import { DatabaseService } from '../../../../services/database.service';
import { ConversionService } from '../../../../services/crypto/conversion.service';
import { FraudDetectionService } from '../../../../services/crypto/fraud-detection.service';
import { RefundService } from '../../../../services/crypto/refund.service';
import { TransactionWebSocketService } from '../../../../services/crypto/transaction-websocket.service';

// Mock dependencies
const mockDatabaseService = {
  query: jest.fn(),
} as jest.Mocked<DatabaseService>;

const mockConversionService = {
  getConversionQuote: jest.fn(),
} as jest.Mocked<ConversionService>;

const mockFraudDetectionService = {
  validateTransaction: jest.fn(),
} as jest.Mocked<FraudDetectionService>;

const mockRefundService = {} as jest.Mocked<RefundService>;

const mockWebSocketService = {
  broadcastTransactionUpdate: jest.fn(),
} as jest.Mocked<TransactionWebSocketService>;

describe('CryptoTransactionService', () => {
  let transactionService: CryptoTransactionService;

  beforeEach(() => {
    jest.clearAllMocks();
    transactionService = new CryptoTransactionService(
      mockDatabaseService,
      mockConversionService,
      mockFraudDetectionService,
      mockRefundService,
      mockWebSocketService
    );
  });

  describe('processTransaction', () => {
    const validTransactionParams = {
      transactionId: 'test-transaction-id',
      cardId: 'test-card-id',
      networkType: 'BTC' as const,
      amount: '1.0',
      fromAddress: '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa',
      toAddress: '3J98t1WpEZ73CNmQviecrnyiWrnqRhWNLy',
      blockchainTxHash: '000000000019d6689c085ae165831e934ff763ae46a2a6c172b3f1b60a8ce26f'
    };

    it('should successfully process a valid BTC transaction', async () => {
      // Mock fraud detection validation
      mockFraudDetectionService.validateTransaction.mockResolvedValue(undefined);

      // Mock conversion quote
      mockConversionService.getConversionQuote.mockResolvedValue({
        rate: '45000.00',
        quoteId: 'quote-123',
        validUntil: new Date(),
        fromCurrency: 'BTC',
        toCurrency: 'USD',
        amount: '1.0'
      } as any);

      // Mock database operations
      mockDatabaseService.query
        .mockResolvedValueOnce({ rows: [] }) // SET LOCAL rls.card_id
        .mockResolvedValueOnce({ rows: [] }); // INSERT transaction

      const result = await transactionService.processTransaction(validTransactionParams);

      expect(result.transactionId).toBe('test-transaction-id');
      expect(result.status).toBe('initiated');
      expect(result.networkType).toBe('BTC');
      expect(result.requiredConfirmations).toBe(3);
      expect(result.lockedConversionRate).toBe('45000.00');

      expect(mockFraudDetectionService.validateTransaction).toHaveBeenCalledWith({
        cardId: 'test-card-id',
        networkType: 'BTC',
        amount: '1.0',
        fromAddress: '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa',
        toAddress: '3J98t1WpEZ73CNmQviecrnyiWrnqRhWNLy'
      });

      expect(mockWebSocketService.broadcastTransactionUpdate).toHaveBeenCalled();
    });

    it('should handle different network types with correct confirmation requirements', async () => {
      const networks = [
        { type: 'BTC' as const, confirmations: 3 },
        { type: 'ETH' as const, confirmations: 12 },
        { type: 'USDT' as const, confirmations: 12 },
        { type: 'USDC' as const, confirmations: 12 },
        { type: 'XRP' as const, confirmations: 1 }
      ];

      for (const network of networks) {
        mockFraudDetectionService.validateTransaction.mockResolvedValue(undefined);
        mockConversionService.getConversionQuote.mockResolvedValue({
          rate: '1.00',
          quoteId: 'quote-123'
        } as any);
        mockDatabaseService.query.mockResolvedValue({ rows: [] });

        const params = { ...validTransactionParams, networkType: network.type };
        const result = await transactionService.processTransaction(params);

        expect(result.requiredConfirmations).toBe(network.confirmations);
        expect(result.networkType).toBe(network.type);
      }
    });

    it('should reject transaction when fraud detection fails', async () => {
      mockFraudDetectionService.validateTransaction.mockRejectedValue(
        new Error('Transaction blocked by fraud detection')
      );

      await expect(
        transactionService.processTransaction(validTransactionParams)
      ).rejects.toThrow('Transaction blocked by fraud detection');

      expect(mockConversionService.getConversionQuote).not.toHaveBeenCalled();
      expect(mockDatabaseService.query).not.toHaveBeenCalled();
    });

    it('should handle database errors gracefully', async () => {
      mockFraudDetectionService.validateTransaction.mockResolvedValue(undefined);
      mockConversionService.getConversionQuote.mockResolvedValue({
        rate: '45000.00',
        quoteId: 'quote-123'
      } as any);

      mockDatabaseService.query.mockRejectedValue(new Error('Database connection failed'));

      await expect(
        transactionService.processTransaction(validTransactionParams)
      ).rejects.toThrow('Database connection failed');
    });
  });

  describe('getTransactionStatus', () => {
    it('should return transaction status when found', async () => {
      const mockTransaction = {
        processing_id: 'proc-123',
        transaction_id: 'tx-456',
        blockchain_tx_hash: 'hash-789',
        status: 'confirming',
        confirmation_count: 2,
        required_confirmations: 3,
        network_fee_estimate: 2500,
        estimated_completion: '2023-01-01T12:00:00Z',
        locked_conversion_rate: '45000.00',
        network_type: 'BTC',
        acceleration_options: '[]',
        created_at: '2023-01-01T10:00:00Z',
        completed_at: null
      };

      mockDatabaseService.query
        .mockResolvedValueOnce({ rows: [] }) // SET LOCAL rls.card_id
        .mockResolvedValueOnce({ rows: [mockTransaction] }); // SELECT

      const result = await transactionService.getTransactionStatus('tx-456', 'card-123');

      expect(result).toBeDefined();
      expect(result?.transactionId).toBe('tx-456');
      expect(result?.status).toBe('confirming');
      expect(result?.confirmationCount).toBe(2);
      expect(result?.requiredConfirmations).toBe(3);
    });

    it('should return null when transaction not found', async () => {
      mockDatabaseService.query
        .mockResolvedValueOnce({ rows: [] }) // SET LOCAL rls.card_id
        .mockResolvedValueOnce({ rows: [] }); // SELECT

      const result = await transactionService.getTransactionStatus('nonexistent', 'card-123');

      expect(result).toBeNull();
    });
  });

  describe('updateConfirmationCount', () => {
    it('should update confirmation count and trigger confirmation when threshold reached', async () => {
      const mockTransaction = {
        required_confirmations: 3,
        status: 'confirming'
      };

      mockDatabaseService.query
        .mockResolvedValueOnce({ rows: [mockTransaction] }) // UPDATE confirmation count
        .mockResolvedValueOnce({ rows: [] }); // UPDATE status to confirmed

      const confirmTransactionSpy = jest.spyOn(transactionService, 'confirmTransaction' as any)
        .mockImplementation(() => Promise.resolve());

      await transactionService.updateConfirmationCount('proc-123', 3);

      expect(confirmTransactionSpy).toHaveBeenCalledWith('proc-123');
    });

    it('should update status to confirming when first confirmation received', async () => {
      const mockTransaction = {
        required_confirmations: 3,
        status: 'pending'
      };

      mockDatabaseService.query.mockResolvedValueOnce({ rows: [mockTransaction] });

      const updateStatusSpy = jest.spyOn(transactionService, 'updateTransactionStatus' as any)
        .mockImplementation(() => Promise.resolve());

      await transactionService.updateConfirmationCount('proc-123', 1);

      expect(updateStatusSpy).toHaveBeenCalledWith('proc-123', 'confirming');
    });
  });

  describe('accelerateTransaction', () => {
    it('should return acceleration options for pending transactions', async () => {
      const mockProcessing = {
        status: 'pending',
        networkType: 'BTC',
        networkFeeEstimate: 2500
      };

      jest.spyOn(transactionService, 'getTransactionByProcessingId' as any)
        .mockResolvedValue(mockProcessing);

      // Mock network congestion (high)
      jest.spyOn(transactionService, 'getNetworkCongestion' as any)
        .mockResolvedValue(2.0);

      mockDatabaseService.query.mockResolvedValue({ rows: [] });

      const result = await transactionService.accelerateTransaction('proc-123', 'card-456');

      expect(result).toHaveLength(2);
      expect(result[0].feeIncrease).toBe(1250); // 50% of 2500
      expect(result[1].feeIncrease).toBe(2500); // 100% of 2500
    });

    it('should return empty array for confirmed transactions', async () => {
      const mockProcessing = {
        status: 'confirmed',
        networkType: 'BTC'
      };

      jest.spyOn(transactionService, 'getTransactionByProcessingId' as any)
        .mockResolvedValue(mockProcessing);

      await expect(
        transactionService.accelerateTransaction('proc-123', 'card-456')
      ).rejects.toThrow('Transaction cannot be accelerated in status: confirmed');
    });

    it('should return empty array during low network congestion', async () => {
      const mockProcessing = {
        status: 'pending',
        networkType: 'BTC'
      };

      jest.spyOn(transactionService, 'getTransactionByProcessingId' as any)
        .mockResolvedValue(mockProcessing);

      // Mock low network congestion
      jest.spyOn(transactionService, 'getNetworkCongestion' as any)
        .mockResolvedValue(1.0);

      const result = await transactionService.accelerateTransaction('proc-123', 'card-456');

      expect(result).toHaveLength(0);
    });
  });

  describe('getTransactionHistory', () => {
    it('should return paginated transaction history', async () => {
      const mockTransactions = [
        {
          processing_id: 'proc-1',
          transaction_id: 'tx-1',
          blockchain_tx_hash: 'hash-1',
          status: 'confirmed',
          confirmation_count: 3,
          required_confirmations: 3,
          network_fee_estimate: 2500,
          estimated_completion: '2023-01-01T12:00:00Z',
          locked_conversion_rate: '45000.00',
          network_type: 'BTC',
          acceleration_options: '[]',
          created_at: '2023-01-01T10:00:00Z',
          completed_at: '2023-01-01T12:30:00Z'
        }
      ];

      mockDatabaseService.query
        .mockResolvedValueOnce({ rows: [] }) // SET LOCAL rls.card_id
        .mockResolvedValueOnce({ rows: mockTransactions }); // SELECT

      const result = await transactionService.getTransactionHistory('card-123', 50, 0);

      expect(result).toHaveLength(1);
      expect(result[0].transactionId).toBe('tx-1');
      expect(result[0].status).toBe('confirmed');
    });

    it('should handle empty transaction history', async () => {
      mockDatabaseService.query
        .mockResolvedValueOnce({ rows: [] }) // SET LOCAL rls.card_id
        .mockResolvedValueOnce({ rows: [] }); // SELECT

      const result = await transactionService.getTransactionHistory('card-123');

      expect(result).toHaveLength(0);
    });
  });
});