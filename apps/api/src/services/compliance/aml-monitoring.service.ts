import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { createClient as createRedisClient } from 'ioredis';
import { TransactionIsolationService } from '../privacy/transaction-isolation.service';
import { FraudDetectionService } from '../security/fraud-detection.service';
import { logger } from '../../utils/logger';
import * as crypto from 'crypto';

export interface AMLTransaction {
  transactionId: string;
  cardContextHash: string;
  amount: number;
  currency: string;
  timestamp: Date;
  merchantName: string;
  merchantCategory: string;
  transactionType: 'purchase' | 'withdrawal' | 'refund' | 'fee';
}

export interface SuspiciousActivity {
  activityId: string;
  cardContextHash: string;
  patternType: 'structuring' | 'rapid_movement' | 'unusual_velocity' | 'high_risk_merchant' | 'round_amount_pattern';
  riskScore: number; // 0-100
  confidenceLevel: number; // 0-1
  detectedAt: Date;
  evidenceData: Record<string, any>;
  threshold: number;
  actualValue: number;
}

export interface AMLAnalysisResult {
  suspiciousActivities: SuspiciousActivity[];
  overallRiskScore: number;
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  recommendedAction: 'none' | 'monitor' | 'review' | 'report_sar';
  analysisTimestamp: Date;
}

export class AMLMonitoringService {
  private supabase: SupabaseClient;
  private redis: ReturnType<typeof createRedisClient>;
  private isolationService: TransactionIsolationService;
  private fraudDetectionService: FraudDetectionService;
  
  // AML Detection Thresholds
  private readonly AML_THRESHOLDS = {
    STRUCTURING: {
      SINGLE_THRESHOLD: 9000, // Just under $10,000 CTR threshold
      DAILY_AGGREGATE: 10000,
      PATTERN_WINDOW_HOURS: 24,
      MIN_TRANSACTIONS: 3
    },
    RAPID_MOVEMENT: {
      TIME_WINDOW_MINUTES: 60,
      MIN_TRANSACTIONS: 5,
      AMOUNT_THRESHOLD: 5000
    },
    VELOCITY: {
      HOURLY_LIMIT: 10,
      DAILY_LIMIT: 50,
      AMOUNT_PER_HOUR: 25000
    },
    HIGH_RISK_MCC: ['7995', '5967', '5122', '7273', '4812'], // Gambling, MLM, Drugs, Dating, Telecom
    ROUND_AMOUNTS: {
      THRESHOLD_COUNT: 5, // 5 round amounts in pattern
      PATTERN_WINDOW_HOURS: 48
    }
  };

  // Redis key patterns for AML data
  private readonly REDIS_KEYS = {
    STRUCTURING_PATTERN: (cardContextHash: string) => `aml:structuring:${cardContextHash}`,
    VELOCITY_TRACKING: (cardContextHash: string) => `aml:velocity:${cardContextHash}`,
    ROUND_AMOUNTS: (cardContextHash: string) => `aml:round:${cardContextHash}`,
    ANALYSIS_CACHE: (cardContextHash: string) => `aml:analysis:${cardContextHash}`
  };

  private readonly TTL = {
    STRUCTURING: 86400, // 24 hours
    VELOCITY: 3600, // 1 hour
    ROUND_AMOUNTS: 172800, // 48 hours
    ANALYSIS_CACHE: 300 // 5 minutes
  };

  constructor(supabaseUrl: string, supabaseKey: string) {
    this.supabase = createClient(supabaseUrl, supabaseKey);
    this.redis = createRedisClient({
      url: process.env.REDIS_URL
    });
    this.redis.connect().catch(err => {
      logger.error('AML Redis connection failed:', err);
    });
    this.isolationService = new TransactionIsolationService(supabaseUrl, supabaseKey);
    this.fraudDetectionService = new FraudDetectionService();
  }

