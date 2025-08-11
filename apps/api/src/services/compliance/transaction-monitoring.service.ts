import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { createClient as createRedisClient } from 'ioredis';
import { TransactionIsolationService } from '../privacy/transaction-isolation.service';
import { AMLMonitoringService } from './aml-monitoring.service';
import { PrivacyAnalyticsService } from '../privacy/privacy-analytics.service';
import { redisKeys, TTL_CONFIG } from '../../utils/redis-keys';
import { logger } from '../../utils/logger';
import * as crypto from 'crypto';

export interface ComplianceTransaction {
  transactionId: string;
  cardContextHash: string;
  amount: number;
  currency: string;
  transactionType: 'purchase' | 'withdrawal' | 'refund' | 'fee' | 'credit' | 'debit';
  merchantName: string;
  merchantCategory: string;
  merchantLocation?: {
    country: string;
    state?: string;
    city?: string;
  };
  timestamp: Date;
  status: 'pending' | 'approved' | 'declined' | 'suspicious';
  riskScore?: number;
}

export interface TransactionPattern {
  patternId: string;
  cardContextHash: string;
  patternType: 'velocity' | 'amount_concentration' | 'geographic_spread' | 'merchant_concentration' | 'time_pattern' | 'currency_pattern';
  detectedAt: Date;
  confidence: number; // 0-1
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  evidence: Record<string, any>;
  complianceFlags: string[];
  regulatoryThresholds: {
    bsa_ctr?: boolean; // Currency Transaction Report threshold
    bsa_sar?: boolean; // Suspicious Activity Report threshold  
    ofac_check?: boolean; // OFAC sanctions screening
    pep_check?: boolean; // Politically Exposed Person check
  };
}

export interface MonitoringMetrics {
  cardContextHash: string;
  timeWindow: '1h' | '24h' | '7d' | '30d';
  metrics: {
    transactionCount: number;
    totalVolume: number;
    averageAmount: number;
    uniqueMerchants: number;
    uniqueCountries: number;
    suspiciousTransactions: number;
    complianceFlags: number;
    riskScore: number;
  };
  thresholdBreaches: {
    velocityThreshold: boolean;
    amountThreshold: boolean;
    geographicThreshold: boolean;
    merchantThreshold: boolean;
  };
  generatedAt: Date;
}

export interface RegulatoryAlert {
  alertId: string;
  cardContextHash: string;
  alertType: 'ctr_threshold' | 'sar_pattern' | 'ofac_match' | 'pep_identified' | 'velocity_breach' | 'amount_concentration';
  severity: 'info' | 'warning' | 'critical';
  triggerTransaction?: string;
  aggregatedData: Record<string, any>;
  complianceActions: string[];
  regulatoryDeadline?: Date;
  escalationRequired: boolean;
  createdAt: Date;
}

export class TransactionMonitoringService {
  private supabase: SupabaseClient;
  private redis: ReturnType<typeof createRedisClient>;
  private isolationService: TransactionIsolationService;
  private amlService: AMLMonitoringService;
  private privacyAnalyticsService: PrivacyAnalyticsService;

  // BSA/AML Thresholds
  private readonly BSA_THRESHOLDS = {
    CTR_THRESHOLD: 10000, // Currency Transaction Report threshold
    SAR_THRESHOLD: 5000, // Suspicious Activity Report consideration threshold
    DAILY_CASH_VELOCITY: 15000, // Daily cash equivalent threshold
    MONTHLY_VELOCITY: 100000, // Monthly transaction volume threshold
    STRUCTURING_PATTERN_COUNT: 3, // Number of transactions to suggest structuring
    HIGH_RISK_AMOUNT: 25000, // Single transaction high-risk threshold
    GEOGRAPHIC_VELOCITY_MILES: 500, // Impossible travel distance
    MERCHANT_CONCENTRATION_THRESHOLD: 0.8 // 80% of volume with single merchant type
  };

  // Monitoring windows and intervals
  private readonly MONITORING_CONFIG = {
    REAL_TIME_WINDOW: 300, // 5 minutes for real-time monitoring
    VELOCITY_WINDOW: 3600, // 1 hour for velocity calculations
    PATTERN_WINDOW: 86400, // 24 hours for pattern detection
    TREND_WINDOW: 604800, // 7 days for trend analysis
    BATCH_SIZE: 100, // Transactions to process in each batch
    MAX_CONCURRENT_MONITORS: 50 // Maximum concurrent monitoring processes
  };

