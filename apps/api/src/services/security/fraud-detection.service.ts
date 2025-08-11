import { supabase } from '../../utils/supabase';
import { TransactionIsolationService } from '../privacy/transaction-isolation.service';
import { createClient } from 'redis';
import { logger } from '../../utils/logger';

export interface Transaction {
  id: string;
  cardId: string;
  amount: number;
  merchantName: string;
  merchantCategory: string;
  merchantLocation?: {
    lat: number;
    lon: number;
  };
  timestamp: Date;
  currency: string;
}

export interface FraudAnalysisResult {
  riskScore: number; // 0-100
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  anomalies: FraudAnomaly[];
  recommendedAction: 'none' | 'alert' | 'freeze' | 'decline';
  analysisTimestamp: Date;
}

export interface FraudAnomaly {
  type: 'velocity' | 'amount' | 'geographic' | 'merchant' | 'pattern';
  severity: 'low' | 'medium' | 'high';
  details: string;
  confidence: number; // 0-1
}

interface TransactionPattern {
  avgAmount: number;
  stdDevAmount: number;
  commonMerchantCategories: Map<string, number>;
  lastLocation?: { lat: number; lon: number };
  lastTransactionTime?: Date;
  transactionCount: number;
}

export class FraudDetectionService {
  private redis: ReturnType<typeof createClient>;
  private isolationService: TransactionIsolationService;
  
  // Redis key patterns
  private readonly REDIS_KEYS = {
    VELOCITY: (cardId: string) => `fraud:velocity:${cardId}`,
    PATTERNS: (cardId: string) => `fraud:patterns:${cardId}`,
    SCORE: (cardId: string) => `fraud:score:${cardId}`,
    RATE_LIMIT: (cardId: string) => `fraud:ratelimit:${cardId}`
  };

  // TTL configurations
  private readonly TTL = {
    VELOCITY: 300, // 5 minutes
    PATTERNS: 3600, // 1 hour
    SCORE: 60, // 1 minute
    RATE_LIMIT: 60 // 1 minute
  };

  // Fraud detection thresholds
  private readonly THRESHOLDS = {
    VELOCITY_LIMIT: 5, // Max transactions in 5 minutes
    VELOCITY_WINDOW: 300, // 5 minutes in seconds
    AMOUNT_MULTIPLIER: 3, // 3x average amount
    DISTANCE_THRESHOLD: 500, // miles
    HIGH_RISK_MCC: ['7995', '5967', '5122'], // Gambling, MLM, Drugs
    RISK_SCORE_ALERT: 50,
    RISK_SCORE_FREEZE: 75,
    RISK_SCORE_DECLINE: 90
  };

  constructor() {
    this.redis = createClient({
      url: process.env.REDIS_URL
    });
    this.redis.connect().catch(err => {
      logger.error('Redis connection failed:', err);
    });
    this.isolationService = new TransactionIsolationService(supabase);
  }

  async analyzeTransaction(transaction: Transaction): Promise<FraudAnalysisResult> {
    const startTime = Date.now();
    
    try {
      // Enforce isolation context
      await this.isolationService.enforceTransactionIsolation(transaction.cardId);
      
      // Get cached score if available
      const cachedScore = await this.getCachedScore(transaction.cardId);
      if (cachedScore) {
        return cachedScore;
      }

      // Perform concurrent anomaly checks
      const [
        velocityAnomaly,
        amountAnomaly,
        geographicAnomaly,
        merchantAnomaly,
        patternAnomaly
      ] = await Promise.all([
        this.checkVelocityAnomaly(transaction),
        this.checkAmountAnomaly(transaction),
        this.checkGeographicAnomaly(transaction),
        this.checkMerchantAnomaly(transaction),
        this.checkPatternAnomaly(transaction)
      ]);

      // Collect all anomalies
      const anomalies: FraudAnomaly[] = [];
      if (velocityAnomaly) anomalies.push(velocityAnomaly);
      if (amountAnomaly) anomalies.push(amountAnomaly);
      if (geographicAnomaly) anomalies.push(geographicAnomaly);
      if (merchantAnomaly) anomalies.push(merchantAnomaly);
      if (patternAnomaly) anomalies.push(patternAnomaly);

      // Calculate risk score
      const riskScore = this.calculateRiskScore(anomalies);
      const riskLevel = this.determineRiskLevel(riskScore);
      const recommendedAction = this.determineAction(riskScore);

      const result: FraudAnalysisResult = {
        riskScore,
        riskLevel,
        anomalies,
        recommendedAction,
        analysisTimestamp: new Date()
      };

      // Cache the result
      await this.cacheScore(transaction.cardId, result);
      
      // Update transaction patterns for future analysis
      await this.updateTransactionPatterns(transaction);

      // Log performance metrics
      const analysisTime = Date.now() - startTime;
      if (analysisTime > 200) {
        logger.warn(`Fraud analysis took ${analysisTime}ms for card ${transaction.cardId}`);
      }

      return result;
    } catch (error) {
      logger.error('Fraud analysis failed:', error);
      throw new Error('Failed to analyze transaction for fraud');
    }
  }

