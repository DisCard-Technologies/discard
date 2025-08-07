import { createClient } from '@supabase/supabase-js';
import { Logger } from '../../utils/logger';

interface DeclineReason {
  reasonId: string;
  declineCode: string;
  reasonCategory: 'insufficient_funds' | 'fraud' | 'restrictions' | 'technical' | 'compliance';
  userFriendlyMessage: string;
  merchantMessage: string;
  resolutionSuggestion?: string;
  isRetryable: boolean;
}

interface DeclineReasonAnalytics {
  declineCode: string;
  count: number;
  percentage: number;
  category: string;
  isRetryable: boolean;
}

export class DeclineReasonsService {
  private supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!
  );
  private logger = new Logger('DeclineReasonsService');

  /**
   * Get decline reason by code
   */
  async getDeclineReason(declineCode: string): Promise<DeclineReason | null> {
    try {
      const { data } = await this.supabase
        .from('decline_reason_codes')
        .select('*')
        .eq('decline_code', declineCode)
        .single();

      if (!data) {
        this.logger.warn('Decline reason not found', { declineCode });
        return null;
      }

      return this.mapToDeclineReason(data);
    } catch (error) {
      this.logger.error('Failed to get decline reason', { error, declineCode });
      return null;
    }
  }

  /**
   * Get all decline reasons by category
   */
  async getDeclineReasonsByCategory(
    category?: 'insufficient_funds' | 'fraud' | 'restrictions' | 'technical' | 'compliance'
  ): Promise<DeclineReason[]> {
    try {
      let query = this.supabase
        .from('decline_reason_codes')
        .select('*');

      if (category) {
        query = query.eq('reason_category', category);
      }

      const { data } = await query.order('decline_code');

      if (!data) return [];

      return data.map(this.mapToDeclineReason);
    } catch (error) {
      this.logger.error('Failed to get decline reasons by category', { error, category });
      return [];
    }
  }

  /**
   * Get user-friendly decline message
   */
  async getUserFriendlyMessage(declineCode: string): Promise<string> {
    const reason = await this.getDeclineReason(declineCode);
    
    if (!reason) {
      return 'Transaction was declined. Please try again or contact support.';
    }

    return reason.userFriendlyMessage;
  }

  /**
   * Get merchant-specific decline message
   */
  async getMerchantMessage(declineCode: string): Promise<string> {
    const reason = await this.getDeclineReason(declineCode);
    
    if (!reason) {
      return 'Declined - Processing Error';
    }

    return reason.merchantMessage;
  }

  /**
   * Get resolution suggestion for decline reason
   */
  async getResolutionSuggestion(declineCode: string): Promise<string | null> {
    const reason = await this.getDeclineReason(declineCode);
    return reason?.resolutionSuggestion || null;
  }

  /**
   * Check if decline reason is retryable
   */
  async isDeclineRetryable(declineCode: string): Promise<boolean> {
    const reason = await this.getDeclineReason(declineCode);
    return reason?.isRetryable || false;
  }

  /**
   * Get decline reason analytics for a card context
   */
  async getDeclineAnalytics(
    cardContext: string, 
    hoursBack: number = 24
  ): Promise<DeclineReasonAnalytics[]> {
    try {
      const since = new Date(Date.now() - hoursBack * 60 * 60 * 1000);

      // First, set the card context for RLS
      await this.setCardContext(cardContext);

      // Get decline statistics from authorization transactions
      const { data: declines } = await this.supabase
        .from('authorization_transactions')
        .select('decline_code')
        .eq('card_context', cardContext)
        .eq('status', 'declined')
        .gte('processed_at', since.toISOString())
        .not('decline_code', 'is', null);

      if (!declines || declines.length === 0) {
        return [];
      }

      // Count declines by code
      const declineCounts = declines.reduce((acc: Record<string, number>, decline) => {
        const code = decline.decline_code;
        acc[code] = (acc[code] || 0) + 1;
        return acc;
      }, {});

      const totalDeclines = declines.length;
      const analytics: DeclineReasonAnalytics[] = [];

      // Get details for each decline code
      for (const [declineCode, count] of Object.entries(declineCounts)) {
        const reason = await this.getDeclineReason(declineCode);
        
        analytics.push({
          declineCode,
          count: count as number,
          percentage: Math.round((count as number / totalDeclines) * 100 * 10) / 10,
          category: reason?.reasonCategory || 'unknown',
          isRetryable: reason?.isRetryable || false
        });
      }

      // Sort by count descending
      return analytics.sort((a, b) => b.count - a.count);
    } catch (error) {
      this.logger.error('Failed to get decline analytics', { error, cardContext });
      return [];
    }
  }

  /**
   * Log decline reason for analytics
   */
  async logDecline(
    cardContext: string,
    authorizationId: string,
    declineCode: string,
    additionalContext?: Record<string, any>
  ): Promise<void> {
    try {
      this.logger.info('Logging decline reason', {
        cardContext,
        authorizationId,
        declineCode,
        additionalContext
      });

      // The actual decline logging is handled in the authorization_transactions table
      // This method can be extended to add additional decline-specific logging if needed
      
      // Could add to a separate decline_events table for more detailed analytics
      // For now, we rely on the authorization_transactions table
      
    } catch (error) {
      this.logger.error('Failed to log decline', { error, cardContext, authorizationId, declineCode });
      // Don't throw error - logging should not affect transaction processing
    }
  }

  /**
   * Create custom decline reason (admin function)
   */
  async createDeclineReason(reason: {
    declineCode: string;
    reasonCategory: DeclineReason['reasonCategory'];
    userFriendlyMessage: string;
    merchantMessage: string;
    resolutionSuggestion?: string;
    isRetryable: boolean;
  }): Promise<DeclineReason> {
    try {
      const { data } = await this.supabase
        .from('decline_reason_codes')
        .insert({
          decline_code: reason.declineCode,
          reason_category: reason.reasonCategory,
          user_friendly_message: reason.userFriendlyMessage,
          merchant_message: reason.merchantMessage,
          resolution_suggestion: reason.resolutionSuggestion,
          is_retryable: reason.isRetryable
        })
        .select()
        .single();

      if (!data) {
        throw new Error('Failed to create decline reason');
      }

      this.logger.info('Created custom decline reason', { declineCode: reason.declineCode });
      
      return this.mapToDeclineReason(data);
    } catch (error) {
      this.logger.error('Failed to create decline reason', { error, reason });
      throw error;
    }
  }

  /**
   * Update decline reason (admin function)
   */
  async updateDeclineReason(
    declineCode: string,
    updates: Partial<{
      userFriendlyMessage: string;
      merchantMessage: string;
      resolutionSuggestion: string;
      isRetryable: boolean;
    }>
  ): Promise<DeclineReason | null> {
    try {
      const { data } = await this.supabase
        .from('decline_reason_codes')
        .update({
          user_friendly_message: updates.userFriendlyMessage,
          merchant_message: updates.merchantMessage,
          resolution_suggestion: updates.resolutionSuggestion,
          is_retryable: updates.isRetryable
        })
        .eq('decline_code', declineCode)
        .select()
        .single();

      if (!data) {
        this.logger.warn('Decline reason not found for update', { declineCode });
        return null;
      }

      this.logger.info('Updated decline reason', { declineCode });
      
      return this.mapToDeclineReason(data);
    } catch (error) {
      this.logger.error('Failed to update decline reason', { error, declineCode });
      throw error;
    }
  }

  /**
   * Get decline resolution suggestions by category
   */
  async getResolutionSuggestionsByCategory(
    category: DeclineReason['reasonCategory']
  ): Promise<{ declineCode: string; suggestion: string }[]> {
    try {
      const { data } = await this.supabase
        .from('decline_reason_codes')
        .select('decline_code, resolution_suggestion')
        .eq('reason_category', category)
        .not('resolution_suggestion', 'is', null);

      if (!data) return [];

      return data.map(item => ({
        declineCode: item.decline_code,
        suggestion: item.resolution_suggestion
      }));
    } catch (error) {
      this.logger.error('Failed to get resolution suggestions', { error, category });
      return [];
    }
  }

  /**
   * Get retryable decline codes
   */
  async getRetryableDeclineCodes(): Promise<string[]> {
    try {
      const { data } = await this.supabase
        .from('decline_reason_codes')
        .select('decline_code')
        .eq('is_retryable', true);

      if (!data) return [];

      return data.map(item => item.decline_code);
    } catch (error) {
      this.logger.error('Failed to get retryable decline codes', { error });
      return [];
    }
  }

  /**
   * Get decline reason statistics across all cards (admin function)
   */
  async getGlobalDeclineStatistics(hoursBack: number = 24): Promise<{
    totalDeclines: number;
    declinesByCategory: Record<string, number>;
    declinesByCode: Record<string, number>;
    retryablePercentage: number;
  }> {
    try {
      const since = new Date(Date.now() - hoursBack * 60 * 60 * 1000);

      // Note: This query bypasses RLS for admin statistics
      // In production, ensure proper admin authentication
      const { data: declines } = await this.supabase
        .from('authorization_transactions')
        .select('decline_code')
        .eq('status', 'declined')
        .gte('processed_at', since.toISOString())
        .not('decline_code', 'is', null);

      if (!declines || declines.length === 0) {
        return {
          totalDeclines: 0,
          declinesByCategory: {},
          declinesByCode: {},
          retryablePercentage: 0
        };
      }

      const totalDeclines = declines.length;
      const declinesByCode = declines.reduce((acc: Record<string, number>, decline) => {
        const code = decline.decline_code;
        acc[code] = (acc[code] || 0) + 1;
        return acc;
      }, {});

      // Get categories for each decline code
      const declinesByCategory: Record<string, number> = {};
      let retryableCount = 0;

      for (const [declineCode, count] of Object.entries(declinesByCode)) {
        const reason = await this.getDeclineReason(declineCode);
        
        if (reason) {
          const category = reason.reasonCategory;
          declinesByCategory[category] = (declinesByCategory[category] || 0) + (count as number);
          
          if (reason.isRetryable) {
            retryableCount += count as number;
          }
        } else {
          declinesByCategory['unknown'] = (declinesByCategory['unknown'] || 0) + (count as number);
        }
      }

      const retryablePercentage = Math.round((retryableCount / totalDeclines) * 100 * 10) / 10;

      return {
        totalDeclines,
        declinesByCategory,
        declinesByCode,
        retryablePercentage
      };
    } catch (error) {
      this.logger.error('Failed to get global decline statistics', { error });
      throw error;
    }
  }

  /**
   * Private: Map database record to DeclineReason interface
   */
  private mapToDeclineReason(dbRecord: any): DeclineReason {
    return {
      reasonId: dbRecord.reason_id,
      declineCode: dbRecord.decline_code,
      reasonCategory: dbRecord.reason_category,
      userFriendlyMessage: dbRecord.user_friendly_message,
      merchantMessage: dbRecord.merchant_message,
      resolutionSuggestion: dbRecord.resolution_suggestion,
      isRetryable: dbRecord.is_retryable
    };
  }

  /**
   * Private: Set row-level security context
   */
  private async setCardContext(cardContext: string): Promise<void> {
    await this.supabase.rpc('set_config', {
      setting_name: 'app.current_card_context',
      new_value: cardContext,
      is_local: true
    });
  }
}