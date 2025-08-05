import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { cryptoController } from './crypto.controller';
import { authenticateToken } from '../../middleware/auth';

const router = Router();

// Rate limiting for crypto operations
const cryptoRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // 100 requests per window per IP
  message: {
    success: false,
    error: 'Too many crypto requests, please try again later'
  },
  standardHeaders: true,
  legacyHeaders: false,
});

const walletConnectionRateLimit = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10, // 10 wallet connection attempts per hour per IP
  message: {
    success: false,
    error: 'Too many wallet connection attempts, please try again later'
  },
  standardHeaders: true,
  legacyHeaders: false,
});

const balanceCheckRateLimit = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 20, // 20 balance checks per minute per IP
  message: {
    success: false,
    error: 'Too many balance check requests, please try again later'
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Apply authentication to all crypto routes
router.use(authenticateToken);

// Apply general rate limiting to all crypto routes
router.use(cryptoRateLimit);

/**
 * POST /api/v1/crypto/wallets/connect
 * Connect a new cryptocurrency wallet
 */
router.post('/wallets/connect', 
  walletConnectionRateLimit,
  async (req, res) => {
    await cryptoController.connectWallet(req, res);
  }
);

/**
 * GET /api/v1/crypto/wallets
 * Get list of connected wallets
 */
router.get('/wallets', 
  async (req, res) => {
    await cryptoController.getWallets(req, res);
  }
);

/**
 * DELETE /api/v1/crypto/wallets/:walletId
 * Disconnect a wallet
 */
router.delete('/wallets/:walletId', 
  async (req, res) => {
    await cryptoController.disconnectWallet(req, res);
  }
);

/**
 * GET /api/v1/crypto/wallets/:walletId/balance
 * Get real-time wallet balance
 */
router.get('/wallets/:walletId/balance', 
  balanceCheckRateLimit,
  async (req, res) => {
    await cryptoController.getWalletBalance(req, res);
  }
);

export default router;