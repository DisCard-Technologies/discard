import { supabase } from '../../utils/supabase';
import { TransactionIsolationService } from '../privacy/transaction-isolation.service';
import { logger } from '../../utils/logger';

export interface SecurityNotification {
  notificationId?: string;
  cardId: string;
  type: 'fraud_alert' | 'card_frozen' | 'card_unfrozen' | 'suspicious_activity' | 'security_incident' | 'mfa_required';
  severity: 'low' | 'medium' | 'high' | 'critical';
  title: string;
  message: string;
  actionRequired: boolean;
  actionButtons?: NotificationAction[];
  metadata?: Record<string, any>;
  expiresAt?: Date;
}

export interface NotificationAction {
  actionId: string;
  label: string;
  actionType: 'unfreeze_card' | 'confirm_transaction' | 'report_false_positive' | 'view_details' | 'contact_support';
  style: 'primary' | 'secondary' | 'danger';
  requiresAuth?: boolean;
}

export interface NotificationPreferences {
  cardId: string;
  pushEnabled: boolean;
  emailEnabled: boolean;
  smsEnabled: boolean;
  severityThreshold: 'low' | 'medium' | 'high' | 'critical';
  quietHours?: {
    enabled: boolean;
    startTime: string; // HH:MM format
    endTime: string; // HH:MM format
  };
  categories: {
    fraudAlerts: boolean;
    cardActions: boolean;
    securityIncidents: boolean;
    systemUpdates: boolean;
  };
}

export interface DeliveryResult {
  success: boolean;
  channel: 'push' | 'email' | 'sms' | 'in_app';
  deliveredAt?: Date;
  error?: string;
  messageId?: string;
}

export class SecurityNotificationService {
  private isolationService: TransactionIsolationService;
  
  constructor() {
    this.isolationService = new TransactionIsolationService(supabase);
  }

  async sendSecurityAlert(notification: SecurityNotification): Promise<DeliveryResult[]> {
    try {
      // Enforce card isolation
      await this.isolationService.enforceTransactionIsolation(notification.cardId);
      const isolationContext = await this.isolationService.getCardContext(notification.cardId);
      
      // Get user notification preferences
      const preferences = await this.getNotificationPreferences(notification.cardId);
      
      // Check if notification should be sent based on preferences
      if (!this.shouldSendNotification(notification, preferences)) {
        logger.info(`Notification filtered by user preferences: ${notification.type}`);
        return [];
      }
      
      // Store notification in database
      const storedNotification = await this.storeNotification(
        notification,
        isolationContext.cardContextHash
      );
      
      // Send via enabled channels
      const deliveryResults = await this.deliverNotification(
        storedNotification,
        preferences
      );
      
      // Update delivery status
      await this.updateDeliveryStatus(storedNotification.notification_id, deliveryResults);
      
      return deliveryResults;
      
    } catch (error) {
      logger.error('Failed to send security alert:', error);
      return [{
        success: false,
        channel: 'push',
        error: error.message
      }];
    }
  }

  async createFraudAlert(
    cardId: string,
    eventId: string,
    riskScore: number,
    anomalies: string[]
  ): Promise<DeliveryResult[]> {
    const severity = this.calculateSeverity(riskScore);
    
    const notification: SecurityNotification = {
      cardId,
      type: 'fraud_alert',
      severity,
      title: 'Fraud Alert',
      message: this.generateFraudMessage(riskScore, anomalies),
      actionRequired: severity === 'high' || severity === 'critical',
      actionButtons: [
        {
          actionId: 'confirm_legitimate',
          label: 'This was me',
          actionType: 'report_false_positive',
          style: 'primary'
        },
        {
          actionId: 'freeze_card',
          label: 'Freeze my card',
          actionType: 'unfreeze_card', // Will trigger freeze action
          style: 'danger'
        },
        {
          actionId: 'view_details',
          label: 'View details',
          actionType: 'view_details',
          style: 'secondary'
        }
      ],
      metadata: {
        eventId,
        riskScore,
        anomalies
      }
    };
    
    return this.sendSecurityAlert(notification);
  }