  /**
   * Analyze transaction for suspicious AML patterns
   */
  async analyzeTransaction(transaction: AMLTransaction): Promise<AMLAnalysisResult> {
    try {
      // Enforce transaction isolation context
      await this.isolationService.enforceTransactionIsolation(transaction.cardContextHash);

      // Check for cached analysis
      const cachedAnalysis = await this.getCachedAnalysis(transaction.cardContextHash);
      if (cachedAnalysis) {
        return cachedAnalysis;
      }

      // Perform concurrent AML pattern checks
      const [
        structuringActivity,
        rapidMovementActivity,
        velocityActivity,
        highRiskMerchantActivity,
        roundAmountActivity
      ] = await Promise.all([
        this.detectStructuringPattern(transaction),
        this.detectRapidMovementPattern(transaction),
        this.detectVelocityAnomaly(transaction),
        this.detectHighRiskMerchant(transaction),
        this.detectRoundAmountPattern(transaction)
      ]);

      // Collect all suspicious activities
      const suspiciousActivities: SuspiciousActivity[] = [];
      if (structuringActivity) suspiciousActivities.push(structuringActivity);
      if (rapidMovementActivity) suspiciousActivities.push(rapidMovementActivity);
      if (velocityActivity) suspiciousActivities.push(velocityActivity);
      if (highRiskMerchantActivity) suspiciousActivities.push(highRiskMerchantActivity);
      if (roundAmountActivity) suspiciousActivities.push(roundAmountActivity);

      // Calculate overall risk score
      const overallRiskScore = this.calculateOverallRiskScore(suspiciousActivities);
      const riskLevel = this.determineRiskLevel(overallRiskScore);
      const recommendedAction = this.determineRecommendedAction(overallRiskScore);

      const result: AMLAnalysisResult = {
        suspiciousActivities,
        overallRiskScore,
        riskLevel,
        recommendedAction,
        analysisTimestamp: new Date()
      };

      // Cache the analysis result
      await this.cacheAnalysis(transaction.cardContextHash, result);

      // Update transaction tracking data
      await this.updateTransactionTracking(transaction);

      return result;
    } catch (error) {
      logger.error('AML analysis failed:', { error, transactionId: transaction.transactionId });
      throw new Error('Failed to analyze transaction for AML compliance');
    }
  }

  /**
   * Detect structuring patterns (transactions designed to avoid reporting thresholds)
   */
  private async detectStructuringPattern(transaction: AMLTransaction): Promise<SuspiciousActivity | null> {
    try {
      const structuringKey = this.REDIS_KEYS.STRUCTURING_PATTERN(transaction.cardContextHash);
      
      // Add current transaction to pattern tracking
      const transactionData = {
        id: transaction.transactionId,
        amount: transaction.amount,
        timestamp: transaction.timestamp.getTime()
      };
      
      await this.redis.zAdd(structuringKey, {
        score: transaction.timestamp.getTime(),
        value: JSON.stringify(transactionData)
      });
      
      await this.redis.expire(structuringKey, this.TTL.STRUCTURING);

      // Check for structuring pattern in the last 24 hours
      const windowStart = Date.now() - (this.AML_THRESHOLDS.STRUCTURING.PATTERN_WINDOW_HOURS * 60 * 60 * 1000);
      const recentTransactions = await this.redis.zRangeByScore(structuringKey, windowStart, Date.now());

      if (recentTransactions.length < this.AML_THRESHOLDS.STRUCTURING.MIN_TRANSACTIONS) {
        return null;
      }

      // Parse transactions and calculate totals
      const transactions = recentTransactions.map(t => JSON.parse(t));
      const totalAmount = transactions.reduce((sum, t) => sum + t.amount, 0);
      const belowThresholdCount = transactions.filter(t => 
        t.amount < this.AML_THRESHOLDS.STRUCTURING.SINGLE_THRESHOLD && 
        t.amount > this.AML_THRESHOLDS.STRUCTURING.SINGLE_THRESHOLD * 0.8
      ).length;

      // Check for structuring patterns
      if (totalAmount >= this.AML_THRESHOLDS.STRUCTURING.DAILY_AGGREGATE && 
          belowThresholdCount >= this.AML_THRESHOLDS.STRUCTURING.MIN_TRANSACTIONS) {
        
        const riskScore = Math.min(100, 
          (totalAmount / this.AML_THRESHOLDS.STRUCTURING.DAILY_AGGREGATE) * 50 + 
          (belowThresholdCount / transactions.length) * 50
        );

        return {
          activityId: crypto.randomUUID(),
          cardContextHash: transaction.cardContextHash,
          patternType: 'structuring',
          riskScore: Math.round(riskScore),
          confidenceLevel: 0.8,
          detectedAt: new Date(),
          evidenceData: {
            totalAmount,
            transactionCount: transactions.length,
            belowThresholdCount,
            timeWindow: '24 hours',
            transactions: transactions.map(t => ({ id: t.id, amount: t.amount }))
          },
          threshold: this.AML_THRESHOLDS.STRUCTURING.DAILY_AGGREGATE,
          actualValue: totalAmount
        };
      }

      return null;
    } catch (error) {
      logger.error('Error detecting structuring pattern:', error);
      return null;
    }
  }

