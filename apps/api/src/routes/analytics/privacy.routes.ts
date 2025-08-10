import { Router } from 'express';
import {
  getPrivateAnalytics,
  getPrivacyBudgetStatus,
  getAggregateSpending,
  getTransactionVolume,
  getMerchantCategories,
  checkInferenceRisk
} from '../../controllers/analytics/privacy-analytics.controller';
import {
  addPrivacyHeaders,
  rateLimitByContext
} from '../../middleware/isolation.middleware';

const router = Router();

// Apply privacy headers to all routes
router.use(addPrivacyHeaders);

// Apply context-specific rate limiting
router.use(rateLimitByContext);

// Privacy-preserving analytics endpoints
router.get('/private', getPrivateAnalytics);
router.get('/budget', getPrivacyBudgetStatus);
router.get('/aggregate-spending', getAggregateSpending);
router.get('/transaction-volume', getTransactionVolume);
router.get('/merchant-categories', getMerchantCategories);
router.get('/inference-check', checkInferenceRisk);

export default router;