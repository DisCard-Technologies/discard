import Redis from 'ioredis';
import dotenv from 'dotenv';

dotenv.config();

const redisEnabled = process.env.REDIS_ENABLED !== 'false';
const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';

// Only create Redis client if explicitly enabled
// This prevents connection attempts when Redis is not available
export const redis = redisEnabled ? new Redis(redisUrl, {
  retryStrategy: (times) => {
    // Stop retrying after 5 attempts
    if (times > 5) {
      console.log('Redis connection failed after 5 attempts, giving up');
      return null;
    }
    const delay = Math.min(times * 50, 2000);
    return delay;
  },
  reconnectOnError: (err) => {
    const targetError = 'READONLY';
    if (err.message.includes(targetError)) {
      return true;
    }
    return false;
  },
  maxRetriesPerRequest: null,
  lazyConnect: true,
  enableOfflineQueue: false, // Don't queue commands when offline
  enableReadyCheck: false, // Skip ready check
  connectTimeout: 5000, // 5 second connection timeout
}) : null;

if (redis) {
  // Suppress connection errors to prevent crashes
  redis.on('error', (error) => {
    if ((error as any).code === 'ECONNREFUSED') {
      // Silently ignore connection refused errors
      return;
    }
    console.warn('Redis error:', error.message);
  });
  
  redis.on('connect', () => {
    console.log('Redis connected successfully');
  });
  
  redis.on('close', () => {
    // Silently handle close events
  });
}

let isConnecting = false;
let connectionPromise: Promise<void> | null = null;
let hasLoggedRedisUnavailable = false;

async function ensureConnected(): Promise<boolean> {
  if (!redis) return false;
  
  // ioredis status can be: 'wait', 'connecting', 'connect', 'ready', 'close', 'reconnecting', 'end'
  if ((redis as any).status === 'ready') return true;
  
  // Don't try to connect if we're ending or have ended
  if ((redis as any).status === 'end') return false;
  
  if (!isConnecting && ((redis as any).status === 'wait' || (redis as any).status === 'close')) {
    isConnecting = true;
    connectionPromise = (redis as any).connect().then(() => {
      isConnecting = false;
      connectionPromise = null;
      hasLoggedRedisUnavailable = false;
    }).catch((error: any) => {
      if (!hasLoggedRedisUnavailable) {
        console.log('Redis is not available, using fallback behavior');
        hasLoggedRedisUnavailable = true;
      }
      isConnecting = false;
      connectionPromise = null;
    });
  }
  
  if (connectionPromise) {
    try {
      await connectionPromise;
    } catch (error) {
      // Connection failed, but we'll continue without Redis
    }
  }
  
  return (redis as any).status === 'ready';
}

export const cacheService = {
  async get(key: string): Promise<string | null> {
    if (!redis) return null;
    try {
      const isConnected = await ensureConnected();
      if (!isConnected) return null;
      return await redis.get(key);
    } catch (error) {
      return null;
    }
  },

  async set(key: string, value: string, ttl?: number): Promise<void> {
    if (!redis) return;
    try {
      const isConnected = await ensureConnected();
      if (!isConnected) return;
      if (ttl) {
        await redis.set(key, value, 'EX', ttl);
      } else {
        await redis.set(key, value);
      }
    } catch (error) {
      // Silently fail
    }
  },

  async del(key: string): Promise<void> {
    if (!redis) return;
    try {
      const isConnected = await ensureConnected();
      if (!isConnected) return;
      await redis.del(key);
    } catch (error) {
      // Silently fail
    }
  },

  async exists(key: string): Promise<boolean> {
    if (!redis) return false;
    try {
      const isConnected = await ensureConnected();
      if (!isConnected) return false;
      const result = await redis.exists(key);
      return result === 1;
    } catch (error) {
      return false;
    }
  },

  async expire(key: string, ttl: number): Promise<void> {
    if (!redis) return;
    try {
      const isConnected = await ensureConnected();
      if (!isConnected) return;
      await redis.expire(key, ttl);
    } catch (error) {
      // Silently fail
    }
  },

  async mget(keys: string[]): Promise<(string | null)[]> {
    if (!redis) return keys.map(() => null);
    try {
      const isConnected = await ensureConnected();
      if (!isConnected) return keys.map(() => null);
      return await redis.mget(...keys);
    } catch (error) {
      return keys.map(() => null);
    }
  },

  async mset(keyValuePairs: Record<string, string>): Promise<void> {
    if (!redis) return;
    try {
      const isConnected = await ensureConnected();
      if (!isConnected) return;
      const args = Object.entries(keyValuePairs).flat();
      await redis.mset(...args);
    } catch (error) {
      // Silently fail
    }
  },
};