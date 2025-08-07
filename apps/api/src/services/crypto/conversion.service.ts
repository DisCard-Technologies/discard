import {
  ConversionCalculatorRequest,
  ConversionCalculatorResponse,
  ConversionQuote,
  RateComparisonRequest,
  RateComparisonResponse,
  CryptoRateComparison
} from '@discard/shared/src/types/crypto';
import { DatabaseService } from '../database.service';
import { enhancedRatesService } from './rates.service';
import Decimal from 'decimal.js';
import { v4 as uuidv4 } from 'uuid';
import { cacheService } from '../../config/redis';

interface FeeStructure {
  networkFeePercentage: number; // e.g., 0.001 = 0.1%
  conversionFeePercentage: number; // e.g., 0.005 = 0.5%
  platformFeePercentage: number; // e.g., 0.002 = 0.2%
  minimumNetworkFee: number; // Minimum fee in cents
}

interface GasEstimate {
  currency: string;
  gasPrice: string; // In gwei for ETH
  gasLimit: string;
  estimatedFeeUsd: number; // In cents
}

export class ConversionService {
  private databaseService = new DatabaseService();
  private supabase = this.databaseService.getClient();
  
  // Fee structures by currency
  private readonly FEE_STRUCTURES: Record<string, FeeStructure> = {
    'BTC': {
      networkFeePercentage: 0.001, // 0.1%
      conversionFeePercentage: 0.005, // 0.5%
      platformFeePercentage: 0.002, // 0.2%
      minimumNetworkFee: 100 // $1.00 minimum
    },
    'ETH': {
      networkFeePercentage: 0.002, // 0.2%
      conversionFeePercentage: 0.005, // 0.5%
      platformFeePercentage: 0.002, // 0.2%
      minimumNetworkFee: 150 // $1.50 minimum
    },
    'USDT': {
      networkFeePercentage: 0.002, // 0.2% (ERC-20 gas fees)
      conversionFeePercentage: 0.001, // 0.1% (stablecoin)
      platformFeePercentage: 0.001, // 0.1%
      minimumNetworkFee: 100 // $1.00 minimum
    },
    'USDC': {
      networkFeePercentage: 0.002, // 0.2% (ERC-20 gas fees)
      conversionFeePercentage: 0.001, // 0.1% (stablecoin)
      platformFeePercentage: 0.001, // 0.1%
      minimumNetworkFee: 100 // $1.00 minimum
    },
    'XRP': {
      networkFeePercentage: 0.0005, // 0.05%
      conversionFeePercentage: 0.003, // 0.3%
      platformFeePercentage: 0.002, // 0.2%
      minimumNetworkFee: 50 // $0.50 minimum
    }
  };

  private readonly DEFAULT_SLIPPAGE_LIMIT = 0.02; // 2%
  private readonly QUOTE_EXPIRY_MINUTES = 5;