  /**
   * Detect rapid movement of funds
   */
  private async detectRapidMovementPattern(transaction: AMLTransaction): Promise<SuspiciousActivity | null> {
    try {
      // Get recent transaction history within isolation context
      const { data: recentTransactions, error } = await this.supabase
        .from('payment_transactions')
        .select('id, amount, created_at, transaction_type')
        .eq('card_context_hash', transaction.cardContextHash)
        .gte('created_at', new Date(Date.now() - (this.AML_THRESHOLDS.RAPID_MOVEMENT.TIME_WINDOW_MINUTES * 60 * 1000)).toISOString())
        .order('created_at', { ascending: false });

      if (error || !recentTransactions || recentTransactions.length < this.AML_THRESHOLDS.RAPID_MOVEMENT.MIN_TRANSACTIONS) {
        return null;
      }

      const totalAmount = recentTransactions.reduce((sum, t) => sum + Math.abs(t.amount), 0);
      const avgTimeBetween = this.calculateAverageTimeBetweenTransactions(recentTransactions);

      if (totalAmount >= this.AML_THRESHOLDS.RAPID_MOVEMENT.AMOUNT_THRESHOLD && avgTimeBetween < 10) { // Less than 10 minutes average
        const riskScore = Math.min(100, (totalAmount / this.AML_THRESHOLDS.RAPID_MOVEMENT.AMOUNT_THRESHOLD) * 60 + (10 / avgTimeBetween) * 40);

        return {
          activityId: crypto.randomUUID(),
          cardContextHash: transaction.cardContextHash,
          patternType: 'rapid_movement',
          riskScore: Math.round(riskScore),
          confidenceLevel: 0.7,
          detectedAt: new Date(),
          evidenceData: {
            totalAmount,
            transactionCount: recentTransactions.length,
            avgTimeBetween,
            timeWindow: `${this.AML_THRESHOLDS.RAPID_MOVEMENT.TIME_WINDOW_MINUTES} minutes`
          },
          threshold: this.AML_THRESHOLDS.RAPID_MOVEMENT.AMOUNT_THRESHOLD,
          actualValue: totalAmount
        };
      }

      return null;
    } catch (error) {
      logger.error('Error detecting rapid movement pattern:', error);
      return null;
    }
  }

  /**
   * Detect velocity anomalies for AML
   */
  private async detectVelocityAnomaly(transaction: AMLTransaction): Promise<SuspiciousActivity | null> {
    try {
      const velocityKey = this.REDIS_KEYS.VELOCITY_TRACKING(transaction.cardContextHash);
      
      // Track transaction for velocity analysis
      await this.redis.zAdd(velocityKey, {
        score: transaction.timestamp.getTime(),
        value: JSON.stringify({ id: transaction.transactionId, amount: transaction.amount })
      });
      
      await this.redis.expire(velocityKey, this.TTL.VELOCITY);

      // Check hourly velocity
      const hourStart = Date.now() - (60 * 60 * 1000);
      const hourlyTransactions = await this.redis.zRangeByScore(velocityKey, hourStart, Date.now());
      const hourlyCount = hourlyTransactions.length;
      const hourlyAmount = hourlyTransactions.reduce((sum, t) => sum + JSON.parse(t).amount, 0);

      if (hourlyCount > this.AML_THRESHOLDS.VELOCITY.HOURLY_LIMIT || 
          hourlyAmount > this.AML_THRESHOLDS.VELOCITY.AMOUNT_PER_HOUR) {
        
        const countRisk = (hourlyCount / this.AML_THRESHOLDS.VELOCITY.HOURLY_LIMIT) * 50;
        const amountRisk = (hourlyAmount / this.AML_THRESHOLDS.VELOCITY.AMOUNT_PER_HOUR) * 50;
        const riskScore = Math.min(100, Math.max(countRisk, amountRisk));

        return {
          activityId: crypto.randomUUID(),
          cardContextHash: transaction.cardContextHash,
          patternType: 'unusual_velocity',
          riskScore: Math.round(riskScore),
          confidenceLevel: 0.9,
          detectedAt: new Date(),
          evidenceData: {
            hourlyCount,
            hourlyAmount,
            countLimit: this.AML_THRESHOLDS.VELOCITY.HOURLY_LIMIT,
            amountLimit: this.AML_THRESHOLDS.VELOCITY.AMOUNT_PER_HOUR
          },
          threshold: Math.max(this.AML_THRESHOLDS.VELOCITY.HOURLY_LIMIT, this.AML_THRESHOLDS.VELOCITY.AMOUNT_PER_HOUR),
          actualValue: Math.max(hourlyCount, hourlyAmount)
        };
      }

      return null;
    } catch (error) {
      logger.error('Error detecting velocity anomaly:', error);
      return null;
    }
  }

