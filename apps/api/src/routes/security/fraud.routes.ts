import { Router } from 'express';
import { FraudController } from '../../controllers/security/fraud.controller';
import { authMiddleware } from '../../middleware/auth.middleware';
import { rateLimitMiddleware } from '../../middleware/rate-limiting.middleware';
import { validateCardAccess } from '../../middleware/validation.middleware';

const router = Router();
const fraudController = new FraudController();

// Apply authentication and rate limiting to all routes
router.use(authMiddleware);
router.use(rateLimitMiddleware({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  message: 'Too many security requests from this IP'
}));

// Fraud status and analysis endpoints
router.get('/status/:cardId', 
  validateCardAccess,
  fraudController.getFraudStatus.bind(fraudController)
);

router.post('/analyze',
  rateLimitMiddleware({
    windowMs: 5 * 60 * 1000, // 5 minutes
    max: 20, // Limit analysis requests
    message: 'Too many analysis requests'
  }),
  fraudController.analyzeTransaction.bind(fraudController)
);

// Card control endpoints
router.post('/cards/:cardId/freeze',
  validateCardAccess,
  rateLimitMiddleware({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 10, // Limit freeze requests
    message: 'Too many freeze requests'
  }),
  fraudController.freezeCard.bind(fraudController)
);

router.post('/cards/:cardId/unfreeze',
  validateCardAccess,
  rateLimitMiddleware({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 10, // Limit unfreeze requests
    message: 'Too many unfreeze requests'
  }),
  fraudController.unfreezeCard.bind(fraudController)
);

// Feedback and incident endpoints
router.post('/feedback',
  rateLimitMiddleware({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 50, // Allow reasonable feedback volume
    message: 'Too many feedback submissions'
  }),
  fraudController.submitFeedback.bind(fraudController)
);

router.get('/incidents/:cardId',
  validateCardAccess,
  fraudController.getSecurityIncidents.bind(fraudController)
);

// Notification endpoints
router.get('/notifications/:cardId',
  validateCardAccess,
  fraudController.getSecurityNotifications.bind(fraudController)
);

router.put('/notifications/:cardId/:notificationId/read',
  validateCardAccess,
  fraudController.markNotificationRead.bind(fraudController)
);

router.get('/notifications/:cardId/preferences',
  validateCardAccess,
  fraudController.getNotificationPreferences.bind(fraudController)
);

router.put('/notifications/:cardId/preferences',
  validateCardAccess,
  rateLimitMiddleware({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 20, // Limit preference updates
    message: 'Too many preference updates'
  }),
  fraudController.updateNotificationPreferences.bind(fraudController)
);

// Model performance endpoint (admin/monitoring)
router.get('/model/performance',
  rateLimitMiddleware({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 60, // Allow frequent monitoring
    message: 'Too many performance requests'
  }),
  fraudController.getModelPerformance.bind(fraudController)
);

export { router as fraudRoutes };