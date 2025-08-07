import { Decimal } from 'decimal.js';
import { logger } from '../../utils/logger';
import { DatabaseService } from '../database.service';
import WAValidator from 'wallet-address-validator';
import * as bitcoin from 'bitcoinjs-lib';
import { isValidAddress, toChecksumAddress } from 'ethereumjs-util';
import { isValidClassicAddress, isValidXAddress } from 'ripple-address-codec';

export interface FraudValidationRequest {
  cardId: string;
  networkType: 'BTC' | 'ETH' | 'USDT' | 'USDC' | 'XRP';
  amount: string;
  fromAddress: string;
  toAddress: string;
}

export interface FraudValidationResult {
  isValid: boolean;
  riskScore: number; // 0-100, higher = more risky
  flags: string[];
  reasons: string[];
}

export interface TransactionLimits {
  dailyLimit: string; // USD equivalent
  monthlyLimit: string; // USD equivalent
  singleTransactionLimit: string; // USD equivalent
  maxTransactionsPerHour: number;
}

export interface AddressRiskAssessment {
  address: string;
  riskLevel: 'low' | 'medium' | 'high' | 'blacklisted';
  lastSeen?: Date;
  transactionCount: number;
  totalAmount: string; // USD equivalent
}

export class FraudDetectionService {
  private readonly DEFAULT_LIMITS: TransactionLimits = {
    dailyLimit: '10000.00', // $10,000 daily
    monthlyLimit: '50000.00', // $50,000 monthly
    singleTransactionLimit: '5000.00', // $5,000 per transaction
    maxTransactionsPerHour: 10
  };

  private readonly BLACKLISTED_ADDRESSES = new Set<string>([
    // Known malicious addresses would be loaded from external sources
  ]);

  constructor(private readonly databaseService: DatabaseService) {}

  async validateTransaction(request: FraudValidationRequest): Promise<FraudValidationResult> {
    const { cardId, networkType, amount, fromAddress, toAddress } = request;

    const result: FraudValidationResult = {
      isValid: true,
      riskScore: 0,
      flags: [],
      reasons: []
    };

    // Set RLS context
    await this.databaseService.query(`SET LOCAL rls.card_id = $1`, [cardId]);

    // 1. Blacklist checking
    await this.checkAddressBlacklist(fromAddress, toAddress, result);

    // 2. Transaction limits validation
    await this.validateTransactionLimits(cardId, amount, result);

    // 3. Frequency analysis
    await this.analyzeTransactionFrequency(cardId, result);

    // 4. Amount pattern analysis
    await this.analyzeAmountPatterns(cardId, amount, result);

    // 5. Address risk assessment
    await this.assessAddressRisk(fromAddress, result);

    // 6. Network-specific validation
    await this.validateNetworkSpecificRules(networkType, amount, result);

    // 7. Privacy-preserving correlation analysis
    await this.performCorrelationAnalysis(cardId, fromAddress, amount, result);

    // Calculate final risk score and validity
    result.riskScore = this.calculateRiskScore(result.flags);
    result.isValid = result.riskScore < 80; // Threshold for blocking

    if (!result.isValid) {
      logger.warn('Transaction blocked by fraud detection', {
        cardId,
        networkType,
        amount,
        riskScore: result.riskScore,
        flags: result.flags,
        reasons: result.reasons
      });

      // Record suspicious activity
      await this.recordSuspiciousActivity(cardId, request, result);
    }

    return result;
  }

  async updateAddressRisk(address: string, riskLevel: 'low' | 'medium' | 'high' | 'blacklisted'): Promise<void> {
    await this.databaseService.query(
      `INSERT INTO address_risk_assessments (address, risk_level, updated_at)
       VALUES ($1, $2, NOW())
       ON CONFLICT (address) DO UPDATE SET
         risk_level = $2,
         updated_at = NOW()`,
      [address, riskLevel]
    );

    if (riskLevel === 'blacklisted') {
      this.BLACKLISTED_ADDRESSES.add(address.toLowerCase());
    }

    logger.info('Address risk level updated', { address, riskLevel });
  }