  async createCardFreezeNotification(
    cardId: string,
    freezeId: string,
    reason: string,
    automated: boolean = false
  ): Promise<DeliveryResult[]> {
    const notification: SecurityNotification = {
      cardId,
      type: 'card_frozen',
      severity: 'high',
      title: 'Card Frozen',
      message: automated 
        ? `Your card has been automatically frozen due to ${reason}. You can unfreeze it if this was a mistake.`
        : `Your card has been frozen: ${reason}`,
      actionRequired: true,
      actionButtons: automated ? [
        {
          actionId: 'unfreeze_card',
          label: 'Unfreeze card',
          actionType: 'unfreeze_card',
          style: 'primary',
          requiresAuth: true
        },
        {
          actionId: 'keep_frozen',
          label: 'Keep frozen',
          actionType: 'view_details',
          style: 'secondary'
        }
      ] : [
        {
          actionId: 'view_details',
          label: 'View details',
          actionType: 'view_details',
          style: 'primary'
        }
      ],
      metadata: {
        freezeId,
        reason,
        automated
      }
    };
    
    return this.sendSecurityAlert(notification);
  }

  async createCardUnfreezeNotification(
    cardId: string,
    freezeId: string,
    unfreezeBy: string
  ): Promise<DeliveryResult[]> {
    const notification: SecurityNotification = {
      cardId,
      type: 'card_unfrozen',
      severity: 'medium',
      title: 'Card Unfrozen',
      message: unfreezeBy === 'user' 
        ? 'Your card has been unfrozen and is ready to use.'
        : `Your card has been automatically unfrozen (${unfreezeBy}).`,
      actionRequired: false,
      metadata: {
        freezeId,
        unfreezeBy
      }
    };
    
    return this.sendSecurityAlert(notification);
  }

  async createSecurityIncidentNotification(
    cardId: string,
    incidentId: string,
    incidentType: string,
    severity: 'low' | 'medium' | 'high' | 'critical'
  ): Promise<DeliveryResult[]> {
    const notification: SecurityNotification = {
      cardId,
      type: 'security_incident',
      severity,
      title: 'Security Incident Detected',
      message: this.generateIncidentMessage(incidentType, severity),
      actionRequired: severity === 'high' || severity === 'critical',
      actionButtons: [
        {
          actionId: 'view_incident',
          label: 'View incident',
          actionType: 'view_details',
          style: 'primary'
        },
        {
          actionId: 'contact_support',
          label: 'Contact support',
          actionType: 'contact_support',
          style: 'secondary'
        }
      ],
      metadata: {
        incidentId,
        incidentType
      }
    };
    
    return this.sendSecurityAlert(notification);
  }

  async getNotificationPreferences(cardId: string): Promise<NotificationPreferences> {
    try {
      const isolationContext = await this.isolationService.getCardContext(cardId);
      
      const { data, error } = await supabase
        .from('notification_preferences')
        .select('*')
        .eq('card_context_hash', isolationContext.cardContextHash)
        .single();
      
      if (error || !data) {
        // Return default preferences
        return {
          cardId,
          pushEnabled: true,
          emailEnabled: false,
          smsEnabled: false,
          severityThreshold: 'medium',
          categories: {
            fraudAlerts: true,
            cardActions: true,
            securityIncidents: true,
            systemUpdates: false
          }
        };
      }
      
      return {
        cardId,
        pushEnabled: data.push_enabled ?? true,
        emailEnabled: data.email_enabled ?? false,
        smsEnabled: data.sms_enabled ?? false,
        severityThreshold: data.severity_threshold ?? 'medium',
        quietHours: data.quiet_hours,
        categories: data.categories ?? {
          fraudAlerts: true,
          cardActions: true,
          securityIncidents: true,
          systemUpdates: false
        }
      };
      
    } catch (error) {
      logger.error('Failed to get notification preferences:', error);
      // Return safe defaults
      return {
        cardId,
        pushEnabled: true,
        emailEnabled: false,
        smsEnabled: false,
        severityThreshold: 'medium',
        categories: {
          fraudAlerts: true,
          cardActions: true,
          securityIncidents: true,
          systemUpdates: false
        }
      };
    }
  }