  constructor(supabaseUrl: string, supabaseKey: string) {
    this.supabase = createClient(supabaseUrl, supabaseKey);
    this.redis = createRedisClient({
      url: process.env.REDIS_URL
    });
    this.redis.connect().catch(err => {
      logger.error('Transaction monitoring Redis connection failed:', err);
    });
    this.isolationService = new TransactionIsolationService(supabaseUrl, supabaseKey);
    this.amlService = new AMLMonitoringService(supabaseUrl, supabaseKey);
    this.privacyAnalyticsService = new PrivacyAnalyticsService(supabaseUrl, supabaseKey);
  }

  /**
   * Monitor transaction in real-time for compliance patterns
   */
  async monitorTransaction(transaction: ComplianceTransaction): Promise<{
    patterns: TransactionPattern[];
    alerts: RegulatoryAlert[];
    complianceStatus: 'compliant' | 'requires_review' | 'suspicious' | 'blocked';
    nextActions: string[];
  }> {
    try {
      // Enforce transaction isolation
      await this.isolationService.enforceTransactionIsolation(transaction.cardContextHash);

      // Update transaction metrics
      await this.updateTransactionMetrics(transaction);

      // Detect compliance patterns
      const patterns = await this.detectCompliancePatterns(transaction);

      // Generate regulatory alerts
      const alerts = await this.generateRegulatoryAlerts(transaction, patterns);

      // Determine compliance status
      const complianceStatus = this.determineComplianceStatus(patterns, alerts);

      // Determine next actions
      const nextActions = this.determineNextActions(patterns, alerts, complianceStatus);

      // Cache monitoring result
      await this.cacheMonitoringResult(transaction.cardContextHash, {
        transactionId: transaction.transactionId,
        patterns,
        alerts,
        complianceStatus,
        nextActions,
        monitoredAt: new Date()
      });

      // Log monitoring activity
      await this.logMonitoringEvent('transaction_monitored', transaction.transactionId, transaction.cardContextHash, {
        patternsDetected: patterns.length,
        alertsGenerated: alerts.length,
        complianceStatus
      });

      return {
        patterns,
        alerts,
        complianceStatus,
        nextActions
      };
    } catch (error) {
      logger.error('Error monitoring transaction:', { error, transactionId: transaction.transactionId });
      throw error;
    }
  }

  /**
   * Generate comprehensive monitoring metrics for a card context
   */
  async generateMonitoringMetrics(cardContextHash: string, timeWindow: '1h' | '24h' | '7d' | '30d' = '24h'): Promise<MonitoringMetrics> {
    try {
      // Enforce isolation
      await this.isolationService.enforceTransactionIsolation(cardContextHash);

      // Calculate time range
      const timeRanges = {
        '1h': 60 * 60 * 1000,
        '24h': 24 * 60 * 60 * 1000,
        '7d': 7 * 24 * 60 * 60 * 1000,
        '30d': 30 * 24 * 60 * 60 * 1000
      };

      const startTime = new Date(Date.now() - timeRanges[timeWindow]);

      // Use privacy-preserving analytics to get transaction data
      const privacyBudget = 0.5;
      const transactionCountAnalytics = await this.privacyAnalyticsService.generatePrivateAnalytics({
        metricType: 'transaction_count',
        timeRange: {
          start: startTime.toISOString(),
          end: new Date().toISOString()
        },
        privacyBudget,
        k_anonymity_threshold: 5
      });

      // Get cached metrics if available
      const cachedMetrics = await this.getCachedMetrics(cardContextHash, timeWindow);
      if (cachedMetrics && this.isMetricsFresh(cachedMetrics, timeWindow)) {
        return cachedMetrics;
      }

      // Calculate comprehensive metrics
      const metrics = await this.calculateComplianceMetrics(cardContextHash, startTime);

      // Check threshold breaches
      const thresholdBreaches = this.checkThresholdBreaches(metrics);

      const monitoringMetrics: MonitoringMetrics = {
        cardContextHash,
        timeWindow,
        metrics,
        thresholdBreaches,
        generatedAt: new Date()
      };

      // Cache the metrics
      await this.cacheMetrics(cardContextHash, timeWindow, monitoringMetrics);

      return monitoringMetrics;
    } catch (error) {
      logger.error('Error generating monitoring metrics:', { error, cardContextHash });
      throw error;
    }
  }

