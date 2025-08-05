import { supabase } from '../../app';
import { 
  AccountBalance, 
  CardBalance, 
  BalanceNotificationThreshold
} from '@discard/shared/src/types/funding';
import { FUNDING_CONSTANTS } from '@discard/shared/src/constants/funding';
import { createHash } from 'crypto';

export class BalanceService {
  /**
   * Get or create account balance for a user
   */
  async getAccountBalance(userId: string): Promise<AccountBalance> {
    try {
      // Generate balance context hash for privacy isolation
      const balanceContextHash = this.generateBalanceContextHash(userId);

      // Try to get existing balance
      const { data: balance, error: fetchError } = await supabase
        .from('account_balances')
        .select('*')
        .eq('user_id', userId)
        .single();

      if (fetchError && fetchError.code !== 'PGRST116') {
        console.error('Error fetching account balance:', fetchError);
        throw new Error('Failed to fetch account balance');
      }

      // If balance doesn't exist, create it
      if (!balance) {
        const newBalance = {
          user_id: userId,
          balance_context_hash: balanceContextHash,
          total_balance: 0,
          allocated_balance: 0,
        };

        const { data: createdBalance, error: createError } = await supabase
          .from('account_balances')
          .insert(newBalance)
          .select()
          .single();

        if (createError) {
          console.error('Error creating account balance:', createError);
          throw new Error('Failed to create account balance');
        }

        return {
          userId,
          totalBalance: createdBalance.total_balance,
          allocatedBalance: createdBalance.allocated_balance,
          availableBalance: createdBalance.available_balance,
          lastUpdated: createdBalance.last_updated,
        };
      }

      return {
        userId,
        totalBalance: balance.total_balance,
        allocatedBalance: balance.allocated_balance,
        availableBalance: balance.available_balance,
        lastUpdated: balance.last_updated,
      };
    } catch (error) {
      console.error('Balance service error:', error);
      throw new Error('Failed to retrieve account balance');
    }
  }

  /**
   * Update account balance
   */
  async updateAccountBalance(
    userId: string, 
    totalBalanceChange?: number, 
    allocatedBalanceChange?: number
  ): Promise<AccountBalance> {
    try {
      // Get current balance
      const currentBalance = await this.getAccountBalance(userId);

      // Calculate new balances
      const newTotalBalance = totalBalanceChange 
        ? currentBalance.totalBalance + totalBalanceChange 
        : currentBalance.totalBalance;
      
      const newAllocatedBalance = allocatedBalanceChange 
        ? currentBalance.allocatedBalance + allocatedBalanceChange 
        : currentBalance.allocatedBalance;

      // Validate balance consistency
      if (newAllocatedBalance > newTotalBalance) {
        throw new Error('Allocated balance cannot exceed total balance');
      }

      if (newTotalBalance < 0) {
        throw new Error('Total balance cannot be negative');
      }

      if (newAllocatedBalance < 0) {
        throw new Error('Allocated balance cannot be negative');
      }

      const { data: updatedBalance, error } = await supabase
        .from('account_balances')
        .update({
          total_balance: newTotalBalance,
          allocated_balance: newAllocatedBalance,
          last_updated: new Date().toISOString(),
        })
        .eq('user_id', userId)
        .select()
        .single();

      if (error) {
        console.error('Error updating account balance:', error);
        throw new Error('Failed to update account balance');
      }

      return {
        userId,
        totalBalance: updatedBalance.total_balance,
        allocatedBalance: updatedBalance.allocated_balance,
        availableBalance: updatedBalance.available_balance,
        lastUpdated: updatedBalance.last_updated,
      };
    } catch (error) {
      console.error('Balance update error:', error);
      throw error;
    }
  }

  /**
   * Get card balance
   */
  async getCardBalance(cardId: string): Promise<CardBalance> {
    try {
      const { data: card, error } = await supabase
        .from('cards')
        .select('current_balance, updated_at')
        .eq('card_id', cardId)
        .single();

      if (error) {
        console.error('Error fetching card balance:', error);
        throw new Error('Failed to fetch card balance');
      }

      if (!card) {
        throw new Error('Card not found');
      }

      return {
        cardId,
        balance: card.current_balance,
        lastUpdated: card.updated_at,
      };
    } catch (error) {
      console.error('Card balance error:', error);
      throw error;
    }
  }

  /**
   * Update card balance
   */
  async updateCardBalance(cardId: string, balanceChange: number): Promise<CardBalance> {
    try {
      // Get current card balance
      const currentBalance = await this.getCardBalance(cardId);
      const newBalance = currentBalance.balance + balanceChange;

      if (newBalance < 0) {
        throw new Error('Card balance cannot be negative');
      }

      const { data: updatedCard, error } = await supabase
        .from('cards')
        .update({
          current_balance: newBalance,
          updated_at: new Date().toISOString(),
        })
        .eq('card_id', cardId)
        .select('current_balance, updated_at')
        .single();

      if (error) {
        console.error('Error updating card balance:', error);
        throw new Error('Failed to update card balance');
      }

      return {
        cardId,
        balance: updatedCard.current_balance,
        lastUpdated: updatedCard.updated_at,
      };
    } catch (error) {
      console.error('Card balance update error:', error);
      throw error;
    }
  }

