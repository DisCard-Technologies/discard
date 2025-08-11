import { SecurityNotificationService, SecurityNotification, NotificationPreferences } from '../security-notifications.service';
import { TransactionIsolationService } from '../../privacy/transaction-isolation.service';

// Mock dependencies
jest.mock('../../privacy/transaction-isolation.service');
jest.mock('../../../utils/supabase', () => ({
  supabase: {
    from: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    insert: jest.fn().mockReturnThis(),
    update: jest.fn().mockReturnThis(),
    upsert: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    order: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    single: jest.fn().mockResolvedValue({ data: null, error: null })
  }
}));

jest.mock('../../../utils/logger', () => ({
  logger: {
    error: jest.fn(),
    warn: jest.fn(),
    info: jest.fn()
  }
}));

describe('SecurityNotificationService', () => {
  let service: SecurityNotificationService;
  let mockIsolationService: jest.Mocked<TransactionIsolationService>;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new SecurityNotificationService();
    mockIsolationService = (TransactionIsolationService as jest.MockedClass<typeof TransactionIsolationService>).mock.instances[0] as any;
    
    // Set up default mock implementations
    mockIsolationService.enforceTransactionIsolation.mockResolvedValue(undefined);
    mockIsolationService.getCardContext.mockResolvedValue({
      contextId: 'test-context',
      cardContextHash: 'test-hash',
      sessionBoundary: 'test-boundary',
      correlationResistance: {
        ipObfuscation: true,
        timingRandomization: true,
        behaviorMasking: true
      }
    });
  });

  describe('sendSecurityAlert', () => {
    const baseNotification: SecurityNotification = {
      cardId: 'card-123',
      type: 'fraud_alert',
      severity: 'high',
      title: 'Fraud Alert',
      message: 'Suspicious activity detected',
      actionRequired: true
    };

    it('should send security alert successfully', async () => {
      const { supabase } = require('../../../utils/supabase');
      const { logger } = require('../../../utils/logger');
      
      // Mock get preferences (default preferences)
      supabase.from().select().eq().single.mockResolvedValueOnce({
        data: null,
        error: null
      });
      
      // Mock store notification
      supabase.from().insert().select().single.mockResolvedValueOnce({
        data: { 
          notification_id: 'notif-123',
          title: baseNotification.title,
          severity: baseNotification.severity
        },
        error: null
      });
      
      // Mock update delivery status
      supabase.from().update().eq.mockResolvedValueOnce({
        data: null,
        error: null
      });
      
      const results = await service.sendSecurityAlert(baseNotification);
      
      expect(results).toHaveLength(2); // in-app + push
      expect(results[0].success).toBe(true);
      expect(results[0].channel).toBe('in_app');
      expect(results[1].success).toBe(true);
      expect(results[1].channel).toBe('push');
      
      expect(mockIsolationService.enforceTransactionIsolation).toHaveBeenCalledWith('card-123');
      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining('Push notification sent for card card-123'),
        'Fraud Alert'
      );
    });

    it('should filter notifications based on user preferences', async () => {
      const { supabase } = require('../../../utils/supabase');
      
      // Mock preferences with fraud alerts disabled
      supabase.from().select().eq().single.mockResolvedValueOnce({
        data: {
          push_enabled: true,
          categories: {
            fraudAlerts: false, // Disabled
            cardActions: true,
            securityIncidents: true,
            systemUpdates: false
          }
        },
        error: null
      });
      
      const results = await service.sendSecurityAlert(baseNotification);
      
      expect(results).toHaveLength(0); // Filtered out
    });

    it('should filter notifications based on severity threshold', async () => {
      const { supabase } = require('../../../utils/supabase');
      
      // Mock preferences with high severity threshold
      supabase.from().select().eq().single.mockResolvedValueOnce({
        data: {
          severity_threshold: 'critical', // Only critical notifications
          categories: { fraudAlerts: true }
        },
        error: null
      });
      
      const mediumNotification = { ...baseNotification, severity: 'medium' as const };
      const results = await service.sendSecurityAlert(mediumNotification);
      
      expect(results).toHaveLength(0); // Filtered out due to severity
    });

    it('should respect quiet hours for non-critical notifications', async () => {
      const { supabase } = require('../../../utils/supabase');
      
      // Mock preferences with quiet hours enabled
      supabase.from().select().eq().single.mockResolvedValueOnce({
        data: {
          quiet_hours: {
            enabled: true,
            startTime: '22:00',
            endTime: '08:00'
          },
          categories: { fraudAlerts: true }
        },
        error: null
      });
      
      // Mock current time to be in quiet hours (3 AM)
      const originalDate = Date;
      const mockDate = jest.fn(() => ({
        getHours: () => 3,
        getMinutes: () => 0
      })) as any;
      global.Date = mockDate;
      
      const results = await service.sendSecurityAlert(baseNotification);
      
      expect(results).toHaveLength(0); // Filtered out due to quiet hours
      
      global.Date = originalDate;
    });

    it('should send critical notifications during quiet hours', async () => {
      const { supabase } = require('../../../utils/supabase');
      
      // Mock preferences with quiet hours
      supabase.from().select().eq().single.mockResolvedValueOnce({
        data: {
          quiet_hours: {
            enabled: true,
            startTime: '22:00',
            endTime: '08:00'
          },
          categories: { fraudAlerts: true }
        },
        error: null
      });
      
      // Mock store notification
      supabase.from().insert().select().single.mockResolvedValueOnce({
        data: { notification_id: 'notif-critical' },
        error: null
      });
      
      supabase.from().update().eq.mockResolvedValueOnce({
        data: null,
        error: null
      });
      
      const criticalNotification = { ...baseNotification, severity: 'critical' as const };
      const results = await service.sendSecurityAlert(criticalNotification);
      
      expect(results.length).toBeGreaterThan(0); // Critical notifications bypass quiet hours
    });
  });

  describe('createFraudAlert', () => {
    it('should create fraud alert with appropriate severity', async () => {
      const { supabase } = require('../../../utils/supabase');
      
      // Mock successful flow
      supabase.from().select().eq().single.mockResolvedValueOnce({ data: null, error: null });
      supabase.from().insert().select().single.mockResolvedValueOnce({
        data: { notification_id: 'fraud-alert-123' },
        error: null
      });
      supabase.from().update().eq.mockResolvedValueOnce({ data: null, error: null });
      
      const results = await service.createFraudAlert(
        'card-123',
        'event-456',
        85,
        ['velocity', 'amount']
      );
      
      expect(results).toBeDefined();
      expect(mockIsolationService.enforceTransactionIsolation).toHaveBeenCalledWith('card-123');
    });

    it('should generate appropriate message for fraud alert', async () => {
      const { supabase } = require('../../../utils/supabase');
      
      supabase.from().select().eq().single.mockResolvedValueOnce({ data: null, error: null });
      supabase.from().insert().select().single.mockImplementationOnce(({ insert }) => {
        const insertData = insert[0];
        expect(insertData.message).toContain('High risk transaction detected');
        expect(insertData.message).toContain('85/100');
        expect(insertData.message).toContain('velocity, amount');
        
        return Promise.resolve({ data: { notification_id: 'test' }, error: null });
      });
      supabase.from().update().eq.mockResolvedValueOnce({ data: null, error: null });
      
      await service.createFraudAlert('card-123', 'event-456', 85, ['velocity', 'amount']);
    });

    it('should include appropriate action buttons', async () => {
      const { supabase } = require('../../../utils/supabase');
      
      supabase.from().select().eq().single.mockResolvedValueOnce({ data: null, error: null });
      supabase.from().insert().select().single.mockImplementationOnce(({ insert }) => {
        const insertData = insert[0];
        const actionButtons = insertData.action_buttons;
        
        expect(actionButtons).toHaveLength(3);
        expect(actionButtons.find(btn => btn.actionId === 'confirm_legitimate')).toBeDefined();
        expect(actionButtons.find(btn => btn.actionId === 'freeze_card')).toBeDefined();
        expect(actionButtons.find(btn => btn.actionId === 'view_details')).toBeDefined();
        
        return Promise.resolve({ data: { notification_id: 'test' }, error: null });
      });
      supabase.from().update().eq.mockResolvedValueOnce({ data: null, error: null });
      
      await service.createFraudAlert('card-123', 'event-456', 85, ['velocity']);
    });
  });

  describe('createCardFreezeNotification', () => {
    it('should create automated freeze notification with unfreeze option', async () => {
      const { supabase } = require('../../../utils/supabase');
      
      supabase.from().select().eq().single.mockResolvedValueOnce({ data: null, error: null });
      supabase.from().insert().select().single.mockImplementationOnce(({ insert }) => {
        const insertData = insert[0];
        expect(insertData.title).toBe('Card Frozen');
        expect(insertData.message).toContain('automatically frozen');
        expect(insertData.action_buttons).toHaveLength(2);
        expect(insertData.action_buttons.find(btn => btn.actionId === 'unfreeze_card')).toBeDefined();
        
        return Promise.resolve({ data: { notification_id: 'freeze-notif' }, error: null });
      });
      supabase.from().update().eq.mockResolvedValueOnce({ data: null, error: null });
      
      const results = await service.createCardFreezeNotification(
        'card-123',
        'freeze-456',
        'fraud detected',
        true // automated
      );
      
      expect(results).toBeDefined();
    });

    it('should create manual freeze notification without unfreeze option', async () => {
      const { supabase } = require('../../../utils/supabase');
      
      supabase.from().select().eq().single.mockResolvedValueOnce({ data: null, error: null });
      supabase.from().insert().select().single.mockImplementationOnce(({ insert }) => {
        const insertData = insert[0];
        expect(insertData.message).not.toContain('automatically');
        expect(insertData.action_buttons).toHaveLength(1);
        expect(insertData.action_buttons[0].actionId).toBe('view_details');
        
        return Promise.resolve({ data: { notification_id: 'freeze-notif' }, error: null });
      });
      supabase.from().update().eq.mockResolvedValueOnce({ data: null, error: null });
      
      await service.createCardFreezeNotification(
        'card-123',
        'freeze-456',
        'user requested',
        false // manual
      );
    });
  });

  describe('getNotificationPreferences', () => {
    it('should return stored preferences', async () => {
      const { supabase } = require('../../../utils/supabase');
      
      const storedPrefs = {
        push_enabled: false,
        email_enabled: true,
        severity_threshold: 'critical',
        categories: {
          fraudAlerts: false,
          cardActions: true,
          securityIncidents: true,
          systemUpdates: false
        }
      };
      
      supabase.from().select().eq().single.mockResolvedValueOnce({
        data: storedPrefs,
        error: null
      });
      
      const preferences = await service.getNotificationPreferences('card-123');
      
      expect(preferences.pushEnabled).toBe(false);
      expect(preferences.emailEnabled).toBe(true);
      expect(preferences.severityThreshold).toBe('critical');
      expect(preferences.categories.fraudAlerts).toBe(false);
    });

    it('should return default preferences when none stored', async () => {
      const { supabase } = require('../../../utils/supabase');
      
      supabase.from().select().eq().single.mockResolvedValueOnce({
        data: null,
        error: null
      });
      
      const preferences = await service.getNotificationPreferences('card-123');
      
      expect(preferences.pushEnabled).toBe(true);
      expect(preferences.emailEnabled).toBe(false);
      expect(preferences.severityThreshold).toBe('medium');
      expect(preferences.categories.fraudAlerts).toBe(true);
    });

    it('should handle database errors gracefully', async () => {
      const { supabase } = require('../../../utils/supabase');
      
      supabase.from().select().eq().single.mockResolvedValueOnce({
        data: null,
        error: new Error('Database error')
      });
      
      const preferences = await service.getNotificationPreferences('card-123');
      
      // Should return safe defaults
      expect(preferences.pushEnabled).toBe(true);
      expect(preferences.severityThreshold).toBe('medium');
    });
  });

  describe('updateNotificationPreferences', () => {
    it('should update preferences successfully', async () => {
      const { supabase } = require('../../../utils/supabase');
      
      supabase.from().upsert.mockResolvedValueOnce({
        data: null,
        error: null
      });
      
      const newPrefs = {
        pushEnabled: false,
        emailEnabled: true,
        severityThreshold: 'high' as const,
        categories: {
          fraudAlerts: true,
          cardActions: false,
          securityIncidents: true,
          systemUpdates: true
        }
      };
      
      await service.updateNotificationPreferences('card-123', newPrefs);
      
      expect(mockIsolationService.enforceTransactionIsolation).toHaveBeenCalledWith('card-123');
      expect(supabase.from).toHaveBeenCalledWith('notification_preferences');
    });

    it('should handle update errors', async () => {
      const { supabase } = require('../../../utils/supabase');
      
      supabase.from().upsert.mockResolvedValueOnce({
        data: null,
        error: new Error('Update failed')
      });
      
      await expect(service.updateNotificationPreferences('card-123', {
        pushEnabled: false
      })).rejects.toThrow('Failed to update preferences');
    });
  });

  describe('getNotificationHistory', () => {
    it('should retrieve notification history', async () => {
      const { supabase } = require('../../../utils/supabase');
      
      const mockHistory = [
        {
          notification_id: 'notif-1',
          notification_type: 'fraud_alert',
          severity: 'high',
          title: 'Fraud Alert',
          message: 'Suspicious activity',
          action_required: true
        },
        {
          notification_id: 'notif-2',
          notification_type: 'card_frozen',
          severity: 'high',
          title: 'Card Frozen',
          message: 'Card has been frozen',
          action_required: true
        }
      ];
      
      supabase.from().select().eq().order().limit.mockResolvedValueOnce({
        data: mockHistory,
        error: null
      });
      
      const history = await service.getNotificationHistory('card-123', 10);
      
      expect(history).toHaveLength(2);
      expect(history[0].type).toBe('fraud_alert');
      expect(history[1].type).toBe('card_frozen');
      expect(mockIsolationService.getCardContext).toHaveBeenCalledWith('card-123');
    });

    it('should handle empty history', async () => {
      const { supabase } = require('../../../utils/supabase');
      
      supabase.from().select().eq().order().limit.mockResolvedValueOnce({
        data: null,
        error: null
      });
      
      const history = await service.getNotificationHistory('card-123');
      
      expect(history).toEqual([]);
    });
  });

  describe('markNotificationAsRead', () => {
    it('should mark notification as read', async () => {
      const { supabase } = require('../../../utils/supabase');
      
      supabase.from().update().eq.mockResolvedValueOnce({
        data: null,
        error: null
      });
      
      await service.markNotificationAsRead('card-123', 'notif-456');
      
      expect(mockIsolationService.enforceTransactionIsolation).toHaveBeenCalledWith('card-123');
      expect(supabase.from().update).toHaveBeenCalledWith({
        read_at: expect.any(String)
      });
    });
  });

  describe('severity calculation', () => {
    it('should calculate severity correctly for different risk scores', () => {
      // Test through createFraudAlert which uses calculateSeverity internally
      const { supabase } = require('../../../utils/supabase');
      
      supabase.from().select().eq().single.mockResolvedValue({ data: null, error: null });
      supabase.from().update().eq.mockResolvedValue({ data: null, error: null });
      
      // Test different risk scores
      const testCases = [
        { riskScore: 95, expectedSeverity: 'critical' },
        { riskScore: 85, expectedSeverity: 'high' },
        { riskScore: 60, expectedSeverity: 'medium' },
        { riskScore: 30, expectedSeverity: 'low' }
      ];
      
      testCases.forEach(({ riskScore, expectedSeverity }) => {
        supabase.from().insert().select().single.mockImplementationOnce(({ insert }) => {
          expect(insert[0].severity).toBe(expectedSeverity);
          return Promise.resolve({ data: { notification_id: 'test' }, error: null });
        });
      });
      
      // Execute all test cases
      return Promise.all(testCases.map(({ riskScore }) =>
        service.createFraudAlert('card-123', 'event-456', riskScore, [])
      ));
    });
  });
});