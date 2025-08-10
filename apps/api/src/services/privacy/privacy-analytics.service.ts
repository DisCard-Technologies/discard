import { createClient, SupabaseClient } from '@supabase/supabase-js';
import * as crypto from 'crypto';
import { logger } from '../../utils/logger';

interface PrivacyPreservingAnalytics {
  epsilon: number; // Privacy budget parameter
  delta: number; // Privacy failure probability
  sensitivity: number; // Query sensitivity
}

interface PrivateAnalyticsRequest {
  metricType: 'aggregate_spend' | 'transaction_count' | 'merchant_categories';
  timeRange: { start: string; end: string };
  privacyBudget: number;
  k_anonymity_threshold: number;
}

interface PrivateAnalyticsResult {
  value: number | Record<string, number>;
  confidenceInterval: { lower: number; upper: number };
  privacyBudgetConsumed: number;
  k_anonymity_satisfied: boolean;
  noiseLevel: number;
  timestamp: string;
}

interface DifferentialPrivacyConfig {
  totalEpsilonBudget: number;
  remainingBudget: number;
  budgetResetTime: Date;
  maxEpsilonPerQuery: number;
}

export class PrivacyAnalyticsService {
  private supabase: SupabaseClient;
  private privacyConfig: DifferentialPrivacyConfig;
  private readonly DEFAULT_EPSILON = 1.0;
  private readonly DEFAULT_DELTA = 0.000001;
  private readonly MIN_K_ANONYMITY = 5;

  constructor(supabaseUrl: string, supabaseKey: string) {
    this.supabase = createClient(supabaseUrl, supabaseKey);
    this.privacyConfig = {
      totalEpsilonBudget: 10.0, // Daily budget
      remainingBudget: 10.0,
      budgetResetTime: this.getNextResetTime(),
      maxEpsilonPerQuery: 2.0
    };
  }

  /**
   * Generate privacy-preserving analytics with differential privacy
   */
  async generatePrivateAnalytics(
    query: PrivateAnalyticsRequest
  ): Promise<PrivateAnalyticsResult> {
    try {
      // Validate input parameters
      this.validateAnalyticsRequest(query);
      
      // Validate privacy budget
      if (!this.validatePrivacyBudget(query.privacyBudget)) {
        throw new Error('Insufficient privacy budget');
      }

      // Check for potential inference attacks
      const queryHistory = await this.getRecentQueryHistory();
      if (await this.detectInferenceAttack([...queryHistory, query])) {
        throw new Error('Query pattern suggests potential inference attack');
      }

      // Execute appropriate analytics based on metric type
      let result: PrivateAnalyticsResult;
      
      switch (query.metricType) {
        case 'aggregate_spend':
          result = await this.computePrivateAggregateSpend(query);
          break;
        case 'transaction_count':
          result = await this.computePrivateTransactionCount(query);
          break;
        case 'merchant_categories':
          result = await this.computePrivateMerchantCategories(query);
          break;
        default:
          throw new Error('Unsupported metric type');
      }

      // Consume privacy budget
      await this.consumePrivacyBudget(query.privacyBudget);
      
      // Log query for inference detection
      await this.logQueryHistory(query);

      return result;
    } catch (error) {
      logger.error('Error generating private analytics', { 
        error: error instanceof Error ? error.message : 'Unknown error',
        metricType: query.metricType 
      });
      throw error;
    }
  }

