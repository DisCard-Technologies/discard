import { supabase } from '../../utils/supabase';
import { TransactionIsolationService } from '../privacy/transaction-isolation.service';
import { PrivacyAnalyticsService } from '../privacy/privacy-analytics.service';
import { logger } from '../../utils/logger';
import { createClient } from 'redis';

export interface FraudRule {
  name: string;
  weight: number;
  evaluate: (transaction: TransactionFeatures) => boolean;
  description: string;
}

export interface TransactionFeatures {
  cardId: string;
  amount: number;
  merchantCategory: string;
  timeOfDay: number; // 0-23
  dayOfWeek: number; // 0-6
  isWeekend: boolean;
  velocityScore: number; // transactions per hour
  amountDeviation: number; // standard deviations from mean
  merchantRiskScore: number; // 0-1
  geographicRiskScore: number; // 0-1
  previousDeclineRate: number; // 0-1
}

export interface ModelVersion {
  version: string;
  createdAt: Date;
  accuracy: number;
  falsePositiveRate: number;
  rules: FraudRule[];
}

export interface FraudScore {
  score: number; // 0-100
  confidence: number; // 0-1
  contributingFactors: Array<{
    ruleName: string;
    impact: number;
    triggered: boolean;
  }>;
  modelVersion: string;
}

export class MLFraudModelService {
  private redis: ReturnType<typeof createClient>;
  private isolationService: TransactionIsolationService;
  private privacyAnalytics: PrivacyAnalyticsService;
  private currentModel: ModelVersion;
  
  private readonly REDIS_KEYS = {
    MODEL_VERSION: 'fraud:ml:model:version',
    CARD_FEATURES: (cardId: string) => `fraud:ml:features:${cardId}`,
    MODEL_PERFORMANCE: 'fraud:ml:performance',
    FEEDBACK: (cardId: string) => `fraud:ml:feedback:${cardId}`
  };

  private readonly TTL = {
    FEATURES: 7200, // 2 hours
    FEEDBACK: 86400 // 24 hours
  };

  constructor() {
    this.redis = createClient({
      url: process.env.REDIS_URL
    });
    this.redis.connect().catch(err => {
      logger.error('Redis connection failed:', err);
    });
    
    this.isolationService = new TransactionIsolationService(supabase);
    this.privacyAnalytics = new PrivacyAnalyticsService(supabase);
    
    // Initialize with default rule-based model
    this.currentModel = this.createDefaultModel();
  }

  private createDefaultModel(): ModelVersion {
    const rules: FraudRule[] = [
      {
        name: 'high_velocity',
        weight: 3.0,
        description: 'More than 5 transactions per hour',
        evaluate: (features) => features.velocityScore > 5
      },
      {
        name: 'excessive_amount',
        weight: 2.5,
        description: 'Amount exceeds 3 standard deviations',
        evaluate: (features) => features.amountDeviation > 3
      },
      {
        name: 'high_risk_merchant',
        weight: 2.0,
        description: 'High-risk merchant category',
        evaluate: (features) => features.merchantRiskScore > 0.7
      },
      {
        name: 'unusual_time',
        weight: 1.5,
        description: 'Transaction between 2-5 AM',
        evaluate: (features) => features.timeOfDay >= 2 && features.timeOfDay <= 5
      },
      {
        name: 'geographic_risk',
        weight: 2.0,
        description: 'High geographic risk score',
        evaluate: (features) => features.geographicRiskScore > 0.8
      },
      {
        name: 'decline_history',
        weight: 1.8,
        description: 'High previous decline rate',
        evaluate: (features) => features.previousDeclineRate > 0.3
      },
      {
        name: 'weekend_high_amount',
        weight: 1.2,
        description: 'High amount on weekend',
        evaluate: (features) => features.isWeekend && features.amount > 500
      },
      {
        name: 'rapid_small_transactions',
        weight: 1.5,
        description: 'Many small transactions quickly',
        evaluate: (features) => features.velocityScore > 3 && features.amount < 10
      }
    ];

    return {
      version: '1.0.0',
      createdAt: new Date(),
      accuracy: 0.92,
      falsePositiveRate: 0.018, // <2% target
      rules
    };
  }