  /**
   * Perform batch compliance monitoring
   */
  async performBatchMonitoring(cardContextHashes: string[]): Promise<{
    processedCards: number;
    patternsDetected: number;
    alertsGenerated: number;
    errors: string[];
  }> {
    const results = {
      processedCards: 0,
      patternsDetected: 0,
      alertsGenerated: 0,
      errors: [] as string[]
    };

    try {
      // Process cards in batches to avoid overwhelming the system
      const batches = this.chunkArray(cardContextHashes, this.MONITORING_CONFIG.BATCH_SIZE);

      for (const batch of batches) {
        const batchPromises = batch.map(cardContextHash => 
          this.monitorCardContext(cardContextHash).catch(error => {
            const errorMessage = `Failed to monitor card ${cardContextHash}: ${error instanceof Error ? error.message : 'Unknown error'}`;
            results.errors.push(errorMessage);
            return null;
          })
        );

        const batchResults = await Promise.all(batchPromises);

        for (const result of batchResults) {
          if (result) {
            results.processedCards++;
            results.patternsDetected += result.patterns.length;
            results.alertsGenerated += result.alerts.length;
          }
        }
      }

      // Log batch monitoring summary
      await this.logMonitoringEvent('batch_monitoring_completed', null, null, {
        processedCards: results.processedCards,
        patternsDetected: results.patternsDetected,
        alertsGenerated: results.alertsGenerated,
        errorCount: results.errors.length
      });

      return results;
    } catch (error) {
      logger.error('Error in batch monitoring:', error);
      throw error;
    }
  }

  /**
   * Get regulatory alerts for compliance review
   */
  async getRegulatoryAlerts(
    filters: {
      severity?: string;
      alertType?: string;
      dateRange?: { start: Date; end: Date };
      escalationRequired?: boolean;
    } = {}
  ): Promise<RegulatoryAlert[]> {
    try {
      // This would query a regulatory_alerts table
      // For now, return mock alerts based on filters
      const mockAlerts: RegulatoryAlert[] = [
        {
          alertId: crypto.randomUUID(),
          cardContextHash: 'mock-context-hash',
          alertType: 'ctr_threshold',
          severity: 'warning',
          aggregatedData: { totalAmount: 12000, transactionCount: 3 },
          complianceActions: ['file_ctr', 'enhanced_monitoring'],
          regulatoryDeadline: new Date(Date.now() + (15 * 24 * 60 * 60 * 1000)), // 15 days
          escalationRequired: false,
          createdAt: new Date()
        }
      ];

      // Apply filters
      let filteredAlerts = mockAlerts;

      if (filters.severity) {
        filteredAlerts = filteredAlerts.filter(alert => alert.severity === filters.severity);
      }

      if (filters.alertType) {
        filteredAlerts = filteredAlerts.filter(alert => alert.alertType === filters.alertType);
      }

      if (filters.escalationRequired !== undefined) {
        filteredAlerts = filteredAlerts.filter(alert => alert.escalationRequired === filters.escalationRequired);
      }

      if (filters.dateRange) {
        filteredAlerts = filteredAlerts.filter(alert => 
          alert.createdAt >= filters.dateRange!.start && alert.createdAt <= filters.dateRange!.end
        );
      }

      return filteredAlerts;
    } catch (error) {
      logger.error('Error getting regulatory alerts:', error);
      throw error;
    }
  }

  /**
   * Update real-time transaction metrics
   */
  private async updateTransactionMetrics(transaction: ComplianceTransaction): Promise<void> {
    const metricsKey = redisKeys.analytics.cardMetrics(transaction.cardContextHash);
    
    try {
      // Get current metrics
      const currentMetrics = await this.redis.get(metricsKey);
      const metrics = currentMetrics ? JSON.parse(currentMetrics) : {
        transactionCount: 0,
        totalVolume: 0,
        lastUpdate: Date.now()
      };

      // Update metrics
      metrics.transactionCount += 1;
      metrics.totalVolume += transaction.amount;
      metrics.lastUpdate = Date.now();
      metrics.lastTransactionId = transaction.transactionId;

      // Store updated metrics
      await this.redis.setEx(metricsKey, TTL_CONFIG.ANALYTICS_CARD, JSON.stringify(metrics));
    } catch (error) {
      logger.error('Error updating transaction metrics:', { error, transactionId: transaction.transactionId });
    }
  }