  /**
   * Compute private aggregate spend with differential privacy
   */
  private async computePrivateAggregateSpend(
    query: PrivateAnalyticsRequest
  ): Promise<PrivateAnalyticsResult> {
    try {
      // Get true aggregate (would be filtered by RLS)
      const { data, error } = await this.supabase.rpc('private_aggregate_sum', {
        p_table_name: 'payment_transactions',
        p_column_name: 'amount',
        p_epsilon: query.privacyBudget,
        p_sensitivity: 1000 // Max transaction amount
      });

      if (error) throw error;

      const trueValue = data || 0;
      const noise = this.generateLaplaceNoise(query.privacyBudget, 1000);
      const privateValue = Math.max(0, trueValue + noise);

      // Verify k-anonymity
      const kAnonymitySatisfied = await this.verifyKAnonymity(query, 'payment_transactions');

      return {
        value: privateValue,
        confidenceInterval: this.calculateConfidenceInterval(privateValue, noise, query.privacyBudget),
        privacyBudgetConsumed: query.privacyBudget,
        k_anonymity_satisfied: kAnonymitySatisfied,
        noiseLevel: Math.abs(noise),
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      logger.error('Error computing private aggregate spend', { error });
      throw error;
    }
  }

  /**
   * Compute private transaction count with differential privacy
   */
  private async computePrivateTransactionCount(
    query: PrivateAnalyticsRequest
  ): Promise<PrivateAnalyticsResult> {
    try {
      // Get true count (filtered by RLS)
      const { count, error } = await this.supabase
        .from('payment_transactions')
        .select('*', { count: 'exact', head: true })
        .gte('created_at', query.timeRange.start)
        .lte('created_at', query.timeRange.end);

      if (error) throw error;

      const trueCount = count || 0;
      const sensitivity = 1; // Each user contributes at most 1 to the count
      const noise = this.generateLaplaceNoise(query.privacyBudget, sensitivity);
      const privateCount = Math.max(0, Math.round(trueCount + noise));

      // Verify k-anonymity
      const kAnonymitySatisfied = trueCount >= query.k_anonymity_threshold;

      return {
        value: privateCount,
        confidenceInterval: this.calculateConfidenceInterval(privateCount, noise, query.privacyBudget),
        privacyBudgetConsumed: query.privacyBudget,
        k_anonymity_satisfied: kAnonymitySatisfied,
        noiseLevel: Math.abs(noise),
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      logger.error('Error computing private transaction count', { error });
      throw error;
    }
  }

  /**
   * Compute private merchant category distribution
   */
  private async computePrivateMerchantCategories(
    query: PrivateAnalyticsRequest
  ): Promise<PrivateAnalyticsResult> {
    try {
      // Get true category distribution (filtered by RLS)
      const { data, error } = await this.supabase
        .from('payment_transactions')
        .select('merchant_category')
        .gte('created_at', query.timeRange.start)
        .lte('created_at', query.timeRange.end);

      if (error) throw error;

      // Count by category
      const categoryCounts: Record<string, number> = {};
      for (const row of data || []) {
        const category = row.merchant_category || 'unknown';
        categoryCounts[category] = (categoryCounts[category] || 0) + 1;
      }

      // Add noise to each category count
      const privateCounts: Record<string, number> = {};
      let totalNoise = 0;

      for (const [category, count] of Object.entries(categoryCounts)) {
        if (count >= query.k_anonymity_threshold) {
          const noise = this.generateLaplaceNoise(query.privacyBudget / Object.keys(categoryCounts).length, 1);
          privateCounts[category] = Math.max(0, Math.round(count + noise));
          totalNoise += Math.abs(noise);
        }
      }

      return {
        value: privateCounts,
        confidenceInterval: { lower: 0, upper: 0 }, // Not applicable for categorical data
        privacyBudgetConsumed: query.privacyBudget,
        k_anonymity_satisfied: Object.keys(privateCounts).length > 0,
        noiseLevel: totalNoise / Object.keys(privateCounts).length,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      logger.error('Error computing private merchant categories', { error });
      throw error;
    }
  }

  /**
   * Generate Laplace noise for differential privacy
   */
  private generateLaplaceNoise(epsilon: number, sensitivity: number): number {
    // Validate inputs
    if (epsilon <= 0) {
      throw new Error('Epsilon must be positive');
    }
    if (sensitivity < 0) {
      throw new Error('Sensitivity must be non-negative');
    }
    
    // Using the inverse CDF method for Laplace distribution
    const b = sensitivity / epsilon;
    const u = Math.random() - 0.5;
    
    // Handle edge case where u is exactly 0.5 or -0.5
    if (Math.abs(u) === 0.5) {
      return 0;
    }
    
    return -b * Math.sign(u) * Math.log(1 - 2 * Math.abs(u));
  }

  /**
   * Generate Gaussian noise for (ε,δ)-differential privacy
   */
  private generateGaussianNoise(epsilon: number, delta: number, sensitivity: number): number {
    // Calculate sigma for Gaussian mechanism
    const sigma = sensitivity * Math.sqrt(2 * Math.log(1.25 / delta)) / epsilon;
    
    // Box-Muller transform for Gaussian distribution
    const u1 = Math.random();
    const u2 = Math.random();
    const z0 = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
    
    return sigma * z0;
  }

  /**
   * Calculate confidence interval for noisy result
   */
  private calculateConfidenceInterval(
    value: number,
    noise: number,
    epsilon: number
  ): { lower: number; upper: number } {
    // 95% confidence interval for Laplace mechanism
    const b = Math.abs(noise) / epsilon;
    const confidenceWidth = b * Math.log(20); // For 95% CI
    
    return {
      lower: Math.max(0, value - confidenceWidth),
      upper: value + confidenceWidth
    };
  }

  /**
   * Verify k-anonymity requirement
   */
  private async verifyKAnonymity(
    query: PrivateAnalyticsRequest,
    tableName: string
  ): Promise<boolean> {
    try {
      const { count, error } = await this.supabase
        .from(tableName)
        .select('*', { count: 'exact', head: true })
        .gte('created_at', query.timeRange.start)
        .lte('created_at', query.timeRange.end);

      if (error) throw error;

      return (count || 0) >= query.k_anonymity_threshold;
    } catch (error) {
      logger.error('Error verifying k-anonymity', { error });
      return false;
    }
  }

  /**
   * Validate privacy budget request
   */
  private validatePrivacyBudget(requestedEpsilon: number): boolean {
    // Check if budget needs reset
    if (new Date() > this.privacyConfig.budgetResetTime) {
      this.resetPrivacyBudget();
    }

    // Validate request
    if (requestedEpsilon > this.privacyConfig.maxEpsilonPerQuery) {
      logger.warn('Requested epsilon exceeds maximum per query', { 
        requested: requestedEpsilon, 
        max: this.privacyConfig.maxEpsilonPerQuery 
      });
      return false;
    }

    if (requestedEpsilon > this.privacyConfig.remainingBudget) {
      logger.warn('Insufficient privacy budget', { 
        requested: requestedEpsilon, 
        remaining: this.privacyConfig.remainingBudget 
      });
      return false;
    }

    return true;
  }

  /**
   * Consume privacy budget
   */
  private async consumePrivacyBudget(epsilon: number): Promise<void> {
    this.privacyConfig.remainingBudget -= epsilon;

    // Log budget consumption
    try {
      await this.supabase
        .from('privacy_analytics_config')
        .insert({
          metric_type: 'budget_consumption',
          epsilon_budget: epsilon,
          noise_calibration: {
            remaining_budget: this.privacyConfig.remainingBudget,
            consumption_time: new Date().toISOString()
          }
        });
    } catch (error) {
      logger.error('Failed to log privacy budget consumption', { error });
    }
  }

  /**
   * Reset privacy budget (daily)
   */
  private resetPrivacyBudget(): void {
    this.privacyConfig.remainingBudget = this.privacyConfig.totalEpsilonBudget;
    this.privacyConfig.budgetResetTime = this.getNextResetTime();
    
    logger.info('Privacy budget reset', { 
      newBudget: this.privacyConfig.remainingBudget,
      nextReset: this.privacyConfig.budgetResetTime
    });
  }

  /**
   * Get next budget reset time (midnight UTC)
   */
  private getNextResetTime(): Date {
    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
    tomorrow.setUTCHours(0, 0, 0, 0);
    return tomorrow;
  }

  /**
   * Get current privacy budget status
   */
  async getPrivacyBudgetStatus(): Promise<{
    totalBudget: number;
    remainingBudget: number;
    budgetUtilization: number;
    resetTime: Date;
  }> {
    // Check if reset needed
    if (new Date() > this.privacyConfig.budgetResetTime) {
      this.resetPrivacyBudget();
    }

    return {
      totalBudget: this.privacyConfig.totalEpsilonBudget,
      remainingBudget: this.privacyConfig.remainingBudget,
      budgetUtilization: 1 - (this.privacyConfig.remainingBudget / this.privacyConfig.totalEpsilonBudget),
      resetTime: this.privacyConfig.budgetResetTime
    };
  }

  /**
   * Implement secure multi-party computation for sensitive aggregations
   */
  async secureMultiPartyAggregate(
    parties: string[],
    aggregationType: 'sum' | 'count' | 'average'
  ): Promise<number> {
    // This is a simplified implementation
    // In production, this would use actual MPC protocols
    logger.info('Secure multi-party computation requested', { parties, aggregationType });
    
    // Placeholder for MPC implementation
    return 0;
  }

  /**
   * Apply statistical disclosure control
   */
  private applyStatisticalDisclosureControl(
    data: any[],
    suppressionThreshold: number = 5
  ): any[] {
    // Suppress small cells
    return data.filter(item => {
      const count = item.count || item.value || 0;
      return count >= suppressionThreshold;
    });
  }

  /**
   * Detect and prevent inference attacks
   */
  async detectInferenceAttack(
    queryHistory: PrivateAnalyticsRequest[]
  ): Promise<boolean> {
    if (queryHistory.length < 2) {
      return false;
    }
    
    // Check for repeated queries that might reveal information
    const querySignatures = queryHistory.map(q => 
      `${q.metricType}:${q.timeRange.start}:${q.timeRange.end}`
    );
    
    const uniqueQueries = new Set(querySignatures);
    const repetitionRate = 1 - (uniqueQueries.size / queryHistory.length);
    
    // Check for overlapping time ranges that could be used for differencing attacks
    const overlappingRanges = this.detectOverlappingTimeRanges(queryHistory);
    
    // Check for suspiciously small time windows
    const smallWindows = queryHistory.filter(q => {
      const start = new Date(q.timeRange.start).getTime();
      const end = new Date(q.timeRange.end).getTime();
      return (end - start) < 3600000; // Less than 1 hour
    });
    
    if (repetitionRate > 0.5 || overlappingRanges > 0.3 || smallWindows.length > queryHistory.length * 0.4) {
      logger.warn('Potential inference attack detected', { 
        repetitionRate,
        overlappingRanges,
        smallWindowRate: smallWindows.length / queryHistory.length,
        queryCount: queryHistory.length 
      });
      return true;
    }

    return false;
  }

  /**
   * Detect overlapping time ranges in query history
   */
  private detectOverlappingTimeRanges(queryHistory: PrivateAnalyticsRequest[]): number {
    let overlaps = 0;
    for (let i = 0; i < queryHistory.length; i++) {
      for (let j = i + 1; j < queryHistory.length; j++) {
        const range1 = queryHistory[i].timeRange;
        const range2 = queryHistory[j].timeRange;
        
        if (this.timeRangesOverlap(range1, range2)) {
          overlaps++;
        }
      }
    }
    
    const totalPairs = (queryHistory.length * (queryHistory.length - 1)) / 2;
    return totalPairs > 0 ? overlaps / totalPairs : 0;
  }

  /**
   * Check if two time ranges overlap
   */
  private timeRangesOverlap(range1: { start: string; end: string }, range2: { start: string; end: string }): boolean {
    const start1 = new Date(range1.start).getTime();
    const end1 = new Date(range1.end).getTime();
    const start2 = new Date(range2.start).getTime();
    const end2 = new Date(range2.end).getTime();
    
    return start1 < end2 && start2 < end1;
  }

  /**
   * Validate analytics request parameters
   */
  private validateAnalyticsRequest(query: PrivateAnalyticsRequest): void {
    if (!query.metricType) {
      throw new Error('Metric type is required');
    }
    
    if (!query.timeRange || !query.timeRange.start || !query.timeRange.end) {
      throw new Error('Valid time range is required');
    }
    
    const start = new Date(query.timeRange.start);
    const end = new Date(query.timeRange.end);
    
    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      throw new Error('Invalid date format in time range');
    }
    
    if (start >= end) {
      throw new Error('Start date must be before end date');
    }
    
    if (query.privacyBudget <= 0 || query.privacyBudget > this.privacyConfig.maxEpsilonPerQuery) {
      throw new Error(`Privacy budget must be between 0 and ${this.privacyConfig.maxEpsilonPerQuery}`);
    }
    
    if (query.k_anonymity_threshold < this.MIN_K_ANONYMITY) {
      throw new Error(`K-anonymity threshold must be at least ${this.MIN_K_ANONYMITY}`);
    }
  }

  /**
   * Get recent query history for inference detection
   */
  private async getRecentQueryHistory(): Promise<PrivateAnalyticsRequest[]> {
    // In production, this would retrieve from a database
    // For now, returning empty array
    return [];
  }

  /**
   * Log query to history for future inference detection
   */
  private async logQueryHistory(query: PrivateAnalyticsRequest): Promise<void> {
    // In production, this would store to a database
    logger.info('Analytics query logged', { 
      metricType: query.metricType,
      timeRange: query.timeRange 
    });
  }
}