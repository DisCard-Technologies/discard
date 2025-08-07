/**
 * Integration Test: Crypto Wallet Operations with Real PostgreSQL
 * Demonstrates TestContainers usage for database-dependent crypto operations
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from '@jest/globals';
import { getTestDb } from '../setup/testcontainers-setup';
import { TestDatabase } from '../utils/test-database';

// Import services to test
import { bitcoinService } from '../../services/crypto/bitcoin.service';

// Mock external dependencies while keeping database real
jest.mock('bitcoinjs-lib', () => ({
  networks: {
    bitcoin: { name: 'mainnet' },
    testnet: { name: 'testnet' }
  },
  address: {
    toOutputScript: jest.fn()
  }
}));

jest.mock('../../services/crypto/blockchain.service', () => ({
  blockchainService: {
    encryptWalletAddress: jest.fn().mockImplementation((address: string) => `encrypted_${address}`),
    decryptWalletAddress: jest.fn().mockImplementation((encrypted: string) => encrypted.replace('encrypted_', '')),
    hashWalletAddress: jest.fn().mockImplementation((address: string) => `hash_${address}`),
    validateWalletAddress: jest.fn().mockReturnValue(true)
  }
}));

describe('Crypto Wallet Integration Tests with TestContainers', () => {
  let testDb: TestDatabase;

  beforeAll(async () => {
    testDb = getTestDb();
  });

  beforeEach(async () => {
    // Database is automatically reset between tests via testcontainers-setup.ts
    jest.clearAllMocks();
  });

  describe('Bitcoin Wallet Database Operations', () => {
    it('should store and retrieve Bitcoin wallet with real database', async () => {
      const client = testDb.getClient();
      
      // Create a new Bitcoin wallet record
      const walletData = {
        wallet_id: '77777777-7777-7777-7777-777777777777',
        user_id: '11111111-1111-1111-1111-111111111111', // Test user from seeded data
        wallet_type: 'bitcoin',
        wallet_name: 'Integration Test BTC Wallet',
        wallet_address_encrypted: 'encrypted_1BitcoinAddress123456789',
        wallet_address_hash: 'hash_integration_test_btc',
        network: 'mainnet',
        supported_currencies: ['BTC']
      };

      // Insert wallet using real database
      const insertResult = await client.query(`
        INSERT INTO crypto_wallets (
          wallet_id, user_id, wallet_type, wallet_name, 
          wallet_address_encrypted, wallet_address_hash, network, supported_currencies
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING *
      `, [
        walletData.wallet_id,
        walletData.user_id,
        walletData.wallet_type,
        walletData.wallet_name,
        walletData.wallet_address_encrypted,
        walletData.wallet_address_hash,
        walletData.network,
        walletData.supported_currencies
      ]);

      expect(insertResult.rows).toHaveLength(1);
      expect(insertResult.rows[0].wallet_id).toBe(walletData.wallet_id);
      expect(insertResult.rows[0].wallet_type).toBe('bitcoin');

      // Retrieve wallet using real database
      const selectResult = await client.query(`
        SELECT * FROM crypto_wallets WHERE wallet_id = $1
      `, [walletData.wallet_id]);

      expect(selectResult.rows).toHaveLength(1);
      const retrievedWallet = selectResult.rows[0];
      
      expect(retrievedWallet.wallet_id).toBe(walletData.wallet_id);
      expect(retrievedWallet.user_id).toBe(walletData.user_id);
      expect(retrievedWallet.wallet_type).toBe('bitcoin');
      expect(retrievedWallet.wallet_name).toBe('Integration Test BTC Wallet');
      expect(retrievedWallet.supported_currencies).toEqual(['BTC']);
      expect(retrievedWallet.network).toBe('mainnet');
    });

    it('should handle wallet address encryption/decryption flow', async () => {
      const client = testDb.getClient();
      const testAddress = '1TestBitcoinAddress123456789';
      
      // Mock blockchain service behavior
      const { blockchainService } = require('../../services/crypto/blockchain.service');
      blockchainService.encryptWalletAddress.mockReturnValue(`encrypted_${testAddress}`);
      blockchainService.hashWalletAddress.mockReturnValue(`hash_${testAddress}`);
      blockchainService.decryptWalletAddress.mockReturnValue(testAddress);

      // Create wallet with encrypted address
      const walletId = '88888888-8888-8888-8888-888888888888';
      const encryptedAddress = blockchainService.encryptWalletAddress(testAddress);
      const hashedAddress = blockchainService.hashWalletAddress(testAddress);

      await client.query(`
        INSERT INTO crypto_wallets (
          wallet_id, user_id, wallet_type, wallet_name,
          wallet_address_encrypted, wallet_address_hash
        ) VALUES ($1, $2, $3, $4, $5, $6)
      `, [
        walletId,
        '11111111-1111-1111-1111-111111111111',
        'bitcoin',
        'Encryption Test Wallet',
        encryptedAddress,
        hashedAddress
      ]);

      // Retrieve and decrypt
      const result = await client.query(`
        SELECT wallet_address_encrypted FROM crypto_wallets WHERE wallet_id = $1
      `, [walletId]);

      expect(result.rows).toHaveLength(1);
      
      const retrievedEncrypted = result.rows[0].wallet_address_encrypted;
      const decryptedAddress = blockchainService.decryptWalletAddress(retrievedEncrypted);

      expect(decryptedAddress).toBe(testAddress);
      expect(blockchainService.encryptWalletAddress).toHaveBeenCalledWith(testAddress);
      expect(blockchainService.decryptWalletAddress).toHaveBeenCalledWith(encryptedAddress);
    });
  });

  describe('Transaction History with Real Database', () => {
    it('should store and query transaction history', async () => {
      const client = testDb.getClient();

      // Use existing test wallet from seeded data
      const walletId = '44444444-4444-4444-4444-444444444444'; // Bitcoin wallet from test data

      // Create multiple transactions
      const transactions = [
        {
          transaction_id: '99999999-9999-9999-9999-999999999999',
          transaction_hash: '0xintegration_test_tx_1',
          from_address: '1FromAddress123',
          to_address: '1ToAddress456',
          amount: '0.5',
          currency: 'BTC',
          network: 'mainnet',
          transaction_type: 'send',
          status: 'confirmed'
        },
        {
          transaction_id: '99999999-9999-9999-9999-999999999998',
          transaction_hash: '0xintegration_test_tx_2',
          from_address: '1FromAddress789',
          to_address: '1ToAddress123',
          amount: '1.0',
          currency: 'BTC',
          network: 'mainnet',
          transaction_type: 'receive',
          status: 'pending'
        }
      ];

      // Insert transactions
      for (const tx of transactions) {
        await client.query(`
          INSERT INTO crypto_transactions (
            transaction_id, wallet_id, transaction_hash, from_address, to_address,
            amount, currency, network, transaction_type, status
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        `, [
          tx.transaction_id, walletId, tx.transaction_hash, tx.from_address,
          tx.to_address, tx.amount, tx.currency, tx.network, tx.transaction_type, tx.status
        ]);
      }

      // Query transaction history
      const historyResult = await client.query(`
        SELECT * FROM crypto_transactions 
        WHERE wallet_id = $1 
        ORDER BY created_at DESC
      `, [walletId]);

      expect(historyResult.rows.length).toBeGreaterThanOrEqual(3); // 2 new + 1 seeded

      // Verify new transactions
      const newTransactions = historyResult.rows.filter(tx => 
        tx.transaction_hash.includes('integration_test')
      );
      
      expect(newTransactions).toHaveLength(2);
      expect(newTransactions[0].currency).toBe('BTC');
      expect(newTransactions[1].currency).toBe('BTC');

      // Test filtering by status
      const confirmedTxs = await client.query(`
        SELECT * FROM crypto_transactions 
        WHERE wallet_id = $1 AND status = 'confirmed'
        ORDER BY created_at DESC
      `, [walletId]);

      const confirmedCount = confirmedTxs.rows.filter(tx => 
        tx.transaction_hash.includes('integration_test')
      ).length;
      
      expect(confirmedCount).toBe(1);
    });
  });

  describe('Multi-User Wallet Isolation', () => {
    it('should properly isolate wallets between users', async () => {
      const client = testDb.getClient();

      const user1Id = '11111111-1111-1111-1111-111111111111';
      const user2Id = '22222222-2222-2222-2222-222222222222';

      // Create wallets for both users
      await client.query(`
        INSERT INTO crypto_wallets (
          wallet_id, user_id, wallet_type, wallet_name, 
          wallet_address_encrypted, wallet_address_hash
        ) VALUES 
          ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', $1, 'bitcoin', 'User 1 BTC', 'enc_user1_btc', 'hash_user1_btc'),
          ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', $2, 'bitcoin', 'User 2 BTC', 'enc_user2_btc', 'hash_user2_btc')
      `, [user1Id, user2Id]);

      // Query wallets for user 1
      const user1Wallets = await client.query(`
        SELECT * FROM crypto_wallets WHERE user_id = $1
      `, [user1Id]);

      // Query wallets for user 2  
      const user2Wallets = await client.query(`
        SELECT * FROM crypto_wallets WHERE user_id = $1
      `, [user2Id]);

      // User 1 should have 3 wallets (2 seeded + 1 new)
      expect(user1Wallets.rows.length).toBeGreaterThanOrEqual(3);
      
      // User 2 should have 1 wallet (1 new, no seeded wallets for user 2)
      expect(user2Wallets.rows.length).toBe(1);

      // Verify isolation - user 1 wallets should not appear in user 2 results
      const user1WalletIds = user1Wallets.rows.map(w => w.wallet_id);
      const user2WalletIds = user2Wallets.rows.map(w => w.wallet_id);

      const overlap = user1WalletIds.filter(id => user2WalletIds.includes(id));
      expect(overlap).toHaveLength(0);
    });
  });

  describe('Database Constraints and Validation', () => {
    it('should enforce unique wallet address hash constraint', async () => {
      const client = testDb.getClient();

      const duplicateHash = 'duplicate_hash_test';

      // Insert first wallet
      await client.query(`
        INSERT INTO crypto_wallets (
          wallet_id, user_id, wallet_type, wallet_name,
          wallet_address_encrypted, wallet_address_hash
        ) VALUES ($1, $2, $3, $4, $5, $6)
      `, [
        'cccccccc-cccc-cccc-cccc-cccccccccccc',
        '11111111-1111-1111-1111-111111111111',
        'bitcoin',
        'First Wallet',
        'encrypted_first',
        duplicateHash
      ]);

      // Attempt to insert second wallet with same hash should fail
      await expect(
        client.query(`
          INSERT INTO crypto_wallets (
            wallet_id, user_id, wallet_type, wallet_name,
            wallet_address_encrypted, wallet_address_hash
          ) VALUES ($1, $2, $3, $4, $5, $6)
        `, [
          'dddddddd-dddd-dddd-dddd-dddddddddddd',
          '11111111-1111-1111-1111-111111111111',
          'bitcoin',
          'Second Wallet',
          'encrypted_second',
          duplicateHash
        ])
      ).rejects.toThrow();
    });

    it('should enforce foreign key constraints', async () => {
      const client = testDb.getClient();

      // Attempt to create wallet for non-existent user should fail
      await expect(
        client.query(`
          INSERT INTO crypto_wallets (
            wallet_id, user_id, wallet_type, wallet_name,
            wallet_address_encrypted, wallet_address_hash
          ) VALUES ($1, $2, $3, $4, $5, $6)
        `, [
          'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee',
          'non-existent-user-id',
          'bitcoin',
          'Invalid User Wallet',
          'encrypted_invalid',
          'hash_invalid'
        ])
      ).rejects.toThrow();
    });
  });

  describe('Performance and Indexing', () => {
    it('should efficiently query wallets by user_id using index', async () => {
      const client = testDb.getClient();

      // Insert multiple wallets for performance testing
      const walletInserts = [];
      for (let i = 0; i < 10; i++) {
        walletInserts.push(client.query(`
          INSERT INTO crypto_wallets (
            wallet_id, user_id, wallet_type, wallet_name,
            wallet_address_encrypted, wallet_address_hash
          ) VALUES ($1, $2, $3, $4, $5, $6)
        `, [
          `perf-test-${i}-${Date.now()}`,
          '11111111-1111-1111-1111-111111111111',
          'bitcoin',
          `Performance Test Wallet ${i}`,
          `encrypted_perf_${i}`,
          `hash_perf_${i}_${Date.now()}`
        ]));
      }

      await Promise.all(walletInserts);

      // Query should be fast due to idx_crypto_wallets_user_id index
      const startTime = Date.now();
      const result = await client.query(`
        SELECT * FROM crypto_wallets WHERE user_id = $1
      `, ['11111111-1111-1111-1111-111111111111']);
      const queryTime = Date.now() - startTime;

      expect(result.rows.length).toBeGreaterThanOrEqual(10);
      expect(queryTime).toBeLessThan(100); // Should be very fast with index
    });
  });
});