/**
 * Example test demonstrating factory usage
 * This shows how factories simplify test setup and reduce boilerplate
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import { 
  CryptoWalletFactory, 
  TransactionFactory, 
  UserFactory, 
  SessionFactory,
  SupabaseMockFactory,
  SupabaseMockPatterns
} from '../factories';

describe('Factory Usage Examples', () => {
  describe('CryptoWalletFactory', () => {
    it('should create default wallet with minimal setup', () => {
      const wallet = CryptoWalletFactory.create();
      
      expect(wallet).toHaveProperty('walletId');
      expect(wallet).toHaveProperty('walletType', 'metamask');
      expect(wallet).toHaveProperty('connectionStatus', 'connected');
      expect(wallet.supportedCurrencies).toContain('ETH');
    });

    it('should create Bitcoin wallet with specific overrides', () => {
      const wallet = CryptoWalletFactory.createBitcoinWallet({
        walletName: 'My Bitcoin Wallet'
      });
      
      expect(wallet.walletType).toBe('bitcoin');
      expect(wallet.walletName).toBe('My Bitcoin Wallet');
      expect(wallet.supportedCurrencies).toEqual(['BTC']);
      expect(wallet.permissions).toEqual(['balance', 'send']);
    });

    it('should create multiple wallets with different configurations', () => {
      const wallets = [
        CryptoWalletFactory.createMetamaskWallet({ walletName: 'MetaMask Wallet' }),
        CryptoWalletFactory.createBitcoinWallet({ walletName: 'Bitcoin Wallet' }),
        CryptoWalletFactory.createWalletConnectWallet({ walletName: 'WalletConnect' })
      ];
      
      expect(wallets).toHaveLength(3);
      expect(wallets[0].walletType).toBe('metamask');
      expect(wallets[1].walletType).toBe('bitcoin');
      expect(wallets[2].walletType).toBe('walletconnect');
    });
  });

  describe('TransactionFactory', () => {
    it('should create default transaction', () => {
      const tx = TransactionFactory.create();
      
      expect(tx).toHaveProperty('transactionId');
      expect(tx).toHaveProperty('status', 'confirmed');
      expect(tx).toHaveProperty('cryptoType', 'ETH');
      expect(tx.cryptoAmount).toBe('1.0');
    });

    it('should create specialized transaction types', () => {
      const ethTx = TransactionFactory.createEthereumTransaction({
        cryptoAmount: '0.5'
      });

      const btcTx = TransactionFactory.createBitcoinTransaction({
        cryptoAmount: '0.001',
        feeRate: 15
      });

      const usdtTx = TransactionFactory.createUSDTTransaction({
        cryptoAmount: '100.0'
      });
      
      expect(ethTx.cryptoType).toBe('ETH');
      expect(btcTx.cryptoType).toBe('BTC');
      expect(btcTx.feeRate).toBe(15);
      expect(usdtTx.cryptoType).toBe('USDT');
      expect(usdtTx.cryptoAmount).toBe('100.0');
    });

    it('should create transaction history', () => {
      const fundingContext = 'card-123';
      const history = TransactionFactory.createTransactionHistory(fundingContext, 10);
      
      expect(history).toHaveLength(10);
      expect(history.every(tx => tx.fundingContext === fundingContext)).toBe(true);
      
      // Should have variety in transaction properties
      const cryptoTypes = history.map(tx => tx.cryptoType);
      const statuses = history.map(tx => tx.status);
      
      // With 10 transactions, we should have some variety
      expect(cryptoTypes.length).toBe(10);
      expect(statuses.length).toBe(10);
      expect(history[0].transactionId).not.toBe(history[1].transactionId); // Different IDs
    });
  });

  describe('UserFactory and SessionFactory', () => {
    it('should create user with default properties', () => {
      const user = UserFactory.create();
      
      expect(user).toHaveProperty('userId');
      expect(user).toHaveProperty('email');
      expect(user.role).toBe('user');
      expect(user.isVerified).toBe(true);
      expect(user.isActive).toBe(true);
    });

    it('should create specialized user types', () => {
      const admin = UserFactory.createAdmin();
      const premium = UserFactory.createPremiumUser();
      const unverified = UserFactory.createUnverifiedUser();
      
      expect(admin.role).toBe('admin');
      expect(premium.role).toBe('premium');
      expect(unverified.isVerified).toBe(false);
    });

    it('should create session with user relationship', () => {
      const user = UserFactory.create();
      const session = SessionFactory.create({ userId: user.userId });
      
      expect(session.userId).toBe(user.userId);
      expect(session).toHaveProperty('token');
      expect(session).toHaveProperty('refreshToken');
      expect(session.isActive).toBe(true);
    });

    it('should create multiple sessions for user', () => {
      const user = UserFactory.create();
      const sessions = SessionFactory.createMultipleSessions(user.userId, 3);
      
      expect(sessions).toHaveLength(3);
      expect(sessions.every(s => s.userId === user.userId)).toBe(true);
      
      // Should have different device types
      const deviceTypes = sessions.map(s => s.deviceInfo.deviceType);
      expect(new Set(deviceTypes).size).toBeGreaterThan(1);
    });
  });

  describe('SupabaseMockFactory', () => {
    let supabaseMock: any;

    beforeEach(() => {
      supabaseMock = SupabaseMockFactory.createChainableMock();
    });

    it('should create chainable Supabase mock', () => {
      // All methods should be chainable
      const result = supabaseMock
        .select('*')
        .eq('user_id', 'test')
        .order('created_at', { ascending: false })
        .limit(10);
      
      expect(result).toBe(supabaseMock); // Should return the same mock object
    });

    it('should setup successful query response', async () => {
      const mockWallets = [
        CryptoWalletFactory.create({ walletName: 'Wallet 1' }),
        CryptoWalletFactory.create({ walletName: 'Wallet 2' })
      ];

      SupabaseMockPatterns.walletQuery(supabaseMock, mockWallets);
      
      const result = await supabaseMock.select('*').eq('user_id', 'test');
      
      expect(result.data).toEqual(mockWallets);
      expect(result.error).toBeNull();
    });

    it('should setup error responses', async () => {
      SupabaseMockPatterns.databaseError(supabaseMock, 'Connection failed');
      
      const result = await supabaseMock.select('*');
      
      expect(result.data).toBeNull();
      expect(result.error.message).toBe('Connection failed');
    });

    it('should setup insert operation', () => {
      const newWallet = CryptoWalletFactory.create();
      SupabaseMockPatterns.walletInsert(supabaseMock, newWallet);
      
      expect(supabaseMock.insert).toBeDefined();
      // The insert chain would return the inserted wallet data when .select() is called
    });
  });

  describe('Factory Integration Example', () => {
    it('should demonstrate complete test scenario setup', async () => {
      // Create test entities using factories
      const user = UserFactory.create({ email: 'test@example.com' });
      const session = SessionFactory.create({ userId: user.userId });
      const wallet = CryptoWalletFactory.createBitcoinWallet({ 
        walletName: 'Test Bitcoin Wallet'
      });
      const transactions = TransactionFactory.createTransactionHistory('card-123', 3);

      // Setup database mocks
      const userMock = SupabaseMockFactory.createChainableMock();
      const walletMock = SupabaseMockFactory.createChainableMock();
      const txMock = SupabaseMockFactory.createChainableMock();

      SupabaseMockPatterns.userQuery(userMock, [user]);
      SupabaseMockPatterns.walletQuery(walletMock, [wallet]);
      SupabaseMockPatterns.transactionQuery(txMock, transactions);

      // Test assertions
      expect(user.userId).toBe(session.userId);
      expect(transactions.every(tx => tx.fundingContext === 'card-123')).toBe(true);
      
      // All test data is properly related and realistic
      expect(wallet.walletType).toBe('bitcoin');
      expect(wallet.walletName).toBe('Test Bitcoin Wallet');
      expect(transactions).toHaveLength(3);
    });
  });
});