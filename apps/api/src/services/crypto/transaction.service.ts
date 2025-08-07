import { Decimal } from 'decimal.js';
import { v4 as uuidv4 } from 'uuid';
import { WebSocket } from 'ws';
import { logger } from '../../utils/logger';
import { DatabaseService } from '../database.service';
import { ConversionService } from './conversion.service';
import { FraudDetectionService } from './fraud-detection.service';
import { RefundService } from './refund.service';
import { TransactionWebSocketService } from './transaction-websocket.service';

export interface CryptoTransactionProcessing {
  processingId: string;
  transactionId: string;
  blockchainTxHash: string;
  status: 'initiated' | 'pending' | 'confirming' | 'confirmed' | 'failed' | 'refunded';
  confirmationCount: number;
  requiredConfirmations: number;
  networkFeeEstimate: number; // cents
  estimatedCompletion: Date;
  lockedConversionRate: string;
  networkType: 'BTC' | 'ETH' | 'USDT' | 'USDC' | 'XRP';
  accelerationOptions?: TransactionAcceleration[];
  createdAt: Date;
  completedAt?: Date;
}

export interface TransactionAcceleration {
  accelerationId: string;
  feeIncrease: number; // Additional fee in cents
  estimatedSpeedup: number; // Minutes saved
  available: boolean;
}

export interface NetworkConfirmationRequirements {
  BTC: 3;
  ETH: 12;
  USDT: 12;
  USDC: 12;
  XRP: 1;
}

export interface NetworkTimingEstimates {
  BTC: 30; // minutes
  ETH: 3;
  USDT: 3;
  USDC: 3;
  XRP: 0.1; // ~4 seconds
}

export class CryptoTransactionService {
  private readonly CONFIRMATION_REQUIREMENTS: NetworkConfirmationRequirements = {
    BTC: 3,
    ETH: 12,
    USDT: 12,
    USDC: 12,
    XRP: 1
  };

  private readonly TIMING_ESTIMATES: NetworkTimingEstimates = {
    BTC: 30,
    ETH: 3,
    USDT: 3,
    USDC: 3,
    XRP: 0.1
  };

  constructor(
    private readonly databaseService: DatabaseService,
    private readonly conversionService: ConversionService,
    private readonly fraudDetectionService: FraudDetectionService,
    private readonly refundService: RefundService,
    private readonly websocketService: TransactionWebSocketService
  ) {}