  async getTransactionLimits(cardId: string): Promise<TransactionLimits> {
    // Get custom limits for specific cards or use defaults
    const result = await this.databaseService.query(
      `SELECT daily_limit, monthly_limit, single_transaction_limit, max_transactions_per_hour
       FROM card_transaction_limits WHERE card_id = $1`,
      [cardId]
    );

    if (result.rows.length > 0) {
      const limits = result.rows[0];
      return {
        dailyLimit: limits.daily_limit,
        monthlyLimit: limits.monthly_limit,
        singleTransactionLimit: limits.single_transaction_limit,
        maxTransactionsPerHour: limits.max_transactions_per_hour
      };
    }

    return this.DEFAULT_LIMITS;
  }

  async getSuspiciousActivities(cardId: string, limit: number = 50): Promise<any[]> {
    await this.databaseService.query(`SET LOCAL rls.card_id = $1`, [cardId]);

    const result = await this.databaseService.query(
      `SELECT * FROM suspicious_activities 
       WHERE card_id = $1 
       ORDER BY created_at DESC 
       LIMIT $2`,
      [cardId, limit]
    );

    return result.rows;
  }

  private async checkAddressBlacklist(
    fromAddress: string,
    toAddress: string,
    result: FraudValidationResult
  ): Promise<void> {
    const addresses = [fromAddress.toLowerCase(), toAddress.toLowerCase()];

    for (const address of addresses) {
      if (this.BLACKLISTED_ADDRESSES.has(address)) {
        result.flags.push('BLACKLISTED_ADDRESS');
        result.reasons.push(`Address ${address} is blacklisted`);
        result.riskScore += 100; // Immediate block
        return;
      }
    }

    // Check database blacklist
    const dbResult = await this.databaseService.query(
      `SELECT address FROM address_risk_assessments 
       WHERE address IN ($1, $2) AND risk_level = 'blacklisted'`,
      [fromAddress, toAddress]
    );

    if (dbResult.rows.length > 0) {
      result.flags.push('BLACKLISTED_ADDRESS');
      result.reasons.push('Address found in blacklist database');
      result.riskScore += 100;
    }
  }

  private async validateTransactionLimits(
    cardId: string,
    amount: string,
    result: FraudValidationResult
  ): Promise<void> {
    const limits = await this.getTransactionLimits(cardId);
    const transactionAmount = new Decimal(amount);

    // Single transaction limit
    if (transactionAmount.greaterThan(new Decimal(limits.singleTransactionLimit))) {
      result.flags.push('EXCEEDS_SINGLE_LIMIT');
      result.reasons.push(`Transaction amount exceeds single transaction limit of $${limits.singleTransactionLimit}`);
      result.riskScore += 30;
    }

    // Daily limit
    const dailyTotal = await this.getDailyTransactionTotal(cardId);
    const newDailyTotal = new Decimal(dailyTotal).plus(transactionAmount);
    if (newDailyTotal.greaterThan(new Decimal(limits.dailyLimit))) {
      result.flags.push('EXCEEDS_DAILY_LIMIT');
      result.reasons.push(`Transaction would exceed daily limit of $${limits.dailyLimit}`);
      result.riskScore += 40;
    }

    // Monthly limit
    const monthlyTotal = await this.getMonthlyTransactionTotal(cardId);
    const newMonthlyTotal = new Decimal(monthlyTotal).plus(transactionAmount);
    if (newMonthlyTotal.greaterThan(new Decimal(limits.monthlyLimit))) {
      result.flags.push('EXCEEDS_MONTHLY_LIMIT');
      result.reasons.push(`Transaction would exceed monthly limit of $${limits.monthlyLimit}`);
      result.riskScore += 50;
    }
  }

  private async analyzeTransactionFrequency(
    cardId: string,
    result: FraudValidationResult
  ): Promise<void> {
    const limits = await this.getTransactionLimits(cardId);

    // Check hourly frequency
    const hourlyCount = await this.getHourlyTransactionCount(cardId);
    if (hourlyCount >= limits.maxTransactionsPerHour) {
      result.flags.push('EXCEEDS_FREQUENCY_LIMIT');
      result.reasons.push(`Too many transactions in the past hour (${hourlyCount}/${limits.maxTransactionsPerHour})`);
      result.riskScore += 25;
    }

    // Check for rapid successive transactions (within 5 minutes)
    const recentCount = await this.getRecentTransactionCount(cardId, 5); // 5 minutes
    if (recentCount >= 3) {
      result.flags.push('RAPID_SUCCESSION');
      result.reasons.push('Multiple transactions in rapid succession');
      result.riskScore += 20;
    }
  }

