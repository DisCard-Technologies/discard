import { Request, Response } from 'express';
import { PrivacyAnalyticsService } from '../../services/privacy/privacy-analytics.service';
import { logger } from '../../utils/logger';
import { inputSanitizer } from '../../utils/input-sanitizer';

export class PrivacyAnalyticsController {
  private analyticsService: PrivacyAnalyticsService;

  constructor() {
    const supabaseUrl = process.env.SUPABASE_URL || '';
    const supabaseKey = process.env.SUPABASE_SERVICE_KEY || '';
    this.analyticsService = new PrivacyAnalyticsService(supabaseUrl, supabaseKey);
  }

  /**
   * Get privacy-preserving analytics
   */
  async getPrivateAnalytics(req: Request, res: Response): Promise<void> {
    try {
      const metricType = req.query.metric as 'aggregate_spend' | 'transaction_count' | 'merchant_categories';
      
      if (!metricType) {
        res.status(400).json({ error: 'Metric type required' });
        return;
      }

      const request = {
        metricType,
        timeRange: {
          start: req.query.start as string || new Date(Date.now() - 86400000).toISOString(),
          end: req.query.end as string || new Date().toISOString()
        },
        privacyBudget: parseFloat(req.query.epsilon as string) || 1.0,
        k_anonymity_threshold: parseInt(req.query.k_anonymity as string) || 5
      };

      // Validate privacy budget
      if (request.privacyBudget <= 0 || request.privacyBudget > 2.0) {
        res.status(400).json({ error: 'Privacy budget (epsilon) must be between 0 and 2.0' });
        return;
      }

      const result = await this.analyticsService.generatePrivateAnalytics(request);

      res.json({
        metric: metricType,
        value: result.value,
        confidenceInterval: result.confidenceInterval,
        privacyGuarantees: {
          epsilonUsed: result.privacyBudgetConsumed,
          kAnonymitySatisfied: result.k_anonymity_satisfied,
          noiseLevel: result.noiseLevel
        },
        timestamp: result.timestamp
      });
    } catch (error) {
      logger.error('Error generating private analytics', { error });
      res.status(500).json({ error: 'Failed to generate privacy-preserving analytics' });
    }
  }

  /**
   * Get privacy budget status
   */
  async getPrivacyBudgetStatus(req: Request, res: Response): Promise<void> {
    try {
      const status = await this.analyticsService.getPrivacyBudgetStatus();

      res.json({
        totalBudget: status.totalBudget,
        remainingBudget: status.remainingBudget,
        budgetUtilization: `${(status.budgetUtilization * 100).toFixed(1)}%`,
        resetTime: status.resetTime.toISOString(),
        timeUntilReset: Math.max(0, status.resetTime.getTime() - Date.now())
      });
    } catch (error) {
      logger.error('Error getting privacy budget status', { error });
      res.status(500).json({ error: 'Failed to retrieve privacy budget status' });
    }
  }

  /**
   * Get aggregate spending analytics
   */
  async getAggregateSpending(req: Request, res: Response): Promise<void> {
    try {
      const request = {
        metricType: 'aggregate_spend' as const,
        timeRange: {
          start: req.query.start as string || new Date(Date.now() - 604800000).toISOString(), // 7 days
          end: req.query.end as string || new Date().toISOString()
        },
        privacyBudget: 0.5, // Lower epsilon for spending data
        k_anonymity_threshold: 10 // Higher k-anonymity for financial data
      };

      const result = await this.analyticsService.generatePrivateAnalytics(request);

      res.json({
        totalSpending: result.value,
        confidenceInterval: result.confidenceInterval,
        period: request.timeRange,
        privacyProtected: true,
        dataQuality: {
          kAnonymity: result.k_anonymity_satisfied,
          noiseLevelPercent: `${((result.noiseLevel / (result.value as number)) * 100).toFixed(1)}%`
        }
      });
    } catch (error) {
      logger.error('Error getting aggregate spending', { error });
      res.status(500).json({ error: 'Failed to retrieve spending analytics' });
    }
  }

