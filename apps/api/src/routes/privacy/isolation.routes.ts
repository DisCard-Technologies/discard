import { Router } from 'express';
import {
  verifyIsolation,
  getIsolationMetrics,
  detectCorrelations,
  switchContext,
  generateComplianceReport,
  monitorAccess,
  getPrivacyViolations,
  startMonitoring
} from '../../controllers/privacy/isolation.controller';
import {
  enforceIsolation,
  verifyIsolation as verifyIsolationMiddleware,
  logAccessPattern,
  preventCrossCardAccess,
  addPrivacyHeaders,
  rateLimitByContext
} from '../../middleware/isolation.middleware';

const router = Router();

// Apply privacy headers to all routes
router.use(addPrivacyHeaders);

// Apply rate limiting by context
router.use(rateLimitByContext);

// Log all access patterns for correlation detection
router.use(logAccessPattern);

// Isolation verification endpoints
router.get('/verify/:cardId', 
  enforceIsolation,
  verifyIsolationMiddleware,
  preventCrossCardAccess,
  verifyIsolation
);

router.get('/metrics', 
  getIsolationMetrics
);

router.get('/correlations/detect', 
  detectCorrelations
);

router.post('/switch-context', 
  switchContext
);

// Compliance and monitoring endpoints
router.get('/compliance/report', 
  generateComplianceReport
);

router.post('/internal-access/authorize', 
  monitorAccess
);

router.get('/violations', 
  getPrivacyViolations
);

router.post('/monitoring/start', 
  startMonitoring
);

export default router;