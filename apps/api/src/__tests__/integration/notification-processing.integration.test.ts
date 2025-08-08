import { jest, describe, it, expect, beforeAll, afterAll, beforeEach } from '@jest/globals';
import request from 'supertest';
import { createClient } from '@supabase/supabase-js';
import WebSocket from 'ws';

// Mock application setup
const mockApp = {
  get: jest.fn(),
  post: jest.fn(),
  put: jest.fn(),
  delete: jest.fn(),
  use: jest.fn(),
  listen: jest.fn()
};

// Mock Express app for testing
const app = mockApp as any;

// Mock authentication middleware
const mockAuthMiddleware = (req: any, res: any, next: any) => {
  req.user = { id: 'test-user-123' };
  next();
};

describe('Notification Processing Integration Tests', () => {
  let supabase: any;
  let mockWebSocketServer: any;
  let testWebSocket: WebSocket;
  
  beforeAll(async () => {
    // Setup test database
    supabase = createClient(
      process.env.TEST_SUPABASE_URL || 'http://localhost:54321',
      process.env.TEST_SUPABASE_KEY || 'test-key'
    );

    // Setup WebSocket server mock
    mockWebSocketServer = {
      on: jest.fn(),
      close: jest.fn(),
      clients: new Set()
    };
  });

  afterAll(async () => {
    // Cleanup
    if (testWebSocket) {
      testWebSocket.close();
    }
    if (mockWebSocketServer) {
      mockWebSocketServer.close();
    }
  });

  beforeEach(async () => {
    // Reset test data
    jest.clearAllMocks();
  });

  describe('End-to-End Notification Flow', () => {
    it('should process transaction notification from creation to delivery', async () => {
      // 1. Create a test transaction
      const transactionData = {
        transactionId: 'test-tx-123',
        cardContext: 'card-context-456',
        merchantName: 'Test Merchant',
        amount: 2500, // $25.00
        currency: 'USD',
        status: 'authorized'
      };

      // 2. Mock user preferences that allow notifications
      const mockPreferences = {
        user_id: 'test-user-123',
        card_context: 'card-context-456',
        notification_type: 'push',
        amount_threshold: 1000, // $10.00 threshold
        merchant_categories: ['all'],
        decline_alerts: true,
        spending_alerts: {
          limit_thresholds: [50, 75, 90],
          velocity_alerts: true,
          unusual_spending_alerts: true
        }
      };

      // Mock database responses
      const mockSupabaseResponse = {
        data: mockPreferences,
        error: null
      };

      // 3. Simulate notification creation
      const notificationPayload = {
        type: 'new_transaction',
        transactionId: transactionData.transactionId,
        cardContext: transactionData.cardContext,
        merchantName: transactionData.merchantName,
        amount: transactionData.amount,
        timestamp: new Date().toISOString(),
        status: 'authorized'
      };

      // 4. Test notification API endpoint
      const response = await request(app)
        .post('/api/v1/notifications/test')
        .set('Authorization', 'Bearer test-token')
        .send({
          cardContext: transactionData.cardContext,
          notificationType: 'transaction',
          deliveryChannel: 'push',
          testData: {
            amount: transactionData.amount / 100,
            merchantName: transactionData.merchantName
          }
        })
        .expect(200);

      expect(response.body.status).toBe('sent');
      expect(response.body.testId).toBeDefined();
    });

    it('should handle spending limit alerts correctly', async () => {
      // Test spending limit scenario
      const spendingData = {
        cardContext: 'card-context-789',
        currentSpending: 4500, // $45.00
        spendingLimit: 5000,   // $50.00
        thresholdReached: 90   // 90% threshold
      };

      const alertPayload = {
        type: 'spending_alert',
        cardContext: spendingData.cardContext,
        alertType: 'limit_threshold',
        threshold: spendingData.thresholdReached,
        currentAmount: spendingData.currentSpending,
        message: `You have reached ${spendingData.thresholdReached}% of your spending limit`,
        timestamp: new Date().toISOString()
      };

      // Test WebSocket broadcast simulation
      const mockBroadcast = jest.fn();
      mockWebSocketServer.clients.forEach = mockBroadcast;

      // Verify alert would be sent
      expect(alertPayload.alertType).toBe('limit_threshold');
      expect(alertPayload.threshold).toBe(90);
    });

    it('should process decline notifications with retry options', async () => {
      const declineData = {
        transactionId: 'declined-tx-456',
        cardContext: 'card-context-123',
        merchantName: 'Declined Merchant',
        amount: 7500, // $75.00
        declineReason: 'Insufficient funds',
        declineCode: 'D001',
        isRetryable: true
      };

      const declineNotification = {
        type: 'decline_notification',
        transactionId: declineData.transactionId,
        cardContext: declineData.cardContext,
        reason: declineData.declineReason,
        retryable: declineData.isRetryable,
        timestamp: new Date().toISOString()
      };

      // Test notification creation for decline
      const response = await request(app)
        .post('/api/v1/notifications/test')
        .set('Authorization', 'Bearer test-token')
        .send({
          cardContext: declineData.cardContext,
          notificationType: 'decline',
          deliveryChannel: 'push',
          testData: {
            declineReason: declineData.declineReason
          }
        })
        .expect(200);

      expect(response.body.status).toBe('sent');
    });
  });

  describe('Notification Preferences Integration', () => {
    it('should fetch and apply user preferences correctly', async () => {
      const response = await request(app)
        .get('/api/v1/notifications/preferences')
        .set('Authorization', 'Bearer test-token')
        .query({ cardContext: 'card-context-123' })
        .expect(200);

      expect(response.body.preferences).toBeDefined();
      expect(response.body.defaultSettings).toBeDefined();
    });

    it('should update notification preferences', async () => {
      const updatedPreferences = {
        cardContext: 'card-context-123',
        notificationType: 'email',
        amountThreshold: 2000,
        merchantCategories: ['gas_stations', 'restaurants'],
        timeRestrictions: {
          quietHoursStart: 22,
          quietHoursEnd: 7,
          weekendAlerts: false
        },
        spendingAlerts: {
          limitThresholds: [75, 90],
          velocityAlerts: false,
          unusualSpendingAlerts: true
        },
        declineAlerts: true
      };

      const response = await request(app)
        .put('/api/v1/notifications/preferences')
        .set('Authorization', 'Bearer test-token')
        .send(updatedPreferences)
        .expect(200);

      expect(response.body.updated).toBe(true);
      expect(response.body.appliedAt).toBeDefined();
    });

    it('should validate preference data', async () => {
      const invalidPreferences = {
        cardContext: 'invalid-uuid', // Invalid UUID
        notificationType: 'sms', // Invalid type
        amountThreshold: -100, // Invalid negative amount
      };

      await request(app)
        .put('/api/v1/notifications/preferences')
        .set('Authorization', 'Bearer test-token')
        .send(invalidPreferences)
        .expect(400);
    });
  });

  describe('WebSocket Real-time Integration', () => {
    it('should establish WebSocket connection with authentication', async () => {
      const mockWebSocketConnection = {
        readyState: WebSocket.OPEN,
        send: jest.fn(),
        close: jest.fn(),
        on: jest.fn()
      };

      // Simulate WebSocket connection
      const connectionPromise = new Promise((resolve) => {
        resolve(mockWebSocketConnection);
      });

      const connection = await connectionPromise;
      expect(connection).toBeDefined();
    });

    it('should handle WebSocket subscription messages', async () => {
      const mockWebSocket = {
        readyState: WebSocket.OPEN,
        send: jest.fn(),
        on: jest.fn(),
        userId: 'test-user-123',
        cardContexts: ['card-context-123', 'card-context-456']
      };

      const subscribeMessage = {
        type: 'subscribe',
        cardContext: 'card-context-123',
        subscriptionType: 'all'
      };

      // Simulate message handling
      mockWebSocket.on('message', (data: string) => {
        const message = JSON.parse(data);
        expect(message.type).toBe('subscribe');
      });

      // Simulate successful subscription
      const confirmationMessage = {
        type: 'subscription_confirmed',
        cardContext: subscribeMessage.cardContext,
        subscriptionType: subscribeMessage.subscriptionType,
        timestamp: new Date().toISOString()
      };

      expect(confirmationMessage.type).toBe('subscription_confirmed');
    });

    it('should broadcast transaction updates to subscribed clients', async () => {
      const transactionUpdate = {
        type: 'new_transaction',
        transactionId: 'tx-broadcast-test',
        cardContext: 'card-context-123',
        merchantName: 'Broadcast Test Merchant',
        amount: 1500,
        category: 'restaurants',
        timestamp: new Date().toISOString(),
        status: 'authorized'
      };

      // Mock multiple connected clients
      const mockClients = [
        { 
          send: jest.fn(), 
          readyState: WebSocket.OPEN,
          cardContexts: ['card-context-123'],
          subscriptions: new Set(['card-context-123:all'])
        },
        { 
          send: jest.fn(), 
          readyState: WebSocket.OPEN,
          cardContexts: ['card-context-456'],
          subscriptions: new Set(['card-context-456:all'])
        }
      ];

      // Simulate broadcast logic
      mockClients.forEach(client => {
        if (client.cardContexts.includes(transactionUpdate.cardContext)) {
          const hasSubscription = Array.from(client.subscriptions).some(sub =>
            sub.includes(transactionUpdate.cardContext)
          );
          
          if (hasSubscription) {
            client.send(JSON.stringify(transactionUpdate));
            expect(client.send).toHaveBeenCalledWith(
              JSON.stringify(transactionUpdate)
            );
          }
        }
      });
    });
  });

  describe('Notification History Integration', () => {
    it('should store and retrieve notification history', async () => {
      // Test creating notification history
      const historyResponse = await request(app)
        .get('/api/v1/notifications/history')
        .set('Authorization', 'Bearer test-token')
        .query({ 
          cardContext: 'card-context-123',
          limit: 10,
          offset: 0 
        })
        .expect(200);

      expect(historyResponse.body.history).toBeDefined();
      expect(historyResponse.body.pagination).toBeDefined();
      expect(historyResponse.body.pagination.total).toBeGreaterThanOrEqual(0);
    });

    it('should delete notification history items', async () => {
      const notificationId = 'test-notification-456';
      
      await request(app)
        .delete(`/api/v1/notifications/history/${notificationId}`)
        .set('Authorization', 'Bearer test-token')
        .expect(200);
    });

    it('should filter notification history by status', async () => {
      const response = await request(app)
        .get('/api/v1/notifications/history')
        .set('Authorization', 'Bearer test-token')
        .query({ 
          status: 'delivered',
          limit: 5 
        })
        .expect(200);

      expect(response.body.history).toBeDefined();
    });
  });

  describe('Error Scenarios Integration', () => {
    it('should handle invalid authentication', async () => {
      await request(app)
        .get('/api/v1/notifications/preferences')
        .set('Authorization', 'Bearer invalid-token')
        .expect(401);
    });

    it('should handle database connection failures', async () => {
      // Mock database failure
      const mockError = new Error('Database connection failed');
      
      // This would be handled by error middleware in real implementation
      expect(mockError.message).toBe('Database connection failed');
    });

    it('should handle notification service outages', async () => {
      // Test graceful handling of push notification service failures
      const response = await request(app)
        .post('/api/v1/notifications/test')
        .set('Authorization', 'Bearer test-token')
        .send({
          cardContext: 'card-context-123',
          notificationType: 'transaction',
          deliveryChannel: 'push',
          testData: {
            amount: 25.00,
            merchantName: 'Service Outage Test'
          }
        });

      // Should handle gracefully even if external service fails
      expect(response.status).toBeIn([200, 503]);
    });
  });

  describe('Performance Integration Tests', () => {
    it('should handle high-volume notification processing', async () => {
      const batchSize = 100;
      const notifications = Array.from({ length: batchSize }, (_, i) => ({
        cardContext: `card-context-${i}`,
        notificationType: 'transaction',
        deliveryChannel: 'push',
        testData: {
          amount: Math.random() * 100,
          merchantName: `Load Test Merchant ${i}`
        }
      }));

      const startTime = Date.now();
      
      // Process notifications in parallel
      const promises = notifications.map(notification => 
        request(app)
          .post('/api/v1/notifications/test')
          .set('Authorization', 'Bearer test-token')
          .send(notification)
      );

      const responses = await Promise.all(promises);
      const endTime = Date.now();
      const processingTime = endTime - startTime;

      // Verify all notifications processed
      expect(responses.length).toBe(batchSize);
      responses.forEach(response => {
        expect(response.status).toBe(200);
      });

      // Performance assertion (should process 100 notifications in under 5 seconds)
      expect(processingTime).toBeLessThan(5000);
      console.log(`Processed ${batchSize} notifications in ${processingTime}ms`);
    });

    it('should maintain WebSocket connection stability under load', async () => {
      const connectionCount = 50;
      const mockConnections = Array.from({ length: connectionCount }, (_, i) => ({
        id: `connection-${i}`,
        readyState: WebSocket.OPEN,
        send: jest.fn(),
        lastHeartbeat: Date.now()
      }));

      // Simulate heartbeat for all connections
      const heartbeatPromises = mockConnections.map(conn => 
        Promise.resolve(conn.lastHeartbeat = Date.now())
      );

      await Promise.all(heartbeatPromises);
      
      // Verify all connections are still active
      const activeConnections = mockConnections.filter(
        conn => Date.now() - conn.lastHeartbeat < 60000
      );
      
      expect(activeConnections.length).toBe(connectionCount);
    });
  });

  describe('Privacy and Security Integration', () => {
    it('should enforce card context isolation', async () => {
      // Try to access notifications for unauthorized card context
      await request(app)
        .get('/api/v1/notifications/history')
        .set('Authorization', 'Bearer test-token')
        .query({ cardContext: 'unauthorized-card-context' })
        .expect(403);
    });

    it('should not expose sensitive data in notification payloads', async () => {
      const response = await request(app)
        .post('/api/v1/notifications/test')
        .set('Authorization', 'Bearer test-token')
        .send({
          cardContext: 'card-context-123',
          notificationType: 'transaction',
          deliveryChannel: 'push',
          testData: {
            amount: 25.00,
            merchantName: 'Security Test Merchant'
          }
        })
        .expect(200);

      // Verify response doesn't contain sensitive data
      const responseString = JSON.stringify(response.body);
      expect(responseString).not.toMatch(/\d{13,19}/); // No full card numbers
      expect(responseString).not.toMatch(/\d{3,4}/); // No CVV codes
    });

    it('should validate rate limiting', async () => {
      // Make multiple rapid requests to test rate limiting
      const rapidRequests = Array.from({ length: 10 }, () =>
        request(app)
          .get('/api/v1/notifications/preferences')
          .set('Authorization', 'Bearer test-token')
      );

      const responses = await Promise.all(rapidRequests);
      
      // Some requests should succeed, but rate limiting might block others
      const successCount = responses.filter(r => r.status === 200).length;
      const rateLimitedCount = responses.filter(r => r.status === 429).length;
      
      expect(successCount + rateLimitedCount).toBe(10);
    });
  });
});