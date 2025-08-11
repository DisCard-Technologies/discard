/**
 * Centralized Redis key management utility
 * Provides consistent key naming patterns and TTL management
 */

export interface RedisKeyOptions {
  prefix?: string;
  suffix?: string;
  separator?: string;
}

export class RedisKeyManager {
  private readonly defaultSeparator = ':';
  private readonly environment: string;

  constructor(environment = process.env.NODE_ENV || 'development') {
    this.environment = environment;
  }

  /**
   * Generate a Redis key with consistent formatting
   */
  private buildKey(parts: (string | number)[], options: RedisKeyOptions = {}): string {
    const separator = options.separator || this.defaultSeparator;
    const keyParts = [this.environment];
    
    if (options.prefix) {
      keyParts.push(options.prefix);
    }
    
    keyParts.push(...parts.map(part => String(part)));
    
    if (options.suffix) {
      keyParts.push(options.suffix);
    }
    
    return keyParts.join(separator);
  }

  // Fraud Detection Keys
  fraud = {
    velocity: (cardId: string): string => 
      this.buildKey(['fraud', 'velocity', cardId]),
    
    patterns: (cardId: string): string => 
      this.buildKey(['fraud', 'patterns', cardId]),
    
    score: (cardId: string): string => 
      this.buildKey(['fraud', 'score', cardId]),
    
    rateLimit: (cardId: string): string => 
      this.buildKey(['fraud', 'ratelimit', cardId]),
    
    model: (cardId: string): string => 
      this.buildKey(['fraud', 'model', cardId]),
    
    training: (cardId: string): string => 
      this.buildKey(['fraud', 'training', cardId]),
    
    event: (eventId: string): string => 
      this.buildKey(['fraud', 'event', eventId]),
    
    analysis: (transactionId: string): string => 
      this.buildKey(['fraud', 'analysis', transactionId])
  };

  // MFA (Multi-Factor Authentication) Keys
  mfa = {
    challenge: (challengeId: string): string => 
      this.buildKey(['mfa', 'challenge', challengeId]),
    
    attempts: (cardId: string): string => 
      this.buildKey(['mfa', 'attempts', cardId]),
    
    deviceTrust: (cardId: string, deviceId: string): string => 
      this.buildKey(['mfa', 'device', cardId, deviceId]),
    
    biometric: (cardId: string): string => 
      this.buildKey(['mfa', 'biometric', cardId]),
    
    setup: (cardId: string): string => 
      this.buildKey(['mfa', 'setup', cardId]),
    
    totp: (cardId: string): string => 
      this.buildKey(['mfa', 'totp', cardId])
  };

  // Circuit Breaker Keys
  circuitBreaker = {
    metrics: (name: string): string => 
      this.buildKey(['circuit_breaker', name, 'metrics']),
    
    state: (name: string): string => 
      this.buildKey(['circuit_breaker', name, 'state']),
    
    history: (name: string): string => 
      this.buildKey(['circuit_breaker', name, 'history'])
  };

  // Rate Limiting Keys
  rateLimit = {
    generic: (identifier: string, prefix = 'rate_limit'): string => 
      this.buildKey([prefix, 'generic', identifier]),
    
    api: (endpoint: string, identifier: string): string => 
      this.buildKey(['rate_limit', 'api', endpoint, identifier]),
    
    fraud: (cardId: string): string => 
      this.buildKey(['rate_limit', 'fraud', cardId]),
    
    mfa: (cardId: string): string => 
      this.buildKey(['rate_limit', 'mfa', cardId]),
    
    health: (type: string, identifier: string): string => 
      this.buildKey(['rate_limit', 'health', type, identifier])
  };

  // Transaction Keys
  transaction = {
    context: (transactionId: string): string => 
      this.buildKey(['transaction', 'context', transactionId]),
    
    isolation: (cardId: string): string => 
      this.buildKey(['transaction', 'isolation', cardId]),
    
    cache: (transactionId: string): string => 
      this.buildKey(['transaction', 'cache', transactionId]),
    
    lock: (cardId: string): string => 
      this.buildKey(['transaction', 'lock', cardId])
  };

