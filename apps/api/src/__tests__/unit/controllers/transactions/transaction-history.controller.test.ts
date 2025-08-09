// Mock environment variables first
process.env.SUPABASE_URL = 'https://test.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-key';

import { Request, Response } from 'express';
import { TransactionHistoryController } from '../../../../controllers/transactions/transaction-history.controller';
import { transactionHistoryService } from '../../../../services/transactions/transaction-history.service';

// Mock dependencies
jest.mock('../../../../services/transactions/transaction-history.service');
jest.mock('../../../../utils/validators');
jest.mock('../../../../utils/logger');

const mockTransactionHistoryService = transactionHistoryService as jest.Mocked<typeof transactionHistoryService>;

describe('TransactionHistoryController', () => {
  let controller: TransactionHistoryController;
  let mockRequest: Partial<Request>;
  let mockResponse: Partial<Response>;

  beforeEach(() => {
    controller = new TransactionHistoryController();
    
    mockRequest = {
      params: {},
      query: {},
      user: { id: 'user-123' }
    };

    mockResponse = {
      json: jest.fn().mockReturnThis(),
      status: jest.fn().mockReturnThis()
    };

    jest.clearAllMocks();
  });

  describe('getTransactionDetail', () => {
    it('should return transaction detail with privacy enhancements', async () => {
      const mockTransactionDetail = {
        transactionId: 'tx-123',
        merchantName: 'Test Merchant',
        merchantCategory: 'grocery',
        amount: 2500,
        status: 'settled' as const,
        processedAt: '2025-08-09T10:00:00Z',
        authorizationCode: 'AUTH123456',
        privacyCountdown: 120,
        encryptionStatus: true,
        refundInfo: null,
        maskedCardNumber: '****3456',
        maskedAuthCode: 'AUTH12******',
        transactionHash: 'abc123def456'
      };

      mockRequest.params = { transactionId: 'tx-123' };
      mockTransactionHistoryService.getTransactionDetail.mockResolvedValue(mockTransactionDetail);

      await controller.getTransactionDetail(mockRequest as Request, mockResponse as Response);

      // Verify service was called with correct parameters
      expect(mockTransactionHistoryService.getTransactionDetail).toHaveBeenCalledWith(
        'tx-123',
        'user-123'
      );

      // Verify response
      expect(mockResponse.json).toHaveBeenCalledWith(mockTransactionDetail);
      expect(mockResponse.status).not.toHaveBeenCalled();
    });

    it('should return 404 for unauthorized access (privacy-preserving error)', async () => {
      mockRequest.params = { transactionId: 'tx-123' };
      mockTransactionHistoryService.getTransactionDetail.mockResolvedValue(null);

      await controller.getTransactionDetail(mockRequest as Request, mockResponse as Response);

      // Verify privacy-preserving 404 error
      expect(mockResponse.status).toHaveBeenCalledWith(404);
      expect(mockResponse.json).toHaveBeenCalledWith({ error: 'Transaction not found' });
    });

    it('should return 500 for service errors', async () => {
      mockRequest.params = { transactionId: 'tx-123' };
      mockTransactionHistoryService.getTransactionDetail.mockRejectedValue(new Error('Database error'));

      await controller.getTransactionDetail(mockRequest as Request, mockResponse as Response);

      // Verify error handling
      expect(mockResponse.status).toHaveBeenCalledWith(500);
      expect(mockResponse.json).toHaveBeenCalledWith({ error: 'Internal server error' });
    });

    it('should handle missing transaction ID parameter', async () => {
      mockRequest.params = {};
      mockTransactionHistoryService.getTransactionDetail.mockResolvedValue(null);

      await controller.getTransactionDetail(mockRequest as Request, mockResponse as Response);

      // Should still try to get transaction with undefined ID
      expect(mockTransactionHistoryService.getTransactionDetail).toHaveBeenCalledWith(
        undefined,
        'user-123'
      );
    });
  });

  describe('getCardTransactions', () => {
    it('should return paginated transactions with analytics', async () => {
      const mockTransactionHistory = {
        transactions: [
          {
            transactionId: 'tx-1',
            merchantName: 'Test Merchant',
            amount: 2500,
            status: 'settled',
            privacyCountdown: 120
          }
        ],
        pagination: {
          total: 1,
          page: 1,
          limit: 20,
          hasMore: false
        },
        analytics: {
          totalSpent: 2500,
          transactionCount: 1,
          averageTransaction: 2500,
          categoryBreakdown: { grocery: 2500 }
        }
      };

      mockRequest.params = { cardId: 'card-123' };
      mockRequest.query = { page: '1', limit: '20', status: 'settled' };

      // Mock validatePaginationParams
      const { validatePaginationParams } = require('../../../../utils/validators');
      validatePaginationParams.mockReturnValue({ page: 1, limit: 20 });

      mockTransactionHistoryService.getCardTransactions.mockResolvedValue(mockTransactionHistory);

      await controller.getCardTransactions(mockRequest as Request, mockResponse as Response);

      // Verify service was called with correct parameters
      expect(mockTransactionHistoryService.getCardTransactions).toHaveBeenCalledWith({
        cardId: 'card-123',
        userId: 'user-123',
        pagination: { page: 1, limit: 20 },
        filters: {
          status: 'settled',
          startDate: undefined,
          endDate: undefined
        }
      });

      // Verify response
      expect(mockResponse.json).toHaveBeenCalledWith(mockTransactionHistory);
    });

    it('should return 404 for unauthorized card access (privacy-preserving)', async () => {
      mockRequest.params = { cardId: 'card-123' };
      mockTransactionHistoryService.getCardTransactions.mockResolvedValue(null);

      const { validatePaginationParams } = require('../../../../utils/validators');
      validatePaginationParams.mockReturnValue({ page: 1, limit: 20 });

      await controller.getCardTransactions(mockRequest as Request, mockResponse as Response);

      // Verify privacy-preserving 404 error
      expect(mockResponse.status).toHaveBeenCalledWith(404);
      expect(mockResponse.json).toHaveBeenCalledWith({ error: 'Card not found' });
    });

    it('should validate date range parameters', async () => {
      mockRequest.params = { cardId: 'card-123' };
      mockRequest.query = { 
        startDate: '2025-08-01T00:00:00Z',
        endDate: '2025-08-31T23:59:59Z'
      };

      const { validatePaginationParams, validateDateRange } = require('../../../../utils/validators');
      validatePaginationParams.mockReturnValue({ page: 1, limit: 20 });
      validateDateRange.mockReturnValue({ valid: false, errors: ['Date range too large'] });

      await controller.getCardTransactions(mockRequest as Request, mockResponse as Response);

      // Verify date range validation error
      expect(mockResponse.status).toHaveBeenCalledWith(400);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: 'Invalid date range',
        details: ['Date range too large']
      });
    });
  });
});