/**
 * Test data factory for crypto transaction objects
 * Simplifies creation of transaction test data with realistic defaults
 */

import { CryptoTransaction } from '@discard/shared/src/types/crypto';

export interface TransactionFactoryOptions {
  transactionId?: string;
  cryptoType?: 'BTC' | 'ETH' | 'USDT' | 'USDC' | 'XRP';
  cryptoAmount?: string;
  usdAmount?: number;
  conversionRate?: string;
  networkFee?: number;
  status?: 'pending' | 'confirmed' | 'failed' | 'expired';
  blockchainTxHash?: string;
  fundingContext?: string;
}

export interface BitcoinTransactionOptions extends TransactionFactoryOptions {
  utxos?: Array<{
    txid: string;
    vout: number;
    value: number;
    confirmations: number;
    scriptPubKey: string;
  }>;
  feeRate?: number;
  psbtHex?: string;
}

export class TransactionFactory {
  static create(overrides: TransactionFactoryOptions = {}): CryptoTransaction {
    return {
      transactionId: overrides.transactionId || this.generateId(),
      cryptoType: overrides.cryptoType || 'ETH',
      cryptoAmount: overrides.cryptoAmount || '1.0',
      usdAmount: overrides.usdAmount || 300000, // $3000 in cents
      conversionRate: overrides.conversionRate || '3000.00',
      networkFee: overrides.networkFee || 4200, // $42 in cents
      status: overrides.status || 'confirmed',
      blockchainTxHash: overrides.blockchainTxHash || this.generateTxHash(),
      fundingContext: overrides.fundingContext || `card-${this.generateShortId()}`
    };
  }

  static createEthereumTransaction(overrides: TransactionFactoryOptions = {}): CryptoTransaction {
    return this.create({
      cryptoType: 'ETH',
      cryptoAmount: '1.0',
      usdAmount: 300000,
      conversionRate: '3000.00',
      networkFee: 4200,
      blockchainTxHash: '0x742d35cc6603c0532c28b8eeaf7896fd5b5e1dca123456789',
      ...overrides
    });
  }

  static createBitcoinTransaction(overrides: BitcoinTransactionOptions = {}): CryptoTransaction & { utxos: any[]; feeRate: number; psbtHex: string } {
    const baseTransaction = this.create({
      cryptoType: 'BTC',
      cryptoAmount: '1.0',
      usdAmount: 4500000, // $45,000 in cents
      conversionRate: '45000.00',
      networkFee: 1000, // $10 in cents
      blockchainTxHash: 'abc123def456789abc123def456789abc123def456789abc123def456789',
      ...overrides
    });
    
    return {
      ...baseTransaction,
      utxos: overrides.utxos || [
        {
          txid: 'abc123def456789',
          vout: 0,
          value: 100000000, // 1 BTC in satoshis
          confirmations: 6,
          scriptPubKey: '76a914389ffce9cd9ae88dcc0631e88a821ffdbe9bfe2615bb88ac'
        }
      ],
      feeRate: overrides.feeRate || 10, // sat/byte
      psbtHex: overrides.psbtHex || 'mock-psbt-hex-data'
    };
  }

  static createUSDTTransaction(overrides: TransactionFactoryOptions = {}): CryptoTransaction {
    return this.create({
      cryptoType: 'USDT',
      cryptoAmount: '100.0',
      usdAmount: 10000, // $100 in cents
      conversionRate: '1.00',
      networkFee: 162, // $1.62 in cents
      ...overrides
    });
  }

  static createPendingTransaction(overrides: TransactionFactoryOptions = {}): CryptoTransaction {
    return this.create({
      status: 'pending',
      ...overrides
    });
  }

  static createFailedTransaction(overrides: TransactionFactoryOptions = {}): CryptoTransaction {
    return this.create({
      status: 'failed',
      ...overrides
    });
  }

  static createMultiple(count: number, overrides: TransactionFactoryOptions = {}): CryptoTransaction[] {
    return Array.from({ length: count }, (_, index) => 
      this.create({
        cryptoAmount: ((index + 1) * 0.5).toString(),
        usdAmount: Math.floor(((index + 1) * 0.5) * 300000), // Varying USD amounts
        ...overrides
      })
    );
  }

  static createTransactionHistory(fundingContext: string, count: number = 10): CryptoTransaction[] {
    const transactions = [];
    const statuses: Array<'confirmed' | 'pending' | 'failed' | 'expired'> = ['confirmed', 'confirmed', 'confirmed', 'pending', 'failed'];
    const currencies: Array<'ETH' | 'BTC' | 'USDT' | 'USDC' | 'XRP'> = ['ETH', 'BTC', 'USDT', 'USDC'];

    for (let i = 0; i < count; i++) {
      const cryptoType = currencies[Math.floor(Math.random() * currencies.length)];
      const amount = (Math.random() * 10).toFixed(4);
      const rate = cryptoType === 'USDT' ? 1 : Math.random() * 50000; // Mock rates
      
      transactions.push(this.create({
        fundingContext,
        status: statuses[Math.floor(Math.random() * statuses.length)],
        cryptoType,
        cryptoAmount: amount,
        usdAmount: Math.floor(parseFloat(amount) * rate * 100), // Convert to cents
        conversionRate: rate.toFixed(2)
      }));
    }

    return transactions;
  }

  private static generateId(): string {
    return `tx-${Math.random().toString(36).substr(2, 9)}`;
  }

  private static generateShortId(): string {
    return Math.random().toString(36).substr(2, 6);
  }

  private static generateEthAddress(): string {
    return `0x${Math.random().toString(16).substr(2, 40)}`;
  }

  private static generateTxHash(): string {
    return `0x${Math.random().toString(16).substr(2, 64)}`;
  }
}

export { TransactionFactory as TxFactory };