  // Notification Keys
  notification = {
    queue: (userId: string): string => 
      this.buildKey(['notification', 'queue', userId]),
    
    preferences: (userId: string): string => 
      this.buildKey(['notification', 'preferences', userId]),
    
    delivery: (notificationId: string): string => 
      this.buildKey(['notification', 'delivery', notificationId]),
    
    security: (cardId: string): string => 
      this.buildKey(['notification', 'security', cardId])
  };

  // Cache Keys
  cache = {
    user: (userId: string): string => 
      this.buildKey(['cache', 'user', userId]),
    
    card: (cardId: string): string => 
      this.buildKey(['cache', 'card', cardId]),
    
    merchant: (merchantId: string): string => 
      this.buildKey(['cache', 'merchant', merchantId]),
    
    session: (sessionId: string): string => 
      this.buildKey(['cache', 'session', sessionId])
  };

  // Health Check Keys
  health = {
    check: (service: string): string => 
      this.buildKey(['health', 'check', service]),
    
    metrics: (service: string): string => 
      this.buildKey(['health', 'metrics', service]),
    
    status: (service: string): string => 
      this.buildKey(['health', 'status', service])
  };

  // Analytics Keys (Privacy-preserving)
  analytics = {
    cardMetrics: (cardId: string): string => 
      this.buildKey(['analytics', 'card', cardId]),
    
    aggregated: (metricType: string): string => 
      this.buildKey(['analytics', 'aggregated', metricType]),
    
    differential: (queryId: string): string => 
      this.buildKey(['analytics', 'differential', queryId])
  };
}

// TTL Configuration for different key types
export const TTL_CONFIG = {
  // Fraud Detection TTLs
  FRAUD_VELOCITY: 300, // 5 minutes for velocity tracking
  FRAUD_PATTERNS: 3600, // 1 hour for pattern cache
  FRAUD_SCORE: 60, // 1 minute for score cache
  FRAUD_MODEL: 86400, // 24 hours for ML models
  FRAUD_TRAINING: 7200, // 2 hours for training data
  
  // MFA TTLs
  MFA_CHALLENGE: 300, // 5 minutes for challenges
  MFA_ATTEMPTS: 3600, // 1 hour for attempt tracking
  MFA_DEVICE_TRUST: 2592000, // 30 days for device trust
  MFA_BIOMETRIC: 86400, // 24 hours for biometric data
  MFA_SETUP: 3600, // 1 hour for setup tokens
  
  // Rate Limiting TTLs
  RATE_LIMIT: 60, // 1 minute for rate limits
  RATE_LIMIT_LONG: 3600, // 1 hour for longer windows
  
  // Circuit Breaker TTLs
  CIRCUIT_BREAKER_METRICS: 1800, // 30 minutes for metrics
  CIRCUIT_BREAKER_HISTORY: 86400, // 24 hours for history
  
  // Transaction TTLs
  TRANSACTION_CONTEXT: 3600, // 1 hour for context
  TRANSACTION_ISOLATION: 1800, // 30 minutes for isolation
  TRANSACTION_CACHE: 300, // 5 minutes for transaction cache
  TRANSACTION_LOCK: 30, // 30 seconds for locks
  
  // Notification TTLs
  NOTIFICATION_QUEUE: 86400, // 24 hours for notification queue
  NOTIFICATION_DELIVERY: 3600, // 1 hour for delivery status
  
  // Cache TTLs
  CACHE_USER: 1800, // 30 minutes for user cache
  CACHE_CARD: 3600, // 1 hour for card cache
  CACHE_MERCHANT: 7200, // 2 hours for merchant cache
  CACHE_SESSION: 1800, // 30 minutes for session cache
  
  // Health Check TTLs
  HEALTH_CHECK: 60, // 1 minute for health checks
  HEALTH_METRICS: 300, // 5 minutes for health metrics
  
  // Analytics TTLs
  ANALYTICS_CARD: 3600, // 1 hour for card analytics
  ANALYTICS_AGGREGATED: 86400, // 24 hours for aggregated data
  ANALYTICS_DIFFERENTIAL: 1800 // 30 minutes for differential privacy
} as const;

