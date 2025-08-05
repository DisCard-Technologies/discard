import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { fundingController } from './funding.controller';
import { authenticateToken } from '../../middleware/auth';

const router = Router();

// Rate limiting for funding operations
const fundingRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 50, // 50 requests per window per IP
  message: {
    success: false,
    error: 'Too many funding requests, please try again later'
  },
  standardHeaders: true,
  legacyHeaders: false,
});

const accountFundingRateLimit = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10, // 10 account funding attempts per hour per IP
  message: {
    success: false,
    error: 'Too many account funding attempts, please try again later'
  },
  standardHeaders: true,
  legacyHeaders: false,
});

const allocationRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20, // 20 allocations per window per IP
  message: {
    success: false,
    error: 'Too many allocation attempts, please try again later'
  },
  standardHeaders: true,
  legacyHeaders: false,
});

const transferRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 30, // 30 transfers per window per IP
  message: {
    success: false,
    error: 'Too many transfer attempts, please try again later'
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Health check endpoint (no auth required)
router.get('/health', fundingRateLimit, fundingController.healthCheck.bind(fundingController));

// Stripe webhook endpoint (no auth required, but signature verified)
router.post('/webhooks/stripe', fundingController.handleStripeWebhook.bind(fundingController));

// All other funding endpoints require authentication
router.use(authenticateToken);

// Account funding endpoint
router.post('/account', 
  accountFundingRateLimit, 
  fundingController.fundAccount.bind(fundingController)
);

// Card allocation endpoint
router.post('/card/:cardId', 
  allocationRateLimit, 
  fundingController.allocateToCard.bind(fundingController)
);

// Card transfer endpoint
router.post('/transfer', 
  transferRateLimit, 
  fundingController.transferBetweenCards.bind(fundingController)
);

// Balance inquiry endpoint
router.get('/balance', 
  fundingRateLimit, 
  fundingController.getBalance.bind(fundingController)
);

// Funding transactions history endpoint
router.get('/transactions', 
  fundingRateLimit, 
  fundingController.getFundingTransactions.bind(fundingController)
);

// Notification thresholds management endpoint
router.put('/notifications', 
  fundingRateLimit, 
  fundingController.updateNotificationThresholds.bind(fundingController)
);

export default router;