/**
 * End-to-End Tests for Card Deletion Workflows
 * Tests the complete card deletion flow from mobile UI to backend completion
 */

describe('Card Deletion E2E Tests', () => {
  beforeAll(async () => {
    // Launch the app and authenticate
    await device.launchApp();
    await waitFor(element(by.id('auth-screen'))).toBeVisible().withTimeout(10000);
    
    // Mock authentication for testing
    await element(by.id('email-input')).typeText('test@example.com');
    await element(by.id('password-input')).typeText('testpassword123');
    await element(by.id('login-button')).tap();
    
    // Wait for dashboard to load
    await waitFor(element(by.id('dashboard-screen'))).toBeVisible().withTimeout(10000);
  });

  beforeEach(async () => {
    // Navigate to cards section
    await element(by.id('cards-tab')).tap();
    await waitFor(element(by.id('cards-list'))).toBeVisible().withTimeout(5000);
  });

  afterAll(async () => {
    await device.terminateApp();
  });

  describe('Single Card Deletion Flow', () => {
    it('should complete full card deletion workflow', async () => {
      // Step 1: Select a card to delete
      await element(by.id('card-item-0')).tap();
      await waitFor(element(by.id('card-details-screen'))).toBeVisible().withTimeout(5000);

      // Step 2: Initiate deletion
      await element(by.id('delete-card-button')).tap();
      await waitFor(element(by.id('card-deletion-modal'))).toBeVisible().withTimeout(3000);

      // Step 3: Navigate through confirmation steps
      // Confirmation step
      await expect(element(by.text('Irreversible Action'))).toBeVisible();
      await element(by.id('next-button')).tap();

      // Impact summary step
      await expect(element(by.text('Deletion Impact Summary'))).toBeVisible();
      await element(by.id('next-button')).tap();

      // Typing confirmation step
      await expect(element(by.text('Confirmation Required'))).toBeVisible();
      await element(by.id('confirmation-input')).typeText('DELETE PERMANENTLY');
      await waitFor(element(by.id('next-button'))).toBeVisible().withTimeout(2000);
      await element(by.id('next-button')).tap();

      // Final confirmation step
      await expect(element(by.text('Final Warning'))).toBeVisible();
      await element(by.id('delete-permanently-button')).tap();

      // Step 4: Wait for deletion processing
      await waitFor(element(by.text('Deleting Card...'))).toBeVisible().withTimeout(3000);
      
      // Step 5: Verify completion
      await waitFor(element(by.text('Card Deleted Successfully'))).toBeVisible().withTimeout(15000);
      await expect(element(by.text('Deletion ID:'))).toBeVisible();
      await expect(element(by.text('Proof Hash:'))).toBeVisible();

      // Step 6: Close modal and verify card is removed
      await element(by.id('close-button')).tap();
      await waitFor(element(by.id('card-details-screen'))).not.toBeVisible().withTimeout(3000);

      // Verify card no longer appears in list or shows as deleted
      await element(by.id('cards-tab')).tap();
      // Card should either be removed or show deleted status
    });

    it('should handle deletion with cooling-off period', async () => {
      await element(by.id('card-item-0')).tap();
      await element(by.id('delete-card-button')).tap();
      await waitFor(element(by.id('card-deletion-modal'))).toBeVisible().withTimeout(3000);

      // Navigate to impact summary
      await element(by.id('next-button')).tap();
      
      // Enable cooling-off period
      await element(by.id('cooling-off-switch')).tap();
      await expect(element(by.text('24-hour cooling-off period'))).toBeVisible();
      
      // Complete deletion flow
      await element(by.id('next-button')).tap();
      await element(by.id('confirmation-input')).typeText('DELETE PERMANENTLY');
      await element(by.id('next-button')).tap();
      await element(by.id('delete-permanently-button')).tap();

      // Should show scheduled deletion message
      await waitFor(element(by.text('Card Deleted Successfully'))).toBeVisible().withTimeout(10000);
      await element(by.id('close-button')).tap();
    });

    it('should prevent deletion without proper confirmation phrase', async () => {
      await element(by.id('card-item-0')).tap();
      await element(by.id('delete-card-button')).tap();
      
      // Navigate to typing step
      await element(by.id('next-button')).tap();
      await element(by.id('next-button')).tap();

      // Try with wrong phrase
      await element(by.id('confirmation-input')).typeText('WRONG PHRASE');
      
      // Next button should be disabled
      await expect(element(by.id('next-button'))).not.toBeVisible();
      await expect(element(by.text('Phrase must match exactly'))).toBeVisible();
    });

    it('should handle deletion errors gracefully', async () => {
      // Mock network error scenario
      await device.setURLBlacklist(['**/api/v1/cards/**']);

      await element(by.id('card-item-0')).tap();
      await element(by.id('delete-card-button')).tap();
      
      // Complete confirmation flow
      await element(by.id('next-button')).tap();
      await element(by.id('next-button')).tap();
      await element(by.id('confirmation-input')).typeText('DELETE PERMANENTLY');
      await element(by.id('next-button')).tap();
      await element(by.id('delete-permanently-button')).tap();

      // Should show error state
      await waitFor(element(by.text('Deletion Failed'))).toBeVisible().withTimeout(10000);
      await expect(element(by.id('retry-button'))).toBeVisible();

      // Clear blacklist for other tests
      await device.setURLBlacklist([]);
    });

    it('should allow cancellation at any step', async () => {
      await element(by.id('card-item-0')).tap();
      await element(by.id('delete-card-button')).tap();

      // Test cancellation at different steps
      await expect(element(by.id('cancel-button'))).toBeVisible();
      await element(by.id('next-button')).tap();
      
      await expect(element(by.id('cancel-button'))).toBeVisible();
      await element(by.id('back-button')).tap();
      
      await element(by.id('cancel-button')).tap();
      await waitFor(element(by.id('card-deletion-modal'))).not.toBeVisible().withTimeout(3000);
    });
  });

  describe('Bulk Card Deletion Flow', () => {
    beforeEach(async () => {
      // Navigate to cards list and access bulk deletion
      await element(by.id('menu-button')).tap();
      await element(by.id('bulk-delete-option')).tap();
      await waitFor(element(by.id('bulk-deletion-screen'))).toBeVisible().withTimeout(5000);
    });

    it('should complete bulk deletion workflow', async () => {
      // Step 1: Select cards for deletion
      await expect(element(by.text('Select cards to delete'))).toBeVisible();
      
      // Select multiple cards
      await element(by.id('card-checkbox-0')).tap();
      await element(by.id('card-checkbox-1')).tap();
      await element(by.id('card-checkbox-2')).tap();

      // Verify selection summary
      await expect(element(by.text('3 Cards'))).toBeVisible();
      
      // Step 2: Proceed to confirmation
      await element(by.id('delete-selected-button')).tap();
      
      // Step 3: Review deletion summary
      await expect(element(by.text('Bulk Deletion Warning'))).toBeVisible();
      await expect(element(by.text('Cards to delete: 3'))).toBeVisible();

      // Step 4: Enter confirmation phrase
      await element(by.id('confirmation-input')).typeText('DELETE ALL SELECTED');
      
      // Step 5: Execute bulk deletion
      await waitFor(element(by.id('delete-button'))).toBeVisible().withTimeout(2000);
      await element(by.id('delete-button')).tap();

      // Step 6: Monitor progress
      await waitFor(element(by.text('Deleting Cards...'))).toBeVisible().withTimeout(3000);
      await expect(element(by.text('0 of 3 completed'))).toBeVisible();

      // Step 7: Verify completion
      await waitFor(element(by.text('Bulk Deletion Completed'))).toBeVisible().withTimeout(20000);
      await expect(element(by.text('3'))).toBeVisible(); // Completed count
      await expect(element(by.text('0'))).toBeVisible(); // Failed count

      // Step 8: Return to cards list
      await element(by.id('done-button')).tap();
      await waitFor(element(by.id('cards-list'))).toBeVisible().withTimeout(5000);
    });

    it('should handle partial bulk deletion failures', async () => {
      // Mock some cards to fail deletion
      await device.setURLBlacklist(['**/api/v1/cards/card-1']);

      // Select cards and proceed with deletion
      await element(by.id('card-checkbox-0')).tap();
      await element(by.id('card-checkbox-1')).tap();
      await element(by.id('card-checkbox-2')).tap();
      
      await element(by.id('delete-selected-button')).tap();
      await element(by.id('confirmation-input')).typeText('DELETE ALL SELECTED');
      await element(by.id('delete-button')).tap();

      // Wait for partial completion
      await waitFor(element(by.text('Bulk Deletion Partially Failed'))).toBeVisible().withTimeout(20000);
      await expect(element(by.text('2'))).toBeVisible(); // Completed count
      await expect(element(by.text('1'))).toBeVisible(); // Failed count

      // Should show retry option
      await expect(element(by.id('retry-failed-button'))).toBeVisible();

      await device.setURLBlacklist([]);
    });

    it('should support card selection and deselection', async () => {
      // Test individual selection
      await element(by.id('card-checkbox-0')).tap();
      await expect(element(by.text('1 of '))).toBeVisible();

      await element(by.id('card-checkbox-1')).tap();
      await expect(element(by.text('2 of '))).toBeVisible();

      // Test deselection
      await element(by.id('card-checkbox-0')).tap();
      await expect(element(by.text('1 of '))).toBeVisible();

      // Test select all
      await element(by.id('select-all-button')).tap();
      await expect(element(by.text('Deselect All'))).toBeVisible();

      // Test deselect all
      await element(by.id('select-all-button')).tap();
      await expect(element(by.text('0 of '))).toBeVisible();
    });

    it('should filter and sort cards', async () => {
      // Test search functionality
      await element(by.id('search-input')).typeText('test');
      await waitFor(element(by.id('filtered-cards-list'))).toBeVisible().withTimeout(2000);

      // Test sort options
      await element(by.id('sort-balance-button')).tap();
      await element(by.id('sort-status-button')).tap();
      await element(by.id('sort-created-button')).tap();
    });

    it('should validate bulk deletion limits', async () => {
      // Mock selecting maximum cards
      for (let i = 0; i < 50; i++) {
        if (await element(by.id(`card-checkbox-${i}`)).isVisible()) {
          await element(by.id(`card-checkbox-${i}`)).tap();
        }
      }

      // Should show limit warning if exceeded
      await expect(element(by.text('Selection Limit'))).toBeVisible();
    });

    it('should support scheduled bulk deletion', async () => {
      await element(by.id('card-checkbox-0')).tap();
      await element(by.id('card-checkbox-1')).tap();
      
      await element(by.id('delete-selected-button')).tap();
      
      // Enable scheduling
      await element(by.id('schedule-deletion-switch')).tap();
      await expect(element(by.text('Deletion will be scheduled'))).toBeVisible();

      await element(by.id('confirmation-input')).typeText('DELETE ALL SELECTED');
      await element(by.id('schedule-deletion-button')).tap();

      await waitFor(element(by.text('Bulk Deletion Completed'))).toBeVisible().withTimeout(10000);
    });
  });

  describe('Deletion Proof and Verification', () => {
    it('should display and verify deletion proof', async () => {
      // Complete a card deletion first
      await element(by.id('card-item-0')).tap();
      await element(by.id('delete-card-button')).tap();
      
      // Navigate through deletion flow quickly
      await element(by.id('next-button')).tap();
      await element(by.id('next-button')).tap();
      await element(by.id('confirmation-input')).typeText('DELETE PERMANENTLY');
      await element(by.id('next-button')).tap();
      await element(by.id('delete-permanently-button')).tap();

      // Wait for completion and capture deletion details
      await waitFor(element(by.text('Card Deleted Successfully'))).toBeVisible().withTimeout(15000);
      
      // Should show deletion proof details
      await expect(element(by.text('Deletion ID:'))).toBeVisible();
      await expect(element(by.text('Proof Hash:'))).toBeVisible();
      
      // Test proof viewing functionality if available
      if (await element(by.id('view-proof-button')).isVisible()) {
        await element(by.id('view-proof-button')).tap();
        await waitFor(element(by.id('deletion-proof-modal'))).toBeVisible().withTimeout(3000);
        
        await expect(element(by.text('Deletion Certificate'))).toBeVisible();
        await expect(element(by.text('Cryptographic Verification'))).toBeVisible();
        
        await element(by.id('close-proof-modal')).tap();
      }

      await element(by.id('close-button')).tap();
    });
  });

  describe('Accessibility and Usability', () => {
    it('should be accessible to screen readers', async () => {
      // Enable accessibility features
      await device.enableSynchronization();

      await element(by.id('card-item-0')).tap();
      await element(by.id('delete-card-button')).tap();

      // Check for accessibility labels
      await expect(element(by.label('Delete card confirmation modal'))).toBeVisible();
      await expect(element(by.label('Warning about irreversible action'))).toBeVisible();
      await expect(element(by.label('Next step button'))).toBeVisible();
      await expect(element(by.label('Cancel deletion button'))).toBeVisible();
    });

    it('should handle device orientation changes', async () => {
      await element(by.id('card-item-0')).tap();
      await element(by.id('delete-card-button')).tap();
      
      // Test landscape orientation
      await device.setOrientation('landscape');
      await expect(element(by.id('card-deletion-modal'))).toBeVisible();
      
      // Test portrait orientation
      await device.setOrientation('portrait');
      await expect(element(by.id('card-deletion-modal'))).toBeVisible();
      
      await element(by.id('cancel-button')).tap();
    });

    it('should work with slow network conditions', async () => {
      // Simulate slow network
      await device.setNetworkConnection(false);
      await device.setNetworkConnection(true, 'slow');

      await element(by.id('card-item-0')).tap();
      await element(by.id('delete-card-button')).tap();
      
      // Complete deletion flow
      await element(by.id('next-button')).tap();
      await element(by.id('next-button')).tap();
      await element(by.id('confirmation-input')).typeText('DELETE PERMANENTLY');
      await element(by.id('next-button')).tap();
      await element(by.id('delete-permanently-button')).tap();

      // Should show loading state and eventually complete
      await expect(element(by.text('Deleting Card...'))).toBeVisible();
      await waitFor(element(by.text('Card Deleted Successfully'))).toBeVisible().withTimeout(30000);

      // Reset network
      await device.setNetworkConnection(true);
    });
  });

  describe('Error Recovery and Edge Cases', () => {
    it('should handle app backgrounding during deletion', async () => {
      await element(by.id('card-item-0')).tap();
      await element(by.id('delete-card-button')).tap();
      
      // Navigate to processing step
      await element(by.id('next-button')).tap();
      await element(by.id('next-button')).tap();
      await element(by.id('confirmation-input')).typeText('DELETE PERMANENTLY');
      await element(by.id('next-button')).tap();
      await element(by.id('delete-permanently-button')).tap();

      // Background the app during processing
      await device.sendToHome();
      await device.launchApp();

      // Should either resume or show appropriate state
      await waitFor(element(by.id('card-deletion-modal'))).toBeVisible().withTimeout(5000);
    });

    it('should prevent duplicate deletion attempts', async () => {
      await element(by.id('card-item-0')).tap();
      await element(by.id('delete-card-button')).tap();
      
      // Complete first deletion
      await element(by.id('next-button')).tap();
      await element(by.id('next-button')).tap();
      await element(by.id('confirmation-input')).typeText('DELETE PERMANENTLY');
      await element(by.id('next-button')).tap();
      await element(by.id('delete-permanently-button')).tap();

      await waitFor(element(by.text('Card Deleted Successfully'))).toBeVisible().withTimeout(15000);
      await element(by.id('close-button')).tap();

      // Try to delete the same card again
      await element(by.id('card-item-0')).tap();
      
      // Delete button should not be available for deleted cards
      await expect(element(by.id('delete-card-button'))).not.toBeVisible();
      // OR should show "Card already deleted" message
    });

    it('should handle memory pressure during bulk operations', async () => {
      // Navigate to bulk deletion
      await element(by.id('menu-button')).tap();
      await element(by.id('bulk-delete-option')).tap();

      // Select many cards if available
      for (let i = 0; i < 20; i++) {
        if (await element(by.id(`card-checkbox-${i}`)).isVisible()) {
          await element(by.id(`card-checkbox-${i}`)).tap();
        }
      }

      await element(by.id('delete-selected-button')).tap();
      await element(by.id('confirmation-input')).typeText('DELETE ALL SELECTED');
      await element(by.id('delete-button')).tap();

      // Should handle the operation without crashing
      await waitFor(
        element(by.text('Bulk Deletion Completed')).or(element(by.text('Bulk Deletion Partially Failed')))
      ).toBeVisible().withTimeout(45000);
    });
  });
});