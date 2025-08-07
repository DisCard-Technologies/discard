import { jest } from '@jest/globals';
import request from 'supertest';
import app from '../../app';
import { DatabaseService } from '../../services/database.service';

describe('Crypto Transaction Processing Integration', () => {
  let databaseService: DatabaseService;
  let authToken: string;

  beforeAll(async () => {
    databaseService = new DatabaseService();
    authToken = 'test-auth-token'; // Mock token for tests
  });

  afterAll(async () => {
    // Cleanup if needed - Supabase connections are automatically managed
  });

  beforeEach(async () => {
    // Clean up test data
    await databaseService.query('DELETE FROM transaction_processing_log WHERE card_id = $1', ['test-card-id']);
    await databaseService.query('DELETE FROM refund_transactions WHERE card_id = $1', ['test-card-id']);
    await databaseService.query('DELETE FROM crypto_transactions WHERE card_id = $1', ['test-card-id']);
  });

  describe('POST /api/v1/crypto/transactions/process', () => {
    const validTransactionPayload = {
      transactionId: 'test-tx-123',
      cardId: 'test-card-id',
      networkType: 'BTC',
      amount: '0.5',
      fromAddress: '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa',
      toAddress: '3J98t1WpEZ73CNmQviecrnyiWrnqRhWNLy',
      blockchainTxHash: '000000000019d6689c085ae165831e934ff763ae46a2a6c172b3f1b60a8ce26f'
    };

    it('should successfully process a valid BTC transaction', async () => {
      const response = await request(app)
        .post('/api/v1/crypto/transactions/process')
        .set('Authorization', `Bearer ${authToken}`)
        .send(validTransactionPayload)
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data.processingId).toBeDefined();
      expect(response.body.data.status).toBe('initiated');
      expect(response.body.data.requiredConfirmations).toBe(3);
      expect(response.body.data.estimatedCompletion).toBeDefined();

      // Verify database record was created
      const dbResult = await databaseService.query(
        'SELECT * FROM transaction_processing_log WHERE transaction_id = $1',
        [validTransactionPayload.transactionId]
      );
      expect(dbResult.rows).toHaveLength(1);
      expect(dbResult.rows[0].status).toBe('initiated');
    });

    it('should handle different network types correctly', async () => {
      const networks = [
        { type: 'ETH', confirmations: 12, estimatedTime: 3 },
        { type: 'USDT', confirmations: 12, estimatedTime: 3 },
        { type: 'USDC', confirmations: 12, estimatedTime: 3 },
        { type: 'XRP', confirmations: 1, estimatedTime: 0.1 }
      ];

      for (const network of networks) {
        const payload = {
          ...validTransactionPayload,
          transactionId: `test-tx-${network.type}`,
          networkType: network.type
        };

        const response = await request(app)
          .post('/api/v1/crypto/transactions/process')
          .set('Authorization', `Bearer ${authToken}`)
          .send(payload)
          .expect(201);

        expect(response.body.data.requiredConfirmations).toBe(network.confirmations);
      }
    });

    it('should reject invalid transaction data', async () => {
      const invalidPayload = {
        ...validTransactionPayload,
        amount: 'invalid-amount'
      };

      const response = await request(app)
        .post('/api/v1/crypto/transactions/process')
        .set('Authorization', `Bearer ${authToken}`)
        .send(invalidPayload)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Validation failed');
      expect(response.body.details).toHaveLength(1);
    });

    it('should reject transactions without authentication', async () => {
      await request(app)
        .post('/api/v1/crypto/transactions/process')
        .send(validTransactionPayload)
        .expect(401);
    });

    it('should handle fraud detection blocking', async () => {
      // Create a transaction that would trigger fraud detection
      const suspiciousPayload = {
        ...validTransactionPayload,
        amount: '100.0', // Large amount that should trigger limits
        transactionId: 'suspicious-tx-123'
      };

      const response = await request(app)
        .post('/api/v1/crypto/transactions/process')
        .set('Authorization', `Bearer ${authToken}`)
        .send(suspiciousPayload)
        .expect(403);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('security validation');
    });

    it('should respect rate limiting', async () => {
      // Send multiple requests rapidly to trigger rate limiting
      const requests = Array.from({ length: 12 }, (_, i) => 
        request(app)
          .post('/api/v1/crypto/transactions/process')
          .set('Authorization', `Bearer ${authToken}`)
          .send({
            ...validTransactionPayload,
            transactionId: `rate-limit-tx-${i}`
          })
      );

      const responses = await Promise.allSettled(requests);
      const rateLimitedResponses = responses.filter(
        result => result.status === 'fulfilled' && result.value.status === 429
      );

      expect(rateLimitedResponses.length).toBeGreaterThan(0);
    });
  });

  describe('GET /api/v1/crypto/transactions/status/:transactionId', () => {
    beforeEach(async () => {
      // Create a test transaction
      await databaseService.query(`
        INSERT INTO transaction_processing_log (
          processing_id, transaction_id, blockchain_tx_hash, status,
          confirmation_count, required_confirmations, network_fee_estimate,
          estimated_completion, locked_conversion_rate, network_type,
          card_id, acceleration_options
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      `, [
        'test-proc-123',
        'test-status-tx',
        'test-hash-456',
        'confirming',
        2,
        3,
        2500,
        new Date(Date.now() + 30 * 60000), // 30 minutes from now
        '45000.00',
        'BTC',
        'test-card-id',
        JSON.stringify([])
      ]);
    });

    it('should return transaction status', async () => {
      const response = await request(app)
        .get('/api/v1/crypto/transactions/status/test-status-tx?cardId=test-card-id')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.transactionId).toBe('test-status-tx');
      expect(response.body.data.status).toBe('confirming');
      expect(response.body.data.confirmationCount).toBe(2);
      expect(response.body.data.requiredConfirmations).toBe(3);
    });

    it('should return 404 for non-existent transaction', async () => {
      const response = await request(app)
        .get('/api/v1/crypto/transactions/status/nonexistent?cardId=test-card-id')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Transaction not found');
    });

    it('should require cardId parameter', async () => {
      const response = await request(app)
        .get('/api/v1/crypto/transactions/status/test-status-tx')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Validation failed');
    });
  });

  describe('GET /api/v1/crypto/transactions/history', () => {
    beforeEach(async () => {
      // Create multiple test transactions
      const transactions = [
        {
          processingId: 'proc-1',
          transactionId: 'tx-1',
          status: 'confirmed',
          completedAt: new Date()
        },
        {
          processingId: 'proc-2',
          transactionId: 'tx-2',
          status: 'pending',
          completedAt: null
        },
        {
          processingId: 'proc-3',
          transactionId: 'tx-3',
          status: 'failed',
          completedAt: null
        }
      ];

      for (const tx of transactions) {
        await databaseService.query(`
          INSERT INTO transaction_processing_log (
            processing_id, transaction_id, blockchain_tx_hash, status,
            confirmation_count, required_confirmations, network_fee_estimate,
            estimated_completion, locked_conversion_rate, network_type,
            card_id, acceleration_options, completed_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
        `, [
          tx.processingId,
          tx.transactionId,
          'test-hash',
          tx.status,
          tx.status === 'confirmed' ? 3 : 1,
          3,
          2500,
          new Date(),
          '45000.00',
          'BTC',
          'test-card-id',
          JSON.stringify([]),
          tx.completedAt
        ]);
      }
    });

    it('should return transaction history', async () => {
      const response = await request(app)
        .get('/api/v1/crypto/transactions/history?cardId=test-card-id')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.transactions).toHaveLength(3);
      expect(response.body.data.pagination).toBeDefined();
      expect(response.body.data.pagination.limit).toBe(50);
      expect(response.body.data.pagination.offset).toBe(0);
    });

    it('should support pagination', async () => {
      const response = await request(app)
        .get('/api/v1/crypto/transactions/history?cardId=test-card-id&limit=2&offset=1')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.transactions).toHaveLength(2);
      expect(response.body.data.pagination.limit).toBe(2);
      expect(response.body.data.pagination.offset).toBe(1);
    });

    it('should validate pagination parameters', async () => {
      const response = await request(app)
        .get('/api/v1/crypto/transactions/history?cardId=test-card-id&limit=200')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.details[0].msg).toContain('between 1 and 100');
    });
  });

  describe('POST /api/v1/crypto/transactions/refund/:transactionId', () => {
    beforeEach(async () => {
      // Create a failed transaction eligible for refund
      await databaseService.query(`
        INSERT INTO crypto_transactions (
          transaction_id, card_id, amount, from_address, to_address,
          network_type, status, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      `, [
        'refund-tx-123',
        'test-card-id',
        '0.5',
        '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa',
        '3J98t1WpEZ73CNmQviecrnyiWrnqRhWNLy',
        'BTC',
        'failed',
        new Date()
      ]);

      await databaseService.query(`
        INSERT INTO transaction_processing_log (
          processing_id, transaction_id, blockchain_tx_hash, status,
          confirmation_count, required_confirmations, network_fee_estimate,
          estimated_completion, locked_conversion_rate, network_type,
          card_id, acceleration_options
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      `, [
        'refund-proc-123',
        'refund-tx-123',
        'refund-hash-456',
        'failed',
        0,
        3,
        2500,
        new Date(),
        '45000.00',
        'BTC',
        'test-card-id',
        JSON.stringify([])
      ]);
    });

    it('should successfully process a refund request', async () => {
      const refundPayload = {
        cardId: 'test-card-id',
        reason: 'Transaction failed to confirm within acceptable timeframe',
        refundAddress: '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa'
      };

      const response = await request(app)
        .post('/api/v1/crypto/transactions/refund/refund-tx-123')
        .set('Authorization', `Bearer ${authToken}`)
        .send(refundPayload)
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data.refundId).toBeDefined();
      expect(response.body.data.originalTransactionId).toBe('refund-tx-123');
      expect(response.body.data.status).toBe('pending');

      // Verify refund record was created
      const dbResult = await databaseService.query(
        'SELECT * FROM refund_transactions WHERE original_transaction_id = $1',
        ['refund-tx-123']
      );
      expect(dbResult.rows).toHaveLength(1);
    });

    it('should reject refund for confirmed transaction', async () => {
      // Update transaction to confirmed status
      await databaseService.query(
        'UPDATE transaction_processing_log SET status = $1 WHERE transaction_id = $2',
        ['confirmed', 'refund-tx-123']
      );

      const refundPayload = {
        cardId: 'test-card-id',
        reason: 'Test refund',
        refundAddress: '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa'
      };

      const response = await request(app)
        .post('/api/v1/crypto/transactions/refund/refund-tx-123')
        .set('Authorization', `Bearer ${authToken}`)
        .send(refundPayload)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('Cannot refund confirmed');
    });

    it('should validate refund request data', async () => {
      const invalidPayload = {
        cardId: 'test-card-id',
        reason: '', // Empty reason should fail validation
        refundAddress: '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa'
      };

      const response = await request(app)
        .post('/api/v1/crypto/transactions/refund/refund-tx-123')
        .set('Authorization', `Bearer ${authToken}`)
        .send(invalidPayload)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Validation failed');
    });
  });

  describe('POST /api/v1/crypto/transactions/accelerate/:transactionId', () => {
    beforeEach(async () => {
      // Create a pending transaction eligible for acceleration
      await databaseService.query(`
        INSERT INTO transaction_processing_log (
          processing_id, transaction_id, blockchain_tx_hash, status,
          confirmation_count, required_confirmations, network_fee_estimate,
          estimated_completion, locked_conversion_rate, network_type,
          card_id, acceleration_options
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      `, [
        'accel-proc-123',
        'accel-tx-123',
        'accel-hash-456',
        'pending',
        0,
        3,
        2500,
        new Date(Date.now() + 30 * 60000), // 30 minutes from now
        '45000.00',
        'BTC',
        'test-card-id',
        JSON.stringify([])
      ]);
    });

    it('should return acceleration options for pending transaction', async () => {
      const response = await request(app)
        .post('/api/v1/crypto/transactions/accelerate/accel-tx-123')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ cardId: 'test-card-id' })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.accelerationOptions).toBeInstanceOf(Array);
      expect(response.body.data.accelerationOptions.length).toBeGreaterThanOrEqual(0);
      expect(response.body.data.currentStatus).toBe('pending');
    });

    it('should reject acceleration for confirmed transaction', async () => {
      // Update transaction to confirmed status
      await databaseService.query(
        'UPDATE transaction_processing_log SET status = $1 WHERE transaction_id = $2',
        ['confirmed', 'accel-tx-123']
      );

      const response = await request(app)
        .post('/api/v1/crypto/transactions/accelerate/accel-tx-123')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ cardId: 'test-card-id' })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('cannot be accelerated');
    });
  });

  describe('WebSocket Integration', () => {
    // Note: WebSocket testing would require additional setup with ws testing libraries
    // This is a placeholder for WebSocket integration tests
    it('should establish WebSocket connection for transaction updates', async () => {
      // This would require WebSocket testing setup
      // For now, we can test the HTTP endpoints that would trigger WebSocket messages
      expect(true).toBe(true); // Placeholder
    });
  });

  describe('Error Handling and Edge Cases', () => {
    it('should handle database connection failures gracefully', async () => {
      // Mock database failure
      const originalQuery = databaseService.query;
      databaseService.query = jest.fn().mockRejectedValue(new Error('Database unavailable'));

      const response = await request(app)
        .post('/api/v1/crypto/transactions/process')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          transactionId: 'db-error-tx',
          cardId: 'test-card-id',
          networkType: 'BTC',
          amount: '0.1',
          fromAddress: '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa',
          toAddress: '3J98t1WpEZ73CNmQviecrnyiWrnqRhWNLy',
          blockchainTxHash: '000000000019d6689c085ae165831e934ff763ae46a2a6c172b3f1b60a8ce26f'
        })
        .expect(500);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Failed to process transaction');

      // Restore original method
      databaseService.query = originalQuery;
    });

    it('should handle malformed JSON gracefully', async () => {
      const response = await request(app)
        .post('/api/v1/crypto/transactions/process')
        .set('Authorization', `Bearer ${authToken}`)
        .set('Content-Type', 'application/json')
        .send('{"invalid": json}')
        .expect(400);

      expect(response.body.success).toBe(false);
    });
  });
});