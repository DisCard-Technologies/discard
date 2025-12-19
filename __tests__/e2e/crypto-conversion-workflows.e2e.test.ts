import { by, device, element, expect, waitFor } from 'detox';

describe('Crypto Conversion Workflows E2E', () => {
  beforeAll(async () => {
    await device.launchApp();
  });

  beforeEach(async () => {
    await device.reloadReactNative();
    
    // Login to get to the main app
    await element(by.id('email-input')).typeText('test@example.com');
    await element(by.id('password-input')).typeText('testpassword');
    await element(by.id('login-button')).tap();
    
    // Wait for main screen to load
    await waitFor(element(by.id('main-dashboard')))
      .toBeVisible()
      .withTimeout(10000);
    
    // Navigate to crypto conversion
    await element(by.id('crypto-tab')).tap();
    await element(by.id('conversion-section')).tap();
  });

  describe('Conversion Calculator Workflow', () => {
    it('should complete full conversion calculation flow', async () => {
      // Enter USD amount
      await element(by.id('usd-amount-input')).typeText('100');
      
      // Select cryptocurrency
      await element(by.id('crypto-selector')).tap();
      await element(by.text('BTC - Bitcoin')).tap();
      
      // Wait for calculation to complete
      await waitFor(element(by.id('conversion-result')))
        .toBeVisible()
        .withTimeout(5000);
      
      // Verify results are displayed
      await expect(element(by.id('crypto-amount-display'))).toBeVisible();
      await expect(element(by.id('exchange-rate-display'))).toBeVisible();
      await expect(element(by.id('fee-breakdown'))).toBeVisible();
      
      // Check fee breakdown
      await element(by.id('fee-breakdown')).tap();
      await expect(element(by.text('Network Fee:'))).toBeVisible();
      await expect(element(by.text('Conversion Fee:'))).toBeVisible();
      await expect(element(by.text('Platform Fee:'))).toBeVisible();
    });

    it('should handle custom slippage settings', async () => {
      // Enter amount
      await element(by.id('usd-amount-input')).typeText('250');
      
      // Open advanced settings
      await element(by.id('advanced-settings-toggle')).tap();
      
      // Set custom slippage
      await element(by.id('slippage-input')).clearText();
      await element(by.id('slippage-input')).typeText('1');
      
      // Select crypto
      await element(by.id('crypto-selector')).tap();
      await element(by.text('ETH - Ethereum')).tap();
      
      // Wait for calculation
      await waitFor(element(by.id('conversion-result')))
        .toBeVisible()
        .withTimeout(5000);
      
      // Verify slippage is applied
      await expect(element(by.text('Slippage: 1.0%'))).toBeVisible();
    });

    it('should create and manage conversion quotes', async () => {
      // Complete calculation first
      await element(by.id('usd-amount-input')).typeText('500');
      await element(by.id('crypto-selector')).tap();
      await element(by.text('BTC - Bitcoin')).tap();
      
      await waitFor(element(by.id('conversion-result')))
        .toBeVisible()
        .withTimeout(5000);
      
      // Create quote
      await element(by.id('create-quote-button')).tap();
      
      // Wait for quote confirmation
      await waitFor(element(by.id('quote-created-modal')))
        .toBeVisible()
        .withTimeout(3000);
      
      // Verify quote details
      await expect(element(by.id('quote-id'))).toBeVisible();
      await expect(element(by.id('quote-expiry'))).toBeVisible();
      
      // Dismiss modal
      await element(by.id('quote-modal-close')).tap();
      
      // Check quote is active
      await expect(element(by.id('active-quote-indicator'))).toBeVisible();
    });

    it('should validate input limits', async () => {
      // Test minimum amount
      await element(by.id('usd-amount-input')).typeText('0.50');
      await element(by.id('crypto-selector')).tap();
      
      // Should show error
      await expect(element(by.text('Minimum amount is $1.00'))).toBeVisible();
      
      // Test maximum amount
      await element(by.id('usd-amount-input')).clearText();
      await element(by.id('usd-amount-input')).typeText('15000');
      
      // Should show error
      await expect(element(by.text('Maximum amount is $10,000.00'))).toBeVisible();
      
      // Test valid amount
      await element(by.id('usd-amount-input')).clearText();
      await element(by.id('usd-amount-input')).typeText('100');
      
      // Error should disappear
      await waitFor(element(by.text('Minimum amount is $1.00')))
        .not.toBeVisible()
        .withTimeout(2000);
    });
  });

  describe('Rate Comparison Workflow', () => {
    it('should compare rates across cryptocurrencies', async () => {
      // Navigate to rate comparison
      await element(by.id('rate-comparison-tab')).tap();
      
      // Enter target amount
      await element(by.id('target-amount-input')).typeText('1000');
      
      // Trigger comparison
      await element(by.id('compare-rates-button')).tap();
      
      // Wait for comparison results
      await waitFor(element(by.id('comparison-results')))
        .toBeVisible()
        .withTimeout(10000);
      
      // Verify all major cryptocurrencies are compared
      await expect(element(by.id('comparison-card-BTC'))).toBeVisible();
      await expect(element(by.id('comparison-card-ETH'))).toBeVisible();
      await expect(element(by.id('comparison-card-USDT'))).toBeVisible();
      await expect(element(by.id('comparison-card-USDC'))).toBeVisible();
      
      // Check optimal currency is highlighted
      await expect(element(by.id('optimal-badge'))).toBeVisible();
      
      // Verify savings information
      await expect(element(by.text(/Save.*vs worst option/))).toBeVisible();
    });

    it('should allow selection of optimal currency', async () => {
      // Navigate to comparison and run comparison
      await element(by.id('rate-comparison-tab')).tap();
      await element(by.id('target-amount-input')).typeText('500');
      await element(by.id('compare-rates-button')).tap();
      
      await waitFor(element(by.id('comparison-results')))
        .toBeVisible()
        .withTimeout(10000);
      
      // Select optimal currency
      await element(by.id('comparison-card-BTC')).tap();
      await element(by.id('select-optimal-button')).tap();
      
      // Should navigate back to conversion calculator with selected crypto
      await waitFor(element(by.id('conversion-calculator')))
        .toBeVisible()
        .withTimeout(3000);
      
      // Verify BTC is pre-selected
      await expect(element(by.text('BTC - Bitcoin'))).toBeVisible();
      await expect(element(by.id('usd-amount-input'))).toHaveText('$500.00');
    });

    it('should show detailed fee breakdown', async () => {
      // Run comparison
      await element(by.id('rate-comparison-tab')).tap();
      await element(by.id('target-amount-input')).typeText('750');
      await element(by.id('compare-rates-button')).tap();
      
      await waitFor(element(by.id('comparison-results')))
        .toBeVisible()
        .withTimeout(10000);
      
      // Expand fee breakdown for BTC
      await element(by.id('fee-breakdown-BTC')).tap();
      
      // Verify detailed fees
      await expect(element(by.text('Network Fee:'))).toBeVisible();
      await expect(element(by.text('Conversion Fee:'))).toBeVisible();
      await expect(element(by.text('Platform Fee:'))).toBeVisible();
      await expect(element(by.text('Total Fee:'))).toBeVisible();
    });
  });

  describe('Real-Time Rate Updates', () => {
    it('should display real-time rate updates', async () => {
      // Navigate to rates view
      await element(by.id('live-rates-tab')).tap();
      
      // Verify WebSocket connection indicator
      await waitFor(element(by.id('websocket-connected')))
        .toBeVisible()
        .withTimeout(5000);
      
      // Verify rate displays
      await expect(element(by.id('rate-display-BTC'))).toBeVisible();
      await expect(element(by.id('rate-display-ETH'))).toBeVisible();
      
      // Check last update timestamp
      await expect(element(by.id('last-update-time'))).toBeVisible();
      
      // Manual refresh
      await element(by.id('refresh-rates-button')).tap();
      
      // Verify update
      await waitFor(element(by.id('refresh-indicator')))
        .toBeVisible()
        .withTimeout(3000);
    });

    it('should handle connection loss gracefully', async () => {
      // Navigate to rates view
      await element(by.id('live-rates-tab')).tap();
      
      // Wait for connection
      await waitFor(element(by.id('websocket-connected')))
        .toBeVisible()
        .withTimeout(5000);
      
      // Simulate network disconnection (if supported)
      await device.setNetworkState('offline');
      
      // Should show disconnected state
      await waitFor(element(by.id('websocket-disconnected')))
        .toBeVisible()
        .withTimeout(5000);
      
      // Re-enable network
      await device.setNetworkState('online');
      
      // Should reconnect
      await waitFor(element(by.id('websocket-connected')))
        .toBeVisible()
        .withTimeout(10000);
    });
  });

  describe('Historical Rate Charts', () => {
    it('should display historical rate charts', async () => {
      // Navigate to historical charts
      await element(by.id('historical-charts-tab')).tap();
      
      // Select cryptocurrency
      await element(by.id('chart-crypto-selector')).tap();
      await element(by.text('BTC - Bitcoin')).tap();
      
      // Wait for chart to load
      await waitFor(element(by.id('historical-chart')))
        .toBeVisible()
        .withTimeout(10000);
      
      // Verify timeframe controls
      await expect(element(by.id('timeframe-1h'))).toBeVisible();
      await expect(element(by.id('timeframe-24h'))).toBeVisible();
      await expect(element(by.id('timeframe-7d'))).toBeVisible();
    });

    it('should switch between different timeframes', async () => {
      // Navigate and load chart
      await element(by.id('historical-charts-tab')).tap();
      await element(by.id('chart-crypto-selector')).tap();
      await element(by.text('ETH - Ethereum')).tap();
      
      await waitFor(element(by.id('historical-chart')))
        .toBeVisible()
        .withTimeout(10000);
      
      // Switch to 7-day view
      await element(by.id('timeframe-7d')).tap();
      
      // Wait for chart update
      await waitFor(element(by.id('chart-loading')))
        .not.toBeVisible()
        .withTimeout(5000);
      
      // Verify timeframe is selected
      await expect(element(by.id('timeframe-7d'))).toHaveValue('selected');
    });

    it('should show interactive chart data points', async () => {
      // Load chart
      await element(by.id('historical-charts-tab')).tap();
      await element(by.id('chart-crypto-selector')).tap();
      await element(by.text('BTC - Bitcoin')).tap();
      
      await waitFor(element(by.id('historical-chart')))
        .toBeVisible()
        .withTimeout(10000);
      
      // Tap on chart to show data point
      await element(by.id('historical-chart')).tap();
      
      // Verify data point tooltip
      await expect(element(by.id('chart-tooltip'))).toBeVisible();
      await expect(element(by.id('tooltip-price'))).toBeVisible();
      await expect(element(by.id('tooltip-timestamp'))).toBeVisible();
    });
  });

  describe('Error Handling', () => {
    it('should handle API errors gracefully', async () => {
      // Force network error by going offline
      await device.setNetworkState('offline');
      
      // Try to calculate conversion
      await element(by.id('usd-amount-input')).typeText('100');
      await element(by.id('crypto-selector')).tap();
      await element(by.text('BTC - Bitcoin')).tap();
      
      // Should show error message
      await waitFor(element(by.text(/network error|connection failed/i)))
        .toBeVisible()
        .withTimeout(10000);
      
      // Restore network
      await device.setNetworkState('online');
      
      // Retry should work
      await element(by.id('retry-button')).tap();
      
      await waitFor(element(by.id('conversion-result')))
        .toBeVisible()
        .withTimeout(10000);
    });

    it('should handle rate limiting errors', async () => {
      // Make many rapid requests to trigger rate limiting
      for (let i = 0; i < 10; i++) {
        await element(by.id('refresh-rates-button')).tap();
        await device.sleep(100);
      }
      
      // Should eventually show rate limit error
      await waitFor(element(by.text(/rate limit|too many requests/i)))
        .toBeVisible()
        .withTimeout(30000);
      
      // Should show retry after time
      await expect(element(by.text(/try again in/i))).toBeVisible();
    });
  });

  describe('Accessibility', () => {
    it('should be accessible with screen reader', async () => {
      // Enable accessibility
      await device.setAccessibilityState(true);
      
      // Navigate through conversion calculator with accessibility
      await element(by.id('usd-amount-input')).tap();
      
      // Verify accessibility labels
      await expect(element(by.label('Enter USD amount for conversion'))).toBeVisible();
      await expect(element(by.label('Select cryptocurrency'))).toBeVisible();
      
      // Complete conversion with accessibility
      await element(by.id('usd-amount-input')).typeText('100');
      await element(by.label('Select cryptocurrency')).tap();
      await element(by.label('Bitcoin')).tap();
      
      // Verify result accessibility
      await waitFor(element(by.label(/conversion result/i)))
        .toBeVisible()
        .withTimeout(5000);
    });
  });

  afterEach(async () => {
    // Reset network state
    await device.setNetworkState('online');
  });

  afterAll(async () => {
    await device.terminateApp();
  });
});