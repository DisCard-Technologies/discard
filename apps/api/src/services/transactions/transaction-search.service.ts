import { supabase } from '../../utils/supabase';
import { logger } from '../../utils/logger';

interface SearchParams {
  merchantName?: string;
  minAmount?: number;
  maxAmount?: number;
  merchantCategory?: string;
}

interface TransactionSearchParams {
  cardId: string;
  userId: string;
  searchParams: SearchParams;
}

export class TransactionSearchService {
  /**
   * Search transactions within card context with privacy protection
   */
  async searchTransactions(params: TransactionSearchParams) {
    const { cardId, userId, searchParams } = params;

    try {
      // Disable query logging for privacy
      await supabase.rpc('set_config', {
        setting: 'log_statement',
        value: 'none'
      });

      // First verify user owns this card
      const { data: card } = await supabase
        .from('cards')
        .select('id, card_context_hash')
        .eq('id', cardId)
        .eq('user_id', userId)
        .single();

      if (!card) {
        return null; // Card not found or unauthorized
      }

      // Set card context for RLS
      await supabase.rpc('set_app_context', { 
        context_value: card.card_context_hash 
      });

      // Build search query
      let query = supabase
        .from('payment_transactions')
        .select('*')
        .eq('card_context_hash', card.card_context_hash)
        .order('processed_at', { ascending: false })
        .limit(50); // Max 50 results for performance

      // Apply merchant name search (case-insensitive partial match)
      if (searchParams.merchantName) {
        query = query.ilike('merchant_name', `%${searchParams.merchantName}%`);
      }

      // Apply amount range filters
      if (searchParams.minAmount !== undefined) {
        query = query.gte('amount', searchParams.minAmount);
      }
      if (searchParams.maxAmount !== undefined) {
        query = query.lte('amount', searchParams.maxAmount);
      }

      // Apply merchant category filter
      if (searchParams.merchantCategory) {
        query = query.eq('merchant_category', searchParams.merchantCategory);
      }

      const { data: transactions, error } = await query;

      if (error) {
        logger.error('Error searching transactions:', error);
        throw error;
      }

      // Transform results to match transaction history format
      const transformedTransactions = (transactions || []).map(tx => ({
        transactionId: tx.transaction_id,
        merchantName: tx.merchant_name,
        merchantCategory: tx.merchant_category,
        amount: tx.amount,
        status: tx.status,
        processedAt: tx.processed_at,
        authorizationCode: tx.authorization_code,
        privacyCountdown: this.calculatePrivacyCountdown(tx.retention_until)
      }));

      // Calculate search result analytics
      const analytics = this.calculateSearchAnalytics(transformedTransactions);

      return {
        transactions: transformedTransactions,
        searchCriteria: searchParams,
        resultCount: transformedTransactions.length,
        analytics
      };
    } catch (error) {
      logger.error('Transaction search service error:', error);
      throw error;
    } finally {
      // Re-enable query logging for other operations
      try {
        await supabase.rpc('set_config', {
          setting: 'log_statement',
          value: 'all'
        });
      } catch (error) {
        // Ignore errors re-enabling logging
      }
    }
  }

  /**
   * Calculate days until deletion based on retention policy
   */
  private calculatePrivacyCountdown(retentionUntil: string): number {
    if (!retentionUntil) return 365; // Default retention period
    
    const now = new Date();
    const retentionDate = new Date(retentionUntil);
    const diffTime = retentionDate.getTime() - now.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    return Math.max(0, diffDays);
  }

  /**
   * Calculate analytics for search results
   */
  private calculateSearchAnalytics(transactions: any[]) {
    const totalAmount = transactions
      .filter(tx => tx.status === 'settled')
      .reduce((sum, tx) => sum + tx.amount, 0);

    const categoryBreakdown: { [key: string]: number } = {};
    transactions.forEach(tx => {
      if (tx.status === 'settled') {
        categoryBreakdown[tx.merchantCategory] = 
          (categoryBreakdown[tx.merchantCategory] || 0) + 1;
      }
    });

    return {
      totalAmount,
      transactionCount: transactions.length,
      averageAmount: transactions.length > 0 
        ? Math.round(totalAmount / transactions.length) 
        : 0,
      categoryDistribution: categoryBreakdown
    };
  }
}

export const transactionSearchService = new TransactionSearchService();