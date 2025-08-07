import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { cryptoController } from './crypto.controller';
import { authenticateToken } from '../../middleware/auth';
import { rateLimitingMiddleware } from '../../middleware/rate-limiting.middleware';

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

// WalletConnect specific routes

/**
 * POST /api/v1/crypto/wallets/walletconnect/propose
 * Create WalletConnect session proposal
 */
router.post('/wallets/walletconnect/propose',
  walletConnectionRateLimit,
  async (req, res) => {
    await cryptoController.createWalletConnectProposal(req, res);
  }
);

/**
 * POST /api/v1/crypto/wallets/walletconnect/approve
 * Approve WalletConnect session proposal
 */
router.post('/wallets/walletconnect/approve',
  walletConnectionRateLimit,
  async (req, res) => {
    await cryptoController.approveWalletConnectProposal(req, res);
  }
);

/**
 * POST /api/v1/crypto/wallets/walletconnect/reject
 * Reject WalletConnect session proposal
 */
router.post('/wallets/walletconnect/reject',
  async (req, res) => {
    await cryptoController.rejectWalletConnectProposal(req, res);
  }
);

/**
 * POST /api/v1/crypto/wallets/walletconnect/disconnect
 * Disconnect WalletConnect session
 */
router.post('/wallets/walletconnect/disconnect',
  async (req, res) => {
    await cryptoController.disconnectWalletConnectSession(req, res);
  }
);

/**
 * GET /api/v1/crypto/wallets/walletconnect/sessions
 * Get active WalletConnect sessions
 */
router.get('/wallets/walletconnect/sessions',
  async (req, res) => {
    await cryptoController.getWalletConnectSessions(req, res);
  }
);

/**
 * POST /api/v1/crypto/wallets/walletconnect/cleanup
 * Cleanup expired WalletConnect sessions
 */
router.post('/wallets/walletconnect/cleanup',
  async (req, res) => {
    await cryptoController.cleanupWalletConnectSessions(req, res);
  }
);

// MetaMask specific routes

/**
 * GET /api/v1/crypto/wallets/metamask/availability
 * Check MetaMask availability
 */
router.get('/wallets/metamask/availability',
  async (req, res) => {
    await cryptoController.checkMetaMaskAvailability(req, res);
  }
);

/**
 * POST /api/v1/crypto/wallets/metamask/connect
 * Connect MetaMask wallet
 */
router.post('/wallets/metamask/connect',
  walletConnectionRateLimit,
  async (req, res) => {
    await cryptoController.connectMetaMask(req, res);
  }
);

/**
 * POST /api/v1/crypto/wallets/metamask/disconnect
 * Disconnect MetaMask wallet
 */
router.post('/wallets/metamask/disconnect',
  async (req, res) => {
    await cryptoController.disconnectMetaMask(req, res);
  }
);

/**
 * GET /api/v1/crypto/wallets/metamask/connections
 * Get active MetaMask connections
 */
router.get('/wallets/metamask/connections',
  async (req, res) => {
    await cryptoController.getMetaMaskConnections(req, res);
  }
);

/**
 * POST /api/v1/crypto/wallets/metamask/transaction
 * Send transaction through MetaMask
 */
router.post('/wallets/metamask/transaction',
  balanceCheckRateLimit, // Use balance check rate limit for transactions
  async (req, res) => {
    await cryptoController.sendMetaMaskTransaction(req, res);
  }
);

/**
 * POST /api/v1/crypto/wallets/metamask/sign
 * Sign message with MetaMask
 */
router.post('/wallets/metamask/sign',
  async (req, res) => {
    await cryptoController.signMetaMaskMessage(req, res);
  }
);

/**
 * POST /api/v1/crypto/wallets/metamask/switch-chain
 * Switch Ethereum chain in MetaMask
 */
router.post('/wallets/metamask/switch-chain',
  async (req, res) => {
    await cryptoController.switchMetaMaskChain(req, res);
  }
);

/**
 * POST /api/v1/crypto/wallets/metamask/cleanup
 * Cleanup expired MetaMask connections
 */
router.post('/wallets/metamask/cleanup',
  async (req, res) => {
    await cryptoController.cleanupMetaMaskConnections(req, res);
  }
);

// Bitcoin specific routes

