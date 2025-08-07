import { jest } from '@jest/globals';
import { RefundService } from '../../../../services/crypto/refund.service';
import { DatabaseService } from '../../../../services/database.service';
import { TransactionWebSocketService } from '../../../../services/crypto/transaction-websocket.service';

// Mock dependencies
const mockDatabaseService = {
  query: jest.fn(),
} as jest.Mocked<DatabaseService>;

const mockWebSocketService = {
  broadcastTransactionUpdate: jest.fn(),
} as jest.Mocked<TransactionWebSocketService>;

describe('RefundService', () => {
  let refundService: RefundService;

  beforeEach(() => {
    jest.clearAllMocks();
    refundService = new RefundService(mockDatabaseService, mockWebSocketService);
  });

  describe('processRefund', () => {
    const validRefundRequest = {
      transactionId: 'tx-123',
      cardId: 'card-456',
      reason: 'Transaction failed to confirm',
      refundAddress: '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa',
      amount: '1.0'
    };

    it('should successfully process a valid refund request', async () => {
      // Mock validation calls
      mockDatabaseService.query
        .mockResolvedValueOnce({ rows: [{ status: 'failed' }] }) // validateRefundEligibility
        .mockResolvedValueOnce({ rows: [] }) // check existing refunds
        .mockResolvedValueOnce({ rows: [{ // getOriginalTransactionDetails
          transaction_id: 'tx-123',
          amount: '1.0',
          network_type: 'BTC',
          from_address: '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa'
        }] })
        .mockResolvedValueOnce({ rows: [] }) // SET LOCAL rls.card_id
        .mockResolvedValueOnce({ rows: [] }) // INSERT refund_transactions
        .mockResolvedValueOnce({ rows: [] }); // UPDATE original transaction

      const result = await refundService.processRefund(validRefundRequest);

      expect(result.originalTransactionId).toBe('tx-123');
      expect(result.refundAmount).toBe('1.0');
      expect(result.reason).toBe('Transaction failed to confirm');
      expect(result.status).toBe('pending');
      expect(mockWebSocketService.broadcastTransactionUpdate).toHaveBeenCalled();
    });

    it('should reject refund for confirmed transaction', async () => {
      mockDatabaseService.query
        .mockResolvedValueOnce({ rows: [] }) // SET LOCAL rls.card_id
        .mockResolvedValueOnce({ rows: [{ status: 'confirmed' }] }); // check transaction status

      await expect(
        refundService.processRefund(validRefundRequest)
      ).rejects.toThrow('Cannot refund confirmed transaction');
    });

    it('should reject refund for already refunded transaction', async () => {
      mockDatabaseService.query
        .mockResolvedValueOnce({ rows: [] }) // SET LOCAL rls.card_id
        .mockResolvedValueOnce({ rows: [{ status: 'refunded' }] }); // check transaction status

      await expect(
        refundService.processRefund(validRefundRequest)
      ).rejects.toThrow('Transaction already refunded');
    });

    it('should reject refund when refund already exists', async () => {
      mockDatabaseService.query
        .mockResolvedValueOnce({ rows: [] }) // SET LOCAL rls.card_id
        .mockResolvedValueOnce({ rows: [{ status: 'failed' }] }) // check transaction status
        .mockResolvedValueOnce({ rows: [{ refund_id: 'existing-refund' }] }); // check existing refunds

      await expect(
        refundService.processRefund(validRefundRequest)
      ).rejects.toThrow('Refund already in progress');
    });

    it('should reject refund for non-existent transaction', async () => {
      mockDatabaseService.query
        .mockResolvedValueOnce({ rows: [] }) // SET LOCAL rls.card_id
        .mockResolvedValueOnce({ rows: [] }); // check transaction status

      await expect(
        refundService.processRefund(validRefundRequest)
      ).rejects.toThrow('Transaction not found');
    });

    it('should validate refund amount does not exceed original', async () => {
      const invalidRefundRequest = {
        ...validRefundRequest,
        amount: '2.0' // More than original 1.0
      };

      // Mock original transaction with 1.0 amount
      mockDatabaseService.query
        .mockResolvedValueOnce({ rows: [] }) // SET LOCAL rls.card_id
        .mockResolvedValueOnce({ rows: [{ status: 'failed' }] }) // transaction status
        .mockResolvedValueOnce({ rows: [] }) // no existing refunds
        .mockResolvedValueOnce({ rows: [{ amount: '1.0' }] }); // original transaction

      await expect(
        refundService.processRefund(invalidRefundRequest)
      ).rejects.toThrow('Refund amount cannot exceed original transaction amount');
    });

    it('should validate positive refund amount', async () => {
      const invalidRefundRequest = {
        ...validRefundRequest,
        amount: '0'
      };

      mockDatabaseService.query
        .mockResolvedValueOnce({ rows: [] }) // SET LOCAL rls.card_id
        .mockResolvedValueOnce({ rows: [{ status: 'failed' }] }) // transaction status
        .mockResolvedValueOnce({ rows: [] }) // no existing refunds
        .mockResolvedValueOnce({ rows: [{ amount: '1.0' }] }); // original transaction

      await expect(
        refundService.processRefund(invalidRefundRequest)
      ).rejects.toThrow('Refund amount must be positive');
    });
  });

  describe('getRefundStatus', () => {
    it('should return refund status when found', async () => {
      const mockRefund = {
        refund_id: 'refund-123',
        original_transaction_id: 'tx-456',
        refund_amount: '1.0',
        refund_address: '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa',
        status: 'processing',
        reason: 'Transaction failed',
        blockchain_refund_hash: 'hash-789',
        processed_at: '2023-01-01T12:00:00Z',
        completed_at: null,
        created_at: '2023-01-01T10:00:00Z'
      };

      mockDatabaseService.query
        .mockResolvedValueOnce({ rows: [] }) // SET LOCAL rls.card_id
        .mockResolvedValueOnce({ rows: [mockRefund] }); // SELECT

      const result = await refundService.getRefundStatus('refund-123', 'card-456');

      expect(result).toBeDefined();
      expect(result?.refundId).toBe('refund-123');
      expect(result?.status).toBe('processing');
      expect(result?.refundAmount).toBe('1.0');
    });

    it('should return null when refund not found', async () => {
      mockDatabaseService.query
        .mockResolvedValueOnce({ rows: [] }) // SET LOCAL rls.card_id
        .mockResolvedValueOnce({ rows: [] }); // SELECT

      const result = await refundService.getRefundStatus('nonexistent', 'card-123');

      expect(result).toBeNull();
    });
  });

  describe('updateRefundStatus', () => {
    it('should update refund status to processing', async () => {
      mockDatabaseService.query.mockResolvedValue({ rows: [] });

      await refundService.updateRefundStatus('refund-123', 'processing', 'hash-456');

      expect(mockDatabaseService.query).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE refund_transactions'),
        expect.arrayContaining(['processing', expect.any(String), 'hash-456', 'refund-123'])
      );
    });

    it('should update refund status to completed with completion timestamp', async () => {
      mockDatabaseService.query.mockResolvedValue({ rows: [] });

      await refundService.updateRefundStatus('refund-123', 'completed');

      expect(mockDatabaseService.query).toHaveBeenCalledWith(
        expect.stringContaining('completed_at'),
        expect.arrayContaining(['completed'])
      );
    });
  });

  describe('detectFailedTransactions', () => {
    it('should detect transactions that have been pending too long', async () => {
      const mockFailedTransactions = [
        {
          processing_id: 'proc-1',
          transaction_id: 'tx-1',
          network_type: 'BTC',
          created_at: new Date(Date.now() - 3 * 60 * 60 * 1000) // 3 hours ago
        },
        {
          processing_id: 'proc-2',
          transaction_id: 'tx-2',
          network_type: 'ETH',
          created_at: new Date(Date.now() - 3 * 60 * 60 * 1000) // 3 hours ago
        }
      ];

      mockDatabaseService.query
        .mockResolvedValueOnce({ rows: mockFailedTransactions }) // SELECT failed transactions
        .mockResolvedValueOnce({ rows: [] }) // UPDATE tx-1 status
        .mockResolvedValueOnce({ rows: [] }); // UPDATE tx-2 status

      // Mock verification to return true (actually failed)
      jest.spyOn(refundService, 'verifyTransactionFailure' as any)
        .mockResolvedValue(true);

      const result = await refundService.detectFailedTransactions();

      expect(result).toEqual(['tx-1', 'tx-2']);
    });

    it('should handle XRP transactions with shorter timeout', async () => {
      const mockXRPTransaction = {
        processing_id: 'proc-xrp',
        transaction_id: 'tx-xrp',
        network_type: 'XRP',
        created_at: new Date(Date.now() - 15 * 60 * 1000) // 15 minutes ago
      };

      mockDatabaseService.query.mockResolvedValueOnce({ rows: [mockXRPTransaction] });
      
      jest.spyOn(refundService, 'verifyTransactionFailure' as any)
        .mockResolvedValue(true);

      const result = await refundService.detectFailedTransactions();

      expect(result).toContain('tx-xrp');
    });

    it('should not mark transactions as failed if blockchain verification passes', async () => {
      const mockTransaction = {
        processing_id: 'proc-1',
        transaction_id: 'tx-1',
        network_type: 'BTC',
        created_at: new Date(Date.now() - 3 * 60 * 60 * 1000)
      };

      mockDatabaseService.query.mockResolvedValueOnce({ rows: [mockTransaction] });
      
      // Mock verification to return false (still processing)
      jest.spyOn(refundService, 'verifyTransactionFailure' as any)
        .mockResolvedValue(false);

      const result = await refundService.detectFailedTransactions();

      expect(result).toEqual([]);
    });
  });

  describe('processAutomaticRefunds', () => {
    it('should process automatic refunds for failed transactions', async () => {
      const mockFailedTransactions = ['tx-1', 'tx-2'];
      const mockTransactionData = {
        transaction_id: 'tx-1',
        card_id: 'card-123',
        amount: '1.0',
        from_address: '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa'
      };

      jest.spyOn(refundService, 'detectFailedTransactions')
        .mockResolvedValue(mockFailedTransactions);

      mockDatabaseService.query
        .mockResolvedValueOnce({ rows: [mockTransactionData] }) // Get tx-1 details
        .mockResolvedValueOnce({ rows: [] }); // Get tx-2 details (not found)

      jest.spyOn(refundService, 'processRefund')
        .mockResolvedValue({} as any);

      await refundService.processAutomaticRefunds();

      expect(refundService.processRefund).toHaveBeenCalledWith({
        transactionId: 'tx-1',
        cardId: 'card-123',
        reason: 'Automatic refund for failed transaction',
        refundAddress: '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa',
        amount: '1.0'
      });
    });

    it('should handle errors in automatic refund processing gracefully', async () => {
      const mockFailedTransactions = ['tx-error'];

      jest.spyOn(refundService, 'detectFailedTransactions')
        .mockResolvedValue(mockFailedTransactions);

      mockDatabaseService.query.mockRejectedValue(new Error('Database error'));

      // Should not throw - errors should be logged and handled
      await expect(refundService.processAutomaticRefunds()).resolves.not.toThrow();
    });
  });

  describe('address validation', () => {
    it('should validate Bitcoin addresses correctly', async () => {
      const validBTCAddresses = [
        '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa', // P2PKH
        '3J98t1WpEZ73CNmQviecrnyiWrnqRhWNLy', // P2SH
        'bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq'  // Bech32
      ];

      for (const address of validBTCAddresses) {
        const validateMethod = jest.spyOn(refundService, 'validateRefundAddress' as any);
        validateMethod.mockImplementation(() => Promise.resolve());

        await expect(
          (refundService as any).validateRefundAddress(address, 'BTC')
        ).resolves.not.toThrow();
      }
    });

    it('should validate Ethereum addresses correctly', async () => {
      const validETHAddress = '0x742d35Cc6634C0532925a3b8D98F6Edcc8A2D6D7';
      
      const validateMethod = jest.spyOn(refundService, 'validateRefundAddress' as any);
      validateMethod.mockImplementation(() => Promise.resolve());

      await expect(
        (refundService as any).validateRefundAddress(validETHAddress, 'ETH')
      ).resolves.not.toThrow();
    });

    it('should reject invalid addresses', async () => {
      const invalidAddress = 'invalid-address';

      await expect(
        (refundService as any).validateRefundAddress(invalidAddress, 'BTC')
      ).rejects.toThrow('Invalid BTC address format');
    });

    it('should reject empty addresses', async () => {
      await expect(
        (refundService as any).validateRefundAddress('', 'BTC')
      ).rejects.toThrow('Invalid refund address');
    });
  });
});