  /**
   * Transfer balance between cards (using database triggers)
   * Note: This method is deprecated in favor of database triggers in funding_transactions
   */
  async transferCardBalance(
    fromCardId: string, 
    toCardId: string, 
    amount: number
  ): Promise<{ fromCard: CardBalance; toCard: CardBalance }> {
    try {
      // This method is no longer needed as card balance updates are handled
      // automatically by database triggers when funding transactions are created
      throw new Error('Card balance transfers should be handled through funding transactions');
    } catch (error) {
      console.error('Card balance transfer error:', error);
      throw error;
    }
  }

  /**
   * Get notification thresholds for a user
   */
  async getNotificationThresholds(userId: string): Promise<BalanceNotificationThreshold> {
    try {
      const { data: threshold, error } = await supabase
        .from('balance_notification_thresholds')
        .select('*')
        .eq('user_id', userId)
        .single();

      if (error && error.code !== 'PGRST116') {
        console.error('Error fetching notification thresholds:', error);
        throw new Error('Failed to fetch notification thresholds');
      }

      // If no threshold exists, create default one
      if (!threshold) {
        const defaultThreshold = {
          user_id: userId,
          account_threshold: FUNDING_CONSTANTS.DEFAULT_ACCOUNT_THRESHOLD,
          card_threshold: FUNDING_CONSTANTS.DEFAULT_CARD_THRESHOLD,
          enable_notifications: true,
          notification_methods: JSON.stringify(['email']),
        };

        const { data: createdThreshold, error: createError } = await supabase
          .from('balance_notification_thresholds')
          .insert(defaultThreshold)
          .select()
          .single();

        if (createError) {
          console.error('Error creating notification thresholds:', createError);
          throw new Error('Failed to create notification thresholds');
        }

        return {
          userId,
          accountThreshold: createdThreshold.account_threshold,
          cardThreshold: createdThreshold.card_threshold,
          enableNotifications: createdThreshold.enable_notifications,
          notificationMethods: JSON.parse(createdThreshold.notification_methods),
        };
      }

      return {
        userId,
        accountThreshold: threshold.account_threshold,
        cardThreshold: threshold.card_threshold,
        enableNotifications: threshold.enable_notifications,
        notificationMethods: JSON.parse(threshold.notification_methods),
      };
    } catch (error) {
      console.error('Notification thresholds error:', error);
      throw error;
    }
  }

  /**
   * Update notification thresholds
   */
  async updateNotificationThresholds(
    userId: string, 
    thresholds: Partial<Omit<BalanceNotificationThreshold, 'userId'>>
  ): Promise<BalanceNotificationThreshold> {
    try {
      // Get current thresholds to merge with updates
      const currentThresholds = await this.getNotificationThresholds(userId);

      const updateData: any = {};
      
      if (thresholds.accountThreshold !== undefined) {
        updateData.account_threshold = thresholds.accountThreshold;
      }
      
      if (thresholds.cardThreshold !== undefined) {
        updateData.card_threshold = thresholds.cardThreshold;
      }
      
      if (thresholds.enableNotifications !== undefined) {
        updateData.enable_notifications = thresholds.enableNotifications;
      }
      
      if (thresholds.notificationMethods !== undefined) {
        updateData.notification_methods = JSON.stringify(thresholds.notificationMethods);
      }

      const { data: updatedThreshold, error } = await supabase
        .from('balance_notification_thresholds')
        .update(updateData)
        .eq('user_id', userId)
        .select()
        .single();

      if (error) {
        console.error('Error updating notification thresholds:', error);
        throw new Error('Failed to update notification thresholds');
      }

      return {
        userId,
        accountThreshold: updatedThreshold.account_threshold,
        cardThreshold: updatedThreshold.card_threshold,
        enableNotifications: updatedThreshold.enable_notifications,
        notificationMethods: JSON.parse(updatedThreshold.notification_methods),
      };
    } catch (error) {
      console.error('Notification thresholds update error:', error);
      throw error;
    }
  }

  /**
   * Check if balance is below notification threshold
   */
  async checkLowBalanceNotification(userId: string): Promise<{
    shouldNotifyAccount: boolean;
    shouldNotifyCards: string[];
  }> {
    try {
      const thresholds = await this.getNotificationThresholds(userId);
      
      if (!thresholds.enableNotifications) {
        return { shouldNotifyAccount: false, shouldNotifyCards: [] };
      }

      const accountBalance = await this.getAccountBalance(userId);
      
      // Check account balance
      const shouldNotifyAccount = accountBalance.availableBalance < thresholds.accountThreshold;

      // Check card balances
      const { data: cards, error } = await supabase
        .from('cards')
        .select('card_id, current_balance')
        .eq('user_id', userId)
        .eq('status', 'active');

      if (error) {
        console.error('Error fetching cards for notification check:', error);
        return { shouldNotifyAccount, shouldNotifyCards: [] };
      }

      const shouldNotifyCards = cards
        .filter(card => card.current_balance < thresholds.cardThreshold)
        .map(card => card.card_id);

      return { shouldNotifyAccount, shouldNotifyCards };
    } catch (error) {
      console.error('Low balance notification check error:', error);
      return { shouldNotifyAccount: false, shouldNotifyCards: [] };
    }
  }

  /**
   * Generate balance context hash for privacy isolation
   */
  private generateBalanceContextHash(userId: string): string {
    const contextData = `balance_${userId}_${Date.now()}`;
    return createHash('sha256').update(contextData).digest('hex');
  }
}

export const balanceService = new BalanceService();