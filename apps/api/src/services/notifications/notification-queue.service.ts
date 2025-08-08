import { createClient } from '@supabase/supabase-js';
import Redis from 'ioredis';

// Inline type definitions
interface QueuedNotification {
  id: string;
  cardContext: string;
  userId: string;
  notificationType: 'transaction' | 'spending_limit' | 'decline' | 'unusual_activity';
  deliveryChannel: 'push' | 'email';
  priority: 'high' | 'medium' | 'low';
  content: {
    title: string;
    message: string;
    actionButtons?: string[];
  };
  scheduledFor: Date;
  retryCount: number;
  maxRetries: number;
  metadata: Record<string, any>;
  createdAt: Date;
}

interface NotificationDeliveryResult {
  success: boolean;
  deliveredAt?: Date;
  error?: string;
  shouldRetry: boolean;
}

class NotificationQueueService {
  private supabase;
  private redis: Redis;
  private isProcessing = false;
  private processingInterval: NodeJS.Timeout | null = null;

  constructor() {
    this.supabase = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_KEY!
    );

    // Initialize Redis connection for queue management
    this.redis = new Redis(process.env.NOTIFICATION_QUEUE_REDIS_URL || 'redis://localhost:6379/2', {
      retryDelayOnFailover: 1000,
      lazyConnect: true,
    });

    this.redis.on('error', (error) => {
      console.error('Redis connection error:', error);
    });

