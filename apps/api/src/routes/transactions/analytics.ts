import { Router } from 'express';
import { transactionAnalyticsController } from '../../controllers/transactions/transaction-analytics.controller';
import { authenticateUser } from '../../middleware/auth';
import { validateCardAccess } from '../../middleware/card-access';

const router = Router();

/**
 * GET /api/v1/cards/:cardId/analytics
 * Get privacy-preserving spending analytics for a specific card
 */
router.get('/cards/:cardId/analytics', 
  authenticateUser, 
  validateCardAccess,
  transactionAnalyticsController.getCardAnalytics
);

export default router;