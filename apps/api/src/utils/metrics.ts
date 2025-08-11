/**
 * Operational metrics integration utility
 * Provides structured metrics collection for monitoring and observability
 */

import { logger } from './logger';
import { createClient } from 'redis';
import { redisKeys, TTL_CONFIG } from './redis-keys';

export interface MetricPoint {
  name: string;
  value: number;
  timestamp: number;
  tags?: Record<string, string>;
  unit?: 'count' | 'milliseconds' | 'bytes' | 'percent' | 'rate';
}

export interface CounterMetric {
  name: string;
  description: string;
  tags?: Record<string, string>;
}

export interface GaugeMetric {
  name: string;
  description: string;
  value: number;
  tags?: Record<string, string>;
}

export interface HistogramMetric {
  name: string;
  description: string;
  value: number;
  tags?: Record<string, string>;
}

export interface TimerResult {
  duration: number;
  stop: () => void;
}

export class MetricsCollector {
  private redis = createClient({ url: process.env.REDIS_URL });
  private metricsBuffer: MetricPoint[] = [];
  private flushInterval: NodeJS.Timeout | null = null;
  private readonly FLUSH_INTERVAL_MS = 10000; // 10 seconds
  private readonly MAX_BUFFER_SIZE = 1000;

  constructor() {
    this.redis.connect().catch(err => {
      logger.error('Metrics Redis connection failed:', err);
    });

    // Start periodic flush
    this.startPeriodicFlush();
  }

  /**
   * Record a counter metric (increment only)
   */
  async counter(metric: CounterMetric, increment = 1): Promise<void> {
    const point: MetricPoint = {
      name: `counter.${metric.name}`,
      value: increment,
      timestamp: Date.now(),
      tags: metric.tags,
      unit: 'count'
    };

    this.addToBuffer(point);

    // Also increment in Redis for real-time queries
    const key = redisKeys.analytics.aggregated(`counter:${metric.name}`);
    await this.redis.incrBy(key, increment);
    await this.redis.expire(key, TTL_CONFIG.ANALYTICS_AGGREGATED);
  }

  /**
   * Record a gauge metric (current value)
   */
  async gauge(metric: GaugeMetric): Promise<void> {
    const point: MetricPoint = {
      name: `gauge.${metric.name}`,
      value: metric.value,
      timestamp: Date.now(),
      tags: metric.tags,
      unit: 'count'
    };

    this.addToBuffer(point);

    // Store current value in Redis
    const key = redisKeys.analytics.aggregated(`gauge:${metric.name}`);
    await this.redis.set(key, metric.value.toString());
    await this.redis.expire(key, TTL_CONFIG.ANALYTICS_AGGREGATED);
  }

  /**
   * Record a histogram metric (for latency, size distributions)
   */
  async histogram(metric: HistogramMetric): Promise<void> {
    const point: MetricPoint = {
      name: `histogram.${metric.name}`,
      value: metric.value,
      timestamp: Date.now(),
      tags: metric.tags,
      unit: 'milliseconds'
    };

    this.addToBuffer(point);

    // Store in Redis sorted set for percentile calculations
    const key = redisKeys.analytics.aggregated(`histogram:${metric.name}`);
    await this.redis.zadd(key, metric.value, Date.now().toString());
    await this.redis.expire(key, TTL_CONFIG.ANALYTICS_AGGREGATED);

    // Keep only recent entries (last 1000)
    await this.redis.zremrangebyrank(key, 0, -1001);
  }

  /**
   * Start a timer for measuring operation duration
   */
  timer(name: string, tags?: Record<string, string>): TimerResult {
    const startTime = Date.now();
    let stopped = false;

    const stop = () => {
      if (stopped) return;
      stopped = true;

      const duration = Date.now() - startTime;
      this.histogram({
        name,
        description: `Duration of ${name}`,
        value: duration,
        tags
      });
    };

    return {
      duration: 0, // Will be calculated on stop
      stop
    };
  }

  /**
   * Add metric to buffer for batch processing
   */
  private addToBuffer(point: MetricPoint): void {
    this.metricsBuffer.push(point);

    // Flush if buffer is full
    if (this.metricsBuffer.length >= this.MAX_BUFFER_SIZE) {
      this.flushMetrics();
    }
  }