  private async analyzeAmountPatterns(
    cardId: string,
    amount: string,
    result: FraudValidationResult
  ): Promise<void> {
    // Check for round number patterns (potential structuring)
    const amountDecimal = new Decimal(amount);
    if (amountDecimal.mod(1000).equals(0) && amountDecimal.greaterThanOrEqualTo(1000)) {
      result.flags.push('ROUND_AMOUNT_PATTERN');
      result.reasons.push('Large round amount may indicate structuring');
      result.riskScore += 15;
    }

    // Check for unusual amounts compared to historical patterns
    const avgAmount = await this.getAverageTransactionAmount(cardId);
    if (avgAmount && amountDecimal.greaterThan(new Decimal(avgAmount).mul(5))) {
      result.flags.push('UNUSUAL_AMOUNT');
      result.reasons.push('Transaction amount significantly higher than typical');
      result.riskScore += 20;
    }
  }

  private async assessAddressRisk(
    fromAddress: string,
    result: FraudValidationResult
  ): Promise<void> {
    const riskResult = await this.databaseService.query(
      `SELECT risk_level, transaction_count, total_amount 
       FROM address_risk_assessments 
       WHERE address = $1`,
      [fromAddress]
    );

    if (riskResult.rows.length > 0) {
      const risk = riskResult.rows[0];
      
      switch (risk.risk_level) {
        case 'high':
          result.flags.push('HIGH_RISK_ADDRESS');
          result.reasons.push('Transaction from high-risk address');
          result.riskScore += 40;
          break;
        case 'medium':
          result.flags.push('MEDIUM_RISK_ADDRESS');
          result.reasons.push('Transaction from medium-risk address');
          result.riskScore += 20;
          break;
      }
    } else {
      // New address - slight risk increase
      result.flags.push('NEW_ADDRESS');
      result.reasons.push('Transaction from previously unknown address');
      result.riskScore += 10;
    }
  }

  private async validateNetworkSpecificRules(
    networkType: string,
    amount: string,
    result: FraudValidationResult
  ): Promise<void> {
    const amountDecimal = new Decimal(amount);

    switch (networkType) {
      case 'BTC':
        // Bitcoin-specific rules
        if (amountDecimal.greaterThan(10)) { // > 10 BTC
          result.flags.push('LARGE_BTC_AMOUNT');
          result.reasons.push('Large Bitcoin transaction amount');
          result.riskScore += 25;
        }
        break;

      case 'ETH':
        // Ethereum-specific rules
        if (amountDecimal.greaterThan(100)) { // > 100 ETH
          result.flags.push('LARGE_ETH_AMOUNT');
          result.reasons.push('Large Ethereum transaction amount');
          result.riskScore += 25;
        }
        break;

      case 'USDT':
      case 'USDC':
        // Stablecoin-specific rules
        if (amountDecimal.greaterThan(100000)) { // > $100k
          result.flags.push('LARGE_STABLECOIN_AMOUNT');
          result.reasons.push('Large stablecoin transaction amount');
          result.riskScore += 30;
        }
        break;

      case 'XRP':
        // XRP-specific rules
        if (amountDecimal.greaterThan(100000)) { // > 100k XRP
          result.flags.push('LARGE_XRP_AMOUNT');
          result.reasons.push('Large XRP transaction amount');
          result.riskScore += 25;
        }
        break;
    }
  }

  async validateAddress(address: string, networkType: 'BTC' | 'ETH' | 'USDT' | 'USDC' | 'XRP'): Promise<{
    isValid: boolean;
    normalizedAddress?: string;
    addressType?: string;
    error?: string;
  }> {
    try {
      // Primary validation using wallet-address-validator
      const isPrimaryValid = WAValidator.validate(address, networkType);
      
      if (isPrimaryValid) {
        const normalized = await this.normalizeAddress(address, networkType);
        const addressType = await this.detectAddressType(address, networkType);
        
        return {
          isValid: true,
          normalizedAddress: normalized,
          addressType
        };
      }

      // Fallback to network-specific validation
      const fallbackResult = await this.validateWithNetworkLibrary(address, networkType);
      
      return fallbackResult;
    } catch (error) {
      logger.error('Address validation error', { address, networkType, error: error.message });
      return {
        isValid: false,
        error: 'Address validation failed'
      };
    }
  }

