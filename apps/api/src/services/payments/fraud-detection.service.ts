import { createClient } from '@supabase/supabase-js';
import { Logger } from '../../utils/logger';

interface FraudAnalysisRequest {
  cardContext: string;
  amount: number; // Amount in cents
  merchantName: string;
  merchantCategoryCode: string;
  merchantCountry: string;
  transactionTime: Date;
}

interface FraudAnalysisResult {
  riskScore: number; // 0-100 scale
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  action: 'approve' | 'decline' | 'review' | 'step_up_auth';
  riskFactors: {
    velocityScore: number;
    amountScore: number;
    locationScore: number;
    timeScore: number;
    merchantScore: number;
  };
  recommendation: string;
}

export class FraudDetectionService {
  private supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!
  );
  private logger = new Logger('FraudDetectionService');
  
  // Configurable thresholds from environment variables
  private readonly velocityLimitHourly = parseInt(process.env.FRAUD_VELOCITY_LIMIT_HOURLY || '10');
  private readonly amountMultiplierLimit = parseFloat(process.env.FRAUD_AMOUNT_MULTIPLIER_LIMIT || '5.0');
  private readonly riskThresholdDecline = parseInt(process.env.FRAUD_RISK_THRESHOLD_DECLINE || '75');
  private readonly riskThresholdReview = parseInt(process.env.FRAUD_RISK_THRESHOLD_REVIEW || '31');
  private readonly businessHoursStart = parseInt(process.env.FRAUD_BUSINESS_HOURS_START || '6');
  private readonly businessHoursEnd = parseInt(process.env.FRAUD_BUSINESS_HOURS_END || '23');

  /**
   * Analyze transaction for fraud risk with privacy isolation
   */
  async analyzeTransaction(request: FraudAnalysisRequest): Promise<FraudAnalysisResult> {
    const startTime = Date.now();
    
    try {
      this.logger.info('Starting fraud analysis', {
        cardContext: request.cardContext,
        amount: request.amount,
        merchantCategoryCode: request.merchantCategoryCode
      });

      // Set row-level security context for privacy isolation
      await this.setCardContext(request.cardContext);

      // Calculate individual risk factor scores
      const velocityScore = await this.calculateVelocityScore(request);
      const amountScore = await this.calculateAmountScore(request);
      const locationScore = this.calculateLocationScore(request);
      const timeScore = this.calculateTimeScore(request);
      const merchantScore = this.calculateMerchantScore(request);

      const riskFactors = {
        velocityScore,
        amountScore,
        locationScore,
        timeScore,
        merchantScore
      };

      // Calculate total risk score (weighted)
      const totalRiskScore = this.calculateTotalRiskScore(riskFactors);
      
      // Determine risk level and action
      const riskLevel = this.getRiskLevel(totalRiskScore);
      const action = this.determineAction(totalRiskScore, riskLevel);
      
      // Log fraud analysis for compliance (privacy-isolated)
      await this.logFraudAnalysis(request, riskFactors, totalRiskScore, riskLevel, action);

      const analysisTime = Date.now() - startTime;
      
      const result: FraudAnalysisResult = {
        riskScore: totalRiskScore,
        riskLevel,
        action,
        riskFactors,
        recommendation: this.getRecommendation(riskLevel, action, riskFactors)
      };

      this.logger.info('Fraud analysis completed', {
        cardContext: request.cardContext,
        riskScore: totalRiskScore,
        riskLevel,
        action,
        analysisTimeMs: analysisTime
      });

      return result;
    } catch (error) {
      this.logger.error('Fraud analysis failed', { error, request });
      
      // Fail safe: return low risk to allow transaction processing
      return {
        riskScore: 0,
        riskLevel: 'low',
        action: 'approve',
        riskFactors: {
          velocityScore: 0,
          amountScore: 0,
          locationScore: 0,
          timeScore: 0,
          merchantScore: 0
        },
        recommendation: 'Analysis failed - defaulting to approve with monitoring'
      };
    }
  }

  /**
   * Get fraud detection metrics for a card
   */
  async getFraudMetrics(cardContext: string, hoursBack: number = 24): Promise<{
    totalTransactions: number;
    averageRiskScore: number;
    highRiskTransactions: number;
    declinedTransactions: number;
  }> {
    try {
      await this.setCardContext(cardContext);
      
      const since = new Date(Date.now() - hoursBack * 60 * 60 * 1000);
      
      const { data: logs } = await this.supabase
        .from('fraud_detection_logs')
        .select('total_risk_score, action_taken')
        .eq('card_context', cardContext)
        .gte('analyzed_at', since.toISOString());

      if (!logs || logs.length === 0) {
        return {
          totalTransactions: 0,
          averageRiskScore: 0,
          highRiskTransactions: 0,
          declinedTransactions: 0
        };
      }

      const totalTransactions = logs.length;
      const averageRiskScore = logs.reduce((sum, log) => sum + log.total_risk_score, 0) / totalTransactions;
      const highRiskTransactions = logs.filter(log => log.total_risk_score >= this.riskThresholdReview).length;
      const declinedTransactions = logs.filter(log => log.action_taken === 'decline').length;

      return {
        totalTransactions,
        averageRiskScore: Math.round(averageRiskScore * 10) / 10,
        highRiskTransactions,
        declinedTransactions
      };
    } catch (error) {
      this.logger.error('Failed to get fraud metrics', { error, cardContext });
      throw error;
    }
  }

  /**
   * Private: Calculate velocity-based risk score (0-30 points)
   */
  private async calculateVelocityScore(request: FraudAnalysisRequest): Promise<number> {
    const oneHourAgo = new Date(request.transactionTime.getTime() - 60 * 60 * 1000);
    
    const { data: recentTransactions } = await this.supabase
      .from('authorization_transactions')
      .select('authorization_id')
      .eq('card_context', request.cardContext)
      .gte('processed_at', oneHourAgo.toISOString())
      .in('status', ['approved', 'pending']);

    const transactionCount = recentTransactions?.length || 0;
    
    // Score increases exponentially with transaction frequency
    if (transactionCount >= this.velocityLimitHourly) {
      return 30; // Maximum velocity risk
    } else if (transactionCount >= this.velocityLimitHourly * 0.8) {
      return 20;
    } else if (transactionCount >= this.velocityLimitHourly * 0.6) {
      return 15;
    } else if (transactionCount >= this.velocityLimitHourly * 0.4) {
      return 10;
    } else if (transactionCount >= this.velocityLimitHourly * 0.2) {
      return 5;
    }
    
    return 0;
  }

  /**
   * Private: Calculate amount-based risk score (0-25 points)
   */
  private async calculateAmountScore(request: FraudAnalysisRequest): Promise<number> {
    const thirtyDaysAgo = new Date(request.transactionTime.getTime() - 30 * 24 * 60 * 60 * 1000);
    
    const { data: historicalTransactions } = await this.supabase
      .from('authorization_transactions')
      .select('authorization_amount')
      .eq('card_context', request.cardContext)
      .gte('processed_at', thirtyDaysAgo.toISOString())
      .eq('status', 'approved');

    if (!historicalTransactions || historicalTransactions.length === 0) {
      // No history - moderate risk for large amounts
      return request.amount > 10000 ? 15 : 0; // $100+ gets some risk
    }

    const avgAmount = historicalTransactions.reduce(
      (sum, tx) => sum + (tx.authorization_amount || 0), 0
    ) / historicalTransactions.length;

    if (avgAmount <= 0) return 0;

    const multiplier = request.amount / avgAmount;
    
    if (multiplier >= this.amountMultiplierLimit) {
      return 25; // Maximum amount risk
    } else if (multiplier >= this.amountMultiplierLimit * 0.8) {
      return 20;
    } else if (multiplier >= this.amountMultiplierLimit * 0.6) {
      return 15;
    } else if (multiplier >= this.amountMultiplierLimit * 0.4) {
      return 10;
    } else if (multiplier >= this.amountMultiplierLimit * 0.2) {
      return 5;
    }
    
    return 0;
  }

  /**
   * Private: Calculate location-based risk score (0-20 points)
   */
  private calculateLocationScore(request: FraudAnalysisRequest): number {
    const countryRiskScores: Record<string, number> = {
      // Low risk countries
      'US': 0, 'CA': 0, 'GB': 0, 'DE': 0, 'FR': 0, 'AU': 0, 'NZ': 0, 'NL': 0, 'SE': 0, 'NO': 0,
      'DK': 0, 'FI': 0, 'CH': 0, 'AT': 0, 'BE': 0, 'LU': 0, 'IE': 0, 'IT': 0, 'ES': 0, 'PT': 0,
      
      // Medium risk countries
      'MX': 5, 'BR': 5, 'AR': 5, 'CL': 5, 'CO': 5, 'PE': 5, 'UY': 5,
      'JP': 3, 'KR': 3, 'SG': 3, 'HK': 3, 'TW': 3, 'MY': 5, 'TH': 5, 'VN': 8, 'PH': 8,
      'ZA': 8, 'EG': 10, 'MA': 8, 'KE': 10, 'GH': 10, 'NG': 12,
      'IN': 6, 'CN': 8, 'ID': 8, 'BD': 10, 'PK': 12, 'LK': 10,
      'PL': 3, 'CZ': 3, 'HU': 3, 'SK': 3, 'SI': 3, 'HR': 5, 'BG': 5, 'RO': 5,
      'TR': 8, 'GR': 5, 'CY': 3, 'MT': 3, 'EE': 3, 'LV': 3, 'LT': 3,
      'IS': 0, 'IL': 5, 'AE': 5, 'SA': 8, 'QA': 5, 'BH': 5, 'KW': 5, 'OM': 5,
      
      // High risk countries (simplified list)
      'AF': 20, 'IQ': 20, 'SY': 20, 'YE': 20, 'SO': 20, 'LY': 20, 'SD': 20,
      'MM': 15, 'KP': 20, 'IR': 20, 'BY': 15, 'RU': 15, 'CU': 15, 'VE': 15
    };
    
    return countryRiskScores[request.merchantCountry] || 12; // Default medium-high risk for unknown countries
  }

  /**
   * Private: Calculate time-based risk score (0-15 points)
   */
  private calculateTimeScore(request: FraudAnalysisRequest): number {
    const hour = request.transactionTime.getHours();
    const isWeekend = [0, 6].includes(request.transactionTime.getDay()); // Sunday = 0, Saturday = 6
    
    let timeScore = 0;
    
    // Business hours check
    if (hour < this.businessHoursStart || hour > this.businessHoursEnd) {
      timeScore += 8; // Off-hours transactions are riskier
    }
    
    // Very late night (11 PM - 5 AM) extra risk
    if (hour >= 23 || hour <= 5) {
      timeScore += 5;
    }
    
    // Weekend transactions have slightly higher risk for business MCCs
    if (isWeekend) {
      const businessMCCs = ['5411', '5812', '5814', '7011', '4111', '5542', '5732', '5734'];
      if (businessMCCs.includes(request.merchantCategoryCode)) {
        timeScore += 2;
      }
    }
    
    return Math.min(timeScore, 15); // Cap at 15 points
  }

  /**
   * Private: Calculate merchant-based risk score (0-10 points)
   */
  private calculateMerchantScore(request: FraudAnalysisRequest): number {
    // High-risk MCC codes with their risk scores
    const highRiskMCCs: Record<string, number> = {
      // Gambling and gaming
      '7995': 10, // Gambling transactions
      '7801': 10, // Government-owned lottery
      '7802': 10, // Government-owned lottery (non-US)
      '7993': 8,  // Video game arcades
      
      // Adult entertainment
      '5962': 9, // Direct marketing - adult
      '5993': 9, // Adult content/services
      
      // High-risk financial services
      '6051': 7, // Quasi cash - financial institutions
      '6211': 6, // Securities brokers/dealers
      '6300': 5, // Insurance underwriting
      '7299': 6, // Miscellaneous personal services (high risk subset)
      
      // Money transfer and remittance
      '6538': 5, // Money transfer services
      '6540': 4, // Point-of-sale funding transactions
      
      // High-risk retail
      '5944': 4, // Jewelry stores
      '5945': 3, // Hobby/toy/game shops (some fraud risk)
      '5947': 4, // Gift/card/novelty shops
      
      // Travel (higher fraud due to disputes)
      '4722': 3, // Travel agencies
      '7011': 2, // Hotels/motels/resorts
      '3501': 4, // Hilton Hotels
      '3502': 4, // Marriott Hotels
      
      // Digital goods (high chargeback risk)
      '5816': 4, // Digital goods - software
      '5817': 4, // Digital goods - games
      '5818': 4, // Digital goods - media
      
      // Telecommunications (fraud-prone)
      '4814': 3, // Telecommunication services
      '4815': 3, // Monthly payment services
      
      // Automotive (high-value, fraud target)
      '5511': 2, // Car and truck dealers
      '5541': 2, // Service stations
      '7538': 3, // Automotive service shops
      '7549': 3  // Towing services
    };
    
    return highRiskMCCs[request.merchantCategoryCode] || 0;
  }

  /**
   * Private: Calculate total weighted risk score
   */
  private calculateTotalRiskScore(riskFactors: FraudAnalysisResult['riskFactors']): number {
    // Weighted scoring: velocity and amount are most important
    const weights = {
      velocity: 0.30,    // 30% weight - transaction frequency is critical
      amount: 0.25,      // 25% weight - unusual amounts are high risk
      location: 0.20,    // 20% weight - geographic risk
      time: 0.15,        // 15% weight - time patterns
      merchant: 0.10     // 10% weight - merchant category risk
    };
    
    const totalScore = Math.round(
      riskFactors.velocityScore * weights.velocity +
      riskFactors.amountScore * weights.amount +
      riskFactors.locationScore * weights.location +
      riskFactors.timeScore * weights.time +
      riskFactors.merchantScore * weights.merchant
    );
    
    return Math.min(totalScore, 100); // Cap at 100
  }

  /**
   * Private: Get risk level from total score
   */
  private getRiskLevel(totalScore: number): 'low' | 'medium' | 'high' | 'critical' {
    if (totalScore >= 91) return 'critical';
    if (totalScore >= this.riskThresholdDecline) return 'high';
    if (totalScore >= this.riskThresholdReview) return 'medium';
    return 'low';
  }

  /**
   * Private: Determine action based on risk score and level
   */
  private determineAction(
    totalScore: number, 
    riskLevel: 'low' | 'medium' | 'high' | 'critical'
  ): 'approve' | 'decline' | 'review' | 'step_up_auth' {
    if (totalScore >= this.riskThresholdDecline) {
      return 'decline';
    } else if (totalScore >= this.riskThresholdReview) {
      return 'review'; // Manual review or step-up authentication
    } else if (totalScore >= 15) {
      return 'step_up_auth'; // Additional verification
    } else {
      return 'approve';
    }
  }

  /**
   * Private: Generate recommendation text
   */
  private getRecommendation(
    riskLevel: string, 
    action: string, 
    riskFactors: FraudAnalysisResult['riskFactors']
  ): string {
    const recommendations = [];
    
    if (riskFactors.velocityScore > 15) {
      recommendations.push('High transaction velocity detected - consider rate limiting');
    }
    
    if (riskFactors.amountScore > 15) {
      recommendations.push('Transaction amount significantly higher than normal spending');
    }
    
    if (riskFactors.locationScore > 10) {
      recommendations.push('Transaction from higher-risk geographic location');
    }
    
    if (riskFactors.timeScore > 8) {
      recommendations.push('Transaction outside normal business hours');
    }
    
    if (riskFactors.merchantScore > 5) {
      recommendations.push('High-risk merchant category detected');
    }
    
    if (recommendations.length === 0) {
      return `${action.charAt(0).toUpperCase() + action.slice(1)} - Low risk transaction`;
    }
    
    return `${action.charAt(0).toUpperCase() + action.slice(1)} - ${recommendations.join(', ')}`;
  }

  /**
   * Private: Log fraud analysis results with privacy isolation
   */
  private async logFraudAnalysis(
    request: FraudAnalysisRequest,
    riskFactors: FraudAnalysisResult['riskFactors'],
    totalRiskScore: number,
    riskLevel: string,
    action: string
  ): Promise<void> {
    try {
      // Note: This will need an authorization_id when integrated
      // For now, we'll create a placeholder that gets updated later
      const { error } = await this.supabase
        .from('fraud_detection_logs')
        .insert({
          card_context: request.cardContext,
          authorization_id: '00000000-0000-0000-0000-000000000000', // Placeholder
          risk_factors: riskFactors,
          total_risk_score: totalRiskScore,
          risk_level: riskLevel,
          action_taken: action,
          velocity_score: riskFactors.velocityScore,
          amount_score: riskFactors.amountScore,
          location_score: riskFactors.locationScore,
          time_score: riskFactors.timeScore,
          merchant_score: riskFactors.merchantScore,
          privacy_isolated: true
        });

      if (error) {
        this.logger.warn('Failed to log fraud analysis', { error });
      }
    } catch (error) {
      this.logger.warn('Fraud analysis logging failed', { error });
      // Don't throw - this shouldn't block authorization processing
    }
  }

  /**
   * Private: Set row-level security context for privacy isolation
   */
  private async setCardContext(cardContext: string): Promise<void> {
    await this.supabase.rpc('set_config', {
      setting_name: 'app.current_card_context',
      new_value: cardContext,
      is_local: true
    });
  }
}