  /**
   * Detect high-risk merchant transactions
   */
  private async detectHighRiskMerchant(transaction: AMLTransaction): Promise<SuspiciousActivity | null> {
    if (this.AML_THRESHOLDS.HIGH_RISK_MCC.includes(transaction.merchantCategory)) {
      return {
        activityId: crypto.randomUUID(),
        cardContextHash: transaction.cardContextHash,
        patternType: 'high_risk_merchant',
        riskScore: 60,
        confidenceLevel: 0.8,
        detectedAt: new Date(),
        evidenceData: {
          merchantCategory: transaction.merchantCategory,
          merchantName: transaction.merchantName,
          amount: transaction.amount
        },
        threshold: 1, // Binary threshold
        actualValue: 1
      };
    }

    return null;
  }

  /**
   * Detect round amount patterns that may indicate money laundering
   */
  private async detectRoundAmountPattern(transaction: AMLTransaction): Promise<SuspiciousActivity | null> {
    try {
      // Check if current transaction is a round amount
      const isRoundAmount = this.isRoundAmount(transaction.amount);
      if (!isRoundAmount) {
        return null;
      }

      const roundAmountKey = this.REDIS_KEYS.ROUND_AMOUNTS(transaction.cardContextHash);
      
      // Add to round amount tracking
      await this.redis.zAdd(roundAmountKey, {
        score: transaction.timestamp.getTime(),
        value: JSON.stringify({ id: transaction.transactionId, amount: transaction.amount })
      });
      
      await this.redis.expire(roundAmountKey, this.TTL.ROUND_AMOUNTS);

      // Check pattern within window
      const windowStart = Date.now() - (this.AML_THRESHOLDS.ROUND_AMOUNTS.PATTERN_WINDOW_HOURS * 60 * 60 * 1000);
      const roundTransactions = await this.redis.zRangeByScore(roundAmountKey, windowStart, Date.now());

      if (roundTransactions.length >= this.AML_THRESHOLDS.ROUND_AMOUNTS.THRESHOLD_COUNT) {
        const transactions = roundTransactions.map(t => JSON.parse(t));
        const totalAmount = transactions.reduce((sum, t) => sum + t.amount, 0);
        const avgAmount = totalAmount / transactions.length;

        return {
          activityId: crypto.randomUUID(),
          cardContextHash: transaction.cardContextHash,
          patternType: 'round_amount_pattern',
          riskScore: 45,
          confidenceLevel: 0.6,
          detectedAt: new Date(),
          evidenceData: {
            roundTransactionCount: transactions.length,
            totalAmount,
            avgAmount,
            timeWindow: `${this.AML_THRESHOLDS.ROUND_AMOUNTS.PATTERN_WINDOW_HOURS} hours`,
            amounts: transactions.map(t => t.amount)
          },
          threshold: this.AML_THRESHOLDS.ROUND_AMOUNTS.THRESHOLD_COUNT,
          actualValue: transactions.length
        };
      }

      return null;
    } catch (error) {
      logger.error('Error detecting round amount pattern:', error);
      return null;
    }
  }

  /**
   * Check if amount is considered "round" for AML purposes
   */
  private isRoundAmount(amount: number): boolean {
    // Check if amount ends in multiple zeros or is a common round number
    return amount % 100 === 0 || // Ends in 00
           amount % 50 === 0 ||  // Ends in 50 or 00
           [1000, 2000, 2500, 5000, 7500, 10000].includes(amount); // Common round amounts
  }