    // Start queue processing
    this.startQueueProcessing();
  }

  async enqueueNotification(notification: Omit<QueuedNotification, 'id' | 'retryCount' | 'createdAt'>): Promise<string> {
    try {
      const notificationId = `notif-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      const queuedNotification: QueuedNotification = {
        ...notification,
        id: notificationId,
        retryCount: 0,
        createdAt: new Date(),
      };

      // Add to Redis queue based on priority and scheduled time
      const queueKey = this.getQueueKey(notification.priority, notification.scheduledFor);
      const score = notification.scheduledFor.getTime();

      await this.redis.zadd(queueKey, score, JSON.stringify(queuedNotification));

      // Log queuing in database for audit
      await this.supabase
        .from('notification_history')
        .insert({
          notification_id: notificationId,
          card_context: notification.cardContext,
          user_id: notification.userId,
          notification_type: notification.notificationType,
          delivery_channel: notification.deliveryChannel,
          status: 'pending',
          content: notification.content,
          sent_at: new Date().toISOString(),
        });

      console.log(`Notification queued: ${notificationId} in queue: ${queueKey}`);
      return notificationId;
    } catch (error) {
      console.error('Error enqueueing notification:', error);
      throw new Error('Failed to queue notification');
    }
  }

  private getQueueKey(priority: string, scheduledFor: Date): string {
    const isImmediate = scheduledFor.getTime() <= Date.now();
    if (isImmediate) {
      return `notifications:immediate:${priority}`;
    } else {
      return `notifications:scheduled:${priority}`;
    }
  }

  private startQueueProcessing(): void {
    if (this.processingInterval) {
      clearInterval(this.processingInterval);
    }

    // Process queue every 5 seconds
    this.processingInterval = setInterval(async () => {
      if (!this.isProcessing) {
        await this.processQueue();
      }
    }, 5000);
  }

  private async processQueue(): Promise<void> {
    this.isProcessing = true;
    
    try {
      // Process in priority order: high -> medium -> low
      const priorities = ['high', 'medium', 'low'];
      
      for (const priority of priorities) {
        await this.processQueueByPriority(priority);
      }
    } catch (error) {
      console.error('Error processing notification queue:', error);
    } finally {
      this.isProcessing = false;
    }
  }

  private async processQueueByPriority(priority: string): Promise<void> {
    const immediateQueue = `notifications:immediate:${priority}`;
    const scheduledQueue = `notifications:scheduled:${priority}`;
    
    // Process immediate notifications first
    await this.processQueueMessages(immediateQueue);
    
    // Process scheduled notifications that are ready
    await this.processScheduledMessages(scheduledQueue);
  }

  private async processQueueMessages(queueKey: string, limit: number = 10): Promise<void> {
    try {
      // Get messages from queue (oldest first)
      const messages = await this.redis.zrange(queueKey, 0, limit - 1);
      
      for (const messageData of messages) {
        try {
          const notification: QueuedNotification = JSON.parse(messageData);
          const result = await this.deliverNotification(notification);
          
          if (result.success) {
            // Remove from queue on successful delivery
            await this.redis.zrem(queueKey, messageData);
            await this.updateNotificationStatus(notification.id, 'delivered', result.deliveredAt);
          } else if (result.shouldRetry && notification.retryCount < notification.maxRetries) {
            // Retry with exponential backoff
            await this.retryNotification(queueKey, notification, messageData);
          } else {
            // Max retries exceeded or non-retryable error
            await this.redis.zrem(queueKey, messageData);
            await this.updateNotificationStatus(notification.id, 'failed', undefined, result.error);
          }
        } catch (parseError) {
          console.error('Error parsing queued notification:', parseError);
          // Remove malformed messages
          await this.redis.zrem(queueKey, messageData);
        }
      }
    } catch (error) {
      console.error(`Error processing queue ${queueKey}:`, error);
    }
  }

  private async processScheduledMessages(queueKey: string): Promise<void> {
    try {
      const now = Date.now();
      // Get messages scheduled for delivery up to now
      const messages = await this.redis.zrangebyscore(queueKey, '-inf', now);
      
      for (const messageData of messages) {
        try {
          const notification: QueuedNotification = JSON.parse(messageData);
          
          // Move to immediate queue for processing
          const immediateQueue = this.getQueueKey(notification.priority, new Date());
          await this.redis.zadd(immediateQueue, Date.now(), messageData);
          await this.redis.zrem(queueKey, messageData);
        } catch (parseError) {
          console.error('Error processing scheduled notification:', parseError);
          await this.redis.zrem(queueKey, messageData);
        }
      }
    } catch (error) {
      console.error(`Error processing scheduled queue ${queueKey}:`, error);
    }
  }

  private async deliverNotification(notification: QueuedNotification): Promise<NotificationDeliveryResult> {
    try {
      // Check user preferences before delivery
      const { data: preferences, error: prefError } = await this.supabase
        .from('notification_preferences')
        .select('*')
        .eq('card_context', notification.cardContext)
        .single();

      if (prefError && prefError.code !== 'PGRST116') { // PGRST116 = not found
        console.error('Error fetching notification preferences:', prefError);
        return { success: false, shouldRetry: true, error: 'Failed to fetch preferences' };
      }

      // Check if notifications are disabled for this channel
      if (preferences && (
        preferences.notification_type === 'none' || 
        (notification.deliveryChannel === 'push' && preferences.notification_type === 'email') ||
        (notification.deliveryChannel === 'email' && preferences.notification_type === 'push')
      )) {
        console.log(`Notification delivery skipped due to user preferences: ${notification.id}`);
        return { success: true, deliveredAt: new Date() }; // Consider as delivered (user choice)
      }

      // Check time restrictions
      if (preferences && !this.isWithinAllowedTime(preferences.time_restrictions)) {
        // Reschedule for later
        console.log(`Notification rescheduled due to quiet hours: ${notification.id}`);
        return { success: false, shouldRetry: true, error: 'Outside allowed time window' };
      }

      // Deliver based on channel
      switch (notification.deliveryChannel) {
        case 'push':
          return await this.deliverPushNotification(notification);
        case 'email':
          return await this.deliverEmailNotification(notification);
        default:
          return { success: false, shouldRetry: false, error: 'Unknown delivery channel' };
      }
    } catch (error) {
      console.error('Error delivering notification:', error);
      return { success: false, shouldRetry: true, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  private async deliverPushNotification(notification: QueuedNotification): Promise<NotificationDeliveryResult> {
    try {
      // Get user's device tokens
      const { data: devices, error } = await this.supabase
        .from('user_devices')
        .select('device_token, platform')
        .eq('user_id', notification.userId)
        .eq('is_active', true);

      if (error) {
        console.error('Error fetching device tokens:', error);
        return { success: false, shouldRetry: true, error: 'Failed to fetch device tokens' };
      }

      if (!devices || devices.length === 0) {
        console.log(`No active devices found for user: ${notification.userId}`);
        return { success: true, deliveredAt: new Date() }; // No devices to deliver to
      }

      // Send to all devices
      const deliveryPromises = devices.map(device => 
        this.sendPushToDevice(device.device_token, device.platform, notification.content)
      );

      const results = await Promise.allSettled(deliveryPromises);
      const anySuccess = results.some(result => result.status === 'fulfilled' && result.value);

      if (anySuccess) {
        return { success: true, deliveredAt: new Date() };
      } else {
        return { success: false, shouldRetry: true, error: 'All push deliveries failed' };
      }
    } catch (error) {
      console.error('Error delivering push notification:', error);
      return { success: false, shouldRetry: true, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  private async sendPushToDevice(deviceToken: string, platform: string, content: any): Promise<boolean> {
    // In a real implementation, this would integrate with APNs/FCM
    // For now, simulate delivery
    console.log(`[MOCK] Sending push notification to ${platform} device ${deviceToken}:`, content);
    
    // Simulate some delivery time
    await new Promise(resolve => setTimeout(resolve, 100));
    
    // Simulate 95% success rate
    return Math.random() > 0.05;
  }

  private async deliverEmailNotification(notification: QueuedNotification): Promise<NotificationDeliveryResult> {
    try {
      // Get user email
      const { data: user, error } = await this.supabase
        .from('users')
        .select('email')
        .eq('user_id', notification.userId)
        .single();

      if (error || !user) {
        console.error('Error fetching user email:', error);
        return { success: false, shouldRetry: true, error: 'Failed to fetch user email' };
      }

      // Send email
      const emailSent = await this.sendEmail(user.email, notification.content);
      
      if (emailSent) {
        return { success: true, deliveredAt: new Date() };
      } else {
        return { success: false, shouldRetry: true, error: 'Email delivery failed' };
      }
    } catch (error) {
      console.error('Error delivering email notification:', error);
      return { success: false, shouldRetry: true, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  private async sendEmail(email: string, content: any): Promise<boolean> {
    // In a real implementation, this would integrate with email service (SendGrid, SES, etc.)
    // For now, simulate delivery
    console.log(`[MOCK] Sending email notification to ${email}:`, content);
    
    // Simulate some delivery time
    await new Promise(resolve => setTimeout(resolve, 200));
    
    // Simulate 98% success rate for email
    return Math.random() > 0.02;
  }

  private isWithinAllowedTime(timeRestrictions: any): boolean {
    if (!timeRestrictions) return true;

    const now = new Date();
    const currentHour = now.getHours();
    const isWeekend = now.getDay() === 0 || now.getDay() === 6;

    // Check weekend restriction
    if (isWeekend && !timeRestrictions.weekend_alerts) {
      return false;
    }

    // Check quiet hours
    const quietStart = timeRestrictions.quiet_hours_start;
    const quietEnd = timeRestrictions.quiet_hours_end;

    if (quietStart !== undefined && quietEnd !== undefined) {
      if (quietStart <= quietEnd) {
        // Same day quiet hours (e.g., 22:00 to 7:00 next day)
        return !(currentHour >= quietStart && currentHour < quietEnd);
      } else {
        // Across midnight (e.g., 22:00 to 7:00)
        return !(currentHour >= quietStart || currentHour < quietEnd);
      }
    }

    return true;
  }

  private async retryNotification(queueKey: string, notification: QueuedNotification, messageData: string): Promise<void> {
    try {
      const retryDelay = Math.pow(2, notification.retryCount) * 5000; // Exponential backoff: 5s, 10s, 20s, 40s...
      const retryTime = Date.now() + retryDelay;

      const updatedNotification: QueuedNotification = {
        ...notification,
        retryCount: notification.retryCount + 1,
        scheduledFor: new Date(retryTime),
      };

      // Remove from current queue
      await this.redis.zrem(queueKey, messageData);
      
      // Add to scheduled queue with new retry time
      const scheduledQueue = `notifications:scheduled:${notification.priority}`;
      await this.redis.zadd(scheduledQueue, retryTime, JSON.stringify(updatedNotification));

      console.log(`Notification ${notification.id} scheduled for retry ${notification.retryCount + 1} at ${new Date(retryTime)}`);
    } catch (error) {
      console.error('Error scheduling notification retry:', error);
    }
  }

  private async updateNotificationStatus(
    notificationId: string, 
    status: 'delivered' | 'failed', 
    deliveredAt?: Date, 
    errorMessage?: string
  ): Promise<void> {
    try {
      const updateData: any = { status };
      
      if (deliveredAt) {
        updateData.delivered_at = deliveredAt.toISOString();
      }
      
      if (errorMessage) {
        updateData.error_message = errorMessage;
      }

      await this.supabase
        .from('notification_history')
        .update(updateData)
        .eq('notification_id', notificationId);
    } catch (error) {
      console.error('Error updating notification status:', error);
    }
  }

  async getQueueStats(): Promise<any> {
    try {
      const stats: any = {};
      const priorities = ['high', 'medium', 'low'];
      
      for (const priority of priorities) {
        const immediateQueue = `notifications:immediate:${priority}`;
        const scheduledQueue = `notifications:scheduled:${priority}`;
        
        const [immediateCount, scheduledCount] = await Promise.all([
          this.redis.zcard(immediateQueue),
          this.redis.zcard(scheduledQueue),
        ]);
        
        stats[priority] = {
          immediate: immediateCount,
          scheduled: scheduledCount,
          total: immediateCount + scheduledCount,
        };
      }
      
      return stats;
    } catch (error) {
      console.error('Error getting queue stats:', error);
      return {};
    }
  }

  async shutdown(): Promise<void> {
    console.log('Shutting down notification queue service...');
    
    if (this.processingInterval) {
      clearInterval(this.processingInterval);
      this.processingInterval = null;
    }
    
    await this.redis.quit();
    console.log('Notification queue service shutdown complete');
  }
}

export default NotificationQueueService;