  private async checkVelocityAnomaly(transaction: Transaction): Promise<FraudAnomaly | null> {
    const velocityKey = this.REDIS_KEYS.VELOCITY(transaction.cardId);
    
    // Add transaction to velocity tracking
    await this.redis.zAdd(velocityKey, {
      score: Date.now(),
      value: transaction.id
    });
    
    // Set TTL
    await this.redis.expire(velocityKey, this.TTL.VELOCITY);
    
    // Count recent transactions
    const windowStart = Date.now() - (this.THRESHOLDS.VELOCITY_WINDOW * 1000);
    const recentCount = await this.redis.zCount(velocityKey, windowStart, Date.now());
    
    if (recentCount > this.THRESHOLDS.VELOCITY_LIMIT) {
      return {
        type: 'velocity',
        severity: 'high',
        details: `${recentCount} transactions in ${this.THRESHOLDS.VELOCITY_WINDOW / 60} minutes exceeds limit of ${this.THRESHOLDS.VELOCITY_LIMIT}`,
        confidence: 0.9
      };
    }
    
    return null;
  }

  private async checkAmountAnomaly(transaction: Transaction): Promise<FraudAnomaly | null> {
    const pattern = await this.getTransactionPattern(transaction.cardId);
    
    if (!pattern || pattern.transactionCount < 5) {
      // Not enough history to determine anomaly
      return null;
    }
    
    const deviation = Math.abs(transaction.amount - pattern.avgAmount);
    const threshold = pattern.avgAmount * this.THRESHOLDS.AMOUNT_MULTIPLIER;
    
    if (transaction.amount > threshold) {
      return {
        type: 'amount',
        severity: transaction.amount > threshold * 2 ? 'high' : 'medium',
        details: `Transaction amount $${transaction.amount} is ${(transaction.amount / pattern.avgAmount).toFixed(1)}x the average`,
        confidence: 0.8
      };
    }
    
    return null;
  }

  private async checkGeographicAnomaly(transaction: Transaction): Promise<FraudAnomaly | null> {
    if (!transaction.merchantLocation) {
      return null;
    }
    
    const pattern = await this.getTransactionPattern(transaction.cardId);
    
    if (!pattern || !pattern.lastLocation) {
      // No location history
      return null;
    }
    
    const distance = this.calculateDistance(
      pattern.lastLocation,
      transaction.merchantLocation
    );
    
    if (distance > this.THRESHOLDS.DISTANCE_THRESHOLD) {
      const timeDiff = pattern.lastTransactionTime ? 
        (transaction.timestamp.getTime() - pattern.lastTransactionTime.getTime()) / 1000 / 60 : 0;
      
      const impossibleSpeed = timeDiff > 0 && (distance / (timeDiff / 60)) > 600; // 600 mph
      
      return {
        type: 'geographic',
        severity: impossibleSpeed ? 'high' : 'medium',
        details: `Transaction ${distance.toFixed(0)} miles from last location${impossibleSpeed ? ' (impossible travel speed)' : ''}`,
        confidence: impossibleSpeed ? 0.95 : 0.7
      };
    }
    
    return null;
  }