  /**
   * Calculate exact crypto amount needed for desired USD funding with current market rates
   */
  async calculateConversion(request: ConversionCalculatorRequest): Promise<ConversionCalculatorResponse> {
    // Input validation
    if (!request.fromCrypto || request.toUsd <= 0) {
      throw new Error('Invalid conversion request: missing or invalid parameters');
    }

    if (request.slippageLimit && !this.validateSlippageLimit(request.slippageLimit)) {
      throw new Error('Invalid slippage limit: must be between 0 and 5%');
    }

    try {
      // Get current rate for the specified crypto
      const rates = await enhancedRatesService.getCurrentRates([request.fromCrypto]);
      const currentRate = rates[request.fromCrypto]?.usd;

      if (!currentRate || new Decimal(currentRate).isZero()) {
        throw new Error(`Unable to get current rate for ${request.fromCrypto}`);
      }

      const rate = new Decimal(currentRate);
      const targetUsdAmount = new Decimal(request.toUsd).div(100); // Convert cents to dollars
      const slippageLimit = request.slippageLimit || this.DEFAULT_SLIPPAGE_LIMIT;

      // Calculate base crypto amount needed
      const baseCryptoAmount = targetUsdAmount.div(rate);

      // Calculate fees
      const fees = this.calculateFees(request.fromCrypto, request.toUsd, rate);

      // Add fees to required crypto amount
      const totalFeesInCrypto = new Decimal(fees.totalFee).div(100).div(rate);
      const requiredCryptoAmount = baseCryptoAmount.add(totalFeesInCrypto);

      // Calculate slippage protection
      const maxSlippageAmount = requiredCryptoAmount.mul(slippageLimit);
      const guaranteedMinOutput = targetUsdAmount.mul(1 - slippageLimit);

      // Create conversion quote for slippage protection
      const quote = await this.createConversionQuote({
        fromCrypto: request.fromCrypto,
        toCrypto: 'USD',
        fromAmount: requiredCryptoAmount.toString(),
        toAmount: targetUsdAmount.toString(),
        rate: rate.toString(),
        slippageLimit,
        networkFee: fees.networkFee,
        conversionFee: fees.conversionFee,
        platformFee: fees.platformFee,
        totalFee: fees.totalFee
      });

      return {
        fromAmount: requiredCryptoAmount.toString(),
        toAmount: request.toUsd,
        rate: rate.toString(),
        fees,
        slippageProtection: {
          maxSlippage: slippageLimit * 100, // Convert to percentage
          guaranteedMinOutput: guaranteedMinOutput.toString()
        },
        quoteId: quote.quoteId,
        expiresAt: quote.expiresAt
      };

    } catch (error) {
      console.error('Calculate conversion error:', error);
      throw error;
    }
  }

  /**
   * Compare rates across multiple cryptocurrencies for optimal funding source selection
   */
  async compareRates(request: RateComparisonRequest): Promise<RateComparisonResponse> {
    try {
      const cryptoSymbols = request.cryptoSymbols || enhancedRatesService.getSupportedCurrencies();
      const rates = await enhancedRatesService.getCurrentRates(cryptoSymbols);

      const comparisons: CryptoRateComparison[] = [];

      for (const symbol of cryptoSymbols) {
        const rate = rates[symbol]?.usd;
        if (!rate || rate === '0') continue;

        const rateDecimal = new Decimal(rate);
        const targetUsdAmount = new Decimal(request.targetUsdAmount).div(100);
        
        // Calculate required crypto amount
        const requiredAmount = targetUsdAmount.div(rateDecimal);
        
        // Calculate all fees
        const fees = this.calculateFees(symbol, request.targetUsdAmount, rateDecimal);
        
        // Calculate total cost including fees
        const totalCost = request.targetUsdAmount + fees.totalFee;
        
        // Calculate cost efficiency (lower is better)
        const costEfficiency = fees.totalFee / request.targetUsdAmount;

        comparisons.push({
          symbol,
          requiredAmount: requiredAmount.toString(),
          currentRate: rate,
          totalCost,
          fees,
          costEfficiency
        });
      }

      // Sort by cost efficiency (best option first)
      comparisons.sort((a, b) => a.costEfficiency - b.costEfficiency);

      return {
        targetUsdAmount: request.targetUsdAmount,
        comparisons,
        bestOption: comparisons.length > 0 ? comparisons[0].symbol : ''
      };

    } catch (error) {
      console.error('Compare rates error:', error);
      throw error;
    }
  }

  /**
   * Calculate comprehensive fees including network, conversion, and platform fees
   */
  private calculateFees(currency: string, usdAmountCents: number, rate: Decimal): {
    networkFee: number;
    conversionFee: number;
    platformFee: number;
    totalFee: number;
  } {
    const feeStructure = this.FEE_STRUCTURES[currency];
    if (!feeStructure) {
      // Default fee structure for unknown currencies
      return {
        networkFee: 200, // $2.00
        conversionFee: Math.round(usdAmountCents * 0.005), // 0.5%
        platformFee: Math.round(usdAmountCents * 0.002), // 0.2%
        totalFee: 200 + Math.round(usdAmountCents * 0.007)
      };
    }

    // Calculate percentage-based fees
    const networkFee = Math.max(
      Math.round(usdAmountCents * feeStructure.networkFeePercentage),
      feeStructure.minimumNetworkFee
    );
    
    const conversionFee = Math.round(usdAmountCents * feeStructure.conversionFeePercentage);
    const platformFee = Math.round(usdAmountCents * feeStructure.platformFeePercentage);
    
    const totalFee = networkFee + conversionFee + platformFee;

    return {
      networkFee,
      conversionFee,
      platformFee,
      totalFee
    };
  }

