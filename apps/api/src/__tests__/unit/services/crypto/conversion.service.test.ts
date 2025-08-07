import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { conversionService } from '../../../../services/crypto/conversion.service';
import { enhancedRatesService } from '../../../../services/crypto/rates.service';
import { cacheService } from '../../../../config/redis';
import { supabase } from '../../../../database/connection';
import nock from 'nock';
import Decimal from 'decimal.js';

// Mock dependencies
jest.mock('../../../../services/crypto/rates.service');
jest.mock('../../../../config/redis');
jest.mock('../../../../database/connection');

describe('ConversionService', () => {
  const mockRates = {
    BTC: { usd: '45000.00', lastUpdated: new Date().toISOString() },
    ETH: { usd: '3000.00', lastUpdated: new Date().toISOString() },
    USDT: { usd: '1.00', lastUpdated: new Date().toISOString() },
    USDC: { usd: '1.00', lastUpdated: new Date().toISOString() },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    nock.cleanAll();
    
    // Mock rates service
    (enhancedRatesService.getCurrentRates as jest.Mock).mockResolvedValue(mockRates);
    
    // Mock Redis cache
    (cacheService.get as jest.Mock).mockResolvedValue(null);
    (cacheService.set as jest.Mock).mockResolvedValue(undefined);
    (cacheService.del as jest.Mock).mockResolvedValue(undefined);
    
    // Mock Supabase
    (supabase.from as jest.Mock).mockReturnValue({
      insert: jest.fn().mockResolvedValue({ data: null, error: null }),
      select: jest.fn().mockReturnValue({
        eq: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            single: jest.fn().mockResolvedValue({ data: null, error: null }),
          }),
        }),
      }),
      update: jest.fn().mockReturnValue({
        eq: jest.fn().mockReturnValue({
          eq: jest.fn().mockResolvedValue({ data: null, error: null }),
        }),
      }),
    });
  });

  describe('calculateConversion', () => {
    it('should calculate conversion correctly with default slippage', async () => {
      const result = await conversionService.calculateConversion({
        fromCrypto: 'BTC',
        toUsd: 10000, // $100.00
      });

      expect(result).toBeTruthy();
      expect(result!.fromCrypto).toBe('BTC');
      expect(result!.toUsd).toBe(10000);
      expect(parseFloat(result!.cryptoAmount)).toBeCloseTo(0.00222, 5);
      expect(result!.exchangeRate).toBe('45000.00');
      expect(result!.slippageLimit).toBe(2); // Default 2%
    });

    it('should calculate conversion with custom slippage', async () => {
      const result = await conversionService.calculateConversion({
        fromCrypto: 'ETH',
        toUsd: 30000, // $300.00
        slippageLimit: 1,
      });

      expect(result).toBeTruthy();
      expect(result!.fromCrypto).toBe('ETH');
      expect(result!.toUsd).toBe(30000);
      expect(parseFloat(result!.cryptoAmount)).toBeCloseTo(0.1, 1);
      expect(result!.slippageLimit).toBe(1);
    });

    it('should calculate fees correctly', async () => {
      const result = await conversionService.calculateConversion({
        fromCrypto: 'BTC',
        toUsd: 100000, // $1000.00
      });

      expect(result).toBeTruthy();
      expect(result!.fees.networkFee).toBeGreaterThan(0);
      expect(result!.fees.conversionFee).toBeGreaterThan(0);
      expect(result!.fees.platformFee).toBeGreaterThan(0);
      expect(result!.fees.totalFee).toBe(
        result!.fees.networkFee + result!.fees.conversionFee + result!.fees.platformFee
      );
    });

    it('should respect minimum network fees', async () => {
      const result = await conversionService.calculateConversion({
        fromCrypto: 'BTC',
        toUsd: 200, // $2.00 - very small amount
      });

      expect(result).toBeTruthy();
      expect(result!.fees.networkFee).toBeGreaterThanOrEqual(100); // $1.00 minimum
    });

    it('should handle stablecoin conversions with lower fees', async () => {
      const result = await conversionService.calculateConversion({
        fromCrypto: 'USDT',
        toUsd: 10000, // $100.00
      });

      expect(result).toBeTruthy();
      expect(result!.fees.conversionFee).toBeLessThan(50); // Lower conversion fee for stablecoins
    });
  });

  describe('compareRates', () => {
    it('should compare rates across all supported cryptocurrencies', async () => {
      const result = await conversionService.compareRates({
        targetUsdAmount: 50000, // $500.00
      });

      expect(result).toBeTruthy();
      expect(result!.targetUsdAmount).toBe(50000);
      expect(result!.comparisons).toHaveLength(5); // BTC, ETH, USDT, USDC, XRP
      expect(result!.optimalCurrency).toBeTruthy();
    });

    it('should compare rates for specific cryptocurrencies', async () => {
      const result = await conversionService.compareRates({
        targetUsdAmount: 50000,
        cryptoSymbols: ['BTC', 'ETH'],
      });

      expect(result).toBeTruthy();
      expect(result!.comparisons).toHaveLength(2);
      expect(result!.comparisons[0].symbol).toBe('BTC');
      expect(result!.comparisons[1].symbol).toBe('ETH');
    });

    it('should identify optimal currency based on total cost', async () => {
      const result = await conversionService.compareRates({
        targetUsdAmount: 100000, // $1000.00
      });

      expect(result).toBeTruthy();
      const optimal = result!.comparisons.find(c => c.symbol === result!.optimalCurrency);
      expect(optimal).toBeTruthy();
      
      // Optimal should have lowest total cost
      result!.comparisons.forEach(comparison => {
        expect(optimal!.totalCost).toBeLessThanOrEqual(comparison.totalCost);
      });
    });

    it('should calculate efficiency percentages correctly', async () => {
      const result = await conversionService.compareRates({
        targetUsdAmount: 50000,
      });

      expect(result).toBeTruthy();
      result!.comparisons.forEach(comparison => {
        const expectedEfficiency = (50000 / comparison.totalCost) * 100;
        expect(comparison.efficiency).toBeCloseTo(expectedEfficiency, 2);
      });
    });
  });

  describe('createConversionQuote', () => {
    it('should create a conversion quote successfully', async () => {
      const mockQuote = {
        quoteId: 'test-quote-id',
        fromCrypto: 'BTC',
        toCrypto: 'USD',
        fromAmount: '0.00222',
        toAmount: '100.00',
        rate: '45000.00',
        slippageLimit: 2,
        networkFee: 150,
        conversionFee: 50,
        platformFee: 20,
        totalFee: 220,
        expiresAt: new Date(Date.now() + 5 * 60 * 1000),
        status: 'active' as const,
      };

      // Mock UUID generation
      jest.spyOn(require('uuid'), 'v4').mockReturnValue('test-quote-id');

      const result = await conversionService.calculateConversion({
        fromCrypto: 'BTC',
        toUsd: 10000,
      });

      expect(result).toBeTruthy();
      expect(result!.quote).toBeTruthy();
      expect(result!.quote!.fromCrypto).toBe('BTC');
      expect(result!.quote!.status).toBe('active');
      expect(cacheService.set).toHaveBeenCalledWith(
        expect.stringContaining('conversion_quote:'),
        expect.any(String),
        300 // 5 minutes TTL
      );
    });

    it('should handle database save errors gracefully', async () => {
      (supabase.from as jest.Mock).mockReturnValue({
        insert: jest.fn().mockResolvedValue({ data: null, error: new Error('DB Error') }),
      });

      const result = await conversionService.calculateConversion({
        fromCrypto: 'ETH',
        toUsd: 20000,
      });

      // Should still return quote even if DB save fails
      expect(result).toBeTruthy();
      expect(result!.quote).toBeTruthy();
      expect(cacheService.set).toHaveBeenCalled(); // Should still cache
    });
  });

  describe('getConversionQuote', () => {
    const mockQuote = {
      quoteId: 'test-quote-id',
      fromCrypto: 'BTC',
      toCrypto: 'USD',
      fromAmount: '0.00222',
      toAmount: '100.00',
      rate: '45000.00',
      slippageLimit: 2,
      networkFee: 150,
      conversionFee: 50,
      platformFee: 20,
      totalFee: 220,
      expiresAt: new Date(Date.now() + 5 * 60 * 1000),
      status: 'active' as const,
    };

    it('should retrieve quote from Redis cache', async () => {
      (cacheService.get as jest.Mock).mockResolvedValue(JSON.stringify(mockQuote));

      const result = await conversionService.getConversionQuote('test-quote-id');

      expect(result).toEqual(mockQuote);
      expect(cacheService.get).toHaveBeenCalledWith('conversion_quote:test-quote-id');
    });

    it('should retrieve quote from database if not in cache', async () => {
      (cacheService.get as jest.Mock).mockResolvedValue(null);
      (supabase.from as jest.Mock).mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              single: jest.fn().mockResolvedValue({
                data: {
                  quote_id: 'test-quote-id',
                  from_crypto: 'BTC',
                  to_crypto: 'USD',
                  from_amount: 0.00222,
                  to_amount: 100.00,
                  rate: 45000.00,
                  slippage_limit: 2,
                  network_fee: 150,
                  conversion_fee: 50,
                  platform_fee: 20,
                  total_fee: 220,
                  expires_at: mockQuote.expiresAt.toISOString(),
                  status: 'active',
                },
                error: null,
              }),
            }),
          }),
        }),
      });

      const result = await conversionService.getConversionQuote('test-quote-id');

      expect(result).toBeTruthy();
      expect(result!.quoteId).toBe('test-quote-id');
      expect(cacheService.set).toHaveBeenCalled(); // Should cache the result
    });

    it('should return null for non-existent quote', async () => {
      (cacheService.get as jest.Mock).mockResolvedValue(null);
      (supabase.from as jest.Mock).mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              single: jest.fn().mockResolvedValue({ data: null, error: null }),
            }),
          }),
        }),
      });

      const result = await conversionService.getConversionQuote('non-existent');

      expect(result).toBeNull();
    });

    it('should not return expired quotes from cache', async () => {
      const expiredQuote = {
        ...mockQuote,
        expiresAt: new Date(Date.now() - 1000), // Expired
      };
      (cacheService.get as jest.Mock).mockResolvedValue(JSON.stringify(expiredQuote));

      const result = await conversionService.getConversionQuote('test-quote-id');

      expect(result).toBeNull(); // Should not return expired quote
    });
  });

  describe('cancelConversionQuote', () => {
    it('should cancel quote successfully', async () => {
      const result = await conversionService.cancelConversionQuote('test-quote-id');

      expect(result).toBe(true);
      expect(supabase.from).toHaveBeenCalledWith('conversion_quotes');
      expect(cacheService.del).toHaveBeenCalledWith('conversion_quote:test-quote-id');
    });

    it('should handle cancellation errors', async () => {
      (supabase.from as jest.Mock).mockReturnValue({
        update: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            eq: jest.fn().mockResolvedValue({ data: null, error: new Error('DB Error') }),
          }),
        }),
      });

      const result = await conversionService.cancelConversionQuote('test-quote-id');

      expect(result).toBe(false);
    });
  });

  describe('Fee estimation', () => {
    it('should estimate Ethereum gas fees', async () => {
      nock('https://api.etherscan.io')
        .get('/api')
        .query(true)
        .reply(200, {
          status: '1',
          result: {
            ProposeGasPrice: '30',
            SafeGasPrice: '25',
            FastGasPrice: '35',
          },
        });

      const gasEstimate = await conversionService.estimateGasFee('ETH');

      expect(gasEstimate).toBeTruthy();
      expect(gasEstimate.currency).toBe('ETH');
      expect(parseFloat(gasEstimate.gasPrice)).toBeGreaterThan(0);
    });

    it('should estimate Bitcoin fees', async () => {
      nock('https://mempool.space')
        .get('/api/v1/fees/recommended')
        .reply(200, {
          fastestFee: 20,
          halfHourFee: 10,
          hourFee: 5,
        });

      const fees = await conversionService.estimateBitcoinFee();

      expect(fees.fastFee).toBe(20);
      expect(fees.standardFee).toBe(10);
      expect(fees.slowFee).toBe(5);
    });

    it('should return default fees on API failure', async () => {
      nock('https://mempool.space')
        .get('/api/v1/fees/recommended')
        .reply(500);

      const fees = await conversionService.estimateBitcoinFee();

      expect(fees.fastFee).toBe(20); // Default
      expect(fees.standardFee).toBe(10); // Default
      expect(fees.slowFee).toBe(5); // Default
    });
  });

  describe('Helper methods', () => {
    it('should return supported currencies', () => {
      const currencies = conversionService.getSupportedCurrencies();

      expect(currencies).toContain('BTC');
      expect(currencies).toContain('ETH');
      expect(currencies).toContain('USDT');
      expect(currencies).toContain('USDC');
      expect(currencies).toContain('XRP');
    });

    it('should validate slippage limits', () => {
      expect(conversionService.validateSlippageLimit(0.01)).toBe(true); // 1%
      expect(conversionService.validateSlippageLimit(0.05)).toBe(true); // 5%
      expect(conversionService.validateSlippageLimit(0)).toBe(false); // 0%
      expect(conversionService.validateSlippageLimit(0.06)).toBe(false); // 6%
      expect(conversionService.validateSlippageLimit(-0.01)).toBe(false); // Negative
    });

    it('should return fee structure for currency', () => {
      const btcFees = conversionService.getFeeStructure('BTC');
      expect(btcFees).toBeTruthy();
      expect(btcFees!.networkFeePercentage).toBe(0.001);
      expect(btcFees!.conversionFeePercentage).toBe(0.005);
      expect(btcFees!.platformFeePercentage).toBe(0.002);
      expect(btcFees!.minimumNetworkFee).toBe(100);

      const unknownFees = conversionService.getFeeStructure('UNKNOWN');
      expect(unknownFees).toBeNull();
    });
  });
});