import { Request, Response } from 'express';
const { body, param, query, validationResult } = require('express-validator');
import { logger } from '../../utils/logger';
import { CryptoTransactionService } from '../../services/crypto/transaction.service';
import { RefundService } from '../../services/crypto/refund.service';
import { DatabaseService } from '../../services/database.service';
import { ConversionService } from '../../services/crypto/conversion.service';
import { FraudDetectionService } from '../../services/crypto/fraud-detection.service';
import { TransactionWebSocketService } from '../../services/crypto/transaction-websocket.service';

// Utility function to handle errors safely
function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

export class CryptoTransactionController {
  private transactionService: CryptoTransactionService;
  private refundService: RefundService;

  constructor(
    databaseService: DatabaseService = new DatabaseService(),
    conversionService: ConversionService = new ConversionService(),
    fraudDetectionService?: FraudDetectionService,
    websocketService?: TransactionWebSocketService
  ) {
    this.refundService = new RefundService(
      databaseService, 
      websocketService || new TransactionWebSocketService(),
      fraudDetectionService || new FraudDetectionService(databaseService)
    );
    this.transactionService = new CryptoTransactionService(
      databaseService,
      conversionService,
      fraudDetectionService || new FraudDetectionService(databaseService),
      this.refundService,
      websocketService || new TransactionWebSocketService()
    );
  }

  // POST /api/v1/crypto/transactions/process
  static processValidation = [
    body('transactionId').isUUID().withMessage('Valid transaction ID required'),
    body('cardId').isUUID().withMessage('Valid card ID required'),
    body('networkType').isIn(['BTC', 'ETH', 'USDT', 'USDC', 'XRP']).withMessage('Valid network type required'),
    body('amount').isDecimal({ decimal_digits: '0,8' }).withMessage('Valid amount required'),
    body('fromAddress').isLength({ min: 26, max: 128 }).withMessage('Valid from address required'),
    body('toAddress').isLength({ min: 26, max: 128 }).withMessage('Valid to address required'),
    body('blockchainTxHash').isLength({ min: 64, max: 128 }).withMessage('Valid blockchain hash required')
  ];

  async processTransaction(req: Request, res: Response): Promise<void> {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        res.status(400).json({
          success: false,
          error: 'Validation failed',
          details: errors.array()
        });
        return;
      }

      const { transactionId, cardId, networkType, amount, fromAddress, toAddress, blockchainTxHash } = req.body;

      const processing = await this.transactionService.processTransaction({
        transactionId,
        cardId,
        networkType,
        amount,
        fromAddress,
        toAddress,
        blockchainTxHash
      });

