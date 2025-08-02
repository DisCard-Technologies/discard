import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { authController } from './auth.controller';
import { authenticateToken } from '../../middleware/auth';

const router = Router();

// Rate limiting for authentication endpoints
const authRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // Limit each IP to 5 requests per windowMs for auth endpoints
  message: {
    success: false,
    error: 'Too many authentication attempts, please try again later'
  },
  standardHeaders: true,
  legacyHeaders: false,
});

const generalRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes  
  max: 100, // Limit each IP to 100 requests per windowMs for general endpoints
  message: {
    success: false,
    error: 'Too many requests, please try again later'
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Apply rate limiting to sensitive auth endpoints
const sensitiveAuthEndpoints = ['/login', '/register', '/forgot-password', '/reset-password'];

// Health check endpoint
router.get('/health', generalRateLimit, authController.healthCheck.bind(authController));

// Authentication endpoints with rate limiting
router.post('/register', authRateLimit, authController.register.bind(authController));
router.post('/login', authRateLimit, authController.login.bind(authController));
router.post('/verify-email', generalRateLimit, authController.verifyEmail.bind(authController));
router.post('/refresh-token', generalRateLimit, authController.refreshToken.bind(authController));
router.post('/forgot-password', authRateLimit, authController.forgotPassword.bind(authController));
router.post('/reset-password', authRateLimit, authController.resetPassword.bind(authController));

// TOTP 2FA endpoints (require authentication)
router.post('/totp/setup', authenticateToken, generalRateLimit, authController.setupTOTP.bind(authController));
router.post('/totp/verify', authenticateToken, generalRateLimit, authController.verifyTOTP.bind(authController));
router.post('/totp/disable', authenticateToken, authRateLimit, authController.disableTOTP.bind(authController));
router.get('/totp/status', authenticateToken, generalRateLimit, authController.getTOTPStatus.bind(authController));
router.post('/totp/backup-codes', authenticateToken, authRateLimit, authController.generateBackupCodes.bind(authController));

export default router;