  /**
   * Estimate gas fees for Ethereum-based transactions
   */
  async estimateGasFee(currency: string): Promise<GasEstimate> {
    try {
      // This would typically integrate with a gas estimation service
      // For now, we'll provide reasonable estimates based on currency
      
      if (currency === 'ETH') {
        return {
          currency: 'ETH',
          gasPrice: '20', // 20 gwei
          gasLimit: '21000', // Standard ETH transfer
          estimatedFeeUsd: 200 // $2.00 in cents
        };
      } else if (currency === 'USDT' || currency === 'USDC') {
        return {
          currency: 'ETH', // ERC-20 tokens use ETH for gas
          gasPrice: '25', // 25 gwei for token transfers
          gasLimit: '65000', // ERC-20 transfer gas limit
          estimatedFeeUsd: 300 // $3.00 in cents
        };
      } else {
        // Non-Ethereum currencies
        return {
          currency,
          gasPrice: '0',
          gasLimit: '0',
          estimatedFeeUsd: 100 // $1.00 default
        };
      }
    } catch (error) {
      console.error('Estimate gas fee error:', error);
      throw error;
    }
  }

  /**
   * Estimate Bitcoin fees using mempool.space API
   */
  async estimateBitcoinFee(): Promise<{ fastFee: number; standardFee: number; slowFee: number }> {
    try {
      const response = await fetch('https://mempool.space/api/v1/fees/recommended');
      
      if (!response.ok) {
        throw new Error(`Mempool.space API error: ${response.status}`);
      }

      const feeData = await response.json();
      
      return {
        fastFee: feeData.fastestFee || 20, // sat/vB
        standardFee: feeData.halfHourFee || 10,
        slowFee: feeData.hourFee || 5
      };
    } catch (error) {
      console.error('Estimate Bitcoin fee error:', error);
      // Return default values if API fails
      return {
        fastFee: 20,
        standardFee: 10,
        slowFee: 5
      };
    }
  }

  /**
   * Create slippage-protected conversion quote
   */
  private async createConversionQuote(quoteData: {
    fromCrypto: string;
    toCrypto: string;
    fromAmount: string;
    toAmount: string;
    rate: string;
    slippageLimit: number;
    networkFee: number;
    conversionFee: number;
    platformFee: number;
    totalFee: number;
  }): Promise<ConversionQuote> {
    try {
      const quoteId = uuidv4();
      const expiresAt = new Date(Date.now() + this.QUOTE_EXPIRY_MINUTES * 60 * 1000);

      const quote: ConversionQuote = {
        quoteId,
        fromCrypto: quoteData.fromCrypto,
        toCrypto: quoteData.toCrypto,
        fromAmount: quoteData.fromAmount,
        toAmount: quoteData.toAmount,
        rate: quoteData.rate,
        slippageLimit: quoteData.slippageLimit,
        networkFee: quoteData.networkFee,
        conversionFee: quoteData.conversionFee,
        platformFee: quoteData.platformFee,
        totalFee: quoteData.totalFee,
        expiresAt,
        status: 'active'
      };

      // Save quote to database
      const { error } = await this.supabase
        .from('conversion_quotes')
        .insert({
          quote_id: quoteId,
          from_crypto: quote.fromCrypto,
          to_crypto: quote.toCrypto,
          from_amount: parseFloat(quote.fromAmount),
          to_amount: parseFloat(quote.toAmount),
          rate: parseFloat(quote.rate),
          slippage_limit: quote.slippageLimit,
          network_fee: quote.networkFee,
          conversion_fee: quote.conversionFee,
          platform_fee: quote.platformFee,
          total_fee: quote.totalFee,
          expires_at: expiresAt.toISOString(),
          status: quote.status
        });

      if (error) {
        console.error('Failed to save conversion quote:', error);
        // Continue without database save - quote still valid in memory
      }

      // Cache quote in Redis with TTL
      await cacheService.set(
        `conversion_quote:${quoteId}`,
        JSON.stringify(quote),
        this.QUOTE_EXPIRY_MINUTES * 60 // TTL in seconds
      );

      return quote;

    } catch (error) {
      console.error('Create conversion quote error:', error);
      throw error;
    }
  }

