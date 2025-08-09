import { Router } from 'express';
import { transactionHistoryController } from '../../controllers/transactions/transaction-history.controller';
import { transactionSearchController } from '../../controllers/transactions/transaction-search.controller';
import { transactionAnalyticsController } from '../../controllers/transactions/transaction-analytics.controller';
import { authMiddleware } from '../../middleware/auth.middleware';
import rateLimit from 'express-rate-limit';

const router = Router();

// Rate limiting for transaction history endpoints
const transactionRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});

// Apply authentication and rate limiting to all routes
router.use(authMiddleware);
router.use(transactionRateLimit);

// Card-specific transaction history
router.get('/cards/:cardId/transactions', transactionHistoryController.getCardTransactions);

// Transaction search within card context
router.get('/cards/:cardId/transactions/search', transactionSearchController.searchTransactions);

// Card analytics
router.get('/cards/:cardId/analytics', transactionAnalyticsController.getCardAnalytics);

// Individual transaction details
router.get('/transactions/:transactionId', transactionHistoryController.getTransactionDetail);

export default router;