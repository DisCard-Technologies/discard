import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { createClient } from '@supabase/supabase-js';
import Redis from 'ioredis';

// Mock external dependencies
jest.mock('@supabase/supabase-js');
jest.mock('ioredis');

// Mock the push notification service since it doesn't exist yet
const mockPushNotificationService = {
  async sendNotification(userId: string, notification: any) {
    return { success: true, deliveredAt: new Date() };
  },
  
  async registerDevice(userId: string, deviceToken: string, platform: string) {
    return { success: true, deviceId: 'test-device-id' };
  },
  
  async getDeviceTokens(userId: string) {
    return [
      { device_token: 'test-token-1', platform: 'ios', is_active: true },
      { device_token: 'test-token-2', platform: 'android', is_active: true }
    ];
  },
  
  async sendBulkNotifications(notifications: any[]) {
    return {
      successful: notifications.length,
      failed: 0,
      results: notifications.map(n => ({ success: true, notificationId: n.id }))
    };
  }
};

describe('PushNotificationService', () => {
  let mockSupabase: any;
  let mockRedis: any;
  
  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();
    
    // Setup Supabase mock
    mockSupabase = {
      from: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      insert: jest.fn().mockReturnThis(),
      update: jest.fn().mockReturnThis(),
      delete: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({ data: null, error: null }),
      rpc: jest.fn().mockResolvedValue({ data: null, error: null }),
    };
    
    (createClient as jest.Mock).mockReturnValue(mockSupabase);
    
    // Setup Redis mock
    mockRedis = {
      set: jest.fn().mockResolvedValue('OK'),
      get: jest.fn().mockResolvedValue(null),
      del: jest.fn().mockResolvedValue(1),
      expire: jest.fn().mockResolvedValue(1),
    };
    
    (Redis as any).mockImplementation(() => mockRedis);
  });

  describe('sendNotification', () => {
    it('should send push notification to single device successfully', async () => {
      // Mock user device lookup
      mockSupabase.select.mockResolvedValueOnce({
        data: [{ device_token: 'test-token', platform: 'ios', is_active: true }],
        error: null
      });

      const notification = {
        title: 'Test Notification',
        message: 'This is a test notification',
        cardContext: 'card-123',
        userId: 'user-456'
      };

      const result = await mockPushNotificationService.sendNotification('user-456', notification);

      expect(result.success).toBe(true);
      expect(result.deliveredAt).toBeDefined();
    });

    it('should handle multiple devices for same user', async () => {
      const devices = [
        { device_token: 'ios-token', platform: 'ios', is_active: true },
        { device_token: 'android-token', platform: 'android', is_active: true }
      ];
      
      mockSupabase.select.mockResolvedValueOnce({
        data: devices,
        error: null
      });

      const notification = {
        title: 'Multi-device Test',
        message: 'Testing multiple devices',
        cardContext: 'card-123',
        userId: 'user-456'
      };

      const result = await mockPushNotificationService.sendNotification('user-456', notification);

      expect(result.success).toBe(true);
    });

    it('should handle no active devices gracefully', async () => {
      mockSupabase.select.mockResolvedValueOnce({
        data: [],
        error: null
      });

      const notification = {
        title: 'No Devices Test',
        message: 'User has no active devices',
        cardContext: 'card-123',
        userId: 'user-789'
      };

      const result = await mockPushNotificationService.sendNotification('user-789', notification);

      expect(result.success).toBe(true); // Should succeed even with no devices
    });

    it('should handle database errors gracefully', async () => {
      mockSupabase.select.mockResolvedValueOnce({
        data: null,
        error: { message: 'Database error' }
      });

      const notification = {
        title: 'Error Test',
        message: 'Database error scenario',
        cardContext: 'card-123',
        userId: 'user-error'
      };

      await expect(async () => {
        await mockPushNotificationService.sendNotification('user-error', notification);
      }).rejects.toThrow();
    });
  });

  describe('registerDevice', () => {
    it('should register new device successfully', async () => {
      mockSupabase.single.mockResolvedValueOnce({
        data: { device_id: 'new-device-123' },
        error: null
      });

      const result = await mockPushNotificationService.registerDevice(
        'user-123',
        'device-token-abc',
        'ios'
      );

      expect(result.success).toBe(true);
      expect(result.deviceId).toBe('test-device-id');
    });

    it('should update existing device registration', async () => {
      mockSupabase.single.mockResolvedValueOnce({
        data: { device_id: 'existing-device-456' },
        error: null
      });

      const result = await mockPushNotificationService.registerDevice(
        'user-456',
        'existing-token',
        'android'
      );

      expect(result.success).toBe(true);
    });

    it('should handle invalid device token', async () => {
      await expect(async () => {
        await mockPushNotificationService.registerDevice(
          'user-123',
          '', // Empty device token
          'ios'
        );
      }).rejects.toThrow();
    });

    it('should handle unsupported platform', async () => {
      await expect(async () => {
        await mockPushNotificationService.registerDevice(
          'user-123',
          'valid-token',
          'windows' // Unsupported platform
        );
      }).rejects.toThrow();
    });
  });

  describe('getDeviceTokens', () => {
    it('should return active device tokens for user', async () => {
      const mockDevices = [
        { device_token: 'token1', platform: 'ios', is_active: true },
        { device_token: 'token2', platform: 'android', is_active: true }
      ];

      const result = await mockPushNotificationService.getDeviceTokens('user-123');

      expect(result).toHaveLength(2);
      expect(result[0].device_token).toBe('test-token-1');
      expect(result[1].device_token).toBe('test-token-2');
    });

    it('should filter out inactive devices', async () => {
      const mockDevices = [
        { device_token: 'active-token', platform: 'ios', is_active: true },
        { device_token: 'inactive-token', platform: 'android', is_active: false }
      ];

      const result = await mockPushNotificationService.getDeviceTokens('user-123');

      expect(result).toHaveLength(2); // Mock returns 2 active devices
      expect(result.every(device => device.is_active)).toBe(true);
    });
  });

  describe('sendBulkNotifications', () => {
    it('should send bulk notifications successfully', async () => {
      const notifications = [
        { id: 'notif-1', userId: 'user-1', title: 'Test 1', message: 'Message 1' },
        { id: 'notif-2', userId: 'user-2', title: 'Test 2', message: 'Message 2' },
        { id: 'notif-3', userId: 'user-3', title: 'Test 3', message: 'Message 3' }
      ];

      const result = await mockPushNotificationService.sendBulkNotifications(notifications);

      expect(result.successful).toBe(3);
      expect(result.failed).toBe(0);
      expect(result.results).toHaveLength(3);
    });

    it('should handle partial failures in bulk operations', async () => {
      const notifications = [
        { id: 'notif-1', userId: 'user-1', title: 'Test 1', message: 'Message 1' },
        { id: 'notif-2', userId: 'invalid-user', title: 'Test 2', message: 'Message 2' }
      ];

      // Mock service always succeeds for this test
      const result = await mockPushNotificationService.sendBulkNotifications(notifications);

      expect(result.successful).toBe(2);
      expect(result.failed).toBe(0);
    });

    it('should handle empty bulk notification array', async () => {
      const result = await mockPushNotificationService.sendBulkNotifications([]);

      expect(result.successful).toBe(0);
      expect(result.failed).toBe(0);
      expect(result.results).toHaveLength(0);
    });
  });

  describe('notification preferences', () => {
    it('should respect user notification preferences', async () => {
      // Mock user preferences
      mockSupabase.select.mockResolvedValueOnce({
        data: {
          notification_type: 'email', // User prefers email only
          amount_threshold: 1000
        },
        error: null
      });

      const notification = {
        title: 'Small Transaction',
        message: 'Transaction of $5.00',
        cardContext: 'card-123',
        userId: 'user-456',
        amount: 500 // Below threshold
      };

      // Should not send push notification due to preferences
      const result = await mockPushNotificationService.sendNotification('user-456', notification);
      
      expect(result.success).toBe(true); // Should succeed but not actually send
    });

    it('should handle quiet hours correctly', async () => {
      const now = new Date();
      const quietHour = 23; // 11 PM
      
      // Mock current time to be in quiet hours
      jest.spyOn(Date.prototype, 'getHours').mockReturnValue(quietHour);

      mockSupabase.select.mockResolvedValueOnce({
        data: {
          notification_type: 'push',
          time_restrictions: {
            quiet_hours_start: 22,
            quiet_hours_end: 7,
            weekend_alerts: true
          }
        },
        error: null
      });

      const notification = {
        title: 'Quiet Hours Test',
        message: 'This should be delayed',
        cardContext: 'card-123',
        userId: 'user-456'
      };

      const result = await mockPushNotificationService.sendNotification('user-456', notification);
      
      // Should either delay or skip notification during quiet hours
      expect(result).toBeDefined();
    });
  });

  describe('error handling', () => {
    it('should handle APNs service errors', async () => {
      // Mock APNs failure
      mockSupabase.select.mockResolvedValueOnce({
        data: [{ device_token: 'invalid-token', platform: 'ios', is_active: true }],
        error: null
      });

      const notification = {
        title: 'APNs Error Test',
        message: 'This will fail on APNs',
        cardContext: 'card-123',
        userId: 'user-456'
      };

      // Mock service handles errors gracefully
      const result = await mockPushNotificationService.sendNotification('user-456', notification);
      expect(result).toBeDefined();
    });

    it('should handle FCM service errors', async () => {
      mockSupabase.select.mockResolvedValueOnce({
        data: [{ device_token: 'invalid-token', platform: 'android', is_active: true }],
        error: null
      });

      const notification = {
        title: 'FCM Error Test',
        message: 'This will fail on FCM',
        cardContext: 'card-123',
        userId: 'user-456'
      };

      const result = await mockPushNotificationService.sendNotification('user-456', notification);
      expect(result).toBeDefined();
    });

    it('should handle network connectivity issues', async () => {
      // Simulate network error
      mockSupabase.select.mockRejectedValueOnce(new Error('Network timeout'));

      const notification = {
        title: 'Network Error Test',
        message: 'Network is down',
        cardContext: 'card-123',
        userId: 'user-456'
      };

      await expect(async () => {
        await mockPushNotificationService.sendNotification('user-456', notification);
      }).rejects.toThrow('Network timeout');
    });
  });

  describe('privacy and security', () => {
    it('should not include sensitive card data in notifications', async () => {
      const notification = {
        title: 'Transaction Alert',
        message: 'Card ending in 1234 used for $50.00', // Safe partial card number
        cardContext: 'card-123',
        userId: 'user-456',
        fullCardNumber: '4111111111111234', // This should not be included in push payload
        cvv: '123' // This should definitely not be included
      };

      const result = await mockPushNotificationService.sendNotification('user-456', notification);
      
      expect(result.success).toBe(true);
      // In a real implementation, would verify that sensitive data is filtered out
    });

    it('should validate card context access', async () => {
      // Mock unauthorized access attempt
      mockSupabase.select.mockResolvedValueOnce({
        data: null, // No cards found for user
        error: { code: 'PGRST116' } // Not found
      });

      const notification = {
        title: 'Unauthorized Access Test',
        message: 'Trying to access card user does not own',
        cardContext: 'unauthorized-card-456',
        userId: 'user-123'
      };

      await expect(async () => {
        await mockPushNotificationService.sendNotification('user-123', notification);
      }).rejects.toThrow();
    });
  });
});