  /**
   * Flush metrics to external systems (logs for now, could be Prometheus/StatsD)
   */
  private async flushMetrics(): Promise<void> {
    if (this.metricsBuffer.length === 0) return;

    const batch = [...this.metricsBuffer];
    this.metricsBuffer = [];

    try {
      // For now, log metrics (in production, send to monitoring system)
      for (const metric of batch) {
        logger.info('Metric recorded', {
          metric: metric.name,
          value: metric.value,
          tags: metric.tags,
          timestamp: metric.timestamp,
          unit: metric.unit
        });
      }

      // Could also send to external systems here:
      // await this.sendToPrometheus(batch);
      // await this.sendToStatsD(batch);
      // await this.sendToDatadog(batch);

    } catch (error) {
      logger.error('Failed to flush metrics:', error);
      // Put metrics back in buffer for retry
      this.metricsBuffer.unshift(...batch);
    }
  }

  /**
   * Start periodic flushing
   */
  private startPeriodicFlush(): void {
    this.flushInterval = setInterval(() => {
      this.flushMetrics();
    }, this.FLUSH_INTERVAL_MS);
  }

  /**
   * Get metrics summary for health checks
   */
  async getMetricsSummary(): Promise<{
    bufferSize: number;
    totalMetrics: Record<string, number>;
    recentMetrics: MetricPoint[];
  }> {
    const recentMetrics = this.metricsBuffer.slice(-10); // Last 10 metrics

    // Get totals from Redis
    const counterKeys = await this.redis.keys(`*:analytics:aggregated:counter:*`);
    const gaugeKeys = await this.redis.keys(`*:analytics:aggregated:gauge:*`);

    const totalMetrics: Record<string, number> = {};

    // Get counter values
    for (const key of counterKeys) {
      const value = await this.redis.get(key);
      const metricName = key.split(':').pop() || 'unknown';
      totalMetrics[`counter_${metricName}`] = parseInt(value || '0');
    }

    // Get gauge values
    for (const key of gaugeKeys) {
      const value = await this.redis.get(key);
      const metricName = key.split(':').pop() || 'unknown';
      totalMetrics[`gauge_${metricName}`] = parseFloat(value || '0');
    }

    return {
      bufferSize: this.metricsBuffer.length,
      totalMetrics,
      recentMetrics
    };
  }

  /**
   * Cleanup resources
   */
  async disconnect(): Promise<void> {
    if (this.flushInterval) {
      clearInterval(this.flushInterval);
    }

    await this.flushMetrics();
    await this.redis.disconnect();
  }
}

// Predefined metrics for common operations
export class SecurityMetrics {
  constructor(private collector: MetricsCollector) {}

  async recordFraudDetection(duration: number, riskScore: number, cardId: string): Promise<void> {
    await this.collector.histogram({
      name: 'fraud.detection.duration',
      description: 'Time taken for fraud detection analysis',
      value: duration,
      tags: { service: 'fraud_detection' }
    });

    await this.collector.histogram({
      name: 'fraud.risk_score',
      description: 'Distribution of fraud risk scores',
      value: riskScore,
      tags: { service: 'fraud_detection' }
    });

    await this.collector.counter({
      name: 'fraud.analysis.total',
      description: 'Total fraud analyses performed',
      tags: { service: 'fraud_detection' }
    });
  }

  async recordCardFreeze(success: boolean, duration: number): Promise<void> {
    await this.collector.counter({
      name: 'card.freeze.attempts',
      description: 'Card freeze attempts',
      tags: { 
        service: 'card_freeze',
        status: success ? 'success' : 'failure'
      }
    });

    await this.collector.histogram({
      name: 'card.freeze.duration',
      description: 'Time taken to freeze/unfreeze cards',
      value: duration,
      tags: { service: 'card_freeze' }
    });
  }

  async recordMFAChallenge(method: string, success: boolean): Promise<void> {
    await this.collector.counter({
      name: 'mfa.challenge.total',
      description: 'MFA challenges issued',
      tags: {
        service: 'mfa',
        method,
        status: success ? 'success' : 'failure'
      }
    });
  }

  async recordCircuitBreakerEvent(name: string, state: string): Promise<void> {
    await this.collector.counter({
      name: 'circuit_breaker.state_changes',
      description: 'Circuit breaker state changes',
      tags: {
        service: 'circuit_breaker',
        breaker_name: name,
        new_state: state
      }
    });
  }
}

export class APIMetrics {
  constructor(private collector: MetricsCollector) {}

  async recordAPIRequest(endpoint: string, method: string, statusCode: number, duration: number): Promise<void> {
    await this.collector.counter({
      name: 'api.requests.total',
      description: 'Total API requests',
      tags: {
        endpoint,
        method,
        status_code: statusCode.toString(),
        status_class: Math.floor(statusCode / 100) + 'xx'
      }
    });

    await this.collector.histogram({
      name: 'api.request.duration',
      description: 'API request duration',
      value: duration,
      tags: { endpoint, method }
    });
  }

