import { supabase } from '../../utils/supabase';
import { logger } from '../../utils/logger';
import crypto from 'crypto';

interface TransactionHistoryParams {
  cardId: string;
  userId: string;
  pagination: {
    page: number;
    limit: number;
  };
  filters: {
    status?: string;
    startDate?: string;
    endDate?: string;
  };
}

interface TransactionDetail {
  transactionId: string;
  merchantName: string;
  merchantCategory: string;
  amount: number;
  status: string;
  processedAt: string;
  authorizationCode?: string;
  privacyCountdown: number;
  encryptionStatus: boolean;
  refundInfo?: any;
  maskedCardNumber?: string;
  maskedAuthCode?: string;
  transactionHash: string;
}

export class TransactionHistoryService {
  /**
   * Get paginated transaction history for a card with privacy isolation
   */
  async getCardTransactions(params: TransactionHistoryParams) {
    const { cardId, userId, pagination, filters } = params;

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

      // Build query with filters
      let query = supabase
        .from('payment_transactions')
        .select('*', { count: 'exact' })
        .eq('card_context_hash', card.card_context_hash)
        .order('processed_at', { ascending: false });

      // Apply status filter
      if (filters.status) {
        query = query.eq('status', filters.status);
      }

      // Apply date range filter
      if (filters.startDate) {
        query = query.gte('processed_at', filters.startDate);
      }
      if (filters.endDate) {
        query = query.lte('processed_at', filters.endDate);
      }

      // Apply pagination
      const offset = (pagination.page - 1) * pagination.limit;
      query = query.range(offset, offset + pagination.limit - 1);

      const { data: transactions, count, error } = await query;

      if (error) {
        logger.error('Error fetching transactions:', error);
        throw error;
      }

      // Calculate analytics in real-time
      const analytics = await this.calculateAnalytics(
        card.card_context_hash,
        transactions || []
      );

      // Transform transactions to include privacy countdown
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

      return {
        transactions: transformedTransactions,
        pagination: {
          total: count || 0,
          page: pagination.page,
          limit: pagination.limit,
          hasMore: (count || 0) > offset + pagination.limit
        },
        analytics
      };
    } catch (error) {
      logger.error('Transaction history service error:', error);
      throw error;
    }
  }

  /**
   * Get detailed transaction information with privacy enhancements
   */
  async getTransactionDetail(transactionId: string, userId: string): Promise<TransactionDetail | null> {
    try {
      // First get the transaction to verify card ownership
      const { data: transaction } = await supabase
        .from('payment_transactions')
        .select(`
          *,
          cards!inner (
            id,
            user_id,
            card_number
          )
        `)
        .eq('transaction_id', transactionId)
        .single();

      if (!transaction || transaction.cards.user_id !== userId) {
        return null; // Transaction not found or unauthorized
      }

      // Set card context for RLS
      await supabase.rpc('set_app_context', { 
        context_value: transaction.card_context_hash 
      });

      // Check for refund/dispute information
      const { data: disputes } = await supabase
        .from('transaction_disputes')
        .select('*')
        .eq('transaction_id', transactionId);

      // Mask sensitive data
      const maskedCardNumber = transaction.cards.card_number 
        ? `****${transaction.cards.card_number.slice(-4)}` 
        : undefined;
      const maskedAuthCode = transaction.authorization_code
        ? `${transaction.authorization_code.slice(0, 6)}******`
        : undefined;

      // Generate transaction hash for verification
      const transactionHash = this.generateTransactionHash(transaction);

      return {
        transactionId: transaction.transaction_id,
        merchantName: transaction.merchant_name,
        merchantCategory: transaction.merchant_category,
        amount: transaction.amount,
        status: transaction.status,
        processedAt: transaction.processed_at,
        authorizationCode: transaction.authorization_code,
        privacyCountdown: this.calculatePrivacyCountdown(transaction.retention_until),
        encryptionStatus: true, // Always encrypted
        refundInfo: disputes?.[0] || null,
        maskedCardNumber,
        maskedAuthCode,
        transactionHash
      };
    } catch (error) {
      logger.error('Transaction detail service error:', error);
      throw error;
    }
  }

  /**
   * Calculate real-time analytics for transactions
   */
  private async calculateAnalytics(cardContextHash: string, transactions: any[]) {
    const totalSpent = transactions
      .filter(tx => tx.status === 'settled')
      .reduce((sum, tx) => sum + tx.amount, 0);

    const categoryBreakdown: { [key: string]: number } = {};
    transactions.forEach(tx => {
      if (tx.status === 'settled') {
        categoryBreakdown[tx.merchant_category] = 
          (categoryBreakdown[tx.merchant_category] || 0) + tx.amount;
      }
    });

    const transactionCount = transactions.length;
    const averageTransaction = transactionCount > 0 
      ? Math.round(totalSpent / transactionCount) 
      : 0;

    return {
      totalSpent,
      transactionCount,
      categoryBreakdown,
      averageTransaction
    };
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
   * Generate cryptographic hash for transaction verification
   */
  private generateTransactionHash(transaction: any): string {
    const data = `${transaction.transaction_id}:${transaction.merchant_name}:${transaction.amount}:${transaction.processed_at}`;
    return crypto.createHash('sha256').update(data).digest('hex');
  }
}

export const transactionHistoryService = new TransactionHistoryService();