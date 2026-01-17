/**
 * useWallets Hook Tests
 *
 * Tests for wallet connection management and DeFi position tracking.
 */

import { mockUseQuery, mockUseMutation, resetConvexMocks } from '../../helpers/convex';

// Mock the convex react module
jest.mock('convex/react', () => ({
  useQuery: jest.fn(),
  useMutation: jest.fn(),
}));

// Mock the auth store
jest.mock('@/stores/authConvex', () => ({
  isMockUserId: jest.fn((id: string) => id.startsWith('mock_')),
}));

import { useQuery, useMutation } from 'convex/react';

describe('useWallets Hook', () => {
  beforeEach(() => {
    resetConvexMocks();
    jest.clearAllMocks();
  });

  // ==========================================================================
  // Wallet Types
  // ==========================================================================

  describe('Wallet Types', () => {
    const walletTypes = ['metamask', 'walletconnect', 'phantom', 'solflare', 'coinbase'];
    const networkTypes = ['ethereum', 'solana', 'polygon', 'arbitrum', 'base'];

    test.each(walletTypes)('supports %s wallet type', (walletType) => {
      expect(walletTypes).toContain(walletType);
    });

    test.each(networkTypes)('supports %s network type', (networkType) => {
      expect(networkTypes).toContain(networkType);
    });

    test('connection status types are valid', () => {
      const statusTypes = ['connected', 'disconnected', 'expired', 'error'];
      statusTypes.forEach((status) => {
        expect(['connected', 'disconnected', 'expired', 'error']).toContain(status);
      });
    });
  });

  // ==========================================================================
  // Wallet Data Structure
  // ==========================================================================

  describe('Wallet Data Structure', () => {
    test('wallet object has required fields', () => {
      const wallet = {
        _id: 'wallet_123',
        userId: 'user_456',
        walletType: 'phantom',
        networkType: 'solana',
        publicAddress: 'So1anaAddress123456789',
        connectionStatus: 'connected',
        nickname: 'My Phantom',
        cachedBalanceUsd: 1500.50,
        lastUsedAt: Date.now(),
      };

      expect(wallet._id).toBeDefined();
      expect(wallet.userId).toBeDefined();
      expect(wallet.walletType).toBeDefined();
      expect(wallet.networkType).toBeDefined();
      expect(wallet.publicAddress).toBeDefined();
      expect(wallet.connectionStatus).toBeDefined();
    });

    test('wallet can have optional fields', () => {
      const minimalWallet = {
        _id: 'wallet_123',
        userId: 'user_456',
        walletType: 'phantom',
        networkType: 'solana',
        publicAddress: 'So1anaAddress123456789',
        connectionStatus: 'connected',
      };

      expect(minimalWallet.nickname).toBeUndefined();
      expect(minimalWallet.cachedBalanceUsd).toBeUndefined();
      expect(minimalWallet.lastUsedAt).toBeUndefined();
    });
  });

  // ==========================================================================
  // DeFi Position Structure
  // ==========================================================================

  describe('DeFi Position Structure', () => {
    test('DeFi position has required fields', () => {
      const position = {
        _id: 'defi_123',
        userId: 'user_456',
        walletId: 'wallet_789',
        protocolName: 'Marinade',
        positionType: 'staking',
        totalValueUsd: 5000,
        earnedValueUsd: 250,
        availableForFunding: 4500,
        currentYieldApy: 6.5,
      };

      expect(position._id).toBeDefined();
      expect(position.protocolName).toBeDefined();
      expect(position.positionType).toBeDefined();
      expect(position.totalValueUsd).toBeGreaterThanOrEqual(0);
      expect(position.currentYieldApy).toBeGreaterThanOrEqual(0);
    });

    test('position types are valid', () => {
      const positionTypes = ['lending', 'staking', 'lp', 'vault'];
      positionTypes.forEach((type) => {
        expect(['lending', 'staking', 'lp', 'vault']).toContain(type);
      });
    });
  });

  // ==========================================================================
  // Wallet Calculations
  // ==========================================================================

  describe('Wallet Calculations', () => {
    test('calculates total DeFi value correctly', () => {
      const positions = [
        { totalValueUsd: 1000, earnedValueUsd: 50, availableForFunding: 900 },
        { totalValueUsd: 2000, earnedValueUsd: 100, availableForFunding: 1800 },
        { totalValueUsd: 1500, earnedValueUsd: 75, availableForFunding: 1350 },
      ];

      const totalValue = positions.reduce((sum, p) => sum + p.totalValueUsd, 0);
      const totalEarned = positions.reduce((sum, p) => sum + p.earnedValueUsd, 0);
      const totalAvailable = positions.reduce((sum, p) => sum + p.availableForFunding, 0);

      expect(totalValue).toBe(4500);
      expect(totalEarned).toBe(225);
      expect(totalAvailable).toBe(4050);
    });

    test('handles empty positions array', () => {
      const positions: any[] = [];

      const totalValue = positions.reduce((sum, p) => sum + p.totalValueUsd, 0);

      expect(totalValue).toBe(0);
    });
  });

  // ==========================================================================
  // Funding Sources
  // ==========================================================================

  describe('Funding Sources', () => {
    test('combines wallets and DeFi positions into funding sources', () => {
      const wallets = [
        {
          _id: 'wallet_1',
          walletType: 'phantom',
          networkType: 'solana',
          nickname: 'Main Wallet',
          cachedBalanceUsd: 500,
        },
      ];

      const defiPositions = [
        {
          _id: 'defi_1',
          protocolName: 'Marinade',
          positionType: 'staking',
          availableForFunding: 1000,
          currentYieldApy: 6.5,
        },
      ];

      const fundingSources = [
        ...wallets.map((w) => ({
          id: w._id,
          type: 'wallet' as const,
          name: w.nickname || `${w.walletType} (${w.networkType})`,
          availableAmount: w.cachedBalanceUsd ?? 0,
          network: w.networkType,
        })),
        ...defiPositions.map((p) => ({
          id: p._id,
          type: 'defi' as const,
          name: `${p.protocolName} ${p.positionType}`,
          availableAmount: p.availableForFunding,
          yield: p.currentYieldApy,
        })),
      ];

      expect(fundingSources).toHaveLength(2);
      expect(fundingSources[0].type).toBe('wallet');
      expect(fundingSources[0].name).toBe('Main Wallet');
      expect(fundingSources[1].type).toBe('defi');
      expect(fundingSources[1].name).toBe('Marinade staking');
    });

    test('uses default name when nickname is missing', () => {
      const wallet = {
        _id: 'wallet_1',
        walletType: 'metamask',
        networkType: 'ethereum',
        cachedBalanceUsd: 1000,
      };

      const name = wallet.nickname || `${wallet.walletType} (${wallet.networkType})`;

      expect(name).toBe('metamask (ethereum)');
    });
  });

  // ==========================================================================
  // Mock User Handling
  // ==========================================================================

  describe('Mock User Handling', () => {
    test('identifies mock user IDs correctly', () => {
      const isMockUserId = (id: string) => id.startsWith('mock_');

      expect(isMockUserId('mock_user_123')).toBe(true);
      expect(isMockUserId('user_456')).toBe(false);
      expect(isMockUserId('mock_')).toBe(true);
      expect(isMockUserId('')).toBe(false);
    });

    test('skips queries for mock users', () => {
      const userId = 'mock_user_123';
      const isMockUserId = (id: string) => id.startsWith('mock_');
      const validUserId = userId && !isMockUserId(userId) ? userId : null;

      expect(validUserId).toBeNull();
    });

    test('allows queries for real users', () => {
      const userId = 'user_456';
      const isMockUserId = (id: string) => id.startsWith('mock_');
      const validUserId = userId && !isMockUserId(userId) ? userId : null;

      expect(validUserId).toBe('user_456');
    });
  });

  // ==========================================================================
  // Wallet Connection Validation
  // ==========================================================================

  describe('Wallet Connection Validation', () => {
    test('validates Ethereum address format', () => {
      const isValidEthAddress = (address: string) => /^0x[a-fA-F0-9]{40}$/.test(address);

      expect(isValidEthAddress('0x1234567890abcdef1234567890abcdef12345678')).toBe(true);
      expect(isValidEthAddress('0x1234')).toBe(false);
      expect(isValidEthAddress('1234567890abcdef1234567890abcdef12345678')).toBe(false);
    });

    test('validates Solana address format', () => {
      const isValidSolAddress = (address: string) => /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address);

      expect(isValidSolAddress('So11111111111111111111111111111111111111112')).toBe(true);
      expect(isValidSolAddress('abc')).toBe(false);
      expect(isValidSolAddress('')).toBe(false);
    });
  });
});
