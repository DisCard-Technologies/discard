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

// Mock Supabase  
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
  from: jest.fn().mockReturnThis()
};

jest.mock('../../../../app', () => ({
  supabase: {
    from: jest.fn(() => mockSupabaseChain)
  }
}));

// Mock fetch globally
global.fetch = jest.fn() as jest.MockedFunction<typeof fetch>;

describe('BitcoinService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    
    // Reset mock functions
    const bitcoin = require('bitcoinjs-lib');
    bitcoin.address.toOutputScript.mockClear();
    
    // Create a smart mock that handles any chain length
    const createChainableMock = (terminalData) => {
      const chainMock = jest.fn().mockImplementation(() => chainMock);
      chainMock.mockResolvedValue = jest.fn().mockResolvedValue(terminalData);
      
      // Make it resolve to terminal data when awaited
      chainMock.then = jest.fn((resolve) => {
        resolve(terminalData);
        return chainMock;
      });
      
      return chainMock;
    };
    
    // Reset all methods to be chainable and return appropriate terminal data
    mockSupabaseChain.select.mockImplementation(() => createChainableMock({ data: [], error: null }));
    mockSupabaseChain.insert.mockImplementation(() => createChainableMock({ data: { wallet_id: 'mock-wallet-id' }, error: null }));
    mockSupabaseChain.update.mockImplementation(() => createChainableMock({ data: null, error: null }));
    mockSupabaseChain.single.mockResolvedValue({ data: null, error: null });
    
    // Set up specific method chains for Bitcoin service patterns
    
    // For getBitcoinWallets: .select().eq().eq().eq()
    const getBitcoinWalletsChain = {
      eq: jest.fn().mockImplementation(() => ({
        eq: jest.fn().mockImplementation(() => ({
          eq: jest.fn().mockResolvedValue({ data: [], error: null })
        }))
      }))
    };
    
    // For connectBitcoinWallet: .insert().select()  
    const connectBitcoinWalletChain = {
      select: jest.fn().mockResolvedValue({ data: { wallet_id: 'mock-wallet-id' }, error: null })
    };
    
    // For disconnectBitcoinWallet: .update().eq().eq().eq()
    const disconnectBitcoinWalletChain = {
      eq: jest.fn().mockImplementation(() => ({
        eq: jest.fn().mockImplementation(() => ({
          eq: jest.fn().mockResolvedValue({ data: null, error: null })
        }))
      }))
    };
    
    // Override specific methods with our chains
    mockSupabaseChain.select.mockReturnValue(getBitcoinWalletsChain);
    mockSupabaseChain.insert.mockReturnValue(connectBitcoinWalletChain);  
    mockSupabaseChain.update.mockReturnValue(disconnectBitcoinWalletChain);
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