  /**
   * Detect compliance patterns in transaction
   */
  private async detectCompliancePatterns(transaction: ComplianceTransaction): Promise<TransactionPattern[]> {
    const patterns: TransactionPattern[] = [];

    try {
      // Check for CTR threshold patterns
      const ctrPattern = await this.detectCTRPattern(transaction);
      if (ctrPattern) patterns.push(ctrPattern);

      // Check for velocity patterns
      const velocityPattern = await this.detectVelocityPattern(transaction);
      if (velocityPattern) patterns.push(velocityPattern);

      // Check for geographic patterns
      const geographicPattern = await this.detectGeographicPattern(transaction);
      if (geographicPattern) patterns.push(geographicPattern);

      // Check for merchant concentration patterns
      const merchantPattern = await this.detectMerchantConcentrationPattern(transaction);
      if (merchantPattern) patterns.push(merchantPattern);

      // Check for amount concentration patterns
      const amountPattern = await this.detectAmountConcentrationPattern(transaction);
      if (amountPattern) patterns.push(amountPattern);

      return patterns;
    } catch (error) {
      logger.error('Error detecting compliance patterns:', { error, transactionId: transaction.transactionId });
      return patterns;
    }
  }

  /**
   * Detect Currency Transaction Report (CTR) patterns
   */
  private async detectCTRPattern(transaction: ComplianceTransaction): Promise<TransactionPattern | null> {
    // Check if single transaction exceeds CTR threshold
    if (transaction.amount >= this.BSA_THRESHOLDS.CTR_THRESHOLD) {
      return {
        patternId: crypto.randomUUID(),
        cardContextHash: transaction.cardContextHash,
        patternType: 'amount_concentration',
        detectedAt: new Date(),
        confidence: 1.0,
        riskLevel: 'critical',
        evidence: {
          singleTransactionAmount: transaction.amount,
          ctrThreshold: this.BSA_THRESHOLDS.CTR_THRESHOLD,
          transactionId: transaction.transactionId
        },
        complianceFlags: ['ctr_required'],
        regulatoryThresholds: {
          bsa_ctr: true
        }
      };
    }

    // Check for aggregated CTR threshold (multiple transactions in 24h)
    const dailyVolumeKey = `daily_volume:${transaction.cardContextHash}:${new Date().toDateString()}`;
    const dailyVolume = await this.redis.get(dailyVolumeKey) || '0';
    const currentDailyVolume = parseFloat(dailyVolume) + transaction.amount;

    if (currentDailyVolume >= this.BSA_THRESHOLDS.CTR_THRESHOLD) {
      // Update daily volume
      await this.redis.setEx(dailyVolumeKey, 86400, currentDailyVolume.toString()); // 24 hour expiry

      return {
        patternId: crypto.randomUUID(),
        cardContextHash: transaction.cardContextHash,
        patternType: 'amount_concentration',
        detectedAt: new Date(),
        confidence: 0.9,
        riskLevel: 'high',
        evidence: {
          dailyVolume: currentDailyVolume,
          ctrThreshold: this.BSA_THRESHOLDS.CTR_THRESHOLD,
          triggerTransaction: transaction.transactionId
        },
        complianceFlags: ['ctr_required', 'aggregated_threshold'],
        regulatoryThresholds: {
          bsa_ctr: true
        }
      };
    }

    return null;
  }