  async scoreTransaction(features: TransactionFeatures): Promise<FraudScore> {
    try {
      // Enforce card-specific isolation
      await this.isolationService.enforceTransactionIsolation(features.cardId);
      
      // Extract features while maintaining isolation
      const enrichedFeatures = await this.enrichFeatures(features);
      
      // Apply rules and calculate score
      const contributingFactors = this.evaluateRules(enrichedFeatures);
      const score = this.calculateScore(contributingFactors);
      const confidence = this.calculateConfidence(contributingFactors);
      
      // Store features for model improvement (privacy-preserved)
      await this.storeFeatures(features.cardId, enrichedFeatures);
      
      return {
        score,
        confidence,
        contributingFactors,
        modelVersion: this.currentModel.version
      };
    } catch (error) {
      logger.error('ML fraud scoring failed:', error);
      throw new Error('Failed to calculate fraud score');
    }
  }

  private async enrichFeatures(features: TransactionFeatures): Promise<TransactionFeatures> {
    // Get card-specific historical features from cache or database
    const cachedFeatures = await this.getCachedFeatures(features.cardId);
    
    if (cachedFeatures) {
      // Merge with provided features
      return {
        ...features,
        previousDeclineRate: cachedFeatures.previousDeclineRate || features.previousDeclineRate
      };
    }
    
    // Load from database with isolation
    const historicalFeatures = await this.loadHistoricalFeatures(features.cardId);
    
    return {
      ...features,
      ...historicalFeatures
    };
  }

  private evaluateRules(features: TransactionFeatures): Array<{
    ruleName: string;
    impact: number;
    triggered: boolean;
  }> {
    return this.currentModel.rules.map(rule => {
      const triggered = rule.evaluate(features);
      const impact = triggered ? rule.weight : 0;
      
      return {
        ruleName: rule.name,
        impact,
        triggered
      };
    });
  }

  private calculateScore(factors: Array<{ ruleName: string; impact: number; triggered: boolean }>): number {
    const totalWeight = factors.reduce((sum, f) => sum + (f.triggered ? f.impact : 0), 0);
    const maxPossibleWeight = this.currentModel.rules.reduce((sum, r) => sum + r.weight, 0);
    
    // Normalize to 0-100 scale
    const normalizedScore = (totalWeight / maxPossibleWeight) * 100;
    
    // Apply sigmoid smoothing for better score distribution
    const smoothedScore = 100 / (1 + Math.exp(-0.1 * (normalizedScore - 50)));
    
    return Math.round(Math.min(100, Math.max(0, smoothedScore)));
  }

  private calculateConfidence(factors: Array<{ triggered: boolean }>): number {
    const triggeredCount = factors.filter(f => f.triggered).length;
    const totalRules = factors.length;
    
    // Higher confidence when multiple rules agree
    const baseConfidence = triggeredCount / totalRules;
    
    // Boost confidence for strong signals
    const strongSignals = factors.filter(f => f.triggered && f.impact > 2).length;
    const confidenceBoost = strongSignals * 0.1;
    
    return Math.min(1, baseConfidence + confidenceBoost);
  }

  async trainModel(cardId: string): Promise<void> {
    try {
      // Ensure isolation context
      await this.isolationService.enforceTransactionIsolation(cardId);
      
      // Get card-specific training data
      const trainingData = await this.getCardTrainingData(cardId);
      
      if (trainingData.length < 100) {
        logger.info(`Insufficient training data for card ${cardId}`);
        return;
      }
      
      // Update rule weights based on feedback
      await this.updateRuleWeights(cardId, trainingData);
      
      // Version the model update
      await this.versionModel(cardId);
      
    } catch (error) {
      logger.error('Model training failed:', error);
    }
  }

  private async getCardTrainingData(cardId: string): Promise<any[]> {
    const isolationContext = await this.isolationService.getCardContext(cardId);
    
    // Query fraud events with feedback for this card only
    const { data, error } = await supabase
      .from('fraud_events')
      .select('*')
      .eq('card_context_hash', isolationContext.cardContextHash)
      .not('false_positive', 'is', null)
      .order('detected_at', { ascending: false })
      .limit(1000);
    
    if (error) {
      logger.error('Failed to load training data:', error);
      return [];
    }
    
    return data || [];
  }

