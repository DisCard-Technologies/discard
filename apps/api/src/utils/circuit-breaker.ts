import { logger } from './logger';
import { createClient } from 'redis';

interface CircuitBreakerOptions {
  failureThreshold: number;
  resetTimeout: number;
  monitoringPeriod: number;
  volumeThreshold: number;
  errorPercentageThreshold: number;
}

interface CircuitBreakerMetrics {
  requests: number;
  failures: number;
  successes: number;
  rejections: number;
  lastFailureTime?: number;
  lastSuccessTime?: number;
}

enum CircuitState {
  CLOSED = 'CLOSED',
  OPEN = 'OPEN',
  HALF_OPEN = 'HALF_OPEN'
}

export class CircuitBreaker {
  private name: string;
  private options: CircuitBreakerOptions;
  private metrics: CircuitBreakerMetrics;
  private state: CircuitState;
  private nextAttempt: number;
  private redis = createClient({ url: process.env.REDIS_URL });

  constructor(name: string, options: Partial<CircuitBreakerOptions> = {}) {
    this.name = name;
    this.options = {
      failureThreshold: options.failureThreshold || 5,
      resetTimeout: options.resetTimeout || 30000, // 30 seconds
      monitoringPeriod: options.monitoringPeriod || 60000, // 1 minute
      volumeThreshold: options.volumeThreshold || 10,
      errorPercentageThreshold: options.errorPercentageThreshold || 50
    };

    this.metrics = {
      requests: 0,
      failures: 0,
      successes: 0,
      rejections: 0
    };

    this.state = CircuitState.CLOSED;
    this.nextAttempt = 0;

    this.redis.connect().catch(err => {
      logger.error(`Circuit breaker ${name} Redis connection failed:`, err);
    });

    // Load metrics from Redis
    this.loadMetrics().catch(err => {
      logger.error(`Failed to load circuit breaker metrics for ${name}:`, err);
    });
  }

  /**
   * Execute a function with circuit breaker protection
   */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (this.isOpen()) {
      this.metrics.rejections++;
      await this.saveMetrics();
      throw new Error(`Circuit breaker ${this.name} is OPEN`);
    }

    this.metrics.requests++;

