import { Request, Response, NextFunction } from 'express';
import rateLimit from 'express-rate-limit';
import RedisStore from 'rate-limit-redis';
import { redis } from '../config/redis';

export const cryptoRatesLimiter = rateLimit({
  store: new RedisStore({
    client: redis,
    prefix: 'rate_limit:crypto_rates:',
  }),
  windowMs: 60 * 1000, // 1 minute
  max: 100, // 100 requests per minute per user
  message: 'Too many rate requests, please try again later',
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req: Request) => {
    return req.user?.id || req.ip;
  },
  handler: (req: Request, res: Response) => {
    res.status(429).json({
      error: 'Too many requests',
      message: 'Rate limit exceeded for crypto rates API',
      retryAfter: req.rateLimit?.resetTime,
    });
  },
});

export const conversionCalculatorLimiter = rateLimit({
  store: new RedisStore({
    client: redis,
    prefix: 'rate_limit:conversion_calculator:',
  }),
  windowMs: 60 * 1000, // 1 minute
  max: 100, // 100 requests per minute per user
  message: 'Too many conversion calculator requests, please try again later',
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req: Request) => {
    return req.user?.id || req.ip;
  },
  handler: (req: Request, res: Response) => {
    res.status(429).json({
      error: 'Too many requests',
      message: 'Rate limit exceeded for conversion calculator API',
      retryAfter: req.rateLimit?.resetTime,
    });
  },
});

export const historicalRatesLimiter = rateLimit({
  store: new RedisStore({
    client: redis,
    prefix: 'rate_limit:historical_rates:',
  }),
  windowMs: 60 * 1000, // 1 minute
  max: 50, // 50 requests per minute per user
  message: 'Too many historical rate requests, please try again later',
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req: Request) => {
    return req.user?.id || req.ip;
  },
  handler: (req: Request, res: Response) => {
    res.status(429).json({
      error: 'Too many requests',
      message: 'Rate limit exceeded for historical rates API',
      retryAfter: req.rateLimit?.resetTime,
    });
  },
});

export const rateLimitingMiddleware = {
  cryptoRates: cryptoRatesLimiter,
  conversionCalculator: conversionCalculatorLimiter,
  historicalRates: historicalRatesLimiter,
};