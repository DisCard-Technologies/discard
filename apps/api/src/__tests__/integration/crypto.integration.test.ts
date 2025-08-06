import { describe, test, expect, beforeAll, afterAll, beforeEach, afterEach, jest } from '@jest/globals';
import request from 'supertest';
import express from 'express';
import nock from 'nock';
import cryptoRoutes from '../../services/crypto/crypto.routes';
import { authenticateToken } from '../../middleware/auth';

// Create test app
const app = express();
app.use(express.json());

// Mock authentication middleware
jest.mock('../../middleware/auth', () => ({
  authenticateToken: jest.fn((req: any, res: any, next: any) => {
    if (!req.headers.authorization) {
      return res.status(401).json({ 
        success: false,
        error: 'Authentication required' 
      });
    }
    req.user = { 
      id: 'test-user-id',
      userId: 'test-user-id',
      email: 'test@example.com'
    };
    next();
  })
}));

// Mock Supabase
const mockSupabaseResponse = {
  data: null,
  error: null
};

const mockSupabaseChain = {
  select: jest.fn().mockReturnThis(),
  insert: jest.fn().mockReturnThis(),
  update: jest.fn().mockReturnThis(),
  delete: jest.fn().mockReturnThis(),
  eq: jest.fn().mockReturnThis(),
  not: jest.fn().mockReturnThis(),
  lt: jest.fn().mockReturnThis(),
  gt: jest.fn().mockReturnThis(),
  gte: jest.fn().mockReturnThis(),
  lte: jest.fn().mockReturnThis(),
  order: jest.fn().mockReturnThis(),
  limit: jest.fn().mockReturnThis(),
  single: jest.fn().mockResolvedValue(mockSupabaseResponse),
  mockResolvedValue: jest.fn().mockResolvedValue(mockSupabaseResponse)
};

jest.mock('../../app', () => ({
  supabase: {
    from: jest.fn(() => mockSupabaseChain)
  }
}));

// Mock external services
jest.mock('../../services/crypto/walletconnect.service', () => ({
  walletConnectService: {
    initialize: jest.fn(),
    isConfigured: jest.fn(() => true),
    createSessionProposal: jest.fn(),
    approveSessionProposal: jest.fn(),
    rejectSessionProposal: jest.fn(),
    disconnectSession: jest.fn(),
    getActiveSessions: jest.fn(() => []),
    cleanupExpiredSessions: jest.fn()
  }
}));

jest.mock('../../services/crypto/metamask.service', () => ({
  metamaskService: {
    initialize: jest.fn(),
    isConfigured: jest.fn(() => true),
    isMetaMaskAvailable: jest.fn(() => true),
    requestConnection: jest.fn(),
    disconnectConnection: jest.fn(),
    getActiveConnections: jest.fn(() => []),
    cleanupExpiredConnections: jest.fn()
  }
}));

jest.mock('../../services/crypto/bitcoin.service', () => ({
  bitcoinService: {
    validateBitcoinAddress: jest.fn(),
    generateAddressQRCode: jest.fn(),
    getAddressBalance: jest.fn(),
    createUnsignedTransaction: jest.fn(),
    broadcastTransaction: jest.fn(),
    getTransactionFees: jest.fn()
  }
}));

// Add crypto routes to test app
app.use('/api/v1/crypto', cryptoRoutes);