  /**
   * Get transaction volume analytics
   */
  async getTransactionVolume(req: Request, res: Response): Promise<void> {
    try {
      const request = {
        metricType: 'transaction_count' as const,
        timeRange: {
          start: req.query.start as string || new Date(Date.now() - 2592000000).toISOString(), // 30 days
          end: req.query.end as string || new Date().toISOString()
        },
        privacyBudget: 1.0,
        k_anonymity_threshold: 5
      };

      const result = await this.analyticsService.generatePrivateAnalytics(request);

      res.json({
        transactionCount: result.value,
        confidenceInterval: result.confidenceInterval,
        period: request.timeRange,
        dailyAverage: Math.round((result.value as number) / 30),
        privacyProtected: true
      });
    } catch (error) {
      logger.error('Error getting transaction volume', { error });
      res.status(500).json({ error: 'Failed to retrieve transaction volume' });
    }
  }

  /**
   * Get merchant category distribution
   */
  async getMerchantCategories(req: Request, res: Response): Promise<void> {
    try {
      const request = {
        metricType: 'merchant_categories' as const,
        timeRange: {
          start: req.query.start as string || new Date(Date.now() - 2592000000).toISOString(), // 30 days
          end: req.query.end as string || new Date().toISOString()
        },
        privacyBudget: 2.0, // Higher epsilon for categorical data
        k_anonymity_threshold: 5
      };

      const result = await this.analyticsService.generatePrivateAnalytics(request);
      const categories = result.value as Record<string, number>;

      // Calculate percentages
      const total = Object.values(categories).reduce((sum, count) => sum + count, 0);
      const distribution = Object.entries(categories).map(([category, count]) => ({
        category,
        count,
        percentage: ((count / total) * 100).toFixed(1)
      }));

      res.json({
        distribution: distribution.sort((a, b) => b.count - a.count),
        totalTransactions: total,
        categoriesReported: distribution.length,
        period: request.timeRange,
        privacyProtected: true,
        note: 'Categories with fewer than 5 transactions are excluded for privacy'
      });
    } catch (error) {
      logger.error('Error getting merchant categories', { error });
      res.status(500).json({ error: 'Failed to retrieve merchant category distribution' });
    }
  }

  /**
   * Detect potential inference attacks
   */
  async checkInferenceRisk(req: Request, res: Response): Promise<void> {
    try {
      // In a real implementation, this would track query history per user
      const mockQueryHistory = [
        {
          metricType: 'aggregate_spend' as const,
          timeRange: { start: '', end: '' },
          privacyBudget: 1.0,
          k_anonymity_threshold: 5
        }
      ];

      const inferenceDetected = await this.analyticsService.detectInferenceAttack(mockQueryHistory);

      res.json({
        inferenceRiskDetected: inferenceDetected,
        recommendation: inferenceDetected 
          ? 'Query pattern suggests potential inference attack. Consider spacing out queries.'
          : 'No inference risk detected',
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      logger.error('Error checking inference risk', { error });
      res.status(500).json({ error: 'Failed to check inference risk' });
    }
  }
}

// Create controller instance
const privacyAnalyticsController = new PrivacyAnalyticsController();

// Export controller methods
export const getPrivateAnalytics = privacyAnalyticsController.getPrivateAnalytics.bind(privacyAnalyticsController);
export const getPrivacyBudgetStatus = privacyAnalyticsController.getPrivacyBudgetStatus.bind(privacyAnalyticsController);
export const getAggregateSpending = privacyAnalyticsController.getAggregateSpending.bind(privacyAnalyticsController);
export const getTransactionVolume = privacyAnalyticsController.getTransactionVolume.bind(privacyAnalyticsController);
export const getMerchantCategories = privacyAnalyticsController.getMerchantCategories.bind(privacyAnalyticsController);
export const checkInferenceRisk = privacyAnalyticsController.checkInferenceRisk.bind(privacyAnalyticsController);