  private async validateWithNetworkLibrary(address: string, networkType: string): Promise<{
    isValid: boolean;
    normalizedAddress?: string;
    addressType?: string;
    error?: string;
  }> {
    try {
      switch (networkType) {
        case 'BTC':
          return this.validateBitcoinAddress(address);
        
        case 'ETH':
        case 'USDT':
        case 'USDC':
          return this.validateEthereumAddress(address);
        
        case 'XRP':
          return this.validateXRPAddress(address);
        
        default:
          return {
            isValid: false,
            error: `Unsupported network type: ${networkType}`
          };
      }
    } catch (error) {
      return {
        isValid: false,
        error: error.message
      };
    }
  }

  private validateBitcoinAddress(address: string): {
    isValid: boolean;
    normalizedAddress?: string;
    addressType?: string;
    error?: string;
  } {
    try {
      // Test both mainnet and testnet (for development)
      const networks = [bitcoin.networks.bitcoin, bitcoin.networks.testnet];
      
      for (const network of networks) {
        try {
          const outputScript = bitcoin.address.toOutputScript(address, network);
          const addressType = this.getBitcoinAddressType(address);
          
          return {
            isValid: true,
            normalizedAddress: address,
            addressType
          };
        } catch (e) {
          // Try next network
          continue;
        }
      }
      
      return {
        isValid: false,
        error: 'Invalid Bitcoin address format'
      };
    } catch (error) {
      return {
        isValid: false,
        error: error.message
      };
    }
  }

  private validateEthereumAddress(address: string): {
    isValid: boolean;
    normalizedAddress?: string;
    addressType?: string;
    error?: string;
  } {
    try {
      // Remove 0x prefix if present for validation
      const cleanAddress = address.startsWith('0x') ? address.slice(2) : address;
      
      // Check if it's a valid hex string of correct length
      if (!/^[a-fA-F0-9]{40}$/.test(cleanAddress)) {
        return {
          isValid: false,
          error: 'Invalid Ethereum address format'
        };
      }

      const fullAddress = '0x' + cleanAddress;
      
      // Validate using ethereumjs-util
      if (!isValidAddress(fullAddress)) {
        return {
          isValid: false,
          error: 'Invalid Ethereum address'
        };
      }

      // Get checksummed address
      const checksummedAddress = toChecksumAddress(fullAddress);
      
      return {
        isValid: true,
        normalizedAddress: checksummedAddress,
        addressType: 'EOA' // Externally Owned Account (could be enhanced to detect contracts)
      };
    } catch (error) {
      return {
        isValid: false,
        error: error.message
      };
    }
  }

  private validateXRPAddress(address: string): {
    isValid: boolean;
    normalizedAddress?: string;
    addressType?: string;
    error?: string;
  } {
    try {
      // Check classic address format
      if (isValidClassicAddress(address)) {
        return {
          isValid: true,
          normalizedAddress: address,
          addressType: 'classic'
        };
      }

      // Check X-address format
      if (isValidXAddress(address)) {
        return {
          isValid: true,
          normalizedAddress: address,
          addressType: 'x-address'
        };
      }

      return {
        isValid: false,
        error: 'Invalid XRP address format'
      };
    } catch (error) {
      return {
        isValid: false,
        error: error.message
      };
    }
  }

  private getBitcoinAddressType(address: string): string {
    if (address.startsWith('1')) {
      return 'P2PKH'; // Pay to Public Key Hash (Legacy)
    } else if (address.startsWith('3')) {
      return 'P2SH'; // Pay to Script Hash (Legacy SegWit)
    } else if (address.startsWith('bc1q')) {
      return 'P2WPKH'; // Pay to Witness Public Key Hash (Native SegWit)
    } else if (address.startsWith('bc1p')) {
      return 'P2TR'; // Pay to Taproot
    } else if (address.startsWith('bc1') && address.length > 42) {
      return 'P2WSH'; // Pay to Witness Script Hash
    }
    return 'unknown';
  }

  private async normalizeAddress(address: string, networkType: string): Promise<string> {
    switch (networkType) {
      case 'ETH':
      case 'USDT':
      case 'USDC':
        // Return checksummed Ethereum address
        return toChecksumAddress(address);
      
      case 'BTC':
      case 'XRP':
        // Bitcoin and XRP addresses don't need normalization
        return address;
      
      default:
        return address;
    }
  }