  /**
   * Detect velocity patterns
   */
  private async detectVelocityPattern(transaction: ComplianceTransaction): Promise<TransactionPattern | null> {
    const velocityKey = redisKeys.fraud.velocity(transaction.cardContextHash);
    
    // Add transaction to velocity tracking
    await this.redis.zAdd(velocityKey, {
      score: transaction.timestamp.getTime(),
      value: JSON.stringify({
        id: transaction.transactionId,
        amount: transaction.amount
      })
    });

    await this.redis.expire(velocityKey, this.MONITORING_CONFIG.VELOCITY_WINDOW);

    // Check velocity in last hour
    const oneHourAgo = Date.now() - this.MONITORING_CONFIG.VELOCITY_WINDOW * 1000;
    const recentTransactions = await this.redis.zRangeByScore(velocityKey, oneHourAgo, Date.now());

    if (recentTransactions.length >= 10) { // More than 10 transactions per hour
      const transactions = recentTransactions.map(t => JSON.parse(t));
      const totalAmount = transactions.reduce((sum, t) => sum + t.amount, 0);

      if (totalAmount > this.BSA_THRESHOLDS.DAILY_CASH_VELOCITY) {
        return {
          patternId: crypto.randomUUID(),
          cardContextHash: transaction.cardContextHash,
          patternType: 'velocity',
          detectedAt: new Date(),
          confidence: 0.8,
          riskLevel: 'high',
          evidence: {
            hourlyTransactionCount: recentTransactions.length,
            hourlyVolume: totalAmount,
            velocityThreshold: this.BSA_THRESHOLDS.DAILY_CASH_VELOCITY
          },
          complianceFlags: ['high_velocity', 'sar_consideration'],
          regulatoryThresholds: {
            bsa_sar: true
          }
        };
      }
    }

    return null;
  }

  /**
   * Detect geographic spread patterns
   */
  private async detectGeographicPattern(transaction: ComplianceTransaction): Promise<TransactionPattern | null> {
    if (!transaction.merchantLocation) return null;

    // This would check for impossible travel patterns
    // For now, return null as it requires more complex geolocation logic
    return null;
  }

  /**
   * Detect merchant concentration patterns
   */
  private async detectMerchantConcentrationPattern(transaction: ComplianceTransaction): Promise<TransactionPattern | null> {
    // Track merchant category concentration
    const merchantKey = `merchant_concentration:${transaction.cardContextHash}`;
    
    // Add to merchant category tracking
    await this.redis.hIncrBy(merchantKey, transaction.merchantCategory, 1);
    await this.redis.expire(merchantKey, this.MONITORING_CONFIG.PATTERN_WINDOW);

    // Check concentration
    const merchantCounts = await this.redis.hGetAll(merchantKey);
    const totalTransactions = Object.values(merchantCounts).reduce((sum, count) => sum + parseInt(count), 0);
    
    if (totalTransactions >= 10) {
      const maxCount = Math.max(...Object.values(merchantCounts).map(count => parseInt(count)));
      const concentration = maxCount / totalTransactions;

      if (concentration >= this.BSA_THRESHOLDS.MERCHANT_CONCENTRATION_THRESHOLD) {
        return {
          patternId: crypto.randomUUID(),
          cardContextHash: transaction.cardContextHash,
          patternType: 'merchant_concentration',
          detectedAt: new Date(),
          confidence: 0.7,
          riskLevel: 'medium',
          evidence: {
            dominantMerchantCategory: transaction.merchantCategory,
            concentrationRatio: concentration,
            totalTransactions,
            threshold: this.BSA_THRESHOLDS.MERCHANT_CONCENTRATION_THRESHOLD
          },
          complianceFlags: ['merchant_concentration'],
          regulatoryThresholds: {}
        };
      }
    }

    return null;
  }

  /**
   * Detect amount concentration patterns
   */
  private async detectAmountConcentrationPattern(transaction: ComplianceTransaction): Promise<TransactionPattern | null> {
    // Check for round amount patterns that might indicate structuring
    const isRoundAmount = this.isRoundAmount(transaction.amount);
    
    if (isRoundAmount && transaction.amount > 1000) {
      const roundAmountKey = `round_amounts:${transaction.cardContextHash}`;
      
      await this.redis.zAdd(roundAmountKey, {
        score: transaction.timestamp.getTime(),
        value: transaction.amount.toString()
      });
      
      await this.redis.expire(roundAmountKey, this.MONITORING_CONFIG.PATTERN_WINDOW);

      // Check for pattern of round amounts
      const dayAgo = Date.now() - (24 * 60 * 60 * 1000);
      const recentRoundAmounts = await this.redis.zRangeByScore(roundAmountKey, dayAgo, Date.now());

      if (recentRoundAmounts.length >= 3) {
        return {
          patternId: crypto.randomUUID(),
          cardContextHash: transaction.cardContextHash,
          patternType: 'amount_concentration',
          detectedAt: new Date(),
          confidence: 0.6,
          riskLevel: 'medium',
          evidence: {
            roundAmountCount: recentRoundAmounts.length,
            amounts: recentRoundAmounts.map(amount => parseFloat(amount)),
            pattern: 'round_amounts'
          },
          complianceFlags: ['round_amount_pattern', 'structuring_indicator'],
          regulatoryThresholds: {
            bsa_sar: recentRoundAmounts.length >= 5
          }
        };
      }
    }

    return null;
  }

