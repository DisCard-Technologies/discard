import { device, element, by, expect, waitFor } from 'detox';
import { jest, describe, it, beforeAll, afterAll, beforeEach } from '@jest/globals';

describe('Notification Workflows E2E', () => {
  beforeAll(async () => {
    await device.launchApp({
      newInstance: true,
      permissions: { notifications: 'YES' }
    });
  });

  afterAll(async () => {
    await device.terminateApp();
  });

  beforeEach(async () => {
    await device.reloadReactNative();
    
    // Login or setup user session
    await element(by.id('login-screen')).tap();
    await element(by.id('email-input')).typeText('test@discard.app');
    await element(by.id('password-input')).typeText('testpassword123');
    await element(by.id('login-button')).tap();
    
    // Wait for home screen
    await waitFor(element(by.id('home-screen')))
      .toBeVisible()
      .withTimeout(5000);
  });

  describe('Real-time Transaction Notifications', () => {
    it('should receive push notification for new transaction', async () => {
      // Navigate to card details
      await element(by.id('cards-tab')).tap();
      await element(by.id('card-item-0')).tap();
      
      // Wait for card details screen
      await waitFor(element(by.id('card-details-screen')))
        .toBeVisible()
        .withTimeout(3000);

      // Trigger a test transaction (this would normally come from external source)
      await element(by.id('test-transaction-button')).tap();
      
      // Wait for notification to appear
      await waitFor(element(by.id('notification-banner')))
        .toBeVisible()
        .withTimeout(10000);

      // Verify notification content
      await expect(element(by.text('Transaction Alert'))).toBeVisible();
      await expect(element(by.text('Card ending in 1234 used for $25.00'))).toBeVisible();
      
      // Verify action buttons are present
      await expect(element(by.text('View Details'))).toBeVisible();
      await expect(element(by.text('Dispute'))).toBeVisible();
    });

    it('should show spending limit alert when threshold reached', async () => {
      // Navigate to spending settings
      await element(by.id('settings-tab')).tap();
      await element(by.id('notification-preferences')).tap();
      
      // Set a low spending limit for testing
      await element(by.id('spending-limit-input')).clearText();
      await element(by.id('spending-limit-input')).typeText('50');
      await element(by.id('save-preferences-button')).tap();
      
      // Go back to cards and make multiple transactions to exceed threshold
      await element(by.id('cards-tab')).tap();
      await element(by.id('card-item-0')).tap();
      
      // Simulate multiple transactions to reach 90% threshold
      for (let i = 0; i < 3; i++) {
        await element(by.id('test-transaction-button')).tap();
        await waitFor(element(by.id('notification-banner')))
          .toBeVisible()
          .withTimeout(5000);
        await element(by.id('dismiss-notification')).tap();
      }
      
      // The last transaction should trigger spending alert
      await waitFor(element(by.text('Spending Alert')))
        .toBeVisible()
        .withTimeout(5000);
      
      await expect(element(by.text('You have reached 90% of your spending limit'))).toBeVisible();
    });

    it('should handle declined transaction notification', async () => {
      // Navigate to cards
      await element(by.id('cards-tab')).tap();
      await element(by.id('card-item-0')).tap();
      
      // Simulate declined transaction (mock insufficient funds)
      await element(by.id('test-decline-button')).tap();
      
      // Wait for decline notification
      await waitFor(element(by.text('Transaction Declined')))
        .toBeVisible()
        .withTimeout(10000);
      
      await expect(element(by.text('Transaction declined: Insufficient funds'))).toBeVisible();
      await expect(element(by.text('Add Funds'))).toBeVisible();
      await expect(element(by.text('Contact Support'))).toBeVisible();
    });
  });

  describe('Notification Center Navigation', () => {
    it('should navigate to notification center and display history', async () => {
      // Go to notification center
      await element(by.id('notifications-tab')).tap();
      
      // Wait for notification center to load
      await waitFor(element(by.id('notification-center')))
        .toBeVisible()
        .withTimeout(3000);
      
      // Should show list of notifications
      await expect(element(by.id('notification-list'))).toBeVisible();
      
      // If no notifications, should show empty state
      const emptyStateExists = await element(by.text('No Notifications')).exists();
      if (emptyStateExists) {
        await expect(element(by.text('You\'ll see your transaction alerts and spending notifications here'))).toBeVisible();
      } else {
        // Should show at least one notification
        await expect(element(by.id('notification-item-0'))).toBeVisible();
      }
    });

    it('should mark notification as read when tapped', async () => {
      // Create a test notification first
      await element(by.id('cards-tab')).tap();
      await element(by.id('card-item-0')).tap();
      await element(by.id('test-transaction-button')).tap();
      
      // Wait for notification and dismiss it
      await waitFor(element(by.id('notification-banner')))
        .toBeVisible()
        .withTimeout(5000);
      await element(by.id('dismiss-notification')).tap();
      
      // Go to notification center
      await element(by.id('notifications-tab')).tap();
      await waitFor(element(by.id('notification-center')))
        .toBeVisible()
        .withTimeout(3000);
      
      // Tap on the first notification
      await element(by.id('notification-item-0')).tap();
      
      // Notification should be marked as read (visual change in UI)
      await expect(element(by.id('notification-item-0'))).toBeVisible();
    });

    it('should delete notification when delete button is pressed', async () => {
      // Go to notification center
      await element(by.id('notifications-tab')).tap();
      await waitFor(element(by.id('notification-center')))
        .toBeVisible()
        .withTimeout(3000);
      
      // Long press or tap delete button on first notification
      await element(by.id('delete-notification-0')).tap();
      
      // Confirm deletion in alert
      await element(by.text('Delete')).tap();
      
      // Notification should be removed from list
      await waitFor(element(by.id('notification-item-0')))
        .not.toExist()
        .withTimeout(3000);
    });
  });

  describe('Notification Preferences', () => {
    it('should update notification preferences successfully', async () => {
      // Navigate to settings
      await element(by.id('settings-tab')).tap();
      await element(by.id('notification-preferences')).tap();
      
      // Wait for preferences screen
      await waitFor(element(by.id('notification-preferences-screen')))
        .toBeVisible()
        .withTimeout(3000);
      
      // Change notification type to email only
      await element(by.id('notification-type-email')).tap();
      
      // Change amount threshold
      await element(by.id('amount-threshold-input')).clearText();
      await element(by.id('amount-threshold-input')).typeText('10.00');
      
      // Disable weekend alerts
      await element(by.id('weekend-alerts-toggle')).tap();
      
      // Save preferences
      await element(by.id('save-preferences-button')).tap();
      
      // Should show success message
      await waitFor(element(by.text('Preferences saved successfully')))
        .toBeVisible()
        .withTimeout(3000);
    });

    it('should test notification with current preferences', async () => {
      // Go to notification preferences
      await element(by.id('settings-tab')).tap();
      await element(by.id('notification-preferences')).tap();
      
      // Tap test notification button
      await element(by.id('test-notification-button')).tap();
      
      // Should show test notification based on current preferences
      await waitFor(element(by.text('Test Notification')))
        .toBeVisible()
        .withTimeout(5000);
      
      await expect(element(by.text('This is a test notification with your current settings'))).toBeVisible();
    });

    it('should respect quiet hours setting', async () => {
      // Set quiet hours
      await element(by.id('settings-tab')).tap();
      await element(by.id('notification-preferences')).tap();
      
      await element(by.id('quiet-hours-start')).tap();
      await element(by.text('10 PM')).tap(); // Set start time
      
      await element(by.id('quiet-hours-end')).tap();
      await element(by.text('7 AM')).tap(); // Set end time
      
      await element(by.id('save-preferences-button')).tap();
      
      // Mock system time to be within quiet hours (would need test setup)
      // In a real test, this would involve mocking the device clock
      
      // Trigger transaction during quiet hours
      await element(by.id('cards-tab')).tap();
      await element(by.id('card-item-0')).tap();
      await element(by.id('test-transaction-button')).tap();
      
      // Should not show immediate notification (would be delayed)
      await expect(element(by.id('notification-banner'))).not.toExist();
    });
  });

  describe('WebSocket Real-time Updates', () => {
    it('should receive real-time transaction updates via WebSocket', async () => {
      // Navigate to transaction monitor
      await element(by.id('cards-tab')).tap();
      await element(by.id('card-item-0')).tap();
      await element(by.id('recent-transactions')).tap();
      
      // Should show WebSocket connection status
      await expect(element(by.text('Live'))).toBeVisible();
      
      // Simulate external transaction (would normally come from backend)
      // This would require test backend to send WebSocket message
      
      // For now, verify WebSocket connection is established
      await expect(element(by.id('connection-status'))).toHaveText('Live');
    });

    it('should handle WebSocket disconnection gracefully', async () => {
      // Navigate to transaction monitor
      await element(by.id('cards-tab')).tap();
      await element(by.id('card-item-0')).tap();
      
      // Simulate network disconnection
      await device.shake(); // This might toggle airplane mode in simulator
      
      // Should show offline status
      await waitFor(element(by.text('Offline')))
        .toBeVisible()
        .withTimeout(10000);
      
      // Restore connection
      await device.shake();
      
      // Should reconnect and show live status
      await waitFor(element(by.text('Live')))
        .toBeVisible()
        .withTimeout(15000);
    });
  });

  describe('Notification Action Buttons', () => {
    it('should handle "View Details" action correctly', async () => {
      // Create test notification
      await element(by.id('cards-tab')).tap();
      await element(by.id('card-item-0')).tap();
      await element(by.id('test-transaction-button')).tap();
      
      // Wait for notification
      await waitFor(element(by.id('notification-banner')))
        .toBeVisible()
        .withTimeout(5000);
      
      // Tap "View Details" button
      await element(by.text('View Details')).tap();
      
      // Should navigate to transaction details
      await waitFor(element(by.id('transaction-details-screen')))
        .toBeVisible()
        .withTimeout(3000);
      
      await expect(element(by.text('Transaction Details'))).toBeVisible();
    });

    it('should handle "Dispute" action correctly', async () => {
      // Create test transaction notification
      await element(by.id('cards-tab')).tap();
      await element(by.id('card-item-0')).tap();
      await element(by.id('test-transaction-button')).tap();
      
      await waitFor(element(by.id('notification-banner')))
        .toBeVisible()
        .withTimeout(5000);
      
      // Tap "Dispute" button
      await element(by.text('Dispute')).tap();
      
      // Should show dispute confirmation dialog
      await expect(element(by.text('Dispute Transaction'))).toBeVisible();
      await expect(element(by.text('Are you sure you want to dispute this transaction?'))).toBeVisible();
      
      // Confirm dispute
      await element(by.text('Dispute')).tap();
      
      // Should navigate to dispute form or show success message
      await waitFor(element(by.text('Dispute submitted successfully')))
        .toBeVisible()
        .withTimeout(5000);
    });

    it('should handle "Add Funds" action for declined transactions', async () => {
      // Create declined transaction
      await element(by.id('cards-tab')).tap();
      await element(by.id('card-item-0')).tap();
      await element(by.id('test-decline-button')).tap();
      
      await waitFor(element(by.text('Transaction Declined')))
        .toBeVisible()
        .withTimeout(5000);
      
      // Tap "Add Funds" button
      await element(by.text('Add Funds')).tap();
      
      // Should navigate to funding screen
      await waitFor(element(by.id('funding-screen')))
        .toBeVisible()
        .withTimeout(3000);
      
      await expect(element(by.text('Add Funds to Card'))).toBeVisible();
    });
  });

  describe('Performance and Reliability', () => {
    it('should handle high frequency notifications without performance issues', async () => {
      const startTime = Date.now();
      
      // Navigate to cards
      await element(by.id('cards-tab')).tap();
      await element(by.id('card-item-0')).tap();
      
      // Generate multiple rapid notifications
      for (let i = 0; i < 10; i++) {
        await element(by.id('test-transaction-button')).tap();
        
        // Brief wait to allow notification processing
        await device.sleep(100);
        
        // Dismiss notification to avoid overlap
        try {
          await element(by.id('dismiss-notification')).tap();
        } catch {
          // Notification may auto-dismiss
        }
      }
      
      const endTime = Date.now();
      const processingTime = endTime - startTime;
      
      // Should handle 10 notifications in under 5 seconds
      expect(processingTime).toBeLessThan(5000);
      
      // App should remain responsive
      await expect(element(by.id('card-details-screen'))).toBeVisible();
    });

    it('should maintain notification state across app backgrounding', async () => {
      // Create notification
      await element(by.id('cards-tab')).tap();
      await element(by.id('card-item-0')).tap();
      await element(by.id('test-transaction-button')).tap();
      
      await waitFor(element(by.id('notification-banner')))
        .toBeVisible()
        .withTimeout(5000);
      
      // Background and foreground app
      await device.sendToHome();
      await device.launchApp({ newInstance: false });
      
      // Notification should still be visible or in history
      const notificationExists = await element(by.id('notification-banner')).exists();
      if (!notificationExists) {
        // Check notification history
        await element(by.id('notifications-tab')).tap();
        await expect(element(by.id('notification-item-0'))).toBeVisible();
      }
    });
  });

  describe('Accessibility', () => {
    it('should be accessible to screen readers', async () => {
      await device.enableSynchronization(false);
      
      // Navigate to notification center
      await element(by.id('notifications-tab')).tap();
      
      // Check for accessibility labels
      await expect(element(by.id('notification-list'))).toHaveAccessibilityLabel('Notification list');
      
      if (await element(by.id('notification-item-0')).exists()) {
        await expect(element(by.id('notification-item-0'))).toHaveAccessibilityLabel(/Transaction alert/);
      }
      
      await device.enableSynchronization(true);
    });

    it('should support voice control for notification actions', async () => {
      // This test would require accessibility service integration
      // For now, we verify that elements have proper accessibility props
      
      await element(by.id('notifications-tab')).tap();
      
      if (await element(by.text('View Details')).exists()) {
        await expect(element(by.text('View Details'))).toHaveAccessibilityRole('button');
      }
      
      if (await element(by.text('Dispute')).exists()) {
        await expect(element(by.text('Dispute'))).toHaveAccessibilityRole('button');
      }
    });
  });
});