    try {
      const result = await fn();
      await this.onSuccess();
      return result;
    } catch (error) {
      await this.onFailure(error);
      throw error;
    }
  }

  /**
   * Check if circuit breaker should allow the request
   */
  private isOpen(): boolean {
    if (this.state === CircuitState.CLOSED) {
      return false;
    }

    if (this.state === CircuitState.OPEN) {
      if (Date.now() >= this.nextAttempt) {
        this.state = CircuitState.HALF_OPEN;
        logger.info(`Circuit breaker ${this.name} transitioning to HALF_OPEN`);
        return false;
      }
      return true;
    }

    // HALF_OPEN state - allow one request to test
    return false;
  }

  /**
   * Handle successful execution
   */
  private async onSuccess(): Promise<void> {
    this.metrics.successes++;
    this.metrics.lastSuccessTime = Date.now();

    if (this.state === CircuitState.HALF_OPEN) {
      this.state = CircuitState.CLOSED;
      this.resetMetrics();
      logger.info(`Circuit breaker ${this.name} transitioned to CLOSED after successful test`);
    }

    await this.saveMetrics();
  }

  /**
   * Handle failed execution
   */
  private async onFailure(error: unknown): Promise<void> {
    this.metrics.failures++;
    this.metrics.lastFailureTime = Date.now();

    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.warn(`Circuit breaker ${this.name} recorded failure:`, errorMessage);

    if (this.state === CircuitState.HALF_OPEN) {
      this.openCircuit();
    } else if (this.shouldOpenCircuit()) {
      this.openCircuit();
    }

    await this.saveMetrics();
  }

  /**
   * Determine if circuit should open based on failure criteria
   */
  private shouldOpenCircuit(): boolean {
    const totalRequests = this.metrics.requests;
    
    // Need minimum volume to consider opening
    if (totalRequests < this.options.volumeThreshold) {
      return false;
    }

    // Check failure rate
    const errorPercentage = (this.metrics.failures / totalRequests) * 100;
    const consecutiveFailures = this.metrics.failures;

    return (
      consecutiveFailures >= this.options.failureThreshold ||
      errorPercentage >= this.options.errorPercentageThreshold
    );
  }

  /**
   * Open the circuit breaker
   */
  private openCircuit(): void {
    this.state = CircuitState.OPEN;
    this.nextAttempt = Date.now() + this.options.resetTimeout;
    
    logger.error(`Circuit breaker ${this.name} OPENED. Next attempt in ${this.options.resetTimeout}ms`);
    
    // Emit metrics for monitoring
    this.emitMetrics();
  }

  /**
   * Reset metrics (typically after successful recovery)
   */
  private resetMetrics(): void {
    this.metrics = {
      requests: 0,
      failures: 0,
      successes: 0,
      rejections: 0
    };
  }

  /**
   * Get current circuit breaker status
   */
  getStatus(): {
    name: string;
    state: CircuitState;
    metrics: CircuitBreakerMetrics;
    nextAttempt: number;
    options: CircuitBreakerOptions;
  } {
    return {
      name: this.name,
      state: this.state,
      metrics: { ...this.metrics },
      nextAttempt: this.nextAttempt,
      options: { ...this.options }
    };
  }

  /**
   * Force circuit breaker to specific state (for testing/admin)
   */
  setState(state: CircuitState): void {
    const oldState = this.state;
    this.state = state;
    
    if (state === CircuitState.CLOSED) {
      this.resetMetrics();
    } else if (state === CircuitState.OPEN) {
      this.nextAttempt = Date.now() + this.options.resetTimeout;
    }

    logger.info(`Circuit breaker ${this.name} state changed from ${oldState} to ${state}`);
  }

  /**
   * Load metrics from Redis for persistence across restarts
   */
  private async loadMetrics(): Promise<void> {
    try {
      const key = `circuit_breaker:${this.name}:metrics`;
      const data = await this.redis.get(key);
      
      if (data) {
        const parsed = JSON.parse(data);
        this.metrics = { ...this.metrics, ...parsed.metrics };
        this.state = parsed.state || CircuitState.CLOSED;
        this.nextAttempt = parsed.nextAttempt || 0;
        
        // If we were open and enough time has passed, go to half-open
        if (this.state === CircuitState.OPEN && Date.now() >= this.nextAttempt) {
          this.state = CircuitState.HALF_OPEN;
        }
      }
    } catch (error) {
      logger.error(`Failed to load circuit breaker metrics for ${this.name}:`, error);
    }
  }

  /**
   * Save metrics to Redis for persistence
   */
  private async saveMetrics(): Promise<void> {
    try {
      const key = `circuit_breaker:${this.name}:metrics`;
      const data = {
        metrics: this.metrics,
        state: this.state,
        nextAttempt: this.nextAttempt,
        lastUpdate: Date.now()
      };
      
      // Keep metrics for monitoring period + reset timeout
      const ttl = this.options.monitoringPeriod + this.options.resetTimeout;
      await this.redis.setEx(key, Math.floor(ttl / 1000), JSON.stringify(data));
    } catch (error) {
      logger.error(`Failed to save circuit breaker metrics for ${this.name}:`, error);
    }
  }

  /**
   * Emit metrics for external monitoring systems
   */
  private emitMetrics(): void {
    const metricsData = {
      circuitBreakerName: this.name,
      state: this.state,
      requests: this.metrics.requests,
      failures: this.metrics.failures,
      successes: this.metrics.successes,
      rejections: this.metrics.rejections,
      failureRate: this.metrics.requests > 0 ? (this.metrics.failures / this.metrics.requests) * 100 : 0,
      timestamp: Date.now()
    };

    // Log metrics for now - in production, send to monitoring system
    logger.info('Circuit breaker metrics:', metricsData);
  }

  /**
   * Cleanup resources
   */
  async disconnect(): Promise<void> {
    await this.saveMetrics();
    await this.redis.disconnect();
  }
}

/**
 * Circuit breaker registry for managing multiple circuit breakers
 */
class CircuitBreakerRegistry {
  private breakers = new Map<string, CircuitBreaker>();

  /**
   * Get or create a circuit breaker
   */
  getCircuitBreaker(name: string, options?: Partial<CircuitBreakerOptions>): CircuitBreaker {
    if (!this.breakers.has(name)) {
      const breaker = new CircuitBreaker(name, options);
      this.breakers.set(name, breaker);
    }
    
    return this.breakers.get(name)!;
  }

  /**
   * Get all circuit breaker statuses
   */
  getAllStatuses(): Array<ReturnType<CircuitBreaker['getStatus']>> {
    return Array.from(this.breakers.values()).map(breaker => breaker.getStatus());
  }

  /**
   * Reset all circuit breakers
   */
  resetAll(): void {
    this.breakers.forEach(breaker => breaker.setState(CircuitState.CLOSED));
  }

  /**
   * Cleanup all circuit breakers
   */
  async disconnectAll(): Promise<void> {
    await Promise.all(
      Array.from(this.breakers.values()).map(breaker => breaker.disconnect())
    );
    this.breakers.clear();
  }
}

// Global registry instance
export const circuitBreakerRegistry = new CircuitBreakerRegistry();

// Convenience function for creating/getting circuit breakers
export function createCircuitBreaker(
  name: string, 
  options?: Partial<CircuitBreakerOptions>
): CircuitBreaker {
  return circuitBreakerRegistry.getCircuitBreaker(name, options);
}

// Helper for Marqeta API calls
export const marqetaCircuitBreaker = createCircuitBreaker('marqeta-api', {
  failureThreshold: 3,
  resetTimeout: 30000, // 30 seconds
  volumeThreshold: 5,
  errorPercentageThreshold: 60
});

// Helper for other external APIs
export const externalApiCircuitBreaker = createCircuitBreaker('external-api', {
  failureThreshold: 5,
  resetTimeout: 60000, // 1 minute
  volumeThreshold: 10,
  errorPercentageThreshold: 50
});