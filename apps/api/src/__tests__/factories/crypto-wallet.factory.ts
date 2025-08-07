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
  network?: 'mainnet' | 'testnet';
  connectionStatus?: 'connected' | 'disconnected' | 'connecting' | 'error';
  supportedCurrencies?: string[];
  balance?: Partial<CryptoBalance>;
  userId?: string;
}

export class CryptoWalletFactory {
  static create(overrides: WalletFactoryOptions = {}): CryptoWallet {
    const defaultWallet: CryptoWallet = {
      walletId: overrides.walletId || this.generateId(),
      walletType: overrides.walletType || 'metamask',
      walletName: overrides.walletName || 'Test Wallet',
      walletAddress: overrides.walletAddress || this.generateAddress(overrides.walletType || 'metamask'),
      network: overrides.network || 'mainnet',
      connectionStatus: overrides.connectionStatus || 'connected',
      supportedCurrencies: overrides.supportedCurrencies || this.getSupportedCurrencies(overrides.walletType || 'metamask'),
      balance: {
        confirmed: 0,
        unconfirmed: 0,
        total: 0,
        usdValue: 0,
        currency: this.getPrimaryCurrency(overrides.walletType || 'metamask'),
        ...overrides.balance
      },
      lastSynced: new Date().toISOString(),
      qrCode: `data:image/png;base64,test-qr-code-${this.generateId()}`
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

  static createWithBalance(amount: number, currency: string = 'ETH', overrides: WalletFactoryOptions = {}): CryptoWallet {
    return this.create({
      balance: {
        confirmed: amount,
        unconfirmed: 0,
        total: amount,
        currency,
        usdValue: amount * 3000 // Mock $3000 per ETH
      },
      ...overrides
    });
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