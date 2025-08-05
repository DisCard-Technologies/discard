import { describe, it, expect, beforeEach, jest, afterEach } from '@jest/globals';
import { blockchainService } from '../../../../services/crypto/blockchain.service';
import { ratesService } from '../../../../services/crypto/rates.service';

// Mock fetch globally
global.fetch = jest.fn() as jest.MockedFunction<typeof fetch>;

describe('BlockchainService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Set environment variables for testing
    process.env.ALCHEMY_API_KEY = 'test-api-key';
    process.env.ALCHEMY_URL = 'https://eth-mainnet.g.alchemy.com/v2/';
    process.env.WALLET_ENCRYPTION_KEY = 'test-32-char-key-for-testing-123';
  });

  afterEach(() => {
    jest.restoreAllMocks();
    // Clean up environment variables
    delete process.env.ALCHEMY_API_KEY;
    delete process.env.ALCHEMY_URL;
    delete process.env.WALLET_ENCRYPTION_KEY;
  });

  describe('validateWalletAddress', () => {
    it('should validate Ethereum addresses correctly', async () => {
      const validEthAddress = '0x742d35cc6603c0532c28b8eeaf7896fd5b5e1dca';
      const invalidEthAddress = 'invalid-address';

      const validResult = await blockchainService.validateWalletAddress('metamask', validEthAddress);
      const invalidResult = await blockchainService.validateWalletAddress('metamask', invalidEthAddress);

      expect(validResult.isValid).toBe(true);
      expect(invalidResult.isValid).toBe(false);
      expect(invalidResult.error).toBe('Invalid Ethereum address format');
    });

    it('should validate Bitcoin addresses correctly', async () => {
      const validBtcLegacy = '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa';
      const validBtcSegwit = '3J98t1WpEZ73CNmQviecrnyiWrnqRhWNLy';
      const validBtcBech32 = 'bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh';
      const invalidBtcAddress = 'invalid-btc-address';

      const validLegacyResult = await blockchainService.validateWalletAddress('bitcoin', validBtcLegacy);
      const validSegwitResult = await blockchainService.validateWalletAddress('bitcoin', validBtcSegwit);
      const validBech32Result = await blockchainService.validateWalletAddress('bitcoin', validBtcBech32);
      const invalidResult = await blockchainService.validateWalletAddress('bitcoin', invalidBtcAddress);

      expect(validLegacyResult.isValid).toBe(true);
      expect(validSegwitResult.isValid).toBe(true);
      expect(validBech32Result.isValid).toBe(true);
      expect(invalidResult.isValid).toBe(false);
      expect(invalidResult.error).toBe('Invalid Bitcoin address format');
    });

    it('should reject unsupported wallet types', async () => {
      const result = await blockchainService.validateWalletAddress('unsupported', 'any-address');

      expect(result.isValid).toBe(false);
      expect(result.error).toBe('Unsupported wallet type');
    });
  });

  describe('encryptWalletAddress and decryptWalletAddress', () => {
    it('should encrypt and decrypt wallet addresses correctly', async () => {
      const originalAddress = '0x742d35cc6603c0532c28b8eeaf7896fd5b5e1dca';

      const encrypted = await blockchainService.encryptWalletAddress(originalAddress);
      expect(encrypted).not.toBe(originalAddress);
      expect(encrypted).toContain(':');

      const decrypted = await blockchainService.decryptWalletAddress(encrypted);
      expect(decrypted).toBe(originalAddress);
    });

    it('should throw error for invalid encrypted format', async () => {
      const invalidEncrypted = 'invalid-format';

      await expect(blockchainService.decryptWalletAddress(invalidEncrypted))
        .rejects.toThrow('Failed to decrypt wallet address');
    });
  });

  describe('hashWalletAddress', () => {
    it('should create consistent hashes for wallet addresses', () => {
      const address = '0x742d35cc6603c0532c28b8eeaf7896fd5b5e1dca';
      
      const hash1 = blockchainService.hashWalletAddress(address);
      const hash2 = blockchainService.hashWalletAddress(address);
      const hash3 = blockchainService.hashWalletAddress(address.toUpperCase());

      expect(hash1).toBe(hash2);
      expect(hash1).toBe(hash3); // Should be case-insensitive
      expect(hash1).toMatch(/^[a-f0-9]{64}$/); // SHA-256 hex format
    });
  });

  describe('getSupportedCurrencies', () => {
    it('should return correct currencies for each wallet type', () => {
      expect(blockchainService.getSupportedCurrencies('metamask')).toEqual(['ETH', 'USDT', 'USDC']);
      expect(blockchainService.getSupportedCurrencies('walletconnect')).toEqual(['ETH', 'USDT', 'USDC']);
      expect(blockchainService.getSupportedCurrencies('hardware')).toEqual(['ETH', 'USDT', 'USDC']);
      expect(blockchainService.getSupportedCurrencies('bitcoin')).toEqual(['BTC']);
      expect(blockchainService.getSupportedCurrencies('unsupported')).toEqual([]);
    });
  });

  describe('getWalletBalances', () => {
    it('should handle Ethereum wallet balance fetching', async () => {
      const mockResponse = {
        ok: true,
        json: async () => ({
          result: '0x1bc16d674ec80000' // 2 ETH in wei
        })
      };

      (global.fetch as jest.MockedFunction<typeof fetch>).mockResolvedValue(mockResponse as Response);

      const result = await blockchainService.getWalletBalances(
        'metamask',
        '0x742d35cc6603c0532c28b8eeaf7896fd5b5e1dca',
        ['ETH']
      );

      expect(result.success).toBe(true);
      expect(result.balances).toHaveLength(1);
      expect(result.balances[0].currency).toBe('ETH');
      expect(parseFloat(result.balances[0].balance)).toBeCloseTo(2, 1);
    });

    it('should handle Bitcoin wallet balance fetching', async () => {
      const mockResponse = {
        ok: true,
        json: async () => ({
          chain_stats: {
            funded_txo_sum: 100000000 // 1 BTC in satoshis
          }
        })
      };

      (global.fetch as jest.MockedFunction<typeof fetch>).mockResolvedValue(mockResponse as Response);

      const result = await blockchainService.getWalletBalances(
        'bitcoin',
        '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa',
        ['BTC']
      );

      expect(result.success).toBe(true);
      expect(result.balances).toHaveLength(1);
      expect(result.balances[0].currency).toBe('BTC');
      expect(parseFloat(result.balances[0].balance)).toBe(1);
    });

    it('should handle API errors gracefully', async () => {
      (global.fetch as jest.MockedFunction<typeof fetch>).mockRejectedValue(new Error('Network error'));

      const result = await blockchainService.getWalletBalances(
        'metamask',
        '0x742d35cc6603c0532c28b8eeaf7896fd5b5e1dca',
        ['ETH']
      );

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('NETWORK_ERROR');
    });

    it('should handle unsupported wallet types', async () => {
      const result = await blockchainService.getWalletBalances(
        'unsupported',
        'any-address',
        ['ETH']
      );

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('UNSUPPORTED_WALLET_TYPE');
    });
  });
});