  /**
   * Get active conversion quote by ID
   */
  async getConversionQuote(quoteId: string): Promise<ConversionQuote | null> {
    try {
      // Check Redis cache first
      const cachedQuote = await cacheService.get(`conversion_quote:${quoteId}`);
      if (cachedQuote) {
        const quote = JSON.parse(cachedQuote) as ConversionQuote;
        // Check if quote is still valid
        if (new Date(quote.expiresAt) > new Date() && quote.status === 'active') {
          return quote;
        }
      }

      // Fallback to database
      const { data, error } = await this.supabase
        .from('conversion_quotes')
        .select('*')
        .eq('quote_id', quoteId)
        .eq('status', 'active')
        .single();

      if (error || !data) {
        return null;
      }

      const quote: ConversionQuote = {
        quoteId: data.quote_id,
        fromCrypto: data.from_crypto,
        toCrypto: data.to_crypto,
        fromAmount: data.from_amount.toString(),
        toAmount: data.to_amount.toString(),
        rate: data.rate.toString(),
        slippageLimit: data.slippage_limit,
        networkFee: data.network_fee,
        conversionFee: data.conversion_fee,
        platformFee: data.platform_fee,
        totalFee: data.total_fee,
        expiresAt: new Date(data.expires_at),
        status: data.status
      };

      // Cache in Redis for remaining TTL
      const remainingTTL = Math.floor((quote.expiresAt.getTime() - Date.now()) / 1000);
      if (remainingTTL > 0) {
        await cacheService.set(
          `conversion_quote:${quoteId}`,
          JSON.stringify(quote),
          remainingTTL
        );
      }

      return quote;

    } catch (error) {
      console.error('Get conversion quote error:', error);
      return null;
    }
  }

  /**
   * Use (consume) a conversion quote
   */
  async useConversionQuote(quoteId: string): Promise<boolean> {
    try {
      const { error } = await this.supabase
        .from('conversion_quotes')
        .update({ 
          status: 'used',
          updated_at: new Date().toISOString()
        })
        .eq('quote_id', quoteId)
        .eq('status', 'active');

      if (error) {
        console.error('Failed to use conversion quote:', error);
        return false;
      }

      // Remove from Redis cache
      await cacheService.del(`conversion_quote:${quoteId}`);

      return true;

    } catch (error) {
      console.error('Use conversion quote error:', error);
      return false;
    }
  }

  /**
   * Cancel an active conversion quote
   */
  async cancelConversionQuote(quoteId: string): Promise<boolean> {
    try {
      const { error } = await this.supabase
        .from('conversion_quotes')
        .update({ 
          status: 'expired',
          updated_at: new Date().toISOString()
        })
        .eq('quote_id', quoteId)
        .eq('status', 'active');

      if (error) {
        console.error('Failed to cancel conversion quote:', error);
        return false;
      }

      // Remove from Redis cache
      await cacheService.del(`conversion_quote:${quoteId}`);

      return true;

    } catch (error) {
      console.error('Cancel conversion quote error:', error);
      return false;
    }
  }

  /**
   * Clean up expired quotes (called by scheduled job)
   */
  async cleanupExpiredQuotes(): Promise<void> {
    try {
      await this.supabase.rpc('expire_old_quotes');
    } catch (error) {
      console.error('Cleanup expired quotes error:', error);
    }
  }

  /**
   * Get supported cryptocurrencies for conversion
   */
  getSupportedCurrencies(): string[] {
    return Object.keys(this.FEE_STRUCTURES);
  }

  /**
   * Validate slippage limit
   */
  validateSlippageLimit(slippageLimit: number): boolean {
    return slippageLimit > 0 && slippageLimit <= 0.05; // Max 5% slippage
  }

  /**
   * Get fee structure for debugging
   */
  getFeeStructure(currency: string): FeeStructure | null {
    return this.FEE_STRUCTURES[currency] || null;
  }
}

export const conversionService = new ConversionService();