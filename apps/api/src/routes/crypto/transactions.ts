import { Router } from 'express';
import { CryptoTransactionController } from '../../controllers/crypto/transaction.controller';
import { authMiddleware } from '../../middleware/auth.middleware';
import { rateLimitMiddleware } from '../../middleware/rate-limit.middleware';
import { DatabaseService } from '../../services/database.service';
import { ConversionService } from '../../services/crypto/conversion.service';
import { FraudDetectionService } from '../../services/crypto/fraud-detection.service';
import { TransactionWebSocketService } from '../../services/crypto/transaction-websocket.service';

const router = Router();

// Initialize services
const databaseService = new DatabaseService();
const conversionService = new ConversionService(databaseService);
const fraudDetectionService = new FraudDetectionService(databaseService);
const websocketService = new TransactionWebSocketService();

// Initialize controller
const transactionController = new CryptoTransactionController(
  databaseService,
  conversionService,
  fraudDetectionService,
  websocketService
);

// Apply authentication to all routes
router.use(authMiddleware);

// POST /crypto/transactions/process - Process new crypto transaction
router.post(
  '/process',
  rateLimitMiddleware({ 
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 10, // limit each IP to 10 transaction processing requests per windowMs
    message: 'Too many transaction processing attempts'
  }),
  CryptoTransactionController.processValidation,
  transactionController.processTransaction.bind(transactionController)
);

// GET /crypto/transactions/status/:transactionId - Get transaction status
router.get(
  '/status/:transactionId',
  rateLimitMiddleware({ 
    windowMs: 1 * 60 * 1000, // 1 minute
    max: 60, // limit each IP to 60 status requests per minute
    message: 'Too many status requests'
  }),
  CryptoTransactionController.statusValidation,
  transactionController.getTransactionStatus.bind(transactionController)
);

// GET /crypto/transactions/history - Get transaction history
router.get(
  '/history',
  rateLimitMiddleware({ 
    windowMs: 1 * 60 * 1000, // 1 minute
    max: 30, // limit each IP to 30 history requests per minute
    message: 'Too many history requests'
  }),
  CryptoTransactionController.historyValidation,
  transactionController.getTransactionHistory.bind(transactionController)
);

// POST /crypto/transactions/refund/:transactionId - Process refund
router.post(
  '/refund/:transactionId',
  rateLimitMiddleware({ 
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 5, // limit each IP to 5 refund requests per hour
    message: 'Too many refund requests'
  }),
  CryptoTransactionController.refundValidation,
  transactionController.processRefund.bind(transactionController)
);

// POST /crypto/transactions/accelerate/:transactionId - Accelerate transaction
router.post(
  '/accelerate/:transactionId',
  rateLimitMiddleware({ 
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 3, // limit each IP to 3 acceleration requests per 15 minutes
    message: 'Too many acceleration requests'
  }),
  CryptoTransactionController.accelerateValidation,
  transactionController.accelerateTransaction.bind(transactionController)
);

// GET /crypto/transactions/refund/:refundId/status - Get refund status
router.get(
  '/refund/:refundId/status',
  rateLimitMiddleware({ 
    windowMs: 1 * 60 * 1000, // 1 minute
    max: 60, // limit each IP to 60 refund status requests per minute
    message: 'Too many refund status requests'
  }),
  CryptoTransactionController.refundStatusValidation,
  transactionController.getRefundStatus.bind(transactionController)
);

export { router as cryptoTransactionsRouter };