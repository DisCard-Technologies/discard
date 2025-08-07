import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { enhancedRatesService } from '../../../../services/crypto/rates.service';
import { cacheService } from '../../../../config/redis';
import { supabase } from '../../../../database/connection';
import WebSocket from 'ws';
import nock from 'nock';

// Mock dependencies
jest.mock('../../../../config/redis');
jest.mock('../../../../database/connection');
jest.mock('ws');

describe('EnhancedRatesService', () => {
  const mockRates = {
    BTC: { usd: '45000.00', lastUpdated: new Date().toISOString() },
    ETH: { usd: '3000.00', lastUpdated: new Date().toISOString() },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    nock.cleanAll();
    
    // Mock Redis cache methods
    (cacheService.mget as jest.Mock).mockResolvedValue([null, null]);
    (cacheService.mset as jest.Mock).mockResolvedValue(undefined);
    (cacheService.expire as jest.Mock).mockResolvedValue(undefined);
  });

  afterEach(() => {
    enhancedRatesService.cleanup();
  });

  describe('getCurrentRates', () => {
    it('should fetch rates from CoinGecko when cache is empty', async () => {
      // Mock CoinGecko API response
      nock('https://api.coingecko.com')
        .get('/api/v3/simple/price')
        .query(true)
        .reply(200, {
          bitcoin: { usd: 45000, usd_24h_change: 2.5, usd_24h_vol: 1000000 },
          ethereum: { usd: 3000, usd_24h_change: 1.5, usd_24h_vol: 500000 },
        });

      // Mock database save
      (supabase.from as jest.Mock).mockReturnValue({
        insert: jest.fn().mockReturnValue({
          select: jest.fn().mockResolvedValue({ data: [], error: null }),
        }),
      });

      const rates = await enhancedRatesService.getCurrentRates(['BTC', 'ETH']);

      expect(rates).toHaveProperty('BTC');
      expect(rates).toHaveProperty('ETH');
      expect(parseFloat(rates.BTC.usd)).toBe(45000);
      expect(parseFloat(rates.ETH.usd)).toBe(3000);
    });

    it('should return cached rates when available', async () => {
      // Mock Redis cache with valid data
      (cacheService.mget as jest.Mock).mockResolvedValue([
        JSON.stringify(mockRates.BTC),
        JSON.stringify(mockRates.ETH),
      ]);

      const rates = await enhancedRatesService.getCurrentRates(['BTC', 'ETH']);

      expect(rates).toEqual(mockRates);
      expect(cacheService.mget).toHaveBeenCalledWith(['crypto_rate:BTC', 'crypto_rate:ETH']);
    });

    it('should handle failover when primary source fails', async () => {
      // Mock CoinGecko failure
      nock('https://api.coingecko.com')
        .get('/api/v3/simple/price')
        .query(true)
        .reply(500);

      // Mock 0x API response
      nock('https://api.0x.org')
        .get('/swap/v1/price')
        .query({ sellToken: 'BTC', buyToken: 'USD', sellAmount: '1000000000000000000' })
        .reply(200, { price: '45000' });

      nock('https://api.0x.org')
        .get('/swap/v1/price')
        .query({ sellToken: 'ETH', buyToken: 'USD', sellAmount: '1000000000000000000' })
        .reply(200, { price: '3000' });

      // Mock database save
      (supabase.from as jest.Mock).mockReturnValue({
        insert: jest.fn().mockReturnValue({
          select: jest.fn().mockResolvedValue({ data: [], error: null }),
        }),
      });

      const rates = await enhancedRatesService.getCurrentRates(['BTC', 'ETH']);

      expect(rates).toHaveProperty('BTC');
      expect(rates).toHaveProperty('ETH');
    });

    it('should return fallback rates when all sources fail', async () => {
      // Mock all API failures
      nock('https://api.coingecko.com').get('/api/v3/simple/price').query(true).reply(500);
      nock('https://api.0x.org').get('/swap/v1/price').query(true).reply(500);
      nock('https://api.chainlink.com').get('/v1/price').query(true).reply(500);

      const rates = await enhancedRatesService.getCurrentRates(['BTC', 'ETH']);

      expect(rates).toHaveProperty('BTC');
      expect(rates).toHaveProperty('ETH');
      expect(rates.BTC.usd).toBe('0'); // Fallback value
    });
  });

  describe('getHistoricalRates', () => {
    it('should fetch historical rates from database', async () => {
      const mockHistoricalData = [
        { timestamp: '2024-01-01T00:00:00Z', usd_price: 45000, volume_24h: 1000000 },
        { timestamp: '2024-01-01T01:00:00Z', usd_price: 45500, volume_24h: 1100000 },
      ];

      (supabase.from as jest.Mock).mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            gte: jest.fn().mockReturnValue({
              order: jest.fn().mockResolvedValue({ data: mockHistoricalData, error: null }),
            }),
          }),
        }),
      });

      const result = await enhancedRatesService.getHistoricalRates({
        symbol: 'BTC',
        timeframe: '24h',
      });

      expect(result.symbol).toBe('BTC');
      expect(result.timeframe).toBe('24h');
      expect(result.dataPoints).toHaveLength(2);
      expect(result.dataPoints[0].price).toBe('45000');
    });

    it('should handle database errors gracefully', async () => {
      (supabase.from as jest.Mock).mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            gte: jest.fn().mockReturnValue({
              order: jest.fn().mockResolvedValue({ data: null, error: new Error('DB Error') }),
            }),
          }),
        }),
      });

      const result = await enhancedRatesService.getHistoricalRates({
        symbol: 'BTC',
        timeframe: '24h',
      });

      expect(result.dataPoints).toEqual([]);
    });
  });

  describe('WebSocket functionality', () => {
    it('should add WebSocket client and send current rates', () => {
      const mockWs = {
        send: jest.fn(),
        on: jest.fn(),
        readyState: WebSocket.OPEN,
      } as any;

      enhancedRatesService.addWebSocketClient(mockWs);

      expect(mockWs.on).toHaveBeenCalledWith('close', expect.any(Function));
    });

    it('should broadcast rates to all connected clients', async () => {
      const mockWs1 = { send: jest.fn(), readyState: WebSocket.OPEN } as any;
      const mockWs2 = { send: jest.fn(), readyState: WebSocket.OPEN } as any;
      const mockWs3 = { send: jest.fn(), readyState: WebSocket.CLOSED } as any;

      enhancedRatesService.addWebSocketClient(mockWs1);
      enhancedRatesService.addWebSocketClient(mockWs2);
      enhancedRatesService.addWebSocketClient(mockWs3);

      // Trigger a rate update
      nock('https://api.coingecko.com')
        .get('/api/v3/simple/price')
        .query(true)
        .reply(200, {
          bitcoin: { usd: 45000, usd_24h_change: 2.5, usd_24h_vol: 1000000 },
        });

      (supabase.from as jest.Mock).mockReturnValue({
        insert: jest.fn().mockReturnValue({
          select: jest.fn().mockResolvedValue({ data: [], error: null }),
        }),
      });

      await enhancedRatesService.getCurrentRates(['BTC'], true);

      // Give time for broadcast
      await new Promise(resolve => setTimeout(resolve, 100));

      expect(mockWs1.send).toHaveBeenCalled();
      expect(mockWs2.send).toHaveBeenCalled();
      expect(mockWs3.send).not.toHaveBeenCalled(); // Closed connection
    });
  });

  describe('Rate source management', () => {
    it('should return rate source status', () => {
      const sources = enhancedRatesService.getRateSourceStatus();

      expect(sources).toHaveLength(4);
      expect(sources[0].name).toBe('chainlink');
      expect(sources[0].priority).toBe(1);
      expect(sources[0].isActive).toBe(true);
    });

    it('should return supported currencies', () => {
      const currencies = enhancedRatesService.getSupportedCurrencies();

      expect(currencies).toContain('BTC');
      expect(currencies).toContain('ETH');
      expect(currencies).toContain('USDT');
      expect(currencies).toContain('USDC');
      expect(currencies).toContain('XRP');
    });
  });

  describe('Cache management', () => {
    it('should return cache status', () => {
      const status = enhancedRatesService.getCacheStatus();

      expect(status).toHaveProperty('isValid');
      expect(status).toHaveProperty('lastUpdated');
      expect(status).toHaveProperty('size');
    });

    it('should update Redis cache with new rates', async () => {
      nock('https://api.coingecko.com')
        .get('/api/v3/simple/price')
        .query(true)
        .reply(200, {
          bitcoin: { usd: 45000, usd_24h_change: 2.5, usd_24h_vol: 1000000 },
        });

      (supabase.from as jest.Mock).mockReturnValue({
        insert: jest.fn().mockReturnValue({
          select: jest.fn().mockResolvedValue({ data: [], error: null }),
        }),
      });

      await enhancedRatesService.getCurrentRates(['BTC']);

      expect(cacheService.mset).toHaveBeenCalled();
      expect(cacheService.expire).toHaveBeenCalledWith('crypto_rate:BTC', 30);
    });
  });

  describe('Manual refresh', () => {
    it('should force refresh rates', async () => {
      // Set up cached data
      (cacheService.mget as jest.Mock).mockResolvedValueOnce([
        JSON.stringify(mockRates.BTC),
      ]);

      // Mock fresh API call
      nock('https://api.coingecko.com')
        .get('/api/v3/simple/price')
        .query(true)
        .reply(200, {
          bitcoin: { usd: 46000, usd_24h_change: 3.0, usd_24h_vol: 1100000 },
        });

      (supabase.from as jest.Mock).mockReturnValue({
        insert: jest.fn().mockReturnValue({
          select: jest.fn().mockResolvedValue({ data: [], error: null }),
        }),
      });

      const rates = await enhancedRatesService.manualRefresh(['BTC']);

      expect(parseFloat(rates.BTC.usd)).toBe(46000);
      expect(cacheService.mset).toHaveBeenCalled();
    });
  });
});