  /**
   * Generate regulatory alerts based on patterns
   */
  private async generateRegulatoryAlerts(transaction: ComplianceTransaction, patterns: TransactionPattern[]): Promise<RegulatoryAlert[]> {
    const alerts: RegulatoryAlert[] = [];

    for (const pattern of patterns) {
      if (pattern.regulatoryThresholds.bsa_ctr) {
        alerts.push({
          alertId: crypto.randomUUID(),
          cardContextHash: transaction.cardContextHash,
          alertType: 'ctr_threshold',
          severity: 'critical',
          triggerTransaction: transaction.transactionId,
          aggregatedData: pattern.evidence,
          complianceActions: ['file_ctr', 'enhanced_monitoring'],
          regulatoryDeadline: new Date(Date.now() + (15 * 24 * 60 * 60 * 1000)), // 15 days
          escalationRequired: true,
          createdAt: new Date()
        });
      }

      if (pattern.regulatoryThresholds.bsa_sar) {
        alerts.push({
          alertId: crypto.randomUUID(),
          cardContextHash: transaction.cardContextHash,
          alertType: 'sar_pattern',
          severity: 'warning',
          triggerTransaction: transaction.transactionId,
          aggregatedData: pattern.evidence,
          complianceActions: ['investigate', 'consider_sar_filing'],
          regulatoryDeadline: new Date(Date.now() + (30 * 24 * 60 * 60 * 1000)), // 30 days
          escalationRequired: pattern.riskLevel === 'critical',
          createdAt: new Date()
        });
      }
    }

    return alerts;
  }

  /**
   * Determine overall compliance status
   */
  private determineComplianceStatus(
    patterns: TransactionPattern[],
    alerts: RegulatoryAlert[]
  ): 'compliant' | 'requires_review' | 'suspicious' | 'blocked' {
    const criticalAlerts = alerts.filter(alert => alert.severity === 'critical');
    const highRiskPatterns = patterns.filter(pattern => pattern.riskLevel === 'critical');

    if (criticalAlerts.length > 0 || highRiskPatterns.length > 0) {
      return 'blocked';
    }

    const warningAlerts = alerts.filter(alert => alert.severity === 'warning');
    const mediumRiskPatterns = patterns.filter(pattern => pattern.riskLevel === 'high');

    if (warningAlerts.length > 0 || mediumRiskPatterns.length > 0) {
      return 'suspicious';
    }

    if (patterns.length > 0 || alerts.length > 0) {
      return 'requires_review';
    }

    return 'compliant';
  }

  /**
   * Determine next compliance actions
   */
  private determineNextActions(
    patterns: TransactionPattern[],
    alerts: RegulatoryAlert[],
    complianceStatus: string
  ): string[] {
    const actions: string[] = [];

    if (complianceStatus === 'blocked') {
      actions.push('block_transaction', 'escalate_to_compliance', 'immediate_review');
    }

    if (complianceStatus === 'suspicious') {
      actions.push('enhanced_monitoring', 'manual_review', 'consider_sar_filing');
    }

    // Add specific actions based on alert types
    alerts.forEach(alert => {
      actions.push(...alert.complianceActions);
    });

    // Add specific actions based on pattern types
    patterns.forEach(pattern => {
      actions.push(...pattern.complianceFlags);
    });

    return [...new Set(actions)]; // Remove duplicates
  }

  /**
   * Monitor individual card context for patterns
   */
  private async monitorCardContext(cardContextHash: string): Promise<{
    patterns: TransactionPattern[];
    alerts: RegulatoryAlert[];
  }> {
    // This would analyze recent transactions for the card context
    // For now, return empty results
    return {
      patterns: [],
      alerts: []
    };
  }