  /**
   * Calculate overall risk score from multiple suspicious activities
   */
  private calculateOverallRiskScore(activities: SuspiciousActivity[]): number {
    if (activities.length === 0) return 0;

    // Weight different pattern types
    const patternWeights = {
      structuring: 3.0,
      rapid_movement: 2.5,
      unusual_velocity: 2.0,
      high_risk_merchant: 1.5,
      round_amount_pattern: 1.0
    };

    let totalScore = 0;
    let totalWeight = 0;

    for (const activity of activities) {
      const weight = patternWeights[activity.patternType] || 1.0;
      const weightedScore = activity.riskScore * weight * activity.confidenceLevel;
      totalScore += weightedScore;
      totalWeight += weight;
    }

    // Apply compound risk for multiple patterns
    const baseScore = totalScore / totalWeight;
    const compoundMultiplier = 1 + (activities.length - 1) * 0.15; // 15% increase per additional pattern
    
    return Math.min(100, Math.round(baseScore * compoundMultiplier));
  }

  /**
   * Determine risk level from overall score
   */
  private determineRiskLevel(riskScore: number): 'low' | 'medium' | 'high' | 'critical' {
    if (riskScore >= 80) return 'critical';
    if (riskScore >= 60) return 'high';
    if (riskScore >= 35) return 'medium';
    return 'low';
  }

  /**
   * Determine recommended action based on risk score
   */
  private determineRecommendedAction(riskScore: number): 'none' | 'monitor' | 'review' | 'report_sar' {
    if (riskScore >= 75) return 'report_sar';
    if (riskScore >= 50) return 'review';
    if (riskScore >= 25) return 'monitor';
    return 'none';
  }

  /**
   * Get cached analysis result
   */
  private async getCachedAnalysis(cardContextHash: string): Promise<AMLAnalysisResult | null> {
    try {
      const cached = await this.redis.get(this.REDIS_KEYS.ANALYSIS_CACHE(cardContextHash));
      if (cached) {
        const parsed = JSON.parse(cached);
        parsed.analysisTimestamp = new Date(parsed.analysisTimestamp);
        parsed.suspiciousActivities = parsed.suspiciousActivities.map((activity: any) => ({
          ...activity,
          detectedAt: new Date(activity.detectedAt)
        }));
        return parsed;
      }
    } catch (error) {
      logger.error('Error getting cached analysis:', error);
    }
    return null;
  }

  /**
   * Cache analysis result
   */
  private async cacheAnalysis(cardContextHash: string, analysis: AMLAnalysisResult): Promise<void> {
    try {
      await this.redis.setEx(
        this.REDIS_KEYS.ANALYSIS_CACHE(cardContextHash),
        this.TTL.ANALYSIS_CACHE,
        JSON.stringify(analysis)
      );
    } catch (error) {
      logger.error('Error caching analysis:', error);
    }
  }

  /**
   * Update transaction tracking data
   */
  private async updateTransactionTracking(transaction: AMLTransaction): Promise<void> {
    // This would update any additional tracking needed for pattern detection
    // Implementation depends on specific AML requirements
  }

  /**
   * Calculate average time between transactions
   */
  private calculateAverageTimeBetweenTransactions(transactions: any[]): number {
    if (transactions.length < 2) return 0;

    const times = transactions.map(t => new Date(t.created_at).getTime()).sort();
    const intervals = [];
    
    for (let i = 1; i < times.length; i++) {
      intervals.push(times[i] - times[i - 1]);
    }

    const avgInterval = intervals.reduce((sum, interval) => sum + interval, 0) / intervals.length;
    return Math.round(avgInterval / (60 * 1000)); // Convert to minutes
  }

  /**
   * Integration with existing fraud detection service
   */
  async sharePatternRecognition(transaction: AMLTransaction): Promise<void> {
    try {
      const fraudTransaction = {
        id: transaction.transactionId,
        cardId: transaction.cardContextHash, // Using context hash for isolation
        amount: transaction.amount,
        merchantName: transaction.merchantName,
        merchantCategory: transaction.merchantCategory,
        timestamp: transaction.timestamp,
        currency: transaction.currency
      };

      const fraudAnalysis = await this.fraudDetectionService.analyzeTransaction(fraudTransaction);
      
      // Log correlation for compliance purposes (without breaking isolation)
      if (fraudAnalysis.riskLevel === 'high' || fraudAnalysis.riskLevel === 'critical') {
        logger.info('High fraud risk correlated with AML analysis', {
          transactionId: transaction.transactionId,
          fraudRiskScore: fraudAnalysis.riskScore,
          fraudRiskLevel: fraudAnalysis.riskLevel
        });
      }
    } catch (error) {
      logger.error('Error sharing pattern recognition with fraud detection:', error);
    }
  }

  /**
   * Disconnect from services
   */
  async disconnect(): Promise<void> {
    await this.redis.disconnect();
    await this.fraudDetectionService.disconnect();
  }
}