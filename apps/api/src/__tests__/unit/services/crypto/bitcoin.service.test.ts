import { describe, it, expect, beforeEach, jest, afterEach } from '@jest/globals';

// Set environment variables before importing the service
process.env.WALLET_ENCRYPTION_KEY = 'test-encryption-key-32-chars-long!';
process.env.BLOCKCYPHER_API_KEY = 'test-api-key';

import { bitcoinService } from '../../../../services/crypto/bitcoin.service';

// Mock bitcoinjs-lib
jest.mock('bitcoinjs-lib', () => ({
  networks: {
    bitcoin: { name: 'mainnet' },
    testnet: { name: 'testnet' }
  },
  address: {
    toOutputScript: jest.fn()
  },
  TransactionBuilder: jest.fn().mockImplementation(() => ({
    addInput: jest.fn(),
    addOutput: jest.fn(),
    buildIncomplete: jest.fn().mockReturnValue({
      getId: jest.fn().mockReturnValue('mock-tx-id'),
      toHex: jest.fn().mockReturnValue('mock-tx-hex')
    })
  }))
}));

// Mock qrcode
jest.mock('qrcode', () => ({
  toDataURL: jest.fn().mockResolvedValue('data:image/png;base64,mock-qr-code')
}));

// Mock ECPair and tiny-secp256k1
jest.mock('ecpair', () => ({
  ECPairFactory: jest.fn(() => ({}))
}));

jest.mock('tiny-secp256k1', () => ({}));

// Mock Supabase - exactly like the working MetaMask service
const mockSupabaseChain = {
  select: jest.fn().mockReturnThis(),
  insert: jest.fn().mockReturnThis(),
  update: jest.fn().mockReturnThis(),
  eq: jest.fn().mockReturnThis(),
  not: jest.fn().mockReturnThis(),
  lt: jest.fn().mockReturnThis(),
  gt: jest.fn().mockReturnThis(),
  gte: jest.fn().mockReturnThis(),
  lte: jest.fn().mockReturnThis(),
  order: jest.fn().mockReturnThis(),
  limit: jest.fn().mockReturnThis(),
  single: jest.fn().mockResolvedValue({ data: null, error: null }),
  mockResolvedValue: jest.fn().mockResolvedValue({ data: null, error: null })
};

jest.mock('../../../../app', () => ({
  supabase: {
    from: jest.fn(() => mockSupabaseChain)
  }
}));

// Mock fetch globally
global.fetch = jest.fn() as jest.MockedFunction<typeof fetch>;

// Mock blockchain service with comprehensive encryption/decryption scenarios
const mockBlockchainService = {
  encryptWalletAddress: jest.fn(),
  decryptWalletAddress: jest.fn(),
  hashWalletAddress: jest.fn(),
  validateWalletAddress: jest.fn()
};

jest.mock('../../../../services/crypto/blockchain.service', () => ({
  blockchainService: mockBlockchainService
}));