  private async checkMerchantAnomaly(transaction: Transaction): Promise<FraudAnomaly | null> {
    // Check high-risk merchant categories
    if (this.THRESHOLDS.HIGH_RISK_MCC.includes(transaction.merchantCategory)) {
      return {
        type: 'merchant',
        severity: 'medium',
        details: `High-risk merchant category: ${transaction.merchantCategory}`,
        confidence: 0.6
      };
    }
    
    // Check unusual merchant for this card
    const pattern = await this.getTransactionPattern(transaction.cardId);
    
    if (pattern && pattern.transactionCount > 10) {
      const categoryFrequency = pattern.commonMerchantCategories.get(transaction.merchantCategory) || 0;
      const isUnusual = categoryFrequency === 0;
      
      if (isUnusual) {
        return {
          type: 'merchant',
          severity: 'low',
          details: `First transaction with merchant category ${transaction.merchantCategory}`,
          confidence: 0.5
        };
      }
    }
    
    return null;
  }

  private async checkPatternAnomaly(transaction: Transaction): Promise<FraudAnomaly | null> {
    // Check for unusual time patterns (e.g., 3 AM transactions)
    const hour = transaction.timestamp.getHours();
    if (hour >= 2 && hour <= 5) {
      return {
        type: 'pattern',
        severity: 'low',
        details: 'Transaction during unusual hours (2-5 AM)',
        confidence: 0.4
      };
    }
    
    return null;
  }

  private calculateRiskScore(anomalies: FraudAnomaly[]): number {
    if (anomalies.length === 0) return 0;
    
    let totalScore = 0;
    let totalWeight = 0;
    
    const severityWeights = {
      low: 1,
      medium: 2,
      high: 3
    };
    
    const typeWeights = {
      velocity: 3,
      amount: 2.5,
      geographic: 2.5,
      merchant: 1.5,
      pattern: 1
    };
    
    for (const anomaly of anomalies) {
      const severityWeight = severityWeights[anomaly.severity];
      const typeWeight = typeWeights[anomaly.type];
      const confidence = anomaly.confidence;
      
      const anomalyScore = severityWeight * typeWeight * confidence * 10;
      totalScore += anomalyScore;
      totalWeight += typeWeight;
    }
    
    // Normalize to 0-100 scale
    const normalizedScore = Math.min(100, (totalScore / totalWeight) * 10);
    return Math.round(normalizedScore);
  }

  private determineRiskLevel(riskScore: number): 'low' | 'medium' | 'high' | 'critical' {
    if (riskScore >= 75) return 'critical';
    if (riskScore >= 50) return 'high';
    if (riskScore >= 25) return 'medium';
    return 'low';
  }

  private determineAction(riskScore: number): 'none' | 'alert' | 'freeze' | 'decline' {
    if (riskScore >= this.THRESHOLDS.RISK_SCORE_DECLINE) return 'decline';
    if (riskScore >= this.THRESHOLDS.RISK_SCORE_FREEZE) return 'freeze';
    if (riskScore >= this.THRESHOLDS.RISK_SCORE_ALERT) return 'alert';
    return 'none';
  }

  private async getCachedScore(cardId: string): Promise<FraudAnalysisResult | null> {
    const cached = await this.redis.get(this.REDIS_KEYS.SCORE(cardId));
    if (cached) {
      return JSON.parse(cached);
    }
    return null;
  }

  private async cacheScore(cardId: string, result: FraudAnalysisResult): Promise<void> {
    await this.redis.setEx(
      this.REDIS_KEYS.SCORE(cardId),
      this.TTL.SCORE,
      JSON.stringify(result)
    );
  }

  private async getTransactionPattern(cardId: string): Promise<TransactionPattern | null> {
    const cached = await this.redis.get(this.REDIS_KEYS.PATTERNS(cardId));
    if (cached) {
      const parsed = JSON.parse(cached);
      // Convert Map from JSON
      parsed.commonMerchantCategories = new Map(parsed.commonMerchantCategories);
      if (parsed.lastTransactionTime) {
        parsed.lastTransactionTime = new Date(parsed.lastTransactionTime);
      }
      return parsed;
    }
    
    // Load from database if not cached
    return this.loadTransactionPatternFromDB(cardId);
  }

