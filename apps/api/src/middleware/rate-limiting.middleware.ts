import { Request, Response, NextFunction } from 'express';
import rateLimit from 'express-rate-limit';
import { redis } from '../config/redis';

interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
  };
}

// Helper function to create rate limiter configuration
const createRateLimiterConfig = (options: {
  windowMs: number;
  max: number;
  message: string;
  handler?: (req: Request, res: Response) => void;
}) => {
  return {
    windowMs: options.windowMs,
    max: options.max,
    message: options.message,
    standardHeaders: true,
    legacyHeaders: false,
    validate: false, // Disable IPv6 validation for now
    keyGenerator: (req: AuthenticatedRequest) => {
      // Use user ID if authenticated, otherwise use IP
      if (req.user?.id) {
        return req.user.id;
      }
      // For IP-based limiting, return the IP or a default
      return req.ip || 'unknown';
    },
    skip: (req: Request) => false,
    handler: options.handler || ((req: Request, res: Response) => {
      res.status(429).json({
        error: 'Too many requests',
        message: options.message,
        retryAfter: req.rateLimit?.resetTime,
      });
    }),
  };
};

// Create rate limiters without Redis store when Redis is not available
// The express-rate-limit will use its default memory store
if (!redis) {
  console.log('Redis not available, rate limiting will use in-memory store');
}

export const cryptoRatesLimiter = rateLimit(createRateLimiterConfig({
  windowMs: 60 * 1000, // 1 minute
  max: 100, // 100 requests per minute per user
  message: 'Too many rate requests, please try again later',
  handler: (req: Request, res: Response) => {
    res.status(429).json({
      error: 'Too many requests',
      message: 'Rate limit exceeded for crypto rates API',
      retryAfter: req.rateLimit?.resetTime,
    });
  },
}));

export const conversionCalculatorLimiter = rateLimit(createRateLimiterConfig({
  windowMs: 60 * 1000, // 1 minute
  max: 100, // 100 requests per minute per user
  message: 'Too many conversion calculator requests, please try again later',
  handler: (req: Request, res: Response) => {
    res.status(429).json({
      error: 'Too many requests',
      message: 'Rate limit exceeded for conversion calculator API',
      retryAfter: req.rateLimit?.resetTime,
    });
  },
}));

export const historicalRatesLimiter = rateLimit(createRateLimiterConfig({
  windowMs: 60 * 1000, // 1 minute
  max: 50, // 50 requests per minute per user
  message: 'Too many historical rate requests, please try again later',
  handler: (req: Request, res: Response) => {
    res.status(429).json({
      error: 'Too many requests',
      message: 'Rate limit exceeded for historical rates API',
      retryAfter: req.rateLimit?.resetTime,
    });
  },
}));

// Generic rate limiter factory function
export const rateLimitMiddleware = (options: {
  windowMs: number;
  max: number;
  message: string;
  prefix?: string;
}) => {
  return rateLimit(createRateLimiterConfig({
    windowMs: options.windowMs,
    max: options.max,
    message: options.message,
  }));
};

export const rateLimitingMiddleware = {
  cryptoRates: cryptoRatesLimiter,
  conversionCalculator: conversionCalculatorLimiter,
  historicalRates: historicalRatesLimiter,
};

// Note: When Redis becomes available, you'll need to restart the server
// to enable Redis-based rate limiting