  async updateNotificationPreferences(
    cardId: string,
    preferences: Partial<NotificationPreferences>
  ): Promise<void> {
    try {
      await this.isolationService.enforceTransactionIsolation(cardId);
      const isolationContext = await this.isolationService.getCardContext(cardId);
      
      const { error } = await supabase
        .from('notification_preferences')
        .upsert({
          card_context_hash: isolationContext.cardContextHash,
          push_enabled: preferences.pushEnabled,
          email_enabled: preferences.emailEnabled,
          sms_enabled: preferences.smsEnabled,
          severity_threshold: preferences.severityThreshold,
          quiet_hours: preferences.quietHours,
          categories: preferences.categories
        });
      
      if (error) {
        throw new Error(`Failed to update preferences: ${error.message}`);
      }
      
    } catch (error) {
      logger.error('Failed to update notification preferences:', error);
      throw error;
    }
  }

  async getNotificationHistory(
    cardId: string,
    limit: number = 50
  ): Promise<SecurityNotification[]> {
    try {
      const isolationContext = await this.isolationService.getCardContext(cardId);
      
      const { data, error } = await supabase
        .from('security_notifications')
        .select('*')
        .eq('card_context_hash', isolationContext.cardContextHash)
        .order('created_at', { ascending: false })
        .limit(limit);
      
      if (error) {
        throw error;
      }
      
      return (data || []).map(this.mapDatabaseToNotification);
      
    } catch (error) {
      logger.error('Failed to get notification history:', error);
      return [];
    }
  }

  async markNotificationAsRead(cardId: string, notificationId: string): Promise<void> {
    try {
      await this.isolationService.enforceTransactionIsolation(cardId);
      
      const { error } = await supabase
        .from('security_notifications')
        .update({ read_at: new Date().toISOString() })
        .eq('notification_id', notificationId);
      
      if (error) {
        throw error;
      }
      
    } catch (error) {
      logger.error('Failed to mark notification as read:', error);
      throw error;
    }
  }

  private shouldSendNotification(
    notification: SecurityNotification,
    preferences: NotificationPreferences
  ): boolean {
    // Check severity threshold
    const severityOrder = ['low', 'medium', 'high', 'critical'];
    const notificationSeverityIndex = severityOrder.indexOf(notification.severity);
    const thresholdIndex = severityOrder.indexOf(preferences.severityThreshold);
    
    if (notificationSeverityIndex < thresholdIndex) {
      return false;
    }
    
    // Check category preferences
    const categoryMap = {
      'fraud_alert': preferences.categories.fraudAlerts,
      'card_frozen': preferences.categories.cardActions,
      'card_unfrozen': preferences.categories.cardActions,
      'suspicious_activity': preferences.categories.fraudAlerts,
      'security_incident': preferences.categories.securityIncidents,
      'mfa_required': preferences.categories.fraudAlerts
    };
    
    if (!categoryMap[notification.type]) {
      return false;
    }
    
    // Check quiet hours
    if (preferences.quietHours?.enabled) {
      const now = new Date();
      const currentTime = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
      
      if (this.isInQuietHours(currentTime, preferences.quietHours.startTime, preferences.quietHours.endTime)) {
        // Only send critical notifications during quiet hours
        return notification.severity === 'critical';
      }
    }
    
    return true;
  }

  private async storeNotification(
    notification: SecurityNotification,
    cardContextHash: string
  ): Promise<any> {
    const { data, error } = await supabase
      .from('security_notifications')
      .insert({
        card_context_hash: cardContextHash,
        notification_type: notification.type,
        severity: notification.severity,
        title: notification.title,
        message: notification.message,
        action_required: notification.actionRequired,
        action_buttons: notification.actionButtons,
        metadata: notification.metadata,
        expires_at: notification.expiresAt?.toISOString()
      })
      .select()
      .single();
    
    if (error) {
      throw new Error(`Failed to store notification: ${error.message}`);
    }
    
    return data;
  }

  private async deliverNotification(
    notification: any,
    preferences: NotificationPreferences
  ): Promise<DeliveryResult[]> {
    const results: DeliveryResult[] = [];
    
    // Always deliver via in-app
    results.push({
      success: true,
      channel: 'in_app',
      deliveredAt: new Date(),
      messageId: notification.notification_id
    });
    
    // Deliver via push if enabled
    if (preferences.pushEnabled) {
      const pushResult = await this.sendPushNotification(notification, preferences.cardId);
      results.push(pushResult);
    }
    
    // Deliver via email if enabled (for high/critical severity)
    if (preferences.emailEnabled && ['high', 'critical'].includes(notification.severity)) {
      const emailResult = await this.sendEmailNotification(notification, preferences.cardId);
      results.push(emailResult);
    }
    
    // Deliver via SMS if enabled (for critical severity only)
    if (preferences.smsEnabled && notification.severity === 'critical') {
      const smsResult = await this.sendSMSNotification(notification, preferences.cardId);
      results.push(smsResult);
    }
    
    return results;
  }