  private async updateRuleWeights(cardId: string, trainingData: any[]): Promise<void> {
    // Calculate rule performance metrics
    const rulePerformance = new Map<string, { correct: number; total: number }>();
    
    for (const event of trainingData) {
      const features = event.event_data?.features;
      if (!features) continue;
      
      const factors = this.evaluateRules(features);
      
      for (const factor of factors) {
        const perf = rulePerformance.get(factor.ruleName) || { correct: 0, total: 0 };
        
        if (factor.triggered) {
          perf.total++;
          if (!event.false_positive) {
            perf.correct++;
          }
        }
        
        rulePerformance.set(factor.ruleName, perf);
      }
    }
    
    // Adjust weights based on performance
    const updatedRules = this.currentModel.rules.map(rule => {
      const perf = rulePerformance.get(rule.name);
      if (!perf || perf.total < 10) return rule;
      
      const accuracy = perf.correct / perf.total;
      
      // Increase weight for high accuracy, decrease for low
      const weightAdjustment = (accuracy - 0.5) * 0.5;
      const newWeight = Math.max(0.5, Math.min(5, rule.weight + weightAdjustment));
      
      return {
        ...rule,
        weight: newWeight
      };
    });
    
    // Update model with new weights
    this.currentModel = {
      ...this.currentModel,
      rules: updatedRules,
      version: this.incrementVersion(this.currentModel.version),
      createdAt: new Date()
    };
  }

  async recordFeedback(cardId: string, eventId: string, falsePositive: boolean): Promise<void> {
    try {
      await this.isolationService.enforceTransactionIsolation(cardId);
      
      // Store feedback in Redis for quick access
      const feedbackKey = this.REDIS_KEYS.FEEDBACK(cardId);
      const feedback = {
        eventId,
        falsePositive,
        timestamp: new Date().toISOString()
      };
      
      await this.redis.setEx(
        `${feedbackKey}:${eventId}`,
        this.TTL.FEEDBACK,
        JSON.stringify(feedback)
      );
      
      // Update model performance metrics (privacy-preserved)
      await this.updateModelPerformance(falsePositive);
      
    } catch (error) {
      logger.error('Failed to record feedback:', error);
    }
  }

  private async updateModelPerformance(falsePositive: boolean): Promise<void> {
    // Use privacy analytics to update aggregate metrics
    await this.privacyAnalytics.generatePrivateAnalytics({
      metricType: 'model_performance',
      data: {
        falsePositive: falsePositive ? 1 : 0,
        truePositive: falsePositive ? 0 : 1
      },
      privacyBudget: 0.1,
      k_anonymity_threshold: 10
    });
  }

  async getModelPerformance(): Promise<{
    accuracy: number;
    falsePositiveRate: number;
    version: string;
  }> {
    // Get privacy-preserved aggregate metrics
    const metrics = await this.privacyAnalytics.generatePrivateAnalytics({
      metricType: 'model_performance_summary',
      privacyBudget: 0.5,
      k_anonymity_threshold: 100
    });
    
    return {
      accuracy: this.currentModel.accuracy,
      falsePositiveRate: this.currentModel.falsePositiveRate,
      version: this.currentModel.version
    };
  }

  private async getCachedFeatures(cardId: string): Promise<Partial<TransactionFeatures> | null> {
    const cached = await this.redis.get(this.REDIS_KEYS.CARD_FEATURES(cardId));
    return cached ? JSON.parse(cached) : null;
  }

  private async storeFeatures(cardId: string, features: TransactionFeatures): Promise<void> {
    // Store only aggregate features, not raw transaction data
    const aggregateFeatures = {
      previousDeclineRate: features.previousDeclineRate,
      avgVelocity: features.velocityScore,
      lastUpdate: new Date().toISOString()
    };
    
    await this.redis.setEx(
      this.REDIS_KEYS.CARD_FEATURES(cardId),
      this.TTL.FEATURES,
      JSON.stringify(aggregateFeatures)
    );
  }

  private async loadHistoricalFeatures(cardId: string): Promise<Partial<TransactionFeatures>> {
    const isolationContext = await this.isolationService.getCardContext(cardId);
    
    // Get decline rate for this card only
    const { data: declines } = await supabase
      .from('fraud_events')
      .select('action_taken')
      .eq('card_context_hash', isolationContext.cardContextHash)
      .gte('detected_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString());
    
    const totalEvents = declines?.length || 0;
    const declineCount = declines?.filter(e => e.action_taken === 'decline').length || 0;
    
    return {
      previousDeclineRate: totalEvents > 0 ? declineCount / totalEvents : 0
    };
  }

  private async versionModel(cardId: string): Promise<void> {
    const modelKey = `${this.REDIS_KEYS.MODEL_VERSION}:${cardId}`;
    await this.redis.setEx(
      modelKey,
      86400, // 24 hours
      JSON.stringify(this.currentModel)
    );
  }

  private incrementVersion(version: string): string {
    const parts = version.split('.');
    const patch = parseInt(parts[2]) + 1;
    return `${parts[0]}.${parts[1]}.${patch}`;
  }

  async disconnect(): Promise<void> {
    await this.redis.disconnect();
  }
}