      res.status(201).json({
        success: true,
        data: {
          processingId: processing.processingId,
          status: processing.status,
          estimatedCompletion: processing.estimatedCompletion,
          requiredConfirmations: processing.requiredConfirmations,
          networkFeeEstimate: processing.networkFeeEstimate
        }
      });
    } catch (error) {
      const errorMessage = getErrorMessage(error);
      logger.error('Error processing crypto transaction', {
        error: errorMessage,
        transactionId: req.body?.transactionId
      });

      if (errorMessage.includes('fraud') || errorMessage.includes('blocked')) {
        res.status(403).json({
          success: false,
          error: 'Transaction blocked by security validation'
        });
      } else {
        res.status(500).json({
          success: false,
          error: 'Failed to process transaction'
        });
      }
    }
  }

  // GET /api/v1/crypto/transactions/status/:transactionId
  static statusValidation = [
    param('transactionId').isUUID().withMessage('Valid transaction ID required'),
    query('cardId').isUUID().withMessage('Valid card ID required')
  ];

  async getTransactionStatus(req: Request, res: Response): Promise<void> {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        res.status(400).json({
          success: false,
          error: 'Validation failed',
          details: errors.array()
        });
        return;
      }

      const { transactionId } = req.params;
      const { cardId } = req.query;

      const processing = await this.transactionService.getTransactionStatus(
        transactionId, 
        cardId as string
      );

      if (!processing) {
        res.status(404).json({
          success: false,
          error: 'Transaction not found'
        });
        return;
      }

      res.json({
        success: true,
        data: {
          processingId: processing.processingId,
          transactionId: processing.transactionId,
          status: processing.status,
          confirmationCount: processing.confirmationCount,
          requiredConfirmations: processing.requiredConfirmations,
          estimatedCompletion: processing.estimatedCompletion,
          networkType: processing.networkType,
          accelerationOptions: processing.accelerationOptions,
          createdAt: processing.createdAt,
          completedAt: processing.completedAt
        }
      });
    } catch (error) {
      logger.error('Error getting transaction status', {
        error: getErrorMessage(error),
        transactionId: req.params.transactionId
      });

      res.status(500).json({
        success: false,
        error: 'Failed to get transaction status'
      });
    }
  }

  // GET /api/v1/crypto/transactions/history
  static historyValidation = [
    query('cardId').isUUID().withMessage('Valid card ID required'),
    query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'),
    query('offset').optional().isInt({ min: 0 }).withMessage('Offset must be non-negative')
  ];

  async getTransactionHistory(req: Request, res: Response): Promise<void> {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        res.status(400).json({
          success: false,
          error: 'Validation failed',
          details: errors.array()
        });
        return;
      }

      const { cardId, limit = 50, offset = 0 } = req.query;

      const transactions = await this.transactionService.getTransactionHistory(
        cardId as string,
        parseInt(limit as string),
        parseInt(offset as string)
      );

      res.json({
        success: true,
        data: {
          transactions: transactions.map(tx => ({
            processingId: tx.processingId,
            transactionId: tx.transactionId,
            status: tx.status,
            confirmationCount: tx.confirmationCount,
            requiredConfirmations: tx.requiredConfirmations,
            networkFeeEstimate: tx.networkFeeEstimate,
            estimatedCompletion: tx.estimatedCompletion,
            networkType: tx.networkType,
            createdAt: tx.createdAt,
            completedAt: tx.completedAt
          })),
          pagination: {
            limit: parseInt(limit as string),
            offset: parseInt(offset as string),
            hasMore: transactions.length === parseInt(limit as string)
          }
        }
      });
    } catch (error) {
      logger.error('Error getting transaction history', {
        error: getErrorMessage(error),
        cardId: req.query.cardId
      });

      res.status(500).json({
        success: false,
        error: 'Failed to get transaction history'
      });
    }
  }

  // POST /api/v1/crypto/transactions/refund/:transactionId
  static refundValidation = [
    param('transactionId').isUUID().withMessage('Valid transaction ID required'),
    body('cardId').isUUID().withMessage('Valid card ID required'),
    body('reason').isLength({ min: 1, max: 500 }).withMessage('Refund reason required (max 500 characters)'),
    body('refundAddress').isLength({ min: 26, max: 128 }).withMessage('Valid refund address required'),
    body('amount').optional().isDecimal({ decimal_digits: '0,8' }).withMessage('Valid refund amount if provided')
  ];

  async processRefund(req: Request, res: Response): Promise<void> {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        res.status(400).json({
          success: false,
          error: 'Validation failed',
          details: errors.array()
        });
        return;
      }

      const { transactionId } = req.params;
      const { cardId, reason, refundAddress, amount } = req.body;

      const refund = await this.refundService.processRefund({
        transactionId,
        cardId,
        reason,
        refundAddress,
        amount
      });

      res.status(201).json({
        success: true,
        data: {
          refundId: refund.refundId,
          originalTransactionId: refund.originalTransactionId,
          refundAmount: refund.refundAmount,
          status: refund.status,
          reason: refund.reason,
          createdAt: refund.createdAt
        }
      });
    } catch (error) {
      logger.error('Error processing refund', {
        error: getErrorMessage(error),
        transactionId: req.params.transactionId
      });

      if (getErrorMessage(error).includes('not found') || getErrorMessage(error).includes('Cannot refund')) {
        res.status(400).json({
          success: false,
          error: getErrorMessage(error)
        });
      } else {
        res.status(500).json({
          success: false,
          error: 'Failed to process refund'
        });
      }
    }
  }

  // POST /api/v1/crypto/transactions/accelerate/:transactionId
  static accelerateValidation = [
    param('transactionId').isUUID().withMessage('Valid transaction ID required'),
    body('cardId').isUUID().withMessage('Valid card ID required')
  ];

  async accelerateTransaction(req: Request, res: Response): Promise<void> {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        res.status(400).json({
          success: false,
          error: 'Validation failed',
          details: errors.array()
        });
        return;
      }

      // First get the processing ID from transaction ID
      const { transactionId } = req.params;
      const { cardId } = req.body;

      const processing = await this.transactionService.getTransactionStatus(transactionId, cardId);
      if (!processing) {
        res.status(404).json({
          success: false,
          error: 'Transaction not found'
        });
        return;
      }

      const accelerationOptions = await this.transactionService.accelerateTransaction(
        processing.processingId,
        cardId
      );

      if (accelerationOptions.length === 0) {
        res.status(400).json({
          success: false,
          error: 'Transaction acceleration not available'
        });
        return;
      }

      res.json({
        success: true,
        data: {
          accelerationOptions,
          currentStatus: processing.status,
          estimatedCompletion: processing.estimatedCompletion
        }
      });
    } catch (error) {
      logger.error('Error accelerating transaction', {
        error: getErrorMessage(error),
        transactionId: req.params.transactionId
      });

      if (getErrorMessage(error).includes('not found') || getErrorMessage(error).includes('cannot be accelerated')) {
        res.status(400).json({
          success: false,
          error: getErrorMessage(error)
        });
      } else {
        res.status(500).json({
          success: false,
          error: 'Failed to accelerate transaction'
        });
      }
    }
  }

  // GET /api/v1/crypto/transactions/refund/:refundId/status
  static refundStatusValidation = [
    param('refundId').isUUID().withMessage('Valid refund ID required'),
    query('cardId').isUUID().withMessage('Valid card ID required')
  ];

  async getRefundStatus(req: Request, res: Response): Promise<void> {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        res.status(400).json({
          success: false,
          error: 'Validation failed',
          details: errors.array()
        });
        return;
      }

      const { refundId } = req.params;
      const { cardId } = req.query;

      const refund = await this.refundService.getRefundStatus(refundId, cardId as string);

      if (!refund) {
        res.status(404).json({
          success: false,
          error: 'Refund not found'
        });
        return;
      }

      res.json({
        success: true,
        data: {
          refundId: refund.refundId,
          originalTransactionId: refund.originalTransactionId,
          refundAmount: refund.refundAmount,
          status: refund.status,
          reason: refund.reason,
          blockchainRefundHash: refund.blockchainRefundHash,
          processedAt: refund.processedAt,
          completedAt: refund.completedAt,
          createdAt: refund.createdAt
        }
      });
    } catch (error) {
      logger.error('Error getting refund status', {
        error: getErrorMessage(error),
        refundId: req.params.refundId
      });

      res.status(500).json({
        success: false,
        error: 'Failed to get refund status'
      });
    }
  }
}