describe('RatesService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    ratesService.clearCache();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('getCurrentRates', () => {
    it('should fetch rates from CoinGecko API', async () => {
      const mockApiResponse = {
        bitcoin: { usd: 50000 },
        ethereum: { usd: 3000 }
      };

      const mockResponse = {
        ok: true,
        json: async () => mockApiResponse
      };

      (global.fetch as jest.MockedFunction<typeof fetch>).mockResolvedValue(mockResponse as Response);

      const rates = await ratesService.getCurrentRates(['BTC', 'ETH']);

      expect(rates).toHaveProperty('BTC');
      expect(rates).toHaveProperty('ETH');
      expect(rates.BTC.usd).toBe('50000');
      expect(rates.ETH.usd).toBe('3000');
    });

    it('should handle API errors by returning cached rates', async () => {
      // First, populate cache
      const mockApiResponse = {
        bitcoin: { usd: 50000 }
      };

      const mockResponse = {
        ok: true,
        json: async () => mockApiResponse
      };

      (global.fetch as jest.MockedFunction<typeof fetch>).mockResolvedValueOnce(mockResponse as Response);

      await ratesService.getCurrentRates(['BTC']);

      // Now simulate API error
      (global.fetch as jest.MockedFunction<typeof fetch>).mockRejectedValue(new Error('API Error'));

      const rates = await ratesService.getCurrentRates(['BTC']);

      expect(rates.BTC.usd).toBe('50000'); // Should return cached value
    });

    it('should return zero rates when no cache and API fails', async () => {
      (global.fetch as jest.MockedFunction<typeof fetch>).mockRejectedValue(new Error('API Error'));

      const rates = await ratesService.getCurrentRates(['BTC']);

      expect(rates.BTC.usd).toBe('0');
    });
  });

  describe('getRate', () => {
    it('should return rate for specific currency', async () => {
      const mockApiResponse = {
        bitcoin: { usd: 50000 }
      };

      const mockResponse = {
        ok: true,
        json: async () => mockApiResponse
      };

      (global.fetch as jest.MockedFunction<typeof fetch>).mockResolvedValue(mockResponse as Response);

      const rate = await ratesService.getRate('BTC');

      expect(rate).toBe('50000');
    });

    it('should return "0" for unsupported currency', async () => {
      const rate = await ratesService.getRate('UNSUPPORTED');

      expect(rate).toBe('0');
    });
  });

  describe('convertToUSD', () => {
    it('should convert crypto amount to USD cents', async () => {
      const mockApiResponse = {
        bitcoin: { usd: 50000 }
      };

      const mockResponse = {
        ok: true,
        json: async () => mockApiResponse
      };

      (global.fetch as jest.MockedFunction<typeof fetch>).mockResolvedValue(mockResponse as Response);

      const usdCents = await ratesService.convertToUSD('BTC', '0.1');

      expect(usdCents).toBe(500000); // 0.1 BTC * $50,000 * 100 cents
    });
  });

  describe('convertFromUSD', () => {
    it('should convert USD cents to crypto amount', async () => {
      const mockApiResponse = {
        bitcoin: { usd: 50000 }
      };

      const mockResponse = {
        ok: true,
        json: async () => mockApiResponse
      };

      (global.fetch as jest.MockedFunction<typeof fetch>).mockResolvedValue(mockResponse as Response);

      const cryptoAmount = await ratesService.convertFromUSD('BTC', 500000);

      expect(parseFloat(cryptoAmount)).toBeCloseTo(0.1, 3); // $5,000 / $50,000 = 0.1 BTC
    });

    it('should return "0" when rate is zero', async () => {
      const mockApiResponse = {};

      const mockResponse = {
        ok: true,
        json: async () => mockApiResponse
      };

      (global.fetch as jest.MockedFunction<typeof fetch>).mockResolvedValue(mockResponse as Response);

      const cryptoAmount = await ratesService.convertFromUSD('UNKNOWN', 100);

      expect(cryptoAmount).toBe('0');
    });
  });

  describe('getSupportedCurrencies', () => {
    it('should return all supported currencies', () => {
      const currencies = ratesService.getSupportedCurrencies();

      expect(currencies).toContain('BTC');
      expect(currencies).toContain('ETH');
      expect(currencies).toContain('USDT');
      expect(currencies).toContain('USDC');
      expect(currencies).toContain('XRP');
    });
  });

  describe('cache management', () => {
    it('should use cached rates when valid', async () => {
      const mockApiResponse = {
        bitcoin: { usd: 50000 }
      };

      const mockResponse = {
        ok: true,
        json: async () => mockApiResponse
      };

      (global.fetch as jest.MockedFunction<typeof fetch>).mockResolvedValue(mockResponse as Response);

      // First call should fetch from API
      await ratesService.getCurrentRates(['BTC']);
      expect(global.fetch).toHaveBeenCalledTimes(1);

      // Second call should use cache
      await ratesService.getCurrentRates(['BTC']);
      expect(global.fetch).toHaveBeenCalledTimes(1); // Still 1, no additional call
    });

    it('should report cache status correctly', async () => {
      const status = ratesService.getCacheStatus();

      expect(status.isValid).toBe(false);
      expect(status.lastUpdated).toBeNull();
      expect(status.size).toBe(0);
    });
  });
});