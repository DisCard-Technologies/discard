/**
 * E2E Tests for Card Creation and Deletion Flows
 * Testing complete user journeys from card creation through deletion
 */

import { device, element, by, expect as detoxExpect, waitFor } from 'detox';

describe('Card Creation and Deletion E2E Flow', () => {
  beforeAll(async () => {
    await device.launchApp({ permissions: { clipboard: 'YES' } });
  });

  beforeEach(async () => {
    await device.reloadReactNative();
  });

  describe('Card Creation Flow', () => {
    test('should complete full card creation journey', async () => {
      // Navigate to card creation screen
      await element(by.id('create-card-button')).tap();
      
      // Verify card creation form is displayed
      await detoxExpect(element(by.text('Create New Card'))).toBeVisible();
      await detoxExpect(element(by.id('spending-limit-input'))).toBeVisible();

      // Fill spending limit
      await element(by.id('spending-limit-input')).typeText('100');
      
      // Add merchant restriction
      await element(by.id('add-restriction-button')).tap();
      await element(by.id('merchant-restriction-input')).typeText('grocery');
      await element(by.id('confirm-restriction-button')).tap();
      
      // Verify restriction was added
      await detoxExpect(element(by.text('grocery'))).toBeVisible();

      // Create the card
      await element(by.id('create-card-button')).tap();
      
      // Wait for creation to complete
      await waitFor(element(by.text('Card created successfully!')))
        .toBeVisible()
        .withTimeout(5000);

      // Verify navigation to card details
      await detoxExpect(element(by.id('card-details-screen'))).toBeVisible();
      await detoxExpect(element(by.text('$100.00'))).toBeVisible(); // Spending limit
    });

    test('should validate form inputs', async () => {
      await element(by.id('create-card-button')).tap();
      
      // Try to create card without spending limit
      await element(by.id('create-card-button')).tap();
      
      // Should show validation error
      await detoxExpect(element(by.text('Spending limit is required'))).toBeVisible();
      
      // Enter invalid spending limit
      await element(by.id('spending-limit-input')).typeText('0.50');
      await element(by.id('create-card-button')).tap();
      
      await detoxExpect(element(by.text('Spending limit must be at least $1.00'))).toBeVisible();
    });

    test('should handle creation errors gracefully', async () => {
      // Mock network error scenario
      await device.setURLBlacklist(['**/api/v1/cards']);
      
      await element(by.id('create-card-button')).tap();
      await element(by.id('spending-limit-input')).typeText('100');
      await element(by.id('create-card-button')).tap();
      
      // Should show error message
      await waitFor(element(by.text('Failed to create card. Please try again.')))
        .toBeVisible()
        .withTimeout(5000);
        
      // Reset network
      await device.setURLBlacklist([]);
    });
  });

  describe('Card Management Flow', () => {
    beforeEach(async () => {
      // Create a test card for management tests
      await element(by.id('create-card-button')).tap();
      await element(by.id('spending-limit-input')).typeText('100');
      await element(by.id('create-card-button')).tap();
      await waitFor(element(by.text('Card created successfully!'))).toBeVisible().withTimeout(5000);
    });

    test('should pause and activate card', async () => {
      // Verify card is initially active
      await detoxExpect(element(by.text('ACTIVE'))).toBeVisible();
      
      // Pause the card
      await element(by.id('pause-card-button')).tap();
      
      // Verify card status changed
      await waitFor(element(by.text('PAUSED'))).toBeVisible().withTimeout(3000);
      await detoxExpect(element(by.text('Activate'))).toBeVisible();
      
      // Reactivate the card
      await element(by.id('activate-card-button')).tap();
      
      // Verify card is active again
      await waitFor(element(by.text('ACTIVE'))).toBeVisible().withTimeout(3000);
      await detoxExpect(element(by.text('Pause'))).toBeVisible();
    });

    test('should copy card credentials securely', async () => {
      // Copy card number
      await element(by.id('copy-card-number-button')).tap();
      
      // Should show confirmation
      await detoxExpect(element(by.text('Card number copied!'))).toBeVisible();
      
      // Copy CVV
      await element(by.id('copy-cvv-button')).tap();
      
      // Should show confirmation
      await detoxExpect(element(by.text('CVV copied!'))).toBeVisible();
    });
  });

  describe('Card Deletion Flow', () => {
    beforeEach(async () => {
      // Create a test card for deletion tests
      await element(by.id('create-card-button')).tap();
      await element(by.id('spending-limit-input')).typeText('100');
      await element(by.id('create-card-button')).tap();
      await waitFor(element(by.text('Card created successfully!'))).toBeVisible().withTimeout(5000);
    });

    test('should complete full card deletion journey', async () => {
      // Initiate card deletion
      await element(by.id('delete-card-button')).tap();
      
      // Verify confirmation dialog
      await detoxExpect(element(by.text('Delete Card'))).toBeVisible();
      await detoxExpected(element(by.text('permanently delete this card'))).toBeVisible();
      await detoxExpect(element(by.text('Cancel'))).toBeVisible();
      await detoxExpect(element(by.text('Delete'))).toBeVisible();
      
      // Confirm deletion
      await element(by.text('Delete')).tap();
      
      // Wait for deletion to complete
      await waitFor(element(by.text('Card deleted successfully')))
        .toBeVisible()
        .withTimeout(5000);
      
      // Verify card status changed to deleted
      await detoxExpect(element(by.text('DELETED'))).toBeVisible();
      
      // Verify action buttons are hidden
      await detoxExpect(element(by.id('pause-card-button'))).not.toBeVisible();
      await detoxExpect(element(by.id('delete-card-button'))).not.toBeVisible();
    });

    test('should cancel card deletion', async () => {
      // Initiate card deletion
      await element(by.id('delete-card-button')).tap();
      
      // Cancel deletion
      await element(by.text('Cancel')).tap();
      
      // Verify card is still active
      await detoxExpect(element(by.text('ACTIVE'))).toBeVisible();
      await detoxExpected(element(by.id('delete-card-button'))).toBeVisible();
    });

    test('should prevent double deletion', async () => {
      // Delete the card first
      await element(by.id('delete-card-button')).tap();
      await element(by.text('Delete')).tap();
      await waitFor(element(by.text('Card deleted successfully'))).toBeVisible().withTimeout(5000);
      
      // Try to delete again - button should not be visible
      await detoxExpect(element(by.id('delete-card-button'))).not.toBeVisible();
    });

    test('should handle deletion errors gracefully', async () => {
      // Mock network error
      await device.setURLBlacklist(['**/api/v1/cards/*']);
      
      await element(by.id('delete-card-button')).tap();
      await element(by.text('Delete')).tap();
      
      // Should show error message
      await waitFor(element(by.text('Failed to delete card')))
        .toBeVisible()
        .withTimeout(5000);
        
      // Card should remain in original state
      await detoxExpected(element(by.text('ACTIVE'))).toBeVisible();
      
      // Reset network
      await device.setURLBlacklist([]);
    });
  });

  describe('Privacy and Security Flow', () => {
    beforeEach(async () => {
      await element(by.id('create-card-button')).tap();
      await element(by.id('spending-limit-input')).typeText('100');
      await element(by.id('create-card-button')).tap();
      await waitFor(element(by.text('Card created successfully!'))).toBeVisible().withTimeout(5000);
    });

    test('should display privacy indicators correctly', async () => {
      // Verify privacy indicator is visible
      await detoxExpect(element(by.id('privacy-indicator'))).toBeVisible();
      
      // Check privacy status
      await detoxExpect(element(by.text('High Privacy'))).toBeVisible();
      
      // Tap to view details
      await element(by.id('privacy-indicator')).tap();
      
      // Verify detailed privacy status
      await detoxExpect(element(by.text('Encrypted'))).toBeVisible();
      await detoxExpect(element(by.text('Isolated'))).toBeVisible();
      await detoxExpect(element(by.text('Deletion Ready'))).toBeVisible();
    });

    test('should handle secure clipboard operations', async () => {
      // Copy card number with secure timeout
      await element(by.id('copy-card-number-button')).tap();
      await detoxExpected(element(by.text('Card number copied!'))).toBeVisible();
      
      // Wait for automatic clipboard clearing (should happen after 30 seconds in real scenario)
      // For E2E test, we'll verify the confirmation message appears and disappears
      await waitFor(element(by.text('Card number copied!')))
        .not.toBeVisible()
        .withTimeout(3000);
    });

    test('should show privacy warnings when appropriate', async () => {
      // Pause the card to trigger privacy warning
      await element(by.id('pause-card-button')).tap();
      
      // Privacy status should change
      await waitFor(element(by.text('Medium Privacy')))
        .toBeVisible()
        .withTimeout(3000);
    });
  });

  describe('Card Dashboard Integration', () => {
    test('should navigate between screens correctly', async () => {
      // Start from dashboard
      await detoxExpected(element(by.id('card-dashboard-screen'))).toBeVisible();
      
      // Navigate to card creation
      await element(by.id('create-card-button')).tap();
      await detoxExpected(element(by.id('card-creation-screen'))).toBeVisible();
      
      // Go back to dashboard
      await element(by.id('back-button')).tap();
      await detoxExpected(element(by.id('card-dashboard-screen'))).toBeVisible();
    });

    test('should update dashboard after card operations', async () => {
      // Create a card
      await element(by.id('create-card-button')).tap();
      await element(by.id('spending-limit-input')).typeText('100');
      await element(by.id('create-card-button')).tap();
      await waitFor(element(by.text('Card created successfully!'))).toBeVisible().withTimeout(5000);
      
      // Navigate back to dashboard
      await element(by.id('back-to-dashboard-button')).tap();
      
      // Verify card appears in dashboard
      await detoxExpect(element(by.text('$100.00'))).toBeVisible();
      await detoxExpected(element(by.text('ACTIVE'))).toBeVisible();
    });
  });

  describe('Error Handling and Edge Cases', () => {
    test('should handle app backgrounding during operations', async () => {
      await element(by.id('create-card-button')).tap();
      await element(by.id('spending-limit-input')).typeText('100');
      
      // Simulate app going to background
      await device.sendToHome();
      await device.launchApp();
      
      // Form state should be preserved
      await detoxExpected(element(by.id('spending-limit-input'))).toHaveText('100');
    });

    test('should handle network connectivity issues', async () => {
      // Disable network
      await device.setURLBlacklist(['**']);
      
      await element(by.id('create-card-button')).tap();
      await element(by.id('spending-limit-input')).typeText('100');
      await element(by.id('create-card-button')).tap();
      
      // Should show appropriate error
      await waitFor(element(by.text('Network error')))
        .toBeVisible()
        .withTimeout(5000);
      
      // Re-enable network
      await device.setURLBlacklist([]);
    });
  });
});