  /**
   * Calculate comprehensive compliance metrics
   */
  private async calculateComplianceMetrics(cardContextHash: string, startTime: Date): Promise<MonitoringMetrics['metrics']> {
    // This would query transaction data and calculate metrics
    // For now, return mock metrics
    return {
      transactionCount: 25,
      totalVolume: 15000,
      averageAmount: 600,
      uniqueMerchants: 8,
      uniqueCountries: 2,
      suspiciousTransactions: 1,
      complianceFlags: 0,
      riskScore: 35
    };
  }

  /**
   * Check if metrics breach regulatory thresholds
   */
  private checkThresholdBreaches(metrics: MonitoringMetrics['metrics']): MonitoringMetrics['thresholdBreaches'] {
    return {
      velocityThreshold: metrics.transactionCount > 50,
      amountThreshold: metrics.totalVolume > this.BSA_THRESHOLDS.MONTHLY_VELOCITY,
      geographicThreshold: metrics.uniqueCountries > 5,
      merchantThreshold: metrics.uniqueMerchants < 3 && metrics.transactionCount > 10
    };
  }

  /**
   * Check if amount is considered "round" for pattern detection
   */
  private isRoundAmount(amount: number): boolean {
    return amount % 100 === 0 || amount % 50 === 0 || [1000, 2000, 2500, 5000, 7500, 10000].includes(amount);
  }

  /**
   * Split array into chunks for batch processing
   */
  private chunkArray<T>(array: T[], chunkSize: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += chunkSize) {
      chunks.push(array.slice(i, i + chunkSize));
    }
    return chunks;
  }

  /**
   * Cache monitoring result
   */
  private async cacheMonitoringResult(cardContextHash: string, result: any): Promise<void> {
    const cacheKey = `monitoring_result:${cardContextHash}`;
    try {
      await this.redis.setEx(cacheKey, TTL_CONFIG.ANALYTICS_CARD, JSON.stringify(result));
    } catch (error) {
      logger.error('Error caching monitoring result:', error);
    }
  }

  /**
   * Get cached metrics
   */
  private async getCachedMetrics(cardContextHash: string, timeWindow: string): Promise<MonitoringMetrics | null> {
    const cacheKey = `metrics:${cardContextHash}:${timeWindow}`;
    try {
      const cached = await this.redis.get(cacheKey);
      return cached ? JSON.parse(cached) : null;
    } catch (error) {
      logger.error('Error getting cached metrics:', error);
      return null;
    }
  }

  /**
   * Cache metrics
   */
  private async cacheMetrics(cardContextHash: string, timeWindow: string, metrics: MonitoringMetrics): Promise<void> {
    const cacheKey = `metrics:${cardContextHash}:${timeWindow}`;
    try {
      await this.redis.setEx(cacheKey, TTL_CONFIG.ANALYTICS_CARD, JSON.stringify(metrics));
    } catch (error) {
      logger.error('Error caching metrics:', error);
    }
  }

  /**
   * Check if cached metrics are still fresh
   */
  private isMetricsFresh(metrics: MonitoringMetrics, timeWindow: string): boolean {
    const maxAge = timeWindow === '1h' ? 5 * 60 * 1000 : 30 * 60 * 1000; // 5 min for 1h window, 30 min for others
    return (Date.now() - metrics.generatedAt.getTime()) < maxAge;
  }

  /**
   * Log monitoring events for audit trail
   */
  private async logMonitoringEvent(
    eventType: string,
    transactionId: string | null,
    cardContextHash: string | null,
    eventData: any
  ): Promise<void> {
    try {
      await this.supabase
        .from('compliance_audit')
        .insert({
          audit_event_type: eventType,
          user_context_hash: null,
          card_context_hash: cardContextHash,
          event_category: 'transaction_monitoring',
          event_description: `Transaction monitoring ${eventType}`,
          before_data: null,
          after_data: eventData,
          event_hash: crypto.createHash('sha256').update(`${eventType}-${transactionId}-${Date.now()}`).digest('hex'),
          retention_until: new Date(Date.now() + (7 * 365 * 24 * 60 * 60 * 1000)).toISOString(), // 7 years
        });
    } catch (error) {
      logger.error('Error logging monitoring event:', error);
    }
  }

  /**
   * Disconnect from services
   */
  async disconnect(): Promise<void> {
    await this.redis.disconnect();
    await this.amlService.disconnect();
  }
}