/**
 * POST /api/v1/crypto/wallets/bitcoin/connect
 * Connect Bitcoin wallet by importing address
 */
router.post('/wallets/bitcoin/connect',
  walletConnectionRateLimit,
  async (req, res) => {
    await cryptoController.connectBitcoinWallet(req, res);
  }
);

/**
 * GET /api/v1/crypto/wallets/bitcoin/list
 * Get Bitcoin wallets for user
 */
router.get('/wallets/bitcoin/list',
  async (req, res) => {
    await cryptoController.getBitcoinWallets(req, res);
  }
);

/**
 * POST /api/v1/crypto/wallets/bitcoin/disconnect
 * Disconnect Bitcoin wallet
 */
router.post('/wallets/bitcoin/disconnect',
  async (req, res) => {
    await cryptoController.disconnectBitcoinWallet(req, res);
  }
);

/**
 * GET /api/v1/crypto/wallets/bitcoin/balance/:walletId
 * Get Bitcoin wallet balance
 */
router.get('/wallets/bitcoin/balance/:walletId',
  balanceCheckRateLimit,
  async (req, res) => {
    await cryptoController.getBitcoinWalletBalance(req, res);
  }
);

/**
 * POST /api/v1/crypto/wallets/bitcoin/qr-code
 * Generate Bitcoin address QR code
 */
router.post('/wallets/bitcoin/qr-code',
  async (req, res) => {
    await cryptoController.generateBitcoinQRCode(req, res);
  }
);

/**
 * POST /api/v1/crypto/wallets/bitcoin/transaction/create
 * Create Bitcoin transaction (unsigned)
 */
router.post('/wallets/bitcoin/transaction/create',
  balanceCheckRateLimit, // Use balance check rate limit for transactions
  async (req, res) => {
    await cryptoController.createBitcoinTransaction(req, res);
  }
);

/**
 * POST /api/v1/crypto/wallets/bitcoin/transaction/broadcast
 * Broadcast Bitcoin transaction
 */
router.post('/wallets/bitcoin/transaction/broadcast',
  balanceCheckRateLimit, // Use balance check rate limit for broadcasts
  async (req, res) => {
    await cryptoController.broadcastBitcoinTransaction(req, res);
  }
);

/**
 * GET /api/v1/crypto/wallets/bitcoin/fees
 * Get Bitcoin transaction fees
 */
router.get('/wallets/bitcoin/fees',
  async (req, res) => {
    await cryptoController.getBitcoinTransactionFees(req, res);
  }
);

/**
 * POST /api/v1/crypto/wallets/bitcoin/validate
 * Validate Bitcoin address
 */
router.post('/wallets/bitcoin/validate',
  async (req, res) => {
    await cryptoController.validateBitcoinAddress(req, res);
  }
);

/**
 * GET /api/v1/crypto/rates
 * Get current conversion rates
 */
router.get('/rates',
  rateLimitingMiddleware.cryptoRates,
  async (req, res) => {
    await cryptoController.getCurrentRates(req, res);
  }
);

/**
 * GET /api/v1/crypto/rates/conversion-calculator
 * Calculate exact amounts for funding
 */
router.get('/rates/conversion-calculator',
  rateLimitingMiddleware.conversionCalculator,
  async (req, res) => {
    await cryptoController.calculateConversion(req, res);
  }
);

/**
 * GET /api/v1/crypto/rates/comparison
 * Compare rates across multiple cryptocurrencies
 */
router.get('/rates/comparison',
  rateLimitingMiddleware.cryptoRates,
  async (req, res) => {
    await cryptoController.compareRates(req, res);
  }
);

/**
 * GET /api/v1/crypto/rates/historical
 * Get historical price data for trend analysis
 */
router.get('/rates/historical',
  rateLimitingMiddleware.historicalRates,
  async (req, res) => {
    await cryptoController.getHistoricalRates(req, res);
  }
);

/**
 * GET /api/v1/crypto/wallets/bitcoin/qr-code/:address
 * Generate QR code for Bitcoin address (GET version)
 */
router.get('/wallets/bitcoin/qr-code/:address',
  async (req, res) => {
    const { address } = req.params;
    req.body = { address }; // Convert param to body format
    await cryptoController.generateBitcoinQRCode(req, res);
  }
);

export default router;