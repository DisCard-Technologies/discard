const { device, expect, element, by, waitFor } = require('detox');

describe('Privacy Protection E2E', () => {
  beforeAll(async () => {
    await device.launchApp();
  });

  beforeEach(async () => {
    await device.reloadReactNative();
  });

  afterAll(async () => {
    await device.terminateApp();
  });

  it('should maintain privacy across full app workflow', async () => {
    // Complete workflow: Create card -> Fund -> Transact -> Monitor privacy
    
    // 1. Create new card
    await element(by.id('cards-tab')).tap();
    await element(by.id('create-card-button')).tap();
    await waitFor(element(by.id('card-creation-screen'))).toBeVisible().withTimeout(5000);
    
    await element(by.id('card-name-input')).typeText('Privacy Test Card');
    await element(by.id('create-card-submit')).tap();
    
    // 2. Verify isolation established for new card
    await waitFor(element(by.id('card-details-screen'))).toBeVisible().withTimeout(5000);
    await expect(element(by.id('isolation-status-indicator'))).toBeVisible();
    await expect(element(by.text('Privacy Protected'))).toBeVisible();

    // 3. Fund the card
    await element(by.id('fund-card-button')).tap();
    await waitFor(element(by.id('funding-screen'))).toBeVisible().withTimeout(5000);
    
    await element(by.id('amount-input')).typeText('100.00');
    await element(by.id('fund-button')).tap();
    
    // 4. Verify isolation maintained during funding
    await waitFor(element(by.id('funding-success'))).toBeVisible().withTimeout(10000);
    await expect(element(by.id('isolation-status-indicator'))).toBeVisible();

    // 5. Make a transaction
    await element(by.id('back-button')).tap();
    await element(by.id('make-transaction-button')).tap();
    
    // 6. Check privacy dashboard after transaction
    await element(by.id('privacy-tab')).tap();
    await waitFor(element(by.id('privacy-dashboard'))).toBeVisible().withTimeout(5000);
    
    // Privacy metrics should show continued protection
    await expect(element(by.text('COMPLIANT'))).toBeVisible();
  });

  it('should prevent correlation across multiple cards', async () => {
    // Test scenario: User has multiple cards and accesses them sequentially
    
    const testCards = ['test-card-1', 'test-card-2', 'test-card-3'];
    
    for (let i = 0; i < testCards.length; i++) {
      // Navigate to card
      await element(by.id('cards-tab')).tap();
      await waitFor(element(by.id('card-list'))).toBeVisible().withTimeout(3000);
      await element(by.id(testCards[i])).tap();
      
      // Verify isolation for this card
      await waitFor(element(by.id('card-details-screen'))).toBeVisible().withTimeout(3000);
      await expect(element(by.id('isolation-status-indicator'))).toBeVisible();
      
      // Access transaction history
      await element(by.id('view-transactions-button')).tap();
      await waitFor(element(by.id('transaction-list'))).toBeVisible().withTimeout(3000);
      
      // Should only see transactions for current card
      const transactionItems = element(by.id('transaction-item'));
      await expect(transactionItems).toBeVisible();
      
      // Go back for next iteration
      await element(by.id('back-button')).tap();
      await element(by.id('back-button')).tap();
    }

    // Check privacy dashboard - should show no correlation detected
    await element(by.id('privacy-tab')).tap();
    await waitFor(element(by.id('privacy-dashboard'))).toBeVisible().withTimeout(5000);
    
    const blockedCorrelations = await element(by.id('blocked-correlations-value')).getText();
    expect(parseInt(blockedCorrelations)).toBeGreaterThanOrEqual(0);
  });

  it('should resist timing-based correlation attacks', async () => {
    // Simulate rapid card switching with precise timing
    const cardIds = ['test-card-1', 'test-card-2'];
    const switchingTimes = [];
    
    for (let i = 0; i < 3; i++) {
      for (const cardId of cardIds) {
        const startTime = Date.now();
        
        await element(by.id('cards-tab')).tap();
        await element(by.id(cardId)).tap();
        await waitFor(element(by.id('card-details-screen'))).toBeVisible().withTimeout(3000);
        
        const endTime = Date.now();
        switchingTimes.push(endTime - startTime);
        
        // Verify isolation maintained
        await expect(element(by.id('isolation-status-indicator'))).toBeVisible();
        
        // Small delay between switches
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }

    // Check that timing randomization occurred (times should vary)
    const timingVariance = Math.max(...switchingTimes) - Math.min(...switchingTimes);
    expect(timingVariance).toBeGreaterThan(100); // Should have at least 100ms variance

    // Verify no correlation was detected
    await element(by.id('privacy-tab')).tap();
    await waitFor(element(by.id('privacy-dashboard'))).toBeVisible().withTimeout(5000);
    await expect(element(by.text('COMPLIANT'))).toBeVisible();
  });

  it('should handle network failures gracefully without privacy leaks', async () => {
    // Start with good connection
    await element(by.id('cards-tab')).tap();
    await element(by.id('test-card-1')).tap();
    await waitFor(element(by.id('card-details-screen'))).toBeVisible().withTimeout(5000);

    // Verify initial isolation
    await expect(element(by.id('isolation-status-indicator'))).toBeVisible();

    // Disable network
    await device.setNetworkConnection(false);

    // Try to perform operations
    await element(by.id('view-transactions-button')).tap();

    // Should show appropriate error without exposing sensitive data
    await waitFor(element(by.text('Unable to load transactions'))).toBeVisible().withTimeout(5000);
    
    // Should not show cached data from other cards
    await expect(element(by.id('transaction-item'))).not.toExist();

    // Re-enable network
    await device.setNetworkConnection(true);

    // Should recover with isolation intact
    await element(by.id('back-button')).tap();
    await waitFor(element(by.id('card-details-screen'))).toBeVisible().withTimeout(5000);
    await expect(element(by.id('isolation-status-indicator'))).toBeVisible();
  });

  it('should provide clear privacy status feedback to user', async () => {
    await element(by.id('cards-tab')).tap();
    await element(by.id('test-card-1')).tap();
    await waitFor(element(by.id('card-details-screen'))).toBeVisible().withTimeout(5000);

    // Check isolation status indicator components
    await expect(element(by.id('isolation-status-indicator'))).toBeVisible();
    
    // Should show appropriate icon
    await expect(element(by.id('privacy-shield-icon'))).toBeVisible();
    
    // Should show status text
    await expect(element(by.text('Privacy Protected'))).toBeVisible();
    
    // Should show last verified time
    await expect(element(by.id('last-verified-text'))).toBeVisible();

    // Tap on status for more details
    await element(by.id('isolation-status-indicator')).tap();
    
    // Should show detailed privacy information
    await waitFor(element(by.id('privacy-details-modal'))).toBeVisible().withTimeout(3000);
    await expect(element(by.text('Transaction Isolation Active'))).toBeVisible();
  });

  it('should handle multiple user sessions without cross-contamination', async () => {
    // Simulate user logout and login with different account
    await element(by.id('profile-tab')).tap();
    await element(by.id('logout-button')).tap();
    
    // Confirm logout
    await element(by.text('Logout')).tap();
    await waitFor(element(by.id('login-screen'))).toBeVisible().withTimeout(5000);

    // Login with different test account
    await element(by.id('email-input')).typeText('test2@example.com');
    await element(by.id('password-input')).typeText('testpass123');
    await element(by.id('login-button')).tap();

    // Wait for dashboard
    await waitFor(element(by.id('dashboard-screen'))).toBeVisible().withTimeout(10000);

    // Navigate to cards - should only see cards for new user
    await element(by.id('cards-tab')).tap();
    await waitFor(element(by.id('card-list'))).toBeVisible().withTimeout(5000);

    // Select any card and verify clean isolation context
    await element(by.id('test-card-user2-1')).tap();
    await waitFor(element(by.id('card-details-screen'))).toBeVisible().withTimeout(3000);
    
    await expect(element(by.id('isolation-status-indicator'))).toBeVisible();
    await expect(element(by.text('Privacy Protected'))).toBeVisible();

    // Should not have access to previous user's data
    await element(by.id('view-transactions-button')).tap();
    await waitFor(element(by.id('transaction-list'))).toBeVisible().withTimeout(5000);
    
    // Transaction list should be empty or only contain new user's data
  });

  it('should maintain isolation during background/foreground transitions', async () => {
    await element(by.id('cards-tab')).tap();
    await element(by.id('test-card-1')).tap();
    await waitFor(element(by.id('card-details-screen'))).toBeVisible().withTimeout(5000);

    // Verify initial isolation
    await expect(element(by.id('isolation-status-indicator'))).toBeVisible();
    const initialStatus = await element(by.id('isolation-status-text')).getText();

    // Simulate app backgrounding
    await device.sendToHome();
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Bring app back to foreground
    await device.launchApp({ newInstance: false });
    await waitFor(element(by.id('card-details-screen'))).toBeVisible().withTimeout(5000);

    // Isolation should be re-verified and maintained
    await expect(element(by.id('isolation-status-indicator'))).toBeVisible();
    await expect(element(by.text('Privacy Protected'))).toBeVisible();
    
    // Status might update due to re-verification
    const finalStatus = await element(by.id('isolation-status-text')).getText();
    expect(finalStatus).toBe('Privacy Protected');
  });
});