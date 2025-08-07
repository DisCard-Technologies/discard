/**
 * Test data factory for crypto wallet objects
 * Simplifies creation of test data with reasonable defaults and easy customization
 */

import { CryptoWallet, CryptoBalance } from '@discard/shared/src/types/crypto';

export interface WalletFactoryOptions {
  walletId?: string;
  walletType?: 'metamask' | 'walletconnect' | 'hardware' | 'bitcoin';
  walletName?: string;
  walletAddress?: string;
  connectionStatus?: 'connected' | 'disconnected' | 'expired';
  supportedCurrencies?: string[];
  sessionExpiry?: Date;
  lastBalanceCheck?: Date;
  permissions?: string[];
}

export class CryptoWalletFactory {
  static create(overrides: WalletFactoryOptions = {}): CryptoWallet {
    const defaultWallet: CryptoWallet = {
      walletId: overrides.walletId || this.generateId(),
      walletType: overrides.walletType || 'metamask',
      walletName: overrides.walletName || 'Test Wallet',
      walletAddress: overrides.walletAddress || this.generateAddress(overrides.walletType || 'metamask'),
      connectionStatus: overrides.connectionStatus || 'connected',
      permissions: overrides.permissions || ['balance', 'send'],
      sessionExpiry: overrides.sessionExpiry || new Date(Date.now() + 3600000), // 1 hour from now
      lastBalanceCheck: overrides.lastBalanceCheck || new Date(),
      supportedCurrencies: overrides.supportedCurrencies || this.getSupportedCurrencies(overrides.walletType || 'metamask')
    };

    return defaultWallet;
  }

  static createMetamaskWallet(overrides: WalletFactoryOptions = {}): CryptoWallet {
    return this.create({
      walletType: 'metamask',
      walletAddress: '0x742d35cc6603c0532c28b8eeaf7896fd5b5e1dca',
      supportedCurrencies: ['ETH', 'USDT', 'USDC'],
      ...overrides
    });
  }

  static createBitcoinWallet(overrides: WalletFactoryOptions = {}): CryptoWallet {
    return this.create({
      walletType: 'bitcoin',
      walletAddress: '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa',
      supportedCurrencies: ['BTC'],
      ...overrides
    });
  }

  static createWalletConnectWallet(overrides: WalletFactoryOptions = {}): CryptoWallet {
    return this.create({
      walletType: 'walletconnect',
      walletAddress: '0x8ba1f109551bD432803012645Hac136c4c4e0e9',
      supportedCurrencies: ['ETH', 'USDT', 'USDC'],
      ...overrides
    });
  }

  static createMultiple(count: number, overrides: WalletFactoryOptions = {}): CryptoWallet[] {
    return Array.from({ length: count }, (_, index) => 
      this.create({
        walletName: `Test Wallet ${index + 1}`,
        ...overrides
      })
    );
  }

  static createBalance(currency: string = 'ETH', balance: string = '1.0', usdValue: number = 3000): CryptoBalance {
    return {
      currency,
      balance, // Decimal string for precision
      usdValue: Math.floor(usdValue * 100), // Convert to cents
      conversionRate: (usdValue / parseFloat(balance)).toFixed(2)
    };
  }

  private static generateId(): string {
    return `wallet-${Math.random().toString(36).substr(2, 9)}`;
  }

  private static generateAddress(walletType: string): string {
    switch (walletType) {
      case 'metamask':
      case 'walletconnect':
      case 'hardware':
        return `0x${Math.random().toString(16).substr(2, 40)}`;
      case 'bitcoin':
        return `1${Math.random().toString(36).substr(2, 33)}`;
      default:
        return `address-${Math.random().toString(36).substr(2, 20)}`;
    }
  }

  private static getSupportedCurrencies(walletType: string): string[] {
    switch (walletType) {
      case 'metamask':
      case 'walletconnect':
      case 'hardware':
        return ['ETH', 'USDT', 'USDC'];
      case 'bitcoin':
        return ['BTC'];
      default:
        return [];
    }
  }

  private static getPrimaryCurrency(walletType: string): string {
    switch (walletType) {
      case 'metamask':
      case 'walletconnect':
      case 'hardware':
        return 'ETH';
      case 'bitcoin':
        return 'BTC';
      default:
        return 'ETH';
    }
  }
}

export { CryptoWalletFactory as WalletFactory };