/**
 * Test data factory for crypto transaction objects
 * Simplifies creation of transaction test data with realistic defaults
 */

export interface TransactionFactoryOptions {
  transactionId?: string;
  walletId?: string;
  fromAddress?: string;
  toAddress?: string;
  amount?: string;
  currency?: string;
  network?: 'mainnet' | 'testnet';
  transactionHash?: string;
  status?: 'pending' | 'confirmed' | 'failed' | 'cancelled';
  blockNumber?: number;
  gasPrice?: string;
  gasUsed?: string;
  fee?: string;
  confirmations?: number;
  timestamp?: string;
  type?: 'send' | 'receive' | 'swap' | 'stake';
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
  static create(overrides: TransactionFactoryOptions = {}) {
    return {
      transactionId: overrides.transactionId || this.generateId(),
      walletId: overrides.walletId || `wallet-${this.generateShortId()}`,
      fromAddress: overrides.fromAddress || this.generateEthAddress(),
      toAddress: overrides.toAddress || this.generateEthAddress(),
      amount: overrides.amount || '1.0',
      currency: overrides.currency || 'ETH',
      network: overrides.network || 'mainnet',
      transactionHash: overrides.transactionHash || this.generateTxHash(),
      status: overrides.status || 'confirmed',
      blockNumber: overrides.blockNumber || Math.floor(Math.random() * 1000000) + 18000000,
      gasPrice: overrides.gasPrice || '20000000000', // 20 Gwei
      gasUsed: overrides.gasUsed || '21000',
      fee: overrides.fee || '0.00042', // gasPrice * gasUsed
      confirmations: overrides.confirmations || 12,
      timestamp: overrides.timestamp || new Date().toISOString(),
      type: overrides.type || 'send',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
  }

  static createEthereumTransaction(overrides: TransactionFactoryOptions = {}) {
    return this.create({
      currency: 'ETH',
      fromAddress: '0x742d35cc6603c0532c28b8eeaf7896fd5b5e1dca',
      toAddress: '0x8ba1f109551bD432803012645Hac136c4c4e0e9',
      gasPrice: '20000000000',
      gasUsed: '21000',
      fee: '0.00042',
      ...overrides
    });
  }

  static createBitcoinTransaction(overrides: BitcoinTransactionOptions = {}) {
    return {
      ...this.create({
        currency: 'BTC',
        fromAddress: '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa',
        toAddress: '1BvBMSEYstWetqTFn5Au4m4GFg7xJaNVN2',
        gasPrice: undefined, // Bitcoin uses fee rate instead
        gasUsed: undefined,
        fee: '0.00001',
        ...overrides
      }),
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

  static createUSDTTransaction(overrides: TransactionFactoryOptions = {}) {
    return this.create({
      currency: 'USDT',
      amount: '100.0',
      fromAddress: '0x742d35cc6603c0532c28b8eeaf7896fd5b5e1dca',
      toAddress: '0x8ba1f109551bD432803012645Hac136c4c4e0e9',
      gasPrice: '25000000000',
      gasUsed: '65000', // Higher gas for token transfers
      fee: '0.001625',
      ...overrides
    });
  }

  static createPendingTransaction(overrides: TransactionFactoryOptions = {}) {
    return this.create({
      status: 'pending',
      blockNumber: undefined,
      confirmations: 0,
      ...overrides
    });
  }

  static createFailedTransaction(overrides: TransactionFactoryOptions = {}) {
    return this.create({
      status: 'failed',
      blockNumber: undefined,
      confirmations: 0,
      ...overrides
    });
  }

  static createMultiple(count: number, overrides: TransactionFactoryOptions = []) {
    return Array.from({ length: count }, (_, index) => 
      this.create({
        amount: ((index + 1) * 0.5).toString(),
        timestamp: new Date(Date.now() - (index * 3600000)).toISOString(), // 1 hour apart
        ...overrides
      })
    );
  }

  static createTransactionHistory(walletId: string, count: number = 10) {
    const transactions = [];
    const statuses = ['confirmed', 'confirmed', 'confirmed', 'pending', 'failed'];
    const types = ['send', 'receive', 'send', 'receive'];
    const currencies = ['ETH', 'BTC', 'USDT', 'USDC'];

    for (let i = 0; i < count; i++) {
      transactions.push(this.create({
        walletId,
        status: statuses[Math.floor(Math.random() * statuses.length)],
        type: types[Math.floor(Math.random() * types.length)],
        currency: currencies[Math.floor(Math.random() * currencies.length)],
        amount: (Math.random() * 10).toFixed(4),
        timestamp: new Date(Date.now() - (i * 3600000)).toISOString()
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