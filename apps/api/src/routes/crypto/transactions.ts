import { Router } from 'express';
import { CryptoTransactionController } from '../../controllers/crypto/transaction.controller';
import { authMiddleware } from '../../middleware/auth.middleware';
import { rateLimitMiddleware, transactionRateLimitMiddleware } from '../../middleware/rate-limit.middleware';
import { DatabaseService } from '../../services/database.service';
import { ConversionService } from '../../services/crypto/conversion.service';
import { FraudDetectionService } from '../../services/crypto/fraud-detection.service';
import { TransactionWebSocketService } from '../../services/crypto/transaction-websocket.service';

const router = Router();

// Initialize services
const databaseService = new DatabaseService();
const conversionService = new ConversionService();
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
  transactionRateLimitMiddleware,
  CryptoTransactionController.processValidation,
  transactionController.processTransaction.bind(transactionController)
);

// GET /crypto/transactions/status/:transactionId - Get transaction status
router.get(
  '/status/:transactionId',
  rateLimitMiddleware,
  CryptoTransactionController.statusValidation,
  transactionController.getTransactionStatus.bind(transactionController)
);

// GET /crypto/transactions/history - Get transaction history
router.get(
  '/history',
  rateLimitMiddleware,
  CryptoTransactionController.historyValidation,
  transactionController.getTransactionHistory.bind(transactionController)
);

// POST /crypto/transactions/refund/:transactionId - Process refund
router.post(
  '/refund/:transactionId',
  rateLimitMiddleware,
  CryptoTransactionController.refundValidation,
  transactionController.processRefund.bind(transactionController)
);

// POST /crypto/transactions/accelerate/:transactionId - Accelerate transaction
router.post(
  '/accelerate/:transactionId',
  rateLimitMiddleware,
  CryptoTransactionController.accelerateValidation,
  transactionController.accelerateTransaction.bind(transactionController)
);

// GET /crypto/transactions/refund/:refundId/status - Get refund status
router.get(
  '/refund/:refundId/status',
  rateLimitMiddleware,
  CryptoTransactionController.refundStatusValidation,
  transactionController.getRefundStatus.bind(transactionController)
);

export { router as cryptoTransactionsRouter };