  async recordDatabaseQuery(table: string, operation: string, duration: number, success: boolean): Promise<void> {
    await this.collector.counter({
      name: 'database.queries.total',
      description: 'Total database queries',
      tags: {
        table,
        operation,
        status: success ? 'success' : 'failure'
      }
    });

    await this.collector.histogram({
      name: 'database.query.duration',
      description: 'Database query duration',
      value: duration,
      tags: { table, operation }
    });
  }

  async recordRedisOperation(operation: string, duration: number, success: boolean): Promise<void> {
    await this.collector.counter({
      name: 'redis.operations.total',
      description: 'Total Redis operations',
      tags: {
        operation,
        status: success ? 'success' : 'failure'
      }
    });

    await this.collector.histogram({
      name: 'redis.operation.duration',
      description: 'Redis operation duration',
      value: duration,
      tags: { operation }
    });
  }
}

export class SystemMetrics {
  constructor(private collector: MetricsCollector) {}

  async recordMemoryUsage(): Promise<void> {
    const memUsage = process.memoryUsage();
    
    await this.collector.gauge({
      name: 'system.memory.rss',
      description: 'Process RSS memory usage',
      value: memUsage.rss,
      tags: { unit: 'bytes' }
    });

    await this.collector.gauge({
      name: 'system.memory.heap_used',
      description: 'Heap memory used',
      value: memUsage.heapUsed,
      tags: { unit: 'bytes' }
    });

    await this.collector.gauge({
      name: 'system.memory.heap_total',
      description: 'Total heap memory',
      value: memUsage.heapTotal,
      tags: { unit: 'bytes' }
    });
  }

  async recordUptime(): Promise<void> {
    await this.collector.gauge({
      name: 'system.uptime',
      description: 'Process uptime in seconds',
      value: process.uptime(),
      tags: { unit: 'seconds' }
    });
  }

  async recordEventLoopLag(lag: number): Promise<void> {
    await this.collector.histogram({
      name: 'system.event_loop.lag',
      description: 'Event loop lag in milliseconds',
      value: lag,
      tags: { unit: 'milliseconds' }
    });
  }
}

// Global instances
export const metricsCollector = new MetricsCollector();
export const securityMetrics = new SecurityMetrics(metricsCollector);
export const apiMetrics = new APIMetrics(metricsCollector);
export const systemMetrics = new SystemMetrics(metricsCollector);

// Middleware for automatic API metrics collection
export function metricsMiddleware() {
  return (req: any, res: any, next: any) => {
    const startTime = Date.now();
    
    res.on('finish', () => {
      const duration = Date.now() - startTime;
      const endpoint = req.route?.path || req.path || 'unknown';
      
      apiMetrics.recordAPIRequest(
        endpoint,
        req.method,
        res.statusCode,
        duration
      ).catch(err => {
        logger.error('Failed to record API metrics:', err);
      });
    });

    next();
  };
}

// Utility functions
export function measureAsync<T>(
  name: string,
  fn: () => Promise<T>,
  tags?: Record<string, string>
): Promise<T> {
  const timer = metricsCollector.timer(name, tags);
  
  return fn().finally(() => {
    timer.stop();
  });
}

export function measure<T>(
  name: string,
  fn: () => T,
  tags?: Record<string, string>
): T {
  const timer = metricsCollector.timer(name, tags);
  
  try {
    return fn();
  } finally {
    timer.stop();
  }
}

// Health check integration
export async function getMetricsHealth(): Promise<{
  status: 'healthy' | 'degraded' | 'unhealthy';
  bufferSize: number;
  totalMetrics: number;
  error?: string;
}> {
  try {
    const summary = await metricsCollector.getMetricsSummary();
    const totalMetricsCount = Object.keys(summary.totalMetrics).length;
    
    let status: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';
    
    if (summary.bufferSize > 500) {
      status = 'degraded';
    }
    
    if (summary.bufferSize > 900) {
      status = 'unhealthy';
    }

    return {
      status,
      bufferSize: summary.bufferSize,
      totalMetrics: totalMetricsCount
    };
  } catch (error) {
    return {
      status: 'unhealthy',
      bufferSize: 0,
      totalMetrics: 0,
      error: error instanceof Error ? error.message : 'Unknown metrics error'
    };
  }
}