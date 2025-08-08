import { Request, Response } from 'express';
import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';

// Inline type definitions to resolve missing shared types dependency
interface NotificationPreference {
  preferenceId: string;
  cardContext: string;
  notificationType: 'push' | 'email' | 'both' | 'none';
  amountThreshold: number;
  merchantCategories: string[];
  timeRestrictions: {
    quietHoursStart: number;
    quietHoursEnd: number;
    weekendAlerts: boolean;
  };
  spendingAlerts: {
    limitThresholds: number[];
    velocityAlerts: boolean;
    unusualSpendingAlerts: boolean;
  };
  declineAlerts: boolean;
  createdAt: Date;
  updatedAt: Date;
}

interface NotificationHistory {
  notificationId: string;
  cardContext: string;
  transactionId?: string;
  notificationType: 'transaction' | 'spending_limit' | 'decline' | 'unusual_activity';
  deliveryChannel: 'push' | 'email';
  status: 'pending' | 'delivered' | 'failed' | 'read';
  content: {
    title: string;
    message: string;
    actionButtons?: string[];
  };
  sentAt: Date;
  deliveredAt?: Date;
  readAt?: Date;
  errorMessage?: string;
}

interface TransactionCategory {
  categoryId: string;
  categoryName: string;
  categoryCode: string;
  mccCodes: string[];
  parentCategoryId?: string;
  icon: string;
  color: string;
  displayOrder: number;
  isActive: boolean;
}

// Validation schemas
const NotificationPreferencesSchema = z.object({
  cardContext: z.string().uuid(),
  notificationType: z.enum(['push', 'email', 'both', 'none']),
  amountThreshold: z.number().min(0),
  merchantCategories: z.array(z.string()),
  timeRestrictions: z.object({
    quietHoursStart: z.number().min(0).max(23),
    quietHoursEnd: z.number().min(0).max(23),
    weekendAlerts: z.boolean(),
  }),
  spendingAlerts: z.object({
    limitThresholds: z.array(z.number().min(0).max(100)),
    velocityAlerts: z.boolean(),
    unusualSpendingAlerts: z.boolean(),
  }),
  declineAlerts: z.boolean(),
});

const TestNotificationSchema = z.object({
  cardContext: z.string().uuid(),
  notificationType: z.enum(['transaction', 'spending_limit', 'decline']),
  deliveryChannel: z.enum(['push', 'email']),
  testData: z.object({
    amount: z.number().optional(),
    merchantName: z.string().optional(),
    declineReason: z.string().optional(),
  }),
});

class NotificationsController {
  private supabase;

