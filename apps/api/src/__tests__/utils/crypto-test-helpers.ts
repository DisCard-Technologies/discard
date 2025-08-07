/**
 * Crypto-specific test utilities and helpers
 * Provides better patterns for testing crypto services
 */

import { jest } from '@jest/globals';

export class CryptoTestHelpers {
  
  /**
   * Create a mock crypto service with common methods
   */
  static createMockCryptoService() {
    return {
      validateWalletAddress: jest.fn(),
      encryptWalletAddress: jest.fn(),
      decryptWalletAddress: jest.fn(),
      hashWalletAddress: jest.fn(),
      getWalletBalance: jest.fn(),
      createTransaction: jest.fn()
    };
  }

  /**
   * Create mock external API responses
   */
  static createMockAPIResponses() {
    return {
      alchemy: {
        success: {
          jsonrpc: '2.0',
          id: 1,
          result: '0x1b1ae4d6e2ef500000' // 2 ETH
        },
        error: {
          jsonrpc: '2.0',
          id: 1,
          error: { code: -32000, message: 'Invalid address' }
        }
      },
      blockcypher: {
        success: {
          address: '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa',
          balance: 6889085649,
          final_balance: 6889085649
        },
        error: { error: 'Address not found' }
      },
      coingecko: {
        success: {
          bitcoin: { usd: 45000 },
          ethereum: { usd: 3000 }
        },
        error: { error: 'API rate limit exceeded' }
      }
    };
  }

  /**
   * Setup environment variables for crypto tests
   */
  static setupTestEnvironment() {
    const originalEnv = { ...process.env };
    
    process.env.ALCHEMY_API_KEY = 'test-alchemy-key';
    process.env.ALCHEMY_URL = 'https://eth-mainnet.g.alchemy.com/v2/';
    process.env.BLOCKCYPHER_API_KEY = 'test-blockcypher-key';
    process.env.WALLETCONNECT_PROJECT_ID = 'test-walletconnect-project';
    process.env.WALLET_ENCRYPTION_KEY = 'test-32-char-key-for-testing-123';
    
    return () => {
      process.env = originalEnv;
    };
  }

  /**
   * Create test wallet data
   */
  static createTestWalletData() {
    return {
      metamask: {
        walletType: 'metamask',
        walletAddress: '0x742d35cc6603c0532c28b8eeaf7896fd5b5e1dca',
        walletName: 'MetaMask Test Wallet',
        connectionStatus: 'connected',
        permissions: ['eth_accounts', 'eth_sendTransaction'],
        supportedCurrencies: ['ETH', 'USDT', 'USDC']
      },
      bitcoin: {
        walletType: 'bitcoin',
        walletAddress: '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa',
        walletName: 'Bitcoin Test Wallet',
        connectionStatus: 'connected',
        permissions: ['bitcoin_send'],
        supportedCurrencies: ['BTC']
      },
      walletconnect: {
        walletType: 'walletconnect',
        walletAddress: '0x742d35cc6603c0532c28b8eeaf7896fd5b5e1dca',
        walletName: 'Trust Wallet',
        connectionStatus: 'connected',
        permissions: ['eth_accounts', 'eth_sendTransaction'],
        supportedCurrencies: ['ETH', 'USDT', 'USDC']
      }
    };
  }

  /**
   * Create test transaction data
   */
  static createTestTransactionData() {
    return {
      bitcoin: {
        from: '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa',
        to: '1BvBMSEYstWetqTFn5Au4m4GFg7xJaNVN2',
        amount: 0.001, // BTC
        fee: 0.00005 // BTC
      },
      ethereum: {
        from: '0x742d35cc6603c0532c28b8eeaf7896fd5b5e1dca',
        to: '0x8ba1f109551bD432803012645Hac136c',
        amount: '1000000000000000000', // 1 ETH in wei
        gasLimit: '21000',
        gasPrice: '20000000000' // 20 gwei
      }
    };
  }

  /**
   * Mock fetch with predefined responses
   */
  static mockFetchWithResponses(responses: Record<string, any>) {
    const mockFetch = jest.fn() as jest.MockedFunction<typeof fetch>;
    
    mockFetch.mockImplementation((url: string) => {
      const urlStr = url.toString();
      
      for (const [pattern, response] of Object.entries(responses)) {
        if (urlStr.includes(pattern)) {
          return Promise.resolve({
            ok: response.status < 400,
            status: response.status || 200,
            json: () => Promise.resolve(response.body || response),
            text: () => Promise.resolve(JSON.stringify(response.body || response))
          } as Response);
        }
      }
      
      // Default to 404 for unmatched URLs
      return Promise.resolve({
        ok: false,
        status: 404,
        json: () => Promise.resolve({ error: 'Not found' }),
        text: () => Promise.resolve(JSON.stringify({ error: 'Not found' }))
      } as Response);
    });
    
    global.fetch = mockFetch;
    return mockFetch;
  }

  /**
   * Utility to wait for async operations in tests
   */
  static async waitFor(condition: () => boolean, timeout = 5000): Promise<void> {
    const start = Date.now();
    while (!condition() && Date.now() - start < timeout) {
      await new Promise(resolve => setTimeout(resolve, 10));
    }
    if (!condition()) {
      throw new Error(`Timeout waiting for condition after ${timeout}ms`);
    }
  }
}