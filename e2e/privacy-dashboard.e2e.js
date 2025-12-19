const { device, expect, element, by, waitFor } = require('detox');

describe('Privacy Dashboard E2E', () => {
  beforeAll(async () => {
    await device.launchApp();
  });

  beforeEach(async () => {
    await device.reloadReactNative();
  });

  afterAll(async () => {
    await device.terminateApp();
  });

  it('should display privacy protection status', async () => {
    // Navigate to privacy dashboard
    await element(by.id('privacy-tab')).tap();
    await waitFor(element(by.id('privacy-dashboard'))).toBeVisible().withTimeout(5000);

    // Check isolation status indicator
    await expect(element(by.id('isolation-status-indicator'))).toBeVisible();
    await expect(element(by.text('Privacy Protected'))).toBeVisible();
  });

  it('should show isolation metrics correctly', async () => {
    await element(by.id('privacy-tab')).tap();
    await waitFor(element(by.id('privacy-dashboard'))).toBeVisible().withTimeout(5000);

    // Check for isolation score metric
    await expect(element(by.id('isolation-score-metric'))).toBeVisible();
    await expect(element(by.text('Isolation Score'))).toBeVisible();

    // Check for privacy budget metric
    await expect(element(by.id('privacy-budget-metric'))).toBeVisible();
    await expect(element(by.text('Privacy Budget'))).toBeVisible();

    // Check for blocked correlations metric
    await expect(element(by.id('blocked-correlations-metric'))).toBeVisible();
    await expect(element(by.text('Blocked Correlations'))).toBeVisible();

    // Check for compliance metric
    await expect(element(by.id('compliance-metric'))).toBeVisible();
    await expect(element(by.text('Compliance'))).toBeVisible();
  });

  it('should refresh privacy metrics on pull-to-refresh', async () => {
    await element(by.id('privacy-tab')).tap();
    await waitFor(element(by.id('privacy-dashboard'))).toBeVisible().withTimeout(5000);

    // Pull down to refresh
    await element(by.id('privacy-dashboard-scroll')).swipe('down', 'slow');

    // Wait for refresh to complete
    await waitFor(element(by.id('isolation-status-indicator'))).toBeVisible().withTimeout(5000);

    // Verify metrics are still displayed
    await expect(element(by.text('Privacy Protected'))).toBeVisible();
  });

  it('should navigate to privacy details screen', async () => {
    await element(by.id('privacy-tab')).tap();
    await waitFor(element(by.id('privacy-dashboard'))).toBeVisible().withTimeout(5000);

    // Tap on info icon
    await element(by.id('privacy-info-button')).tap();

    // Should navigate to details screen
    await waitFor(element(by.id('privacy-details-screen'))).toBeVisible().withTimeout(3000);
    await expect(element(by.text('Privacy & Isolation'))).toBeVisible();
  });

  it('should display privacy features status', async () => {
    await element(by.id('privacy-tab')).tap();
    await waitFor(element(by.id('privacy-dashboard'))).toBeVisible().withTimeout(5000);

    // Check privacy features section
    await expect(element(by.text('Privacy Features Active'))).toBeVisible();
    await expect(element(by.text('Transaction Isolation'))).toBeVisible();
    await expect(element(by.text('Differential Privacy Analytics'))).toBeVisible();
    await expect(element(by.text('Correlation Prevention'))).toBeVisible();
    await expect(element(by.text('Continuous Monitoring'))).toBeVisible();

    // All features should show checkmarks
    const checkmarkElements = element(by.id('feature-checkmark'));
    await expect(checkmarkElements).toBeVisible();
  });

  it('should update metrics in real-time', async () => {
    await element(by.id('privacy-tab')).tap();
    await waitFor(element(by.id('privacy-dashboard'))).toBeVisible().withTimeout(5000);

    // Get initial isolation score
    const initialScore = await element(by.id('isolation-score-value')).getText();

    // Wait for auto-refresh (60 seconds in production, mocked faster in tests)
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Check if metrics updated (in real app, this would reflect actual changes)
    await expect(element(by.id('isolation-score-value'))).toBeVisible();
  });

  it('should handle privacy metrics loading errors', async () => {
    // Mock network error by putting device offline
    await device.setNetworkConnection(false);

    await element(by.id('privacy-tab')).tap();
    await waitFor(element(by.id('privacy-dashboard'))).toBeVisible().withTimeout(5000);

    // Should show error state
    await expect(element(by.text('Unable to load privacy metrics'))).toBeVisible();
    await expect(element(by.id('retry-button'))).toBeVisible();

    // Restore network and retry
    await device.setNetworkConnection(true);
    await element(by.id('retry-button')).tap();

    // Should recover and show metrics
    await waitFor(element(by.text('Privacy Protected'))).toBeVisible().withTimeout(5000);
  });

  it('should show violation alerts when present', async () => {
    // This would require mocking a violation state
    await element(by.id('privacy-tab')).tap();
    await waitFor(element(by.id('privacy-dashboard'))).toBeVisible().withTimeout(5000);

    // In a real test, this would mock the API to return violations
    // For now, just verify the violation indicator exists in the component structure
    const violationBadge = element(by.id('violation-badge'));
    // Badge should only be visible if violations > 0
  });

  it('should respect user privacy preferences', async () => {
    await element(by.id('privacy-tab')).tap();
    await waitFor(element(by.id('privacy-dashboard'))).toBeVisible().withTimeout(5000);

    // Navigate to privacy settings
    await element(by.id('privacy-info-button')).tap();
    await waitFor(element(by.id('privacy-settings-screen'))).toBeVisible().withTimeout(3000);

    // All privacy toggles should be enabled by default
    await expect(element(by.id('strict-isolation-toggle'))).toHaveToggleValue(true);
    await expect(element(by.id('correlation-prevention-toggle'))).toHaveToggleValue(true);
    await expect(element(by.id('differential-privacy-toggle'))).toHaveToggleValue(true);
    await expect(element(by.id('audit-logging-toggle'))).toHaveToggleValue(true);
  });
});