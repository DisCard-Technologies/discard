import { by, device, element, expect as detoxExpect, waitFor } from 'detox';

describe('Crypto Wallet Workflows E2E Tests', () => {
  beforeAll(async () => {
    await device.launchApp();
  });

  beforeEach(async () => {
    await device.reloadReactNative();
    
    // Navigate to crypto wallet section
    await element(by.id('main-menu')).tap();
    await element(by.id('crypto-wallets-menu-item')).tap();
  });

  describe('WalletConnect Integration', () => {
    it('should complete WalletConnect flow successfully', async () => {
      // Tap connect wallet button
      await element(by.id('connect-wallet-button')).tap();
      
      // Select WalletConnect option
      await element(by.id('walletconnect-option')).tap();
      
      // Should show QR code modal
      await waitFor(element(by.id('qr-code-modal')))
        .toBeVisible()
        .withTimeout(5000);
      
      // Mock successful wallet connection
      // (In a real test environment, you'd use a test wallet or mock the connection)
      await element(by.id('mock-wallet-connect-success')).tap();
      
      // Should show connected wallet
      await waitFor(element(by.id('connected-wallet-item')))
        .toBeVisible()
        .withTimeout(10000);
      
      // Verify wallet details are displayed
      await detoxExpect(element(by.id('wallet-name'))).toBeVisible();
      await detoxExpect(element(by.id('wallet-address'))).toBeVisible();
      await detoxExpect(element(by.id('connection-status'))).toHaveText('Connected');
    });

    it('should handle QR code scanning', async () => {
      await element(by.id('connect-wallet-button')).tap();
      await element(by.id('walletconnect-option')).tap();
      
      // Should show QR scanner
      await waitFor(element(by.id('qr-scanner')))
        .toBeVisible()
        .withTimeout(5000);
      
      // Mock QR code scan
      await device.sendUserNotification({
        trigger: {
          type: 'push',
        },
        title: 'QR Code Scanned',
        body: 'wc:test-uri@1?bridge=test&key=test',
      });
      
      // Should process the scanned URI
      await waitFor(element(by.id('connecting-indicator')))
        .toBeVisible()
        .withTimeout(3000);
      
      // Mock successful connection
      await element(by.id('mock-approve-connection')).tap();
      
      await waitFor(element(by.id('connected-wallet-item')))
        .toBeVisible()
        .withTimeout(10000);
    });

    it('should handle connection rejection', async () => {
      await element(by.id('connect-wallet-button')).tap();
      await element(by.id('walletconnect-option')).tap();
      
      await waitFor(element(by.id('qr-code-modal')))
        .toBeVisible()
        .withTimeout(5000);
      
      // Mock connection rejection
      await element(by.id('mock-wallet-reject')).tap();
      
      // Should show error message
      await waitFor(element(by.id('connection-error')))
        .toBeVisible()
        .withTimeout(5000);
      
      await detoxExpect(element(by.id('error-message')))
        .toHaveText('Connection rejected by wallet');
      
      // Should allow retry
      await detoxExpect(element(by.id('retry-button'))).toBeVisible();
    });

    it('should disconnect wallet successfully', async () => {
      // First connect a wallet
      await element(by.id('connect-wallet-button')).tap();
      await element(by.id('walletconnect-option')).tap();
      await element(by.id('mock-wallet-connect-success')).tap();
      
      await waitFor(element(by.id('connected-wallet-item')))
        .toBeVisible()
        .withTimeout(10000);
      
      // Tap on wallet to show options
      await element(by.id('connected-wallet-item')).tap();
      
      // Tap disconnect button
      await element(by.id('disconnect-wallet-button')).tap();
      
      // Confirm disconnection
      await element(by.text('Disconnect')).tap();
      
      // Should show disconnected state
      await waitFor(element(by.id('connect-wallet-button')))
        .toBeVisible()
        .withTimeout(5000);
      
      await detoxExpect(element(by.id('connected-wallet-item'))).not.toBeVisible();
    });
  });

  describe('MetaMask Integration', () => {
    it('should detect MetaMask availability', async () => {
      await element(by.id('connect-wallet-button')).tap();
      
      // Should show MetaMask option if available
      await detoxExpect(element(by.id('metamask-option'))).toBeVisible();
      
      // Check availability status
      await element(by.id('metamask-option')).tap();
      
      await waitFor(element(by.id('metamask-status')))
        .toBeVisible()
        .withTimeout(3000);
    });

    it('should handle MetaMask connection flow', async () => {
      await element(by.id('connect-wallet-button')).tap();
      await element(by.id('metamask-option')).tap();
      
      // Should show MetaMask connection screen
      await waitFor(element(by.id('metamask-connect-screen')))
        .toBeVisible()
        .withTimeout(5000);
      
      // Mock MetaMask connection
      await element(by.id('mock-metamask-connect')).tap();
      
      // Should show connected state
      await waitFor(element(by.id('metamask-connected')))
        .toBeVisible()
        .withTimeout(10000);
      
      await detoxExpect(element(by.id('connected-account'))).toBeVisible();
      await detoxExpect(element(by.id('current-network'))).toBeVisible();
    });

    it('should handle network switching', async () => {
      // Connect MetaMask first
      await element(by.id('connect-wallet-button')).tap();
      await element(by.id('metamask-option')).tap();
      await element(by.id('mock-metamask-connect')).tap();
      
      await waitFor(element(by.id('metamask-connected')))
        .toBeVisible()
        .withTimeout(10000);
      
      // Tap network selector
      await element(by.id('network-selector')).tap();
      
      // Select different network
      await element(by.text('Polygon')).tap();
      
      // Should show network switch request
      await waitFor(element(by.id('network-switch-request')))
        .toBeVisible()
        .withTimeout(5000);
      
      // Mock network switch approval
      await element(by.id('approve-network-switch')).tap();
      
      // Should show new network
      await waitFor(element(by.text('Polygon')))
        .toBeVisible()
        .withTimeout(5000);
    });
  });

  describe('Bitcoin Wallet Integration', () => {
    it('should connect Bitcoin wallet with address validation', async () => {
      await element(by.id('connect-wallet-button')).tap();
      await element(by.id('bitcoin-option')).tap();
      
      // Should show Bitcoin address input
      await waitFor(element(by.id('bitcoin-address-input')))
        .toBeVisible()
        .withTimeout(5000);
      
      // Enter valid Bitcoin address
      await element(by.id('bitcoin-address-input'))
        .typeText('1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa');
      
      // Enter wallet name
      await element(by.id('wallet-name-input'))
        .typeText('My Bitcoin Wallet');
      
      // Tap connect button
      await element(by.id('connect-bitcoin-button')).tap();
      
      // Should validate and connect
      await waitFor(element(by.id('bitcoin-wallet-connected')))
        .toBeVisible()
        .withTimeout(10000);
      
      await detoxExpect(element(by.id('bitcoin-address')))
        .toHaveText('1A1z...fNa');
    });

    it('should handle invalid Bitcoin address', async () => {
      await element(by.id('connect-wallet-button')).tap();
      await element(by.id('bitcoin-option')).tap();
      
      // Enter invalid Bitcoin address
      await element(by.id('bitcoin-address-input'))
        .typeText('invalid-bitcoin-address');
      
      await element(by.id('connect-bitcoin-button')).tap();
      
      // Should show validation error
      await waitFor(element(by.id('address-validation-error')))
        .toBeVisible()
        .withTimeout(3000);
      
      await detoxExpect(element(by.id('error-message')))
        .toHaveText('Invalid Bitcoin address');
    });

    it('should generate QR code for Bitcoin address', async () => {
      // Connect Bitcoin wallet first
      await element(by.id('connect-wallet-button')).tap();
      await element(by.id('bitcoin-option')).tap();
      await element(by.id('bitcoin-address-input'))
        .typeText('1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa');
      await element(by.id('connect-bitcoin-button')).tap();
      
      await waitFor(element(by.id('bitcoin-wallet-connected')))
        .toBeVisible()
        .withTimeout(10000);
      
      // Tap QR code button
      await element(by.id('generate-qr-button')).tap();
      
      // Should show QR code modal
      await waitFor(element(by.id('qr-code-modal')))
        .toBeVisible()
        .withTimeout(5000);
      
      await detoxExpect(element(by.id('bitcoin-qr-code'))).toBeVisible();
      await detoxExpect(element(by.id('bitcoin-address-text'))).toBeVisible();
    });
  });

  describe('Wallet Balance Display', () => {
    beforeEach(async () => {
      // Connect a test wallet first
      await element(by.id('connect-wallet-button')).tap();
      await element(by.id('walletconnect-option')).tap();
      await element(by.id('mock-wallet-connect-success')).tap();
      
      await waitFor(element(by.id('connected-wallet-item')))
        .toBeVisible()
        .withTimeout(10000);
    });

    it('should display wallet balances correctly', async () => {
      // Navigate to balance view
      await element(by.id('connected-wallet-item')).tap();
      await element(by.id('view-balance-button')).tap();
      
      // Should show balance screen
      await waitFor(element(by.id('balance-display')))
        .toBeVisible()
        .withTimeout(5000);
      
      // Should show individual currency balances
      await detoxExpect(element(by.id('eth-balance'))).toBeVisible();
      await detoxExpect(element(by.id('total-usd-value'))).toBeVisible();
      
      // Check balance formatting
      await detoxExpect(element(by.id('eth-balance')))
        .toHaveText('2.50 ETH');
      await detoxExpect(element(by.id('total-usd-value')))
        .toHaveText('$7,500.00');
    });

    it('should support pull-to-refresh for balances', async () => {
      await element(by.id('connected-wallet-item')).tap();
      await element(by.id('view-balance-button')).tap();
      
      await waitFor(element(by.id('balance-display')))
        .toBeVisible()
        .withTimeout(5000);
      
      // Pull to refresh
      await element(by.id('balance-scroll-view')).swipe('down');
      
      // Should show loading indicator
      await waitFor(element(by.id('refresh-loading')))
        .toBeVisible()
        .withTimeout(3000);
      
      // Should update balances
      await waitFor(element(by.id('refresh-loading')))
        .not.toBeVisible()
        .withTimeout(10000);
    });

    it('should handle balance refresh errors', async () => {
      await element(by.id('connected-wallet-item')).tap();
      await element(by.id('view-balance-button')).tap();
      
      await waitFor(element(by.id('balance-display')))
        .toBeVisible()
        .withTimeout(5000);
      
      // Mock network error
      await device.sendUserNotification({
        trigger: { type: 'push' },
        title: 'Mock Network Error',
        body: 'balance-refresh-error'
      });
      
      // Pull to refresh
      await element(by.id('balance-scroll-view')).swipe('down');
      
      // Should show error message
      await waitFor(element(by.id('balance-error')))
        .toBeVisible()
        .withTimeout(5000);
      
      await detoxExpect(element(by.id('retry-balance-button'))).toBeVisible();
    });

    it('should toggle between individual and total balance view', async () => {
      await element(by.id('connected-wallet-item')).tap();
      await element(by.id('view-balance-button')).tap();
      
      await waitFor(element(by.id('balance-display')))
        .toBeVisible()
        .withTimeout(5000);
      
      // Should show individual balances by default
      await detoxExpect(element(by.id('eth-balance'))).toBeVisible();
      await detoxExpect(element(by.id('usdt-balance'))).toBeVisible();
      
      // Tap toggle button
      await element(by.id('balance-view-toggle')).tap();
      
      // Should show only total
      await detoxExpect(element(by.id('total-portfolio-value'))).toBeVisible();
      await detoxExpect(element(by.id('eth-balance'))).not.toBeVisible();
    });
  });

  describe('Multi-Wallet Management', () => {
    it('should handle multiple connected wallets', async () => {
      // Connect first wallet (WalletConnect)
      await element(by.id('connect-wallet-button')).tap();
      await element(by.id('walletconnect-option')).tap();
      await element(by.id('mock-wallet-connect-success')).tap();
      
      await waitFor(element(by.id('connected-wallet-item')))
        .toBeVisible()
        .withTimeout(10000);
      
      // Connect second wallet (Bitcoin)
      await element(by.id('add-wallet-button')).tap();
      await element(by.id('bitcoin-option')).tap();
      await element(by.id('bitcoin-address-input'))
        .typeText('1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa');
      await element(by.id('connect-bitcoin-button')).tap();
      
      await waitFor(element(by.id('bitcoin-wallet-connected')))
        .toBeVisible()
        .withTimeout(10000);
      
      // Should show both wallets in list
      await element(by.id('wallet-list-tab')).tap();
      
      await detoxExpect(element(by.id('wallet-list'))).toBeVisible();
      await detoxExpect(element(by.id('walletconnect-wallet-item'))).toBeVisible();
      await detoxExpect(element(by.id('bitcoin-wallet-item'))).toBeVisible();
    });

    it('should show portfolio overview with multiple wallets', async () => {
      // Connect multiple wallets first
      await element(by.id('connect-wallet-button')).tap();
      await element(by.id('walletconnect-option')).tap();
      await element(by.id('mock-wallet-connect-success')).tap();
      
      await waitFor(element(by.id('connected-wallet-item')))
        .toBeVisible()
        .withTimeout(10000);
      
      await element(by.id('add-wallet-button')).tap();
      await element(by.id('bitcoin-option')).tap();
      await element(by.id('bitcoin-address-input'))
        .typeText('1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa');
      await element(by.id('connect-bitcoin-button')).tap();
      
      // Navigate to portfolio view
      await element(by.id('portfolio-tab')).tap();
      
      // Should show combined portfolio value
      await waitFor(element(by.id('portfolio-overview')))
        .toBeVisible()
        .withTimeout(5000);
      
      await detoxExpect(element(by.id('total-portfolio-value'))).toBeVisible();
      await detoxExpect(element(by.id('wallet-count'))).toHaveText('2 wallets');
      await detoxExpect(element(by.id('asset-breakdown'))).toBeVisible();
    });

    it('should handle wallet switching', async () => {
      // Connect multiple wallets
      await element(by.id('connect-wallet-button')).tap();
      await element(by.id('walletconnect-option')).tap();
      await element(by.id('mock-wallet-connect-success')).tap();
      
      await waitFor(element(by.id('connected-wallet-item')))
        .toBeVisible()
        .withTimeout(10000);
      
      await element(by.id('add-wallet-button')).tap();
      await element(by.id('metamask-option')).tap();
      await element(by.id('mock-metamask-connect')).tap();
      
      // Switch between wallets
      await element(by.id('wallet-selector')).tap();
      await element(by.text('MetaMask Wallet')).tap();
      
      // Should show MetaMask wallet details
      await waitFor(element(by.id('active-wallet-metamask')))
        .toBeVisible()
        .withTimeout(5000);
      
      // Switch back to WalletConnect
      await element(by.id('wallet-selector')).tap();
      await element(by.text('WalletConnect Wallet')).tap();
      
      await waitFor(element(by.id('active-wallet-walletconnect')))
        .toBeVisible()
        .withTimeout(5000);
    });
  });

  describe('Error Scenarios and Recovery', () => {
    it('should handle network connectivity issues', async () => {
      // Simulate network disconnection
      await device.sendUserNotification({
        trigger: { type: 'push' },
        title: 'Mock Network Disconnection',
        body: 'network-offline'
      });
      
      await element(by.id('connect-wallet-button')).tap();
      await element(by.id('walletconnect-option')).tap();
      
      // Should show offline error
      await waitFor(element(by.id('network-error')))
        .toBeVisible()
        .withTimeout(5000);
      
      await detoxExpect(element(by.id('offline-message')))
        .toHaveText('No internet connection');
      
      // Simulate network reconnection
      await device.sendUserNotification({
        trigger: { type: 'push' },
        title: 'Mock Network Reconnection',
        body: 'network-online'
      });
      
      // Should allow retry
      await element(by.id('retry-connection-button')).tap();
      
      await waitFor(element(by.id('qr-code-modal')))
        .toBeVisible()
        .withTimeout(5000);
    });

    it('should handle wallet session expiration', async () => {
      // Connect wallet
      await element(by.id('connect-wallet-button')).tap();
      await element(by.id('walletconnect-option')).tap();
      await element(by.id('mock-wallet-connect-success')).tap();
      
      await waitFor(element(by.id('connected-wallet-item')))
        .toBeVisible()
        .withTimeout(10000);
      
      // Mock session expiration
      await device.sendUserNotification({
        trigger: { type: 'push' },
        title: 'Mock Session Expiry',
        body: 'session-expired'
      });
      
      // Should show session expired message
      await waitFor(element(by.id('session-expired-alert')))
        .toBeVisible()
        .withTimeout(5000);
      
      // Should offer reconnection
      await element(by.id('reconnect-wallet-button')).tap();
      
      await waitFor(element(by.id('qr-code-modal')))
        .toBeVisible()
        .withTimeout(5000);
    });

    it('should handle app backgrounding and foregrounding', async () => {
      // Connect wallet
      await element(by.id('connect-wallet-button')).tap();
      await element(by.id('walletconnect-option')).tap();
      await element(by.id('mock-wallet-connect-success')).tap();
      
      await waitFor(element(by.id('connected-wallet-item')))
        .toBeVisible()
        .withTimeout(10000);
      
      // Background the app
      await device.sendToHome();
      await device.launchApp({ newInstance: false });
      
      // Should maintain wallet connection
      await waitFor(element(by.id('connected-wallet-item')))
        .toBeVisible()
        .withTimeout(5000);
      
      // Should refresh balances
      await detoxExpect(element(by.id('balance-refresh-indicator'))).toBeVisible();
    });
  });

  describe('Security and Privacy', () => {
    it('should handle sensitive data appropriately', async () => {
      await element(by.id('connect-wallet-button')).tap();
      await element(by.id('walletconnect-option')).tap();
      await element(by.id('mock-wallet-connect-success')).tap();
      
      await waitFor(element(by.id('connected-wallet-item')))
        .toBeVisible()
        .withTimeout(10000);
      
      // Check that full address is not displayed by default
      await detoxExpect(element(by.id('truncated-address'))).toBeVisible();
      await detoxExpect(element(by.id('full-address'))).not.toBeVisible();
      
      // Tap to reveal full address
      await element(by.id('reveal-address-button')).tap();
      
      await waitFor(element(by.id('full-address')))
        .toBeVisible()
        .withTimeout(3000);
    });

    it('should handle app lock and unlock', async () => {
      // Enable app lock (mock)
      await element(by.id('settings-menu')).tap();
      await element(by.id('security-settings')).tap();
      await element(by.id('enable-app-lock')).tap();
      
      // Connect wallet
      await element(by.id('back-button')).tap();
      await element(by.id('back-button')).tap();
      await element(by.id('connect-wallet-button')).tap();
      await element(by.id('walletconnect-option')).tap();
      await element(by.id('mock-wallet-connect-success')).tap();
      
      // Background and foreground app to trigger lock
      await device.sendToHome();
      await device.launchApp({ newInstance: false });
      
      // Should show unlock screen
      await waitFor(element(by.id('app-lock-screen')))
        .toBeVisible()
        .withTimeout(5000);
      
      // Mock unlock
      await element(by.id('mock-biometric-unlock')).tap();
      
      // Should show wallet screen
      await waitFor(element(by.id('connected-wallet-item')))
        .toBeVisible()
        .withTimeout(5000);
    });
  });
});