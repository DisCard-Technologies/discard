import { v4 as uuidv4 } from 'uuid';
import { Decimal } from 'decimal.js';
import { logger } from '../../utils/logger';
import { DatabaseService } from '../database.service';
import { TransactionWebSocketService } from './transaction-websocket.service';
import { FraudDetectionService } from './fraud-detection.service';

export interface RefundTransaction {
  refundId: string;
  originalTransactionId: string;
  refundAmount: string;
  refundAddress: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  reason: string;
  blockchainRefundHash?: string;
  processedAt?: Date;
  completedAt?: Date;
  createdAt: Date;
}

export interface RefundRequest {
  transactionId: string;
  cardId: string;
  reason: string;
  refundAddress: string;
  amount?: string; // Optional, will use original amount if not specified
}

export class RefundService {
  constructor(
    private readonly databaseService: DatabaseService,
    private readonly websocketService: TransactionWebSocketService,
    private readonly fraudDetectionService: FraudDetectionService
  ) {}

  async processRefund(request: RefundRequest): Promise<RefundTransaction> {
    const { transactionId, cardId, reason, refundAddress, amount } = request;

    // Validate transaction exists and is eligible for refund
    await this.validateRefundEligibility(transactionId, cardId);

    // Get original transaction details
    const originalTransaction = await this.getOriginalTransactionDetails(transactionId, cardId);
    const refundAmount = amount || originalTransaction.amount;

    // Validate refund amount
    await this.validateRefundAmount(refundAmount, originalTransaction.amount);

    // Validate refund address and get normalized version
    const validatedRefundAddress = await this.validateRefundAddress(refundAddress, originalTransaction.networkType);

    const refund: RefundTransaction = {
      refundId: uuidv4(),
      originalTransactionId: transactionId,
      refundAmount,
      refundAddress: validatedRefundAddress,
      status: 'pending',
      reason,
      createdAt: new Date()
    };

    // Store refund in database with RLS context
    await this.databaseService.query(`SET LOCAL rls.card_id = $1`, [cardId]);
    
    await this.databaseService.query(
      `INSERT INTO refund_transactions (
        refund_id, original_transaction_id, refund_amount, refund_address,
        status, reason, card_id
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        refund.refundId,
        refund.originalTransactionId,
        refund.refundAmount,
        validatedRefundAddress,
        refund.status,
        refund.reason,
        cardId
      ]
    );

    // Update original transaction status to refunded
    await this.updateOriginalTransactionStatus(transactionId, 'refunded');

    // Start refund processing
    await this.initiateBlockchainRefund(refund, originalTransaction.networkType);

    // Send WebSocket notification
    await this.websocketService.broadcastTransactionUpdate(cardId, {
      processingId: transactionId,
      transactionId: transactionId,
      blockchainTxHash: originalTransaction.blockchainTxHash,
      status: 'refunded',
      confirmationCount: originalTransaction.confirmationCount,
      requiredConfirmations: originalTransaction.requiredConfirmations,
      networkFeeEstimate: originalTransaction.networkFeeEstimate,
      estimatedCompletion: new Date(),
      lockedConversionRate: originalTransaction.lockedConversionRate,
      networkType: originalTransaction.networkType,
      createdAt: originalTransaction.createdAt,
      completedAt: new Date()
    });

    logger.info('Refund initiated', {
      refundId: refund.refundId,
      originalTransactionId: transactionId,
      refundAmount,
      reason
    });

    return refund;
  }

  async getRefundStatus(refundId: string, cardId: string): Promise<RefundTransaction | null> {
    await this.databaseService.query(`SET LOCAL rls.card_id = $1`, [cardId]);

    const result = await this.databaseService.query(
      `SELECT * FROM refund_transactions WHERE refund_id = $1`,
      [refundId]
    );

    if (result.rows.length === 0) {
      return null;
    }

    const row = result.rows[0];
    return {
      refundId: row.refund_id,
      originalTransactionId: row.original_transaction_id,
      refundAmount: row.refund_amount,
      refundAddress: row.refund_address,
      status: row.status,
      reason: row.reason,
      blockchainRefundHash: row.blockchain_refund_hash,
      processedAt: row.processed_at ? new Date(row.processed_at) : undefined,
      completedAt: row.completed_at ? new Date(row.completed_at) : undefined,
      createdAt: new Date(row.created_at)
    };
  }

  async getRefundHistory(cardId: string, limit: number = 50, offset: number = 0): Promise<RefundTransaction[]> {
    await this.databaseService.query(`SET LOCAL rls.card_id = $1`, [cardId]);

    const result = await this.databaseService.query(
      `SELECT * FROM refund_transactions 
       ORDER BY created_at DESC 
       LIMIT $1 OFFSET $2`,
      [limit, offset]
    );

    return result.rows.map(row => ({
      refundId: row.refund_id,
      originalTransactionId: row.original_transaction_id,
      refundAmount: row.refund_amount,
      refundAddress: row.refund_address,
      status: row.status,
      reason: row.reason,
      blockchainRefundHash: row.blockchain_refund_hash,
      processedAt: row.processed_at ? new Date(row.processed_at) : undefined,
      completedAt: row.completed_at ? new Date(row.completed_at) : undefined,
      createdAt: new Date(row.created_at)
    }));
  }

  async updateRefundStatus(refundId: string, status: 'processing' | 'completed' | 'failed', blockchainHash?: string): Promise<void> {
    const updateFields = ['status = $1', 'updated_at = NOW()'];
    const values = [status];
    let paramIndex = 2;

    if (status === 'processing') {
      updateFields.push(`processed_at = $${paramIndex}`);
      values.push(new Date().toISOString());
      paramIndex++;
    }

    if (status === 'completed') {
      updateFields.push(`completed_at = $${paramIndex}`);
      values.push(new Date().toISOString());
      paramIndex++;
    }

    if (blockchainHash) {
      updateFields.push(`blockchain_refund_hash = $${paramIndex}`);
      values.push(blockchainHash);
      paramIndex++;
    }

    values.push(refundId);

    await this.databaseService.query(
      `UPDATE refund_transactions 
       SET ${updateFields.join(', ')}
       WHERE refund_id = $${paramIndex}`,
      values
    );

    logger.info('Refund status updated', { refundId, status, blockchainHash });
  }

  async detectFailedTransactions(): Promise<string[]> {
    // Query for transactions that have been pending for too long
    const result = await this.databaseService.query(
      `SELECT processing_id, transaction_id, network_type, created_at
       FROM transaction_processing_log 
       WHERE status IN ('pending', 'confirming') 
         AND created_at < NOW() - INTERVAL '2 hours'
         AND network_type != 'XRP'
       UNION
       SELECT processing_id, transaction_id, network_type, created_at
       FROM transaction_processing_log 
       WHERE status IN ('pending', 'confirming') 
         AND created_at < NOW() - INTERVAL '10 minutes'
         AND network_type = 'XRP'`
    );

    const failedTransactionIds: string[] = [];

    for (const row of result.rows) {
      // Additional blockchain verification would happen here
      const isActuallyFailed = await this.verifyTransactionFailure(row.transaction_id, row.network_type);
      
      if (isActuallyFailed) {
        await this.updateOriginalTransactionStatus(row.transaction_id, 'failed');
        failedTransactionIds.push(row.transaction_id);
        
        logger.warn('Failed transaction detected', {
          transactionId: row.transaction_id,
          networkType: row.network_type,
          age: new Date().getTime() - new Date(row.created_at).getTime()
        });
      }
    }

    return failedTransactionIds;
  }

  async processAutomaticRefunds(): Promise<void> {
    const failedTransactionIds = await this.detectFailedTransactions();

    for (const transactionId of failedTransactionIds) {
      try {
        // Get transaction details
        const transactionResult = await this.databaseService.query(
          `SELECT t.*, tpl.* FROM crypto_transactions t
           JOIN transaction_processing_log tpl ON t.transaction_id = tpl.transaction_id
           WHERE t.transaction_id = $1`,
          [transactionId]
        );

        if (transactionResult.rows.length === 0) {
          continue;
        }

        const transaction = transactionResult.rows[0];

        // Auto-initiate refund
        await this.processRefund({
          transactionId: transaction.transaction_id,
          cardId: transaction.card_id,
          reason: 'Automatic refund for failed transaction',
          refundAddress: transaction.from_address, // Refund to original sender
          amount: transaction.amount
        });

        logger.info('Automatic refund processed', { transactionId });
      } catch (error) {
        logger.error('Error processing automatic refund', {
          transactionId,
          error: error.message
        });
      }
    }
  }

  private async validateRefundEligibility(transactionId: string, cardId: string): Promise<void> {
    await this.databaseService.query(`SET LOCAL rls.card_id = $1`, [cardId]);

    const result = await this.databaseService.query(
      `SELECT status FROM transaction_processing_log WHERE transaction_id = $1`,
      [transactionId]
    );

    if (result.rows.length === 0) {
      throw new Error('Transaction not found');
    }

    const status = result.rows[0].status;
    if (status === 'confirmed') {
      throw new Error('Cannot refund confirmed transaction');
    }

    if (status === 'refunded') {
      throw new Error('Transaction already refunded');
    }

    // Check if refund already exists
    const refundResult = await this.databaseService.query(
      `SELECT refund_id FROM refund_transactions WHERE original_transaction_id = $1`,
      [transactionId]
    );

    if (refundResult.rows.length > 0) {
      throw new Error('Refund already in progress');
    }
  }

  private async getOriginalTransactionDetails(transactionId: string, cardId: string): Promise<any> {
    await this.databaseService.query(`SET LOCAL rls.card_id = $1`, [cardId]);

    const result = await this.databaseService.query(
      `SELECT t.*, tpl.* FROM crypto_transactions t
       JOIN transaction_processing_log tpl ON t.transaction_id = tpl.transaction_id
       WHERE t.transaction_id = $1`,
      [transactionId]
    );

    if (result.rows.length === 0) {
      throw new Error('Original transaction not found');
    }

    return result.rows[0];
  }

  private async validateRefundAmount(refundAmount: string, originalAmount: string): Promise<void> {
    const refund = new Decimal(refundAmount);
    const original = new Decimal(originalAmount);

    if (refund.greaterThan(original)) {
      throw new Error('Refund amount cannot exceed original transaction amount');
    }

    if (refund.lessThanOrEqualTo(0)) {
      throw new Error('Refund amount must be positive');
    }
  }

  private async validateRefundAddress(address: string, networkType: string): Promise<string> {
    // Use enhanced address validation from fraud detection service
    const validationResult = await this.fraudDetectionService.validateAddress(
      address, 
      networkType as 'BTC' | 'ETH' | 'USDT' | 'USDC' | 'XRP'
    );

    if (!validationResult.isValid) {
      throw new Error(`Invalid ${networkType} refund address: ${validationResult.error || 'Unknown validation error'}`);
    }

    // Additional refund-specific checks
    await this.performRefundAddressSecurityChecks(address, networkType);

    logger.info('Refund address validated', {
      address: validationResult.normalizedAddress,
      addressType: validationResult.addressType,
      networkType
    });

    return validationResult.normalizedAddress || address;
  }

  private async performRefundAddressSecurityChecks(address: string, networkType: string): Promise<void> {
    // Check if address is blacklisted
    const result = await this.databaseService.query(
      `SELECT risk_level FROM address_risk_assessments 
       WHERE address = $1 AND risk_level IN ('blacklisted', 'high')`,
      [address]
    );

    if (result.rows.length > 0) {
      const riskLevel = result.rows[0].risk_level;
      throw new Error(`Cannot refund to ${riskLevel === 'blacklisted' ? 'blacklisted' : 'high-risk'} address`);
    }

    // Additional network-specific security checks
    switch (networkType) {
      case 'BTC':
        // Check if it's a known exchange address (optional - could add exchange address detection)
        break;
      case 'ETH':
      case 'USDT':
      case 'USDC':
        // Check if it's a contract address that might not accept tokens
        await this.validateEthereumRefundCompatibility(address);
        break;
      case 'XRP':
        // XRP addresses are generally safe for refunds
        break;
    }
  }

  private async validateEthereumRefundCompatibility(address: string): Promise<void> {
    // This would typically involve checking if the address is a contract
    // and if it can receive the specific token type (for USDT/USDC)
    // For now, we'll implement a basic check
    
    try {
      // If address has lowercase letters, it needs to pass checksum validation
      if (address !== address.toLowerCase() && address !== address.toUpperCase()) {
        // Address has mixed case, verify it's properly checksummed
        const { isValidAddress, toChecksumAddress } = require('ethereumjs-util');
        const checksummed = toChecksumAddress(address);
        
        if (address !== checksummed) {
          throw new Error('Invalid Ethereum address checksum');
        }
      }
    } catch (error) {
      throw new Error(`Ethereum address validation failed: ${error.message}`);
    }
  }

  private async updateOriginalTransactionStatus(transactionId: string, status: string): Promise<void> {
    await this.databaseService.query(
      `UPDATE transaction_processing_log 
       SET status = $1, updated_at = NOW()
       WHERE transaction_id = $2`,
      [status, transactionId]
    );
  }

  private async initiateBlockchainRefund(refund: RefundTransaction, networkType: string): Promise<void> {
    // This would integrate with blockchain APIs to initiate the actual refund
    logger.info('Initiating blockchain refund', {
      refundId: refund.refundId,
      networkType,
      refundAddress: refund.refundAddress,
      amount: refund.refundAmount
    });

    // Update status to processing
    await this.updateRefundStatus(refund.refundId, 'processing');
  }

  private async verifyTransactionFailure(transactionId: string, networkType: string): Promise<boolean> {
    // This would verify with blockchain APIs whether the transaction actually failed
    // For now, returning true for demonstration
    return true;
  }
}