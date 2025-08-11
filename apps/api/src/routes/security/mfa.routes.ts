import { Router } from 'express';
import { MFAController } from '../../controllers/security/mfa.controller';
import { authMiddleware } from '../../middleware/auth.middleware';
import { rateLimitMiddleware } from '../../middleware/rate-limiting.middleware';
import { validateCardAccess } from '../../middleware/validation.middleware';

const router = Router();
const mfaController = new MFAController();

// Apply authentication to all routes
router.use(authMiddleware);

// MFA setup endpoints
router.post('/:cardId/setup',
  validateCardAccess,
  rateLimitMiddleware({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 5, // Limit setup attempts
    message: 'Too many MFA setup requests'
  }),
  mfaController.setupMFA.bind(mfaController)
);

router.post('/:cardId/verify-setup',
  validateCardAccess,
  rateLimitMiddleware({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 10, // Allow multiple verification attempts
    message: 'Too many verification attempts'
  }),
  mfaController.verifySetup.bind(mfaController)
);

// MFA challenge and verification endpoints
router.post('/:cardId/challenge',
  validateCardAccess,
  rateLimitMiddleware({
    windowMs: 5 * 60 * 1000, // 5 minutes
    max: 20, // Allow reasonable challenge requests
    message: 'Too many challenge requests'
  }),
  mfaController.createChallenge.bind(mfaController)
);

router.post('/:cardId/verify',
  validateCardAccess,
  rateLimitMiddleware({
    windowMs: 5 * 60 * 1000, // 5 minutes
    max: 15, // Limit verification attempts to prevent brute force
    message: 'Too many verification attempts'
  }),
  mfaController.verifyChallenge.bind(mfaController)
);

// MFA configuration endpoints
router.get('/:cardId/config',
  validateCardAccess,
  mfaController.getConfiguration.bind(mfaController)
);

router.put('/:cardId/config',
  validateCardAccess,
  rateLimitMiddleware({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 10, // Limit configuration changes
    message: 'Too many configuration updates'
  }),
  mfaController.updateConfiguration.bind(mfaController)
);

// MFA management endpoints
router.post('/:cardId/disable',
  validateCardAccess,
  rateLimitMiddleware({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 3, // Very limited disable attempts
    message: 'Too many disable attempts'
  }),
  mfaController.disableMFA.bind(mfaController)
);

// Risk assessment endpoint
router.post('/:cardId/assess-risk',
  validateCardAccess,
  rateLimitMiddleware({
    windowMs: 5 * 60 * 1000, // 5 minutes
    max: 50, // Allow frequent risk assessments
    message: 'Too many risk assessment requests'
  }),
  mfaController.assessRisk.bind(mfaController)
);

export { router as mfaRoutes };