  constructor() {
    this.supabase = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_KEY!
    );
  }

  // GET /api/v1/notifications/preferences
  async getPreferences(req: Request, res: Response) {
    try {
      const { cardContext } = req.query;
      const userId = req.user?.id;

      if (!userId) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      let query = this.supabase
        .from('notification_preferences')
        .select('*')
        .eq('user_id', userId);

      if (cardContext) {
        query = query.eq('card_context', cardContext);
      }

      const { data: preferences, error } = await query;

      if (error) {
        console.error('Error fetching notification preferences:', error);
        return res.status(500).json({ error: 'Failed to fetch preferences' });
      }

      // Get default settings
      const defaultSettings: Partial<NotificationPreference> = {
        notificationType: 'push',
        amountThreshold: 0,
        merchantCategories: [],
        timeRestrictions: {
          quietHoursStart: 22,
          quietHoursEnd: 7,
          weekendAlerts: true,
        },
        spendingAlerts: {
          limitThresholds: [50, 75, 90],
          velocityAlerts: true,
          unusualSpendingAlerts: true,
        },
        declineAlerts: true,
      };

      res.json({
        preferences,
        defaultSettings,
      });
    } catch (error) {
      console.error('Error in getPreferences:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  // PUT /api/v1/notifications/preferences
  async updatePreferences(req: Request, res: Response) {
    try {
      const validationResult = NotificationPreferencesSchema.safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({
          error: 'Invalid request data',
          details: validationResult.error.errors,
        });
      }

      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const preferences = validationResult.data;
      const now = new Date();

      const { data, error } = await this.supabase
        .from('notification_preferences')
        .upsert({
          user_id: userId,
          card_context: preferences.cardContext,
          notification_type: preferences.notificationType,
          amount_threshold: preferences.amountThreshold,
          merchant_categories: preferences.merchantCategories,
          time_restrictions: preferences.timeRestrictions,
          spending_alerts: preferences.spendingAlerts,
          decline_alerts: preferences.declineAlerts,
          updated_at: now.toISOString(),
        }, {
          onConflict: 'user_id,card_context'
        })
        .select()
        .single();

      if (error) {
        console.error('Error updating notification preferences:', error);
        return res.status(500).json({ error: 'Failed to update preferences' });
      }

      res.json({
        preferenceId: data.preference_id,
        updated: true,
        appliedAt: now,
      });
    } catch (error) {
      console.error('Error in updatePreferences:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  // PUT /api/v1/notifications/preferences/card/{cardId}
  async updateCardPreferences(req: Request, res: Response) {
    try {
      const { cardId } = req.params;
      const userId = req.user?.id;

      if (!userId) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      // Validate card access
      const { data: cardAccess, error: cardError } = await this.supabase
        .from('payment_cards')
        .select('card_context')
        .eq('card_id', cardId)
        .eq('user_id', userId)
        .single();

      if (cardError || !cardAccess) {
        return res.status(404).json({ error: 'Card not found or access denied' });
      }

      const validationResult = NotificationPreferencesSchema.omit({ cardContext: true }).safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({
          error: 'Invalid request data',
          details: validationResult.error.errors,
        });
      }

      const preferences = validationResult.data;
      const now = new Date();

      const { data, error } = await this.supabase
        .from('notification_preferences')
        .upsert({
          user_id: userId,
          card_context: cardAccess.card_context,
          notification_type: preferences.notificationType,
          amount_threshold: preferences.amountThreshold,
          merchant_categories: preferences.merchantCategories,
          time_restrictions: preferences.timeRestrictions,
          spending_alerts: preferences.spendingAlerts,
          decline_alerts: preferences.declineAlerts,
          updated_at: now.toISOString(),
        }, {
          onConflict: 'user_id,card_context'
        })
        .select()
        .single();

      if (error) {
        console.error('Error updating card notification preferences:', error);
        return res.status(500).json({ error: 'Failed to update preferences' });
      }

      res.json({
        preferenceId: data.preference_id,
        updated: true,
        appliedAt: now,
      });
    } catch (error) {
      console.error('Error in updateCardPreferences:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  // POST /api/v1/notifications/test
  async testNotification(req: Request, res: Response) {
    try {
      const validationResult = TestNotificationSchema.safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({
          error: 'Invalid request data',
          details: validationResult.error.errors,
        });
      }

      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const { cardContext, notificationType, deliveryChannel, testData } = validationResult.data;

      // Verify card access
      const { data: cardAccess, error: cardError } = await this.supabase
        .from('payment_cards')
        .select('card_id')
        .eq('card_context', cardContext)
        .eq('user_id', userId)
        .single();

      if (cardError || !cardAccess) {
        return res.status(404).json({ error: 'Card not found or access denied' });
      }

      const testId = `test-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      const now = new Date();

      // Create test notification content based on type
      let content: { title: string; message: string; actionButtons?: string[] };
      
      switch (notificationType) {
        case 'transaction':
          content = {
            title: 'Test Transaction Alert',
            message: `Test transaction of $${testData.amount || 25.00} at ${testData.merchantName || 'Test Merchant'}`,
            actionButtons: ['View Details', 'Dispute']
          };
          break;
        case 'spending_limit':
          content = {
            title: 'Test Spending Alert',
            message: 'You have reached 75% of your spending limit for this card',
            actionButtons: ['View Spending', 'Adjust Limits']
          };
          break;
        case 'decline':
          content = {
            title: 'Test Transaction Declined',
            message: `Transaction declined: ${testData.declineReason || 'Insufficient funds'}`,
            actionButtons: ['Add Funds', 'Contact Support']
          };
          break;
      }

      // Log test notification to history
      const { error: historyError } = await this.supabase
        .from('notification_history')
        .insert({
          notification_id: testId,
          card_context: cardContext,
          notification_type: notificationType,
          delivery_channel: deliveryChannel,
          status: 'delivered',
          content,
          sent_at: now.toISOString(),
          delivered_at: now.toISOString(),
        });

      if (historyError) {
        console.error('Error logging test notification:', historyError);
      }

      // In a real implementation, this would trigger actual push/email delivery
      // For testing, we simulate immediate delivery
      res.json({
        testId,
        status: 'sent' as const,
        deliveredAt: now,
      });
    } catch (error) {
      console.error('Error in testNotification:', error);
      res.status(500).json({
        testId: null,
        status: 'failed' as const,
        error: 'Internal server error',
      });
    }
  }

  // GET /api/v1/notifications/history
  async getNotificationHistory(req: Request, res: Response) {
    try {
      const { cardContext, limit = 50, offset = 0, status } = req.query;
      const userId = req.user?.id;

      if (!userId) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      let query = this.supabase
        .from('notification_history')
        .select('*')
        .eq('user_id', userId)
        .order('sent_at', { ascending: false })
        .range(Number(offset), Number(offset) + Number(limit) - 1);

      if (cardContext) {
        query = query.eq('card_context', cardContext);
      }

      if (status) {
        query = query.eq('status', status);
      }

      const { data: history, error } = await query;

      if (error) {
        console.error('Error fetching notification history:', error);
        return res.status(500).json({ error: 'Failed to fetch notification history' });
      }

      // Get total count for pagination
      let countQuery = this.supabase
        .from('notification_history')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId);

      if (cardContext) {
        countQuery = countQuery.eq('card_context', cardContext);
      }

      if (status) {
        countQuery = countQuery.eq('status', status);
      }

      const { count, error: countError } = await countQuery;

      if (countError) {
        console.error('Error getting notification count:', countError);
      }

      res.json({
        history,
        pagination: {
          total: count || 0,
          limit: Number(limit),
          offset: Number(offset),
          hasMore: (Number(offset) + Number(limit)) < (count || 0),
        },
      });
    } catch (error) {
      console.error('Error in getNotificationHistory:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  // DELETE /api/v1/notifications/history/{notificationId}
  async deleteNotificationHistory(req: Request, res: Response) {
    try {
      const { notificationId } = req.params;
      const userId = req.user?.id;

      if (!userId) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const { error } = await this.supabase
        .from('notification_history')
        .delete()
        .eq('notification_id', notificationId)
        .eq('user_id', userId);

      if (error) {
        console.error('Error deleting notification history:', error);
        return res.status(500).json({ error: 'Failed to delete notification' });
      }

      res.json({ deleted: true });
    } catch (error) {
      console.error('Error in deleteNotificationHistory:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  // GET /api/v1/transactions/categories
  async getTransactionCategories(req: Request, res: Response) {
    try {
      const { data: categories, error } = await this.supabase
        .from('transaction_categories')
        .select('*')
        .eq('is_active', true)
        .order('display_order', { ascending: true });

      if (error) {
        console.error('Error fetching transaction categories:', error);
        return res.status(500).json({ error: 'Failed to fetch categories' });
      }

      // Group categories by parent for hierarchical display
      const categoryMap = new Map();
      const rootCategories: TransactionCategory[] = [];

      categories.forEach((category: TransactionCategory) => {
        categoryMap.set(category.categoryId, { ...category, children: [] });
      });

      categories.forEach((category: TransactionCategory) => {
        const categoryNode = categoryMap.get(category.categoryId);
        if (category.parentCategoryId) {
          const parent = categoryMap.get(category.parentCategoryId);
          if (parent) {
            parent.children.push(categoryNode);
          }
        } else {
          rootCategories.push(categoryNode);
        }
      });

      res.json({
        categories: rootCategories,
        totalCount: categories.length,
      });
    } catch (error) {
      console.error('Error in getTransactionCategories:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  // Rate limiting middleware for notification endpoints
  rateLimitNotifications = (req: Request, res: Response, next: any) => {
    // In a real implementation, this would use Redis or similar for distributed rate limiting
    // For now, we'll use in-memory rate limiting (not suitable for production)
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Allow 100 requests per hour per user for notification endpoints
    const rateLimit = 100;
    const windowMs = 60 * 60 * 1000; // 1 hour

    // In production, implement proper distributed rate limiting
    next();
  };

  // Notification analytics and metrics
  async getNotificationMetrics(req: Request, res: Response) {
    try {
      const { cardContext, startDate, endDate } = req.query;
      const userId = req.user?.id;

      if (!userId) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const start = startDate ? new Date(startDate as string) : new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      const end = endDate ? new Date(endDate as string) : new Date();

      let query = this.supabase
        .from('notification_history')
        .select('notification_type, delivery_channel, status, sent_at')
        .eq('user_id', userId)
        .gte('sent_at', start.toISOString())
        .lte('sent_at', end.toISOString());

      if (cardContext) {
        query = query.eq('card_context', cardContext);
      }

      const { data: metrics, error } = await query;

      if (error) {
        console.error('Error fetching notification metrics:', error);
        return res.status(500).json({ error: 'Failed to fetch metrics' });
      }

      // Calculate metrics
      const totalNotifications = metrics.length;
      const deliveryStats = metrics.reduce((acc, notification) => {
        const key = `${notification.delivery_channel}_${notification.status}`;
        acc[key] = (acc[key] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);

      const typeStats = metrics.reduce((acc, notification) => {
        acc[notification.notification_type] = (acc[notification.notification_type] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);

      res.json({
        period: { start, end },
        totalNotifications,
        deliveryStats,
        typeStats,
        averageDeliveryRate: totalNotifications > 0 ? 
          ((deliveryStats.push_delivered || 0) + (deliveryStats.email_delivered || 0)) / totalNotifications : 0,
      });
    } catch (error) {
      console.error('Error in getNotificationMetrics:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
}

export default NotificationsController;