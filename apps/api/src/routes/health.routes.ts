import { Router } from 'express';
import { HealthController } from '../controllers/health.controller';
import { rateLimitMiddleware } from '../middleware/rate-limiting.middleware';

const router = Router();
const healthController = new HealthController();

// Basic health check - minimal rate limiting for load balancers
router.get('/health', 
  rateLimitMiddleware({
    windowMs: 60 * 1000, // 1 minute
    max: 60, // 60 requests per minute
    message: 'Too many health check requests',
    prefix: 'health:basic:'
  }),
  healthController.basicHealth.bind(healthController)
);

// Comprehensive health check - more restrictive rate limiting
router.get('/health/comprehensive',
  rateLimitMiddleware({
    windowMs: 60 * 1000, // 1 minute
    max: 10, // 10 requests per minute
    message: 'Too many comprehensive health check requests',
    prefix: 'health:comprehensive:'
  }),
  healthController.comprehensiveHealth.bind(healthController)
);

// Kubernetes readiness probe
router.get('/health/ready',
  rateLimitMiddleware({
    windowMs: 60 * 1000, // 1 minute
    max: 60, // 60 requests per minute
    message: 'Too many readiness probe requests',
    prefix: 'health:ready:'
  }),
  healthController.readiness.bind(healthController)
);

// Kubernetes liveness probe
router.get('/health/live',
  rateLimitMiddleware({
    windowMs: 60 * 1000, // 1 minute
    max: 60, // 60 requests per minute
    message: 'Too many liveness probe requests',
    prefix: 'health:live:'
  }),
  healthController.liveness.bind(healthController)
);

// Service-specific health checks
router.get('/health/fraud-detection',
  rateLimitMiddleware({
    windowMs: 60 * 1000, // 1 minute
    max: 20, // 20 requests per minute
    message: 'Too many fraud detection health check requests',
    prefix: 'health:fraud:'
  }),
  healthController.fraudDetectionHealth.bind(healthController)
);

// Circuit breakers status
router.get('/health/circuit-breakers',
  rateLimitMiddleware({
    windowMs: 60 * 1000, // 1 minute
    max: 30, // 30 requests per minute
    message: 'Too many circuit breaker status requests',
    prefix: 'health:circuit_breakers:'
  }),
  healthController.circuitBreakersStatus.bind(healthController)
);

export default router;