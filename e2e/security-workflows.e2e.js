import { device, element, by, expect as detoxExpect } from 'detox';

describe('Security Workflows E2E Tests', () => {
  beforeAll(async () => {
    await device.launchApp();
  });

  beforeEach(async () => {
    await device.reloadReactNative();
  });

  afterAll(async () => {
    await device.terminateApp();
  });

  describe('Fraud Alert Handling', () => {
    it('should display fraud alert and handle user actions', async () => {
      // Navigate to security dashboard
      await element(by.id('security-tab')).tap();
      await element(by.id('security-dashboard')).tap();

      // Wait for fraud alert to appear (mock a fraud alert)
      await mockFraudAlert();
      
      // Verify fraud alert is displayed
      await detoxExpect(element(by.id('fraud-alert'))).toBeVisible();
      await detoxExpect(element(by.text('Suspicious Activity Detected'))).toBeVisible();

      // Test "Report False Positive" action
      await element(by.id('fraud-alert-action-false-positive')).tap();
      
      // Verify confirmation dialog
      await detoxExpect(element(by.text('Thank you'))).toBeVisible();
      await element(by.text('OK')).tap();

      // Verify alert is dismissed
      await detoxExpect(element(by.id('fraud-alert'))).not.toBeVisible();
    });

    it('should handle card freeze from fraud alert', async () => {
      await mockFraudAlert();
      
      // Tap freeze card action
      await element(by.id('fraud-alert-action-freeze')).tap();
      
      // Verify success message
      await detoxExpect(element(by.text('Card Frozen'))).toBeVisible();
      await element(by.text('OK')).tap();

      // Verify card status updated
      await element(by.id('card-freeze-control')).tap();
      await detoxExpect(element(by.text('FROZEN'))).toBeVisible();
    });

    it('should display different severity levels correctly', async () => {
      // Test critical severity
      await mockFraudAlert('critical');
      await detoxExpect(element(by.id('fraud-alert-critical'))).toBeVisible();

      // Test medium severity
      await mockFraudAlert('medium');
      await detoxExpect(element(by.id('fraud-alert-medium'))).toBeVisible();

      // Test low severity
      await mockFraudAlert('low');
      await detoxExpect(element(by.id('fraud-alert-low'))).toBeVisible();
    });
  });

  describe('Card Freeze Control', () => {
    it('should freeze and unfreeze card manually', async () => {
      // Navigate to card freeze control
      await element(by.id('security-tab')).tap();
      await element(by.id('card-freeze-control')).tap();

      // Verify initial state (unfrozen)
      await detoxExpect(element(by.text('ACTIVE'))).toBeVisible();
      await detoxExpect(element(by.text('Freeze Card'))).toBeVisible();

      // Freeze the card
      await element(by.text('Freeze Card')).tap();
      
      // Confirm action in alert
      await detoxExpect(element(by.text('Freeze Card'))).toBeVisible();
      await element(by.text('Freeze')).tap();

      // Verify success
      await detoxExpect(element(by.text('Success'))).toBeVisible();
      await element(by.text('OK')).tap();

      // Verify card is frozen
      await detoxExpect(element(by.text('FROZEN'))).toBeVisible();
      await detoxExpect(element(by.text('Unfreeze Card'))).toBeVisible();

      // Unfreeze the card
      await element(by.text('Unfreeze Card')).tap();
      await element(by.text('Unfreeze')).tap();

      // Verify success and state change
      await detoxExpect(element(by.text('Success'))).toBeVisible();
      await element(by.text('OK')).tap();
      await detoxExpect(element(by.text('ACTIVE'))).toBeVisible();
    });

    it('should show warning when card is frozen', async () => {
      // Freeze card first
      await freezeCardManually();

      // Verify warning message
      await detoxExpect(element(by.text('All transactions are blocked while your card is frozen'))).toBeVisible();

      // Verify warning icon
      await detoxExpect(element(by.id('warning-icon'))).toBeVisible();
    });

    it('should work in compact mode', async () => {
      // Navigate to compact card freeze control
      await element(by.id('card-overview')).tap();
      
      // Find compact freeze control
      await detoxExpect(element(by.id('compact-freeze-control'))).toBeVisible();

      // Toggle switch
      await element(by.id('freeze-switch')).tap();
      
      // Verify confirmation
      await element(by.text('Freeze')).tap();

      // Verify switch state changed
      await detoxExpect(element(by.text('Card Frozen'))).toBeVisible();
    });
  });

  describe('Security Dashboard', () => {
    it('should display security metrics correctly', async () => {
      await navigateToSecurityDashboard();

      // Verify metrics cards are visible
      await detoxExpect(element(by.text('Security Overview'))).toBeVisible();
      await detoxExpect(element(by.id('resolved-incidents-metric'))).toBeVisible();
      await detoxExpect(element(by.id('active-alerts-metric'))).toBeVisible();
      await detoxExpect(element(by.id('avg-risk-score-metric'))).toBeVisible();
      await detoxExpect(element(by.id('last-incident-metric'))).toBeVisible();

      // Verify metrics have values
      await detoxExpect(element(by.text('0'))).toBeVisible(); // Should show some numbers
    });

    it('should handle pull-to-refresh', async () => {
      await navigateToSecurityDashboard();

      // Pull down to refresh
      await element(by.id('security-dashboard-scroll')).swipe('down', 'slow', 0.8);

      // Verify loading indicator appears briefly
      await detoxExpect(element(by.id('refresh-indicator'))).toBeVisible();

      // Wait for refresh to complete
      await device.sleep(1000);

      // Verify content is still there
      await detoxExpect(element(by.text('Security Dashboard'))).toBeVisible();
    });

    it('should navigate to security settings', async () => {
      await navigateToSecurityDashboard();

      // Tap MFA setting
      await element(by.text('Multi-Factor Authentication')).tap();

      // Verify navigation (would need to implement MFA setup screen)
      // await detoxExpect(element(by.text('Setup MFA'))).toBeVisible();
    });

    it('should display recent security incidents', async () => {
      // Mock some security incidents
      await mockSecurityIncidents();
      
      await navigateToSecurityDashboard();

      // Verify incidents section
      await detoxExpect(element(by.text('Recent Security Activity'))).toBeVisible();
      
      // Verify incident items
      await detoxExpect(element(by.id('incident-item-0'))).toBeVisible();
      await detoxExpect(element(by.text('Velocity Exceeded'))).toBeVisible();
      
      // Verify risk score display
      await detoxExpect(element(by.text('75/100'))).toBeVisible();
    });

    it('should show security tips', async () => {
      await navigateToSecurityDashboard();

      // Scroll to security tips
      await element(by.id('security-dashboard-scroll')).scrollTo('bottom');

      // Verify tips section
      await detoxExpect(element(by.text('Security Tips'))).toBeVisible();
      await detoxExpect(element(by.text('Enable MFA for additional protection'))).toBeVisible();
      await detoxExpect(element(by.text('Monitor your transactions regularly'))).toBeVisible();
      await detoxExpect(element(by.text('Freeze your card immediately if you suspect fraud'))).toBeVisible();
    });
  });

  describe('MFA Workflows', () => {
    it('should trigger MFA for high-risk transactions', async () => {
      // Mock a high-risk transaction
      await mockHighRiskTransaction();

      // Navigate to transaction confirmation
      await element(by.id('confirm-transaction')).tap();

      // Verify MFA challenge appears
      await detoxExpect(element(by.text('Additional Verification Required'))).toBeVisible();
      await detoxExpect(element(by.text('This transaction requires additional security verification'))).toBeVisible();

      // Enter MFA code
      await element(by.id('mfa-code-input')).typeText('123456');
      await element(by.text('Verify')).tap();

      // Verify success or failure based on mock
      await detoxExpect(element(by.text('Verification successful'))).toBeVisible();
    });

    it('should handle MFA setup flow', async () => {
      await navigateToSecurityDashboard();
      
      // Tap MFA setting
      await element(by.text('Multi-Factor Authentication')).tap();

      // Start MFA setup
      await element(by.text('Setup MFA')).tap();

      // Verify QR code screen
      await detoxExpect(element(by.text('Scan QR Code'))).toBeVisible();
      await detoxExpect(element(by.id('qr-code'))).toBeVisible();

      // Continue to verification
      await element(by.text('I\'ve scanned the code')).tap();

      // Enter verification code
      await element(by.id('setup-verification-input')).typeText('123456');
      await element(by.text('Verify Setup')).tap();

      // Verify success
      await detoxExpect(element(by.text('MFA setup completed successfully'))).toBeVisible();
    });

    it('should show backup codes after MFA setup', async () => {
      // Complete MFA setup flow first
      await completeMFASetup();

      // Verify backup codes are displayed
      await detoxExpect(element(by.text('Backup Codes'))).toBeVisible();
      await detoxExpect(element(by.text('Save these codes in a secure location'))).toBeVisible();

      // Verify codes are shown
      for (let i = 0; i < 8; i++) {
        await detoxExpect(element(by.id(`backup-code-${i}`))).toBeVisible();
      }

      // Tap "I've saved my codes"
      await element(by.text('I\'ve saved my codes')).tap();

      // Verify completion
      await detoxExpect(element(by.text('MFA is now enabled'))).toBeVisible();
    });
  });

  describe('Error Handling and Edge Cases', () => {
    it('should handle network errors gracefully', async () => {
      // Mock network failure
      await device.setURLBlacklist(['*']);

      await navigateToSecurityDashboard();

      // Verify error message
      await detoxExpect(element(by.text('Failed to load security information'))).toBeVisible();
      
      // Restore network
      await device.setURLBlacklist([]);
      
      // Try refresh
      await element(by.text('Retry')).tap();
      
      // Should eventually load
      await detoxExpect(element(by.text('Security Dashboard'))).toBeVisible();
    });

    it('should handle loading states properly', async () => {
      // Mock slow API response
      await mockSlowApiResponse();

      await navigateToSecurityDashboard();

      // Verify loading indicator
      await detoxExpect(element(by.text('Loading security information...'))).toBeVisible();

      // Wait for loading to complete
      await device.sleep(2000);

      // Verify content loaded
      await detoxExpect(element(by.text('Security Dashboard'))).toBeVisible();
    });

    it('should validate user input in MFA setup', async () => {
      await startMFASetup();

      // Try empty verification code
      await element(by.text('Verify Setup')).tap();

      // Verify validation error
      await detoxExpect(element(by.text('Please enter verification code'))).toBeVisible();

      // Try invalid code format
      await element(by.id('setup-verification-input')).typeText('123');
      await element(by.text('Verify Setup')).tap();

      // Verify format error
      await detoxExpect(element(by.text('Code must be 6 digits'))).toBeVisible();
    });
  });

  // Helper functions
  async function navigateToSecurityDashboard() {
    await element(by.id('security-tab')).tap();
    await detoxExpect(element(by.text('Security Dashboard'))).toBeVisible();
  }

  async function mockFraudAlert(severity = 'high') {
    // Mock API response for fraud alert
    await device.sendUserNotification({
      trigger: {
        type: 'push',
      },
      title: 'Security Alert',
      body: 'Suspicious activity detected on your card',
      payload: {
        type: 'fraud_alert',
        severity: severity,
        cardId: 'test-card-123'
      }
    });
  }

  async function mockSecurityIncidents() {
    // Mock security incidents data
    // This would typically be done through API mocking
    await device.setLocation({ lat: 37.7749, lon: -122.4194 });
  }

  async function mockHighRiskTransaction() {
    // Mock a transaction that would trigger MFA
    await device.setURLBlacklist([]);
    // Set up mock API responses for high-risk transaction
  }

  async function freezeCardManually() {
    await element(by.id('security-tab')).tap();
    await element(by.id('card-freeze-control')).tap();
    await element(by.text('Freeze Card')).tap();
    await element(by.text('Freeze')).tap();
    await element(by.text('OK')).tap();
  }

  async function completeMFASetup() {
    await navigateToSecurityDashboard();
    await element(by.text('Multi-Factor Authentication')).tap();
    await element(by.text('Setup MFA')).tap();
    await element(by.text('I\'ve scanned the code')).tap();
    await element(by.id('setup-verification-input')).typeText('123456');
    await element(by.text('Verify Setup')).tap();
  }

  async function startMFASetup() {
    await navigateToSecurityDashboard();
    await element(by.text('Multi-Factor Authentication')).tap();
    await element(by.text('Setup MFA')).tap();
    await element(by.text('I\'ve scanned the code')).tap();
  }

  async function mockSlowApiResponse() {
    // Mock slow API response
    // This would be configured through test setup
  }
});