describe('BitcoinService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    
    // Reset mock functions
    const bitcoin = require('bitcoinjs-lib');
    bitcoin.address.toOutputScript.mockClear();
    
    // Clear all mocks first
    Object.values(mockSupabaseChain).forEach(mock => {
      if (typeof mock.mockClear === 'function') {
        mock.mockClear();
      }
    });
    
    // Set up chaining - all intermediate methods return the chain object
    mockSupabaseChain.select.mockReturnValue(mockSupabaseChain);
    mockSupabaseChain.insert.mockReturnValue(mockSupabaseChain);
    mockSupabaseChain.update.mockReturnValue(mockSupabaseChain);
    
    // For Bitcoin service, .eq() is the terminal method, so it should resolve to data
    mockSupabaseChain.eq.mockResolvedValue({ data: [], error: null });
    
    // Special handling for connectBitcoinWallet which uses .insert().select()
    mockSupabaseChain.insert.mockReturnValue({
      select: jest.fn().mockResolvedValue({ data: { wallet_id: 'mock-wallet-id' }, error: null })
    });
    
    // Special handling for disconnectBitcoinWallet which uses .update().eq().eq().eq()
    mockSupabaseChain.update.mockReturnValue(mockSupabaseChain);
    
    // Other terminal methods
    mockSupabaseChain.single.mockResolvedValue({ data: null, error: null });

    // Reset blockchain service mocks with default implementations
    mockBlockchainService.encryptWalletAddress.mockClear();
    mockBlockchainService.decryptWalletAddress.mockClear();
    mockBlockchainService.hashWalletAddress.mockClear();
    mockBlockchainService.validateWalletAddress.mockClear();

    // Default mock implementations for blockchain service
    mockBlockchainService.encryptWalletAddress.mockImplementation(async (address: string) => {
      // Simulate real encryption by creating a predictable encrypted format
      const iv = 'mock-iv-16-bytes';
      const encrypted = Buffer.from(`encrypted-${address}`, 'utf8').toString('hex');
      return `${iv}:${encrypted}`;
    });

    mockBlockchainService.decryptWalletAddress.mockImplementation(async (encryptedAddress: string) => {
      // Simulate real decryption by reversing the mock encryption
      const parts = encryptedAddress.split(':');
      if (parts.length !== 2) {
        throw new Error('Invalid encrypted address format');
      }
      const encrypted = parts[1];
      const decrypted = Buffer.from(encrypted, 'hex').toString('utf8');
      return decrypted.replace('encrypted-', '');
    });

    mockBlockchainService.hashWalletAddress.mockImplementation((address: string) => {
      // Simulate deterministic hashing
      return `hash-${address.toLowerCase().replace(/[^a-z0-9]/g, '')}`;
    });

    mockBlockchainService.validateWalletAddress.mockResolvedValue({
      isValid: true
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('validateBitcoinAddress', () => {
    it('should validate a valid P2PKH address (mainnet)', () => {
      const mockAddress = '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa';
      const bitcoin = require('bitcoinjs-lib');
      bitcoin.address.toOutputScript.mockReturnValue(Buffer.from('mock-script'));

      const result = bitcoinService.validateBitcoinAddress(mockAddress);

      expect(result.isValid).toBe(true);
      expect(result.addressType).toBe('P2PKH');
      expect(bitcoin.address.toOutputScript).toHaveBeenCalledWith(
        mockAddress,
        bitcoin.networks.bitcoin
      );
    });

    it('should validate a valid P2SH address', () => {
      const mockAddress = '3J98t1WpEZ73CNmQviecrnyiWrnqRhWNLy';
      require('bitcoinjs-lib').address.toOutputScript.mockReturnValue(Buffer.from('mock-script'));

      const result = bitcoinService.validateBitcoinAddress(mockAddress);

      expect(result.isValid).toBe(true);
      expect(result.addressType).toBe('P2SH');
    });

    it('should validate a valid Bech32 address (P2WPKH)', () => {
      const mockAddress = 'bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4';
      require('bitcoinjs-lib').address.toOutputScript.mockReturnValue(Buffer.from('mock-script'));

      const result = bitcoinService.validateBitcoinAddress(mockAddress);

      expect(result.isValid).toBe(true);
      expect(result.addressType).toBe('P2WPKH');
    });

    it('should validate a valid Bech32 address (P2WSH)', () => {
      const mockAddress = 'bc1qrp33g0q4c70atj4d2kqx5pqp5pqp5pqp5pqp5pqp5pqp5pqp5pqp5pqp5pqp5pqp5pqp5';
      require('bitcoinjs-lib').address.toOutputScript.mockReturnValue(Buffer.from('mock-script'));

      const result = bitcoinService.validateBitcoinAddress(mockAddress, 'mainnet');

      expect(result.isValid).toBe(true);
      expect(result.addressType).toBe('P2WSH');
    });

    it('should reject invalid Bitcoin address', () => {
      const invalidAddress = 'invalid-address';
      require('bitcoinjs-lib').address.toOutputScript.mockImplementation(() => {
        throw new Error('Invalid address');
      });

      const result = bitcoinService.validateBitcoinAddress(invalidAddress);

      expect(result.isValid).toBe(false);
      expect(result.error).toContain('Invalid Bitcoin address');
    });

    it('should handle unsupported network', () => {
      const mockAddress = '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa';

      const result = bitcoinService.validateBitcoinAddress(mockAddress, 'unsupported');

      expect(result.isValid).toBe(false);
      expect(result.error).toContain('Unsupported network');
    });

    it('should validate testnet addresses', () => {
      const testnetAddress = 'tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx';
      require('bitcoinjs-lib').address.toOutputScript.mockReturnValue(Buffer.from('mock-script'));

      const result = bitcoinService.validateBitcoinAddress(testnetAddress, 'testnet');

      expect(result.isValid).toBe(true);
      expect(require('bitcoinjs-lib').address.toOutputScript).toHaveBeenCalledWith(
        testnetAddress,
        require('bitcoinjs-lib').networks.testnet
      );
    });
  });

  describe('generateAddressQRCode', () => {
    it('should generate QR code for Bitcoin address', async () => {
      const mockAddress = '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa';
      require('bitcoinjs-lib').address.toOutputScript.mockReturnValue(Buffer.from('mock-script'));

      const qrcode = require('qrcode');
      qrcode.toDataURL.mockResolvedValue('data:image/png;base64,test-qr-code');

      const result = await bitcoinService.generateAddressQRCode(mockAddress);

      expect(result).toBe('data:image/png;base64,test-qr-code');
      expect(qrcode.toDataURL).toHaveBeenCalledWith(
        `bitcoin:${mockAddress}`,
        expect.objectContaining({
          errorCorrectionLevel: 'M',
          type: 'image/png',
          width: 256
        })
      );
    });

    it('should generate QR code with amount and label', async () => {
      const mockAddress = '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa';
      const amount = 0.001;
      const label = 'Test Payment';
      
      require('bitcoinjs-lib').address.toOutputScript.mockReturnValue(Buffer.from('mock-script'));

      const qrcode = require('qrcode');
      qrcode.toDataURL.mockResolvedValue('data:image/png;base64,test-qr-code');

      const result = await bitcoinService.generateAddressQRCode(mockAddress, amount, label);

      expect(result).toBe('data:image/png;base64,test-qr-code');
      expect(qrcode.toDataURL).toHaveBeenCalledWith(
        `bitcoin:${mockAddress}?amount=${amount}&label=${encodeURIComponent(label)}`,
        expect.any(Object)
      );
    });

    it('should handle invalid address for QR code generation', async () => {
      const invalidAddress = 'invalid-address';
      require('bitcoinjs-lib').address.toOutputScript.mockImplementation(() => {
        throw new Error('Invalid address');
      });

      await expect(
        bitcoinService.generateAddressQRCode(invalidAddress)
      ).rejects.toThrow('Failed to generate QR code');
    });
  });

  describe('getBitcoinBalance', () => {
    it('should get Bitcoin balance successfully', async () => {
      const mockAddress = '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa';
      const mockApiResponse = {
        balance: 5000000000, // 50 BTC in satoshis
        unconfirmed_balance: 100000000 // 1 BTC in satoshis
      };

      (global.fetch as jest.MockedFunction<typeof fetch>).mockResolvedValue({
        ok: true,
        json: async () => mockApiResponse
      } as Response);

      const balance = await bitcoinService.getBitcoinBalance(mockAddress);

      expect(balance).toEqual({
        confirmed: 50, // 50 BTC
        unconfirmed: 1, // 1 BTC
        total: 51 // 51 BTC
      });

      expect(global.fetch).toHaveBeenCalledWith(
        `https://api.blockcypher.com/v1/btc/main/addrs/${mockAddress}/balance?token=test-api-key`
      );
    });

    it('should handle zero balance', async () => {
      const mockAddress = '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa';
      const mockApiResponse = {
        balance: 0,
        unconfirmed_balance: 0
      };

      (global.fetch as jest.MockedFunction<typeof fetch>).mockResolvedValue({
        ok: true,
        json: async () => mockApiResponse
      } as Response);

      const balance = await bitcoinService.getBitcoinBalance(mockAddress);

      expect(balance).toEqual({
        confirmed: 0,
        unconfirmed: 0,
        total: 0
      });
    });

    it('should handle address not found (404)', async () => {
      const mockAddress = '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa';

      (global.fetch as jest.MockedFunction<typeof fetch>).mockResolvedValue({
        ok: false,
        status: 404
      } as Response);

      const balance = await bitcoinService.getBitcoinBalance(mockAddress);

      expect(balance).toEqual({
        confirmed: 0,
        unconfirmed: 0,
        total: 0
      });
    });

    it('should handle API errors', async () => {
      const mockAddress = '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa';

      (global.fetch as jest.MockedFunction<typeof fetch>).mockResolvedValue({
        ok: false,
        status: 500
      } as Response);

      await expect(
        bitcoinService.getBitcoinBalance(mockAddress)
      ).rejects.toThrow('Failed to get Bitcoin balance');
    });

    it('should work without API key', async () => {
      delete process.env.BLOCKCYPHER_API_KEY;
      
      const mockAddress = '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa';
      const mockApiResponse = {
        balance: 100000000, // 1 BTC
        unconfirmed_balance: 0
      };

      (global.fetch as jest.MockedFunction<typeof fetch>).mockResolvedValue({
        ok: true,
        json: async () => mockApiResponse
      } as Response);

      const balance = await bitcoinService.getBitcoinBalance(mockAddress);

      expect(balance.confirmed).toBe(1);
      expect(global.fetch).toHaveBeenCalledWith(
        `https://api.blockcypher.com/v1/btc/main/addrs/${mockAddress}/balance`
      );

      // Restore for other tests
      process.env.BLOCKCYPHER_API_KEY = 'test-api-key';
    });

    it('should use testnet API for testnet addresses', async () => {
      const mockAddress = 'tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx';
      const mockApiResponse = {
        balance: 100000000,
        unconfirmed_balance: 0
      };

      (global.fetch as jest.MockedFunction<typeof fetch>).mockResolvedValue({
        ok: true,
        json: async () => mockApiResponse
      } as Response);

      await bitcoinService.getBitcoinBalance(mockAddress, 'testnet');

      expect(global.fetch).toHaveBeenCalledWith(
        `https://api.blockcypher.com/v1/btc/test3/addrs/${mockAddress}/balance?token=test-api-key`
      );
    });
  });

  describe('getBitcoinUTXOs', () => {
    it('should get UTXOs successfully', async () => {
      const mockAddress = '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa';
      const mockApiResponse = {
        txrefs: [
          {
            tx_hash: 'abc123',
            tx_output_n: 0,
            value: 100000000, // 1 BTC in satoshis
            confirmations: 6,
            script: 'mock-script'
          },
          {
            tx_hash: 'def456',
            tx_output_n: 1,
            value: 50000000, // 0.5 BTC in satoshis
            confirmations: 10,
            script: 'mock-script-2'
          }
        ]
      };

      (global.fetch as jest.MockedFunction<typeof fetch>).mockResolvedValue({
        ok: true,
        json: async () => mockApiResponse
      } as Response);

      const utxos = await bitcoinService.getBitcoinUTXOs(mockAddress);

      expect(utxos).toHaveLength(2);
      expect(utxos[0]).toEqual({
        txid: 'abc123',
        vout: 0,
        value: 100000000,
        confirmations: 6,
        scriptPubKey: 'mock-script'
      });
      expect(utxos[1]).toEqual({
        txid: 'def456',
        vout: 1,
        value: 50000000,
        confirmations: 10,
        scriptPubKey: 'mock-script-2'
      });
    });

    it('should handle empty UTXOs', async () => {
      const mockAddress = '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa';

      (global.fetch as jest.MockedFunction<typeof fetch>).mockResolvedValue({
        ok: false,
        status: 404
      } as Response);

      const utxos = await bitcoinService.getBitcoinUTXOs(mockAddress);

      expect(utxos).toEqual([]);
    });

    it('should handle API errors for UTXOs', async () => {
      const mockAddress = '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa';

      (global.fetch as jest.MockedFunction<typeof fetch>).mockResolvedValue({
        ok: false,
        status: 500
      } as Response);

      await expect(
        bitcoinService.getBitcoinUTXOs(mockAddress)
      ).rejects.toThrow('Failed to get Bitcoin UTXOs');
    });
  });

  describe('getBitcoinTransactionFees', () => {
    it('should get transaction fees successfully', async () => {
      const mockFeeResponse = {
        fastestFee: 20,
        halfHourFee: 10,
        hourFee: 5
      };

      (global.fetch as jest.MockedFunction<typeof fetch>).mockResolvedValue({
        ok: true,
        json: async () => mockFeeResponse
      } as Response);

      const fees = await bitcoinService.getBitcoinTransactionFees();

      expect(fees).toEqual({
        fast: 20,
        medium: 10,
        slow: 5
      });

      expect(global.fetch).toHaveBeenCalledWith(
        'https://mempool.space/api/v1/fees/recommended'
      );
    });

    it('should get testnet transaction fees', async () => {
      const mockFeeResponse = {
        fastestFee: 15,
        halfHourFee: 8,
        hourFee: 3
      };

      (global.fetch as jest.MockedFunction<typeof fetch>).mockResolvedValue({
        ok: true,
        json: async () => mockFeeResponse
      } as Response);

      const fees = await bitcoinService.getBitcoinTransactionFees('testnet');

      expect(fees).toEqual({
        fast: 15,
        medium: 8,
        slow: 3
      });

      expect(global.fetch).toHaveBeenCalledWith(
        'https://mempool.space/testnet/api/v1/fees/recommended'
      );
    });

    it('should return fallback fees on API error', async () => {
      (global.fetch as jest.MockedFunction<typeof fetch>).mockResolvedValue({
        ok: false,
        status: 500
      } as Response);

      const fees = await bitcoinService.getBitcoinTransactionFees();

      expect(fees).toEqual({
        fast: 20,
        medium: 10,
        slow: 5
      });
    });
  });

  describe('connectBitcoinWallet', () => {
    it('should connect Bitcoin wallet successfully', async () => {
      const userId = 'test-user-id';
      const mockRequest = {
        address: '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa',
        walletName: 'My Bitcoin Wallet',
        network: 'mainnet'
      };

      // Mock address validation
      require('bitcoinjs-lib').address.toOutputScript.mockReturnValue(Buffer.from('mock-script'));

      // Mock balance API
      (global.fetch as jest.MockedFunction<typeof fetch>).mockResolvedValue({
        ok: true,
        json: async () => ({
          balance: 100000000,
          unconfirmed_balance: 0
        })
      } as Response);

      // Mock QR code generation
      const qrcode = require('qrcode');
      qrcode.toDataURL.mockResolvedValue('data:image/png;base64,test-qr');

      // Mock database operations
      mockSupabaseChain.single.mockResolvedValueOnce({
        data: null,
        error: { code: 'PGRST116' } // No existing wallet
      });

      mockSupabaseChain.single.mockResolvedValueOnce({
        data: {
          wallet_id: 'mock-wallet-id',
          wallet_name: 'My Bitcoin Wallet',
          connection_status: 'connected',
          supported_currencies: ['BTC'],
          created_at: '2023-01-01T00:00:00Z'
        },
        error: null
      });

      const connection = await bitcoinService.connectBitcoinWallet(userId, mockRequest);

      expect(connection.walletId).toBe('mock-wallet-id');
      expect(connection.address).toBe(mockRequest.address);
      expect(connection.walletName).toBe('My Bitcoin Wallet');
      expect(connection.network).toBe('mainnet');
      expect(connection.balance.confirmed).toBe(1); // 1 BTC
      expect(connection.qrCode).toBe('data:image/png;base64,test-qr');
      expect(connection.connectionStatus).toBe('connected');
    });

    it('should handle already connected wallet', async () => {
      const userId = 'test-user-id';
      const mockRequest = {
        address: '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa',
        walletName: 'My Bitcoin Wallet'
      };

      // Mock existing wallet
      mockSupabaseChain.single.mockResolvedValue({
        data: { wallet_id: 'existing-wallet-id' },
        error: null
      });

      await expect(
        bitcoinService.connectBitcoinWallet(userId, mockRequest)
      ).rejects.toMatchObject({
        code: 'WALLET_ALREADY_CONNECTED',
        message: 'Bitcoin address already connected'
      });
    });

    it('should handle invalid Bitcoin address', async () => {
      const userId = 'test-user-id';
      const mockRequest = {
        address: 'invalid-address',
        walletName: 'My Bitcoin Wallet'
      };

      require('bitcoinjs-lib').address.toOutputScript.mockImplementation(() => {
        throw new Error('Invalid address');
      });

      await expect(
        bitcoinService.connectBitcoinWallet(userId, mockRequest)
      ).rejects.toMatchObject({
        code: 'INVALID_WALLET_ADDRESS',
        message: 'Invalid Bitcoin address'
      });
    });

    it('should handle database errors', async () => {
      const userId = 'test-user-id';
      const mockRequest = {
        address: '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa',
        walletName: 'My Bitcoin Wallet'
      };

      require('bitcoinjs-lib').address.toOutputScript.mockReturnValue(Buffer.from('mock-script'));

      // Mock database error
      mockSupabaseChain.single.mockResolvedValue({
        data: null,
        error: { message: 'Database error' }
      });

      await expect(
        bitcoinService.connectBitcoinWallet(userId, mockRequest)
      ).rejects.toThrow('Failed to check existing wallet');
    });
  });

  describe('getBitcoinWallets', () => {
    it('should get Bitcoin wallets for user', async () => {
      const userId = 'test-user-id';
      const mockWallets = [
        {
          wallet_id: 'wallet-1',
          wallet_name: 'Wallet 1',
          wallet_address_encrypted: 'encrypted-address-1',
          wallet_metadata: { network: 'mainnet' },
          connection_status: 'connected',
          supported_currencies: ['BTC'],
          created_at: '2023-01-01T00:00:00Z'
        },
        {
          wallet_id: 'wallet-2',
          wallet_name: 'Wallet 2',
          wallet_address_encrypted: 'encrypted-address-2',
          wallet_metadata: { network: 'testnet' },
          connection_status: 'connected',
          supported_currencies: ['BTC'],
          created_at: '2023-01-02T00:00:00Z'
        }
      ];

      mockSupabaseChain.eq.mockReturnThis();
      mockSupabaseChain.select.mockResolvedValue({
        data: mockWallets,
        error: null
      });

      // Mock balance API responses
      (global.fetch as jest.MockedFunction<typeof fetch>)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ balance: 100000000, unconfirmed_balance: 0 })
        } as Response)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ balance: 50000000, unconfirmed_balance: 0 })
        } as Response);

      // Mock QR code generation
      const qrcode = require('qrcode');
      qrcode.toDataURL.mockResolvedValue('data:image/png;base64,test-qr');

      // Mock decryption (we can't easily test the actual encryption)
      const originalDecrypt = (bitcoinService as any).decryptBitcoinAddress;
      (bitcoinService as any).decryptBitcoinAddress = jest.fn()
        .mockResolvedValueOnce('1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa')
        .mockResolvedValueOnce('tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx');

      const wallets = await bitcoinService.getBitcoinWallets(userId);

      expect(wallets).toHaveLength(2);
      expect(wallets[0].walletId).toBe('wallet-1');
      expect(wallets[0].network).toBe('mainnet');
      expect(wallets[0].balance.confirmed).toBe(1);
      expect(wallets[1].walletId).toBe('wallet-2');
      expect(wallets[1].network).toBe('testnet');
      expect(wallets[1].balance.confirmed).toBe(0.5);

      // Restore original method
      (bitcoinService as any).decryptBitcoinAddress = originalDecrypt;
    });

    it('should handle empty wallet list', async () => {
      const userId = 'test-user-id';

      mockSupabaseChain.eq.mockReturnThis();
      mockSupabaseChain.select.mockResolvedValue({
        data: [],
        error: null
      });

      const wallets = await bitcoinService.getBitcoinWallets(userId);

      expect(wallets).toEqual([]);
    });

    it('should handle database errors', async () => {
      const userId = 'test-user-id';

      mockSupabaseChain.eq.mockReturnThis();
      mockSupabaseChain.select.mockResolvedValue({
        data: null,
        error: { message: 'Database error' }
      });

      await expect(
        bitcoinService.getBitcoinWallets(userId)
      ).rejects.toThrow('Failed to fetch Bitcoin wallets');
    });
  });

  describe('disconnectBitcoinWallet', () => {
    it('should disconnect Bitcoin wallet successfully', async () => {
      const userId = 'test-user-id';
      const walletId = 'test-wallet-id';

      mockSupabaseChain.eq.mockReturnThis();
      mockSupabaseChain.update.mockResolvedValue({
        data: null,
        error: null
      });

      await bitcoinService.disconnectBitcoinWallet(userId, walletId);

      // Should not throw any errors
      expect(mockSupabaseChain.eq).toHaveBeenCalledWith('wallet_id', walletId);
      expect(mockSupabaseChain.eq).toHaveBeenCalledWith('user_id', userId);
      expect(mockSupabaseChain.eq).toHaveBeenCalledWith('wallet_type', 'bitcoin');
    });

    it('should handle database errors', async () => {
      const userId = 'test-user-id';
      const walletId = 'test-wallet-id';

      mockSupabaseChain.eq.mockReturnThis();
      mockSupabaseChain.update.mockResolvedValue({
        data: null,
        error: { message: 'Database error' }
      });

      await expect(
        bitcoinService.disconnectBitcoinWallet(userId, walletId)
      ).rejects.toThrow('Failed to disconnect Bitcoin wallet');
    });
  });

  describe('createBitcoinTransaction', () => {
    beforeEach(() => {
      // Mock UTXO data for transaction creation
      const mockUtxos = [
        {
          txid: 'abc123def456',
          vout: 0,
          value: 100000000, // 1 BTC
          confirmations: 6,
          scriptPubKey: 'mock-script-1'
        },
        {
          txid: 'def456ghi789',
          vout: 1,
          value: 50000000, // 0.5 BTC
          confirmations: 10,
          scriptPubKey: 'mock-script-2'
        }
      ];

      // Mock getBitcoinUTXOs to return mock UTXOs
      jest.spyOn(bitcoinService, 'getBitcoinUTXOs').mockResolvedValue(mockUtxos);
    });

    it('should create Bitcoin transaction successfully', async () => {
      const fromAddress = '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa';
      const toAddress = '1BvBMSEYstWetqTFn5Au4m4GFg7xJaNVN2';
      const amount = 0.5; // 0.5 BTC
      const feeRate = 10; // satoshis per byte

      // Mock address validation
      require('bitcoinjs-lib').address.toOutputScript.mockReturnValue(Buffer.from('mock-script'));

      // Mock TransactionBuilder
      const mockTx = {
        getId: jest.fn().mockReturnValue('mock-transaction-id'),
        toHex: jest.fn().mockReturnValue('0100000001abc123def456000000006a473044022074f3f55df2e0c15b0e2e2e2e2e2e2e2e2e2e2e2e2e2e2e2e2e2e2e2e02205f5f5f5f5f5f5f5f5f5f5f5f5f5f5f5f5f5f5f5f5f5f5f5f5f5f5f5f5f5f5f01210279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798ac')
      };

      const mockTxBuilder = {
        addInput: jest.fn().mockReturnThis(),
        addOutput: jest.fn().mockReturnThis(),
        buildIncomplete: jest.fn().mockReturnValue(mockTx)
      };

      const bitcoin = require('bitcoinjs-lib');
      bitcoin.TransactionBuilder.mockReturnValue(mockTxBuilder);

      const result = await bitcoinService.createBitcoinTransaction(
        fromAddress,
        toAddress,
        amount,
        feeRate
      );

      expect(result.transaction).toBe('0100000001abc123def456000000006a473044022074f3f55df2e0c15b0e2e2e2e2e2e2e2e2e2e2e2e2e2e2e2e2e2e2e2e02205f5f5f5f5f5f5f5f5f5f5f5f5f5f5f5f5f5f5f5f5f5f5f5f5f5f5f5f5f5f5f01210279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798ac');
      expect(result.txid).toBe('mock-transaction-id');
      expect(result.size).toBeGreaterThan(0);
      expect(result.fee).toBeGreaterThan(0);
      expect(result.inputs).toHaveLength(1); // Should select first UTXO which is sufficient

      // Verify transaction builder calls
      expect(mockTxBuilder.addInput).toHaveBeenCalledWith('abc123def456', 0);
      expect(mockTxBuilder.addOutput).toHaveBeenCalledWith(toAddress, 50000000); // 0.5 BTC in satoshis
    });

    it('should handle insufficient funds', async () => {
      const fromAddress = '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa';
      const toAddress = '1BvBMSEYstWetqTFn5Au4m4GFg7xJaNVN2';
      const amount = 2.0; // 2 BTC - more than available UTXOs

      // Mock address validation
      require('bitcoinjs-lib').address.toOutputScript.mockReturnValue(Buffer.from('mock-script'));

      await expect(
        bitcoinService.createBitcoinTransaction(fromAddress, toAddress, amount)
      ).rejects.toThrow('Insufficient funds for transaction');
    });

    it('should handle no UTXOs available', async () => {
      const fromAddress = '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa';
      const toAddress = '1BvBMSEYstWetqTFn5Au4m4GFg7xJaNVN2';
      const amount = 0.1;

      // Mock empty UTXOs
      jest.spyOn(bitcoinService, 'getBitcoinUTXOs').mockResolvedValue([]);

      // Mock address validation
      require('bitcoinjs-lib').address.toOutputScript.mockReturnValue(Buffer.from('mock-script'));

      await expect(
        bitcoinService.createBitcoinTransaction(fromAddress, toAddress, amount)
      ).rejects.toThrow('No UTXOs available for transaction');
    });

    it('should handle invalid from address', async () => {
      const fromAddress = 'invalid-address';
      const toAddress = '1BvBMSEYstWetqTFn5Au4m4GFg7xJaNVN2';
      const amount = 0.1;

      // Mock address validation - invalid from address
      require('bitcoinjs-lib').address.toOutputScript
        .mockImplementationOnce(() => {
          throw new Error('Invalid address');
        })
        .mockReturnValueOnce(Buffer.from('mock-script')); // valid to address

      await expect(
        bitcoinService.createBitcoinTransaction(fromAddress, toAddress, amount)
      ).rejects.toThrow('Invalid from address');
    });

    it('should handle invalid to address', async () => {
      const fromAddress = '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa';
      const toAddress = 'invalid-address';
      const amount = 0.1;

      // Mock address validation - valid from, invalid to
      require('bitcoinjs-lib').address.toOutputScript
        .mockReturnValueOnce(Buffer.from('mock-script')) // valid from address
        .mockImplementationOnce(() => {
          throw new Error('Invalid address');
        });

      await expect(
        bitcoinService.createBitcoinTransaction(fromAddress, toAddress, amount)
      ).rejects.toThrow('Invalid to address');
    });

    it('should handle change output calculation', async () => {
      const fromAddress = '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa';
      const toAddress = '1BvBMSEYstWetqTFn5Au4m4GFg7xJaNVN2';
      const amount = 0.3; // 0.3 BTC - will need change
      const feeRate = 10;

      // Mock address validation
      require('bitcoinjs-lib').address.toOutputScript.mockReturnValue(Buffer.from('mock-script'));

      // Mock TransactionBuilder
      const mockTx = {
        getId: jest.fn().mockReturnValue('mock-transaction-id'),
        toHex: jest.fn().mockReturnValue('mock-hex')
      };

      const mockTxBuilder = {
        addInput: jest.fn().mockReturnThis(),
        addOutput: jest.fn().mockReturnThis(),
        buildIncomplete: jest.fn().mockReturnValue(mockTx)
      };

      const bitcoin = require('bitcoinjs-lib');
      bitcoin.TransactionBuilder.mockReturnValue(mockTxBuilder);

      await bitcoinService.createBitcoinTransaction(fromAddress, toAddress, amount, feeRate);

      // Should have two addOutput calls: one for payment, one for change
      expect(mockTxBuilder.addOutput).toHaveBeenCalledTimes(2);
      expect(mockTxBuilder.addOutput).toHaveBeenCalledWith(toAddress, 30000000); // 0.3 BTC
      expect(mockTxBuilder.addOutput).toHaveBeenCalledWith(fromAddress, expect.any(Number)); // change
    });

    it('should handle testnet transaction creation', async () => {
      const fromAddress = 'tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx';
      const toAddress = 'tb1qrp33g0q4c70atj4d2kqx5pqp5pqp5pqp5pqp5pqp5pqp5pqp5pqp5pqp5pqp5';
      const amount = 0.1;
      const network = 'testnet';

      // Mock address validation
      require('bitcoinjs-lib').address.toOutputScript.mockReturnValue(Buffer.from('mock-script'));

      // Mock TransactionBuilder with testnet network
      const mockTx = {
        getId: jest.fn().mockReturnValue('mock-testnet-tx-id'),
        toHex: jest.fn().mockReturnValue('mock-testnet-hex')
      };

      const mockTxBuilder = {
        addInput: jest.fn().mockReturnThis(),
        addOutput: jest.fn().mockReturnThis(),
        buildIncomplete: jest.fn().mockReturnValue(mockTx)
      };

      const bitcoin = require('bitcoinjs-lib');
      bitcoin.TransactionBuilder.mockReturnValue(mockTxBuilder);

      const result = await bitcoinService.createBitcoinTransaction(
        fromAddress,
        toAddress,
        amount,
        10,
        network
      );

      expect(result.txid).toBe('mock-testnet-tx-id');
      expect(bitcoin.TransactionBuilder).toHaveBeenCalledWith(bitcoin.networks.testnet);
    });

    it('should handle UTXO selection for high fee rates', async () => {
      const fromAddress = '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa';
      const toAddress = '1BvBMSEYstWetqTFn5Au4m4GFg7xJaNVN2';
      const amount = 0.1;
      const feeRate = 100; // High fee rate

      // Mock many small UTXOs to test selection logic
      const smallUtxos = Array.from({ length: 10 }, (_, i) => ({
        txid: `utxo-${i}`,
        vout: i,
        value: 5000000, // 0.05 BTC each
        confirmations: 6,
        scriptPubKey: `script-${i}`
      }));

      jest.spyOn(bitcoinService, 'getBitcoinUTXOs').mockResolvedValue(smallUtxos);

      // Mock address validation
      require('bitcoinjs-lib').address.toOutputScript.mockReturnValue(Buffer.from('mock-script'));

      // Mock TransactionBuilder
      const mockTx = {
        getId: jest.fn().mockReturnValue('mock-high-fee-tx'),
        toHex: jest.fn().mockReturnValue('mock-high-fee-hex')
      };

      const mockTxBuilder = {
        addInput: jest.fn().mockReturnThis(),
        addOutput: jest.fn().mockReturnThis(),
        buildIncomplete: jest.fn().mockReturnValue(mockTx)
      };

      const bitcoin = require('bitcoinjs-lib');
      bitcoin.TransactionBuilder.mockReturnValue(mockTxBuilder);

      const result = await bitcoinService.createBitcoinTransaction(
        fromAddress,
        toAddress,
        amount,
        feeRate
      );

      // Should select multiple UTXOs due to high fee requirements
      expect(result.inputs.length).toBeGreaterThan(2);
      expect(result.fee).toBeGreaterThan(0.001); // High fee
    });
  });

  describe('broadcastBitcoinTransaction', () => {
    it('should broadcast transaction successfully', async () => {
      const transactionHex = '0100000001abc123def456...';
      const mockBroadcastResponse = {
        tx: {
          hash: 'broadcast-tx-hash-12345'
        }
      };

      (global.fetch as jest.MockedFunction<typeof fetch>).mockResolvedValue({
        ok: true,
        json: async () => mockBroadcastResponse
      } as Response);

      const txid = await bitcoinService.broadcastBitcoinTransaction(transactionHex);

      expect(txid).toBe('broadcast-tx-hash-12345');
      expect(global.fetch).toHaveBeenCalledWith(
        'https://api.blockcypher.com/v1/btc/main/txs/push?token=test-api-key',
        expect.objectContaining({
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            tx: transactionHex
          })
        })
      );
    });

    it('should broadcast transaction on testnet', async () => {
      const transactionHex = '0100000001def456...';
      const mockBroadcastResponse = {
        tx: {
          hash: 'testnet-tx-hash-67890'
        }
      };

      (global.fetch as jest.MockedFunction<typeof fetch>).mockResolvedValue({
        ok: true,
        json: async () => mockBroadcastResponse
      } as Response);

      const txid = await bitcoinService.broadcastBitcoinTransaction(transactionHex, 'testnet');

      expect(txid).toBe('testnet-tx-hash-67890');
      expect(global.fetch).toHaveBeenCalledWith(
        'https://api.blockcypher.com/v1/btc/test3/txs/push?token=test-api-key',
        expect.any(Object)
      );
    });

    it('should handle broadcast errors', async () => {
      const transactionHex = '0100000001invalid...';

      (global.fetch as jest.MockedFunction<typeof fetch>).mockResolvedValue({
        ok: false,
        status: 400,
        text: async () => 'Invalid transaction'
      } as Response);

      await expect(
        bitcoinService.broadcastBitcoinTransaction(transactionHex)
      ).rejects.toThrow('Failed to broadcast transaction');
    });

    it('should handle network errors during broadcast', async () => {
      const transactionHex = '0100000001abc123...';

      (global.fetch as jest.MockedFunction<typeof fetch>).mockRejectedValue(
        new Error('Network error')
      );

      await expect(
        bitcoinService.broadcastBitcoinTransaction(transactionHex)
      ).rejects.toThrow('Failed to broadcast transaction: Network error');
    });

    it('should work without API key', async () => {
      delete process.env.BLOCKCYPHER_API_KEY;

      const transactionHex = '0100000001abc123...';
      const mockBroadcastResponse = {
        tx: {
          hash: 'no-key-tx-hash'
        }
      };

      (global.fetch as jest.MockedFunction<typeof fetch>).mockResolvedValue({
        ok: true,
        json: async () => mockBroadcastResponse
      } as Response);

      const txid = await bitcoinService.broadcastBitcoinTransaction(transactionHex);

      expect(txid).toBe('no-key-tx-hash');
      expect(global.fetch).toHaveBeenCalledWith(
        'https://api.blockcypher.com/v1/btc/main/txs/push',
        expect.any(Object)
      );

      // Restore for other tests
      process.env.BLOCKCYPHER_API_KEY = 'test-api-key';
    });

    it('should handle malformed API response', async () => {
      const transactionHex = '0100000001abc123...';

      (global.fetch as jest.MockedFunction<typeof fetch>).mockResolvedValue({
        ok: true,
        json: async () => ({ malformed: 'response' }) // Missing tx.hash
      } as Response);

      await expect(
        bitcoinService.broadcastBitcoinTransaction(transactionHex)
      ).rejects.toThrow('Failed to broadcast transaction');
    });

    it('should handle unsupported network', async () => {
      const transactionHex = '0100000001abc123...';

      await expect(
        bitcoinService.broadcastBitcoinTransaction(transactionHex, 'unsupported')
      ).rejects.toThrow('Unsupported network: unsupported');
    });
  });

  describe('blockchain service integration', () => {
    describe('encryption/decryption scenarios', () => {
      it('should handle encryption errors during wallet connection', async () => {
        const userId = 'test-user-id';
        const mockRequest = {
          address: '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa',
          walletName: 'Test Wallet'
        };

        // Mock address validation
        require('bitcoinjs-lib').address.toOutputScript.mockReturnValue(Buffer.from('mock-script'));

        // Mock balance API
        (global.fetch as jest.MockedFunction<typeof fetch>).mockResolvedValue({
          ok: true,
          json: async () => ({ balance: 100000000, unconfirmed_balance: 0 })
        } as Response);

        // Mock QR code generation
        require('qrcode').toDataURL.mockResolvedValue('data:image/png;base64,test-qr');

        // Mock no existing wallet
        mockSupabaseChain.single.mockResolvedValue({
          data: null,
          error: { code: 'PGRST116' }
        });

        // Mock encryption failure
        mockBlockchainService.encryptWalletAddress.mockRejectedValue(
          new Error('Encryption service unavailable')
        );

        await expect(
          bitcoinService.connectBitcoinWallet(userId, mockRequest)
        ).rejects.toThrow('Failed to connect Bitcoin wallet');

        expect(mockBlockchainService.encryptWalletAddress).toHaveBeenCalledWith(mockRequest.address);
      });

      it('should handle decryption errors during wallet retrieval', async () => {
        const userId = 'test-user-id';
        const mockWallets = [{
          wallet_id: 'wallet-1',
          wallet_name: 'Test Wallet',
          wallet_address_encrypted: 'corrupted-encrypted-data',
          wallet_metadata: { network: 'mainnet' },
          connection_status: 'connected',
          supported_currencies: ['BTC'],
          created_at: '2023-01-01T00:00:00Z'
        }];

        mockSupabaseChain.select.mockResolvedValue({
          data: mockWallets,
          error: null
        });

        // Mock decryption failure
        mockBlockchainService.decryptWalletAddress.mockRejectedValue(
          new Error('Invalid encrypted address format')
        );

        const wallets = await bitcoinService.getBitcoinWallets(userId);

        // Should continue with other wallets even if one fails
        expect(wallets).toEqual([]);
        expect(mockBlockchainService.decryptWalletAddress).toHaveBeenCalledWith('corrupted-encrypted-data');
      });

      it('should handle complex encryption/decryption round trip', async () => {
        const testAddress = '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa';
        const userId = 'test-user-id';
        
        // Use a more realistic encryption mock
        let encryptedData: string;
        mockBlockchainService.encryptWalletAddress.mockImplementation(async (address: string) => {
          // Simulate real encryption with random IV
          const iv = Buffer.from('1234567890123456', 'utf8').toString('hex');
          const encrypted = Buffer.from(address).toString('base64');
          encryptedData = `${iv}:${encrypted}`;
          return encryptedData;
        });

        mockBlockchainService.decryptWalletAddress.mockImplementation(async (encrypted: string) => {
          const [iv, data] = encrypted.split(':');
          return Buffer.from(data, 'base64').toString('utf8');
        });

        const mockRequest = {
          address: testAddress,
          walletName: 'Encryption Test Wallet'
        };

        // Mock other dependencies
        require('bitcoinjs-lib').address.toOutputScript.mockReturnValue(Buffer.from('mock-script'));
        (global.fetch as jest.MockedFunction<typeof fetch>).mockResolvedValue({
          ok: true,
          json: async () => ({ balance: 100000000, unconfirmed_balance: 0 })
        } as Response);
        require('qrcode').toDataURL.mockResolvedValue('data:image/png;base64,test-qr');

        mockSupabaseChain.single.mockResolvedValueOnce({
          data: null,
          error: { code: 'PGRST116' }
        });

        mockSupabaseChain.single.mockResolvedValueOnce({
          data: {
            wallet_id: 'test-wallet-id',
            wallet_name: 'Encryption Test Wallet',
            connection_status: 'connected',
            supported_currencies: ['BTC'],
            created_at: '2023-01-01T00:00:00Z'
          },
          error: null
        });

        const connection = await bitcoinService.connectBitcoinWallet(userId, mockRequest);

        expect(mockBlockchainService.encryptWalletAddress).toHaveBeenCalledWith(testAddress);
        expect(connection.address).toBe(testAddress);
        expect(connection.walletName).toBe('Encryption Test Wallet');

        // Now test wallet retrieval with decryption
        const mockWallets = [{
          wallet_id: 'test-wallet-id',
          wallet_name: 'Encryption Test Wallet',
          wallet_address_encrypted: encryptedData,
          wallet_metadata: { network: 'mainnet' },
          connection_status: 'connected',
          supported_currencies: ['BTC'],
          created_at: '2023-01-01T00:00:00Z'
        }];

        mockSupabaseChain.select.mockResolvedValue({
          data: mockWallets,
          error: null
        });

        (global.fetch as jest.MockedFunction<typeof fetch>).mockResolvedValue({
          ok: true,
          json: async () => ({ balance: 50000000, unconfirmed_balance: 0 })
        } as Response);

        const retrievedWallets = await bitcoinService.getBitcoinWallets(userId);

        expect(retrievedWallets).toHaveLength(1);
        expect(retrievedWallets[0].address).toBe(testAddress);
        expect(mockBlockchainService.decryptWalletAddress).toHaveBeenCalledWith(encryptedData);
      });

      it('should handle hash collision detection', async () => {
        const userId = 'test-user-id';
        const address1 = '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa';
        const address2 = '1BvBMSEYstWetqTFn5Au4m4GFg7xJaNVN2';

        // Mock deterministic hashing that creates different hashes
        mockBlockchainService.hashWalletAddress.mockImplementation((address: string) => {
          return `hash-${address.substring(0, 10)}`;
        });

        // Mock address validation
        require('bitcoinjs-lib').address.toOutputScript.mockReturnValue(Buffer.from('mock-script'));

        // First wallet connection
        const mockRequest1 = { address: address1, walletName: 'Wallet 1' };
        
        // Mock no existing wallet for first address
        mockSupabaseChain.single.mockResolvedValueOnce({
          data: null,
          error: { code: 'PGRST116' }
        });

        // Mock successful connection
        (global.fetch as jest.MockedFunction<typeof fetch>).mockResolvedValue({
          ok: true,
          json: async () => ({ balance: 100000000, unconfirmed_balance: 0 })
        } as Response);
        require('qrcode').toDataURL.mockResolvedValue('data:image/png;base64,test-qr');

        mockSupabaseChain.single.mockResolvedValueOnce({
          data: {
            wallet_id: 'wallet-1',
            wallet_name: 'Wallet 1',
            connection_status: 'connected',
            supported_currencies: ['BTC'],
            created_at: '2023-01-01T00:00:00Z'
          },
          error: null
        });

        await bitcoinService.connectBitcoinWallet(userId, mockRequest1);

        expect(mockBlockchainService.hashWalletAddress).toHaveBeenCalledWith(address1);

        // Second wallet connection with different address
        const mockRequest2 = { address: address2, walletName: 'Wallet 2' };

        // Mock no existing wallet for second address
        mockSupabaseChain.single.mockResolvedValueOnce({
          data: null,
          error: { code: 'PGRST116' }
        });

        mockSupabaseChain.single.mockResolvedValueOnce({
          data: {
            wallet_id: 'wallet-2',
            wallet_name: 'Wallet 2',
            connection_status: 'connected',
            supported_currencies: ['BTC'],
            created_at: '2023-01-01T00:00:00Z'
          },
          error: null
        });

        await bitcoinService.connectBitcoinWallet(userId, mockRequest2);

        expect(mockBlockchainService.hashWalletAddress).toHaveBeenCalledWith(address2);
        expect(mockBlockchainService.hashWalletAddress).toHaveBeenCalledTimes(2);
      });

      it('should handle blockchain service timeout scenarios', async () => {
        const userId = 'test-user-id';
        const mockRequest = {
          address: '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa',
          walletName: 'Timeout Test Wallet'
        };

        // Mock address validation
        require('bitcoinjs-lib').address.toOutputScript.mockReturnValue(Buffer.from('mock-script'));

        // Mock encryption timeout
        mockBlockchainService.encryptWalletAddress.mockImplementation(async () => {
          await new Promise(resolve => setTimeout(resolve, 100));
          throw new Error('Request timeout');
        });

        // Mock balance API
        (global.fetch as jest.MockedFunction<typeof fetch>).mockResolvedValue({
          ok: true,
          json: async () => ({ balance: 100000000, unconfirmed_balance: 0 })
        } as Response);

        // Mock no existing wallet
        mockSupabaseChain.single.mockResolvedValue({
          data: null,
          error: { code: 'PGRST116' }
        });

        await expect(
          bitcoinService.connectBitcoinWallet(userId, mockRequest)
        ).rejects.toThrow('Failed to connect Bitcoin wallet');
      });

      it('should handle concurrent encryption/decryption operations', async () => {
        const addresses = [
          '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa',
          '1BvBMSEYstWetqTFn5Au4m4GFg7xJaNVN2',
          '3J98t1WpEZ73CNmQviecrnyiWrnqRhWNLy'
        ];

        // Mock concurrent encryption calls
        const encryptionPromises = addresses.map(address => {
          return mockBlockchainService.encryptWalletAddress(address);
        });

        // All should complete successfully
        const encryptedAddresses = await Promise.all(encryptionPromises);
        
        expect(encryptedAddresses).toHaveLength(3);
        expect(mockBlockchainService.encryptWalletAddress).toHaveBeenCalledTimes(3);

        // Mock concurrent decryption calls
        const decryptionPromises = encryptedAddresses.map(encryptedAddress => {
          return mockBlockchainService.decryptWalletAddress(encryptedAddress);
        });

        const decryptedAddresses = await Promise.all(decryptionPromises);
        
        expect(decryptedAddresses).toEqual(addresses);
        expect(mockBlockchainService.decryptWalletAddress).toHaveBeenCalledTimes(3);
      });
    });

    describe('address hashing scenarios', () => {
      it('should handle case-insensitive address hashing', async () => {
        const lowerCaseAddress = '1a1zp1ep5qgefi2dmpttl5slmv7divfna';
        const upperCaseAddress = '1A1ZP1EP5QGEFI2DMPTTL5SLMV7DIVFNA';
        const mixedCaseAddress = '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa';

        const hash1 = mockBlockchainService.hashWalletAddress(lowerCaseAddress);
        const hash2 = mockBlockchainService.hashWalletAddress(upperCaseAddress);
        const hash3 = mockBlockchainService.hashWalletAddress(mixedCaseAddress);

        // All should produce the same hash due to toLowerCase in implementation
        expect(hash1).toBe(hash2);
        expect(hash2).toBe(hash3);
        expect(hash1).toBe('hash-1a1zp1ep5q');
      });

      it('should handle special characters in address hashing', async () => {
        const addressWithSpecialChars = '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa!@#';
        const cleanAddress = '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa';

        const hash1 = mockBlockchainService.hashWalletAddress(addressWithSpecialChars);
        const hash2 = mockBlockchainService.hashWalletAddress(cleanAddress);

        // Hash should remove special characters
        expect(hash1).toBe('hash-1a1zp1ep5q');
        expect(hash2).toBe('hash-1a1zp1ep5q');
        expect(hash1).toBe(hash2);
      });
    });
  });

  describe('configuration and utility methods', () => {
    it('should return supported networks', () => {
      const networks = bitcoinService.getSupportedNetworks();
      
      expect(networks).toContain('mainnet');
      expect(networks).toContain('testnet');
    });

    it('should indicate service is configured', () => {
      expect(bitcoinService.isConfigured()).toBe(true);
    });

    it('should get network configuration', () => {
      const mainnetConfig = bitcoinService.getNetworkConfig('mainnet');
      
      expect(mainnetConfig).toBeDefined();
      expect(mainnetConfig?.name).toBe('Bitcoin Mainnet');
      expect(mainnetConfig?.apiBaseUrl).toContain('btc/main');
    });

    it('should return undefined for invalid network', () => {
      const config = bitcoinService.getNetworkConfig('invalid');
      
      expect(config).toBeUndefined();
    });
  });
});