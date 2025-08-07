import { describe, it, expect, beforeAll, afterAll, beforeEach } from '@jest/globals';
import request from 'supertest';
import app from '../../app';
import { supabase } from '../../app';
import { redis } from '../../config/redis';
import nock from 'nock';
import jwt from 'jsonwebtoken';

describe('Crypto Rates Integration Tests', () => {
  let authToken: string;
  let server: any;

  beforeAll(async () => {
    // Start server
    server = app.listen(0);
    
    // Create test user token
    authToken = jwt.sign(
      { 
        id: 'test-user-id',
        email: 'test@example.com',
        role: 'authenticated'
      },
      process.env.JWT_SECRET || 'test-secret',
      { expiresIn: '1h' }
    );
  });

  afterAll(async () => {
    await server.close();
    await redis.quit();
  });

  beforeEach(() => {
    nock.cleanAll();
    jest.clearAllMocks();
  });

  describe('GET /api/v1/crypto/rates', () => {
    it('should get current conversion rates with authentication', async () => {
      // Mock external API
      nock('https://api.coingecko.com')
        .get('/api/v3/simple/price')
        .query(true)
        .reply(200, {
          bitcoin: { usd: 45000, usd_24h_change: 2.5, usd_24h_vol: 1000000 },
          ethereum: { usd: 3000, usd_24h_change: 1.5, usd_24h_vol: 500000 },
        });

      const response = await request(server)
        .get('/api/v1/crypto/rates')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.rates).toHaveProperty('BTC');
      expect(response.body.data.rates).toHaveProperty('ETH');
    });

    it('should return 401 without authentication', async () => {
      const response = await request(server)
        .get('/api/v1/crypto/rates')
        .expect(401);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBeTruthy();
    });

    it('should filter rates by currency parameter', async () => {
      nock('https://api.coingecko.com')
        .get('/api/v3/simple/price')
        .query(true)
        .reply(200, {
          bitcoin: { usd: 45000, usd_24h_change: 2.5, usd_24h_vol: 1000000 },
        });

      const response = await request(server)
        .get('/api/v1/crypto/rates?currencies=BTC')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.data.rates).toHaveProperty('BTC');
      expect(response.body.data.rates).not.toHaveProperty('ETH');
    });

    it('should respect rate limiting', async () => {
      // Mock rate responses
      nock('https://api.coingecko.com')
        .get('/api/v3/simple/price')
        .query(true)
        .times(101)
        .reply(200, {
          bitcoin: { usd: 45000, usd_24h_change: 2.5, usd_24h_vol: 1000000 },
        });

      // Make 100 requests (should succeed)
      for (let i = 0; i < 100; i++) {
        await request(server)
          .get('/api/v1/crypto/rates')
          .set('Authorization', `Bearer ${authToken}`)
          .expect(200);
      }

      // 101st request should be rate limited
      const response = await request(server)
        .get('/api/v1/crypto/rates')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(429);

      expect(response.body.error).toBe('Too many requests');
    });
  });

  describe('GET /api/v1/crypto/rates/conversion-calculator', () => {
    it('should calculate conversion with required parameters', async () => {
      nock('https://api.coingecko.com')
        .get('/api/v3/simple/price')
        .query(true)
        .reply(200, {
          bitcoin: { usd: 45000, usd_24h_change: 2.5, usd_24h_vol: 1000000 },
        });

      const response = await request(server)
        .get('/api/v1/crypto/rates/conversion-calculator')
        .query({
          fromCrypto: 'BTC',
          toUsd: 10000, // $100.00
        })
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.fromCrypto).toBe('BTC');
      expect(response.body.data.toUsd).toBe(10000);
      expect(response.body.data.cryptoAmount).toBeTruthy();
      expect(response.body.data.fees).toBeTruthy();
    });

    it('should calculate conversion with custom slippage', async () => {
      nock('https://api.coingecko.com')
        .get('/api/v3/simple/price')
        .query(true)
        .reply(200, {
          ethereum: { usd: 3000, usd_24h_change: 1.5, usd_24h_vol: 500000 },
        });

      const response = await request(server)
        .get('/api/v1/crypto/rates/conversion-calculator')
        .query({
          fromCrypto: 'ETH',
          toUsd: 30000, // $300.00
          slippageLimit: 1,
        })
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.data.slippageLimit).toBe(1);
      expect(response.body.data.quote).toBeTruthy();
    });

    it('should return 400 for missing parameters', async () => {
      const response = await request(server)
        .get('/api/v1/crypto/rates/conversion-calculator')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(400);

      expect(response.body.error).toContain('required');
    });

    it('should return 400 for unsupported cryptocurrency', async () => {
      const response = await request(server)
        .get('/api/v1/crypto/rates/conversion-calculator')
        .query({
          fromCrypto: 'INVALID',
          toUsd: 10000,
        })
        .set('Authorization', `Bearer ${authToken}`)
        .expect(400);

      expect(response.body.error).toContain('Unsupported cryptocurrency');
    });

    it('should return 400 for invalid USD amount', async () => {
      const response = await request(server)
        .get('/api/v1/crypto/rates/conversion-calculator')
        .query({
          fromCrypto: 'BTC',
          toUsd: 50, // $0.50 - below minimum
        })
        .set('Authorization', `Bearer ${authToken}`)
        .expect(400);

      expect(response.body.error).toContain('USD amount must be between');
    });
  });

  describe('POST /api/v1/crypto/rates/comparison', () => {
    it('should compare rates across all cryptocurrencies', async () => {
      nock('https://api.coingecko.com')
        .get('/api/v3/simple/price')
        .query(true)
        .reply(200, {
          bitcoin: { usd: 45000, usd_24h_change: 2.5, usd_24h_vol: 1000000 },
          ethereum: { usd: 3000, usd_24h_change: 1.5, usd_24h_vol: 500000 },
          tether: { usd: 1, usd_24h_change: 0.1, usd_24h_vol: 100000 },
          'usd-coin': { usd: 1, usd_24h_change: 0.05, usd_24h_vol: 80000 },
          ripple: { usd: 0.5, usd_24h_change: 1.0, usd_24h_vol: 50000 },
        });

      const response = await request(server)
        .post('/api/v1/crypto/rates/comparison')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          targetUsdAmount: 50000, // $500.00
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.comparisons).toHaveLength(5);
      expect(response.body.data.optimalCurrency).toBeTruthy();
    });

    it('should compare rates for specific cryptocurrencies', async () => {
      nock('https://api.coingecko.com')
        .get('/api/v3/simple/price')
        .query(true)
        .reply(200, {
          bitcoin: { usd: 45000, usd_24h_change: 2.5, usd_24h_vol: 1000000 },
          ethereum: { usd: 3000, usd_24h_change: 1.5, usd_24h_vol: 500000 },
        });

      const response = await request(server)
        .post('/api/v1/crypto/rates/comparison')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          targetUsdAmount: 100000, // $1000.00
          cryptoSymbols: ['BTC', 'ETH'],
        })
        .expect(200);

      expect(response.body.data.comparisons).toHaveLength(2);
      expect(response.body.data.comparisons[0].symbol).toBe('BTC');
      expect(response.body.data.comparisons[1].symbol).toBe('ETH');
    });

    it('should return 400 for invalid crypto symbols', async () => {
      const response = await request(server)
        .post('/api/v1/crypto/rates/comparison')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          targetUsdAmount: 50000,
          cryptoSymbols: ['BTC', 'INVALID'],
        })
        .expect(400);

      expect(response.body.error).toContain('Unsupported cryptocurrencies');
      expect(response.body.invalidSymbols).toContain('INVALID');
    });
  });

  describe('GET /api/v1/crypto/rates/historical', () => {
    it('should get historical rates for valid symbol and timeframe', async () => {
      // Mock database response
      const mockHistoricalData = [
        {
          timestamp: new Date(Date.now() - 3600000).toISOString(),
          usd_price: 44500,
          volume_24h: 900000,
        },
        {
          timestamp: new Date(Date.now() - 1800000).toISOString(),
          usd_price: 44800,
          volume_24h: 950000,
        },
        {
          timestamp: new Date().toISOString(),
          usd_price: 45000,
          volume_24h: 1000000,
        },
      ];

      jest.spyOn(supabase, 'from').mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            gte: jest.fn().mockReturnValue({
              order: jest.fn().mockResolvedValue({ data: mockHistoricalData, error: null }),
            }),
          }),
        }),
      } as any);

      const response = await request(server)
        .get('/api/v1/crypto/rates/historical')
        .query({
          symbol: 'BTC',
          timeframe: '1h',
        })
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.symbol).toBe('BTC');
      expect(response.body.data.timeframe).toBe('1h');
      expect(response.body.data.dataPoints).toHaveLength(3);
    });

    it('should return 400 for missing symbol parameter', async () => {
      const response = await request(server)
        .get('/api/v1/crypto/rates/historical')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(400);

      expect(response.body.error).toContain('symbol parameter is required');
    });

    it('should return 400 for unsupported symbol', async () => {
      const response = await request(server)
        .get('/api/v1/crypto/rates/historical')
        .query({
          symbol: 'INVALID',
          timeframe: '24h',
        })
        .set('Authorization', `Bearer ${authToken}`)
        .expect(400);

      expect(response.body.error).toContain('Unsupported cryptocurrency symbol');
    });

    it('should return 400 for invalid timeframe', async () => {
      const response = await request(server)
        .get('/api/v1/crypto/rates/historical')
        .query({
          symbol: 'BTC',
          timeframe: '30d', // Invalid
        })
        .set('Authorization', `Bearer ${authToken}`)
        .expect(400);

      expect(response.body.error).toContain('Invalid timeframe');
      expect(response.body.supportedTimeframes).toEqual(['1h', '24h', '7d']);
    });

    it('should respect rate limiting for historical data', async () => {
      jest.spyOn(supabase, 'from').mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            gte: jest.fn().mockReturnValue({
              order: jest.fn().mockResolvedValue({ data: [], error: null }),
            }),
          }),
        }),
      } as any);

      // Make 50 requests (should succeed)
      for (let i = 0; i < 50; i++) {
        await request(server)
          .get('/api/v1/crypto/rates/historical')
          .query({ symbol: 'BTC', timeframe: '24h' })
          .set('Authorization', `Bearer ${authToken}`)
          .expect(200);
      }

      // 51st request should be rate limited
      const response = await request(server)
        .get('/api/v1/crypto/rates/historical')
        .query({ symbol: 'BTC', timeframe: '24h' })
        .set('Authorization', `Bearer ${authToken}`)
        .expect(429);

      expect(response.body.error).toBe('Too many requests');
    });
  });

  describe('WebSocket /ws/crypto/rates', () => {
    it('should establish WebSocket connection for real-time rates', (done) => {
      const WebSocket = require('ws');
      const ws = new WebSocket(`ws://localhost:${server.address().port}/ws/crypto/rates`);

      ws.on('open', () => {
        expect(ws.readyState).toBe(WebSocket.OPEN);
        ws.close();
        done();
      });

      ws.on('error', (error: Error) => {
        done(error);
      });
    });

    it('should receive rate updates via WebSocket', (done) => {
      const WebSocket = require('ws');
      const ws = new WebSocket(`ws://localhost:${server.address().port}/ws/crypto/rates`);

      ws.on('message', (data: string) => {
        const message = JSON.parse(data);
        expect(message.type).toBe('rates_update');
        expect(message.data).toBeTruthy();
        expect(message.timestamp).toBeTruthy();
        ws.close();
        done();
      });

      ws.on('error', (error: Error) => {
        done(error);
      });
    });
  });

  describe('Conversion Quote Management', () => {
    it('should create and retrieve conversion quote', async () => {
      nock('https://api.coingecko.com')
        .get('/api/v3/simple/price')
        .query(true)
        .reply(200, {
          bitcoin: { usd: 45000, usd_24h_change: 2.5, usd_24h_vol: 1000000 },
        });

      // Create quote
      const createResponse = await request(server)
        .post('/api/v1/crypto/quotes')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          fromCrypto: 'BTC',
          toUsd: 10000,
          slippageLimit: 2,
        })
        .expect(200);

      expect(createResponse.body.success).toBe(true);
      const quoteId = createResponse.body.data.quoteId;
      expect(quoteId).toBeTruthy();

      // Retrieve quote
      const getResponse = await request(server)
        .get(`/api/v1/crypto/quotes/${quoteId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(getResponse.body.data.quoteId).toBe(quoteId);
      expect(getResponse.body.data.status).toBe('active');
    });

    it('should cancel conversion quote', async () => {
      nock('https://api.coingecko.com')
        .get('/api/v3/simple/price')
        .query(true)
        .reply(200, {
          ethereum: { usd: 3000, usd_24h_change: 1.5, usd_24h_vol: 500000 },
        });

      // Create quote
      const createResponse = await request(server)
        .post('/api/v1/crypto/quotes')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          fromCrypto: 'ETH',
          toUsd: 30000,
        })
        .expect(200);

      const quoteId = createResponse.body.data.quoteId;

      // Cancel quote
      const cancelResponse = await request(server)
        .delete(`/api/v1/crypto/quotes/${quoteId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(cancelResponse.body.success).toBe(true);

      // Try to retrieve cancelled quote
      const getResponse = await request(server)
        .get(`/api/v1/crypto/quotes/${quoteId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(404);

      expect(getResponse.body.error).toContain('not found');
    });
  });
});