  private async loadTransactionPatternFromDB(cardId: string): Promise<TransactionPattern | null> {
    try {
      // Ensure isolation context
      const isolationContext = await this.isolationService.getCardContext(cardId);
      
      // Query recent transactions for this card only
      const { data: transactions, error } = await supabase
        .from('payment_transactions')
        .select('amount, merchant_category, merchant_location, created_at')
        .eq('card_context_hash', isolationContext.cardContextHash)
        .order('created_at', { ascending: false })
        .limit(100);
      
      if (error || !transactions || transactions.length === 0) {
        return null;
      }
      
      // Calculate patterns
      const amounts = transactions.map(t => t.amount);
      const avgAmount = amounts.reduce((a, b) => a + b, 0) / amounts.length;
      const variance = amounts.reduce((acc, val) => acc + Math.pow(val - avgAmount, 2), 0) / amounts.length;
      const stdDevAmount = Math.sqrt(variance);
      
      // Count merchant categories
      const categoryMap = new Map<string, number>();
      transactions.forEach(t => {
        const count = categoryMap.get(t.merchant_category) || 0;
        categoryMap.set(t.merchant_category, count + 1);
      });
      
      // Get last location and time
      const lastTransaction = transactions[0];
      
      const pattern: TransactionPattern = {
        avgAmount,
        stdDevAmount,
        commonMerchantCategories: categoryMap,
        lastLocation: lastTransaction.merchant_location,
        lastTransactionTime: new Date(lastTransaction.created_at),
        transactionCount: transactions.length
      };
      
      // Cache the pattern
      await this.cacheTransactionPattern(cardId, pattern);
      
      return pattern;
    } catch (error) {
      logger.error('Failed to load transaction pattern:', error);
      return null;
    }
  }

  private async cacheTransactionPattern(cardId: string, pattern: TransactionPattern): Promise<void> {
    const toCache = {
      ...pattern,
      commonMerchantCategories: Array.from(pattern.commonMerchantCategories.entries())
    };
    
    await this.redis.setEx(
      this.REDIS_KEYS.PATTERNS(cardId),
      this.TTL.PATTERNS,
      JSON.stringify(toCache)
    );
  }

  private async updateTransactionPatterns(transaction: Transaction): Promise<void> {
    const pattern = await this.getTransactionPattern(transaction.cardId) || {
      avgAmount: transaction.amount,
      stdDevAmount: 0,
      commonMerchantCategories: new Map(),
      lastLocation: transaction.merchantLocation,
      lastTransactionTime: transaction.timestamp,
      transactionCount: 0
    };
    
    // Update rolling average
    const newCount = pattern.transactionCount + 1;
    pattern.avgAmount = ((pattern.avgAmount * pattern.transactionCount) + transaction.amount) / newCount;
    pattern.transactionCount = newCount;
    
    // Update merchant categories
    const categoryCount = pattern.commonMerchantCategories.get(transaction.merchantCategory) || 0;
    pattern.commonMerchantCategories.set(transaction.merchantCategory, categoryCount + 1);
    
    // Update last location and time
    if (transaction.merchantLocation) {
      pattern.lastLocation = transaction.merchantLocation;
    }
    pattern.lastTransactionTime = transaction.timestamp;
    
    // Cache updated pattern
    await this.cacheTransactionPattern(transaction.cardId, pattern);
  }

  private calculateDistance(loc1: { lat: number; lon: number }, loc2: { lat: number; lon: number }): number {
    const R = 3959; // Earth radius in miles
    const dLat = this.toRad(loc2.lat - loc1.lat);
    const dLon = this.toRad(loc2.lon - loc1.lon);
    const lat1 = this.toRad(loc1.lat);
    const lat2 = this.toRad(loc2.lat);
    
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.sin(dLon / 2) * Math.sin(dLon / 2) * Math.cos(lat1) * Math.cos(lat2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    
    return R * c;
  }

  private toRad(deg: number): number {
    return deg * (Math.PI / 180);
  }

  async disconnect(): Promise<void> {
    await this.redis.disconnect();
  }
}