// Key Pattern Utilities
export class RedisKeyPatterns {
  private keyManager: RedisKeyManager;

  constructor(keyManager: RedisKeyManager) {
    this.keyManager = keyManager;
  }

  /**
   * Get all keys matching a pattern for a specific card
   */
  getCardPattern(cardId: string): string {
    return `*:*:${cardId}*`;
  }

  /**
   * Get all fraud detection keys for a card
   */
  getFraudKeysPattern(cardId: string): string {
    return `*:fraud:*:${cardId}*`;
  }

  /**
   * Get all MFA keys for a card
   */
  getMFAKeysPattern(cardId: string): string {
    return `*:mfa:*:${cardId}*`;
  }

  /**
   * Get all circuit breaker keys
   */
  getCircuitBreakerPattern(): string {
    return '*:circuit_breaker:*';
  }

  /**
   * Get all rate limiting keys
   */
  getRateLimitPattern(): string {
    return '*:rate_limit:*';
  }
}

// Global instances
export const redisKeys = new RedisKeyManager();
export const redisKeyPatterns = new RedisKeyPatterns(redisKeys);

// Convenience functions for key validation and cleanup
export class RedisKeyUtils {
  /**
   * Validate key format
   */
  static validateKey(key: string): boolean {
    // Keys should not be empty, contain spaces, or be too long
    return key.length > 0 && key.length < 512 && !/\s/.test(key);
  }

  /**
   * Extract card ID from key if present
   */
  static extractCardId(key: string): string | null {
    const parts = key.split(':');
    // Look for card ID patterns (assuming they are UUIDs or similar)
    for (const part of parts) {
      if (part.match(/^[a-zA-Z0-9-]{8,}$/)) {
        return part;
      }
    }
    return null;
  }

  /**
   * Check if key belongs to a specific service
   */
  static belongsToService(key: string, service: string): boolean {
    return key.includes(`:${service}:`);
  }

  /**
   * Get key expiration time based on key type
   */
  static getTTLForKey(key: string): number {
    if (key.includes('fraud:velocity')) return TTL_CONFIG.FRAUD_VELOCITY;
    if (key.includes('fraud:patterns')) return TTL_CONFIG.FRAUD_PATTERNS;
    if (key.includes('fraud:score')) return TTL_CONFIG.FRAUD_SCORE;
    if (key.includes('fraud:model')) return TTL_CONFIG.FRAUD_MODEL;
    
    if (key.includes('mfa:challenge')) return TTL_CONFIG.MFA_CHALLENGE;
    if (key.includes('mfa:attempts')) return TTL_CONFIG.MFA_ATTEMPTS;
    if (key.includes('mfa:device')) return TTL_CONFIG.MFA_DEVICE_TRUST;
    if (key.includes('mfa:biometric')) return TTL_CONFIG.MFA_BIOMETRIC;
    
    if (key.includes('rate_limit')) return TTL_CONFIG.RATE_LIMIT;
    if (key.includes('circuit_breaker')) return TTL_CONFIG.CIRCUIT_BREAKER_METRICS;
    
    if (key.includes('transaction:context')) return TTL_CONFIG.TRANSACTION_CONTEXT;
    if (key.includes('transaction:lock')) return TTL_CONFIG.TRANSACTION_LOCK;
    
    if (key.includes('cache:')) return TTL_CONFIG.CACHE_USER;
    if (key.includes('health:')) return TTL_CONFIG.HEALTH_CHECK;
    
    // Default TTL
    return 3600; // 1 hour
  }
}