  private async sendPushNotification(notification: any, cardId: string): Promise<DeliveryResult> {
    try {
      // In real implementation, integrate with push notification service
      // For now, simulate successful delivery
      logger.info(`Push notification sent for card ${cardId}:`, notification.title);
      
      return {
        success: true,
        channel: 'push',
        deliveredAt: new Date(),
        messageId: `push_${notification.notification_id}`
      };
    } catch (error) {
      return {
        success: false,
        channel: 'push',
        error: error.message
      };
    }
  }

  private async sendEmailNotification(notification: any, cardId: string): Promise<DeliveryResult> {
    try {
      // In real implementation, integrate with email service
      logger.info(`Email notification sent for card ${cardId}:`, notification.title);
      
      return {
        success: true,
        channel: 'email',
        deliveredAt: new Date(),
        messageId: `email_${notification.notification_id}`
      };
    } catch (error) {
      return {
        success: false,
        channel: 'email',
        error: error.message
      };
    }
  }

  private async sendSMSNotification(notification: any, cardId: string): Promise<DeliveryResult> {
    try {
      // In real implementation, integrate with SMS service
      logger.info(`SMS notification sent for card ${cardId}:`, notification.title);
      
      return {
        success: true,
        channel: 'sms',
        deliveredAt: new Date(),
        messageId: `sms_${notification.notification_id}`
      };
    } catch (error) {
      return {
        success: false,
        channel: 'sms',
        error: error.message
      };
    }
  }

  private async updateDeliveryStatus(
    notificationId: string,
    deliveryResults: DeliveryResult[]
  ): Promise<void> {
    const deliveryData = deliveryResults.map(result => ({
      channel: result.channel,
      success: result.success,
      deliveredAt: result.deliveredAt,
      error: result.error,
      messageId: result.messageId
    }));
    
    await supabase
      .from('security_notifications')
      .update({ delivery_results: deliveryData })
      .eq('notification_id', notificationId);
  }

  private calculateSeverity(riskScore: number): 'low' | 'medium' | 'high' | 'critical' {
    if (riskScore >= 90) return 'critical';
    if (riskScore >= 75) return 'high';
    if (riskScore >= 50) return 'medium';
    return 'low';
  }

  private generateFraudMessage(riskScore: number, anomalies: string[]): string {
    const riskLevel = this.calculateSeverity(riskScore);
    const anomalyText = anomalies.length > 0 
      ? ` Detected: ${anomalies.join(', ')}.`
      : '';
    
    return `${riskLevel.charAt(0).toUpperCase() + riskLevel.slice(1)} risk transaction detected (${riskScore}/100).${anomalyText} Was this you?`;
  }

  private generateIncidentMessage(incidentType: string, severity: string): string {
    const typeMessages = {
      fraud_attempt: 'Potential fraud attempt detected',
      account_takeover: 'Suspicious account activity detected',
      suspicious_pattern: 'Unusual transaction patterns detected',
      compliance_violation: 'Compliance issue detected',
      system_breach_attempt: 'Security breach attempt detected'
    };
    
    const baseMessage = typeMessages[incidentType] || 'Security incident detected';
    return `${baseMessage}. Severity: ${severity}. Please review your recent activity.`;
  }

  private isInQuietHours(currentTime: string, startTime: string, endTime: string): boolean {
    // Simple time comparison - in real implementation, handle timezone and date rollover
    return currentTime >= startTime && currentTime <= endTime;
  }

  private mapDatabaseToNotification(data: any): SecurityNotification {
    return {
      notificationId: data.notification_id,
      cardId: data.card_id, // Note: In real implementation, map from context hash
      type: data.notification_type,
      severity: data.severity,
      title: data.title,
      message: data.message,
      actionRequired: data.action_required,
      actionButtons: data.action_buttons,
      metadata: data.metadata,
      expiresAt: data.expires_at ? new Date(data.expires_at) : undefined
    };
  }
}