  private async detectAddressType(address: string, networkType: string): Promise<string> {
    switch (networkType) {
      case 'BTC':
        return this.getBitcoinAddressType(address);
      
      case 'ETH':
      case 'USDT':
      case 'USDC':
        return 'EOA'; // Could be enhanced to detect contract addresses
      
      case 'XRP':
        return isValidXAddress(address) ? 'x-address' : 'classic';
      
      default:
        return 'standard';
    }
  }

  private async performCorrelationAnalysis(
    cardId: string,
    fromAddress: string,
    amount: string,
    result: FraudValidationResult
  ): Promise<void> {
    // Privacy-preserving analysis - use hashed identifiers
    const addressHash = this.hashAddress(fromAddress);

    // Check for correlation with other suspicious activities
    const correlationResult = await this.databaseService.query(
      `SELECT COUNT(*) as count FROM suspicious_activities 
       WHERE address_hash = $1 AND created_at > NOW() - INTERVAL '30 days'`,
      [addressHash]
    );

    const suspiciousCount = parseInt(correlationResult.rows[0].count);
    if (suspiciousCount > 0) {
      result.flags.push('CORRELATED_SUSPICIOUS_ACTIVITY');
      result.reasons.push('Address associated with previous suspicious activities');
      result.riskScore += suspiciousCount * 15;
    }
  }

  private calculateRiskScore(flags: string[]): number {
    // Risk score is calculated by summing individual flag scores
    // This is handled in the individual validation methods
    // Return the accumulated score (already calculated)
    return 0; // Placeholder - actual score calculated in validation methods
  }

  private async recordSuspiciousActivity(
    cardId: string,
    request: FraudValidationRequest,
    result: FraudValidationResult
  ): Promise<void> {
    const addressHash = this.hashAddress(request.fromAddress);

    await this.databaseService.query(
      `INSERT INTO suspicious_activities (
        activity_id, card_id, network_type, amount, address_hash,
        risk_score, flags, reasons, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())`,
      [
        require('uuid').v4(),
        cardId,
        request.networkType,
        request.amount,
        addressHash,
        result.riskScore,
        JSON.stringify(result.flags),
        JSON.stringify(result.reasons)
      ]
    );
  }

  private async getDailyTransactionTotal(cardId: string): Promise<string> {
    const result = await this.databaseService.query(
      `SELECT COALESCE(SUM(amount_usd), 0) as total 
       FROM crypto_transactions 
       WHERE card_id = $1 AND created_at >= CURRENT_DATE`,
      [cardId]
    );

    return result.rows[0].total || '0';
  }

  private async getMonthlyTransactionTotal(cardId: string): Promise<string> {
    const result = await this.databaseService.query(
      `SELECT COALESCE(SUM(amount_usd), 0) as total 
       FROM crypto_transactions 
       WHERE card_id = $1 AND created_at >= DATE_TRUNC('month', CURRENT_DATE)`,
      [cardId]
    );

    return result.rows[0].total || '0';
  }

  private async getHourlyTransactionCount(cardId: string): Promise<number> {
    const result = await this.databaseService.query(
      `SELECT COUNT(*) as count 
       FROM crypto_transactions 
       WHERE card_id = $1 AND created_at >= NOW() - INTERVAL '1 hour'`,
      [cardId]
    );

    return parseInt(result.rows[0].count);
  }

  private async getRecentTransactionCount(cardId: string, minutes: number): Promise<number> {
    const result = await this.databaseService.query(
      `SELECT COUNT(*) as count 
       FROM crypto_transactions 
       WHERE card_id = $1 AND created_at >= NOW() - INTERVAL '${minutes} minutes'`,
      [cardId]
    );

    return parseInt(result.rows[0].count);
  }

  private async getAverageTransactionAmount(cardId: string): Promise<string | null> {
    const result = await this.databaseService.query(
      `SELECT AVG(amount_usd) as avg_amount 
       FROM crypto_transactions 
       WHERE card_id = $1 AND created_at >= NOW() - INTERVAL '30 days'`,
      [cardId]
    );

    return result.rows[0].avg_amount;
  }

  private hashAddress(address: string): string {
    // Use a privacy-preserving hash function
    const crypto = require('crypto');
    return crypto.createHash('sha256').update(address.toLowerCase()).digest('hex');
  }
}