describe('Crypto API Integration Tests', () => {
  const mockUserId = 'test-user-id';
  let authToken: string;

  beforeAll(() => {
    authToken = 'mock_jwt_token';
    
    // Setup environment variables for tests
    process.env.ALCHEMY_API_KEY = 'test-alchemy-key';
    process.env.ALCHEMY_URL = 'https://eth-mainnet.g.alchemy.com/v2/';
    process.env.WALLET_ENCRYPTION_KEY = 'test-encryption-key-32-chars-long!';
    process.env.WALLETCONNECT_PROJECT_ID = 'test-project-id';
    process.env.METAMASK_APP_NAME = 'DisCard Test';
    process.env.BLOCKCYPHER_API_KEY = 'test-blockcypher-key';
  });

  afterAll(() => {
    nock.cleanAll();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    nock.cleanAll();
    
    // Reset Supabase mocks - setup comprehensive chaining
    mockSupabaseChain.insert.mockResolvedValue({ data: { wallet_id: 'test-wallet-id' }, error: null });
    mockSupabaseChain.update.mockResolvedValue({ data: null, error: null });
    mockSupabaseChain.single.mockResolvedValue({ data: null, error: null });
    mockSupabaseChain.order.mockResolvedValue({ data: [], error: null });
    mockSupabaseChain.not.mockResolvedValue({ data: [], error: null });
    
    // Reset all chain methods to return this
    Object.keys(mockSupabaseChain).forEach(key => {
      if (key !== 'mockResolvedValue' && typeof mockSupabaseChain[key] === 'function') {
        if (key === 'single' || key === 'insert' || key === 'update' || key === 'order' || key === 'not') {
          // These are terminal methods that should return data
          return;
        }
        mockSupabaseChain[key].mockReturnValue(mockSupabaseChain);
      }
    });
  });

  afterEach(() => {
    nock.abortPendingRequests();
  });

  describe('Wallet Connection Endpoints', () => {
    describe('POST /api/v1/crypto/wallets/connect', () => {
      test('should connect Ethereum wallet successfully', async () => {
        const walletData = {
          walletType: 'ethereum',
          walletAddress: '0x742d35cc6603c0532c28b8eeaf7896fd5b5e1dca',
          walletName: 'My MetaMask Wallet'
        };

        // Mock Alchemy balance response
        const mockAlchemyResponse = {
          id: 1,
          jsonrpc: '2.0',
          result: '0x1bc16d674ec80000' // 2 ETH in wei
        };

        nock('https://eth-mainnet.g.alchemy.com')
          .post('/v2/test-alchemy-key')
          .reply(200, mockAlchemyResponse);

        // Mock CoinGecko rates response
        nock('https://api.coingecko.com')
          .get('/api/v3/simple/price')
          .query({ ids: 'ethereum', vs_currencies: 'usd' })
          .reply(200, { ethereum: { usd: 3000 } });

        // Mock successful database insertion
        mockSupabaseChain.insert.mockResolvedValue({
          data: { wallet_id: 'test-wallet-id' },
          error: null
        });

        const response = await request(app)
          .post('/api/v1/crypto/wallets/connect')
          .set('Authorization', `Bearer ${authToken}`)
          .send(walletData);

        expect(response.status).toBe(201);
        expect(response.body).toEqual({
          success: true,
          message: 'Wallet connected successfully',
          data: {
            wallet: expect.objectContaining({
              walletId: expect.any(String),
              walletType: 'ethereum',
              walletAddress: walletData.walletAddress,
              walletName: walletData.walletName,
              connectionStatus: 'connected'
            })
          }
        });
      });

      test('should reject invalid wallet address', async () => {
        const invalidWalletData = {
          walletType: 'ethereum',
          walletAddress: 'invalid-address',
          walletName: 'Invalid Wallet'
        };

        const response = await request(app)
          .post('/api/v1/crypto/wallets/connect')
          .set('Authorization', `Bearer ${authToken}`)
          .send(invalidWalletData);

        expect(response.status).toBe(400);
        expect(response.body).toEqual({
          success: false,
          error: expect.stringContaining('Invalid wallet address')
        });
      });

      test('should handle missing required fields', async () => {
        const incompleteWalletData = {
          walletType: 'ethereum'
          // Missing walletAddress
        };

        const response = await request(app)
          .post('/api/v1/crypto/wallets/connect')
          .set('Authorization', `Bearer ${authToken}`)
          .send(incompleteWalletData);

        expect(response.status).toBe(400);
        expect(response.body).toEqual({
          success: false,
          error: expect.stringContaining('validation')
        });
      });
    });
  });

  describe('Wallet Management Endpoints', () => {
    describe('GET /api/v1/crypto/wallets', () => {
      test('should list connected wallets', async () => {
        const mockWallets = [
          {
            wallet_id: 'wallet-1',
            wallet_type: 'ethereum',
            wallet_address: '0x742d35cc6603c0532c28b8eeaf7896fd5b5e1dca',
            wallet_name: 'MetaMask Wallet',
            connection_status: 'connected',
            permissions: ['eth_accounts'],
            session_expiry: new Date(Date.now() + 3600000).toISOString(),
            last_balance_check: new Date().toISOString(),
            supported_currencies: ['ETH', 'USDT', 'USDC']
          }
        ];

        mockSupabaseChain.select.mockReturnThis();
        mockSupabaseChain.eq.mockResolvedValue({
          data: mockWallets,
          error: null
        });

        const response = await request(app)
          .get('/api/v1/crypto/wallets')
          .set('Authorization', `Bearer ${authToken}`);

        expect(response.status).toBe(200);
        expect(response.body).toEqual({
          success: true,
          data: {
            wallets: [
              expect.objectContaining({
                walletId: 'wallet-1',
                walletType: 'ethereum',
                walletAddress: '0x742d35cc6603c0532c28b8eeaf7896fd5b5e1dca',
                walletName: 'MetaMask Wallet',
                connectionStatus: 'connected'
              })
            ]
          }
        });
      });

      test('should handle empty wallet list', async () => {
        mockSupabaseChain.select.mockReturnThis();
        mockSupabaseChain.eq.mockResolvedValue({
          data: [],
          error: null
        });

        const response = await request(app)
          .get('/api/v1/crypto/wallets')
          .set('Authorization', `Bearer ${authToken}`);

        expect(response.status).toBe(200);
        expect(response.body).toEqual({
          success: true,
          data: {
            wallets: []
          }
        });
      });
    });

    describe('DELETE /api/v1/crypto/wallets/:walletId', () => {
      test('should disconnect wallet successfully', async () => {
        const walletId = 'test-wallet-id';

        mockSupabaseChain.update.mockResolvedValue({
          data: { wallet_id: walletId },
          error: null
        });

        const response = await request(app)
          .delete(`/api/v1/crypto/wallets/${walletId}`)
          .set('Authorization', `Bearer ${authToken}`);

        expect(response.status).toBe(200);
        expect(response.body).toEqual({
          success: true,
          message: 'Wallet disconnected successfully'
        });
      });

      test('should handle wallet not found', async () => {
        const walletId = 'non-existent-wallet';

        mockSupabaseChain.update.mockResolvedValue({
          data: null,
          error: { message: 'Wallet not found' }
        });

        const response = await request(app)
          .delete(`/api/v1/crypto/wallets/${walletId}`)
          .set('Authorization', `Bearer ${authToken}`);

        expect(response.status).toBe(404);
        expect(response.body).toEqual({
          success: false,
          error: expect.stringContaining('not found')
        });
      });
    });
  });

  describe('Balance and Rates Endpoints', () => {
    describe('GET /api/v1/crypto/wallets/:walletId/balance', () => {
      test('should get wallet balance successfully', async () => {
        const walletId = 'test-wallet-id';

        // Mock wallet data
        mockSupabaseChain.select.mockReturnThis();
        mockSupabaseChain.eq.mockReturnThis();
        mockSupabaseChain.single.mockResolvedValue({
          data: {
            wallet_id: walletId,
            wallet_type: 'ethereum',
            wallet_address: '0x742d35cc6603c0532c28b8eeaf7896fd5b5e1dca',
            supported_currencies: ['ETH', 'USDT']
          },
          error: null
        });

        // Mock Alchemy balance response
        nock('https://eth-mainnet.g.alchemy.com')
          .post('/v2/test-alchemy-key')
          .twice()
          .reply(200, {
            id: 1,
            jsonrpc: '2.0',
            result: '0x1bc16d674ec80000' // 2 ETH in wei
          });

        // Mock CoinGecko rates
        nock('https://api.coingecko.com')
          .get('/api/v3/simple/price')
          .query({ ids: 'ethereum,tether', vs_currencies: 'usd' })
          .reply(200, {
            ethereum: { usd: 3000 },
            tether: { usd: 1 }
          });

        const response = await request(app)
          .get(`/api/v1/crypto/wallets/${walletId}/balance`)
          .set('Authorization', `Bearer ${authToken}`);

        expect(response.status).toBe(200);
        expect(response.body).toEqual({
          success: true,
          data: expect.objectContaining({
            walletId,
            balances: expect.any(Array),
            totalUsdValue: expect.any(Number),
            lastUpdated: expect.any(String)
          })
        });
      });

      test('should handle wallet not found for balance check', async () => {
        const walletId = 'non-existent-wallet';

        mockSupabaseChain.select.mockReturnThis();
        mockSupabaseChain.eq.mockReturnThis();
        mockSupabaseChain.single.mockResolvedValue({
          data: null,
          error: { message: 'Wallet not found' }
        });

        const response = await request(app)
          .get(`/api/v1/crypto/wallets/${walletId}/balance`)
          .set('Authorization', `Bearer ${authToken}`);

        expect(response.status).toBe(404);
        expect(response.body).toEqual({
          success: false,
          error: expect.stringContaining('not found')
        });
      });
    });

    describe('GET /api/v1/crypto/rates', () => {
      test('should get current conversion rates with default currencies', async () => {
        // Mock CoinGecko response for default currencies
        nock('https://api.coingecko.com')
          .get('/api/v3/simple/price')
          .query({ ids: 'bitcoin,ethereum,tether,usd-coin', vs_currencies: 'usd' })
          .reply(200, {
            bitcoin: { usd: 50000 },
            ethereum: { usd: 3000 },
            tether: { usd: 1 },
            'usd-coin': { usd: 1 }
          });

        const response = await request(app)
          .get('/api/v1/crypto/rates')
          .set('Authorization', `Bearer ${authToken}`);

        expect(response.status).toBe(200);
        expect(response.body).toEqual({
          success: true,
          data: {
            rates: expect.objectContaining({
              BTC: expect.objectContaining({ 
                usd: expect.any(String),
                lastUpdated: expect.any(String)
              }),
              ETH: expect.objectContaining({ 
                usd: expect.any(String),
                lastUpdated: expect.any(String)
              }),
              USDT: expect.objectContaining({ 
                usd: expect.any(String),
                lastUpdated: expect.any(String)
              }),
              USDC: expect.objectContaining({ 
                usd: expect.any(String),
                lastUpdated: expect.any(String)
              })
            }),
            requestedCurrencies: ['BTC', 'ETH', 'USDT', 'USDC'],
            lastUpdated: expect.any(String)
          }
        });
      });

      test('should get rates for specific currencies via query param', async () => {
        // Mock CoinGecko response for specific currencies
        nock('https://api.coingecko.com')
          .get('/api/v3/simple/price')
          .query({ ids: 'bitcoin,ethereum', vs_currencies: 'usd' })
          .reply(200, {
            bitcoin: { usd: 52000 },
            ethereum: { usd: 3200 }
          });

        const response = await request(app)
          .get('/api/v1/crypto/rates?currencies=BTC,ETH')
          .set('Authorization', `Bearer ${authToken}`);

        expect(response.status).toBe(200);
        expect(response.body).toEqual({
          success: true,
          data: {
            rates: expect.objectContaining({
              BTC: expect.objectContaining({ 
                usd: '52000',
                lastUpdated: expect.any(String)
              }),
              ETH: expect.objectContaining({ 
                usd: '3200',
                lastUpdated: expect.any(String)
              })
            }),
            requestedCurrencies: ['BTC', 'ETH'],
            lastUpdated: expect.any(String)
          }
        });
      });

      test('should handle single currency request', async () => {
        // Mock CoinGecko response for single currency
        nock('https://api.coingecko.com')
          .get('/api/v3/simple/price')
          .query({ ids: 'bitcoin', vs_currencies: 'usd' })
          .reply(200, {
            bitcoin: { usd: 48000 }
          });

        const response = await request(app)
          .get('/api/v1/crypto/rates?currencies=BTC')
          .set('Authorization', `Bearer ${authToken}`);

        expect(response.status).toBe(200);
        expect(response.body).toEqual({
          success: true,
          data: {
            rates: expect.objectContaining({
              BTC: expect.objectContaining({ 
                usd: '48000',
                lastUpdated: expect.any(String)
              })
            }),
            requestedCurrencies: ['BTC'],
            lastUpdated: expect.any(String)
          }
        });
      });

      test('should handle case-insensitive currency codes', async () => {
        // Mock CoinGecko response
        nock('https://api.coingecko.com')
          .get('/api/v3/simple/price')
          .query({ ids: 'bitcoin,ethereum', vs_currencies: 'usd' })
          .reply(200, {
            bitcoin: { usd: 50000 },
            ethereum: { usd: 3000 }
          });

        const response = await request(app)
          .get('/api/v1/crypto/rates?currencies=btc,eth')
          .set('Authorization', `Bearer ${authToken}`);

        expect(response.status).toBe(200);
        expect(response.body.data.requestedCurrencies).toEqual(['BTC', 'ETH']);
      });

      test('should reject invalid currency codes', async () => {
        const response = await request(app)
          .get('/api/v1/crypto/rates?currencies=INVALID,FAKE')
          .set('Authorization', `Bearer ${authToken}`);

        expect(response.status).toBe(400);
        expect(response.body).toEqual({
          success: false,
          error: 'No valid currencies specified',
          supportedCurrencies: ['BTC', 'ETH', 'USDT', 'USDC', 'XRP']
        });
      });

      test('should filter out invalid currencies and process valid ones', async () => {
        // Mock CoinGecko response for valid currency only
        nock('https://api.coingecko.com')
          .get('/api/v3/simple/price')
          .query({ ids: 'bitcoin', vs_currencies: 'usd' })
          .reply(200, {
            bitcoin: { usd: 50000 }
          });

        const response = await request(app)
          .get('/api/v1/crypto/rates?currencies=BTC,INVALID,FAKE')
          .set('Authorization', `Bearer ${authToken}`);

        expect(response.status).toBe(200);
        expect(response.body.data.requestedCurrencies).toEqual(['BTC']);
      });

      test('should handle external API failures gracefully with cached data', async () => {
        // First request to populate cache
        nock('https://api.coingecko.com')
          .get('/api/v3/simple/price')
          .query({ ids: 'bitcoin', vs_currencies: 'usd' })
          .reply(200, {
            bitcoin: { usd: 50000 }
          });

        await request(app)
          .get('/api/v1/crypto/rates?currencies=BTC')
          .set('Authorization', `Bearer ${authToken}`);

        // Second request with API failure should return cached data
        nock('https://api.coingecko.com')
          .get('/api/v3/simple/price')
          .query({ ids: 'bitcoin', vs_currencies: 'usd' })
          .reply(500, { error: 'Internal Server Error' });

        const response = await request(app)
          .get('/api/v1/crypto/rates?currencies=BTC')
          .set('Authorization', `Bearer ${authToken}`);

        expect(response.status).toBe(200);
        expect(response.body).toEqual({
          success: true,
          data: {
            rates: expect.objectContaining({
              BTC: expect.objectContaining({ 
                usd: '50000',
                lastUpdated: expect.any(String)
              })
            }),
            requestedCurrencies: ['BTC'],
            lastUpdated: expect.any(String)
          }
        });
      });

      test('should handle external API failures with no cache gracefully', async () => {
        // Clear any existing cache first
        const ratesService = require('../../services/crypto/rates.service').ratesService;
        ratesService.clearCache();

        // Mock API failure
        nock('https://api.coingecko.com')
          .get('/api/v3/simple/price')
          .query({ ids: 'bitcoin', vs_currencies: 'usd' })
          .reply(500, { error: 'Internal Server Error' });

        const response = await request(app)
          .get('/api/v1/crypto/rates?currencies=BTC')
          .set('Authorization', `Bearer ${authToken}`);

        expect(response.status).toBe(200);
        expect(response.body).toEqual({
          success: true,
          data: {
            rates: expect.objectContaining({
              BTC: expect.objectContaining({ 
                usd: '0',  // Fallback value when no cache and API fails
                lastUpdated: expect.any(String)
              })
            }),
            requestedCurrencies: ['BTC'],
            lastUpdated: expect.any(String)
          }
        });
      });

      test('should handle rate limiting with proper error response', async () => {
        // Mock rate limiting response
        nock('https://api.coingecko.com')
          .get('/api/v3/simple/price')
          .query(true)
          .reply(429, { error: 'Too Many Requests' });

        const response = await request(app)
          .get('/api/v1/crypto/rates?currencies=BTC')
          .set('Authorization', `Bearer ${authToken}`);

        expect(response.status).toBe(200);
        expect(response.body.data.rates.BTC.usd).toBe('0');
      });

      test('should handle network timeout errors', async () => {
        // Mock network timeout
        nock('https://api.coingecko.com')
          .get('/api/v3/simple/price')
          .query(true)
          .replyWithError({ code: 'ETIMEDOUT', message: 'Request timeout' });

        const response = await request(app)
          .get('/api/v1/crypto/rates?currencies=BTC')
          .set('Authorization', `Bearer ${authToken}`);

        expect(response.status).toBe(200);
        expect(response.body.data.rates.BTC.usd).toBe('0');
      });

      test('should not require authentication for public rates endpoint', async () => {
        // Mock CoinGecko response
        nock('https://api.coingecko.com')
          .get('/api/v3/simple/price')
          .query({ ids: 'bitcoin', vs_currencies: 'usd' })
          .reply(200, {
            bitcoin: { usd: 50000 }
          });

        const response = await request(app)
          .get('/api/v1/crypto/rates?currencies=BTC')
          // No Authorization header

        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
      });
    });
  });

  describe('WalletConnect Integration', () => {
    describe('POST /api/v1/crypto/walletconnect/propose', () => {
      test('should create WalletConnect session proposal', async () => {
        const { walletConnectService } = require('../../services/crypto/walletconnect.service');
        
        walletConnectService.createSessionProposal.mockResolvedValue({
          uri: 'wc:test-uri@1?bridge=test&key=test',
          proposalId: 'test-proposal-id'
        });

        const sessionData = {
          requiredNamespaces: ['eip155'],
          sessionDuration: 3600
        };

        const response = await request(app)
          .post('/api/v1/crypto/wallets/walletconnect/propose')
          .set('Authorization', `Bearer ${authToken}`)
          .send(sessionData);

        expect(response.status).toBe(201);
        expect(response.body).toEqual({
          success: true,
          data: {
            uri: 'wc:test-uri@1?bridge=test&key=test',
            proposalId: 'test-proposal-id'
          }
        });
      });
    });

    describe('POST /api/v1/crypto/walletconnect/approve', () => {
      test('should approve WalletConnect session', async () => {
        const { walletConnectService } = require('../../services/crypto/walletconnect.service');
        
        walletConnectService.approveSessionProposal.mockResolvedValue({
          topic: 'test-topic',
          walletAddress: '0x742d35cc6603c0532c28b8eeaf7896fd5b5e1dca',
          walletName: 'Test Wallet'
        });

        const approvalData = {
          proposalId: 'test-proposal-id',
          accounts: ['0x742d35cc6603c0532c28b8eeaf7896fd5b5e1dca']
        };

        const response = await request(app)
          .post('/api/v1/crypto/wallets/walletconnect/approve')
          .set('Authorization', `Bearer ${authToken}`)
          .send(approvalData);

        expect(response.status).toBe(200);
        expect(response.body).toEqual({
          success: true,
          data: expect.objectContaining({
            topic: 'test-topic',
            walletAddress: '0x742d35cc6603c0532c28b8eeaf7896fd5b5e1dca'
          })
        });
      });
    });
  });

  describe('MetaMask Integration', () => {
    describe('GET /api/v1/crypto/metamask/availability', () => {
      test('should check MetaMask availability', async () => {
        const { metamaskService } = require('../../services/crypto/metamask.service');
        
        metamaskService.isMetaMaskAvailable.mockResolvedValue(true);

        const response = await request(app)
          .get('/api/v1/crypto/wallets/metamask/availability')
          .set('Authorization', `Bearer ${authToken}`);

        expect(response.status).toBe(200);
        expect(response.body).toEqual({
          success: true,
          data: {
            isAvailable: true,
            isConfigured: true
          }
        });
      });
    });

    describe('POST /api/v1/crypto/metamask/connect', () => {
      test('should connect to MetaMask', async () => {
        const { metamaskService } = require('../../services/crypto/metamask.service');
        
        metamaskService.requestConnection.mockResolvedValue({
          connectionId: 'test-connection-id',
          accounts: ['0x742d35cc6603c0532c28b8eeaf7896fd5b5e1dca'],
          chainId: '0x1',
          isConnected: true,
          permissions: ['eth_accounts']
        });

        const connectionData = {
          requestedPermissions: ['eth_accounts'],
          sessionDuration: 3600
        };

        const response = await request(app)
          .post('/api/v1/crypto/wallets/metamask/connect')
          .set('Authorization', `Bearer ${authToken}`)
          .send(connectionData);

        expect(response.status).toBe(201);
        expect(response.body).toEqual({
          success: true,
          data: expect.objectContaining({
            connectionId: 'test-connection-id',
            accounts: ['0x742d35cc6603c0532c28b8eeaf7896fd5b5e1dca'],
            isConnected: true
          })
        });
      });
    });
  });

  describe('Bitcoin Integration', () => {
    describe('POST /api/v1/crypto/bitcoin/connect', () => {
      test('should connect Bitcoin wallet', async () => {
        const { bitcoinService } = require('../../services/crypto/bitcoin.service');
        
        bitcoinService.validateBitcoinAddress.mockReturnValue({
          isValid: true,
          addressType: 'P2PKH',
          network: 'mainnet'
        });

        const bitcoinData = {
          walletAddress: '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa',
          walletName: 'My Bitcoin Wallet'
        };

        const response = await request(app)
          .post('/api/v1/crypto/wallets/bitcoin/connect')
          .set('Authorization', `Bearer ${authToken}`)
          .send(bitcoinData);

        expect(response.status).toBe(201);
        expect(response.body).toEqual({
          success: true,
          data: {
            wallet: expect.objectContaining({
              walletId: expect.any(String),
              walletType: 'bitcoin',
              walletAddress: bitcoinData.walletAddress,
              walletName: bitcoinData.walletName
            })
          }
        });
      });
    });

    describe('GET /api/v1/crypto/bitcoin/qr-code/:address', () => {
      test('should generate QR code for Bitcoin address', async () => {
        const { bitcoinService } = require('../../services/crypto/bitcoin.service');
        
        bitcoinService.generateAddressQRCode.mockResolvedValue('data:image/png;base64,test-qr-code');

        const address = '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa';

        const response = await request(app)
          .get(`/api/v1/crypto/bitcoin/qr-code/${address}`)
          .set('Authorization', `Bearer ${authToken}`);

        expect(response.status).toBe(200);
        expect(response.body).toEqual({
          success: true,
          data: {
            qrCode: 'data:image/png;base64,test-qr-code',
            address: address
          }
        });
      });
    });
  });

  describe('Authentication and Security', () => {
    test('should reject requests without authentication token', async () => {
      const response = await request(app)
        .get('/api/v1/crypto/wallets');

      expect(response.status).toBe(401);
    });

    test('should handle rate limiting', async () => {
      const requests = Array.from({ length: 15 }, () =>
        request(app)
          .get('/api/v1/crypto/rates')
          .set('Authorization', `Bearer ${authToken}`)
      );

      const responses = await Promise.all(requests);
      
      // Some requests should be rate limited
      const rateLimitedResponses = responses.filter(res => res.status === 429);
      expect(rateLimitedResponses.length).toBeGreaterThan(0);
    });
  });

  describe('Error Handling', () => {
    test('should handle database connection errors gracefully', async () => {
      mockSupabaseChain.select.mockReturnThis();
      mockSupabaseChain.eq.mockRejectedValue(new Error('Database connection failed'));

      const response = await request(app)
        .get('/api/v1/crypto/wallets')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(500);
      expect(response.body).toEqual({
        success: false,
        error: expect.stringContaining('Internal server error')
      });
    });

    test('should handle external API timeouts', async () => {
      // Mock timeout
      nock('https://api.coingecko.com')
        .get('/api/v3/simple/price')
        .query(true)
        .delayConnection(6000) // 6 second delay to trigger timeout
        .reply(200, {});

      const response = await request(app)
        .get('/api/v1/crypto/rates')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      // Should return cached or default rates
    });
  });
});