  async processTransaction(params: {
    transactionId: string;
    cardId: string;
    networkType: 'BTC' | 'ETH' | 'USDT' | 'USDC' | 'XRP';
    amount: string;
    fromAddress: string;
    toAddress: string;
    blockchainTxHash: string;
  }): Promise<CryptoTransactionProcessing> {
    const { transactionId, cardId, networkType, amount, fromAddress, toAddress, blockchainTxHash } = params;

    // Fraud detection validation
    await this.fraudDetectionService.validateTransaction({
      cardId,
      networkType,
      amount,
      fromAddress,
      toAddress
    });

    // Get locked conversion rate
    const conversionQuote = await this.conversionService.getConversionQuote({
      fromCurrency: networkType,
      toCurrency: 'USD',
      amount: amount
    });

    // Calculate network fee estimate
    const networkFee = await this.estimateNetworkFee(networkType, 'standard');

    // Calculate estimated completion
    const baseTime = this.TIMING_ESTIMATES[networkType];
    const networkCongestion = await this.getNetworkCongestion(networkType);
    const estimatedCompletion = new Date(Date.now() + (baseTime * networkCongestion * 60000));

    const processing: CryptoTransactionProcessing = {
      processingId: uuidv4(),
      transactionId,
      blockchainTxHash,
      status: 'initiated',
      confirmationCount: 0,
      requiredConfirmations: this.CONFIRMATION_REQUIREMENTS[networkType],
      networkFeeEstimate: networkFee,
      estimatedCompletion,
      lockedConversionRate: conversionQuote.rate,
      networkType,
      accelerationOptions: [],
      createdAt: new Date()
    };

    // Store in database with RLS context
    await this.databaseService.query(
      `SET LOCAL rls.card_id = $1`,
      [cardId]
    );

    await this.databaseService.query(
      `INSERT INTO transaction_processing_log (
        processing_id, transaction_id, blockchain_tx_hash, status,
        confirmation_count, required_confirmations, network_fee_estimate,
        estimated_completion, locked_conversion_rate, network_type,
        card_id, acceleration_options
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
      [
        processing.processingId,
        processing.transactionId,
        processing.blockchainTxHash,
        processing.status,
        processing.confirmationCount,
        processing.requiredConfirmations,
        processing.networkFeeEstimate,
        processing.estimatedCompletion,
        processing.lockedConversionRate,
        processing.networkType,
        cardId,
        JSON.stringify(processing.accelerationOptions)
      ]
    );

    // Start blockchain monitoring
    await this.startBlockchainMonitoring(processing.processingId, blockchainTxHash, networkType);

    // Send WebSocket update
    await this.websocketService.broadcastTransactionUpdate(cardId, processing);

    logger.info(`Transaction processing initiated`, {
      processingId: processing.processingId,
      transactionId,
      networkType,
      blockchainTxHash
    });

    return processing;
  }

  async getTransactionStatus(transactionId: string, cardId: string): Promise<CryptoTransactionProcessing | null> {
    await this.databaseService.query(`SET LOCAL rls.card_id = $1`, [cardId]);

    const result = await this.databaseService.query(
      `SELECT * FROM transaction_processing_log WHERE transaction_id = $1`,
      [transactionId]
    );

    if (result.rows.length === 0) {
      return null;
    }

    const row = result.rows[0];
    return {
      processingId: row.processing_id,
      transactionId: row.transaction_id,
      blockchainTxHash: row.blockchain_tx_hash,
      status: row.status,
      confirmationCount: row.confirmation_count,
      requiredConfirmations: row.required_confirmations,
      networkFeeEstimate: row.network_fee_estimate,
      estimatedCompletion: new Date(row.estimated_completion),
      lockedConversionRate: row.locked_conversion_rate,
      networkType: row.network_type,
      accelerationOptions: JSON.parse(row.acceleration_options || '[]'),
      createdAt: new Date(row.created_at),
      completedAt: row.completed_at ? new Date(row.completed_at) : undefined
    };
  }

  async getTransactionHistory(cardId: string, limit: number = 50, offset: number = 0): Promise<CryptoTransactionProcessing[]> {
    await this.databaseService.query(`SET LOCAL rls.card_id = $1`, [cardId]);

    const result = await this.databaseService.query(
      `SELECT * FROM transaction_processing_log 
       ORDER BY created_at DESC 
       LIMIT $1 OFFSET $2`,
      [limit, offset]
    );

    return result.rows.map(row => ({
      processingId: row.processing_id,
      transactionId: row.transaction_id,
      blockchainTxHash: row.blockchain_tx_hash,
      status: row.status,
      confirmationCount: row.confirmation_count,
      requiredConfirmations: row.required_confirmations,
      networkFeeEstimate: row.network_fee_estimate,
      estimatedCompletion: new Date(row.estimated_completion),
      lockedConversionRate: row.locked_conversion_rate,
      networkType: row.network_type,
      accelerationOptions: JSON.parse(row.acceleration_options || '[]'),
      createdAt: new Date(row.created_at),
      completedAt: row.completed_at ? new Date(row.completed_at) : undefined
    }));
  }

  async updateConfirmationCount(processingId: string, confirmationCount: number): Promise<void> {
    const result = await this.databaseService.query(
      `UPDATE transaction_processing_log 
       SET confirmation_count = $1, updated_at = NOW()
       WHERE processing_id = $2
       RETURNING *`,
      [confirmationCount, processingId]
    );

    if (result.rows.length === 0) {
      throw new Error(`Transaction processing not found: ${processingId}`);
    }

    const processing = result.rows[0];
    
    // Check if transaction is confirmed
    if (confirmationCount >= processing.required_confirmations && processing.status !== 'confirmed') {
      await this.confirmTransaction(processingId);
    }

    // Update status to confirming if we have some confirmations
    if (confirmationCount > 0 && processing.status === 'pending') {
      await this.updateTransactionStatus(processingId, 'confirming');
    }
  }

  async confirmTransaction(processingId: string): Promise<void> {
    await this.databaseService.query(
      `UPDATE transaction_processing_log 
       SET status = 'confirmed', completed_at = NOW(), updated_at = NOW()
       WHERE processing_id = $1`,
      [processingId]
    );

    // Get transaction details
    const processing = await this.getTransactionByProcessingId(processingId);
    if (!processing) {
      throw new Error(`Transaction processing not found: ${processingId}`);
    }

    // Convert cryptocurrency to USD using locked rate and original amount
    // Get the original transaction amount from the crypto_transactions table
    const originalTxResult = await this.databaseService.query(
      `SELECT amount FROM crypto_transactions WHERE transaction_id = $1`,
      [processing.transactionId]
    );
    
    if (originalTxResult.rows.length === 0) {
      throw new Error(`Original transaction not found: ${processing.transactionId}`);
    }
    
    const originalAmount = originalTxResult.rows[0].amount;
    const usdAmount = new Decimal(processing.lockedConversionRate)
      .mul(new Decimal(originalAmount))
      .toFixed(2);

    // Fund the card via Marqeta integration
    await this.fundCard(processing.transactionId, usdAmount);

    // Send WebSocket update
    const cardId = await this.getCardIdForTransaction(processingId);
    await this.websocketService.broadcastTransactionUpdate(cardId, processing);

    logger.info(`Transaction confirmed and card funded`, {
      processingId,
      transactionId: processing.transactionId,
      usdAmount
    });
  }

  async accelerateTransaction(processingId: string, cardId: string): Promise<TransactionAcceleration[]> {
    const processing = await this.getTransactionByProcessingId(processingId);
    if (!processing) {
      throw new Error(`Transaction processing not found: ${processingId}`);
    }

    if (processing.status !== 'pending' && processing.status !== 'confirming') {
      throw new Error(`Transaction cannot be accelerated in status: ${processing.status}`);
    }

    // Get current network congestion
    const congestion = await this.getNetworkCongestion(processing.networkType);
    if (congestion < 1.5) {
      return []; // No acceleration needed during low congestion
    }

    const accelerationOptions: TransactionAcceleration[] = [
      {
        accelerationId: uuidv4(),
        feeIncrease: Math.round(processing.networkFeeEstimate * 0.5), // 50% increase
        estimatedSpeedup: Math.round(this.TIMING_ESTIMATES[processing.networkType] * 0.3), // 30% faster
        available: true
      },
      {
        accelerationId: uuidv4(),
        feeIncrease: Math.round(processing.networkFeeEstimate * 1.0), // 100% increase
        estimatedSpeedup: Math.round(this.TIMING_ESTIMATES[processing.networkType] * 0.6), // 60% faster
        available: true
      }
    ];

    // Update acceleration options in database
    await this.databaseService.query(`SET LOCAL rls.card_id = $1`, [cardId]);
    await this.databaseService.query(
      `UPDATE transaction_processing_log 
       SET acceleration_options = $1, updated_at = NOW()
       WHERE processing_id = $2`,
      [JSON.stringify(accelerationOptions), processingId]
    );

    return accelerationOptions;
  }

  private async startBlockchainMonitoring(processingId: string, txHash: string, networkType: string): Promise<void> {
    // Implementation would integrate with Alchemy API for real-time monitoring
    // This is a placeholder for the blockchain monitoring service
    logger.info(`Starting blockchain monitoring`, { processingId, txHash, networkType });
  }

  private async estimateNetworkFee(networkType: string, level: 'slow' | 'standard' | 'fast' = 'standard'): Promise<number> {
    // Get cached fee estimate or fetch from external APIs
    const result = await this.databaseService.query(
      `SELECT fee_per_unit FROM network_fee_estimates 
       WHERE network_type = $1 AND fee_level = $2 AND valid_until > NOW()
       ORDER BY created_at DESC LIMIT 1`,
      [networkType, level]
    );

    if (result.rows.length > 0) {
      return Math.round(parseFloat(result.rows[0].fee_per_unit) * 100); // Convert to cents
    }

    // Default estimates if no cached data
    const defaultFees = {
      BTC: { slow: 10, standard: 20, fast: 50 },
      ETH: { slow: 15, standard: 30, fast: 80 },
      USDT: { slow: 15, standard: 30, fast: 80 },
      USDC: { slow: 15, standard: 30, fast: 80 },
      XRP: { slow: 1, standard: 2, fast: 5 }
    };

    return defaultFees[networkType as keyof typeof defaultFees]?.[level] || 30;
  }

  private async getNetworkCongestion(networkType: string): Promise<number> {
    // Return congestion multiplier (1.0 = normal, 2.0 = high congestion)
    const result = await this.databaseService.query(
      `SELECT network_congestion_level FROM network_fee_estimates 
       WHERE network_type = $1 AND valid_until > NOW()
       ORDER BY created_at DESC LIMIT 1`,
      [networkType]
    );

    if (result.rows.length > 0) {
      const level = result.rows[0].network_congestion_level;
      return level === 'low' ? 1.0 : level === 'medium' ? 1.5 : 2.0;
    }

    return 1.0; // Default to normal congestion
  }

  private async updateTransactionStatus(processingId: string, status: string): Promise<void> {
    await this.databaseService.query(
      `UPDATE transaction_processing_log 
       SET status = $1, updated_at = NOW()
       WHERE processing_id = $2`,
      [status, processingId]
    );
  }

  private async getTransactionByProcessingId(processingId: string): Promise<CryptoTransactionProcessing | null> {
    const result = await this.databaseService.query(
      `SELECT * FROM transaction_processing_log WHERE processing_id = $1`,
      [processingId]
    );

    if (result.rows.length === 0) {
      return null;
    }

    const row = result.rows[0];
    return {
      processingId: row.processing_id,
      transactionId: row.transaction_id,
      blockchainTxHash: row.blockchain_tx_hash,
      status: row.status,
      confirmationCount: row.confirmation_count,
      requiredConfirmations: row.required_confirmations,
      networkFeeEstimate: row.network_fee_estimate,
      estimatedCompletion: new Date(row.estimated_completion),
      lockedConversionRate: row.locked_conversion_rate,
      networkType: row.network_type,
      accelerationOptions: JSON.parse(row.acceleration_options || '[]'),
      createdAt: new Date(row.created_at),
      completedAt: row.completed_at ? new Date(row.completed_at) : undefined
    };
  }

  private async fundCard(transactionId: string, usdAmount: string): Promise<void> {
    // Integration with Marqeta API for card funding
    logger.info(`Funding card with confirmed transaction`, { transactionId, usdAmount });
  }

  private async getCardIdForTransaction(processingId: string): Promise<string> {
    const result = await this.databaseService.query(
      `SELECT card_id FROM transaction_processing_log WHERE processing_id = $1`,
      [processingId]
    );

    if (result.rows.length === 0) {
      throw new Error(`Transaction processing not found: ${processingId}`);
    }

    return result.rows[0].card_id;
  }
}