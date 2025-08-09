import { supabase } from '../../utils/supabase';
import { logger } from '../../utils/logger';

interface AnalyticsParams {
  cardId: string;
  userId: string;
  periodDays: number;
}

interface SpendingTrend {
  date: string;
  amount: number;
  transactionCount: number;
}

export class TransactionAnalyticsService {
  /**
   * Get real-time spending analytics for a card
   */
  async getCardAnalytics(params: AnalyticsParams) {
    const { cardId, userId, periodDays } = params;

    try {
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

      // Calculate date range
      const endDate = new Date();
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - periodDays);

      // Get all transactions for the period
      const { data: transactions, error } = await supabase
        .from('payment_transactions')
        .select('*')
        .eq('card_context_hash', card.card_context_hash)
        .gte('processed_at', startDate.toISOString())
        .lte('processed_at', endDate.toISOString())
        .eq('status', 'settled')
        .order('processed_at', { ascending: true });

      if (error) {
        logger.error('Error fetching analytics data:', error);
        throw error;
      }

      const analyticsData = transactions || [];

      // Calculate spending by category
      const categorySpending = this.calculateCategorySpending(analyticsData);

      // Calculate daily/weekly trends
      const spendingTrends = this.calculateSpendingTrends(analyticsData, periodDays);

      // Calculate transaction statistics using window functions equivalent
      const statistics = this.calculateTransactionStatistics(analyticsData);

      return {
        totalSpent: statistics.totalSpent,
        transactionCount: statistics.transactionCount,
        averageTransactionAmount: statistics.averageAmount,
        medianTransactionAmount: statistics.medianAmount,
        largestTransaction: statistics.largestTransaction,
        smallestTransaction: statistics.smallestTransaction,
        categoryBreakdown: categorySpending,
        spendingTrends,
        transactionFrequency: {
          daily: statistics.dailyFrequency,
          weekly: statistics.weeklyFrequency
        },
        periodStart: startDate.toISOString(),
        periodEnd: endDate.toISOString()
      };
    } catch (error) {
      logger.error('Transaction analytics service error:', error);
      throw error;
    }
  }

  /**
   * Calculate spending breakdown by merchant category
   */
  private calculateCategorySpending(transactions: any[]) {
    const categoryMap: { [key: string]: { amount: number; count: number; percentage: number } } = {};
    const totalSpent = transactions.reduce((sum, tx) => sum + tx.amount, 0);

    transactions.forEach(tx => {
      if (!categoryMap[tx.merchant_category]) {
        categoryMap[tx.merchant_category] = { amount: 0, count: 0, percentage: 0 };
      }
      categoryMap[tx.merchant_category].amount += tx.amount;
      categoryMap[tx.merchant_category].count += 1;
    });

    // Calculate percentages
    Object.keys(categoryMap).forEach(category => {
      categoryMap[category].percentage = totalSpent > 0
        ? Math.round((categoryMap[category].amount / totalSpent) * 10000) / 100
        : 0;
    });

    return categoryMap;
  }

  /**
   * Calculate spending trends over time
   */
  private calculateSpendingTrends(transactions: any[], periodDays: number): SpendingTrend[] {
    const trendMap: { [key: string]: SpendingTrend } = {};
    
    // Determine grouping based on period
    const groupByWeek = periodDays > 30;

    transactions.forEach(tx => {
      const date = new Date(tx.processed_at);
      let key: string;

      if (groupByWeek) {
        // Group by week
        const weekStart = new Date(date);
        weekStart.setDate(date.getDate() - date.getDay());
        key = weekStart.toISOString().split('T')[0];
      } else {
        // Group by day
        key = date.toISOString().split('T')[0];
      }

      if (!trendMap[key]) {
        trendMap[key] = { date: key, amount: 0, transactionCount: 0 };
      }

      trendMap[key].amount += tx.amount;
      trendMap[key].transactionCount += 1;
    });

    return Object.values(trendMap).sort((a, b) => 
      new Date(a.date).getTime() - new Date(b.date).getTime()
    );
  }

  /**
   * Calculate detailed transaction statistics
   */
  private calculateTransactionStatistics(transactions: any[]) {
    if (transactions.length === 0) {
      return {
        totalSpent: 0,
        transactionCount: 0,
        averageAmount: 0,
        medianAmount: 0,
        largestTransaction: null,
        smallestTransaction: null,
        dailyFrequency: 0,
        weeklyFrequency: 0
      };
    }

    const amounts = transactions.map(tx => tx.amount).sort((a, b) => a - b);
    const totalSpent = amounts.reduce((sum, amount) => sum + amount, 0);
    const transactionCount = transactions.length;
    const averageAmount = Math.round(totalSpent / transactionCount);

    // Calculate median
    const medianIndex = Math.floor(transactionCount / 2);
    const medianAmount = transactionCount % 2 === 0
      ? Math.round((amounts[medianIndex - 1] + amounts[medianIndex]) / 2)
      : amounts[medianIndex];

    // Find largest and smallest transactions
    const sortedByAmount = [...transactions].sort((a, b) => b.amount - a.amount);
    const largestTransaction = {
      amount: sortedByAmount[0].amount,
      merchantName: sortedByAmount[0].merchant_name,
      date: sortedByAmount[0].processed_at
    };
    const smallestTransaction = {
      amount: sortedByAmount[sortedByAmount.length - 1].amount,
      merchantName: sortedByAmount[sortedByAmount.length - 1].merchant_name,
      date: sortedByAmount[sortedByAmount.length - 1].processed_at
    };

    // Calculate frequency
    const firstDate = new Date(transactions[0].processed_at);
    const lastDate = new Date(transactions[transactions.length - 1].processed_at);
    const daysDiff = Math.max(1, Math.ceil((lastDate.getTime() - firstDate.getTime()) / (1000 * 60 * 60 * 24)));
    
    const dailyFrequency = Math.round((transactionCount / daysDiff) * 100) / 100;
    const weeklyFrequency = Math.round((transactionCount / (daysDiff / 7)) * 100) / 100;

    return {
      totalSpent,
      transactionCount,
      averageAmount,
      medianAmount,
      largestTransaction,
      smallestTransaction,
      dailyFrequency,
      weeklyFrequency
    };
  }
}

export const transactionAnalyticsService = new TransactionAnalyticsService();